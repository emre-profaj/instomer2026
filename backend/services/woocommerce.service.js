import axios from 'axios';
import prisma from '../lib/prisma.js';
import { encrypt, decrypt } from '../utils/encryption.js';

const INTEGRATION_NAME = 'WOOCOMMERCE';

/**
 * HTML etiketlerini temizler (WooCommerce description için)
 */
function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * WooCommerce REST API Axios İstemcisi Üretici
 */
function createWooClient(baseUrl, consumerKey, consumerSecret) {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    return axios.create({
        baseURL: `${cleanUrl}/wp-json/wc/v3`,
        headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Instomer-WooCommerce-Sync/1.0'
        },
        params: {
            consumer_key: consumerKey,
            consumer_secret: consumerSecret
        },
        timeout: 25000
    });
}

/**
 * Workspace'e ait WooCommerce ayarlarını ve istemcisini getirir.
 */
async function getClientForWorkspace(workspaceId, overrideCredentials = null) {
    if (overrideCredentials) {
        const { storeUrl, consumerKey, consumerSecret } = overrideCredentials;
        if (!storeUrl || !consumerKey || !consumerSecret) {
            throw new Error('Mağaza URL, Consumer Key ve Consumer Secret zorunludur.');
        }
        return {
            client: createWooClient(storeUrl, consumerKey, consumerSecret),
            storeUrl,
            config: null
        };
    }

    const integration = await prisma.apiIntegration.findFirst({
        where: { workspaceId, name: INTEGRATION_NAME }
    });

    if (!integration || !integration.baseUrl || !integration.apiKey || !integration.apiSecret) {
        throw new Error('WooCommerce entegrasyonu bu çalışma alanında yapılandırılmamış.');
    }

    const consumerKey = decrypt(integration.apiKey);
    const consumerSecret = decrypt(integration.apiSecret);

    if (!consumerKey || !consumerSecret) {
        throw new Error('API anahtarları çözümlenemedi. Lütfen ayarları yeniden kaydedin.');
    }

    let extraHeaders = {};
    if (integration.headers) {
        try {
            extraHeaders = JSON.parse(integration.headers);
        } catch {
            extraHeaders = {};
        }
    }

    return {
        client: createWooClient(integration.baseUrl, consumerKey, consumerSecret),
        storeUrl: integration.baseUrl,
        config: {
            ...integration,
            ...extraHeaders
        }
    };
}

/**
 * WooCommerce ürününün görselini ve sayfa linkini Instomer'a yazar.
 * WooCommerce cevabı images[] ve permalink alanlarını zaten döndürüyordu;
 * içe aktarma bunları hiç okumuyordu, bu yüzden 345 üründe tek bir
 * fotoğraf yoktu ve widget kartlarında gösterilecek görsel bulunamıyordu.
 */
async function medyaVeLinkYaz(productId, wp) {
    try {
        const gorsel = Array.isArray(wp.images) && wp.images.length > 0 ? wp.images[0].src : null;
        if (gorsel) {
            const mevcut = await prisma.productMedia.findFirst({
                where: { productId, mediaType: 'IMAGE' }
            });
            if (!mevcut) {
                await prisma.productMedia.create({
                    data: { productId, mediaUrl: gorsel, mediaType: 'IMAGE' }
                });
            } else if (mevcut.mediaUrl !== gorsel) {
                await prisma.productMedia.update({
                    where: { id: mevcut.id },
                    data: { mediaUrl: gorsel }
                });
            }
        }

        if (wp.permalink) {
            const mevcut = await prisma.productFeature.findFirst({
                where: { productId, featureKey: 'product_url' }
            });
            if (!mevcut) {
                await prisma.productFeature.create({
                    data: { productId, featureKey: 'product_url', featureValue: wp.permalink }
                });
            } else if (mevcut.featureValue !== wp.permalink) {
                await prisma.productFeature.update({
                    where: { id: mevcut.id },
                    data: { featureValue: wp.permalink }
                });
            }
        }
    } catch (err) {
        console.error('[Woo] Görsel/link yazılamadı:', err.message);
    }
}

