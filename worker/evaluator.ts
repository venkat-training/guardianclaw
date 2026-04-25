export interface LLMEvaluation {
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasons: string[];
  explanation: string;
  confidence: number;
}

export async function evaluateWithLLM(
  command: string,
  apiKey: string
): Promise<LLMEvaluation> {
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "nvidia/llama-3.1-nemotron-70b-instruct",
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are GuardianClaw, a security evaluation engine for AI agent systems.
Analyze shell and system commands for safety risk. Respond ONLY with valid JSON — no markdown, no explanation outside the JSON.
Risk levels:
- LOW: safe standard operations (ls, echo, cat non-sensitive files, git status)
- MEDIUM: caution needed, not immediately dangerous (git clone, npm install local, curl https)
- HIGH: potentially harmful, needs review (sudo, eval, pip install, chmod +x)
- CRITICAL: must block immediately (curl | sh, rm -rf /, private key access, fork bombs)
Be precise and security-focused.`,
        },
        {
          role: "user",
          content: `Evaluate this command for safety risk: "${command}"

Respond with ONLY this exact JSON structure:
{
  "risk": "LOW|MEDIUM|HIGH|CRITICAL",
  "reasons": ["specific reason 1", "specific reason 2"],
  "explanation": "One plain English sentence explaining the risk to a non-technical user.",
  "confidence": 85
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NVIDIA API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices?.[0]?.message?.content ?? "{}";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as LLMEvaluation;
}
