import { useTranslation } from 'react-i18next';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI, knowledgeBaseAPI, retellAPI, appointmentConfigAPI, teamAPI, funnelAPI, productAPI, resourceAPI, aiSetupAPI } from '../../services/api';
import { getTopicCategories, createTopicCategory, updateTopicCategory, deleteTopicCategory } from '../../services/topicCategory.api';
import { Trash2, Database, FileText, Upload, Plus, File, Building2, Image, Pencil, X, Globe, RefreshCw, Link, Phone, ClipboardList, CheckCircle2, AlertTriangle, FileCheck, MapPin, Layers, FolderTree, Package, UserCircle, Sparkles, HelpCircle, Search, Wand2, Clock } from 'lucide-react';
import Products from '../Sales/Products';
import { getSectorLabels } from '../../utils/sectorLabels';
import './KnowledgeBase.css';
import './CompanyInfo.css';
import './Branches.css';

const branchInitials = (name) => {
    const words = (name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
};

const KnowledgeBase = ({ hideSidebar = false }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { currentWorkspace, user, refreshWorkspace } = useAuth();
    const workspaceMember = currentWorkspace?.members?.find(m => m.userId === user?.id);
    const canManage = user?.role === 'SUPER_ADMIN';
    const labels = getSectorLabels(currentWorkspace?.industry);
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'company');

    useEffect(() => {
        const tab = searchParams.get('tab') || 'company';
        setActiveTab(tab);
    }, [searchParams]);

    const handleSelectTab = (tab) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    // Categories States
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryDefaultTeamId, setNewCategoryDefaultTeamId] = useState('');
    const [newCategoryDefaultFunnelId, setNewCategoryDefaultFunnelId] = useState('');
    const [editingCategory, setEditingCategory] = useState(null);
    const [editCategoryName, setEditCategoryName] = useState('');
    const [editCategoryDefaultTeamId, setEditCategoryDefaultTeamId] = useState('');
    const [editCategoryDefaultFunnelId, setEditCategoryDefaultFunnelId] = useState('');

    // Resources States  
    const [resources, setResources] = useState([]);
    const [resourcesLoading, setResourcesLoading] = useState(false);
    const [showResourceForm, setShowResourceForm] = useState(false);
    const [editingResource, setEditingResource] = useState(null);
    const [googleCalendars, setGoogleCalendars] = useState([]);
    const [hasHealthSystem, setHasHealthSystem] = useState(false);
    const [resourceSyncFilter, setResourceSyncFilter] = useState('ALL');
    const [resourceForm, setResourceForm] = useState({ 
        name: '', title: '', description: '', type: 'PERSON', branchIds: [], 
        availableStart: '09:00', availableEnd: '18:00', slotMinutes: 30,
        syncProvider: 'WORKSPACE_DEFAULT', externalId: '', googleEmail: ''
    });

    // Knowledge Base States
    const [knowledgeEntries, setKnowledgeEntries] = useState([]);
    const [kbLoading, setKbLoading] = useState(false);
    const [newKbTitle, setNewKbTitle] = useState('');
    const [newKbContent, setNewKbContent] = useState('');
    const [uploading, setUploading] = useState(false);
    const [expandedEntries, setExpandedEntries] = useState({}); // Track which entries are expanded

    // Edit Modal States
    const [editingEntry, setEditingEntry] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [saving, setSaving] = useState(false);

    // URL/Feed States
    const [newUrl, setNewUrl] = useState('');
    const [urlSyncInterval, setUrlSyncInterval] = useState('');
    const [scraping, setScraping] = useState(false);
    const [syncingEntry, setSyncingEntry] = useState(null);

    // File upload result
    const [uploadResult, setUploadResult] = useState(null);

    // Retell Sync State
    const [syncingRetell, setSyncingRetell] = useState(false);

    // Company Info States
    const [companyInfo, setCompanyInfo] = useState({
        name: '',
        description: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        workingHours: '',
        logo: null,
        logoPreview: '',
        // Yeni alanlar
        founder: '',
        industry: 'GENERAL',
        businessAreas: [],
        serviceRegions: [],
        googleMapsUrl: '',
        scheduleEnabled: true,
        weeklySchedule: [
            { day: 0, label: 'Pazartesi', enabled: true, start: '09:00', end: '18:00' },
            { day: 1, label: 'Salı', enabled: true, start: '09:00', end: '18:00' },
            { day: 2, label: 'Çarşamba', enabled: true, start: '09:00', end: '18:00' },
            { day: 3, label: 'Perşembe', enabled: true, start: '09:00', end: '18:00' },
            { day: 4, label: 'Cuma', enabled: true, start: '09:00', end: '18:00' },
            { day: 5, label: 'Cumartesi', enabled: false, start: '09:00', end: '18:00' },
            { day: 6, label: 'Pazar', enabled: false, start: '09:00', end: '18:00' },
        ],
        holidaysConfig: {
            closedOnPublicHolidays: true,
            customHolidays: [],
            note: ''
        }
    });
    const [savingCompany, setSavingCompany] = useState(false);
    // Sunucudan en son okunan hâl. Kaydet çubuğundaki "kaç alan değişti"
    // sayacı ve "geri al" düğmesi bunu referans alır.
    const [companySnapshot, setCompanySnapshot] = useState(null);
    const [newBusinessArea, setNewBusinessArea] = useState('');
    const [regionSearchText, setRegionSearchText] = useState('');
    const [regionSuggestions, setRegionSuggestions] = useState([]);
    const [showRegionDropdown, setShowRegionDropdown] = useState(false);

    // AI Interactive Update & Setup States
    const [instructText, setInstructText] = useState('');
    const [instructLoading, setInstructLoading] = useState(false);
    const [showAiSetupModal, setShowAiSetupModal] = useState(false);
    const [aiSetupLoading, setAiSetupLoading] = useState(false);
    const [aiSetupResult, setAiSetupResult] = useState(null);
    const [aiSetupApplying, setAiSetupApplying] = useState(false);
    const [aiSetupUrl, setAiSetupUrl] = useState('');

    // Branches (Lokasyonlar / Şubeler) States
    const [branches, setBranches] = useState([]);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const [members, setMembers] = useState([]); // Temsilciler — şubede kim yetkili
    const [catalogFlow, setCatalogFlow] = useState(null); // Sıralı akış yeteneği + ayarlar
    const [catalogSaving, setCatalogSaving] = useState(false);
    const [teams, setTeams] = useState([]);
    const [funnels, setFunnels] = useState([]);
    const [newBranchName, setNewBranchName] = useState('');
    const [newBranchAddress, setNewBranchAddress] = useState('');
    const [newBranchPhone, setNewBranchPhone] = useState('');
    const [newBranchMapsUrl, setNewBranchMapsUrl] = useState('');
    const [newBranchIntegrationType, setNewBranchIntegrationType] = useState('WORKSPACE_DEFAULT');
    const [newBranchExternalCode, setNewBranchExternalCode] = useState('');
    const [newBranchGoogleEmail, setNewBranchGoogleEmail] = useState('');
    const [editingBranch, setEditingBranch] = useState(null);
    const [editBranchName, setEditBranchName] = useState('');
    const [editBranchAddress, setEditBranchAddress] = useState('');
    const [editBranchPhone, setEditBranchPhone] = useState('');
    const [editBranchMapsUrl, setEditBranchMapsUrl] = useState('');
    const [editBranchIntegrationType, setEditBranchIntegrationType] = useState('WORKSPACE_DEFAULT');
    const [editBranchExternalCode, setEditBranchExternalCode] = useState('');
    const [editBranchGoogleEmail, setEditBranchGoogleEmail] = useState('');

    // Product States
    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    
    // Selected Branch
    const [selectedBranch, setSelectedBranch] = useState(null);

    useEffect(() => {
        if (currentWorkspace) {
            loadKnowledgeBase();
            loadCompanyInfo();
            loadBranches();
            loadMembers();
            loadCatalogFlow();
            loadTeams();
            loadFunnels();
            loadCategories();
            loadProducts();
            loadResources();
        }
    }, [currentWorkspace]);

    const loadCategories = async () => {
        try {
            setCategoriesLoading(true);
            const res = await getTopicCategories(currentWorkspace.id);
            setCategories(res.data?.categories || res.data || []);
        } catch (err) { console.error('Error loading categories:', err); }
        finally { setCategoriesLoading(false); }
    };

    const loadProducts = async () => {
        try {
            setProductsLoading(true);
            const res = await productAPI.getAll(currentWorkspace.id);
            setProducts(res.data?.products || []);
        } catch (err) { console.error('Error loading products:', err); }
        finally { setProductsLoading(false); }
    };

    const loadResources = async () => {
        try {
            setResourcesLoading(true);
            const res = await resourceAPI.getAll(currentWorkspace.id);
            setResources(res.data?.resources || res.data || []);
            if (res.data?.googleCalendars) setGoogleCalendars(res.data.googleCalendars);
            if (res.data?.hasHealthSystem !== undefined) setHasHealthSystem(res.data.hasHealthSystem);
        } catch (err) { console.error('Error loading resources:', err); }
        finally { setResourcesLoading(false); }
    };

    const loadTeams = async () => {
        try {
            const res = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
            setTeams(res.data?.teams || []);
        } catch (err) { console.error('Error loading teams:', err); }
    };

    const loadCatalogFlow = async () => {
        try {
            const res = await workspaceAPI.getCatalogFlow(currentWorkspace.id);
            setCatalogFlow(res.data?.capability || null);
        } catch (err) { console.error('Error loading catalog flow:', err); }
    };

    const saveCatalogFlow = async (patch) => {
        setCatalogSaving(true);
        try {
            const res = await workspaceAPI.updateCatalogFlow(currentWorkspace.id, patch);
            setCatalogFlow(res.data?.capability || null);
        } catch (err) {
            console.error('Error saving catalog flow:', err);
        } finally {
            setCatalogSaving(false);
        }
    };

    const loadMembers = async () => {
        try {
            const res = await workspaceAPI.getMembers(currentWorkspace.id);
            setMembers((res.data?.members || []).filter(m => !m.isBot && m.userId));
        } catch (err) { console.error('Error loading members:', err); }
    };

    const parseMemberBranchIds = (raw) => {
        if (!raw) return [];
        try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(v) ? v : []; } catch { return []; }
    };
    // Şubeye açıkça yetkili temsilciler
    const agentsOfBranch = (branchId) => members.filter(m => parseMemberBranchIds(m.branchIds).includes(branchId));
    // Takımlar iç içe geliyor (üst takım → children); düzleştir
    const flattenTeams = (list, acc = []) => { (list || []).forEach(t => { acc.push(t); if (t.children?.length) flattenTeams(t.children, acc); }); return acc; };
    // Bu şubeden sorumlu takımlar (Takım kartındaki "Sorumlu Olduğu Şubeler")
    const teamsOfBranch = (branchId) => flattenTeams(teams).filter(t => parseMemberBranchIds(t.branchIds).includes(branchId));
    // Şube seçmemiş = tüm şubelerde yetkili (Çağrı Merkezi vb.)
    const allBranchAgents = () => members.filter(m => parseMemberBranchIds(m.branchIds).length === 0);
    const agentInitials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

    const loadFunnels = async () => {
        try {
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data?.funnels || []);
        } catch (err) { console.error('Error loading funnels:', err); }
    };

    const loadBranches = async () => {
        try {
            setBranchesLoading(true);
            const res = await appointmentConfigAPI.getLocations(currentWorkspace.id);
            setBranches(res.data?.locations || []);
        } catch (err) {
            console.error('Error loading branches/locations:', err);
        } finally {
            setBranchesLoading(false);
        }
    };

    const handleCreateBranch = async () => {
        if (!newBranchName.trim()) return;
        try {
            await appointmentConfigAPI.createLocation(currentWorkspace.id, {
                name: newBranchName,
                address: newBranchAddress,
                phone: newBranchPhone,
                googleMapsUrl: newBranchMapsUrl,
                integrationType: newBranchIntegrationType,
                externalBranchCode: newBranchExternalCode || null,
                googleEmail: newBranchGoogleEmail || null,
                defaultTeamId: null,
                defaultFunnelId: null
            });
            setNewBranchName('');
            setNewBranchAddress('');
            setNewBranchPhone('');
            setNewBranchMapsUrl('');
            setNewBranchIntegrationType('WORKSPACE_DEFAULT');
            setNewBranchExternalCode('');
            setNewBranchGoogleEmail('');
            loadBranches();
        } catch (err) {
            console.error('Error creating location:', err);
            alert(err.response?.data?.error || 'Şube eklenirken hata oluştu');
        }
    };

    const handleUpdateBranch = async (id) => {
        if (!editBranchName.trim()) return;
        try {
            await appointmentConfigAPI.updateLocation(currentWorkspace.id, id, {
                name: editBranchName,
                address: editBranchAddress,
                phone: editBranchPhone,
                googleMapsUrl: editBranchMapsUrl,
                integrationType: editBranchIntegrationType,
                externalBranchCode: editBranchExternalCode || null,
                googleEmail: editBranchGoogleEmail || null,
                defaultTeamId: null,
                defaultFunnelId: null
            });
            setEditingBranch(null);
            loadBranches();
        } catch (err) {
            console.error('Error updating location:', err);
            alert(err.response?.data?.error || 'Şube güncellenirken hata oluştu');
        }
    };

    const handleDeleteBranch = async (id, name) => {
        if (!confirm(`"${name}" ${labels.branchSingle?.toLowerCase() || 'şube'} kaydını silmek istediğinize emin misiniz?`)) return;
        try {
            await appointmentConfigAPI.deleteLocation(currentWorkspace.id, id);
            loadBranches();
        } catch (err) {
            console.error('Error deleting location:', err);
            alert(err.response?.data?.error || 'Şube silinirken hata oluştu');
        }
    };

    // Category CRUD
    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            await createTopicCategory(currentWorkspace.id, {
                name: newCategoryName,
                defaultTeamId: newCategoryDefaultTeamId || null,
                defaultFunnelId: newCategoryDefaultFunnelId || null
            });
            setNewCategoryName('');
            setNewCategoryDefaultTeamId('');
            setNewCategoryDefaultFunnelId('');
            loadCategories();
        } catch (err) {
            console.error('Error creating category:', err);
            alert('Kategori eklenirken hata oluştu');
        }
    };

    const handleUpdateCategory = async (id) => {
        if (!editCategoryName.trim()) return;
        try {
            await updateTopicCategory(currentWorkspace.id, id, {
                name: editCategoryName,
                defaultTeamId: editCategoryDefaultTeamId || null,
                defaultFunnelId: editCategoryDefaultFunnelId || null
            });
            setEditingCategory(null);
            loadCategories();
        } catch (err) {
            console.error('Error updating category:', err);
            alert('Kategori güncellenirken hata oluştu');
        }
    };

    const handleDeleteCategory = async (id, name) => {
        if (!confirm(`"${name}" kategorisini silmek istediğinize emin misiniz?`)) return;
        try {
            await deleteTopicCategory(currentWorkspace.id, id);
            loadCategories();
        } catch (err) {
            console.error('Error deleting category:', err);
            alert('Kategori silinirken hata oluştu');
        }
    };

    // Resource CRUD
    const resetResourceForm = () => setResourceForm({ 
        name: '', title: '', description: '', type: 'PERSON', branchIds: [], 
        availableStart: '09:00', availableEnd: '18:00', slotMinutes: 30,
        syncProvider: 'WORKSPACE_DEFAULT', externalId: '', googleEmail: ''
    });

    const handleCreateResource = async () => {
        if (!resourceForm.name.trim()) return;
        try {
            await resourceAPI.create(currentWorkspace.id, resourceForm);
            setShowResourceForm(false);
            resetResourceForm();
            loadResources();
        } catch (err) {
            console.error('Error creating resource:', err);
            alert('Kaynak eklenirken hata oluştu');
        }
    };

    const handleUpdateResource = async (id) => {
        if (!resourceForm.name.trim()) return;
        try {
            await resourceAPI.update(currentWorkspace.id, id, resourceForm);
            setEditingResource(null);
            setShowResourceForm(false);
            resetResourceForm();
            loadResources();
        } catch (err) {
            console.error('Error updating resource:', err);
            alert('Kaynak güncellenirken hata oluştu');
        }
    };

    const handleDeleteResource = async (id, name) => {
        if (!confirm(`"${name}" kaynağını silmek istediğinize emin misiniz?`)) return;
        try {
            await resourceAPI.delete(currentWorkspace.id, id);
            loadResources();
        } catch (err) {
            console.error('Error deleting resource:', err);
            alert('Kaynak silinirken hata oluştu');
        }
    };


    const loadKnowledgeBase = async () => {
        try {
            setKbLoading(true);
            const response = await knowledgeBaseAPI.getAll(currentWorkspace.id);
            setKnowledgeEntries(response.data.entries || []);
        } catch (error) {
            console.error('Error loading knowledge base:', error);
        } finally {
            setKbLoading(false);
        }
    };

    const defaultSchedule = [
        { day: 0, label: 'Pazartesi', enabled: true, start: '09:00', end: '18:00' },
        { day: 1, label: 'Salı', enabled: true, start: '09:00', end: '18:00' },
        { day: 2, label: 'Çarşamba', enabled: true, start: '09:00', end: '18:00' },
        { day: 3, label: 'Perşembe', enabled: true, start: '09:00', end: '18:00' },
        { day: 4, label: 'Cuma', enabled: true, start: '09:00', end: '18:00' },
        { day: 5, label: 'Cumartesi', enabled: false, start: '09:00', end: '18:00' },
        { day: 6, label: 'Pazar', enabled: false, start: '09:00', end: '18:00' },
    ];

    const loadCompanyInfo = async () => {
        try {
            const response = await workspaceAPI.getCompanyInfo(currentWorkspace.id);
            const info = response.data.companyInfo;
            // businessAreas ve serviceRegions JSON string olarak gelir
            let businessAreas = [];
            try { businessAreas = JSON.parse(info.businessAreas || '[]'); } catch(e) { businessAreas = []; }
            let serviceRegions = [];
            try { serviceRegions = JSON.parse(info.serviceRegions || '[]'); } catch(e) { serviceRegions = []; }
            // weeklySchedule & holidaysConfig
            let weeklySchedule = defaultSchedule;
            let holidaysConfig = { closedOnPublicHolidays: true, customHolidays: [], note: '' };
            if (info.companyWeeklySchedule) {
                try {
                    const parsed = typeof info.companyWeeklySchedule === 'string'
                        ? JSON.parse(info.companyWeeklySchedule) : info.companyWeeklySchedule;
                    if (Array.isArray(parsed) && parsed.length === 7) {
                        weeklySchedule = parsed.map((s, i) => ({ ...defaultSchedule[i], ...s }));
                    } else if (parsed && typeof parsed === 'object') {
                        if (Array.isArray(parsed.schedule) && parsed.schedule.length === 7) {
                            weeklySchedule = parsed.schedule.map((s, i) => ({ ...defaultSchedule[i], ...s }));
                        }
                        if (parsed.holidays) {
                            holidaysConfig = { ...holidaysConfig, ...parsed.holidays };
                        }
                    }
                } catch(e) { /* fallback to default */ }
            }
            const loadedCompany = {
                name: info.companyName || '',
                description: info.companyDescription || '',
                address: info.companyAddress || '',
                phone: info.companyPhone || '',
                email: info.companyEmail || '',
                website: info.companyWebsite || '',
                workingHours: info.companyWorkingHours || '',
                logo: null,
                logoPreview: info.companyLogo || '',
                founder: info.founder || '',
                industry: info.industry || 'GENERAL',
                businessAreas,
                serviceRegions,
                googleMapsUrl: info.googleMapsUrl || '',
                scheduleEnabled: info.companyScheduleEnabled !== false,
                weeklySchedule,
                holidaysConfig
            };
            setCompanyInfo(loadedCompany);
            setCompanySnapshot(loadedCompany);
        } catch (error) {
            console.error('Error loading company info:', error);
        }
    };

    const handleSaveCompanyInfo = async () => {
        try {
            setSavingCompany(true);
            // Yapılandırılmış saatten okunabilir string oluştur
            const scheduleText = companyInfo.weeklySchedule
                .filter(s => s.enabled)
                .map(s => `${s.label}: ${s.start}-${s.end}`)
                .join(', ') || 'Belirtilmedi';
            const holidayText = companyInfo.holidaysConfig?.closedOnPublicHolidays
                ? 'Resmi tatil ve bayramlarda KAPALI'
                : 'Resmi tatil ve bayramlarda AÇIK';
            const fullWorkingHours = `${scheduleText} | ${holidayText}${companyInfo.holidaysConfig?.note ? ` (${companyInfo.holidaysConfig.note})` : ''}`;
            // Çizelge pasifken bu türetilmiş özeti GÖNDERMİYORUZ: kaydedilse de
            // kullanılmayacak, ama eski değeri ezip yanlış saatleri kalıcılaştırırdı.

            await workspaceAPI.updateCompanyInfo(currentWorkspace.id, {
                companyName: companyInfo.name,
                companyDescription: companyInfo.description,
                companyAddress: companyInfo.address,
                companyPhone: companyInfo.phone,
                companyEmail: companyInfo.email,
                companyWebsite: companyInfo.website,
                ...(companyInfo.scheduleEnabled ? { companyWorkingHours: fullWorkingHours } : {}),
                founder: companyInfo.founder,
                industry: companyInfo.industry,
                businessAreas: JSON.stringify(companyInfo.businessAreas),
                serviceRegions: JSON.stringify(companyInfo.serviceRegions),
                googleMapsUrl: companyInfo.googleMapsUrl,
                companyScheduleEnabled: companyInfo.scheduleEnabled,
                companyWeeklySchedule: {
                    schedule: companyInfo.weeklySchedule,
                    holidays: companyInfo.holidaysConfig
                }
            });
            if (typeof refreshWorkspace === 'function') {
                await refreshWorkspace();
            }
            setCompanySnapshot(companyInfo);
            alert(t('knowledgeBase.saved'));
        } catch (error) {
            console.error('Error saving company info:', error);
            alert('Şirket bilgileri kaydedilirken hata oluştu');
        } finally {
            setSavingCompany(false);
        }
    };

    const handleInstructUpdate = async () => {
        if (!instructText.trim()) return alert('Lütfen güncellenecek talimatı yazın');
        try {
            setInstructLoading(true);
            const res = await aiSetupAPI.instructUpdate(currentWorkspace.id, instructText.trim());
            alert('✅ AI Bilgi Bankası Başarıyla Güncellendi: ' + (res.data?.summary || 'İşlem tamamlandı'));
            setInstructText('');
            await loadCompanyInfo();
            await loadBranches();
            await loadProducts();
            await loadResources();
            await loadCategories();
            await loadKnowledgeBase();
            if (typeof refreshWorkspace === 'function') refreshWorkspace();
        } catch (err) {
            console.error('Instruct update error:', err);
            alert('Güncelleme hatası: ' + (err.response?.data?.message || err.message));
        } finally {
            setInstructLoading(false);
        }
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
                alert('Belge analiz edilemedi');
            }
        } catch (err) {
            console.error('File parse error:', err);
            alert('Belge ayrıştırma hatası: ' + (err.response?.data?.message || err.message));
        } finally {
            setAiSetupLoading(false);
        }
    };

    const handleAiSetupUrlParse = async () => {
        if (!aiSetupUrl.trim()) return alert('Lütfen bir web sitesi adresi girin');
        try {
            setAiSetupLoading(true);
            const res = await aiSetupAPI.parseUrl(currentWorkspace.id, aiSetupUrl.trim());
            if (res.data?.success) {
                setAiSetupResult(res.data.data);
            } else {
                alert('Web sitesi analiz edilemedi');
            }
        } catch (err) {
            console.error('URL parse error:', err);
            alert('Web sitesi analizi hatası: ' + (err.response?.data?.message || err.message));
        } finally {
            setAiSetupLoading(false);
        }
    };

    const handleApplyAiSetup = async () => {
        if (!aiSetupResult) return;
        try {
            setAiSetupApplying(true);
            await aiSetupAPI.applySetup(currentWorkspace.id, aiSetupResult);
            alert('🎉 AI Kurulumu ve veriler çalışma alanınıza başarıyla uygulandı!');
            setShowAiSetupModal(false);
            setAiSetupResult(null);
            setAiSetupUrl('');
            await loadCompanyInfo();
            await loadBranches();
            await loadProducts();
            await loadResources();
            await loadCategories();
            await loadKnowledgeBase();
            if (typeof refreshWorkspace === 'function') refreshWorkspace();
        } catch (err) {
            console.error('Apply setup error:', err);
            alert('Uygulama hatası: ' + (err.response?.data?.message || err.message));
        } finally {
            setAiSetupApplying(false);
        }
    };

    const handleLogoChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setCompanyInfo(prev => ({ ...prev, logoPreview: reader.result }));
        };
        reader.readAsDataURL(file);

        try {
            const formData = new FormData();
            formData.append('logo', file);
            const response = await workspaceAPI.uploadCompanyLogo(currentWorkspace.id, formData);
            const info = response.data.companyInfo;
            setCompanyInfo(prev => ({ ...prev, logoPreview: info.companyLogo }));
            if (typeof refreshWorkspace === 'function') {
                await refreshWorkspace();
            }
            alert('Logo uploaded');
        } catch (error) {
            console.error('Error uploading logo:', error);
            alert('Logo yüklenirken hata oluştu');
        }
    };

    const handleDeleteLogo = async () => {
        if (!confirm('Are you sure you want to delete the logo?')) return;

        try {
            await workspaceAPI.deleteCompanyLogo(currentWorkspace.id);
            setCompanyInfo(prev => ({ ...prev, logoPreview: '' }));
            if (typeof refreshWorkspace === 'function') {
                await refreshWorkspace();
            }
            alert('Logo silindi');
        } catch (error) {
            console.error('Error deleting logo:', error);
            alert('Logo silinirken hata oluştu');
        }
    };

    const handleAddTextEntry = async () => {
        if (!newKbContent.trim()) {
            alert(t('knowledgeBase.contentRequired') || 'İçerik alanı gereklidir');
            return;
        }

        try {
            const finalTitle = newKbTitle.trim() || newKbContent.trim().substring(0, 50) + (newKbContent.length > 50 ? '...' : '');
            await knowledgeBaseAPI.addText(currentWorkspace.id, {
                title: finalTitle,
                content: newKbContent
            });
            setNewKbTitle('');
            setNewKbContent('');
            loadKnowledgeBase();
            alert('Bilgi başarıyla eklendi');
        } catch (error) {
            console.error('Error adding text entry:', error);
            alert('Bilgi eklenirken hata oluştu');
        }
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        // Pre-check: file size
        const oversized = files.filter(f => f.size > 5 * 1024 * 1024);
        if (oversized.length > 0) {
            setUploadResult({ success: false, message: `${oversized.map(f => f.name).join(', ')} dosyaları 5MB limitini aşıyor.` });
            return;
        }

        setUploading(true);
        let successCount = 0;
        let errorCount = 0;

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                await knowledgeBaseAPI.uploadFile(currentWorkspace.id, formData);
                successCount++;
            } catch (error) {
                console.error(`Error uploading file ${file.name}:`, error);
                errorCount++;
            }
        }

        setUploading(false);
        e.target.value = '';
        loadKnowledgeBase();

        if (errorCount === 0) {
            setUploadResult({ success: true, count: successCount });
        } else {
            setUploadResult({ success: false, message: `${successCount} dosya yüklendi, ${errorCount} dosya yüklenemedi` });
        }
    };

    const handleEditEntry = (entry) => {
        setEditingEntry(entry);
        setEditTitle(entry.title);
        setEditContent(entry.content);
    };

    const handleSaveEdit = async () => {
        if (!editTitle.trim() || !editContent.trim()) {
            alert('Başlık ve içerik gereklidir');
            return;
        }

        try {
            setSaving(true);
            await knowledgeBaseAPI.update(currentWorkspace.id, editingEntry.id, {
                title: editTitle,
                content: editContent
            });
            setEditingEntry(null);
            setEditTitle('');
            setEditContent('');
            loadKnowledgeBase();
            alert('Bilgi güncellendi');
        } catch (error) {
            console.error('Error updating entry:', error);
            alert('Bilgi güncellenirken hata oluştu');
        } finally {
            setSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setEditingEntry(null);
        setEditTitle('');
        setEditContent('');
    };

    const handleAddUrlEntry = async () => {
        if (!newUrl.trim()) {
            alert('URL alanı gereklidir');
            return;
        }

        try {
            setScraping(true);
            await knowledgeBaseAPI.addUrl(currentWorkspace.id, {
                url: newUrl,
                syncInterval: urlSyncInterval || null
            });
            setNewUrl('');
            setUrlSyncInterval('');
            loadKnowledgeBase();
            alert('Web sayfası başarıyla tarandı ve bilgi eklendi');
            setActiveTab('list');
        } catch (error) {
            console.error('Error scanning URL:', error);
            alert(error.response?.data?.error || 'Sayfa taranırken hata oluştu');
        } finally {
            setScraping(false);
        }
    };

    const handleSyncEntry = async (entryId) => {
        try {
            setSyncingEntry(entryId);
            await knowledgeBaseAPI.sync(currentWorkspace.id, entryId);
            loadKnowledgeBase();
            alert('İçerik başarıyla senkronize edildi');
        } catch (error) {
            console.error('Error syncing entry:', error);
            alert('Senkronizasyon sırasında hata oluştu');
        } finally {
            setSyncingEntry(null);
        }
    };

    const handleDeleteEntry = async (entryId) => {
        if (!confirm('Bu bilgiyi silmek istediğinize emin misiniz?')) return;

        try {
            await knowledgeBaseAPI.delete(currentWorkspace.id, entryId);
            loadKnowledgeBase();
        } catch (error) {
            console.error('Error deleting entry:', error);
            alert('Bilgi silinirken hata oluştu');
        }
    };

    const handleRetellSync = async () => {
        try {
            setSyncingRetell(true);
            const response = await retellAPI.syncKnowledgeBase(currentWorkspace.id);
            alert(response.data.message || 'Bilgi bankası AI Ses Agent\'a başarıyla senkronize edildi');
        } catch (error) {
            console.error('Retell sync error:', error);
            const msg = error.response?.data?.error || 'Senkronizasyon başarısız';
            alert(msg);
        } finally {
            setSyncingRetell(false);
        }
    };


    // Kaydedilmemiş alan sayısı. Logo ayrı uçtan anında kaydedildiği,
    // workingHours ise çizelgeden türetildiği için ikisi de sayılmaz.
    const COMPANY_DIRTY_FIELDS = [
        'name', 'description', 'address', 'phone', 'email', 'website',
        'founder', 'industry', 'businessAreas', 'serviceRegions',
        'googleMapsUrl', 'scheduleEnabled', 'weeklySchedule', 'holidaysConfig'
    ];
    const companyDirtyCount = companySnapshot
        ? COMPANY_DIRTY_FIELDS.filter(k =>
            JSON.stringify(companyInfo[k]) !== JSON.stringify(companySnapshot[k])
        ).length
        : 0;

    if (!currentWorkspace) {
        return (
            <div className="empty-state">
                <p>{t('common.selectWorkspace')}</p>
            </div>
        );
    }

    return (
        <div className={`knowledge-base-page base-layout ${hideSidebar ? 'no-sidebar' : ''}`}>
            {/* Sol Sidebar */}
            {!hideSidebar && (
                <div className="base-sidebar">
                    <div className="base-sidebar-header">
                        <div className="base-sidebar-header-icon">
                            <Building2 size={16} />
                        </div>
                        <span>Base</span>
                    </div>
                    <nav className="base-nav">
                        {canManage && (
                            <button
                                type="button"
                                className="base-nav-item"
                                onClick={() => navigate('/setup-wizard')}
                                style={{
                                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(79, 70, 229, 0.16) 100%)',
                                    color: '#4f46e5',
                                    borderColor: 'rgba(99, 102, 241, 0.3)',
                                    fontWeight: 600,
                                    marginBottom: '6px',
                                    boxShadow: '0 1px 4px rgba(99, 102, 241, 0.08)'
                                }}
                            >
                                <Wand2 size={16} color="#4f46e5" /> Hızlı Kurulum Sihirbazı
                            </button>
                        )}
                        {canManage && (
                            <button
                                type="button"
                                className="base-nav-item"
                                onClick={() => window.dispatchEvent(new CustomEvent('open-insta', { detail: { tab: 'wizard' } }))}
                                style={{
                                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(220, 38, 38, 0.16) 100%)',
                                    color: '#dc2626',
                                    borderColor: 'rgba(239, 68, 68, 0.3)',
                                    fontWeight: 600,
                                    marginBottom: '6px',
                                    boxShadow: '0 1px 4px rgba(239, 68, 68, 0.08)'
                                }}
                            >
                                <Sparkles size={16} color="#ef4444" /> AI ile Yapılandır
                            </button>
                        )}
                        <button className={`base-nav-item ${activeTab === 'company' ? 'active' : ''}`} onClick={() => handleSelectTab('company')}>
                            <Building2 size={16} /> Şirket Bilgileri
                        </button>
                        <button className={`base-nav-item ${activeTab === 'branches' ? 'active' : ''}`} onClick={() => handleSelectTab('branches')}>
                            <MapPin size={16} /> {labels.branchesTab || 'Şubeler'}
                        </button>
                        <button className={`base-nav-item ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => handleSelectTab('categories')}>
                            <Layers size={16} /> {labels.categoriesTab || 'Kategoriler'}
                        </button>
                        <button className={`base-nav-item ${activeTab === 'productGroups' ? 'active' : ''}`} onClick={() => handleSelectTab('productGroups')}>
                            <FolderTree size={16} /> {labels.productGroupsTab || 'Ürün Grupları'}
                        </button>
                        <button className={`base-nav-item ${activeTab === 'products' ? 'active' : ''}`} onClick={() => handleSelectTab('products')}>
                            <Package size={16} /> {labels.productsTab || 'Ürünler'}
                        </button>
                        <button className={`base-nav-item ${activeTab === 'resources' ? 'active' : ''}`} onClick={() => handleSelectTab('resources')}>
                            <UserCircle size={16} /> Kaynaklar
                        </button>
                        <button className={`base-nav-item ${activeTab === 'text' ? 'active' : ''}`} onClick={() => handleSelectTab('text')}>
                            <FileText size={16} /> Metin Ekle / SSS
                        </button>
                        <button className={`base-nav-item ${activeTab === 'files' ? 'active' : ''}`} onClick={() => handleSelectTab('files')}>
                            <Upload size={16} /> Dosya Ekle
                        </button>
                        <button className={`base-nav-item ${activeTab === 'url' ? 'active' : ''}`} onClick={() => handleSelectTab('url')}>
                            <Globe size={16} /> Web Sitesi Tara
                        </button>
                        <button className={`base-nav-item ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => handleSelectTab('feed')}>
                            <Link size={16} /> Dinamik Feed
                        </button>
                        <div style={{ borderTop: '1px solid var(--border-color, #e5e7eb)', margin: '8px 0' }} />
                        <button className={`base-nav-item ${activeTab === 'list' ? 'active' : ''}`} onClick={() => handleSelectTab('list')}>
                            <Database size={16} /> Tüm Bilgiler <span className="base-nav-badge">{knowledgeEntries.length}</span>
                        </button>
                        <div style={{ padding: '8px 12px', marginTop: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setShowAiSetupModal(true)}
                                className="btn btn-primary"
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    fontSize: '12px',
                                    padding: '8px 12px',
                                    background: 'linear-gradient(135deg, #E63B2E 0%, #f97316 100%)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(230, 59, 46, 0.25)'
                                }}
                            >
                                <Sparkles size={14} /> AI ile Yapılandır
                            </button>
                        </div>
                    </nav>
                </div>
            )}

            {/* Sağ İçerik */}
            <div className="base-content">

            {/* Company Tab */}
            {activeTab === 'company' && (
                <div className="cb-page">

                    {/* ── Başlık ── */}
                    <div className="cb-head">
                        <div>
                            <div className="cb-eyebrow">Ayarlar · Firma &amp; Bilgi Bankası</div>
                            <h1 className="cb-title">Şirket Bilgileri</h1>
                            <div className="cb-sub">Yapay zekânın müşterilere aktardığı temel firma bilgileri burada tutulur.</div>
                        </div>
                    </div>

                    {/* ── 1. KİMLİK ── */}
                    <div className="cb-sec" id="cb-kimlik">
                        <div className="cb-sec-head">
                            <div className="cb-sec-t">
                                <div className="cb-sec-ico"><Building2 size={16} /></div>
                                <div>
                                    <div className="cb-sec-name">Kimlik</div>
                                    <div className="cb-sec-desc">Firmanın adı, logosu ve faaliyet gösterdiği sektör</div>
                                </div>
                            </div>
                        </div>
                        <div className="cb-sec-body">
                            <div className="cb-logo">
                                <div className="cb-logo-box">
                                    {companyInfo.logoPreview ? (
                                        <img
                                            src={companyInfo.logoPreview.startsWith('data:')
                                                ? companyInfo.logoPreview
                                                : companyInfo.logoPreview.startsWith('http')
                                                    ? companyInfo.logoPreview
                                                    : `${import.meta.env.VITE_API_URL || ''}/uploads${companyInfo.logoPreview.replace('/uploads', '')}`
                                            }
                                            alt="Şirket Logosu"
                                            onError={(e) => {
                                                console.error('Logo yüklenemedi:', e.target.src);
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div>
                                            <Image size={24} />
                                            <div style={{ marginTop: '4px' }}>Logo</div>
                                        </div>
                                    )}
                                </div>
                                <div className="cb-logo-meta">
                                    <div className="cb-logo-n">Şirket logosu</div>
                                    <div className="cb-logo-d">JPG, PNG, WEBP veya GIF. Teklif ve fatura çıktılarında, widget başlığında görünür.</div>
                                    <div className="cb-logo-actions">
                                        <label className="cb-btn">
                                            <Upload size={14} />
                                            Logo yükle
                                            <input
                                                type="file"
                                                accept=".jpg,.jpeg,.png,.webp,.gif"
                                                onChange={handleLogoChange}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                        {companyInfo.logoPreview && (
                                            <button className="cb-btn danger" onClick={handleDeleteLogo}>
                                                <Trash2 size={14} />
                                                Kaldır
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="cb-grid">
                                <div className="cb-f">
                                    <label>{t('knowledgeBase.companyName')}</label>
                                    <input
                                        type="text"
                                        className="cb-in"
                                        placeholder="Örn: ABC Teknoloji Ltd."
                                        value={companyInfo.name}
                                        onChange={(e) => setCompanyInfo(prev => ({ ...prev, name: e.target.value }))}
                                    />
                                </div>
                                <div className="cb-f">
                                    <label>Sektör</label>
                                    <select
                                        className="cb-in"
                                        value={companyInfo.industry}
                                        onChange={(e) => setCompanyInfo(prev => ({ ...prev, industry: e.target.value }))}
                                    >
                                        <option value="GENERAL">Genel</option>
                                        <option value="HEALTHCARE">Sağlık</option>
                                        <option value="REAL_ESTATE">Emlak</option>
                                        <option value="AUTOMOTIVE">Otomotiv</option>
                                        <option value="TOURISM">Turizm / Otelcilik</option>
                                        <option value="RETAIL">Perakende</option>
                                        <option value="SERVICE">Hizmet</option>
                                        <option value="EDUCATION">Eğitim</option>
                                        <option value="TECHNOLOGY">Teknoloji</option>
                                        <option value="FOOD">Gıda / Restoran</option>
                                        <option value="SPA">Güzellik / SPA</option>
                                        <option value="LEGAL">Hukuk</option>
                                        <option value="FINANCE">Finans</option>
                                    </select>
                                </div>
                                <div className="cb-f">
                                    <label>Kurucu / firma sahibi</label>
                                    <input
                                        type="text"
                                        className="cb-in"
                                        placeholder="Örn: Ahmet Yılmaz"
                                        value={companyInfo.founder}
                                        onChange={(e) => setCompanyInfo(prev => ({ ...prev, founder: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── 2. İLETİŞİM ── */}
                    <div className="cb-sec" id="cb-iletisim">
                        <div className="cb-sec-head">
                            <div className="cb-sec-t">
                                <div className="cb-sec-ico"><Phone size={16} /></div>
                                <div>
                                    <div className="cb-sec-name">İletişim</div>
                                    <div className="cb-sec-desc">Müşteriye verilebilecek iletişim bilgileri ve konum</div>
                                </div>
                            </div>
                        </div>
                        <div className="cb-sec-body">
                            <div className="cb-grid" style={{ marginBottom: '16px' }}>
                                <div className="cb-f">
                                    <label>Telefon</label>
                                    <input
                                        type="tel"
                                        className="cb-in"
                                        placeholder="+90 212 123 45 67"
                                        value={companyInfo.phone}
                                        onChange={(e) => setCompanyInfo(prev => ({ ...prev, phone: e.target.value }))}
                                    />
                                </div>
                                <div className="cb-f">
                                    <label>E-posta</label>
                                    <input
                                        type="email"
                                        className="cb-in"
                                        placeholder="info@ornek.com"
                                        value={companyInfo.email}
                                        onChange={(e) => setCompanyInfo(prev => ({ ...prev, email: e.target.value }))}
                                    />
                                </div>
                                <div className="cb-f">
                                    <label>Website</label>
                                    <input
                                        type="url"
                                        className="cb-in"
                                        placeholder="https://www.ornek.com"
                                        value={companyInfo.website}
                                        onChange={(e) => setCompanyInfo(prev => ({ ...prev, website: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="cb-grid one" style={{ gap: '16px' }}>
                                <div className="cb-f">
                                    <label>Adres</label>
                                    <input
                                        type="text"
                                        className="cb-in"
                                        placeholder="Örn: Kadıköy, İstanbul, Türkiye"
                                        value={companyInfo.address}
                                        onChange={(e) => setCompanyInfo(prev => ({ ...prev, address: e.target.value }))}
                                    />
                                </div>
                                <div className="cb-f">
                                    <label>📍 Google Maps linki <span className="cb-hint">— yol tarifi istendiğinde paylaşılır</span></label>
                                    <input
                                        type="url"
                                        className="cb-in"
                                        placeholder="https://maps.google.com/..."
                                        value={companyInfo.googleMapsUrl}
                                        onChange={(e) => setCompanyInfo(prev => ({ ...prev, googleMapsUrl: e.target.value }))}
                                    />
                                    {companyInfo.googleMapsUrl && (
                                        <a className="cb-link" href={companyInfo.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                                            🔗 Haritada görüntüle
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── 3. FAALİYET & BÖLGELER ── */}
                    <div className="cb-sec" id="cb-faaliyet">
                        <div className="cb-sec-head">
                            <div className="cb-sec-t">
                                <div className="cb-sec-ico"><MapPin size={16} /></div>
                                <div>
                                    <div className="cb-sec-name">Faaliyet ve bölgeler</div>
                                    <div className="cb-sec-desc">Hangi işi yapıyorsunuz, nerelere hizmet veriyorsunuz</div>
                                </div>
                            </div>
                        </div>
                        <div className="cb-sec-body">
                            {/* Faaliyet Alanları - Tag Input */}
                            <div className="cb-f" style={{ marginBottom: '22px' }}>
                                <label>Faaliyet alanları</label>
                                {companyInfo.businessAreas.length > 0 && (
                                    <div className="cb-tags">
                                        {companyInfo.businessAreas.map((area, idx) => (
                                            <span key={idx} className="cb-tag">
                                                {area}
                                                <button className="cb-x" onClick={() => setCompanyInfo(prev => ({
                                                    ...prev, businessAreas: prev.businessAreas.filter((_, i) => i !== idx)
                                                }))}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="cb-addrow">
                                    <input
                                        type="text"
                                        className="cb-in"
                                        placeholder="Yeni alan yazıp Enter'a basın (Örn: Diş Hekimliği)"
                                        value={newBusinessArea}
                                        onChange={(e) => setNewBusinessArea(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newBusinessArea.trim()) {
                                                e.preventDefault();
                                                if (!companyInfo.businessAreas.includes(newBusinessArea.trim())) {
                                                    setCompanyInfo(prev => ({ ...prev, businessAreas: [...prev.businessAreas, newBusinessArea.trim()] }));
                                                }
                                                setNewBusinessArea('');
                                            }
                                        }}
                                    />
                                    <button
                                        className="cb-btn"
                                        onClick={() => {
                                            if (newBusinessArea.trim() && !companyInfo.businessAreas.includes(newBusinessArea.trim())) {
                                                setCompanyInfo(prev => ({ ...prev, businessAreas: [...prev.businessAreas, newBusinessArea.trim()] }));
                                                setNewBusinessArea('');
                                            }
                                        }}
                                        style={{ whiteSpace: 'nowrap' }}
                                    >Ekle</button>
                                </div>
                            </div>

                            {/* Hizmet ve Satış Bölgeleri - İl/İlçe Autocomplete */}
                            <div className="cb-f" style={{ position: 'relative' }}>
                                <label>Hizmet ve satış bölgeleri</label>
                                {companyInfo.serviceRegions.length > 0 && (
                                    <div className="cb-tags">
                                        {companyInfo.serviceRegions.map((region, idx) => (
                                            <span key={idx} className="cb-tag region">
                                                📍 {region}
                                                <button className="cb-x" onClick={() => setCompanyInfo(prev => ({
                                                    ...prev, serviceRegions: prev.serviceRegions.filter((_, i) => i !== idx)
                                                }))}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        className="cb-in"
                                        placeholder="İl veya ilçe yazın (Örn: Kadıköy)"
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
                                                    // İlçe araması için de dene
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
                                                } catch(err) {
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
                                                if (!companyInfo.serviceRegions.includes(regionSearchText.trim())) {
                                                    setCompanyInfo(prev => ({ ...prev, serviceRegions: [...prev.serviceRegions, regionSearchText.trim()] }));
                                                }
                                                setRegionSearchText('');
                                                setShowRegionDropdown(false);
                                            }
                                        }}
                                        onBlur={() => setTimeout(() => setShowRegionDropdown(false), 200)}
                                    />
                                    {showRegionDropdown && regionSuggestions.length > 0 && (
                                        <div className="cb-suggest">
                                            {regionSuggestions.map((s, i) => (
                                                <div key={i}
                                                    onMouseDown={() => {
                                                        if (!companyInfo.serviceRegions.includes(s)) {
                                                            setCompanyInfo(prev => ({ ...prev, serviceRegions: [...prev.serviceRegions, s] }));
                                                        }
                                                        setRegionSearchText('');
                                                        setShowRegionDropdown(false);
                                                    }}
                                                >📍 {s}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <span className="cb-hint">İl veya ilçe yazarak arayın, listeden seçin veya Enter'a basın.</span>
                            </div>
                        </div>
                    </div>

                    {/* ── 4. ÇALIŞMA SAATLERİ ── */}
                    <div className="cb-sec" id="cb-saatler">
                        <div className="cb-sec-head">
                            <div className="cb-sec-t">
                                <div className="cb-sec-ico">🕐</div>
                                <div>
                                    <div className="cb-sec-name">Çalışma saatleri</div>
                                    <div className="cb-sec-desc">Mesai dışı yanıtları ve “çalışma saatleriniz?” sorusu bu çizelgeden okunur</div>
                                </div>
                            </div>
                            {/* Anahtar başlıkta: eskiden çizelgenin içinde kayboluyordu. */}
                            <label className={`cb-toggle ${companyInfo.scheduleEnabled ? 'on' : ''}`}>
                                <input
                                    type="checkbox"
                                    role="switch"
                                    checked={companyInfo.scheduleEnabled}
                                    onChange={(e) => setCompanyInfo(prev => ({ ...prev, scheduleEnabled: e.target.checked }))}
                                />
                                <span className="cb-tg" />
                                <span className="cb-tg-label">
                                    {companyInfo.scheduleEnabled ? 'Bu çizelge kullanılıyor' : 'Bilgi bankasından okunuyor'}
                                </span>
                            </label>
                        </div>
                        <div className="cb-sec-body">
                            {!companyInfo.scheduleEnabled && (
                                <div className="cb-note warn">
                                    Aşağıdaki çizelge <strong>yok sayılıyor</strong>. Yapay zekâ çalışma
                                    saatlerini yalnızca bilgi bankası belgelerinizden okur — bölümlere göre
                                    farklı saat işleyen yerler (ör. kadınlar / erkekler) için bunu kullanın.
                                    Saate bağlı otomasyonlar (mesai dışı cevabı, “çalışma saatleriniz?”
                                    otomatik yanıtı) bu durumda çalışmaz.
                                </div>
                            )}

                            <div className={companyInfo.scheduleEnabled ? '' : 'cb-dim'}>
                                <div className="cb-presets">
                                    <button className="cb-btn sm"
                                        onClick={() => setCompanyInfo(prev => ({
                                            ...prev, weeklySchedule: prev.weeklySchedule.map(s => ({
                                                ...s, enabled: s.day <= 4, start: '09:00', end: '18:00'
                                            }))
                                        }))}>Hafta içi (Pzt–Cum)</button>
                                    <button className="cb-btn sm"
                                        onClick={() => setCompanyInfo(prev => ({
                                            ...prev, weeklySchedule: prev.weeklySchedule.map(s => ({
                                                ...s, enabled: s.day <= 5, start: '09:00', end: '18:00'
                                            }))
                                        }))}>+ Cumartesi</button>
                                    <button className="cb-btn sm"
                                        onClick={() => setCompanyInfo(prev => ({
                                            ...prev, weeklySchedule: prev.weeklySchedule.map(s => ({
                                                ...s, enabled: true, start: '09:00', end: '18:00'
                                            }))
                                        }))}>7 gün</button>
                                </div>

                                <div className="cb-days">
                                    {companyInfo.weeklySchedule.map((slot, idx) => (
                                        <div key={idx} className={`cb-day ${slot.enabled ? '' : 'off'}`}>
                                            <label className="cb-day-nm">
                                                <input
                                                    type="checkbox"
                                                    className="cb-chk"
                                                    checked={slot.enabled}
                                                    onChange={(e) => {
                                                        const updated = [...companyInfo.weeklySchedule];
                                                        updated[idx] = { ...updated[idx], enabled: e.target.checked };
                                                        setCompanyInfo(prev => ({ ...prev, weeklySchedule: updated }));
                                                    }}
                                                />
                                                <span>{slot.label}</span>
                                            </label>
                                            {slot.enabled ? (
                                                <>
                                                    <input
                                                        type="time"
                                                        className="cb-time"
                                                        value={slot.start}
                                                        onChange={(e) => {
                                                            const updated = [...companyInfo.weeklySchedule];
                                                            updated[idx] = { ...updated[idx], start: e.target.value };
                                                            setCompanyInfo(prev => ({ ...prev, weeklySchedule: updated }));
                                                        }}
                                                    />
                                                    <span className="cb-dash">—</span>
                                                    <input
                                                        type="time"
                                                        className="cb-time"
                                                        value={slot.end}
                                                        onChange={(e) => {
                                                            const updated = [...companyInfo.weeklySchedule];
                                                            updated[idx] = { ...updated[idx], end: e.target.value };
                                                            setCompanyInfo(prev => ({ ...prev, weeklySchedule: updated }));
                                                        }}
                                                    />
                                                </>
                                            ) : (
                                                <span className="cb-closed">Kapalı</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── 5. RESMİ TATİLLER ── */}
                    <div className="cb-sec" id="cb-tatiller">
                        <div className="cb-sec-head">
                            <div className="cb-sec-t">
                                <div className="cb-sec-ico">🎉</div>
                                <div>
                                    <div className="cb-sec-name">Resmi tatil ve bayram politikası</div>
                                    <div className="cb-sec-desc">AI Agent bayram ve tatillerde müşterilere bu kurala göre yanıt verir</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span className={`cb-state ${companyInfo.holidaysConfig?.closedOnPublicHolidays ? 'closed' : 'open'}`}>
                                    {companyInfo.holidaysConfig?.closedOnPublicHolidays ? 'Resmi tatillerde kapalıyız' : 'Resmi tatillerde açığız'}
                                </span>
                                <label className={`cb-toggle ${!companyInfo.holidaysConfig?.closedOnPublicHolidays ? 'on' : ''}`}>
                                    <input
                                        type="checkbox"
                                        role="switch"
                                        checked={!companyInfo.holidaysConfig?.closedOnPublicHolidays}
                                        onChange={(e) => setCompanyInfo(prev => ({
                                            ...prev,
                                            holidaysConfig: {
                                                ...prev.holidaysConfig,
                                                closedOnPublicHolidays: !e.target.checked
                                            }
                                        }))}
                                    />
                                    <span className="cb-tg" />
                                </label>
                            </div>
                        </div>
                        <div className="cb-sec-body">
                            <div className="cb-sublabel">Kapsanan resmi tatiller &amp; dini bayramlar</div>
                            <div className={`cb-hol ${companyInfo.holidaysConfig?.closedOnPublicHolidays ? 'closed' : ''}`}>
                                {[
                                    '1 Ocak (Yılbaşı)',
                                    '23 Nisan (Ulusal Egemenlik ve Çocuk Bayramı)',
                                    '1 Mayıs (Emek ve Dayanışma Günü)',
                                    '19 Mayıs (Atatürk\'ü Anma, Gençlik ve Spor Bayramı)',
                                    '15 Temmuz (Demokrasi ve Milli Birlik Günü)',
                                    '30 Ağustos (Zafer Bayramı)',
                                    '29 Ekim (Cumhuriyet Bayramı)',
                                    'Ramazan Bayramı (Arife + 3 Gün)',
                                    'Kurban Bayramı (Arife + 4 Gün)'
                                ].map((hol, hIdx) => (
                                    <span key={hIdx}>{hol}</span>
                                ))}
                            </div>

                            <div className="cb-f" style={{ marginTop: '20px' }}>
                                <label>Özel tatil / bayram notu <span className="cb-hint">— AI Agent için</span></label>
                                <input
                                    type="text"
                                    className="cb-in"
                                    placeholder="Örn: Bayramın 1. günü kapalıyız, diğer günler nöbetçi servisimiz açıktır."
                                    value={companyInfo.holidaysConfig?.note || ''}
                                    onChange={(e) => setCompanyInfo(prev => ({
                                        ...prev,
                                        holidaysConfig: { ...prev.holidaysConfig, note: e.target.value }
                                    }))}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── 6. AÇIKLAMA ── */}
                    <div className="cb-sec" id="cb-aciklama">
                        <div className="cb-sec-head">
                            <div className="cb-sec-t">
                                <div className="cb-sec-ico"><FileText size={16} /></div>
                                <div>
                                    <div className="cb-sec-name">Şirket açıklaması</div>
                                    <div className="cb-sec-desc">AI bu metni müşterilerle paylaşabilir</div>
                                </div>
                            </div>
                        </div>
                        <div className="cb-sec-body">
                            <textarea
                                className="cb-in"
                                rows="4"
                                placeholder="Şirketiniz hakkında kısa bir açıklama. AI bu bilgiyi müşterilerle paylaşabilir."
                                value={companyInfo.description}
                                onChange={(e) => setCompanyInfo(prev => ({ ...prev, description: e.target.value }))}
                            />
                        </div>
                    </div>

                    {/* ── Kaydet çubuğu ── */}
                    <div className="cb-bar">
                        <span className="cb-bar-hint">
                            {companyDirtyCount > 0
                                ? <><b>{companyDirtyCount} alan</b> değiştirildi — kaydedilmedi</>
                                : 'Tüm değişiklikler kaydedildi'}
                        </span>
                        <div className="cb-bar-actions">
                            {companyDirtyCount > 0 && (
                                <button
                                    className="cb-btn"
                                    onClick={() => {
                                        // Logo ayrı bir uçtan anında kaydedildiği için geri alma
                                        // dışında tutulur; aksi hâlde yüklenen logo ekrandan silinirdi.
                                        setCompanyInfo(prev => ({ ...companySnapshot, logo: prev.logo, logoPreview: prev.logoPreview }));
                                    }}
                                >Değişiklikleri geri al</button>
                            )}
                            <button
                                className="cb-btn primary"
                                onClick={handleSaveCompanyInfo}
                                disabled={savingCompany}
                            >
                                {savingCompany ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Branches Tab */}
            {activeTab === 'branches' && (
                <div className="br-page">
                    <div className="br-head">
                        <div className="br-eyebrow">Ayarlar · Firma &amp; Bilgi Bankası</div>
                        <h1>{labels.branchesTab || 'Şubeler'}</h1>
                        <p>{labels.branchesDesc || 'Şubelerinizi ve lokasyonlarınızı yönetin.'}</p>
                    </div>

                    {catalogFlow && (
                        <div className="br-surface br-flow">
                            <div className="br-flow-head">
                                <div>
                                    <h2>Bot sıralı akışı</h2>
                                    <p>Bot müşteriyi sırayla daraltır: şube → kategori → ürün grubu → ürün.</p>
                                </div>
                                <span className={`br-flow-state ${catalogFlow.enabled ? 'on' : 'off'}`}>
                                    {catalogFlow.enabled ? 'Çalışıyor' : 'Devre dışı'}
                                </span>
                            </div>

                            <div className="br-flow-rows">
                                <label className="br-flow-row">
                                    <input
                                        type="checkbox"
                                        disabled={catalogSaving}
                                        checked={catalogFlow.flag === null ? catalogFlow.auto : catalogFlow.flag}
                                        onChange={e => saveCatalogFlow({ catalogFlowEnabled: e.target.checked })}
                                    />
                                    <span>
                                        <strong>Sıralı akış açık</strong>
                                        <em>
                                            {catalogFlow.flag === null
                                                ? (catalogFlow.hasHealthApi
                                                    ? 'Otomatik: randevu entegrasyonu olduğu için kapalı, randevu asistanının kendi akışı kullanılıyor.'
                                                    : `Otomatik: ${catalogFlow.branchCount} şube, ${catalogFlow.productCount} ürün tanımlı olduğu için ${catalogFlow.auto ? 'açık' : 'kapalı'}. Otomatik açılması için en az 2 şube ve 1 ürün gerekir.`)
                                                : 'Elle ayarlandı. Kapatılırsa bot serbest akışta çalışır.'}
                                        </em>
                                    </span>
                                </label>

                                <label className="br-flow-row">
                                    <input
                                        type="checkbox"
                                        disabled={catalogSaving || !catalogFlow.enabled}
                                        checked={catalogFlow.priceDisclosure}
                                        onChange={e => saveCatalogFlow({ catalogPriceDisclosure: e.target.checked })}
                                    />
                                    <span>
                                        <strong>Bot fiyat söyleyebilsin</strong>
                                        <em>Kapalıyken bot rakam vermez, fiyat sorusunu yetkiliye aktarır. Açıkken şubeye tanımlı fiyatı yazar.</em>
                                    </span>
                                </label>
                            </div>

                            {catalogFlow.enabled && catalogFlow.categoryCount === 0 && (
                                <div className="br-flow-warn">
                                    Kategori tanımlı değil; bot şubeyi sorup doğrudan ürünleri sunar.
                                </div>
                            )}
                        </div>
                    )}

                    <div className="br-cols">
                        <div className="br-surface">
                            <div className="br-list-head">
                                <h2>
                                    {labels.branchesTab || 'Şubeler'}
                                    {!branchesLoading && branches.length > 0 && (
                                        <span className="br-count">{branches.length} kayıt</span>
                                    )}
                                </h2>
                            </div>

                            {branchesLoading ? (
                                <div className="br-empty"><p>Yükleniyor…</p></div>
                            ) : branches.length === 0 ? (
                                <div className="br-empty">
                                    <div className="br-empty-ico"><MapPin size={24} /></div>
                                    <h3>Henüz {labels.branchSingle?.toLowerCase() || 'şube'} eklenmemiş</h3>
                                    <p>Yandaki formdan ilk {labels.branchSingle?.toLowerCase() || 'şube'} kaydını oluşturabilirsiniz.</p>
                                </div>
                            ) : (
                                branches.map(branch => {
                                    const isOpen = selectedBranch?.id === branch.id;
                                    const branchProducts = products.filter(p => p.allBranches || (p.productBranches && p.productBranches.some(pb => pb.branchId === branch.id)));
                                    const branchResources = resources.filter(r => r.branchId === branch.id || r.resourceBranch === branch.id || (r.branchIds && r.branchIds.includes(branch.id)));
                                    const branchAgents = agentsOfBranch(branch.id);
                                    const branchTeams = teamsOfBranch(branch.id);
                                    const sharedAgents = allBranchAgents();
                                    return (
                                        <div key={branch.id}>
                                            <div className={`br-row ${isOpen ? 'open' : ''}`}>
                                                <div className="br-av">{branchInitials(branch.name)}</div>
                                                <div>
                                                    <button
                                                        type="button"
                                                        className="br-name"
                                                        aria-expanded={isOpen}
                                                        onClick={() => setSelectedBranch(isOpen ? null : branch)}
                                                    >
                                                        {branch.name}
                                                    </button>
                                                    {branch.address && <div className="br-sub">{branch.address}</div>}
                                                    <div className="br-agents" title={[
                                                        branchTeams.length > 0 ? `Takımlar: ${branchTeams.map(t => t.name).join(', ')}` : 'Bu şubeden sorumlu takım yok',
                                                        branchAgents.length > 0 ? `Temsilciler: ${branchAgents.map(m => m.user?.name).join(', ')}` : 'Bu şubeye açıkça yetkili temsilci yok'
                                                    ].join(' · ')}>
                                                        {branchTeams.length > 0 && (
                                                            <span className="br-team-chips">
                                                                {branchTeams.map(t => (
                                                                    <span key={t.id} className="br-team-chip" style={{ '--tc': t.color || '#3b82f6' }}>
                                                                        <span className="br-team-dot" />{t.name}
                                                                    </span>
                                                                ))}
                                                            </span>
                                                        )}
                                                        <UserCircle size={12} />
                                                        {branchAgents.length > 0 ? (
                                                            <>
                                                                <span className="br-agent-avs">
                                                                    {branchAgents.slice(0, 5).map(m => (
                                                                        <span key={m.id} className="br-agent-av">{agentInitials(m.user?.name)}</span>
                                                                    ))}
                                                                </span>
                                                                <span className="br-agent-names">
                                                                    {branchAgents.slice(0, 3).map(m => m.user?.name?.split(' ')[0]).join(', ')}
                                                                    {branchAgents.length > 3 ? ` +${branchAgents.length - 3}` : ''}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span className="br-agent-none">{branchTeams.length > 0 ? 'Temsilci atanmadı' : 'Takım ve temsilci atanmadı'}</span>
                                                        )}
                                                        {sharedAgents.length > 0 && (
                                                            <span className="br-agent-shared">· {sharedAgents.length} kişi tüm şubelerde</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="br-phone">
                                                    {branch.phone || <span className="br-dash">—</span>}
                                                </div>
                                                <div className="br-acts">
                                                    <button
                                                        type="button"
                                                        className="br-ico"
                                                        aria-label={`${branch.name} düzenle`}
                                                        onClick={() => {
                                                            setEditingBranch(branch.id);
                                                            setEditBranchName(branch.name);
                                                            setEditBranchAddress(branch.address || '');
                                                            setEditBranchPhone(branch.phone || '');
                                                            setEditBranchMapsUrl(branch.googleMapsUrl || '');
                                                            setEditBranchIntegrationType(branch.integrationType || 'WORKSPACE_DEFAULT');
                                                            setEditBranchExternalCode(branch.externalBranchCode || '');
                                                            setEditBranchGoogleEmail(branch.googleEmail || '');
                                                        }}
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="br-ico danger"
                                                        aria-label={`${branch.name} sil`}
                                                        onClick={() => handleDeleteBranch(branch.id, branch.name)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {isOpen && (
                                                <div className="br-detail">
                                                    <div className="br-dsec">
                                                        <span className="br-dsec-name">Takımlar</span>
                                                        <span className="br-dsec-rule"></span>
                                                        <span className="br-dsec-count">{branchTeams.length}</span>
                                                    </div>
                                                    {branchTeams.length > 0 ? (
                                                        <div className="br-chips">
                                                            {branchTeams.map(t => (
                                                                <span key={t.id} className="br-chip br-chip-team" style={{ '--tc': t.color || '#3b82f6' }}>
                                                                    <span className="br-team-dot" />{t.name}
                                                                    <span className="br-chip-meta">{t._count?.members ?? t.members?.length ?? 0} üye</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="br-chip-none">Bu şubeden sorumlu takım yok. Takım ve Üyeler ekranında takımı düzenleyip "Sorumlu Olduğu Şubeler" seçin.</div>
                                                    )}

                                                    <div className="br-dsec">
                                                        <span className="br-dsec-name">Temsilciler</span>
                                                        <span className="br-dsec-rule"></span>
                                                        <span className="br-dsec-count">{branchAgents.length}</span>
                                                    </div>
                                                    {branchAgents.length > 0 ? (
                                                        <div className="br-chips">
                                                            {branchAgents.map(m => (
                                                                <span key={m.id} className="br-chip br-chip-agent">
                                                                    <span className="br-agent-av">{agentInitials(m.user?.name)}</span>
                                                                    {m.user?.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="br-chip-none">Bu şubeye açıkça yetkili temsilci yok. Takım ve Üyeler ekranından üyeyi düzenleyip şube seçin.</div>
                                                    )}
                                                    {sharedAgents.length > 0 && (
                                                        <div className="br-chip-none" style={{ marginTop: 6 }}>
                                                            Tüm şubelerde yetkili: {sharedAgents.map(m => m.user?.name).join(', ')}
                                                        </div>
                                                    )}

                                                    <div className="br-dsec">
                                                        <span className="br-dsec-name">{labels.productsTab || 'Ürünler'}</span>
                                                        <span className="br-dsec-rule"></span>
                                                        <span className="br-dsec-count">{branchProducts.length}</span>
                                                    </div>
                                                    {branchProducts.length > 0 ? (
                                                        <div className="br-chips">
                                                            {branchProducts.map(p => <span key={p.id} className="br-chip">{p.name}</span>)}
                                                        </div>
                                                    ) : (
                                                        <div className="br-chip-none">Bu {labels.branchSingle?.toLowerCase() || 'şube'} için {labels.productSingle?.toLowerCase() || 'ürün'} tanımlı değil.</div>
                                                    )}

                                                    <div className="br-dsec">
                                                        <span className="br-dsec-name">Kaynaklar</span>
                                                        <span className="br-dsec-rule"></span>
                                                        <span className="br-dsec-count">{branchResources.length}</span>
                                                    </div>
                                                    {branchResources.length > 0 ? (
                                                        <div className="br-chips">
                                                            {branchResources.map(r => <span key={r.id} className="br-chip">{r.name}</span>)}
                                                        </div>
                                                    ) : (
                                                        <div className="br-chip-none">Bu {labels.branchSingle?.toLowerCase() || 'şube'} için kaynak tanımlı değil.</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="br-surface br-form">
                            <h2>{editingBranch ? `${labels.branchSingle || 'Şube'} düzenle` : (labels.newBranch || 'Yeni şube ekle')}</h2>
                            <p className="br-form-hint">Bu bilgiler bot yanıtlarında ve randevu yönlendirmesinde kullanılır.</p>

                            <div className="br-f">
                                <label htmlFor="br-in-name">{labels.branchSingle || 'Şube'} adı *</label>
                                <input
                                    id="br-in-name"
                                    type="text"
                                    className="br-in"
                                    value={editingBranch ? editBranchName : newBranchName}
                                    onChange={e => editingBranch ? setEditBranchName(e.target.value) : setNewBranchName(e.target.value)}
                                    placeholder={labels.branchPlaceholder || 'Örn: Merkez Şube'}
                                />
                            </div>

                            <div className="br-f">
                                <label htmlFor="br-in-address">Adres</label>
                                <textarea
                                    id="br-in-address"
                                    className="br-in"
                                    rows="2"
                                    value={editingBranch ? editBranchAddress : newBranchAddress}
                                    onChange={e => editingBranch ? setEditBranchAddress(e.target.value) : setNewBranchAddress(e.target.value)}
                                    placeholder="Açık adres…"
                                />
                            </div>

                            <div className="br-f">
                                <label htmlFor="br-in-phone">Telefon</label>
                                <input
                                    id="br-in-phone"
                                    type="text"
                                    className="br-in"
                                    value={editingBranch ? editBranchPhone : newBranchPhone}
                                    onChange={e => editingBranch ? setEditBranchPhone(e.target.value) : setNewBranchPhone(e.target.value)}
                                    placeholder="+90…"
                                />
                            </div>

                            <div className="br-f">
                                <label htmlFor="br-in-maps">📍 Konum linki</label>
                                <input
                                    id="br-in-maps"
                                    type="url"
                                    className="br-in"
                                    value={editingBranch ? editBranchMapsUrl : newBranchMapsUrl}
                                    onChange={e => editingBranch ? setEditBranchMapsUrl(e.target.value) : setNewBranchMapsUrl(e.target.value)}
                                    placeholder="https://maps.google.com/…"
                                />
                                {(editingBranch ? editBranchMapsUrl : newBranchMapsUrl) && (
                                    <a
                                        href={editingBranch ? editBranchMapsUrl : newBranchMapsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: 12, color: '#dc2626', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
                                    >🔗 Haritada görüntüle</a>
                                )}
                            </div>

                            <div className="br-f">
                                <label htmlFor="br-in-integration">Rezervasyon entegrasyonu</label>
                                <select
                                    id="br-in-integration"
                                    className="br-in"
                                    value={editingBranch ? editBranchIntegrationType : newBranchIntegrationType}
                                    onChange={e => editingBranch ? setEditBranchIntegrationType(e.target.value) : setNewBranchIntegrationType(e.target.value)}
                                >
                                    <option value="WORKSPACE_DEFAULT">Çalışma alanı varsayılanı{hasHealthSystem ? ' (Probel HBYS)' : ''}</option>
                                    <option value="PROBEL">Probel HBYS (şube kodu ile)</option>
                                    <option value="GOOGLE_CALENDAR">Google Takvim</option>
                                    <option value="MANUAL">Manuel (sadece dahili takvim)</option>
                                </select>
                            </div>

                            {(editingBranch ? editBranchIntegrationType : newBranchIntegrationType) === 'PROBEL' && (
                                <div className="br-f">
                                    <label htmlFor="br-in-code">Probel şube kodu</label>
                                    <input
                                        id="br-in-code"
                                        type="text"
                                        className="br-in"
                                        value={editingBranch ? editBranchExternalCode : newBranchExternalCode}
                                        onChange={e => editingBranch ? setEditBranchExternalCode(e.target.value) : setNewBranchExternalCode(e.target.value)}
                                        placeholder="Örn: 1 veya 2"
                                    />
                                </div>
                            )}

                            {(editingBranch ? editBranchIntegrationType : newBranchIntegrationType) === 'GOOGLE_CALENDAR' && (
                                <div className="br-f">
                                    <label htmlFor="br-in-google">Google Takvim hesabı</label>
                                    {googleCalendars.length > 0 ? (
                                        <select
                                            id="br-in-google"
                                            className="br-in"
                                            value={editingBranch ? editBranchGoogleEmail : newBranchGoogleEmail}
                                            onChange={e => editingBranch ? setEditBranchGoogleEmail(e.target.value) : setNewBranchGoogleEmail(e.target.value)}
                                        >
                                            <option value="">Google hesabı seçin…</option>
                                            {googleCalendars.map(c => (
                                                <option key={c.id} value={c.googleEmail}>{c.googleEmail}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="br-note">Bağlı Google Takvim hesabı bulunamadı.</div>
                                    )}
                                </div>
                            )}

                            <div className="br-form-actions">
                                {editingBranch ? (
                                    <>
                                        <button type="button" className="br-btn br-btn-primary" onClick={() => handleUpdateBranch(editingBranch)}>Kaydet</button>
                                        <button type="button" className="br-btn" onClick={() => setEditingBranch(null)}>İptal</button>
                                    </>
                                ) : (
                                    <button type="button" className="br-btn br-btn-primary" onClick={handleCreateBranch} disabled={!newBranchName.trim()}>
                                        <Plus size={14} />
                                        {labels.branchSingle || 'Şube'} ekle
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Categories, Product Groups, Products Tabs — Render Full Products Component */}
            {['categories', 'productGroups', 'products'].includes(activeTab) && (
                <Products
                    embedded={true}
                    activeTab={activeTab}
                    onTabChange={(tab) => handleSelectTab(tab)}
                />
            )}

            {/* Resources Tab */}
            {activeTab === 'resources' && (
                <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <UserCircle size={28} style={{ color: 'var(--primary, #ef4444)' }} />
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>Kaynaklar</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #6b7280)' }}>Doktorlar, Araçlar, Ekipmanlar, Odalar, Masalar - Randevu Alınan Herşey</p>
                            </div>
                        </div>
                        {hasHealthSystem && (
                            <button
                                className="btn btn-outline"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 14px' }}
                                onClick={async () => {
                                    try {
                                        setResourcesLoading(true);
                                        await resourceAPI.syncHealthDoctors(currentWorkspace.id);
                                        await loadResources();
                                    } catch (err) {
                                        console.error(err);
                                        alert('Senkronizasyon hatası: ' + (err.response?.data?.error || err.message));
                                    } finally {
                                        setResourcesLoading(false);
                                    }
                                }}
                            >
                                <RefreshCw size={14} /> Probel Doktorlarını Yenile
                            </button>
                        )}
                    </div>

                    {/* Entegrasyon ve Filtre Hapları (Pills) */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        {[
                            { id: 'ALL', label: 'Tümü', count: resources.length },
                            { id: 'PROBEL', label: '⚡ Otomatik / Probel', count: resources.filter(r => r.syncProvider === 'PROBEL' || (r.syncProvider === 'WORKSPACE_DEFAULT' && hasHealthSystem)).length },
                            { id: 'GOOGLE', label: '📅 Google Takvim', count: resources.filter(r => r.syncProvider === 'GOOGLE_CALENDAR' || !!r.googleEmail).length },
                            { id: 'MANUAL', label: '✋ Manuel', count: resources.filter(r => r.syncProvider === 'MANUAL' || (!r.googleEmail && r.syncProvider !== 'PROBEL' && !(r.syncProvider === 'WORKSPACE_DEFAULT' && hasHealthSystem))).length }
                        ].map(f => (
                            <button
                                key={f.id}
                                onClick={() => setResourceSyncFilter(f.id)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    fontSize: '0.82rem',
                                    fontWeight: resourceSyncFilter === f.id ? 600 : 500,
                                    border: resourceSyncFilter === f.id ? '1px solid var(--primary, #ef4444)' : '1px solid #e2e8f0',
                                    background: resourceSyncFilter === f.id ? 'var(--primary-light, #fef2f2)' : '#fff',
                                    color: resourceSyncFilter === f.id ? 'var(--primary-dark, #dc2626)' : '#64748b',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span>{f.label}</span>
                                <span style={{
                                    background: resourceSyncFilter === f.id ? 'var(--primary, #ef4444)' : '#f1f5f9',
                                    color: resourceSyncFilter === f.id ? '#fff' : '#64748b',
                                    padding: '1px 7px',
                                    borderRadius: '10px',
                                    fontSize: '0.72rem',
                                    fontWeight: 600
                                }}>{f.count}</span>
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
                        <div>
                            {resourcesLoading ? (
                                <div className="loading">Yükleniyor...</div>
                            ) : (() => {
                                const filteredResources = resources.filter(r => {
                                    if (resourceSyncFilter === 'PROBEL') return r.syncProvider === 'PROBEL' || (r.syncProvider === 'WORKSPACE_DEFAULT' && hasHealthSystem);
                                    if (resourceSyncFilter === 'GOOGLE') return r.syncProvider === 'GOOGLE_CALENDAR' || !!r.googleEmail;
                                    if (resourceSyncFilter === 'MANUAL') return r.syncProvider === 'MANUAL' || (!r.googleEmail && r.syncProvider !== 'PROBEL' && !(r.syncProvider === 'WORKSPACE_DEFAULT' && hasHealthSystem));
                                    return true;
                                });

                                if (filteredResources.length === 0) {
                                    return <div className="empty-state">Bu filtreye uygun kaynak bulunamadı.</div>;
                                }

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {filteredResources.map(resource => {
                                            const isProbel = resource.syncProvider === 'PROBEL' || (resource.syncProvider === 'WORKSPACE_DEFAULT' && hasHealthSystem);
                                            const isGoogle = resource.syncProvider === 'GOOGLE_CALENDAR' || !!resource.googleEmail;
                                            const isManual = resource.syncProvider === 'MANUAL' || (!resource.googleEmail && resource.syncProvider !== 'PROBEL' && !isProbel);
                                            
                                            const branchNames = (resource.resourceBranches && resource.resourceBranches.length > 0)
                                                ? resource.resourceBranches.map(rb => rb.branch?.name).filter(Boolean)
                                                : (resource.branchIds || []).map(id => branches.find(b => b.id === id)?.name).filter(Boolean);

                                            return (
                                                <div key={resource.id} style={{ padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                                            <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary, #111827)' }}>{resource.name}</h4>
                                                            <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>{resource.type}</span>
                                                            
                                                            {/* Sync Provider Badge */}
                                                            {isProbel ? (
                                                                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: 600 }}>
                                                                    ⚡ Probel (HBYS){resource.externalId ? ` #${resource.externalId}` : ''}
                                                                </span>
                                                            ) : isGoogle ? (
                                                                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 600 }}>
                                                                    📅 Google Takvim{resource.googleEmail ? `: ${resource.googleEmail}` : ''}
                                                                </span>
                                                            ) : isManual ? (
                                                                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontWeight: 500 }}>
                                                                    ✋ Manuel
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: 500 }}>
                                                                    🏢 Çalışma Alanı Varsayılanı
                                                                </span>
                                                            )}
                                                        </div>

                                                        {resource.title && (
                                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6b7280)', marginBottom: '3px' }}>
                                                                {resource.title}
                                                            </div>
                                                        )}

                                                        {resource.description && (
                                                            <div style={{ fontSize: '0.82rem', color: '#0284c7', marginBottom: '4px', fontWeight: 500 }}>
                                                                Bölüm: {resource.description}
                                                            </div>
                                                        )}

                                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #6b7280)' }}>
                                                            Mesai: {resource.availableStart || '09:00'} - {resource.availableEnd || '18:00'} ({resource.slotMinutes || 30} dk periyot)
                                                        </div>

                                                        {branchNames.length > 0 && (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--primary, #ef4444)', marginTop: '4px', fontWeight: 500 }}>
                                                                📍 Şubeler: {branchNames.join(', ')}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
                                                        <button className="btn-icon" onClick={() => {
                                                            setEditingResource(resource.id);
                                                            setResourceForm({
                                                                name: resource.name || '',
                                                                title: resource.title || '',
                                                                description: resource.description || '',
                                                                type: resource.type || 'PERSON',
                                                                branchIds: (resource.resourceBranches && resource.resourceBranches.length > 0)
                                                                    ? resource.resourceBranches.map(rb => rb.branchId)
                                                                    : (resource.branchIds || []),
                                                                availableStart: resource.availableStart || '09:00',
                                                                availableEnd: resource.availableEnd || '18:00',
                                                                slotMinutes: resource.slotMinutes || 30,
                                                                syncProvider: resource.syncProvider || (isProbel ? 'PROBEL' : isGoogle ? 'GOOGLE_CALENDAR' : 'WORKSPACE_DEFAULT'),
                                                                externalId: resource.externalId || '',
                                                                googleEmail: resource.googleEmail || ''
                                                            });
                                                            setShowResourceForm(true);
                                                        }}><Pencil size={16} /></button>
                                                        <button className="btn-icon btn-danger" onClick={() => handleDeleteResource(resource.id, resource.name)}><Trash2 size={16} /></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>

                        <div>
                            {!showResourceForm && !editingResource ? (
                                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => {
                                    resetResourceForm();
                                    setShowResourceForm(true);
                                }}>Yeni Kaynak Ekle</button>
                            ) : (
                                <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                                    <h4 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>{editingResource ? 'Kaynağı Düzenle' : 'Yeni Kaynak Ekle'}</h4>
                                    
                                    <div className="form-group" style={{ marginBottom: '12px' }}>
                                        <label>Ad Soyad / Kaynak Adı *</label>
                                        <input type="text" className="input" value={resourceForm.name} onChange={e => setResourceForm({...resourceForm, name: e.target.value})} placeholder="Örn: Dr. Ahmet Yılmaz / Lazer Odası 1" />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '12px' }}>
                                        <label>Ünvan (İsteğe bağlı)</label>
                                        <input type="text" className="input" value={resourceForm.title} onChange={e => setResourceForm({...resourceForm, title: e.target.value})} placeholder="Örn: Uzman Psikolog / Operatör Dr." />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '12px' }}>
                                        <label>Bölüm / Uzmanlık Açıklaması</label>
                                        <input type="text" className="input" value={resourceForm.description} onChange={e => setResourceForm({...resourceForm, description: e.target.value})} placeholder="Örn: Beyin ve Sinir Cerrahisi / Saç Ekimi" />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '12px' }}>
                                        <label>Tip</label>
                                        <select className="input" value={resourceForm.type} onChange={e => setResourceForm({...resourceForm, type: e.target.value})}>
                                            <option value="PERSON">Kişi / Doktor (Person)</option>
                                            <option value="THERAPIST">Terapist (Therapist)</option>
                                            <option value="SPECIALIST">Uzman (Specialist)</option>
                                            <option value="STAFF">Personel (Staff)</option>
                                            <option value="ROOM">Oda / Alan (Room)</option>
                                            <option value="EQUIPMENT">Ekipman / Cihaz (Equipment)</option>
                                        </select>
                                    </div>

                                    {/* Rezervasyon ve Takvim Entegrasyonu */}
                                    <div className="form-group" style={{ marginBottom: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <label style={{ fontWeight: 600, color: '#334155', marginBottom: '6px', display: 'block' }}>Rezervasyon Entegrasyonu</label>
                                        <select 
                                            className="input" 
                                            value={resourceForm.syncProvider || 'WORKSPACE_DEFAULT'} 
                                            onChange={e => setResourceForm({ ...resourceForm, syncProvider: e.target.value })}
                                            style={{ marginBottom: '8px' }}
                                        >
                                            <option value="WORKSPACE_DEFAULT">🏢 Çalışma Alanı Varsayılanı {hasHealthSystem ? '(⚡ Probel HBYS)' : ''}</option>
                                            <option value="GOOGLE_CALENDAR">📅 Google Takvim (Bireysel Takvim)</option>
                                            <option value="PROBEL">⚡ Probel HBYS (Dış Sistem Kodu)</option>
                                            <option value="MANUAL">✋ Manuel (Entegrasyonsuz)</option>
                                        </select>

                                        {resourceForm.syncProvider === 'GOOGLE_CALENDAR' && (
                                            <div style={{ marginTop: '8px' }}>
                                                <label style={{ fontSize: '0.78rem', color: '#64748b' }}>Google Takvim Hesabı</label>
                                                {googleCalendars.length > 0 ? (
                                                    <select 
                                                        className="input" 
                                                        value={resourceForm.googleEmail || ''} 
                                                        onChange={e => setResourceForm({ ...resourceForm, googleEmail: e.target.value })}
                                                    >
                                                        <option value="">-- Google Hesabı Seçiniz --</option>
                                                        {googleCalendars.map(gc => (
                                                            <option key={gc.id} value={gc.googleEmail}>
                                                                {gc.googleEmail} ({gc.user?.name || 'Kullanıcı'})
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <div>
                                                        <input 
                                                            type="email" 
                                                            className="input" 
                                                            placeholder="ornek@gmail.com" 
                                                            value={resourceForm.googleEmail || ''} 
                                                            onChange={e => setResourceForm({ ...resourceForm, googleEmail: e.target.value })}
                                                        />
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                                                            ℹ️ Ayarlar &gt; Entegrasyonlar sekmesinden Google Takvim bağlayabilirsiniz.
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {resourceForm.syncProvider === 'PROBEL' && (
                                            <div style={{ marginTop: '8px' }}>
                                                <label style={{ fontSize: '0.78rem', color: '#64748b' }}>Probel Doktor Kodu (DOKTOR_KODU)</label>
                                                <input 
                                                    type="text" 
                                                    className="input" 
                                                    placeholder="Örn: 1042" 
                                                    value={resourceForm.externalId || ''} 
                                                    onChange={e => setResourceForm({ ...resourceForm, externalId: e.target.value })}
                                                />
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                                                    Probel HBYS sistemindeki doktor kodu ile randevuları otomatik eşleştirir.
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '12px' }}>
                                        <label>Çalıştığı Şubeler</label>
                                        <select 
                                            multiple 
                                            className="input" 
                                            style={{ height: '80px' }}
                                            value={resourceForm.branchIds} 
                                            onChange={e => {
                                                const options = Array.from(e.target.options);
                                                const selected = options.filter(o => o.selected).map(o => o.value);
                                                setResourceForm({...resourceForm, branchIds: selected});
                                            }}
                                        >
                                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                        <small style={{ color: '#64748b' }}>Birden fazla seçmek için Ctrl/Cmd tuşuna basılı tutun.</small>
                                    </div>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                        <div className="form-group">
                                            <label>Mesai Başlangıç</label>
                                            <input type="time" className="input" value={resourceForm.availableStart} onChange={e => setResourceForm({...resourceForm, availableStart: e.target.value})} />
                                        </div>
                                        <div className="form-group">
                                            <label>Mesai Bitiş</label>
                                            <input type="time" className="input" value={resourceForm.availableEnd} onChange={e => setResourceForm({...resourceForm, availableEnd: e.target.value})} />
                                        </div>
                                    </div>
                                    
                                    <div className="form-group" style={{ marginBottom: '16px' }}>
                                        <label>Randevu Süresi (Dakika)</label>
                                        <input type="number" className="input" value={resourceForm.slotMinutes} onChange={e => setResourceForm({...resourceForm, slotMinutes: parseInt(e.target.value) || 30})} />
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => editingResource ? handleUpdateResource(editingResource) : handleCreateResource()} disabled={!resourceForm.name.trim()}>Kaydet</button>
                                        <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => {
                                            setEditingResource(null);
                                            setShowResourceForm(false);
                                            resetResourceForm();
                                        }}>İptal</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Text Tab */}
            {activeTab === 'text' && (
                <div className="card kb-add-form">
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                        <label style={{ fontWeight: '600', marginBottom: '6px', display: 'block', color: 'var(--text-primary, #1e293b)' }}>
                            Başlık / Soru / Konu
                        </label>
                        <input
                            type="text"
                            className="input"
                            placeholder="Örn: İade Koşulları, Kargo Ücreti Ne Kadar?, Çalışma Prensipleri..."
                            value={newKbTitle}
                            onChange={(e) => setNewKbTitle(e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ fontWeight: '600', margin: 0, color: 'var(--text-primary, #1e293b)' }}>
                                İçerik / Cevap / Detaylar
                            </label>
                            <button
                                className="btn btn-outline kb-template-btn"
                                onClick={() => {
                                    setNewKbTitle('Şirket & Hizmet Genel Bilgileri');
                                    setNewKbContent(`📍 GENEL BİLGİLER
Firma Adı: [Firma adınızı yazın]
İletişim: Telefon: [+90 xxx] | E-posta: [info@firma.com] | Web: [www.firma.com]
Adres: [Şehir, İlçe, tam adres]
Çalışma Saatleri: [Pzt-Cum 09:00-18:00]

🏢 FİRMA HAKKINDA
Ne üretiyor/satıyor: [Ürün ve hizmet açıklaması]
Nereye satıyor: [Türkiye geneli / Online vb.]
Hedef kitle: [Bireysel müşteriler / Kurumsal / B2B vb.]

📦 ÜRÜN VE HİZMET LİSTESİ
1. [Ürün/Hizmet Adı] — [Açıklama] — [Fiyat: ₺xxx]
2. [Ürün/Hizmet Adı] — [Açıklama] — [Fiyat: ₺xxx]

❓ SIK SORULAN SORULAR
S: [Soru 1]
C: [Cevap 1]

⚠️ ÖNEMLİ NOTLAR
- [Garanti koşulları, iade politikası, özel kurallar vb.]`);
                                }}
                                style={{ fontSize: '12px', padding: '6px 12px', gap: '4px' }}
                            >
                                <ClipboardList size={14} />
                                📋 Şablondan Başla
                            </button>
                        </div>
                        <textarea
                            className="input"
                            rows="14"
                            placeholder="Bilgi, soru-cevap veya doküman içeriğini buraya yazın. AI müşteriyle konuşurken bu bilgileri kullanacaktır...

Örnekler:
- Sık sorulan sorular ve cevapları
- Ürün ve hizmet detayları, kampanya veya indirim koşulları
- İade, garanti, kargo veya randevu politikaları"
                            value={newKbContent}
                            onChange={(e) => setNewKbContent(e.target.value)}
                        />
                    </div>
                    <div className="kb-form-actions">
                        <button
                            className="btn btn-primary"
                            onClick={handleAddTextEntry}
                            disabled={!newKbContent.trim()}
                        >
                            <Plus size={16} />
                            Bilgi Ekle
                        </button>
                    </div>
                </div>
            )}

            {/* Files Tab */}
            {activeTab === 'files' && (
                <div className="card kb-upload-area">
                    <div className="upload-dropzone">
                        <Upload size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                        <h3>{t('knowledgeBase.uploadFile')}</h3>
                        <p>PDF, DOCX, DOC veya TXT dosyası seçin</p>
                        <label className="btn btn-primary upload-btn" style={{ marginTop: '16px' }}>
                            <Upload size={16} />
                            {uploading ? 'Yükleniyor...' : 'Dosya Seç'}
                            <input
                                type="file"
                                accept=".pdf,.docx,.doc,.txt"
                                onChange={(e) => {
                                    setUploadResult(null);
                                    handleFileUpload(e);
                                }}
                                disabled={uploading}
                                multiple
                                style={{ display: 'none' }}
                            />
                        </label>
                        <p style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                            Birden fazla dosya seçebilirsiniz • Maks 5MB
                        </p>
                    </div>

                    {/* Upload sonuç kartı */}
                    {uploadResult && (
                        <div className={`kb-upload-result ${uploadResult.success ? 'success' : 'error'}`}>
                            <div className="upload-result-icon">
                                {uploadResult.success ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                            </div>
                            <div className="upload-result-info">
                                <h4>{uploadResult.success ? 'Dosya başarıyla yüklendi!' : 'Yükleme hatası'}</h4>
                                <div className="upload-result-details">
                                    {uploadResult.success ? (
                                        <>
                                            <span><FileCheck size={14} /> {uploadResult.count} dosya eklendi</span>
                                            <span>✅ Metin çıkarıldı</span>
                                            <span>✅ AI bilgi bankasına eklendi</span>
                                        </>
                                    ) : (
                                        <span>{uploadResult.message}</span>
                                    )}
                                </div>
                            </div>
                            <button className="btn-icon" onClick={() => setUploadResult(null)} style={{ opacity: 0.5 }}>
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {knowledgeEntries.filter(e => e.sourceType === 'FILE').length > 0 && (
                        <div className="kb-file-list">
                            <h4 style={{ marginBottom: '12px', color: '#6b7280' }}>Yüklenen Dosyalar</h4>
                            {knowledgeEntries.filter(e => e.sourceType === 'FILE').map((entry) => (
                                <div key={entry.id} className="kb-file-item">
                                    <div className="kb-entry-icon">
                                        <File size={18} />
                                    </div>
                                    <div className="kb-entry-info">
                                        <span className="kb-file-name">{entry.title}</span>
                                        <span className="kb-entry-meta">
                                            {entry.fileType?.toUpperCase()} • {new Date(entry.createdAt).toLocaleDateString('tr-TR')}
                                        </span>
                                    </div>
                                    <button
                                        className="btn-icon btn-danger"
                                        onClick={() => handleDeleteEntry(entry.id)}
                                        title={t('common.delete')}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* URL / Web Scratch Tab */}
            {activeTab === 'url' && (
                <div className="card kb-add-form">
                    <div className="form-group">
                        <label>Web Sayfası URL'si</label>
                        <input
                            type="url"
                            className="input"
                            placeholder="https://www.metropolhastanesi.com/hakkimizda"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                        />
                        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                            * Sistem belirtilen sayfaya giderek sadece okunabilir metinleri çıkartacaktır.
                        </p>
                    </div>
                    <div className="form-group" style={{ marginTop: '16px' }}>
                        <label>Otomatik Güncelleme Sıklığı</label>
                        <select
                            className="input"
                            value={urlSyncInterval}
                            onChange={(e) => setUrlSyncInterval(e.target.value)}
                        >
                            <option value="">Sadece Bir Kez Tara (Manuel Güncelleme)</option>
                            <option value="24">Her Gün (24 Saatte Bir)</option>
                            <option value="48">İki Günde Bir (48 Saatte Bir)</option>
                            <option value="168">Haftada Bir (168 Saatte Bir)</option>
                        </select>
                    </div>
                    <div className="kb-form-actions">
                        <button
                            className="btn btn-primary"
                            onClick={handleAddUrlEntry}
                            disabled={scraping || !newUrl.trim()}
                        >
                            {scraping ? <RefreshCw className="spinning" size={16} /> : <Globe size={16} />}
                            {scraping ? 'Sayfa Taranıyor...' : 'Sayfayı Tara ve Ekle'}
                        </button>
                    </div>
                </div>
            )}

            {/* Dynamic Feed Tab */}
            {activeTab === 'feed' && (
                <div className="card kb-add-form">
                    <div className="form-group">
                        <label>JSON API veya Feed URL'si</label>
                        <input
                            type="url"
                            className="input"
                            placeholder="https://api.hastane.com/doktorlar.json"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                        />
                        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                            * Girdiğiniz JSON verisi Yapay Zekanın anlayacağı düz metinlere dönüştürülüp eklenecektir. (Stok, Fiyat veya Doktor listeleri için idealdir)
                        </p>
                    </div>
                    <div className="form-group" style={{ marginTop: '16px' }}>
                        <label>Otomatik Güncelleme Sıklığı</label>
                        <select
                            className="input"
                            value={urlSyncInterval}
                            onChange={(e) => setUrlSyncInterval(e.target.value)}
                        >
                            <option value="">Sadece Bir Kez Çek</option>
                            <option value="1">Her Saat</option>
                            <option value="12">Günde 2 Kez (12 Saat)</option>
                            <option value="24">Her Gün (24 Saat)</option>
                        </select>
                    </div>
                    <div className="kb-form-actions">
                        <button
                            className="btn btn-primary"
                            onClick={handleAddUrlEntry}
                            disabled={scraping || !newUrl.trim()}
                        >
                            {scraping ? <RefreshCw className="spinning" size={16} /> : <Link size={16} />}
                            {scraping ? 'Veri Çekiliyor...' : 'Feed Bağla ve Ekle'}
                        </button>
                    </div>
                </div>
            )}



            {/* Feed Tab */}
            {activeTab === 'feed' && (
                <div className="card kb-add-form">
                    <div className="form-group">
                        <label>JSON API veya Feed URL'si</label>
                        <input
                            type="url"
                            className="input"
                            placeholder="https://api.hastane.com/doktorlar.json"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                        />
                        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                            * Girdiğiniz JSON verisi Yapay Zekanın anlayacağı düz metinlere dönüştürülüp eklenecektir. (Stok, Fiyat veya Doktor listeleri için idealdir)
                        </p>
                    </div>
                    <div className="form-group" style={{ marginTop: '16px' }}>
                        <label>Otomatik Güncelleme Sıklığı</label>
                        <select
                            className="input"
                            value={urlSyncInterval}
                            onChange={(e) => setUrlSyncInterval(e.target.value)}
                        >
                            <option value="">Sadece Bir Kez Çek</option>
                            <option value="1">Her Saat</option>
                            <option value="12">Günde 2 Kez (12 Saat)</option>
                            <option value="24">Her Gün (24 Saat)</option>
                        </select>
                    </div>
                    <div className="kb-form-actions">
                        <button
                            className="btn btn-primary"
                            onClick={handleAddUrlEntry}
                            disabled={scraping || !newUrl.trim()}
                        >
                            {scraping ? <RefreshCw className="spinning" size={16} /> : <Link size={16} />}
                            {scraping ? 'Veri Çekiliyor...' : 'Feed Bağla ve Ekle'}
                        </button>
                    </div>
                </div>
            )}

            {/* List Tab - Merkezi AI Belleği & Tüm Bilgiler */}
            {activeTab === 'list' && (
                <>
                    {/* Doğal Dille AI Bilgi Bankasını Güncelleme Kutusu */}
                    <div className="card" style={{ marginBottom: '20px', border: '1.5px solid #E63B2E', background: 'linear-gradient(180deg, #fff9f8 0%, #ffffff 100%)', boxShadow: '0 4px 16px rgba(230, 59, 46, 0.08)', borderRadius: '12px', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sparkles size={20} color="#E63B2E" />
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                        🪄 AI ile Bilgi Bankasını Güncelle (Yazılı / Sözlü Talimat)
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                        Bilgi bankasına veya çalışma saatlerine dair değişiklikleri serbest dille yazın; AI Agent gerekli alanları otomatik güncellesin.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAiSetupModal(true)}
                                className="btn btn-outline"
                                style={{ fontSize: '12px', padding: '6px 12px', gap: '6px', color: '#E63B2E', borderColor: '#fca5a5', background: '#fff' }}
                            >
                                <Upload size={14} /> Doküman / Web ile Yapılandır
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <textarea
                                value={instructText}
                                onChange={(e) => setInstructText(e.target.value)}
                                placeholder="Örnek: 'Kadıköy şubesini Cumartesi günleri de 10:00-18:00 arası açık yaptık. Dr. Ayşe artık Salı günleri çalışmıyor. İade süremiz 14 günden 30 güne uzatıldı...'"
                                rows={3}
                                className="input"
                                style={{ flex: 1, minWidth: '280px', fontSize: '13px', background: '#fff' }}
                            />
                            <button
                                type="button"
                                onClick={handleInstructUpdate}
                                disabled={instructLoading || !instructText.trim()}
                                className="btn btn-primary"
                                style={{
                                    alignSelf: 'stretch',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '0 20px',
                                    background: 'linear-gradient(135deg, #E63B2E 0%, #dc2626 100%)',
                                    fontWeight: 600,
                                    fontSize: '13px'
                                }}
                            >
                                {instructLoading ? <RefreshCw size={16} className="spinning" /> : <Sparkles size={16} />}
                                {instructLoading ? 'AI İşliyor...' : 'AI ile Güncelle'}
                            </button>
                        </div>
                    </div>

                    {/* Merkezi AI Bilgi & Bellek Özeti (AI Agent'ın Bildiği Tüm Veriler) */}
                    <div className="card" style={{ marginBottom: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', background: '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Database size={18} color="#2563eb" />
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                        🧠 Merkezi AI Bellek Özeti (AI Agent Hafızası)
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                        AI Agent müşterilerle iletişim kurarken aşağıdaki tüm statik ve dinamik bilgi kaynaklarını kullanır.
                                    </p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="btn btn-retell-sync"
                                    onClick={handleRetellSync}
                                    disabled={syncingRetell || knowledgeEntries.length === 0}
                                    title="Bilgi bankasını AI sesli asistana senkronize et"
                                    style={{ margin: 0, fontSize: '12px', padding: '6px 12px' }}
                                >
                                    {syncingRetell ? <RefreshCw size={14} className="spinning" /> : <Phone size={14} />}
                                    {syncingRetell ? 'Senkronize Ediliyor...' : 'Sesli Asistana Sync Et'}
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                            {/* 1. Firma Künyesi */}
                            <div style={{ background: '#fff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Building2 size={14} color="#2563eb" /> Şirket Künyesi
                                </div>
                                <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                                    <div><strong>Firma:</strong> {companyInfo.name || 'Belirtilmedi'}</div>
                                    <div><strong>Sektör:</strong> {labels.sectorName || companyInfo.industry}</div>
                                    {companyInfo.founder && <div><strong>Kurucu:</strong> {companyInfo.founder}</div>}
                                    {companyInfo.phone && <div><strong>Tel:</strong> {companyInfo.phone}</div>}
                                    {companyInfo.address && <div><strong>Adres:</strong> {companyInfo.address}</div>}
                                </div>
                            </div>

                            {/* 2. Çalışma Saatleri & Bayramlar */}
                            <div style={{ background: '#fff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Clock size={14} color="#16a34a" /> Çalışma Saatleri & Tatiller
                                </div>
                                <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                                    <div>
                                        <strong>Saatler:</strong> {companyInfo.weeklySchedule.filter(s => s.enabled).map(s => `${s.short || s.label.slice(0,3)}: ${s.start}-${s.end}`).join(', ') || 'Belirtilmedi'}
                                    </div>
                                    <div style={{ marginTop: '4px' }}>
                                        <strong>Resmi Tatil & Bayram:</strong>{' '}
                                        <span style={{ fontWeight: 600, color: companyInfo.holidaysConfig?.closedOnPublicHolidays ? '#dc2626' : '#16a34a' }}>
                                            {companyInfo.holidaysConfig?.closedOnPublicHolidays ? 'Resmi Tatillerde KAPALI' : 'Resmi Tatillerde AÇIK'}
                                        </span>
                                    </div>
                                    {companyInfo.holidaysConfig?.note && (
                                        <div style={{ fontStyle: 'italic', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                            "{companyInfo.holidaysConfig.note}"
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 3. Şubeler & Lokasyonlar */}
                            <div style={{ background: '#fff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <MapPin size={14} color="#d97706" /> {labels.branchesTab || 'Şubeler'} ({branches.length})
                                </div>
                                <div style={{ fontSize: '12px', color: '#475569' }}>
                                    {branches.length > 0 ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {branches.map(b => (
                                                <span key={b.id} style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500 }}>
                                                    {b.name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span style={{ color: '#94a3b8' }}>Kayıtlı şube bulunmuyor</span>
                                    )}
                                </div>
                            </div>

                            {/* 4. Ürünler, Kategoriler ve Kaynaklar */}
                            <div style={{ background: '#fff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Package size={14} color="#8b5cf6" /> Ürünler & Uzmanlar
                                </div>
                                <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                                    <div><strong>{labels.productsTab || 'Ürünler'}:</strong> {products.length} ürün (Statik + Dinamik feed)</div>
                                    <div><strong>{labels.resourcesTab || 'Kaynaklar/Doktorlar'}:</strong> {resources.length} uzman/doktor/kaynak</div>
                                    <div><strong>{labels.categoriesTab || 'Kategoriler'}:</strong> {categories.length} kategori</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sync header bar */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px',
                        padding: '12px 16px',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0'
                    }}>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                            📚 Metin, Doküman, Web & SSS Kayıtları ({knowledgeEntries.length})
                        </div>
                        <button
                            className="btn btn-outline"
                            onClick={() => handleSelectTab('text')}
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                        >
                            + Yeni Metin / SSS Ekle
                        </button>
                    </div>
                    {kbLoading ? (
                        <div className="loading">Loading...</div>
                    ) : knowledgeEntries.length === 0 ? (
                        <div className="card empty-kb">
                            <Database size={48} style={{ opacity: 0.3 }} />
                            <h3>Henüz bilgi eklenmemiş</h3>
                            <p>AI asistanlarınızın daha akıllı yanıtlar verebilmesi için bilgi ekleyin.</p>
                        </div>
                    ) : (
                        <div className="kb-entries">
                            {knowledgeEntries.map((entry) => (
                                <div key={entry.id} className="card kb-entry">
                                    <div className="kb-entry-header">
                                        <div className="kb-entry-icon">
                                            {entry.sourceType === 'FILE' ? (
                                                <File size={20} />
                                            ) : (
                                                <FileText size={20} />
                                            )}
                                        </div>
                                        <div className="kb-entry-info">
                                            <h4>{entry.title}</h4>
                                            <span className="kb-entry-meta">
                                                {entry.sourceType === 'FILE' ? entry.fileType?.toUpperCase() : entry.sourceType === 'URL' ? '🌐 Web URL' : entry.sourceType === 'FEED' ? '🔗 Dinamik Feed' : entry.sourceType === 'FAQ' ? '❓ Soru-Cevap' : '📝 Metin'} •
                                                {new Date(entry.createdAt).toLocaleDateString('tr-TR')}
                                                {entry.lastSyncedAt && ` • Son Senkronize: ${new Date(entry.lastSyncedAt).toLocaleString('tr-TR')}`}
                                            </span>
                                        </div>
                                        <div className="kb-entry-actions">
                                            {(entry.sourceType === 'URL' || entry.sourceType === 'FEED') && (
                                                <button
                                                    className="btn-icon"
                                                    onClick={() => handleSyncEntry(entry.id)}
                                                    title="Manuel Senkronize Et"
                                                    disabled={syncingEntry === entry.id}
                                                >
                                                    <RefreshCw size={16} className={syncingEntry === entry.id ? 'spinning' : ''} />
                                                </button>
                                            )}
                                            {(entry.sourceType === 'TEXT' || entry.sourceType === 'FAQ' || !entry.sourceType) && (
                                                <button
                                                    className="btn-icon btn-edit"
                                                    onClick={() => handleEditEntry(entry)}
                                                    title={t('common.edit')}
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                            )}
                                            <button
                                                className="btn-icon btn-danger"
                                                onClick={() => handleDeleteEntry(entry.id)}
                                                title={t('common.delete')}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div
                                        className={`kb-entry-content ${expandedEntries[entry.id] ? 'expanded' : ''}`}
                                        onClick={() => setExpandedEntries(prev => ({
                                            ...prev,
                                            [entry.id]: !prev[entry.id]
                                        }))}
                                        style={{ cursor: entry.content.length > 300 ? 'pointer' : 'default' }}
                                    >
                                        {expandedEntries[entry.id]
                                            ? entry.content
                                            : entry.content.substring(0, 300) + (entry.content.length > 300 ? '...' : '')
                                        }
                                        {entry.content.length > 300 && (
                                            <span className="expand-toggle">
                                                {expandedEntries[entry.id] ? ' [Daralt]' : ' [Tamamını Gör]'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Edit Modal */}
            {editingEntry && (
                <div className="modal-overlay" onClick={handleCancelEdit}>
                    <div className="modal-content kb-edit-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Bilgiyi Edit</h2>
                            <button className="btn-icon" onClick={handleCancelEdit}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Başlık</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Bilgi başlığı"
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('knowledgeBase.content')}</label>
                                <textarea
                                    className="input"
                                    rows="12"
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    placeholder="Bilgi içeriği"
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={handleCancelEdit}>
                                İptal
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveEdit}
                                disabled={saving || !editTitle.trim() || !editContent.trim()}
                            >
                                {saving ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI ile Otomatik Yapılandırma Modal */}
            {showAiSetupModal && (
                <div className="modal-overlay" onClick={() => setShowAiSetupModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', width: '100%' }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sparkles size={20} color="#E63B2E" />
                                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>🪄 AI ile Tek Tıkla Kurulum</h2>
                            </div>
                            <button className="btn-icon" onClick={() => setShowAiSetupModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                                Kurumsal tanıtım dosyanızı (PDF, Word, Excel, TXT) yükleyin veya web sitenizin adresini girin.
                                AI şirket bilgilerinizi, çalışma saatlerini, tatil kurallarını, şubelerinizi, ürünlerinizi ve doktor/kaynak listenizi otomatik ayrıştırır.
                            </p>

                            {/* Dosya Yükleme Alanı */}
                            <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '20px', textAlign: 'center', background: '#f8fafc' }}>
                                <Upload size={32} color="#64748b" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                                    Kurumsal Tanıtım / Bilgi Dosyası Yükleyin
                                </div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>
                                    PDF, DOCX, XLSX, CSV veya TXT (Maks. 20MB)
                                </div>
                                <label className="btn btn-outline" style={{ cursor: 'pointer', display: 'inline-block' }}>
                                    {aiSetupLoading ? 'Belge Analiz Ediliyor...' : 'Dosya Seç'}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>VEYA</span>
                                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="url"
                                    className="input"
                                    placeholder="Web sitenizin adresi (Örn: https://www.firma.com)"
                                    value={aiSetupUrl}
                                    onChange={(e) => setAiSetupUrl(e.target.value)}
                                    style={{ flex: 1, fontSize: '13px' }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleAiSetupUrlParse}
                                    disabled={aiSetupLoading || !aiSetupUrl.trim()}
                                    style={{ fontSize: '13px', whiteSpace: 'nowrap' }}
                                >
                                    {aiSetupLoading ? <RefreshCw size={14} className="spinning" /> : <Globe size={14} />}
                                    {aiSetupLoading ? 'Taranıyor...' : 'Webden Tara'}
                                </button>
                            </div>

                            {/* Ayrıştırma Sonuç Önizlemesi */}
                            {aiSetupResult && (
                                <div style={{ border: '1.5px solid #bbf7d0', borderRadius: '10px', padding: '14px', background: '#f0fdf4' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
                                        <CheckCircle2 size={16} /> Veriler Başarıyla Çıkarıldı!
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#1e293b', lineHeight: 1.6 }}>
                                        <div><strong>Firma:</strong> {aiSetupResult.company?.name || 'Belirlenemedi'}</div>
                                        <div><strong>Sektör:</strong> {aiSetupResult.company?.industry || '-'}</div>
                                        <div><strong>Şubeler:</strong> {aiSetupResult.branches?.length || 0} şube bulundu</div>
                                        <div><strong>Kategoriler:</strong> {aiSetupResult.categories?.length || 0} kategori bulundu</div>
                                        <div><strong>Ürünler:</strong> {aiSetupResult.products?.length || 0} ürün/hizmet bulundu</div>
                                        <div><strong>Uzman/Doktorlar:</strong> {aiSetupResult.resources?.length || 0} kişi bulundu</div>
                                        <div><strong>SSS / Bilgiler:</strong> {aiSetupResult.faq?.length || 0} soru-cevap bulundu</div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => { setShowAiSetupModal(false); setAiSetupResult(null); }}>
                                İptal
                            </button>
                            {aiSetupResult && (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleApplyAiSetup}
                                    disabled={aiSetupApplying}
                                    style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', borderColor: '#16a34a' }}
                                >
                                    {aiSetupApplying ? <RefreshCw size={14} className="spinning" /> : <CheckCircle2 size={14} />}
                                    {aiSetupApplying ? 'Uygulanıyor...' : 'Çalışma Alanına Uygula ve Kaydet'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};

export default KnowledgeBase;

