/**
 * Birleşik AI Çağrı Servisi
 * 
 * Sınıflandırma (Universal Classifier) + Sohbet yanıtı (Chat) TEK BİR 
 * Gemini çağrısında birleştirilir.
 * 
 * Kazanç: ~%50 maliyet tasarrufu (2 çağrı → 1 çağrı)
 * 
 * Feature Flag: workspace.useUnifiedAI = true ise aktif
 */

import prisma from '../lib/prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-3.5-flash';

/**
 * Birleşik AI çağrısı — hem sınıflandırma hem yanıt tek çağrıda.
 * 
 * @param {Object} params
 * @param {string} params.workspaceId
 * @param {string} params.conversationId  
 * @param {string} params.userMessage
 * @param {string|null} params.channel
 * @param {Object} params.contact - { name, phone, email }
 * @param {Array} params.recentMessages - Son mesajlar
 * @param {Object} params.activeBot - Aktif bot (prompt, documents)
 * @param {Object} params.stageAIConfig - { aiGoal, aiInstruction, transitionCriteria }
 * @returns {Promise<{ classification: Object, chatResponse: string, stageTransition: Object|null }>}
 */
export async function executeUnifiedAICall({
    workspaceId,
    conversationId,
    userMessage,
    channel = null,
    contact = {},
    recentMessages = [],
    activeBot = null,
    stageAIConfig = {}
}) {
    try {
        console.log('🧠 [UnifiedAI] Birleşik çağrı başlatıldı');

        // ── 1. Workspace ve bağlam bilgilerini yükle ──
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { aiApiKey: true, companyName: true, companyDescription: true }
        });

        if (!workspace?.aiApiKey) {
            console.log('🧠 [UnifiedAI] API key yok, atlanıyor');
            return null;
        }

        // ── 2. Akış ve konu bilgilerini yükle ──
        const [funnels, topicCategories] = await Promise.all([
            prisma.funnel.findMany({
                where: { workspaceId },
                select: {
                    id: true, name: true, funnelType: true,
                    classificationCriteria: true,
                    stages: { select: { id: true, name: true, order: true }, orderBy: { order: 'asc' } }
                }
            }),
            prisma.topicCategory.findMany({
                where: { workspaceId, isActive: true },
                select: {
                    id: true, name: true, keywords: true,
                    products: {
                        where: { isActive: true },
                        select: { id: true, name: true }
                    }
                }
            })
        ]);

        // ── 3. Konuşma geçmişini formatla ──
        const chatLog = recentMessages.map(m => {
            const role = m.direction === 'IN' ? 'Müşteri' : 'Temsilci';
            return `${role}: ${m.content?.substring(0, 300) || ''}`;
        }).join('\n');

        // ── 4. Akış kontekstini formatla ──
        const funnelContext = funnels.map(f => {
            const stages = f.stages.map(s => s.name).join(' → ');
            let criteria = '';
            if (f.classificationCriteria) {
                try {
                    const c = JSON.parse(f.classificationCriteria);
                    if (c.keywords?.length) criteria = ` (Anahtar kelimeler: ${c.keywords.join(', ')})`;
                    if (c.aiDescription) criteria += ` (Açıklama: ${c.aiDescription})`;
                } catch { }
            }
            return `- ${f.name} [${f.id}]: ${stages}${criteria}`;
        }).join('\n');

        // ── 5. Konu kontekstini formatla ──
        const topicContext = topicCategories.map(tc => {
            const products = tc.products.map(p => p.name).join(', ');
            const keywords = tc.keywords ? ` (${tc.keywords})` : '';
            return `- ${tc.name} [${tc.id}]${keywords}${products ? ` | Ürünler: ${products}` : ''}`;
        }).join('\n');

        // ── 6. Aşama AI konfigürasyonu ──
        let stageContext = '';
        if (stageAIConfig.aiGoal) {
            stageContext += `\n🎯 MEVCUT AŞAMA HEDEFİ: ${stageAIConfig.aiGoal}`;
        }
        if (stageAIConfig.aiInstruction) {
            stageContext += `\n📋 AŞAMA TALİMATI: ${stageAIConfig.aiInstruction}`;
        }
        if (stageAIConfig.transitionCriteria?.description) {
            stageContext += `\n🔄 GEÇİŞ KRİTERİ: ${stageAIConfig.transitionCriteria.description}`;
        }

        // ── 7. Bot system prompt ──
        const botPrompt = activeBot?.prompt || 'Müşteri temsilcisi olarak yardımcı ol.';

        // ── 8. Birleşik system prompt ──
        const now = new Date();
        const trDate = now.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const trTime = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

        const systemPrompt = `Sen bir CRM müşteri temsilcisi ve sınıflandırma asistanısın.
Her mesaja hem yanıt üretecek hem de arka planda sınıflandırma yapacaksın.

📅 GÜNCEL TARİH: ${trDate}, Saat: ${trTime}
🏢 FİRMA: ${workspace.companyName || 'Belirsiz'}
📡 KANAL: ${channel || 'BILINMIYOR'}

👤 MÜŞTERİ BİLGİLERİ:
- İsim: ${contact.name || 'Bilinmiyor'}
- Telefon: ${contact.phone || 'Bilinmiyor'}  
- E-posta: ${contact.email || 'Bilinmiyor'}

${contact.name || contact.phone ? '🚫🚫🚫 ÖNEMLİ: Müşterinin bilgileri zaten var, BİLDİĞİN BİLGİLERİ TEKRAR SORMA! 🚫🚫🚫' : ''}

📋 SOHBET GEÇMİŞİ:
${chatLog || '(İlk mesaj)'}

═══════════════════════════════════════
ANA SİSTEM TALİMATI (Bot):
${botPrompt}
═══════════════════════════════════════
${stageContext}
═══════════════════════════════════════

MEVCUT AKIŞLAR:
${funnelContext || '(Akış tanımlanmamış)'}

KONU KATEGORİLERİ VE ÜRÜNLER:
${topicContext || '(Konu tanımlanmamış)'}

═══════════════════════════════════════
GÖREVLERİN:
1. Müşteriye doğal, profesyonel bir yanıt üret
2. Mesajı sınıflandır (FIRSAT/RANDEVU/DESTEK/IS_BASVURUSU/SIKAYET/GENEL)
3. Yapılandırılmış veri çıkar (isim, telefon, e-posta, konu vb.)
4. Uygun akış (funnel) varsa eşleştir
5. Aşama geçişi gerekiyor mu değerlendir
${stageAIConfig.transitionCriteria?.description ? `\n⚠️ GEÇİŞ KRİTERİ: "${stageAIConfig.transitionCriteria.description}" — bu kriter sağlanıyorsa shouldTransition: true dön` : ''}

YANITLAMA KURALLARI:
- Kısa ve öz yanıt ver (max 3-4 cümle)
- ${workspace.companyDescription ? `Firma bilgisi: ${workspace.companyDescription}` : ''}
- Emin olmadığın bilgi verme, [HANDOFF] ile insana devret
- Müşteri kızgınsa sakinleştir, empati kur

YANIT FORMATI (JSON):
{
  "response": "Müşteriye yanıtın buraya",
  "classification": {
    "category": "FIRSAT | RANDEVU | DESTEK | IS_BASVURUSU | SIKAYET | GENEL",
    "confidence": 0.85,
    "reasoning": "Kısa açıklama"
  },
  "extractedData": {
    "name": "String | null",
    "phone": "String | null",
    "email": "String | null",
    "topic": "String | null",
    "preferredCallTime": "String | null",
    "requestedAction": "CALL | VISIT | MEETING | null",
    "budget": "String | null",
    "city": "String | null"
  },
  "matchedFunnelId": "String | null",
  "topicCategoryId": "String | null",
  "matchedProductIds": [],
  "isQualifiedLead": false,
  "stageTransition": {
    "shouldTransition": false,
    "reason": "String | null"
  }
}`;

        // ── 9. Gemini API çağrısı ──
        const genAI = new GoogleGenerativeAI(workspace.aiApiKey);
        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: systemPrompt,
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.7,
            }
        });

        const result = await model.generateContent(userMessage);
        const text = result.response.text();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            console.error('🧠 [UnifiedAI] JSON parse hatası:', e.message);
            console.error('🧠 [UnifiedAI] Raw:', text?.substring(0, 500));
            return null;
        }

        console.log('🧠 [UnifiedAI] Sonuç:', JSON.stringify({
            category: parsed.classification?.category,
            confidence: parsed.classification?.confidence,
            response: parsed.response?.substring(0, 80),
            matchedFunnel: parsed.matchedFunnelId,
            shouldTransition: parsed.stageTransition?.shouldTransition
        }));

        return {
            classification: {
                classification: parsed.classification?.category || 'GENEL',
                confidence: parsed.classification?.confidence || 0.5,
                reasoning: parsed.classification?.reasoning || '',
                extractedData: parsed.extractedData || {},
                matchedFunnelId: parsed.matchedFunnelId || null,
                topicCategoryId: parsed.topicCategoryId || null,
                matchedProductIds: parsed.matchedProductIds || [],
                isQualifiedLead: parsed.isQualifiedLead || false,
            },
            chatResponse: (parsed.response || '').replace(/\[HANDOFF\]/gi, '').trim(),
            stageTransition: parsed.stageTransition || null,
        };
    } catch (err) {
        console.error('🧠 [UnifiedAI] Error:', err.message);
        return null;
    }
}

/**
 * Feature flag kontrolü — workspace birleşik AI kullanıyor mu?
 */
export async function isUnifiedAIEnabled(workspaceId) {
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { useUnifiedAI: true }
        });
        return workspace?.useUnifiedAI === true;
    } catch {
        return false;
    }
}
