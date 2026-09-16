import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../../services/template.api';
import api, { automationAPI, contactAPI, whatsappAPI, retellAPI, quickReplyAPI } from '../../services/api';
import {
    Plus, Trash2, Edit2, Send, RefreshCw,
    CheckCircle2, Clock, XCircle, Globe, Search, X,
    Smartphone, Mail, MessageSquare, Zap, Copy, Check,
    FileText, Image as ImageIcon, Video, File, Layers,
    ExternalLink, PhoneCall, Sparkles, Filter
} from 'lucide-react';
import './Templates.css';

const CALL_SCENARIOS = [
    {
        id: 'appointment_confirm',
        title: 'Randevu Teyit & Hatırlatma',
        icon: '📅',
        badge: 'En Çok Kullanılan',
        description: 'Yaklaşan randevuyu teyit eder, katılım onayı alır veya erteleme talebini yönetir.',
        name: 'Randevu Teyit ve Hatırlatma',
        desc: 'Yaklaşan randevusu olan müşteriyi arayarak randevu saatini teyit eden ve onay alan sesli arama senaryosu.',
        beginMessage: 'Merhaba {{customer_name}}, {{company_name}} adına arıyorum. {{appointment_date}} tarihindeki randevunuzu teyit etmek için rahatsız ettim. Randevunuza katılım sağlayabilecek misiniz?',
        promptSuffix: 'Sen randevu teyidi yapan profesyonel bir AI temsilcisisin. Müşteri evet derse teşekkür et ve şube adresini kısaca hatırlat. Eğer müsait değilim ya da ertelemek istiyorum derse, yeni bir tarih/saat öner veya danışmanımızın en kısa sürede geri döneceğini ilet. Nezaketi elden bırakma.'
    },
    {
        id: 'campaign_offer',
        title: 'Kampanya & Özel Fırsat',
        icon: '🎁',
        badge: 'Satış & Pazarlama',
        description: 'Müşterilere güncel indirim, kampanya veya yeni ürün fırsatlarını tanıtır.',
        name: 'Kampanya & Özel Fırsat Duyurusu',
        desc: 'Mevcut veya potansiyel müşterilere güncel indirim, avantaj ve yeni ürün kampanyalarını tanıtan arama.',
        beginMessage: "İyi günler {{customer_name}}, {{company_name}}'dan arıyorum. Size özel hazırladığımız güncel fırsat ve kampanyalarımız hakkında kısa bir bilgi paylaşmak istemiştim, 1 dakikanız müsait miydi?",
        promptSuffix: "Sen satış ve pazarlama konusunda dinamik ve samimi bir AI temsilcisisin. Müşteri müsait olduğunu belirtirse kampanyanın temel avantajlarını ve son başvuru tarihini aktar. İlgilenirse detaylı bilgi ve randevu/sipariş linkini WhatsApp'tan göndermeyi teklif et. Müşteri meşgulse kibarca vedalaş."
    },
    {
        id: 'satisfaction_survey',
        title: 'Memnuniyet & Geri Bildirim',
        icon: '⭐',
        badge: 'Müşteri Deneyimi',
        description: 'Hizmet veya işlem sonrası memnuniyet puanı toplar ve değerlendirme alır.',
        name: 'Müşteri Memnuniyet & Geri Bildirim',
        desc: 'Hizmet veya ürün satın alımı sonrası müşteri memnuniyetini ölçen ve geri bildirim toplayan senaryo.',
        beginMessage: 'Merhaba {{customer_name}}, {{company_name}} müşteri deneyimi ekibinden arıyorum. Yakın zamanda aldığınız hizmetimizden memnun kaldınız mı, deneyiminizi 1 ile 5 arasında nasıl değerlendirirsiniz?',
        promptSuffix: 'Sen empatik, dinleyen ve müşteri deneyimini önemseyen bir temsilcisin. Müşterinin verdiği puanı ve yorumu not al. Memnun kalmadıysa sebebi nazikçe sor ve konuyu derhal yetkili ekibe ileteceğini belirt. Memnun ise teşekkür ederek iyi günler dile.'
    },
    {
        id: 'location_info',
        title: 'Adres & Ulaşım Bilgilendirme',
        icon: '📍',
        badge: 'Operasyon',
        description: 'Randevu öncesi açık adres, navigasyon ve otopark bilgilerini aktarır.',
        name: 'Adres ve Konum Bilgilendirmesi',
        desc: 'Randevu öncesinde müşteriye ulaşım, otopark ve adres tarifini sesli olarak özetleyen arama.',
        beginMessage: "Merhaba {{customer_name}}, {{company_name}}'dan arıyorum. Randevunuz öncesi şubemize ulaşım ve adres detaylarını sizinle paylaşmak için aradım.",
        promptSuffix: "Müşteriye şubenin açık adresini, varsa otopark imkanını ve en kolay ulaşım yolunu anlat. Ayrıca adres ve konum linkini birazdan WhatsApp üzerinden de ileteceğini söyle. Sorusu olup olmadığını öğren ve teşekkür et."
    },
    {
        id: 'missed_callback',
        title: 'Geri Dönüş / Kaçırılan Çağrı',
        icon: '📞',
        badge: 'Hızlı İletişim',
        description: 'Web sitesi formu dolduran veya çağrısı kaçan müşteriye anında geri arama yapar.',
        name: 'Geri Dönüş & Çağrı Karşılama',
        desc: 'Bize ulaşmaya çalışan veya form dolduran müşteriye otomatik geri dönüş senaryosu.',
        beginMessage: "Merhaba {{customer_name}}, {{company_name}}'dan arıyorum. Bize bırakmış olduğunuz çağrı / talep formu üzerine size geri dönüş yapıyorum. Size nasıl yardımcı olabilirim?",
        promptSuffix: 'Müşterinin talebini dikkatle dinle. İhtiyacına göre bilgi bankasından doğru bilgiyi ver, randevu oluştur veya ilgili departmana not oluşturarak aktar.'
    }
];

const WA_READY_TEMPLATES = [
    {
        id: 'randevu_hatirlatma',
        title: 'Randevu Hatırlatma',
        icon: '📅',
        badge: 'Otomasyon',
        description: 'Yarınki randevuları otomatik hatırlatır. İsim, saat, doktor ve bölüm bilgisi.',
        name: 'randevu_hatirlatma',
        category: 'UTILITY',
        bodyText: 'Merhaba {{1}}, yarın saat {{2}}\'deki {{3}} randevunuzu hatırlatmak isteriz.\n{{4}}\nSorularınız için bize yazabilirsiniz. İyi günler! 🙏'
    },
    {
        id: 'arama_basarili',
        title: 'Arama Başarılı',
        icon: '✅',
        badge: 'AI Arama',
        description: 'Başarılı arama sonrası özet veya onay bilgisini müşteriye iletir.',
        name: 'arama_basarili',
        category: 'UTILITY',
        bodyText: 'Merhaba {{1}}, az önce gerçekleştirdiğimiz görüşme hakkında bilgilendirmek isteriz.\n\n{{2}}\n\nSorularınız için bize ulaşabilirsiniz. İyi günler! 🙏'
    },
    {
        id: 'arama_basarisiz',
        title: 'Arama Başarısız',
        icon: '📵',
        badge: 'AI Arama',
        description: 'Müşteriye ulaşılamadığında bilgilendirme gönderir.',
        name: 'arama_basarisiz',
        category: 'UTILITY',
        bodyText: 'Merhaba {{1}}, size ulaşmaya çalıştık ancak ulaşamadık.\n\n{{2}}\n\nUygun olduğunuzda bize dönüş yapabilirsiniz. İyi günler!'
    },
    {
        id: 'konum_gonder',
        title: 'Konum Gönder',
        icon: '📍',
        badge: 'Operasyon',
        description: 'Randevu veya ziyaret öncesi adres, konum ve yol tarifi bilgisi.',
        name: 'konum_gonder',
        category: 'UTILITY',
        bodyText: 'Merhaba {{1}}, randevunuz için adres bilgilerimiz:\n\n📍 {{2}}\n{{3}}\n\nYol tarifi: {{4}}'
    },
    {
        id: 'talep_alindi',
        title: 'Talep / Başvuru Alındı',
        icon: '📋',
        badge: 'Otomasyon',
        description: 'Form, bot veya manuel talep alındığında onay bildirimi.',
        name: 'talep_alindi',
        category: 'UTILITY',
        bodyText: 'Merhaba {{1}}, talebiniz alınmıştır. ✅\n\nKonu: {{2}}\n{{3}}\n\nEn kısa sürede sizinle iletişime geçeceğiz. İyi günler!'
    },
    {
        id: 'genel_bilgilendirme',
        title: 'Genel Bilgilendirme',
        icon: '💬',
        badge: 'Genel',
        description: 'Her amaçla kullanılabilen esnek bilgilendirme şablonu.',
        name: 'genel_bilgilendirme',
        category: 'UTILITY',
        bodyText: 'Merhaba {{1}},\n\n{{2}}\n\nSorularınız için bize yazabilirsiniz. İyi günler! 🙏'
    }
];

const SMS_READY_TEMPLATES = [
    {
        id: 'sms_randevu_hatirlatma',
        title: 'Randevu Hatırlatma',
        icon: '📅',
        badge: 'Otomasyon',
        description: 'Yarınki randevuyu SMS ile hatırlatır.',
        name: 'Randevu Hatırlatma (SMS)',
        bodyText: 'Merhaba, yarın saat {{saat}} randevunuz bulunmaktadır. Sorularınız için bize ulaşabilirsiniz. İyi günler!'
    },
    {
        id: 'sms_talep_alindi',
        title: 'Talep Alındı',
        icon: '📋',
        badge: 'Otomasyon',
        description: 'Talep veya başvuru alındığında SMS onay bildirimi.',
        name: 'Talep Alındı (SMS)',
        bodyText: 'Talebiniz alınmıştır. En kısa sürede sizinle iletişime geçeceğiz. İyi günler!'
    },
    {
        id: 'sms_dogrulama',
        title: 'Doğrulama Kodu',
        icon: '🔐',
        badge: 'Güvenlik',
        description: 'Tek kullanımlık doğrulama kodu gönderimi.',
        name: 'Doğrulama Kodu (SMS)',
        bodyText: 'Doğrulama kodunuz: {{kod}} — Bu kodu kimseyle paylaşmayın.'
    },
    {
        id: 'sms_konum',
        title: 'Adres / Konum',
        icon: '📍',
        badge: 'Operasyon',
        description: 'Adres ve yol tarifi bilgisi kısa mesajla.',
        name: 'Konum Bilgisi (SMS)',
        bodyText: 'Adresimiz: {{adres}} — Yol tarifi için: {{link}}'
    },
    {
        id: 'sms_kampanya',
        title: 'Kampanya Duyurusu',
        icon: '🎁',
        badge: 'Pazarlama',
        description: 'Kısa ve etkili kampanya/fırsat bildirimi.',
        name: 'Kampanya Duyurusu (SMS)',
        bodyText: 'Size özel fırsat! {{kampanya_detay}} — Detaylar için: {{link}}'
    }
];

