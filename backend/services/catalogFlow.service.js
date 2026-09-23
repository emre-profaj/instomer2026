/**
 * Catalog Flow Service — Sıralı Katalog Akışı
 * ─────────────────────────────────────────────────────────────
 * Botun müşteriyi kademe kademe daraltmasını sağlar:
 *
 *   Şube → Kategori → Ürün Grubu → Ürün
 *
 * Randevu asistanındaki (Probel) mantığın satış tarafındaki karşılığı.
 * Fark: sohbet yanıtı birleşik AI çağrısından döndüğü için function
 * calling yok. Bunun yerine SUNUCU hangi adımda olunduğunu hesaplar,
 * o adımın seçeneklerini veritabanından okur ve prompt'a TEK adımlık
 * talimat olarak koyar. Model listeyi üretmez, yalnızca sunar.
 *
 * ⚠️ KURULU OLMAYAN ÇALIŞMA ALANLARI: Zincir kendini veriye göre açar.
 * Gösterilecek ürün yoksa hiçbir blok üretilmez, bot bugünkü gibi
 * bilgi bankasından serbest cevap verir. Tek bir soru bile sorulmaz.
 *
 * ⚠️ FİYAT: Varsayılan olarak fiyat YAZILMAZ (workspace.catalogPriceDisclosure).
 * Bu, botun fiyat telaffuz etmeme politikasıyla uyumludur; bkz.
 * baseKnowledge.service.js.
 */
import prisma from '../lib/prisma.js';

const MAX_LIST = 25;           // Müşteriye sunulacak azami seçenek
const GROUP_THRESHOLD = 12;    // Ürün sayısı bunu aşarsa önce grup sorulur

// ─── Yardımcılar ─────────────────────────────────────────────

function parseIdList(raw) {
    if (!raw) return [];
    try {
        const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
    } catch { return []; }
}

/** Türkçe karakterleri sadeleştirip karşılaştırmaya hazırlar. */
function norm(s) {
    return (s || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i').replace(/İ/g, 'i')
        .replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/\s+/g, ' ')
        .trim();
}

// Kayıt adlarında geçen ama ayırt etmeyen kelimeler. Müşteri "Gaziemir Kadın"
// yazdığında "Gaziemir Kadın Şube" kaydını bulabilmek için elenir.
const GENERIC_WORDS = new Set([
    'sube', 'subesi', 'subeler', 'merkez', 'merkezi', 'tesis', 'tesisi',
    'magaza', 'magazasi', 'lokasyon', 'grup', 'grubu'
]);

/**
 * Bir adın müşteri metninde geçip geçmediğini ölçer.
 * Tam ad geçiyorsa yüksek puan; yoksa adın AYIRT EDİCİ kelimelerinin
 * tamamı metinde geçiyorsa daha düşük puan. Eşleşme yoksa 0.
 */
function matchScore(name, text) {
    const n = norm(name);
    const t = norm(text);
    if (!n || !t) return 0;
    if (t.includes(n)) return 100 + n.length;
    const words = n.split(' ')
        .filter(w => w.length >= 3 && !GENERIC_WORDS.has(w));
    // Tek ayırt edici kelime varsa kısmi eşleşme sayılmaz; "Bornova" yazan
    // müşteri hem Erkek hem Kadın şubeye uyar, seçim yapılmamalı.
    if (words.length < 2) return 0;
    const hit = words.filter(w => t.includes(w));
    return hit.length === words.length ? 50 + n.length : 0;
}

/** Listeden müşteri metnine en iyi uyan kaydı seçer; belirsizse null. */
function bestMatch(items, text) {
    let best = null, bestScore = 0, tie = false;
    for (const it of items) {
        const score = matchScore(it.name, text);
        if (score > bestScore) { best = it; bestScore = score; tie = false; }
        else if (score > 0 && score === bestScore) { tie = true; }
    }
    if (!best || bestScore === 0) return null;
    // İki kayıt aynı derecede uyuyorsa (ör. "Bornova" → Erkek/Kadın) seçme,
    // botun sorması gerekir.
    if (tie) return null;
    return best;
}

/** Adın ayırt edici kelimeleri (jenerik olanlar atılır). */
function distinctiveWords(name) {
    return norm(name).split(' ').filter(w => w.length >= 3 && !GENERIC_WORDS.has(w));
}

