/**
 * ═══════════════════════════════════════════════════════════════
 * LEAD PUANLAMA SERVİSİ (Madde 3)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Her kişi için 0-100 arası skor hesaplar.
 * Isı haritası: 🔵 COLD → 🟢 COOL → 🟡 WARM → 🟠 HOT → 🔴 FIRE
 * 
 * Puanlama kaynakları:
 *   - Mesaj sayısı ve sıklığı
 *   - AI sınıflandırma sonuçları
 *   - Telefon/email paylaşımı
 *   - Fiyat/bütçe konuşulması
 *   - Randevu/görüşme talebi
 *   - Aktivite (arama yapıldı, teklif gönderildi)
 *   - Deal oluşturulma
 *   - Form doldurma
 * 
 * @module leadScoringService
 */

import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';

/**
 * Skor → Sıcaklık eşleşmesi
 */
const TEMPERATURE_THRESHOLDS = [
  { max: 20, temp: 'COLD', emoji: '🔵', label: 'Soğuk' },
  { max: 40, temp: 'COOL', emoji: '🟢', label: 'Ilık' },
  { max: 60, temp: 'WARM', emoji: '🟡', label: 'Sıcak' },
  { max: 80, temp: 'HOT', emoji: '🟠', label: 'Çok Sıcak' },
  { max: 100, temp: 'FIRE', emoji: '🔴', label: 'Yanıyor' },
];

const SCORING_TEMPLATES = {
  SATIS: {
    messageCount: 1,      // her mesaj 1 puan
    phoneShared: 15,       // telefon paylaşımı
    emailShared: 10,       // email paylaşımı  
    priceDiscussed: 20,    // fiyat konuşuldu
    meetingRequested: 25,  // randevu talep
    dealCreated: 30,       // teklif/sipariş
    budgetMentioned: 15,   // bütçe bahsedildi
  },
  DESTEK: {
    messageCount: 0.5,
    urgencyHigh: 20,
    repeatContact: 15,
    complaintFiled: 25,
    escalationNeeded: 30,
  },
  BASVURU: {
    messageCount: 0.5,
    cvShared: 20,
    phoneShared: 10,
    emailShared: 15,
    experienceMatch: 25,
  },
  DEFAULT: {
    messageCount: 1,
    phoneShared: 10,
    emailShared: 5,
    priceDiscussed: 15,
    dealCreated: 25,
  }
};

/**
 * Kişinin lead skorunu hesapla
 * 
 * @param {string} contactId
 * @returns {{ score: number, temperature: string, breakdown: Object }}
 */
