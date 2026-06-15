import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        const ws = await prisma.workspace.findFirst();
        if (!ws) {
            console.log('No workspace found');
            return;
        }
        console.log('Using workspace:', ws.id);
        
        // 1. Get contacts with phone
        const contactsWithPhone = await prisma.contact.findMany({
            where: {
                workspaceId: ws.id,
                phone: { not: '' },
                NOT: { phone: null },
                isDeleted: false,
                isArchived: false
            },
            select: { id: true }
        });
        const contactIdsWithPhone = contactsWithPhone.map(c => c.id);
        console.log('Contacts with phone count:', contactIdsWithPhone.length);
        
        // 2. Query retellCall
        const retellCallWhere = {
            workspaceId: ws.id,
            contactId: { in: contactIdsWithPhone }
        };
        const retellCalledIds = await prisma.retellCall.findMany({
            where: retellCallWhere,
            select: { contactId: true },
            distinct: ['contactId']
        });
        console.log('Retell calls count (distinct):', retellCalledIds.length);

        // 3. Query humanCall
        const humanCallWhere = {
            workspaceId: ws.id,
            type: 'CALL',
            status: 'COMPLETED',
            contactId: { in: contactIdsWithPhone }
        };
        const humanCalledIds = await prisma.contactActivity.findMany({
            where: humanCallWhere,
            select: { contactId: true },
            distinct: ['contactId']
        });
        console.log('Human calls count (distinct):', humanCalledIds.length);
    } catch (e) {
        console.error('Query failed:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
