/**
 * Script: Tüm workspace'lerde SALES_PHONE_CALL ve APPOINTMENT_AUTO_PLAN 
 * kurallarını aktif et (isActive = true).
 * 
 * - Mevcut kurallar varsa → isActive: true olarak günceller
 * - Mevcut kural yoksa → yeni oluşturur (isActive: true)
 * 
 * Kullanım: node enable_intent_detection.js
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dir, '.env') });

import prisma from './lib/prisma.js';

async function enableIntentDetectionForAll() {
    console.log('🚀 Tüm workspace\'lerde niyet algılama kuralları aktifleştiriliyor...\n');

    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true }
    });

    console.log(`Toplam ${workspaces.length} workspace bulundu.\n`);

    let updated = 0;
    let created = 0;

    for (const ws of workspaces) {
        try {
            // SALES_PHONE_CALL (Arama Talebi Algılama)
            const callRule = await prisma.workspaceRule.upsert({
                where: {
                    workspaceId_ruleType_linkedStageId: { workspaceId: ws.id, ruleType: 'SALES_PHONE_CALL', linkedStageId: null }
                },
                create: {
                    workspaceId: ws.id,
                    ruleType: 'SALES_PHONE_CALL',
                    isActive: true,
                    config: JSON.stringify({ callDelayMinutes: 15, assignDirectly: false })
                },
                update: { isActive: true }  // Kapalıysa aç
            });

            // APPOINTMENT_AUTO_PLAN (Randevu Talebi Algılama)
            const apptRule = await prisma.workspaceRule.upsert({
                where: {
                    workspaceId_ruleType_linkedStageId: { workspaceId: ws.id, ruleType: 'APPOINTMENT_AUTO_PLAN', linkedStageId: null }
                },
                create: {
                    workspaceId: ws.id,
                    ruleType: 'APPOINTMENT_AUTO_PLAN',
                    isActive: true,
                    config: JSON.stringify({ teamId: null })
                },
                update: { isActive: true }  // Kapalıysa aç
            });

            // PHONE_CAPTURE (Telefon Yakalama) — da aktif olsun
            await prisma.workspaceRule.upsert({
                where: {
                    workspaceId_ruleType_linkedStageId: { workspaceId: ws.id, ruleType: 'PHONE_CAPTURE', linkedStageId: null }
                },
                create: {
                    workspaceId: ws.id,
                    ruleType: 'PHONE_CAPTURE',
                    isActive: true,
                    config: '{}'
                },
                update: { isActive: true }
            });

            const isNew = (new Date() - new Date(callRule.createdAt)) < 5000;
            if (isNew) {
                console.log(`  ✅ ${ws.name} — kurallar oluşturuldu ve aktifleştirildi`);
                created++;
            } else {
                console.log(`  🔄 ${ws.name} — kurallar aktifleştirildi`);
                updated++;
            }
        } catch (err) {
            console.error(`  ❌ ${ws.name} (${ws.id}) — hata: ${err.message}`);
        }
    }

    console.log(`\n✅ Tamamlandı: ${created} yeni oluşturuldu, ${updated} güncellendi (toplam: ${workspaces.length})`);
    await prisma.$disconnect();
}

enableIntentDetectionForAll().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
