import prisma from '../lib/prisma.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for realestate uploads (floor plans, site plans, etc.)
const reStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/realestate';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 're-' + uniqueSuffix + path.extname(file.originalname));
    }
});

export const reUpload = multer({
    storage: reStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit (compressed in frontend but safe boundary)
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'image/svg+xml';
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir (JPEG, PNG, WebP, SVG)'));
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADAT (ORTALAMA VADE) HESAPLAMA MOTORU
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ödeme planından nakit akış dizisi oluşturur.
 * @param {Object} params
 * @param {number} params.downPayment         - Peşinat tutarı (gün 0)
 * @param {Array}  params.interimPayments     - Ara ödemeler [{month, amount}]
 * @param {number} params.installmentCount    - Taksit sayısı
 * @param {number} params.monthlyPayment      - Aylık taksit tutarı
 * @returns {Array} - [{day, amount}] nakit akış dizisi
 */
function buildCashFlow({ downPayment, interimPayments = [], installmentCount, monthlyPayment }) {
    const flows = [];

    // 0. Gün — Peşinat
    if (downPayment > 0) {
        flows.push({ day: 0, amount: downPayment });
    }

    // Ara ödemeler (balon ödemeler)
    for (const ip of interimPayments) {
        if (ip.amount > 0 && ip.month > 0) {
            flows.push({ day: ip.month * 30, amount: ip.amount });
        }
    }

    // Aylık eşit taksitler
    for (let i = 1; i <= installmentCount; i++) {
        if (monthlyPayment > 0) {
            flows.push({ day: i * 30, amount: monthlyPayment });
        }
    }

    return flows;
}

/**
 * Adat (ağırlıklı ortalama vade) hesaplar.
 * Formül: Σ(tutar_i × gün_i) / Toplam Tutar
 * @param {Array} cashFlow - [{day, amount}]
 * @returns {number} - Ortalama vade (gün cinsinden)
 */
function calculateAdat(cashFlow) {
    const totalAmount = cashFlow.reduce((sum, cf) => sum + cf.amount, 0);
    if (totalAmount === 0) return 0;
    const weightedSum = cashFlow.reduce((sum, cf) => sum + cf.amount * cf.day, 0);
    return weightedSum / totalAmount;
}

/**
 * Ana hesaplama motoru — NPV tabanlı (paranın bugünkü değeri = cashPrice).
 *
 * cashPrice = peşinat + Σ(araÖdeme / (1+r)^ay) + aylıkTaksit × PVA(r, n)
 * PVA(r, n) = (1 - (1+r)^(-n)) / r
 */
function calculateOffer({
    cashPrice,
    listPrice,
    downPayment,
    interimPayments = [],
    installmentCount,
    monthlyInterestRate,  // % (ör: 1.5 = %1.5)
    basePrice,            // Hesaplama tabanı: liste veya nakit fiyat (kampanyaya göre seçilir)
    manualMonthly,        // Manuel taksit override (kullanıcı tarafından girilmişse)
    discountTierRate,     // Vadeye göre indirim oranı (% — Emlak Konut tipi kampanyalar)
}) {
    // İndirim uygulanmış efektif taban fiyat
    const rawBase = basePrice || cashPrice;
    const tierDiscount = parseFloat(discountTierRate) || 0;
    const effectiveBase = tierDiscount > 0 ? rawBase * (1 - tierDiscount / 100) : rawBase;
    const r = monthlyInterestRate / 100; // aylık faiz (ondalık)

    // 1. Ara ödemelerin nominal toplamı
    // NOT: Ara ödemeler nominal tutarlarıyla düşülür (iskonto uygulanmaz).
    // Mantık: Müşteri 3M+3M=6M ödüyor → taksit tabanı 6M azalır, daha düşük aylık taksit çıkar.
    let interimNominal = 0;
    for (const ip of interimPayments) {
        const amt = ip.amount || 0;
        const month = ip.month || 0;
        if (amt > 0 && month > 0) {
            interimNominal += amt;
        }
    }

    // 2. Kalan taksit tabanı — ara ödemeler nominal olarak düşülür
    const remainingPV = Math.max(0, effectiveBase - downPayment - interimNominal);

    // 3. Aylık taksit hesabı
    //    - Manuel override varsa doğrudan kullanılır (esnek ödeme planı)
    //    - Yoksa annuity formülü ile hesaplanır
    let actualMonthlyPayment = 0;
    if (manualMonthly && parseFloat(manualMonthly) > 0) {
        // Manuel mod: kullanıcının girdiği tutar baz alınır
        actualMonthlyPayment = parseFloat(manualMonthly);
    } else if (installmentCount > 0 && remainingPV > 0) {
        if (r > 0) {
            const pva = (1 - Math.pow(1 + r, -installmentCount)) / r;
            actualMonthlyPayment = remainingPV / pva;
        } else {
            actualMonthlyPayment = remainingPV / installmentCount;
        }
    }

    // 4. Toplam nominal ödeme (müşterinin ödeyeceği gerçek tutar)
    const netPrice = downPayment + interimNominal + actualMonthlyPayment * installmentCount;

    // 5. Kalan bakiye (nominal)
    const remainingBalance = Math.max(0, netPrice - downPayment - interimNominal);

    // 6. Adat (bilgilendirme amaçlı)
    const cashFlow = buildCashFlow({
        downPayment,
        interimPayments,
        installmentCount,
        monthlyPayment: actualMonthlyPayment,
    });
    const adatDays = calculateAdat(cashFlow);
    const adatMonths = adatDays / 30;

    // 7. Liste fiyatıyla karşılaştırma (her zaman listPrice referans)
    const discountAmount = listPrice - netPrice;
    const discountRate = listPrice > 0 ? (discountAmount / listPrice) * 100 : 0;

    // 8. Ödeme takvimi (ay ay döküm)
    const paymentSchedule = [];
    const today = new Date();

    if (downPayment > 0) {
        paymentSchedule.push({
            month: 0,
            date: today.toISOString().split('T')[0],
            amount: Math.round(downPayment * 100) / 100,
            type: 'DOWN_PAYMENT',
            label: 'Peşinat',
        });
    }

    for (const ip of interimPayments) {
        if (ip.amount > 0 && ip.month > 0) {
            const d = new Date(today);
            d.setMonth(d.getMonth() + ip.month);
            paymentSchedule.push({
                month: ip.month,
                date: d.toISOString().split('T')[0],
                amount: Math.round(ip.amount * 100) / 100,
                type: 'INTERIM',
                label: `${ip.month}. Ay Ara Ödeme`,
            });
        }
    }

    for (let i = 1; i <= installmentCount; i++) {
        const d = new Date(today);
        d.setMonth(d.getMonth() + i);
        paymentSchedule.push({
            month: i,
            date: d.toISOString().split('T')[0],
            amount: Math.round(actualMonthlyPayment * 100) / 100,
            type: 'INSTALLMENT',
            label: `${i}. Taksit`,
        });
    }

    return {
        adatDays: Math.round(adatDays * 100) / 100,
        adatMonths: Math.round(adatMonths * 100) / 100,
        netPrice: Math.round(netPrice * 100) / 100,
        totalPayable: Math.round(netPrice * 100) / 100,
        monthlyPayment: Math.round(actualMonthlyPayment * 100) / 100,
        remainingBalance: Math.round(remainingBalance * 100) / 100,
        discountAmount: Math.round(discountAmount * 100) / 100,
        discountRate: Math.round(discountRate * 100) / 100,
        isDiscount: discountAmount > 0,
        isManualMonthly: !!(manualMonthly && parseFloat(manualMonthly) > 0),
        tierDiscount,
        paymentSchedule,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODÜL AYARLARI
// ─────────────────────────────────────────────────────────────────────────────

const getModule = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        let module = await prisma.realEstateModule.findUnique({
            where: { workspaceId },
            include: { projects: { orderBy: { createdAt: 'desc' } } },
        });

        // Yoksa otomatik oluştur (BASIC varsayılan)
        if (!module) {
            module = await prisma.realEstateModule.create({
                data: { workspaceId, moduleType: 'BASIC', isActive: true },
                include: { projects: true },
            });
        }

        res.json({ success: true, module });
    } catch (error) {
        console.error('getModule error:', error);
        res.status(500).json({ success: false, message: 'Modül bilgisi alınamadı.' });
    }
};

const updateModule = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { moduleType, isActive, legalDisclaimer, companyLogo } = req.body;

        const module = await prisma.realEstateModule.upsert({
            where: { workspaceId },
            update: { moduleType, isActive, legalDisclaimer, companyLogo },
            create: { workspaceId, moduleType: moduleType || 'BASIC', isActive: isActive ?? true, legalDisclaimer, companyLogo },
        });

        res.json({ success: true, module });
    } catch (error) {
        console.error('updateModule error:', error);
        res.status(500).json({ success: false, message: 'Modül güncellenemedi.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PROJELER
// ─────────────────────────────────────────────────────────────────────────────

const getProjects = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const module = await prisma.realEstateModule.findUnique({ where: { workspaceId } });
        if (!module) return res.json({ success: true, projects: [] });

        const projects = await prisma.realEstateProject.findMany({
            where: { moduleId: module.id },
            include: {
                apartmentTypes: { orderBy: { order: 'asc' } },
                units: { orderBy: [{ block: 'asc' }, { floor: 'asc' }] },
                campaigns: { where: { isActive: true }, orderBy: { order: 'asc' } },
                _count: { select: { offers: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ success: true, projects });
    } catch (error) {
        console.error('getProjects error:', error);
        res.status(500).json({ success: false, message: 'Projeler alınamadı.' });
    }
};

const createProject = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Modül yoksa otomatik oluştur
        let module = await prisma.realEstateModule.findUnique({ where: { workspaceId } });
        if (!module) {
            module = await prisma.realEstateModule.create({
                data: { workspaceId, moduleType: 'BASIC', isActive: true },
            });
        }

        const project = await prisma.realEstateProject.create({
            data: { moduleId: module.id, ...req.body },
        });

        res.json({ success: true, project });
    } catch (error) {
        console.error('createProject error:', error);
        res.status(500).json({ success: false, message: 'Proje oluşturulamadı.' });
    }
};

const updateProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await prisma.realEstateProject.update({
            where: { id: projectId },
            data: req.body,
        });
        res.json({ success: true, project });
    } catch (error) {
        console.error('updateProject error:', error);
        res.status(500).json({ success: false, message: 'Proje güncellenemedi.' });
    }
};

const deleteProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        await prisma.realEstateProject.delete({ where: { id: projectId } });
        res.json({ success: true });
    } catch (error) {
        console.error('deleteProject error:', error);
        res.status(500).json({ success: false, message: 'Proje silinemedi.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DAİRE TİPLERİ (Basit Sürüm)
// ─────────────────────────────────────────────────────────────────────────────

const getApartmentTypes = async (req, res) => {
    try {
        const { projectId } = req.params;
        const types = await prisma.apartmentType.findMany({
            where: { projectId, isActive: true },
            orderBy: { order: 'asc' },
        });
        res.json({ success: true, types });
    } catch (error) {
        console.error('getApartmentTypes error:', error);
        res.status(500).json({ success: false, message: 'Daire tipleri alınamadı.' });
    }
};

const uploadRealEstateImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Dosya yüklenemedi.' });
        }
        const filePath = '/' + req.file.path.replace(/\\/g, '/');
        res.json({ success: true, url: filePath });
    } catch (error) {
        console.error('uploadRealEstateImage error:', error);
        res.status(500).json({ success: false, message: 'Resim yüklenirken hata oluştu.' });
    }
};

