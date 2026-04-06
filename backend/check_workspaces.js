
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkWorkspaces() {
    try {
        const workspaces = await prisma.workspace.findMany({
            select: {
                id: true,
                name: true,
                slug: true
            }
        });
        console.log("\n🚀 Workspace List:");
        console.table(workspaces);
    } catch (error) {
        console.error("❌ Error listing workspaces:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkWorkspaces();
