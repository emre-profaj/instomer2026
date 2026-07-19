import prisma from '../lib/prisma.js';

/**
 * Aşama Yeterlilik Servisi
 * 
 * Her aşamada hangi alanların zorunlu olduğunu kontrol eder.
 * Eksik alanlar varsa bot'a bildirir, tamamlanınca otomatik ilerletir.
 * 
 * requiredFields JSON formatı:
 * {
 *   "fields": ["name", "phone", "email", "budget", "topic"],
 *   "autoAdvance": true,
 *   "nextStageId": "clxxx..." (opsiyonel, yoksa sıradaki aşama)
 * }
 */

// ─── Desteklenen alanlar ve Türkçe karşılıkları ────────────────────
export const FIELD_LABELS = {
    name:              'Ad Soyad',
    phone:             'Telefon Numarası',
    email:             'E-posta Adresi',
    topic:             'İlgilendiği Konu / Hizmet',
    budget:            'Bütçe',
    city:              'Şehir',
    preferredCallTime: 'Aranma Zamanı',
    company:           'Firma Adı',
    note:              'Not / Ek Bilgi',
    gender:            'Cinsiyet',
    age:               'Yaş',
    address:           'Adres',
    source:            'Nereden Duyduğu',
};

/**
 * Konuşmanın mevcut aşamasındaki zorunlu alanları kontrol eder.
 * @returns {{ complete: boolean, missing: string[], filled: string[], progress: number, promptHint: string }}
 */
export const checkStageRequirements = async (conversationId) => {
    try {
        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                funnelStageId: true,
                classificationData: true,
                aiTopic: true,
                contact: {
                    select: {
                        name: true, phone: true, email: true,
                        city: true, company: true, address: true,
                        customFields: true
                    }
                }
            }
        });

        if (!conv?.funnelStageId) {
            return { complete: true, missing: [], filled: [], progress: 100, promptHint: '' };
        }

        const stage = await prisma.funnelStage.findUnique({
            where: { id: conv.funnelStageId },
            select: { requiredFields: true, name: true }
        });

        if (!stage?.requiredFields) {
            return { complete: true, missing: [], filled: [], progress: 100, promptHint: '' };
        }

        let config;
        try {
            config = JSON.parse(stage.requiredFields);
        } catch {
            return { complete: true, missing: [], filled: [], progress: 100, promptHint: '' };
        }

        const fields = config.fields || [];
        if (fields.length === 0) {
            return { complete: true, missing: [], filled: [], progress: 100, promptHint: '' };
        }

        // Mevcut verileri topla (contact + classificationData)
        const contact = conv.contact || {};
        let classData = {};
        try { classData = conv.classificationData ? JSON.parse(conv.classificationData) : {}; } catch {}
        const extracted = classData.extractedData || {};
        let customFields = {};
        try { customFields = contact.customFields ? JSON.parse(contact.customFields) : {}; } catch {}

        // Her alan için dolu mu kontrol et
        const filled = [];
        const missing = [];

        for (const field of fields) {
            const value = getFieldValue(field, contact, extracted, customFields, conv);
            if (value) {
                filled.push(field);
            } else {
                missing.push(field);
            }
        }

        const progress = fields.length > 0 ? Math.round((filled.length / fields.length) * 100) : 100;
        const complete = missing.length === 0;

        // Bot için prompt ipucu oluştur
        let promptHint = '';
        if (missing.length > 0) {
            const missingLabels = missing.map(f => FIELD_LABELS[f] || f);
            promptHint = `\n⚠️ EKSİK BİLGİLER: Bu konuşmayı ilerletmek için şu bilgilere ihtiyacım var: ${missingLabels.join(', ')}. Lütfen müşteriye kibarca ve doğal şekilde bu bilgileri sor. Tüm bilgileri tek seferde isteme, konuşma akışına göre sor.`;
        }

        return { complete, missing, filled, progress, promptHint, autoAdvance: config.autoAdvance, nextStageId: config.nextStageId };
    } catch (error) {
        console.error('[StageQualification] Error:', error.message);
        return { complete: true, missing: [], filled: [], progress: 100, promptHint: '' };
    }
};

/**
 * Aşama tamamlandıysa otomatik ilerleme yap
 */
export const tryAutoAdvance = async (conversationId) => {
    try {
        const result = await checkStageRequirements(conversationId);
        if (!result.complete || !result.autoAdvance) return null;

        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { funnelStageId: true, funnelType: true }
        });

        if (!conv?.funnelStageId) return null;

        // Hedef aşama: nextStageId varsa o, yoksa sıradaki
        let nextStageId = result.nextStageId;

        if (!nextStageId) {
            const currentStage = await prisma.funnelStage.findUnique({
                where: { id: conv.funnelStageId },
                select: { order: true, funnelId: true }
            });

            if (!currentStage) return null;

            const nextStage = await prisma.funnelStage.findFirst({
                where: {
                    funnelId: currentStage.funnelId,
                    order: { gt: currentStage.order },
                    isClosing: false
                },
                orderBy: { order: 'asc' }
            });

            if (!nextStage) return null;
            nextStageId = nextStage.id;
        }

        // İlerlet
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { funnelStageId: nextStageId }
        });

        console.log(`🚀 [AutoAdvance] ${conversationId}: Aşama ilerletildi → ${nextStageId}`);
        return nextStageId;
    } catch (error) {
        console.error('[AutoAdvance] Error:', error.message);
        return null;
    }
};

// ─── HELPERS ─────────────────────────────────────────────────

function getFieldValue(field, contact, extracted, customFields, conv) {
    switch (field) {
        case 'name':
            return contact.name || extracted.name || null;
        case 'phone':
            return contact.phone || extracted.phone || null;
        case 'email':
            return contact.email || extracted.email || null;
        case 'topic':
            return conv.aiTopic || extracted.topic || null;
        case 'budget':
            return extracted.budget || customFields.budget || null;
        case 'city':
            return contact.city || extracted.city || extracted.branchInfo || null;
        case 'preferredCallTime':
            return extracted.preferredCallTime || null;
        case 'company':
            return contact.company || extracted.company || null;
        case 'gender':
            return customFields.gender || extracted.gender || null;
        case 'age':
            return customFields.age || extracted.age || null;
        case 'address':
            return contact.address || extracted.address || null;
        case 'source':
            return customFields.source || extracted.source || null;
        case 'note':
            return customFields.note || extracted.note || null;
        default:
            return customFields[field] || extracted[field] || null;
    }
}
