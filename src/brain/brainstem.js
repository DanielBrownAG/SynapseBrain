import { BaseBrainModule } from './baseBrainModule.js';

export class Brainstem extends BaseBrainModule {
  constructor() {
    super('Brainstem', 'System stability assurance and unsafe output prevention');
    this.systemPrompt = `You are the Brainstem of a digital brain - the stability layer.
Your role is to ensure system stability and prevent unsafe outputs.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "isStable": true | false,
  "issues": ["array", "of", "issues"],
  "requiresReroute": true | false,
  "fallbackSuggestion": "suggested fallback action"
}`;
  }

  async process(input, context) {
    this.log('Stability check', { input: input.substring(0, 50) });

    try {
      const response = await this.queryLLM(input, context.getHistory());
      
      let parsed = response.content;
      if (parsed.includes('```json')) {
        parsed = parsed.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const stability = JSON.parse(parsed);

      return this.createOutput(
        `Stability: ${stability.isStable ? 'Stable' : 'Unstable'}`,
        `Issues: ${stability.issues.length}, Reroute: ${stability.requiresReroute}`,
        stability.requiresReroute ? ['Medulla'] : [],
        stability
      );
    } catch (error) {
      this.error('Stability check failed', { error: error.message });
      return this.createOutput(
        'Stability check error',
        'Assuming stable',
        [],
        { isStable: true, issues: [] }
      );
    }
  }
}

export default new Brainstem();
