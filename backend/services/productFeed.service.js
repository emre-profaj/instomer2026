/**
 * ═══════════════════════════════════════════════════════════════
 * ÜRÜN FEED'İ (GOOGLE MERCHANT CENTER / GOOGLE SHOPPING)
 * ═══════════════════════════════════════════════════════════════
 *
 * Neden Merchant Center'ın API'si değil de feed:
 *   Content API for Shopping her müşteri için Google Cloud projesi,
 *   OAuth2 ve merchant ID istiyor; karşılığında feed'de olmayan bir şey
 *   vermiyor. Mağaza zaten GMC'ye bir ürün feed'i veriyor — aynı feed'i
 *   biz de okuyabiliriz. Düz bir HTTP GET, kimlik doğrulama yok, kota yok.
 *   Üstelik format standart olduğu için Shopify, Ticimax, ikas, İdeasoft
 *   ve WooCommerce aynı şekilde okunur.
 *
 * Okunan alanlar (RSS 2.0 + g: ad alanı):
 *   g:id, title, description, link, g:image_link,
 *   g:price, g:sale_price, g:availability, g:brand, g:product_type
 *
 * Ürünler ProductFeature("feed_id") ile eşlenir; görsel ProductMedia'ya,
 * ürün sayfası ProductFeature("product_url")'e yazılır. Böylece widget
 * kartları ve katalog akışı hiçbir değişiklik olmadan fotoğraflı çalışır.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import prisma from '../lib/prisma.js';

export const FEED_INTEGRATION_NAME = 'PRODUCT_FEED';

const MAX_URUN = 2000;
const ISTEK_ZAMAN_ASIMI = 30000;

/** "1.234,50 TRY" / "1234.50 TRY" / "₺1.234" → 1234.5 */
export function fiyatAyikla(ham) {
    if (ham == null) return null;
    const metin = String(ham).trim();
    if (!metin) return null;
    // Para birimi kodunu ve sembolleri at, sayıyı bırak
    let sayi = metin.replace(/[A-Za-z₺$€£\s]/g, '');
    if (!sayi) return null;
    // 1.234,50 (tr) → 1234.50 ;  1,234.50 (en) → 1234.50
    if (sayi.includes(',') && sayi.includes('.')) {
        sayi = sayi.lastIndexOf(',') > sayi.lastIndexOf('.')
            ? sayi.replace(/\./g, '').replace(',', '.')
            : sayi.replace(/,/g, '');
    } else if (sayi.includes(',')) {
        sayi = sayi.replace(/\./g, '').replace(',', '.');
    } else if ((sayi.match(/\./g) || []).length > 1) {
        sayi = sayi.replace(/\./g, '');            // 1.234.567 → 1234567
    } else if (/\.\d{3}$/.test(sayi)) {
        // Tek nokta ve ardından TAM 3 hane: Türkiye'de binlik ayracı.
        // Google feed şartnamesi "123.45" der (2 hane), 3 haneli kuruş
        // pratikte yazılmaz; bu yüzden 1.234'ü 1,23 TL değil 1234 TL sayıyoruz.
        // Yanlış yönde hata yapmak botun fiyatı 1000 kat düşük söylemesi demek.
        sayi = sayi.replace('.', '');
    }
    const n = parseFloat(sayi);
    return Number.isFinite(n) ? n : null;
}

