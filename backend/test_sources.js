import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkSources() {
  const deals = await prisma.deal.findMany({
    include: {
      contact: {
        select: { source: true }
      }
    },
    take: 100,
    orderBy: { createdAt: 'desc' }
  });

  const sourceCounts = {};
  for (const deal of deals) {
    const s = deal.contact?.source || 'NULL';
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  }
  
  console.log("Recent 100 Deals by Source:", sourceCounts);

  const contacts = await prisma.contact.groupBy({
    by: ['source'],
    _count: true
  });
  console.log("All Contacts by Source:", contacts);
}
checkSources().finally(() => prisma.$disconnect());
