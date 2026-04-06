import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

/**
 * Migrate legacy contact.status values to proper funnelStageId.
 * 
 * For contacts that have status but NO funnelStageId,
 * find the matching FunnelStage by name in the workspace's "Fırsat" funnel,
 * and set contact.funnelStageId accordingly.
 */

// Map legacy status strings to expected stage names
const STATUS_TO_STAGE_NAME = {
    'NEW': 'Yeni Başvuru',
    'OPPORTUNITY': 'Fırsat',
    'HOT_OPPORTUNITY': 'Sıcak Fırsat',
    'INFO_GIVEN': 'Bilgi Verildi',
    'UNREACHABLE': 'Ulaşılamadı',
    'CALLBACK': 'Tekrar Ara',
    'OFFER_GIVEN': 'Teklif Verildi',
    'APPOINTMENT': 'Randevu Planlandı',
    'APPOINTMENT_SCHEDULED': 'Randevu Planlandı',
    'NEGOTIATION': 'Pazarlık',
    'CONTRACT': 'Sözleşme',
    'SALE_COMPLETED': 'Satış',
    'LOST': 'Kayıp',
    'NOT_INTERESTED': 'İlgisiz',
};

async function migrateStatuses() {
    console.log('🔄 Starting Legacy Status → FunnelStageId Migration...\n');

    // Get all workspaces
    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true },
    });

    let totalUpdated = 0;
    let totalNoMatch = 0;

    for (const ws of workspaces) {
        // Find the "Fırsat" funnel for this workspace (primary CRM funnel)
        const firsatFunnel = await prisma.funnel.findFirst({
            where: { workspaceId: ws.id, name: 'Fırsat' },
            include: { stages: true }
        });

        if (!firsatFunnel) {
            console.log(`⏭️  Workspace "${ws.name}" — no Fırsat funnel, skipping`);
            continue;
        }

        // Build stage name → ID map
        const stageMap = new Map();
        for (const stage of firsatFunnel.stages) {
            stageMap.set(stage.name, stage.id);
        }

        // Find contacts with a known legacy status but NO funnelStageId
        const validStatuses = Object.keys(STATUS_TO_STAGE_NAME);
        const contacts = await prisma.contact.findMany({
            where: {
                workspaceId: ws.id,
                funnelStageId: null,
                status: { in: validStatuses }
            },
            select: { id: true, name: true, status: true }
        });

        if (contacts.length === 0) continue;

        console.log(`\n━━━ Workspace: "${ws.name}" ━━━`);
        console.log(`    ${contacts.length} contacts missing funnelStageId`);

        let wsUpdated = 0;
        let wsNoMatch = 0;

        for (const contact of contacts) {
            const expectedStageName = STATUS_TO_STAGE_NAME[contact.status];
            if (!expectedStageName) {
                wsNoMatch++;
                continue;
            }

            const stageId = stageMap.get(expectedStageName);
            if (!stageId) {
                wsNoMatch++;
                continue;
            }

            await prisma.contact.update({
                where: { id: contact.id },
                data: {
                    funnelStageId: stageId,
                    funnelType: firsatFunnel.id
                }
            });
            wsUpdated++;
        }

        console.log(`    ✅ Updated: ${wsUpdated}, No match: ${wsNoMatch}`);
        totalUpdated += wsUpdated;
        totalNoMatch += wsNoMatch;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏁 MIGRATION COMPLETE');
    console.log(`   Total contacts migrated: ${totalUpdated}`);
    console.log(`   No matching stage: ${totalNoMatch}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await prisma.$disconnect();
}

migrateStatuses().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
