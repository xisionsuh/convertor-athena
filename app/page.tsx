'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { FileSession, MemoSession } from './types';
import NavigationSidebar, { type NavTab } from './components/NavigationSidebar';
import AssistantChat from './components/AssistantChat';
import ToolResultPanel, { type ToolResult } from './components/ToolResultPanel';
import CommandPalette from './components/CommandPalette';
import SystemDashboard from './components/SystemDashboard';
import DevicePanel from './components/DevicePanel';
import ProjectManager from './components/ProjectManager';
import ThemeToggle from './components/ThemeToggle';
import { useTheme } from './contexts/ThemeContext';
import { useAuthUser } from './hooks/useAuthUser';
import { useToast } from './hooks/useToast';
import ToastContainer from './components/ToastContainer';
import { useUserContent } from './hooks/useUserContent';
import { useRecording } from './hooks/useRecording';
import SessionList from './components/SessionList';
import MemoPanel from './components/MemoPanel';
import { useExport } from './hooks/useExport';

export default function Home() {
  const { theme } = useTheme();
  const { userId, userName, isAuthenticated } = useAuthUser();
  const { toasts, showToast } = useToast();
  const { exportToPDF, shareContent } = useExport();
  const {
    sessions,
    setSessions,
    memoSessions,
    setMemoSessions,
    chatSessions,
    setChatSessions,
  } = useUserContent(userId, isAuthenticated);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [memoContent, setMemoContent] = useState('');
  const [memoTitle, setMemoTitle] = useState('');
  const [memoPanelOpen, setMemoPanelOpen] = useState(false);
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    isRecording,
    isPaused,
    recordingTime,
    canvasRef,
    startRecording,
    togglePauseRecording,
    stopRecording,
    cancelRecording,
  } = useRecording({ showToast });

  // Project state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectRefreshTrigger, setProjectRefreshTrigger] = useState<number>(0);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // New layout state
  const [activeTab, setActiveTab] = useState<NavTab>('chat');
  const [toolResultPanelOpen, setToolResultPanelOpen] = useState(false);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [devices] = useState<Array<{ id: string; name: string; platform: 'macos' | 'windows' | 'linux'; status: 'online' | 'offline'; lastSeen: Date; capabilities: string[] }>>([]);

  // Section collapse
  const [collapsedSections, setCollapsedSections] = useState<{
    files: boolean;
    chats: boolean;
    memos: boolean;
  }>({ files: false, chats: false, memos: false });

  const toggleSection = (section: 'files' | 'chats' | 'memos') => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Hydration
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // 한글 입력 중인지 추적
  const [isComposing, setIsComposing] = useState(false);

  // Load projects
  useEffect(() => {
    if (userId && isAuthenticated) {
      fetch(`/athena/api/projects?userId=${userId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setProjects(data.projects.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
          }
        })
        .catch(console.error);
    } else {
      setProjects([]);
    }
  }, [userId, isAuthenticated, projectRefreshTrigger]);

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  const getProjectName = useCallback((projectId: string | undefined) => {
    if (!projectId) return null;
    const project = projects.find(p => p.id === projectId);
    return project?.name || null;
  }, [projects]);

  // Filtered/sorted sessions
  const filteredAndSortedSessions = sessions
    .filter(session => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return session.fileName.toLowerCase().includes(query) ||
        session.transcription.toLowerCase().includes(query) ||
        session.minutes.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'name') {
        comparison = a.fileName.localeCompare(b.fileName, 'ko');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const filteredAndSortedMemos = memoSessions
    .filter(memo => {
      if (memo.type !== 'memo') return false;
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return memo.title.toLowerCase().includes(query) || memo.content.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'name') {
        comparison = a.title.localeCompare(b.title, 'ko');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const filteredAndSortedChatSessions = chatSessions
    .filter(chat => {
      if (!searchQuery) return true;
      return chat.title.toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'name') {
        comparison = a.title.localeCompare(b.title, 'ko');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // Cmd+K: Command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (searchQuery) {
          setSearchQuery('');
          if (isInputFocused) searchInputRef.current?.blur();
        } else if (sidebarOpen && !isInputFocused) {
          setSidebarOpen(false);
        }
        return;
      }

      if (isInputFocused) return;

      if (e.key === 'Delete' && selectedSessionId && !isTranscribing && !isCompressing) {
        const session = sessions.find(s => s.id === selectedSessionId);
        if (session && session.status !== 'transcribing') {
          fetch(`/athena/api/sessions?sessionId=${selectedSessionId}&type=file`, { method: 'DELETE' }).catch(console.error);
          setSessions(prev => prev.filter(s => s.id !== selectedSessionId));
          setSelectedSessionId(sessions.find(s => s.id !== selectedSessionId)?.id || null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sidebarOpen, selectedSessionId, isTranscribing, isCompressing, sessions, commandPaletteOpen]);

  // Load selected memo
  useEffect(() => {
    if (selectedMemoId) {
      const memo = memoSessions.find(m => m.id === selectedMemoId);
      if (memo) {
        setMemoContent(memo.content);
        setMemoTitle(memo.title);
      }
    } else {
      setMemoContent('');
      setMemoTitle('');
    }
  }, [selectedMemoId, memoSessions]);

  // FFmpeg init
  useEffect(() => {
    if (typeof window !== 'undefined' && !ffmpegRef.current) {
      ffmpegRef.current = new FFmpeg();
    }
  }, []);

  const loadFFmpeg = async () => {
    if (ffmpegLoaded || !ffmpegRef.current) return;
    const ffmpeg = ffmpegRef.current;
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    setFfmpegLoaded(true);
  };

  const splitAudioIntoChunks = async (inputFile: File, chunkDurationMinutes: number = 10): Promise<File[]> => {
    setIsCompressing(true);
    setCompressionProgress('Preparing audio split...');
    try {
      await loadFFmpeg();
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) throw new Error('FFmpeg not initialized');

      setCompressionProgress('Loading file...');
      const inputName = 'input' + inputFile.name.substring(inputFile.name.lastIndexOf('.'));
      await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

      const chunks: File[] = [];
      const chunkDurationSeconds = chunkDurationMinutes * 60;
      const maxChunks = 6;

      for (let i = 0; i < maxChunks; i++) {
        const outputName = `chunk_${i}.mp3`;
        const startTime = i * chunkDurationSeconds;
        try {
          setCompressionProgress(`Splitting part ${i + 1}...`);
          await ffmpeg.exec(['-i', inputName, '-ss', startTime.toString(), '-t', chunkDurationSeconds.toString(), '-ac', '1', '-b:a', '96k', '-ar', '16000', outputName]);
          const data = await ffmpeg.readFile(outputName);
          if ((data as Uint8Array).length < 1000) break;
          const uint8Data = data as Uint8Array;
          const arrayBuffer = uint8Data.buffer.slice(uint8Data.byteOffset, uint8Data.byteOffset + uint8Data.byteLength) as ArrayBuffer;
          const blob = new Blob([arrayBuffer], { type: 'audio/mp3' });
          chunks.push(new File([blob], `chunk_${i}.mp3`, { type: 'audio/mp3' }));
        } catch {
          break;
        }
      }
      setCompressionProgress('');
      setIsCompressing(false);
      return chunks;
    } catch (error) {
      console.error('Split error:', error);
      setCompressionProgress('');
      setIsCompressing(false);
      throw error;
    }
  };

  const transcribeFile = async (fileToTranscribe: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', fileToTranscribe);
    try {
      const response = await fetch('/athena/api/transcribe', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error (${response.status})` }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (!data.text || data.text.trim() === '') throw new Error('Empty transcription result.');
      return data.text;
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error('Network error. Check your connection.');
    }
  };

  const transcribeSingleSession = async (sessionIdOrSession: string | FileSession) => {
    let session: FileSession | undefined;
    let sid: string;
    if (typeof sessionIdOrSession === 'string') {
      session = sessions.find(s => s.id === sessionIdOrSession);
      sid = sessionIdOrSession;
    } else {
      session = sessionIdOrSession;
      sid = session.id;
    }
    if (!session || !session.file) throw new Error('Session or file not found.');

    const maxSize = 25 * 1024 * 1024;
    setSessions(prev => {
      const existing = prev.find(s => s.id === sid);
      if (existing) return prev.map(s => s.id === sid ? { ...s, status: 'transcribing' as const } : s);
      return [...prev, { ...session, status: 'transcribing' as const }];
    });

    try {
      if (session.file.size > maxSize) {
        setCompressionProgress('Large file. Splitting...');
        showToast(`File size ${(session.file.size / 1024 / 1024).toFixed(2)}MB - auto splitting.`, 'info');
        const chunks = await splitAudioIntoChunks(session.file);
        if (chunks.length === 0) throw new Error('Split failed');

        let fullTranscription = '';
        const chunkSessions: { id: string; name: string; transcription: string }[] = [];
        for (let i = 0; i < chunks.length; i++) {
          setCompressionProgress(`Transcribing ${i + 1}/${chunks.length}...`);
          try {
            const chunkText = await transcribeFile(chunks[i]);
            fullTranscription += `\n\n${chunkText}`;
            chunkSessions.push({ id: `chunk-${i}`, name: `Part ${i + 1}`, transcription: chunkText });
          } catch (error) {
            console.error(`Chunk ${i + 1} error:`, error);
            showToast(`Part ${i + 1} failed, continuing...`, 'error');
          }
        }
        setCompressionProgress('');
        setSessions(prev => prev.map(s => s.id === sid ? { ...s, transcription: fullTranscription.trim(), chunks: chunkSessions, status: 'completed' as const } : s));

        if (selectedProjectId && fullTranscription.trim()) {
          const sess = sessions.find(s => s.id === sid);
          if (sess) {
            await fetch(`/athena/api/projects/${selectedProjectId}/context`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contextType: 'file_content', title: `${sess.fileName} - Transcript`, content: fullTranscription.trim(), sourceResourceId: sid, importance: 7 }),
            });
          }
        }
      } else {
        setCompressionProgress('Transcribing...');
        const text = await transcribeFile(session.file);
        setCompressionProgress('');
        setSessions(prev => prev.map(s => s.id === sid ? { ...s, transcription: text, status: 'completed' as const } : s));

        if (selectedProjectId && text) {
          const sess = sessions.find(s => s.id === sid);
          if (sess) {
            await fetch(`/athena/api/projects/${selectedProjectId}/context`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contextType: 'file_content', title: `${sess.fileName} - Transcript`, content: text, sourceResourceId: sid, importance: 7 }),
            });
          }
        }
      }
    } catch (error) {
      console.error('Transcribe error:', error);
      setCompressionProgress('');
      showToast(`Transcription error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, status: 'error' as const } : s));
      throw error;
    }
  };

  const handleTranscribe = async () => {
    if (!selectedSession || !selectedSession.file) return;
    setSessions(prev => prev.map(s => s.id === selectedSessionId ? { ...s, status: 'transcribing' as const } : s));
    setIsTranscribing(true);
    try {
      if (selectedSession.file.size > 25 * 1024 * 1024) {
        const chunks = await splitAudioIntoChunks(selectedSession.file);
        if (chunks.length === 0) {
          showToast('File split failed.', 'error');
          setSessions(prev => prev.map(s => s.id === selectedSessionId ? { ...s, status: 'error' as const } : s));
          setIsTranscribing(false);
          return;
        }
        let fullTranscription = '';
        const chunkSessions: { id: string; name: string; transcription: string }[] = [];
        for (let i = 0; i < chunks.length; i++) {
          setCompressionProgress(`${i + 1}/${chunks.length} transcribing...`);
          try {
            const chunkText = await transcribeFile(chunks[i]);
            fullTranscription += `\n\n${chunkText}`;
            chunkSessions.push({ id: `chunk-${i}`, name: `Part ${i + 1}`, transcription: chunkText });
          } catch (error) {
            console.error(`Chunk ${i + 1} error:`, error);
          }
        }
        setCompressionProgress('');
        setSessions(prev => prev.map(s => s.id === selectedSessionId ? { ...s, transcription: fullTranscription.trim(), chunks: chunkSessions, status: 'completed' as const } : s));
      } else {
        const text = await transcribeFile(selectedSession.file);
        setSessions(prev => prev.map(s => s.id === selectedSessionId ? { ...s, transcription: text, status: 'completed' as const } : s));
      }
      showToast('Transcription complete!', 'success');
    } catch (error) {
      console.error('Error:', error);
      showToast('Transcription error.', 'error');
      setSessions(prev => prev.map(s => s.id === selectedSessionId ? { ...s, status: 'error' as const } : s));
      setCompressionProgress('');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSummarize = async () => {
    if (!selectedSession || !selectedSession.transcription) return;
    setIsSummarizing(true);
    try {
      const response = await fetch('/athena/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedSession.transcription }),
      });
      const data = await response.json();
      if (data.error) {
        showToast(data.error, 'error');
      } else {
        setSessions(prev => prev.map(s => s.id === selectedSessionId ? { ...s, minutes: data.minutes } : s));
        if (selectedProjectId && data.minutes) {
          const sess = sessions.find(s => s.id === selectedSessionId);
          if (sess) {
            await fetch(`/athena/api/projects/${selectedProjectId}/context`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contextType: 'summary', title: `${sess.fileName} - Minutes`, content: data.minutes, sourceResourceId: selectedSessionId, importance: 8 }),
            });
          }
        }
        showToast('Meeting minutes generated!', 'success');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('Minutes generation error.', 'error');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleDownload = (type: 'transcription' | 'minutes') => {
    if (!selectedSession) return;
    const content = type === 'transcription' ? selectedSession.transcription : selectedSession.minutes;
    if (!content) { showToast('Nothing to download.', 'error'); return; }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSession.fileName.replace(/\.[^/.]+$/, '')}_${type}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded.', 'success');
  };

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session?.status === 'transcribing' && isTranscribing) {
      showToast('Cannot delete while transcribing.', 'error');
      return;
    }
    try {
      await fetch(`/athena/api/sessions?sessionId=${sessionId}&type=file`, { method: 'DELETE' });
    } catch (error) {
      console.error('Delete failed:', error);
    }
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(sessions.find(s => s.id !== sessionId)?.id || null);
    }
    showToast('File deleted.', 'info');
  }, [sessions, isTranscribing, showToast, setSessions, selectedSessionId]);

  const handleToggleSessionSelection = (sessionId: string, checked: boolean) => {
    setSelectedSessionIds(prev => checked ? [...prev, sessionId] : prev.filter(id => id !== sessionId));
  };

  const handleResetSessionStatus = (sessionId: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'pending' as const } : s));
    showToast('Status reset.', 'info');
  };

  const handleAddSessionToProject = async (session: FileSession) => {
    if (!selectedProjectId) { showToast('Select a project first.', 'error'); return; }
    await addToProject('file', session.id, session.fileName, session.transcription);
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, projectId: selectedProjectId } : s));
  };

  const addToProject = async (resourceType: 'file' | 'memo' | 'material', resourceId: string, title: string, content?: string) => {
    if (!selectedProjectId) { showToast('Select a project first.', 'error'); return; }
    try {
      const response = await fetch(`/athena/api/projects/${selectedProjectId}/resources`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceType, resourceId, title, content: content || '' }),
      });
      const data = await response.json();
      if (data.success) {
        showToast('Added to project.', 'success');
        setProjectRefreshTrigger(prev => prev + 1);
      } else {
        showToast(data.error || 'Add failed', 'error');
      }
    } catch (error) {
      console.error('Failed to add to project:', error);
      showToast('Error adding to project.', 'error');
    }
  };

  // Recording
  const formatRecordingTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSystemTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  };

  const handleStopRecording = async (autoTranscribe: boolean = false) => {
    const result = await stopRecording();
    if (!result) return;
    const { file, fileName } = result;
    const newSession: FileSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileName, file,
      transcription: '', minutes: '', chunks: [],
      status: 'pending', createdAt: new Date(),
      projectId: selectedProjectId || undefined,
    };
    if (selectedProjectId) await addToProject('file', newSession.id, fileName);
    setSessions(prev => [...prev, newSession]);
    setSelectedSessionId(newSession.id);
    showToast('Recording saved!', 'success');
    if (autoTranscribe) {
      setTimeout(async () => {
        try {
          setIsTranscribing(true);
          await transcribeSingleSession(newSession);
          showToast('Transcription complete!', 'success');
        } catch (error) {
          console.error('Auto transcribe error:', error);
          setSessions(prev => prev.map(s => s.id === newSession.id ? { ...s, status: 'error' as const } : s));
        } finally {
          setIsTranscribing(false);
        }
      }, 500);
    }
  };

  // Memo
  const createMemo = async () => {
    const newMemo: MemoSession = {
      id: `memo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: memoTitle || `Memo ${memoSessions.length + 1}`,
      content: '', createdAt: new Date(), updatedAt: new Date(), type: 'memo',
    };
    setMemoSessions(prev => [...prev, newMemo]);
    setSelectedMemoId(newMemo.id);
    setMemoTitle(newMemo.title);
    setMemoContent('');
    setMemoPanelOpen(true);
    if (selectedProjectId) await addToProject('memo', newMemo.id, newMemo.title);
    showToast('New memo created.', 'success');
  };

  const saveMemo = async () => {
    if (!selectedMemoId) { createMemo(); return; }
    const updatedMemo = { content: memoContent, title: memoTitle || memoSessions.find(m => m.id === selectedMemoId)?.title || 'Memo' };
    setMemoSessions(prev => prev.map(memo => memo.id === selectedMemoId ? { ...memo, ...updatedMemo, updatedAt: new Date() } : memo));
    if (selectedProjectId && memoContent) {
      await fetch(`/athena/api/projects/${selectedProjectId}/context`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextType: 'memo', title: updatedMemo.title, content: memoContent, sourceResourceId: selectedMemoId, importance: 6 }),
      });
    }
    showToast('Memo saved.', 'success');
  };

  const deleteChatSession = async (chatId: string) => {
    try {
      const response = await fetch(`/athena/api/athena/session/${chatId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed');
    } catch (error) {
      console.error('Delete failed:', error);
      showToast('Delete failed.', 'error');
      return;
    }
    setChatSessions(prev => prev.filter(c => c.id !== chatId));
    if (selectedSessionId === chatId) setSelectedSessionId(null);
    showToast('Chat deleted.', 'info');
  };

  const deleteMemo = async (memoId: string) => {
    try { await fetch(`/athena/api/sessions?sessionId=${memoId}&type=memo`, { method: 'DELETE' }); } catch (e) { console.error(e); }
    setMemoSessions(prev => prev.filter(m => m.id !== memoId));
    if (selectedMemoId === memoId) { setSelectedMemoId(null); setMemoContent(''); setMemoTitle(''); }
    showToast('Memo deleted.', 'info');
  };

  const downloadMemo = () => {
    if (!selectedMemoId) return;
    const memo = memoSessions.find(m => m.id === selectedMemoId);
    if (!memo) return;
    const content = `Title: ${memo.title}\nCreated: ${memo.createdAt.toLocaleString('ko-KR')}\n\n${memo.content}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${memo.title.replace(/[^a-z0-9가-힣]/gi, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded.', 'success');
  };

  const handleMemoKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = memoContent;
      const lines = currentText.substring(0, start).split('\n');
      const currentLine = lines[lines.length - 1];
      if (currentLine.trim() !== '') {
        const timeStamp = isRecording ? ` [${formatRecordingTime(recordingTime)}]` : ` [${formatSystemTime()}]`;
        const newText = currentText.substring(0, start) + timeStamp + '\n' + currentText.substring(end);
        setMemoContent(newText);
        setTimeout(() => textarea.setSelectionRange(start + timeStamp.length + 1, start + timeStamp.length + 1), 0);
      } else {
        const newText = currentText.substring(0, start) + '\n' + currentText.substring(end);
        setMemoContent(newText);
        setTimeout(() => textarea.setSelectionRange(start + 1, start + 1), 0);
      }
    }
  };

  // Auth
  const handleGoogleLogin = () => { window.location.href = '/athena/api/auth/google?action=login'; };
  const handleLogout = async () => {
    try { await fetch('/athena/api/auth/logout'); window.location.reload(); } catch (e) { console.error(e); }
  };

  const handleCopy = async (type: 'transcription' | 'minutes') => {
    if (!selectedSession) return;
    const content = type === 'transcription' ? selectedSession.transcription : selectedSession.minutes;
    if (!content) { showToast('Nothing to copy.', 'error'); return; }
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(type);
      showToast('Copied!', 'success');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (error) {
      console.error('Copy error:', error);
      showToast('Copy failed.', 'error');
    }
  };

  // Command palette handler
  const handleCommandSelect = (commandId: string) => {
    setActiveTab('chat');
    // Commands are processed as chat messages
    const commandMap: Record<string, string> = {
      'server-status': 'Show me the server status',
      'pm2-list': 'List all PM2 processes',
      'screenshot': 'Take a screenshot of the screen',
      'disk-usage': 'Check disk usage',
      'memory-usage': 'Show memory usage',
      'restart-process': 'Which process should I restart?',
    };
    // This will be handled by AssistantChat via a message
    showToast(`Command: ${commandMap[commandId] || commandId}`, 'info');
  };

  // Tool result handler
  const handleToolResult = (result: ToolResult) => {
    setToolResults(prev => [result, ...prev]);
    setToolResultPanelOpen(true);
  };

  // Render center content based on active tab
  const renderCenterContent = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <AssistantChat
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            selectedProjectId={selectedProjectId}
            projectName={getProjectName(selectedProjectId || undefined)}
            showToast={showToast}
            onNewProjectChat={() => {
              setProjectRefreshTrigger(prev => prev + 1);
            }}
            onCommandPaletteOpen={() => setCommandPaletteOpen(true)}
            onToolResult={handleToolResult}
          />
        );
      case 'tools':
        return <SystemDashboard />;
      case 'devices':
        return (
          <DevicePanel
            devices={devices}
            onPairNew={() => showToast('Pairing mode started.', 'info')}
            onDeviceAction={(deviceId, action) => showToast(`${action} on device ${deviceId}`, 'info')}
          />
        );
      case 'recording':
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">&#x1F3A4;</span>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">Audio Recording</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Record audio and transcribe it to text. Use the recording controls in the top bar.
              </p>
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={isTranscribing || isCompressing}
                  className="px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors font-medium flex items-center gap-2 mx-auto"
                >
                  <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
                  Start Recording
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="text-4xl font-mono font-bold text-foreground tabular-nums">
                    {formatRecordingTime(recordingTime)}
                  </div>
                  {!isPaused && canvasRef && (
                    <canvas ref={canvasRef} width="300" height="60" className="mx-auto opacity-50" />
                  )}
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={togglePauseRecording} className="p-3 rounded-full bg-muted hover:bg-muted/80 text-foreground transition-colors">
                      {isPaused ? '&#x25B6;' : '&#x23F8;'}
                    </button>
                    <button onClick={() => handleStopRecording(false)} className="p-3 rounded-full bg-muted hover:bg-muted/80 text-foreground transition-colors">
                      &#x25A0;
                    </button>
                    <button onClick={() => handleStopRecording(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors">
                      Save & Transcribe
                    </button>
                    <button onClick={cancelRecording} className="p-3 rounded-full bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      &#x2715;
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <h2 className="text-lg font-bold text-foreground mb-4">Settings</h2>

            {/* User Profile */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Account</h3>
              {isAuthenticated ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                      {userName ? userName.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{userName || 'User'}</p>
                      <p className="text-xs text-muted-foreground">Pro Plan</p>
                    </div>
                  </div>
                  <button onClick={handleLogout} className="text-xs text-destructive hover:underline">Sign Out</button>
                </div>
              ) : (
                <button onClick={handleGoogleLogin} className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                  Sign in with Google
                </button>
              )}
            </div>

            {/* Theme */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Appearance</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground font-sans overflow-hidden selection:bg-primary/20 selection:text-primary" data-theme={theme}>
      <ToastContainer toasts={toasts} />

      {/* Top Bar */}
      {isMounted && (
        <header className="h-12 md:h-14 glass z-40 flex items-center justify-between px-3 md:px-6 shrink-0 relative">
          <div className="flex items-center gap-4 flex-1">
            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 -ml-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2 mr-4">
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20">
                <span className="text-white font-bold text-base md:text-lg">A</span>
              </div>
              <span className="font-bold text-base md:text-lg tracking-tight hidden sm:block">Athena</span>
            </div>

            {/* Recording controls */}
            {!isRecording ? (
              <div className="flex items-center gap-3 animate-fade-in">
                <button
                  onClick={startRecording}
                  disabled={isTranscribing || isCompressing}
                  className="group relative overflow-hidden rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive px-3 md:px-5 py-1.5 md:py-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-1.5 md:gap-2 relative z-10">
                    <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-destructive animate-pulse group-hover:scale-110 transition-transform" />
                    <span className="font-medium text-xs md:text-sm">REC</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 md:gap-4 animate-fade-in bg-card/50 px-2 md:px-4 py-1 md:py-1.5 rounded-full border border-border/50">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-destructive animate-pulse'}`} />
                  <span className="font-mono font-medium text-sm md:text-lg tabular-nums tracking-wider text-foreground">
                    {formatRecordingTime(recordingTime)}
                  </span>
                </div>
                <div className="h-4 w-px bg-border hidden sm:block" />
                <div className="flex items-center gap-0.5 md:gap-1">
                  <button onClick={togglePauseRecording} className="p-1.5 md:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    {isPaused ? '\u25B6' : '\u23F8'}
                  </button>
                  <button onClick={() => handleStopRecording(false)} className="p-1.5 md:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    \u25A0
                  </button>
                  <button onClick={() => handleStopRecording(true)} className="px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] md:text-xs font-medium hover:bg-primary/90 transition-colors shadow-sm">
                    Save & Transcribe
                  </button>
                  <button onClick={cancelRecording} className="p-1.5 md:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
                    \u2715
                  </button>
                </div>
              </div>
            )}

            {/* Audio Visualizer */}
            {isRecording && !isPaused && (
              <div className="hidden md:block w-48 h-8 opacity-50">
                <canvas ref={canvasRef} width="192" height="32" className="w-full h-full" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <a href="/dashboard" className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-card/50 hover:bg-card border border-border/50 rounded-lg transition-all" title="Go to Portal">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </a>
            <ThemeToggle />
          </div>
        </header>
      )}

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Navigation Sidebar (left, 56px) */}
        {isMounted && (
          <NavigationSidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            devices={devices.map(d => ({ id: d.id, name: d.name, status: d.status, platform: d.platform }))}
          />
        )}

        {/* Library Sidebar (collapsible) */}
        {isMounted && (
          <>
            {sidebarOpen && (
              <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
            )}
            <div className={`
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
              ${sidebarOpen ? 'md:w-72' : 'md:w-0'}
              fixed md:relative inset-y-0 left-0 w-[85vw] max-w-[288px] md:max-w-none
              transition-all duration-300 glass-panel flex flex-col z-50 md:z-30 overflow-hidden
            `}>
              <div className="p-3 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Library</h2>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { createMemo(); setMemoPanelOpen(true); }}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                      title="New Memo"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  </div>
                </div>

                {/* User Profile */}
                <div className="p-2.5 bg-muted/50 rounded-lg border border-border/50">
                  {isAuthenticated ? (
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm">
                        {userName ? userName.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{userName || 'User'}</p>
                        <p className="text-[10px] text-muted-foreground">Pro Plan</p>
                      </div>
                    </div>
                  ) : (
                    <button onClick={handleGoogleLogin} className="w-full px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-all">
                      Sign in with Google
                    </button>
                  )}
                </div>

                {/* Search */}
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-muted/50 border border-transparent focus:bg-background focus:border-primary/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all text-foreground placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>

                {/* Sort */}
                {sessions.length > 0 && (
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                    <span>Sort</span>
                    <div className="flex items-center gap-1.5">
                      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'name')} className="bg-transparent border-none p-0 text-[10px] font-medium text-foreground focus:ring-0 cursor-pointer">
                        <option value="date">Date</option>
                        <option value="name">Name</option>
                      </select>
                      <button onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} className="p-0.5 hover:bg-muted rounded transition-colors">
                        {sortOrder === 'asc' ? '\u2191' : '\u2193'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                {/* Project Manager */}
                <ProjectManager
                  userId={userId}
                  isAuthenticated={isAuthenticated}
                  selectedProjectId={selectedProjectId}
                  onSelectProject={setSelectedProjectId}
                  showToast={showToast}
                  refreshTrigger={projectRefreshTrigger}
                  onAddResourceToProject={async (projectId, resourceType, resourceId, title, content) => {
                    try {
                      const response = await fetch(`/athena/api/projects/${projectId}/resources`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ resourceType, resourceId, title, content: content || '' }),
                      });
                      const result = await response.json();
                      if (!result.success) throw new Error(result.error || 'Failed');
                      if (resourceType === 'file') setSessions(prev => prev.map(s => s.id === resourceId ? { ...s, projectId } : s));
                      if (resourceType === 'memo') setMemoSessions(prev => prev.map(m => m.id === resourceId ? { ...m, projectId } : m));
                    } catch (error) {
                      console.error('Failed:', error);
                      throw error;
                    }
                  }}
                />

                <SessionList
                  sessions={filteredAndSortedSessions}
                  selectedSessionId={selectedSessionId}
                  selectedSessionIds={selectedSessionIds}
                  selectedProjectId={selectedProjectId}
                  disableStatusReset={isTranscribing}
                  collapsed={collapsedSections.files}
                  getProjectName={getProjectName}
                  onToggleCollapse={() => toggleSection('files')}
                  onSelectSession={(id) => setSelectedSessionId(id)}
                  onToggleSelect={handleToggleSessionSelection}
                  onResetStatus={handleResetSessionStatus}
                  onAddToProject={handleAddSessionToProject}
                  onDeleteSession={handleDeleteSession}
                />

                {/* Chat Sessions */}
                <div>
                  <div className="w-full flex items-center justify-between text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider px-1">
                    <button onClick={() => toggleSection('chats')} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                      <span className={`transition-transform duration-200 text-[8px] ${collapsedSections.chats ? '' : 'rotate-90'}`}>{'\u25B6'}</span>
                      Chats ({filteredAndSortedChatSessions.length})
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedSessionId(null); }} className="p-0.5 hover:bg-muted rounded text-primary" title="New Chat">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    </button>
                  </div>
                  {!collapsedSections.chats && filteredAndSortedChatSessions.length > 0 ? (
                    <div className="space-y-1">
                      {filteredAndSortedChatSessions.map((chat) => (
                        <div
                          key={`chat-${chat.id}`}
                          className={`group p-2.5 rounded-lg transition-all cursor-pointer border ${selectedSessionId === chat.id ? 'bg-primary/5 border-primary/20' : 'bg-transparent border-transparent hover:bg-muted/50'}`}
                          onClick={() => { setSelectedSessionId(chat.id); setSelectedMemoId(null); setActiveTab('chat'); }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium truncate ${selectedSessionId === chat.id ? 'text-primary' : 'text-foreground'}`}>{chat.title}</p>
                              <span className="text-[10px] text-muted-foreground">{chat.updatedAt.toLocaleDateString('ko-KR')}</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); deleteChatSession(chat.id); }} className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive rounded transition-all">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !collapsedSections.chats ? (
                    <div className="text-center py-3 border border-dashed border-border/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground">No chats yet</p>
                    </div>
                  ) : null}
                </div>

                {/* Memos */}
                {filteredAndSortedMemos.length > 0 && (
                  <div>
                    <button onClick={() => toggleSection('memos')} className="w-full flex items-center justify-between text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider px-1 hover:text-foreground transition-colors">
                      <span className="flex items-center gap-1.5">
                        <span className={`transition-transform duration-200 text-[8px] ${collapsedSections.memos ? '' : 'rotate-90'}`}>{'\u25B6'}</span>
                        Memos ({filteredAndSortedMemos.length})
                      </span>
                    </button>
                    {!collapsedSections.memos && (
                      <div className="space-y-1">
                        {filteredAndSortedMemos.map((memo) => (
                          <div
                            key={`memo-${memo.id}`}
                            className={`group p-2.5 rounded-lg transition-all cursor-pointer border ${selectedMemoId === memo.id ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900/30' : 'bg-transparent border-transparent hover:bg-muted/50'}`}
                            onClick={() => { setSelectedMemoId(memo.id); setSelectedSessionId(null); setMemoPanelOpen(true); }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate text-foreground">{memo.title}</p>
                                <p className="text-[10px] text-muted-foreground line-clamp-1">{memo.content || 'No content'}</p>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); deleteMemo(memo.id); }} className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive rounded">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {filteredAndSortedSessions.length === 0 && filteredAndSortedMemos.length === 0 && filteredAndSortedChatSessions.length === 0 && (
                  <div className="text-center py-8 px-4">
                    <p className="text-xs text-muted-foreground">
                      {searchQuery ? 'No results found' : 'Upload a file to get started'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Sidebar Toggle */}
        {isMounted && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`hidden md:block absolute top-1/2 -translate-y-1/2 z-20 bg-card border border-border shadow-md p-1 rounded-r-lg hover:bg-muted transition-all duration-300 text-muted-foreground hover:text-foreground ${sidebarOpen ? 'left-[calc(3.5rem+18rem)]' : 'left-14'}`}
          >
            <svg className={`w-3 h-3 transition-transform duration-300 ${sidebarOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Center Content */}
        {isMounted && (
          <div className="flex-1 flex overflow-hidden">
            {renderCenterContent()}

            {/* Memo Panel (overlay on right) */}
            <MemoPanel
              open={memoPanelOpen}
              onToggle={() => setMemoPanelOpen(!memoPanelOpen)}
              selectedMemoId={selectedMemoId}
              memoTitle={memoTitle}
              memoContent={memoContent}
              isCopilotOpen={true}
              onTitleChange={setMemoTitle}
              onContentChange={setMemoContent}
              onCreateMemo={createMemo}
              onSaveMemo={() => selectedMemoId ? saveMemo() : createMemo()}
              onDownloadMemo={downloadMemo}
              onCloseMemo={() => { setSelectedMemoId(null); setMemoContent(''); setMemoTitle(''); }}
              memoTextareaRef={memoTextareaRef}
              onMemoKeyDown={handleMemoKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
            />

            {/* Tool Result Panel (right) */}
            <ToolResultPanel
              results={toolResults}
              isOpen={toolResultPanelOpen}
              onClose={() => setToolResultPanelOpen(false)}
            />

            {/* File Info Panel */}
            {selectedSession && activeTab === 'chat' && (
              <div className="hidden md:flex w-80 flex-col bg-card border-l border-border shrink-0">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">File Info</h2>
                  <button onClick={() => setSelectedSessionId(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none px-1">x</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {(isTranscribing || compressionProgress || selectedSession.status === 'transcribing') && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                        <p className="text-xs text-blue-700 dark:text-blue-300">{compressionProgress || 'Transcribing...'}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-bold text-foreground mb-1">{selectedSession.fileName}</h3>
                    <p className="text-xs text-muted-foreground">{selectedSession.file ? `${(selectedSession.file.size / 1024 / 1024).toFixed(2)}MB` : 'No file info'}</p>
                  </div>

                  {selectedSession.file && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <audio controls className="w-full" src={URL.createObjectURL(selectedSession.file)} />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={handleTranscribe} disabled={!selectedSession.file || isTranscribing || isCompressing} className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                      {selectedSession.status === 'transcribing' ? 'Transcribing...' : 'Transcribe'}
                    </button>
                    <button onClick={handleSummarize} disabled={!selectedSession.transcription || isSummarizing} className="flex-1 bg-green-600 text-white py-2 px-3 rounded-lg text-xs font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                      {isSummarizing ? 'Generating...' : 'Minutes'}
                    </button>
                  </div>

                  {selectedSession.transcription && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-foreground">Transcript</h4>
                        <div className="flex gap-1">
                          <button onClick={() => handleCopy('transcription')} className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded">{copySuccess === 'transcription' ? 'Copied!' : 'Copy'}</button>
                          <button onClick={() => handleDownload('transcription')} className="text-[10px] bg-gray-600 text-white px-2 py-1 rounded">Download</button>
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                        <p className="text-xs text-foreground whitespace-pre-wrap">{selectedSession.transcription}</p>
                      </div>
                    </div>
                  )}

                  {selectedSession.minutes && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-foreground">Minutes</h4>
                        <div className="flex gap-1">
                          <button onClick={() => handleCopy('minutes')} className="text-[10px] bg-green-600 text-white px-2 py-1 rounded">{copySuccess === 'minutes' ? 'Copied!' : 'Copy'}</button>
                          <button onClick={() => handleDownload('minutes')} className="text-[10px] bg-gray-600 text-white px-2 py-1 rounded">Download</button>
                          <button onClick={async () => {
                            const success = await exportToPDF({ title: `Minutes - ${selectedSession.fileName}`, content: selectedSession.minutes, fileName: `minutes_${selectedSession.fileName.replace(/\.[^/.]+$/, '')}.pdf` });
                            showToast(success ? 'Exported to PDF.' : 'PDF export failed.', success ? 'success' : 'error');
                          }} className="text-[10px] bg-red-600 text-white px-2 py-1 rounded">PDF</button>
                          <button onClick={async () => {
                            const result = await shareContent({ title: `Minutes - ${selectedSession.fileName}`, content: selectedSession.minutes });
                            if (result.success) showToast(result.method === 'clipboard' ? 'Copied!' : 'Shared!', 'success');
                          }} className="text-[10px] bg-indigo-600 text-white px-2 py-1 rounded">Share</button>
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 max-h-64 overflow-y-auto">
                        <div className="prose prose-xs max-w-none text-foreground whitespace-pre-wrap text-xs">{selectedSession.minutes}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Command Palette Overlay */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSelect={handleCommandSelect}
      />
    </div>
  );
}
