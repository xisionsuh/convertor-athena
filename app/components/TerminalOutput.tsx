'use client';

import { useState, useRef, useEffect } from 'react';

interface TerminalOutputProps {
  output: string;
  command?: string;
  exitCode?: number;
  isStreaming?: boolean;
}

export default function TerminalOutput({ output, command, exitCode, isStreaming }: TerminalOutputProps) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (isStreaming && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [output, isStreaming]);

  const handleCopy = async () => {
    const text = command ? `$ ${command}\n${output}` : output;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg overflow-hidden border border-gray-700 dark:border-gray-600 my-3">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
        <div className="flex items-center gap-2">
          {exitCode !== undefined && (
            <span className={`text-[10px] font-mono ${exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}>
              exit: {exitCode}
            </span>
          )}
          <button
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-white rounded transition-colors"
            title="Copy"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <pre
        ref={preRef}
        className="bg-[#1e1e1e] p-3 overflow-x-auto max-h-72 text-xs font-mono custom-scrollbar"
        style={{ tabSize: 4 }}
      >
        {command && (
          <div className="text-green-400 mb-1">
            <span className="text-green-500">$ </span>
            {command}
          </div>
        )}
        <code className="text-gray-200 whitespace-pre-wrap">{output}</code>
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-0.5 align-middle" />
        )}
      </pre>
    </div>
  );
}
