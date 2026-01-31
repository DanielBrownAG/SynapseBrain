import logger from '../utils/logger.js';
import activityTracker from '../utils/activityTracker.js';
import { BrainContext } from '../utils/context.js';

// Import all brain modules
import Midbrain from './midbrain.js';
import FrontalLobe from './frontalLobe.js';
import TemporalLobe from './temporalLobe.js';
import ParietalLobe from './parietalLobe.js';
import OccipitalLobe from './occipitalLobe.js';
import Cerebellum from './cerebellum.js';
import Brainstem from './brainstem.js';
import Medulla from './medulla.js';
import Amygdala from './amygdala.js';
import Hippocampus from './hippocampus.js';
import Hypothalamus from './hypothalamus.js';
import LimbicSystem from './limbicSystem.js';
import Pons from './pons.js';
import Cerebrum from './cerebrum.js';

export class BrainOrchestrator {
  constructor() {
    this.modules = new Map();
    this.registerAllModules();
    this.conversationHistory = [];
    this.socketIO = null;
  }

  registerAllModules() {
    const modules = [
      Midbrain,
      FrontalLobe,
      TemporalLobe,
      ParietalLobe,
      OccipitalLobe,
      Cerebellum,
      Brainstem,
      Medulla,
      Amygdala,
      Hippocampus,
      Hypothalamus,
      LimbicSystem,
      Pons,
      Cerebrum
    ];

    modules.forEach(module => {
      this.modules.set(module.name, module);
      module.setOrchestrator(this);
    });

    logger.info(`Registered ${modules.length} brain modules`);
  }

  setSocketIO(io) {
    this.socketIO = io;
  }

  broadcastActivity(activity) {
    if (this.socketIO) {
      this.socketIO.emit('brain-activity', activity);
    }
  }

  async callModule(moduleName, payload, callerName) {
    const module = this.modules.get(moduleName);
    if (!module) {
      logger.error(`Module not found: ${moduleName}`);
      throw new Error(`Module not found: ${moduleName}`);
    }

    logger.info(`${callerName} calling ${moduleName}`);
    const result = await module.process(payload, this.context);

    // Log and broadcast
    const activity = activityTracker.logActivity(moduleName, {
      calledBy: callerName,
      input: typeof payload === 'string' ? payload.substring(0, 100) : JSON.stringify(payload).substring(0, 100),
      reasoning: result.reasoning,
      decision: result.decision,
      nextModules: result.nextModules
    });

    this.broadcastActivity(activity);
    return result;
  }

