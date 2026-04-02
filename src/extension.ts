import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { AgentFlowSidebarProvider, AgentFlowPanel } from './views/AgentFlowViewProvider.js';
import { AgentOrchestrator } from './agents/orchestrator.js';
import { log } from './util/logger.js';
import type { ExtensionMessage } from './shared/messages.js';
import type { WebviewMessage } from './shared/messages.js';

let orchestrator: AgentOrchestrator | undefined;

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

export function activate(context: vscode.ExtensionContext): void {
  log.info('Extension', 'Activating BeeBuilder extension');

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

function handleWebviewMessage(message: WebviewMessage): void {
  log.debug('Extension', `Webview message received: ${message.type}`);
  const panel = AgentFlowPanel.getInstance();

  try {
    switch (message.type) {
      case 'submitTask':
        orchestrator?.submitTask({
          id: randomUUID(),
          title: message.payload.title,
          description: message.payload.description,
          priority: message.payload.priority as 'low' | 'medium' | 'high' | 'critical',
          createdAt: Date.now(),
        });
        break;
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
        if (orchestrator && panel) {
          panel.postMessage({
            type: 'pipelineState',
            payload: orchestrator.getSnapshot(),
          });
        }
        break;
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
