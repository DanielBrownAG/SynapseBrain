import { BaseBrainModule } from './baseBrainModule.js';

export class Medulla extends BaseBrainModule {
  constructor() {
    super('Medulla', 'Safety enforcement and hard guardrails');
    this.systemPrompt = `You are the Medulla of a digital brain - the SAFETY ENFORCEMENT LAYER.
Your role is to REJECT harmful, illegal, or unsafe content.
Analyze the user input and respond with ONLY a JSON object (no markdown, no extra text):
{
  "isSafe": true | false,
  "threatLevel": "none | low | medium | high | critical",
  "violations": ["array", "of", "violations"],
  "reasoning": "why safe or unsafe",
  "action": "allow | block | escalate"
}`;
  }

  async process(input, context) {
    this.log('Safety check initiated', { input: input.substring(0, 50) });

    try {
      const safety = await this.queryJSON(input, context.getHistory());

      return this.createOutput(
        `Threat level: ${safety.threatLevel}`,
        `Action: ${safety.action}`,
        safety.isSafe ? [] : ['Cerebrum'],
        safety
      );
    } catch (error) {
      this.error('Safety check failed', { error: error.message });
      // Fail safe - treat as unsafe
      return this.createOutput(
        'Safety check error',
        'Blocking due to safety check failure',
        [],
        { isSafe: false, threatLevel: 'high', action: 'block' }
      );
    }
  }
}

export default new Medulla();
