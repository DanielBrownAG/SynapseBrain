import azureOpenAI from '../services/azureOpenAI.js';
import logger from '../utils/logger.js';

export class BaseBrainModule {
  constructor(name, responsibility) {
    this.name = name;
    this.responsibility = responsibility;
    this.systemPrompt = '';
    this.orchestrator = null;
  }

  setOrchestrator(orchestrator) {
    this.orchestrator = orchestrator;
  }

  async process(input, context) {
    throw new Error('process() must be implemented by subclass');
  }

  async callOtherModule(moduleName, payload) {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not set');
    }
    return await this.orchestrator.callModule(moduleName, payload, this.name);
  }

  async queryLLM(userMessage, conversationHistory = []) {
    try {
      logger.info(`${this.name} querying LLM`, { messageLength: userMessage.length });

      const response = await azureOpenAI.chat(
        this.systemPrompt,
        userMessage,
        conversationHistory
      );

      return response;
    } catch (error) {
      logger.error(`${this.name} LLM query failed`, { error: error.message });
      throw error;
    }
  }

  createOutput(reasoning, decision, nextModules = [], output = '') {
    return {
      module: this.name,
      responsibility: this.responsibility,
      reasoning,
      decision,
      nextModules,
      output,
      timestamp: new Date().toISOString()
    };
  }

  log(message, meta = {}) {
    logger.info(`[${this.name}] ${message}`, meta);
  }

  debug(message, meta = {}) {
    logger.debug(`[${this.name}] ${message}`, meta);
  }

  error(message, meta = {}) {
    logger.error(`[${this.name}] ${message}`, meta);
  }
}
