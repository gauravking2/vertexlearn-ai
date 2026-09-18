import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useCourse } from '@/hooks/useCourses';
import { useCreateChatSession, useSendMessage, useSessionMessages, useUpdateSessionMode } from '@/hooks/useAI';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Send, Bot, User, BookOpen, AlertCircle } from 'lucide-react';
import { AIMode } from '@/types';

interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { ref: string; lectureTitle: string }[];
  createdAt: string;
}

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

  const handleSendMessage = () => {
    if (!message.trim() || !activeSessionId) return;
    const text = message.trim();
    resetSend();
    setPendingUserMessage(text);
    setMessage('');
    sendMessage(
      { sessionId: activeSessionId, message: text },
      {
        onSuccess: () => setPendingUserMessage(null),
        // Clear the stuck pending bubble, restore the text for one-click retry.
        onError: () => {
          setPendingUserMessage(null);
          setMessage(text);
        },
      }
    );
  };

  const handleDismissSendError = () => {
    resetSend();
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
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <Bot className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-serif text-[#1F2421]">
                AI <span className="italic text-[#C4612F]">Tutor</span>
              </h1>
              <p className="text-sm text-[#5C635D]">{course.title}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-[#5C635D]">Mode:</span>
            {(['beginner', 'intermediate', 'advanced'] as AIMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                  selectedMode === mode
                    ? 'bg-[#A94E22] text-white'
                    : 'bg-[#FBF9F5] text-[#5C635D] hover:bg-[#F2E3D6]'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="flex-1 flex flex-col overflow-hidden">
        {!activeSessionId ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 bg-[#F2E3D6] rounded-full flex items-center justify-center mb-4">
              <Bot className="text-[#C4612F]" size={28} />
            </div>
            <h3 className="text-lg font-serif text-[#1F2421] mb-2">Course Tutor</h3>
            <p className="text-sm text-[#5C635D] mb-4 text-center max-w-md">
              Ask anything about {course.title}. Answers are grounded in the indexed course material.
            </p>
            <Button onClick={handleCreateSession} loading={creatingSession}>
              Start tutoring session
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto mb-4 space-y-4">
              {loadingMessages && <LoadingSpinner text="Loading messages..." />}

              {messages.length === 0 && !loadingMessages && !pendingUserMessage && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 bg-[#F2E3D6] rounded-full flex items-center justify-center mb-4">
                    <Bot className="text-[#C4612F]" size={28} />
                  </div>
                  <h3 className="text-lg font-serif text-[#1F2421] mb-2">Start a conversation</h3>
                  <p className="text-sm text-[#5C635D] max-w-md">
                    Ask me anything about {course.title}. If the course material does not cover it, I will say so.
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 bg-[#F2E3D6] rounded-full flex items-center justify-center shrink-0">
                      <Bot className="text-[#C4612F]" size={16} />
                    </div>
                  )}
                  <div
                    className={`max-w-[70%] px-4 py-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-[#A94E22] text-white'
                        : 'bg-[#FBF9F5] text-[#1F2421]'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#E7E1D7] space-y-1">
                        <p className="text-xs font-medium text-[#5C635D]">Sources:</p>
                        {msg.sources.map((s, sIdx) => (
                          <div key={sIdx} className="flex items-start gap-2 text-xs">
                            <BookOpen size={12} className="text-[#C4612F] mt-0.5" />
                            <span className="text-[#5C635D]">{s.ref} — {s.lectureTitle}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.content.toLowerCase().includes('could not find') && (
                      <div className="mt-3 pt-3 border-t border-[#E7E1D7] flex items-start gap-2">
                        <AlertCircle size={14} className="text-yellow-600 mt-0.5" />
                        <p className="text-xs text-[#5C635D]">Grounded limitation: the tutor could not confirm this from course material.</p>
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 bg-[#1F2421] rounded-full flex items-center justify-center shrink-0">
                      <User className="text-white" size={16} />
                    </div>
                  )}
                </div>
              ))}

              {pendingUserMessage && (
                <div className="flex gap-3 justify-end">
                  <div className="bg-[#A94E22] text-white max-w-[70%] px-4 py-3 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{pendingUserMessage}</p>
                  </div>
                  <div className="w-8 h-8 bg-[#1F2421] rounded-full flex items-center justify-center shrink-0">
                    <User className="text-white" size={16} />
                  </div>
                </div>
              )}

              {sendingMessage && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-[#F2E3D6] rounded-full flex items-center justify-center shrink-0">
                    <Bot className="text-[#C4612F]" size={16} />
                  </div>
                  <div className="bg-[#FBF9F5] px-4 py-3 rounded-lg">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-[#C4612F] rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-[#C4612F] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-[#C4612F] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              )}
              {sendFailed && !sendingMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
                  <p className="text-sm text-red-800 mb-2">
                    The tutor is unavailable right now ({getApiErrorMessage(sendError)}). Your question was kept below — try sending it again.
                  </p>
                  <Button size="sm" variant="outline" onClick={handleDismissSendError}>Dismiss</Button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-[#E7E1D7] pt-4">
              <div className="flex gap-2">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask a question about the course..."
                  className="flex-1 px-4 py-2.5 bg-[#FBF9F5] border border-[#E7E1D7] rounded-lg text-[#1F2421] placeholder:text-[#5C635D] focus:outline-none focus:ring-2 focus:ring-[#C4612F] resize-none"
                  rows={2}
                  disabled={sendingMessage}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || sendingMessage}
                  className="self-end"
                  aria-label="Send message"
                >
                  <Send size={18} aria-hidden="true" />
                </Button>
              </div>
              <p className="text-xs text-[#5C635D] mt-2">
                Answers use only the indexed course material. Press Enter to send, Shift+Enter for a new line.
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};
