const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const bots = await prisma.aIBot.findMany({
        where: { role: 'APPOINTMENT' },
        select: { id: true, name: true, prompt: true }
    });
    console.log(JSON.stringify(bots, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
