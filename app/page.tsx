'use client';

import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { MemoSession } from './types';

interface FileSession {
  id: string;
  fileName: string;
  file: File | null;
  transcription: string;
  minutes: string;
  chunks: { id: string; name: string; transcription: string }[];
  status: 'pending' | 'transcribing' | 'completed' | 'error';
  createdAt: Date;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

export default function Home() {
  const [sessions, setSessions] = useState<FileSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]); // 다중 선택
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null); // 어느 버튼이 복사되었는지 추적
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  
  // 검색 및 정렬 관련 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // 메모장 관련 상태
  const [memoSessions, setMemoSessions] = useState<MemoSession[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [memoContent, setMemoContent] = useState('');
  const [memoTitle, setMemoTitle] = useState('');
  const [memoPanelOpen, setMemoPanelOpen] = useState(true); // 기본적으로 메모장 열림
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Hydration 오류 방지: 클라이언트 마운트 여부 추적
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 녹음 관련 상태
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  // 검색 및 정렬된 세션 목록 (파일)
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

  // 검색 및 정렬된 메모 목록
  const filteredAndSortedMemos = memoSessions
    .filter(memo => {
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
      
      // Delete: 선택된 세션 삭제
      if (e.key === 'Delete' && selectedSessionId && !isTranscribing && !isCompressing) {
        const session = sessions.find(s => s.id === selectedSessionId);
        if (session && session.status !== 'transcribing') {
          handleDeleteSession(selectedSessionId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, sidebarOpen, selectedSessionId, isTranscribing, isCompressing, sessions]);

  // 토스트 알림 표시
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // 웨이브폼 그리기 (isPaused 변경 시 색상 업데이트)
  useEffect(() => {
    if (isRecording && canvasRef.current && analyserRef.current) {
      const canvas = canvasRef.current;
      const canvasCtx = canvas.getContext('2d');
      const analyser = analyserRef.current;

      if (!canvasCtx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!isRecording) return; // 녹음이 끝나면 중지

        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);

        canvasCtx.fillStyle = 'rgb(255, 255, 255)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = isPaused ? 'rgb(234, 179, 8)' : 'rgb(220, 38, 38)';

        canvasCtx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;

          if (i === 0) {
            canvasCtx.moveTo(x, y);
          } else {
            canvasCtx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();
      };

      draw();
    }
  }, [isRecording, isPaused]);

  // localStorage에서 세션 복원
  useEffect(() => {
    try {
      const savedSessions = localStorage.getItem('meeting-sessions');
      if (savedSessions) {
        try {
          const parsed = JSON.parse(savedSessions);
          // 배열인지 확인
          if (Array.isArray(parsed) && parsed.length > 0) {
            // File 객체는 저장할 수 없으므로, 기본 정보만 복원
            const restoredSessions = parsed.map((s: FileSession) => ({
              ...s,
              file: null, // File 객체는 복원 불가
              createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
              // 변환 중 상태였다면 대기 상태로 리셋 (페이지 새로고침 후 멈춰있는 파일 방지)
              status: s.status === 'transcribing' ? 'pending' : (s.status || 'pending'),
              transcription: s.transcription || '',
              minutes: s.minutes || '',
              chunks: s.chunks || [],
            }));
            setSessions(restoredSessions);
            console.log(`세션 ${restoredSessions.length}개 복원 완료`);
          }
        } catch (error) {
          console.error('세션 데이터 파싱 실패:', error);
          // 손상된 데이터는 삭제
          localStorage.removeItem('meeting-sessions');
        }
      }
    } catch (error) {
      console.error('localStorage 접근 실패:', error);
    }
  }, []);

  // 세션이 변경될 때마다 localStorage에 저장
  useEffect(() => {
    try {
      // File 객체를 제외하고 저장
      const sessionsToSave = sessions.map(s => ({
        id: s.id,
        fileName: s.fileName,
        file: s.file ? {
          name: s.file.name,
          size: s.file.size,
          type: s.file.type,
        } : null,
        transcription: s.transcription || '',
        minutes: s.minutes || '',
        chunks: s.chunks || [],
        status: s.status,
        createdAt: s.createdAt,
      }));
      
      // 빈 배열도 저장 (명시적으로 초기화)
      localStorage.setItem('meeting-sessions', JSON.stringify(sessionsToSave));
    } catch (error) {
      console.error('localStorage 저장 실패:', error);
      // 저장 실패해도 앱은 계속 작동
    }
  }, [sessions]);

  // 메모 세션 localStorage에서 복원
  useEffect(() => {
    try {
      const savedMemos = localStorage.getItem('meeting-memos');
      if (savedMemos) {
        try {
          const parsed = JSON.parse(savedMemos);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const restoredMemos = parsed.map((m: MemoSession) => ({
              ...m,
              createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
              updatedAt: m.updatedAt ? new Date(m.updatedAt) : new Date(),
            }));
            setMemoSessions(restoredMemos);
          }
        } catch (error) {
          console.error('메모 데이터 파싱 실패:', error);
          localStorage.removeItem('meeting-memos');
        }
      }
    } catch (error) {
      console.error('localStorage 접근 실패:', error);
    }
  }, []);

  // 메모 세션이 변경될 때마다 localStorage에 저장
  useEffect(() => {
    try {
      const memosToSave = memoSessions.map(m => ({
        id: m.id,
        title: m.title,
        content: m.content,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        type: m.type,
      }));
      localStorage.setItem('meeting-memos', JSON.stringify(memosToSave));
    } catch (error) {
      console.error('메모 localStorage 저장 실패:', error);
    }
  }, [memoSessions]);

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);

      // 각 파일에 대해 세션 생성
      const newSessions: FileSession[] = files.map(file => ({
        id: `${Date.now()}-${Math.random()}`,
        fileName: file.name,
        file: file,
        transcription: '',
        minutes: '',
        chunks: [],
        status: 'pending' as const,
        createdAt: new Date(),
      }));

      setSessions(prev => [...prev, ...newSessions]);

      // 첫 번째 파일을 자동 선택
      if (newSessions.length > 0) {
        setSelectedSessionId(newSessions[0].id);
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

  const handleDeleteSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);

    // 실제 변환 작업 중일 때만 삭제 불가 (멈춰있는 상태는 삭제 가능)
    if (session?.status === 'transcribing' && isTranscribing) {
      showToast('변환 작업 중인 파일은 삭제할 수 없습니다.', 'error');
      return;
    }

    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(sessions.find(s => s.id !== sessionId)?.id || null);
    }
    showToast('파일이 삭제되었습니다.', 'info');
  };

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
  const createMemo = () => {
    const newMemo: MemoSession = {
      id: `memo-${Date.now()}`,
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
    showToast('새 메모가 생성되었습니다.', 'success');
  };

  // 메모 저장
  const saveMemo = () => {
    if (!selectedMemoId) {
      createMemo();
      return;
    }

    setMemoSessions(prev => prev.map(memo => 
      memo.id === selectedMemoId 
        ? { ...memo, content: memoContent, title: memoTitle || memo.title, updatedAt: new Date() }
        : memo
    ));
    showToast('메모가 저장되었습니다.', 'success');
  };

  // 메모 삭제
  const deleteMemo = (memoId: string) => {
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

  // 녹음 시작
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // 오디오 컨텍스트 및 분석기 설정
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 2048;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setIsPaused(false);

      // 녹음 시간 카운터
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      showToast('녹음이 시작되었습니다.', 'success');
    } catch (error) {
      console.error('Recording error:', error);
      showToast('마이크 접근 권한이 필요합니다.', 'error');
    }
  };

  // 녹음 일시정지/재개
  const togglePauseRecording = () => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      setIsPaused(false);
      showToast('녹음을 재개합니다.', 'info');
    } else {
      mediaRecorderRef.current.pause();
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      setIsPaused(true);
      showToast('녹음이 일시정지되었습니다.', 'info');
    }
  };

  // 녹음 중지 및 저장 (항상 파일로 다운로드)
  const stopRecording = async (autoTranscribe: boolean = false) => {
    if (!mediaRecorderRef.current) return;

    return new Promise<void>((resolve) => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const fileName = `녹음_${new Date().toLocaleString('ko-KR').replace(/[. :]/g, '_')}.webm`;
          const audioFile = new File([audioBlob], fileName, { type: 'audio/webm' });

          // 항상 로컬 파일로 다운로드
          const url = URL.createObjectURL(audioBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('녹음 파일이 다운로드되었습니다!', 'success');

          // 세션에 추가
          const newSession: FileSession = {
            id: `${Date.now()}-${Math.random()}`,
            fileName: fileName,
            file: audioFile,
            transcription: '',
            minutes: '',
            chunks: [],
            status: 'pending',
            createdAt: new Date(),
          };

          setSessions(prev => [...prev, newSession]);
          setSelectedSessionId(newSession.id);

          // 녹음 정리
          const stream = mediaRecorderRef.current?.stream;
          stream?.getTracks().forEach(track => track.stop());

          if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
          }

          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }

          if (audioContextRef.current) {
            audioContextRef.current.close();
          }

          setIsRecording(false);
          setRecordingTime(0);
          setIsPaused(false);
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
          audioContextRef.current = null;
          analyserRef.current = null;

          showToast('녹음이 저장되었습니다!', 'success');

          // 자동 변환
          if (autoTranscribe) {
            // 세션 객체를 직접 전달하여 상태 업데이트 지연 문제 해결
            setTimeout(async () => {
              try {
                setIsTranscribing(true);
                showToast('음성 변환을 시작합니다...', 'info');
                // 세션 객체를 직접 전달 (상태 업데이트 대기 불필요)
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

          resolve();
        };

        mediaRecorderRef.current.stop();
      }
    });
  };

  // 녹음 취소
  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      const stream = mediaRecorderRef.current.stream;
      stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    audioChunksRef.current = [];
    audioContextRef.current = null;
    analyserRef.current = null;
    setIsRecording(false);
    setRecordingTime(0);
    setIsPaused(false);
    showToast('녹음이 취소되었습니다.', 'info');
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
    <div className="flex flex-col h-screen bg-gray-100">
      {/* 토스트 알림 */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-slide-in-right ${
              toast.type === 'success' ? 'bg-green-500' :
              toast.type === 'error' ? 'bg-red-500' :
              'bg-blue-500'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* 상단 녹음기 바 */}
      <div className="bg-white border-b border-gray-200 shadow-sm px-4 py-2 flex items-center justify-between">
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
              <span className="text-xs text-gray-500">음성 녹음 후 바로 텍스트로 변환할 수 있습니다</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-600 animate-pulse'}`}></div>
                <span className="text-sm font-mono font-medium text-gray-900">
                  {formatRecordingTime(recordingTime)}
                </span>
                {isPaused && <span className="text-xs text-yellow-600">일시정지</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePauseRecording}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white py-1 px-3 rounded text-xs font-medium transition-colors"
                >
                  {isPaused ? '▶ 재개' : '⏸ 일시정지'}
                </button>
                <button
                  onClick={() => stopRecording(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded text-xs font-medium transition-colors"
                >
                  ■ 저장
                </button>
                <button
                  onClick={() => stopRecording(true)}
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
              {canvasRef.current && (
                <div className="hidden md:block w-32 h-8">
                  <canvas
                    ref={canvasRef}
                    width="128"
                    height="32"
                    className="w-full h-full"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 메인 레이아웃 */}
      <div className="flex flex-1 overflow-hidden">

      {/* 사이드바 */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-white shadow-lg overflow-hidden flex flex-col`}>
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">파일 목록</h2>
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <span className="text-gray-600">정렬:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'name')}
                className="px-2 py-1 border border-gray-300 rounded text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="date">날짜</option>
                <option value="name">이름</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                title={sortOrder === 'asc' ? '오름차순' : '내림차순'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          )}
          
          {isMounted && (
            <p className="text-xs text-gray-500">
              {filteredAndSortedSessions.length}개 파일
              {filteredAndSortedMemos.length > 0 && ` · ${filteredAndSortedMemos.length}개 메모`}
              {searchQuery && filteredAndSortedSessions.length !== sessions.length && ` (전체 ${sessions.length}개 중)`}
              {selectedSessionIds.length > 0 && ` · ${selectedSessionIds.length}개 선택`}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* 파일 세션 목록 */}
          {filteredAndSortedSessions.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">📁 파일</h3>
              {filteredAndSortedSessions.map((session) => (
            <div
              key={session.id}
              className={`p-3 rounded-lg transition-colors ${
                selectedSessionId === session.id
                  ? 'bg-blue-50 border-2 border-blue-500'
                  : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
              }`}
            >
              <div className="flex items-start gap-2">
                {/* 체크박스 */}
                <input
                  type="checkbox"
                  checked={selectedSessionIds.includes(session.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (e.target.checked) {
                      setSelectedSessionIds(prev => [...prev, session.id]);
                    } else {
                      setSelectedSessionIds(prev => prev.filter(id => id !== session.id));
                    }
                  }}
                  className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />

                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <p className="text-sm font-medium text-gray-900 truncate" title={session.fileName}>
                    {session.fileName}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {session.file && (
                      <span className="text-xs text-gray-500">
                        {(session.file.size / 1024 / 1024).toFixed(1)}MB
                      </span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      session.status === 'completed' ? 'bg-green-100 text-green-700' :
                      session.status === 'transcribing' ? 'bg-blue-100 text-blue-700' :
                      session.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {session.status === 'completed' ? '✓' :
                       session.status === 'transcribing' ? '...' :
                       session.status === 'error' ? '!' : '◯'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-1">
                  {/* 변환 중 상태를 수동으로 재설정할 수 있는 버튼 */}
                  {session.status === 'transcribing' && !isTranscribing && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessions(prev => prev.map(s =>
                          s.id === session.id ? { ...s, status: 'pending' as const } : s
                        ));
                        showToast('파일 상태를 대기로 변경했습니다.', 'info');
                      }}
                      className="text-yellow-600 hover:text-yellow-800 text-sm leading-none"
                      title="상태 초기화"
                    >
                      ⟳
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
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
            </div>
          )}

          {/* 메모 세션 목록 */}
          {filteredAndSortedMemos.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">📝 메모</h3>
              {filteredAndSortedMemos.map((memo) => (
                <div
                  key={memo.id}
                  className={`p-3 rounded-lg transition-colors mb-2 ${
                    selectedMemoId === memo.id
                      ? 'bg-green-50 border-2 border-green-500'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
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
                      <p className="text-sm font-medium text-gray-900 truncate" title={memo.title}>
                        {memo.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {memo.content.substring(0, 50)}{memo.content.length > 50 ? '...' : ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {memo.updatedAt.toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMemo(memo.id);
                      }}
                      className="text-gray-400 hover:text-red-600 text-lg leading-none"
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 빈 상태 메시지 */}
          {filteredAndSortedSessions.length === 0 && filteredAndSortedMemos.length === 0 && (
            <div className="text-center text-gray-500 py-8">
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

      {/* 사이드바 토글 버튼 */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-0 top-1/2 -translate-y-1/2 bg-white shadow-md p-2 rounded-r-lg hover:bg-gray-50 z-10"
        style={{ left: sidebarOpen ? '320px' : '0px', transition: 'left 0.3s' }}
      >
        {sidebarOpen ? '◀' : '▶'}
      </button>

      {/* 메인 콘텐츠 영역 - 메모장이 기본 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 메모 패널 - 기본적으로 열려있고 메인 영역 차지 */}
        <div className={`${memoPanelOpen ? 'flex-1' : 'w-0'} transition-all duration-300 bg-white shadow-lg overflow-hidden flex flex-col`}>
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">📝 메모장</h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (selectedMemoId) {
                    saveMemo();
                  } else {
                    createMemo();
                  }
                }}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {selectedMemoId ? '저장' : '새 메모'}
              </button>
              {selectedMemoId && (
                <>
                  <button
                    onClick={downloadMemo}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    다운로드
                  </button>
                  <button
                    onClick={() => {
                      setSelectedMemoId(null);
                      setMemoContent('');
                      setMemoTitle('');
                    }}
                    className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                  >
                    닫기
                  </button>
                </>
              )}
              <button
                onClick={() => setMemoPanelOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: 'calc(100vh - 120px)' }}>
            {selectedMemoId ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    제목
                  </label>
                  <input
                    type="text"
                    value={memoTitle}
                    onChange={(e) => setMemoTitle(e.target.value)}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="메모 제목"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    내용 (Enter: 시간 기록, Shift+Enter: 줄바꿈)
                  </label>
                  <textarea
                    ref={memoTextareaRef}
                    value={memoContent}
                    onChange={(e) => setMemoContent(e.target.value)}
                    onKeyDown={handleMemoKeyDown}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full h-full min-h-[600px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
                    placeholder="메모를 입력하세요..."
                  />
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500 py-12">
                <p className="text-sm mb-4">메모를 시작하려면 "새 메모" 버튼을 클릭하세요</p>
                <p className="text-xs text-gray-400">
                  • Enter 키를 누르면 문장 끝에 시간이 기록됩니다<br/>
                  • 녹음 중이면 녹음 시간이 기록됩니다<br/>
                  • 빈 줄에서는 시간이 기록되지 않습니다
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 파일 정보 패널 (선택 시에만 오른쪽에 표시) */}
        {selectedSession && (
          <div className="w-96 bg-white border-l border-gray-200 shadow-lg overflow-y-auto p-6">
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
                <h2 className="text-xl font-bold text-gray-900">{selectedSession.fileName}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
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
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 mb-2">🎵 녹음 파일 재생</p>
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
                    <h3 className="text-lg font-semibold text-gray-900">변환된 텍스트</h3>
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
                  <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {selectedSession.transcription}
                    </p>
                  </div>
                </div>
              )}

              {/* 회의록 */}
              {selectedSession.minutes && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">회의록</h3>
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
                  <div className="bg-gray-50 rounded-lg p-4 max-h-[600px] overflow-y-auto">
                    <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                      {selectedSession.minutes}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
