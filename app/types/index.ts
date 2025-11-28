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
  projectId?: string;
}

export interface FileChunk {
  id: string;
  name: string;
  transcription: string;
}

export type SessionStatus = 'pending' | 'transcribing' | 'completed' | 'error';

export interface Toast {
  id: string;
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
  type: 'memo' | 'chat';
  messageCount?: number;
  projectId?: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectResource {
  id: string;
  projectId: string;
  resourceType: 'file' | 'memo' | 'material' | 'transcription' | 'minutes';
  resourceId: string;
  title: string;
  content?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectContext {
  id: number;
  projectId: string;
  contextType: 'file_content' | 'memo' | 'material' | 'summary' | 'note';
  title: string;
  content: string;
  sourceResourceId?: string;
  tags?: string[];
  importance: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionItem = FileSession | MemoSession;
