import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    try {
        const result = await prisma.conversation.findMany({
            where: { isInternalChat: true }
        });
        console.log("SUCCESS:", result.length);
    } catch (e) {
        console.error("ERROR:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
