import { NextRequest } from 'next/server';
import { getOrchestrator, getWebSearch } from '../../utils';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const userId = formData.get('userId') as string;
    const sessionId = formData.get('sessionId') as string;
    const message = formData.get('message') as string;
    const projectId = formData.get('projectId') as string | null;
    const files = formData.getAll('files') as File[];

    if (!userId || !sessionId) {
      return new Response(
        JSON.stringify({ success: false, error: '필수 파라미터 누락: userId, sessionId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const webSearchInstance = getWebSearch();

    // 파일 처리: 이미지 파일을 base64로 인코딩, 문서 파일은 텍스트로 추출
    let imageData: any[] = [];
    let documentTexts: string[] = [];
    
    if (files.length > 0) {
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          // 이미지 파일 처리
          try {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Image = buffer.toString('base64');
            imageData.push({
              type: 'image_url',
              image_url: {
                url: `data:${file.type};base64,${base64Image}`
              }
            });
          } catch (error) {
            console.error('Failed to process image file:', error);
          }
        } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          // 텍스트 파일 처리
          try {
            const text = await file.text();
            documentTexts.push(`\n\n[파일: ${file.name}]\n${text}`);
          } catch (error) {
            console.error('Failed to read text file:', error);
          }
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          // PDF 파일 처리 (간단한 텍스트 추출)
          try {
            // PDF 처리를 위한 라이브러리가 필요하지만, 일단 파일명만 표시
            documentTexts.push(`\n\n[PDF 파일: ${file.name}]\n이 PDF 파일의 내용을 분석해주세요. 파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB`);
          } catch (error) {
            console.error('Failed to process PDF file:', error);
          }
        } else if (file.type.includes('word') || file.name.match(/\.(doc|docx)$/i)) {
          // Word 문서 처리
          documentTexts.push(`\n\n[Word 문서: ${file.name}]\n이 Word 문서의 내용을 분석해주세요. 파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB`);
        } else {
          // 기타 파일
          documentTexts.push(`\n\n[파일: ${file.name}]\n이 파일의 내용을 분석해주세요. 파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB, 타입: ${file.type}`);
        }
      }
    }

    // 메시지와 파일 정보 결합
    let finalMessage = message || '';
    if (documentTexts.length > 0) {
      finalMessage += documentTexts.join('\n');
    }
    if (files.length > 0 && documentTexts.length === 0) {
      const fileList = files.map(f => `📎 ${f.name} (${(f.size / 1024).toFixed(1)}KB)`).join('\n');
      finalMessage = finalMessage ? `${finalMessage}\n\n${fileList}` : fileList;
    }

    // 웹 검색 또는 YouTube 검색이 필요한지 확인
    let searchResults = null;
    
    try {
      const needsSearch = webSearchInstance.needsWebSearch(finalMessage);
      const needsYouTube = webSearchInstance.needsYouTubeSearch(finalMessage);
      const hasYouTubeLink = webSearchInstance.hasYouTubeLink(finalMessage);

      if (hasYouTubeLink) {
        try {
          const videoInfo = await webSearchInstance.getYouTubeVideoFromUrl(finalMessage);
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
          }
        } catch (error) {
          console.error('YouTube video info error:', error);
        }
      } else if (needsYouTube) {
        try {
          const searchData = await webSearchInstance.search(finalMessage, { type: 'youtube' });
          searchResults = searchData.results;
        } catch (error) {
          console.error('YouTube search error:', error);
        }
      } else if (needsSearch) {
        try {
          const searchData = await webSearchInstance.search(finalMessage);
          searchResults = searchData.results;
        } catch (error) {
          console.error('Web search error:', error);
          searchResults = null;
        }
      }
    } catch (searchError) {
      console.error('Search error:', searchError);
      searchResults = null;
    }

    // SSE 스트리밍 응답 생성
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          // 스트리밍 처리 (프로젝트 ID 전달)
          for await (const chunk of orchestratorInstance.processStream(userId, sessionId, finalMessage, searchResults, imageData, projectId || null)) {
            controller.enqueue(encoder.encode(`data: ${chunk.trim()}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (streamError: any) {
          console.error('Streaming error:', streamError);
          const errorJson = JSON.stringify({ type: 'error', error: streamError.message }, null, 0);
          controller.enqueue(encoder.encode(`data: ${errorJson}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    console.error('Athena streaming API error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || '서버 오류가 발생했습니다.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

