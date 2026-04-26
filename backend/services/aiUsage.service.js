/**
 * AI Kullanım Limiti Servisi
 * 
 * Workspace bazlı günlük AI sohbet limiti kontrolü ve yönetimi
 */

import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';


// Abonelik planları ve limitleri
export const SUBSCRIPTION_PLANS = {
    FREE: { limit: 50, name: 'Ücretsiz', price: 0 },
    BASIC: { limit: 200, name: 'Başlangıç', price: 99 },
    PRO: { limit: 1000, name: 'Profesyonel', price: 299 },
    UNLIMITED: { limit: 999999, name: 'Sınırsız', price: 599 }
};

/**
 * Günlük AI kullanım limitini kontrol et
 * @param {string} workspaceId - Workspace ID
 * @returns {Object} - { allowed, currentCount, limit, remaining, subscription, reason }
 */
export async function checkAiUsageLimit(workspaceId) {
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                name: true,
                dailyAiChatLimit: true,
                dailyAiChatCount: true,
                lastAiCountResetAt: true,
                aiSubscriptionType: true,
                aiSubscriptionEndsAt: true,
                companyId: true,
                company: {
                    select: {
                        dailyAiChatLimit: true,
                        aiSubscriptionType: true
                    }
                }
            }
        });

        if (!workspace) {
            console.log(`🚫 [AI Usage] Workspace not found: ${workspaceId}`);
            return { allowed: false, reason: 'WORKSPACE_NOT_FOUND' };
        }

        // Firma bağlıysa firmanın limitini kullan
        const subscriptionType = workspace.company?.aiSubscriptionType || workspace.aiSubscriptionType || 'FREE';
        let isSubscriptionActive = true;

        if (subscriptionType !== 'FREE' && workspace.aiSubscriptionEndsAt) {
            isSubscriptionActive = new Date() < new Date(workspace.aiSubscriptionEndsAt);

            // Abonelik süresi dolduysa FREE'ye düşür
            if (!isSubscriptionActive) {
                console.log(`⚠️ [AI Usage] Subscription expired for workspace ${workspaceId}, downgrading to FREE`);
                await prisma.workspace.update({
                    where: { id: workspaceId },
                    data: {
                        aiSubscriptionType: 'FREE',
                        dailyAiChatLimit: SUBSCRIPTION_PLANS.FREE.limit
                    }
                });
                workspace.aiSubscriptionType = 'FREE';
                workspace.dailyAiChatLimit = SUBSCRIPTION_PLANS.FREE.limit;
            }
        }

        // Günlük sıfırlama kontrolü (her gün gece yarısı Türkiye saati)
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastReset = new Date(workspace.lastAiCountResetAt);
        const lastResetDay = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getDate());

        let currentCount = workspace.dailyAiChatCount;

        // Yeni gün başladıysa sayacı sıfırla
        if (today > lastResetDay) {
            console.log(`🔄 [AI Usage] New day, resetting counter for workspace ${workspaceId}`);
            await prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                    dailyAiChatCount: 0,
                    lastAiCountResetAt: now
                }
            });
            currentCount = 0;
        }

        // Firma varsa firmanın limitini kullan
        const limit = workspace.company?.dailyAiChatLimit || workspace.dailyAiChatLimit;
        const remaining = Math.max(0, limit - currentCount);

        // Limit kontrolü
        if (currentCount >= limit) {
            console.log(`🚫 [AI Usage] Limit exceeded for ${workspace.name}: ${currentCount}/${limit}`);

            // Frontend'e bildirim gönder
            emitToWorkspace(workspaceId, 'ai_limit_exceeded', {
                currentCount,
                limit,
                remaining: 0,
                subscription: subscriptionType,
                message: 'Günlük AI kullanım limitiniz doldu. Devam etmek için planınızı yükseltin.'
            });

            return {
                allowed: false,
                reason: 'LIMIT_EXCEEDED',
                currentCount,
                limit,
                remaining: 0,
                subscription: subscriptionType,
                subscriptionName: SUBSCRIPTION_PLANS[subscriptionType]?.name || 'Ücretsiz'
            };
        }

        return {
            allowed: true,
            currentCount,
            limit,
            remaining,
            subscription: subscriptionType,
            subscriptionName: SUBSCRIPTION_PLANS[subscriptionType]?.name || 'Ücretsiz'
        };
    } catch (error) {
        console.error('❌ [AI Usage] Check limit error:', error);
        // Hata durumunda izin ver (kullanıcı deneyimini bozmamak için)
        return { allowed: true, error: error.message };
    }
}

/**
 * AI kullanım sayacını artır
 * @param {string} workspaceId - Workspace ID
 */
