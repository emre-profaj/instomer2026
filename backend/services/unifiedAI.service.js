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
import { getSectorPrompt } from '../utils/sectorPrompt.js';
import { getBaseKnowledgeContext } from './baseKnowledge.service.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Aşama isminden otomatik AI hedefi oluşturur.
 * Kullanıcı manuel hedef yazmadığında devreye girer.
 */
function generateAutoGoalFromStageName(stageName, nextStageName, isClosing) {
    if (isClosing) return 'Bu süreç tamamlanmıştır. Müşteriye teşekkür et ve memnuniyet sor.';
    
    const name = stageName.toLowerCase();
    const next = nextStageName ? `"${nextStageName}" aşamasına taşımak` : 'süreci ilerletmek';

    // Aşama ismine göre otomatik hedef
    if (name.includes('yeni') || name.includes('gelen') || name.includes('ilk')) {
        return `Müşteriyi tanı, ihtiyacını anla, iletişim bilgilerini (telefon/isim) al. Hedef: ${next}.`;
    }
    if (name.includes('fırsat') || name.includes('firsat') || name.includes('lead')) {
        if (name.includes('sıcak') || name.includes('sicak') || name.includes('hot')) {
            return `Müşteri aktif ilgili — hemen arama veya randevu planla. Gecikmeden harekete geç. Hedef: ${next}.`;
        }
        return `Müşterinin ilgisini artır, sorularını yanıtla, arama veya görüşme planla. Hedef: ${next}.`;
    }
    if (name.includes('görüşme') || name.includes('gorusme') || name.includes('meeting')) {
        return `Görüşme detaylarını netleştir (tarih, saat, konum). Müşteriyi görüşmeye hazırla. Hedef: ${next}.`;
    }
    if (name.includes('randevu') || name.includes('appointment')) {
        return `Randevu detaylarını onayla, hatırlat. Müşterinin randevuya gelmesini sağla. Hedef: ${next}.`;
    }
    if (name.includes('teklif') || name.includes('fiyat') || name.includes('proposal')) {
        return `Teklif hakkında soruları yanıtla, itirazları karşıla, karar sürecini hızlandır. Hedef: ${next}.`;
    }
    if (name.includes('değerlendirme') || name.includes('analiz') || name.includes('inceleme')) {
        return `Müşterinin ihtiyaçlarını detaylandır, uygun çözümü belirle. Hedef: ${next}.`;
    }
    if (name.includes('takip') || name.includes('follow')) {
        return `Müşteriyi takip et, durumu sor, ilgiyi canlı tut. Hedef: ${next}.`;
    }
    if (name.includes('destek') || name.includes('support')) {
        return `Müşterinin sorununu çöz, memnuniyetini sağla. Sorunu çözemezsen insana devret.`;
    }
    if (name.includes('şikayet') || name.includes('sikayet') || name.includes('complaint')) {
        return `Müşteriyi sakinleştir, empati kur, sorunu anla ve çözüm sun. Gerekirse insana devret.`;
    }

    // Genel fallback
    return `Bu aşamadaki müşteriyi ilerlet. Bilgi topla, soruları yanıtla, güven oluştur. Hedef: ${next}.`;
}

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
            select: { aiApiKey: true, aiModel: true, companyName: true, companyDescription: true, industry: true, company: { select: { aiModel: true } } }
        });

        if (!workspace?.aiApiKey) {
            console.log('🧠 [UnifiedAI] API key yok, atlanıyor');
            return null;
        }

        // ── 2. Akış, konu ve BASE MODÜLÜ (Şubeler, Ürünler, Uzmanlar, SSS) yükle ──
        const [funnels, topicCategories, baseKnowledge] = await Promise.all([
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
            }),
            getBaseKnowledgeContext(workspaceId)
        ]);

        // ── 3. Konuşma geçmişini formatla ──
        const chatLog = recentMessages.map(m => {
            const role = (m.isFromContact || m.direction === 'IN') ? 'Müşteri' : 'Temsilci';
            return `${role}: ${m.content?.substring(0, 300) || ''}`;
        }).join('\n');

        // ── 3b. Temsilci notları ve aktiviteleri ──
        let activityLog = '';
        try {
            const conv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { contactId: true }
            });
            if (conv?.contactId) {
                const recentActivities = await prisma.contactActivity.findMany({
                    where: { 
                        contactId: conv.contactId, workspaceId
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 8,
                    select: { type: true, title: true, description: true, result: true, status: true, dueDate: true, callSuccessful: true }
                });
                if (recentActivities.length > 0) {
                    const labels = { 
                        NOTE: '📝 Not', CALL: '📞 Arama', MEETING: '🤝 Toplantı', 
                        TASK: '✅ Görev', REMINDER: '🔔 Hatırlatıcı',
                        PROPOSAL: '📄 Teklif', ORDER: '🛒 Sipariş', 
                        INVOICE: '🧾 Fatura', PAYMENT: '💰 Ödeme'
                    };
                    activityLog = recentActivities.reverse().map(a => {
                        let line = `${labels[a.type] || a.type}: ${a.title || a.description || ''}`;
                        if (a.description && a.title) line += ` — ${a.description}`;
                        if (a.result) line += ` [Sonuç: ${a.result}]`;
                        if (a.dueDate) line += ` [Tarih: ${new Date(a.dueDate).toLocaleDateString('tr-TR')}]`;
                        if (a.callSuccessful !== null) line += a.callSuccessful ? ' ✅ Ulaşıldı' : ' ❌ Ulaşılamadı';
                        return line;
                    }).join('\n');
                }

                // Randevular
                const appointments = await prisma.appointment.findMany({
                    where: { contactId: conv.contactId, workspaceId },
                    orderBy: { startTime: 'desc' },
                    take: 5,
                    select: { title: true, startTime: true, status: true, branch: true, procedure: true, doctorName: true, notes: true }
                });
                if (appointments.length > 0) {
                    const statusLabels = { SCHEDULED: '🟡 Planlandı', COMPLETED: '✅ Tamamlandı', CANCELLED: '❌ İptal', NO_SHOW: '⚠️ Gelmedi' };
                    activityLog += '\n📅 RANDEVULAR:\n' +
                        appointments.reverse().map(a => {
                            let line = `📅 ${a.title} — ${new Date(a.startTime).toLocaleDateString('tr-TR')} ${new Date(a.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
                            line += ` ${statusLabels[a.status] || a.status}`;
                            if (a.branch) line += ` | ${a.branch}`;
                            if (a.doctorName) line += ` | Dr. ${a.doctorName}`;
                            return line;
                        }).join('\n');
                }
            }
        } catch (e) { /* aktivite yükleme hatası — atla */ }

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

        // ── 6. Aşama AI konfigürasyonu (otomatik + manuel) ──
        let stageContext = '';
        if (stageAIConfig.stageName) {
            stageContext += `\n📍 MEVCUT AŞAMA: "${stageAIConfig.stageName}" (${stageAIConfig.funnelName || 'Akış'})`;
            
            if (stageAIConfig.stageList) {
                stageContext += `\n\n📊 AKIŞ HARİTASI:\n${stageAIConfig.stageList}`;
            }

            // Manuel hedef varsa onu kullan, yoksa otomatik oluştur
            if (stageAIConfig.aiGoal) {
                stageContext += `\n\n🎯 AŞAMA HEDEFİ (Manuel): ${stageAIConfig.aiGoal}`;
            } else {
                // Stage isminden otomatik hedef oluştur
                const autoGoal = generateAutoGoalFromStageName(stageAIConfig.stageName, stageAIConfig.nextStageName, stageAIConfig.isClosing);
                stageContext += `\n\n🎯 AŞAMA HEDEFİ (Otomatik): ${autoGoal}`;
            }

            if (stageAIConfig.nextStageName && !stageAIConfig.isClosing) {
                stageContext += `\n\n🏁 SONRAKİ AŞAMA: "${stageAIConfig.nextStageName}" — Hedefe ulaştığında müşteriyi bu aşamaya taşı (shouldTransition: true)`;
            }

            if (stageAIConfig.aiInstruction) {
                stageContext += `\n\n📋 EK TALİMAT: ${stageAIConfig.aiInstruction}`;
            }

            if (stageAIConfig.transitionCriteria?.description) {
                stageContext += `\n\n🔄 GEÇİŞ KRİTERİ: ${stageAIConfig.transitionCriteria.description}`;
            }

            if (stageAIConfig.isClosing) {
                stageContext += `\n\n⚠️ Bu bir KAPANIŞ aşamasıdır. Süreç tamamlanmıştır, yeni satış hedefi yoktur.`;
            }
        }


        // ── 7. Bot system prompt (kişilik + yasaklar) ──
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
${activityLog ? `\n📝 TEMSİLCİ NOTLARI VE AKTİVİTELER:\n${activityLog}` : ''}

═══════════════════════════════════════
🤖 İŞLETME TALİMATLARI VE BOT PROMPT'U (EN YÜKSEK ÖNCELİK - KESİNLİKLE UYULACAK):
${botPrompt || '(Özel prompt girilmemiş)'}
═══════════════════════════════════════
${stageContext ? `
═══════════════════════════════════════
🎯 SATIŞ AKIŞI BAĞLAMI — ANA HEDEFİN BU:
${stageContext}

⚡ ÖNCELİK: Yukarıdaki aşama hedefini gerçekleştirmek senin 1 numaralı görevin.
Müşteriyi bir sonraki aşamaya taşımak için çalış. İşletme talimatlarına ve kurallara harfiyen uy.
═══════════════════════════════════════` : '═══════════════════════════════════════'}

MEVCUT AKIŞLAR:
${funnelContext || '(Akış tanımlanmamış)'}

KONU KATEGORİLERİ VE ÜRÜNLER:
${topicContext || '(Konu tanımlanmamış)'}
${baseKnowledge?.text ? `
═══════════════════════════════════════
🏢 BASE MODÜLÜ TANIMLARI (ŞİRKET, ŞUBELER, ÜRÜNLER/FİYATLAR, UZMANLAR, SSS):
${baseKnowledge.text}
═══════════════════════════════════════` : ''}

═══════════════════════════════════════
${getSectorPrompt(workspace.industry, `${workspace.companyName || ''} ${workspace.companyDescription || ''} ${workspace.companyWebsite || ''} ${botPrompt || ''}`)}
═══════════════════════════════════════

═══════════════════════════════════════
GÖREVLERİN:
1. Müşteriye doğal, profesyonel bir yanıt üret
2. Mesajı sınıflandır (FIRSAT/RANDEVU/DESTEK/IS_BASVURUSU/SIKAYET/GENEL)
3. Yapılandırılmış veri çıkar (isim, telefon, e-posta, konu vb.)
4. Uygun akış (funnel) varsa eşleştir
5. Aşama geçişi gerekiyor mu değerlendir
${stageAIConfig.transitionCriteria?.description ? `\n⚠️ GEÇİŞ KRİTERİ: "${stageAIConfig.transitionCriteria.description}" — bu kriter sağlanıyorsa shouldTransition: true dön` : ''}

🚨 KESİNLİKLE UYULMASI GEREKEN KATI YANITLAMA KURALLARI:
1. SADECE VE YALNIZCA RESMİ BİLGİLERİ KULLAN (SIFIR UYDURMA / ASLA KENDİNCE YORUM YAPMA):
   - Müşteriye cevap vermeden önce yukarıdaki "İŞLETME TALİMATLARI VE BOT PROMPT'U", "BASE MODÜLÜ TANIMLARI" (Şirket Bilgileri, Şubeler, Ürünler ve Fiyatlar, Uzmanlar, Bilgi Bankası Metinleri ve SSS) içeriklerini DİKKATLE TARA.
   - Cevabın YALNIZCA ve KESİNLİKLE bu kaynaklarda açıkça yazan resmi bilgilere dayanmalıdır.
   - Bu kaynaklarda açıkça yazmayan HİÇBİR kural, şart, fiyat, indirim, kampanya, prosedür, garanti, vaat veya hizmet hakkında KENDİNCE YORUM YAPMA, TAHMİN YÜRÜTME, GENEL İNTERNET BİLGİSİNDEN BİR ŞEYLER ÇIKARMA VEYA ASLA KAFANDAN BİLGİ UYDURMA!
   - Müşterinin sorduğu soru bu kaynaklarda YOKSA: KESİNLİKLE kendince bir varsayım veya uydurma cevap üretme. Kurum adına nazikçe şunu söyle: "Bu konuda sistemimizde net ve güncel bir bilgi yer almamaktadır. Size yanlış bilgi vermemek adına konuyu hemen yetkili çalışma arkadaşlarımıza iletiyorum, en kısa sürede size dönüş yapacaklardır."

2. ORTA VE DENGELİ MESAJ UZUNLUĞU (UZUN OLMADAN, ÖZ VE NET):
   - Cevapların ASLA çok uzun, destan gibi, paragraflar dolusu veya gereksiz ayrıntılarla dolu olmasın!
   - Müşteriyi metin yığınına boğma. Doğrudan müşterinin sorusuna cevap veren, orta düzeyde uzunlukta (ideal olarak 2-4 kısa ve öz cümle), net, samimi ve profesyonel bir üslupla yaz.
   - Bilgi bankasındaki tüm metni veya listeleri kopyalayıp yapıştırma; sadece müşterinin sorduğu spesifik kısmı özetleyerek aktar.

3. 🚫 İSTİSNA, MUAFİYET VE GİRİŞ ÜCRETİ KURALI (ASLA KAFANDAN ONAY VERME):
   - Müşteri "giriş ücreti ödemeden olur mu?", "şunu ödemeden sadece şunu alabilir miyim?", "şu hizmet olmadan olur mu?", "ücretsiz mi?", "ayrı almam mümkün mü?", "indirim olur mu?" gibi şartları/ücretleri esnetme soruları sorduğunda:
   - EĞER Bilgi Bankasında veya AI Prompt metninde bunun mümkün olduğu KELİMESİ KELİMESİNE AÇIKÇA YAZMIYORSA:
     * KESİNLİKLE "mümkündür", "ayrı alabilirsiniz", "giriş ücreti ödemeden hizmet almanız mümkündür", "ücretsizdir" GİBİ BİR ONAY VERME!
     * Ancak bunun TERSİNİ de kafandan söyleme: giriş ücreti zorunluluğu, paket kapsamı ve bir hizmetin tek başına alınıp alınamayacağı hizmetten hizmete değişir. Bilgi Bankasında o hizmet için açıkça yazan koşulu aynen aktar; bir hizmet için yazan koşulu BAŞKA hizmete genelleme; Bilgi Bankasında hüküm yoksa ne olumlu ne olumsuz cevap ver, konuyu yetkiliye aktaracağını belirt.

4. 🚫 HAYALİ LİNK VE BAĞLANTI YASAĞI:
   - Bilgi bankasında veya bot talimatında açıkça tam link/URL verilmemişse, ASLA kafandan markdown linki (örn: [Fiyatlar](https://...)) veya uydurma internet adresi türetme.

5. DİL VE KURUMSAL KİMLİK:
   - ASLA birinci şahıs tekil ("ben", "bence", "tahminimce", "düşünüyorum") kullanma. Kurum adına "biz", "ekibimiz", "kurumumuz" şeklinde konuş.
   - ASLA şüphe uyandıran zayıf ifadeler ("bilmiyorum", "emin değilim", "galiba") kullanma. Bilgi yoksa doğrudan yetkiliye aktaracağını belirt.
   - Müşteri kızgınsa veya şikayetçiyse sakinleştirici, anlayışlı ve kurumsal bir dil kullan.

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
        // Workspace veya company model'i kullan, yoksa default
        const effectiveModel = workspace.aiModel || workspace.company?.aiModel || DEFAULT_MODEL;
        console.log(`🧠 [UnifiedAI] Model: ${effectiveModel}`);
        const genAI = new GoogleGenerativeAI(workspace.aiApiKey);
        const model = genAI.getGenerativeModel({
            model: effectiveModel,
            systemInstruction: systemPrompt,
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
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
 * Birleşik AI daima aktif — classifier + chat tek çağrıda.
 * Toggle bağımlılığı kaldırıldı (maliyet optimizasyonu).
 */
export async function isUnifiedAIEnabled(workspaceId) {
    return true;
}
