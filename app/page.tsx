'use client';

import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [minutes, setMinutes] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState('');
  const ffmpegRef = useRef(new FFmpeg());
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const loadFFmpeg = async () => {
    if (ffmpegLoaded) return;

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
    if (e.target.files && e.target.files[0]) {
      let selectedFile = e.target.files[0];
      const maxSize = 25 * 1024 * 1024; // 25MB in bytes

      // 크기 제한은 체크하지 않음 - 어떤 크기든 처리 가능
      setFile(selectedFile);
      setTranscription('');
      setMinutes('');
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
    if (!file) return;

    const maxSize = 25 * 1024 * 1024; // 25MB

    setIsTranscribing(true);
    try {
      // 파일이 25MB보다 크면 분할 처리
      if (file.size > maxSize) {
        const shouldSplit = confirm(
          `파일 크기가 ${(file.size / 1024 / 1024).toFixed(2)}MB입니다.\n\n` +
          `파일을 10분 단위로 자동 분할하여 변환하시겠습니까?\n` +
          `(분할 및 변환에 시간이 소요될 수 있습니다)`
        );

        if (!shouldSplit) {
          setIsTranscribing(false);
          return;
        }

        // 파일 분할
        setCompressionProgress('파일 분할 시작...');
        const chunks = await splitAudioIntoChunks(file);

        if (chunks.length === 0) {
          alert('파일 분할에 실패했습니다.');
          setIsTranscribing(false);
          return;
        }

        alert(`파일이 ${chunks.length}개로 분할되었습니다. 순차적으로 변환을 시작합니다.`);

        // 각 청크를 순차적으로 변환
        let fullTranscription = '';
        for (let i = 0; i < chunks.length; i++) {
          setCompressionProgress(`${i + 1}/${chunks.length} 파일 변환 중...`);
          try {
            const chunkText = await transcribeFile(chunks[i]);
            fullTranscription += `\n\n[Part ${i + 1}]\n${chunkText}`;
          } catch (error) {
            console.error(`Chunk ${i + 1} error:`, error);
            alert(`${i + 1}번째 파일 변환 중 오류가 발생했습니다. 계속 진행합니다.`);
          }
        }

        setCompressionProgress('');
        setTranscription(fullTranscription.trim());
        alert('모든 파일 변환이 완료되었습니다!');
      } else {
        // 일반 변환
        const text = await transcribeFile(file);
        setTranscription(text);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('음성 변환 중 오류가 발생했습니다.');
      setCompressionProgress('');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSummarize = async () => {
    if (!transcription) return;

    setIsSummarizing(true);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: transcription }),
      });

      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        setMinutes(data.minutes);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('회의록 생성 중 오류가 발생했습니다.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(minutes);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Error copying text:', error);
      alert('텍스트 복사에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            회의 녹음 변환기
          </h1>
          <p className="text-lg text-gray-600">
            녹음 파일을 업로드하면 자동으로 회의록으로 변환됩니다
          </p>
          <p className="text-sm text-gray-500 mt-2">
            큰 파일도 OK! 25MB 초과 시 자동 분할하여 처리합니다
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-8 mb-8">
          {isCompressing && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <p className="text-blue-700 font-medium">{compressionProgress}</p>
              </div>
            </div>
          )}

          <div className="mb-6">
            <label
              htmlFor="file-upload"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              음성 파일 선택
            </label>
            <input
              id="file-upload"
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              disabled={isCompressing}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 p-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {file && (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-gray-500">
                  선택된 파일: {file.name}
                </p>
                <p className="text-sm text-gray-400">
                  파일 크기: {(file.size / 1024 / 1024).toFixed(2)}MB / 25MB
                </p>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-400">
              * 25MB 초과 시 10분 단위로 자동 분할하여 처리합니다
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleTranscribe}
              disabled={!file || isTranscribing || isCompressing}
              className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isTranscribing ? '변환 중...' : '텍스트로 변환'}
            </button>
            <button
              onClick={handleSummarize}
              disabled={!transcription || isSummarizing || isCompressing}
              className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSummarizing ? '생성 중...' : '회의록 생성'}
            </button>
          </div>
        </div>

        {transcription && (
          <div className="bg-white rounded-lg shadow-xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              변환된 텍스트
            </h2>
            <div className="bg-gray-50 rounded-lg p-6 max-h-96 overflow-y-auto">
              <p className="text-gray-700 whitespace-pre-wrap">
                {transcription}
              </p>
            </div>
          </div>
        )}

        {minutes && (
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">회의록</h2>
              <button
                onClick={handleCopy}
                className="bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                {copySuccess ? '✓ 복사됨' : '복사하기'}
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 max-h-[600px] overflow-y-auto">
              <div className="prose max-w-none text-gray-700 whitespace-pre-wrap">
                {minutes}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
