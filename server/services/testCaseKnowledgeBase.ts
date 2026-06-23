/**
 * 测试用例知识库服务
 * 基于Qdrant向量数据库实现RAG（检索增强生成）
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { BackendSettingsService } from './settingsService.js';
import type { KnowledgeSettings } from '../../src/services/settingsService.js';

// 知识条目接口
export interface KnowledgeItem {
  id: string;
  category: string;  // 知识类别：business_rule | test_pattern | pitfall | risk_scenario
  title: string;     // 知识标题
  content: string;   // 知识内容
  businessDomain: string;  // 业务领域：订单管理、优惠促销等
  tags: string[];    // 标签
  metadata?: any;    // 额外元数据
  createdAt?: string;
  updatedAt?: string;
}

// 检索结果接口
export interface SearchResult {
  knowledge: KnowledgeItem;
  score: number;  // 相似度分数 0-1
}

export class TestCaseKnowledgeBase {
  private qdrant: QdrantClient;
  private openai: OpenAI;
  private collectionName: string; // 🔥 改为动态集合名称
  private systemName?: string; // 🔥 新增：系统名称
  private useGemini: boolean;
  private embeddingProvider: string;
  private runtimeConfig: KnowledgeSettings;
  private runtimeConfigKey = '';

  /**
   * 生成UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 🔥 新增：根据系统名称生成集合名称
   */
  static getCollectionName(systemName?: string): string {
    if (!systemName) {
      return 'test_knowledge_default'; // 默认集合
    }
    // 清理系统名称，确保是有效的集合名称（只保留字母、数字、下划线）
    const cleanName = systemName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase();
    return `test_knowledge_${cleanName}`;
  }

  /**
   * 构造函数
   * @param systemName 可选的系统名称，用于隔离不同系统的知识库
   */
  constructor(systemName?: string) {
    this.systemName = systemName;
    this.collectionName = TestCaseKnowledgeBase.getCollectionName(systemName);

    this.runtimeConfig = this.getEnvRuntimeConfig();
    this.embeddingProvider = this.runtimeConfig.embeddingProvider;
    this.useGemini = this.embeddingProvider === 'gemini';
    this.qdrant = new QdrantClient({
      url: this.runtimeConfig.qdrantUrl,
      checkCompatibility: false
    });
    this.openai = this.createOpenAIClient(this.runtimeConfig);
  }

  private getEnvRuntimeConfig(): KnowledgeSettings {
    const provider = (process.env.EMBEDDING_PROVIDER || 'aliyun') as KnowledgeSettings['embeddingProvider'];
    const providerDefaults: Record<string, { baseUrl: string; model: string; dimension: number }> = {
      aliyun: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'text-embedding-v4', dimension: 1024 },
      openai: { baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small', dimension: 1536 },
      gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'text-embedding-004', dimension: 768 },
      xinference: { baseUrl: 'http://localhost:9997/v1', model: 'bge-large-zh-v1.5', dimension: 1024 }
    };
    const fallback = providerDefaults[provider] || providerDefaults.aliyun;
    const envDimension = parseInt(process.env.EMBEDDING_DIMENSION || '', 10);

    return {
      qdrantUrl: process.env.QDRANT_URL || 'http://172.19.5.223:6333',
      embeddingProvider: providerDefaults[provider] ? provider : 'aliyun',
      embeddingApiBaseUrl: (process.env.EMBEDDING_API_BASE_URL || fallback.baseUrl).replace(/\/$/, ''),
      embeddingApiKey: process.env.EMBEDDING_API_KEY || process.env.GEMINI_API_KEY || '',
      embeddingModel: process.env.EMBEDDING_MODEL || fallback.model,
      embeddingDimension: Number.isFinite(envDimension) && envDimension > 0 ? envDimension : fallback.dimension
    };
  }

  private createOpenAIClient(config: KnowledgeSettings): OpenAI {
    return new OpenAI({
      baseURL: config.embeddingApiBaseUrl,
      apiKey: config.embeddingApiKey || 'not-required'
    });
  }

  private getRuntimeConfigKey(config: KnowledgeSettings): string {
    return JSON.stringify({
      qdrantUrl: config.qdrantUrl,
      embeddingProvider: config.embeddingProvider,
      embeddingApiBaseUrl: config.embeddingApiBaseUrl,
      embeddingApiKeySet: !!config.embeddingApiKey,
      embeddingModel: config.embeddingModel,
      embeddingDimension: config.embeddingDimension
    });
  }

  private async ensureRuntimeConfig(): Promise<void> {
    let config = this.runtimeConfig;
    try {
      config = await BackendSettingsService.getInstance().getKnowledgeSettings();
    } catch (error) {
      console.warn('加载知识库配置失败，使用环境变量配置:', error);
    }

    const configKey = this.getRuntimeConfigKey(config);
    if (configKey === this.runtimeConfigKey) {
      return;
    }

    this.runtimeConfig = config;
    this.runtimeConfigKey = configKey;
    this.embeddingProvider = config.embeddingProvider;
    this.useGemini = config.embeddingProvider === 'gemini';
    this.qdrant = new QdrantClient({
      url: config.qdrantUrl,
      checkCompatibility: false
    });
    this.openai = this.createOpenAIClient(config);
    console.log(`知识库运行配置已加载: Qdrant=${config.qdrantUrl}, Provider=${config.embeddingProvider}, Model=${config.embeddingModel}`);
  }

  /**
   * 初始化知识库集合（首次运行时调用）
   */
  async initCollection(): Promise<void> {
    try {
      await this.ensureRuntimeConfig();
      // 检查集合是否已存在
      const collections = await this.qdrant.getCollections();
      const exists = collections.collections.some(c => c.name === this.collectionName);

      if (exists) {
        console.log(`✅ 知识库集合已存在: ${this.collectionName}`);
        return;
      }

      const vectorSize = this.getEmbeddingVectorSize();

      // 创建新集合
      await this.qdrant.createCollection(this.collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine'  // 余弦相似度
        }
      });

      console.log(`✅ 知识库集合创建成功: ${this.collectionName}, 向量维度=${vectorSize}`);
    } catch (error) {
      console.error('❌ 初始化知识库失败:', error);
      throw error;
    }
  }

  /**
   * 生成文本的向量表示
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      await this.ensureRuntimeConfig();
      if (this.useGemini) {
        return await this.generateGeminiEmbedding(text);
      } else {
        return await this.generateOpenAIEmbedding(text);
      }
    } catch (error) {
      console.error('❌ 生成Embedding失败:', error);
      throw error;
    }
  }

  /**
   * 使用Google Gemini生成向量
   */
  private async generateGeminiEmbedding(text: string): Promise<number[]> {
    const apiKey = this.runtimeConfig.embeddingApiKey;
    const model = this.runtimeConfig.embeddingModel || 'text-embedding-004';
    const baseUrl = (this.runtimeConfig.embeddingApiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

    if (!apiKey) {
      throw new Error('Gemini Embedding 需要配置 API Key');
    }

    console.log(`🔄 调用Gemini Embedding API: 模型=${model}, 文本长度=${text.length}`);

    const response = await fetch(
      `${baseUrl}/models/${model}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: {
            parts: [{
              text: text
            }]
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.embedding || !data.embedding.values) {
      throw new Error('Gemini API响应格式不正确');
    }

    console.log(`✅ Gemini Embedding生成成功: 维度=${data.embedding.values.length}`);
    return data.embedding.values;
  }

  /**
   * 使用OpenAI兼容API生成向量
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    const model = this.runtimeConfig.embeddingModel || 'text-embedding-3-small';

    console.log(`🔄 调用OpenAI Embedding API: 模型=${model}, 文本长度=${text.length}`);

    const response = await this.openai.embeddings.create({
      model: model,
      input: text
    });

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('OpenAI API响应格式不正确');
    }

    console.log(`✅ OpenAI Embedding生成成功: 维度=${response.data[0].embedding.length}`);
    return response.data[0].embedding;
  }

  private getEmbeddingVectorSize(): number {
    const explicitSize = Number(this.runtimeConfig.embeddingDimension);
    if (Number.isFinite(explicitSize) && explicitSize > 0) {
      return explicitSize;
    }

    if (this.useGemini) {
      return 768;
    }
    if (this.embeddingProvider === 'aliyun') {
      return 1024;
    }
    return 1536;
  }

  private buildKnowledgeItemFromPayload(payload: any, fallbackId: string): KnowledgeItem {
    return {
      id: String(payload?.originalId || payload?.id || fallbackId),
      category: String(payload?.category || ''),
      title: String(payload?.title || ''),
      content: String(payload?.content || ''),
      businessDomain: String(payload?.businessDomain || ''),
      tags: Array.isArray(payload?.tags) ? payload.tags as string[] : [],
      metadata: payload?.metadata || {},
      createdAt: typeof payload?.createdAt === 'string' ? payload.createdAt : undefined,
      updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : undefined
    };
  }

  private buildKnowledgeFilter(params: {
    businessDomain?: string;
    category?: string;
  }): any | undefined {
    const must: any[] = [];

    if (params.businessDomain) {
      must.push({
        key: 'businessDomain',
        match: { value: params.businessDomain }
      });
    }

    if (params.category) {
      must.push({
        key: 'category',
        match: { value: params.category }
      });
    }

    return must.length > 0 ? { must } : undefined;
  }

  /**
   * 添加知识到知识库
   */
  async addKnowledge(knowledge: KnowledgeItem): Promise<void> {
    try {
      // 生成向量（标题+内容）
      const textToEmbed = `${knowledge.title}\n${knowledge.content}`;
      const vector = await this.generateEmbedding(textToEmbed);

      // 存入Qdrant（使用UUID作为point ID）
      await this.qdrant.upsert(this.collectionName, {
        points: [{
          id: this.generateUUID(),  // 使用UUID而不是自定义字符串ID
          vector: vector,
          payload: {
            originalId: knowledge.id,  // 保存原始ID到payload中
            id: knowledge.id,
            category: knowledge.category,
            title: knowledge.title,
            content: knowledge.content,
            businessDomain: knowledge.businessDomain,
            tags: knowledge.tags,
            metadata: knowledge.metadata || {},
            createdAt: knowledge.createdAt || new Date().toISOString(),
            updatedAt: knowledge.updatedAt
          }
        }]
      });

      console.log(`✅ 知识已添加: [${knowledge.category}] ${knowledge.title}`);
    } catch (error) {
      console.error(`❌ 添加知识失败: ${knowledge.title}`, error);
      throw error;
    }
  }

  /**
   * 批量添加知识
   */
  async addKnowledgeBatch(knowledgeList: KnowledgeItem[]): Promise<void> {
    console.log(`📦 开始批量导入知识，共 ${knowledgeList.length} 条...`);

    let successCount = 0;
    let failCount = 0;

    for (const knowledge of knowledgeList) {
      try {
        await this.addKnowledge(knowledge);
        successCount++;
      } catch (error) {
        failCount++;
        console.error(`跳过失败项: ${knowledge.title}`);
      }
    }

    console.log(`✅ 批量导入完成: 成功${successCount}条, 失败${failCount}条`);
  }

  /**
   * 搜索相关知识（核心RAG方法）
   */
  async searchKnowledge(params: {
    query: string;           // 查询文本（需求文档内容）
    businessDomain?: string; // 业务领域过滤
    category?: string;       // 知识类别过滤
    topK?: number;          // 返回Top K个结果
    scoreThreshold?: number; // 相似度阈值
  }): Promise<SearchResult[]> {
    try {
      const {
        query,
        businessDomain,
        category,
        topK = 5,
        scoreThreshold = 0.5  // 降低默认阈值，适应中文语义搜索
      } = params;

      // 🔍 日志：显示搜索参数和目标集合
      console.log(`🔍 知识库搜索 - 集合: ${this.collectionName}, 查询: "${query}", topK: ${topK}`);

      // 生成查询向量
      const queryVector = await this.generateEmbedding(query);

      // 构建过滤条件
      const filter = this.buildKnowledgeFilter({ businessDomain, category });

      // 在Qdrant中搜索
      const searchResult = await this.qdrant.search(this.collectionName, {
        vector: queryVector,
        limit: topK,
        filter,
        score_threshold: scoreThreshold,
        with_payload: true
      });

      // 转换结果格式
      const results: SearchResult[] = searchResult.map(hit => ({
        knowledge: {
          ...this.buildKnowledgeItemFromPayload(hit.payload, String(hit.id))
        },
        score: hit.score || 0
      }));

      console.log(`🔍 知识检索完成: 查询="${query.substring(0, 30)}...", 找到${results.length}条相关知识`);

      return results;
    } catch (error) {
      console.error('❌ 知识检索失败:', error);
      return [];
    }
  }

  /**
   * 按类别搜索知识
   */
  private async searchKnowledgeWithVector(params: {
    query: string;
    queryVector: number[];
    businessDomain?: string;
    category?: string;
    topK?: number;
    scoreThreshold?: number;
  }): Promise<SearchResult[]> {
    try {
      const {
        query,
        queryVector,
        businessDomain,
        category,
        topK = 5,
        scoreThreshold = 0.5
      } = params;

      const filter = this.buildKnowledgeFilter({ businessDomain, category });
      const searchResult = await this.qdrant.search(this.collectionName, {
        vector: queryVector,
        limit: topK,
        filter,
        score_threshold: scoreThreshold,
        with_payload: true
      });

      const results: SearchResult[] = searchResult.map(hit => ({
        knowledge: {
          ...this.buildKnowledgeItemFromPayload(hit.payload, String(hit.id))
        },
        score: hit.score || 0
      }));

      console.log(`[KnowledgeSearch] query="${query.substring(0, 30)}...", category=${category || 'all'}, found=${results.length}`);
      return results;
    } catch (error) {
      console.error('[KnowledgeSearch] Search failed:', error);
      return [];
    }
  }

  async searchByCategory(params: {
    query: string;
    businessDomain?: string;
    topK?: number;
    scoreThreshold?: number;
  }): Promise<{
    businessRules: SearchResult[];
    testPatterns: SearchResult[];
    pitfalls: SearchResult[];
    riskScenarios: SearchResult[];
  }> {
    const { query, businessDomain, topK = 3, scoreThreshold = 0.5 } = params;
    const queryVector = await this.generateEmbedding(query);

    // 并行检索各类别知识
    const [businessRules, testPatterns, pitfalls, riskScenarios] = await Promise.all([
      this.searchKnowledgeWithVector({ query, queryVector, businessDomain, category: 'business_rule', topK, scoreThreshold }),
      this.searchKnowledgeWithVector({ query, queryVector, businessDomain, category: 'test_pattern', topK, scoreThreshold }),
      this.searchKnowledgeWithVector({ query, queryVector, businessDomain, category: 'pitfall', topK, scoreThreshold }),
      this.searchKnowledgeWithVector({ query, queryVector, businessDomain, category: 'risk_scenario', topK, scoreThreshold })
    ]);

    return {
      businessRules,
      testPatterns,
      pitfalls,
      riskScenarios
    };
  }

  /**
   * 获取知识库统计信息
   */
  async getStats(): Promise<{
    totalCount: number;
    categoryCounts: { [key: string]: number };
  }> {
    try {
      await this.ensureRuntimeConfig();
      const collection = await this.qdrant.getCollection(this.collectionName);

      // 获取各类别统计（需要遍历所有记录，实际生产中建议定期缓存）
      const scrollResult = await this.qdrant.scroll(this.collectionName, {
        limit: 10000,
        with_payload: true
      });

      const categoryCounts: { [key: string]: number } = {};
      scrollResult.points.forEach(point => {
        const category = point.payload!.category as string;
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });

      return {
        totalCount: collection.points_count || 0,
        categoryCounts
      };
    } catch (error) {
      console.error('❌ 获取统计信息失败:', error);
      return { totalCount: 0, categoryCounts: {} };
    }
  }

  /**
   * 列出知识库中的知识，不依赖向量搜索，适合管理页加载和导出。
   */
  async listKnowledge(params: {
    businessDomain?: string;
    category?: string;
    limit?: number;
  } = {}): Promise<KnowledgeItem[]> {
    try {
      await this.ensureRuntimeConfig();
      const limit = Math.max(1, Math.min(params.limit || 1000, 10000));
      const filter = this.buildKnowledgeFilter({
        businessDomain: params.businessDomain,
        category: params.category
      });
      const result: KnowledgeItem[] = [];
      let offset: any = undefined;

      do {
        const scrollResult: any = await this.qdrant.scroll(this.collectionName, {
          limit: Math.min(256, limit - result.length),
          offset,
          filter,
          with_payload: true,
          with_vector: false
        });

        for (const point of scrollResult.points || []) {
          result.push(this.buildKnowledgeItemFromPayload(point.payload, String(point.id)));
          if (result.length >= limit) break;
        }

        offset = scrollResult.next_page_offset;
      } while (offset && result.length < limit);

      return result;
    } catch (error) {
      console.error('❌ 获取知识列表失败:', error);
      return [];
    }
  }

  async updateKnowledge(knowledgeId: string, knowledge: KnowledgeItem): Promise<void> {
    await this.ensureRuntimeConfig();
    const scrollResult: any = await this.qdrant.scroll(this.collectionName, {
      limit: 10000,
      with_payload: true,
      with_vector: false
    });
    const existingPoint = (scrollResult.points || []).find((point: any) => {
      const payload = point.payload || {};
      return String(point.id) === knowledgeId
        || String(payload.originalId || '') === knowledgeId
        || String(payload.id || '') === knowledgeId;
    });
    const textToEmbed = `${knowledge.title}\n${knowledge.content}`;
    const vector = await this.generateEmbedding(textToEmbed);
    const now = new Date().toISOString();

    await this.qdrant.upsert(this.collectionName, {
      points: [{
        id: existingPoint?.id || this.generateUUID(),
        vector,
        payload: {
          originalId: knowledgeId,
          id: knowledgeId,
          category: knowledge.category,
          title: knowledge.title,
          content: knowledge.content,
          businessDomain: knowledge.businessDomain,
          tags: knowledge.tags,
          metadata: knowledge.metadata || {},
          createdAt: existingPoint?.payload?.createdAt || knowledge.createdAt || now,
          updatedAt: now
        }
      }]
    });
  }

  /**
   * 删除知识
   */
  async deleteKnowledge(knowledgeId: string): Promise<void> {
    try {
      await this.ensureRuntimeConfig();
      const scrollResult: any = await this.qdrant.scroll(this.collectionName, {
        limit: 10000,
        with_payload: true,
        with_vector: false
      });
      const pointIds = (scrollResult.points || [])
        .filter((point: any) => {
          const payload = point.payload || {};
          return String(point.id) === knowledgeId
            || String(payload.originalId || '') === knowledgeId
            || String(payload.id || '') === knowledgeId;
        })
        .map((point: any) => point.id);

      if (pointIds.length === 0) {
        console.warn(`⚠️ 未找到要删除的知识: ${knowledgeId}`);
        return;
      }

      await this.qdrant.delete(this.collectionName, { points: pointIds });
      console.log(`✅ 知识已删除: ${knowledgeId}`);
    } catch (error) {
      console.error(`❌ 删除知识失败: ${knowledgeId}`, error);
      throw error;
    }
  }

  /**
   * 清空知识库（危险操作）
   */
  async clearAll(): Promise<void> {
    try {
      await this.ensureRuntimeConfig();
      await this.qdrant.deleteCollection(this.collectionName);
      await this.initCollection();
      console.log('✅ 知识库已清空并重新初始化');
    } catch (error) {
      console.error('❌ 清空知识库失败:', error);
      throw error;
    }
  }

  // 🔥 ===== 新增：多系统集合管理方法 ===== 🔥

  /**
   * 获取所有已存在的知识库集合
   */
  async listAllCollections(): Promise<string[]> {
    try {
      await this.ensureRuntimeConfig();
      const collections = await this.qdrant.getCollections();
      return collections.collections
        .map(c => c.name)
        .filter(name => name.startsWith('test_knowledge_'));
    } catch (error) {
      console.error('❌ 获取集合列表失败:', error);
      return [];
    }
  }

  /**
   * 检查指定系统的集合是否存在
   */
  async collectionExists(systemName?: string): Promise<boolean> {
    try {
      await this.ensureRuntimeConfig();
      const collectionName = TestCaseKnowledgeBase.getCollectionName(systemName);
      const collections = await this.qdrant.getCollections();
      return collections.collections.some(c => c.name === collectionName);
    } catch (error) {
      console.error('❌ 检查集合是否存在失败:', error);
      return false;
    }
  }

  /**
   * 为指定系统创建知识库集合
   */
  async createCollectionForSystem(systemName: string): Promise<void> {
    const tempKnowledgeBase = new TestCaseKnowledgeBase(systemName);
    await tempKnowledgeBase.initCollection();
  }

  /**
   * 删除指定系统的知识库集合
   */
  async deleteCollectionForSystem(systemName: string): Promise<void> {
    try {
      await this.ensureRuntimeConfig();
      const collectionName = TestCaseKnowledgeBase.getCollectionName(systemName);
      await this.qdrant.deleteCollection(collectionName);
      console.log(`✅ 已删除系统 "${systemName}" 的知识库集合: ${collectionName}`);
    } catch (error) {
      console.error(`❌ 删除系统 "${systemName}" 的知识库失败:`, error);
      throw error;
    }
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
    try {
      const collections = await this.listAllCollections();
      const stats = [];

      for (const collectionName of collections) {
        // 从集合名称提取系统名称
        const systemName = collectionName.replace('test_knowledge_', '');
        const tempKnowledgeBase = new TestCaseKnowledgeBase(systemName === 'default' ? undefined : systemName);
        const collectionStats = await tempKnowledgeBase.getStats();

        stats.push({
          systemName: systemName === 'default' ? '默认' : systemName,
          collectionName,
          totalCount: collectionStats.totalCount,
          categoryCounts: collectionStats.categoryCounts
        });
      }

      return stats;
    } catch (error) {
      console.error('❌ 获取所有系统统计信息失败:', error);
      return [];
    }
  }

  /**
   * 获取当前系统名称
   */
  getSystemName(): string | undefined {
    return this.systemName;
  }

  /**
   * 获取当前集合名称
   */
  getCollectionName(): string {
    return this.collectionName;
  }
}
