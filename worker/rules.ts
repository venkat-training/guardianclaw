export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RuleResult {
  risk: RiskLevel;
  reasons: string[];
  needsLLMReview: boolean;
}

const CRITICAL_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /curl.+\|\s*(ba)?sh/i,        reason: "Piping remote script directly into shell" },
  { pattern: /wget.+\|\s*(ba)?sh/i,         reason: "Piping remote download into shell execution" },
  { pattern: /rm\s+-rf\s+[\/~]/,            reason: "Recursive deletion of root or home directory" },
  { pattern: /private[_-]?key/i,            reason: "Access to private cryptographic key" },
  { pattern: /\.wallet\//,                  reason: "Access to wallet directory" },
  { pattern: /dd\s+if=.+of=\/dev/,          reason: "Direct disk write — potential data destruction" },
  { pattern: /chmod\s+777\s+\//,            reason: "Making root filesystem world-writable" },
  { pattern: /mkfs\./,                      reason: "Filesystem format command detected" },
  { pattern: /:(){ :|:& };:/,              reason: "Fork bomb detected" },
  { pattern: /\/etc\/shadow/,              reason: "Access to system shadow password file" },
];

const HIGH_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /npm install\s+-g/i,           reason: "Installing unverified global package" },
  { pattern: /pip install/i,                reason: "Installing unverified Python package" },
  { pattern: /curl\s+http(?!s)/i,           reason: "Unencrypted HTTP download" },
  { pattern: /eval\s*\(/,                   reason: "Dynamic code evaluation (eval)" },
  { pattern: /\/etc\/passwd/,              reason: "Access to system password file" },
  { pattern: /sudo\s+/,                     reason: "Privilege escalation via sudo" },
  { pattern: /base64\s+(-d|--decode)/i,     reason: "Decoding potentially obfuscated payload" },
  { pattern: /nc\s+-[el]/i,                reason: "Netcat listener — potential reverse shell" },
  { pattern: /python.*-c.*import/i,         reason: "Inline Python execution with imports" },
  { pattern: /\/proc\/[0-9]+\/mem/,        reason: "Direct process memory access" },
];

const MEDIUM_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /npm install(?!\s+-g)/i,       reason: "Installing unverified local package" },
  { pattern: /git clone/i,                  reason: "Cloning external repository" },
  { pattern: /curl\s+https/i,              reason: "Downloading from external URL" },
  { pattern: /chmod\s+[0-7]*x/i,           reason: "Making file executable" },
  { pattern: /crontab/i,                    reason: "Modifying scheduled tasks" },
  { pattern: /systemctl\s+enable/i,         reason: "Enabling system service" },
];

export function evaluateRules(command: string): RuleResult {
  const reasons: string[] = [];
  let risk: RiskLevel = "LOW";

  for (const { pattern, reason } of CRITICAL_PATTERNS) {
    if (pattern.test(command)) {
      risk = "CRITICAL";
      reasons.push(reason);
    }
  }

  if (risk !== "CRITICAL") {
    for (const { pattern, reason } of HIGH_PATTERNS) {
      if (pattern.test(command)) {
        risk = "HIGH";
        reasons.push(reason);
      }
    }
  }

  if (risk === "LOW") {
    for (const { pattern, reason } of MEDIUM_PATTERNS) {
      if (pattern.test(command)) {
        risk = "MEDIUM";
        reasons.push(reason);
      }
    }
  }

  const needsLLMReview =
    risk === "LOW" ||
    risk === "MEDIUM" ||
    (risk === "HIGH" && reasons.length < 2);

  return { risk, reasons, needsLLMReview };
}
