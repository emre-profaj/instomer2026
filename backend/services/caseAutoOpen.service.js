import prisma from '../lib/prisma.js';
import { generateCaseNumber } from '../controllers/case.controller.js';

// ── In-memory lock: aynı contact için eş zamanlı case açmayı engeller ──
const pendingLocks = new Map();

async function _autoOpenCaseIfNeeded(workspaceId, contactId, conversationId) {
  // 1. Aktif case var mı kontrol et
  const activeCase = await prisma.case.findFirst({
    where: { contactId, workspaceId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' }
  });
  
  // 2. Aktif case varsa conversation'ı ona bağla
  if (activeCase) {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (conv && !conv.caseId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { caseId: activeCase.id }
      });
    }
    return null;
  }
  
  // 3. Aktif case yoksa yeni case oluştur
  const lastCase = await prisma.case.findFirst({
    where: { contactId, workspaceId },
    orderBy: { createdAt: 'desc' }
  });
  
  const nextNumber = await generateCaseNumber(workspaceId);
  
  // Konuşma bilgilerini al (title + caseType)
  let conversationTitle = null;
  let caseTypeId = null;
  try {
      const conv = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { title: true, topicCategoryId: true }
      });
      conversationTitle = conv?.title || null;
      if (conv?.topicCategoryId) {
          const tc = await prisma.topicCategory.findUnique({
              where: { id: conv.topicCategoryId },
              select: { caseTypeId: true }
          });
          caseTypeId = tc?.caseTypeId || null;
      }
  } catch (_) {}

  const newCase = await prisma.case.create({
    data: {
      workspaceId,
      contactId,
      caseNumber: nextNumber,
      title: conversationTitle || `Konu #${nextNumber}`,
      status: 'ACTIVE',
      priority: 'NORMAL',
      conversations: { connect: { id: conversationId } },
      assignedToId: lastCase?.assignedToId || null,
      assignedTeamId: lastCase?.assignedTeamId || null,
      caseTypeId,
    }
  });
  
  console.log(`📋 [CaseAutoOpen] Yeni case açıldı: #${nextNumber} (contact: ${contactId})`);
  return newCase;
}

/**
 * Aynı contact için eş zamanlı case açmayı engelleyen wrapper.
 * İlk çağrı case oluşturur, sonraki çağrılar ilk çağrının bitmesini bekler
 * ve zaten oluşturulmuş case'e bağlanır.
 */
export async function autoOpenCaseIfNeeded(workspaceId, contactId, conversationId) {
  const lockKey = `${workspaceId}:${contactId}`;
  
  // Aynı contact için devam eden bir işlem varsa, onun bitmesini bekle
  const existing = pendingLocks.get(lockKey);
  if (existing) {
    await existing.catch(() => {}); // Önceki hata verse bile devam et
  }
  
  // Yeni promise oluştur ve lock'a kaydet
  const promise = _autoOpenCaseIfNeeded(workspaceId, contactId, conversationId)
    .finally(() => {
      // İşlem bittiğinde lock'u temizle
      if (pendingLocks.get(lockKey) === promise) {
        pendingLocks.delete(lockKey);
      }
    });
  
  pendingLocks.set(lockKey, promise);
  return promise;
}
