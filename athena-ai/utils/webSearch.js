import axios from 'axios';
import * as cheerio from 'cheerio';
import { getDatabase } from '../database/schema.js';
import { logger } from './logger.js';

export class WebSearchService {
  constructor(config) {
    this.apiKey = config.searchApiKey;
    this.searchEngineId = config.searchEngineId;
    this.dbPath = config.dbPath;
  }

  /**
   * Google Custom Search API를 사용한 웹 검색
   */
  async searchGoogle(query, numResults = 5) {
    try {
      if (!this.apiKey || !this.searchEngineId) {
        logger.warn('Google Search API 키가 설정되지 않았습니다.', {
          hasApiKey: !!this.apiKey,
          hasSearchEngineId: !!this.searchEngineId
        });
        return [];
      }

      const url = 'https://www.googleapis.com/customsearch/v1';
      const params = {
        key: this.apiKey,
        cx: this.searchEngineId,
        q: query,
        num: numResults
      };

      logger.debug('Google 검색 실행', { query, numResults });
      const response = await axios.get(url, { params });

      const results = response.data.items?.map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        source: 'Google'
      })) || [];

      logger.info('Google 검색 결과', { count: results.length, query });
      // 캐시에 저장
      this.cacheSearchResults(query, results);

      return results;
    } catch (error) {
      logger.error('Google search error', error, { query });
      return [];
    }
  }

  /**
   * 간단한 웹 스크래핑 (API 없이 사용 가능)
   */
  async searchDuckDuckGo(query, numResults = 5) {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('.result').slice(0, numResults).each((i, elem) => {
        const title = $(elem).find('.result__title').text().trim();
        const link = $(elem).find('.result__url').attr('href');
        const snippet = $(elem).find('.result__snippet').text().trim();

        if (title && link) {
          results.push({
            title,
            link,
            snippet,
            source: 'DuckDuckGo'
          });
        }
      });

      this.cacheSearchResults(query, results);

      return results;
    } catch (error) {
      logger.error('DuckDuckGo search error', error, { query });
      return [];
    }
  }

  /**
   * 검색 결과 캐싱
   */
  cacheSearchResults(query, results) {
    try {
      const db = getDatabase(this.dbPath);
      const stmt = db.prepare(`
        INSERT INTO search_cache (query, results, source)
        VALUES (?, ?, ?)
      `);
      stmt.run(query, JSON.stringify(results), 'web_search');
    } catch (error) {
      logger.error('Cache error', error, { query });
    }
  }

  /**
   * 캐시에서 검색 결과 가져오기 (24시간 이내)
   */
  getCachedResults(query) {
    try {
      const db = getDatabase(this.dbPath);
      const stmt = db.prepare(`
        SELECT * FROM search_cache
        WHERE query = ?
        AND datetime(created_at) > datetime('now', '-24 hours')
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const result = stmt.get(query);

      if (result) {
        return JSON.parse(result.results);
      }
      return null;
    } catch (error) {
      logger.error('Cache retrieval error', error, { query });
      return null;
    }
  }

  /**
   * 특정 URL의 내용 가져오기
   */
  async fetchPageContent(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);

      // 불필요한 요소 제거
      $('script, style, nav, footer, header, iframe, ads').remove();

      // 주요 텍스트 추출
      const title = $('title').text();
      const content = $('article, main, .content, #content, body')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000); // 최대 5000자

      return {
        url,
        title,
        content,
        success: true
      };
    } catch (error) {
      logger.error(`Failed to fetch ${url}`, error);
      return {
        url,
        error: error.message,
        success: false
      };
    }
  }

  /**
   * YouTube 검색 (Google Custom Search API 사용)
   */
  async searchYouTube(query, numResults = 5) {
    try {
      if (!this.apiKey || !this.searchEngineId) {
        throw new Error('Google Custom Search API 키가 필요합니다');
      }

      // YouTube 사이트로 제한하여 검색
      const youtubeQuery = `site:youtube.com ${query}`;
      const url = 'https://www.googleapis.com/customsearch/v1';
      const params = {
        key: this.apiKey,
        cx: this.searchEngineId,
        q: youtubeQuery,
        num: numResults
      };

      const response = await axios.get(url, { params });

      const results = response.data.items?.map(item => {
        // YouTube URL에서 비디오 ID 추출
        const videoIdMatch = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;

        return {
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          source: 'YouTube',
          videoId: videoId,
          thumbnail: thumbnail
        };
      }) || [];

      // 캐시에 저장
      this.cacheSearchResults(`youtube:${query}`, results);

      return results;
    } catch (error) {
      logger.error('YouTube search error', error, { query });
      return [];
    }
  }

  /**
   * 검색 결과 품질 개선: 관련성 필터링, 중복 제거, 신뢰도 기반 정렬
   */
  improveSearchResults(results, query) {
    if (!results || results.length === 0) {
      return [];
    }

    // 1. 중복 제거 (URL 기준)
    const uniqueResults = [];
    const seenUrls = new Set();
    
    for (const result of results) {
      const normalizedUrl = this.normalizeUrl(result.link);
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        uniqueResults.push(result);
      }
    }

    // 2. 관련성 점수 계산
    const queryKeywords = this.extractKeywords(query);
    const scoredResults = uniqueResults.map(result => {
      const relevanceScore = this.calculateRelevanceScore(result, queryKeywords);
      const reliabilityScore = this.getReliabilityScore(result.link);
      const totalScore = relevanceScore * 0.7 + reliabilityScore * 0.3; // 관련성 70%, 신뢰도 30%
      
      return {
        ...result,
        relevanceScore,
        reliabilityScore,
        totalScore
      };
    });

    // 3. 점수 기준 정렬 (높은 점수 순)
    scoredResults.sort((a, b) => b.totalScore - a.totalScore);

    // 4. 관련성 낮은 결과 필터링 (점수가 너무 낮으면 제외)
    const filteredResults = scoredResults.filter(result => result.totalScore > 0.1);

    // 5. 최대 개수 제한 (상위 결과만 반환) - 점수 정보 유지
    return filteredResults.slice(0, 10);
  }

  /**
   * 검색 결과 요약 생성 (AI 사용)
   */
  async summarizeSearchResults(query, results, orchestrator) {
    if (!results || results.length === 0) {
      return null;
    }

    try {
      // 캐시 확인
      const db = getDatabase(this.dbPath);
      const cached = db.prepare(`
        SELECT summary FROM search_summary_cache
        WHERE query = ? AND expires_at > datetime('now')
        ORDER BY created_at DESC
        LIMIT 1
      `).get(query);

      if (cached) {
        return cached.summary;
      }

      // AI로 요약 생성
      if (!orchestrator) {
        return null;
      }

      const resultsText = results.map((r, i) => 
        `[${i + 1}] ${r.title}\n${r.snippet || ''}\n출처: ${r.link}`
      ).join('\n\n');

      const summaryPrompt = `다음 검색 결과들을 요약해주세요. 핵심 내용만 간결하게 정리해주세요.\n\n검색어: ${query}\n\n검색 결과:\n${resultsText}`;

      // Meta AI를 사용하여 요약
      const brain = await orchestrator.selectBrain();
      const summaryResponse = await brain.chat([
        { role: 'user', content: summaryPrompt }
      ], { maxTokens: 500 });

      const summary = summaryResponse.content;

      // 캐시에 저장 (24시간 유효)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      db.prepare(`
        INSERT INTO search_summary_cache (query, summary, expires_at)
        VALUES (?, ?, ?)
      `).run(query, summary, expiresAt.toISOString());

      return summary;
    } catch (error) {
      logger.error('Failed to summarize search results', error, { query });
      return null;
    }
  }

  /**
   * 검색 결과 피드백 저장
   */
  saveSearchFeedback(query, resultUrl, feedbackType, userId = null) {
    try {
      const db = getDatabase(this.dbPath);
      db.prepare(`
        INSERT INTO search_feedback (query, result_url, feedback_type, user_id)
        VALUES (?, ?, ?, ?)
      `).run(query, resultUrl, feedbackType, userId);
      
      logger.debug('Search feedback saved', { query, resultUrl, feedbackType });
    } catch (error) {
      logger.error('Failed to save search feedback', error);
    }
  }

  /**
   * 검색 결과 피드백 통계 조회
   */
  getSearchFeedbackStats(resultUrl) {
    try {
      const db = getDatabase(this.dbPath);
      const stats = db.prepare(`
        SELECT 
          feedback_type,
          COUNT(*) as count
        FROM search_feedback
        WHERE result_url = ?
        GROUP BY feedback_type
      `).all(resultUrl);

      const result = { useful: 0, notUseful: 0 };
      stats.forEach(stat => {
        if (stat.feedback_type === 'useful') {
          result.useful = stat.count;
        } else if (stat.feedback_type === 'not_useful') {
          result.notUseful = stat.count;
        }
      });

      return result;
    } catch (error) {
      logger.error('Failed to get search feedback stats', error);
      return { useful: 0, notUseful: 0 };
    }
  }

  /**
   * 검색 결과 관련성 점수 반환 (이미 계산된 경우)
   */
  getRelevanceScore(result, query) {
    if (result.relevanceScore !== undefined) {
      return result.relevanceScore;
    }
    
    // 점수가 없으면 계산
    const queryKeywords = this.extractKeywords(query);
    return this.calculateRelevanceScore(result, queryKeywords);
  }

  /**
   * URL 정규화 (중복 제거용)
   */
  normalizeUrl(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      // 프로토콜, www 제거하여 비교
      let normalized = urlObj.hostname.replace(/^www\./, '') + urlObj.pathname;
      // 쿼리 파라미터 정렬하여 비교
      if (urlObj.search) {
        const params = new URLSearchParams(urlObj.search);
        const sortedParams = Array.from(params.entries()).sort();
        if (sortedParams.length > 0) {
          normalized += '?' + sortedParams.map(([k, v]) => `${k}=${v}`).join('&');
        }
      }
      return normalized.toLowerCase();
    } catch (error) {
      return url.toLowerCase();
    }
  }

  /**
   * 쿼리에서 키워드 추출
   */
  extractKeywords(query) {
    // 불용어 제거
    const stopWords = ['은', '는', '이', '가', '을', '를', '의', '에', '에서', '와', '과', '도', '만', '까지', '부터',
                      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    
    const words = query.toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.includes(word));
    
    return words;
  }

  /**
   * 검색 결과의 관련성 점수 계산 (0-1)
   */
  calculateRelevanceScore(result, queryKeywords) {
    if (!queryKeywords || queryKeywords.length === 0) {
      return 0.5; // 기본 점수
    }

    const title = (result.title || '').toLowerCase();
    const snippet = (result.snippet || '').toLowerCase();
    const link = (result.link || '').toLowerCase();
    const text = `${title} ${snippet} ${link}`;

    let score = 0;
    let matchedKeywords = 0;

    for (const keyword of queryKeywords) {
      if (text.includes(keyword)) {
        matchedKeywords++;
        // 제목에 있으면 가중치 높음
        if (title.includes(keyword)) {
          score += 0.3;
        }
        // 스니펫에 있으면 중간 가중치
        else if (snippet.includes(keyword)) {
          score += 0.2;
        }
        // 링크에만 있으면 낮은 가중치
        else {
          score += 0.1;
        }
      }
    }

    // 매칭된 키워드 비율
    const matchRatio = matchedKeywords / queryKeywords.length;
    
    // 최종 점수: 매칭 점수와 매칭 비율의 평균
    const finalScore = (score + matchRatio) / 2;
    
    return Math.min(1, finalScore);
  }

  /**
   * 신뢰도 점수 계산 (0-1)
   */
  getReliabilityScore(url) {
    const reliability = this.getSourceReliability(url);
    
    if (reliability.includes('높음')) {
      return 1.0;
    } else if (reliability.includes('보통')) {
      return 0.6;
    } else if (reliability.includes('낮음')) {
      return 0.3;
    }
    
    return 0.5; // 기본값
  }

  /**
   * 검색 쿼리 최적화
   */
  optimizeQuery(query) {
    // 불필요한 단어 제거
    const stopWords = ['어떻게', '무엇', '어디', '언제', '누가', '왜', 'how', 'what', 'where', 'when', 'who', 'why'];
    
    // 쿼리 정리
    let optimized = query.trim();
    
    // 불용어 제거
    const words = optimized.split(/\s+/).filter(word => {
      const wordLower = word.toLowerCase();
      return !stopWords.some(stopWord => wordLower === stopWord.toLowerCase());
    });
    
    optimized = words.join(' ');
    
    // 연속된 공백 제거
    optimized = optimized.replace(/\s+/g, ' ');
    
    return optimized.trim() || query; // 최적화 결과가 비어있으면 원본 반환
  }

  /**
   * 통합 검색 함수 (개선된 버전)
   */
  async search(query, options = {}) {
    const numResults = options.numResults || 5;
    const useCache = options.useCache !== false;
    const searchType = options.type || 'web'; // 'web' or 'youtube'
    const improveResults = options.improveResults !== false; // 기본값: true

    // 검색 쿼리 최적화
    const optimizedQuery = this.optimizeQuery(query);

    // 캐시 확인
    if (useCache) {
      const cacheKey = searchType === 'youtube' ? `youtube:${optimizedQuery}` : optimizedQuery;
      const cached = this.getCachedResults(cacheKey);
      if (cached) {
        // 캐시된 결과도 품질 개선 적용
        const improvedResults = improveResults ? this.improveSearchResults(cached, query) : cached;
        return {
          results: improvedResults,
          source: 'cache'
        };
      }
    }

    // YouTube 검색인 경우
    if (searchType === 'youtube') {
      const results = await this.searchYouTube(optimizedQuery, numResults * 2); // 더 많이 가져와서 필터링
      const improvedResults = improveResults ? this.improveSearchResults(results, query) : results;
      return {
        results: improvedResults.slice(0, numResults),
        source: 'youtube'
      };
    }

    // 일반 웹 검색
    let results;
    if (this.apiKey && this.searchEngineId) {
      results = await this.searchGoogle(optimizedQuery, numResults * 2); // 더 많이 가져와서 필터링
    } else {
      results = await this.searchDuckDuckGo(optimizedQuery, numResults * 2);
    }

    // 검색 결과 품질 개선
    const improvedResults = improveResults ? this.improveSearchResults(results, query) : results;

    return {
      results: improvedResults.slice(0, numResults),
      source: 'web'
    };
  }

  /**
   * 각 AI의 학습 날짜 (컷오프 날짜)
   * 이 날짜 이후의 정보는 웹 검색이 필요함
   */
  getAIKnowledgeCutoff(aiName) {
    const cutoffs = {
      'ChatGPT': '2024-04',      // GPT-4 Turbo 학습 날짜
      'Gemini': '2024-02',       // Gemini 2.0 학습 날짜
      'Claude': '2024-04',       // Claude 3.5 Sonnet 학습 날짜
      'Grok': '2024-04',         // Grok 학습 날짜
      'default': '2024-04'        // 기본값
    };
    return cutoffs[aiName] || cutoffs['default'];
  }

  /**
   * 질문에서 날짜 정보 추출 및 분석
   */
  extractDateInfo(query) {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const currentDay = currentDate.getDate();

    const queryLower = query.toLowerCase();
    const dateInfo = {
      hasFutureDate: false,
      hasRecentDate: false,
      hasSpecificDate: false,
      extractedYear: null,
      extractedMonth: null,
      extractedDay: null
    };

    // 미래 날짜 키워드 (내일, 다음주, 다음달 등)
    const futureKeywords = ['내일', '다음주', '다음달', '내년', 'tomorrow', 'next week', 'next month', 'next year'];
    if (futureKeywords.some(kw => queryLower.includes(kw))) {
      dateInfo.hasFutureDate = true;
    }

    // 최근 날짜 키워드
    const recentKeywords = ['최근', '최신', '지금', '현재', '오늘', '이번', 'recent', 'latest', 'current', 'now', 'today'];
    if (recentKeywords.some(kw => queryLower.includes(kw))) {
      dateInfo.hasRecentDate = true;
    }

    // 연도 추출 (2024, 2025 등)
    const yearMatch = query.match(/20\d{2}/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      dateInfo.extractedYear = year;
      if (year > currentYear) {
        dateInfo.hasFutureDate = true;
      }
      if (year === currentYear) {
        dateInfo.hasRecentDate = true;
      }
    }

    // 월 추출 (1월, 2월 등)
    const monthMatch = query.match(/(\d{1,2})월|(\d{1,2})\s*월/);
    if (monthMatch) {
      const month = parseInt(monthMatch[1] || monthMatch[2]);
      dateInfo.extractedMonth = month;
      dateInfo.hasSpecificDate = true;
    }

    return dateInfo;
  }

  /**
   * AI가 최신 정보가 필요한지 판단 (각 AI의 학습 날짜 고려)
   */
  needsWebSearch(query, aiName = null) {
    const currentDate = new Date();
    const cutoffDate = new Date(this.getAIKnowledgeCutoff(aiName || 'default'));
    
    // 날짜 정보 추출
    const dateInfo = this.extractDateInfo(query);

    // 미래 날짜가 포함된 질문은 항상 웹 검색 필요
    if (dateInfo.hasFutureDate) {
      return true;
    }

    // 최근 날짜 키워드가 있으면 웹 검색 필요
    if (dateInfo.hasRecentDate) {
      return true;
    }

    // 학습 날짜 이후의 연도가 포함된 경우
    if (dateInfo.extractedYear) {
      const cutoffYear = cutoffDate.getFullYear();
      const cutoffMonth = cutoffDate.getMonth() + 1;
      
      if (dateInfo.extractedYear > cutoffYear) {
        return true;
      }
      
      // 같은 연도라도 학습 날짜 이후의 월이면 검색 필요
      if (dateInfo.extractedYear === cutoffYear && dateInfo.extractedMonth) {
        if (dateInfo.extractedMonth > cutoffMonth) {
          return true;
        }
      }
    }

    // 시간 관련 키워드
    const timeKeywords = [
      '최신', '최근', '지금', '현재', '오늘', '이번',
      'latest', 'recent', 'current', 'now', 'today'
    ];

    // 뉴스/이벤트 키워드
    const newsKeywords = [
      '뉴스', '사건', '발표', '출시', '업데이트', '정책', '영향',
      'news', 'event', 'announcement', 'release', 'update', 'policy', 'impact'
    ];

    const queryLower = query.toLowerCase();

    // 시간 키워드 확인
    const hasTimeKeyword = timeKeywords.some(keyword =>
      queryLower.includes(keyword.toLowerCase())
    );

    // 뉴스 키워드 확인
    const hasNewsKeyword = newsKeywords.some(keyword =>
      queryLower.includes(keyword.toLowerCase())
    );

    // 날씨, 주가, 환율 등 실시간 정보 키워드
    const realtimeKeywords = [
      '날씨', '주가', '환율', '가격', 'weather', 'stock', 'exchange rate', 'price'
    ];
    const hasRealtimeKeyword = realtimeKeywords.some(keyword =>
      queryLower.includes(keyword.toLowerCase())
    );

    return hasTimeKeyword || hasNewsKeyword || hasRealtimeKeyword;
  }

  /**
   * YouTube 검색이 필요한지 판단
   */
  needsYouTubeSearch(query) {
    const youtubeKeywords = [
      '유튜브', 'youtube', '영상', '비디오', '튜토리얼', '강의',
      'video', 'tutorial', 'lecture', '강좌'
    ];
    const queryLower = query.toLowerCase();
    return youtubeKeywords.some(keyword => queryLower.includes(keyword.toLowerCase()));
  }

  /**
   * 유튜브 링크에서 비디오 ID 추출
   */
  extractYouTubeVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\s?#]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * 메시지에 유튜브 링크가 포함되어 있는지 확인
   */
  hasYouTubeLink(message) {
    const youtubeUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?#]+)/i;
    return youtubeUrlPattern.test(message);
  }

  /**
   * 유튜브 비디오 정보 가져오기 (YouTube Data API 사용)
   */
  async getYouTubeVideoInfo(videoId) {
    try {
      // YouTube Data API v3를 사용하여 비디오 정보 가져오기
      // API 키가 없으면 웹 스크래핑 시도
      if (!this.apiKey) {
        logger.debug('YouTube Data API 키가 없어 웹 스크래핑을 시도합니다.', { videoId });
        return await this.fetchYouTubeVideoInfo(videoId);
      }

      const url = 'https://www.googleapis.com/youtube/v3/videos';
      const params = {
        key: this.apiKey,
        id: videoId,
        part: 'snippet,contentDetails,statistics'
      };

      const response = await axios.get(url, { params });
      
      if (response.data.items && response.data.items.length > 0) {
        const video = response.data.items[0];
        return {
          title: video.snippet.title,
          description: video.snippet.description,
          channelTitle: video.snippet.channelTitle,
          publishedAt: video.snippet.publishedAt,
          duration: video.contentDetails?.duration,
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount,
          thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
          videoId: videoId,
          link: `https://www.youtube.com/watch?v=${videoId}`
        };
      }
      
      return null;
    } catch (error) {
      logger.error('YouTube Data API error', error, { videoId });
      // API 실패 시 웹 스크래핑 시도
      return await this.fetchYouTubeVideoInfo(videoId);
    }
  }

  /**
   * 웹 스크래핑을 통한 유튜브 비디오 정보 가져오기
   */
  async fetchYouTubeVideoInfo(videoId) {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // YouTube 페이지에서 메타데이터 추출 시도
      const title = $('meta[property="og:title"]').attr('content') || 
                    $('title').text().replace(' - YouTube', '');
      const description = $('meta[property="og:description"]').attr('content') || 
                         $('meta[name="description"]').attr('content') || '';
      const thumbnail = $('meta[property="og:image"]').attr('content') || 
                       `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      return {
        title: title,
        description: description.substring(0, 1000), // 최대 1000자
        thumbnail: thumbnail,
        videoId: videoId,
        link: url
      };
    } catch (error) {
      logger.error('YouTube 웹 스크래핑 error', error, { videoId });
      return null;
    }
  }

  /**
   * 유튜브 링크에서 비디오 정보 가져오기
   */
  async getYouTubeVideoFromUrl(url) {
    const videoId = this.extractYouTubeVideoId(url);
    if (!videoId) {
      return null;
    }
    
    return await this.getYouTubeVideoInfo(videoId);
  }

  /**
   * 검색 결과를 AI가 이해하기 쉬운 형태로 포맷팅
   */
  /**
   * 검색 결과를 AI 프롬프트용으로 포맷팅
   */
  formatResultsForAI(searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return '';
    }
    
    return searchResults.map((result, index) => {
      const title = result.title || '제목 없음';
      const link = result.link || '';
      const snippet = result.snippet || '';
      
      return `[검색 결과 ${index + 1}]
제목: ${title}
출처: ${link}
내용: ${snippet}`;
    }).join('\n\n');
  }

  /**
   * 출처의 신뢰도 판단
   */
  getSourceReliability(url) {
    if (!url) return '보통';
    
    const urlLower = url.toLowerCase();
    
    // 공식 사이트
    if (urlLower.includes('.gov') || urlLower.includes('.go.kr')) {
      return '높음 (공식)';
    }
    
    // 뉴스 사이트
    if (urlLower.includes('news.') || urlLower.includes('.news') || 
        urlLower.includes('bbc') || urlLower.includes('cnn') || 
        urlLower.includes('reuters') || urlLower.includes('ap.org') ||
        urlLower.includes('ytn') || urlLower.includes('sbs') || 
        urlLower.includes('kbs') || urlLower.includes('mbc')) {
      return '높음 (뉴스)';
    }
    
    // 학술/연구 사이트
    if (urlLower.includes('.edu') || urlLower.includes('.ac.kr') ||
        urlLower.includes('scholar') || urlLower.includes('research') ||
        urlLower.includes('pubmed') || urlLower.includes('arxiv')) {
      return '높음 (학술)';
    }
    
    // 위키피디아
    if (urlLower.includes('wikipedia')) {
      return '보통 (위키)';
    }
    
    // YouTube
    if (urlLower.includes('youtube') || urlLower.includes('youtu.be')) {
      return '보통 (YouTube)';
    }
    
    // 블로그/포럼
    if (urlLower.includes('blog') || urlLower.includes('tistory') ||
        urlLower.includes('naver.com/blog') || urlLower.includes('medium') ||
        urlLower.includes('reddit') || urlLower.includes('stackoverflow')) {
      return '낮음 (블로그/포럼)';
    }
    
    return '보통';
  }
}
