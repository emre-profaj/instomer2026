/**
 * Geçmiş AI Call konuşmalarını numara kanalına bağlar.
 *
 * NEDEN: conversations.retellPhoneNumberId sonradan eklendi. Yeni açılan
 * konuşmalar numaraya bağlanıyor ama geçmiştekilerin alanı boş; kanala
 * göre filtre/rapor onları göstermiyor.
 *
 * Bilgi retell_calls tablosunda duruyor: her aramanın fromNumber, toNumber
 * ve direction'ı var. Bizim numaramız gelen aramada ARANAN (toNumber),
 * giden aramada ARAYAN (fromNumber) taraftır.
 *
 * Numara biçimleri tutarsız olabilir (+90 / 90 / boşluklu). Eşleştirme
 * ham metinle değil, yalnızca RAKAMLARIN son 10 hanesiyle yapılır —
 * "+ 908508405921", "908508405921" ve "+908508405921" aynı sayılır.
 *
 * Bir konuşmaya birden çok arama bağlıysa EN ESKİ arama esas alınır:
 * konuşmayı başlatan numara odur.
 *
 * Kullanım:
 *   node scripts/backfill-retell-conversation-numbers.js                          # yalnız rapor
 *   node scripts/backfill-retell-conversation-numbers.js --uygula                 # gerçekten yaz
 *   node scripts/backfill-retell-conversation-numbers.js --uygula --eksikleri-ekle
 *       Aramalarda görülen ama kanal olarak kayıtlı olmayan numaraları da
 *       kaydeder. Kullanımda olan bir numara ayarlardan eklenmemişse işe yarar.
 */
import prisma from '../lib/prisma.js';

const UYGULA = process.argv.includes('--uygula');
// Aramalarda görülen ama kanal olarak kayıtlı olmayan numaraları da ekler.
const EKSIKLERI_EKLE = process.argv.includes('--eksikleri-ekle');

/** Karşılaştırma anahtarı: yalnız rakamlar, son 10 hane. */
const anahtar = (no) => {
    const d = String(no || '').replace(/\D/g, '');
    return d.length >= 10 ? d.slice(-10) : (d || null);
};

