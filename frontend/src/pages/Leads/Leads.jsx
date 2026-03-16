import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { leadsAPI, facebookAPI } from '../../services/api';
import {
    Users,
    Search,
    Phone,
    Mail,
    Calendar,
    RefreshCw,
    Trash2,
    Facebook,
    TrendingUp,
    UserCheck,
    Clock,
    User,
    MapPin,
    FileText,
    Tag,
    MessageSquare,
    ExternalLink
} from 'lucide-react';
import './Leads.css';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';

// Lead durumu seçenekleri
const LEAD_STATUS_OPTIONS = [
    { value: 'NEW', label: 'Yeni', color: '#6b7280', bg: '#f3f4f6' },
    { value: 'CONTACTED', label: 'İletişime Geçildi', color: '#3b82f6', bg: '#eff6ff' },
    { value: 'QUALIFIED', label: 'Nitelikli', color: '#8b5cf6', bg: '#f5f3ff' },
    { value: 'CONVERTED', label: 'Dönüştürüldü', color: '#10b981', bg: '#ecfdf5' },
    { value: 'LOST', label: 'Kaybedildi', color: '#ef4444', bg: '#fef2f2' }
];

const getStatusInfo = (status) => {
    return LEAD_STATUS_OPTIONS.find(s => s.value === status) || LEAD_STATUS_OPTIONS[0];
};