  async orchestrate(userInput, userId = 'default') {
    logger.info(`[ORCHESTRATION] Processing input from user: ${userId}`);
    
    this.context = new BrainContext(userId, this.conversationHistory);
    const orchestrationLog = {
      startTime: new Date(),
      userInput: userInput.substring(0, 100),
      sessionId: activityTracker.getSessionId(),
      moduleExecutionOrder: [],
      responses: {}
    };

    try {
      // Step 1: Midbrain - Quick intent classification
      logger.info('[ORCHESTRATION] Step 1: Midbrain classification');
      const midbrainResult = await this.callModule('Midbrain', userInput, 'Orchestrator');
      orchestrationLog.moduleExecutionOrder.push('Midbrain');
      orchestrationLog.responses.midbrain = midbrainResult;

      // Step 2: Safety check via Medulla
      logger.info('[ORCHESTRATION] Step 2: Medulla safety check');
      const medullaResult = await this.callModule('Medulla', userInput, 'Orchestrator');
      orchestrationLog.moduleExecutionOrder.push('Medulla');
      orchestrationLog.responses.medulla = medullaResult;

      if (medullaResult.output?.isSafe === false) {
        logger.warn('[ORCHESTRATION] Safety check failed, blocking response');
        return {
          success: false,
          response: 'I cannot process that request. It violates safety guidelines.',
          activities: activityTracker.getActivities(),
          orchestrationLog
        };
      }

      // Step 3: Frontal Lobe - Planning
      logger.info('[ORCHESTRATION] Step 3: Frontal Lobe planning');
      const frontalResult = await this.callModule('FrontalLobe', userInput, 'Orchestrator');
      orchestrationLog.moduleExecutionOrder.push('FrontalLobe');
      orchestrationLog.responses.frontal = frontalResult;

      // Step 4: Parallel processing of specialized modules
      logger.info('[ORCHESTRATION] Step 4: Parallel module processing');
      const parallelModules = [
        { name: 'TemporalLobe', payload: userInput },
        { name: 'ParietalLobe', payload: userInput },
        { name: 'OccipitalLobe', payload: userInput },
        { name: 'LimbicSystem', payload: userInput },
        { name: 'Hippocampus', payload: userInput }
      ];

      const parallelResults = await Promise.all(
        parallelModules.map(m => this.callModule(m.name, m.payload, 'Orchestrator'))
      );

      parallelModules.forEach((m, idx) => {
        orchestrationLog.moduleExecutionOrder.push(m.name);
        orchestrationLog.responses[m.name.toLowerCase()] = parallelResults[idx];
      });

      // Step 5: Amygdala - Threat detection
      logger.info('[ORCHESTRATION] Step 5: Amygdala threat detection');
      const amygdalaResult = await this.callModule('Amygdala', userInput, 'Orchestrator');
      orchestrationLog.moduleExecutionOrder.push('Amygdala');
      orchestrationLog.responses.amygdala = amygdalaResult;

      // Step 6: Pons - Dialogue management
      logger.info('[ORCHESTRATION] Step 6: Pons dialogue management');
      const ponsResult = await this.callModule('Pons', userInput, 'Orchestrator');
      orchestrationLog.moduleExecutionOrder.push('Pons');
      orchestrationLog.responses.pons = ponsResult;

      // Step 7: Hypothalamus - System state
      logger.info('[ORCHESTRATION] Step 7: Hypothalamus system monitoring');
      const hypothalamusResult = await this.callModule('Hypothalamus', userInput, 'Orchestrator');
      orchestrationLog.moduleExecutionOrder.push('Hypothalamus');
      orchestrationLog.responses.hypothalamus = hypothalamusResult;

      // Step 8: Cerebrum - Final synthesis
      logger.info('[ORCHESTRATION] Step 8: Cerebrum final response generation');
      const cerebrumResult = await this.callModule('Cerebrum', userInput, 'Orchestrator');
      orchestrationLog.moduleExecutionOrder.push('Cerebrum');
      orchestrationLog.responses.cerebrum = cerebrumResult;

      // Step 9: Cerebellum - Output refinement
      logger.info('[ORCHESTRATION] Step 9: Cerebellum refinement');
      const refinementResult = await this.callModule(
        'Cerebellum',
        cerebrumResult.output?.response || 'Response',
        'Orchestrator'
      );
      orchestrationLog.moduleExecutionOrder.push('Cerebellum');
      orchestrationLog.responses.cerebellum = refinementResult;

      // Step 10: Brainstem - Final stability check
      logger.info('[ORCHESTRATION] Step 10: Brainstem final stability check');
      const brainstemResult = await this.callModule('Brainstem', userInput, 'Orchestrator');
      orchestrationLog.moduleExecutionOrder.push('Brainstem');
      orchestrationLog.responses.brainstem = brainstemResult;

      if (!brainstemResult.output?.isStable) {
        logger.warn('[ORCHESTRATION] System instability detected');
      }

      // Update conversation history
      this.conversationHistory.push({
        role: 'user',
        content: userInput
      });

      const finalResponse = refinementResult.output?.refined || cerebrumResult.output?.response;
      this.conversationHistory.push({
        role: 'assistant',
        content: finalResponse
      });

      orchestrationLog.endTime = new Date();
      orchestrationLog.duration = orchestrationLog.endTime - orchestrationLog.startTime;

      logger.info(`[ORCHESTRATION] Complete in ${orchestrationLog.duration}ms`);

      return {
        success: true,
        response: finalResponse,
        activities: activityTracker.getActivities(),
        orchestrationLog,
        tokenUsage: this.context.tokenUsage
      };
    } catch (error) {
      logger.error('[ORCHESTRATION] Fatal error', { error: error.message });
      return {
        success: false,
        response: 'An unexpected error occurred during processing.',
        error: error.message,
        activities: activityTracker.getActivities(),
        orchestrationLog
      };
    }
  }

  getModules() {
    return Array.from(this.modules.keys());
  }

  clearHistory() {
    this.conversationHistory = [];
    activityTracker.clearActivities();
    logger.info('Conversation history and activities cleared');
  }
}

export default new BrainOrchestrator();
