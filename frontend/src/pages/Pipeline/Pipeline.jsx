import { useState, useEffect, useCallback, useRef } from 'react';
import { funnelAPI, conversationAPI, workspaceAPI, teamAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ChevronDown, User, MessageSquare, RefreshCw, Phone, Search, Users, X } from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import '../../components/ContactSidebar/ContactSidebar.css';
import './Pipeline.css';

const PipelineView = () => {
    const { currentWorkspace } = useAuth();
    const [funnels, setFunnels] = useState([]);
    const [selectedFunnelId, setSelectedFunnelId] = useState(null);
    const [stages, setStages] = useState([]);
    const [cards, setCards] = useState({});
    const [loading, setLoading] = useState(false);
    const [funnelOpen, setFunnelOpen] = useState(false);
    const [dragOver, setDragOver] = useState(null);
    const [dragging, setDragging] = useState(null);

    // Filtre state'leri
    const [searchTerm, setSearchTerm] = useState('');
    const [agentFilter, setAgentFilter] = useState(null);
    const [agentFilterOpen, setAgentFilterOpen] = useState(false);
    const agentFilterRef = useRef(null);
    const [teamFilter, setTeamFilter] = useState(null);
    const [teamFilterOpen, setTeamFilterOpen] = useState(false);
    const teamFilterRef = useRef(null);
    const [members, setMembers] = useState([]);
    const [teams, setTeams] = useState([]);

    // Kişi sidebar
    const [selectedContactId, setSelectedContactId] = useState(null);
    const boardRef = useRef(null);
    // Sayfa değiştiğinde sidebar'ı kapat
    useEffect(() => () => setSelectedContactId(null), []);

    useEffect(() => {
        if (!currentWorkspace?.id) return;
        funnelAPI.getAll(currentWorkspace.id).then(res => {
            const data = Array.isArray(res.data) ? res.data : (res.data?.funnels || []);
            setFunnels(data);
            if (data.length > 0) setSelectedFunnelId(data[0].id);
        }).catch(console.error);

        // Members & teams
        Promise.all([
            workspaceAPI.getMembers(currentWorkspace.id).catch(() => ({ data: { members: [] } })),
            teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(() => ({ data: { teams: [] } }))
        ]).then(([mRes, tRes]) => {
            setMembers(mRes.data.members || []);
            setTeams(tRes.data.teams || []);
        });

        // Dışarı tıklayınca kapat
        const handleOutside = (e) => {
            if (agentFilterRef.current && !agentFilterRef.current.contains(e.target)) setAgentFilterOpen(false);
            if (teamFilterRef.current && !teamFilterRef.current.contains(e.target)) setTeamFilterOpen(false);
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [currentWorkspace?.id]);

    const loadCards = useCallback(async () => {
        if (!currentWorkspace?.id || !selectedFunnelId) return;
        setLoading(true);
        try {
            const funnel = funnels.find(f => f.id === selectedFunnelId);
            if (!funnel) return;
            const sortedStages = [...(funnel.stages || [])].sort((a, b) => a.order - b.order);
            setStages(sortedStages);

            const map = {};
            sortedStages.forEach(s => { map[s.id] = []; });

            const filterParams = {};
            if (agentFilter) filterParams.assignedToId = agentFilter;
            if (teamFilter) filterParams.teamId = teamFilter;
            if (searchTerm.trim()) filterParams.search = searchTerm.trim();

            // Fetch per stage
            await Promise.all(sortedStages.map(async (stage) => {
                try {
                    const res = await conversationAPI.getAll(currentWorkspace.id, {
                        limit: 100, page: 1, funnelStageId: stage.id, ...filterParams
                    });
                    map[stage.id] = res.data?.conversations || res.data || [];
                } catch { map[stage.id] = []; }
            }));

            setCards({ ...map });
        } catch (e) {
            console.error('Pipeline load error:', e);
        } finally {
            setLoading(false);
        }
    }, [currentWorkspace?.id, selectedFunnelId, funnels, agentFilter, teamFilter, searchTerm]);

    useEffect(() => { loadCards(); }, [loadCards]);

    const selectedFunnel = funnels.find(f => f.id === selectedFunnelId);

    const moveCard = async (convId, targetStageId) => {
        if (!currentWorkspace?.id) return;
        try {
            await conversationAPI.updateFunnel(currentWorkspace.id, convId, {
                funnelStageId: targetStageId,
            });
            loadCards();
        } catch (e) { console.error(e); }
    };

    const onDragStart = (e, convId, fromStageId) => {
        setDragging({ convId, fromStageId });
        e.dataTransfer.effectAllowed = 'move';
    };
    const onDragOver = (e, stageId) => { e.preventDefault(); setDragOver(stageId); };
    const onDrop = (e, targetStageId) => {
        e.preventDefault();
        if (dragging && dragging.fromStageId !== targetStageId) moveCard(dragging.convId, targetStageId);
        setDragging(null); setDragOver(null);
    };
    const onDragEnd = () => { setDragging(null); setDragOver(null); };

    const getInitials = (name) => name ? name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?';
    const srcIcon = { FACEBOOK: '📘', INSTAGRAM: '📷', WHATSAPP: '💬', WEBSITE: '🌐', MANUAL: '✏️' };

    return (
        <div className="pipeline-root">
            <div className="pipeline-toolbar">
                <div className="pipeline-funnel-selector" onClick={() => setFunnelOpen(o => !o)}>
                    <span>{selectedFunnel ? `${selectedFunnel.icon || '📊'} ${selectedFunnel.name}` : 'Funnel Seç'}</span>
                    <ChevronDown size={14} />
                    {funnelOpen && (
                        <div className="pipeline-funnel-dropdown">
                            {funnels.map(f => (
                                <button key={f.id}
                                    className={`pipeline-funnel-item${f.id === selectedFunnelId ? ' active' : ''}`}
                                    onClick={e => { e.stopPropagation(); setSelectedFunnelId(f.id); setFunnelOpen(false); }}>
                                    {f.icon || '📊'} {f.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button className="pipeline-refresh-btn" onClick={loadCards} title="Yenile">
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>

                {/* ARAMA */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, color: '#9ca3af', pointerEvents: 'none' }} />
                    <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Kişi ara..."
                        style={{ paddingLeft: 28, paddingRight: searchTerm ? 26 : 10, paddingTop: 6, paddingBottom: 6, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, width: 160, background: '#f9fafb', outline: 'none' }}
                    />
                    {searchTerm && <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}><X size={12} /></button>}
                </div>

                {/* KİŞİ FİLTRESİ */}
                <div ref={agentFilterRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => setAgentFilterOpen(o => !o)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: `1px solid ${agentFilter ? '#ef4444' : '#e5e7eb'}`, borderRadius: 6, background: agentFilter ? '#fef2f2' : '#f9fafb', color: agentFilter ? '#ef4444' : '#374151', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                        <User size={13} />
                        {agentFilter ? (members.find(m => m.user?.id === agentFilter)?.user?.name || 'Kişi') : 'Tüm Kişiler'}
                        <ChevronDown size={12} />
                    </button>
                    {agentFilterOpen && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999, minWidth: 180, padding: '4px 0' }}>
                            <button onClick={() => { setAgentFilter(null); setAgentFilterOpen(false); }} style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: !agentFilter ? '#fef2f2' : 'none', color: !agentFilter ? '#ef4444' : '#374151', border: 'none', cursor: 'pointer', fontSize: 13 }}>Tüm Kişiler</button>
                            {members.map(m => (
                                <button key={m.user?.id} onClick={() => { setAgentFilter(m.user?.id); setAgentFilterOpen(false); }}
                                    style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: agentFilter === m.user?.id ? '#fef2f2' : 'none', color: agentFilter === m.user?.id ? '#ef4444' : '#374151', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                                    {m.user?.name || m.user?.email}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* TAKIM FİLTRESİ */}
                <div ref={teamFilterRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => setTeamFilterOpen(o => !o)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: `1px solid ${teamFilter ? '#8b5cf6' : '#e5e7eb'}`, borderRadius: 6, background: teamFilter ? '#f5f3ff' : '#f9fafb', color: teamFilter ? '#8b5cf6' : '#374151', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                        <Users size={13} />
                        {teamFilter ? (teams.find(t => t.id === teamFilter)?.name || 'Takım') : 'Tüm Takımlar'}
                        <ChevronDown size={12} />
                    </button>
                    {teamFilterOpen && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999, minWidth: 180, padding: '4px 0' }}>
                            <button onClick={() => { setTeamFilter(null); setTeamFilterOpen(false); }} style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: !teamFilter ? '#f5f3ff' : 'none', color: !teamFilter ? '#8b5cf6' : '#374151', border: 'none', cursor: 'pointer', fontSize: 13 }}>Tüm Takımlar</button>
                            {teams.map(t => (
                                <button key={t.id} onClick={() => { setTeamFilter(t.id); setTeamFilterOpen(false); }}
                                    style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: teamFilter === t.id ? '#f5f3ff' : 'none', color: teamFilter === t.id ? '#8b5cf6' : '#374151', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                                    {t.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Aktif filtre varsa temizle */}
                {(agentFilter || teamFilter || searchTerm) && (
                    <button onClick={() => { setAgentFilter(null); setTeamFilter(null); setSearchTerm(''); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fef2f2', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>
                        <X size={12} /> Filtreyi Temizle
                    </button>
                )}

                <span className="pipeline-total-label">
                    {Object.values(cards).flat().length} kişi
                </span>
            </div>

            {loading ? (
                <div className="pipeline-loading"><div className="pipeline-spinner" /><span>Yükleniyor...</span></div>
            ) : stages.length === 0 ? (
                <div className="pipeline-empty">Bu funnel için aşama bulunamadı.</div>
            ) : (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    {/* Nav strip */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', background: '#f1f5f9',
                        borderBottom: '1px solid #e2e8f0', flexShrink: 0
                    }}>
                        <button
                            onClick={() => boardRef.current?.scrollBy({ left: -280, behavior: 'smooth' })}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 32, height: 32, background: '#fff',
                                border: '1px solid #d1d5db', borderRadius: 8,
                                cursor: 'pointer', fontSize: 18, color: '#374151',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
                            }}
                            title="Sola Kaydır"
                        >&#8592;</button>
                        <button
                            onClick={() => boardRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 32, height: 32, background: '#fff',
                                border: '1px solid #d1d5db', borderRadius: 8,
                                cursor: 'pointer', fontSize: 18, color: '#374151',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
                            }}
                            title="Sağa Kaydır"
                        >&#8594;</button>
                    </div>
                    <div className="pipeline-board" ref={boardRef}>
                    {stages.map(stage => {
                        const stageCards = cards[stage.id] || [];
                        const isOver = dragOver === stage.id;
                        return (
                            <div key={stage.id}
                                className={`pipeline-column${isOver ? ' drag-over' : ''}`}
                                onDragOver={e => onDragOver(e, stage.id)}
                                onDrop={e => onDrop(e, stage.id)}>
                                <div className="pipeline-col-header" style={{ borderTop: `3px solid ${stage.color || '#6366f1'}` }}>
                                    <span className="pipeline-col-name">{stage.name}</span>
                                    <span className="pipeline-col-count" style={{ background: stage.color || '#6366f1' }}>{stageCards.length}</span>
                                </div>
                                <div className="pipeline-col-body">
                                    {stageCards.length === 0 ? (
                                        <div className="pipeline-empty-col">Boş</div>
                                    ) : stageCards.map(conv => (
                                        <div key={conv.id}
                                            className="pipeline-card"
                                            draggable
                                            style={{ cursor: 'pointer' }}
                                            onDragStart={e => onDragStart(e, conv.id, stage.id)}
                                            onDragEnd={onDragEnd}
                                            onClick={() => setSelectedContactId(conv.contactId || conv.contact?.id)}>
                                            <div className="pipeline-card-top">
                                                <div className="pipeline-card-avatar">{getInitials(conv.contact?.name || conv.customerName)}</div>
                                                <div className="pipeline-card-info">
                                                    <span className="pipeline-card-name">{conv.contact?.name || conv.customerName || 'İsimsiz'}</span>
                                                    <span className="pipeline-card-source">{srcIcon[conv.source] || '💬'} {conv.source || ''}</span>
                                                </div>
                                            </div>
                                            {conv.lastMessage && (
                                                <div className="pipeline-card-msg">
                                                    <MessageSquare size={10} />
                                                    <span>{conv.lastMessage.substring(0, 55)}{conv.lastMessage.length > 55 ? '…' : ''}</span>
                                                </div>
                                            )}
                                            {conv.contact?.phone && (
                                                <div className="pipeline-card-detail"><Phone size={10} /> {conv.contact.phone}</div>
                                            )}
                                            {conv.assignedAgent?.name && (
                                                <div className="pipeline-card-footer">
                                                    <span className="pipeline-card-agent"><User size={10} /> {conv.assignedAgent.name}</span>
                                                </div>
                                            )}
                                            {/* Quick move — sadece sonraki aşama + son aşama */}
                                            <div className="pipeline-stage-btns">
                                                {(() => {
                                                    const currentIdx = stages.findIndex(s => s.id === stage.id);
                                                    const nextStage = stages[currentIdx + 1];
                                                    const lastStage = stages[stages.length - 1];
                                                    const shown = [];
                                                    if (nextStage) shown.push(nextStage);
                                                    if (lastStage && lastStage.id !== stage.id && lastStage.id !== nextStage?.id) shown.push(lastStage);
                                                    return shown.map(s => (
                                                        <button key={s.id}
                                                            className="pipeline-stage-move-btn"
                                                            style={{ borderColor: s.color, color: s.color }}
                                                            onClick={(e) => { e.stopPropagation(); moveCard(conv.id, s.id); }}
                                                            title={s.name}>
                                                            → {s.name.length > 8 ? s.name.substring(0, 8) + '…' : s.name}
                                                        </button>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </div>
            )}
            {/* ContactSidebar — 320px fixed overlay */}
            {selectedContactId && (
                <div style={{
                    position: 'fixed', top: 0, right: 0,
                    width: 320, height: '100vh',
                    zIndex: 1499, overflowY: 'auto',
                    boxShadow: '-4px 0 24px rgba(0,0,0,0.12)'
                }}>
                    <ContactSidebar
                        contactId={selectedContactId}
                        isOpen={true}
                        onClose={() => setSelectedContactId(null)}
                        members={members}
                        teams={teams}
                        isOwner={true}
                        onAssignTeam={async (convId, teamId) => {
                            try { await conversationAPI.assign(currentWorkspace.id, convId, { teamId }); } catch (e) { console.error(e); }
                        }}
                        onAssignUser={async (convId, userId) => {
                            try { await conversationAPI.assign(currentWorkspace.id, convId, { assignedToId: userId || null }); } catch (e) { console.error(e); }
                        }}
                        onTakeOver={async (convId) => {
                            try { await conversationAPI.takeOver(currentWorkspace.id, convId); } catch (e) { console.error(e); }
                        }}
                        currentUserId={null}
                    />
                </div>
            )}
        </div>
    );
};

export default PipelineView;
