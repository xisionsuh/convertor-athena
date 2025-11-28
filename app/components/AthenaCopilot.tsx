'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AthenaCopilotProps {
  sessions: any[];
  selectedSessionId: string | null;
  selectedProjectId: string | null;
  projectName?: string | null;
  onTranscribe: (sessionId: string) => Promise<void>;
  onSummarize: (sessionId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCreateMemo: () => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  onOpenChange?: (isOpen: boolean) => void;
  onNewProjectChat?: (projectId: string) => void;
}

export default function AthenaCopilot({
  sessions,
  selectedSessionId,
  selectedProjectId,
  projectName,
  onTranscribe,
  onSummarize,
  onDeleteSession,
  onSelectSession,
  onCreateMemo,
  showToast,
  onOpenChange,
  onNewProjectChat,
}: AthenaCopilotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [sessionId, setSessionId] = useState<string>('');
  const [userId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      let stored = localStorage.getItem('athena-user-id');
      if (!stored) {
        stored = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('athena-user-id', stored);
      }
      return stored;
    }
    return `user-${Date.now()}`;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false); // 중복 호출 방지
  const lastSentMessageRef = useRef<string>(''); // 마지막 전송된 메시지 추적
  const lastSentTimeRef = useRef<number>(0); // 마지막 전송 시간 추적
  const isComposingRef = useRef(false); // 한글 IME 입력 중 추적
  const abortControllerRef = useRef<AbortController | null>(null); // 요청 취소용

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const loadSessionMessages = useCallback(async (targetSessionId: string) => {
    try {
      const response = await fetch(`/api/athena/session/${targetSessionId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.messages) {
          setMessages(data.messages.map((m: any) => ({
            id: m.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
          })));
        }
      }
    } catch (error) {
      console.error('Failed to load session messages:', error);
    }
  }, []);

  const initializeSession = useCallback(async (newSessionId: string, forProjectId?: string | null) => {
    try {
      const title = forProjectId && projectName
        ? `${projectName} - 채팅`
        : '회의녹음변환기 코파일럿';

      const response = await fetch('/api/athena/session/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title,
          projectId: forProjectId || null
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.sessionId) {
          setSessionId(data.sessionId);
          return data.sessionId;
        }
      }
      // API가 sessionId를 반환하지 않거나 실패한 경우 생성한 ID 사용
      setSessionId(newSessionId);
      return newSessionId;
    } catch (error) {
      console.error('Session initialization error:', error);
      // 에러 발생 시에도 생성한 ID 사용
      setSessionId(newSessionId);
      return newSessionId;
    }
  }, [userId, projectName]);

  // 세션 ID 초기화 및 선택된 세션 로드
  useEffect(() => {
    if (selectedSessionId) {
      loadSessionMessages(selectedSessionId);
      setSessionId(selectedSessionId);
    } else {
      setMessages([]);
      if (userId) {
        const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setSessionId(newSessionId);
        initializeSession(newSessionId);
      }
    }
  }, [selectedSessionId, userId, loadSessionMessages, initializeSession]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }, 0);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 고유 ID 생성 함수
  const generateUniqueId = () => {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // 기존 파일에 추가
      setSelectedFiles(prev => [...prev, ...files]);
      showToast(`${files.length}개 파일이 첨부되었습니다.`, 'success');
    }
  };

  const handleSend = async () => {
    // 먼저 ref를 체크하고 즉시 설정 (동기적으로)
    if (isSendingRef.current) {
      console.log('메시지 전송 중복 방지: 이미 전송 중');
      return;
    }

    const messageContent = input.trim();
    const now = Date.now();

    // 중복 호출 방지 - 여러 조건 확인
    const isDuplicate =
      !messageContent ||
      isLoading ||
      !sessionId ||
      (messageContent === lastSentMessageRef.current && now - lastSentTimeRef.current < 3000); // 3초 내 동일 메시지 중복 방지

    if (isDuplicate) {
      console.log('메시지 전송 중복 방지:', {
        messageContent,
        isLoading,
        isSending: isSendingRef.current,
        isDuplicateMessage: messageContent === lastSentMessageRef.current,
        timeSinceLastSend: now - lastSentTimeRef.current
      });
      return;
    }

    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // 전송 상태 업데이트 (즉시 설정하여 중복 방지)
    isSendingRef.current = true;
    lastSentMessageRef.current = messageContent;
    lastSentTimeRef.current = now;

    // 입력 필드 즉시 초기화 (중복 전송 방지)
    setInput('');

    const userMessage: Message = {
      id: generateUniqueId(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('sessionId', sessionId);
      formData.append('message', messageContent);
      if (selectedProjectId) {
        formData.append('projectId', selectedProjectId);
      }

      // 파일 추가
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('/api/athena/chat/stream', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current?.signal,
      });

      // 파일 전송 후 초기화
      setSelectedFiles([]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const assistantMessageId = generateUniqueId();
      let assistantContent = '';

      // 초기 assistant 메시지 추가
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                setIsLoading(false);
                continue;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'error') {
                  throw new Error(parsed.error);
                } else if (parsed.type === 'chunk') {
                  assistantContent += parsed.content;
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                } else if (parsed.type === 'metadata') {
                  // 메타데이터 처리
                  if (parsed.data?.strategy === 'sequential' || parsed.data?.strategy === 'debate' || parsed.data?.strategy === 'voting') {
                    const agentNames = parsed.data.agentsUsed?.join(', ') || 'AI';
                    assistantContent += `\n\n🔄 **${parsed.data.strategy === 'sequential' ? '순차 분석' : parsed.data.strategy === 'debate' ? '토론 모드' : '투표 모드'} 시작**\n사용 모델: ${agentNames}\n\n`;
                    setMessages(prev => prev.map(msg =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: assistantContent }
                        : msg
                    ));
                  }
                } else if (parsed.type === 'step_start') {
                  // Sequential 모드 단계 시작
                  assistantContent += `\n\n---\n\n### 🤖 ${parsed.agent} 분석 중... (${parsed.step}/${parsed.total || '?'})\n\n`;
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                } else if (parsed.type === 'tool_result') {
                  // 도구 실행 결과 처리
                  assistantContent += `\n\n[도구 실행 결과]\n${JSON.stringify(parsed.data, null, 2)}`;
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                }
              } catch {
                // JSON 파싱 실패는 무시 (스트리밍 중간 데이터일 수 있음)
              }
            }
          }
        }
      }

      // 앱 컨트롤 명령 처리는 사용자 입력에만 적용
      // AI 응답에 "요약", "변환" 등 키워드가 있으면 잘못된 에러가 발생하므로 제거
      // await processAppControlCommands(assistantContent);

    } catch (error: any) {
      console.error('Chat error:', error);
      showToast(`오류: ${error.message}`, 'error');
      setIsLoading(false);
    } finally {
      isSendingRef.current = false;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      console.log('선택된 파일:', newFiles.map(f => ({ name: f.name, type: f.type, size: f.size })));
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
    // input 값 초기화 (같은 파일을 다시 선택할 수 있도록)
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      {/* Reopen Button */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            onOpenChange?.(true);
          }}
          className="fixed left-4 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-3 rounded-r-xl shadow-lg hover:bg-primary/90 transition-all z-50 flex items-center gap-2 animate-slide-in-right"
          title="Open Copilot"
        >
          <span className="text-xl">🧠</span>
          <span className="font-semibold">Copilot</span>
        </button>
      )}

      <div className={`${isOpen ? 'flex-1' : 'w-0'} transition-all duration-300 bg-background/50 backdrop-blur-sm flex flex-col h-full relative`}>
        {/* Header */}
        <div className="h-12 md:h-16 px-3 md:px-6 border-b border-border/50 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-7 h-7 md:w-9 md:h-9 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-white text-sm md:text-lg">🧠</span>
            </div>
            <div>
              <h2 className="text-xs md:text-sm font-bold text-foreground">Athena AI</h2>
              <p className="text-[10px] md:text-xs text-muted-foreground truncate max-w-[120px] md:max-w-none">
                {selectedProjectId && projectName ? `📁 ${projectName}` : 'Assistant'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            {selectedProjectId && (
              <button
                onClick={async () => {
                  const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                  setMessages([]);
                  await initializeSession(newSessionId, selectedProjectId);
                  showToast(`${projectName || 'Project'} chat started`, 'success');
                  onNewProjectChat?.(selectedProjectId);
                }}
                className="px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-full transition-colors"
              >
                <span className="hidden sm:inline">+ New Chat</span>
                <span className="sm:hidden">+</span>
              </button>
            )}
            <button
              onClick={() => {
                const newIsOpen = !isOpen;
                setIsOpen(newIsOpen);
                onOpenChange?.(newIsOpen);
              }}
              className="p-1.5 md:p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted hidden md:block"
            >
              {isOpen ? '◀' : '▶'}
            </button>
          </div>
        </div>

        {isOpen && (
          <>
            {/* Messages Area */}
            <div
              ref={messagesContainerRef}
              className={`flex-1 overflow-y-auto min-h-0 relative p-4 space-y-6 custom-scrollbar ${isDraggingOver ? 'bg-primary/5' : ''
                }`}
              style={{ overflowAnchor: 'none' }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Drag Overlay */}
              {isDraggingOver && (
                <div className="absolute inset-4 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-2xl animate-fade-in">
                  <div className="text-center">
                    <div className="text-4xl mb-3 animate-bounce">📎</div>
                    <p className="text-primary font-bold text-lg">Drop files here</p>
                    <p className="text-muted-foreground text-sm">PDF, Images, Text, Audio</p>
                  </div>
                </div>
              )}

              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-0 animate-fade-in" style={{ animationDelay: '0.2s', opacity: 1 }}>
                  <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-2xl flex items-center justify-center mb-6">
                    <span className="text-3xl">🧠</span>
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">How can I help you?</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    I can help you transcribe audio, summarize meetings, analyze documents, or just chat.
                  </p>
                </div>
              )}

              {messages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mt-1 ${isUser
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white'
                        : 'bg-gradient-to-br from-primary to-purple-600 text-white'
                        }`}>
                        <span className="text-xs font-bold">{isUser ? 'U' : 'A'}</span>
                      </div>

                      {/* Bubble */}
                      <div className={`group relative px-5 py-3.5 shadow-sm ${isUser
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                        : 'bg-card border border-border/50 text-card-foreground rounded-2xl rounded-tl-sm'
                        }`}>
                        <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : 'dark:prose-invert'}`}>
                          {isUser ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                          ) : (
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                code({ inline, className, children, ...props }: any) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  const codeString = String(children).replace(/\n$/, '');
                                  if (!inline && match && match[1] === 'mcp_tool') return null;
                                  if (!inline && match) {
                                    return (
                                      <div className="relative group/code my-4 rounded-lg overflow-hidden border border-border/50 bg-muted/50">
                                        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/80 border-b border-border/50">
                                          <span className="text-xs font-mono text-muted-foreground">{match[1]}</span>
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(codeString);
                                              showToast('Copied to clipboard', 'success');
                                            }}
                                            className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors"
                                            title="Copy code"
                                          >
                                            📋
                                          </button>
                                        </div>
                                        <div className="overflow-x-auto">
                                          <SyntaxHighlighter
                                            style={vscDarkPlus}
                                            language={match[1]}
                                            PreTag="div"
                                            customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
                                            {...props}
                                          >
                                            {codeString}
                                          </SyntaxHighlighter>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs" {...props}>{children}</code>;
                                },
                                p: ({ children }) => <p className="mb-3 last:mb-0 leading-7">{children}</p>,
                                a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{children}</a>,
                                ul: ({ children }) => <ul className="list-disc list-outside mb-4 ml-4 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-outside mb-4 ml-4 space-y-1">{children}</ol>,
                                blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-4 italic bg-primary/5 rounded-r">{children}</blockquote>,
                                table: ({ children }) => <div className="overflow-x-auto my-4 rounded border border-border"><table className="min-w-full divide-y divide-border">{children}</table></div>,
                                th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold bg-muted uppercase tracking-wider">{children}</th>,
                                td: ({ children }) => <td className="px-3 py-2 text-sm border-t border-border">{children}</td>,
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          )}
                        </div>
                        <span className={`text-[10px] absolute bottom-1 right-3 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex justify-start animate-fade-in">
                  <div className="flex gap-3 max-w-[85%]">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm mt-1">
                      <span className="text-white text-xs font-bold">A</span>
                    </div>
                    <div className="bg-card border border-border/50 px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                        <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-2 md:p-4 bg-background/80 backdrop-blur-md border-t border-border/50">
              {/* Selected Files */}
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1 md:gap-2 mb-2 md:mb-3 animate-fade-in">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-1 md:gap-2 text-[10px] md:text-xs bg-muted px-2 md:px-3 py-1 md:py-1.5 rounded-full border border-border">
                      <span className="text-sm md:text-lg">{file.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                      <span className="max-w-[80px] md:max-w-[150px] truncate font-medium">{file.name}</span>
                      <button onClick={() => removeFile(index)} className="ml-0.5 md:ml-1 text-muted-foreground hover:text-destructive transition-colors">×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative flex items-end gap-1 md:gap-2 bg-muted/50 border border-border/50 rounded-xl md:rounded-2xl p-1.5 md:p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 md:p-2 text-muted-foreground hover:text-primary hover:bg-background rounded-lg md:rounded-xl transition-colors"
                  title="Attach file"
                >
                  <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <textarea
                  ref={inputRef as any}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onCompositionStart={() => { isComposingRef.current = true; }}
                  onCompositionEnd={() => { isComposingRef.current = false; }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask anything..."
                  className="flex-1 bg-transparent border-none focus:ring-0 py-2 md:py-2.5 max-h-24 md:max-h-32 min-h-[36px] md:min-h-[44px] resize-none custom-scrollbar text-sm"
                  rows={1}
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 96)}px`;
                  }}
                  disabled={isLoading}
                />

                <button
                  onClick={handleSend}
                  disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
                  className="p-1.5 md:p-2 bg-primary text-primary-foreground rounded-lg md:rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </div>
              <div className="text-center mt-1 md:mt-2">
                <p className="text-[9px] md:text-[10px] text-muted-foreground">AI can make mistakes. Check important info.</p>
              </div>
            </div>
          </>
        )}
      </div >
    </>
  );
}
