import { ErrorBoundary } from './components/ErrorBoundary';
import { MapView } from './components/MapView';
import { AgentDetailView } from './components/AgentDetailView';
import { Timeline } from './components/Timeline';
import { ApprovalGateModal } from './components/ApprovalGateModal';
import { HeaderBar } from './components/HeaderBar';
import { SettingsView } from './components/SettingsView';
import { TaskCreationView } from './components/TaskCreationView';
import { PlanningChatView } from './components/PlanningChatView';
import { PlanReviewView } from './components/PlanReviewView';
import { ArchitectureView } from './components/ArchitectureView';
import { ToastContainer } from './components/Toast';
import { usePipelineState } from './hooks/usePipelineState';
import { usePipelineStore } from './state/pipelineStore';

export function App() {
  const currentPhase = usePipelineStore((s) => s.currentPhase);
  const currentView = usePipelineStore((s) => s.currentView);
  const snapshot = usePipelineStore((s) => s.snapshot);
  const timelineEvents = usePipelineStore((s) => s.timelineEvents);

  usePipelineState();

  const hasGate = snapshot?.currentGate != null;
  const isExecution = currentPhase === 'execution';

  const renderPhase = () => {
    switch (currentPhase) {
      case 'settings':
        return <SettingsView />;
      case 'task':
        return (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <TaskCreationView />
          </div>
        );
      case 'planning':
        return <PlanningChatView />;
      case 'plan_review':
        return <PlanReviewView />;
      case 'architecture':
        return <ArchitectureView />;
      case 'execution':
        return currentView === 'map' ? <MapView /> : <AgentDetailView />;
      default:
        return <TaskCreationView />;
    }
  };

  return (
    <ErrorBoundary>
      <ToastContainer />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100%',
          background: '#1a1a2e',
          fontFamily: 'var(--font-pixel)',
        }}
      >
        <HeaderBar />

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Main panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <ErrorBoundary>
              {renderPhase()}
            </ErrorBoundary>
          </div>

          {/* Timeline sidebar (execution only) */}
          {isExecution && (
            <ErrorBoundary>
              <Timeline events={timelineEvents} />
            </ErrorBoundary>
          )}
        </div>

        {/* Gate modal overlay */}
        {hasGate && isExecution && currentView === 'map' && (
          <ErrorBoundary>
            <ApprovalGateModal />
          </ErrorBoundary>
        )}
      </div>
    </ErrorBoundary>
  );
}
