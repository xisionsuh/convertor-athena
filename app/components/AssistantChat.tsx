'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import { AthenaIcon } from './icons';
import TerminalOutput from './TerminalOutput';
import ScreenshotViewer from './ScreenshotViewer';
import ApprovalDialog from './ApprovalDialog';
import type { ToolResult } from './ToolResultPanel';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ApprovalRequest {
  id: string;
  command: string;
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  requestedAt: Date;
}

interface AssistantChatProps {
  sessions: any[];
  selectedSessionId: string | null;
  selectedProjectId: string | null;
  projectName?: string | null;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  onNewProjectChat?: (projectId: string) => void;
  onCommandPaletteOpen?: () => void;
  onToolResult?: (result: ToolResult) => void;
  onApprovalRequest?: (request: ApprovalRequest) => void;
}

// Parse tool markers in assistant messages
function parseToolMarkers(content: string): Array<{ type: 'text' | 'terminal' | 'screenshot' | 'processes' | 'approval'; content: string; meta?: any }> {
  const parts: Array<{ type: 'text' | 'terminal' | 'screenshot' | 'processes' | 'approval'; content: string; meta?: any }> = [];
  const toolRegex = /\[TOOL:(\w+)\]([\s\S]*?)\[\/TOOL\]/g;
  let lastIndex = 0;
  let match;

  while ((match = toolRegex.exec(content)) !== null) {
    // Text before tool marker
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }

    const toolType = match[1] as any;
    const toolContent = match[2].trim();

    // Try to parse JSON content
    let meta;
    try {
      meta = JSON.parse(toolContent);
    } catch {
      meta = null;
    }

    parts.push({ type: toolType, content: toolContent, meta });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', content });
  }

  return parts;
}

