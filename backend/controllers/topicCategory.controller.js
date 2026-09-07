import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../lib/prisma.js';

// AI API key alma (workspace key > global key > env key)
const getEffectiveAiApiKey = async (workspaceId) => {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { aiApiKey: true }
    });
    if (workspace?.aiApiKey) return workspace.aiApiKey;

    const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'singleton' }
    });
    return globalSettings?.globalAiApiKey || process.env.GEMINI_API_KEY || null;
};

// ─── CRUD ─────────────────────────────────────────────────

export const getCategories = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        
        const where = { workspaceId };
        
        const categories = await prisma.topicCategory.findMany({
            where,
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
            include: {
                _count: { select: { conversations: true } },
                children: {
                    orderBy: [{ order: 'asc' }, { name: 'asc' }],
                    include: {
                        _count: { select: { conversations: true } },
                        products: { where: { isActive: true }, select: { id: true, name: true, price: true } }
                    }
                },
                products: { where: { isActive: true }, select: { id: true, name: true, price: true } }
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
        const { name, description, icon, color, keywords, parentId, isActive, caseTypeId, customFields, defaultFunnelId, defaultTeamId, branchId } = req.body;

        const category = await prisma.topicCategory.create({
            data: {
                workspaceId,
                name,
                description: description || null,
                icon: icon || null,
                color: color || '#6b7280',
                keywords: keywords ? JSON.stringify(keywords) : null,
                parentId: parentId || null,
                isActive: isActive ?? true,
                caseTypeId: caseTypeId || null,
                customFields: customFields ? JSON.stringify(customFields) : null,
                defaultFunnelId: defaultFunnelId || null,
                defaultTeamId: defaultTeamId || null,
                branchId: branchId || null
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
        const { name, description, icon, color, keywords, isActive, parentId, caseTypeId, customFields, defaultFunnelId, defaultTeamId, branchId } = req.body;

        const data = {};
        if (name !== undefined) data.name = name;
        if (description !== undefined) data.description = description;
        if (icon !== undefined) data.icon = icon;
        if (color !== undefined) data.color = color;
        if (keywords !== undefined) data.keywords = JSON.stringify(keywords);
        if (isActive !== undefined) data.isActive = isActive;
        if (parentId !== undefined) data.parentId = parentId || null;
        if (caseTypeId !== undefined) data.caseTypeId = caseTypeId || null;
        if (customFields !== undefined) data.customFields = customFields ? JSON.stringify(customFields) : null;
        if (defaultFunnelId !== undefined) data.defaultFunnelId = defaultFunnelId || null;
        if (defaultTeamId !== undefined) data.defaultTeamId = defaultTeamId || null;
        if (branchId !== undefined) data.branchId = branchId || null;

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
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

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
        let categories = await prisma.topicCategory.findMany({
            where: { workspaceId, isActive: true },
            select: { id: true, name: true, keywords: true, description: true }
        });

        if (categories.length === 0) {
            return res.status(400).json({ error: 'Önce kategorileri oluşturun' });
        }

        // 2. Keyword lookup map
        const keywordMap = new Map();
        for (const cat of categories) {
            const keywords = cat.keywords ? JSON.parse(cat.keywords) : [];
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
                topicCategoryId: null
            },
            select: { id: true, aiTopic: true }
        });

        console.log(`🔄 [Backfill] ${conversations.length} konuşma kategorilere eşleştirilecek...`);

        // 4. Pass 1: Keyword eşleştirme
        let matched = 0;
        let unmatched = 0;
        const unmatchedConvs = [];
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
                    unmatchedConvs.push(conv);
                    unmatched++;
                }
            }

            if (updates.length > 0) {
                await prisma.$transaction(updates);
            }
        }

        console.log(`📊 [Backfill] Keyword: ${matched} eşleşti, ${unmatched} AI'a gidecek`);

        // 5. Pass 2: AI ile eşleştirme (eşleşmeyen konuşmalar)
        let aiMatched = 0;
        let newCategories = 0;

        if (unmatchedConvs.length > 0) {
            const aiApiKey = await getEffectiveAiApiKey(workspaceId);
            if (aiApiKey) {
                const genAI = new GoogleGenerativeAI(aiApiKey);
                const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

                // AI batch'leri (her seferde max 50 konuşma)
                const aiBatchSize = 50;
                for (let i = 0; i < unmatchedConvs.length; i += aiBatchSize) {
                    const aiBatch = unmatchedConvs.slice(i, i + aiBatchSize);

                    // Mevcut kategorileri yenile (yeni eklenmiş olabilir)
                    categories = await prisma.topicCategory.findMany({
                        where: { workspaceId, isActive: true },
                        select: { id: true, name: true }
                    });

                    const catListStr = categories.map(c => `${c.id}: ${c.name}`).join('\n');
                    const topicsList = aiBatch.map((c, idx) => `${idx}: "${c.aiTopic}"`).join('\n');

                    const prompt = `Bir hastane/işletmenin konuşma konularını kategorilere sınıflandır.

MEVCUT KATEGORİLER:
${catListStr}

SINIFLANDIRILACAK KONULAR:
${topicsList}

KURALLAR:
- Her konuyu mevcut bir kategoriye ata VEYA yeni kategori öner
- Şikayet, destek, bilgi talebi, randevu gibi konular için yeni kategori oluştur
- Benzer konuları aynı kategoriye ata
- Her konu için SADECE bir kategori seç

JSON formatında döndür:
{
  "assignments": [
    { "index": 0, "categoryId": "mevcut-id-buraya", "categoryName": null },
    { "index": 1, "categoryId": null, "categoryName": "Şikayet" }
  ]
}

Eğer categoryId null ise yeni kategori oluşturulacak. categoryName ile yeni kategori adı ver.
SADECE JSON döndür.`;

                    try {
                        const result = await model.generateContent(prompt);
                        const responseText = result.response.text().trim();
                        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                        if (!jsonMatch) continue;

                        const parsed = JSON.parse(jsonMatch[0]);
                        if (!parsed.assignments) continue;

                        // Yeni kategori cache'i (aynı batch'te aynı kategori birden fazla kez çıkabilir)
                        const newCatCache = new Map();

                        for (const assign of parsed.assignments) {
                            const conv = aiBatch[assign.index];
                            if (!conv) continue;

                            let targetCatId = assign.categoryId;

                            // Yeni kategori oluştur
                            if (!targetCatId && assign.categoryName) {
                                const catNameLower = assign.categoryName.toLowerCase().trim();

                                // Cache'te var mı?
                                if (newCatCache.has(catNameLower)) {
                                    targetCatId = newCatCache.get(catNameLower);
                                } else {
                                    // DB'de zaten var mı?
                                    const existing = categories.find(c => c.name.toLowerCase() === catNameLower);
                                    if (existing) {
                                        targetCatId = existing.id;
                                    } else {
                                        try {
                                            const newCat = await prisma.topicCategory.create({
                                                data: {
                                                    workspaceId,
                                                    name: assign.categoryName.trim(),
                                                    icon: getCategoryIcon(assign.categoryName),
                                                    color: getColorForIndex(categories.length + newCategories),
                                                    order: categories.length + newCategories,
                                                }
                                            });
                                            targetCatId = newCat.id;
                                            newCatCache.set(catNameLower, newCat.id);
                                            categories.push({ id: newCat.id, name: newCat.name });
                                            newCategories++;
                                            console.log(`🆕 [Backfill] Yeni kategori: ${newCat.name}`);
                                        } catch (err) {
                                            console.error(`Category create error: ${assign.categoryName}:`, err.message);
                                            continue;
                                        }
                                    }
                                }
                            }

                            // Konuşmayı kategoriye ata
                            if (targetCatId) {
                                try {
                                    await prisma.conversation.update({
                                        where: { id: conv.id },
                                        data: { topicCategoryId: targetCatId }
                                    });
                                    aiMatched++;
                                } catch (err) {
                                    // skip
                                }
                            }
                        }
                    } catch (aiErr) {
                        console.error(`AI batch error:`, aiErr.message);
                    }
                }
            }
        }

        const finalUnmatched = unmatched - aiMatched;
        console.log(`✅ [Backfill] Keyword: ${matched}, AI: ${aiMatched}, Yeni Kategori: ${newCategories}, Kalan: ${finalUnmatched}`);

        res.json({
            success: true,
            total: conversations.length,
            matched,
            aiMatched,
            newCategories,
            unmatched: finalUnmatched
        });
    } catch (error) {
        console.error('backfillConversations error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ─── KATEGORİ BİRLEŞTİRME ───────────────────────────────

export const mergeCategories = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { sourceIds, targetName } = req.body;

        if (!sourceIds || sourceIds.length < 2) {
            return res.status(400).json({ error: 'En az 2 kategori seçin' });
        }
        if (!targetName) {
            return res.status(400).json({ error: 'Hedef kategori adı gerekli' });
        }

        // Kaynak kategorileri çek
        const sourceCats = await prisma.topicCategory.findMany({
            where: { id: { in: sourceIds }, workspaceId }
        });

        if (sourceCats.length < 2) {
            return res.status(400).json({ error: 'Geçerli kategoriler bulunamadı' });
        }

        // Tüm keyword'leri birleştir
        let mergedKeywords = [];
        for (const cat of sourceCats) {
            if (cat.keywords) {
                try {
                    mergedKeywords = [...mergedKeywords, ...JSON.parse(cat.keywords)];
                } catch (e) {}
            }
            mergedKeywords.push(cat.name.toLowerCase());
        }
        mergedKeywords = [...new Set(mergedKeywords)];

        // Hedef kategoriyi oluştur veya güncelle
        const targetCat = await prisma.topicCategory.create({
            data: {
                workspaceId,
                name: targetName,
                icon: getCategoryIcon(targetName),
                color: sourceCats[0].color,
                keywords: JSON.stringify(mergedKeywords),
                description: sourceCats.map(c => c.name).join(', '),
                order: sourceCats[0].order,
            }
        });

        // Konuşmaları hedef kategoriye taşı
        const moveResult = await prisma.conversation.updateMany({
            where: {
                workspaceId,
                topicCategoryId: { in: sourceIds }
            },
            data: { topicCategoryId: targetCat.id }
        });

        // Kaynak kategorileri sil
        await prisma.topicCategory.deleteMany({
            where: { id: { in: sourceIds }, workspaceId }
        });

        console.log(`🔀 [Merge] ${sourceCats.length} kategori → "${targetName}" | ${moveResult.count} konuşma taşındı`);

        res.json({
            success: true,
            mergedCount: sourceCats.length,
            movedConversations: moveResult.count,
            newCategory: targetCat
        });
    } catch (error) {
        console.error('mergeCategories error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ─── AI İLE KATEGORİ SADELEŞTİRME ──────────────────────

export const simplifyCategories = async (req, res) => {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const { workspaceId } = req.params;

        send({ type: 'progress', message: '📋 Kategoriler yükleniyor...' });

        const categories = await prisma.topicCategory.findMany({
            where: { workspaceId },
            include: { _count: { select: { conversations: true } } }
        });

        if (categories.length < 3) {
            send({ type: 'error', message: 'Sadeleştirmek için en az 3 kategori gerekli' });
            return res.end();
        }

        send({ type: 'progress', message: `📊 ${categories.length} kategori bulundu. AI analiz ediyor...` });

        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            send({ type: 'error', message: 'AI API anahtarı yapılandırılmamış' });
            return res.end();
        }

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const catList = categories.map(c => `"${c.name}" (${c._count.conversations} konuşma)`).join('\n');

        const prompt = `Aşağıdaki kategori listesini sadeleştir. Benzer, tekrar eden ve birbiriyle örtüşen kategorileri grupla.

KATEGORİ LİSTESİ:
${catList}

KURALLAR:
- Benzer kategorileri BİRLEŞTİR (örn: "Üroloji", "Üroloji Fiyat Talebi", "Üroloji Operasyonları" → "Üroloji")
- "X fiyat talebi" şeklindeki kategorileri ana kategoriye birleştir
- En az 2 kategorinin birleşmesi gereken grupları döndür
- Tek başına kalan (birleşmeye gerek olmayan) kategorileri dahil ETme
- Sonuç kategori adı kısa ve net olsun

JSON formatında döndür:
{
  "mergeGroups": [
    {
      "targetName": "Üroloji",
      "sourceNames": ["Üroloji", "Üroloji Fiyat Talebi", "Üroloji Operasyonları"]
    }
  ]
}

SADECE JSON döndür.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            send({ type: 'error', message: 'AI yanıtı parse edilemedi' });
            return res.end();
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const mergeGroups = parsed.mergeGroups || [];

        if (mergeGroups.length === 0) {
            send({ type: 'done', message: 'Sadeleştirilecek benzer kategori bulunamadı', totalMerged: 0, totalMoved: 0, groups: [] });
            return res.end();
        }

        send({ type: 'progress', message: `🧠 AI ${mergeGroups.length} birleştirme grubu buldu. İşleniyor...` });

        let totalMerged = 0;
        let totalMoved = 0;
        const results = [];

        for (let gi = 0; gi < mergeGroups.length; gi++) {
            const group = mergeGroups[gi];
            const sourceNames = group.sourceNames.map(n => n.toLowerCase().trim());
            const sourceCats = categories.filter(c => sourceNames.includes(c.name.toLowerCase().trim()));

            if (sourceCats.length < 2) continue;

            send({ type: 'progress', message: `🔄 [${gi + 1}/${mergeGroups.length}] "${group.targetName}" birleştiriliyor (${sourceCats.length} kategori)...` });

            const sourceIds = sourceCats.map(c => c.id);

            // Keyword'leri birleştir
            let mergedKeywords = [];
            for (const cat of sourceCats) {
                if (cat.keywords) {
                    try { mergedKeywords = [...mergedKeywords, ...JSON.parse(cat.keywords)]; } catch(e) {}
                }
                mergedKeywords.push(cat.name.toLowerCase());
            }
            mergedKeywords = [...new Set(mergedKeywords)];

            const targetCat = await prisma.topicCategory.create({
                data: {
                    workspaceId,
                    name: group.targetName,
                    icon: getCategoryIcon(group.targetName),
                    color: sourceCats[0].color,
                    keywords: JSON.stringify(mergedKeywords),
                    description: sourceCats.map(c => c.name).join(', '),
                    order: sourceCats[0].order,
                }
            });

            const moveResult = await prisma.conversation.updateMany({
                where: { workspaceId, topicCategoryId: { in: sourceIds } },
                data: { topicCategoryId: targetCat.id }
            });

            await prisma.topicCategory.deleteMany({
                where: { id: { in: sourceIds }, workspaceId }
            });

            totalMerged += sourceCats.length;
            totalMoved += moveResult.count;
            results.push({
                target: group.targetName,
                merged: sourceCats.map(c => c.name),
                movedConversations: moveResult.count
            });

            send({ type: 'progress', message: `✅ [${gi + 1}/${mergeGroups.length}] "${group.targetName}" → ${sourceCats.length} kategori birleşti, ${moveResult.count} konuşma taşındı` });
            console.log(`🧹 [Simplify] ${sourceCats.length} kategori → "${group.targetName}" | ${moveResult.count} konuşma`);
        }

        console.log(`✅ [Simplify] Toplam: ${totalMerged} kategori sadeleştirildi, ${totalMoved} konuşma taşındı`);

        send({
            type: 'done',
            message: `✅ ${totalMerged} kategori sadeleştirildi, ${totalMoved} konuşma taşındı`,
            totalMerged,
            totalMoved,
            groups: results
        });
        res.end();
    } catch (error) {
        console.error('simplifyCategories error:', error);
        send({ type: 'error', message: error.message });
        res.end();
    }
};

// ─── AI SOHBET İLE KATEGORİ YÖNETİMİ ────────────────────

export const aiChatCategories = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { message } = req.body;

        if (!message?.trim()) {
            return res.status(400).json({ error: 'Mesaj gerekli' });
        }

        // Mevcut kategorileri çek
        const categories = await prisma.topicCategory.findMany({
            where: { workspaceId },
            include: { _count: { select: { conversations: true } } }
        });

        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            return res.status(500).json({ error: 'AI API anahtarı yapılandırılmamış' });
        }

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const catListStr = categories.map(c => {
            const kws = c.keywords ? JSON.parse(c.keywords).slice(0, 5).join(', ') : '';
            return `ID: ${c.id} | Ad: "${c.name}" | Konuşma: ${c._count.conversations} | Anahtar Kelimeler: ${kws}`;
        }).join('\n');

        const prompt = `Sen bir kategori yönetim asistanısın. Kullanıcının talimatını analiz et ve yapılacak işlemleri belirle.

MEVCUT KATEGORİLER:
${catListStr}

KULLANICI TALİMATI: "${message}"

Yapabileceğin işlemler:
1. MERGE: Kategorileri birleştir (sourceIds + targetName)
2. CREATE: Yeni kategori oluştur (name + keywords)
3. MOVE_KEYWORDS: Anahtar kelimeleri bir kategoriden diğerine taşı (fromId, toId, keywords)
4. RENAME: Kategori adını değiştir (categoryId + newName)
5. DELETE: Kategori sil (categoryId)
6. REASSIGN: Konuşmaları bir kategoriden diğerine taşı (fromId, toId)

JSON formatında döndür:
{
  "explanation": "Ne yapacağımın Türkçe açıklaması",
  "actions": [
    { "type": "MERGE", "sourceIds": ["id1", "id2"], "targetName": "Yeni Ad" },
    { "type": "CREATE", "name": "Yeni Kategori", "keywords": ["kw1", "kw2"] },
    { "type": "MOVE_KEYWORDS", "fromId": "id1", "toId": "id2", "keywords": ["bel fıtığı", "disk hernisi"] },
    { "type": "RENAME", "categoryId": "id1", "newName": "Yeni Ad" },
    { "type": "DELETE", "categoryId": "id1" },
    { "type": "REASSIGN", "fromId": "id1", "toId": "id2" }
  ]
}

KURALLAR:
- Kullanıcı "bel fıtığını sinir cerrahisine taşı" derse, MOVE_KEYWORDS veya REASSIGN kullan
- Birleştirme isterse MERGE kullan
- Yeni kategori isterse CREATE kullan
- Emin olamadığın durumlarda explanation'da sor, actions boş bırak
- SADECE JSON döndür`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.json({ success: false, reply: 'Anlayamadım, lütfen tekrar deneyin.' });
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const actions = parsed.actions || [];
        const explanation = parsed.explanation || '';

        if (actions.length === 0) {
            return res.json({ success: true, reply: explanation || 'Yapılacak işlem bulunamadı.', changes: [] });
        }

        // İşlemleri uygula
        const changes = [];

        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'MERGE': {
                        if (!action.sourceIds || action.sourceIds.length < 2) break;
                        const sourceCats = categories.filter(c => action.sourceIds.includes(c.id));
                        if (sourceCats.length < 2) break;

                        let mergedKws = [];
                        for (const cat of sourceCats) {
                            if (cat.keywords) try { mergedKws = [...mergedKws, ...JSON.parse(cat.keywords)]; } catch(e) {}
                            mergedKws.push(cat.name.toLowerCase());
                        }

                        const newCat = await prisma.topicCategory.create({
                            data: {
                                workspaceId, name: action.targetName,
                                icon: getCategoryIcon(action.targetName),
                                color: sourceCats[0].color,
                                keywords: JSON.stringify([...new Set(mergedKws)]),
                                order: sourceCats[0].order,
                            }
                        });
                        const moved = await prisma.conversation.updateMany({
                            where: { workspaceId, topicCategoryId: { in: action.sourceIds } },
                            data: { topicCategoryId: newCat.id }
                        });
                        await prisma.topicCategory.deleteMany({ where: { id: { in: action.sourceIds }, workspaceId } });
                        changes.push(`🔗 ${sourceCats.map(c => c.name).join(' + ')} → "${action.targetName}" (${moved.count} konuşma taşındı)`);
                        break;
                    }

                    case 'CREATE': {
                        await prisma.topicCategory.create({
                            data: {
                                workspaceId, name: action.name,
                                icon: getCategoryIcon(action.name),
                                color: getColorForIndex(categories.length),
                                keywords: JSON.stringify(action.keywords || []),
                                order: categories.length,
                            }
                        });
                        changes.push(`➕ "${action.name}" oluşturuldu`);
                        break;
                    }

                    case 'MOVE_KEYWORDS': {
                        const fromCat = categories.find(c => c.id === action.fromId);
                        const toCat = categories.find(c => c.id === action.toId);
                        if (!fromCat || !toCat) break;

                        // fromCat'ten keyword'leri çıkar
                        let fromKws = fromCat.keywords ? JSON.parse(fromCat.keywords) : [];
                        const movedKws = action.keywords || [];
                        fromKws = fromKws.filter(k => !movedKws.some(mk => k.toLowerCase().includes(mk.toLowerCase())));
                        await prisma.topicCategory.update({ where: { id: fromCat.id }, data: { keywords: JSON.stringify(fromKws) } });

                        // toCat'e keyword'leri ekle
                        let toKws = toCat.keywords ? JSON.parse(toCat.keywords) : [];
                        toKws = [...new Set([...toKws, ...movedKws])];
                        await prisma.topicCategory.update({ where: { id: toCat.id }, data: { keywords: JSON.stringify(toKws) } });

                        // İlgili konuşmaları taşı
                        const convs = await prisma.conversation.findMany({
                            where: { workspaceId, topicCategoryId: fromCat.id },
                            select: { id: true, aiTopic: true }
                        });
                        const toMove = convs.filter(c => {
                            const topic = (c.aiTopic || '').toLowerCase();
                            return movedKws.some(kw => topic.includes(kw.toLowerCase()));
                        });
                        if (toMove.length > 0) {
                            await prisma.conversation.updateMany({
                                where: { id: { in: toMove.map(c => c.id) } },
                                data: { topicCategoryId: toCat.id }
                            });
                        }
                        changes.push(`📦 "${fromCat.name}" → "${toCat.name}": ${movedKws.join(', ')} taşındı (${toMove.length} konuşma)`);
                        break;
                    }

                    case 'RENAME': {
                        const cat = categories.find(c => c.id === action.categoryId);
                        if (!cat) break;
                        await prisma.topicCategory.update({ where: { id: cat.id }, data: { name: action.newName } });
                        changes.push(`✏️ "${cat.name}" → "${action.newName}"`);
                        break;
                    }

                    case 'DELETE': {
                        const cat = categories.find(c => c.id === action.categoryId);
                        if (!cat) break;
                        await prisma.conversation.updateMany({
                            where: { topicCategoryId: cat.id },
                            data: { topicCategoryId: null }
                        });
                        await prisma.topicCategory.delete({ where: { id: cat.id } });
                        changes.push(`🗑️ "${cat.name}" silindi (${cat._count.conversations} konuşma serbest bırakıldı)`);
                        break;
                    }

                    case 'REASSIGN': {
                        const fromCat = categories.find(c => c.id === action.fromId);
                        const toCat = categories.find(c => c.id === action.toId);
                        if (!fromCat || !toCat) break;
                        const moved = await prisma.conversation.updateMany({
                            where: { workspaceId, topicCategoryId: fromCat.id },
                            data: { topicCategoryId: toCat.id }
                        });
                        changes.push(`➡️ "${fromCat.name}" → "${toCat.name}": ${moved.count} konuşma taşındı`);
                        break;
                    }
                }
            } catch (actionErr) {
                changes.push(`⚠️ İşlem hatası: ${actionErr.message}`);
            }
        }

        console.log(`🤖 [AI Chat] "${message}" → ${changes.length} işlem yapıldı`);

        res.json({
            success: true,
            reply: explanation,
            changes
        });
    } catch (error) {
        console.error('aiChatCategories error:', error);
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

// ─── EXCEL'DEN ÜRÜN + KATEGORİ İMPORT ───────────────────────

export const importFromExcel = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { textContent } = req.body;

        if (!textContent || !textContent.trim()) {
            return res.status(400).json({ error: 'Dosya içeriği boş' });
        }

        const flatContent = textContent.trim();

        // Workspace bilgilerini al
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { name: true, companyName: true }
        });

        // AI ile yapılandır
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            return res.status(500).json({ error: 'AI API anahtarı yapılandırılmamış' });
        }

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const prompt = `Bir şirketin (${workspace?.companyName || workspace?.name || 'Bilinmeyen'}) ürün/hizmet listesini içeren Excel dosyası içeriği aşağıda. 

Bu verileri analiz edip yapılandırılmış ürün listesi oluştur.

EXCEL İÇERİĞİ:
${flatContent}

KURALLAR:
- Her satırdaki ürün/hizmeti ayrı bir ürün olarak çıkar
- groupName: Benzer ürünleri mantıksal gruplara ayır (örn: "Obezite Cerrahisi", "Diş İmplant", "2+1 Daire")
- Fiyat bilgisi varsa price alanına yaz (sayı olarak, para birimi olmadan)
- Açıklama bilgisi varsa description'a yaz
- Gereksiz başlık satırlarını, toplam satırlarını, boş satırları atla
- SADECE ürün/hizmet olan satırları al

SADECE JSON dizisi döndür:
[
  {
    "name": "Tüp Mide Ameliyatı",
    "description": "Laparoskopik sleeve gastrektomi",
    "groupName": "Obezite Cerrahisi",
    "price": 150000
  }
]

SADECE JSON dizisi döndür, başka metin ekleme.`;

        console.log(`📊 [ExcelImport] ${workspaceId}: ${flatContent.length} karakter Excel verisi AI'a gönderiliyor...`);

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        let products;
        try {
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error('JSON dizisi bulunamadı');
            products = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            console.error('AI response parse error:', parseErr.message);
            return res.status(500).json({
                error: 'AI yanıtı parse edilemedi',
                rawResponse: responseText.slice(0, 1000)
            });
        }

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ error: 'Excel dosyasından ürün çıkarılamadı' });
        }

        // Mevcut ürünleri kontrol et (duplicate önleme)
        const existingProducts = await prisma.product.findMany({
            where: { workspaceId },
            select: { name: true }
        });
        const existingNames = new Set(existingProducts.map(p => p.name.toLowerCase().trim()));

        // Ürünleri oluştur
        const created = [];
        const skipped = [];
        for (const p of products) {
            if (!p.name) continue;
            if (existingNames.has(p.name.toLowerCase().trim())) {
                skipped.push(p.name);
                continue;
            }

            try {
                const newProduct = await prisma.product.create({
                    data: {
                        workspaceId,
                        name: p.name.trim(),
                        description: p.description || null,
                        groupName: p.groupName || null,
                        price: typeof p.price === 'number' ? p.price : 0,
                        isActive: true,
                    }
                });
                created.push(newProduct);
                existingNames.add(p.name.toLowerCase().trim());
            } catch (err) {
                console.error(`Product create error: ${p.name}:`, err.message);
            }
        }

        console.log(`✅ [ExcelImport] ${created.length} ürün oluşturuldu, ${skipped.length} atlandı`);

        // Ürünlerden otomatik kategori oluştur
        const groups = new Map();
        for (const p of created) {
            const group = (p.groupName || '').trim() || p.name.trim();
            if (!groups.has(group)) {
                groups.set(group, { products: [], descriptions: [] });
            }
            groups.get(group).products.push(p.name);
            if (p.description) groups.get(group).descriptions.push(p.description);
        }

        const existingCats = await prisma.topicCategory.findMany({
            where: { workspaceId },
            select: { name: true }
        });
        const existingCatNames = new Set(existingCats.map(c => c.name.toLowerCase()));

        const createdCats = [];
        let order = existingCats.length;
        for (const [groupName, data] of groups) {
            if (existingCatNames.has(groupName.toLowerCase())) continue;

            try {
                const newCat = await prisma.topicCategory.create({
                    data: {
                        workspaceId,
                        name: groupName,
                        description: data.products.slice(0, 5).join(', '),
                        icon: getCategoryIcon(groupName),
                        color: getColorForIndex(order),
                        keywords: JSON.stringify(data.products.map(n => n.toLowerCase())),
                        order: order++,
                    }
                });
                createdCats.push(newCat);
            } catch (err) {
                console.error(`Category create error: ${groupName}:`, err.message);
            }
        }

        res.json({
            success: true,
            products: { created: created.length, skipped: skipped.length, total: products.length },
            categories: { created: createdCats.length, list: createdCats },
        });
    } catch (error) {
        console.error('importFromExcel error:', error);
        res.status(500).json({ error: error.message });
    }
};
