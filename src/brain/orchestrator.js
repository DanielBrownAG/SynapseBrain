import logger from '../utils/logger.js';
import sessionStore from '../services/sessionStore.js';
import { randomUUID } from 'node:crypto';
import { BrainContext } from '../utils/context.js';
import { AsyncLocalStorage } from 'node:async_hooks';

// Import all brain modules
import { Midbrain } from './midbrain.js';
import { FrontalLobe } from './frontalLobe.js';
import { TemporalLobe } from './temporalLobe.js';
import { ParietalLobe } from './parietalLobe.js';
import { OccipitalLobe } from './occipitalLobe.js';
import { Cerebellum } from './cerebellum.js';
import { Brainstem } from './brainstem.js';
import { Medulla } from './medulla.js';
import { Amygdala } from './amygdala.js';
import { Hippocampus } from './hippocampus.js';
import { Hypothalamus } from './hypothalamus.js';
import { LimbicSystem } from './limbicSystem.js';
import { Pons } from './pons.js';
import { Cerebrum } from './cerebrum.js';

export class BrainOrchestrator {
  constructor({ store = sessionStore, routingMode = process.env.SYNAPSE_ROUTING_MODE || 'adaptive' } = {}) {
    this.modules = new Map();
    this.registerAllModules();
    this.sessions = store;
    this.routingMode = routingMode;
    if (!['adaptive', 'all'].includes(routingMode)) throw new Error('SYNAPSE_ROUTING_MODE must be adaptive or all');
    this.requestContext = new AsyncLocalStorage();
  }

  get context() {
    return this.requestContext.getStore();
  }

  registerAllModules() {
    const modules = [
      new Midbrain(),
      new FrontalLobe(),
      new TemporalLobe(),
      new ParietalLobe(),
      new OccipitalLobe(),
      new Cerebellum(),
      new Brainstem(),
      new Medulla(),
      new Amygdala(),
      new Hippocampus(),
      new Hypothalamus(),
      new LimbicSystem(),
      new Pons(),
      new Cerebrum()
    ];

    modules.forEach(module => {
      this.modules.set(module.name, module);
      module.setOrchestrator(this);
    });

    logger.info(`Registered ${modules.length} brain modules`);
  }

  async callModule(moduleName, payload, callerName) {
    const module = this.modules.get(moduleName);
    if (!module) {
      logger.error(`Module not found: ${moduleName}`);
      throw new Error(`Module not found: ${moduleName}`);
    }

    logger.info(`${callerName} calling ${moduleName}`);
    this.context.throwIfStopped();
    const started = Date.now();
    const result = await module.process(payload, this.context);
    this.context.throwIfStopped();
    this.context.recordModuleResult(moduleName, result);

    // Log and broadcast
    const activity = {
      module: moduleName, sessionId: this.context.userId, requestId: this.context.requestId,
      timestamp: new Date().toISOString(), durationMs: Date.now() - started,
      status: result.status || 'ok', error: result.error,
      tokenUsage: this.context.moduleUsage.get(moduleName) || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      calledBy: callerName,
      input: typeof payload === 'string' ? payload.substring(0, 100) : JSON.stringify(payload).substring(0, 100),
      reasoning: result.reasoning,
      decision: result.decision,
      nextModules: result.nextModules
    };
    this.context.activities.push(activity);

    if (this.context.onActivity) this.context.onActivity(activity);

    return result;
  }

  async orchestrate(userInput, sessionId = 'default', options = {}) {
    return this.sessions.withLock(sessionId, async () => {
      options.signal?.throwIfAborted();
      const session = this.sessions.get(sessionId) || this.sessions.create(sessionId);
      const deadlineMs = Number(process.env.SYNAPSE_REQUEST_TIMEOUT_MS || 120000);
      const maxTokens = Number(process.env.SYNAPSE_REQUEST_MAX_TOKENS || 65536);
      if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || !Number.isInteger(maxTokens) || maxTokens < 1) {
        throw new Error('Invalid request deadline or token budget');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('Request deadline exceeded')), deadlineMs);
      const context = new BrainContext(sessionId, session.history.slice(-40));
      context.memory = structuredClone(session.memory);
      context.maxTokens = maxTokens;
      context.moduleUsage = new Map();
      context.abortController = controller;
      context.requestId = randomUUID();
      context.signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
      context.onChunk = options.onChunk;
      context.onActivity = options.onActivity;
      try {
        let result;
        try {
          result = await this.requestContext.run(context, () => this.processInput(userInput, sessionId));
          context.throwIfStopped();
        } catch (error) {
          session.activities = context.activities;
          session.totalTokens += context.tokenUsage.total;
          this.sessions.save(session);
          throw error;
        }
        if (result.success) {
          session.history.push({ role: 'user', content: userInput }, { role: 'assistant', content: result.response });
          session.history = session.history.slice(-200);
          session.memory = context.memory;
        }
        session.activities = context.activities;
        session.totalTokens += context.tokenUsage.total;
        this.sessions.save(session);
        return { ...result, sessionId };
      } finally { clearTimeout(timer); }
    });
  }

  async processInput(userInput, sessionId) {
    const context = this.context;
    const log = { startTime: new Date(), sessionId, requestId: context.requestId,
      moduleExecutionOrder: [], skippedModules: [], responses: {} };
    const run = async (name, input = userInput) => {
      const result = await this.callModule(name, input, 'Orchestrator');
      log.moduleExecutionOrder.push(name);
      log.responses[name] = result;
      return result;
    };
    const finish = (success, response) => {
      log.endTime = new Date();
      log.duration = log.endTime - log.startTime;
      return { success, response, activities: context.activities, orchestrationLog: log, tokenUsage: context.tokenUsage };
    };
    const block = async response => {
      await context.onChunk?.(response);
      return finish(false, response);
    };

    await run('Midbrain');
    const safety = await run('Medulla');
    if (safety.output?.isSafe !== true || ['block', 'escalate'].includes(safety.output?.action)) return block('I cannot process that request. It violates safety guidelines or the safety check could not be completed.');
    const plan = await run('FrontalLobe');
    await run('Amygdala');

    const optional = ['TemporalLobe', 'ParietalLobe', 'OccipitalLobe', 'LimbicSystem', 'Hippocampus', 'Pons', 'Hypothalamus'];
    let selected = optional;
    if (this.routingMode !== 'all' && plan.status !== 'failed' && Array.isArray(plan.output?.primaryModules)) {
      const names = new Set(plan.output.primaryModules);
      if (plan.output.requiresLongTermMemory) names.add('Hippocampus');
      selected = optional.filter(name => names.has(name));
    }
    log.skippedModules = optional.filter(name => !selected.includes(name));
    // A cancelled sibling must not continue after the session lock is released.
    const results = await Promise.allSettled(selected.map(name => run(name)));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    context.throwIfStopped();

    const synthesis = await run('Cerebrum');
    if (synthesis.status === 'failed') throw new Error(synthesis.error || 'Response synthesis failed');
    const draft = synthesis.output?.response;
    if (typeof draft !== 'string' || !draft.trim()) throw new Error('Synthesis returned no answer');
    const stability = await run('Brainstem', draft);
    if (stability.output?.isStable !== true) return block('The response could not pass the stability check. Please try again.');
    const refinement = await run('Cerebellum', draft);
    return finish(true, refinement.output?.refined || draft);
  }

  getModules() { return Array.from(this.modules.keys()); }

  async clearHistory(sessionId) { return this.sessions.clear(sessionId); }
}

export default new BrainOrchestrator();
