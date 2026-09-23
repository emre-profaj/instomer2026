/**
 * Ürün feed'i (Google Merchant Center / Google Shopping) uçları.
 * İş mantığı services/productFeed.service.js içinde.
 */

import {
    feedOku,
    feedIceAktar,
    feedAyariniGetir,
    feedAyariniKaydet
} from '../services/productFeed.service.js';

export const getFeedConfig = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        res.json(await feedAyariniGetir(workspaceId));
    } catch (err) {
        console.error('getFeedConfig error:', err);
        res.status(500).json({ error: 'Feed ayarı okunamadı.' });
    }
};

export const saveFeedConfig = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { feedUrl, isActive } = req.body;
        await feedAyariniKaydet(workspaceId, { feedUrl, isActive: isActive !== false });
        res.json(await feedAyariniGetir(workspaceId));
    } catch (err) {
        res.status(400).json({ error: err.message || 'Feed ayarı kaydedilemedi.' });
    }
};

/** Kaydetmeden önce: adres gerçekten ürün veriyor mu? */
export const testFeed = async (req, res) => {
    try {
        const { feedUrl } = req.body;
        const urunler = await feedOku(feedUrl);
        const gorselli = urunler.filter(u => u.imageUrl).length;
        res.json({
            ok: true,
            toplam: urunler.length,
            gorselli,
            ornekler: urunler.slice(0, 3).map(u => ({
                name: u.name,
                price: u.price,
                imageUrl: u.imageUrl,
                url: u.url
            }))
        });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
};

export const syncFeed = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const ayar = await feedAyariniGetir(workspaceId);
        const url = req.body?.feedUrl || ayar.feedUrl;
        if (!url) return res.status(400).json({ error: 'Önce bir feed adresi kaydedin.' });

        const ozet = await feedIceAktar(workspaceId, url);
        res.json({ ok: true, ...ozet });
    } catch (err) {
        console.error('syncFeed error:', err);
        res.status(400).json({ error: err.message || 'Feed içe aktarılamadı.' });
    }
};
