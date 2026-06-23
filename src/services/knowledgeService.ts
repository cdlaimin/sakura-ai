/**
 * 知识库管理前端服务
 */

// 🔥 使用统一的 API 配置
import { getApiBaseUrl } from '../config/api';
import type { KnowledgeSettings } from './settingsService';
const API_BASE_URL = getApiBaseUrl('/api/v1/knowledge');
const TOKEN_KEY = 'authToken';

/**
 * 获取认证请求头
 */
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 处理 API 响应
 */
async function handleResponse(response: Response) {
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// 知识条目类型
export interface KnowledgeItem {
  id?: string;
  category: 'business_rule' | 'test_pattern' | 'pitfall' | 'risk_scenario';
  title: string;
  content: string;
  businessDomain: string;
  tags: string[];
  metadata?: Record<string, any>;
  createdAt?: string;
}

// 知识搜索结果
export interface KnowledgeSearchResult {
  knowledge: KnowledgeItem;
  score: number;
}

// 知识库统计
export interface KnowledgeStats {
  totalKnowledge: number;
  byCategory: {
    business_rule: number;
    test_pattern: number;
    pitfall: number;
    risk_scenario: number;
  };
}

// 批量导入结果
export interface BatchImportResult {
  success: number;
  failed: number;
  errors: Array<string | { index: number; title: string; error: string }>;
}

// 知识类别配置
export const KNOWLEDGE_CATEGORIES = [
  { value: 'business_rule', label: '业务规则', color: '#1890ff', icon: '📋' },
  { value: 'test_pattern', label: '测试模式', color: '#52c41a', icon: '🎯' },
  { value: 'pitfall', label: '历史踩坑点', color: '#faad14', icon: '⚠️' },
  { value: 'risk_scenario', label: '资损风险场景', color: '#f5222d', icon: '🚨' }
];

class KnowledgeService {
  async getKnowledgeConfig(): Promise<KnowledgeSettings> {
    const response = await fetch('/api/config/knowledge', {
      headers: getAuthHeaders()
    });
    const result = await handleResponse(response);
    return result.data;
  }

  async saveKnowledgeConfig(config: KnowledgeSettings): Promise<KnowledgeSettings> {
    const response = await fetch('/api/config/knowledge', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(config)
    });
    const result = await handleResponse(response);
    return result.data;
  }

  async testKnowledgeConfig(config: KnowledgeSettings): Promise<any> {
    const response = await fetch('/api/config/knowledge/test-connection', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(config)
    });
    return handleResponse(response);
  }

  private normalizeStats(data: any): KnowledgeStats {
    const byCategory = data.byCategory || data.categoryCounts || {};
    return {
      totalKnowledge: data.totalKnowledge ?? data.totalCount ?? 0,
      byCategory: {
        business_rule: byCategory.business_rule || 0,
        test_pattern: byCategory.test_pattern || 0,
        pitfall: byCategory.pitfall || 0,
        risk_scenario: byCategory.risk_scenario || 0
      }
    };
  }

  /**
   * 获取所有知识库集合列表
   */
  async getCollections(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/collections`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  }

  /**
   * 获取所有系统的知识库统计
   */
  async getAllStats(): Promise<Array<{ systemName: string; stats: KnowledgeStats }>> {
    const response = await fetch(`${API_BASE_URL}/stats`, {
      headers: getAuthHeaders()
    });
    const data = await handleResponse(response);
    const statsList = Array.isArray(data.stats) ? data.stats : [];
    return statsList.map((item: any) => ({
      systemName: item.systemName,
      stats: this.normalizeStats(item)
    }));
  }

  /**
   * 获取指定系统的知识库统计
   */
  async getSystemStats(systemName: string): Promise<KnowledgeStats> {
    const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(systemName)}/stats`, {
      headers: getAuthHeaders()
    });
    return this.normalizeStats(await handleResponse(response));
  }

  /**
   * 获取指定系统的知识列表，不依赖语义搜索。
   */
  async listKnowledge(params: {
    systemName: string;
    category?: string;
    businessDomain?: string;
    limit?: number;
  }): Promise<KnowledgeItem[]> {
    const { systemName, ...rest } = params;
    const queryParams = new URLSearchParams();
    Object.entries(rest).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    const response = await fetch(
      `${API_BASE_URL}/${encodeURIComponent(systemName)}/list?${queryParams}`,
      { headers: getAuthHeaders() }
    );
    const data = await handleResponse(response);
    return data.items || [];
  }

  /**
   * 搜索知识
   */
  async searchKnowledge(params: {
    query: string;
    systemName?: string;
    category?: string;
    topK?: number;
    scoreThreshold?: number;
  }): Promise<KnowledgeSearchResult[]> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, String(value));
      }
    });

    const response = await fetch(`${API_BASE_URL}/search?${queryParams}`, {
      headers: getAuthHeaders()
    });
    const data = await handleResponse(response);
    // 后端返回 { query, systemName, results, totalFound }，我们需要 results 数组
    return data.results || [];
  }

  /**
   * 按类别搜索知识
   */
  async searchByCategory(
    systemName: string,
    query: string,
    topK: number = 5
  ): Promise<{
    businessRules: KnowledgeSearchResult[];
    testPatterns: KnowledgeSearchResult[];
    pitfalls: KnowledgeSearchResult[];
    riskScenarios: KnowledgeSearchResult[];
  }> {
    const queryParams = new URLSearchParams({ query, topK: String(topK) });
    const response = await fetch(
      `${API_BASE_URL}/${encodeURIComponent(systemName)}/search-by-category?${queryParams}`,
      { headers: getAuthHeaders() }
    );
    return handleResponse(response);
  }

  /**
   * 测试搜索功能
   */
  async testSearch(params: {
    query: string;
    systemName?: string;
    topK?: number;
  }): Promise<{
    query: string;
    systemName?: string;
    results: KnowledgeSearchResult[];
    totalFound: number;
  }> {
    const response = await fetch(`${API_BASE_URL}/test-search`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...params,
        testQuery: params.query
      })
    });
    return handleResponse(response);
  }

  /**
   * 添加单条知识
   */
  async addKnowledge(systemName: string, knowledge: KnowledgeItem): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(systemName)}/add`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(knowledge)
    });
    return handleResponse(response);
  }

  /**
   * 更新单条知识
   */
  async updateKnowledge(systemName: string, knowledgeId: string, knowledge: KnowledgeItem): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/${encodeURIComponent(systemName)}/items/${encodeURIComponent(knowledgeId)}`,
      {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(knowledge)
      }
    );
    return handleResponse(response);
  }

  /**
   * 删除单条知识
   */
  async deleteKnowledge(systemName: string, knowledgeId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/${encodeURIComponent(systemName)}/items/${encodeURIComponent(knowledgeId)}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders()
      }
    );
    return handleResponse(response);
  }

  /**
   * 批量导入知识
   */
  async batchImport(
    systemName: string,
    knowledgeList: KnowledgeItem[]
  ): Promise<BatchImportResult> {
    const response = await fetch(
      `${API_BASE_URL}/${encodeURIComponent(systemName)}/batch-import`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ knowledgeList })
      }
    );
    return handleResponse(response);
  }

  /**
   * 从 JSON 文件导入知识
   */
  async importFromJSON(systemName: string, file: File): Promise<BatchImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem(TOKEN_KEY);
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(
      `${API_BASE_URL}/${encodeURIComponent(systemName)}/import-json`,
      {
        method: 'POST',
        headers,
        body: formData
      }
    );
    return handleResponse(response);
  }

  /**
   * 清空系统知识库
   */
  async clearKnowledge(systemName: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(systemName)}/clear`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  }

  /**
   * 验证知识条目格式
   */
  validateKnowledge(knowledge: KnowledgeItem): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!knowledge.category) {
      errors.push('知识类别不能为空');
    } else if (!['business_rule', 'test_pattern', 'pitfall', 'risk_scenario'].includes(knowledge.category)) {
      errors.push('知识类别无效');
    }

    if (!knowledge.title || knowledge.title.trim().length === 0) {
      errors.push('知识标题不能为空');
    } else if (knowledge.title.length < 5) {
      errors.push('知识标题至少需要5个字符');
    } else if (knowledge.title.length > 200) {
      errors.push('知识标题不能超过200个字符');
    }

    if (!knowledge.content || knowledge.content.trim().length === 0) {
      errors.push('知识内容不能为空');
    } else if (knowledge.content.length < 10) {
      errors.push('知识内容至少需要10个字符');
    } else if (knowledge.content.length > 5000) {
      errors.push('知识内容不能超过5000个字符');
    }

    if (!knowledge.businessDomain || knowledge.businessDomain.trim().length === 0) {
      errors.push('业务领域不能为空');
    }

    if (!knowledge.tags || knowledge.tags.length === 0) {
      errors.push('至少需要添加一个标签');
    } else if (knowledge.tags.length > 10) {
      errors.push('标签数量不能超过10个');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 导出知识为 JSON 格式
   */
  exportToJSON(knowledgeList: KnowledgeItem[]): string {
    return JSON.stringify(knowledgeList, null, 2);
  }

  /**
   * 从 JSON 字符串解析知识
   */
  parseJSON(jsonString: string): KnowledgeItem[] {
    try {
      const data = JSON.parse(jsonString);
      if (!Array.isArray(data)) {
        throw new Error('JSON 数据必须是数组格式');
      }
      return data;
    } catch (error) {
      throw new Error(`JSON 解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取知识类别配置
   */
  getCategoryConfig(category: string) {
    return KNOWLEDGE_CATEGORIES.find(c => c.value === category);
  }

  /**
   * 下载为 JSON 文件
   */
  downloadAsJSON(knowledgeList: KnowledgeItem[], filename: string = 'knowledge.json') {
    const jsonString = this.exportToJSON(knowledgeList);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export default new KnowledgeService();
