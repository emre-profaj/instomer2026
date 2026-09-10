import prisma from '../lib/prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { stripAiThinking } from './ai.controller.js';
import { scrapeUrlContent } from '../services/scraper.service.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';

// Helper to get effective AI API key
const getEffectiveAiApiKey = async (workspaceId) => {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { aiApiKey: true }
    });
    if (workspace?.aiApiKey) return workspace.aiApiKey;
    const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'singleton' } });
    if (globalSettings?.globalAiApiKey) return globalSettings.globalAiApiKey;
    return null;
};

// Sadece SUPER_ADMIN yetkisi olanlar erişebilir
const verifyInstaPermission = async (workspaceId, user) => {
    if (!user) return false;
    return user.role === 'SUPER_ADMIN';
};

// ─── INSTA CALLABLE FUNCTIONS ──────────────────────────────────────

const instaFunctions = {

    // 1. Fiyat Önizleme (Diff Card Hazırlama)
    previewPriceChange: async (workspaceId, { percentage, fixedAmount, categoryName }) => {
        const where = { workspaceId, isActive: true };
        if (categoryName) {
            const cat = await prisma.topicCategory.findFirst({
                where: { workspaceId, name: { contains: categoryName, mode: 'insensitive' } }
            });
            if (cat) where.categoryId = cat.id;
        }

        const products = await prisma.product.findMany({
            where,
            select: { id: true, name: true, price: true, category: { select: { name: true } } },
            orderBy: { name: 'asc' }
        });

        if (products.length === 0) {
            return { message: 'Güncellenecek ürün bulunamadı.', items: [] };
        }

        const items = products.map(p => {
            let newPrice = p.price;
            if (percentage !== undefined && percentage !== null) {
                newPrice = Math.round(p.price * (1 + Number(percentage) / 100));
            } else if (fixedAmount !== undefined && fixedAmount !== null) {
                newPrice = Math.max(0, p.price + Number(fixedAmount));
            }
            return {
                id: p.id,
                name: p.name,
                category: p.category?.name || 'Genel',
                oldPrice: p.price,
                newPrice,
                diff: newPrice - p.price
            };
        });

        return {
            actionType: 'PRICE_UPDATE_PREVIEW',
            totalProducts: items.length,
            percentage,
            fixedAmount,
            categoryName: categoryName || 'Tümü',
            items
        };
    },

    // 2. Fiyat Güncellemesini Uygulama
    applyPriceChange: async (workspaceId, { percentage, fixedAmount, categoryName, productIds }) => {
        const where = { workspaceId, isActive: true };
        if (productIds && Array.isArray(productIds) && productIds.length > 0) {
            where.id = { in: productIds };
        } else if (categoryName) {
            const cat = await prisma.topicCategory.findFirst({
                where: { workspaceId, name: { contains: categoryName, mode: 'insensitive' } }
            });
            if (cat) where.categoryId = cat.id;
        }

        const products = await prisma.product.findMany({ where });
        if (products.length === 0) return { success: false, message: 'Ürün bulunamadı.' };

        let updatedCount = 0;
        await prisma.$transaction(
            products.map(p => {
                let newPrice = p.price;
                if (percentage !== undefined && percentage !== null) {
                    newPrice = Math.round(p.price * (1 + Number(percentage) / 100));
                } else if (fixedAmount !== undefined && fixedAmount !== null) {
                    newPrice = Math.max(0, p.price + Number(fixedAmount));
                }
                updatedCount++;
                return prisma.product.update({
                    where: { id: p.id },
                    data: { price: newPrice }
                });
            })
        );

        return {
            actionType: 'PRICE_UPDATE_APPLIED',
            success: true,
            updatedCount,
            message: `${updatedCount} ürünün fiyatı başarıyla güncellendi.`
        };
    },

    // 3. Yeni Ürün/Hizmet Ekleme
    createProduct: async (workspaceId, { name, price = 0, categoryName, description = '', unit = 'Adet' }) => {
        let categoryId = null;
        if (categoryName) {
            let cat = await prisma.topicCategory.findFirst({
                where: { workspaceId, name: { equals: categoryName, mode: 'insensitive' } }
            });
            if (!cat) {
                cat = await prisma.topicCategory.create({
                    data: { workspaceId, name: categoryName, color: '#ef4444' }
                });
            }
            categoryId = cat.id;
        }

        const product = await prisma.product.create({
            data: {
                workspaceId,
                name,
                price: Number(price) || 0,
                description,
                unit,
                categoryId,
                isActive: true
            },
            include: { category: true }
        });

        return {
            actionType: 'PRODUCT_CREATED',
            success: true,
            product: {
                id: product.id,
                name: product.name,
                price: product.price,
                category: product.category?.name || 'Genel'
            },
            message: `"${name}" hizmeti (${product.price} TL) başarıyla oluşturuldu.`
        };
    },

    // 4. Bot Prompt & Üslup Güncelleme
    updateBotPrompt: async (workspaceId, { botName, newInstructions, tone }) => {
        const bot = await prisma.aIBot.findFirst({
            where: {
                workspaceId,
                ...(botName ? { name: { contains: botName, mode: 'insensitive' } } : {})
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!bot) return { error: 'Güncellenecek AI Bot bulunamadı.' };

        let updatedPrompt = bot.prompt || '';
        if (newInstructions) {
            updatedPrompt = `${updatedPrompt}\n\n[Ek Talimatlar - ${new Date().toLocaleDateString('tr-TR')}]: ${newInstructions}`;
        }
        if (tone) {
            updatedPrompt = `Senin konuşma tonun: ${tone}.\n` + updatedPrompt;
        }

        await prisma.aIBot.update({
            where: { id: bot.id },
            data: { prompt: updatedPrompt }
        });

        return {
            actionType: 'BOT_PROMPT_UPDATED',
            success: true,
            botName: bot.name,
            message: `"${bot.name}" botunun talimatları ve üslubu güncellendi.`
        };
    },

    // 5. Workspace Sağlık Skoru ve Eksikler
    getWorkspaceHealth: async (workspaceId) => {
        const [workspace, products, categories, branches, bots] = await Promise.all([
            prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { companyName: true, companyPhone: true, companyEmail: true, companyWebsite: true, companyWorkingHours: true, companyAddress: true }
            }),
            prisma.product.findMany({ where: { workspaceId }, select: { id: true, name: true, price: true, categoryId: true } }),
            prisma.topicCategory.count({ where: { workspaceId } }),
            prisma.appointmentBranch.findMany({ where: { workspaceId }, select: { id: true, name: true, phone: true } }),
            prisma.aIBot.count({ where: { workspaceId, isActive: true } })
        ]);

        const issues = [];
        let score = 100;

        // Şirket bilgisi kontrolleri
        if (!workspace?.companyPhone) { issues.push({ type: 'warning', text: 'Şirket telefon numarası girilmemiş.' }); score -= 10; }
        if (!workspace?.companyWorkingHours) { issues.push({ type: 'info', text: 'Çalışma saatleri belirtilmemiş.' }); score -= 5; }
        if (!workspace?.companyAddress) { issues.push({ type: 'warning', text: 'Şirket adresi eksik.' }); score -= 10; }

        // Ürün ve fiyat kontrolleri
        const unpriced = products.filter(p => !p.price || p.price === 0);
        if (unpriced.length > 0) {
            issues.push({ type: 'warning', text: `${unpriced.length} ürünün fiyatı 0 TL veya boş.`, items: unpriced.slice(0, 5).map(u => u.name) });
            score -= Math.min(25, unpriced.length * 5);
        }

        if (products.length === 0) {
            issues.push({ type: 'danger', text: 'Hiç ürün veya hizmet eklenmemiş.' });
            score -= 30;
        }

        if (bots === 0) {
            issues.push({ type: 'info', text: 'Aktif AI Bot bulunmuyor.' });
            score -= 10;
        }

        return {
            score: Math.max(10, score),
            totalProducts: products.length,
            unpricedCount: unpriced.length,
            categoriesCount: categories,
            branchesCount: branches.length,
            activeBots: bots,
            issues
        };
    },

    // 6. Ürün Listesi Çekme
    getProducts: async (workspaceId, { search, limit = 15 }) => {
        const where = { workspaceId };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }
        const products = await prisma.product.findMany({
            where,
            select: { id: true, name: true, price: true, unit: true, category: { select: { name: true } } },
            take: limit,
            orderBy: { name: 'asc' }
        });
        return products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            unit: p.unit || 'Adet',
            category: p.category?.name || 'Genel'
        }));
    }
};

