import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const wsId = 'cm6r3z49m0005d5tovf4y1oqi'; // generic run
    
    const conversations = await prisma.conversation.findMany({
        select: { id: true, funnelStageId: true, contactId: true },
        take: 10
    });
    console.log(conversations);
}
main().catch(console.error).finally(()=>prisma.$disconnect());
