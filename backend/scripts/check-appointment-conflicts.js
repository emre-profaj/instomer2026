/**
 * Çakışma Kontrolü — ETKİ ANALİZİ (SALT OKUNUR)
 *
 *   node scripts/check-appointment-conflicts.js [gün]
 *
 * Yeni çakışma kontrolü devreye girerse geçmişte kaç randevu REDDEDİLİRDİ?
 * Hiçbir kayıt oluşturmaz/değiştirmez.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import prisma from '../lib/prisma.js';

const DAYS = parseInt(process.argv[2] || '30', 10);

const run = async () => {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

    const appts = await prisma.appointment.findMany({
        where: { createdAt: { gte: since } },
        select: {
            id: true, workspaceId: true, createdAt: true, startTime: true, endTime: true,
            assignedToId: true, resourceId: true, createdByBotId: true, status: true,
            contactName: true, doctorName: true,
            workspace: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    console.log(`\n📊 Son ${DAYS} gün · ${appts.length} randevu inceleniyor\n`);
    console.log('─'.repeat(78));

    const stats = new Map(); // workspace -> {total, bot, ownerless, wouldReject, samples[]}

    for (const a of appts) {
        const wsName = a.workspace?.name || a.workspaceId;
        if (!stats.has(wsName)) stats.set(wsName, { total: 0, bot: 0, ownerless: 0, wouldReject: 0, samples: [] });
        const s = stats.get(wsName);
        s.total++;
        if (a.createdByBotId) s.bot++;

        // Takvim sahibi yoksa çakışma kontrolü YAPILMIYOR (domain katmanındaki kural)
        if (!a.assignedToId && !a.resourceId) { s.ownerless++; continue; }

        // Bu randevudan ÖNCE oluşturulmuş, aynı sahibe ait, zamanı çakışan var mı?
        const owners = [];
        if (a.assignedToId) owners.push({ assignedToId: a.assignedToId });
        if (a.resourceId) owners.push({ resourceId: a.resourceId });

        const clash = await prisma.appointment.findFirst({
            where: {
                id: { not: a.id },
                createdAt: { lt: a.createdAt },
                status: { notIn: ['CANCELLED', 'COMPLETED'] },
                OR: owners,
                AND: [{
                    OR: [
                        { startTime: { lte: a.startTime }, endTime: { gt: a.startTime } },
                        { startTime: { lt: a.endTime }, endTime: { gte: a.endTime } },
                        { startTime: { gte: a.startTime }, endTime: { lte: a.endTime } },
                    ],
                }],
            },
            select: { id: true, startTime: true, contactName: true },
        });

        if (clash) {
            s.wouldReject++;
            if (s.samples.length < 3) {
                s.samples.push({
                    when: a.startTime.toISOString().slice(0, 16).replace('T', ' '),
                    who: a.contactName || '-',
                    doctor: a.doctorName || '-',
                    bot: !!a.createdByBotId,
                    clashWith: clash.contactName || clash.id.slice(0, 8),
                });
            }
        }
    }

    let gTotal = 0, gReject = 0, gBot = 0;
    [...stats.entries()]
        .sort((x, y) => y[1].total - x[1].total)
        .forEach(([name, s]) => {
            gTotal += s.total; gReject += s.wouldReject; gBot += s.bot;
            const flag = s.wouldReject > 0 ? '⚠️ ' : '✅ ';
            console.log(`\n${flag}${name}`);
            console.log(`   Toplam ${s.total} · bot ${s.bot} · takvim sahibi yok ${s.ownerless} (kontrol dışı)`);
            if (s.wouldReject > 0) {
                const pct = ((s.wouldReject / s.total) * 100).toFixed(1);
                console.log(`   ⛔ REDDEDİLİRDİ: ${s.wouldReject} (%${pct})`);
                s.samples.forEach(x =>
                    console.log(`      · ${x.when} ${x.who} (${x.doctor})${x.bot ? ' [BOT]' : ''} ↔ ${x.clashWith}`));
            }
        });

    console.log('\n' + '─'.repeat(78));
    console.log(`\nGENEL: ${gTotal} randevu · ${gBot} bot kaynaklı`);
    console.log(`       ${gReject} tanesi yeni kontrolle REDDEDİLİRDİ (%${gTotal ? ((gReject / gTotal) * 100).toFixed(1) : 0})`);
    if (gReject === 0) {
        console.log('\n✅ Geçmiş veride hiç çakışma yok — kontrolü açmak kimseyi etkilemez.');
    } else {
        console.log('\n⚠️  Çakışan randevular var. Bu, mevcut sistemde ÇİFT REZERVASYON yapıldığı anlamına gelir.');
        console.log('   Kontrolü açmak bunları engeller — ama iş akışı buna dayanıyorsa önce konuş.');
    }
    console.log('');
    await prisma.$disconnect();
};

run().catch(async (e) => { console.error('❌', e.message); await prisma.$disconnect(); process.exit(1); });
