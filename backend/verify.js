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
  console.log('Total contacts:', await prisma.contact.count({ where: { workspaceId: wsId } }));
  console.log('Contacts with funnelStageId:', await prisma.contact.count({ where: { workspaceId: wsId, funnelStageId: { not: null } } }));
  console.log('Contacts with status=HOT_OPPORTUNITY:', await prisma.contact.count({ where: { workspaceId: wsId, status: 'HOT_OPPORTUNITY' } }));
  
  const funnelStagesCounts = await prisma.contact.groupBy({
      by: ['funnelStageId'],
      where: { workspaceId: wsId, funnelStageId: { not: null } },
      _count: true
  });
  console.log('Funnel Stage IDs inside Contact:', JSON.stringify(funnelStagesCounts, null, 2));

  const convFunnelStagesCounts = await prisma.conversation.groupBy({
      by: ['funnelStageId'],
      where: { workspaceId: wsId, funnelStageId: { not: null } },
      _count: true
  });
  console.log('Funnel Stage IDs inside Conversation:', JSON.stringify(convFunnelStagesCounts, null, 2));

  await prisma.$disconnect();
}
run();
