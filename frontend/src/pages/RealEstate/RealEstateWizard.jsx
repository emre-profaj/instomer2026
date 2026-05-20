import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, Home, Calendar, Sliders, ChevronRight, ChevronLeft, Plus, Trash2, Save, Check, AlertCircle, TrendingDown, TrendingUp, Printer, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { realEstateAPI, contactAPI, workspaceAPI } from '../../services/api';
import './RealEstate.css';

// ─── Para formatlama ────────────────────────────────────────────────────────
const fmt = (n) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);

const fmtN = (n) =>
    new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n || 0);

// ─── Vade seçenekleri ───────────────────────────────────────────────────────
const VADE_OPTIONS = [
    { label: 'Peşin', months: 0 },
    { label: '6 Ay', months: 6 },
    { label: '12 Ay', months: 12 },
    { label: '18 Ay', months: 18 },
    { label: '24 Ay', months: 24 },
    { label: '36 Ay', months: 36 },
    { label: '48 Ay', months: 48 },
    { label: '60 Ay', months: 60 },
];

// ─── Hesaplama ──────────────────────────────────────────────────────────────
// Mantık (NBD / NPV tabanlı):
//  Paranın bugünkü değeri (NBD) HER ZAMAN cashPrice'a eşit olmalı.
//
//  cashPrice = peşinat + Σ(araÖdeme / (1+r)^ay) + aylıkTaksit × PVA(r, n)
//
//  PVA(r, n) = (1 - (1+r)^(-n)) / r   → annuity bugünkü değer faktörü
//
//  1. Peşinat: bugün ödenir, iskonto yok
//  2. Ara ödemeler: gelecekte ödenir, bugüne iskonto edilir
//  3. Kalan NBD = cashPrice - peşinat - Σ(araÖdemeNBD)
//  4. Aylık taksit = kalanNBD / PVA(r, n)  → her taksit bu tutar
//  5. netPrice = peşinat + Σ(araÖdemeNominal) + aylıkTaksit × n  → toplam nominal ödeme
//  6. fark = listPrice - netPrice → indirim veya vade farkı
//
//  Peşin (installmentCount=0) → netPrice = cashPrice
// basePrice: Hesaplama tabanı (kampanya bazlı: listPrice veya cashPrice)
// manualMonthly: Manuel taksit override (kullanıcının girdiği)
// discountTierRate: Vadeye göre indirim oranı (% — Emlak Konut tipi kampanyalar için)
function localCalculate({ cashPrice, listPrice, downPayment, interimPayments, installmentCount, monthlyInterestRate, basePrice, manualMonthly, discountTierRate }) {
    const r = monthlyInterestRate / 100; // aylık faiz (ondalık)

    // Ara ödemelerin nominal toplamı
    let interimNominal = 0;
    interimPayments.forEach(ip => {
        const amt = ip.amount || 0;
        const month = ip.month || 0;
        if (amt > 0 && month > 0) interimNominal += amt;
    });

    // Kalan bakiye (basit bölme — faiz taksitlere uygulanmaz)
    const remaining = Math.max(0, cashPrice - downPayment - interimNominal);

    // Aylık taksit (basit bölme)
    let monthly = 0;
    const parsedManual = parseFloat(manualMonthly) || 0;
    if (parsedManual > 0) {
        monthly = parsedManual;
    } else if (installmentCount > 0 && remaining > 0) {
        monthly = remaining / installmentCount;
    }

    // ── ADAT: Ağırlıklı ortalama vade ──
    // Tüm ödemelerin nakit akış dizisi
    const flows = [];
    if (downPayment > 0) flows.push({ day: 0, amount: downPayment });
    interimPayments.forEach(ip => {
        if ((ip.amount || 0) > 0 && (ip.month || 0) > 0) {
            flows.push({ day: ip.month * 30, amount: ip.amount });
        }
    });
    for (let i = 1; i <= installmentCount; i++) {
        if (monthly > 0) flows.push({ day: i * 30, amount: monthly });
    }
    if (flows.length === 0) flows.push({ day: 0, amount: cashPrice });

    const totalAmt = flows.reduce((s, f) => s + f.amount, 0);
    const adatDays = totalAmt > 0 ? flows.reduce((s, f) => s + f.amount * f.day, 0) / totalAmt : 0;
    const adatMonths = adatDays / 30;

    // ── Vade farkı = peşin fiyat × aylık faiz × adat ay ──
    const surcharge = cashPrice * r * adatMonths;

    // ── Net fiyat = peşin fiyat + vade farkı ──
    const netPrice = cashPrice + surcharge;

    // ── Liste fiyatı ile karşılaştırma ──
    const discountAmount = listPrice - netPrice;
    const discountRate = listPrice > 0 ? (discountAmount / listPrice) * 100 : 0;

    return {
        adatMonths, adatDays: Math.round(adatDays),
        netPrice: Math.round(netPrice), monthly: Math.round(monthly),
        remaining: Math.round(remaining), surcharge: Math.round(surcharge),
        discountAmount: Math.round(discountAmount), discountRate,
        totalPayable: Math.round(netPrice),
        isDiscount: discountAmount > 0, isManualMonthly: parsedManual > 0,
    };
}

