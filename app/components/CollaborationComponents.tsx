'use client';

import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { useI18n } from '../contexts/I18nContext';

// 협업 상태 타입
interface Participant {
  id: string;
  displayName: string;
  role: 'viewer' | 'editor' | 'admin';
  status: 'online' | 'offline' | 'away';
  cursorPosition?: { x: number; y: number };
  color: string;
}

interface CollaborationSession {
  id: string;
  name: string;
  type: 'chat' | 'document' | 'whiteboard' | 'code';
  inviteCode: string;
  participants: Participant[];
  isOwner: boolean;
}

interface CollaborationContextType {
  session: CollaborationSession | null;
  isConnected: boolean;
  participants: Participant[];
  createSession: (name: string, type: CollaborationSession['type']) => Promise<void>;
  joinSession: (inviteCode: string, displayName: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  sendCursor: (position: { x: number; y: number }) => void;
  shareMessage: (messageId: string, comment?: string) => Promise<void>;
}

const CollaborationContext = createContext<CollaborationContextType | null>(null);

export function useCollaboration() {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within a CollaborationProvider');
  }
  return context;
}

// 참가자 색상 팔레트
const PARTICIPANT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
];

interface CollaborationProviderProps {
  children: ReactNode;
}

export function CollaborationProvider({ children }: CollaborationProviderProps) {
  const [session, setSession] = useState<CollaborationSession | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const createSession = useCallback(async (name: string, type: CollaborationSession['type']) => {
    // 실제로는 API 호출
    const mockSession: CollaborationSession = {
      id: `session_${Date.now()}`,
      name,
      type,
      inviteCode: generateInviteCode(),
      participants: [],
      isOwner: true
    };
    setSession(mockSession);
    setIsConnected(true);
  }, []);

  const joinSession = useCallback(async (inviteCode: string, displayName: string) => {
    // 실제로는 API 호출
    const mockSession: CollaborationSession = {
      id: `session_${Date.now()}`,
      name: '협업 세션',
      type: 'chat',
      inviteCode,
      participants: [],
      isOwner: false
    };
    setSession(mockSession);
    setIsConnected(true);
  }, []);

  const leaveSession = useCallback(async () => {
    setSession(null);
    setIsConnected(false);
    setParticipants([]);
  }, []);

  const sendCursor = useCallback((position: { x: number; y: number }) => {
    // WebSocket으로 커서 위치 전송
    console.log('Cursor position:', position);
  }, []);

  const shareMessage = useCallback(async (messageId: string, comment?: string) => {
    // 메시지 공유 API 호출
    console.log('Sharing message:', messageId, comment);
  }, []);

  const value: CollaborationContextType = {
    session,
    isConnected,
    participants,
    createSession,
    joinSession,
    leaveSession,
    sendCursor,
    shareMessage
  };

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
}

/**
 * 참가자 아바타 목록
 */
interface ParticipantAvatarsProps {
  participants: Participant[];
  maxDisplay?: number;
  size?: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
}

