import prisma from '../lib/prisma.js';

/**
 * Turkish and case-insensitive text normalizer
 * Handles dotted/dotless I, Ü, Ö, Ş, Ğ, Ç, punctuation and extra whitespaces.
 */
export function normalizeForSearch(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Safely parse keywords from various formats (JSON array, comma-separated string, array)
 */
export function parseKeywords(rawKeywords) {
    if (!rawKeywords) return [];
    if (Array.isArray(rawKeywords)) return rawKeywords.filter(Boolean).map(String);
    if (typeof rawKeywords === 'string') {
        const trimmed = rawKeywords.trim();
        if (!trimmed) return [];
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
        } catch (_) {}
        // Fallback: split by commas, semicolons or newlines
        return trimmed.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    }
    return [];
}

/**
 * 1. Match category from products
 * Looks up Product.groupName or Product.categoryId for the given products and finds matching TopicCategory
 */
export const matchCategoryFromProducts = async (workspaceId, productsText) => {
    try {
        let products = [];
        if (typeof productsText === 'string') {
            try {
                products = JSON.parse(productsText || '[]');
            } catch (_) {
                products = [];
            }
        } else if (Array.isArray(productsText)) {
            products = productsText;
        }

        if (!products || products.length === 0) return null;

        for (const item of products) {
            if (!item.name) continue;

            const product = await prisma.product.findFirst({
                where: { 
                    workspaceId,
                    name: item.name
                }
            });

            if (product) {
                if (product.categoryId) {
                    return product.categoryId;
                }
                if (product.groupName) {
                    const category = await prisma.topicCategory.findFirst({
                        where: {
                            workspaceId,
                            name: product.groupName
                        }
                    });
                    if (category) return category.id;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Kategori eşleştirme hatası (matchCategoryFromProducts):', error.message);
        return null;
    }
};

/**
 * 2. Assign category to case
 */
export const assignCategoryToCase = async (caseId, categoryId) => {
    try {
        if (!caseId || !categoryId) return null;

        return await prisma.case.update({
            where: { id: caseId },
            data: { categoryId }
        });
    } catch (error) {
        console.error('Case kategori atama hatası (assignCategoryToCase):', error.message);
        return null;
    }
};

/**
 * 3. Sync deal to case
 * Takes a deal's products and assigns them to the contact's active case
 */
export const syncDealToCase = async (dealId, workspaceId) => {
    try {
        const deal = await prisma.deal.findUnique({
            where: { id: dealId }
        });

        if (!deal || !deal.contactId || deal.workspaceId !== workspaceId) return null;

        const activeCase = await prisma.case.findFirst({
            where: {
                workspaceId,
                contactId: deal.contactId,
                status: 'ACTIVE'
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!activeCase) {
            console.log('Aktif case bulunamadı, ürün senkronizasyonu atlandı.');
            return null;
        }

        const categoryId = await matchCategoryFromProducts(workspaceId, deal.products);

        const updateData = {};
        if (deal.products) {
            updateData.products = deal.products;
        }
        if (categoryId) {
            updateData.categoryId = categoryId;
        }

        if (Object.keys(updateData).length > 0) {
            const updatedCase = await prisma.case.update({
                where: { id: activeCase.id },
                data: updateData
            });
            console.log(`Case ${activeCase.id} başarıyla Deal ürünleri/kategorisi ile güncellendi.`);
            return updatedCase;
        }

        return activeCase;
    } catch (error) {
        console.error('Deal to Case senkronizasyon hatası (syncDealToCase):', error.message);
        return null;
    }
};

/**
 * 4. Match category from arbitrary text (Lead fields, form messages, chat contents)
 */
export const matchCategoryFromText = async (workspaceId, text) => {
    try {
        if (!text || typeof text !== 'string' || !workspaceId) return null;
        const normalizedHaystack = normalizeForSearch(text);
        if (!normalizedHaystack) return null;

        const haystackWords = normalizedHaystack.split(' ');

        // 1. Fetch workspace categories
        const categories = await prisma.topicCategory.findMany({
            where: { workspaceId, isActive: true },
            orderBy: [{ order: 'asc' }, { name: 'asc' }]
        });

        if (!categories || categories.length === 0) return null;

        // 2. Fetch workspace active products
        const products = await prisma.product.findMany({
            where: { workspaceId, isActive: true },
            select: { id: true, name: true, groupName: true, categoryId: true }
        });

        const checkMatch = (term) => {
            if (!term) return false;
            const normTerm = normalizeForSearch(term);
            if (!normTerm || normTerm.length < 2) return false;

            if (normTerm.includes(' ')) {
                return normalizedHaystack.includes(normTerm);
            }
            if (normTerm.length < 4) {
                return haystackWords.includes(normTerm);
            }
            return haystackWords.some(w => w === normTerm || (normTerm.length >= 4 && w.startsWith(normTerm)));
        };

        // Priority 1: Exact / strong category name match (longest name match first)
        const sortedCatsByNameLen = [...categories].sort((a, b) => b.name.length - a.name.length);
        for (const cat of sortedCatsByNameLen) {
            if (checkMatch(cat.name)) {
                return {
                    categoryId: cat.id,
                    category: cat,
                    matchedTerm: cat.name,
                    matchType: 'CATEGORY_NAME'
                };
            }
        }

        // Priority 2: Product match -> Category
        for (const product of products) {
            if (product.name && checkMatch(product.name)) {
                let targetCategory = null;
                if (product.categoryId) {
                    targetCategory = categories.find(c => c.id === product.categoryId);
                }
                if (!targetCategory && product.groupName) {
                    const normGroup = normalizeForSearch(product.groupName);
                    targetCategory = categories.find(c => normalizeForSearch(c.name) === normGroup);
                }
                if (targetCategory) {
                    return {
                        categoryId: targetCategory.id,
                        category: targetCategory,
                        matchedTerm: product.name,
                        matchType: 'PRODUCT_NAME'
                    };
                }
            }
        }

        // Priority 3: Category keywords match
        for (const cat of categories) {
            const keywords = parseKeywords(cat.keywords);
            for (const kw of keywords) {
                if (checkMatch(kw)) {
                    return {
                        categoryId: cat.id,
                        category: cat,
                        matchedTerm: kw,
                        matchType: 'KEYWORD'
                    };
                }
            }
        }

        // Priority 4: Category description match (key phrases)
        for (const cat of categories) {
            if (cat.description) {
                const descKeywords = parseKeywords(cat.description);
                for (const dk of descKeywords) {
                    if (dk.length >= 4 && checkMatch(dk)) {
                        return {
                            categoryId: cat.id,
                            category: cat,
                            matchedTerm: dk,
                            matchType: 'DESCRIPTION'
                        };
                    }
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Kategori metin eşleştirme hatası (matchCategoryFromText):', error.message);
        return null;
    }
};

/**
 * 5. Match category from full conversation history & form submissions
 * Updates both conversation.topicCategoryId and case.categoryId, and emits socket events
 */
export const matchCategoryFromConversation = async (workspaceId, conversationId) => {
    try {
        if (!workspaceId || !conversationId) return null;

        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                id: true,
                workspaceId: true,
                contactId: true,
                caseId: true,
                aiTopic: true,
                channel: true,
                topicCategoryId: true
            }
        });

        if (!conv) return null;

        // Son 25 mesajı al
        const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: 25,
            select: { content: true, isFromContact: true }
        });

        // Form submission verilerini de al
        const formTexts = [];
        try {
            const submissions = await prisma.formSubmission.findMany({
                where: { conversationId },
                select: { message: true, formData: true },
                take: 5
            });
            for (const sub of submissions) {
                if (sub.message) formTexts.push(sub.message);
                if (sub.formData) {
                    if (typeof sub.formData === 'string') {
                        try {
                            const parsed = JSON.parse(sub.formData);
                            formTexts.push(...Object.values(parsed).filter(v => typeof v === 'string'));
                        } catch (_) {
                            formTexts.push(sub.formData);
                        }
                    } else if (typeof sub.formData === 'object') {
                        formTexts.push(...Object.values(sub.formData).filter(v => typeof v === 'string'));
                    }
                }
            }
        } catch (_) {}

        const messageTexts = messages.map(m => m.content || '').filter(Boolean);
        const combinedText = [
            conv.aiTopic,
            ...messageTexts,
            ...formTexts
        ].filter(Boolean).join('\n');

        if (!combinedText.trim()) return null;

        const match = await matchCategoryFromText(workspaceId, combinedText);
        if (!match || !match.categoryId) return null;

        // 1. Conversation topicCategoryId güncelle
        if (!conv.topicCategoryId || conv.topicCategoryId !== match.categoryId) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { topicCategoryId: match.categoryId }
            });
            console.log(`📁 [CategoryMatcher] Conversation ${conversationId} topicCategoryId assigned: ${match.categoryId} (${match.matchedTerm})`);
        }

        // 2. Vaka (Case) categoryId güncelle
        let targetCase = null;
        if (conv.caseId) {
            targetCase = await prisma.case.findUnique({
                where: { id: conv.caseId },
                select: { id: true, categoryId: true, caseTypeId: true }
            });
        }
        if (!targetCase && conv.contactId) {
            targetCase = await prisma.case.findFirst({
                where: { contactId: conv.contactId, workspaceId, status: 'ACTIVE' },
                orderBy: { createdAt: 'desc' },
                select: { id: true, categoryId: true, caseTypeId: true }
            });
        }

        if (targetCase) {
            const caseUpdate = {};
            if (!targetCase.categoryId || targetCase.categoryId !== match.categoryId) {
                caseUpdate.categoryId = match.categoryId;
            }
            if (!targetCase.caseTypeId && match.category?.caseTypeId) {
                caseUpdate.caseTypeId = match.category.caseTypeId;
            }
            if (Object.keys(caseUpdate).length > 0) {
                await prisma.case.update({
                    where: { id: targetCase.id },
                    data: caseUpdate
                });
                console.log(`📁 [CategoryMatcher] Case ${targetCase.id} categoryId assigned: ${match.categoryId}`);
            }
        }

        // 3. Socket emit
        try {
            const { emitToWorkspace } = await import('../socket.js');
            emitToWorkspace(workspaceId, 'conversation_updated', {
                conversationId,
                topicCategoryId: match.categoryId,
                topicCategory: {
                    id: match.category.id,
                    name: match.category.name,
                    icon: match.category.icon,
                    color: match.category.color
                }
            });

            if (targetCase?.id) {
                emitToWorkspace(workspaceId, 'case_updated', {
                    caseId: targetCase.id,
                    categoryId: match.categoryId,
                    category: {
                        id: match.category.id,
                        name: match.category.name,
                        icon: match.category.icon,
                        color: match.category.color
                    }
                });
            }
        } catch (sErr) {
            console.error('Socket emit error in categoryMatcher:', sErr.message);
        }

        return match;
    } catch (error) {
        console.error('Konuşma kategori eşleştirme hatası (matchCategoryFromConversation):', error.message);
        return null;
    }
};