// ─── FUNCTION CALLING DEFINITIONS FOR GEMINI ────────────────────────

const functionDeclarations = [
    {
        name: 'previewPriceChange',
        description: 'Fiyat artışı, indirimi veya toplu fiyat değişikliğini hesaplar ve kullanıcıya göstermek için bir önizleme listesi (diff tablosu) hazırlar. Veritabanında henüz değişiklik yapmaz.',
        parameters: {
            type: 'OBJECT',
            properties: {
                percentage: { type: 'NUMBER', description: 'Yüzdesel değişim (örn: 20 -> %20 artış, -10 -> %10 indirim)' },
                fixedAmount: { type: 'NUMBER', description: 'Sabit TL tutarı değişimi (örn: 100 -> her ürüne +100 TL)' },
                categoryName: { type: 'STRING', description: 'İsteğe bağlı: Sadece belirli bir kategorideki ürünleri güncellemek için kategori adı' }
            }
        }
    },
    {
        name: 'applyPriceChange',
        description: 'Fiyat güncellemesini veritabanına doğrudan uygular. Kullanıcı "onaylıyorum" veya "uygula" dediğinde çağrılır.',
        parameters: {
            type: 'OBJECT',
            properties: {
                percentage: { type: 'NUMBER', description: 'Yüzdesel değişim' },
                fixedAmount: { type: 'NUMBER', description: 'Sabit TL tutarı değişimi' },
                categoryName: { type: 'STRING', description: 'İsteğe bağlı kategori filtresi' }
            }
        }
    },
    {
        name: 'createProduct',
        description: 'Yeni bir ürün veya hizmet oluşturur.',
        parameters: {
            type: 'OBJECT',
            properties: {
                name: { type: 'STRING', description: 'Hizmet veya ürünün adı' },
                price: { type: 'NUMBER', description: 'Fiyatı (TL)' },
                categoryName: { type: 'STRING', description: 'Kategori adı' },
                description: { type: 'STRING', description: 'Açıklama' },
                unit: { type: 'STRING', description: 'Birim (Adet, Seans, Saat vb.)' }
            },
            required: ['name']
        }
    },
    {
        name: 'updateBotPrompt',
        description: 'Sistemdeki AI botun konuşma üslubunu, promptunu veya kurallarını günceller.',
        parameters: {
            type: 'OBJECT',
            properties: {
                botName: { type: 'STRING', description: 'Botun adı (isteğe bağlı, boşsa en son aktif bot seçilir)' },
                newInstructions: { type: 'STRING', description: 'Eklenmek veya değiştirilmek istenen talimatlar' },
                tone: { type: 'STRING', description: 'Üslup (örn: "Kurumsal ve kibar", "Samimi ve neşeli", "Randevu odaklı")' }
            }
        }
    },
    {
        name: 'getWorkspaceHealth',
        description: 'Workspace sağlık skorunu, fiyatsız kalan ürünleri, eksik iletişim bilgilerini kontrol eder.',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getProducts',
        description: 'Sistemdeki ürün ve hizmetlerin listesini ve fiyatlarını getirir.',
        parameters: {
            type: 'OBJECT',
            properties: {
                search: { type: 'STRING', description: 'Arama kelimesi' },
                limit: { type: 'NUMBER', description: 'Maksimum sonuç adedi' }
            }
        }
    }
];

