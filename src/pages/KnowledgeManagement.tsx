/**
 * 知识库管理页面
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  Form,
  message,
  Tooltip,
  Badge,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Upload,
  InputNumber
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  DatabaseOutlined,
  BulbOutlined,
  SettingOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as systemService from '../services/systemService';
import knowledgeService, {
  KnowledgeItem,
  KNOWLEDGE_CATEGORIES,
  KnowledgeStats
} from '../services/knowledgeService';
import type { KnowledgeSettings } from '../services/settingsService';

const { TextArea } = Input;
const { Option } = Select;

const formatMetadataForForm = (metadata?: Record<string, any>) => {
  if (metadata === undefined || metadata === null) {
    return '';
  }

  if (typeof metadata === 'string') {
    return metadata;
  }

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return '';
  }
};

interface System {
  id: number;
  name: string;
  description: string;
  status: string;
}

const KnowledgeManagement: React.FC = () => {
  const [form] = Form.useForm();
  const [configForm] = Form.useForm<KnowledgeSettings>();
  const [systems, setSystems] = useState<System[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeItem | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [testSearchVisible, setTestSearchVisible] = useState(false);
  const [configVisible, setConfigVisible] = useState(false);
  const [configTesting, setConfigTesting] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  // 加载系统列表
  useEffect(() => {
    loadSystems();
  }, []);

  // 当选择系统后加载知识
  useEffect(() => {
    if (selectedSystem) {
      loadKnowledgeAndStats();
    }
  }, [selectedSystem]);

  const loadSystems = async () => {
    try {
      const response = await systemService.getSystems();
      setSystems(response.data);
      if (response.data.length > 0) {
        setSelectedSystem(response.data[0].name);
      }
    } catch (error) {
      message.error('加载系统列表失败');
      console.error(error);
    }
  };

  const loadKnowledgeAndStats = async () => {
    if (!selectedSystem) return;

    setLoading(true);
    try {
      // 并行加载统计和知识列表
      const [statsData, knowledgeItems] = await Promise.all([
        knowledgeService.getSystemStats(selectedSystem),
        knowledgeService.listKnowledge({
          systemName: selectedSystem,
          category: filterCategory || undefined,
          limit: 1000
        })
      ]);

      setStats(statsData);
      // 确保knowledgeItems是数组
      if (Array.isArray(knowledgeItems)) {
        setKnowledgeList(knowledgeItems);
      } else {
        setKnowledgeList([]);
      }
    } catch (error) {
      message.error('加载知识库数据失败: 请确保后端服务正常运行');
      console.error(error);
      // 设置空数据避免渲染错误
      setStats(null);
      setKnowledgeList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!selectedSystem) {
      message.warning('请先选择系统');
      return;
    }

    setLoading(true);
    try {
      const results = await knowledgeService.searchKnowledge({
        query: searchKeyword || ' ',
        systemName: selectedSystem,
        category: filterCategory || undefined,
        topK: 100
      });

      // 确保results是数组
      if (Array.isArray(results)) {
        setKnowledgeList(results.map(r => r.knowledge));
      } else {
        setKnowledgeList([]);
      }
    } catch (error) {
      message.error('搜索失败: 请确保后端服务正常运行');
      console.error(error);
      setKnowledgeList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingKnowledge(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (knowledge: KnowledgeItem) => {
    setEditingKnowledge(knowledge);
    form.setFieldsValue({
      ...knowledge,
      tags: knowledge.tags.join(', '),
      metadata: formatMetadataForForm(knowledge.metadata)
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      let parsedMetadata: Record<string, any> | undefined;

      if (values.metadata?.trim()) {
        try {
          parsedMetadata = JSON.parse(values.metadata);
        } catch {
          message.error('额外元数据必须是合法的 JSON 格式');
          return;
        }
      }

      const knowledge: KnowledgeItem = {
        category: values.category,
        title: values.title,
        content: values.content,
        businessDomain: values.businessDomain,
        tags: typeof values.tags === 'string'
          ? values.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
          : values.tags,
        metadata: parsedMetadata
      };

      // 验证
      const validation = knowledgeService.validateKnowledge(knowledge);
      if (!validation.valid) {
        message.error(validation.errors.join('; '));
        return;
      }

      if (!selectedSystem) {
        message.warning('请先选择系统');
        return;
      }

      if (editingKnowledge?.id) {
        await knowledgeService.updateKnowledge(selectedSystem, editingKnowledge.id, knowledge);
      } else {
        await knowledgeService.addKnowledge(selectedSystem, knowledge);
      }
      message.success(editingKnowledge ? '更新成功' : '添加成功');
      setModalVisible(false);
      loadKnowledgeAndStats();
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单输入');
      } else {
        message.error('保存失败: ' + (error.message || '未知错误'));
        console.error(error);
      }
    }
  };

  const handleBatchImport = async (file: File) => {
    if (!selectedSystem) {
      message.warning('请先选择系统');
      return false;
    }

    try {
      const result = await knowledgeService.importFromJSON(selectedSystem, file);

      if (result.success > 0) {
        message.success(`成功导入 ${result.success} 条知识`);
        loadKnowledgeAndStats();
      }

      if (result.failed > 0) {
        Modal.warning({
          title: `导入完成，但有 ${result.failed} 条失败`,
          content: (
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {result.errors.map((err, i) => (
                <div key={i}>
                  • {typeof err === 'string' ? err : `${err.title || `第${err.index + 1}条`}: ${err.error}`}
                </div>
              ))}
            </div>
          )
        });
      }
    } catch (error: any) {
      message.error('导入失败: ' + (error.message || '未知错误'));
    }

    return false; // 阻止自动上传
  };

  const handleExport = () => {
    if (knowledgeList.length === 0) {
      message.warning('暂无知识可导出');
      return;
    }

    const filename = `knowledge_${selectedSystem}_${new Date().toISOString().split('T')[0]}.json`;
    knowledgeService.downloadAsJSON(knowledgeList, filename);
    message.success('导出成功');
  };

  const handleDelete = async (knowledge: KnowledgeItem) => {
    if (!selectedSystem || !knowledge.id) {
      message.warning('缺少系统或知识ID，无法删除');
      return;
    }

    try {
      await knowledgeService.deleteKnowledge(selectedSystem, knowledge.id);
      message.success('删除成功');
      loadKnowledgeAndStats();
    } catch (error: any) {
      message.error('删除失败: ' + (error.message || '未知错误'));
      console.error(error);
    }
  };

  const handleOpenConfig = async () => {
    setConfigVisible(true);
    try {
      const config = await knowledgeService.getKnowledgeConfig();
      configForm.setFieldsValue(config);
    } catch (error: any) {
      message.error('加载知识库配置失败: ' + (error.message || '未知错误'));
    }
  };

  const handleProviderChange = (provider: KnowledgeSettings['embeddingProvider']) => {
    const defaults: Record<KnowledgeSettings['embeddingProvider'], Partial<KnowledgeSettings>> = {
      aliyun: {
        embeddingApiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        embeddingModel: 'text-embedding-v4',
        embeddingDimension: 1024
      },
      openai: {
        embeddingApiBaseUrl: 'https://api.openai.com/v1',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimension: 1536
      },
      gemini: {
        embeddingApiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        embeddingModel: 'text-embedding-004',
        embeddingDimension: 768
      },
      xinference: {
        embeddingApiBaseUrl: 'http://localhost:9997/v1',
        embeddingModel: 'bge-large-zh-v1.5',
        embeddingDimension: 1024
      }
    };
    configForm.setFieldsValue({
      embeddingProvider: provider,
      ...defaults[provider]
    });
  };

  const handleSaveConfig = async () => {
    try {
      const values = await configForm.validateFields();
      setConfigSaving(true);
      const saved = await knowledgeService.saveKnowledgeConfig(values);
      configForm.setFieldsValue(saved);
      message.success('知识库模型配置已保存');
      setConfigVisible(false);
      if (selectedSystem) {
        loadKnowledgeAndStats();
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查配置项');
      } else {
        message.error('保存配置失败: ' + (error.message || '未知错误'));
      }
    } finally {
      setConfigSaving(false);
    }
  };

  const handleTestConfig = async () => {
    try {
      const values = await configForm.validateFields();
      setConfigTesting(true);
      const result = await knowledgeService.testKnowledgeConfig(values);
      const data = result.data || {};
      message.success(`连接成功，向量维度 ${data.embeddingDimension || '-'}，Qdrant集合 ${data.collectionCount ?? '-'}`);
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查配置项');
      } else {
        message.error('连接测试失败: ' + (error.message || '未知错误'));
      }
    } finally {
      setConfigTesting(false);
    }
  };

  const columns: ColumnsType<KnowledgeItem> = [
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 130,
      render: (category: string) => {
        const config = knowledgeService.getCategoryConfig(category);
        return config ? (
          <Tag color={config.color} style={{ marginInlineEnd: 0 }}>
            {config.icon} {config.label}
          </Tag>
        ) : (
          <Tag style={{ marginInlineEnd: 0 }}>{category}</Tag>
        );
      }
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 240,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text}</span>
        </Tooltip>
      )
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      width: 520,
      render: (text: string) => (
        <Tooltip title={text}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {text}
          </div>
        </Tooltip>
      )
    },
    {
      title: '业务领域',
      dataIndex: 'businessDomain',
      key: 'businessDomain',
      width: 160,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text}</span>
        </Tooltip>
      )
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 260,
      render: (tags: string[]) => (
        <Tooltip title={tags.join(', ')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {tags.map(tag => (
            <Tag
              key={tag}
              style={{
                maxWidth: '100%',
                marginInlineEnd: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {tag}
            </Tag>
          ))}
          </div>
        </Tooltip>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small" style={{ whiteSpace: 'nowrap' }}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除这条知识？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => handleDelete(record)}
          >
            <Button
              type="link"
              danger
              size="small"
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 标题和系统选择 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>
              <DatabaseOutlined /> 知识库管理
            </h2>
            <Space>
              <span>选择系统：</span>
              <Select
                style={{ width: 200 }}
                value={selectedSystem}
                onChange={setSelectedSystem}
                placeholder="请选择系统"
              >
                {systems.map(sys => (
                  <Option key={sys.id} value={sys.name}>
                    {sys.name}
                  </Option>
                ))}
              </Select>
            </Space>
          </div>

          {/* 统计信息 */}
          {stats && stats.byCategory && (
            <Row gutter={16}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="总知识数"
                    value={stats.totalKnowledge || 0}
                    prefix={<DatabaseOutlined />}
                  />
                </Card>
              </Col>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="业务规则"
                    value={stats.byCategory.business_rule || 0}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="测试模式"
                    value={stats.byCategory.test_pattern || 0}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={5}>
                <Card>
                  <Statistic
                    title="历史踩坑点"
                    value={stats.byCategory.pitfall || 0}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
              <Col span={5}>
                <Card>
                  <Statistic
                    title="资损风险场景"
                    value={stats.byCategory.risk_scenario || 0}
                    valueStyle={{ color: '#f5222d' }}
                  />
                </Card>
              </Col>
            </Row>
          )}

          {/* 搜索和操作按钮 */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Space>
              <Input
                placeholder="搜索知识标题或内容"
                style={{ width: 300 }}
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                onPressEnter={handleSearch}
                prefix={<SearchOutlined />}
              />
              <Select
                style={{ width: 150 }}
                placeholder="筛选类别"
                allowClear
                value={filterCategory}
                onChange={setFilterCategory}
              >
                {KNOWLEDGE_CATEGORIES.map(cat => (
                  <Option key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </Option>
                ))}
              </Select>
              <Button icon={<SearchOutlined />} onClick={handleSearch}>
                搜索
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadKnowledgeAndStats}>
                刷新
              </Button>
            </Space>

            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAdd}
                disabled={!selectedSystem}
              >
                添加知识
              </Button>
              <Upload
                accept=".json"
                showUploadList={false}
                beforeUpload={handleBatchImport}
                disabled={!selectedSystem}
              >
                <Button icon={<UploadOutlined />} disabled={!selectedSystem}>
                  批量导入
                </Button>
              </Upload>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExport}
                disabled={knowledgeList.length === 0}
              >
                导出JSON
              </Button>
              <Button
                icon={<BulbOutlined />}
                onClick={() => setTestSearchVisible(true)}
                disabled={!selectedSystem}
              >
                测试搜索
              </Button>
              <Button
                icon={<SettingOutlined />}
                onClick={handleOpenConfig}
              >
                模型配置
              </Button>
            </Space>
          </div>

          {/* 知识列表表格 */}
          <Table
            columns={columns}
            dataSource={knowledgeList}
            rowKey="id"
            loading={loading}
            tableLayout="fixed"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: total => `共 ${total} 条知识`
            }}
            scroll={{ x: 1460 }}
          />
        </Space>
      </Card>

      {/* 添加/编辑知识对话框 */}
      <Modal
        title={editingKnowledge ? '编辑知识' : '添加知识'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={800}
        destroyOnHidden={true}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            category: 'business_rule'
          }}
        >
          <Form.Item
            name="category"
            label="知识类别"
            rules={[{ required: true, message: '请选择知识类别' }]}
          >
            <Select placeholder="选择类别">
              {KNOWLEDGE_CATEGORIES.map(cat => (
                <Option key={cat.value} value={cat.value}>
                  {cat.icon} {cat.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="title"
            label="知识标题"
            rules={[
              { required: true, message: '请输入知识标题' },
              { min: 5, message: '标题至少5个字符' },
              { max: 200, message: '标题最多200个字符' }
            ]}
          >
            <Input placeholder="简洁明确的标题，如：订单超时自动取消规则" />
          </Form.Item>

          <Form.Item
            name="content"
            label="知识内容"
            rules={[
              { required: true, message: '请输入知识内容' },
              { min: 10, message: '内容至少10个字符' },
              { max: 5000, message: '内容最多5000个字符' }
            ]}
          >
            <TextArea
              rows={6}
              placeholder="详细描述该知识点，包括背景、规则、注意事项等"
            />
          </Form.Item>

          <Form.Item
            name="businessDomain"
            label="业务领域"
            rules={[{ required: true, message: '请输入业务领域' }]}
          >
            <Input placeholder="如：订单管理、优惠促销、库存管理等" />
          </Form.Item>

          <Form.Item
            name="tags"
            label="标签"
            rules={[{ required: true, message: '请输入标签' }]}
            extra="多个标签用逗号分隔，如：订单,超时,自动取消"
          >
            <Input placeholder="订单,超时,自动取消" />
          </Form.Item>

          <Form.Item
            name="metadata"
            label="额外元数据（可选）"
            extra='JSON格式，如：{"severity": "high", "version": "v2.0"}'
          >
            <TextArea rows={2} placeholder='{"severity": "high"}' />
          </Form.Item>
        </Form>
      </Modal>

      {/* 测试搜索对话框 */}
      <Modal
        title="测试知识库搜索"
        open={testSearchVisible}
        onCancel={() => setTestSearchVisible(false)}
        footer={null}
        width={900}
      >
        <TestSearchPanel systemName={selectedSystem} />
      </Modal>

      <Modal
        title="知识库模型配置"
        open={configVisible}
        onOk={handleSaveConfig}
        onCancel={() => setConfigVisible(false)}
        confirmLoading={configSaving}
        okText="保存配置"
        cancelText="取消"
        width={760}
        destroyOnHidden={true}
        footer={[
          <Button key="test" onClick={handleTestConfig} loading={configTesting}>
            测试连接
          </Button>,
          <Button key="cancel" onClick={() => setConfigVisible(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" loading={configSaving} onClick={handleSaveConfig}>
            保存配置
          </Button>
        ]}
      >
        <Form
          form={configForm}
          layout="vertical"
          initialValues={{
            qdrantUrl: 'http://172.19.5.223:6333',
            embeddingProvider: 'aliyun',
            embeddingApiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            embeddingModel: 'text-embedding-v4',
            embeddingDimension: 1024
          }}
        >
          <Form.Item
            name="qdrantUrl"
            label="Qdrant 地址"
            rules={[{ required: true, message: '请输入 Qdrant 地址' }]}
          >
            <Input placeholder="http://172.19.5.223:6333" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="embeddingProvider"
                label="Embedding 提供商"
                rules={[{ required: true, message: '请选择提供商' }]}
              >
                <Select onChange={handleProviderChange}>
                  <Option value="aliyun">阿里云 DashScope</Option>
                  <Option value="xinference">Xinference</Option>
                  <Option value="openai">OpenAI 兼容</Option>
                  <Option value="gemini">Google Gemini</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="embeddingDimension"
                label="向量维度"
                rules={[{ required: true, message: '请输入向量维度' }]}
              >
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="embeddingApiBaseUrl"
            label="Embedding API Base URL"
            rules={[{ required: true, message: '请输入 Embedding API Base URL' }]}
          >
            <Input placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
          </Form.Item>

          <Form.Item
            name="embeddingApiKey"
            label="Embedding API Key"
            tooltip="Xinference 本地服务通常可以留空；阿里云/OpenAI/Gemini 需要填写对应 Key。"
          >
            <Input.Password placeholder="阿里云 DashScope Key / OpenAI Key / 可留空" autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="embeddingModel"
            label="Embedding 模型"
            rules={[{ required: true, message: '请输入 Embedding 模型名称' }]}
          >
            <Input placeholder="text-embedding-v4" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// 测试搜索面板组件
const TestSearchPanel: React.FC<{ systemName: string }> = ({ systemName }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleTestSearch = async () => {
    if (!searchQuery.trim()) {
      message.warning('请输入搜索关键词');
      return;
    }

    setSearching(true);
    try {
      const data = await knowledgeService.testSearch({
        query: searchQuery,
        systemName,
        topK: 5
      });
      setResults(data);
    } catch (error) {
      message.error('搜索失败');
      console.error(error);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Input.Search
        placeholder="输入测试查询内容，如：订单超时自动取消"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        onSearch={handleTestSearch}
        loading={searching}
        enterButton="测试搜索"
        size="large"
      />

      {results && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Badge count={results.totalFound} showZero>
              <span style={{ fontSize: 16, fontWeight: 500 }}>搜索结果</span>
            </Badge>
            <span style={{ marginLeft: 16, color: '#666' }}>
              查询: "{results.query}" | 系统: {results.systemName}
            </span>
          </div>

          {results.results.length > 0 ? (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {results.results.map((result: any, index: number) => {
                const config = knowledgeService.getCategoryConfig(result.knowledge.category);
                return (
                  <Card key={index} size="small">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Space>
                        {config && (
                          <Tag color={config.color}>
                            {config.icon} {config.label}
                          </Tag>
                        )}
                        <span style={{ fontWeight: 500 }}>{result.knowledge.title}</span>
                      </Space>
                      <Tag color={result.score >= 0.8 ? 'green' : result.score >= 0.6 ? 'orange' : 'default'}>
                        相似度: {(result.score * 100).toFixed(1)}%
                      </Tag>
                    </div>
                    <div style={{ marginTop: 8, color: '#666' }}>
                      {result.knowledge.content}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Space size={[0, 8]} wrap>
                        <Tag>领域: {result.knowledge.businessDomain}</Tag>
                        {result.knowledge.tags.map((tag: string) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </Space>
                    </div>
                  </Card>
                );
              })}
            </Space>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              未找到相关知识，建议：
              <br />
              1. 尝试更换关键词
              <br />
              2. 添加相关知识到知识库
            </div>
          )}
        </div>
      )}
    </Space>
  );
};

export default KnowledgeManagement;
