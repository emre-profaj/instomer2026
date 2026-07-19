import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();

// ─── CRUD ─────────────────────────────────────────────────

export const getCategories = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const categories = await prisma.topicCategory.findMany({
            where: { workspaceId },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
            include: {
                _count: { select: { conversations: true } }
            }
        });
        res.json(categories);
    } catch (error) {
        console.error('getCategories error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const createCategory = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, description, icon, color, keywords } = req.body;

        const category = await prisma.topicCategory.create({
            data: {
                workspaceId,
                name,
                description: description || null,
                icon: icon || null,
                color: color || '#6b7280',
                keywords: keywords ? JSON.stringify(keywords) : null,
            }
        });
        res.status(201).json(category);
    } catch (error) {
        console.error('createCategory error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const updateCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { name, description, icon, color, keywords, isActive } = req.body;

        const data = {};
        if (name !== undefined) data.name = name;
        if (description !== undefined) data.description = description;
        if (icon !== undefined) data.icon = icon;
        if (color !== undefined) data.color = color;
        if (keywords !== undefined) data.keywords = JSON.stringify(keywords);
        if (isActive !== undefined) data.isActive = isActive;

        const category = await prisma.topicCategory.update({
            where: { id: categoryId },
            data
        });
        res.json(category);
    } catch (error) {
        console.error('updateCategory error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        // Conversations with this category will have topicCategoryId set to null (onDelete: SetNull)
        await prisma.topicCategory.delete({ where: { id: categoryId } });
        res.json({ success: true });
    } catch (error) {
        console.error('deleteCategory error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const reorderCategories = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { orderedIds } = req.body; // ["cat_id_1", "cat_id_2", ...]

        const updates = orderedIds.map((id, index) =>
            prisma.topicCategory.update({ where: { id }, data: { order: index } })
        );
        await prisma.$transaction(updates);
        res.json({ success: true });
    } catch (error) {
        console.error('reorderCategories error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ─── AI OTOMATİK KATEGORİ OLUŞTURMA ─────────────────────────

export const autoGenerateCategories = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { source } = req.body; // 'products' | 'ai' | undefined (auto-detect)

        // Mevcut kategorileri kontrol et (duplicate önleme)
        const existingCategories = await prisma.topicCategory.findMany({
            where: { workspaceId },
            select: { name: true }
        });
        const existingNames = new Set(existingCategories.map(c => c.name.toLowerCase()));

        // ─── KAYNAK 1: ÜRÜN TABLOSU ───────────────────────
        const products = await prisma.product.findMany({
            where: { workspaceId, isActive: true },
            select: { name: true, description: true, groupName: true },
            orderBy: { name: 'asc' }
        });

        if (products.length > 0 && source !== 'ai') {
            // Ürünleri groupName'e göre grupla
            const groups = new Map(); // groupName → { products[], descriptions[] }
            for (const p of products) {
                const group = (p.groupName || '').trim() || p.name.trim();
                if (!groups.has(group)) {
                    groups.set(group, { products: [], descriptions: [] });
                }
                groups.get(group).products.push(p.name);
                if (p.description) groups.get(group).descriptions.push(p.description);
            }

            console.log(`📦 [AutoGenerate] ${workspaceId}: ${products.length} üründen ${groups.size} kategori oluşturuluyor...`);

            const created = [];
            const errors = [];
            let order = existingCategories.length;
            for (const [groupName, data] of groups) {
                if (existingNames.has(groupName.toLowerCase())) continue;

                // Ürün isimlerini keyword olarak kullan
                const keywords = data.products
                    .map(name => name.toLowerCase().trim())
                    .filter((v, i, a) => a.indexOf(v) === i); // unique

                const description = data.descriptions.length > 0
                    ? data.descriptions[0]
                    : `${data.products.slice(0, 3).join(', ')}${data.products.length > 3 ? ` ve ${data.products.length - 3} ürün daha` : ''}`;

                try {
                    const newCat = await prisma.topicCategory.create({
                        data: {
                            workspaceId,
                            name: groupName,
                            description,
                            icon: getCategoryIcon(groupName),
                            color: getColorForIndex(order),
                            keywords: JSON.stringify(keywords),
                            order: order++,
                        }
                    });
                    created.push(newCat);
                } catch (err) {
                    console.error(`Category create error for "${groupName}":`, err.message);
                    errors.push({ name: groupName, error: err.message });
                }
            }

            console.log(`✅ [AutoGenerate] ${created.length} kategori ürünlerden oluşturuldu, ${errors.length} hata`);

            return res.json({
                success: true,
                source: 'products',
                totalProducts: products.length,
                totalGroups: groups.size,
                created: created.length,
                skipped: groups.size - created.length,
                categories: created,
                errors
            });
        }

        // ─── KAYNAK 2: AI (Bilgi Bankası + Mevcut Topicler) ───────
        // Ürün yoksa veya source='ai' ise

        // 1. Bilgi bankasını çek
        const kbEntries = await prisma.knowledgeBase.findMany({
            where: { workspaceId },
            select: { title: true, content: true }
        });
        const kbText = kbEntries.map(kb => `### ${kb.title}\n${kb.content}`).join('\n\n');

        // 2. Mevcut tüm aiTopic değerlerini ve sayılarını çek
        const topicCounts = await prisma.conversation.groupBy({
            by: ['aiTopic'],
            where: {
                workspaceId,
                aiTopic: { not: null }
            },
            _count: true,
            orderBy: { _count: { aiTopic: 'desc' } }
        });

        const topicsWithCounts = topicCounts
            .filter(t => t.aiTopic)
            .map(t => `${t.aiTopic} (${t._count} kez)`);

        // 3. Workspace bilgisi
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                companyName: true,
                companyDescription: true
            }
        });

        // 4. AI'a gönder
        const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
        if (!apiKey) {
            return res.status(400).json({ error: 'AI API key bulunamadı' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Ürün bilgisini de prompt'a ekle (varsa ama az ise)
        const productInfo = products.length > 0
            ? `\n## Ürünler/Hizmetler (${products.length} adet)\n${products.map(p => `- ${p.name}${p.groupName ? ` (${p.groupName})` : ''}`).join('\n')}\n`
            : '';

        const prompt = `Sen bir CRM uzmanısın. Aşağıdaki bilgileri kullanarak bu işletme için KONU KATEGORİLERİ oluştur.

## İşletme Bilgisi
Firma: ${workspace?.companyName || 'Bilinmiyor'}
Açıklama: ${workspace?.companyDescription || ''}
${productInfo}
## Bilgi Bankası İçeriği
${kbText || '(Bilgi bankası boş)'}

## Mevcut Konuşma Konuları (toplam ${topicsWithCounts.length} farklı konu)
${topicsWithCounts.slice(0, 300).join('\n')}
${topicsWithCounts.length > 300 ? `\n... ve ${topicsWithCounts.length - 300} konu daha` : ''}

## GÖREVİN
1. Yukarıdaki TÜM konuları anlamlı kategorilere grupla
2. Maksimum 30-50 kategori oluştur (çok fazla olmasın)
3. Benzer konuları birleştir (örn: "obezite ameliyatı", "mide küçültme", "sleeve gastrektomi" → "Obezite Cerrahisi")
4. Her kategoriye anahtar kelimeler ekle
5. Her kategoriye kısa açıklama yaz

## ÇIKTI FORMATI (JSON dizisi döndür, başka metin ekleme)
[
  {
    "name": "Obezite Cerrahisi",
    "description": "Obezite ameliyatı, tüp mide, sleeve gastrektomi talepleri",
    "icon": "🏥",
    "keywords": ["obezite", "mide küçültme", "sleeve", "tüp mide", "bariatrik"]
  }
]

SADECE JSON dizisi döndür, başka metin ekleme.`;

        console.log(`🤖 [AutoGenerate] ${workspaceId}: ${topicsWithCounts.length} topic analiz ediliyor...`);

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        // JSON parse
        let categories;
        try {
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error('JSON dizisi bulunamadı');
            categories = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            console.error('AI response parse error:', parseErr.message);
            console.error('Response:', responseText.slice(0, 500));
            return res.status(500).json({
                error: 'AI yanıtı parse edilemedi',
                rawResponse: responseText.slice(0, 1000)
            });
        }

        if (!Array.isArray(categories) || categories.length === 0) {
            return res.status(400).json({ error: 'AI kategori oluşturamadı' });
        }

        // Yeni kategorileri oluştur
        const created = [];
        const errors = [];
        for (let i = 0; i < categories.length; i++) {
            const cat = categories[i];
            if (!cat.name) continue;
            if (existingNames.has(cat.name.toLowerCase())) continue;

            try {
                const newCat = await prisma.topicCategory.create({
                    data: {
                        workspaceId,
                        name: cat.name,
                        description: cat.description || null,
                        icon: cat.icon || null,
                        color: getColorForIndex(i),
                        keywords: cat.keywords ? JSON.stringify(cat.keywords) : null,
                        order: i,
                    }
                });
                created.push(newCat);
            } catch (err) {
                console.error(`Category create error for "${cat.name}":`, err.message);
                errors.push({ name: cat.name, error: err.message });
            }
        }

        console.log(`✅ [AutoGenerate] ${created.length} kategori AI ile oluşturuldu, ${errors.length} hata`);



        res.json({
            success: true,
            totalSuggested: categories.length,
            created: created.length,
            skipped: categories.length - created.length,
            categories: created,
            errors
        });
    } catch (error) {
        console.error('autoGenerateCategories error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ─── MEVCut KONUŞMALARI KATEGORİLERE EŞLESTİRME ─────────

export const backfillConversations = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // 1. Workspace'in kategorilerini çek
        const categories = await prisma.topicCategory.findMany({
            where: { workspaceId, isActive: true },
            select: { id: true, name: true, keywords: true, description: true }
        });

        if (categories.length === 0) {
            return res.status(400).json({ error: 'Önce kategorileri oluşturun' });
        }

        // 2. Kategori lookup map oluştur (keyword → categoryId)
        const keywordMap = new Map(); // keyword → categoryId
        for (const cat of categories) {
            const keywords = cat.keywords ? JSON.parse(cat.keywords) : [];
            // Kategori ismini de keyword olarak ekle
            const allKeywords = [...keywords, cat.name.toLowerCase()];
            for (const kw of allKeywords) {
                keywordMap.set(kw.toLowerCase().trim(), cat.id);
            }
        }

        // 3. Kategorisiz konuşmaları çek
        const conversations = await prisma.conversation.findMany({
            where: {
                workspaceId,
                aiTopic: { not: null },
                topicCategoryId: null // Henüz kategorisi olmayanlar
            },
            select: { id: true, aiTopic: true }
        });

        console.log(`🔄 [Backfill] ${conversations.length} konuşma kategorilere eşleştirilecek...`);

        // 4. Her konuşma için en uygun kategoriyi bul
        let matched = 0;
        let unmatched = 0;
        const batchSize = 100;

        for (let i = 0; i < conversations.length; i += batchSize) {
            const batch = conversations.slice(i, i + batchSize);
            const updates = [];

            for (const conv of batch) {
                const topic = (conv.aiTopic || '').toLowerCase().trim();
                let bestMatch = null;
                let bestScore = 0;

                for (const [keyword, catId] of keywordMap) {
                    if (topic.includes(keyword)) {
                        // Longer keyword match = better score
                        const score = keyword.length;
                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = catId;
                        }
                    }
                }

                if (bestMatch) {
                    updates.push(
                        prisma.conversation.update({
                            where: { id: conv.id },
                            data: { topicCategoryId: bestMatch }
                        })
                    );
                    matched++;
                } else {
                    unmatched++;
                }
            }

            if (updates.length > 0) {
                await prisma.$transaction(updates);
            }
        }

        // 5. Eşleşmeyen konuşmalar için AI batch
        if (unmatched > 0) {
            console.log(`⚠️ [Backfill] ${unmatched} konuşma keyword ile eşleşmedi — AI ile eşleştirilecek`);
            // AI backfill arka planda çalışabilir — şimdilik skip
        }

        console.log(`✅ [Backfill] ${matched} konuşma eşleştirildi, ${unmatched} eşleşmedi`);

        res.json({
            success: true,
            total: conversations.length,
            matched,
            unmatched
        });
    } catch (error) {
        console.error('backfillConversations error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ─── HELPERS ─────────────────────────────────────────────

const CATEGORY_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#e11d48', '#0ea5e9', '#d946ef', '#facc15',
    '#22c55e', '#a855f7', '#f43f5e', '#2dd4bf', '#fb923c'
];

function getColorForIndex(i) {
    return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
}

function getCategoryIcon(name) {
    const n = (name || '').toLowerCase();
    const iconMap = [
        [['proje', 'konut', 'daire', 'villa', 'residence', 'site'], '🏗️'],
        [['obezite', 'ameliyat', 'cerrahi', 'operasyon'], '🏥'],
        [['diş', 'dental', 'implant'], '🦷'],
        [['göz', 'laser', 'lasik'], '👁️'],
        [['estetik', 'botoks', 'dolgu'], '💉'],
        [['saç', 'ekimi', 'saç ekimi'], '💇'],
        [['araba', 'araç', 'otomobil'], '🚗'],
        [['eğitim', 'kurs', 'öğren'], '📚'],
        [['hukuk', 'avukat', 'dava'], '⚖️'],
        [['sigorta', 'poliçe'], '🛡️'],
        [['otel', 'konaklama', 'tatil'], '🏨'],
        [['restoran', 'yemek', 'cafe'], '🍽️'],
    ];
    for (const [keywords, icon] of iconMap) {
        if (keywords.some(k => n.includes(k))) return icon;
    }
    return '📋';
}
