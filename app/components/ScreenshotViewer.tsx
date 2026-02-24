'use client';

import { useState } from 'react';

interface ScreenshotViewerProps {
  src: string;
  alt?: string;
  ocrText?: string;
  onClose?: () => void;
}

export default function ScreenshotViewer({ src, alt = 'Screenshot', ocrText, onClose }: ScreenshotViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [scale, setScale] = useState(1);

  return (
    <>
      {/* Thumbnail */}
      <div className="my-3 relative group inline-block max-w-[400px]">
        <img
          src={src}
          alt={alt}
          className="rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
          style={{ maxWidth: '400px' }}
          onClick={() => setIsFullscreen(true)}
        />
        <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {ocrText && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowOcr(!showOcr); }}
              className="px-2 py-1 text-[10px] font-medium bg-black/60 text-white rounded backdrop-blur-sm hover:bg-black/80 transition-colors"
            >
              {showOcr ? 'Hide OCR' : 'Show OCR'}
            </button>
          )}
          <button
            onClick={() => setIsFullscreen(true)}
            className="px-2 py-1 text-[10px] font-medium bg-black/60 text-white rounded backdrop-blur-sm hover:bg-black/80 transition-colors"
          >
            Expand
          </button>
        </div>

        {/* OCR overlay on thumbnail */}
        {showOcr && ocrText && (
          <div className="absolute inset-0 bg-black/70 rounded-lg p-3 overflow-y-auto">
            <pre className="text-xs text-white font-mono whitespace-pre-wrap">{ocrText}</pre>
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center animate-fade-in">
          {/* Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            {ocrText && (
              <button
                onClick={() => setShowOcr(!showOcr)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  showOcr ? 'bg-blue-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                OCR Text
              </button>
            )}
            <button
              onClick={() => setScale(s => Math.max(0.25, s - 0.25))}
              className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              title="Zoom out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
              </svg>
            </button>
            <span className="text-white text-xs font-mono min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(s => Math.min(3, s + 0.25))}
              className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              title="Zoom in"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={() => setScale(1)}
              className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              title="Reset zoom"
            >
              1:1
            </button>
            <button
              onClick={() => { setIsFullscreen(false); setScale(1); onClose?.(); }}
              className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Image */}
          <div className="overflow-auto max-w-full max-h-full p-8">
            <div className="relative">
              <img
                src={src}
                alt={alt}
                style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
                className="transition-transform duration-200"
              />
              {showOcr && ocrText && (
                <div className="absolute inset-0 bg-black/60 p-4 overflow-y-auto">
                  <pre className="text-sm text-white font-mono whitespace-pre-wrap">{ocrText}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
