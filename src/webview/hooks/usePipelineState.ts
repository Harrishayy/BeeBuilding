import { useEffect } from 'react';
import { useVSCode } from './useVSCode';
import { usePipelineStore } from '../state/pipelineStore';
import type { ExtensionMessage } from '../../shared/messages';

export function usePipelineState(): void {
  const vscode = useVSCode();
  const updateSnapshot = usePipelineStore((s) => s.updateSnapshot);
  const addTimelineEvent = usePipelineStore((s) => s.addTimelineEvent);
  const addAgentOutput = usePipelineStore((s) => s.addAgentOutput);
  const addPlanningMessage = usePipelineStore((s) => s.addPlanningMessage);
  const setPlanningStatus = usePipelineStore((s) => s.setPlanningStatus);
  const setPlan = usePipelineStore((s) => s.setPlan);
  const setArchitecture = usePipelineStore((s) => s.setArchitecture);
  const setSettings = usePipelineStore((s) => s.setSettings);
  const setPhase = usePipelineStore((s) => s.setPhase);
  const setGithubIssues = usePipelineStore((s) => s.setGithubIssues);
  const setPendingQuestions = usePipelineStore((s) => s.setPendingQuestions);
  const addToast = usePipelineStore((s) => s.addToast);
  const stopTransitionLoading = usePipelineStore((s) => s.stopTransitionLoading);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const msg = event.data as ExtensionMessage;
        if (!msg || typeof msg.type !== 'string') return;

        switch (msg.type) {
          case 'pipelineState':
            updateSnapshot(msg.payload);
            if (msg.payload.stage !== 'idle') stopTransitionLoading();
            break;

          case 'agentOutput':
            addAgentOutput(msg.payload.agent, msg.payload.chunk);
            break;

          case 'timelineEvent':
            addTimelineEvent(msg.payload);
            break;

          case 'gatePending': {
            const snap = usePipelineStore.getState().snapshot;
            if (snap) updateSnapshot({ ...snap, currentGate: msg.payload });
            break;
          }

          case 'gateResolved': {
            const snap = usePipelineStore.getState().snapshot;
            if (snap) updateSnapshot({ ...snap, currentGate: null });
            break;
          }

          case 'error': {
            stopTransitionLoading();
            addToast(msg.payload.message, 'error', 6000);
            const snap = usePipelineStore.getState().snapshot;
            if (snap) updateSnapshot({ ...snap, error: msg.payload.message });
            break;
          }

          case 'sessionLoaded':
            vscode.postMessage({ type: 'requestState' });
            break;

          case 'settingsState':
            setSettings(msg.payload);
            break;

          case 'planningMessage': {
            addPlanningMessage(msg.payload);
            if (msg.payload.role === 'assistant') stopTransitionLoading();

            if (msg.payload.role === 'assistant') {
              try {
                const jsonMatch = msg.payload.content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  if (parsed.status === 'questions' && Array.isArray(parsed.questions)) {
                    setPendingQuestions(parsed.questions);
                  }
                }
              } catch {
                // not JSON
              }
            }
            break;
          }

          case 'planReady':
            stopTransitionLoading();
            setPlan(msg.payload);
            setPhase('plan_review');
            addToast('Plan generated! Review and approve.', 'success');
            break;

          case 'architectureReady':
            stopTransitionLoading();
            setArchitecture(msg.payload);
            setPhase('architecture');
            addToast('Architecture determined! Review the agent setup.', 'success');
            break;

          case 'planningStatus':
            setPlanningStatus(msg.payload.phase);
            if (msg.payload.phase === 'chatting') {
              stopTransitionLoading();
              setPhase('planning');
            }
            break;

          case 'issuesList':
            setGithubIssues(msg.payload);
            break;

          case 'sessionRestore': {
            const { phase, planningMessages, plan, architecture } = msg.payload;
            setPhase(phase);
            for (const m of planningMessages) {
              addPlanningMessage(m);
            }
            if (plan) setPlan(plan);
            if (architecture) setArchitecture(architecture);
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('[BeeBuilder] Error handling message:', err);
      }
    }

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ type: 'requestState' });
    vscode.postMessage({ type: 'requestSettings' });

    return () => window.removeEventListener('message', handleMessage);
  }, [vscode, updateSnapshot, addTimelineEvent, addAgentOutput, addPlanningMessage, setPlanningStatus, setPlan, setArchitecture, setSettings, setPhase, setGithubIssues, setPendingQuestions, addToast, stopTransitionLoading]);
}
