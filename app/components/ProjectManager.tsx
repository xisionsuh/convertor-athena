'use client';

import { useState, useEffect, useRef } from 'react';
import type { Project } from '../types';

interface ProjectManagerProps {
  userId: string;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export default function ProjectManager({
  userId,
  selectedProjectId,
  onSelectProject,
  showToast,
}: ProjectManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [projectResources, setProjectResources] = useState<any[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userId) {
      loadProjects();
    }
  }, [userId]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectResources(selectedProjectId);
    } else {
      setProjectResources([]);
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      const response = await fetch(`/api/projects?userId=${userId}`);
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedProjectId) {
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

      const response = await fetch(`/api/projects/${selectedProjectId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        showToast(data.message || '파일이 업로드되었습니다.', 'success');
        // 파일 입력 초기화
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // 자료 목록 새로고침
        if (selectedProjectId) {
          loadProjectResources(selectedProjectId);
        }
      } else {
        showToast(data.error || '파일 업로드 실패', 'error');
      }
    } catch (error) {
      console.error('Failed to upload files:', error);
      showToast('파일 업로드 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileUpload = () => {
    if (!selectedProjectId) {
      showToast('프로젝트를 먼저 선택해주세요.', 'error');
      return;
    }
    fileInputRef.current?.click();
  };

  const loadProjectResources = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/resources`);
      const data = await response.json();
      if (data.success) {
        setProjectResources(data.resources || []);
      }
    } catch (error) {
      console.error('Failed to load project resources:', error);
    }
  };

  const deleteResource = async (resourceId: string, projectId: string) => {
    if (!confirm('이 자료를 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/resources/${resourceId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setProjectResources(prev => prev.filter(r => r.id !== resourceId));
        showToast('자료가 삭제되었습니다.', 'info');
      } else {
        showToast(data.error || '자료 삭제 실패', 'error');
      }
    } catch (error) {
      console.error('Failed to delete resource:', error);
      showToast('자료 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const toggleProjectExpansion = (projectId: string) => {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
    } else {
      setExpandedProjectId(projectId);
      if (projectId !== selectedProjectId) {
        loadProjectResources(projectId);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400">📁 프로젝트</h3>
        <div className="flex gap-1">
          {selectedProjectId && (
            <button
              onClick={triggerFileUpload}
              disabled={isUploading}
              className="text-xs text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 font-medium disabled:opacity-50"
              title="자료 업로드"
            >
              {isUploading ? '업로드 중...' : '📎 자료'}
            </button>
          )}
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
          >
            {isCreating ? '취소' : '+ 새 프로젝트'}
          </button>
        </div>
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
        <p className="text-xs font-medium text-gray-900 dark:text-gray-100">전체</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">모든 파일 및 메모</p>
      </div>

      {/* 프로젝트 목록 */}
      {projects.map((project) => (
        <div key={project.id}>
          <div
            className={`p-2 rounded cursor-pointer transition-colors ${
              selectedProjectId === project.id
                ? 'bg-green-50 dark:bg-green-900/30 border-2 border-green-500 dark:border-green-400'
                : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
            }`}
            onClick={() => onSelectProject(project.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate" title={project.name}>
                    {project.name}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleProjectExpansion(project.id);
                    }}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
                    title="자료 목록 보기"
                  >
                    {expandedProjectId === project.id ? '▼' : '▶'}
                  </button>
                </div>
                {project.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                    {project.description}
                  </p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {new Date(project.updatedAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <div className="flex gap-1">
                {selectedProjectId === project.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerFileUpload();
                    }}
                    className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm"
                    title="자료 업로드"
                  >
                    📎
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(project.id);
                  }}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 text-sm"
                  title="삭제"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
          
          {/* 프로젝트 자료 목록 (확장 시 표시) */}
          {expandedProjectId === project.id && (
            <div className="ml-4 mt-1 mb-2 pl-2 border-l-2 border-gray-200 dark:border-gray-600 space-y-1">
              {selectedProjectId === project.id && projectResources.length > 0 ? (
                projectResources.map((resource) => (
                  <div
                    key={resource.id}
                    className="p-1.5 bg-white dark:bg-gray-800 rounded text-xs border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 dark:text-gray-400">
                            {resource.resource_type === 'file' && '📄'}
                            {resource.resource_type === 'memo' && '📝'}
                            {resource.resource_type === 'material' && '📎'}
                            {resource.resource_type === 'transcription' && '🎤'}
                            {resource.resource_type === 'minutes' && '📋'}
                          </span>
                          <p className="text-gray-700 dark:text-gray-300 truncate" title={resource.title}>
                            {resource.title}
                          </p>
                        </div>
                        {resource.metadata && (
                          <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
                            {resource.metadata.fileSize && `${(resource.metadata.fileSize / 1024).toFixed(1)} KB`}
                            {resource.metadata.fileType && ` · ${resource.metadata.fileType}`}
                          </p>
                        )}
                        <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
                          {new Date(resource.createdAt).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteResource(resource.id, project.id);
                        }}
                        className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 text-xs ml-2"
                        title="삭제"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              ) : selectedProjectId === project.id ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 py-1">자료가 없습니다</p>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 py-1">프로젝트를 선택하면 자료를 볼 수 있습니다</p>
              )}
            </div>
          )}
        </div>
      ))}

      {projects.length === 0 && !isCreating && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
          프로젝트가 없습니다
        </p>
      )}
    </div>
  );
}

