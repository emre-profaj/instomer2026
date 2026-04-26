import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function checkFunnels() {
    const funnels = await prisma.funnel.findMany({
        select: { id: true, name: true, color: true }
    });
    console.log(JSON.stringify(funnels, null, 2));
}

checkFunnels()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
