export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Decision = "ALLOW" | "REVIEW_REQUIRED" | "BLOCK";
export type EvaluatedBy = "rules" | "llm" | "both";

export interface EvaluationResult {
  command: string;
  risk: RiskLevel;
  reasons: string[];
  explanation: string;
  confidence: number;
  evaluatedBy: EvaluatedBy;
  decision: Decision;
  allowed: boolean;
  timestamp: string;
}

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? "http://localhost:8787";

export async function evaluateCommand(command: string): Promise<EvaluationResult> {
  const response = await fetch(`${WORKER_URL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });

  // Parse regardless of status — 403=BLOCK, 202=REVIEW, 200=ALLOW
  const data = await response.json().catch(() => ({
    error: "Failed to parse response"
  }));
  return data as EvaluationResult;
}