export async function calculateLeadScore(contactId) {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: { isFromContact: true, content: true, createdAt: true, messageType: true }
            }
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 5
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { type: true, status: true, createdAt: true, callSuccessful: true }
        },
        deals: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { status: true, amount: true, createdAt: true }
        },
        formSubmissions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { createdAt: true }
        },
      }
    });

    if (!contact) return { score: 0, temperature: 'COLD', breakdown: {} };

    const funnelType = contact.funnelType || 'DEFAULT';
    const template = SCORING_TEMPLATES[funnelType] || SCORING_TEMPLATES.DEFAULT;

    let score = 0;
    const breakdown = {};

    // ── 1. Temel bilgi puanları ──────────────────────────────
    if (contact.phone) { 
        const p = template.phoneShared || 10;
        score += p; breakdown.phone = p; 
    }
    if (contact.email) { 
        const p = template.emailShared || 5;
        score += p; breakdown.email = p; 
    }
    if (contact.name && contact.name !== 'Web Ziyaretçisi') { score += 3; breakdown.name = 3; }
    if (contact.company) { score += 5; breakdown.company = 5; }

    // ── 2. Mesaj puanları ────────────────────────────────────
    const allMessages = contact.conversations.flatMap(c => c.messages);
    const customerMessages = allMessages.filter(m => m.isFromContact);
    
    // Mesaj sayısı (max 15 puan)
    const msgMultiplier = template.messageCount !== undefined ? template.messageCount : 2;
    const msgScore = Math.min(customerMessages.length * msgMultiplier, 15);
    score += msgScore;
    breakdown.messageCount = msgScore;

    // Son mesaj ne zaman (recency)
    if (customerMessages.length > 0) {
      const lastMsg = customerMessages[0];
      const daysSince = (Date.now() - new Date(lastMsg.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 1) { score += 10; breakdown.recency = 10; }
      else if (daysSince < 3) { score += 7; breakdown.recency = 7; }
      else if (daysSince < 7) { score += 4; breakdown.recency = 4; }
      else { breakdown.recency = 0; }
    }

    // ── 3. İçerik puanları (anahtar kelimeler) ──────────────
    const allContent = customerMessages.map(m => m.content || '').join(' ').toLowerCase();
    
    // Fiyat/bütçe konuşuldu
    const priceKeywords = ['fiyat', 'ücret', 'maliyet', 'bütçe', 'ne kadar', 'kaç lira', 'kaç tl', 'fiyatı'];
    if (priceKeywords.some(kw => allContent.includes(kw))) {
      const p = template.priceDiscussed || template.budgetMentioned || 10;
      score += p;
      breakdown.priceDiscussion = p;
    }

    // Satın alma niyeti
    const purchaseKeywords = ['almak istiyorum', 'satın al', 'sipariş', 'hemen', 'başlayalım', 'anlaştık', 'olur'];
    if (purchaseKeywords.some(kw => allContent.includes(kw))) {
      score += 15;
      breakdown.purchaseIntent = 15;
    }

    // Aranma talebi
    const callKeywords = ['beni arayın', 'arar mısınız', 'bana ulaşın', 'numaramı'];
    if (callKeywords.some(kw => allContent.includes(kw))) {
      const p = template.meetingRequested || 8;
      score += p;
      breakdown.callRequest = p;
    }

    // ── 4. Aktivite puanları ─────────────────────────────────
    const completedCalls = contact.activities.filter(a => a.type === 'CALL' && a.callSuccessful === true);
    if (completedCalls.length > 0) {
      const callScore = Math.min(completedCalls.length * 5, 15);
      score += callScore;
      breakdown.successfulCalls = callScore;
    }

    // Başarısız / açılmayan aramalar → ilk 2 normal, 3.'den sonra puan düşür
    const failedCalls = contact.activities.filter(a => a.type === 'CALL' && a.callSuccessful === false);
    if (failedCalls.length > 2) {
      const failPenalty = Math.min((failedCalls.length - 2) * 5, 20);
      score -= failPenalty;
      breakdown.failedCalls = -failPenalty;
    }

    // Ziyaret yapıldı → güçlü niyet sinyali
    const visits = contact.activities.filter(a => a.type === 'VISIT' && a.status === 'COMPLETED');
    if (visits.length > 0) {
      const visitScore = Math.min(visits.length * 15, 25);
      score += visitScore;
      breakdown.completedVisits = visitScore;
    }

    // Toplantı yapıldı
    const meetings = contact.activities.filter(a => a.type === 'MEETING' && a.status === 'COMPLETED');
    if (meetings.length > 0) {
      const meetingScore = Math.min(meetings.length * 12, 20);
      score += meetingScore;
      breakdown.completedMeetings = meetingScore;
    }

    // Tamamlanmış görevler (takip yapıldığını gösterir)
    const completedTasks = contact.activities.filter(a => a.type === 'TASK' && a.status === 'COMPLETED');
    if (completedTasks.length > 0) {
      const taskScore = Math.min(completedTasks.length * 3, 9);
      score += taskScore;
      breakdown.completedTasks = taskScore;
    }

    const proposals = contact.activities.filter(a => a.type === 'PROPOSAL');
    if (proposals.length > 0) {
      score += 10;
      breakdown.proposalSent = 10;
    }

    // ── 5. Deal puanları ─────────────────────────────────────
    if (contact.deals.length > 0) {
      const p = template.dealCreated || 10;
      score += p;
      breakdown.hasDeal = p;
      
      const wonDeals = contact.deals.filter(d => d.status === 'WON');
      if (wonDeals.length > 0) {
        score += 15;
        breakdown.wonDeal = 15;
      }
    }

    // ── 6. Form puanları ─────────────────────────────────────
    if (contact.formSubmissions.length > 0) {
      score += 8;
      breakdown.formSubmission = 8;
    }

    // ── 7. Kaynak puanları ───────────────────────────────────
    if (contact.source === 'FORM') { score += 5; breakdown.formSource = 5; }
    if (contact.source === 'FACEBOOK' || contact.source === 'INSTAGRAM') { score += 3; breakdown.socialSource = 3; }

    // ── 8. Çoklu kanal bonus ─────────────────────────────────
    const channels = new Set(contact.conversations.map(c => c.channel));
    if (channels.size > 1) {
      score += 5;
      breakdown.multiChannel = 5;
    }

    // ── 9. Aşama ilerleme puanı ──────────────────────────────
    if (contact.funnelStageId && contact.funnelType) {
      const stage = await prisma.funnelStage.findUnique({ 
        where: { id: contact.funnelStageId }, 
        select: { order: true } 
      });
      const totalStages = await prisma.funnelStage.count({ 
        where: { funnelId: contact.funnelType } 
      });
      
      if (stage && totalStages > 0) {
        const stageScore = Math.min(Math.round((stage.order / totalStages) * 15), 15);
        score += stageScore;
        breakdown.stageProgress = stageScore;
      }
    }

    // ── 10. Ürün ilgi puanı ───────────────────────────────────
    const productCase = await prisma.case.findFirst({ 
      where: { contactId, status: 'ACTIVE', NOT: { products: '[]' } }, 
      select: { products: true } 
    });
    
    if (productCase && productCase.products) {
      let hasProducts = false;
      try {
        const productsArr = typeof productCase.products === 'string' ? JSON.parse(productCase.products) : productCase.products;
        if (Array.isArray(productsArr) && productsArr.length > 0) {
          hasProducts = true;
        }
      } catch (e) {}
      
      if (hasProducts) {
        score += 8;
        breakdown.productInterest = 8;
      }
    }

    // ── 11. Kategori eşleşme puanı ────────────────────────────
    const categoryCase = await prisma.case.findFirst({ 
      where: { contactId, status: 'ACTIVE', categoryId: { not: null } }, 
      select: { categoryId: true } 
    });
    
    if (categoryCase && categoryCase.categoryId) {
      score += 5;
      breakdown.categoryAssigned = 5;
    }

    // Skor sınırla
    score = Math.min(score, 100);
    score = Math.max(score, 0);

    // Sıcaklık belirle
    const temperature = getTemperature(score);

    return { score, temperature, breakdown };

  } catch (error) {
    console.error('❌ [LeadScoring] Calculate error:', error.message);
    return { score: 0, temperature: 'COLD', breakdown: {} };
  }
}

