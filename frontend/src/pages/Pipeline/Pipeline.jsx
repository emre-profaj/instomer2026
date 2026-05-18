import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { conversationAPI, funnelAPI, workspaceAPI } from '../../services/api';
import {
    Kanban, Plus, X, Search, RefreshCw,
    MessageSquare, Phone, Mail, Instagram, Facebook,
    Globe, User, Trash2, Edit2, Check,
    Clock, ChevronRight, ChevronDown, Tag
} from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
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
const ConvCard = ({ conv, onDragStart, onSelect }) => {
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
            onClick={() => onSelect(conv.id)}
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
const StageColumn = ({ stage, convs, onDragStart, onDragOver, onDrop, isDragOver, onSelect }) => (
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
                : convs.map(c => <ConvCard key={c.id} conv={c} onDragStart={onDragStart} onSelect={onSelect} />)
            }
            {isDragOver && <div className="pl-drop-hint"><ChevronRight size={16} /> Buraya bırak</div>}
        </div>
    </div>
);

/* ─── MAIN Pipeline Component ─── */
const Pipeline = () => {
    const { t } = useTranslation();
    const { currentWorkspace, user: currentUser } = useAuth();
    const navigate = useNavigate();
    const [funnels, setFunnels] = useState([]);
    const [selectedFunnelId, setSelectedFunnelId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dragOverCol, setDragOverCol] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dragConv = useRef(null);

    // ── Sidebar ──────────────────────────────────────────
    const [selectedConvId, setSelectedConvId] = useState(null);
    const [members, setMembers] = useState([]);
    // ───────────────────────────────────────────────────

    // ── Filters ──────────────────────────────────────────
    const [filterChannel, setFilterChannel] = useState(null);
    const [filterStatus,  setFilterStatus]  = useState(null);
    const [filterAssign,  setFilterAssign]  = useState(null);
    const [chOpen,  setChOpen]  = useState(false);
    const [stOpen,  setStOpen]  = useState(false);
    const [asOpen,  setAsOpen]  = useState(false);
    const chRef = useRef(null);
    const stRef = useRef(null);
    const asRef = useRef(null);
    // ─────────────────────────────────────────────────────
    const boardRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollState = useCallback(() => {
        const el = boardRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }, []);

    const scrollBoard = (dir) => {
        const el = boardRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * 260, behavior: 'smooth' });
    };

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

            // Backend handles auto-creation of default funnels + stages

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

    // Load members for assignment
    useEffect(() => {
        if (!currentWorkspace) return;
        workspaceAPI.getMembers(currentWorkspace.id)
            .then(r => setMembers(r.data?.members || []))
            .catch(() => {});
    }, [currentWorkspace]);

    // Close filter dropdowns on outside click
    useEffect(() => {
        const handler = (e) => {
            if (chRef.current && !chRef.current.contains(e.target)) setChOpen(false);
            if (stRef.current && !stRef.current.contains(e.target)) setStOpen(false);
            if (asRef.current && !asRef.current.contains(e.target)) setAsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Check scroll state after data/stages change
    useEffect(() => {
        const el = boardRef.current;
        if (!el) return;
        // Small delay to let DOM settle
        const t = setTimeout(updateScrollState, 120);
        const ro = new ResizeObserver(updateScrollState);
        ro.observe(el);
        el.addEventListener('scroll', updateScrollState);
        return () => { clearTimeout(t); ro.disconnect(); el.removeEventListener('scroll', updateScrollState); };
    }, [stages.length, updateScrollState]);

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
        // Search
        if (search) {
            const q = search.toLowerCase();
            if (!((c.contact?.name || '').toLowerCase().includes(q) || (c.aiTopic || '').toLowerCase().includes(q))) return false;
        }
        // Channel
        if (filterChannel && c.channel !== filterChannel) return false;
        // Status
        if (filterStatus && c.status !== filterStatus) return false;
        // Assignment
        if (filterAssign === 'mine' && c.assignedToId !== currentUser?.id) return false;
        if (filterAssign === 'unassigned' && c.assignedToId) return false;
        return true;
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
                            {loading ? 'Yükleniyor...' : `${funnels.length} akış • ${conversations.length} sohbet`}
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
                    {/* Funnel selector */}
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

                    {/* ── Filter selects (Inbox style) ── */}
                    <div className="pl-filters">

                        {/* Channel */}
                        <div className="pl-filter-select-wrap" ref={chRef}>
                            <button
                                className={`pl-filter-select${filterChannel ? ' active' : ''}`}
                                onClick={() => { setChOpen(p => !p); setStOpen(false); setAsOpen(false); }}
                            >
                                {filterChannel === 'WHATSAPP'  && '💬 WhatsApp'}
                                {filterChannel === 'FACEBOOK'  && '📘 Facebook'}
                                {filterChannel === 'INSTAGRAM' && '📸 Instagram'}
                                {filterChannel === 'EMAIL'     && '✉️ E-posta'}
                                {filterChannel === 'WIDGET'    && '🌐 Web'}
                                {filterChannel === 'PHONE'     && '📞 Telefon'}
                                {!filterChannel               && 'Tüm Kanallar'}
                                <ChevronDown size={13} style={{ marginLeft: 'auto', transform: chOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>
                            {chOpen && (
                                <div className="pl-filter-dropdown">
                                    {[null,'WHATSAPP','FACEBOOK','INSTAGRAM','EMAIL','WIDGET','PHONE'].map(ch => (
                                        <button
                                            key={ch || 'all'}
                                            className={`pl-filter-item${filterChannel === ch ? ' selected' : ''}`}
                                            onClick={() => { setFilterChannel(ch); setChOpen(false); }}
                                        >
                                            {ch === 'WHATSAPP'  && '💬 WhatsApp'}
                                            {ch === 'FACEBOOK'  && '📘 Facebook'}
                                            {ch === 'INSTAGRAM' && '📸 Instagram'}
                                            {ch === 'EMAIL'     && '✉️ E-posta'}
                                            {ch === 'WIDGET'    && '🌐 Web'}
                                            {ch === 'PHONE'     && '📞 Telefon'}
                                            {ch === null        && 'Tüm Kanallar'}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Status */}
                        <div className="pl-filter-select-wrap" ref={stRef}>
                            <button
                                className={`pl-filter-select${filterStatus ? ' active' : ''}`}
                                onClick={() => { setStOpen(p => !p); setChOpen(false); setAsOpen(false); }}
                            >
                                {filterStatus === 'OPEN'     && '🟢 Açık'}
                                {filterStatus === 'PENDING'  && '🟡 Beklemede'}
                                {filterStatus === 'RESOLVED' && '✅ Çözüldü'}
                                {!filterStatus              && 'Tüm Durumlar'}
                                <ChevronDown size={13} style={{ marginLeft: 'auto', transform: stOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>
                            {stOpen && (
                                <div className="pl-filter-dropdown">
                                    {[null,'OPEN','PENDING','RESOLVED'].map(st => (
                                        <button
                                            key={st || 'all'}
                                            className={`pl-filter-item${filterStatus === st ? ' selected' : ''}`}
                                            onClick={() => { setFilterStatus(st); setStOpen(false); }}
                                        >
                                            {st === null       && 'Tüm Durumlar'}
                                            {st === 'OPEN'     && '🟢 Açık'}
                                            {st === 'PENDING'  && '🟡 Beklemede'}
                                            {st === 'RESOLVED' && '✅ Çözüldü'}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Assignment */}
                        <div className="pl-filter-select-wrap" ref={asRef}>
                            <button
                                className={`pl-filter-select${filterAssign ? ' active' : ''}`}
                                onClick={() => { setAsOpen(p => !p); setChOpen(false); setStOpen(false); }}
                            >
                                {filterAssign === 'mine'       && '👤 Bana Atanan'}
                                {filterAssign === 'unassigned' && '⬜ Atanmamış'}
                                {!filterAssign                && 'Tüm Temsilciler'}
                                <ChevronDown size={13} style={{ marginLeft: 'auto', transform: asOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>
                            {asOpen && (
                                <div className="pl-filter-dropdown">
                                    {[null,'mine','unassigned'].map(asgn => (
                                        <button
                                            key={asgn || 'all'}
                                            className={`pl-filter-item${filterAssign === asgn ? ' selected' : ''}`}
                                            onClick={() => { setFilterAssign(asgn); setAsOpen(false); }}
                                        >
                                            {asgn === null         && 'Tüm Temsilciler'}
                                            {asgn === 'mine'       && '👤 Bana Atanan'}
                                            {asgn === 'unassigned' && '⬜ Atanmamış'}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Clear */}
                        {(filterChannel || filterStatus || filterAssign) && (
                            <button
                                className="pl-filter-clear-btn"
                                onClick={() => { setFilterChannel(null); setFilterStatus(null); setFilterAssign(null); }}
                                title="Filtreleri temizle"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    {/* Info */}
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
                    <h2>Henüz akış yok</h2>
                    <p>Ayarlar → Akış Yönetimi sayfasından<br />ilk akışınızı oluşturun.</p>
                </div>
            ) : !selectedFunnel ? (
                <div className="pl-empty-state">
                    <Kanban size={52} />
                    <h2>{t('pipeline.selectFunnelTitle')}</h2>
                    <p>Yukarıdaki seçiciden bir akış seçerek<br />durumlarını görüntüleyin.</p>
                </div>
            ) : stages.length === 0 ? (
                <div className="pl-empty-state">
                    <Kanban size={52} />
                    <h2>Bu akışta durum yok</h2>
                    <p>Ayarlar → Akış Yönetimi sayfasından<br />bu akışa durumlar ekleyin.</p>
                </div>
            ) : (
                <div className="pl-board-wrap">
                    {/* Left fade + arrow */}
                    {canScrollLeft && (
                        <button className="pl-scroll-btn pl-scroll-btn--left" onClick={() => scrollBoard(-1)} title="Sola kaydır">
                            <ChevronLeft size={20} />
                        </button>
                    )}
                    <div
                        className={`pl-board${canScrollLeft ? ' pl-board--fade-left' : ''}${canScrollRight ? ' pl-board--fade-right' : ''}`}
                        ref={boardRef}
                        onScroll={updateScrollState}
                    >
                        {stages.map(s => (
                            <StageColumn
                                key={s.id}
                                stage={s}
                                convs={grouped[s.id] || []}
                                onDragStart={handleDragStart}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                isDragOver={dragOverCol === s.id}
                                onSelect={setSelectedConvId}
                            />
                        ))}
                    </div>
                    {/* Right fade + arrow */}
                    {canScrollRight && (
                        <button className="pl-scroll-btn pl-scroll-btn--right" onClick={() => scrollBoard(1)} title="Sağa kaydır">
                            <ChevronRight size={20} />
                        </button>
                    )}
                </div>
            )}

            {/* Contact Sidebar */}
            {selectedConvId && (
                <div
                    className="pl-sidebar-backdrop"
                    onClick={e => { if (e.target === e.currentTarget) setSelectedConvId(null); }}
                >
                    <div className="pl-sidebar-panel">
                        <ContactSidebar
                            conversationId={selectedConvId}
                            isOpen={true}
                            members={members}
                            isOwner={['OWNER','SUPER_ADMIN'].includes(currentUser?.role)}
                            onAssign={() => {}}
                            onClose={() => setSelectedConvId(null)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Pipeline;
