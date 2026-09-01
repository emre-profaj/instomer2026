/**
 * migrate_bulk_conversations.js
 * 
 * Mevcut bulk gönderimlerden oluşan sohbetleri tespit edip isBulkSend: true yapar.
 * Kriter: Sadece TEMPLATE mesajları olan ve müşteriden hiç mesaj gelmemiş sohbetler.
 * 
 * Kullanım: node scripts/migrate_bulk_conversations.js
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrateBulkConversations() {
    console.log('🔍 Bulk sohbetler tespit ediliyor...');

    // Müşteriden hiç mesaj gelmemiş VE en az 1 TEMPLATE mesajı olan sohbetler
    const bulkConversations = await prisma.conversation.findMany({
        where: {
            isBulkSend: false,
            messages: {
                every: { isFromContact: false },
                some: { messageType: 'TEMPLATE' }
            }
        },
        select: { id: true, contactId: true }
    });

    console.log(`📊 ${bulkConversations.length} bulk sohbet tespit edildi.`);

    if (bulkConversations.length === 0) {
        console.log('✅ İşaretlenecek sohbet yok.');
        await prisma.$disconnect();
        return;
    }

    // Toplu güncelleme
    const result = await prisma.conversation.updateMany({
        where: { id: { in: bulkConversations.map(c => c.id) } },
        data: { isBulkSend: true }
    });

    console.log(`✅ ${result.count} sohbet isBulkSend: true olarak işaretlendi.`);

    // Ayrıca mevcut sohbetlerde lastContactMessageAt'ı doldur
    console.log('🔄 lastContactMessageAt güncelleniyor...');
    
    const conversationsWithContactMessages = await prisma.conversation.findMany({
        where: {
            lastContactMessageAt: null,
            messages: { some: { isFromContact: true } }
        },
        select: { id: true },
    });

    let updated = 0;
    for (const conv of conversationsWithContactMessages) {
        const lastContactMsg = await prisma.message.findFirst({
            where: { conversationId: conv.id, isFromContact: true },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true }
        });
        if (lastContactMsg) {
            await prisma.conversation.update({
                where: { id: conv.id },
                data: { lastContactMessageAt: lastContactMsg.createdAt }
            });
            updated++;
        }
    }

    console.log(`✅ ${updated} sohbette lastContactMessageAt güncellendi.`);
    await prisma.$disconnect();
}

migrateBulkConversations().catch(e => {
    console.error('❌ Hata:', e);
    prisma.$disconnect();
    process.exit(1);
});