/**
 * Case'in skorunu hesapla
 */
export async function calculateCaseScore(caseId) {
  try {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        contact: {
          select: { phone: true, email: true, name: true, company: true, source: true }
        },
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: { isFromContact: true, content: true, createdAt: true, messageType: true }
            },
            deals: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: { status: true, amount: true, createdAt: true }
            }
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 5
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { type: true, status: true, createdAt: true, callSuccessful: true }
        }
      }
    });

    if (!caseData) return { score: 0, temperature: 'COLD', breakdown: {} };

    const contact = caseData.contact;
    const funnelType = caseData.funnelType || 'DEFAULT';
    const template = SCORING_TEMPLATES[funnelType] || SCORING_TEMPLATES.DEFAULT;

    let score = 0;
    const breakdown = {};

    // ── 1. Temel bilgi puanları ──────────────────────────────
    if (contact.phone) { 
        const p = template.phoneShared || 10;
        score += p; breakdown.phone = p; 
    }
    if (contact.email) { 
        const p = template.emailShared || 5;
        score += p; breakdown.email = p; 
    }
    if (contact.name && contact.name !== 'Web Ziyaretçisi') { score += 3; breakdown.name = 3; }
    if (contact.company) { score += 5; breakdown.company = 5; }

    // ── 2. Mesaj puanları ────────────────────────────────────
    const allMessages = caseData.conversations.flatMap(c => c.messages);
    const customerMessages = allMessages.filter(m => m.isFromContact);
    
    // Mesaj sayısı
    const msgMultiplier = template.messageCount !== undefined ? template.messageCount : 2;
    const msgScore = Math.min(customerMessages.length * msgMultiplier, 15);
    score += msgScore;
    breakdown.messageCount = msgScore;

    // Son mesaj ne zaman
    if (customerMessages.length > 0) {
      const lastMsg = customerMessages[0];
      const daysSince = (Date.now() - new Date(lastMsg.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 1) { score += 10; breakdown.recency = 10; }
      else if (daysSince < 3) { score += 7; breakdown.recency = 7; }
      else if (daysSince < 7) { score += 4; breakdown.recency = 4; }
      else { breakdown.recency = 0; }
    }

    // ── 3. İçerik puanları ───────────────────────────────────
    const allContent = customerMessages.map(m => m.content || '').join(' ').toLowerCase();
    
    const priceKeywords = ['fiyat', 'ücret', 'maliyet', 'bütçe', 'ne kadar', 'kaç lira', 'kaç tl', 'fiyatı'];
    if (priceKeywords.some(kw => allContent.includes(kw))) {
      const p = template.priceDiscussed || template.budgetMentioned || 10;
      score += p;
      breakdown.priceDiscussion = p;
    }

    const purchaseKeywords = ['almak istiyorum', 'satın al', 'sipariş', 'hemen', 'başlayalım', 'anlaştık', 'olur'];
    if (purchaseKeywords.some(kw => allContent.includes(kw))) {
      score += 15;
      breakdown.purchaseIntent = 15;
    }

    const callKeywords = ['beni arayın', 'arar mısınız', 'bana ulaşın', 'numaramı'];
    if (callKeywords.some(kw => allContent.includes(kw))) {
      const p = template.meetingRequested || 8;
      score += p;
      breakdown.callRequest = p;
    }

    // ── 4. Aktivite puanları ─────────────────────────────────
    const completedCalls = caseData.activities.filter(a => a.type === 'CALL' && a.callSuccessful === true);
    if (completedCalls.length > 0) {
      const callScore = Math.min(completedCalls.length * 5, 15);
      score += callScore;
      breakdown.successfulCalls = callScore;
    }

    // Başarısız / açılmayan aramalar → ilk 2 normal, 3.'den sonra puan düşür
    const failedCalls = caseData.activities.filter(a => a.type === 'CALL' && a.callSuccessful === false);
    if (failedCalls.length > 2) {
      const failPenalty = Math.min((failedCalls.length - 2) * 5, 20);
      score -= failPenalty;
      breakdown.failedCalls = -failPenalty;
    }

    // Ziyaret yapıldı
    const visits = caseData.activities.filter(a => a.type === 'VISIT' && a.status === 'COMPLETED');
    if (visits.length > 0) {
      const visitScore = Math.min(visits.length * 15, 25);
      score += visitScore;
      breakdown.completedVisits = visitScore;
    }

    // Toplantı yapıldı
    const meetings = caseData.activities.filter(a => a.type === 'MEETING' && a.status === 'COMPLETED');
    if (meetings.length > 0) {
      const meetingScore = Math.min(meetings.length * 12, 20);
      score += meetingScore;
      breakdown.completedMeetings = meetingScore;
    }

    // Tamamlanmış görevler
    const completedTasks = caseData.activities.filter(a => a.type === 'TASK' && a.status === 'COMPLETED');
    if (completedTasks.length > 0) {
      const taskScore = Math.min(completedTasks.length * 3, 9);
      score += taskScore;
      breakdown.completedTasks = taskScore;
    }

    const proposals = caseData.activities.filter(a => a.type === 'PROPOSAL');
    if (proposals.length > 0) {
      score += 10;
      breakdown.proposalSent = 10;
    }

    // ── 5. Deal puanları ─────────────────────────────────────
    const allDeals = caseData.conversations.flatMap(c => c.deals);
    if (allDeals.length > 0) {
      const p = template.dealCreated || 10;
      score += p;
      breakdown.hasDeal = p;
      
      const wonDeals = allDeals.filter(d => d.status === 'WON');
      if (wonDeals.length > 0) {
        score += 15;
        breakdown.wonDeal = 15;
      }
    }

    // ── 6. Kaynak puanları ───────────────────────────────────
    if (contact.source === 'FORM') { score += 5; breakdown.formSource = 5; }
    if (contact.source === 'FACEBOOK' || contact.source === 'INSTAGRAM') { score += 3; breakdown.socialSource = 3; }

    // ── 7. Çoklu kanal bonus ─────────────────────────────────
    const channels = new Set(caseData.conversations.map(c => c.channel));
    if (channels.size > 1) {
      score += 5;
      breakdown.multiChannel = 5;
    }

    score = Math.min(score, 100);
    score = Math.max(score, 0);

    const temperature = getTemperature(score);

    return { score, temperature, breakdown };
  } catch (error) {
    console.error('❌ [CaseScoring] Calculate error:', error.message);
    return { score: 0, temperature: 'COLD', breakdown: {} };
  }
}

