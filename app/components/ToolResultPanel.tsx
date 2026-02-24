'use client';

export interface ToolResult {
  type: 'terminal' | 'screenshot' | 'process_list' | 'system_status' | 'approval';
  title: string;
  content: string;
  timestamp: Date;
}

interface ToolResultPanelProps {
  results: ToolResult[];
  isOpen: boolean;
  onClose: () => void;
}

export default function ToolResultPanel({ results, isOpen, onClose }: ToolResultPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="w-80 bg-background border-l border-border flex flex-col shrink-0 transition-all duration-300 animate-slide-in-right">
      {/* Header */}
      <div className="h-12 px-4 border-b border-border flex items-center justify-between bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Tool Results</h3>
        <button
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {results.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-2">📋</div>
            <p className="text-sm text-muted-foreground">No results yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tool execution results will appear here</p>
          </div>
        ) : (
          results.map((result, index) => (
            <div key={index} className="rounded-lg border border-border overflow-hidden">
              {/* Result Header */}
              <div className="px-3 py-2 bg-muted/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {result.type === 'terminal' && '\uD83D\uDCBB'}
                    {result.type === 'screenshot' && '\uD83D\uDCF8'}
                    {result.type === 'process_list' && '\uD83D\uDCCB'}
                    {result.type === 'system_status' && '\uD83D\uDDA5\uFE0F'}
                    {result.type === 'approval' && '\u26A0\uFE0F'}
                  </span>
                  <span className="text-xs font-medium text-foreground">{result.title}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {result.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Result Content */}
              <div className="p-3">
                {result.type === 'terminal' && (
                  <pre className="text-xs font-mono text-green-400 bg-gray-900 dark:bg-black rounded p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {result.content}
                  </pre>
                )}
                {result.type === 'screenshot' && (
                  <img
                    src={result.content}
                    alt={result.title}
                    className="w-full rounded cursor-pointer hover:opacity-90 transition-opacity"
                  />
                )}
                {result.type === 'process_list' && (
                  <div className="text-xs overflow-x-auto">
                    <pre className="font-mono text-foreground whitespace-pre">{result.content}</pre>
                  </div>
                )}
                {result.type === 'system_status' && (
                  <div className="text-xs text-foreground space-y-1">
                    <pre className="font-mono whitespace-pre-wrap">{result.content}</pre>
                  </div>
                )}
                {result.type === 'approval' && (
                  <div className="text-xs">
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                      <code className="font-mono text-red-700 dark:text-red-300">{result.content}</code>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
