'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { FileSession, MemoSession } from './types';
import AthenaCopilot from './components/AthenaCopilot';
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

export default function Home() {
  const { theme } = useTheme(); // 테마 변경 시 리렌더링을 위해 추가
  const { userId, userName, isAuthenticated } = useAuthUser();
  const { toasts, showToast } = useToast();
  const {
    sessions,
    setSessions,
    memoSessions,
    setMemoSessions,
    chatSessions,
    setChatSessions,
  } = useUserContent(userId);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]); // 다중 선택
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null); // 어느 버튼이 복사되었는지 추적
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  
  // 검색 및 정렬 관련 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [memoContent, setMemoContent] = useState('');
  const [memoTitle, setMemoTitle] = useState('');
  const [memoPanelOpen, setMemoPanelOpen] = useState(true); // 기본적으로 메모장 열림
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
  
  // 프로젝트 관련 상태
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectRefreshTrigger, setProjectRefreshTrigger] = useState<number>(0);
  const [copilotOpen, setCopilotOpen] = useState<boolean>(true);
  const [projects, setProjects] = useState<{id: string; name: string}[]>([]);

  // 섹션 접기 상태
  const [collapsedSections, setCollapsedSections] = useState<{
    files: boolean;
    chats: boolean;
    memos: boolean;
  }>({ files: false, chats: false, memos: false });

  const toggleSection = (section: 'files' | 'chats' | 'memos') => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  
  // Hydration 오류 방지: 클라이언트 마운트 여부 추적
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 프로젝트 목록 불러오기
  useEffect(() => {
    if (userId) {
      fetch(`/api/projects?userId=${userId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setProjects(data.projects.map((p: {id: string; name: string}) => ({ id: p.id, name: p.name })));
          }
        })
        .catch(console.error);
    }
  }, [userId, projectRefreshTrigger]);

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  // 프로젝트 이름 찾기 헬퍼 함수
  const getProjectName = useCallback((projectId: string | undefined) => {
    if (!projectId) return null;
    const project = projects.find(p => p.id === projectId);
    return project?.name || null;
  }, [projects]);

  // 검색 및 정렬된 세션 목록 (파일) - 프로젝트 필터링 제거 (전체 표시)
  const filteredAndSortedSessions = sessions
    .filter(session => {
      // 검색 필터링만 적용 (프로젝트 필터링 제거)
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

  const handleToggleSessionSelection = (sessionId: string, checked: boolean) => {
    setSelectedSessionIds(prev =>
      checked ? [...prev, sessionId] : prev.filter(id => id !== sessionId)
    );
  };

  const handleResetSessionStatus = (sessionId: string) => {
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, status: 'pending' as const } : s
    ));
    showToast('파일 상태를 대기로 변경했습니다.', 'info');
  };

  const handleAddSessionToProject = async (session: FileSession) => {
    if (!selectedProjectId) {
      showToast('프로젝트를 먼저 선택해주세요.', 'error');
      return;
    }

    await addToProject('file', session.id, session.fileName, session.transcription);
    setSessions(prev => prev.map(s =>
      s.id === session.id ? { ...s, projectId: selectedProjectId } : s
    ));
  };

  // 프로젝트별 자료 추가 함수
  const addToProject = async (resourceType: 'file' | 'memo' | 'material', resourceId: string, title: string, content?: string) => {
    if (!selectedProjectId) {
      showToast('프로젝트를 먼저 선택해주세요.', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/projects/${selectedProjectId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType,
          resourceId,
          title,
          content: content || '',
        }),
      });

      const data = await response.json();
      if (data.success) {
        showToast('프로젝트에 추가되었습니다.', 'success');
        // 프로젝트 자료 목록 새로고침 트리거
        setProjectRefreshTrigger(prev => prev + 1);
      } else {
        showToast(data.error || '추가 실패', 'error');
      }
    } catch (error) {
      console.error('Failed to add to project:', error);
      showToast('프로젝트 추가 중 오류가 발생했습니다.', 'error');
    }
  };

  // 검색 및 정렬된 메모 목록 - 메모만 필터링
  const filteredAndSortedMemos = memoSessions
    .filter(memo => {
      // 메모만 필터링 (type이 'memo'인 것만)
      if (memo.type !== 'memo') return false;
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return memo.title.toLowerCase().includes(query) ||
             memo.content.toLowerCase().includes(query);
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

  // 검색 및 정렬된 채팅 세션 목록
  const filteredAndSortedChatSessions = chatSessions
    .filter(chat => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return chat.title.toLowerCase().includes(query);
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

  // 키보드 단축키 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에 포커스가 있으면 단축키 무시 (Escape 제외)
      const isInputFocused = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      
      // Ctrl/Cmd + K: 검색 포커스 (항상 작동)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSidebarOpen(true);
        return;
      }
      
      // Escape: 검색 초기화 또는 사이드바 닫기 (입력 필드에서도 작동)
      if (e.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
          if (isInputFocused) {
            searchInputRef.current?.blur();
          }
        } else if (sidebarOpen && !isInputFocused) {
          setSidebarOpen(false);
        }
        return;
      }
      
      // 입력 필드에 포커스가 있으면 나머지 단축키 무시
      if (isInputFocused) return;
      
      // Delete: 선택된 세션 삭제 - 인라인 처리
      if (e.key === 'Delete' && selectedSessionId && !isTranscribing && !isCompressing) {
        const session = sessions.find(s => s.id === selectedSessionId);
        if (session && session.status !== 'transcribing') {
          // 삭제 로직 인라인 처리
          fetch(`/api/sessions?sessionId=${selectedSessionId}&type=file`, { method: 'DELETE' }).catch(console.error);
          setSessions(prev => prev.filter(s => s.id !== selectedSessionId));
          setSelectedSessionId(sessions.find(s => s.id !== selectedSessionId)?.id || null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sidebarOpen, selectedSessionId, isTranscribing, isCompressing, sessions]);

  // 선택된 메모 로드
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

  // FFmpeg은 클라이언트에서만 초기화
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
    setCompressionProgress('오디오 분할 준비 중...');

    try {
      await loadFFmpeg();
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) throw new Error('FFmpeg not initialized');

      setCompressionProgress('파일 로딩 중...');
      const inputName = 'input' + inputFile.name.substring(inputFile.name.lastIndexOf('.'));
      await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

      // 파일 길이 확인
      setCompressionProgress('파일 정보 분석 중...');

      // 청크 분할
      const chunks: File[] = [];
      const chunkDurationSeconds = chunkDurationMinutes * 60;

      setCompressionProgress('파일 분할 중...');

      // 10분 단위로 분할 (최대 6개까지, 총 60분)
      const maxChunks = 6;
      for (let i = 0; i < maxChunks; i++) {
        const outputName = `chunk_${i}.mp3`;
        const startTime = i * chunkDurationSeconds;

        try {
          setCompressionProgress(`${i + 1}번째 파일 분할 중...`);

          await ffmpeg.exec([
            '-i', inputName,
            '-ss', startTime.toString(),
            '-t', chunkDurationSeconds.toString(),
            '-ac', '1',           // 모노로 변환
            '-b:a', '96k',        // 비트레이트 96kbps
            '-ar', '16000',       // 샘플레이트 16kHz
            outputName
          ]);

          const data = await ffmpeg.readFile(outputName);

          // 파일이 너무 작으면 (1KB 미만) 더 이상 분할할 내용이 없는 것
          if ((data as Uint8Array).length < 1000) {
            break;
          }

          // Uint8Array를 일반 ArrayBuffer로 변환
          const uint8Data = data as Uint8Array;
          const arrayBuffer = uint8Data.buffer.slice(
            uint8Data.byteOffset,
            uint8Data.byteOffset + uint8Data.byteLength
          ) as ArrayBuffer;
          const blob = new Blob([arrayBuffer], { type: 'audio/mp3' });
          const chunk = new File([blob], `chunk_${i}.mp3`, { type: 'audio/mp3' });
          chunks.push(chunk);
        } catch {
          // 더 이상 분할할 내용이 없으면 종료
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);

      // 각 파일에 대해 세션 생성
      const newSessions: FileSession[] = files.map((file, index) => ({
        id: `session-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        fileName: file.name,
        file: file,
        transcription: '',
        minutes: '',
        chunks: [],
        status: 'pending' as const,
        createdAt: new Date(),
        projectId: selectedProjectId || undefined,
      }));

      setSessions(prev => [...prev, ...newSessions]);

      // 첫 번째 파일을 자동 선택
      if (newSessions.length > 0) {
        setSelectedSessionId(newSessions[0].id);
      }

      // 프로젝트가 선택되어 있으면 프로젝트에 추가
      if (selectedProjectId) {
        for (const session of newSessions) {
          await addToProject('file', session.id, session.fileName);
        }
      }

      e.target.value = ''; // 같은 파일 재선택 가능하도록
    }
  };

  const transcribeFile = async (fileToTranscribe: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', fileToTranscribe);

    try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `서버 오류 (${response.status})` }));
        throw new Error(errorData.error || `서버 오류: ${response.status}`);
      }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
      
      if (!data.text || data.text.trim() === '') {
        throw new Error('변환된 텍스트가 비어있습니다.');
      }
      
    return data.text;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
    }
  };

  // 여러 파일 일괄 변환
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBatchTranscribe = async () => {
    if (selectedSessionIds.length === 0) {
      showToast('변환할 파일을 선택해주세요.', 'error');
      return;
    }

    const sessionsToTranscribe = sessions.filter(s => selectedSessionIds.includes(s.id) && s.file);

    if (sessionsToTranscribe.length === 0) {
      showToast('선택한 파일 중 변환 가능한 파일이 없습니다.', 'error');
      return;
    }

    showToast(`${sessionsToTranscribe.length}개 파일 일괄 변환을 시작합니다.`, 'info');
    setIsTranscribing(true);

    for (let i = 0; i < sessionsToTranscribe.length; i++) {
      const session = sessionsToTranscribe[i];
      setCompressionProgress(`${i + 1}/${sessionsToTranscribe.length} 파일 처리 중: ${session.fileName}`);

      try {
        await transcribeSingleSession(session.id);
      } catch (error) {
        console.error(`Failed to transcribe ${session.fileName}:`, error);
        showToast(`${session.fileName} 변환 중 오류 발생`, 'error');
        // 오류가 발생해도 다음 파일 계속 처리
      }
    }

    setIsTranscribing(false);
    setCompressionProgress('');
    showToast('모든 파일 변환이 완료되었습니다!', 'success');
  };

  // 단일 세션 변환 (기존 로직 분리)
  const transcribeSingleSession = async (sessionIdOrSession: string | FileSession) => {
    // 세션 ID인지 세션 객체인지 확인
    let session: FileSession | undefined;
    let sessionId: string;
    
    if (typeof sessionIdOrSession === 'string') {
      // 세션 ID로 찾기
      session = sessions.find(s => s.id === sessionIdOrSession);
      sessionId = sessionIdOrSession;
    } else {
      // 세션 객체 직접 사용
      session = sessionIdOrSession;
      sessionId = session.id;
    }
    
    if (!session || !session.file) {
      throw new Error('세션이나 파일을 찾을 수 없습니다.');
    }

    const maxSize = 25 * 1024 * 1024; // 25MB

    // 세션 상태 업데이트 (세션이 없으면 추가, 있으면 상태만 업데이트)
    setSessions(prev => {
      const existingSession = prev.find(s => s.id === sessionId);
      if (existingSession) {
        // 기존 세션 상태 업데이트
        return prev.map(s =>
      s.id === sessionId ? { ...s, status: 'transcribing' as const } : s
        );
      } else {
        // 세션이 없으면 추가 (세션 객체를 직접 받은 경우)
        return [...prev, { ...session, status: 'transcribing' as const }];
      }
    });

    try {
      // 파일이 25MB보다 크면 분할 처리
      if (session.file.size > maxSize) {
        setCompressionProgress('파일이 큽니다. 분할 처리 중...');
        showToast(
          `파일 크기 ${(session.file.size / 1024 / 1024).toFixed(2)}MB - 10분 단위로 자동 분할하여 변환합니다.`,
          'info'
        );

        // 파일 분할
        const chunks = await splitAudioIntoChunks(session.file);

        if (chunks.length === 0) {
          throw new Error('파일 분할 실패');
        }

        showToast(`파일이 ${chunks.length}개로 분할되었습니다. 순차 변환을 시작합니다.`, 'info');

        // 각 청크를 순차적으로 변환
        let fullTranscription = '';
        const chunkSessions: { id: string; name: string; transcription: string }[] = [];

        for (let i = 0; i < chunks.length; i++) {
          setCompressionProgress(`${i + 1}/${chunks.length} 파일 변환 중...`);
          try {
            const chunkText = await transcribeFile(chunks[i]);
            fullTranscription += `\n\n${chunkText}`;
            chunkSessions.push({
              id: `chunk-${i}`,
              name: `Part ${i + 1}`,
              transcription: chunkText
            });
          } catch (error) {
            console.error(`Chunk ${i + 1} error:`, error);
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            showToast(`${i + 1}번째 파트 변환 중 오류 발생: ${errorMessage}`, 'error');
          }
        }

        setCompressionProgress('');

        // 세션 업데이트
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, transcription: fullTranscription.trim(), chunks: chunkSessions, status: 'completed' as const }
            : s
        ));
        
        // 프로젝트 컨텍스트에 변환 텍스트 추가
        if (selectedProjectId && fullTranscription.trim()) {
          const session = sessions.find(s => s.id === sessionId);
          if (session) {
            await fetch(`/api/projects/${selectedProjectId}/context`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contextType: 'file_content',
                title: `${session.fileName} - 변환 텍스트`,
                content: fullTranscription.trim(),
                sourceResourceId: sessionId,
                importance: 7,
              }),
            });
          }
        }
      } else {
        // 일반 변환
        setCompressionProgress('음성 파일 변환 중...');
        const text = await transcribeFile(session.file);
        setCompressionProgress('');

        // 세션 업데이트
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, transcription: text, status: 'completed' as const }
            : s
        ));
        
        // 프로젝트 컨텍스트에 변환 텍스트 추가
        if (selectedProjectId && text) {
          const session = sessions.find(s => s.id === sessionId);
          if (session) {
            await fetch(`/api/projects/${selectedProjectId}/context`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contextType: 'file_content',
                title: `${session.fileName} - 변환 텍스트`,
                content: text,
                sourceResourceId: sessionId,
                importance: 7,
              }),
            });
          }
        }
      }
    } catch (error) {
      console.error('Transcribe error:', error);
      setCompressionProgress('');
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      showToast(`변환 오류: ${errorMessage}`, 'error');
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, status: 'error' as const } : s
      ));
      throw error;
    }
  };

  const handleTranscribe = async () => {
    if (!selectedSession || !selectedSession.file) return;

    const maxSize = 25 * 1024 * 1024; // 25MB

    // 세션 상태 업데이트
    setSessions(prev => prev.map(s =>
      s.id === selectedSessionId ? { ...s, status: 'transcribing' as const } : s
    ));

    setIsTranscribing(true);
    try {
      // 파일이 25MB보다 크면 분할 처리
      if (selectedSession.file.size > maxSize) {
        showToast(
          `파일 크기 ${(selectedSession.file.size / 1024 / 1024).toFixed(2)}MB - 10분 단위로 자동 분할하여 변환합니다.`,
          'info'
        );

        // 파일 분할
        setCompressionProgress('파일 분할 시작...');
        const chunks = await splitAudioIntoChunks(selectedSession.file);

        if (chunks.length === 0) {
          showToast('파일 분할에 실패했습니다.', 'error');
          setSessions(prev => prev.map(s =>
            s.id === selectedSessionId ? { ...s, status: 'error' as const } : s
          ));
          setIsTranscribing(false);
          return;
        }

        showToast(`파일이 ${chunks.length}개로 분할되었습니다. 순차 변환을 시작합니다.`, 'success');

        // 각 청크를 순차적으로 변환
        let fullTranscription = '';
        const chunkSessions: { id: string; name: string; transcription: string }[] = [];

        for (let i = 0; i < chunks.length; i++) {
          setCompressionProgress(`${i + 1}/${chunks.length} 파일 변환 중...`);
          try {
            const chunkText = await transcribeFile(chunks[i]);
            fullTranscription += `\n\n${chunkText}`;
            chunkSessions.push({
              id: `chunk-${i}`,
              name: `Part ${i + 1}`,
              transcription: chunkText
            });
          } catch (error) {
            console.error(`Chunk ${i + 1} error:`, error);
            showToast(`${i + 1}번째 파트 변환 중 오류 발생, 계속 진행합니다.`, 'error');
          }
        }

        setCompressionProgress('');

        // 세션 업데이트
        setSessions(prev => prev.map(s =>
          s.id === selectedSessionId
            ? { ...s, transcription: fullTranscription.trim(), chunks: chunkSessions, status: 'completed' as const }
            : s
        ));

        showToast('모든 파일 변환이 완료되었습니다!', 'success');
      } else {
        // 일반 변환
        const text = await transcribeFile(selectedSession.file);

        // 세션 업데이트
        setSessions(prev => prev.map(s =>
          s.id === selectedSessionId
            ? { ...s, transcription: text, status: 'completed' as const }
            : s
        ));
        showToast('텍스트 변환이 완료되었습니다!', 'success');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('음성 변환 중 오류가 발생했습니다.', 'error');
      setSessions(prev => prev.map(s =>
        s.id === selectedSessionId ? { ...s, status: 'error' as const } : s
      ));
      setCompressionProgress('');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSummarize = async () => {
    if (!selectedSession || !selectedSession.transcription) return;

    setIsSummarizing(true);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: selectedSession.transcription }),
      });

      const data = await response.json();
      if (data.error) {
        showToast(data.error, 'error');
      } else {
        // 세션 업데이트
        setSessions(prev => prev.map(s =>
          s.id === selectedSessionId
            ? { ...s, minutes: data.minutes }
            : s
        ));
        
        // 프로젝트 컨텍스트에 회의록 추가
        if (selectedProjectId && data.minutes) {
          const session = sessions.find(s => s.id === selectedSessionId);
          if (session) {
            await fetch(`/api/projects/${selectedProjectId}/context`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contextType: 'summary',
                title: `${session.fileName} - 회의록`,
                content: data.minutes,
                sourceResourceId: selectedSessionId,
                importance: 8,
              }),
            });
          }
        }
        
        showToast('회의록 생성이 완료되었습니다!', 'success');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('회의록 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleDownload = (type: 'transcription' | 'minutes') => {
    if (!selectedSession) return;

    const content = type === 'transcription' ? selectedSession.transcription : selectedSession.minutes;
    if (!content) {
      showToast('다운로드할 내용이 없습니다.', 'error');
      return;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = selectedSession.fileName.replace(/\.[^/.]+$/, '');
    a.download = `${fileName}_${type === 'transcription' ? '변환텍스트' : '회의록'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('파일이 다운로드되었습니다.', 'success');
  };

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);

    // 실제 변환 작업 중일 때만 삭제 불가 (멈춰있는 상태는 삭제 가능)
    if (session?.status === 'transcribing' && isTranscribing) {
      showToast('변환 작업 중인 파일은 삭제할 수 없습니다.', 'error');
      return;
    }

    try {
      // DB에서도 삭제
      await fetch(`/api/sessions?sessionId=${sessionId}&type=file`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('세션 삭제 실패:', error);
    }

    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(sessions.find(s => s.id !== sessionId)?.id || null);
    }
    showToast('파일이 삭제되었습니다.', 'info');
  }, [sessions, isTranscribing, showToast, setSessions, selectedSessionId]);

  // 녹음 시간 포맷팅
  const formatRecordingTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 시스템 시간 포맷팅
  const formatSystemTime = () => {
    const now = new Date();
    const hrs = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    const secs = now.getSeconds().toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  // 메모 생성
  const createMemo = async () => {
    const newMemo: MemoSession = {
      id: `memo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: memoTitle || `메모 ${memoSessions.length + 1}`,
      content: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      type: 'memo',
    };
    setMemoSessions(prev => [...prev, newMemo]);
    setSelectedMemoId(newMemo.id);
    setMemoTitle(newMemo.title);
    setMemoContent('');
    setMemoPanelOpen(true);
    
    // 프로젝트가 선택되어 있으면 프로젝트에 추가
    if (selectedProjectId) {
      await addToProject('memo', newMemo.id, newMemo.title);
    }
    
    showToast('새 메모가 생성되었습니다.', 'success');
  };

  // 메모 저장
  const saveMemo = async () => {
    if (!selectedMemoId) {
      createMemo();
      return;
    }

    const updatedMemo = {
      content: memoContent,
      title: memoTitle || memoSessions.find(m => m.id === selectedMemoId)?.title || '메모',
    };

    setMemoSessions(prev => prev.map(memo => 
      memo.id === selectedMemoId 
        ? { ...memo, ...updatedMemo, updatedAt: new Date() }
        : memo
    ));
    
    // 프로젝트 컨텍스트에 메모 내용 추가/업데이트
    if (selectedProjectId && memoContent) {
      await fetch(`/api/projects/${selectedProjectId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextType: 'memo',
          title: updatedMemo.title,
          content: memoContent,
          sourceResourceId: selectedMemoId,
          importance: 6,
        }),
      });
    }
    
    showToast('메모가 저장되었습니다.', 'success');
  };

  // 채팅 세션 삭제
  const deleteChatSession = async (chatId: string) => {
    try {
      // API를 통해 채팅 세션 삭제
      const response = await fetch(`/api/athena/session/${chatId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('채팅 세션 삭제 실패');
      }
    } catch (error) {
      console.error('채팅 세션 삭제 실패:', error);
      showToast('채팅 세션 삭제 중 오류가 발생했습니다.', 'error');
      return;
    }
    
    setChatSessions(prev => prev.filter(c => c.id !== chatId));
    if (selectedSessionId === chatId) {
      setSelectedSessionId(null);
    }
    showToast('채팅 세션이 삭제되었습니다.', 'info');
  };

  // 메모 삭제
  const deleteMemo = async (memoId: string) => {
    try {
      // DB에서도 삭제
      await fetch(`/api/sessions?sessionId=${memoId}&type=memo`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('메모 삭제 실패:', error);
    }
    
    setMemoSessions(prev => prev.filter(m => m.id !== memoId));
    if (selectedMemoId === memoId) {
      setSelectedMemoId(null);
      setMemoContent('');
      setMemoTitle('');
    }
    showToast('메모가 삭제되었습니다.', 'info');
  };

  // 메모 다운로드
  const downloadMemo = () => {
    if (!selectedMemoId) return;
    const memo = memoSessions.find(m => m.id === selectedMemoId);
    if (!memo) return;

    const content = `제목: ${memo.title}\n생성일: ${memo.createdAt.toLocaleString('ko-KR')}\n수정일: ${memo.updatedAt.toLocaleString('ko-KR')}\n\n${memo.content}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${memo.title.replace(/[^a-z0-9가-힣]/gi, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('메모가 다운로드되었습니다.', 'success');
  };

  const handleSaveMemoAction = () => {
    if (selectedMemoId) {
      saveMemo();
    } else {
      createMemo();
    }
  };

  const handleCloseMemo = () => {
    setSelectedMemoId(null);
    setMemoContent('');
    setMemoTitle('');
  };

  // 한글 입력 중인지 추적
  const [isComposing, setIsComposing] = useState(false);

  // 메모 입력 핸들러 (엔터 처리)
  const handleMemoKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 입력 중이면 처리하지 않음
    if (isComposing) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = memoContent;
      
      // 현재 줄의 텍스트 확인
      const lines = currentText.substring(0, start).split('\n');
      const currentLine = lines[lines.length - 1];
      
      // 빈 줄이 아니면 시간 추가
      if (currentLine.trim() !== '') {
        let timeStamp = '';
        if (isRecording) {
          timeStamp = ` [${formatRecordingTime(recordingTime)}]`;
        } else {
          timeStamp = ` [${formatSystemTime()}]`;
        }
        
        const newText = currentText.substring(0, start) + timeStamp + '\n' + currentText.substring(end);
        setMemoContent(newText);
        
        // 커서 위치 조정
        setTimeout(() => {
          const newPosition = start + timeStamp.length + 1;
          textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
      } else {
        // 빈 줄이면 그냥 줄바꿈만
        const newText = currentText.substring(0, start) + '\n' + currentText.substring(end);
        setMemoContent(newText);
        setTimeout(() => {
          textarea.setSelectionRange(start + 1, start + 1);
        }, 0);
      }
    }
  };

  // 한글 입력 시작/종료 처리
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleStopRecording = async (autoTranscribe: boolean = false) => {
    const result = await stopRecording();
    if (!result) return;

    const { file, fileName } = result;

    const newSession: FileSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileName: fileName,
      file,
      transcription: '',
      minutes: '',
      chunks: [],
      status: 'pending',
      createdAt: new Date(),
      projectId: selectedProjectId || undefined,
    };

    if (selectedProjectId) {
      await addToProject('file', newSession.id, fileName);
    }

    setSessions(prev => [...prev, newSession]);
    setSelectedSessionId(newSession.id);
    showToast('녹음이 저장되었습니다!', 'success');

    if (autoTranscribe) {
      setTimeout(async () => {
        try {
          setIsTranscribing(true);
          showToast('음성 변환을 시작합니다...', 'info');
          await transcribeSingleSession(newSession);
          showToast('음성 변환이 완료되었습니다!', 'success');
        } catch (error) {
          console.error('Auto transcribe error:', error);
          const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
          showToast(`음성 변환 중 오류가 발생했습니다: ${errorMessage}`, 'error');
          setSessions(prev => prev.map(s =>
            s.id === newSession.id ? { ...s, status: 'error' as const } : s
          ));
        } finally {
          setIsTranscribing(false);
        }
      }, 500);
    }
  };

  // 구글 로그인 핸들러
  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google?action=login';
  };

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout');
      window.location.reload();
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
  };

  const handleCopy = async (type: 'transcription' | 'minutes') => {
    if (!selectedSession) return;

    const content = type === 'transcription' ? selectedSession.transcription : selectedSession.minutes;
    if (!content) {
      showToast('복사할 내용이 없습니다.', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(type);
      showToast('클립보드에 복사되었습니다!', 'success');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (error) {
      console.error('Error copying text:', error);
      showToast('텍스트 복사에 실패했습니다.', 'error');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900" data-theme={theme}>
      <ToastContainer toasts={toasts} />

      {/* 상단 녹음기 바 */}
      {isMounted && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {!isRecording ? (
              <>
                <button
                  onClick={startRecording}
                  disabled={isTranscribing || isCompressing}
                  className="bg-red-600 hover:bg-red-700 text-white py-1.5 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <span className="text-sm">●</span> 녹음 시작
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">음성 녹음 후 바로 텍스트로 변환할 수 있습니다</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-600 animate-pulse'}`}></div>
                  <span className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                    {formatRecordingTime(recordingTime)}
                  </span>
                  {isPaused && <span className="text-xs text-yellow-600 dark:text-yellow-400">일시정지</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePauseRecording}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white py-1 px-3 rounded text-xs font-medium transition-colors"
                  >
                    {isPaused ? '▶ 재개' : '⏸ 일시정지'}
                  </button>
                  <button
                    onClick={() => handleStopRecording(false)}
                    className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded text-xs font-medium transition-colors"
                  >
                    ■ 저장
                  </button>
                  <button
                    onClick={() => handleStopRecording(true)}
                    className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded text-xs font-medium transition-colors"
                  >
                    ■ 저장 & 변환
                  </button>
                  <button
                    onClick={cancelRecording}
                    className="bg-gray-500 hover:bg-gray-600 text-white py-1 px-3 rounded text-xs font-medium transition-colors"
                  >
                    ✕ 취소
                  </button>
                </div>
                <div className="hidden md:block w-32 h-8">
                  <canvas
                    ref={canvasRef}
                    width="128"
                    height="32"
                    className="w-full h-full"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      )}

      {/* 메인 레이아웃 */}
      <div className="flex flex-1 overflow-hidden">

      {/* 사이드바 */}
      {isMounted && (
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-white dark:bg-gray-800 shadow-lg overflow-hidden flex flex-col`}>
        <div className="p-4 border-b dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">파일 목록</h2>
            <div className="flex gap-2">
              {isMounted && (
                <button
                  onClick={() => {
                    createMemo();
                    setMemoPanelOpen(true);
                  }}
                  className="text-xs text-green-600 hover:text-green-800 font-medium"
                  title="새 메모"
                >
                  + 메모
                </button>
              )}
              {isMounted && sessions.length > 0 && (
                <button
                  onClick={() => {
                    if (selectedSessionIds.length === sessions.length) {
                      setSelectedSessionIds([]);
                    } else {
                      setSelectedSessionIds(sessions.map(s => s.id));
                    }
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {selectedSessionIds.length === sessions.length ? '전체 해제' : '전체 선택'}
                </button>
              )}
              {isMounted && selectedSessionIds.length > 0 && selectedSessionIds.length < sessions.length && (
                <button
                  onClick={() => setSelectedSessionIds([])}
                  className="text-xs text-gray-600 hover:text-gray-800"
                >
                  선택 해제
                </button>
              )}
            </div>
          </div>
          
          {/* 구글 로그인/로그아웃 버튼 */}
          <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
            {isAuthenticated ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                    {userName ? userName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{userName || '사용자'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">구글 로그인</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50"
                  title="로그아웃"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors shadow-sm"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                구글 로그인
              </button>
            )}
          </div>

          {/* 검색 입력 */}
          {isMounted && (
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="검색... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              )}
            </div>
          )}
          
          {/* 정렬 옵션 */}
          {isMounted && sessions.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600 dark:text-gray-400">정렬:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'name')}
                className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="date">날짜</option>
                <option value="name">이름</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                title={sortOrder === 'asc' ? '오름차순' : '내림차순'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          )}
          
          {isMounted && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {filteredAndSortedSessions.length}개 파일
              {filteredAndSortedMemos.length > 0 && ` · ${filteredAndSortedMemos.length}개 메모`}
              {searchQuery && filteredAndSortedSessions.length !== sessions.length && ` (전체 ${sessions.length}개 중)`}
              {selectedSessionIds.length > 0 && ` · ${selectedSessionIds.length}개 선택`}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 프로젝트 관리 */}
          {isMounted && (
            <div className="mb-4 pb-4 border-b">
              <ProjectManager
                userId={userId}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                showToast={showToast}
                refreshTrigger={projectRefreshTrigger}
                onAddResourceToProject={async (projectId, resourceType, resourceId, title, content) => {
                  try {
                    const response = await fetch(`/api/projects/${projectId}/resources`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        resourceType,
                        resourceId,
                        title,
                        content: content || '',
                      }),
                    });
                    const result = await response.json();
                    if (!result.success) {
                      throw new Error(result.error || '추가 실패');
                    }
                    // 파일인 경우 projectId 업데이트
                    if (resourceType === 'file') {
                      setSessions(prev => prev.map(s =>
                        s.id === resourceId ? { ...s, projectId } : s
                      ));
                    }
                    // 메모인 경우 projectId 업데이트
                    if (resourceType === 'memo') {
                      setMemoSessions(prev => prev.map(m =>
                        m.id === resourceId ? { ...m, projectId } : m
                      ));
                    }
                  } catch (error) {
                    console.error('Failed to add resource:', error);
                    throw error;
                  }
                }}
              />
            </div>
          )}

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

          {/* 채팅 세션 목록 */}
          <div className="mt-4">
            <div className="w-full flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
              <button
                onClick={() => toggleSection('chats')}
                className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <span className={`transition-transform ${collapsedSections.chats ? '' : 'rotate-90'}`}>▶</span>
                💬 채팅 세션 ({filteredAndSortedChatSessions.length})
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedSessionId(null);
                }}
                className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded transition-colors"
                title="새 채팅 시작"
              >
                + 새 채팅
              </button>
            </div>
            {!collapsedSections.chats && filteredAndSortedChatSessions.length > 0 ? (
              <>
              {filteredAndSortedChatSessions.map((chat) => (
                <div
                  key={`chat-${chat.id}`}
                  className={`p-3 rounded-lg transition-colors mb-2 ${
                    selectedSessionId === chat.id
                      ? 'bg-green-50 dark:bg-green-900/30 border-2 border-green-500 dark:border-green-400'
                      : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => {
                        // 채팅 세션인 경우 AthenaCopilot에 세션 ID 전달
                        setSelectedSessionId(chat.id);
                        setSelectedMemoId(null);
                      }}
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={chat.title}>
                        💬 {chat.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {chat.messageCount || 0}개 메시지
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {chat.updatedAt.toLocaleDateString('ko-KR')}
                        </span>
                        {/* 프로젝트 라벨 표시 */}
                        {chat.projectId && getProjectName(chat.projectId) && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                            📁 {getProjectName(chat.projectId)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChatSession(chat.id);
                        }}
                        className="text-gray-400 hover:text-red-600 text-lg leading-none"
                        title="삭제"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              </>
            ) : !collapsedSections.chats ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                채팅 세션이 없습니다. &quot;+ 새 채팅&quot; 버튼을 눌러 시작하세요.
              </p>
            ) : null}
          </div>

          {/* 메모 세션 목록 */}
          {filteredAndSortedMemos.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => toggleSection('memos')}
                className="w-full flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <span className="flex items-center gap-1">
                  <span className={`transition-transform ${collapsedSections.memos ? '' : 'rotate-90'}`}>▶</span>
                  📝 메모 ({filteredAndSortedMemos.length})
                </span>
              </button>
              {!collapsedSections.memos && filteredAndSortedMemos.map((memo) => (
                <div
                  key={`memo-${memo.id}`}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      type: 'memo',
                      id: memo.id,
                      title: memo.title,
                      content: memo.content,
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                    // 드래그 이미지 커스터마이징
                    const dragImage = document.createElement('div');
                    dragImage.className = 'bg-green-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium';
                    dragImage.textContent = `📝 ${memo.title}`;
                    dragImage.style.position = 'absolute';
                    dragImage.style.top = '-1000px';
                    document.body.appendChild(dragImage);
                    e.dataTransfer.setDragImage(dragImage, 0, 0);
                    setTimeout(() => document.body.removeChild(dragImage), 0);
                  }}
                  className={`p-3 rounded-lg transition-all mb-2 cursor-pointer ${
                    selectedMemoId === memo.id
                      ? 'bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-500 dark:border-yellow-400'
                      : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => {
                        setSelectedMemoId(memo.id);
                        setSelectedSessionId(null);
                        setMemoPanelOpen(true);
                      }}
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={memo.title}>
                        {memo.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {memo.content.substring(0, 50)}{memo.content.length > 50 ? '...' : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {memo.updatedAt.toLocaleDateString('ko-KR')}
                        </span>
                        {/* 프로젝트 라벨 표시 */}
                        {memo.projectId && getProjectName(memo.projectId) && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                            📁 {getProjectName(memo.projectId)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {selectedProjectId && !memo.projectId && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await addToProject('memo', memo.id, memo.title, memo.content);
                            // 메모에 projectId 추가
                            setMemoSessions(prev => prev.map(m =>
                              m.id === memo.id ? { ...m, projectId: selectedProjectId } : m
                            ));
                          }}
                          className="flex items-center gap-1 text-xs text-white bg-green-500 hover:bg-green-600 px-2 py-1 rounded font-medium transition-colors"
                          title="프로젝트에 추가"
                        >
                          + 추가
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMemo(memo.id);
                        }}
                        className="text-gray-400 hover:text-red-600 text-lg leading-none p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        title="삭제"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 빈 상태 메시지 */}
          {filteredAndSortedSessions.length === 0 && filteredAndSortedMemos.length === 0 && filteredAndSortedChatSessions.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <p className="text-sm">
                {searchQuery ? '검색 결과가 없습니다' : '업로드된 파일이 없습니다'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800"
                >
                  검색 초기화
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* 사이드바 토글 버튼 */}
      {isMounted && (
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-0 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 shadow-md p-2 rounded-r-lg hover:bg-gray-50 dark:hover:bg-gray-700 z-10 text-gray-900 dark:text-gray-100"
        style={{ left: sidebarOpen ? '320px' : '0px', transition: 'left 0.3s' }}
      >
        {sidebarOpen ? '◀' : '▶'}
      </button>
      )}

      {/* 메인 콘텐츠 영역 - 코파일럿이 기본 */}
      {isMounted && (
        <div className="flex-1 flex overflow-hidden">
          {/* Athena AI 코파일럿 패널 - 메인 영역 차지 */}
          <AthenaCopilot
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            selectedProjectId={selectedProjectId}
            projectName={getProjectName(selectedProjectId || undefined)}
            onTranscribe={async (sessionId: string) => {
              const session = sessions.find(s => s.id === sessionId);
              if (session) {
                setSelectedSessionId(sessionId);
                await transcribeSingleSession(sessionId);
              }
            }}
            onSummarize={async (sessionId: string) => {
              const session = sessions.find(s => s.id === sessionId);
              if (session) {
                setSelectedSessionId(sessionId);
                if (session.transcription) {
                  await handleSummarize();
                }
              }
            }}
            onDeleteSession={handleDeleteSession}
            onSelectSession={setSelectedSessionId}
            onCreateMemo={createMemo}
            showToast={showToast}
            onOpenChange={setCopilotOpen}
            onNewProjectChat={(projectId) => {
              // 프로젝트 연결 채팅이 생성되면 채팅 세션 목록 새로고침
              setProjectRefreshTrigger(prev => prev + 1);
            }}
          />

          <MemoPanel
            open={memoPanelOpen}
            onToggle={() => setMemoPanelOpen(!memoPanelOpen)}
            selectedMemoId={selectedMemoId}
            memoTitle={memoTitle}
            memoContent={memoContent}
            isCopilotOpen={copilotOpen}
            onTitleChange={setMemoTitle}
            onContentChange={setMemoContent}
            onCreateMemo={createMemo}
            onSaveMemo={handleSaveMemoAction}
            onDownloadMemo={downloadMemo}
            onCloseMemo={handleCloseMemo}
            memoTextareaRef={memoTextareaRef}
            onMemoKeyDown={handleMemoKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />

          {/* 파일 정보 패널 (선택 시에만 오른쪽에 표시) */}
          {selectedSession && (
            <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
              {/* 파일 정보 패널 헤더 */}
              <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">파일 정보</h2>
                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2 py-1"
                  title="닫기"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
              {/* 변환 진행 상태 표시 */}
              {(isTranscribing || compressionProgress || selectedSession.status === 'transcribing') && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-300">
                  <div className="flex items-center space-x-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <div className="flex-1">
                      <p className="text-blue-800 font-semibold">
                        {compressionProgress || '음성 변환 중...'}
                      </p>
                      <p className="text-blue-600 text-sm mt-1">
                        잠시만 기다려주세요. 완료되면 자동으로 표시됩니다.
                    </p>
                  </div>
                </div>
              </div>
            )}

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedSession.fileName}</h2>
                <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedSession.file ? `${(selectedSession.file.size / 1024 / 1024).toFixed(2)}MB` : '파일 정보 없음'}
                </span>
                  {selectedSession.status === 'transcribing' && (
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium animate-pulse">
                      변환 중...
                    </span>
                  )}
                  {selectedSession.status === 'error' && (
                    <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                      오류 발생
                    </span>
                  )}
                </div>
              </div>

              {/* 오디오 플레이어 */}
              {selectedSession.file && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">🎵 녹음 파일 재생</p>
                  <audio
                    controls
                    className="w-full"
                    src={URL.createObjectURL(selectedSession.file)}
                  />
                </div>
              )}

              <div className="flex gap-3 mb-4">
                <button
                  onClick={handleTranscribe}
                  disabled={!selectedSession.file || isTranscribing || isCompressing || selectedSession.status === 'transcribing'}
                  className="flex-1 bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {selectedSession.status === 'transcribing' ? '변환 중...' : '텍스트로 변환'}
                </button>
                <button
                  onClick={handleSummarize}
                  disabled={!selectedSession.transcription || isSummarizing || isCompressing}
                  className="flex-1 bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {isSummarizing ? '생성 중...' : '회의록 생성'}
                </button>
              </div>

              {/* 변환된 텍스트 */}
              {selectedSession.transcription && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">변환된 텍스트</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy('transcription')}
                        className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-medium transition-colors"
                      >
                        {copySuccess === 'transcription' ? '✓ 복사됨' : '복사'}
                      </button>
                      <button
                        onClick={() => handleDownload('transcription')}
                        className="text-sm bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded font-medium transition-colors"
                      >
                        다운로드
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {selectedSession.transcription}
                    </p>
                  </div>
                </div>
              )}

              {/* 회의록 */}
              {selectedSession.minutes && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">회의록</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy('minutes')}
                        className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded font-medium transition-colors"
                      >
                        {copySuccess === 'minutes' ? '✓ 복사됨' : '복사'}
                      </button>
                      <button
                        onClick={() => handleDownload('minutes')}
                        className="text-sm bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded font-medium transition-colors"
                      >
                        다운로드
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-[600px] overflow-y-auto">
                    <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {selectedSession.minutes}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          )}

        </div>
      )}
      </div>
    </div>
  );
}
