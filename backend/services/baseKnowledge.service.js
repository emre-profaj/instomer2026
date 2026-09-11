/**
 * Base Knowledge Context Service
 * ──────────────────────────────
 * Base modülündeki TÜM tanımları tek bir yerde toplayıp yapay zeka (AI)
 * promptuna enjekte edilebilir, yapılandırılmış ve token-optimizeli
 * formata dönüştürür.
 * 
 * Kapsadığı Base Alanları:
 * 1. Şirket Bilgileri (Ad, Açıklama, Adres, Telefon, E-posta, Website, Saatler)
 * 2. Şubeler & Konumlar (İsim, Adres, Telefon)
 * 3. Ürünler, Hizmetler & Fiyatlar (İsim, Fiyat, Para Birimi, Kategori, Bot Notu)
 * 4. Kaynaklar & Uzmanlar (İsim, Unvan, Tür, Çalışma Saatleri)
 * 5. Bilgi Bankası Metinleri & Soru-Cevaplar (Başlık/Soru, İçerik/Cevap)
 */

import prisma from '../lib/prisma.js';

export async function getBaseKnowledgeContext(workspaceId) {
    if (!workspaceId) return { text: '', summary: {} };

    try {
        const [workspace, branches, products, resources, kbEntries] = await Promise.all([
            // 1. Şirket Bilgileri
            prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: {
                    companyName: true,
                    companyDescription: true,
                    companyAddress: true,
                    companyPhone: true,
                    companyEmail: true,
                    companyWebsite: true,
                    companyWorkingHours: true,
                    industry: true
                }
            }),
            // 2. Şubeler
            prisma.appointmentBranch.findMany({
                where: { workspaceId, isActive: true },
                select: { name: true, address: true, phone: true },
                orderBy: { order: 'asc' }
            }),
            // 3. Ürünler ve Fiyatlar (Gruplar hariç, doğrudan ürün/hizmetler)
            prisma.product.findMany({
                where: { workspaceId, isActive: true, isGroup: false },
                select: {
                    name: true,
                    price: true,
                    priceUSD: true,
                    priceEUR: true,
                    description: true,
                    aiContext: true,
                    groupName: true,
                    category: { select: { name: true } }
                },
                take: 150
            }),
            // 4. Kaynaklar & Uzmanlar
            prisma.calendarResource.findMany({
                where: { workspaceId, isActive: true },
                select: {
                    name: true,
                    title: true,
                    type: true,
                    availableStart: true,
                    availableEnd: true
                },
                take: 50
            }),
            // 5. Bilgi Bankası Metinleri & SSS
            prisma.knowledgeBase.findMany({
                where: { workspaceId },
                select: { title: true, content: true, sourceType: true, sourceUrl: true },
                orderBy: { updatedAt: 'desc' },
                take: 100
            })
        ]);

        const sections = [];

        // 1. Şirket Bilgileri
        if (workspace) {
            const lines = [];
            if (workspace.companyName) lines.push(`Firma Adı: ${workspace.companyName}`);
            if (workspace.companyDescription) lines.push(`Hakkında: ${workspace.companyDescription}`);
            if (workspace.companyPhone) lines.push(`Telefon: ${workspace.companyPhone}`);
            if (workspace.companyEmail) lines.push(`E-posta: ${workspace.companyEmail}`);
            if (workspace.companyWebsite) lines.push(`Website: ${workspace.companyWebsite}`);
            if (workspace.companyAddress) lines.push(`Merkez Adres: ${workspace.companyAddress}`);
            if (workspace.companyWorkingHours) lines.push(`Çalışma Saatleri: ${workspace.companyWorkingHours}`);

            if (lines.length > 0) {
                sections.push(`🏢 ŞİRKET BİLGİLERİ:\n${lines.join('\n')}`);
            }
        }

        // 2. Şubeler ve Konumlar
        if (branches.length > 0) {
            const branchLines = branches.map(b => {
                let info = `- ${b.name}`;
                if (b.address) info += ` | Adres: ${b.address}`;
                if (b.phone) info += ` | Tel: ${b.phone}`;
                return info;
            });
            sections.push(`📍 ŞUBELER VE ADRESLER:\n${branchLines.join('\n')}`);
        }

        // 3. Ürünler, Hizmetler ve Fiyatlar
        if (products.length > 0) {
            const productLines = products.map(p => {
                let info = `- ${p.name}`;
                if (p.price > 0) info += ` | Fiyat: ₺${p.price.toLocaleString('tr-TR')}`;
                if (p.priceUSD) info += ` ($${p.priceUSD})`;
                if (p.priceEUR) info += ` (€${p.priceEUR})`;
                if (p.category?.name) info += ` | Kategori: ${p.category.name}`;
                if (p.description) info += ` | Açıklama: ${p.description.substring(0, 500)}`;
                if (p.aiContext) info += ` | [Satış Notu: ${p.aiContext}]`;
                return info;
            });
            sections.push(`🛍️ ÜRÜNLER, HİZMETLER VE FİYAT LİSTESİ:\n${productLines.join('\n')}`);
        }

        // 4. Uzmanlar, Doktorlar ve Personel
        if (resources.length > 0) {
            const resourceLines = resources.map(r => {
                let info = `- ${r.title ? r.title + ' ' : ''}${r.name}`;
                if (r.type && r.type !== 'OTHER') info += ` (${r.type})`;
                if (r.availableStart && r.availableEnd) info += ` | Çalışma Saatleri: ${r.availableStart} - ${r.availableEnd}`;
                return info;
            });
            sections.push(`👥 UZMANLAR VE KADRO:\n${resourceLines.join('\n')}`);
        }

        // 5. Bilgi Bankası Metinleri ve Soru-Cevaplar (SSS)
        if (kbEntries.length > 0) {
            const faqs = kbEntries.filter(e => e.sourceType === 'FAQ');
            const docs = kbEntries.filter(e => e.sourceType !== 'FAQ');

            if (faqs.length > 0) {
                const faqLines = faqs.map(f => {
                    const cat = f.sourceUrl ? `[${f.sourceUrl}] ` : '';
                    return `${cat}Soru: ${f.title}\nCevap: ${f.content}`;
                });
                sections.push(`❓ SIKÇA SORULAN SORULAR VE RESMİ CEVAPLAR (SSS):\n${faqLines.join('\n\n')}`);
            }

            if (docs.length > 0) {
                const docLines = docs.map(d => {
                    const content = (d.content || '').trim();
                    const trimmed = content.length > 15000 ? content.substring(0, 15000) + '... (devamı var)' : content;
                    return `--- ${d.title} ---\n${trimmed}`;
                });
                sections.push(`📚 BİLGİ BANKASI VE DOKÜMANLAR (RESMİ KURUMSAL BİLGİLER):\n${docLines.join('\n\n')}`);
            }
        }

        const fullText = sections.join('\n\n═══════════════════════════════════════\n\n');

        return {
            text: fullText,
            summary: {
                hasCompany: !!workspace?.companyName,
                branchCount: branches.length,
                productCount: products.length,
                resourceCount: resources.length,
                kbCount: kbEntries.length
            }
        };
    } catch (error) {
        console.error('getBaseKnowledgeContext error:', error);
        return { text: '', summary: {} };
    }
}

export default { getBaseKnowledgeContext };
