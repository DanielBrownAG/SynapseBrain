import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import logger from '../utils/logger.js';

class AzureOpenAIService {
  constructor() {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT_ID;

    if (!endpoint || !apiKey) {
      throw new Error('Missing Azure OpenAI credentials');
    }

    this.client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
    this.deploymentId = deploymentId;
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
  }

  async chat(systemPrompt, userMessage, conversationHistory = []) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      logger.debug(`Calling Azure OpenAI with deployment: ${this.deploymentId}`, {
        messageCount: messages.length
      });

      const response = await this.client.getChatCompletions(this.deploymentId, messages, {
        maxTokens: 2048,
        temperature: 0.7
      });

      const completionTokens = response.usage?.completionTokens || 0;
      const promptTokens = response.usage?.promptTokens || 0;

      return {
        content: response.choices[0]?.message?.content || '',
        tokenUsage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        }
      };
    } catch (error) {
      logger.error('Azure OpenAI call failed', { error: error.message });
      throw error;
    }
  }

  async chatStream(systemPrompt, userMessage, conversationHistory = []) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      logger.debug(`Streaming Azure OpenAI with deployment: ${this.deploymentId}`);

      const response = await this.client.getChatCompletions(this.deploymentId, messages, {
        maxTokens: 2048,
        temperature: 0.7
      });

      return response;
    } catch (error) {
      logger.error('Azure OpenAI streaming failed', { error: error.message });
      throw error;
    }
  }
}

export default new AzureOpenAIService();