const EMAIL_READY_TEMPLATES = [
    {
        id: 'email_hosgeldin',
        title: 'Hoş Geldiniz',
        icon: '👋',
        badge: 'Onboarding',
        description: 'Yeni kayıt veya ilk talep sonrası karşılama e-postası.',
        name: 'Hoş Geldiniz',
        subject: 'Hoş Geldiniz! 🎉',
        bodyText: 'Merhaba {{isim}},\n\nBize ulaştığınız için teşekkür ederiz. Ekibimiz en kısa sürede sizinle iletişime geçecektir.\n\nSorularınız için bu e-postaya yanıt verebilirsiniz.\n\nSaygılarımızla'
    },
    {
        id: 'email_randevu_onay',
        title: 'Randevu Onayı',
        icon: '📅',
        badge: 'Otomasyon',
        description: 'Randevu oluşturulduğunda müşteriye onay e-postası.',
        name: 'Randevu Onayı',
        subject: 'Randevunuz Onaylandı ✅',
        bodyText: 'Merhaba {{isim}},\n\nRandevunuz başarıyla oluşturulmuştur.\n\n📅 Tarih: {{tarih}}\n🕐 Saat: {{saat}}\n📍 Konum: {{adres}}\n\nDeğişiklik veya iptal için bize ulaşabilirsiniz.\n\nSaygılarımızla'
    },
    {
        id: 'email_teklif',
        title: 'Teklif / Fiyat Bilgisi',
        icon: '💰',
        badge: 'Satış',
        description: 'Müşteriye fiyat teklifi veya ürün bilgisi gönderimi.',
        name: 'Teklif Gönderimi',
        subject: 'Fiyat Teklifimiz',
        bodyText: 'Merhaba {{isim}},\n\nTalebiniz doğrultusunda hazırladığımız teklif aşağıdadır:\n\n{{teklif_detay}}\n\nTeklif geçerlilik süresi: {{gecerlilik}}\n\nSorularınız için yanıt verebilirsiniz.\n\nSaygılarımızla'
    },
    {
        id: 'email_takip',
        title: 'Takip / Geri Dönüş',
        icon: '🔄',
        badge: 'CRM',
        description: 'İletişim sonrası takip veya geri bildirim isteme.',
        name: 'Takip E-postası',
        subject: 'Görüşmemiz Hakkında',
        bodyText: 'Merhaba {{isim}},\n\nGeçtiğimiz günlerde yaptığımız görüşme hakkında geri dönüş yapmak istedik.\n\n{{ozet}}\n\nHerhangi bir sorunuz varsa bize ulaşabilirsiniz.\n\nSaygılarımızla'
    },
    {
        id: 'email_kampanya',
        title: 'Kampanya / Duyuru',
        icon: '📣',
        badge: 'Pazarlama',
        description: 'Toplu kampanya veya özel teklif duyurusu.',
        name: 'Kampanya Duyurusu',
        subject: 'Size Özel Fırsat! 🎁',
        bodyText: 'Merhaba {{isim}},\n\n{{kampanya_detay}}\n\nBu fırsattan yararlanmak için {{son_tarih}} tarihine kadar bize ulaşın.\n\nSaygılarımızla'
    }
];

