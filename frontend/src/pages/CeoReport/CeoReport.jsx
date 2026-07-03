import React, { useState, useEffect } from 'react';
import {
    Users, MessageSquare, Phone, PhoneOff, Calendar, Activity,
    TrendingUp, DollarSign, UserCheck, Clock, RefreshCw,
    ClipboardList, Briefcase, Headphones, Truck, Building2,
    CheckCircle2, AlertTriangle, ListChecks, Handshake,
    Instagram, Facebook, Mail, Globe, MessageCircle,
    ChevronDown, ChevronRight, PhoneCall, FileText, ShoppingCart,
    Search, BarChart3, Target, Filter, ArrowRight, Bot, Sparkles,
    ArrowUpRight, ArrowDownRight, Trophy, Zap, TrendingDown,
    PieChart, Hash
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { contactAPI, funnelAPI } from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';

const formatNumber = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString('tr-TR');
};

const formatCurrency = (n) => {
    if (!n && n !== 0) return '₺0';
    if (n >= 1000000) return '₺' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '₺' + (n / 1000).toFixed(1) + 'K';
    return '₺' + n.toLocaleString('tr-TR');
};

// ══════════════════════════════════════════════════════════
// INLINE CHART COMPONENTS
// ══════════════════════════════════════════════════════════

// ── Interactive Area Chart with Hover Tooltip ──
// ── Interactive Area Chart with Hover Tooltip ──
const AreaChart = ({ data, width = 1000, height = 120, color = '#6366f1', showLabels = true }) => {
    const [hoverIdx, setHoverIdx] = useState(null);
    if (!data || data.length === 0) return <div className="dash-chart-empty">Veri yok</div>;
    const values = data.map(d => d.value);
    const max = Math.max(...values, 1);
    const min = 0;
    const padTop = 20;
    const padBottom = showLabels ? 26 : 8;
    const padLeft = 6;
    const padRight = 6;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;
    const step = chartW / Math.max(data.length - 1, 1);

    const points = values.map((v, i) => ({
        x: padLeft + i * step,
        y: padTop + chartH - ((v - min) / (max - min || 1)) * chartH
    }));

    // Safety guard for hover index
    const activeHoverIdx = hoverIdx !== null && hoverIdx < points.length ? hoverIdx : null;

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height - padBottom} L${padLeft},${height - padBottom} Z`;

    // Grid lines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => padTop + chartH * (1 - pct));

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="dash-area-svg">
            {/* Grid */}
            {gridLines.map((y, i) => (
                <line key={i} x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4,4" />
            ))}
            {/* Area fill */}
            <defs>
                <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
                <filter id="tooltip-shadow"><feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" /></filter>
            </defs>
            <path d={areaPath} fill={`url(#grad-${color.replace('#','')})`} />
            {/* Line */}
            <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* All dots (visible on hover or key points) */}
            {points.map((p, i) => (
                <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={activeHoverIdx === i ? 5 : (i === 0 || i === points.length - 1 || values[i] === max ? 3 : 0)} fill={color} stroke="#fff" strokeWidth="2" style={{ transition: 'r 0.15s' }} />
            ))}
            {/* Hover vertical guide line */}
            {activeHoverIdx !== null && (
                <line x1={points[activeHoverIdx].x} y1={padTop} x2={points[activeHoverIdx].x} y2={height - padBottom} stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
            )}
            {/* Tooltip */}
            {activeHoverIdx !== null && (() => {
                const p = points[activeHoverIdx];
                const label = data[activeHoverIdx]?.label || '';
                const val = values[activeHoverIdx];
                const tw = 70;
                const th = 36;
                let tx = p.x - tw / 2;
                if (tx < 0) tx = 0;
                if (tx + tw > width) tx = width - tw;
                const ty = p.y - th - 10;
                return (
                    <g filter="url(#tooltip-shadow)">
                        <rect x={tx} y={ty} width={tw} height={th} rx="6" fill="#1e293b" opacity="0.92" />
                        <text x={tx + tw / 2} y={ty + 14} textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="500">{label}</text>
                        <text x={tx + tw / 2} y={ty + 27} textAnchor="middle" fontSize="12" fill="#fff" fontWeight="800">{formatNumber(val)}</text>
                    </g>
                );
            })()}
            {/* X-axis labels */}
            {showLabels && data.map((d, i) => {
                if (data.length > 15 && i % Math.ceil(data.length / 7) !== 0 && i !== data.length - 1) return null;
                return (
                    <text key={i} x={points[i].x} y={height - 4} textAnchor="middle" fontSize="8" fill={activeHoverIdx === i ? '#1e293b' : '#94a3b8'} fontWeight={activeHoverIdx === i ? '700' : '500'} style={{ transition: 'fill 0.15s' }}>
                        {d.label}
                    </text>
                );
            })}
            {/* Max value label */}
            <text x={width - padRight} y={padTop - 6} textAnchor="end" fontSize="9" fill="#64748b" fontWeight="700">
                {formatNumber(max)}
            </text>
            {/* Invisible hover rectangles for each data point */}
            {points.map((p, i) => (
                <rect
                    key={`hover-${i}`}
                    x={p.x - step / 2}
                    y={0}
                    width={step}
                    height={height}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    style={{ cursor: 'crosshair' }}
                />
            ))}
        </svg>
    );
};

