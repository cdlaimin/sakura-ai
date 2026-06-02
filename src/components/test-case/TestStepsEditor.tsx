import { useState } from 'react';
import { Button, Input } from 'antd';
import { ArrowUp, ArrowDown, Copy, Trash2, Plus } from 'lucide-react';
import { clsx } from 'clsx';

const { TextArea } = Input;

// 测试步骤接口
export interface TestStep {
  id: string;
  operation: string;  // 操作步骤
  expected: string;   // 预期结果
}

interface TestStepsEditorProps {
  steps: TestStep[];
  isEditing: boolean;
  onChange?: (steps: TestStep[]) => void;
}

/**
 * 从后端格式的字符串解析为步骤数组
 * 支持格式：
 * 1. 【操作】xxx\n   【预期】yyy  (跨行格式)
 * 2. 【操作】xxx【预期】yyy  (同行格式)
 * 3. 1. 操作xxx (旧格式)
 */
export function parseStepsFromString(stepsStr: string): TestStep[] {
  if (!stepsStr || !stepsStr.trim()) return [];

  const steps: TestStep[] = [];
  
  // 方法1: 解析【操作】【预期】格式（支持跨行）
  // 先按 "数字. 【操作】" 分割成多个步骤块
  const stepBlocks = stepsStr.split(/(?=\d+\.\s*【操作】)/);
  let matched = false;
  
  for (const block of stepBlocks) {
    if (!block.trim()) continue;
    
    // 匹配操作部分: "1. 【操作】xxx"
    const operationMatch = block.match(/(\d+)\.\s*【操作】([^【]+)/);
    if (operationMatch) {
      matched = true;
      const operation = operationMatch[2]?.trim() || '';
      
      // 匹配预期部分: "【预期】yyy"（可能在同一行或下一行）
      const expectedMatch = block.match(/【预期】([^【]*)/);
      const expected = expectedMatch ? expectedMatch[1]?.trim() || '' : '';
      
      steps.push({
        id: `step-${steps.length + 1}-${Date.now()}`,
        operation,
        expected
      });
    }
  }

  if (matched && steps.length > 0) return steps;

  // 方法2: 按行号分割（兼容旧格式）
  const lines = stepsStr.split('\n').filter(line => line.trim());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 匹配 "1. 操作内容" 或 "步骤1：操作内容"
    const stepMatch = line.match(/^(\d+)[.、:：]\s*(.+)$/);
    
    if (stepMatch) {
      steps.push({
        id: `step-${steps.length + 1}-${Date.now()}`,
        operation: stepMatch[2].trim(),
        expected: ''
      });
    }
  }

  // 如果没有匹配到任何步骤，将整个文本作为一个步骤
  if (steps.length === 0 && stepsStr.trim()) {
    steps.push({
      id: `step-1-${Date.now()}`,
      operation: stepsStr.trim(),
      expected: ''
    });
  }

  return steps;
}

/**
 * 将步骤数组转换为后端格式的字符串
 */
export function formatStepsToString(steps: TestStep[]): string {
  return steps
    .map((step, index) => {
      const num = index + 1;
      if (step.expected && step.expected.trim()) {
        return `${num}. 【操作】${step.operation}\n   【预期】${step.expected}`;
      } else {
        return `${num}. 【操作】${step.operation}`;
      }
    })
    .join('\n');
}

/**
 * 检查是否所有步骤的预期结果都相同
 */
function areAllExpectedResultsSame(steps: TestStep[]): boolean {
  if (steps.length === 0) return false;
  
  const firstExpected = steps[0].expected?.trim();
  if (!firstExpected) return false;
  
  return steps.every(step => step.expected?.trim() === firstExpected);
}

/**
 * 测试步骤编辑器组件
 */
