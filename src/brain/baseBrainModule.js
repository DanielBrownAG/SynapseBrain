import azureOpenAI from '../services/azureOpenAI.js';
import logger from '../utils/logger.js';
import { parseModuleOutput } from '../utils/moduleSchemas.js';

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
    const context = this.orchestrator?.context;
    let reservation;
    try {
      reservation = context?.reserveLLM(this.systemPrompt, userMessage, conversationHistory);
      logger.info(`${this.name} querying LLM`, { messageLength: userMessage.length });

      const response = await azureOpenAI.chat(
        this.systemPrompt,
        userMessage,
        conversationHistory,
        { signal: context?.signal, maxOutputTokens: reservation?.outputLimit }
      );

      context?.recordUsage(this.name, response.tokenUsage);
      context?.throwIfStopped();

      return response;
    } catch (error) {
      context?.moduleErrors.set(this.name, error.message);
      logger.error(`${this.name} LLM query failed`, { error: error.message });
      throw error;
    } finally {
      reservation?.release();
    }
  }

  async queryJSON(userMessage, history) {
    try {
      const response = await this.queryLLM(userMessage, history);
      return parseModuleOutput(this.name, response.content);
    } catch (error) {
      this.orchestrator?.context?.moduleErrors.set(this.name, error.message);
      throw error;
    }
  }

  async queryLLMStream(userMessage, context, systemPrompt = this.systemPrompt) {
    const reservation = context.reserveLLM(systemPrompt, userMessage, context.getHistory());
    try {
      const response = await azureOpenAI.chatStream(systemPrompt, userMessage, context.getHistory(), {
        onChunk: context.onChunk, signal: context.signal, maxOutputTokens: reservation.outputLimit
      });
      context.recordUsage(this.name, response.tokenUsage);
      context.throwIfStopped();
      if (!response.content.trim()) throw new Error('Model stream returned no answer');
      return response;
    } finally { reservation.release(); }
  }

  createOutput(reasoning, decision, nextModules = [], output = '') {
    const error = this.orchestrator?.context?.moduleErrors.get(this.name);
    return {
      status: error ? 'failed' : 'ok',
      ...(error ? { error } : {}),
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
