import { logger } from '../utils/logger.js';

/**
 * MemoryExtractor - 대화에서 기억할 정보를 규칙 기반으로 추출
 * LLM 호출 없이 패턴 매칭과 키워드 감지로 효율적 처리
 */
export class MemoryExtractor {
  constructor(workspaceMemory) {
    this.workspaceMemory = workspaceMemory;

    // 명시적 기억 요청 키워드
    this.rememberKeywords = [
      '기억해', '기억해줘', '기억해 줘', '잊지 마', '잊지마',
      'remember', 'remember this', 'don\'t forget', 'keep in mind',
      '메모해', '메모해줘', '저장해', '저장해줘'
    ];

    // 선호도 패턴 (한국어 + 영어)
    this.preferencePatterns = [
      /나는?\s*(항상|언제나|보통|주로)\s+(.+?)\s*(선호|좋아|써|사용|쓰)/,
      /나는?\s+(.+?)(이|가)\s*(좋아|싫어|편해|불편해)/,
      /내가?\s*(좋아하는|선호하는|자주 쓰는)\s*(것은?|건?)\s+(.+)/,
      /i\s+(always|usually|prefer)\s+(.+)/i,
      /i\s+(like|love|hate|prefer)\s+(.+)/i,
      /my\s+preferred\s+(.+?)\s+is\s+(.+)/i
    ];

    // 사실/정보 패턴
    this.factPatterns = [
      /내\s*(서버|IP|이메일|이름|번호|주소|도메인)\s*(은|는|이|가)\s*(.+)/,
      /내\s*(.+?)\s*(은|는|이|가)\s*(.+?)(이야|야|입니다|에요|거든|이거든)/,
      /my\s+(.+?)\s+is\s+(.+)/i,
      /my\s+(.+?)\s*:\s*(.+)/i
    ];

    // 프로젝트 정보 패턴
    this.projectPatterns = [
      /이\s*프로젝트는?\s+(.+?)(으로|로)\s*(만들|개발|작성)/,
      /프로젝트\s*(이름|명)은?\s*(.+)/,
      /(.+?)\s*(프레임워크|언어|라이브러리|스택)\s*(을|를)?\s*(사용|쓰고|써)/,
      /this\s+project\s+(uses?|is\s+built\s+with)\s+(.+)/i
    ];
  }

  /**
   * 대화 메시지 분석하여 기억할 정보 추출
   * @param {Array} messages - [{role, content}, ...]
   * @returns {Array} - [{category, content, confidence}]
   */
  extractFromConversation(messages) {
    const extractions = [];

    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      const text = msg.content;
      if (typeof text !== 'string') continue;

      // 명시적 기억 요청 확인
      if (this._hasRememberKeyword(text)) {
        extractions.push({
          category: 'Important Facts',
          content: this._cleanRememberRequest(text),
          confidence: 0.95
        });
        continue;
      }

      // 선호도 추출
      for (const pattern of this.preferencePatterns) {
        const match = text.match(pattern);
        if (match) {
          extractions.push({
            category: 'User Preferences',
            content: text.trim(),
            confidence: 0.7
          });
          break;
        }
      }

      // 사실 추출
      for (const pattern of this.factPatterns) {
        const match = text.match(pattern);
        if (match) {
          extractions.push({
            category: 'Important Facts',
            content: text.trim(),
            confidence: 0.7
          });
          break;
        }
      }

      // 프로젝트 정보 추출
      for (const pattern of this.projectPatterns) {
        const match = text.match(pattern);
        if (match) {
          extractions.push({
            category: 'Project Notes',
            content: text.trim(),
            confidence: 0.65
          });
          break;
        }
      }
    }

    return extractions;
  }

  /**
   * 메시지에 기억할 만한 정보가 있는지 빠른 체크
   */
  shouldRemember(message) {
    if (typeof message !== 'string') return false;

    // 명시적 키워드 체크
    if (this._hasRememberKeyword(message)) return true;

    // 패턴 매칭 체크
    const allPatterns = [
      ...this.preferencePatterns,
      ...this.factPatterns,
      ...this.projectPatterns
    ];

    for (const pattern of allPatterns) {
      if (pattern.test(message)) return true;
    }

    return false;
  }

  /**
   * 추출된 정보를 MEMORY.md에 저장
   */
  updateMemoryFromExtractions(extractions) {
    if (!extractions || extractions.length === 0) return;

    const existing = this.workspaceMemory.getMemory();

    for (const item of extractions) {
      // 이미 동일 내용이 있으면 스킵
      if (existing.includes(item.content)) continue;

      // 신뢰도 0.6 이상만 저장
      if (item.confidence < 0.6) continue;

      this.workspaceMemory.appendMemory(item.category, item.content);
      logger.info('메모리 저장', { category: item.category, content: item.content.substring(0, 50) });
    }
  }

  /**
   * 세션 요약을 일일 로그에 기록
   */
  logDailySummary(sessionSummary) {
    if (!sessionSummary) return;
    this.workspaceMemory.appendDailyLog(sessionSummary);
  }

  /**
   * 명시적 기억 요청 키워드가 있는지 확인
   */
  _hasRememberKeyword(text) {
    const lowerText = text.toLowerCase();
    return this.rememberKeywords.some(kw => lowerText.includes(kw));
  }

  /**
   * 기억 요청에서 키워드 부분을 제거하고 내용만 추출
   */
  _cleanRememberRequest(text) {
    let cleaned = text;
    for (const kw of this.rememberKeywords) {
      cleaned = cleaned.replace(new RegExp(kw, 'gi'), '');
    }
    // 불필요한 조사/부호 정리
    cleaned = cleaned.replace(/^[\s,.:;-]+/, '').replace(/[\s,.:;-]+$/, '').trim();
    return cleaned || text.trim();
  }
}
