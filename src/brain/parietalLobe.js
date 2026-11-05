import { BaseBrainModule } from './baseBrainModule.js';

export class ParietalLobe extends BaseBrainModule {
  constructor() {
    super('ParietalLobe', 'Data interpretation and factual component extraction');
    this.systemPrompt = `You are the Parietal Lobe of a digital brain. Your role is DATA INTERPRETATION.
Extract and structure factual information from the user input.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "entities": ["identified", "entities"],
  "facts": ["extracted", "facts"],
  "dataTypes": ["numbers", "dates", "locations"],
  "ambiguities": ["potential", "unclear", "points"],
  "structuredData": {}
}`;
  }

  async process(input, context) {
    this.log('Extracting structured data', { input: input.substring(0, 50) });

    try {
      const extracted = await this.queryJSON(input, context.getHistory());

      return this.createOutput(
        `Identified entities: ${extracted.entities.join(', ')}`,
        `Extracted facts: ${extracted.facts.length} facts found`,
        [],
        extracted
      );
    } catch (error) {
      this.error('Data extraction failed', { error: error.message });
      return this.createOutput(
        'Extraction error',
        'No structured data extracted',
        [],
        { entities: [], facts: [], dataTypes: [] }
      );
    }
  }
}

export default new ParietalLobe();
