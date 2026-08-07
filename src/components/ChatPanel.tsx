'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ToastProvider';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface ChatPanelProps {
  jobId?: string;
}

interface ThreadListItem {
  id: string;
  context_type: 'general' | 'job' | 'candidate';
  context_id: string | null;
  created_at: string;
  last_message: string;
  last_active: string;
}

export default function ChatPanel({ jobId }: ChatPanelProps) {
  const { error: toastError } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Fetch past threads for company sidebar
  const loadThreads = async () => {
    try {
      const res = await fetch('/api/chat');
      if (res.ok) {
        const data = await res.json();
        setThreads(data);
      }
    } catch (err) {
      console.error('Failed to load chat threads:', err);
    }
  };

  // Load thread list on open
  useEffect(() => {
    if (isOpen) {
      loadThreads();
    }
  }, [isOpen]);

  // Load messages for a specific thread
  const selectThread = async (selectedId: string) => {
    setLoading(true);
    setShowHistory(false);
    try {
      const res = await fetch(`/api/chat?threadId=${selectedId}`);
      if (!res.ok) throw new Error('Failed to load thread messages');
      const data = await res.json();
      setThreadId(data.thread.id);
      setMessages(data.messages);
    } catch (err: any) {
      toastError(err.message || 'Could not load conversation history.');
    } finally {
      setLoading(false);
    }
  };

  // Reset to start a new chat
  const startNewChat = () => {
    setThreadId(null);
    setMessages([]);
    setShowHistory(false);
  };

  // Handle message send
  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMsgText = textToSend.trim();
    setInput('');
    setLoading(true);

    // 1. Add user message locally
    const userMessage: Message = { role: 'user', content: userMsgText };
    setMessages(prev => [...prev, userMessage]);

    // 2. Add empty assistant placeholder for streaming
    const placeholderMessage: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, placeholderMessage]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsgText,
          threadId,
          jobId: jobId || null
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to send message');
      }

      if (!res.body) throw new Error('Response stream unavailable');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunkStr = decoder.decode(value);
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.substring(6).trim();
              if (!jsonStr) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.text) {
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === 'assistant') {
                      last.content += parsed.text;
                    }
                    return updated;
                  });
                }
                if (parsed.threadId && !threadId) {
                  setThreadId(parsed.threadId);
                }
                if (parsed.done) {
                  done = true;
                }
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
              } catch (e) {
                // Ignore parsing errors for partial json chunks
              }
            }
          }
        }
      }
    } catch (err: any) {
      toastError(err.message || 'Failed to get AI response.');
      // Remove the placeholder message if it failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
      loadThreads(); // Refresh threads list
    }
  };

  // Quick suggestion prompts
  const suggestions = jobId 
    ? [
        'Who is the top candidate for this job?',
        'Summarize ratings & scorecards',
        'List scheduled interviews'
      ]
    : [
        'List all open job postings',
        'Show my company dashboard activity',
        'What interviews are scheduled today?'
      ];

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer z-50 border border-violet-500/20"
        title="Open HireFlow Copilot"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Main Drawer Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[600px] max-h-[80vh] rounded-2xl bg-slate-900/95 border border-slate-800/90 shadow-2xl backdrop-blur-md flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-2">
              <div className="h-6 w-6 rounded bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center">
                <span className="font-display font-bold text-white text-xs">C</span>
              </div>
              <span className="font-display font-bold text-sm text-white">HireFlow Copilot</span>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-all cursor-pointer ${
                  showHistory 
                    ? 'bg-violet-600/20 border-violet-500/50 text-violet-300' 
                    : 'border-slate-850 bg-slate-950/30 text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                History
              </button>
              <button
                onClick={startNewChat}
                className="text-xs px-2.5 py-1 rounded-lg border border-slate-850 bg-slate-950/30 text-slate-400 hover:text-white hover:bg-slate-900 font-semibold cursor-pointer"
                title="New Chat"
              >
                New
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-hidden relative flex flex-col min-h-0 bg-slate-900/40">
            {showHistory ? (
              /* Threads History List */
              <div className="absolute inset-0 bg-slate-900 p-4 overflow-y-auto space-y-3">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Previous Conversations</h3>
                {threads.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">No recent conversations found.</p>
                ) : (
                  <div className="space-y-2">
                    {threads.map(t => (
                      <div
                        key={t.id}
                        onClick={() => selectThread(t.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer text-left text-xs ${
                          threadId === t.id 
                            ? 'bg-violet-950/20 border-violet-900/40 text-white' 
                            : 'bg-slate-950/20 border-slate-900 hover:bg-slate-950/40 text-slate-300'
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium mb-1">
                          <span className="uppercase tracking-wider font-semibold">
                            {t.context_type === 'job' ? 'Job Context' : 'General'}
                          </span>
                          <span>{new Date(t.last_active).toLocaleDateString()}</span>
                        </div>
                        <p className="truncate font-medium text-slate-200">{t.last_message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Messages Area */
              <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col min-h-0">
                {messages.length === 0 && (
                  <div className="my-auto text-center px-4 flex flex-col items-center">
                    <div className="h-10 w-10 rounded-xl bg-violet-950/40 border border-violet-900/20 flex items-center justify-center text-violet-400 mb-3 shadow-inner">
                      ✨
                    </div>
                    <p className="text-xs font-semibold text-slate-300">How can I help you today?</p>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      I can help search candidates, check scores, list open jobs, and draft emails using database context.
                    </p>
                  </div>
                )}

                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex flex-col max-w-[85%] ${
                      msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
                    }`}
                  >
                    <div
                      className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-violet-600 text-white rounded-br-none shadow-md'
                          : 'bg-slate-800/80 text-slate-200 border border-slate-800/50 rounded-bl-none shadow-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {/* Loading indicator with tool execution helper */}
                {loading && messages.length > 0 && messages[messages.length - 1].content === '' && (
                  <div className="self-start flex items-center space-x-2.5 bg-slate-800/40 border border-slate-800/40 p-3 rounded-2xl rounded-bl-none">
                    <span className="flex space-x-1">
                      <span className="h-1.5 w-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="h-1.5 w-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="h-1.5 w-1.5 bg-violet-400 rounded-full animate-bounce"></span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Invoking database tools...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Quick suggestions footer */}
          {!showHistory && messages.length === 0 && (
            <div className="px-4 py-2 border-t border-slate-800/50 flex flex-wrap gap-1.5 shrink-0 bg-slate-950/20">
              {suggestions.map((text, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(text)}
                  className="text-[10px] font-medium text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer"
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          {/* Footer Input Form */}
          {!showHistory && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="p-3 border-t border-slate-800 flex items-center space-x-2 bg-slate-950/30 shrink-0"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask HireFlow Copilot..."
                disabled={loading}
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="h-8.5 w-8.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <svg className="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