const createApartmentType = async (req, res) => {
    try {
        const { projectId } = req.params;
        const type = await prisma.apartmentType.create({
            data: { projectId, ...req.body },
        });
        res.json({ success: true, type });
    } catch (error) {
        console.error('createApartmentType error:', error);
        res.status(500).json({ success: false, message: 'Daire tipi oluşturulamadı.' });
    }
};

const updateApartmentType = async (req, res) => {
    try {
        const { typeId } = req.params;
        const type = await prisma.apartmentType.update({
            where: { id: typeId },
            data: req.body,
        });
        res.json({ success: true, type });
    } catch (error) {
        console.error('updateApartmentType error:', error);
        res.status(500).json({ success: false, message: 'Daire tipi güncellenemedi.' });
    }
};

const deleteApartmentType = async (req, res) => {
    try {
        const { typeId } = req.params;
        await prisma.apartmentType.update({
            where: { id: typeId },
            data: { isActive: false },
        });
        res.json({ success: true });
    } catch (error) {
        console.error('deleteApartmentType error:', error);
        res.status(500).json({ success: false, message: 'Daire tipi silinemedi.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// BAĞIMSIZ BÖLÜMLER (Gelişmiş Sürüm)
// ─────────────────────────────────────────────────────────────────────────────

const getUnits = async (req, res) => {
    try {
        const { projectId } = req.params;
        const units = await prisma.apartmentUnit.findMany({
            where: { projectId },
            include: {
                apartmentType: { select: { id: true, name: true, roomCount: true, listPrice: true, cashPrice: true, grossArea: true, netArea: true } },
            },
            orderBy: [{ block: 'asc' }, { floor: 'asc' }, { doorNumber: 'asc' }],
        });
        res.json({ success: true, units });
    } catch (error) {
        console.error('getUnits error:', error);
        res.status(500).json({ success: false, message: 'Bağımsız bölümler alınamadı.' });
    }
};

const createUnit = async (req, res) => {
    try {
        const { projectId } = req.params;
        const unit = await prisma.apartmentUnit.create({
            data: { projectId, ...req.body },
        });
        res.json({ success: true, unit });
    } catch (error) {
        console.error('createUnit error:', error);
        res.status(500).json({ success: false, message: 'Bağımsız bölüm oluşturulamadı.' });
    }
};

const updateUnit = async (req, res) => {
    try {
        const { unitId } = req.params;
        const unit = await prisma.apartmentUnit.update({
            where: { id: unitId },
            data: req.body,
        });
        res.json({ success: true, unit });
    } catch (error) {
        console.error('updateUnit error:', error);
        res.status(500).json({ success: false, message: 'Bağımsız bölüm güncellenemedi.' });
    }
};

const deleteUnit = async (req, res) => {
    try {
        const { unitId } = req.params;
        await prisma.apartmentUnit.delete({ where: { id: unitId } });
        res.json({ success: true });
    } catch (error) {
        console.error('deleteUnit error:', error);
        res.status(500).json({ success: false, message: 'Bağımsız bölüm silinemedi.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// KAMPANYALAR
// ─────────────────────────────────────────────────────────────────────────────

const getCampaigns = async (req, res) => {
    try {
        const { projectId } = req.params;
        const campaigns = await prisma.campaign.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
        });
        res.json({ success: true, campaigns });
    } catch (error) {
        console.error('getCampaigns error:', error);
        res.status(500).json({ success: false, message: 'Kampanyalar alınamadı.' });
    }
};

const createCampaign = async (req, res) => {
    try {
        const { projectId } = req.params;
        const campaign = await prisma.campaign.create({
            data: { projectId, ...req.body },
        });
        res.json({ success: true, campaign });
    } catch (error) {
        console.error('createCampaign error:', error);
        res.status(500).json({ success: false, message: 'Kampanya oluşturulamadı.' });
    }
};

const updateCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const campaign = await prisma.campaign.update({
            where: { id: campaignId },
            data: req.body,
        });
        res.json({ success: true, campaign });
    } catch (error) {
        console.error('updateCampaign error:', error);
        res.status(500).json({ success: false, message: 'Kampanya güncellenemedi.' });
    }
};

const deleteCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        await prisma.campaign.delete({ where: { id: campaignId } });
        res.json({ success: true });
    } catch (error) {
        console.error('deleteCampaign error:', error);
        res.status(500).json({ success: false, message: 'Kampanya silinemedi.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HESAPLAMA ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────

const calculate = async (req, res) => {
    try {
        const {
            cashPrice,
            listPrice,
            downPayment,
            interimPayments = [],
            installmentCount,
            monthlyInterestRate,
            basePrice,     // Opsiyonel: kampanyaya göre liste veya nakit fiyat
            manualMonthly, // Opsiyonel: manuel taksit override
            discountTierRate, // Opsiyonel: vadeye göre indirim
        } = req.body;

        if (!cashPrice || cashPrice <= 0) {
            return res.status(400).json({ success: false, message: 'Geçerli bir nakit fiyat giriniz.' });
        }

        const result = calculateOffer({
            cashPrice: parseFloat(cashPrice),
            listPrice: parseFloat(listPrice || cashPrice),
            downPayment: parseFloat(downPayment || 0),
            interimPayments: interimPayments.map(ip => ({
                month: parseInt(ip.month),
                amount: parseFloat(ip.amount || 0),
            })),
            installmentCount: parseInt(installmentCount || 0),
            monthlyInterestRate: parseFloat(monthlyInterestRate || 0),
            basePrice: basePrice ? parseFloat(basePrice) : undefined,
            manualMonthly: manualMonthly ? parseFloat(manualMonthly) : undefined,
            discountTierRate: discountTierRate ? parseFloat(discountTierRate) : undefined,
        });

        res.json({ success: true, result });
    } catch (error) {
        console.error('calculate error:', error);
        res.status(500).json({ success: false, message: 'Hesaplama yapılamadı.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// TEKLİFLER
// ─────────────────────────────────────────────────────────────────────────────

const getOffers = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { page = 1, limit = 20, status, projectId, search } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = { workspaceId };
        if (status) where.status = status;
        if (projectId) where.projectId = projectId;
        if (search) {
            where.OR = [
                { customerName: { contains: search, mode: 'insensitive' } },
                { customerPhone: { contains: search } },
                { customerEmail: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [offers, total] = await Promise.all([
            prisma.paymentOffer.findMany({
                where,
                include: {
                    project: { select: { id: true, name: true } },
                    campaign: { select: { id: true, name: true } },
                    apartmentType: { select: { id: true, name: true, roomCount: true } },
                    unit: { select: { id: true, unitCode: true, block: true, floor: true, doorNumber: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit),
            }),
            prisma.paymentOffer.count({ where }),
        ]);

        res.json({ success: true, offers, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error('getOffers error:', error);
        res.status(500).json({ success: false, message: 'Teklifler alınamadı.' });
    }
};

const createOffer = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            projectId, campaignId, apartmentTypeId, unitId,
            customerName, customerPhone, customerEmail, agentName,
            listPrice, cashPrice, downPayment, interimPayments = [],
            installmentCount, monthlyInterestRate, notes,
            basePrice,        // Kampanyaya göre hesaplama tabanı (listPrice veya cashPrice)
            manualMonthly,    // Manuel taksit override
            discountTierRate, // Vadeye göre indirim oranı
        } = req.body;

        // Hesaplama motorunu çalıştır
        const effectiveListPrice = parseFloat(listPrice || cashPrice);
        const effectiveCashPrice = parseFloat(cashPrice);
        const calc = calculateOffer({
            cashPrice: effectiveCashPrice,
            listPrice: effectiveListPrice,
            downPayment: parseFloat(downPayment || 0),
            interimPayments: interimPayments.map(ip => ({
                month: parseInt(ip.month),
                amount: parseFloat(ip.amount || 0),
            })),
            installmentCount: parseInt(installmentCount || 0),
            monthlyInterestRate: parseFloat(monthlyInterestRate || 0),
            basePrice: basePrice ? parseFloat(basePrice) : undefined,
            manualMonthly: manualMonthly ? parseFloat(manualMonthly) : undefined,
            discountTierRate: discountTierRate ? parseFloat(discountTierRate) : undefined,
        });

        // CRM: Contact oluştur veya bul
        let contactId = null;
        if (customerPhone || customerEmail) {
            try {
                let contact = null;
                if (customerPhone) {
                    contact = await prisma.contact.findFirst({
                        where: { workspaceId, phone: customerPhone },
                    });
                }
                if (!contact && customerEmail) {
                    contact = await prisma.contact.findFirst({
                        where: { workspaceId, email: customerEmail },
                    });
                }
                if (!contact) {
                    contact = await prisma.contact.create({
                        data: {
                            workspaceId,
                            name: customerName,
                            fullName: customerName,
                            phone: customerPhone || null,
                            email: customerEmail || null,
                            source: 'MANUAL',
                            status: 'NEW',
                            category: 'OPPORTUNITY',
                            notes: `Gayrimenkul teklif modülünden oluşturuldu. Proje ID: ${projectId}`,
                        },
                    });
                }
                contactId = contact.id;
            } catch (crmErr) {
                console.error('CRM contact creation error (non-fatal):', crmErr.message);
            }
        }

        let validUntil = null;

        if (campaignId) {
            const camp = await prisma.campaign.findUnique({ where: { id: campaignId } });
            if (camp) {
                if (camp.offerValidityType === 'CAMPAIGN_END' && camp.endDate) {
                    validUntil = new Date(camp.endDate);
                } else if (camp.offerValidityType === 'DAYS') {
                    validUntil = new Date(Date.now() + (camp.offerValidityDays || 7) * 24 * 60 * 60 * 1000);
                }
            }
        }

        const offer = await prisma.paymentOffer.create({
            data: {
                workspaceId,
                projectId,
                campaignId: campaignId || null,
                apartmentTypeId: apartmentTypeId || null,
                unitId: unitId || null,
                customerName,
                customerPhone: customerPhone || null,
                customerEmail: customerEmail || null,
                agentName: agentName || null,
                listPrice: effectiveListPrice,
                cashPrice: effectiveCashPrice,
                netPrice: calc.netPrice,
                downPayment: parseFloat(downPayment || 0),
                // downPaymentRate: basePrice (liste veya nakit) üzerinden hesaplanır
                downPaymentRate: (basePrice ? parseFloat(basePrice) : effectiveCashPrice) > 0
                    ? (parseFloat(downPayment || 0) / (basePrice ? parseFloat(basePrice) : effectiveCashPrice)) * 100
                    : 0,
                installmentCount: Number(installmentCount) || 0,
                monthlyPayment: calc.monthlyPayment,
                interimPayments: JSON.stringify(interimPayments || []),
                avgVadeMonth: calc.adatMonths,
                discountAmount: calc.discountAmount,
                discountRate: calc.discountRate,
                paymentSchedule: JSON.stringify(calc.paymentSchedule),
                contactId,
                notes: notes || null,
                status: 'DRAFT',
                validUntil: validUntil,
            },
            include: {
                project: { select: { id: true, name: true } },
                campaign: { select: { id: true, name: true } },
                apartmentType: { select: { id: true, name: true } },
                unit: { select: { id: true, unitCode: true } },
            },
        });

        // Gelişmiş: Dairenin durumunu RESERVED yap (eğer unitId varsa)
        if (unitId) {
            await prisma.apartmentUnit.update({
                where: { id: unitId },
                data: { status: 'RESERVED', reservedBy: customerName },
            }).catch(() => {}); // Non-fatal
        }

        res.json({ success: true, offer, calcResult: calc });
    } catch (error) {
        console.error('createOffer error:', error);
        res.status(500).json({ success: false, message: 'Teklif oluşturulamadı.' });
    }
};

const updateOfferStatus = async (req, res) => {
    try {
        const { offerId } = req.params;
        const { status } = req.body;
        const offer = await prisma.paymentOffer.update({
            where: { id: offerId },
            data: { status },
        });
        res.json({ success: true, offer });
    } catch (error) {
        console.error('updateOfferStatus error:', error);
        res.status(500).json({ success: false, message: 'Teklif durumu güncellenemedi.' });
    }
};

const getOfferById = async (req, res) => {
    try {
        const { offerId } = req.params;
        const offer = await prisma.paymentOffer.findUnique({
            where: { id: offerId },
            include: {
                project: true,
                campaign: true,
                apartmentType: true,
                unit: true,
            },
        });
        if (!offer) return res.status(404).json({ success: false, message: 'Teklif bulunamadı.' });
        res.json({ success: true, offer });
    } catch (error) {
        console.error('getOfferById error:', error);
        res.status(500).json({ success: false, message: 'Teklif alınamadı.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// TEKLİFİ E-POSTA İLE GÖNDER
// ─────────────────────────────────────────────────────────────────────────────

const sendOfferEmail = async (req, res) => {
    try {
        const { workspaceId, offerId } = req.params;

        // Teklifi çek
        const offer = await prisma.paymentOffer.findUnique({
            where: { id: offerId },
            include: {
                project: true,
                campaign: true,
                apartmentType: true,
                unit: true,
            },
        });

        if (!offer) return res.status(404).json({ success: false, message: 'Teklif bulunamadı.' });
        if (!offer.customerEmail) return res.status(400).json({ success: false, message: 'Müşteri e-posta adresi bulunamadı.' });

        // Workspace'teki aktif e-posta kanalını bul
        const emailChannel = await prisma.emailChannel.findFirst({
            where: { workspaceId, isActive: true },
        });

        if (!emailChannel) {
            return res.status(400).json({ success: false, message: 'Aktif bir e-posta kanalı bulunamadı. Lütfen Ayarlar > E-posta bağlantısı yapın.' });
        }

        // Ödeme planını parse et
        let schedule = [];
        try {
            schedule = typeof offer.paymentSchedule === 'string'
                ? JSON.parse(offer.paymentSchedule)
                : (offer.paymentSchedule || []);
        } catch { schedule = []; }

        // Para formatlama
        const fmtTR = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);

        // HTML E-Posta Template
        const projectName = offer.project?.name || 'Proje';
        const aptName = offer.apartmentType?.name || offer.unit?.unitCode || '';
        const isDiscount = offer.discountAmount > 0;

        const scheduleRows = schedule.map(item => `
            <tr style="border-bottom: 1px solid #e8ecef;">
                <td style="padding: 10px 16px; font-size: 14px; color: ${item.type === 'DOWN_PAYMENT' ? '#1a5276' : item.type === 'INTERIM' ? '#b7950b' : '#2c3e50'}; font-weight: ${item.type !== 'INSTALLMENT' ? '600' : '400'};">${item.label}</td>
                <td style="padding: 10px 16px; font-size: 14px; text-align: right; color: #5d6d7e;">${item.date ? new Date(item.date).toLocaleDateString('tr-TR') : '—'}</td>
                <td style="padding: 10px 16px; font-size: 14px; text-align: right; font-weight: 600; color: #2c3e50;">${fmtTR(item.amount)}</td>
            </tr>
        `).join('');

        const totalPayable = schedule.reduce((s, i) => s + (i.amount || 0), 0);

        const htmlBody = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background: #f4f6f8; padding: 40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr>
        <td style="background: linear-gradient(135deg, #1a2f45 0%, #1a5276 100%); padding: 32px 32px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 22px; font-weight: 700;">Teklif Bilgilendirmesi</h1>
            <p style="margin: 8px 0 0; color: rgba(255,255,255,0.7); font-size: 14px;">${projectName} — ${aptName}</p>
        </td>
    </tr>

    <!-- Müşteri Selamlaması -->
    <tr>
        <td style="padding: 28px 32px 0;">
            <p style="margin: 0; font-size: 15px; color: #2c3e50; line-height: 1.6;">
                Sayın <strong>${offer.customerName}</strong>,<br>
                Aşağıda teklif detaylarınızı ve ödeme planınızı bulabilirsiniz.
            </p>
        </td>
    </tr>

    <!-- Fiyat Özet -->
    <tr>
        <td style="padding: 24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(26,82,118,0.05), rgba(41,128,185,0.05)); border: 1px solid rgba(26,82,118,0.15); border-radius: 10px; overflow: hidden;">
                <tr>
                    <td style="padding: 20px; text-align: center;">
                        <div style="font-size: 12px; color: #5d6d7e; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Teklif Satış Fiyatı</div>
                        <div style="font-size: 28px; font-weight: 900; color: #1a5276; margin-top: 4px;">${fmtTR(offer.netPrice)}</div>
                    </td>
                </tr>
            </table>
            ${offer.discountAmount !== 0 ? `
            <div style="background: ${isDiscount ? '#d5f5e3' : '#fef9e7'}; border: 1px solid ${isDiscount ? 'rgba(30,132,73,0.2)' : 'rgba(183,149,11,0.2)'}; border-radius: 8px; padding: 10px 16px; margin-top: 12px; font-size: 14px; font-weight: 600; color: ${isDiscount ? '#1e8449' : '#b7950b'}; text-align: center;">
                ${isDiscount
                    ? `Liste fiyatından ${fmtTR(offer.discountAmount)} İndirim (%${Math.abs(offer.discountRate).toFixed(1)})`
                    : `Liste fiyatına ${fmtTR(Math.abs(offer.discountAmount))} Vade Farkı (+%${Math.abs(offer.discountRate).toFixed(1)})`}
            </div>` : ''}
        </td>
    </tr>

    <!-- Özet Bilgiler -->
    <tr>
        <td style="padding: 0 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                ${[
                    ['Liste Fiyatı', fmtTR(offer.listPrice)],
                    ['Nakit Fiyatı', fmtTR(offer.cashPrice)],
                    ['Peşinat', `${fmtTR(offer.downPayment)} (%${(offer.downPaymentRate || 0).toFixed(0)})`],
                    ['Taksit', offer.installmentCount > 0 ? `${offer.installmentCount} × ${fmtTR(offer.monthlyPayment)}` : 'Peşin'],
                ].map(([label, value]) => `
                    <tr style="border-bottom: 1px solid #e8ecef;">
                        <td style="padding: 10px 0; color: #5d6d7e;">${label}</td>
                        <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #2c3e50;">${value}</td>
                    </tr>
                `).join('')}
            </table>
        </td>
    </tr>

    ${schedule.length > 0 ? `
    <!-- Ödeme Planı -->
    <tr>
        <td style="padding: 0 32px 24px;">
            <h3 style="margin: 0 0 12px; font-size: 15px; color: #1a5276;">📋 Ödeme Planı</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e8ecef; border-radius: 8px; overflow: hidden;">
                <tr style="background: #f4f6f8;">
                    <th style="padding: 10px 16px; font-size: 12px; color: #5d6d7e; text-align: left; text-transform: uppercase; letter-spacing: 0.4px;">Açıklama</th>
                    <th style="padding: 10px 16px; font-size: 12px; color: #5d6d7e; text-align: right; text-transform: uppercase; letter-spacing: 0.4px;">Tarih</th>
                    <th style="padding: 10px 16px; font-size: 12px; color: #5d6d7e; text-align: right; text-transform: uppercase; letter-spacing: 0.4px;">Tutar</th>
                </tr>
                ${scheduleRows}
                <tr style="background: #f4f6f8; border-top: 2px solid #1a5276;">
                    <td style="padding: 12px 16px; font-size: 14px; font-weight: 700; color: #1a5276;">Toplam</td>
                    <td style="padding: 12px 16px;"></td>
                    <td style="padding: 12px 16px; font-size: 14px; font-weight: 700; color: #1a5276; text-align: right;">${fmtTR(totalPayable)}</td>
                </tr>
            </table>
        </td>
    </tr>` : ''}

    <!-- Disclaimer -->
    <tr>
        <td style="padding: 0 32px 24px;">
            <p style="margin: 0; font-size: 12px; color: #aab7c4; line-height: 1.5; border-top: 1px solid #e8ecef; padding-top: 16px;">
                * Bu hesaplama bilgilendirme amaçlıdır. Kesin fiyat ve koşullar sözleşmede belirlenir.
                ${offer.campaign?.name ? `<br>Uygulanan kampanya: ${offer.campaign.name}` : ''}
            </p>
        </td>
    </tr>

    <!-- Footer -->
    <tr>
        <td style="background: #f4f6f8; padding: 20px 32px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #aab7c4;">
                Bu e-posta otomatik olarak oluşturulmuştur.
            </p>
        </td>
    </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

        // E-postayı gönder
        const { sendEmailViaChannel } = await import('../services/emailSender.service.js');
        await sendEmailViaChannel(
            emailChannel.id,
            offer.customerEmail,
            `${projectName} — Ödeme Teklifi | ${aptName}`,
            htmlBody,
            { isHtml: true }
        );

        // Durumu SENT yap
        await prisma.paymentOffer.update({
            where: { id: offerId },
            data: { status: 'SENT' },
        });

        console.log(`✅ [RE Offer Email] Sent to ${offer.customerEmail} — Offer: ${offerId}`);
        res.json({ success: true, message: `Teklif ${offer.customerEmail} adresine gönderildi.` });
    } catch (error) {
        console.error('sendOfferEmail error:', error);
        res.status(500).json({ success: false, message: 'Teklif e-posta ile gönderilemedi.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// TEKLİFİ SİL
// ─────────────────────────────────────────────────────────────────────────────

const deleteOffer = async (req, res) => {
    try {
        const { workspaceId, offerId } = req.params;

        // Teklifi sil
        await prisma.paymentOffer.delete({
            where: { id: offerId, workspaceId },
        });

        res.json({ success: true, message: 'Teklif başarıyla silindi.' });
    } catch (error) {
        console.error('deleteOffer error:', error);
        res.status(500).json({ success: false, message: 'Teklif silinemedi.' });
    }
};

export {
    // Modül
    getModule, updateModule,
    // Projeler
    getProjects, createProject, updateProject, deleteProject,
    // Daire tipleri
    getApartmentTypes,
    uploadRealEstateImage,
    createApartmentType, updateApartmentType, deleteApartmentType,
    // Bağımsız bölümler
    getUnits, createUnit, updateUnit, deleteUnit,
    // Kampanyalar
    getCampaigns, createCampaign, updateCampaign, deleteCampaign,
    // Hesaplama
    calculate,
    // Teklifler
    getOffers, createOffer, updateOfferStatus, getOfferById, sendOfferEmail, deleteOffer,
};
