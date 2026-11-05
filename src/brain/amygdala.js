import { BaseBrainModule } from './baseBrainModule.js';

export class Amygdala extends BaseBrainModule {
  constructor() {
    super('Amygdala', 'Threat detection and escalation flagging');
    this.systemPrompt = `You are the Amygdala of a digital brain. Your role is THREAT DETECTION.
Detect potential threats, problems, or issues that need escalation.
Respond with ONLY a JSON object (no markdown, no extra text):
{
  "threatDetected": true | false,
  "threatType": "none | emotional | logical | safety | urgent",
  "escalationRequired": true | false,
  "severity": 0.0 to 1.0,
  "recommendations": ["array", "of", "recommendations"]
}`;
  }

  async process(input, context) {
    this.log('Scanning for threats', { input: input.substring(0, 50) });

    try {
      const threat = await this.queryJSON(input, context.getHistory());

      return this.createOutput(
        `Threat detected: ${threat.threatDetected}, Type: ${threat.threatType}`,
        `Severity: ${(threat.severity * 100).toFixed(0)}%, Escalate: ${threat.escalationRequired}`,
        threat.escalationRequired ? ['Medulla', 'Cerebrum'] : [],
        threat
      );
    } catch (error) {
      this.error('Threat detection failed', { error: error.message });
      return this.createOutput(
        'Detection error',
        'Proceeding with caution',
        [],
        { threatDetected: false, severity: 0 }
      );
    }
  }
}

export default new Amygdala();
