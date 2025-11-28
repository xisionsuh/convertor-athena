import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '../../../athena/utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: '파일이 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    const orchestratorInstance = getOrchestrator();
    const db = orchestratorInstance.memory.db;

    const uploadedResources: Array<{
      id: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    }> = [];

    for (const file of files) {
      let content = '';
      const metadata: Record<string, unknown> = {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      };

      // 파일 타입에 따라 처리
      if (file.type.startsWith('image/')) {
        // 이미지 파일: base64로 변환
        try {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64Image = buffer.toString('base64');
          content = `[이미지 파일: ${file.name}]\n이미지가 프로젝트에 업로드되었습니다.`;
          metadata.base64Image = `data:${file.type};base64,${base64Image}`;
        } catch (error) {
          console.error('Failed to process image:', error);
          content = `[이미지 파일: ${file.name}] 처리 중 오류가 발생했습니다.`;
        }
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        // 텍스트 파일: 내용 읽기
        try {
          const textContent = await file.text();
          content = `[텍스트 파일: ${file.name}]\n\n${textContent}`;
        } catch (error) {
          console.error('Failed to read text file:', error);
          content = `[텍스트 파일: ${file.name}] 읽기 실패`;
        }
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        // PDF 파일: 파일 정보와 함께 상세 설명 추가
        content = `[PDF 파일: ${file.name}]\n파일 크기: ${(file.size / 1024).toFixed(2)} KB\n파일 타입: PDF 문서\n\n이 PDF 파일은 프로젝트 학습 자료로 업로드되었습니다. 파일명: "${file.name}"\n\n이 파일의 내용에 대해 질문하거나 참고할 수 있습니다. 파일명을 통해 이 자료를 언급할 수 있습니다.`;
        metadata.fileType = 'pdf';
        metadata.fileName = file.name;
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name.endsWith('.docx')
      ) {
        // Word 파일: 파일 정보와 함께 상세 설명 추가
        content = `[Word 파일: ${file.name}]\n파일 크기: ${(file.size / 1024).toFixed(2)} KB\n파일 타입: Microsoft Word 문서\n\n이 Word 파일은 프로젝트 학습 자료로 업로드되었습니다. 파일명: "${file.name}"\n\n이 파일의 내용에 대해 질문하거나 참고할 수 있습니다. 파일명을 통해 이 자료를 언급할 수 있습니다.`;
        metadata.fileType = 'docx';
        metadata.fileName = file.name;
      } else if (
        file.type === 'application/vnd.ms-excel' ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.name.endsWith('.xls') ||
        file.name.endsWith('.xlsx')
      ) {
        // Excel 파일: 파일 정보와 함께 상세 설명 추가
        content = `[Excel 파일: ${file.name}]\n파일 크기: ${(file.size / 1024).toFixed(2)} KB\n파일 타입: Microsoft Excel 스프레드시트\n\n이 Excel 파일은 프로젝트 학습 자료로 업로드되었습니다. 파일명: "${file.name}"\n\n이 파일의 내용에 대해 질문하거나 참고할 수 있습니다. 파일명을 통해 이 자료를 언급할 수 있습니다.`;
        metadata.fileType = 'excel';
        metadata.fileName = file.name;
      } else if (
        file.type === 'application/vnd.ms-powerpoint' ||
        file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        file.name.endsWith('.ppt') ||
        file.name.endsWith('.pptx')
      ) {
        // PowerPoint 파일
        content = `[PowerPoint 파일: ${file.name}]\n파일 크기: ${(file.size / 1024).toFixed(2)} KB\n파일 타입: Microsoft PowerPoint 프레젠테이션\n\n이 PowerPoint 파일은 프로젝트 학습 자료로 업로드되었습니다. 파일명: "${file.name}"\n\n이 파일의 내용에 대해 질문하거나 참고할 수 있습니다. 파일명을 통해 이 자료를 언급할 수 있습니다.`;
        metadata.fileType = 'powerpoint';
        metadata.fileName = file.name;
      } else {
        // 기타 파일: 파일명과 타입 정보를 상세히 저장
        content = `[파일: ${file.name}]\n파일 타입: ${file.type || '알 수 없음'}\n파일 크기: ${(file.size / 1024).toFixed(2)} KB\n\n이 파일은 프로젝트 학습 자료로 업로드되었습니다. 파일명: "${file.name}"\n\n이 파일의 내용에 대해 질문하거나 참고할 수 있습니다. 파일명을 통해 이 자료를 언급할 수 있습니다.`;
        metadata.fileName = file.name;
      }

      const resourceDbId = `resource-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const resourceId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 프로젝트 자료에 추가
      db.prepare(`
        INSERT INTO project_resources (id, project_id, resource_type, resource_id, title, content, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        resourceDbId,
        projectId,
        'material',
        resourceId,
        file.name,
        content,
        JSON.stringify(metadata)
      );

      // 프로젝트 컨텍스트에 추가 (중요도 높게 설정하여 우선 참고되도록)
      db.prepare(`
        INSERT INTO project_context (project_id, context_type, title, content, source_resource_id, importance)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        'material',
        file.name,
        content,
        resourceDbId,
        8  // 중요도 높게 설정
      );

      uploadedResources.push({
        id: resourceDbId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${uploadedResources.length}개의 파일이 프로젝트에 업로드되었습니다.`,
      resources: uploadedResources,
    });
  } catch (error: unknown) {
    console.error('Project file upload error:', error);
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
