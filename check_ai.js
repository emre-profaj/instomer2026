const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const ws = '5b024db1-f2c7-44f3-80bf-12f8edef5c01';

(async () => {
  const bots = await p.aIBot.findMany({ where: { workspaceId: ws }, select: { id: true, name: true, isActive: true } });
  console.log('BOTS:', JSON.stringify(bots, null, 2));

  const pages = await p.facebookPage.findMany({ where: { workspaceId: ws }, select: { pageName: true, assignedBotId: true, instagramBotId: true } });
  console.log('PAGES:', JSON.stringify(pages, null, 2));

  const ws2 = await p.workspace.findUnique({ where: { id: ws }, select: { aiApiKey: true } });
  console.log('HAS_API_KEY:', !!ws2?.aiApiKey);

  const gs = await p.globalSettings.findFirst();
  console.log('HAS_GLOBAL_KEY:', !!gs?.globalAiApiKey);

  // Check recent conversations
  const convs = await p.conversation.findMany({
    where: { workspaceId: ws },
    take: 5,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, botEnabled: true, channel: true, assignedBotId: true, updatedAt: true }
  });
  console.log('RECENT_CONVS:', JSON.stringify(convs, null, 2));

  // Check AI usage
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const count = await p.aiUsageLog.count({ where: { workspaceId: ws, createdAt: { gte: today } } });
  console.log('AI_USAGE_TODAY:', count);

  // Check company limit
  const company = await p.company.findFirst({
    where: { workspaces: { some: { id: ws } } },
    select: { name: true, dailyAiLimit: true, subscription: true }
  });
  console.log('COMPANY:', JSON.stringify(company));

  process.exit(0);
})();
