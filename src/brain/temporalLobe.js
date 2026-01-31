import { BaseBrainModule } from './baseBrainModule.js';

export class TemporalLobe extends BaseBrainModule {
  constructor() {
    super('TemporalLobe', 'Language understanding, tone detection, and summarization');
    this.systemPrompt = `You are the Temporal Lobe of a digital brain. Your role is LANGUAGE UNDERSTANDING.
Analyze the user input for language patterns, tone, context, and meaning.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "tone": "formal | casual | urgent | frustrated | neutral",
  "language": "en | es | fr | de | other",
  "complexity": "simple | moderate | complex",
  "summary": "brief summary of what the user is asking",
  "hiddenIntents": ["array", "of", "implied", "intents"]
}`;
  }

  async process(input, context) {
    this.log('Analyzing language and tone', { input: input.substring(0, 50) });

    try {
      const response = await this.queryLLM(input, context.getHistory());
      
      let parsed = response.content;
      if (parsed.includes('```json')) {
        parsed = parsed.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const analysis = JSON.parse(parsed);

      return this.createOutput(
        `Detected tone: ${analysis.tone}, Complexity: ${analysis.complexity}`,
        `Language: ${analysis.language}, Hidden intents: ${analysis.hiddenIntents.join(', ')}`,
        [],
        analysis
      );
    } catch (error) {
      this.error('Language analysis failed', { error: error.message });
      return this.createOutput(
        'Analysis error',
        'Continuing with basic understanding',
        [],
        { tone: 'neutral', complexity: 'moderate' }
      );
    }
  }
}

export default new TemporalLobe();