// ─── ADIM GÖSTERGESİ ───────────────────────────────────────────────────────
function WizardSteps({ current }) {
    const steps = [
        { n: 1, label: 'Müşteri Bilgileri' },
        { n: 2, label: 'Daire Seçimi' },
        { n: 3, label: 'Vade & Ödeme' },
    ];
    return (
        <div className="re-steps">
            {steps.map((s, i) => (
                <div key={s.n} className={`re-step ${current === s.n ? 'active' : current > s.n ? 'completed' : ''}`}>
                    <div className="re-step-number">{current > s.n ? <Check size={14} /> : s.n}</div>
                    <div>
                        <div className="re-step-label">{s.label}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── ÖZET PANELİ ───────────────────────────────────────────────────────────
function SummaryPanel({ form, selected, calc, paymentConfigured }) {
    const hasApt = !!selected;
    const listPrice = hasApt ? (selected.listPrice || 0) : 0;
    const cashPrice = hasApt ? (selected.cashPrice || selected.listPrice || 0) : 0;
    const showFinancials = paymentConfigured && calc && cashPrice > 0;

    return (
        <div className="re-summary-panel">
            <div className="re-summary-header">
                <h3>🏢 Teklif Özeti</h3>
                <p>Anlık güncellenmektedir</p>
            </div>
            <div className="re-summary-body">
                {/* Müşteri */}
                {form.customerName && (
                    <div className="re-summary-row">
                        <span className="label">Müşteri</span>
                        <span className="value">{form.customerName}</span>
                    </div>
                )}
                {/* Seçilen Daire */}
                {hasApt && (
                    <div className="re-summary-row">
                        <span className="label">Daire Tipi</span>
                        <span className="value">{selected.name}</span>
                    </div>
                )}
                {selected?.netArea && (
                    <div className="re-summary-row">
                        <span className="label">Net Alan</span>
                        <span className="value">{selected.netArea} m²</span>
                    </div>
                )}
                {listPrice > 0 && (
                    <div className="re-summary-row">
                        <span className="label">Liste Fiyatı</span>
                        <span className="value">{fmt(listPrice)}</span>
                    </div>
                )}
                {cashPrice > 0 && cashPrice !== listPrice && (
                    <div className="re-summary-row">
                        <span className="label">Peşin Fiyat</span>
                        <span className="value">{fmt(cashPrice)}</span>
                    </div>
                )}

                {!showFinancials && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--re-muted)', fontSize: '0.82rem' }}>
                        Vade ve peşinat seçimi yapıldığında hesaplama burada görünecektir.
                    </div>
                )}

                {showFinancials && (
                    <>
                        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.15)', margin: '12px 0' }} />
                        {form.downPayment > 0 && (
                            <div className="re-summary-row">
                                <span className="label">Peşinat ({form.downPaymentRate?.toFixed(0)}%)</span>
                                <span className="value">{fmt(form.downPayment)}</span>
                            </div>
                        )}
                        {form.installmentCount > 0 && (
                            <div className="re-summary-row">
                                <span className="label">Vade</span>
                                <span className="value">{form.installmentCount} Ay</span>
                            </div>
                        )}
                        {calc.monthly > 0 && (
                            <div className="re-summary-row">
                                <span className="label">Aylık Taksit</span>
                                <span className="value">{fmt(calc.monthly)}</span>
                            </div>
                        )}
                        {calc.adatMonths > 0 && (
                            <div className="re-summary-row">
                                <span className="label">Ort. Vade (Adat)</span>
                                <span className="value">{calc.adatMonths.toFixed(2)} Ay</span>
                            </div>
                        )}
                        {calc.surcharge > 0 && (
                            <div className="re-summary-row">
                                <span className="label">Vade Farkı</span>
                                <span className="value">{fmt(calc.surcharge)}</span>
                            </div>
                        )}
                        <div className="re-summary-price-block">
                            <div className="re-summary-price-label">Teklif Satış Fiyatı</div>
                            <div className="re-summary-price-value">{fmt(calc.netPrice)}</div>
                        </div>
                        {listPrice > 0 && calc.discountAmount !== 0 && (
                            <div className={`re-discount-badge ${calc.isDiscount ? 'discount' : 'surcharge'}`}>
                                {calc.isDiscount ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                                <span>
                                    {calc.isDiscount
                                        ? `Liste fiyatından ${fmt(Math.abs(calc.discountAmount))} İndirim (%${Math.abs(calc.discountRate).toFixed(1)})`
                                        : `Liste fiyatına ${fmt(Math.abs(calc.discountAmount))} Vade Farkı (+%${Math.abs(calc.discountRate).toFixed(1)})`}
                                </span>
                            </div>
                        )}
                    </>
                )}

                <p style={{ fontSize: '0.6875rem', color: 'var(--re-muted)', marginTop: 16, lineHeight: 1.5 }}>
                    * Bu hesaplama bilgilendirme amaçlıdır. Kesin fiyat ve koşullar sözleşmede belirlenir.
                </p>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANA BİLEŞEN
// ─────────────────────────────────────────────────────────────────────────────
export default function RealEstateWizard() {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const wid = currentWorkspace?.id;

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [paymentConfigured, setPaymentConfigured] = useState(false);

    // Veriler
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [aptTypes, setAptTypes] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [selectedAptType, setSelectedAptType] = useState(null);
    const [selectedCampaign, setSelectedCampaign] = useState(null);

    // Müşteri arama & Temsilci
    const [contactSearch, setContactSearch] = useState('');
    const [contactResults, setContactResults] = useState([]);
    const [contactSearching, setContactSearching] = useState(false);
    const [showContactDropdown, setShowContactDropdown] = useState(false);
    const [selectedContact, setSelectedContact] = useState(null);
    const [members, setMembers] = useState([]);
    const contactSearchRef = useRef(null);
    const contactDropdownRef = useRef(null);

    // Form
    const [form, setForm] = useState({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        agentName: '',
        installmentCount: 0,
        downPayment: 0,
        downPaymentRate: 20,
        interimPayments: [],
        manualInterestRate: '',       // Kampanya seçilince otomatik dolar, override edilebilir
        manualMonthly: '',            // Manuel taksit tutarı override
        manualMonthlyEnabled: false,  // Manuel mod aktif mi?
    });

    // Anlık hesaplama
    const [calc, setCalc] = useState(null);

    // Workspace üyelerini yükle (temsilci dropdown)
    useEffect(() => {
        if (!wid) return;
        workspaceAPI.getMembers(wid).then(res => {
            setMembers(res.data.members || res.data || []);
        }).catch(() => {});
    }, [wid]);

    // Kişi arama (debounced)
    useEffect(() => {
        if (!wid || contactSearch.length < 2) {
            setContactResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setContactSearching(true);
            try {
                const res = await contactAPI.getAll(wid, { search: contactSearch, limit: 10, page: 1 });
                setContactResults(res.data.contacts || res.data || []);
            } catch { setContactResults([]); }
            setContactSearching(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [contactSearch, wid]);

    // Dropdown dışı tıklamayı dinle
    useEffect(() => {
        const handleClick = (e) => {
            if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target)) {
                setShowContactDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSelectContact = (contact) => {
        setSelectedContact(contact);
        setForm(f => ({
            ...f,
            customerName: contact.fullName || contact.name || '',
            customerPhone: contact.phone || '',
            customerEmail: contact.email || '',
        }));
        setContactSearch(contact.fullName || contact.name || '');
        setShowContactDropdown(false);
    };

    // Verileri yükle
    useEffect(() => {
        if (!wid) return;
        const load = async () => {
            try {
                setLoading(true);
                const res = await realEstateAPI.getProjects(wid);
                const proj = res.data.projects || [];
                setProjects(proj);
                if (proj.length > 0) {
                    setSelectedProject(proj[0]);
                }
            } catch (e) {
                setError('Proje verileri yüklenemedi.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [wid]);

    // Proje değişince tipleri ve kampanyaları yükle
    useEffect(() => {
        if (!selectedProject || !wid) return;
        const load = async () => {
            try {
                const [typesRes, campRes] = await Promise.all([
                    realEstateAPI.getApartmentTypes(wid, selectedProject.id),
                    realEstateAPI.getCampaigns(wid, selectedProject.id),
                ]);
                setAptTypes(typesRes.data.types || []);
                setCampaigns(campRes.data.campaigns || []);
                setSelectedAptType(null);
                setSelectedCampaign(null);
            } catch {}
        };
        load();
    }, [selectedProject, wid]);

    // Anlık hesaplama
    useEffect(() => {
        if (!selectedAptType) { setCalc(null); return; }
        const cashPrice = selectedAptType.cashPrice || selectedAptType.listPrice || 0;
        const listPrice = selectedAptType.listPrice || cashPrice;
        if (!cashPrice) { setCalc(null); return; }

        // Faiz kaynağı: kampanya faizi öncelikli, yoksa manuel giriş
        const monthlyIR = selectedCampaign
            ? (selectedCampaign.monthlyInterestRate ?? 0)
            : (parseFloat(form.manualInterestRate) || 0);

        // Kampanya discount tier'larını parse et
        let discountTiers = [];
        try {
            discountTiers = typeof selectedCampaign?.discountTiers === 'string'
                ? JSON.parse(selectedCampaign.discountTiers)
                : (selectedCampaign?.discountTiers || []);
        } catch { discountTiers = []; }

        // Seçilen vadeye ait indirim oranını bul
        // maxInstallments = standart vade (indirimsiz, liste fiyatı), diğerleri indirimli
        const isMaxInstallments = selectedCampaign && form.installmentCount === selectedCampaign.maxInstallments;
        const activeTier = !isMaxInstallments
            ? discountTiers.find(t => t.months === form.installmentCount)
            : null;
        const discountTierRate = activeTier ? activeTier.discountRate : 0;

        // Kural: Kampanya seçiliyken her zaman listPrice baz alınır (sıfır faizli de, şirket bünyesi de).
        // Kampanya yoksa (peşin satış) cashPrice baz alınır.
        const basePrice = selectedCampaign ? listPrice : cashPrice;

        const result = localCalculate({
            cashPrice,
            listPrice,
            downPayment: form.downPayment,
            interimPayments: form.interimPayments,
            installmentCount: form.installmentCount,
            monthlyInterestRate: monthlyIR,
            basePrice,
            manualMonthly: form.manualMonthlyEnabled ? form.manualMonthly : '',
            discountTierRate,
        });
        setCalc({ ...result, activeTier, discountTiers, isMaxInstallments });
    }, [form.downPayment, form.installmentCount, form.interimPayments, form.manualInterestRate, form.manualMonthly, form.manualMonthlyEnabled, selectedAptType, selectedCampaign]);

    // Peşinat oranı ↔ tutar senkronizasyonu
    // Kural: SADECE sıfır faizli kampanya (Emlak Konut vb.) → listPrice baz; faizli kampanya → cashPrice baz
    const _getPriceBase = () => {
        const cp = selectedAptType?.cashPrice || selectedAptType?.listPrice || 0;
        const lp = selectedAptType?.listPrice || cp;
        // Kampanya varsa her zaman liste fiyatı baz alınır
        return selectedCampaign ? lp : cp;
    };

    const handleDownPaymentRate = (rate) => {
        const base = _getPriceBase();
        const dp = Math.round((base * rate) / 100);
        setForm(f => ({ ...f, downPaymentRate: rate, downPayment: dp }));
    };

    const handleDownPaymentAmt = (amt) => {
        const base = _getPriceBase();
        const rate = base > 0 ? (amt / base) * 100 : 0;
        setForm(f => ({ ...f, downPayment: amt, downPaymentRate: rate }));
    };

    // Kampanya seçilince max taksit uygula
    const handleSelectCampaign = (c) => {
        setSelectedCampaign(c);
        // Kampanya seçilince faizi form'a yansıt (kullanıcı override edebilir)
        if (c) {
            setForm(f => ({ ...f, manualInterestRate: String(c.monthlyInterestRate ?? '') }));
        }
        if (c && form.installmentCount > c.maxInstallments) {
            setForm(f => ({ ...f, installmentCount: c.maxInstallments }));
        }
        // Min peşinat zorla
        if (c && selectedAptType) {
            const cashPrice = selectedAptType.cashPrice || selectedAptType.listPrice || 0;
            const minDP = c.minDownPaymentFixed
                ? c.minDownPaymentFixed
                : (cashPrice * c.minDownPaymentRate) / 100;
            if (form.downPayment < minDP) {
                const rate = cashPrice > 0 ? (minDP / cashPrice) * 100 : 0;
                setForm(f => ({ ...f, downPayment: minDP, downPaymentRate: rate }));
            }
        }
    };

    // Ara ödeme ekle/sil
    const addInterim = () => setForm(f => ({ ...f, interimPayments: [...f.interimPayments, { month: 6, amount: '' }] }));
    const removeInterim = (i) => setForm(f => ({ ...f, interimPayments: f.interimPayments.filter((_, idx) => idx !== i) }));
    const updateInterim = (i, field, val) => setForm(f => ({
        ...f,
        interimPayments: f.interimPayments.map((ip, idx) => idx === i ? { ...ip, [field]: field === 'amount' ? parseFloat(val) || 0 : parseInt(val) || 0 } : ip)
    }));

    // Kaydet
    const handleSave = async () => {
        if (!selectedProject || !selectedAptType) { setError('Lütfen bir daire tipi seçin.'); return; }
        if (!form.customerName) { setError('Müşteri adı zorunludur.'); return; }

        // Peşinat min kontrolleri
        const cashPrice = selectedAptType.cashPrice || selectedAptType.listPrice || 0;
        const listPrice = selectedAptType.listPrice || cashPrice;
        const isZeroIRCampaign = selectedCampaign && selectedCampaign.monthlyInterestRate === 0 && form.installmentCount > 0;

        // Sıfır faizli kampanya (Emlak Konut): flexDownPaymentRate en az
        if (isZeroIRCampaign && selectedCampaign.flexDownPaymentRate != null) {
            const flexMin = listPrice * selectedCampaign.flexDownPaymentRate / 100;
            if (form.downPayment < flexMin) {
                setError(`Bu kampanya için minimum ${fmt(flexMin)} peşinat (%%${selectedCampaign.flexDownPaymentRate}) gereklidir.`);
                return;
            }
        }

        // Discount tier hesapla
        let discountTiers = [];
        try { discountTiers = typeof selectedCampaign?.discountTiers === 'string' ? JSON.parse(selectedCampaign.discountTiers) : []; } catch {}
        const isMaxInst = selectedCampaign && form.installmentCount === selectedCampaign.maxInstallments;
        const activeTier = !isMaxInst ? discountTiers.find(t => t.months === form.installmentCount) : null;
        const discountTierRate = activeTier ? activeTier.discountRate : 0;

        setSaving(true); setError('');
        try {
            // SADECE sıfır faizli kampanyalarda listPrice baz alınır; faizlide cashPrice
            const basePrice = isZeroIRCampaign ? listPrice : cashPrice;
            await realEstateAPI.createOffer(wid, {
                projectId: selectedProject.id,
                campaignId: selectedCampaign?.id || null,
                apartmentTypeId: selectedAptType.id,
                customerName: form.customerName,
                customerPhone: form.customerPhone,
                customerEmail: form.customerEmail,
                agentName: form.agentName,
                listPrice,
                cashPrice,
                downPayment: form.downPayment,
                interimPayments: form.interimPayments,
                installmentCount: form.installmentCount,
                monthlyInterestRate: selectedCampaign?.monthlyInterestRate ?? (parseFloat(form.manualInterestRate) || 0),
                basePrice,
                manualMonthly: form.manualMonthlyEnabled && form.manualMonthly ? parseFloat(form.manualMonthly) : undefined,
                discountTierRate: discountTierRate || undefined,
            });
            setSaved(true);
            setTimeout(() => {
                setSaved(false);
                navigate('/realestate/offers');
            }, 1500);
        } catch (e) {
            setError('Teklif kaydedilemedi. Lütfen tekrar deneyin.');
        } finally {
            setSaving(false);
        }
    };

    const minDPRate = selectedCampaign?.minDownPaymentRate || 0;
    const cashPrice = selectedAptType?.cashPrice || selectedAptType?.listPrice || 0;
    const listPriceForCalc = selectedAptType?.listPrice || cashPrice;

    // Kampanya tiplerini belirle (render-time)
    // Kampanya varsa her zaman listPrice baz alınır (sıfır faiz de, şirket bünyesi de)
    const isZeroIRActive = selectedCampaign && selectedCampaign.monthlyInterestRate === 0 && form.installmentCount > 0;
    const priceBase = selectedCampaign ? listPriceForCalc : cashPrice;

    // Peşinat min oranı: Emlak Konut flex → flexDownPaymentRate, diğerleri kampanya minDP
    const flexMinRate = selectedCampaign?.flexDownPaymentRate ?? null;
    const effectiveMinDPRate = (isZeroIRActive && flexMinRate != null) ? flexMinRate : minDPRate;

    const minDP = selectedCampaign
        ? Math.max(
            selectedCampaign.minDownPaymentFixed || 0,
            priceBase * effectiveMinDPRate / 100
          )
        : 0;
    const dp = form.downPayment;
    const dpPct = priceBase > 0 ? (dp / priceBase) * 100 : 0;
    // CSS --value slider min'e göre normalize: (value - min) / (max - min) × 100
    const sliderMin = effectiveMinDPRate;
    const sliderPct = sliderMin < 100
        ? Math.min(100, Math.max(0, ((dpPct - sliderMin) / (100 - sliderMin)) * 100))
        : 100;

    // Aktif discount tier (Emlak Konut tipi indirim)
    let renderDiscountTiers = [];
    try {
        renderDiscountTiers = typeof selectedCampaign?.discountTiers === 'string'
            ? JSON.parse(selectedCampaign.discountTiers) : (selectedCampaign?.discountTiers || []);
    } catch {}
    const isMaxInstRender = selectedCampaign && form.installmentCount === selectedCampaign.maxInstallments;
    const activeRenderTier = !isMaxInstRender ? renderDiscountTiers.find(t => t.months === form.installmentCount) : null;

    if (loading) return <div className="re-loading"><Building2 size={32} /><span>Proje verileri yükleniyor...</span></div>;

    return (
        <div className="re-page">
            {/* Sayfa Başlığı */}
            <div className="re-page-header">
                <div className="re-page-title">
                    <div className="re-page-title-icon"><Building2 size={22} /></div>
                    <div>
                        <h1>Teklif Oluştur</h1>
                        <p>Müşterinize özel dinamik ödeme planı oluşturun</p>
                    </div>
                </div>
                {/* Proje seçici */}
                {projects.length > 1 && (
                    <select
                        className="re-input re-select"
                        style={{ width: 240 }}
                        value={selectedProject?.id || ''}
                        onChange={e => setSelectedProject(projects.find(p => p.id === e.target.value))}
                    >
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                )}
            </div>

            {/* Hata */}
            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fadbd8', borderRadius: 8, marginBottom: 16, color: '#922b21', fontSize: '0.875rem' }}>
                    <AlertCircle size={16} />{error}
                </div>
            )}

            {/* Başarı */}
            {saved && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#d5f5e3', borderRadius: 8, marginBottom: 16, color: '#1e8449', fontSize: '0.875rem' }}>
                    <Check size={16} />Teklif başarıyla kaydedildi ve CRM'e aktarıldı!
                </div>
            )}

            {/* Proje yoksa */}
            {projects.length === 0 && (
                <div className="re-card">
                    <div className="re-empty">
                        <Building2 size={56} />
                        <h3>Henüz Proje Tanımlanmamış</h3>
                        <p>Teklif oluşturmak için önce Yönetim Paneli'nden bir proje ekleyin.</p>
                        <a href="/realestate/admin" className="re-btn re-btn-primary">Yönetim Paneline Git</a>
                    </div>
                </div>
            )}

            {projects.length > 0 && (
                <>
                    {/* Adım Göstergesi */}
                    <WizardSteps current={step} />

                    <div className="re-wizard-layout">
                        {/* Sol: Adımlar */}
                        <div className="re-wizard-main">

                            {/* ── ADIM 1: Müşteri Bilgileri ── */}
                            {step === 1 && (
                                <div className="re-wizard-step-card">
                                    <div className="re-wizard-step-header">
                                        <User size={20} />
                                        <div>
                                            <h2>Müşteri Bilgileri</h2>
                                            <p>Müşterinin iletişim bilgilerini girin</p>
                                        </div>
                                    </div>
                                    <div className="re-wizard-step-body">
                                        <div className="re-form-row">
                                            {/* Kişi Arama — Autocomplete */}
                                            <div className="re-form-group" style={{ position: 'relative' }} ref={contactDropdownRef}>
                                                <label>Ad Soyad <span className="required">*</span></label>
                                                <div style={{ position: 'relative' }}>
                                                    <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--re-muted)', pointerEvents: 'none' }} />
                                                    <input
                                                        ref={contactSearchRef}
                                                        className="re-input"
                                                        placeholder="Kişi ara..."
                                                        style={{ paddingLeft: 34 }}
                                                        value={showContactDropdown ? contactSearch : (form.customerName || contactSearch)}
                                                        onFocus={() => { setShowContactDropdown(true); setContactSearch(form.customerName || ''); }}
                                                        onChange={e => {
                                                            setContactSearch(e.target.value);
                                                            setShowContactDropdown(true);
                                                            setSelectedContact(null);
                                                            setForm(f => ({ ...f, customerName: e.target.value }));
                                                        }}
                                                    />
                                                    {contactSearching && (
                                                        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                                                            <div style={{ width: 16, height: 16, border: '2px solid var(--re-border)', borderTopColor: 'var(--re-primary)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                                                        </div>
                                                    )}
                                                </div>
                                                {showContactDropdown && contactResults.length > 0 && (
                                                    <div style={{
                                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                                        background: 'white', border: '1px solid var(--re-border)',
                                                        borderRadius: 'var(--re-radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                                        maxHeight: 220, overflowY: 'auto', marginTop: 4,
                                                    }}>
                                                        {contactResults.map(c => (
                                                            <div key={c.id}
                                                                style={{
                                                                    padding: '10px 14px', cursor: 'pointer',
                                                                    borderBottom: '1px solid var(--re-border)',
                                                                    transition: 'background 0.1s',
                                                                }}
                                                                onMouseOver={e => e.currentTarget.style.background = 'rgba(26,82,118,0.06)'}
                                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                                onClick={() => handleSelectContact(c)}
                                                            >
                                                                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.fullName || c.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--re-muted)', display: 'flex', gap: 12 }}>
                                                                    {c.phone && <span>📱 {c.phone}</span>}
                                                                    {c.email && <span>✉️ {c.email}</span>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {showContactDropdown && contactSearch.length >= 2 && contactResults.length === 0 && !contactSearching && (
                                                    <div style={{
                                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                                        background: 'white', border: '1px solid var(--re-border)',
                                                        borderRadius: 'var(--re-radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                                        padding: '12px 14px', marginTop: 4,
                                                        fontSize: '0.8125rem', color: 'var(--re-muted)', textAlign: 'center',
                                                    }}>
                                                        Kişi bulunamadı — manuel girebilirsiniz
                                                    </div>
                                                )}
                                            </div>
                                            <div className="re-form-group">
                                                <label>Telefon</label>
                                                <input className="re-input" placeholder="+90 5XX XXX XX XX" value={form.customerPhone}
                                                    onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="re-form-row">
                                            <div className="re-form-group">
                                                <label>E-posta</label>
                                                <input className="re-input" placeholder="ahmet@email.com" value={form.customerEmail}
                                                    onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
                                            </div>
                                            <div className="re-form-group">
                                                <label>İlgilenen Temsilci</label>
                                                <select className="re-input re-select" value={form.agentName}
                                                    onChange={e => setForm(f => ({ ...f, agentName: e.target.value }))}>
                                                    <option value="">Temsilci seçin...</option>
                                                    {members.map(m => (
                                                        <option key={m.user?.id || m.id} value={m.user?.name || m.name}>
                                                            {m.user?.name || m.name} {m.role ? `(${m.role})` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── ADIM 2: Daire Seçimi ── */}
                            {step === 2 && (
                                <div className="re-wizard-step-card">
                                    <div className="re-wizard-step-header">
                                        <Home size={20} />
                                        <div>
                                            <h2>Daire Tipi Seçimi</h2>
                                            <p>{selectedProject?.name} — mevcut tipler</p>
                                        </div>
                                    </div>
                                    <div className="re-wizard-step-body">
                                        {aptTypes.length === 0 ? (
                                            <div className="re-empty" style={{ padding: '30px 0' }}>
                                                <Home size={40} />
                                                <h3>Daire tipi tanımlanmamış</h3>
                                                <p>Yönetim panelinden daire tiplerini ekleyin.</p>
                                            </div>
                                        ) : (
                                            <div className="re-apt-types-grid">
                                                {aptTypes.map(t => (
                                                    <div
                                                        key={t.id}
                                                        className={`re-apt-type-card ${selectedAptType?.id === t.id ? 'selected' : ''}`}
                                                        onClick={() => {
                                                            setSelectedAptType(t);
                                                            const cp = t.cashPrice || t.listPrice || 0;
                                                            const minRate = selectedCampaign?.minDownPaymentRate || 20;
                                                            const dp = Math.round(cp * minRate / 100);
                                                            setForm(f => ({ ...f, downPayment: dp, downPaymentRate: minRate }));
                                                        }}
                                                    >
                                                        {t.roomCount && <div className="re-apt-type-badge">{t.roomCount}</div>}
                                                        <div className="re-apt-type-name">{t.name}</div>
                                                        {t.netArea && <div className="re-apt-type-area">{t.netArea} m² Net {t.grossArea ? `/ ${t.grossArea} m² Brüt` : ''}</div>}
                                                        <div className="re-apt-type-price">{fmt(t.listPrice)}</div>
                                                        <div className="re-apt-type-price-label">Liste Fiyatı</div>
                                                        {selectedAptType?.id === t.id && (
                                                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--re-primary)', fontSize: '0.8125rem', fontWeight: 600 }}>
                                                                <Check size={14} /> Seçildi
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Kampanya Seçimi */}
                                        {campaigns.length > 0 && (
                                            <div style={{ marginTop: 24 }}>
                                                <div className="re-form-group">
                                                    <label>Ödeme Kampanyası</label>
                                                    <select className="re-input re-select"
                                                        value={selectedCampaign?.id || ''}
                                                        onChange={e => handleSelectCampaign(campaigns.find(c => c.id === e.target.value) || null)}>
                                                        <option value="">— Kampanya seçin —</option>
                                                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                                {selectedCampaign && (
                                                    <div style={{ padding: '12px 16px', background: 'rgba(26,82,118,0.06)', borderRadius: 8, fontSize: '0.8125rem', color: 'var(--re-primary)' }}>
                                                        <b>{selectedCampaign.name}</b> — Aylık %{selectedCampaign.monthlyInterestRate} | Maks. {selectedCampaign.maxInstallments} Taksit | Min. %{selectedCampaign.minDownPaymentRate} Peşinat
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── ADIM 3: Vade Süresi + Ödeme Yapısı ── */}
                            {step === 3 && (
                                <div className="re-wizard-step-card">
                                    <div className="re-wizard-step-header">
                                        <Calendar size={20} />
                                        <div>
                                            <h2>Vade & Ödeme Yapısı</h2>
                                            <p>Vade süresi ve ödeme detaylarını ayarlayın</p>
                                        </div>
                                    </div>
                                    <div className="re-wizard-step-body">
                                        {/* Faiz Oranı Bilgisi / Girişi */}
                                        <div style={{ padding: '12px 16px', background: 'rgba(26,82,118,0.06)', borderRadius: 10, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--re-muted)', marginBottom: 4 }}>Aylık Faiz Oranı</div>
                                                {selectedCampaign ? (
                                                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--re-primary)' }}>
                                                        %{selectedCampaign.monthlyInterestRate}
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 8, color: 'var(--re-muted)' }}>{selectedCampaign.name}</span>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <input
                                                            className="re-input"
                                                            type="number"
                                                            step="0.1"
                                                            min="0"
                                                            placeholder="Ör: 1.5"
                                                            style={{ width: 110, fontWeight: 700, fontSize: '1rem' }}
                                                            value={form.manualInterestRate}
                                                            onChange={e => setForm(f => ({ ...f, manualInterestRate: e.target.value }))}
                                                        />
                                                        <span style={{ fontSize: '0.875rem', color: 'var(--re-muted)' }}>% / ay</span>
                                                    </div>
                                                )}
                                            </div>
                                            {form.installmentCount > 0 && (parseFloat(form.manualInterestRate) > 0 || (selectedCampaign?.monthlyInterestRate > 0)) && (
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--re-muted)', marginBottom: 4 }}>Uygulanan Faiz</div>
                                                    <div style={{ fontWeight: 700, color: 'var(--re-primary)' }}>
                                                        %{((selectedCampaign?.monthlyInterestRate ?? parseFloat(form.manualInterestRate) ?? 0) * form.installmentCount).toFixed(1)} Toplam
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Vade Seçimi */}
                                        <div className="re-form-group">
                                            <label style={{ fontWeight: 600, marginBottom: 10, display: 'block' }}>Vade Süresi</label>
                                            <div className="re-vade-grid">
                                                {VADE_OPTIONS
                                                    .filter(v => !selectedCampaign || v.months === 0 || v.months <= selectedCampaign.maxInstallments)
                                                    .map(v => (
                                                        <button
                                                            key={v.months}
                                                            className={`re-vade-btn ${form.installmentCount === v.months ? 'selected' : ''}`}
                                                            onClick={() => {
                                                                setPaymentConfigured(true);
                                                                const base = _getPriceBase();
                                                                if (v.months === 0) {
                                                                    setForm(f => ({ ...f, installmentCount: 0, downPayment: Math.round(base), downPaymentRate: 100 }));
                                                                    return;
                                                                }
                                                                setForm(f => ({ ...f, installmentCount: v.months }));
                                                                // Kampanya min peşinatını uygula
                                                                if (selectedCampaign && selectedCampaign.minDownPaymentRate) {
                                                                    const cp = selectedAptType?.cashPrice || selectedAptType?.listPrice || 0;
                                                                    const lp = selectedAptType?.listPrice || cp;
                                                                    const isZeroIR = selectedCampaign.monthlyInterestRate === 0;
                                                                    const base = isZeroIR ? lp : cp;
                                                                    const currentMinDP = selectedCampaign.minDownPaymentFixed || (base * (selectedCampaign.minDownPaymentRate || 0) / 100);
                                                                    if (form.downPayment < currentMinDP) {
                                                                        const rate = base > 0 ? (currentMinDP / base) * 100 : selectedCampaign.minDownPaymentRate;
                                                                        setForm(f => ({ ...f, installmentCount: v.months, downPayment: Math.round(currentMinDP), downPaymentRate: rate }));
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            {v.label}
                                                        </button>
                                                    ))}
                                            </div>

                                            {/* Emlak Konut — Sıfır Faiz Kampanyası Bilgisi */}
                                            {isZeroIRActive && form.installmentCount > 0 && (
                                                <div style={{
                                                    marginTop: 12, padding: '10px 14px',
                                                    background: activeRenderTier
                                                        ? 'linear-gradient(135deg, rgba(39,174,96,0.08), rgba(39,174,96,0.04))'
                                                        : 'linear-gradient(135deg, rgba(26,82,118,0.08), rgba(26,82,118,0.04))',
                                                    border: activeRenderTier
                                                        ? '1px solid rgba(39,174,96,0.3)'
                                                        : '1px solid rgba(26,82,118,0.2)',
                                                    borderRadius: 8, fontSize: '0.8125rem',
                                                    color: activeRenderTier ? '#1e8449' : 'var(--re-primary)',
                                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                                }}>
                                                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>{activeRenderTier ? '🟢' : 'ℹ️'}</span>
                                                    <div>
                                                        {activeRenderTier ? (
                                                            <>
                                                                <b>{activeRenderTier.label || `${form.installmentCount} Ay`} — %{activeRenderTier.discountRate} İndirim Uygulanır</b><br />
                                                                Liste fiyatı: <b>{fmt(listPriceForCalc)}</b> →
                                                                İndirimli fiyat: <b>{fmt(Math.round(listPriceForCalc * (1 - activeRenderTier.discountRate / 100)))}</b>
                                                                {flexMinRate != null && (
                                                                    <span style={{ display: 'block', marginTop: 4 }}>
                                                                        Peşinat: min %{selectedCampaign.minDownPaymentRate} (standart) · min %{flexMinRate} (esnek)
                                                                    </span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <b>{form.installmentCount} Ay — {isMaxInstRender ? 'Liste Fiyatı (İndirimsiz)' : 'Seçili Vade'}</b><br />
                                                                Sıfır faizli hesaplama: <b>{fmt(listPriceForCalc)}</b> üzerinden
                                                                {flexMinRate != null && (
                                                                    <span style={{ display: 'block', marginTop: 4 }}>
                                                                        Peşinat: min %{selectedCampaign.minDownPaymentRate} (standart) · min %{flexMinRate} (esnek)
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Tüm Vade İndirimleri — Özet Tablo */}
                                            {isZeroIRActive && renderDiscountTiers.length > 0 && (
                                                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    {renderDiscountTiers.map((t, i) => (
                                                        <span key={i} style={{
                                                            fontSize: '0.75rem', padding: '3px 10px',
                                                            background: form.installmentCount === t.months
                                                                ? 'rgba(39,174,96,0.15)' : 'rgba(26,82,118,0.06)',
                                                            color: form.installmentCount === t.months ? '#1e8449' : 'var(--re-muted)',
                                                            border: form.installmentCount === t.months
                                                                ? '1px solid rgba(39,174,96,0.4)' : '1px solid var(--re-border)',
                                                            borderRadius: 20, fontWeight: 600, cursor: 'pointer',
                                                        }}
                                                        onClick={() => setForm(f => ({ ...f, installmentCount: t.months }))}>
                                                            {t.months}A %{t.discountRate}↓
                                                        </span>
                                                    ))}
                                                    <span style={{
                                                        fontSize: '0.75rem', padding: '3px 10px',
                                                        background: form.installmentCount === selectedCampaign.maxInstallments
                                                            ? 'rgba(26,82,118,0.15)' : 'rgba(26,82,118,0.04)',
                                                        color: 'var(--re-primary)',
                                                        border: '1px solid rgba(26,82,118,0.2)',
                                                        borderRadius: 20, fontWeight: 600, cursor: 'pointer',
                                                    }}
                                                    onClick={() => setForm(f => ({ ...f, installmentCount: selectedCampaign.maxInstallments }))}>
                                                        {selectedCampaign.maxInstallments}A Liste
                                                    </span>
                                                </div>
                                            )}

                                            {selectedCampaign && form.installmentCount > 0 && !isZeroIRActive && (
                                                <p style={{ marginTop: 10, fontSize: '0.8125rem', color: 'var(--re-muted)' }}>
                                                    Seçilen kampanya ({selectedCampaign.name}) için maks. {selectedCampaign.maxInstallments} aya kadar taksit seçilebilir.
                                                </p>
                                            )}
                                        </div>

                                        <hr style={{ border: 'none', borderTop: '1px solid var(--re-border)', margin: '20px 0' }} />

                                        {/* Peşinat slider — taksitli seçimlerde göster */}
                                        {form.installmentCount > 0 ? (
                                        <div className="re-form-group">
                                            <label style={{ fontWeight: 600, marginBottom: 10, display: 'block' }}>Ödeme Yapısı</label>
                                            <label>Peşinat Oranı ve Tutarı</label>
                                            <div className="re-slider-wrapper">
                                                <div className="re-slider-labels">
                                                    <span>%{effectiveMinDPRate.toFixed(0)} Min</span>
                                                    <span className="re-slider-value">%{dpPct.toFixed(1)} — {fmt(dp)}</span>
                                                    <span>%100</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    className="re-slider"
                                                    min={effectiveMinDPRate}
                                                    max={100}
                                                    step={0.5}
                                                    value={dpPct}
                                                    style={{ '--value': `${sliderPct}%` }}
                                                    onChange={e => handleDownPaymentRate(parseFloat(e.target.value))}
                                                />
                                            </div>
                                            <div className="re-form-row" style={{ marginTop: 10 }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--re-muted)' }}>Tutar (TL)</label>
                                                    <input className="re-input" type="number"
                                                        min={minDP} max={priceBase}
                                                        value={dp}
                                                        onChange={e => handleDownPaymentAmt(parseFloat(e.target.value) || 0)} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--re-muted)' }}>Oran (%)</label>
                                                    <input className="re-input" type="number"
                                                        min={effectiveMinDPRate} max={100} step={0.5}
                                                        value={dpPct.toFixed(1)}
                                                        onChange={e => handleDownPaymentRate(parseFloat(e.target.value) || 0)} />
                                                </div>
                                            </div>
                                        </div>
                                        ) : (
                                        <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, rgba(30,132,73,0.08), rgba(30,132,73,0.03))', border: '1px solid rgba(30,132,73,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#d5f5e3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e8449', fontWeight: 800, fontSize: '0.9rem' }}>✓</div>
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#1e8449', fontSize: '0.95rem' }}>Peşin Ödeme — %100</div>
                                                <div style={{ fontSize: '0.82rem', color: '#27ae60', marginTop: 2 }}>Toplam: {fmt(priceBase)}</div>
                                            </div>
                                        </div>
                                        )}

                                        {/* Kalan bakiye */}
                                        {calc && form.installmentCount > 0 && (
                                            <div style={{ padding: '10px 16px', background: 'rgba(26,82,118,0.05)', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem', color: 'var(--re-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <span>Taksitlendirilecek Bakiye: <b>{fmt(calc.remaining)}</b> → {form.installmentCount} × <b>{fmt(calc.monthly)}</b>/ay</span>
                                                {calc.isManualMonthly && (
                                                    <span style={{ fontSize: '0.75rem', background: 'rgba(171,44,43,0.12)', color: '#922b21', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Manuel Mod</span>
                                                )}
                                            </div>
                                        )}

                                        {/* Manuel Taksit Tutarı */}
                                        {form.installmentCount > 0 && (
                                            <div className="re-form-group" style={{ marginBottom: 16 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <label style={{ margin: 0 }}>Aylık Taksit Tutarı</label>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.8125rem', color: form.manualMonthlyEnabled ? 'var(--re-primary)' : 'var(--re-muted)', fontWeight: 600, userSelect: 'none' }}>
                                                        <div
                                                            onClick={() => setForm(f => ({ ...f, manualMonthlyEnabled: !f.manualMonthlyEnabled, manualMonthly: '' }))}
                                                            style={{
                                                                width: 36, height: 20, borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s',
                                                                background: form.manualMonthlyEnabled ? 'var(--re-primary)' : 'var(--re-border)',
                                                                position: 'relative', flexShrink: 0,
                                                            }}
                                                        >
                                                            <div style={{
                                                                position: 'absolute', top: 2, left: form.manualMonthlyEnabled ? 18 : 2,
                                                                width: 16, height: 16, background: 'white', borderRadius: '50%',
                                                                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                            }} />
                                                        </div>
                                                        Manuel Giriş
                                                    </label>
                                                </div>
                                                {form.manualMonthlyEnabled ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <input
                                                            className="re-input"
                                                            type="number"
                                                            min="0"
                                                            step="100"
                                                            placeholder="Örn: 15.000"
                                                            value={form.manualMonthly}
                                                            onChange={e => setForm(f => ({ ...f, manualMonthly: e.target.value }))}
                                                            style={{ flex: 1 }}
                                                        />
                                                        <span style={{ fontSize: '0.875rem', color: 'var(--re-muted)', whiteSpace: 'nowrap' }}>TL / ay</span>
                                                    </div>
                                                ) : (
                                                    <div style={{
                                                        padding: '10px 14px', background: 'rgba(26,82,118,0.04)',
                                                        border: '1px solid var(--re-border)', borderRadius: 8,
                                                        fontSize: '0.9rem', fontWeight: 600, color: 'var(--re-primary)',
                                                    }}>
                                                        {calc ? fmt(calc.monthly) : '—'} <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--re-muted)' }}>/ay (otomatik hesaplanıyor)</span>
                                                    </div>
                                                )}
                                                {form.manualMonthlyEnabled && (
                                                    <p style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--re-muted)', lineHeight: 1.5 }}>
                                                        ⚠️ Manuel mod: Girdiğiniz tutar baz alınır. Toplam ödeme = Peşinat + Ara Ödemeler + (Taksit × Ay Sayısı).
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {/* Ara Ödemeler */}
                                        <div className="re-form-group">
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <label>Ara Ödemeler (Opsiyonel)</label>
                                                <button className="re-btn re-btn-outline re-btn-sm" onClick={addInterim}>
                                                    <Plus size={14} /> Ara Ödeme Ekle
                                                </button>
                                            </div>
                                            <div className="re-interim-list">
                                                {form.interimPayments.map((ip, i) => (
                                                    <div className="re-interim-item" key={i}>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', color: 'var(--re-muted)' }}>Ay</label>
                                                            <select className="re-input re-select" value={ip.month}
                                                                onChange={e => updateInterim(i, 'month', e.target.value)}>
                                                                {[3, 6, 9, 12, 18, 24].map(m => <option key={m} value={m}>{m}. Ay</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', color: 'var(--re-muted)' }}>Tutar (TL)</label>
                                                            <input className="re-input" type="number" placeholder="0"
                                                                value={ip.amount}
                                                                onChange={e => updateInterim(i, 'amount', e.target.value)} />
                                                        </div>
                                                        <button className="re-btn re-btn-danger re-btn-sm" onClick={() => removeInterim(i)} style={{ marginTop: 18 }}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Ödeme Takvimi Önizleme */}
                                        {calc && cashPrice > 0 && (
                                            <div style={{ marginTop: 20 }}>
                                                <div className="re-card-header">
                                                    <span className="re-card-title">📅 Ödeme Takvimi Özeti</span>
                                                </div>
                                                <table className="re-schedule-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Kalem</th>
                                                            <th>Vade</th>
                                                            <th>Tutar</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr className="type-down_payment">
                                                            <td>Peşinat</td>
                                                            <td>0. Gün</td>
                                                            <td>{fmt(dp)}</td>
                                                        </tr>
                                                        {form.interimPayments.map((ip, i) => (
                                                            <tr className="type-interim" key={i}>
                                                                <td>Ara Ödeme ({i + 1})</td>
                                                                <td>{ip.month}. Ay</td>
                                                                <td>{fmt(ip.amount)}</td>
                                                            </tr>
                                                        ))}
                                                        {form.installmentCount > 0 && (
                                                            <tr>
                                                                <td>{form.installmentCount} Taksit</td>
                                                                <td>1–{form.installmentCount}. Ay</td>
                                                                <td>{fmt(calc.monthly)}/ay</td>
                                                            </tr>
                                                        )}
                                                        <tr style={{ fontWeight: 700 }}>
                                                            <td colSpan={2}>Toplam Ödeme</td>
                                                            <td>{fmt(calc.totalPayable)}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── Navigasyon Butonları ── */}
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                                <button
                                    className="re-btn re-btn-outline"
                                    onClick={() => setStep(s => Math.max(1, s - 1))}
                                    disabled={step === 1}
                                >
                                    <ChevronLeft size={16} /> Geri
                                </button>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    {step === 3 && (
                                        <button
                                            className="re-btn re-btn-accent"
                                            onClick={handleSave}
                                            disabled={saving}
                                        >
                                            <Save size={16} />
                                            {saving ? 'Kaydediliyor...' : 'Teklifi Kaydet'}
                                        </button>
                                    )}
                                    {step < 3 && (
                                        <button
                                            className="re-btn re-btn-primary"
                                            onClick={() => setStep(s => Math.min(3, s + 1))}
                                        >
                                            İleri <ChevronRight size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Sağ: Özet Panel — sadece 3. adımda göster */}
                        {step === 3 && (
                            <SummaryPanel form={{ ...form, downPaymentRate: dpPct }} selected={selectedAptType} calc={calc} paymentConfigured={paymentConfigured} />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
