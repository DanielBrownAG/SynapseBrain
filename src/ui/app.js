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
    this.currentResponseElement = null;
    this.socket = null;

    this.initializeEventListeners();
    this.initializeSocket();
    this.loadModules();
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
        this.displayOrchestrationLog(data.orchestrationLog);
      }
      this.currentResponseElement = null;
      this.isWaitingForResponse = false;
      this.sendBtn.disabled = false;
      this.messageInput.focus();
    });

    this.socket.on('chat-error', (data) => {
      this.currentResponseElement?.classList.remove('streaming');
      this.currentResponseElement = null;
      this.addChatMessage(`Error: ${data.error}`, 'system');
      this.isWaitingForResponse = false;
      this.sendBtn.disabled = false;
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
        this.sendBtn.disabled = false;
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
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message || this.isWaitingForResponse) return;
    if (!this.socket.connected) {
      this.addChatMessage('Not connected to the server. Please wait for reconnection.', 'system');
      return;
    }

    this.isWaitingForResponse = true;
    this.sendBtn.disabled = true;

    // Add user message to chat
    this.addChatMessage(message, 'user');
    this.messageInput.value = '';

    // Clear previous activities for this new message
    this.activityLog.innerHTML = '';

    // Send message via Socket.IO
    this.socket.emit('chat-message', { 
      message,
      userId: 'default'
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
    details.innerHTML = `
      <div class="activity-detail"><strong>Reasoning:</strong> ${activity.reasoning || 'N/A'}</div>
      <div class="activity-detail"><strong>Decision:</strong> ${activity.decision || 'N/A'}</div>
      ${activity.nextModules && activity.nextModules.length > 0 
        ? `<div class="activity-detail"><strong>Next:</strong> ${activity.nextModules.join(', ')}</div>`
        : ''}
      <div class="activity-detail"><small>${new Date(activity.timestamp).toLocaleTimeString()}</small></div>
    `;

    actItem.appendChild(moduleEl);
    actItem.appendChild(details);
    this.activityLog.appendChild(actItem);
    this.activityLog.scrollTop = this.activityLog.scrollHeight;

    // Remove streaming animation after a short time
    setTimeout(() => {
      actItem.classList.remove('streaming');
    }, 800);
  }

  displayOrchestrationLog(log) {
    const summary = document.createElement('div');
    summary.className = 'activity-item success';
    summary.innerHTML = `
      <div class="activity-module">✅ Orchestration Complete</div>
      <div class="activity-detail"><strong>Duration:</strong> ${log.duration}ms</div>
      <div class="activity-detail"><strong>Modules Executed:</strong> ${log.moduleExecutionOrder.length}</div>
      <div class="activity-detail"><strong>Order:</strong> ${log.moduleExecutionOrder.join(' → ')}</div>
    `;
    this.activityLog.appendChild(summary);
    this.activityLog.scrollTop = this.activityLog.scrollHeight;
  }

  async loadModules() {
    try {
      const response = await fetch('/api/chat/status');
      const data = await response.json();

      this.moduleList.innerHTML = '';
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
    if (this.isWaitingForResponse) return;
    if (confirm('Clear all chat history and activity logs?')) {
      try {
        await fetch('/api/chat/clear', { method: 'POST' });
        this.chatMessages.innerHTML = '';
        this.activityLog.innerHTML = '';
        this.totalTokens = 0;
        this.tokenCount.textContent = '0';
        this.addChatMessage('System: Conversation history cleared', 'system');
      } catch (error) {
        console.error('Failed to clear history:', error);
      }
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const ui = new DigitalBrainUI();
  
  // Add welcome message
  ui.addChatMessage(
    '🧠 Welcome to the Digital Brain! I am a modular AI system powered by Azure OpenAI. Each component of my architecture specializes in different aspects of reasoning. Ask me anything, and watch how my brain modules process your request in real-time!',
    'assistant'
  );
});
