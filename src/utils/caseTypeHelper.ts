/**
 * 测试用例类型辅助工具
 */

export type CaseType = 
  | 'SMOKE'       // 冒烟用例
  | 'FULL'        // 全量用例
  | 'ABNORMAL'    // 异常用例
  | 'BOUNDARY'    // 边界用例
  | 'PERFORMANCE' // 性能用例
  | 'SECURITY'    // 安全用例
  | 'USABILITY'   // 可用性用例
  | 'COMPATIBILITY' // 兼容性用例
  | 'RELIABILITY';  // 可靠性用例

export interface CaseTypeInfo {
  label: string;
  emoji: string;
  color: string;      // 文字颜色（hex）
  bgColor: string;    // 背景颜色（hex）
  tailwindBg: string; // Tailwind 背景类
  tailwindText: string; // Tailwind 文字类
  tailwindBorder: string; // Tailwind 边框类
}

/**
 * 用例类型配置映射
 */
const CASE_TYPE_MAP: Record<CaseType, CaseTypeInfo> = {
  SMOKE: {
    label: '冒烟',
    emoji: '🔥',
    color: '#c05621',
    bgColor: '#feebc8',
    tailwindBg: 'bg-orange-100',
    tailwindText: 'text-orange-700',
    tailwindBorder: 'border-orange-200'
  },
  FULL: {
    label: '全量',
    emoji: '📋',
    color: '#2b6cb0',
    bgColor: '#bee3f8',
    tailwindBg: 'bg-blue-100',
    tailwindText: 'text-blue-700',
    tailwindBorder: 'border-blue-200'
  },
  ABNORMAL: {
    label: '异常',
    emoji: '⚠️',
    color: '#c53030',
    bgColor: '#fed7d7',
    tailwindBg: 'bg-red-100',
    tailwindText: 'text-red-700',
    tailwindBorder: 'border-red-200'
  },
  BOUNDARY: {
    label: '边界',
    emoji: '📏',
    color: '#6b46c1',
    bgColor: '#e9d8fd',
    tailwindBg: 'bg-purple-100',
    tailwindText: 'text-purple-700',
    tailwindBorder: 'border-purple-200'
  },
  PERFORMANCE: {
    label: '性能',
    emoji: '⚡',
    color: '#d69e2e',
    bgColor: '#fef5e7',
    tailwindBg: 'bg-yellow-100',
    tailwindText: 'text-yellow-700',
    tailwindBorder: 'border-yellow-200'
  },
  SECURITY: {
    label: '安全',
    emoji: '🔒',
    color: '#4a5568',
    bgColor: '#e2e8f0',
    tailwindBg: 'bg-gray-100',
    tailwindText: 'text-gray-700',
    tailwindBorder: 'border-gray-200'
  },
  USABILITY: {
    label: '可用性',
    emoji: '👤',
    color: '#2f855a',
    bgColor: '#c6f6d5',
    tailwindBg: 'bg-green-100',
    tailwindText: 'text-green-700',
    tailwindBorder: 'border-green-200'
  },
  COMPATIBILITY: {
    label: '兼容性',
    emoji: '🔄',
    color: '#4c51bf',
    bgColor: '#e0e7ff',
    tailwindBg: 'bg-indigo-100',
    tailwindText: 'text-indigo-700',
    tailwindBorder: 'border-indigo-200'
  },
  RELIABILITY: {
    label: '可靠性',
    emoji: '💪',
    color: '#2c7a7b',
    bgColor: '#b2f5ea',
    tailwindBg: 'bg-teal-100',
    tailwindText: 'text-teal-700',
    tailwindBorder: 'border-teal-200'
  }
};

/**
 * 获取用例类型的显示信息
 * @param caseType 用例类型
 * @returns 用例类型信息
 */
export const getCaseTypeInfo = (caseType?: string | null): CaseTypeInfo => {
  const type = (caseType || 'FULL') as CaseType;
  return CASE_TYPE_MAP[type] || CASE_TYPE_MAP.FULL;
};

/**
 * 获取用例类型标签（带 emoji）
 * @param caseType 用例类型
 * @returns 显示标签
 */
export const getCaseTypeLabel = (caseType?: string | null): string => {
  const info = getCaseTypeInfo(caseType);
  return `${info.emoji} ${info.label}`;
};

/**
 * 获取所有用例类型列表
 * @returns 用例类型列表
 */
export const getAllCaseTypes = (): Array<{ value: CaseType; label: string }> => {
  return Object.entries(CASE_TYPE_MAP).map(([value, info]) => ({
    value: value as CaseType,
    label: `${info.emoji} ${info.label}`
  }));
};

/** 用例类型排序权重（数值越小越靠前，与 TestCases 筛选一致） */
export const CASE_TYPE_SORT_ORDER: Record<CaseType, number> = {
  SMOKE: 0,
  FULL: 1,
  BOUNDARY: 2,
  ABNORMAL: 3,
  PERFORMANCE: 4,
  SECURITY: 5,
  USABILITY: 6,
  COMPATIBILITY: 7,
  RELIABILITY: 8,
};

/**
 * 获取用例类型排序权重
 */
export const getCaseTypeSortOrder = (caseType?: string | null): number => {
  if (!caseType) return CASE_TYPE_SORT_ORDER.FULL;
  return CASE_TYPE_SORT_ORDER[caseType as CaseType] ?? 99;
};

