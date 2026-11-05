import express from 'express';
import orchestrator from '../brain/orchestrator.js';
import logger from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

const router = express.Router();

router.post('/sessions', (req, res) => {
  const session = orchestrator.sessions.create();
  res.status(201).json({ success: true, session });
});

router.get('/sessions/:sessionId', (req, res) => {
  try {
    const session = orchestrator.sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, session });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    await orchestrator.sessions.delete(req.params.sessionId);
    res.json({ success: true });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId = req.body?.userId || randomUUID() } = req.body || {};

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    logger.info(`Chat request received: ${message.substring(0, 50)}...`);

    try { orchestrator.sessions.validateId(sessionId); }
    catch (error) { return res.status(400).json({ success: false, error: error.message }); }
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const result = await orchestrator.orchestrate(message, sessionId, { signal: controller.signal });

    res.json(result);
  } catch (error) {
    logger.error('Chat route error', { error: error.message });
    const limited = /^Request (token budget|deadline)/.test(error.message);
    res.status(limited ? (error.message.includes('deadline') ? 504 : 422) : 500).json({
      success: false,
      error: limited ? error.message : 'Internal server error'
    });
  }
});

// POST /api/chat/stream: model deltas and a final result over SSE.
router.post('/stream', async (req, res) => {
  const { message, sessionId = req.body?.userId || randomUUID() } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }
  try { orchestrator.sessions.validateId(sessionId); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
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
    const result = await orchestrator.orchestrate(message, sessionId, {
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
router.post('/clear', async (req, res) => {
  try {
    await orchestrator.clearHistory(req.body?.sessionId || req.body?.userId);
    res.json({ success: true, message: 'History cleared' });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

export default router;