// ─── 1. CHAT WITH INSTA ─────────────────────────────────────────────

export const chat = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { message, history } = req.body;

        if (!(await verifyInstaPermission(workspaceId, req.user))) {
            return res.status(403).json({ error: 'Bu işlem için Yönetici veya Admin yetkisi gereklidir.' });
        }

        if (!message?.trim()) {
            return res.status(400).json({ error: 'Mesaj boş olamaz.' });
        }

        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            return res.status(400).json({
                error: 'AI API anahtarı yapılandırılmamış.',
                reply: 'Sistemde AI API anahtarı tanımlı değil. Lütfen Ayarlar > AI bölümünden bir anahtar ekleyin.'
            });
        }

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            tools: [{ functionDeclarations }]
        });

        const systemPrompt = `Sen "Insta" adlı fütüristik, akıllı ve yetkili bir Instomer Workspace Yapılandırıcısısın (Architect & Configurator).

GÖREVLERİN:
1. Şirket bilgileri, şubeler, kategoriler ve ürün/hizmet fiyatlarını yönetmek.
2. Kullanıcı "Fiyatları %20 artır", "X TL ekle" gibi komutlar verdiğinde HER ZAMAN önce 'previewPriceChange' fonksiyonunu çağırıp kullanıcıya bir önizleme sunmak.
3. Kullanıcı "Onayla", "Uygula" veya doğrudan "Hemen uygula" dediğinde 'applyPriceChange' çağırıp işlemi gerçekleştirmek.
4. Yeni hizmet/ürün ekleme isteklerinde 'createProduct' çağırmak.
5. Bot promptu ve üslup isteklerinde 'updateBotPrompt' çağırmak.
6. Sağlık skoru ve eksik veri isteklerinde 'getWorkspaceHealth' çağırmak.

KURALLAR:
- Her zaman Türkçe, kendinden emin, profesyonel ve çözüm odaklı konuş.
- Sayısal verilerde ve onay kartlarında net bilgiler ver.
- Bugünün tarihi: ${new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })}`;

        const historyParts = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Anladım. Ben Insta. Fiyat güncellemeleri, ürün tanımları, kurulum sihirbazı ve bot yapılandırmalarında size yardımcı olmaya hazırım.' }] }
        ];

        if (history && history.length > 0) {
            let lastRole = 'model';
            for (const h of history) {
                const currentRole = h.role === 'user' ? 'user' : 'model';
                if (currentRole === lastRole) {
                    historyParts[historyParts.length - 1].parts[0].text += '\n\n' + h.content;
                } else {
                    historyParts.push({ role: currentRole, parts: [{ text: h.content }] });
                    lastRole = currentRole;
                }
            }
        }

        const chatSession = model.startChat({ history: historyParts });
        let result = await chatSession.sendMessage(message);
        let response = result.response;

        let actionCard = null;
        let iterations = 0;

        while (response.candidates?.[0]?.content?.parts?.some(p => p.functionCall) && iterations < 5) {
            iterations++;
            const functionCalls = response.candidates[0].content.parts.filter(p => p.functionCall);
            const functionResponses = [];

            for (const fc of functionCalls) {
                const fnName = fc.functionCall.name;
                const fnArgs = fc.functionCall.args || {};
                console.log(`🔴 [Insta] → ${fnName}(${JSON.stringify(fnArgs)})`);

                let fnResult;
                try {
                    if (instaFunctions[fnName]) {
                        fnResult = await instaFunctions[fnName](workspaceId, fnArgs);
                        if (fnResult?.actionType) {
                            actionCard = fnResult;
                        }
                    } else {
                        fnResult = { error: `Bilinmeyen fonksiyon: ${fnName}` };
                    }
                } catch (err) {
                    console.error(`❌ [Insta] Fn error:`, err);
                    fnResult = { error: err.message };
                }

                functionResponses.push({
                    functionResponse: { name: fnName, response: { result: JSON.stringify(fnResult) } }
                });
            }

            result = await chatSession.sendMessage(functionResponses);
            response = result.response;
        }

        const textResponse = stripAiThinking(response.text());
        res.json({
            reply: textResponse,
            actionCard,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ [Insta Chat Error]:', error);
        res.status(500).json({
            error: error.message,
            reply: 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.'
        });
    }
};

