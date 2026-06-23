/**
 * 迁移旧知识库数据并清理无效集合
 */

import fetch from 'node-fetch';

import dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

// 有效集合列表（保留）
const VALID_COLLECTIONS = [
  'test_knowledge_实物1_0',
  'test_knowledge_实物2_0',
  'test_knowledge_saas',
  'test_knowledge_供应链开放平台',
  'test_knowledge_权益管理平台',
  'test_knowledge_综合运营平台',
  'test_knowledge_立减金管理平台',
  'test_knowledge_营销管理中台',
  'smartlearn' // 其他项目，保留
];

async function main() {
  try {
    console.log('🚀 开始迁移和清理知识库...\n');

    // 1. 迁移 test_knowledge_实物2.0 -> test_knowledge_实物2_0
    console.log('📦 步骤1: 迁移实物2.0知识库数据\n');

    const oldCollection = 'test_knowledge_实物2.0';
    const newCollection = 'test_knowledge_实物2_0';

    console.log(`   源集合: ${oldCollection}`);
    console.log(`   目标集合: ${newCollection}\n`);

    // 获取源集合数据
    const scrollResponse = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(oldCollection)}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 100,
        with_payload: true,
        with_vector: true
      })
    });

    const scrollData = await scrollResponse.json();

    if (scrollData.status === 'ok' && scrollData.result.points.length > 0) {
      const points = scrollData.result.points;
      console.log(`   ✅ 从源集合获取到 ${points.length} 个知识点`);

      // 插入到新集合
      const upsertResponse = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(newCollection)}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: points.map(point => ({
            id: point.id,
            vector: point.vector,
            payload: point.payload
          }))
        })
      });

      const upsertData = await upsertResponse.json();

      if (upsertData.status === 'ok') {
        console.log(`   ✅ 成功复制 ${points.length} 个知识点到新集合\n`);
      } else {
        console.error(`   ❌ 复制失败:`, upsertData);
      }
    } else {
      console.log(`   ⚠️  源集合为空或不存在，跳过迁移\n`);
    }

    // 2. 获取所有集合
    console.log('📋 步骤2: 获取当前所有集合\n');

    const collectionsResponse = await fetch(`${QDRANT_URL}/collections`);
    const collectionsData = await collectionsResponse.json();
    const allCollections = collectionsData.result.collections.map(c => c.name);

    console.log('   当前集合:');
    allCollections.forEach(name => console.log(`      - ${name}`));
    console.log('');

    // 3. 删除无效集合
    console.log('🗑️  步骤3: 删除无效集合\n');

    const collectionsToDelete = allCollections.filter(name => !VALID_COLLECTIONS.includes(name));

    if (collectionsToDelete.length === 0) {
      console.log('   ✅ 所有集合都有效，无需清理\n');
    } else {
      console.log(`   发现 ${collectionsToDelete.length} 个需要删除的集合:\n`);

      for (const collectionName of collectionsToDelete) {
        console.log(`   删除: ${collectionName}`);

        try {
          const deleteResponse = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(collectionName)}`, {
            method: 'DELETE'
          });

          const deleteData = await deleteResponse.json();

          if (deleteData.status === 'ok') {
            console.log(`      ✅ 删除成功`);
          } else {
            console.log(`      ❌ 删除失败:`, deleteData);
          }
        } catch (error) {
          console.error(`      ❌ 删除失败:`, error.message);
        }
      }
      console.log('');
    }

    // 4. 显示最终状态
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 最终知识库集合状态:\n');

    const finalResponse = await fetch(`${QDRANT_URL}/collections`);
    const finalData = await finalResponse.json();

    for (const collection of finalData.result.collections) {
      const encodedName = encodeURIComponent(collection.name);
      const infoResponse = await fetch(`${QDRANT_URL}/collections/${encodedName}`);
      const info = await infoResponse.json();

      console.log(`   ✅ ${collection.name}`);
      console.log(`      知识点数: ${info.result.points_count}`);
      console.log(`      向量维度: ${info.result.config.params.vectors.size}D`);
      console.log(`      状态: ${info.result.status}`);
      console.log('');
    }

    console.log('✅ 迁移和清理完成！\n');

    console.log('💡 下一步建议:');
    console.log('   npm run knowledge:status  # 查看完整知识库状态');

  } catch (error) {
    console.error('❌ 操作失败:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
