import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getCaseTypes, createCaseType, updateCaseType, deleteCaseType } from '../../services/caseType.api';
import { funnelAPI } from '../../services/api';
import { Plus, Search, Check, Trash2, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import './CaseTypesAndTopics.css';

const QUICK_EMOJIS = ['💰', '🤝', '💼', '🛠️', '⚠️', '🔄', '📅', '📁', '🎯', '⭐', '💬', '📦'];
const QUICK_COLORS = ['#eab308', '#3b82f6', '#10b981', '#dc2626', '#6d28d9', '#f97316', '#06b6d4', '#6b7280'];

const CaseTypesAndTopics = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [caseTypes, setCaseTypes] = useState([]);
    const [funnels, setFunnels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchFilter, setSearchFilter] = useState('');
    
    // Selection & Form State
    const [selectedId, setSelectedId] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        color: '#3b82f6',
        icon: '📋',
        funnelId: '',
        isActive: true
    });

    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    useEffect(() => {
        if (workspaceId) {
            fetchData();
        }
    }, [workspaceId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [typesRes, funnelsRes] = await Promise.all([
                getCaseTypes(workspaceId),
                funnelAPI.getAll(workspaceId).catch(() => ({ data: { funnels: [] } }))
            ]);

            const loadedTypes = typesRes.data || [];
            const loadedFunnels = funnelsRes.data?.funnels || funnelsRes.data || [];

            setCaseTypes(loadedTypes);
            setFunnels(loadedFunnels);

            if (loadedTypes.length > 0 && !selectedId && !isCreating) {
                selectItem(loadedTypes[0]);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching case types / funnels:', error);
            setLoading(false);
        }
    };

    const selectItem = (ct) => {
        setIsCreating(false);
        setSelectedId(ct.id);
        setFormData({
            id: ct.id,
            name: ct.name || '',
            systemCode: ct.systemCode || null,
            color: ct.color || '#3b82f6',
            icon: ct.icon || '📋',
            funnelId: ct.funnelId || '',
            isActive: ct.isActive ?? true
        });
        setSuccessMessage(null);
        setErrorMessage(null);
    };

    const startCreateNew = () => {
        setIsCreating(true);
        setSelectedId(null);
        setFormData({
            name: '',
            color: '#3b82f6',
            icon: '📋',
            funnelId: funnels[0]?.id || '',
            isActive: true
        });
        setSuccessMessage(null);
        setErrorMessage(null);
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!formData.name?.trim()) {
            setErrorMessage('Vaka tipi adı zorunludur');
            return;
        }

        try {
            setIsSaving(true);
            setErrorMessage(null);

            if (isCreating) {
                const res = await createCaseType(workspaceId, {
                    name: formData.name.trim(),
                    color: formData.color,
                    icon: formData.icon,
                    funnelId: formData.funnelId || null,
                    isActive: formData.isActive
                });

                const created = res.data;
                const updatedList = [...caseTypes, created];
                setCaseTypes(updatedList);
                selectItem(created);
                showToast('✅ Yeni vaka tipi başarıyla oluşturuldu!');
            } else {
                const res = await updateCaseType(workspaceId, formData.id, {
                    name: formData.name.trim(),
                    color: formData.color,
                    icon: formData.icon,
                    funnelId: formData.funnelId || null,
                    isActive: formData.isActive
                });

                const updated = res.data;
                const updatedList = caseTypes.map(c => c.id === updated.id ? updated : c);
                setCaseTypes(updatedList);
                selectItem(updated);
                showToast('✅ Değişiklikler kaydedildi!');
            }
        } catch (err) {
            console.error('Save error:', err);
            setErrorMessage(err.response?.data?.message || 'Kaydetme sırasında bir hata oluştu');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        const target = caseTypes.find(c => c.id === id);
        if (!target) return;

        if (target.systemCode) {
            alert('Sistem tanımlı varsayılan vaka tipleri silinemez.');
            return;
        }

        if (!window.confirm(`"${target.name}" vaka tipini silmek istediğinize emin misiniz?`)) {
            return;
        }

        try {
            await deleteCaseType(workspaceId, id);
            const remaining = caseTypes.filter(c => c.id !== id);
            setCaseTypes(remaining);
            if (remaining.length > 0) {
                selectItem(remaining[0]);
            } else {
                startCreateNew();
            }
            showToast('🗑️ Vaka tipi silindi');
        } catch (err) {
            console.error('Delete error:', err);
            alert('Silinirken hata oluştu');
        }
    };

    const showToast = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    // Filtered case types for the sidebar search
    const filteredTypes = caseTypes.filter(ct => {
        const query = searchFilter.trim().toLocaleLowerCase('tr-TR');
        if (!query) return true;
        const nameMatch = ct.name?.toLocaleLowerCase('tr-TR').includes(query);
        const codeMatch = ct.systemCode?.toLocaleLowerCase('tr-TR').includes(query);
        const funnelMatch = funnels.find(f => f.id === ct.funnelId)?.name?.toLocaleLowerCase('tr-TR').includes(query);
        return nameMatch || codeMatch || funnelMatch;
    });

    if (loading) {
        return <div className="ct-loading-box">Vaka Tipleri ve Akışlar yükleniyor...</div>;
    }

    const currentAssignedFunnel = funnels.find(f => f.id === formData.funnelId);

    return (
        <div className="case-types-container">
            {/* SOL PANEL: Vaka Tipleri Listesi */}
            <div className="case-types-sidebar">
                <div className="ct-sidebar-header">
                    <div>
                        <h2>Vaka Tipleri</h2>
                        <span className="ct-header-count">{caseTypes.length} tip tanımlı</span>
                    </div>
                    <button 
                        onClick={startCreateNew} 
                        className={`btn-add-primary ${isCreating ? 'active' : ''}`}
                        title="Yeni Vaka Tipi Ekle"
                    >
                        <Plus size={16} />
                        <span>Yeni</span>
                    </button>
                </div>

                {/* Arama Alanı */}
                <div className="ct-search-box">
                    <Search size={14} className="ct-search-icon" />
                    <input 
                        type="text" 
                        placeholder="Vaka tipi veya akış ara..." 
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                        className="ct-search-input"
                    />
                </div>

                {/* Liste */}
                <div className="ct-list">
                    {filteredTypes.map(ct => {
                        const assignedFunnel = funnels.find(f => f.id === ct.funnelId) || ct.funnel;
                        const isSelected = !isCreating && selectedId === ct.id;

                        return (
                            <div 
                                key={ct.id} 
                                onClick={() => selectItem(ct)}
                                className={`ct-item ${isSelected ? 'active' : ''}`}
                            >
                                <div className="ct-item-content">
                                    <span className="ct-icon-badge" style={{ backgroundColor: ct.color || '#3b82f6' }}>
                                        {ct.icon || '📋'}
                                    </span>
                                    <div className="ct-item-info">
                                        <div className="ct-title-row">
                                            <span className="ct-title">{ct.name}</span>
                                            {ct.systemCode && (
                                                <span className="ct-system-tag">Sistem</span>
                                            )}
                                        </div>
                                        <div className="ct-meta-row">
                                            {assignedFunnel ? (
                                                <span className="ct-funnel-badge">
                                                    <span className="ct-funnel-icon">{assignedFunnel.icon || '📁'}</span>
                                                    <span className="ct-funnel-name">{assignedFunnel.name}</span>
                                                </span>
                                            ) : (
                                                <span className="ct-funnel-none">Akış atanmadı</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {filteredTypes.length === 0 && (
                        <div className="ct-empty-search">
                            {searchFilter ? 'Aramaya uygun vaka tipi bulunamadı.' : 'Henüz vaka tipi tanımlanmamış.'}
                        </div>
                    )}
                </div>
            </div>

            {/* SAĞ PANEL: Detay & Düzenleme */}
            <div className="ct-main-content">
                <div className="ct-edit-panel">
                    {/* Panel Başlığı */}
                    <div className="ct-panel-header">
                        <div className="ct-panel-header-left">
                            <span className="ct-header-icon-badge" style={{ backgroundColor: formData.color || '#3b82f6' }}>
                                {formData.icon || '📋'}
                            </span>
                            <div>
                                <h3>{isCreating ? 'Yeni Vaka Tipi Oluştur' : formData.name || 'Vaka Tipi'}</h3>
                                <p className="ct-header-sub">
                                    {isCreating 
                                        ? 'Yeni bir form veya talep kategorisi tanımlayın ve bunu bir Akışa bağlayın' 
                                        : 'Bu vaka tipinin adını, bağlı olduğu akışı ve görünümünü yapılandırın'}
                                </p>
                            </div>
                        </div>

                        {!isCreating && !formData.systemCode && (
                            <button 
                                onClick={() => handleDelete(formData.id)} 
                                className="btn-delete-case-type"
                                title="Bu vaka tipini sil"
                            >
                                <Trash2 size={16} />
                                <span>Sil</span>
                            </button>
                        )}
                    </div>

                    {/* Toast & Hata Bildirimleri */}
                    {successMessage && (
                        <div className="ct-alert success">
                            <Check size={16} />
                            <span>{successMessage}</span>
                        </div>
                    )}
                    {errorMessage && (
                        <div className="ct-alert error">
                            <AlertCircle size={16} />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Form Alanları */}
                    <form onSubmit={handleSave} className="ct-form-body">
                        {/* 1. Vaka Tipi Adı */}
                        <div className="ct-form-group">
                            <label className="ct-label">
                                Vaka Tipi Adı <span className="req">*</span>
                            </label>
                            <input 
                                type="text" 
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Örn: Fırsat, İptal - İade, İş Ortaklığı..."
                                className="ct-input-primary"
                                required
                            />
                            <span className="ct-hint">Müşteri taleplerinde ve CRM formlarında görünecek isim.</span>
                        </div>

                        {/* 2. Bağlı Akış (Pipeline) */}
                        <div className="ct-form-group ct-highlight-group">
                            <label className="ct-label">
                                🔗 Bağlı Olduğu Varsayılan Akış (Funnel)
                            </label>
                            <div className="ct-funnel-select-wrapper">
                                <select
                                    value={formData.funnelId || ''}
                                    onChange={e => setFormData({ ...formData, funnelId: e.target.value })}
                                    className="ct-select-primary"
                                >
                                    <option value="">-- Akış Seçilmedi (Genel Varsayılan) --</option>
                                    {funnels.map(f => (
                                        <option key={f.id} value={f.id}>
                                            {f.icon || '📁'} {f.name} {f.isDefault ? '⭐ (Varsayılan)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <span className="ct-hint">
                                💡 <strong>Otomasyon:</strong> Bu tipte bir form doldurulduğunda veya WhatsApp/sohbet üzerinden talep geldiğinde, vaka otomatik olarak bu Akışa düşer.
                            </span>
                        </div>

                        {/* 3. İkon Seçimi & Popüler Emojiler */}
                        <div className="ct-form-group">
                            <label className="ct-label">İkon (Emoji)</label>
                            <div className="ct-emoji-selector-row">
                                <input 
                                    type="text" 
                                    value={formData.icon}
                                    onChange={e => setFormData({ ...formData, icon: e.target.value })}
                                    className="ct-input-emoji"
                                    maxLength={4}
                                />
                                <div className="ct-quick-emojis">
                                    {QUICK_EMOJIS.map(em => (
                                        <button
                                            key={em}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, icon: em })}
                                            className={`btn-emoji-choice ${formData.icon === em ? 'active' : ''}`}
                                        >
                                            {em}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 4. Renk Seçimi */}
                        <div className="ct-form-group">
                            <label className="ct-label">Renk</label>
                            <div className="ct-color-selector-row">
                                <input 
                                    type="color" 
                                    value={formData.color || '#3b82f6'}
                                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                                    className="ct-color-picker"
                                />
                                <div className="ct-quick-colors">
                                    {QUICK_COLORS.map(col => (
                                        <button
                                            key={col}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, color: col })}
                                            className={`btn-color-choice ${formData.color === col ? 'active' : ''}`}
                                            style={{ backgroundColor: col }}
                                        />
                                    ))}
                                </div>
                                <span className="ct-color-hex">{formData.color}</span>
                            </div>
                        </div>

                        {/* 5. Canlı Önizleme */}
                        <div className="ct-preview-card">
                            <span className="ct-preview-label">CRM Kartı Önizlemesi</span>
                            <div className="ct-preview-badge" style={{ borderColor: formData.color, backgroundColor: `${formData.color}15` }}>
                                <span className="ct-preview-icon">{formData.icon}</span>
                                <span className="ct-preview-name" style={{ color: formData.color }}>{formData.name || 'Örnek Vaka Tipi'}</span>
                                {currentAssignedFunnel && (
                                    <span className="ct-preview-target">
                                        <ArrowRight size={12} />
                                        <span>{currentAssignedFunnel.icon || '📁'} {currentAssignedFunnel.name}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* 6. Aksiyon Butonları */}
                        <div className="ct-form-actions">
                            <button 
                                type="submit" 
                                className="btn-save-case-type"
                                disabled={isSaving}
                            >
                                <Check size={16} />
                                <span>{isSaving ? 'Kaydediliyor...' : (isCreating ? 'Vaka Tipini Oluştur' : 'Değişiklikleri Kaydet')}</span>
                            </button>
                            {isCreating && (
                                <button 
                                    type="button" 
                                    onClick={() => caseTypes.length > 0 ? selectItem(caseTypes[0]) : null}
                                    className="btn-cancel-case-type"
                                >
                                    İptal
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CaseTypesAndTopics;
