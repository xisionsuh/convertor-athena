/**
 * 애플리케이션 타입 정의
 */

export interface FileSession {
  id: string;
  fileName: string;
  file: File | null;
  transcription: string;
  minutes: string;
  chunks: FileChunk[];
  status: SessionStatus;
  createdAt: Date;
  error?: string;
}

export interface FileChunk {
  id: string;
  name: string;
  transcription: string;
}

export type SessionStatus = 'pending' | 'transcribing' | 'completed' | 'error';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export type ToastType = 'success' | 'info' | 'error' | 'warning';

export interface TranscriptionResponse {
  text: string;
  error?: string;
}

export interface SummarizationResponse {
  minutes: string;
  error?: string;
}

export interface MemoSession {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  type: 'memo';
}

export type SessionItem = FileSession | MemoSession;
