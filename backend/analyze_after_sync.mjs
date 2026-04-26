import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Manual .env parsing
const envFile = fs.readFileSync('.env', 'utf8');
const dbUrlMatch = envFile.match(/DATABASE_URL=["']?(.+?)["']?(\n|$)/);
const databaseUrl = dbUrlMatch ? dbUrlMatch[1] : null;

if (!databaseUrl) {
  console.error('❌ Could not find DATABASE_URL in .env');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl }
  }
});

async function run() {
  const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
  try {
    console.log('----------------------------------------------------');
    console.log('🏁 POST-SYNC VERIFICATION');
    console.log('----------------------------------------------------');

    // 1. Sıcak Fırsat
    const hotContacts = await prisma.contact.count({
      where: { workspaceId: wsId, status: 'HOT_OPPORTUNITY', isArchived: false }
    });
    const hotStage = await prisma.funnelStage.findFirst({ where: { name: 'Sıcak Fırsat' } });
    const hotConvs = await prisma.conversation.count({
      where: { workspaceId: wsId, funnelStageId: hotStage?.id }
    });

    // 2. Fırsat
    const oppContacts = await prisma.contact.count({
      where: { workspaceId: wsId, status: 'OPPORTUNITY', isArchived: false }
    });
    const oppStage = await prisma.funnelStage.findFirst({ where: { name: 'Fırsat' } });
    const oppConvs = await prisma.conversation.count({
      where: { workspaceId: wsId, funnelStageId: oppStage?.id }
    });

    // 3. Bilgi Verildi
    const infoContacts = await prisma.contact.count({
      where: { workspaceId: wsId, status: 'INFO_GIVEN', isArchived: false }
    });
    const infoStage = await prisma.funnelStage.findFirst({ where: { name: 'Bilgi Verildi' } });
    const infoConvs = await prisma.conversation.count({
      where: { workspaceId: wsId, funnelStageId: infoStage?.id }
    });

    console.log('🔥 [Sıcak Fırsat] Kişi:', hotContacts, '| Konuşma (Stage):', hotConvs);
    console.log('💰 [Fırsat] Kişi:', oppContacts, '| Konuşma (Stage):', oppConvs);
    console.log('ℹ️ [Bilgi Verildi] Kişi:', infoContacts, '| Konuşma (Stage):', infoConvs);
    console.log('----------------------------------------------------');

  } catch (e) {
    console.error('Hata:', e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
