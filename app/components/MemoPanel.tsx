'use client';

import type { RefObject } from 'react';

interface MemoPanelProps {
  open: boolean;
  onToggle: () => void;
  selectedMemoId: string | null;
  memoTitle: string;
  memoContent: string;
  isCopilotOpen: boolean;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onCreateMemo: () => void;
  onSaveMemo: () => void;
  onDownloadMemo: () => void;
  onCloseMemo: () => void;
  memoTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onMemoKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
}

export default function MemoPanel({
  open,
  onToggle,
  selectedMemoId,
  memoTitle,
  memoContent,
  isCopilotOpen,
  onTitleChange,
  onContentChange,
  onCreateMemo,
  onSaveMemo,
  onDownloadMemo,
  onCloseMemo,
  memoTextareaRef,
  onMemoKeyDown,
  onCompositionStart,
  onCompositionEnd,
}: MemoPanelProps) {
  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="bg-white dark:bg-gray-800 shadow-md p-2 rounded-l-lg hover:bg-gray-50 dark:hover:bg-gray-700 z-10 text-gray-900 dark:text-gray-100 border border-r-0 border-gray-200 dark:border-gray-700"
        title="메모장 열기"
      >
        📝
      </button>
    );
  }

  return (
    <div
      className={`${open ? (isCopilotOpen ? 'w-96' : 'flex-1') : 'w-0'} transition-all duration-300 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden flex flex-col flex-shrink-0`}
    >
      <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">📝 메모장</h2>
        <div className="flex gap-2">
          <button
            onClick={onSaveMemo}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {selectedMemoId ? '저장' : '새 메모'}
          </button>
          {selectedMemoId && (
            <>
              <button
                onClick={onDownloadMemo}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                다운로드
              </button>
              <button
                onClick={onCloseMemo}
                className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                닫기
              </button>
            </>
          )}
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title={open ? '메모장 닫기' : '메모장 열기'}
          >
            {open ? '×' : '📝'}
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
                onChange={(e) => onTitleChange(e.target.value)}
                onCompositionStart={onCompositionStart}
                onCompositionEnd={onCompositionEnd}
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                onChange={(e) => onContentChange(e.target.value)}
                onKeyDown={onMemoKeyDown}
                onCompositionStart={onCompositionStart}
                onCompositionEnd={onCompositionEnd}
                spellCheck={false}
                autoComplete="off"
                className="w-full h-full min-h-[600px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="메모를 입력하세요..."
              />
            </div>
          </>
        ) : (
          <div className="text-center text-gray-500 dark:text-gray-400 py-12">
            <p className="text-sm mb-4">메모를 시작하려면 &quot;새 메모&quot; 버튼을 클릭하세요</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              • Enter 키를 누르면 문장 끝에 시간이 기록됩니다<br/>
              • 녹음 중이면 녹음 시간이 기록됩니다<br/>
              • 빈 줄에서는 시간이 기록되지 않습니다
            </p>
            <button
              onClick={onCreateMemo}
              className="mt-4 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              새 메모
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
