var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/rules.ts
var CRITICAL_PATTERNS = [
  { pattern: /curl.+\|\s*(ba)?sh/i, reason: "Piping remote script directly into shell" },
  { pattern: /wget.+\|\s*(ba)?sh/i, reason: "Piping remote download into shell execution" },
  { pattern: /rm\s+-rf\s+[\/~]/, reason: "Recursive deletion of root or home directory" },
  { pattern: /private[_-]?key/i, reason: "Access to private cryptographic key" },
  { pattern: /\.wallet\//, reason: "Access to wallet directory" },
  { pattern: /dd\s+if=.+of=\/dev/, reason: "Direct disk write \u2014 potential data destruction" },
  { pattern: /chmod\s+777\s+\//, reason: "Making root filesystem world-writable" },
  { pattern: /mkfs\./, reason: "Filesystem format command detected" },
  { pattern: /:(){ :|:& };:/, reason: "Fork bomb detected" },
  { pattern: /\/etc\/shadow/, reason: "Access to system shadow password file" }
];
var HIGH_PATTERNS = [
  { pattern: /npm install\s+-g/i, reason: "Installing unverified global package" },
  { pattern: /pip install/i, reason: "Installing unverified Python package" },
  { pattern: /curl\s+http(?!s)/i, reason: "Unencrypted HTTP download" },
  { pattern: /eval\s*\(/, reason: "Dynamic code evaluation (eval)" },
  { pattern: /\/etc\/passwd/, reason: "Access to system password file" },
  { pattern: /sudo\s+/, reason: "Privilege escalation via sudo" },
  { pattern: /base64\s+(-d|--decode)/i, reason: "Decoding potentially obfuscated payload" },
  { pattern: /nc\s+-[el]/i, reason: "Netcat listener \u2014 potential reverse shell" },
  { pattern: /python.*-c.*import/i, reason: "Inline Python execution with imports" },
  { pattern: /\/proc\/[0-9]+\/mem/, reason: "Direct process memory access" }
];
var MEDIUM_PATTERNS = [
  { pattern: /npm install(?!\s+-g)/i, reason: "Installing unverified local package" },
  { pattern: /git clone/i, reason: "Cloning external repository" },
  { pattern: /curl\s+https/i, reason: "Downloading from external URL" },
  { pattern: /chmod\s+[0-7]*x/i, reason: "Making file executable" },
  { pattern: /crontab/i, reason: "Modifying scheduled tasks" },
  { pattern: /systemctl\s+enable/i, reason: "Enabling system service" }
];
function evaluateRules(command) {
  const reasons = [];
  let risk = "LOW";
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
  const needsLLMReview = risk === "LOW" || risk === "MEDIUM" || risk === "HIGH" && reasons.length < 2;
  return { risk, reasons, needsLLMReview };
}
__name(evaluateRules, "evaluateRules");

// worker/evaluator.ts
async function evaluateWithLLM(command, apiKey) {
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "nvidia/llama-3.1-nemotron-70b-instruct",
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are GuardianClaw, a security evaluation engine for AI agent systems.
Analyze shell and system commands for safety risk. Respond ONLY with valid JSON \u2014 no markdown, no explanation outside the JSON.
Risk levels:
- LOW: safe standard operations (ls, echo, cat non-sensitive files, git status)
- MEDIUM: caution needed, not immediately dangerous (git clone, npm install local, curl https)
- HIGH: potentially harmful, needs review (sudo, eval, pip install, chmod +x)
- CRITICAL: must block immediately (curl | sh, rm -rf /, private key access, fork bombs)
Be precise and security-focused.`
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
}`
        }
      ]
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NVIDIA API error ${response.status}: ${errText}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "{}";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}
__name(evaluateWithLLM, "evaluateWithLLM");

// worker/decision.ts
function decide(risk) {
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
__name(decide, "decide");

// worker/index.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
var worker_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: CORS_HEADERS }
      );
    }
    let command;
    try {
      const body = await request.json();
      command = (body.command ?? "").trim();
      if (!command) throw new Error("Empty");
      if (command.length > 1e3) throw new Error("Command too long");
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request: provide a non-empty command under 1000 chars" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const ruleResult = evaluateRules(command);
    let finalRisk = ruleResult.risk;
    let finalReasons = [...ruleResult.reasons];
    let explanation = "";
    let confidence = 99;
    let evaluatedBy = "rules";
    if (ruleResult.needsLLMReview && env.NVIDIA_API_KEY) {
      try {
        const llmResult = await evaluateWithLLM(command, env.NVIDIA_API_KEY);
        const riskOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        const llmHigher = riskOrder.indexOf(llmResult.risk) > riskOrder.indexOf(finalRisk);
        if (llmHigher) finalRisk = llmResult.risk;
        finalReasons = [.../* @__PURE__ */ new Set([...finalReasons, ...llmResult.reasons])];
        explanation = llmResult.explanation;
        confidence = llmResult.confidence;
        evaluatedBy = ruleResult.reasons.length > 0 ? "both" : "llm";
      } catch (err) {
        console.error("LLM evaluation failed:", err);
        evaluatedBy = "rules";
        explanation = "AI evaluation unavailable \u2014 rule-based analysis applied.";
        confidence = 80;
      }
    }
    if (!explanation) {
      explanation = finalRisk === "LOW" ? "This command appears safe to execute." : finalRisk === "MEDIUM" ? "This command requires caution \u2014 review before proceeding." : finalRisk === "HIGH" ? "This command poses a significant security risk and should not be executed." : "This command is dangerous and has been blocked to protect your system.";
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
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return new Response(JSON.stringify(responseBody), {
      status: guardDecision.statusCode,
      headers: CORS_HEADERS
    });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-n8YiU3/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-n8YiU3/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
