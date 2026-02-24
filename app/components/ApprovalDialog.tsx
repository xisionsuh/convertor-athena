'use client';

import { useState, useEffect } from 'react';

interface ApprovalRequest {
  id: string;
  command: string;
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  requestedAt: Date;
}

interface ApprovalDialogProps {
  request: ApprovalRequest;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const TTL_SECONDS = 300; // 5 minutes

function getSecurityBadge(level: string) {
  switch (level) {
    case 'critical':
      return <span className="px-2 py-0.5 text-xs font-bold rounded bg-red-600 text-white">CRITICAL</span>;
    case 'high':
      return <span className="px-2 py-0.5 text-xs font-bold rounded bg-orange-500 text-white">HIGH</span>;
    case 'medium':
      return <span className="px-2 py-0.5 text-xs font-bold rounded bg-yellow-500 text-white">MEDIUM</span>;
    default:
      return <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-500 text-white">LOW</span>;
  }
}

export default function ApprovalDialog({
  request,
  onApprove,
  onDeny,
  isOpen,
  onClose,
}: ApprovalDialogProps) {
  const [timeRemaining, setTimeRemaining] = useState(TTL_SECONDS);

  useEffect(() => {
    if (!isOpen) return;

    const elapsed = Math.floor((Date.now() - new Date(request.requestedAt).getTime()) / 1000);
    setTimeRemaining(Math.max(0, TTL_SECONDS - elapsed));

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 0) {
          clearInterval(interval);
          onDeny(request.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, request.requestedAt, request.id, onDeny]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-fade-in">
        {/* Warning header */}
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-800 dark:text-red-300">Dangerous Command Approval</h3>
            <p className="text-xs text-red-600 dark:text-red-400">This command requires manual approval</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Command */}
          <div className="bg-red-50/50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/50 rounded-lg p-3">
            <code className="text-sm font-mono text-red-700 dark:text-red-300 break-all">
              {request.command}
            </code>
          </div>

          {/* Details */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Security Level:</span>
              {getSecurityBadge(request.securityLevel)}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={timeRemaining < 60 ? 'text-red-500 font-bold' : ''}>
                {minutes}:{seconds.toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => onDeny(request.id)}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
            >
              Deny
            </button>
            <button
              onClick={() => onApprove(request.id)}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