/**
 * Müşterinin verdiği ipucuyla hâlâ mümkün olan kayıtlar.
 *
 * "Bornova" diyen müşteri hem Bornova Erkek hem Bornova Kadın'a uyar;
 * matchScore bu durumda 0 döndüğü için seçim yapılmıyor ama ADAY LİSTESİNİ
 * de daraltmıyordu. Bot da 4 şubeyi "Bornova mı Gaziemir mi" diye
 * özetleyip cinsiyet ayrımını hiç sormuyordu. Burada ipucunu tutan
 * kayıtları döndürüyoruz; hiç ipucu yoksa liste aynen kalır.
 */
function narrowCandidates(items, text) {
    const t = norm(text);
    if (!t) return items;
    let best = 0;
    const scored = items.map(it => {
        const words = distinctiveWords(it.name);
        const hit = words.filter(w => t.includes(w)).length;
        if (hit > best) best = hit;
        return { it, hit };
    });
    if (best === 0) return items;
    return scored.filter(x => x.hit === best).map(x => x.it);
}

/** Adayların ortak olmayan (ayırt eden) kısmını okunur biçimde verir. */
function distinguishingHint(items) {
    if (items.length < 2) return '';
    const sets = items.map(it => distinctiveWords(it.name));
    const common = sets[0].filter(w => sets.every(set => set.includes(w)));
    if (common.length === 0) return '';
    const farklar = items.map(it => {
        const kelimeler = String(it.name).split(/\s+/)
            .filter(w => {
                const n = norm(w);
                return n.length >= 3 && !GENERIC_WORDS.has(n) && !common.includes(n);
            });
        return kelimeler.join(' ');
    }).filter(Boolean);
    return farklar.length === items.length ? farklar.join(' / ') : '';
}

/**
 * Müşteri metninde adı geçen ürünler.
 *
 * Birleşik AI'a ürün kimlikleri verilmediği için `matchedProductIds` hep
 * boş dönüyordu; müşteri "Aromaterapi yağ masajı" dediği hâlde vakaya
 * ürün yazılmıyordu. Eşleştirmeyi modele bırakmak yerine burada
 * hesaplıyoruz: adı metinde geçen ürünleri puanına göre veriyoruz.
 */
// Ürün adlarında geçen ama ayırt etmeyen ekler. "Aromaterapi Yağ Masajı
// (40 Dakika)" adında "dakika" bilgi taşımıyor; müşteri onu yazmadığı için
// matchScore'un "bütün kelimeler geçsin" kuralı hiçbir ürünü tutturamıyordu.
const PRODUCT_NOISE = new Set(['dakika', 'dakikalik', 'adet', 'seans', 'kisi', 'kisilik']);

function productWords(name) {
    return norm(name)
        // Süre eki at: "(40 Dakika)" bilgi taşımıyor. Ama adın başındaki
        // adet SAYISI anlamlı — "10 Sıcak Yağ Masajı" ile tekil masajı,
        // "20 Kontör Giriş" ile "10 Kontör Giriş"i ayıran tek şey o.
        .replace(/\(?\s*\d+\s*(dakika\w*|dk|saat\w*)\s*\)?/g, ' ')
        .replace(/[^a-z0-9+ ]+/g, ' ')
        .split(' ')
        .filter(w => (w.length >= 3 || /^\d+$/.test(w)) && !PRODUCT_NOISE.has(w))
        .filter((w, i, a) => a.indexOf(w) === i);   // tekrarları say ma
}

