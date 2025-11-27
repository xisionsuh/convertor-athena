'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Project, ProjectResource } from '../types';

interface ProjectManagerProps {
  userId: string;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  onAddResourceToProject?: (projectId: string, resourceType: string, resourceId: string, title: string, content?: string) => Promise<void>;
  refreshTrigger?: number; // 외부에서 새로고침 트리거
}

export default function ProjectManager({
  userId,
  selectedProjectId,
  onSelectProject,
  showToast,
  onAddResourceToProject,
  refreshTrigger,
}: ProjectManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [projectResources, setProjectResources] = useState<Record<string, ProjectResource[]>>({});
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  const [resourceCounts, setResourceCounts] = useState<Record<string, number>>({});
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 프로젝트 목록 로드
  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects?userId=${userId}`);
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects);
        // 각 프로젝트의 자료 개수 로드
        data.projects.forEach((project: Project) => {
          loadResourceCount(project.id);
        });
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }, [userId]);

  // 프로젝트 자료 개수 로드
  const loadResourceCount = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/resources`);
      const data = await response.json();
      if (data.success) {
        setResourceCounts(prev => ({ ...prev, [projectId]: data.resources?.length || 0 }));
      }
    } catch (error) {
      console.error('Failed to load resource count:', error);
    }
  };

  // 프로젝트 자료 목록 로드
  const loadProjectResources = useCallback(async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/resources`);
      const data = await response.json();
      if (data.success) {
        setProjectResources(prev => ({ ...prev, [projectId]: data.resources || [] }));
        setResourceCounts(prev => ({ ...prev, [projectId]: data.resources?.length || 0 }));
      }
    } catch (error) {
      console.error('Failed to load project resources:', error);
    }
  }, []);

  // 프로젝트 토글 함수
  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
        // 펼칠 때 자료 로드
        loadProjectResources(projectId);
      }
      return newSet;
    });
  }, [loadProjectResources]);

  useEffect(() => {
    if (userId) {
      loadProjects();
    }
  }, [userId, loadProjects]);

  // 외부 새로고침 트리거 - 펼쳐진 모든 프로젝트 새로고침
  useEffect(() => {
    if (refreshTrigger) {
      expandedProjects.forEach(projectId => {
        loadProjectResources(projectId);
      });
    }
  }, [refreshTrigger, expandedProjects, loadProjectResources]);

  const createProject = async () => {
    if (!newProjectName.trim()) {
      showToast('프로젝트 이름을 입력해주세요.', 'error');
      return;
    }

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: newProjectName.trim(),
          description: newProjectDesc.trim(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setProjects(prev => [data.project, ...prev]);
        setResourceCounts(prev => ({ ...prev, [data.project.id]: 0 }));
        setNewProjectName('');
        setNewProjectDesc('');
        setIsCreating(false);
        showToast('프로젝트가 생성되었습니다.', 'success');
      } else {
        showToast(data.error || '프로젝트 생성 실패', 'error');
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      showToast('프로젝트 생성 중 오류가 발생했습니다.', 'error');
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!confirm('프로젝트를 삭제하시겠습니까? 프로젝트 내 모든 자료가 삭제됩니다.')) {
      return;
    }

    try {
      const response = await fetch(`/api/projects?projectId=${projectId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setProjects(prev => prev.filter(p => p.id !== projectId));
        if (selectedProjectId === projectId) {
          onSelectProject(null);
        }
        showToast('프로젝트가 삭제되었습니다.', 'info');
      } else {
        showToast(data.error || '프로젝트 삭제 실패', 'error');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      showToast('프로젝트 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  // 업로드 대상 프로젝트 ID를 저장
  const [uploadTargetProjectId, setUploadTargetProjectId] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetProjectId = uploadTargetProjectId;
    if (!targetProjectId) {
      showToast('프로젝트를 먼저 선택해주세요.', 'error');
      return;
    }

    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch(`/api/projects/${targetProjectId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        showToast(data.message || '파일이 업로드되었습니다.', 'success');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // 자료 목록 새로고침
        loadProjectResources(targetProjectId);
      } else {
        showToast(data.error || '파일 업로드 실패', 'error');
      }
    } catch (error) {
      console.error('Failed to upload files:', error);
      showToast('파일 업로드 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsUploading(false);
      setUploadTargetProjectId(null);
    }
  };

  const triggerFileUpload = (projectId: string) => {
    setUploadTargetProjectId(projectId);
    fileInputRef.current?.click();
  };

  const deleteResource = async (resourceId: string, projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/resources/${resourceId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setProjectResources(prev => ({
          ...prev,
          [projectId]: (prev[projectId] || []).filter(r => r.id !== resourceId)
        }));
        setResourceCounts(prev => ({ ...prev, [projectId]: Math.max(0, (prev[projectId] || 1) - 1) }));
        showToast('자료가 프로젝트에서 제거되었습니다.', 'info');
      } else {
        showToast(data.error || '자료 제거 실패', 'error');
      }
    } catch (error) {
      console.error('Failed to delete resource:', error);
      showToast('자료 제거 중 오류가 발생했습니다.', 'error');
    }
  };

  // 드롭 핸들러
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, projectId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverProjectId(projectId);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverProjectId(null);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, projectId: string) => {
    e.preventDefault();
    setDragOverProjectId(null);

    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      const item = JSON.parse(data);

      if (onAddResourceToProject) {
        await onAddResourceToProject(
          projectId,
          item.type,
          item.id,
          item.fileName || item.title,
          item.transcription || item.content || ''
        );
        showToast(`"${item.fileName || item.title}"이(가) 프로젝트에 추가되었습니다.`, 'success');

        // 자료 목록 및 개수 새로고침
        loadProjectResources(projectId);
      } else {
        const response = await fetch(`/api/projects/${projectId}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resourceType: item.type,
            resourceId: item.id,
            title: item.fileName || item.title,
            content: item.transcription || item.content || '',
          }),
        });

        const result = await response.json();
        if (result.success) {
          showToast(`"${item.fileName || item.title}"이(가) 프로젝트에 추가되었습니다.`, 'success');
          loadProjectResources(projectId);
        } else {
          showToast(result.error || '추가 실패', 'error');
        }
      }
    } catch (error) {
      console.error('Drop error:', error);
      showToast('자료 추가 중 오류가 발생했습니다.', 'error');
    }
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'file': return '📄';
      case 'memo': return '📝';
      case 'material': return '📎';
      case 'transcription': return '🎤';
      case 'minutes': return '📋';
      default: return '📄';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400">📁 프로젝트</h3>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
        >
          {isCreating ? '취소' : '+ 새 프로젝트'}
        </button>
      </div>

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.xls,.xlsx,.ppt,.pptx"
      />

      {isCreating && (
        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-700 space-y-2">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="프로젝트 이름"
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                createProject();
              } else if (e.key === 'Escape') {
                setIsCreating(false);
              }
            }}
            autoFocus
          />
          <input
            type="text"
            value={newProjectDesc}
            onChange={(e) => setNewProjectDesc(e.target.value)}
            placeholder="설명 (선택사항)"
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                createProject();
              }
            }}
          />
          <button
            onClick={createProject}
            className="w-full px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            생성
          </button>
        </div>
      )}

      {/* 전체 보기 옵션 */}
      <div
        onClick={() => onSelectProject(null)}
        className={`p-2 rounded cursor-pointer transition-colors ${
          selectedProjectId === null
            ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500 dark:border-blue-400'
            : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
        }`}
      >
        <p className="text-xs font-medium text-gray-900 dark:text-gray-100">📂 전체 보기</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">모든 파일 및 메모</p>
      </div>

      {/* 프로젝트 목록 */}
      {projects.map((project) => {
        const isExpanded = expandedProjects.has(project.id);
        const resources = projectResources[project.id] || [];

        return (
        <div key={project.id} className="space-y-1">
          {/* 프로젝트 헤더 */}
          <div
            onDragOver={(e) => handleDragOver(e, project.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, project.id)}
            onClick={() => {
              toggleProject(project.id);
              onSelectProject(project.id);
            }}
            className={`p-2 rounded cursor-pointer transition-all ${
              dragOverProjectId === project.id
                ? 'bg-green-100 dark:bg-green-900/50 border-2 border-dashed border-green-500 dark:border-green-400 scale-[1.02] shadow-lg'
                : selectedProjectId === project.id
                ? 'bg-green-50 dark:bg-green-900/30 border-2 border-green-500 dark:border-green-400'
                : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                  <span className="text-sm">📁</span>
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate" title={project.name}>
                    {project.name}
                  </p>
                  {/* 자료 개수 뱃지 */}
                  {(resourceCounts[project.id] || 0) > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 rounded-full">
                      {resourceCounts[project.id]}
                    </span>
                  )}
                </div>
                {project.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1 ml-7">
                    {project.description}
                  </p>
                )}
                {dragOverProjectId === project.id && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1 ml-7 animate-pulse">
                    ↓ 여기에 놓으세요!
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerFileUpload(project.id);
                  }}
                  disabled={isUploading}
                  className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded disabled:opacity-50"
                  title="자료 업로드"
                >
                  {isUploading && uploadTargetProjectId === project.id ? '⏳' : '📎'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(project.id);
                  }}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 text-sm p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                  title="프로젝트 삭제"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          {/* 프로젝트 자료 목록 (토글로 펼치기/접기) */}
          {isExpanded && (
            <div className="ml-3 pl-3 border-l-2 border-green-300 dark:border-green-700 space-y-1">
              {resources.length > 0 ? (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium py-1">
                    프로젝트 자료 ({resources.length}개)
                  </p>
                  {resources.map((resource) => (
                    <div
                      key={resource.id}
                      className="group p-2 bg-white dark:bg-gray-800 rounded text-xs border border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-600 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="text-sm flex-shrink-0">
                            {getResourceIcon(resource.resourceType)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-800 dark:text-gray-200 truncate font-medium" title={resource.title}>
                              {resource.title}
                            </p>
                            <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
                              {resource.resourceType === 'file' && '파일'}
                              {resource.resourceType === 'memo' && '메모'}
                              {resource.resourceType === 'material' && '자료'}
                              {resource.resourceType === 'transcription' && '변환텍스트'}
                              {resource.resourceType === 'minutes' && '회의록'}
                              {' · '}
                              {new Date(resource.createdAt).toLocaleDateString('ko-KR')}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteResource(resource.id, project.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-opacity"
                          title="프로젝트에서 제거"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="py-3 text-center">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    자료가 없습니다
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    파일이나 메모를 드래그하거나<br />
                    📎 버튼으로 추가하세요
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        );
      })}

      {projects.length === 0 && !isCreating && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
          프로젝트가 없습니다
        </p>
      )}

      {/* 드래그 안내 */}
      {projects.length > 0 && !selectedProjectId && (
        <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded px-2 py-2 mt-2">
          <p className="flex items-center gap-1">
            <span>💡</span>
            <span>프로젝트를 선택하고 파일/메모를 드래그하여 추가하세요</span>
          </p>
        </div>
      )}
    </div>
  );
}
