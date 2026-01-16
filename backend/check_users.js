
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkUsers() {
    try {
        const count = await prisma.user.count();
        console.log("User count:", count);
        if (count > 0) {
            const users = await prisma.user.findMany({ take: 2 });
            console.log("Sample users:", JSON.stringify(users, null, 2));
        }
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUsers();