// ── Stacked Area Chart (2 series: numaralı + numarasız) ──
const StackedAreaChart = ({ data, width = 1000, height = 180, showLabels = true }) => {
    const [hoverIdx, setHoverIdx] = useState(null);
    if (!data || data.length === 0) return <div className="dash-chart-empty">Veri yok</div>;

    const color1 = '#10b981'; // numaralı (green)
    const color2 = '#f59e0b'; // numarasız (orange)
    const colorTotal = '#6366f1'; // total line

    const totals = data.map(d => (d.withPhone || 0) + (d.withoutPhone || 0));
    const max = Math.max(...totals, 1);
    const padTop = 24; const padBottom = showLabels ? 28 : 8; const padLeft = 6; const padRight = 6;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;
    const step = chartW / Math.max(data.length - 1, 1);
    const baseY = padTop + chartH;

    const getY = (val) => padTop + chartH - (val / max) * chartH;

    // Points for each series
    const pts1 = data.map((d, i) => ({ x: padLeft + i * step, y: getY(d.withPhone || 0) }));
    const pts2 = data.map((d, i) => ({ x: padLeft + i * step, y: getY((d.withPhone || 0) + (d.withoutPhone || 0)) }));
    const ptsTotal = data.map((d, i) => ({ x: padLeft + i * step, y: getY(totals[i]) }));

    // Safety guard for hover index
    const activeHoverIdx = hoverIdx !== null && hoverIdx < ptsTotal.length ? hoverIdx : null;

    const makeLine = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const makeArea = (pts) => {
        const line = makeLine(pts);
        return `${line} L${pts[pts.length - 1].x.toFixed(1)},${baseY} L${padLeft},${baseY} Z`;
    };

    // Stacked area: bottom = numaralı, top = numarasız
    // Area 1: numaralı (0 to withPhone)
    const area1 = makeArea(pts1);
    // Area 2: numarasız (withPhone to total) — need custom area between pts1 and pts2
    const area2Top = pts2.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area2Bottom = [...pts1].reverse().map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area2 = `${area2Top} ${area2Bottom} Z`;

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => padTop + chartH * (1 - pct));

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="dash-area-svg">
            {gridLines.map((y, i) => (
                <line key={i} x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4,4" />
            ))}
            <defs>
                <linearGradient id="grad-stacked-green" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color1} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color1} stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="grad-stacked-orange" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color2} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color2} stopOpacity="0.05" />
                </linearGradient>
                <filter id="tooltip-shadow-s"><feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" /></filter>
            </defs>
            {/* Stacked areas */}
            <path d={area1} fill="url(#grad-stacked-green)" />
            <path d={area2} fill="url(#grad-stacked-orange)" />
            {/* Lines */}
            <path d={makeLine(pts1)} fill="none" stroke={color1} strokeWidth="2" strokeLinecap="round" />
            {/* Toplam çizgisi — kalın, belirgin, turuncu alanın üstüne */}
            <path d={makeLine(ptsTotal)} fill="none" stroke={colorTotal} strokeWidth="3" strokeLinecap="round" strokeDasharray="6,3" />
            {/* Toplam veri noktaları */}
            {ptsTotal.map((p, i) => (
                <circle key={`tc-${i}`} cx={p.x} cy={p.y} r={activeHoverIdx === i ? 5 : 3} fill={colorTotal} stroke="#fff" strokeWidth="1.5" />
            ))}
            {/* Hover guide */}
            {activeHoverIdx !== null && (
                <line x1={ptsTotal[activeHoverIdx].x} y1={padTop} x2={ptsTotal[activeHoverIdx].x} y2={baseY} stroke="#64748b" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
            )}
            {/* Tooltip */}
            {activeHoverIdx !== null && (() => {
                const px = ptsTotal[activeHoverIdx].x;
                const d = data[activeHoverIdx];
                const tw = 110; const th = 52;
                let tx = px - tw / 2;
                if (tx < 0) tx = 0;
                if (tx + tw > width) tx = width - tw;
                const ty = Math.max(2, ptsTotal[activeHoverIdx].y - th - 10);
                return (
                    <g filter="url(#tooltip-shadow-s)">
                        <rect x={tx} y={ty} width={tw} height={th} rx="6" fill="#1e293b" opacity="0.94" />
                        <text x={tx + tw / 2} y={ty + 13} textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="500">{d.label}</text>
                        <text x={tx + 8} y={ty + 28} fontSize="9" fill={color1} fontWeight="700">📱 {d.withPhone || 0}</text>
                        <text x={tx + tw / 2 + 8} y={ty + 28} fontSize="9" fill={color2} fontWeight="700">🚫 {d.withoutPhone || 0}</text>
                        <text x={tx + tw / 2} y={ty + 44} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="800">Toplam: {totals[activeHoverIdx]}</text>
                    </g>
                );
            })()}
            {/* X labels */}
            {showLabels && data.map((d, i) => {
                if (data.length > 15 && i % Math.ceil(data.length / 7) !== 0 && i !== data.length - 1) return null;
                return (
                    <text key={i} x={padLeft + i * step} y={height - 4} textAnchor="middle" fontSize="8" fill={activeHoverIdx === i ? '#1e293b' : '#94a3b8'} fontWeight={activeHoverIdx === i ? '700' : '500'}>
                        {d.label}
                    </text>
                );
            })}
            {/* Max label */}
            <text x={width - padRight} y={padTop - 8} textAnchor="end" fontSize="9" fill="#64748b" fontWeight="700">{formatNumber(max)}</text>
            {/* Legend */}
            <rect x={padLeft} y={2} width={8} height={8} rx="2" fill={color1} />
            <text x={padLeft + 11} y={9} fontSize="8" fill="#64748b" fontWeight="600">Numaralı</text>
            <rect x={padLeft + 62} y={2} width={8} height={8} rx="2" fill={color2} />
            <text x={padLeft + 73} y={9} fontSize="8" fill="#64748b" fontWeight="600">Numarasız</text>
            <rect x={padLeft + 130} y={2} width={8} height={8} rx="2" fill={colorTotal} />
            <text x={padLeft + 141} y={9} fontSize="8" fill="#64748b" fontWeight="600">Toplam</text>
            {/* Hover rects */}
            {data.map((_, i) => (
                <rect key={`h-${i}`} x={padLeft + i * step - step / 2} y={0} width={step} height={height}
                    fill="transparent" onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: 'crosshair' }} />
            ))}
        </svg>
    );
};

