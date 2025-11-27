import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator, getWebSearch } from '../utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, sessionId, message } = body;

    if (!userId || !sessionId || !message) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터 누락: userId, sessionId, message' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const webSearchInstance = getWebSearch();

    // 웹 검색 또는 YouTube 검색이 필요한지 확인
    const needsSearch = webSearchInstance.needsWebSearch(message);
    const needsYouTube = webSearchInstance.needsYouTubeSearch(message);
    const hasYouTubeLink = webSearchInstance.hasYouTubeLink(message);
    let searchResults = null;
    let searchType = null;

    // 유튜브 링크가 포함된 경우 비디오 정보 가져오기
    if (hasYouTubeLink) {
      try {
        const videoInfo = await webSearchInstance.getYouTubeVideoFromUrl(message);
        if (videoInfo) {
          searchResults = [{
            title: videoInfo.title,
            link: videoInfo.link,
            snippet: videoInfo.description || videoInfo.title,
            source: 'YouTube',
            videoId: videoInfo.videoId,
            thumbnail: videoInfo.thumbnail,
            channelTitle: videoInfo.channelTitle,
            publishedAt: videoInfo.publishedAt
          }];
          searchType = 'youtube_video';
        }
      } catch (error) {
        console.error('YouTube video info error:', error);
      }
    } else if (needsYouTube) {
      try {
        const searchData = await webSearchInstance.search(message, { type: 'youtube' });
        searchResults = searchData.results;
        searchType = 'youtube';
      } catch (error) {
        console.error('YouTube search error:', error);
      }
    } else if (needsSearch) {
      try {
        const searchData = await webSearchInstance.search(message);
        searchResults = searchData.results;
        searchType = 'web';
      } catch (error) {
        console.error('Web search error:', error);
        searchResults = null;
      }
    }

    // Orchestrator를 통해 처리
    const result = await orchestratorInstance.process(userId, sessionId, message, searchResults);

    return NextResponse.json({
      success: true,
      response: result.content,
      metadata: {
        strategy: result.strategy,
        agentsUsed: result.agentsUsed,
        searchResults: searchResults,
        searchType: searchType,
        ...result.metadata
      }
    });
  } catch (error: unknown) {
    console.error('Athena API error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
