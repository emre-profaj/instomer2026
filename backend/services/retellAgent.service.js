/**
 * ═══════════════════════════════════════════════════════════════
 * RETELL AGENT'LARI VE NUMARALARI — TEK OKUMA NOKTASI
 * ═══════════════════════════════════════════════════════════════
 *
 * İki ayrı ve BİRBİRİNDEN BAĞIMSIZ kavram:
 *
 *   Numara (retell_phone_numbers) → KANAL. O numaraya gelen ve o
 *     numaradan çıkan aramalar birlikte durur; WhatsApp numaralarıyla
 *     aynı mantık (conversations.retellPhoneNumberId).
 *
 *   Agent (retell_agent_links) → KONUŞMA METNİ. Hangi senaryoyla
 *     konuşulacağını belirler. Numarayla bağı yoktur.
 *
 * Giden aramada ikisi ayrı ayrı seçilir; seçilmezse workspace
 * varsayılanları kullanılır.
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
    const kanal = await prisma.retellPhoneNumber.findFirst({
        where: { number, isActive: true },
        select: { workspaceId: true }
    });
    if (kanal) return kanal.workspaceId;

    // Kanal olarak kaydedilmemişse eski alana düş.
    const ws = await prisma.workspace.findFirst({
        where: { retellFromNumber: number },
        select: { id: true }
    });
    return ws?.id || null;
}

/**
 * Giden aramanın çıkacağı numara.
 *
 * Numara agent'a BAĞLI DEĞİLDİR — ayrı bir kanaldır. Sıra:
 *   1) çağrıda açıkça verilen numara
 *   2) workspace varsayılanı
 * İstenen numara bu workspace'e kayıtlı değilse yok sayılır; yabancı bir
 * numaradan arama Retell tarafında zaten reddedilir, sessizce denemeyiz.
 */
export async function resolveFromNumber(workspaceId, istenenNumara, varsayilan) {
    const istenen = (istenenNumara || '').trim();
    if (!istenen) return varsayilan;

    const kayitli = await prisma.retellPhoneNumber.findFirst({
        where: { workspaceId, number: istenen, isActive: true },
        select: { number: true }
    });
    if (kayitli) return kayitli.number;

    // Henüz kanal olarak kaydedilmemiş ama workspace varsayılanıysa kabul et.
    if (istenen === (varsayilan || '').trim()) return istenen;

    console.warn(`⚠️ [Retell] ${istenen} bu workspace'e kayıtlı değil, varsayılan kullanılıyor`);
    return varsayilan;
}

/** Bir workspace'in kayıtlı arama numaraları (kanallar). */
export async function getPhoneNumbers(workspaceId) {
    return prisma.retellPhoneNumber.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, number: true, label: true, isActive: true }
    });
}

/** Numaradan kanal kaydını bulur (konuşmayı ona bağlamak için). */
export async function findPhoneNumberRecord(workspaceId, number) {
    if (!number) return null;
    return prisma.retellPhoneNumber.findFirst({
        where: { workspaceId, number },
        select: { id: true, number: true, label: true }
    });
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
    getLinkedAgentIds,
    getPhoneNumbers,
    findPhoneNumberRecord
};
