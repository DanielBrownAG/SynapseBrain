import { BaseBrainModule } from './baseBrainModule.js';

export class Cerebellum extends BaseBrainModule {
  constructor() {
    super('Cerebellum', 'Output refinement, clarity improvement, and grammar smoothing');
    this.systemPrompt = `You are the Cerebellum of a digital brain. Your role is OUTPUT REFINEMENT.
Take a response and improve its clarity, grammar, and coherence without changing meaning.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "refined": "the refined and improved text",
  "clarity_score": 0.0 to 1.0,
  "improvements": ["list", "of", "improvements"],
  "tone_adjusted": true | false
}`;
  }

  async process(input, context) {
    this.log('Refining output', { input: input.substring(0, 50) });

    try {
      const response = await this.queryLLM(input, context.getHistory());
      
      let parsed = response.content;
      if (parsed.includes('```json')) {
        parsed = parsed.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const refined = JSON.parse(parsed);

      return this.createOutput(
        `Improved clarity to ${(refined.clarity_score * 100).toFixed(0)}%`,
        `Applied ${refined.improvements.length} improvements`,
        [],
        refined
      );
    } catch (error) {
      this.error('Refinement failed', { error: error.message });
      return this.createOutput(
        'Refinement error',
        'Returning unrefined output',
        [],
        { refined: input }
      );
    }
  }
}

export default new Cerebellum();
