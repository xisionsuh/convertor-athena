/**
 * GitHub Tool - GitHub 연동 도구
 * GitHub API를 사용한 저장소, 이슈, PR 관리
 */

import { Octokit } from '@octokit/rest';
import { logger } from '../../utils/logger.js';

/**
 * GitHub 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createGitHubTools(options = {}) {
  const { token = process.env.GITHUB_TOKEN } = options;

  const getOctokit = () => {
    if (!token) {
      throw new Error('GitHub 토큰이 설정되지 않았습니다. GITHUB_TOKEN 환경변수를 설정하세요.');
    }
    return new Octokit({ auth: token });
  };

  return [
    // 저장소 정보 조회
    {
      name: 'github_get_repo',
      description: 'GitHub 저장소 정보를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: '저장소 소유자 (사용자명 또는 조직명)'
          },
          repo: {
            type: 'string',
            description: '저장소 이름'
          }
        },
        required: ['owner', 'repo']
      },
      execute: async (args) => {
        const { owner, repo } = args;

        try {
          const octokit = getOctokit();
          const { data } = await octokit.repos.get({ owner, repo });

          logger.info('GitHub 저장소 조회', { owner, repo });

          return {
            success: true,
            repository: {
              name: data.name,
              fullName: data.full_name,
              description: data.description,
              language: data.language,
              stars: data.stargazers_count,
              forks: data.forks_count,
              watchers: data.watchers_count,
              openIssues: data.open_issues_count,
              defaultBranch: data.default_branch,
              visibility: data.visibility,
              createdAt: data.created_at,
              updatedAt: data.updated_at,
              htmlUrl: data.html_url,
              cloneUrl: data.clone_url,
              topics: data.topics
            }
          };

        } catch (error) {
          logger.error('GitHub 저장소 조회 오류', error);
          throw new Error(`저장소 조회 실패: ${error.message}`);
        }
      }
    },

    // 이슈 목록 조회
    {
      name: 'github_list_issues',
      description: 'GitHub 저장소의 이슈 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: '저장소 소유자'
          },
          repo: {
            type: 'string',
            description: '저장소 이름'
          },
          state: {
            type: 'string',
            enum: ['open', 'closed', 'all'],
            description: '이슈 상태 (open, closed, all)',
            default: 'open'
          },
          labels: {
            type: 'string',
            description: '필터링할 레이블 (쉼표로 구분)'
          },
          assignee: {
            type: 'string',
            description: '담당자로 필터링'
          },
          sort: {
            type: 'string',
            enum: ['created', 'updated', 'comments'],
            description: '정렬 기준',
            default: 'created'
          },
          direction: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: '정렬 방향',
            default: 'desc'
          },
          perPage: {
            type: 'number',
            description: '페이지당 결과 수 (최대 100)',
            default: 30
          }
        },
        required: ['owner', 'repo']
      },
      execute: async (args) => {
        const {
          owner,
          repo,
          state = 'open',
          labels,
          assignee,
          sort = 'created',
          direction = 'desc',
          perPage = 30
        } = args;

        try {
          const octokit = getOctokit();

          const params = {
            owner,
            repo,
            state,
            sort,
            direction,
            per_page: Math.min(perPage, 100)
          };

          if (labels) params.labels = labels;
          if (assignee) params.assignee = assignee;

          const { data } = await octokit.issues.listForRepo(params);

          // PR 제외 (이슈만)
          const issues = data.filter(item => !item.pull_request);

          logger.info('GitHub 이슈 조회', { owner, repo, count: issues.length });

          return {
            success: true,
            count: issues.length,
            issues: issues.map(issue => ({
              number: issue.number,
              title: issue.title,
              state: issue.state,
              author: issue.user?.login,
              labels: issue.labels.map(l => l.name),
              assignees: issue.assignees?.map(a => a.login),
              comments: issue.comments,
              createdAt: issue.created_at,
              updatedAt: issue.updated_at,
              htmlUrl: issue.html_url,
              body: issue.body?.substring(0, 500) + (issue.body?.length > 500 ? '...' : '')
            }))
          };

        } catch (error) {
          logger.error('GitHub 이슈 조회 오류', error);
          throw new Error(`이슈 조회 실패: ${error.message}`);
        }
      }
    },

    // 이슈 생성
    {
      name: 'github_create_issue',
      description: 'GitHub 저장소에 새 이슈를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: '저장소 소유자'
          },
          repo: {
            type: 'string',
            description: '저장소 이름'
          },
          title: {
            type: 'string',
            description: '이슈 제목'
          },
          body: {
            type: 'string',
            description: '이슈 내용 (마크다운 지원)'
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: '레이블 목록'
          },
          assignees: {
            type: 'array',
            items: { type: 'string' },
            description: '담당자 목록 (GitHub 사용자명)'
          },
          milestone: {
            type: 'number',
            description: '마일스톤 번호'
          }
        },
        required: ['owner', 'repo', 'title']
      },
      execute: async (args) => {
        const { owner, repo, title, body, labels, assignees, milestone } = args;

        try {
          const octokit = getOctokit();

          const params = { owner, repo, title };
          if (body) params.body = body;
          if (labels) params.labels = labels;
          if (assignees) params.assignees = assignees;
          if (milestone) params.milestone = milestone;

          const { data } = await octokit.issues.create(params);

          logger.info('GitHub 이슈 생성', { owner, repo, issueNumber: data.number });

          return {
            success: true,
            issue: {
              number: data.number,
              title: data.title,
              state: data.state,
              htmlUrl: data.html_url
            }
          };

        } catch (error) {
          logger.error('GitHub 이슈 생성 오류', error);
          throw new Error(`이슈 생성 실패: ${error.message}`);
        }
      }
    },

    // 이슈 업데이트
    {
      name: 'github_update_issue',
      description: 'GitHub 이슈를 업데이트합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: '저장소 소유자'
          },
          repo: {
            type: 'string',
            description: '저장소 이름'
          },
          issueNumber: {
            type: 'number',
            description: '이슈 번호'
          },
          title: {
            type: 'string',
            description: '새 제목'
          },
          body: {
            type: 'string',
            description: '새 내용'
          },
          state: {
            type: 'string',
            enum: ['open', 'closed'],
            description: '상태 변경'
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: '레이블 목록'
          },
          assignees: {
            type: 'array',
            items: { type: 'string' },
            description: '담당자 목록'
          }
        },
        required: ['owner', 'repo', 'issueNumber']
      },
      execute: async (args) => {
        const { owner, repo, issueNumber, title, body, state, labels, assignees } = args;

        try {
          const octokit = getOctokit();

          const params = { owner, repo, issue_number: issueNumber };
          if (title) params.title = title;
          if (body) params.body = body;
          if (state) params.state = state;
          if (labels) params.labels = labels;
          if (assignees) params.assignees = assignees;

          const { data } = await octokit.issues.update(params);

          logger.info('GitHub 이슈 업데이트', { owner, repo, issueNumber });

          return {
            success: true,
            issue: {
              number: data.number,
              title: data.title,
              state: data.state,
              htmlUrl: data.html_url
            }
          };

        } catch (error) {
          logger.error('GitHub 이슈 업데이트 오류', error);
          throw new Error(`이슈 업데이트 실패: ${error.message}`);
        }
      }
    },

    // 이슈 코멘트 추가
    {
      name: 'github_add_comment',
      description: 'GitHub 이슈에 코멘트를 추가합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: '저장소 소유자'
          },
          repo: {
            type: 'string',
            description: '저장소 이름'
          },
          issueNumber: {
            type: 'number',
            description: '이슈 번호'
          },
          body: {
            type: 'string',
            description: '코멘트 내용 (마크다운 지원)'
          }
        },
        required: ['owner', 'repo', 'issueNumber', 'body']
      },
      execute: async (args) => {
        const { owner, repo, issueNumber, body } = args;

        try {
          const octokit = getOctokit();

          const { data } = await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body
          });

          logger.info('GitHub 코멘트 추가', { owner, repo, issueNumber });

          return {
            success: true,
            comment: {
              id: data.id,
              htmlUrl: data.html_url,
              createdAt: data.created_at
            }
          };

        } catch (error) {
          logger.error('GitHub 코멘트 추가 오류', error);
          throw new Error(`코멘트 추가 실패: ${error.message}`);
        }
      }
    },

    // PR 목록 조회
    {
      name: 'github_list_pulls',
      description: 'GitHub 저장소의 Pull Request 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: '저장소 소유자'
          },
          repo: {
            type: 'string',
            description: '저장소 이름'
          },
          state: {
            type: 'string',
            enum: ['open', 'closed', 'all'],
            description: 'PR 상태',
            default: 'open'
          },
          base: {
            type: 'string',
            description: '베이스 브랜치로 필터링'
          },
          head: {
            type: 'string',
            description: '헤드 브랜치로 필터링'
          },
          sort: {
            type: 'string',
            enum: ['created', 'updated', 'popularity', 'long-running'],
            description: '정렬 기준',
            default: 'created'
          },
          perPage: {
            type: 'number',
            description: '페이지당 결과 수',
            default: 30
          }
        },
        required: ['owner', 'repo']
      },
      execute: async (args) => {
        const { owner, repo, state = 'open', base, head, sort = 'created', perPage = 30 } = args;

        try {
          const octokit = getOctokit();

          const params = {
            owner,
            repo,
            state,
            sort,
            per_page: Math.min(perPage, 100)
          };

          if (base) params.base = base;
          if (head) params.head = head;

          const { data } = await octokit.pulls.list(params);

          logger.info('GitHub PR 조회', { owner, repo, count: data.length });

          return {
            success: true,
            count: data.length,
            pullRequests: data.map(pr => ({
              number: pr.number,
              title: pr.title,
              state: pr.state,
              author: pr.user?.login,
              head: pr.head.ref,
              base: pr.base.ref,
              draft: pr.draft,
              mergeable: pr.mergeable,
              merged: pr.merged,
              reviewers: pr.requested_reviewers?.map(r => r.login),
              labels: pr.labels.map(l => l.name),
              createdAt: pr.created_at,
              updatedAt: pr.updated_at,
              htmlUrl: pr.html_url
            }))
          };

        } catch (error) {
          logger.error('GitHub PR 조회 오류', error);
          throw new Error(`PR 조회 실패: ${error.message}`);
        }
      }
    },

    // PR 생성
    {
      name: 'github_create_pull',
      description: 'GitHub 저장소에 Pull Request를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: '저장소 소유자'
          },
          repo: {
            type: 'string',
            description: '저장소 이름'
          },
          title: {
            type: 'string',
            description: 'PR 제목'
          },
          body: {
            type: 'string',
            description: 'PR 설명 (마크다운 지원)'
          },
          head: {
            type: 'string',
            description: '변경사항이 있는 브랜치 (예: feature-branch)'
          },
          base: {
            type: 'string',
            description: '병합 대상 브랜치 (예: main)',
            default: 'main'
          },
          draft: {
            type: 'boolean',
            description: 'Draft PR로 생성',
            default: false
          }
        },
        required: ['owner', 'repo', 'title', 'head']
      },
      execute: async (args) => {
        const { owner, repo, title, body, head, base = 'main', draft = false } = args;

        try {
          const octokit = getOctokit();

          const { data } = await octokit.pulls.create({
            owner,
            repo,
            title,
            body,
            head,
            base,
            draft
          });

          logger.info('GitHub PR 생성', { owner, repo, prNumber: data.number });

          return {
            success: true,
            pullRequest: {
              number: data.number,
              title: data.title,
              state: data.state,
              htmlUrl: data.html_url
            }
          };

        } catch (error) {
          logger.error('GitHub PR 생성 오류', error);
          throw new Error(`PR 생성 실패: ${error.message}`);
        }
      }
    },

    // 파일 내용 조회
    {
      name: 'github_get_content',
      description: 'GitHub 저장소의 파일 내용을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: '저장소 소유자'
          },
          repo: {
            type: 'string',
            description: '저장소 이름'
          },
          path: {
            type: 'string',
            description: '파일 경로 (예: src/index.js)'
          },
          ref: {
            type: 'string',
            description: '브랜치, 태그, 또는 커밋 SHA (기본값: 기본 브랜치)'
          }
        },
        required: ['owner', 'repo', 'path']
      },
      execute: async (args) => {
        const { owner, repo, path, ref } = args;

        try {
          const octokit = getOctokit();

          const params = { owner, repo, path };
          if (ref) params.ref = ref;

          const { data } = await octokit.repos.getContent(params);

          if (Array.isArray(data)) {
            // 디렉토리인 경우
            return {
              success: true,
              type: 'directory',
              path: path,
              contents: data.map(item => ({
                name: item.name,
                type: item.type,
                path: item.path,
                size: item.size,
                htmlUrl: item.html_url
              }))
            };
          }

          // 파일인 경우
          const content = data.encoding === 'base64'
            ? Buffer.from(data.content, 'base64').toString('utf-8')
            : data.content;

          logger.info('GitHub 파일 조회', { owner, repo, path });

          return {
            success: true,
            type: 'file',
            path: data.path,
            name: data.name,
            size: data.size,
            sha: data.sha,
            content: content,
            htmlUrl: data.html_url
          };

        } catch (error) {
          logger.error('GitHub 파일 조회 오류', error);
          throw new Error(`파일 조회 실패: ${error.message}`);
        }
      }
    },

    // 커밋 목록 조회
    {
      name: 'github_list_commits',
      description: 'GitHub 저장소의 커밋 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: '저장소 소유자'
          },
          repo: {
            type: 'string',
            description: '저장소 이름'
          },
          sha: {
            type: 'string',
            description: '브랜치 이름 또는 커밋 SHA'
          },
          path: {
            type: 'string',
            description: '특정 파일/디렉토리의 커밋만 조회'
          },
          author: {
            type: 'string',
            description: '작성자로 필터링'
          },
          since: {
            type: 'string',
            description: '이 날짜 이후 커밋만 (ISO 8601 형식)'
          },
          until: {
            type: 'string',
            description: '이 날짜 이전 커밋만 (ISO 8601 형식)'
          },
          perPage: {
            type: 'number',
            description: '페이지당 결과 수',
            default: 30
          }
        },
        required: ['owner', 'repo']
      },
      execute: async (args) => {
        const { owner, repo, sha, path, author, since, until, perPage = 30 } = args;

        try {
          const octokit = getOctokit();

          const params = {
            owner,
            repo,
            per_page: Math.min(perPage, 100)
          };

          if (sha) params.sha = sha;
          if (path) params.path = path;
          if (author) params.author = author;
          if (since) params.since = since;
          if (until) params.until = until;

          const { data } = await octokit.repos.listCommits(params);

          logger.info('GitHub 커밋 조회', { owner, repo, count: data.length });

          return {
            success: true,
            count: data.length,
            commits: data.map(commit => ({
              sha: commit.sha.substring(0, 7),
              fullSha: commit.sha,
              message: commit.commit.message,
              author: commit.commit.author?.name,
              authorEmail: commit.commit.author?.email,
              date: commit.commit.author?.date,
              htmlUrl: commit.html_url,
              stats: {
                additions: commit.stats?.additions,
                deletions: commit.stats?.deletions,
                total: commit.stats?.total
              }
            }))
          };

        } catch (error) {
          logger.error('GitHub 커밋 조회 오류', error);
          throw new Error(`커밋 조회 실패: ${error.message}`);
        }
      }
    },

    // 내 저장소 목록
    {
      name: 'github_list_my_repos',
      description: '내 GitHub 저장소 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['all', 'owner', 'public', 'private', 'member'],
            description: '저장소 유형',
            default: 'all'
          },
          sort: {
            type: 'string',
            enum: ['created', 'updated', 'pushed', 'full_name'],
            description: '정렬 기준',
            default: 'updated'
          },
          perPage: {
            type: 'number',
            description: '페이지당 결과 수',
            default: 30
          }
        }
      },
      execute: async (args) => {
        const { type = 'all', sort = 'updated', perPage = 30 } = args;

        try {
          const octokit = getOctokit();

          const { data } = await octokit.repos.listForAuthenticatedUser({
            type,
            sort,
            per_page: Math.min(perPage, 100)
          });

          logger.info('GitHub 내 저장소 조회', { count: data.length });

          return {
            success: true,
            count: data.length,
            repositories: data.map(repo => ({
              name: repo.name,
              fullName: repo.full_name,
              description: repo.description,
              language: repo.language,
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              visibility: repo.visibility,
              defaultBranch: repo.default_branch,
              updatedAt: repo.updated_at,
              htmlUrl: repo.html_url
            }))
          };

        } catch (error) {
          logger.error('GitHub 내 저장소 조회 오류', error);
          throw new Error(`내 저장소 조회 실패: ${error.message}`);
        }
      }
    },

    // 저장소 검색
    {
      name: 'github_search_repos',
      description: 'GitHub에서 저장소를 검색합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '검색어 (예: "react language:javascript stars:>1000")'
          },
          sort: {
            type: 'string',
            enum: ['stars', 'forks', 'help-wanted-issues', 'updated'],
            description: '정렬 기준'
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: '정렬 방향',
            default: 'desc'
          },
          perPage: {
            type: 'number',
            description: '페이지당 결과 수',
            default: 30
          }
        },
        required: ['query']
      },
      execute: async (args) => {
        const { query, sort, order = 'desc', perPage = 30 } = args;

        try {
          const octokit = getOctokit();

          const params = {
            q: query,
            order,
            per_page: Math.min(perPage, 100)
          };

          if (sort) params.sort = sort;

          const { data } = await octokit.search.repos(params);

          logger.info('GitHub 저장소 검색', { query, count: data.items.length });

          return {
            success: true,
            totalCount: data.total_count,
            count: data.items.length,
            repositories: data.items.map(repo => ({
              name: repo.name,
              fullName: repo.full_name,
              description: repo.description,
              language: repo.language,
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              openIssues: repo.open_issues_count,
              topics: repo.topics,
              updatedAt: repo.updated_at,
              htmlUrl: repo.html_url
            }))
          };

        } catch (error) {
          logger.error('GitHub 저장소 검색 오류', error);
          throw new Error(`저장소 검색 실패: ${error.message}`);
        }
      }
    }
  ];
}