const Leads = () => {
    const { currentWorkspace } = useAuth();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedLead, setSelectedLead] = useState(null);
    const [stats, setStats] = useState(null);
    const [pages, setPages] = useState([]);
    const [selectedPage, setSelectedPage] = useState('');
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    useEffect(() => {
        if (currentWorkspace) {
            loadLeads();
            loadStats();
            loadPages();
        }
    }, [currentWorkspace, statusFilter, selectedPage]);

    const loadLeads = async () => {
        try {
            setLoading(true);
            const params = {
                limit: 100,
                ...(statusFilter && { status: statusFilter }),
                ...(selectedPage && { pageId: selectedPage })
            };
            const response = await leadsAPI.getAll(currentWorkspace.id, params);
            setLeads(response.data.leads);
        } catch (error) {
            console.error('Error loading leads:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const response = await leadsAPI.getStats(currentWorkspace.id);
            setStats(response.data);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    const loadPages = async () => {
        try {
            const response = await facebookAPI.getPages(currentWorkspace.id);
            setPages(response.data.pages || []);
        } catch (error) {
            console.error('Error loading pages:', error);
        }
    };

    const handleSync = async () => {
        try {
            setSyncing(true);
            const response = await leadsAPI.sync(currentWorkspace.id, selectedPage || null);
            alert(`${response.data.synced} lead senkronize edildi!`);
            loadLeads();
            loadStats();
        } catch (error) {
            console.error('Error syncing leads:', error);
            alert('Lead senkronizasyonu başarısız: ' + (error.response?.data?.error || error.message));
        } finally {
            setSyncing(false);
        }
    };

    const handleStatusChange = async (leadId, newStatus) => {
        try {
            await leadsAPI.updateStatus(leadId, { status: newStatus });
            setLeads(leads.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
            if (selectedLead?.id === leadId) {
                setSelectedLead({ ...selectedLead, status: newStatus });
            }
            loadStats();
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Durum güncellenemedi');
        }
    };

    const handleDelete = async (leadId) => {
        setConfirmModal({
            isOpen: true,
            title: 'Lead Sil',
            message: 'Bu lead\'i silmek istediğinize emin misiniz?',
            confirmText: 'Evet, Sil',
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await leadsAPI.delete(leadId);
                    if (selectedLead?.id === leadId) {
                        setSelectedLead(null);
                    }
                    loadLeads();
                    loadStats();
                } catch (error) {
                    console.error('Error deleting lead:', error);
                    alert('Lead silinemedi');
                }
            }
        });
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatShortDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Dün';
        } else if (diffDays < 7) {
            return date.toLocaleDateString('tr-TR', { weekday: 'short' });
        } else {
            return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        }
    };

    const parseFieldData = (fieldDataStr) => {
        try {
            return JSON.parse(fieldDataStr);
        } catch {
            return {};
        }
    };

    const filteredLeads = leads.filter(lead => {
        if (!search) return true;
        const searchLower = search.toLowerCase();
        return (
            (lead.name || '').toLowerCase().includes(searchLower) ||
            (lead.email || '').toLowerCase().includes(searchLower) ||
            (lead.phone || '').toLowerCase().includes(searchLower)
        );
    });

    if (!currentWorkspace) {
        return (
            <div className="empty-state">
                <p>Lütfen bir workspace seçin</p>
            </div>
        );
    }

    return (
        <div className="leads-page">
            {/* Sol Panel - Lead Listesi */}
            <div className="leads-list-panel">
                <div className="leads-list-header">
                    <div className="leads-header-top">
                        <h2>
                            <Facebook size={20} className="header-icon" />
                            Leads
                        </h2>
                        <button
                            className="sync-btn-small"
                            onClick={handleSync}
                            disabled={syncing}
                            title="Lead'leri Senkronize Et"
                        >
                            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
                        </button>
                    </div>

                    {/* Stats */}
                    {stats && (
                        <div className="leads-stats-mini">
                            <div className="stat-mini">
                                <span className="stat-mini-value">{stats.total}</span>
                                <span className="stat-mini-label">Toplam</span>
                            </div>
                            {stats.byStatus?.slice(0, 3).map(s => (
                                <div className="stat-mini" key={s.status}>
                                    <span className="stat-mini-value" style={{ color: getStatusInfo(s.status).color }}>
                                        {s.count}
                                    </span>
                                    <span className="stat-mini-label">{getStatusInfo(s.status).label}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Search & Filters */}
                    <div className="leads-search-row">
                        <div className="leads-search-bar">
                            <Search className="search-icon" size={16} />
                            <input
                                type="search"
                                placeholder="Lead ara..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="leads-filter-row">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="leads-filter-select"
                        >
                            <option value="">Tüm Durumlar</option>
                            {LEAD_STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <select
                            value={selectedPage}
                            onChange={(e) => setSelectedPage(e.target.value)}
                            className="leads-filter-select"
                        >
                            <option value="">Tüm Sayfalar</option>
                            {pages.map(p => (
                                <option key={p.id} value={p.id}>{p.pageName}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Lead Items */}
                <div className="leads-items">
                    {loading ? (
                        <div className="leads-loading">
                            <div className="loader-small"></div>
                            <p>Yükleniyor...</p>
                        </div>
                    ) : filteredLeads.length === 0 ? (
                        <div className="leads-empty">
                            <Facebook size={32} className="empty-icon" />
                            <p>Lead bulunamadı</p>
                            <button className="btn-sync-empty" onClick={handleSync}>
                                <RefreshCw size={14} />
                                Senkronize Et
                            </button>
                        </div>
                    ) : (
                        filteredLeads.map((lead) => (
                            <div
                                key={lead.id}
                                className={`lead-item ${selectedLead?.id === lead.id ? 'active' : ''}`}
                                onClick={() => setSelectedLead(lead)}
                            >
                                <div className="lead-item-avatar">
                                    <User size={18} />
                                </div>
                                <div className="lead-item-content">
                                    <div className="lead-item-header">
                                        <span className="lead-item-name">{lead.name || 'İsimsiz Lead'}</span>
                                        <span className="lead-item-time">{formatShortDate(lead.createdAt)}</span>
                                    </div>
                                    <div className="lead-item-preview">
                                        {lead.phone || lead.email || 'İletişim bilgisi yok'}
                                    </div>
                                    <div className="lead-item-footer">
                                        <span
                                            className="lead-item-status"
                                            style={{
                                                backgroundColor: getStatusInfo(lead.status).bg,
                                                color: getStatusInfo(lead.status).color
                                            }}
                                        >
                                            {getStatusInfo(lead.status).label}
                                        </span>
                                        {lead.facebookPage?.pageName && (
                                            <span className="lead-item-page">
                                                <Facebook size={10} />
                                                {lead.facebookPage.pageName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Sağ Panel - Lead Detayı */}
            <div className="lead-detail-panel">
                {selectedLead ? (
                    <>
                        <div className="lead-detail-header">
                            <div className="lead-detail-info">
                                <div className="lead-detail-avatar">
                                    <User size={28} />
                                </div>
                                <div>
                                    <h3>{selectedLead.name || 'İsimsiz Lead'}</h3>
                                    <span className="lead-detail-date">
                                        <Calendar size={12} />
                                        {formatDate(selectedLead.createdAt)}
                                    </span>
                                </div>
                            </div>
                            <div className="lead-detail-actions">
                                <select
                                    className="status-select-detail"
                                    value={selectedLead.status}
                                    onChange={(e) => handleStatusChange(selectedLead.id, e.target.value)}
                                    style={{
                                        backgroundColor: getStatusInfo(selectedLead.status).bg,
                                        color: getStatusInfo(selectedLead.status).color,
                                        borderColor: getStatusInfo(selectedLead.status).color + '40'
                                    }}
                                >
                                    {LEAD_STATUS_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <button
                                    className="btn-icon-delete"
                                    onClick={() => handleDelete(selectedLead.id)}
                                    title="Sil"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="lead-detail-content">
                            {/* Contact Info */}
                            <div className="lead-detail-section">
                                <h4>
                                    <User size={16} />
                                    İletişim Bilgileri
                                </h4>
                                <div className="lead-detail-fields">
                                    {selectedLead.phone && (
                                        <div className="lead-field">
                                            <Phone size={14} className="field-icon" />
                                            <span className="field-label">Telefon</span>
                                            <a href={`tel:${selectedLead.phone}`} className="field-value link">
                                                {selectedLead.phone}
                                            </a>
                                        </div>
                                    )}
                                    {selectedLead.email && (
                                        <div className="lead-field">
                                            <Mail size={14} className="field-icon" />
                                            <span className="field-label">E-posta</span>
                                            <a href={`mailto:${selectedLead.email}`} className="field-value link">
                                                {selectedLead.email}
                                            </a>
                                        </div>
                                    )}
                                    {!selectedLead.phone && !selectedLead.email && (
                                        <p className="no-data">İletişim bilgisi yok</p>
                                    )}
                                </div>
                            </div>

                            {/* Campaign Info */}
                            <div className="lead-detail-section">
                                <h4>
                                    <TrendingUp size={16} />
                                    Kampanya Bilgisi
                                </h4>
                                <div className="lead-detail-fields">
                                    {selectedLead.campaignName && (
                                        <div className="lead-field">
                                            <Tag size={14} className="field-icon" />
                                            <span className="field-label">Kampanya</span>
                                            <span className="field-value">{selectedLead.campaignName}</span>
                                        </div>
                                    )}
                                    {selectedLead.adsetName && (
                                        <div className="lead-field">
                                            <Tag size={14} className="field-icon" />
                                            <span className="field-label">Ad Set</span>
                                            <span className="field-value">{selectedLead.adsetName}</span>
                                        </div>
                                    )}
                                    {selectedLead.adName && (
                                        <div className="lead-field">
                                            <Tag size={14} className="field-icon" />
                                            <span className="field-label">Reklam</span>
                                            <span className="field-value">{selectedLead.adName}</span>
                                        </div>
                                    )}
                                    {selectedLead.formName && (
                                        <div className="lead-field">
                                            <FileText size={14} className="field-icon" />
                                            <span className="field-label">Form</span>
                                            <span className="field-value">{selectedLead.formName}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Source */}
                            <div className="lead-detail-section">
                                <h4>
                                    <Facebook size={16} />
                                    Kaynak
                                </h4>
                                <div className="lead-detail-fields">
                                    {selectedLead.facebookPage && (
                                        <div className="lead-field">
                                            <Facebook size={14} className="field-icon" style={{ color: '#1877F2' }} />
                                            <span className="field-label">Sayfa</span>
                                            <span className="field-value">{selectedLead.facebookPage.pageName}</span>
                                        </div>
                                    )}
                                    <div className="lead-field">
                                        <Clock size={14} className="field-icon" />
                                        <span className="field-label">Geliş Tarihi</span>
                                        <span className="field-value">{formatDate(selectedLead.createdAt)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Additional Field Data */}
                            {selectedLead.fieldData && (() => {
                                const fields = parseFieldData(selectedLead.fieldData);
                                const extraFields = Object.entries(fields).filter(
                                    ([key]) => !['full_name', 'email', 'phone_number', 'phone'].includes(key)
                                );
                                if (extraFields.length === 0) return null;
                                return (
                                    <div className="lead-detail-section">
                                        <h4>
                                            <FileText size={16} />
                                            Ek Bilgiler
                                        </h4>
                                        <div className="lead-detail-fields">
                                            {extraFields.map(([key, value]) => (
                                                <div className="lead-field" key={key}>
                                                    <span className="field-label">{key.replace(/_/g, ' ')}</span>
                                                    <span className="field-value">{String(value)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </>
                ) : (
                    <div className="lead-detail-empty">
                        <UserCheck size={48} className="empty-icon" />
                        <h3>Lead Seçin</h3>
                        <p>Detayları görüntülemek için soldan bir lead seçin</p>
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
        </div>
    );
};

export default Leads;
