'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Project, ProjectResource } from '../types';

interface ProjectManagerProps {
  userId: string;
  isAuthenticated: boolean;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  onAddResourceToProject?: (projectId: string, resourceType: string, resourceId: string, title: string, content?: string) => Promise<void>;
  refreshTrigger?: number; // 외부에서 새로고침 트리거
}

export default function ProjectManager({
  userId,
  isAuthenticated,
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
      const response = await fetch(`/athena/api/projects?userId=${userId}`);
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
      const response = await fetch(`/athena/api/projects/${projectId}/resources`);
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
      const response = await fetch(`/athena/api/projects/${projectId}/resources`);
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
    if (userId && isAuthenticated) {
      loadProjects();
    } else {
      setProjects([]); // 인증되지 않으면 프로젝트 초기화
    }
  }, [userId, isAuthenticated, loadProjects]);

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
      const response = await fetch('/athena/api/projects', {
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
      const response = await fetch(`/athena/api/projects?projectId=${projectId}`, {
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

      const response = await fetch(`/athena/api/projects/${targetProjectId}/upload`, {
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
      const response = await fetch(`/athena/api/projects/${projectId}/resources/${resourceId}`, {
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
        const response = await fetch(`/athena/api/projects/${projectId}/resources`, {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Projects</h3>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="text-xs text-primary hover:text-primary/80 font-medium transition-colors flex items-center gap-1"
        >
          {isCreating ? 'Cancel' : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              New
            </>
          )}
        </button>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.xls,.xlsx,.ppt,.pptx"
      />

      {isCreating && (
        <div className="p-3 bg-card rounded-lg border border-border shadow-sm space-y-3 animate-fade-in">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project Name"
            className="w-full px-3 py-1.5 text-sm bg-muted/50 border border-transparent focus:bg-background focus:border-primary/50 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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
            placeholder="Description (optional)"
            className="w-full px-3 py-1.5 text-sm bg-muted/50 border border-transparent focus:bg-background focus:border-primary/50 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                createProject();
              }
            }}
          />
          <button
            onClick={createProject}
            className="w-full px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-sm"
          >
            Create Project
          </button>
        </div>
      )}

      {/* All Projects Option */}
      <div
        onClick={() => onSelectProject(null)}
        className={`group p-3 rounded-lg cursor-pointer transition-all border ${selectedProjectId === null
            ? 'bg-primary/5 border-primary/20 shadow-sm'
            : 'bg-transparent border-transparent hover:bg-muted/50 hover:border-border/50'
          }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${selectedProjectId === null ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover:text-foreground'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
          </div>
          <div>
            <p className={`text-sm font-medium ${selectedProjectId === null ? 'text-primary' : 'text-foreground'}`}>All Files</p>
            <p className="text-xs text-muted-foreground">View everything</p>
          </div>
        </div>
      </div>

      {/* Project List */}
      <div className="space-y-1">
        {projects.map((project) => {
          const isExpanded = expandedProjects.has(project.id);
          const resources = projectResources[project.id] || [];

          return (
            <div key={project.id} className="group/project">
              {/* Project Header */}
              <div
                onDragOver={(e) => handleDragOver(e, project.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, project.id)}
                onClick={() => {
                  toggleProject(project.id);
                  onSelectProject(project.id);
                }}
                className={`relative p-2 rounded-lg cursor-pointer transition-all border ${dragOverProjectId === project.id
                    ? 'bg-primary/10 border-primary border-dashed scale-[1.02] shadow-md z-10'
                    : selectedProjectId === project.id
                      ? 'bg-primary/5 border-primary/20 shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-muted/50 hover:border-border/50'
                  }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} text-muted-foreground`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${selectedProjectId === project.id ? 'text-primary' : 'text-foreground'}`} title={project.name}>
                        {project.name}
                      </p>
                      {(resourceCounts[project.id] || 0) > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground rounded-full">
                          {resourceCounts[project.id]}
                        </span>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {project.description}
                      </p>
                    )}
                    {dragOverProjectId === project.id && (
                      <p className="text-xs text-primary font-medium mt-1 animate-pulse">
                        Drop to add files
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover/project:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerFileUpload(project.id);
                      }}
                      disabled={isUploading}
                      className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                      title="Upload File"
                    >
                      {isUploading && uploadTargetProjectId === project.id ? (
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(project.id);
                      }}
                      className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                      title="Delete Project"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Project Resources */}
              {isExpanded && (
                <div className="ml-4 pl-4 border-l border-border/50 space-y-0.5 mt-1">
                  {resources.length > 0 ? (
                    resources.map((resource) => (
                      <div
                        key={resource.id}
                        className="group/resource flex items-center justify-between gap-2 p-1.5 rounded hover:bg-muted/50 text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                          <span className="text-muted-foreground flex-shrink-0">
                            {getResourceIcon(resource.resourceType)}
                          </span>
                          <span className="truncate text-muted-foreground group-hover/resource:text-foreground transition-colors" title={resource.title}>
                            {resource.title}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteResource(resource.id, project.id);
                          }}
                          className="opacity-0 group-hover/resource:opacity-100 p-0.5 text-muted-foreground hover:text-destructive rounded transition-all"
                          title="Remove"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="py-2 px-2 text-center border border-dashed border-border/50 rounded bg-muted/20">
                      <p className="text-[10px] text-muted-foreground">Empty Project</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {projects.length === 0 && !isCreating && (
        <div className="text-center py-6 border-2 border-dashed border-border/50 rounded-lg">
          <p className="text-xs text-muted-foreground">No projects yet</p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Create one
          </button>
        </div>
      )}
    </div>
  );
}
