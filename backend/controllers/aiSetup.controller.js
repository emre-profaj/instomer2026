/**
 * AI Setup & Intelligent Document Parser Controller
 * 
 * Extracts structured workspace configuration (Company, Working Hours, Holidays,
 * Branches, Categories, Products, Resources/Doctors, FAQ) from uploaded files or URLs.
 */

import prisma from '../lib/prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createRequire } from 'module';
import axios from 'axios';

const require = createRequire(import.meta.url);

// Helper to get effective AI API key
const getAiApiKey = async (workspaceId) => {
    if (workspaceId) {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { aiApiKey: true }
        });
        if (workspace?.aiApiKey) return workspace.aiApiKey;
    }

    const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'singleton' }
    });
    if (globalSettings?.globalAiApiKey) return globalSettings.globalAiApiKey;

    return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || null;
};

// Helper to extract text from various file formats safely
export async function extractTextFromFile(file) {
    if (!file || !file.buffer) {
        throw new Error('Dosya içeriği bulunamadı');
    }

    const mimetype = file.mimetype || '';
    const originalname = file.originalname || '';
    const ext = originalname.split('.').pop()?.toLowerCase() || '';

    // PDF
    if (mimetype === 'application/pdf' || ext === 'pdf') {
        try {
            const pdf = require('pdf-parse');
            const data = await pdf(file.buffer);
            return data.text || '';
        } catch (err) {
            console.error('PDF parsing error:', err);
            throw new Error('PDF dosyası okunamadı: ' + (err.message || 'pdf-parse modülü eksik'));
        }
    }

    // Word (.docx)
    if (
        mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        ext === 'docx'
    ) {
        try {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            return result.value || '';
        } catch (err) {
            console.error('Word parsing error:', err);
            throw new Error('Word belgesi okunamadı: ' + (err.message || 'mammoth modülü eksik'));
        }
    }

    // CSV (Plain text)
    if (ext === 'csv') {
        return file.buffer.toString('utf-8');
    }

    // Excel (.xlsx, .xls)
    if (
        mimetype.includes('spreadsheet') ||
        mimetype.includes('excel') ||
        ['xlsx', 'xls'].includes(ext)
    ) {
        try {
            const xlsx = require('xlsx');
            const workbook = xlsx.read(file.buffer, { type: 'buffer' });
            let textParts = [];
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const csv = xlsx.utils.sheet_to_csv(sheet);
                textParts.push(`--- Sayfa: ${sheetName} ---\n${csv}`);
            }
            return textParts.join('\n\n');
        } catch (err) {
            console.error('Excel parsing error:', err);
            throw new Error('Excel belgesi okunamadı: ' + (err.message || 'xlsx paketi kurulu değil'));
        }
    }

    // Plain text, Markdown, JSON, HTML
    return file.buffer.toString('utf-8');
}

