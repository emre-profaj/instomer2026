import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { conversationAPI, funnelAPI } from '../../services/api';
import {
    Kanban, Plus, X, Search, RefreshCw,
    MessageSquare, Phone, Mail, Instagram, Facebook,
    Globe, User, Settings, Trash2, Edit2, Check,
    Clock, ChevronRight, Loader, Tag
} from 'lucide-react';
import './Pipeline.css';

/* ─── Channel Icons ─── */
const CHANNEL_ICONS = {
    WHATSAPP: { icon: Phone, color: '#25D366', label: 'WhatsApp' },
    INSTAGRAM: { icon: Instagram, color: '#E1306C', label: 'Instagram' },
    FACEBOOK: { icon: Facebook, color: '#1877F2', label: 'Facebook' },
    EMAIL: { icon: Mail, color: '#6b7280', label: 'E-posta' },
    WIDGET: { icon: Globe, color: '#8b5cf6', label: 'Widget' },
    LEAD: { icon: Facebook, color: '#1877F2', label: 'Lead' },
    MANUAL: { icon: User, color: '#6b7280', label: 'Manuel' }
};

const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899', '#14b8a6', '#64748b'];
const PRESET_ICONS = ['📁', '💰', '🛟', '😤', '🤝', '📋', '🔥', '🎯', '💬', '🚀', '⭐', '✅'];

const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const diff = Math.floor((now - date) / 86400000);
    if (diff === 0) return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (diff === 1) return 'Dün';
    if (diff < 7) return date.toLocaleDateString('tr-TR', { weekday: 'short' });
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

/* ─── Conversation Card ─── */
const ConvCard = ({ conv, onDragStart }) => {
    const channel = CHANNEL_ICONS[conv.channel] || CHANNEL_ICONS.MANUAL;
    const ChannelIcon = channel.icon;
    const name = conv.contact?.name || 'İsimsiz';
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div
            className="pl-card"
            draggable
            onDragStart={e => onDragStart(e, conv)}
            id={`plc-${conv.id}`}
        >
            <div className="pl-card-top">
                <div className="pl-card-avatar">{initials}</div>
                <div className="pl-card-meta">
                    <span className="pl-card-name">{name}</span>
                    <span className="pl-card-channel" style={{ color: channel.color }}>
                        <ChannelIcon size={10} /> {channel.label}
                    </span>
                </div>
                <span className="pl-card-date">
                    <Clock size={10} /> {formatDate(conv.lastMessageAt || conv.createdAt)}
                </span>
            </div>
            {conv.aiTopic && (
                <div className="pl-card-topic">
                    <Tag size={10} />
                    <span>{conv.aiTopic}</span>
                </div>
            )}
            <div className="pl-card-status-row">
                <span className={`pl-card-badge pl-badge-${conv.status?.toLowerCase()}`}>
                    {conv.status === 'OPEN' ? 'Açık' : conv.status === 'RESOLVED' ? 'Çözüldü' : 'Beklemede'}
                </span>
            </div>
        </div>
    );
};

/* ─── Funnel Column ─── */
const FunnelColumn = ({ funnel, convs, onDragStart, onDragOver, onDrop, isDragOver, onEdit, onDelete }) => (
    <div
        className={`pl-col ${isDragOver ? 'pl-col--over' : ''}`}
        onDragOver={e => onDragOver(e, funnel.id)}
        onDrop={e => onDrop(e, funnel.id)}
        id={`plcol-${funnel.id}`}
    >
        <div className="pl-col-header" style={{ borderTopColor: funnel.color }}>
            <div className="pl-col-header-left">
                <span className="pl-col-icon">{funnel.icon}</span>
                <span className="pl-col-name">{funnel.name}</span>
                <span className="pl-col-count" style={{ background: funnel.color + '22', color: funnel.color }}>
                    {convs.length}
                </span>
            </div>
            <div className="pl-col-actions">
                <button className="pl-col-btn" onClick={() => onEdit(funnel)} title="Düzenle"><Edit2 size={12} /></button>
                <button className="pl-col-btn pl-col-btn--del" onClick={() => onDelete(funnel.id)} title="Sil"><Trash2 size={12} /></button>
            </div>
        </div>
        <div className="pl-col-body">
            {convs.length === 0
                ? <div className="pl-col-empty"><MessageSquare size={22} /><p>Sohbet yok</p></div>
                : convs.map(c => <ConvCard key={c.id} conv={c} onDragStart={onDragStart} />)
            }
            {isDragOver && <div className="pl-drop-hint"><ChevronRight size={16} /> Buraya bırak</div>}
        </div>
    </div>
);

