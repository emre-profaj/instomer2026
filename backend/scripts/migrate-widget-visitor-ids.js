/**
 * Ziyaretçi kimliklerini tags'ten widgetVisitorId kolonuna taşır.
 *
 * Web widget'ı her anonim ziyaretçiye v_xxxxxxxxx üretip kişinin ETİKETLERİNE
 * yazıyordu. Sonuç: etiket süzgeci tek kullanımlık kimliklerle doldu
 * (Metropol'de 163 gerçek etikete karşı 2.812 kimlik) ve her widget mesajı
 * indekssiz "contains" taraması yapıyordu.
 *
 * Kod artık kimliği kendi kolonuna yazıyor. Bu betik geride kalan kayıtları
 * taşır: ilk v_ etiketini kolona alır, TÜM v_ etiketlerini tags'ten çıkarır.
 *
 * Kullanım:
 *   node scripts/migrate-widget-visitor-ids.js            # yalnız rapor (varsayılan)
 *   node scripts/migrate-widget-visitor-ids.js --uygula   # gerçekten yaz
 */
import prisma from '../lib/prisma.js';

const UYGULA = process.argv.includes('--uygula');
const PARCA = 500;

const v_mi = (t) => typeof t === 'string' && t.trim().startsWith('v_');

function ayikla(raw) {
    let liste = [];
    try {
        const p = JSON.parse(raw || '[]');
        if (Array.isArray(p)) liste = p;
    } catch { return null; }
    const kimlikler = liste.filter(v_mi).map(t => t.trim());
    if (kimlikler.length === 0) return null;
    return { kimlik: kimlikler[0], kalan: liste.filter(t => !v_mi(t)), fazla: kimlikler.length > 1 };
}

async function main() {
    console.log(UYGULA ? '⚙️  UYGULAMA modu — kayıtlar güncellenecek' : '🔍 RAPOR modu — hiçbir şey yazılmayacak');

    let atlanan = 0, tasinan = 0, coklu = 0, cursor = null;
    const wsSayac = new Map();

    for (;;) {
        const grup = await prisma.contact.findMany({
            where: { tags: { contains: 'v_' } },
            select: { id: true, workspaceId: true, tags: true, widgetVisitorId: true },
            orderBy: { id: 'asc' },
            take: PARCA,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
        });
        if (grup.length === 0) break;
        cursor = grup[grup.length - 1].id;

        for (const k of grup) {
            const c = ayikla(k.tags);
            if (!c) { atlanan++; continue; }
            if (c.fazla) coklu++;
            wsSayac.set(k.workspaceId, (wsSayac.get(k.workspaceId) || 0) + 1);
            tasinan++;
            if (UYGULA) {
                await prisma.contact.update({
                    where: { id: k.id },
                    data: {
                        widgetVisitorId: k.widgetVisitorId || c.kimlik,
                        tags: JSON.stringify(c.kalan)
                    }
                });
            }
        }
        process.stdout.write(`\r  işlenen: ${tasinan + atlanan}`);
    }

    console.log(`\n\n  taşınacak kayıt : ${tasinan}`);
    console.log(`  birden fazla kimlik taşıyan: ${coklu} (ilki alınır)`);
    console.log(`  v_ içermeyen (atlandı): ${atlanan}`);
    console.log(`  etkilenen workspace: ${wsSayac.size}`);
    if (!UYGULA) console.log('\n  Yazmak için: --uygula');
    await prisma.$disconnect();
}

main().catch(async (e) => { console.error('❌', e); await prisma.$disconnect(); process.exit(1); });