// Scrape text content from URL
// ── Tek sayfanın metnini çıkar ───────────────────────────────────
function htmlToText(html) {
    return String(html)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#8211;/g, '-')
        .replace(/&#8220;|&#8221;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

const fetchPage = async (pageUrl, timeout = 12000) => {
    const res = await axios.get(pageUrl, {
        timeout,
        maxRedirects: 5,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    return String(res.data);
};

// Hangi alt sayfalar işe yarar? Fiyat/hizmet sayfaları en değerlisi —
// firma bilgileri ana sayfada olsa da ürün ve fiyatlar neredeyse her zaman
// ayrı bir sayfada duruyor (örn. /fiyat-listesi/).
const LINK_HINTS = [
    { score: 10, words: ['fiyat', 'price', 'tarife', 'ucret', 'ücret'] },
    { score: 8,  words: ['hizmet', 'service', 'urun', 'ürün', 'product', 'paket'] },
    { score: 5,  words: ['hakkimizda', 'hakkında', 'about', 'kurumsal'] },
    { score: 5,  words: ['iletisim', 'iletişim', 'contact'] },
    { score: 4,  words: ['sss', 'faq', 'sorular'] },
    { score: 3,  words: ['sube', 'şube', 'branch', 'magaza', 'mağaza'] }
];

const SKIP_EXT = /\.(jpg|jpeg|png|gif|webp|svg|css|js|zip|rar|mp4|mp3|avi|woff2?|ttf|ico)($|\?)/i;

function collectInternalLinks(html, baseUrl) {
    const base = new URL(baseUrl);
    const found = new Map(); // url -> skor

    const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRe.exec(html)) !== null) {
        const href = m[1];
        const anchorText = htmlToText(m[2]).toLowerCase();
        if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;

        let abs;
        try { abs = new URL(href, base); } catch { continue; }
        if (abs.origin !== base.origin) continue;         // sadece aynı site
        if (SKIP_EXT.test(abs.pathname)) continue;

        abs.hash = '';
        const key = abs.toString().replace(/\/$/, '');
        const haystack = (abs.pathname + ' ' + anchorText).toLowerCase();

        let score = 0;
        for (const hint of LINK_HINTS) {
            if (hint.words.some(w => haystack.includes(w))) score = Math.max(score, hint.score);
        }
        if (score === 0) continue;
        if (!found.has(key) || found.get(key) < score) found.set(key, score);
    }

    return [...found.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([u]) => u);
}

/**
 * Web sitesini tarar. Verilen sayfayı okur, ardından fiyat/hizmet/iletişim
 * gibi işe yarar alt sayfaları da çeker ve hepsini birleştirir.
 *
 * Tek sayfa taranıyordu: ana sayfada adres ve telefon bulunuyor ama ürün ve
 * fiyatlar ayrı sayfada olduğu için hiç gelmiyordu.
 */
export async function scrapeUrlText(url, opts = {}) {
    const maxExtraPages = opts.maxExtraPages ?? 5;
    const maxChars = opts.maxChars ?? 45000;
    const maxCharsPerPage = opts.maxCharsPerPage ?? 15000;

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }

    const rootHtml = await fetchPage(targetUrl);
    const parts = [`--- SAYFA: ${targetUrl} ---\n${htmlToText(rootHtml).substring(0, maxCharsPerPage)}`];

    // Alt sayfalar — başarısız olanlar sessizce atlanır, tarama yine de sonuç verir
    try {
        const startKey = targetUrl.replace(/\/$/, '');
        const candidates = collectInternalLinks(rootHtml, targetUrl)
            .filter(u => u !== startKey)
            .slice(0, maxExtraPages);

        if (candidates.length) {
            console.log(`🔎 [AI Setup] ${candidates.length} alt sayfa taranıyor: ${candidates.join(', ')}`);
            // SIRAYLA çekiyoruz. Paralel denendi: aynı anda 5 istek atılınca
            // sitenin tamamı zaman aşımına uğradı (tek istek 2sn sürerken),
            // paylaşımlı hosting eşzamanlı isteklerde boğuluyor.
            const deadline = Date.now() + (opts.budgetMs ?? 20000);
            for (const pageUrl of candidates) {
                if (Date.now() > deadline) {
                    console.warn('⏱️ [AI Setup] Süre bütçesi doldu, kalan sayfalar atlandı');
                    break;
                }
                try {
                    const text = htmlToText(await fetchPage(pageUrl, 8000));
                    if (text.length > 50) {
                        parts.push(`--- SAYFA: ${pageUrl} ---\n${text.substring(0, maxCharsPerPage)}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ [AI Setup] Alt sayfa okunamadı: ${pageUrl} (${e.message})`);
                }
            }
        }
    } catch (err) {
        console.warn('⚠️ [AI Setup] Alt sayfa taraması atlandı:', err.message);
    }

    const combined = parts.join('\n\n');
    console.log(`📄 [AI Setup] Toplam ${parts.length} sayfa, ${combined.length} karakter metin toplandı`);
    return combined.substring(0, maxChars);
}

// Prompt for Gemini to parse corporate document
const EXTRACTION_SYSTEM_PROMPT = `Sen kurumsal bir işletme analiz uzmanısın.
Sana verilen şirket dokümanını veya web sitesi metnini derinlemesine incele ve aşağıdaki JSON şemasına BİREBİR UYGUN geçerli bir JSON çıktısı üret.

Yanıtın SADECE geçerli bir JSON nesnesi olmalı, markdown backtick (\`\`\`json ...) veya başka metin içermemelidir.

JSON Şeması:
{
  "company": {
    "name": "Firma Adı",
    "founder": "Kurucu / Sahibi (varsa)",
    "description": "Firma hakkında 1-2 paragraflık kurumsal özet ve uzmanlık alanları",
    "phone": "Telefon numarası",
    "email": "E-posta adresi",
    "website": "Web sitesi linki",
    "address": "Açık merkez adres",
    "googleMapsUrl": "Google Maps harita linki (varsa)",
    "businessAreas": ["Faaliyet Alanı 1", "Faaliyet Alanı 2"],
    "serviceRegions": ["İstanbul / Kadıköy", "Ankara"],
    "workingHoursSummary": "Hafta içi 09:00 - 18:00, Cumartesi 10:00 - 15:00",
    "closedOnPublicHolidays": true
  },
  "weeklySchedule": [
    { "day": 0, "label": "Pazartesi", "enabled": true, "start": "09:00", "end": "18:00" },
    { "day": 1, "label": "Salı", "enabled": true, "start": "09:00", "end": "18:00" },
    { "day": 2, "label": "Çarşamba", "enabled": true, "start": "09:00", "end": "18:00" },
    { "day": 3, "label": "Perşembe", "enabled": true, "start": "09:00", "end": "18:00" },
    { "day": 4, "label": "Cuma", "enabled": true, "start": "09:00", "end": "18:00" },
    { "day": 5, "label": "Cumartesi", "enabled": false, "start": "09:00", "end": "18:00" },
    { "day": 6, "label": "Pazar", "enabled": false, "start": "09:00", "end": "18:00" }
  ],
  "branches": [
    { "name": "Şube Adı", "address": "Şube Adresi", "phone": "Şube Telefonu" }
  ],
  "categories": [
    { "name": "Kategori / Hizmet Grubu Adı", "description": "Kısa açıklama" }
  ],
  "products": [
    { "name": "Ürün veya Hizmet Adı", "price": 1000, "description": "Detaylı açıklama", "categoryName": "Ait olduğu kategori adı" }
  ],
  "resources": [
    { "name": "Doktor / Uzman / Personel Adı", "title": "Unvanı (Örn: Uzm. Dr., Baş Antrenör)", "specialty": "Uzmanlık Alanı / Branşı", "phone": "", "email": "" }
  ],
  "faq": [
    { "question": "Sıkça sorulan soru", "answer": "Cevap" }
  ]
}

ÖNEMLİ KURALLAR:
1. Metinde net olarak bulunmayan alanları boş bırakabilirsin ("" veya boş dizi []), ancak şema yapısını bozma.
2. Doktor, hekim, uzman, danışman veya personel isimleri metinde geçiyorsa mutlaka "resources" listesine ekle.
3. Ürün, hizmet, tedavi veya paket isimleri ve fiyatları geçiyorsa "products" listesine ekle. Fiyat yoksa price: 0 yaz.
4. Şube, klinik veya lokasyon isimleri geçiyorsa "branches" listesine ekle.
5. Çalışma gün ve saatleri belirtilmişse weeklySchedule içinde günleri enabled: true/false ve saatlerini uyarla.
6. Sadece saf JSON döndür.`;

/**
 * Parses an uploaded file and returns structured setup data.
 * POST /api/workspaces/:workspaceId/ai-setup/parse-file
 */
export const parseDocumentAndExtractSetup = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Lütfen yüklenecek bir dosya seçin (PDF, Word, Excel, vb.)' });
        }

        console.log(`🪄 [AI Setup] Parsing file: ${file.originalname} (${file.size} bytes) for workspace ${workspaceId}`);
        const extractedText = await extractTextFromFile(file);

        if (!extractedText || extractedText.trim().length < 20) {
            return res.status(400).json({ error: 'Dosyadan yeterli metin çıkarılamadı. Lütfen metin içeren bir dosya yükleyin.' });
        }

        const apiKey = await getAiApiKey(workspaceId);
        if (!apiKey) {
            return res.status(400).json({ error: 'Sistemde geçerli bir AI API anahtarı (Gemini) yapılandırılmamış.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            // JSON modu: model zaten saf JSON döndürür. Öncesinde yanıt ```json
            // çitleriyle geliyordu ve model araya bir cümle eklediğinde
            // JSON.parse patlayıp tüm işlem 500 ile düşüyordu.
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        });

        const prompt = `${EXTRACTION_SYSTEM_PROMPT}\n\n--- İNCELENECEK BELGE METNİ ---\n${extractedText.substring(0, 35000)}`;

        const result = await model.generateContent(prompt);
        let rawResponse = result.response.text().trim();

        // Clean possible markdown code fences
        if (rawResponse.startsWith('```')) {
            rawResponse = rawResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        }

        let parsedJson;
        try {
            parsedJson = JSON.parse(rawResponse);
        } catch (jsonErr) {
            console.error('Failed to parse Gemini response as JSON:', rawResponse.substring(0, 300));
            return res.status(500).json({ error: 'AI çıktısı geçerli JSON formatına dönüştürülemedi.', raw: rawResponse });
        }

        res.json({
            success: true,
            filename: file.originalname,
            charCount: extractedText.length,
            data: parsedJson
        });
    } catch (error) {
        console.error('parseDocumentAndExtractSetup error:', error);
        res.status(500).json({ error: 'Belge analizi sırasında hata oluştu: ' + error.message });
    }
};