const Templates = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [activeTab, setActiveTab] = useState('WHATSAPP');
    const [loading, setLoading] = useState(false);
    const [tabCounts, setTabCounts] = useState({ WHATSAPP: 0, EMAIL: 0, SMS: 0, QUICK_REPLY: 0, AI_CALL: 0 });

    // Search and filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [copiedId, setCopiedId] = useState(null);

    // --- Simple templates state (EMAIL, SMS, QUICK_REPLY) ---
    const [simpleTemplates, setSimpleTemplates] = useState([]);
    const [showSimpleModal, setShowSimpleModal] = useState(false);
    const [editId, setEditId] = useState(null);
    const [formData, setFormData] = useState({ name: '', subject: '', bodyText: '', bodyHtml: '', shortcut: '', message: '' });

    // --- WhatsApp Meta templates state ---
    const [waTemplates, setWaTemplates] = useState([]);
    const [phoneNumbers, setPhoneNumbers] = useState([]);
    const [syncing, setSyncing] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [templateForm, setTemplateForm] = useState({
        name: '', language: 'tr', category: 'MARKETING', status: 'PENDING',
        headerType: '', headerContent: '', headerHandle: '', headerMediaUrl: '',
        bodyText: '', footerText: '', buttons: [], whatsappPhoneNumberId: ''
    });

    // --- Send Modal state ---
    const [showSendModal, setShowSendModal] = useState(false);
    const [sendingTemplate, setSendingTemplate] = useState(null);
    const [contactSearch, setContactSearch] = useState('');
    const [contactResults, setContactResults] = useState([]);
    const [selectedContact, setSelectedContact] = useState(null);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [templateVariables, setTemplateVariables] = useState([]);
    const [sending, setSending] = useState(false);

    // --- Retell AI Call templates state ---
    const [callTemplates, setCallTemplates] = useState([]);
    const [retellAgents, setRetellAgents] = useState([]);
    const [showCallForm, setShowCallForm] = useState(false);
    const [editingCall, setEditingCall] = useState(null);
    const [callForm, setCallForm] = useState({ name: '', description: '', agentId: '', beginMessage: '', promptSuffix: '', isActive: true });

    useEffect(() => {
        if (workspaceId) {
            fetchAllCounts();
            fetchPhoneNumbers();
            if (activeTab === 'WHATSAPP') {
                fetchWaTemplates();
            } else {
                fetchSimpleTemplates(activeTab);
            }
        }
    }, [workspaceId, activeTab]);

    // Fetch tab counts across all types
    const fetchAllCounts = async () => {
        if (!workspaceId) return;
        try {
            const [waRes, emailRes, smsRes, qrRes, callRes] = await Promise.allSettled([
                automationAPI.getTemplates(workspaceId),
                getTemplates(workspaceId, 'EMAIL'),
                getTemplates(workspaceId, 'SMS'),
                getTemplates(workspaceId, 'QUICK_REPLY'),
                retellAPI.getTemplates(workspaceId)
            ]);

            const getCount = (res, isWa = false) => {
                if (res.status !== 'fulfilled') return 0;
                const val = res.value;
                if (isWa) {
                    if (Array.isArray(val.data?.templates)) return val.data.templates.length;
                    if (Array.isArray(val.data)) return val.data.length;
                    if (Array.isArray(val.templates)) return val.templates.length;
                    return 0;
                }
                if (Array.isArray(val.data?.templates)) return val.data.templates.length;
                if (Array.isArray(val.data)) return val.data.length;
                if (Array.isArray(val)) return val.length;
                return 0;
            };

            // Retell templates'ı state'e kaydet
            if (callRes.status === 'fulfilled') {
                const tpls = callRes.value.data?.templates || callRes.value.data || [];
                setCallTemplates(Array.isArray(tpls) ? tpls : []);
            }

            setTabCounts({
                WHATSAPP: getCount(waRes, true),
                EMAIL: getCount(emailRes),
                SMS: getCount(smsRes),
                QUICK_REPLY: getCount(qrRes),
                AI_CALL: getCount(callRes)
            });

            // Agent listesini yükle
            try {
                const agRes = await retellAPI.getAgents(workspaceId);
                setRetellAgents(agRes.data?.agents || agRes.data || []);
            } catch { }
        } catch (err) {
            console.error('Error fetching template counts:', err);
        }
    };

    const fetchPhoneNumbers = async () => {
        try {
            const res = await whatsappAPI.getPhoneNumbers(workspaceId);
            const list = res.data?.phoneNumbers || res.data || [];
            setPhoneNumbers(Array.isArray(list) ? list : []);
        } catch (err) {
            console.warn('Could not fetch WhatsApp numbers:', err.message);
        }
    };

    // ==================== Simple Template Functions ====================
    const fetchSimpleTemplates = async (type = activeTab) => {
        setLoading(true);
        try {
            const res = await getTemplates(workspaceId, type);
            const list = res.data || (Array.isArray(res) ? res : []);
            const cleanList = Array.isArray(list) ? list : [];
            setSimpleTemplates(cleanList);
            setTabCounts(prev => ({ ...prev, [type]: cleanList.length }));
        } catch (err) {
            console.error('Error fetching templates:', err);
            setSimpleTemplates([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSimpleSave = async (e) => {
        e.preventDefault();
        try {
            const data = {
                ...formData,
                title: formData.name || formData.title,
                name: formData.name || formData.title,
                content: formData.message || formData.bodyText,
                message: formData.message || formData.bodyText,
                bodyText: formData.message || formData.bodyText,
                type: activeTab
            };
            if (editId) {
                await updateTemplate(workspaceId, editId, data);
            } else {
                await createTemplate(workspaceId, data);
            }
            setShowSimpleModal(false);
            setEditId(null);
            fetchSimpleTemplates();
            fetchAllCounts();
        } catch (err) {
            console.error('Save simple template error:', err);
            alert('Şablon kaydedilirken bir hata oluştu: ' + (err.response?.data?.message || err.message));
        }
    };

    const handleSimpleEdit = (t) => {
        setFormData({
            name: t.name || t.title || '',
            title: t.title || t.name || '',
            subject: t.subject || '',
            bodyText: t.bodyText || t.content || t.message || '',
            bodyHtml: t.bodyHtml || '',
            shortcut: t.shortcut || '',
            message: t.message || t.content || t.bodyText || '',
            content: t.content || t.message || t.bodyText || ''
        });
        setEditId(t.id);
        setShowSimpleModal(true);
    };

    const handleSeedDefaultQuickReplies = async (overwrite = false) => {
        setLoading(true);
        try {
            const res = await quickReplyAPI.seedDefaults(workspaceId, overwrite);
            alert(res.data?.message || 'Standart hazır mesajlar başarıyla yüklendi.');
            await fetchSimpleTemplates('QUICK_REPLY');
            await fetchAllCounts();
        } catch (err) {
            console.error('Seed defaults error:', err);
            alert('Standart şablonlar yüklenirken hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handlePushQuickReplyToMeta = async (qrId) => {
        if (phoneNumbers.length === 0) {
            alert('Meta şablonu oluşturmak için önce Kanallar sayfasından bir WhatsApp Business numarası bağlamalısınız.');
            return;
        }
        const confirmed = window.confirm('Bu hazır mesaj Meta WhatsApp Şablonu olarak kaydedilip onaya (PENDING) gönderilsin mi?');
        if (!confirmed) return;

        setLoading(true);
        try {
            const phoneId = phoneNumbers[0]?.id;
            const res = await quickReplyAPI.pushToMeta(workspaceId, qrId, phoneId);
            alert(res.data?.message || 'Şablon Meta onay sürecine gönderildi!');
            await fetchWaTemplates();
            await fetchAllCounts();
        } catch (err) {
            console.error('Push to Meta error:', err);
            alert('Meta şablonu oluşturulamadı: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handlePushAllStandardToMeta = async () => {
        if (phoneNumbers.length === 0) {
            alert('Meta şablonu oluşturmak için önce Kanallar sayfasından bir WhatsApp Business numarası bağlamalısınız.');
            return;
        }
        const confirmed = window.confirm('Standart hazır mesajlar (Arama Başarılı, Arama Başarısız, Konum) Meta onayına gönderilsin mi?');
        if (!confirmed) return;

        setSyncing(true);
        try {
            const res = await quickReplyAPI.getAll(workspaceId);
            const list = res.data || [];
            const standardQrs = list.filter(qr =>
                ['/arama-basarili', '/arama-basarisiz', '/konum', '/merhaba'].includes(qr.shortcut) ||
                qr.title?.includes('Arama') || qr.title?.includes('Konum')
            );

            if (standardQrs.length === 0) {
                alert('Önce Hazır Mesajlar sekmesinden standart şablonları yükleyiniz.');
                return;
            }

            let successCount = 0;
            for (const qr of standardQrs) {
                try {
                    await quickReplyAPI.pushToMeta(workspaceId, qr.id, phoneNumbers[0]?.id);
                    successCount++;
                } catch (e) {
                    console.warn('Could not push qr to Meta:', qr.title, e.message);
                }
            }

            alert(`${successCount} adet standart şablon Meta onayına gönderildi!`);
            await fetchWaTemplates();
            await fetchAllCounts();
        } catch (err) {
            console.error('Batch push to Meta error:', err);
            alert('Hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setSyncing(false);
        }
    };

    const handleSimpleDelete = async (id) => {
        if (!window.confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
        try {
            await deleteTemplate(workspaceId, id, activeTab);
            fetchSimpleTemplates();
            fetchAllCounts();
        } catch (err) {
            console.error('Delete simple template error:', err);
            alert('Şablon silinirken hata oluştu');
        }
    };

    // ==================== WhatsApp Meta Template Functions ====================
    const fetchWaTemplates = async () => {
        setLoading(true);
        try {
            const res = await automationAPI.getTemplates(workspaceId);
            const list = res.data?.templates || (Array.isArray(res.data) ? res.data : (Array.isArray(res.templates) ? res.templates : []));
            const cleanList = Array.isArray(list) ? list : [];
            setWaTemplates(cleanList);
            setTabCounts(prev => ({ ...prev, WHATSAPP: cleanList.length }));
        } catch (err) {
            console.error('Error fetching WA templates:', err);
            setWaTemplates([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncTemplates = async () => {
        setSyncing(true);
        try {
            const response = await automationAPI.syncTemplates(workspaceId);
            const { message, syncedCount, errors } = response.data || {};
            if (errors && errors.length > 0) {
                const errMsgs = errors.map(e => `${e.phone || 'Numara'}: ${e.error}`).join('\n');
                alert(`${message || 'Senkronizasyon tamamlandı'}\n\n⚠️ Hatalar:\n${errMsgs}`);
            } else {
                alert(message || `${syncedCount || 0} şablon başarıyla eşitlendi.`);
            }
            await fetchWaTemplates();
            fetchAllCounts();
        } catch (error) {
            console.error('Sync error:', error);
            alert(error.response?.data?.error || 'Meta ile senkronizasyon sırasında hata oluştu.');
        } finally {
            setSyncing(false);
        }
    };

    const handleSaveWaTemplate = async () => {
        try {
            if (!templateForm.name.trim() || !templateForm.bodyText.trim()) {
                alert('Lütfen şablon adı ve mesaj içeriğini doldurun.');
                return;
            }
            if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateForm.headerType) && !templateForm.headerHandle && !templateForm.headerMediaUrl) {
                alert('Lütfen bir medya dosyası seçip yüklenmesini bekleyin.');
                return;
            }

            if (editingTemplate) {
                await automationAPI.updateTemplate(workspaceId, editingTemplate.id, templateForm);
            } else {
                await automationAPI.createTemplate(workspaceId, templateForm);
            }
            setShowTemplateModal(false);
            setEditingTemplate(null);
            resetTemplateForm();
            fetchWaTemplates();
            fetchAllCounts();
        } catch (error) {
            console.error('Save WA template error:', error);
            alert(error.response?.data?.error || error.response?.data?.message || 'Şablon kaydedilemedi.');
        }
    };

    const handleDeleteWaTemplate = async (templateId) => {
        if (!window.confirm('Bu WhatsApp şablonunu silmek istediğinize emin misiniz? (Meta üzerinden de silinecektir)')) return;
        try {
            await automationAPI.deleteTemplate(workspaceId, templateId);
            fetchWaTemplates();
            fetchAllCounts();
        } catch (error) {
            console.error('Delete WA template error:', error);
            alert(error.response?.data?.error || 'Şablon silinemedi');
        }
    };

    const openEditTemplate = (template) => {
        setEditingTemplate(template);
        let parsedButtons = [];
        try {
            parsedButtons = template.buttons ? (typeof template.buttons === 'string' ? JSON.parse(template.buttons) : template.buttons) : [];
        } catch {}

        setTemplateForm({
            name: template.name || '',
            language: template.language || 'tr',
            category: template.category || 'MARKETING',
            status: template.status || 'PENDING',
            bodyText: template.bodyText || '',
            headerType: template.headerType || '',
            headerContent: template.headerContent || '',
            headerHandle: '',
            headerMediaUrl: template.headerContent || '',
            footerText: template.footerText || '',
            buttons: parsedButtons,
            whatsappPhoneNumberId: template.whatsappPhoneNumberId || ''
        });
        setShowTemplateModal(true);
    };

    const resetTemplateForm = () => {
        setTemplateForm({
            name: '',
            language: 'tr',
            category: 'MARKETING',
            status: 'PENDING',
            headerType: '',
            headerContent: '',
            headerHandle: '',
            headerMediaUrl: '',
            bodyText: '',
            footerText: '',
            buttons: [],
            whatsappPhoneNumberId: phoneNumbers[0]?.id || ''
        });
    };

    // ==================== Send Template Functions ====================
    const openSendModal = (template) => {
        setSendingTemplate(template);
        setSelectedContact(null);
        setPhoneNumber('');
        setContactSearch('');
        setContactResults([]);
        const matches = (template.bodyText || '').match(/\{\{(\d+)\}\}/g) || [];
        const uniqueVars = [...new Set(matches)].map((v) => ({ placeholder: v, value: '' }));
        setTemplateVariables(uniqueVars);
        setShowSendModal(true);
    };

    const handleContactSearch = async (query) => {
        setContactSearch(query);
        if (query.length < 2) { setContactResults([]); return; }
        try {
            const response = await contactAPI.getAll(workspaceId, { search: query });
            const contacts = response.data.contacts || [];
            setContactResults(contacts.filter(c => c.phone));
        } catch (error) {
            console.error('Search error:', error);
        }
    };

    const handleSendTemplate = async () => {
        if (!selectedContact && !phoneNumber) {
            alert('Lütfen bir kişi seçin veya telefon numarası girin');
            return;
        }
        setSending(true);
        try {
            const variables = templateVariables.map(v => v.value);
            await automationAPI.sendTemplate(workspaceId, {
                templateId: sendingTemplate.id,
                contactId: selectedContact?.id,
                phoneNumber: phoneNumber || undefined,
                variables: variables.length > 0 ? variables : undefined
            });
            alert('Şablon mesajı başarıyla gönderildi!');
            setShowSendModal(false);
        } catch (error) {
            console.error('Send error:', error);
            alert(error.response?.data?.error || error.response?.data?.message || 'Mesaj gönderilemedi');
        } finally {
            setSending(false);
        }
    };

    // Quick copy to clipboard
    const handleCopyText = (id, text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Filtered templates calculation
    const filteredWaTemplates = useMemo(() => {
        return waTemplates.filter(t => {
            const matchesQuery = searchQuery === '' ||
                (t.name && t.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (t.bodyText && t.bodyText.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (t.templateId && t.templateId.toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesCategory = categoryFilter === 'ALL' || t.category === categoryFilter;
            const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;

            return matchesQuery && matchesCategory && matchesStatus;
        });
    }, [waTemplates, searchQuery, categoryFilter, statusFilter]);

    const filteredSimpleTemplates = useMemo(() => {
        return simpleTemplates.filter(t => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (
                (t.name && t.name.toLowerCase().includes(q)) ||
                (t.subject && t.subject.toLowerCase().includes(q)) ||
                (t.shortcut && t.shortcut.toLowerCase().includes(q)) ||
                (t.bodyText && t.bodyText.toLowerCase().includes(q)) ||
                (t.message && t.message.toLowerCase().includes(q))
            );
        });
    }, [simpleTemplates, searchQuery]);

    // Helpers
    const getStatusBadge = (status) => {
        switch (status) {
            case 'APPROVED':
                return <span className="tpl-badge tpl-badge-approved"><CheckCircle2 size={13} /> Onaylı</span>;
            case 'PENDING':
                return <span className="tpl-badge tpl-badge-pending"><Clock size={13} /> Bekliyor</span>;
            case 'REJECTED':
                return <span className="tpl-badge tpl-badge-rejected"><XCircle size={13} /> Reddedildi</span>;
            default:
                return <span className="tpl-badge tpl-badge-neutral">{status || 'Taslak'}</span>;
        }
    };

    const getCategoryBadge = (category) => {
        switch (category) {
            case 'MARKETING':
                return <span className="tpl-cat-badge cat-marketing">📢 Pazarlama</span>;
            case 'UTILITY':
                return <span className="tpl-cat-badge cat-utility">⚙️ Hizmet</span>;
            case 'AUTHENTICATION':
                return <span className="tpl-cat-badge cat-auth">🔐 Doğrulama</span>;
            default:
                return <span className="tpl-cat-badge cat-general">{category || 'Genel'}</span>;
        }
    };

    const getHeaderTypeBadge = (type) => {
        if (!type) return null;
        switch (type) {
            case 'IMAGE':
                return <span className="tpl-header-badge"><ImageIcon size={12} /> Resim</span>;
            case 'VIDEO':
                return <span className="tpl-header-badge"><Video size={12} /> Video</span>;
            case 'DOCUMENT':
                return <span className="tpl-header-badge"><File size={12} /> Döküman</span>;
            case 'TEXT':
                return <span className="tpl-header-badge"><FileText size={12} /> Metin Başlık</span>;
            default:
                return null;
        }
    };

    // Helper to highlight variables in text
    const renderFormattedText = (text) => {
        if (!text) return null;
        // Match {{1}}, {{ad}}, {{firma}} etc.
        const parts = text.split(/(\{\{[^}]+\}\})/g);
        return parts.map((part, i) => {
            if (part.startsWith('{{') && part.endsWith('}}')) {
                return <span key={i} className="tpl-variable-chip">{part}</span>;
            }
            return part;
        });
    };

    const tabConfig = [
        { id: 'WHATSAPP', label: 'WhatsApp', icon: <Smartphone size={16} />, count: tabCounts.WHATSAPP },
        { id: 'AI_CALL', label: 'AI Arama', icon: <PhoneCall size={16} />, count: tabCounts.AI_CALL },
        { id: 'EMAIL', label: 'E-Posta', icon: <Mail size={16} />, count: tabCounts.EMAIL },
        { id: 'SMS', label: 'SMS', icon: <MessageSquare size={16} />, count: tabCounts.SMS },
        { id: 'QUICK_REPLY', label: 'Hızlı Yanıtlar', icon: <Zap size={16} />, count: tabCounts.QUICK_REPLY },
    ];

    return (
        <div className="tpl-page-container">
            {/* Page Header */}
            <div className="tpl-header-card">
                <div className="tpl-header-left">
                    <div className="tpl-icon-box">
                        <Layers size={24} />
                    </div>
                    <div>
                        <div className="tpl-header-title-row">
                            <h1>Şablon Yönetimi</h1>
                            <span className="tpl-workspace-badge">
                                {currentWorkspace?.name || 'Workspace'}
                            </span>
                        </div>
                        <p>WhatsApp, AI Arama, E-posta, SMS ve Hızlı Yanıt şablonlarınızı tek panelden yönetin.</p>
                    </div>
                </div>

                <div className="tpl-header-actions">
                    {activeTab === 'WHATSAPP' && (
                        <>
                            <button
                                onClick={handleSyncTemplates}
                                disabled={syncing}
                                className="tpl-btn tpl-btn-secondary"
                                title="Meta sunucularındaki şablonları senkronize et"
                            >
                                <RefreshCw size={16} className={syncing ? 'tpl-spin' : ''} />
                                {syncing ? 'Eşitleniyor...' : 'Şablonları Eşitle'}
                            </button>
                            <button
                                onClick={handlePushAllStandardToMeta}
                                disabled={syncing}
                                className="tpl-btn tpl-btn-secondary"
                                style={{ borderColor: '#25D366', color: '#16a34a' }}
                                title="Arama Başarılı, Arama Başarısız ve Konum hazır mesajlarını Meta'ya şablon olarak gönder"
                            >
                                <Sparkles size={16} color="#16a34a" />
                                Standart Şablonları Meta'ya Aktar
                            </button>
                        </>
                    )}

                    {activeTab === 'QUICK_REPLY' && (
                        <button
                            onClick={() => handleSeedDefaultQuickReplies(false)}
                            disabled={loading}
                            className="tpl-btn tpl-btn-secondary"
                            style={{ borderColor: '#3b82f6', color: '#2563eb' }}
                            title="Arama Başarılı, Arama Başarısız, Konum ve Hoşgeldiniz standart şablonlarını yükle"
                        >
                            <Sparkles size={16} color="#2563eb" />
                            Standart Şablonları Yükle
                        </button>
                    )}

                    <button
                        onClick={() => {
                            if (activeTab === 'WHATSAPP') {
                                resetTemplateForm();
                                setEditingTemplate(null);
                                setShowTemplateModal(true);
                            } else if (activeTab === 'AI_CALL') {
                                setCallForm({ name: '', description: '', agentId: '', beginMessage: '', promptSuffix: '', isActive: true });
                                setEditingCall(null);
                                setShowCallForm(true);
                            } else {
                                setEditId(null);
                                setFormData({ name: '', subject: '', bodyText: '', bodyHtml: '', shortcut: '', message: '' });
                                setShowSimpleModal(true);
                            }
                        }}
                        className="tpl-btn tpl-btn-primary"
                    >
                        <Plus size={16} />
                        {activeTab === 'WHATSAPP' ? 'Yeni WhatsApp Şablonu' :
                         activeTab === 'AI_CALL' ? 'Yeni Arama Şablonu' :
                         activeTab === 'EMAIL' ? 'Yeni E-Posta Şablonu' :
                         activeTab === 'SMS' ? 'Yeni SMS Şablonu' : 'Yeni Hızlı Yanıt'}
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="tpl-tabs-bar">
                <div className="tpl-tabs-wrapper">
                    {tabConfig.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setActiveTab(tab.id);
                                setSearchQuery('');
                                setCategoryFilter('ALL');
                                setStatusFilter('ALL');
                            }}
                            className={`tpl-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        >
                            <span className="tpl-tab-icon">{tab.icon}</span>
                            <span className="tpl-tab-label">{tab.label}</span>
                            <span className="tpl-tab-counter">{tab.count || 0}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Search & Filter Controls Bar */}
            <div className="tpl-filter-bar">
                <div className="tpl-search-box">
                    <Search size={16} className="tpl-search-icon" />
                    <input
                        type="text"
                        placeholder={
                            activeTab === 'WHATSAPP' ? 'Şablon adı, Meta ID veya içerik ara...' :
                            activeTab === 'AI_CALL' ? 'Arama şablonu adı veya prompt ara...' :
                            activeTab === 'QUICK_REPLY' ? 'Kısayol (/merhaba) veya mesaj ara...' :
                            'Şablon adı, konu veya metin ara...'
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="tpl-search-input"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="tpl-search-clear">
                            <X size={14} />
                        </button>
                    )}
                </div>

                {activeTab === 'WHATSAPP' && (
                    <div className="tpl-filter-group">
                        <div className="tpl-select-wrapper">
                            <Filter size={14} className="tpl-select-icon" />
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="tpl-select"
                            >
                                <option value="ALL">Tüm Kategoriler</option>
                                <option value="MARKETING">Pazarlama (Marketing)</option>
                                <option value="UTILITY">Hizmet (Utility)</option>
                                <option value="AUTHENTICATION">Doğrulama (Auth)</option>
                            </select>
                        </div>

                        <div className="tpl-select-wrapper">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="tpl-select"
                            >
                                <option value="ALL">Tüm Durumlar</option>
                                <option value="APPROVED">Onaylı</option>
                                <option value="PENDING">Onay Bekliyor</option>
                                <option value="REJECTED">Reddedildi</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Area */}
            {loading ? (
                <div className="tpl-loading-box">
                    <RefreshCw size={28} className="tpl-spin" />
                    <p>Şablonlar yükleniyor...</p>
                </div>
            ) : (
                <>
                    {/* ==================== WhatsApp Tab Grid ==================== */}
                    {activeTab === 'WHATSAPP' && (
                        <>
                        {/* Hazır WhatsApp Şablonları */}
                        {(() => {
                            const existingNames = new Set(waTemplates.map(t => t.name));
                            const availableTemplates = WA_READY_TEMPLATES.filter(t => !existingNames.has(t.name));
                            if (availableTemplates.length === 0) return null;
                            return (
                                <div style={{ marginBottom: 20, padding: '16px 18px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Sparkles size={18} color="#10b981" />
                                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                                                Hazır WhatsApp Şablonları
                                            </h4>
                                            <span style={{ fontSize: 11, background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                                                Taslak Kütüphane
                                            </span>
                                        </div>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>
                                            Kartlara tıklayarak şablonu kütüphanenize ekleyin
                                        </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
                                        {availableTemplates.map(tpl => (
                                            <div
                                                key={tpl.id}
                                                onClick={() => {
                                                    resetTemplateForm();
                                                    setTemplateForm(prev => ({
                                                        ...prev,
                                                        name: tpl.name,
                                                        bodyText: tpl.bodyText,
                                                        category: tpl.category,
                                                        language: 'tr',
                                                        whatsappPhoneNumberId: phoneNumbers[0]?.id || ''
                                                    }));
                                                    setEditingTemplate(null);
                                                    setShowTemplateModal(true);
                                                }}
                                                style={{
                                                    background: '#fff',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: 10,
                                                    padding: '12px 14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    justifyContent: 'space-between',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = '#10b981';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.12)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = '#cbd5e1';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                        <span style={{ fontSize: 20 }}>{tpl.icon}</span>
                                                        <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                            {tpl.badge}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                                                        {tpl.title}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                                                        {tpl.description}
                                                    </div>
                                                </div>
                                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, color: '#10b981', fontSize: 11, fontWeight: 600 }}>
                                                    <Plus size={13} /> Kütüphaneye Ekle
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        {filteredWaTemplates.length === 0 ? (
                            <div className="tpl-empty-box">
                                <div className="tpl-empty-icon-circle">
                                    <Smartphone size={32} />
                                </div>
                                <h3>{searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL' ? 'Filtreye uygun şablon bulunamadı' : 'Henüz WhatsApp Şablonu Yok'}</h3>
                                <p>
                                    {searchQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
                                        ? 'Arama kriterlerinizi değiştirerek tekrar deneyin.'
                                        : 'Meta onaylı WhatsApp şablonlarınızı eşitlemek veya yeni şablon oluşturmak için aşağıdaki adımları kullanabilirsiniz.'}
                                </p>
                                <div className="tpl-empty-actions">
                                    <button onClick={handleSyncTemplates} disabled={syncing} className="tpl-btn tpl-btn-secondary">
                                        <RefreshCw size={15} className={syncing ? 'tpl-spin' : ''} /> Şablonları Eşitle
                                    </button>
                                    <button onClick={() => { resetTemplateForm(); setEditingTemplate(null); setShowTemplateModal(true); }} className="tpl-btn tpl-btn-primary">
                                        <Plus size={15} /> Yeni Şablon Oluştur
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="tpl-grid">
                                {filteredWaTemplates.map(template => {
                                    let buttonsList = [];
                                    try {
                                        buttonsList = template.buttons ? (typeof template.buttons === 'string' ? JSON.parse(template.buttons) : template.buttons) : [];
                                    } catch {}

                                    return (
                                        <div key={template.id} className="tpl-card tpl-card-wa">
                                            {/* Card Top */}
                                            <div className="tpl-card-header">
                                                <div className="tpl-card-title-group">
                                                    <h3 className="tpl-card-title" title={template.name}>
                                                        {template.name}
                                                    </h3>
                                                    {template.templateId && (
                                                        <div className="tpl-meta-id" title="Meta Template ID">
                                                            <span>ID: {template.templateId}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="tpl-card-status">
                                                    {getStatusBadge(template.status)}
                                                </div>
                                            </div>

                                            {/* Badges Row */}
                                            <div className="tpl-card-badges">
                                                {getCategoryBadge(template.category)}
                                                {getHeaderTypeBadge(template.headerType)}
                                                <span className="tpl-lang-badge">
                                                    <Globe size={11} /> {template.language === 'tr' ? 'Türkçe' : template.language}
                                                </span>
                                            </div>

                                            {/* Header Content Preview if any */}
                                            {template.headerType && (
                                                <div className="tpl-header-preview-box">
                                                    {template.headerType === 'IMAGE' && (
                                                        <div className="tpl-media-placeholder">
                                                            <ImageIcon size={16} /> <span>Görsel Başlık</span>
                                                        </div>
                                                    )}
                                                    {template.headerType === 'VIDEO' && (
                                                        <div className="tpl-media-placeholder">
                                                            <Video size={16} /> <span>Video Başlık</span>
                                                        </div>
                                                    )}
                                                    {template.headerType === 'DOCUMENT' && (
                                                        <div className="tpl-media-placeholder">
                                                            <File size={16} /> <span>Döküman / PDF</span>
                                                        </div>
                                                    )}
                                                    {template.headerType === 'TEXT' && template.headerContent && (
                                                        <div className="tpl-text-header-preview">
                                                            <strong>{template.headerContent}</strong>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Message Body */}
                                            <div className="tpl-card-body">
                                                <p>{renderFormattedText(template.bodyText)}</p>
                                            </div>

                                            {/* Footer Text if any */}
                                            {template.footerText && (
                                                <div className="tpl-card-footer-text">
                                                    <small>{template.footerText}</small>
                                                </div>
                                            )}

                                            {/* Interactive Buttons Preview */}
                                            {buttonsList.length > 0 && (
                                                <div className="tpl-card-buttons-preview">
                                                    {buttonsList.map((btn, bIdx) => (
                                                        <div key={bIdx} className="tpl-btn-preview-item">
                                                            {btn.type === 'URL' && <ExternalLink size={12} />}
                                                            {btn.type === 'PHONE_NUMBER' && <PhoneCall size={12} />}
                                                            {btn.type === 'QUICK_REPLY' && <Zap size={12} />}
                                                            <span>{btn.text || 'Buton'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Phone Connection info */}
                                            {template.whatsappPhoneNumber && (
                                                <div className="tpl-phone-tag">
                                                    <Smartphone size={12} />
                                                    <span>{template.whatsappPhoneNumber.displayPhoneNumber || template.whatsappPhoneNumber.name}</span>
                                                </div>
                                            )}

                                            {/* Card Action Buttons */}
                                            <div className="tpl-card-actions">
                                                <button
                                                    className="tpl-action-btn tpl-btn-send"
                                                    onClick={() => openSendModal(template)}
                                                    title="Mesaj Gönder / Test Et"
                                                >
                                                    <Send size={14} /> Gönder
                                                </button>

                                                <button
                                                    className="tpl-action-btn tpl-btn-icon"
                                                    onClick={() => handleCopyText(template.id, template.bodyText)}
                                                    title="Metni Kopyala"
                                                >
                                                    {copiedId === template.id ? <Check size={14} className="tpl-copied-check" /> : <Copy size={14} />}
                                                </button>

                                                <button
                                                    className="tpl-action-btn tpl-btn-icon"
                                                    onClick={() => openEditTemplate(template)}
                                                    title="Düzenle"
                                                >
                                                    <Edit2 size={14} />
                                                </button>

                                                <button
                                                    className="tpl-action-btn tpl-btn-icon tpl-btn-delete"
                                                    onClick={() => handleDeleteWaTemplate(template.id)}
                                                    title="Sil"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </>
                    )}


                    {/* ==================== AI CALL Templates Grid ==================== */}
                    {activeTab === 'AI_CALL' && (
                        <div>
                            {/* Senaryo Bazlı Hazır Şablonlar */}
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, marginBottom: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Sparkles size={18} color="#6366f1" />
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                                            Senaryo Bazlı AI Arama Şablonları
                                        </h4>
                                        <span style={{ fontSize: 11, background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                                            Hazır Senaryolar
                                        </span>
                                    </div>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                        Kartlardan birine tıklayarak arama formunu tek tıkla doldurun
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
                                    {CALL_SCENARIOS.map(sc => (
                                        <div
                                            key={sc.id}
                                            onClick={() => {
                                                const defaultAgent = retellAgents && retellAgents.length > 0 ? retellAgents[0].agent_id : '';
                                                setCallForm({
                                                    name: sc.name,
                                                    description: sc.desc,
                                                    agentId: callForm.agentId || defaultAgent,
                                                    beginMessage: sc.beginMessage,
                                                    promptSuffix: sc.promptSuffix,
                                                    isActive: true
                                                });
                                                setEditingCall(null);
                                                setShowCallForm(true);
                                            }}
                                            style={{
                                                background: '#fff',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: 10,
                                                padding: '12px 14px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'space-between',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.borderColor = '#6366f1';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.12)';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.borderColor = '#cbd5e1';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                                            }}
                                        >
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <span style={{ fontSize: 20 }}>{sc.icon}</span>
                                                    <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                        {sc.badge}
                                                    </span>
                                                </div>
                                                <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                                                    {sc.title}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                                                    {sc.description}
                                                </div>
                                            </div>
                                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, color: '#6366f1', fontSize: 11, fontWeight: 600 }}>
                                                <Plus size={13} /> Şablonu Kullan
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Form */}
                            {showCallForm && (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#334155' }}>
                                        {editingCall ? '✏️ Şablon Düzenle' : '📞 Yeni Arama Şablonu'}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                        <div>
                                            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>Şablon Adı *</label>
                                            <input value={callForm.name} onChange={e => setCallForm(f => ({ ...f, name: e.target.value }))}
                                                placeholder="Ör: Hoşgeldin Araması"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>AI Agent *</label>
                                            <select value={callForm.agentId} onChange={e => setCallForm(f => ({ ...f, agentId: e.target.value }))}
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                                                <option value="">Agent seçin...</option>
                                                {retellAgents.map(ag => (
                                                    <option key={ag.agent_id} value={ag.agent_id}>
                                                        {ag.agent_name || ag.agent_id}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: 12 }}>
                                        <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>Açıklama</label>
                                        <input value={callForm.description} onChange={e => setCallForm(f => ({ ...f, description: e.target.value }))}
                                            placeholder="Bu şablon ne için kullanılıyor?"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                                    </div>
                                    <div style={{ marginBottom: 12 }}>
                                        <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                                            🎙️ Açılış Mesajı <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Agent'ın ilk söyleyeceği cümle)</span>
                                        </label>
                                        <textarea value={callForm.beginMessage} onChange={e => setCallForm(f => ({ ...f, beginMessage: e.target.value }))}
                                            rows={2} placeholder="Ör: Merhaba {{customer_name}}, ben Instomer'dan arıyorum. Hoş geldiniz demek istedik!"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical' }} />
                                    </div>
                                    <div style={{ marginBottom: 14 }}>
                                        <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                                            🧠 Konuşma Promptu <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Agent'a verilen ek talimatlar)</span>
                                        </label>
                                        <textarea value={callForm.promptSuffix} onChange={e => setCallForm(f => ({ ...f, promptSuffix: e.target.value }))}
                                            rows={4} placeholder="Ör: Bu bir hoşgeldin aramasıdır. Müşteriyi karşıla, kendini tanıt, hizmetlerimiz hakkında kısa bilgi ver. Samimi ve sıcak ol."
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={async () => {
                                            if (!callForm.name || !callForm.agentId) return alert('Şablon adı ve Agent seçimi zorunludur');
                                            try {
                                                if (editingCall) {
                                                    await retellAPI.updateTemplate(workspaceId, editingCall.id, callForm);
                                                } else {
                                                    await retellAPI.createTemplate(workspaceId, callForm);
                                                }
                                                setShowCallForm(false); setEditingCall(null);
                                                setCallForm({ name: '', description: '', agentId: '', beginMessage: '', promptSuffix: '', isActive: true });
                                                fetchAllCounts();
                                            } catch (e) { console.error(e); alert('Kaydetme hatası'); }
                                        }}
                                            className="tpl-btn tpl-btn-primary" style={{ fontSize: 13 }}>
                                            <CheckCircle2 size={14} /> {editingCall ? 'Güncelle' : 'Kaydet'}
                                        </button>
                                        <button onClick={() => { setShowCallForm(false); setEditingCall(null); }}
                                            className="tpl-btn tpl-btn-secondary" style={{ fontSize: 13 }}>
                                            İptal
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Template List */}
                            {callTemplates.length === 0 && !showCallForm ? (
                                <div className="tpl-empty-box">
                                    <div className="tpl-empty-icon-circle">
                                        <PhoneCall size={32} />
                                    </div>
                                    <h3>Henüz Arama Şablonu Yok</h3>
                                    <p>AI agent'ınız için senaryo bazlı arama şablonları oluşturun.<br/>Ör: Hoşgeldin araması, randevu teyidi, borç hatırlatma.</p>
                                </div>
                            ) : (
                                <div className="tpl-grid">
                                    {callTemplates
                                        .filter(t => !searchQuery || t.name?.toLowerCase().includes(searchQuery.toLowerCase()) || t.promptSuffix?.toLowerCase().includes(searchQuery.toLowerCase()))
                                        .map(tpl => (
                                        <div key={tpl.id} className="tpl-card" style={{ borderLeft: `4px solid ${tpl.isActive ? '#6366f1' : '#d1d5db'}` }}>
                                            <div className="tpl-card-header">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 22 }}>📞</span>
                                                    <div>
                                                        <h3 className="tpl-card-name">{tpl.name}</h3>
                                                        {tpl.description && <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{tpl.description}</p>}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button onClick={() => {
                                                        setCallForm({ name: tpl.name, description: tpl.description || '', agentId: tpl.agentId, beginMessage: tpl.beginMessage || '', promptSuffix: tpl.promptSuffix || '', isActive: tpl.isActive });
                                                        setEditingCall(tpl); setShowCallForm(true);
                                                    }} className="tpl-icon-btn" title="Düzenle"><Edit2 size={14} /></button>
                                                    <button onClick={async () => {
                                                        if (!window.confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
                                                        try { await retellAPI.deleteTemplate(workspaceId, tpl.id); fetchAllCounts(); } catch(e) { console.error(e); }
                                                    }} className="tpl-icon-btn tpl-icon-btn-danger" title="Sil"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                            <div className="tpl-card-body">
                                                {tpl.beginMessage && (
                                                    <div style={{ marginBottom: 8 }}>
                                                        <div style={{ fontSize: 10, fontWeight: 600, color: '#6366f1', marginBottom: 2 }}>🎙️ AÇILIŞ</div>
                                                        <p style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', margin: 0 }}>"{tpl.beginMessage.substring(0, 120)}{tpl.beginMessage.length > 120 ? '...' : ''}"</p>
                                                    </div>
                                                )}
                                                {tpl.promptSuffix && (
                                                    <div>
                                                        <div style={{ fontSize: 10, fontWeight: 600, color: '#10b981', marginBottom: 2 }}>🧠 PROMPT</div>
                                                        <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{tpl.promptSuffix.substring(0, 150)}{tpl.promptSuffix.length > 150 ? '...' : ''}</p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="tpl-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                                                    {retellAgents.find(a => a.agent_id === tpl.agentId)?.agent_name || tpl.agentId?.substring(0, 16) + '...'}
                                                </span>
                                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: tpl.isActive ? '#dcfce7' : '#f1f5f9', color: tpl.isActive ? '#166534' : '#64748b' }}>
                                                    {tpl.isActive ? 'Aktif' : 'Pasif'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ==================== Simple Tabs (EMAIL, SMS, QUICK_REPLY) Grid ==================== */}
                    {activeTab !== 'WHATSAPP' && activeTab !== 'AI_CALL' && (
                        <>
                        {/* Hazır SMS / E-posta Şablonları */}
                        {(activeTab === 'SMS' || activeTab === 'EMAIL') && (() => {
                            const readyList = activeTab === 'SMS' ? SMS_READY_TEMPLATES : EMAIL_READY_TEMPLATES;
                            const existingNames = new Set(simpleTemplates.map(t => t.name));
                            const availableTemplates = readyList.filter(t => !existingNames.has(t.name));
                            if (availableTemplates.length === 0) return null;

                            const accentColor = activeTab === 'SMS' ? '#f59e0b' : '#6366f1';
                            const badgeBg = activeTab === 'SMS' ? '#fef3c7' : '#e0e7ff';
                            const badgeColor = activeTab === 'SMS' ? '#92400e' : '#4338ca';
                            const label = activeTab === 'SMS' ? 'Hazır SMS Şablonları' : 'Hazır E-posta Şablonları';

                            return (
                                <div style={{ marginBottom: 20, padding: '16px 18px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Sparkles size={18} color={accentColor} />
                                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                                                {label}
                                            </h4>
                                            <span style={{ fontSize: 11, background: badgeBg, color: badgeColor, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                                                Taslak Kütüphane
                                            </span>
                                        </div>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>
                                            Kartlara tıklayarak şablonu kütüphanenize ekleyin
                                        </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
                                        {availableTemplates.map(tpl => (
                                            <div
                                                key={tpl.id}
                                                onClick={() => {
                                                    setEditId(null);
                                                    setFormData({
                                                        name: tpl.name,
                                                        subject: tpl.subject || '',
                                                        bodyText: tpl.bodyText,
                                                        bodyHtml: '',
                                                        shortcut: '',
                                                        message: ''
                                                    });
                                                    setShowSimpleModal(true);
                                                }}
                                                style={{
                                                    background: '#fff',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: 10,
                                                    padding: '12px 14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    justifyContent: 'space-between',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = accentColor;
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = `0 4px 12px ${accentColor}20`;
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = '#cbd5e1';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                        <span style={{ fontSize: 20 }}>{tpl.icon}</span>
                                                        <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                                            {tpl.badge}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                                                        {tpl.title}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                                                        {tpl.description}
                                                    </div>
                                                </div>
                                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, color: accentColor, fontSize: 11, fontWeight: 600 }}>
                                                    <Plus size={13} /> Kütüphaneye Ekle
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        {filteredSimpleTemplates.length === 0 ? (
                            <div className="tpl-empty-box">
                                <div className="tpl-empty-icon-circle">
                                    {activeTab === 'EMAIL' ? <Mail size={32} /> :
                                     activeTab === 'SMS' ? <MessageSquare size={32} /> : <Zap size={32} />}
                                </div>
                                <h3>{searchQuery ? 'Filtreye uygun şablon bulunamadı' : 'Henüz Şablon Eklenmedi'}</h3>
                                <p>
                                    {searchQuery ? 'Farklı bir arama terimi deneyin.' :
                                     activeTab === 'EMAIL' ? 'Müşterilerinize göndereceğiniz e-posta şablonlarını buradan oluşturun.' :
                                     activeTab === 'SMS' ? 'Müşterilerinize tek tıkla göndereceğiniz SMS şablonlarını yönetin.' :
                                     'Sohbetlerde /kısayol yazarak anında gönderebileceğiniz hızlı hazır yanıtlar ekleyin.'}
                                </p>
                                <button
                                    onClick={() => {
                                        setEditId(null);
                                        setFormData({ name: '', subject: '', bodyText: '', bodyHtml: '', shortcut: '', message: '' });
                                        setShowSimpleModal(true);
                                    }}
                                    className="tpl-btn tpl-btn-primary"
                                >
                                    <Plus size={15} /> + Yeni Şablon Oluştur
                                </button>
                            </div>
                        ) : (
                            <div className="tpl-grid">
                                {filteredSimpleTemplates.map(t => (
                                    <div key={t.id} className="tpl-card">
                                        <div className="tpl-card-header">
                                            {activeTab === 'QUICK_REPLY' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div className="tpl-shortcut-pill">
                                                            <Zap size={13} /> {t.shortcut}
                                                        </div>
                                                        {['/arama-basarili', '/arama-basarisiz', '/konum', '/merhaba'].includes(t.shortcut) && (
                                                            <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                                ⭐ Standart
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h3 className="tpl-card-title" style={{ fontSize: '14px', marginTop: '2px' }}>
                                                        {t.title || t.name}
                                                    </h3>
                                                </div>
                                            ) : (
                                                <h3 className="tpl-card-title">{t.name}</h3>
                                            )}

                                            <div className="tpl-card-actions-inline">
                                                <button
                                                    onClick={() => handleCopyText(t.id, activeTab === 'QUICK_REPLY' ? t.message : t.bodyText)}
                                                    className="tpl-icon-btn"
                                                    title="Metni Kopyala"
                                                >
                                                    {copiedId === t.id ? <Check size={14} className="tpl-copied-check" /> : <Copy size={14} />}
                                                </button>
                                                <button onClick={() => handleSimpleEdit(t)} className="tpl-icon-btn" title="Düzenle">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => handleSimpleDelete(t.id)} className="tpl-icon-btn tpl-delete-btn" title="Sil">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {activeTab === 'EMAIL' && t.subject && (
                                            <div className="tpl-subject-row">
                                                <span className="tpl-subject-label">Konu:</span>
                                                <span className="tpl-subject-val">{t.subject}</span>
                                            </div>
                                        )}

                                        <div className="tpl-card-body">
                                            <p>{renderFormattedText(activeTab === 'QUICK_REPLY' ? t.message : t.bodyText)}</p>
                                        </div>

                                        <div className="tpl-card-bottom-info">
                                            <span className="tpl-date-text">
                                                {t.createdAt ? new Date(t.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                                            </span>
                                            {activeTab === 'SMS' && t.bodyText && (
                                                <span className="tpl-char-count">{t.bodyText.length} karakter</span>
                                            )}
                                            {activeTab === 'QUICK_REPLY' && (
                                                <button
                                                    onClick={() => handlePushQuickReplyToMeta(t.id)}
                                                    style={{
                                                        background: '#f0fdf4',
                                                        color: '#16a34a',
                                                        border: '1px solid #bbf7d0',
                                                        borderRadius: '6px',
                                                        padding: '4px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s'
                                                    }}
                                                    title="Bu hazır mesajı Meta WhatsApp Şablonuna aktar"
                                                >
                                                    <Send size={11} /> Meta'ya Aktar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        </>
                    )}
                </>
            )}

            {/* ==================== WhatsApp Create/Edit Modal with Live Preview ==================== */}
            {showTemplateModal && (
                <div className="tpl-modal-backdrop" onClick={() => setShowTemplateModal(false)}>
                    <div className="tpl-modal-dialog tpl-modal-large" onClick={(e) => e.stopPropagation()}>
                        <div className="tpl-modal-header">
                            <div>
                                <h2>{editingTemplate ? 'WhatsApp Şablonunu Düzenle' : 'Yeni WhatsApp Şablonu Oluştur'}</h2>
                                <p className="tpl-modal-subtitle">Meta Business API uyumlu mesaj şablonu</p>
                            </div>
                            <button className="tpl-modal-close" onClick={() => setShowTemplateModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="tpl-modal-body tpl-modal-split">
                            {/* Form Side */}
                            <div className="tpl-modal-form-col">
                                <div className="tpl-notice-banner">
                                    <Sparkles size={16} />
                                    <span>
                                        Şablonunuz kaydedildiğinde Meta onay sürecine (PENDING) gönderilir. Onaylandığında otomatik olarak aktifleşir.
                                    </span>
                                </div>

                                <div className="tpl-form-group">
                                    <label>Şablon Adı *</label>
                                    <input
                                        type="text"
                                        className="tpl-input"
                                        value={templateForm.name}
                                        onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                                        placeholder="örn: hosgeldin_mesaji (küçük harf ve alt çizgi)"
                                    />
                                    <small className="tpl-field-hint">Yalnızca küçük harfler, rakamlar ve alt çizgi (_) kullanabilirsiniz.</small>
                                </div>

                                <div className="tpl-form-grid-2">
                                    <div className="tpl-form-group">
                                        <label>Dil</label>
                                        <select
                                            className="tpl-select-input"
                                            value={templateForm.language}
                                            onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })}
                                        >
                                            <option value="tr">🇹🇷 Türkçe (tr)</option>
                                            <option value="en">🇬🇧 English (en)</option>
                                            <option value="en_US">🇺🇸 English US (en_US)</option>
                                            <option value="de">🇩🇪 Deutsch (de)</option>
                                            <option value="ar">🇸🇦 العربية (ar)</option>
                                            <option value="ru">🇷🇺 Русский (ru)</option>
                                        </select>
                                    </div>

                                    <div className="tpl-form-group">
                                        <label>Kategori</label>
                                        <select
                                            className="tpl-select-input"
                                            value={templateForm.category}
                                            onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                                        >
                                            <option value="MARKETING">📢 Pazarlama (Marketing)</option>
                                            <option value="UTILITY">⚙️ Hizmet (Utility)</option>
                                            <option value="AUTHENTICATION">🔐 Doğrulama (Auth)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Phone number selection */}
                                {phoneNumbers.length > 1 && (
                                    <div className="tpl-form-group">
                                        <label>WhatsApp Numarası</label>
                                        <select
                                            className="tpl-select-input"
                                            value={templateForm.whatsappPhoneNumberId}
                                            onChange={(e) => setTemplateForm({ ...templateForm, whatsappPhoneNumberId: e.target.value })}
                                        >
                                            {phoneNumbers.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.displayPhoneNumber} ({p.name || 'Numara'})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Header Type */}
                                <div className="tpl-form-group">
                                    <label>Başlık / Header (Opsiyonel)</label>
                                    <select
                                        className="tpl-select-input"
                                        value={templateForm.headerType}
                                        onChange={(e) => setTemplateForm({ ...templateForm, headerType: e.target.value, headerContent: '' })}
                                    >
                                        <option value="">Yok (Sadece Metin Gövdesi)</option>
                                        <option value="TEXT">📝 Metin Başlık</option>
                                        <option value="IMAGE">🖼️ Görsel / Resim</option>
                                        <option value="VIDEO">🎬 Video</option>
                                        <option value="DOCUMENT">📄 Döküman / PDF</option>
                                    </select>
                                </div>

                                {templateForm.headerType === 'TEXT' && (
                                    <div className="tpl-form-group">
                                        <label>Başlık Metni</label>
                                        <input
                                            type="text"
                                            className="tpl-input"
                                            value={templateForm.headerContent}
                                            onChange={(e) => setTemplateForm({ ...templateForm, headerContent: e.target.value })}
                                            placeholder="örn: Özel Fırsat Duyurusu!"
                                            maxLength={60}
                                        />
                                    </div>
                                )}

                                {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateForm.headerType) && (
                                    <div className="tpl-form-group">
                                        <label>Örnek Medya Dosyası (Zorunlu)</label>
                                        <input
                                            type="file"
                                            className="tpl-file-input"
                                            accept={
                                                templateForm.headerType === 'IMAGE' ? 'image/jpeg,image/png' :
                                                templateForm.headerType === 'VIDEO' ? 'video/mp4' : '.pdf'
                                            }
                                            disabled={isUploadingMedia}
                                            onChange={async (e) => {
                                                const file = e.target.files[0];
                                                if (!file) return;
                                                const maxSize = templateForm.headerType === 'IMAGE' ? 5 : templateForm.headerType === 'VIDEO' ? 16 : 100;
                                                if (file.size > maxSize * 1024 * 1024) {
                                                    alert(`Dosya boyutu en fazla ${maxSize}MB olabilir.`);
                                                    return;
                                                }
                                                setIsUploadingMedia(true);
                                                const fd = new FormData();
                                                fd.append('file', file);
                                                try {
                                                    const res = await api.post(`/automations/${workspaceId}/templates/upload-media`, fd, {
                                                        headers: { 'Content-Type': 'multipart/form-data' }
                                                    });
                                                    setTemplateForm({
                                                        ...templateForm,
                                                        headerMediaUrl: res.data.mediaUrl,
                                                        headerHandle: res.data.headerHandle,
                                                        headerContent: res.data.mediaUrl
                                                    });
                                                } catch (error) {
                                                    console.error('Media upload error:', error);
                                                    alert('Medya yüklenirken hata oluştu: ' + (error.response?.data?.error || error.message));
                                                } finally {
                                                    setIsUploadingMedia(false);
                                                }
                                            }}
                                        />
                                        {isUploadingMedia && <div className="tpl-upload-status loading">⏳ Medya Meta sunucularına yükleniyor...</div>}
                                        {!isUploadingMedia && templateForm.headerMediaUrl && (
                                            <div className="tpl-upload-status success">
                                                ✅ Dosya yüklendi
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Body Text */}
                                <div className="tpl-form-group">
                                    <div className="tpl-label-row">
                                        <label>Mesaj Gövdesi *</label>
                                        <button
                                            type="button"
                                            className="tpl-insert-var-btn"
                                            onClick={() => {
                                                const matches = (templateForm.bodyText.match(/\{\{(\d+)\}\}/g) || []);
                                                const nextNum = matches.length + 1;
                                                setTemplateForm({
                                                    ...templateForm,
                                                    bodyText: templateForm.bodyText + ` {{${nextNum}}}`
                                                });
                                            }}
                                        >
                                            + Değişken Ekle
                                        </button>
                                    </div>
                                    <textarea
                                        className="tpl-textarea"
                                        value={templateForm.bodyText}
                                        onChange={(e) => setTemplateForm({ ...templateForm, bodyText: e.target.value })}
                                        placeholder="Merhaba {{1}}, talebiniz için teşekkür ederiz. Size en kısa sürede dönüş yapacağız."
                                        rows={5}
                                    />
                                    <small className="tpl-field-hint">Müşteri adı veya tarih gibi dinamik alanlar için {'{{1}}'}, {'{{2}}'} kullanın.</small>
                                </div>

                                {/* Footer Text */}
                                <div className="tpl-form-group">
                                    <label>Alt Bilgi / Footer (Opsiyonel)</label>
                                    <input
                                        type="text"
                                        className="tpl-input"
                                        value={templateForm.footerText}
                                        onChange={(e) => setTemplateForm({ ...templateForm, footerText: e.target.value })}
                                        placeholder="örn: İptal etmek için RED yazabilirsiniz."
                                        maxLength={60}
                                    />
                                </div>

                                {/* Buttons Builder */}
                                <div className="tpl-form-group">
                                    <div className="tpl-label-row">
                                        <label>Eylem Butonları ({templateForm.buttons.length}/3)</label>
                                        {templateForm.buttons.length < 3 && (
                                            <button
                                                type="button"
                                                className="tpl-insert-var-btn"
                                                onClick={() => setTemplateForm({
                                                    ...templateForm,
                                                    buttons: [...templateForm.buttons, { type: 'URL', text: '', url: '' }]
                                                })}
                                            >
                                                <Plus size={13} /> Buton Ekle
                                            </button>
                                        )}
                                    </div>

                                    {templateForm.buttons.map((btn, idx) => (
                                        <div key={idx} className="tpl-btn-builder-row">
                                            <select
                                                className="tpl-select-input tpl-btn-type-select"
                                                value={btn.type}
                                                onChange={(e) => {
                                                    const newBtns = [...templateForm.buttons];
                                                    const newType = e.target.value;
                                                    newBtns[idx] = { type: newType, text: btn.text || '' };
                                                    if (newType === 'URL') newBtns[idx].url = '';
                                                    if (newType === 'PHONE_NUMBER') newBtns[idx].phone_number = '';
                                                    setTemplateForm({ ...templateForm, buttons: newBtns });
                                                }}
                                            >
                                                <option value="URL">🌐 Web Sitesi</option>
                                                <option value="PHONE_NUMBER">📞 Telefon Arama</option>
                                                <option value="QUICK_REPLY">💬 Hızlı Yanıt</option>
                                            </select>

                                            <input
                                                className="tpl-input"
                                                placeholder="Buton Yazısı"
                                                value={btn.text}
                                                onChange={(e) => {
                                                    const newBtns = [...templateForm.buttons];
                                                    newBtns[idx].text = e.target.value;
                                                    setTemplateForm({ ...templateForm, buttons: newBtns });
                                                }}
                                                maxLength={25}
                                            />

                                            {btn.type === 'URL' && (
                                                <input
                                                    className="tpl-input"
                                                    placeholder="https://site.com"
                                                    value={btn.url || ''}
                                                    onChange={(e) => {
                                                        const newBtns = [...templateForm.buttons];
                                                        newBtns[idx].url = e.target.value;
                                                        setTemplateForm({ ...templateForm, buttons: newBtns });
                                                    }}
                                                />
                                            )}

                                            {btn.type === 'PHONE_NUMBER' && (
                                                <input
                                                    className="tpl-input"
                                                    placeholder="+90555..."
                                                    value={btn.phone_number || ''}
                                                    onChange={(e) => {
                                                        const newBtns = [...templateForm.buttons];
                                                        newBtns[idx].phone_number = e.target.value;
                                                        setTemplateForm({ ...templateForm, buttons: newBtns });
                                                    }}
                                                />
                                            )}

                                            <button
                                                type="button"
                                                className="tpl-btn-remove"
                                                onClick={() => {
                                                    const newBtns = templateForm.buttons.filter((_, i) => i !== idx);
                                                    setTemplateForm({ ...templateForm, buttons: newBtns });
                                                }}
                                                title="Butonu Kaldır"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Live Phone Preview Side */}
                            <div className="tpl-modal-preview-col">
                                <div className="tpl-preview-title">
                                    <Smartphone size={16} /> WhatsApp Önizleme
                                </div>
                                <div className="tpl-phone-mockup">
                                    <div className="tpl-phone-screen">
                                        <div className="tpl-chat-bubble">
                                            {/* Header Preview */}
                                            {templateForm.headerType === 'TEXT' && templateForm.headerContent && (
                                                <div className="tpl-preview-header-text">
                                                    {templateForm.headerContent}
                                                </div>
                                            )}
                                            {templateForm.headerType === 'IMAGE' && (
                                                <div className="tpl-preview-media">
                                                    {templateForm.headerMediaUrl ? (
                                                        <img src={templateForm.headerMediaUrl} alt="Header" />
                                                    ) : (
                                                        <div className="tpl-preview-media-empty">
                                                            <ImageIcon size={28} />
                                                            <span>Resim Başlık</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {templateForm.headerType === 'VIDEO' && (
                                                <div className="tpl-preview-media video">
                                                    <Video size={28} />
                                                    <span>Video Başlık</span>
                                                </div>
                                            )}
                                            {templateForm.headerType === 'DOCUMENT' && (
                                                <div className="tpl-preview-media doc">
                                                    <File size={28} />
                                                    <span>Döküman Başlık</span>
                                                </div>
                                            )}

                                            {/* Body Preview */}
                                            <div className="tpl-preview-body">
                                                {templateForm.bodyText ? renderFormattedText(templateForm.bodyText) : 'Mesaj gövdesi buraya gelecek...'}
                                            </div>

                                            {/* Footer Preview */}
                                            {templateForm.footerText && (
                                                <div className="tpl-preview-footer">
                                                    {templateForm.footerText}
                                                </div>
                                            )}

                                            <div className="tpl-preview-time">
                                                14:30 ✓✓
                                            </div>
                                        </div>

                                        {/* Buttons in Preview */}
                                        {templateForm.buttons.length > 0 && (
                                            <div className="tpl-preview-buttons">
                                                {templateForm.buttons.map((btn, idx) => (
                                                    <div key={idx} className="tpl-preview-btn-item">
                                                        {btn.type === 'URL' && <ExternalLink size={12} />}
                                                        {btn.type === 'PHONE_NUMBER' && <PhoneCall size={12} />}
                                                        {btn.type === 'QUICK_REPLY' && <Zap size={12} />}
                                                        <span>{btn.text || 'Buton Yazısı'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="tpl-modal-footer">
                            <button className="tpl-btn tpl-btn-secondary" onClick={() => setShowTemplateModal(false)}>
                                İptal
                            </button>
                            <button className="tpl-btn tpl-btn-primary" onClick={handleSaveWaTemplate}>
                                {editingTemplate ? 'Değişiklikleri Kaydet' : 'Meta Onayına Gönder'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== Simple Create/Edit Modal (EMAIL, SMS, QUICK_REPLY) ==================== */}
            {showSimpleModal && (
                <div className="tpl-modal-backdrop" onClick={() => setShowSimpleModal(false)}>
                    <div className="tpl-modal-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="tpl-modal-header">
                            <div>
                                <h2>
                                    {editId ? 'Şablonu Düzenle' :
                                     activeTab === 'EMAIL' ? 'Yeni E-Posta Şablonu' :
                                     activeTab === 'SMS' ? 'Yeni SMS Şablonu' : 'Yeni Hızlı Yanıt'}
                                </h2>
                                <p className="tpl-modal-subtitle">
                                    {activeTab === 'EMAIL' ? 'E-posta gönderimlerinde kullanılacak hazır şablon' :
                                     activeTab === 'SMS' ? 'SMS bildirimlerinde kullanılacak şablon' : 'Sohbet içinde /kısayol ile gönderilecek hazır mesaj'}
                                </p>
                            </div>
                            <button className="tpl-modal-close" onClick={() => setShowSimpleModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSimpleSave}>
                            <div className="tpl-modal-body">
                                {activeTab === 'QUICK_REPLY' ? (
                                    <>
                                        <div className="tpl-form-group">
                                            <label>Şablon Başlığı *</label>
                                            <input
                                                required
                                                type="text"
                                                value={formData.name || formData.title || ''}
                                                onChange={e => setFormData({ ...formData, name: e.target.value, title: e.target.value })}
                                                className="tpl-input"
                                                placeholder="Örn: Arama Başarılı, Konum Paylaşımı"
                                            />
                                        </div>
                                        <div className="tpl-form-group">
                                            <label>Kısayol (/ ile başlar) *</label>
                                            <input
                                                required
                                                type="text"
                                                value={formData.shortcut}
                                                onChange={e => setFormData({ ...formData, shortcut: e.target.value })}
                                                className="tpl-input"
                                                placeholder="/arama-basarili veya /konum"
                                            />
                                            <small className="tpl-field-hint">Sohbette bu komutu yazdığınızda mesaj otomatik önerilir.</small>
                                        </div>
                                        <div className="tpl-form-group">
                                            <div className="tpl-label-row">
                                                <label>Mesaj İçeriği *</label>
                                                <div className="tpl-var-suggestions" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    <button
                                                        type="button"
                                                        className="tpl-chip-btn"
                                                        onClick={() => setFormData({ ...formData, message: (formData.message || '') + ' {AI Agent İsmi}' })}
                                                    >
                                                        + {'{AI Agent İsmi}'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="tpl-chip-btn"
                                                        onClick={() => setFormData({ ...formData, message: (formData.message || '') + ' {web site linki}' })}
                                                    >
                                                        + {'{web site linki}'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="tpl-chip-btn"
                                                        onClick={() => setFormData({ ...formData, message: (formData.message || '') + ' {konum}' })}
                                                    >
                                                        + {'{konum}'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="tpl-chip-btn"
                                                        onClick={() => setFormData({ ...formData, message: (formData.message || '') + ' {adres}' })}
                                                    >
                                                        + {'{adres}'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="tpl-chip-btn"
                                                        onClick={() => setFormData({ ...formData, message: (formData.message || '') + ' {Firma Adı}' })}
                                                    >
                                                        + {'{Firma Adı}'}
                                                    </button>
                                                </div>
                                            </div>
                                            <textarea
                                                required
                                                rows={6}
                                                value={formData.message}
                                                onChange={e => setFormData({ ...formData, message: e.target.value, content: e.target.value })}
                                                className="tpl-textarea"
                                                placeholder="Merhaba, ben {AI Agent İsmi}..."
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="tpl-form-group">
                                            <label>Şablon Adı *</label>
                                            <input
                                                required
                                                type="text"
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                className="tpl-input"
                                                placeholder="Örn: Fırsat Hoşgeldin Mesajı"
                                            />
                                        </div>

                                        {activeTab === 'EMAIL' && (
                                            <div className="tpl-form-group">
                                                <label>E-Posta Konusu *</label>
                                                <input
                                                    required
                                                    type="text"
                                                    value={formData.subject}
                                                    onChange={e => setFormData({ ...formData, subject: e.target.value })}
                                                    className="tpl-input"
                                                    placeholder="Örn: Talebiniz Hakkında Bilgilendirme"
                                                />
                                            </div>
                                        )}

                                        <div className="tpl-form-group">
                                            <div className="tpl-label-row">
                                                <label>Mesaj İçeriği *</label>
                                                <div className="tpl-var-suggestions">
                                                    <button
                                                        type="button"
                                                        className="tpl-chip-btn"
                                                        onClick={() => setFormData({ ...formData, bodyText: formData.bodyText + ' {{ad}}' })}
                                                    >
                                                        + {'{{ad}}'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="tpl-chip-btn"
                                                        onClick={() => setFormData({ ...formData, bodyText: formData.bodyText + ' {{firma}}' })}
                                                    >
                                                        + {'{{firma}}'}
                                                    </button>
                                                </div>
                                            </div>
                                            <textarea
                                                required
                                                rows={6}
                                                value={formData.bodyText}
                                                onChange={e => setFormData({ ...formData, bodyText: e.target.value })}
                                                className="tpl-textarea"
                                                placeholder="Merhaba {{ad}}, talebiniz tarafımıza ulaştı..."
                                            />
                                            {activeTab === 'SMS' && (
                                                <div className="tpl-char-counter-row">
                                                    <span>{formData.bodyText.length} karakter</span>
                                                    <span>{Math.ceil((formData.bodyText.length || 1) / 160)} SMS</span>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="tpl-modal-footer">
                                <button type="button" onClick={() => setShowSimpleModal(false)} className="tpl-btn tpl-btn-secondary">
                                    İptal
                                </button>
                                <button type="submit" className="tpl-btn tpl-btn-primary">
                                    {editId ? 'Değişiklikleri Kaydet' : 'Şablonu Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ==================== Send / Test Template Modal ==================== */}
            {showSendModal && sendingTemplate && (
                <div className="tpl-modal-backdrop" onClick={() => setShowSendModal(false)}>
                    <div className="tpl-modal-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="tpl-modal-header">
                            <div>
                                <h2>📨 Şablon Gönder: {sendingTemplate.name}</h2>
                                <p className="tpl-modal-subtitle">Kişiye doğrudan WhatsApp şablon mesajı iletin</p>
                            </div>
                            <button className="tpl-modal-close" onClick={() => setShowSendModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="tpl-modal-body">
                            <div className="tpl-send-preview-card">
                                <div className="tpl-send-preview-title">Şablon Metni:</div>
                                <p>{renderFormattedText(sendingTemplate.bodyText)}</p>
                            </div>

                            {selectedContact ? (
                                <div className="tpl-selected-contact-pill">
                                    <div>
                                        <strong>👤 {selectedContact.name || 'İsimsiz Kişi'}</strong>
                                        <div className="tpl-contact-phone-sub">{selectedContact.phone}</div>
                                    </div>
                                    <button className="tpl-btn-remove-contact" onClick={() => setSelectedContact(null)} title="Kişiyi Değiştir">
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="tpl-form-group">
                                        <label>Kişi Seç (Rehberden Ara)</label>
                                        <div className="tpl-contact-search-wrapper">
                                            <input
                                                type="text"
                                                className="tpl-input"
                                                value={contactSearch}
                                                onChange={(e) => handleContactSearch(e.target.value)}
                                                placeholder="İsim veya telefon yazın..."
                                            />
                                            {contactResults.length > 0 && (
                                                <div className="tpl-contact-dropdown">
                                                    {contactResults.map(contact => (
                                                        <div
                                                            key={contact.id}
                                                            className="tpl-contact-item"
                                                            onClick={() => {
                                                                setSelectedContact(contact);
                                                                setContactSearch('');
                                                                setContactResults([]);
                                                            }}
                                                        >
                                                            <span>👤 {contact.name || 'İsimsiz Kişi'}</span>
                                                            <span className="tpl-contact-item-phone">{contact.phone}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="tpl-divider-text">veya doğrudan numara girin</div>

                                    <div className="tpl-form-group">
                                        <label>Telefon Numarası</label>
                                        <input
                                            type="text"
                                            className="tpl-input"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            placeholder="örn: 905551234567"
                                        />
                                        <small className="tpl-field-hint">Ülke kodu ile birlikte (+ olmadan) girin.</small>
                                    </div>
                                </>
                            )}

                            {templateVariables.length > 0 && (
                                <div className="tpl-variables-box">
                                    <h4>Dinamik Değişken Değerleri</h4>
                                    <div className="tpl-var-inputs-grid">
                                        {templateVariables.map((v, idx) => (
                                            <div key={idx} className="tpl-var-field">
                                                <label>{v.placeholder} Değeri</label>
                                                <input
                                                    type="text"
                                                    className="tpl-input"
                                                    value={v.value}
                                                    onChange={(e) => {
                                                        const newVars = [...templateVariables];
                                                        newVars[idx].value = e.target.value;
                                                        setTemplateVariables(newVars);
                                                    }}
                                                    placeholder={`Örn: Değer ${idx + 1}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="tpl-modal-footer">
                            <button className="tpl-btn tpl-btn-secondary" onClick={() => setShowSendModal(false)}>
                                İptal
                            </button>
                            <button
                                className="tpl-btn tpl-btn-primary"
                                onClick={handleSendTemplate}
                                disabled={sending || (!selectedContact && !phoneNumber)}
                            >
                                {sending ? 'Gönderiliyor...' : '📨 Şablonu Gönder'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Templates;
