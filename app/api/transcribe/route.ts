import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
];

export async function POST(request: NextRequest) {
  try {
    // API 키 확인
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return NextResponse.json(
        { error: 'API 키가 설정되지 않았습니다. .env.local 파일을 확인해주세요.' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: '파일이 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `파일 크기가 너무 큽니다. 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB까지 업로드 가능합니다.` },
        { status: 400 }
      );
    }

    // 파일 타입 검증
    if (!ALLOWED_AUDIO_TYPES.includes(file.type) && file.type !== '') {
      console.warn(`Unsupported file type: ${file.type}`);
      // 경고만 하고 계속 진행 (확장자로 판단할 수도 있음)
    }

    // Whisper API를 사용하여 음성을 텍스트로 변환
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'ko', // 한국어 설정
    });

    if (!transcription.text || transcription.text.trim() === '') {
      return NextResponse.json(
        { error: '음성을 인식할 수 없습니다. 다른 파일을 시도해주세요.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ text: transcription.text });
  } catch (error: unknown) {
    console.error('Transcription error:', error);

    // OpenAI API 에러 처리
    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as { status?: number; message?: string };
      if (apiError.status === 401) {
        return NextResponse.json(
          { error: 'API 키가 유효하지 않습니다.' },
          { status: 401 }
        );
      } else if (apiError.status === 429) {
        return NextResponse.json(
          { error: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: '음성 변환 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
