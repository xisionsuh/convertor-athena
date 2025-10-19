'use client';

import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface FileSession {
  id: string;
  fileName: string;
  file: File;
  transcription: string;
  minutes: string;
  chunks: { id: string; name: string; transcription: string }[];
  status: 'pending' | 'transcribing' | 'completed' | 'error';
  createdAt: Date;
}

export default function Home() {
  const [sessions, setSessions] = useState<FileSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  // FFmpeg은 클라이언트에서만 초기화
  if (typeof window !== 'undefined' && !ffmpegRef.current) {
    ffmpegRef.current = new FFmpeg();
  }

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

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
      let chunkIndex = 0;
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
          if (data.length < 1000) {
            break;
          }

          const blob = new Blob([data], { type: 'audio/mp3' });
          const chunk = new File([blob], `chunk_${i}.mp3`, { type: 'audio/mp3' });
          chunks.push(chunk);

          chunkIndex++;
        } catch (err) {
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

  const compressAudio = async (inputFile: File): Promise<File> => {
    setIsCompressing(true);
    setCompressionProgress('오디오 압축 준비 중...');

    try {
      await loadFFmpeg();
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) throw new Error('FFmpeg not initialized');

      setCompressionProgress('파일 로딩 중...');
      const inputName = 'input' + inputFile.name.substring(inputFile.name.lastIndexOf('.'));
      const outputName = 'output.mp3';

      await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

      setCompressionProgress('압축 중... (최대 1~2분 소요)');

      // 오디오를 모노, 96kbps로 압축
      await ffmpeg.exec([
        '-i', inputName,
        '-ac', '1',           // 모노로 변환
        '-b:a', '96k',        // 비트레이트 96kbps
        '-ar', '16000',       // 샘플레이트 16kHz
        outputName
      ]);

      setCompressionProgress('압축 완료! 파일 저장 중...');
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: 'audio/mp3' });
      const compressedFile = new File([blob], `compressed_${inputFile.name.replace(/\.[^/.]+$/, '')}.mp3`, { type: 'audio/mp3' });

      setCompressionProgress('');
      setIsCompressing(false);

      return compressedFile;
    } catch (error) {
      console.error('Compression error:', error);
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

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.text;
  };

  const handleTranscribe = async () => {
    if (!selectedSession) return;

    const maxSize = 25 * 1024 * 1024; // 25MB

    // 세션 상태 업데이트
    setSessions(prev => prev.map(s =>
      s.id === selectedSessionId ? { ...s, status: 'transcribing' as const } : s
    ));

    setIsTranscribing(true);
    try {
      // 파일이 25MB보다 크면 분할 처리
      if (selectedSession.file.size > maxSize) {
        const shouldSplit = confirm(
          `파일 크기가 ${(selectedSession.file.size / 1024 / 1024).toFixed(2)}MB입니다.\n\n` +
          `파일을 10분 단위로 자동 분할하여 변환하시겠습니까?\n` +
          `(분할 및 변환에 시간이 소요될 수 있습니다)`
        );

        if (!shouldSplit) {
          setSessions(prev => prev.map(s =>
            s.id === selectedSessionId ? { ...s, status: 'pending' as const } : s
          ));
          setIsTranscribing(false);
          return;
        }

        // 파일 분할
        setCompressionProgress('파일 분할 시작...');
        const chunks = await splitAudioIntoChunks(selectedSession.file);

        if (chunks.length === 0) {
          alert('파일 분할에 실패했습니다.');
          setSessions(prev => prev.map(s =>
            s.id === selectedSessionId ? { ...s, status: 'error' as const } : s
          ));
          setIsTranscribing(false);
          return;
        }

        alert(`파일이 ${chunks.length}개로 분할되었습니다. 순차적으로 변환을 시작합니다.`);

        // 각 청크를 순차적으로 변환
        let fullTranscription = '';
        const chunkSessions = [];

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
            alert(`${i + 1}번째 파일 변환 중 오류가 발생했습니다. 계속 진행합니다.`);
          }
        }

        setCompressionProgress('');

        // 세션 업데이트
        setSessions(prev => prev.map(s =>
          s.id === selectedSessionId
            ? { ...s, transcription: fullTranscription.trim(), chunks: chunkSessions, status: 'completed' as const }
            : s
        ));

        alert('모든 파일 변환이 완료되었습니다!');
      } else {
        // 일반 변환
        const text = await transcribeFile(selectedSession.file);

        // 세션 업데이트
        setSessions(prev => prev.map(s =>
          s.id === selectedSessionId
            ? { ...s, transcription: text, status: 'completed' as const }
            : s
        ));
      }
    } catch (error) {
      console.error('Error:', error);
      alert('음성 변환 중 오류가 발생했습니다.');
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
        alert(data.error);
      } else {
        // 세션 업데이트
        setSessions(prev => prev.map(s =>
          s.id === selectedSessionId
            ? { ...s, minutes: data.minutes }
            : s
        ));
      }
    } catch (error) {
      console.error('Error:', error);
      alert('회의록 생성 중 오류가 발생했습니다.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleDownload = (type: 'transcription' | 'minutes') => {
    if (!selectedSession) return;

    const content = type === 'transcription' ? selectedSession.transcription : selectedSession.minutes;
    if (!content) {
      alert('다운로드할 내용이 없습니다.');
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
  };

  const handleDeleteSession = (sessionId: string) => {
    if (confirm('이 파일을 삭제하시겠습니까?')) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(sessions.find(s => s.id !== sessionId)?.id || null);
      }
    }
  };

  const handleCopy = async (type: 'transcription' | 'minutes') => {
    if (!selectedSession) return;

    const content = type === 'transcription' ? selectedSession.transcription : selectedSession.minutes;
    if (!content) {
      alert('복사할 내용이 없습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Error copying text:', error);
      alert('텍스트 복사에 실패했습니다.');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* 사이드바 */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-white shadow-lg overflow-hidden flex flex-col`}>
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">파일 목록</h2>
          <p className="text-xs text-gray-500 mt-1">{sessions.length}개 파일</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                selectedSessionId === session.id
                  ? 'bg-blue-50 border-2 border-blue-500'
                  : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {session.fileName}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(session.file.size / 1024 / 1024).toFixed(2)}MB
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      session.status === 'completed' ? 'bg-green-100 text-green-700' :
                      session.status === 'transcribing' ? 'bg-blue-100 text-blue-700' :
                      session.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {session.status === 'completed' ? '완료' :
                       session.status === 'transcribing' ? '변환중' :
                       session.status === 'error' ? '오류' : '대기'}
                    </span>
                    {session.chunks.length > 0 && (
                      <span className="text-xs text-gray-500">
                        {session.chunks.length}개 파트
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(session.id);
                  }}
                  className="ml-2 text-gray-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>

              {/* 청크 목록 */}
              {session.chunks.length > 0 && selectedSessionId === session.id && (
                <div className="mt-2 pl-2 space-y-1">
                  {session.chunks.map((chunk) => (
                    <div key={chunk.id} className="text-xs text-gray-600 py-1">
                      📄 {chunk.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              <p className="text-sm">업로드된 파일이 없습니다</p>
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

      {/* 메인 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              회의 녹음 변환기
            </h1>
            <p className="text-lg text-gray-600">
              여러 파일을 한번에 업로드하고 관리하세요
            </p>
          </div>

          {/* 파일 업로드 영역 */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            {isCompressing && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <p className="text-blue-700 font-medium">{compressionProgress}</p>
                </div>
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-2">
              음성 파일 선택 (여러 파일 가능)
            </label>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              multiple
              disabled={isCompressing}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 p-2.5 disabled:opacity-50"
            />
            <p className="mt-2 text-xs text-gray-500">
              * 25MB 초과 파일은 자동으로 10분 단위로 분할됩니다
            </p>
          </div>

          {/* 선택된 파일 정보 */}
          {selectedSession && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">{selectedSession.fileName}</h2>
                <span className="text-sm text-gray-500">
                  {(selectedSession.file.size / 1024 / 1024).toFixed(2)}MB
                </span>
              </div>

              <div className="flex gap-3 mb-4">
                <button
                  onClick={handleTranscribe}
                  disabled={isTranscribing || isCompressing || selectedSession.status === 'transcribing'}
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
                        className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded"
                      >
                        {copySuccess ? '✓ 복사됨' : '복사'}
                      </button>
                      <button
                        onClick={() => handleDownload('transcription')}
                        className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded"
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
                        className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded"
                      >
                        {copySuccess ? '✓ 복사됨' : '복사'}
                      </button>
                      <button
                        onClick={() => handleDownload('minutes')}
                        className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded"
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

          {!selectedSession && sessions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">파일을 업로드해주세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
