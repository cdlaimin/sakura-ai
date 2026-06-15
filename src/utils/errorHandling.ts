import { ValidationError } from '../services/settingsService';

// 错误类型枚举
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// 错误严重程度
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// 增强的错误信息接口
export interface EnhancedError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  code: string;
  field?: string;
  suggestions: string[];
  canRetry: boolean;
  canReset: boolean;
  timestamp: Date;
}

// 错误处理工具类
export class ErrorHandler {
  
  /**
   * 将验证错误转换为增强错误
   */
  static fromValidationErrors(validationErrors: ValidationError[]): EnhancedError[] {
    return validationErrors.map(error => ({
      type: ErrorType.VALIDATION_ERROR,
      severity: ErrorSeverity.MEDIUM,
      message: error.message,
      userMessage: ErrorHandler.getUserFriendlyMessage(error),
      code: error.code,
      field: error.field,
      suggestions: ErrorHandler.getValidationSuggestions(error),
      canRetry: true,
      canReset: true,
      timestamp: new Date()
    }));
  }

  /**
   * 处理API错误
   */
  static fromApiError(error: any): EnhancedError {
    const isNetworkError = error.message?.includes('fetch') || error.message?.includes('network');
    const isAuthError = error.message?.includes('401') || error.message?.includes('Unauthorized');
    const isRateLimitError = error.message?.includes('429') || error.message?.includes('rate limit');

    let severity = ErrorSeverity.MEDIUM;
    let suggestions: string[] = [];
    let userMessage = '连接测试失败';

    if (isAuthError) {
      severity = ErrorSeverity.HIGH;
      userMessage = 'API密钥无效或已过期';
      suggestions = [
        '请检查API密钥是否正确',
        '确认API密钥是否已过期',
        '访问OpenRouter网站重新生成密钥'
      ];
    } else if (isRateLimitError) {
      severity = ErrorSeverity.MEDIUM;
      userMessage = 'API调用频率超限';
      suggestions = [
        '请稍后再试',
        '考虑升级API套餐',
        '检查是否有其他应用在使用同一密钥'
      ];
    } else if (isNetworkError) {
      severity = ErrorSeverity.MEDIUM;
      userMessage = '网络连接失败';
      suggestions = [
        '检查网络连接',
        '确认防火墙设置',
        '稍后重试'
      ];
    } else {
      suggestions = [
        '检查配置是否正确',
        '稍后重试',
        '联系技术支持'
      ];
    }

    return {
      type: isNetworkError ? ErrorType.NETWORK_ERROR : ErrorType.API_ERROR,
      severity,
      message: error.message || '未知API错误',
      userMessage,
      code: ErrorHandler.extractErrorCode(error),
      suggestions,
      canRetry: true,
      canReset: false,
      timestamp: new Date()
    };
  }

  /**
   * 处理存储错误
   */
  static fromStorageError(error: any): EnhancedError {
    return {
      type: ErrorType.STORAGE_ERROR,
      severity: ErrorSeverity.HIGH,
      message: error.message || '存储操作失败',
      userMessage: '配置保存失败',
      code: 'STORAGE_FAILED',
      suggestions: [
        '检查浏览器存储空间',
        '清理浏览器缓存后重试',
        '尝试使用隐私模式'
      ],
      canRetry: true,
      canReset: true,
      timestamp: new Date()
    };
  }

  /**
   * 处理配置错误
   */
  static fromConfigError(error: any): EnhancedError {
    return {
      type: ErrorType.CONFIG_ERROR,
      severity: ErrorSeverity.HIGH,
      message: error.message || '配置错误',
      userMessage: '配置加载或更新失败',
      code: 'CONFIG_FAILED',
      suggestions: [
        '重置配置到默认值',
        '检查配置格式是否正确',
        '清除浏览器数据后重新配置'
      ],
      canRetry: true,
      canReset: true,
      timestamp: new Date()
    };
  }

  /**
   * 处理未知错误
   */
  static fromUnknownError(error: any): EnhancedError {
    return {
      type: ErrorType.UNKNOWN_ERROR,
      severity: ErrorSeverity.MEDIUM,
      message: error.message || '未知错误',
      userMessage: '操作失败，请重试',
      code: 'UNKNOWN_ERROR',
      suggestions: [
        '刷新页面后重试',
        '检查浏览器控制台错误信息',
        '联系技术支持'
      ],
      canRetry: true,
      canReset: false,
      timestamp: new Date()
    };
  }

