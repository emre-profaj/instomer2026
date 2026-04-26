import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

async function run() {
  const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
  
  // Find Yeni Başvuru stage
  const stage = await prisma.funnelStage.findFirst({
      where: { name: 'Yeni Başvuru' }
  });
  
  if (!stage) {
      console.log('Stage "Yeni Başvuru" not found');
      return;
  }
  
  console.log(`Analyzing Stage: Yeni Başvuru (${stage.id})`);

  // Count conversations with this stage
  const allConvos = await prisma.conversation.count({
      where: { workspaceId: wsId, funnelStageId: stage.id }
  });
  
  const openConvos = await prisma.conversation.count({
      where: { workspaceId: wsId, funnelStageId: stage.id, status: 'OPEN' }
  });

  console.log(`- Total Conversations in this stage: ${allConvos}`);
  console.log(`- Open Conversations in this stage: ${openConvos}`);

  // Count Contacts where their direct funnelStageId matches
  const contactsDirect = await prisma.contact.count({
      where: { workspaceId: wsId, funnelStageId: stage.id }
  });
  console.log(`- Contacts currently labeled with this stage globally: ${contactsDirect}`);
  
  // Let's see some details of the open convos
  const sampleConvos = await prisma.conversation.findMany({
      where: { workspaceId: wsId, funnelStageId: stage.id },
      include: { contact: true },
      take: 5
  });
  
  console.log('\nSample Conversations in Yeni Başvuru:');
  sampleConvos.forEach(c => {
      console.log(`  Conv ID: ${c.id} | Status: ${c.status} | Contact: ${c.contact?.name} | Contact's Global FunnelStage: ${c.contact?.funnelStageId}`);
  });
  
  await prisma.$disconnect();
}
run();
