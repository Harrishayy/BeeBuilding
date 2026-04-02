import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { AgentFlowPanel } from './views/AgentFlowViewProvider.js';
import { AgentOrchestrator } from './agents/orchestrator.js';
import type { WebviewMessage } from './shared/messages.js';

let orchestrator: AgentOrchestrator | undefined;

export function activate(context: vscode.ExtensionContext): void {
  orchestrator = new AgentOrchestrator(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.open', () => {
      const panel = AgentFlowPanel.createOrShow(context.extensionUri, (msg) =>
        handleWebviewMessage(msg),
      );
      wireOrchestratorToPanel(panel);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.createSession', () => {
      orchestrator?.createSession();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.submitTask', () => {
      const panel = AgentFlowPanel.getInstance();
      if (panel && orchestrator) {
        panel.postMessage({
          type: 'pipelineState',
          payload: orchestrator.getSnapshot(),
        });
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.approveGate', () => {
      orchestrator?.approveCurrentGate();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.rejectGate', () => {
      orchestrator?.rejectCurrentGate('Rejected via command palette');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.pausePipeline', () => {
      orchestrator?.pause();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.abortTask', () => {
      orchestrator?.abort();
    }),
  );

  // Auto-open the panel on activation
  vscode.commands.executeCommand('agentflow.open');
}

function wireOrchestratorToPanel(panel: AgentFlowPanel): void {
  if (!orchestrator) return;

  orchestrator.on('stateChange', (snapshot) => {
    panel.postMessage({ type: 'pipelineState', payload: snapshot });
  });

  orchestrator.on('agentOutput', (data) => {
    panel.postMessage({ type: 'agentOutput', payload: data });
  });

  orchestrator.on('gatePending', (info) => {
    panel.postMessage({ type: 'gatePending', payload: info });
  });

  orchestrator.on('gateResolved', (data) => {
    panel.postMessage({ type: 'gateResolved', payload: data });
  });

  orchestrator.on('timelineEvent', (event) => {
    panel.postMessage({ type: 'timelineEvent', payload: event });
  });

  orchestrator.on('error', (err) => {
    panel.postMessage({
      type: 'error',
      payload: { message: err.message, recoverable: err.recoverable },
    });
  });
}

function handleWebviewMessage(message: WebviewMessage): void {
  const panel = AgentFlowPanel.getInstance();

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
  }
}

export function deactivate(): void {
  orchestrator?.dispose();
  orchestrator = undefined;
}
