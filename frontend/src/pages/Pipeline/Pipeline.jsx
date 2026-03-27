import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { conversationAPI, funnelAPI } from '../../services/api';
import {
    Kanban, Plus, X, Search, RefreshCw,
    MessageSquare, Phone, Mail, Instagram, Facebook,
    Globe, User, Trash2, Edit2, Check,
    Clock, ChevronRight, ChevronDown, Loader, Tag
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

const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/* ─── Conversation Card ─── */
const ConvCard = ({ conv, onDragStart }) => {
    const { t } = useTranslation();
    const channel = CHANNEL_ICONS[conv.channel] || CHANNEL_ICONS.MANUAL;
    const ChannelIcon = channel.icon;
    const name = conv.contact?.name || 'Unnamed';
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const phone = conv.contact?.phone;
    const email = conv.contact?.email;

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
            {(phone || email) && (
                <div className="pl-card-contact-info">
                    {phone && (
                        <span className="pl-card-contact-item">
                            <Phone size={10} /> {phone}
                        </span>
                    )}
                    {email && (
                        <span className="pl-card-contact-item">
                            <Mail size={10} /> {email}
                        </span>
                    )}
                </div>
            )}
            <div className="pl-card-status-row">
                <span className={`pl-card-badge pl-badge-${conv.status?.toLowerCase()}`}>
                    {conv.status === 'OPEN' ? t('pipeline.open') : conv.status === 'RESOLVED' ? t('pipeline.resolved') : t('pipeline.pending')}
                </span>
            </div>
        </div>
    );
};

