'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Command {
  id: string;
  label: string;
  icon: string;
  description?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (commandId: string) => void;
}

const commands: Command[] = [
  { id: 'server-status', label: '\uC11C\uBC84 \uC0C1\uD0DC \uD655\uC778', icon: '\uD83D\uDDA5\uFE0F', description: 'Check server system status' },
  { id: 'pm2-list', label: 'PM2 \uD504\uB85C\uC138\uC2A4 \uBAA9\uB85D', icon: '\uD83D\uDCCB', description: 'List PM2 processes' },
  { id: 'screenshot', label: '\uC2A4\uD06C\uB9B0\uC0F7 \uCEA1\uCC98', icon: '\uD83D\uDCF8', description: 'Capture device screenshot' },
  { id: 'disk-usage', label: '\uB514\uC2A4\uD06C \uC0AC\uC6A9\uB7C9', icon: '\uD83D\uDCBE', description: 'Check disk usage' },
  { id: 'memory-usage', label: '\uBA54\uBAA8\uB9AC \uC0AC\uC6A9\uB7C9', icon: '\uD83E\uDDE0', description: 'Check memory usage' },
  { id: 'restart-process', label: '\uD504\uB85C\uC138\uC2A4 \uC7AC\uC2DC\uC791', icon: '\uD83D\uDD04', description: 'Restart a PM2 process' },
];

export default function CommandPalette({ isOpen, onClose, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.id.toLowerCase().includes(query.toLowerCase()) ||
    (cmd.description?.toLowerCase().includes(query.toLowerCase()))
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filtered.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].id);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [isOpen, filtered, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-fade-in">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <svg className="w-5 h-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-64 overflow-y-auto py-2 custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No commands found
            </div>
          ) : (
            filtered.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={() => {
                  onSelect(cmd.id);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  index === selectedIndex
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted/50'
                }`}
              >
                <span className="text-lg w-6 text-center">{cmd.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cmd.label}</p>
                  {cmd.description && (
                    <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
                  )}
                </div>
                {index === selectedIndex && (
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border">
                    Enter
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground">
          <span><kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">&#x2191;&#x2193;</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Enter</kbd> select</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
