import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * WorkspaceMemory - 마크다운 기반 영속 메모리 관리
 * workspace/MEMORY.md, IDENTITY.md, daily/ 로그를 관리
 */
export class WorkspaceMemory {
  constructor(workspacePath = './workspace') {
    this.workspacePath = path.resolve(workspacePath);
    this.memoryPath = path.join(this.workspacePath, 'MEMORY.md');
    this.identityPath = path.join(this.workspacePath, 'IDENTITY.md');
    this.dailyDir = path.join(this.workspacePath, 'daily');
  }

  /**
   * 기본 파일/디렉토리가 없으면 생성
   */
  initialize() {
    try {
      // workspace 디렉토리 생성
      if (!fs.existsSync(this.workspacePath)) {
        fs.mkdirSync(this.workspacePath, { recursive: true });
      }

      // daily 디렉토리 생성
      if (!fs.existsSync(this.dailyDir)) {
        fs.mkdirSync(this.dailyDir, { recursive: true });
      }

      // MEMORY.md 기본 파일 생성
      if (!fs.existsSync(this.memoryPath)) {
        fs.writeFileSync(this.memoryPath, this._defaultMemory(), 'utf-8');
        logger.info('WorkspaceMemory: MEMORY.md 생성 완료');
      }

      // IDENTITY.md 기본 파일 생성
      if (!fs.existsSync(this.identityPath)) {
        fs.writeFileSync(this.identityPath, this._defaultIdentity(), 'utf-8');
        logger.info('WorkspaceMemory: IDENTITY.md 생성 완료');
      }

      logger.info('WorkspaceMemory 초기화 완료', { path: this.workspacePath });
    } catch (error) {
      logger.error('WorkspaceMemory 초기화 실패', { error: error.message });
    }
  }

  /**
   * MEMORY.md 내용 읽기
   */
  getMemory() {
    try {
      if (!fs.existsSync(this.memoryPath)) return '';
      return fs.readFileSync(this.memoryPath, 'utf-8');
    } catch (error) {
      logger.error('MEMORY.md 읽기 실패', { error: error.message });
      return '';
    }
  }

  /**
   * MEMORY.md 전체 덮어쓰기
   */
  updateMemory(content) {
    try {
      fs.writeFileSync(this.memoryPath, content, 'utf-8');
      logger.info('MEMORY.md 업데이트 완료');
    } catch (error) {
      logger.error('MEMORY.md 쓰기 실패', { error: error.message });
    }
  }

  /**
   * MEMORY.md의 특정 섹션에 내용 추가
   * 섹션 헤더(## Section Name) 아래에 내용을 추가
   */
  appendMemory(section, content) {
    try {
      let memory = this.getMemory();
      const sectionHeader = `## ${section}`;
      const sectionIndex = memory.indexOf(sectionHeader);

      if (sectionIndex === -1) {
        // 섹션이 없으면 파일 끝에 새 섹션 추가
        memory += `\n\n${sectionHeader}\n${content}\n`;
      } else {
        // 섹션 헤더 다음 줄에 내용 삽입
        const headerEnd = memory.indexOf('\n', sectionIndex);
        if (headerEnd === -1) {
          memory += `\n${content}`;
        } else {
          // 다음 섹션(##) 찾기
          const nextSectionMatch = memory.substring(headerEnd + 1).match(/\n## /);
          const insertPos = nextSectionMatch
            ? headerEnd + 1 + nextSectionMatch.index
            : memory.length;

          // 기존 섹션 내용 끝에 추가
          const before = memory.substring(0, insertPos);
          const after = memory.substring(insertPos);
          memory = before.trimEnd() + `\n- ${content}\n` + after;
        }
      }

      this.updateMemory(memory);
      logger.info('MEMORY.md 섹션 추가', { section });
    } catch (error) {
      logger.error('MEMORY.md 섹션 추가 실패', { section, error: error.message });
    }
  }

  /**
   * IDENTITY.md 내용 읽기
   */
  getIdentity() {
    try {
      if (!fs.existsSync(this.identityPath)) return '';
      return fs.readFileSync(this.identityPath, 'utf-8');
    } catch (error) {
      logger.error('IDENTITY.md 읽기 실패', { error: error.message });
      return '';
    }
  }

  /**
   * 오늘(또는 지정 날짜)의 일일 로그 읽기
   */
  getDailyLog(date = null) {
    try {
      const dateStr = date || this._todayString();
      const logPath = path.join(this.dailyDir, `${dateStr}.md`);
      if (!fs.existsSync(logPath)) return '';
      return fs.readFileSync(logPath, 'utf-8');
    } catch (error) {
      logger.error('Daily log 읽기 실패', { error: error.message });
      return '';
    }
  }

  /**
   * 오늘의 일일 로그에 엔트리 추가 (타임스탬프 포함)
   */
  appendDailyLog(entry) {
    try {
      const dateStr = this._todayString();
      const logPath = path.join(this.dailyDir, `${dateStr}.md`);
      const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });

      let content;
      if (!fs.existsSync(logPath)) {
        content = `# Daily Log - ${dateStr}\n\n- [${timestamp}] ${entry}\n`;
      } else {
        content = fs.readFileSync(logPath, 'utf-8');
        content += `- [${timestamp}] ${entry}\n`;
      }

      fs.writeFileSync(logPath, content, 'utf-8');
    } catch (error) {
      logger.error('Daily log 쓰기 실패', { error: error.message });
    }
  }

  /**
   * 최근 N일간의 일일 로그 가져오기
   */
  getRecentLogs(days = 3) {
    try {
      const logs = [];
      const today = new Date();

      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const logContent = this.getDailyLog(dateStr);
        if (logContent) {
          logs.push({ date: dateStr, content: logContent });
        }
      }

      return logs;
    } catch (error) {
      logger.error('최근 로그 읽기 실패', { error: error.message });
      return [];
    }
  }

  /**
   * 오늘 날짜 문자열 (YYYY-MM-DD)
   */
  _todayString() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * 기본 MEMORY.md 내용
   */
  _defaultMemory() {
    return `# Athena Workspace Memory

## User Preferences
- (아직 학습된 선호도가 없습니다)

## Important Facts
- Server IP: (사용자가 알려주면 저장)

## Project Notes
- (프로젝트별 메모)

## Frequently Used
- (자주 사용하는 정보)
`;
  }

  /**
   * 기본 IDENTITY.md 내용
   */
  _defaultIdentity() {
    return `# Athena Identity

## Personality
- 친근하고 따뜻한 AI 비서
- 논리적이고 체계적
- 창의적이고 유연한 문제 해결
- 유머 감각이 있지만 전문성 유지

## Response Style
- 한국어가 기본, 영어 요청 시 영어
- 간결하되 필요한 정보는 빠짐없이
- 코드는 항상 설명과 함께
- 불확실한 내용은 솔직히 인정

## Behavior Rules
- 사용자의 이전 대화 맥락을 활용
- 위험한 명령 실행 전 항상 확인
- 출처가 있는 정보는 출처 표시
`;
  }
}
