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

    if (context.onChunk) {
      // Stream the polished answer itself, never the internal JSON envelope.
      // Errors propagate: after partial output, a fallback would corrupt the answer.
      const response = await this.queryLLMStream(input, context,
        'You are the Cerebellum of a digital brain. Improve the clarity, grammar, and coherence of the supplied response without changing its meaning. Return only the refined response as plain text, with no JSON envelope or commentary.');
      return this.createOutput('Refined response streamed', 'Response ready', [], { refined: response.content });
    }

    try {
      const refined = await this.queryJSON(input, context.getHistory());

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
