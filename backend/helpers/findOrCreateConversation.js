/**
 * findOrCreateConversation
 * 
 * Aynı contact + workspace için son 24 saatte bir konuşma varsa onu döndürür,
 * yoksa yeni bir konuşma oluşturur.
 * 
 * Bu fonksiyon farklı kanallardan gelen mesajları aynı konuşmaya birleştirmek
 * için kullanılır (default: 24 saat penceresi).
 */
import prisma from '../lib/prisma.js';

const MERGE_WINDOW_HOURS = 24;

/**
 * @param {Object} params
 * @param {string} params.workspaceId
 * @param {string} params.contactId
 * @param {string} params.channel - 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'EMAIL', 'WIDGET', 'FORM', 'PHONE', 'LEAD'
 * @param {Object} [params.extraData] - Ek alanlar (facebookPageId, whatsappPhoneNumberId, vb.)
 * @param {boolean} [params.mergeAcrossChannels=true] - Farklı kanallar arası birleştirme
 * @param {boolean} [params.sameChannelOnly=false] - Sadece aynı kanal içinde birleştir
 * @returns {Promise<{conversation: Object, isNew: boolean}>}
 */
export async function findOrCreateConversation({
    workspaceId,
    contactId,
    channel,
    extraData = {},
    mergeAcrossChannels = true,
    sameChannelOnly = false
}) {
    if (!workspaceId || !contactId) {
        throw new Error('workspaceId and contactId are required');
    }

    const mergeWindowMs = MERGE_WINDOW_HOURS * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - mergeWindowMs);

    // Mevcut bir konuşma ara
    const whereClause = {
        workspaceId,
        contactId,
        lastMessageAt: { gte: cutoff },
        status: { not: 'RESOLVED' } // Çözülmüş konuşmalara ekleme
    };

    // Kanal bazlı filtreleme
    if (sameChannelOnly) {
        whereClause.channel = channel;
    }
    // mergeAcrossChannels true ise kanal filtresi yok — tüm kanallardan konuşma aranır

    const existingConversation = await prisma.conversation.findFirst({
        where: whereClause,
        orderBy: { lastMessageAt: 'desc' },
        include: {
            contact: true,
            facebookPage: true,
            whatsappPhoneNumber: true,
            assignedTo: {
                select: { id: true, name: true, avatar: true }
            },
            assignedBot: {
                select: { id: true, name: true, role: true }
            }
        }
    });

    if (existingConversation) {
        console.log(`🔗 [Merge] Found existing conversation ${existingConversation.id} (channel: ${existingConversation.channel}) for contact ${contactId}, reusing instead of creating new`);
        return { conversation: existingConversation, isNew: false };
    }

    // Yeni konuşma oluştur
    const newConversation = await prisma.conversation.create({
        data: {
            workspaceId,
            contactId,
            channel,
            status: 'OPEN',
            lastMessageAt: new Date(),
            ...extraData
        },
        include: {
            contact: true,
            facebookPage: true,
            whatsappPhoneNumber: true,
            assignedTo: {
                select: { id: true, name: true, avatar: true }
            },
            assignedBot: {
                select: { id: true, name: true, role: true }
            }
        }
    });

    console.log(`🆕 [Merge] Created new conversation ${newConversation.id} (channel: ${channel}) for contact ${contactId}`);
    return { conversation: newConversation, isNew: true };
}

export default findOrCreateConversation;
