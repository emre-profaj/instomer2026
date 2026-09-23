/**
 * ═══════════════════════════════════════════════════════════════
 * WEB WIDGET — YAPILANDIRILMIŞ İÇERİK (KARTLAR)
 * ═══════════════════════════════════════════════════════════════
 *
 * Widget bugüne kadar yalnızca düz metin gösterebiliyordu. Bu servis,
 * botun ürettiği cevabın YANINDA gösterilecek kartları üretir:
 * ürün kartları, hızlı yanıt çipleri, link / dosya / konum kartı.
 *
 * Tasarım kararı: kartlar AI çıktısından ÇIKARILMAZ. Model bir JSON
 * üretmeye zorlanmaz, metni ayrıştırılmaz. Kartlar doğrudan veritabanından
 * ve catalogFlow'un zaten hesapladığı adımdan gelir. Böylece:
 *   - Kartta olmayan bir ürün asla görünmez (uydurma riski sıfır).
 *   - Fiyat kuralı prompt ile birebir aynı kalır.
 *   - Model değişse bile kartlar aynı kalır.
 *
 * Çıktı şekli (widget.js bunu okur):
 *   [{ kind: 'products',     items: [{ id, name, note, priceText, imageUrl, url }] },
 *    { kind: 'quickReplies', items: [{ id, label }] },
 *    { kind: 'link',         title, summary, url, domain },
 *    { kind: 'file',         items: [{ name, url, sizeText, ext }] },
 *    { kind: 'location',     name, address, phone, mapsUrl }]
 */

import prisma from '../lib/prisma.js';

const MAX_KART = 8;

/** Yalnızca http(s). javascript:, data: ve benzeri şemalar dışarıda kalır. */
export function guvenliUrl(deger) {
    if (!deger || typeof deger !== 'string') return null;
    const temiz = deger.trim();
    if (!temiz) return null;
    try {
        const u = new URL(temiz, 'https://x.invalid');
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        // Göreli yol (ör. /uploads/...) olduğu gibi kalsın
        if (/^\//.test(temiz)) return temiz;
        return u.href;
    } catch {
        return null;
    }
}

function alanAdi(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

const KONUM_KELIMELERI = [
    'adres', 'adresi', 'nerede', 'neredesiniz', 'konum', 'yol tarifi',
    'nasıl gelebilirim', 'nasıl gidilir', 'nasil gidilir', 'harita',
    'şube nerede', 'sube nerede', 'lokasyon'
];

const KATALOG_KELIMELERI = [
    'katalog', 'broşür', 'brosur', 'fiyat listesi', 'fiyat listesini',
    'döküman', 'dokuman', 'doküman', 'pdf', 'liste gönder', 'liste yolla'
];

function iceriyorMu(metin, kelimeler) {
    const t = (metin || '').toLocaleLowerCase('tr-TR');
    return kelimeler.some(k => t.includes(k));
}

// ─── Kaynaklar ───────────────────────────────────────────────

/**
 * Katalog adımından kart üretir.
 * Adımı yeniden hesaplar: botun gördüğü adımın AYNISI, çünkü aynı
 * girdilerle aynı fonksiyon çağrılıyor. Modelden bir şey taşımıyoruz.
 */
async function katalogBloklari(workspaceId, { conversationId, userMessage, botId }) {
    try {
        const { buildCatalogStep } = await import('./catalogFlow.service.js');
        const adim = await buildCatalogStep(workspaceId, {
            conversationId,
            userMessage,
            botId
        });
        if (!adim) return [];

        if (adim.step === 'SHOW_PRODUCTS' && Array.isArray(adim.cards) && adim.cards.length > 0) {
            const bloklar = [{
                kind: 'products',
                items: adim.cards.slice(0, MAX_KART).map(c => ({
                    id: c.id,
                    name: c.name,
                    note: c.note || null,
                    priceText: c.priceText || null,
                    imageUrl: guvenliUrl(c.imageUrl),
                    url: guvenliUrl(c.url)
                }))
            }];
            if (adim.totalCount > adim.cards.length) {
                bloklar.push({
                    kind: 'quickReplies',
                    items: [{ id: 'hepsi', label: `Tümünü göster (${adim.totalCount})` }]
                });
            }
            return bloklar;
        }

        // Soru adımlarında seçenekler çipe dönüşür: müşteri "1" yazmak
        // yerine dokunur. Metin cevabı yine botun kendi cümlesi.
        if (Array.isArray(adim.options) && adim.options.length > 1) {
            return [{
                kind: 'quickReplies',
                items: adim.options.slice(0, 6).map(o => ({ id: o.id, label: o.label }))
            }];
        }
        return [];
    } catch (err) {
        console.error('[WidgetKart] Katalog adımı okunamadı:', err.message);
        return [];
    }
}

/** Müşteri adres/konum sorduysa şube ya da şirket konum kartı. */
async function konumBlogu(workspaceId, { conversationId, userMessage }) {
    if (!iceriyorMu(userMessage, KONUM_KELIMELERI)) return [];
    try {
        const conv = conversationId
            ? await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { branchId: true }
            })
            : null;

        if (conv?.branchId) {
            const sube = await prisma.appointmentBranch.findUnique({
                where: { id: conv.branchId },
                select: { name: true, address: true, phone: true, googleMapsUrl: true }
            });
            if (sube && (sube.address || sube.googleMapsUrl)) {
                return [{
                    kind: 'location',
                    name: sube.name,
                    address: sube.address || null,
                    phone: sube.phone || null,
                    mapsUrl: guvenliUrl(sube.googleMapsUrl)
                }];
            }
        }

        // Şube belli değilse: adresi girilmiş şubeleri ver, yoksa şirketi
        const subeler = await prisma.appointmentBranch.findMany({
            where: { workspaceId, isActive: true, OR: [{ address: { not: null } }, { googleMapsUrl: { not: null } }] },
            select: { name: true, address: true, phone: true, googleMapsUrl: true },
            orderBy: { order: 'asc' },
            take: 4
        });
        if (subeler.length > 0) {
            return subeler.map(b => ({
                kind: 'location',
                name: b.name,
                address: b.address || null,
                phone: b.phone || null,
                mapsUrl: guvenliUrl(b.googleMapsUrl)
            }));
        }

        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { name: true, companyAddress: true, companyPhone: true, googleMapsUrl: true }
        });
        if (ws && (ws.companyAddress || ws.googleMapsUrl)) {
            return [{
                kind: 'location',
                name: ws.name,
                address: ws.companyAddress || null,
                phone: ws.companyPhone || null,
                mapsUrl: guvenliUrl(ws.googleMapsUrl)
            }];
        }
        return [];
    } catch (err) {
        console.error('[WidgetKart] Konum okunamadı:', err.message);
        return [];
    }
}

