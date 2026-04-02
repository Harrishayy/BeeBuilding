import { useState, useRef, useEffect } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import { usePipelineStore } from '../state/pipelineStore';
import type { PlanningMessage } from '../../shared/types';

export function PlanningChatView() {
  const vscode = useVSCode();
  const planningMessages = usePipelineStore((s) => s.planningMessages);
  const planningStatus = usePipelineStore((s) => s.planningStatus);
  const pendingQuestions = usePipelineStore((s) => s.pendingQuestions);
  const questionAnswers = usePipelineStore((s) => s.questionAnswers);
  const currentQuestionIndex = usePipelineStore((s) => s.currentQuestionIndex);
  const answerQuestion = usePipelineStore((s) => s.answerQuestion);
  const clearQuestions = usePipelineStore((s) => s.clearQuestions);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasQuestions = pendingQuestions.length > 0;
  const allAnswered = hasQuestions && currentQuestionIndex >= pendingQuestions.length;
  const currentQuestion = hasQuestions && !allAnswered ? pendingQuestions[currentQuestionIndex] : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [planningMessages, currentQuestionIndex, questionAnswers]);

  useEffect(() => {
    if (currentQuestion) {
      inputRef.current?.focus();
    }
  }, [currentQuestion]);

  useEffect(() => {
    if (!allAnswered) return;

    const combined = pendingQuestions
      .map((q, i) => `Q${i + 1}: ${q}\nA: ${questionAnswers[i]}`)
      .join('\n\n');

    clearQuestions();
    vscode.postMessage({ type: 'sendPlanningReply', payload: { message: combined } });
  }, [allAnswered, pendingQuestions, questionAnswers, clearQuestions, vscode]);

  const handleSend = () => {
    if (!input.trim()) return;

    if (currentQuestion) {
      answerQuestion(input.trim());
      setInput('');
      return;
    }

    if (planningStatus === 'generating_plan') return;
    vscode.postMessage({ type: 'sendPlanningReply', payload: { message: input.trim() } });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isLoading = planningStatus === 'generating_plan' || planningStatus === 'chatting';
  const inputDisabled = planningStatus === 'generating_plan' || allAnswered;

  const placeholder = currentQuestion
    ? `Answer Q${currentQuestionIndex + 1}...`
    : 'Reply to the planning assistant...';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: 640,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {planningMessages.map((msg: PlanningMessage, i: number) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Interactive questions */}
        {hasQuestions && !allAnswered && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingQuestions.map((q, i) => {
              const isAnswered = i < currentQuestionIndex;
              const isCurrent = i === currentQuestionIndex;
              const isFuture = i > currentQuestionIndex;

              return (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px',
                    background: isCurrent ? '#1a2a3e' : '#1a1a2e',
                    borderLeft: `3px solid ${isCurrent ? '#4fc3f7' : isAnswered ? '#4caf50' : '#333'}`,
                    opacity: isFuture ? 0.4 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: isAnswered ? 4 : 0 }}>
                    <span
                      className="pixel-text"
                      style={{
                        fontSize: 6,
                        color: isCurrent ? '#4fc3f7' : isAnswered ? '#4caf50' : '#555',
                        fontWeight: isCurrent ? 'bold' : 'normal',
                      }}
                    >
                      {isAnswered ? '\u2714' : isCurrent ? '\u25B8' : '\u25CB'} Q{i + 1}:
                    </span>
                    <span
                      className="pixel-text"
                      style={{
                        fontSize: 6,
                        color: isCurrent ? '#e0e0e0' : isAnswered ? '#aaa' : '#555',
                      }}
                    >
                      {q}
                    </span>
                  </div>
                  {isAnswered && (
                    <div
                      style={{
                        marginLeft: 16,
                        padding: '4px 8px',
                        background: '#1a3a5c',
                        borderRadius: 2,
                      }}
                    >
                      <span className="pixel-text" style={{ fontSize: 6, color: '#81d4fa' }}>
                        {questionAnswers[i]}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isLoading && !hasQuestions && (
          <div
            className="pixel-text"
            style={{ fontSize: 6, color: '#ffd54f', textAlign: 'center', padding: 8 }}
          >
            {planningStatus === 'generating_plan' ? 'GENERATING PLAN...' : 'THINKING...'}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div
        style={{
          borderTop: '2px solid #333',
          padding: 0,
        }}
      >
        {/* Current question banner */}
        {currentQuestion && (
          <div
            style={{
              padding: '6px 12px',
              background: '#0d1b2a',
              borderBottom: '1px solid #1a2a3e',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              className="pixel-text"
              style={{
                fontSize: 5,
                color: '#4fc3f7',
                background: '#1a2a3e',
                padding: '2px 6px',
                borderRadius: 2,
                flexShrink: 0,
              }}
            >
              Q{currentQuestionIndex + 1}/{pendingQuestions.length}
            </span>
            <span className="pixel-text" style={{ fontSize: 5, color: '#90caf9' }}>
              {currentQuestion}
            </span>
          </div>
        )}

        <div style={{ padding: 12, display: 'flex', gap: 8 }}>
          <textarea
            ref={inputRef}
            className="pixel-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            style={{ flex: 1, resize: 'none', fontFamily: 'inherit' }}
            disabled={inputDisabled}
          />
          <button
            className="pixel-btn pixel-btn-primary"
            onClick={handleSend}
            disabled={!input.trim() || inputDisabled}
            style={{ alignSelf: 'flex-end' }}
          >
            {currentQuestion ? `A${currentQuestionIndex + 1}` : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: PlanningMessage }) {
  const isUser = message.role === 'user';

  let content = message.content;
  let questions: string[] | null = null;

  if (!isUser) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.status === 'questions' && Array.isArray(parsed.questions)) {
          questions = parsed.questions;
          content = '';
        }
      }
    } catch {
      // render as plain text
    }
  }

  if (questions) return null;

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        className="pixel-border"
        style={{
          maxWidth: '85%',
          padding: '8px 12px',
          background: isUser ? '#1a3a5c' : '#2a2a3e',
        }}
      >
        <div className="pixel-text" style={{ fontSize: 5, color: '#888', marginBottom: 4 }}>
          {isUser ? 'YOU' : 'PLANNER'}
        </div>
        <div className="pixel-text" style={{ fontSize: 6, whiteSpace: 'pre-wrap' }}>
          {content}
        </div>
      </div>
    </div>
  );
}