export function TestStepsEditor({ steps, isEditing, onChange }: TestStepsEditorProps) {
  const [localSteps, setLocalSteps] = useState<TestStep[]>(steps);
  
  // 检查是否所有预期结果都相同
  const allExpectedSame = areAllExpectedResultsSame(localSteps);

  // 更新步骤
  const updateStep = (index: number, field: 'operation' | 'expected', value: string) => {
    const newSteps = [...localSteps];
    newSteps[index][field] = value;
    setLocalSteps(newSteps);
    onChange?.(newSteps);
  };

  // 添加步骤
  const addStep = () => {
    const newStep: TestStep = {
      id: `step-${localSteps.length + 1}-${Date.now()}`,
      operation: '',
      expected: ''
    };
    const newSteps = [...localSteps, newStep];
    setLocalSteps(newSteps);
    onChange?.(newSteps);
  };

  // 删除步骤
  const deleteStep = (index: number) => {
    const newSteps = localSteps.filter((_, i) => i !== index);
    setLocalSteps(newSteps);
    onChange?.(newSteps);
  };

  // 复制步骤
  const duplicateStep = (index: number) => {
    const stepToCopy = localSteps[index];
    const newStep: TestStep = {
      id: `step-${localSteps.length + 1}-${Date.now()}`,
      operation: stepToCopy.operation,
      expected: stepToCopy.expected
    };
    const newSteps = [...localSteps];
    newSteps.splice(index + 1, 0, newStep);
    setLocalSteps(newSteps);
    onChange?.(newSteps);
  };

  // 上移步骤
  const moveUp = (index: number) => {
    if (index === 0) return;
    const newSteps = [...localSteps];
    [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    setLocalSteps(newSteps);
    onChange?.(newSteps);
  };

  // 下移步骤
  const moveDown = (index: number) => {
    if (index === localSteps.length - 1) return;
    const newSteps = [...localSteps];
    [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
    setLocalSteps(newSteps);
    onChange?.(newSteps);
  };

  // 查看模式
  if (!isEditing) {
    return (
      <div className="space-y-2">
        {/* 如果所有预期结果相同，在顶部显示一次 */}
        {allExpectedSame && localSteps.length > 0 && localSteps[0].expected && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-3">
            <div className="text-xs text-green-700 font-semibold mb-1">统一预期结果</div>
            <div className="text-sm text-green-800">{localSteps[0].expected}</div>
          </div>
        )}

        {localSteps.map((step, index) => (
          <div
            key={step.id}
            className="bg-white rounded-lg px-4 py-3 border border-gray-200 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center gap-4">
              {/* 序号 */}
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold text-sm">
                  {index + 1}
                </div>
              </div>

              {/* 操作步骤 */}
              <div className={clsx("min-w-0", allExpectedSame ? "flex-1" : "flex-1")}>
                <div className="text-xs text-gray-500 mb-1">操作步骤</div>
                <div className="text-sm text-gray-900 whitespace-pre-wrap break-all">
                  {step.operation || '未填写'}
                </div>
              </div>

              {/* 预期结果 - 如果所有预期都相同，则不显示 */}
              {!allExpectedSame && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 mb-1">预期结果</div>
                  <div className="text-sm text-gray-700">
                    {step.expected || <span className="text-gray-400 italic">未填写</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {localSteps.length === 0 && (
          <div className="text-center py-8 text-gray-400">暂无测试步骤</div>
        )}
      </div>
    );
  }

  // 编辑模式
  return (
    <div className="space-y-2">
      {localSteps.map((step, index) => (
        <div
          key={step.id}
          className="bg-white rounded-lg px-4 py-3 border-2 border-gray-200 hover:border-blue-300 transition-colors"
        >
          <div className="flex items-start gap-4">
            {/* 序号 */}
            <div className="flex-shrink-0 pt-6">
              <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-semibold text-sm">
                {index + 1}
              </div>
            </div>

            {/* 操作步骤 */}
            <div className="flex-1 min-w-0">
              <label className="text-xs text-gray-600 mb-1 block">操作步骤</label>
              <TextArea
                value={step.operation}
                onChange={(e) => updateStep(index, 'operation', e.target.value)}
                placeholder="请输入操作步骤..."
                rows={2}
                className="w-full"
              />
            </div>

            {/* 预期结果 */}
            <div className="flex-1 min-w-0">
              <label className="text-xs text-gray-600 mb-1 block">预期结果</label>
              <TextArea
                value={step.expected}
                onChange={(e) => updateStep(index, 'expected', e.target.value)}
                placeholder="请输入预期结果..."
                rows={2}
                className="w-full"
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex-shrink-0 flex gap-1 pt-6">
              <Button
                type="text"
                size="small"
                icon={<ArrowUp size={14} />}
                disabled={index === 0}
                onClick={() => moveUp(index)}
                title="上移"
                className={clsx(
                  'hover:bg-blue-50',
                  index === 0 && 'opacity-30 cursor-not-allowed'
                )}
              />
              <Button
                type="text"
                size="small"
                icon={<ArrowDown size={14} />}
                disabled={index === localSteps.length - 1}
                onClick={() => moveDown(index)}
                title="下移"
                className={clsx(
                  'hover:bg-blue-50',
                  index === localSteps.length - 1 && 'opacity-30 cursor-not-allowed'
                )}
              />
              <Button
                type="text"
                size="small"
                icon={<Copy size={14} />}
                onClick={() => duplicateStep(index)}
                title="复制"
                className="hover:bg-green-50"
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<Trash2 size={14} />}
                onClick={() => deleteStep(index)}
                title="删除"
                className="hover:bg-red-50"
              />
            </div>
          </div>
        </div>
      ))}

      {/* 添加步骤按钮 */}
      <button
        onClick={addStep}
        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={16} />
        <span>添加步骤</span>
      </button>
    </div>
  );
}

