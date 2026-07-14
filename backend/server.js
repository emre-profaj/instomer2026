import dotenv from 'dotenv';
import { fileURLToPath as _fileURLToPath } from 'url';
import { dirname as _dirname, join as _join } from 'path';

// PM2 restart'ta CWD farklı olabilir, bu yüzden .env'ye açık path veriyoruz
const __envDir = _dirname(_fileURLToPath(import.meta.url));
dotenv.config({ path: _join(__envDir, '.env') });
console.log(`🔑 [Startup] JWT_SECRET loaded: ${process.env.JWT_SECRET ? 'YES (' + process.env.JWT_SECRET.substring(0, 6) + '...)' : '❌ NO!'}`);

import './polyfill.js';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import path from 'path';
import { fileURLToPath } from 'url';

// Node.js 25+ compatibility fix for pdf-parse
import { processScheduledCalls } from './controllers/retell.controller.js';
import { syncEmailsUniversal } from './controllers/email.controller.js';
import { createNotification } from './controllers/notification.controller.js';
import prisma from './lib/prisma.js';

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
import apiIntegrationRoutes from './routes/apiIntegration.routes.js';

import notificationRoutes from './routes/notification.routes.js';
import retellRoutes from './routes/retell.routes.js';
import quickReplyRoutes from './routes/quickReply.routes.js';
import rulesRoutes from './routes/rules.routes.js';
import funnelRoutes from './routes/funnel.routes.js';
import resourceRoutes from './routes/resource.routes.js';
import flowRoutes from './routes/flow.routes.js';
import realEstateRoutes from './routes/realestate.routes.js';
import activityRoutes from './routes/activity.routes.js';
import appointmentConfigRoutes from './routes/appointmentConfig.routes.js';
import healthSystemRoutes from './routes/probel_proxy.routes.js';
import routerRuleRoutes from './routes/routerRule.routes.js';
import caseRoutes from './routes/case.routes.js';
import productRoutes from './routes/product.routes.js';
import marketingRoutes from './routes/marketing.routes.js';
import contactGroupRoutes from './routes/contactGroup.routes.js';

// Import passport config
import './config/passport.js';

// Import socket config
import { initializeSocket } from './socket.js';

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
const isDev = process.env.NODE_ENV !== 'production';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: isDev ? 0 : 5000, // Development: sınırsız, Production: 15 dakikada max 5000 istek
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
  max: isDev ? 0 : 50, // Development: sınırsız, Production: 15 dakikada max 50 login denemesi
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
app.use('/api/integrations', apiIntegrationRoutes);