/* ─── Stage Column ─── */
const StageColumn = ({ stage, convs, onDragStart, onDragOver, onDrop, isDragOver }) => (
    <div
        className={`pl-col ${isDragOver ? 'pl-col--over' : ''}`}
        onDragOver={e => onDragOver(e, stage.id)}
        onDrop={e => onDrop(e, stage.id)}
        id={`plcol-${stage.id}`}
    >
        <div className="pl-col-header" style={{ borderTopColor: stage.color }}>
            <div className="pl-col-header-left">
                <div className="pl-col-dot" style={{ background: stage.color }} />
                <span className="pl-col-name">{stage.name}</span>
                <span className="pl-col-count" style={{ background: stage.color + '22', color: stage.color }}>
                    {convs.length}
                </span>
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

/* ─── MAIN Pipeline Component ─── */
const Pipeline = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [funnels, setFunnels] = useState([]);
    const [selectedFunnelId, setSelectedFunnelId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dragOverCol, setDragOverCol] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dragConv = useRef(null);

    const selectedFunnel = funnels.find(f => f.id === selectedFunnelId);
    const stages = selectedFunnel?.stages || [];

    const loadData = useCallback(async () => {
        if (!currentWorkspace) return;
        try {
            setLoading(true);
            const [fRes, cRes] = await Promise.all([
                funnelAPI.getAll(currentWorkspace.id),
                conversationAPI.getAll(currentWorkspace.id, { limit: 500, status: 'OPEN' })
            ]);
            let loadedFunnels = fRes.data.funnels || [];

            // Auto-create default stages for funnels that have none
            const DEFAULT_STAGES = [
                { name: 'New', color: '#3b82f6' },
                { name: 'In Progress', color: '#f59e0b' },
                { name: 'Closed', color: '#10b981' }
            ];
            let needsReload = false;
            for (const funnel of loadedFunnels) {
                if (!funnel.stages || funnel.stages.length === 0) {
                    try {
                        for (const s of DEFAULT_STAGES) {
                            await funnelAPI.createStage(currentWorkspace.id, funnel.id, s);
                        }
                        needsReload = true;
                    } catch (err) {
                        console.error('Auto-create stages error:', err);
                    }
                }
            }
            if (needsReload) {
                const refreshed = await funnelAPI.getAll(currentWorkspace.id);
                loadedFunnels = refreshed.data.funnels || [];
            }

            setFunnels(loadedFunnels);

            // Auto-select first funnel if none selected
            if (!selectedFunnelId && loadedFunnels.length > 0) {
                setSelectedFunnelId(loadedFunnels[0].id);
            }

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
    const handleDrop = async (e, targetStageId) => {
        e.preventDefault();
        setDragOverCol(null);
        const conv = dragConv.current;
        if (!conv || conv.funnelStageId === targetStageId) return;

        // Optimistic update
        setConversations(prev => prev.map(c =>
            c.id === conv.id ? { ...c, funnelType: selectedFunnelId, funnelStageId: targetStageId } : c
        ));
        try {
            await conversationAPI.updateFunnel(currentWorkspace.id, conv.id, {
                funnelType: selectedFunnelId,
                funnelStageId: targetStageId
            });
            // Notify ContactSidebar to update the funnel stage tag immediately
            const updatedStage = stages.find(s => s.id === targetStageId);
            window.dispatchEvent(new CustomEvent('websocket:funnel_stage_updated', {
                detail: {
                    conversationId: conv.id,
                    funnelStageId: targetStageId,
                    funnelType: selectedFunnelId,
                    stageName: updatedStage?.name,
                    stageColor: updatedStage?.color
                }
            }));
        } catch {
            // Revert on error
            setConversations(prev => prev.map(c =>
                c.id === conv.id ? { ...c, funnelType: conv.funnelType, funnelStageId: conv.funnelStageId } : c
            ));
        }
        dragConv.current = null;
    };
    const handleDragEnd = () => {
        document.querySelectorAll('.pl-card--dragging').forEach(el => el.classList.remove('pl-card--dragging'));
        setDragOverCol(null);
    };

    /* Grouping by stage */
    const filtered = conversations.filter(c => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (c.contact?.name || '').toLowerCase().includes(q) ||
            (c.aiTopic || '').toLowerCase().includes(q);
    });

    // For selected funnel: group conversations by stageId
    const grouped = stages.reduce((acc, s) => {
        acc[s.id] = filtered.filter(c =>
            c.funnelType === selectedFunnelId && c.funnelStageId === s.id
        );
        return acc;
    }, {});

    // Count conversations assigned to this funnel but no stage (put in first stage column)
    const noStageConvs = filtered.filter(c =>
        c.funnelType === selectedFunnelId && (!c.funnelStageId || !stages.some(s => s.id === c.funnelStageId))
    );
    if (stages.length > 0 && noStageConvs.length > 0) {
        grouped[stages[0].id] = [...(grouped[stages[0].id] || []), ...noStageConvs];
    }

    // Unassigned: conversations not in any funnel
    const unassigned = filtered.filter(c =>
        !c.funnelType || !funnels.some(f => f.id === c.funnelType)
    );

    // Total conversations in selected funnel
    const funnelConvCount = selectedFunnel
        ? filtered.filter(c => c.funnelType === selectedFunnelId).length
        : 0;

    return (
        <div className="pl-page" onDragEnd={handleDragEnd}>
            {/* Header */}
            <div className="pl-header">
                <div className="pl-header-left">
                    <Kanban size={22} className="pl-header-icon" />
                    <div>
                        <h1 className="pl-title">Pipeline</h1>
                        <span className="pl-subtitle">
                            {loading ? 'Yükleniyor...' : `${funnels.length} funnel • ${conversations.length} sohbet`}
                        </span>
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
                </div>
            </div>

            {/* Funnel Selector Bar */}
            {funnels.length > 0 && (
                <div className="pl-funnel-bar">
                    <div className="pl-funnel-selector-wrap">
                        <button
                            className="pl-funnel-selector"
                            onClick={() => setDropdownOpen(p => !p)}
                        >
                            {selectedFunnel && (
                                <div className="pl-funnel-sel-dot" style={{ background: selectedFunnel.color }} />
                            )}
                            <span>{selectedFunnel?.name || t('pipeline.selectFunnel')}</span>
                            <ChevronDown size={16} className={`pl-funnel-chevron ${dropdownOpen ? 'open' : ''}`} />
                        </button>

                        {dropdownOpen && (
                            <div className="pl-funnel-dropdown">
                                {funnels.map(f => {
                                    const count = filtered.filter(c => c.funnelType === f.id).length;
                                    return (
                                        <button
                                            key={f.id}
                                            className={`pl-funnel-option ${f.id === selectedFunnelId ? 'active' : ''}`}
                                            onClick={() => { setSelectedFunnelId(f.id); setDropdownOpen(false); }}
                                        >
                                            <div className="pl-funnel-opt-dot" style={{ background: f.color }} />
                                            <span className="pl-funnel-opt-name">{f.name}</span>
                                            <span className="pl-funnel-opt-count">{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {selectedFunnel && (
                        <div className="pl-funnel-info">
                            <span className="pl-funnel-info-label">{stages.length} durum</span>
                            <span className="pl-funnel-info-sep">•</span>
                            <span className="pl-funnel-info-label">{funnelConvCount} sohbet</span>
                        </div>
                    )}
                </div>
            )}

            {/* Board */}
            {loading ? (
                <div className="pl-loading"><div className="pl-spinner" /><p>{t('pipeline.loading')}</p></div>
            ) : funnels.length === 0 ? (
                <div className="pl-empty-state">
                    <Kanban size={52} />
                    <h2>No funnels yet</h2>
                    <p>Ayarlar → Funnel Yönetimi sayfasından<br />ilk funnel'ınızı oluşturun.</p>
                </div>
            ) : !selectedFunnel ? (
                <div className="pl-empty-state">
                    <Kanban size={52} />
                    <h2>{t('pipeline.selectFunnelTitle')}</h2>
                    <p>Yukarıdaki seçiciden bir funnel seçerek<br />durumlarını görüntüleyin.</p>
                </div>
            ) : stages.length === 0 ? (
                <div className="pl-empty-state">
                    <Kanban size={52} />
                    <h2>Bu funnel'da durum yok</h2>
                    <p>Ayarlar → Funnel Yönetimi sayfasından<br />bu funnel'a durumlar ekleyin.</p>
                </div>
            ) : (
                <div className="pl-board">
                    {stages.map(s => (
                        <StageColumn
                            key={s.id}
                            stage={s}
                            convs={grouped[s.id] || []}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            isDragOver={dragOverCol === s.id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default Pipeline;
