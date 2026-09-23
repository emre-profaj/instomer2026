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
async function katalogBloklari(workspaceId, { conversationId, userMessage, botId, recentMessages = [] }) {
    try {
        const { buildCatalogStep } = await import('./catalogFlow.service.js');
        // recentMessages ŞART: botun gördüğü adımın aynısını görmemiz gerekiyor.
        // Verilmediğinde müşterinin bir önceki "Bornova Erkek" cevabı görünmüyor,
        // adım hep ASK_BRANCH'te kalıyor ve aynı çipler her mesajda tekrarlıyordu.
        const adim = await buildCatalogStep(workspaceId, {
            conversationId,
            recentMessages,
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

// ─── Bölüm menüsü ve kart eylemleri ──────────────────────────
//
// Karta dokunmak modele soru sormaz: widget bölüm kimliğini gönderir,
// burası kartları doğrudan veritabanından kurar ve sabit bir cümleyle
// döner. Anında açılır, token harcamaz, yanlış cevap veremez.
// Serbest yazı yine bota gider.

/** Şube kartları — adres, telefon, yol tarifi ve "bu şubeyi seç" bir arada. */
async function subeKartlari(workspaceId) {
    const subeler = await prisma.appointmentBranch.findMany({
        where: { workspaceId, isActive: true },
        select: { id: true, name: true, address: true, phone: true, googleMapsUrl: true },
        orderBy: { order: 'asc' }
    });
    return subeler.map(b => ({
        id: b.id,
        name: b.name,
        address: b.address || null,
        phone: b.phone || null,
        mapsUrl: guvenliUrl(b.googleMapsUrl)
    }));
}

/** Menüdeki bölümler. Karşılığı olmayan bölüm hiç gösterilmez. */
export async function bolumMenusu(workspaceId) {
    const [subeSayisi, urunSayisi, dosyaSayisi] = await Promise.all([
        prisma.appointmentBranch.count({ where: { workspaceId, isActive: true } }).catch(() => 0),
        prisma.product.count({ where: { workspaceId, isActive: true, isGroup: false } }).catch(() => 0),
        prisma.knowledgeBase.count({ where: { workspaceId, fileUrl: { not: null } } }).catch(() => 0)
    ]);

    const items = [];
    if (subeSayisi > 0) {
        items.push({
            id: 'branches',
            icon: 'branches',
            title: 'Şubeler',
            subtitle: `${subeSayisi} şube · adres ve yol tarifi`
        });
    }
    if (urunSayisi > 0) {
        items.push({
            id: 'services',
            icon: 'services',
            title: 'Hizmetler',
            subtitle: 'Seçenekler ve paketler'
        });
    }
    if (dosyaSayisi > 0) {
        items.push({
            id: 'catalog',
            icon: 'catalog',
            title: 'Katalog',
            subtitle: 'Fiyat listesi ve broşürler'
        });
    }
    return items.length > 0 ? { kind: 'menu', items } : null;
}

/** Seçili şubenin hizmet kartları. Şube yoksa önce şube sorulur. */
async function hizmetBloklari(workspaceId, conversationId) {
    const { buildCatalogStep } = await import('./catalogFlow.service.js');
    const adim = await buildCatalogStep(workspaceId, { conversationId });

    if (adim && adim.step === 'SHOW_PRODUCTS' && Array.isArray(adim.cards) && adim.cards.length > 0) {
        return {
            text: 'Seçenekler burada. Kartı kaydırarak hepsini görebilirsiniz.',
            richContent: [{
                kind: 'products',
                items: adim.cards.slice(0, MAX_KART).map(c => ({
                    id: c.id,
                    name: c.name,
                    note: c.note || null,
                    priceText: c.priceText || null,
                    imageUrl: guvenliUrl(c.imageUrl),
                    url: guvenliUrl(c.url)
                }))
            }]
        };
    }

    // Adım henüz ürüne inmediyse: elimizdeki seçenekleri kart olarak sun
    if (adim && Array.isArray(adim.options) && adim.options.length > 0) {
        if (adim.step === 'ASK_BRANCH') {
            return {
                text: 'Önce hangi şubeyle ilgilendiğinizi seçin; hizmetler ve fiyatlar şubeye göre değişiyor.',
                richContent: [{ kind: 'branches', items: await subeKartlari(workspaceId) }]
            };
        }
        return {
            text: 'Hangisiyle ilgileniyorsunuz?',
            richContent: [{ kind: 'quickReplies', items: adim.options.slice(0, 6) }]
        };
    }

    return { text: 'Hizmet listesine şu an ulaşamadım, size bir temsilcimiz yardımcı olsun.', richContent: null };
}

/**
 * Widget'tan gelen kart eylemini karşılar.
 * Bilinmeyen eylemde null döner; çağıran taraf o zaman normal AI akışına düşer.
 */
export async function buildSectionResponse(workspaceId, conversationId, govde = {}) {
    const { action, sectionId, branchId } = govde;
    try {
        if (action === 'menu') {
            const menu = await bolumMenusu(workspaceId);
            return { text: 'Neye bakmak istersiniz?', richContent: menu ? [menu] : null };
        }

        if (action === 'section') {
            if (sectionId === 'branches') {
                const kartlar = await subeKartlari(workspaceId);
                if (kartlar.length === 0) return { text: 'Şube bilgisi kayıtlı değil, size bir temsilcimiz yardımcı olsun.', richContent: null };
                return {
                    text: kartlar.length === 1
                        ? 'Adresimiz burada.'
                        : 'Şubelerimiz burada. Birini seçerseniz hizmetleri o şubeye göre gösteririm.',
                    richContent: [{ kind: 'branches', items: kartlar }]
                };
            }
            if (sectionId === 'services') {
                return hizmetBloklari(workspaceId, conversationId);
            }
            if (sectionId === 'catalog') {
                const kayitlar = await prisma.knowledgeBase.findMany({
                    where: { workspaceId, fileUrl: { not: null } },
                    select: { title: true, filename: true, fileType: true, fileUrl: true },
                    take: 5
                });
                const dosyalar = kayitlar
                    .filter(k => guvenliUrl(k.fileUrl))
                    .map(k => ({
                        name: k.filename || k.title,
                        url: guvenliUrl(k.fileUrl),
                        sizeText: null,
                        ext: (k.fileType || '').replace('.', '').toUpperCase() || 'DOSYA'
                    }));
                if (dosyalar.length === 0) {
                    return { text: 'Şu an paylaşabileceğim bir katalog dosyası yok; talebinizi yetkiliye aktarabilirim.', richContent: null };
                }
                return { text: 'Dosyalarımız burada.', richContent: [{ kind: 'file', items: dosyalar }] };
            }
            return null;
        }

        if (action === 'branch' && branchId) {
            const sube = await prisma.appointmentBranch.findFirst({
                where: { id: branchId, workspaceId, isActive: true },
                select: { id: true, name: true }
            });
            if (!sube) return null;

            // Seçim KALICI: bugüne kadar hiçbir konuşmada branchId dolmuyordu,
            // bot her mesajda şubeyi baştan tahmin ediyordu.
            if (conversationId) {
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { branchId: sube.id }
                }).catch(e => console.error('[WidgetKart] Şube yazılamadı:', e.message));
            }

            const hizmet = await hizmetBloklari(workspaceId, conversationId);
            return {
                text: `${sube.name} seçildi. ${hizmet.text}`,
                richContent: [
                    { kind: 'context', label: sube.name },
                    ...(hizmet.richContent || [])
                ]
            };
        }

        return null;
    } catch (err) {
        console.error('[WidgetKart] Bölüm yanıtı üretilemedi:', err.message);
        return null;
    }
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
    botId = null,
    recentMessages = []
} = {}) {
    try {
        // Bu konuşmadaki ilk bot cevabı mı? Bölüm menüsü yalnızca bir kez
        // çıkar; müşteri yazmaya başladıktan sonra araya girmez.
        let ilkCevap = false;
        let oncekiCipler = null;
        if (conversationId) {
            const oncekiBotMesajlari = await prisma.message.findMany({
                where: { conversationId, isFromContact: false },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { richContent: true }
            }).catch(() => []);
            ilkCevap = oncekiBotMesajlari.length === 0;
            const onceki = oncekiBotMesajlari[0]?.richContent;
            if (Array.isArray(onceki)) {
                const cip = onceki.find(b => b && b.kind === 'quickReplies');
                if (cip) oncekiCipler = JSON.stringify((cip.items || []).map(i => i.id || i.label));
            }
        }

        const [katalog, konum, bilgi, menu] = await Promise.all([
            katalogBloklari(workspaceId, { conversationId, userMessage, botId, recentMessages }),
            konumBlogu(workspaceId, { conversationId, userMessage }),
            bilgiBankasiBloklari(workspaceId, { userMessage, aiText }),
            ilkCevap ? bolumMenusu(workspaceId) : Promise.resolve(null)
        ]);

        let bloklar = [...bilgi, ...konum, ...katalog];

        // Aynı çipleri arka arkaya basma: müşteri dört şube çipini her
        // mesajın altında yeniden görüyordu.
        if (oncekiCipler) {
            bloklar = bloklar.filter(b => {
                if (!b || b.kind !== 'quickReplies') return true;
                const simdi = JSON.stringify((b.items || []).map(i => i.id || i.label));
                return simdi !== oncekiCipler;
            });
        }

        // Menü varsa en başta durur ve çiplerin yerini alır
        if (menu) bloklar = [menu, ...bloklar.filter(b => b && b.kind !== 'quickReplies')];

        return bloklar.length > 0 ? bloklar : null;
    } catch (err) {
        console.error('[WidgetKart] Üretilemedi:', err.message);
        return null;
    }
}

export default { buildWidgetRichContent, buildSectionResponse, bolumMenusu, guvenliUrl };
