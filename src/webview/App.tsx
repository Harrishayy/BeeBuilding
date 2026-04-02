import { MapView } from './components/MapView';
import { AgentDetailView } from './components/AgentDetailView';
import { TaskSubmitForm } from './components/TaskSubmitForm';
import { Timeline } from './components/Timeline';
import { ApprovalGateModal } from './components/ApprovalGateModal';
import { usePipelineState } from './hooks/usePipelineState';
import { usePipelineStore } from './state/pipelineStore';

export function App() {
  const currentView = usePipelineStore((s) => s.currentView);
  const snapshot = usePipelineStore((s) => s.snapshot);
  const timelineEvents = usePipelineStore((s) => s.timelineEvents);

  usePipelineState();

  const isIdle = !snapshot || snapshot.stage === 'idle';
  const hasGate = snapshot?.currentGate != null;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        background: '#1a1a2e',
        fontFamily: 'var(--font-pixel)',
        position: 'relative',
      }}
    >
      {/* Main panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {isIdle ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <TaskSubmitForm />
          </div>
        ) : currentView === 'map' ? (
          <MapView />
        ) : (
          <AgentDetailView />
        )}
      </div>

      {/* Timeline sidebar */}
      {!isIdle && <Timeline events={timelineEvents} />}

      {/* Gate modal overlay */}
      {hasGate && currentView === 'map' && <ApprovalGateModal />}
    </div>
  );
}
