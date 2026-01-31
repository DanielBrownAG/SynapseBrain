import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './src/utils/logger.js';
import orchestrator from './src/brain/orchestrator.js';
import chatRoutes from './src/routes/chat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src/ui')));

// Set orchestrator to use Socket.IO
orchestrator.setSocketIO(io);

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/chat', chatRoutes);

// Serve UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/ui/index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('chat-message', async (data) => {
    try {
      const { message, userId = 'default' } = data;
      
      if (!message) {
        socket.emit('chat-error', { error: 'Message is required' });
        return;
      }

      logger.info(`Chat message received: ${message.substring(0, 50)}...`);

      // Notify client that response is starting
      socket.emit('chat-response-start', { message });

      // Set up a temporary socket.io emitter for streaming
      const originalBroadcast = orchestrator.broadcastActivity.bind(orchestrator);
      orchestrator.broadcastActivity = (activity) => {
        socket.emit('brain-activity', activity);
      };

      // Process the message
      const result = await orchestrator.orchestrate(message, userId);

      // Stream the response in chunks
      if (result.response) {
        const chunkSize = 10; // Characters per chunk
        for (let i = 0; i < result.response.length; i += chunkSize) {
          const chunk = result.response.substring(i, i + chunkSize);
          socket.emit('chat-response-chunk', { chunk });
          // Add small delay for visual streaming effect
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      // Send final response with metadata
      socket.emit('chat-response-end', {
        tokenUsage: result.tokenUsage,
        orchestrationLog: result.orchestrationLog
      });

      // Restore original broadcast function
      orchestrator.broadcastActivity = originalBroadcast;

    } catch (error) {
      logger.error('Socket chat error', { error: error.message });
      socket.emit('chat-error', { error: error.message });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error', { error: err.message });
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  logger.info(`🧠 Digital Brain Server running on http://localhost:${PORT}`);
  logger.info(`📊 Brain modules loaded: ${orchestrator.getModules().length}`);
  logger.info(`🔗 WebSocket ready for real-time streaming`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
