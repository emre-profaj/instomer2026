import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import {
  workspaceAPI,
  knowledgeBaseAPI,
  appointmentConfigAPI,
  productAPI,
  teamAPI,
  funnelAPI,
  aiAPI,
  resourceAPI,
  quickReplyAPI,
  aiSetupAPI,
  facebookAPI,
  whatsappAPI,
  webWidgetAPI,
  retellAPI,
  emailAPI
} from '../../services/api';
import WhatsAppSettings from '../../components/Settings/WhatsAppSettings';
import RetellSettings from '../../components/Settings/RetellSettings';
import WebWidgetModal from '../../components/WebWidgetModal';
import '../Channels/Channels.css';
import {
  getTopicCategories,
  createTopicCategory,
  updateTopicCategory,
  deleteTopicCategory
} from '../../services/topicCategory.api';
import {
  X,
  Check,
  Plus,
  Building2,
  Book,
  MapPin,
  Folder,
  Package,
  Workflow,
  Users,
  CheckCircle2,
  Loader2,
  Globe,
  AlertCircle,
  FileText,
  Trash2,
  ChevronRight,
  Sparkles,
  Clock,
  Copy,
  Edit2,
  UserPlus,
  User,
  Bot,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  UserCircle,
  Upload,
  Image,
  Phone,
  Mail,
  ExternalLink,
  Zap,
  MessageCircle,
  Facebook,
  Instagram,
  PhoneCall,
  CheckCircle,
  AlertTriangle,
  Activity,
  Settings as SettingsIcon
} from 'lucide-react';

const AIIcon = () => (
  <span
    style={{
      display: 'inline-block',
      width: 14,
      height: 10,
      background: 'linear-gradient(135deg,#E63B2E,#FF4521)',
      borderRadius: 1,
      transform: 'skewX(-25deg)',
      marginRight: 4
    }}
  />
);

// ─── API yanıtından varlığı güvenle çıkarır ──────────────────────────────────
// Uçlar tutarsız: çoğu { team: {...} } / { funnel: {...} } gibi isimli anahtar
// döndürüyor, ürün uçları ise { success: true, data: {...} } döndürüyor.
// Frontend yalnızca isimli anahtarı biliyordu ve bulamayınca `res.data`
// ZARFINI state'e koyuyordu — listede adı ve fiyatı boş bir satır oluşuyor,
// sayfa yenilenince (liste sunucudan tazelendiği için) düzeliyordu.
// Bu yardımcı zarfı ASLA döndürmez: tanıyamazsa null verir, çağıran da
// kendi birleştirme yedeğine düşer.
const unwrapEntity = (res, key) => {
  const d = res?.data;
  if (!d || typeof d !== 'object') return null;
  // SIRA ÖNEMLİ: önce "yanıtın kendisi zaten varlık mı?" diye bakılır.
  // Aksi halde varlığın İÇİNDEKİ aynı adlı alan (örn. bir ürünün category
  // nesnesi) varlığın kendisi sanılıp yanlış katman döndürülüyordu.
  if (d.id) return d;
  if (key && d[key] && typeof d[key] === 'object') return d[key];
  if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) return d.data;
  return null;
};

const STEPS = [
  { key: 'firma', label: 'Firma', icon: <Building2 size={16} /> },
  { key: 'kb', label: 'Bilgi Bankası', icon: <Book size={16} /> },
  { key: 'subeler', label: 'Şubeler', icon: <MapPin size={16} /> },
  { key: 'kategoriler', label: 'Kategoriler', icon: <Folder size={16} /> },
  { key: 'urunler', label: 'Ürünler', icon: <Package size={16} /> },
  { key: 'kaynaklar', label: 'Kaynaklar', icon: <UserCircle size={16} /> },
  { key: 'kanallar', label: 'Kanallar', icon: <Globe size={16} /> },
  { key: 'akislar', label: 'Akışlar', icon: <Workflow size={16} /> },
  { key: 'sablonlar', label: 'Şablonlar', icon: <FileText size={16} /> },
  { key: 'takimlar', label: 'Takımlar', icon: <Users size={16} /> },
  { key: 'agentlar', label: 'AI Agentlar', icon: <AIIcon /> },
  { key: 'ozet', label: 'Özet', icon: <CheckCircle2 size={16} /> },
];

const DEFAULT_WEEKLY_SCHEDULE = [
  { day: 0, label: 'Pazartesi', short: 'Pzt', enabled: true, start: '09:00', end: '18:00' },
  { day: 1, label: 'Salı', short: 'Sal', enabled: true, start: '09:00', end: '18:00' },
  { day: 2, label: 'Çarşamba', short: 'Çar', enabled: true, start: '09:00', end: '18:00' },
  { day: 3, label: 'Perşembe', short: 'Per', enabled: true, start: '09:00', end: '18:00' },
  { day: 4, label: 'Cuma', short: 'Cum', enabled: true, start: '09:00', end: '18:00' },
  { day: 5, label: 'Cumartesi', short: 'Cmt', enabled: false, start: '09:00', end: '18:00' },
  { day: 6, label: 'Pazar', short: 'Paz', enabled: false, start: '09:00', end: '18:00' },
];

const SECTOR_OPTIONS = [
  { value: 'GENERAL', label: 'Genel' },
  { value: 'HEALTHCARE', label: 'Sağlık / Klinik' },
  { value: 'REAL_ESTATE', label: 'Emlak / Gayrimenkul' },
  { value: 'AUTOMOTIVE', label: 'Otomotiv' },
  { value: 'TOURISM', label: 'Turizm / Otelcilik' },
  { value: 'RETAIL', label: 'Perakende / E-Ticaret' },
  { value: 'SERVICE', label: 'Hizmet & Danışmanlık' },
  { value: 'EDUCATION', label: 'Eğitim' },
  { value: 'TECHNOLOGY', label: 'Teknoloji / Yazılım' },
  { value: 'FOOD', label: 'Gıda / Restoran' },
  { value: 'SPA', label: 'Güzellik / SPA' },
  { value: 'LEGAL', label: 'Hukuk' },
  { value: 'FINANCE', label: 'Finans' },
];

const normalizeIndustry = (ind) => {
  if (!ind) return 'GENERAL';
  const upper = String(ind).toUpperCase().trim();
  if (upper.includes('EMLAK') || upper.includes('GAYRIMENKUL') || upper === 'REAL_ESTATE') return 'REAL_ESTATE';
  if (upper.includes('SAĞLIK') || upper.includes('SAGLIK') || upper.includes('KLINIK') || upper === 'HEALTHCARE') return 'HEALTHCARE';
  if (upper.includes('OTO') || upper === 'AUTOMOTIVE') return 'AUTOMOTIVE';
  if (upper.includes('TURIZM') || upper.includes('OTEL') || upper === 'TOURISM') return 'TOURISM';
  if (upper.includes('PERAKENDE') || upper.includes('TICARET') || upper === 'RETAIL') return 'RETAIL';
  if (upper.includes('HIZMET') || upper === 'SERVICE') return 'SERVICE';
  if (upper.includes('EGITIM') || upper.includes('EĞITIM') || upper === 'EDUCATION') return 'EDUCATION';
  if (upper.includes('TEKNO') || upper.includes('YAZILIM') || upper === 'TECHNOLOGY') return 'TECHNOLOGY';
  if (upper.includes('GIDA') || upper.includes('RESTORAN') || upper === 'FOOD') return 'FOOD';
  if (upper.includes('SPA') || upper.includes('GUZELLIK') || upper.includes('GÜZELLIK')) return 'SPA';
  if (upper.includes('HUKUK') || upper === 'LEGAL') return 'LEGAL';
  if (upper.includes('FINANS') || upper.includes('MUHASEBE') || upper === 'FINANCE') return 'FINANCE';
  return SECTOR_OPTIONS.some(o => o.value === ind) ? ind : 'GENERAL';
};

const parseScheduleFromString = (initialStr) => {
  if (!initialStr || typeof initialStr !== 'string') {
    return DEFAULT_WEEKLY_SCHEDULE.map(d => ({ ...d }));
  }
  const s = initialStr.toLowerCase();
  const schedule = DEFAULT_WEEKLY_SCHEDULE.map(d => ({ ...d }));

  const timeMatch = initialStr.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (timeMatch) {
    const start = timeMatch[1].padStart(5, '0');
    const end = timeMatch[2].padStart(5, '0');
    schedule.forEach(d => {
      d.start = start;
      d.end = end;
    });
  }

  if (s.includes('7 gün') || s.includes('her gün')) {
    schedule.forEach(d => { d.enabled = true; });
  } else {
    if (s.includes('cumartesi') || s.includes('cmt')) {
      if (!s.includes('cumartesi: kapalı') && !s.includes('cmt: kapalı') && !s.includes('cumartesi kapalı')) {
        schedule[5].enabled = true;
      }
    }
    if (s.includes('pazar') || s.includes('paz')) {
      if (!s.includes('pazar: kapalı') && !s.includes('paz: kapalı') && !s.includes('pazar kapalı')) {
        schedule[6].enabled = true;
      }
    }
  }
  return schedule;
};

const formatScheduleToString = (schedule) => {
  if (!Array.isArray(schedule)) return 'Belirtilmedi';
  const openDays = schedule.filter(d => (d.enabled !== undefined ? d.enabled : d.isOpen));
  if (openDays.length === 0) return 'Tüm günler kapalı';
  return openDays.map(s => `${s.label || s.day}: ${s.start}-${s.end}`).join(', ');
};

