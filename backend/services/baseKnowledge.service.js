/**
 * Base Knowledge Context Service
 * ──────────────────────────────
 * Base modülündeki TÜM tanımları tek bir yerde toplayıp yapay zeka (AI)
 * promptuna enjekte edilebilir, yapılandırılmış ve token-optimizeli
 * formata dönüştürür.
 * 
 * Kapsadığı Alanlar:
 * 1. Şirket Bilgileri & 7 Günlük Çalışma Saatleri
 * 2. Şubeler & Konumlar (İsim, Adres, Telefon)
 * 3. Kategoriler & Hizmet Alanları
 * 4. Ürünler, Hizmetler & Fiyatlar
 * 5. Müşteri Akışları (Funnels) ve Aşamaları
 * 6. Takımlar & Ekipler (Departmanlar, Üyeler, Liderler)
 * 7. AI Asistanlar (Rol, Sistem Talimatı, Yetenekler)
 * 8. Kaynaklar & Uzmanlar
 * 9. Bilgi Bankası Metinleri, Taranan Sayfalar & Soru-Cevaplar (SSS)
 */

import prisma from '../lib/prisma.js';

export async function getBaseKnowledgeContext(workspaceId) {
    if (!workspaceId) return { text: '', summary: {}, structuredData: {} };

    try {
        const [
            workspace,
            branches,
            categories,
            products,
            funnels,
            teams,
            bots,
            resources,
            kbEntries
        ] = await Promise.all([
            // 1. Şirket Bilgileri
            prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: {
                    name: true,
                    companyName: true,
                    founder: true,
                    companyDescription: true,
                    companyAddress: true,
                    googleMapsUrl: true,
                    companyPhone: true,
                    companyEmail: true,
                    companyWebsite: true,
                    companyWorkingHours: true,
                    businessAreas: true,
                    serviceRegions: true,
                    companyWeeklySchedule: true,
                    industry: true
                }
            }),
            // 2. Şubeler
            prisma.appointmentBranch.findMany({
                where: { workspaceId, isActive: true },
                select: { id: true, name: true, address: true, phone: true },
                orderBy: { order: 'asc' }
            }),
            // 3. Kategoriler
            prisma.topicCategory.findMany({
                where: { workspaceId },
                select: { id: true, name: true, description: true },
                orderBy: { createdAt: 'asc' }
            }),
            // 4. Ürünler ve Fiyatlar
            prisma.product.findMany({
                where: { workspaceId, isActive: true, isGroup: false },
                select: {
                    id: true,
                    name: true,
                    price: true,
                    priceUSD: true,
                    priceEUR: true,
                    description: true,
                    aiContext: true,
                    groupName: true,
                    category: { select: { id: true, name: true } }
                },
                take: 150
            }),
            // 5. Akışlar ve Aşamaları
            prisma.funnel.findMany({
                where: { workspaceId },
                select: {
                    id: true,
                    name: true,
                    icon: true,
                    color: true,
                    isDefault: true,
                    stages: {
                        select: { id: true, name: true, color: true, order: true },
                        orderBy: { order: 'asc' }
                    }
                },
                orderBy: { order: 'asc' }
            }),
            // 6. Takımlar ve Ekip Üyeleri
            prisma.team.findMany({
                where: { workspaceId },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    members: {
                        select: {
                            id: true,
                            role: true,
                            user: { select: { id: true, name: true, email: true } }
                        }
                    }
                }
            }),
            // 7. AI Asistanlar
            prisma.aIBot.findMany({
                where: { workspaceId },
                select: {
                    id: true,
                    name: true,
                    role: true,
                    prompt: true,
                    capabilities: true,
                    isActive: true
                }
            }),
            // 8. Kaynaklar & Uzmanlar
            prisma.calendarResource.findMany({
                where: { workspaceId, isActive: true },
                select: {
                    id: true,
                    name: true,
                    title: true,
                    type: true,
                    availableStart: true,
                    availableEnd: true
                },
                take: 50
            }),
            // 9. Bilgi Bankası Metinleri & SSS
            prisma.knowledgeBase.findMany({
                where: { workspaceId },
                select: { id: true, title: true, content: true, sourceType: true, sourceUrl: true, filename: true },
                orderBy: { updatedAt: 'desc' },
                take: 100
            })
        ]);

        const sections = [];

        // 1. Şirket Bilgileri & Çalışma Saatleri
        if (workspace) {
            const lines = [];
            const firmName = workspace.companyName || workspace.name;
            if (firmName) lines.push(`Firma Adı: ${firmName}`);
            if (workspace.founder) lines.push(`Kurucu / Firma Sahibi: ${workspace.founder}`);
            if (workspace.companyDescription) lines.push(`Hakkında / Açıklama: ${workspace.companyDescription}`);
            if (workspace.companyPhone) lines.push(`Telefon: ${workspace.companyPhone}`);
            if (workspace.companyEmail) lines.push(`E-posta: ${workspace.companyEmail}`);
            if (workspace.companyWebsite) lines.push(`Web Sitesi: ${workspace.companyWebsite}`);
            if (workspace.companyAddress) lines.push(`Merkez Adresi: ${workspace.companyAddress}`);
            if (workspace.googleMapsUrl) lines.push(`Google Haritalar / Konum Linki: ${workspace.googleMapsUrl}`);

            // Faaliyet ve Hizmet Bölgeleri
            try {
                const bAreas = typeof workspace.businessAreas === 'string' ? JSON.parse(workspace.businessAreas) : workspace.businessAreas;
                if (Array.isArray(bAreas) && bAreas.length > 0) lines.push(`Faaliyet Alanları: ${bAreas.join(', ')}`);
            } catch {}
            try {
                const sRegions = typeof workspace.serviceRegions === 'string' ? JSON.parse(workspace.serviceRegions) : workspace.serviceRegions;
                if (Array.isArray(sRegions) && sRegions.length > 0) lines.push(`Hizmet ve Satış Bölgeleri: ${sRegions.join(', ')}`);
            } catch {}

            // Çalışma Saatleri ve Resmi Tatil Politikası
            if (workspace.companyWorkingHours) {
                lines.push(`Haftalık Çalışma Saatleri Özeti: ${workspace.companyWorkingHours}`);
            }

            // Yapılandırılmış 7 Günlük Tablo
            if (workspace.companyWeeklySchedule) {
                try {
                    const schedData = typeof workspace.companyWeeklySchedule === 'string'
                        ? JSON.parse(workspace.companyWeeklySchedule)
                        : workspace.companyWeeklySchedule;
                    const days = Array.isArray(schedData) ? schedData : (schedData.schedule || []);
                    if (days.length > 0) {
                        const schedLines = days.map(d => {
                            const label = d.label || ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][d.day] || `Gün ${d.day}`;
                            return d.enabled ? `  • ${label}: ${d.start || '09:00'} - ${d.end || '18:00'}` : `  • ${label}: KAPALI`;
                        });
                        lines.push(`Detaylı 7 Günlük Çalışma Çizelgesi:\n${schedLines.join('\n')}`);
                    }
                    if (schedData.holidays) {
                        if (schedData.holidays.closedOnPublicHolidays !== false) {
                            lines.push(`Resmi Tatiller & Bayramlar: Resmi tatil günlerinde ve dini bayramlarda (1 Ocak, 23 Nisan, 1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 29 Ekim, Ramazan Bayramı, Kurban Bayramı) firmamız KAPALIDIR / hizmet vermemektedir.`);
                        } else {
                            lines.push(`Resmi Tatiller & Bayramlar: Resmi tatil günlerinde hizmet verilmektedir (${schedData.holidays.holidayWorkingHours || 'Özel saatler geçerlidir'}).`);
                        }
                    } else {
                        lines.push(`Resmi Tatiller: Resmi tatiller ve bayram günlerinde kapalıdır.`);
                    }
                } catch {}
            }

            if (lines.length > 0) {
                sections.push(`🏢 ŞİRKET BİLGİLERİ VE ÇALIŞMA SAATLERİ:\n${lines.join('\n')}`);
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

        // 3. Kategoriler
        if (categories.length > 0) {
            const catLines = categories.map(c => {
                let info = `- ${c.name}`;
                if (c.description) info += `: ${c.description}`;
                return info;
            });
            sections.push(`📁 HİZMET VE KONU KATEGORİLERİ:\n${catLines.join('\n')}`);
        }

        // 4. Ürünler, Hizmetler ve Fiyatlar
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

        // 5. Akışlar (Funnels) ve Aşamaları
        if (funnels.length > 0) {
            const funnelLines = funnels.map(f => {
                const stageNames = Array.isArray(f.stages) && f.stages.length > 0
                    ? f.stages.map(s => s.name).join(' → ')
                    : 'Standart Aşamalar';
                return `- ${f.name}${f.isDefault ? ' (Varsayılan)' : ''}: [Aşamalar: ${stageNames}]`;
            });
            sections.push(`🔄 MÜŞTERİ AKIŞLARI (FUNNELS) VE AŞAMALARI:\n${funnelLines.join('\n')}`);
        }

        // 6. Takımlar ve Departmanlar
        if (teams.length > 0) {
            const teamLines = teams.map(t => {
                const memberNames = (t.members || []).map(m => `${m.user?.name || m.user?.email}${(m.role === 'LEADER' || m.role === 'ADMIN') ? ' (Lider)' : ''}`).join(', ');
                return `- ${t.name}: ${t.description || 'Genel Departman'}${memberNames ? ` | Üyeler: ${memberNames}` : ''}`;
            });
            sections.push(`👥 TAKIMLAR VE DEPARTMANLAR:\n${teamLines.join('\n')}`);
        }

        // 7. AI Asistanlar
        if (bots.length > 0) {
            const botLines = bots.map(b => {
                let info = `- ${b.name} (${b.role || 'Müşteri Temsilcisi'})${b.isActive ? ' [Aktif]' : ' [Pasif]'}`;
                if (b.prompt) info += ` | Sistem Talimatı: "${b.prompt.substring(0, 300)}"`;
                return info;
            });
            sections.push(`🧠 AI AGENT DAVRANIŞ KURALLARI VE TALİMATLARI:\n${botLines.join('\n')}`);
        }

        // 8. Uzmanlar, Doktorlar ve Personel
        if (resources.length > 0) {
            const resourceLines = resources.map(r => {
                let info = `- ${r.title ? r.title + ' ' : ''}${r.name}`;
                if (r.type && r.type !== 'OTHER') info += ` (${r.type})`;
                if (r.availableStart && r.availableEnd) info += ` | Çalışma Saatleri: ${r.availableStart} - ${r.availableEnd}`;
                return info;
            });
            sections.push(`👨‍⚕️ UZMANLAR VE ÇALIŞMA SAATLERİ:\n${resourceLines.join('\n')}`);
        }

        // 9. Bilgi Bankası Metinleri ve Soru-Cevaplar (SSS)
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
                companyName: workspace?.companyName,
                companyHours: workspace?.companyWorkingHours,
                branchCount: branches.length,
                categoryCount: categories.length,
                productCount: products.length,
                funnelCount: funnels.length,
                teamCount: teams.length,
                botCount: bots.length,
                resourceCount: resources.length,
                kbCount: kbEntries.length
            },
            structuredData: {
                company: workspace,
                branches,
                categories,
                products,
                funnels,
                teams,
                bots,
                resources,
                kbEntries
            }
        };
    } catch (error) {
        console.error('getBaseKnowledgeContext error:', error);
        return { text: '', summary: {}, structuredData: {} };
    }
}

export default { getBaseKnowledgeContext };
