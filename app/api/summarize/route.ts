import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: '텍스트가 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    // GPT를 사용하여 회의록 형태로 변환
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `당신은 회의록 작성 전문가입니다. 제공된 회의 내용을 다음 형식으로 정리해주세요:

# 회의록

## 일시
[회의 날짜 및 시간]

## 참석자
[참석자 목록]

## 주요 안건
[논의된 주요 주제들을 나열]

## 논의 내용
[각 안건별로 상세한 논의 내용을 정리]

## 결정 사항
[회의에서 결정된 사항들을 요약]

## 향후 조치 사항 (Action Items)
- [ ] 담당자: 조치 내용
- [ ] 담당자: 조치 내용

## 다음 회의
[다음 회의 일정 또는 후속 조치]

텍스트에서 추출할 수 없는 정보(날짜, 참석자 등)는 [정보 없음] 또는 적절한 플레이스홀더로 표시하세요.`,
        },
        {
          role: 'user',
          content: `다음 회의 내용을 위 형식의 회의록으로 정리해주세요:\n\n${text}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const minutes = completion.choices[0]?.message?.content || '';

    return NextResponse.json({ minutes });
  } catch (error) {
    console.error('Summarization error:', error);
    return NextResponse.json(
      { error: '회의록 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
