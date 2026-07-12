import prisma from '../lib/prisma.js';
import crypto from 'crypto';

/**
 * Payment Service
 * Handles payment link generation and webhook processing.
 * Supports iyzico and generic payment providers.
 */

const IYZICO_SANDBOX_URL = 'https://sandbox-api.iyzipay.com';
const IYZICO_PROD_URL = 'https://api.iyzipay.com';

/**
 * Get payment integration config for a workspace
 */
export async function getPaymentConfig(workspaceId) {
    const integration = await prisma.apiIntegration.findFirst({
        where: { workspaceId, type: 'PAYMENT', isActive: true }
    });
    
    if (!integration) return null;
    
    const config = integration.config ? 
        (typeof integration.config === 'string' ? JSON.parse(integration.config) : integration.config) 
        : {};
    
    return {
        provider: integration.provider || 'iyzico',
        apiKey: config.apiKey,
        secretKey: config.secretKey,
        baseUrl: config.sandbox ? IYZICO_SANDBOX_URL : IYZICO_PROD_URL,
        sandbox: !!config.sandbox,
        callbackUrl: config.callbackUrl || `${process.env.APP_URL || ''}/api/payments/callback`
    };
}

/**
 * Create a payment link via iyzico
 */
export async function createPaymentLink(workspaceId, { amount, description, contactId, orderId, buyerInfo }) {
    const config = await getPaymentConfig(workspaceId);
    
    if (!config) {
        // No payment integration — create manual payment record
        const payment = await prisma.contactActivity.create({
            data: {
                contactId,
                workspaceId,
                type: 'PAYMENT',
                title: `Ödeme talebi: ${amount} TL`,
                description: description || '',
                status: 'PENDING',
                metadata: JSON.stringify({ amount, orderId, manual: true })
            }
        });
        return { success: true, manual: true, paymentId: payment.id, message: 'Manuel ödeme talebi oluşturuldu.' };
    }
    
    if (config.provider === 'iyzico') {
        return await createIyzicoPaymentLink(config, { amount, description, contactId, orderId, buyerInfo, workspaceId });
    }
    
    return { success: false, message: 'Desteklenmeyen ödeme sağlayıcısı.' };
}

/**
 * iyzico Payment Link Creation
 */
async function createIyzicoPaymentLink(config, { amount, description, contactId, orderId, buyerInfo, workspaceId }) {
    try {
        const conversationId = `INS-${Date.now()}`;
        const basketId = orderId || `BASKET-${Date.now()}`;
        
        const requestBody = {
            locale: 'tr',
            conversationId,
            price: amount.toString(),
            paidPrice: amount.toString(),
            currency: 'TRY',
            basketId,
            paymentGroup: 'PRODUCT',
            callbackUrl: config.callbackUrl,
            enabledInstallments: [1, 2, 3, 6],
            buyer: {
                id: contactId || 'GUEST',
                name: buyerInfo?.firstName || 'Müşteri',
                surname: buyerInfo?.lastName || '',
                email: buyerInfo?.email || 'musteri@instomer.com',
                identityNumber: '11111111111',
                registrationAddress: buyerInfo?.address || 'Türkiye',
                ip: '127.0.0.1',
                city: buyerInfo?.city || 'Istanbul',
                country: 'Turkey'
            },
            shippingAddress: {
                contactName: buyerInfo?.firstName || 'Müşteri',
                city: buyerInfo?.city || 'Istanbul',
                country: 'Turkey',
                address: buyerInfo?.address || 'Türkiye'
            },
            billingAddress: {
                contactName: buyerInfo?.firstName || 'Müşteri',
                city: buyerInfo?.city || 'Istanbul',
                country: 'Turkey',
                address: buyerInfo?.address || 'Türkiye'
            },
            basketItems: [{
                id: orderId || 'ITEM1',
                name: description || 'Ödeme',
                category1: 'Genel',
                itemType: 'PHYSICAL',
                price: amount.toString()
            }]
        };
        
        // Generate iyzico auth headers
        const pki = generatePKI(requestBody);
        const authHeader = generateAuthHeader(config.apiKey, config.secretKey, pki);
        
        const response = await fetch(`${config.baseUrl}/payment/iyzipos/checkoutform/initialize/auth/ecom`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'x-iyzi-rnd': pki.randomKey
            },
            body: JSON.stringify(requestBody)
        });
        
        const result = await response.json();
        
        if (result.status === 'success' && result.paymentPageUrl) {
            // Store payment reference
            await prisma.contactActivity.create({
                data: {
                    contactId,
                    workspaceId,
                    type: 'PAYMENT',
                    title: `Ödeme linki: ${amount} TL`,
                    description: JSON.stringify({
                        provider: 'iyzico',
                        token: result.token,
                        conversationId,
                        amount,
                        paymentPageUrl: result.paymentPageUrl
                    }),
                    status: 'PENDING'
                }
            });
            
            return {
                success: true,
                paymentUrl: result.paymentPageUrl,
                token: result.token,
                message: `Ödeme linki oluşturuldu: ${result.paymentPageUrl}`
            };
        }
        
        return { success: false, message: result.errorMessage || 'Ödeme linki oluşturulamadı.' };
    } catch (err) {
        console.error('[Payment] iyzico error:', err.message);
        return { success: false, message: 'Ödeme sistemi hatası.' };
    }
}

/**
 * iyzico PKI string generator
 */
function generatePKI(data) {
    const randomKey = `${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    // Simplified PKI generation — real implementation needs full iyzico SDK
    return { pki: JSON.stringify(data), randomKey };
}

/**
 * iyzico authorization header generator  
 */
function generateAuthHeader(apiKey, secretKey, pki) {
    const hashStr = `${apiKey}${pki.randomKey}${secretKey}${pki.pki}`;
    const hash = crypto.createHash('sha1').update(hashStr).digest('base64');
    return `IYZWS ${apiKey}:${hash}`;
}

/**
 * Handle payment callback/webhook
 */
export async function handlePaymentCallback(token, workspaceId) {
    try {
        // Find payment record by token
        const activities = await prisma.contactActivity.findMany({
            where: {
                workspaceId,
                type: 'PAYMENT',
                status: 'PENDING',
                description: { contains: token }
            }
        });
        
        for (const activity of activities) {
            try {
                const desc = JSON.parse(activity.description);
                if (desc.token === token) {
                    await prisma.contactActivity.update({
                        where: { id: activity.id },
                        data: { status: 'COMPLETED' }
                    });
                    return { success: true, message: 'Ödeme onaylandı.' };
                }
            } catch { /* skip */ }
        }
        
        return { success: false, message: 'Ödeme kaydı bulunamadı.' };
    } catch (err) {
        console.error('[Payment] callback error:', err.message);
        return { success: false, message: 'Callback işleme hatası.' };
    }
}
