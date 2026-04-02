# AgentFlow — Full Preparation Guide & Cursor Plan Mode Prompt

## Table of Contents

1. [The Cursor Plan Mode Prompt (Copy-Paste Ready)](#1-the-cursor-plan-mode-prompt)
2. [Architecture Overview & Preparations](#2-architecture-overview)
3. [UI Preparation — Pixel Art Mission Control](#3-ui-preparation)
4. [Backend Preparation — Modified Ruflo](#4-backend-preparation)
5. [VS Code Extension Shell](#5-vscode-extension-shell)
6. [File & Folder Scaffold](#6-file--folder-scaffold)
7. [Resource Links & References](#7-resource-links--references)

---

## 1. The Cursor Plan Mode Prompt

> **How to use:** Open Cursor → Agent Input → Press `Shift+Tab` to toggle Plan Mode → Paste the prompt below. Answer the clarifying questions. Review the generated plan. Then execute.

```markdown
# SYSTEM — AgentFlow Software Factory (Single-User MVP)

You are an expert systems architect building **AgentFlow**, a VS Code / Cursor extension that orchestrates multiple AI agents (Planner → Coder → Tester → Reviewer → Merge) in a visible, transparent pipeline. The user watches agents work in real time through a pixel-art "mission control" UI rendered in a webview sidebar panel.

## GOAL
Build the single-user MVP (v0.1). No WebSocket team sync yet. One user, one machine, one pipeline, full visibility.

## CRITICAL CONSTRAINTS
- **Extension target:** VS Code / Cursor (both use the same Extension API — `vscode.window.createWebviewPanel` and sidebar `WebviewViewProvider`)
- **Language:** TypeScript (strict mode) for the extension host; React + Tailwind for the webview UI
- **Agent orchestration backend:** Modified Ruflo (`@claude-flow/cli`, `@claude-flow/swarm`, `@claude-flow/memory`). We are NOT writing an orchestrator from scratch. We are wrapping Ruflo's swarm topology (hierarchical, queen + workers) with our own pipeline state machine and UI event emitter.
- **LLM provider:** Claude API (Anthropic). Support `claude-opus-4-6` for Planner/Reviewer, `claude-sonnet-4-6` for Coder/Tester.
- **Git isolation:** Each agent operates in its own Git worktree under `.agentflow/worktrees/<agent>/`
- **State persistence:** Local SQLite (`.agentflow/sessions/<id>/state.db`) via `better-sqlite3`
- **UI aesthetic:** Pixel art / retro game style inspired by The Escapists. Agents are animated pixel characters. Pipeline is a visual map. Clicking an agent opens a detail panel showing its work log, diffs, and handoff artifacts.

## ARCHITECTURE LAYERS

### Layer 1 — VS Code Extension Host (`src/extension.ts`)
Responsibilities:
- Register the sidebar WebviewViewProvider (`agentflow.missionControl`)
- Register commands: `agentflow.createSession`, `agentflow.submitTask`, `agentflow.approveGate`, `agentflow.rejectGate`, `agentflow.pausePipeline`, `agentflow.abortTask`
- Manage lifecycle of the `AgentOrchestrator` singleton
- Bridge messages between WebviewView ↔ AgentOrchestrator via `postMessage` / `onDidReceiveMessage`
- File watchers on `.agentflow/` for state changes

### Layer 2 — Agent Orchestrator (`src/agents/orchestrator.ts`)
Responsibilities:
- Implements a finite state machine: `IDLE → PLANNING → CODING → TESTING → REVIEWING → MERGING → DONE`
- Each state transition emits an event (`pipeline:stateChange`, `agent:output`, `agent:handoff`, `gate:pending`, `gate:resolved`)
- Uses Ruflo under the hood:
  ```ts
  import { HiveMind, Agent } from '@claude-flow/swarm';
  ```
  - Initialize a hierarchical swarm with a Queen (Orchestrator) and 4 Workers (Planner, Coder, Tester, Reviewer)
  - Map Ruflo's `handoff` mechanism to our pipeline gates
  - Ruflo's shared memory store holds inter-agent context (specs, code, test results, review comments)
- Git worktree creation/cleanup via `simple-git` or direct `git worktree add/remove` shell calls
- Claude API calls via `@anthropic-ai/sdk`:
  ```ts
  import Anthropic from '@anthropic-ai/sdk';
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    system: agentSystemPrompt,
    messages: conversationHistory,
    tools: agentTools,
  });
  ```
- Each agent gets tool-use capabilities:
  - Planner: `read_file`, `list_files`, `search_codebase`
  - Coder: `read_file`, `write_file`, `run_command`, `search_codebase`
  - Tester: `read_file`, `write_file`, `run_command` (test runner)
  - Reviewer: `read_file`, `search_codebase`, `create_review_comment`

### Layer 3 — Webview UI (`src/webview/`)
Tech stack: React 18 + Tailwind CSS + pixel art component library
Rendered inside a VS Code WebviewViewProvider (sidebar panel)

**The Map View (default):**
- A pixel-art factory floor / conveyor-belt layout
- 5 stations arranged left-to-right: PLAN → CODE → TEST → REVIEW → MERGE
- Each station is a pixel-art "room" or "desk" with an animated agent character
- Active agent has animation (typing, thinking, hammer). Idle agents sit still.
- Conveyor belt between stations shows artifacts moving (documents, code files)
- Status badges: green (done), yellow (working), red (blocked), grey (waiting)
- Clicking a station zooms into the Agent Detail View

**Agent Detail View (on click):**
- Shows agent's work log (streaming text, like a terminal)
- Shows artifacts produced (expandable code blocks, test results)
- Shows what was received from the previous agent (handoff input)
- Shows what will be passed to the next agent (handoff output)
- "Back to Map" button returns to the Map View

**Approval Gate Overlay:**
- When a gate is pending, a modal overlays the map
- Shows: task name, stage transition, files changed count, lines changed
- Buttons: [View Diff] [Request Changes] [✅ Approve]
- Diff viewer uses VS Code's native `vscode.diff` command

**Timeline Sidebar (collapsible):**
- Scrollable chronological list of all events
- Timestamps, agent attribution, event type icons
- Click an event to jump to that point in the agent detail

### Layer 4 — State & Persistence (`src/state/`)
- `SessionManager`: creates/loads sessions from `.agentflow/sessions/`
- `PipelineState`: the FSM state + all agent outputs, stored in SQLite
- `TimelineLog`: append-only JSONL log of all events (`.agentflow/sessions/<id>/timeline.jsonl`)
- `DiffStore`: stores git diffs per agent per stage (`.agentflow/sessions/<id>/diffs/`)

### Layer 5 — Configuration (`AGENTS.md` parser)
- Parse the user's `AGENTS.md` at project root
- Extract: agent roles, model assignments, approval gate rules, timeout settings
- Fall back to sensible defaults if no `AGENTS.md` exists
- Schema:
  ```yaml
  agents:
    planner: { model: claude-opus-4-6, approval_after: false }
    coder: { model: claude-sonnet-4-6, approval_after_lines: 100 }
    tester: { model: claude-sonnet-4-6, approval_after: true }
    reviewer: { model: claude-opus-4-6, approval_after: true }
  gates:
    after_planning: optional
    after_coding: optional
    after_testing: required
    after_review: required
  settings:
    timeout_per_agent_minutes: 30
    git_merge_strategy: squash
  ```

## IMPLEMENTATION ORDER (build plan)

### Phase 1 — Scaffold & Extension Shell
1. Initialize npm project with TypeScript strict, ESLint, Prettier
2. Set up `package.json` with VS Code extension manifest:
   - `activationEvents`: `onView:agentflow.missionControl`
   - `contributes.viewsContainers.activitybar` with AgentFlow icon
   - `contributes.views.agentflow` with `missionControl` webview
   - `contributes.commands` for all 6 commands
3. Create `src/extension.ts` with activation, command registration, WebviewViewProvider
4. Verify the empty extension loads in Cursor with a blank sidebar panel

### Phase 2 — Pixel Art Webview UI
1. Set up React build pipeline (esbuild or vite) that outputs to `dist/webview/`
2. Install pixel art UI dependencies:
   - `pixel-retroui` (RetroUI — pixelated React components) OR
   - `nes-ui-react` (NES-style CSS framework for React) OR
   - Custom pixel art CSS using `image-rendering: pixelated`, pixel fonts (Press Start 2P from Google Fonts), box-shadow pixel sprites
3. Build the Map View component:
   - CSS Grid or flexbox layout with 5 "rooms"
   - Each room is a self-contained component: `<AgentStation agent="planner" status="working" />`
   - Pixel art agent sprites (can be CSS box-shadow sprites or small PNGs)
   - Animate with CSS keyframes (`@keyframes typing`, `@keyframes thinking`)
   - Conveyor belt: CSS animation moving small document icons left-to-right
4. Build the Agent Detail View component:
   - Terminal-style log viewer with monospace pixel font
   - Streaming text effect (characters appear one by one)
   - Collapsible sections for: Input, Output, Reasoning, Tool Calls
5. Build the Approval Gate modal
6. Build the Timeline sidebar
7. Wire up `window.addEventListener('message', ...)` to receive state from extension host
8. Wire up `vscode.postMessage(...)` to send user actions back

### Phase 3 — Ruflo Integration & Agent Orchestrator
1. Install Ruflo: `npm install @claude-flow/cli @claude-flow/swarm @claude-flow/memory`
2. Create `src/agents/orchestrator.ts`:
   - Initialize HiveMind with hierarchical topology
   - Define 4 agent roles with system prompts and tool bindings
   - Implement the FSM with explicit state transitions
   - On each transition, emit events that the extension host forwards to webview
3. Create `src/agents/prompts/` with system prompts for each agent:
   - `planner.system.md` — role, constraints, output format (JSON spec)
   - `coder.system.md` — role, constraints, code style rules, worktree path
   - `tester.system.md` — role, constraints, test framework, coverage threshold
   - `reviewer.system.md` — role, constraints, review checklist
4. Create `src/agents/tools.ts` with tool definitions for Claude tool-use:
   ```ts
   const tools = [
     { name: 'read_file', description: '...', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
     { name: 'write_file', description: '...', input_schema: { ... } },
     { name: 'run_command', description: '...', input_schema: { ... } },
     { name: 'search_codebase', description: '...', input_schema: { ... } },
   ];
   ```
5. Implement tool execution handlers that operate within the agent's worktree

### Phase 4 — Git Worktree Isolation
1. Create `src/git/worktree-manager.ts`:
   - `createWorktree(agentName)` → `git worktree add .agentflow/worktrees/<agent> -b agentflow/<agent>/<session>`
   - `removeWorktree(agentName)` → `git worktree remove`
   - `getDiff(agentName)` → `git diff main..agentflow/<agent>/<session>`
   - `mergeWorktree(agentName, strategy)` → squash/rebase/merge into main
2. All agent file operations are scoped to their worktree directory
3. On pipeline completion, merge the final worktree into main branch

### Phase 5 — State Machine & Persistence
1. Install `better-sqlite3`
2. Create `src/state/session-manager.ts`:
   - Schema: sessions, pipeline_states, agent_outputs, timeline_events, diffs
   - CRUD operations for session lifecycle
3. Create `src/state/pipeline-state.ts`:
   - FSM implementation with guards (e.g., "all tests must pass before review gate")
   - State transitions trigger SQLite writes + event emissions
4. Create `src/state/timeline-log.ts`:
   - Append-only JSONL writer
   - Reader with filtering by agent, event type, time range

### Phase 6 — AGENTS.md Parser & Configuration
1. Create `src/config/agents-parser.ts`:
   - Read and parse AGENTS.md from project root
   - Support both YAML-in-markdown and structured markdown formats
   - Validate against schema, warn on unknown fields
   - Merge with defaults
2. Create `src/config/defaults.ts` with sensible fallback configuration

### Phase 7 — Integration & Polish
1. End-to-end flow: submit task → planner → gate → coder → gate → tester → gate → reviewer → gate → merge
2. Error handling: agent failures, timeouts, Claude API errors
3. Loading states and progress indicators in the UI
4. Keyboard shortcuts for approve/reject
5. Extension settings in VS Code for API key, model preferences, etc.

## KEY DEPENDENCIES
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@claude-flow/cli": "^3.5.0",
    "@claude-flow/swarm": "^3.5.0",
    "@claude-flow/memory": "^3.5.0",
    "better-sqlite3": "^11.0.0",
    "simple-git": "^3.27.0",
    "eventemitter3": "^5.0.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.96.0",
    "@types/better-sqlite3": "^7.6.0",
    "typescript": "^5.7.0",
    "esbuild": "^0.24.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@types/react": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.4.0"
  }
}
```

## REFERENCE DOCUMENTATION (read these before implementing)
1. **VS Code Extension API — Webview:** https://code.visualstudio.com/api/extension-guides/webview
   - `WebviewViewProvider` for sidebar panels
   - Message passing: `webview.postMessage()` / `webview.onDidReceiveMessage()`
   - Content Security Policy with nonces
   - `webview.asWebviewUri()` for loading local assets
2. **VS Code Extension API — Custom Views:** https://code.visualstudio.com/api/references/contribution-points#contributes.viewsContainers
3. **Ruflo GitHub:** https://github.com/ruvnet/ruflo
   - Swarm topologies: hierarchical (queen + workers) is our choice
   - HiveMind API: `npx ruflo hive-mind init`, agent spawn, handoffs
   - Shared memory: agents share context via Ruflo's memory store
   - CLAUDE.md at https://github.com/ruvnet/ruflo/blob/main/CLAUDE.md for internal architecture
4. **Anthropic Claude SDK:** https://docs.anthropic.com/en/api
   - Tool use / function calling format
   - Streaming responses for live UI updates
   - Model names: `claude-opus-4-6`, `claude-sonnet-4-6`
5. **Pixel Art UI Libraries:**
   - RetroUI (pixel-retroui): https://github.com/Dksie09/RetroUI — pixelated React components
   - Pixelact UI: https://github.com/pixelact-ui/pixelact-ui — shadcn/ui with pixel art style
   - NES UI React: https://kyr0.github.io/nes-ui-react/ — NES-style CSS + React
   - Google Fonts "Press Start 2P": https://fonts.google.com/specimen/Press+Start+2P
6. **Git Worktrees:** https://git-scm.com/docs/git-worktree
7. **Cursor Compatibility:** Cursor is a VS Code fork. Same extension API. Webview panels work. Test in both.

## OUTPUT FORMAT
Produce a detailed, ordered plan.md with:
- Each phase as a section with numbered tasks
- File paths for every file to create/modify
- Code references showing the key interfaces and types
- Dependencies to install at each phase
- Verification steps (what to test after each phase)
- Risk flags and fallback approaches

## IMPORTANT RULES
- Do NOT generate placeholder or stub code. Every file must be functional.
- Do NOT skip error handling. Every async operation needs try/catch.
- Do NOT hardcode API keys. Use VS Code SecretStorage or environment variables.
- Do NOT use `localStorage` or `sessionStorage` in webview — use `acquireVsCodeApi().getState()` / `setState()`.
- All webview scripts must use nonces for CSP compliance.
- TypeScript strict mode: no `any`, no implicit returns, no unused variables.
- Test each phase in isolation before moving to the next.
```

---

## 2. Architecture Overview

The system has 5 layers that communicate through a message bus:

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code / Cursor                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Extension Host (TypeScript)                      │   │
│  │  ├── CommandRegistry                              │   │
│  │  ├── WebviewViewProvider ←──postMessage──→ React UI│  │
│  │  ├── AgentOrchestrator (wraps Ruflo HiveMind)     │   │
│  │  ├── GitWorktreeManager                           │   │
│  │  ├── SessionManager (SQLite)                      │   │
│  │  └── ConfigParser (AGENTS.md)                     │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                    Claude API                            │
│              (Opus 4.6 + Sonnet 4.6)                    │
└─────────────────────────────────────────────────────────┘
```

### Communication Flow

1. **User submits task** → React UI sends `postMessage({ type: 'submitTask', payload })` → Extension Host
2. **Extension Host** → `AgentOrchestrator.startPipeline(task)`
3. **Orchestrator** → Creates worktrees → Spawns Ruflo HiveMind → Assigns Planner
4. **Planner agent** → Calls Claude API with tools → Produces spec → Emits `agent:complete`
5. **Orchestrator** → Checks gate config → If required: emits `gate:pending` → UI shows approval modal
6. **User approves** → React UI sends `postMessage({ type: 'approveGate' })` → Orchestrator advances FSM
7. **Repeat** for Coder → Tester → Reviewer → Merge
8. **Every event** → Written to `timeline.jsonl` + SQLite + forwarded to webview for live UI updates

---

## 3. UI Preparation — Pixel Art Mission Control

### Design Concept

Think "The Escapists" meets "Mission Control":
- Isometric or top-down pixel art factory floor
- Each agent is a small animated sprite (16×16 or 32×32 pixels) at a workstation
- A conveyor belt / pipeline connects the stations
- Documents and code files are small pixel items moving along the belt
- Color coding: green glow = done, yellow pulse = working, red flash = blocked

### What You Need Before Building

**1. Pixel Font**
- **Press Start 2P** (Google Fonts) — the classic pixel font
- Load via `<link>` in the webview HTML or bundle as a woff2

**2. Pixel Art Component Library (pick one)**

| Library | Pros | Cons |
|---------|------|------|
| **RetroUI** (`pixel-retroui`) | Full component set (Button, Card, Popup), Minecraft font built-in, Tailwind compatible | Relatively new, smaller community |
| **Pixelact UI** | Built on shadcn/ui (familiar patterns), pixel borders and styling | Requires shadcn setup |
| **NES UI React** (`nes-ui-react`) | Most comprehensive retro library, NES color palette, Toast/Dialog/Progress | Heavier, opinionated styling |
| **Custom CSS** | Total control, lightest weight | More work, need to build components |

**Recommendation:** Start with **RetroUI** for standard components (buttons, cards, modals) and add **custom CSS sprites** for the agent characters and conveyor belt animations. This gives you the pixel aesthetic without building everything from scratch.

**3. Agent Sprites**

You need 5 agent character sprites, each with 3 animation states:
- **Idle** (sitting, blinking)
- **Working** (typing, writing, hammering)
- **Done** (checkmark, celebrating)

Options:
- Draw them in Pixilart.com (free, browser-based, exports PNG)
- Use CSS box-shadow sprites (no external assets, everything in code)
- Commission on itch.io or use a free sprite pack and recolor

Each sprite should be 32×32 pixels with a transparent background. Export as PNG sprite sheets.

**4. Webview Build Pipeline**

The React webview needs its own build step separate from the extension host:

```
src/webview/          → esbuild/vite → dist/webview/index.js + index.css
src/extension.ts      → esbuild      → dist/extension.js
```

Use esbuild for both (fast, simple). The extension host loads the webview bundle via:

```ts
webview.html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta http-equiv="Content-Security-Policy" 
          content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; 
                   script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; 
                   img-src ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
  </html>
`;
```

**5. Key React Components to Build**

```
src/webview/
├── App.tsx                    # Router between Map and Detail views
├── components/
│   ├── MapView.tsx            # The pixel art factory floor
│   ├── AgentStation.tsx       # Individual agent workstation
│   ├── AgentSprite.tsx        # Animated pixel character
│   ├── ConveyorBelt.tsx       # Animated pipeline connector
│   ├── AgentDetailView.tsx    # Expanded view of one agent's work
│   ├── WorkLog.tsx            # Streaming terminal-style log
│   ├── ApprovalGateModal.tsx  # Approve/reject overlay
│   ├── Timeline.tsx           # Chronological event list
│   └── StatusBadge.tsx        # Green/yellow/red/grey indicators
├── hooks/
│   ├── useVSCode.ts           # acquireVsCodeApi() wrapper
│   ├── usePipelineState.ts    # Listens to state messages from extension
│   └── useAgentEvents.ts      # Filters events for a specific agent
├── types/
│   └── messages.ts            # Typed message protocol between extension ↔ webview
├── styles/
│   ├── pixel.css              # Pixel art base styles, image-rendering, fonts
│   └── animations.css         # Keyframe animations for sprites and conveyor
└── assets/
    ├── sprites/               # Agent sprite PNGs (or generated via CSS)
    └── icons/                 # Pixel art icons for file types, status, etc.
```

---

## 4. Backend Preparation — Modified Ruflo

### What Ruflo Gives You (use as-is)

- **Swarm orchestration**: Deploy multiple agents with defined roles and handoff rules
- **Hierarchical topology**: Queen agent (your Orchestrator) directs Worker agents
- **Shared memory**: Agents can read/write to a shared context store
- **Agent lifecycle management**: Spawn, monitor, terminate agents
- **Learning loop**: Successful patterns are remembered for future tasks

### What You Need to Modify / Wrap

Ruflo is designed for CLI / Claude Code usage. For AgentFlow, you need to:

1. **Wrap the HiveMind in an EventEmitter**
   - Ruflo's internal events need to surface as typed TypeScript events
   - Create `src/agents/orchestrator.ts` that wraps `HiveMind` and emits events the webview can consume

2. **Replace CLI I/O with VS Code integration**
   - Ruflo normally reads/writes to terminal
   - You need to capture agent output streams and pipe them to the webview
   - Override Ruflo's display/logging to emit events instead

3. **Add the Pipeline FSM on top**
   - Ruflo handles agent coordination but doesn't enforce a linear pipeline with human gates
   - Your FSM (`PLANNING → CODING → TESTING → REVIEWING → MERGING`) sits on top
   - Gate logic (required/optional approvals) is your code, not Ruflo's

4. **Integrate Claude API directly**
   - Ruflo supports multiple LLM providers, but for deterministic behavior, call Claude directly via `@anthropic-ai/sdk`
   - This gives you full control over system prompts, tool definitions, and streaming

### Ruflo Installation & Setup

```bash
# Install Ruflo packages
npm install @claude-flow/cli @claude-flow/swarm @claude-flow/memory

# Or install the umbrella package
npm install ruflo@latest

# Verify
npx ruflo --version
```

### Key Ruflo APIs You'll Use

```ts
// Initialize a hierarchical swarm
import { HiveMind } from '@claude-flow/swarm';

const hive = new HiveMind({
  topology: 'hierarchical',
  maxAgents: 5,
  consensus: 'simple', // no need for byzantine in single-user
});

// Spawn agents
await hive.spawn('planner', {
  role: 'requirements_analysis',
  systemPrompt: plannerPrompt,
  tools: plannerTools,
});

// Handoff between agents
await hive.handoff('planner', 'coder', {
  artifact: plannerOutput,
  context: sharedContext,
});

// Monitor agent status
hive.on('agent:status', (agentName, status) => {
  // Forward to webview
});

// Shared memory
await hive.memory.set('spec', plannerSpec);
const spec = await hive.memory.get('spec');
```

---

## 5. VS Code Extension Shell

### `package.json` Manifest (extension-relevant fields)

```json
{
  "name": "agentflow",
  "displayName": "AgentFlow",
  "description": "Real-time multi-agent software factory for VS Code / Cursor",
  "version": "0.1.0",
  "publisher": "beebuilding",
  "engines": { "vscode": "^1.96.0" },
  "categories": ["Other"],
  "activationEvents": ["onView:agentflow.missionControl"],
  "main": "./dist/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "agentflow",
          "title": "AgentFlow",
          "icon": "resources/icon.svg"
        }
      ]
    },
    "views": {
      "agentflow": [
        {
          "type": "webview",
          "id": "agentflow.missionControl",
          "name": "Mission Control"
        }
      ]
    },
    "commands": [
      { "command": "agentflow.createSession", "title": "AgentFlow: Create Session" },
      { "command": "agentflow.submitTask", "title": "AgentFlow: Submit Task" },
      { "command": "agentflow.approveGate", "title": "AgentFlow: Approve Gate" },
      { "command": "agentflow.rejectGate", "title": "AgentFlow: Request Changes" },
      { "command": "agentflow.pausePipeline", "title": "AgentFlow: Pause Pipeline" },
      { "command": "agentflow.abortTask", "title": "AgentFlow: Abort Task" }
    ],
    "configuration": {
      "title": "AgentFlow",
      "properties": {
        "agentflow.claudeApiKey": {
          "type": "string",
          "description": "Anthropic API key (prefer using SecretStorage instead)"
        },
        "agentflow.defaultPlannerModel": {
          "type": "string",
          "default": "claude-opus-4-6",
          "enum": ["claude-opus-4-6", "claude-sonnet-4-6"]
        },
        "agentflow.defaultCoderModel": {
          "type": "string",
          "default": "claude-sonnet-4-6"
        },
        "agentflow.timeoutMinutes": {
          "type": "number",
          "default": 30
        },
        "agentflow.gitMergeStrategy": {
          "type": "string",
          "default": "squash",
          "enum": ["squash", "rebase", "merge"]
        }
      }
    }
  }
}
```

### Message Protocol (Extension ↔ Webview)

```ts
// src/shared/messages.ts — shared between extension host and webview

// Extension → Webview
type ExtensionMessage =
  | { type: 'pipelineState'; payload: PipelineSnapshot }
  | { type: 'agentOutput'; payload: { agent: AgentName; chunk: string; timestamp: number } }
  | { type: 'agentHandoff'; payload: { from: AgentName; to: AgentName; artifact: string } }
  | { type: 'gatePending'; payload: { stage: PipelineStage; filesChanged: number; linesChanged: number } }
  | { type: 'gateResolved'; payload: { stage: PipelineStage; resolution: 'approved' | 'rejected' } }
  | { type: 'timelineEvent'; payload: TimelineEvent }
  | { type: 'error'; payload: { message: string; recoverable: boolean } };

// Webview → Extension
type WebviewMessage =
  | { type: 'submitTask'; payload: { title: string; description: string; priority: string } }
  | { type: 'approveGate'; payload: { stage: PipelineStage } }
  | { type: 'rejectGate'; payload: { stage: PipelineStage; feedback: string } }
  | { type: 'pausePipeline' }
  | { type: 'abortTask' }
  | { type: 'requestDiff'; payload: { agent: AgentName } }
  | { type: 'selectAgent'; payload: { agent: AgentName } };

type AgentName = 'planner' | 'coder' | 'tester' | 'reviewer' | 'orchestrator';
type PipelineStage = 'idle' | 'planning' | 'coding' | 'testing' | 'reviewing' | 'merging' | 'done' | 'failed';
```

---

## 6. File & Folder Scaffold

```
BeeBuilding/
├── .vscode/
│   ├── launch.json              # Extension debug configuration
│   └── tasks.json               # Build tasks
├── src/
│   ├── extension.ts             # VS Code extension entry point
│   ├── shared/
│   │   ├── messages.ts          # Typed message protocol
│   │   └── types.ts             # Shared type definitions
│   ├── agents/
│   │   ├── orchestrator.ts      # Pipeline FSM + Ruflo HiveMind wrapper
│   │   ├── claude-client.ts     # Anthropic SDK wrapper with streaming
│   │   ├── tool-executor.ts     # Executes tool calls within worktrees
│   │   └── prompts/
│   │       ├── planner.system.md
│   │       ├── coder.system.md
│   │       ├── tester.system.md
│   │       └── reviewer.system.md
│   ├── git/
│   │   └── worktree-manager.ts  # Git worktree create/remove/diff/merge
│   ├── state/
│   │   ├── session-manager.ts   # SQLite session CRUD
│   │   ├── pipeline-state.ts    # FSM implementation
│   │   └── timeline-log.ts      # Append-only event log
│   ├── config/
│   │   ├── agents-parser.ts     # AGENTS.md reader
│   │   └── defaults.ts          # Default configuration
│   └── webview/
│       ├── index.tsx             # React entry point
│       ├── App.tsx               # Root component with view routing
│       ├── components/
│       │   ├── MapView.tsx
│       │   ├── AgentStation.tsx
│       │   ├── AgentSprite.tsx
│       │   ├── ConveyorBelt.tsx
│       │   ├── AgentDetailView.tsx
│       │   ├── WorkLog.tsx
│       │   ├── ApprovalGateModal.tsx
│       │   ├── Timeline.tsx
│       │   ├── TaskSubmitForm.tsx
│       │   └── StatusBadge.tsx
│       ├── hooks/
│       │   ├── useVSCode.ts
│       │   ├── usePipelineState.ts
│       │   └── useAgentEvents.ts
│       ├── styles/
│       │   ├── pixel.css
│       │   ├── animations.css
│       │   └── tailwind.css
│       ├── assets/
│       │   └── sprites/
│       └── types/
│           └── index.ts
├── resources/
│   └── icon.svg                 # Activity bar icon (pixel bee?)
├── test/
│   ├── orchestrator.test.ts
│   ├── worktree-manager.test.ts
│   ├── pipeline-state.test.ts
│   └── agents-parser.test.ts
├── scripts/
│   ├── build-extension.ts       # esbuild script for extension host
│   └── build-webview.ts         # esbuild script for React webview
├── AGENTS.md                    # Example configuration
├── package.json
├── tsconfig.json
├── tsconfig.webview.json        # Separate tsconfig for React (jsx: react-jsx)
├── tailwind.config.js
├── .eslintrc.json
├── .prettierrc
└── README.md
```

---

## 7. Resource Links & References

### Core Technology Documentation

| Resource | URL | What It's For |
|----------|-----|---------------|
| VS Code Extension API | https://code.visualstudio.com/api | Extension host, commands, webviews |
| VS Code Webview Guide | https://code.visualstudio.com/api/extension-guides/webview | WebviewViewProvider, CSP, messaging |
| VS Code Webview Samples | https://github.com/microsoft/vscode-extension-samples | Reference implementations |
| Anthropic Claude SDK | https://docs.anthropic.com/en/api | Messages API, tool use, streaming |
| Anthropic TS SDK | https://github.com/anthropics/anthropic-sdk-typescript | `@anthropic-ai/sdk` package |
| Ruflo (GitHub) | https://github.com/ruvnet/ruflo | Multi-agent orchestration framework |
| Ruflo CLAUDE.md | https://github.com/ruvnet/ruflo/blob/main/CLAUDE.md | Internal architecture reference |
| Ruflo Wiki | https://github.com/ruvnet/ruflo/wiki | Detailed guides for all features |
| Git Worktrees Docs | https://git-scm.com/docs/git-worktree | Worktree create/remove/list |
| simple-git | https://github.com/steveukx/git-js | Node.js Git wrapper |
| better-sqlite3 | https://github.com/WiseLibs/better-sqlite3 | Synchronous SQLite for Node.js |

### Pixel Art UI Resources

| Resource | URL | What It's For |
|----------|-----|---------------|
| RetroUI (pixel-retroui) | https://github.com/Dksie09/RetroUI | Pixelated React component library |
| Pixelact UI | https://github.com/pixelact-ui/pixelact-ui | shadcn/ui with pixel art style |
| NES UI React | https://kyr0.github.io/nes-ui-react/ | NES-themed CSS framework for React |
| Press Start 2P Font | https://fonts.google.com/specimen/Press+Start+2P | Classic pixel font |
| Pixilart.com | https://www.pixilart.com/ | Browser-based pixel art editor |
| NES Color Palette | https://www.pixilart.com/palettes/nes-palette-51000 | Authentic retro colors |

### Cursor-Specific References

| Resource | URL | What It's For |
|----------|-----|---------------|
| Cursor Plan Mode | https://cursor.com/blog/plan-mode | How Plan Mode works |
| Cursor Agent Best Practices | https://cursor.com/blog/agent-best-practices | Prompting and workflow tips |
| Cursor 2.4 Subagents | https://github.com/murataslan1/cursor-ai-tips | Long-running agents, subagents |
| Cursor Forum (Webview) | https://forum.cursor.com/t/webview-panels-and-commands-not-supported-in-cursor-breaks-extensions/115748 | Known webview compatibility notes |

### Architecture Patterns

| Resource | URL | What It's For |
|----------|-----|---------------|
| Ruflo Swarm Tutorial | https://www.sitepoint.com/deploying-multiagent-swarms-with-ruflo-beyond-singleprompt-coding/ | Two-agent swarm walkthrough |
| Ruflo Hive Mind Guide | https://mlhive.com/2026/03/architecting-autonomous-multi-agent-systems-using-ruflo | Queen/worker architecture deep dive |
| VS Code Extension Samples | https://github.com/microsoft/vscode-extension-samples | Webview, tree view, custom editor examples |

---

## Pre-Flight Checklist

Before you start building, confirm:

- [ ] **Node.js v18+** installed
- [ ] **Git** installed with worktree support (Git 2.5+, any modern version)
- [ ] **Anthropic API key** obtained from console.anthropic.com
- [ ] **Cursor** (latest, v2.3+) or VS Code (v1.96+) installed
- [ ] **Ruflo** accessible: run `npx ruflo --version` to verify
- [ ] **yo generator-code** for scaffolding (optional): `npm install -g yo generator-code`
- [ ] Decide on pixel art library: RetroUI vs Pixelact vs NES UI vs Custom
- [ ] Create agent sprites (or plan to use CSS-only approach initially)
- [ ] Set up the repository: `git init`, initial commit, `.gitignore` for `node_modules/`, `dist/`, `.agentflow/`

---

*This document is your complete preparation reference. The Cursor Plan Mode prompt in Section 1 is self-contained — paste it and go. The remaining sections provide the context, rationale, and resource links that make the prompt's instructions deterministic and grounded in real documentation.*
