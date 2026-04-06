import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function checkAfterMigration() {
    console.log('--- POST-MIGRATION CHECK ---');
    try {
        const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9'; // Gürkayalar
        
        // Find Yeni Başvuru stage
        const stage = await prisma.funnelStage.findFirst({
            where: { name: 'Yeni Başvuru', funnel: { workspaceId: wsId } }
        });

        if (!stage) {
            console.log('Stage not found');
            return;
        }

        console.log(`Analyzing Stage UUID: ${stage.id}`);

        // Find contacts with this stage
        const contacts = await prisma.contact.findMany({
            where: { workspaceId: wsId, funnelStageId: stage.id }
        });

        console.log(`\nFound ${contacts.length} Contacts whose 'funnelStageId' is EXACTLY '${stage.id}'!`);
        contacts.forEach(c => console.log(`- ${c.name}`));

        // Let's also find all contacts whose status is still NULL
        const nullContacts = await prisma.contact.count({
            where: { workspaceId: wsId, funnelStageId: null }
        });
        console.log(`\nThere are ${nullContacts} Contacts in Gürkayalar who have NULL funnelStageId.`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkAfterMigration();
