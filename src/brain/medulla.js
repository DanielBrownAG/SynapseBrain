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
      const response = await this.queryLLM(input, context.getHistory());
      
      let parsed = response.content;
      if (parsed.includes('```json')) {
        parsed = parsed.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const safety = JSON.parse(parsed);

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
