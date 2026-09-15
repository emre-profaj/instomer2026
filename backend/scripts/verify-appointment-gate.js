/**
 * Randevu İzin Kapısı — Doğrulama Scripti (SALT OKUNUR, hiçbir kayıt oluşturmaz)
 *
 * Çalıştır:  node scripts/verify-appointment-gate.js
 *
 * Her workspace için "Randevu Talebi Algılama" anahtarının durumunu ve
 * bu durumda hangi yolların randevu oluşturabileceğini gösterir.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import prisma from '../lib/prisma.js';
import { isRuleEnabled, isAiCallingEnabled, RULES } from '../services/policy/automationPolicy.service.js';
import { APPOINTMENT_SOURCE } from '../services/domain/appointment.domain.js';

const AUTO_SOURCES = Object.values(APPOINTMENT_SOURCE).filter(s => s !== APPOINTMENT_SOURCE.MANUAL);

const run = async () => {
    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });

    console.log(`\n📋 ${workspaces.length} çalışma alanı denetleniyor\n`);
    console.log('─'.repeat(78));

    for (const ws of workspaces) {
        const [apptOn, callOn, phoneOn, hotOn] = await Promise.all([
            isRuleEnabled(ws.id, RULES.APPOINTMENT_AUTO_PLAN),
            isAiCallingEnabled(ws.id),
            isRuleEnabled(ws.id, RULES.PHONE_CAPTURE),
            isRuleEnabled(ws.id, RULES.HOT_KEYWORD),
        ]);

        console.log(`\n🏢 ${ws.name}`);
        console.log(`   📅 Randevu Talebi Algılama : ${apptOn ? '🟢 AÇIK' : '🔴 KAPALI'}`);
        console.log(`   🤖 AI Arama İzni (ana vana): ${callOn ? '🟢 AÇIK' : '🔴 KAPALI'}`);
        console.log(`   📱 Telefon Numarası Yakalama: ${phoneOn ? '🟢 AÇIK' : '🔴 KAPALI'}`);
        console.log(`   🔥 Sıcak Anahtar Kelime    : ${hotOn ? '🟢 AÇIK' : '🔴 KAPALI'}`);

        console.log(`   └─ Randevu oluşturabilen yollar:`);
        for (const src of AUTO_SOURCES) {
            console.log(`        ${apptOn ? '✅' : '⛔'} ${src.padEnd(12)} ${apptOn ? 'oluşturabilir' : 'ENGELLİ (izin kapısı)'}`);
        }
        console.log(`        ✅ ${APPOINTMENT_SOURCE.MANUAL.padEnd(12)} oluşturabilir (elle giriş her zaman serbest)`);

        // Son 7 günde hangi yollardan randevu gelmiş?
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recent = await prisma.appointment.count({
            where: { workspaceId: ws.id, createdAt: { gte: since } },
        });
        const botMade = await prisma.appointment.count({
            where: { workspaceId: ws.id, createdAt: { gte: since }, createdByBotId: { not: null } },
        });
        console.log(`   └─ Son 7 gün: ${recent} randevu (${botMade} tanesi bot kaynaklı)`);
    }

    console.log('\n' + '─'.repeat(78));
    console.log('ℹ️  Bu script hiçbir kayıt oluşturmaz/değiştirmez.\n');
    await prisma.$disconnect();
};

run().catch(async (err) => {
    console.error('❌ Hata:', err.message);
    await prisma.$disconnect();
    process.exit(1);
});
