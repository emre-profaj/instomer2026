import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const wsId = 'cm6r3z49m0005d5tovf4y1oqi'; // Using actual workspaceId from logs? Wait, I don't know it.
    
    // get all HOT_OPPORUNITY contacts
    const contacts = await prisma.contact.findMany({
        where: { status: 'HOT_OPPORTUNITY' },
        include: { conversations: { select: { id: true, channel: true } } }
    });
    
    let totalConv = 0;
    console.log(`Contacts with HOT_OPPORTUNITY: ${contacts.length}`);
    for (const c of contacts) {
        totalConv += c.conversations.length;
        if (c.conversations.length > 1) {
            console.log(`Contact ${c.name} has ${c.conversations.length} conversations: ${c.conversations.map(c=>c.channel).join(', ')}`);
        }
    }
    console.log(`Total conversations for these contacts: ${totalConv}`);
}
main().catch(console.error).finally(()=>prisma.$disconnect());
