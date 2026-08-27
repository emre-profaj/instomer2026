import prisma from '../lib/prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { emitToWorkspace } from '../socket.js';

/**
 * Bir notu AI ile analiz eder ve aşama önerisi yapar
 * ContactActivity type==="NOTE" oluşturulduğunda çağrılır
 */
export async function analyzeNote(activityId) {
  try {
    const activity = await prisma.contactActivity.findUnique({
      where: { id: activityId },
      include: {
        contact: {
          select: { 
            id: true, name: true, status: true, funnelType: true, funnelStageId: true,
            workspaceId: true
          }
        }
      }
    });
    
    if (!activity || activity.type !== 'NOTE') return null;
    
    const workspaceId = activity.workspaceId;
    
    // AI API key
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { aiApiKey: true }
    });
    let aiApiKey = workspace?.aiApiKey;
    if (!aiApiKey) {
      const gs = await prisma.globalSettings.findUnique({ where: { id: 'singleton' } });
      aiApiKey = gs?.globalAiApiKey;
    }
    if (!aiApiKey) return null;
    
    // Mevcut aşamaları al
    const funnelId = activity.contact?.funnelType;
    let stages = [];
    if (funnelId) {
      stages = await prisma.funnelStage.findMany({
        where: { funnelId },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, order: true }
      });
    }
    
    const currentStage = stages.find(s => s.id === activity.contact?.funnelStageId);
    
    const prompt = `Sen bir CRM aşama analiz asistanısın. Aşağıdaki notu analiz et.

Not: "${activity.description || activity.title || ''}"

Mevcut aşama: ${currentStage?.name || 'Yok'}
Mevcut aşamalar: ${stages.map(s => `"${s.name}"`).join(', ') || 'Yok'}

Görev: Bu nota göre kişinin hangi aşamaya taşınması gerektiğini öner.
SADECE JSON döndür:
{
  "suggestedStageId": "stage_id_or_null",
  "suggestedStageName": "Aşama adı veya null",
  "suggestedAction": "CALL|MEETING|PROPOSAL|FOLLOW_UP|null",
  "confidence": 0.85,
  "reasoning": "Neden bu aşama önerildi"
}`;
    
    const genAI = new GoogleGenerativeAI(aiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // JSON parse
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const analysis = JSON.parse(jsonMatch[0]);
    
    // Analizi kaydet
    // ContactActivity'ye güncelle
    await prisma.contactActivity.update({
      where: { id: activityId },
      data: {
        metadata: JSON.stringify({
          aiAnalysis: analysis,
          analyzedAt: new Date().toISOString()
        })
      }
    });
    
    // Socket bildirim gönder
    emitToWorkspace(workspaceId, 'note_analyzed', {
      activityId,
      contactId: activity.contactId,
      analysis,
    });
    
    console.log(`📝 [NoteAnalyzer] Not analiz edildi: ${analysis.suggestedStageName || 'değişiklik yok'} (confidence: ${analysis.confidence})`);
    
    return analysis;
  } catch (error) {
    console.error('❌ [NoteAnalyzer] Error:', error.message);
    return null;
  }
}

/**
 * Sipariş/Deal oluşturulduğunda Case kapatma önerisi
 */
export async function suggestCaseCloseOnDeal(dealId, workspaceId) {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { contactId: true, status: true }
    });
    if (!deal?.contactId) return null;
    
    // Aktif case bul
    const activeCase = await prisma.case.findFirst({
      where: {
        contactId: deal.contactId,
        workspaceId,
        status: 'ACTIVE'
      }
    });
    if (!activeCase) return null;
    
    // Socket ile öneri gönder
    emitToWorkspace(workspaceId, 'suggest_case_close', {
      caseId: activeCase.id,
      caseNumber: activeCase.caseNumber,
      dealId,
      contactId: deal.contactId,
      message: `Sipariş oluşturuldu. Case #${activeCase.caseNumber} kapatılsın mı?`
    });
    
    console.log(`📦 [NoteAnalyzer] Case #${activeCase.caseNumber} kapatma önerisi gönderildi`);
    return { caseId: activeCase.id, dealId };
  } catch (error) {
    console.error('❌ [NoteAnalyzer] suggestCaseCloseOnDeal error:', error.message);
    return null;
  }
}