// ─── 2. ANALYZE SOURCE (Web URL or Uploaded Document) ───────────────

export const analyzeSource = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        if (!(await verifyInstaPermission(workspaceId, req.user))) {
            return res.status(403).json({ error: 'Bu işlem için Yönetici veya Admin yetkisi gereklidir.' });
        }

        const { url } = req.body;
        const file = req.file;

        let rawText = '';
        let sourceName = '';

        if (url) {
            sourceName = url;
            const scraped = await scrapeUrlContent(url);
            rawText = (scraped.title || '') + '\n\n' + (scraped.content || '');
        } else if (file) {
            sourceName = file.originalname;
            const ext = path.extname(file.originalname).toLowerCase();
            if (ext === '.pdf') {
                const buffer = fs.readFileSync(file.path);
                const pdfData = await pdf(buffer);
                rawText = pdfData.text;
            } else if (ext === '.docx' || ext === '.doc') {
                const result = await mammoth.extractRawText({ path: file.path });
                rawText = result.value;
            } else if (ext === '.txt' || ext === '.csv' || ext === '.json') {
                rawText = fs.readFileSync(file.path, 'utf8');
            } else {
                return res.status(400).json({ error: 'Desteklenmeyen dosya türü. PDF, DOCX, TXT veya CSV yükleyin.' });
            }

            // Cleanup uploaded file
            try { fs.unlinkSync(file.path); } catch (e) {}
        } else {
            return res.status(400).json({ error: 'Lütfen bir web sitesi URL\'si veya dosya sağlayın.' });
        }

        if (!rawText || rawText.trim().length < 20) {
            return res.status(400).json({ error: 'Kaynaktan yeterli metin içeriği çıkarılamadı.' });
        }

        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) return res.status(400).json({ error: 'AI API Key bulunamadı.' });

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `Aşağıdaki kaynak metni derinlemesine analiz et. Bu metin bir firmanın web sitesi veya fiyat/hizmet kataloğudur.
Instomer CRM sistemine otomatik kurulum yapmak için aşağıdaki JSON yapısında eksiksiz ve tutarlı veri çıkar.

METİN:
"""
${rawText.substring(0, 35000)}
"""

İSTENEN JSON FORMATI:
{
  "companyInfo": {
    "name": "Şirket/Klinik/Salon Adı",
    "description": "Şirket hakkında özet açıklama",
    "address": "Fiziksel açık adres",
    "phone": "Telefon numarası",
    "email": "E-posta adresi",
    "website": "${url || ''}",
    "workingHours": "Örn: Pazartesi-Cumartesi 09:00-19:00"
  },
  "branches": [
    { "name": "Şube Adı", "address": "Şube Adresi", "phone": "Şube Telefonu" }
  ],
  "categories": [
    { "name": "Kategori Adı", "description": "Kategori açıklaması", "color": "#ef4444" }
  ],
  "products": [
    {
      "name": "Hizmet veya Ürün Adı",
      "description": "Kısa açıklama",
      "price": 500,
      "unit": "Seans/Adet/Saat",
      "categoryName": "Bağlı olduğu Kategori Adı",
      "duration": "30 dk"
    }
  ],
  "knowledgeNotes": [
    { "title": "Hakkımızda veya SSS", "content": "Detaylı açıklama" }
  ]
}

Sadece saf JSON döndür. Başında veya sonunda markdown (\`\`\`json) etiketi kullanma.`;

        const aiResult = await model.generateContent(prompt);
        let textOutput = aiResult.response.text().trim();
        textOutput = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();

        let parsedData;
        try {
            parsedData = JSON.parse(textOutput);
        } catch (parseErr) {
            console.error('JSON parse error from Gemini:', parseErr.message, textOutput);
            return res.status(500).json({ error: 'Yapay zeka yanıtı JSON formatına dönüştürülemedi.' });
        }

        res.json({
            success: true,
            sourceName,
            extracted: parsedData
        });

    } catch (error) {
        console.error('❌ [Analyze Source Error]:', error);
        res.status(500).json({ error: error.message || 'Kaynak taranırken hata oluştu.' });
    }
};

