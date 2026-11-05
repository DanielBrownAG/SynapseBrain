import { BaseBrainModule } from './baseBrainModule.js';

export class LimbicSystem extends BaseBrainModule {
  constructor() {
    super('LimbicSystem', 'Emotional interpretation and sentiment analysis');
    this.systemPrompt = `You are the Limbic System of a digital brain. Your role is EMOTIONAL ANALYSIS.
Analyze emotional content, sentiment, and provide empathetic response guidance.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "sentiment": "positive | neutral | negative",
  "emotionalDensity": 0.0 to 1.0,
  "empathyRequired": true | false,
  "emotionalTheme": "joy | sadness | frustration | excitement | concern",
  "recommendedTone": "supportive | professional | casual | urgent"
}`;
  }

  async process(input, context) {
    this.log('Analyzing emotions and sentiment', { input: input.substring(0, 50) });

    try {
      const emotional = await this.queryJSON(input, context.getHistory());

      return this.createOutput(
        `Sentiment: ${emotional.sentiment}, Density: ${(emotional.emotionalDensity * 100).toFixed(0)}%`,
        `Theme: ${emotional.emotionalTheme}, Empathy needed: ${emotional.empathyRequired}`,
        [],
        emotional
      );
    } catch (error) {
      this.error('Emotional analysis failed', { error: error.message });
      return this.createOutput(
        'Analysis error',
        'Proceeding with neutral tone',
        [],
        { sentiment: 'neutral', emotionalDensity: 0, recommendedTone: 'professional' }
      );
    }
  }
}

export default new LimbicSystem();
