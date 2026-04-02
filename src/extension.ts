import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { AgentFlowSidebarProvider, AgentFlowPanel } from './views/AgentFlowViewProvider.js';
import { AgentOrchestrator } from './agents/orchestrator.js';
import { PlanningEngine } from './agents/planning-engine.js';
import { ArchitectureEngine } from './agents/architecture-engine.js';
import { KeyStore } from './state/key-store.js';
import { loadSession, patchSession, clearSession } from './state/workspace-session.js';
import { GitHubClient } from './github/github-client.js';
import { log } from './util/logger.js';
import type { ExtensionMessage } from './shared/messages.js';
import type { WebviewMessage } from './shared/messages.js';
import type { AppPhase, PlanDocument, AgentArchitecture, PlanningMessage } from './shared/types.js';

let orchestrator: AgentOrchestrator | undefined;
let keyStore: KeyStore;
let planningEngine: PlanningEngine | undefined;
let architectureEngine: ArchitectureEngine | undefined;
let currentPlan: PlanDocument | undefined;
let currentArchitecture: AgentArchitecture | undefined;
let currentPhase: AppPhase = 'task';
let planningMessages: PlanningMessage[] = [];

type MessageSink = { postMessage(msg: ExtensionMessage): void };

function broadcast(msg: ExtensionMessage, ...sinks: (MessageSink | undefined)[]) {
  for (const s of sinks) {
    try {
      s?.postMessage(msg);
    } catch (err) {
      log.error('Extension', 'Failed to broadcast message', err);
    }
  }
}

let _sinks: (MessageSink | undefined)[] = [];

function broadcastAll(msg: ExtensionMessage) {
  broadcast(msg, ..._sinks);
}

function getSkillsPaths(): string[] {
  return vscode.workspace.getConfiguration('beebuilder').get<string[]>('skillsPaths') ?? [];
}

function getAgentFrameworkPath(): string {
  return vscode.workspace.getConfiguration('beebuilder').get<string>('agentFrameworkPath') ?? '';
}

async function broadcastSettings(): Promise<void> {
  broadcastAll({
    type: 'settingsState',
    payload: {
      hasApiKey: await keyStore.hasApiKey(),
      hasGitHubPAT: await keyStore.hasGitHubPAT(),
      skillsPaths: getSkillsPaths(),
      agentFrameworkPath: getAgentFrameworkPath(),
    },
  });
}

function persistState(): void {
  patchSession({
    phase: currentPhase,
    planningMessages,
    plan: currentPlan ?? null,
    architecture: currentArchitecture ?? null,
  });
}

function trackPhase(phase: AppPhase): void {
  currentPhase = phase;
  persistState();
}

function trackPlanningMessage(msg: PlanningMessage): void {
  planningMessages.push(msg);
  persistState();
}

function restoreSessionToWebview(): void {
  const saved = loadSession();
  if (!saved || saved.phase === 'task') return;

  currentPhase = saved.phase;
  planningMessages = saved.planningMessages;
  currentPlan = saved.plan ?? undefined;
  currentArchitecture = saved.architecture ?? undefined;

  log.info('Extension', `Restoring session: phase=${saved.phase}, msgs=${saved.planningMessages.length}`);

  broadcastAll({
    type: 'sessionRestore',
    payload: {
      phase: saved.phase,
      planningMessages: saved.planningMessages,
      plan: saved.plan,
      architecture: saved.architecture,
    },
  });
}

export function activate(context: vscode.ExtensionContext): void {
  log.info('Extension', 'Activating BeeBuilder extension');

  keyStore = new KeyStore(context.secrets);

  try {
    orchestrator = new AgentOrchestrator(context);
    log.info('Extension', 'Orchestrator initialized');
  } catch (err) {
    log.error('Extension', 'Failed to initialize orchestrator', err);
    vscode.window.showErrorMessage(
      `BeeBuilder failed to initialize: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const sidebarProvider = new AgentFlowSidebarProvider(
    context.extensionUri,
    (msg) => handleWebviewMessage(msg),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AgentFlowSidebarProvider.viewType,
      sidebarProvider,
    ),
  );
  log.info('Extension', 'Sidebar view provider registered');

  const registerCommand = (id: string, handler: () => void | Promise<void>) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async () => {
        log.debug('Extension', `Command invoked: ${id}`);
        try {
          await handler();
        } catch (err) {
          log.error('Extension', `Command "${id}" failed`, err);
          vscode.window.showErrorMessage(
            `BeeBuilder command failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );
  };

  registerCommand('beebuilder.open', () => {
    log.info('Extension', 'Opening BeeBuilder panel');
    const panel = AgentFlowPanel.createOrShow(context.extensionUri, (msg) =>
      handleWebviewMessage(msg),
    );
    wireOrchestrator(panel, sidebarProvider);
  });

  registerCommand('beebuilder.createSession', () => {
    orchestrator?.createSession();
  });

  registerCommand('beebuilder.submitTask', () => {
    const snap = orchestrator?.getSnapshot();
    if (snap) {
      const msg: ExtensionMessage = { type: 'pipelineState', payload: snap };
      broadcast(msg, AgentFlowPanel.getInstance(), sidebarProvider);
    }
  });

  registerCommand('beebuilder.approveGate', () => orchestrator?.approveCurrentGate());
  registerCommand('beebuilder.rejectGate', () => orchestrator?.rejectCurrentGate('Rejected via command palette'));
  registerCommand('beebuilder.pausePipeline', () => orchestrator?.pause());
  registerCommand('beebuilder.abortTask', () => orchestrator?.abort());
  registerCommand('beebuilder.showLog', () => log.show());

  wireOrchestrator(AgentFlowPanel.getInstance(), sidebarProvider);

  context.subscriptions.push({ dispose: () => log.dispose() });

  log.info('Extension', 'BeeBuilder extension activated successfully');
}