/**
 * Skoru veritabanına kaydet
 */
export async function updateLeadScore(contactId) {
  try {
    const { score, temperature, breakdown } = await calculateLeadScore(contactId);

    await prisma.contact.update({
      where: { id: contactId },
      data: {
        leadScore: score,
        leadTemperature: temperature,
      }
    });

    // Aktif case'lerin skorlarını da güncelle (yeni)
    const activeCases = await prisma.case.findMany({
        where: { contactId, status: 'ACTIVE' },
        select: { id: true }
    });
    for (const c of activeCases) {
        await updateCaseScore(c.id);
    }

    // Socket bildirim
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { workspaceId: true }
    });
    if (contact?.workspaceId) {
      emitToWorkspace(contact.workspaceId, 'contact_score_updated', {
        contactId,
        score,
        temperature,
      });
    }

    return { score, temperature, breakdown };

  } catch (error) {
    // leadScore/leadTemperature alanları henüz yoksa hata vermesin
    if (error.code === 'P2002' || error.code === 'P2009' || error.message?.includes('Unknown field')) {
      console.log('ℹ️ [LeadScoring] leadScore/leadTemperature alanları henüz şemada yok, migration gerekli');
      return null;
    }
    console.error('❌ [LeadScoring] Update error:', error.message);
    return null;
  }
}