export const woocommerceService = {
    /**
     * WooCommerce Entegrasyon Ayarlarını Getirir (Consumer Key maskelenmiş)
     */
    async getConfig(workspaceId) {
        const integration = await prisma.apiIntegration.findFirst({
            where: { workspaceId, name: INTEGRATION_NAME }
        });

        if (!integration) {
            return {
                isConfigured: false,
                isActive: false,
                storeUrl: '',
                consumerKeyMasked: '',
                autoSync: false,
                syncDirection: 'both',
                lastSyncAt: null,
                lastSyncStatus: null,
                lastSyncMessage: null
            };
        }

        let extra = {};
        if (integration.headers) {
            try {
                extra = JSON.parse(integration.headers);
            } catch {
                extra = {};
            }
        }

        let consumerKeyMasked = '';
        if (integration.apiKey) {
            const rawKey = decrypt(integration.apiKey) || '';
            if (rawKey.length > 8) {
                consumerKeyMasked = `${rawKey.substring(0, 4)}••••${rawKey.substring(rawKey.length - 4)}`;
            } else if (rawKey) {
                consumerKeyMasked = '••••••••';
            }
        }

        return {
            id: integration.id,
            isConfigured: Boolean(integration.baseUrl && integration.apiKey),
            isActive: integration.isActive,
            storeUrl: integration.baseUrl || '',
            consumerKeyMasked,
            autoSync: Boolean(extra.autoSync),
            syncDirection: extra.syncDirection || 'both',
            lastSyncAt: extra.lastSyncAt || null,
            lastSyncStatus: extra.lastSyncStatus || null,
            lastSyncMessage: extra.lastSyncMessage || null
        };
    },

    /**
     * WooCommerce Ayarlarını Kaydeder veya Günceller
     */
    async saveConfig(workspaceId, data) {
        const { storeUrl, consumerKey, consumerSecret, autoSync, syncDirection, isActive } = data;

        if (!storeUrl) {
            throw new Error('Mağaza web sitesi adresi (URL) gereklidir.');
        }

        let cleanUrl = storeUrl.trim().replace(/\/+$/, '');
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = `https://${cleanUrl}`;
        }

        const existing = await prisma.apiIntegration.findFirst({
            where: { workspaceId, name: INTEGRATION_NAME }
        });

        let existingHeaders = {};
        if (existing?.headers) {
            try { existingHeaders = JSON.parse(existing.headers); } catch {}
        }

        const newHeaders = JSON.stringify({
            ...existingHeaders,
            autoSync: autoSync !== undefined ? Boolean(autoSync) : Boolean(existingHeaders.autoSync),
            syncDirection: syncDirection || existingHeaders.syncDirection || 'both'
        });

        const updateData = {
            baseUrl: cleanUrl,
            isActive: isActive !== undefined ? Boolean(isActive) : true,
            headers: newHeaders,
            authType: 'BASIC'
        };

        if (consumerKey && consumerKey.trim() && !consumerKey.includes('•')) {
            updateData.apiKey = encrypt(consumerKey.trim());
        }

        if (consumerSecret && consumerSecret.trim() && !consumerSecret.includes('•')) {
            updateData.apiSecret = encrypt(consumerSecret.trim());
        }

        let saved;
        if (existing) {
            saved = await prisma.apiIntegration.update({
                where: { id: existing.id },
                data: updateData
            });
        } else {
            if (!consumerKey || !consumerSecret) {
                throw new Error('İlk kurulumda Consumer Key ve Consumer Secret zorunludur.');
            }
            saved = await prisma.apiIntegration.create({
                data: {
                    workspaceId,
                    name: INTEGRATION_NAME,
                    ...updateData
                }
            });
        }

        return this.getConfig(workspaceId);
    },

    /**
     * WooCommerce Bağlantısını Test Eder
     */
    async testConnection(workspaceId, credentials = null) {
        try {
            const { client, storeUrl } = await getClientForWorkspace(workspaceId, credentials);

            // Önce system_status veya products endpoint'ini test et
            let res;
            try {
                res = await client.get('/system_status');
                const env = res.data?.environment || {};
                return {
                    success: true,
                    storeName: env.site_title || storeUrl,
                    wcVersion: env.version || 'Bilinmiyor',
                    wpVersion: env.wp_version || 'Bilinmiyor',
                    message: `Bağlantı başarılı! WooCommerce v${env.version || ''} aktif.`
                };
            } catch (errStatus) {
                // system_status yetkisi kısıtlıysa products endpoint'i dene
                res = await client.get('/products', { params: { per_page: 1 } });
                return {
                    success: true,
                    storeName: storeUrl,
                    wcVersion: 'Tespit edildi',
                    message: 'Bağlantı başarılı! Ürün kataloğuna erişim sağlandı.'
                };
            }
        } catch (error) {
            console.error('WooCommerce testConnection error:', error.response?.data || error.message);
            const status = error.response?.status;
            let msg = error.message;

            if (status === 401) {
                msg = 'Yetkilendirme başarısız. Consumer Key veya Consumer Secret hatalı ya da yetkisi yetersiz.';
            } else if (status === 403) {
                msg = 'Erişim engellendi. API anahtarının "Okuma/Yazma" (Read/Write) iznine sahip olduğundan emin olun.';
            } else if (status === 404) {
                msg = 'WooCommerce REST API bulunamadı. WordPress sitenizde WooCommerce eklentisinin kurulu ve kalıcı bağlantıların (permalinks) aktif olduğunu kontrol edin.';
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                msg = 'Sunucuya ulaşılamadı. Lütfen mağaza adresinizi (URL) kontrol edin.';
            } else if (error.response?.data?.message) {
                msg = error.response.data.message;
            }

            return {
                success: false,
                error: msg
            };
        }
    },

    /**
     * Instomer Ürünlerini WooCommerce'e Aktarır (Push)
     */
    async pushProducts(workspaceId, productIds = null) {
        const { client } = await getClientForWorkspace(workspaceId);

        // 1. Instomer ürünlerini çek
        const where = { workspaceId, isGroup: false };
        if (productIds && Array.isArray(productIds) && productIds.length > 0) {
            where.id = { in: productIds };
        }

        const products = await prisma.product.findMany({
            where,
            include: {
                category: true,
                parent: true,
                features: true,
                productBranches: { include: { branch: true } }
            }
        });

        if (products.length === 0) {
            return { total: 0, created: 0, updated: 0, failed: 0, errors: [] };
        }

        // 2. WooCommerce mevcut kategorilerini al
        let wooCategories = [];
        try {
            const catRes = await client.get('/products/categories', { params: { per_page: 100 } });
            wooCategories = catRes.data || [];
        } catch (e) {
            console.warn('WooCommerce categories fetch warning:', e.message);
        }

        const categoryMap = new Map();
        wooCategories.forEach(c => {
            categoryMap.set(c.name.trim().toLowerCase(), c.id);
        });

        // 3. Eksik kategorileri WooCommerce'de oluştur
        const uniqueCategories = new Set();
        products.forEach(p => {
            if (p.category?.name) uniqueCategories.add(p.category.name.trim());
        });

        for (const catName of uniqueCategories) {
            const lower = catName.toLowerCase();
            if (!categoryMap.has(lower)) {
                try {
                    const newCat = await client.post('/products/categories', { name: catName });
                    categoryMap.set(lower, newCat.data.id);
                } catch (catErr) {
                    console.warn(`WooCommerce kategori oluşturulamadı: ${catName}`, catErr.message);
                }
            }
        }

        // 4. Ürünleri WooCommerce'e aktar
        let created = 0;
        let updated = 0;
        let failed = 0;
        const errors = [];

        for (const p of products) {
            try {
                const wooIdFeature = p.features?.find(f => f.featureKey === 'woocommerce_id');
                const existingWooId = wooIdFeature ? wooIdFeature.featureValue : null;

                const catId = p.category?.name ? categoryMap.get(p.category.name.trim().toLowerCase()) : null;

                // Dinamik nitelikler
                const attributes = (p.features || [])
                    .filter(f => f.featureKey !== 'woocommerce_id')
                    .map(f => ({
                        name: f.featureKey,
                        options: [f.featureValue],
                        visible: true
                    }));

                const payload = {
                    name: p.name,
                    type: 'simple',
                    regular_price: p.price !== undefined && p.price !== null ? String(p.price) : '0',
                    sale_price: p.discountedPrice ? String(p.discountedPrice) : '',
                    description: p.description || '',
                    short_description: p.aiContext || '',
                    categories: catId ? [{ id: catId }] : [],
                    attributes: attributes.length > 0 ? attributes : undefined
                };

                let wooProductId = existingWooId;

                if (existingWooId) {
                    try {
                        await client.put(`/products/${existingWooId}`, payload);
                        updated++;
                    } catch (putErr) {
                        // Eğer ürün WooCommerce'de silinmişse (404), yeniden oluştur
                        if (putErr.response?.status === 404) {
                            const newProd = await client.post('/products', payload);
                            wooProductId = String(newProd.data.id);
                            // Instomer feature'ı güncelle
                            await prisma.productFeature.updateMany({
                                where: { productId: p.id, featureKey: 'woocommerce_id' },
                                data: { featureValue: wooProductId }
                            });
                            created++;
                        } else {
                            throw putErr;
                        }
                    }
                } else {
                    const newProd = await client.post('/products', payload);
                    wooProductId = String(newProd.data.id);

                    // woocommerce_id özelliğini Instomer ürününe kaydet
                    await prisma.productFeature.create({
                        data: {
                            productId: p.id,
                            featureKey: 'woocommerce_id',
                            featureValue: wooProductId
                        }
                    });
                    created++;
                }
            } catch (err) {
                failed++;
                const errMsg = err.response?.data?.message || err.message;
                errors.push({ productName: p.name, error: errMsg });
                console.error(`WooCommerce sync product failed (${p.name}):`, errMsg);
            }
        }

        // Son senkronizasyon bilgisini kaydet
        await this._updateSyncLog(workspaceId, {
            status: failed > 0 ? (created + updated > 0 ? 'warning' : 'error') : 'success',
            message: `${created} eklendi, ${updated} güncellendi, ${failed} hata.`
        });

        return {
            total: products.length,
            created,
            updated,
            failed,
            errors
        };
    },

    /**
     * WooCommerce'den Ürünleri Instomer'a Çeker (Pull / Import)
     */
    async pullProducts(workspaceId) {
        const { client } = await getClientForWorkspace(workspaceId);

        // WooCommerce Ürünlerini Çek (sayfalama) - Kategoriler çekilmez, ürünler kategorisiz olarak Instomer'a aktarılır
        let page = 1;
        let allWooProducts = [];
        while (true) {
            const prodRes = await client.get('/products', {
                params: { per_page: 50, page, status: 'publish' }
            });
            const prods = prodRes.data || [];
            allWooProducts.push(...prods);
            if (prods.length < 50 || page >= 5) break; // Güvenlik sınırı: max 250 ürün tek seferde
            page++;
        }

        let imported = 0;
        let updated = 0;
        let failed = 0;

        for (const wp of allWooProducts) {
            try {
                const wooIdStr = String(wp.id);
                const regPrice = parseFloat(wp.regular_price) || parseFloat(wp.price) || 0;
                const salePrice = wp.sale_price ? parseFloat(wp.sale_price) : null;

                // Instomer'da woocommerce_id feature'ı ile eşleşen ürünü bul
                const existingFeature = await prisma.productFeature.findFirst({
                    where: {
                        featureKey: 'woocommerce_id',
                        featureValue: wooIdStr,
                        product: { workspaceId }
                    },
                    include: { product: true }
                });

                if (existingFeature?.product) {
                    // Güncelle (Kategoriye dokunulmaz, Instomer'daki kategori korunur)
                    await prisma.product.update({
                        where: { id: existingFeature.product.id },
                        data: {
                            name: wp.name,
                            price: regPrice,
                            discountedPrice: salePrice,
                            description: stripHtml(wp.description || '')
                        }
                    });
                    await medyaVeLinkYaz(existingFeature.product.id, wp);
                    updated++;
                } else {
                    // İsimle var mı kontrol et
                    const existingByName = await prisma.product.findFirst({
                        where: { workspaceId, name: wp.name, isGroup: false }
                    });

                    if (existingByName) {
                        await prisma.product.update({
                            where: { id: existingByName.id },
                            data: {
                                price: regPrice,
                                discountedPrice: salePrice
                            }
                        });
                        // woocommerce_id bağla
                        await prisma.productFeature.create({
                            data: {
                                productId: existingByName.id,
                                featureKey: 'woocommerce_id',
                                featureValue: wooIdStr
                            }
                        });
                        await medyaVeLinkYaz(existingByName.id, wp);
                        updated++;
                    } else {
                        // Yeni ürün oluştur (Kategorisiz - categoryId: null)
                        const yeniUrun = await prisma.product.create({
                            data: {
                                workspaceId,
                                name: wp.name,
                                description: stripHtml(wp.description || ''),
                                price: regPrice,
                                discountedPrice: salePrice,
                                categoryId: null,
                                isGroup: false,
                                features: {
                                    create: [
                                        { featureKey: 'woocommerce_id', featureValue: wooIdStr },
                                        ...(wp.attributes || []).map(attr => ({
                                            featureKey: attr.name,
                                            featureValue: Array.isArray(attr.options) ? attr.options.join(', ') : String(attr.options || '')
                                        }))
                                    ]
                                }
                            }
                        });
                        await medyaVeLinkYaz(yeniUrun.id, wp);
                        imported++;
                    }
                }
            } catch (err) {
                failed++;
                console.error(`WooCommerce import failed for product ID ${wp.id}:`, err.message);
            }
        }

        await this._updateSyncLog(workspaceId, {
            status: failed > 0 ? (imported + updated > 0 ? 'warning' : 'error') : 'success',
            message: `${imported} içe aktarıldı, ${updated} güncellendi, ${failed} hata.`
        });

        return {
            total: allWooProducts.length,
            imported,
            updated,
            failed
        };
    },

    /**
     * Tekil Bir Ürünü Anlık Olarak WooCommerce'e Senkronize Eder
     */
    async syncSingleProduct(workspaceId, productId) {
        try {
            const config = await this.getConfig(workspaceId);
            if (!config.isConfigured || !config.isActive || !config.autoSync) {
                return; // Otomatik sync aktif değilse işlem yapma
            }

            await this.pushProducts(workspaceId, [productId]);
            console.log(`[WooCommerce AutoSync] Ürün senkronize edildi: ${productId}`);
        } catch (err) {
            console.error(`[WooCommerce AutoSync Error] Ürün ${productId}:`, err.message);
        }
    },

    /**
     * Son senkronizasyon logunu kaydeder
     */
    async _updateSyncLog(workspaceId, { status, message }) {
        try {
            const existing = await prisma.apiIntegration.findFirst({
                where: { workspaceId, name: INTEGRATION_NAME }
            });
            if (!existing) return;

            let headersObj = {};
            if (existing.headers) {
                try { headersObj = JSON.parse(existing.headers); } catch {}
            }

            headersObj.lastSyncAt = new Date().toISOString();
            headersObj.lastSyncStatus = status;
            headersObj.lastSyncMessage = message;

            await prisma.apiIntegration.update({
                where: { id: existing.id },
                data: { headers: JSON.stringify(headersObj) }
            });
        } catch (err) {
            console.error('Failed to update sync log:', err);
        }
    }
};