/**
 * Scrapes a URL and extracts structured setup data.
 * POST /api/workspaces/:workspaceId/ai-setup/parse-url
 */
export const parseUrlAndExtractSetup = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'Lütfen taranacak web sitesi adresini girin' });
        }

        console.log(`🪄 [AI Setup] Scraping URL: ${url} for workspace ${workspaceId}`);
        const scrapedText = await scrapeUrlText(url);

        if (!scrapedText || scrapedText.trim().length < 30) {
            return res.status(400).json({ error: 'Web sayfasından içerik çekilemedi.' });
        }

        const apiKey = await getAiApiKey(workspaceId);
        if (!apiKey) {
            return res.status(400).json({ error: 'Sistemde geçerli bir AI API anahtarı (Gemini) yapılandırılmamış.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            // JSON modu: model zaten saf JSON döndürür. Öncesinde yanıt ```json
            // çitleriyle geliyordu ve model araya bir cümle eklediğinde
            // JSON.parse patlayıp tüm işlem 500 ile düşüyordu.
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        });

        const prompt = `${EXTRACTION_SYSTEM_PROMPT}\n\n--- İNCELENECEK WEB SİTESİ METNİ (${url}) ---\n${scrapedText}`;

        const result = await model.generateContent(prompt);
        let rawResponse = result.response.text().trim();

        if (rawResponse.startsWith('```')) {
            rawResponse = rawResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        }

        const parsedJson = JSON.parse(rawResponse);

        // Auto-inject URL into company website if missing
        if (!parsedJson.company) parsedJson.company = {};
        if (!parsedJson.company.website) parsedJson.company.website = url;

        res.json({
            success: true,
            url,
            data: parsedJson
        });
    } catch (error) {
        console.error('parseUrlAndExtractSetup error:', error);
        res.status(500).json({ error: 'Web sitesi analizi sırasında hata: ' + error.message });
    }
};

