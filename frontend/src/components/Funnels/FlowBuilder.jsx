import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { Plus, ZoomIn, ZoomOut, Maximize2, Settings } from 'lucide-react';
import './FlowBuilder.css';

// ─── Channel metadata ──────────────────────────────────────────────────────
const CHANNEL_META = {
    whatsapp:  { icon: '📱', color: '#25D366', label: 'WhatsApp' },
    instagram: { icon: '📸', color: '#E4405F', label: 'Instagram' },
    facebook:  { icon: '📘', color: '#1877F2', label: 'Facebook' },
    messenger: { icon: '💬', color: '#0084FF', label: 'Messenger' },
    email:     { icon: '✉️', color: '#EA4335', label: 'Email' },
    web:       { icon: '🌐', color: '#3B82F6', label: 'Web Widget' },
    webchat:   { icon: '💻', color: '#3B82F6', label: 'Web Chat' },
    telegram:  { icon: '✈️', color: '#0088CC', label: 'Telegram' },
    form:      { icon: '📝', color: '#8B5CF6', label: 'Form' },
    phone:     { icon: '📞', color: '#10b981', label: 'Telefon' },
};

// ─── Action type definitions ────────────────────────────────────────────────
const ACTION_TYPES = [
    { type: 'WA_SEND_TEMPLATE',     icon: '📱', label: 'Şablon Gönder',     group: 'message' },
    { type: 'WA_SEND_MESSAGE',      icon: '💬', label: 'Mesaj Gönder',      group: 'message' },
    { type: 'AUTO_CHANNEL_MESSAGE', icon: '🔄', label: 'Kanaldan Gönder',   group: 'message' },
    { type: 'RETELL_CALL',          icon: '📞', label: 'AI Arama',          group: 'action' },
    { type: 'SEND_EMAIL',           icon: '📧', label: 'E-posta Gönder',    group: 'message' },
    { type: 'ADD_TAG',              icon: '🏷️', label: 'Etiket Ekle',       group: 'action' },
    { type: 'NOTIFY_TEAM',          icon: '🔔', label: 'Takıma Bildir',     group: 'action' },
    { type: 'CREATE_TASK',          icon: '📋', label: 'Görev Oluştur',     group: 'action' },
    { type: 'CREATE_CALL_TASK',     icon: '📞', label: 'Arama Görevi',      group: 'action' },
    { type: 'MOVE_STAGE',           icon: '↗️', label: 'Aşama Değiştir',    group: 'flow' },
    { type: 'TRIGGER_AUTOMATION',   icon: '⚡', label: 'Otomasyon Tetikle', group: 'action' },
];

