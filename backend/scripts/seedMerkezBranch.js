// Tüm workspace'lere "Merkez" şube oluştur (yoksa)
// Kullanım: node scripts/seedMerkezBranch.js

import prisma from '../lib/prisma.js';

async function seedMerkez() {
    const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
    console.log(`📋 ${workspaces.length} workspace bulundu\n`);

    let created = 0;
    let skipped = 0;

    for (const ws of workspaces) {
        const existing = await prisma.appointmentBranch.findFirst({
            where: { workspaceId: ws.id, name: 'Merkez' }
        });

        if (existing) {
            console.log(`⏭️  ${ws.name} → Merkez zaten var`);
            skipped++;
            continue;
        }

        await prisma.appointmentBranch.create({
            data: {
                workspaceId: ws.id,
                name: 'Merkez',
                isActive: true,
                order: 0
            }
        });
        console.log(`✅ ${ws.name} → Merkez oluşturuldu`);
        created++;
    }

    console.log(`\n📊 Sonuç: ${created} oluşturuldu, ${skipped} zaten vardı`);
    await prisma.$disconnect();
}

seedMerkez().catch(e => { console.error(e); process.exit(1); });