/**
 * Applies the structured setup data directly into workspace database tables.
 * POST /api/workspaces/:workspaceId/ai-setup/apply
 */
export const applyParsedSetupToWorkspace = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { company, weeklySchedule, branches, categories, products, resources, faq } = req.body;

        const results = {
            companyUpdated: false,
            branchesCreated: 0,
            categoriesCreated: 0,
            productsCreated: 0,
            resourcesCreated: 0,
            faqCreated: 0
        };

        // 1. Update Company Information & Working Schedule
        if (company) {
            const updatePayload = {};
            if (company.name) updatePayload.companyName = company.name;
            if (company.founder) updatePayload.founder = company.founder;
            if (company.description) updatePayload.companyDescription = company.description;
            if (company.phone) updatePayload.companyPhone = company.phone;
            if (company.email) updatePayload.companyEmail = company.email;
            if (company.website) updatePayload.companyWebsite = company.website;
            if (company.address) updatePayload.companyAddress = company.address;
            if (company.googleMapsUrl) updatePayload.googleMapsUrl = company.googleMapsUrl;
            if (Array.isArray(company.businessAreas)) {
                updatePayload.businessAreas = JSON.stringify(company.businessAreas);
            }
            if (Array.isArray(company.serviceRegions)) {
                updatePayload.serviceRegions = JSON.stringify(company.serviceRegions);
            }
            if (company.workingHoursSummary) {
                updatePayload.companyWorkingHours = company.workingHoursSummary;
            }
            if (Array.isArray(weeklySchedule) && weeklySchedule.length > 0) {
                updatePayload.companyWeeklySchedule = weeklySchedule;
            }

            await prisma.workspace.update({
                where: { id: workspaceId },
                data: updatePayload
            });
            results.companyUpdated = true;
        }

        // 2. Create Branches
        if (Array.isArray(branches) && branches.length > 0) {
            for (const b of branches) {
                if (!b.name) continue;
                const existing = await prisma.appointmentBranch.findFirst({
                    where: { workspaceId, name: b.name }
                });
                if (!existing) {
                    await prisma.appointmentBranch.create({
                        data: {
                            workspaceId,
                            name: b.name,
                            address: b.address || '',
                            phone: b.phone || '',
                            isActive: true
                        }
                    });
                    results.branchesCreated++;
                }
            }
        }

        // 3. Create Categories (topicCategory)
        const categoryMap = {}; // name -> id
        if (Array.isArray(categories) && categories.length > 0) {
            for (const c of categories) {
                if (!c.name) continue;
                let cat = await prisma.topicCategory.findFirst({
                    where: { workspaceId, name: c.name }
                });
                if (!cat) {
                    cat = await prisma.topicCategory.create({
                        data: {
                            workspaceId,
                            name: c.name,
                            description: c.description || '',
                            isActive: true
                        }
                    });
                    results.categoriesCreated++;
                }
                categoryMap[c.name.toLowerCase()] = cat.id;
            }
        }

        // 4. Create Products & Services
        if (Array.isArray(products) && products.length > 0) {
            for (const p of products) {
                if (!p.name) continue;
                const existing = await prisma.product.findFirst({
                    where: { workspaceId, name: p.name }
                });
                if (!existing) {
                    const matchedCatId = p.categoryName ? categoryMap[p.categoryName.toLowerCase()] : null;
                    await prisma.product.create({
                        data: {
                            workspaceId,
                            name: p.name,
                            price: typeof p.price === 'number' ? p.price : 0,
                            description: p.description || '',
                            isActive: true,
                            ...(matchedCatId && { categoryId: matchedCatId })
                        }
                    });
                    results.productsCreated++;
                }
            }
        }

        // 5. Create Resources / Doctors / Experts
        if (Array.isArray(resources) && resources.length > 0) {
            for (const r of resources) {
                if (!r.name) continue;
                const existing = await prisma.calendarResource.findFirst({
                    where: { workspaceId, name: r.name }
                });
                if (!existing) {
                    await prisma.calendarResource.create({
                        data: {
                            workspaceId,
                            name: r.name,
                            title: r.title || r.specialty || 'Uzman',
                            type: 'PERSON',
                            capacity: 1,
                            isActive: true
                        }
                    });
                    results.resourcesCreated++;
                }
            }
        }

        // 6. Create FAQs into KnowledgeBase
        if (Array.isArray(faq) && faq.length > 0) {
            for (const f of faq) {
                if (!f.question || !f.answer) continue;
                const existing = await prisma.knowledgeBase.findFirst({
                    where: { workspaceId, title: f.question }
                });
                if (!existing) {
                    await prisma.knowledgeBase.create({
                        data: {
                            workspaceId,
                            title: f.question,
                            content: f.answer,
                            sourceType: 'MANUAL',
                            lastSyncedAt: new Date()
                        }
                    });
                    results.faqCreated++;
                }
            }
        }

        res.json({
            success: true,
            message: 'Ayrıştırılan tüm kurumsal veriler başarıyla kaydedildi!',
            results
        });
    } catch (error) {
        console.error('applyParsedSetupToWorkspace error:', error);
        res.status(500).json({ error: 'Veriler uygulanırken hata oluştu: ' + error.message });
    }
};