app.use('/api/notifications', notificationRoutes);
app.use('/api/retell', retellRoutes);
app.use('/api', quickReplyRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/funnels', funnelRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/workspaces', flowRoutes);
app.use('/api/realestate', realEstateRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/appointment-config', appointmentConfigRoutes);
app.use('/api/health-system', healthSystemRoutes);
app.use('/api/workspaces', routerRuleRoutes);
app.use('/api/contact-cases', caseRoutes);
app.use('/api/workspaces', productRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/contact-groups', contactGroupRoutes);

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

  // ─── ONE-TIME STARTUP CLEANUP ────────────────────────────────────────────
  // 1) "Randevu Veriliyor" stage'i tüm workspace'lerden kaldır (gereksiz / kafa karıştırıcı)
  prisma.funnelStage.deleteMany({ where: { name: 'Randevu Veriliyor' } })
    .then(r => {
      if (r.count > 0) console.log(`🗑️  [Startup] "Randevu Veriliyor" stage silindi: ${r.count} kayıt`);
    })
    .catch(e => console.warn('⚠️ [Startup] Stage cleanup error:', e.message));

  // 2) funnelType var ama funnelStageId yok olan contact/conversation'ları temizle
  (async () => {
    try {
      // Contacts: funnelType set, funnelStageId null → clear funnelType
      const orphanContacts = await prisma.contact.updateMany({
        where: { funnelType: { not: null }, funnelStageId: null },
        data: { funnelType: null }
      });
      if (orphanContacts.count > 0) console.log(`🔧 [Startup] Cleared ${orphanContacts.count} contacts with funnelType but no stage`);

      // Conversations: funnelType set, funnelStageId null → clear funnelType
      const orphanConvs = await prisma.conversation.updateMany({
        where: { funnelType: { not: null }, funnelStageId: null },
        data: { funnelType: null }
      });
      if (orphanConvs.count > 0) console.log(`🔧 [Startup] Cleared ${orphanConvs.count} conversations with funnelType but no stage`);

      // Contacts: funnelStageId set, funnelType null → resolve from stage's parent funnel
      const stageOrphans = await prisma.contact.findMany({
        where: { funnelStageId: { not: null }, funnelType: null },
        select: { id: true, funnelStageId: true }
      });
      for (const c of stageOrphans) {
        const stage = await prisma.funnelStage.findUnique({
          where: { id: c.funnelStageId },
          select: { funnelId: true }
        }).catch(() => null);
        if (stage?.funnelId) {
          await prisma.contact.update({
            where: { id: c.id },
            data: { funnelType: stage.funnelId }
          });
        } else {
          // Stage doesn't exist → clear
          await prisma.contact.update({
            where: { id: c.id },
            data: { funnelStageId: null }
          });
        }
      }
      if (stageOrphans.length > 0) console.log(`🔧 [Startup] Fixed ${stageOrphans.length} contacts with stage but no funnelType`);

    } catch (e) {
      console.warn('⚠️ [Startup] Funnel orphan cleanup error:', e.message);
    }
  })();
  // ─────────────────────────────────────────────────────────────────────────

  // Start email polling after server starts
  startEmailPolling();

});


// Email Polling System - checks for new emails every 2 minutes
const EMAIL_POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes

