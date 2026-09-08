import { useTranslation } from 'react-i18next';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI, knowledgeBaseAPI, retellAPI, appointmentConfigAPI, teamAPI, funnelAPI, productAPI, resourceAPI } from '../../services/api';
import { getTopicCategories, createTopicCategory, updateTopicCategory, deleteTopicCategory } from '../../services/topicCategory.api';
import { Trash2, Database, FileText, Upload, Plus, File, Building2, Image, Pencil, X, Globe, RefreshCw, Link, Phone, ClipboardList, CheckCircle2, AlertTriangle, FileCheck, MapPin, Layers, FolderTree, Package, UserCircle } from 'lucide-react';
import './KnowledgeBase.css';

const KnowledgeBase = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('company');

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
    const [resourceForm, setResourceForm] = useState({ name: '', title: '', type: 'PERSON', branchIds: [], availableStart: '09:00', availableEnd: '18:00', slotMinutes: 30 });

    // Knowledge Base States
    const [knowledgeEntries, setKnowledgeEntries] = useState([]);
    const [kbLoading, setKbLoading] = useState(false);
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
        logoPreview: ''
    });
    const [savingCompany, setSavingCompany] = useState(false);

    // Branches States
    const [branches, setBranches] = useState([]);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const [teams, setTeams] = useState([]);
    const [funnels, setFunnels] = useState([]);
    const [newBranchTeamId, setNewBranchTeamId] = useState('');
    const [newBranchFunnelId, setNewBranchFunnelId] = useState('');
    const [editBranchTeamId, setEditBranchTeamId] = useState('');
    const [editBranchFunnelId, setEditBranchFunnelId] = useState('');
    const [newBranchName, setNewBranchName] = useState('');
    const [newBranchAddress, setNewBranchAddress] = useState('');
    const [newBranchPhone, setNewBranchPhone] = useState('');
    const [editingBranch, setEditingBranch] = useState(null);
    const [editBranchName, setEditBranchName] = useState('');
    const [editBranchAddress, setEditBranchAddress] = useState('');
    const [editBranchPhone, setEditBranchPhone] = useState('');

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
        } catch (err) { console.error('Error loading resources:', err); }
        finally { setResourcesLoading(false); }
    };

    const loadTeams = async () => {
        try {
            const res = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
            setTeams(res.data?.teams || []);
        } catch (err) { console.error('Error loading teams:', err); }
    };

    const loadFunnels = async () => {
        try {
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data?.funnels || []);
        } catch (err) { console.error('Error loading funnels:', err); }
    };

    const loadBranches = async () => {
        try {
            setBranchesLoading(true);
            const res = await appointmentConfigAPI.getBranches(currentWorkspace.id);
            setBranches(res.data?.branches || []);
        } catch (err) {
            console.error('Error loading branches:', err);
        } finally {
            setBranchesLoading(false);
        }
    };

    const handleCreateBranch = async () => {
        if (!newBranchName.trim()) return;
        try {
            await appointmentConfigAPI.createBranch(currentWorkspace.id, {
                name: newBranchName,
                address: newBranchAddress,
                phone: newBranchPhone,
                defaultTeamId: newBranchTeamId || null,
                defaultFunnelId: newBranchFunnelId || null
            });
            setNewBranchName('');
            setNewBranchAddress('');
            setNewBranchPhone('');
            setNewBranchTeamId('');
            setNewBranchFunnelId('');
            loadBranches();
        } catch (err) {
            console.error('Error creating branch:', err);
            alert(err.response?.data?.error || 'Şube eklenirken hata oluştu');
        }
    };

    const handleUpdateBranch = async (id) => {
        if (!editBranchName.trim()) return;
        try {
            await appointmentConfigAPI.updateBranch(currentWorkspace.id, id, {
                name: editBranchName,
                address: editBranchAddress,
                phone: editBranchPhone,
                defaultTeamId: editBranchTeamId || null,
                defaultFunnelId: editBranchFunnelId || null
            });
            setEditingBranch(null);
            loadBranches();
        } catch (err) {
            console.error('Error updating branch:', err);
            alert(err.response?.data?.error || 'Şube güncellenirken hata oluştu');
        }
    };

    const handleDeleteBranch = async (id, name) => {
        if (!confirm(`"${name}" şubesini silmek istediğinize emin misiniz?`)) return;
        try {
            await appointmentConfigAPI.deleteBranch(currentWorkspace.id, id);
            loadBranches();
        } catch (err) {
            console.error('Error deleting branch:', err);
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
    const handleCreateResource = async () => {
        if (!resourceForm.name.trim()) return;
        try {
            await resourceAPI.create(currentWorkspace.id, resourceForm);
            setShowResourceForm(false);
            setResourceForm({ name: '', title: '', type: 'PERSON', branchIds: [], availableStart: '09:00', availableEnd: '18:00', slotMinutes: 30 });
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
            setResourceForm({ name: '', title: '', type: 'PERSON', branchIds: [], availableStart: '09:00', availableEnd: '18:00', slotMinutes: 30 });
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

    const loadCompanyInfo = async () => {
        try {
            const response = await workspaceAPI.getCompanyInfo(currentWorkspace.id);
            const info = response.data.companyInfo;
            setCompanyInfo({
                name: info.companyName || '',
                description: info.companyDescription || '',
                address: info.companyAddress || '',
                phone: info.companyPhone || '',
                email: info.companyEmail || '',
                website: info.companyWebsite || '',
                workingHours: info.companyWorkingHours || '',
                logo: null,
                logoPreview: info.companyLogo || ''
            });
        } catch (error) {
            console.error('Error loading company info:', error);
        }
    };

    const handleSaveCompanyInfo = async () => {
        try {
            setSavingCompany(true);
            await workspaceAPI.updateCompanyInfo(currentWorkspace.id, {
                companyName: companyInfo.name,
                companyDescription: companyInfo.description,
                companyAddress: companyInfo.address,
                companyPhone: companyInfo.phone,
                companyEmail: companyInfo.email,
                companyWebsite: companyInfo.website,
                companyWorkingHours: companyInfo.workingHours
            });
            alert(t('knowledgeBase.saved'));
        } catch (error) {
            console.error('Error saving company info:', error);
            alert('Şirket bilgileri kaydedilirken hata oluştu');
        } finally {
            setSavingCompany(false);
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
            alert('Logo silindi');
        } catch (error) {
            console.error('Error deleting logo:', error);
            alert('Logo silinirken hata oluştu');
        }
    };

    const handleAddTextEntry = async () => {
        if (!newKbContent.trim()) {
            alert(t('knowledgeBase.contentRequired'));
            return;
        }

        try {
            // Auto-generate title from first 50 chars of content
            const autoTitle = newKbContent.trim().substring(0, 50) + (newKbContent.length > 50 ? '...' : '');
            await knowledgeBaseAPI.addText(currentWorkspace.id, {
                title: autoTitle,
                content: newKbContent
            });
            setNewKbContent('');
            loadKnowledgeBase();
            alert('Bilgi eklendi');
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

    if (!currentWorkspace) {
        return (
            <div className="empty-state">
                <p>{t('common.selectWorkspace')}</p>
            </div>
        );
    }

    return (
        <div className="knowledge-base-page base-layout">
            {/* Sol Sidebar */}
            <div className="base-sidebar">
                <div className="base-sidebar-header">
                    <Building2 size={20} />
                    <span>Base</span>
                </div>
                <nav className="base-nav">
                    <div className="base-nav-group">
                        <span className="base-nav-label">Bilgi</span>
                        <button className={`base-nav-item ${activeTab === 'company' ? 'active' : ''}`} onClick={() => setActiveTab('company')}>
                            <Building2 size={16} /> Şirket Bilgileri
                        </button>
                        <button className={`base-nav-item ${activeTab === 'branches' ? 'active' : ''}`} onClick={() => setActiveTab('branches')}>
                            <MapPin size={16} /> Şubeler
                        </button>
                        <button className={`base-nav-item ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
                            <Layers size={16} /> Kategoriler
                        </button>
                    </div>
                    <div className="base-nav-group">
                        <span className="base-nav-label">Ürün & Hizmet</span>
                        <button className={`base-nav-item ${activeTab === 'productGroups' ? 'active' : ''}`} onClick={() => setActiveTab('productGroups')}>
                            <FolderTree size={16} /> Ürün Grupları
                        </button>
                        <button className={`base-nav-item ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
                            <Package size={16} /> Ürünler
                        </button>
                        <button className={`base-nav-item ${activeTab === 'resources' ? 'active' : ''}`} onClick={() => setActiveTab('resources')}>
                            <UserCircle size={16} /> Kaynaklar
                        </button>
                    </div>
                    <div className="base-nav-group">
                        <span className="base-nav-label">İçerik</span>
                        <button className={`base-nav-item ${activeTab === 'text' ? 'active' : ''}`} onClick={() => setActiveTab('text')}>
                            <FileText size={16} /> Metin Ekle
                        </button>
                        <button className={`base-nav-item ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
                            <Upload size={16} /> Dosya Ekle
                        </button>
                        <button className={`base-nav-item ${activeTab === 'url' ? 'active' : ''}`} onClick={() => setActiveTab('url')}>
                            <Globe size={16} /> Web Sitesi Tara
                        </button>
                        <button className={`base-nav-item ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => setActiveTab('feed')}>
                            <Link size={16} /> Dinamik Feed
                        </button>
                    </div>
                    <div className="base-nav-group">
                        <button className={`base-nav-item ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>
                            <Database size={16} /> Tüm Bilgiler <span className="base-nav-badge">{knowledgeEntries.length}</span>
                        </button>
                    </div>
                </nav>
            </div>

            {/* Sağ İçerik */}
            <div className="base-content">

            {/* Company Tab */}
            {activeTab === 'company' && (
                <div className="card company-info-form">
                    <div className="company-logo-section">
                        <div className="logo-preview">
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
                                <div className="logo-placeholder">
                                    <Image size={32} />
                                    <span>Logo</span>
                                </div>
                            )}
                        </div>
                        <div className="logo-actions">
                            <label className="btn btn-outline upload-logo-btn">
                                <Upload size={16} />
                                Logo Yükle
                                <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.webp,.gif"
                                    onChange={handleLogoChange}
                                    style={{ display: 'none' }}
                                />
                            </label>
                            {companyInfo.logoPreview && (
                                <button className="btn btn-outline btn-danger-outline" onClick={handleDeleteLogo}>
                                    <Trash2 size={16} />
                                    Kaldır
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="company-form-grid">
                        <div className="form-group">
                            <label>{t('knowledgeBase.companyName')}</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Örn: ABC Teknoloji Ltd."
                                value={companyInfo.name}
                                onChange={(e) => setCompanyInfo(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Website</label>
                            <input
                                type="url"
                                className="input"
                                placeholder="https://www.ornek.com"
                                value={companyInfo.website}
                                onChange={(e) => setCompanyInfo(prev => ({ ...prev, website: e.target.value }))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Telefon</label>
                            <input
                                type="tel"
                                className="input"
                                placeholder="+90 212 123 45 67"
                                value={companyInfo.phone}
                                onChange={(e) => setCompanyInfo(prev => ({ ...prev, phone: e.target.value }))}
                            />
                        </div>
                        <div className="form-group">
                            <label>E-posta</label>
                            <input
                                type="email"
                                className="input"
                                placeholder="info@ornek.com"
                                value={companyInfo.email}
                                onChange={(e) => setCompanyInfo(prev => ({ ...prev, email: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Adres</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="Örn: İstanbul, Türkiye"
                            value={companyInfo.address}
                            onChange={(e) => setCompanyInfo(prev => ({ ...prev, address: e.target.value }))}
                        />
                    </div>

                    <div className="form-group">
                        <label>{t('users.workingHoursTitle')}</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="Örn: Pazartesi-Cuma 09:00-18:00"
                            value={companyInfo.workingHours}
                            onChange={(e) => setCompanyInfo(prev => ({ ...prev, workingHours: e.target.value }))}
                        />
                    </div>

                    <div className="form-group">
                        <label>{t('knowledgeBase.companyDesc')}</label>
                        <textarea
                            className="input"
                            rows="4"
                            placeholder="Şirketiniz hakkında kısa bir açıklama. AI bu bilgiyi müşterilerle paylaşabilir."
                            value={companyInfo.description}
                            onChange={(e) => setCompanyInfo(prev => ({ ...prev, description: e.target.value }))}
                        />
                    </div>

                    <div className="kb-form-actions">
                        <button
                            className="btn btn-primary"
                            onClick={handleSaveCompanyInfo}
                            disabled={savingCompany}
                        >
                            {savingCompany ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </div>
            )}

            {/* Branches Tab */}
            {activeTab === 'branches' && (
                <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <MapPin size={24} style={{ color: '#6366f1' }} />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Şubeler</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>Klinik şubelerinizi ve lokasyonlarınızı yönetin.</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
                        <div>
                            {branchesLoading ? (
                                <div className="loading">Yükleniyor...</div>
                            ) : branches.length === 0 ? (
                                <div className="empty-state">Henüz şube eklenmemiş.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {branches.map(branch => (
                                        <div key={branch.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div 
                                                style={{ 
                                                    padding: '16px', 
                                                    background: selectedBranch?.id === branch.id ? '#eef2ff' : '#f8fafc', 
                                                    borderRadius: '8px', 
                                                    border: selectedBranch?.id === branch.id ? '1px solid #6366f1' : '1px solid #e2e8f0', 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    alignItems: 'flex-start',
                                                    cursor: 'pointer'
                                                }}
                                                onClick={() => setSelectedBranch(selectedBranch?.id === branch.id ? null : branch)}
                                            >
                                                <div>
                                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#1e293b' }}>{branch.name}</h4>
                                                    {branch.address && <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>📍 {branch.address}</div>}
                                                    {branch.phone && <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>📞 {branch.phone}</div>}
                                                    {branch.defaultTeamId && <div style={{ fontSize: '0.8rem', color: '#6366f1', marginTop: '8px' }}>Takım: {teams.find(t => t.id === branch.defaultTeamId)?.name || 'Bilinmiyor'}</div>}
                                                    {branch.defaultFunnelId && <div style={{ fontSize: '0.8rem', color: '#6366f1' }}>Akış: {funnels.find(f => f.id === branch.defaultFunnelId)?.name || 'Bilinmiyor'}</div>}
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
                                                    <button className="btn-icon" onClick={() => {
                                                        setEditingBranch(branch.id);
                                                        setEditBranchName(branch.name);
                                                        setEditBranchAddress(branch.address || '');
                                                        setEditBranchPhone(branch.phone || '');
                                                        setEditBranchTeamId(branch.defaultTeamId || '');
                                                        setEditBranchFunnelId(branch.defaultFunnelId || '');
                                                    }}><Pencil size={16} /></button>
                                                    <button className="btn-icon btn-danger" onClick={() => handleDeleteBranch(branch.id, branch.name)}><Trash2 size={16} /></button>
                                                </div>
                                            </div>
                                            
                                            {selectedBranch?.id === branch.id && (
                                                <div style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', marginLeft: '16px' }}>
                                                    <h5 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Bu Şubedeki Ürünler</h5>
                                                    <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px', fontSize: '0.9rem', color: '#475569' }}>
                                                        {products.filter(p => p.allBranches || (p.productBranches && p.productBranches.some(pb => pb.branchId === branch.id))).length > 0 ? (
                                                            products.filter(p => p.allBranches || (p.productBranches && p.productBranches.some(pb => pb.branchId === branch.id))).map(p => (
                                                                <li key={p.id}>{p.name}</li>
                                                            ))
                                                        ) : (
                                                            <li>Ürün bulunamadı.</li>
                                                        )}
                                                    </ul>

                                                    <h5 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Bu Şubedeki Kaynaklar</h5>
                                                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: '#475569' }}>
                                                        {resources.filter(r => r.branchId === branch.id || r.resourceBranch === branch.id || (r.branchIds && r.branchIds.includes(branch.id))).length > 0 ? (
                                                            resources.filter(r => r.branchId === branch.id || r.resourceBranch === branch.id || (r.branchIds && r.branchIds.includes(branch.id))).map(r => (
                                                                <li key={r.id}>{r.name}</li>
                                                            ))
                                                        ) : (
                                                            <li>Kaynak bulunamadı.</li>
                                                        )}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                                <h4 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>{editingBranch ? 'Şubeyi Düzenle' : 'Yeni Şube Ekle'}</h4>
                                
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Şube Adı *</label>
                                    <input type="text" className="input" value={editingBranch ? editBranchName : newBranchName} onChange={e => editingBranch ? setEditBranchName(e.target.value) : setNewBranchName(e.target.value)} placeholder="Örn: Merkez Şube" />
                                </div>
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Adres</label>
                                    <textarea className="input" rows="2" value={editingBranch ? editBranchAddress : newBranchAddress} onChange={e => editingBranch ? setEditBranchAddress(e.target.value) : setNewBranchAddress(e.target.value)} placeholder="Açık adres..." />
                                </div>
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Telefon</label>
                                    <input type="text" className="input" value={editingBranch ? editBranchPhone : newBranchPhone} onChange={e => editingBranch ? setEditBranchPhone(e.target.value) : setNewBranchPhone(e.target.value)} placeholder="+90..." />
                                </div>
                                
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Varsayılan Takım</label>
                                    <select className="input" value={editingBranch ? editBranchTeamId : newBranchTeamId} onChange={e => editingBranch ? setEditBranchTeamId(e.target.value) : setNewBranchTeamId(e.target.value)}>
                                        <option value="">-- Seçiniz --</option>
                                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label>Varsayılan Akış</label>
                                    <select className="input" value={editingBranch ? editBranchFunnelId : newBranchFunnelId} onChange={e => editingBranch ? setEditBranchFunnelId(e.target.value) : setNewBranchFunnelId(e.target.value)}>
                                        <option value="">-- Seçiniz --</option>
                                        {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>

                                {editingBranch ? (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleUpdateBranch(editingBranch)}>Kaydet</button>
                                        <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditingBranch(null)}>İptal</button>
                                    </div>
                                ) : (
                                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleCreateBranch} disabled={!newBranchName.trim()}>Şube Ekle</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Categories Tab */}
            {activeTab === 'categories' && (
                <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <Layers size={24} style={{ color: '#6366f1' }} />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Kategoriler</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>Konu kategorileri, varsayılan takım ve akış eşleştirmesi</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
                        <div>
                            {categoriesLoading ? (
                                <div className="loading">Yükleniyor...</div>
                            ) : categories.length === 0 ? (
                                <div className="empty-state">Henüz kategori eklenmemiş.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {categories.map(category => (
                                        <div key={category.id} style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#1e293b' }}>{category.name}</h4>
                                                {category.defaultTeamId && <div style={{ fontSize: '0.8rem', color: '#6366f1', marginTop: '4px' }}>Takım: {teams.find(t => t.id === category.defaultTeamId)?.name || 'Bilinmiyor'}</div>}
                                                {category.defaultFunnelId && <div style={{ fontSize: '0.8rem', color: '#6366f1' }}>Akış: {funnels.find(f => f.id === category.defaultFunnelId)?.name || 'Bilinmiyor'}</div>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button className="btn-icon" onClick={() => {
                                                    setEditingCategory(category.id);
                                                    setEditCategoryName(category.name);
                                                    setEditCategoryDefaultTeamId(category.defaultTeamId || '');
                                                    setEditCategoryDefaultFunnelId(category.defaultFunnelId || '');
                                                }}><Pencil size={16} /></button>
                                                <button className="btn-icon btn-danger" onClick={() => handleDeleteCategory(category.id, category.name)}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                                <h4 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>{editingCategory ? 'Kategoriyi Düzenle' : 'Yeni Kategori Ekle'}</h4>
                                
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Kategori Adı *</label>
                                    <input type="text" className="input" value={editingCategory ? editCategoryName : newCategoryName} onChange={e => editingCategory ? setEditCategoryName(e.target.value) : setNewCategoryName(e.target.value)} placeholder="Örn: Teknik Destek" />
                                </div>
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Varsayılan Takım</label>
                                    <select className="input" value={editingCategory ? editCategoryDefaultTeamId : newCategoryDefaultTeamId} onChange={e => editingCategory ? setEditCategoryDefaultTeamId(e.target.value) : setNewCategoryDefaultTeamId(e.target.value)}>
                                        <option value="">-- Seçiniz --</option>
                                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label>Varsayılan Akış</label>
                                    <select className="input" value={editingCategory ? editCategoryDefaultFunnelId : newCategoryDefaultFunnelId} onChange={e => editingCategory ? setEditCategoryDefaultFunnelId(e.target.value) : setNewCategoryDefaultFunnelId(e.target.value)}>
                                        <option value="">-- Seçiniz --</option>
                                        {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>

                                {editingCategory ? (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleUpdateCategory(editingCategory)}>Kaydet</button>
                                        <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditingCategory(null)}>İptal</button>
                                    </div>
                                ) : (
                                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>Kategori Ekle</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Product Groups Tab */}
            {activeTab === 'productGroups' && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>📁 Ürün Grupları</h3>
                            <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Ürün grupları ve alt ürünler</p>
                        </div>
                        <a href="/products" className="btn btn-outline" style={{ textDecoration: 'none' }}>Ürünler Sayfasına Git</a>
                    </div>
                    
                    {productsLoading ? (
                        <div className="loading">Yükleniyor...</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {products.filter(p => p.isGroup).map(group => {
                                const children = products.filter(p => p.parentId === group.id);
                                const isExpanded = expandedEntries[group.id];
                                return (
                                    <div key={group.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#f8fafc' }}>
                                        <div 
                                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                            onClick={() => setExpandedEntries(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                                        >
                                            <div>
                                                <h4 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', color: '#1e293b' }}>{group.name}</h4>
                                                <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', gap: '12px' }}>
                                                    <span>Alt Ürün: {children.length}</span>
                                                    {group.categoryName && <span>Kategori: {group.categoryName}</span>}
                                                </div>
                                            </div>
                                            <div style={{ color: '#6366f1' }}>
                                                {isExpanded ? 'Gizle' : 'Göster'}
                                            </div>
                                        </div>
                                        
                                        {isExpanded && children.length > 0 && (
                                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {children.map(child => (
                                                    <div key={child.id} style={{ padding: '8px 12px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>{child.name}</span>
                                                        <span style={{ color: '#64748b' }}>{child.price ? `${child.price} ₺` : 'Fiyat Yok'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {products.filter(p => p.isGroup).length === 0 && (
                                <div className="empty-state">Henüz ürün grubu bulunmuyor.</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Products Tab */}
            {activeTab === 'products' && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>🏷️ Ürünler</h3>
                            <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Tüm ürün ve hizmetleriniz</p>
                        </div>
                        <a href="/products" className="btn btn-outline" style={{ textDecoration: 'none' }}>Detaylı düzenleme için Ürünler sayfasına gidin</a>
                    </div>
                    
                    {productsLoading ? (
                        <div className="loading">Yükleniyor...</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {products.length === 0 ? (
                                <div className="empty-state">Henüz ürün eklenmemiş.</div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                                <th style={{ padding: '12px 8px', color: '#64748b' }}>Ürün Adı</th>
                                                <th style={{ padding: '12px 8px', color: '#64748b' }}>Grup / Üst</th>
                                                <th style={{ padding: '12px 8px', color: '#64748b' }}>Kategori</th>
                                                <th style={{ padding: '12px 8px', color: '#64748b' }}>Fiyat</th>
                                                <th style={{ padding: '12px 8px', color: '#64748b' }}>Durum</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {products.map(product => {
                                                const parent = product.parentId ? products.find(p => p.id === product.parentId) : null;
                                                return (
                                                    <tr key={product.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                        <td style={{ padding: '12px 8px', fontWeight: 500 }}>{product.name}</td>
                                                        <td style={{ padding: '12px 8px', color: '#64748b' }}>{parent ? parent.name : '-'}</td>
                                                        <td style={{ padding: '12px 8px', color: '#64748b' }}>{product.categoryName || '-'}</td>
                                                        <td style={{ padding: '12px 8px', color: '#10b981' }}>{product.price ? `${product.price} ₺` : '-'}</td>
                                                        <td style={{ padding: '12px 8px' }}>
                                                            <span style={{ 
                                                                padding: '4px 8px', 
                                                                borderRadius: '12px', 
                                                                fontSize: '0.8rem', 
                                                                background: product.isActive !== false ? '#dcfce3' : '#fee2e2', 
                                                                color: product.isActive !== false ? '#166534' : '#991b1b' 
                                                            }}>
                                                                {product.isActive !== false ? 'Aktif' : 'Pasif'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Resources Tab */}
            {activeTab === 'resources' && (
                <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <UserCircle size={24} style={{ color: '#6366f1' }} />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Kaynaklar</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>Doktorlar, terapistler, uzmanlar — randevu alınabilen kaynaklar</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
                        <div>
                            {resourcesLoading ? (
                                <div className="loading">Yükleniyor...</div>
                            ) : resources.length === 0 ? (
                                <div className="empty-state">Henüz kaynak eklenmemiş.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {resources.map(resource => (
                                        <div key={resource.id} style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <h4 style={{ margin: 0, fontSize: '1rem', color: '#1e293b' }}>{resource.name}</h4>
                                                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#e0e7ff', color: '#4f46e5' }}>{resource.type}</span>
                                                </div>
                                                {resource.title && <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>{resource.title}</div>}
                                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                    Mesai: {resource.availableStart} - {resource.availableEnd} ({resource.slotMinutes} dk)
                                                </div>
                                                {resource.branchIds && resource.branchIds.length > 0 && (
                                                    <div style={{ fontSize: '0.8rem', color: '#6366f1', marginTop: '4px' }}>
                                                        Şubeler: {resource.branchIds.map(id => branches.find(b => b.id === id)?.name).filter(Boolean).join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button className="btn-icon" onClick={() => {
                                                    setEditingResource(resource.id);
                                                    setResourceForm({
                                                        name: resource.name,
                                                        title: resource.title || '',
                                                        type: resource.type || 'PERSON',
                                                        branchIds: resource.branchIds || [],
                                                        availableStart: resource.availableStart || '09:00',
                                                        availableEnd: resource.availableEnd || '18:00',
                                                        slotMinutes: resource.slotMinutes || 30
                                                    });
                                                    setShowResourceForm(true);
                                                }}><Pencil size={16} /></button>
                                                <button className="btn-icon btn-danger" onClick={() => handleDeleteResource(resource.id, resource.name)}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            {!showResourceForm && !editingResource ? (
                                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowResourceForm(true)}>Yeni Kaynak Ekle</button>
                            ) : (
                                <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                                    <h4 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>{editingResource ? 'Kaynağı Düzenle' : 'Yeni Kaynak Ekle'}</h4>
                                    
                                    <div className="form-group" style={{ marginBottom: '12px' }}>
                                        <label>Ad Soyad *</label>
                                        <input type="text" className="input" value={resourceForm.name} onChange={e => setResourceForm({...resourceForm, name: e.target.value})} placeholder="Örn: Dr. Ahmet Yılmaz" />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '12px' }}>
                                        <label>Ünvan (İsteğe bağlı)</label>
                                        <input type="text" className="input" value={resourceForm.title} onChange={e => setResourceForm({...resourceForm, title: e.target.value})} placeholder="Örn: Uzman Psikolog" />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '12px' }}>
                                        <label>Tip</label>
                                        <select className="input" value={resourceForm.type} onChange={e => setResourceForm({...resourceForm, type: e.target.value})}>
                                            <option value="PERSON">Kişi (Person)</option>
                                            <option value="THERAPIST">Terapist (Therapist)</option>
                                            <option value="SPECIALIST">Uzman (Specialist)</option>
                                            <option value="STAFF">Personel (Staff)</option>
                                            <option value="ROOM">Oda (Room)</option>
                                            <option value="EQUIPMENT">Ekipman (Equipment)</option>
                                        </select>
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
                                            setResourceForm({ name: '', title: '', type: 'PERSON', branchIds: [], availableStart: '09:00', availableEnd: '18:00', slotMinutes: 30 });
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
                    <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ margin: 0 }}>{t('knowledgeBase.content')}</label>
                            <button
                                className="btn btn-outline kb-template-btn"
                                onClick={() => setNewKbContent(`📍 GENEL BİLGİLER
Firma Adı: [Firma adınızı yazın]
İletişim: Telefon: [+90 xxx] | E-posta: [info@firma.com] | Web: [www.firma.com]
Adres: [Şehir, İlçe, tam adres]
Çalışma Saatleri: [Pzt-Cum 09:00-18:00]

🏢 FİRMA HAKKINDA
Ne üretiyor/satıyor: [Ürün ve hizmet açıklaması]
Nereye satıyor: [Türkiye geneli / İzmir / Online vb.]
Hedef kitle: [Bireysel müşteriler / Kurumsal / B2B vb.]

📦 ÜRÜN VE HİZMET LİSTESİ
1. [Ürün/Hizmet Adı] — [Açıklama] — [Fiyat: ₺xxx veya "Fiyat bilgisi yok"]
2. [Ürün/Hizmet Adı] — [Açıklama] — [Fiyat: ₺xxx]
3. ...

❓ SIK SORULAN SORULAR (SSS)
S: [Soru 1]
C: [Cevap 1]

S: [Soru 2]
C: [Cevap 2]

S: [Soru 3]
C: [Cevap 3]

🌍 DİLLER VE BÖLGELER
Hizmet dilleri: [Türkçe, İngilizce vb.]
Hizmet bölgeleri: [Türkiye, Avrupa, Ortadoğu vb.]

⚠️ ÖNEMLİ NOTLAR
- [Garanti koşulları, iade politikası, özel kurallar vb.]
- [Hangi konularda bilgi verilmemeli]
- [Özel kampanya veya indirimler]`)}
                                style={{ fontSize: '12px', padding: '6px 12px', gap: '4px' }}
                            >
                                <ClipboardList size={14} />
                                📋 Şablondan Başla
                            </button>
                        </div>
                        <textarea
                            className="input"
                            rows="16"
                            placeholder="Bilgi içeriğini buraya yazın. AI bu bilgileri müşterilere yanıt verirken kullanacak...

Örnek:
- Ürün bilgileri, fiyatlar
- Sık sorulan sorular ve cevapları
- Şirket politikaları
- Destek prosedürleri

💡 İpucu: Sağ üstteki 'Şablondan Başla' butonuna tıklayarak hazır yapıyı kullanabilirsiniz."
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

            {/* List Tab */}
            {activeTab === 'list' && (
                <>
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
                            📚 Toplam {knowledgeEntries.length} bilgi kaydı
                        </div>
                        <button
                            className="btn btn-retell-sync"
                            onClick={handleRetellSync}
                            disabled={syncingRetell || knowledgeEntries.length === 0}
                            title="Bilgi bankasını AI sesli asistana senkronize et"
                            style={{ margin: 0 }}
                        >
                            {syncingRetell ? <RefreshCw size={16} className="spinning" /> : <Phone size={16} />}
                            {syncingRetell ? 'Gönderiliyor...' : 'Sesli Asistana Sync Et'}
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
                                                {entry.sourceType === 'FILE' ? entry.fileType?.toUpperCase() : entry.sourceType === 'URL' ? '🌐 Web URL' : entry.sourceType === 'FEED' ? '🔗 Dinamik Feed' : 'Metin'} •
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
                                            {entry.sourceType === 'TEXT' && (
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
            </div> {/* base-content */}
        </div>
    );
};

export default KnowledgeBase;

