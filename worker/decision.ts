import { RiskLevel } from "./rules";

export type Decision = "ALLOW" | "REVIEW_REQUIRED" | "BLOCK";

export interface GuardDecision {
  decision: Decision;
  allowed: boolean;
  statusCode: number;
}

export function decide(risk: RiskLevel): GuardDecision {
  switch (risk) {
    case "CRITICAL":
      return { decision: "BLOCK", allowed: false, statusCode: 403 };
    case "HIGH":
      return { decision: "BLOCK", allowed: false, statusCode: 403 };
    case "MEDIUM":
      return { decision: "REVIEW_REQUIRED", allowed: false, statusCode: 202 };
    default:
      return { decision: "ALLOW", allowed: true, statusCode: 200 };
  }
}
