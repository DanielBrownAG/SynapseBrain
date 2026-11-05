// Digital Brain UI Application
class DigitalBrainUI {
  constructor() {
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.clearBtn = document.getElementById('clearBtn');
    this.chatMessages = document.getElementById('chatMessages');
    this.activityLog = document.getElementById('activityLog');
    this.moduleList = document.getElementById('moduleList');
    this.tokenCount = document.getElementById('tokenCount');

    this.isWaitingForResponse = false;
    this.totalTokens = 0;
    this.sessionId = null;
    this.sessionBusy = true;
    this.sessionSelect = document.getElementById('sessionSelect');
    this.newSessionBtn = document.getElementById('newSessionBtn');
    this.deleteSessionBtn = document.getElementById('deleteSessionBtn');
    this.currentResponseElement = null;
    this.socket = null;

    this.initializeEventListeners();
    this.initializeSocket();
    this.loadModules();
    this.sessionReady = this.initializeSessions();
  }

  addDetail(parent, label, value) {
    const row = document.createElement('div');
    row.className = 'activity-detail';
    row.textContent = label + ': ' + String(value);
    parent.appendChild(row);
  }

  setBusy(busy) {
    this.sendBtn.disabled = busy;
    this.clearBtn.disabled = busy;
    this.newSessionBtn.disabled = busy;
    this.deleteSessionBtn.disabled = busy;
    this.sessionSelect.disabled = busy;
  }

