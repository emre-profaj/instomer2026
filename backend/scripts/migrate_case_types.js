/**
 * Migration Script: Mevcut case'lerin legacy `type` field'ından `caseTypeId`'ye geçirilmesi
 * 
 * Bu script:
 * 1. Her workspace için CaseType kayıtlarını kontrol eder (yoksa oluşturur)
 * 2. `caseTypeId` null olan case'leri bulur
 * 3. Legacy `type` field'ındaki değere göre (FIRSAT, SIKAYET vb.) uygun CaseType'a bağlar
 * 
 * Kullanım: node --experimental-modules backend/scripts/migrate_case_types.js
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const DEFAULT_CASE_TYPES = [
    { name: 'Fırsat', systemCode: 'FIRSAT', color: '#eab308', icon: '💰', order: 0 },
    { name: 'Şikayet', systemCode: 'SIKAYET', color: '#dc2626', icon: '⚠️', order: 1 },
    { name: 'Randevu', systemCode: 'RANDEVU', color: '#1d4ed8', icon: '📅', order: 2 },
    { name: 'Destek', systemCode: 'DESTEK', color: '#0369a1', icon: '🛠️', order: 3 },
    { name: 'İş Başvurusu', systemCode: 'IS_BASVURUSU', color: '#6d28d9', icon: '📋', order: 4 },
    { name: 'Genel', systemCode: 'GENEL', color: '#6b7280', icon: '📁', order: 5 },
];

async function migrate() {
    console.log('🔄 CaseType Migration başlıyor...\n');

    // 1. Tüm workspace'leri al
    const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
    console.log(`📋 ${workspaces.length} workspace bulundu\n`);

    let totalMigrated = 0;

    for (const ws of workspaces) {
        console.log(`\n── Workspace: ${ws.name} (${ws.id}) ──`);

        // 2. Bu workspace'teki CaseType'ları kontrol et / oluştur
        let caseTypes = await prisma.caseType.findMany({ where: { workspaceId: ws.id } });
        if (caseTypes.length === 0) {
            console.log('  🌱 CaseType yok, varsayılanlar oluşturuluyor...');
            await prisma.caseType.createMany({
                data: DEFAULT_CASE_TYPES.map(ct => ({ ...ct, workspaceId: ws.id }))
            });
            caseTypes = await prisma.caseType.findMany({ where: { workspaceId: ws.id } });
            console.log(`  ✅ ${caseTypes.length} CaseType oluşturuldu`);
        }

        // systemCode → id map'i oluştur
        const codeToId = {};
        for (const ct of caseTypes) {
            if (ct.systemCode) codeToId[ct.systemCode] = ct.id;
        }

        // 3. caseTypeId null olan case'leri bul
        const casesWithoutType = await prisma.case.findMany({
            where: { workspaceId: ws.id, caseTypeId: null },
            select: { id: true, type: true }
        });

        if (casesWithoutType.length === 0) {
            console.log('  ℹ️ Tüm case\'ler zaten CaseType\'a bağlı');
            continue;
        }

        console.log(`  📦 ${casesWithoutType.length} case caseTypeId bekliyor`);

        // 4. Legacy type → CaseType eşleştirme
        let migrated = 0;
        for (const c of casesWithoutType) {
            const legacyType = c.type || 'GENEL';
            const newTypeId = codeToId[legacyType] || codeToId['GENEL'];
            if (newTypeId) {
                await prisma.case.update({
                    where: { id: c.id },
                    data: { caseTypeId: newTypeId }
                });
                migrated++;
            }
        }

        console.log(`  ✅ ${migrated}/${casesWithoutType.length} case güncellendi`);
        totalMigrated += migrated;
    }

    console.log(`\n\n🎉 Migration tamamlandı! Toplam ${totalMigrated} case güncellendi.`);
    await prisma.$disconnect();
}

migrate().catch(err => {
    console.error('❌ Migration hatası:', err);
    prisma.$disconnect();
    process.exit(1);
});
