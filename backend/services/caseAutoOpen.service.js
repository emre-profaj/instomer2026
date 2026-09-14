import { ensureCaseForConversation } from '../controllers/case.controller.js';

/**
 * Otomatik vaka açma / bağlama servisi.
 * Tüm operasyonları merkezi ensureCaseForConversation üzerinden yürütür.
 * Eşzamanlı çağrılarda FIFO Mutex kilidi kullanarak mükerrer case oluşmasını kesin olarak engeller.
 */
export async function autoOpenCaseIfNeeded(workspaceId, contactId, conversationId) {
    if (!workspaceId || !conversationId) return null;
    return await ensureCaseForConversation(workspaceId, conversationId);
}