// ── Interactive Heatmap (7 days x 24 hours) with tooltip ──
const Heatmap = ({ data }) => {
    const [hoverCell, setHoverCell] = useState(null);

    // ── Bulletproof data normalization ──
    let heatData;
    try {
        if (Array.isArray(data) && data.length === 7 && data.every(row => Array.isArray(row) && row.length === 24)) {
            // Perfect format: 7x24 array
            heatData = data;
        } else if (Array.isArray(data) && data.length === 7) {
            // 7 rows but each row might be wrong length — pad/truncate to 24
            heatData = data.map(row => {
                if (!Array.isArray(row)) return Array(24).fill(0);
                const padded = [...row];
                while (padded.length < 24) padded.push(0);
                return padded.slice(0, 24).map(v => typeof v === 'number' ? v : 0);
            });
        } else if (data && typeof data === 'object' && !Array.isArray(data)) {
            // Object format: { "0": [...], "1": [...] } or { "Pzt": [...] }
            heatData = Array.from({ length: 7 }, (_, i) => {
                const row = data[i] || data[String(i)];
                if (Array.isArray(row)) return row.slice(0, 24).map(v => typeof v === 'number' ? v : 0);
                return Array(24).fill(0);
            });
        } else {
            // Fallback: empty grid
            heatData = Array.from({ length: 7 }, () => Array(24).fill(0));
        }
    } catch {
        heatData = Array.from({ length: 7 }, () => Array(24).fill(0));
    }

    const allVals = heatData.flat();
    const max = Math.max(...allVals, 1);
    const hasData = allVals.some(v => v > 0);
    const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

    const getColor = (val) => {
        if (val === 0) return '#f1f5f9';
        const intensity = Math.min(val / max, 1);
        if (intensity < 0.15) return '#e0e7ff';
        if (intensity < 0.3) return '#c7d2fe';
        if (intensity < 0.5) return '#a5b4fc';
        if (intensity < 0.7) return '#818cf8';
        return '#6366f1';
    };

    // Inline styles as FALLBACK to guarantee rendering even if CSS fails
    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: '38px repeat(24, 1fr)',
        gap: '2px',
        alignItems: 'center',
        width: '100%'
    };
    const cellStyle = (val) => ({
        aspectRatio: '1',
        borderRadius: '3px',
        minHeight: '14px',
        background: getColor(val),
        cursor: 'pointer',
        transition: 'transform 0.12s, box-shadow 0.12s'
    });

    return (
        <div style={{ width: '100%', overflow: 'visible' }}>
            <div className="dash-heatmap-grid" style={gridStyle}>
                {/* Hour headers */}
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                    <div key={`hdr-${h}`} style={{ fontSize: '0.55rem', fontWeight: 600, color: '#94a3b8', textAlign: 'center' }}>
                        {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                    </div>
                ))}
                {/* Rows */}
                {days.map((day, di) => (
                    <React.Fragment key={`row-${di}`}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textAlign: 'right', paddingRight: '6px' }}>{day}</div>
                        {Array.from({ length: 24 }, (_, h) => {
                            const val = heatData[di]?.[h] || 0;
                            const isHovered = hoverCell?.d === di && hoverCell?.h === h;
                            return (
                                <div
                                    key={`c-${di}-${h}`}
                                    className="dash-hm-cell"
                                    style={{
                                        ...cellStyle(val),
                                        ...(isHovered ? { transform: 'scale(1.3)', boxShadow: '0 0 6px rgba(0,0,0,0.15)', zIndex: 2, position: 'relative' } : {})
                                    }}
                                    onMouseEnter={() => setHoverCell({ d: di, h, val })}
                                    onMouseLeave={() => setHoverCell(null)}
                                />
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
            {/* Hover tooltip */}
            {hoverCell && (
                <div style={{ textAlign: 'center', padding: '8px 16px', marginTop: '8px', background: '#1e293b', color: '#e2e8f0', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 500 }}>
                    <strong>{days[hoverCell.d]}</strong> {String(hoverCell.h).padStart(2, '0')}:00 — <span style={{ color: '#818cf8', fontWeight: 800 }}>{hoverCell.val}</span> başvuru
                </div>
            )}
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                {!hasData && <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>Bu dönem için veri yok</span>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '0.58rem', fontWeight: 600, color: '#94a3b8' }}>
                    <span>Az</span>
                    <div style={{ width: '100px', height: '10px', borderRadius: '5px', background: 'linear-gradient(90deg, #f1f5f9, #e0e7ff, #c7d2fe, #a5b4fc, #818cf8, #6366f1)' }} />
                    <span>Çok</span>
                </div>
            </div>
        </div>
    );
};

// ── Horizontal Bar ──
const HorizontalBar = ({ items, maxValue }) => {
    const max = maxValue || Math.max(...items.map(i => i.value), 1);
    return (
        <div className="dash-hbar-list">
            {items.map((item, idx) => (
                <div key={idx} className="dash-hbar-row">
                    <span className="dash-hbar-label">{item.label}</span>
                    <div className="dash-hbar-track">
                        <div
                            className="dash-hbar-fill"
                            style={{
                                width: `${Math.max((item.value / max) * 100, 2)}%`,
                                background: item.color || '#6366f1'
                            }}
                        />
                    </div>
                    <span className="dash-hbar-value">{formatNumber(item.value)}</span>
                </div>
            ))}
        </div>
    );
};

// ── Donut Mini ──
const DonutMini = ({ value, total, color = '#6366f1', label, size = 68 }) => {
    const pct = total > 0 ? (value / total) * 100 : 0;
    const r = size * 0.41;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    const center = size / 2;
    return (
        <div className="dash-donut-wrap">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={center} cy={center} r={r} fill="none" stroke="#f1f5f9" strokeWidth={size * 0.1} />
                <circle
                    cx={center} cy={center} r={r} fill="none"
                    stroke={color} strokeWidth={size * 0.1}
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${center} ${center})`}
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
                <text x={center} y={center + 4} textAnchor="middle" fontSize={size * 0.19} fontWeight="800" fill="#0f172a">
                    {pct.toFixed(0)}%
                </text>
            </svg>
            {label && <span className="dash-donut-label">{label}</span>}
        </div>
    );
};

// ── League Row ──
const LeagueRow = ({ rank, name, value, valueLabel, highlight }) => (
    <div className={`dash-league-row${highlight ? ' dash-league-top' : ''}`}>
        <span className="dash-league-rank">{rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}</span>
        <span className="dash-league-name">{name}</span>
        <span className="dash-league-value">{value}</span>
        {valueLabel && <span className="dash-league-vlabel">{valueLabel}</span>}
    </div>
);

// ── KPI Stat Card (enhanced with subtitle) ──
const KpiStat = ({ label, value, icon, color, trend, subtitle }) => (
    <div className="dash-kpi-stat">
        <div className="dash-kpi-stat-icon" style={{ background: `${color}15`, color }}>
            {icon}
        </div>
        <div className="dash-kpi-stat-body">
            <span className="dash-kpi-stat-val">{value}</span>
            <span className="dash-kpi-stat-label">{label}</span>
            {subtitle && <span className="dash-kpi-stat-sub">{subtitle}</span>}
        </div>
        {trend}
    </div>
);


// Helper function to render simple markdown from Gemini
const parseBoldText = (text) => {
    if (!text) return '';
    const parts = text.split(/\*\*([\s\S]*?)\*\*/g);
    return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part);
};

const renderMarkdown = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
        let cleanLine = line.trim();
        if (cleanLine.startsWith('###')) {
            return <h3 key={idx} className="ai-summary-h3">{parseBoldText(cleanLine.replace('###', '').trim())}</h3>;
        }
        if (cleanLine.startsWith('##')) {
            return <h2 key={idx} className="ai-summary-h2">{parseBoldText(cleanLine.replace('##', '').trim())}</h2>;
        }
        if (cleanLine.startsWith('#')) {
            return <h1 key={idx} className="ai-summary-h1">{parseBoldText(cleanLine.replace('#', '').trim())}</h1>;
        }
        if (cleanLine.startsWith('-') || cleanLine.startsWith('*')) {
            return <li key={idx} className="ai-summary-li">{parseBoldText(cleanLine.substring(1).trim())}</li>;
        }
        if (cleanLine === '') {
            return <div key={idx} className="ai-summary-space" />;
        }
        return <p key={idx} className="ai-summary-p">{parseBoldText(cleanLine)}</p>;
    });
};


// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════

const CeoReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [contactStats, setContactStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || '30d');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);
    const [funnelFilter, setFunnelFilter] = useState('');
    const [funnels, setFunnels] = useState([]);
    


    useEffect(() => {
        if (!currentWorkspace?.id) return;
        funnelAPI.getAll(currentWorkspace.id).then(res => {
            setFunnels(res.data || []);
        }).catch(() => {});
    }, [currentWorkspace?.id]);



    const getDateRange = () => {
        return getDateRangeLogic(dateFilter, startDate, endDate);
    };


    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const dateParams = getDateRange();
            const params = { ...dateParams, comparePrevious: true };
            if (funnelFilter) params.funnelId = funnelFilter;

            const secondaryParams = { ...dateParams };
            if (funnelFilter) secondaryParams.funnelId = funnelFilter;

            const [analyticsRes, performanceRes, dailyStatsRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, params),
                contactAPI.getAgentPerformance(currentWorkspace.id, params),
                contactAPI.getDailyStats(currentWorkspace.id, secondaryParams).catch(e => {
                    console.warn('Daily stats failed:', e.message);
                    return { data: null };
                })
            ]);
            setAnalytics(analyticsRes.data);
            setAgentPerformance(performanceRes.data);
            if (dailyStatsRes && dailyStatsRes.data) {
                setContactStats(dailyStatsRes.data);
            }

        } catch (err) {
            console.error('Dashboard fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate, funnelFilter]);

    if (loading && !analytics) {
        return (
            <div className="ceo-report" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                    <p>Dashboard yükleniyor...</p>
                </div>
            </div>
        );
    }

    // ── Data derivatives ──
    const ds = analytics?.dealStats || {};
    const as2 = analytics?.activityStats || {};
    const ct = analytics?.callTrackingStats || {};
    const appt = analytics?.appointmentStats || {};
    const prev = analytics?.previousPeriod || {};
    const totalSales = ds.orderAmount || 0;
    const agents = agentPerformance?.agents || [];
    const topAgents = [...agents].sort((a, b) => (b.dealOrders || 0) - (a.dealOrders || 0)).slice(0, 5);
    const funnelSummary = analytics?.funnelSummary || [];
    const topFunnels = [...funnelSummary].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 5);
    const channels = analytics?.channelData || [];
    const sortedChannels = [...channels].sort((a, b) => (b.count || 0) - (a.count || 0));
    const numarali = contactStats?.totals?.withPhone || ct.totalWithPhone || 0;
    const kaciArandi = ct.totalCalled || 0;
    const aranmayan = Math.max(0, numarali - kaciArandi);
    const aramaOrani = numarali > 0 ? ((kaciArandi / numarali) * 100).toFixed(0) : 0;
    const totalAICalls = agents.reduce((s, a) => s + (a.retellCallCount || 0), 0);
    const monthlyData = analytics?.monthlyData || [];

    // Daily trend data — with phone breakdown
    const dailyStats = contactStats?.dailyStats || [];
    const dailyChartData = dailyStats.map(d => ({
        label: d.date ? d.date.slice(5) : '', // MM-DD
        value: d.total || 0
    }));
    const dailyStackedData = dailyStats.map(d => ({
        label: d.date ? d.date.slice(5) : '',
        withPhone: d.withPhone || 0,
        withoutPhone: d.withoutPhone || 0
    }));

    const calcTrend = (current, previous) => {
        if (!previous || previous === 0) return null;
        const pct = ((current - previous) / previous * 100).toFixed(0);
        return { pct: Math.abs(pct), direction: current >= previous ? 'up' : 'down' };
    };

    const TrendBadge = ({ current, previous }) => {
        const trend = calcTrend(current, previous);
        if (!trend) return null;
        return (
            <span className={`ceo-trend-badge ${trend.direction === 'up' ? 'ceo-trend-up' : 'ceo-trend-down'}`}>
                {trend.direction === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                %{trend.pct}
            </span>
        );
    };

    const channelIcon = (ch) => {
        const map = { WHATSAPP: '💬', INSTAGRAM: '📸', FACEBOOK: '👤', EMAIL: '✉️', PHONE: '📞', WIDGET: '🌐', LEAD: '🎯' };
        return map[ch] || '📋';
    };
    const channelLabel = (ch) => {
        const map = { WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', EMAIL: 'E-posta', PHONE: 'Telefon', WIDGET: 'Web Widget', LEAD: 'Lead Form' };
        return map[ch] || ch;
    };
    const channelColor = (ch) => {
        const map = { WHATSAPP: '#25d366', INSTAGRAM: '#e1306c', FACEBOOK: '#1877f2', EMAIL: '#ea580c', PHONE: '#16a34a', WIDGET: '#6366f1', LEAD: '#ec4899' };
        return map[ch] || '#94a3b8';
    };

    const renderPrintHeader = (pageTitle) => {
        const TurkishFilterLabels = {
            all: 'Tüm Zamanlar',
            today: 'Bugün',
            yesterday: 'Dün',
            '7d': 'Bu Hafta',
            '30d': 'Bu Ay',
            '90d': 'Son 90 Gün',
            custom: 'Özel Tarih Aralığı'
        };
        const filterText = dateFilter === 'custom' && startDate ? `${startDate} / ${endDate}` : (TurkishFilterLabels[dateFilter] || dateFilter);
        return (
            <div className="print-page-header">
                <div className="print-page-header-top">
                    <img src="/instomer-logo.png" alt="Instomer" style={{ height: '28px' }} />
                    <span className="print-page-header-logo-text">GENEL PERFORMANS RAPORU</span>
                </div>
                <div className="print-page-header-meta">
                    <span>Rapor Bölümü: <strong>{pageTitle}</strong></span>
                    <span>Tarih Filtresi: <strong>{filterText}</strong></span>
                    <span>Yazdırma Tarihi: <strong>{new Date().toLocaleDateString('tr-TR')}</strong></span>
                </div>
            </div>
        );
    };

    const handleDownload = async () => {
        window.print();
    };

    return (
        <div className="ceo-report">


            {/* Logo area shown ONLY in print layout */}
            <div className="print-logo-header">
                <img src="/instomer-logo.png" alt="Instomer" style={{ height: '38px' }} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>
                    Genel Performans Raporu — {new Date().toLocaleDateString('tr-TR')}
                </span>
            </div>

            {/* ═══════ SINGLE-ROW HEADER ═══════ */}
            <div className="dash-topbar">
                <h1 className="dash-topbar-title">Dashboard</h1>
                <div className="dash-topbar-pills">
                    {dateFilterOptions.map(item => (
                        <button
                            key={item.key}
                            className={`dash-pill${dateFilter === item.key ? ' active' : ''}`}
                            onClick={() => setDateFilter(item.key)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                {dateFilter === 'custom' && (
                    <div className="dash-topbar-dates">
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="dash-date-input" />
                        <span>—</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="dash-date-input" />
                    </div>
                )}
                {funnels.length > 0 && (
                    <select value={funnelFilter} onChange={(e) => setFunnelFilter(e.target.value)} className="dash-funnel-select">
                        <option value="">Tüm Akışlar</option>
                        {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                )}
                <button className="dash-refresh-btn" onClick={fetchData} title="Güncelle">
                    <RefreshCw size={14} />
                </button>
                <button className="dash-download-btn" onClick={handleDownload} title="PDF Olarak İndir" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: '#6366f1',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    marginLeft: '12px'
                }}>
                    <FileText size={14} />
                    <span>Raporu İndir</span>
                </button>
            </div>

            {/* ═══════ KPI SUMMARY ROW ═══════ */}
            <div className="dash-kpi-row">
                <KpiStat label="Başvuru" value={formatNumber(analytics?.totalContacts || 0)} icon={<Users size={22} />} color="#6366f1"
                    subtitle={`${formatNumber(analytics?.withPhoneCount || contactStats?.totals?.withPhone || 0)} numaralı`}
                    trend={<TrendBadge current={analytics?.totalContacts || 0} previous={prev.totalContacts} />} />
                <KpiStat label="Mesaj" value={formatNumber(analytics?.totalMessages || 0)} icon={<MessageSquare size={22} />} color="#3b82f6"
                    subtitle={`Ort. ${analytics?.totalContacts ? Math.round((analytics?.totalMessages || 0) / analytics.totalContacts) : 0}/kişi`} />
                <KpiStat label="Arama" value={formatNumber(ct.totalCalled || 0)} icon={<Phone size={22} />} color="#16a34a"
                    subtitle={`${aramaOrani}% arama oranı`}
                    trend={<TrendBadge current={ct.totalCalled || 0} previous={prev.totalCalled} />} />
                <KpiStat label="Sipariş" value={formatNumber(ds.totalOrders || 0)} icon={<ShoppingCart size={22} />} color="#f59e0b"
                    subtitle={`${formatNumber(ds.totalQuotes || 0)} teklif`} />
                <KpiStat label="Ciro" value={formatCurrency(totalSales)} icon={<DollarSign size={22} />} color="#059669"
                    subtitle={ds.wonCount ? `${ds.wonCount} kazanılan` : 'Henüz kazanılan yok'}
                    trend={<TrendBadge current={totalSales} previous={prev.orderAmount} />} />
                <KpiStat label="Çözüm" value={`${analytics?.resolutionRate || 0}%`} icon={<CheckCircle2 size={22} />} color="#8b5cf6"
                    subtitle={`${formatNumber(analytics?.resolvedCount || 0)} çözülen`} />
            </div>

            {/* ═══════ ANALYTICS GRID ═══════ */}
            <div className="dash-analytics-grid">

                {/* ──── Günlük Başvuru Trendi (wide) — Stacked numaralı/numarasız ──── */}
                <div className="dash-panel dash-panel-wide" onClick={() => navigate('/general-report/general')}>
                    <div className="dash-panel-header">
                        <h3><TrendingUp size={18} /> Günlük Başvuru Trendi</h3>
                        <span className="dash-panel-link">Detaylı Rapor <ArrowRight size={14} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <StackedAreaChart data={dailyStackedData} height={200} />
                    </div>
                </div>

                {/* ──── Kanal Dağılımı ──── */}
                <div className="dash-panel" onClick={() => navigate('/general-report/general')}>
                    <div className="dash-panel-header">
                        <h3><PieChart size={18} /> Kanal Dağılımı</h3>
                    </div>
                    <div className="dash-panel-body">
                        {sortedChannels.length > 0 ? (
                            <HorizontalBar
                                items={sortedChannels.slice(0, 6).map(ch => ({
                                    label: `${channelIcon(ch.channel)} ${channelLabel(ch.channel)}`,
                                    value: ch.count,
                                    color: channelColor(ch.channel)
                                }))}
                            />
                        ) : <div className="dash-chart-empty">Veri yok</div>}
                    </div>
                </div>

                {/* ──── Aylık Başvuru Trendi ──── */}
                <div className="dash-panel">
                    <div className="dash-panel-header">
                        <h3 title="Seçili tarih aralığından bağımsız, son 6 ayın trendini gösterir"><BarChart3 size={16} /> Aylık Başvuru Trendi (Son 6 Ay)</h3>
                    </div>
                    <div className="dash-panel-body">
                        {monthlyData.length > 0 ? (
                            <AreaChart
                                data={monthlyData.map(m => ({ label: m.month, value: m.count }))}
                                color="#8b5cf6" height={160}
                            />
                        ) : (
                            <div className="dash-chart-empty">Aylık veri yok</div>
                        )}
                    </div>
                </div>

                {/* ──── Takım & Temsilci (wide, 2 bölüm) ──── */}
                <div className="dash-panel dash-panel-wide" onClick={() => navigate('/general-report/team')} style={{ cursor: 'pointer' }}>
                    <div className="dash-panel-header">
                        <h3><UserCheck size={18} /> Takım & Temsilci</h3>
                        <span className="dash-panel-link">Detaylı <ArrowRight size={14} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <div className="dash-split-panel">
                            {/* Sol: Takım KPI & Dağılımı */}
                            <div className="dash-split-section" style={{ flex: '1 1 40%' }}>
                                <div className="dash-panel-kpis-mini" style={{ marginBottom: 16 }}>
                                    <div><strong>{agents.length}</strong><span>Ajan</span></div>
                                    <div><strong>{agentPerformance?.teamTotals?.avgResolutionRate || 0}%</strong><span>Çözüm</span></div>
                                    <div><strong>{agentPerformance?.teamTotals?.avgResponseTime || 0}dk</strong><span>Yanıt</span></div>
                                </div>
                                {(!agentPerformance?.teams || agentPerformance.teams.length === 0) ? (
                                    <div className="dash-team-distribution">
                                        <h4 className="dash-team-dist-title">Takım Dağılımı</h4>
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '24px 16px',
                                            background: '#f8fafc',
                                            borderRadius: '8px',
                                            border: '1px dashed #cbd5e1',
                                            color: '#64748b',
                                            textAlign: 'center',
                                            fontSize: '0.8rem'
                                        }}>
                                            <span style={{ fontSize: '1.5rem', marginBottom: '8px' }}>👥</span>
                                            <strong style={{ display: 'block', marginBottom: '4px', color: '#334155' }}>Henüz Takım Oluşturulmamış</strong>
                                            <span>Müşteri temsilcilerinizi 'Satış', 'Destek' gibi takımlara bölerek performans dağılımını burada görebilirsiniz.</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="dash-team-distribution">
                                        <h4 className="dash-team-dist-title">Takım Dağılımı</h4>
                                        <div className="dash-team-dist-list">
                                            {(() => {
                                                const salesTeams = agentPerformance.teams.filter(t => t.name?.toLowerCase().includes('satış'));
                                                const otherTeams = agentPerformance.teams.filter(t => !t.name?.toLowerCase().includes('satış'));
                                                
                                                const renderTeam = (t, i) => (
                                                    <div key={t.id || i} className="dash-team-dist-row">
                                                        <div className="dash-team-dist-info">
                                                            <span className="dash-team-dist-dot" style={{ background: t.color || '#3b82f6' }} />
                                                            <span className="dash-team-dist-name">{t.name}</span>
                                                            <span className="dash-team-dist-agents">({t.agentCount} Ajan)</span>
                                                        </div>
                                                        <span className="dash-team-dist-val">{t.conversationCount} Görüşme</span>
                                                    </div>
                                                );

                                                return (
                                                    <>
                                                        {salesTeams.length > 0 && (
                                                            <div style={{ marginBottom: '8px' }}>
                                                                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Satış Takımları</div>
                                                                {salesTeams.map(renderTeam)}
                                                            </div>
                                                        )}
                                                        {otherTeams.length > 0 && (
                                                            <div>
                                                                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Diğer Takımlar</div>
                                                                {otherTeams.map(renderTeam)}
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Dikey ayırıcı */}
                            <div className="dash-split-divider" />
                            {/* Sağ: Temsilci Sıralaması */}
                            <div className="dash-split-section">
                                {topAgents.length > 0 ? (
                                    <div className="dash-league">
                                        {topAgents.map((a, i) => (
                                            <LeagueRow key={a.id || i} rank={i + 1} name={a.name || 'Bilinmeyen'} value={a.dealOrders || 0} valueLabel="sipariş" highlight={i === 0} />
                                        ))}
                                    </div>
                                ) : <div className="dash-chart-empty">Henüz ajan yok</div>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ──── Akış Raporu (wide — alt alta dikey liste) ──── */}
                <div className="dash-panel dash-panel-wide" onClick={() => navigate('/general-report/funnel')}>
                    <div className="dash-panel-header">
                        <h3><Activity size={16} /> Akış Raporu</h3>
                        <span className="dash-panel-link">Detaylı <ArrowRight size={12} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <div className="dash-panel-kpis-mini" style={{ marginBottom: 14 }}>
                            <div><strong>{funnelSummary.length}</strong><span>Akış</span></div>
                            <div><strong>{formatNumber(funnelSummary.reduce((s, f) => s + (f.count || 0), 0))}</strong><span>Kişi</span></div>
                            <div><strong>{analytics?.conversionRate || 0}%</strong><span>Dönüşüm</span></div>
                        </div>
                        {funnelSummary.length > 0 ? (
                            <div className="dash-funnel-vertical">
                                {funnelSummary.filter(f => f.count > 0).map((f, fi) => {
                                    const stages = f.stages || [];
                                    const fTotal = Math.max(f.count || 1, 1);
                                    const fColors = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#f97316'];
                                    return (
                                        <div key={f.id || fi} className="dash-funnel-vcard">
                                            <div className="dash-funnel-vcard-header">
                                                <span className="dash-funnel-card-icon">{f.icon || '📋'}</span>
                                                <span className="dash-funnel-card-name">{f.name}</span>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                                    <span className="dash-funnel-card-count" style={{ display: 'flex', alignItems: 'center' }}>
                                                        <small style={{ fontSize: 10, color: '#64748b', marginRight: 4 }}>Toplam:</small>
                                                        <span style={{ fontWeight: 800, color: '#0f172a' }}>{formatNumber(f.count)}</span>
                                                    </span>
                                                    <span style={{ display: 'flex', alignItems: 'center', fontSize: 11 }}>
                                                        <small style={{ fontSize: 10, color: '#64748b', marginRight: 4 }}>Bu Dönem:</small>
                                                        <strong style={{ color: f.recentCount > 0 ? '#10b981' : '#64748b' }}>+{formatNumber(f.recentCount || 0)}</strong>
                                                    </span>
                                                </div>
                                            </div>
                                            {stages.length > 0 ? (
                                                <div className="dash-funnel-vstages">
                                                    {/* Stacked bar */}
                                                    <div className="dash-funnel-sbar">
                                                        {stages.filter(s => s.count > 0).map((s, si) => (
                                                            <div key={s.id || si} className="dash-funnel-sbar-seg"
                                                                style={{ width: `${Math.max((s.count / fTotal) * 100, 4)}%`, background: s.color || fColors[si % fColors.length] }}
                                                                title={`${s.name}: ${s.count}`}
                                                            >
                                                                {(s.count / fTotal) > 0.06 && <span>{s.count}</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {/* Stage labels — her aşama ayrı satır */}
                                                    <div className="dash-funnel-vstage-list">
                                                        {stages.map((s, si) => (
                                                            <div key={s.id || si} className="dash-funnel-vstage-row">
                                                                <span className="dash-funnel-vstage-dot" style={{ background: s.color || fColors[si % fColors.length] }} />
                                                                <span className="dash-funnel-vstage-name">{s.name}</span>
                                                                <span className="dash-funnel-vstage-count" style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                                                                    <span>Toplam: <strong style={{ color: '#475569' }}>{s.count}</strong></span>
                                                                    <span style={{ color: s.recentCount > 0 ? '#10b981' : '#94a3b8', fontWeight: 600 }}>
                                                                        (Yeni: +{s.recentCount || 0})
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="dash-funnel-no-stages">Aşama tanımlı değil</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : <div className="dash-chart-empty">Akış verisi yok</div>}
                    </div>
                </div>

                {/* ──── Aktivite & Arama (wide, 2 bölüm) ──── */}
                <div className="dash-panel dash-panel-wide" onClick={() => navigate('/general-report/activities')}>
                    <div className="dash-split-panel">
                        {/* Sol: Arama İstatistikleri */}
                        <div className="dash-split-section">
                            <div className="dash-panel-header">
                                <h3><Phone size={18} /> Arama Raporu</h3>
                            </div>
                            <div className="dash-panel-body">
                                <div className="dash-activity-grid">
                                    <DonutMini value={kaciArandi} total={numarali} color="#16a34a" label="Arama Oranı" size={96} />
                                    <div className="dash-activity-stats">
                                        <div className="dash-act-row">
                                            <Phone size={16} style={{ color: '#16a34a' }} />
                                            <span>Aranan</span>
                                            <strong>{formatNumber(kaciArandi)}</strong>
                                        </div>
                                        <div className="dash-act-row">
                                            <PhoneOff size={16} style={{ color: '#ef4444' }} />
                                            <span>Aranmayan</span>
                                            <strong style={{ color: aranmayan > 0 ? '#ef4444' : undefined }}>{formatNumber(aranmayan)}</strong>
                                        </div>
                                        <div className="dash-act-row">
                                            <Users size={16} style={{ color: '#3b82f6' }} />
                                            <span>Numaralı</span>
                                            <strong>{formatNumber(numarali)}</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Dikey ayırıcı */}
                        <div className="dash-split-divider" />
                        {/* Sağ: Aktivite Detay */}
                        <div className="dash-split-section">
                            <div className="dash-panel-header">
                                <h3><ClipboardList size={18} /> Aktivite Raporu</h3>
                                <span className="dash-panel-link">Detaylı <ArrowRight size={14} /></span>
                            </div>
                            <div className="dash-panel-body">
                                <div className="dash-panel-kpis-mini" style={{ marginBottom: 10 }}>
                                    <div><strong>{formatNumber(as2.totalActivities || 0)}</strong><span>Toplam</span></div>
                                    <div><strong>{formatNumber(as2.completedCount || 0)}</strong><span>Tamamlanan</span></div>
                                    <div><strong style={{ color: (as2.overdueCount || 0) > 0 ? '#ef4444' : undefined }}>{as2.overdueCount || 0}</strong><span>Geciken</span></div>
                                </div>
                                <div className="dash-activity-stats">
                                    <div className="dash-act-row">
                                        <Handshake size={16} style={{ color: '#6366f1' }} />
                                        <span>Görüşme</span>
                                        <strong>{as2.meetingCount || 0}</strong>
                                    </div>
                                    <div className="dash-act-row">
                                        <Calendar size={16} style={{ color: '#8b5cf6' }} />
                                        <span>Randevu</span>
                                        <strong>{appt.total || 0}</strong>
                                    </div>
                                    <div className="dash-act-row">
                                        <ListChecks size={16} style={{ color: '#f59e0b' }} />
                                        <span>Görev</span>
                                        <strong>{as2.taskCount || 0}</strong>
                                    </div>
                                    <div className="dash-act-row">
                                        <PhoneCall size={16} style={{ color: '#16a34a' }} />
                                        <span>Arama Notu</span>
                                        <strong>{as2.callCount || 0}</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ──── AI Arama (wide — detaylı) ──── */}
                <div className="dash-panel dash-panel-wide" onClick={() => navigate('/general-report/ai-calls')} style={{ cursor: 'pointer' }}>
                    <div className="dash-panel-header">
                        <h3><Bot size={18} /> AI Arama Analizi</h3>
                        <span className="dash-panel-link">{totalAICalls > 0 ? 'Detaylı' : 'Keşfet'} <ArrowRight size={14} /></span>
                    </div>
                    <div className="dash-panel-body">
                        {totalAICalls > 0 ? (
                            <div className="dash-split-panel">
                                {/* Sol: KPI'lar */}
                                <div className="dash-split-section">
                                    <div className="dash-panel-kpis-mini">
                                        <div><strong>{formatNumber(totalAICalls)}</strong><span>Toplam AI Arama</span></div>
                                        <div><strong>{formatNumber(analytics?.aiCallStats?.successfulCount || 0)}</strong><span>Başarılı</span></div>
                                        <div><strong>{analytics?.aiCallStats?.totalCost ? `$${analytics.aiCallStats.totalCost.toFixed(2)}` : '$0'}</strong><span>Maliyet</span></div>
                                        <div><strong>{formatNumber(appt.byBot || 0)}</strong><span>Bot Randevu</span></div>
                                    </div>
                                </div>
                                {/* Dikey ayırıcı */}
                                <div className="dash-split-divider" />
                                {/* Sağ: AI vs Manuel karşılaştırma */}
                                <div className="dash-split-section">
                                    <div className="dash-ai-bar-group">
                                        <div className="dash-ai-bar-item">
                                            <span className="dash-ai-bar-label"><Bot size={13} /> AI Arama</span>
                                            <div className="dash-ai-bar-track">
                                                <div className="dash-ai-bar-fill" style={{
                                                    width: `${Math.max((totalAICalls / (kaciArandi + totalAICalls || 1)) * 100, 5)}%`,
                                                    background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)'
                                                }} />
                                            </div>
                                            <span className="dash-ai-bar-count">{formatNumber(totalAICalls)}</span>
                                        </div>
                                        <div className="dash-ai-bar-item">
                                            <span className="dash-ai-bar-label"><UserCheck size={13} /> Manuel Arama</span>
                                            <div className="dash-ai-bar-track">
                                                <div className="dash-ai-bar-fill" style={{
                                                    width: `${Math.max((kaciArandi / (kaciArandi + totalAICalls || 1)) * 100, 5)}%`,
                                                    background: 'linear-gradient(90deg, #3b82f6, #60a5fa)'
                                                }} />
                                            </div>
                                            <span className="dash-ai-bar-count">{formatNumber(kaciArandi)}</span>
                                        </div>
                                        {analytics?.aiCallStats?.avgDuration > 0 && (
                                            <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                                                <Clock size={12} style={{ marginRight: 4 }} /> Ort. Süre: {Math.round(analytics.aiCallStats.avgDuration / 60)}dk {analytics.aiCallStats.avgDuration % 60}sn
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="dash-chart-empty" style={{ padding: '20px 0' }}>
                                <Sparkles size={20} style={{ color: '#8b5cf6' }} />
                                <span>AI Arama henüz aktif değil</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ──── Satış & Ciro Raporu (WIDE — premium sales dashboard) ──── */}
                <div className="dash-panel dash-panel-wide" onClick={() => navigate('/general-report/sales')}>
                    <div className="dash-panel-header">
                        <h3><DollarSign size={18} /> Satış & Ciro Raporu</h3>
                        <span className="dash-panel-link">Detaylı Rapor <ArrowRight size={14} /></span>
                    </div>
                    <div className="dash-panel-body">
                        {/* KPI row */}
                        <div className="dash-sales-kpi-row">
                            <div className="dash-sales-kpi-card">
                                <div className="dash-sales-kpi-icon" style={{ background: '#f59e0b15', color: '#f59e0b' }}><FileText size={20} /></div>
                                <div><span className="dash-sales-kpi-val">{formatNumber(ds.totalQuotes || 0)}</span><span className="dash-sales-kpi-lbl">Teklif</span></div>
                                <span className="dash-sales-kpi-amt">{formatCurrency(ds.quoteAmount || 0)}</span>
                            </div>
                            <div className="dash-sales-kpi-card">
                                <div className="dash-sales-kpi-icon" style={{ background: '#3b82f615', color: '#3b82f6' }}><ShoppingCart size={20} /></div>
                                <div><span className="dash-sales-kpi-val">{formatNumber(ds.totalOrders || 0)}</span><span className="dash-sales-kpi-lbl">Sipariş</span></div>
                                <span className="dash-sales-kpi-amt">{formatCurrency(ds.orderAmount || 0)}</span>
                            </div>
                            <div className="dash-sales-kpi-card">
                                <div className="dash-sales-kpi-icon" style={{ background: '#10b98115', color: '#10b981' }}><CheckCircle2 size={20} /></div>
                                <div><span className="dash-sales-kpi-val">{ds.wonCount || 0}</span><span className="dash-sales-kpi-lbl">Kazanılan</span></div>
                                <span className="dash-sales-kpi-amt" style={{ color: '#059669' }}>{formatCurrency(ds.wonAmount || 0)}</span>
                            </div>
                            <div className="dash-sales-kpi-card">
                                <div className="dash-sales-kpi-icon" style={{ background: '#ef444415', color: '#ef4444' }}><AlertTriangle size={20} /></div>
                                <div><span className="dash-sales-kpi-val">{ds.lostCount || 0}</span><span className="dash-sales-kpi-lbl">Kaybedilen</span></div>
                            </div>
                            <div className="dash-sales-kpi-card dash-sales-kpi-ciro">
                                <div className="dash-sales-kpi-icon" style={{ background: '#059669', color: '#fff' }}><DollarSign size={20} /></div>
                                <div><span className="dash-sales-kpi-val" style={{ color: '#059669', fontSize: 22 }}>{formatCurrency(totalSales)}</span><span className="dash-sales-kpi-lbl">Toplam Ciro</span></div>
                            </div>
                        </div>
                        {/* Pipeline funnel bar */}
                        <div className="dash-sales-pipeline">
                            {(() => {
                                const stages = [
                                    { label: 'Teklif', count: ds.totalQuotes || 0, color: '#f59e0b' },
                                    { label: 'Sipariş', count: ds.totalOrders || 0, color: '#3b82f6' },
                                    { label: 'Kazanılan', count: ds.wonCount || 0, color: '#10b981' },
                                ];
                                const total = Math.max(stages.reduce((s, st) => s + st.count, 0), 1);
                                return (
                                    <div className="dash-sales-funnel-bar">
                                        {stages.map((st, i) => (
                                            <div key={i} className="dash-sales-funnel-seg" style={{ width: `${Math.max((st.count / total) * 100, 3)}%`, background: st.color }} title={`${st.label}: ${st.count}`}>
                                                {st.count > 0 && <span>{st.count}</span>}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                            <div className="dash-sales-funnel-labels">
                                <span><span style={{ color: '#f59e0b' }}>●</span> Teklif</span>
                                <span><span style={{ color: '#3b82f6' }}>●</span> Sipariş</span>
                                <span><span style={{ color: '#10b981' }}>●</span> Kazanılan</span>
                            </div>
                        </div>
                        {/* Recent deals table */}
                        {ds.recentDeals && ds.recentDeals.length > 0 && (
                            <div className="dash-sales-recent">
                                <h4 style={{ fontSize: 12, color: '#64748b', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Son Satışlar</h4>
                                <div className="dash-sales-table">
                                    <div className="dash-sales-table-head">
                                        <span>Başlık</span><span>Müşteri</span><span>Temsilci</span><span>Aşama</span><span>Tutar</span><span>Tarih</span>
                                    </div>
                                    {ds.recentDeals.slice(0, 5).map((deal, i) => (
                                        <div key={deal.id || i} className="dash-sales-table-row">
                                            <span className="dash-sales-td-title">{deal.title?.length > 25 ? deal.title.slice(0, 25) + '…' : (deal.title || '—')}</span>
                                            <span>{deal.contact?.name?.length > 15 ? deal.contact.name.slice(0, 15) + '…' : (deal.contact?.name || '—')}</span>
                                            <span style={{ color: '#6366f1', fontWeight: 600, fontSize: 11 }}>{deal.assignedTo?.name?.length > 12 ? deal.assignedTo.name.slice(0, 12) + '…' : (deal.assignedTo?.name || '—')}</span>
                                            <span className={`dash-sales-badge dash-sales-badge-${(deal.stage || '').toLowerCase()}`}>
                                                {deal.stage === 'QUOTE' ? 'Teklif' : deal.stage === 'ORDER' ? 'Sipariş' : deal.stage === 'INVOICE' ? 'Fatura' : deal.stage}
                                            </span>
                                            <span style={{ fontWeight: 700, color: '#059669' }}>{deal.amount ? formatCurrency(deal.amount) : '—'}</span>
                                            <span style={{ color: '#94a3b8', fontSize: 11 }}>{deal.createdAt ? new Date(deal.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ──── Gelen Talep Analizi (wide) ──── */}
                <div className="dash-panel dash-panel-wide" onClick={() => navigate('/general-report/requests')}>
                    <div className="dash-panel-header">
                        <h3><Target size={18} /> Gelen Talep Analizi</h3>
                        <span className="dash-panel-link">Detaylı Rapor <ArrowRight size={14} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <div className="dash-split-panel">
                            {/* Sol: KPI Kartları */}
                            <div className="dash-split-section">
                                <div className="dash-panel-kpis-mini">
                                    <div><strong>{formatNumber(analytics?.requestAnalysis?.totalRequests || 0)}</strong><span>Talep</span></div>
                                    <div><strong>{formatNumber(analytics?.requestAnalysis?.withPhoneCount || 0)}</strong><span>Numaralı</span></div>
                                    <div><strong>{formatNumber(analytics?.requestAnalysis?.relevantCount || 0)}</strong><span>İlgili</span></div>
                                </div>
                                <div style={{ marginTop: 16, fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 4 }}>
                                        <span>İlgili Oranı:</span>
                                        <strong style={{ color: '#0f172a' }}>
                                            {analytics?.requestAnalysis?.totalRequests > 0 
                                                ? `${((analytics.requestAnalysis.relevantCount / analytics.requestAnalysis.totalRequests) * 100).toFixed(0)}%` 
                                                : '0%'}
                                        </strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4 }}>
                                        <span>Telefon Bildirme Oranı:</span>
                                        <strong style={{ color: '#0f172a' }}>
                                            {analytics?.requestAnalysis?.totalRequests > 0 
                                                ? `${((analytics.requestAnalysis.withPhoneCount / analytics.requestAnalysis.totalRequests) * 100).toFixed(0)}%` 
                                                : '0%'}
                                        </strong>
                                    </div>
                                </div>
                            </div>
                            {/* Dikey ayırıcı */}
                            <div className="dash-split-divider" />
                            {/* Orta: Popüler Konular */}
                            <div className="dash-split-section" style={{ flex: '1.5' }}>
                                <h4 style={{ fontSize: 11, color: '#64748b', fontWeight: 600, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Öne Çıkan Talepler
                                </h4>
                                {(() => {
                                    const topics = analytics?.requestAnalysis?.topics || [];
                                    const sorted = [...topics].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 7);
                                    return sorted.length > 0 ? (
                                        <HorizontalBar items={sorted.map((t, i) => ({
                                            label: t.topic?.length > 30 ? t.topic.slice(0, 30) + '…' : t.topic,
                                            value: t.count,
                                            color: ['#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fdf2f8', '#fdf2f8', '#fdf2f8'][i] || '#ec4899'
                                        }))} />
                                    ) : <div className="dash-chart-empty">Talep verisi yok</div>;
                                })()}
                            </div>
                            {/* Dikey ayırıcı */}
                            <div className="dash-split-divider" />
                            {/* Sağ: İletişim Kalitesi */}
                            <div className="dash-split-section" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <h4 style={{ fontSize: 11, color: '#64748b', fontWeight: 600, margin: '0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Talep Kalitesi
                                </h4>
                                {(() => {
                                    const total = analytics?.requestAnalysis?.totalRequests || 0;
                                    const relevant = analytics?.requestAnalysis?.relevantCount || 0;
                                    const phone = analytics?.requestAnalysis?.withPhoneCount || 0;
                                    const relPct = total > 0 ? ((relevant/total)*100).toFixed(0) : 0;
                                    const phonePct = total > 0 ? ((phone/total)*100).toFixed(0) : 0;
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                                    <span style={{ color: '#64748b' }}>İlgili Talep Oranı</span>
                                                    <strong style={{ color: '#0f172a' }}>%{relPct}</strong>
                                                </div>
                                                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${relPct}%`, background: '#8b5cf6', borderRadius: 4 }} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                                    <span style={{ color: '#64748b' }}>Telefon Alma Oranı</span>
                                                    <strong style={{ color: '#0f172a' }}>%{phonePct}</strong>
                                                </div>
                                                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${phonePct}%`, background: '#ec4899', borderRadius: 4 }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                        {/* Son Talepler Table */}
                        {analytics?.requestAnalysis?.recentRequests && analytics.requestAnalysis.recentRequests.length > 0 && (
                            <div className="dash-sales-recent" style={{ marginTop: 20 }}>
                                <h4 style={{ fontSize: 12, color: '#64748b', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Son Gelen Talepler</h4>
                                <div className="dash-sales-table">
                                    <div className="dash-reqs-table-head">
                                        <span>Talep / Konu</span><span>Müşteri</span><span>Telefon</span><span>Aşama</span><span>Tarih</span>
                                    </div>
                                    {analytics.requestAnalysis.recentRequests.slice(0, 5).map((req, i) => (
                                        <div key={req.id || i} className="dash-reqs-table-row">
                                            <span className="dash-sales-td-title" title={req.topic}>{req.topic?.length > 35 ? req.topic.slice(0, 35) + '…' : (req.topic || '—')}</span>
                                            <span title={req.contactName}>{req.contactName?.length > 20 ? req.contactName.slice(0, 20) + '…' : (req.contactName || '—')}</span>
                                            <span style={{ color: '#475569', fontSize: 11 }}>{req.phone || '—'}</span>
                                            <span className={`dash-sales-badge dash-sales-badge-${(req.status || '').toLowerCase()}`}>
                                                {req.status === 'OPPORTUNITY' ? 'Fırsat' : req.status === 'HOT_OPPORTUNITY' ? 'Sıcak Fırsat' : req.status === 'MEETING_PLANNED' ? 'Toplantı' : req.status === 'PROPOSAL' ? 'Teklif' : req.status === 'CONVERTED' ? 'Satış' : req.status === 'NEW' ? 'Yeni' : req.status}
                                            </span>
                                            <span style={{ color: '#94a3b8', fontSize: 11 }}>{req.createdAt ? new Date(req.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ──── Isı Haritası (wide — en altta) ──── */}
                <div className="dash-panel dash-panel-wide" style={{ overflow: 'visible' }}>
                    <div className="dash-panel-header">
                        <h3><Activity size={18} /> Isı Haritası</h3>
                        <span className="dash-panel-subtitle">Başvuru saatlik yoğunluk dağılımı</span>
                    </div>
                    <div className="dash-panel-body">
                        <Heatmap data={analytics?.heatmapData} />
                    </div>
                </div>

            </div>



        </div>
    );
};

export default CeoReport;
