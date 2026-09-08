import { woocommerceService } from '../services/woocommerce.service.js';

export const getWooCommerceConfig = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const config = await woocommerceService.getConfig(workspaceId);
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('getWooCommerceConfig error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const saveWooCommerceConfig = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const config = await woocommerceService.saveConfig(workspaceId, req.body);
        res.json({ success: true, data: config, message: 'WooCommerce ayarları kaydedildi.' });
    } catch (error) {
        console.error('saveWooCommerceConfig error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
};

export const testWooCommerceConnection = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const credentials = req.body?.storeUrl ? req.body : null;
        const result = await woocommerceService.testConnection(workspaceId, credentials);
        
        if (result.success) {
            res.json({ success: true, ...result });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('testWooCommerceConnection error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const pushProductsToWooCommerce = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { productIds } = req.body || {};
        const result = await woocommerceService.pushProducts(workspaceId, productIds);
        res.json({
            success: true,
            data: result,
            message: `${result.created} ürün eklendi, ${result.updated} ürün güncellendi.`
        });
    } catch (error) {
        console.error('pushProductsToWooCommerce error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const pullProductsFromWooCommerce = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const result = await woocommerceService.pullProducts(workspaceId);
        res.json({
            success: true,
            data: result,
            message: `${result.imported} ürün içe aktarıldı, ${result.updated} ürün güncellendi.`
        });
    } catch (error) {
        console.error('pullProductsFromWooCommerce error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
