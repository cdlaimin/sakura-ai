/**
 * 知识库管理服务
 * 提供知识库的完整CRUD操作和批量导入功能
 */

import { TestCaseKnowledgeBase, KnowledgeItem, SearchResult } from './testCaseKnowledgeBase.js';

export interface KnowledgeItemInput {
  category: string;
  title: string;
  content: string;
  businessDomain: string;
  tags: string[];
  metadata?: any;
}

export interface KnowledgeSearchParams {
  query: string;
  systemName?: string;
  businessDomain?: string;
  category?: string;
  topK?: number;
  scoreThreshold?: number;
}

export interface KnowledgeStatsResponse {
  systemName: string;
  collectionName: string;
  totalCount: number;
  categoryCounts: { [key: string]: number };
  totalKnowledge: number;
  byCategory: {
    business_rule: number;
    test_pattern: number;
    pitfall: number;
    risk_scenario: number;
    [key: string]: number;
  };
}

export interface BatchImportResult {
  success: number;
  failed: number;
  errors: Array<{
    index: number;
    title: string;
    error: string;
  }>;
}

export class KnowledgeManagementService {
  /**
   * 获取指定系统的知识库实例
   */
  private getKnowledgeBase(systemName?: string): TestCaseKnowledgeBase {
    return new TestCaseKnowledgeBase(systemName);
  }

  /**
   * 添加单条知识
   */
  async addKnowledge(systemName: string | undefined, knowledge: KnowledgeItemInput): Promise<void> {
    const kb = this.getKnowledgeBase(systemName);

    // 确保集合已初始化
    await kb.initCollection();

    // 生成唯一ID
    const knowledgeItem: KnowledgeItem = {
      id: this.generateId(),
      ...knowledge
    };

    await kb.addKnowledge(knowledgeItem);
  }

  async listKnowledge(
    systemName?: string,
    params: {
      businessDomain?: string;
      category?: string;
      limit?: number;
    } = {}
  ): Promise<KnowledgeItem[]> {
    const kb = this.getKnowledgeBase(systemName);
    return kb.listKnowledge(params);
  }

  async updateKnowledge(
    systemName: string | undefined,
    knowledgeId: string,
    knowledge: KnowledgeItemInput
  ): Promise<void> {
    const kb = this.getKnowledgeBase(systemName);
    await kb.initCollection();
    await kb.updateKnowledge(knowledgeId, {
      id: knowledgeId,
      ...knowledge
    });
  }

