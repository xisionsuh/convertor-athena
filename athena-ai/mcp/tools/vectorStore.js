/**
 * Vector Store Tool - 벡터 DB 및 RAG 시스템
 * OpenAI Embeddings를 사용한 의미 검색 기능
 */

import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * 벡터 스토어 도구 생성
 * @param {Object} options - 설정 옵션
 * @returns {Array<Object>} MCP Tool 객체 배열
 */
export function createVectorStoreTools(options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    dbPath = './athena-data/athena.db',
    workspaceRoot = process.cwd()
  } = options;

  const db = new Database(dbPath);

  // 벡터 스토어 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS vector_documents (
      id TEXT PRIMARY KEY,
      collection TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      embedding BLOB,
      chunk_index INTEGER DEFAULT 0,
      source_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_vector_collection ON vector_documents(collection);
    CREATE INDEX IF NOT EXISTS idx_vector_source ON vector_documents(source_id);

    CREATE TABLE IF NOT EXISTS vector_collections (
      name TEXT PRIMARY KEY,
      description TEXT,
      document_count INTEGER DEFAULT 0,
      embedding_model TEXT DEFAULT 'text-embedding-3-small',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const getOpenAI = () => {
    if (!apiKey) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }
    return new OpenAI({ apiKey });
  };

  // 임베딩 생성
  const createEmbedding = async (text, model = 'text-embedding-3-small') => {
    const openai = getOpenAI();
    const response = await openai.embeddings.create({
      model,
      input: text
    });
    return response.data[0].embedding;
  };

  // 코사인 유사도 계산
  const cosineSimilarity = (a, b) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  // 텍스트 청킹
  const chunkText = (text, chunkSize = 1000, overlap = 200) => {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;

      // 문장 경계에서 자르기
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        const lastNewline = text.lastIndexOf('\n', end);
        const cutPoint = Math.max(lastPeriod, lastNewline);

        if (cutPoint > start + chunkSize / 2) {
          end = cutPoint + 1;
        }
      }

      chunks.push({
        text: text.slice(start, end).trim(),
        startIndex: start,
        endIndex: Math.min(end, text.length)
      });

      start = end - overlap;
      if (start < 0) start = 0;
      if (start >= text.length) break;
    }

    return chunks;
  };

  return [
    // 컬렉션 생성
    {
      name: 'create_vector_collection',
      description: '새로운 벡터 컬렉션을 생성합니다. 컬렉션은 관련 문서들의 그룹입니다.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '컬렉션 이름 (영문, 숫자, 언더스코어만)'
          },
          description: {
            type: 'string',
            description: '컬렉션 설명'
          },
          embeddingModel: {
            type: 'string',
            enum: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
            description: '사용할 임베딩 모델',
            default: 'text-embedding-3-small'
          }
        },
        required: ['name']
      },
      execute: async (args) => {
        const { name, description, embeddingModel = 'text-embedding-3-small' } = args;

        try {
          // 이름 유효성 검사
          if (!/^[a-zA-Z0-9_]+$/.test(name)) {
            throw new Error('컬렉션 이름은 영문, 숫자, 언더스코어만 사용 가능합니다.');
          }

          db.prepare(`
            INSERT INTO vector_collections (name, description, embedding_model)
            VALUES (?, ?, ?)
          `).run(name, description || '', embeddingModel);

          logger.info('벡터 컬렉션 생성', { name });

          return {
            success: true,
            collection: name,
            embeddingModel
          };

        } catch (error) {
          if (error.message.includes('UNIQUE constraint')) {
            throw new Error('이미 존재하는 컬렉션 이름입니다.');
          }
          throw error;
        }
      }
    },

    // 문서 추가 (임베딩 생성)
    {
      name: 'add_document',
      description: '컬렉션에 문서를 추가합니다. 긴 문서는 자동으로 청크로 분할됩니다.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: '컬렉션 이름'
          },
          content: {
            type: 'string',
            description: '문서 내용'
          },
          metadata: {
            type: 'object',
            description: '문서 메타데이터 (제목, 출처 등)'
          },
          chunkSize: {
            type: 'number',
            description: '청크 크기 (기본: 1000자)',
            default: 1000
          },
          chunkOverlap: {
            type: 'number',
            description: '청크 중첩 크기 (기본: 200자)',
            default: 200
          }
        },
        required: ['collection', 'content']
      },
      execute: async (args) => {
        const {
          collection,
          content,
          metadata = {},
          chunkSize = 1000,
          chunkOverlap = 200
        } = args;

        try {
          // 컬렉션 확인
          const coll = db.prepare('SELECT * FROM vector_collections WHERE name = ?').get(collection);
          if (!coll) {
            throw new Error(`컬렉션을 찾을 수 없습니다: ${collection}`);
          }

          const sourceId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const chunks = chunkText(content, chunkSize, chunkOverlap);

          logger.info('문서 임베딩 시작', { collection, chunks: chunks.length });

          const insertStmt = db.prepare(`
            INSERT INTO vector_documents (id, collection, content, metadata, embedding, chunk_index, source_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const embedding = await createEmbedding(chunk.text, coll.embedding_model);

            const docId = `${sourceId}_chunk_${i}`;
            const chunkMetadata = {
              ...metadata,
              chunkIndex: i,
              totalChunks: chunks.length,
              startIndex: chunk.startIndex,
              endIndex: chunk.endIndex
            };

            insertStmt.run(
              docId,
              collection,
              chunk.text,
              JSON.stringify(chunkMetadata),
              Buffer.from(new Float32Array(embedding).buffer),
              i,
              sourceId
            );
          }

          // 컬렉션 문서 수 업데이트
          db.prepare(`
            UPDATE vector_collections
            SET document_count = (SELECT COUNT(*) FROM vector_documents WHERE collection = ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE name = ?
          `).run(collection, collection);

          logger.info('문서 추가 완료', { sourceId, chunks: chunks.length });

          return {
            success: true,
            sourceId,
            chunksCreated: chunks.length,
            collection
          };

        } catch (error) {
          logger.error('문서 추가 오류', error);
          throw new Error(`문서 추가 실패: ${error.message}`);
        }
      }
    },

    // 파일에서 문서 추가
    {
      name: 'add_document_from_file',
      description: '파일에서 텍스트를 읽어 컬렉션에 추가합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: '컬렉션 이름'
          },
          filePath: {
            type: 'string',
            description: '파일 경로'
          },
          chunkSize: {
            type: 'number',
            default: 1000
          }
        },
        required: ['collection', 'filePath']
      },
      execute: async (args) => {
        const { collection, filePath, chunkSize = 1000 } = args;

        try {
          const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspaceRoot, filePath);

          if (!fs.existsSync(fullPath)) {
            throw new Error(`파일을 찾을 수 없습니다: ${fullPath}`);
          }

          const content = fs.readFileSync(fullPath, 'utf-8');
          const fileName = path.basename(fullPath);

          // 문서 추가 재사용
          const coll = db.prepare('SELECT * FROM vector_collections WHERE name = ?').get(collection);
          if (!coll) {
            throw new Error(`컬렉션을 찾을 수 없습니다: ${collection}`);
          }

          const sourceId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const chunks = chunkText(content, chunkSize, 200);

          const insertStmt = db.prepare(`
            INSERT INTO vector_documents (id, collection, content, metadata, embedding, chunk_index, source_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const embedding = await createEmbedding(chunk.text, coll.embedding_model);

            insertStmt.run(
              `${sourceId}_chunk_${i}`,
              collection,
              chunk.text,
              JSON.stringify({ fileName, filePath: fullPath, chunkIndex: i }),
              Buffer.from(new Float32Array(embedding).buffer),
              i,
              sourceId
            );
          }

          // 문서 수 업데이트
          db.prepare(`
            UPDATE vector_collections
            SET document_count = (SELECT COUNT(*) FROM vector_documents WHERE collection = ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE name = ?
          `).run(collection, collection);

          return {
            success: true,
            sourceId,
            fileName,
            chunksCreated: chunks.length
          };

        } catch (error) {
          logger.error('파일 추가 오류', error);
          throw new Error(`파일 추가 실패: ${error.message}`);
        }
      }
    },

    // 의미 검색 (Semantic Search)
    {
      name: 'semantic_search',
      description: '자연어 쿼리로 관련 문서를 의미 기반으로 검색합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: '검색할 컬렉션'
          },
          query: {
            type: 'string',
            description: '검색 쿼리'
          },
          topK: {
            type: 'number',
            description: '반환할 결과 수',
            default: 5
          },
          threshold: {
            type: 'number',
            description: '최소 유사도 임계값 (0-1)',
            default: 0.7
          }
        },
        required: ['collection', 'query']
      },
      execute: async (args) => {
        const { collection, query, topK = 5, threshold = 0.7 } = args;

        try {
          const coll = db.prepare('SELECT * FROM vector_collections WHERE name = ?').get(collection);
          if (!coll) {
            throw new Error(`컬렉션을 찾을 수 없습니다: ${collection}`);
          }

          // 쿼리 임베딩 생성
          const queryEmbedding = await createEmbedding(query, coll.embedding_model);

          // 모든 문서 가져오기
          const documents = db.prepare(`
            SELECT id, content, metadata, embedding
            FROM vector_documents
            WHERE collection = ?
          `).all(collection);

          // 유사도 계산
          const results = documents.map(doc => {
            const docEmbedding = new Float32Array(doc.embedding.buffer);
            const similarity = cosineSimilarity(queryEmbedding, Array.from(docEmbedding));

            return {
              id: doc.id,
              content: doc.content,
              metadata: doc.metadata ? JSON.parse(doc.metadata) : {},
              similarity
            };
          })
            .filter(r => r.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

          logger.info('의미 검색 완료', { collection, query, resultsCount: results.length });

          return {
            success: true,
            query,
            results: results.map(r => ({
              ...r,
              similarity: Math.round(r.similarity * 1000) / 1000
            })),
            totalSearched: documents.length
          };

        } catch (error) {
          logger.error('의미 검색 오류', error);
          throw new Error(`검색 실패: ${error.message}`);
        }
      }
    },

    // RAG 컨텍스트 생성
    {
      name: 'generate_rag_context',
      description: 'RAG(Retrieval-Augmented Generation)를 위한 컨텍스트를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          collections: {
            type: 'array',
            items: { type: 'string' },
            description: '검색할 컬렉션들'
          },
          query: {
            type: 'string',
            description: '질문 또는 검색 쿼리'
          },
          topK: {
            type: 'number',
            default: 5
          },
          maxContextLength: {
            type: 'number',
            description: '최대 컨텍스트 길이 (토큰 추정)',
            default: 4000
          }
        },
        required: ['collections', 'query']
      },
      execute: async (args) => {
        const { collections, query, topK = 5, maxContextLength = 4000 } = args;

        try {
          let allResults = [];

          // 각 컬렉션에서 검색
          for (const collection of collections) {
            const coll = db.prepare('SELECT * FROM vector_collections WHERE name = ?').get(collection);
            if (!coll) continue;

            const queryEmbedding = await createEmbedding(query, coll.embedding_model);

            const documents = db.prepare(`
              SELECT id, content, metadata, embedding
              FROM vector_documents
              WHERE collection = ?
            `).all(collection);

            const results = documents.map(doc => {
              const docEmbedding = new Float32Array(doc.embedding.buffer);
              const similarity = cosineSimilarity(queryEmbedding, Array.from(docEmbedding));

              return {
                collection,
                id: doc.id,
                content: doc.content,
                metadata: doc.metadata ? JSON.parse(doc.metadata) : {},
                similarity
              };
            });

            allResults = allResults.concat(results);
          }

          // 정렬 및 필터링
          allResults = allResults
            .filter(r => r.similarity >= 0.7)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

          // 컨텍스트 구성
          let contextLength = 0;
          const contextParts = [];

          for (const result of allResults) {
            const estimatedTokens = result.content.length / 4;
            if (contextLength + estimatedTokens > maxContextLength) break;

            contextParts.push({
              source: result.metadata.fileName || result.collection,
              content: result.content,
              similarity: Math.round(result.similarity * 100) / 100
            });

            contextLength += estimatedTokens;
          }

          const contextText = contextParts.map((p, i) =>
            `[출처 ${i + 1}: ${p.source}]\n${p.content}`
          ).join('\n\n---\n\n');

          logger.info('RAG 컨텍스트 생성', { collections, resultsCount: contextParts.length });

          return {
            success: true,
            context: contextText,
            sources: contextParts.map(p => ({
              source: p.source,
              similarity: p.similarity
            })),
            estimatedTokens: Math.round(contextLength)
          };

        } catch (error) {
          logger.error('RAG 컨텍스트 생성 오류', error);
          throw new Error(`컨텍스트 생성 실패: ${error.message}`);
        }
      }
    },

    // 컬렉션 목록 조회
    {
      name: 'list_vector_collections',
      description: '모든 벡터 컬렉션 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        try {
          const collections = db.prepare('SELECT * FROM vector_collections ORDER BY updated_at DESC').all();

          return {
            success: true,
            collections: collections.map(c => ({
              name: c.name,
              description: c.description,
              documentCount: c.document_count,
              embeddingModel: c.embedding_model,
              createdAt: c.created_at,
              updatedAt: c.updated_at
            })),
            total: collections.length
          };

        } catch (error) {
          throw new Error(`목록 조회 실패: ${error.message}`);
        }
      }
    },

    // 문서 삭제
    {
      name: 'delete_documents',
      description: '컬렉션에서 문서를 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description: '컬렉션 이름'
          },
          sourceId: {
            type: 'string',
            description: '삭제할 문서의 source ID'
          }
        },
        required: ['collection', 'sourceId']
      },
      execute: async (args) => {
        const { collection, sourceId } = args;

        try {
          const result = db.prepare(`
            DELETE FROM vector_documents
            WHERE collection = ? AND source_id = ?
          `).run(collection, sourceId);

          // 문서 수 업데이트
          db.prepare(`
            UPDATE vector_collections
            SET document_count = (SELECT COUNT(*) FROM vector_documents WHERE collection = ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE name = ?
          `).run(collection, collection);

          return {
            success: true,
            deletedCount: result.changes
          };

        } catch (error) {
          throw new Error(`삭제 실패: ${error.message}`);
        }
      }
    },

    // 컬렉션 삭제
    {
      name: 'delete_vector_collection',
      description: '벡터 컬렉션과 모든 문서를 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '삭제할 컬렉션 이름'
          }
        },
        required: ['name']
      },
      execute: async (args) => {
        const { name } = args;

        try {
          // 문서 먼저 삭제
          const docsResult = db.prepare('DELETE FROM vector_documents WHERE collection = ?').run(name);

          // 컬렉션 삭제
          const collResult = db.prepare('DELETE FROM vector_collections WHERE name = ?').run(name);

          if (collResult.changes === 0) {
            throw new Error('컬렉션을 찾을 수 없습니다');
          }

          return {
            success: true,
            deletedDocuments: docsResult.changes
          };

        } catch (error) {
          throw new Error(`삭제 실패: ${error.message}`);
        }
      }
    }
  ];
}