async function pollEmails() {
  try {
    const channels = await prisma.emailChannel.findMany({
      where: { isActive: true }
    });

    if (channels.length === 0) return;

    console.log(`📧 [Email Poll] Checking ${channels.length} email channel(s)...`);

    for (const channel of channels) {
      try {
        await syncEmailsUniversal(channel.id);
      } catch (error) {
        console.error(`❌ [Email Poll] Error syncing channel ${channel.email}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ [Email Poll] Error:', error.message);
  }
}

function startEmailPolling() {
  setTimeout(() => {
    console.log('📧 [Email Poll] Starting email polling service (every 2 minutes)');
    pollEmails();
    setInterval(pollEmails, EMAIL_POLL_INTERVAL);
  }, 30000);
}

// Bot Delay Processor - gecikme süresi dolan konuşmalar için bot cevabını tetikle
import { processPendingBotResponses } from './services/conversationRouting.service.js';

const BOT_DELAY_CHECK_INTERVAL = 30000; // 30 saniyede bir kontrol (CPU optimizasyonu: 10s → 30s)

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

// Smart Reminder System — 5-step cascading follow-up (replaces old 2-cron system)
import { processSmartReminders, resetFollowUpFlags } from './services/followUp.service.js';

const SMART_REMINDER_INTERVAL = 60000; // 60 saniyede bir kontrol

setTimeout(() => {
  console.log('📩 [SmartReminder] Starting 5-step smart reminder processor (every 60 seconds)');
  processSmartReminders(); // İlk çalıştırmayı hemen yap
  setInterval(async () => {
    try {
      await processSmartReminders();
    } catch (error) {
      console.error('❌ [SmartReminder] Processor error:', error.message);
    }
  }, SMART_REMINDER_INTERVAL);
}, 40000);

// Appointment Reminder Notification Processor
// Checks every 60 seconds for due appointments and creates notifications
const APPOINTMENT_REMINDER_INTERVAL = 60 * 1000; // 1 dakika

async function processAppointmentReminders() {
  try {
    const now = new Date();

    const dueAppointments = await prisma.appointment.findMany({
      where: {
        startTime: { lte: now },
        reminderSent: false,
        status: 'SCHEDULED'
      },
      take: 50
    });

    if (dueAppointments.length === 0) return;

    console.log(`🔔 [Reminder] Found ${dueAppointments.length} due appointment(s)`);

    for (const apt of dueAppointments) {
      try {
        const conversationIdMatch = apt.notes?.match(/Conversation ID: (.+)/);
        const conversationId = conversationIdMatch ? conversationIdMatch[1].trim() : null;
        const aptTime = new Date(apt.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
        const aptDate = new Date(apt.startTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' });

        await createNotification(
          apt.workspaceId,
          apt.assignedToId,
          'REMINDER',
          `⏰ Hatırlatıcı: ${apt.title}`,
          apt.description || `${apt.contactName || 'Müşteri'} için ${aptDate} ${aptTime} randevusu.`,
          conversationId ? { conversationId, appointmentId: apt.id } : { appointmentId: apt.id }
        );

        await prisma.appointment.update({
          where: { id: apt.id },
          data: { reminderSent: true }
        });

        console.log(`🔔 [Reminder] Notification sent for appointment: ${apt.title} -> user ${apt.assignedToId}`);
      } catch (aptError) {
        console.error(`❌ [Reminder] Error processing appointment ${apt.id}:`, aptError.message);
      }
    }
  } catch (error) {
    console.error('❌ [Reminder] Processor error:', error.message);
  }
}

setTimeout(() => {
  console.log('🔔 [Reminder] Starting appointment reminder processor (every 60 seconds)');
  processAppointmentReminders();
  setInterval(processAppointmentReminders, APPOINTMENT_REMINDER_INTERVAL);
}, 50000);

// Scheduled calls cron: check every 60s for due auto-calls (persistent across restarts)
setTimeout(() => {
  console.log('📅 [ScheduledCall] Starting scheduled call processor (every 60 seconds)');
  processScheduledCalls();
  setInterval(processScheduledCalls, 60 * 1000);
}, 10000);

// NO_REPLY Flow Cron: check every 5 minutes for silent conversations
import { processNoReplyFlows } from './services/noReply.cron.js';
import { startHealthSystemCron } from './services/healthSystem.cron.js';
setTimeout(() => {
  console.log('⏰ [NO_REPLY] Starting no-reply flow cron (every 5 minutes)');
  processNoReplyFlows();
  setInterval(processNoReplyFlows, 5 * 60 * 1000);
  
  startHealthSystemCron();
}, 60000);

// Knowledge Base URL/Feed Sync Cron
import { initKnowledgeCron } from './services/knowledgeSync.service.js';
setTimeout(() => {
  initKnowledgeCron();
}, 65000);

// WhatsApp Appointment Reminder Cron (1 gün önce hatırlatma)
import { checkAndSendReminders } from './services/appointmentFunctions.service.js';
setTimeout(() => {
  console.log('📅 [WhatsApp Reminder] Starting appointment WhatsApp reminder (every 30 minutes)');
  setInterval(async () => {
    try {
      await checkAndSendReminders();
    } catch (error) {
      console.error('❌ [WhatsApp Reminder] Error:', error.message);
    }
  }, 30 * 60 * 1000); // 30 dakikada bir kontrol
}, 70000);

// Timed Action Processor Cron: aşama bazlı zamanlı aksiyonları işle (her 5 dk)
import { processTimedActions } from './services/timedActionProcessor.js';
setTimeout(() => {
  console.log('⏱️ [TimedAction] Starting timed action processor (every 5 minutes)');
  processTimedActions();
  setInterval(async () => {
    try {
      await processTimedActions();
    } catch (err) {
      console.error('❌ [TimedAction] Processor error:', err.message);
    }
  }, 5 * 60 * 1000); // 5 dakikada bir
}, 75000);

// Sentiment Analyzer Cron Kapatıldı
// import { startSentimentAnalyzer } from './services/sentiment.service.js';
// setTimeout(() => {
//   startSentimentAnalyzer();
// }, 70000);
