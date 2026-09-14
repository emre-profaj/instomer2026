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
 * Temsilci / Dahili Notları için Niyet ve Duygu Sözlüğü
 */
export const POSITIVE_NOTE_KEYWORDS = [
  // Genel olumlu / ilişki
  'çok iyi', 'olumlu', 'ilgili', 'ilgileniyor', 'sıcak', 'çok sıcak', 'istekli',
  'güzel geçti', 'görüşme iyi geçti', 'beğendi', 'ikna oldu', 'memnun', 'teşekkür etti',
  // Aksiyon / takip
  'yarın ara', 'tekrar ara', 'hemen ara', 'randevu', 'randevu istedi', 'randevuya gelecek',
  'geliyor', 'gelecek', 'ziyaret edecek', 'bekliyor', 'haber bekliyor',
  // Ticari / Satın alma niyeti
  'satın alacak', 'alacak', 'anlaştık', 'anlaşma sağlandı', 'anlaşma', 'fiyat onayladı',
  'onayladı', 'teklif istedi', 'teklif verildi', 'teklif gönderildi', 'bütçesi var', 'bütçe uygun',
  'kabul etti', 'ödeyecek', 'kapora', 'kayıt oldu', 'satış', 'satıldı', 'kesin', 'potansiyel',
  'fırsat', 'sıcak fırsat', 'vip', 'müşterimiz', 'hastamız', 'işlem yapılacak', 'tedavi olacak'
];

