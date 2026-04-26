import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function showStatuses() {
    console.log('--- SYSTEM STATUS & FUNNEL DIAGNOSTICS ---');
    try {
        // Find ALL Legacy Statuses in use
        const contactStatuses = await prisma.contact.groupBy({
            by: ['status'],
            _count: { status: true },
            orderBy: { _count: { status: 'desc' } }
        });

        console.log('\n[Eski Sistem] Kontakların Sahip Olduğu Kalıcı "Status" Klasörleri (Sayılarıyla):');
        contactStatuses.forEach(s => {
            console.log(`- ${s.status || 'NULL'}: ${s._count.status} kişi`);
        });

        const convStatuses = await prisma.conversation.groupBy({
            by: ['status'],
            _count: { status: true }
        });

        console.log('\n[Sistem Mimarisi] Sohbet Durumları (Açık/Kapalı vb.):');
        convStatuses.forEach(s => {
            console.log(`- ${s.status}: ${s._count.status} adet işlem`);
        });

        // Find ALL Funnel Stages
        const funnels = await prisma.funnel.findMany({
            include: {
                stages: {
                    orderBy: { order: 'asc' }
                }
            }
        });

        console.log('\n[Yeni Sistem] Tanımlı Olan Tüm Huniler ve Aşamaları:');
        funnels.forEach(f => {
            console.log(`\n📌 Huni: ${f.name} (Workspace: ${f.workspaceId === 'd91029d6-8b1f-4265-a385-4a40eafc0ac9' ? 'Gürkayalar' : 'Diğer'})`);
            f.stages.forEach(s => {
                console.log(`   └─ ${s.name} (Renk: ${s.color})`);
            });
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

showStatuses();
