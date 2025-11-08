/**
 * Model Context Protocol (MCP) - 기본 인터페이스
 * 
 * MCP는 AI 모델이 외부 도구와 리소스에 접근할 수 있게 해주는 프로토콜입니다.
 * Claude의 MCP 스펙을 참고하여 구현합니다.
 */

/**
 * MCP Tool 정의
 * @typedef {Object} MCPTool
 * @property {string} name - 도구 이름
 * @property {string} description - 도구 설명
 * @property {Object} inputSchema - 입력 스키마 (JSON Schema)
 * @property {Function} execute - 도구 실행 함수
 */

/**
 * MCP Resource 정의
 * @typedef {Object} MCPResource
 * @property {string} uri - 리소스 URI
 * @property {string} name - 리소스 이름
 * @property {string} description - 리소스 설명
 * @property {string} mimeType - MIME 타입
 * @property {Function} getContent - 리소스 내용 가져오기 함수
 */

/**
 * MCP 기본 클래스
 */
export class MCPBase {
  constructor() {
    this.tools = new Map();
    this.resources = new Map();
  }

  /**
   * 도구 등록
   * @param {MCPTool} tool - 등록할 도구
   */
  registerTool(tool) {
    if (!tool.name || !tool.execute) {
      throw new Error('Tool must have name and execute function');
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 리소스 등록
   * @param {MCPResource} resource - 등록할 리소스
   */
  registerResource(resource) {
    if (!resource.uri || !resource.getContent) {
      throw new Error('Resource must have uri and getContent function');
    }
    this.resources.set(resource.uri, resource);
  }

  /**
   * 도구 목록 조회
   * @returns {Array<MCPTool>}
   */
  listTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  /**
   * 리소스 목록 조회
   * @returns {Array<MCPResource>}
   */
  listResources() {
    return Array.from(this.resources.values()).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    }));
  }

  /**
   * 도구 실행
   * @param {string} toolName - 도구 이름
   * @param {Object} args - 도구 인자
   * @returns {Promise<any>}
   */
  async executeTool(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    try {
      const result = await tool.execute(args);
      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 리소스 내용 가져오기
   * @param {string} uri - 리소스 URI
   * @returns {Promise<any>}
   */
  async getResource(uri) {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    try {
      const content = await resource.getContent();
      return {
        success: true,
        uri,
        mimeType: resource.mimeType,
        content
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

