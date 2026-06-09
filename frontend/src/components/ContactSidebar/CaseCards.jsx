import { useState, useEffect } from 'react';
import { caseAPI, funnelAPI } from '../../services/api';
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

const CaseCards = ({ workspaceId, contactId, members = [], teams = [], conversationId, onCaseLinked, inline = false }) => {
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

    useEffect(() => {
        if (workspaceId && contactId) {
            fetchCases();
            loadFunnels();
        }
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

    const handleUpdateStage = async (caseId, funnelType, funnelStageId) => {
        try {
            await caseAPI.update(workspaceId, caseId, { funnelType, funnelStageId });
            setCases(prev => prev.map(c => c.id === caseId ? { ...c, funnelType, funnelStageId } : c));
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
        // Tüm case'ler (aktif + kapalı) — en güncel olan gösterilir
        const displayCase = currentConvCase || activeCases[0] || cases[0];

        if (!displayCase) return null; // case henüz oluşmadıysa boş göster

        const stageInfo = getFunnelStageLabel(displayCase);
        const statusInfo = STATUS_LABELS[displayCase.status] || STATUS_LABELS.ACTIVE;

        return (
            <div style={{ padding: '2px 12px 6px' }}>
                {/* Case numarası + başlık + durum */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.62rem', color: '#a78bfa', fontWeight: 700, fontFamily: 'monospace' }}>
                        {displayCase.caseNumber}
                    </span>
                    <span style={{
                        fontSize: '0.78rem', fontWeight: 600, color: '#1f2937',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
                    }}>
                        {displayCase.title}
                    </span>
                    <select
                        value={displayCase.status}
                        onChange={e => handleStatusChange(displayCase.id, e.target.value)}
                        style={{
                            fontSize: '0.6rem', fontWeight: 600, padding: '1px 3px',
                            borderRadius: 3, border: 'none', cursor: 'pointer',
                            color: statusInfo.color, background: statusInfo.bg, flexShrink: 0
                        }}
                    >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                        ))}
                    </select>
                </div>

                {/* Akış seçici (Pipeline Stage) */}
                {funnels.length > 0 && (
                    <select
                        value={displayCase.funnelStageId || ''}
                        onChange={e => {
                            const stageId = e.target.value;
                            if (!stageId) { handleUpdateStage(displayCase.id, null, null); return; }
                            for (const f of funnels) {
                                const stage = (f.stages || []).find(s => s.id === stageId);
                                if (stage) { handleUpdateStage(displayCase.id, f.id, stageId); break; }
                            }
                        }}
                        style={{
                            width: '100%', padding: '4px 8px', fontSize: '0.74rem',
                            border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                            color: stageInfo ? stageInfo.color : '#6b7280',
                            background: '#fff', outline: 'none', marginBottom: 4, fontWeight: 500
                        }}
                    >
                        <option value="">📁 Akış seç...</option>
                        {funnels.map(f => (
                            <optgroup key={f.id} label={`${f.icon || '📁'} ${f.name}`}>
                                {(f.stages || []).map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                )}
            </div>
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
