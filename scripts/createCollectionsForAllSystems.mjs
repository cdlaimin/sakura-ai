/**
 * 为数据库中的所有系统创建知识库集合
 */

import mysql from 'mysql2/promise';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const EMBEDDING_DIMENSION = (() => {
  const explicit = parseInt(process.env.EMBEDDING_DIMENSION || '', 10);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const provider = process.env.EMBEDDING_PROVIDER || 'gemini';
  if (provider === 'gemini') return 768;
  if (provider === 'aliyun') return 1024;
  return 1536;
})();

async function main() {
  let dbConnection;

  try {
    console.log('🚀 开始为所有系统创建知识库集合...\n');

    // 1. 连接数据库
    const dbUrl = process.env.DATABASE_URL;
    const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    if (!match) throw new Error('无法解析 DATABASE_URL');

    const [, user, password, host, port, database] = match;
    dbConnection = await mysql.createConnection({ host, port: parseInt(port), user, password, database });
    console.log('✅ 数据库连接成功\n');

    // 2. 查询所有活跃系统
    const [systems] = await dbConnection.execute(
      'SELECT id, name, description, status FROM `systems` WHERE status = "active" ORDER BY sort_order, id'
    );

    console.log(`📊 找到 ${systems.length} 个活跃系统\n`);

    // 3. 获取当前 Qdrant 集合
    const collectionsResponse = await fetch(`${QDRANT_URL}/collections`);
    const collectionsData = await collectionsResponse.json();
    const existingCollections = collectionsData.result.collections.map(c => c.name);

    console.log('📚 当前 Qdrant 集合:');
    existingCollections.forEach(name => console.log(`   - ${name}`));
    console.log('');

    // 4. 为每个系统创建集合
    console.log('🔧 开始创建系统知识库集合:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const results = [];

    for (const system of systems) {
      const collectionName = `test_knowledge_${system.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase()}`;
      const encodedName = encodeURIComponent(collectionName);

      console.log(`📦 系统: ${system.name} (ID: ${system.id})`);
      console.log(`   集合名称: ${collectionName}`);

      // 检查集合是否存在
      if (existingCollections.includes(collectionName)) {
        console.log(`   ✅ 集合已存在，跳过创建`);

        // 获取集合信息
        const infoResponse = await fetch(`${QDRANT_URL}/collections/${encodedName}`);
        const info = await infoResponse.json();
        results.push({
          system: system.name,
          collection: collectionName,
          action: 'skipped',
          pointsCount: info.result.points_count
        });
      } else {
        console.log(`   ⚙️  正在创建集合...`);

        try {
          // 创建集合
          const createResponse = await fetch(`${QDRANT_URL}/collections/${encodedName}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vectors: {
                size: EMBEDDING_DIMENSION,
                distance: 'Cosine'
              }
            })
          });

          const createData = await createResponse.json();

          if (createData.status === 'ok') {
            console.log(`   ✅ 集合创建成功`);
            results.push({
              system: system.name,
              collection: collectionName,
              action: 'created',
              pointsCount: 0
            });
          } else {
            console.log(`   ❌ 创建失败:`, createData);
            results.push({
              system: system.name,
              collection: collectionName,
              action: 'failed',
              error: JSON.stringify(createData)
            });
          }
        } catch (error) {
          console.error(`   ❌ 创建失败:`, error.message);
          results.push({
            system: system.name,
            collection: collectionName,
            action: 'failed',
            error: error.message
          });
        }
      }
      console.log('');
    }

    // 5. 显示汇总结果
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 创建结果汇总:\n');

    const created = results.filter(r => r.action === 'created');
    const skipped = results.filter(r => r.action === 'skipped');
    const failed = results.filter(r => r.action === 'failed');

    console.log(`   ✅ 新创建: ${created.length} 个`);
    console.log(`   ⏭️  已存在: ${skipped.length} 个`);
    console.log(`   ❌ 失败: ${failed.length} 个\n`);

    // 6. 显示最终所有集合状态
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📚 最终知识库集合列表:\n');

    for (const result of results) {
      const status = result.action === 'created' ? '🆕 新建' : result.action === 'skipped' ? '✅ 已存在' : '❌ 失败';
      const points = result.pointsCount !== undefined ? `${result.pointsCount} 条知识` : '未知';
      console.log(`   ${status} ${result.system}`);
      console.log(`      集合: ${result.collection}`);
      console.log(`      知识: ${points}`);
      if (result.error) {
        console.log(`      错误: ${result.error}`);
      }
      console.log('');
    }

    console.log('✅ 所有系统知识库集合已就绪！\n');

    // 7. 下一步建议
    console.log('💡 下一步操作:\n');
    console.log('1. 查看知识库状态:');
    console.log('   npm run knowledge:status\n');
    console.log('2. 通过 API 为系统添加知识:');
    console.log('   POST /api/v1/knowledge/{系统名称}/add\n');
    console.log('3. 批量导入知识:');
    console.log('   POST /api/v1/knowledge/{系统名称}/batch-import\n');

  } catch (error) {
    console.error('❌ 创建失败:', error);
    throw error;
  } finally {
    if (dbConnection) {
      await dbConnection.end();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
