import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const doctors = await prisma.appointmentDoctor.findMany({
        where: { isActive: true },
        select: {
            name: true,
            workStart: true,
            workEnd: true,
            workingDays: true,
            slotMinutes: true
        }
    });
    console.log("Doctors:", JSON.stringify(doctors, null, 2));
    
    const users = await prisma.user.findMany({
        select: {
            name: true,
            workingHours: true
        },
        take: 5
    });
    console.log("Users:", JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
