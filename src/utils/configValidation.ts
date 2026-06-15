import { LLMSettings, ValidationResult, ValidationError } from '../services/settingsService';
import { modelRegistry } from '../services/modelRegistry';

// 配置验证工具类
export class ConfigValidation {
  
  // 验证API密钥格式
  public static validateApiKey(apiKey: string): ValidationError | null {
    if (!apiKey || apiKey.trim() === '') {
      return {
        field: 'apiKey',
        message: 'API密钥不能为空',
        code: 'REQUIRED'
      };
    }

    if (!apiKey.startsWith('sk-')) {
      return {
        field: 'apiKey',
        message: 'API密钥必须以 "sk-" 开头',
        code: 'INVALID_FORMAT'
      };
    }

    if (apiKey.length < 20) {
      return {
        field: 'apiKey',
        message: 'API密钥长度不足',
        code: 'INVALID_LENGTH'
      };
    }

    return null;
  }

  // 验证温度参数
  public static validateTemperature(temperature: number): ValidationError | null {
    if (temperature < 0 || temperature > 2) {
      return {
        field: 'temperature',
        message: 'Temperature必须在0-2之间',
        code: 'OUT_OF_RANGE'
      };
    }
    return null;
  }

  // 验证最大令牌数
  public static validateMaxTokens(maxTokens: number): ValidationError | null {
    if (!Number.isInteger(maxTokens) || maxTokens < 1) {
      return {
        field: 'maxTokens',
        message: 'Max Tokens必须是大于0的整数',
        code: 'INVALID_VALUE'
      };
    }

    return null;
  }

  // 验证Top P参数
  public static validateTopP(topP: number): ValidationError | null {
    if (topP < 0 || topP > 1) {
      return {
        field: 'topP',
        message: 'Top P必须在0-1之间',
        code: 'OUT_OF_RANGE'
      };
    }
    return null;
  }

  // 验证模型ID
  public static validateModelId(modelId: string): ValidationError | null {
    if (!modelId || modelId.trim() === '') {
      return {
        field: 'selectedModelId',
        message: '请选择一个模型',
        code: 'REQUIRED'
      };
    }

    if (!modelRegistry.isValidModelId(modelId)) {
      return {
        field: 'selectedModelId',
        message: '选择的模型无效',
        code: 'INVALID_MODEL'
      };
    }

    return null;
  }

  // 综合验证LLM设置
  public static validateLLMSettings(settings: LLMSettings): ValidationResult {
    const errors: ValidationError[] = [];

    // 验证模型ID
    const modelError = this.validateModelId(settings.selectedModelId);
    if (modelError) errors.push(modelError);

    // 验证API密钥
    const apiKeyError = this.validateApiKey(settings.apiKey);
    if (apiKeyError) errors.push(apiKeyError);

    // 验证自定义配置
    if (settings.customConfig) {
      const { temperature, maxTokens, topP } = settings.customConfig;

      if (temperature !== undefined) {
        const tempError = this.validateTemperature(temperature);
        if (tempError) errors.push(tempError);
      }

      if (maxTokens !== undefined) {
        const tokensError = this.validateMaxTokens(maxTokens);
        if (tokensError) errors.push(tokensError);
      }

      if (topP !== undefined) {
        const topPError = this.validateTopP(topP);
        if (topPError) errors.push(topPError);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 获取字段的友好名称
  public static getFieldDisplayName(field: string): string {
    const fieldNames: Record<string, string> = {
      'selectedModelId': '模型选择',
      'apiKey': 'API密钥',
      'temperature': '温度参数',
      'maxTokens': '最大令牌数',
      'topP': 'Top P参数'
    };

    return fieldNames[field] || field;
  }

  // 格式化错误消息
  public static formatErrorMessage(error: ValidationError): string {
    const fieldName = this.getFieldDisplayName(error.field);
    return `${fieldName}: ${error.message}`;
  }

  // 格式化所有错误消息
  public static formatAllErrors(errors: ValidationError[]): string[] {
    return errors.map(error => this.formatErrorMessage(error));
  }
}

// 导出便捷函数
export const validateLLMSettings = ConfigValidation.validateLLMSettings;
export const formatErrorMessages = ConfigValidation.formatAllErrors;