/**
 * Case skorunu güncelle
 */
export async function updateCaseScore(caseId) {
    const { score, temperature, breakdown } = await calculateCaseScore(caseId);
    await prisma.case.update({
        where: { id: caseId },
        data: { leadScore: score, leadTemperature: temperature }
    });
    // Socket bildirim
    const caseData = await prisma.case.findUnique({ where: { id: caseId }, select: { workspaceId: true, contactId: true } });
    if (caseData?.workspaceId) {
        emitToWorkspace(caseData.workspaceId, 'case_score_updated', { caseId, contactId: caseData.contactId, score, temperature });
    }
    return { score, temperature, breakdown };
}

/**
 * Workspace'teki tüm kişilerin skorlarını toplu güncelle
 */
export async function recalculateAllScores(workspaceId) {
  try {
    const contacts = await prisma.contact.findMany({
      where: { workspaceId, isDeleted: false },
      select: { id: true }
    });

    let updated = 0;
    for (const contact of contacts) {
      const result = await updateLeadScore(contact.id);
      if (result) updated++;
    }

    console.log(`📊 [LeadScoring] Recalculated ${updated}/${contacts.length} contacts for workspace ${workspaceId}`);
    return { total: contacts.length, updated };

  } catch (error) {
    console.error('❌ [LeadScoring] Recalculate all error:', error.message);
    return null;
  }
}

/**
 * Skor → sıcaklık çevirici
 */
function getTemperature(score) {
  for (const t of TEMPERATURE_THRESHOLDS) {
    if (score <= t.max) return t.temp;
  }
  return 'FIRE';
}

/**
 * Sıcaklık bilgisini getir (emoji, label dahil)
 */
export function getTemperatureInfo(score) {
  for (const t of TEMPERATURE_THRESHOLDS) {
    if (score <= t.max) return t;
  }
  return TEMPERATURE_THRESHOLDS[TEMPERATURE_THRESHOLDS.length - 1];
}
