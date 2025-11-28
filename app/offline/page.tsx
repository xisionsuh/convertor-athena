'use client';

import { useEffect, useState } from 'react';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // 온라인 복구 시 메인 페이지로 리다이렉트
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 text-center">
      {/* 아이콘 */}
      <div className="relative mb-8">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
          isOnline ? 'bg-green-500/20' : 'bg-slate-700'
        } transition-colors duration-500`}>
          {isOnline ? (
            <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          ) : (
            <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
            </svg>
          )}
        </div>
        {!isOnline && (
          <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center animate-pulse">
            <svg className="w-4 h-4 text-yellow-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </span>
        )}
      </div>

      {/* 제목 */}
      <h1 className="text-3xl font-bold text-white mb-4">
        {isOnline ? '연결 복구됨!' : '오프라인 상태입니다'}
      </h1>

      {/* 설명 */}
      <p className="text-slate-400 max-w-md mb-8">
        {isOnline
          ? '인터넷 연결이 복구되었습니다. 잠시 후 메인 페이지로 이동합니다...'
          : '인터넷 연결이 없어 일부 기능을 사용할 수 없습니다. 연결을 확인한 후 다시 시도해주세요.'}
      </p>

      {/* 기능 안내 */}
      {!isOnline && (
        <div className="bg-slate-800/50 rounded-xl p-6 max-w-md w-full mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">오프라인에서 사용 가능한 기능</h2>
          <ul className="space-y-3 text-left">
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-slate-300">캐시된 대화 내역 확인</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-slate-300">저장된 메모 및 프로젝트 조회</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-slate-300">메시지 작성 (온라인 시 자동 전송)</span>
            </li>
          </ul>

          <div className="mt-4 pt-4 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-white mb-2">오프라인 시 제한되는 기능</h3>
            <ul className="space-y-2 text-left">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-slate-400 text-sm">AI 채팅 (실시간 응답)</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-slate-400 text-sm">음성 변환 (Whisper API)</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-slate-400 text-sm">외부 API 연동 도구</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          다시 시도
        </button>

        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
        >
          뒤로 가기
        </button>
      </div>

      {/* 네트워크 상태 표시 */}
      <div className={`mt-8 flex items-center gap-2 px-4 py-2 rounded-full text-sm ${
        isOnline ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'
      }`}>
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-slate-500 animate-pulse'}`} />
        {isOnline ? '연결됨' : '연결 대기 중...'}
      </div>
    </div>
  );
}
