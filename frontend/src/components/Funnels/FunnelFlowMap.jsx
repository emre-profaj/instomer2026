import React, { useState, useRef, useMemo, useLayoutEffect, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import './FunnelFlowMap.css';

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

// ─── Action types for quick-add ─────────────────────────────────────────────
const ACTION_TYPES = [
    { type: 'WA_SEND_TEMPLATE',     icon: '📱', label: 'Şablon Gönder' },
    { type: 'WA_SEND_MESSAGE',      icon: '💬', label: 'Mesaj Gönder' },
    { type: 'AUTO_CHANNEL_MESSAGE', icon: '🔄', label: 'Kanaldan Gönder' },
    { type: 'RETELL_CALL',          icon: '📞', label: 'AI Arama' },
    { type: 'SEND_EMAIL',           icon: '📧', label: 'E-posta Gönder' },
    { type: 'ADD_TAG',              icon: '🏷️', label: 'Etiket Ekle' },
    { type: 'NOTIFY_TEAM',          icon: '🔔', label: 'Takıma Bildir' },
    { type: 'CREATE_TASK',          icon: '📋', label: 'Görev Oluştur' },
    { type: 'MOVE_STAGE',           icon: '↗️', label: 'Aşama Değiştir' },
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
// FunnelFlowMap Component
// ═══════════════════════════════════════════════════════════════════════════
const FunnelFlowMap = ({
    funnels,
    channelRoutings,
    stageCounts,
    templates,
    onStageUpdate,
    onStageSettingsClick
}) => {
    const containerRef = useRef(null);
    const [connections, setConnections] = useState([]);
    const [actionDropdown, setActionDropdown] = useState(null);
    const [hoveredChannel, setHoveredChannel] = useState(null);

    // ── Extract unique channels from routings ───────────────────────────
    const channels = useMemo(() => {
        const map = new Map();
        channelRoutings.forEach(r => {
            const key = `${r.channel}_${r.pageId || 'default'}`;
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    channel: r.channel,
                    pageId: r.pageId,
                    accountName: r.accountName,
                    routings: []
                });
            }
            map.get(key).routings.push(r);
        });
        return Array.from(map.values());
    }, [channelRoutings]);

    // ── Build funnel hierarchy ──────────────────────────────────────────
    const { rootFunnels, childrenMap } = useMemo(() => {
        const cm = {};
        const roots = [];
        funnels.forEach(f => { cm[f.id] = []; });
        funnels.forEach(f => {
            if (f.parentId && cm[f.parentId]) {
                cm[f.parentId].push(f);
            } else {
                roots.push(f);
            }
        });
        return { rootFunnels: roots, childrenMap: cm };
    }, [funnels]);

    // ── Build map: stageId → [channelRoutings] for incoming badges ──────
    const stageIncoming = useMemo(() => {
        const map = {};
        channelRoutings.forEach(r => {
            // Determine target stageId
            let targetStageId = r.stageId;
            if (!targetStageId && r.funnelId) {
                const funnel = funnels.find(f => f.id === r.funnelId);
                if (funnel?.stages?.length) targetStageId = funnel.stages[0].id;
            }
            if (targetStageId) {
                if (!map[targetStageId]) map[targetStageId] = [];
                map[targetStageId].push(r);
            }
        });
        return map;
    }, [channelRoutings, funnels]);

    // ── Calculate SVG connections ───────────────────────────────────────
    const updateConnections = useCallback(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const cRect = container.getBoundingClientRect();
        const newConns = [];

        channelRoutings.forEach(routing => {
            const channelKey = `${routing.channel}_${routing.pageId || 'default'}`;
            const channelEl = container.querySelector(`[data-channel-key="${CSS.escape(channelKey)}"]`);

            let stageEl = null;
            if (routing.stageId) {
                stageEl = container.querySelector(`[data-stage-id="${routing.stageId}"]`);
            }
            if (!stageEl && routing.funnelId) {
                stageEl = container.querySelector(`[data-funnel-first="${routing.funnelId}"]`);
            }

            if (channelEl && stageEl) {
                const chR = channelEl.getBoundingClientRect();
                const stR = stageEl.getBoundingClientRect();

                const x1 = chR.left - cRect.left + chR.width / 2;
                const y1 = chR.bottom - cRect.top;
                const x2 = stR.left - cRect.left;
                const y2 = stR.top - cRect.top + stR.height / 2;

                const meta = CHANNEL_META[routing.channel] || { color: '#64748b' };

                newConns.push({
                    id: `${channelKey}__${routing.funnelId}__${routing.stageId || 'first'}`,
                    channelKey,
                    x1, y1, x2, y2,
                    color: meta.color
                });
            }
        });

        setConnections(newConns);
    }, [channelRoutings]);

    useLayoutEffect(() => {
        const t = setTimeout(updateConnections, 120);
        return () => clearTimeout(t);
    }, [updateConnections, funnels, channels]);

    useEffect(() => {
        window.addEventListener('resize', updateConnections);
        return () => window.removeEventListener('resize', updateConnections);
    }, [updateConnections]);

    // ── Action CRUD ─────────────────────────────────────────────────────
    const handleAddAction = (funnelId, stage, actionType) => {
        const existing = parseActions(stage.entryActions);
        const newAction = { type: actionType };
        const newActions = [...existing, newAction];
        onStageUpdate(funnelId, stage.id, { entryActions: JSON.stringify({ actions: newActions }) });
        setActionDropdown(null);
    };

    const handleRemoveAction = (e, funnelId, stage, idx) => {
        e.stopPropagation();
        const existing = parseActions(stage.entryActions);
        const newActions = existing.filter((_, i) => i !== idx);
        onStageUpdate(funnelId, stage.id, { entryActions: JSON.stringify({ actions: newActions }) });
    };

    // ── Render single funnel card with stages ───────────────────────────
    const renderFunnelCard = (funnel) => {
        const stages = funnel.stages || [];
        const children = childrenMap[funnel.id] || [];

        return (
            <div key={funnel.id} className="flow-map-funnel-group">
                <div className="flow-map-funnel-card">
                    {/* Funnel header */}
                    <div className="flow-map-funnel-header">
                        <span className="flow-map-funnel-icon">{funnel.icon || '📁'}</span>
                        <span className="flow-map-funnel-name">{funnel.name}</span>
                        {funnel.type === 'MAIN' && <span className="flow-map-funnel-type">ANA</span>}
                    </div>

                    {/* Stages - vertical */}
                    <div className="flow-map-stages">
                        {stages.map((stage, i) => {
                            const count = stageCounts[stage.id] || 0;
                            const entryActions = parseActions(stage.entryActions);
                            const timedActions = parseActions(stage.timedActions);
                            const incoming = stageIncoming[stage.id] || [];
                            const isFirst = i === 0;

                            return (
                                <React.Fragment key={stage.id}>
                                    {i > 0 && <div className="flow-map-stage-connector" />}
                                    <div
                                        className={`flow-map-stage${incoming.length > 0 ? ' has-incoming' : ''}`}
                                        style={incoming.length > 0 ? { '--incoming-color': CHANNEL_META[incoming[0].channel]?.color || '#3b82f6' } : undefined}
                                        data-stage-id={stage.id}
                                        {...(isFirst ? { 'data-funnel-first': funnel.id } : {})}
                                        onClick={() => onStageSettingsClick?.(stage, funnel.id)}
                                    >
                                        {/* Stage header row */}
                                        <div className="flow-map-stage-header">
                                            <div className="flow-map-stage-dot" style={{ background: stage.color || '#3b82f6' }} />
                                            <span className="flow-map-stage-name">{stage.name}</span>

                                            {/* Incoming channel source badges */}
                                            {incoming.length > 0 && (
                                                <div className="flow-map-stage-sources">
                                                    {incoming.map((inc, ii) => {
                                                        const m = CHANNEL_META[inc.channel] || {};
                                                        return (
                                                            <span
                                                                key={ii}
                                                                className="flow-map-source-dot"
                                                                style={{ background: `${m.color || '#64748b'}20` }}
                                                                title={`${m.label || inc.channel}${inc.accountName ? ` (${inc.accountName})` : ''}`}
                                                            >
                                                                {m.icon || '📡'}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {count > 0 && <span className="flow-map-stage-count">{count}</span>}
                                        </div>

                                        {/* Existing entry & timed actions */}
                                        {(entryActions.length > 0 || timedActions.length > 0) && (
                                            <div className="flow-map-stage-actions">
                                                {entryActions.map((a, ai) => {
                                                    const def = ACTION_MAP[a.type];
                                                    let detail = '';
                                                    if (a.templateId) {
                                                        const tpl = templates?.find(t => t.id === a.templateId);
                                                        if (tpl) detail = ` · ${tpl.name}`;
                                                    }
                                                    if (a.message) detail = ` · ${a.message.substring(0, 25)}${a.message.length > 25 ? '…' : ''}`;
                                                    if (a.tagName) detail = ` · ${a.tagName}`;
                                                    if (a.title) detail = ` · ${a.title}`;

                                                    return (
                                                        <div key={ai} className="flow-map-action">
                                                            <span className="flow-map-action-icon">{def?.icon || '⚡'}</span>
                                                            <span className="flow-map-action-label">{def?.label || a.type}{detail}</span>
                                                            <button
                                                                className="flow-map-action-delete"
                                                                onClick={(e) => handleRemoveAction(e, funnel.id, stage, ai)}
                                                            >✕</button>
                                                        </div>
                                                    );
                                                })}
                                                {timedActions.map((a, ai) => {
                                                    const def = ACTION_MAP[a.type];
                                                    return (
                                                        <div key={`t${ai}`} className="flow-map-action timed">
                                                            <span className="flow-map-action-icon">⏱</span>
                                                            <span className="flow-map-action-label">
                                                                {a.delayDays || 0}g {a.delayHours || 0}s → {def?.label || a.type}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Add action button */}
                                        <button
                                            className="flow-map-add-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActionDropdown(
                                                    actionDropdown?.stageId === stage.id
                                                        ? null
                                                        : { stageId: stage.id, funnelId: funnel.id, stage }
                                                );
                                            }}
                                        >
                                            <Plus size={9} /> Aksiyon
                                        </button>

                                        {/* Dropdown */}
                                        {actionDropdown?.stageId === stage.id && (
                                            <div className="flow-map-action-dropdown">
                                                {ACTION_TYPES.map(at => (
                                                    <button
                                                        key={at.type}
                                                        className="flow-map-dropdown-item"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleAddAction(funnel.id, stage, at.type);
                                                        }}
                                                    >
                                                        <span>{at.icon}</span>
                                                        <span>{at.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* Child funnels */}
                {children.length > 0 && (
                    <div className="flow-map-funnel-children">
                        {children.map(child => renderFunnelCard(child))}
                    </div>
                )}
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════
    return (
        <div className="flow-map" ref={containerRef} onClick={() => setActionDropdown(null)}>
            {/* SVG Connection Lines */}
            <svg className="flow-map-svg">
                <defs>
                    <marker id="flow-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                        <path d="M0,0 L6,2 L0,4 Z" fill="#475569" />
                    </marker>
                </defs>
                {connections.map(conn => {
                    const dy = Math.min(Math.abs(conn.y2 - conn.y1) * 0.45, 80);
                    const isHl = hoveredChannel === conn.channelKey;
                    return (
                        <path
                            key={conn.id}
                            d={`M${conn.x1},${conn.y1} C${conn.x1},${conn.y1 + dy} ${conn.x2 - 30},${conn.y2} ${conn.x2},${conn.y2}`}
                            fill="none"
                            stroke={conn.color}
                            strokeWidth={isHl ? 2.5 : 1.5}
                            strokeOpacity={hoveredChannel ? (isHl ? 0.85 : 0.12) : 0.35}
                            markerEnd="url(#flow-arrow)"
                            style={{ transition: 'stroke-opacity 0.25s, stroke-width 0.25s' }}
                        />
                    );
                })}
            </svg>

            {/* ── Channel Row ── */}
            <div className="flow-map-channels">
                {channels.length > 0 ? channels.map(ch => {
                    const meta = CHANNEL_META[ch.channel] || { icon: '📡', color: '#64748b', label: ch.channel };
                    const isHl = hoveredChannel === ch.key;
                    return (
                        <div
                            key={ch.key}
                            className={`flow-map-channel-card${isHl ? ' highlighted' : ''}`}
                            data-channel-key={ch.key}
                            style={{ '--ch-color': meta.color, borderColor: isHl ? 'transparent' : `${meta.color}25` }}
                            onMouseEnter={() => setHoveredChannel(ch.key)}
                            onMouseLeave={() => setHoveredChannel(null)}
                        >
                            <div className="flow-map-channel-icon" style={{ background: `${meta.color}12` }}>
                                {meta.icon}
                            </div>
                            <span className="flow-map-channel-name">
                                {ch.accountName || meta.label}
                            </span>
                        </div>
                    );
                }) : (
                    <div className="flow-map-empty-channels">
                        Henüz kanal yönlendirmesi yok.<br />
                        Kanallar sayfasından akış ataması yapın.
                    </div>
                )}
            </div>

            <div className="flow-map-divider">Akışlar ve Aşamalar</div>

            {/* ── Funnel Cards ── */}
            <div className="flow-map-funnels">
                {rootFunnels.map(f => renderFunnelCard(f))}
            </div>
        </div>
    );
};

export default FunnelFlowMap;
