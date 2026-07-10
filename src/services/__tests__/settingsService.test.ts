import { SettingsService, settingsService, LLMSettings } from '../settingsService';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    service = SettingsService.getInstance();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    localStorageMock.clear.mockClear();
  });

  describe('getInstance', () => {
    it('should return the same instance (singleton)', () => {
      const instance1 = SettingsService.getInstance();
      const instance2 = SettingsService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should be the same as exported instance', () => {
      expect(service).toBe(settingsService);
    });
  });

  describe('getLLMSettings', () => {
    it('should return default settings when localStorage is empty', async () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      const settings = await service.getLLMSettings();
      
      expect(settings.selectedModelId).toBe('gpt-4o');
      expect(settings.apiKey).toBe('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');
      expect(settings.customConfig).toEqual({
        temperature: 0.3,
        maxTokens: 1500
      });
    });

    it('should return stored settings when available', async () => {
      const storedSettings = {
        llm: {
          selectedModelId: 'deepseek-chat-v3',
          apiKey: 'sk-test-key',
          baseUrl: 'https://api.deepseek.com/v1',
          customConfig: {
            temperature: 0.5,
            maxTokens: 1000
          }
        },
        system: {
          timeout: 300,
          maxConcurrency: 10,
          logRetentionDays: 90
        }
      };
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify(storedSettings));
      
      const settings = await service.getLLMSettings();
      
      expect(settings.selectedModelId).toBe('deepseek-chat-v3');
      expect(settings.apiKey).toBe('sk-test-key');
      expect(settings.customConfig?.temperature).toBe(0.5);
    });

    it('should return defaults when stored data is corrupted', async () => {
      localStorageMock.getItem.mockReturnValue('invalid-json');
      
      const settings = await service.getLLMSettings();
      
      expect(settings.selectedModelId).toBe('gpt-4o');
    });
  });

  describe('saveLLMSettings', () => {
    it('should save valid settings to localStorage', async () => {
      const validSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-valid-api-key',
        customConfig: {
          temperature: 0.3,
          maxTokens: 1500
        }
      };

      localStorageMock.getItem.mockReturnValue(null); // No existing settings
      
      await service.saveLLMSettings(validSettings);
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'Sakura AI_settings',
        expect.stringContaining('"selectedModelId":"gpt-4o"')
      );
    });

    it('should throw error for invalid settings', async () => {
      const invalidSettings: LLMSettings = {
        selectedModelId: 'invalid-model',
        apiKey: '',
        customConfig: {
          temperature: 5, // Invalid temperature
          maxTokens: -1   // Invalid maxTokens
        }
      };

      await expect(service.saveLLMSettings(invalidSettings)).rejects.toThrow();
    });
  });

  describe('validateLLMSettings', () => {
    it('should validate correct settings', async () => {
      const validSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-valid-api-key-12345',
        customConfig: {
          temperature: 0.3,
          maxTokens: 1500
        }
      };

      const result = await service.validateLLMSettings(validSettings);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid model id', async () => {
      const invalidSettings: LLMSettings = {
        selectedModelId: 'invalid-model',
        apiKey: 'sk-valid-api-key',
      };

      const result = await service.validateLLMSettings(invalidSettings);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'selectedModelId',
          code: 'INVALID_MODEL'
        })
      );
    });

    it('should return errors for invalid API key', async () => {
      const invalidSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'invalid-key',
      };

      const result = await service.validateLLMSettings(invalidSettings);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'apiKey',
          code: 'INVALID_FORMAT'
        })
      );
    });

    it('should return errors for invalid temperature', async () => {
      const invalidSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-valid-api-key',
        customConfig: {
          temperature: 5 // Invalid: > 2
        }
      };

      const result = await service.validateLLMSettings(invalidSettings);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'temperature',
          code: 'OUT_OF_RANGE'
        })
      );
    });

    it('should allow maxTokens above 8000', async () => {
      const validSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-valid-api-key',
        customConfig: {
          maxTokens: 32768
        }
      };

      const result = await service.validateLLMSettings(validSettings);
      
      expect(result.isValid).toBe(true);
    });
  });

  describe('resetToDefaults', () => {
    it('should reset settings to defaults', async () => {
      await service.resetToDefaults();
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'Sakura AI_settings',
        expect.stringContaining('"selectedModelId":"gpt-4o"')
      );
    });
  });

  describe('getSettings', () => {
    it('should return complete settings structure', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      const settings = service.getSettings();
      
      expect(settings).toHaveProperty('llm');
      expect(settings).toHaveProperty('system');
      expect(settings.llm.selectedModelId).toBe('gpt-4o');
      expect(settings.system.timeout).toBe(300);
    });
  });
});
