export class BrainContext {
  constructor(userId, conversationHistory = []) {
    this.userId = userId;
    this.conversationHistory = conversationHistory;
    this.memory = {};
    this.tokenUsage = {
      prompt: 0,
      completion: 0,
      total: 0
    };
    this.moduleChain = [];
  }

  addToHistory(role, content) {
    this.conversationHistory.push({ role, content });
  }

  getHistory() {
    return this.conversationHistory;
  }

  setMemory(key, value) {
    this.memory[key] = value;
  }

  getMemory(key) {
    return this.memory[key];
  }

  recordModuleCall(moduleName) {
    this.moduleChain.push({
      module: moduleName,
      timestamp: new Date().toISOString()
    });
  }

  updateTokenUsage(usage) {
    this.tokenUsage.prompt += usage.prompt_tokens || 0;
    this.tokenUsage.completion += usage.completion_tokens || 0;
    this.tokenUsage.total = this.tokenUsage.prompt + this.tokenUsage.completion;
  }

  getContext() {
    return {
      userId: this.userId,
      conversationHistory: this.conversationHistory,
      memory: this.memory,
      tokenUsage: this.tokenUsage,
      moduleChain: this.moduleChain
    };
  }
}