  storedSessions() {
    try {
      const saved = JSON.parse(localStorage.getItem('synapse-sessions') || '[]');
      return Array.isArray(saved) ? saved.filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)) : [];
    } catch { return []; }
  }

  async initializeSessions() {
    this.setBusy(true);
    const saved = this.storedSessions();
    const active = localStorage.getItem('synapse-active-session');
    await this.changeSession(saved.includes(active) ? active : saved[0]);
  }

  async changeSession(id) {
    if (this.isWaitingForResponse) return;
    this.sessionBusy = true;
    this.setBusy(true);
    try {
      if (!id) {
        const response = await fetch('/api/chat/sessions', { method: 'POST' });
        if (!response.ok) throw new Error('Unable to create conversation');
        id = (await response.json()).session.id;
      }
      const response = await fetch('/api/chat/sessions/' + encodeURIComponent(id));
      if (response.status === 404) {
        localStorage.setItem('synapse-sessions', JSON.stringify(this.storedSessions().filter(saved => saved !== id)));
        return await this.changeSession();
      }
      if (!response.ok) throw new Error('Unable to open conversation');
      const { session } = await response.json();
      this.sessionId = session.id;
      const ids = [session.id, ...this.storedSessions().filter(saved => saved !== session.id)];
      localStorage.setItem('synapse-sessions', JSON.stringify(ids));
      localStorage.setItem('synapse-active-session', session.id);
      this.sessionSelect.replaceChildren();
      for (const saved of ids) {
        const option = document.createElement('option');
        option.value = saved;
        option.textContent = 'Chat ' + saved.slice(0, 8);
        this.sessionSelect.appendChild(option);
      }
      this.sessionSelect.value = session.id;
      this.chatMessages.replaceChildren();
      this.activityLog.replaceChildren();
      for (const message of session.history) this.addChatMessage(message.content, message.role);
      for (const activity of session.activities) this.addActivityItem(activity.module, activity);
      this.totalTokens = session.totalTokens || 0;
      this.tokenCount.textContent = this.totalTokens;
      if (!session.history.length) this.addChatMessage('Welcome to SynapseBrain. Ask a question to see the brain modules work together.', 'assistant');
    } catch (error) {
      this.addChatMessage(error.message, 'system');
    } finally {
      this.sessionBusy = false;
      this.setBusy(false);
    }
  }

  async deleteSession() {
    if (this.isWaitingForResponse || !this.sessionId || !confirm('Delete this saved conversation?')) return;
    this.sessionBusy = true;
    this.setBusy(true);
    try {
      const response = await fetch('/api/chat/sessions/' + encodeURIComponent(this.sessionId), { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to delete conversation');
      const remaining = this.storedSessions().filter(id => id !== this.sessionId);
      localStorage.setItem('synapse-sessions', JSON.stringify(remaining));
      await this.changeSession(remaining[0]);
    } catch (error) { this.addChatMessage(error.message, 'system'); }
    finally { this.sessionBusy = false; this.setBusy(false); }
  }

  initializeSocket() {
    this.socket = io();

    // Listen for real-time brain activity
    this.socket.on('brain-activity', (activity) => {
      this.addActivityItem(activity.module, activity);
    });

    // Listen for chat responses with streaming
    this.socket.on('chat-response-start', (data) => {
      this.currentResponseElement = document.createElement('div');
      this.currentResponseElement.className = 'message assistant';
      this.chatMessages.appendChild(this.currentResponseElement);
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    });

    this.socket.on('chat-response-chunk', (data) => {
      if (this.currentResponseElement) {
        this.currentResponseElement.textContent += data.chunk;
        this.currentResponseElement.classList.add('streaming');
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
      }
    });

    this.socket.on('chat-response-end', (data) => {
      if (this.currentResponseElement) {
        this.currentResponseElement.classList.remove('streaming');
      }
      if (data.tokenUsage) {
        this.totalTokens += data.tokenUsage.total || 0;
        this.tokenCount.textContent = this.totalTokens;
      }
      if (data.orchestrationLog) {
        this.displayOrchestrationLog(data.orchestrationLog, data.success);
      }
      this.currentResponseElement = null;
      this.isWaitingForResponse = false;
      this.setBusy(false);
      this.messageInput.focus();
    });

    this.socket.on('chat-error', (data) => {
      this.currentResponseElement?.classList.remove('streaming');
      this.currentResponseElement = null;
      this.addChatMessage(`Error: ${data.error}`, 'system');
      this.isWaitingForResponse = false;
      this.setBusy(false);
      this.messageInput.focus();
    });

    this.socket.on('connect', () => {
      console.log('Connected to Brain server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from Brain server');
      if (this.isWaitingForResponse) {
        this.currentResponseElement?.classList.remove('streaming');
        this.currentResponseElement = null;
        this.isWaitingForResponse = false;
        this.setBusy(false);
        this.addChatMessage('Connection lost. The response was interrupted; please try again.', 'system');
      }
    });
  }

  initializeEventListeners() {
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !this.isWaitingForResponse) {
        this.sendMessage();
      }
    });

    this.clearBtn.addEventListener('click', () => this.clearHistory());
    this.newSessionBtn.addEventListener('click', () => this.changeSession());
    this.deleteSessionBtn.addEventListener('click', () => this.deleteSession());
    this.sessionSelect.addEventListener('change', () => this.changeSession(this.sessionSelect.value));
  }

  async sendMessage() {
    await this.sessionReady;
    if (this.sessionBusy || !this.sessionId) return;
    const message = this.messageInput.value.trim();
    if (!message || this.isWaitingForResponse) return;
    if (!this.socket.connected) {
      this.addChatMessage('Not connected to the server. Please wait for reconnection.', 'system');
      return;
    }

    this.isWaitingForResponse = true;
    this.setBusy(true);

    // Add user message to chat
    this.addChatMessage(message, 'user');
    this.messageInput.value = '';

    // Clear previous activities for this new message
    this.activityLog.replaceChildren();

    // Send message via Socket.IO
    this.socket.emit('chat-message', { 
      message,
      sessionId: this.sessionId
    });
  }

  addChatMessage(message, role) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;
    messageEl.textContent = message;
    this.chatMessages.appendChild(messageEl);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  addActivityItem(moduleName, activity) {
    const actItem = document.createElement('div');
    actItem.className = 'activity-item streaming';

    const moduleEl = document.createElement('div');
    moduleEl.className = 'activity-module active';
    moduleEl.textContent = `🧠 ${moduleName}`;

    const details = document.createElement('div');
    this.addDetail(details, 'Reasoning', activity.reasoning || 'N/A');
    this.addDetail(details, 'Decision', activity.decision || 'N/A');
    if (activity.nextModules?.length) this.addDetail(details, 'Next', activity.nextModules.join(', '));
    this.addDetail(details, 'Duration', (activity.durationMs || 0) + 'ms');
    this.addDetail(details, 'Tokens', activity.tokenUsage?.total_tokens || 0);
    if (activity.status === 'failed') {
      actItem.classList.add('failed');
      this.addDetail(details, 'Module failed', activity.error || 'Analysis unavailable');
    }
    this.addDetail(details, 'Time', new Date(activity.timestamp).toLocaleTimeString());

    actItem.appendChild(moduleEl);
    actItem.appendChild(details);
    this.activityLog.appendChild(actItem);
    this.activityLog.scrollTop = this.activityLog.scrollHeight;

    // Remove streaming animation after a short time
    setTimeout(() => {
      actItem.classList.remove('streaming');
    }, 800);
  }

  displayOrchestrationLog(log, success = true) {
    const summary = document.createElement('div');
    summary.className = 'activity-item success';
    this.addDetail(summary, 'Orchestration', success ? 'Complete' : 'Blocked');
    this.addDetail(summary, 'Duration', log.duration + 'ms');
    this.addDetail(summary, 'Modules executed', log.moduleExecutionOrder.length);
    this.addDetail(summary, 'Order', log.moduleExecutionOrder.join(' → '));
    if (log.skippedModules?.length) this.addDetail(summary, 'Skipped', log.skippedModules.join(', '));
    this.activityLog.appendChild(summary);
    this.activityLog.scrollTop = this.activityLog.scrollHeight;
  }

  async loadModules() {
    try {
      const response = await fetch('/api/chat/status');
      const data = await response.json();

      this.moduleList.replaceChildren();
      data.modules.forEach(module => {
        const badge = document.createElement('div');
        badge.className = 'module-badge';
        badge.textContent = module;
        this.moduleList.appendChild(badge);
      });
    } catch (error) {
      console.error('Failed to load modules:', error);
    }
  }

  async clearHistory() {
    if (this.isWaitingForResponse || this.sessionBusy || !this.sessionId) return;
    if (confirm('Clear this conversation and its saved memory?')) {
      this.sessionBusy = true;
      this.setBusy(true);
      try {
        const response = await fetch('/api/chat/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: this.sessionId }) });
        if (!response.ok) throw new Error('Unable to clear conversation');
        this.chatMessages.replaceChildren();
        this.activityLog.replaceChildren();
        this.totalTokens = 0;
        this.tokenCount.textContent = '0';
        this.addChatMessage('System: Conversation history cleared', 'system');
      } catch (error) {
        this.addChatMessage(error.message, 'system');
      } finally { this.sessionBusy = false; this.setBusy(false); }
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const ui = new DigitalBrainUI();
  
});