  /**
   * 获取用户友好的错误信息
   */
  private static getUserFriendlyMessage(error: ValidationError): string {
    const fieldNames: Record<string, string> = {
      'selectedModelId': '模型选择',
      'apiKey': 'API密钥',
      'temperature': '温度参数',
      'maxTokens': '最大令牌数',
      'topP': 'Top P参数'
    };

    const fieldName = fieldNames[error.field] || error.field;
    
    switch (error.code) {
      case 'REQUIRED':
        return `${fieldName}不能为空`;
      case 'INVALID_FORMAT':
        return `${fieldName}格式不正确`;
      case 'OUT_OF_RANGE':
        return `${fieldName}超出有效范围`;
      case 'INVALID_MODEL':
        return '选择的模型不可用';
      default:
        return error.message;
    }
  }

  /**
   * 获取验证错误的建议
   */
  private static getValidationSuggestions(error: ValidationError): string[] {
    switch (error.field) {
      case 'selectedModelId':
        return [
          '请从下拉列表中选择一个可用的模型',
          '确认模型列表已正确加载'
        ];
      case 'apiKey':
        return [
          '请输入有效的OpenRouter API密钥',
          'API密钥应以"sk-"开头',
          '访问https://openrouter.ai获取API密钥'
        ];
      case 'temperature':
        return [
          '温度值应在0-2之间',
          '较低的值(0.1-0.3)适合精确任务',
          '较高的值(0.7-1.0)适合创造性任务'
        ];
      case 'maxTokens':
        return [
          'Max Tokens必须是大于0的整数',
          '较大的值会增加响应时间和成本',
          '实际可用上限取决于当前模型和API提供商'
        ];
      default:
        return ['请检查输入值是否正确'];
    }
  }

  /**
   * 提取错误代码
   */
  private static extractErrorCode(error: any): string {
    if (error.status) return `HTTP_${error.status}`;
    if (error.code) return error.code;
    if (error.message?.includes('401')) return 'UNAUTHORIZED';
    if (error.message?.includes('429')) return 'RATE_LIMIT';
    if (error.message?.includes('500')) return 'SERVER_ERROR';
    return 'UNKNOWN';
  }

  /**
   * 格式化错误信息用于显示
   */
  static formatErrorForDisplay(error: EnhancedError): {
    title: string;
    message: string;
    suggestions: string[];
    actions: Array<{ label: string; action: string; primary?: boolean }>;
  } {
    const actions: Array<{ label: string; action: string; primary?: boolean }> = [];
    
    if (error.canRetry) {
      actions.push({ label: '重试', action: 'retry', primary: true });
    }
    
    if (error.canReset) {
      actions.push({ label: '重置配置', action: 'reset' });
    }
    
    actions.push({ label: '取消', action: 'cancel' });

    return {
      title: ErrorHandler.getErrorTitle(error.type),
      message: error.userMessage,
      suggestions: error.suggestions,
      actions
    };
  }

  /**
   * 获取错误标题
   */
  private static getErrorTitle(type: ErrorType): string {
    switch (type) {
      case ErrorType.VALIDATION_ERROR:
        return '配置验证失败';
      case ErrorType.NETWORK_ERROR:
        return '网络连接错误';
      case ErrorType.API_ERROR:
        return 'API调用失败';
      case ErrorType.STORAGE_ERROR:
        return '存储操作失败';
      case ErrorType.CONFIG_ERROR:
        return '配置错误';
      default:
        return '操作失败';
    }
  }

  /**
   * 检查错误是否可以自动恢复
   */
  static canAutoRecover(error: EnhancedError): boolean {
    return error.canReset && error.severity !== ErrorSeverity.CRITICAL;
  }

  /**
   * 获取恢复建议
   */
  static getRecoveryActions(error: EnhancedError): Array<{
    label: string;
    action: () => Promise<void>;
    description: string;
  }> {
    const actions: Array<{ label: string; action: () => Promise<void>; description: string }> = [];

    if (error.canReset) {
      actions.push({
        label: '重置到默认配置',
        action: async () => {
          // 这里会在实际使用时注入重置逻辑
        },
        description: '将所有配置重置为默认值'
      });
    }

    if (error.canRetry) {
      actions.push({
        label: '重新尝试',
        action: async () => {
          // 这里会在实际使用时注入重试逻辑
        },
        description: '重新执行失败的操作'
      });
    }

    return actions;
  }
}

// 导出便捷函数
export const handleValidationErrors = ErrorHandler.fromValidationErrors;
export const handleApiError = ErrorHandler.fromApiError;
export const handleStorageError = ErrorHandler.fromStorageError;
export const handleConfigError = ErrorHandler.fromConfigError;
export const handleUnknownError = ErrorHandler.fromUnknownError;
