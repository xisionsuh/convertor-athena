'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastType } from './useToast';

interface UseRecordingOptions {
  showToast: (message: string, type?: ToastType) => void;
}

interface RecordingResult {
  file: File;
  blob: Blob;
  fileName: string;
}

export function useRecording({ showToast }: UseRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 웨이브폼 렌더링
  useEffect(() => {
    if (!isRecording || !canvasRef.current || !analyserRef.current) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isRecording || !canvasRef.current || !analyserRef.current) {
        return;
      }

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

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    animationFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isRecording, isPaused]);

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current) {
      const stream = mediaRecorderRef.current.stream;
      stream?.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    audioChunksRef.current = [];
    analyserRef.current = null;
    setIsRecording(false);
    setRecordingTime(0);
    setIsPaused(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        throw new Error('녹음을 지원하지 않는 환경입니다.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

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

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      showToast('녹음이 시작되었습니다.', 'success');
    } catch (error) {
      console.error('Recording error:', error);
      showToast('마이크 접근 권한이 필요합니다.', 'error');
    }
  }, [showToast]);

  const togglePauseRecording = useCallback(() => {
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
        recordingIntervalRef.current = null;
      }
      setIsPaused(true);
      showToast('녹음이 일시정지되었습니다.', 'info');
    }
  }, [isPaused, showToast]);

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (!mediaRecorderRef.current) return null;

    return new Promise<RecordingResult | null>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const fileName = `녹음_${new Date().toLocaleString('ko-KR').replace(/[. :]/g, '_')}.webm`;
        const audioFile = new File([audioBlob], fileName, { type: 'audio/webm' });

        // 로컬 파일 다운로드
        const url = URL.createObjectURL(audioBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('녹음 파일이 다운로드되었습니다!', 'success');

        cleanup();

        resolve({ file: audioFile, blob: audioBlob, fileName });
      };

      recorder.stop();
    });
  }, [cleanup, showToast]);

  const cancelRecording = useCallback(() => {
    cleanup();
    showToast('녹음이 취소되었습니다.', 'info');
  }, [cleanup, showToast]);

  return {
    isRecording,
    isPaused,
    recordingTime,
    canvasRef,
    startRecording,
    togglePauseRecording,
    stopRecording,
    cancelRecording,
  };
}