/**
 * Bilgi bankası bağlantısı ve dosyası.
 *  - Bot cevabında geçen bir URL, bilgi bankasındaki bir kayda aitse → link kartı.
 *  - Müşteri katalog / fiyat listesi istediyse → indirilebilir dosya kartı.
 * İki durumda da kaynak veritabanı; modelin yazdığı serbest metin değil.
 */
async function bilgiBankasiBloklari(workspaceId, { userMessage, aiText }) {
    const bloklar = [];
    try {
        const kayitlar = await prisma.knowledgeBase.findMany({
            where: {
                workspaceId,
                OR: [{ sourceUrl: { not: null } }, { fileUrl: { not: null } }]
            },
            select: { title: true, content: true, sourceUrl: true, filename: true, fileType: true, fileUrl: true },
            take: 50
        });
        if (kayitlar.length === 0) return [];

        // 1) Bot bir adres yazdıysa ve o adres bilgi bankasında kayıtlıysa
        const metin = aiText || '';
        for (const k of kayitlar) {
            const url = guvenliUrl(k.sourceUrl);
            if (!url) continue;
            const host = alanAdi(url);
            if (!host) continue;
            if (metin.includes(url) || metin.includes(host)) {
                bloklar.push({
                    kind: 'link',
                    title: k.title,
                    summary: (k.content || '').replace(/\s+/g, ' ').trim().slice(0, 140) || null,
                    url,
                    domain: host
                });
                break; // tek link yeter, sohbeti link duvarına çevirmeyelim
            }
        }

        // 2) Müşteri açıkça katalog / fiyat listesi istediyse
        if (iceriyorMu(userMessage, KATALOG_KELIMELERI)) {
            const dosyalar = kayitlar
                .filter(k => guvenliUrl(k.fileUrl))
                .slice(0, 3)
                .map(k => ({
                    name: k.filename || k.title,
                    url: guvenliUrl(k.fileUrl),
                    sizeText: null,
                    ext: (k.fileType || '').replace('.', '').toUpperCase() || 'DOSYA'
                }));
            if (dosyalar.length > 0) bloklar.push({ kind: 'file', items: dosyalar });
        }
    } catch (err) {
        console.error('[WidgetKart] Bilgi bankası okunamadı:', err.message);
    }
    return bloklar;
}

// ─── Giriş noktası ───────────────────────────────────────────

/**
 * Bir bot cevabının yanında gösterilecek kartları üretir.
 * Hata hâlinde boş dizi döner: kart üretilemezse widget bugünkü gibi
 * yalnızca metni gösterir, sohbet hiçbir şekilde kesilmez.
 */
export async function buildWidgetRichContent(workspaceId, {
    conversationId = null,
    userMessage = '',
    aiText = '',
    botId = null
} = {}) {
    try {
        const [katalog, konum, bilgi] = await Promise.all([
            katalogBloklari(workspaceId, { conversationId, userMessage, botId }),
            konumBlogu(workspaceId, { conversationId, userMessage }),
            bilgiBankasiBloklari(workspaceId, { userMessage, aiText })
        ]);

        const bloklar = [...bilgi, ...konum, ...katalog];
        return bloklar.length > 0 ? bloklar : null;
    } catch (err) {
        console.error('[WidgetKart] Üretilemedi:', err.message);
        return null;
    }
}

export default { buildWidgetRichContent, guvenliUrl };