async function main() {
    console.log(UYGULA ? '▶ UYGULAMA MODU — kayıtlar güncellenecek\n' : '▶ RAPOR MODU — hiçbir şey yazılmayacak\n');

    // Kanal olarak kayıtlı numaralar: workspace -> { anahtar -> id }
    const kanallar = await prisma.retellPhoneNumber.findMany({
        select: { id: true, workspaceId: true, number: true }
    });
    const kanalHaritasi = new Map();
    for (const k of kanallar) {
        const a = anahtar(k.number);
        if (!a) continue;
        if (!kanalHaritasi.has(k.workspaceId)) kanalHaritasi.set(k.workspaceId, new Map());
        kanalHaritasi.get(k.workspaceId).set(a, k.id);
    }
    console.log(`Kayıtlı numara kanalı: ${kanallar.length}`);

    // Numarası boş kalmış AI Call konuşmaları
    const konusmalar = await prisma.conversation.findMany({
        where: { channel: 'PHONE', retellPhoneNumberId: null },
        select: { id: true, workspaceId: true }
    });
    console.log(`Numarası boş telefon konuşması: ${konusmalar.length}\n`);
    if (konusmalar.length === 0) return;

    const idler = konusmalar.map(c => c.id);

    // İlgili aramalar — en eskiden yeniye; aynı konuşmanın ilk araması kazanır.
    const aramalar = await prisma.retellCall.findMany({
        where: { conversationId: { in: idler } },
        orderBy: { createdAt: 'asc' },
        select: { conversationId: true, workspaceId: true, direction: true, fromNumber: true, toNumber: true }
    });

    const ilkArama = new Map();
    for (const c of aramalar) {
        if (!ilkArama.has(c.conversationId)) ilkArama.set(c.conversationId, c);
    }

    let eslesen = 0, kanalYok = 0, aramaYok = 0;
    const eksikNumaralar = new Map(); // kanal olarak kayıtlı olmayanlar

    const yazilacak = [];
    for (const k of konusmalar) {
        const arama = ilkArama.get(k.id);
        if (!arama) { aramaYok++; continue; }

        const yon = String(arama.direction || '').toLowerCase();
        const bizimNo = yon === 'inbound' ? arama.toNumber : arama.fromNumber;
        const a = anahtar(bizimNo);
        const kanalId = a ? kanalHaritasi.get(arama.workspaceId)?.get(a) : null;

        if (!kanalId) {
            kanalYok++;
            if (bizimNo) eksikNumaralar.set(bizimNo, (eksikNumaralar.get(bizimNo) || 0) + 1);
            continue;
        }
        yazilacak.push({ id: k.id, retellPhoneNumberId: kanalId });
        eslesen++;
    }

    console.log('── SONUÇ ─────────────────────────────');
    console.log(`  eşleşen           : ${eslesen}`);
    console.log(`  arama kaydı yok   : ${aramaYok}   (konuşma bir Retell aramasına bağlı değil)`);
    console.log(`  numara kayıtlı değil: ${kanalYok}`);
    if (eksikNumaralar.size > 0) {
        console.log('\n  Kanal olarak kayıtlı OLMAYAN numaralar (ayarlardan ekleyin):');
        [...eksikNumaralar.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .forEach(([no, adet]) => console.log(`    ${no}  → ${adet} konuşma`));
    }

    if (!UYGULA) {
        console.log('\nYazmak için: node scripts/backfill-retell-conversation-numbers.js --uygula');
        if (eksikNumaralar.size > 0) {
            console.log('Eksik numaraları da kaydetmek için sona --eksikleri-ekle ekleyin.');
        }
        return;
    }

    // ── Eksik numaraları kanal olarak kaydet ────────────────────
    if (EKSIKLERI_EKLE && eksikNumaralar.size > 0) {
        // Numaranın hangi workspace'e ait olduğunu arama kaydından öğreniyoruz.
        let acilan = 0;
        for (const [no] of eksikNumaralar) {
            const a = anahtar(no);
            const ornek = aramalar.find(c => {
                const yon = String(c.direction || '').toLowerCase();
                const bizim = yon === 'inbound' ? c.toNumber : c.fromNumber;
                return anahtar(bizim) === a;
            });
            if (!ornek) continue;
            const mevcut = await prisma.retellPhoneNumber.findFirst({
                where: { workspaceId: ornek.workspaceId, number: no }
            });
            if (mevcut) continue;
            const yeni = await prisma.retellPhoneNumber.create({
                data: { workspaceId: ornek.workspaceId, number: no, label: null }
            });
            if (!kanalHaritasi.has(ornek.workspaceId)) kanalHaritasi.set(ornek.workspaceId, new Map());
            kanalHaritasi.get(ornek.workspaceId).set(a, yeni.id);
            acilan++;
            console.log(`   + kanal açıldı: ${no}`);
        }
        console.log(`✅ Yeni kanal: ${acilan}\n`);

        // Bu numaralar yüzünden eşleşmeyen konuşmaları tekrar dene
        for (const k of konusmalar) {
            if (yazilacak.some(y => y.id === k.id)) continue;
            const arama = ilkArama.get(k.id);
            if (!arama) continue;
            const yon = String(arama.direction || '').toLowerCase();
            const bizimNo = yon === 'inbound' ? arama.toNumber : arama.fromNumber;
            const a = anahtar(bizimNo);
            const kanalId = a ? kanalHaritasi.get(arama.workspaceId)?.get(a) : null;
            if (kanalId) yazilacak.push({ id: k.id, retellPhoneNumberId: kanalId });
        }
        console.log(`Yazılacak konuşma (eksikler dahil): ${yazilacak.length}`);
    }

    // Aynı kanala düşenleri topluca güncelle — konuşma başına tek sorgu yapmamak için.
    const kanalaGore = new Map();
    for (const y of yazilacak) {
        if (!kanalaGore.has(y.retellPhoneNumberId)) kanalaGore.set(y.retellPhoneNumberId, []);
        kanalaGore.get(y.retellPhoneNumberId).push(y.id);
    }

    let yazilan = 0;
    for (const [kanalId, konusmaIdleri] of kanalaGore) {
        for (let i = 0; i < konusmaIdleri.length; i += 500) {
            const parca = konusmaIdleri.slice(i, i + 500);
            const r = await prisma.conversation.updateMany({
                // retellPhoneNumberId: null koşulu bilinçli — bu script çalışırken
                // yeni bir arama aynı konuşmayı bağlamışsa onu ezmeyelim.
                where: { id: { in: parca }, retellPhoneNumberId: null },
                data: { retellPhoneNumberId: kanalId }
            });
            yazilan += r.count;
        }
    }
    console.log(`\n✅ Güncellenen konuşma: ${yazilan}`);
}

main()
    .catch((e) => {
        console.error('❌ Hata:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