const SetupWizard = () => {
  const [activeStep, setActiveStep] = useState(0);
  const navigate = useNavigate();
  const { currentWorkspace, user: currentUser, refreshWorkspace } = useAuth();
  const toast = useToast();

  const showSuccess = (msg) => toast?.showSuccess ? toast.showSuccess(msg) : alert(msg);
  const showError = (msg) => toast?.showError ? toast.showError(msg) : alert(msg);

  // 1. Firma Form State
  const [companyName, setCompanyName] = useState(currentWorkspace?.name || '');
  const [companyDescription, setCompanyDescription] = useState(currentWorkspace?.companyDescription || '');
  const [companyIndustry, setCompanyIndustry] = useState(() => normalizeIndustry(currentWorkspace?.industry));
  const [companyAddress, setCompanyAddress] = useState(currentWorkspace?.companyAddress || '');
  const [companyPhone, setCompanyPhone] = useState(currentWorkspace?.companyPhone || '');
  const [companyEmail, setCompanyEmail] = useState(currentWorkspace?.companyEmail || '');
  const [companyWebsite, setCompanyWebsite] = useState(currentWorkspace?.companyWebsite || '');
  const [founder, setFounder] = useState(currentWorkspace?.founder || '');
  const [businessAreas, setBusinessAreas] = useState(() => {
    try {
      return typeof currentWorkspace?.businessAreas === 'string'
        ? JSON.parse(currentWorkspace.businessAreas || '[]')
        : (currentWorkspace?.businessAreas || []);
    } catch {
      return [];
    }
  });
  const [newBusinessArea, setNewBusinessArea] = useState('');
  const [serviceRegions, setServiceRegions] = useState(() => {
    try {
      return typeof currentWorkspace?.serviceRegions === 'string'
        ? JSON.parse(currentWorkspace.serviceRegions || '[]')
        : (currentWorkspace?.serviceRegions || []);
    } catch {
      return [];
    }
  });
  const [regionSearchText, setRegionSearchText] = useState('');
  const [regionSuggestions, setRegionSuggestions] = useState([]);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);
  const [googleMapsUrl, setGoogleMapsUrl] = useState(currentWorkspace?.googleMapsUrl || '');
  const [logoPreview, setLogoPreview] = useState(currentWorkspace?.companyLogo || '');
  const [logoUploading, setLogoUploading] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyInfoLoading, setCompanyInfoLoading] = useState(false);

  const [weeklySchedule, setWeeklySchedule] = useState(() => {
    if (currentWorkspace?.companyWeeklySchedule) {
      try {
        const parsed = typeof currentWorkspace.companyWeeklySchedule === 'string'
          ? JSON.parse(currentWorkspace.companyWeeklySchedule)
          : currentWorkspace.companyWeeklySchedule;
        if (Array.isArray(parsed) && parsed.length === 7) {
          return parsed.map((s, i) => ({
            ...DEFAULT_WEEKLY_SCHEDULE[i],
            ...s,
            day: i,
            label: s.label || DEFAULT_WEEKLY_SCHEDULE[i].label,
            enabled: s.enabled !== undefined ? !!s.enabled : (s.isOpen !== undefined ? !!s.isOpen : DEFAULT_WEEKLY_SCHEDULE[i].enabled),
            start: s.start || DEFAULT_WEEKLY_SCHEDULE[i].start,
            end: s.end || DEFAULT_WEEKLY_SCHEDULE[i].end,
          }));
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.schedule) && parsed.schedule.length === 7) {
          return parsed.schedule.map((s, i) => ({
            ...DEFAULT_WEEKLY_SCHEDULE[i],
            ...s,
            day: i,
            label: s.label || DEFAULT_WEEKLY_SCHEDULE[i].label,
            enabled: s.enabled !== undefined ? !!s.enabled : (s.isOpen !== undefined ? !!s.isOpen : DEFAULT_WEEKLY_SCHEDULE[i].enabled),
            start: s.start || DEFAULT_WEEKLY_SCHEDULE[i].start,
            end: s.end || DEFAULT_WEEKLY_SCHEDULE[i].end,
          }));
        }
      } catch {}
    }
    return parseScheduleFromString(currentWorkspace?.companyWorkingHours);
  });
  const [companyHours, setCompanyHours] = useState(() => currentWorkspace?.companyWorkingHours || formatScheduleToString(weeklySchedule));

  const [holidaysConfig, setHolidaysConfig] = useState(() => {
    if (currentWorkspace?.companyWeeklySchedule) {
      try {
        const parsed = typeof currentWorkspace.companyWeeklySchedule === 'string'
          ? JSON.parse(currentWorkspace.companyWeeklySchedule)
          : currentWorkspace.companyWeeklySchedule;
        if (parsed && typeof parsed === 'object' && parsed.holidays) {
          return { closedOnPublicHolidays: true, customHolidays: [], note: '', ...parsed.holidays };
        }
      } catch {}
    }
    return { closedOnPublicHolidays: true, customHolidays: [], note: '' };
  });

  // AI Auto Setup Modal & States
  const [aiSetupModalOpen, setAiSetupModalOpen] = useState(false);
  const [aiSetupLoading, setAiSetupLoading] = useState(false);
  const [aiSetupUrl, setAiSetupUrl] = useState('');
  const [aiSetupResult, setAiSetupResult] = useState(null);
  const [aiSetupApplying, setAiSetupApplying] = useState(false);

  // Kanallar (Channels) State
  const [channelSettings, setChannelSettings] = useState({
    whatsapp: { enabled: true, connected: false, phone: '' },
    instagram: { enabled: true, connected: false, username: '' },
    webWidget: { enabled: true, connected: true },
    voice: { enabled: true, connected: false, provider: 'RETELL' },
  });

  // Real Channels State for Setup Wizard
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [whatsappNumbers, setWhatsappNumbers] = useState([]);
  const [facebookPages, setFacebookPages] = useState([]);
  const [webWidgets, setWebWidgets] = useState([]);
  const [retellSettings, setRetellSettings] = useState(null);
  const [emailChannels, setEmailChannels] = useState([]);

  // Channels Modals & OAuth states
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showRetellModal, setShowRetellModal] = useState(false);
  const [showWidgetModal, setShowWidgetModal] = useState(false);
  const [widgetModalMode, setWidgetModalMode] = useState('create');
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [showPageSelectModal, setShowPageSelectModal] = useState(false);
  const [availablePages, setAvailablePages] = useState([]);
  const [selectedPages, setSelectedPages] = useState([]);
  const [connectingPages, setConnectingPages] = useState(false);
  const [pageSelectChannelType, setPageSelectChannelType] = useState('facebook');
  const [pageSearchTerm, setPageSearchTerm] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailProvider, setEmailProvider] = useState('');
  const [imapForm, setImapForm] = useState({
    preset: 'yandex',
    email: '',
    password: '',
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 465
  });
  const [connectingEmail, setConnectingEmail] = useState(false);
  const [copiedWidgetId, setCopiedWidgetId] = useState(null);


  // Şablonlar State
  const [wizardTemplates, setWizardTemplates] = useState({
    callSuccess: {
      title: 'Arama Başarılı Şablonu',
      content: `Merhaba, ben {AI_AGENT_ISMI}. Bugün değerli vaktinizi ayırıp bizimle görüştüğünüz için teşekkür ederiz.\n\nArama başarıyla gerçekleştirildi. Profesyonel yolculuğunuzda, en doğru sonuçlarla yanınızdayız.\n\n🌐 *Web Sitemiz:* {WEB_SITESI}\n📍 *Kulüp Konumumuz:* {KONUM_LINKI}\n\nAklınıza takılan her soruda bir mesaj uzağınızdayım. En yakın zamanda görüşmek üzere!`
    },
    callFailed: {
      title: 'Arama Başarısız / Ulaşılamadı Şablonu',
      content: `Merhaba, ben {AI_AGENT_ISMI}. {FIRMA_ADI} adına sizi aradık ancak müsait olmadığınızı gördük.\n\nSize yardımcı olmaktan mutluluk duyarız. İstediğiniz zaman bu mesaj üzerinden bize yazabilir veya doğrudan web sitemizi ziyaret edebilirsiniz:\n🌐 *Web Sitemiz:* {WEB_SITESI}\n📍 *Konumumuz:* {KONUM_LINKI}\n\nİyi günler dileriz!`
    },
    location: {
      title: 'Konum & Yol Tarifi Şablonu',
      content: `Merhaba! {FIRMA_ADI} konum ve adres bilgileri:\n\n🏢 *Adres:* {ADRES}\n🗺️ *Google Haritalar:* {KONUM_LINKI}\n🌐 *Web Sitemiz:* {WEB_SITESI}\n🕐 *Çalışma Saatlerimiz:* {CALISMA_SAATLERI}\n\nSizi ağırlamaktan mutluluk duyarız!`
    }
  });

  // Takımlar & Kişiler Sub-tab State
  const [teamActiveTab, setTeamActiveTab] = useState('teams'); // 'teams' | 'members'

  const updateDaySchedule = (index, updates) => {
    setWeeklySchedule(prev => {
      const next = prev.map((d, i) => i === index ? { ...d, ...updates } : d);
      setCompanyHours(formatScheduleToString(next));
      return next;
    });
  };

  const applySchedulePreset = (presetType) => {
    setWeeklySchedule(prev => {
      let next = prev.map(d => ({ ...d }));
      if (presetType === 'weekdays') {
        next = next.map(s => ({
          ...s,
          enabled: s.day <= 4,
          start: '09:00',
          end: '18:00'
        }));
      } else if (presetType === 'weekdays_sat') {
        next = next.map(s => ({
          ...s,
          enabled: s.day <= 5,
          start: '09:00',
          end: '18:00'
        }));
      } else if (presetType === 'all_week') {
        next = next.map(s => ({
          ...s,
          enabled: true,
          start: '09:00',
          end: '18:00'
        }));
      }
      setCompanyHours(formatScheduleToString(next));
      return next;
    });
    showSuccess('Çalışma saatleri şablonu uygulandı.');
  };

  const copyDayTimeToWeekdays = (sourceDay) => {
    setWeeklySchedule(prev => {
      const next = prev.map((d, i) => i < 5 ? { ...d, enabled: true, start: sourceDay.start, end: sourceDay.end } : d);
      setCompanyHours(formatScheduleToString(next));
      return next;
    });
    showSuccess('Pazartesi saatleri hafta içi günlere uygulandı.');
  };

  const loadCompanyInfo = async (wsId) => {
    try {
      setCompanyInfoLoading(true);
      const response = await workspaceAPI.getCompanyInfo(wsId);
      const info = response.data?.companyInfo;
      if (!info) return;

      if (info.companyName) setCompanyName(info.companyName);
      setCompanyDescription(info.companyDescription || '');
      setCompanyAddress(info.companyAddress || '');
      setCompanyPhone(info.companyPhone || '');
      setCompanyEmail(info.companyEmail || '');
      setCompanyWebsite(info.companyWebsite || '');
      setFounder(info.founder || '');
      if (info.industry) setCompanyIndustry(normalizeIndustry(info.industry));
      setGoogleMapsUrl(info.googleMapsUrl || '');
      setLogoPreview(info.companyLogo || '');

      // businessAreas
      let bAreas = [];
      try {
        bAreas = typeof info.businessAreas === 'string' ? JSON.parse(info.businessAreas || '[]') : (info.businessAreas || []);
      } catch (e) {
        bAreas = [];
      }
      setBusinessAreas(Array.isArray(bAreas) ? bAreas : []);

      // serviceRegions
      let sRegions = [];
      try {
        sRegions = typeof info.serviceRegions === 'string' ? JSON.parse(info.serviceRegions || '[]') : (info.serviceRegions || []);
      } catch (e) {
        sRegions = [];
      }
      setServiceRegions(Array.isArray(sRegions) ? sRegions : []);

      // Weekly schedule
      let sched = DEFAULT_WEEKLY_SCHEDULE;
      if (info.companyWeeklySchedule) {
        try {
          const parsed = typeof info.companyWeeklySchedule === 'string'
            ? JSON.parse(info.companyWeeklySchedule)
            : info.companyWeeklySchedule;
          if (Array.isArray(parsed) && parsed.length === 7) {
            sched = parsed.map((s, i) => ({
              ...DEFAULT_WEEKLY_SCHEDULE[i],
              ...s,
              day: i,
              label: s.label || DEFAULT_WEEKLY_SCHEDULE[i].label,
              enabled: s.enabled !== undefined ? !!s.enabled : (s.isOpen !== undefined ? !!s.isOpen : DEFAULT_WEEKLY_SCHEDULE[i].enabled),
              start: s.start || DEFAULT_WEEKLY_SCHEDULE[i].start,
              end: s.end || DEFAULT_WEEKLY_SCHEDULE[i].end,
            }));
          }
        } catch (e) {
          sched = DEFAULT_WEEKLY_SCHEDULE;
        }
      } else if (info.companyWorkingHours) {
        sched = parseScheduleFromString(info.companyWorkingHours);
      }
      setWeeklySchedule(sched);
      setCompanyHours(info.companyWorkingHours || formatScheduleToString(sched));
    } catch (err) {
      console.error('Error loading company info in wizard:', err);
    } finally {
      setCompanyInfoLoading(false);
    }
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentWorkspace?.id) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result);
    };
    reader.readAsDataURL(file);

    try {
      setLogoUploading(true);
      const formData = new FormData();
      formData.append('logo', file);
      const response = await workspaceAPI.uploadCompanyLogo(currentWorkspace.id, formData);
      const info = response.data?.companyInfo;
      if (info?.companyLogo) {
        setLogoPreview(info.companyLogo);
      }
      if (typeof refreshWorkspace === 'function') {
        await refreshWorkspace();
      }
      showSuccess('Logo yüklendi.');
    } catch (error) {
      console.error('Error uploading logo:', error);
      showError('Logo yüklenirken hata oluştu.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!window.confirm('Şirket logosunu silmek istediğinize emin misiniz?')) return;
    try {
      setLogoUploading(true);
      await workspaceAPI.deleteCompanyLogo(currentWorkspace.id);
      setLogoPreview('');
      if (typeof refreshWorkspace === 'function') {
        await refreshWorkspace();
      }
      showSuccess('Logo silindi.');
    } catch (error) {
      console.error('Error deleting logo:', error);
      showError('Logo silinirken hata oluştu.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSaveCompanyData = async (silent = false) => {
    if (!currentWorkspace?.id) return false;
    if (!companyName.trim()) {
      if (!silent) showError('Lütfen firma adını girin.');
      return false;
    }

    try {
      setSavingCompany(true);
      const scheduleText = formatScheduleToString(weeklySchedule);
      const payload = {
        companyName: companyName.trim(),
        companyDescription: companyDescription || '',
        companyAddress: companyAddress || '',
        companyPhone: companyPhone || '',
        companyEmail: companyEmail || '',
        companyWebsite: companyWebsite || '',
        companyWorkingHours: scheduleText,
        founder: founder || '',
        industry: companyIndustry || 'GENERAL',
        businessAreas: JSON.stringify(businessAreas || []),
        serviceRegions: JSON.stringify(serviceRegions || []),
        googleMapsUrl: googleMapsUrl || '',
        companyWeeklySchedule: weeklySchedule
      };

      await workspaceAPI.updateCompanyInfo(currentWorkspace.id, payload);
      if (typeof refreshWorkspace === 'function') {
        await refreshWorkspace();
      }
      if (!silent) {
        showSuccess('Firma bilgileri kaydedildi!');
      }
      return true;
    } catch (e) {
      console.error('Save company info error in wizard:', e);
      if (!silent) {
        showError('Firma bilgileri kaydedilirken bir hata oluştu.');
      }
      return false;
    } finally {
      setSavingCompany(false);
    }
  };

  // 2. Bilgi Bankası (KB) State
  const [kbUrl, setKbUrl] = useState('');
  const [kbScraping, setKbScraping] = useState(false);
  const [kbScrapeResult, setKbScrapeResult] = useState(null);
  const [manualKbTitle, setManualKbTitle] = useState('');
  const [manualKbText, setManualKbText] = useState('');
  const [manualKbSaving, setManualKbSaving] = useState(false);
  const [kbEntries, setKbEntries] = useState([]);
  const [kbLoading, setKbLoading] = useState(false);

  // 3. Şubeler State
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', address: '', phone: '' });
  const [savingBranch, setSavingBranch] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [editBranchData, setEditBranchData] = useState({ name: '', address: '', phone: '' });
  const [savingEditBranch, setSavingEditBranch] = useState(false);

  // 4. Kategoriler State
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', description: '', color: '#3b82f6' });
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editCategoryData, setEditCategoryData] = useState({ name: '', description: '', color: '#3b82f6' });
  const [savingEditCategory, setSavingEditCategory] = useState(false);

  // 5. Ürünler State
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', categoryId: '' });
  const [savingProduct, setSavingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editProductData, setEditProductData] = useState({ name: '', price: '', categoryId: '' });
  const [savingEditProduct, setSavingEditProduct] = useState(false);

  // 5.5 Kaynaklar (Resources / Doktorlar / Uzmanlar / Alanlar) State
  const [resources, setResources] = useState([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [showAddResource, setShowAddResource] = useState(false);
  const [newResource, setNewResource] = useState({
    name: '',
    title: '',
    description: '',
    type: 'PERSON',
    availableStart: '09:00',
    availableEnd: '18:00',
    slotMinutes: 30,
    branchIds: [],
    syncProvider: 'WORKSPACE_DEFAULT'
  });
  const [savingResource, setSavingResource] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [editResourceData, setEditResourceData] = useState({
    name: '',
    title: '',
    description: '',
    type: 'PERSON',
    availableStart: '09:00',
    availableEnd: '18:00',
    slotMinutes: 30,
    branchIds: [],
    syncProvider: 'WORKSPACE_DEFAULT'
  });
  const [savingEditResource, setSavingEditResource] = useState(false);

  // 6. Akışlar State
  const [funnels, setFunnels] = useState([]);
  const [showAddFunnel, setShowAddFunnel] = useState(false);
  const [newFunnel, setNewFunnel] = useState({
    name: '',
    color: '#3b82f6',
    stages: ['Yeni Başvuru', 'İşlemde', 'Tamamlandı', 'İptal']
  });
  const [newStageInput, setNewStageInput] = useState('');
  const [savingFunnel, setSavingFunnel] = useState(false);
  const [editingFunnelId, setEditingFunnelId] = useState(null);
  const [editFunnelData, setEditFunnelData] = useState({
    name: '',
    color: '#3b82f6',
    stages: [],
    deletedStageIds: []
  });
  const [savingEditFunnel, setSavingEditFunnel] = useState(false);

  // 7. Takımlar & Kullanıcı Yönetimi State
  const [teams, setTeams] = useState([]);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', description: '', color: '#3b82f6' });
  const [savingTeam, setSavingTeam] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editTeamData, setEditTeamData] = useState({ name: '', description: '', color: '#3b82f6' });
  const [savingEditTeam, setSavingEditTeam] = useState(false);

  // Workspace Üyeleri & Takım Üyeliği
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [activeTeamMemberAddId, setActiveTeamMemberAddId] = useState(null);
  const [selectedMemberUserId, setSelectedMemberUserId] = useState('');
  const [addingTeamMember, setAddingTeamMember] = useState(false);
  const [showCreateNewUserModal, setShowCreateNewUserModal] = useState(false);
  const [newUserData, setNewUserData] = useState({ name: '', email: '', password: 'Password123!' });
  const [creatingUser, setCreatingUser] = useState(false);

  // 8. AI Asistanlar State
  const [bots, setBots] = useState([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const [showAddBot, setShowAddBot] = useState(false);
  const [newBot, setNewBot] = useState({
    name: '',
    role: 'Müşteri Temsilcisi (Chat & Ses)',
    prompt: '',
    isActive: true,
    whatsappEnabled: true,
    instagramEnabled: true,
    widgetEnabled: true,
    facebookEnabled: true
  });
  const [savingBot, setSavingBot] = useState(false);
  const [editingBotId, setEditingBotId] = useState(null);
  const [editBotData, setEditBotData] = useState({
    name: '',
    role: '',
    prompt: '',
    isActive: true,
    whatsappEnabled: true,
    instagramEnabled: true,
    widgetEnabled: true,
    facebookEnabled: true,
    capabilities: {
      appointment: true,
      product: true,
      humanHandoff: true,
      knowledgeBase: true
    }
  });
  const [savingEditBot, setSavingEditBot] = useState(false);

  // AI Agent Karakter & Amaç Seçimi State
  const [newBotCharacter, setNewBotCharacter] = useState('PROFESSIONAL');
  const [newBotPurpose, setNewBotPurpose] = useState('ALL_IN_ONE');
  const [editBotCharacter, setEditBotCharacter] = useState('PROFESSIONAL');
  const [editBotPurpose, setEditBotPurpose] = useState('ALL_IN_ONE');

  const handleGenerateBotPrompt = (target = 'new') => {
    const compName = companyName || currentWorkspace?.companyName || 'Şirketimiz';
    const sector = companyIndustry || currentWorkspace?.industry || 'Genel';
    const character = target === 'new' ? newBotCharacter : editBotCharacter;
    const purpose = target === 'new' ? newBotPurpose : editBotPurpose;

    const toneDescriptions = {
      PROFESSIONAL: 'Sen son derece profesyonel, kurumsal, saygılı, net ve güven veren bir dille konuşan kıdemli bir temsilcisin. Müşteriye "Siz" diye hitap et, mesafeli ve nazik ol.',
      FRIENDLY: 'Sen enerjik, samimi, güler yüzlü ve yardımsever bir asistansın. Müşteriyi içtenlikle karşıla, sıcak ve samimi ama saygılı bir dil kullan. Gerektiğinde hafif emojiler kullan.',
      SOLUTION_ORIENTED: 'Sen son derece hızlı, pratik ve çözüm odaklı bir temsilcisin. Gereksiz uzatmalardan kaçın, net bilgiler ver ve müşteriyi doğrudan aksiyona veya randevuya yönlendir.',
      SALES_ORIENTED: 'Sen ikna kabiliyeti yüksek, fayda odaklı ve satış danışmanlığı yapan dinamik bir temsilcisin. Müşterinin ihtiyaçlarını tespit et, ürün ve hizmetlerimizin avantajlarını öne çıkar ve teklif/randevu almaya odaklan.',
      CONSULTANT: 'Sen empatik, dinleyen, sakinleştirici ve uzman bir danışmansın. Müşterinin durumunu özenle dinle, detaylı açıklamalarda bulun ve güven ver.'
    };

    const purposeDescriptions = {
      APPOINTMENT: 'Öncelikli amacın müşterilerin müsaitliklerini öğrenmek, uygun uzman/şube ve tarih saat belirleyerek randevu oluşturmak ve randevu teyidi almaktır.',
      SUPPORT_FAQ: 'Öncelikli amacın şirket, hizmetler, iade koşulları, çalışma saatleri ve sık sorulan sorular hakkında doğru ve eksiksiz bilgi vererek müşteri memnuniyeti sağlamaktır.',
      SALES_PRODUCT: 'Öncelikli amacın ürün veya hizmet kataloğumuzu tanıtmak, fiyat ve detay paylaşmak, teklif hazırlamak ve satışı sonlandırmaktır.',
      LEAD_CAPTURE: 'Öncelikli amacın potansiyel müşterinin adını, telefon numarasını, ilgilendiği konuyu ve talebini toplayarak satış ekibine aktarmaktır.',
      ALL_IN_ONE: 'Sen kurumumuzun tüm operasyonlarını temsil eden genel asistansın. SSS yanıtlama, ürün/hizmet tanıtımı, randevu oluşturma ve şikayet/talep toplama görevlerinin tamamını yürütürsün.'
    };

    const promptText = `SEN ${compName.toUpperCase()} FİRMASININ RESMİ YAPAY ZEKA TEMSİLCİSİSİN.
Sektör: ${sector}

ÜSLUP VE KARAKTER:
${toneDescriptions[character] || toneDescriptions.PROFESSIONAL}

TEMEL AMACIN VE GÖREVLERİN:
${purposeDescriptions[purpose] || purposeDescriptions.ALL_IN_ONE}

GENEL DAVRANIŞ KURALLARI:
1. Yalnızca firma bilgi bankasında, ürün listesinde ve çalışma saatlerinde yer alan doğrulanmış bilgileri paylaş. Bilmediğin konularda uydurma bilgi verme, ekibimize yönlendireceğini söyle.
2. Adres sorulduğunda kayıtlı açık adresi ve konum linkini paylaş.
3. Çalışma saatleri ve resmi tatiller konusunda güncel takvim ve resmi tatil politikamıza riayet et.
4. Müşterinin sorularını dikkatle yanıtla ve görüşmeyi olumlu bir sonuca bağla.`;

    if (target === 'new') {
      setNewBot(prev => ({ ...prev, prompt: promptText }));
    } else {
      setEditBotData(prev => ({ ...prev, prompt: promptText }));
    }
    showSuccess('🪄 AI Agent sistem promptu başarıyla oluşturuldu!');
  };

  const handleAiSetupFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setAiSetupLoading(true);
      const res = await aiSetupAPI.parseFile(currentWorkspace.id, formData);
      if (res.data?.success) {
        setAiSetupResult(res.data.data);
      } else {
        showError('Belge analiz edilemedi');
      }
    } catch (err) {
      console.error('File parse error in wizard:', err);
      showError('Belge analizi hatası: ' + (err.response?.data?.message || err.message));
    } finally {
      setAiSetupLoading(false);
    }
  };

  const handleAiSetupUrlParse = async () => {
    if (!aiSetupUrl.trim()) {
      showError('Lütfen bir web sitesi adresi girin.');
      return;
    }
    try {
      setAiSetupLoading(true);
      const res = await aiSetupAPI.parseUrl(currentWorkspace.id, aiSetupUrl.trim());
      if (res.data?.success) {
        setAiSetupResult(res.data.data);
      } else {
        showError('Web sitesi analiz edilemedi');
      }
    } catch (err) {
      console.error('URL parse error in wizard:', err);
      showError('Web sitesi analizi hatası: ' + (err.response?.data?.message || err.message));
    } finally {
      setAiSetupLoading(false);
    }
  };

  const handleApplyAiSetupToWizard = async () => {
    if (!aiSetupResult) return;
    try {
      setAiSetupApplying(true);
      if (currentWorkspace?.id) {
        await aiSetupAPI.applySetup(currentWorkspace.id, aiSetupResult);
      }
      if (aiSetupResult.company) {
        const c = aiSetupResult.company;
        if (c.name) setCompanyName(c.name);
        if (c.description) setCompanyDescription(c.description);
        if (c.address) setCompanyAddress(c.address);
        if (c.phone) setCompanyPhone(c.phone);
        if (c.email) setCompanyEmail(c.email);
        if (c.website) setCompanyWebsite(c.website);
        if (c.founder) setFounder(c.founder);
        if (c.industry) setCompanyIndustry(normalizeIndustry(c.industry));
        if (Array.isArray(c.businessAreas)) setBusinessAreas(c.businessAreas);
        if (Array.isArray(c.serviceRegions)) setServiceRegions(c.serviceRegions);
        if (c.googleMapsUrl) setGoogleMapsUrl(c.googleMapsUrl);
      }
      if (aiSetupResult.weeklySchedule && Array.isArray(aiSetupResult.weeklySchedule.schedule)) {
        setWeeklySchedule(aiSetupResult.weeklySchedule.schedule);
        if (aiSetupResult.weeklySchedule.holidays) {
          setHolidaysConfig(aiSetupResult.weeklySchedule.holidays);
        }
      }
      showSuccess('🪄 AI Kurulumu tamamlandı! Tüm veriler sihirbaza aktarıldı.');
      setAiSetupModalOpen(false);
      setAiSetupResult(null);
      if (typeof refreshWorkspace === 'function') refreshWorkspace();
      if (currentWorkspace?.id) loadWorkspaceData(currentWorkspace.id);
    } catch (err) {
      console.error('Apply AI setup error:', err);
      showError('Uygulama hatası: ' + (err.response?.data?.message || err.message));
    } finally {
      setAiSetupApplying(false);
    }
  };

  // 9. Özet & Birleşik Bilgi Bankası State
  const [compiledKb, setCompiledKb] = useState(null);
  const [compiledKbLoading, setCompiledKbLoading] = useState(false);
  const [ozetTab, setOzetTab] = useState('structured'); // 'structured' | 'rawText'
  const [copiedKb, setCopiedKb] = useState(false);
  const [savingCompiledKb, setSavingCompiledKb] = useState(false);
  const [compiledKbSaved, setCompiledKbSaved] = useState(false);

  // ─── Workspace verilerini yükler ──────────────────────────────────────────
  // İSİMLİ OLMASI ŞART: AI kurulumu uygulandıktan sonra da çağrılıyor.
  // Önceden orada loadBranches / loadCategories / loadProducts / loadResources /
  // loadKnowledgeBaseEntries çağrılıyordu ama bu isimler hiç tanımlanmamıştı —
  // yükleme mantığı yalnızca aşağıdaki useEffect içinde isimsiz duruyordu.
  // Sonuç: kullanıcı "AI Kurulumu tamamlandı" mesajının hemen ardından
  // "Uygulama hatası: loadBranches is not defined" alıyor ve içe aktarılan
  // veriler sayfa yenilenene kadar ekranda görünmüyordu.
  const loadWorkspaceData = (wsId) => {
    if (!wsId) return;

    // Load Company Info
    loadCompanyInfo(wsId);

    // Load KB
    setKbLoading(true);
    if (typeof knowledgeBaseAPI?.getAll === 'function') {
      knowledgeBaseAPI.getAll(wsId)
        .then(res => {
          const raw = res.data?.entries || res.data;
          setKbEntries(Array.isArray(raw) ? raw : []);
        })
        .catch(err => {
          console.error('KB Load error:', err);
          setKbEntries([]);
        })
        .finally(() => setKbLoading(false));
    } else {
      setKbLoading(false);
    }

    // Load Branches
    setBranchesLoading(true);
    if (typeof appointmentConfigAPI?.getLocations === 'function') {
      appointmentConfigAPI.getLocations(wsId)
        .then(res => {
          const raw = res.data?.locations || res.data;
          setBranches(Array.isArray(raw) ? raw : []);
        })
        .catch(err => {
          console.error('Branches Load error:', err);
          setBranches([]);
        })
        .finally(() => setBranchesLoading(false));
    } else {
      setBranchesLoading(false);
    }

    // Load Categories
    setCategoriesLoading(true);
    if (typeof getTopicCategories === 'function') {
      getTopicCategories(wsId)
        .then(res => {
          const raw = res.data?.categories || res.data;
          setCategories(Array.isArray(raw) ? raw : []);
        })
        .catch(err => {
          console.error('Categories Load error:', err);
          setCategories([]);
        })
        .finally(() => setCategoriesLoading(false));
    } else {
      setCategoriesLoading(false);
    }

    // Load Products
    setProductsLoading(true);
    if (typeof productAPI?.getAll === 'function') {
      productAPI.getAll(wsId)
        .then(res => {
          const raw = res.data?.products || res.data;
          setProducts(Array.isArray(raw) ? raw : []);
        })
        .catch(err => {
          console.error('Products Load error:', err);
          setProducts([]);
        })
        .finally(() => setProductsLoading(false));
    } else {
      setProductsLoading(false);
    }

    // Load Resources (Kaynaklar)
    setResourcesLoading(true);
    if (typeof resourceAPI?.getAll === 'function') {
      resourceAPI.getAll(wsId)
        .then(res => {
          const raw = res.data?.resources || res.data;
          setResources(Array.isArray(raw) ? raw : []);
        })
        .catch(err => {
          console.error('Resources Load error:', err);
          setResources([]);
        })
        .finally(() => setResourcesLoading(false));
    } else {
      setResourcesLoading(false);
    }

    // Load Funnels
    if (typeof funnelAPI?.getAll === 'function') {
      funnelAPI.getAll(wsId)
        .then(res => {
          const raw = res.data?.funnels || res.data;
          setFunnels(Array.isArray(raw) ? raw : []);
        })
        .catch(err => {
          console.error('Funnels Load error:', err);
          setFunnels([]);
        });
    }

    // Load Teams
    if (typeof teamAPI?.getWorkspaceTeams === 'function') {
      teamAPI.getWorkspaceTeams(wsId)
        .then(res => {
          const raw = res.data?.teams || res.data;
          setTeams(Array.isArray(raw) ? raw : []);
        })
        .catch(err => {
          console.error('Teams Load error:', err);
          setTeams([]);
        });
    } else if (typeof teamAPI?.getAll === 'function') {
      teamAPI.getAll(wsId)
        .then(res => {
          const raw = res.data?.teams || res.data;
          setTeams(Array.isArray(raw) ? raw : []);
        })
        .catch(err => {
          console.error('Teams Load error:', err);
          setTeams([]);
        });
    }

    // Load Workspace Members
    if (typeof workspaceAPI?.getMembers === 'function') {
      workspaceAPI.getMembers(wsId)
        .then(res => {
          const raw = res.data?.members || res.data;
          let list = Array.isArray(raw) ? raw : [];
          if (list.length === 0 && currentUser?.id) {
            list = [{ userId: currentUser.id, role: 'OWNER', user: currentUser }];
          }
          setWorkspaceMembers(list);
        })
        .catch(err => {
          console.error('Workspace members Load error:', err);
          if (currentUser?.id) {
            setWorkspaceMembers([{ userId: currentUser.id, role: 'OWNER', user: currentUser }]);
          }
        });
    }

    // Load AI Bots
    setBotsLoading(true);
    if (typeof aiAPI?.getBots === 'function') {
      aiAPI.getBots(wsId)
        .then(res => {
          const raw = res.data?.bots || res.data;
          setBots(Array.isArray(raw) ? raw : []);
        })
        .catch(err => {
          console.error('Bots Load error:', err);
          setBots([]);
        })
        .finally(() => setBotsLoading(false));
    } else {
      setBotsLoading(false);
    }

    // Load channels
    loadWizardChannels();
  };

  // Load Initial Workspace Data
  useEffect(() => {
    if (currentWorkspace?.id) loadWorkspaceData(currentWorkspace.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  // Kanalları API'den yükleme
  const loadWizardChannels = async () => {
    if (!currentWorkspace?.id) return;
    setChannelsLoading(true);
    try {
      const [waRes, fbRes, widgetsRes, retellRes, emailRes] = await Promise.all([
        whatsappAPI.getPhoneNumbers(currentWorkspace.id).catch(() => ({ data: { phoneNumbers: [] } })),
        facebookAPI.getPages(currentWorkspace.id).catch(() => ({ data: { pages: [] } })),
        webWidgetAPI.getAll(currentWorkspace.id).catch(() => ({ data: { widgets: [] } })),
        retellAPI.getSettings(currentWorkspace.id).catch(() => ({ data: { isConfigured: false } })),
        emailAPI.getChannels(currentWorkspace.id).catch(() => ({ data: { emailChannels: [] } }))
      ]);
      setWhatsappNumbers(waRes.data?.phoneNumbers || []);
      setFacebookPages(fbRes.data?.pages || []);
      setWebWidgets(widgetsRes.data?.widgets || []);
      setRetellSettings(retellRes.data?.isConfigured ? retellRes.data : null);
      setEmailChannels(emailRes.data?.emailChannels || []);
    } catch (err) {
      console.error('Error loading wizard channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  };

  // Kanallar adımına geçildiğinde kanalları tazele
  useEffect(() => {
    if (STEPS[activeStep]?.key === 'kanallar' && currentWorkspace?.id) {
      loadWizardChannels();
    }
  }, [activeStep, currentWorkspace?.id]);

  // Facebook & Instagram Meta OAuth bağlantısı
  const handleOAuthConnect = (channelType = 'facebook') => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5008/api';
    const authBaseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
    const token = localStorage.getItem('token');
    const stateObj = { token, workspaceId: currentWorkspace?.id, channelType };
    const state = encodeURIComponent(JSON.stringify(stateObj));

    localStorage.removeItem('oauth_result');

    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const processOAuthSuccess = (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      localStorage.removeItem('oauth_result');

      const pages = data.availablePages || [];
      const callbackChannelType = data.channelType || channelType;

      let filteredPages = pages;
      if (callbackChannelType === 'instagram') {
        filteredPages = pages.filter(p => p.instagram_business_account?.id);
      }

      if (filteredPages.length > 0) {
        setAvailablePages(filteredPages);
        setSelectedPages([]);
        setPageSelectChannelType(callbackChannelType);
        setShowPageSelectModal(true);
      } else {
        alert(callbackChannelType === 'instagram'
          ? 'Instagram Business hesabı bulunamadı.'
          : 'Bağlanabilecek sayfa bulunamadı.');
        loadWizardChannels();
      }
    };

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollInterval);
    };

    const handleMessage = async (event) => {
      if (event.data?.type === 'FACEBOOK_AUTH_SUCCESS') {
        cleanup();
        processOAuthSuccess(event.data);
      }
    };

    const handleStorageChange = (event) => {
      if (event.key === 'oauth_result' && event.newValue) {
        try {
          const result = JSON.parse(event.newValue);
          if (result.type === 'FACEBOOK_AUTH_SUCCESS') {
            cleanup();
            processOAuthSuccess(result);
          }
        } catch (e) {
          console.error('Error parsing OAuth result:', e);
        }
      }
    };

    const pollInterval = setInterval(() => {
      const result = localStorage.getItem('oauth_result');
      if (result) {
        try {
          const data = JSON.parse(result);
          if (data.type === 'FACEBOOK_AUTH_SUCCESS') {
            cleanup();
            processOAuthSuccess(data);
          }
        } catch (e) {}
      }
    }, 500);

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorageChange);
    setTimeout(() => cleanup(), 5 * 60 * 1000);

    window.open(
      `${authBaseUrl}/auth/facebook?state=${state}`,
      'Facebook OAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  const togglePageSelection = (pageId) => {
    setSelectedPages(prev =>
      prev.includes(pageId)
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId]
    );
  };

  const handleConnectSelectedPages = async () => {
    if (selectedPages.length === 0) {
      showError('Lütfen en az bir sayfa seçin.');
      return;
    }

    setConnectingPages(true);
    try {
      let hasConversationRoutingWarning = false;
      for (const pageId of selectedPages) {
        const page = availablePages.find(p => p.id === pageId);
        if (page) {
          const connectData = {
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token,
            workspaceId: currentWorkspace.id,
            instagramBusinessId: pageSelectChannelType === 'instagram' ? page.instagram_business_account?.id : null,
            instagramUsername: pageSelectChannelType === 'instagram' ? page.instagram_business_account?.username : null
          };
          const result = await facebookAPI.connectPage(connectData);
          if (result.data?.instagramWarning === 'CONVERSATION_ROUTING_ACTIVE') {
            hasConversationRoutingWarning = true;
          }
        }
      }

      setShowPageSelectModal(false);
      setSelectedPages([]);
      setAvailablePages([]);
      loadWizardChannels();

      if (hasConversationRoutingWarning) {
        alert('⚠️ Sayfalar bağlandı ancak Instagram hesabında "Conversation Routing" (İleti Yönlendirme) aktif görünüyor.\n\nBot\'un mesaj gönderebilmesi için Instagram hesap sahibinin şu adımları izlemesi gerekiyor:\n\n1. Meta Business Suite → Gelen Kutusu → Ayarlar\n2. Instagram bölümünde uygulamamıza mesaj erişimi verin\n3. Uygulamamızı birincil alıcı olarak seçin\n\nBu ayar yapılana kadar mesajlar alınır ancak bot otomatik cevap veremez.');
      } else {
        showSuccess('Sayfalar başarıyla bağlandı!');
      }
    } catch (error) {
      console.error('Error connecting pages:', error);
      showError('Sayfa bağlantı hatası: ' + (error.response?.data?.error || error.message));
    } finally {
      setConnectingPages(false);
    }
  };

  const handleDisconnectPage = async (pageId, channelType = null) => {
    const page = facebookPages.find(p => p.id === pageId);
    const hasInstagram = page?.instagramBusinessId;

    let message;
    if (channelType === 'instagram') {
      message = 'Instagram bağlantısını kesmek istediğinize emin misiniz?';
    } else if (channelType === 'facebook' && hasInstagram) {
      message = 'Facebook sayfa bağlantısını kesmek istediğinize emin misiniz?\n\n⚠️ Bu sayfaya bağlı Instagram hesabı da ayrılacaktır!';
    } else {
      message = 'Bu sayfa bağlantısını kesmek istediğinize emin misiniz?';
    }

    if (!window.confirm(message)) return;
    try {
      await facebookAPI.disconnectPage(pageId, channelType);
      loadWizardChannels();
      showSuccess('Bağlantı kesildi.');
    } catch (error) {
      console.error('Error disconnecting page:', error);
      showError('Bağlantı kesilemedi.');
    }
  };

  const handleDeleteWhatsapp = async (phoneNumberId) => {
    if (!window.confirm('Bu WhatsApp numarasını kaldırmak istediğinize emin misiniz?')) return;
    try {
      await whatsappAPI.disconnect(phoneNumberId);
      loadWizardChannels();
      showSuccess('WhatsApp numarası kaldırıldı.');
    } catch (error) {
      console.error('Error deleting whatsapp:', error);
      showError('WhatsApp numarası silinemedi.');
    }
  };

  const handleDeleteWebWidget = async (widgetId) => {
    if (!window.confirm('Bu Web Widget\'ı silmek istediğinize emin misiniz?')) return;
    try {
      await webWidgetAPI.delete(widgetId);
      loadWizardChannels();
      showSuccess('Web widget silindi.');
    } catch (error) {
      console.error('Error deleting web widget:', error);
      showError('Web widget silinemedi.');
    }
  };

  const handleDeleteEmail = async (id) => {
    if (!window.confirm('Bu e-posta hesabını kaldırmak istediğinize emin misiniz?')) return;
    try {
      await emailAPI.delete(id);
      loadWizardChannels();
      showSuccess('E-posta hesabı kaldırıldı.');
    } catch (error) {
      console.error('Error deleting email channel:', error);
      showError('E-posta hesabı silinemedi.');
    }
  };

  const handleGmailConnect = async () => {
    try {
      const response = await emailAPI.getConnectUrl(currentWorkspace.id);
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Error connecting Gmail:', error);
      showError('Gmail bağlantısı başlatılamadı.');
    }
  };

  const handleImapConnect = async () => {
    if (!imapForm.email || !imapForm.password) {
      showError('E-posta ve şifre gereklidir.');
      return;
    }

    setConnectingEmail(true);
    try {
      await emailAPI.connectImap(currentWorkspace.id, {
        preset: imapForm.preset,
        email: imapForm.email,
        password: imapForm.password,
        imapHost: imapForm.preset === 'custom' ? imapForm.imapHost : undefined,
        imapPort: imapForm.preset === 'custom' ? imapForm.imapPort : undefined,
        smtpHost: imapForm.preset === 'custom' ? imapForm.smtpHost : undefined,
        smtpPort: imapForm.preset === 'custom' ? imapForm.smtpPort : undefined
      });

      setShowEmailModal(false);
      loadWizardChannels();
      showSuccess('E-posta hesabı başarıyla bağlandı!');
    } catch (error) {
      console.error('Error connecting IMAP:', error);
      showError(error.response?.data?.error || 'Bağlantı başarısız. E-posta veya şifre hatalı olabilir.');
    } finally {
      setConnectingEmail(false);
    }
  };

  const handleImapPresetChange = (preset) => {
    const presets = {
      yandex: { imapHost: 'imap.yandex.com', smtpHost: 'smtp.yandex.com', imapPort: 993, smtpPort: 465 },
      outlook: { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com', imapPort: 993, smtpPort: 587 },
      custom: { imapHost: '', smtpHost: '', imapPort: 993, smtpPort: 465 }
    };
    setImapForm(prev => ({ ...prev, preset, ...(presets[preset] || {}) }));
  };

  const copyWidgetSnippet = (widgetId, code) => {
    navigator.clipboard.writeText(code);
    setCopiedWidgetId(widgetId);
    setTimeout(() => setCopiedWidgetId(null), 2000);
  };

  // Derlenmiş Birleşik Bilgi Bankası Verisini Getir
  const fetchCompiledKb = () => {
    if (!currentWorkspace?.id) return;
    setCompiledKbLoading(true);
    if (typeof knowledgeBaseAPI?.getCompiled === 'function') {
      knowledgeBaseAPI.getCompiled(currentWorkspace.id)
        .then(res => {
          setCompiledKb(res.data);
        })
        .catch(err => {
          console.warn('Derlenmiş bilgi bankası yüklenirken hata (yerel durum kullanılacak):', err);
        })
        .finally(() => {
          setCompiledKbLoading(false);
        });
    } else {
      setCompiledKbLoading(false);
    }
  };

  // Tüm adımlardaki bilgileri birleştirerek veritabanına gerçek bir Bilgi Bankası belgesi olarak kaydet
  const saveUnifiedKnowledgeBase = async (customText = null, notify = false) => {
    if (!currentWorkspace?.id) return;
    setSavingCompiledKb(true);
    try {
      const textToSave = (customText || compiledKb?.text || getClientCompiledKbText() || '').trim();
      const res = await knowledgeBaseAPI.saveCompiled(currentWorkspace.id, {
        customText: textToSave,
        title: '🏢 Kurumsal Bilgi Tabanı & AI Hafızası (Tüm Adımlar)'
      });
      setCompiledKbSaved(true);
      if (res.data?.entry) {
        setKbEntries(prev => {
          const list = Array.isArray(prev) ? prev : [];
          const exists = list.some(item => item.id === res.data.entry.id);
          if (exists) {
            return list.map(item => item.id === res.data.entry.id ? res.data.entry : item);
          }
          return [res.data.entry, ...list];
        });
      }
      if (notify) {
        showSuccess('Tüm adımlardaki bilgiler birleştirilerek Bilgi Bankası belgesi olarak kaydedildi!');
      }
    } catch (err) {
      console.error('saveUnifiedKnowledgeBase error:', err);
      if (notify) {
        showError('Birleşik Bilgi Bankası kaydedilirken bir hata oluştu.');
      }
    } finally {
      setSavingCompiledKb(false);
    }
  };

  // Son adım olan 'ozet' adımına geçildiğinde birleşik bilgi bankasını getir ve otomatik olarak veritabanına kaydet
  useEffect(() => {
    if (STEPS[activeStep]?.key === 'ozet' && currentWorkspace?.id) {
      fetchCompiledKb();
      saveUnifiedKnowledgeBase(null, false);
    }
  }, [activeStep, currentWorkspace?.id]);

  // Tüm adımlardaki yerel verilerden anında oluşturulan birleşik AI sistem metni
  const getClientCompiledKbText = () => {
    const sections = [];

    // 1. Şirket Bilgileri & 7 Günlük Çalışma Saatleri
    const compLines = [];
    if (companyName) compLines.push(`Firma Adı: ${companyName}`);
    if (companyIndustry) {
      const secObj = SECTOR_OPTIONS.find(s => s.value === companyIndustry);
      compLines.push(`Sektör / Alan: ${secObj ? secObj.label : companyIndustry}`);
    }
    if (founder) compLines.push(`Kurucu / Firma Sahibi: ${founder}`);
    if (companyDescription) compLines.push(`Hakkında / Şirket Açıklaması: ${companyDescription}`);
    if (companyPhone) compLines.push(`İletişim Telefon: ${companyPhone}`);
    if (companyEmail) compLines.push(`E-posta: ${companyEmail}`);
    if (companyWebsite) compLines.push(`Web Sitesi: ${companyWebsite}`);
    if (companyAddress) compLines.push(`Merkez Adres: ${companyAddress}`);
    if (googleMapsUrl) compLines.push(`Google Maps Konum: ${googleMapsUrl}`);
    if (Array.isArray(businessAreas) && businessAreas.length > 0) {
      compLines.push(`Faaliyet / Uzmanlık Alanları: ${businessAreas.join(', ')}`);
    }
    if (Array.isArray(serviceRegions) && serviceRegions.length > 0) {
      compLines.push(`Hizmet ve Satış Bölgeleri: ${serviceRegions.join(', ')}`);
    }
    if (companyHours) {
      compLines.push(`Çalışma Saatleri (7 Gün): ${companyHours}`);
    } else if (Array.isArray(weeklySchedule) && weeklySchedule.length > 0) {
      const scheduleStr = weeklySchedule.map(d => `${d.label || d.day}: ${(d.enabled ?? d.isOpen) ? `${d.start} - ${d.end}` : 'Kapalı'}`).join(' | ');
      compLines.push(`Çalışma Saatleri (7 Gün): ${scheduleStr}`);
    }
    if (compLines.length > 0) {
      sections.push(`🏢 ŞİRKET BİLGİLERİ VE ÇALIŞMA SAATLERİ:\n${compLines.join('\n')}`);
    }

    // 2. Bilgi Bankası Belgeleri & Metin Kaynakları
    if (Array.isArray(kbEntries) && kbEntries.length > 0) {
      const kbLines = kbEntries.map((e, idx) => {
        const title = e.title || `Belge #${idx + 1}`;
        const preview = e.content ? (e.content.length > 250 ? e.content.slice(0, 250).trim() + '...' : e.content.trim()) : '(İçerik işlendi)';
        return `[${idx + 1}] ${title} (${e.sourceType || 'Belge'})\n${preview}`;
      });
      sections.push(`📚 BİLGİ BANKASI VE METİN KAYNAKLARI (${kbEntries.length} Kaynak):\n${kbLines.join('\n\n')}`);
    }

    // 3. Şubeler & Lokasyonlar
    if (Array.isArray(branches) && branches.length > 0) {
      const bLines = branches.map((b, idx) => {
        const parts = [`${idx + 1}. ${b.name}`];
        if (b.address) parts.push(`Adres: ${b.address}`);
        if (b.phone) parts.push(`Tel: ${b.phone}`);
        return parts.join(' | ');
      });
      sections.push(`📍 HİZMET ŞUBELERİ & LOKASYONLAR (${branches.length} Şube):\n${bLines.join('\n')}`);
    }

    // 4. Hizmet & Konu Kategorileri
    if (Array.isArray(categories) && categories.length > 0) {
      const cLines = categories.map((c, idx) => {
        return `${idx + 1}. ${c.name}${c.description ? ` (${c.description})` : ''}`;
      });
      sections.push(`🏷️ HİZMET / KONU KATEGORİLERİ (${categories.length} Kategori):\n${cLines.join('\n')}`);
    }

    // 5. Ürün & Portföy Listesi
    if (Array.isArray(products) && products.length > 0) {
      const pLines = products.map((p, idx) => {
        const priceStr = (p.price != null && p.price !== '') ? ` - ${!isNaN(Number(p.price)) ? Number(p.price).toLocaleString('tr-TR') : p.price} ${p.currency || 'TRY'}` : '';
        const catName = typeof p.category === 'object' ? p.category?.name : (typeof p.category === 'string' ? p.category : (categories.find(c => c.id === p.categoryId)?.name || ''));
        const catStr = catName ? ` [${catName}]` : '';
        const descStr = (p.description && typeof p.description === 'string') ? `\n   Açıklama: ${p.description}` : '';
        return `${idx + 1}. ${p.name || 'Ürün'}${priceStr}${catStr}${descStr}`;
      });
      sections.push(`📦 ÜRÜN VE HİZMET PORTFÖYÜ (${products.length} Kalem):\n${pLines.join('\n')}`);
    }

    // 5.5. Kaynaklar (Doktorlar, Uzmanlar, Odalar & Alanlar)
    if (Array.isArray(resources) && resources.length > 0) {
      const rLines = resources.map((r, idx) => {
        const titleStr = r.title ? ` [${r.title}]` : '';
        const descStr = r.description ? ` (${r.description})` : '';
        const typeStr = r.type ? ` [Tip: ${r.type}]` : '';
        const workStr = (r.availableStart && r.availableEnd) ? ` | Mesai: ${r.availableStart} - ${r.availableEnd} (${r.slotMinutes || 30} dk)` : '';
        return `${idx + 1}. ${r.name}${titleStr}${typeStr}${descStr}${workStr}`;
      });
      sections.push(`🩺 KAYNAKLAR, UZMANLAR VE HİZMET ALANLARI (${resources.length} Kaynak):\n${rLines.join('\n')}`);
    }

    // 6. Akışlar & Aşamalar
    if (Array.isArray(funnels) && funnels.length > 0) {
      const fLines = funnels.map((f, idx) => {
        const stageList = (f.stages || []).map((s, si) => `   ${si + 1}) ${typeof s === 'object' ? (s.title || s.name || 'Aşama') : String(s)}`).join('\n');
        return `Akış #${idx + 1}: ${f.name || 'Ana Akış'}${f.description ? ` (${f.description})` : ''}\nAşamalar:\n${stageList || '   (Standart aşamalar)'}`;
      });
      sections.push(`🔄 MÜŞTERİ YOLCULUĞU & SATIŞ AKIŞLARI (${funnels.length} Akış):\n${fLines.join('\n\n')}`);
    }

    // 7. Takımlar & Ekipler
    if (Array.isArray(teams) && teams.length > 0) {
      const tLines = teams.map((t, idx) => {
        const memberCount = Array.isArray(t.members) ? t.members.length : 0;
        const leaderMember = Array.isArray(t.members) ? t.members.find(m => m?.isLeader) : null;
        const leaderName = leaderMember?.user?.name || leaderMember?.user?.email || (typeof t.leader === 'object' ? (t.leader?.name || t.leader?.email) : (typeof t.leader === 'string' ? t.leader : ''));
        const leaderStr = leaderName ? ` (Lider: ${leaderName})` : '';
        return `${idx + 1}. ${t.name || 'Takım'}${leaderStr} - ${memberCount} Temsilci`;
      });
      sections.push(`👥 DEPARTMANLAR VE UZMAN TAKIMLAR (${teams.length} Takım):\n${tLines.join('\n')}`);
    }

    // 8. AI Asistanlar
    if (Array.isArray(bots) && bots.length > 0) {
      const bLines = bots.map((b, idx) => {
        const caps = b.capabilities ? Object.keys(b.capabilities).filter(k => b.capabilities[k]).join(', ') : 'Temel Soru-Cevap';
        return `Asistan: ${b.name} (${b.role || 'Müşteri Temsilcisi'})\nTalimat: ${b.prompt || 'Kurumsal dilde yardımcı ol'}\nYetenekler: ${caps}`;
      });
      sections.push(`🤖 YETKİLİ AI ASİSTANLAR (${bots.length} Asistan):\n${bLines.join('\n\n')}`);
    }

    return sections.join('\n\n' + '—'.repeat(50) + '\n\n');
  };

  const handleCopyKbText = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKb(true);
      showSuccess('Bilgi Bankası metni panoya kopyalandı.');
      setTimeout(() => setCopiedKb(false), 2500);
    }).catch(err => {
      console.error('Copy failed:', err);
    });
  };

  const progress = Math.round((activeStep / (STEPS.length - 1)) * 100);

  const handleNext = async () => {
    if (activeStep === 0) {
      const ok = await handleSaveCompanyData(true);
      if (!ok && !companyName.trim()) {
        showError('Lütfen firma adını girin.');
        return;
      }
    }
    if (activeStep < STEPS.length - 1) setActiveStep(activeStep + 1);
  };

  const handlePrev = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  const handleComplete = async () => {
    try {
      await handleSaveCompanyData(true);
      // Tüm adımları veritabanına birleşik Bilgi Bankası olarak kaydet
      await saveUnifiedKnowledgeBase(null, false);
      // Standart hazır mesajları (Arama Başarılı, Arama Başarısız, Konum) firma verileriyle güncelle/oluştur
      if (currentWorkspace?.id) {
        try {
          await quickReplyAPI.seedDefaults(currentWorkspace.id, true);
        } catch (qrErr) {
          console.warn('Standard quick replies auto-seed warning:', qrErr);
        }
      }
      showSuccess('Tüm adımlar başarıyla birleştirildi ve Bilgi Bankası ile standart şablonlar kaydedildi!');
    } catch (e) {
      console.warn('Workspace or KB update warning:', e);
    }
    navigate('/base');
  };

  // ─── KB ACTIONS ──────────────────────────────────────────────────────────
  const handleScrapeUrl = async () => {
    let url = kbUrl.trim();
    if (!url) {
      showError('Lütfen taranacak web sitesi adresini girin.');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    setKbScraping(true);
    setKbScrapeResult(null);

    try {
      const res = await knowledgeBaseAPI.addUrl(currentWorkspace.id, { url });
      const entry = res.data?.entry;
      if (entry) {
        setKbEntries(prev => [entry, ...prev]);
      }
      setKbScrapeResult({
        success: true,
        title: entry?.title || url,
        snippet: entry?.content ? (entry.content.substring(0, 180) + '...') : 'İçerik başarıyla çıkarıldı.',
        message: 'Web sayfası başarıyla tarandı ve Bilgi Bankası\'na eklendi!'
      });
      showSuccess('Web sitesi başarıyla tarandı ve Bilgi Bankası\'na eklendi!');
      setKbUrl('');
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Web sitesi taranamadı.';
      setKbScrapeResult({
        success: false,
        message: errMsg
      });
      showError(errMsg);
    } finally {
      setKbScraping(false);
    }
  };

  const handleSaveManualKb = async () => {
    if (!manualKbText.trim()) {
      showError('Lütfen kaydedilecek metin içeriği girin.');
      return;
    }

    setManualKbSaving(true);
    try {
      const title = manualKbTitle.trim() || `${companyName || currentWorkspace?.name || 'Firma'} Bilgisi`;
      const res = await knowledgeBaseAPI.addText(currentWorkspace.id, {
        title,
        content: manualKbText.trim()
      });
      const entry = res.data?.entry;
      if (entry) {
        setKbEntries(prev => [entry, ...prev]);
      }
      showSuccess('Bilgi bankasına başarıyla eklendi!');
      setManualKbTitle('');
      setManualKbText('');
    } catch (err) {
      showError(err.response?.data?.error || 'Kayıt sırasında bir hata oluştu.');
    } finally {
      setManualKbSaving(false);
    }
  };

  const handleDeleteKbEntry = async (id) => {
    if (!window.confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    try {
      await knowledgeBaseAPI.delete(currentWorkspace.id, id);
      setKbEntries(prev => prev.filter(e => e.id !== id));
      showSuccess('Kayıt silindi.');
    } catch (err) {
      showError('Silinirken hata oluştu.');
    }
  };

  // ─── BRANCH ACTIONS ──────────────────────────────────────────────────────
  const handleCreateBranch = async () => {
    if (!newBranch.name.trim()) {
      showError('Şube adı gereklidir.');
      return;
    }
    setSavingBranch(true);
    try {
      const res = await appointmentConfigAPI.createLocation(currentWorkspace.id, newBranch);
      const loc = unwrapEntity(res, 'location');
      if (loc) setBranches(prev => [...prev, loc]);
      showSuccess('Şube başarıyla oluşturuldu!');
      setNewBranch({ name: '', address: '', phone: '' });
      setShowAddBranch(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Şube eklenirken hata oluştu.');
    } finally {
      setSavingBranch(false);
    }
  };

  // ─── CATEGORY ACTIONS ────────────────────────────────────────────────────
  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      showError('Kategori adı gereklidir.');
      return;
    }
    setSavingCategory(true);
    try {
      const res = await createTopicCategory(currentWorkspace.id, newCategory);
      const cat = unwrapEntity(res, 'category');
      if (cat) setCategories(prev => [...prev, cat]);
      showSuccess('Kategori başarıyla oluşturuldu!');
      setNewCategory({ name: '', description: '', color: '#3b82f6' });
      setShowAddCategory(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Kategori eklenirken hata oluştu.');
    } finally {
      setSavingCategory(false);
    }
  };

  // ─── PRODUCT ACTIONS ─────────────────────────────────────────────────────
  const handleCreateProduct = async () => {
    if (!newProduct.name.trim()) {
      showError('Ürün adı gereklidir.');
      return;
    }
    setSavingProduct(true);
    try {
      const res = await productAPI.create(currentWorkspace.id, {
        name: newProduct.name.trim(),
        price: parseFloat(newProduct.price) || 0,
        categoryId: newProduct.categoryId || null
      });
      const prod = unwrapEntity(res, 'product');
      if (prod) setProducts(prev => [...prev, prod]);
      showSuccess('Ürün başarıyla eklendi!');
      setNewProduct({ name: '', price: '', categoryId: '' });
      setShowAddProduct(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Ürün eklenirken hata oluştu.');
    } finally {
      setSavingProduct(false);
    }
  };

  // ─── BRANCH ACTIONS (EDIT / DELETE) ──────────────────────────────────────
  const handleStartEditBranch = (branch) => {
    setEditingBranchId(branch.id);
    setEditBranchData({ name: branch.name || '', address: branch.address || '', phone: branch.phone || '' });
  };

  const handleUpdateBranch = async () => {
    if (!editBranchData.name.trim()) {
      showError('Şube adı gereklidir.');
      return;
    }
    setSavingEditBranch(true);
    try {
      const res = await appointmentConfigAPI.updateLocation(currentWorkspace.id, editingBranchId, editBranchData);
      const updated = unwrapEntity(res, 'location');
      setBranches(prev => prev.map(b => b.id === editingBranchId ? (updated?.id ? updated : { ...b, ...editBranchData }) : b));
      showSuccess('Şube bilgileri güncellendi.');
      setEditingBranchId(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Şube güncellenirken hata oluştu.');
    } finally {
      setSavingEditBranch(false);
    }
  };

  const handleDeleteBranch = async (branchId) => {
    if (!window.confirm('Bu şubeyi silmek istediğinize emin misiniz?')) return;
    try {
      await appointmentConfigAPI.deleteLocation(currentWorkspace.id, branchId);
      setBranches(prev => prev.filter(b => b.id !== branchId));
      showSuccess('Şube silindi.');
    } catch (err) {
      showError(err.response?.data?.error || 'Şube silinirken hata oluştu.');
    }
  };

  // ─── CATEGORY ACTIONS (EDIT / DELETE) ───────────────────────────────────
  const handleStartEditCategory = (cat) => {
    setEditingCategoryId(cat.id);
    setEditCategoryData({ name: cat.name || '', description: cat.description || '', color: cat.color || '#3b82f6' });
  };

  const handleUpdateCategory = async () => {
    if (!editCategoryData.name.trim()) {
      showError('Kategori adı gereklidir.');
      return;
    }
    setSavingEditCategory(true);
    try {
      const res = await updateTopicCategory(currentWorkspace.id, editingCategoryId, editCategoryData);
      const updated = unwrapEntity(res, 'category');
      setCategories(prev => prev.map(c => c.id === editingCategoryId ? (updated?.id ? updated : { ...c, ...editCategoryData }) : c));
      showSuccess('Kategori güncellendi.');
      setEditingCategoryId(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Kategori güncellenirken hata oluştu.');
    } finally {
      setSavingEditCategory(false);
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) return;
    try {
      await deleteTopicCategory(currentWorkspace.id, catId);
      setCategories(prev => prev.filter(c => c.id !== catId));
      showSuccess('Kategori silindi.');
    } catch (err) {
      showError(err.response?.data?.error || 'Kategori silinirken hata oluştu.');
    }
  };

  // ─── PRODUCT ACTIONS (EDIT / DELETE) ─────────────────────────────────────
  const handleStartEditProduct = (prod) => {
    setEditingProductId(prod.id);
    setEditProductData({
      name: prod.name || '',
      price: prod.price !== undefined && prod.price !== null ? prod.price : '',
      categoryId: prod.categoryId || ''
    });
  };

  const handleUpdateProduct = async () => {
    if (!editProductData.name.trim()) {
      showError('Ürün adı gereklidir.');
      return;
    }
    setSavingEditProduct(true);
    try {
      const res = await productAPI.update(currentWorkspace.id, editingProductId, {
        name: editProductData.name.trim(),
        price: parseFloat(editProductData.price) || 0,
        categoryId: editProductData.categoryId || null
      });
      const updated = unwrapEntity(res, 'product');
      setProducts(prev => prev.map(p => p.id === editingProductId ? (updated?.id ? updated : { ...p, ...editProductData, price: parseFloat(editProductData.price) || 0 }) : p));
      showSuccess('Ürün güncellendi.');
      setEditingProductId(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Ürün güncellenirken hata oluştu.');
    } finally {
      setSavingEditProduct(false);
    }
  };

  const handleDeleteProduct = async (prodId) => {
    if (!window.confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;
    try {
      await productAPI.delete(currentWorkspace.id, prodId);
      setProducts(prev => prev.filter(p => p.id !== prodId));
      showSuccess('Ürün silindi.');
    } catch (err) {
      showError(err.response?.data?.error || 'Ürün silinirken hata oluştu.');
    }
  };

  // ─── RESOURCE ACTIONS (CREATE / EDIT / DELETE) ───────────────────────────
  const handleCreateResource = async () => {
    if (!newResource.name.trim()) {
      showError('Kaynak adı / Ad Soyad gereklidir.');
      return;
    }
    setSavingResource(true);
    try {
      const res = await resourceAPI.create(currentWorkspace.id, {
        ...newResource,
        name: newResource.name.trim(),
        slotMinutes: parseInt(newResource.slotMinutes, 10) || 30
      });
      const created = unwrapEntity(res, 'resource');
      if (created?.id) {
        setResources(prev => [...prev, created]);
      } else {
        const allRes = await resourceAPI.getAll(currentWorkspace.id);
        const list = allRes.data?.resources || allRes.data;
        if (Array.isArray(list)) setResources(list);
      }
      showSuccess('Kaynak başarıyla eklendi!');
      setNewResource({
        name: '',
        title: '',
        description: '',
        type: 'PERSON',
        availableStart: '09:00',
        availableEnd: '18:00',
        slotMinutes: 30,
        branchIds: [],
        syncProvider: 'WORKSPACE_DEFAULT'
      });
      setShowAddResource(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Kaynak eklenirken hata oluştu.');
    } finally {
      setSavingResource(false);
    }
  };

  const handleStartEditResource = (resource) => {
    setEditingResourceId(resource.id);
    const branchIds = (resource.resourceBranches && resource.resourceBranches.length > 0)
      ? resource.resourceBranches.map(rb => rb.branchId)
      : (resource.branchIds || (resource.branchId ? [resource.branchId] : []));

    setEditResourceData({
      name: resource.name || '',
      title: resource.title || '',
      description: resource.description || '',
      type: resource.type || 'PERSON',
      availableStart: resource.availableStart || '09:00',
      availableEnd: resource.availableEnd || '18:00',
      slotMinutes: resource.slotMinutes || 30,
      branchIds: branchIds,
      syncProvider: resource.syncProvider || 'WORKSPACE_DEFAULT'
    });
  };

  const handleUpdateResource = async () => {
    if (!editResourceData.name.trim()) {
      showError('Kaynak adı / Ad Soyad gereklidir.');
      return;
    }
    setSavingEditResource(true);
    try {
      const res = await resourceAPI.update(currentWorkspace.id, editingResourceId, {
        ...editResourceData,
        name: editResourceData.name.trim(),
        slotMinutes: parseInt(editResourceData.slotMinutes, 10) || 30
      });
      const updated = unwrapEntity(res, 'resource');
      const allRes = await resourceAPI.getAll(currentWorkspace.id);
      const list = allRes.data?.resources || allRes.data;
      if (Array.isArray(list)) {
        setResources(list);
      } else {
        setResources(prev => prev.map(r => r.id === editingResourceId ? (updated?.id ? updated : { ...r, ...editResourceData }) : r));
      }
      showSuccess('Kaynak güncellendi.');
      setEditingResourceId(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Kaynak güncellenirken hata oluştu.');
    } finally {
      setSavingEditResource(false);
    }
  };

  const handleDeleteResource = async (resourceId, name) => {
    if (!window.confirm(`"${name || 'Bu kaynağı'}" silmek istediğinize emin misiniz?`)) return;
    try {
      await resourceAPI.delete(currentWorkspace.id, resourceId);
      setResources(prev => prev.filter(r => r.id !== resourceId));
      showSuccess('Kaynak silindi.');
    } catch (err) {
      showError(err.response?.data?.error || 'Kaynak silinirken hata oluştu.');
    }
  };

  // ─── FUNNEL ACTIONS (CREATE / EDIT / DELETE / STAGES) ────────────────────
  const handleCreateFunnel = async () => {
    if (!newFunnel.name.trim()) {
      showError('Akış adı gereklidir.');
      return;
    }
    const cleanStages = (newFunnel.stages || [])
      .map(s => typeof s === 'string' ? s.trim() : (s.name || '').trim())
      .filter(Boolean);

    setSavingFunnel(true);
    try {
      const payload = {
        name: newFunnel.name.trim(),
        color: newFunnel.color || '#3b82f6',
        stages: cleanStages.length > 0 ? cleanStages : ['Yeni Başvuru', 'İşlemde', 'Tamamlandı']
      };
      const res = await funnelAPI.create(currentWorkspace.id, payload);
      const created = unwrapEntity(res, 'funnel');
      if (created) setFunnels(prev => [...prev, created]);
      showSuccess('Yeni akış ve aşamaları başarıyla oluşturuldu!');
      setNewFunnel({
        name: '',
        color: '#3b82f6',
        stages: ['Yeni Başvuru', 'İşlemde', 'Tamamlandı', 'İptal']
      });
      setShowAddFunnel(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Akış eklenirken hata oluştu.');
    } finally {
      setSavingFunnel(false);
    }
  };

  const handleStartEditFunnel = (f) => {
    setEditingFunnelId(f.id);
    const existingStages = Array.isArray(f.stages)
      ? f.stages.map((s, idx) => ({
          id: s.id,
          name: s.name || '',
          color: s.color || '#3b82f6',
          order: s.order !== undefined ? s.order : idx,
          isNew: false
        }))
      : [];
    setEditFunnelData({
      name: f.name || '',
      color: f.color || '#3b82f6',
      stages: existingStages,
      deletedStageIds: []
    });
  };

  const handleAddStageToEditFunnel = () => {
    setEditFunnelData(prev => ({
      ...prev,
      stages: [
        ...prev.stages,
        {
          id: 'temp_' + Date.now(),
          name: '',
          color: '#3b82f6',
          order: prev.stages.length,
          isNew: true
        }
      ]
    }));
  };

  const handleRemoveStageFromEditFunnel = (index) => {
    setEditFunnelData(prev => {
      const stageToRemove = prev.stages[index];
      const nextStages = prev.stages.filter((_, i) => i !== index);
      const nextDeleted = (!stageToRemove.isNew && stageToRemove.id)
        ? [...(prev.deletedStageIds || []), stageToRemove.id]
        : (prev.deletedStageIds || []);
      return {
        ...prev,
        stages: nextStages,
        deletedStageIds: nextDeleted
      };
    });
  };

  const handleMoveStage = (index, direction) => {
    setEditFunnelData(prev => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.stages.length) return prev;
      const copy = [...prev.stages];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return { ...prev, stages: copy };
    });
  };

  const handleStageChangeInEditFunnel = (index, field, value) => {
    setEditFunnelData(prev => {
      const copy = [...prev.stages];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, stages: copy };
    });
  };

  const handleAddStageToNewFunnel = () => {
    if (!newStageInput.trim()) return;
    setNewFunnel(prev => ({
      ...prev,
      stages: [...prev.stages, newStageInput.trim()]
    }));
    setNewStageInput('');
  };

  const handleRemoveStageFromNewFunnel = (index) => {
    setNewFunnel(prev => ({
      ...prev,
      stages: prev.stages.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateFunnel = async () => {
    if (!editFunnelData.name.trim()) {
      showError('Akış adı gereklidir.');
      return;
    }

    const validStages = (editFunnelData.stages || []).filter(s => s.name && s.name.trim().length > 0);
    if (validStages.length === 0) {
      showError('Akış için en az bir aşama adı girilmelidir.');
      return;
    }

    setSavingEditFunnel(true);
    try {
      const wsId = currentWorkspace.id;

      // Send atomic update with stages
      const payload = {
        name: editFunnelData.name.trim(),
        color: editFunnelData.color || '#3b82f6',
        stages: validStages.map((st, idx) => ({
          id: (st.id && !String(st.id).startsWith('temp_')) ? st.id : undefined,
          name: st.name.trim(),
          color: st.color || '#3b82f6',
          order: idx
        }))
      };

      const res = await funnelAPI.update(wsId, editingFunnelId, payload);
      const updated = unwrapEntity(res, 'funnel');

      if (updated && updated.id) {
        setFunnels(prev => prev.map(f => f.id === editingFunnelId ? updated : f));
      } else {
        setFunnels(prev => prev.map(f => {
          if (f.id === editingFunnelId) {
            return {
              ...f,
              name: editFunnelData.name.trim(),
              color: editFunnelData.color || '#3b82f6',
              stages: validStages.map((st, idx) => ({ ...st, order: idx }))
            };
          }
          return f;
        }));
      }

      // Re-fetch to ensure complete sync with database
      funnelAPI.getAll(wsId)
        .then(resAll => {
          const raw = resAll.data?.funnels || resAll.data;
          if (Array.isArray(raw)) setFunnels(raw);
        })
        .catch(() => {});

      showSuccess('Akış ve aşamaları başarıyla güncellendi.');
      setEditingFunnelId(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Akış güncellenirken hata oluştu.');
    } finally {
      setSavingEditFunnel(false);
    }
  };

  const handleDeleteFunnel = async (funnelId) => {
    if (!window.confirm('Bu akışı silmek istediğinize emin misiniz?')) return;
    try {
      await funnelAPI.delete(currentWorkspace.id, funnelId);
      setFunnels(prev => prev.filter(f => f.id !== funnelId));
      showSuccess('Akış silindi.');
    } catch (err) {
      showError(err.response?.data?.error || 'Akış silinirken hata oluştu.');
    }
  };

  // ─── TEAM ACTIONS (CREATE / EDIT / DELETE / MEMBER) ─────────────────────
  const handleCreateTeam = async () => {
    if (!newTeam.name.trim()) {
      showError('Takım adı gereklidir.');
      return;
    }
    setSavingTeam(true);
    try {
      const res = await teamAPI.create(currentWorkspace.id, newTeam);
      const created = unwrapEntity(res, 'team');
      if (created) setTeams(prev => [...prev, created]);
      showSuccess('Yeni takım başarıyla oluşturuldu!');
      setNewTeam({ name: '', description: '', color: '#3b82f6' });
      setShowAddTeam(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Takım oluşturulurken hata oluştu.');
    } finally {
      setSavingTeam(false);
    }
  };

  const handleStartEditTeam = (team) => {
    setEditingTeamId(team.id);
    setEditTeamData({ name: team.name || '', description: team.description || '', color: team.color || '#3b82f6' });
  };

  const handleUpdateTeam = async () => {
    if (!editTeamData.name.trim()) {
      showError('Takım adı gereklidir.');
      return;
    }
    setSavingEditTeam(true);
    try {
      const res = await teamAPI.update(currentWorkspace.id, editingTeamId, editTeamData);
      const updated = unwrapEntity(res, 'team');
      setTeams(prev => prev.map(t => t.id === editingTeamId ? (updated?.id ? updated : { ...t, ...editTeamData }) : t));
      showSuccess('Takım güncellendi.');
      setEditingTeamId(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Takım güncellenirken hata oluştu.');
    } finally {
      setSavingEditTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm('Bu takımı silmek istediğinize emin misiniz?')) return;
    try {
      await teamAPI.delete(currentWorkspace.id, teamId);
      setTeams(prev => prev.filter(t => t.id !== teamId));
      showSuccess('Takım silindi.');
    } catch (err) {
      showError(err.response?.data?.error || 'Takım silinirken hata oluştu.');
    }
  };

  const handleAddMemberToTeam = async (teamId) => {
    if (!selectedMemberUserId) {
      showError('Lütfen takıma eklenecek bir kullanıcı seçin.');
      return;
    }
    setAddingTeamMember(true);
    try {
      const res = await teamAPI.addMember(currentWorkspace.id, teamId, { userId: selectedMemberUserId });
      const newMember = res.data?.teamMember;
      
      const userObj = workspaceMembers.find(m => (m.user?.id || m.userId) === selectedMemberUserId)?.user;
      const memberWithUser = newMember?.user ? newMember : { ...(newMember || {}), user: userObj, userId: selectedMemberUserId };

      setTeams(prev => prev.map(t => {
        if (t.id === teamId) {
          const existingMembers = Array.isArray(t.members) ? t.members : [];
          return {
            ...t,
            members: [...existingMembers, memberWithUser]
          };
        }
        return t;
      }));
      showSuccess('Kullanıcı takıma eklendi!');
      setSelectedMemberUserId('');
      setActiveTeamMemberAddId(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Kullanıcı takıma eklenemedi.');
    } finally {
      setAddingTeamMember(false);
    }
  };

  const handleRemoveMemberFromTeam = async (teamId, memberUserId) => {
    if (!window.confirm('Bu kullanıcıyı takımdan çıkarmak istediğinize emin misiniz?')) return;
    try {
      await teamAPI.removeMember(currentWorkspace.id, teamId, memberUserId, 'user');
      setTeams(prev => prev.map(t => {
        if (t.id === teamId) {
          return {
            ...t,
            members: (t.members || []).filter(m => (m.user?.id || m.userId) !== memberUserId)
          };
        }
        return t;
      }));
      showSuccess('Kullanıcı takımdan çıkarıldı.');
    } catch (err) {
      showError(err.response?.data?.error || 'Kullanıcı takımdan çıkarılırken hata oluştu.');
    }
  };

  const handleCreateAndAddUserToTeam = async (teamId) => {
    if (!newUserData.name.trim() || !newUserData.email.trim()) {
      showError('Ad Soyad ve E-posta zorunludur.');
      return;
    }
    setCreatingUser(true);
    try {
      const memberRes = await workspaceAPI.addMember(currentWorkspace.id, {
        name: newUserData.name.trim(),
        email: newUserData.email.trim().toLowerCase(),
        password: newUserData.password || 'Password123!',
        role: 'AGENT'
      });
      const createdMember = memberRes.data?.member;
      const newUserId = createdMember?.userId || createdMember?.user?.id;

      if (newUserId) {
        setWorkspaceMembers(prev => [...prev, createdMember]);

        const teamMemberRes = await teamAPI.addMember(currentWorkspace.id, teamId, { userId: newUserId });
        const newTeamMember = teamMemberRes.data?.teamMember || {
          id: Date.now(),
          userId: newUserId,
          user: createdMember.user || { name: newUserData.name, email: newUserData.email }
        };

        setTeams(prev => prev.map(t => {
          if (t.id === teamId) {
            return {
              ...t,
              members: [...(t.members || []), newTeamMember]
            };
          }
          return t;
        }));

        showSuccess('Yeni kullanıcı oluşturuldu ve takıma eklendi!');
        setNewUserData({ name: '', email: '', password: 'Password123!' });
        setShowCreateNewUserModal(false);
        setActiveTeamMemberAddId(null);
      }
    } catch (err) {
      showError(err.response?.data?.error || 'Kullanıcı oluşturulurken hata oluştu.');
    } finally {
      setCreatingUser(false);
    }
  };

  // ─── AI BOT ACTIONS (CREATE / EDIT / DELETE / STATUS) ─────────────────────
  const handleStartEditBot = (bot) => {
    setEditingBotId(bot.id);
    const defaultCaps = {
      appointment: true,
      product: true,
      humanHandoff: true,
      knowledgeBase: true
    };
    const caps = bot.capabilities && typeof bot.capabilities === 'object' ? { ...defaultCaps, ...bot.capabilities } : defaultCaps;
    setEditBotData({
      name: bot.name || '',
      role: bot.role || 'Müşteri Temsilcisi (Chat & Ses)',
      prompt: bot.prompt || '',
      isActive: bot.isActive !== false,
      whatsappEnabled: bot.whatsappEnabled !== false,
      instagramEnabled: bot.instagramEnabled !== false,
      widgetEnabled: bot.widgetEnabled !== false,
      facebookEnabled: bot.facebookEnabled !== false,
      capabilities: caps
    });
  };

  const handleUpdateBot = async () => {
    if (!editBotData.name.trim()) {
      showError('Asistan adı gereklidir.');
      return;
    }
    setSavingEditBot(true);
    try {
      const res = await aiAPI.updateBot(currentWorkspace.id, editingBotId, editBotData);
      const updated = unwrapEntity(res, 'bot');
      setBots(prev => prev.map(b => b.id === editingBotId ? { ...b, ...editBotData, ...(updated?.id ? updated : {}) } : b));
      showSuccess('AI Asistan başarıyla güncellendi.');
      setEditingBotId(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Asistan güncellenirken hata oluştu.');
    } finally {
      setSavingEditBot(false);
    }
  };

  const handleDeleteBot = async (botId) => {
    if (!window.confirm('Bu AI asistanı silmek istediğinize emin misiniz?')) return;
    try {
      await aiAPI.deleteBot(currentWorkspace.id, botId);
      setBots(prev => prev.filter(b => b.id !== botId));
      showSuccess('AI Asistan silindi.');
    } catch (err) {
      showError(err.response?.data?.error || 'Asistan silinirken hata oluştu.');
    }
  };

  const handleToggleBotStatus = async (bot) => {
    const nextStatus = !bot.isActive;
    try {
      await aiAPI.toggleStatus(currentWorkspace.id, bot.id, nextStatus);
      setBots(prev => prev.map(b => b.id === bot.id ? { ...b, isActive: nextStatus } : b));
      showSuccess(nextStatus ? 'Asistan aktif edildi.' : 'Asistan durduruldu (pasif).');
    } catch (err) {
      showError(err.response?.data?.error || 'Durum değiştirilemedi.');
    }
  };

  const handleCreateBot = async () => {
    if (!newBot.name.trim()) {
      showError('Asistan adı gereklidir.');
      return;
    }
    setSavingBot(true);
    try {
      const payload = {
        ...newBot,
        capabilities: {
          appointment: true,
          product: true,
          humanHandoff: true,
          knowledgeBase: true
        }
      };
      const res = await aiAPI.createBot(currentWorkspace.id, payload);
      const created = unwrapEntity(res, 'bot');
      if (created) setBots(prev => [created, ...prev]);
      showSuccess('Yeni AI asistan başarıyla oluşturuldu!');
      setNewBot({
        name: '',
        role: 'Müşteri Temsilcisi (Chat & Ses)',
        prompt: '',
        isActive: true,
        whatsappEnabled: true,
        instagramEnabled: true,
        widgetEnabled: true,
        facebookEnabled: true
      });
      setShowAddBot(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Asistan oluşturulurken hata oluştu.');
    } finally {
      setSavingBot(false);
    }
  };

  const handleCreateDefaultBot = async () => {
    setSavingBot(true);
    try {
      const res = await aiAPI.createBot(currentWorkspace.id, {
        name: 'Insta',
        role: 'Müşteri Temsilcisi (Chat & Ses)',
        prompt: 'Sen Instomer yapay zeka müşteri temsilcisisin. Müşterilerin tüm sorularını nazik, kurumsal ve yardımsever bir dille yanıtla. Bilgi bankasındaki verileri kullanarak doğru bilgi sağla, gerektiğinde randevu oluştur veya insan temsilciye yönlendir.',
        isActive: true,
        whatsappEnabled: true,
        instagramEnabled: true,
        widgetEnabled: true,
        facebookEnabled: true,
        capabilities: {
          appointment: true,
          product: true,
          humanHandoff: true,
          knowledgeBase: true
        }
      });
      const created = unwrapEntity(res, 'bot');
      if (created) setBots(prev => [created, ...prev]);
      showSuccess('Varsayılan AI Asistan (Insta) başarıyla oluşturuldu!');
    } catch (err) {
      showError(err.response?.data?.error || 'Varsayılan asistan oluşturulamadı.');
    } finally {
      setSavingBot(false);
    }
  };

  // ─── RENDERERS ───────────────────────────────────────────────────────────

  const renderFirma = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '840px' }}>
      {/* Header with Save Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Firma Bilgileri</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>
            İşletmenizin genel kimlik, iletişim, faaliyet alanları ve 7 günlük çalışma saatlerini yapılandırın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleSaveCompanyData(false)}
          disabled={savingCompany}
          style={{
            ...primaryBtnStyle,
            opacity: savingCompany ? 0.7 : 1,
            cursor: savingCompany ? 'not-allowed' : 'pointer'
          }}
        >
          {savingCompany ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Kaydediliyor...
            </>
          ) : (
            <>
              <Check size={16} />
              Firma Bilgilerini Kaydet
            </>
          )}
        </button>
      </div>

      {/* 🪄 AI ile Tek Tıkla Kurulum Banner */}
      <div style={{
        padding: '16px 20px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, #fff7ed 0%, #fff1f2 100%)',
        border: '1.5px solid #fed7aa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 2px 8px rgba(249, 115, 22, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
            <Sparkles size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#9a3412' }}>
              Kurumsal Dokümanınız (PDF, Word, Excel, TXT) veya Web Siteniz Var mı?
            </div>
            <div style={{ fontSize: '12px', color: '#7c2d12', marginTop: '2px' }}>
              AI tüm firma bilgilerinizi, şubelerinizi, ürünlerinizi, doktor/kaynak listenizi ve çalışma saatlerinizi tek tıkla buraya doldursun.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAiSetupModalOpen(true)}
          style={{
            ...primaryBtnStyle,
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            border: 'none',
            color: '#fff',
            fontWeight: 600,
            fontSize: '13px',
            padding: '8px 16px',
            boxShadow: '0 2px 6px rgba(249, 115, 22, 0.3)'
          }}
        >
          <Sparkles size={15} /> AI ile Otomatik Doldur
        </button>
      </div>

      {/* Logo Section */}
      <div style={{
        padding: '18px 20px',
        border: '1.5px solid #e2e8f0',
        borderRadius: '10px',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap'
      }}>
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '10px',
          border: '1.5px dashed #cbd5e1',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0
        }}>
          {logoPreview ? (
            <img
              src={logoPreview.startsWith('data:')
                ? logoPreview
                : logoPreview.startsWith('http')
                  ? logoPreview
                  : `${import.meta.env.VITE_API_URL || ''}/uploads${logoPreview.replace('/uploads', '')}`
              }
              alt="Şirket Logosu"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', color: '#94a3b8' }}>
              <Building2 size={26} />
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Logo</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{
              ...actionBtnStyle,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '7px 14px',
              fontSize: '13px',
              cursor: logoUploading ? 'not-allowed' : 'pointer'
            }}>
              {logoUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {logoUploading ? 'Yükleniyor...' : 'Logo Yükle'}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.gif"
                onChange={handleLogoChange}
                disabled={logoUploading}
                style={{ display: 'none' }}
              />
            </label>
            {logoPreview && (
              <button
                type="button"
                onClick={handleDeleteLogo}
                disabled={logoUploading}
                style={deleteBtnStyle}
              >
                <Trash2 size={14} /> Kaldır
              </button>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
            Kare veya yatay formatta PNG, JPG veya WEBP logo yükleyebilirsiniz.
          </p>
        </div>
      </div>

      {/* Grid: Firma Adı & Website */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Firma Adı *</label>
          <input
            type="text"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="Örn: ABC Teknoloji Ltd."
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Web Sitesi</label>
          <input
            type="url"
            value={companyWebsite}
            onChange={e => setCompanyWebsite(e.target.value)}
            placeholder="https://www.ornek.com"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Grid: Telefon & E-posta */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Telefon</label>
          <input
            type="tel"
            value={companyPhone}
            onChange={e => setCompanyPhone(e.target.value)}
            placeholder="+90 212 123 45 67"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>E-posta</label>
          <input
            type="email"
            value={companyEmail}
            onChange={e => setCompanyEmail(e.target.value)}
            placeholder="info@ornek.com"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Grid: Kurucu / Firma Sahibi & Sektör */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Kurucu / Firma Sahibi</label>
          <input
            type="text"
            value={founder}
            onChange={e => setFounder(e.target.value)}
            placeholder="Örn: Ahmet Yılmaz"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Sektör</label>
          <select
            value={companyIndustry}
            onChange={e => setCompanyIndustry(e.target.value)}
            style={inputStyle}
          >
            {SECTOR_OPTIONS.map(sec => (
              <option key={sec.value} value={sec.value}>{sec.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Faaliyet Alanları (Tag Input) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Faaliyet Alanları</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
          {businessAreas.map((area, idx) => (
            <span
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#eff6ff',
                color: '#1d4ed8',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              {area}
              <button
                type="button"
                onClick={() => setBusinessAreas(prev => prev.filter((_, i) => i !== idx))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1d4ed8',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '16px',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={newBusinessArea}
            onChange={e => setNewBusinessArea(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newBusinessArea.trim()) {
                e.preventDefault();
                if (!businessAreas.includes(newBusinessArea.trim())) {
                  setBusinessAreas(prev => [...prev, newBusinessArea.trim()]);
                }
                setNewBusinessArea('');
              }
            }}
            placeholder="Yeni alan yazıp Enter'a basın (Örn: Diş Hekimliği, Villa Satışı, Kurumsal Sigorta)"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => {
              if (newBusinessArea.trim() && !businessAreas.includes(newBusinessArea.trim())) {
                setBusinessAreas(prev => [...prev, newBusinessArea.trim()]);
                setNewBusinessArea('');
              }
            }}
            style={actionBtnStyle}
          >
            <Plus size={14} /> Ekle
          </button>
        </div>
      </div>

      {/* Grid: Adres & Google Maps Linki */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Adres</label>
          <input
            type="text"
            value={companyAddress}
            onChange={e => setCompanyAddress(e.target.value)}
            placeholder="Örn: Maslak, Sarıyer / İstanbul, Türkiye"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>📍 Google Maps Linki</label>
          <input
            type="url"
            value={googleMapsUrl}
            onChange={e => setGoogleMapsUrl(e.target.value)}
            placeholder="https://maps.google.com/..."
            style={inputStyle}
          />
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}
            >
              <ExternalLink size={12} /> Haritada Görüntüle
            </a>
          )}
        </div>
      </div>

      {/* Hizmet ve Satış Bölgeleri (İl / İlçe Autocomplete) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
        <label style={labelStyle}>Hizmet ve Satış Bölgeleri</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
          {serviceRegions.map((region, idx) => (
            <span
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#f0fdf4',
                color: '#15803d',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              📍 {region}
              <button
                type="button"
                onClick={() => setServiceRegions(prev => prev.filter((_, i) => i !== idx))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#15803d',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '16px',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              value={regionSearchText}
              onChange={async (e) => {
                const val = e.target.value;
                setRegionSearchText(val);
                if (val.length >= 2) {
                  try {
                    const resp = await fetch(`https://turkiyeapi.dev/api/v1/provinces?name=${encodeURIComponent(val)}`);
                    const data = await resp.json();
                    const suggestions = [];
                    if (data.data) {
                      data.data.forEach(p => {
                        suggestions.push(p.name);
                        if (p.districts) {
                          p.districts.forEach(d => {
                            if (d.name.toLowerCase().includes(val.toLowerCase()) || p.name.toLowerCase().includes(val.toLowerCase())) {
                              suggestions.push(`${p.name} / ${d.name}`);
                            }
                          });
                        }
                      });
                    }
                    if (suggestions.length < 3) {
                      const resp2 = await fetch('https://turkiyeapi.dev/api/v1/provinces');
                      const data2 = await resp2.json();
                      if (data2.data) {
                        data2.data.forEach(p => {
                          if (p.districts) {
                            p.districts.forEach(d => {
                              if (d.name.toLowerCase().includes(val.toLowerCase())) {
                                const entry = `${p.name} / ${d.name}`;
                                if (!suggestions.includes(entry)) suggestions.push(entry);
                              }
                            });
                          }
                        });
                      }
                    }
                    setRegionSuggestions(suggestions.slice(0, 10));
                    setShowRegionDropdown(true);
                  } catch (err) {
                    console.warn('Region API error:', err);
                    setRegionSuggestions([]);
                  }
                } else {
                  setRegionSuggestions([]);
                  setShowRegionDropdown(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && regionSearchText.trim()) {
                  e.preventDefault();
                  if (!serviceRegions.includes(regionSearchText.trim())) {
                    setServiceRegions(prev => [...prev, regionSearchText.trim()]);
                  }
                  setRegionSearchText('');
                  setShowRegionDropdown(false);
                }
              }}
              onBlur={() => setTimeout(() => setShowRegionDropdown(false), 200)}
              placeholder="İl veya ilçe yazın (Örn: Kadıköy, Maslak, Beşiktaş, İzmir)"
              style={inputStyle}
            />
            {showRegionDropdown && regionSuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                maxHeight: '200px',
                overflowY: 'auto',
                marginTop: '4px'
              }}>
                {regionSuggestions.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      borderBottom: '1px solid #f1f5f9',
                      color: '#1e293b'
                    }}
                    onMouseDown={() => {
                      if (!serviceRegions.includes(s)) {
                        setServiceRegions(prev => [...prev, s]);
                      }
                      setRegionSearchText('');
                      setShowRegionDropdown(false);
                    }}
                    onMouseEnter={(e) => { e.target.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { e.target.style.background = 'transparent'; }}
                  >
                    📍 {s}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (regionSearchText.trim() && !serviceRegions.includes(regionSearchText.trim())) {
                setServiceRegions(prev => [...prev, regionSearchText.trim()]);
                setRegionSearchText('');
                setShowRegionDropdown(false);
              }
            }}
            style={actionBtnStyle}
          >
            <Plus size={14} /> Ekle
          </button>
        </div>
        <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
          İl veya ilçe yazarak arayın, listeden seçin veya Enter'a basın.
        </p>
      </div>

      {/* 7 Günlük Çalışma Saatleri */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} color="#E63B2E" />
              Çalışma Saatleri (7 Gün)
            </label>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Haftanın 7 günü için çalışma ve randevu saatlerini ayrı ayrı belirleyin.
            </p>
          </div>

          {/* Hızlı Şablonlar */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => applySchedulePreset('weekdays')}
              style={actionBtnStyle}
            >
              Hafta İçi (Pzt-Cum)
            </button>
            <button
              type="button"
              onClick={() => applySchedulePreset('weekdays_sat')}
              style={actionBtnStyle}
            >
              + Cumartesi
            </button>
            <button
              type="button"
              onClick={() => applySchedulePreset('all_week')}
              style={actionBtnStyle}
            >
              7 Gün
            </button>
          </div>
        </div>

        {/* 7 Gün Liste Kartı */}
        <div style={{
          border: '1.5px solid #e2e8f0',
          borderRadius: '10px',
          background: '#fff',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {weeklySchedule.map((item, idx) => {
            const isDayOpen = item.enabled !== undefined ? item.enabled : item.isOpen;
            const dayLabel = item.label || item.day;
            return (
              <div
                key={item.key || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 14px',
                  borderBottom: idx < weeklySchedule.length - 1 ? '1px solid #f1f5f9' : 'none',
                  background: isDayOpen ? '#fff' : '#fbfcfd',
                  transition: 'background 0.15s ease',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}
              >
                {/* Sol: Checkbox + Gün Adı + Rozet */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '170px' }}>
                  <input
                    type="checkbox"
                    id={`day-toggle-${item.key || idx}`}
                    checked={isDayOpen}
                    onChange={e => updateDaySchedule(idx, { enabled: e.target.checked, isOpen: e.target.checked })}
                    style={{
                      width: '16px',
                      height: '16px',
                      cursor: 'pointer',
                      accentColor: '#2563eb'
                    }}
                  />
                  <label
                    htmlFor={`day-toggle-${item.key || idx}`}
                    style={{
                      fontSize: '13px',
                      fontWeight: isDayOpen ? 600 : 500,
                      color: isDayOpen ? '#1e293b' : '#64748b',
                      cursor: 'pointer',
                      userSelect: 'none',
                      minWidth: '85px'
                    }}
                  >
                    {dayLabel}
                  </label>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: isDayOpen ? '#dcfce7' : '#f1f5f9',
                      color: isDayOpen ? '#166534' : '#64748b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: isDayOpen ? '#22c55e' : '#94a3b8'
                    }} />
                    {isDayOpen ? 'Açık' : 'Kapalı'}
                  </span>
                </div>

                {/* Sağ: Saat Seçiciler veya Kapalı Bildirimi */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isDayOpen ? (
                    <>
                      <input
                        type="time"
                        value={item.start}
                        onChange={e => updateDaySchedule(idx, { start: e.target.value })}
                        style={{
                          padding: '5px 8px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontFamily: 'inherit',
                          outline: 'none',
                          color: '#0f172a',
                          background: '#fff'
                        }}
                      />
                      <span style={{ color: '#94a3b8', fontWeight: 600 }}>—</span>
                      <input
                        type="time"
                        value={item.end}
                        onChange={e => updateDaySchedule(idx, { end: e.target.value })}
                        style={{
                          padding: '5px 8px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontFamily: 'inherit',
                          outline: 'none',
                          color: '#0f172a',
                          background: '#fff'
                        }}
                      />
                      {idx === 0 && (
                        <button
                          type="button"
                          onClick={() => copyDayTimeToWeekdays(item)}
                          title="Bu saatleri hafta içi günlere (Salı - Cuma) uygula"
                          style={{
                            background: '#f8fafc',
                            border: '1px dashed #cbd5e1',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Copy size={12} /> Hafta İçine Yay
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontStyle: 'italic', paddingRight: '8px' }}>
                      Kapalı (Randevu ve arama kabul edilmez)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Resmi Tatil & Bayram Günleri Politikası */}
        <div style={{
          border: '1.5px solid #e2e8f0',
          borderRadius: '10px',
          background: '#f8fafc',
          padding: '16px',
          marginTop: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🎉</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                  Resmi Tatil & Dini Bayramlar Politikası
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  AI Agent resmi tatillerde ve dini bayramlarda bu ayara göre randevu ve arama yanıtı verir.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: holidaysConfig?.closedOnPublicHolidays ? '#dc2626' : '#16a34a' }}>
                {holidaysConfig?.closedOnPublicHolidays ? '🔴 Resmi Tatillerde KAPALI' : '🟢 Resmi Tatillerde AÇIK'}
              </span>
              <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!holidaysConfig?.closedOnPublicHolidays}
                  onChange={e => {
                    setHolidaysConfig(prev => ({
                      ...prev,
                      closedOnPublicHolidays: !e.target.checked
                    }));
                  }}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: !holidaysConfig?.closedOnPublicHolidays ? '#16a34a' : '#cbd5e1',
                  transition: '0.2s', borderRadius: '24px'
                }}>
                  <span style={{
                    position: 'absolute', height: '18px', width: '18px', left: !holidaysConfig?.closedOnPublicHolidays ? '20px' : '3px',
                    bottom: '3px', backgroundColor: '#fff', transition: '0.2s', borderRadius: '50%'
                  }} />
                </span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0' }}>
            {[
              '1 Ocak (Yılbaşı)',
              '23 Nisan (Çocuk Bayramı)',
              '1 Mayıs (Emek Günü)',
              '19 Mayıs (Gençlik Bayramı)',
              '15 Temmuz (Demokrasi Günü)',
              '30 Ağustos (Zafer Bayramı)',
              '29 Ekim (Cumhuriyet Bayramı)',
              'Ramazan Bayramı',
              'Kurban Bayramı'
            ].map((hol, hIdx) => (
              <span
                key={hIdx}
                style={{
                  padding: '3px 8px',
                  background: holidaysConfig?.closedOnPublicHolidays ? '#fee2e2' : '#f0fdf4',
                  color: holidaysConfig?.closedOnPublicHolidays ? '#991b1b' : '#166534',
                  border: `1px solid ${holidaysConfig?.closedOnPublicHolidays ? '#fca5a5' : '#bbf7d0'}`,
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500
                }}
              >
                {hol}
              </span>
            ))}
          </div>

          <div style={{ marginTop: '10px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
              Özel Tatil / Bayram Notu (AI Agent için)
            </label>
            <input
              type="text"
              placeholder="Örn: Bayramın 1. ve 2. günü kapalı, 3. gün acil nöbetçi servis açıktır."
              value={holidaysConfig?.note || ''}
              onChange={e => setHolidaysConfig(prev => ({ ...prev, note: e.target.value }))}
              style={{ ...inputStyle, fontSize: '12px', background: '#fff' }}
            />
          </div>
        </div>
      </div>

      {/* Şirket Açıklaması (Textarea) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={labelStyle}>Şirket Açıklaması</label>
        <textarea
          rows={4}
          value={companyDescription}
          onChange={e => setCompanyDescription(e.target.value)}
          placeholder="Şirketiniz hakkında kısa bir açıklama. AI bu bilgiyi müşterilerle paylaşabilir."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* Bottom Save Notification / Action Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px' }}>
        <button
          type="button"
          onClick={() => handleSaveCompanyData(false)}
          disabled={savingCompany}
          style={{
            ...primaryBtnStyle,
            opacity: savingCompany ? 0.7 : 1,
            cursor: savingCompany ? 'not-allowed' : 'pointer'
          }}
        >
          {savingCompany ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Kaydediliyor...
            </>
          ) : (
            <>
              <Check size={16} />
              Firma Bilgilerini Kaydet
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderKB = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
      <div>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Bilgi Bankası</h2>
        <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>AI Agentlar şirketiniz ve ürünleriniz hakkındaki bilgileri buradan öğrenir.</p>
      </div>

      {/* Web Sitesinden Çek */}
      <div style={{ padding: '20px', border: '1.5px solid #e2e8f0', borderRadius: '10px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Globe size={18} color="#3b82f6" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>Web Sitesinden Çek (Otomatik Tarama)</h3>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
          Web sitenizin veya hakkında sayfanızın linkini girin. İçerik otomatik taranarak yapay zeka hafızasına eklenecektir.
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="url"
            value={kbUrl}
            onChange={e => setKbUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleScrapeUrl(); }}
            placeholder="https://www.firma-adiniz.com/hakkimizda"
            style={{ ...inputStyle, flex: 1 }}
            disabled={kbScraping}
          />
          <button
            type="button"
            onClick={handleScrapeUrl}
            disabled={kbScraping || !kbUrl.trim()}
            style={{
              ...primaryBtnStyle,
              background: kbScraping ? '#94a3b8' : '#2563eb',
              cursor: kbScraping ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              minWidth: '130px',
              justifyContent: 'center'
            }}
          >
            {kbScraping ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Taranıyor...
              </>
            ) : (
              <>
                <Globe size={16} />
                Tara & Çek
              </>
            )}
          </button>
        </div>

        {/* Scrape Result Alert */}
        {kbScrapeResult && (
          <div
            style={{
              background: kbScrapeResult.success ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${kbScrapeResult.success ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '13px',
              color: kbScrapeResult.success ? '#166534' : '#991b1b',
              marginTop: '4px'
            }}
          >
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              {kbScrapeResult.success ? <CheckCircle2 size={16} color="#16a34a" /> : <AlertCircle size={16} color="#dc2626" />}
              {kbScrapeResult.message}
            </div>
            {kbScrapeResult.title && (
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '4px' }}>
                📄 {kbScrapeResult.title}
              </div>
            )}
            {kbScrapeResult.snippet && (
              <div style={{ color: '#475569', fontSize: '12px', marginTop: '4px', lineHeight: 1.4 }}>
                {kbScrapeResult.snippet}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metin Ekle / SSS */}
      <div style={{ padding: '20px', border: '1.5px solid #e2e8f0', borderRadius: '10px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color="#E63B2E" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>Metin Ekle / SSS</h3>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
          Şirket politikaları, iade şartları, sık sorulan sorular veya ürün detaylarını buraya doğrudan yazabilir veya yapıştırabilirsiniz.
        </p>

        <input
          type="text"
          value={manualKbTitle}
          onChange={e => setManualKbTitle(e.target.value)}
          placeholder="Başlık (Örn: Sık Sorulan Sorular / Hizmet Şartları)"
          style={inputStyle}
        />

        <textarea
          rows={5}
          value={manualKbText}
          onChange={e => setManualKbText(e.target.value)}
          placeholder="İçeriği buraya yazın veya yapıştırın..."
          style={{ ...inputStyle, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSaveManualKb}
            disabled={manualKbSaving || !manualKbText.trim()}
            style={{
              ...primaryBtnStyle,
              background: '#E63B2E',
              opacity: manualKbSaving || !manualKbText.trim() ? 0.6 : 1,
              padding: '8px 16px',
              fontSize: '13px'
            }}
          >
            {manualKbSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {manualKbSaving ? 'Kaydediliyor...' : 'Bilgi Bankasına Ekle'}
          </button>
        </div>
      </div>

      {/* Eklenen Kayıtlar Listesi */}
      <div style={{ marginTop: '6px' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
          Kayıtlı Bilgi Bankası Belgeleri ({kbEntries.length})
        </h4>
        {kbLoading ? (
          <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Loader2 size={14} className="animate-spin" /> Yükleniyor...
          </div>
        ) : kbEntries.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', padding: '12px', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
            Henüz eklenmiş bir doküman yok. Yukarıdaki seçeneklerle web sitenizi tarayabilir veya metin ekleyebilirsiniz.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {kbEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                  {entry.sourceType === 'URL' || entry.sourceUrl ? (
                    <Globe size={15} color="#2563eb" style={{ flexShrink: 0 }} />
                  ) : (
                    <FileText size={15} color="#E63B2E" style={{ flexShrink: 0 }} />
                  )}
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.title || entry.sourceUrl || 'Belge'}
                  </span>
                  <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                    {entry.sourceType || 'TEXT'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteKbEntry(entry.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
                  title="Sil"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderSubeler = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Şubeler</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Müşterilerinize hizmet verdiğiniz tüm şube ve lokasyonlar.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddBranch(!showAddBranch)}
          style={primaryBtnStyle}
        >
          <Plus size={16} /> Yeni Şube Ekle
        </button>
      </div>

      {showAddBranch && (
        <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Yeni Şube Bilgileri</h4>
          <input
            type="text"
            placeholder="Şube Adı (Örn: Kadıköy Merkez)*"
            value={newBranch.name}
            onChange={e => setNewBranch({ ...newBranch, name: e.target.value })}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Adres"
            value={newBranch.address}
            onChange={e => setNewBranch({ ...newBranch, address: e.target.value })}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Telefon"
            value={newBranch.phone}
            onChange={e => setNewBranch({ ...newBranch, phone: e.target.value })}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowAddBranch(false)} style={secondaryBtnStyle}>İptal</button>
            <button type="button" onClick={handleCreateBranch} disabled={savingBranch} style={primaryBtnStyle}>
              {savingBranch ? 'Kaydediliyor...' : 'Şubeyi Ekle'}
            </button>
          </div>
        </div>
      )}

      {branchesLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
          <Loader2 size={16} className="animate-spin" /> Şubeler yükleniyor...
        </div>
      ) : branches.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
          Kayıtlı şube bulunamadı. "Yeni Şube Ekle" butonuna basarak ilk şubenizi ekleyebilirsiniz.
        </div>
      ) : (
        branches.map(branch => (
          editingBranchId === branch.id ? (
            <div key={branch.id} style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>Şubeyi Düzenle</div>
              <input
                type="text"
                placeholder="Şube Adı*"
                value={editBranchData.name}
                onChange={e => setEditBranchData({ ...editBranchData, name: e.target.value })}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Adres"
                value={editBranchData.address}
                onChange={e => setEditBranchData({ ...editBranchData, address: e.target.value })}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Telefon"
                value={editBranchData.phone}
                onChange={e => setEditBranchData({ ...editBranchData, phone: e.target.value })}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditingBranchId(null)} style={secondaryBtnStyle}>İptal</button>
                <button type="button" onClick={handleUpdateBranch} disabled={savingEditBranch} style={primaryBtnStyle}>
                  {savingEditBranch ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                </button>
              </div>
            </div>
          ) : (
            <div key={branch.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>{branch.name}</span>
                  <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 600, background: '#dcfce7', padding: '2px 8px', borderRadius: '12px' }}>Aktif</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleStartEditBranch(branch)}
                    style={actionBtnStyle}
                    title="Şubeyi Düzenle"
                  >
                    <Edit2 size={13} /> Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBranch(branch.id)}
                    style={deleteBtnStyle}
                    title="Şubeyi Sil"
                  >
                    <Trash2 size={13} /> Sil
                  </button>
                </div>
              </div>
              {branch.address && <div style={{ color: '#64748b', fontSize: '13px' }}>📍 {branch.address}</div>}
              {branch.phone && <div style={{ color: '#64748b', fontSize: '13px' }}>📞 {branch.phone}</div>}
            </div>
          )
        ))
      )}
    </div>
  );

  const renderKategoriler = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Kategoriler</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Ürün ve hizmetlerinizi gruplandırmak için kategoriler tanımlayın.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddCategory(!showAddCategory)}
          style={primaryBtnStyle}
        >
          <Plus size={16} /> Kategori Ekle
        </button>
      </div>

      {showAddCategory && (
        <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Yeni Kategori</h4>
          <input
            type="text"
            placeholder="Kategori Adı (Örn: Satılık Konut / Otomotiv)*"
            value={newCategory.name}
            onChange={e => setNewCategory({ ...newCategory, name: e.target.value })}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Açıklama (Opsiyonel)"
            value={newCategory.description}
            onChange={e => setNewCategory({ ...newCategory, description: e.target.value })}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowAddCategory(false)} style={secondaryBtnStyle}>İptal</button>
            <button type="button" onClick={handleCreateCategory} disabled={savingCategory} style={primaryBtnStyle}>
              {savingCategory ? 'Kaydediliyor...' : 'Kategoriyi Ekle'}
            </button>
          </div>
        </div>
      )}

      {categoriesLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
          <Loader2 size={16} className="animate-spin" /> Kategoriler yükleniyor...
        </div>
      ) : categories.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
          Henüz kategori bulunamadı. "Kategori Ekle" butonuna basarak ilk kategorinizi oluşturabilirsiniz.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
          {categories.map(cat => (
            editingCategoryId === cat.id ? (
              <div key={cat.id} style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '14px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>Kategoriyi Düzenle</div>
                <input
                  type="text"
                  placeholder="Kategori Adı*"
                  value={editCategoryData.name}
                  onChange={e => setEditCategoryData({ ...editCategoryData, name: e.target.value })}
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="Açıklama (Opsiyonel)"
                  value={editCategoryData.description}
                  onChange={e => setEditCategoryData({ ...editCategoryData, description: e.target.value })}
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setEditingCategoryId(null)} style={secondaryBtnStyle}>İptal</button>
                  <button type="button" onClick={handleUpdateCategory} disabled={savingEditCategory} style={primaryBtnStyle}>
                    {savingEditCategory ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </div>
              </div>
            ) : (
              <div key={cat.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', background: '#fff', borderLeft: `4px solid ${cat.color || '#3b82f6'}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>{cat.name}</div>
                  {cat.description && <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>{cat.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleStartEditCategory(cat)}
                    style={actionBtnStyle}
                    title="Düzenle"
                  >
                    <Edit2 size={12} /> Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat.id)}
                    style={deleteBtnStyle}
                    title="Sil"
                  >
                    <Trash2 size={12} /> Sil
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );

  const renderUrunler = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '820px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Ürünler / Portföyler</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Fiyat teklifleri ve AI asistanların müşterilere sunacağı ürünler.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddProduct(!showAddProduct)}
          style={primaryBtnStyle}
        >
          <Plus size={16} /> Ürün Ekle
        </button>
      </div>

      {showAddProduct && (
        <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Yeni Ürün Ekle</h4>
          <input
            type="text"
            placeholder="Ürün / Hizmet Adı*"
            value={newProduct.name}
            onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="number"
              placeholder="Fiyat (TL)"
              value={newProduct.price}
              onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={newProduct.categoryId}
              onChange={e => setNewProduct({ ...newProduct, categoryId: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">-- Kategori Seçin --</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowAddProduct(false)} style={secondaryBtnStyle}>İptal</button>
            <button type="button" onClick={handleCreateProduct} disabled={savingProduct} style={primaryBtnStyle}>
              {savingProduct ? 'Kaydediliyor...' : 'Ürünü Ekle'}
            </button>
          </div>
        </div>
      )}

      {productsLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
          <Loader2 size={16} className="animate-spin" /> Ürünler yükleniyor...
        </div>
      ) : products.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
          Henüz eklenmiş ürün veya hizmet bulunamadı. "Ürün Ekle" butonu ile ekleyebilirsiniz.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                <th style={{ padding: '12px', color: '#475569' }}>Ürün / Hizmet Adı</th>
                <th style={{ padding: '12px', color: '#475569' }}>Fiyat</th>
                <th style={{ padding: '12px', color: '#475569' }}>Kategori</th>
                <th style={{ padding: '12px', color: '#475569', textAlign: 'right' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {products.map(prod => (
                editingProductId === prod.id ? (
                  <tr key={prod.id} style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <input
                        type="text"
                        value={editProductData.name}
                        onChange={e => setEditProductData({ ...editProductData, name: e.target.value })}
                        style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }}
                      />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <input
                        type="number"
                        value={editProductData.price}
                        onChange={e => setEditProductData({ ...editProductData, price: e.target.value })}
                        style={{ ...inputStyle, width: '110px', padding: '6px 10px', fontSize: '13px' }}
                      />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <select
                        value={editProductData.categoryId}
                        onChange={e => setEditProductData({ ...editProductData, categoryId: e.target.value })}
                        style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }}
                      >
                        <option value="">-- Kategori --</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={handleUpdateProduct}
                        disabled={savingEditProduct}
                        style={{ ...primaryBtnStyle, padding: '5px 10px', fontSize: '12px', marginRight: '6px', display: 'inline-flex' }}
                      >
                        {savingEditProduct ? '...' : 'Kaydet'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProductId(null)}
                        style={{ ...secondaryBtnStyle, padding: '5px 10px', fontSize: '12px', display: 'inline-flex' }}
                      >
                        İptal
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#1e293b' }}>{prod.name}</td>
                    <td style={{ padding: '12px', color: '#0f172a' }}>
                      {prod.price ? `₺${Number(prod.price).toLocaleString('tr-TR')}` : 'Fiyat Belirtilmedi'}
                    </td>
                    <td style={{ padding: '12px', color: '#64748b' }}>
                      {prod.category?.name || categories.find(c => c.id === prod.categoryId)?.name || '-'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => handleStartEditProduct(prod)}
                        style={{ ...actionBtnStyle, marginRight: '6px' }}
                        title="Düzenle"
                      >
                        <Edit2 size={12} /> Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(prod.id)}
                        style={deleteBtnStyle}
                        title="Sil"
                      >
                        <Trash2 size={12} /> Sil
                      </button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const RESOURCE_TYPE_MAP = {
    PERSON: 'Kişi / Doktor',
    SPECIALIST: 'Uzman',
    THERAPIST: 'Terapist',
    STAFF: 'Personel',
    ROOM: 'Oda / Alan',
    EQUIPMENT: 'Cihaz / Ekipman',
    OTHER: 'Diğer'
  };

  const renderKaynaklar = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '820px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Kaynaklar / Doktorlar & Hizmet Alanları</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Randevu ve rezervasyon verilen doktorlar, uzmanlar, terapistler, odalar veya ekipmanlar.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddResource(!showAddResource)}
          style={primaryBtnStyle}
        >
          <Plus size={16} /> Yeni Kaynak Ekle
        </button>
      </div>

      {showAddResource && (
        <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '18px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>Yeni Kaynak / Doktor Ekle</h4>
            <span style={{ fontSize: '12px', color: '#64748b' }}>* Zorunlu alan</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Ad Soyad / Kaynak Adı *</label>
              <input
                type="text"
                placeholder="Örn: Dr. Ahmet Yılmaz / Lazer Odası 1"
                value={newResource.name}
                onChange={e => setNewResource({ ...newResource, name: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Ünvan (Opsiyonel)</label>
              <input
                type="text"
                placeholder="Örn: Uzm. Dr. / Fizyoterapist"
                value={newResource.title}
                onChange={e => setNewResource({ ...newResource, title: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Bölüm / Uzmanlık / Alan</label>
              <input
                type="text"
                placeholder="Örn: Dermatoloji / Cilt Bakımı"
                value={newResource.description}
                onChange={e => setNewResource({ ...newResource, description: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Kaynak Tipi</label>
              <select
                value={newResource.type}
                onChange={e => setNewResource({ ...newResource, type: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              >
                <option value="PERSON">Kişi / Doktor</option>
                <option value="SPECIALIST">Uzman</option>
                <option value="THERAPIST">Terapist</option>
                <option value="STAFF">Personel</option>
                <option value="ROOM">Oda / Alan</option>
                <option value="EQUIPMENT">Ekipman / Cihaz</option>
                <option value="OTHER">Diğer</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Mesai Başlangıç</label>
              <input
                type="time"
                value={newResource.availableStart}
                onChange={e => setNewResource({ ...newResource, availableStart: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Mesai Bitiş</label>
              <input
                type="time"
                value={newResource.availableEnd}
                onChange={e => setNewResource({ ...newResource, availableEnd: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Randevu Süresi</label>
              <select
                value={newResource.slotMinutes}
                onChange={e => setNewResource({ ...newResource, slotMinutes: parseInt(e.target.value, 10) })}
                style={{ ...inputStyle, marginTop: '4px' }}
              >
                <option value={15}>15 Dakika</option>
                <option value={20}>20 Dakika</option>
                <option value={30}>30 Dakika</option>
                <option value={45}>45 Dakika</option>
                <option value={60}>60 Dakika (1 Saat)</option>
                <option value={90}>90 Dakika (1.5 Saat)</option>
                <option value={120}>120 Dakika (2 Saat)</option>
              </select>
            </div>
          </div>

          {branches.length > 0 && (
            <div>
              <label style={labelStyle}>Hizmet Verdiği Şubeler</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {branches.map(b => {
                  const isSelected = newResource.branchIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setNewResource(prev => ({
                          ...prev,
                          branchIds: isSelected
                            ? prev.branchIds.filter(id => id !== b.id)
                            : [...prev.branchIds, b.id]
                        }));
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: isSelected ? '1.5px solid #E63B2E' : '1px solid #cbd5e1',
                        background: isSelected ? '#fef2f2' : '#fff',
                        color: isSelected ? '#E63B2E' : '#475569',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {isSelected ? <Check size={12} /> : <MapPin size={12} />}
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={() => setShowAddResource(false)} style={secondaryBtnStyle}>İptal</button>
            <button type="button" onClick={handleCreateResource} disabled={savingResource} style={primaryBtnStyle}>
              {savingResource ? 'Kaydediliyor...' : 'Kaynağı Ekle'}
            </button>
          </div>
        </div>
      )}

      {resourcesLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
          <Loader2 size={16} className="animate-spin" /> Kaynaklar yükleniyor...
        </div>
      ) : resources.length === 0 ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', background: '#fafafa' }}>
          <UserCircle size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
          <div style={{ fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Henüz kayıtlı kaynak bulunmuyor</div>
          <div style={{ fontSize: '13px' }}>Randevu alan doktor, terapist veya odalarınız varsa "Yeni Kaynak Ekle" butonuna basarak ilk kaynağınızı oluşturabilirsiniz.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {resources.map(resource => {
            const branchNames = (resource.resourceBranches && resource.resourceBranches.length > 0)
              ? resource.resourceBranches.map(rb => rb.branch?.name).filter(Boolean)
              : (resource.branchIds || (resource.branchId ? [resource.branchId] : [])).map(id => branches.find(b => b.id === id)?.name).filter(Boolean);

            if (editingResourceId === resource.id) {
              return (
                <div key={resource.id} style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '18px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>Kaynağı Düzenle</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Ad Soyad / Kaynak Adı *</label>
                      <input
                        type="text"
                        value={editResourceData.name}
                        onChange={e => setEditResourceData({ ...editResourceData, name: e.target.value })}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Ünvan</label>
                      <input
                        type="text"
                        value={editResourceData.title}
                        onChange={e => setEditResourceData({ ...editResourceData, title: e.target.value })}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Bölüm / Uzmanlık</label>
                      <input
                        type="text"
                        value={editResourceData.description}
                        onChange={e => setEditResourceData({ ...editResourceData, description: e.target.value })}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Kaynak Tipi</label>
                      <select
                        value={editResourceData.type}
                        onChange={e => setEditResourceData({ ...editResourceData, type: e.target.value })}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      >
                        <option value="PERSON">Kişi / Doktor</option>
                        <option value="SPECIALIST">Uzman</option>
                        <option value="THERAPIST">Terapist</option>
                        <option value="STAFF">Personel</option>
                        <option value="ROOM">Oda / Alan</option>
                        <option value="EQUIPMENT">Ekipman / Cihaz</option>
                        <option value="OTHER">Diğer</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Mesai Başlangıç</label>
                      <input
                        type="time"
                        value={editResourceData.availableStart}
                        onChange={e => setEditResourceData({ ...editResourceData, availableStart: e.target.value })}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Mesai Bitiş</label>
                      <input
                        type="time"
                        value={editResourceData.availableEnd}
                        onChange={e => setEditResourceData({ ...editResourceData, availableEnd: e.target.value })}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Randevu Süresi</label>
                      <select
                        value={editResourceData.slotMinutes}
                        onChange={e => setEditResourceData({ ...editResourceData, slotMinutes: parseInt(e.target.value, 10) })}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      >
                        <option value={15}>15 Dakika</option>
                        <option value={20}>20 Dakika</option>
                        <option value={30}>30 Dakika</option>
                        <option value={45}>45 Dakika</option>
                        <option value={60}>60 Dakika (1 Saat)</option>
                        <option value={90}>90 Dakika (1.5 Saat)</option>
                        <option value={120}>120 Dakika (2 Saat)</option>
                      </select>
                    </div>
                  </div>

                  {branches.length > 0 && (
                    <div>
                      <label style={labelStyle}>Hizmet Verdiği Şubeler</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                        {branches.map(b => {
                          const isSelected = (editResourceData.branchIds || []).includes(b.id);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setEditResourceData(prev => ({
                                  ...prev,
                                  branchIds: isSelected
                                    ? prev.branchIds.filter(id => id !== b.id)
                                    : [...(prev.branchIds || []), b.id]
                                }));
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '20px',
                                fontSize: '12px',
                                fontWeight: 600,
                                border: isSelected ? '1.5px solid #E63B2E' : '1px solid #cbd5e1',
                                background: isSelected ? '#fef2f2' : '#fff',
                                color: isSelected ? '#E63B2E' : '#475569',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              {isSelected ? <Check size={12} /> : <MapPin size={12} />}
                              {b.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setEditingResourceId(null)} style={secondaryBtnStyle}>İptal</button>
                    <button type="button" onClick={handleUpdateResource} disabled={savingEditResource} style={primaryBtnStyle}>
                      {savingEditResource ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={resource.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  background: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>
                      {resource.title ? `${resource.title} ` : ''}{resource.name}
                    </span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
                      {RESOURCE_TYPE_MAP[resource.type] || resource.type || 'Kişi'}
                    </span>
                    <span style={{ color: '#16a34a', fontSize: '11px', fontWeight: 600, background: '#dcfce7', padding: '2px 8px', borderRadius: '12px' }}>
                      Aktif
                    </span>
                  </div>

                  {resource.description && (
                    <div style={{ fontSize: '13px', color: '#0284c7', fontWeight: 500 }}>
                      Bölüm / Uzmanlık: {resource.description}
                    </div>
                  )}

                  <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <span>⏰ Mesai: {resource.availableStart || '09:00'} - {resource.availableEnd || '18:00'}</span>
                    <span>⏱️ Randevu: {resource.slotMinutes || 30} dk</span>
                  </div>

                  {branchNames.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#E63B2E', fontWeight: 500, marginTop: '2px' }}>
                      📍 Şubeler: {branchNames.join(', ')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleStartEditResource(resource)}
                    style={actionBtnStyle}
                    title="Düzenle"
                  >
                    <Edit2 size={12} /> Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteResource(resource.id, resource.name)}
                    style={deleteBtnStyle}
                    title="Sil"
                  >
                    <Trash2 size={12} /> Sil
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderKanallar = () => {
    const igPages = facebookPages.filter(p => p.instagramBusinessId);
    const fbPages = facebookPages;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '840px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>İletişim Kanalları</h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>
              AI Agent'ın müşterilerinizle otomatik iletişim kuracağı gerçek kanalları bağlayın. Her kanal CRM gelen kutunuza ve AI Agent'a entegre olur.
            </p>
          </div>
          <button
            type="button"
            onClick={loadWizardChannels}
            disabled={channelsLoading}
            style={secondaryBtnStyle}
            title="Kanal durumlarını yenile"
          >
            <RefreshCw size={14} className={channelsLoading ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>

        {/* Canlı Durum Özeti */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          flexWrap: 'wrap',
          padding: '12px 18px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          fontSize: '13px'
        }}>
          <span style={{ fontWeight: 600, color: '#334155' }}>Bağlı Kanallar:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: whatsappNumbers.length > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
            <MessageCircle size={15} /> WhatsApp: {whatsappNumbers.length > 0 ? `${whatsappNumbers.length} Bağlı` : 'Yok'}
          </span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: igPages.length > 0 ? '#e1306c' : '#94a3b8', fontWeight: 600 }}>
            <Instagram size={15} /> Instagram: {igPages.length > 0 ? `${igPages.length} Bağlı` : 'Yok'}
          </span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: fbPages.length > 0 ? '#1877f2' : '#94a3b8', fontWeight: 600 }}>
            <Facebook size={15} /> Facebook: {fbPages.length > 0 ? `${fbPages.length} Bağlı` : 'Yok'}
          </span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: webWidgets.length > 0 ? '#2563eb' : '#94a3b8', fontWeight: 600 }}>
            <Globe size={15} /> Web Widget: {webWidgets.length > 0 ? `${webWidgets.length} Aktif` : 'Yok'}
          </span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: retellSettings?.isConfigured ? '#0d9488' : '#94a3b8', fontWeight: 600 }}>
            <Phone size={15} /> Sesli AI: {retellSettings?.isConfigured ? 'Yapılandırıldı' : 'Yok'}
          </span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: emailChannels.length > 0 ? '#ea4335' : '#94a3b8', fontWeight: 600 }}>
            <Mail size={15} /> E-posta: {emailChannels.length > 0 ? `${emailChannels.length} Bağlı` : 'Yok'}
          </span>
        </div>

        {/* Kanal Kartları */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* 1. WhatsApp Business */}
          <div style={{
            border: whatsappNumbers.length > 0 ? '1.5px solid #22c55e' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '18px 20px',
            background: '#fff',
            boxShadow: whatsappNumbers.length > 0 ? '0 2px 8px rgba(34, 197, 94, 0.08)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                  <MessageCircle size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>WhatsApp Business</h4>
                    <span style={{ fontSize: '11px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>Meta Cloud API</span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Müşterilerinize 7/24 anında otomatik yanıt verin, randevu oluşturun ve katalog sunun.
                  </p>
                </div>
              </div>
              <div>
                {whatsappNumbers.length > 0 ? (
                  <span style={{ fontSize: '12px', background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={13} /> {whatsappNumbers.length} Numara Bağlı
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                    Bağlı Değil
                  </span>
                )}
              </div>
            </div>

            {/* Bağlı Numaralar Listesi */}
            {whatsappNumbers.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Bağlı WhatsApp Numaraları</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {whatsappNumbers.map(num => (
                    <div key={num.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
                      <Phone size={14} color="#16a34a" />
                      <strong style={{ color: '#0f172a' }}>{num.displayPhoneNumber || num.phoneNumber}</strong>
                      {num.verifiedName && <span style={{ fontSize: '11px', color: '#64748b' }}>({num.verifiedName})</span>}
                      <button
                        type="button"
                        onClick={() => handleDeleteWhatsapp(num.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', marginLeft: '4px' }}
                        title="Numarayı Kaldır"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowWhatsAppModal(true)}
                style={{ ...primaryBtnStyle, background: '#16a34a' }}
              >
                <MessageCircle size={15} />
                {whatsappNumbers.length > 0 ? 'WhatsApp Numaralarını Yönet' : '+ WhatsApp Bağla (Meta API)'}
              </button>
            </div>
          </div>

          {/* 2. Instagram Direct */}
          <div style={{
            border: igPages.length > 0 ? '1.5px solid #e1306c' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '18px 20px',
            background: '#fff',
            boxShadow: igPages.length > 0 ? '0 2px 8px rgba(225, 48, 108, 0.08)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e1306c' }}>
                  <Instagram size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Instagram Direct</h4>
                    <span style={{ fontSize: '11px', background: '#fdf2f8', color: '#e1306c', border: '1px solid #fbcfe8', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>DM Otomasyonu</span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Hikaye yanıtları ve DM mesajlarını AI Agent karşılasın, randevu oluştursun.
                  </p>
                </div>
              </div>
              <div>
                {igPages.length > 0 ? (
                  <span style={{ fontSize: '12px', background: '#fdf2f8', color: '#be185d', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={13} /> {igPages.length} Hesap Bağlı
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                    Bağlı Değil
                  </span>
                )}
              </div>
            </div>

            {/* Bağlı Instagram Hesapları */}
            {igPages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Bağlı Instagram Hesapları</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {igPages.map(page => (
                    <div key={page.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
                      <Instagram size={14} color="#e1306c" />
                      <strong style={{ color: '#0f172a' }}>@{page.instagramUsername || 'Instagram Hesabı'}</strong>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>({page.name || page.pageName})</span>
                      <button
                        type="button"
                        onClick={() => handleDisconnectPage(page.id, 'instagram')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', marginLeft: '4px' }}
                        title="Bağlantıyı Kes"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleOAuthConnect('instagram')}
                style={{ ...primaryBtnStyle, background: 'linear-gradient(135deg, #e1306c 0%, #c13584 100%)' }}
              >
                <Instagram size={15} />
                + Instagram Hesabı Bağla (Meta OAuth)
              </button>
            </div>
          </div>

          {/* 3. Facebook Messenger */}
          <div style={{
            border: fbPages.length > 0 ? '1.5px solid #1877f2' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '18px 20px',
            background: '#fff',
            boxShadow: fbPages.length > 0 ? '0 2px 8px rgba(24, 119, 242, 0.08)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1877f2' }}>
                  <Facebook size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Facebook Messenger</h4>
                    <span style={{ fontSize: '11px', background: '#eff6ff', color: '#1877f2', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>Sayfa Mesajları</span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Facebook işletme sayfanıza gelen mesajları AI Agent anında karşılar.
                  </p>
                </div>
              </div>
              <div>
                {fbPages.length > 0 ? (
                  <span style={{ fontSize: '12px', background: '#eff6ff', color: '#1e40af', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={13} /> {fbPages.length} Sayfa Bağlı
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                    Bağlı Değil
                  </span>
                )}
              </div>
            </div>

            {/* Bağlı Facebook Sayfaları */}
            {fbPages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Bağlı Facebook Sayfaları</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {fbPages.map(page => (
                    <div key={page.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
                      <Facebook size={14} color="#1877f2" />
                      <strong style={{ color: '#0f172a' }}>{page.pageName || page.name}</strong>
                      <button
                        type="button"
                        onClick={() => handleDisconnectPage(page.id, 'facebook')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', marginLeft: '4px' }}
                        title="Bağlantıyı Kes"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleOAuthConnect('facebook')}
                style={{ ...primaryBtnStyle, background: '#1877f2' }}
              >
                <Facebook size={15} />
                + Facebook Sayfası Bağla (Meta OAuth)
              </button>
            </div>
          </div>

          {/* 4. Web Canlı Sohbet (Widget) */}
          <div style={{
            border: webWidgets.length > 0 ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '18px 20px',
            background: '#fff',
            boxShadow: webWidgets.length > 0 ? '0 2px 8px rgba(59, 130, 246, 0.08)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                  <Globe size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Web Canlı Sohbet (Widget)</h4>
                    <span style={{ fontSize: '11px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>Web Sitesi Balonu</span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Web sitenize tek satır kodla eklenen, ziyaretçilerle 7/24 konuşan AI chat penceresi.
                  </p>
                </div>
              </div>
              <div>
                {webWidgets.length > 0 ? (
                  <span style={{ fontSize: '12px', background: '#dbeafe', color: '#1e40af', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={13} /> {webWidgets.length} Widget Aktif
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                    Henüz Oluşturulmadı
                  </span>
                )}
              </div>
            </div>

            {/* Mevcut Widgetlar */}
            {webWidgets.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {webWidgets.map(widget => {
                  const widgetCode = `<script src="${window.location.origin}/widget.js" data-widget-id="${widget.id}"></script>`;
                  const isCopied = copiedWidgetId === widget.id;
                  return (
                    <div key={widget.id} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '13px', color: '#0f172a' }}>{widget.name || 'Web Destek Widget'}</strong>
                          {widget.siteUrl && <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '6px' }}>({widget.siteUrl})</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedWidget(widget);
                              setWidgetModalMode('edit');
                              setShowWidgetModal(true);
                            }}
                            style={actionBtnStyle}
                            title="Düzenle"
                          >
                            <Edit2 size={12} /> Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWebWidget(widget.id)}
                            style={deleteBtnStyle}
                            title="Sil"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, background: '#1e293b', color: '#e2e8f0', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace', overflowX: 'auto' }}>
                          {widgetCode}
                        </div>
                        <button
                          type="button"
                          onClick={() => copyWidgetSnippet(widget.id, widgetCode)}
                          style={{
                            ...primaryBtnStyle,
                            padding: '8px 14px',
                            background: isCopied ? '#16a34a' : '#2563eb',
                            fontSize: '12px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {isCopied ? <Check size={14} /> : <Copy size={14} />}
                          {isCopied ? 'Kopyalandı!' : 'Kodu Kopyala'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '12px', color: '#64748b' }}>
                💡 Henüz bir Web Widget oluşturmadınız. "+ Yeni Web Widget Oluştur" butonuna tıklayarak renk, başlık ve selamlama mesajınızı belirleyip hemen sitenize ekleyebilirsiniz.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedWidget(null);
                  setWidgetModalMode('create');
                  setShowWidgetModal(true);
                }}
                style={{ ...primaryBtnStyle, background: '#2563eb' }}
              >
                <Plus size={15} />
                + Yeni Web Widget Oluştur
              </button>
            </div>
          </div>

          {/* 5. Retell AI Sesli Arama */}
          <div style={{
            border: retellSettings?.isConfigured ? '1.5px solid #0d9488' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '18px 20px',
            background: '#fff',
            boxShadow: retellSettings?.isConfigured ? '0 2px 8px rgba(13, 148, 136, 0.08)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d9488' }}>
                  <Phone size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Retell AI Sesli Arama (Voice AI)</h4>
                    <span style={{ fontSize: '11px', background: '#f0fdfa', color: '#0d9488', border: '1px solid #99f6e4', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>Telefon Görüşmesi</span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Müşterilerinizi telefonla arayan veya gelen çağrıları karşılayan yapay zeka sesli asistanı.
                  </p>
                </div>
              </div>
              <div>
                {retellSettings?.isConfigured ? (
                  <span style={{ fontSize: '12px', background: '#ccfbf1', color: '#115e59', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={13} /> Yapılandırıldı
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                    Yapılandırılmadı
                  </span>
                )}
              </div>
            </div>

            {retellSettings?.isConfigured && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <PhoneCall size={16} color="#0d9488" />
                <span>
                  Arama Numarası: <strong>{retellSettings.retellFromNumber || 'Varsayılan Numara'}</strong>
                </span>
                {retellSettings.retellAgentId && (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>(Agent ID: {retellSettings.retellAgentId})</span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowRetellModal(true)}
                style={{ ...primaryBtnStyle, background: '#0d9488' }}
              >
                <Phone size={15} />
                {retellSettings?.isConfigured ? 'Sesli Arama Ayarlarını Düzenle' : '📞 Sesli Arama Yapılandır (Retell AI)'}
              </button>
            </div>
          </div>

          {/* 6. E-posta (Gmail / IMAP) */}
          <div style={{
            border: emailChannels.length > 0 ? '1.5px solid #EA4335' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '18px 20px',
            background: '#fff',
            boxShadow: emailChannels.length > 0 ? '0 2px 8px rgba(234, 67, 53, 0.08)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EA4335' }}>
                  <Mail size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>E-posta Kutusu</h4>
                    <span style={{ fontSize: '11px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>Gmail & IMAP</span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Google Workspace, Yandex veya kurumsal e-postanızı bağlayarak gelen e-postaları CRM'de yönetin.
                  </p>
                </div>
              </div>
              <div>
                {emailChannels.length > 0 ? (
                  <span style={{ fontSize: '12px', background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={13} /> {emailChannels.length} E-posta Bağlı
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                    Bağlı Değil
                  </span>
                )}
              </div>
            </div>

            {/* Bağlı E-postalar */}
            {emailChannels.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Bağlı E-posta Hesapları</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {emailChannels.map(email => (
                    <div key={email.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
                      <Mail size={14} color="#EA4335" />
                      <strong style={{ color: '#0f172a' }}>{email.email}</strong>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>({email.provider})</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteEmail(email.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', marginLeft: '4px' }}
                        title="Hesabı Kaldır"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setEmailProvider('');
                  setShowEmailModal(true);
                }}
                style={{ ...primaryBtnStyle, background: '#EA4335' }}
              >
                <Mail size={15} />
                + E-posta Hesabı Bağla
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  };

  const renderAkislar = () => {
    const funnelList = Array.isArray(funnels) ? funnels : [];
    const defaultFunnel = funnelList.find(f => f && (f.funnelType === 'MAIN' || f.name === 'Genel Akış' || f.name === 'Genel' || f.name === 'Genel Müşteri Akışı'));
    const otherFunnels = funnelList.filter(f => f && f.id !== defaultFunnel?.id && f.name !== 'Genel Akış' && f.name !== 'Genel' && f.name !== 'Genel Müşteri Akışı');

    const renderFunnelEditForm = (isDefault = false) => (
      <div style={{
        border: '1.5px solid #E63B2E',
        borderRadius: '8px',
        padding: '16px',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxShadow: '0 4px 12px rgba(230, 59, 46, 0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Edit2 size={16} color="#E63B2E" />
            {isDefault ? 'Varsayılan Akış Aşamalarını Düzenle' : 'Akışı ve Aşamaları Düzenle'}
          </div>
          <button
            type="button"
            onClick={() => setEditingFunnelId(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
            title="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
            Akış Adı *
          </label>
          <input
            type="text"
            placeholder="Akış Adı*"
            value={editFunnelData.name}
            onChange={e => setEditFunnelData({ ...editFunnelData, name: e.target.value })}
            style={inputStyle}
            disabled={isDefault}
          />
        </div>

        {/* Stages Section */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Akış Aşamaları</span>
                <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '1px 7px', borderRadius: '10px', fontWeight: 600 }}>
                  {editFunnelData.stages?.length || 0}
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Aşama isimlerini değiştirebilir, sıralarını düzenleyebilir veya yeni aşama ekleyebilirsiniz.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddStageToEditFunnel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <Plus size={14} /> Yeni Aşama Ekle
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(editFunnelData.stages || []).map((st, idx) => (
              <div
                key={st.id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '8px 10px'
                }}
              >
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#e2e8f0',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#475569',
                  flexShrink: 0
                }}>
                  {idx + 1}
                </span>

                <input
                  type="color"
                  value={st.color || '#3b82f6'}
                  onChange={e => handleStageChangeInEditFunnel(idx, 'color', e.target.value)}
                  style={{
                    width: '28px',
                    height: '28px',
                    padding: 0,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  title="Aşama Rengi"
                />

                <input
                  type="text"
                  placeholder="Aşama Adı (örn: Teklif Verildi)*"
                  value={st.name}
                  onChange={e => handleStageChangeInEditFunnel(idx, 'name', e.target.value)}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '13px'
                  }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveStage(idx, 'up')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: idx === 0 ? 'not-allowed' : 'pointer',
                      opacity: idx === 0 ? 0.25 : 0.8,
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Yukarı Taşı"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === (editFunnelData.stages?.length || 0) - 1}
                    onClick={() => handleMoveStage(idx, 'down')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: idx === (editFunnelData.stages?.length || 0) - 1 ? 'not-allowed' : 'pointer',
                      opacity: idx === (editFunnelData.stages?.length || 0) - 1 ? 0.25 : 0.8,
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Aşağı Taşı"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={(editFunnelData.stages?.length || 0) <= 1}
                  onClick={() => handleRemoveStageFromEditFunnel(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: (editFunnelData.stages?.length || 0) <= 1 ? 'not-allowed' : 'pointer',
                    opacity: (editFunnelData.stages?.length || 0) <= 1 ? 0.25 : 0.8,
                    color: '#ef4444',
                    padding: '4px',
                    flexShrink: 0
                  }}
                  title="Aşamayı Kaldır"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          {(!editFunnelData.stages || editFunnelData.stages.length === 0) && (
            <div style={{ padding: '12px', textAlign: 'center', color: '#ef4444', fontSize: '13px', background: '#fef2f2', borderRadius: '6px', marginTop: '8px' }}>
              En az bir aşama adı eklemeniz gerekmektedir.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
          <button
            type="button"
            onClick={() => setEditingFunnelId(null)}
            style={secondaryBtnStyle}
            disabled={savingEditFunnel}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleUpdateFunnel}
            disabled={savingEditFunnel}
            style={primaryBtnStyle}
          >
            {savingEditFunnel ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
        </div>
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Akışlar (Funnels)</h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Müşteri taleplerinin otomatik yönlendirildiği kanban akışları ve aşamaları.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddFunnel(!showAddFunnel)}
            style={primaryBtnStyle}
          >
            <Plus size={16} /> Yeni Akış Ekle
          </button>
        </div>

        {showAddFunnel && (
          <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 4px 12px rgba(230, 59, 46, 0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>Yeni Akış Oluştur</h4>
              <button
                type="button"
                onClick={() => setShowAddFunnel(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                Akış Adı *
              </label>
              <input
                type="text"
                placeholder="Akış Adı (Örn: VIP Müşteri Takibi, Teknik Servis)*"
                value={newFunnel.name}
                onChange={e => setNewFunnel({ ...newFunnel, name: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                Başlangıç Aşamaları
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {(newFunnel.stages || []).map((stage, sIdx) => (
                  <span
                    key={sIdx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      background: '#f1f5f9',
                      borderRadius: '16px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#334155',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <span>{typeof stage === 'string' ? stage : stage.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveStageFromNewFunnel(sIdx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#64748b', display: 'flex', alignItems: 'center' }}
                      title="Kaldır"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Yeni aşama ekle (örn: Sözleşme İmzalandı)"
                  value={newStageInput}
                  onChange={e => setNewStageInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddStageToNewFunnel();
                    }
                  }}
                  style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '13px' }}
                />
                <button
                  type="button"
                  onClick={handleAddStageToNewFunnel}
                  style={{ ...secondaryBtnStyle, padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} /> Ekle
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
              <button type="button" onClick={() => setShowAddFunnel(false)} style={secondaryBtnStyle}>İptal</button>
              <button type="button" onClick={handleCreateFunnel} disabled={savingFunnel} style={primaryBtnStyle}>
                {savingFunnel ? 'Kaydediliyor...' : 'Akışı Oluştur'}
              </button>
            </div>
          </div>
        )}

        {/* Varsayılan Akış */}
        {defaultFunnel && editingFunnelId === defaultFunnel.id ? (
          renderFunnelEditForm(true)
        ) : (
          <div style={{ border: '1.5px solid #cbd5e1', background: '#f8fafc', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📋</span>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                  {defaultFunnel?.name || 'Genel Müşteri Akışı'} 🔒
                </h3>
                <span style={{ background: '#fef2f2', color: '#E63B2E', fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>Varsayılan</span>
              </div>
              {defaultFunnel && (
                <button
                  type="button"
                  onClick={() => handleStartEditFunnel(defaultFunnel)}
                  style={actionBtnStyle}
                  title="Aşamaları Düzenle"
                >
                  <Edit2 size={12} /> Aşamaları Düzenle
                </button>
              )}
            </div>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Gelen tüm talepler için temel karşılama, bilgi toplama ve yönlendirme süreci.</p>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                Aşamalar ({Array.isArray(defaultFunnel?.stages) ? defaultFunnel.stages.length : 0}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                {Array.isArray(defaultFunnel?.stages) && defaultFunnel.stages.length > 0 ? (
                  defaultFunnel.stages.map((st, sIdx) => (
                    <React.Fragment key={st.id || sIdx}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '16px',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: '#ffffff',
                        color: '#334155',
                        border: `1px solid ${st.color ? st.color + '55' : '#cbd5e1'}`
                      }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: st.color || '#3b82f6' }} />
                        {st.name}
                      </span>
                      {sIdx < defaultFunnel.stages.length - 1 && (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>→</span>
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Yeni Başvuru → İşlemde → Kapandı → Çözüldü</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Diğer Akışlar */}
        {otherFunnels.map(f => (
          editingFunnelId === f.id ? (
            <React.Fragment key={f.id}>
              {renderFunnelEditForm(false)}
            </React.Fragment>
          ) : (
            <div key={f.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fff', borderLeft: `4px solid ${f.color || '#3b82f6'}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>{f.icon || '💼'}</span>
                  <span style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>{f.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleStartEditFunnel(f)}
                    style={actionBtnStyle}
                    title="Düzenle"
                  >
                    <Edit2 size={12} /> Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFunnel(f.id)}
                    style={deleteBtnStyle}
                    title="Sil"
                  >
                    <Trash2 size={12} /> Sil
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                  Aşamalar ({Array.isArray(f.stages) ? f.stages.length : 0}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  {Array.isArray(f.stages) && f.stages.length > 0 ? (
                    f.stages.map((st, sIdx) => (
                      <React.Fragment key={st.id || sIdx}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: 500,
                          background: '#f8fafc',
                          color: '#334155',
                          border: `1px solid ${st.color ? st.color + '55' : '#cbd5e1'}`
                        }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: st.color || '#3b82f6' }} />
                          {st.name}
                        </span>
                        {sIdx < f.stages.length - 1 && (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>→</span>
                        )}
                      </React.Fragment>
                    ))
                  ) : (
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Aşama tanımlanmamış</span>
                  )}
                </div>
              </div>
            </div>
          )
        ))}
      </div>
    );
  };

  const renderSablonlar = () => {
    const resolveTemplateVariables = (text) => {
      if (!text) return '';
      const agentName = bots?.[0]?.name || newBot?.name || 'Insta';
      const fName = companyName || currentWorkspace?.companyName || currentWorkspace?.name || 'Firmamız';
      const web = companyWebsite || currentWorkspace?.companyWebsite || 'www.firma.com';
      const maps = googleMapsUrl || currentWorkspace?.googleMapsUrl || 'https://maps.google.com';
      const addr = companyAddress || currentWorkspace?.companyAddress || 'Merkez Ofis Adresi';
      const hours = companyHours || currentWorkspace?.companyWorkingHours || 'Hafta içi 09:00 - 18:00';

      return text
        .replace(/\{AI_AGENT_ISMI\}|\{AI Agent İsmi\}|\{\{agent_name\}\}|\{ASISTAN_ADI\}/gi, agentName)
        .replace(/\{FIRMA_ADI\}|\{Firma Adı\}|\{\{company_name\}\}/gi, fName)
        .replace(/\{WEB_SITESI\}|\{web site linki\}|\{\{website\}\}/gi, web)
        .replace(/\{KONUM_LINKI\}|\{konum\}|\{\{location\}\}/gi, maps)
        .replace(/\{ADRES\}|\{adres\}|\{\{address\}\}/gi, addr)
        .replace(/\{CALISMA_SAATLERI\}|\{çalışma saatleri\}|\{calisma_saatleri\}|\{\{working_hours\}\}/gi, hours);
    };

    const handleAutoFillWithCompanyData = () => {
      setWizardTemplates(prev => ({
        ...prev,
        callSuccess: {
          ...prev.callSuccess,
          content: resolveTemplateVariables(prev.callSuccess.content)
        },
        callFailed: {
          ...prev.callFailed,
          content: resolveTemplateVariables(prev.callFailed.content)
        },
        location: {
          ...prev.location,
          content: resolveTemplateVariables(prev.location.content)
        }
      }));
      showSuccess('🪄 Firma bilgileriniz (Adres, Harita, Web, Çalışma Saatleri) şablonlara otomatik aktarıldı!');
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '740px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Şablonlar & Hazır Mesajlar</h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>
              Akış ve otomasyonlarda kullanılacak hazır WhatsApp ve AI Arama şablonlarını özelleştirin.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoFillWithCompanyData}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
              whiteSpace: 'nowrap'
            }}
          >
            <Sparkles size={14} /> 🪄 Firma Bilgilerimle Otomatik Doldur
          </button>
        </div>

        {/* Bilgilendirme Notu */}
        <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '12px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} color="#2563eb" />
          <span>
            <strong>Otomatik Değişken Doldurma:</strong> {`Parantez içindeki {ADRES}, {KONUM_LINKI}, {WEB_SITESI}, {CALISMA_SAATLERI}, {FIRMA_ADI} etiketleri 1. Adımda girdiğiniz verilerden otomatik olarak çekilir. İsterseniz yukarıdaki butona basarak metin kutularını hemen doldurabilirsiniz.`}
          </span>
        </div>

        {/* 1. Arama Başarılı Şablonu */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📞</span>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                Arama Başarılı Şablonu
              </h4>
            </div>
            <span style={{ fontSize: '11px', color: '#2563eb', fontFamily: 'monospace', fontWeight: 600 }}>/arama-basarili</span>
          </div>
          <textarea
            rows={5}
            value={wizardTemplates.callSuccess.content}
            onChange={e => setWizardTemplates({
              ...wizardTemplates,
              callSuccess: { ...wizardTemplates.callSuccess, content: e.target.value }
            })}
            style={{ ...inputStyle, resize: 'vertical', fontSize: '12px', lineHeight: 1.5 }}
          />
          {/* Canlı Önizleme */}
          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <span>📱</span> Müşteriye Gidecek Canlı Mesaj (Otomatik Çözümlenmiş Hali):
            </div>
            <div style={{ color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.4, fontSize: '12px' }}>
              {resolveTemplateVariables(wizardTemplates.callSuccess.content)}
            </div>
          </div>
        </div>

        {/* 2. Arama Başarısız Şablonu */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📵</span>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                Arama Başarısız / Ulaşılamadı Şablonu
              </h4>
            </div>
            <span style={{ fontSize: '11px', color: '#2563eb', fontFamily: 'monospace', fontWeight: 600 }}>/arama-basarisiz</span>
          </div>
          <textarea
            rows={4}
            value={wizardTemplates.callFailed.content}
            onChange={e => setWizardTemplates({
              ...wizardTemplates,
              callFailed: { ...wizardTemplates.callFailed, content: e.target.value }
            })}
            style={{ ...inputStyle, resize: 'vertical', fontSize: '12px', lineHeight: 1.5 }}
          />
          {/* Canlı Önizleme */}
          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <span>📱</span> Müşteriye Gidecek Canlı Mesaj (Otomatik Çözümlenmiş Hali):
            </div>
            <div style={{ color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.4, fontSize: '12px' }}>
              {resolveTemplateVariables(wizardTemplates.callFailed.content)}
            </div>
          </div>
        </div>

        {/* 3. Konum & Yol Tarifi Şablonu */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📍</span>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                Konum & Adres Şablonu
              </h4>
            </div>
            <span style={{ fontSize: '11px', color: '#2563eb', fontFamily: 'monospace', fontWeight: 600 }}>/konum</span>
          </div>
          <textarea
            rows={5}
            value={wizardTemplates.location.content}
            onChange={e => setWizardTemplates({
              ...wizardTemplates,
              location: { ...wizardTemplates.location, content: e.target.value }
            })}
            style={{ ...inputStyle, resize: 'vertical', fontSize: '12px', lineHeight: 1.5 }}
          />
          {/* Canlı Önizleme */}
          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <span>📱</span> Müşteriye Gidecek Canlı Mesaj (Otomatik Çözümlenmiş Hali):
            </div>
            <div style={{ color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.4, fontSize: '12px' }}>
              {resolveTemplateVariables(wizardTemplates.location.content)}
            </div>
          </div>
        </div>

      </div>
    );
  };

  const renderTakimlar = () => {
    const teamList = Array.isArray(teams) ? teams : [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '740px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Takımlar & Ekipler</h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Vaka ve taleplerin atandığı departmanlar ve ekip üyeleri.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddTeam(!showAddTeam)}
            style={primaryBtnStyle}
          >
            <Plus size={16} /> Yeni Takım Ekle
          </button>
        </div>

        {/* Sub-tabs: Takımlar vs Kişiler */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <button
            type="button"
            onClick={() => setTeamActiveTab('teams')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: teamActiveTab === 'teams' ? '#0f172a' : '#f1f5f9',
              color: teamActiveTab === 'teams' ? '#fff' : '#475569',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            👥 Takımlar & Ekipler ({teamList.length})
          </button>
          <button
            type="button"
            onClick={() => setTeamActiveTab('members')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: teamActiveTab === 'members' ? '#0f172a' : '#f1f5f9',
              color: teamActiveTab === 'members' ? '#fff' : '#475569',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            👤 Kişiler & Personel ({workspaceMembers.length})
          </button>
        </div>

        {teamActiveTab === 'members' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Kullanıcıları birden fazla takıma ve şubeye atayabilirsiniz.
              </div>
              <button
                type="button"
                onClick={() => setShowCreateNewUserModal(true)}
                style={{ ...primaryBtnStyle, fontSize: '12px', padding: '6px 12px' }}
              >
                <UserPlus size={14} /> Yeni Kullanıcı / Personel Ekle
              </button>
            </div>

            {showCreateNewUserModal && (
              <div style={{ border: '1.5px solid #2563eb', borderRadius: '8px', padding: '14px', background: '#eff6ff', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e40af' }}>Yeni Personel Hesabı Oluştur</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Ad Soyad*"
                    value={newUserData.name}
                    onChange={e => setNewUserData({ ...newUserData, name: e.target.value })}
                    style={{ ...inputStyle, fontSize: '12px' }}
                  />
                  <input
                    type="email"
                    placeholder="E-posta Adresi*"
                    value={newUserData.email}
                    onChange={e => setNewUserData({ ...newUserData, email: e.target.value })}
                    style={{ ...inputStyle, fontSize: '12px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowCreateNewUserModal(false)} style={secondaryBtnStyle}>İptal</button>
                  <button type="button" onClick={() => handleCreateAndAddUserToTeam(teamList[0]?.id)} disabled={creatingUser} style={primaryBtnStyle}>
                    {creatingUser ? 'Oluşturuluyor...' : 'Personeli Kaydet'}
                  </button>
                </div>
              </div>
            )}

            {workspaceMembers.length === 0 ? (
              <div style={{ padding: '24px', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', textAlign: 'center' }}>
                Kayıtlı kullanıcı bulunamadı.
              </div>
            ) : (
              workspaceMembers.map(wm => {
                const uid = wm.user?.id || wm.userId || wm.id;
                const uname = wm.user?.name || wm.name || wm.user?.email || 'Personel';
                const uemail = wm.user?.email || wm.email || '';
                const urole = wm.role || wm.user?.role || 'AGENT';

                return (
                  <div key={uid} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#475569', fontSize: '14px' }}>
                          {uname.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>{uname}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{uemail}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '12px', fontWeight: 600 }}>
                        {urole}
                      </span>
                    </div>

                    {/* Takım Atamaları (Multi-select Chips) */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                        👥 Bağlı Olduğu Takımlar:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {teamList.map(t => {
                          const isInTeam = (t.members || []).some(m => (m.user?.id || m.userId) === uid);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                if (isInTeam) {
                                  handleRemoveMemberFromTeam(t.id, uid);
                                } else {
                                  setSelectedMemberUserId(uid);
                                  handleAddMemberToTeam(t.id);
                                }
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '16px',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                border: isInTeam ? '1.5px solid #2563eb' : '1px dashed #cbd5e1',
                                background: isInTeam ? '#eff6ff' : '#fff',
                                color: isInTeam ? '#1d4ed8' : '#64748b'
                              }}
                            >
                              {isInTeam ? <Check size={12} /> : <Plus size={12} />}
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Şube Atamaları */}
                    {branches.length > 0 && (
                      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                          🏬 Bağlı Olduğu Şubeler:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {branches.map(b => (
                            <span
                              key={b.id}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                background: '#fef3c7',
                                color: '#92400e',
                                border: '1px solid #fde68a'
                              }}
                            >
                              📍 {b.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <>
        {showAddTeam && (
          <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Yeni Takım Oluştur</h4>
            <input
              type="text"
              placeholder="Takım Adı (Örn: Satış Ekibi, Teknik Servis, Destek)*"
              value={newTeam.name}
              onChange={e => setNewTeam({ ...newTeam, name: e.target.value })}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Açıklama (Opsiyonel)"
              value={newTeam.description}
              onChange={e => setNewTeam({ ...newTeam, description: e.target.value })}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowAddTeam(false)} style={secondaryBtnStyle}>İptal</button>
              <button type="button" onClick={handleCreateTeam} disabled={savingTeam} style={primaryBtnStyle}>
                {savingTeam ? 'Kaydediliyor...' : 'Takımı Oluştur'}
              </button>
            </div>
          </div>
        )}

        {teamList.length === 0 ? (
          <div style={{ padding: '24px', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', textAlign: 'center' }}>
            Kayıtlı takım bulunamadı. "Yeni Takım Ekle" butonuna basarak ilk takımınızı oluşturabilirsiniz.
          </div>
        ) : (
          teamList.map(team => {
            const members = Array.isArray(team.members) ? team.members : [];
            const isAddingMember = activeTeamMemberAddId === team.id;

            return editingTeamId === team.id ? (
              <div key={team.id} style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>Takımı Düzenle</div>
                <input
                  type="text"
                  placeholder="Takım Adı*"
                  value={editTeamData.name}
                  onChange={e => setEditTeamData({ ...editTeamData, name: e.target.value })}
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="Açıklama"
                  value={editTeamData.description}
                  onChange={e => setEditTeamData({ ...editTeamData, description: e.target.value })}
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setEditingTeamId(null)} style={secondaryBtnStyle}>İptal</button>
                  <button type="button" onClick={handleUpdateTeam} disabled={savingEditTeam} style={primaryBtnStyle}>
                    {savingEditTeam ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
              </div>
            ) : (
              <div key={team.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>👥 {team.name}</span>
                    {team.description && <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{team.description}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleStartEditTeam(team)}
                      style={actionBtnStyle}
                      title="Takımı Düzenle"
                    >
                      <Edit2 size={12} /> Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTeam(team.id)}
                      style={deleteBtnStyle}
                      title="Takımı Sil"
                    >
                      <Trash2 size={12} /> Sil
                    </button>
                  </div>
                </div>

                {/* Ekip Üyeleri Bölümü */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                      Ekip Üyeleri ({members.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTeamMemberAddId(isAddingMember ? null : team.id);
                        setShowCreateNewUserModal(false);
                      }}
                      style={{ ...actionBtnStyle, background: '#eff6ff', borderColor: '#bfdbfe', color: '#2563eb' }}
                    >
                      <UserPlus size={12} /> {isAddingMember ? 'Kapat' : 'Kullanıcı / Üye Ekle'}
                    </button>
                  </div>

                  {members.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                      Bu takıma henüz atanmış kullanıcı yok.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {members.map(m => {
                        const mUserId = m.user?.id || m.userId;
                        const mName = m.user?.name || m.name || m.user?.email || 'Üye';
                        const isLeader = m.role === 'LEADER';

                        return (
                          <div
                            key={m.id || mUserId}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: '16px',
                              padding: '3px 8px',
                              fontSize: '12px',
                              color: '#1e293b'
                            }}
                          >
                            <User size={12} color="#64748b" />
                            <span>{mName}</span>
                            {isLeader && (
                              <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>
                                Lider
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMemberFromTeam(team.id, mUserId)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                              title="Takımdan Çıkar"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Üye Ekleme / Yeni Kullanıcı Paneli */}
                  {isAddingMember && (
                    <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                        Mevcut Çalışma Alanı Kullanıcısını Takıma Ekle
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                          value={selectedMemberUserId}
                          onChange={e => setSelectedMemberUserId(e.target.value)}
                          style={{ ...inputStyle, flex: 1, padding: '7px 10px', fontSize: '13px' }}
                        >
                          <option value="">-- Kullanıcı Seçin --</option>
                          {workspaceMembers.map(wm => {
                            const uid = wm.user?.id || wm.userId || wm.id;
                            const uname = wm.user?.name || wm.name || wm.user?.email || wm.email || 'Kullanıcı';
                            const uemail = wm.user?.email || wm.email || '';
                            const isAlreadyInTeam = members.some(m => (m.user?.id || m.userId) === uid);
                            return (
                              <option key={uid} value={uid} disabled={isAlreadyInTeam}>
                                {uname} {uemail && uname !== uemail ? `(${uemail})` : ''} {isAlreadyInTeam ? '(Zaten Takımda)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAddMemberToTeam(team.id)}
                          disabled={addingTeamMember || !selectedMemberUserId}
                          style={{ ...primaryBtnStyle, padding: '7px 14px', fontSize: '13px', whiteSpace: 'nowrap' }}
                        >
                          {addingTeamMember ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                          {addingTeamMember ? 'Ekleniyor...' : 'Ekle'}
                        </button>
                      </div>

                      {/* Veya Yeni Kullanıcı Oluştur */}
                      <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setShowCreateNewUserModal(!showCreateNewUserModal)}
                          style={{ background: 'none', border: 'none', color: '#E63B2E', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                        >
                          <UserPlus size={13} /> {showCreateNewUserModal ? 'Yeni Kullanıcı Formunu Kapat' : '+ Yeni Kullanıcı Hesabı Oluştur ve Takıma Ekle'}
                        </button>

                        {showCreateNewUserModal && (
                          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                            <input
                              type="text"
                              placeholder="Ad Soyad*"
                              value={newUserData.name}
                              onChange={e => setNewUserData({ ...newUserData, name: e.target.value })}
                              style={{ ...inputStyle, padding: '7px 10px', fontSize: '12px' }}
                            />
                            <input
                              type="email"
                              placeholder="E-posta Adresi*"
                              value={newUserData.email}
                              onChange={e => setNewUserData({ ...newUserData, email: e.target.value })}
                              style={{ ...inputStyle, padding: '7px 10px', fontSize: '12px' }}
                            />
                            <input
                              type="password"
                              placeholder="Şifre (Varsayılan: Password123!)"
                              value={newUserData.password}
                              onChange={e => setNewUserData({ ...newUserData, password: e.target.value })}
                              style={{ ...inputStyle, padding: '7px 10px', fontSize: '12px' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => setShowCreateNewUserModal(false)}
                                style={{ ...secondaryBtnStyle, padding: '5px 10px', fontSize: '12px' }}
                              >
                                İptal
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCreateAndAddUserToTeam(team.id)}
                                disabled={creatingUser}
                                style={{ ...primaryBtnStyle, background: '#0f172a', padding: '5px 12px', fontSize: '12px' }}
                              >
                                {creatingUser ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                                {creatingUser ? 'Oluşturuluyor...' : 'Oluştur ve Takıma Ekle'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        </>
        )}
      </div>
    );
  };

  const renderAgentlar = () => {
    const botList = Array.isArray(bots) ? bots : [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>AI Agentlar</h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>
              Instomer yapay zeka agentının yeteneklerini, karakterini, amacını ve sistem talimatlarını yapılandırın.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddBot(!showAddBot)}
            style={primaryBtnStyle}
          >
            <Plus size={16} /> Yeni AI Agent Ekle
          </button>
        </div>

        {/* Yeni Agent Ekleme Formu */}
        {showAddBot && (
          <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Yeni AI Agent Oluştur</h4>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                placeholder="Agent Adı (Örn: Insta, Satış Temsilcisi)*"
                value={newBot.name}
                onChange={e => setNewBot({ ...newBot, name: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="text"
                placeholder="Rol / Unvan (Örn: Müşteri Temsilcisi, Danışman)"
                value={newBot.role}
                onChange={e => setNewBot({ ...newBot, role: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>

            {/* Karakter ve Amaç Seçimi */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                  🎭 Agent Karakteri & Üslubu
                </label>
                <select
                  value={newBotCharacter}
                  onChange={e => setNewBotCharacter(e.target.value)}
                  style={{ ...inputStyle, fontSize: '12px', padding: '8px' }}
                >
                  <option value="PROFESSIONAL">👔 Profesyonel & Kurumsal (Siz dili, mesafeli)</option>
                  <option value="FRIENDLY">😊 Samimi & Güler Yüzlü (Sıcak, emojili)</option>
                  <option value="SOLUTION_ORIENTED">⚡ Hızlı & Çözüm Odaklı (Net, pratik)</option>
                  <option value="SALES_ORIENTED">🎯 Satış & İkna Odaklı (Fayda odaklı)</option>
                  <option value="CONSULTANT">🩺 Uzman Danışman (Empatik, sakin)</option>
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                  🎯 Agent Amacı & Temel Görevi
                </label>
                <select
                  value={newBotPurpose}
                  onChange={e => setNewBotPurpose(e.target.value)}
                  style={{ ...inputStyle, fontSize: '12px', padding: '8px' }}
                >
                  <option value="ALL_IN_ONE">🌐 Genel Temsilci (Tüm Görevler)</option>
                  <option value="APPOINTMENT">📅 Randevu Oluşturma & Teyit</option>
                  <option value="SUPPORT_FAQ">💬 SSS & Müşteri Desteği</option>
                  <option value="SALES_PRODUCT">🏷️ Ürün & Satış Danışmanı</option>
                  <option value="LEAD_CAPTURE">📋 İletişim & Talep Toplama (Lead)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ ...labelStyle, fontSize: '12px' }}>Sistem Talimatı (Prompt)</label>
              <button
                type="button"
                onClick={() => handleGenerateBotPrompt('new')}
                style={{
                  background: 'linear-gradient(135deg, #E63B2E 0%, #FF4521 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Sparkles size={12} /> 🪄 AI ile Akıllı Prompt Üret
              </button>
            </div>
            <textarea
              placeholder="Agentın müşterilere nasıl hitap edeceği ve davranış kuralları... (Yukarıdaki 'AI ile Akıllı Prompt Üret' butonunu kullanarak otomatik oluşturabilirsiniz)"
              value={newBot.prompt}
              onChange={e => setNewBot({ ...newBot, prompt: e.target.value })}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button type="button" onClick={() => setShowAddBot(false)} style={secondaryBtnStyle}>İptal</button>
              <button type="button" onClick={handleCreateBot} disabled={savingBot} style={primaryBtnStyle}>
                {savingBot ? 'Oluşturuluyor...' : 'AI Agentı Ekle'}
              </button>
            </div>
          </div>
        )}

        {botsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', padding: '20px' }}>
            <Loader2 size={18} className="animate-spin" /> AI Agentlar yükleniyor...
          </div>
        ) : botList.length === 0 ? (
          <div style={{ padding: '30px', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', background: '#f8fafc' }}>
            <Bot size={36} color="#94a3b8" />
            <div>
              <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>Kayıtlı AI Agent Bulunamadı</div>
              <div style={{ fontSize: '13px' }}>Çalışma alanınız için hemen varsayılan AI agentı oluşturabilir veya yeni bir tane ekleyebilirsiniz.</div>
            </div>
            <button
              type="button"
              onClick={handleCreateDefaultBot}
              disabled={savingBot}
              style={{ ...primaryBtnStyle, marginTop: '8px' }}
            >
              {savingBot ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {savingBot ? 'Oluşturuluyor...' : 'Varsayılan AI Agentı Oluştur (Insta)'}
            </button>
          </div>
        ) : (
          botList.map(bot => {
            const isEditing = editingBotId === bot.id;
            const capabilities = bot.capabilities && typeof bot.capabilities === 'object' ? bot.capabilities : {
              appointment: true,
              product: true,
              humanHandoff: true,
              knowledgeBase: true
            };

            return isEditing ? (
              <div key={bot.id} style={{ border: '2px solid #E63B2E', borderRadius: '10px', padding: '18px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit2 size={16} color="#E63B2E" /> AI Agentı Düzenle: {bot.name}
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ ...labelStyle, fontSize: '12px' }}>Agent Adı *</label>
                    <input
                      type="text"
                      value={editBotData.name}
                      onChange={e => setEditBotData({ ...editBotData, name: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ ...labelStyle, fontSize: '12px' }}>Rol / Unvan</label>
                    <input
                      type="text"
                      value={editBotData.role}
                      onChange={e => setEditBotData({ ...editBotData, role: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Karakter ve Amaç Seçimi */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                      🎭 Agent Karakteri & Üslubu
                    </label>
                    <select
                      value={editBotCharacter}
                      onChange={e => setEditBotCharacter(e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '8px' }}
                    >
                      <option value="PROFESSIONAL">👔 Profesyonel & Kurumsal (Siz dili)</option>
                      <option value="FRIENDLY">😊 Samimi & Güler Yüzlü (Sıcak, emojili)</option>
                      <option value="SOLUTION_ORIENTED">⚡ Hızlı & Çözüm Odaklı (Net, pratik)</option>
                      <option value="SALES_ORIENTED">🎯 Satış & İkna Odaklı (Fayda odaklı)</option>
                      <option value="CONSULTANT">🩺 Uzman Danışman (Empatik, sakin)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                      🎯 Agent Amacı & Temel Görevi
                    </label>
                    <select
                      value={editBotPurpose}
                      onChange={e => setEditBotPurpose(e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '8px' }}
                    >
                      <option value="ALL_IN_ONE">🌐 Genel Temsilci (Tüm Görevler)</option>
                      <option value="APPOINTMENT">📅 Randevu Oluşturma & Teyit</option>
                      <option value="SUPPORT_FAQ">💬 SSS & Müşteri Desteği</option>
                      <option value="SALES_PRODUCT">🏷️ Ürün & Satış Danışmanı</option>
                      <option value="LEAD_CAPTURE">📋 İletişim & Talep Toplama (Lead)</option>
                    </select>
                  </div>
                </div>

                {/* Yetenekler */}
                <div>
                  <label style={{ ...labelStyle, fontSize: '13px', marginBottom: '8px', display: 'block' }}>
                    AI Agent Yetenekleri (Hangi işlemleri yapabilir?)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editBotData.capabilities?.appointment !== false}
                        onChange={e => setEditBotData({
                          ...editBotData,
                          capabilities: { ...editBotData.capabilities, appointment: e.target.checked }
                        })}
                      />
                      <span>📅 Randevu Oluşturma</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editBotData.capabilities?.product !== false}
                        onChange={e => setEditBotData({
                          ...editBotData,
                          capabilities: { ...editBotData.capabilities, product: e.target.checked }
                        })}
                      />
                      <span>🏷️ Fiyat & Ürün Bilgisi Verme</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editBotData.capabilities?.humanHandoff !== false}
                        onChange={e => setEditBotData({
                          ...editBotData,
                          capabilities: { ...editBotData.capabilities, humanHandoff: e.target.checked }
                        })}
                      />
                      <span>👥 İnsan Temsilciye Aktarma</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editBotData.capabilities?.knowledgeBase !== false}
                        onChange={e => setEditBotData({
                          ...editBotData,
                          capabilities: { ...editBotData.capabilities, knowledgeBase: e.target.checked }
                        })}
                      />
                      <span>📚 Bilgi Bankasından Yanıtlama</span>
                    </label>
                  </div>
                </div>

                {/* Sistem Davranışı / Prompt */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ ...labelStyle, fontSize: '13px', margin: 0 }}>
                      Sistem Talimatı (Prompt)
                    </label>
                    <button
                      type="button"
                      onClick={() => handleGenerateBotPrompt('edit')}
                      style={{
                        background: 'linear-gradient(135deg, #E63B2E 0%, #FF4521 100%)',
                        color: '#fff',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Sparkles size={12} /> 🪄 AI ile Akıllı Prompt Üret
                    </button>
                  </div>
                  <textarea
                    rows={5}
                    value={editBotData.prompt}
                    onChange={e => setEditBotData({ ...editBotData, prompt: e.target.value })}
                    placeholder="Müşterilere nasıl hitap etmeli, hangi kurallara uymalı..."
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                  <button type="button" onClick={() => setEditingBotId(null)} style={secondaryBtnStyle}>İptal</button>
                  <button type="button" onClick={handleUpdateBot} disabled={savingEditBot} style={primaryBtnStyle}>
                    {savingEditBot ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
              </div>
            ) : (
              <div key={bot.id} style={{ border: '2px solid #E63B2E', borderRadius: '10px', padding: '18px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AIIcon />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>{bot.name}</span>
                        <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                          {bot.role || 'Müşteri Temsilcisi'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        Yapay Zeka Destekli Müşteri Yanıtlama & Karşılama Agentı
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {bot.isActive ? (
                      <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 700, background: '#dcfce7', padding: '3px 10px', borderRadius: '12px' }}>
                        ✅ Sistemde Aktif
                      </span>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 700, background: '#f1f5f9', padding: '3px 10px', borderRadius: '12px' }}>
                        ⏸️ Pasif
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleBotStatus(bot)}
                      style={{ ...actionBtnStyle, fontSize: '11px' }}
                      title="Durumu Değiştir"
                    >
                      {bot.isActive ? 'Durdur' : 'Aktif Et'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditBot(bot)}
                      style={actionBtnStyle}
                      title="Agentı Düzenle"
                    >
                      <Edit2 size={12} /> Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBot(bot.id)}
                      style={deleteBtnStyle}
                      title="Agentı Sil"
                    >
                      <Trash2 size={12} /> Sil
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  {/* Yetenekler */}
                  <div>
                    <label style={labelStyle}>AI Agent Yetenekleri</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', marginTop: '6px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '6px', background: capabilities.appointment !== false ? '#ecfdf5' : '#f8fafc', color: capabilities.appointment !== false ? '#065f46' : '#94a3b8', border: `1px solid ${capabilities.appointment !== false ? '#a7f3d0' : '#e2e8f0'}` }}>
                        {capabilities.appointment !== false ? '✓' : '✗'} Randevu Oluşturma
                      </span>
                      <span style={{ padding: '3px 10px', borderRadius: '6px', background: capabilities.product !== false ? '#ecfdf5' : '#f8fafc', color: capabilities.product !== false ? '#065f46' : '#94a3b8', border: `1px solid ${capabilities.product !== false ? '#a7f3d0' : '#e2e8f0'}` }}>
                        {capabilities.product !== false ? '✓' : '✗'} Fiyat Bilgisi Verme
                      </span>
                      <span style={{ padding: '3px 10px', borderRadius: '6px', background: capabilities.humanHandoff !== false ? '#ecfdf5' : '#f8fafc', color: capabilities.humanHandoff !== false ? '#065f46' : '#94a3b8', border: `1px solid ${capabilities.humanHandoff !== false ? '#a7f3d0' : '#e2e8f0'}` }}>
                        {capabilities.humanHandoff !== false ? '✓' : '✗'} İnsan Temsilciye Aktarma
                      </span>
                      <span style={{ padding: '3px 10px', borderRadius: '6px', background: capabilities.knowledgeBase !== false ? '#ecfdf5' : '#f8fafc', color: capabilities.knowledgeBase !== false ? '#065f46' : '#94a3b8', border: `1px solid ${capabilities.knowledgeBase !== false ? '#a7f3d0' : '#e2e8f0'}` }}>
                        {capabilities.knowledgeBase !== false ? '✓' : '✗'} Bilgi Bankasından Yanıtlama
                      </span>
                    </div>
                  </div>

                  {/* Sistem Talimatı / Davranışı */}
                  <div>
                    <label style={labelStyle}>AI Agent Sistem Davranışı & Talimatı</label>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', lineHeight: 1.4, background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      {bot.prompt ? bot.prompt : 'AI Agent, Bilgi Bankası adımında eklediğiniz tüm web sitesi ve metin verilerini kullanarak müşterilerin sorularını kurumsal dilde yanıtlar.'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  const renderOzet = () => {
    const rawCompiledText = compiledKb?.text || getClientCompiledKbText();
    const charCount = rawCompiledText ? rawCompiledText.length : 0;
    const wordCount = rawCompiledText ? rawCompiledText.split(/\s+/).filter(Boolean).length : 0;

    const displayBranches = (compiledKb?.structuredData?.branches && compiledKb.structuredData.branches.length > 0)
      ? compiledKb.structuredData.branches
      : (Array.isArray(branches) ? branches : []);

    const displayKbEntries = (compiledKb?.structuredData?.kbEntries && compiledKb.structuredData.kbEntries.length > 0)
      ? compiledKb.structuredData.kbEntries
      : (Array.isArray(kbEntries) ? kbEntries : []);

    const displayCategories = (compiledKb?.structuredData?.categories && compiledKb.structuredData.categories.length > 0)
      ? compiledKb.structuredData.categories
      : (Array.isArray(categories) ? categories : []);

    const displayProducts = (compiledKb?.structuredData?.products && compiledKb.structuredData.products.length > 0)
      ? compiledKb.structuredData.products
      : (Array.isArray(products) ? products : []);

    const displayResources = (compiledKb?.structuredData?.resources && compiledKb.structuredData.resources.length > 0)
      ? compiledKb.structuredData.resources
      : (Array.isArray(resources) ? resources : []);

    const displayFunnels = (compiledKb?.structuredData?.funnels && compiledKb.structuredData.funnels.length > 0)
      ? compiledKb.structuredData.funnels
      : (Array.isArray(funnels) ? funnels : []);

    const displayTeams = (compiledKb?.structuredData?.teams && compiledKb.structuredData.teams.length > 0)
      ? compiledKb.structuredData.teams
      : (Array.isArray(teams) ? teams : []);

    const displayBots = (compiledKb?.structuredData?.bots && compiledKb.structuredData.bots.length > 0)
      ? compiledKb.structuredData.bots
      : (Array.isArray(bots) ? bots : []);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '960px', width: '100%', paddingBottom: '32px' }}>
        {/* Tebrikler / Durum Banner */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '20px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle2 size={26} color="#16a34a" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 700, color: '#14532d' }}>Harika! Kurulumunuz Başarıyla Hazırlandı</h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#166534', lineHeight: 1.5 }}>
              Tüm adımlarda girdiğiniz firma detayları, çalışma saatleri, belgeler, şubeler, kategoriler, ürünler, kaynaklar, akışlar ve takımlar <strong>birleşik Bilgi Bankası (AI Hafızası)</strong> olarak derlendi.
            </p>
          </div>
        </div>

        {/* 10 Adım Özet Metrikleri */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Firma Adı', val: companyName || currentWorkspace?.name || 'Instomer', icon: <Building2 size={15} color="#64748b" /> },
            { label: 'Çalışma Saatleri (7 Gün)', val: companyHours ? (companyHours.length > 28 ? companyHours.slice(0, 26) + '...' : companyHours) : 'Tanımlı', icon: <Clock size={15} color="#64748b" /> },
            { label: 'Bilgi Bankası', val: `${displayKbEntries.length} Kaynak Aktif`, icon: <Book size={15} color="#64748b" /> },
            { label: 'Şubeler', val: `${displayBranches.length} Şube`, icon: <MapPin size={15} color="#64748b" /> },
            { label: 'Kategoriler', val: `${displayCategories.length} Kategori`, icon: <Folder size={15} color="#64748b" /> },
            { label: 'Ürün & Portföy', val: `${displayProducts.length} Kalem`, icon: <Package size={15} color="#64748b" /> },
            { label: 'Kaynaklar & Uzmanlar', val: `${displayResources.length} Kaynak`, icon: <UserCircle size={15} color="#64748b" /> },
            { label: 'Satış Akışları', val: `${displayFunnels.length || 1} Akış Aktif`, icon: <Workflow size={15} color="#64748b" /> },
            { label: 'Departman & Ekipler', val: `${displayTeams.length || 1} Takım`, icon: <Users size={15} color="#64748b" /> },
            { label: 'AI Asistan', val: `${displayBots.filter(b => b.isActive).length} Asistan Aktif`, icon: <Bot size={15} color="#64748b" /> },
          ].map((item, i) => (
            <div key={i} style={{ border: '1px solid #e2e8f0', padding: '12px 14px', borderRadius: '10px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '11px', fontWeight: 600 }}>
                {item.icon}
                <span>{item.label}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={typeof item.val === 'string' ? item.val : ''}>
                {item.val}
              </div>
            </div>
          ))}
        </div>

        {/* BİLGİ BANKASI SON HALİ (TÜM ADIMLARIN BİRLEŞİK AI HAFIZASI) */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#fff', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
          {/* Bölüm Başlığı & Tab Kontrolleri */}
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em' }}>
                  <Sparkles size={12} /> BİRLEŞİK AI HAFIZASI
                </span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Bilgi Bankasının Son Hali (Tüm Adımlar)
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                AI asistanınız ve çalışma ortamınız bu ortak hafızayı kullanarak müşterilerinizle kurumsal dilde iletişim kurar.
              </p>
            </div>

            {/* Sağ Taraf: Sekmeler & Eylemler */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: '#e2e8f0', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                <button
                  type="button"
                  onClick={() => setOzetTab('structured')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: ozetTab === 'structured' ? '#fff' : 'transparent',
                    color: ozetTab === 'structured' ? '#0f172a' : '#64748b',
                    boxShadow: ozetTab === 'structured' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  📋 Adım Adım Detaylar
                </button>
                <button
                  type="button"
                  onClick={() => setOzetTab('rawText')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: ozetTab === 'rawText' ? '#fff' : 'transparent',
                    color: ozetTab === 'rawText' ? '#0f172a' : '#64748b',
                    boxShadow: ozetTab === 'rawText' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  📜 AI Sistem Metni (Ham Prompt)
                </button>
              </div>

              <button
                type="button"
                onClick={() => fetchCompiledKb()}
                title="Yenile"
                disabled={compiledKbLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={13} style={{ animation: compiledKbLoading ? 'spin 1s linear infinite' : 'none' }} />
                <span>Yenile</span>
              </button>

              <button
                type="button"
                onClick={() => saveUnifiedKnowledgeBase(rawCompiledText, true)}
                disabled={savingCompiledKb}
                title="Tüm adımlardaki bilgileri birleştirip Bilgi Bankası belgesi olarak kaydeder"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: compiledKbSaved ? '#16a34a' : '#E63B2E',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: savingCompiledKb ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                {savingCompiledKb ? (
                  <>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>{compiledKbSaved ? 'Bilgi Bankasına Kaydedildi ✓' : 'Bilgi Bankası Olarak Kaydet'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleCopyKbText(rawCompiledText)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid ' + (copiedKb ? '#86efac' : '#cbd5e1'),
                  background: copiedKb ? '#f0fdf4' : '#fff',
                  color: copiedKb ? '#166534' : '#0f172a',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {copiedKb ? <Check size={14} color="#16a34a" /> : <Copy size={13} />}
                <span>{copiedKb ? 'Kopyalandı!' : 'Metni Kopyala'}</span>
              </button>
            </div>
          </div>

          {/* Tab İçeriği */}
          <div style={{ padding: '22px' }}>
            {/* Canlı Kayıt Durumu Bildirimi */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '18px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Book size={18} color="#16a34a" />
                <span style={{ fontSize: '13px', color: '#14532d', fontWeight: 500 }}>
                  Girdiğiniz tüm bilgiler (Firma, Saatler, Şubeler, Kategoriler, Ürünler, Akışlar, Takımlar) <strong>birleştirilerek Bilgi Bankası (AI Hafızası) belgesi olarak kaydedildi.</strong>
                </span>
              </div>
              <span style={{
                background: compiledKbSaved ? '#dcfce7' : '#fef3c7',
                color: compiledKbSaved ? '#15803d' : '#b45309',
                border: '1px solid ' + (compiledKbSaved ? '#86efac' : '#fde68a'),
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                whiteSpace: 'nowrap'
              }}>
                {compiledKbSaved ? '✓ Bilgi Bankasında Aktif' : '⏳ Otomatik Kaydedildi'}
              </span>
            </div>

            {compiledKbLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '10px', color: '#64748b' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '14px' }}>Birleşik Bilgi Bankası derleniyor...</span>
              </div>
            ) : ozetTab === 'structured' ? (
              /* YAPILANDIRILMIŞ ADIM ADIM GÖRÜNÜM */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. ADIM: FİRMA BİLGİLERİ VE 7 GÜNLÜK SAATLER */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                    <Building2 size={16} color="#E63B2E" />
                    <span>1. Adım: Şirket Bilgileri & 7 Günlük Çalışma Saatleri</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', fontSize: '13px' }}>
                    <div><span style={{ color: '#64748b' }}>Firma: </span><strong>{companyName || currentWorkspace?.name || 'Belirtilmedi'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Sektör: </span><strong>{SECTOR_OPTIONS.find(s => s.value === companyIndustry)?.label || companyIndustry || 'Genel'}</strong></div>
                    {founder && <div><span style={{ color: '#64748b' }}>Kurucu: </span><strong>{founder}</strong></div>}
                    {companyPhone && <div><span style={{ color: '#64748b' }}>Telefon: </span><strong>{companyPhone}</strong></div>}
                    {companyEmail && <div><span style={{ color: '#64748b' }}>E-posta: </span><strong>{companyEmail}</strong></div>}
                    <div><span style={{ color: '#64748b' }}>Web: </span><strong>{companyWebsite || '—'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Adres: </span><strong>{companyAddress || '—'}</strong></div>
                  </div>
                  {businessAreas.length > 0 && (
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Faaliyet Alanları:</span>
                      {businessAreas.map((area, i) => (
                        <span key={i} style={{ fontSize: '11px', background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>{area}</span>
                      ))}
                    </div>
                  )}
                  {serviceRegions.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Hizmet Bölgeleri:</span>
                      {serviceRegions.map((reg, i) => (
                        <span key={i} style={{ fontSize: '11px', background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>📍 {reg}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Haftalık Çalışma Saatleri:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {Array.isArray(weeklySchedule) && weeklySchedule.length > 0 ? (
                        weeklySchedule.map((d, idx) => {
                          const isOpen = d.enabled !== undefined ? d.enabled : d.isOpen;
                          const dayName = d.label || d.day;
                          return (
                            <span key={idx} style={{
                              fontSize: '11px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: isOpen ? '#ecfdf5' : '#f1f5f9',
                              color: isOpen ? '#047857' : '#64748b',
                              border: '1px solid ' + (isOpen ? '#a7f3d0' : '#e2e8f0'),
                              fontWeight: 600
                            }}>
                              {dayName}: {isOpen ? `${d.start} - ${d.end}` : 'Kapalı'}
                            </span>
                          );
                        })
                      ) : (
                        <span style={{ fontSize: '12px', color: '#0f172a' }}>{companyHours || 'Her gün 09:00 - 18:00'}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. ADIM: BİLGİ BANKASI BELGELERİ */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <Book size={16} color="#E63B2E" />
                      <span>2. Adım: Bilgi Bankası Belgeleri & Metin Kaynakları</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{displayKbEntries.length} Kaynak</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Birleşik Hafıza Kaydı Rozeti */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <Sparkles size={16} color="#16a34a" />
                        <span style={{ fontWeight: 700, color: '#166534' }}>🏢 Kurumsal Bilgi Tabanı & AI Hafızası (Tüm Adımlar Birleşik)</span>
                      </div>
                      <span style={{ fontSize: '11px', background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
                        BİRLEŞİK SİSTEM HAFIZASI
                      </span>
                    </div>

                    {displayKbEntries.filter(kb => kb.sourceType !== 'UNIFIED_SYSTEM').slice(0, 7).map((kb, idx) => (
                      <div key={kb.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                          <FileText size={15} color="#64748b" />
                          <span style={{ fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kb.title || `Belge #${idx + 1}`}</span>
                        </div>
                        <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
                          {kb.sourceType || 'Belge'}
                        </span>
                      </div>
                    ))}
                    {displayKbEntries.filter(kb => kb.sourceType !== 'UNIFIED_SYSTEM').length > 7 && (
                      <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', paddingTop: '4px' }}>
                        + {displayKbEntries.filter(kb => kb.sourceType !== 'UNIFIED_SYSTEM').length - 7} kaynak daha Bilgi Bankasında aktif
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. ADIM: ŞUBELER */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <MapPin size={16} color="#E63B2E" />
                      <span>3. Adım: Hizmet Şubeleri & Lokasyonlar</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{displayBranches.length} Şube</span>
                  </div>
                  {displayBranches.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Merkez ofis / Online tek lokasyon olarak yapılandırıldı.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                      {displayBranches.map((b, idx) => (
                        <div key={b.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 12px', borderRadius: '6px', fontSize: '13px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>{b.name}</div>
                          {b.address && <div style={{ fontSize: '12px', color: '#64748b' }}>📍 {b.address}</div>}
                          {b.phone && <div style={{ fontSize: '12px', color: '#64748b' }}>📞 {b.phone}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. ADIM: KATEGORİLER */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <Folder size={16} color="#E63B2E" />
                      <span>4. Adım: Konu ve Hizmet Kategorileri</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{displayCategories.length} Kategori</span>
                  </div>
                  {displayCategories.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Özel kategori eklenmedi (Genel Danışmanlık geçerli).</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {displayCategories.map((c, idx) => {
                        const catName = typeof c === 'object' ? (c.name || `Kategori #${idx + 1}`) : String(c);
                        return (
                          <span key={c.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', color: '#0f172a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E63B2E' }} />
                            {catName}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 5. ADIM: ÜRÜN & PORTFÖY */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <Package size={16} color="#E63B2E" />
                      <span>5. Adım: Ürün ve Hizmet Portföyü / Fiyatlar</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{displayProducts.length} Kalem</span>
                  </div>
                  {displayProducts.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Özel ürün/portföy tanımlanmadı.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                      {displayProducts.map((p, idx) => {
                        const catLabel = typeof p.category === 'object' ? p.category?.name : (typeof p.category === 'string' ? p.category : (categories.find(c => c.id === p.categoryId)?.name || ''));
                        return (
                          <div key={p.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>{typeof p.name === 'string' ? p.name : (p.name?.name || 'Ürün')}</span>
                              {p.price != null && p.price !== '' && (
                                <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>
                                  {!isNaN(Number(p.price)) ? Number(p.price).toLocaleString('tr-TR') : String(p.price)} {typeof p.currency === 'string' ? p.currency : 'TRY'}
                                </span>
                              )}
                            </div>
                            {catLabel && <div style={{ fontSize: '11px', color: '#64748b' }}>Kategori: {catLabel}</div>}
                            {p.description && typeof p.description === 'string' && <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>{p.description}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 6. ADIM: KAYNAKLAR / DOKTORLAR & HİZMET ALANLARI */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <UserCircle size={16} color="#E63B2E" />
                      <span>6. Adım: Kaynaklar / Doktorlar & Hizmet Alanları</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{displayResources.length} Kaynak</span>
                  </div>
                  {displayResources.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Özel kaynak tanımlanmadı (Genel rezervasyon geçerli).</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                      {displayResources.map((r, idx) => (
                        <div key={r.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                              {r.title ? `${r.title} ` : ''}{r.name}
                            </span>
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                              {RESOURCE_TYPE_MAP[r.type] || r.type || 'Kişi'}
                            </span>
                          </div>
                          {r.description && <div style={{ fontSize: '12px', color: '#0284c7', fontWeight: 500 }}>{r.description}</div>}
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Mesai: {r.availableStart || '09:00'} - {r.availableEnd || '18:00'} ({r.slotMinutes || 30} dk)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 7. ADIM: AKIŞLAR & AŞAMALAR */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <Workflow size={16} color="#E63B2E" />
                      <span>7. Adım: Satış & Müşteri Aşamaları (Akışlar)</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{displayFunnels.length || 1} Akış</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(displayFunnels.length > 0 ? displayFunnels : [{ name: 'Standart Satış Akışı', stages: [{ title: 'Yeni Talep' }, { title: 'İletişime Geçildi' }, { title: 'Teklif' }, { title: 'Randevu' }, { title: 'Satış Başarılı' }] }]).map((funnel, idx) => (
                      <div key={funnel.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px 14px', borderRadius: '8px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px', marginBottom: '8px' }}>
                          {funnel.name || `Akış #${idx + 1}`}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                          {(Array.isArray(funnel.stages) ? funnel.stages : []).map((stg, sIdx) => {
                            const stageTitle = typeof stg === 'object' ? (stg.title || stg.name || `Aşama ${sIdx + 1}`) : String(stg);
                            return (
                              <React.Fragment key={stg.id || sIdx}>
                                <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '12px', padding: '4px 10px', borderRadius: '6px', fontWeight: 600 }}>
                                  {sIdx + 1}. {stageTitle}
                                </span>
                                {sIdx < (funnel.stages || []).length - 1 && (
                                  <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>→</span>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 8. ADIM: TAKIMLAR & EKİPLER */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <Users size={16} color="#E63B2E" />
                      <span>8. Adım: Departmanlar & Uzman Takımlar</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{displayTeams.length || 1} Takım</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    {(displayTeams.length > 0 ? displayTeams : [{ name: 'Satış & Danışmanlık Ekibi', members: [{ user: { name: 'Müşteri Temsilcisi' } }] }]).map((t, idx) => {
                      const leaderMember = Array.isArray(t.members) ? t.members.find(m => m?.isLeader) : null;
                      const leaderName = leaderMember?.user?.name || leaderMember?.user?.email || (typeof t.leader === 'object' ? (t.leader?.name || t.leader?.email) : (typeof t.leader === 'string' ? t.leader : ''));
                      return (
                        <div key={t.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px', marginBottom: '4px' }}>{t.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            👥 {(Array.isArray(t.members) ? t.members.length : 0)} Ekip Üyesi {leaderName ? ` • Lider: ${leaderName}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 9. ADIM: AI ASİSTAN */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <Bot size={16} color="#E63B2E" />
                      <span>9. Adım: Yetkili AI Asistan</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700, background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                      ● Aktif
                    </span>
                  </div>
                  {displayBots.length > 0 ? (
                    displayBots.map((b, idx) => (
                      <div key={b.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px 14px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>{b.name}</span>
                          <span style={{ fontSize: '12px', color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>{b.role || 'Müşteri Danışmanı'}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '8px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          <strong>Sistem Talimatı:</strong> {b.prompt || 'Müşterilere kurumsal dilde yardımcı olur ve bilgi bankasındaki kaynakları temel alır.'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px 14px', borderRadius: '6px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>Insta (Kurumsal AI Asistan)</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                        Bilgi Bankası ve diğer adımlardaki tüm kurumsal verileri kullanarak 7/24 kesintisiz müşteri desteği sağlar.
                      </div>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              /* AI SİSTEM METNİ / PROMPT (HAM METİN) GÖRÜNÜMÜ */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f1f5f9', borderRadius: '8px', fontSize: '12px', color: '#475569' }}>
                  <span>
                    Bu metin, AI modelinin sistem talimatına (system prompt) enjekte edilen <strong>nihai birleşik şirket hafızasıdır</strong>.
                  </span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    {charCount.toLocaleString('tr-TR')} karakter • ~{wordCount.toLocaleString('tr-TR')} kelime
                  </span>
                </div>

                <div style={{ position: 'relative' }}>
                  <pre style={{
                    margin: 0,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '20px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '540px',
                    overflowY: 'auto',
                    border: '1px solid #1e293b'
                  }}>
                    {rawCompiledText || '(Bilgi bankası metni oluşturuluyor...)'}
                  </pre>
                  <button
                    type="button"
                    onClick={() => handleCopyKbText(rawCompiledText)}
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      backdropFilter: 'blur(4px)'
                    }}
                  >
                    {copiedKb ? <Check size={12} color="#86efac" /> : <Copy size={12} />}
                    <span>{copiedKb ? 'Kopyalandı!' : 'Kopyala'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STANDART HAZIR MESAJLAR & META ŞABLONLARI ÖNİZLEMESİ */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#fff', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="#E63B2E" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  Standart İletişim & Meta Şablonları (Hazır Mesajlar)
                </h3>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Girdiğiniz firma bilgileri ve AI Asistanınız ile dinamik olarak derlenen, sohbet ve arama sonrası otomatik kullanılacak şablonlar:
              </p>
            </div>
            <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1d4ed8', padding: '3px 8px', borderRadius: '12px', fontWeight: 600 }}>
              Otomatik Aktif
            </span>
          </div>

          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* Arama Başarılı */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px', color: '#1e293b' }}>📞 Arama Başarılı</strong>
                <span style={{ fontSize: '11px', color: '#2563eb', fontFamily: 'monospace', fontWeight: 600 }}>/arama-basarili</span>
              </div>
              <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', whiteSpace: 'pre-wrap' }}>
                {`Merhaba, ben ${bots?.[0]?.name || 'Insta'}. Bugün değerli vaktinizi ayırıp bizimle görüştüğünüz için teşekkür ederiz.

Arama başarıyla gerçekleştirildi. Profesyonel yolculuğunuzda, en doğru sonuçlarla yanınızdayız.

🌐 *Web Sitemiz:* ${companyWebsite || 'Web sitemiz'}
📍 *Kulüp Konumumuz:* ${googleMapsUrl || companyAddress || 'Harita konumu'}

Aklınıza takılan her soruda bir mesaj uzağınızdayım. En yakın zamanda görüşmek üzere!`}
              </div>
            </div>

            {/* Arama Başarısız */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px', color: '#1e293b' }}>❌ Arama Başarısız</strong>
                <span style={{ fontSize: '11px', color: '#2563eb', fontFamily: 'monospace', fontWeight: 600 }}>/arama-basarisiz</span>
              </div>
              <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', whiteSpace: 'pre-wrap' }}>
                {`Merhaba, ben ${bots?.[0]?.name || 'Insta'}. Size telefon üzerinden ulaşmaya çalıştık ancak görüşme sağlayamadık.

Müsait olduğunuzda bu mesaj üzerinden bize yazabilir veya doğrudan web sitemizi ziyaret edebilirsiniz:

🌐 *Web Sitemiz:* ${companyWebsite || 'Web sitemiz'}
📍 *Kulüp Konumumuz:* ${googleMapsUrl || companyAddress || 'Harita konumu'}

Size yardımcı olmaktan mutluluk duyarız!`}
              </div>
            </div>

            {/* Konum ve Adres */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px', color: '#1e293b' }}>📍 Konum & Adres</strong>
                <span style={{ fontSize: '11px', color: '#2563eb', fontFamily: 'monospace', fontWeight: 600 }}>/konum</span>
              </div>
              <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', whiteSpace: 'pre-wrap' }}>
                {`Merhaba! Şirketimizin / kulübümüzün konum ve adres bilgileri aşağıda yer almaktadır:

🏢 *Adres:* ${companyAddress || 'Adres bilgisi'}
📍 *Google Haritalar:* ${googleMapsUrl || 'Harita linki'}
🌐 *Web Sitemiz:* ${companyWebsite || 'Web sitemiz'}

Ziyaretinizi sabırsızlıkla bekliyoruz!`}
              </div>
            </div>
          </div>

          <div style={{ padding: '10px 20px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0', fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>ℹ️</span>
            <span>
              Bu şablonlar "Hazır Mesajlar" veritabanına otomatik olarak işlenir. WhatsApp hattınız bağlandığında Şablonlar sayfasından tek tıkla Meta onayına da aktarabilirsiniz.
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (STEPS[activeStep].key) {
      case 'firma': return renderFirma();
      case 'kb': return renderKB();
      case 'subeler': return renderSubeler();
      case 'kategoriler': return renderKategoriler();
      case 'urunler': return renderUrunler();
      case 'kaynaklar': return renderKaynaklar();
      case 'kanallar': return renderKanallar();
      case 'akislar': return renderAkislar();
      case 'sablonlar': return renderSablonlar();
      case 'takimlar': return renderTakimlar();
      case 'agentlar': return renderAgentlar();
      case 'ozet': return renderOzet();
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', width: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', overflow: 'hidden' }}>

      {/* Left Sidebar */}
      <div style={{ width: '260px', minWidth: '260px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '20px 0', boxSizing: 'border-box' }}>
        <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="#E63B2E" />
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Hızlı Kurulum</h2>
          </div>
          <button onClick={() => navigate('/base')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="Kapat">
            <X size={18} color="#64748b" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {STEPS.map((step, index) => {
            const isActive = index === activeStep;
            const isDone = index < activeStep;

            return (
              <div
                key={step.key}
                onClick={() => {
                  if (activeStep === 0 && index !== 0) {
                    handleSaveCompanyData(true);
                  }
                  setActiveStep(index);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  position: 'relative',
                  background: isActive ? '#fff' : 'transparent',
                  borderRight: isActive ? '3px solid #E63B2E' : '3px solid transparent'
                }}
              >
                {/* Vertical line connector */}
                {index > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '26px',
                    width: '2px',
                    height: '20px',
                    background: isDone || isActive ? '#22c55e' : '#e2e8f0',
                    zIndex: 0
                  }} />
                )}

                <div style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: isActive ? '#E63B2E' : isDone ? '#22c55e' : '#cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px',
                  zIndex: 1,
                  boxShadow: '0 0 0 3px ' + (isActive ? '#fff' : '#f8fafc')
                }}>
                  {isDone && <Check size={8} color="#fff" strokeWidth={3} />}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: isActive ? '#E63B2E' : isDone ? '#0f172a' : '#64748b',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '13px'
                }}>
                  {step.icon}
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>İlerleme</span>
            <span style={{ fontWeight: 600 }}>{progress}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#22c55e', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '36px 48px', overflowY: 'auto' }}>
          {renderContent()}
        </div>

        {/* Footer Navigation */}
        <div style={{ padding: '16px 48px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
          {activeStep > 0 ? (
            <button type="button" onClick={handlePrev} style={secondaryBtnStyle}>
              ← Geri
            </button>
          ) : (
            <div></div>
          )}

          {activeStep < STEPS.length - 1 ? (
            <button type="button" onClick={handleNext} style={primaryBtnStyle}>
              İleri <ChevronRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={handleComplete} style={{ ...primaryBtnStyle, background: '#16a34a' }}>
              ✅ Tamamla & Başlat
            </button>
          )}
        </div>
      </div>

      {/* AI Kurulum Modal */}
      {aiSetupModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '620px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #E63B2E 0%, #FF4521 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>AI ile Otomatik Kurulum</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Kurumsal belge yükleyin veya web sitenizi taratın</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setAiSetupModalOpen(false); setAiSetupResult(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Belge Yükleme */}
              <div style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <Upload size={32} color="#E63B2E" />
                <div>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px' }}>Kurumsal Belge Yükleyin</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    PDF, Word (.docx), Excel (.xlsx), CSV veya TXT dosyanızı yükleyin. AI tüm şube, doktor, ürün ve bilgileri otomatik ayrıştırsın.
                  </div>
                </div>
                <label style={{ ...primaryBtnStyle, cursor: 'pointer', marginTop: '6px' }}>
                  {aiSetupLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {aiSetupLoading ? 'Belge Analiz Ediliyor...' : 'Dosya Seç & Analiz Et'}
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
                    onChange={handleAiSetupFileUpload}
                    disabled={aiSetupLoading}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Veya Web URL */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>VEYA</span>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="url"
                  placeholder="Web sitenizin adresi (Örn: https://www.firma.com)"
                  value={aiSetupUrl}
                  onChange={e => setAiSetupUrl(e.target.value)}
                  style={{ ...inputStyle, flex: 1, fontSize: '13px' }}
                />
                <button
                  type="button"
                  onClick={handleAiSetupUrlParse}
                  disabled={aiSetupLoading || !aiSetupUrl.trim()}
                  style={primaryBtnStyle}
                >
                  {aiSetupLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                  {aiSetupLoading ? 'Taranıyor...' : 'Webden Tara'}
                </button>
              </div>

              {/* Ayrıştırma Sonuç Önizlemesi */}
              {aiSetupResult && (
                <div style={{ border: '1.5px solid #bbf7d0', borderRadius: '10px', padding: '16px', background: '#f0fdf4' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 700, fontSize: '14px', marginBottom: '10px' }}>
                    <CheckCircle2 size={18} /> Veriler Başarıyla Çıkarıldı!
                  </div>
                  <div style={{ fontSize: '13px', color: '#1e293b', lineHeight: 1.7, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    <div><strong>🏢 Firma:</strong> {aiSetupResult.company?.name || 'Belirlenemedi'}</div>
                    <div><strong>🏷️ Sektör:</strong> {aiSetupResult.company?.industry || '-'}</div>
                    <div><strong>📍 Şubeler:</strong> {aiSetupResult.branches?.length || 0} şube bulundu</div>
                    <div><strong>📁 Kategoriler:</strong> {aiSetupResult.categories?.length || 0} kategori bulundu</div>
                    <div><strong>📦 Ürünler:</strong> {aiSetupResult.products?.length || 0} ürün/hizmet</div>
                    <div><strong>👤 Uzman/Doktor:</strong> {aiSetupResult.resources?.length || 0} kişi bulundu</div>
                    <div><strong>💬 SSS / Bilgiler:</strong> {aiSetupResult.faq?.length || 0} soru-cevap</div>
                    <div><strong>🕒 Çalışma Saatleri:</strong> {aiSetupResult.weeklySchedule?.schedule ? 'Mevcut' : 'Varsayılan'}</div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px', background: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => { setAiSetupModalOpen(false); setAiSetupResult(null); }}
                style={secondaryBtnStyle}
              >
                İptal
              </button>
              {aiSetupResult && (
                <button
                  type="button"
                  onClick={handleApplyAiSetupToWizard}
                  disabled={aiSetupApplying}
                  style={{ ...primaryBtnStyle, background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}
                >
                  {aiSetupApplying ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {aiSetupApplying ? 'Uygulanıyor...' : 'Tüm Verileri Sihirbaza Aktar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Modal */}
      {showWhatsAppModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setShowWhatsAppModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '750px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageCircle size={22} color="#25D366" />
                WhatsApp Business Ayarları
              </h3>
              <button type="button" onClick={() => setShowWhatsAppModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>
            <WhatsAppSettings
              workspaceId={currentWorkspace?.id}
              aiBots={bots}
              onClose={() => {
                setShowWhatsAppModal(false);
                loadWizardChannels();
              }}
            />
          </div>
        </div>
      )}

      {/* Retell Modal */}
      {showRetellModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setShowRetellModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '850px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Phone size={22} color="#0d9488" />
                Retell AI Sesli Arama Ayarları
              </h3>
              <button type="button" onClick={() => setShowRetellModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>
            <RetellSettings
              onSave={() => loadWizardChannels()}
              hideAgentManager={true}
            />
          </div>
        </div>
      )}

      {/* Web Widget Modal */}
      {showWidgetModal && (
        <WebWidgetModal
          workspaceId={currentWorkspace?.id}
          mode={widgetModalMode}
          widget={selectedWidget}
          onClose={() => { setShowWidgetModal(false); setSelectedWidget(null); }}
          onSave={() => { setShowWidgetModal(false); loadWizardChannels(); }}
        />
      )}

      {/* Facebook / Instagram Page Selection Modal */}
      {showPageSelectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setShowPageSelectModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '560px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {pageSelectChannelType === 'instagram' ? <Instagram size={20} color="#E4405F" /> : <Facebook size={20} color="#1877F2" />}
                {pageSelectChannelType === 'instagram' ? 'Instagram Hesabı Seçin' : 'Facebook Sayfası Seçin'}
              </h3>
              <button type="button" onClick={() => setShowPageSelectModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#64748b' }}>
                Bağlamak istediğiniz {pageSelectChannelType === 'instagram' ? 'Instagram işletme hesaplarını' : 'Facebook sayfalarını'} seçin:
              </p>
              <input
                type="text"
                placeholder="Sayfa ara..."
                value={pageSearchTerm}
                onChange={(e) => setPageSearchTerm(e.target.value)}
                style={{ ...inputStyle, marginBottom: '14px', fontSize: '13px' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {availablePages
                  .filter(page =>
                    page.name.toLowerCase().includes(pageSearchTerm.toLowerCase()) ||
                    page.id.includes(pageSearchTerm)
                  )
                  .map(page => {
                    const isSelected = selectedPages.includes(page.id);
                    return (
                      <div
                        key={page.id}
                        onClick={() => togglePageSelection(page.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: isSelected ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                          background: isSelected ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: isSelected ? 'none' : '2px solid #cbd5e1', background: isSelected ? '#2563eb' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                          {isSelected && <Check size={14} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>{page.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>ID: {page.id}</div>
                          {pageSelectChannelType === 'instagram' && page.instagram_business_account && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#e1306c', fontWeight: 600, marginTop: '2px' }}>
                              <Instagram size={13} />
                              @{page.instagram_business_account.username}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px', background: '#f8fafc' }}>
              <button type="button" onClick={() => setShowPageSelectModal(false)} style={secondaryBtnStyle}>
                İptal
              </button>
              <button
                type="button"
                onClick={handleConnectSelectedPages}
                disabled={selectedPages.length === 0 || connectingPages}
                style={{ ...primaryBtnStyle, background: '#2563eb' }}
              >
                {connectingPages ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {connectingPages ? 'Bağlanıyor...' : `${selectedPages.length} Sayfayı Bağla`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setShowEmailModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '480px', width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={20} color="#EA4335" />
                E-posta Hesabı Bağla
              </h3>
              <button type="button" onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            {!emailProvider ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#64748b' }}>Hangi e-posta sağlayıcısını kullanıyorsunuz?</p>
                <button
                  type="button"
                  onClick={handleGmailConnect}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EA4335' }}>
                    <Mail size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>Google Workspace / Gmail</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Google OAuth ile tek tıkla güvenli bağlantı</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailProvider('imap')}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                    <SettingsIcon size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>Yandex / Outlook / Diğer IMAP</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Kurumsal e-posta veya webmail bağlantısı</div>
                  </div>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>E-posta Sağlayıcı</label>
                  <select
                    value={imapForm.preset}
                    onChange={(e) => handleImapPresetChange(e.target.value)}
                    style={{ ...inputStyle, marginTop: '4px' }}
                  >
                    <option value="yandex">Yandex</option>
                    <option value="outlook">Outlook / Hotmail</option>
                    <option value="custom">Özel (Webmail)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>E-posta Adresi</label>
                  <input
                    type="email"
                    placeholder="ornek@sirket.com"
                    value={imapForm.email}
                    onChange={(e) => setImapForm(prev => ({ ...prev, email: e.target.value }))}
                    style={{ ...inputStyle, marginTop: '4px' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Şifre / Uygulama Şifresi</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={imapForm.password}
                    onChange={(e) => setImapForm(prev => ({ ...prev, password: e.target.value }))}
                    style={{ ...inputStyle, marginTop: '4px' }}
                  />
                </div>
                {imapForm.preset === 'custom' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '8px' }}>
                    <div>
                      <label style={labelStyle}>IMAP Host</label>
                      <input
                        type="text"
                        placeholder="mail.domain.com"
                        value={imapForm.imapHost}
                        onChange={(e) => setImapForm(prev => ({ ...prev, imapHost: e.target.value }))}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Port</label>
                      <input
                        type="number"
                        value={imapForm.imapPort}
                        onChange={(e) => setImapForm(prev => ({ ...prev, imapPort: parseInt(e.target.value) || 993 }))}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      />
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <button type="button" onClick={() => setEmailProvider('')} style={secondaryBtnStyle}>Geri</button>
                  <button
                    type="button"
                    onClick={handleImapConnect}
                    disabled={connectingEmail || !imapForm.email || !imapForm.password}
                    style={{ ...primaryBtnStyle, background: '#EA4335' }}
                  >
                    {connectingEmail ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {connectingEmail ? 'Bağlanıyor...' : 'Bağlan'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const inputStyle = {
  padding: '10px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.2s ease',
  background: '#fff'
};

const labelStyle = {
  fontWeight: '600',
  fontSize: '13px',
  color: '#334155'
};

const primaryBtnStyle = {
  background: '#E63B2E',
  color: '#fff',
  border: 'none',
  padding: '9px 18px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
};

const secondaryBtnStyle = {
  background: '#fff',
  color: '#334155',
  border: '1px solid #cbd5e1',
  padding: '9px 18px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: '500',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const actionBtnStyle = {
  background: '#f8fafc',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  padding: '5px 10px',
  fontSize: '12px',
  fontWeight: 500,
  color: '#334155',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.15s ease'
};

const deleteBtnStyle = {
  background: '#fff',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  padding: '5px 10px',
  fontSize: '12px',
  fontWeight: 500,
  color: '#dc2626',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.15s ease'
};

export default SetupWizard;

