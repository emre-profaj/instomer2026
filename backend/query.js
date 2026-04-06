import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();

async function run() {
  const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
  console.log('Total contacts:', await prisma.contact.count({ where: { workspaceId: wsId } }));
  console.log('Contacts with funnelStageId:', await prisma.contact.count({ where: { workspaceId: wsId, funnelStageId: { not: null } } }));
  
  const contactsWithHot = await prisma.contact.count({ 
    where: { 
      workspaceId: wsId, 
      OR: [
        { status: 'HOT_OPPORTUNITY' },
        { category: 'HOT_OPPORTUNITY' }
      ]
    } 
  });
  console.log('Contacts with HOT_OPPORTUNITY status/category:', contactsWithHot);
  
  await prisma.$disconnect();
}
run();
