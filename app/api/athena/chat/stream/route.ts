import { NextRequest } from 'next/server';
import { getOrchestrator, getWebSearch } from '../../utils';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const userId = formData.get('userId') as string;
    const sessionId = formData.get('sessionId') as string;
    const message = formData.get('message') as string;
    const projectId = formData.get('projectId') as string | null;
    const files = formData.getAll('files') as File[] || [];

    if (!userId || !sessionId) {
      return new Response(
        JSON.stringify({ success: false, error: '필수 파라미터 누락: userId, sessionId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const webSearchInstance = getWebSearch();

    // 파일 처리: 이미지 파일을 base64로 인코딩, 문서 파일은 텍스트로 추출, 음성 파일은 변환
    const imageData: { type: 'image_url'; image_url: { url: string } }[] = [];
    const documentTexts: string[] = [];

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
        } else if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|webm|ogg|flac|aac)$/i)) {
          // 음성 파일 처리 - Whisper API로 변환
          try {
            console.log(`음성 파일 변환 시작: ${file.name} (크기: ${(file.size / 1024).toFixed(1)}KB)`);

            if (!process.env.OPENAI_API_KEY) {
              console.warn('OPENAI_API_KEY가 설정되지 않아 음성 파일 변환을 건너뜁니다.');
              documentTexts.push(`\n\n[음성 파일: ${file.name}]\n음성 파일 변환을 위해 OPENAI_API_KEY가 필요합니다. 파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB`);
              continue;
            }

            const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
            if (file.size > MAX_FILE_SIZE) {
              console.warn(`파일 크기가 너무 큽니다: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
              documentTexts.push(`\n\n[음성 파일: ${file.name}]\n파일 크기가 너무 큽니다. 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB까지 업로드 가능합니다. 파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB`);
              continue;
            }

            // OpenAI SDK를 사용하여 음성을 텍스트로 변환
            const OpenAI = (await import('openai')).default;
            const openai = new OpenAI({
              apiKey: process.env.OPENAI_API_KEY,
            });

            // File 객체를 직접 사용 (OpenAI SDK v6는 File 객체를 직접 지원)
            // Whisper API를 사용하여 음성을 텍스트로 변환
            const transcription = await openai.audio.transcriptions.create({
              file: file,
              model: 'whisper-1',
              language: 'ko', // 한국어 설정
            });

            if (transcription.text && transcription.text.trim()) {
              documentTexts.push(`\n\n[음성 파일: ${file.name}]\n${transcription.text}`);
              console.log(`음성 파일 변환 완료: ${file.name}`);
            } else {
              documentTexts.push(`\n\n[음성 파일: ${file.name}]\n음성을 인식할 수 없습니다. 파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB`);
            }
          } catch (error: unknown) {
            console.error('Failed to process audio file:', error);
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            if (error instanceof Error) {
              console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
              });
            }
            // 에러가 발생해도 계속 진행 (다른 파일 처리에 영향 없도록)
            documentTexts.push(`\n\n[음성 파일: ${file.name}]\n음성 파일 변환 중 오류가 발생했습니다: ${errorMessage}. 파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB`);
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
          // PDF 파일 처리 - 텍스트 추출 (pdf-parse 사용)
          try {
            console.log(`PDF 파일 처리 시작: ${file.name} (크기: ${(file.size / 1024).toFixed(1)}KB)`);

            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // pdf-parse/lib/pdf-parse.js를 직접 import하여 테스트 파일 로딩 문제 우회
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require('pdf-parse/lib/pdf-parse.js');

            const pdfData = await pdfParse(buffer);

            const numPages = pdfData.numpages;
            const extractedText = pdfData.text || '';

            if (extractedText.trim()) {
              // 텍스트가 너무 길면 잘라서 전송
              const maxLength = 50000; // 약 50KB 텍스트 제한
              let finalText = extractedText.trim();

              if (finalText.length > maxLength) {
                finalText = finalText.substring(0, maxLength) + '\n\n... (텍스트가 너무 길어 일부만 표시됩니다)';
              }

              documentTexts.push(`\n\n[PDF 파일: ${file.name}]\n페이지 수: ${numPages}\n\n${finalText}`);
              console.log(`PDF 파일 처리 완료: ${file.name}, ${numPages} 페이지, ${finalText.length}자 추출`);
            } else {
              // 텍스트 추출 실패 (이미지 기반 PDF일 수 있음)
              documentTexts.push(`\n\n[PDF 파일: ${file.name}]\nPDF에서 텍스트를 추출할 수 없습니다. 이미지 기반 PDF이거나 스캔 문서일 수 있습니다.\n파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB, 페이지 수: ${numPages}`);
            }
          } catch (error) {
            console.error('Failed to process PDF file:', error);
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            documentTexts.push(`\n\n[PDF 파일: ${file.name}]\nPDF 처리 중 오류가 발생했습니다: ${errorMessage}\n파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB`);
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
        } catch (streamError: unknown) {
          console.error('Streaming error:', streamError);
          const message = streamError instanceof Error ? streamError.message : '스트리밍 오류가 발생했습니다.';
          const errorJson = JSON.stringify({ type: 'error', error: message }, null, 0);
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
  } catch (error: unknown) {
    console.error('Athena streaming API error:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
      });
    }
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