function wireOrchestrator(...sinks: (MessageSink | undefined)[]): void {
  _sinks = sinks;
  if (!orchestrator) return;

  orchestrator.removeAllListeners();

  orchestrator.on('stateChange', (snapshot) => {
    broadcast({ type: 'pipelineState', payload: snapshot }, ...sinks);
  });

  orchestrator.on('agentOutput', (data) => {
    broadcast({ type: 'agentOutput', payload: data }, ...sinks);
  });

  orchestrator.on('gatePending', (info) => {
    broadcast({ type: 'gatePending', payload: info }, ...sinks);
  });

  orchestrator.on('gateResolved', (data) => {
    broadcast({ type: 'gateResolved', payload: data }, ...sinks);
  });

  orchestrator.on('timelineEvent', (event) => {
    broadcast({ type: 'timelineEvent', payload: event }, ...sinks);
  });

  orchestrator.on('error', (err) => {
    log.error('Extension', `Orchestrator error: ${err.message} (recoverable: ${err.recoverable})`);
    if (!err.recoverable) {
      vscode.window.showErrorMessage(`BeeBuilder: ${err.message}`);
    }
    broadcast(
      { type: 'error', payload: { message: err.message, recoverable: err.recoverable } },
      ...sinks,
    );
  });
}

async function handleWebviewMessage(message: WebviewMessage): Promise<void> {
  log.debug('Extension', `Webview message received: ${message.type}`);

  try {
    switch (message.type) {
      case 'submitTask': {
        const task = {
          id: randomUUID(),
          title: message.payload.title,
          description: message.payload.description,
          priority: message.payload.priority as 'low' | 'medium' | 'high' | 'critical',
          createdAt: Date.now(),
        };
        patchSession({ task });
        orchestrator?.submitTask(task);
        break;
      }

      case 'approveGate':
        orchestrator?.approveCurrentGate();
        break;

      case 'rejectGate':
        orchestrator?.rejectCurrentGate(message.payload.feedback);
        break;

      case 'pausePipeline':
        orchestrator?.pause();
        break;

      case 'abortTask':
        orchestrator?.abort();
        break;

      case 'requestDiff':
        orchestrator?.getDiffForAgent(message.payload.agent);
        break;

      case 'selectAgent':
        break;

      case 'requestState':
        if (orchestrator) {
          broadcastAll({ type: 'pipelineState', payload: orchestrator.getSnapshot() });
        }
        restoreSessionToWebview();
        break;

      // --- Settings ---
      case 'saveApiKey':
        await keyStore.saveApiKey(message.payload.apiKey);
        await broadcastSettings();
        break;

      case 'removeApiKey':
        await keyStore.removeApiKey();
        await broadcastSettings();
        break;

      case 'saveGitHubPAT':
        await keyStore.saveGitHubPAT(message.payload.token);
        await broadcastSettings();
        break;

      case 'requestSettings':
        await broadcastSettings();
        break;

      case 'addSkillsPath': {
        const current = getSkillsPaths();
        const newPath = message.payload.path;
        if (!current.includes(newPath)) {
          await vscode.workspace.getConfiguration('beebuilder').update('skillsPaths', [...current, newPath], vscode.ConfigurationTarget.Workspace);
        }
        await broadcastSettings();
        break;
      }

      case 'removeSkillsPath': {
        const current = getSkillsPaths();
        const filtered = current.filter((p) => p !== message.payload.path);
        await vscode.workspace.getConfiguration('beebuilder').update('skillsPaths', filtered, vscode.ConfigurationTarget.Workspace);
        await broadcastSettings();
        break;
      }

      case 'saveAgentFrameworkPath':
        await vscode.workspace.getConfiguration('beebuilder').update('agentFrameworkPath', message.payload.path, vscode.ConfigurationTarget.Workspace);
        await broadcastSettings();
        break;

      case 'clearAgentFrameworkPath':
        await vscode.workspace.getConfiguration('beebuilder').update('agentFrameworkPath', '', vscode.ConfigurationTarget.Workspace);
        await broadcastSettings();
        break;

      // --- Planning ---
      case 'startPlanning': {
        const apiKey = await keyStore.getApiKey();
        if (!apiKey) {
          broadcastAll({ type: 'error', payload: { message: 'API key not configured', recoverable: true } });
          return;
        }
        const model = vscode.workspace.getConfiguration('beebuilder').get<string>('defaultPlannerModel') ?? 'claude-sonnet-4-6';
        planningEngine = new PlanningEngine(apiKey, model);
        planningMessages = [];
        broadcastAll({ type: 'planningStatus', payload: { phase: 'chatting' } });
        trackPhase('planning');

        try {
          const result = await planningEngine.startPlanning(message.payload.description, message.payload.context);
          for (const msg of planningEngine.getMessages()) {
            trackPlanningMessage(msg);
            broadcastAll({ type: 'planningMessage', payload: msg });
          }
          if (result.status === 'plan' && result.plan) {
            currentPlan = result.plan;
            trackPhase('plan_review');
            broadcastAll({ type: 'planReady', payload: result.plan });
          }
        } catch (err) {
          broadcastAll({ type: 'error', payload: { message: `Planning failed: ${err instanceof Error ? err.message : String(err)}`, recoverable: true } });
        }
        break;
      }

      case 'sendPlanningReply': {
        if (!planningEngine) return;
        broadcastAll({ type: 'planningStatus', payload: { phase: 'chatting' } });
        const userMsg: PlanningMessage = { role: 'user', content: message.payload.message, timestamp: Date.now() };
        trackPlanningMessage(userMsg);
        broadcastAll({ type: 'planningMessage', payload: userMsg });

        try {
          const result = await planningEngine.continueConversation(message.payload.message);
          const msgs = planningEngine.getMessages();
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.role === 'assistant') {
            trackPlanningMessage(lastMsg);
            broadcastAll({ type: 'planningMessage', payload: lastMsg });
          }
          if (result.status === 'plan' && result.plan) {
            currentPlan = result.plan;
            trackPhase('plan_review');
            broadcastAll({ type: 'planReady', payload: result.plan });
          }
        } catch (err) {
          broadcastAll({ type: 'error', payload: { message: `Planning failed: ${err instanceof Error ? err.message : String(err)}`, recoverable: true } });
        }
        break;
      }

      case 'approvePlan': {
        if (!currentPlan) {
          log.error('Extension', 'approvePlan: no plan available');
          broadcastAll({ type: 'error', payload: { message: 'No plan data available. Please regenerate.', recoverable: true } });
          return;
        }
        const apiKey = await keyStore.getApiKey();
        if (!apiKey) {
          log.error('Extension', 'approvePlan: API key not configured');
          broadcastAll({ type: 'error', payload: { message: 'API key not configured. Set it in Settings first.', recoverable: true } });
          return;
        }
        const model = vscode.workspace.getConfiguration('beebuilder').get<string>('defaultPlannerModel') ?? 'claude-sonnet-4-6';
        broadcastAll({ type: 'planningStatus', payload: { phase: 'generating_architecture' } });

        architectureEngine = new ArchitectureEngine(apiKey, model);
        try {
          currentArchitecture = await architectureEngine.determineArchitecture(currentPlan);
          trackPhase('architecture');
          broadcastAll({ type: 'architectureReady', payload: currentArchitecture });
        } catch (err) {
          broadcastAll({ type: 'error', payload: { message: `Architecture failed: ${err instanceof Error ? err.message : String(err)}`, recoverable: true } });
        }
        break;
      }

      case 'revisePlan': {
        if (!planningEngine) return;
        broadcastAll({ type: 'planningStatus', payload: { phase: 'chatting' } });
        trackPhase('planning');
        const reviseUserMsg: PlanningMessage = { role: 'user', content: `Revision requested: ${message.payload.feedback}`, timestamp: Date.now() };
        trackPlanningMessage(reviseUserMsg);
        broadcastAll({ type: 'planningMessage', payload: reviseUserMsg });

        try {
          const result = await planningEngine.continueConversation(`Please revise the plan: ${message.payload.feedback}`);
          const msgs = planningEngine.getMessages();
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.role === 'assistant') {
            trackPlanningMessage(lastMsg);
            broadcastAll({ type: 'planningMessage', payload: lastMsg });
          }
          if (result.status === 'plan' && result.plan) {
            currentPlan = result.plan;
            trackPhase('plan_review');
            broadcastAll({ type: 'planReady', payload: result.plan });
          }
        } catch (err) {
          broadcastAll({ type: 'error', payload: { message: `Revision failed: ${err instanceof Error ? err.message : String(err)}`, recoverable: true } });
        }
        break;
      }

      case 'approveArchitecture': {
        if (!currentPlan || !currentArchitecture) {
          log.error('Extension', `approveArchitecture: missing state (plan=${!!currentPlan}, arch=${!!currentArchitecture})`);
          broadcastAll({ type: 'error', payload: { message: 'Plan or architecture data is missing. Please go back and regenerate.', recoverable: true } });
          return;
        }
        if (!orchestrator) {
          log.error('Extension', 'approveArchitecture: orchestrator not initialized');
          broadcastAll({ type: 'error', payload: { message: 'Orchestrator not initialized', recoverable: true } });
          return;
        }
        const apiKey = await keyStore.getApiKey();
        if (!apiKey) {
          log.error('Extension', 'approveArchitecture: API key not configured');
          broadcastAll({ type: 'error', payload: { message: 'API key not configured. Set it in Settings first.', recoverable: true } });
          return;
        }
        log.info('Extension', `Approving architecture: "${currentPlan.title}" with ${currentArchitecture.agents.length} agents`);
        broadcastAll({ type: 'planningStatus', payload: { phase: 'ready' } });
        trackPhase('execution');
        orchestrator.submitTaskWithArchitecture(
          {
            id: randomUUID(),
            title: currentPlan.title,
            description: currentPlan.summary,
            priority: 'medium',
            createdAt: Date.now(),
          },
          currentArchitecture,
        );
        break;
      }

      case 'reviseArchitecture': {
        if (!planningEngine) return;
        broadcastAll({ type: 'planningStatus', payload: { phase: 'chatting' } });
        trackPhase('planning');
        const archRevMsg: PlanningMessage = { role: 'user', content: `Architecture revision: ${message.payload.feedback}`, timestamp: Date.now() };
        trackPlanningMessage(archRevMsg);
        broadcastAll({ type: 'planningMessage', payload: archRevMsg });

        try {
          const result = await planningEngine.continueConversation(`The architecture needs changes: ${message.payload.feedback}. Please revise the plan.`);
          const msgs = planningEngine.getMessages();
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.role === 'assistant') {
            trackPlanningMessage(lastMsg);
            broadcastAll({ type: 'planningMessage', payload: lastMsg });
          }
          if (result.status === 'plan' && result.plan) {
            currentPlan = result.plan;
            trackPhase('plan_review');
            broadcastAll({ type: 'planReady', payload: result.plan });
          }
        } catch (err) {
          broadcastAll({ type: 'error', payload: { message: `Revision failed: ${err instanceof Error ? err.message : String(err)}`, recoverable: true } });
        }
        break;
      }

      // --- GitHub Issues ---
      case 'fetchIssues': {
        const pat = await keyStore.getGitHubPAT();
        if (!pat) return;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) return;

        const repoInfo = await GitHubClient.detectRepo(workspaceFolders[0].uri.fsPath);
        if (!repoInfo) return;

        try {
          const client = new GitHubClient(pat);
          const issues = await client.listIssues(repoInfo.owner, repoInfo.repo);
          broadcastAll({ type: 'issuesList', payload: issues });
        } catch (err) {
          log.error('Extension', 'Failed to fetch issues', err);
        }
        break;
      }

      case 'importIssue': {
        const pat = await keyStore.getGitHubPAT();
        if (!pat) return;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) return;

        const repoInfo = await GitHubClient.detectRepo(workspaceFolders[0].uri.fsPath);
        if (!repoInfo) return;

        try {
          const client = new GitHubClient(pat);
          const issue = await client.getIssue(repoInfo.owner, repoInfo.repo, message.payload.issueNumber);
          broadcastAll({
            type: 'issueImported',
            payload: { title: issue.title, body: issue.body, labels: issue.labels },
          });
        } catch (err) {
          log.error('Extension', 'Failed to import issue', err);
        }
        break;
      }

      default:
        log.warn('Extension', `Unhandled webview message type: ${(message as { type: string }).type}`);
    }
  } catch (err) {
    log.error('Extension', `Error handling webview message "${message.type}"`, err);
  }
}

export function deactivate(): void {
  log.info('Extension', 'Deactivating BeeBuilder extension');
  try {
    orchestrator?.dispose();
  } catch (err) {
    log.error('Extension', 'Error during deactivation', err);
  }
  orchestrator = undefined;
}
