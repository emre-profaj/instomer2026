/**
 * AI Arama İzni Kapısı — ETKİ ANALİZİ (SALT OKUNUR)
 *
 *   node scripts/verify-call-gate.js [gün]
 *
 * Vana kapalıyken kaç otomatik arama engellenecekti? Hiçbir kayıt
 * oluşturmaz/değiştirmez.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import prisma from '../lib/prisma.js';

const DAYS = parseInt(process.argv[2] || '7', 10);

const run = async () => {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true, retellAutoCallEnabled: true, retellApiKey: true },
        orderBy: { name: 'asc' },
    });

    const acik = workspaces.filter(w => w.retellAutoCallEnabled);
    const anahtarli = workspaces.filter(w => w.retellApiKey);

    console.log(`\n📞 AI ARAMA İZNİ — ETKİ ANALİZİ (son ${DAYS} gün)\n`);
    console.log('─'.repeat(74));
    console.log(`  Toplam çalışma alanı        : ${workspaces.length}`);
    console.log(`  Retell API anahtarı olan     : ${anahtarli.length}`);
    console.log(`  "AI Arama İzni" AÇIK olan    : ${acik.length}`);
    console.log('─'.repeat(74));

    const calls = await prisma.scheduledCall.findMany({
        where: { createdAt: { gte: since } },
        select: { workspaceId: true, createdById: true, status: true, attemptNumber: true },
    });

    const byWs = new Map();
    for (const c of calls) {
        if (!byWs.has(c.workspaceId)) byWs.set(c.workspaceId, { toplam: 0, otomatik: 0, manuel: 0 });
        const s = byWs.get(c.workspaceId);
        s.toplam++;
        // activity_* → görev üzerinden otomatik; diğerleri elle tetiklenmiş sayılır
        if (String(c.createdById || '').startsWith('activity_')) s.otomatik++;
        else s.manuel++;
    }

    let engellenecek = 0, gecerli = 0;
    const satirlar = [];
    for (const w of workspaces) {
        const s = byWs.get(w.id);
        if (!s || s.toplam === 0) continue;
        if (w.retellAutoCallEnabled) gecerli += s.otomatik;
        else engellenecek += s.otomatik;
        satirlar.push({ ad: w.name, vana: w.retellAutoCallEnabled, ...s });
    }

    satirlar.sort((a, b) => b.otomatik - a.otomatik);
    // NOT: console.log Node'da %-34s gibi dolgu biçimlerini desteklemez —
    // biçim dizesi olduğu gibi basılır. padEnd/padStart ile hizalıyoruz.
    console.log('\n' + 'ÇALIŞMA ALANI'.padEnd(34) + 'VANA'.padEnd(10)
        + 'TOPLAM'.padStart(6) + 'OTOMATİK'.padStart(9) + 'MANUEL'.padStart(8));
    console.log('─'.repeat(74));
    for (const r of satirlar) {
        const vana = r.vana ? '🟢 AÇIK' : '🔴 KAPALI';
        const flag = (!r.vana && r.otomatik > 0) ? '  ⛔' : '';
        console.log(`${r.ad.substring(0, 33).padEnd(34)} ${vana.padEnd(10)} ${String(r.toplam).padStart(6)} ${String(r.otomatik).padStart(8)} ${String(r.manuel).padStart(7)}${flag}`);
    }

    console.log('\n' + '─'.repeat(74));
    console.log(`\n  Vana AÇIK alanlarda otomatik arama  : ${gecerli}   (etkilenmez)`);
    console.log(`  Vana KAPALI alanlarda otomatik arama: ${engellenecek}   ⛔ ENGELLENECEK`);
    console.log(`  Elle başlatılan aramalar            : ${calls.length - gecerli - engellenecek}   (her zaman serbest)`);

    if (engellenecek > 0) {
        console.log(`\n⚠️  ${engellenecek} arama durur. Bu aramaların yapılmasını istiyorsan`);
        console.log(`   ilgili çalışma alanlarında panelden "AI Arama İzni"ni AÇ.`);
    } else {
        console.log('\n✅ Engellenecek arama yok.');
    }
    console.log('');
    await prisma.$disconnect();
};

run().catch(async (e) => { console.error('❌', e.message); await prisma.$disconnect(); process.exit(1); });
