import prisma from '../lib/prisma.js';
import { generateCaseNumber } from '../controllers/case.controller.js';

export async function autoOpenCaseIfNeeded(workspaceId, contactId, conversationId) {
  // 1. Aktif case var mı kontrol et
  const activeCase = await prisma.case.findFirst({
    where: { contactId, workspaceId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' }
  });
  
  // 2. Aktif case varsa conversation'ı ona bağla
  if (activeCase) {
    // Conversation zaten bağlı mı kontrol et
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
      title: conversationTitle || `Talep #${nextNumber}`,
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