export const NEGATIVE_NOTE_KEYWORDS = [
  // İlgisiz / Vazgeçti
  'olumsuz', 'ilgilenmiyor', 'ilgisiz', 'istemiyor', 'istemedi', 'vazgeçti', 'vazgecti',
  'vazgeçmiş', 'vazgecmis', 'almayacak', 'almayacakmış', 'iptal', 'iptal etti',
  // Finansal / Rakip
  'pahalı buldu', 'pahalı geldi', 'bütçe yetersiz', 'bütçesi yok', 'bütçesi yetersiz',
  'para yok', 'başka yerden almış', 'başkasından almış', 'rakibe gitti', 'başkasıyla anlaştı',
  // Ulaşılamayan / Geçersiz
  'ulaşılamadı', 'ulaşamadım', 'ulaşılmıyor', 'cevap vermiyor', 'açmıyor', 'aramayın',
  'aramayın dedi', 'yanlış numara', 'hatalı numara', 'engelledi', 'engellemiş', 'şikayet',
  'soğuk', 'kapattı', 'surata kapattı', 'sahte', 'spam', 'küfür'
];

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
        funnelStage: {
          select: { id: true, name: true, order: true, isClosing: true, statusType: true }
        },
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: { isFromContact: true, content: true, createdAt: true, messageType: true }
            },
            internalNotes: {
              orderBy: { createdAt: 'desc' },
              take: 30,
              select: { content: true, createdAt: true }
            }
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 5
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            type: true,
            status: true,
            createdAt: true,
            completedAt: true,
            callSuccessful: true,
            callSentiment: true,
            title: true,
            description: true,
            result: true
          }
        },
        cases: {
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            priority: true,
            wonAt: true,
            lostAt: true,
            lostReason: true,
            funnelStageId: true,
            products: true,
            categoryId: true
          }
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
    const allMessages = (contact.conversations || []).flatMap(c => c.messages || []);
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

    // ── 3. İçerik puanları (müşteri mesajları anahtar kelimeler) ───────────
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
    const completedCalls = (contact.activities || []).filter(a => a.type === 'CALL' && a.callSuccessful === true);
    if (completedCalls.length > 0) {
      const callScore = Math.min(completedCalls.length * 5, 15);
      score += callScore;
      breakdown.successfulCalls = callScore;
    }

    // Başarısız / açılmayan aramalar → ilk 2 normal, 3.'den sonra puan düşür
    const failedCalls = (contact.activities || []).filter(a => a.type === 'CALL' && a.callSuccessful === false);
    if (failedCalls.length > 2) {
      const failPenalty = Math.min((failedCalls.length - 2) * 5, 20);
      score -= failPenalty;
      breakdown.failedCalls = -failPenalty;
    }

    // Ziyaret yapıldı → güçlü niyet sinyali
    const visits = (contact.activities || []).filter(a => a.type === 'VISIT' && a.status === 'COMPLETED');
    if (visits.length > 0) {
      const visitScore = Math.min(visits.length * 15, 25);
      score += visitScore;
      breakdown.completedVisits = visitScore;
    }

    // Toplantı yapıldı
    const meetings = (contact.activities || []).filter(a => a.type === 'MEETING' && a.status === 'COMPLETED');
    if (meetings.length > 0) {
      const meetingScore = Math.min(meetings.length * 12, 20);
      score += meetingScore;
      breakdown.completedMeetings = meetingScore;
    }

    // Tamamlanmış görevler (takip yapıldığını gösterir)
    const completedTasks = (contact.activities || []).filter(a => a.type === 'TASK' && a.status === 'COMPLETED');
    if (completedTasks.length > 0) {
      const taskScore = Math.min(completedTasks.length * 3, 9);
      score += taskScore;
      breakdown.completedTasks = taskScore;
    }

    const proposals = (contact.activities || []).filter(a => a.type === 'PROPOSAL');
    if (proposals.length > 0) {
      score += 10;
      breakdown.proposalSent = 10;
    }

    // ── 5. Deal puanları ─────────────────────────────────────
    if (contact.deals && contact.deals.length > 0) {
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
    if (contact.formSubmissions && contact.formSubmissions.length > 0) {
      score += 8;
      breakdown.formSubmission = 8;
    }

    // ── 7. Kaynak puanları ───────────────────────────────────
    if (contact.source === 'FORM') { score += 5; breakdown.formSource = 5; }
    if (contact.source === 'FACEBOOK' || contact.source === 'INSTAGRAM') { score += 3; breakdown.socialSource = 3; }

    // ── 8. Çoklu kanal bonus ─────────────────────────────────
    const channels = new Set((contact.conversations || []).map(c => c.channel));
    if (channels.size > 1) {
      score += 5;
      breakdown.multiChannel = 5;
    }

    // ── 9. Aşama ilerleme puanı ──────────────────────────────
    if (contact.funnelStageId && contact.funnelType) {
      const stage = contact.funnelStage || await prisma.funnelStage.findUnique({ 
        where: { id: contact.funnelStageId }, 
        select: { order: true, isClosing: true, statusType: true, name: true } 
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
    const productCase = (contact.cases || []).find(c => c.status === 'ACTIVE' && c.products && c.products !== '[]');
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
    const categoryCase = (contact.cases || []).find(c => c.status === 'ACTIVE' && c.categoryId);
    if (categoryCase && categoryCase.categoryId) {
      score += 5;
      breakdown.categoryAssigned = 5;
    }

    // ═══════════════════════════════════════════════════════════
    // ── 12. DAHİLİ / TEMSİLCİ NOTLARI PUANLAMASI ──────────────
    // ═══════════════════════════════════════════════════════════
    const internalNotes = (contact.conversations || []).flatMap(c => c.internalNotes || []);
    const noteActivities = (contact.activities || []).filter(a => a.type === 'NOTE');
    const totalNotesCount = internalNotes.length + noteActivities.length + (contact.notes ? 1 : 0);

    if (totalNotesCount > 0) {
      // Not varlığı ve adedi: her not +5 puan (max 15)
      const countScore = Math.min(totalNotesCount * 5, 15);
      score += countScore;
      breakdown.agentNotesCount = countScore;

      // Son 3 gün içinde not girildiyse güncellik bonusu
      const latestNoteDate = Math.max(
        ...internalNotes.map(n => new Date(n.createdAt).getTime()),
        ...noteActivities.map(a => new Date(a.createdAt).getTime()),
        0
      );
      if (latestNoteDate > 0) {
        const daysSinceNote = (Date.now() - latestNoteDate) / (1000 * 60 * 60 * 24);
        if (daysSinceNote <= 3) {
          score += 5;
          breakdown.recentNoteBonus = 5;
        }
      }
    }

    // Notların içeriğindeki duygu ve niyet sinyallerini analiz et
    const allNoteTexts = [
      ...internalNotes.map(n => n.content || ''),
      contact.notes || '',
      ...noteActivities.map(a => `${a.title || ''} ${a.description || ''} ${a.result || ''}`),
      ...(contact.activities || []).filter(a => a.result).map(a => a.result || '')
    ].filter(t => typeof t === 'string' && t.trim().length > 0);

    const notesTextLower = allNoteTexts.join(' ').toLowerCase();

    if (notesTextLower) {
      const positiveMatches = POSITIVE_NOTE_KEYWORDS.filter(kw => notesTextLower.includes(kw));
      if (positiveMatches.length > 0) {
        const posScore = positiveMatches.length >= 3 ? 35 : (positiveMatches.length === 2 ? 25 : 15);
        score += posScore;
        breakdown.positiveNoteIntent = { score: posScore, matches: positiveMatches.slice(0, 5) };
      }

      const negativeMatches = NEGATIVE_NOTE_KEYWORDS.filter(kw => notesTextLower.includes(kw));
      if (negativeMatches.length > 0) {
        const negPenalty = negativeMatches.length >= 2 ? 35 : 20;
        score -= negPenalty;
        breakdown.negativeNoteIntent = { penalty: -negPenalty, matches: negativeMatches.slice(0, 5) };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ── 13. SON DURUM (STATUS & STAGE & CALL OUTCOME) ─────────
    // ═══════════════════════════════════════════════════════════
    const primaryCase = (contact.cases || []).find(c => c.status === 'ACTIVE') || (contact.cases || [])[0] || null;

    // A. Vaka Durumu (Case Status)
    const anyWonCase = (contact.cases || []).some(c => c.status === 'WON');
    const anyLostCase = (contact.cases || []).some(c => c.status === 'LOST');

    if (anyWonCase || primaryCase?.status === 'WON') {
      score += 35;
      breakdown.caseStatus = 'WON (+35)';
    } else if (anyLostCase || primaryCase?.status === 'LOST') {
      score -= 45;
      breakdown.caseStatus = 'LOST (-45)';
    } else if (primaryCase?.status === 'ACTIVE') {
      if (primaryCase.priority === 'URGENT') {
        score += 10;
        breakdown.casePriority = 10;
      } else if (primaryCase.priority === 'HIGH') {
        score += 5;
        breakdown.casePriority = 5;
      }
    }

    // B. Aşama Durumu (Funnel Stage Status)
    let currentStage = contact.funnelStage || null;
    if (!currentStage && primaryCase?.funnelStageId) {
      currentStage = await prisma.funnelStage.findUnique({
        where: { id: primaryCase.funnelStageId },
        select: { id: true, name: true, order: true, isClosing: true, statusType: true }
      });
    }

    if (currentStage) {
      if (currentStage.statusType === 'WON') {
        score += 30;
        breakdown.stageStatusType = 'WON (+30)';
      } else if (currentStage.statusType === 'LOST') {
        score -= 45;
        breakdown.stageStatusType = 'LOST (-45)';
      } else {
        const stageNameLower = (currentStage.name || '').toLowerCase();
        if (/kazanıldı|satış|başarılı|anlaşıldı|sözleşme/i.test(stageNameLower)) {
          score += 25;
          breakdown.stagePositive = 25;
        } else if (/kayıp|kaybedildi|olumsuz|vazgeçti|ulaşılamadı|ilgisiz/i.test(stageNameLower)) {
          score -= 35;
          breakdown.stageNegative = -35;
        }
      }
    }

    // C. Kişi Kategorisi & Durumu (Contact Category & Status)
    if (contact.category === 'VIP') {
      score += 20;
      breakdown.categoryVIP = 20;
    } else if (contact.category === 'CUSTOMER') {
      score += 20;
      breakdown.categoryCustomer = 20;
    } else if (contact.category === 'OPPORTUNITY') {
      score += 10;
      breakdown.categoryOpportunity = 10;
    }

    if (contact.status === 'QUALIFIED') {
      score += 15;
      breakdown.contactQualified = 15;
    } else if (contact.status === 'UNQUALIFIED') {
      score -= 25;
      breakdown.contactUnqualified = -25;
    } else if (contact.status === 'WON') {
      score += 30;
      breakdown.contactWon = 30;
    } else if (contact.status === 'LOST') {
      score -= 40;
      breakdown.contactLost = -40;
    }

    // D. Son Arama Sonucu & Görüşme Havası (Latest Call Outcome & Sentiment)
    const sortedCalls = (contact.activities || [])
      .filter(a => a.type === 'CALL' && a.status === 'COMPLETED')
      .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());

    if (sortedCalls.length > 0) {
      const lastCall = sortedCalls[0];
      if (lastCall.callSuccessful === true) {
        score += 10;
        breakdown.lastCallSuccess = 10;
      } else if (lastCall.callSuccessful === false) {
        score -= 10;
        breakdown.lastCallFailed = -10;
      }

      if (lastCall.callSentiment === 'Positive') {
        score += 15;
        breakdown.lastCallSentiment = 15;
      } else if (lastCall.callSentiment === 'Negative') {
        score -= 20;
        breakdown.lastCallSentiment = -20;
      }

      // Ardışık başarısız aramalar (son 2 arama ulaşılamadı ise)
      if (sortedCalls.length >= 2 && sortedCalls[0].callSuccessful === false && sortedCalls[1].callSuccessful === false) {
        score -= 15;
        breakdown.consecutiveFailedCalls = -15;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ── KESİN TAVAN / TABAN VE SINIRLAR (STRICT CAPS & FLOORS) 
    // ═══════════════════════════════════════════════════════════
    const isBlacklisted = contact.category === 'BLACKLIST' || contact.category === 'SPAM';
    const isWon = anyWonCase || primaryCase?.status === 'WON' || currentStage?.statusType === 'WON' || contact.status === 'WON';
    const isLost = anyLostCase || primaryCase?.status === 'LOST' || currentStage?.statusType === 'LOST' || contact.status === 'LOST';

    if (isBlacklisted) {
      score = 0;
      breakdown.blacklistCap = 'Skor 0 olarak sınırlandı (Blacklist/Spam)';
    } else if (isLost && !isWon) {
      score = Math.min(score, 15);
      score = Math.max(score, 0);
      breakdown.lostCap = 'Kayıp durum: Skor maks 15';
    } else if (isWon) {
      score = Math.max(score, 90);
      score = Math.min(score, 100);
      breakdown.wonFloor = 'Kazanıldı durum: Skor min 90';
    } else {
      score = Math.min(score, 100);
      score = Math.max(score, 0);
    }

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
          select: {
            id: true,
            phone: true,
            email: true,
            name: true,
            company: true,
            source: true,
            category: true,
            status: true,
            notes: true,
            funnelStageId: true,
            funnelType: true
          }
        },
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: { isFromContact: true, content: true, createdAt: true, messageType: true }
            },
            internalNotes: {
              orderBy: { createdAt: 'desc' },
              take: 30,
              select: { content: true, createdAt: true }
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
          take: 30,
          select: {
            id: true,
            type: true,
            status: true,
            createdAt: true,
            completedAt: true,
            callSuccessful: true,
            callSentiment: true,
            title: true,
            description: true,
            result: true
          }
        }
      }
    });

    if (!caseData) return { score: 0, temperature: 'COLD', breakdown: {} };

    const contact = caseData.contact || {};
    const funnelType = caseData.funnelType || contact.funnelType || 'DEFAULT';
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
    const allMessages = (caseData.conversations || []).flatMap(c => c.messages || []);
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
    const completedCalls = (caseData.activities || []).filter(a => a.type === 'CALL' && a.callSuccessful === true);
    if (completedCalls.length > 0) {
      const callScore = Math.min(completedCalls.length * 5, 15);
      score += callScore;
      breakdown.successfulCalls = callScore;
    }

    // Başarısız / açılmayan aramalar
    const failedCalls = (caseData.activities || []).filter(a => a.type === 'CALL' && a.callSuccessful === false);
    if (failedCalls.length > 2) {
      const failPenalty = Math.min((failedCalls.length - 2) * 5, 20);
      score -= failPenalty;
      breakdown.failedCalls = -failPenalty;
    }

    // Ziyaret yapıldı
    const visits = (caseData.activities || []).filter(a => a.type === 'VISIT' && a.status === 'COMPLETED');
    if (visits.length > 0) {
      const visitScore = Math.min(visits.length * 15, 25);
      score += visitScore;
      breakdown.completedVisits = visitScore;
    }

    // Toplantı yapıldı
    const meetings = (caseData.activities || []).filter(a => a.type === 'MEETING' && a.status === 'COMPLETED');
    if (meetings.length > 0) {
      const meetingScore = Math.min(meetings.length * 12, 20);
      score += meetingScore;
      breakdown.completedMeetings = meetingScore;
    }

    // Tamamlanmış görevler
    const completedTasks = (caseData.activities || []).filter(a => a.type === 'TASK' && a.status === 'COMPLETED');
    if (completedTasks.length > 0) {
      const taskScore = Math.min(completedTasks.length * 3, 9);
      score += taskScore;
      breakdown.completedTasks = taskScore;
    }

    const proposals = (caseData.activities || []).filter(a => a.type === 'PROPOSAL');
    if (proposals.length > 0) {
      score += 10;
      breakdown.proposalSent = 10;
    }

    // ── 5. Deal puanları ─────────────────────────────────────
    const allDeals = (caseData.conversations || []).flatMap(c => c.deals || []);
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
    const channels = new Set((caseData.conversations || []).map(c => c.channel));
    if (channels.size > 1) {
      score += 5;
      breakdown.multiChannel = 5;
    }

    // ── 8. Ürün ilgi puanı ───────────────────────────────────
    if (caseData.products && caseData.products !== '[]') {
      let hasProducts = false;
      try {
        const pArr = typeof caseData.products === 'string' ? JSON.parse(caseData.products) : caseData.products;
        if (Array.isArray(pArr) && pArr.length > 0) hasProducts = true;
      } catch (e) {}
      if (hasProducts) {
        score += 8;
        breakdown.productInterest = 8;
      }
    }

    // ── 9. Kategori eşleşme puanı ────────────────────────────
    if (caseData.categoryId) {
      score += 5;
      breakdown.categoryAssigned = 5;
    }

    // ═══════════════════════════════════════════════════════════
    // ── 10. DAHİLİ / TEMSİLCİ NOTLARI PUANLAMASI ──────────────
    // ═══════════════════════════════════════════════════════════
    const internalNotes = (caseData.conversations || []).flatMap(c => c.internalNotes || []);
    const noteActivities = (caseData.activities || []).filter(a => a.type === 'NOTE');
    const totalNotesCount = internalNotes.length + noteActivities.length + (contact.notes ? 1 : 0);

    if (totalNotesCount > 0) {
      const countScore = Math.min(totalNotesCount * 5, 15);
      score += countScore;
      breakdown.agentNotesCount = countScore;

      const latestNoteDate = Math.max(
        ...internalNotes.map(n => new Date(n.createdAt).getTime()),
        ...noteActivities.map(a => new Date(a.createdAt).getTime()),
        0
      );
      if (latestNoteDate > 0) {
        const daysSinceNote = (Date.now() - latestNoteDate) / (1000 * 60 * 60 * 24);
        if (daysSinceNote <= 3) {
          score += 5;
          breakdown.recentNoteBonus = 5;
        }
      }
    }

    const allNoteTexts = [
      ...internalNotes.map(n => n.content || ''),
      contact.notes || '',
      ...noteActivities.map(a => `${a.title || ''} ${a.description || ''} ${a.result || ''}`),
      ...(caseData.activities || []).filter(a => a.result).map(a => a.result || '')
    ].filter(t => typeof t === 'string' && t.trim().length > 0);

    const notesTextLower = allNoteTexts.join(' ').toLowerCase();

    if (notesTextLower) {
      const positiveMatches = POSITIVE_NOTE_KEYWORDS.filter(kw => notesTextLower.includes(kw));
      if (positiveMatches.length > 0) {
        const posScore = positiveMatches.length >= 3 ? 35 : (positiveMatches.length === 2 ? 25 : 15);
        score += posScore;
        breakdown.positiveNoteIntent = { score: posScore, matches: positiveMatches.slice(0, 5) };
      }

      const negativeMatches = NEGATIVE_NOTE_KEYWORDS.filter(kw => notesTextLower.includes(kw));
      if (negativeMatches.length > 0) {
        const negPenalty = negativeMatches.length >= 2 ? 35 : 20;
        score -= negPenalty;
        breakdown.negativeNoteIntent = { penalty: -negPenalty, matches: negativeMatches.slice(0, 5) };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ── 11. SON DURUM (CASE STATUS & STAGE & CALL OUTCOME) ────
    // ═══════════════════════════════════════════════════════════
    // A. Vaka Durumu
    if (caseData.status === 'WON') {
      score += 35;
      breakdown.caseStatus = 'WON (+35)';
    } else if (caseData.status === 'LOST') {
      score -= 45;
      breakdown.caseStatus = 'LOST (-45)';
    } else if (caseData.status === 'ACTIVE') {
      if (caseData.priority === 'URGENT') {
        score += 10;
        breakdown.casePriority = 10;
      } else if (caseData.priority === 'HIGH') {
        score += 5;
        breakdown.casePriority = 5;
      }
    }

    // B. Aşama Durumu
    const stageId = caseData.funnelStageId || contact.funnelStageId;
    let stage = null;
    if (stageId) {
      stage = await prisma.funnelStage.findUnique({
        where: { id: stageId },
        select: { id: true, name: true, order: true, isClosing: true, statusType: true }
      });
    }

    if (stage) {
      if (stage.statusType === 'WON') {
        score += 30;
        breakdown.stageStatusType = 'WON (+30)';
      } else if (stage.statusType === 'LOST') {
        score -= 45;
        breakdown.stageStatusType = 'LOST (-45)';
      } else {
        const stageNameLower = (stage.name || '').toLowerCase();
        if (/kazanıldı|satış|başarılı|anlaşıldı|sözleşme/i.test(stageNameLower)) {
          score += 25;
          breakdown.stagePositive = 25;
        } else if (/kayıp|kaybedildi|olumsuz|vazgeçti|ulaşılamadı|ilgisiz/i.test(stageNameLower)) {
          score -= 35;
          breakdown.stageNegative = -35;
        }
      }
    }

    // C. Kişi Kategorisi & Durumu
    if (contact.category === 'VIP') {
      score += 20;
      breakdown.categoryVIP = 20;
    } else if (contact.category === 'CUSTOMER') {
      score += 20;
      breakdown.categoryCustomer = 20;
    } else if (contact.category === 'OPPORTUNITY') {
      score += 10;
      breakdown.categoryOpportunity = 10;
    }

    if (contact.status === 'QUALIFIED') {
      score += 15;
      breakdown.contactQualified = 15;
    } else if (contact.status === 'UNQUALIFIED') {
      score -= 25;
      breakdown.contactUnqualified = -25;
    } else if (contact.status === 'WON') {
      score += 30;
      breakdown.contactWon = 30;
    } else if (contact.status === 'LOST') {
      score -= 40;
      breakdown.contactLost = -40;
    }

    // D. Son Arama Sonucu & Duygusu
    const sortedCalls = (caseData.activities || [])
      .filter(a => a.type === 'CALL' && a.status === 'COMPLETED')
      .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());

    if (sortedCalls.length > 0) {
      const lastCall = sortedCalls[0];
      if (lastCall.callSuccessful === true) {
        score += 10;
        breakdown.lastCallSuccess = 10;
      } else if (lastCall.callSuccessful === false) {
        score -= 10;
        breakdown.lastCallFailed = -10;
      }

      if (lastCall.callSentiment === 'Positive') {
        score += 15;
        breakdown.lastCallSentiment = 15;
      } else if (lastCall.callSentiment === 'Negative') {
        score -= 20;
        breakdown.lastCallSentiment = -20;
      }

      if (sortedCalls.length >= 2 && sortedCalls[0].callSuccessful === false && sortedCalls[1].callSuccessful === false) {
        score -= 15;
        breakdown.consecutiveFailedCalls = -15;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ── KESİN TAVAN / TABAN VE SINIRLAR ───────────────────────
    // ═══════════════════════════════════════════════════════════
    const isBlacklisted = contact.category === 'BLACKLIST' || contact.category === 'SPAM';
    const isWon = caseData.status === 'WON' || stage?.statusType === 'WON' || contact.status === 'WON';
    const isLost = caseData.status === 'LOST' || stage?.statusType === 'LOST' || contact.status === 'LOST';

    if (isBlacklisted) {
      score = 0;
      breakdown.blacklistCap = 'Skor 0 olarak sınırlandı (Blacklist/Spam)';
    } else if (isLost && !isWon) {
      score = Math.min(score, 15);
      score = Math.max(score, 0);
      breakdown.lostCap = 'Kayıp durum: Skor maks 15';
    } else if (isWon) {
      score = Math.max(score, 90);
      score = Math.min(score, 100);
      breakdown.wonFloor = 'Kazanıldı durum: Skor min 90';
    } else {
      score = Math.min(score, 100);
      score = Math.max(score, 0);
    }

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

    // İlgili tüm case'lerin skorlarını da güncelle
    const relatedCases = await prisma.case.findMany({
        where: { contactId },
        select: { id: true }
    });
    for (const c of relatedCases) {
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
