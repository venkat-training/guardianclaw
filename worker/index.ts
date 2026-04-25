import { evaluateRules } from "./rules";
import { evaluateWithLLM } from "./evaluator";
import { decide } from "./decision";
import type { RiskLevel } from "./rules";

export interface Env {
  NVIDIA_API_KEY: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: CORS_HEADERS }
      );
    }

    let command: string;
    try {
      const body = await request.json() as { command?: string };
      command = (body.command ?? "").trim();
      if (!command) throw new Error("Empty");
      if (command.length > 1000) throw new Error("Command too long");
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request: provide a non-empty command under 1000 chars" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Layer 1: instant rule-based check
    const ruleResult = evaluateRules(command);
    let finalRisk: RiskLevel = ruleResult.risk;
    let finalReasons = [...ruleResult.reasons];
    let explanation = "";
    let confidence = 99;
    let evaluatedBy: "rules" | "llm" | "both" = "rules";

    // Layer 2: LLM for ambiguous commands
    if (ruleResult.needsLLMReview && env.NVIDIA_API_KEY) {
      try {
        const llmResult = await evaluateWithLLM(command, env.NVIDIA_API_KEY);

        const riskOrder: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        const llmHigher =
          riskOrder.indexOf(llmResult.risk) > riskOrder.indexOf(finalRisk);

        if (llmHigher) finalRisk = llmResult.risk;

        finalReasons = [...new Set([...finalReasons, ...llmResult.reasons])];
        explanation = llmResult.explanation;
        confidence = llmResult.confidence;
        evaluatedBy = ruleResult.reasons.length > 0 ? "both" : "llm";
      } catch (err) {
        console.error("LLM evaluation failed:", err);
        evaluatedBy = "rules";
        explanation = "AI evaluation unavailable — rule-based analysis applied.";
        confidence = 80;
      }
    }

    if (!explanation) {
      explanation =
        finalRisk === "LOW"
          ? "This command appears safe to execute."
          : finalRisk === "MEDIUM"
          ? "This command requires caution — review before proceeding."
          : finalRisk === "HIGH"
          ? "This command poses a significant security risk and should not be executed."
          : "This command is dangerous and has been blocked to protect your system.";
    }

    const guardDecision = decide(finalRisk);

    const responseBody = {
      command,
      risk: finalRisk,
      reasons: finalReasons,
      explanation,
      confidence,
      evaluatedBy,
      ...guardDecision,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(responseBody), {
      status: guardDecision.statusCode,
      headers: CORS_HEADERS,
    });
  },
};
