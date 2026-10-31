import express from 'express';
import orchestrator from '../brain/orchestrator.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, userId = 'default' } = req.body;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    logger.info(`Chat request received: ${message.substring(0, 50)}...`);

    const result = await orchestrator.orchestrate(message, userId);

    res.json(result);
  } catch (error) {
    logger.error('Chat route error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/chat/stream: model deltas and a final result over SSE.
router.post('/stream', async (req, res) => {
  const { message, userId = 'default' } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
    'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (event, data) => {
    if (!controller.signal.aborted) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = setInterval(() => {
    if (!controller.signal.aborted) res.write(': keep-alive\n\n');
  }, 15000);
  try {
    send('start', {});
    const result = await orchestrator.orchestrate(message, userId, {
      signal: controller.signal,
      onChunk: chunk => send('chunk', { chunk }),
      onActivity: activity => send('activity', activity)
    });
    send('end', result);
  } catch (error) {
    send('error', { success: false, error: error.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// Status endpoint
router.get('/status', (req, res) => {
  res.json({
    status: 'running',
    modules: orchestrator.getModules(),
    moduleCount: orchestrator.getModules().length
  });
});

// Clear history endpoint
router.post('/clear', (req, res) => {
  orchestrator.clearHistory();
  res.json({ success: true, message: 'History cleared' });
});

export default router;
