import { useEffect } from 'react';
import { useVSCode } from './useVSCode';
import { usePipelineStore } from '../state/pipelineStore';
import type { ExtensionMessage } from '../../shared/messages';

export function usePipelineState(): void {
  const vscode = useVSCode();
  const updateSnapshot = usePipelineStore((s) => s.updateSnapshot);
  const addTimelineEvent = usePipelineStore((s) => s.addTimelineEvent);
  const addAgentOutput = usePipelineStore((s) => s.addAgentOutput);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const msg = event.data as ExtensionMessage;
        if (!msg || typeof msg.type !== 'string') {
          console.warn('[BeeBuilder] Received invalid message:', event.data);
          return;
        }

        console.debug(`[BeeBuilder] Message received: ${msg.type}`);

        switch (msg.type) {
          case 'pipelineState':
            updateSnapshot(msg.payload);
            break;

          case 'agentOutput':
            addAgentOutput(msg.payload.agent, msg.payload.chunk);
            break;

          case 'timelineEvent':
            addTimelineEvent(msg.payload);
            break;

          case 'gatePending': {
            const snap = usePipelineStore.getState().snapshot;
            if (snap) {
              updateSnapshot({ ...snap, currentGate: msg.payload });
            }
            break;
          }

          case 'gateResolved': {
            const snap = usePipelineStore.getState().snapshot;
            if (snap) {
              updateSnapshot({ ...snap, currentGate: null });
            }
            break;
          }

          case 'error': {
            console.error(`[BeeBuilder] Extension error: ${msg.payload.message} (recoverable: ${msg.payload.recoverable})`);
            const snap = usePipelineStore.getState().snapshot;
            if (snap) {
              updateSnapshot({ ...snap, error: msg.payload.message });
            }
            break;
          }

          case 'sessionLoaded':
            vscode.postMessage({ type: 'requestState' });
            break;

          default:
            console.warn(`[BeeBuilder] Unknown message type: ${(msg as { type: string }).type}`);
        }
      } catch (err) {
        console.error('[BeeBuilder] Error handling message:', err);
      }
    }

    window.addEventListener('message', handleMessage);
    console.debug('[BeeBuilder] Message listener attached, requesting initial state');
    vscode.postMessage({ type: 'requestState' });

    return () => window.removeEventListener('message', handleMessage);
  }, [vscode, updateSnapshot, addTimelineEvent, addAgentOutput]);
}