// ─── 3. APPLY SETUP (Commit Extracted Wizard Data to DB) ────────────

export const applySetup = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        if (!(await verifyInstaPermission(workspaceId, req.user))) {
            return res.status(403).json({ error: 'Bu işlem için Yönetici veya Admin yetkisi gereklidir.' });
        }

        const { companyInfo, branches, categories, products, knowledgeNotes } = req.body;

        const results = {
            companyUpdated: false,
            branchesCreated: 0,
            categoriesCreated: 0,
            productsCreated: 0,
            kbCreated: 0
        };

        // 1. Update Company Info
        if (companyInfo && Object.keys(companyInfo).length > 0) {
            await prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                    ...(companyInfo.name && { companyName: companyInfo.name }),
                    ...(companyInfo.description && { companyDescription: companyInfo.description }),
                    ...(companyInfo.address && { companyAddress: companyInfo.address }),
                    ...(companyInfo.phone && { companyPhone: companyInfo.phone }),
                    ...(companyInfo.email && { companyEmail: companyInfo.email }),
                    ...(companyInfo.website && { companyWebsite: companyInfo.website }),
                    ...(companyInfo.workingHours && { companyWorkingHours: companyInfo.workingHours })
                }
            });
            results.companyUpdated = true;
        }

        // 2. Branches
        if (branches && Array.isArray(branches)) {
            for (const b of branches) {
                if (!b.name) continue;
                const existing = await prisma.appointmentBranch.findFirst({
                    where: { workspaceId, name: { equals: b.name, mode: 'insensitive' } }
                });
                if (!existing) {
                    await prisma.appointmentBranch.create({
                        data: {
                            workspaceId,
                            name: b.name,
                            address: b.address || null,
                            phone: b.phone || null
                        }
                    });
                    results.branchesCreated++;
                }
            }
        }

        // 3. Categories
        const categoryMap = new Map(); // name -> id
        if (categories && Array.isArray(categories)) {
            for (const c of categories) {
                if (!c.name) continue;
                let existing = await prisma.topicCategory.findFirst({
                    where: { workspaceId, name: { equals: c.name, mode: 'insensitive' } }
                });
                if (!existing) {
                    existing = await prisma.topicCategory.create({
                        data: {
                            workspaceId,
                            name: c.name,
                            description: c.description || null,
                            color: c.color || '#ef4444'
                        }
                    });
                    results.categoriesCreated++;
                }
                categoryMap.set(c.name.toLowerCase(), existing.id);
            }
        }

        // 4. Products & Services
        if (products && Array.isArray(products)) {
            for (const p of products) {
                if (!p.name) continue;
                const catId = p.categoryName ? categoryMap.get(p.categoryName.toLowerCase()) || null : null;

                const existing = await prisma.product.findFirst({
                    where: { workspaceId, name: { equals: p.name, mode: 'insensitive' } }
                });

                if (existing) {
                    // Update price if available
                    if (p.price !== undefined) {
                        await prisma.product.update({
                            where: { id: existing.id },
                            data: { price: Number(p.price) || 0 }
                        });
                    }
                } else {
                    await prisma.product.create({
                        data: {
                            workspaceId,
                            name: p.name,
                            description: p.description || null,
                            price: Number(p.price) || 0,
                            unit: p.unit || 'Adet',
                            categoryId: catId,
                            isActive: true
                        }
                    });
                    results.productsCreated++;
                }
            }
        }

        // 5. Knowledge Base Notes
        if (knowledgeNotes && Array.isArray(knowledgeNotes)) {
            for (const kn of knowledgeNotes) {
                if (!kn.title || !kn.content) continue;
                await prisma.knowledgeBase.create({
                    data: {
                        workspaceId,
                        title: kn.title,
                        content: kn.content,
                        sourceType: 'TEXT'
                    }
                });
                results.kbCreated++;
            }
        }

        res.json({
            success: true,
            results,
            message: 'Kurulum verileri başarıyla sisteme aktarıldı!'
        });

    } catch (error) {
        console.error('❌ [Apply Setup Error]:', error);
        res.status(500).json({ error: error.message || 'Veriler kaydedilirken hata oluştu.' });
    }
};

