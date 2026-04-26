import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { refreshHealthSystemToken } from '../controllers/probel_proxy.controller.js';

export const startHealthSystemCron = () => {
    // Her 4 saatte bir çalıştır (Token süresi genelde 6-12 saat olur)
    cron.schedule('0 */4 * * *', async () => {
        try {
            console.log('⏰ [HealthSystem] Starting background token refresh job...');
            
            // Aktif tüm sağlık sistemi bağlantılarını al
            const integrations = await prisma.apiIntegration.findMany({
                where: { authType: 'OAUTH_PASSWORD', isActive: true }
            });

            if (integrations.length === 0) {
                return;
            }

            let successCount = 0;
            for (const integration of integrations) {
                const token = await refreshHealthSystemToken(integration.workspaceId);
                if (token) {
                    successCount++;
                } else {
                    console.warn(`⚠️ [HealthSystem] Failed to refresh token for workspace ${integration.workspaceId}`);
                }
            }

            console.log(`✅ [HealthSystem] Background token refresh complete. Refreshed ${successCount}/${integrations.length} integrations.`);
        } catch (error) {
            console.error('❌ [HealthSystem] Background token refresh cron error:', error.message);
        }
    });
};
