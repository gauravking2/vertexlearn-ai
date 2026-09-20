import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useCourse } from '@/hooks/useCourses';
import { useCreateChatSession, useSendMessage, useSessionMessages, useUpdateSessionMode } from '@/hooks/useAI';
import { aiService } from '@/services/aiService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { getAiTutorErrorMessage } from '@/components/common/apiError';
import { Send, Bot, User, BookOpen, AlertCircle, Sparkles, RefreshCw, ShieldCheck } from 'lucide-react';
import { AIMode } from '@/types';

interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { ref: string; lectureTitle: string }[];
  createdAt: string;
}

const STARTER_PROMPTS = [
  'Explain this topic in simple terms',
  'Give me an example',
  'What should I revise before the quiz?',
  'Summarize the key concepts',
];

export const AITutorPage = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: course } = useCourse(courseId);
  const { mutate: createSession, isPending: creatingSession } = useCreateChatSession();
  const { mutate: sendMessage, isPending: sendingMessage, isError: sendFailed, error: sendError, reset: resetSend } = useSendMessage();
  const { mutate: updateMode } = useUpdateSessionMode();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { data: messagesData, isLoading: loadingMessages } = useSessionMessages(activeSessionId ?? undefined);

  const [message, setMessage] = useState('');
  const [selectedMode, setSelectedMode] = useState<AIMode>('intermediate');
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  // Guards exactly-once send: Enter key + button click can otherwise double
  // fire while the mutation is pending (duplicate user bubbles observed).
  const sendGuard = useRef(false);
  // Staged loading UX: "Thinking" 0–8s, then "Waking AI Tutor" until the
  // bounded client timeout settles. A stuck-transport safety net swaps the
  // dots for a retry warning if the mutation ever hangs without settling.
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stuckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wakingPhase, setWakingPhase] = useState(false);
  const [sendStuck, setSendStuck] = useState(false);
  useEffect(() => () => {
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
  }, []);

  // Pre-warm: opening the Tutor page pings the AI service in the background
  // (server-to-server only, bounded 25s) so a cold instance boots before the
  // first message. Fire-and-forget: never blocks render, never retries.
  useEffect(() => {
    let cancelled = false;
    aiService.warmup().catch(() => undefined).finally(() => undefined);
    void cancelled;
  }, []);

  const messages: UIMessage[] = (messagesData?.data ?? []).map((m: any) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    sources: Array.isArray(m.sources) ? m.sources : JSON.parse(m.sources ?? '[]'),
    createdAt: m.createdAt,
  }));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingUserMessage, sendingMessage]);

  const handleCreateSession = () => {
    if (courseId) {
      createSession(
        { courseId, mode: selectedMode },
        { onSuccess: (data) => setActiveSessionId(data.id) }
      );
    }
  };

  const clearSendTimers = () => {
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    phaseTimer.current = null;
    stuckTimer.current = null;
  };

  const sendText = (text: string) => {
    // Exactly-once: ignore re-entrant sends (Enter + click, double-tap)
    // while a request is in flight or the guard is held.
    if (!activeSessionId || !text.trim() || sendGuard.current || sendingMessage) return;
    sendGuard.current = true;
    resetSend();
    setSendStuck(false);
    setWakingPhase(false);
    clearSendTimers();
    // 0–8s "Thinking", then "Waking AI Tutor…" until settle.
    phaseTimer.current = setTimeout(() => setWakingPhase(true), 8000);
    // Stuck-transport net (client timeout 140s + margin): swap dots for a
    // retry warning instead of an endless typing indicator.
    stuckTimer.current = setTimeout(() => setSendStuck(true), 150000);
    setPendingUserMessage(text);
    setMessage('');
    sendMessage(
      { sessionId: activeSessionId, message: text },
      {
        onSuccess: () => {
          clearSendTimers();
          sendGuard.current = false;
          setSendStuck(false);
          setWakingPhase(false);
          setPendingUserMessage(null);
        },
        // Clear the stuck pending bubble, restore the text for one-click retry.
        onError: () => {
          clearSendTimers();
          sendGuard.current = false;
          setSendStuck(false);
          setWakingPhase(false);
          setPendingUserMessage(null);
          setMessage(text);
        },
      }
    );
  };

  const handleSendMessage = () => sendText(message);

  const handleDismissSendError = () => {
    resetSend();
    setSendStuck(false);
    setWakingPhase(false);
    sendGuard.current = false;
    clearSendTimers();
    setPendingUserMessage(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleModeChange = (mode: AIMode) => {
    setSelectedMode(mode);
    if (activeSessionId) updateMode({ sessionId: activeSessionId, mode });
  };

  if (!course) {
    return <LoadingSpinner text="Loading course..." />;
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col space-y-4 lg:h-[calc(100vh-8rem)]">
      <Card variant="featured" className="!p-4 sm:!p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center shadow-glow overflow-hidden" aria-hidden="true">
              <span className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.30),transparent_55%)]" />
              <Bot className="relative text-white" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-serif text-[#1F2421] dark:text-[#ece9e2]">
                AI <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Tutor</span>
              </h1>
              <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen size={12} aria-hidden="true" />
                  {course.title}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Mode:</span>
            <div role="group" aria-label="Explanation mode" className="flex gap-1.5">
              {(['beginner', 'intermediate', 'advanced'] as AIMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  aria-pressed={selectedMode === mode}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ring-1 ring-inset ${
                    selectedMode === mode
                      ? 'vl-ai-chip text-white ring-transparent shadow-sm font-medium'
                      : 'bg-[#FBF9F5] dark:bg-[#23261f] text-[#5C635D] dark:text-[#b9beb4] ring-[#E7E1D7] dark:ring-[#2c2f2a] hover:bg-[#F2E3D6] dark:hover:bg-[#2c241c] hover:text-[#8A3E1C] dark:hover:text-[#e8a06f]'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card variant="elevated" className="flex min-h-[34rem] flex-1 flex-col overflow-hidden !p-3 sm:!p-5">
        {!activeSessionId ? (
          <div className="flex flex-col items-center justify-center h-full animate-fade-up px-4">
            <div className="relative mb-5">
              <div
                aria-hidden="true"
                className="absolute -inset-4 rounded-3xl bg-[radial-gradient(circle,rgba(124,58,237,0.14),transparent_70%)]"
              />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center shadow-glow overflow-hidden">
                <span className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.30),transparent_55%)]" aria-hidden="true" />
                <Sparkles className="relative text-white" size={28} />
              </div>
            </div>
            <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-2">Course Tutor</h3>
            <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-5 text-center max-w-md leading-relaxed">
              Ask anything about {course.title}. Answers are grounded in the indexed course material with source citations.
            </p>
            <Button onClick={handleCreateSession} loading={creatingSession} className="vl-ai-chip !bg-none hover:!bg-none">
              Start tutoring session
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1">
              {loadingMessages && <LoadingSpinner text="Loading messages..." />}

              {messages.length === 0 && !loadingMessages && !pendingUserMessage && (
                <div className="flex flex-col items-center justify-center h-full text-center animate-fade-up px-4">
                  <div className="relative mb-4">
                    <div
                      aria-hidden="true"
                      className="absolute -inset-4 rounded-3xl bg-[radial-gradient(circle,rgba(124,58,237,0.14),transparent_70%)]"
                    />
                    <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center shadow-glow overflow-hidden">
                      <span className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.30),transparent_55%)]" aria-hidden="true" />
                      <Sparkles className="relative text-white" size={24} />
                    </div>
                  </div>
                  <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-2">Start a conversation</h3>
                  <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] max-w-md mb-5 leading-relaxed">
                    Ask me anything about {course.title}. If the course material does not cover it, I will say so.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => sendText(prompt)}
                        className="text-left text-sm px-3.5 py-2.5 rounded-xl border border-[#E7E1D7] dark:border-[#2c2f2a] bg-[#FBF9F5] dark:bg-[#23261f] text-[#5C635D] dark:text-[#b9beb4] hover:border-[#7C3AED] hover:text-[#7C3AED] dark:hover:border-[#8B5CF6] dark:hover:text-[#A78BFA] transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 vl-msg-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center shrink-0 shadow-soft" aria-hidden="true">
                      <Bot className="text-white" size={16} />
                    </div>
                  )}
                  <div
                    className={`max-w-[86%] px-4 py-3 rounded-2xl sm:max-w-[76%] lg:max-w-[68%] ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] text-white rounded-br-md shadow-soft'
                        : 'bg-[#FBF9F5] dark:bg-[#23261f] text-[#1F2421] dark:text-[#ece9e2] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#E7E1D7] dark:border-[#2c2f2a] space-y-1">
                        <p className="text-xs font-medium text-[#5C635D] dark:text-[#b9beb4] flex items-center gap-1.5">
                          <BookOpen size={12} aria-hidden="true" /> Sources:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((s, sIdx) => (
                            <span
                              key={sIdx}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#F2E3D6] dark:bg-[#2c241c] text-[#8A3E1C] dark:text-[#e8a06f] ring-1 ring-inset ring-[#C4612F]/15 dark:ring-[#e8a06f]/20"
                              title={s.ref}
                            >
                              {s.ref} — {s.lectureTitle}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.content.toLowerCase().includes('could not find') && (
                      <div className="mt-3 pt-3 border-t border-[#E7E1D7] dark:border-[#2c2f2a] flex items-start gap-2">
                        <AlertCircle size={14} className="text-yellow-600 dark:text-yellow-400 mt-0.5" aria-hidden="true" />
                        <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">Grounded limitation: the tutor could not confirm this from course material.</p>
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-[#1F2421] dark:bg-[#ece9e2] flex items-center justify-center shrink-0" aria-hidden="true">
                      <User className="text-white dark:text-[#12140f]" size={16} />
                    </div>
                  )}
                </div>
              ))}

              {pendingUserMessage && (
                <div className="flex gap-3 vl-msg-in justify-end">
                  <div className="max-w-[86%] rounded-2xl rounded-br-md bg-gradient-to-r from-[#6851C8] to-[#5140A8] px-4 py-3 text-white shadow-soft sm:max-w-[76%] lg:max-w-[68%]">
                    <p className="text-sm whitespace-pre-wrap">{pendingUserMessage}</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-[#1F2421] dark:bg-[#ece9e2] flex items-center justify-center shrink-0" aria-hidden="true">
                    <User className="text-white dark:text-[#12140f]" size={16} />
                  </div>
                </div>
              )}

              {sendingMessage && !sendStuck && (
                <div className="flex gap-3 vl-msg-in">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center shrink-0" aria-hidden="true">
                    <Bot className="text-white" size={16} />
                  </div>
                  <div className="bg-[#FBF9F5] dark:bg-[#23261f] px-4 py-3.5 rounded-2xl rounded-bl-md border border-[#E7E1D7] dark:border-[#2c2f2a] flex flex-col gap-1.5">
                    <div className="flex gap-1.5" aria-label={wakingPhase ? 'Waking AI Tutor' : 'Tutor is thinking'} role="status">
                      <span className="w-2 h-2 bg-[#7C3AED] rounded-full vl-dot" />
                      <span className="w-2 h-2 bg-[#7C3AED] rounded-full vl-dot" />
                      <span className="w-2 h-2 bg-[#7C3AED] rounded-full vl-dot" />
                    </div>
                    <p className="text-xs text-[#5C635D] dark:text-[#b9beb4]">
                      {wakingPhase ? 'Waking AI Tutor… this can take up to a minute on first use.' : 'Thinking…'}
                    </p>
                  </div>
                </div>
              )}
              {sendStuck && sendingMessage && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900 rounded-xl vl-msg-in" role="alert">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                    AI Tutor is taking too long to respond. Your question is kept below — retry once or dismiss.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => pendingUserMessage && sendText(pendingUserMessage)}>
                      <RefreshCw size={14} aria-hidden="true" /> Retry
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleDismissSendError}>Dismiss</Button>
                  </div>
                </div>
              )}
              {sendFailed && !sendingMessage && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl vl-msg-in" role="alert">
                  <p className="text-sm text-red-800 dark:text-red-200 mb-2">
                    {getAiTutorErrorMessage(sendError)} Your question was kept below — try sending it again.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => message.trim() && sendText(message)}>
                      <RefreshCw size={14} aria-hidden="true" /> Retry
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleDismissSendError}>Dismiss</Button>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-[#E7E1D7] dark:border-[#2c2f2a] pt-4">
              <div className="flex gap-2">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask a question about the course..."
                  aria-label="Ask a question about the course"
                  className="flex-1 px-4 py-2.5 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#7C3AED] focus:border-transparent transition-all resize-none"
                  rows={2}
                  disabled={sendingMessage}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || sendingMessage}
                  className="self-end vl-ai-chip !bg-none hover:!bg-none"
                  aria-label="Send message"
                >
                  <Send size={18} aria-hidden="true" />
                </Button>
              </div>
              <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-2 flex items-center gap-1.5">
                <ShieldCheck size={12} aria-hidden="true" />
                Answers use only the indexed course material. Press Enter to send, Shift+Enter for a new line.
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};