export async function incrementAiUsage(workspaceId) {
    try {
        const result = await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                dailyAiChatCount: { increment: 1 }
            },
            select: {
                dailyAiChatCount: true,
                dailyAiChatLimit: true
            }
        });

        console.log(`📊 [AI Usage] Incremented: ${result.dailyAiChatCount}/${result.dailyAiChatLimit} for workspace ${workspaceId}`);

        // Limite yaklaşıyorsa uyarı gönder
        const percentage = (result.dailyAiChatCount / result.dailyAiChatLimit) * 100;
        if (percentage >= 80 && percentage < 100) {
            emitToWorkspace(workspaceId, 'ai_limit_warning', {
                currentCount: result.dailyAiChatCount,
                limit: result.dailyAiChatLimit,
                remaining: result.dailyAiChatLimit - result.dailyAiChatCount,
                percentage: Math.round(percentage),
                message: `AI kullanım limitinizin %${Math.round(percentage)}'ine ulaştınız.`
            });
        }

        return result;
    } catch (error) {
        console.error('❌ [AI Usage] Increment error:', error);
    }
}

/**
 * Workspace'in AI kullanım bilgilerini getir
 * @param {string} workspaceId - Workspace ID
 */
export async function getAiUsageStats(workspaceId) {
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                dailyAiChatLimit: true,
                dailyAiChatCount: true,
                lastAiCountResetAt: true,
                aiSubscriptionType: true,
                aiSubscriptionEndsAt: true,
                companyId: true,
                company: {
                    select: {
                        dailyAiChatLimit: true,
                        aiSubscriptionType: true
                    }
                }
            }
        });

        if (!workspace) {
            return null;
        }

        // Günlük sıfırlama kontrolü
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastReset = new Date(workspace.lastAiCountResetAt);
        const lastResetDay = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getDate());

        let currentCount = workspace.dailyAiChatCount;
        if (today > lastResetDay) {
            currentCount = 0; // Yeni gün, henüz sıfırlanmamış ama gösterimde 0
        }

        // Firma bağlıysa firmanın limitini kullan, değilse workspace'in kendi limitini kullan
        const limit = workspace.company?.dailyAiChatLimit || workspace.dailyAiChatLimit;
        const subscriptionType = workspace.company?.aiSubscriptionType || workspace.aiSubscriptionType || 'FREE';
        const plan = SUBSCRIPTION_PLANS[subscriptionType] || SUBSCRIPTION_PLANS.FREE;

        return {
            currentCount,
            limit,
            remaining: Math.max(0, limit - currentCount),
            percentage: Math.round((currentCount / limit) * 100),
            subscription: subscriptionType,
            subscriptionName: plan.name,
            subscriptionPrice: plan.price,
            expiresAt: workspace.aiSubscriptionEndsAt,
            lastResetAt: workspace.lastAiCountResetAt,
            plans: SUBSCRIPTION_PLANS
        };
    } catch (error) {
        console.error('❌ [AI Usage] Get stats error:', error);
        return null;
    }
}

/**
 * Workspace'in AI limitini güncelle (Admin için)
 * @param {string} workspaceId - Workspace ID
 * @param {Object} data - { dailyLimit, subscriptionType, durationDays }
 */
export async function updateAiLimit(workspaceId, { dailyLimit, subscriptionType, durationDays }) {
    try {
        const updateData = {};

        if (dailyLimit !== undefined) {
            updateData.dailyAiChatLimit = parseInt(dailyLimit);
        }

        if (subscriptionType) {
            updateData.aiSubscriptionType = subscriptionType;

            // Plan değiştiğinde limiti de güncelle (eğer dailyLimit verilmediyse)
            if (dailyLimit === undefined && SUBSCRIPTION_PLANS[subscriptionType]) {
                updateData.dailyAiChatLimit = SUBSCRIPTION_PLANS[subscriptionType].limit;
            }

            // Abonelik süresi
            if (subscriptionType !== 'FREE' && durationDays) {
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + parseInt(durationDays));
                updateData.aiSubscriptionEndsAt = expiresAt;
            } else if (subscriptionType === 'FREE') {
                updateData.aiSubscriptionEndsAt = null;
            }
        }

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: updateData,
            select: {
                id: true,
                name: true,
                dailyAiChatLimit: true,
                dailyAiChatCount: true,
                aiSubscriptionType: true,
                aiSubscriptionEndsAt: true
            }
        });

        console.log(`✅ [AI Usage] Updated limits for ${workspace.name}: ${workspace.dailyAiChatLimit}/day, Plan: ${workspace.aiSubscriptionType}`);

        return workspace;
    } catch (error) {
        console.error('❌ [AI Usage] Update limit error:', error);
        throw error;
    }
}

/**
 * Tüm workspace'lerin AI kullanım sayaçlarını sıfırla (Cron job için)
 */
export async function resetAllDailyCounters() {
    try {
        const result = await prisma.workspace.updateMany({
            data: {
                dailyAiChatCount: 0,
                lastAiCountResetAt: new Date()
            }
        });

        console.log(`🔄 [AI Usage] Reset daily counters for ${result.count} workspaces`);
        return result;
    } catch (error) {
        console.error('❌ [AI Usage] Reset counters error:', error);
    }
}