function metniTemizle(v) {
    if (!v) return '';
    return String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function httpsMi(url) {
    if (!url) return null;
    try {
        const u = new URL(String(url).trim());
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch { return null; }
}

/**
 * Feed'i indirir ve ürünleri çıkarır. Ağ ve ayrıştırma hataları
 * konuşarak döner: kullanıcıya "feed okunamadı" demek yetmiyor,
 * neyin yanlış olduğunu görmesi gerekiyor.
 */
export async function feedOku(feedUrl) {
    const url = httpsMi(feedUrl);
    if (!url) throw new Error('Feed adresi http veya https ile başlamalı.');

    let res;
    try {
        res = await axios.get(url, {
            timeout: ISTEK_ZAMAN_ASIMI,
            maxContentLength: 80 * 1024 * 1024,
            responseType: 'text',
            headers: { 'User-Agent': 'Instomer-FeedReader/1.0', Accept: 'application/xml, text/xml, */*' }
        });
    } catch (err) {
        const kod = err.response?.status;
        if (kod === 401 || kod === 403) throw new Error(`Feed adresi erişime kapalı (HTTP ${kod}). Adresin herkese açık olduğundan emin olun.`);
        if (kod === 404) throw new Error('Feed adresi bulunamadı (HTTP 404).');
        throw new Error(`Feed indirilemedi: ${err.message}`);
    }

    const govde = typeof res.data === 'string' ? res.data : String(res.data || '');
    if (!govde.trim().startsWith('<')) {
        throw new Error('Adres XML döndürmüyor. Google Shopping feed adresini (XML) verin; mağaza sayfasını değil.');
    }

    const $ = cheerio.load(govde, { xmlMode: true });
    const dugumler = $('item').length > 0 ? $('item') : $('entry');
    if (dugumler.length === 0) {
        throw new Error('Feed okundu ama içinde ürün (item) bulunamadı.');
    }

    const urunler = [];
    dugumler.each((_, n) => {
        if (urunler.length >= MAX_URUN) return false;
        const e = $(n);
        const al = (etiket) => {
            // cheerio xmlMode'da "g:price" seçicisi çalışmıyor; düğüm adına bakıyoruz
            const bulunan = e.children().filter((__, c) => (c.tagName || '').toLowerCase() === etiket.toLowerCase());
            return bulunan.length ? bulunan.first().text().trim() : '';
        };

        const feedId = al('g:id') || al('id');
        const ad = metniTemizle(al('title'));
        if (!feedId || !ad) return;

        const fiyat = fiyatAyikla(al('g:price'));
        const indirimli = fiyatAyikla(al('g:sale_price'));

        urunler.push({
            feedId,
            name: ad.slice(0, 200),
            description: metniTemizle(al('g:description') || al('description')).slice(0, 2000),
            url: httpsMi(al('link') || e.find('link').attr('href')),
            imageUrl: httpsMi(al('g:image_link') || al('image_link')),
            price: fiyat,
            salePrice: indirimli,
            availability: (al('g:availability') || '').toLowerCase() || null,
            brand: metniTemizle(al('g:brand')) || null,
            groupName: metniTemizle(al('g:product_type') || al('g:google_product_category')).split('>').pop().trim() || null
        });
    });

    if (urunler.length === 0) {
        throw new Error('Feed içinde g:id ve title alanı dolu tek bir ürün bile yok.');
    }
    return urunler;
}

/** Görsel ve ürün linkini yazar (WooCommerce içe aktarımıyla aynı kural). */
async function medyaVeLinkYaz(productId, urun) {
    if (urun.imageUrl) {
        const mevcut = await prisma.productMedia.findFirst({ where: { productId, mediaType: 'IMAGE' } });
        if (!mevcut) {
            await prisma.productMedia.create({ data: { productId, mediaUrl: urun.imageUrl, mediaType: 'IMAGE' } });
        } else if (mevcut.mediaUrl !== urun.imageUrl) {
            await prisma.productMedia.update({ where: { id: mevcut.id }, data: { mediaUrl: urun.imageUrl } });
        }
    }
    if (urun.url) {
        const mevcut = await prisma.productFeature.findFirst({ where: { productId, featureKey: 'product_url' } });
        if (!mevcut) {
            await prisma.productFeature.create({ data: { productId, featureKey: 'product_url', featureValue: urun.url } });
        } else if (mevcut.featureValue !== urun.url) {
            await prisma.productFeature.update({ where: { id: mevcut.id }, data: { featureValue: urun.url } });
        }
    }
}

/**
 * Feed'i Instomer ürünlerine aktarır.
 * Stokta olmayanlar pasife alınır, silinmez: kategori ve şube ayarları
 * korunur, stok geri geldiğinde ürün eski ayarlarıyla geri döner.
 */
export async function feedIceAktar(workspaceId, feedUrl) {
    const urunler = await feedOku(feedUrl);

    let eklenen = 0, guncellenen = 0, pasiflenen = 0, hatali = 0;

    for (const u of urunler) {
        try {
            const aktif = !u.availability || u.availability.includes('in stock') || u.availability === 'in_stock';
            const eslesme = await prisma.productFeature.findFirst({
                where: { featureKey: 'feed_id', featureValue: u.feedId, product: { workspaceId } },
                include: { product: true }
            });

            if (eslesme?.product) {
                await prisma.product.update({
                    where: { id: eslesme.product.id },
                    data: {
                        name: u.name,
                        description: u.description || eslesme.product.description,
                        price: u.price ?? eslesme.product.price,
                        discountedPrice: u.salePrice ?? null,
                        isActive: aktif
                    }
                });
                await medyaVeLinkYaz(eslesme.product.id, u);
                if (!aktif) pasiflenen++;
                guncellenen++;
                continue;
            }

            const yeni = await prisma.product.create({
                data: {
                    workspaceId,
                    name: u.name,
                    description: u.description || null,
                    price: u.price ?? 0,
                    discountedPrice: u.salePrice ?? null,
                    groupName: u.groupName || null,
                    isGroup: false,
                    isActive: aktif,
                    features: {
                        create: [
                            { featureKey: 'feed_id', featureValue: u.feedId },
                            ...(u.brand ? [{ featureKey: 'Marka', featureValue: u.brand }] : [])
                        ]
                    }
                }
            });
            await medyaVeLinkYaz(yeni.id, u);
            eklenen++;
        } catch (err) {
            hatali++;
            console.error(`[Feed] "${u.name}" yazılamadı:`, err.message);
        }
    }

    const ozet = { okunan: urunler.length, eklenen, guncellenen, pasiflenen, hatali };
    console.log(`📦 [Feed] ${workspaceId}: ${JSON.stringify(ozet)}`);
    return ozet;
}

/** Çalışma alanının kayıtlı feed adresi (ApiIntegration üzerinde tutulur). */
export async function feedAyariniGetir(workspaceId) {
    const kayit = await prisma.apiIntegration.findFirst({
        where: { workspaceId, name: FEED_INTEGRATION_NAME }
    });
    return {
        isConfigured: !!kayit,
        isActive: kayit?.isActive ?? false,
        feedUrl: kayit?.baseUrl || '',
        updatedAt: kayit?.updatedAt || null
    };
}

export async function feedAyariniKaydet(workspaceId, { feedUrl, isActive = true }) {
    const url = httpsMi(feedUrl);
    if (!url) throw new Error('Feed adresi http veya https ile başlamalı.');

    const kayit = await prisma.apiIntegration.findFirst({
        where: { workspaceId, name: FEED_INTEGRATION_NAME }
    });
    if (kayit) {
        return prisma.apiIntegration.update({
            where: { id: kayit.id },
            data: { baseUrl: url, isActive }
        });
    }
    return prisma.apiIntegration.create({
        data: { workspaceId, name: FEED_INTEGRATION_NAME, baseUrl: url, authType: 'NONE', isActive }
    });
}

export default { feedOku, feedIceAktar, feedAyariniGetir, feedAyariniKaydet, fiyatAyikla, FEED_INTEGRATION_NAME };
