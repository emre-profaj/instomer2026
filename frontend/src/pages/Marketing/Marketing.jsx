
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
    Megaphone, Folder, MessageSquare, Users, Plus, Edit2, Trash2, Send,
    BarChart2, Phone, Mail, Play, CheckCircle, XCircle, Search, Settings, ArrowRight, ChevronRight, ChevronDown,
    Loader2, Sparkles, RefreshCw
} from 'lucide-react';
import CampaignWizardModal from './CampaignWizardModal';
import './Marketing.css';
import '../KnowledgeBase/KnowledgeBase.css';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILS & COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_COLORS = [
    '#2563eb','#16a34a','#dc2626','#ca8a04','#7c3aed',
    '#0891b2','#db2777','#ea580c','#65a30d','#475569'
];

function StatBig({ icon, label, value, color, sub }) {
    return (
        <div className="mkt-stat-card">
            <div className="mkt-stat-icon" style={{ background: color + '1a', color }}>{icon}</div>
            <div>
                <div className="mkt-stat-value" style={{ color }}>{value} {sub && <small style={{ fontSize: 13, color: '#9ca3af' }}>{sub}</small>}</div>
                <div className="mkt-stat-label">{label}</div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: KAMPANYALAR (CAMPAIGNS)
// ─────────────────────────────────────────────────────────────────────────────

function CampaignFormModal({ initial, onSave, onClose }) {
    const [name, setName] = useState(initial?.name || '');
    const [description, setDescription] = useState(initial?.description || '');
    const [budget, setBudget] = useState(initial?.budget || '');
    const [startDate, setStartDate] = useState(initial?.startDate ? initial.startDate.split('T')[0] : '');
    const [endDate, setEndDate] = useState(initial?.endDate ? initial.endDate.split('T')[0] : '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return alert('Kampanya adı zorunlu');
        setSaving(true);
        await onSave({ name, description, budget: Number(budget), startDate, endDate });
        setSaving(false);
    };

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="grp-form-modal" onClick={e => e.stopPropagation()}>
                <div className="grp-modal-header">
                    <h2 className="grp-modal-title">{initial ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'}</h2>
                    <button className="grp-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="grp-modal-body">
                    <div className="grp-field">
                        <label className="grp-label">Kampanya Adı</label>
                        <input className="grp-input" value={name} onChange={e => setName(e.target.value)} placeholder="örn. Kış İndirimi" />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Açıklama</label>
                        <input className="grp-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Açıklama" />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Bütçe (TL)</label>
                        <input className="grp-input" type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="grp-field" style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <label className="grp-label">Başlangıç</label>
                            <input className="grp-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="grp-label">Bitiş</label>
                            <input className="grp-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                    </div>
                </div>
                <div className="grp-modal-footer">
                    <button className="grp-btn-cancel" onClick={onClose}>İptal</button>
                    <button className="grp-btn-save" style={{ background: '#2563eb' }} onClick={handleSave} disabled={saving || !name}>
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function CampaignsTab({ wsId, onGoToGroups }) {
    const [campaigns, setCampaigns] = useState([]);
    const [stats, setStats] = useState({ total: 0, active: 0, sent: 0, delivered: 0, read: 0 });
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [syncingPast, setSyncingPast] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [campaignTypeFilter, setCampaignTypeFilter] = useState('ALL'); // 'ALL' | 'MARKETING' | 'AUTOMATION'

    const fetchCampaigns = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/marketing-v2/${wsId}/campaigns`);
            setCampaigns(res.data.campaigns || []);
            setStats(res.data.stats || { total: 0, active: 0, sent: 0, delivered: 0, read: 0 });
        } catch (e) {
            console.error(e);
            setCampaigns([]);
        }
        setLoading(false);
    }, [wsId]);

    useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

    const handleSyncPastData = async () => {
        if (!window.confirm('Sistemdeki tüm geçmiş Meta WhatsApp şablonları ve Retell AI sesli aramaları taranarak "Genel & Geçmiş Gönderimler (Arşiv)" kampanyası altında toplanacaktır.\n\nDevam etmek istiyor musunuz?')) return;
        setSyncingPast(true);
        try {
            const res = await api.post(`/marketing-v2/${wsId}/sync-past-data`);
            if (res.data?.success) {
                const s = res.data.synced;
                alert(`✅ Geçmiş Veriler Eşitlendi!\n\n• WhatsApp Şablonları: ${s?.whatsappCount || 0} adet (Teslim: ${s?.whatsappDelivered || 0}, Okunan: ${s?.whatsappRead || 0})\n• Retell AI Aramaları: ${s?.retellCallsCount || 0} adet (Başarılı: ${s?.retellCallsSuccessful || 0})\n\nRaporlar ve üst istatistik çubuğu güncellendi.`);
                fetchCampaigns();
            }
        } catch (err) {
            alert('Senkronizasyon hatası: ' + (err.response?.data?.error || err.message));
        } finally {
            setSyncingPast(false);
        }
    };

    const handleSave = async (data) => {
        try {
            if (editItem) {
                await api.put(`/marketing-v2/${wsId}/campaigns/${editItem.id}`, data);
            } else {
                await api.post(`/marketing-v2/${wsId}/campaigns`, data);
            }
            setShowForm(false);
            setEditItem(null);
            fetchCampaigns();
        } catch (e) {
            alert('Hata: ' + (e.response?.data?.error || e.message));
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu kampanyayı silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/marketing-v2/${wsId}/campaigns/${id}`);
            fetchCampaigns();
        } catch (e) {
            alert('Silinemedi: ' + (e.response?.data?.error || e.message));
        }
    };

    const filteredCampaigns = campaigns.filter(c => {
        if (campaignTypeFilter === 'MARKETING') return !c.isAutomation;
        if (campaignTypeFilter === 'AUTOMATION') return c.isAutomation;
        return true;
    });

    return (
        <div className="mkt-analytics-wrap">
            <div className="mkt-stats-row">
                <StatBig icon={<Megaphone size={20}/>} label="Toplam Kampanya" value={stats.total} color="#2563eb" />
                <StatBig icon={<Play size={20}/>} label="Aktif" value={stats.active} color="#16a34a" />
                <StatBig icon={<Send size={20}/>} label="Gönderilen / Arama" value={stats.sent} color="#8b5cf6" />
                <StatBig icon={<CheckCircle size={20}/>} label="Teslim / Okunan" value={`${stats.delivered} / ${stats.read}`} color="#f59e0b" />
            </div>
            <div className="mkt-analytics-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                        className={`mkt-filter-tab ${campaignTypeFilter === 'MARKETING' ? 'active' : ''}`}
                        onClick={() => setCampaignTypeFilter('MARKETING')}
                    >
                        📢 Pazarlama ({campaigns.filter(c => !c.isAutomation).length})
                    </button>
                    <button
                        className={`mkt-filter-tab ${campaignTypeFilter === 'AUTOMATION' ? 'active' : ''}`}
                        onClick={() => setCampaignTypeFilter('AUTOMATION')}
                    >
                        🤖 Otomasyon Logları ({campaigns.filter(c => c.isAutomation).length})
                    </button>
                    <button
                        className={`mkt-filter-tab ${campaignTypeFilter === 'ALL' ? 'active' : ''}`}
                        onClick={() => setCampaignTypeFilter('ALL')}
                    >
                        Tümü ({campaigns.length})
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                        className="mkt-btn-outline"
                        onClick={handleSyncPastData}
                        disabled={syncingPast}
                        title="Geçmiş WhatsApp şablonlarını ve Retell aramalarını arşive bağlar"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 14px',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            border: '1.5px solid #d1d5db',
                            background: '#fff',
                            color: '#374151',
                            cursor: syncingPast ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {syncingPast ? <Loader2 size={15} className="mkt-spin" /> : <RefreshCw size={15} />}
                        <span>{syncingPast ? 'Eşitleniyor...' : 'Geçmiş Verileri Eşitle (Meta & Retell)'}</span>
                    </button>
                    <button
                        className="mkt-btn-primary"
                        onClick={() => setShowWizard(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <Sparkles size={16} />
                        <span>+ Yeni Kampanya</span>
                    </button>
                </div>
            </div>
            
            <div className="mkt-table-wrap" style={{ padding: 20 }}>
                {loading ? <div className="mkt-loading">Yükleniyor...</div> : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                        {filteredCampaigns.map(c => (
                            <div
                                key={c.id}
                                style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20, cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                                onClick={() => {
                                    if (c.isAutomation) {
                                        alert(`Bu kayıt 'Karşılama' otomasyonu tarafından oluşturulan günlük rapordur.\n\nGönderilen: ${c.sentCount || 0} adet.`);
                                    } else if (c.isLegacy) {
                                        alert(`Eski Kampanya Mesajları:\n${c.messagesLegacy?.map(m=>m.name || 'İsimsiz').join(', ') || 'Mesaj yok'}`);
                                    } else {
                                        onGoToGroups(c.id);
                                    }
                                }}
                                onMouseOver={e => e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)'}
                                onMouseOut={e => e.currentTarget.style.boxShadow='none'}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <div style={{ fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        {c.name}
                                        {c.isArchive && <span style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>🏛️ Arşiv</span>}
                                        {c.isAutomation && <span style={{ fontSize: 11, background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>🤖 Otomasyon</span>}
                                        {c.isLegacy && <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>📦 Eski</span>}
                                    </div>
                                    <span style={{ padding: '4px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: c.status === 'ACTIVE' ? '#dcfce7' : '#f3f4f6', color: c.status === 'ACTIVE' ? '#166534' : '#4b5563' }}>
                                        {c.status}
                                    </span>
                                </div>
                                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>{c.description || (c.isAutomation ? 'Günlük Karşılama Otomasyonu' : 'Açıklama yok')}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4b5563', marginBottom: 16 }}>
                                    <span>📅 {c.startDate ? new Date(c.startDate).toLocaleDateString() : '-'} - {c.endDate ? new Date(c.endDate).toLocaleDateString() : '-'}</span>
                                    <span>💰 {c.budget ? c.budget + ' TL' : '-'}</span>
                                </div>
                                <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                                        <span>Gönderilen / Arama: {c.isLegacy ? c.sentCount || 0 : c.stats?.sent || 0}</span>
                                        <span>Teslim / Okunan: {c.isLegacy ? `${c.deliveredCount || 0} / ${c.readCount || 0}` : `${c.stats?.delivered || 0} / ${c.stats?.read || 0}`}</span>
                                    </div>
                                    <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                                        <div style={{ width: `${Math.min(100, (((c.isLegacy ? c.readCount : c.stats?.read) || 0) / ((c.isLegacy ? (c.sentCount||1) : (c.stats?.sent||1)) || 1)) * 100)}%`, background: '#10b981' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Folder size={14}/> {c.isLegacy || c.isAutomation ? '-' : (c.groupsCount || c.groupCount || c.groups?.length || 0)} Grup
                                    </span>
                                    {!c.isLegacy && !c.isArchive && (
                                        <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                                            <button className="grp-icon-action" onClick={() => { setEditItem(c); setShowForm(true); }}><Edit2 size={14}/></button>
                                            <button className="grp-icon-action danger" onClick={() => handleDelete(c.id)}><Trash2 size={14}/></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {filteredCampaigns.length === 0 && <div className="mkt-empty" style={{ gridColumn: '1 / -1' }}><p>Bu filtrede kampanya bulunamadı.</p></div>}
                    </div>
                )}
            </div>

            {/* Campaign Wizard Modal */}
            {showWizard && (
                <CampaignWizardModal
                    workspaceId={wsId}
                    isOpen={showWizard}
                    onClose={() => setShowWizard(false)}
                    onSuccess={(newCampaign) => {
                        fetchCampaigns();
                        if (newCampaign?.id) onGoToGroups(newCampaign.id);
                    }}
                />
            )}

            {/* Basic Campaign Edit Modal (for editing existing campaigns) */}
            {showForm && (
                <CampaignFormModal initial={editItem} onSave={handleSave} onClose={() => { setShowForm(false); setEditItem(null); }} />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: GRUPLAR (AD SETS)
// ─────────────────────────────────────────────────────────────────────────────

function AdSetFormModal({ wsId, initial, campaigns, contactGroups, onSave, onClose }) {
    const [name, setName] = useState(initial?.name || '');
    const [campaignId, setCampaignId] = useState(initial?.campaignId || '');
    const [channel, setChannel] = useState(initial?.channel || 'WHATSAPP');
    const [listId, setListId] = useState(initial?.listId || '');
    const [sendRate, setSendRate] = useState(initial?.sendRate || 20);
    const [scheduledAt, setScheduledAt] = useState(initial?.scheduledAt ? initial.scheduledAt.substring(0,16) : '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim() || !campaignId || !listId) return alert('Lütfen zorunlu alanları doldurun');
        setSaving(true);
        await onSave({ name, campaignId, channel, listId, sendRate: Number(sendRate), scheduledAt });
        setSaving(false);
    };

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="grp-form-modal" onClick={e => e.stopPropagation()}>
                <div className="grp-modal-header">
                    <h2 className="grp-modal-title">{initial ? 'Grubu Düzenle' : 'Yeni Reklam Grubu'}</h2>
                    <button className="grp-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="grp-modal-body">
                    <div className="grp-field">
                        <label className="grp-label">Grup Adı</label>
                        <input className="grp-input" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Kampanya</label>
                        <select className="grp-input" value={campaignId} onChange={e => setCampaignId(e.target.value)}>
                            <option value="">Seçiniz...</option>
                            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Kanal</label>
                        <select className="grp-input" value={channel} onChange={e => setChannel(e.target.value)}>
                            <option value="WHATSAPP">WhatsApp</option>
                            <option value="AI_CALL">AI Arama</option>
                            <option value="EMAIL">E-posta</option>
                        </select>
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Hedef Kitle (Liste)</label>
                        <select className="grp-input" value={listId} onChange={e => setListId(e.target.value)}>
                            <option value="">Seçiniz...</option>
                            {contactGroups.map(cg => <option key={cg.id} value={cg.id}>{cg.name}</option>)}
                        </select>
                    </div>
                    <div className="grp-field" style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <label className="grp-label">Gönderim Hızı (dakika/adet)</label>
                            <input className="grp-input" type="number" value={sendRate} onChange={e => setSendRate(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="grp-label">Zamanlama</label>
                            <input className="grp-input" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                        </div>
                    </div>
                </div>
                <div className="grp-modal-footer">
                    <button className="grp-btn-cancel" onClick={onClose}>İptal</button>
                    <button className="grp-btn-save" style={{ background: '#2563eb' }} onClick={handleSave} disabled={saving || !name}>
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function AdSetsTab({ wsId, initialCampaignFilter }) {
    const [adSets, setAdSets] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [contactGroups, setContactGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [filterCampaignId, setFilterCampaignId] = useState(initialCampaignFilter || '');
    const [expandedSet, setExpandedSet] = useState(null);
    const [messages, setMessages] = useState([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [setsRes, campRes, cgRes, msgRes] = await Promise.all([
                api.get(`/marketing-v2/${wsId}/groups`),
                api.get(`/marketing-v2/${wsId}/campaigns`),
                api.get(`/contact-groups/${wsId}/groups`),
                api.get(`/marketing-v2/${wsId}/messages`)
            ]);
            setAdSets(setsRes.data.adSets || setsRes.data.groups || []);
            setCampaigns(campRes.data.campaigns || []);
            setContactGroups(cgRes.data.groups || []);
            setMessages(msgRes.data.messages || []);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [wsId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (data) => {
        try {
            if (editItem) {
                await api.put(`/marketing-v2/${wsId}/groups/${editItem.id}`, data);
            } else {
                await api.post(`/marketing-v2/${wsId}/groups`, data);
            }
            setShowForm(false);
            setEditItem(null);
            fetchData();
        } catch (e) {
            alert('Hata: ' + (e.response?.data?.error || e.message));
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu reklam grubunu silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/marketing-v2/${wsId}/groups/${id}`);
            fetchData();
        } catch (e) {
            alert('Silinemedi: ' + (e.response?.data?.error || e.message));
        }
    };

    const handleExecute = async (id) => {
        if (!window.confirm('Bu grubun gönderimini başlatmak istediğinize emin misiniz?')) return;
        try {
            const res = await api.post(`/marketing-v2/${wsId}/groups/${id}/execute`);
            alert(res.data?.message || 'Gönderim başarıyla başlatıldı!');
            fetchData();
        } catch (e) {
            alert('Başlatılamadı: ' + (e.response?.data?.error || e.message));
        }
    };

    const toggleExpand = (id) => {
        setExpandedSet(expandedSet === id ? null : id);
    };

    const linkMessage = async (setId, messageId) => {
        try {
            await api.post(`/marketing-v2/${wsId}/groups/${setId}/messages`, { messageId });
            fetchData();
        } catch (e) { alert('Mesaj eklenemedi'); }
    };
    
    const unlinkMessage = async (setId, messageId) => {
        try {
            await api.delete(`/marketing-v2/${wsId}/groups/${setId}/messages/${messageId}`);
            fetchData();
        } catch (e) { alert('Mesaj çıkarılamadı'); }
    };

    const filteredSets = filterCampaignId ? adSets.filter(a => a.campaignId === filterCampaignId) : adSets;

    const getChannelIcon = (ch) => {
        if (ch === 'WHATSAPP') return <MessageSquare size={16} color="#10b981"/>;
        if (ch === 'AI_CALL') return <Phone size={16} color="#3b82f6"/>;
        if (ch === 'EMAIL') return <Mail size={16} color="#f59e0b"/>;
        return null;
    };

    return (
        <div className="mkt-analytics-wrap">
            <div className="mkt-analytics-bar">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>Kampanya Filtresi:</span>
                    <select className="mkt-filter-select" value={filterCampaignId} onChange={e => setFilterCampaignId(e.target.value)}>
                        <option value="">Tümü</option>
                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <button className="mkt-btn-primary" onClick={() => setShowForm(true)}>+ Yeni Grup</button>
            </div>

            <div className="mkt-table-wrap">
                {loading ? <div className="mkt-loading">Yükleniyor...</div> : (
                    <table className="mkt-table">
                        <thead>
                            <tr>
                                <th>Grup Adı</th>
                                <th>Kampanya</th>
                                <th>Kanal</th>
                                <th>Hedef Liste</th>
                                <th>Performans</th>
                                <th>Durum</th>
                                <th style={{ textAlign: 'right' }}>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSets.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:20 }}>Grup bulunamadı.</td></tr>}
                            {filteredSets.map(s => (
                                <React.Fragment key={s.id}>
                                    <tr onClick={() => toggleExpand(s.id)}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {expandedSet === s.id ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                                <strong style={{ color: '#111827' }}>{s.name}</strong>
                                            </div>
                                        </td>
                                        <td>{campaigns.find(c => c.id === s.campaignId)?.name || '-'}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {getChannelIcon(s.channel)}
                                                <span style={{ fontSize: 12 }}>{s.channel}</span>
                                            </div>
                                        </td>
                                        <td>{contactGroups.find(c => c.id === s.listId)?.name || '-'}</td>
                                        <td>
                                            <div style={{ fontSize: 12 }}>
                                                <span style={{ fontWeight: 600, color: '#111827' }}>
                                                    {s.channel === 'AI_CALL' ? `Arama: ${s.sentCount || 0}` : `Gönderilen: ${s.sentCount || 0}`}
                                                </span>
                                                <div style={{ color: '#6b7280', fontSize: 11 }}>
                                                    {s.channel === 'AI_CALL' 
                                                        ? `Başarılı: ${s.deliveredCount || s.readCount || 0}`
                                                        : `Teslim/Okunan: ${s.deliveredCount || 0} / ${s.readCount || 0}`}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ padding: '4px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: s.status === 'COMPLETED' ? '#dcfce7' : s.status === 'SENDING' ? '#dbeafe' : '#f3f4f6', color: s.status === 'COMPLETED' ? '#166534' : s.status === 'SENDING' ? '#1e40af' : '#4b5563' }}>
                                                {s.status || 'DRAFT'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                                                <button className="mkt-btn-send-bulk" onClick={() => handleExecute(s.id)} disabled={s.status === 'SENDING'} style={{ padding: '4px 10px', fontSize: 12 }}>Gönder</button>
                                                <button className="grp-icon-action" onClick={() => { setEditItem(s); setShowForm(true); }}><Edit2 size={14}/></button>
                                                <button className="grp-icon-action danger" onClick={() => handleDelete(s.id)}><Trash2 size={14}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedSet === s.id && (
                                        <tr style={{ background: '#fafafa' }}>
                                            <td colSpan={7} style={{ padding: '20px 40px' }}>
                                                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13, color: '#374151' }}>Bağlı Mesajlar</div>
                                                {s.groupMessages && s.groupMessages.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                                        {s.groupMessages.map(m => {
                                                            const msgObj = messages.find(x => x.id === m.messageId);
                                                            return (
                                                                <div key={m.messageId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                        {getChannelIcon(msgObj?.channel)}
                                                                        <span style={{ fontSize: 13, fontWeight: 500 }}>{msgObj?.name || 'Bilinmeyen Mesaj'}</span>
                                                                    </div>
                                                                    <button style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }} onClick={() => unlinkMessage(s.id, m.messageId)}>Çıkar</button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Henüz mesaj eklenmemiş.</div>}
                                                
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                    <select className="mkt-filter-select" style={{ width: 250 }} id={`msg-select-${s.id}`}>
                                                        <option value="">Mesaj Seçin...</option>
                                                        {messages.filter(m => m.channel === s.channel && !s.groupMessages?.some(sm => sm.messageId === m.id)).map(m => (
                                                            <option key={m.id} value={m.id}>{m.name}</option>
                                                        ))}
                                                    </select>
                                                    <button className="mkt-btn-secondary" style={{ padding: '7px 12px' }} onClick={() => {
                                                        const sel = document.getElementById(`msg-select-${s.id}`);
                                                        if (sel.value) linkMessage(s.id, sel.value);
                                                    }}>+ Mesaj Ekle</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {showForm && <AdSetFormModal wsId={wsId} initial={editItem} campaigns={campaigns} contactGroups={contactGroups} onSave={handleSave} onClose={() => { setShowForm(false); setEditItem(null); }} />}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: MESAJLAR (MESSAGES)
// ─────────────────────────────────────────────────────────────────────────────

function MessageFormModal({ wsId, initial, onClose, onSave }) {
    const [name, setName] = useState(initial?.name || '');
    const [channel, setChannel] = useState(initial?.channel || 'WHATSAPP');
    const [externalId, setExternalId] = useState(initial?.externalId || ''); // templateId or agentId
    const [subject, setSubject] = useState(initial?.subject || '');
    const [bodyText, setBodyText] = useState(initial?.bodyText || '');
    
    const [waTemplates, setWaTemplates] = useState([]);
    const [retellAgents, setRetellAgents] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (channel === 'WHATSAPP') {
            api.get(`/automations/${wsId}/templates`)
                .then(r => setWaTemplates(r.data?.templates || r.data || []))
                .catch(() => setWaTemplates([]));
        } else if (channel === 'AI_CALL') {
            api.get(`/retell/${wsId}/agents`)
                .then(r => setRetellAgents(r.data?.agents || r.data?.data || []))
                .catch(() => setRetellAgents([]));
        }
    }, [wsId, channel]);

    const handleSave = async () => {
        if (!name.trim()) return alert('Mesaj adı zorunlu');
        setSaving(true);
        const selectedTpl = waTemplates.find(t => t.id === externalId);
        await onSave({
            name,
            channel,
            externalId,
            templateId: channel === 'WHATSAPP' ? externalId : null,
            templateName: channel === 'WHATSAPP' ? (selectedTpl?.name || null) : null,
            retellAgentId: channel === 'AI_CALL' ? externalId : null,
            emailSubject: channel === 'EMAIL' ? subject : null,
            emailBody: channel === 'EMAIL' ? bodyText : null,
            subject,
            bodyText
        });
        setSaving(false);
    };

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="grp-form-modal" onClick={e => e.stopPropagation()}>
                <div className="grp-modal-header">
                    <h2 className="grp-modal-title">{initial ? 'Mesajı Düzenle' : 'Yeni Mesaj'}</h2>
                    <button className="grp-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="grp-modal-body">
                    <div className="grp-field">
                        <label className="grp-label">Mesaj Adı</label>
                        <input className="grp-input" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Kanal</label>
                        <select className="grp-input" value={channel} onChange={e => { setChannel(e.target.value); setExternalId(''); }}>
                            <option value="WHATSAPP">WhatsApp</option>
                            <option value="AI_CALL">AI Arama</option>
                            <option value="EMAIL">E-posta</option>
                        </select>
                    </div>
                    
                    {channel === 'WHATSAPP' && (
                        <div className="grp-field">
                            <label className="grp-label">WhatsApp Şablonu</label>
                            <select className="grp-input" value={externalId} onChange={e => setExternalId(e.target.value)}>
                                <option value="">Seçiniz...</option>
                                {waTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    )}
                    
                    {channel === 'AI_CALL' && (
                        <div className="grp-field">
                            <label className="grp-label">Retell Agent</label>
                            <select className="grp-input" value={externalId} onChange={e => setExternalId(e.target.value)}>
                                <option value="">Seçiniz...</option>
                                {retellAgents.map(a => <option key={a.agent_id || a.id} value={a.agent_id || a.id}>{a.agent_name || a.name || a.agent_id}</option>)}
                            </select>
                        </div>
                    )}
                    
                    {channel === 'EMAIL' && (
                        <>
                            <div className="grp-field">
                                <label className="grp-label">Konu</label>
                                <input className="grp-input" value={subject} onChange={e => setSubject(e.target.value)} />
                            </div>
                            <div className="grp-field">
                                <label className="grp-label">İçerik</label>
                                <textarea className="grp-input" rows={4} value={bodyText} onChange={e => setBodyText(e.target.value)} />
                            </div>
                        </>
                    )}
                </div>
                <div className="grp-modal-footer">
                    <button className="grp-btn-cancel" onClick={onClose}>İptal</button>
                    <button className="grp-btn-save" style={{ background: '#2563eb' }} onClick={handleSave} disabled={saving || !name}>
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function MessagesTab({ wsId }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [channelFilter, setChannelFilter] = useState('');

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/marketing-v2/${wsId}/messages`);
            setMessages(res.data.messages || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId]);

    useEffect(() => { fetchMessages(); }, [fetchMessages]);

    const handleSave = async (data) => {
        try {
            if (editItem) await api.put(`/marketing-v2/${wsId}/messages/${editItem.id}`, data);
            else await api.post(`/marketing-v2/${wsId}/messages`, data);
            setShowForm(false);
            setEditItem(null);
            fetchMessages();
        } catch(e) { alert('Hata'); }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Emin misiniz?')) return;
        try {
            await api.delete(`/marketing-v2/${wsId}/messages/${id}`);
            fetchMessages();
        } catch(e) { alert('Silinemedi'); }
    }

    const filtered = channelFilter ? messages.filter(m => m.channel === channelFilter) : messages;

    return (
        <div className="mkt-analytics-wrap">
            <div className="mkt-analytics-bar">
                <div className="mkt-filter-tabs">
                    {[{value: '', label: 'Tümü'}, {value: 'WHATSAPP', label: 'WhatsApp'}, {value: 'AI_CALL', label: 'AI Arama'}, {value: 'EMAIL', label: 'E-posta'}].map(o => (
                        <button key={o.value} className={`mkt-filter-tab ${channelFilter === o.value ? 'active' : ''}`} onClick={() => setChannelFilter(o.value)}>{o.label}</button>
                    ))}
                </div>
                <button className="mkt-btn-primary" onClick={() => setShowForm(true)}>+ Yeni Mesaj</button>
            </div>
            
            <div className="mkt-table-wrap">
                {loading ? <div className="mkt-loading">Yükleniyor...</div> : (
                    <table className="mkt-table">
                        <thead>
                            <tr>
                                <th>Mesaj Adı</th>
                                <th>Kanal</th>
                                <th>Referans (Şablon/Agent)</th>
                                <th>Kullanım</th>
                                <th style={{ textAlign: 'right' }}>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && <tr><td colSpan={5} style={{textAlign:'center', padding:20}}>Mesaj bulunamadı.</td></tr>}
                            {filtered.map(m => (
                                <tr key={m.id}>
                                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                                    <td>
                                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: '#f3f4f6', fontWeight: 600 }}>
                                            {m.channel}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 12, color: '#4b5563', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {m.templateName || m.externalId || m.emailSubject || m.subject || (m.content ? m.content.substring(0, 30) + '...' : '-')}
                                    </td>
                                    <td>
                                        <span style={{ fontSize: 12, color: '#6b7280' }}>{m.usageCount || 0} grupta kullanılıyor</span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <button className="grp-icon-action" onClick={() => { setEditItem(m); setShowForm(true); }}><Edit2 size={14}/></button>
                                            <button className="grp-icon-action danger" onClick={() => handleDelete(m.id)}><Trash2 size={14}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {showForm && <MessageFormModal wsId={wsId} initial={editItem} onSave={handleSave} onClose={() => { setShowForm(false); setEditItem(null); }} />}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: LİSTELER (ContactGroups - REUSED FROM ORIGINAL GroupsTab)
// ─────────────────────────────────────────────────────────────────────────────

function ListsTab({ wsId }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editGroup, setEditGroup] = useState(null);

    const fetchGroups = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/contact-groups/${wsId}/groups`);
            setGroups(res.data.groups || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId]);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);

    const handleCreate = async (data) => {
        try {
            const res = await api.post(`/contact-groups/${wsId}/groups`, data);
            setGroups(prev => [res.data, ...prev]);
            setShowForm(false);
        } catch (e) { alert('Hata: ' + (e.response?.data?.error || e.message)); }
    };

    const handleUpdate = async (data) => {
        try {
            const res = await api.put(`/contact-groups/${wsId}/groups/${editGroup.id}`, data);
            setGroups(prev => prev.map(g => g.id === editGroup.id ? { ...g, ...res.data } : g));
            setEditGroup(null);
        } catch (e) { alert('Güncellenemedi: ' + (e.response?.data?.error || e.message)); }
    };

    const handleDelete = async (group) => {
        if (!window.confirm(`"${group.name}" silinecek. Onaylıyor musunuz?`)) return;
        try {
            await api.delete(`/contact-groups/${wsId}/groups/${group.id}`);
            setGroups(prev => prev.filter(g => g.id !== group.id));
        } catch (e) { alert('Silinemedi'); }
    };

    return (
        <div className="mkt-analytics-wrap">
            <div className="mkt-analytics-bar">
                <span style={{ fontSize: 13, color: '#6b7280' }}>{groups.length} liste</span>
                <button className="mkt-btn-primary" onClick={() => setShowForm(true)}>+ Yeni Liste</button>
            </div>
            {loading ? <div className="mkt-loading">Yükleniyor...</div> : (
                <div className="mkt-table-wrap">
                    <table className="mkt-table">
                        <thead>
                            <tr>
                                <th>İkon</th>
                                <th>Liste Adı</th>
                                <th>Açıklama</th>
                                <th>Kişi Sayısı</th>
                                <th style={{ textAlign: 'right' }}>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map(g => (
                                <tr key={g.id}>
                                    <td>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: g.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                            {g.name.charAt(0).toUpperCase()}
                                        </div>
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{g.name}</td>
                                    <td style={{ fontSize: 12, color: '#6b7280' }}>{g.description || '-'}</td>
                                    <td>{(g._count?.members || 0).toLocaleString()} kişi</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <button className="grp-icon-action" onClick={() => { setEditGroup(g); setShowForm(true); }}><Edit2 size={14}/></button>
                                            <button className="grp-icon-action danger" onClick={() => handleDelete(g)}><Trash2 size={14}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {showForm && (
                <div className="mkt-modal-overlay" onClick={() => { setShowForm(false); setEditGroup(null); }}>
                    <div className="grp-form-modal" onClick={e => e.stopPropagation()}>
                        <div className="grp-modal-header">
                            <h2 className="grp-modal-title">{editGroup ? 'Listeyi Düzenle' : 'Yeni Liste'}</h2>
                            <button className="grp-modal-close" onClick={() => { setShowForm(false); setEditGroup(null); }}>✕</button>
                        </div>
                        <div className="grp-modal-body">
                            {/* Reusing GroupFormModal logic inline for simplicity in rewrite, though could componentize further */}
                            <form onSubmit={e => {
                                e.preventDefault();
                                const fd = new FormData(e.target);
                                const data = { name: fd.get('name'), description: fd.get('desc'), color: fd.get('color'), icon: '👥' };
                                editGroup ? handleUpdate(data) : handleCreate(data);
                            }}>
                                <div className="grp-field">
                                    <label className="grp-label">Liste Adı</label>
                                    <input name="name" className="grp-input" defaultValue={editGroup?.name || ''} required />
                                </div>
                                <div className="grp-field">
                                    <label className="grp-label">Açıklama</label>
                                    <input name="desc" className="grp-input" defaultValue={editGroup?.description || ''} />
                                </div>
                                <div className="grp-field">
                                    <label className="grp-label">Renk Hex</label>
                                    <input name="color" type="color" className="grp-input" style={{ padding: 4, height: 40 }} defaultValue={editGroup?.color || '#2563eb'} />
                                </div>
                                <div className="grp-modal-footer" style={{ marginTop: 20 }}>
                                    <button type="submit" className="grp-btn-save" style={{ background: '#2563eb' }}>Kaydet</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function Marketing() {
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('campaigns');
    const [filterCampaignId, setFilterCampaignId] = useState('');

    const wsId = currentWorkspace?.id;

    const TABS = [
        { key: 'campaigns', label: 'Kampanyalar',  Icon: Megaphone },
        { key: 'adsets',    label: 'Gruplar',      Icon: Folder },
        { key: 'messages',  label: 'Mesajlar',     Icon: MessageSquare },
        { key: 'lists',     label: 'Listeler',     Icon: Users },
    ];

    const goToGroups = (campaignId) => {
        setFilterCampaignId(campaignId);
        setActiveTab('adsets');
    };

    return (
        <div className="mkt-page base-layout">
            {/* Sol Sidebar */}
            <div className="base-sidebar">
                <div className="base-sidebar-header">
                    <div className="base-sidebar-header-icon" style={{ background: '#eff6ff', color: '#2563eb', borderColor: '#dbeafe' }}>
                        <Megaphone size={16} />
                    </div>
                    <span>Pazarlama</span>
                </div>
                <nav className="base-nav">
                    {TABS.map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            className={`base-nav-item ${activeTab === key ? 'active' : ''}`}
                            onClick={() => { setActiveTab(key); if (key !== 'adsets') setFilterCampaignId(''); }}
                            style={activeTab === key ? { color: '#2563eb', borderColor: 'rgba(59,130,246,0.3)', boxShadow: '0 1px 4px rgba(37,99,235,0.08), 0 1px 2px rgba(0,0,0,0.03)' } : {}}
                        >
                            <Icon size={16} style={activeTab === key ? { color: '#2563eb' } : {}} />
                            {label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Sağ İçerik */}
            <div className="base-content">
                {activeTab === 'campaigns' && <CampaignsTab wsId={wsId} onGoToGroups={goToGroups} />}
                {activeTab === 'adsets'    && <AdSetsTab wsId={wsId} initialCampaignFilter={filterCampaignId} />}
                {activeTab === 'messages'  && <MessagesTab wsId={wsId} />}
                {activeTab === 'lists'     && <ListsTab wsId={wsId} />}
            </div>
        </div>
    );
}
