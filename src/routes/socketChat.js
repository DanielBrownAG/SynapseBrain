import logger from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

export function registerChatSocket(socket, orchestrator) {
  let activeRequest;
  const fallbackSessionId = randomUUID();
  socket.on('chat-message', async (data = {}) => {
    if (activeRequest) {
      socket.emit('chat-error', { error: 'A response is already in progress' });
      return;
    }
    const { message, sessionId = data?.userId || fallbackSessionId } = data || {};
    if (typeof message !== 'string' || !message.trim()) {
      socket.emit('chat-error', { error: 'Message is required' });
      return;
    }
    const controller = new AbortController();
    activeRequest = controller;
    socket.emit('chat-response-start', { message });
    try {
      const result = await orchestrator.orchestrate(message, sessionId, {
        signal: controller.signal,
        onActivity: activity => { if (!controller.signal.aborted) socket.emit('brain-activity', activity); },
        onChunk: chunk => { if (!controller.signal.aborted) socket.emit('chat-response-chunk', { chunk }); }
      });
      if (!controller.signal.aborted) socket.emit('chat-response-end', {
        success: result.success,
        sessionId: result.sessionId,
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
