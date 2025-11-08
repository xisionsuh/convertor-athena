'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
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
  onTranscribe: (sessionId: string) => Promise<void>;
  onSummarize: (sessionId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCreateMemo: () => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export default function AthenaCopilot({
  sessions,
  selectedSessionId,
  selectedProjectId,
  onTranscribe,
  onSummarize,
  onDeleteSession,
  onSelectSession,
  onCreateMemo,
  showToast,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false); // 중복 호출 방지
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // 세션 ID 초기화
  useEffect(() => {
    if (!sessionId && userId) {
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      initializeSession(newSessionId);
    }
  }, [userId]);

  const initializeSession = async (newSessionId: string) => {
    try {
      const response = await fetch('/api/athena/session/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title: '회의녹음변환기 코파일럿' }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.sessionId) {
          setSessionId(data.sessionId);
          return;
        }
      }
      // API가 sessionId를 반환하지 않거나 실패한 경우 생성한 ID 사용
      setSessionId(newSessionId);
    } catch (error) {
      console.error('Session initialization error:', error);
      // 에러 발생 시에도 생성한 ID 사용
      setSessionId(newSessionId);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 고유 ID 생성 함수
  const generateUniqueId = () => {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const handleSend = async () => {
    // 중복 호출 방지
    if (!input.trim() || isLoading || !sessionId || isSendingRef.current) return;
    
    isSendingRef.current = true;

    const userMessage: Message = {
      id: generateUniqueId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const messageContent = input.trim();
    setMessages(prev => [...prev, userMessage]);
    setInput('');
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
      });
      
      // 파일 전송 후 초기화
      setSelectedFiles([]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessageId = generateUniqueId();
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
                  // 메타데이터 처리 (필요시)
                } else if (parsed.type === 'tool_result') {
                  // 도구 실행 결과 처리
                  assistantContent += `\n\n[도구 실행 결과]\n${JSON.stringify(parsed.data, null, 2)}`;
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                }
              } catch (e) {
                // JSON 파싱 실패는 무시 (스트리밍 중간 데이터일 수 있음)
              }
            }
          }
        }
      }

      // 앱 컨트롤 명령 처리
      await processAppControlCommands(assistantContent);
      
    } catch (error: any) {
      console.error('Chat error:', error);
      showToast(`오류: ${error.message}`, 'error');
      setIsLoading(false);
    } finally {
      isSendingRef.current = false;
    }
  };

  const processAppControlCommands = async (content: string) => {
    const lowerContent = content.toLowerCase();
    
    // 파일 변환 명령
    if (lowerContent.includes('변환') || lowerContent.includes('transcribe')) {
      if (selectedSessionId) {
        try {
          await onTranscribe(selectedSessionId);
          showToast('파일 변환이 시작되었습니다.', 'info');
        } catch (error) {
          console.error('Transcribe error:', error);
        }
      } else {
        showToast('변환할 파일을 먼저 선택해주세요.', 'error');
      }
    }

    // 회의록 생성 명령
    if (lowerContent.includes('회의록') || lowerContent.includes('요약') || lowerContent.includes('summarize')) {
      if (selectedSessionId) {
        try {
          await onSummarize(selectedSessionId);
          showToast('회의록 생성이 시작되었습니다.', 'info');
        } catch (error) {
          console.error('Summarize error:', error);
        }
      } else {
        showToast('요약할 파일을 먼저 선택해주세요.', 'error');
      }
    }

    // 파일 삭제 명령
    if ((lowerContent.includes('삭제') || lowerContent.includes('delete')) && selectedSessionId) {
      const session = sessions.find(s => s.id === selectedSessionId);
      if (session) {
        onDeleteSession(selectedSessionId);
        showToast('파일이 삭제되었습니다.', 'info');
      }
    }

    // 파일 선택 명령
    const selectMatch = lowerContent.match(/(\d+)번.*파일|파일.*(\d+)/);
    if (selectMatch) {
      const index = parseInt(selectMatch[1] || selectMatch[2]) - 1;
      if (index >= 0 && index < sessions.length) {
        onSelectSession(sessions[index].id);
        showToast(`${index + 1}번 파일을 선택했습니다.`, 'info');
      }
    }

    // 메모 생성 명령
    if (lowerContent.includes('메모') || lowerContent.includes('memo')) {
      onCreateMemo();
      showToast('새 메모가 생성되었습니다.', 'success');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading && !isSendingRef.current) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      {/* 코파일럿이 닫혔을 때 다시 열기 버튼 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed left-4 top-1/2 -translate-y-1/2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 rounded-r-lg shadow-lg hover:from-purple-700 hover:to-blue-700 transition-all z-50 flex items-center gap-2"
          title="코파일럿 열기"
        >
          <span className="text-xl">🧠</span>
          <span className="font-semibold">코파일럿</span>
        </button>
      )}
      
      <div className={`${isOpen ? 'flex-1' : 'w-0'} transition-all duration-300 bg-white shadow-lg overflow-hidden flex flex-col`}>
        {/* 헤더 */}
        <div className="p-4 border-b bg-gradient-to-r from-purple-600 to-blue-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-lg">🧠</span>
              </div>
              <div>
                <h2 className="text-lg font-bold">Athena AI</h2>
                <p className="text-xs text-white/80">코파일럿</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-white/80 hover:text-white transition-colors"
              title="코파일럿 닫기"
            >
              {isOpen ? '◀' : '▶'}
            </button>
          </div>
        </div>

      {isOpen && (
        <>
          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-8 px-4">
                <div className="text-4xl mb-4">🧠</div>
                <p className="text-sm font-medium mb-2">Athena AI 코파일럿</p>
                <p className="text-xs text-gray-400">
                  앱을 제어하고 질문에 답변할 수 있습니다.
                  <br />
                  예: "첫 번째 파일을 변환해줘"
                </p>
              </div>
            )}
            
            {messages.map((message, index) => {
              if (message.role === 'user') {
                // 사용자 메시지: 말풍선 스타일 유지
                return (
                  <div
                    key={message.id}
                    className="flex justify-end px-4 py-2"
                  >
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-blue-600 text-white">
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <p className="text-xs mt-1 text-blue-100">
                        {message.timestamp.toLocaleTimeString('ko-KR', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  </div>
                );
              } else {
                // AI 답변: 화면 전체 활용
                return (
                  <div
                    key={message.id}
                    className="w-full bg-gradient-to-b from-gray-50 to-white border-t border-b border-gray-200"
                  >
                    <div className="px-6 py-6 max-w-none">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-sm">🧠</span>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 mb-2">
                            Athena AI · {message.timestamp.toLocaleTimeString('ko-KR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                          <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-900 prose-strong:text-gray-900 prose-code:text-gray-900 prose-pre:bg-gray-900 prose-pre:text-gray-100">
                            <ReactMarkdown
                              remarkPlugins={[remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                code({ node, inline, className, children, ...props }: any) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  return !inline && match ? (
                                    <SyntaxHighlighter
                                      style={vscDarkPlus}
                                      language={match[1]}
                                      PreTag="div"
                                      className="rounded-lg"
                                      {...props}
                                    >
                                      {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                  ) : (
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  );
                                },
                                p: ({ children }: any) => <p className="mb-4 last:mb-0">{children}</p>,
                                h1: ({ children }: any) => <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0">{children}</h1>,
                                h2: ({ children }: any) => <h2 className="text-xl font-bold mb-3 mt-5 first:mt-0">{children}</h2>,
                                h3: ({ children }: any) => <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h3>,
                                ul: ({ children }: any) => <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>,
                                ol: ({ children }: any) => <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>,
                                li: ({ children }: any) => <li className="ml-4">{children}</li>,
                                blockquote: ({ children }: any) => (
                                  <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4 text-gray-700">
                                    {children}
                                  </blockquote>
                                ),
                                table: ({ children }: any) => (
                                  <div className="overflow-x-auto my-4">
                                    <table className="min-w-full border-collapse border border-gray-300">
                                      {children}
                                    </table>
                                  </div>
                                ),
                                thead: ({ children }: any) => <thead className="bg-gray-100">{children}</thead>,
                                tbody: ({ children }: any) => <tbody>{children}</tbody>,
                                tr: ({ children }: any) => <tr className="border-b border-gray-200">{children}</tr>,
                                td: ({ children }: any) => <td className="border border-gray-300 px-4 py-2">{children}</td>,
                                th: ({ children }: any) => <th className="border border-gray-300 px-4 py-2 font-semibold">{children}</th>,
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
            })}
            
            {isLoading && (
              <div className="w-full bg-gradient-to-b from-gray-50 to-white border-t border-b border-gray-200">
                <div className="px-6 py-6">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm">🧠</span>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* 입력 영역 - 이미지 스타일 */}
          <div className="p-3 border-t bg-gray-100">
            {/* 선택된 파일 표시 */}
            {selectedFiles.length > 0 && (
              <div className="mb-2 space-y-1">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs bg-blue-50 px-2 py-1 rounded">
                    <span className="flex-1 truncate">📎 {file.name}</span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* 입력 바 - 이미지와 동일한 스타일 */}
            <div className="flex items-center gap-2 bg-gray-200 rounded-lg px-2 py-2">
              {/* 왼쪽 버튼들 */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-700 text-sm font-bold"
                  title="파일 첨부"
                >
                  +
                </button>
                <button
                  disabled={isLoading}
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-700"
                  title="웹 검색"
                >
                  🌐
                </button>
                <button
                  disabled={isLoading}
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-700 text-xs font-bold"
                  title="텍스트 서식"
                >
                  A
                </button>
              </div>
              
              {/* 중앙 입력 영역 */}
              <div className="flex-1 bg-gray-300 rounded px-3 py-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isLoading && !isSendingRef.current) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="메시지를 입력하세요..."
                  className="w-full bg-transparent border-0 outline-0 text-sm text-gray-800 placeholder-gray-500"
                  disabled={isLoading}
                />
              </div>
              
              {/* 오른쪽 버튼들 */}
              <div className="flex items-center gap-1">
                <button
                  disabled={isLoading}
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-700"
                  title="음성 입력"
                >
                  🎤
                </button>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || isSendingRef.current}
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="전송"
                >
                  🎶
                </button>
              </div>
            </div>
            
            {/* 숨겨진 파일 입력 */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </>
      )}
      </div>
    </>
  );
}

