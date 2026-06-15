/**
 * 文件上传配置
 * 统一管理前端文件上传的限制参数
 * 🔥 确保与后端配置保持一致
 */

// 文件大小限制
export const UPLOAD_CONFIG = {
  // 纯文本类文件（html/js/md/txt）最大大小（字节）：内容几乎原样进入 AI，控制在较小范围
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  // 容器/二进制格式（docx/doc/pdf/zip）最大大小（字节）：本地解析后仅提取“文本”送 AI，
  // 真正的瓶颈是提取后的文本长度（已有分片机制兜底），因此原始文件可放宽。
  MAX_CONTAINER_FILE_SIZE: 100 * 1024 * 1024, // 100MB

  // 最大文件数量
  MAX_FILES: 50,
  
  // 支持的文件类型
  SUPPORTED_TYPES: {
    HTML: ['.html', '.htm'],
    JAVASCRIPT: ['.js'],
    PDF: ['.pdf'],
    WORD: ['.doc', '.docx'],
    MARKDOWN: ['.md', '.markdown'],
    TEXT: ['.txt'],
    ZIP: ['.zip']
  }
} as const;

// 本地解析为“文本”后才送 AI 的容器/二进制格式（适用更大的体积上限）
export const CONTAINER_EXTENSIONS = ['.docx', '.doc', '.pdf', '.zip'] as const;

// 辅助函数：判断是否为容器/二进制格式
export const isContainerFormat = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return CONTAINER_EXTENSIONS.some(ext => lower.endsWith(ext));
};

// 辅助函数：按文件名返回对应的大小上限（容器格式放宽，其余沿用文本上限）
export const getMaxFileSizeForName = (filename: string): number => {
  return isContainerFormat(filename)
    ? UPLOAD_CONFIG.MAX_CONTAINER_FILE_SIZE
    : UPLOAD_CONFIG.MAX_FILE_SIZE;
};

// 辅助函数：获取所有支持的扩展名
export const getAllSupportedExtensions = (): string[] => {
  return Object.values(UPLOAD_CONFIG.SUPPORTED_TYPES).flat();
};

// 辅助函数：检查文件扩展名是否支持
export const isSupportedFileType = (filename: string): boolean => {
  const ext = filename.toLowerCase().split('.').pop();
  if (!ext) return false;
  const allExtensions = getAllSupportedExtensions();
  return allExtensions.some(supported => supported === `.${ext}`);
};

// 辅助函数：格式化文件大小显示
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

// 导出便捷常量
export const MAX_FILE_SIZE_MB = UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024);
export const MAX_FILES = UPLOAD_CONFIG.MAX_FILES;
export const MAX_FILE_SIZE = UPLOAD_CONFIG.MAX_FILE_SIZE;
export const MAX_CONTAINER_FILE_SIZE = UPLOAD_CONFIG.MAX_CONTAINER_FILE_SIZE;
export const MAX_CONTAINER_FILE_SIZE_MB = UPLOAD_CONFIG.MAX_CONTAINER_FILE_SIZE / (1024 * 1024);

