import { PrismaClient } from '@prisma/client';
import { analyzeSentimentForConversation } from '../controllers/ai.controller.js';

const prisma = new PrismaClient();

let isProcessing = false;

export const startSentimentAnalyzer = () => {
    console.log('🤖 [SentimentService] Başlatıldı. 10 dakikada bir analiz edilmemiş konuşmaları kontrol edecek.');
    
    // Her 10 dakikada bir çalış
    setInterval(processUnanalyzedSentiments, 10 * 60 * 1000);
    
    // İlk çalıştırmayı biraz gecikmeli yap
    setTimeout(processUnanalyzedSentiments, 30000);
};

const processUnanalyzedSentiments = async () => {
    if (isProcessing) return;
    
    try {
        isProcessing = true;
        
        // Son 24 saat içinde güncellenmiş ve sentiment alanı null olanları bul
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const conversationsToAnalyze = await prisma.conversation.findMany({
            where: {
                sentiment: null,
                lastMessageAt: {
                    gte: twentyFourHoursAgo
                }
            },
            select: {
                id: true,
                workspaceId: true
            },
            take: 20 // Her seferinde en fazla 20 tane analiz et (API limitlerini zorlamamak için)
        });

        if (conversationsToAnalyze.length > 0) {
            console.log(`🤖 [SentimentService] ${conversationsToAnalyze.length} adet analiz edilmemiş konuşma bulundu. Analiz başlıyor...`);
            
            for (const conv of conversationsToAnalyze) {
                // Her biri için analiz metodunu çağır (birer birer)
                await analyzeSentimentForConversation(conv.workspaceId, conv.id, false);
                
                // Aralarında biraz bekle (API rate limit koruması)
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            console.log(`🤖 [SentimentService] Analiz turu tamamlandı.`);
        }
        
    } catch (error) {
        console.error('❌ [SentimentService] Error:', error.message);
    } finally {
        isProcessing = false;
    }
};
