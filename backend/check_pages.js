
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkPages() {
    try {
        const pages = await prisma.facebookPage.findMany({
            select: {
                pageId: true,
                pageName: true,
                workspaceId: true,
                instagramBusinessId: true,
                instagramUsername: true
            }
        });
        console.log(JSON.stringify(pages, null, 2));

        // Also check for any bots in those workspaces
        const workspaceIds = [...new Set(pages.map(p => p.workspaceId))];
        const bots = await prisma.aIBot.findMany({
            where: { workspaceId: { in: workspaceIds } },
            select: { id: true, name: true, workspaceId: true, isActive: true }
        });
        console.log("Bots:", JSON.stringify(bots, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkPages();
