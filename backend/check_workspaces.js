
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkWorkspaces() {
    try {
        const workspaces = await prisma.workspace.findMany();
        console.log("Workspaces:", JSON.stringify(workspaces, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkWorkspaces();
