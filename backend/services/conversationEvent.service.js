import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';

/**
 * Konuşma olayı kaydet — timeline'da gösterilecek
 */
export async function logEvent({ conversationId, contactId, workspaceId, eventType, title, details, actorId, actorType = 'SYSTEM' }) {
    try {
        // contactId yoksa conversation'dan al
        if (!contactId) {
            const conv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { contactId: true, workspaceId: true }
            });
            contactId = conv?.contactId;
            if (!workspaceId) workspaceId = conv?.workspaceId;
        }

        if (!contactId || !workspaceId) {
            console.warn('[EventLog] contactId or workspaceId missing, skipping');
            return null;
        }

        const event = await prisma.conversationEvent.create({
            data: {
                conversationId,
                contactId,
                workspaceId,
                eventType,
                title,
                details: details ? JSON.stringify(details) : null,
                actorId,
                actorType
            }
        });
        console.log(`📝 [EventLog] ${eventType}: ${title}`);

        // Emit socket event for real-time timeline update
        try {
            emitToWorkspace(workspaceId, 'conversation_event', {
                conversationId,
                event: {
                    id: event.id,
                    createdAt: event.createdAt,
                    eventType: event.eventType,
                    title: event.title,
                    actorType: event.actorType,
                    actorId: event.actorId,
                    details: event.details
                }
            });
        } catch (_) {}

        return event;
    } catch (err) {
        // Don't crash if ConversationEvent table doesn't exist yet (pre-migration)
        if (err.code === 'P2021' || err.message?.includes('does not exist')) {
            console.warn('[EventLog] Table not yet created, skipping event log');
            return null;
        }
        console.error('[EventLog] Error:', err.message);
        return null;
    }
}
