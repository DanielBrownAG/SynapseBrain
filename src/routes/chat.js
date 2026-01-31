import express from 'express';
import orchestrator from '../brain/orchestrator.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, userId = 'default' } = req.body;

    if (!message) {
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
