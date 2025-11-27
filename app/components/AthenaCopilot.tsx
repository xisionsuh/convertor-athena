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
  const isComposingRef = useRef(false); // 한글 입력 중인지 추적
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
      (messageContent === lastSentMessageRef.current && now - lastSentTimeRef.current < 2000); // 2초 내 동일 메시지 중복 방지

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
      {/* 코파일럿이 닫혔을 때 다시 열기 버튼 */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            onOpenChange?.(true);
          }}
          className="fixed left-4 top-1/2 -translate-y-1/2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 rounded-r-lg shadow-lg hover:from-purple-700 hover:to-blue-700 transition-all z-50 flex items-center gap-2"
          title="코파일럿 열기"
        >
          <span className="text-xl">🧠</span>
          <span className="font-semibold">코파일럿</span>
        </button>
      )}
      
      <div className={`${isOpen ? 'flex-1' : 'w-0'} transition-all duration-300 bg-white dark:bg-gray-800 shadow-lg overflow-hidden flex flex-col h-full`}>
        {/* 헤더 */}
        <div className="p-4 border-b dark:border-gray-700 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-lg">🧠</span>
              </div>
              <div>
                <h2 className="text-lg font-bold">Athena AI</h2>
                <p className="text-xs text-white/80">
                  {selectedProjectId && projectName ? `📁 ${projectName}` : '코파일럿'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* 프로젝트 연결 새 채팅 버튼 */}
              {selectedProjectId && (
                <button
                  onClick={async () => {
                    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    setMessages([]);
                    await initializeSession(newSessionId, selectedProjectId);
                    showToast(`${projectName || '프로젝트'} 연결 채팅 시작`, 'success');
                    onNewProjectChat?.(selectedProjectId);
                  }}
                  className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded transition-colors"
                  title="프로젝트 연결 새 채팅"
                >
                  📁+ 새 채팅
                </button>
              )}
              <button
                onClick={() => {
                  const newIsOpen = !isOpen;
                  setIsOpen(newIsOpen);
                  onOpenChange?.(newIsOpen);
                }}
                className="text-white/80 hover:text-white transition-colors"
                title="코파일럿 닫기"
              >
                {isOpen ? '◀' : '▶'}
              </button>
            </div>
          </div>
        </div>

      {isOpen && (
        <>
          {/* 메시지 영역 - 드래그 앤 드롭 지원 */}
          <div
            ref={messagesContainerRef}
            className={`flex-1 overflow-y-auto min-h-0 relative transition-colors ${
              isDraggingOver ? 'bg-blue-50 dark:bg-blue-900/20' : ''
            }`}
            style={{ maxHeight: '100%', overflowAnchor: 'none' }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* 드래그 오버레이 */}
            {isDraggingOver && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-100/80 dark:bg-blue-900/80 border-2 border-dashed border-blue-500 rounded-lg m-2">
                <div className="text-center">
                  <div className="text-4xl mb-2">📎</div>
                  <p className="text-blue-600 dark:text-blue-300 font-medium">파일을 여기에 놓으세요</p>
                  <p className="text-blue-500 dark:text-blue-400 text-sm">PDF, 이미지, 텍스트 파일 등</p>
                </div>
              </div>
            )}
            {messages.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8 px-4">
                <div className="text-4xl mb-4">🧠</div>
                <p className="text-sm font-medium mb-2">Athena AI 코파일럿</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  앱을 제어하고 질문에 답변할 수 있습니다.
                  <br />
                  예: "첫 번째 파일을 변환해줘"
                </p>
              </div>
            )}
            
            {messages.map((message) => {
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
                // AI 답변: GPT 스타일 카드 레이아웃
                return (
                  <div
                    key={message.id}
                    className="w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                  >
                    <div className="px-4 sm:px-6 py-4 sm:py-6">
                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                          <span className="text-white text-sm">🧠</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                            <span className="font-medium">Athena AI</span>
                            <span>·</span>
                            <span>{message.timestamp.toLocaleTimeString('ko-KR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}</span>
                          </div>
                          <div className="prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                code({ inline, className, children, ...props }: any) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  const codeString = String(children).replace(/\n$/, '');

                                  // mcp_tool 코드 블록은 숨김 (내부 처리용)
                                  if (!inline && match && match[1] === 'mcp_tool') {
                                    return null;
                                  }

                                  if (!inline && match) {
                                    // 코드 블록 - GPT 스타일 (복사 버튼 포함)
                                    return (
                                      <div className="relative group my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-900 dark:bg-gray-950">
                                        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 dark:bg-gray-900 border-b border-gray-700 dark:border-gray-800">
                                          <span className="text-xs text-gray-400 font-mono">{match[1]}</span>
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(codeString);
                                              showToast('코드가 클립보드에 복사되었습니다.', 'success');
                                            }}
                                            className="px-2 py-1 text-xs bg-gray-700 dark:bg-gray-800 hover:bg-gray-600 dark:hover:bg-gray-700 text-gray-300 dark:text-gray-400 rounded transition-colors flex items-center gap-1.5"
                                            title="코드 복사"
                                          >
                                            <span>📋</span>
                                            <span>복사</span>
                                          </button>
                                        </div>
                                        <div className="overflow-x-auto">
                                          <SyntaxHighlighter
                                            style={vscDarkPlus}
                                            language={match[1]}
                                            PreTag="div"
                                            customStyle={{
                                              margin: 0,
                                              padding: '1rem',
                                              background: 'transparent',
                                            }}
                                            {...props}
                                          >
                                            {codeString}
                                          </SyntaxHighlighter>
                                        </div>
                                      </div>
                                    );
                                  }
                                  
                                  // 인라인 코드
                                  return (
                                    <code 
                                      className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                },
                                p: ({ children }: any) => (
                                  <p className="mb-4 last:mb-0 text-gray-900 dark:text-gray-100 leading-7">
                                    {children}
                                  </p>
                                ),
                                h1: ({ children }: any) => (
                                  <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
                                    {children}
                                  </h1>
                                ),
                                h2: ({ children }: any) => (
                                  <h2 className="text-xl font-bold mb-3 mt-5 first:mt-0 text-gray-900 dark:text-gray-100">
                                    {children}
                                  </h2>
                                ),
                                h3: ({ children }: any) => (
                                  <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0 text-gray-900 dark:text-gray-100">
                                    {children}
                                  </h3>
                                ),
                                ul: ({ children }: any) => (
                                  <ul className="list-disc list-outside mb-4 ml-6 space-y-2 text-gray-900 dark:text-gray-100">
                                    {children}
                                  </ul>
                                ),
                                ol: ({ children }: any) => (
                                  <ol className="list-decimal list-outside mb-4 ml-6 space-y-2 text-gray-900 dark:text-gray-100">
                                    {children}
                                  </ol>
                                ),
                                li: ({ children }: any) => (
                                  <li className="leading-7">{children}</li>
                                ),
                                blockquote: ({ children }: any) => (
                                  <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-4 py-2 my-4 italic text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 rounded-r">
                                    {children}
                                  </blockquote>
                                ),
                                table: ({ children }: any) => (
                                  <div className="overflow-x-auto my-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                      {children}
                                    </table>
                                  </div>
                                ),
                                thead: ({ children }: any) => (
                                  <thead className="bg-gray-50 dark:bg-gray-800/80">{children}</thead>
                                ),
                                tbody: ({ children }: any) => (
                                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                    {children}
                                  </tbody>
                                ),
                                tr: ({ children }: any) => (
                                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                    {children}
                                  </tr>
                                ),
                                th: ({ children }: any) => (
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                                    {children}
                                  </th>
                                ),
                                td: ({ children }: any) => (
                                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800">
                                    {children}
                                  </td>
                                ),
                                a: ({ href, children }: any) => (
                                  <a 
                                    href={href} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {children}
                                  </a>
                                ),
                                strong: ({ children }: any) => (
                                  <strong className="font-semibold text-gray-900 dark:text-gray-100">
                                    {children}
                                  </strong>
                                ),
                                em: ({ children }: any) => (
                                  <em className="italic text-gray-800 dark:text-gray-200">
                                    {children}
                                  </em>
                                ),
                                hr: () => (
                                  <hr className="my-6 border-gray-200 dark:border-gray-700" />
                                ),
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
              <div className="w-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 border-t border-b border-gray-200 dark:border-gray-700">
                <div className="px-6 py-6">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm">🧠</span>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* 입력 영역 - 이미지 스타일 */}
          <div className="p-3 border-t dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
            {/* 선택된 파일 표시 */}
            {selectedFiles.length > 0 && (
              <div className="mb-2 space-y-1">
                {selectedFiles.map((file, index) => {
                  const isAudio = file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|webm|ogg|flac|aac)$/i);
                  const isImage = file.type.startsWith('image/');
                  const icon = isAudio ? '🎵' : isImage ? '🖼️' : '📎';
                  return (
                    <div key={index} className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                      <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{icon} {file.name}</span>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* 입력 바 - 이미지와 동일한 스타일 */}
            <div className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 rounded-lg px-2 py-2">
              {/* 왼쪽 버튼들 */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="w-8 h-8 rounded-full bg-white dark:bg-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors text-gray-700 dark:text-gray-200 text-sm font-bold"
                  title="파일 첨부"
                >
                  +
                </button>
                <button
                  disabled={isLoading}
                  className="w-8 h-8 rounded-full bg-white dark:bg-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors text-gray-700 dark:text-gray-200"
                  title="웹 검색"
                >
                  🌐
                </button>
                <button
                  disabled={isLoading}
                  className="w-8 h-8 rounded-full bg-white dark:bg-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors text-gray-700 dark:text-gray-200 text-xs font-bold"
                  title="텍스트 서식"
                >
                  A
                </button>
              </div>
              
              {/* 중앙 입력 영역 */}
              <div className="flex-1 bg-gray-300 dark:bg-gray-600 rounded px-3 py-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onCompositionStart={() => {
                    // 한글 입력 시작
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    // 한글 입력 완료
                    isComposingRef.current = false;
                  }}
                  onKeyDown={(e) => {
                    // Enter 키가 아니면 무시
                    if (e.key !== 'Enter' || e.shiftKey) {
                      return;
                    }

                    // 항상 Enter 키 기본 동작 방지
                    e.preventDefault();
                    e.stopPropagation();

                    // 한글 입력 중이면 무시
                    if (isComposingRef.current) {
                      return;
                    }

                    // 중복 방지: 이미 전송 중이거나 입력이 비어있으면 무시
                    if (isLoading || isSendingRef.current || !input.trim()) {
                      return;
                    }

                    handleSend();
                  }}
                  placeholder="메시지를 입력하세요..."
                  className="w-full bg-transparent border-0 outline-0 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  disabled={isLoading}
                />
              </div>
              
              {/* 오른쪽 버튼들 */}
              <div className="flex items-center gap-1">
                <button
                  disabled={isLoading}
                  className="w-8 h-8 rounded-full bg-white dark:bg-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors text-gray-700 dark:text-gray-200"
                  title="음성 입력"
                >
                  🎤
                </button>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || isSendingRef.current}
                  className="w-8 h-8 rounded-full bg-white dark:bg-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
              accept="image/*,.pdf,.txt,.doc,.docx,.mp3,.wav,.m4a,.webm,.ogg,.flac,.aac,.mp4,.m4p,.m4b,audio/*"
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
