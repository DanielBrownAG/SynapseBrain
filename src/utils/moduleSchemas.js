import Ajv from 'ajv';

const text = { type: 'string' };
const bool = { type: 'boolean' };
const list = { type: 'array', items: text };
const score = { type: 'number', minimum: 0, maximum: 1 };
const choice = (...values) => ({ type: 'string', enum: values });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export const moduleSchemas = {
  Midbrain: object({ intent: choice('greeting', 'question', 'command', 'statement', 'request_analysis'), urgency: choice('low', 'medium', 'high'), sentiment: choice('positive', 'neutral', 'negative'), keywords: list, requiresContext: bool }),
  Medulla: object({ isSafe: bool, threatLevel: choice('none', 'low', 'medium', 'high', 'critical'), violations: list, reasoning: text, action: choice('allow', 'block', 'escalate') }),
  FrontalLobe: object({ plan: text, primaryModules: { type: 'array', items: choice('Midbrain', 'Medulla', 'FrontalLobe', 'TemporalLobe', 'ParietalLobe', 'OccipitalLobe', 'LimbicSystem', 'Hippocampus', 'Amygdala', 'Pons', 'Hypothalamus', 'Cerebrum', 'Cerebellum', 'Brainstem') }, reasoning: text, requiresLongTermMemory: bool, requiresSafetyCheck: bool }),
  TemporalLobe: object({ tone: choice('formal', 'casual', 'urgent', 'frustrated', 'neutral'), language: choice('en', 'es', 'fr', 'de', 'other'), complexity: choice('simple', 'moderate', 'complex'), summary: text, hiddenIntents: list }),
  ParietalLobe: object({ entities: list, facts: list, dataTypes: list, ambiguities: list, structuredData: { type: 'object' } }),
  OccipitalLobe: object({ patterns: list, visualDescription: text, relationships: list, anomalies: list, confidence: score }),
  LimbicSystem: object({ sentiment: choice('positive', 'neutral', 'negative'), emotionalDensity: score, empathyRequired: bool, emotionalTheme: choice('joy', 'sadness', 'frustration', 'excitement', 'concern'), recommendedTone: choice('supportive', 'professional', 'casual', 'urgent') }),
  Hippocampus: object({ shouldStore: bool, keyInformation: list, storageType: choice('short_term', 'long_term', 'episodic'), retrievalPriority: choice('high', 'medium', 'low'), summary: text }),
  Amygdala: object({ threatDetected: bool, threatType: choice('none', 'emotional', 'logical', 'safety', 'urgent'), escalationRequired: bool, severity: score, recommendations: list }),
  Pons: object({ dialogueState: choice('greeting', 'clarification', 'main_response', 'follow_up', 'closing'), contextRelevance: choice('high', 'medium', 'low'), suggestedFollowUp: text, conversationPhase: { type: 'number', minimum: 0, maximum: 100 } }),
  Hypothalamus: object({ systemHealth: choice('good', 'warning', 'critical'), tokenBudgetStatus: choice('normal', 'warning', 'exceeded'), recommendedTemperature: { type: 'number', minimum: 0, maximum: 1 }, actions: list }),
  Cerebellum: object({ refined: text, clarity_score: score, improvements: list, tone_adjusted: bool }),
  Brainstem: object({ isStable: bool, issues: list, requiresReroute: bool, fallbackSuggestion: text })
};

const ajv = new Ajv({ allErrors: true });
const validators = new Map(Object.entries(moduleSchemas).map(([name, schema]) => [name, ajv.compile(schema)]));

export function parseModuleOutput(name, content) {
  const validate = validators.get(name);
  if (!validate) throw new Error(`No output schema for ${name}`);
  const cleaned = content.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1');
  const output = JSON.parse(cleaned);
  if (!validate(output)) throw new Error(`${name} output invalid: ${ajv.errorsText(validate.errors)}`);
  return output;
}
