import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save, X, Loader2, Plus, Trash2, ChevronDown, ChevronRight, Target, Edit2 } from 'lucide-react';
import { TestPoint } from '../components/functional-test-case/TestPointsEditor';
import { StepsEditor } from '../components/functional-test-case/StepsEditor';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import * as systemService from '../services/systemService';
import type { SystemOption } from '../types/test';
import { showToast } from '../utils/toast';
import { clsx } from 'clsx';
import { Input } from 'antd';
import { Button } from '../components/ui/button';
import { TestCaseDetailModal } from '../components/ai-generator/TestCaseDetailModal';
import { parseStepsText } from '../utils/stepConverter';

const { TextArea } = Input;

/**
 * 测试用例接口（手动创建）
 */
interface ManualTestCase {
  id: string;
  name: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  steps: string;
  assertions: string;
  preconditions?: string;
  testData?: string;
}

/**
 * 扩展的测试点接口（包含测试用例）
 */
interface ExtendedTestPoint extends TestPoint {
  testCases?: ManualTestCase[];
}

/**
 * 测试场景接口
 */
interface TestScenario {
  id: string;
  name: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  testPoints: ExtendedTestPoint[];
  expanded?: boolean;
}

/**
 * 表单数据接口
 */
interface FormData {
  system: string;
  module: string;
  sectionName: string;
  coverageAreas: string;
}

/**
 * 功能测试用例创建页面 - 三层结构：测试场景 → 测试点 → 测试用例
 */
