import logger from '../utils/logger.js';

export function registerChatSocket(socket, orchestrator) {
  let activeRequest;
  socket.on('chat-message', async (data = {}) => {
    if (activeRequest) {
      socket.emit('chat-error', { error: 'A response is already in progress' });
      return;
    }
    const { message, userId = 'default' } = data || {};
    if (typeof message !== 'string' || !message.trim()) {
      socket.emit('chat-error', { error: 'Message is required' });
      return;
    }
    const controller = new AbortController();
    activeRequest = controller;
    socket.emit('chat-response-start', { message });
    try {
      const result = await orchestrator.orchestrate(message, userId, {
        signal: controller.signal,
        onActivity: activity => socket.emit('brain-activity', activity),
        onChunk: chunk => socket.emit('chat-response-chunk', { chunk })
      });
      if (!controller.signal.aborted) socket.emit('chat-response-end', {
        success: result.success,
        tokenUsage: result.tokenUsage,
        orchestrationLog: result.orchestrationLog
      });
    } catch (error) {
      logger.error('Socket chat error', { error: error.message });
      if (!controller.signal.aborted) socket.emit('chat-error', { error: error.message });
    } finally {
      activeRequest = null;
    }
  });
  socket.on('disconnect', () => activeRequest?.abort());
}