export default function AssistantChat({
  selectedSessionId,
  selectedProjectId,
  projectName,
  showToast,
  onNewProjectChat,
  onCommandPaletteOpen,
  onToolResult,
}: AssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);
  const lastSentMessageRef = useRef<string>('');
  const lastSentTimeRef = useRef<number>(0);
  const isComposingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);

  const loadSessionMessages = useCallback(async (targetSessionId: string) => {
    try {
      const response = await fetch(`/athena/api/athena/session/${targetSessionId}`);
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
        ? `${projectName} - Chat`
        : 'Athena Assistant';

      const response = await fetch('/athena/api/athena/session/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title, projectId: forProjectId || null }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.sessionId) {
          setSessionId(data.sessionId);
          return data.sessionId;
        }
      }
      setSessionId(newSessionId);
      return newSessionId;
    } catch (error) {
      console.error('Session initialization error:', error);
      setSessionId(newSessionId);
      return newSessionId;
    }
  }, [userId, projectName]);

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

  // Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onCommandPaletteOpen?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCommandPaletteOpen]);

  const generateUniqueId = () => {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
  };

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
      setSelectedFiles(prev => [...prev, ...files]);
      showToast(`${files.length} file(s) attached.`, 'success');
    }
  };

  const handleSend = async () => {
    if (isSendingRef.current) return;

    const messageContent = input.trim();
    const now = Date.now();

    const isDuplicate =
      !messageContent ||
      isLoading ||
      !sessionId ||
      (messageContent === lastSentMessageRef.current && now - lastSentTimeRef.current < 3000);

    if (isDuplicate) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    isSendingRef.current = true;
    lastSentMessageRef.current = messageContent;
    lastSentTimeRef.current = now;
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
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('/athena/api/athena/chat/stream', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current?.signal,
      });

      setSelectedFiles([]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const assistantMessageId = generateUniqueId();
      let assistantContent = '';

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
                  if (parsed.data?.strategy) {
                    const agentNames = parsed.data.agentsUsed?.join(', ') || 'AI';
                    const strategyLabel = parsed.data.strategy === 'sequential' ? 'Sequential Analysis'
                      : parsed.data.strategy === 'debate' ? 'Debate Mode' : 'Voting Mode';
                    assistantContent += `\n\n**${strategyLabel}**\nModels: ${agentNames}\n\n`;
                    setMessages(prev => prev.map(msg =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: assistantContent }
                        : msg
                    ));
                  }
                } else if (parsed.type === 'step_start') {
                  assistantContent += `\n\n---\n\n### ${parsed.agent} analyzing... (${parsed.step}/${parsed.total || '?'})\n\n`;
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                } else if (parsed.type === 'tool_result') {
                  // Emit tool result to parent for ToolResultPanel
                  const toolResult = parsed.data;
                  if (onToolResult && toolResult) {
                    onToolResult({
                      type: (toolResult.type || 'terminal') as ToolResult['type'],
                      title: toolResult.title || 'Tool Result',
                      content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
                      timestamp: new Date(),
                    });
                  }

                  // Also inline in chat
                  if (toolResult?.type === 'terminal') {
                    assistantContent += `\n\n[TOOL:terminal]${JSON.stringify({ command: toolResult.command, output: toolResult.output, exitCode: toolResult.exitCode })}[/TOOL]\n\n`;
                  } else if (toolResult?.type === 'screenshot') {
                    assistantContent += `\n\n[TOOL:screenshot]${JSON.stringify({ src: toolResult.src, ocrText: toolResult.ocrText })}[/TOOL]\n\n`;
                  } else if (toolResult?.type === 'approval') {
                    setApprovalRequest({
                      id: toolResult.id,
                      command: toolResult.command,
                      securityLevel: toolResult.securityLevel || 'high',
                      requestedAt: new Date(),
                    });
                  } else {
                    assistantContent += `\n\n[Tool Result]\n${JSON.stringify(toolResult, null, 2)}`;
                  }

                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                }
              } catch {
                // JSON parse failure - ignore partial streaming data
              }
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Chat error:', error);
        showToast(`Error: ${error.message}`, 'error');
      }
      setIsLoading(false);
    } finally {
      isSendingRef.current = false;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleApprove = async (id: string) => {
    try {
      await fetch('/athena/api/system/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, approved: true }),
      });
      showToast('Command approved', 'success');
    } catch {
      showToast('Failed to approve command', 'error');
    }
    setApprovalRequest(null);
  };

  const handleDeny = async (id: string) => {
    try {
      await fetch('/athena/api/system/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, approved: false }),
      });
      showToast('Command denied', 'info');
    } catch {
      showToast('Failed to deny command', 'error');
    }
    setApprovalRequest(null);
  };

  // Render message content with inline tool results
  const renderMessageContent = (content: string) => {
    const parts = parseToolMarkers(content);

    return parts.map((part, index) => {
      if (part.type === 'terminal') {
        const meta = part.meta || {};
        return (
          <TerminalOutput
            key={index}
            output={meta.output || part.content}
            command={meta.command}
            exitCode={meta.exitCode}
          />
        );
      }

      if (part.type === 'screenshot') {
        const meta = part.meta || {};
        return (
          <ScreenshotViewer
            key={index}
            src={meta.src || part.content}
            ocrText={meta.ocrText}
          />
        );
      }

      if (part.type === 'processes') {
        return (
          <div key={index} className="my-3 overflow-x-auto rounded-lg border border-border">
            <pre className="text-xs font-mono p-3 bg-muted/50 text-foreground whitespace-pre">{part.content}</pre>
          </div>
        );
      }

      if (part.type === 'approval') {
        const meta = part.meta || {};
        return (
          <div key={index} className="my-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">&#x26A0;&#xFE0F;</span>
              <span className="text-sm font-medium text-red-700 dark:text-red-300">Approval Required</span>
            </div>
            <code className="text-xs font-mono text-red-600 dark:text-red-400">{meta.command || part.content}</code>
          </div>
        );
      }

      // Regular text - render as markdown
      return (
        <ReactMarkdown
          key={index}
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
                        &#x1F4CB;
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
          {part.content}
        </ReactMarkdown>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background/50 backdrop-blur-sm relative">
      {/* Header */}
      <div className="h-12 md:h-14 px-4 md:px-6 border-b border-border/50 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <AthenaIcon size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Athena Assistant</h2>
            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
              {selectedProjectId && projectName ? `Project: ${projectName}` : 'Smart AI Assistant'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedProjectId && (
            <button
              onClick={async () => {
                const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                setMessages([]);
                await initializeSession(newSessionId, selectedProjectId);
                showToast(`${projectName || 'Project'} chat started`, 'success');
                onNewProjectChat?.(selectedProjectId);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-full transition-colors"
            >
              + New Chat
            </button>
          )}
          <button
            onClick={onCommandPaletteOpen}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-md transition-colors flex items-center gap-1"
            title="Command Palette (Cmd+K)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <kbd className="font-mono text-[10px]">&#x2318;K</kbd>
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto min-h-0 relative p-4 md:p-6 space-y-6 custom-scrollbar ${isDraggingOver ? 'bg-primary/5' : ''}`}
        style={{ overflowAnchor: 'none' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-4 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-2xl animate-fade-in">
            <div className="text-center">
              <div className="text-4xl mb-3">&#x1F4CE;</div>
              <p className="text-primary font-bold text-lg">Drop files here</p>
              <p className="text-muted-foreground text-sm">PDF, Images, Text, Audio</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-2xl flex items-center justify-center mb-6">
              <AthenaIcon size={32} className="text-primary" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">How can I help you?</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              I can control your server, monitor processes, capture screenshots, and much more.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {[
                { label: 'Server Status', cmd: 'Show me the server status' },
                { label: 'PM2 Processes', cmd: 'List all PM2 processes' },
                { label: 'Disk Usage', cmd: 'Check disk usage' },
                { label: 'Memory Info', cmd: 'Show memory usage' },
              ].map((suggestion) => (
                <button
                  key={suggestion.cmd}
                  onClick={() => {
                    setInput(suggestion.cmd);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 hover:bg-muted border border-border/50 rounded-full transition-colors hover:text-foreground"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div
              key={message.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mt-1 ${
                  isUser
                    ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white'
                    : 'bg-gradient-to-br from-primary to-purple-600 text-white'
                }`}>
                  <span className="text-xs font-bold">{isUser ? 'U' : 'A'}</span>
                </div>

                {/* Bubble */}
                <div className={`group relative px-5 py-3.5 shadow-sm ${
                  isUser
                    ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                    : 'bg-card border border-border/50 text-card-foreground rounded-2xl rounded-tl-sm'
                }`}>
                  <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : 'dark:prose-invert'}`}>
                    {isUser ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    ) : (
                      renderMessageContent(message.content)
                    )}
                  </div>
                  <span className={`text-[10px] absolute bottom-1 right-3 opacity-0 group-hover:opacity-100 transition-opacity ${
                    isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading indicator */}
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
      <div className="p-3 md:p-4 bg-background/80 backdrop-blur-md border-t border-border/50 shrink-0">
        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 animate-fade-in">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 text-xs bg-muted px-3 py-1.5 rounded-full border border-border">
                <span>{file.type.startsWith('image/') ? '\uD83D\uDDBC\uFE0F' : '\uD83D\uDCC4'}</span>
                <span className="max-w-[150px] truncate font-medium">{file.name}</span>
                <button onClick={() => removeFile(index)} className="ml-1 text-muted-foreground hover:text-destructive transition-colors">x</button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 bg-muted/50 border border-border/50 rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all max-w-4xl mx-auto">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-muted-foreground hover:text-primary hover:bg-background rounded-xl transition-colors"
            title="Attach file"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => {
              setTimeout(() => { isComposingRef.current = false; }, 10);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask anything... (Cmd+K for commands)"
            className="flex-1 bg-transparent border-none focus:ring-0 py-2.5 max-h-32 min-h-[44px] resize-none custom-scrollbar text-sm"
            rows={1}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
            disabled={isLoading}
          />

          <button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
            className="p-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] text-muted-foreground">AI can make mistakes. Check important info.</p>
        </div>
      </div>

      {/* Approval Dialog */}
      {approvalRequest && (
        <ApprovalDialog
          request={approvalRequest}
          onApprove={handleApprove}
          onDeny={handleDeny}
          isOpen={true}
          onClose={() => setApprovalRequest(null)}
        />
      )}
    </div>
  );
}