export function matchingProducts(products, text, limit = 3) {
    const t = norm(text);
    if (!t) return [];

    // Tam ad geçiyorsa tartışma yok
    const tam = products.filter(p => t.includes(norm(p.name)));
    if (tam.length > 0) return tam.slice(0, limit).map(p => p.id);

    // Yoksa KAPSAMA oranına bak: adın kelimelerinin kaçı metinde geçiyor.
    // Ham eşleşme SAYISI kullanmak uzun paket adlarını kayırıyor —
    // "10 Kontör Giriş + 10 Kese Köpük + 10 Sıcak Yağ Masajı" da tekil
    // "Sıcak Yağ Masajı (40 Dakika)" da 3 kelime tutuyordu, berabere
    // kalıp hiçbiri seçilemiyordu. Oran tekil ürünü net öne çıkarır:
    // tekilde 3/3 = 1.00, pakette 3/9 = 0.33.
    const scored = products.map(p => {
        const words = productWords(p.name);
        const hit = words.filter(w => t.includes(w)).length;
        return { p, hit, words: words.length, cover: words.length ? hit / words.length : 0 };
    }).filter(x => x.hit >= 2 && x.cover >= 0.6);

    if (scored.length === 0) return [];

    const best = Math.max(...scored.map(x => x.cover));
    // Kapsama eşitse DAHA ÇOK kelime tutan kazanır: müşteri "10 kontör
    // giriş kese köpük" yazdıysa dört parçalı paket, iki parçalı olandan
    // daha iyi eşleşme. Sonra da daha az kelimeli, yani daha spesifik olan.
    const top = scored
        .filter(x => x.cover === best)
        .sort((a, b) => (b.hit - a.hit) || (a.words - b.words));

    const enIyi = top[0];
    const kesin = top.filter(x => x.hit === enIyi.hit && x.words === enIyi.words);
    if (kesin.length > limit) return [];   // hâlâ belirsiz
    return kesin.map(x => x.p.id);
}

/** Müşterinin son mesajlarını tek metinde toplar (en yenisi en sonda). */
export function customerText(recentMessages = [], limit = 4) {
    return recentMessages
        .filter(m => m.isFromContact || m.direction === 'IN')
        .slice(-limit)
        .map(m => m.content || '')
        .join(' \n ');
}

/** Ürün bu şubede satılıyor mu? Hiç şube kaydı yoksa "tüm şubeler" demektir. */
function availableAtBranch(product, branchId) {
    const rows = product.productBranches || [];
    if (rows.length === 0) return true;
    if (!branchId) return rows.some(r => r.isAvailable !== false);
    return rows.some(r => r.branchId === branchId && r.isAvailable !== false);
}

function priceOf(product, branchId) {
    const row = (product.productBranches || []).find(r => r.branchId === branchId);
    const p = (row && row.price != null) ? row.price : product.price;
    return (p == null || p === 0) ? null : p;
}

function formatPrice(v) {
    try {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(v);
    } catch { return `${v} TL`; }
}

// ─── Yetenek tespiti ─────────────────────────────────────────

/**
 * Bu çalışma alanında sıralı akış çalışsın mı?
 *
 * catalogFlowEnabled:
 *   null  → otomatik
 *   true  → her hâlükârda açık
 *   false → kapalı
 *
 * Otomatik kural KASITLI OLARAK dar tutulur; amaç kurulu olmayan veya
 * bu akışı istemeyen çalışma alanlarının davranışını değiştirmemek:
 *   - En az 2 şube olacak. Tek şubede sorulacak bir şey yok.
 *   - En az 1 aktif ürün olacak. Sonunda gösterilecek bir şey yoksa
 *     baştaki soru da sorulmaz.
 *   - Randevu entegrasyonu (Probel) olan çalışma alanları HARİÇ. Onların
 *     kendi kademeli akışı var ve "şube" kayıtları poliklinik anlamında
 *     kullanılıyor; iki akış üst üste binmemeli.
 * Bu koşulları sağlamayan yerlerde panelden elle açılabilir.
 */
export async function getCatalogCapability(workspaceId, botId = null) {
    const [ws, branchCount, productCount, categoryCount, healthApiCount, bot] = await Promise.all([
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { catalogFlowEnabled: true, catalogPriceDisclosure: true }
        }).catch(() => null),
        prisma.appointmentBranch.count({ where: { workspaceId, isActive: true } }).catch(() => 0),
        prisma.product.count({ where: { workspaceId, isActive: true, isGroup: false } }).catch(() => 0),
        prisma.topicCategory.count({ where: { workspaceId, isActive: true } }).catch(() => 0),
        prisma.apiIntegration.count({ where: { workspaceId, authType: 'OAUTH_PASSWORD', isActive: true } }).catch(() => 0),
        botId
            ? prisma.aIBot.findUnique({
                where: { id: botId },
                select: { catalogFlowEnabled: true, catalogPriceDisclosure: true }
            }).catch(() => null)
            : null
    ]);

    // Bot bazlı override: bot'ta null değilse bot'un ayarı esas alınır,
    // null ise workspace'ten devralınır (geriye uyumluluk).
    const effectiveFlowFlag = bot?.catalogFlowEnabled ?? ws?.catalogFlowEnabled ?? null;
    const effectivePriceFlag = bot?.catalogPriceDisclosure ?? ws?.catalogPriceDisclosure ?? false;

    const flag = effectiveFlowFlag;
    const hasHealthApi = healthApiCount > 0;
    const auto = branchCount >= 2 && productCount >= 1 && !hasHealthApi;
    const enabled = flag === true ? true : flag === false ? false : auto;

    return {
        enabled,
        auto,
        flag: flag ?? null,
        hasHealthApi,
        branchCount,
        productCount,
        categoryCount,
        priceDisclosure: effectivePriceFlag === true,
        // Bot bazlı ham değerler (UI'da gösterilecek)
        botFlowFlag: bot?.catalogFlowEnabled ?? null,
        botPriceFlag: bot?.catalogPriceDisclosure ?? null
    };
}

