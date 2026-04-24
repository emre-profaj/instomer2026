/**
 * Workspace AI Debug Script
 * Bilimsel Holistik Akademi — Instagram DM yanıt sorunu teşhisi
 * 
 * Kullanım (sunucuda):
 *   cd /var/www/chatinstomer/backend
 *   node ../debug_workspace.js
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const WORKSPACE_ID = '5b024db1-f2c7-44f3-80bf-12f8edef5c01';

async function debug() {
  console.log('='.repeat(60));
  console.log('🔍 WORKSPACE AI DEBUG — Bilimsel Holistik Akademi');
  console.log('='.repeat(60));

  // 1. Workspace bilgileri
  const ws = await prisma.workspace.findUnique({
    where: { id: WORKSPACE_ID },
    select: { id: true, name: true, aiApiKey: true, companyName: true }
  });
  console.log('\n📌 WORKSPACE:', ws?.name);
  console.log('   AI API Key:', ws?.aiApiKey ? '✅ VAR (' + ws.aiApiKey.slice(0, 8) + '...)' : '❌ YOK');

  // 2. Global API Key
  const gs = await prisma.globalSettings.findFirst();
  console.log('   Global AI Key:', gs?.globalAiApiKey ? '✅ VAR (...' + gs.globalAiApiKey.slice(-4) + ')' : '❌ YOK');

  // 3. Company & Limits
  const company = await prisma.company.findFirst({
    where: { workspaces: { some: { id: WORKSPACE_ID } } },
    select: { id: true, name: true, dailyAiLimit: true, subscription: true }
  });
  console.log('\n🏢 COMPANY:', company ? `${company.name} | Limit: ${company.dailyAiLimit} | Plan: ${company.subscription}` : '❌ YOK');

  // 4. Botlar 
  const bots = await prisma.aIBot.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { 
      id: true, name: true, isActive: true, 
      schedulerEnabled: true, scheduleStartTime: true, scheduleEndTime: true, scheduleDays: true,
      prompt: true
    }
  });
  console.log('\n🤖 BOTLAR:');
  if (bots.length === 0) {
    console.log('   ❌ HİÇ BOT YOK — Bot oluşturulmalı!');
  } else {
    bots.forEach(b => {
      console.log(`   • ${b.name} (${b.id})`);
      console.log(`     isActive: ${b.isActive ? '✅' : '❌'}`);
      console.log(`     Scheduler: ${b.schedulerEnabled ? `AÇIK (${b.scheduleStartTime}-${b.scheduleEndTime}, Günler: ${b.scheduleDays})` : 'Kapalı (7/24)'}`);
      console.log(`     Prompt: ${b.prompt ? b.prompt.substring(0, 100) + '...' : '❌ PROMPT YOK'}`);
    });
  }

  // 5. Facebook/Instagram Sayfaları ve bot atamaları
  const pages = await prisma.facebookPage.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { 
      id: true, pageName: true, pageId: true, 
      assignedBotId: true, instagramBotId: true, 
      commentBotId: true, instagramCommentBotId: true,
      instagramBusinessId: true,
      accessToken: true
    }
  });
  console.log('\n📱 FACEBOOK/INSTAGRAM SAYFALARI:');
  if (pages.length === 0) {
    console.log('   ❌ HİÇ SAYFA BAĞLI DEĞİL!');
  } else {
    pages.forEach(p => {
      console.log(`   • ${p.pageName} (FB: ${p.pageId})`);
      console.log(`     Instagram ID: ${p.instagramBusinessId || '❌ YOK'}`);
      console.log(`     FB DM Bot: ${p.assignedBotId || '❌ ATANMAMIŞ'}`);
      console.log(`     IG DM Bot: ${p.instagramBotId || '❌ ATANMAMIŞ ⚠️'}`);
      console.log(`     FB Comment Bot: ${p.commentBotId || '—'}`);
      console.log(`     IG Comment Bot: ${p.instagramCommentBotId || '—'}`);
      console.log(`     Access Token: ${p.accessToken ? '✅ VAR (...' + p.accessToken.slice(-6) + ')' : '❌ YOK'}`);
    });
  }

  // 6. WhatsApp numaraları
  const wa = await prisma.whatsAppPhoneNumber.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true, phoneNumber: true, displayPhoneNumber: true, assignedBotId: true }
  });
  console.log('\n📞 WHATSAPP:');
  if (wa.length === 0) {
    console.log('   — Bağlı numara yok');
  } else {
    wa.forEach(w => console.log(`   • ${w.displayPhoneNumber || w.phoneNumber} | Bot: ${w.assignedBotId || '❌ ATANMAMIŞ'}`));
  }

  // 7. Web Widget
  const widgets = await prisma.webWidget.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true, isActive: true, assignedBotId: true }
  });
  console.log('\n🌐 WEB WIDGET:');
  if (widgets.length === 0) {
    console.log('   — Widget yok');
  } else {
    widgets.forEach(w => console.log(`   • ${w.id} | Active: ${w.isActive} | Bot: ${w.assignedBotId || '❌'}`));
  }

  // 8. Son konuşmalar - botEnabled durumu
  const convs = await prisma.conversation.findMany({
    where: { workspaceId: WORKSPACE_ID },
    take: 15,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, botEnabled: true, channel: true, assignedBotId: true,
      handoffPending: true, updatedAt: true,
      contact: { select: { name: true } },
      messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { content: true, isFromContact: true, createdAt: true } }
    }
  });
  console.log('\n💬 SON 15 KONUŞMA:');
  convs.forEach(c => {
    const lastMsg = c.messages[0];
    const contactName = c.contact?.name || '?';
    const msgPreview = lastMsg ? (lastMsg.content || '').substring(0, 50) : '—';
    const isFromCustomer = lastMsg?.isFromContact ? '👤' : '🤖';
    console.log(`   ${c.botEnabled ? '✅' : '❌'} [${c.channel}] ${contactName} | Bot: ${c.assignedBotId ? '✓' : '—'} | Handoff: ${c.handoffPending ? '⚠️' : '—'} | ${isFromCustomer} "${msgPreview}" | ${new Date(c.updatedAt).toLocaleString('tr-TR')}`);
  });

  // 9. Bugünkü AI kullanımı
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usageCount = await prisma.aiUsageLog.count({
    where: { workspaceId: WORKSPACE_ID, createdAt: { gte: today } }
  });
  console.log('\n📊 AI KULLANIMI (Bugün):', usageCount);

  // 10. Bilgi Bankası
  const kbCount = await prisma.knowledgeBase.count({ where: { workspaceId: WORKSPACE_ID } });
  console.log('📚 BİLGİ BANKASI:', kbCount, 'kayıt');

  // SONUÇ ANALİZİ
  console.log('\n' + '='.repeat(60));
  console.log('📋 OTOMATİK TEŞHİS:');
  console.log('='.repeat(60));
  
  const issues = [];
  
  if (!ws?.aiApiKey && !gs?.globalAiApiKey) {
    issues.push('❌ API KEY YOK — Ne workspace ne de global API key tanımlı!');
  }
  
  if (bots.length === 0) {
    issues.push('❌ BOT YOK — Workspace\'de hiç bot oluşturulmamış!');
  } else {
    const activeBots = bots.filter(b => b.isActive);
    if (activeBots.length === 0) {
      issues.push('❌ AKTİF BOT YOK — Tüm botlar isActive: false!');
    }
  }
  
  // Instagram bot check
  const igBotAssigned = pages.some(p => p.instagramBotId);
  if (pages.length > 0 && !igBotAssigned) {
    issues.push('❌ INSTAGRAM BOT ATANMAMIŞ — Sayfalarda instagramBotId null!');
  }

  // FB bot check
  const fbBotAssigned = pages.some(p => p.assignedBotId);
  if (pages.length > 0 && !fbBotAssigned) {
    issues.push('⚠️ FACEBOOK BOT ATANMAMIŞ — Sayfalarda assignedBotId null');
  }

  // botEnabled check on recent conversations
  const disabledConvs = convs.filter(c => c.botEnabled === false && (c.channel === 'INSTAGRAM' || c.channel === 'FACEBOOK'));
  if (disabledConvs.length > 0) {
    issues.push(`⚠️ ${disabledConvs.length} konuşmada botEnabled=false — Handoff yapılmış olabilir`);
  }

  // Conversations with last message from customer (unanswered)
  const unanswered = convs.filter(c => c.messages[0]?.isFromContact === true);
  if (unanswered.length > 0) {
    issues.push(`⚠️ ${unanswered.length} konuşma müşteriden gelen son mesajla bırakılmış (yanıtsız)`);
  }

  if (issues.length === 0) {
    console.log('✅ Yapılandırma sorunsuz görünüyor. PM2 loglarında hata arayın:');
    console.log('   pm2 logs backend --lines 300 | grep -i "auto-reply\\|getAutoReply\\|error"');
  } else {
    issues.forEach(i => console.log(`   ${i}`));
  }

  console.log('\n💡 YARDIMCI KOMUTLAR:');
  console.log('   pm2 logs backend --lines 300 | grep -i "auto-reply\\|5b024db1"');
  console.log('   pm2 logs backend --raw --lines 100 | grep -i "instagram\\|bot"');

  process.exit(0);
}

debug().catch(e => { console.error('Script error:', e); process.exit(1); });
