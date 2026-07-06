import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI, knowledgeBaseAPI, retellAPI, productAPI } from '../../services/api';
import { Trash2, Database, FileText, Upload, Plus, File, Building2, Image, Pencil, X, Globe, RefreshCw, Link, Phone, ClipboardList, CheckCircle2, AlertTriangle, FileCheck, Package, Check } from 'lucide-react';
import './KnowledgeBase.css';

const KnowledgeBase = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('company');

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

    // Product KB Integration States
    const [productKbEnabled, setProductKbEnabled] = useState(false);
    const [productKbGroups, setProductKbGroups] = useState([]); // available groups
    const [productKbSelectedGroups, setProductKbSelectedGroups] = useState([]); // 'ALL' or array of group names
    const [productKbIncludePrice, setProductKbIncludePrice] = useState(false);
    const [productKbSaving, setProductKbSaving] = useState(false);
    const [productKbSynced, setProductKbSynced] = useState(false);

    useEffect(() => {
        if (currentWorkspace) {
            loadKnowledgeBase();
            loadCompanyInfo();
            loadProductKbSettings();
            loadProductGroups();
        }
    }, [currentWorkspace]);

    const loadProductGroups = async () => {
        try {
            const res = await productAPI.getGroups(currentWorkspace.id);
            setProductKbGroups((res.data.groups || []).map(g => g.groupName).filter(Boolean));
        } catch (err) {
            console.error('Error loading product groups:', err);
        }
    };

    const loadProductKbSettings = async () => {
        try {
            // Load saved product KB settings from knowledge base (stored as a special entry)
            const response = await knowledgeBaseAPI.getAll(currentWorkspace.id);
            const entries = response.data.entries || [];
            const productEntry = entries.find(e => e.sourceType === 'PRODUCT_CATALOG');
            if (productEntry) {
                setProductKbEnabled(true);
                try {
                    const meta = JSON.parse(productEntry.title || '{}');
                    setProductKbIncludePrice(meta.includePrice || false);
                    setProductKbSelectedGroups(meta.selectedGroups || []);
                } catch { }
            }
        } catch (err) {
            console.error('Error loading product KB settings:', err);
        }
    };

    const handleSaveProductKb = async () => {
        setProductKbSaving(true);
        setProductKbSynced(false);
        try {
            // First delete existing product catalog entries
            const response = await knowledgeBaseAPI.getAll(currentWorkspace.id);
            const entries = response.data.entries || [];
            const existingProductEntries = entries.filter(e => e.sourceType === 'PRODUCT_CATALOG');
            for (const entry of existingProductEntries) {
                await knowledgeBaseAPI.delete(currentWorkspace.id, entry.id);
            }

            if (productKbEnabled) {
                // Fetch products based on group selection
                const params = { limit: 9999 };
                const res = await productAPI.getAll(currentWorkspace.id, params);
                let products = res.data.products || [];

                // Filter by selected groups
                if (productKbSelectedGroups.length > 0) {
                    products = products.filter(p => productKbSelectedGroups.includes(p.groupName));
                }

                // Build content text
                let content = '=== ÜRÜN VE HİZMET KATALOĞU ===\n\n';
                if (products.length === 0) {
                    content += 'Henüz ürün/hizmet eklenmemiş.\n';
                } else {
                    for (const p of products) {
                        content += `Ürün: ${p.name}\n`;
                        if (p.description) content += `Açıklama: ${p.description}\n`;
                        if (p.groupName) content += `Grup: ${p.groupName}\n`;
                        if (p.unit) content += `Birim: ${p.unit}\n`;
                        if (productKbIncludePrice) {
                            content += `Fiyat: ${p.price ? p.price.toLocaleString('tr-TR') + ' ₺' : 'Belirtilmemiş'}\n`;
                            if (p.discountedPrice) content += `İndirimli Fiyat: ${p.discountedPrice.toLocaleString('tr-TR')} ₺\n`;
                            if (p.priceUSD) content += `USD Fiyat: $${p.priceUSD}\n`;
                            if (p.priceEUR) content += `EUR Fiyat: €${p.priceEUR}\n`;
                        }
                        content += '\n---\n\n';
                    }
                }

                // Save as a KB entry with sourceType PRODUCT_CATALOG
                const meta = JSON.stringify({
                    includePrice: productKbIncludePrice,
                    selectedGroups: productKbSelectedGroups,
                    productCount: products.length
                });

                await knowledgeBaseAPI.create(currentWorkspace.id, {
                    title: meta,
                    content: content,
                    sourceType: 'PRODUCT_CATALOG'
                });

                setProductKbSynced(true);
                setTimeout(() => setProductKbSynced(false), 5000);
            }

            loadKnowledgeBase();
        } catch (err) {
            console.error('Error saving product KB:', err);
        } finally {
            setProductKbSaving(false);
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
        <div className="knowledge-base-page">
            <div className="page-header">
                <div>
                    <h1>Knowledge Base</h1>
                    <p className="text-muted">{t('knowledgeBase.description')}</p>
                </div>
                <button
                    className="btn btn-retell-sync"
                    onClick={handleRetellSync}
                    disabled={syncingRetell || knowledgeEntries.length === 0}
                    title="Bilgi bankasını AI sesli asistana senkronize et"
                >
                    {syncingRetell ? <RefreshCw size={16} className="spinning" /> : <Phone size={16} />}
                    {syncingRetell ? 'Gönderiliyor...' : 'Sesli Asistana Sync Et'}
                </button>
            </div>

            {/* Tabs */}
            <div className="kb-tabs">
                <button
                    className={`kb-tab ${activeTab === 'company' ? 'active' : ''}`}
                    onClick={() => setActiveTab('company')}
                >
                    <Building2 size={16} />
                    Şirket Bilgileri
                </button>
                <button
                    className={`kb-tab ${activeTab === 'text' ? 'active' : ''}`}
                    onClick={() => setActiveTab('text')}
                >
                    <FileText size={16} />
                    Metin Ekle
                </button>
                <button
                    className={`kb-tab ${activeTab === 'files' ? 'active' : ''}`}
                    onClick={() => setActiveTab('files')}
                >
                    <Upload size={16} />
                    Dosya Yükle
                </button>
                <button
                    className={`kb-tab ${activeTab === 'url' ? 'active' : ''}`}
                    onClick={() => setActiveTab('url')}
                >
                    <Globe size={16} />
                    Web Sayfası Tara
                </button>
                <button
                    className={`kb-tab ${activeTab === 'feed' ? 'active' : ''}`}
                    onClick={() => setActiveTab('feed')}
                >
                    <Link size={16} />
                    Dinamik Feed
                </button>
                <button
                    className={`kb-tab ${activeTab === 'list' ? 'active' : ''}`}
                    onClick={() => setActiveTab('list')}
                >
                    <Database size={16} />
                    Tüm Bilgiler ({knowledgeEntries.length})
                </button>
                <button
                    className={`kb-tab ${activeTab === 'products' ? 'active' : ''}`}
                    onClick={() => setActiveTab('products')}
                >
                    <Package size={16} />
                    Ürünler
                </button>
            </div>

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

            {/* Products Integration Tab */}
            {activeTab === 'products' && (
                <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <Package size={24} style={{ color: '#6366f1' }} />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Ürün Kataloğu Entegrasyonu</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>AI asistanınızın ürün/hizmet bilgilerini kullanmasını sağlayın.</p>
                        </div>
                    </div>

                    {/* Enable Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: productKbEnabled ? '#f0fdf4' : '#f8fafc', borderRadius: '10px', border: `1px solid ${productKbEnabled ? '#bbf7d0' : '#e2e8f0'}`, marginBottom: '16px' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e293b' }}>Ürün bilgilerini AI’a aktar</div>
                            <div style={{ fontSize: '0.76rem', color: '#64748b' }}>Açık olduğunda AI asistan müşterilere ürünler hakkında bilgi verebilir.</div>
                        </div>
                        <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={productKbEnabled} onChange={(e) => setProductKbEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                            <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: productKbEnabled ? '#22c55e' : '#cbd5e1', borderRadius: '12px', transition: 'all 0.3s' }}>
                                <span style={{ position: 'absolute', left: productKbEnabled ? '22px' : '2px', top: '2px', width: '20px', height: '20px', background: '#fff', borderRadius: '50%', transition: 'all 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                            </span>
                        </label>
                    </div>

                    {productKbEnabled && (
                        <>
                            {/* Info Level */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Hangi bilgiler eklensin?</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => setProductKbIncludePrice(false)}
                                        style={{
                                            flex: 1, padding: '10px 14px', borderRadius: '8px',
                                            border: `2px solid ${!productKbIncludePrice ? '#6366f1' : '#e2e8f0'}`,
                                            background: !productKbIncludePrice ? '#eef2ff' : '#fff',
                                            fontSize: '0.82rem', fontWeight: 600,
                                            color: !productKbIncludePrice ? '#4f46e5' : '#64748b',
                                            cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left'
                                        }}
                                    >
                                        <div>📦 Sadece Ürün Bilgileri</div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 400, marginTop: '2px' }}>Ad, açıklama, birim, grup</div>
                                    </button>
                                    <button
                                        onClick={() => setProductKbIncludePrice(true)}
                                        style={{
                                            flex: 1, padding: '10px 14px', borderRadius: '8px',
                                            border: `2px solid ${productKbIncludePrice ? '#6366f1' : '#e2e8f0'}`,
                                            background: productKbIncludePrice ? '#eef2ff' : '#fff',
                                            fontSize: '0.82rem', fontWeight: 600,
                                            color: productKbIncludePrice ? '#4f46e5' : '#64748b',
                                            cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left'
                                        }}
                                    >
                                        <div>💰 Ürün + Fiyat Bilgileri</div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 400, marginTop: '2px' }}>Ad, açıklama, birim, grup, fiyat, indirimli fiyat</div>
                                    </button>
                                </div>
                            </div>

                            {/* Group Selection */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Hangi ürün grupları dahil edilsin?</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    <button
                                        onClick={() => setProductKbSelectedGroups([])}
                                        style={{
                                            padding: '6px 12px', borderRadius: '6px',
                                            border: `1.5px solid ${productKbSelectedGroups.length === 0 ? '#6366f1' : '#e2e8f0'}`,
                                            background: productKbSelectedGroups.length === 0 ? '#eef2ff' : '#fff',
                                            fontSize: '0.78rem', fontWeight: 600,
                                            color: productKbSelectedGroups.length === 0 ? '#4f46e5' : '#64748b',
                                            cursor: 'pointer', transition: 'all 0.15s'
                                        }}
                                    >
                                        {productKbSelectedGroups.length === 0 && <Check size={13} style={{ marginRight: '4px' }} />}
                                        Tümü
                                    </button>
                                    {productKbGroups.map(g => {
                                        const isSelected = productKbSelectedGroups.includes(g);
                                        return (
                                            <button
                                                key={g}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setProductKbSelectedGroups(prev => prev.filter(x => x !== g));
                                                    } else {
                                                        setProductKbSelectedGroups(prev => [...prev, g]);
                                                    }
                                                }}
                                                style={{
                                                    padding: '6px 12px', borderRadius: '6px',
                                                    border: `1.5px solid ${isSelected ? '#8b5cf6' : '#e2e8f0'}`,
                                                    background: isSelected ? '#ede9fe' : '#fff',
                                                    fontSize: '0.78rem', fontWeight: 600,
                                                    color: isSelected ? '#7c3aed' : '#64748b',
                                                    cursor: 'pointer', transition: 'all 0.15s'
                                                }}
                                            >
                                                {isSelected && <Check size={13} style={{ marginRight: '4px' }} />}
                                                {g}
                                            </button>
                                        );
                                    })}
                                    {productKbGroups.length === 0 && (
                                        <span style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '6px 0' }}>Henüz ürün grubu tanımlanmamış.</span>
                                    )}
                                </div>
                            </div>

                            {/* Save Button */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button
                                    onClick={handleSaveProductKb}
                                    disabled={productKbSaving}
                                    style={{
                                        padding: '10px 22px', borderRadius: '8px',
                                        border: 'none', background: productKbSaving ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        fontSize: '0.85rem', fontWeight: 600, color: '#fff',
                                        cursor: productKbSaving ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                                        display: 'inline-flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    <RefreshCw size={15} style={{ animation: productKbSaving ? 'spin 1s linear infinite' : 'none' }} />
                                    {productKbSaving ? 'Kaydediliyor...' : 'Kaydet ve Senkronize Et'}
                                </button>
                                {productKbSynced && (
                                    <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <CheckCircle2 size={16} /> Ürünler bilgi bankasına eklendi!
                                    </span>
                                )}
                            </div>
                        </>
                    )}

                    {/* If disabled, show save to remove */}
                    {!productKbEnabled && (
                        <button
                            onClick={handleSaveProductKb}
                            disabled={productKbSaving}
                            style={{
                                padding: '8px 16px', borderRadius: '8px',
                                border: '1px solid #e2e8f0', background: '#fff',
                                fontSize: '0.82rem', fontWeight: 600, color: '#64748b',
                                cursor: 'pointer'
                            }}
                        >
                            Kaydet
                        </button>
                    )}
                </div>
            )}

            {/* List Tab */}
            {activeTab === 'list' && (
                <>
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
        </div>
    );
};

export default KnowledgeBase;

