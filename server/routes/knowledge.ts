import express, { Request, Response } from 'express';
import { KnowledgeManagementService } from '../services/knowledgeManagementService.js';
import multer from 'multer';

const router = express.Router();
const knowledgeService = new KnowledgeManagementService();

// 配置文件上传
const upload = multer({ storage: multer.memoryStorage() });

/**
 * GET /api/v1/knowledge/collections
 * 获取所有知识库集合列表
 */
router.get('/collections', async (req: Request, res: Response) => {
  try {
    const collections = await knowledgeService.listAllCollections();
    res.json({ collections });
  } catch (error) {
    console.error('获取集合列表失败:', error);
    res.status(500).json({
      error: '获取集合列表失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/v1/knowledge/stats
 * 获取所有系统的知识库统计
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await knowledgeService.getAllSystemsStats();
    res.json({ stats });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({
      error: '获取统计信息失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/v1/knowledge/search
 * 搜索知识
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const {
      query,
      systemName,
      businessDomain,
      category,
      topK,
      scoreThreshold
    } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: '查询文本不能为空' });
    }

    const results = await knowledgeService.searchKnowledge({
      query,
      systemName: systemName as string | undefined,
      businessDomain: businessDomain as string | undefined,
      category: category as string | undefined,
      topK: topK ? parseInt(topK as string) : undefined,
      scoreThreshold: scoreThreshold ? parseFloat(scoreThreshold as string) : undefined
    });

    res.json({
      query,
      systemName: systemName || '默认',
      results,
      totalFound: results.length
    });
  } catch (error) {
    console.error('搜索知识失败:', error);
    res.status(500).json({
      error: '搜索知识失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/v1/knowledge/:systemName/list
 * 获取指定系统的知识列表（管理页使用，不依赖语义搜索）
 */
router.get('/:systemName/list', async (req: Request, res: Response) => {
  try {
    const { systemName } = req.params;
    const { businessDomain, category, limit } = req.query;

    const items = await knowledgeService.listKnowledge(
      systemName === 'default' ? undefined : systemName,
      {
        businessDomain: businessDomain as string | undefined,
        category: category as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined
      }
    );

    res.json({
      systemName: systemName === 'default' ? '默认' : systemName,
      items,
      total: items.length
    });
  } catch (error) {
    console.error('获取知识列表失败:', error);
    res.status(500).json({
      error: '获取知识列表失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/knowledge/test-search
 * 测试知识检索（用于验证知识库效果）
 */
router.post('/test-search', async (req: Request, res: Response) => {
  try {
    const { systemName, businessDomain } = req.body;
    const testQuery = req.body.testQuery || req.body.query;

    if (!testQuery || !testQuery.trim()) {
      return res.status(400).json({ error: '测试查询不能为空' });
    }

    const result = await knowledgeService.testSearch(
      systemName,
      testQuery,
      businessDomain
    );

    res.json(result);
  } catch (error) {
    console.error('测试搜索失败:', error);
    res.status(500).json({
      error: '测试搜索失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/v1/knowledge/:systemName/stats
 * 获取指定系统的知识库统计
 */
router.get('/:systemName/stats', async (req: Request, res: Response) => {
  try {
    const { systemName } = req.params;
    const stats = await knowledgeService.getStats(
      systemName === 'default' ? undefined : systemName
    );

    res.json(stats);
  } catch (error) {
    console.error('获取系统统计失败:', error);
    res.status(500).json({
      error: '获取系统统计失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/knowledge/:systemName/add
 * 添加单条知识到指定系统
 */
router.post('/:systemName/add', async (req: Request, res: Response) => {
  try {
    const { systemName } = req.params;
    const knowledge = req.body;

    // 验证数据
    const validation = knowledgeService.validateKnowledgeItem(knowledge);
    if (!validation.valid) {
      return res.status(400).json({
        error: '数据验证失败',
        errors: validation.errors
      });
    }

    await knowledgeService.addKnowledge(
      systemName === 'default' ? undefined : systemName,
      knowledge
    );

    res.status(201).json({
      message: '知识添加成功',
      systemName: systemName === 'default' ? '默认' : systemName
    });
  } catch (error) {
    console.error('添加知识失败:', error);
    res.status(500).json({
      error: '添加知识失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * PUT /api/v1/knowledge/:systemName/items/:knowledgeId
 * 更新指定知识
 */
router.put('/:systemName/items/:knowledgeId', async (req: Request, res: Response) => {
  try {
    const { systemName, knowledgeId } = req.params;
    const knowledge = req.body;

    const validation = knowledgeService.validateKnowledgeItem(knowledge);
    if (!validation.valid) {
      return res.status(400).json({
        error: '数据验证失败',
        errors: validation.errors
      });
    }

    await knowledgeService.updateKnowledge(
      systemName === 'default' ? undefined : systemName,
      knowledgeId,
      knowledge
    );

    res.json({
      message: '知识更新成功',
      systemName: systemName === 'default' ? '默认' : systemName,
      knowledgeId
    });
  } catch (error) {
    console.error('更新知识失败:', error);
    res.status(500).json({
      error: '更新知识失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * DELETE /api/v1/knowledge/:systemName/items/:knowledgeId
 * 删除指定知识
 */
router.delete('/:systemName/items/:knowledgeId', async (req: Request, res: Response) => {
  try {
    const { systemName, knowledgeId } = req.params;

    await knowledgeService.deleteKnowledge(
      systemName === 'default' ? undefined : systemName,
      knowledgeId
    );

    res.json({
      message: '知识删除成功',
      systemName: systemName === 'default' ? '默认' : systemName,
      knowledgeId
    });
  } catch (error) {
    console.error('删除知识失败:', error);
    res.status(500).json({
      error: '删除知识失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/knowledge/:systemName/batch-import
 * 批量导入知识到指定系统
 */
router.post('/:systemName/batch-import', async (req: Request, res: Response) => {
  try {
    const { systemName } = req.params;
    const { knowledgeList } = req.body;

    if (!Array.isArray(knowledgeList)) {
      return res.status(400).json({ error: '知识列表必须是数组' });
    }

    if (knowledgeList.length === 0) {
      return res.status(400).json({ error: '知识列表不能为空' });
    }

    const result = await knowledgeService.batchImport(
      systemName === 'default' ? undefined : systemName,
      knowledgeList
    );

    res.json({
      message: '批量导入完成',
      systemName: systemName === 'default' ? '默认' : systemName,
      ...result
    });
  } catch (error) {
    console.error('批量导入失败:', error);
    res.status(500).json({
      error: '批量导入失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * POST /api/v1/knowledge/:systemName/import-json
 * 从JSON文件批量导入知识
 */
router.post('/:systemName/import-json', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { systemName } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: '请上传JSON文件' });
    }

    // 解析JSON文件
    const fileContent = req.file.buffer.toString('utf-8');
    let jsonData: any;

    try {
      jsonData = JSON.parse(fileContent);
    } catch (parseError) {
      return res.status(400).json({ error: 'JSON文件格式错误' });
    }

    if (!Array.isArray(jsonData)) {
      return res.status(400).json({ error: 'JSON文件必须包含数组格式的知识列表' });
    }

    const result = await knowledgeService.importFromJSON(
      systemName === 'default' ? undefined : systemName,
      jsonData
    );

    res.json({
      message: 'JSON导入完成',
      systemName: systemName === 'default' ? '默认' : systemName,
      ...result
    });
  } catch (error) {
    console.error('JSON导入失败:', error);
    res.status(500).json({
      error: 'JSON导入失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * DELETE /api/v1/knowledge/:systemName/clear
 * 清空指定系统的知识库
 */
router.delete('/:systemName/clear', async (req: Request, res: Response) => {
  try {
    const { systemName } = req.params;

    await knowledgeService.clearSystemKnowledge(
      systemName === 'default' ? undefined : systemName
    );

    res.json({
      message: '知识库已清空',
      systemName: systemName === 'default' ? '默认' : systemName
    });
  } catch (error) {
    console.error('清空知识库失败:', error);
    res.status(500).json({
      error: '清空知识库失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * GET /api/v1/knowledge/:systemName/search-by-category
 * 按类别搜索知识
 */
router.get('/:systemName/search-by-category', async (req: Request, res: Response) => {
  try {
    const { systemName } = req.params;
    const { query, businessDomain, topK } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: '查询文本不能为空' });
    }

    const results = await knowledgeService.searchByCategory(
      systemName === 'default' ? undefined : systemName,
      query,
      businessDomain as string | undefined,
      topK ? parseInt(topK as string) : undefined
    );

    res.json({
      query,
      systemName: systemName === 'default' ? '默认' : systemName,
      businessDomain,
      results
    });
  } catch (error) {
    console.error('按类别搜索失败:', error);
    res.status(500).json({
      error: '按类别搜索失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

export default router;