/* ─── Create/Edit Funnel Modal ─── */
const FunnelModal = ({ initial, onSave, onClose }) => {
    const [name, setName] = useState(initial?.name || '');
    const [color, setColor] = useState(initial?.color || '#3b82f6');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        await onSave({ name: name.trim(), color, icon: initial?.icon || '📁' });
        setSaving(false);
    };

    return (
        <div className="pl-modal-overlay" onClick={onClose}>
            <div className="pl-modal" onClick={e => e.stopPropagation()}>
                <div className="pl-modal-header">
                    <h3>{initial ? 'Funnel Düzenle' : 'Yeni Funnel'}</h3>
                    <button className="pl-modal-close" onClick={onClose}><X size={16} /></button>
                </div>
                <div className="pl-modal-body">
                    <label className="pl-modal-label">Funnel Adı</label>
                    <input
                        className="pl-modal-input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="ör. Satış, Destek, Şikayet..."
                        autoFocus
                    />
                    <label className="pl-modal-label">Renk</label>
                    <div className="pl-color-grid">
                        {PRESET_COLORS.map(c => (
                            <button
                                key={c}
                                className={`pl-color-chip ${color === c ? 'pl-color-chip--active' : ''}`}
                                style={{ background: c }}
                                onClick={() => setColor(c)}
                            />
                        ))}
                    </div>

                </div>
                <div className="pl-modal-footer">
                    <button className="pl-btn-cancel" onClick={onClose}>İptal</button>
                    <button className="pl-btn-save" onClick={handleSave} disabled={saving || !name.trim()}>
                        {saving ? <Loader size={14} className="spin" /> : <Check size={14} />}
                        {initial ? 'Kaydet' : 'Oluştur'}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ─── MAIN Pipeline Component ─── */
const Pipeline = () => {
    const { currentWorkspace } = useAuth();
    const [funnels, setFunnels] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dragOverCol, setDragOverCol] = useState(null);
    const dragConv = useRef(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingFunnel, setEditingFunnel] = useState(null);

    const loadData = useCallback(async () => {
        if (!currentWorkspace) return;
        try {
            setLoading(true);
            const [fRes, cRes] = await Promise.all([
                funnelAPI.getAll(currentWorkspace.id),
                conversationAPI.getAll(currentWorkspace.id, { limit: 500, status: 'OPEN' })
            ]);
            setFunnels(fRes.data.funnels || []);
            // getAll returns { conversations: [...] }
            const rawConvs = cRes.data.conversations || cRes.data || [];
            setConversations(rawConvs);
        } catch (err) {
            console.error('Pipeline load error:', err);
        } finally {
            setLoading(false);
        }
    }, [currentWorkspace]);

    useEffect(() => { loadData(); }, [loadData]);

    /* Drag & Drop */
    const handleDragStart = (e, conv) => {
        dragConv.current = conv;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            const el = document.getElementById(`plc-${conv.id}`);
            if (el) el.classList.add('pl-card--dragging');
        }, 0);
    };
    const handleDragOver = (e, colId) => { e.preventDefault(); setDragOverCol(colId); };
    const handleDrop = async (e, targetFunnelId) => {
        e.preventDefault();
        setDragOverCol(null);
        const conv = dragConv.current;
        if (!conv || conv.funnelType === targetFunnelId) return;
        // Optimistic
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, funnelType: targetFunnelId } : c));
        try {
            await conversationAPI.updateFunnel(currentWorkspace.id, conv.id, targetFunnelId);
        } catch {
            setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, funnelType: conv.funnelType } : c));
        }
        dragConv.current = null;
    };
    const handleDragEnd = () => {
        document.querySelectorAll('.pl-card--dragging').forEach(el => el.classList.remove('pl-card--dragging'));
        setDragOverCol(null);
    };

    /* Funnel CRUD */
    const handleSaveFunnel = async (data) => {
        try {
            if (editingFunnel) {
                const res = await funnelAPI.update(currentWorkspace.id, editingFunnel.id, data);
                setFunnels(prev => prev.map(f => f.id === editingFunnel.id ? res.data.funnel : f));
            } else {
                const res = await funnelAPI.create(currentWorkspace.id, data);
                setFunnels(prev => [...prev, res.data.funnel]);
            }
        } catch (err) { console.error('Funnel save error:', err); }
        setShowModal(false);
        setEditingFunnel(null);
    };
    const handleDeleteFunnel = async (funnelId) => {
        if (!window.confirm('Bu funnel silinecek. Emin misiniz?')) return;
        try {
            await funnelAPI.delete(currentWorkspace.id, funnelId);
            setFunnels(prev => prev.filter(f => f.id !== funnelId));
        } catch (err) { console.error('Funnel delete error:', err); }
    };

    /* Grouping */
    const filtered = conversations.filter(c => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (c.contact?.name || '').toLowerCase().includes(q) ||
            (c.aiTopic || '').toLowerCase().includes(q);
    });

    // Conversations grouped by funnelType (funnel.id === funnelType stored as funnel name or id)
    const grouped = funnels.reduce((acc, f) => {
        acc[f.id] = filtered.filter(c => c.funnelType === f.id || c.funnelType === f.name);
        return acc;
    }, {});

    const unassigned = filtered.filter(c => !c.funnelType || !funnels.some(f => f.id === c.funnelType || f.name === c.funnelType));

    return (
        <div className="pl-page" onDragEnd={handleDragEnd}>
            {/* Header */}
            <div className="pl-header">
                <div className="pl-header-left">
                    <Kanban size={22} className="pl-header-icon" />
                    <div>
                        <h1 className="pl-title">Pipeline</h1>
                        <span className="pl-subtitle">{loading ? 'Yükleniyor...' : `${funnels.length} funnel • ${conversations.length} sohbet`}</span>
                    </div>
                </div>
                <div className="pl-header-right">
                    <div className="pl-search">
                        <Search size={14} />
                        <input
                            type="text" placeholder="Sohbet veya konu ara..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="pl-search-input"
                        />
                        {search && <button className="pl-search-clear" onClick={() => setSearch('')}><X size={12} /></button>}
                    </div>
                    <button className="pl-btn-refresh" onClick={loadData} disabled={loading} title="Yenile">
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                    </button>
                    <button className="pl-btn-add" onClick={() => { setEditingFunnel(null); setShowModal(true); }}>
                        <Plus size={15} /> Funnel Ekle
                    </button>
                </div>
            </div>

            {/* Board */}
            {loading ? (
                <div className="pl-loading"><div className="pl-spinner" /><p>Pipeline yükleniyor...</p></div>
            ) : funnels.length === 0 ? (
                <div className="pl-empty-state">
                    <Kanban size={52} />
                    <h2>Henüz funnel yok</h2>
                    <p>Satış, Destek, Şikayet gibi funnellar oluşturun ve<br />sohbetleri bu funnellar arasında sürükleyip bırakın.</p>
                    <button className="pl-btn-add pl-btn-add--large" onClick={() => setShowModal(true)}>
                        <Plus size={16} /> İlk Funnel'ı Oluştur
                    </button>
                </div>
            ) : (
                <div className="pl-board">
                    {funnels.map(f => (
                        <FunnelColumn
                            key={f.id}
                            funnel={f}
                            convs={grouped[f.id] || []}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            isDragOver={dragOverCol === f.id}
                            onEdit={fun => { setEditingFunnel(fun); setShowModal(true); }}
                            onDelete={handleDeleteFunnel}
                        />
                    ))}
                    {/* Unassigned column */}
                    {unassigned.length > 0 && (
                        <FunnelColumn
                            funnel={{ id: '__none__', name: 'Atanmamış', icon: '📥', color: '#94a3b8' }}
                            convs={unassigned}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            isDragOver={dragOverCol === '__none__'}
                            onEdit={() => {}}
                            onDelete={() => {}}
                        />
                    )}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <FunnelModal
                    initial={editingFunnel}
                    onSave={handleSaveFunnel}
                    onClose={() => { setShowModal(false); setEditingFunnel(null); }}
                />
            )}
        </div>
    );
};

export default Pipeline;
