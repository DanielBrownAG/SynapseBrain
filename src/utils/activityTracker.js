import { v4 as uuidv4 } from 'uuid';

export class BrainActivityTracker {
  constructor() {
    this.activities = [];
    this.sessionId = uuidv4();
  }

  logActivity(moduleName, activity) {
    const log = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      module: moduleName,
      ...activity
    };
    this.activities.push(log);
    return log;
  }

  getActivities() {
    return this.activities;
  }

  clearActivities() {
    this.activities = [];
  }

  getSessionId() {
    return this.sessionId;
  }
}

export default new BrainActivityTracker();
