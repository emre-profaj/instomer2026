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
  aiAPI
} from '../../services/api';
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
  RefreshCw
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

const STEPS = [
  { key: 'firma', label: 'Firma', icon: <Building2 size={16} /> },
  { key: 'kb', label: 'Bilgi Bankası', icon: <Book size={16} /> },
  { key: 'subeler', label: 'Şubeler', icon: <MapPin size={16} /> },
  { key: 'kategoriler', label: 'Kategoriler', icon: <Folder size={16} /> },
  { key: 'urunler', label: 'Ürünler', icon: <Package size={16} /> },
  { key: 'akislar', label: 'Akışlar', icon: <Workflow size={16} /> },
  { key: 'takimlar', label: 'Takımlar', icon: <Users size={16} /> },
  { key: 'agentlar', label: 'AI Agentlar', icon: <AIIcon /> },
  { key: 'ozet', label: 'Özet', icon: <CheckCircle2 size={16} /> },
];

const DEFAULT_WEEKLY_SCHEDULE = [
  { key: 'pzt', day: 'Pazartesi', short: 'Pzt', isOpen: true, start: '09:00', end: '18:00' },
  { key: 'sal', day: 'Salı', short: 'Sal', isOpen: true, start: '09:00', end: '18:00' },
  { key: 'car', day: 'Çarşamba', short: 'Çar', isOpen: true, start: '09:00', end: '18:00' },
  { key: 'per', day: 'Perşembe', short: 'Per', isOpen: true, start: '09:00', end: '18:00' },
  { key: 'cum', day: 'Cuma', short: 'Cum', isOpen: true, start: '09:00', end: '18:00' },
  { key: 'cmt', day: 'Cumartesi', short: 'Cmt', isOpen: false, start: '10:00', end: '16:00' },
  { key: 'paz', day: 'Pazar', short: 'Paz', isOpen: false, start: '10:00', end: '16:00' },
];

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
    schedule.forEach(d => { d.isOpen = true; });
  } else {
    if (s.includes('cumartesi') || s.includes('cmt')) {
      if (!s.includes('cumartesi: kapalı') && !s.includes('cmt: kapalı') && !s.includes('cumartesi kapalı')) {
        schedule[5].isOpen = true;
      }
    }
    if (s.includes('pazar') || s.includes('paz')) {
      if (!s.includes('pazar: kapalı') && !s.includes('paz: kapalı') && !s.includes('pazar kapalı')) {
        schedule[6].isOpen = true;
      }
    }
  }
  return schedule;
};

const formatScheduleToString = (schedule) => {
  const openDays = schedule.filter(d => d.isOpen);
  if (openDays.length === 0) return 'Tüm günler kapalı';

  const weekdays = schedule.slice(0, 5);
  const sat = schedule[5];
  const sun = schedule[6];

  const weekdaysAllOpen = weekdays.every(d => d.isOpen);
  const weekdaysSameHours = weekdaysAllOpen && weekdays.every(d => d.start === weekdays[0].start && d.end === weekdays[0].end);

  if (weekdaysSameHours) {
    if (sat.isOpen && sun.isOpen && sat.start === weekdays[0].start && sat.end === weekdays[0].end && sun.start === weekdays[0].start && sun.end === weekdays[0].end) {
      return `Haftanın 7 günü: ${weekdays[0].start} - ${weekdays[0].end}`;
    }
    const parts = [`Pzt - Cum: ${weekdays[0].start} - ${weekdays[0].end}`];
    if (sat.isOpen && sun.isOpen && sat.start === sun.start && sat.end === sun.end) {
      parts.push(`Hafta sonu: ${sat.start} - ${sat.end}`);
    } else {
      if (sat.isOpen) parts.push(`Cumartesi: ${sat.start} - ${sat.end}`);
      else parts.push('Cumartesi: Kapalı');
      if (sun.isOpen) parts.push(`Pazar: ${sun.start} - ${sun.end}`);
      else parts.push('Pazar: Kapalı');
    }
    return parts.join(', ');
  }

  return schedule.map(d => d.isOpen ? `${d.short}: ${d.start} - ${d.end}` : `${d.short}: Kapalı`).join(', ');
};