// ─── Zincir ──────────────────────────────────────────────────

/**
 * Konuşmanın hangi adımda olduğunu hesaplar ve o adımın prompt bloğunu üretir.
 *
 * @returns {Promise<{ step: string, text: string, branchId: string|null, categoryId: string|null }|null>}
 *          null → zincir devrede değil, bot bugünkü gibi davranır.
 */
export async function buildCatalogStep(workspaceId, { conversationId = null, recentMessages = [], userMessage = '', botId = null } = {}) {
    try {
        const cap = await getCatalogCapability(workspaceId, botId);
        if (!cap.enabled) return null;

        // Gelen mesaj henüz kaydedilmemiş olabilir; metne mutlaka dahil et
        const text = `${customerText(recentMessages)}\n${userMessage || ''}`;

        const [branches, conv] = await Promise.all([
            prisma.appointmentBranch.findMany({
                where: { workspaceId, isActive: true },
                select: { id: true, name: true, address: true },
                orderBy: { order: 'asc' }
            }),
            conversationId
                ? prisma.conversation.findUnique({
                    where: { id: conversationId },
                    select: { branchId: true, topicCategoryId: true }
                })
                : null
        ]);

        // ── 1. ADIM: ŞUBE ─────────────────────────────────────
        let branch = null;
        if (branches.length === 1) {
            branch = branches[0];                       // Tek şube → sorulmaz
        } else if (branches.length > 1) {
            if (conv?.branchId) branch = branches.find(b => b.id === conv.branchId) || null;
            // Kayıtlı şube yoksa müşterinin son mesajlarından yakala
            if (!branch) branch = bestMatch(branches, text);
        }

        // Ürünleri bir kez oku; hem sayım hem listeleme için kullanılacak
        const allProducts = await prisma.product.findMany({
            where: { workspaceId, isActive: true, isGroup: false },
            select: {
                id: true, name: true, price: true, unit: true,
                categoryId: true, parentId: true, description: true,
                productBranches: { select: { branchId: true, price: true, isAvailable: true } },
                // Widget kartları için: görsel ve ürün sayfası linki.
                // Prompt metnine girmez, yalnızca kart üretiminde kullanılır.
                media: { select: { mediaUrl: true, mediaType: true }, take: 1 },
                features: { where: { featureKey: 'product_url' }, select: { featureValue: true }, take: 1 }
            },
            orderBy: { name: 'asc' }
        });

        // Şube belli değilken bile "hiç ürün yok" durumunda soru sormayalım
        if (allProducts.length === 0) return null;

        if (!branch && branches.length > 1) {
            // Müşteri kısmi bilgi verdiyse (ör. yalnızca semt) aday listesini daralt;
            // böylece bot 4 şubeyi iki semte indirip cinsiyet ayrımını atlayamaz.
            const adaylar = narrowCandidates(branches, text);
            const daraldi = adaylar.length < branches.length;
            const fark = distinguishingHint(adaylar);
            const lines = adaylar.map((b, i) => `${i + 1}. ${b.name}${b.address ? ` — ${b.address}` : ''}`).join('\n');
            return {
                step: 'ASK_BRANCH',
                branchId: null,
                categoryId: null,
                productIds: [],
                options: adaylar.map(b => ({ id: b.id, label: b.name })),
                text: `🔢 SIRALI AKIŞ — ŞU ANKİ ADIM: ŞUBE SEÇİMİ
${daraldi
    ? 'Müşteri kısmi bilgi verdi ama HÂLÂ tek şubeye inmedi. Aşağıdaki şubeler hâlâ mümkün.'
    : 'Müşterinin hangi şubeyle ilgilendiği henüz belli değil.'}
Hizmet ve fiyatlar şubeye göre değişebildiği için ÖNCE bunu netleştir.

Hâlâ mümkün olan şubeler (${adaylar.length} adet):
${lines}
${fark ? `\nAyrım tam olarak şu: ${fark}. Soruyu SADECE bu ayrım üzerine kur.` : ''}

Kurallar:
- BU MESAJDA TEK İŞİN VAR: yukarıdaki şubelerden hangisini istediğini sormak.
- Seçenekleri EKSİKSİZ ver. İki şubeyi tek isim altında birleştirme, kısaltma, birini atlama.
- ${fark
    ? `Ortak kısmı tekrar sorma; yalnızca "${fark}" ayrımını sor.`
    : 'Şube adlarını yukarıdaki hâliyle kullan.'}
- Hizmet/tesis listesi verme, fiyat yazma, "hangi hizmetle ilgileniyorsunuz" gibi BAŞKA BİR SORU SORMA.
- Müşteri bu soruyu geçiştirip başka bir şey sorarsa kısa cevap ver ve soruyu tekrar sor.
- Müşteri şube söylemek istemiyorsa ısrar etme; genel bilgi ver ve konuyu yetkiliye aktar.`
            };
        }

        const branchId = branch?.id || null;
        const atBranch = allProducts.filter(p => availableAtBranch(p, branchId));
        if (atBranch.length === 0) return null;   // Bu şubede ürün yok → serbest akış

        // ── 2. ADIM: KATEGORİ ─────────────────────────────────
        const categories = await prisma.topicCategory.findMany({
            where: { workspaceId, isActive: true },
            select: { id: true, name: true, description: true, branchIds: true },
            orderBy: { order: 'asc' }
        });

        // Şubede geçerli ve altında gerçekten ürün olan kategoriler
        const usableCats = categories.filter(c => {
            const ids = parseIdList(c.branchIds);
            const okBranch = ids.length === 0 || !branchId || ids.includes(branchId);
            if (!okBranch) return false;
            return atBranch.some(p => p.categoryId === c.id);
        });

        let category = null;
        if (usableCats.length === 1) {
            category = usableCats[0];                   // Tek kategori → sorulmaz
        } else if (usableCats.length > 1) {
            if (conv?.topicCategoryId) category = usableCats.find(c => c.id === conv.topicCategoryId) || null;
            if (!category) category = bestMatch(usableCats, text);
            // Müşteri doğrudan bir ürün adı yazdıysa kategoriyi üründen çöz
            if (!category) {
                const prod = bestMatch(atBranch, text);
                if (prod?.categoryId) category = usableCats.find(c => c.id === prod.categoryId) || null;
            }
        }

        if (!category && usableCats.length > 1) {
            const lines = usableCats.map((c, i) => `${i + 1}. ${c.name}${c.description ? ` — ${c.description}` : ''}`).join('\n');
            return {
                step: 'ASK_CATEGORY',
                branchId,
                categoryId: null,
                productIds: [],
                options: usableCats.map(c => ({ id: c.id, label: c.name })),
                text: `🔢 SIRALI AKIŞ — ŞU ANKİ ADIM: KATEGORİ SEÇİMİ
Seçili şube: ${branch ? branch.name : '(tek şube)'}
Müşterinin hangi hizmet grubunu istediği belli değil.

Kategoriler:
${lines}

Kurallar:
- Tek soruyla sor, seçenekleri yukarıdaki adlarla sun.
- Bu adımda ürün listesi verme, fiyat yazma.
- Müşteri zaten bir hizmet adı söylediyse tekrar sorma, o kategoriyle devam et.`
            };
        }

        // Kategori hâlâ yoksa (hiç kategori tanımlı değil) → kategori adımı atlanır
        const inCategory = category ? atBranch.filter(p => p.categoryId === category.id) : atBranch;
        if (inCategory.length === 0) return null;

        // ── 3. ADIM: ÜRÜN GRUBU (yalnızca liste uzunsa) ───────
        let group = null;
        let inGroup = inCategory;

        if (inCategory.length > GROUP_THRESHOLD) {
            const groupIds = [...new Set(inCategory.map(p => p.parentId).filter(Boolean))];
            if (groupIds.length > 1) {
                const groups = await prisma.product.findMany({
                    where: { workspaceId, isGroup: true, id: { in: groupIds } },
                    select: { id: true, name: true, description: true },
                    orderBy: { name: 'asc' }
                });
                group = bestMatch(groups, text);
                if (!group && groups.length > 1) {
                    const lines = groups.map((g, i) => {
                        const n = inCategory.filter(p => p.parentId === g.id).length;
                        return `${i + 1}. ${g.name} (${n} seçenek)`;
                    }).join('\n');
                    return {
                        step: 'ASK_GROUP',
                        branchId,
                        categoryId: category?.id || null,
                        productIds: matchingProducts(inCategory, text),
                        options: groups.map(g => ({ id: g.id, label: g.name })),
                        text: `🔢 SIRALI AKIŞ — ŞU ANKİ ADIM: ÜRÜN GRUBU SEÇİMİ
Seçili şube: ${branch ? branch.name : '(tek şube)'}${category ? ` | Kategori: ${category.name}` : ''}
Bu kategoride ${inCategory.length} seçenek var, hepsini birden listeleme.

Gruplar:
${lines}

Kurallar:
- Tek soruyla hangi grupla ilgilendiğini sor.
- Bu adımda tek tek ürün sayma, fiyat yazma.`
                    };
                }
                if (group) inGroup = inCategory.filter(p => p.parentId === group.id);
            }
        }

        // ── 4. ADIM: ÜRÜN LİSTESİ ─────────────────────────────
        const shown = inGroup.slice(0, MAX_LIST);
        const lines = shown.map((p, i) => {
            const price = cap.priceDisclosure ? priceOf(p, branchId) : null;
            const priceTxt = price != null ? ` — ${formatPrice(price)}${p.unit ? ` / ${p.unit}` : ''}` : '';
            return `${i + 1}. ${p.name}${priceTxt}`;
        }).join('\n');

        const priceRule = cap.priceDisclosure
            ? `- Fiyatlar bu şube içindir; yalnızca yukarıda yazan rakamları kullan, hesaplama veya indirim yapma.`
            : `- Bu listede fiyat YOKTUR. Müşteri fiyat sorarsa rakam verme, tahmin etme; talebi yetkiliye aktar.`;

        return {
            step: 'SHOW_PRODUCTS',
            branchId,
            categoryId: category?.id || null,
            productIds: matchingProducts(inGroup, text),
            // Widget kart verisi. Fiyat kuralı prompt ile aynı: kapalıysa
            // rakam hiç çıkmaz, "fiyat için yetkiliye aktarılır" denir.
            cards: shown.map(p => {
                const price = cap.priceDisclosure ? priceOf(p, branchId) : null;
                return {
                    id: p.id,
                    name: p.name,
                    note: [group?.name || category?.name || null, branch?.name || null]
                        .filter(Boolean).join(' · ') || null,
                    priceText: price != null ? `${formatPrice(price)}${p.unit ? ` / ${p.unit}` : ''}` : null,
                    imageUrl: (p.media || []).find(m => (m.mediaType || 'IMAGE').toUpperCase() === 'IMAGE')?.mediaUrl || null,
                    url: (p.features || [])[0]?.featureValue || null
                };
            }),
            totalCount: inGroup.length,
            text: `🔢 SIRALI AKIŞ — ŞU ANKİ ADIM: ÜRÜN SUNUMU
Seçili şube: ${branch ? branch.name : '(tek şube)'}${category ? ` | Kategori: ${category.name}` : ''}${group ? ` | Grup: ${group.name}` : ''}

Bu şubede sunulabilecek seçenekler${inGroup.length > shown.length ? ` (ilk ${shown.length} / ${inGroup.length})` : ''}:
${lines}

Kurallar:
- YALNIZCA yukarıdaki seçenekleri sun; listede olmayan hizmet UYDURMA.
- Müşterinin sorduğuyla ilgili olanları öne çıkar, tamamını kopyalama.
${priceRule}
- Müşteri birini seçerse veya randevu isterse bilgilerini alıp yetkiliye aktar.`
        };
    } catch (err) {
        console.error('⚠️ [CatalogFlow] Adım hesaplanamadı:', err.message);
        return null;   // Hata hâlinde zincir devreye girmez, bot normal çalışır
    }
}

export default { getCatalogCapability, buildCatalogStep, matchingProducts, customerText };
