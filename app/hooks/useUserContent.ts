'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { FileSession, MemoSession } from '../types';

type RawDate = string | number | Date | null | undefined;

interface RawFileSession {
  id: string;
  file_name: string;
  transcription?: string;
  minutes?: string;
  chunks?: FileSession['chunks'];
  status?: string;
  createdAt?: RawDate;
  project_id?: string | null;
  error?: string;
}

interface RawMemoSession {
  id: string;
  title: string;
  content: string;
  createdAt?: RawDate;
  updatedAt?: RawDate;
}

interface RawChatSession {
  id: string;
  title?: string;
  createdAt?: RawDate;
  updatedAt?: RawDate;
  messageCount?: number;
  projectId?: string;
}

interface UserContentState {
  sessions: FileSession[];
  setSessions: Dispatch<SetStateAction<FileSession[]>>;
  memoSessions: MemoSession[];
  setMemoSessions: Dispatch<SetStateAction<MemoSession[]>>;
  chatSessions: MemoSession[];
  setChatSessions: Dispatch<SetStateAction<MemoSession[]>>;
}

const toDate = (value: RawDate): Date => {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
};

export function useUserContent(userId: string, isAuthenticated: boolean = false): UserContentState {
  const [sessions, setSessions] = useState<FileSession[]>([]);
  const [memoSessions, setMemoSessions] = useState<MemoSession[]>([]);
  const [chatSessions, setChatSessions] = useState<MemoSession[]>([]);

  // DB와 localStorage에서 세션/메모 복원
  useEffect(() => {
    // 인증되지 않은 경우 데이터 로드하지 않음
    if (!userId || !isAuthenticated) return;

    const loadContent = async () => {
      try {
        // DB 우선 로드
        const response = await fetch(`/athena/api/sessions?userId=${userId}`);
        if (response.ok) {
          const data = await response.json() as {
            success: boolean;
            fileSessions?: RawFileSession[];
            memoSessions?: RawMemoSession[];
            chatSessions?: RawChatSession[];
          };
          if (data.success) {
            if (data.fileSessions && data.fileSessions.length > 0) {
              const restoredSessions = data.fileSessions.map((s: RawFileSession) => ({
                id: s.id,
                fileName: s.file_name,
                file: null,
                transcription: s.transcription || '',
                minutes: s.minutes || '',
                chunks: s.chunks || [],
                status: (s.status === 'transcribing' ? 'pending' : s.status) || 'pending',
                createdAt: toDate(s.createdAt),
                projectId: s.project_id || undefined,
                error: s.error,
              })) as FileSession[];
              setSessions(restoredSessions);
              console.log(`DB에서 세션 ${restoredSessions.length}개 복원 완료`);
            }

            if (data.memoSessions && data.memoSessions.length > 0) {
              const restoredMemos = data.memoSessions.map((m: RawMemoSession) => ({
                id: m.id,
                title: m.title,
                content: m.content,
                createdAt: toDate(m.createdAt),
                updatedAt: toDate(m.updatedAt),
                type: 'memo' as const,
              })) as MemoSession[];
              setMemoSessions(restoredMemos);
              console.log(`DB에서 메모 ${restoredMemos.length}개 복원 완료`);
            }

            if (data.chatSessions && data.chatSessions.length > 0) {
              const chatMemos = data.chatSessions.map((c: RawChatSession) => ({
                id: c.id,
                title: c.title || `채팅 세션 (${c.messageCount || 0}개 메시지)`,
                content: '',
                createdAt: toDate(c.createdAt),
                updatedAt: toDate(c.updatedAt),
                type: 'chat' as const,
                messageCount: c.messageCount || 0,
                projectId: c.projectId || undefined,
              })) as MemoSession[];
              setChatSessions(chatMemos);
              console.log(`DB에서 채팅 세션 ${chatMemos.length}개 복원 완료`);
            }
            return;
          }
        }
      } catch (error) {
        console.error('DB에서 세션 로드 실패:', error);
      }

      // 실패 시 localStorage에서 복원 (하위 호환성)
      try {
        const savedSessions = typeof window !== 'undefined' ? localStorage.getItem('meeting-sessions') : null;
        if (savedSessions) {
          const parsed = JSON.parse(savedSessions);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const restoredSessions = parsed.map((s: FileSession) => ({
              ...s,
              file: null,
              createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
              status: s.status === 'transcribing' ? 'pending' : (s.status || 'pending'),
              transcription: s.transcription || '',
              minutes: s.minutes || '',
              chunks: s.chunks || [],
            }));
            setSessions(restoredSessions);
            console.log(`localStorage에서 세션 ${restoredSessions.length}개 복원 완료`);
          }
        }
      } catch (error) {
        console.error('localStorage 접근 실패:', error);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('meeting-sessions');
        }
      }
    };

    loadContent();
  }, [userId, isAuthenticated]);

  // 파일 세션 저장 (DB + localStorage)
  useEffect(() => {
    if (!userId || !isAuthenticated || sessions.length === 0) return;

    const saveSessions = async () => {
      try {
        for (const session of sessions) {
          const fileMetadata = session.file
            ? {
                name: session.file.name,
                size: session.file.size,
                type: session.file.type,
              }
            : null;

          await fetch('/athena/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              type: 'file',
              data: {
                id: session.id,
                fileName: session.fileName,
                transcription: session.transcription || '',
                minutes: session.minutes || '',
                chunks: session.chunks || [],
                status: session.status,
                projectId: session.projectId || null,
                fileMetadata,
              },
            }),
          });
        }

        const sessionsToSave = sessions.map(s => ({
          id: s.id,
          fileName: s.fileName,
          file: s.file
            ? {
                name: s.file.name,
                size: s.file.size,
                type: s.file.type,
              }
            : null,
          transcription: s.transcription || '',
          minutes: s.minutes || '',
          chunks: s.chunks || [],
          status: s.status,
          createdAt: s.createdAt,
        }));

        if (typeof window !== 'undefined') {
          localStorage.setItem('meeting-sessions', JSON.stringify(sessionsToSave));
        }
      } catch (error) {
        console.error('세션 저장 실패:', error);
      }
    };

    saveSessions();
  }, [sessions, userId, isAuthenticated]);

  // 메모 세션 저장 (DB + localStorage)
  useEffect(() => {
    if (!userId || !isAuthenticated || memoSessions.length === 0) return;

    const saveMemos = async () => {
      try {
        for (const memo of memoSessions) {
          await fetch('/athena/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              type: memo.type === 'chat' ? 'chat' : 'memo',
              data: memo,
            }),
          });
        }

        const memosToSave = memoSessions.map(m => ({
          ...m,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        }));

        if (typeof window !== 'undefined') {
          localStorage.setItem('meeting-memos', JSON.stringify(memosToSave));
        }
      } catch (error) {
        console.error('메모 저장 실패:', error);
      }
    };

    saveMemos();
  }, [memoSessions, userId, isAuthenticated]);

  return {
    sessions,
    setSessions,
    memoSessions,
    setMemoSessions,
    chatSessions,
    setChatSessions,
  };
}
