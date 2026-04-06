const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const wsId = '5b024db1-f2c7-44f3-80bf-12f8edef5c01';

async function check() {
  // 1. Check bots
  const bots = await prisma.bot.findMany({ where: { workspaceId: wsId }, select: { id: true, name: true, isActive: true, schedulerEnabled: true, schedulerStartTime: true, schedulerEndTime: true, schedulerDays: true } });
  console.log('=== BOTS ===');
  bots.forEach(b => console.log(JSON.stringify(b)));

  // 2. Check Facebook pages & assigned bots
  const pages = await prisma.facebookPage.findMany({ where: { workspaceId: wsId }, select: { id: true, pageName: true, pageId: true, assignedBotId: true, commentBotId: true, instagramBotId: true, instagramCommentBotId: true, instagramBusinessId: true } });
  console.log('\n=== FACEBOOK PAGES ===');
  pages.forEach(p => console.log(JSON.stringify(p)));

  // 3. Check WhatsApp numbers & assigned bots
  const wa = await prisma.whatsAppPhoneNumber.findMany({ where: { workspaceId: wsId }, select: { id: true, phoneNumber: true, displayPhoneNumber: true, assignedBotId: true } });
  console.log('\n=== WHATSAPP NUMBERS ===');
  wa.forEach(w => console.log(JSON.stringify(w)));

  // 4. Check web widgets & assigned bots
  const widgets = await prisma.webWidget.findMany({ where: { workspaceId: wsId }, select: { id: true, isActive: true, assignedBotId: true } });
  console.log('\n=== WEB WIDGETS ===');
  widgets.forEach(w => console.log(JSON.stringify(w)));

  // 5. Check AI settings / API key
  const ws = await prisma.workspace.findUnique({ where: { id: wsId }, select: { aiApiKey: true, name: true } });
  console.log('\n=== WORKSPACE ===');
  console.log(JSON.stringify({ name: ws?.name, hasAiApiKey: !!ws?.aiApiKey }));

  // 6. Check global API key
  const global = await prisma.globalSettings.findFirst();
  console.log('\n=== GLOBAL SETTINGS ===');
  console.log(JSON.stringify({ hasGlobalKey: !!global?.globalAiApiKey }));

  // 7. Check company
  const company = await prisma.company.findFirst({ where: { workspaces: { some: { id: wsId } } }, select: { id: true, name: true, dailyAiLimit: true, subscription: true } });
  console.log('\n=== COMPANY ===');
  console.log(JSON.stringify(company));

  // 8. Check recent conversations for botEnabled status
  const convs = await prisma.conversation.findMany({ where: { workspaceId: wsId }, take: 5, orderBy: { updatedAt: 'desc' }, select: { id: true, botEnabled: true, channel: true, assignedBotId: true, facebookPageId: true, whatsappPhoneNumberId: true, updatedAt: true } });
  console.log('\n=== RECENT CONVERSATIONS ===');
  convs.forEach(c => console.log(JSON.stringify(c)));

  // 9. Check AI usage today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usageCount = await prisma.aiUsageLog.count({ where: { workspaceId: wsId, createdAt: { gte: today } } });
  console.log('\n=== AI USAGE TODAY ===');
  console.log('Count:', usageCount);

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
