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
        className="bg-background shadow-md p-3 rounded-l-xl hover:bg-muted z-10 text-foreground border border-r-0 border-border/50 transition-all hover:pr-4 group"
        title="Open Memo"
      >
        <span className="text-xl group-hover:scale-110 transition-transform block">📝</span>
      </button>
    );
  }

  return (
    <div
      className={`${open ? (isCopilotOpen ? 'w-96' : 'flex-1') : 'w-0'} transition-all duration-300 bg-background/50 backdrop-blur-sm border-l border-border/50 shadow-xl overflow-hidden flex flex-col flex-shrink-0 relative`}
    >
      {/* Header */}
      <div className="h-16 px-6 border-b border-border/50 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">📝</span>
          <h2 className="text-sm font-bold text-foreground">Memo</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSaveMemo}
            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            {selectedMemoId ? 'Save' : 'New'}
          </button>
          {selectedMemoId && (
            <>
              <button
                onClick={onDownloadMemo}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Download"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
              <button
                onClick={onCloseMemo}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </>
          )}
          <button
            onClick={onToggle}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors ml-2"
            title="Collapse"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-background/30">
        {selectedMemoId ? (
          <div className="max-w-3xl mx-auto p-8 min-h-full flex flex-col">
            <input
              type="text"
              value={memoTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              spellCheck={false}
              autoComplete="off"
              className="w-full px-0 py-2 text-2xl font-bold bg-transparent border-none focus:ring-0 placeholder-muted-foreground/50 text-foreground mb-4"
              placeholder="Untitled Memo"
            />
            <div className="flex-1 relative">
              <textarea
                ref={memoTextareaRef}
                value={memoContent}
                onChange={(e) => onContentChange(e.target.value)}
                onKeyDown={onMemoKeyDown}
                onCompositionStart={onCompositionStart}
                onCompositionEnd={onCompositionEnd}
                spellCheck={false}
                autoComplete="off"
                className="w-full h-full min-h-[calc(100vh-200px)] px-0 py-0 bg-transparent border-none focus:ring-0 resize-none font-mono text-sm leading-relaxed text-foreground placeholder-muted-foreground/50"
                placeholder="Start typing... (Enter to timestamp)"
              />
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
              <span className="text-3xl">📝</span>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No Memo Selected</h3>
            <p className="text-sm max-w-xs mb-6">
              Select a memo from the sidebar or create a new one to start taking notes.
            </p>
            <button
              onClick={onCreateMemo}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-sm font-medium text-sm"
            >
              Create New Memo
            </button>
            <div className="mt-8 text-xs text-muted-foreground/70 space-y-1">
              <p>• Press Enter to add timestamp</p>
              <p>• Shift+Enter for new line</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