export function FunctionalTestCaseCreate() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // 系统字典列表
  const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);

  // 基础信息
  const [formData, setFormData] = useState<FormData>({
    system: '',
    module: '',
    sectionName: '',
    coverageAreas: ''
  });

  // 测试场景列表
  const [testScenarios, setTestScenarios] = useState<TestScenario[]>([]);
  const [expandedScenarios, setExpandedScenarios] = useState<Record<string, boolean>>({});
  const [expandedTestPoints, setExpandedTestPoints] = useState<Record<string, boolean>>({}); // 测试点展开状态
  const [expandedTestCases, setExpandedTestCases] = useState<Record<string, boolean>>({}); // 测试用例展开状态
  const [editingTestCases, setEditingTestCases] = useState<Record<string, Partial<ManualTestCase>>>({}); // 正在编辑的测试用例
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [editingTestPoint, setEditingTestPoint] = useState<{scenarioId: string, pointIndex: number} | null>(null); // 正在编辑的测试点
  
  // 计算总操作步骤数
  const totalStepsCount = useMemo(() => {
    return testScenarios.reduce((sum, scenario) => 
      sum + scenario.testPoints.reduce((pSum, point) => 
        pSum + (point.testCases || []).reduce((tcSum, testCase) => 
          tcSum + (testCase.steps ? parseStepsText(testCase.steps).length : 0), 0
        ), 0
      ), 0
    );
  }, [testScenarios]);
  
  // 测试用例详情模态框
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentDetailCase, setCurrentDetailCase] = useState<any>(null);

  // 加载系统字典列表
  useEffect(() => {
    const loadSystems = async () => {
      try {
        const systems = await systemService.getActiveSystems();
        setSystemOptions(systems);
      } catch (error) {
        console.error('加载系统列表失败:', error);
        showToast.error('加载系统列表失败');
      }
    };
    loadSystems();
  }, []);

  /**
   * 处理基础信息变更
   */
  const handleFormDataChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /**
   * 检查是否可以添加测试场景（需要先填写基础信息）
   */
  const canAddScenario = (): boolean => {
    return formData.system.trim() !== '' && formData.module.trim() !== '';
  };

  /**
   * 添加测试场景
   */
  const handleAddScenario = () => {
    if (!canAddScenario()) {
      showToast.error('请先填写基础信息（系统和模块）');
      return;
    }
    const newScenario: TestScenario = {
      id: `scenario-${Date.now()}`,
      name: `测试场景 ${testScenarios.length + 1}`,
      description: '',
      priority: 'medium',
      testPoints: [],
      expanded: true
    };
    setTestScenarios(prev => [...prev, newScenario]);
    setEditingScenarioId(newScenario.id);
    setExpandedScenarios(prev => ({ ...prev, [newScenario.id]: true }));
  };

  /**
   * 删除测试场景
   */
  const handleDeleteScenario = (scenarioId: string) => {
    if (confirm('确定要删除此测试场景吗？场景下的所有测试点也将被删除。')) {
      setTestScenarios(prev => prev.filter(s => s.id !== scenarioId));
      setExpandedScenarios(prev => {
        const newExpanded = { ...prev };
        delete newExpanded[scenarioId];
        return newExpanded;
      });
    }
  };

  /**
   * 更新测试场景
   */
  const handleUpdateScenario = (scenarioId: string, updates: Partial<TestScenario>) => {
    setTestScenarios(prev =>
      prev.map(s => s.id === scenarioId ? { ...s, ...updates } : s)
    );
  };

  /**
   * 切换场景展开/折叠
   */
  const toggleScenario = (scenarioId: string) => {
    setExpandedScenarios(prev => ({ ...prev, [scenarioId]: !prev[scenarioId] }));
  };

  /**
   * 切换测试点展开/折叠
   */
  const toggleTestPoint = (scenarioId: string, pointIndex: number) => {
    const pointKey = `${scenarioId}-${pointIndex}`;
    setExpandedTestPoints(prev => ({ ...prev, [pointKey]: !prev[pointKey] }));
  };

  /**
   * 切换测试用例展开/折叠状态
   */
  const toggleTestCase = (testCaseId: string) => {
    setExpandedTestCases(prev => ({
      ...prev,
      [testCaseId]: !prev[testCaseId]
    }));
    // 如果展开，初始化编辑状态
    if (!expandedTestCases[testCaseId]) {
      const testCase = findTestCaseById(testCaseId);
      if (testCase) {
        setEditingTestCases(prev => ({
          ...prev,
          [testCaseId]: { ...testCase }
        }));
      }
    } else {
      // 如果折叠，清除编辑状态
      setEditingTestCases(prev => {
        const newState = { ...prev };
        delete newState[testCaseId];
        return newState;
      });
    }
  };

  /**
   * 根据ID查找测试用例
   */
  const findTestCaseById = (testCaseId: string): ManualTestCase | null => {
    for (const scenario of testScenarios) {
      for (const point of scenario.testPoints) {
        const testCase = (point.testCases || []).find(tc => tc.id === testCaseId);
        if (testCase) return testCase;
      }
    }
    return null;
  };

  /**
   * 更新正在编辑的测试用例字段
   */
  const updateEditingTestCase = (testCaseId: string, updates: Partial<ManualTestCase>) => {
    setEditingTestCases(prev => ({
      ...prev,
      [testCaseId]: { ...prev[testCaseId], ...updates }
    }));
  };

  /**
   * 保存编辑中的测试用例
   */
  const handleSaveEditingTestCase = (testCaseId: string) => {
    const editedCase = editingTestCases[testCaseId];
    if (!editedCase) return;

    // 找到对应的场景和测试点
    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      for (let j = 0; j < scenario.testPoints.length; j++) {
        const point = scenario.testPoints[j];
        const testCaseIndex = (point.testCases || []).findIndex(tc => tc.id === testCaseId);
        if (testCaseIndex !== -1) {
          handleUpdateTestCase(scenario.id, j, testCaseId, editedCase);
          // 清除编辑状态
          setEditingTestCases(prev => {
            const newState = { ...prev };
            delete newState[testCaseId];
            return newState;
          });
          // 收起测试用例（折叠详情）
          setExpandedTestCases(prev => ({
            ...prev,
            [testCaseId]: false
          }));
          showToast.success('测试用例已保存');
          return;
        }
      }
    }
  };

  /**
   * 取消编辑测试用例
   */
  const handleCancelEditingTestCase = (testCaseId: string) => {
    setEditingTestCases(prev => {
      const newState = { ...prev };
      delete newState[testCaseId];
      return newState;
    });
    // 折叠测试用例
    setExpandedTestCases(prev => ({
      ...prev,
      [testCaseId]: false
    }));
  };

  /**
   * 检查是否可以添加测试点（需要测试场景已保存，即不在编辑状态）
   */
  const canAddTestPoint = (scenarioId: string): boolean => {
    const scenario = testScenarios.find(s => s.id === scenarioId);
    // 测试场景必须存在、有名称、且不在编辑状态
    return scenario !== undefined && scenario.name.trim() !== '' && editingScenarioId !== scenarioId;
  };

  /**
   * 添加测试点
   */
  const handleAddTestPoint = (scenarioId: string) => {
    if (!canAddTestPoint(scenarioId)) {
      showToast.error('请先完成测试场景的编辑（填写场景名称）');
      return;
    }
    const scenario = testScenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const newTestPoint: ExtendedTestPoint = {
      testPoint: `测试点 ${scenario.testPoints.length + 1}`,
      riskLevel: 'medium',
      description: '',
      testCases: []
    };
    
    const updatedTestPoints = [...scenario.testPoints, newTestPoint];
    handleUpdateScenario(scenarioId, { testPoints: updatedTestPoints });
    
    // 进入编辑模式
    setEditingTestPoint({ scenarioId, pointIndex: updatedTestPoints.length - 1 });
  };

  /**
   * 删除测试点
   */
  const handleDeleteTestPoint = (scenarioId: string, pointIndex: number) => {
    if (confirm('确定要删除此测试点吗？测试点下的所有测试用例也将被删除。')) {
      const scenario = testScenarios.find(s => s.id === scenarioId);
      if (!scenario) return;

      const updatedTestPoints = scenario.testPoints.filter((_, index) => index !== pointIndex);
      handleUpdateScenario(scenarioId, { testPoints: updatedTestPoints });
      
      // 如果删除的是正在编辑的测试点，取消编辑状态
      if (editingTestPoint?.scenarioId === scenarioId && editingTestPoint?.pointIndex === pointIndex) {
        setEditingTestPoint(null);
      }
    }
  };

  /**
   * 更新测试点
   */
  const handleUpdateTestPoint = (scenarioId: string, pointIndex: number, updates: Partial<ExtendedTestPoint>) => {
    const scenario = testScenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const updatedTestPoints = [...scenario.testPoints];
    updatedTestPoints[pointIndex] = { ...updatedTestPoints[pointIndex], ...updates };
    handleUpdateScenario(scenarioId, { testPoints: updatedTestPoints });
  };

  /**
   * 为测试点创建测试用例（打开创建表单）
   */
  const [creatingTestCase, setCreatingTestCase] = useState<{scenarioId: string, pointIndex: number} | null>(null);
  const [newTestCaseForm, setNewTestCaseForm] = useState<Partial<ManualTestCase>>({
    name: '',
    description: '',
    priority: 'medium',
    steps: '',
    assertions: '',
    preconditions: '',
    testData: ''
  });

  /**
   * 检查是否可以添加测试用例（需要先添加测试点）
   */
  const canAddTestCase = (scenarioId: string, pointIndex: number): boolean => {
    const scenario = testScenarios.find(s => s.id === scenarioId);
    if (!scenario) return false;
    const point = scenario.testPoints[pointIndex];
    return point !== undefined && (point.testPoint?.trim() || point.testPointName?.trim()) !== '';
  };

  const handleCreateTestCase = (scenarioId: string, pointIndex: number) => {
    const scenario = testScenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const point = scenario.testPoints[pointIndex];
    if (!point || !(point.testPoint?.trim() || point.testPointName?.trim())) {
      showToast.error('请先填写测试点名称');
      return;
    }

    // 初始化表单数据
    setNewTestCaseForm({
      name: `${scenario.name} - ${point.testPoint || point.testPointName}`,
      description: '', // 描述置空
      priority: scenario.priority === 'high' ? 'high' : scenario.priority === 'low' ? 'low' : 'medium',
      steps: '',
      assertions: '',
      preconditions: '',
      testData: ''
    });

    setCreatingTestCase({ scenarioId, pointIndex });
  };

  /**
   * 保存新创建的测试用例
   */
  const handleSaveNewTestCase = () => {
    if (!creatingTestCase) return;

    const { scenarioId, pointIndex } = creatingTestCase;
    const scenario = testScenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    // 验证必填字段
    if (!newTestCaseForm.name?.trim()) {
      showToast.error('请输入测试用例名称');
      return;
    }
    if (!newTestCaseForm.steps?.trim()) {
      showToast.error('请输入测试步骤');
      return;
    }
    if (!newTestCaseForm.assertions?.trim()) {
      showToast.error('请输入预期结果');
      return;
    }

    const newTestCase: ManualTestCase = {
      id: `testcase-${Date.now()}-${Math.random()}`,
      name: newTestCaseForm.name.trim(),
      description: newTestCaseForm.description || '',
      priority: newTestCaseForm.priority || 'medium',
      steps: newTestCaseForm.steps.trim(),
      assertions: newTestCaseForm.assertions.trim(),
      preconditions: newTestCaseForm.preconditions || '',
      testData: newTestCaseForm.testData || ''
    };

    const updatedTestPoints = [...scenario.testPoints];
    updatedTestPoints[pointIndex] = {
      ...updatedTestPoints[pointIndex],
      testCases: [...(updatedTestPoints[pointIndex].testCases || []), newTestCase]
    };

    handleUpdateScenario(scenarioId, { testPoints: updatedTestPoints });
    
    // 重置表单和状态
    setCreatingTestCase(null);
    setNewTestCaseForm({
      name: '',
      description: '',
      priority: 'medium',
      steps: '',
      assertions: '',
      preconditions: '',
      testData: ''
    });
    
    // 收起测试点（折叠测试用例列表）
    const pointKey = `${scenarioId}-${pointIndex}`;
    setExpandedTestPoints(prev => ({
      ...prev,
      [pointKey]: false
    }));
    
    showToast.success('测试用例已创建');
  };

  /**
   * 取消创建测试用例
   */
  const handleCancelCreateTestCase = () => {
    setCreatingTestCase(null);
    setNewTestCaseForm({
      name: '',
      description: '',
      priority: 'medium',
      steps: '',
      assertions: '',
      preconditions: '',
      testData: ''
    });
  };

  /**
   * 删除测试用例
   */
  const handleDeleteTestCase = (scenarioId: string, pointIndex: number, testCaseId: string) => {
    if (confirm('确定要删除此测试用例吗？')) {
      const scenario = testScenarios.find(s => s.id === scenarioId);
      if (!scenario) return;

      const updatedTestPoints = [...scenario.testPoints];
      updatedTestPoints[pointIndex] = {
        ...updatedTestPoints[pointIndex],
        testCases: (updatedTestPoints[pointIndex].testCases || []).filter(tc => tc.id !== testCaseId)
      };

      handleUpdateScenario(scenarioId, { testPoints: updatedTestPoints });
      showToast.success('测试用例已删除');
    }
  };

  /**
   * 更新测试用例
   */
  const handleUpdateTestCase = (scenarioId: string, pointIndex: number, testCaseId: string, updates: Partial<ManualTestCase>) => {
    const scenario = testScenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const updatedTestPoints = [...scenario.testPoints];
    updatedTestPoints[pointIndex] = {
      ...updatedTestPoints[pointIndex],
      testCases: (updatedTestPoints[pointIndex].testCases || []).map(tc =>
        tc.id === testCaseId ? { ...tc, ...updates } : tc
      )
    };

    handleUpdateScenario(scenarioId, { testPoints: updatedTestPoints });
  };

  /**
   * 查看测试用例详情
   */
  const handleViewTestCase = (testCase: ManualTestCase, scenario: TestScenario, point: ExtendedTestPoint) => {
    // 转换为详情模态框需要的格式
    const detailCase = {
      id: testCase.id,
      name: testCase.name,
      description: testCase.description,
      priority: testCase.priority,
      testScenario: scenario.name,
      system: formData.system,
      module: formData.module,
      sectionName: formData.sectionName,
      coverageAreas: formData.coverageAreas,
      preconditions: testCase.preconditions || '',
      testData: testCase.testData || '',
      steps: testCase.steps,
      assertions: testCase.assertions,
      testPoints: [{
        testPoint: point.testPoint || point.testPointName || '',
        steps: testCase.steps,  // 从测试用例获取
        expectedResult: testCase.assertions,  // 从测试用例获取
        riskLevel: point.riskLevel,
        testScenario: scenario.name
      }]
    };

    setCurrentDetailCase(detailCase);
    setDetailModalOpen(true);
  };

  /**
   * 保存测试用例详情修改
   */
  const handleSaveTestCaseDetail = (updatedTestCase: any) => {
    // 找到对应的场景和测试点
    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      for (let j = 0; j < scenario.testPoints.length; j++) {
        const point = scenario.testPoints[j];
        const testCaseIndex = (point.testCases || []).findIndex(tc => tc.id === updatedTestCase.id);
        if (testCaseIndex !== -1) {
          handleUpdateTestCase(scenario.id, j, updatedTestCase.id, {
            name: updatedTestCase.name,
            description: updatedTestCase.description,
            priority: updatedTestCase.priority,
            steps: updatedTestCase.steps,
            assertions: updatedTestCase.assertions,
            preconditions: updatedTestCase.preconditions,
            testData: updatedTestCase.testData
          });
          if (typeof updatedTestCase.module === 'string') {
            setFormData((prev) => ({ ...prev, module: updatedTestCase.module }));
          }
          setDetailModalOpen(false);
          showToast.success('测试用例已更新');
          return;
        }
      }
    }
  };

  /**
   * 表单验证
   */
  const validateForm = (): boolean => {
    // 验证基础信息
    if (!formData.system.trim()) {
      showToast.error('请选择系统');
      return false;
    }
    if (!formData.module.trim()) {
      showToast.error('请输入模块名称');
      return false;
    }

    // 验证至少有一个测试场景
    if (testScenarios.length === 0) {
      showToast.error('至少需要创建一个测试场景');
      return false;
    }

    // 验证每个测试场景
    let totalTestCases = 0;
    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      if (!scenario.name.trim()) {
        showToast.error(`测试场景 ${i + 1} 的名称不能为空`);
        return false;
      }

      // 验证每个场景至少有一个测试点
      if (scenario.testPoints.length === 0) {
        showToast.error(`测试场景 "${scenario.name}" 至少需要一个测试点`);
        return false;
      }

      // 验证每个测试点的必填字段（只验证测试点名称，步骤和预期结果在测试用例中）
      for (let j = 0; j < scenario.testPoints.length; j++) {
        const point = scenario.testPoints[j];
        const testPointName = point.testPoint || point.testPointName || '';
        if (!testPointName.trim()) {
          showToast.error(`测试场景 "${scenario.name}" 的测试点 ${j + 1} 的名称不能为空`);
          return false;
        }

        // 验证测试用例的必填字段
        const testCases = point.testCases || [];
        for (let k = 0; k < testCases.length; k++) {
          const testCase = testCases[k];
          if (!testCase.steps?.trim()) {
            showToast.error(`测试场景 "${scenario.name}" 的测试点 "${testPointName}" 的测试用例 ${k + 1} 的测试步骤不能为空`);
            return false;
          }
          if (!testCase.assertions?.trim()) {
            showToast.error(`测试场景 "${scenario.name}" 的测试点 "${testPointName}" 的测试用例 ${k + 1} 的预期结果不能为空`);
            return false;
          }
        }

        // 统计测试用例数量
        totalTestCases += testCases.length;
      }
    }

    // 验证至少有一个测试用例
    if (totalTestCases === 0) {
      showToast.error('至少需要创建一个测试用例，请为测试点创建测试用例');
      return false;
    }

    return true;
  };

  /**
   * 提交表单 - 保存所有已创建的测试用例
   */
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (saving) return;
    if (!validateForm()) return;

    try {
      setSaving(true);

      // 收集所有已创建的测试用例
      const testCasesToCreate: any[] = [];

      testScenarios.forEach((scenario) => {
        scenario.testPoints.forEach((point) => {
          // 只保存已创建的测试用例
          (point.testCases || []).forEach((testCase) => {
            const testCaseData = {
              name: testCase.name.trim(),
              description: testCase.description || scenario.description || '',
              system: formData.system.trim(),
              module: formData.module.trim(),
              priority: testCase.priority,
              status: 'DRAFT' as const,
              testType: '',
              tags: scenario.name,
              preconditions: testCase.preconditions || '',
              testData: testCase.testData || '',
              sectionName: formData.sectionName.trim(),
              coverageAreas: formData.coverageAreas.trim() || scenario.name,
              testScenario: scenario.name,
              steps: testCase.steps.trim(),  // 从测试用例获取
              assertions: testCase.assertions.trim(),  // 从测试用例获取
              testPoints: [{
                testPurpose: scenario.description || '',
                testPoint: (point.testPoint || point.testPointName || '').trim(),
                testPointName: (point.testPoint || point.testPointName || '').trim(),
                steps: testCase.steps.trim(),  // 从测试用例获取
                expectedResult: testCase.assertions.trim(),  // 从测试用例获取
                riskLevel: point.riskLevel,
                testScenario: scenario.name,
                description: point.description?.trim(),
                coverageAreas: point.coverageAreas?.trim()
              }]
            };

            testCasesToCreate.push(testCaseData);
          });
        });
      });

      // 批量创建测试用例（后端会从认证token中获取userId）
      let successCount = 0;
      let failCount = 0;

      for (const testCase of testCasesToCreate) {
        try {
          const result = await functionalTestCaseService.create(testCase);
          if (result.success) {
            successCount++;
          } else {
            failCount++;
            console.error(`创建测试用例 "${testCase.name}" 失败:`, result.error);
          }
        } catch (error: any) {
          console.error(`创建测试用例 "${testCase.name}" 失败:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        showToast.success(`成功创建 ${successCount} 个测试用例${failCount > 0 ? `，${failCount} 个失败` : ''}`);
        navigate('/functional-test-cases');
      } else {
        showToast.error('创建失败，请检查数据');
      }
    } catch (error: any) {
      console.error('创建测试用例失败:', error);
      showToast.error('创建失败：' + error.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * 取消创建
   */
  const handleCancel = () => {
    if (confirm('确定要取消创建吗？未保存的数据将丢失。')) {
      navigate('/functional-test-cases');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* 顶部导航栏 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors border border-gray-300"
            >
              <ArrowLeft className="h-4 w-4" />
              返回列表
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">创建功能测试用例</h1>
              <p className="text-sm text-gray-600 mt-1">采用三层结构：测试场景 → 测试点 → 测试用例</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
              // className="inline-flex items-center px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              style={{ height: '40px',borderRadius: '6px',fontSize: '100%' }}
              icon={<X className="w-4 h-4" />}
              iconPosition="left"
            >
              {/* <X className="h-4 w-4 mr-2" /> */}
              取消
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSubmit}
              disabled={saving}
              // className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
              style={{ height: '40px',borderRadius: '6px',fontSize: '100%' }}
              icon={<Save className="w-4 h-4" />}
              iconPosition="left"
            >
              {saving ? (
                <>
                  {/* <Loader2 className="h-4 w-4 mr-2 animate-spin" /> */}
                  保存中...
                </>
              ) : (
                <>
                  {/* <Save className="h-4 w-4 mr-2" /> */}
                  保存 ({testScenarios.reduce((sum, s) => sum + s.testPoints.reduce((pSum, p) => pSum + (p.testCases?.length || 0), 0), 0)} 个用例)
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 表单内容 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* 基础信息 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              基础信息
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  系统 <span className="text-red-500">*</span>
                </label>
                <select
                  name="system"
                  value={formData.system}
                  onChange={handleFormDataChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">请选择系统</option>
                  {systemOptions.map(sys => (
                    <option key={sys.id} value={sys.name}>{sys.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模块 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="module"
                  value={formData.module}
                  onChange={handleFormDataChange}
                  maxLength={100}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="输入模块名称"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  章节名称
                </label>
                <input
                  type="text"
                  name="sectionName"
                  value={formData.sectionName}
                  onChange={handleFormDataChange}
                  maxLength={255}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="输入章节名称"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  覆盖范围
                </label>
                <input
                  type="text"
                  name="coverageAreas"
                  value={formData.coverageAreas}
                  onChange={handleFormDataChange}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="输入测试覆盖范围"
                />
              </div>
            </div>
          </div>

          {/* 测试场景列表 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-600" />
                测试场景
                <span className="text-sm font-normal text-gray-500">
                  （共 {testScenarios.length} 个场景，{testScenarios.reduce((sum, s) => sum + s.testPoints.length, 0)} 个测试点，{testScenarios.reduce((sum, s) => sum + s.testPoints.reduce((pSum, p) => pSum + (p.testCases?.length || 0), 0), 0)} 个测试用例，{totalStepsCount} 个测试步骤）
                </span>
              </h2>
              <Button
                variant="default"
                size="sm"
                onClick={handleAddScenario}
                disabled={!canAddScenario()}
                // className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                title={!canAddScenario() ? '请先填写基础信息（系统和模块）' : ''}
                icon={<Plus className="w-4 h-4" />}
                iconPosition="left"
              >
                添加测试场景
              </Button>
            </div>

            {testScenarios.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <Target className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 mb-4">暂无测试场景</p>
                <button
                  onClick={handleAddScenario}
                  disabled={!canAddScenario()}
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!canAddScenario() ? '请先填写基础信息（系统和模块）' : ''}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  创建第一个测试场景
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {testScenarios.map((scenario, scenarioIndex) => {
                  const isExpanded = expandedScenarios[scenario.id] !== false;
                  const isEditing = editingScenarioId === scenario.id;

                  return (
                    <motion.div
                      key={scenario.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white hover:border-purple-300 transition-all"
                    >
                      {/* 场景头部 */}
                      <div className="p-4 bg-gradient-to-r from-gray-50 via-white to-purple-50/30">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <button
                              onClick={() => toggleScenario(scenario.id)}
                              className="mt-1 p-1 hover:bg-gray-100 rounded transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-5 h-5 text-gray-600" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-gray-600" />
                              )}
                            </button>

                            <div className="flex-1">
                              {isEditing ? (
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">测试场景名称 *</label>
                                    <input
                                      type="text"
                                      value={scenario.name}
                                      onChange={(e) => handleUpdateScenario(scenario.id, { name: e.target.value })}
                                      placeholder="输入测试场景名称"
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base font-semibold"
                                      autoFocus
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">测试场景描述</label>
                                    <TextArea
                                      value={scenario.description}
                                      onChange={(e) => handleUpdateScenario(scenario.id, { description: e.target.value })}
                                      placeholder="输入测试场景描述（可选）"
                                      rows={2}
                                      className="text-sm"
                                    />
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">优先级：</label>
                                    <select
                                      value={scenario.priority}
                                      onChange={(e) => handleUpdateScenario(scenario.id, { priority: e.target.value as any })}
                                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white shadow-sm hover:shadow-md hover:border-gray-400 transition-all cursor-pointer"
                                      title="选择优先级"
                                    >
                                      <option value="low">低</option>
                                      <option value="medium">中</option>
                                      <option value="high">高</option>
                                    </select>
                                    <div className="ml-auto flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          // 如果是新添加的场景（名称包含"测试场景"且是默认名称），则删除
                                          if (scenario.name.startsWith('测试场景 ') && scenario.description === '' && scenario.priority === 'medium' && scenario.testPoints.length === 0) {
                                            handleDeleteScenario(scenario.id);
                                          } else {
                                            setEditingScenarioId(null);
                                          }
                                        }}
                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
                                      >
                                        取消
                                      </Button>
                                      <Button
                                        variant="default"
                                        size="sm"
                                        onClick={() => setEditingScenarioId(null)}
                                        className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                                      >
                                        保存
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-center gap-3 mb-2">
                                    <h3
                                      className="text-lg font-bold text-gray-900 cursor-pointer hover:text-purple-600"
                                      onClick={() => setEditingScenarioId(scenario.id)}
                                    >
                                      {scenario.name || '未命名场景'}
                                    </h3>
                                    <span className={clsx(
                                      "px-2 py-1 rounded-full text-xs font-semibold",
                                      scenario.priority === 'high' && "bg-red-100 text-red-700",
                                      scenario.priority === 'medium' && "bg-yellow-100 text-yellow-700",
                                      scenario.priority === 'low' && "bg-green-100 text-green-700"
                                    )}>
                                      {scenario.priority === 'high' ? '高优先级' : scenario.priority === 'medium' ? '中优先级' : '低优先级'}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                      {scenario.testPoints.length} 个测试点
                                    </span>
                                  </div>
                                  {scenario.description && (
                                    <p className="text-sm text-gray-600">{scenario.description}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {!isEditing && (
                              <button
                                onClick={() => setEditingScenarioId(scenario.id)}
                                className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                title="编辑场景"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteScenario(scenario.id)}
                              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="删除场景"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 测试点列表（可展开） */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="border-t border-gray-200 bg-gray-50"
                          >
                            <div className="p-4 space-y-4">
                              {/* 测试点列表头部 */}
                              <div className="flex items-center justify-between mb-4">
                                <p className="text-sm font-medium text-gray-700">
                                  测试点列表（共 {scenario.testPoints.length} 个）
                                </p>
                                {canAddTestPoint(scenario.id) && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleAddTestPoint(scenario.id)}
                                    icon={<Plus className="w-4 h-4" />}
                                    iconPosition="left"
                                  >
                                    添加测试点
                                  </Button>
                                )}
                              </div> 

                              {/* 空状态 */}
                              {scenario.testPoints.length === 0 && (
                                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                  <Target className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                                  <p className="text-gray-500 mb-4">暂无测试点</p>
                                  {canAddTestPoint(scenario.id) && (
                                    <button
                                      onClick={() => handleAddTestPoint(scenario.id)}
                                      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-sm hover:shadow-md"
                                    >
                                      <Plus className="w-4 h-4 mr-2" />
                                      创建第一个测试点
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* 测试点和测试用例融合显示 */}
                              {scenario.testPoints.length > 0 && scenario.testPoints.map((point, pointIndex) => {
                                const testCases = point.testCases || [];
                                const testPointName = point.testPoint || point.testPointName || '未命名测试点';
                                const hasTestCases = testCases.length > 0;
                                const pointKey = `${scenario.id}-${pointIndex}`;
                                const isTestPointExpanded = expandedTestPoints[pointKey] !== false; // 默认展开
                                const isEditing = editingTestPoint?.scenarioId === scenario.id && editingTestPoint?.pointIndex === pointIndex;

                                return (
                                  <motion.div
                                    key={pointIndex}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="border-2 border-purple-200 bg-white rounded-xl overflow-hidden hover:border-purple-300 transition-all"
                                  >
                                    {/* 测试点头部 */}
                                    <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50">
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3 flex-1">
                                          {/* 展开/折叠按钮 */}
                                          {hasTestCases && (
                                            <button
                                              onClick={() => toggleTestPoint(scenario.id, pointIndex)}
                                              className="mt-1 p-1 hover:bg-purple-100 rounded transition-colors flex-shrink-0"
                                              title={isTestPointExpanded ? '折叠测试用例' : '展开测试用例'}
                                            >
                                              {isTestPointExpanded ? (
                                                <ChevronDown className="w-5 h-5 text-gray-600" />
                                              ) : (
                                                <ChevronRight className="w-5 h-5 text-gray-600" />
                                              )}
                                            </button>
                                          )}
                                          {!hasTestCases && (
                                            <div className="w-6" /> // 占位，保持对齐
                                          )}
                                          
                                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500
                                                          flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                            {pointIndex + 1}
                                          </div>
                                          
                                          <div className="flex-1">
                                            {isEditing ? (
                                              <div className="space-y-3">
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">测试点名称 *</label>
                                                  <input
                                                    type="text"
                                                    value={testPointName}
                                                    onChange={(e) => handleUpdateTestPoint(scenario.id, pointIndex, { testPoint: e.target.value })}
                                                    placeholder="输入测试点名称"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base font-semibold"
                                                    autoFocus
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">测试点描述</label>
                                                  <TextArea
                                                    value={point.description || ''}
                                                    onChange={(e) => handleUpdateTestPoint(scenario.id, pointIndex, { description: e.target.value })}
                                                    placeholder="输入测试点描述（可选）"
                                                    rows={2}
                                                    className="text-sm"
                                                  />
                                                </div>
                                                <div className="flex items-center gap-3">
                                                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">风险等级：</label>
                                                  <select
                                                    value={point.riskLevel}
                                                    onChange={(e) => handleUpdateTestPoint(scenario.id, pointIndex, { riskLevel: e.target.value as any })}
                                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white shadow-sm hover:shadow-md hover:border-gray-400 transition-all cursor-pointer"
                                                    title="选择风险等级"
                                                  >
                                                    <option value="low">低风险</option>
                                                    <option value="medium">中风险</option>
                                                    <option value="high">高风险</option>
                                                  </select>
                                                  <div className="ml-auto flex items-center gap-2">
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      onClick={() => {
                                                        // 如果是新添加的测试点（名称包含"测试点"且是默认名称），则删除
                                                        const point = scenario.testPoints[pointIndex];
                                                        if (point.testPoint.startsWith('测试点 ') && point.description === '' && point.riskLevel === 'medium' && (!point.testCases || point.testCases.length === 0)) {
                                                          handleDeleteTestPoint(scenario.id, pointIndex);
                                                        } else {
                                                          setEditingTestPoint(null);
                                                        }
                                                      }}
                                                      className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
                                                    >
                                                      取消
                                                    </Button>
                                                    <Button
                                                      variant="default"
                                                      size="sm"
                                                      onClick={() => setEditingTestPoint(null)}
                                                      className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                                                    >
                                                      保存
                                                    </Button>
                                                  </div>
                                                </div>
                                              </div>
                                            ) : (
                                              <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                  <h4
                                                    className="text-lg font-bold text-gray-900 cursor-pointer hover:text-purple-600"
                                                    onClick={() => setEditingTestPoint({ scenarioId: scenario.id, pointIndex })}
                                                  >
                                                    {testPointName}
                                                  </h4>
                                                  <span className={clsx(
                                                    "px-2 py-1 rounded-full text-xs font-semibold",
                                                    point.riskLevel === 'high' && "bg-red-100 text-red-700",
                                                    point.riskLevel === 'medium' && "bg-yellow-100 text-yellow-700",
                                                    point.riskLevel === 'low' && "bg-green-100 text-green-700"
                                                  )}>
                                                    {point.riskLevel === 'high' ? '高风险' : point.riskLevel === 'medium' ? '中风险' : '低风险'}
                                                  </span>
                                                  {hasTestCases && (
                                                    <span className="text-sm text-gray-500">
                                                      {testCases.length} 个测试用例
                                                    </span>
                                                  )}
                                                </div>
                                                {point.description && (
                                                  <p className="text-sm text-gray-600">{point.description}</p>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          {!isEditing && (
                                            <>
                                              <button
                                                onClick={() => setEditingTestPoint({ scenarioId: scenario.id, pointIndex })}
                                                className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                title="编辑测试点"
                                              >
                                                <Edit2 className="w-4 h-4" />
                                              </button>
                                              <button
                                                onClick={() => handleDeleteTestPoint(scenario.id, pointIndex)}
                                                className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="删除测试点"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                              <Button
                                                variant="default"
                                                size="sm"
                                                onClick={() => handleCreateTestCase(scenario.id, pointIndex)}
                                                disabled={!canAddTestCase(scenario.id, pointIndex)}
                                                title={!canAddTestCase(scenario.id, pointIndex) ? '请先填写测试点名称' : ''}
                                                // className={`inline-flex items-center justify-center gap-2 h-9 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                                //   hasTestCases
                                                //     // ? 'border-2 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 focus:ring-blue-500'
                                                //     ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 focus:ring-blue-500'
                                                //     : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 focus:ring-blue-500'
                                                // } disabled:opacity-50 disabled:cursor-not-allowed`}
                                                // style={{ marginLeft: '10px' }}
                                                icon={<Plus className="w-4 h-4" />}
                                                iconPosition="left"
                                              >
                                                <span className="leading-none">{hasTestCases ? '添加用例' : '创建用例'}</span>
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* 创建测试用例表单 */}
                                    {creatingTestCase?.scenarioId === scenario.id && creatingTestCase?.pointIndex === pointIndex && (
                                      <div className="p-4 bg-purple-50 border-t-2 border-purple-300">
                                        <h5 className="font-semibold text-gray-900 mb-4">创建测试用例</h5>
                                        <div className="space-y-4">
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                              测试用例名称 <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                              type="text"
                                              value={newTestCaseForm.name || ''}
                                              onChange={(e) => setNewTestCaseForm(prev => ({ ...prev, name: e.target.value }))}
                                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                              placeholder="输入测试用例名称"
                                            />
                                          </div>
                                          {/* 优先级 - 使用单选按钮组 */}
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                              优先级
                                            </label>
                                            <div className="flex items-center gap-4">
                                              <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                  type="radio"
                                                  name="priority"
                                                  value="low"
                                                  checked={newTestCaseForm.priority === 'low'}
                                                  onChange={(e) => setNewTestCaseForm(prev => ({ ...prev, priority: e.target.value as any }))}
                                                  className="w-4 h-4 text-green-600 focus:ring-green-500"
                                                />
                                                <span className="text-sm text-gray-700">低</span>
                                              </label>
                                              <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                  type="radio"
                                                  name="priority"
                                                  value="medium"
                                                  checked={newTestCaseForm.priority === 'medium'}
                                                  onChange={(e) => setNewTestCaseForm(prev => ({ ...prev, priority: e.target.value as any }))}
                                                  className="w-4 h-4 text-yellow-600 focus:ring-yellow-500"
                                                />
                                                <span className="text-sm text-gray-700">中</span>
                                              </label>
                                              <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                  type="radio"
                                                  name="priority"
                                                  value="high"
                                                  checked={newTestCaseForm.priority === 'high'}
                                                  onChange={(e) => setNewTestCaseForm(prev => ({ ...prev, priority: e.target.value as any }))}
                                                  className="w-4 h-4 text-red-600 focus:ring-red-500"
                                                />
                                                <span className="text-sm text-gray-700">高</span>
                                              </label>
                                            </div>
                                          </div>
                                          
                                          {/* 前置条件和测试数据 - 一行排版 */}
                                          <div className="grid grid-cols-2 gap-4">
                                            <div>
                                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                                前置条件
                                              </label>
                                              <TextArea
                                                value={newTestCaseForm.preconditions || ''}
                                                onChange={(e) => setNewTestCaseForm(prev => ({ ...prev, preconditions: e.target.value }))}
                                                rows={2}
                                                placeholder="输入前置条件（可选）"
                                                className="text-sm"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                                测试数据
                                              </label>
                                              <TextArea
                                                value={newTestCaseForm.testData || ''}
                                                onChange={(e) => setNewTestCaseForm(prev => ({ ...prev, testData: e.target.value }))}
                                                rows={2}
                                                placeholder="输入测试数据（可选）"
                                                className="text-sm"
                                              />
                                            </div>
                                          </div>
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                              测试步骤 <span className="text-red-500">*</span>
                                            </label>
                                            <StepsEditor
                                              stepsText={newTestCaseForm.steps || ''}
                                              onChange={(text) => setNewTestCaseForm(prev => ({ ...prev, steps: text }))}
                                              readOnly={false}
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                              预期结果 <span className="text-red-500">*</span>
                                            </label>
                                            <TextArea
                                              value={newTestCaseForm.assertions || ''}
                                              onChange={(e) => setNewTestCaseForm(prev => ({ ...prev, assertions: e.target.value }))}
                                              rows={4}
                                              placeholder="输入预期结果"
                                              className="text-sm"
                                            />
                                          </div>
                                          <div className="flex items-center gap-2 justify-end">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={handleCancelCreateTestCase}
                                            >
                                              取消
                                            </Button>
                                            <Button
                                              variant="default"
                                              size="sm"
                                              onClick={handleSaveNewTestCase}
                                            >
                                              保存
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* 测试用例列表（嵌套在测试点卡片内部，使用border-t分隔，可展开/折叠） */}
                                    <AnimatePresence>
                                      {hasTestCases && isTestPointExpanded && (
                                        <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: 'auto', opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          transition={{ duration: 0.3 }}
                                          className="border-t border-gray-200 bg-gray-50 overflow-hidden"
                                        >
                                          <div className="p-4 space-y-3">
                                            <p className="text-sm font-medium text-gray-700 mb-3">
                                              测试用例列表（共 {testCases.length} 个）
                                            </p>
                                            {testCases.map((testCase, tcIndex) => {
                                              const isExpanded = expandedTestCases[testCase.id] === true;
                                              const editingCase = editingTestCases[testCase.id] || testCase;
                                              
                                              return (
                                                <div
                                                  key={testCase.id}
                                                  className="rounded-lg border-2 bg-white border-gray-200 hover:border-purple-300 transition-all shadow-sm hover:shadow-md overflow-hidden"
                                                >
                                                  {/* 测试用例头部 */}
                                                  <div className="p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                      <div className="flex items-start gap-3 flex-1">
                                                        <button
                                                          onClick={() => toggleTestCase(testCase.id)}
                                                          className="mt-1 p-1 hover:bg-purple-100 rounded transition-colors flex-shrink-0"
                                                          title={isExpanded ? '折叠详情' : '展开详情'}
                                                        >
                                                          {isExpanded ? (
                                                            <ChevronDown className="w-5 h-5 text-gray-600" />
                                                          ) : (
                                                            <ChevronRight className="w-5 h-5 text-gray-600" />
                                                          )}
                                                        </button>
                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-blue-400
                                                                        flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md">
                                                          {tcIndex + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <h6 className="font-semibold text-sm text-gray-900">
                                                              {testCase.name}
                                                            </h6>
                                                            <span className={clsx(
                                                              "px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
                                                              testCase.priority === 'high' && "bg-red-100 text-red-700 border border-red-200",
                                                              testCase.priority === 'medium' && "bg-yellow-100 text-yellow-700 border border-yellow-200",
                                                              testCase.priority === 'low' && "bg-green-100 text-green-700 border border-green-200"
                                                            )}>
                                                              {testCase.priority === 'high' ? '高优先级' : testCase.priority === 'medium' ? '中优先级' : '低优先级'}
                                                            </span>
                                                            {(() => {
                                                              const stepsCount = testCase.steps ? parseStepsText(testCase.steps).length : 0;
                                                              return stepsCount > 0 ? (
                                                                // <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
                                                                <span className="text-sm font-normal text-gray-500">
                                                                  {stepsCount} 个测试步骤
                                                                </span>
                                                              ) : null;
                                                            })()}
                                                          </div>
                                                          {testCase.description && (
                                                            <p className="text-xs text-gray-600 line-clamp-2 mt-1">
                                                              {testCase.description}
                                                            </p>
                                                          )}
                                                        </div>
                                                      </div>
                                                      <div className="flex items-center gap-1 flex-shrink-0">
                                                        {!isExpanded && (
                                                          <>
                                                            <button
                                                              onClick={() => toggleTestCase(testCase.id)}
                                                              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                              title="编辑用例"
                                                            >
                                                              <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                              onClick={() => handleDeleteTestCase(scenario.id, pointIndex, testCase.id)}
                                                              className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                              title="删除用例"
                                                            >
                                                              <Trash2 className="w-4 h-4" />
                                                            </button>
                                                            <Button
                                                              variant="default"
                                                              size="sm"
                                                              onClick={() => handleViewTestCase(testCase, scenario, point)}
                                                              style={{ marginLeft: '10px' }}
                                                            >
                                                              查看用例
                                                            </Button>
                                                          </>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </div>

                                                  {/* 展开的详情区域 */}
                                                  <AnimatePresence>
                                                    {isExpanded && (
                                                      <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.3 }}
                                                        className="border-t-2 border-purple-300 bg-purple-50 overflow-hidden"
                                                      >
                                                        <div className="p-4 space-y-4">
                                                          <h5 className="font-semibold text-gray-900 mb-4">编辑测试用例</h5>
                                                          
                                                          {/* 用例名称 */}
                                                          <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                              测试用例名称 <span className="text-red-500">*</span>
                                                            </label>
                                                            <input
                                                              type="text"
                                                              value={editingCase.name || ''}
                                                              onChange={(e) => updateEditingTestCase(testCase.id, { name: e.target.value })}
                                                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                                              placeholder="输入测试用例名称"
                                                            />
                                                          </div>

                                                          {/* 优先级 - 使用单选按钮组 */}
                                                          <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                              优先级
                                                            </label>
                                                            <div className="flex items-center gap-4">
                                                              <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                  type="radio"
                                                                  name={`priority-${testCase.id}`}
                                                                  value="low"
                                                                  checked={editingCase.priority === 'low'}
                                                                  onChange={(e) => updateEditingTestCase(testCase.id, { priority: e.target.value as any })}
                                                                  className="w-4 h-4 text-green-600 focus:ring-green-500"
                                                                />
                                                                <span className="text-sm text-gray-700">低</span>
                                                              </label>
                                                              <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                  type="radio"
                                                                  name={`priority-${testCase.id}`}
                                                                  value="medium"
                                                                  checked={editingCase.priority === 'medium'}
                                                                  onChange={(e) => updateEditingTestCase(testCase.id, { priority: e.target.value as any })}
                                                                  className="w-4 h-4 text-yellow-600 focus:ring-yellow-500"
                                                                />
                                                                <span className="text-sm text-gray-700">中</span>
                                                              </label>
                                                              <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                  type="radio"
                                                                  name={`priority-${testCase.id}`}
                                                                  value="high"
                                                                  checked={editingCase.priority === 'high'}
                                                                  onChange={(e) => updateEditingTestCase(testCase.id, { priority: e.target.value as any })}
                                                                  className="w-4 h-4 text-red-600 focus:ring-red-500"
                                                                />
                                                                <span className="text-sm text-gray-700">高</span>
                                                              </label>
                                                            </div>
                                                          </div>
                                                          
                                                          {/* 前置条件和测试数据 - 一行排版 */}
                                                          <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                                                前置条件
                                                              </label>
                                                              <TextArea
                                                                value={editingCase.preconditions || ''}
                                                                onChange={(e) => updateEditingTestCase(testCase.id, { preconditions: e.target.value })}
                                                                rows={2}
                                                                placeholder="输入前置条件（可选）"
                                                                className="text-sm"
                                                              />
                                                            </div>
                                                            <div>
                                                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                                                测试数据
                                                              </label>
                                                              <TextArea
                                                                value={editingCase.testData || ''}
                                                                onChange={(e) => updateEditingTestCase(testCase.id, { testData: e.target.value })}
                                                                rows={2}
                                                                placeholder="输入测试数据（可选）"
                                                                className="text-sm"
                                                              />
                                                            </div>
                                                          </div>

                                                          {/* 测试步骤 */}
                                                          <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                              测试步骤 <span className="text-red-500">*</span>
                                                            </label>
                                                            <StepsEditor
                                                              stepsText={editingCase.steps || ''}
                                                              onChange={(text) => updateEditingTestCase(testCase.id, { steps: text })}
                                                              readOnly={false}
                                                            />
                                                          </div>

                                                          {/* 预期结果 */}
                                                          <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                              预期结果 <span className="text-red-500">*</span>
                                                            </label>
                                                            <TextArea
                                                              value={editingCase.assertions || ''}
                                                              onChange={(e) => updateEditingTestCase(testCase.id, { assertions: e.target.value })}
                                                              rows={4}
                                                              placeholder="输入预期结果"
                                                              className="text-sm"
                                                            />
                                                          </div>

                                                          {/* 操作按钮 */}
                                                          <div className="flex items-center gap-2 justify-end">
                                                            <Button
                                                              variant="outline"
                                                              size="sm"
                                                              onClick={() => handleCancelEditingTestCase(testCase.id)}
                                                            >
                                                              取消
                                                            </Button>
                                                            <Button
                                                              variant="default"
                                                              size="sm"
                                                              onClick={() => handleSaveEditingTestCase(testCase.id)}
                                                            >
                                                              保存
                                                            </Button>
                                                          </div>
                                                        </div>
                                                      </motion.div>
                                                    )}
                                                  </AnimatePresence>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* 测试用例详情模态框 */}
      <TestCaseDetailModal
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setCurrentDetailCase(null);
        }}
        testCase={currentDetailCase}
        onSave={handleSaveTestCaseDetail}
      />
    </div>
  );
}
