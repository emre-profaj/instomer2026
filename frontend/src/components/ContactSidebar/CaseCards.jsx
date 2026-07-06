import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { caseAPI, funnelAPI, conversationAPI, contactAPI } from '../../services/api';
import { Briefcase, Plus, ChevronDown, ChevronRight, User, Users, Loader, X, Check, AlertTriangle } from 'lucide-react';

const STATUS_LABELS = {
    ACTIVE: { label: 'Aktif', color: '#3b82f6', bg: '#eff6ff' },
    WON: { label: 'Kazandı', color: '#10b981', bg: '#ecfdf5' },
    LOST: { label: 'Kaybetti', color: '#ef4444', bg: '#fef2f2' },
    CLOSED: { label: 'Kapandı', color: '#6b7280', bg: '#f3f4f6' }
};

const PRIORITY_ICONS = {
    LOW: '🔵',
    NORMAL: '',
    HIGH: '🟠',
    URGENT: '🔴'
};

const CaseCards = ({ workspaceId, contactId, members = [], teams = [], conversationId, onCaseLinked, inline = false, onStageChanged = null, onCaseInfo = null, showOnly = null }) => {
    // Flatten hierarchical teams
    const flatTeams = (() => {
        const result = [];
        const flatten = (list) => {
            for (const t of list) {
                result.push(t);
                if (t.children?.length) flatten(t.children);
            }
        };
        flatten(teams);
        return result;
    })();
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [funnels, setFunnels] = useState([]);
    const [editingCaseId, setEditingCaseId] = useState(null);
    const [assigningCaseId, setAssigningCaseId] = useState(null);
    const [showInlineCreate, setShowInlineCreate] = useState(false);
    const [inlineNewTitle, setInlineNewTitle] = useState('');
    const [inlineCreating, setInlineCreating] = useState(false);
    const [showCaseSwitch, setShowCaseSwitch] = useState(false);

    // Mega menü state (inline mode) — must be before any early returns to respect Rules of Hooks
    const [megaOpen, setMegaOpen] = useState(false);
    const [megaPos, setMegaPos] = useState({ top: 0, left: 0 });
    const [megaHoverFunnel, setMegaHoverFunnel] = useState(null);
    const megaRef = useRef(null);

    useEffect(() => {
        if (workspaceId && contactId) {
            fetchCases();
            loadFunnels();
        }
    }, [workspaceId, contactId]);

    // Listen for funnel stage updates from Inbox header or socket to keep local case state in sync
    useEffect(() => {
        const handler = (e) => {
            const { conversationId: updatedConvId, contactId: updatedContactId, funnelStageId } = e.detail || {};
            if (!funnelStageId) return;
            
            // If we know this update belongs to the active contact, reload to get fresh data
            if (updatedContactId === contactId) {
                loadCases();
                return;
            }

            // Update local case that owns this conversation
            setCases(prev => prev.map(c => {
                const ownsConv = c.conversations?.some(cv => cv.id === updatedConvId);
                if (!ownsConv) return c;
                // Find which funnel this stage belongs to
                let funnelType = c.funnelType;
                for (const f of funnels) {
                    if ((f.stages || []).some(s => s.id === funnelStageId)) {
                        funnelType = f.id;
                        break;
                    }
                }
                return { ...c, funnelStageId, funnelType };
            }));
        };
        window.addEventListener('websocket:funnel_stage_updated', handler);
        return () => window.removeEventListener('websocket:funnel_stage_updated', handler);
    }, [conversationId, contactId, funnels]);

    // Refresh cases when case_updated or case_cards_refresh is received
    useEffect(() => {
        const handleCaseUpdated = (e) => {
            const { caseId, changes } = e.detail || {};
            if (!caseId) return;
            // Update matching case locally
            setCases(prev => prev.map(c => {
                if (c.id !== caseId) return c;
                const updates = {};
                if (changes?.title !== undefined) updates.title = changes.title;
                if (changes?.status !== undefined) updates.status = changes.status;
                if (changes?.funnelType !== undefined) updates.funnelType = changes.funnelType;
                if (changes?.funnelStageId !== undefined) updates.funnelStageId = changes.funnelStageId;
                if (changes?.assignedToId !== undefined) updates.assignedToId = changes.assignedToId;
                if (changes?.assignedTeamId !== undefined) updates.assignedTeamId = changes.assignedTeamId;
                return Object.keys(updates).length > 0 ? { ...c, ...updates } : c;
            }));
        };
        const handleRefresh = () => { fetchCases(); };

        window.addEventListener('websocket:case_updated', handleCaseUpdated);
        window.addEventListener('case_cards_refresh', handleRefresh);
        return () => {
            window.removeEventListener('websocket:case_updated', handleCaseUpdated);
            window.removeEventListener('case_cards_refresh', handleRefresh);
        };
    }, [workspaceId, contactId]);

    const fetchCases = async () => {
        try {
            const res = await caseAPI.getByContact(workspaceId, contactId);
            setCases(res.data || []);
        } catch (err) {
            console.error('Case fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadFunnels = async () => {
        try {
            const res = await funnelAPI.getAll(workspaceId);
            setFunnels(Array.isArray(res.data) ? res.data : (res.data?.funnels || []));
        } catch { }
    };

    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        setCreating(true);
        try {
            await caseAPI.create(workspaceId, contactId, {
                title: newTitle.trim(),
                conversationId: conversationId || null
            });
            setNewTitle('');
            setShowCreateForm(false);
            fetchCases();
        } catch (err) {
            console.error('Case create error:', err);
            alert('Case oluşturulamadı');
        } finally {
            setCreating(false);
        }
    };

    const handleInlineCreate = async () => {
        if (!inlineNewTitle.trim()) return;
        setInlineCreating(true);
        try {
            await caseAPI.create(workspaceId, contactId, {
                title: inlineNewTitle.trim(),
                conversationId: conversationId || null
            });
            setInlineNewTitle('');
            setShowInlineCreate(false);
            fetchCases();
            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
        } catch (err) {
            console.error('Inline case create error:', err);
        } finally {
            setInlineCreating(false);
        }
    };

    const handleUpdateStage = async (caseId, funnelType, funnelStageId) => {
        try {
            await caseAPI.update(workspaceId, caseId, { funnelType, funnelStageId });
            setCases(prev => prev.map(c => c.id === caseId ? { ...c, funnelType, funnelStageId } : c));

            // Also sync conversation's funnelStageId (bidirectional sync)
            if (conversationId && workspaceId) {
                try {
                    await conversationAPI.updateFunnel(workspaceId, conversationId, { funnelStageId, funnelType });
                } catch (_) {}
            }

            // Note: Contact status/funnelStageId sync is handled by backend cascade
            // (updateCase → contact update, updateFunnel → contact update)

            // Find stage info for callback
            let stageName = '', stageColor = '#6366f1';
            for (const f of funnels) {
                const s = (f.stages || []).find(s => s.id === funnelStageId);
                if (s) { stageName = s.name; stageColor = s.color || '#6366f1'; break; }
            }

            // Notify parent (ContactSidebar → Inbox) about the change
            if (onStageChanged) {
                onStageChanged({ funnelType, funnelStageId, stageName, stageColor });
            }

            // Dispatch custom event for any listener (ContactSidebar funnelStage state)
            window.dispatchEvent(new CustomEvent('websocket:funnel_stage_updated', {
                detail: { conversationId, funnelStageId, stageName, stageColor }
            }));
        } catch (err) {
            console.error('Stage update error:', err);
        }
    };

    const handleAssign = async (caseId, assignedToId, assignedTeamId) => {
        try {
            const res = await caseAPI.assign(workspaceId, caseId, { assignedToId, assignedTeamId });
            setCases(prev => prev.map(c => c.id === caseId ? {
                ...c,
                assignedToId,
                assignedTeamId,
                assignedTo: members.find(m => (m.user?.id || m.userId || m.id) === assignedToId)?.user || null,
                team: flatTeams.find(t => t.id === assignedTeamId) || null
            } : c));
            setAssigningCaseId(null);
            if (res.data?.cascaded) {
                const { conversations, activities } = res.data.cascaded;
                if (conversations > 0 || activities > 0) {
                    // Silently cascade - no alert needed
                }
            }
        } catch (err) {
            console.error('Assign error:', err);
            alert('Atama yapılamadı');
        }
    };

    const handleStatusChange = async (caseId, status) => {
        try {
            await caseAPI.update(workspaceId, caseId, { status });
            setCases(prev => prev.map(c => c.id === caseId ? { ...c, status } : c));
        } catch (err) {
            console.error('Status update error:', err);
        }
    };

    const handleLinkCurrentConversation = async (caseId) => {
        if (!conversationId) return;
        try {
            await caseAPI.linkConversation(workspaceId, caseId, conversationId);
            fetchCases();
            if (onCaseLinked) onCaseLinked(caseId);
        } catch (err) {
            console.error('Link error:', err);
        }
    };

    const activeCases = cases.filter(c => c.status === 'ACTIVE');
    const closedCases = cases.filter(c => c.status !== 'ACTIVE');

    // Find current case for current conversation
    const currentConvCase = conversationId ? cases.find(c =>
        c.conversations?.some(cv => cv.id === conversationId)
    ) : null;

    // Compute displayCase for inline mode (needed for the useEffect below)
    const displayCase = inline ? (currentConvCase || activeCases[0] || cases[0]) : null;

    // Notify parent about the active case info (for header display) — MUST be at top level, not inside conditional
    useEffect(() => {
        if (inline && displayCase && onCaseInfo) {
            onCaseInfo({ caseNumber: displayCase.caseNumber, caseId: displayCase.id, title: displayCase.title, status: displayCase.status });
        }
    }, [inline, displayCase?.caseNumber, displayCase?.id, displayCase?.status, displayCase?.title]);

    if (loading) {
        return (
            <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', fontSize: '0.82rem' }}>
                <Loader size={14} className="spin" /> Case'ler yükleniyor...
            </div>
        );
    }

    const getFunnelStageLabel = (c) => {
        if (!c.funnelStageId) return null;
        for (const f of funnels) {
            const stage = (f.stages || []).find(s => s.id === c.funnelStageId);
            if (stage) return { name: stage.name, color: stage.color || '#6366f1', funnelName: f.name };
        }
        return null;
    };



    // ── inline mode: case otomatik oluşuyor, sadece mevcut case bilgisini göster ──
    if (inline) {
        if (!displayCase) return null;

        const stageInfo = getFunnelStageLabel(displayCase);
        const statusInfo = STATUS_LABELS[displayCase.status] || STATUS_LABELS.ACTIVE;

        // Seçili akış ve aşama bilgisini bul
        const activeFunnel = funnels.find(f => (f.stages || []).some(s => s.id === displayCase.funnelStageId));
        const activeStageLabel = stageInfo?.name || null;
        const currentStageColor = stageInfo?.color || '#6366f1';
        const pillLabel = activeFunnel && activeStageLabel
            ? `${activeFunnel.name} / ${activeStageLabel}`
            : activeStageLabel || 'Akış seç...';

        return (
            <>
                {/* ── Akış / Aşama Mega Menü Trigger ── */}
                {(!showOnly || showOnly === 'stages') && (
                    <div style={{ padding: '2px 12px 4px' }}>
                        <div ref={megaRef} style={{ position: 'relative' }}>
                            <button
                                onClick={e => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMegaPos({ top: rect.bottom + 4, right: Math.max(10, window.innerWidth - rect.right) });
                                    setMegaHoverFunnel(activeFunnel?.id || null);
                                    setMegaOpen(v => !v);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                    background: '#f8fafc', border: '1px solid #e2e8f0',
                                    borderRadius: 8, padding: '4px 10px',
                                    cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, color: '#374151',
                                    whiteSpace: 'nowrap', overflow: 'hidden'
                                }}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: currentStageColor }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'left' }}>
                                    {activeFunnel ? (
                                        <><span style={{ color: '#94a3b8', fontWeight: 500 }}>{activeFunnel.name}</span><span style={{ color: '#94a3b8', margin: '0 3px' }}>/</span><span>{activeStageLabel || 'Aşama Seç'}</span></>
                                    ) : (pillLabel)}
                                </span>
                                <ChevronDown size={14} color="#64748b" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                            </button>

                            {/* ── Mega Menü Portal ── */}
                            {megaOpen && ReactDOM.createPortal(
                                <>
                                    {/* Backdrop */}
                                    <div
                                        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                                        onClick={() => { setMegaOpen(false); setMegaHoverFunnel(null); }}
                                    />
                                    <div style={{
                                        position: 'fixed',
                                        top: megaPos.top,
                                        right: megaPos.right,
                                        zIndex: 99999,
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 12,
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                        padding: 6,
                                        display: 'flex',
                                        flexDirection: 'row',
                                        gap: 2,
                                        minWidth: 280,
                                        maxWidth: 380,
                                    }}>
                                        {/* Sol panel: Akışlar */}
                                        <div style={{ minWidth: 120, maxWidth: 150, borderRight: '1px solid #f1f5f9', paddingRight: 6 }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>Akış</div>
                                            {funnels.map(funnel => {
                                                const isActive = activeFunnel?.id === funnel.id;
                                                const isHovered = megaHoverFunnel === funnel.id;
                                                const isHighlighted = isActive || isHovered;
                                                return (
                                                    <button
                                                        key={funnel.id}
                                                        onMouseEnter={() => setMegaHoverFunnel(funnel.id)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                                                            padding: '5px 7px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                                            fontSize: '0.75rem', fontWeight: isActive ? 700 : 500,
                                                            background: isHighlighted ? '#eff6ff' : 'transparent',
                                                            color: isHighlighted ? '#1d4ed8' : '#374151',
                                                            transition: 'background 0.1s'
                                                        }}
                                                    >
                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: funnel.color || '#6366f1', flexShrink: 0 }} />
                                                        {funnel.name}
                                                        <svg width="12" height="12" viewBox="0 0 12 12" style={{ marginLeft: 'auto', opacity: 0.4 }}><path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Sağ panel: Aşamalar */}
                                        {(() => {
                                            const displayFunnel = megaHoverFunnel
                                                ? funnels.find(f => f.id === megaHoverFunnel)
                                                : (activeFunnel || funnels[0]);
                                            if (!displayFunnel) return null;
                                            const stages = displayFunnel.stages || [];
                                            const isActiveFunnel = activeFunnel?.id === displayFunnel.id;
                                            return (
                                                <div style={{ minWidth: 120, maxWidth: 160 }}>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>{displayFunnel.name}</div>
                                                    {stages.map(stage => {
                                                        const isSelected = displayCase.funnelStageId === stage.id && isActiveFunnel;
                                                        return (
                                                            <button
                                                                key={stage.id}
                                                                onClick={() => {
                                                                    handleUpdateStage(displayCase.id, displayFunnel.id, stage.id);
                                                                    setMegaOpen(false);
                                                                    setMegaHoverFunnel(null);
                                                                }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                                                                    padding: '5px 7px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                                                    fontSize: '0.75rem', fontWeight: isSelected ? 700 : 400,
                                                                    background: isSelected ? (stage.color || '#6366f1') + '18' : 'transparent',
                                                                    color: isSelected ? (stage.color || '#6366f1') : '#374151',
                                                                    transition: 'background 0.1s'
                                                                }}
                                                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                                                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: stage.color || '#6366f1' }} />
                                                                {stage.name}
                                                                {isSelected && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: stage.color || '#6366f1' }}>✓</span>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>
                    </div>
                )}

                {/* ── Yeni Case / Case Değiştir ── */}
                {(!showOnly || showOnly === 'actions') && (
                    <>
                        <div style={{ padding: showOnly === 'actions' ? '0' : '0 12px 4px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => { setShowInlineCreate(v => !v); setShowCaseSwitch(false); }}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: '0.68rem', fontWeight: 600, color: '#8b5cf6',
                                    display: 'flex', alignItems: 'center', gap: 3, padding: '2px 4px'
                                }}
                            >
                                <Plus size={11} /> Yeni Case
                            </button>
                            {cases.filter(c => c.id !== displayCase?.id && c.status === 'ACTIVE').length > 0 && (
                                <button
                                    onClick={() => { setShowCaseSwitch(v => !v); setShowInlineCreate(false); }}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        fontSize: '0.68rem', fontWeight: 500, color: '#6b7280',
                                        display: 'flex', alignItems: 'center', gap: 3, padding: '2px 4px'
                                    }}
                                >
                                    ↔ Değiştir
                                </button>
                            )}
                        </div>

                        {/* Yeni Case Form */}
                        {showInlineCreate && (
                            <div style={{ padding: showOnly === 'actions' ? '4px 0' : '0 12px 6px', display: 'flex', gap: 6 }}>
                                <input
                                    type="text"
                                    value={inlineNewTitle}
                                    onChange={e => setInlineNewTitle(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && inlineNewTitle.trim()) {
                                            handleInlineCreate();
                                        } else if (e.key === 'Escape') {
                                            setShowInlineCreate(false);
                                            setInlineNewTitle('');
                                        }
                                    }}
                                    placeholder="Case başlığı..."
                                    autoFocus
                                    style={{
                                        flex: 1, fontSize: '0.74rem', padding: '4px 8px',
                                        border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none'
                                    }}
                                />
                                <button
                                    onClick={() => handleInlineCreate()}
                                    disabled={inlineCreating || !inlineNewTitle.trim()}
                                    style={{
                                        background: '#8b5cf6', color: '#fff', border: 'none',
                                        borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                                        fontSize: '0.72rem', fontWeight: 600, opacity: inlineCreating ? 0.6 : 1
                                    }}
                                >
                                    {inlineCreating ? '...' : 'Oluştur'}
                                </button>
                            </div>
                        )}

                        {/* Case Değiştir Dropdown */}
                        {showCaseSwitch && (
                            <div style={{
                                padding: showOnly === 'actions' ? '4px 0' : '4px 12px 6px', display: 'flex', flexDirection: 'column', gap: 2
                            }}>
                                <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>
                                    Diğer Case'ler
                                </div>
                                {cases.filter(c => c.id !== displayCase?.id && c.status === 'ACTIVE').map(c => (
                                    <button
                                        key={c.id}
                                        onClick={async () => {
                                            try {
                                                await caseAPI.linkConversation(workspaceId, c.id, conversationId);
                                                await fetchCases();
                                                setShowCaseSwitch(false);
                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                            } catch (err) { console.error('Case switch error:', err); }
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            background: '#f8fafc', border: '1px solid #e2e8f0',
                                            borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
                                            fontSize: '0.72rem', fontWeight: 500, color: '#374151',
                                            textAlign: 'left', width: '100%'
                                        }}
                                    >
                                        <Briefcase size={11} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.6rem', color: '#a1a1aa', fontFamily: 'monospace' }}>{c.caseNumber}</span>
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                                    </button>
                                ))}
                                {cases.filter(c => c.id !== displayCase?.id && c.status === 'ACTIVE').length === 0 && (
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', padding: '4px 0' }}>
                                        Başka aktif case yok
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </>
        );
    }

    // ── Normal (standalone) mode ──
    return (
        <div style={{ margin: '4px 0' }}>
            {/* Header */}
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px',
                    cursor: 'pointer', userSelect: 'none'
                }}
            >
                {expanded ? <ChevronDown size={14} style={{ color: '#6b7280' }} /> : <ChevronRight size={14} style={{ color: '#6b7280' }} />}
                <Briefcase size={14} style={{ color: '#8b5cf6' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                    Case'ler
                </span>
                <span style={{
                    fontSize: '0.7rem', fontWeight: 600, color: '#fff',
                    background: activeCases.length > 0 ? '#8b5cf6' : '#9ca3af',
                    borderRadius: 10, padding: '1px 7px', marginLeft: 'auto'
                }}>
                    {activeCases.length}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); setShowCreateForm(!showCreateForm); }}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                        color: '#8b5cf6', display: 'flex', alignItems: 'center'
                    }}
                    title="Yeni Case"
                >
                    <Plus size={16} />
                </button>
            </div>

            {expanded && (
                <div style={{ padding: '0 16px' }}>
                    {/* Create Form */}
                    {showCreateForm && (
                        <div style={{
                            background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10,
                            padding: 12, marginBottom: 8
                        }}>
                            <input
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                placeholder="Case başlığı (ör: Gastroenteroloji Randevu)"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                style={{
                                    width: '100%', padding: '8px 12px', border: '1px solid #d8b4fe',
                                    borderRadius: 8, fontSize: '0.85rem', outline: 'none',
                                    boxSizing: 'border-box', background: '#fff'
                                }}
                            />
                            <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => { setShowCreateForm(false); setNewTitle(''); }}
                                    style={{
                                        padding: '5px 12px', borderRadius: 6, border: '1px solid #e5e7eb',
                                        background: '#fff', fontSize: '0.78rem', cursor: 'pointer', color: '#6b7280'
                                    }}
                                >İptal</button>
                                <button
                                    onClick={handleCreate}
                                    disabled={creating || !newTitle.trim()}
                                    style={{
                                        padding: '5px 12px', borderRadius: 6, border: 'none',
                                        background: '#8b5cf6', color: '#fff', fontSize: '0.78rem',
                                        cursor: creating ? 'wait' : 'pointer', opacity: creating ? 0.6 : 1
                                    }}
                                >{creating ? 'Oluşturuluyor...' : 'Oluştur'}</button>
                            </div>
                        </div>
                    )}

                    {/* No cases */}
                    {cases.length === 0 && !showCreateForm && (
                        <div style={{
                            padding: '12px', textAlign: 'center', fontSize: '0.8rem',
                            color: '#9ca3af', borderRadius: 8
                        }}>
                            Henüz case yok
                        </div>
                    )}

                    {/* Case Cards */}
                    {activeCases.map(c => {
                        const stageInfo = getFunnelStageLabel(c);
                        const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.ACTIVE;
                        const isCurrentConv = currentConvCase?.id === c.id;
                        const prioIcon = PRIORITY_ICONS[c.priority] || '';

                        return (
                            <div
                                key={c.id}
                                style={{
                                    background: isCurrentConv ? '#faf5ff' : '#f8fafc',
                                    border: isCurrentConv ? '1.5px solid #c4b5fd' : '1px solid #e5e7eb',
                                    borderRadius: 10, padding: '10px 12px', marginBottom: 6,
                                    transition: 'all 0.15s'
                                }}
                            >
                                {/* Case Header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <span style={{ fontSize: '0.68rem', color: '#a78bfa', fontWeight: 600, fontFamily: 'monospace' }}>
                                        {c.caseNumber}
                                    </span>
                                    {prioIcon && <span style={{ fontSize: '0.7rem' }}>{prioIcon}</span>}
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                                        {/* Status badge */}
                                        <select
                                            value={c.status}
                                            onChange={e => handleStatusChange(c.id, e.target.value)}
                                            style={{
                                                fontSize: '0.68rem', fontWeight: 600, padding: '1px 4px',
                                                borderRadius: 4, border: 'none', cursor: 'pointer',
                                                color: statusInfo.color, background: statusInfo.bg
                                            }}
                                        >
                                            {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                                <option key={k} value={k}>{v.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Title */}
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1f2937', lineHeight: 1.3, marginBottom: 6 }}>
                                    {c.title}
                                </div>

                                {/* Pipeline Stage */}
                                <div style={{ marginBottom: 6 }}>
                                    <select
                                        value={c.funnelStageId || ''}
                                        onChange={e => {
                                            const stageId = e.target.value;
                                            if (!stageId) {
                                                handleUpdateStage(c.id, null, null);
                                                return;
                                            }
                                            // Find funnel for this stage
                                            for (const f of funnels) {
                                                const stage = (f.stages || []).find(s => s.id === stageId);
                                                if (stage) {
                                                    handleUpdateStage(c.id, f.id, stageId);
                                                    break;
                                                }
                                            }
                                        }}
                                        style={{
                                            width: '100%', padding: '4px 8px', fontSize: '0.78rem',
                                            border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                                            color: stageInfo ? stageInfo.color : '#6b7280',
                                            background: '#fff', outline: 'none'
                                        }}
                                    >
                                        <option value="">Aşama seç...</option>
                                        {funnels.map(f => (
                                            <optgroup key={f.id} label={`${f.icon || '📁'} ${f.name}`}>
                                                {(f.stages || []).map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>

                                {/* Assignment */}
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                                    {/* Agent */}
                                    <select
                                        value={c.assignedToId || ''}
                                        onChange={e => handleAssign(c.id, e.target.value || null, c.assignedTeamId)}
                                        style={{
                                            flex: 1, padding: '3px 6px', fontSize: '0.75rem',
                                            border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer',
                                            background: '#fff', outline: 'none', minWidth: 0
                                        }}
                                    >
                                        <option value="">👤 Kişi ata...</option>
                                        {members.map(m => {
                                            const uid = m.user?.id || m.userId || m.id;
                                            const uname = m.user?.name || m.name || 'Bilinmeyen';
                                            return (
                                                <option key={uid} value={uid}>{uname}</option>
                                            );
                                        })}
                                    </select>
                                    {/* Team */}
                                    <select
                                        value={c.assignedTeamId || ''}
                                        onChange={e => handleAssign(c.id, c.assignedToId, e.target.value || null)}
                                        style={{
                                            flex: 1, padding: '3px 6px', fontSize: '0.75rem',
                                            border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer',
                                            background: '#fff', outline: 'none', minWidth: 0
                                        }}
                                    >
                                        <option value="">👥 Takım...</option>
                                        {flatTeams.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Stats */}
                                <div style={{ display: 'flex', gap: 8, fontSize: '0.7rem', color: '#9ca3af' }}>
                                    <span>💬 {c._conversationCount || 0}</span>
                                    <span>📋 {c._totalActivityCount || 0}</span>
                                    {c._pendingActivityCount > 0 && (
                                        <span style={{ color: '#f59e0b' }}>⏳ {c._pendingActivityCount} bekliyor</span>
                                    )}
                                </div>

                                {/* Link current conversation */}
                                {conversationId && !isCurrentConv && (
                                    <button
                                        onClick={() => handleLinkCurrentConversation(c.id)}
                                        style={{
                                            marginTop: 4, width: '100%', padding: '4px 0',
                                            fontSize: '0.72rem', color: '#8b5cf6', background: 'none',
                                            border: '1px dashed #c4b5fd', borderRadius: 6,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', gap: 4
                                        }}
                                    >
                                        <Plus size={12} /> Bu yazışmayı bağla
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {/* Closed Cases */}
                    {closedCases.length > 0 && cases.length === 1 ? (
                        /* Tek case varsa her zaman açık göster */
                        closedCases.map(c => {
                            const stageInfo = getFunnelStageLabel(c);
                            const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.CLOSED;
                            const isCurrentConv = currentConvCase?.id === c.id;
                            const prioIcon = PRIORITY_ICONS[c.priority] || '';
                            return (
                                <div
                                    key={c.id}
                                    style={{
                                        background: isCurrentConv ? '#faf5ff' : '#f8fafc',
                                        border: isCurrentConv ? '1.5px solid #c4b5fd' : '1px solid #e5e7eb',
                                        borderRadius: 10, padding: '10px 12px', marginBottom: 6,
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <span style={{ fontSize: '0.68rem', color: '#a78bfa', fontWeight: 600, fontFamily: 'monospace' }}>
                                            {c.caseNumber}
                                        </span>
                                        {prioIcon && <span style={{ fontSize: '0.7rem' }}>{prioIcon}</span>}
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <select
                                                value={c.status}
                                                onChange={e => handleStatusChange(c.id, e.target.value)}
                                                style={{
                                                    fontSize: '0.68rem', fontWeight: 600, padding: '1px 4px',
                                                    borderRadius: 4, border: 'none', cursor: 'pointer',
                                                    color: statusInfo.color, background: statusInfo.bg
                                                }}
                                            >
                                                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                                    <option key={k} value={k}>{v.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1f2937', lineHeight: 1.3, marginBottom: 6 }}>
                                        {c.title}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, fontSize: '0.7rem', color: '#9ca3af' }}>
                                        <span>💬 {c._conversationCount || 0}</span>
                                        <span>📋 {c._totalActivityCount || 0}</span>
                                    </div>
                                </div>
                            );
                        })
                    ) : closedCases.length > 0 ? (
                        /* Birden fazla case varsa kapalıları akordiyona al */
                        <details style={{ marginTop: 4 }}>
                            <summary style={{
                                fontSize: '0.75rem', color: '#9ca3af', cursor: 'pointer',
                                padding: '4px 0', listStyle: 'none', display: 'flex',
                                alignItems: 'center', gap: 4
                            }}>
                                <ChevronRight size={12} />
                                {closedCases.length} kapalı case
                            </summary>
                            {closedCases.map(c => {
                                const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.CLOSED;
                                return (
                                    <div
                                        key={c.id}
                                        style={{
                                            background: '#f9fafb', border: '1px solid #f3f4f6',
                                            borderRadius: 8, padding: '6px 10px', marginTop: 4,
                                            opacity: 0.75
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: '0.68rem', color: '#d1d5db', fontFamily: 'monospace' }}>
                                                {c.caseNumber}
                                            </span>
                                            <span style={{
                                                fontSize: '0.68rem', fontWeight: 600,
                                                color: statusInfo.color, background: statusInfo.bg,
                                                padding: '1px 6px', borderRadius: 4
                                            }}>
                                                {statusInfo.label}
                                            </span>
                                            <select
                                                value={c.status}
                                                onChange={e => handleStatusChange(c.id, e.target.value)}
                                                style={{
                                                    fontSize: '0.65rem', marginLeft: 'auto', padding: '1px 3px',
                                                    borderRadius: 4, border: '1px solid #e5e7eb', cursor: 'pointer',
                                                    color: '#9ca3af', background: '#fff'
                                                }}
                                            >
                                                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                                    <option key={k} value={k}>{v.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
                                            {c.title}
                                        </div>
                                    </div>
                                );
                            })}
                        </details>
                    ) : null}
                </div>
            )}
        </div>
    );
};

export default CaseCards;
