'use client';

import { useState } from 'react';
import type { FileSession } from '../types';

interface SessionListProps {
  sessions: FileSession[];
  selectedSessionId: string | null;
  selectedSessionIds: string[];
  selectedProjectId: string | null;
  disableStatusReset?: boolean;
  collapsed?: boolean;
  getProjectName?: (projectId: string | undefined) => string | null;
  onToggleCollapse?: () => void;
  onSelectSession: (id: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onResetStatus: (id: string) => void;
  onAddToProject: (session: FileSession) => Promise<void>;
  onDeleteSession: (id: string) => void;
}

export default function SessionList({
  sessions,
  selectedSessionId,
  selectedSessionIds,
  selectedProjectId,
  disableStatusReset = false,
  collapsed = false,
  getProjectName,
  onToggleCollapse,
  onSelectSession,
  onToggleSelect,
  onResetStatus,
  onAddToProject,
  onDeleteSession,
}: SessionListProps) {
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [addingSessionId, setAddingSessionId] = useState<string | null>(null);

  if (sessions.length === 0) return null;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, session: FileSession) => {
    setDraggedSessionId(session.id);
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'file',
      id: session.id,
      fileName: session.fileName,
      transcription: session.transcription,
      minutes: session.minutes,
    }));
    e.dataTransfer.effectAllowed = 'copy';

    const dragImage = document.createElement('div');
    dragImage.className = 'bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium';
    dragImage.textContent = `📁 ${session.fileName}`;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = () => {
    setDraggedSessionId(null);
  };

  const handleAddToProject = async (session: FileSession) => {
    setAddingSessionId(session.id);
    try {
      await onAddToProject(session);
    } finally {
      setAddingSessionId(null);
    }
  };

  const isInCurrentProject = (session: FileSession) => {
    return selectedProjectId && session.projectId === selectedProjectId;
  };

  return (
    <div className="mb-4">
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        <span className="flex items-center gap-1">
          <span className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
          📁 파일 ({sessions.length})
        </span>
      </button>

      {!collapsed && sessions.map((session) => {
        const inProject = isInCurrentProject(session);

        return (
          <div
            key={session.id}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, session)}
            onDragEnd={handleDragEnd}
            className={`p-3 rounded-lg transition-all mb-2 cursor-pointer ${
              draggedSessionId === session.id
                ? 'opacity-50 scale-95 ring-2 ring-blue-400'
                : ''
            } ${
              inProject
                ? 'bg-green-50 dark:bg-green-900/20 border-2 border-green-400 dark:border-green-600'
                : selectedSessionId === session.id
                ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500 dark:border-blue-400'
                : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
            }`}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedSessionIds.includes(session.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(session.id, e.target.checked);
                }}
                className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />

              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onSelectSession(session.id)}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={session.fileName}>
                  {session.fileName}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {session.file && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {(session.file.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    session.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                    session.status === 'transcribing' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                    session.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                    'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                  }`}>
                    {session.status === 'completed' ? '✓ 완료' :
                     session.status === 'transcribing' ? '⏳ 변환중' :
                     session.status === 'error' ? '⚠ 오류' : '○ 대기'}
                  </span>
                  {/* 프로젝트 라벨 표시 */}
                  {session.projectId && getProjectName && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      inProject
                        ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300'
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                    }`}>
                      📁 {getProjectName(session.projectId) || '프로젝트'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-1 flex-shrink-0">
                {session.status === 'transcribing' && !disableStatusReset && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResetStatus(session.id);
                    }}
                    className="text-yellow-600 hover:text-yellow-800 text-sm leading-none p-1 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded"
                    title="상태 초기화"
                  >
                    ⟳
                  </button>
                )}
                {selectedProjectId && !session.projectId && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleAddToProject(session);
                    }}
                    disabled={addingSessionId === session.id}
                    className="flex items-center gap-1 text-xs text-white bg-green-500 hover:bg-green-600 px-2 py-1 rounded font-medium disabled:opacity-50 transition-colors"
                    title="프로젝트에 추가"
                  >
                    {addingSessionId === session.id ? '⏳' : '+ 추가'}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  className="text-gray-400 hover:text-red-600 text-lg leading-none p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                  title="삭제"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