const ACTION_MAP = {};
ACTION_TYPES.forEach(a => { ACTION_MAP[a.type] = a; });

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseActions(raw) {
    try {
        const config = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { actions: [] };
        return config.actions || [];
    } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════
// FlowBuilder Component
// ═══════════════════════════════════════════════════════════════════════════
const FlowBuilder = ({
    funnels,
    channelRoutings,
    stageCounts,
    templates,
    teams,
    members,
    bots,
    onStageUpdate,
    onStageSettingsClick,
    onFunnelSettingsClick,
    onAddStageClick,
}) => {
    // ── State ───────────────────────────────────────────────────────────
    const [selectedFunnelId, setSelectedFunnelId] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [actionDropdown, setActionDropdown] = useState(null);
    const [connections, setConnections] = useState([]);
    const [hoveredChannel, setHoveredChannel] = useState(null);

    const canvasRef = useRef(null);
    const wrapperRef = useRef(null);

    // ── Auto-select first funnel ────────────────────────────────────────
    useEffect(() => {
        if (funnels.length > 0 && !selectedFunnelId) {
            const main = funnels.find(f => f.funnelType === 'MAIN');
            setSelectedFunnelId(main?.id || funnels[0].id);
        }
    }, [funnels]);

    // ── Computed ────────────────────────────────────────────────────────
    const selectedFunnel = funnels.find(f => f.id === selectedFunnelId);

    const stages = useMemo(() => {
        return (selectedFunnel?.stages || []).sort((a, b) => (a.order || 0) - (b.order || 0));
    }, [selectedFunnel]);

    const childFunnels = useMemo(() => {
        return funnels.filter(f => f.parentId === selectedFunnelId);
    }, [funnels, selectedFunnelId]);

    const uniqueChannels = useMemo(() => {
        const funnelRoutings = channelRoutings.filter(r => r.funnelId === selectedFunnelId);
        const map = new Map();
        funnelRoutings.forEach(r => {
            const key = `${r.channel}_${r.pageId || 'default'}`;
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    channel: r.channel,
                    pageId: r.pageId,
                    accountName: r.accountName,
                    stageId: r.stageId,
                });
            }
        });
        return Array.from(map.values());
    }, [channelRoutings, selectedFunnelId]);

    // ── SVG Connections ─────────────────────────────────────────────────
    const updateConnections = useCallback(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const cRect = canvas.getBoundingClientRect();
        const scale = zoom;
        const newConns = [];

        uniqueChannels.forEach(ch => {
            const portEl = canvas.querySelector(`[data-channel-port="${CSS.escape(ch.key)}"]`);
            let targetStageId = ch.stageId;
            if (!targetStageId && stages.length > 0) targetStageId = stages[0].id;
            const stageEl = canvas.querySelector(`[data-stage-id="${targetStageId}"]`);

            if (portEl && stageEl) {
                const pRect = portEl.getBoundingClientRect();
                const sRect = stageEl.getBoundingClientRect();
                const x1 = (pRect.right - cRect.left) / scale;
                const y1 = (pRect.top + pRect.height / 2 - cRect.top) / scale;
                const x2 = (sRect.left - cRect.left) / scale;
                const y2 = (sRect.top + sRect.height / 2 - cRect.top) / scale;
                const meta = CHANNEL_META[ch.channel] || { color: '#64748b' };
                newConns.push({ id: ch.key, channelKey: ch.key, x1, y1, x2, y2, color: meta.color });
            }
        });
        setConnections(newConns);
    }, [uniqueChannels, stages, zoom]);

    useLayoutEffect(() => {
        const t = setTimeout(updateConnections, 50);
        return () => clearTimeout(t);
    }, [updateConnections, selectedFunnelId, funnels]);

    useEffect(() => {
        window.addEventListener('resize', updateConnections);
        return () => window.removeEventListener('resize', updateConnections);
    }, [updateConnections]);

    // ── Pan / Zoom ──────────────────────────────────────────────────────
    const handleMouseDown = useCallback((e) => {
        if (e.target.closest('.fb-stage-node') ||
            e.target.closest('.fb-channel-node') ||
            e.target.closest('.fb-add-stage') ||
            e.target.closest('.fb-action-dropdown') ||
            e.target.closest('.fb-child-funnel') ||
            e.target.closest('.fb-toolbar')) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setPanStart({ x: pan.x, y: pan.y });
        e.preventDefault();
    }, [pan]);

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;
        setPan({ x: panStart.x + (e.clientX - dragStart.x), y: panStart.y + (e.clientY - dragStart.y) });
    }, [isDragging, dragStart, panStart]);

    const handleMouseUp = useCallback(() => { setIsDragging(false); }, []);

    const handleWheel = useCallback((e) => {
        e.preventDefault();
        setZoom(prev => Math.max(0.3, Math.min(2, prev + (e.deltaY > 0 ? -0.05 : 0.05))));
    }, []);

    useEffect(() => {
        const w = wrapperRef.current;
        if (!w) return;
        w.addEventListener('wheel', handleWheel, { passive: false });
        return () => w.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    const handleZoomIn  = () => setZoom(prev => Math.min(2, prev + 0.1));
    const handleZoomOut = () => setZoom(prev => Math.max(0.3, prev - 0.1));
    const handleFitView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

    // ── Action CRUD ─────────────────────────────────────────────────────
    const handleAddAction = (stage, actionType, category = 'entry') => {
        const field = category === 'timed' ? 'timedActions' : category === 'exit' ? 'exitActions' : 'entryActions';
        const existing = parseActions(stage[field]);
        const newAction = { type: actionType };
        if (category === 'timed') { newAction.delayDays = 1; newAction.delayHours = 0; }
        onStageUpdate(selectedFunnelId, stage.id, { [field]: JSON.stringify({ actions: [...existing, newAction] }) });
        setActionDropdown(null);
    };

    const handleRemoveAction = (e, stage, idx, category = 'entry') => {
        e.stopPropagation();
        const field = category === 'timed' ? 'timedActions' : category === 'exit' ? 'exitActions' : 'entryActions';
        const existing = parseActions(stage[field]);
        onStageUpdate(selectedFunnelId, stage.id, { [field]: JSON.stringify({ actions: existing.filter((_, i) => i !== idx) }) });
    };

    // ── Display helpers ─────────────────────────────────────────────────
    const getBotName   = (id) => id ? (bots?.find(b => b.id === id)?.name || null) : null;
    const getTeamName  = (id) => id ? (teams?.find(t => t.id === id)?.name || null) : null;
    const getMemberName = (id) => id ? (members?.find(m => m.id === id)?.name || null) : null;

    const getActionDetail = (action) => {
        if (action.templateId) { const t = templates?.find(x => x.id === action.templateId); if (t) return t.name; }
        if (action.message) return action.message.substring(0, 30) + (action.message.length > 30 ? '…' : '');
        if (action.tagName) return action.tagName;
        if (action.title) return action.title;
        if (action.subject) return action.subject;
        return '';
    };

    // ═══════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════

    if (!selectedFunnel && funnels.length === 0) {
        return <div className="fb"><div className="fb-empty"><span>📊</span><p>Henüz akış oluşturulmamış.</p></div></div>;
    }

    return (
        <div className="fb" onClick={() => setActionDropdown(null)}>
            {/* ── Toolbar ── */}
            <div className="fb-toolbar">
                <div className="fb-toolbar-left">
                    <select
                        className="fb-funnel-select"
                        value={selectedFunnelId || ''}
                        onChange={e => { setSelectedFunnelId(e.target.value); setPan({ x: 0, y: 0 }); setZoom(1); }}
                    >
                        {funnels.map(f => (
                            <option key={f.id} value={f.id}>
                                {f.icon || '📁'} {f.name} {f.funnelType === 'MAIN' ? '(Ana)' : ''}
                            </option>
                        ))}
                    </select>
                    {selectedFunnel && (
                        <button className="fb-funnel-settings-btn" onClick={() => onFunnelSettingsClick(selectedFunnel)} title="Akış Ayarları">
                            <Settings size={14} />
                        </button>
                    )}
                </div>
                <div className="fb-toolbar-right">
                    <div className="fb-zoom-controls">
                        <button onClick={handleZoomOut} title="Uzaklaştır"><ZoomOut size={14} /></button>
                        <span className="fb-zoom-label">{Math.round(zoom * 100)}%</span>
                        <button onClick={handleZoomIn} title="Yakınlaştır"><ZoomIn size={14} /></button>
                        <button onClick={handleFitView} title="Sığdır"><Maximize2 size={14} /></button>
                    </div>
                </div>
            </div>

            {/* ── Canvas ── */}
            <div
                className={`fb-canvas-wrapper${isDragging ? ' dragging' : ''}`}
                ref={wrapperRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div
                    className="fb-canvas"
                    ref={canvasRef}
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
                >
                    {/* SVG Connections */}
                    <svg className="fb-svg">
                        <defs>
                            <marker id="fb-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                                <path d="M0,0 L8,3 L0,6 Z" fill="#475569" />
                            </marker>
                        </defs>
                        {connections.map(conn => {
                            const dx = conn.x2 - conn.x1;
                            const cp = Math.max(dx * 0.4, 50);
                            const hl = hoveredChannel === conn.channelKey;
                            return (
                                <path
                                    key={conn.id}
                                    d={`M${conn.x1},${conn.y1} C${conn.x1 + cp},${conn.y1} ${conn.x2 - cp},${conn.y2} ${conn.x2},${conn.y2}`}
                                    fill="none"
                                    stroke={conn.color}
                                    strokeWidth={hl ? 2.5 : 1.5}
                                    strokeOpacity={hoveredChannel ? (hl ? 0.85 : 0.1) : 0.4}
                                    strokeDasharray={hl ? 'none' : '6 3'}
                                    markerEnd="url(#fb-arrow)"
                                    className="fb-connection"
                                />
                            );
                        })}
                    </svg>

                    {/* ── Layout ── */}
                    <div className="fb-layout">
                        {/* Channel Column */}
                        {uniqueChannels.length > 0 && (
                            <div className="fb-channels-col">
                                <div className="fb-col-label">Kanallar</div>
                                {uniqueChannels.map(ch => {
                                    const meta = CHANNEL_META[ch.channel] || { icon: '📡', color: '#64748b', label: ch.channel };
                                    return (
                                        <div
                                            key={ch.key}
                                            className={`fb-channel-node${hoveredChannel === ch.key ? ' highlighted' : ''}`}
                                            style={{ '--ch-color': meta.color }}
                                            onMouseEnter={() => setHoveredChannel(ch.key)}
                                            onMouseLeave={() => setHoveredChannel(null)}
                                        >
                                            <div className="fb-channel-icon">{meta.icon}</div>
                                            <div className="fb-channel-info">
                                                <span className="fb-channel-name">{ch.accountName || meta.label}</span>
                                                <span className="fb-channel-type">{meta.label}</span>
                                            </div>
                                            <div className="fb-channel-port" data-channel-port={ch.key} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Stage Pipeline */}
                        <div className="fb-pipeline">
                            <div className="fb-col-label">Aşamalar</div>
                            <div className="fb-stages-row">
                                {stages.map((stage, i) => {
                                    const count = stageCounts[stage.id] || 0;
                                    const entryActions  = parseActions(stage.entryActions);
                                    const timedActions  = parseActions(stage.timedActions);
                                    const exitActions   = parseActions(stage.exitActions);
                                    const hasActions = entryActions.length + timedActions.length + exitActions.length > 0;
                                    const botName    = getBotName(stage.assignedBotId || selectedFunnel?.assignedBotId);
                                    const teamName   = getTeamName(stage.assignedTeamId || selectedFunnel?.assignedTeamId);
                                    const memberName = getMemberName(stage.assignedUserId);
                                    const isInherited = !stage.assignedBotId && !!selectedFunnel?.assignedBotId;

                                    return (
                                        <React.Fragment key={stage.id}>
                                            {i > 0 && (
                                                <div className="fb-connector">
                                                    <svg width="48" height="24" viewBox="0 0 48 24">
                                                        <line x1="0" y1="12" x2="38" y2="12" stroke="#334155" strokeWidth="1.5" />
                                                        <polygon points="36,7 46,12 36,17" fill="#334155" />
                                                    </svg>
                                                </div>
                                            )}

                                            <div
                                                className={`fb-stage-node${stage.statusType ? ' closing' : ''}`}
                                                data-stage-id={stage.id}
                                                style={{ '--stage-color': stage.color || '#3b82f6' }}
                                                onClick={(e) => {
                                                    if (e.target.closest('.fb-add-action-btn') ||
                                                        e.target.closest('.fb-action-dropdown') ||
                                                        e.target.closest('.fb-action-remove')) return;
                                                    onStageSettingsClick(stage, selectedFunnelId);
                                                }}
                                            >
                                                {/* Header */}
                                                <div className="fb-stage-header">
                                                    <div className="fb-stage-dot" style={{ background: stage.color || '#3b82f6' }} />
                                                    <span className="fb-stage-name">{stage.name}</span>
                                                    {count > 0 && <span className="fb-stage-count">{count}</span>}
                                                </div>

                                                {/* Status */}
                                                {stage.statusType && (
                                                    <div className={`fb-stage-status ${stage.statusType.toLowerCase()}`}>
                                                        {stage.statusType === 'WON' && '✅ Kazanıldı'}
                                                        {stage.statusType === 'LOST' && '❌ Kayıp'}
                                                        {stage.statusType === 'CLOSED' && '🔒 Kapandı'}
                                                    </div>
                                                )}

                                                {/* Assignments */}
                                                {(botName || teamName || memberName) && (
                                                    <div className="fb-stage-assigns">
                                                        {botName && <span className={`fb-assign-badge bot${isInherited ? ' inherited' : ''}`}>🤖 {botName}</span>}
                                                        {teamName && <span className="fb-assign-badge team">👥 {teamName}</span>}
                                                        {memberName && <span className="fb-assign-badge user">👤 {memberName}</span>}
                                                    </div>
                                                )}

                                                {/* Actions */}
                                                {hasActions && (
                                                    <div className="fb-stage-actions">
                                                        {entryActions.map((a, ai) => {
                                                            const def = ACTION_MAP[a.type];
                                                            const detail = getActionDetail(a);
                                                            return (
                                                                <div key={`e${ai}`} className="fb-action entry">
                                                                    <span className="fb-action-icon">{def?.icon || '⚡'}</span>
                                                                    <div className="fb-action-text">
                                                                        <span className="fb-action-label">{def?.label || a.type}</span>
                                                                        {detail && <span className="fb-action-detail">{detail}</span>}
                                                                    </div>
                                                                    <button className="fb-action-remove" onClick={(e) => handleRemoveAction(e, stage, ai, 'entry')}>✕</button>
                                                                </div>
                                                            );
                                                        })}
                                                        {timedActions.map((a, ai) => {
                                                            const def = ACTION_MAP[a.type];
                                                            const delay = `${a.delayDays || 0}g ${a.delayHours || 0}s`;
                                                            const detail = getActionDetail(a);
                                                            return (
                                                                <div key={`t${ai}`} className="fb-action timed">
                                                                    <span className="fb-action-icon">⏱</span>
                                                                    <div className="fb-action-text">
                                                                        <span className="fb-action-label">{delay} → {def?.label || a.type}</span>
                                                                        {detail && <span className="fb-action-detail">{detail}</span>}
                                                                    </div>
                                                                    <button className="fb-action-remove" onClick={(e) => handleRemoveAction(e, stage, ai, 'timed')}>✕</button>
                                                                </div>
                                                            );
                                                        })}
                                                        {exitActions.map((a, ai) => {
                                                            const def = ACTION_MAP[a.type];
                                                            const detail = getActionDetail(a);
                                                            return (
                                                                <div key={`x${ai}`} className="fb-action exit">
                                                                    <span className="fb-action-icon">{def?.icon || '🚪'}</span>
                                                                    <div className="fb-action-text">
                                                                        <span className="fb-action-label">Çıkış: {def?.label || a.type}</span>
                                                                        {detail && <span className="fb-action-detail">{detail}</span>}
                                                                    </div>
                                                                    <button className="fb-action-remove" onClick={(e) => handleRemoveAction(e, stage, ai, 'exit')}>✕</button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Add action */}
                                                <button
                                                    className="fb-add-action-btn"
                                                    onClick={(e) => { e.stopPropagation(); setActionDropdown(actionDropdown === stage.id ? null : stage.id); }}
                                                >
                                                    <Plus size={10} /> Aksiyon
                                                </button>

                                                {/* Action dropdown */}
                                                {actionDropdown === stage.id && (
                                                    <div className="fb-action-dropdown" onClick={e => e.stopPropagation()}>
                                                        <div className="fb-dropdown-section">
                                                            <span className="fb-dropdown-label">📥 Giriş Aksiyonları</span>
                                                            {ACTION_TYPES.map(at => (
                                                                <button key={at.type} className="fb-dropdown-item" onClick={() => handleAddAction(stage, at.type, 'entry')}>
                                                                    <span>{at.icon}</span><span>{at.label}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="fb-dropdown-divider" />
                                                        <div className="fb-dropdown-section">
                                                            <span className="fb-dropdown-label">⏱ Zamanlı Aksiyonlar</span>
                                                            {ACTION_TYPES.filter(at => at.group !== 'flow').map(at => (
                                                                <button key={`t_${at.type}`} className="fb-dropdown-item" onClick={() => handleAddAction(stage, at.type, 'timed')}>
                                                                    <span>⏱</span><span>{at.label}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="fb-dropdown-divider" />
                                                        <div className="fb-dropdown-section">
                                                            <span className="fb-dropdown-label">🚪 Çıkış Aksiyonları</span>
                                                            {ACTION_TYPES.filter(at => at.group !== 'flow').map(at => (
                                                                <button key={`x_${at.type}`} className="fb-dropdown-item" onClick={() => handleAddAction(stage, at.type, 'exit')}>
                                                                    <span>{at.icon}</span><span>Çıkış: {at.label}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </React.Fragment>
                                    );
                                })}

                                {/* Add stage */}
                                {stages.length > 0 && (
                                    <div className="fb-connector">
                                        <svg width="48" height="24" viewBox="0 0 48 24">
                                            <line x1="0" y1="12" x2="38" y2="12" stroke="#334155" strokeWidth="1.5" strokeDasharray="4 3" />
                                            <polygon points="36,7 46,12 36,17" fill="#334155" />
                                        </svg>
                                    </div>
                                )}
                                <div className="fb-add-stage" onClick={() => onAddStageClick(selectedFunnel)}>
                                    <Plus size={18} />
                                    <span>Aşama Ekle</span>
                                </div>
                            </div>
                        </div>

                        {/* Child funnels */}
                        {childFunnels.length > 0 && (
                            <div className="fb-children-info">
                                <div className="fb-col-label">Alt Akışlar</div>
                                {childFunnels.map(child => (
                                    <div key={child.id} className="fb-child-funnel" onClick={() => setSelectedFunnelId(child.id)}>
                                        <span>{child.icon || '📁'}</span>
                                        <span>{child.name}</span>
                                        <span className="fb-child-count">{child.stages?.length || 0} aşama</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FlowBuilder;
