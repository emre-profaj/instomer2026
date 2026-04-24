require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const wsId = '5b024db1-f2c7-44f3-80bf-12f8edef5c01';

(async () => {
  const bots = await p.aIBot.findMany({ where: { workspaceId: wsId }, select: { id: true, name: true, isActive: true, schedulerEnabled: true } });
  console.log('=== BOTLAR ===');
  bots.forEach(b => console.log(JSON.stringify(b)));

  const pages = await p.facebookPage.findMany({ where: { workspaceId: wsId }, select: { pageName: true, assignedBotId: true, instagramBotId: true, instagramBusinessId: true } });
  console.log('\n=== SAYFALAR ===');
  pages.forEach(pg => console.log(JSON.stringify(pg)));

  const convs = await p.conversation.findMany({ where: { workspaceId: wsId }, take: 10, orderBy: { updatedAt: 'desc' }, select: { id: true, botEnabled: true, channel: true, assignedBotId: true, updatedAt: true } });
  console.log('\n=== SON KONUSMALAR ===');
  convs.forEach(c => console.log(JSON.stringify(c)));

  const ws = await p.workspace.findUnique({ where: { id: wsId }, select: { aiApiKey: true } });
  const gs = await p.globalSettings.findFirst();
  console.log('\n=== API KEYS ===');
  console.log('Workspace key:', !!ws?.aiApiKey);
  console.log('Global key:', !!gs?.globalAiApiKey);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
