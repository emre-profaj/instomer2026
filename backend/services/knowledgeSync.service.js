import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { scrapeUrlContent } from './scraper.service.js';

/**
 * Belirli bir KnowledgeBase kaydını (URL veya FEED) manuel veya cron üzerinden günceller.
 * @param {string} entryId - Güncellenecek KnowledgeBase ID'si
 * @returns {Promise<boolean>}
 */
export const syncKnowledgeEntry = async (entryId) => {
    try {
        const entry = await prisma.knowledgeBase.findUnique({
            where: { id: entryId }
        });

        if (!entry || !entry.sourceUrl) {
            console.log(`[KBSync] Entry ${entryId} bulunamadı veya bir URL içermiyor.`);
            return false;
        }

        console.log(`[KBSync] Senkronize ediliyor: ${entry.sourceUrl}`);
        
        // Scraper üzerinden güncel veriyi çek
        const scrapedData = await scrapeUrlContent(entry.sourceUrl);

        // İçeriği güncelle
        await prisma.knowledgeBase.update({
            where: { id: entryId },
            data: {
                content: scrapedData.content,
                // Başlık eğer kullanıcı tarafından manuel olarak değiştirilmemişse (default scraper başlığı kullanılıyorsa) 
                // üzerine yazabiliriz, ama kullanıcının özel başlığını bozmamak için title güncellemiyoruz.
                lastSyncedAt: new Date(),
                // Sadece kaynağın URL veya FEED olmasını garantile
                sourceType: scrapedData.type === 'FEED' ? 'FEED' : 'URL'
            }
        });

        console.log(`✅ [KBSync] Başarılı: ${entry.title}`);
        return true;
    } catch (error) {
        console.error(`❌ [KBSync] Hata (${entryId}):`, error.message);
        return false;
    }
};

/**
 * Zamanı gelmiş olan (lastSyncedAt + syncInterval < NOW) tüm kaynakları tarar.
 */
export const runScheduledSyncs = async () => {
    try {
        console.log('[KBSync] Zamanlanmış senkronizasyon taraması başlatılıyor...');
        
        // syncInterval olan ve sourceUrl olan kayıtları getir
        const entries = await prisma.knowledgeBase.findMany({
            where: {
                sourceUrl: { not: null },
                syncInterval: { not: null }
            }
        });

        const now = new Date();
        let syncCount = 0;

        for (const entry of entries) {
            // Eğer daha önce hiç senkronize edilmemişse (eklendiği an hariç) veya süresi dolmuşsa
            // Not: syncInterval saat cinsinden.
            
            let shouldSync = false;
            
            if (!entry.lastSyncedAt) {
                shouldSync = true;
            } else {
                const hoursSinceLastSync = (now.getTime() - entry.lastSyncedAt.getTime()) / (1000 * 60 * 60);
                if (hoursSinceLastSync >= entry.syncInterval) {
                    shouldSync = true;
                }
            }

            if (shouldSync) {
                await syncKnowledgeEntry(entry.id);
                syncCount++;
            }
        }

        console.log(`[KBSync] Tarama tamamlandı. ${syncCount} kayıt güncellendi.`);
    } catch (error) {
        console.error('[KBSync] Zamanlanmış görev sırasında hata:', error);
    }
};

/**
 * Cron Job'ı başlatır. Her saat başı kontrol eder.
 */
export const initKnowledgeCron = () => {
    // Dakika başı test için: '* * * * *'
    // Her saat başı 0. dakikada kontrol et: '0 * * * *'
    console.log('🔄 [KBSync] Senkronizasyon servisi (Cron) başlatıldı. Her saat başı kontrol edilecek.');
    
    cron.schedule('0 * * * *', async () => {
        await runScheduledSyncs();
    });
};