  /**
   * 批量导入知识
   */
  async batchImport(
    systemName: string | undefined,
    knowledgeList: KnowledgeItemInput[]
  ): Promise<BatchImportResult> {
    const kb = this.getKnowledgeBase(systemName);
    await kb.initCollection();

    const result: BatchImportResult = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < knowledgeList.length; i++) {
      try {
        const knowledgeItem: KnowledgeItem = {
          id: this.generateId(),
          ...knowledgeList[i]
        };

        await kb.addKnowledge(knowledgeItem);
        result.success++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          index: i,
          title: knowledgeList[i].title,
          error: error.message
        });
      }
    }

    return result;
  }

  /**
   * 搜索知识
   */
  async searchKnowledge(params: KnowledgeSearchParams): Promise<SearchResult[]> {
    const kb = this.getKnowledgeBase(params.systemName);

    return kb.searchKnowledge({
      query: params.query,
      businessDomain: params.businessDomain,
      category: params.category,
      topK: params.topK || 10,
      scoreThreshold: params.scoreThreshold ?? 0.5
    });
  }

  /**
   * 按类别搜索知识
   */
  async searchByCategory(
    systemName: string | undefined,
    query: string,
    businessDomain?: string,
    topK: number = 3
  ): Promise<{
    businessRules: SearchResult[];
    testPatterns: SearchResult[];
    pitfalls: SearchResult[];
    riskScenarios: SearchResult[];
  }> {
    const kb = this.getKnowledgeBase(systemName);

    return kb.searchByCategory({
      query,
      businessDomain,
      topK,
      scoreThreshold: 0.5
    });
  }

  /**
   * 获取指定系统的知识库统计
   */
  async getStats(systemName?: string): Promise<{
    systemName: string;
    collectionName: string;
    totalCount: number;
    categoryCounts: { [key: string]: number };
  } & KnowledgeStatsResponse> {
    const kb = this.getKnowledgeBase(systemName);
    const stats = await kb.getStats();
    const normalizedCategoryCounts = {
      business_rule: stats.categoryCounts.business_rule || 0,
      test_pattern: stats.categoryCounts.test_pattern || 0,
      pitfall: stats.categoryCounts.pitfall || 0,
      risk_scenario: stats.categoryCounts.risk_scenario || 0,
      ...stats.categoryCounts
    };

    return {
      systemName: systemName || '默认',
      collectionName: kb.getCollectionName(),
      totalCount: stats.totalCount,
      categoryCounts: stats.categoryCounts,
      totalKnowledge: stats.totalCount,
      byCategory: normalizedCategoryCounts
    };
  }

  /**
   * 获取所有系统的知识库统计
   */
  async getAllSystemsStats(): Promise<Array<{
    systemName: string;
    collectionName: string;
    totalCount: number;
    categoryCounts: { [key: string]: number };
  }>> {
    const kb = new TestCaseKnowledgeBase(); // 使用默认实例来调用静态方法
    return kb.getAllSystemsStats();
  }

  /**
   * 列出所有知识库集合
   */
  async listAllCollections(): Promise<string[]> {
    const kb = new TestCaseKnowledgeBase();
    return kb.listAllCollections();
  }

  /**
   * 检查集合是否存在
   */
  async collectionExists(systemName?: string): Promise<boolean> {
    const kb = new TestCaseKnowledgeBase();
    return kb.collectionExists(systemName);
  }

  /**
   * 为系统创建知识库集合
   */
  async createCollectionForSystem(systemName: string): Promise<void> {
    const kb = new TestCaseKnowledgeBase();
    await kb.createCollectionForSystem(systemName);
  }

  /**
   * 删除系统的知识库集合
   */
  async deleteCollectionForSystem(systemName: string): Promise<void> {
    const kb = new TestCaseKnowledgeBase();
    await kb.deleteCollectionForSystem(systemName);
  }

  /**
   * 清空指定系统的知识库
   */
  async clearSystemKnowledge(systemName?: string): Promise<void> {
    const kb = this.getKnowledgeBase(systemName);
    await kb.clearAll();
  }

  /**
   * 删除指定知识（需要先搜索获取内部ID）
   */
  async deleteKnowledge(systemName: string | undefined, knowledgeId: string): Promise<void> {
    const kb = this.getKnowledgeBase(systemName);
    await kb.deleteKnowledge(knowledgeId);
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `kb_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 验证知识数据
   */
  validateKnowledgeItem(item: KnowledgeItemInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!item.title || item.title.trim().length === 0) {
      errors.push('标题不能为空');
    }

    if (!item.content || item.content.trim().length === 0) {
      errors.push('内容不能为空');
    }

    if (!item.category) {
      errors.push('类别不能为空');
    } else {
      const validCategories = ['business_rule', 'test_pattern', 'pitfall', 'risk_scenario'];
      if (!validCategories.includes(item.category)) {
        errors.push(`类别必须是以下之一: ${validCategories.join(', ')}`);
      }
    }

    if (!item.businessDomain || item.businessDomain.trim().length === 0) {
      errors.push('业务领域不能为空');
    }

    if (!Array.isArray(item.tags)) {
      errors.push('标签必须是数组');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 从JSON批量导入知识
   */
  async importFromJSON(
    systemName: string | undefined,
    jsonData: any[]
  ): Promise<BatchImportResult> {
    const validatedItems: KnowledgeItemInput[] = [];
    const result: BatchImportResult = {
      success: 0,
      failed: 0,
      errors: []
    };

    // 验证每条数据
    for (let i = 0; i < jsonData.length; i++) {
      const item = jsonData[i];
      const validation = this.validateKnowledgeItem(item);

      if (!validation.valid) {
        result.failed++;
        result.errors.push({
          index: i,
          title: item.title || '未知',
          error: validation.errors.join('; ')
        });
      } else {
        validatedItems.push(item);
      }
    }

    // 批量导入有效数据
    if (validatedItems.length > 0) {
      const importResult = await this.batchImport(systemName, validatedItems);
      result.success += importResult.success;
      result.failed += importResult.failed;
      result.errors.push(...importResult.errors);
    }

    return result;
  }

  /**
   * 测试知识检索（用于验证知识库效果）
   */
  async testSearch(
    systemName: string | undefined,
    testQuery: string,
    businessDomain?: string
  ): Promise<{
    query: string;
    systemName: string;
    businessDomain?: string;
    results: SearchResult[];
    totalFound: number;
  }> {
    const results = await this.searchKnowledge({
      query: testQuery,
      systemName,
      businessDomain,
      topK: 5,
      scoreThreshold: 0.3 // 降低阈值以看到更多结果
    });

    return {
      query: testQuery,
      systemName: systemName || '默认',
      businessDomain,
      results,
      totalFound: results.length
    };
  }
}
