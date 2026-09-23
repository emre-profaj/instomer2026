import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import {
    Megaphone, Users, MessageSquare, Phone, Calendar, Clock,
    CheckCircle2, Sparkles, Upload, Image as ImageIcon, AlertCircle,
    ChevronRight, ArrowLeft, ArrowRight, X, Loader2, Tag, Layers,
    RotateCcw, Repeat, Zap, CalendarDays, Plus, Trash2, ShieldCheck,
    Mail, Smartphone
} from 'lucide-react';

export default function CampaignWizardModal({ workspaceId, isOpen, onClose, onSuccess }) {
    if (!isOpen) return null;

    // Wizard Step: 1 = Kampanya Türü & Hedef Kitle, 2 = Gruplar & Kanallar, 3 = Zamanlama & Hız, 4 = Özet & Başlat
    const [step, setStep] = useState(1);

    // ── 4 TEMEL KAMPANYA TÜRÜ ───────────────────────────────────────
    // ONE_TIME: Tek Seferlik (Urla One Lansmanı, Anlık Duyuru)
    // RECURRING: Tekrarlı Gönderim (Haftalık / Aylık Bülten)
    // EVENT_BASED: Olay Bazlı (30 Gündür Aranmayan Lead, X Akışına Geçenler)
    // DAY_BASED: Gün / Süreç Bazlı (90-100-120 Gün Pasif, 60 Gün Müşteri, Doğum Günü)
    const [campaignType, setCampaignType] = useState('ONE_TIME');

    // Tekrarlı Gönderim Ayarları
    const [recurringFrequency, setRecurringFrequency] = useState('WEEKLY'); // WEEKLY, MONTHLY, BIWEEKLY, DAILY
    const [recurringDayOfWeek, setRecurringDayOfWeek] = useState(1); // 1 = Pazartesi
    const [recurringDayOfMonth, setRecurringDayOfMonth] = useState(1);
    const [recurringTime, setRecurringTime] = useState('10:00');

    // Olay Bazlı Ayarlar
    const [eventTrigger, setEventTrigger] = useState('UNCONTACTED_LEAD'); // UNCONTACTED_LEAD, STAGE_CHANGE, NEW_LEAD
    const [uncontactedDays, setUncontactedDays] = useState(30);

    // Gün Bazlı Ayarlar
    const [dayTrigger, setDayTrigger] = useState('INACTIVE_DAYS'); // INACTIVE_DAYS, CUSTOMER_AGE_DAYS, BIRTHDAY
    const [dayMilestoneDays, setDayMilestoneDays] = useState(90);

    // Otomatik Yeniden Deneme (Auto-retry)
    const [autoRetry, setAutoRetry] = useState(true);
    const [maxRetries, setMaxRetries] = useState(3);
    const [retryIntervalMinutes, setRetryIntervalMinutes] = useState(15);

    // Kampanya Genel Bilgileri
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [budget, setBudget] = useState('');

    // Hedef Kitle
    const [audienceType, setAudienceType] = useState('SEGMENT'); // 'SEGMENT' | 'TAGS' | 'LIST' | 'ALL'
    const [availableTags, setAvailableTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    const [tagSearch, setTagSearch] = useState('');
    const [smartSegments, setSmartSegments] = useState([]);
    const [selectedSegmentIds, setSelectedSegmentIds] = useState([]);
    const [contactGroups, setContactGroups] = useState([]);
    const [selectedListIds, setSelectedListIds] = useState([]);

    // Audience Preview State
    const [previewCount, setPreviewCount] = useState(null);
    const [previewSamples, setPreviewSamples] = useState([]);
    const [previewLoading, setPreviewLoading] = useState(false);

    // ── ÇOKLU GRUP / AD SETS YÖNETİCİSİ ──────────────────────────
    const [groups, setGroups] = useState([
        {
            id: 'g_1',
            name: 'Grup 1: WhatsApp Duyurusu',
            channel: 'WHATSAPP',
            delayDays: 0,
            targetMilestone: 'IMMEDIATE',
            templateName: '',
            bodyText: '',
            headerMediaUrl: '',
            agentId: '',
            callTemplate: ''
        }
    ]);

    // Kaynaklar (WhatsApp Şablonları & AI Arama Şablonları)
    const [waTemplates, setWaTemplates] = useState([]);
    const [retellAgents, setRetellAgents] = useState([]);
    const [callTemplates, setCallTemplates] = useState([]);

    // Zamanlama & Hız
    const [scheduleType, setScheduleType] = useState('IMMEDIATE'); // 'IMMEDIATE' | 'SCHEDULED'
    const [scheduledAt, setScheduledAt] = useState('');
    const [sendRate, setSendRate] = useState(20);

    // Gönderim Durumu
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // ─────────────────────────────────────────────────────────────────
    // Initial Data Fetching
    // ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!workspaceId) return;

        // 1. Etiketler
        api.get(`/contacts/${workspaceId}?limit=1`)
            .then(res => {
                if (res.data?.allTags) setAvailableTags(res.data.allTags);
            })
            .catch(() => {});

        // 2. Akıllı Segmentler
        api.get(`/smart-segments/${workspaceId}/segments/definitions`)
            .then(res => {
                if (res.data?.segments) {
                    setSmartSegments(res.data.segments);
                }
            })
            .catch(() => {});

        // 3. Kayıtlı Listeler
        api.get(`/contact-groups/${workspaceId}/groups`)
            .then(res => {
                const list = res.data?.groups || res.data || [];
                setContactGroups(Array.isArray(list) ? list : []);
            })
            .catch(() => {});

        // 4. WhatsApp Şablonları
        api.get(`/automations/${workspaceId}/templates`)
            .then(res => {
                const tpls = res.data?.templates || [];
                setWaTemplates(tpls);
                const approved = tpls.filter(t => t.status === 'APPROVED');
                const defaultTpl = approved[0] || tpls[0];
                if (defaultTpl) {
                    setGroups(prev => prev.map(g => g.channel === 'WHATSAPP' && !g.templateName ? { ...g, templateName: defaultTpl.name } : g));
                }
            })
            .catch(() => {});

        // 5. AI Sesli Arama Asistanları
        api.get(`/retell/${workspaceId}/agents`)
            .then(res => {
                const agents = res.data?.agents || res.data || [];
                setRetellAgents(Array.isArray(agents) ? agents : []);
            })
            .catch(() => {});

        // 6. AI Arama Şablonları
        api.get(`/retell/${workspaceId}/templates`)
            .then(res => {
                const tpls = res.data?.templates || res.data || [];
                setCallTemplates(Array.isArray(tpls) ? tpls.filter(t => t.isActive !== false) : []);
            })
            .catch(() => {});

    }, [workspaceId]);

    // ─────────────────────────────────────────────────────────────────
    // Audience Preview Handler
    // ─────────────────────────────────────────────────────────────────
    const updateAudiencePreview = useCallback(async () => {
        if (!workspaceId) return;
        setPreviewLoading(true);
        try {
            const payload = {
                audienceType,
                tagNames: audienceType === 'TAGS' ? selectedTags : [],
                segmentId: audienceType === 'SEGMENT' && selectedSegmentIds.length > 0 ? selectedSegmentIds[0] : null,
                segmentIds: audienceType === 'SEGMENT' ? selectedSegmentIds : [],
                listId: audienceType === 'LIST' && selectedListIds.length > 0 ? selectedListIds[0] : null,
                listIds: audienceType === 'LIST' ? selectedListIds : []
            };
            const res = await api.post(`/marketing-v2/${workspaceId}/preview-audience`, payload);
            if (res.data?.success) {
                setPreviewCount(res.data.count);
                setPreviewSamples(res.data.sampleContacts || []);
            }
        } catch {
            setPreviewCount(null);
        } finally {
            setPreviewLoading(false);
        }
    }, [workspaceId, audienceType, selectedTags, selectedSegmentIds, selectedListIds]);

    useEffect(() => {
        const timer = setTimeout(() => {
            updateAudiencePreview();
        }, 300);
        return () => clearTimeout(timer);
    }, [updateAudiencePreview]);

    // ─────────────────────────────────────────────────────────────────
    // PRESET YARDIMCILARI (Örnek Şablonları Doldurma)
    // ─────────────────────────────────────────────────────────────────
    const applyPreset = (presetType) => {
        const defaultWa = waTemplates.find(t => t.status === 'APPROVED')?.name || waTemplates[0]?.name || 'genel_sablon';
        const defaultAgent = retellAgents[0]?.agent_id || retellAgents[0]?.id || '';

        if (presetType === 'PASIF_UYE') {
            setName('Pasif Üye Reaktivasyon');
            setDescription('90 ve 120 gündür sessiz kalan üyelere WhatsApp ve sesli arama hatırlatması');
            setCampaignType('DAY_BASED');
            setDayTrigger('INACTIVE_DAYS');
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp (90. Gün)',
                    channel: 'WHATSAPP',
                    delayDays: 90,
                    targetMilestone: 'DAY_90',
                    templateName: defaultWa,
                    bodyText: ''
                },
                {
                    id: 'g_2',
                    name: 'Grup 2: AI Sesli Arama (90. Gün)',
                    channel: 'AI_CALL',
                    delayDays: 90,
                    targetMilestone: 'DAY_90',
                    agentId: defaultAgent,
                    callTemplate: 'Merhaba, uzun zamandır görüşemedik, size özel yeni fırsatlarımız hakkında bilgi vermek istedim.'
                },
                {
                    id: 'g_3',
                    name: 'Grup 3: WhatsApp (120. Gün)',
                    channel: 'WHATSAPP',
                    delayDays: 120,
                    targetMilestone: 'DAY_120',
                    templateName: defaultWa,
                    bodyText: ''
                },
                {
                    id: 'g_4',
                    name: 'Grup 4: AI Sesli Arama (120. Gün)',
                    channel: 'AI_CALL',
                    delayDays: 120,
                    targetMilestone: 'DAY_120',
                    agentId: defaultAgent,
                    callTemplate: 'Merhaba, tekrar rahatsız ediyorum, avantajlı teklifimiz sona ermeden paylaşmak istedik.'
                }
            ]);
            // İlgili akıllı segmenti seç (varsa INACTIVE_30D veya benzeri)
            const inactiveSeg = smartSegments.find(s => s.id.includes('INACTIVE'));
            if (inactiveSeg) setSelectedSegmentIds([inactiveSeg.id]);
        } else if (presetType === 'YENI_PROJE') {
            setName('Urla One Proje Lansmanı');
            setDescription('Urla One yeni proje duyurusu: WhatsApp şablonu ve AI sesli arama');
            setCampaignType('ONE_TIME');
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: Urla One WhatsApp Şablon 1',
                    channel: 'WHATSAPP',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    templateName: defaultWa,
                    bodyText: ''
                },
                {
                    id: 'g_2',
                    name: 'Grup 2: Urla One AI Sesli Arama 1',
                    channel: 'AI_CALL',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    agentId: defaultAgent,
                    callTemplate: 'Urla One projemiz satışa çıktı, detaylı bilgi aktarmak için arıyorum.'
                }
            ]);
        } else if (presetType === 'UNCONTACTED_LEAD') {
            setName('30 Gün Aranmayan Lead Takibi');
            setDescription('30 gündür aranmamış potansiyel müşterilere otomatik lead hatırlatması');
            setCampaignType('EVENT_BASED');
            setEventTrigger('UNCONTACTED_LEAD');
            setUncontactedDays(30);
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp Hatırlatma Bildirimi',
                    channel: 'WHATSAPP',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    templateName: defaultWa,
                    bodyText: ''
                },
                {
                    id: 'g_2',
                    name: 'Grup 2: AI Sesli Arama',
                    channel: 'AI_CALL',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    agentId: defaultAgent,
                    callTemplate: 'Talebiniz üzerine geri dönüş sağlıyorum.'
                }
            ]);
        } else if (presetType === 'BAYRAM_KUTLAMA') {
            // ── Tek Seferlik: Yılbaşı / Bayram Kutlaması ──
            setName('Yılbaşı / Bayram Kutlama Mesajı');
            setDescription('Tüm müşterilere tek seferlik kutlama mesajı gönderimi');
            setCampaignType('ONE_TIME');
            setAudienceType('ALL');
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp Kutlama',
                    channel: 'WHATSAPP',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    templateName: defaultWa,
                    bodyText: ''
                }
            ]);
        } else if (presetType === 'FIYAT_GUNCELLEME') {
            // ── Tek Seferlik: Fiyat Güncelleme Duyurusu ──
            setName('Fiyat Güncelleme Duyurusu');
            setDescription('Tüm müşterilere fiyat değişikliği duyurusu');
            setCampaignType('ONE_TIME');
            setAudienceType('ALL');
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp Fiyat Duyurusu',
                    channel: 'WHATSAPP',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    templateName: defaultWa,
                    bodyText: ''
                },
                {
                    id: 'g_2',
                    name: 'Grup 2: E-posta Fiyat Duyurusu',
                    channel: 'EMAIL',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    emailSubject: 'Fiyat Güncelleme Bildirimi',
                    emailBody: ''
                }
            ]);
        } else if (presetType === 'HAFTALIK_BULTEN') {
            // ── Tekrarlı: Haftalık Bülten ──
            setName('Haftalık Bülten');
            setDescription('Her hafta belirlenen günde müşterilere WhatsApp bülten gönderimi');
            setCampaignType('RECURRING');
            setRecurringFrequency('WEEKLY');
            setRecurringDayOfWeek(1);
            setRecurringTime('10:00');
            setAudienceType('SEGMENT');
            const weekSeg = smartSegments.find(s => s.id.includes('WEEK') || s.id.includes('THIS_WEEK'));
            if (weekSeg) setSelectedSegmentIds([weekSeg.id]);
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp Haftalık Bülten',
                    channel: 'WHATSAPP',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    templateName: defaultWa,
                    bodyText: ''
                }
            ]);
        } else if (presetType === 'AYLIK_RAPOR') {
            // ── Tekrarlı: Aylık Durum Raporu ──
            setName('Aylık Durum Raporu');
            setDescription('Her ayın 1\'inde müşterilere WhatsApp ve E-posta ile özet rapor');
            setCampaignType('RECURRING');
            setRecurringFrequency('MONTHLY');
            setRecurringDayOfMonth(1);
            setRecurringTime('09:00');
            setAudienceType('ALL');
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp Aylık Rapor',
                    channel: 'WHATSAPP',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    templateName: defaultWa,
                    bodyText: ''
                },
                {
                    id: 'g_2',
                    name: 'Grup 2: E-posta Aylık Rapor',
                    channel: 'EMAIL',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    emailSubject: 'Aylık Durum Raporunuz',
                    emailBody: ''
                }
            ]);
        } else if (presetType === 'YENI_LEAD_HOSGELDIN') {
            // ── Olay Bazlı: Yeni Lead Hoşgeldin ──
            setName('Yeni Lead Hoşgeldin Akışı');
            setDescription('Yeni lead geldiğinde otomatik hoşgeldin mesajı ve AI araması');
            setCampaignType('EVENT_BASED');
            setEventTrigger('NEW_LEAD');
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp Hoşgeldin',
                    channel: 'WHATSAPP',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    templateName: defaultWa,
                    bodyText: ''
                },
                {
                    id: 'g_2',
                    name: 'Grup 2: AI Tanışma Araması',
                    channel: 'AI_CALL',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    agentId: defaultAgent,
                    callTemplate: 'Merhaba, başvurunuz için teşekkür ederiz. Size projemiz hakkında bilgi vermek istiyorum.'
                }
            ]);
        } else if (presetType === 'ASAMA_DEGISIKLIK') {
            // ── Olay Bazlı: Aşama Değişikliğinde Bilgilendirme ──
            setName('Aşama Değişikliği Bildirimi');
            setDescription('Müşteri akışta yeni aşamaya geçtiğinde otomatik bilgilendirme mesajı');
            setCampaignType('EVENT_BASED');
            setEventTrigger('STAGE_CHANGE');
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp Bilgilendirme',
                    channel: 'WHATSAPP',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    templateName: defaultWa,
                    bodyText: ''
                }
            ]);
        } else if (presetType === 'DOGUM_GUNU') {
            // ── Gün Bazlı: Doğum Günü Tebriği ──
            setName('Doğum Günü Kutlaması');
            setDescription('Doğum günü olan müşterilere otomatik kutlama mesajı');
            setCampaignType('DAY_BASED');
            setDayTrigger('BIRTHDAY');
            setAudienceType('ALL');
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp Doğum Günü Kutlaması',
                    channel: 'WHATSAPP',
                    delayDays: 0,
                    targetMilestone: 'IMMEDIATE',
                    templateName: defaultWa,
                    bodyText: ''
                }
            ]);
        } else if (presetType === 'MUSTERI_60_GUN') {
            // ── Gün Bazlı: 60 Günlük Müşteri Kutlaması ──
            setName('60 Günlük Müşteri Kutlaması');
            setDescription('60 gündür müşteri olanlara teşekkür ve sadakat mesajı');
            setCampaignType('DAY_BASED');
            setDayTrigger('CUSTOMER_AGE_DAYS');
            setDayMilestoneDays(60);
            setAudienceType('ALL');
            setGroups([
                {
                    id: 'g_1',
                    name: 'Grup 1: WhatsApp Teşekkür Mesajı',
                    channel: 'WHATSAPP',
                    delayDays: 60,
                    targetMilestone: 'DAY_60',
                    templateName: defaultWa,
                    bodyText: ''
                },
                {
                    id: 'g_2',
                    name: 'Grup 2: AI Teşekkür Araması',
                    channel: 'AI_CALL',
                    delayDays: 60,
                    targetMilestone: 'DAY_60',
                    agentId: defaultAgent,
                    callTemplate: 'Merhaba, sizi 60 gündür aramızda görmekten mutluluk duyuyoruz. Size özel fırsatlarımızı paylaşmak istedik.'
                }
            ]);
        }
    };

    // ── Grup Ekleme / Silme / Güncelleme ────────────────────────────
    const addGroup = () => {
        const nextIdx = groups.length + 1;
        const defaultWa = waTemplates.find(t => t.status === 'APPROVED')?.name || waTemplates[0]?.name || '';
        setGroups(prev => [
            ...prev,
            {
                id: `g_${Date.now()}`,
                name: `Grup ${nextIdx}: WhatsApp`,
                channel: 'WHATSAPP',
                delayDays: 0,
                targetMilestone: 'IMMEDIATE',
                templateName: defaultWa,
                bodyText: '',
                agentId: '',
                callTemplate: ''
            }
        ]);
    };

    const updateGroup = (id, field, value) => {
        setGroups(prev => prev.map(g => {
            if (g.id !== id) return g;
            const updated = { ...g, [field]: value };
            // Kanal değiştiğinde isim veya şablonu uyarla
            if (field === 'channel') {
                if (value === 'WHATSAPP' && !updated.templateName) {
                    updated.templateName = waTemplates[0]?.name || '';
                } else if (value === 'AI_CALL') {
                    if (callTemplates.length > 0 && !updated.callTemplateId) {
                        updated.callTemplateId = callTemplates[0]?.id || '';
                    } else if (!updated.agentId) {
                        updated.agentId = retellAgents[0]?.agent_id || retellAgents[0]?.id || '';
                    }
                }
            }
            return updated;
        }));
    };

    const removeGroup = (id) => {
        if (groups.length <= 1) return;
        setGroups(prev => prev.filter(g => g.id !== id));
    };

    // ─────────────────────────────────────────────────────────────────
    // Launch / Submit Handler
    // ─────────────────────────────────────────────────────────────────
    const handleLaunch = async () => {
        if (!name.trim()) {
            setErrorMsg('Lütfen kampanya adını girin');
            return;
        }

        setSubmitting(true);
        setErrorMsg('');

        try {
            const payload = {
                name,
                description,
                budget: budget ? parseFloat(budget) : null,
                campaignType,
                recurringConfig: campaignType === 'RECURRING' ? {
                    frequency: recurringFrequency,
                    dayOfWeek: recurringDayOfWeek,
                    dayOfMonth: recurringDayOfMonth,
                    time: recurringTime
                } : undefined,
                eventTrigger: campaignType === 'EVENT_BASED' ? eventTrigger : undefined,
                eventConfig: campaignType === 'EVENT_BASED' ? { uncontactedDays: Number(uncontactedDays) } : undefined,
                dayTrigger: campaignType === 'DAY_BASED' ? dayTrigger : undefined,
                dayConfig: campaignType === 'DAY_BASED' ? { days: Number(dayMilestoneDays) } : undefined,
                autoRetry,
                maxRetries: Number(maxRetries),
                retryIntervalMinutes: Number(retryIntervalMinutes),
                audienceType,
                tagNames: audienceType === 'TAGS' ? selectedTags : [],
                segmentId: audienceType === 'SEGMENT' && selectedSegmentIds.length > 0 ? selectedSegmentIds[0] : null,
                segmentIds: audienceType === 'SEGMENT' ? selectedSegmentIds : [],
                listId: audienceType === 'LIST' && selectedListIds.length > 0 ? selectedListIds[0] : null,
                listIds: audienceType === 'LIST' ? selectedListIds : [],
                groups: groups.map((g, idx) => ({
                    name: g.name || `Grup ${idx + 1}`,
                    channel: g.channel,
                    delayDays: parseInt(g.delayDays, 10) || 0,
                    targetMilestone: g.delayDays > 0 ? `DAY_${g.delayDays}` : 'IMMEDIATE',
                    templateName: g.templateName || undefined,
                    bodyText: g.bodyText || undefined,
                    headerMediaUrl: g.headerMediaUrl || undefined,
                    agentId: g.agentId || undefined,
                    callTemplateId: g.callTemplateId || undefined,
                    callTemplate: g.callTemplate || undefined,
                    emailSubject: g.emailSubject || undefined,
                    emailBody: g.emailBody || undefined,
                    smsText: g.smsText || undefined,
                    sendRate: Number(sendRate) || 20
                })),
                sendRate: Number(sendRate) || 20,
                scheduleType,
                scheduledAt: scheduleType === 'SCHEDULED' && scheduledAt ? scheduledAt : null
            };

            const res = await api.post(`/marketing-v2/${workspaceId}/wizard-launch`, payload);

            if (res.data?.success) {
                onSuccess?.(res.data.campaign);
                onClose();
            } else {
                setErrorMsg(res.data?.error || 'Kampanya başlatılamadı');
            }
        } catch (err) {
            console.error('Launch failed:', err);
            setErrorMsg(err.response?.data?.error || 'Kampanya oluşturulurken bir hata oluştu');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredTags = availableTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()));

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div
                className="grp-form-modal"
                style={{ width: 760, maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="grp-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #eef2f6' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Sparkles size={18} />
                            </div>
                            <h2 className="grp-modal-title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                                Akıllı Pazarlama ve Kampanya Sihirbazı
                            </h2>
                        </div>
                        <p style={{ margin: '4px 0 0 40px', fontSize: 13, color: '#64748b' }}>
                            Tek seferlik lansman, tekrarlı bülten, olay ve gün bazlı otomatik kampanyalar oluşturun.
                        </p>
                    </div>
                    <button className="grp-modal-close" onClick={onClose}><X size={16} /></button>
                </div>

                {/* Step Indicator */}
                <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: '#fafafa', padding: '10px 24px', gap: 8 }}>
                    {[
                        { num: 1, title: 'Kampanya Türü & Kitle' },
                        { num: 2, title: 'Gruplar & Kanallar' },
                        { num: 3, title: 'Zamanlama & Yeniden Deneme' },
                        { num: 4, title: 'Özet & Başlat' }
                    ].map(s => {
                        const active = step === s.num;
                        const passed = step > s.num;
                        return (
                            <div
                                key={s.num}
                                onClick={() => !submitting && setStep(s.num)}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    background: active ? '#fff' : 'transparent',
                                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                                    border: active ? '1px solid #e2e8f0' : '1px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <span style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: passed ? '#10b981' : active ? '#2563eb' : '#e2e8f0',
                                    color: passed || active ? '#fff' : '#64748b'
                                }}>
                                    {passed ? '✓' : s.num}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: active ? 650 : 500, color: active ? '#0f172a' : '#64748b' }}>
                                    {s.title}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Error Banner */}
                {errorMsg && (
                    <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertCircle size={16} />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Modal Body */}
                <div className="grp-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                    {/* ══════════════════════════════════════════════════════════════
                        STEP 1: KAMPANYA TÜRÜ & HEDEF KİTLE
                    ══════════════════════════════════════════════════════════════ */}
                    {step === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                            {/* Hızlı Örnek Doldurma Kısayolları */}
                            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 8 }}>💡 Hazır Örnekler — tıklayın, tüm form otomatik dolsun:</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {[
                                        { key: 'YENI_PROJE',        label: '⚡ Yeni Proje Lansmanı',         color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
                                        { key: 'BAYRAM_KUTLAMA',    label: '🎉 Bayram / Kutlama',            color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
                                        { key: 'FIYAT_GUNCELLEME',  label: '📢 Fiyat Güncelleme',            color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
                                        { key: 'HAFTALIK_BULTEN',   label: '📰 Haftalık Bülten',             color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
                                        { key: 'AYLIK_RAPOR',       label: '📊 Aylık Rapor',                 color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
                                        { key: 'UNCONTACTED_LEAD',  label: '🎯 30 Gün Aranmayan Lead',       color: '#9a3412', bg: '#fff7ed', border: '#fed7aa' },
                                        { key: 'YENI_LEAD_HOSGELDIN', label: '🤝 Yeni Lead Hoşgeldin',       color: '#9a3412', bg: '#fff7ed', border: '#fed7aa' },
                                        { key: 'ASAMA_DEGISIKLIK', label: '🔄 Aşama Değişikliği',            color: '#9a3412', bg: '#fff7ed', border: '#fed7aa' },
                                        { key: 'PASIF_UYE',         label: '📅 Pasif Üye (90-120 Gün)',      color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
                                        { key: 'DOGUM_GUNU',        label: '🎂 Doğum Günü Tebriği',          color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' },
                                        { key: 'MUSTERI_60_GUN',    label: '🏆 60 Gün Müşteri Kutlaması',    color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' }
                                    ].map(p => (
                                        <button
                                            key={p.key}
                                            type="button"
                                            onClick={() => applyPreset(p.key)}
                                            style={{
                                                padding: '5px 11px',
                                                fontSize: 11.5,
                                                fontWeight: 600,
                                                background: p.bg,
                                                border: `1px solid ${p.border}`,
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                                color: p.color,
                                                transition: 'all 0.15s',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 4 Temel Kampanya Türü Kartları */}
                            <div>
                                <label className="grp-label" style={{ marginBottom: 8, display: 'block', fontWeight: 700 }}>
                                    1. Kampanya Türünü Seçin *
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                                    {/* 1. Tek Seferlik */}
                                    <div
                                        onClick={() => setCampaignType('ONE_TIME')}
                                        style={{
                                            border: campaignType === 'ONE_TIME' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                            background: campaignType === 'ONE_TIME' ? '#eff6ff' : '#fff',
                                            borderRadius: 10,
                                            padding: 12,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#1e40af', fontSize: 13.5 }}>
                                            <Zap size={16} color="#2563eb" />
                                            <span>Tek Seferlik Gönderim</span>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>
                                            Yeni bir proje duyurusu ("Urla One"), promosyon veya tüm müşterilere anlık/planlı toplu mesaj.
                                        </p>
                                    </div>

                                    {/* 2. Tekrarlı Gönderim */}
                                    <div
                                        onClick={() => setCampaignType('RECURRING')}
                                        style={{
                                            border: campaignType === 'RECURRING' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                                            background: campaignType === 'RECURRING' ? '#f0fdf4' : '#fff',
                                            borderRadius: 10,
                                            padding: 12,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#166534', fontSize: 13.5 }}>
                                            <Repeat size={16} color="#16a34a" />
                                            <span>Tekrarlı Gönderim (Bülten)</span>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>
                                            Haftalık bülten veya aylık bilgilendirme. Belirlenen gün ve saatte dinamik hedef kitleye periyodik gider.
                                        </p>
                                    </div>

                                    {/* 3. Olay Bazlı */}
                                    <div
                                        onClick={() => setCampaignType('EVENT_BASED')}
                                        style={{
                                            border: campaignType === 'EVENT_BASED' ? '2px solid #ea580c' : '1px solid #e2e8f0',
                                            background: campaignType === 'EVENT_BASED' ? '#fff7ed' : '#fff',
                                            borderRadius: 10,
                                            padding: 12,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#9a3412', fontSize: 13.5 }}>
                                            <TargetIcon size={16} color="#ea580c" />
                                            <span>Olay Bazlı (Tetikleyici)</span>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>
                                            X akışına geçen müşteriye teşekkür veya 30 gündür aranmayan potansiyel lead'e otomatik arama/mesaj.
                                        </p>
                                    </div>

                                    {/* 4. Gün / Süreç Bazlı */}
                                    <div
                                        onClick={() => setCampaignType('DAY_BASED')}
                                        style={{
                                            border: campaignType === 'DAY_BASED' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                                            background: campaignType === 'DAY_BASED' ? '#faf5ff' : '#fff',
                                            borderRadius: 10,
                                            padding: 12,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#6b21a8', fontSize: 13.5 }}>
                                            <CalendarDays size={16} color="#7c3aed" />
                                            <span>Gün / Süreç Bazlı (Milestone)</span>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>
                                            90 gün pasif üyeye WhatsApp/AI Arama, 120. gün tekrarı, 60 günlük müşteri veya doğum günü tebriği.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Seçilen Türe Özel Ayarlar */}
                            {campaignType === 'RECURRING' && (
                                <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 10, border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>🔄 Tekrarlı Bülten Planlaması:</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                        <div>
                                            <label className="grp-label">Sıklık</label>
                                            <select className="grp-input" value={recurringFrequency} onChange={e => setRecurringFrequency(e.target.value)}>
                                                <option value="WEEKLY">Haftalık</option>
                                                <option value="BIWEEKLY">2 Haftada Bir</option>
                                                <option value="MONTHLY">Aylık</option>
                                                <option value="DAILY">Günlük</option>
                                            </select>
                                        </div>
                                        {recurringFrequency === 'WEEKLY' && (
                                            <div>
                                                <label className="grp-label">Gönderim Günü</label>
                                                <select className="grp-input" value={recurringDayOfWeek} onChange={e => setRecurringDayOfWeek(parseInt(e.target.value, 10))}>
                                                    <option value={1}>Pazartesi</option>
                                                    <option value={2}>Salı</option>
                                                    <option value={3}>Çarşamba</option>
                                                    <option value={4}>Perşembe</option>
                                                    <option value={5}>Cuma</option>
                                                    <option value={6}>Cumartesi</option>
                                                    <option value={7}>Pazar</option>
                                                </select>
                                            </div>
                                        )}
                                        {recurringFrequency === 'MONTHLY' && (
                                            <div>
                                                <label className="grp-label">Ayın Günü</label>
                                                <input type="number" min="1" max="31" className="grp-input" value={recurringDayOfMonth} onChange={e => setRecurringDayOfMonth(parseInt(e.target.value, 10))} />
                                            </div>
                                        )}
                                        <div>
                                            <label className="grp-label">Saat (TSİ)</label>
                                            <input type="time" className="grp-input" value={recurringTime} onChange={e => setRecurringTime(e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {campaignType === 'EVENT_BASED' && (
                                <div style={{ background: '#fff7ed', padding: 14, borderRadius: 10, border: '1px solid #fed7aa', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412' }}>🎯 Olay / Tetikleyici Koşulu:</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                                        <div>
                                            <label className="grp-label">Tetikleyici Olay</label>
                                            <select className="grp-input" value={eventTrigger} onChange={e => setEventTrigger(e.target.value)}>
                                                <option value="UNCONTACTED_LEAD">30 Gündür Kimsenin Aramadığı Potansiyel Lead</option>
                                                <option value="STAGE_CHANGE">Fırsat / Akış Aşamasına Geçenler (X Akışı)</option>
                                                <option value="NEW_LEAD">Yeni Lead Kaydı Geldiğinde</option>
                                            </select>
                                        </div>
                                        {eventTrigger === 'UNCONTACTED_LEAD' && (
                                            <div>
                                                <label className="grp-label">Aranmama Süresi (Gün)</label>
                                                <input type="number" min="1" max="365" className="grp-input" value={uncontactedDays} onChange={e => setUncontactedDays(e.target.value)} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {campaignType === 'DAY_BASED' && (
                                <div style={{ background: '#faf5ff', padding: 14, borderRadius: 10, border: '1px solid #e9d5ff', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#6b21a8' }}>📅 Gün / Milestone Kriteri:</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                                        <div>
                                            <label className="grp-label">Zaman Kriteri</label>
                                            <select className="grp-input" value={dayTrigger} onChange={e => setDayTrigger(e.target.value)}>
                                                <option value="INACTIVE_DAYS">Pasif Üye Hatırlatıcı (90 - 100 - 120 Gün)</option>
                                                <option value="CUSTOMER_AGE_DAYS">Müşteri Olma Süresi (60 Gün vb.)</option>
                                                <option value="BIRTHDAY">Doğum Günü Bugün Olanlar</option>
                                            </select>
                                        </div>
                                        {dayTrigger !== 'BIRTHDAY' && (
                                            <div>
                                                <label className="grp-label">Eşik Gün Sayısı</label>
                                                <input type="number" min="1" max="999" className="grp-input" value={dayMilestoneDays} onChange={e => setDayMilestoneDays(e.target.value)} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Kampanya Adı ve Detayları */}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                                <div className="grp-field">
                                    <label className="grp-label">Kampanya Adı *</label>
                                    <input
                                        type="text"
                                        className="grp-input"
                                        placeholder="Örn: Urla One Duyurusu veya Pasif Üye Hatırlatıcı"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="grp-field">
                                    <label className="grp-label">Bütçe (TL) <span className="grp-label-opt">(Opsiyonel)</span></label>
                                    <input
                                        type="number"
                                        className="grp-input"
                                        placeholder="Örn: 5000"
                                        value={budget}
                                        onChange={e => setBudget(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grp-field">
                                <label className="grp-label">Açıklama <span className="grp-label-opt">(Opsiyonel)</span></label>
                                <input
                                    type="text"
                                    className="grp-input"
                                    placeholder="Kampanya hedefi ve notlar"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                />
                            </div>

                            {/* Hedef Kitle Kaynağı */}
                            <div>
                                <label className="grp-label" style={{ marginBottom: 8, display: 'block', fontWeight: 700 }}>2. Hedef Kitle Kaynağı</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                    {[
                                        { id: 'SEGMENT', label: 'Akıllı Segment', icon: <Sparkles size={16} /> },
                                        { id: 'TAGS', label: 'Etiketler', icon: <Tag size={16} /> },
                                        { id: 'LIST', label: 'Kayıtlı Liste', icon: <Users size={16} /> },
                                        { id: 'ALL', label: 'Tüm Müşteriler', icon: <Layers size={16} /> }
                                    ].map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => setAudienceType(item.id)}
                                            style={{
                                                padding: '10px 8px',
                                                border: audienceType === item.id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                                background: audienceType === item.id ? '#eff6ff' : '#fff',
                                                color: audienceType === item.id ? '#1e40af' : '#475569',
                                                borderRadius: 8,
                                                fontSize: 12,
                                                fontWeight: 650,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: 6,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {item.icon}
                                            <span>{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {audienceType === 'SEGMENT' && (
                                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{ fontSize: 13, fontWeight: 650, color: '#334155' }}>
                                            Akıllı Segment Seçin ({selectedSegmentIds.length} seçildi)
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
                                        {smartSegments.map(s => {
                                            const isSelected = selectedSegmentIds.includes(s.id);
                                            return (
                                                <span
                                                    key={s.id}
                                                    onClick={() => setSelectedSegmentIds(prev =>
                                                        prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                                    )}
                                                    style={{
                                                        padding: '5px 12px',
                                                        borderRadius: 14,
                                                        fontSize: 12,
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        background: isSelected ? '#2563eb' : '#fff',
                                                        color: isSelected ? '#fff' : '#475569',
                                                        border: isSelected ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {isSelected && '✓ '}{s.icon || '⚡'} {s.label}
                                                </span>
                                            );
                                        })}
                                        {smartSegments.length === 0 && (
                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Henüz segment tanımlı değil</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {audienceType === 'TAGS' && (
                                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{ fontSize: 13, fontWeight: 650, color: '#334155' }}>
                                            Kişiler Etiketleri ({selectedTags.length} seçildi)
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Etiket ara..."
                                            value={tagSearch}
                                            onChange={e => setTagSearch(e.target.value)}
                                            style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none', width: 140 }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                                        {filteredTags.map(tag => {
                                            const isSelected = selectedTags.includes(tag);
                                            return (
                                                <span
                                                    key={tag}
                                                    onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: 14,
                                                        fontSize: 12,
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        background: isSelected ? '#2563eb' : '#fff',
                                                        color: isSelected ? '#fff' : '#475569',
                                                        border: isSelected ? '1px solid #2563eb' : '1px solid #cbd5e1'
                                                    }}
                                                >
                                                    {isSelected && '✓ '}#{tag}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {audienceType === 'LIST' && (
                                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <span style={{ fontSize: 13, fontWeight: 650, color: '#334155' }}>
                                            Kayıtlı Liste Seçin ({selectedListIds.length} seçildi)
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
                                        {contactGroups.map(g => {
                                            const isSelected = selectedListIds.includes(g.id);
                                            const memberCount = g.members?.length || g._count?.members || 0;
                                            return (
                                                <span
                                                    key={g.id}
                                                    onClick={() => setSelectedListIds(prev =>
                                                        prev.includes(g.id) ? prev.filter(id => id !== g.id) : [...prev, g.id]
                                                    )}
                                                    style={{
                                                        padding: '5px 12px',
                                                        borderRadius: 14,
                                                        fontSize: 12,
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        background: isSelected ? '#2563eb' : '#fff',
                                                        color: isSelected ? '#fff' : '#475569',
                                                        border: isSelected ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {isSelected && '✓ '}{g.icon || '👥'} {g.name} ({memberCount})
                                                </span>
                                            );
                                        })}
                                        {contactGroups.length === 0 && (
                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Henüz kayıtlı liste yok</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Canlı Kitle Tahmin Kartı */}
                            <div style={{
                                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                                border: '1.5px solid #86efac',
                                borderRadius: 12,
                                padding: '12px 18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>🎯 Tahmini Hedef Kitle:</span>
                                        {previewLoading ? (
                                            <Loader2 size={16} className="mkt-spin" style={{ color: '#16a34a' }} />
                                        ) : (
                                            <span style={{ fontSize: 17, fontWeight: 800, color: '#15803d' }}>
                                                {previewCount !== null ? `${previewCount} Kişi` : 'Hesaplanıyor...'}
                                            </span>
                                        )}
                                    </div>
                                    {previewSamples.length > 0 && (
                                        <div style={{ fontSize: 11.5, color: '#166534', marginTop: 3 }}>
                                            Örnek: {previewSamples.map(c => c.name || c.phone).slice(0, 3).join(', ')}
                                            {previewCount > 3 ? ` ve ${previewCount - 3} kişi daha` : ''}
                                        </div>
                                    )}
                                </div>
                                <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 20, fontWeight: 650 }}>
                                    Dinamik Segmentasyon
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════════
                        STEP 2: ÇOKLU GRUP & KANALLAR (AD SETS)
                    ══════════════════════════════════════════════════════════════ */}
                    {step === 2 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                                        Kampanya Grupları (Ad Sets & Kanallar)
                                    </h3>
                                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                                        Kampanyanız altında birden fazla kanal veya süreç grubu tanımlayabilirsiniz.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={addGroup}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '7px 12px',
                                        fontSize: 12.5,
                                        fontWeight: 650,
                                        background: '#2563eb',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: 8,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Plus size={14} /> Yeni Grup Ekle
                                </button>
                            </div>

                            {/* Grup Kartları Listesi */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {groups.map((grp, idx) => (
                                    <div
                                        key={grp.id}
                                        style={{
                                            border: '1.5px solid #e2e8f0',
                                            borderRadius: 12,
                                            padding: 16,
                                            background: '#fff',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{
                                                    width: 26, height: 26, borderRadius: '50%',
                                                    background: '#f1f5f9', color: '#334155',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 12, fontWeight: 700
                                                }}>
                                                    {idx + 1}
                                                </span>
                                                <input
                                                    type="text"
                                                    value={grp.name}
                                                    onChange={e => updateGroup(grp.id, 'name', e.target.value)}
                                                    placeholder="Grup Adı"
                                                    style={{
                                                        fontSize: 14,
                                                        fontWeight: 700,
                                                        color: '#0f172a',
                                                        border: '1px solid transparent',
                                                        borderRadius: 6,
                                                        padding: '4px 8px',
                                                        outline: 'none',
                                                        width: 280
                                                    }}
                                                    onFocus={e => e.target.style.borderColor = '#cbd5e1'}
                                                    onBlur={e => e.target.style.borderColor = 'transparent'}
                                                />
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {grp.delayDays > 0 && (
                                                    <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                                                        {grp.delayDays}. Gün Hatırlatması
                                                    </span>
                                                )}
                                                {groups.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeGroup(grp.id)}
                                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                                                        title="Grubu Sil"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 2fr', gap: 12 }}>
                                            {/* Kanal */}
                                            <div>
                                                <label className="grp-label">Kanal</label>
                                                <select
                                                    className="grp-input"
                                                    value={grp.channel}
                                                    onChange={e => updateGroup(grp.id, 'channel', e.target.value)}
                                                >
                                                    <option value="WHATSAPP">💬 WhatsApp</option>
                                                    <option value="AI_CALL">📞 AI Sesli Arama</option>
                                                    <option value="EMAIL">✉️ E-posta</option>
                                                    <option value="SMS">📱 SMS</option>
                                                </select>
                                            </div>

                                            {/* Gecikme Günü / Süreç */}
                                            <div>
                                                <label className="grp-label">Süreç Günü (Delay)</label>
                                                <select
                                                    className="grp-input"
                                                    value={grp.delayDays}
                                                    onChange={e => updateGroup(grp.id, 'delayDays', parseInt(e.target.value, 10))}
                                                >
                                                    <option value={0}>Hemen / 0. Gün</option>
                                                    <option value={30}>30. Gün</option>
                                                    <option value={60}>60. Gün</option>
                                                    <option value={90}>90. Gün</option>
                                                    <option value={100}>100. Gün</option>
                                                    <option value={120}>120. Gün</option>
                                                </select>
                                            </div>

                                            {/* Mesaj / Asistan Seçimi */}
                                            <div>
                                                {grp.channel === 'WHATSAPP' && (
                                                    <>
                                                        <label className="grp-label">WhatsApp Onaylı Şablon</label>
                                                        <select
                                                            className="grp-input"
                                                            value={grp.templateName}
                                                            onChange={e => updateGroup(grp.id, 'templateName', e.target.value)}
                                                        >
                                                            <option value="">-- Şablon seçin --</option>
                                                            {waTemplates.map(t => (
                                                                <option key={t.id || t.name} value={t.name}>
                                                                    {t.name} ({t.status || 'APPROVED'})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </>
                                                )}

                                                {grp.channel === 'AI_CALL' && (
                                                    <>
                                                        <label className="grp-label">🎙️ Arama Şablonu</label>
                                                        {callTemplates.length > 0 ? (
                                                            <select
                                                                className="grp-input"
                                                                value={grp.callTemplateId || ''}
                                                                onChange={e => updateGroup(grp.id, 'callTemplateId', e.target.value)}
                                                            >
                                                                <option value="">-- Şablon seçin --</option>
                                                                {callTemplates.map(t => (
                                                                    <option key={t.id} value={t.id}>
                                                                        {t.icon || '📞'} {t.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <select
                                                                className="grp-input"
                                                                value={grp.agentId || ''}
                                                                onChange={e => updateGroup(grp.id, 'agentId', e.target.value)}
                                                            >
                                                                <option value="">-- Asistan seçin --</option>
                                                                {retellAgents.map(a => (
                                                                    <option key={a.agent_id || a.id} value={a.agent_id || a.id}>
                                                                        {a.agent_name || a.agent_id || 'Asistan'}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </>
                                                )}

                                                {grp.channel === 'EMAIL' && (
                                                    <>
                                                        <label className="grp-label">E-posta Konusu</label>
                                                        <input
                                                            type="text"
                                                            className="grp-input"
                                                            placeholder="Örn: Haftalık Bülten #12"
                                                            value={grp.emailSubject || ''}
                                                            onChange={e => updateGroup(grp.id, 'emailSubject', e.target.value)}
                                                        />
                                                    </>
                                                )}

                                                {grp.channel === 'SMS' && (
                                                    <>
                                                        <label className="grp-label">SMS Metni</label>
                                                        <input
                                                            type="text"
                                                            className="grp-input"
                                                            placeholder="SMS mesaj metni..."
                                                            value={grp.smsText || ''}
                                                            onChange={e => updateGroup(grp.id, 'smsText', e.target.value)}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════════
                        STEP 3: ZAMANLAMA, HIZ & OTOMATİK YENİDEN DENEME
                    ══════════════════════════════════════════════════════════════ */}
                    {step === 3 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            {/* Gönderim Hızı */}
                            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                <label className="grp-label" style={{ marginBottom: 6, display: 'block', fontWeight: 700 }}>
                                    Gönderim Hızı (Dakikada Mesaj Sayısı)
                                </label>
                                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                                    Meta veya telefon hat limitlerine takılmamak için önerilen hız 20-30 mesaj/dakikadır.
                                </p>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    {[
                                        { rate: 10, label: '10 / dk (Güvenli)' },
                                        { rate: 20, label: '20 / dk (Önerilen)' },
                                        { rate: 30, label: '30 / dk (Standart)' },
                                        { rate: 50, label: '50 / dk (Hızlı)' }
                                    ].map(item => (
                                        <button
                                            key={item.rate}
                                            type="button"
                                            onClick={() => setSendRate(item.rate)}
                                            style={{
                                                padding: '8px 14px',
                                                borderRadius: 8,
                                                fontSize: 12.5,
                                                fontWeight: 650,
                                                border: sendRate === item.rate ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                                background: sendRate === item.rate ? '#eff6ff' : '#fff',
                                                color: sendRate === item.rate ? '#1e40af' : '#475569',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Zamanlama (Tek Seferlik Kampanyalar İçin) */}
                            {campaignType === 'ONE_TIME' && (
                                <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                    <label className="grp-label" style={{ marginBottom: 8, display: 'block', fontWeight: 700 }}>
                                        Başlama Zamanı
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <button
                                            type="button"
                                            onClick={() => setScheduleType('IMMEDIATE')}
                                            style={{
                                                padding: '12px',
                                                borderRadius: 8,
                                                border: scheduleType === 'IMMEDIATE' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                                                background: scheduleType === 'IMMEDIATE' ? '#f0fdf4' : '#fff',
                                                color: scheduleType === 'IMMEDIATE' ? '#166534' : '#475569',
                                                fontSize: 13,
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            ⚡ Hemen Gönder ("Şak Diye Yolla")
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setScheduleType('SCHEDULED')}
                                            style={{
                                                padding: '12px',
                                                borderRadius: 8,
                                                border: scheduleType === 'SCHEDULED' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                                background: scheduleType === 'SCHEDULED' ? '#eff6ff' : '#fff',
                                                color: scheduleType === 'SCHEDULED' ? '#1e40af' : '#475569',
                                                fontSize: 13,
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            📅 İleri Bir Tarihe Planla
                                        </button>
                                    </div>
                                    {scheduleType === 'SCHEDULED' && (
                                        <div style={{ marginTop: 12 }}>
                                            <label className="grp-label">Planlanan Tarih ve Saat</label>
                                            <input
                                                type="datetime-local"
                                                className="grp-input"
                                                value={scheduledAt}
                                                onChange={e => setScheduledAt(e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* OTOMATİK YENİDEN DENEME (AUTO-RETRY) KARTI */}
                            <div style={{
                                background: '#f0fdf4',
                                border: '1.5px solid #86efac',
                                borderRadius: 12,
                                padding: 16
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                        <ShieldCheck size={20} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
                                        <div>
                                            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#166534' }}>
                                                Otomatik Yeniden Deneme (Auto-Retry)
                                            </div>
                                            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#14532d', lineHeight: 1.4 }}>
                                                WhatsApp veya sesli aramalarda iletilemeyen / başarısız olan kişilere sistem 15 dakika sonra arka planda otomatik olarak tekrar dener.
                                            </p>
                                        </div>
                                    </div>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={autoRetry}
                                            onChange={e => setAutoRetry(e.target.checked)}
                                            style={{ width: 18, height: 18, accentColor: '#16a34a' }}
                                        />
                                    </label>
                                </div>
                                {autoRetry && (
                                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #bbf7d0', display: 'flex', gap: 16, fontSize: 12, color: '#166534' }}>
                                        <span>🔁 Maksimum Deneme: <strong>{maxRetries} kez</strong></span>
                                        <span>⏱️ Deneme Aralığı: <strong>{retryIntervalMinutes} dakika</strong></span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════════
                        STEP 4: ÖZET & BAŞLAT
                    ══════════════════════════════════════════════════════════════ */}
                    {step === 4 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: 12,
                                padding: 18
                            }}>
                                <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                                    {name || 'Yeni Kampanya'}
                                </h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                        <span style={{ color: '#64748b' }}>Kampanya Türü:</span>
                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                                            {campaignType === 'ONE_TIME' && '⚡ Tek Seferlik (Lansman / Anlık)'}
                                            {campaignType === 'RECURRING' && `🔄 Tekrarlı (${recurringFrequency} · Saat ${recurringTime})`}
                                            {campaignType === 'EVENT_BASED' && `🎯 Olay Bazlı (${eventTrigger === 'UNCONTACTED_LEAD' ? `${uncontactedDays} Gündür Aranmayan Lead` : eventTrigger})`}
                                            {campaignType === 'DAY_BASED' && `📅 Gün / Süreç Bazlı (${dayTrigger})`}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                        <span style={{ color: '#64748b' }}>Hedef Kitle:</span>
                                        <span style={{ fontWeight: 700, color: '#15803d' }}>
                                            {previewCount !== null ? `${previewCount} Kişi` : 'Seçilen Hedef Kitle'}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                        <span style={{ color: '#64748b' }}>Tanımlanan Gruplar:</span>
                                        <span style={{ fontWeight: 650, color: '#0f172a' }}>
                                            {groups.length} Adet Reklam Grubu
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                                        <span style={{ color: '#64748b' }}>Otomatik Yeniden Deneme:</span>
                                        <span style={{ fontWeight: 700, color: autoRetry ? '#16a34a' : '#64748b' }}>
                                            {autoRetry ? `Aktif (${maxRetries} kez, 15 dk arayla)` : 'Kapalı'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Gruplar Önizleme Özeti */}
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                                    Gruplar ve Dağıtım Adımları:
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {groups.map((g, i) => (
                                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '6px 10px', background: '#f8fafc', borderRadius: 6 }}>
                                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{g.name}</span>
                                            <span style={{ color: '#64748b' }}>{g.channel} {g.delayDays > 0 ? `· ${g.delayDays}. Gün` : '· Hemen'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Navigation Buttons */}
                <div className="grp-modal-footer" style={{ padding: '14px 24px', background: '#fafafa', borderTop: '1px solid #eef2f6' }}>
                    {step > 1 && (
                        <button
                            type="button"
                            className="grp-btn-cancel"
                            disabled={submitting}
                            onClick={() => setStep(s => s - 1)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            <ArrowLeft size={16} />
                            <span>Geri</span>
                        </button>
                    )}

                    <div style={{ flex: 1 }} />

                    <button
                        type="button"
                        className="grp-btn-cancel"
                        disabled={submitting}
                        onClick={onClose}
                    >
                        Vazgeç
                    </button>

                    {step < 4 ? (
                        <button
                            type="button"
                            className="grp-btn-save"
                            onClick={() => {
                                if (step === 1 && !name.trim()) {
                                    setErrorMsg('Lütfen kampanya adını girin');
                                    return;
                                }
                                setErrorMsg('');
                                setStep(s => s + 1);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            <span>İleri</span>
                            <ArrowRight size={16} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="grp-btn-save"
                            disabled={submitting}
                            onClick={handleLaunch}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                background: '#10b981',
                                border: 'none'
                            }}
                        >
                            {submitting ? <Loader2 size={16} className="mkt-spin" /> : <Sparkles size={16} />}
                            <span>{submitting ? 'Kampanya Başlatılıyor...' : '🚀 Kampanyayı Başlat'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// Minimal Target Icon helper
function TargetIcon(props) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={props.size || 24}
            height={props.size || 24}
            viewBox="0 0 24 24"
            fill="none"
            stroke={props.color || "currentColor"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="6"/>
            <circle cx="12" cy="12" r="2"/>
        </svg>
    );
}
