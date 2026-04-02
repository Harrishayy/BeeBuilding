[![Version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/Harrishayy/BeeBuilding)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-brightgreen)](https://marketplace.visualstudio.com)
[![Status](https://img.shields.io/badge/status-Early%20Access-orange)](https://github.com/Harrishayy/BeeBuilding)

# AgentFlow

**Real-time multi-agent software factory for VS Code / Cursor.** Watch your AI dev team collaborate, decide, code, test, and ship — all in one unified mission control.

AgentFlow orchestrates multiple AI agents (planner, coder, tester, reviewer) working simultaneously on your codebase. Your entire team observes progress in real time via shared live sessions, ensuring transparency, collaboration, and human oversight throughout the AI-driven development pipeline.

## The Problem

Building software with AI agents is powerful but opaque. Teams can't see what agents are doing, can't intervene mid-task, and lose the audit trail of decisions. AgentFlow fixes this: **transparent, collaborative, human-in-the-loop AI development.**

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        AgentFlow Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Issue/Task Received                                             │
│       ↓                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   PLANNER   │──→ │    CODER    │──→ │   TESTER    │         │
│  │   AGENT     │    │   AGENT     │    │   AGENT     │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│       ↓                  ↓                  ↓                   │
│   Break down        Write code          Run tests             │
│   requirements      & implement         Verify quality        │
│                                                                   │
│  ┌─────────────┐    ┌──────────────────────────────┐            │
│  │  REVIEWER   │←── │  HUMAN APPROVAL GATE         │            │
│  │  AGENT      │    │  (Team can approve/redirect) │            │
│  └─────────────┘    └──────────────────────────────┘            │
│       ↓                                                          │
│   Review code        ┌──────────────────────────┐               │
│   & test coverage    │ ✨ MISSION CONTROL VIEW  │               │
│                      │                          │               │
│       ↓              │ • Live pipeline state    │               │
│  ┌─────────────┐     │ • Agent activity log     │               │
│  │   MERGE     │     │ • Change timeline        │               │
│  │             │     │ • Diff viewer            │               │
│  └─────────────┘     │ • Team chat log          │               │
│       ↓              │ • Shared session         │               │
│   Ready for          └──────────────────────────┘               │
│   production                                                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              Team Sync & Shared Visibility (WebSocket)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Dev A          Dev B          Dev C          DevOps            │
│   ├─ sees live   ├─ sees live   ├─ sees live   ├─ sees live     │
│   ├─ can review  ├─ can review  ├─ can review  ├─ can monitor   │
│   └─ can approve └─ can reject  └─ can redirect└─ can abort     │
│                                                                   │
│          ← WebSocket broadcasts agent state ↔ Team members      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** Each agent works in an isolated Git worktree. Code changes are staged, reviewed, and approved before merge — no surprises.

---

## Core Features

### 🎬 Live Agent Pipeline View
See what every agent is doing right now. The sidebar panel shows:
- **Active agents** — which ones are currently working
- **Current stage** — what phase (plan/code/test/review)
- **Current task** — human-readable summary of what they're doing
- **Status indicators** — success, in-progress, blocked, waiting for approval

### 👥 Shared Team Visibility  
Everyone on your team sees the same thing, in real time:
- Join a shared session code
- Real-time agent activity sync via WebSocket
- No polling — truly live updates
- Team chat log of agent reasoning and inter-agent communication

### ⏱️ Change Timeline
A scrollable history of everything:
- Every file touched and what changed
- Every decision made (with agent reasoning)
- Every test run and its result
- Timestamps and agent attribution
- Easy to scroll back and understand context

### 🔍 Diff Viewer
Review exactly what changed before merge:
- Side-by-side diffs for each agent commit
- Highlight changed/added/removed lines
- One-click approve or request changes
- Integrates with your editor's native diff viewer

### 🚪 Human-in-the-Loop Gates
Approval checkpoints where humans control the flow:
- Approve a completed task to move to next stage
- Reject and have the agent refine
- Redirect mid-task ("Actually, add error handling here")
- Set approval requirements per stage (all tests must pass, etc.)
- Timeout rules for auto-escalation

### 💬 Agent Chat Log
Read-only feed showing agent reasoning:
- What each agent "thinks" about the task
- Inter-agent messages ("Coder: I need clarification on requirements")
- Decisions and trade-offs
- Tool calls and their outputs
- Helps teams understand why agents made certain choices

---

## Installation

### From VSIX (Local Development)
```bash
# Clone the repo
git clone https://github.com/Harrishayy/BeeBuilding.git
cd BeeBuilding

# Install dependencies
npm install

# Build the extension
npm run build

# Package as VSIX
npm run package

# In VS Code: Extensions → Install from VSIX → select the .vsix file
```

### From VS Code Marketplace (Coming Soon)
Search for "AgentFlow" in the Extensions marketplace and click Install.

### From Cursor
Same process as VS Code. Cursor supports the same extension API.

---

## Quick Start (5 Minutes)

### 1. Open AgentFlow
After installation, click the **AgentFlow** icon in the activity bar (left sidebar).

### 2. Create or Join a Session
```
Session Type: Create New
Project: My React App
Agents: Planner, Coder, Tester, Reviewer
Team Size: 4 developers
```

Alternatively, join an existing session:
```
Session Code: AGENTFLOW-2026-ABC123
```

### 3. Submit Your First Task
```
Title: Implement user authentication
Description: Add JWT-based login/logout with protected routes
Priority: High
Estimated Complexity: Medium
```

### 4. Watch the Pipeline
The agents automatically:
1. **Planner** breaks down requirements → creates task breakdown
2. **Coder** implements features in isolated worktree
3. **Tester** runs test suite, checks coverage
4. **Reviewer** reviews code, tests approval gates
5. **Orchestrator** coordinates and handles blockers

### 5. Approve & Merge
Review the diff in the panel. Click **✅ Approve & Merge** when ready.

Your code is merged, tests are green, and everyone saw exactly how it happened.

---

## Configuration

### AGENTS.md (Project-Level)
Create `AGENTS.md` in your repo root to customize agent behavior:

```markdown
# AgentFlow Configuration

## Agents

### Planner
- role: requirements_analysis
- model: claude-opus
- capabilities: break_down_tasks, create_specs
- approval_required: false

### Coder  
- role: implementation
- model: claude-sonnet
- capabilities: write_code, refactor, document
- approval_required_after_lines_changed: 100

### Tester
- role: quality_assurance
- model: claude-opus
- capabilities: write_tests, check_coverage, performance_profile
- min_coverage: 80%
- approval_required: true

### Reviewer
- role: code_review
- model: claude-opus
- capabilities: audit_code, security_scan, style_check
- approval_required: true

## Approval Gates

- after_planning: optional  # Planner → Coder
- after_coding: optional    # Coder → Tester
- after_testing: required   # Tester → Reviewer
- after_review: required    # Reviewer → Merge

## Team Settings

- max_concurrent_agents: 4
- timeout_per_agent_minutes: 30
- auto_escalate_blocked_after_minutes: 15
- git_merge_strategy: squash  # squash | rebase | merge
```

### VS Code Settings (User/Workspace)
```json
{
  "agentflow.teamMode": true,
  "agentflow.websocketUrl": "wss://api.agentflow.dev/ws",
  "agentflow.sessionTimeout": 3600,
  "agentflow.autoApproveWhenAllTestsPass": false,
  "agentflow.notifyTeamOn": ["approval_needed", "task_complete", "blocker"],
  "agentflow.gitWorktreeParent": ".agentflow/worktrees",
  "agentflow.diffViewer": "native",
  "agentflow.logLevel": "info"
}
```

### Environment Variables
```bash
# .env or .env.local
AGENTFLOW_API_KEY=your-api-key-here
AGENTFLOW_TEAM_ID=team-12345
AGENTFLOW_WORKSPACE_ID=workspace-67890
AGENTFLOW_CLAUDE_API_KEY=sk-ant-...
```

---

## Architecture

### Component Overview

**Extension Host** (runs in VS Code)
- UI webview for the mission control panel
- File watchers for local changes
- Git integration (worktree mgmt, diff generation)
- WebSocket client for team sync

**Agent Orchestrator** (cloud service)
- Coordinates multi-agent workflow
- Manages task queue and state machine
- Runs approval gates and timeout logic
- Publishes events to team WebSocket

**Agent Runtime** (Claude API / OpenHands)
- Planner, Coder, Tester, Reviewer agents
- Tool-use for file operations, git, test execution
- Streaming outputs for live chat log

**Git Isolation** (Worktree per agent)
```
project/
├── .git
├── src/
├── tests/
└── .agentflow/
    ├── worktrees/
    │   ├── planner/     # Agent's isolated workspace
    │   ├── coder/       # Agent's isolated workspace
    │   ├── tester/      # Agent's isolated workspace
    │   └── reviewer/    # Agent's isolated workspace
    └── sessions/
        └── AGENTFLOW-2026-ABC123/
            ├── state.json
            ├── timeline.jsonl
            └── diffs/
```

Each agent works in its own worktree, preventing conflicts and allowing rollback.

### Agent Coordination Flow

```
Task Submitted
    ↓
Orchestrator assigns to Planner
    ↓
Planner creates spec, signals completion
    ↓
Orchestrator → Approval Gate: "Ready for coding?"
    ↓
[If approved] → Orchestrator assigns to Coder
    ↓
Coder implements, pushes to worktree
    ↓
[If rejected] → Orchestrator sends feedback to Coder
    ↓
[...similar flow for Tester, Reviewer...]
    ↓
Final approval → Merge from worktree to main branch
    ↓
Team notified, session activity logged
```

### Real-Time Team Sync (WebSocket)

```
Client A connects
    ↓
Subscribes to session AGENTFLOW-2026-ABC123
    ↓
Receives: { type: "agent_update", agent: "coder", status: "in_progress", ... }
    ↓
Client B connects (same session)
    ↓
Both receive all subsequent events in real time
    ↓
Client A approves a task
    ↓
Event: { type: "gate_approved", by: "client_a", ... }
    ↓
Client B sees approval immediately (no refresh needed)
```

---

## Agent Roles

### 🧠 Planner Agent
**Purpose:** Break down vague requirements into concrete, actionable specs.

**Inputs:**
- Task title and description
- Project context (README, existing issues)
- Team notes or clarifications

**Outputs:**
- Detailed implementation spec
- List of files to create/modify
- Success criteria and test strategy
- Estimated effort and risk flags

**Example reasoning:**
> "Task: Add OAuth. Breaking down: 1) Setup auth provider, 2) Implement login flow, 3) Protect routes, 4) Add logout, 5) Store tokens securely. Files: auth/providers.ts, auth/middleware.ts, pages/login.tsx, etc. Risk: Token refresh logic is tricky."

### 💻 Coder Agent
**Purpose:** Implement the plan with production-ready code.

**Inputs:**
- Planner's spec
- Existing codebase (can browse files, understand patterns)
- Linting and style rules

**Outputs:**
- New/modified code files
- Updated imports and dependencies
- Inline documentation
- Git commit with meaningful message

**Constraints:**
- Must follow repo's code style
- Cannot merge directly to main (Reviewer must approve)
- Works in isolated worktree

### 🧪 Tester Agent
**Purpose:** Verify code quality, coverage, and correctness.

**Inputs:**
- Coder's implementation
- Test framework and existing tests
- Coverage thresholds

**Outputs:**
- New unit/integration tests
- Coverage report
- Performance profile (if applicable)
- Test pass/fail report with details

**Approval gate:** Team must approve before Reviewer stage.

### 📋 Reviewer Agent
**Purpose:** Final quality gate—security, performance, maintainability.

**Inputs:**
- Coder's code
- Tester's test report
- Project guidelines (AGENTS.md)

**Outputs:**
- Code review comments (blocking/non-blocking)
- Security audit findings
- Refactoring suggestions
- Final approval or rejection with rationale

**Approval gate:** Usually required before merge (configurable).

### 🎯 Orchestrator (Meta-Agent)
**Purpose:** Coordinate the pipeline, handle blockers, escalate to humans.

**Capabilities:**
- Route tasks between agents
- Enforce approval gates
- Detect deadlocks (e.g., Coder waiting on Planner clarification)
- Escalate to human team if stuck for too long
- Manage retries and rollbacks

---

## Team Collaboration

### Joining a Session

1. Get the **session code** from whoever created it (e.g., `AGENTFLOW-2026-ABC123`)
2. In AgentFlow panel: **Join Existing Session**
3. Enter session code
4. See live agent activity immediately

### Observing Progress

The **Mission Control** sidebar shows:
- **Pipeline Timeline** — where each agent is in the process
- **Current Tasks** — what's being worked on right now
- **Chat Log** — agent reasoning and decisions
- **Team Members** — who's watching, who approved last

### Approval Workflow

When an agent completes a stage, the approval gate appears:

```
┌─────────────────────────────────────────┐
│ 🚪 Approval Needed                      │
├─────────────────────────────────────────┤
│ Task: Implement user auth               │
│ Stage: Coding → Testing                 │
│ Agent: Coder                            │
│ Changes: 3 files, 124 lines added       │
│                                         │
│ [View Diff]  [Request Changes]          │
│                     [✅ Approve]        │
└─────────────────────────────────────────┘
```

Team members can:
- **Approve** — agent proceeds to next stage
- **Request Changes** — send feedback, agent refines
- **Redirect** — update task mid-flight ("Also add error logging")
- **Pause** — freeze the pipeline for investigation
- **Abort** — restart this task from scratch

### Notifications & Chat

Every team member sees:
- Agent milestones (✅ planning complete, ✅ tests passing, etc.)
- Approval requests (only one person needs to approve, all see)
- Blockers and escalations
- Chat feed of agent messages (read-only)

Notifications can be configured per-event in VS Code settings.

---

## What's on the Roadmap

### v0.2 (Next Month)
- [ ] Web-based dashboard (for non-IDE viewers)
- [ ] Agent "personality" customization (verbose vs. concise reasoning)
- [ ] Integration with Slack for team notifications
- [ ] Per-agent performance metrics and SLA tracking

### v0.3 (2 Months)
- [ ] Multi-repo orchestration (agents spanning multiple codebases)
- [ ] Custom agent roles (domain-specific agents: security, performance, etc.)
- [ ] Rollback & replay: restore to any point in the timeline
- [ ] Integration with GitHub Actions for CI/CD gate checks

### v1.0 (Q3 2026)
- [ ] Marketplace for custom agents
- [ ] AI model fine-tuning on your codebase
- [ ] Predictive blocking (agents flag likely issues before they happen)
- [ ] Full audit logging and compliance reporting
- [ ] Self-hosted on-prem option

**What we're **not** doing:**
- Replacing human developers — this enhances human teams
- Auto-merging without approval — human oversight always required
- Magical code that's always perfect — agents are smart helpers, not oracles

---

## Contributing

We're building this in the open and welcome contributions!

### Setup

```bash
git clone https://github.com/Harrishayy/BeeBuilding.git
cd BeeBuilding
npm install
npm run dev  # watches src/ and rebuilds on changes
```

### Project Structure

```
BeeBuilding/
├── src/
│   ├── extension.ts          # VS Code extension entry point
│   ├── webview/              # React UI for mission control panel
│   ├── agents/               # Agent orchestration logic
│   ├── git/                  # Git worktree management
│   ├── websocket/            # Team sync client
│   └── utils/                # Shared utilities
├── AGENTS.md                 # Configuration schema
├── package.json
└── tsconfig.json
```

### Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and test locally: `npm run dev`
3. Open a PR with clear description of what and why
4. Include screenshots if UI changes
5. Ensure tests pass: `npm test`

### Code Style

- TypeScript (strict mode)
- Prettier for formatting
- ESLint config in `.eslintrc.json`
- Run `npm run lint -- --fix` before committing

### Testing

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

We aim for >80% coverage on core agent orchestration logic.

---

## Troubleshooting

### Session Won't Connect

**Problem:** "WebSocket connection failed"

**Solution:** 
- Check your internet connection
- Verify `agentflow.websocketUrl` in VS Code settings
- Ensure your firewall isn't blocking WebSocket (port 443)
- Restart the extension: Command Palette → "AgentFlow: Restart"

### Agent Stuck in Pipeline

**Problem:** Coder agent shows "in_progress" for 30+ minutes

**Solution:**
- Check the chat log for error messages
- Click "Pause Pipeline" to freeze and investigate
- Look at agent's worktree: `.agentflow/worktrees/coder/`
- If stuck, use "Abort & Restart" to reset

### Merge Conflicts

**Problem:** Agent can't merge worktree back to main

**Solution:**
- AgentFlow automatically detects conflicts
- Surfaces in UI with side-by-side diff
- Orchestrator escalates to team
- Manual resolution via "Resolve Conflict" dialog
- Coder agent can be asked to refactor around conflict

### Privacy / Sensitive Data

**Problem:** Worried about sending code to Claude API

**Solution:**
- AgentFlow only sends code to Claude; we don't store it
- Use a self-hosted Anthropic proxy if preferred
- Environment variables are never logged
- Check our privacy policy at [agentflow.dev/privacy](https://agentflow.dev/privacy)

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Support & Community

- **Documentation:** [docs.agentflow.dev](https://docs.agentflow.dev)
- **Issues:** [GitHub Issues](https://github.com/Harrishayy/BeeBuilding/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Harrishayy/BeeBuilding/discussions)
- **Twitter:** [@AgentFlowDev](https://twitter.com/agentflowdev)
- **Email:** support@agentflow.dev

---

## Acknowledgments

AgentFlow is built with:
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Claude API](https://anthropic.com) for agent intelligence
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) (future integration)
- [ws](https://github.com/websockets/ws) for real-time team sync

Special thanks to the early adopters helping shape the vision.

---

**Made with ❤️ by the BeeBuilding team. Happy building! 🐝**

Last updated: April 2, 2026