// ─── 4. GET HEALTH ──────────────────────────────────────────────────

export const getHealth = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        if (!(await verifyInstaPermission(workspaceId, req.user))) {
            return res.status(403).json({ error: 'Bu işlem için Yönetici veya Admin yetkisi gereklidir.' });
        }

        const health = await instaFunctions.getWorkspaceHealth(workspaceId);
        res.json(health);
    } catch (error) {
        console.error('❌ [Get Health Error]:', error);
        res.status(500).json({ error: error.message });
    }
};

// ─── 5. DIRECT ACTION (Quick Price/Product Apply) ───────────────────

export const applyAction = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        if (!(await verifyInstaPermission(workspaceId, req.user))) {
            return res.status(403).json({ error: 'Bu işlem için Yönetici veya Admin yetkisi gereklidir.' });
        }

        const { actionType, payload } = req.body;

        if (actionType === 'PRICE_UPDATE') {
            const result = await instaFunctions.applyPriceChange(workspaceId, payload);
            return res.json(result);
        }

        if (actionType === 'CREATE_PRODUCT') {
            const result = await instaFunctions.createProduct(workspaceId, payload);
            return res.json(result);
        }

        if (actionType === 'UPDATE_PROMPT') {
            const result = await instaFunctions.updateBotPrompt(workspaceId, payload);
            return res.json(result);
        }

        res.status(400).json({ error: 'Geçersiz eylem tipi.' });
    } catch (error) {
        console.error('❌ [Apply Action Error]:', error);
        res.status(500).json({ error: error.message });
    }
};