export function ParticipantAvatars({
  participants,
  maxDisplay = 5,
  size = 'md',
  showStatus = true
}: ParticipantAvatarsProps) {
  const displayParticipants = participants.slice(0, maxDisplay);
  const remainingCount = participants.length - maxDisplay;

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base'
  };

  const statusSize = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3'
  };

  return (
    <div className="flex items-center -space-x-2">
      {displayParticipants.map((participant, index) => (
        <div
          key={participant.id}
          className={`${sizeClasses[size]} relative rounded-full flex items-center justify-center font-medium text-white ring-2 ring-slate-800`}
          style={{ backgroundColor: participant.color, zIndex: displayParticipants.length - index }}
          title={`${participant.displayName} (${participant.role})`}
        >
          {participant.displayName.charAt(0).toUpperCase()}
          {showStatus && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 ${statusSize[size]} rounded-full border border-slate-800 ${
                participant.status === 'online' ? 'bg-green-500' :
                participant.status === 'away' ? 'bg-yellow-500' : 'bg-slate-500'
              }`}
            />
          )}
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-medium text-slate-300 bg-slate-700 ring-2 ring-slate-800`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

/**
 * 협업 세션 헤더
 */
interface CollaborationHeaderProps {
  onInvite?: () => void;
  onSettings?: () => void;
  onLeave?: () => void;
}

export function CollaborationHeader({ onInvite, onSettings, onLeave }: CollaborationHeaderProps) {
  const { session, participants, isConnected } = useCollaboration();
  const { t } = useI18n();

  if (!session || !isConnected) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-white">{session.name}</span>
        </div>
        <ParticipantAvatars participants={participants} size="sm" />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onInvite}
          className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          초대
        </button>

        <button
          onClick={onSettings}
          className="p-1.5 text-slate-400 hover:text-white transition-colors"
          title="설정"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button
          onClick={onLeave}
          className="p-1.5 text-red-400 hover:text-red-300 transition-colors"
          title="나가기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * 초대 모달
 */
interface InviteModalProps {
  inviteCode: string;
  onClose: () => void;
}

export function InviteModal({ inviteCode, onClose }: InviteModalProps) {
  const [copied, setCopied] = useState(false);
  const inviteLink = `athena://join/${inviteCode}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-800 rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">협업 초대</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 초대 코드 */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">초대 코드</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-slate-700 rounded-lg font-mono text-lg text-white tracking-wider">
                {inviteCode}
              </div>
              <button
                onClick={() => copyToClipboard(inviteCode)}
                className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                {copied ? (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* 초대 링크 */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">초대 링크</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-300"
              />
              <button
                onClick={() => copyToClipboard(inviteLink)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                복사
              </button>
            </div>
          </div>

          {/* 공유 버튼들 */}
          <div className="flex gap-2 pt-2">
            <button className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              X로 공유
            </button>
            <button className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              Discord
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 세션 참가 모달
 */
interface JoinSessionModalProps {
  onClose: () => void;
  onJoin: (code: string, name: string) => void;
}

export function JoinSessionModal({ onClose, onJoin }: JoinSessionModalProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError('초대 코드를 입력해주세요.');
      return;
    }
    if (!displayName.trim()) {
      setError('표시 이름을 입력해주세요.');
      return;
    }
    onJoin(inviteCode.trim().toUpperCase(), displayName.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-800 rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">협업 세션 참가</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">초대 코드</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
              maxLength={8}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-lg tracking-wider placeholder-slate-500 focus:border-blue-500 focus:outline-none text-center"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">표시 이름</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="이름을 입력하세요"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-slate-300 hover:text-white transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
            >
              참가하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * 참가자 목록 패널
 */
interface ParticipantListProps {
  participants: Participant[];
  currentUserId?: string;
  onKick?: (participantId: string) => void;
  onChangeRole?: (participantId: string, newRole: Participant['role']) => void;
  isOwner?: boolean;
}

export function ParticipantList({
  participants,
  currentUserId,
  onKick,
  onChangeRole,
  isOwner
}: ParticipantListProps) {
  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        참가자 ({participants.length})
      </h3>

      <div className="space-y-2">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium relative"
                style={{ backgroundColor: participant.color }}
              >
                {participant.displayName.charAt(0).toUpperCase()}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-800 ${
                    participant.status === 'online' ? 'bg-green-500' :
                    participant.status === 'away' ? 'bg-yellow-500' : 'bg-slate-500'
                  }`}
                />
              </div>

              <div>
                <div className="text-sm font-medium text-white flex items-center gap-2">
                  {participant.displayName}
                  {participant.id === currentUserId && (
                    <span className="text-xs text-slate-400">(나)</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {participant.role === 'admin' ? '관리자' :
                   participant.role === 'editor' ? '편집자' : '뷰어'}
                </div>
              </div>
            </div>

            {isOwner && participant.id !== currentUserId && (
              <div className="flex items-center gap-1">
                <select
                  value={participant.role}
                  onChange={(e) => onChangeRole?.(participant.id, e.target.value as Participant['role'])}
                  className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-300 focus:outline-none"
                >
                  <option value="viewer">뷰어</option>
                  <option value="editor">편집자</option>
                  <option value="admin">관리자</option>
                </select>
                <button
                  onClick={() => onKick?.(participant.id)}
                  className="p-1 text-red-400 hover:text-red-300 transition-colors"
                  title="내보내기"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 협업 커서 (다른 사용자의 커서 표시)
 */
interface CollaborationCursorProps {
  participant: Participant;
  position: { x: number; y: number };
}

export function CollaborationCursor({ participant, position }: CollaborationCursorProps) {
  return (
    <div
      className="fixed pointer-events-none z-50 transition-all duration-75"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-2px, -2px)'
      }}
    >
      {/* 커서 */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill={participant.color}
        className="drop-shadow-md"
      >
        <path d="M5.65376 3.45752L19.4086 8.74339C20.6632 9.20845 20.7358 10.9432 19.5319 11.5093L13.5703 14.2738L10.8062 20.2313C10.2401 21.4352 8.50532 21.3626 8.04026 20.108L2.75439 6.35312C2.31913 5.17791 3.37839 4.03312 4.58828 4.35856L5.65376 3.45752Z" />
      </svg>

      {/* 이름 라벨 */}
      <div
        className="absolute left-4 top-5 px-2 py-0.5 rounded text-xs text-white whitespace-nowrap"
        style={{ backgroundColor: participant.color }}
      >
        {participant.displayName}
      </div>
    </div>
  );
}

// 헬퍼 함수
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
