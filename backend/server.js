import './polyfill.js';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import passport from 'passport';
import path from 'path';
import { fileURLToPath } from 'url';

// Node.js 25+ compatibility fix for pdf-parse
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix { };
}

// Import routes
import authRoutes from './routes/auth.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import facebookRoutes from './routes/facebook.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import aiRoutes from './routes/ai.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import adminRoutes from './routes/admin.routes.js';
import emailRoutes from './routes/email.routes.js';
import teamRoutes from './routes/team.routes.js';
import contactRoutes from './routes/contact.routes.js';
import knowledgebaseRoutes from './routes/knowledgebase.routes.js';
import leadsRoutes from './routes/leads.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import automationRoutes from './routes/automation.routes.js';
import dealRoutes from './routes/deal.routes.js';
import formWebhookRoutes from './routes/formWebhook.routes.js';
import channelRoutingRoutes from './routes/channelRouting.routes.js';
import companyRoutes from './routes/company.routes.js';
import webwidgetRoutes from './routes/webwidget.routes.js';

// Import passport config
import './config/passport.js';

// Import socket config
import { initializeSocket } from './socket.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5008;

// Initialize Socket.IO
initializeSocket(httpServer);

// Allowed origins for CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://app.instomer.com',
  'https://app.instomer.com',
  'https://chatcrm.instomer.com',
  'https://instomer.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

// Security Middleware - Helmet (HTTP güvenlik başlıkları)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Uploads için gerekli
  crossOriginEmbedderPolicy: false, // Widget embed için
  contentSecurityPolicy: false // Frontend uyumluluğu için şimdilik kapalı
}));

// Rate Limiting - Brute Force koruması
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 1000, // 15 dakikada max 1000 istek (genel)
  message: { error: 'Çok fazla istek gönderildi, lütfen daha sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Webhook'ları atla (Facebook, WhatsApp, vb.)
    return req.path.includes('/webhook') || req.path.includes('/public/');
  }
});

// Login için daha sıkı rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 10, // 15 dakikada max 10 login denemesi
  message: { error: 'Çok fazla giriş denemesi, lütfen 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Genel rate limiter
app.use(generalLimiter);

// Auth route'ları için ekstra sıkı limiter
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Middleware - CORS
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, webhooks, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.some(allowed => origin.startsWith(allowed) || allowed.includes(origin))) {
      return callback(null, true);
    }

    // Allow widget embeds from any origin (they use specific widget endpoints)
    // This is needed for the chat widget to work on customer websites
    if (origin) {
      return callback(null, true); // Allow for now, widget endpoints have their own auth
    }

    // Reject other origins
    console.warn(`⚠️ [CORS] Blocked request from origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Request body boyut limiti
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/knowledgebase', knowledgebaseRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/form-webhooks', formWebhookRoutes);
app.use('/api/channel-routing', channelRoutingRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/webwidgets', webwidgetRoutes);
app.use('/api/workspaces', dealRoutes);

// Serve Frontend in Production
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../frontend/dist');

  // Serve frontend static files but exclude /uploads and /website (already handled above)
  app.use((req, res, next) => {
    if (req.path.startsWith('/uploads') || req.path.startsWith('/website')) {
      return next();
    }
    express.static(buildPath)(req, res, next);
  });

  app.get('*', (req, res) => {
    // API, uploads and website requests should skip this (handled by routes above)
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/website')) {
      // For /website, serve the static HTML
      if (req.path.startsWith('/website')) {
        return res.sendFile(path.join(__dirname, 'public/website/index.html'));
      }
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔌 WebSocket server initialized`);
  }

  // Start email polling after server starts
  startEmailPolling();
});

// Email Polling System - checks for new emails every 2 minutes
async function startEmailPolling() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes

  async function pollEmails() {
    try {
      // Get all active email channels
      const channels = await prisma.emailChannel.findMany({
        where: { isActive: true }
      });

      if (channels.length === 0) return;

      console.log(`📧 [Email Poll] Checking ${channels.length} email channel(s)...`);

      for (const channel of channels) {
        try {
          // Dynamic import to avoid circular dependencies
          // Use Universal sync to support both Gmail and IMAP providers
          const { syncEmailsUniversal } = await import('./controllers/email.controller.js');
          await syncEmailsUniversal(channel.id);
        } catch (error) {
          console.error(`❌ [Email Poll] Error syncing channel ${channel.email}:`, error.message);
        }
      }
    } catch (error) {
      console.error('❌ [Email Poll] Error:', error.message);
    }
  }

  // Start polling after 30 seconds (give server time to fully initialize)
  setTimeout(() => {
    console.log('📧 [Email Poll] Starting email polling service (every 2 minutes)');
    pollEmails(); // Initial poll
    setInterval(pollEmails, POLL_INTERVAL);
  }, 30000);
}

// Bot Delay Processor - gecikme süresi dolan konuşmalar için bot cevabını tetikle
import { processPendingBotResponses } from './services/conversationRouting.service.js';

const BOT_DELAY_CHECK_INTERVAL = 10000; // 10 saniyede bir kontrol

setTimeout(() => {
  console.log('🤖 [Bot Delay] Starting bot delay processor (every 10 seconds)');
  setInterval(async () => {
    try {
      await processPendingBotResponses();
    } catch (error) {
      console.error('❌ [Bot Delay] Processor error:', error.message);
    }
  }, BOT_DELAY_CHECK_INTERVAL);
}, 35000); // Email polling'den 5 saniye sonra başla

// Follow-up Processor - 40s inactivity warning + 24h daily reminder
import { processInactivityWarnings, processDailyReminders } from './services/followUp.service.js';

const INACTIVITY_CHECK_INTERVAL = 10000; // 10 saniyede bir kontrol (40s uyarı)
const REMINDER_CHECK_INTERVAL = 30 * 60 * 1000; // 30 dakikada bir kontrol (1 gün hatırlatma)

setTimeout(() => {
  console.log('⏰ [Follow-up] Starting inactivity warning processor (every 10 seconds)');
  setInterval(async () => {
    try {
      await processInactivityWarnings();
    } catch (error) {
      console.error('❌ [Follow-up] Inactivity warning error:', error.message);
    }
  }, INACTIVITY_CHECK_INTERVAL);
}, 40000);

setTimeout(() => {
  console.log('📅 [Follow-up] Starting daily reminder processor (every 30 minutes)');
  setInterval(async () => {
    try {
      await processDailyReminders();
    } catch (error) {
      console.error('❌ [Follow-up] Daily reminder error:', error.message);
    }
  }, REMINDER_CHECK_INTERVAL);
}, 45000);
