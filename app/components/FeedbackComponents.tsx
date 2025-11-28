'use client';

import React, { useState, useCallback } from 'react';
import { useI18n } from '../contexts/I18nContext';

interface FeedbackButtonsProps {
  messageId: string;
  conversationId?: string;
  onFeedbackSubmit?: (feedback: FeedbackData) => void;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
}

interface FeedbackData {
  messageId: string;
  conversationId?: string;
  rating: 'positive' | 'negative' | 'neutral';
  feedbackType?: string;
  comment?: string;
  expectedResponse?: string;
}

type FeedbackType = 'accuracy' | 'helpfulness' | 'clarity' | 'completeness' | 'tone' | 'other';

/**
 * 피드백 버튼 (좋아요/싫어요)
 */
export function FeedbackButtons({
  messageId,
  conversationId,
  onFeedbackSubmit,
  size = 'sm',
  showLabels = false
}: FeedbackButtonsProps) {
  const [selectedRating, setSelectedRating] = useState<'positive' | 'negative' | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingRating, setPendingRating] = useState<'positive' | 'negative' | null>(null);

  const sizeClasses = {
    sm: 'w-7 h-7 text-sm',
    md: 'w-9 h-9 text-base',
    lg: 'w-11 h-11 text-lg'
  };

  const handleQuickFeedback = (rating: 'positive' | 'negative') => {
    if (selectedRating === rating) {
      // 선택 취소
      setSelectedRating(null);
      return;
    }

    setSelectedRating(rating);

    // 부정적 피드백은 상세 모달 열기
    if (rating === 'negative') {
      setPendingRating(rating);
      setShowModal(true);
    } else {
      // 긍정적 피드백은 바로 제출
      submitFeedback({
        messageId,
        conversationId,
        rating
      });
    }
  };

  const submitFeedback = useCallback((feedback: FeedbackData) => {
    // API 호출 또는 콜백
    if (onFeedbackSubmit) {
      onFeedbackSubmit(feedback);
    }

    // 로컬 스토리지에 피드백 저장 (오프라인 지원)
    try {
      const storedFeedback = JSON.parse(localStorage.getItem('pending_feedback') || '[]');
      storedFeedback.push({
        ...feedback,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem('pending_feedback', JSON.stringify(storedFeedback));
    } catch (error) {
      console.error('Failed to store feedback locally:', error);
    }
  }, [onFeedbackSubmit]);

  const handleModalSubmit = (details: Partial<FeedbackData>) => {
    if (pendingRating) {
      submitFeedback({
        messageId,
        conversationId,
        rating: pendingRating,
        ...details
      });
    }
    setShowModal(false);
    setPendingRating(null);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {/* 좋아요 버튼 */}
        <button
          onClick={() => handleQuickFeedback('positive')}
          className={`${sizeClasses[size]} rounded-md flex items-center justify-center transition-colors ${
            selectedRating === 'positive'
              ? 'bg-green-500/20 text-green-500'
              : 'text-slate-400 hover:text-green-500 hover:bg-green-500/10'
          }`}
          title="도움이 됐어요"
        >
          <svg className="w-4 h-4" fill={selectedRating === 'positive' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
          </svg>
        </button>

        {/* 싫어요 버튼 */}
        <button
          onClick={() => handleQuickFeedback('negative')}
          className={`${sizeClasses[size]} rounded-md flex items-center justify-center transition-colors ${
            selectedRating === 'negative'
              ? 'bg-red-500/20 text-red-500'
              : 'text-slate-400 hover:text-red-500 hover:bg-red-500/10'
          }`}
          title="개선이 필요해요"
        >
          <svg className="w-4 h-4" fill={selectedRating === 'negative' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
          </svg>
        </button>

        {showLabels && selectedRating && (
          <span className={`text-xs ml-1 ${selectedRating === 'positive' ? 'text-green-500' : 'text-red-500'}`}>
            {selectedRating === 'positive' ? '감사합니다!' : '피드백 감사합니다'}
          </span>
        )}
      </div>

      {/* 상세 피드백 모달 */}
      {showModal && (
        <FeedbackModal
          onClose={() => {
            setShowModal(false);
            setPendingRating(null);
          }}
          onSubmit={handleModalSubmit}
          initialRating={pendingRating}
        />
      )}
    </>
  );
}

/**
 * 상세 피드백 모달
 */
interface FeedbackModalProps {
  onClose: () => void;
  onSubmit: (details: Partial<FeedbackData>) => void;
  initialRating?: 'positive' | 'negative' | null;
}

function FeedbackModal({ onClose, onSubmit, initialRating }: FeedbackModalProps) {
  const { t } = useI18n();
  const [feedbackType, setFeedbackType] = useState<FeedbackType | ''>('');
  const [comment, setComment] = useState('');
  const [expectedResponse, setExpectedResponse] = useState('');

  const feedbackTypes: { value: FeedbackType; label: string; description: string }[] = [
    { value: 'accuracy', label: '정확성', description: '정보가 부정확하거나 잘못됨' },
    { value: 'helpfulness', label: '유용성', description: '도움이 되지 않는 응답' },
    { value: 'clarity', label: '명확성', description: '이해하기 어려운 응답' },
    { value: 'completeness', label: '완전성', description: '정보가 불완전함' },
    { value: 'tone', label: '어조', description: '부적절한 어조나 태도' },
    { value: 'other', label: '기타', description: '다른 이유' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      feedbackType: feedbackType || undefined,
      comment: comment || undefined,
      expectedResponse: expectedResponse || undefined
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-800 rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">피드백 보내기</h3>
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
          {/* 피드백 유형 */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              어떤 점이 문제였나요?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {feedbackTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFeedbackType(type.value)}
                  className={`p-3 rounded-lg text-left transition-colors ${
                    feedbackType === type.value
                      ? 'bg-blue-500/20 border-blue-500 border'
                      : 'bg-slate-700/50 border-transparent border hover:bg-slate-700'
                  }`}
                >
                  <div className={`text-sm font-medium ${feedbackType === type.value ? 'text-blue-400' : 'text-white'}`}>
                    {type.label}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {type.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 추가 코멘트 */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              자세한 피드백 (선택)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="어떻게 개선하면 좋을까요?"
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* 기대했던 응답 */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              기대했던 응답 (선택)
            </label>
            <textarea
              value={expectedResponse}
              onChange={(e) => setExpectedResponse(e.target.value)}
              placeholder="어떤 응답을 기대하셨나요?"
              rows={2}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
            >
              피드백 보내기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * 피드백 통계 카드
 */
interface FeedbackStatsCardProps {
  stats?: {
    total: number;
    positive: number;
    negative: number;
    satisfactionRate: number;
  };
}

export function FeedbackStatsCard({ stats }: FeedbackStatsCardProps) {
  const defaultStats = {
    total: 0,
    positive: 0,
    negative: 0,
    satisfactionRate: 0
  };

  const { total, positive, negative, satisfactionRate } = stats || defaultStats;

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        피드백 통계
      </h3>

      {/* 만족도 게이지 */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">만족도</span>
          <span className={`font-medium ${satisfactionRate >= 70 ? 'text-green-500' : satisfactionRate >= 40 ? 'text-yellow-500' : 'text-red-500'}`}>
            {satisfactionRate}%
          </span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              satisfactionRate >= 70 ? 'bg-green-500' : satisfactionRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${satisfactionRate}%` }}
          />
        </div>
      </div>

      {/* 통계 그리드 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-xs text-slate-400">총 피드백</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-500">{positive}</div>
          <div className="text-xs text-slate-400">긍정</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-500">{negative}</div>
          <div className="text-xs text-slate-400">부정</div>
        </div>
      </div>
    </div>
  );
}

/**
 * 피드백 배너 (사용자에게 피드백 요청)
 */
interface FeedbackBannerProps {
  onDismiss?: () => void;
  onFeedbackClick?: () => void;
}

export function FeedbackBanner({ onDismiss, onFeedbackClick }: FeedbackBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  return (
    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-4 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-slate-400 hover:text-white"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>

        <div className="flex-1">
          <h4 className="font-medium text-white">피드백을 주세요!</h4>
          <p className="text-sm text-slate-400 mt-1">
            여러분의 피드백이 AI를 더 똑똑하게 만듭니다. 응답이 도움이 되었나요?
          </p>
          <button
            onClick={onFeedbackClick}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300 font-medium"
          >
            피드백 보내기 &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