/**
 * Natural language update assistant:
 * Allows user to type or speak: "Kadıköy şubesi eklendi, Dr. Mehmet Salı çalışmıyor..."
 * POST /api/workspaces/:workspaceId/ai-setup/instruct
 */
export const updateKnowledgeBaseViaPrompt = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { instruction } = req.body;

        if (!instruction || !instruction.trim()) {
            return res.status(400).json({ error: 'Lütfen güncelleme talimatınızı girin' });
        }

        const apiKey = await getAiApiKey(workspaceId);
        if (!apiKey) {
            return res.status(400).json({ error: 'Sistemde geçerli bir AI API anahtarı bulunamadı.' });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                companyName: true,
                companyAddress: true,
                companyPhone: true,
                companyWebsite: true,
                companyWorkingHours: true
            }
        });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            // JSON modu: model zaten saf JSON döndürür. Öncesinde yanıt ```json
            // çitleriyle geliyordu ve model araya bir cümle eklediğinde
            // JSON.parse patlayıp tüm işlem 500 ile düşüyordu.
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        });

        const prompt = `Sen kurumsal veri tabanı güncelleme asistanısın.
Kullanıcı işletmesi hakkında bir güncelleme talimatı verdi:
"${instruction}"

İşletmenin mevcut bilgileri:
- Ad: ${workspace?.companyName || ''}
- Adres: ${workspace?.companyAddress || ''}
- Telefon: ${workspace?.companyPhone || ''}
- Çalışma Saatleri: ${workspace?.companyWorkingHours || ''}

Bu talimatı analiz et ve aşağıdaki JSON çıktısını üret. SADECE JSON DÖNDÜR:
{
  "actionSummary": "Kullanıcıya yapılacak işlemi anlatan 1 cümlelik Türkçe açıklama",
  "updates": {
    "company": { ...güncellenecek alanlar (örn: companyPhone, companyAddress, companyWorkingHours)... },
    "newBranch": { "name": "...", "address": "...", "phone": "..." } veya null,
    "newProduct": { "name": "...", "price": 0, "description": "..." } veya null,
    "newResource": { "name": "...", "title": "..." } veya null,
    "faqEntry": { "question": "...", "answer": "..." } veya null
  }
}`;

        const result = await model.generateContent(prompt);
        let raw = result.response.text().trim();
        if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        }

        const parsed = JSON.parse(raw);

        // Apply updates if present
        if (parsed.updates?.company && Object.keys(parsed.updates.company).length > 0) {
            await prisma.workspace.update({
                where: { id: workspaceId },
                data: parsed.updates.company
            });
        }
        if (parsed.updates?.newBranch?.name) {
            await prisma.appointmentBranch.create({
                data: {
                    workspaceId,
                    name: parsed.updates.newBranch.name,
                    address: parsed.updates.newBranch.address || '',
                    phone: parsed.updates.newBranch.phone || '',
                    isActive: true
                }
            });
        }
        if (parsed.updates?.newResource?.name) {
            await prisma.calendarResource.create({
                data: {
                    workspaceId,
                    name: parsed.updates.newResource.name,
                    title: parsed.updates.newResource.title || 'Uzman',
                    type: 'PERSON',
                    isActive: true
                }
            });
        }
        if (parsed.updates?.newProduct?.name) {
            await prisma.product.create({
                data: {
                    workspaceId,
                    name: parsed.updates.newProduct.name,
                    price: parsed.updates.newProduct.price || 0,
                    description: parsed.updates.newProduct.description || '',
                    isActive: true
                }
            });
        }
        if (parsed.updates?.faqEntry?.question) {
            await prisma.knowledgeBase.create({
                data: {
                    workspaceId,
                    title: parsed.updates.faqEntry.question,
                    content: parsed.updates.faqEntry.answer || '',
                    sourceType: 'MANUAL',
                    lastSyncedAt: new Date()
                }
            });
        }

        res.json({
            success: true,
            message: parsed.actionSummary || 'Bilgi Bankası başarıyla güncellendi.',
            data: parsed
        });
    } catch (error) {
        console.error('updateKnowledgeBaseViaPrompt error:', error);
        res.status(500).json({ error: 'Talimat işlenirken hata: ' + error.message });
    }
};
