import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI, caseAPI, automationAPI, emailAPI, retellAPI, funnelAPI, teamAPI, workspaceAPI, conversationAPI, leadsAPI, aiAPI, appointmentConfigAPI, marketingV2API } from '../../services/api';
import { getTopicCategories } from '../../services/topicCategory.api';
import { activityAPI } from '../../services/activity.api';
import * as XLSX from 'xlsx';
import {
    User,
    Users,
    Search,
    MessageSquare,
    Phone,
    Mail,
    MapPin,
    Building,
    Calendar,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    Bell,
    BookOpen,
    Edit2,
    Smile,
    Filter,
    Clock,
    Check,
    Plus,
    X,
    Trash2,
    Facebook,
    Instagram,
    MessageCircle,
    Copy,
    Archive,
    ArchiveRestore,
    StickyNote,
    Save,
    Download,
    ChevronDown,
    Send,
    PhoneCall,
    Loader,
    Upload,
    Tag,
    BarChart3,
    TrendingUp,
    PhoneOff,
    Eye,
    EyeOff,
    ArrowUpDown,
    Bot,
    UserCheck,
    CircleOff,
    KanbanSquare,
    List,
    FileText,
    ShoppingCart,
    Sparkles,
    ChevronUp,
    Globe,
    Target,
    Activity
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Customers.css';
import '../../components/ContactSidebar/ContactSidebar.css';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import PipelineView from '../Pipeline/Pipeline';
import NewConversationModal from '../../components/NewConversationModal/NewConversationModal';

// Kişinin nereden geldiğini okunur etikete çevirir.
// Kanal kodları (conversations.channel) ile kişi kaynağı (contacts.source)
// aynı şeyi farklı adlarla yazıyor: kanalda LEAD, kaynakta FACEBOOK_LEAD;
// kanalda WIDGET, kaynakta WEB_WIDGET. İkisini tek tabloda topluyoruz.
const KAYNAK_ETIKETLERI = {
    WHATSAPP: 'WhatsApp',
    FACEBOOK: 'Facebook',
    INSTAGRAM: 'Instagram',
    LEAD: 'Facebook Lead',
    FACEBOOK_LEAD: 'Facebook Lead',
    WIDGET: 'Web Widget',
    WEB_WIDGET: 'Web Widget',
    FORM: 'Form',
    WEB_FORM: 'Form',
    FACEBOOK_COMMENT: 'Facebook Yorum',
    INSTAGRAM_COMMENT: 'Instagram Yorum',
    EMAIL: 'E-posta',
    PHONE: 'Telefon',
    INBOUND: 'Gelen Arama',
    RETELL_CALL: 'AI Arama',
    AI_CALL: 'AI Arama',
    SMS: 'SMS',
    GOOGLE: 'Google',
    SOCIAL_MEDIA: 'Sosyal Medya',
    REFERRAL: 'Referans',
    WALK_IN: 'Yüz Yüze',
    EVENT: 'Etkinlik',
    MANUAL: 'Elle Eklendi',
    IMPORT: 'İçe Aktarım',
    SYSTEM: 'Sistem',
    INTERNAL: 'Sistem',
    INTERNAL_CHAT: 'Sistem',
    INTERNAL_SYSTEM: 'Sistem',
    OTHER: 'Diğer'
};

const getContactSourceLabel = (contact) => {
    if (!contact) return '';
    // Önce İLK konuşmanın kanalı: "nereden yazdı" sorusunun doğrudan cevabı.
    const convs = (contact.conversations || [])
        .filter(c => c?.channel)
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const raw = convs[0]?.channel || contact.leadSource || contact.source || '';
    const key = String(raw).toUpperCase();
    return KAYNAK_ETIKETLERI[key] || raw || '';
};

// Türkçe harfleri sadeleştirip karşılaştırmaya hazırlar
const sadeMetin = (v) => String(v || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();

// Lead formunda projeyi taşıyan alan adları. Form adları işletmeden
// işletmeye değişiyor, o yüzden tam eşleşme değil ipucu arıyoruz.
const PROJE_ALAN_IPUCLARI = [
    'konut tipi', 'daire tipi', 'villa tipi', 'ev tipi',
    'proje', 'tercih etti', 'ilgilendiginiz'
];

/**
 * Lead formu mesajını alan/değer çiftlerine çevirir.
 *
 * İki biçim var:
 *   Eski:  "👤 İsim | Semih Tunç"
 *   Yeni:  "▸  Tercih EttiğIniz Konut Tipi?: Mia Life Plus 3+1"
 * Ayrıca "📋  Mia Life Plus Leads-2" satırı formun ADIDIR.
 */
const parseLeadFormMessage = (content) => {
    const alanlar = [];
    let formAdi = '';
    for (const rawLine of String(content || '').split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        // Ayraç satırları
        if (/^[━─=_-]{6,}$/.test(line)) continue;

        if (line.startsWith('📋')) {
            const ad = line.replace(/^📋\s*/, '').replace(/\*\*/g, '').trim();
            if (ad && !formAdi) formAdi = ad;
            continue;
        }

        // Etiket ayracı: önce "|", yoksa ilk ":"
        const temiz = line.replace(/^[▸•*\-\s]+/, '');
        let idx = temiz.indexOf('|');
        let sep = 1;
        if (idx === -1) { idx = temiz.indexOf(':'); sep = 1; }
        if (idx <= 0) continue;

        const label = temiz.slice(0, idx).replace(/[^\p{L}\p{N}\s?]/gu, '').trim();
        const value = temiz.slice(idx + sep).trim();
        if (label && value) alanlar.push({ label, value });
    }
    return { formAdi, alanlar };
};

/**
 * Kişinin projesi / şubesi.
 *
 * Sırayla:
 *   1. Şube kaydı — gayrimenkulde şube = PROJE (sektör etiketi "Şube / Proje")
 *   2. Lead formundaki proje / konut tipi alanı (ör. "Mia Life Plus 3+1")
 *   3. Lead formunun adı (ör. "Mia Park Bornova")
 */
const getContactBranchName = (contact) => {
    if (!contact) return '';

    // 1) Şube
    const cases = [...(contact.cases || [])]
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    const fromCase = cases.find(c => c?.branch?.name)?.branch?.name;
    if (fromCase) return fromCase;

    const convs = [...(contact.conversations || [])]
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const fromConv = [...convs].reverse().find(c => c?.branch?.name)?.branch?.name;
    if (fromConv) return fromConv;

    // 2-3) Lead formu: en eski konuşmadan başla, ilk dolu değeri al
    let formAdiYedek = '';
    for (const conv of convs) {
        const content = conv?.messages?.[0]?.content;
        if (!content) continue;
        const { formAdi, alanlar } = parseLeadFormMessage(content);
        if (formAdi && !formAdiYedek) formAdiYedek = formAdi;

        const eslesen = alanlar.find(a => {
            const l = sadeMetin(a.label);
            return PROJE_ALAN_IPUCLARI.some(ip => l.includes(ip));
        });
        if (eslesen?.value) return eslesen.value;
    }
    return formAdiYedek;
};

export const getContactPrimaryPhone = (contact) => {
    if (!contact) return null;
    const isValid = (num) => {
        if (!num || typeof num !== 'string') return false;
        const cleaned = num.replace(/[\s\-\(\)\.\[\]\"\'\{\}]/g, '').trim();
        const digits = cleaned.replace(/\D/g, '');
        return digits.length >= 7;
    };

    if (isValid(contact.phone)) return contact.phone.trim();

    if (contact.phones) {
        if (Array.isArray(contact.phones)) {
            const found = contact.phones.find(p => isValid(p));
            if (found) return found.trim();
        } else if (typeof contact.phones === 'string') {
            try {
                const parsed = JSON.parse(contact.phones);
                if (Array.isArray(parsed)) {
                    const found = parsed.find(p => isValid(p));
                    if (found) return found.trim();
                }
            } catch {
                if (isValid(contact.phones)) return contact.phones.trim();
            }
        }
    }
    return null;
};

const Customers = () => {
    const { currentWorkspace, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();

    const [viewMode, setViewMode] = useState(() => {
        try { return localStorage.getItem(`customers_viewMode_${currentWorkspace?.id}`) || 'list'; } catch { return 'list'; }
    }); // 'list' | 'card' | 'pipeline'
    const [expandedCards, setExpandedCards] = useState(new Set()); // card view: expanded contact ids
    const [expandedCasesInCard, setExpandedCasesInCard] = useState({}); // card view: { contactId: Set(caseId) }
    const [cardCaseActionMenu, setCardCaseActionMenu] = useState(null); // card view: caseId of open dropdown
    const [quickNotes, setQuickNotes] = useState({}); // card view: { contactId: noteText }

    // Filtre state'leri (sayfa yenilendiğinde sessionStorage'dan okunur) ---
    const FILTER_STORAGE_KEY = `customers_filters_${currentWorkspace?.id || 'default'}`;

    const getSavedFilters = () => {
        try {
            // localStorage: tarayıcı kapatılsa bile filtreler korunur
            const saved = localStorage.getItem(FILTER_STORAGE_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    };

    const savedFilters = useRef(getSavedFilters());
    const sf = savedFilters.current;

    // Assignment filter state (all / mine / unassigned / team_ID / user_ID)
    const [assignmentFilter, setAssignmentFilter] = useState(sf.assignmentFilter || 'all');

    // Quick filter mode for stats bar buttons
    const [quickFilterMode, setQuickFilterMode] = useState(sf.quickFilterMode || 'ALL');

    // Status options

    const CUSTOMER_STATUS_OPTIONS = [
        { value: 'NEW', label: t('contacts.statusNew'), color: '#3b82f6', bg: '#eff6ff' },
        { value: 'INFO_GIVEN', label: 'Bilgi Verildi', color: '#06b6d4', bg: '#ecfeff' },
        { value: 'OPPORTUNITY', label: t('contacts.statusOpportunity'), color: '#f59e0b', bg: '#fffbeb' },
        { value: 'HOT_OPPORTUNITY', label: t('contacts.statusHotOpportunity'), color: '#ef4444', bg: '#fef2f2' },
        { value: 'UNREACHABLE', label: t('contacts.statusUnreachable'), color: '#64748b', bg: '#f8fafc' },
        { value: 'CALLBACK', label: t('contacts.statusCallback'), color: '#0ea5e9', bg: '#f0f9ff' },
        { value: 'OFFER_GIVEN', label: t('contacts.statusOfferGiven'), color: '#8b5cf6', bg: '#f5f3ff' },
        { value: 'APPOINTMENT_SCHEDULED', label: 'Randevu Planlandı', color: '#14b8a6', bg: '#f0fdfa' },
        { value: 'NEGOTIATION', label: t('contacts.statusNegotiation'), color: '#f97316', bg: '#fff7ed' },
        { value: 'CONTRACT', label: t('contacts.statusContract'), color: '#06b6d4', bg: '#ecfeff' },
        { value: 'SALE_COMPLETED', label: t('contacts.statusSaleCompleted'), color: '#10b981', bg: '#ecfdf5' },
        { value: 'LOST', label: t('contacts.statusLost'), color: '#1f2937', bg: '#f9fafb' },
        { value: 'NOT_INTERESTED', label: t('contacts.statusNotInterested'), color: '#9ca3af', bg: '#f3f4f6' },
    ];

    const SOURCE_OPTIONS = [
        { value: 'ALL', label: t('contacts.sourceAll'), icon: Users },
        { value: 'FACEBOOK', label: 'Facebook', icon: Facebook, color: '#1877f2' },
        { value: 'FACEBOOK_LEAD', label: 'Facebook Lead', icon: Facebook, color: '#1877f2' },
        { value: 'INSTAGRAM', label: 'Instagram', icon: Instagram, color: '#e4405f' },
        { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, color: '#25d366' },
        { value: 'WIDGET', label: 'Web Widget', icon: MessageSquare, color: '#6366f1' },
        { value: 'EMAIL', label: t('contacts.sourceEmail'), icon: Mail, color: '#f59e0b' },
        { value: 'WEB_FORM', label: 'Form', icon: FileText, color: '#f97316' },
        { value: 'FORM', label: 'Form', icon: FileText, color: '#f97316' },
        { value: 'LEAD', label: 'Lead', icon: User, color: '#8b5cf6' },
        { value: 'MANUAL', label: t('contacts.sourceManual'), icon: Plus, color: '#6b7280' }
    ];

    const CATEGORY_OPTIONS = [
        { value: 'ALL', label: t('contacts.allCategories'), icon: Users, color: '#6b7280' },
        { value: 'NEW', label: t('contacts.categoryNew'), icon: User, color: '#3b82f6' },
        { value: 'CUSTOMER', label: t('contacts.categoryCustomer'), icon: User, color: '#10b981' },
        { value: 'OPPORTUNITY', label: t('contacts.categoryOpportunity'), icon: User, color: '#f59e0b' },
        { value: 'VIP', label: 'VIP', icon: User, color: '#8b5cf6' },
        { value: 'PARTNER', label: t('contacts.categoryPartner'), icon: Building, color: '#3b82f6' },
        { value: 'SPAM', label: 'Spam', icon: User, color: '#ef4444' },
        { value: 'BLACKLIST', label: t('contacts.categoryBlacklist'), icon: User, color: '#1f2937' }
    ];

    const getStatusInfo = (status) => CUSTOMER_STATUS_OPTIONS.find(s => s.value === status) || CUSTOMER_STATUS_OPTIONS[0];
    const getSourceInfo = (source) => SOURCE_OPTIONS.find(s => s.value === source) || SOURCE_OPTIONS[0];
    const getCategoryInfo = (category) => CATEGORY_OPTIONS.find(c => c.value === category) || CATEGORY_OPTIONS[1];
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(sf.search || '');
    const [debouncedSearch, setDebouncedSearch] = useState(sf.search || '');
    const [statusFilter, setStatusFilter] = useState(sf.statusFilter || 'ALL');
    // Funnel filter state
    const [funnelFilter, setFunnelFilter] = useState(sf.funnelFilter || 'ALL');
    const [funnelStageFilter, setFunnelStageFilter] = useState(sf.funnelStageFilter || 'ALL');
    const [mergedFunnelIds, setMergedFunnelIds] = useState(sf.mergedFunnelIds || null); // when non-null, filter by these IDs together
    const [selectedFunnelIds, setSelectedFunnelIds] = useState(sf.selectedFunnelIds || []);
    const [availableFunnels, setAvailableFunnels] = useState([]);
    const [sourceFilter, setSourceFilter] = useState(sf.sourceFilter || 'ALL');
    const [categoryFilter, setCategoryFilter] = useState(sf.categoryFilter || 'ALL');
    const [branchFilter, setBranchFilter] = useState(sf.branchFilter || 'ALL');
    const [branches, setBranches] = useState([]);
    const [callStatusFilter, setCallStatusFilter] = useState(sf.callStatusFilter || 'ALL');
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '', confirmText: '', type: 'danger' });
    const [funnelFilterOpen, setFunnelFilterOpen] = useState(false);
    const funnelFilterRef = useRef(null);
    const [dateFilterOpen, setDateFilterOpen] = useState(false);
    const [dateFilterOpenUp, setDateFilterOpenUp] = useState(false);
    const dateFilterRef = useRef(null);
    const [filtersDropdownOpen, setFiltersDropdownOpen] = useState(false);
    const filtersDropdownRef = useRef(null);
    const [onlyOpenCases, setOnlyOpenCases] = useState(sf.onlyOpenCases !== undefined ? sf.onlyOpenCases : true);
    const showArchived = !onlyOpenCases; // Kapalılar dahilse arşivliler de dahil
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(sf.limit || 100);
    const [quickStats, setQuickStats] = useState({ periodCount: 0, withPhoneCount: 0, agentCalledCount: 0, aiCalledCount: 0, noActivityCount: 0, noPhoneCount: 0, totalAllTime: 0 });

    // Column sorting
    const [sortField, setSortField] = useState(sf.sortField || 'lastMessageAt');
    const [sortDir, setSortDir] = useState(sf.sortDir || 'desc');

    // Analytics panel
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [analyticsDays, setAnalyticsDays] = useState(30);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    // Selected contact for sidebar
    const [selectedContact, setSelectedContact] = useState(null);
    const selectedContactRef = useRef(null);

    // Teams & members for assignment
    const [teams, setTeams] = useState([]);
    const [members, setMembers] = useState([]);
    const [noteTitle, setNoteTitle] = useState('');
    const [contactNotes, setContactNotes] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [notesExpanded, setNotesExpanded] = useState(false);
    const [expandedNotes, setExpandedNotes] = useState({});

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingContact, setEditingContact] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        fullName: '',
        phones: [''],
        emails: [''],
        company: ''
    });
    const [formError, setFormError] = useState('');

    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState([]);
    const [allSelectedContacts, setAllSelectedContacts] = useState([]);
    const [deleting, setDeleting] = useState(false);

    // Export modal state
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportStartDate, setExportStartDate] = useState('');
    const [exportEndDate, setExportEndDate] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportingLeads, setExportingLeads] = useState(false);
    const [exportingSelected, setExportingSelected] = useState(false);
    const [showSelectedExportModal, setShowSelectedExportModal] = useState(false);
    const [selectedExportStartDate, setSelectedExportStartDate] = useState('');
    const [selectedExportEndDate, setSelectedExportEndDate] = useState('');
    const [selectedExportDateType, setSelectedExportDateType] = useState('first');

    // Dışa Aktar 2 (Arama & Talep Görüşme Raporu) state
    const [showReport2Modal, setShowReport2Modal] = useState(false);
    const [report2Data, setReport2Data] = useState([]);
    const [report2Stats, setReport2Stats] = useState({ total: 0, reachedCount: 0, unreachedCount: 0, agentCount: 0 });
    const [report2Loading, setReport2Loading] = useState(false);
    const [report2Exporting, setReport2Exporting] = useState(false);
    const [report2StartDate, setReport2StartDate] = useState('');
    const [report2EndDate, setReport2EndDate] = useState('');
    const [report2DatePreset, setReport2DatePreset] = useState('ALL');
    const [report2Search, setReport2Search] = useState('');

    // Bulk WhatsApp Template state
    const [showBulkWA, setShowBulkWA] = useState(false);
    const [waTemplates, setWaTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [bulkWASending, setBulkWASending] = useState(false);
    const [bulkWAProgress, setBulkWAProgress] = useState({ sent: 0, total: 0, errors: 0 });

    // Bulk Email state
    const [showBulkEmail, setShowBulkEmail] = useState(false);
    const [emailChannels, setEmailChannels] = useState([]);
    const [selectedEmailChannel, setSelectedEmailChannel] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [bulkEmailSending, setBulkEmailSending] = useState(false);
    const [bulkEmailProgress, setBulkEmailProgress] = useState({ sent: 0, total: 0, errors: 0 });

    // Bulk Call state
    const [showBulkCall, setShowBulkCall] = useState(false);
    const [bulkCallRunning, setBulkCallRunning] = useState(false);
    const [bulkCallProgress, setBulkCallProgress] = useState({ called: 0, total: 0, errors: 0 });
    const [retellAgents, setRetellAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');

    // Automatic Marketing Campaign & Ad Set for Bulk Actions
    const [createCampaignForBulk, setCreateCampaignForBulk] = useState(true);
    const [bulkCampaignName, setBulkCampaignName] = useState('');
    const [bulkCampaignSuccess, setBulkCampaignSuccess] = useState(null); // { campaignId, campaignName, groupName, total }

    // Bulk Status Change state
    const [showBulkStatus, setShowBulkStatus] = useState(false);
    const [bulkStatusFunnel, setBulkStatusFunnel] = useState('');
    const [bulkStatusStage, setBulkStatusStage] = useState('');
    const [bulkStatusRunning, setBulkStatusRunning] = useState(false);
    const [bulkStatusProgress, setBulkStatusProgress] = useState({ done: 0, total: 0, errors: 0 });

    // Excel Import state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importData, setImportData] = useState([]);
    const [importTag, setImportTag] = useState('');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [importFileName, setImportFileName] = useState('');
    // AI Column Mapping state
    const [importRawHeaders, setImportRawHeaders] = useState([]);
    const [importRawRows, setImportRawRows] = useState([]);
    const [importColMapping, setImportColMapping] = useState(null); // { name: 1, phone: 2, ... }
    const [detectingColumns, setDetectingColumns] = useState(false);
    const [mappingConfirmed, setMappingConfirmed] = useState(false);

    // Tag filter state
    const [tagFilter, setTagFilter] = useState(sf.tagFilter || 'ALL');
    const [availableTags, setAvailableTags] = useState([]);

    const [segmentFilter, setSegmentFilter] = useState(sf.segmentFilter || 'ALL');
    const [segmentGroups, setSegmentGroups] = useState({});
    const [segmentCounts, setSegmentCounts] = useState({});

    // Fetch segment definitions
    useEffect(() => {
        if (!currentWorkspace?.id) return;
        import('../../services/api').then(({ default: api }) => {
            api.get(`/smart-segments/${currentWorkspace.id}/segments/definitions`)
                .then(res => setSegmentGroups(res.data.groups || {}))
                .catch(err => console.error('Segment fetch error:', err));
            api.get(`/smart-segments/${currentWorkspace.id}/segments/counts`)
                .then(res => setSegmentCounts(res.data.counts || {}))
                .catch(err => console.error('Segment count error:', err));
        });
    }, [currentWorkspace?.id]);

    // Topic category filter state
    const [topicCategoryFilter, setTopicCategoryFilter] = useState(sf.topicCategoryFilter || 'ALL');
    const [availableTopicCategories, setAvailableTopicCategories] = useState([]);

    // Contact info filter state (phone/email)
    const [contactInfoFilter, setContactInfoFilter] = useState(sf.contactInfoFilter || 'ALL');

    // Score filter state
    const [scoreFilter, setScoreFilter] = useState(sf.scoreFilter || 'ALL');

    // Import group filter state
    const [importGroupFilter, setImportGroupFilter] = useState(sf.importGroupFilter || 'ALL');
    const [availableImportGroups, setAvailableImportGroups] = useState([]);

    // Date filter
    const [dateFilter, setDateFilter] = useState(sf.dateFilter || 'MONTH');
    const [dateFrom, setDateFrom] = useState(sf.dateFrom || '');
    const [dateTo, setDateTo] = useState(sf.dateTo || '');

    // Persist filters to sessionStorage whenever they change
    useEffect(() => {
        const filtersToSave = {
            assignmentFilter, quickFilterMode, search, statusFilter,
            funnelFilter, funnelStageFilter, mergedFunnelIds, selectedFunnelIds,
            sourceFilter, categoryFilter, branchFilter, callStatusFilter, tagFilter, topicCategoryFilter,
            contactInfoFilter, importGroupFilter, dateFilter, dateFrom, dateTo,
            onlyOpenCases, sortField, sortDir, limit, scoreFilter, segmentFilter
        };
        try {
            localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filtersToSave));
        } catch { /* storage full — ignore */ }
    }, [assignmentFilter, quickFilterMode, search, statusFilter,
        funnelFilter, funnelStageFilter, mergedFunnelIds, selectedFunnelIds,
        sourceFilter, categoryFilter, branchFilter, callStatusFilter, tagFilter, topicCategoryFilter,
        contactInfoFilter, importGroupFilter, dateFilter, dateFrom, dateTo,
        onlyOpenCases, sortField, sortDir, limit, scoreFilter, segmentFilter]);

    // Inline stage change dropdown
    const [stageDropdownContactId, setStageDropdownContactId] = useState(null);
    const [hoveredFunnelId, setHoveredFunnelId] = useState(null);
    const stageDropdownRef = useRef(null);

    // Filter labels to show on the main button
    const getActiveFilterLabel = () => {
        if (mergedFunnelIds) {
            return 'Genel';
        }
        if (funnelStageFilter !== 'ALL') {
            // Find stage name
            for (const f of availableFunnels) {
                const stage = f.stages?.find(s => s.id === funnelStageFilter);
                if (stage) return stage.name;
            }
        }
        if (funnelFilter !== 'ALL') {
            const funnel = availableFunnels.find(f => f.id === funnelFilter);
            return funnel ? funnel.name : 'Akış';
        }
        return 'Tüm Durumlar';
    };

    const getActiveFilterColor = () => {
        if (mergedFunnelIds) return '#3b82f6';
        if (funnelStageFilter !== 'ALL') {
            for (const f of availableFunnels) {
                const stage = f.stages?.find(s => s.id === funnelStageFilter);
                if (stage) return stage.color;
            }
        }
        if (funnelFilter !== 'ALL') {
            const funnel = availableFunnels.find(f => f.id === funnelFilter);
            return funnel ? funnel.color : '#64748b';
        }
        return '#64748b';
    };

    // Load funnels for funnel filter dropdown
    useEffect(() => {
        if (!currentWorkspace) return;
        funnelAPI.getAll(currentWorkspace.id)
            .then(res => setAvailableFunnels(res.data.funnels || res.data || []))
            .catch(() => {});
    }, [currentWorkspace]);

    // Load topic categories for category filter dropdown
    useEffect(() => {
        if (!currentWorkspace) return;
        getTopicCategories(currentWorkspace.id)
            .then(res => setAvailableTopicCategories(res.data || []))
            .catch(() => {});
    }, [currentWorkspace]);

    // Load teams and members for assignment sidebar
    useEffect(() => {
        if (!currentWorkspace) return;
        teamAPI.getWorkspaceTeams(currentWorkspace.id)
            .then(res => setTeams(res.data.teams || []))
            .catch(() => {});
        workspaceAPI.getMembers(currentWorkspace.id)
            .then(res => setMembers(res.data.members || []))
            .catch(() => {});
    }, [currentWorkspace]);

    // Fetch branches
    useEffect(() => {
        if (!currentWorkspace) return;
        appointmentConfigAPI.getBranches(currentWorkspace.id)
            .then(res => setBranches(res.data.branches || []))
            .catch(() => {});
    }, [currentWorkspace]);

    // Fetch Retell agents for bulk call modal
    useEffect(() => {
        if (showBulkCall && currentWorkspace) {
            setSelectedAgentId('');
            retellAPI.getAgents(currentWorkspace.id)
                .then(res => setRetellAgents(res.data.agents || []))
                .catch(err => console.error('Error fetching Retell agents:', err));
        }
    }, [showBulkCall, currentWorkspace]);

    const initialLoadDone = useRef(false);

    useEffect(() => {
        if (currentWorkspace) {
            if (!initialLoadDone.current) {
                loadContacts();
                initialLoadDone.current = true;
            } else {
                silentReloadContacts();
            }
        }
    }, [currentWorkspace, page, debouncedSearch, statusFilter, sourceFilter, categoryFilter, branchFilter, callStatusFilter, tagFilter, topicCategoryFilter, contactInfoFilter, importGroupFilter, showArchived, onlyOpenCases, funnelFilter, funnelStageFilter, mergedFunnelIds, selectedFunnelIds, limit, dateFilter, dateFrom, dateTo, assignmentFilter, sortField, sortDir, quickFilterMode, scoreFilter, segmentFilter]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (funnelFilterRef.current && !funnelFilterRef.current.contains(event.target)) {
                setFunnelFilterOpen(false);
            }
            if (dateFilterRef.current && !dateFilterRef.current.contains(event.target)) {
                setDateFilterOpen(false);
            }
            if (filtersDropdownRef.current && !filtersDropdownRef.current.contains(event.target)) {
                setFiltersDropdownOpen(false);
            }
            if (stageDropdownRef.current && !stageDropdownRef.current.contains(event.target)) {
                setStageDropdownContactId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Keep selectedContactRef in sync
    useEffect(() => {
        selectedContactRef.current = selectedContact;
    }, [selectedContact]);

    // Helper to get active query parameters for fetching contacts
    const getContactQueryParams = useCallback((overrides = {}) => ({
        search: debouncedSearch,
        status: statusFilter,
        source: sourceFilter,
        category: categoryFilter,
        branchId: branchFilter !== 'ALL' ? branchFilter : undefined,
        tag: tagFilter,
        contactInfo: contactInfoFilter,
        callStatus: callStatusFilter,
        importGroup: importGroupFilter,
        segment: segmentFilter !== 'ALL' ? segmentFilter : undefined,
        funnelType: selectedFunnelIds.length > 0 ? 'ALL' : funnelFilter,
        funnelTypes: selectedFunnelIds.length > 0 ? selectedFunnelIds.join(',') : (mergedFunnelIds ? mergedFunnelIds.join(',') : undefined),
        funnelStageId: funnelStageFilter,
        showArchived: showArchived.toString(),
        onlyOpenCases: onlyOpenCases.toString(),
        assignmentFilter: assignmentFilter !== 'all' ? assignmentFilter : undefined,
        sortField,
        sortDir,
        limit,
        offset: (page - 1) * limit,
        dateFilter: dateFilter !== 'ALL' ? dateFilter : undefined,
        dateFrom: dateFilter === 'CUSTOM' && dateFrom ? dateFrom : undefined,
        dateTo: dateFilter === 'CUSTOM' && dateTo ? dateTo : undefined,
        tzOffset: new Date().getTimezoneOffset(),
        topicCategoryId: topicCategoryFilter !== 'ALL' ? topicCategoryFilter : undefined,
        hasSales: quickFilterMode === 'SALES' ? 'true' : undefined,
        ...overrides
    }), [
        debouncedSearch, statusFilter, sourceFilter, categoryFilter, branchFilter, tagFilter,
        contactInfoFilter, callStatusFilter, importGroupFilter, segmentFilter,
        selectedFunnelIds, funnelFilter, mergedFunnelIds, funnelStageFilter,
        showArchived, onlyOpenCases, assignmentFilter, sortField, sortDir,
        limit, page, dateFilter, dateFrom, dateTo, topicCategoryFilter, quickFilterMode
    ]);

    // Client-side score filtering
    const applyScoreFilter = useCallback((contactList) => {
        let filtered = contactList || [];
        if (scoreFilter === 'hot') filtered = filtered.filter(c => (c.leadScore || 0) >= 70);
        if (scoreFilter === 'warm') filtered = filtered.filter(c => (c.leadScore || 0) >= 40 && (c.leadScore || 0) < 70);
        if (scoreFilter === 'cold') filtered = filtered.filter(c => (c.leadScore || 0) < 40);
        return filtered;
    }, [scoreFilter]);

    // Silent reload: updates the contact list without changing the selected contact
    const silentReloadContacts = useCallback(async () => {
        if (!currentWorkspace) return;
        try {
            const response = await contactAPI.getAll(currentWorkspace.id, getContactQueryParams());
            const filtered = applyScoreFilter(response.data.contacts);
            setContacts(filtered);
            setTotal(response.data.total);
            if (response.data.quickStats) setQuickStats(response.data.quickStats);

            if (response.data.allTags) {
                const serverTags = Array.isArray(response.data.allTags) ? response.data.allTags : [];
                const mergedTagSet = new Set(serverTags);
                (response.data.contacts || []).forEach(c => {
                    let tList = [];
                    if (Array.isArray(c.tags)) tList = c.tags;
                    else if (typeof c.tags === 'string' && c.tags && c.tags !== '[]') {
                        try {
                            const parsed = JSON.parse(c.tags);
                            if (Array.isArray(parsed)) tList = parsed;
                            else if (typeof parsed === 'string') tList = [parsed];
                        } catch {
                            tList = c.tags.replace(/[\[\]'"`]/g, '').split(',').map(s => s.trim());
                        }
                    }
                    tList.forEach(t => {
                        if (t && typeof t === 'string' && !t.startsWith('v_')) {
                            mergedTagSet.add(t.trim());
                        }
                    });
                });
                setAvailableTags(Array.from(mergedTagSet).sort());
            }
            if (response.data.allImportGroups) {
                setAvailableImportGroups(response.data.allImportGroups);
            }
            // Seçili kişi varsa güncel verisini API yanıtından al (atama değişikliği yansısın)
            const currentSelected = selectedContactRef.current;
            if (currentSelected) {
                const freshContact = response.data.contacts?.find(c => c.id === currentSelected.id);
                if (freshContact) {
                    setSelectedContact(prev => ({ ...prev, ...freshContact }));
                }
            }
        } catch (error) {
            console.error('Error silently reloading contacts:', error);
        }
    }, [currentWorkspace, getContactQueryParams, applyScoreFilter]);

    useEffect(() => {
        const handleContactUpdate = (event) => {
            const data = event.detail;
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                const fields = data.updatedFields || {};
                const fieldKeys = Object.keys(fields).filter(k => fields[k] !== undefined);

                // Lokal olarak güncellenebilen alanlar (API reload gerektirmez)
                const localUpdateFields = ['notes', 'funnelStageId', 'funnelType', 'status', 'category', 'company'];
                const canUpdateLocally = data.contactId && fieldKeys.length > 0 && fieldKeys.every(k => localUpdateFields.includes(k));

                if (canUpdateLocally) {
                    // Lokal güncelleme — API'ye istek atmadan anında yansıt
                    console.log('⚡ [Customers] Local contact update:', fieldKeys.join(', '));
                    setContacts(prev => prev.map(c =>
                        c.id === data.contactId ? { ...c, ...fields } : c
                    ));
                } else {
                    console.log('🔄 [Customers] Real-time contact update received, silent reload...');
                    silentReloadContacts();
                }

                // Also update selectedContact if it matches (use ref for latest value)
                const current = selectedContactRef.current;
                if (current && data.contactId === current.id && data.updatedFields) {
                    setSelectedContact(prev => ({
                        ...prev,
                        ...data.updatedFields
                    }));
                }
            }
        };

        const handleNewConversation = (event) => {
            const data = event.detail;
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                console.log('🔄 [Customers] New conversation received, silent reload (preserving selection)...');
                silentReloadContacts();
            }
        };

        const handleNewMessage = (event) => {
            const data = event.detail;
            // Only reload for WIDGET channel (new web visitors)
            if (currentWorkspace && data.workspaceId === currentWorkspace.id && data.channel === 'WIDGET') {
                console.log('🔄 [Customers] New widget message received, silent reload (preserving selection)...');
                silentReloadContacts();
            }
        };
        const handleFunnelStageUpdate = (event) => {
            const data = event.detail;
            if (currentWorkspace && data.contactId) {
                console.log('🔄 [Customers] Funnel stage updated via socket, locally updating contact...');
                setContacts(prev => prev.map(c =>
                    c.id === data.contactId ? { 
                        ...c, 
                        funnelStageId: data.funnelStageId, 
                        funnelType: data.funnelType,
                        cases: (c.cases || []).map(cs => cs.status === 'ACTIVE' ? { ...cs, funnelStageId: data.funnelStageId, funnelType: data.funnelType } : cs),
                        activeCase: c.activeCase ? { ...c.activeCase, funnelStageId: data.funnelStageId, funnelType: data.funnelType } : c.activeCase
                    } : c
                ));
                
                const current = selectedContactRef.current;
                if (current && data.contactId === current.id) {
                    setSelectedContact(prev => ({ ...prev, funnelStageId: data.funnelStageId, funnelType: data.funnelType }));
                }
            }
        };

        const handleCaseCardsRefresh = () => {
            console.log('🔄 [Customers] Case assignment changed, refreshing table...');
            silentReloadContacts();
        };

        window.addEventListener('websocket:contact_updated', handleContactUpdate);
        window.addEventListener('websocket:new_conversation', handleNewConversation);
        window.addEventListener('websocket:new_message', handleNewMessage);
        window.addEventListener('websocket:funnel_stage_updated', handleFunnelStageUpdate);
        window.addEventListener('case_cards_refresh', handleCaseCardsRefresh);

        return () => {
            window.removeEventListener('websocket:contact_updated', handleContactUpdate);
            window.removeEventListener('websocket:new_conversation', handleNewConversation);
            window.removeEventListener('websocket:new_message', handleNewMessage);
            window.removeEventListener('websocket:funnel_stage_updated', handleFunnelStageUpdate);
            window.removeEventListener('case_cards_refresh', handleCaseCardsRefresh);
        };
    }, [currentWorkspace, silentReloadContacts]);

    const loadContacts = async () => {
        try {
            setLoading(true);
            const response = await contactAPI.getAll(currentWorkspace.id, getContactQueryParams());
            const filtered = applyScoreFilter(response.data.contacts);
            setContacts(filtered);
            setTotal(response.data.total);
            if (response.data.quickStats) setQuickStats(response.data.quickStats);

            // Use allTags from backend response (filtered)
            if (response.data.allTags) {
                const serverTags = Array.isArray(response.data.allTags) ? response.data.allTags : [];
                const mergedTagSet = new Set(serverTags);
                (response.data.contacts || []).forEach(c => {
                    let tList = [];
                    if (Array.isArray(c.tags)) tList = c.tags;
                    else if (typeof c.tags === 'string' && c.tags && c.tags !== '[]') {
                        try {
                            const parsed = JSON.parse(c.tags);
                            if (Array.isArray(parsed)) tList = parsed;
                            else if (typeof parsed === 'string') tList = [parsed];
                        } catch {
                            tList = c.tags.replace(/[\[\]'"`]/g, '').split(',').map(s => s.trim());
                        }
                    }
                    tList.forEach(t => {
                        if (t && typeof t === 'string' && !t.startsWith('v_')) {
                            mergedTagSet.add(t.trim());
                        }
                    });
                });
                setAvailableTags(Array.from(mergedTagSet).sort());
            }
            // Use allImportGroups from backend response
            if (response.data.allImportGroups) {
                setAvailableImportGroups(response.data.allImportGroups);
            }

            // Auto-select first contact if none selected (skip in card view - sidebar not needed)
            if (!selectedContact && response.data.contacts?.length > 0 && viewMode !== 'card') {
                setSelectedContact(response.data.contacts[0]);
            }
        } catch (error) {
            console.error('Error loading contacts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        setSearch(e.target.value);
    };

    // Debounce search: wait 400ms after user stops typing before triggering API call
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    const handleStatusFilter = (status) => {
        setStatusFilter(status);
        setPage(1);
    };

    const handleSelectContact = async (contact) => {
        setSelectedContact(contact);
        setNoteTitle('');
        setContactNotes(''); // Start with empty inputs for new notes
        // Fetch full contact details including conversations
        try {
            const response = await contactAPI.getById(currentWorkspace.id, contact.id);
            if (response.data.contact) {
                setSelectedContact(response.data.contact);
            }
        } catch (error) {
            console.error('Error fetching contact details:', error);
        }
    };

    const handleSaveNotes = async () => {
        if (!selectedContact || (!noteTitle.trim() && !contactNotes.trim())) return;

        // Parse existing notes (JSON format: [{timestamp, title, content}, ...])
        let existingNotes = [];
        try {
            if (selectedContact.notes) {
                existingNotes = JSON.parse(selectedContact.notes);
                if (!Array.isArray(existingNotes)) existingNotes = [];
            }
        } catch {
            existingNotes = [];
        }

        // Create new note object
        const timestamp = new Date().toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const newNote = {
            timestamp,
            title: noteTitle.trim(),
            content: contactNotes.trim()
        };

        // Add to beginning of array (newest first)
        const updatedNotes = [newNote, ...existingNotes];
        const updatedNotesJson = JSON.stringify(updatedNotes);

        setSavingNotes(true);
        try {
            await contactAPI.update(currentWorkspace.id, selectedContact.id, { notes: updatedNotesJson });
            setSelectedContact(prev => ({ ...prev, notes: updatedNotesJson }));
            setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, notes: updatedNotesJson } : c));
            setNoteTitle('');
            setContactNotes(''); // Clear inputs after saving
            console.log('✅ Notes saved to contact');
        } catch (error) {
            console.error('Error saving notes:', error);
        } finally {
            setSavingNotes(false);
        }
    };

    const handleDeleteNote = async (indexToDelete) => {
        if (!selectedContact || !selectedContact.notes) return;

        // Parse existing notes as JSON
        let existingNotes = [];
        try {
            existingNotes = JSON.parse(selectedContact.notes);
            if (!Array.isArray(existingNotes)) return;
        } catch {
            return;
        }

        // Remove the note at the specified index
        const updatedNotes = existingNotes.filter((_, index) => index !== indexToDelete);
        const updatedNotesJson = updatedNotes.length > 0 ? JSON.stringify(updatedNotes) : '';

        setSavingNotes(true);
        try {
            await contactAPI.update(currentWorkspace.id, selectedContact.id, { notes: updatedNotesJson });
            setSelectedContact(prev => ({ ...prev, notes: updatedNotesJson }));
            setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, notes: updatedNotesJson } : c));
            console.log('✅ Note deleted');
        } catch (error) {
            console.error('Error deleting note:', error);
        } finally {
            setSavingNotes(false);
        }
    };

    // Export Facebook Leads to CSV
    const handleExportLeads = async () => {
        setExportingLeads(true);
        try {
            const response = await leadsAPI.exportAll(currentWorkspace.id);
            const leads = response.data.leads || [];

            if (leads.length === 0) {
                alert('Dışa aktarılacak lead bulunamadı.');
                setExportingLeads(false);
                return;
            }

            // Fixed columns
            const headerRow = ['Lead Adı', 'İsim', 'E-posta', 'Telefon', 'Tercih Ettiği Konut Tipi', 'Proje Adı', 'Tarih'];

            const rows = leads.map(lead => {
                const createdAt = lead.createdAt
                    ? new Date(lead.createdAt).toLocaleDateString('tr-TR') + ' ' + new Date(lead.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                    : '';

                return [
                    lead.formName || '',
                    lead.name || '',
                    lead.email || '',
                    lead.phone || '',
                    lead.konutTipi || '',
                    lead.projeAdi || '',
                    createdAt
                ];
            });

            const csvContent = [
                headerRow.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `facebook_leads_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Lead export error:', error);
            alert('Lead dışa aktarma hatası: ' + (error.response?.data?.error || error.message));
        } finally {
            setExportingLeads(false);
        }
    };

    // ─── Dışa Aktar 2 (Arama & Talep Görüşme Raporu) Handlers ─────────────────
    const loadReport2Data = async (startDate = '', endDate = '') => {
        if (!currentWorkspace?.id) return;
        setReport2Loading(true);
        try {
            const params = {};
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            const res = await contactAPI.getCallDemandReport(currentWorkspace.id, params);
            setReport2Data(res.data.report || []);
            setReport2Stats(res.data.stats || { total: 0, reachedCount: 0, unreachedCount: 0, agentCount: 0 });
        } catch (error) {
            console.error('Error loading call demand report:', error);
            alert('Rapor yüklenirken hata oluştu: ' + (error.response?.data?.error || error.message));
        } finally {
            setReport2Loading(false);
        }
    };

    const handleOpenReport2Modal = () => {
        setShowReport2Modal(true);
        setReport2Search('');
        setReport2DatePreset('ALL');
        setReport2StartDate('');
        setReport2EndDate('');
        loadReport2Data('', '');
    };

    const handleReport2DatePreset = (preset) => {
        setReport2DatePreset(preset);
        const now = new Date();
        let start = '';
        let end = '';

        const formatDateStr = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        if (preset === 'TODAY') {
            start = formatDateStr(now);
            end = formatDateStr(now);
        } else if (preset === 'WEEK') {
            const dayOfWeek = now.getDay() || 7;
            const monday = new Date(now);
            monday.setDate(now.getDate() - dayOfWeek + 1);
            start = formatDateStr(monday);
            end = formatDateStr(now);
        } else if (preset === 'MONTH') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            start = formatDateStr(firstDay);
            end = formatDateStr(now);
        } else if (preset === 'LAST_30') {
            const d30 = new Date(now);
            d30.setDate(now.getDate() - 30);
            start = formatDateStr(d30);
            end = formatDateStr(now);
        }

        setReport2StartDate(start);
        setReport2EndDate(end);
        loadReport2Data(start, end);
    };

    const getFilteredReport2Data = () => {
        if (!report2Search.trim()) return report2Data;
        const q = report2Search.toLowerCase().trim();
        return report2Data.filter(item => (
            (item.agentName && item.agentName.toLowerCase().includes(q)) ||
            (item.customerName && item.customerName.toLowerCase().includes(q)) ||
            (item.phone && item.phone.toLowerCase().includes(q)) ||
            (item.email && item.email.toLowerCase().includes(q)) ||
            (item.company && item.company.toLowerCase().includes(q)) ||
            (item.caseTitle && item.caseTitle.toLowerCase().includes(q)) ||
            (item.caseNumber && item.caseNumber.toLowerCase().includes(q)) ||
            (item.stageName && item.stageName.toLowerCase().includes(q)) ||
            (item.callStatus && item.callStatus.toLowerCase().includes(q)) ||
            (item.callNote && item.callNote.toLowerCase().includes(q))
        ));
    };

    const handleExportReport2Excel = () => {
        try {
            setReport2Exporting(true);
            const rowsToExport = getFilteredReport2Data();
            if (rowsToExport.length === 0) {
                alert('Dışa aktarılacak görüşme kaydı bulunamadı.');
                setReport2Exporting(false);
                return;
            }

            const headers = [
                'Görüşen / Temsilci',
                'Takım',
                'Müşteri Adı',
                'Telefon',
                'E-posta',
                'Şirket',
                'Kaynak',
                'Talep No',
                'Talep / Konu',
                'Aşama / Durum',
                'Görüşme Türü',
                'Tarih & Saat',
                'Görüşme Durumu',
                'Duygu / Hissiyat',
                'Arama / Görüşme Notu'
            ];

            const rows = rowsToExport.map(r => [
                r.agentName || '',
                r.teamName || '',
                r.customerName || '',
                r.phone || '',
                r.email || '',
                r.company || '',
                r.source || '',
                r.caseNumber || '',
                r.caseTitle || '',
                r.stageName || '',
                r.activityType || '',
                r.formattedDate || '',
                r.callStatus || '',
                r.sentiment || '',
                r.callNote || ''
            ]);

            const wsData = [headers, ...rows];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                { wch: 22 }, // Görüşen / Temsilci
                { wch: 16 }, // Takım
                { wch: 24 }, // Müşteri Adı
                { wch: 18 }, // Telefon
                { wch: 26 }, // E-posta
                { wch: 20 }, // Şirket
                { wch: 14 }, // Kaynak
                { wch: 16 }, // Talep No
                { wch: 26 }, // Talep / Konu
                { wch: 18 }, // Aşama / Durum
                { wch: 20 }, // Görüşme Türü
                { wch: 20 }, // Tarih & Saat
                { wch: 22 }, // Görüşme Durumu
                { wch: 16 }, // Duygu
                { wch: 55 }  // Arama Notu
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Görüşme ve Arama Raporu');
            const dateSuffix = report2StartDate && report2EndDate ? `_${report2StartDate}_${report2EndDate}` : `_${new Date().toISOString().slice(0, 10)}`;
            XLSX.writeFile(wb, `arama_talep_raporu${dateSuffix}.xlsx`);
        } catch (error) {
            console.error('Report 2 export error:', error);
            alert('Rapor dışa aktarılırken bir hata oluştu: ' + error.message);
        } finally {
            setReport2Exporting(false);
        }
    };

    // Export to XLSX
    const handleExportCSV = async () => {
        if (!exportStartDate || !exportEndDate) {
            alert('Lütfen başlangıç ve bitiş tarihlerini seçin');
            return;
        }

        setExporting(true);
        try {
            const response = await contactAPI.getAll(currentWorkspace.id, getContactQueryParams({
                limit: 10000,
                offset: 0
            }));
            const allContacts = applyScoreFilter(response.data.contacts);

            // Filter by date range
            const filteredContacts = allContacts.filter(contact => {
                if (!contact.firstMessageAt) return false;
                const firstMessageDate = new Date(contact.firstMessageAt);
                const startDate = new Date(exportStartDate);
                const endDate = new Date(exportEndDate);
                endDate.setHours(23, 59, 59, 999); // Include entire end date
                return firstMessageDate >= startDate && firstMessageDate <= endDate;
            });

            // Create CSV content
            const headers = ['İsim', 'Telefon', 'E-posta', 'Kaynak', 'Proje / Şube', 'İlk Yazma Tarihi', 'Durum', 'Kime Atandığı', 'Son Not'];

            const rows = filteredContacts.map(contact => {
                // Get last note from notes
                let lastNote = '';
                if (contact.notes) {
                    try {
                        const notesArray = JSON.parse(contact.notes);
                        if (Array.isArray(notesArray) && notesArray.length > 0) {
                            lastNote = notesArray[notesArray.length - 1].content || '';
                        }
                    } catch (e) {
                        // Notes are stored as string with format: [timestamp]\ncontent
                        const notes = contact.notes;
                        // Split by separator and get first note
                        const firstNote = notes.split('\n\n---\n\n')[0];
                        // Remove timestamp line [timestamp]
                        const contentMatch = firstNote.match(/\[.*?\]\n([\s\S]*)/);
                        if (contentMatch && contentMatch[1]) {
                            lastNote = contentMatch[1].trim();
                        } else {
                            lastNote = notes;
                        }
                    }
                }

                // Get display label from funnel stage or legacy status
                let displayLabel = 'Yeni';
                if (contact.funnelStageId && availableFunnels.length > 0) {
                    for (const funnel of availableFunnels) {
                        const s = funnel.stages?.find(x => x.id === contact.funnelStageId);
                        if (s) { displayLabel = s.name; break; }
                    }
                } else if (contact.status) {
                    displayLabel = getStatusInfo(contact.status).label;
                }

                // Get assigned agent
                let assignedTo = '---';
                const convs = [...(contact.conversations || [])].sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt));
                const lastConv = convs.length > 0 ? convs[0] : null;
                if (lastConv?.assignedTo?.name) {
                    assignedTo = lastConv.assignedTo.name;
                }

                return [
                    contact.name || '',
                    contact.phone || '',
                    contact.email || '',
                    getContactSourceLabel(contact),
                    getContactBranchName(contact),
                    contact.firstMessageAt ? new Date(contact.firstMessageAt).toLocaleDateString('tr-TR') : '',
                    displayLabel,
                    assignedTo,
                    lastNote
                ];
            });

            // Build XLSX
            const wsData = [headers, ...rows];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                { wch: 25 }, // İsim
                { wch: 18 }, // Telefon
                { wch: 28 }, // E-posta
                { wch: 16 }, // Kaynak
                { wch: 22 }, // Proje / Şube
                { wch: 18 }, // Tarih
                { wch: 15 }, // Durum
                { wch: 20 }, // Atanan
                { wch: 40 }, // Son Not
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Kişiler');
            XLSX.writeFile(wb, `kişiler_${exportStartDate}_${exportEndDate}.xlsx`);

            setShowExportModal(false);
            setExportStartDate('');
            setExportEndDate('');
        } catch (error) {
            console.error('Export error:', error);
            alert('Dışa aktarma sırasında bir hata oluştu');
        } finally {
            setExporting(false);
        }
    };

    // Filtered selected contacts according to date filter in modal
    const getFilteredSelectedContacts = useCallback(() => {
        const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;
        let target = pool.filter(c => selectedIds.includes(c.id));

        if (!selectedExportStartDate && !selectedExportEndDate) {
            return target;
        }

        const start = selectedExportStartDate ? new Date(selectedExportStartDate + 'T00:00:00') : null;
        const end = selectedExportEndDate ? new Date(selectedExportEndDate + 'T23:59:59.999') : null;

        return target.filter(contact => {
            let dateVal = null;
            if (selectedExportDateType === 'last') {
                dateVal = contact.lastMessageAt ? new Date(contact.lastMessageAt) : null;
            } else {
                dateVal = contact.firstMessageAt ? new Date(contact.firstMessageAt) : (contact.createdAt ? new Date(contact.createdAt) : null);
            }
            if (!dateVal) return false;
            if (start && dateVal < start) return false;
            if (end && dateVal > end) return false;
            return true;
        });
    }, [allSelectedContacts, contacts, selectedIds, selectedExportStartDate, selectedExportEndDate, selectedExportDateType]);

    // Export Selected Contacts to XLSX
    const handleExportSelected = async () => {
        if (selectedIds.length === 0) return;
        setExportingSelected(true);
        try {
            const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;
            let targetContacts = pool.filter(c => selectedIds.includes(c.id));

            // If user selected contacts across pages not all in current in-memory pool
            if (targetContacts.length < selectedIds.length) {
                const response = await contactAPI.getAll(currentWorkspace.id, getContactQueryParams({
                    limit: 10000,
                    offset: 0
                }));
                const all = applyScoreFilter(response.data?.contacts || []);
                targetContacts = all.filter(c => selectedIds.includes(c.id));
            }

            // Apply date filtering if specified
            if (selectedExportStartDate || selectedExportEndDate) {
                const start = selectedExportStartDate ? new Date(selectedExportStartDate + 'T00:00:00') : null;
                const end = selectedExportEndDate ? new Date(selectedExportEndDate + 'T23:59:59.999') : null;

                targetContacts = targetContacts.filter(contact => {
                    let dateVal = null;
                    if (selectedExportDateType === 'last') {
                        dateVal = contact.lastMessageAt ? new Date(contact.lastMessageAt) : null;
                    } else {
                        dateVal = contact.firstMessageAt ? new Date(contact.firstMessageAt) : (contact.createdAt ? new Date(contact.createdAt) : null);
                    }
                    if (!dateVal) return false;
                    if (start && dateVal < start) return false;
                    if (end && dateVal > end) return false;
                    return true;
                });
            }

            if (targetContacts.length === 0) {
                alert('Seçili tarih aralığında dışa aktarılacak kişi bulunamadı.');
                return;
            }

            const headers = [
                'İsim',
                'Telefon',
                'E-posta',
                'Kaynak',
                'Proje / Şube',
                'Firma',
                'Konu',
                'Skor',
                'Durum',
                'Kime Atandığı',
                'İlk Yazma Tarihi',
                'Son Yazma Tarihi',
                'Son Not'
            ];

            const rows = targetContacts.map(contact => {
                // Get last note from notes
                let lastNote = '';
                if (contact.notes) {
                    try {
                        const notesArray = JSON.parse(contact.notes);
                        if (Array.isArray(notesArray) && notesArray.length > 0) {
                            lastNote = notesArray[notesArray.length - 1].content || '';
                        }
                    } catch (e) {
                        const notes = String(contact.notes);
                        const firstNote = notes.split('\n\n---\n\n')[0];
                        const contentMatch = firstNote.match(/\[.*?\]\n([\s\S]*)/);
                        if (contentMatch && contentMatch[1]) {
                            lastNote = contentMatch[1].trim();
                        } else {
                            lastNote = notes;
                        }
                    }
                }

                // Get topic
                const activeCase = contact.cases?.find(c => c.status === 'ACTIVE') || contact.activeCase || contact.cases?.[0];
                const topic = activeCase?.title || contact.aiTopic || '';

                // Get status / stage
                let displayLabel = 'Yeni';
                const effectiveFunnelStageId = activeCase?.funnelStageId || contact.activeCase?.funnelStageId || contact.funnelStageId;
                if (effectiveFunnelStageId && availableFunnels.length > 0) {
                    for (const funnel of availableFunnels) {
                        const s = funnel.stages?.find(x => x.id === effectiveFunnelStageId);
                        if (s) {
                            displayLabel = `${funnel.name ? funnel.name + ' - ' : ''}${s.name}`;
                            break;
                        }
                    }
                } else if (contact.status) {
                    displayLabel = getStatusInfo(contact.status).label;
                }

                // Get assigned agent / team
                let assignedTo = '---';
                if (activeCase && (activeCase.assignedTo?.name || activeCase.assignedToName || activeCase.assignedTeamId)) {
                    const agent = activeCase.assignedTo?.name || activeCase.assignedToName || members.find(m => m.userId === activeCase.assignedToId)?.user?.name;
                    const team = teams.find(t => t.id === activeCase.assignedTeamId)?.name;
                    if (agent && team) assignedTo = `${agent} / ${team}`;
                    else if (agent) assignedTo = agent;
                    else if (team) assignedTo = team;
                } else {
                    const convs = [...(contact.conversations || [])].sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt));
                    const lastConv = convs[0];
                    if (lastConv?.assignedTo?.name) {
                        assignedTo = lastConv.assignedTo.name;
                    }
                }

                return [
                    contact.name || '',
                    contact.phone || '',
                    contact.email || '',
                    getContactSourceLabel(contact),
                    getContactBranchName(contact),
                    contact.company || '',
                    topic,
                    contact.leadScore != null ? contact.leadScore : '',
                    displayLabel,
                    assignedTo,
                    contact.firstMessageAt ? new Date(contact.firstMessageAt).toLocaleDateString('tr-TR') : (contact.createdAt ? new Date(contact.createdAt).toLocaleDateString('tr-TR') : ''),
                    contact.lastMessageAt ? new Date(contact.lastMessageAt).toLocaleDateString('tr-TR') : '',
                    lastNote
                ];
            });

            // Build XLSX
            const wsData = [headers, ...rows];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                { wch: 25 }, // İsim
                { wch: 18 }, // Telefon
                { wch: 28 }, // E-posta
                { wch: 16 }, // Kaynak
                { wch: 22 }, // Proje / Şube
                { wch: 20 }, // Firma
                { wch: 22 }, // Konu
                { wch: 10 }, // Skor
                { wch: 22 }, // Durum
                { wch: 22 }, // Atanan
                { wch: 16 }, // İlk Yazma
                { wch: 16 }, // Son Yazma
                { wch: 40 }, // Son Not
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Seçilen Kişiler');
            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `secilen_kisiler_${dateStr}_${targetContacts.length}.xlsx`);
            setShowSelectedExportModal(false);
        } catch (error) {
            console.error('Export selected error:', error);
            alert('Seçilen kişiler dışa aktarılırken bir hata oluştu.');
        } finally {
            setExportingSelected(false);
        }
    };

    // Bulk selection handlers
    const handleToggleSelect = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = prev.includes(id)
                ? prev.filter(i => i !== id)
                : [...prev, id];
            if (next.length === 0) setAllSelectedContacts([]);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedIds.length === contacts.length) {
            setSelectedIds([]);
            setAllSelectedContacts([]);
        } else {
            setSelectedIds(contacts.map(c => c.id));
            setAllSelectedContacts(contacts);
        }
    };

    // Select ALL contacts across all pages matching current filters
    const handleSelectAllGlobal = async () => {
        if (selectedIds.length === total) {
            setSelectedIds([]);
            setAllSelectedContacts([]);
            return;
        }
        try {
            const response = await contactAPI.getAll(currentWorkspace.id, getContactQueryParams({
                limit: 10000,
                offset: 0
            }));
            const all = applyScoreFilter(response.data.contacts);
            setSelectedIds(all.map(c => c.id));
            setAllSelectedContacts(all);
        } catch (err) {
            console.error('Select all error:', err);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return;

        setConfirmModal({
            isOpen: true,
            title: 'Toplu Silme',
            message: `${selectedIds.length} kişiyi silmek istediğinize emin misiniz?`,
            confirmText: 'Evet, Sil',
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    setDeleting(true);
                    for (const id of selectedIds) {
                        await contactAPI.delete(currentWorkspace.id, id);
                    }
                    setSelectedIds([]);
                    setAllSelectedContacts([]);
                    if (selectedContact && selectedIds.includes(selectedContact.id)) {
                        setSelectedContact(null);
                    }
                    silentReloadContacts();
                } catch (error) {
                    console.error('Error deleting contacts:', error);
                    alert('Bazı kişiler silinemedi');
                } finally {
                    setDeleting(false);
                }
            }
        });
    };

    // Bulk Status Change handler
    const handleBulkStatusChange = async () => {
        if (selectedIds.length === 0 || !bulkStatusStage) return;

        // Find selected funnel and stage info
        let selectedFunnelObj = null;
        let selectedStageObj = null;
        for (const f of availableFunnels) {
            const s = f.stages?.find(st => st.id === bulkStatusStage);
            if (s) {
                selectedFunnelObj = f;
                selectedStageObj = s;
                break;
            }
        }

        if (!selectedStageObj) {
            alert('Lütfen geçerli bir aşama seçin.');
            return;
        }

        setBulkStatusRunning(true);
        const total = selectedIds.length;
        setBulkStatusProgress({ done: 0, total, errors: 0 });
        let errors = 0;

        // Get full contact data to find their conversations
        const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;

        for (let i = 0; i < selectedIds.length; i++) {
            try {
                // 1. Update contact record
                await contactAPI.update(currentWorkspace.id, selectedIds[i], {
                    funnelStageId: selectedStageObj.id,
                    funnelType: selectedFunnelObj.id
                });

                // 2. Update all conversations of this contact
                const contact = pool.find(c => c.id === selectedIds[i]);
                if (contact?.conversations) {
                    for (const conv of contact.conversations) {
                        try {
                            await conversationAPI.updateFunnel(currentWorkspace.id, conv.id || conv, {
                                funnelStageId: selectedStageObj.id,
                                funnelType: selectedFunnelObj.id
                            });
                        } catch (convErr) {
                            // Non-fatal: conversation update failed
                            console.warn(`Conv update failed for ${conv.id || conv}:`, convErr);
                        }
                    }
                }
            } catch (e) {
                errors++;
                console.error(`Error updating contact ${selectedIds[i]}:`, e);
            }
            setBulkStatusProgress({ done: i + 1, total, errors });
        }

        setBulkStatusRunning(false);
        alert(`✅ ${total - errors} / ${total} kişinin durumu güncellendi.`);
        setShowBulkStatus(false);
        setBulkStatusFunnel('');
        setBulkStatusStage('');
        setSelectedIds([]);
        setAllSelectedContacts([]);
        silentReloadContacts();
    };

    const handleDeleteContact = async (id) => {
        setConfirmModal({
            isOpen: true,
            title: 'Kişi Sil',
            message: 'Bu kişiyi silmek istediğinize emin misiniz?',
            confirmText: 'Evet, Sil',
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await contactAPI.delete(currentWorkspace.id, id);
                    if (selectedContact?.id === id) {
                        setSelectedContact(null);
                    }
                    silentReloadContacts();
                } catch (error) {
                    console.error('Error deleting contact:', error);
                    alert('Kişi silinirken hata oluştu.');
                }
            }
        });
    };

    const handleCreateContact = async (e) => {
        e.preventDefault();
        setFormError('');

        if (!formData.name && !formData.fullName) {
            setFormError('İsim veya tam isim gereklidir');
            return;
        }

        // Filter out empty values
        const phones = formData.phones.filter(p => p.trim());
        const emails = formData.emails.filter(e => e.trim());

        try {
            const dataToSend = {
                name: formData.name,
                fullName: formData.fullName,
                phone: phones[0] || '',  // Primary phone
                email: emails[0] || '',  // Primary email
                phones: phones,
                emails: emails,
                company: formData.company
            };

            if (editingContact) {
                await contactAPI.update(currentWorkspace.id, editingContact.id, dataToSend);
                setIsModalOpen(false);
                setEditingContact(null);
                setFormData({ name: '', fullName: '', phones: [''], emails: [''], company: '' });
                silentReloadContacts();
            } else {
                if (phones.length === 0 && emails.length === 0) {
                    setFormError('En az bir iletişim bilgisi (telefon veya e-posta) gereklidir');
                    return;
                }
                await contactAPI.create(currentWorkspace.id, dataToSend);
                setIsModalOpen(false);
                setFormData({ name: '', fullName: '', phones: [''], emails: [''], company: '' });
                silentReloadContacts();
            }
        } catch (error) {
            console.error('Error saving contact:', error);
            setFormError(error.response?.data?.error || 'Kişi kaydedilirken hata oluştu');
        }
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        // Parse JSON strings to arrays if needed
        let phones = [''];
        let emails = [''];

        // Handle phones - could be JSON string or array
        if (contact.phones) {
            try {
                phones = typeof contact.phones === 'string' ? JSON.parse(contact.phones) : contact.phones;
            } catch (e) {
                phones = contact.phone ? [contact.phone] : [''];
            }
        } else if (contact.phone) {
            phones = [contact.phone];
        }

        // Handle emails - could be JSON string or array
        if (contact.emails) {
            try {
                emails = typeof contact.emails === 'string' ? JSON.parse(contact.emails) : contact.emails;
            } catch (e) {
                emails = contact.email ? [contact.email] : [''];
            }
        } else if (contact.email) {
            emails = [contact.email];
        }

        // Ensure at least one empty field
        if (!phones.length || (phones.length === 1 && !phones[0])) phones = [''];
        if (!emails.length || (emails.length === 1 && !emails[0])) emails = [''];

        setFormData({
            name: contact.name || '',
            fullName: contact.fullName || '',
            phones: phones,
            emails: emails,
            company: contact.company || ''
        });
        setFormError('');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingContact(null);
        setFormData({ name: '', fullName: '', phones: [''], emails: [''], company: '' });
        setFormError('');
    };

    // Dynamic field handlers
    const addPhone = () => {
        setFormData({ ...formData, phones: [...formData.phones, ''] });
    };

    const removePhone = (index) => {
        const newPhones = formData.phones.filter((_, i) => i !== index);
        setFormData({ ...formData, phones: newPhones.length ? newPhones : [''] });
    };

    const updatePhone = (index, value) => {
        const newPhones = [...formData.phones];
        newPhones[index] = value;
        setFormData({ ...formData, phones: newPhones });
    };

    const addEmail = () => {
        setFormData({ ...formData, emails: [...formData.emails, ''] });
    };

    const removeEmail = (index) => {
        const newEmails = formData.emails.filter((_, i) => i !== index);
        setFormData({ ...formData, emails: newEmails.length ? newEmails : [''] });
    };

    const updateEmail = (index, value) => {
        const newEmails = [...formData.emails];
        newEmails[index] = value;
        setFormData({ ...formData, emails: newEmails });
    };

    const closeSidebar = () => {
        setSelectedContact(null);
    };

    // Inline stage change handler
    const handleInlineStageChange = async (contact, funnelId, stageId) => {
        setStageDropdownContactId(null);
        try {
            // Optimistic local update
            setContacts(prev => prev.map(c =>
                c.id === contact.id ? { 
                    ...c, 
                    funnelStageId: stageId, 
                    funnelType: funnelId,
                    cases: (c.cases || []).map(cs => cs.status === 'ACTIVE' ? { ...cs, funnelStageId: stageId, funnelType: funnelId } : cs),
                    activeCase: c.activeCase ? { ...c.activeCase, funnelStageId: stageId, funnelType: funnelId } : c.activeCase
                } : c
            ));
            // 1. Update conversations first so the Case is updated in the DB
            if (contact.conversations) {
                for (const conv of contact.conversations) {
                    try {
                        await conversationAPI.updateFunnel(currentWorkspace.id, conv.id || conv, {
                            funnelStageId: stageId,
                            funnelType: funnelId,
                            confirmAssignmentUpdate: true
                        });
                    } catch (convErr) {
                        console.warn('Conv update failed:', convErr);
                    }
                }
            }
            // 2. Update contact record
            await contactAPI.update(currentWorkspace.id, contact.id, {
                status: stageId,
                funnelStageId: stageId.length > 20 ? stageId : null,
                funnelType: funnelId
            });
        } catch (err) {
            console.error('🔥 [Customers] Inline stage change ERROR:', err);
            // Revert on error
            silentReloadContacts();
        }
    };

    // Excel Import handler — AI-Powered Column Detection
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImportFileName(file.name);
        setImportResult(null);
        setImportData([]);
        setImportColMapping(null);
        setMappingConfirmed(false);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const workbook = XLSX.read(evt.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                const headers = (jsonData[0] || []).map(h => (h || '').toString().trim());
                const dataRows = jsonData.slice(1).filter(r => r && r.length > 0);
                const sampleRows = dataRows.slice(0, 5).map(r =>
                    r.map(c => (c || '').toString().trim())
                );

                setImportRawHeaders(headers);
                setImportRawRows(dataRows);

                // 🧠 AI Column Detection
                setDetectingColumns(true);
                try {
                    const res = await aiAPI.detectImportColumns(currentWorkspace.id, headers, sampleRows);
                    const aiMapping = res.data?.mapping || {};
                    
                    // Convert AI mapping to our format: { name: colIndex, phone: colIndex, ... }
                    const colMap = {};
                    for (const [colIdx, fieldType] of Object.entries(aiMapping)) {
                        if (fieldType !== 'skip') {
                            colMap[fieldType] = parseInt(colIdx);
                        }
                    }
                    setImportColMapping(colMap);
                    console.log('🧠 [AI Import] Column mapping:', colMap);

                    // Auto-apply mapping to build preview
                    applyMappingToData(colMap, dataRows);
                } catch (aiErr) {
                    console.warn('⚠️ [AI Import] AI detection failed, using keyword fallback:', aiErr.message);
                    // Fallback to keyword-based detection
                    const lowerHeaders = headers.map(h => h.toLowerCase());
                    const findCol = (keywords) => lowerHeaders.findIndex(h => keywords.some(k => h.includes(k)));
                    const fallbackMap = {};
                    const nameCol = findCol(['adı', 'ad', 'isim', 'name', 'müşteri', 'kişi']);
                    const phoneCol = findCol(['telefon', 'phone', 'cep', 'gsm', 'tel', 'numara']);
                    const emailCol = findCol(['e-posta', 'email', 'mail', 'eposta']);
                    const notesCol = findCol(['not', 'note', 'açıklama', 'mesaj']);
                    if (nameCol >= 0) fallbackMap.name = nameCol;
                    if (phoneCol >= 0) fallbackMap.phone = phoneCol;
                    if (emailCol >= 0) fallbackMap.email = emailCol;
                    if (notesCol >= 0) fallbackMap.notes = notesCol;
                    setImportColMapping(fallbackMap);
                    applyMappingToData(fallbackMap, dataRows);
                } finally {
                    setDetectingColumns(false);
                }
            } catch (err) {
                console.error('Excel parse error:', err);
                setImportData([]);
                setDetectingColumns(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    // Apply column mapping to raw data and build importData
    const applyMappingToData = (colMap, dataRows) => {
        const rows = dataRows || importRawRows;
        const contacts = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const name = colMap.name >= 0 ? (row[colMap.name] || '').toString().trim() : '';
            const phone = colMap.phone >= 0 ? (row[colMap.phone] || '').toString().trim() : '';
            const email = colMap.email >= 0 ? (row[colMap.email] || '').toString().trim() : '';
            const notes = colMap.notes >= 0 ? (row[colMap.notes] || '').toString().trim() : '';
            const createdAt = colMap.date >= 0 ? (row[colMap.date] || '').toString().trim() : '';
            if (name || phone || email) {
                contacts.push({ name, phone, email, notes, createdAt });
            }
        }
        setImportData(contacts);
    };

    // Handle user changing a column mapping dropdown
    const handleMappingChange = (fieldType, colIndex) => {
        const newMapping = { ...importColMapping };
        // Remove old assignment of this field
        delete newMapping[fieldType];
        // Remove any other field assigned to this column
        for (const [key, val] of Object.entries(newMapping)) {
            if (val === colIndex) delete newMapping[key];
        }
        // Assign
        if (colIndex >= 0) {
            newMapping[fieldType] = colIndex;
        }
        setImportColMapping(newMapping);
        applyMappingToData(newMapping);
    };

    const handleImportExcel = async () => {
        if (importData.length === 0 || !importTag.trim()) return;
        setImporting(true);
        setImportResult(null);
        try {
            const res = await contactAPI.bulkImport(currentWorkspace.id, {
                contacts: importData,
                tag: importTag.trim()
            });
            setImportResult(res.data);
            // Add the group to available import groups
            setAvailableImportGroups(prev => {
                if (!prev.includes(importTag.trim())) return [...prev, importTag.trim()].sort();
                return prev;
            });
            silentReloadContacts();
        } catch (err) {
            setImportResult({ error: err.response?.data?.error || 'İçe aktarma başarısız' });
        } finally {
            setImporting(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '---';
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    // ── Card View Helpers ──
    const toggleCardExpanded = (contactId) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(contactId)) next.delete(contactId);
            else next.add(contactId);
            return next;
        });
    };

    const toggleCaseInCard = (contactId, caseId) => {
        setExpandedCasesInCard(prev => {
            const contactCases = prev[contactId] ? new Set(prev[contactId]) : new Set();
            if (contactCases.has(caseId)) contactCases.delete(caseId);
            else contactCases.add(caseId);
            return { ...prev, [contactId]: contactCases };
        });
    };

    const timeAgo = (dateString) => {
        if (!dateString) return null;
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return null;
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffMin < 1) return 'Şimdi';
        if (diffMin < 60) return `${diffMin}dk önce`;
        if (diffHours < 24) return `${diffHours}sa önce`;
        if (diffDays === 0) return 'Bugün';
        if (diffDays === 1) return 'Dün';
        if (diffDays < 7) return `${diffDays}g önce`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}hf önce`;
        return `${Math.floor(diffDays / 30)}ay önce`;
    };

    const daysSince = (dateString) => {
        if (!dateString) return null;
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return null;
        const now = new Date();
        return Math.floor((now - d) / 86400000);
    };

    const handleQuickNoteSave = async (contactId) => {
        const text = quickNotes[contactId];
        if (!text || !text.trim()) return;
        const target = quickNotes[`${contactId}_target`] || 'contact';
        const action = quickNotes[`${contactId}_action`] || 'note';
        const payload = {
            type: action === 'plan' ? 'CALL' : 'NOTE',
            description: text.trim(),
            workspaceId: currentWorkspace?.id
        };
        if (action === 'plan') {
            payload.status = 'PLANNED';
            payload.title = text.trim();
            payload.callTopic = text.trim();
        }
        if (target !== 'contact') {
            payload.caseId = target;
        }
        try {
            await activityAPI.createActivity(contactId, payload);
            setQuickNotes(prev => ({ ...prev, [contactId]: '', [`${contactId}_target`]: 'contact', [`${contactId}_action`]: 'note' }));
            loadContacts();
        } catch (err) {
            console.error('Not kaydedilemedi:', err);
        }
    };

    const getDetailedChannelInfo = (contact) => {
        if (!contact) return { icon: '📥', label: 'Bilinmiyor', badgeColor: '#64748b', bg: '#f1f5f9' };

        const src = (contact.source || '').toUpperCase();
        const channels = Array.isArray(contact.channels) ? contact.channels.map(c => (c || '').toUpperCase()) : [];
        const hasChan = (val) => channels.some(c => c.includes(val));
        const formName = contact.formName || contact.attribution?.meta_lead_form_name || contact.leadSourceDetail || null;
        const isLeadForm = src.includes('LEAD') || hasChan('LEAD') || !!formName;

        let icon = '📥';
        let label = 'Doğrudan';
        let badgeColor = '#64748b';
        let bg = '#f1f5f9';

        if (src.includes('FACEBOOK') || hasChan('FACEBOOK') || contact.facebookId) {
            if (isLeadForm) {
                icon = '📘';
                label = 'Facebook Lead Formu';
                badgeColor = '#1877f2';
                bg = '#eff6ff';
            } else {
                icon = '💬';
                label = 'Facebook Messenger';
                badgeColor = '#0084ff';
                bg = '#eff6ff';
            }
        } else if (src.includes('INSTAGRAM') || hasChan('INSTAGRAM') || contact.instagramId) {
            if (isLeadForm) {
                icon = '📸';
                label = 'Instagram Lead Formu';
                badgeColor = '#e1306c';
                bg = '#fdf2f8';
            } else {
                icon = '📸';
                label = 'Instagram DM';
                badgeColor = '#e1306c';
                bg = '#fdf2f8';
            }
        } else if (src.includes('WHATSAPP') || hasChan('WHATSAPP') || contact.whatsappId) {
            icon = '💬';
            label = 'WhatsApp';
            badgeColor = '#16a34a';
            bg = '#f0fdf4';
        } else if (isLeadForm) {
            icon = '📋';
            label = 'Meta Lead Formu';
            badgeColor = '#2563eb';
            bg = '#eff6ff';
        } else if (src === 'WEB_FORM' || src === 'WEBFORM' || src === 'FORM' || hasChan('FORM')) {
            icon = '📝';
            label = 'Web Formu';
            badgeColor = '#0284c7';
            bg = '#f0f9ff';
        } else if (src === 'WEB_WIDGET' || src === 'WIDGET' || src === 'WEB' || hasChan('WEB') || hasChan('WIDGET')) {
            icon = '🌐';
            label = 'Web Canlı Destek';
            badgeColor = '#0284c7';
            bg = '#f0f9ff';
        } else if (src === 'EMAIL' || hasChan('EMAIL')) {
            icon = '✉️';
            label = 'E-Posta';
            badgeColor = '#7c3aed';
            bg = '#faf5ff';
        } else if (src === 'MANUAL') {
            icon = '✍️';
            label = 'Manuel Kayıt';
            badgeColor = '#64748b';
            bg = '#f8fafc';
        } else if (contact.source) {
            label = contact.source;
        }

        // Ek kampanya / reklam / sayfa detayları
        const campaign = contact.campaignOrAd || contact.attribution?.fb_ad_name || contact.attribution?.fb_campaign_name || contact.attribution?.utm_campaign || null;
        const page = contact.pageName || null;
        const form = formName || null;

        const extraParts = [];
        if (campaign) extraParts.push(campaign);
        if (form && !extraParts.includes(form)) extraParts.push(form);
        if (page && !extraParts.includes(page)) extraParts.push(page);

        return {
            icon,
            label,
            badgeColor,
            bg,
            extra: extraParts.length > 0 ? extraParts.join(' · ') : null,
            campaign,
            form,
            page
        };
    };

    const getCardSourceInfo = (contact) => {
        const info = getDetailedChannelInfo(contact);
        return { icon: info.icon, label: info.label, color: info.badgeColor };
    };

    const getCustomerInquiry = (contact) => {
        if (!contact) return null;
        const primaryCase = getPrimaryCase(contact);
        const GENERIC_TITLES = ['💬 WHATSAPP', '💬 FACEBOOK', '💬 INSTAGRAM', '📧 E-POSTA', '📞 TELEFON', '🌐 WEB WIDGET', '📝 FORM', 'YENİ İLETİŞİM', 'YENİ CASE', 'LEAD'];

        if (primaryCase?.title && !GENERIC_TITLES.includes(primaryCase.title.trim().toUpperCase())) {
            return {
                title: primaryCase.title,
                caseNumber: primaryCase.caseNumber || null,
                status: primaryCase.status,
                score: primaryCase.leadScore,
                fromCase: true
            };
        }
        if (contact.aiTopic && !GENERIC_TITLES.includes(contact.aiTopic.trim().toUpperCase())) {
            return {
                title: contact.aiTopic,
                caseNumber: primaryCase?.caseNumber || null,
                status: primaryCase?.status || null,
                score: primaryCase?.leadScore || contact.leadScore || null,
                fromCase: false
            };
        }
        if (primaryCase?.title) {
            return {
                title: primaryCase.title,
                caseNumber: primaryCase.caseNumber || null,
                status: primaryCase.status,
                score: primaryCase.leadScore,
                fromCase: true
            };
        }
        return null;
    };

    const getContactAllCases = (contact) => {
        if (!contact) return [];
        const cases = contact.cases || [];
        const sorted = [...cases].sort((a, b) => {
            if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
            if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            return bTime - aTime;
        });
        return sorted;
    };

    const getPrimaryCase = (contact) => {
        const cases = getContactAllCases(contact);
        return cases[0] || null;
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0 sn';
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return min > 0 ? `${min} dk ${sec} sn` : `${sec} sn`;
    };

    const getCaseTouchInfo = (contact, caseObj) => {
        const acts = (contact?.activities || []).filter(a =>
            !caseObj || (a.caseId === caseObj.id) || (!a.caseId)
        );

        // Check calls (including AI calls)
        const calls = acts.filter(a =>
            a.type === 'CALL' || a.source === 'RETELL' || a.source === 'INSTOMER_CALL' || a.assignedByType === 'AI' || a._isRetell
        ).sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0));

        const retellCalls = (contact?.retellCalls || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        let lastCallDate = null;
        let isAiCall = false;

        if (calls.length > 0) {
            const firstCall = calls[0];
            lastCallDate = firstCall.completedAt || firstCall.createdAt;
            isAiCall = firstCall.assignedByType === 'AI' || firstCall.source === 'RETELL' || firstCall._isRetell;
        }

        if (retellCalls.length > 0) {
            const rc = retellCalls[0];
            const rcDate = new Date(rc.createdAt).getTime();
            if (!lastCallDate || rcDate > new Date(lastCallDate).getTime()) {
                lastCallDate = rc.createdAt;
                isAiCall = true;
            }
        }

        if (lastCallDate) {
            const days = daysSince(lastCallDate);
            const prefix = isAiCall ? '🤖 ' : '📞 ';
            const callerLabel = isAiCall 
                ? 'AI aradı' 
                : (() => {
                    const firstCall = calls[0];
                    const name = firstCall?.assignee?.name || firstCall?.creator?.name || '';
                    return name ? `${name} aradı` : 'Arandı';
                })();
            if (days === 0) return { text: `${prefix}Bugün ${callerLabel}`, color: '#15803d', bg: '#f0fdf4' };
            if (days === 1) return { text: `${prefix}Dün ${callerLabel}`, color: '#15803d', bg: '#f0fdf4' };
            if (days <= 3) return { text: `${prefix}${days}g önce ${callerLabel}`, color: '#15803d', bg: '#f0fdf4' };
            if (days <= 7) return { text: `${prefix}${days}g önce ${callerLabel}`, color: '#d97706', bg: '#fffbeb' };
            return { text: `${prefix}${days}g dokunulmadı`, color: '#dc2626', bg: '#fef2f2' };
        }

        // Other completed activities
        const otherActs = acts.filter(a => a.status === 'COMPLETED' || a.type === 'NOTE');
        if (otherActs.length > 0) {
            const lastAct = otherActs.sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0))[0];
            const days = daysSince(lastAct.completedAt || lastAct.createdAt);
            if (days === 0) return { text: 'Bugün işlem', color: '#15803d', bg: '#f0fdf4' };
            if (days === 1) return { text: 'Dün işlem', color: '#15803d', bg: '#f0fdf4' };
            if (days <= 7) return { text: `${days}g önce işlem`, color: '#d97706', bg: '#fffbeb' };
        }

        // Recent conversation
        if (contact?.lastMessageAt) {
            const days = daysSince(contact.lastMessageAt);
            if (days === 0) return { text: '💬 Bugün yazıştı', color: '#2563eb', bg: '#eff6ff' };
            if (days === 1) return { text: '💬 Dün yazıştı', color: '#2563eb', bg: '#eff6ff' };
            if (days <= 3) return { text: `💬 ${days}g önce yazıştı`, color: '#2563eb', bg: '#eff6ff' };
        }

        return { text: 'Hiç aranmadı', color: '#dc2626', bg: '#fef2f2' };
    };

    const getCardMilestones = (contact) => {
        const milestones = [];
        if (!contact) return milestones;

        // 1. Kayıt Oluşturuldu
        if (contact.createdAt) {
            const sourceText = contact.campaignOrAd
                ? `${contact.source || 'MANUAL'} (${contact.campaignOrAd})`
                : (contact.source || 'MANUAL');
            milestones.push({
                id: 'm-record',
                icon: '📋',
                title: 'Kayıt Oluşturuldu',
                detail: `Kaynak: ${sourceText}${contact.formName ? ` · Form: ${contact.formName}` : ''}`,
                date: contact.createdAt,
                color: '#6366f1',
                type: 'RECORD'
            });
        }

        // 2. İlk Sohbet / Talep
        const firstMsgAt = contact.firstMessageAt;
        const convTopic = contact.aiTopic || (contact.conversations?.[0]?.messages?.[0]?.content);
        if (firstMsgAt || contact.conversations?.length > 0) {
            milestones.push({
                id: 'm-conv',
                icon: '💬',
                title: 'İlk İletişim / Sohbet',
                detail: convTopic ? (convTopic.length > 80 ? convTopic.substring(0, 80) + '...' : convTopic) : 'Sohbet başlatıldı',
                date: firstMsgAt || contact.createdAt,
                color: '#0ea5e9',
                type: 'CONVERSATION'
            });
        }

        // 3. Telefon Alındı
        if (contact.phone) {
            milestones.push({
                id: 'm-phone',
                icon: '📱',
                title: 'Telefon Numarası Alındı',
                detail: contact.phone,
                date: contact.createdAt,
                color: '#10b981',
                type: 'PHONE'
            });
        }

        // 4. Aktiviteler & Çağrılar
        const acts = contact.activities || [];
        acts.forEach((act, idx) => {
            const isCall = act.type === 'CALL' || act.source === 'RETELL' || act.source === 'INSTOMER_CALL' || act.assignedByType === 'AI' || act._isRetell;
            const isAi = act.source === 'RETELL' || act.sourceType === 'RETELL' || act.assignedByType === 'AI' || act._isRetell || (act.title && act.title.toLowerCase().includes('ai'));
            const isHumanCall = isCall && !isAi;
            const isAutomation = act.source === 'AUTOMATION' || act.sourceType === 'STAGE_ACTION';
            const isMeeting = act.type === 'MEETING' || act.type === 'APPOINTMENT';
            const isNote = act.type === 'NOTE';
            const isReached = act.callSuccessful === true || (act.result && (act.result.includes('REACHED') || act.result.toLowerCase().includes('ulaşıldı') || act.result.toLowerCase().includes('görüşüldü')));
            const isFailed = act.callSuccessful === false || (act.result && (act.result.includes('NO_ANSWER') || act.result.toLowerCase().includes('cevapsız') || act.result.toLowerCase().includes('ulaşılamadı')));
            const isPlanned = act.status === 'PLANNED';
            const aiFallback = act.aiFallbackTriggered;

            let sentimentEmoji = '';
            if (act.callSentiment) {
                sentimentEmoji = act.callSentiment === 'Positive' ? ' 😊' : act.callSentiment === 'Negative' ? ' 😞' : ' 😐';
            }

            // Result label
            const resultLabel = isReached ? '✅ Ulaşıldı' : isFailed ? '❌ Cevapsız' : isPlanned ? '⏳ Planlandı' : '';

            let mTitle = act.title || act.type;
            let mIcon = '📌';
            let mColor = '#64748b';

            if (isAi) {
                mIcon = '🤖';
                mColor = '#7c3aed';
                const aiResult = isReached ? ' · Ulaşıldı' : isFailed ? ' · Cevapsız' : '';
                const transferLabel = aiFallback ? ' → İnsana Devredildi' : '';
                mTitle = `AI Asistan Araması${sentimentEmoji}${aiResult}${transferLabel}`;
            } else if (isHumanCall) {
                mIcon = '📞';
                mColor = isReached ? '#16a34a' : isFailed ? '#dc2626' : '#2563eb';
                const callerName = act.assignee?.name || act.creator?.name || 'Temsilci';
                const autoLabel = isAutomation ? ' · Otomasyon' : '';
                mTitle = `İnsan Araması · ${callerName}${autoLabel} ${resultLabel}`.trim();
            } else if (isMeeting) {
                mIcon = '📅';
                mColor = '#d97706';
                mTitle = `Randevu (${act.title || 'Müşteri Görüşmesi'})`;
            } else if (isNote) {
                mIcon = '📝';
                mColor = '#b45309';
                mTitle = `Not (${act.creator?.name || 'Temsilci'})`;
            }

            milestones.push({
                id: act.id || `act-${idx}`,
                icon: mIcon,
                title: mTitle,
                detail: act.description || act.result || act.title,
                date: act.completedAt || act.createdAt || act.dueDate,
                color: mColor,
                type: act.type,
                isAi,
                isCall,
                isHumanCall,
                isMeeting,
                isNote,
                isReached,
                isFailed,
                isPlanned,
                duration: act.duration,
                sentiment: act.callSentiment,
                summary: act.summary || (isAi && act.result ? act.result : null),
                source: act.source,
                sourceType: act.sourceType,
                transcript: act.transcript || null,
                callTopic: act.callTopic || null,
                callerName: act.assignee?.name || act.creator?.name || null,
                rawActivity: act
            });
        });

        // En yeni aktivite ve aramalar en üstte görünsün
        milestones.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        return milestones;
    };

    const getCaseActivities = (contact, caseItem) => {
        if (!contact || !contact.activities) return [];
        const acts = contact.activities.filter(a => a.caseId === caseItem.id);
        if (acts.length > 0) return acts;
        // Eğer contact'in tek vakası varsa veya birincil vaka ise ve caseId atanmamış aktiviteler varsa bağla
        const allCases = getContactAllCases(contact);
        if (allCases.length <= 1 || allCases[0]?.id === caseItem.id) {
            return contact.activities.filter(a => !a.caseId || a.caseId === caseItem.id);
        }
        return [];
    };

    const getGeneralActivities = (contact) => {
        if (!contact || !contact.activities) return [];
        const allCases = getContactAllCases(contact);
        if (allCases.length <= 1) return [];
        return contact.activities.filter(a => !a.caseId);
    };

    const getActivityCounters = (activities) => {
        const acts = activities || [];
        const calls = acts.filter(a => a.type === 'CALL' || a.source === 'RETELL' || a.source === 'INSTOMER_CALL' || a.assignedByType === 'AI');
        const aiCalls = acts.filter(a => a.assignedByType === 'AI' || a.source === 'RETELL' || (a.title && a.title.toLowerCase().includes('ai')));
        const humanCalls = calls.length - aiCalls.length;
        const reachedCalls = calls.filter(a => a.callSuccessful === true || (a.result && (a.result.includes('REACHED') || a.result.toLowerCase().includes('ulaşıldı'))));
        const failedCalls = calls.filter(a => a.callSuccessful === false || (a.result && (a.result.includes('NO_ANSWER') || a.result.toLowerCase().includes('cevapsız') || a.result.toLowerCase().includes('ulaşılamadı'))));
        const meetings = acts.filter(a => a.type === 'MEETING' || a.type === 'APPOINTMENT' || (a.title && a.title.toLowerCase().includes('randevu')));
        const notes = acts.filter(a => a.type === 'NOTE' || (a.title && a.title.toLowerCase().includes('not')));
        return {
            totalCalls: calls.length,
            aiCalls: aiCalls.length,
            humanCalls: Math.max(0, humanCalls),
            reachedCalls: reachedCalls.length,
            failedCalls: failedCalls.length,
            meetings: meetings.length,
            notes: notes.length
        };
    };

    const formatActivityDate = (dateVal) => {
        if (!dateVal) return '';
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = d.toDateString() === yesterday.toDateString();
        const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        if (isToday) return `Bugün, ${timeStr}`;
        if (isYesterday) return `Dün, ${timeStr}`;
        return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}, ${timeStr}`;
    };

    const getStagesForCase = (caseObj) => {
        const funnels = Array.isArray(availableFunnels) ? availableFunnels : [];
        if (caseObj?.funnelType) {
            const found = funnels.find(f => f.id === caseObj.funnelType);
            if (found && found.stages?.length) return found.stages;
        }
        if (funnels.length > 0 && funnels[0]?.stages?.length) {
            return funnels[0].stages;
        }
        return [];
    };

    const handleCaseStageChange = async (contact, caseItem, newStageId) => {
        try {
            setContacts(prev => prev.map(c => {
                if (c.id !== contact.id) return c;
                const updatedCases = (c.cases || []).map(cs => 
                    cs.id === caseItem.id ? { ...cs, funnelStageId: newStageId } : cs
                );
                return {
                    ...c,
                    cases: updatedCases,
                    activeCase: c.activeCase?.id === caseItem.id ? { ...c.activeCase, funnelStageId: newStageId } : c.activeCase
                };
            }));
            if (currentWorkspace?.id && caseItem?.id) {
                await caseAPI.update(currentWorkspace.id, caseItem.id, { funnelStageId: newStageId });
            }
        } catch (err) {
            console.error('Vaka aşaması güncellenemedi:', err);
            silentReloadContacts();
        }
    };

    const handleCaseQuickNote = async (contactId, caseId) => {
        const key = `${contactId}_case_${caseId}`;
        const text = quickNotes[key];
        if (!text || !text.trim()) return;
        try {
            await activityAPI.createActivity(contactId, {
                type: 'NOTE',
                description: text.trim(),
                workspaceId: currentWorkspace?.id,
                caseId: caseId
            });
            setQuickNotes(prev => ({ ...prev, [key]: '' }));
            silentReloadContacts();
        } catch (err) {
            console.error('Vaka notu kaydedilemedi:', err);
        }
    };

    const getCardAvatarColor = (contact) => {
        const colors = [
            'linear-gradient(135deg, #ef4444, #dc2626)',
            'linear-gradient(135deg, #3b82f6, #2563eb)',
            'linear-gradient(135deg, #10b981, #059669)',
            'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            'linear-gradient(135deg, #f97316, #ea580c)',
            'linear-gradient(135deg, #ec4899, #db2777)',
            'linear-gradient(135deg, #14b8a6, #0d9488)',
        ];
        const id = contact?.id || '';
        const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    const getCardInitials = (contact) => {
        const name = getDisplayName(contact);
        if (!name || typeof name !== 'string') return '??';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        if (parts.length === 1 && parts[0]) {
            return parts[0].slice(0, 2).toUpperCase();
        }
        return '??';
    };

    const getCaseStageInfo = (caseObj) => {
        if (!caseObj) return null;
        if (caseObj.status === 'WON') return { text: '✓ Kazanıldı', bg: '#d1fae5', color: '#065f46' };
        if (caseObj.status === 'LOST') return { text: '✗ Kaybedildi', bg: '#fef2f2', color: '#dc2626' };
        if (caseObj.status === 'CLOSED') return { text: 'Kapandı', bg: '#f1f5f9', color: '#64748b' };
        const stageId = caseObj.funnelStageId;
        if (!stageId) return { text: 'Belirsiz', bg: '#f1f5f9', color: '#64748b' };
        let foundStage = null;
        const funnels = Array.isArray(availableFunnels) ? availableFunnels : [];
        for (const f of funnels) {
            const s = (f.stages || []).find(st => (st.id || st.value) === stageId);
            if (s) { foundStage = s; break; }
        }
        if (foundStage) return { text: foundStage.name, bg: (foundStage.color || '#6366f1') + '18', color: foundStage.color || '#6366f1' };
        return { text: 'Aşama', bg: '#ede9fe', color: '#7c3aed' };
    };

    const getOverallTouchDays = (contact) => {
        if (!contact) return null;
        const lastMsg = contact.lastMessageAt ? daysSince(contact.lastMessageAt) : null;
        const acts = contact.activities || [];
        const lastCallAct = acts.filter(a => a.type === 'CALL' || a.type === 'REMINDER').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        const lastCallDays = lastCallAct ? daysSince(lastCallAct.createdAt) : null;
        const minDays = [lastMsg, lastCallDays].filter(d => d !== null);
        if (minDays.length === 0) return null;
        return Math.min(...minDays);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    // Get display name - prioritize profile name for social media contacts
    const getDisplayName = (contact) => {
        if (!contact) return 'İsimsiz';
        const isSocialContact = contact.facebookId || contact.instagramId || contact.whatsappId;
        if (isSocialContact) {
            return contact.name || contact.fullName || 'İsimsiz';
        }
        return contact.fullName || contact.name || 'İsimsiz';
    };

    const getAvatarUrl = (contact) => {
        if (contact.avatar) return contact.avatar;
        const name = getDisplayName(contact);
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ef4444&color=fff&size=150`;
    };

    const getActiveTab = () => {
        if (categoryFilter === 'CUSTOMER') return 'customers';
        if (selectedFunnelIds.length === 1) return `funnel-${selectedFunnelIds[0]}`;
        if (funnelFilter !== 'ALL') return `funnel-${funnelFilter}`;
        return 'all';
    };

    const handleTabClick = (tabId, funnelId = null) => {
        if (tabId === 'all') {
            setCategoryFilter('ALL');
            setFunnelFilter('ALL');
            setFunnelStageFilter('ALL');
            setMergedFunnelIds(null);
            setSelectedFunnelIds([]);
        } else if (tabId === 'customers') {
            setCategoryFilter('CUSTOMER');
            setFunnelFilter('ALL');
            setFunnelStageFilter('ALL');
            setMergedFunnelIds(null);
            setSelectedFunnelIds([]);
        } else if (tabId.startsWith('funnel-')) {
            setCategoryFilter('ALL');
            setFunnelFilter('ALL');
            setFunnelStageFilter('ALL');
            setMergedFunnelIds(null);
            setSelectedFunnelIds(prev => {
                if (prev.includes(funnelId)) {
                    return prev.filter(id => id !== funnelId);
                } else {
                    return [...prev, funnelId];
                }
            });
        }
        setPage(1);
    };

    if (!currentWorkspace) {
        return (
            <div className="empty-state">
                <p>Lütfen bir workspace seçin</p>
            </div>
        );
    }

    return (
        <>
            <div className="contacts-page">
                {/* Main Content */}
                <div className="contacts-main">
                    {/* Header */}
                    <div className="contacts-header">
                        <h1>Kişiler</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '800px' }}>
                            <div className="contacts-search" style={{ flex: 1, maxWidth: 'none' }}>
                                <Search size={18} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Kişi ara..."
                                    value={search}
                                    onChange={handleSearch}
                                />
                            </div>

                            {/* Filtreler Popover */}
                            <div className="contacts-filter-popover-wrapper" ref={filtersDropdownRef} style={{ position: 'relative' }}>
                                <button
                                    className={`btn-filters-toggle ${filtersDropdownOpen ? 'active' : ''} ${
                                        (funnelFilter !== 'ALL' || funnelStageFilter !== 'ALL' || mergedFunnelIds || assignmentFilter !== 'all' || sourceFilter !== 'ALL' || tagFilter !== 'ALL' || topicCategoryFilter !== 'ALL' || segmentFilter !== 'ALL') ? 'has-active' : ''
                                    }`}
                                    onClick={() => setFiltersDropdownOpen(o => !o)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        height: '28px',
                                        padding: '0 8px',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        background: '#ffffff',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        color: '#475569',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <Filter size={12} />
                                    <span>Filtreler</span>
                                    {(() => {
                                        let activeCount = 0;
                                        if (funnelFilter !== 'ALL' || funnelStageFilter !== 'ALL' || mergedFunnelIds) activeCount++;
                                        if (assignmentFilter !== 'all') activeCount++;
                                        if (sourceFilter !== 'ALL') activeCount++;
                                        if (tagFilter !== 'ALL') activeCount++;
                                        if (topicCategoryFilter !== 'ALL') activeCount++;
                                        if (segmentFilter !== 'ALL') activeCount++;
                                        return activeCount > 0 ? (
                                            <span className="filters-badge-count" style={{
                                                background: '#ef4444',
                                                color: '#ffffff',
                                                borderRadius: '50%',
                                                width: '16px',
                                                height: '16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '9px',
                                                fontWeight: 700,
                                                marginLeft: '2px'
                                            }}>{activeCount}</span>
                                        ) : null;
                                    })()}
                                </button>

                                {/* Filtreleri Temizle */}
                                <button
                                    onClick={() => {
                                        setDateFilter('MONTH');
                                        setDateFrom('');
                                        setDateTo('');
                                        setStatusFilter('ALL');
                                        setFunnelFilter('ALL');
                                        setFunnelStageFilter('ALL');
                                        setMergedFunnelIds(null);
                                        setAssignmentFilter('all');
                                        setSourceFilter('ALL');
                                        setTagFilter('ALL');
                                        setTopicCategoryFilter('ALL');
                                        setSegmentFilter('ALL');
                                        setCategoryFilter('ALL');
                                        setBranchFilter('ALL');
                                        setCallStatusFilter('ALL');
                                        setContactInfoFilter('ALL');
                                        setImportGroupFilter('ALL');
                                        setScoreFilter('ALL');
                                        setQuickFilterMode('ALL');
                                        setOnlyOpenCases(false);
                                        setSearch('');
                                        setPage(1);
                                    }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        height: '28px',
                                        padding: '0 8px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        background: '#f8fafc',
                                        fontSize: '0.68rem',
                                        fontWeight: 500,
                                        color: '#94a3b8',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        marginLeft: '4px'
                                    }}
                                    title="Tüm filtreleri temizle (Bu Ay - Tümü)"
                                >
                                    <X size={10} />
                                    <span>Temizle</span>
                                </button>

                                {filtersDropdownOpen && (
                                    <div className="contacts-filters-dropdown" style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 6px)',
                                        left: 0,
                                        zIndex: 9999,
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                                        padding: '12px 14px',
                                        width: '280px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '2px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>Filtreler</span>
                                            {(funnelFilter !== 'ALL' || funnelStageFilter !== 'ALL' || mergedFunnelIds || assignmentFilter !== 'all' || sourceFilter !== 'ALL' || tagFilter !== 'ALL' || topicCategoryFilter !== 'ALL' || segmentFilter !== 'ALL' || scoreFilter !== 'ALL') && (
                                                <button
                                                    onClick={() => {
                                                        setFunnelFilter('ALL');
                                                        setFunnelStageFilter('ALL');
                                                        setMergedFunnelIds(null);
                                                        setAssignmentFilter('all');
                                                        setSourceFilter('ALL');
                                                        setTagFilter('ALL');
                                                        setTopicCategoryFilter('ALL');
                                                        setSegmentFilter('ALL');
                                                        setScoreFilter('ALL');
                                                        setPage(1);
                                                        setFiltersDropdownOpen(false);
                                                    }}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#ef4444',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        padding: 0
                                                    }}
                                                >
                                                    Sıfırla
                                                </button>
                                            )}
                                        </div>

                                        {/* Durum / Huni Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Durum (Huni)</label>
                                            <select
                                                value={(() => {
                                                    if (mergedFunnelIds) return 'GENEL_ALL';
                                                    if (funnelFilter === 'ALL' && funnelStageFilter === 'ALL') return 'ALL';
                                                    if (funnelStageFilter !== 'ALL') return `STAGE_${funnelStageFilter}_${funnelFilter}`;
                                                    return `FUNNEL_${funnelFilter}`;
                                                })()}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setPage(1);
                                                    if (val === 'ALL') {
                                                        setFunnelFilter('ALL');
                                                        setFunnelStageFilter('ALL');
                                                        setMergedFunnelIds(null);
                                                    } else if (val === 'GENEL_ALL') {
                                                        const MERGE_NAMES = ['genel crm (otomatik i̇şlem)', 'genel crm (otomatik işlem)', 'genel'];
                                                        const genelGroup = availableFunnels.filter(f => MERGE_NAMES.includes(f.name.toLowerCase()));
                                                        setMergedFunnelIds(genelGroup.map(f => f.id));
                                                        setFunnelFilter('ALL');
                                                        setFunnelStageFilter('ALL');
                                                    } else if (val.startsWith('FUNNEL_')) {
                                                        const fId = val.replace('FUNNEL_', '');
                                                        const funnel = availableFunnels.find(f => f.id === fId);
                                                        const matchingStage = funnel?.stages?.find(
                                                            s => s.name.toLowerCase() === funnel.name.toLowerCase()
                                                        );
                                                        setMergedFunnelIds(null);
                                                        if (matchingStage) {
                                                            setFunnelFilter(fId);
                                                            setFunnelStageFilter(matchingStage.id);
                                                        } else {
                                                            setFunnelFilter(fId);
                                                            setFunnelStageFilter('ALL');
                                                        }
                                                    } else if (val.startsWith('STAGE_')) {
                                                        const parts = val.split('_');
                                                        const stageId = parts[1];
                                                        const parentId = parts[2];
                                                        setMergedFunnelIds(null);
                                                        setFunnelFilter(parentId);
                                                        setFunnelStageFilter(stageId);
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="ALL">Tüm Durumlar</option>
                                                {(() => {
                                                    const MERGE_NAMES = ['genel crm (otomatik i̇şlem)', 'genel crm (otomatik işlem)', 'genel'];
                                                    const genelGroup = availableFunnels.filter(f => MERGE_NAMES.includes(f.name.toLowerCase()));
                                                    const otherFunnels = availableFunnels.filter(f => !MERGE_NAMES.includes(f.name.toLowerCase()));
                                                    const options = [];

                                                    if (genelGroup.length > 0) {
                                                        options.push(<option key="genel-all" value="GENEL_ALL">Genel (Tümü)</option>);
                                                        const combinedStages = genelGroup.flatMap(f => (f.stages || []).map(s => ({ ...s, _parentId: f.id })));
                                                        combinedStages.forEach(stage => {
                                                            const sc1 = quickStats.funnelStageCounts?.[stage.id] || 0;
                                                            options.push(<option key={stage.id} value={`STAGE_${stage.id}_${stage._parentId}`}>  ↳ {stage.name} ({sc1})</option>);
                                                        });
                                                    }

                                                    otherFunnels.forEach(funnel => {
                                                        options.push(
                                                            <optgroup key={funnel.id} label={funnel.name}>
                                                                <option value={`FUNNEL_${funnel.id}`}>{funnel.name} (Tümü)</option>
                                                                {(funnel.stages || []).map(stage => (
                                                                    <option key={stage.id} value={`STAGE_${stage.id}_${funnel.id}`}>  ↳ {stage.name} ({quickStats.funnelStageCounts?.[stage.id] || 0})</option>
                                                                ))}
                                                            </optgroup>
                                                        );
                                                    });
                                                    return options;
                                                })()}
                                            </select>
                                        </div>

                                        {/* Atama Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Atama</label>
                                            <select
                                                value={assignmentFilter}
                                                onChange={(e) => {
                                                    setAssignmentFilter(e.target.value);
                                                    setPage(1);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="all">Tüm Atamalar</option>
                                                <option value="unassigned">Atanmamışlar</option>
                                                {teams.map(team => {
                                                    const teamMembers = team.members || [];
                                                    return (
                                                        <optgroup key={team.id} label={team.name}>
                                                            <option value={`team_${team.id}`}>🏢 {team.name} (Tümü)</option>
                                                            {teamMembers.map(member => {
                                                                const mUser = member.user || member;
                                                                const mId = mUser.id || member.userId;
                                                                const mName = mUser.name || 'İsimsiz';
                                                                return (
                                                                    <option key={mId} value={`user_${mId}`}>👤 {mName}</option>
                                                                );
                                                            })}
                                                        </optgroup>
                                                    );
                                                })}
                                                {(() => {
                                                    const teamMemberIds = new Set();
                                                    teams.forEach(t => (t.members || []).forEach(m => {
                                                        teamMemberIds.add(m.user?.id || m.userId || m.id);
                                                    }));
                                                    const unteamedMembers = members.filter(m => {
                                                        const mId = m.user?.id || m.userId || m.id;
                                                        return !teamMemberIds.has(mId);
                                                    });
                                                    if (unteamedMembers.length === 0) return null;
                                                    return (
                                                        <optgroup label="Takımsız">
                                                            {unteamedMembers.map(m => {
                                                                const mId = m.user?.id || m.userId || m.id;
                                                                const mName = m.user?.name || m.name || 'İsimsiz';
                                                                return (
                                                                    <option key={mId} value={`user_${mId}`}>👤 {mName}</option>
                                                                );
                                                            })}
                                                        </optgroup>
                                                    );
                                                })()}
                                            </select>
                                        </div>

                                        {/* Kaynak Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Skor</label>
                                            <select
                                                value={scoreFilter}
                                                onChange={(e) => {
                                                    setScoreFilter(e.target.value);
                                                    setPage(1);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="ALL">Tümü</option>
                                                <option value="COLD">🔵 Soğuk (0-20)</option>
                                                <option value="COOL">🟢 Ilık (21-40)</option>
                                                <option value="WARM">🟡 Sıcak (41-60)</option>
                                                <option value="HOT">🟠 Çok Sıcak (61-80)</option>
                                                <option value="FIRE">🔴 Yanıyor (81-100)</option>
                                            </select>
                                        </div>

                                        {/* Kaynak Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kaynak</label>
                                            <select
                                                value={sourceFilter}
                                                onChange={(e) => {
                                                    setSourceFilter(e.target.value);
                                                    setPage(1);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                {SOURCE_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Etiket Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Etiket</label>
                                            <select
                                                value={tagFilter}
                                                onChange={(e) => {
                                                    setTagFilter(e.target.value);
                                                    setPage(1);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="ALL">Tüm Etiketler</option>
                                                {availableTags.map(tag => (
                                                    <option key={tag} value={tag}>{tag}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Şube Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Şube</label>
                                            <select
                                                value={branchFilter}
                                                onChange={(e) => {
                                                    setBranchFilter(e.target.value);
                                                    setPage(1);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="ALL">Tüm Şubeler</option>
                                                {branches.map(branch => (
                                                    <option key={branch.id} value={branch.id}>
                                                        {branch.name} {!branch.isActive ? '(Pasif)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Kategori (Topic) Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kategori</label>
                                            <select
                                                value={topicCategoryFilter}
                                                onChange={(e) => {
                                                    setTopicCategoryFilter(e.target.value);
                                                    setPage(1);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="ALL">Tüm Kategoriler</option>
                                                {availableTopicCategories.map(cat => (
                                                    <option key={cat.id} value={cat.id}>
                                                        {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Akıllı Segmentler */}
                                        {Object.keys(segmentGroups).length > 0 && (
                                            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>📊 Akıllı Segmentler</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                                    <button
                                                        onClick={() => setSegmentFilter('ALL')}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            padding: '4px 10px', borderRadius: 16,
                                                            fontSize: 11, fontWeight: 500, cursor: 'pointer',
                                                            border: segmentFilter === 'ALL' ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                                                            background: segmentFilter === 'ALL' ? '#eff6ff' : '#fff',
                                                            color: segmentFilter === 'ALL' ? '#2563eb' : '#475569',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        Tümü
                                                    </button>
                                                    {Object.entries(segmentGroups).map(([groupKey, segs]) => (
                                                        segs.map(seg => (
                                                            <button
                                                                key={seg.id}
                                                                onClick={() => setSegmentFilter(segmentFilter === seg.id ? 'ALL' : seg.id)}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                                                    padding: '4px 8px', borderRadius: 16,
                                                                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                                                                    border: segmentFilter === seg.id ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                                                                    background: segmentFilter === seg.id ? '#eff6ff' : '#fff',
                                                                    color: segmentFilter === seg.id ? '#2563eb' : '#475569',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                <span style={{ fontSize: 12 }}>{seg.icon}</span>
                                                                {seg.label}
                                                                {segmentCounts[seg.id] !== undefined && (
                                                                    <span style={{
                                                                        fontSize: 9, fontWeight: 700, padding: '1px 4px',
                                                                        borderRadius: 8,
                                                                        background: segmentFilter === seg.id ? '#3b82f6' : '#f1f5f9',
                                                                        color: segmentFilter === seg.id ? '#fff' : '#64748b'
                                                                    }}>
                                                                        {segmentCounts[seg.id]}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        ))
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                        </div>
                        {/* Date Presets & Quick Filter — Modern Segmented Control */}
                        <div className="contacts-date-presets">
                            <div className="contacts-segmented-control">
                                <button
                                    type="button"
                                    className={`contacts-segmented-btn ${dateFilter === 'TODAY' ? 'active' : ''}`}
                                    onClick={() => { setDateFilter('TODAY'); setDateFrom(''); setDateTo(''); setPage(1); }}
                                >
                                    Bugün
                                </button>
                                <button
                                    type="button"
                                    className={`contacts-segmented-btn ${dateFilter === 'WEEK' ? 'active' : ''}`}
                                    onClick={() => { setDateFilter('WEEK'); setDateFrom(''); setDateTo(''); setPage(1); }}
                                >
                                    Bu Hafta
                                </button>
                                <button
                                    type="button"
                                    className={`contacts-segmented-btn ${dateFilter === 'MONTH' ? 'active' : ''}`}
                                    onClick={() => { setDateFilter('MONTH'); setDateFrom(''); setDateTo(''); setPage(1); }}
                                >
                                    Bu Ay
                                </button>
                                <button
                                    type="button"
                                    className={`contacts-segmented-btn ${dateFilter === 'ALL' ? 'active' : ''}`}
                                    onClick={() => { setDateFilter('ALL'); setDateFrom(''); setDateTo(''); setPage(1); }}
                                >
                                    Tümü
                                </button>

                                {/* Diğer ▾ Popover */}
                                <div style={{ position: 'relative' }} ref={dateFilterRef}>
                                    <button
                                        type="button"
                                        className={`contacts-segmented-btn ${['YESTERDAY', 'LAST_WEEK', 'LAST_MONTH', 'YEAR', 'LAST_YEAR', 'CUSTOM'].includes(dateFilter) ? 'active' : ''}`}
                                        onClick={() => setDateFilterOpen(o => !o)}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                    >
                                        <Calendar size={11} style={{ opacity: 0.8 }} />
                                        <span>
                                            {(() => {
                                                if (dateFilter === 'YESTERDAY') return 'Dün';
                                                if (dateFilter === 'LAST_WEEK') return 'Geçen Hafta';
                                                if (dateFilter === 'LAST_MONTH') return 'Geçen Ay';
                                                if (dateFilter === 'YEAR') return 'Bu Yıl';
                                                if (dateFilter === 'LAST_YEAR') return 'Geçen Yıl';
                                                if (dateFilter === 'CUSTOM') {
                                                    if (dateFrom || dateTo) return `${dateFrom ? dateFrom.slice(5) : '...'} - ${dateTo ? dateTo.slice(5) : '...'}`;
                                                    return 'Özel';
                                                }
                                                return 'Diğer';
                                            })()}
                                        </span>
                                        <ChevronDown size={10} style={{ opacity: 0.6 }} />
                                    </button>

                                    {dateFilterOpen && (
                                        <div className="contacts-date-more-dropdown">
                                            <div style={{ padding: '2px 0' }}>
                                                {[
                                                    ['YESTERDAY', 'Dün'],
                                                    ['LAST_WEEK', 'Geçen Hafta'],
                                                    ['LAST_MONTH', 'Geçen Ay'],
                                                    ['YEAR', 'Bu Yıl'],
                                                    ['LAST_YEAR', 'Geçen Yıl'],
                                                ].map(([k, label]) => (
                                                    <button
                                                        key={k}
                                                        type="button"
                                                        className={`contacts-date-dropdown-item ${dateFilter === k ? 'active' : ''}`}
                                                        onClick={() => {
                                                            setDateFilter(k);
                                                            setDateFrom('');
                                                            setDateTo('');
                                                            setPage(1);
                                                            setDateFilterOpen(false);
                                                        }}
                                                    >
                                                        <span>{label}</span>
                                                        {dateFilter === k && <Check size={12} style={{ color: '#ef4444' }} />}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Özel Aralık Bölümü */}
                                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginTop: '4px', paddingLeft: '4px', paddingRight: '4px' }}>
                                                <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                                    Özel Tarih Aralığı
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>Başlangıç</label>
                                                        <input
                                                            type="date"
                                                            value={dateFrom}
                                                            onChange={e => { setDateFrom(e.target.value); setDateFilter('CUSTOM'); setPage(1); }}
                                                            style={{
                                                                width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0',
                                                                borderRadius: '6px', fontSize: '11px', outline: 'none', color: '#334155'
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>Bitiş</label>
                                                        <input
                                                            type="date"
                                                            value={dateTo}
                                                            onChange={e => { setDateTo(e.target.value); setDateFilter('CUSTOM'); setPage(1); }}
                                                            style={{
                                                                width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0',
                                                                borderRadius: '6px', fontSize: '11px', outline: 'none', color: '#334155'
                                                            }}
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDateFilterOpen(false)}
                                                        style={{
                                                            marginTop: '4px',
                                                            padding: '6px 0',
                                                            background: '#ef4444',
                                                            color: '#fff',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            transition: 'background 0.15s'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
                                                        onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
                                                    >
                                                        Uygula
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Kapananları Gizle Toggle Chip */}
                            <button
                                type="button"
                                onClick={() => setOnlyOpenCases(!onlyOpenCases)}
                                className={`contacts-toggle-filter-btn ${onlyOpenCases ? 'active' : ''}`}
                                title={onlyOpenCases ? "Kapanan/çözümlenen vakalar gizleniyor. Tıklayarak tümünü gösterin." : "Kapanan/çözümlenen vakaları gizle"}
                            >
                                <EyeOff size={13} style={{ opacity: onlyOpenCases ? 1 : 0.6 }} />
                                <span>Kapananları Gizle</span>
                            </button>
                        </div>

                        <div className="header-right-actions">
                            <button
                                className="btn-add-contact"
                                onClick={() => setIsModalOpen(true)}
                            >
                                <Plus size={14} />
                            </button>
                            <div className="cust-view-switch">
                                {[
                                    { key: 'list', icon: <List size={14} />, label: 'Tablo' },
                                    { key: 'card', icon: <KanbanSquare size={14} />, label: 'Kart' },
                                    { key: 'pipeline', icon: <BarChart3 size={14} />, label: 'Pipeline' }
                                ].map(v => (
                                    <button
                                        key={v.key}
                                        className={`cust-view-switch-btn ${viewMode === v.key ? 'active' : ''}`}
                                        onClick={() => { setViewMode(v.key); if (v.key === 'card') setSelectedContact(null); try { localStorage.setItem(`customers_viewMode_${currentWorkspace?.id}`, v.key); } catch {} }}
                                        title={v.label}
                                    >
                                        {v.icon}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ═══ ORTAK HIZLI İSTATİSTİK & AKIŞ FİLTRE ÇUBUĞU (Hem Tablo Hem Kart Modunda) ═══ */}
                    {viewMode !== 'pipeline' && (
                        <div className="contacts-quick-stats-bar" style={{ padding: '6px 24px 8px', borderBottom: '1px solid #f1f5f9', background: '#ffffff', flexShrink: 0 }}>
                            <div className="contacts-quick-stats" style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                {/* Akış Seçici — Pill tarzı dropdown */}
                                <select
                                    value={selectedFunnelIds.length === 1 ? selectedFunnelIds[0] : ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (!val) {
                                            setSelectedFunnelIds([]);
                                            setFunnelFilter('ALL');
                                            setFunnelStageFilter('ALL');
                                            setMergedFunnelIds(null);
                                        } else {
                                            setSelectedFunnelIds([val]);
                                            setFunnelFilter('ALL');
                                            setFunnelStageFilter('ALL');
                                            setMergedFunnelIds(null);
                                        }
                                        setPage(1);
                                    }}
                                    style={{
                                        height: '28px',
                                        borderRadius: '14px',
                                        border: selectedFunnelIds.length > 0 ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        padding: '0 12px',
                                        cursor: 'pointer',
                                        background: selectedFunnelIds.length > 0 ? '#eef2ff' : '#ffffff',
                                        color: selectedFunnelIds.length > 0 ? '#4f46e5' : '#1e293b',
                                        minWidth: '150px',
                                        flexShrink: 0,
                                        appearance: 'none',
                                        WebkitAppearance: 'none',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                        backgroundRepeat: 'no-repeat',
                                        backgroundPosition: 'right 8px center',
                                        paddingRight: '24px'
                                    }}
                                >
                                    <option value="">Tümü ({quickStats.periodCount || 0})</option>
                                    {availableFunnels.map(funnel => {
                                        const fc = quickStats.funnelCounts || {};
                                        const count = fc[funnel.id] || fc[funnel.name] || 0;
                                        return (
                                            <option key={funnel.id} value={funnel.id}>
                                                {funnel.name} ({count})
                                            </option>
                                        );
                                    })}
                                </select>

                                {/* Ayırıcı Çizgi */}
                                <div style={{ width: '1px', height: '20px', background: '#cbd5e1', margin: '0 8px', flexShrink: 0 }} />

                                {/* Hızlı Filtre Pill'leri */}
                                {[
                                    { key: 'NO_PHONE', label: 'Numarasızlar', icon: PhoneOff, count: (quickStats.noPhoneCount !== undefined && quickStats.noPhoneCount !== null) ? quickStats.noPhoneCount : Math.max(0, (quickStats.periodCount || 0) - (quickStats.withPhoneCount || 0)), colorClass: 'today' },
                                    { key: 'HAS_PHONE', label: 'Numaralılar', icon: Phone, count: quickStats.withPhoneCount || 0, colorClass: 'phone' },
                                    { key: 'AGENT_CALLS', label: 'Arananlar', icon: PhoneCall, count: quickStats.agentCalledCount || 0, colorClass: 'called' },
                                    { key: 'NO_ACTIVITY', label: 'Aranmayanlar', icon: CircleOff, count: quickStats.noActivityCount || 0, colorClass: 'no-activity' },
                                    { key: 'AI_CALLS', label: 'AI Aramaları', icon: Bot, count: quickStats.aiCalledCount || 0, colorClass: 'ai' },
                                    { key: 'SALES', label: 'Müşteriler', icon: UserCheck, count: quickStats.salesCount || 0, colorClass: 'called' },
                                ].map(btn => {
                                    const isActive = quickFilterMode === btn.key;
                                    const IconComp = btn.icon;
                                    return (
                                        <div
                                            key={btn.key}
                                            className={`quick-stat-card ${isActive ? 'quick-stat-active' : ''}`}
                                            onClick={() => {
                                                const newMode = isActive ? 'ALL' : btn.key;
                                                setQuickFilterMode(newMode);
                                                setPage(1);
                                                if (newMode === 'HAS_PHONE') {
                                                    setContactInfoFilter('HAS_PHONE');
                                                    setCallStatusFilter('ALL');
                                                } else if (newMode === 'AGENT_CALLS') {
                                                    setCallStatusFilter('ended');
                                                    setContactInfoFilter('ALL');
                                                } else if (newMode === 'AI_CALLS') {
                                                    setCallStatusFilter('ai_called');
                                                    setContactInfoFilter('ALL');
                                                } else if (newMode === 'NO_ACTIVITY') {
                                                    setCallStatusFilter('no_call');
                                                    setContactInfoFilter('ALL');
                                                } else if (newMode === 'NO_PHONE') {
                                                    setContactInfoFilter('NO_PHONE');
                                                    setCallStatusFilter('ALL');
                                                } else if (newMode === 'SALES') {
                                                    setContactInfoFilter('ALL');
                                                    setCallStatusFilter('ALL');
                                                } else {
                                                    setContactInfoFilter('ALL');
                                                    setCallStatusFilter('ALL');
                                                    setStatusFilter('ALL');
                                                }
                                            }}
                                            style={{ cursor: 'pointer', userSelect: 'none' }}
                                            title={btn.label}
                                        >
                                            <div className={`quick-stat-icon ${btn.colorClass}`}><IconComp size={13} /></div>
                                            {btn.count !== null && btn.count !== undefined && <span className="quick-stat-value">{btn.count}</span>}
                                            <span className="quick-stat-label">{btn.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {viewMode === 'pipeline' && (
                        <div style={{ flex: 1, height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
                            <PipelineView />
                        </div>
                    )}

                    {/* ═══ CARD VIEW V2 (KART İÇİNDE KART — SİDEBAR GEREKTİRMEZ) ═══ */}
                    {viewMode === 'card' && (
                        <div className="cust-card-list-wrapper">
                            {loading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                                    <Loader size={24} className="spin" style={{ color: '#94a3b8' }} />
                                </div>
                            ) : (!contacts || contacts.length === 0) ? (
                                <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>Kişi bulunamadı</div>
                            ) : (
                                <div className="cust-card-list">
                                    {(contacts || []).map(contact => {
                                        const isExpanded = !!expandedCards?.has?.(contact.id);
                                        const allCases = getContactAllCases(contact);
                                        const primaryCase = getPrimaryCase(contact);
                                        const caseCount = allCases.length;
                                        const touchInfo = getCaseTouchInfo(contact, primaryCase);
                                        const channelInfo = getDetailedChannelInfo(contact);
                                        const customerInquiry = getCustomerInquiry(contact);
                                        const phone = getContactPrimaryPhone(contact);
                                        const email = contact.email || (Array.isArray(contact.emails) ? contact.emails[0] : null) || null;
                                        const company = contact.company || contact.companyName || null;
                                        const displayName = getDisplayName(contact);
                                        const lastMsgAgo = timeAgo(contact.lastMessageAt);
                                        const createdShort = contact.createdAt && !isNaN(new Date(contact.createdAt).getTime())
                                            ? new Date(contact.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
                                            : null;
                                        const allContactActs = contact.activities || [];
                                        const contactStats = getActivityCounters(allContactActs);
                                        const leadScore = primaryCase?.leadScore ?? contact.leadScore ?? 0;
                                        const assignedName = primaryCase?.assignedTo?.name || primaryCase?.assignedToName || (Array.isArray(members) ? members.find(m => m.userId === primaryCase?.assignedToId)?.user?.name : null) || contact.assignedTo?.name || null;
                                        const cardMilestones = getCardMilestones(contact);
                                        const isStarred = contact.isStarred || (contact.conversations || []).some(c => c.isStarred);

                                        // Tags
                                        let contactTags = contact.tags || [];
                                        if (typeof contactTags === 'string') {
                                            try { contactTags = JSON.parse(contactTags); } catch { contactTags = []; }
                                        }

                                        // Funnel stage name
                                        const currentStageName = (() => {
                                            const stageId = primaryCase?.funnelStageId || contact.funnelStageId;
                                            if (!stageId) return null;
                                            for (const f of (availableFunnels || [])) {
                                                const st = (f.stages || []).find(s => s.id === stageId);
                                                if (st) return st.name;
                                            }
                                            return null;
                                        })();

                                        // CaseType name
                                        const caseTypeName = primaryCase?.caseType?.name || primaryCase?.caseTypeName || null;

                                        // Additional phones & emails
                                        let extraPhones = [];
                                        if (contact.phones) {
                                            try { extraPhones = typeof contact.phones === 'string' ? JSON.parse(contact.phones) : (Array.isArray(contact.phones) ? contact.phones : []); } catch { extraPhones = []; }
                                        }
                                        let extraEmails = [];
                                        if (contact.emails) {
                                            try { extraEmails = typeof contact.emails === 'string' ? JSON.parse(contact.emails) : (Array.isArray(contact.emails) ? contact.emails : []); } catch { extraEmails = []; }
                                        }

                                        return (
                                            <div
                                                key={contact.id}
                                                className={`cust-card ${isExpanded ? 'cust-card--open' : ''} ${selectedIds.includes(contact.id) ? 'cust-card--selected' : ''} ${isStarred ? 'cust-card--starred' : ''}`}
                                            >
                                                {/* ── KAPALI KART: 3 SATIR KOMPAKT ── */}
                                                <div className="ccv2-collapsed" onClick={() => toggleCardExpanded(contact.id)}>
                                                    {/* SATIR 1: Avatar + İsim + Telefon + Yıldız + Durum */}
                                                    <div className="ccv2-row1">
                                                        <div className="cust-card__avatar" style={{ background: getCardAvatarColor(contact), width: 34, height: 34, fontSize: '0.7rem' }}>
                                                            {getCardInitials(contact)}
                                                            <span className="cust-card__src-dot" style={{ background: channelInfo.badgeColor || '#94a3b8' }}>
                                                                {channelInfo.icon || '📥'}
                                                            </span>
                                                        </div>
                                                        <div className="ccv2-identity">
                                                            <span className="ccv2-name" onClick={(e) => { e.stopPropagation(); handleSelectContact(contact); }} title="Kişi Detay Panelini Aç">
                                                                {isStarred && <span className="ccv2-star">⭐</span>}
                                                                {displayName}
                                                            </span>
                                                            {phone && (
                                                                <a href={`tel:${phone}`} onClick={e => e.stopPropagation()} className="ccv2-phone">
                                                                    <Phone size={10} /> {phone}
                                                                </a>
                                                            )}
                                                            {!phone && <span className="ccv2-no-phone">telefon yok</span>}
                                                            {email && <span className="ccv2-email">{email}</span>}
                                                            {company && <span className="ccv2-company">🏢 {company}</span>}
                                                        </div>
                                                        <div className="ccv2-status-area" onClick={e => e.stopPropagation()}>
                                                            <span className={`ccv2-touch-badge ${touchInfo?.color === '#15803d' ? 'ccv2-touch--ok' : touchInfo?.color === '#d97706' ? 'ccv2-touch--warn' : 'ccv2-touch--danger'}`}>
                                                                <span className="ccv2-touch-dot" style={{ background: touchInfo?.color || '#dc2626' }}></span>
                                                                {touchInfo?.text || 'Hiç aranmadı'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* SATIR 2: Pill etiketler — CaseType, Aşama, Kaynak, Atanan, Puan, Etiketler */}
                                                    <div className="ccv2-row2">
                                                        {caseCount > 0 && (
                                                            <span className="ccv2-pill ccv2-pill--count">{caseCount} Vaka</span>
                                                        )}
                                                        {caseTypeName && <span className="ccv2-pill ccv2-pill--type">{caseTypeName}</span>}
                                                        {currentStageName && <span className="ccv2-pill ccv2-pill--stage">{currentStageName}</span>}
                                                        <span className="ccv2-pill ccv2-pill--source">{channelInfo.icon} {channelInfo.label}</span>
                                                        {assignedName && <span className="ccv2-pill ccv2-pill--assigned">👤 {assignedName}</span>}
                                                        {leadScore >= 30 && <span className="ccv2-pill ccv2-pill--hot">🔥 Sıcak ({leadScore})</span>}
                                                        {leadScore >= 15 && leadScore < 30 && <span className="ccv2-pill ccv2-pill--warm">⚡ Ilık ({leadScore})</span>}
                                                        {contactTags.slice(0, 3).map((tag, ti) => (
                                                            <span key={ti} className="ccv2-pill ccv2-pill--tag">{String(tag)}</span>
                                                        ))}
                                                        {contactTags.length > 3 && <span className="ccv2-pill ccv2-pill--tag">+{contactTags.length - 3}</span>}
                                                    </div>

                                                    {/* SATIR 3: Talep özeti + Süre + Aksiyon butonları */}
                                                    <div className="ccv2-row3">
                                                        <span className="ccv2-inquiry">
                                                            📝 {customerInquiry?.title || contact.lastNote || (contact.conversations?.[0]?.messages?.[0]?.content?.slice(0, 80)) || '—'}
                                                        </span>
                                                        <span className="ccv2-time-ago">{lastMsgAgo || createdShort || ''}</span>
                                                        <div className="ccv2-quick-btns" onClick={e => e.stopPropagation()}>
                                                            {phone && (
                                                                <a href={`tel:${phone}`} className="ccv2-qb ccv2-qb--call" title="Ara">
                                                                    <PhoneCall size={12} />
                                                                </a>
                                                            )}
                                                            {phone && (
                                                                <a href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="ccv2-qb ccv2-qb--wa" title="WhatsApp">
                                                                    <MessageCircle size={12} />
                                                                </a>
                                                            )}
                                                            <button type="button" className="ccv2-qb ccv2-qb--expand" title={isExpanded ? 'Kapat' : 'Detayları Aç'}>
                                                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Sabitlenmiş Not */}
                                                {contact.lastNote && !isExpanded && (
                                                    <div className="ccv2-pinned-note">
                                                        <span>📌</span>
                                                        <span className="ccv2-pinned-text">{contact.lastNote}</span>
                                                    </div>
                                                )}

                                                {/* ── AÇIK KART: İLETİŞİM + VAKA KARTLARI ── */}
                                                {isExpanded && (
                                                    <div className="ccv2-expanded" onClick={e => e.stopPropagation()}>
                                                        
                                                        {/* İLETİŞİM BİLGİLERİ TABLOSU */}
                                                        <div className="ccv2-info-grid">
                                                            <div className="ccv2-ig-item">
                                                                <span className="ccv2-ig-label">TELEFON</span>
                                                                <span className="ccv2-ig-val" style={{ fontFamily: 'monospace' }}>
                                                                    {phone ? (
                                                                        <a href={`tel:${phone}`} style={{ textDecoration: 'none', color: '#10b981' }}>{phone}</a>
                                                                    ) : <i style={{ color: '#cbd5e1' }}>Yok</i>}
                                                                    {extraPhones.filter(p => p && p !== phone).slice(0, 2).map((p, i) => (
                                                                        <span key={i} style={{ marginLeft: 6, color: '#64748b', fontSize: '0.68rem' }}>
                                                                            · <a href={`tel:${p}`} style={{ textDecoration: 'none', color: '#64748b' }}>{p}</a>
                                                                        </span>
                                                                    ))}
                                                                </span>
                                                            </div>
                                                            <div className="ccv2-ig-item">
                                                                <span className="ccv2-ig-label">E-POSTA</span>
                                                                <span className="ccv2-ig-val">{email || <i style={{ color: '#cbd5e1' }}>Yok</i>}</span>
                                                            </div>
                                                            <div className="ccv2-ig-item">
                                                                <span className="ccv2-ig-label">KANAL</span>
                                                                <span className="ccv2-ig-val" style={{ fontWeight: 600, color: channelInfo.badgeColor }}>
                                                                    {channelInfo.icon} {channelInfo.label}
                                                                    {channelInfo.extra && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 4 }}>· {channelInfo.extra}</span>}
                                                                </span>
                                                            </div>
                                                            <div className="ccv2-ig-item">
                                                                <span className="ccv2-ig-label">REKLAM / KAMPANYA</span>
                                                                <span className="ccv2-ig-val">{channelInfo.campaign || channelInfo.form || channelInfo.page || 'Organik'}</span>
                                                            </div>
                                                            <div className="ccv2-ig-item">
                                                                <span className="ccv2-ig-label">İLK KAYIT</span>
                                                                <span className="ccv2-ig-val">
                                                                    {contact.createdAt && !isNaN(new Date(contact.createdAt).getTime())
                                                                        ? new Date(contact.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
                                                                        : '—'}
                                                                </span>
                                                            </div>
                                                            {company && (
                                                                <div className="ccv2-ig-item">
                                                                    <span className="ccv2-ig-label">FİRMA</span>
                                                                    <span className="ccv2-ig-val">🏢 {company}</span>
                                                                </div>
                                                            )}
                                                            {(contact.country || contact.city) && (
                                                                <div className="ccv2-ig-item">
                                                                    <span className="ccv2-ig-label">ÜLKE / ŞEHİR</span>
                                                                    <span className="ccv2-ig-val">
                                                                        📍 {contact.country === 'Türkiye' ? '🇹🇷' : contact.country === 'Almanya' ? '🇩🇪' : contact.country === 'İngiltere' ? '🇬🇧' : contact.country === 'ABD' ? '🇺🇸' : contact.country === 'Rusya' ? '🇷🇺' : ''}{' '}
                                                                        {[contact.country, contact.city].filter(Boolean).join(' · ')}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {contact.language && (
                                                                <div className="ccv2-ig-item">
                                                                    <span className="ccv2-ig-label">DİL</span>
                                                                    <span className="ccv2-ig-val">
                                                                        🌐 {contact.language === 'tr' ? '🇹🇷 Türkçe' : contact.language === 'en' ? '🇬🇧 English' : contact.language === 'de' ? '🇩🇪 Deutsch' : contact.language === 'fr' ? '🇫🇷 Français' : contact.language === 'ar' ? '🇸🇦 العربية' : contact.language === 'ru' ? '🇷🇺 Русский' : contact.language === 'nl' ? '🇳🇱 Nederlands' : contact.language}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {contact.birthDate && (
                                                                <div className="ccv2-ig-item">
                                                                    <span className="ccv2-ig-label">DOĞUM TARİHİ</span>
                                                                    <span className="ccv2-ig-val">
                                                                        🎂 {new Date(contact.birthDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                                        {(() => { const age = new Date().getFullYear() - new Date(contact.birthDate).getFullYear(); return age > 0 && age < 120 ? <span style={{ marginLeft: 6, color: '#e11d48', fontWeight: 600, fontSize: '0.7rem', background: '#fff1f2', padding: '1px 5px', borderRadius: 4 }}>{age} yaş</span> : null; })()}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {contact.leadSource && (
                                                                <div className="ccv2-ig-item">
                                                                    <span className="ccv2-ig-label">KAYNAK</span>
                                                                    <span className="ccv2-ig-val">🎯 {contact.leadSource}{contact.leadSourceDetail ? ` · ${contact.leadSourceDetail}` : ''}</span>
                                                                </div>
                                                            )}
                                                            {contactTags.length > 0 && (
                                                                <div className="ccv2-ig-item ccv2-ig-item--full">
                                                                    <span className="ccv2-ig-label">ETİKETLER</span>
                                                                    <span className="ccv2-ig-val ccv2-ig-tags">
                                                                        {contactTags.map((tag, ti) => (
                                                                            <span key={ti} className="ccv2-ig-tag">{String(tag)}</span>
                                                                        ))}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {contact.notes && (() => {
                                                                let notesArr = [];
                                                                try { notesArr = JSON.parse(contact.notes); } catch { notesArr = typeof contact.notes === 'string' ? [{ text: contact.notes }] : []; }
                                                                if (!Array.isArray(notesArr) || notesArr.length === 0) return null;
                                                                const latestNote = notesArr[notesArr.length - 1];
                                                                const noteText = typeof latestNote === 'string' ? latestNote : latestNote?.text || latestNote?.note || JSON.stringify(latestNote);
                                                                return (
                                                                    <div className="ccv2-ig-item ccv2-ig-item--full">
                                                                        <span className="ccv2-ig-label">SON NOT</span>
                                                                        <span className="ccv2-ig-val" style={{ color: '#7c3aed', fontStyle: 'italic' }}>📝 {noteText}</span>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>

                                                        {/* AKTİVİTE ÖZET ŞERİDİ */}
                                                        <div className="ccv2-stat-strip">
                                                            {contactStats.totalCalls > 0 ? (
                                                                <span className="ccv2-stat ccv2-stat--call">
                                                                    <PhoneCall size={11} /> {contactStats.totalCalls} Arama
                                                                    {contactStats.failedCalls > 0 && <span className="ccv2-stat-sub">({contactStats.reachedCalls}✓ {contactStats.failedCalls}✗)</span>}
                                                                </span>
                                                            ) : (
                                                                <span className="ccv2-stat ccv2-stat--nocall"><PhoneOff size={11} /> Aranmadı</span>
                                                            )}
                                                            {contactStats.aiCalls > 0 && (
                                                                <span className="ccv2-stat ccv2-stat--ai"><Bot size={11} /> {contactStats.aiCalls} AI</span>
                                                            )}
                                                            {contactStats.meetings > 0 && (
                                                                <span className="ccv2-stat ccv2-stat--meet"><Calendar size={11} /> {contactStats.meetings} Randevu</span>
                                                            )}
                                                            {contactStats.notes > 0 && (
                                                                <span className="ccv2-stat ccv2-stat--note"><StickyNote size={11} /> {contactStats.notes} Not</span>
                                                            )}
                                                        </div>

                                                        {/* VAKA KARTLARI */}
                                                        <div className="ccv2-cases-label">
                                                            📋 Vakalar ({caseCount})
                                                        </div>

                                                        {allCases.length === 0 ? (
                                                            <div className="ccv2-case-card ccv2-case-card--empty">
                                                                <div className="ccv2-case-header">
                                                                    <span className="ccv2-case-dot" style={{ background: '#94a3b8' }}></span>
                                                                    <span className="ccv2-case-title">Açık Vaka Bulunmuyor</span>
                                                                    <button type="button" className="ccv2-case-action-btn" onClick={() => handleSelectContact(contact)}>
                                                                        + Vaka Oluştur
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            allCases.map(c => {
                                                                const isCaseExpanded = expandedCasesInCard[contact.id]?.has?.(c.id);
                                                                const isWon = c.status === 'WON';
                                                                const isLost = c.status === 'LOST';
                                                                const caseAgent = c.assignedTo?.name || c.assignedToName || (Array.isArray(members) ? members.find(m => m.userId === c.assignedToId)?.user?.name : null) || null;
                                                                const cScore = c.leadScore ?? 0;
                                                                const caseDateStr = c.createdAt && !isNaN(new Date(c.createdAt).getTime())
                                                                    ? new Date(c.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
                                                                    : '';
                                                                const caseTypeLabel = c.caseType?.name || c.caseTypeName || '';
                                                                const caseDotColor = c.status === 'ACTIVE' ? '#10b981' : isWon ? '#f59e0b' : isLost ? '#ef4444' : '#94a3b8';

                                                                // Case metadata for badges
                                                                const caseBranch = c.branch?.name || c.branchName || null;
                                                                const caseTeam = c.team?.name || c.teamName || null;
                                                                const caseProducts = c.products || c.product ? [c.product || c.products].flat().filter(Boolean) : [];
                                                                const caseSource = c.source || c.channel || null;
                                                                const caseIsManual = c.source === 'MANUAL' || c.createdBy != null;
                                                                const caseFunnelStage = c.funnelStage?.name || c.stageName || null;
                                                                const caseCategory = c.category || c.categoryName || null;

                                                                // Conversations & messages for chat bubbles
                                                                const caseConversations = (contact.conversations || []).filter(conv => {
                                                                    if (conv.caseId === c.id) return true;
                                                                    if (!conv.caseId && c.id === primaryCase?.id) return true;
                                                                    return false;
                                                                });
                                                                const caseMessages = caseConversations.flatMap(conv =>
                                                                    (conv.messages || []).map(msg => ({
                                                                        ...msg,
                                                                        channel: conv.channel,
                                                                        conversationId: conv.id
                                                                    }))
                                                                ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                                                                // Case-specific milestones
                                                                const caseMilestones = cardMilestones.filter(m => {
                                                                    if (m.rawActivity?.caseId === c.id) return true;
                                                                    if (m.caseId && m.caseId === c.id) return true;
                                                                    if (!m.caseId && !m.rawActivity?.caseId && c.id === primaryCase?.id) return true;
                                                                    return false;
                                                                });

                                                                return (
                                                                    <div key={c.id} className={`ccv2-case-card ${isCaseExpanded ? 'ccv2-case-card--open' : ''} ${c.status === 'ACTIVE' ? 'ccv2-case-card--active' : ''}`}>
                                                                        {/* Vaka Kartı Başlığı */}
                                                                        <div className="ccv2-case-header" onClick={() => toggleCaseInCard(contact.id, c.id)}>
                                                                            <span className="ccv2-case-dot" style={{ background: caseDotColor }}></span>
                                                                            <div className="ccv2-case-info">
                                                                                <div className="ccv2-case-title-row">
                                                                                    <span className="ccv2-case-title">{c.title || `Vaka #${c.caseNumber || ''}`}</span>
                                                                                    {c.caseNumber && <span className="ccv2-case-code">CSE-{c.caseNumber}</span>}
                                                                                    {caseTypeLabel && <span className="ccv2-case-type-pill">{caseTypeLabel}</span>}
                                                                                    {/* Vaka bazlı puan */}
                                                                                    {cScore >= 30 ? (
                                                                                        <span className="ccv2-score ccv2-score--hot">🔥 {cScore}</span>
                                                                                    ) : cScore >= 15 ? (
                                                                                        <span className="ccv2-score ccv2-score--warm">⚡ {cScore}</span>
                                                                                    ) : cScore > 0 ? (
                                                                                        <span className="ccv2-score ccv2-score--cold">❄️ {cScore}</span>
                                                                                    ) : null}
                                                                                    <span className="ccv2-case-status-pill" style={{ 
                                                                                        background: c.status === 'ACTIVE' ? '#dcfce7' : isWon ? '#fef3c7' : isLost ? '#fef2f2' : '#f1f5f9', 
                                                                                        color: c.status === 'ACTIVE' ? '#15803d' : isWon ? '#92400e' : isLost ? '#dc2626' : '#64748b' 
                                                                                    }}>
                                                                                        {c.status === 'ACTIVE' ? 'Aktif' : isWon ? 'Kazanıldı' : isLost ? 'Kaybedildi' : 'Kapandı'}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="ccv2-case-meta">
                                                                                    {caseAgent && <span>👤 {caseAgent}</span>}
                                                                                    {caseDateStr && <span>📅 {caseDateStr}</span>}
                                                                                    {(c.dealValue || c.value) && (
                                                                                        <span className="ccv2-case-value">💰 {Number(c.dealValue || c.value).toLocaleString('tr-TR')} ₺</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div className="ccv2-case-right">
                                                                                <select
                                                                                    value={c.funnelStageId || ''}
                                                                                    onChange={e => { e.stopPropagation(); handleCaseStageChange(contact, c, e.target.value); }}
                                                                                    onClick={e => e.stopPropagation()}
                                                                                    className="ccv2-stage-select"
                                                                                    title="Aşamayı güncelle"
                                                                                >
                                                                                    {getStagesForCase(c).map(st => (
                                                                                        <option key={st.id || st.value} value={st.id || st.value}>{st.name || st.label}</option>
                                                                                    ))}
                                                                                </select>
                                                                                <span className={`ccv2-case-chevron ${isCaseExpanded ? 'ccv2-case-chevron--open' : ''}`}>
                                                                                    <ChevronDown size={14} />
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        {/* Vaka İçi Detay */}
                                                                        {isCaseExpanded && (
                                                                            <div className="ccv2-case-body">

                                                                                {/* ── Case Metadata Badge'leri ── */}
                                                                                <div className="ccv2-case-badges">
                                                                                    {caseSource && <span className="ccv2-cbadge ccv2-cbadge--source">🌐 {caseSource}</span>}
                                                                                    {caseTypeLabel && <span className="ccv2-cbadge ccv2-cbadge--type">{caseTypeLabel}</span>}
                                                                                    <span className="ccv2-cbadge ccv2-cbadge--mode">{caseIsManual ? '👤 Manuel' : '⚡ Otomasyon'}</span>
                                                                                    {caseFunnelStage && <span className="ccv2-cbadge ccv2-cbadge--stage">● {caseFunnelStage}</span>}
                                                                                    {caseCategory && <span className="ccv2-cbadge ccv2-cbadge--cat">{caseCategory}</span>}
                                                                                    {caseBranch && <span className="ccv2-cbadge ccv2-cbadge--branch">🏢 {caseBranch}</span>}
                                                                                    {caseTeam && <span className="ccv2-cbadge ccv2-cbadge--team">👥 {caseTeam}</span>}
                                                                                    {caseProducts.length > 0 && caseProducts.map((p, pi) => (
                                                                                        <span key={pi} className="ccv2-cbadge ccv2-cbadge--product">📦 {typeof p === 'object' ? p.name || p.title : p}</span>
                                                                                    ))}
                                                                                </div>

                                                                                {/* ── Yazışmalar (Chat Baloncukları) ── */}
                                                                                {caseMessages.length > 0 && (
                                                                                    <div className="ccv2-chat-section">
                                                                                        <div className="ccv2-chat-label">
                                                                                            💬 {caseMessages[0]?.channel === 'WHATSAPP' ? 'WhatsApp' : caseMessages[0]?.channel === 'INSTAGRAM' ? 'Instagram' : 'Mesajlar'}
                                                                                            <span className="ccv2-chat-time">{formatActivityDate(caseMessages[caseMessages.length - 1]?.createdAt)}</span>
                                                                                        </div>
                                                                                        <div className="ccv2-chat-bubbles">
                                                                                            {caseMessages.slice(-5).map((msg, mi) => (
                                                                                                <div key={msg.id || mi} className={`ccv2-bubble ${msg.isFromContact ? 'ccv2-bubble--in' : 'ccv2-bubble--out'}`}>
                                                                                                    <span className="ccv2-bubble-text">
                                                                                                        {msg.content ? (msg.content.length > 120 ? msg.content.substring(0, 120) + '...' : msg.content) : (msg.mediaType ? `📎 ${msg.mediaType}` : '...')}
                                                                                                    </span>
                                                                                                    {msg.status && msg.status !== 'SENT' && !msg.isFromContact && (
                                                                                                        <span className="ccv2-bubble-status">{msg.status === 'DELIVERED' ? '✓✓' : msg.status === 'READ' ? '✓✓' : '✓'}</span>
                                                                                                    )}
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {/* ── Aktivite Timeline ── */}
                                                                                {(() => {
                                                                                    const milesToShow = caseMilestones.length > 0 ? caseMilestones : (cardMilestones.length > 0 ? cardMilestones : []);
                                                                                    return milesToShow.length > 0 ? (
                                                                                        <div className="ccv2-timeline">
                                                                                            {milesToShow.slice(0, 10).map((m, idx) => {
                                                                                                const act = m.rawActivity || {};
                                                                                                const customerSaid = act.description && m.isAi && act.description.length > 20 
                                                                                                    ? act.description 
                                                                                                    : (act.transcript ? act.transcript.split('\n').filter(l => l.toLowerCase().includes('müşteri') || l.toLowerCase().includes('customer')).slice(0, 2).join(' ') : null);
                                                                                                return (
                                                                                                    <div key={m.id || idx} className="ccv2-tl-item">
                                                                                                        <div className={`ccv2-tl-dot ${m.isAi ? 'ccv2-tl-dot--ai' : m.isCall ? (m.isReached ? 'ccv2-tl-dot--call-ok' : 'ccv2-tl-dot--call-fail') : m.isMeeting ? 'ccv2-tl-dot--meet' : m.isNote ? 'ccv2-tl-dot--note' : ''}`}></div>
                                                                                                        <div className="ccv2-tl-content">
                                                                                                            <div className="ccv2-tl-header">
                                                                                                                <span className="ccv2-tl-title">
                                                                                                                    {m.isAi ? '🤖' : m.isCall ? '📞' : m.isMeeting ? '📅' : m.type === 'CONVERSATION' ? '💬' : m.isNote ? '📝' : '📌'} {m.title}
                                                                                                                </span>
                                                                                                                {m.isReached && <span className="ccv2-tl-status ccv2-tl-status--ok">✓ Ulaşıldı</span>}
                                                                                                                {m.isFailed && <span className="ccv2-tl-status ccv2-tl-status--fail">✗ Cevapsız</span>}
                                                                                                                {m.duration > 0 && <span className="ccv2-tl-dur">{formatDuration(m.duration)}</span>}
                                                                                                                <span className="ccv2-tl-time">{formatActivityDate(m.date)}</span>
                                                                                                            </div>

                                                                                                            {/* AI Görüşme Özeti */}
                                                                                                            {m.isAi && (m.summary || m.detail) && (
                                                                                                                <div className="ccv2-ai-box">
                                                                                                                    <div className="ccv2-ai-header">
                                                                                                                        <Sparkles size={11} style={{ color: '#7c3aed' }} />
                                                                                                                        <span>AI Görüşme Özeti</span>
                                                                                                                        {m.sentiment && (
                                                                                                                            <span className={`ccv2-ai-mood ${m.sentiment === 'Positive' ? 'ccv2-ai-mood--pos' : m.sentiment === 'Negative' ? 'ccv2-ai-mood--neg' : ''}`}>
                                                                                                                                {m.sentiment === 'Positive' ? '😊 Pozitif' : m.sentiment === 'Negative' ? '😞 Negatif' : '😐 Nötr'}
                                                                                                                            </span>
                                                                                                                        )}
                                                                                                                    </div>
                                                                                                                    <div className="ccv2-ai-body">{m.summary || m.detail}</div>
                                                                                                                    {/* Müşteri Ne Dedi */}
                                                                                                                    {customerSaid && (
                                                                                                                        <div className="ccv2-customer-quote">
                                                                                                                            <span className="ccv2-cq-icon">🗣️</span>
                                                                                                                            <div className="ccv2-cq-content">
                                                                                                                                <span className="ccv2-cq-label">Müşteri ne dedi:</span>
                                                                                                                                <span className="ccv2-cq-text">"{customerSaid.length > 150 ? customerSaid.substring(0, 150) + '...' : customerSaid}"</span>
                                                                                                                            </div>
                                                                                                                        </div>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                            )}

                                                                                                            {/* Randevu / Ziyaret Kartı */}
                                                                                                            {m.isMeeting && (
                                                                                                                <div className="ccv2-meeting-card">
                                                                                                                    <span className="ccv2-meeting-icon">🗓️</span>
                                                                                                                    <div className="ccv2-meeting-info">
                                                                                                                        <span className="ccv2-meeting-title">{act.title || m.title}</span>
                                                                                                                        {act.dueDate && <span className="ccv2-meeting-date">{new Date(act.dueDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                                                                                                                    </div>
                                                                                                                    {m.detail && <div className="ccv2-meeting-detail">{m.detail}</div>}
                                                                                                                </div>
                                                                                                            )}

                                                                                                            {/* İnsan Araması Detay Kartı */}
                                                                                                            {m.isHumanCall && (
                                                                                                                <div className="ccv2-call-card">
                                                                                                                    <div className="ccv2-call-card-header">
                                                                                                                        <span className="ccv2-call-card-icon">{m.isReached ? '✅' : m.isFailed ? '❌' : m.isPlanned ? '⏳' : '📞'}</span>
                                                                                                                        <div className="ccv2-call-card-meta">
                                                                                                                            <span className="ccv2-call-card-caller">{m.callerName || 'Temsilci'}</span>
                                                                                                                            {m.source && <span className="ccv2-call-card-source">{m.source === 'AUTOMATION' ? 'Otomasyon' : m.source === 'MANUAL' ? 'Manuel' : m.source}</span>}
                                                                                                                        </div>
                                                                                                                        {m.duration > 0 && <span className="ccv2-call-card-dur">🕐 {formatDuration(m.duration)}</span>}
                                                                                                                    </div>
                                                                                                                    {m.callTopic && <div className="ccv2-call-card-topic">📋 Konu: {m.callTopic}</div>}
                                                                                                                    {m.sentiment && (
                                                                                                                        <div className="ccv2-call-card-sentiment">
                                                                                                                            {m.sentiment === 'Positive' ? '😊 Pozitif' : m.sentiment === 'Negative' ? '😞 Negatif' : '😐 Nötr'}
                                                                                                                        </div>
                                                                                                                    )}
                                                                                                                    {m.detail && <div className="ccv2-call-card-result">{m.detail}</div>}
                                                                                                                    {m.transcript && (
                                                                                                                        <details className="ccv2-call-transcript">
                                                                                                                            <summary>📜 Arama Notu / Kayıt</summary>
                                                                                                                            <div className="ccv2-call-transcript-body">{m.transcript.length > 300 ? m.transcript.substring(0, 300) + '...' : m.transcript}</div>
                                                                                                                        </details>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                            )}

                                                                                                            {/* Normal Not / Detay */}
                                                                                                            {!m.isAi && !m.isMeeting && !m.isHumanCall && m.detail && (
                                                                                                                <div className="ccv2-tl-detail">{m.detail}</div>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="ccv2-tl-empty">Henüz aktivite bulunmuyor.</div>
                                                                                    );
                                                                                })()}

                                                                                {/* ── + Arama Notu / Planla... Dropdown ── */}
                                                                                <div className="ccv2-case-actions" style={{ position: 'relative' }}>
                                                                                    <div className="ccv2-action-plus-icon" onClick={(e) => { e.stopPropagation(); setCardCaseActionMenu(cardCaseActionMenu === c.id ? null : c.id); }}>
                                                                                        +
                                                                                    </div>
                                                                                    <button
                                                                                        type="button"
                                                                                        className="ccv2-action-dropdown-btn"
                                                                                        onClick={(e) => { e.stopPropagation(); setCardCaseActionMenu(cardCaseActionMenu === c.id ? null : c.id); }}
                                                                                    >
                                                                                        <span style={{ fontWeight: 800 }}>+</span>
                                                                                        <span>Arama Notu / Planla...</span>
                                                                                        <ChevronDown size={12} style={{ transform: cardCaseActionMenu === c.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                                                                                    </button>

                                                                                    {/* Dropdown Popover */}
                                                                                    {cardCaseActionMenu === c.id && (
                                                                                        <div className="ccv2-action-popover" onClick={(e) => e.stopPropagation()}>
                                                                                            {/* Dahili Not */}
                                                                                            <button type="button" className="ccv2-ap-item ccv2-ap-item--highlight" onClick={() => {
                                                                                                setCardCaseActionMenu(null);
                                                                                                setQuickNotes(prev => ({ ...prev, [`${contact.id}_target`]: c.id, [`${contact.id}_action`]: 'note' }));
                                                                                                const inp = document.querySelector(`#ccv2-note-${contact.id}`);
                                                                                                if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                                                                                            }}>
                                                                                                <span className="ccv2-ap-icon" style={{ background: '#fde68a' }}>📝</span>
                                                                                                <div className="ccv2-ap-text">
                                                                                                    <div className="ccv2-ap-title">Dahili Not Ekle</div>
                                                                                                    <div className="ccv2-ap-desc">Timeline'a not ekler</div>
                                                                                                </div>
                                                                                            </button>
                                                                                            {/* Arama Notu */}
                                                                                            <button type="button" className="ccv2-ap-item" onClick={() => {
                                                                                                setCardCaseActionMenu(null);
                                                                                                setQuickNotes(prev => ({ ...prev, [`${contact.id}_target`]: c.id, [`${contact.id}_action`]: 'note' }));
                                                                                                const inp = document.querySelector(`#ccv2-note-${contact.id}`);
                                                                                                if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                                                                                            }}>
                                                                                                <span className="ccv2-ap-icon" style={{ background: '#ecfdf5', color: '#059669' }}>📞</span>
                                                                                                <span>Arama Notu Gir</span>
                                                                                            </button>
                                                                                            {/* Arama Planla */}
                                                                                            <button type="button" className="ccv2-ap-item" onClick={() => {
                                                                                                setCardCaseActionMenu(null);
                                                                                                setQuickNotes(prev => ({ ...prev, [`${contact.id}_target`]: c.id, [`${contact.id}_action`]: 'plan' }));
                                                                                                const inp = document.querySelector(`#ccv2-note-${contact.id}`);
                                                                                                if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                                                                                            }}>
                                                                                                <span className="ccv2-ap-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>📅</span>
                                                                                                <span>Arama Planla</span>
                                                                                            </button>
                                                                                            {/* Görüşme Planla */}
                                                                                            <button type="button" className="ccv2-ap-item" onClick={() => {
                                                                                                setCardCaseActionMenu(null);
                                                                                                setQuickNotes(prev => ({ ...prev, [`${contact.id}_target`]: c.id, [`${contact.id}_action`]: 'plan' }));
                                                                                                const inp = document.querySelector(`#ccv2-note-${contact.id}`);
                                                                                                if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                                                                                            }}>
                                                                                                <span className="ccv2-ap-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>🤝</span>
                                                                                                <span>Görüşme / Randevu Planla</span>
                                                                                            </button>
                                                                                            {/* Hatırlatıcı */}
                                                                                            <button type="button" className="ccv2-ap-item" onClick={() => {
                                                                                                setCardCaseActionMenu(null);
                                                                                                setQuickNotes(prev => ({ ...prev, [`${contact.id}_target`]: c.id, [`${contact.id}_action`]: 'note' }));
                                                                                                const inp = document.querySelector(`#ccv2-note-${contact.id}`);
                                                                                                if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                                                                                            }}>
                                                                                                <span className="ccv2-ap-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>⏰</span>
                                                                                                <span>Hatırlatıcı Ekle</span>
                                                                                            </button>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })
                                                        )}

                                                        {/* HIZLI NOT / ARAMA NOTU */}
                                                        <div className="ccv2-quick-note-row">
                                                            {quickNotes[`${contact.id}_target`] && quickNotes[`${contact.id}_target`] !== 'contact' && (
                                                                <span className="ccv2-qn-target">
                                                                    {quickNotes[`${contact.id}_action`] === 'plan' ? '📅' : '📝'}
                                                                    {(() => {
                                                                        const targetCase = allCases.find(cc => cc.id === quickNotes[`${contact.id}_target`]);
                                                                        return targetCase ? (targetCase.title || `Vaka #${targetCase.caseNumber || ''}`) : 'Vaka';
                                                                    })()}
                                                                    <button type="button" className="ccv2-qn-target-x" onClick={() => setQuickNotes(prev => ({ ...prev, [`${contact.id}_target`]: 'contact', [`${contact.id}_action`]: 'note' }))}>×</button>
                                                                </span>
                                                            )}
                                                            <input
                                                                id={`ccv2-note-${contact.id}`}
                                                                type="text"
                                                                className="ccv2-quick-note-input"
                                                                placeholder={quickNotes[`${contact.id}_action`] === 'plan' ? 'Arama konusu / planla... (Enter)' : 'Not ekle... (Enter)'}
                                                                value={quickNotes[contact.id] || ''}
                                                                onChange={e => setQuickNotes(prev => ({ ...prev, [contact.id]: e.target.value }))}
                                                                onKeyDown={e => { if (e.key === 'Enter') handleQuickNoteSave(contact.id); }}
                                                            />
                                                            <button type="button" className="ccv2-quick-note-btn" onClick={() => handleQuickNoteSave(contact.id)}>
                                                                <Plus size={12} /> {quickNotes[`${contact.id}_action`] === 'plan' ? 'Planla' : 'Ekle'}
                                                            </button>
                                                        </div>

                                                        {/* ALT AKSİYON ÇUBUĞU */}
                                                        <div className="ccv2-exp-footer">
                                                            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>ID: {contact.id?.slice(0, 8)}</span>
                                                            <div className="ccv2-exp-actions">
                                                                {phone && (
                                                                    <a href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="ccv2-exp-btn ccv2-exp-btn--wa">
                                                                        <MessageCircle size={12} /> WhatsApp
                                                                    </a>
                                                                )}
                                                                {phone && (
                                                                    <a href={`tel:${phone}`} className="ccv2-exp-btn ccv2-exp-btn--call">
                                                                        <PhoneCall size={12} /> Ara
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ display: viewMode === 'list' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

                    {/* Dynamic Tabs */}
                    <div className="contacts-tabs" style={{ display: 'none', gap: '8px', padding: '0 24px', marginBottom: '16px', overflowX: 'auto' }}>
                        <button 
                            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: getActiveTab() === 'all' ? '#1f2937' : '#f3f4f6', color: getActiveTab() === 'all' ? '#fff' : '#4b5563', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                            onClick={() => handleTabClick('all')}
                        >
                            Tüm Kişiler
                        </button>
                        
                        {availableFunnels.map(funnel => (
                            <button 
                                key={funnel.id}
                                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: getActiveTab() === `funnel-${funnel.id}` ? funnel.color || '#3b82f6' : '#f3f4f6', color: getActiveTab() === `funnel-${funnel.id}` ? '#fff' : '#4b5563', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                                onClick={() => handleTabClick(`funnel-${funnel.id}`, funnel.id)}
                            >
                                {funnel.name}
                            </button>
                        ))}

                        <button 
                            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: getActiveTab() === 'customers' ? '#10b981' : '#f3f4f6', color: getActiveTab() === 'customers' ? '#fff' : '#4b5563', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                            onClick={() => handleTabClick('customers')}
                        >
                            Müşteriler
                        </button>
                    </div>


                    {/* Analytics Panel - removed */}
                    {false && (
                        <div style={{
                            background: '#fff', borderRadius: '14px', padding: '20px',
                            border: '1px solid #e5e7eb', marginBottom: '12px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            {analyticsLoading ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                                    <Loader className="spin" size={24} />
                                    <p style={{ marginTop: '8px', fontSize: '0.85rem' }}>Yükleniyor...</p>
                                </div>
                            ) : analyticsData ? (
                                <>
                                    {/* Summary Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', borderRadius: '12px',
                                            padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                                        }}>
                                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Users size={20} color="#fff" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Toplam Kişi</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#312e81' }}>{analyticsData.totals?.total || 0}</div>
                                            </div>
                                        </div>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', borderRadius: '12px',
                                            padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                                        }}>
                                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Phone size={20} color="#fff" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefonlu</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#064e3b' }}>{analyticsData.totals?.withPhone || 0}</div>
                                            </div>
                                        </div>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #fef2f2, #fecaca)', borderRadius: '12px',
                                            padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                                        }}>
                                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <PhoneOff size={20} color="#fff" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefonsuz</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#991b1b' }}>{analyticsData.totals?.withoutPhone || 0}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Chart */}
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <span>Günlük Gelen Kişi Sayısı</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: 10, height: 3, background: '#6366f1', borderRadius: 2, display: 'inline-block' }}></span>
                                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Toplam</span>
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: 10, height: 3, background: '#10b981', borderRadius: 2, display: 'inline-block' }}></span>
                                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Telefonlu</span>
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: 10, height: 3, background: '#ef4444', borderRadius: 2, display: 'inline-block' }}></span>
                                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Telefonsuz</span>
                                            </span>
                                        </div>
                                        {(() => {
                                            const stats = analyticsData.dailyStats || [];
                                            if (!stats.length) return <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Veri yok</p>;
                                            const maxVal = Math.max(...stats.map(s => s.total), 1);
                                            const w = 900;
                                            const h = 180;
                                            const padL = 40;
                                            const padR = 10;
                                            const padT = 10;
                                            const padB = 30;
                                            const chartW = w - padL - padR;
                                            const chartH = h - padT - padB;
                                            const stepX = chartW / Math.max(stats.length - 1, 1);

                                            const makeLine = (key, color) => {
                                                return stats.map((s, i) => {
                                                    const x = padL + i * stepX;
                                                    const y = padT + chartH - (s[key] / maxVal) * chartH;
                                                    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                                                }).join(' ');
                                            };

                                            const makeArea = (key, color) => {
                                                const line = stats.map((s, i) => {
                                                    const x = padL + i * stepX;
                                                    const y = padT + chartH - (s[key] / maxVal) * chartH;
                                                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                                                });
                                                const first = `${padL},${padT + chartH}`;
                                                const last = `${padL + (stats.length - 1) * stepX},${padT + chartH}`;
                                                return `M${first} L${line.join(' L')} L${last} Z`;
                                            };

                                            // Y axis labels
                                            const ySteps = 4;
                                            const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => Math.round(maxVal * i / ySteps));

                                            // X axis labels - show every Nth
                                            const showEvery = stats.length > 30 ? 7 : stats.length > 14 ? 3 : 2;

                                            return (
                                                <div style={{ overflowX: 'auto' }}>
                                                    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', maxHeight: '220px' }}>
                                                        {/* Grid lines */}
                                                        {yLabels.map((val, i) => {
                                                            const y = padT + chartH - (val / maxVal) * chartH;
                                                            return (
                                                                <g key={i}>
                                                                    <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#f1f5f9" strokeWidth="0.5" />
                                                                    <text x={padL - 5} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="8">{val}</text>
                                                                </g>
                                                            );
                                                        })}

                                                        {/* Area fills */}
                                                        <path d={makeArea('total', '#6366f1')} fill="#6366f120" />
                                                        <path d={makeArea('withPhone', '#10b981')} fill="#10b98115" />

                                                        {/* Lines */}
                                                        <path d={makeLine('total', '#6366f1')} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        <path d={makeLine('withPhone', '#10b981')} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,2" />
                                                        <path d={makeLine('withoutPhone', '#ef4444')} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2,2" />

                                                        {/* Data dots & X labels */}
                                                        {stats.map((s, i) => {
                                                            const x = padL + i * stepX;
                                                            const yTotal = padT + chartH - (s.total / maxVal) * chartH;
                                                            return (
                                                                <g key={i}>
                                                                    <circle cx={x} cy={yTotal} r="2.5" fill="#6366f1" />
                                                                    {/* Tooltip hover area */}
                                                                    <title>{`${s.date}
Toplam: ${s.total}
Telefonlu: ${s.withPhone}
Telefonsuz: ${s.withoutPhone}`}</title>
                                                                    {i % showEvery === 0 && (
                                                                        <text x={x} y={h - 5} textAnchor="middle" fill="#94a3b8" fontSize="7">
                                                                            {s.date.slice(5)}
                                                                        </text>
                                                                    )}
                                                                </g>
                                                            );
                                                        })}
                                                    </svg>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    )}

                    {/* Table Card (Apple Floating Card) */}
                    <div className="contacts-table-card">
                        <div className="contacts-table-container">
                            {loading ? (
                                <div className="loading-container">
                                    <div className="loader"></div>
                                    <p>Kişiler yükleniyor...</p>
                                </div>
                            ) : contacts.length === 0 ? (
                                <div className="empty-state-list">
                                    <Users size={48} className="empty-icon" />
                                    <h3>Kişi Bulunamadı</h3>
                                    <p>Henüz kayıtlı kişi yok veya filtrelere uygun sonuç bulunamadı.</p>
                                </div>
                            ) : (
                                <table className="contacts-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '44px', textAlign: 'center', paddingLeft: '12px' }}>
                                                <input
                                                    type="checkbox"
                                                    className="apple-checkbox"
                                                    checked={contacts.length > 0 && selectedIds.length === contacts.length}
                                                    onChange={handleSelectAll}
                                                />
                                            </th>
                                            {[
                                                { key: 'name', label: 'KİŞİ', style: { minWidth: '160px', maxWidth: '220px' } },
                                                { key: null, label: 'KONU', style: { minWidth: '80px', maxWidth: '130px' } },
                                                { key: 'leadScore', label: 'SKOR', style: { minWidth: '65px', maxWidth: '85px', textAlign: 'center' } },
                                                { key: 'status', label: 'DURUM', style: { minWidth: '95px', maxWidth: '140px' } },
                                                { key: null, label: 'ATANAN', style: { minWidth: '85px', maxWidth: '135px' } },
                                                { key: null, label: 'AKTİVİTELER', style: { minWidth: '110px', maxWidth: '150px' } },
                                                { key: null, label: 'SON NOT', style: { minWidth: '100px', maxWidth: '150px' } },
                                                { key: 'createdAt', label: 'İLK YAZMA', style: { minWidth: '85px', maxWidth: '105px' } },
                                                { key: 'lastMessageAt', label: 'SON YAZMA', style: { minWidth: '85px', maxWidth: '105px' } },
                                            ].map(col => (
                                                <th
                                                    key={col.label}
                                                    className={`th-cell ${col.key ? 'th-sortable' : ''} ${sortField === col.key ? 'th-active' : ''}`}
                                                    style={{ ...col.style, cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}
                                                    onClick={() => {
                                                        if (!col.key) return;
                                                        if (sortField === col.key) {
                                                            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                                        } else {
                                                            setSortField(col.key);
                                                            setSortDir('desc');
                                                        }
                                                        setPage(1);
                                                    }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                        <span>{col.label}</span>
                                                        {col.key && (
                                                            <span className={`th-sort-icon ${sortField === col.key ? 'active' : ''}`}>
                                                                {sortField === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                <tbody>
                                    {contacts.map((contact) => {
                                        const sourceInfo = getSourceInfo(contact.source);
                                        const SourceIcon = sourceInfo.icon;
                                        return (
                                            <tr
                                                key={contact.id}
                                                className={selectedContact?.id === contact.id ? 'active' : ''}
                                                onClick={() => handleSelectContact(contact)}
                                            >
                                                <td onClick={(e) => e.stopPropagation()} style={{ width: '44px', textAlign: 'center', paddingLeft: '12px' }}>
                                                    <input
                                                        type="checkbox"
                                                        className="apple-checkbox"
                                                        checked={selectedIds.includes(contact.id)}
                                                        onChange={() => {
                                                            setSelectedIds(prev =>
                                                                prev.includes(contact.id)
                                                                    ? prev.filter(id => id !== contact.id)
                                                                    : [...prev, contact.id]
                                                            );
                                                        }}
                                                    />
                                                </td>
                                                {/* KİŞİ: İsim + Firma + Mail + Telefon */}
                                                <td style={{ maxWidth: '240px' }}>
                                                    <div className="contact-name-cell">
                                                        <div className="contact-avatar-wrap">
                                                            <img
                                                                src={getAvatarUrl(contact)}
                                                                alt={contact.name}
                                                                className="contact-avatar"
                                                                onError={(e) => {
                                                                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name || 'U')}&background=ef4444&color=fff`;
                                                                }}
                                                            />
                                                            {sourceInfo.color && (
                                                                <span
                                                                    className="contact-source-badge"
                                                                    title={sourceInfo.label}
                                                                    style={{ backgroundColor: sourceInfo.color }}
                                                                >
                                                                    <SourceIcon size={10} color="#fff" />
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="contact-name-info">
                                                            <span className="contact-name">{getDisplayName(contact)}</span>
                                                            {contact.company && (
                                                                <span className="contact-company-line">
                                                                    <Building size={10} />
                                                                    {contact.company}
                                                                </span>
                                                            )}
                                                            {contact.email && (
                                                                <span className="contact-email">{contact.email}</span>
                                                            )}
                                                            {getContactPrimaryPhone(contact) && (
                                                                <span className="contact-phone-sub">{getContactPrimaryPhone(contact)}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* KONU */}
                                                <td className="contact-topic" style={{ maxWidth: '140px' }}>
                                                    {(() => {
                                                        // Case title varsa onu göster, yoksa aiTopic'e fallback
                                                        const activeCase = contact.cases?.find(c => c.status === 'ACTIVE') || contact.activeCase || contact.cases?.[0];
                                                        const isGeneric = (t) => {
                                                            if (!t) return true;
                                                            const upper = t.toUpperCase().trim();
                                                            return upper === 'LEAD' || upper === 'WHATSAPP' || upper === 'FACEBOOK' || upper === 'INSTAGRAM' || upper === 'MESSENGER' || upper === 'EMAIL' || upper === 'FORM' || upper === 'MANUAL' || t.includes('━') || t.includes('═') || t.includes('🎯');
                                                        };
                                                        const caseTitle = !isGeneric(activeCase?.title) ? activeCase.title : null;
                                                        const fallbackTopic = !isGeneric(contact.aiTopic) ? contact.aiTopic : null;
                                                        const topic = caseTitle || fallbackTopic;
                                                        return topic ? (
                                                            <span className={`contact-topic-pill ${caseTitle ? 'topic-case' : 'topic-ai'}`} title={topic}>
                                                                {topic}
                                                            </span>
                                                        ) : <span className="cell-muted-dash">—</span>;
                                                    })()}
                                                </td>
                                                {/* SKOR */}
                                                <td style={{ maxWidth: '85px', textAlign: 'center' }}>
                                                    {(() => {
                                                        if (contact.leadScore == null) return <span className="cell-muted-dash">—</span>;
                                                        let bgColor = '#f8fafc';
                                                        let textColor = '#334155';
                                                        let borderColor = '#e2e8f0';
                                                        let dotColor = '#94a3b8';
                                                        switch (contact.leadTemperature) {
                                                            case 'COLD': bgColor = '#eff6ff'; textColor = '#1d4ed8'; borderColor = '#bfdbfe'; dotColor = '#3b82f6'; break;
                                                            case 'COOL': bgColor = '#f0fdf4'; textColor = '#15803d'; borderColor = '#bbf7d0'; dotColor = '#22c55e'; break;
                                                            case 'WARM': bgColor = '#fefce8'; textColor = '#a16207'; borderColor = '#fef08a'; dotColor = '#eab308'; break;
                                                            case 'HOT': bgColor = '#fff7ed'; textColor = '#c2410c'; borderColor = '#fed7aa'; dotColor = '#f97316'; break;
                                                            case 'FIRE': bgColor = '#fef2f2'; textColor = '#dc2626'; borderColor = '#fecaca'; dotColor = '#ef4444'; break;
                                                        }
                                                        return (
                                                            <div className="contact-score-badge" style={{ backgroundColor: bgColor, color: textColor, borderColor: borderColor }}>
                                                                <span className="score-dot" style={{ backgroundColor: dotColor }} />
                                                                <span>{contact.leadScore}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                {/* DURUM = Akış / Aşama - Tıklanabilir */}
                                                <td className="contact-status" style={{ maxWidth: '200px', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                                    {(() => {
                                                        let funnelName = '';
                                                        let stageName = 'Yeni';
                                                        let displayColor = '#6b7280';
                                                        let displayBg = '#6b728014';
                                                        let currentFunnelId = null;

                                                        // Case'den oku — contact.cases dizisinden direkt hesapla
                                                        const casesForFunnel = contact.cases || [];
                                                        const liveCaseForFunnel = casesForFunnel
                                                            .filter(c => c.status === 'ACTIVE')
                                                            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]
                                                            || contact.activeCase
                                                            || casesForFunnel[0]
                                                            || null;
                                                        const effectiveFunnelStageId = liveCaseForFunnel?.funnelStageId || contact.activeCase?.funnelStageId || contact.funnelStageId;

                                                        if (effectiveFunnelStageId && availableFunnels.length > 0) {
                                                            for (const funnel of availableFunnels) {
                                                                const s = funnel.stages?.find(x => x.id === effectiveFunnelStageId);
                                                                if (s) {
                                                                    funnelName = funnel.name;
                                                                    stageName = s.name;
                                                                    displayColor = s.color || '#6366f1';
                                                                    displayBg = `${displayColor}14`;
                                                                    currentFunnelId = funnel.id;
                                                                    break;
                                                                }
                                                            }
                                                            // Orphaned funnelStageId: stage was deleted, fallback to status
                                                            if (!funnelName && contact.status) {
                                                                const statusInfo = getStatusInfo(contact.status);
                                                                stageName = statusInfo.label;
                                                                displayColor = statusInfo.color;
                                                                displayBg = statusInfo.bg;
                                                                // Try to find the matching funnel by stage name
                                                                for (const funnel of availableFunnels) {
                                                                    const s = funnel.stages?.find(x => x.name === stageName);
                                                                    if (s) {
                                                                        funnelName = funnel.name;
                                                                        displayColor = s.color || displayColor;
                                                                        displayBg = `${displayColor}14`;
                                                                        currentFunnelId = funnel.id;
                                                                        break;
                                                                    }
                                                                }
                                                                if (!funnelName) funnelName = 'Satış Akışı';
                                                            }
                                                        } else if (contact.status) {
                                                            const statusInfo = getStatusInfo(contact.status);
                                                            stageName = statusInfo.label;
                                                            displayColor = statusInfo.color;
                                                            displayBg = statusInfo.bg;
                                                            // Try to find the matching funnel by stage name
                                                            if (availableFunnels.length > 0) {
                                                                for (const funnel of availableFunnels) {
                                                                    const s = funnel.stages?.find(x => x.name === stageName);
                                                                    if (s) {
                                                                        funnelName = funnel.name;
                                                                        displayColor = s.color || displayColor;
                                                                        displayBg = `${displayColor}14`;
                                                                        currentFunnelId = funnel.id;
                                                                        break;
                                                                    }
                                                                }
                                                                if (!funnelName) funnelName = 'Satış Akışı';
                                                            }
                                                        }

                                                        const isDropdownOpen = stageDropdownContactId === contact.id;

                                                        return (
                                                            <div className="contact-status-cell">
                                                                {funnelName && (
                                                                    <span className="contact-funnel-label" title={funnelName}>
                                                                        {funnelName}
                                                                    </span>
                                                                )}
                                                                <span
                                                                    className="status-badge"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setStageDropdownContactId(isDropdownOpen ? null : contact.id);
                                                                    }}
                                                                    style={{
                                                                        backgroundColor: displayBg,
                                                                        color: displayColor,
                                                                        border: isDropdownOpen ? `1.5px solid ${displayColor}` : `1px solid ${displayColor}35`,
                                                                    }}
                                                                >
                                                                    <span className="stage-indicator-dot" style={{ backgroundColor: displayColor }} />
                                                                    <span>{stageName}</span>
                                                                    <ChevronDown size={10} style={{ opacity: 0.6, transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                                </span>
                                                                {/* Stage change dropdown - two panel */}
                                                                {isDropdownOpen && (() => {
                                                                    const activeFunnelId = hoveredFunnelId || currentFunnelId || availableFunnels[0]?.id;
                                                                    const activeFunnel = availableFunnels.find(f => f.id === activeFunnelId);
                                                                    return (
                                                                        <div
                                                                            ref={stageDropdownRef}
                                                                            style={{
                                                                                position: 'absolute',
                                                                                top: '100%',
                                                                                left: 0,
                                                                                zIndex: 1000,
                                                                                display: 'flex',
                                                                                background: '#fff',
                                                                                border: '1px solid #e5e7eb',
                                                                                borderRadius: '12px',
                                                                                boxShadow: '0 12px 36px rgba(0,0,0,0.15)',
                                                                                marginTop: '4px',
                                                                                overflow: 'hidden'
                                                                            }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            {/* Left panel: Funnels */}
                                                                            <div style={{
                                                                                minWidth: '160px',
                                                                                borderRight: '1px solid #f3f4f6',
                                                                                padding: '6px 0'
                                                                            }}>
                                                                                <div style={{
                                                                                    padding: '6px 14px 8px',
                                                                                    fontSize: '0.65rem',
                                                                                    fontWeight: 700,
                                                                                    color: '#94a3b8',
                                                                                    textTransform: 'uppercase',
                                                                                    letterSpacing: '0.5px'
                                                                                }}>AKIŞ</div>
                                                                                {availableFunnels.map(funnel => {
                                                                                    const isActive = funnel.id === activeFunnelId;
                                                                                    const funnelColor = funnel.stages?.[0]?.color || '#3b82f6';
                                                                                    return (
                                                                                        <div
                                                                                            key={funnel.id}
                                                                                            onMouseEnter={() => setHoveredFunnelId(funnel.id)}
                                                                                            style={{
                                                                                                padding: '8px 14px',
                                                                                                fontSize: '0.82rem',
                                                                                                cursor: 'pointer',
                                                                                                display: 'flex',
                                                                                                alignItems: 'center',
                                                                                                gap: '8px',
                                                                                                background: isActive ? '#f8fafc' : 'transparent',
                                                                                                fontWeight: isActive ? 600 : 400,
                                                                                                color: isActive ? '#1e293b' : '#64748b',
                                                                                                transition: 'all 0.1s'
                                                                                            }}
                                                                                        >
                                                                                            <span style={{
                                                                                                width: 9, height: 9,
                                                                                                borderRadius: '50%',
                                                                                                background: funnelColor,
                                                                                                flexShrink: 0
                                                                                            }} />
                                                                                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{funnel.name}</span>
                                                                                            <ChevronRight size={14} style={{ opacity: isActive ? 0.7 : 0.3, flexShrink: 0 }} />
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                            {/* Right panel: Stages */}
                                                                            {activeFunnel && (
                                                                                <div style={{
                                                                                    minWidth: '180px',
                                                                                    maxHeight: '340px',
                                                                                    overflowY: 'auto',
                                                                                    padding: '6px 0'
                                                                                }}>
                                                                                    <div style={{
                                                                                        padding: '6px 14px 8px',
                                                                                        fontSize: '0.65rem',
                                                                                        fontWeight: 700,
                                                                                        color: '#94a3b8',
                                                                                        textTransform: 'uppercase',
                                                                                        letterSpacing: '0.5px',
                                                                                        whiteSpace: 'nowrap'
                                                                                    }}>{activeFunnel.name}</div>
                                                                                    {activeFunnel.stages?.map(stage => {
                                                                                        const stageId = stage.id || stage.value;
                                                                                        const isCurrentStage = effectiveFunnelStageId === stageId;
                                                                                        const stageColor = stage.color || '#6366f1';
                                                                                        return (
                                                                                            <div
                                                                                                key={stageId}
                                                                                                onClick={() => handleInlineStageChange(contact, activeFunnel.id, stageId)}
                                                                                                style={{
                                                                                                    padding: '7px 14px',
                                                                                                    fontSize: '0.82rem',
                                                                                                    cursor: 'pointer',
                                                                                                    display: 'flex',
                                                                                                    alignItems: 'center',
                                                                                                    gap: '8px',
                                                                                                    background: isCurrentStage ? `${stageColor}12` : 'transparent',
                                                                                                    fontWeight: isCurrentStage ? 600 : 400,
                                                                                                    color: isCurrentStage ? stageColor : '#374151',
                                                                                                    transition: 'background 0.1s',
                                                                                                    whiteSpace: 'nowrap'
                                                                                                }}
                                                                                                onMouseEnter={(ev) => ev.currentTarget.style.background = `${stageColor}10`}
                                                                                                onMouseLeave={(ev) => ev.currentTarget.style.background = isCurrentStage ? `${stageColor}12` : 'transparent'}
                                                                                            >
                                                                                                <span style={{
                                                                                                    width: 9, height: 9,
                                                                                                    borderRadius: '50%',
                                                                                                    background: stageColor,
                                                                                                    flexShrink: 0
                                                                                                }} />
                                                                                                <span style={{ flex: 1 }}>{stage.name}</span>
                                                                                                {isCurrentStage && <Check size={14} style={{ color: stageColor, flexShrink: 0 }} />}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>

                                                {/* ATANAN */}
                                                <td className="contact-assigned" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                                    {(() => {
                                                        let teamId = null;
                                                        let agentName = null;

                                                        // 1. Cases dizisinden aktif case'i bul (backend mapping'e bağımlı OLMA)
                                                        const cases = contact.cases || [];
                                                        const liveActiveCase = cases
                                                            .filter(c => c.status === 'ACTIVE')
                                                            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]
                                                            || contact.activeCase
                                                            || cases[0]
                                                            || null;

                                                        if (liveActiveCase && (liveActiveCase?.assignedTeamId || liveActiveCase?.assignedToId)) {
                                                            teamId = liveActiveCase?.assignedTeamId;
                                                            agentName = liveActiveCase.assignedTo?.name
                                                                || liveActiveCase.assignedToName
                                                                || members.find(m => m.userId === liveActiveCase?.assignedToId)?.user?.name
                                                                || null;
                                                        } else {
                                                            // 2. Case yoksa veya case'de atama yoksa → konuşmadan çek
                                                            const convs = [...(contact.conversations || [])].sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt));
                                                            let conv = null;
                                                            if (liveActiveCase?.id) {
                                                                conv = convs.find(c => c.caseId === liveActiveCase.id) || convs[0];
                                                            } else {
                                                                conv = convs[0] || null;
                                                            }
                                                            if (!conv) return '---';
                                                            
                                                            teamId = conv?.assignedTeamId || (() => {
                                                                try { return JSON.parse(conv?.teamIds || '[]')[0]; } catch { return null; }
                                                            })();
                                                            agentName = conv.assignedTo?.name || null;
                                                        }

                                                        if (agentName && agentName.includes('@')) {
                                                            const parts = agentName.split('@')[0].split('.');
                                                            agentName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
                                                        }

                                                        const team = teamId ? teams.find(t => t.id === teamId) : null;
                                                        const assignedText = (() => {
                                                            if (team && agentName) return `${agentName} / ${team.name}`;
                                                            if (team) return team.name;
                                                            if (agentName) return agentName;
                                                            return null;
                                                        })();
                                                        return assignedText ? (
                                                            <span className="contact-assigned-pill">
                                                                <User size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
                                                                <span>{assignedText}</span>
                                                            </span>
                                                        ) : <span className="cell-muted-dash">—</span>;
                                                    })()}
                                                </td>

                                                {/* AKTİVİTELER */}
                                                <td style={{ maxWidth: '180px', padding: '6px 8px', verticalAlign: 'middle' }}>
                                                    {(() => {
                                                        const acts = contact.activities || [];
                                                        if (acts.length === 0) return <span className="cell-muted-dash">—</span>;
                                                        const last3 = acts.slice(0, 3);
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                                {last3.map((e, idx) => {
                                                                    const done = e.status === 'COMPLETED';
                                                                    const cancelled = e.status === 'CANCELLED';
                                                                    const isCall = e.type === 'CALL' || e.type === 'REMINDER';
                                                                    const isMeeting = e.type === 'MEETING';
                                                                    const isPlanned = e.status === 'PLANNED';
                                                                    let label = '';
                                                                    let color = '#6b7280';
                                                                    let bg = '#f3f4f6';
                                                                    if (isCall && done) { label = 'Arandı'; color = '#15803d'; bg = '#f0fdf4'; }
                                                                    else if (isCall && cancelled) { label = 'Ulaşılamadı'; color = '#dc2626'; bg = '#fef2f2'; }
                                                                    else if (isCall && isPlanned) { label = 'Arama Bekliyor'; color = '#d97706'; bg = '#fffbeb'; }
                                                                    else if (isMeeting && isPlanned) { label = 'Görüşme Bekliyor'; color = '#2563eb'; bg = '#eff6ff'; }
                                                                    else if (isMeeting && done) { label = 'Görüşme Yapıldı'; color = '#15803d'; bg = '#f0fdf4'; }
                                                                    else if (e.type === 'NOTE') { label = 'Not Eklendi'; color = '#6b7280'; bg = '#f9fafb'; }
                                                                    else if (e.type === 'TASK' && done) { label = 'Görev Tamamlandı'; color = '#15803d'; bg = '#f0fdf4'; }
                                                                    else if (e.type === 'TASK' && isPlanned) { label = 'Görev Bekliyor'; color = '#d97706'; bg = '#fffbeb'; }
                                                                    else if (e.type === 'VISIT' && done) { label = 'Ziyaret Edildi'; color = '#15803d'; bg = '#f0fdf4'; }
                                                                    else if (e.type === 'VISIT' && isPlanned) { label = 'Ziyaret Bekliyor'; color = '#2563eb'; bg = '#eff6ff'; }
                                                                    else {
                                                                        const typeLabels = { CALL: 'Arama', MEETING: 'Toplantı', VISIT: 'Ziyaret', TASK: 'Görev', REMINDER: 'Hatırlatıcı', NOTE: 'Not' };
                                                                        label = typeLabels[e.type] || e.type;
                                                                    }
                                                                    const dateStr = e.dueDate
                                                                        ? new Date(e.dueDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
                                                                        : (e.createdAt ? new Date(e.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '');
                                                                    const isAI = e.source === 'AI' || e.source === 'RETELL' || e.assignedByType === 'AI';
                                                                    const performerName = isAI ? 'AI' : (e.assignee?.name || e.creator?.name || '');
                                                                    const shortName = performerName === 'AI' ? '🤖' : (performerName ? performerName.split(' ')[0] : '');
                                                                    return (
                                                                        <div key={idx} className="contact-activity-item" style={{ background: bg }}>
                                                                            <span style={{
                                                                                fontSize: '0.67rem', fontWeight: 600,
                                                                                color: color, lineHeight: 1.3
                                                                            }}>
                                                                                {label}
                                                                            </span>
                                                                            {dateStr && (
                                                                                <span style={{
                                                                                    fontSize: '0.6rem', color: '#94a3b8',
                                                                                    fontWeight: 400, lineHeight: 1.3
                                                                                }}>
                                                                                    {dateStr}
                                                                                </span>
                                                                            )}
                                                                            {shortName && (
                                                                                <span style={{
                                                                                    fontSize: '0.58rem', color: isAI ? '#8b5cf6' : '#64748b',
                                                                                    fontWeight: 500, lineHeight: 1.3,
                                                                                    opacity: 0.85
                                                                                }}>
                                                                                    {shortName}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>

                                                {/* SON NOT */}
                                                <td className="contact-last-note" style={{
                                                    maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem',
                                                    color: contact.lastNoteType === 'planned' ? '#f59e0b' : contact.lastNoteType === 'activity' ? '#3b82f6' : '#64748b'
                                                }}>
                                                    {contact.lastNote ? (
                                                        <span title={contact.lastNote}>
                                                            {contact.lastNote}
                                                        </span>
                                                    ) : <span className="cell-muted-dash">—</span>}
                                                </td>
                                                {/* İLK YAZMA */}
                                                <td className="contact-created" style={{ fontSize: '0.78rem', maxWidth: '90px', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                                    {contact.createdAt ? formatDate(contact.createdAt) : <span className="cell-muted-dash">—</span>}
                                                </td>
                                                {/* SON YAZMA */}
                                                <td className="contact-last-message" style={{ fontSize: '0.78rem', maxWidth: '90px', color: '#334155', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                                                    {contact.lastMessageAt ? formatDate(contact.lastMessageAt) : <span className="cell-muted-dash">—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination + Limit + Import/Export — tek satır */}
                    <div className="customers-footer-bar">
                        {/* Sol: Limit seçici */}
                        <div className="customers-footer-limit">
                            <span className="customers-limit-label">Göster:</span>
                            <div className="customers-limit-segmented">
                                {[20, 50, 100, 'Tümü'].map(val => (
                                    <button
                                        key={val}
                                        type="button"
                                        className={`customers-limit-btn ${limit === (val === 'Tümü' ? 999999 : val) ? 'active' : ''}`}
                                        onClick={() => { setLimit(val === 'Tümü' ? 999999 : val); setPage(1); }}
                                    >{val}</button>
                                ))}
                            </div>
                        </div>

                        {/* Orta: Sayfa navigasyon */}
                        <div className="customers-footer-pagination">
                            <button
                                type="button"
                                className="pagination-btn"
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                <ChevronLeft size={14} /> Önceki
                            </button>
                            <span className="pagination-info">
                                <strong>{page}</strong> / {Math.max(1, Math.ceil(total / limit))}
                            </span>
                            <button
                                type="button"
                                className="pagination-btn"
                                disabled={page >= Math.ceil(total / limit)}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Sonraki <ChevronRight size={14} />
                            </button>
                        </div>

                        {/* Sağ: İçe / Dışa Aktar */}
                        <div className="customers-footer-actions">
                            <button
                                type="button"
                                className="export-csv-btn import-csv-btn"
                                onClick={() => { setShowImportModal(true); setImportData([]); setImportResult(null); setImportFileName(''); setImportTag(''); }}
                                title="Excel İçe Aktar"
                            >
                                <Upload size={13} /> İçe Aktar
                            </button>
                            <button
                                type="button"
                                className="export-csv-btn"
                                onClick={() => setShowExportModal(true)}
                                title="CSV Dışa Aktar"
                            >
                                <Download size={13} /> Dışa Aktar
                            </button>
                            {currentWorkspace?.id === '4a7e92e8-6e4c-4a48-b0a8-ffe0eb61bf33' && (
                                <button
                                    type="button"
                                    className="export-csv-btn export-report2-btn"
                                    onClick={handleOpenReport2Modal}
                                    disabled={report2Loading}
                                    title="Arama & Talep Görüşme Raporu (Dışa Aktar 2)"
                                    style={{ background: '#0284c7', color: '#fff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {report2Loading ? <Loader size={13} className="spin" /> : <FileText size={13} />} Dışa Aktar 2
                                </button>
                            )}
                            {currentWorkspace?.id === 'dbdb6e87-9769-4975-ad57-a984a1e8b995' && (
                                <button
                                    type="button"
                                    className="export-csv-btn"
                                    onClick={handleExportLeads}
                                    disabled={exportingLeads}
                                    title="Facebook Lead Dışa Aktar"
                                    style={{ background: '#7c3aed', color: '#fff' }}
                                >
                                    {exportingLeads ? <Loader size={13} className="spin" /> : <Download size={13} />} Lead Dışa Aktar
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                    {/* Bulk Actions */}
                    {selectedIds.length > 0 && (
                        <div className="customers-floating-bulk-bar">
                            <div className="customers-bulk-bar-content">
                                <div className="customers-bulk-bar-left">
                                    <button className="customers-bulk-close-btn" onClick={() => { setSelectedIds([]); setAllSelectedContacts([]); }}>
                                        <X size={16} />
                                    </button>
                                    <span className="customers-bulk-count"><strong>{selectedIds.length}</strong> kişi seçildi</span>
                                </div>
                                <div className="customers-bulk-bar-actions">
                                    {selectedIds.length < total && (
                                        <button className="customers-bulk-select-all-btn" onClick={handleSelectAllGlobal}>
                                            Tümünü Seç ({total})
                                        </button>
                                    )}
                                    {selectedIds.length === total && total > contacts.length && (
                                        <button className="customers-bulk-select-all-btn" onClick={() => { setSelectedIds([]); setAllSelectedContacts([]); }}>
                                            Seçimi Kaldır ({total})
                                        </button>
                                    )}
                                    <button className="customers-bulk-action-btn customers-bulk-wa-btn" onClick={async () => {
                                        setShowBulkWA(true);
                                        setCreateCampaignForBulk(true);
                                        setBulkCampaignSuccess(null);
                                        const now = new Date();
                                        setBulkCampaignName(`Toplu WhatsApp - ${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
                                        try {
                                            const res = await automationAPI.getTemplates(currentWorkspace.id);
                                            setWaTemplates(res.data.templates || res.data || []);
                                        } catch (e) { console.error(e); }
                                    }}>
                                        <MessageCircle size={16} />
                                        WhatsApp
                                    </button>
                                    <button className="customers-bulk-action-btn customers-bulk-email-btn" onClick={async () => {
                                        setShowBulkEmail(true);
                                        setCreateCampaignForBulk(true);
                                        setBulkCampaignSuccess(null);
                                        const now = new Date();
                                        setBulkCampaignName(`Toplu E-posta - ${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
                                        try {
                                            const res = await emailAPI.getChannels(currentWorkspace.id);
                                            setEmailChannels(res.data.emailChannels || res.data.channels || res.data || []);
                                        } catch (e) { console.error(e); }
                                    }}>
                                        <Mail size={16} />
                                        E-posta
                                    </button>
                                    <button className="customers-bulk-action-btn customers-bulk-call-btn" onClick={() => {
                                        setShowBulkCall(true);
                                        setCreateCampaignForBulk(true);
                                        setBulkCampaignSuccess(null);
                                        const now = new Date();
                                        setBulkCampaignName(`Toplu AI Sesli Arama - ${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
                                    }}>
                                        <PhoneCall size={16} />
                                        Ara
                                    </button>
                                    <button className="customers-bulk-action-btn customers-bulk-status-btn" onClick={() => setShowBulkStatus(true)}>
                                        <ArrowUpDown size={16} />
                                        Durum Değiştir
                                    </button>
                                    <button
                                        className="customers-bulk-action-btn customers-bulk-export-btn"
                                        onClick={() => setShowSelectedExportModal(true)}
                                        title="Seçilen kişileri tarih aralığına göre dışa aktar"
                                    >
                                        <Download size={16} />
                                        Dışa Aktar
                                    </button>
                                    {user?.role === 'SUPER_ADMIN' && (
                                    <button className="customers-bulk-delete-btn" onClick={handleDeleteSelected} disabled={deleting}>
                                        <Trash2 size={16} />
                                        {deleting ? 'Siliniyor...' : 'Sil'}
                                    </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== BULK WHATSAPP TEMPLATE MODAL ========== */}
                    {showBulkWA && (
                        <div className="modal-overlay" onClick={() => !bulkWASending && setShowBulkWA(false)}>
                            <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
                                <button className="modal-close" onClick={() => !bulkWASending && setShowBulkWA(false)}><X size={20} /></button>
                                <div className="modal-header">
                                    <h2>📱 Toplu WhatsApp Şablon Gönderimi</h2>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    {(() => {
                                        const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;
                                        const eligibleContacts = pool
                                            .map(c => ({ ...c, resolvedPhone: getContactPrimaryPhone(c) }))
                                            .filter(c => selectedIds.includes(c.id) && c.resolvedPhone);

                                        if (bulkCampaignSuccess) {
                                            return (
                                                <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
                                                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                                                        <Check size={28} />
                                                    </div>
                                                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                                                        Kampanya ve Reklam Grubu Oluşturuldu!
                                                    </h3>
                                                    <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: 1.5, marginBottom: '20px' }}>
                                                        <strong>"{bulkCampaignSuccess.campaignName}"</strong> kampanyası ve <strong>"{bulkCampaignSuccess.groupName}"</strong> reklam grubu altında seçilen <strong>{bulkCampaignSuccess.total}</strong> kişiye gönderim başlatıldı.
                                                    </p>
                                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '13px', color: '#64748b' }}>
                                                        💡 Gönderim durumlarını, teslimat ve okunma oranlarını <strong>Pazarlama / Kampanyalar</strong> ekranından canlı olarak takip edebilirsiniz.
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                                        <button className="btn btn-outline" onClick={() => {
                                                            setShowBulkWA(false);
                                                            setBulkCampaignSuccess(null);
                                                            setSelectedIds([]);
                                                            setAllSelectedContacts([]);
                                                        }}>
                                                            Kapat
                                                        </button>
                                                        <button className="btn btn-primary" onClick={() => {
                                                            setShowBulkWA(false);
                                                            setBulkCampaignSuccess(null);
                                                            setSelectedIds([]);
                                                            setAllSelectedContacts([]);
                                                            navigate('/marketing');
                                                        }}>
                                                            Pazarlama Sayfasında Gör ↗️
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <>
                                                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                                                    <strong>{eligibleContacts.length}</strong> / {selectedIds.length} kişinin telefon numarası mevcut.
                                                </p>
                                                {eligibleContacts.length === 0 ? (
                                                    <p style={{ color: '#ef4444' }}>Seçilen kişilerin telefon numarası yok.</p>
                                                ) : (
                                                    <>
                                                        <div className="form-group" style={{ marginBottom: '14px' }}>
                                                            <label>Şablon Seç</label>
                                                            <select className="form-input" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                                                                <option value="">-- Şablon seçin --</option>
                                                                {waTemplates.filter(t => t.status === 'APPROVED').map(t => (
                                                                    <option key={t.id || t.name} value={t.name}>{t.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', color: '#166534', cursor: 'pointer' }}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={createCampaignForBulk} 
                                                                    onChange={e => setCreateCampaignForBulk(e.target.checked)} 
                                                                    style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }}
                                                                />
                                                                <span>🎯 Otomatik Pazarlama Kampanyası ve Reklam Grubu Oluştur</span>
                                                            </label>
                                                            {createCampaignForBulk && (
                                                                <div style={{ marginTop: '10px' }}>
                                                                    <label style={{ display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: 500 }}>
                                                                        Kampanya Adı
                                                                    </label>
                                                                    <input 
                                                                        type="text" 
                                                                        className="form-input" 
                                                                        value={bulkCampaignName} 
                                                                        onChange={e => setBulkCampaignName(e.target.value)} 
                                                                        placeholder="Örn: Toplu WhatsApp Gönderimi"
                                                                        style={{ fontSize: '13px', padding: '8px 10px', backgroundColor: '#fff' }}
                                                                    />
                                                                    <p style={{ fontSize: '11px', color: '#15803d', marginTop: '4px', margin: '4px 0 0 0' }}>
                                                                        💡 Pazarlama sayfasında otomatik olarak bu isimde bir Kampanya ve WhatsApp Reklam Grubu açılarak tüm teslim/okundu istatistikleri canlı takip edilir.
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {bulkWASending && !createCampaignForBulk && (
                                                            <div className="customers-bulk-progress">
                                                                <div className="customers-bulk-progress-bar">
                                                                    <div className="customers-bulk-progress-fill" style={{ width: `${(bulkWAProgress.sent / bulkWAProgress.total) * 100}%` }} />
                                                                </div>
                                                                <span>{bulkWAProgress.sent} / {bulkWAProgress.total} gönderildi{bulkWAProgress.errors > 0 && ` (${bulkWAProgress.errors} hata)`}</span>
                                                            </div>
                                                        )}
                                                        <div className="modal-actions">
                                                            <button className="btn btn-outline" onClick={() => setShowBulkWA(false)} disabled={bulkWASending}>İptal</button>
                                                            <button className="btn btn-primary" disabled={!selectedTemplate || bulkWASending} onClick={async () => {
                                                                if (createCampaignForBulk) {
                                                                    setBulkWASending(true);
                                                                    try {
                                                                        const res = await marketingV2API.quickBulkCampaign(currentWorkspace.id, {
                                                                            channel: 'WHATSAPP',
                                                                            campaignName: bulkCampaignName,
                                                                            templateName: selectedTemplate,
                                                                            contactIds: eligibleContacts.map(c => c.id)
                                                                        });
                                                                        setBulkCampaignSuccess({
                                                                            campaignId: res.data.campaign?.id,
                                                                            campaignName: res.data.campaign?.name || bulkCampaignName,
                                                                            groupName: res.data.group?.name,
                                                                            total: res.data.totalEligible || eligibleContacts.length
                                                                        });
                                                                    } catch (err) {
                                                                        alert('Hata: ' + (err.response?.data?.error || err.message));
                                                                    } finally {
                                                                        setBulkWASending(false);
                                                                    }
                                                                } else {
                                                                    setBulkWASending(true);
                                                                    const total = eligibleContacts.length;
                                                                    setBulkWAProgress({ sent: 0, total, errors: 0 });
                                                                    let errors = 0;
                                                                    for (let i = 0; i < eligibleContacts.length; i++) {
                                                                        const c = eligibleContacts[i];
                                                                        try {
                                                                            await automationAPI.sendTemplateDynamic(currentWorkspace.id, {
                                                                                templateName: selectedTemplate,
                                                                                phoneNumber: c.resolvedPhone,
                                                                                customerName: c.name || 'Müşteri'
                                                                            });
                                                                        } catch (e) { errors++; }
                                                                        setBulkWAProgress({ sent: i + 1, total, errors });
                                                                        if (i < eligibleContacts.length - 1) await new Promise(r => setTimeout(r, 500));
                                                                    }
                                                                    setBulkWASending(false);
                                                                    alert(`✅ ${total - errors} / ${total} kişiye şablon gönderildi.`);
                                                                    setShowBulkWA(false);
                                                                    setSelectedTemplate('');
                                                                    setSelectedIds([]);
                                                                    setAllSelectedContacts([]);
                                                                }
                                                            }}>
                                                                {bulkWASending ? <><Loader size={14} className="spin" /> {createCampaignForBulk ? 'Kampanya Başlatılıyor...' : 'Gönderiliyor...'}</> : <><Send size={14} /> Gönder</>}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== BULK EMAIL MODAL ========== */}
                    {showBulkEmail && (
                        <div className="modal-overlay" onClick={() => !bulkEmailSending && setShowBulkEmail(false)}>
                            <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
                                <button className="modal-close" onClick={() => !bulkEmailSending && setShowBulkEmail(false)}><X size={20} /></button>
                                <div className="modal-header">
                                    <h2>📧 Toplu E-posta Gönderimi</h2>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    {(() => {
                                        const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;
                                        const eligibleContacts = pool.filter(c => selectedIds.includes(c.id) && (c.email || c.emails?.[0]));

                                        if (bulkCampaignSuccess) {
                                            return (
                                                <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
                                                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                                                        <Check size={28} />
                                                    </div>
                                                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                                                        Kampanya ve Reklam Grubu Oluşturuldu!
                                                    </h3>
                                                    <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: 1.5, marginBottom: '20px' }}>
                                                        <strong>"{bulkCampaignSuccess.campaignName}"</strong> kampanyası ve <strong>"{bulkCampaignSuccess.groupName}"</strong> reklam grubu altında seçilen <strong>{bulkCampaignSuccess.total}</strong> kişiye e-posta gönderimi başlatıldı.
                                                    </p>
                                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '13px', color: '#64748b' }}>
                                                        💡 Gönderim durumlarını ve istatistikleri <strong>Pazarlama / Kampanyalar</strong> ekranından canlı olarak takip edebilirsiniz.
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                                        <button className="btn btn-outline" onClick={() => {
                                                            setShowBulkEmail(false);
                                                            setBulkCampaignSuccess(null);
                                                            setSelectedIds([]);
                                                            setAllSelectedContacts([]);
                                                        }}>
                                                            Kapat
                                                        </button>
                                                        <button className="btn btn-primary" onClick={() => {
                                                            setShowBulkEmail(false);
                                                            setBulkCampaignSuccess(null);
                                                            setSelectedIds([]);
                                                            setAllSelectedContacts([]);
                                                            navigate('/marketing');
                                                        }}>
                                                            Pazarlama Sayfasında Gör ↗️
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <>
                                                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                                                    <strong>{eligibleContacts.length}</strong> / {selectedIds.length} kişinin e-posta adresi mevcut.
                                                </p>
                                                {eligibleContacts.length === 0 ? (
                                                    <p style={{ color: '#ef4444' }}>Seçilen kişilerin e-posta adresi yok.</p>
                                                ) : (
                                                    <>
                                                        <div className="form-group">
                                                            <label>E-posta Kanalı</label>
                                                            <select className="form-input" value={selectedEmailChannel} onChange={e => setSelectedEmailChannel(e.target.value)}>
                                                                <option value="">-- Kanal seçin --</option>
                                                                {emailChannels.map(ch => (
                                                                    <option key={ch.id} value={ch.id}>{ch.emailAddress || ch.email || ch.id}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Konu</label>
                                                            <input className="form-input" placeholder="E-posta konusu..." value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Mesaj</label>
                                                            <textarea className="form-input" rows={5} placeholder="E-posta içeriği..." value={emailBody} onChange={e => setEmailBody(e.target.value)} style={{ resize: 'vertical', minHeight: '100px' }} />
                                                        </div>

                                                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', color: '#166534', cursor: 'pointer' }}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={createCampaignForBulk} 
                                                                    onChange={e => setCreateCampaignForBulk(e.target.checked)} 
                                                                    style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }}
                                                                />
                                                                <span>🎯 Otomatik Pazarlama Kampanyası ve Reklam Grubu Oluştur</span>
                                                            </label>
                                                            {createCampaignForBulk && (
                                                                <div style={{ marginTop: '10px' }}>
                                                                    <label style={{ display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: 500 }}>
                                                                        Kampanya Adı
                                                                    </label>
                                                                    <input 
                                                                        type="text" 
                                                                        className="form-input" 
                                                                        value={bulkCampaignName} 
                                                                        onChange={e => setBulkCampaignName(e.target.value)} 
                                                                        placeholder="Örn: Toplu E-posta Kampanyası"
                                                                        style={{ fontSize: '13px', padding: '8px 10px', backgroundColor: '#fff' }}
                                                                    />
                                                                    <p style={{ fontSize: '11px', color: '#15803d', marginTop: '4px', margin: '4px 0 0 0' }}>
                                                                        💡 Pazarlama sayfasında otomatik olarak bu isimde bir Kampanya ve E-posta Reklam Grubu açılarak canlı takip edilir.
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {bulkEmailSending && !createCampaignForBulk && (
                                                            <div className="customers-bulk-progress">
                                                                <div className="customers-bulk-progress-bar">
                                                                    <div className="customers-bulk-progress-fill" style={{ width: `${(bulkEmailProgress.sent / bulkEmailProgress.total) * 100}%` }} />
                                                                </div>
                                                                <span>{bulkEmailProgress.sent} / {bulkEmailProgress.total} gönderildi{bulkEmailProgress.errors > 0 && ` (${bulkEmailProgress.errors} hata)`}</span>
                                                            </div>
                                                        )}
                                                        <div className="modal-actions">
                                                            <button className="btn btn-outline" onClick={() => setShowBulkEmail(false)} disabled={bulkEmailSending}>İptal</button>
                                                            <button className="btn btn-primary" disabled={!selectedEmailChannel || !emailSubject.trim() || !emailBody.trim() || bulkEmailSending} onClick={async () => {
                                                                if (createCampaignForBulk) {
                                                                    setBulkEmailSending(true);
                                                                    try {
                                                                        const res = await marketingV2API.quickBulkCampaign(currentWorkspace.id, {
                                                                            channel: 'EMAIL',
                                                                            campaignName: bulkCampaignName,
                                                                            emailSubject,
                                                                            emailBody,
                                                                            emailChannelId: selectedEmailChannel,
                                                                            contactIds: eligibleContacts.map(c => c.id)
                                                                        });
                                                                        setBulkCampaignSuccess({
                                                                            campaignId: res.data.campaign?.id,
                                                                            campaignName: res.data.campaign?.name || bulkCampaignName,
                                                                            groupName: res.data.group?.name,
                                                                            total: res.data.totalEligible || eligibleContacts.length
                                                                        });
                                                                    } catch (err) {
                                                                        alert('Hata: ' + (err.response?.data?.error || err.message));
                                                                    } finally {
                                                                        setBulkEmailSending(false);
                                                                    }
                                                                } else {
                                                                    setBulkEmailSending(true);
                                                                    const total = eligibleContacts.length;
                                                                    setBulkEmailProgress({ sent: 0, total, errors: 0 });
                                                                    let errors = 0;
                                                                    for (let i = 0; i < eligibleContacts.length; i++) {
                                                                        const c = eligibleContacts[i];
                                                                        try {
                                                                            await emailAPI.sendNew(selectedEmailChannel, {
                                                                                to: c.email || c.emails?.[0],
                                                                                subject: emailSubject,
                                                                                body: emailBody
                                                                            });
                                                                        } catch (e) { errors++; }
                                                                        setBulkEmailProgress({ sent: i + 1, total, errors });
                                                                        if (i < eligibleContacts.length - 1) await new Promise(r => setTimeout(r, 300));
                                                                    }
                                                                    setBulkEmailSending(false);
                                                                    alert(`✅ ${total - errors} / ${total} kişiye e-posta gönderildi.`);
                                                                    setShowBulkEmail(false);
                                                                    setEmailSubject('');
                                                                    setEmailBody('');
                                                                    setSelectedIds([]);
                                                                    setAllSelectedContacts([]);
                                                                }
                                                            }}>
                                                                {bulkEmailSending ? <><Loader size={14} className="spin" /> {createCampaignForBulk ? 'Kampanya Başlatılıyor...' : 'Gönderiliyor...'}</> : <><Send size={14} /> Gönder</>}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== BULK CALL MODAL ========== */}
                    {showBulkCall && (
                        <div className="modal-overlay" onClick={() => !bulkCallRunning && setShowBulkCall(false)}>
                            <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
                                <button className="modal-close" onClick={() => !bulkCallRunning && setShowBulkCall(false)}><X size={20} /></button>
                                <div className="modal-header">
                                    <h2>📞 Toplu AI Sesli Arama</h2>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    {(() => {
                                        const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;
                                        const eligibleContacts = pool
                                            .map(c => ({ ...c, resolvedPhone: getContactPrimaryPhone(c) }))
                                            .filter(c => selectedIds.includes(c.id) && c.resolvedPhone);

                                        if (bulkCampaignSuccess) {
                                            return (
                                                <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
                                                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                                                        <Check size={28} />
                                                    </div>
                                                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                                                        Kampanya ve Reklam Grubu Oluşturuldu!
                                                    </h3>
                                                    <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: 1.5, marginBottom: '20px' }}>
                                                        <strong>"{bulkCampaignSuccess.campaignName}"</strong> kampanyası ve <strong>"{bulkCampaignSuccess.groupName}"</strong> reklam grubu altında seçilen <strong>{bulkCampaignSuccess.total}</strong> kişiye AI sesli aramalar başlatıldı.
                                                    </p>
                                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '13px', color: '#64748b' }}>
                                                        💡 Arama sonuçlarını, başarı oranlarını ve çağrı kayıtlarını <strong>Pazarlama / Kampanyalar</strong> ekranından canlı olarak takip edebilirsiniz.
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                                        <button className="btn btn-outline" onClick={() => {
                                                            setShowBulkCall(false);
                                                            setBulkCampaignSuccess(null);
                                                            setSelectedIds([]);
                                                            setAllSelectedContacts([]);
                                                        }}>
                                                            Kapat
                                                        </button>
                                                        <button className="btn btn-primary" onClick={() => {
                                                            setShowBulkCall(false);
                                                            setBulkCampaignSuccess(null);
                                                            setSelectedIds([]);
                                                            setAllSelectedContacts([]);
                                                            navigate('/marketing');
                                                        }}>
                                                            Pazarlama Sayfasında Gör ↗️
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <>
                                                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                                                    <strong>{eligibleContacts.length}</strong> / {selectedIds.length} kişinin telefon numarası mevcut.
                                                </p>
                                                {eligibleContacts.length === 0 ? (
                                                    <p style={{ color: '#ef4444' }}>Seçilen kişilerin telefon numarası yok.</p>
                                                ) : (
                                                    <>
                                                        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
                                                            ⚠️ Aramalar sıralı olarak başlatılacaktır. Her arama arasında sistem güvenliği için bekleme süresi olacaktır.
                                                        </div>

                                                        <div className="bulk-call-agent-selector" style={{ marginBottom: '20px' }}>
                                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>Konuşacak AI Call Agent</label>
                                                            <select
                                                                value={selectedAgentId}
                                                                onChange={(e) => setSelectedAgentId(e.target.value)}
                                                                style={{ 
                                                                    width: '100%', 
                                                                    padding: '10px 12px', 
                                                                    borderRadius: '8px', 
                                                                    border: '1px solid #d1d5db', 
                                                                    fontSize: '14px', 
                                                                    backgroundColor: '#fff',
                                                                    outline: 'none',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <option value="">Varsayılan AI Call Agent</option>
                                                                {retellAgents.map(a => (
                                                                    <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>
                                                                ))}
                                                            </select>
                                                            <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                                                                Boş bırakırsanız varsayılan AI Call Agent kullanılır.
                                                            </p>
                                                        </div>

                                                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', color: '#166534', cursor: 'pointer' }}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={createCampaignForBulk} 
                                                                    onChange={e => setCreateCampaignForBulk(e.target.checked)} 
                                                                    style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }}
                                                                />
                                                                <span>🎯 Otomatik Pazarlama Kampanyası ve Reklam Grubu Oluştur</span>
                                                            </label>
                                                            {createCampaignForBulk && (
                                                                <div style={{ marginTop: '10px' }}>
                                                                    <label style={{ display: 'block', fontSize: '12px', color: '#374151', marginBottom: '4px', fontWeight: 500 }}>
                                                                        Kampanya Adı
                                                                    </label>
                                                                    <input 
                                                                        type="text" 
                                                                        className="form-input" 
                                                                        value={bulkCampaignName} 
                                                                        onChange={e => setBulkCampaignName(e.target.value)} 
                                                                        placeholder="Örn: Toplu AI Sesli Arama Kampanyası"
                                                                        style={{ fontSize: '13px', padding: '8px 10px', backgroundColor: '#fff' }}
                                                                    />
                                                                    <p style={{ fontSize: '11px', color: '#15803d', marginTop: '4px', margin: '4px 0 0 0' }}>
                                                                        💡 Pazarlama sayfasında otomatik olarak bu isimde bir Kampanya ve AI Sesli Arama Reklam Grubu açılarak canlı takip edilir.
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="customers-bulk-call-list">
                                                            {eligibleContacts.map(c => (
                                                                <div key={c.id} className="customers-bulk-call-item">
                                                                    <span>{c.name || 'İsimsiz'}</span>
                                                                    <span style={{ color: '#6b7280', fontSize: '13px' }}>{c.resolvedPhone}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {bulkCallRunning && !createCampaignForBulk && (
                                                            <div className="customers-bulk-progress">
                                                                <div className="customers-bulk-progress-bar">
                                                                    <div className="customers-bulk-progress-fill" style={{ width: `${(bulkCallProgress.called / bulkCallProgress.total) * 100}%` }} />
                                                                </div>
                                                                <span>{bulkCallProgress.called} / {bulkCallProgress.total} arandı{bulkCallProgress.errors > 0 && ` (${bulkCallProgress.errors} hata)`}</span>
                                                            </div>
                                                        )}
                                                        <div className="modal-actions">
                                                            <button className="btn btn-outline" onClick={() => setShowBulkCall(false)} disabled={bulkCallRunning}>İptal</button>
                                                            <button className="btn btn-primary" disabled={bulkCallRunning} onClick={async () => {
                                                                if (createCampaignForBulk) {
                                                                    setBulkCallRunning(true);
                                                                    try {
                                                                        const res = await marketingV2API.quickBulkCampaign(currentWorkspace.id, {
                                                                            channel: 'AI_CALL',
                                                                            campaignName: bulkCampaignName,
                                                                            agentId: selectedAgentId,
                                                                            contactIds: eligibleContacts.map(c => c.id)
                                                                        });
                                                                        setBulkCampaignSuccess({
                                                                            campaignId: res.data.campaign?.id,
                                                                            campaignName: res.data.campaign?.name || bulkCampaignName,
                                                                            groupName: res.data.group?.name,
                                                                            total: res.data.totalEligible || eligibleContacts.length
                                                                        });
                                                                    } catch (err) {
                                                                        alert('Hata: ' + (err.response?.data?.error || err.message));
                                                                    } finally {
                                                                        setBulkCallRunning(false);
                                                                    }
                                                                } else {
                                                                    setBulkCallRunning(true);
                                                                    const total = eligibleContacts.length;
                                                                    setBulkCallProgress({ called: 0, total, errors: 0 });
                                                                    let errors = 0;
                                                                    for (let i = 0; i < eligibleContacts.length; i++) {
                                                                        const c = eligibleContacts[i];
                                                                        try {
                                                                            await retellAPI.makeCall(currentWorkspace.id, {
                                                                                toNumber: c.resolvedPhone,
                                                                                contactId: c.id,
                                                                                contactName: c.name || 'Müşteri',
                                                                                agentId: selectedAgentId
                                                                            });
                                                                        } catch (e) { errors++; }
                                                                        setBulkCallProgress({ called: i + 1, total, errors });
                                                                        if (i < eligibleContacts.length - 1) await new Promise(r => setTimeout(r, 3000));
                                                                    }
                                                                    setBulkCallRunning(false);
                                                                    alert(`✅ ${total - errors} / ${total} kişi arandı.`);
                                                                    setShowBulkCall(false);
                                                                    setSelectedIds([]);
                                                                    setAllSelectedContacts([]);
                                                                }
                                                            }}>
                                                                {bulkCallRunning ? <><Loader size={14} className="spin" /> {createCampaignForBulk ? 'Kampanya Başlatılıyor...' : 'Aranıyor...'}</> : <><PhoneCall size={14} /> Aramaları Başlat</>}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== BULK STATUS CHANGE MODAL ========== */}
                    {showBulkStatus && (
                        <div className="modal-overlay" onClick={() => !bulkStatusRunning && setShowBulkStatus(false)}>
                            <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
                                <button className="modal-close" onClick={() => !bulkStatusRunning && setShowBulkStatus(false)}><X size={20} /></button>
                                <div className="modal-header">
                                    <h2>🔄 Toplu Durum Değiştir</h2>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                                        <strong>{selectedIds.length}</strong> kişinin durumunu topluca değiştireceksiniz.
                                    </p>

                                    <div className="form-group" style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>Satış Akışı Seçin</label>
                                        <select
                                            className="form-input"
                                            value={bulkStatusFunnel}
                                            onChange={(e) => { setBulkStatusFunnel(e.target.value); setBulkStatusStage(''); }}
                                        >
                                            <option value="">-- Akış seçin --</option>
                                            {availableFunnels.map(f => (
                                                <option key={f.id} value={f.id}>{f.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {bulkStatusFunnel && (() => {
                                        const funnel = availableFunnels.find(f => f.id === bulkStatusFunnel);
                                        const stages = funnel?.stages || [];
                                        return (
                                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>Aşama Seçin</label>
                                                <div className="bulk-status-stage-grid">
                                                    {stages.map(stage => (
                                                        <button
                                                            key={stage.id}
                                                            className={`bulk-status-stage-option ${bulkStatusStage === stage.id ? 'selected' : ''}`}
                                                            onClick={() => setBulkStatusStage(stage.id)}
                                                            style={{
                                                                '--stage-color': stage.color || '#6366f1',
                                                                '--stage-bg': (stage.color || '#6366f1') + '15',
                                                            }}
                                                        >
                                                            <span className="bulk-status-stage-dot" style={{ backgroundColor: stage.color || '#6366f1' }} />
                                                            <span>{stage.name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {bulkStatusRunning && (
                                        <div className="customers-bulk-progress">
                                            <div className="customers-bulk-progress-bar">
                                                <div className="customers-bulk-progress-fill" style={{ width: `${(bulkStatusProgress.done / bulkStatusProgress.total) * 100}%` }} />
                                            </div>
                                            <span>{bulkStatusProgress.done} / {bulkStatusProgress.total} güncellendi{bulkStatusProgress.errors > 0 && ` (${bulkStatusProgress.errors} hata)`}</span>
                                        </div>
                                    )}

                                    <div className="modal-actions">
                                        <button className="btn btn-outline" onClick={() => setShowBulkStatus(false)} disabled={bulkStatusRunning}>İptal</button>
                                        <button className="btn btn-primary" disabled={!bulkStatusStage || bulkStatusRunning} onClick={handleBulkStatusChange}>
                                            {bulkStatusRunning ? <><Loader size={14} className="spin" /> Güncelleniyor...</> : <><ArrowUpDown size={14} /> Uygula</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    </div>

                </div>

                {/* Right Sidebar - Shared ContactSidebar Component */}
                {selectedContact && (
                    <ContactSidebar
                        key={selectedContact.id}
                        contactId={selectedContact.id}
                        isOpen={!!selectedContact}
                        onClose={() => setSelectedContact(null)}
                        members={members}
                        teams={teams}
                        isOwner={true}
                        onAssignTeam={async (convId, teamId, skipApi) => {
                            try {
                                if (!skipApi) {
                                    await conversationAPI.assign(currentWorkspace.id, convId, { teamId });
                                }
                                const teamObj = teamId ? teams.find(t => t.id === teamId) : null;
                                const targetContactId = selectedContact.id;
                                setContacts(prev => prev.map(c => {
                                    if (c.id !== targetContactId) return c;
                                    const convs = (c.conversations || []).map(cv =>
                                        cv.id === convId ? { ...cv, assignedTeamId: teamId || null, teamIds: teamId ? JSON.stringify([teamId]) : '[]' } : cv
                                    );
                                    let newActiveCase = c.activeCase;
                                    if (newActiveCase) {
                                        newActiveCase = { ...newActiveCase, assignedTeamId: teamId || null };
                                    }
                                    return { ...c, conversations: convs, activeCase: newActiveCase };
                                }));
                                silentReloadContacts();
                            } catch (err) { console.error('Team assign error:', err); }
                        }}
                        onAssignUser={async (convId, userId, skipApi, teamId) => {
                            try {
                                if (!skipApi) {
                                    const payload = { userId: userId || null };
                                    if (teamId !== undefined) payload.teamId = teamId || null;
                                    await conversationAPI.assign(currentWorkspace.id, convId, payload);
                                }
                                // Anında lokal güncelle — tabloyu bekletme
                                const foundMember = userId ? (members.find(m => (m.user?.id || m.userId) === userId) || members.find(m => m.id === userId)) : null;
                                const agentObj = foundMember ? { id: userId, name: foundMember.user?.name || foundMember.name || 'Agent' } : (userId ? { id: userId, name: 'Agent' } : null);
                                const targetContactId = selectedContact.id;
                                setContacts(prev => prev.map(c => {
                                    if (c.id !== targetContactId) return c;
                                    const convs = (c.conversations || []).map(cv => {
                                        if (cv.id !== convId) return cv;
                                        const updatedCv = { ...cv, assignedToId: userId || null, assignedTo: agentObj };
                                        if (teamId !== undefined) {
                                            updatedCv.assignedTeamId = teamId || null;
                                            updatedCv.teamIds = teamId ? JSON.stringify([teamId]) : '[]';
                                        }
                                        return updatedCv;
                                    });
                                    let newActiveCase = c.activeCase;
                                    if (newActiveCase) {
                                        newActiveCase = { ...newActiveCase, assignedToId: userId || null, assignedToName: agentObj?.name || null };
                                        if (teamId !== undefined) {
                                            newActiveCase.assignedTeamId = teamId || null;
                                        }
                                    }
                                    return { ...c, conversations: convs, activeCase: newActiveCase };
                                }));
                                setTimeout(() => {
                                    silentReloadContacts();
                                }, 300);
                            } catch (err) { console.error('User assign error:', err); }
                        }}
                        onTakeOver={async (convId) => {
                            try {
                                await conversationAPI.claim(currentWorkspace.id, convId);
                                silentReloadContacts();
                            } catch (err) { console.error('TakeOver/Claim error:', err); }
                        }}
                        currentUserId={user?.id}
                    />
                )}
                {/* Create/Edit Contact Modal - Google Contacts Style */}
                <NewConversationModal
                    workspaceId={currentWorkspace?.id}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={(conversation) => {
                        loadContacts();
                    }}
                />

                {/* Dışa Aktar 2 — Arama & Talep Görüşme Raporu Modalı */}
                {showReport2Modal && (
                    <div className="modal-overlay" onClick={() => setShowReport2Modal(false)}>
                        <div className="modal-content report2-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '1180px', width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                            {/* Modal Header */}
                            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                        <FileText size={20} style={{ color: '#0284c7' }} />
                                        Arama & Talep Görüşme Raporu (Dışa Aktar 2)
                                    </h2>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                                        Kim hangi talep ile görüştü, görüşme sonuçları ve arama notları
                                    </p>
                                </div>
                                <button className="modal-close" onClick={() => setShowReport2Modal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Summary Metric Badges */}
                            <div className="report2-metrics-bar" style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <div className="report2-metric-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <PhoneCall size={16} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Toplam Kayıt</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{report2Stats.total || 0}</div>
                                    </div>
                                </div>

                                <div className="report2-metric-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <CheckCircle2 size={16} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Ulaşılan / Başarılı</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#16a34a' }}>{report2Stats.reachedCount || 0}</div>
                                    </div>
                                </div>

                                <div className="report2-metric-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <PhoneOff size={16} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Ulaşılamayan</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#dc2626' }}>{report2Stats.unreachedCount || 0}</div>
                                    </div>
                                </div>

                                <div className="report2-metric-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Users size={16} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Görüşen Temsilci</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{report2Stats.agentCount || 0}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Filter Bar */}
                            <div className="report2-filter-bar" style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                                {/* Date Presets */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'ALL', label: 'Tümü' },
                                        { id: 'TODAY', label: 'Bugün' },
                                        { id: 'WEEK', label: 'Bu Hafta' },
                                        { id: 'MONTH', label: 'Bu Ay' },
                                        { id: 'LAST_30', label: 'Son 30 Gün' }
                                    ].map(preset => (
                                        <button
                                            key={preset.id}
                                            onClick={() => handleReport2DatePreset(preset.id)}
                                            style={{
                                                padding: '5px 12px',
                                                borderRadius: '20px',
                                                fontSize: '12px',
                                                border: '1px solid',
                                                borderColor: report2DatePreset === preset.id ? '#0284c7' : '#cbd5e1',
                                                background: report2DatePreset === preset.id ? '#e0f2fe' : '#ffffff',
                                                color: report2DatePreset === preset.id ? '#0284c7' : '#475569',
                                                fontWeight: report2DatePreset === preset.id ? 700 : 500,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}

                                    {/* Custom Date Range */}
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                                        <input
                                            type="date"
                                            value={report2StartDate}
                                            onChange={e => { setReport2StartDate(e.target.value); setReport2DatePreset('CUSTOM'); }}
                                            style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                        />
                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>-</span>
                                        <input
                                            type="date"
                                            value={report2EndDate}
                                            onChange={e => { setReport2EndDate(e.target.value); setReport2DatePreset('CUSTOM'); }}
                                            style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                        />
                                        <button
                                            onClick={() => loadReport2Data(report2StartDate, report2EndDate)}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                background: '#f1f5f9',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Filtrele
                                        </button>
                                    </div>
                                </div>

                                {/* Search in Report */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ position: 'relative', minWidth: '240px' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input
                                            type="text"
                                            placeholder="Temsilci, müşteri, talep, not ara..."
                                            value={report2Search}
                                            onChange={e => setReport2Search(e.target.value)}
                                            style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
                                        />
                                    </div>

                                    {/* Direct Download Excel */}
                                    <button
                                        onClick={handleExportReport2Excel}
                                        disabled={report2Exporting || getFilteredReport2Data().length === 0}
                                        style={{
                                            padding: '6px 14px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: '#16a34a',
                                            color: '#ffffff',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            cursor: 'pointer'
                                        }}
                                        title="Excel Dosyası Olarak İndir"
                                    >
                                        {report2Exporting ? <Loader size={14} className="spin" /> : <Download size={14} />}
                                        Excel İndir ({getFilteredReport2Data().length})
                                    </button>
                                </div>
                            </div>

                            {/* Table / List Container */}
                            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '55vh', padding: '0' }}>
                                {report2Loading ? (
                                    <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748b' }}>
                                        <Loader size={28} className="spin" style={{ margin: '0 auto 12px', color: '#0284c7' }} />
                                        <p style={{ fontSize: '14px', margin: 0 }}>Görüşme ve talep raporu hazırlanıyor...</p>
                                    </div>
                                ) : getFilteredReport2Data().length === 0 ? (
                                    <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748b' }}>
                                        <CircleOff size={36} style={{ margin: '0 auto 10px', color: '#94a3b8' }} />
                                        <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Görüşme kaydı bulunamadı</p>
                                        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>Seçili tarih aralığı veya filtreye uygun arama/görüşme kaydı yok.</p>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10, borderBottom: '1px solid #cbd5e1' }}>
                                            <tr>
                                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', fontSize: '11px' }}>TEMSİLCİ / GÖRÜŞEN</th>
                                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', fontSize: '11px' }}>MÜŞTERİ</th>
                                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', fontSize: '11px' }}>TELEFON</th>
                                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', fontSize: '11px' }}>TALEP / KONU</th>
                                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', fontSize: '11px' }}>AŞAMA</th>
                                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', fontSize: '11px' }}>TÜR</th>
                                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', fontSize: '11px' }}>TARİH & SAAT</th>
                                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', fontSize: '11px' }}>DURUM</th>
                                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', fontSize: '11px', minWidth: '220px' }}>ARAMA NOTU</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getFilteredReport2Data().map((row, idx) => (
                                                <tr
                                                    key={row.id || idx}
                                                    style={{
                                                        borderBottom: '1px solid #f1f5f9',
                                                        background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                                                        transition: 'background 0.1s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafafa'}
                                                >
                                                    {/* Representative */}
                                                    <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{row.agentName}</div>
                                                        {row.teamName && row.teamName !== '---' && (
                                                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>🏢 {row.teamName}</div>
                                                        )}
                                                    </td>

                                                    {/* Customer */}
                                                    <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                                        <div style={{ fontWeight: 600, color: '#0284c7' }}>{row.customerName}</div>
                                                        {row.company && row.company !== '---' && (
                                                            <div style={{ fontSize: '10px', color: '#6366f1', marginTop: '2px' }}>🏢 {row.company}</div>
                                                        )}
                                                    </td>

                                                    {/* Phone */}
                                                    <td style={{ padding: '10px 14px', verticalAlign: 'top', color: '#334155', fontFamily: 'monospace', fontSize: '11px' }}>
                                                        {row.phone}
                                                    </td>

                                                    {/* Demand / Case */}
                                                    <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: '#f5f3ff', color: '#7c3aed', fontWeight: 600, fontSize: '11px' }}>
                                                            {row.caseTitle}
                                                        </span>
                                                        {row.caseNumber && row.caseNumber !== '---' && (
                                                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{row.caseNumber}</div>
                                                        )}
                                                    </td>

                                                    {/* Stage */}
                                                    <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', background: `${row.stageColor || '#64748b'}15`, color: row.stageColor || '#64748b', fontWeight: 600, fontSize: '11px' }}>
                                                            {row.stageName}
                                                        </span>
                                                    </td>

                                                    {/* Activity Type */}
                                                    <td style={{ padding: '10px 14px', verticalAlign: 'top', color: '#475569', fontSize: '11px' }}>
                                                        {row.activityType}
                                                    </td>

                                                    {/* Date & Time */}
                                                    <td style={{ padding: '10px 14px', verticalAlign: 'top', color: '#334155', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                        {row.formattedDate}
                                                    </td>

                                                    {/* Call Status / Outcome */}
                                                    <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                                        <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', background: `${row.statusBadgeColor}15`, color: row.statusBadgeColor, fontWeight: 600, fontSize: '11px' }}>
                                                            {row.callStatus}
                                                        </span>
                                                        {row.sentiment && row.sentiment !== '---' && (
                                                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{row.sentiment}</div>
                                                        )}
                                                    </td>

                                                    {/* Call Note */}
                                                    <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                                                        {row.callNote ? (
                                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', color: '#1e293b', lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                                                {row.callNote}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: '#cbd5e1' }}>Not yok</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                    Toplam <strong>{getFilteredReport2Data().length}</strong> görüşme kaydı listelendi.
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn-secondary"
                                        onClick={() => setShowReport2Modal(false)}
                                        style={{ padding: '6px 14px', fontSize: '12px' }}
                                    >
                                        Kapat
                                    </button>
                                    <button
                                        className="btn-primary"
                                        onClick={handleExportReport2Excel}
                                        disabled={report2Exporting || getFilteredReport2Data().length === 0}
                                        style={{ padding: '6px 16px', fontSize: '12px', background: '#16a34a', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                                    >
                                        {report2Exporting ? <Loader size={14} className="spin" /> : <Download size={14} />}
                                        Excel Olarak İndir (.xlsx)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Export Modal */}
                {showExportModal && (
                    <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>CSV Dışa Aktar</h2>
                                <button className="modal-close" onClick={() => setShowExportModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: '20px', color: '#666' }}>
                                    İlk yazma tarihine göre kişileri dışa aktarın
                                </p>
                                <div className="form-group">
                                    <label>Başlangıç Tarihi</label>
                                    <input
                                        type="date"
                                        value={exportStartDate}
                                        onChange={(e) => setExportStartDate(e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Bitiş Tarihi</label>
                                    <input
                                        type="date"
                                        value={exportEndDate}
                                        onChange={(e) => setExportEndDate(e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button
                                    className="btn-secondary"
                                    onClick={() => setShowExportModal(false)}
                                    disabled={exporting}
                                >
                                    İptal
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={handleExportCSV}
                                    disabled={exporting || !exportStartDate || !exportEndDate}
                                >
                                    {exporting ? 'Dışa Aktarılıyor...' : 'Dışa Aktar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Selected Contacts Export Modal with Date Filter */}
                {showSelectedExportModal && (
                    <div className="modal-overlay" onClick={() => !exportingSelected && setShowSelectedExportModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                            <div className="modal-header">
                                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Download size={20} style={{ color: '#0284c7' }} />
                                    Seçilen Kişileri Dışa Aktar
                                </h2>
                                <button className="modal-close" onClick={() => !exportingSelected && setShowSelectedExportModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body" style={{ padding: '1.5rem' }}>
                                <p style={{ marginBottom: '16px', color: '#64748b', fontSize: '13px' }}>
                                    Seçili <strong>{selectedIds.length}</strong> kişi arasından belirlediğiniz tarih aralığına göre Excel çıktısı alın.
                                </p>

                                {/* Hızlı Seçim Butonları */}
                                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const today = new Date().toISOString().slice(0, 10);
                                            setSelectedExportStartDate(today);
                                            setSelectedExportEndDate(today);
                                        }}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            borderRadius: '6px',
                                            border: '1px solid #cbd5e1',
                                            background: '#f8fafc',
                                            cursor: 'pointer',
                                            color: '#334155'
                                        }}
                                    >
                                        Bugün
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const d = new Date();
                                            d.setDate(d.getDate() - 1);
                                            const yesterday = d.toISOString().slice(0, 10);
                                            setSelectedExportStartDate(yesterday);
                                            setSelectedExportEndDate(yesterday);
                                        }}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            borderRadius: '6px',
                                            border: '1px solid #cbd5e1',
                                            background: '#f8fafc',
                                            cursor: 'pointer',
                                            color: '#334155'
                                        }}
                                    >
                                        Dün
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const end = new Date();
                                            const start = new Date();
                                            start.setDate(start.getDate() - 6);
                                            setSelectedExportStartDate(start.toISOString().slice(0, 10));
                                            setSelectedExportEndDate(end.toISOString().slice(0, 10));
                                        }}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            borderRadius: '6px',
                                            border: '1px solid #cbd5e1',
                                            background: '#f8fafc',
                                            cursor: 'pointer',
                                            color: '#334155'
                                        }}
                                    >
                                        Son 7 Gün
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const now = new Date();
                                            const y = now.getFullYear();
                                            const m = String(now.getMonth() + 1).padStart(2, '0');
                                            const d = String(now.getDate()).padStart(2, '0');
                                            setSelectedExportStartDate(`${y}-${m}-01`);
                                            setSelectedExportEndDate(`${y}-${m}-${d}`);
                                        }}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            borderRadius: '6px',
                                            border: '1px solid #cbd5e1',
                                            background: '#f8fafc',
                                            cursor: 'pointer',
                                            color: '#334155'
                                        }}
                                    >
                                        Bu Ay
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedExportStartDate('');
                                            setSelectedExportEndDate('');
                                        }}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            borderRadius: '6px',
                                            border: '1px solid #e2e8f0',
                                            background: (!selectedExportStartDate && !selectedExportEndDate) ? '#e0f2fe' : '#f8fafc',
                                            color: (!selectedExportStartDate && !selectedExportEndDate) ? '#0369a1' : '#64748b',
                                            fontWeight: (!selectedExportStartDate && !selectedExportEndDate) ? 600 : 400,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Tüm Tarihler
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Başlangıç Tarihi</label>
                                        <input
                                            type="date"
                                            value={selectedExportStartDate}
                                            onChange={(e) => setSelectedExportStartDate(e.target.value)}
                                            className="form-input"
                                            style={{ padding: '8px 10px', fontSize: '13px' }}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Bitiş Tarihi</label>
                                        <input
                                            type="date"
                                            value={selectedExportEndDate}
                                            onChange={(e) => setSelectedExportEndDate(e.target.value)}
                                            className="form-input"
                                            style={{ padding: '8px 10px', fontSize: '13px' }}
                                        />
                                    </div>
                                </div>

                                {/* Tarih Tipi Seçimi */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
                                        Filtrelenecek Tarih Alanı
                                    </label>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="selectedExportDateType"
                                                value="first"
                                                checked={selectedExportDateType === 'first'}
                                                onChange={() => setSelectedExportDateType('first')}
                                            />
                                            İlk Yazma / Kayıt Tarihi
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="selectedExportDateType"
                                                value="last"
                                                checked={selectedExportDateType === 'last'}
                                                onChange={() => setSelectedExportDateType('last')}
                                            />
                                            Son Yazma Tarihi
                                        </label>
                                    </div>
                                </div>

                                {/* Canlı Bilgi Kutusu */}
                                <div style={{
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    background: '#f0f9ff',
                                    border: '1px solid #bae6fd',
                                    color: '#0369a1',
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <span>📊 Aktarılacak Kişi:</span>
                                    <strong style={{ fontSize: '15px' }}>
                                        {getFilteredSelectedContacts().length} / {selectedIds.length}
                                    </strong>
                                </div>
                            </div>
                            <div className="modal-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => setShowSelectedExportModal(false)}
                                    disabled={exportingSelected}
                                    style={{ padding: '8px 16px', fontSize: '13px' }}
                                >
                                    İptal
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={handleExportSelected}
                                    disabled={exportingSelected || getFilteredSelectedContacts().length === 0}
                                    style={{
                                        padding: '8px 20px',
                                        fontSize: '13px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: '#0284c7',
                                        borderColor: '#0284c7'
                                    }}
                                >
                                    {exportingSelected ? <Loader size={14} className="spin" /> : <Download size={14} />}
                                    {exportingSelected ? 'Aktarılıyor...' : `Excel İndir (${getFilteredSelectedContacts().length})`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Excel Import Modal — AI-Powered */}
                {showImportModal && (
                    <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
                        <div className="modal-content modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px' }}>
                            <div className="modal-header">
                                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Sparkles size={20} style={{ color: '#a855f7' }} /> AI Excel İçe Aktar
                                </h2>
                                <button className="btn-icon" onClick={() => setShowImportModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '16px' }}>
                                    Herhangi bir Excel dosyası yükleyin — <strong>AI sütunları otomatik algılar</strong>. İsterseniz eşleştirmeyi düzenleyebilirsiniz.
                                </p>

                                {/* Tag Input */}
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
                                        <Tag size={14} /> Etiket Ekle (Zorunlu)
                                    </label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Örn: FUAR_2024 veya Müşteri Listesi"
                                        value={importTag}
                                        onChange={(e) => setImportTag(e.target.value)}
                                    />
                                    <small style={{ color: '#94a3b8', fontSize: '11px' }}>Bu etiket, içe aktarılan kişilere eklenecek ve daha sonra listeyi filtrelemenizi sağlayacaktır.</small>
                                </div>

                                {/* File Input */}
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block' }}>Dosya Seçin</label>
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleFileSelect}
                                        style={{ fontSize: '13px' }}
                                    />
                                    {importFileName && (
                                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>{importFileName}</span>
                                    )}
                                </div>

                                {/* AI Detecting Animation */}
                                {detectingColumns && (
                                    <div style={{
                                        padding: '20px',
                                        textAlign: 'center',
                                        background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 100%)',
                                        borderRadius: '12px',
                                        border: '1px solid #e9d5ff',
                                        marginBottom: '16px'
                                    }}>
                                        <Loader size={24} className="spin" style={{ color: '#a855f7', marginBottom: '8px' }} />
                                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#7c3aed', margin: '8px 0 4px' }}>
                                            🧠 AI Sütunları Algılıyor...
                                        </p>
                                        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                                            Excel dosyanız analiz ediliyor, sütun eşleştirmesi yapılıyor
                                        </p>
                                    </div>
                                )}

                                {/* AI Column Mapping */}
                                {importColMapping && !detectingColumns && importRawHeaders.length > 0 && (
                                    <div style={{
                                        marginBottom: '16px',
                                        padding: '14px',
                                        background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 100%)',
                                        borderRadius: '12px',
                                        border: '1px solid #e9d5ff'
                                    }}>
                                        <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Sparkles size={14} /> AI Sütun Eşleştirmesi
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            {[
                                                { field: 'name', label: '👤 Ad Soyad', required: true },
                                                { field: 'phone', label: '📱 Telefon', required: true },
                                                { field: 'email', label: '📧 E-posta', required: false },
                                                { field: 'notes', label: '📝 Notlar', required: false },
                                                { field: 'date', label: '📅 Tarih', required: false },
                                                { field: 'company', label: '🏢 Şirket', required: false },
                                                { field: 'city', label: '📍 Şehir', required: false },
                                            ].map(({ field, label, required }) => (
                                                <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontSize: '12px', fontWeight: 500, minWidth: '90px', color: '#334155' }}>
                                                        {label}{required && <span style={{ color: '#ef4444' }}>*</span>}
                                                    </span>
                                                    <select
                                                        className="form-input"
                                                        style={{
                                                            fontSize: '12px',
                                                            padding: '4px 8px',
                                                            flex: 1,
                                                            borderColor: importColMapping[field] !== undefined ? '#a855f7' : '#e2e8f0',
                                                            background: importColMapping[field] !== undefined ? '#faf5ff' : '#fff'
                                                        }}
                                                        value={importColMapping[field] !== undefined ? importColMapping[field] : -1}
                                                        onChange={(e) => handleMappingChange(field, parseInt(e.target.value))}
                                                    >
                                                        <option value={-1}>— Seçilmedi —</option>
                                                        {importRawHeaders.map((header, idx) => (
                                                            <option key={idx} value={idx}>
                                                                {header || `Sütun ${idx + 1}`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                        <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', marginBottom: 0 }}>
                                            ✨ AI otomatik algıladı. Gerekirse dropdown'lardan değiştirebilirsiniz.
                                        </p>
                                    </div>
                                )}

                                {/* Preview */}
                                {importData.length > 0 && !detectingColumns && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#334155' }}>Önizleme ({importData.length} kişi)</h4>
                                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                            <table className="contacts-table" style={{ fontSize: '12px' }}>
                                                <thead>
                                                    <tr>
                                                        <th>Ad Soyad</th>
                                                        <th>Telefon</th>
                                                        <th>Email</th>
                                                        <th>Notlar</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importData.slice(0, 10).map((row, i) => (
                                                        <tr key={i}>
                                                            <td>{row.name}</td>
                                                            <td>{row.phone}</td>
                                                            <td>{row.email}</td>
                                                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.notes}</td>
                                                        </tr>
                                                    ))}
                                                    {importData.length > 10 && (
                                                        <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>... ve {importData.length - 10} kişi daha</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Import Result */}
                                {importResult && (
                                    <div style={{
                                        padding: '12px 16px',
                                        borderRadius: '8px',
                                        background: importResult.error ? '#fef2f2' : '#f0fdf4',
                                        border: `1px solid ${importResult.error ? '#fca5a5' : '#86efac'}`,
                                        fontSize: '13px',
                                        marginBottom: '12px'
                                    }}>
                                        {importResult.error ? (
                                            <span style={{ color: '#dc2626' }}>❌ {importResult.error}</span>
                                        ) : (
                                            <span style={{ color: '#16a34a' }}>
                                                ✅ <strong>{importResult.imported}</strong> kişi aktarıldı, <strong>{importResult.skipped}</strong> kişi atlandı (zaten mevcut).
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn-secondary" onClick={() => setShowImportModal(false)}>
                                    Kapat
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={handleImportExcel}
                                    disabled={importing || importData.length === 0 || !importTag.trim() || detectingColumns}
                                    style={{ background: '#16a34a' }}
                                >
                                    {importing ? (
                                        <><Loader size={14} className="spin" /> Aktarılıyor...</>
                                    ) : (
                                        <><Upload size={14} /> {importData.length} Kişiyi Aktar</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                type={confirmModal.type}
            />
        </>
    );
};

export default Customers;
