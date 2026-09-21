/**
 * ═══════════════════════════════════════════════════════════════
 * BAĞLI RETELL AGENT'LARI — TEK OKUMA NOKTASI
 * ═══════════════════════════════════════════════════════════════
 *
 * Bir workspace'e birden çok Retell agent'ı bağlanabilir; her birinin
 * kendi arama numarası olabilir. Hepsi retell_agent_links tablosundadır.
 *
 * workspaces.retellAgentId / retellFromNumber kalıyor ve artık
 * "varsayılan" anlamına geliyor: açıkça agent verilmeyen aramalarda ve
 * agent'a numara tanımlanmamışsa kullanılır.
 *
 * NEDEN TEK DOSYA: agent ve numara kodun on iki ayrı yerinden okunuyordu;
 * gelen arama eşleştirmesi iki ayrı yerde kopyalanmıştı ve bağlı olmayan
 * agent'a gelen çağrı "workspace not found" deyip düşüyordu. Kural
 * değişince tek yerin değişmesi için hepsi buradan geçer.
 */
import prisma from '../lib/prisma.js';

/** agent_id'den workspace bulur: önce bağlantı tablosu, sonra varsayılan alan. */
export async function resolveWorkspaceIdByAgent(agentId) {
    if (!agentId) return null;
    const link = await prisma.retellAgentLink.findFirst({
        where: { agentId, isActive: true },
        select: { workspaceId: true }
    });
    if (link) return link.workspaceId;

    // Bağlantı tablosu henüz taşınmamışsa eski alana düş.
    const ws = await prisma.workspace.findFirst({
        where: { retellAgentId: agentId },
        select: { id: true }
    });
    return ws?.id || null;
}

/** Aranan/arayan numaradan workspace bulur (bağlı agent numaraları dahil). */
export async function resolveWorkspaceIdByNumber(number) {
    if (!number) return null;
    const link = await prisma.retellAgentLink.findFirst({
        where: { fromNumber: number, isActive: true },
        select: { workspaceId: true }
    });
    if (link) return link.workspaceId;

    const ws = await prisma.workspace.findFirst({
        where: { retellFromNumber: number },
        select: { id: true }
    });
    return ws?.id || null;
}

/** Seçilen agent'ın arama numarası; tanımlı değilse workspace varsayılanı. */
export async function resolveFromNumber(workspaceId, agentId, varsayilan) {
    if (workspaceId && agentId) {
        const link = await prisma.retellAgentLink.findUnique({
            where: { workspaceId_agentId: { workspaceId, agentId } },
            select: { fromNumber: true }
        });
        if (link?.fromNumber) return link.fromNumber;
    }
    return varsayilan;
}

/** Bir workspace'in bağlı agent kimlikleri (varsayılan dahil). */
export async function getLinkedAgentIds(workspaceId) {
    const [links, ws] = await Promise.all([
        prisma.retellAgentLink.findMany({
            where: { workspaceId, isActive: true },
            select: { agentId: true }
        }),
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellAgentId: true }
        })
    ]);
    const ids = links.map(l => l.agentId);
    if (ws?.retellAgentId && !ids.includes(ws.retellAgentId)) ids.unshift(ws.retellAgentId);
    return ids;
}

export default {
    resolveWorkspaceIdByAgent,
    resolveWorkspaceIdByNumber,
    resolveFromNumber,
    getLinkedAgentIds
};