const SetupWizard = () => {
  const [activeStep, setActiveStep] = useState(0);
  const navigate = useNavigate();
  const { currentWorkspace, user: currentUser } = useAuth();
  const toast = useToast();

  const showSuccess = (msg) => toast?.showSuccess ? toast.showSuccess(msg) : alert(msg);
  const showError = (msg) => toast?.showError ? toast.showError(msg) : alert(msg);

  // 1. Firma Form State
  const [companyName, setCompanyName] = useState(currentWorkspace?.name || '');
  const [companyIndustry, setCompanyIndustry] = useState(currentWorkspace?.industry || 'Emlak / Gayrimenkul');
  const [companyAddress, setCompanyAddress] = useState(currentWorkspace?.companyAddress || '');
  const [companyWebsite, setCompanyWebsite] = useState(currentWorkspace?.companyWebsite || '');
  const [weeklySchedule, setWeeklySchedule] = useState(() => parseScheduleFromString(currentWorkspace?.companyWorkingHours));
  const [companyHours, setCompanyHours] = useState(() => currentWorkspace?.companyWorkingHours || formatScheduleToString(parseScheduleFromString(currentWorkspace?.companyWorkingHours)));

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
        next = next.map((d, i) => i < 5 
          ? { ...d, isOpen: true, start: '09:00', end: '18:00' }
          : { ...d, isOpen: false }
        );
      } else if (presetType === 'weekdays_sat') {
        next = next.map((d, i) => {
          if (i < 5) return { ...d, isOpen: true, start: '09:00', end: '18:00' };
          if (i === 5) return { ...d, isOpen: true, start: '10:00', end: '16:00' };
          return { ...d, isOpen: false };
        });
      } else if (presetType === 'all_week') {
        next = next.map(d => ({ ...d, isOpen: true, start: '09:00', end: '18:00' }));
      }
      setCompanyHours(formatScheduleToString(next));
      return next;
    });
    showSuccess('Çalışma saatleri şablonu uygulandı.');
  };

  const copyDayTimeToWeekdays = (sourceDay) => {
    setWeeklySchedule(prev => {
      const next = prev.map((d, i) => i < 5 ? { ...d, isOpen: true, start: sourceDay.start, end: sourceDay.end } : d);
      setCompanyHours(formatScheduleToString(next));
      return next;
    });
    showSuccess('Pazartesi saatleri hafta içi günlere uygulandı.');
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

  // 9. Özet & Birleşik Bilgi Bankası State
  const [compiledKb, setCompiledKb] = useState(null);
  const [compiledKbLoading, setCompiledKbLoading] = useState(false);
  const [ozetTab, setOzetTab] = useState('structured'); // 'structured' | 'rawText'
  const [copiedKb, setCopiedKb] = useState(false);

  // Load Initial Workspace Data
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const wsId = currentWorkspace.id;

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

  }, [currentWorkspace?.id]);

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

  // Son adım olan 'ozet' adımına geçildiğinde birleşik bilgi bankasını getir
  useEffect(() => {
    if (STEPS[activeStep]?.key === 'ozet' && currentWorkspace?.id) {
      fetchCompiledKb();
    }
  }, [activeStep, currentWorkspace?.id]);

  // Tüm adımlardaki yerel verilerden anında oluşturulan birleşik AI sistem metni
  const getClientCompiledKbText = () => {
    const sections = [];

    // 1. Şirket Bilgileri & 7 Günlük Çalışma Saatleri
    const compLines = [];
    if (companyName) compLines.push(`Firma Adı: ${companyName}`);
    if (companyIndustry) compLines.push(`Sektör / Alan: ${companyIndustry}`);
    if (currentWorkspace?.companyDescription) compLines.push(`Hakkında: ${currentWorkspace.companyDescription}`);
    if (currentWorkspace?.companyPhone) compLines.push(`İletişim Telefon: ${currentWorkspace.companyPhone}`);
    if (currentWorkspace?.companyEmail) compLines.push(`E-posta: ${currentWorkspace.companyEmail}`);
    if (companyWebsite) compLines.push(`Web Sitesi: ${companyWebsite}`);
    if (companyAddress) compLines.push(`Merkez Adres: ${companyAddress}`);
    if (companyHours) {
      compLines.push(`Çalışma Saatleri (7 Gün): ${companyHours}`);
    } else if (Array.isArray(weeklySchedule) && weeklySchedule.length > 0) {
      const scheduleStr = weeklySchedule.map(d => `${d.day}: ${d.isOpen ? `${d.start} - ${d.end}` : 'Kapalı'}`).join(' | ');
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
        const priceStr = p.price ? ` - ${p.price} ${p.currency || 'TRY'}` : '';
        const catStr = p.category ? ` [${p.category}]` : '';
        const descStr = p.description ? `\n   Açıklama: ${p.description}` : '';
        return `${idx + 1}. ${p.name}${priceStr}${catStr}${descStr}`;
      });
      sections.push(`📦 ÜRÜN VE HİZMET PORTFÖYÜ (${products.length} Kalem):\n${pLines.join('\n')}`);
    }

    // 6. Akışlar & Aşamalar
    if (Array.isArray(funnels) && funnels.length > 0) {
      const fLines = funnels.map((f, idx) => {
        const stageList = (f.stages || []).map((s, si) => `   ${si + 1}) ${s.title || s.name || 'Aşama'}`).join('\n');
        return `Akış #${idx + 1}: ${f.name || 'Ana Akış'}${f.description ? ` (${f.description})` : ''}\nAşamalar:\n${stageList || '   (Standart aşamalar)'}`;
      });
      sections.push(`🔄 MÜŞTERİ YOLCULUĞU & SATIŞ AKIŞLARI (${funnels.length} Akış):\n${fLines.join('\n\n')}`);
    }

    // 7. Takımlar & Ekipler
    if (Array.isArray(teams) && teams.length > 0) {
      const tLines = teams.map((t, idx) => {
        const memberCount = (t.members || []).length;
        const leaderStr = t.leader ? ` (Lider: ${t.leader.name || t.leader.email})` : '';
        return `${idx + 1}. ${t.name}${leaderStr} - ${memberCount} Temsilci`;
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
    if (activeStep === 0 && currentWorkspace?.id && companyName) {
      try {
        await workspaceAPI.update(currentWorkspace.id, {
          name: companyName,
          companyAddress,
          companyWebsite,
          companyWorkingHours: companyHours
        });
      } catch (e) {
        console.warn('Auto-save step 1 warning:', e);
      }
    }
    if (activeStep < STEPS.length - 1) setActiveStep(activeStep + 1);
  };

  const handlePrev = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  const handleComplete = async () => {
    try {
      if (currentWorkspace?.id && companyName) {
        await workspaceAPI.update(currentWorkspace.id, {
          name: companyName,
          companyAddress,
          companyWebsite,
          companyWorkingHours: companyHours
        });
      }
      showSuccess('Kurulum adımları başarıyla tamamlandı!');
    } catch (e) {
      console.warn('Workspace update warning:', e);
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
      const loc = res.data?.location || res.data;
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
      if (res.data) setCategories(prev => [...prev, res.data]);
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
      const prod = res.data?.product || res.data;
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
      const updated = res.data?.location || res.data;
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
      const updated = res.data;
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
      const updated = res.data?.product || res.data;
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
      const created = res.data?.funnel || res.data;
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
      const updated = res.data?.funnel || res.data;

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
      const created = res.data?.team || res.data;
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
      const updated = res.data?.team || res.data;
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
      const updated = res.data?.bot || res.data;
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
      const created = res.data?.bot || res.data;
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
      const created = res.data?.bot || res.data;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
      <div>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Firma Bilgileri</h2>
        <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>İşletmenizin genel kimlik ve iletişim detaylarını yapılandırın.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Firma Adı *</label>
        <input
          type="text"
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          placeholder="Örn: Instomer Real Estate"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Sektör</label>
        <select value={companyIndustry} onChange={e => setCompanyIndustry(e.target.value)} style={inputStyle}>
          <option value="Emlak / Gayrimenkul">Emlak / Gayrimenkul</option>
          <option value="Otomotiv">Otomotiv</option>
          <option value="Sağlık / Klinik">Sağlık / Klinik</option>
          <option value="Turizm & Otelcilik">Turizm & Otelcilik</option>
          <option value="Perakende / E-Ticaret">Perakende / E-Ticaret</option>
          <option value="Hizmet & Danışmanlık">Hizmet & Danışmanlık</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={labelStyle}>Lokasyon / Adres</label>
          <input
            type="text"
            value={companyAddress}
            onChange={e => setCompanyAddress(e.target.value)}
            placeholder="Örn: Maslak, Sarıyer / İstanbul"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={labelStyle}>Web Sitesi</label>
          <input
            type="text"
            value={companyWebsite}
            onChange={e => setCompanyWebsite(e.target.value)}
            placeholder="https://www.firma-adiniz.com"
            style={inputStyle}
          />
        </div>
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
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              Hafta İçi (Pzt-Cum)
            </button>
            <button
              type="button"
              onClick={() => applySchedulePreset('weekdays_sat')}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              + Cumartesi
            </button>
            <button
              type="button"
              onClick={() => applySchedulePreset('all_week')}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              7 Gün Açık
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
          {weeklySchedule.map((item, idx) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                borderBottom: idx < weeklySchedule.length - 1 ? '1px solid #f1f5f9' : 'none',
                background: item.isOpen ? '#fff' : '#fbfcfd',
                transition: 'background 0.15s ease',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              {/* Sol: Checkbox + Gün Adı + Rozet */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '170px' }}>
                <input
                  type="checkbox"
                  id={`day-toggle-${item.key}`}
                  checked={item.isOpen}
                  onChange={e => updateDaySchedule(idx, { isOpen: e.target.checked })}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer',
                    accentColor: '#E63B2E'
                  }}
                />
                <label
                  htmlFor={`day-toggle-${item.key}`}
                  style={{
                    fontSize: '13px',
                    fontWeight: item.isOpen ? 600 : 500,
                    color: item.isOpen ? '#1e293b' : '#64748b',
                    cursor: 'pointer',
                    userSelect: 'none',
                    minWidth: '75px'
                  }}
                >
                  {item.day}
                </label>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: item.isOpen ? '#dcfce7' : '#f1f5f9',
                    color: item.isOpen ? '#166534' : '#64748b',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: item.isOpen ? '#22c55e' : '#94a3b8'
                  }} />
                  {item.isOpen ? 'Açık' : 'Kapalı'}
                </span>
              </div>

              {/* Sağ: Saat Seçiciler veya Kapalı Bildirimi */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {item.isOpen ? (
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
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>-</span>
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
          ))}
        </div>

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

      {/* Manuel Ekle */}
      <div style={{ padding: '20px', border: '1.5px solid #e2e8f0', borderRadius: '10px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color="#E63B2E" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>Manuel Ekle</h3>
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
      </div>
    );
  };

  const renderAgentlar = () => {
    const botList = Array.isArray(bots) ? bots : [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>AI Asistanlar</h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>
              Instomer yapay zeka asistanının yeteneklerini, sistem talimatlarını ve kanallarını kontrol edin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddBot(!showAddBot)}
            style={primaryBtnStyle}
          >
            <Plus size={16} /> Yeni Asistan Ekle
          </button>
        </div>

        {/* Yeni Asistan Ekleme Formu */}
        {showAddBot && (
          <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Yeni AI Asistan Oluştur</h4>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                placeholder="Asistan Adı (Örn: Insta, Satış Asistanı)*"
                value={newBot.name}
                onChange={e => setNewBot({ ...newBot, name: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="text"
                placeholder="Rol / Unvan (Örn: Müşteri Temsilcisi)"
                value={newBot.role}
                onChange={e => setNewBot({ ...newBot, role: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, fontSize: '12px' }}>Sistem Talimatı (Prompt)</label>
              <textarea
                placeholder="Asistanın müşterilere nasıl hitap edeceği ve davranış kuralları..."
                value={newBot.prompt}
                onChange={e => setNewBot({ ...newBot, prompt: e.target.value })}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', marginTop: '4px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button type="button" onClick={() => setShowAddBot(false)} style={secondaryBtnStyle}>İptal</button>
              <button type="button" onClick={handleCreateBot} disabled={savingBot} style={primaryBtnStyle}>
                {savingBot ? 'Oluşturuluyor...' : 'Asistanı Ekle'}
              </button>
            </div>
          </div>
        )}

        {botsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', padding: '20px' }}>
            <Loader2 size={18} className="animate-spin" /> AI Asistanlar yükleniyor...
          </div>
        ) : botList.length === 0 ? (
          <div style={{ padding: '30px', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', background: '#f8fafc' }}>
            <Bot size={36} color="#94a3b8" />
            <div>
              <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>Kayıtlı AI Asistan Bulunamadı</div>
              <div style={{ fontSize: '13px' }}>Çalışma alanınız için hemen varsayılan asistanı oluşturabilir veya yeni bir tane ekleyebilirsiniz.</div>
            </div>
            <button
              type="button"
              onClick={handleCreateDefaultBot}
              disabled={savingBot}
              style={{ ...primaryBtnStyle, marginTop: '8px' }}
            >
              {savingBot ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {savingBot ? 'Oluşturuluyor...' : 'Varsayılan AI Asistanı Oluştur (Insta)'}
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
                  <Edit2 size={16} color="#E63B2E" /> Asistanı Düzenle: {bot.name}
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ ...labelStyle, fontSize: '12px' }}>Asistan Adı *</label>
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

                {/* Yetenekler */}
                <div>
                  <label style={{ ...labelStyle, fontSize: '13px', marginBottom: '8px', display: 'block' }}>
                    Asistan Yetenekleri (Hangi işlemleri yapabilir?)
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
                  <label style={{ ...labelStyle, fontSize: '13px', marginBottom: '4px', display: 'block' }}>
                    Sistem Talimatı (Prompt)
                  </label>
                  <textarea
                    rows={4}
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
                        Yapay Zeka Destekli Müşteri Yanıtlama & Karşılama Asistanı
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
                      title="Asistanı Düzenle"
                    >
                      <Edit2 size={12} /> Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBot(bot.id)}
                      style={deleteBtnStyle}
                      title="Asistanı Sil"
                    >
                      <Trash2 size={12} /> Sil
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  {/* Yetenekler */}
                  <div>
                    <label style={labelStyle}>Asistan Yetenekleri</label>
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
                    <label style={labelStyle}>Sistem Davranışı & Talimatı</label>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', lineHeight: 1.4, background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      {bot.prompt ? bot.prompt : 'Asistan, Bilgi Bankası adımında eklediğiniz tüm web sitesi ve metin verilerini kullanarak müşterilerin sorularını kurumsal dilde yanıtlar.'}
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
              Tüm adımlarda girdiğiniz firma detayları, çalışma saatleri, belgeler, şubeler, kategoriler, ürünler, akışlar ve takımlar <strong>birleşik Bilgi Bankası (AI Hafızası)</strong> olarak derlendi.
            </p>
          </div>
        </div>

        {/* 9 Adım Özet Metrikleri */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Firma Adı', val: companyName || currentWorkspace?.name || 'Instomer', icon: <Building2 size={15} color="#64748b" /> },
            { label: 'Çalışma Saatleri (7 Gün)', val: companyHours ? (companyHours.length > 28 ? companyHours.slice(0, 26) + '...' : companyHours) : 'Tanımlı', icon: <Clock size={15} color="#64748b" /> },
            { label: 'Bilgi Bankası', val: `${displayKbEntries.length} Kaynak Aktif`, icon: <Book size={15} color="#64748b" /> },
            { label: 'Şubeler', val: `${displayBranches.length} Şube`, icon: <MapPin size={15} color="#64748b" /> },
            { label: 'Kategoriler', val: `${displayCategories.length} Kategori`, icon: <Folder size={15} color="#64748b" /> },
            { label: 'Ürün & Portföy', val: `${displayProducts.length} Kalem`, icon: <Package size={15} color="#64748b" /> },
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
                    <div><span style={{ color: '#64748b' }}>Sektör: </span><strong>{companyIndustry || 'Emlak / Hizmet'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Web: </span><strong>{companyWebsite || '—'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Adres: </span><strong>{companyAddress || '—'}</strong></div>
                  </div>
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Haftalık Çalışma Saatleri:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {Array.isArray(weeklySchedule) && weeklySchedule.length > 0 ? (
                        weeklySchedule.map((d, idx) => (
                          <span key={idx} style={{
                            fontSize: '11px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: d.isOpen ? '#ecfdf5' : '#f1f5f9',
                            color: d.isOpen ? '#047857' : '#64748b',
                            border: '1px solid ' + (d.isOpen ? '#a7f3d0' : '#e2e8f0'),
                            fontWeight: 600
                          }}>
                            {d.day}: {d.isOpen ? `${d.start} - ${d.end}` : 'Kapalı'}
                          </span>
                        ))
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
                  {displayKbEntries.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Henüz ek belge eklenmedi. Sistem varsayılan kurumsal bilgileri kullanır.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {displayKbEntries.slice(0, 8).map((kb, idx) => (
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
                      {displayKbEntries.length > 8 && (
                        <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', paddingTop: '4px' }}>
                          + {displayKbEntries.length - 8} kaynak daha Bilgi Bankasında aktif
                        </div>
                      )}
                    </div>
                  )}
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
                      {displayCategories.map((c, idx) => (
                        <span key={c.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', color: '#0f172a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E63B2E' }} />
                          {c.name}
                        </span>
                      ))}
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
                      {displayProducts.map((p, idx) => (
                        <div key={p.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>{p.name}</span>
                            {p.price && (
                              <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>
                                {Number(p.price).toLocaleString('tr-TR')} {p.currency || 'TRY'}
                              </span>
                            )}
                          </div>
                          {p.category && <div style={{ fontSize: '11px', color: '#64748b' }}>Kategori: {p.category}</div>}
                          {p.description && <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>{p.description}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. ADIM: AKIŞLAR & AŞAMALAR */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <Workflow size={16} color="#E63B2E" />
                      <span>6. Adım: Satış & Müşteri Aşamaları (Akışlar)</span>
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
                          {(funnel.stages || []).map((stg, sIdx) => (
                            <React.Fragment key={stg.id || sIdx}>
                              <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '12px', padding: '4px 10px', borderRadius: '6px', fontWeight: 600 }}>
                                {sIdx + 1}. {stg.title || stg.name || `Aşama ${sIdx + 1}`}
                              </span>
                              {sIdx < (funnel.stages || []).length - 1 && (
                                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>→</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 7. ADIM: TAKIMLAR & EKİPLER */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <Users size={16} color="#E63B2E" />
                      <span>7. Adım: Departmanlar & Uzman Takımlar</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{displayTeams.length || 1} Takım</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    {(displayTeams.length > 0 ? displayTeams : [{ name: 'Satış & Danışmanlık Ekibi', members: [{ user: { name: 'Müşteri Temsilcisi' } }] }]).map((t, idx) => (
                      <div key={t.id || idx} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px', marginBottom: '4px' }}>{t.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          👥 {(t.members || []).length} Ekip Üyesi {t.leader ? ` • Lider: ${t.leader.name || t.leader.email}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 8. ADIM: AI ASİSTAN */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>
                      <Bot size={16} color="#E63B2E" />
                      <span>8. Adım: Yetkili AI Asistan</span>
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
      case 'akislar': return renderAkislar();
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
                onClick={() => setActiveStep(index)}
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

