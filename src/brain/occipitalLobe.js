import { BaseBrainModule } from './baseBrainModule.js';

export class OccipitalLobe extends BaseBrainModule {
  constructor() {
    super('OccipitalLobe', 'Visual description interpretation and pattern recognition');
    this.systemPrompt = `You are the Occipital Lobe of a digital brain. Your role is PATTERN RECOGNITION.
Identify patterns, visual descriptions, and recognize structured patterns in the input.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "patterns": ["identified", "patterns"],
  "visualDescription": "description of visual elements",
  "relationships": ["identified", "relationships"],
  "anomalies": ["unusual", "patterns"],
  "confidence": 0.0 to 1.0
}`;
  }

  async process(input, context) {
    this.log('Recognizing patterns', { input: input.substring(0, 50) });

    try {
      const response = await this.queryLLM(input, context.getHistory());
      
      let parsed = response.content;
      if (parsed.includes('```json')) {
        parsed = parsed.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const patterns = JSON.parse(parsed);

      return this.createOutput(
        `Identified ${patterns.patterns.length} patterns`,
        `Confidence: ${(patterns.confidence * 100).toFixed(0)}%`,
        [],
        patterns
      );
    } catch (error) {
      this.error('Pattern recognition failed', { error: error.message });
      return this.createOutput(
        'Recognition error',
        'No patterns recognized',
        [],
        { patterns: [], confidence: 0 }
      );
    }
  }
}

export default new OccipitalLobe();
