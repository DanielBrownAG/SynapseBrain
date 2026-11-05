import { BaseBrainModule } from './baseBrainModule.js';

export class Pons extends BaseBrainModule {
  constructor() {
    super('Pons', 'Conversational flow management and dialogue state tracking');
    this.systemPrompt = `You are the Pons of a digital brain. Your role is DIALOGUE MANAGEMENT.
Track and manage conversational flow and dialogue state.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "dialogueState": "greeting | clarification | main_response | follow_up | closing",
  "contextRelevance": "high | medium | low",
  "suggestedFollowUp": "optional follow-up question",
  "conversationPhase": 0 to 100
}`;
  }

  async process(input, context) {
    this.log('Managing dialogue flow', {
      historyLength: context.getHistory().length
    });

    try {
      const flow = await this.queryJSON(input, context.getHistory());

      return this.createOutput(
        `Dialogue state: ${flow.dialogueState}`,
        `Context relevance: ${flow.contextRelevance}, Phase: ${flow.conversationPhase}%`,
        [],
        flow
      );
    } catch (error) {
      this.error('Dialogue management failed', { error: error.message });
      return this.createOutput(
        'Flow error',
        'Continuing conversation',
        [],
        { dialogueState: 'main_response', contextRelevance: 'medium' }
      );
    }
  }
}

export default new Pons();
