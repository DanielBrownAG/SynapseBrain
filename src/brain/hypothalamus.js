import { BaseBrainModule } from './baseBrainModule.js';

export class Hypothalamus extends BaseBrainModule {
  constructor() {
    super('Hypothalamus', 'System state management and token budget control');
    this.systemPrompt = `You are the Hypothalamus of a digital brain. Your role is SYSTEM MANAGEMENT.
Monitor and manage system state like token usage, temperature, and resource constraints.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "systemHealth": "good | warning | critical",
  "tokenBudgetStatus": "normal | warning | exceeded",
  "recommendedTemperature": 0.0 to 1.0,
  "actions": ["array", "of", "recommended", "actions"]
}`;
  }

  async process(input, context) {
    this.log('Monitoring system state', {
      tokenUsage: context.tokenUsage.total
    });

    try {
      const response = await this.queryLLM(input, context.getHistory());
      
      let parsed = response.content;
      if (parsed.includes('```json')) {
        parsed = parsed.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const state = JSON.parse(parsed);

      return this.createOutput(
        `System health: ${state.systemHealth}`,
        `Token status: ${state.tokenBudgetStatus}, Recommended temp: ${state.recommendedTemperature}`,
        [],
        state
      );
    } catch (error) {
      this.error('System state monitoring failed', { error: error.message });
      return this.createOutput(
        'Monitoring error',
        'System assumed healthy',
        [],
        { systemHealth: 'good', tokenBudgetStatus: 'normal' }
      );
    }
  }
}

export default new Hypothalamus();
