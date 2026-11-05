import { BaseBrainModule } from './baseBrainModule.js';

export class FrontalLobe extends BaseBrainModule {
  constructor() {
    super('FrontalLobe', 'Planning, decision routing, and module activation');
    this.systemPrompt = `You are the Frontal Lobe of a digital brain. Your role is PLANNING and DECISION ROUTING.
Given user input and context, decide which brain modules should process this request.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "plan": "summary of the plan",
  "primaryModules": ["array", "of", "module", "names"],
  "reasoning": "why these modules",
  "requiresLongTermMemory": true | false,
  "requiresSafetyCheck": true | false
}`;
  }

  async process(input, context) {
    this.log('Planning module activation', { input: input.substring(0, 50) });

    try {
      const plan = await this.queryJSON(input, context.getHistory());

      const nextModules = [];
      if (plan.requiresSafetyCheck) nextModules.push('Medulla');
      if (plan.requiresLongTermMemory) nextModules.push('Hippocampus');
      nextModules.push(...plan.primaryModules);

      return this.createOutput(
        `Planning: ${plan.plan}`,
        `Route to: ${nextModules.join(', ')}`,
        nextModules,
        plan
      );
    } catch (error) {
      this.error('Planning failed', { error: error.message });
      return this.createOutput(
        'Planning error',
        'Default routing',
        ['TemporalLobe', 'ParietalLobe'],
        { plan: 'Error in planning, using default flow' }
      );
    }
  }
}

export default new FrontalLobe();
