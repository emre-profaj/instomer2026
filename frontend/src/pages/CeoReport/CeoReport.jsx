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

// ── Area Sparkline ──
const AreaChart = ({ data, width = 500, height = 120, color = '#6366f1', showLabels = true }) => {
    if (!data || data.length === 0) return <div className="dash-chart-empty">Veri yok</div>;
    const values = data.map(d => d.value);
    const max = Math.max(...values, 1);
    const min = 0;
    const padTop = 15;
    const padBottom = showLabels ? 22 : 8;
    const chartH = height - padTop - padBottom;
    const step = width / Math.max(data.length - 1, 1);

    const points = values.map((v, i) => ({
        x: i * step,
        y: padTop + chartH - ((v - min) / (max - min || 1)) * chartH
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height - padBottom} L0,${height - padBottom} Z`;

    // Grid lines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => padTop + chartH * (1 - pct));

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="dash-area-svg">
            {/* Grid */}
            {gridLines.map((y, i) => (
                <line key={i} x1="0" y1={y} x2={width} y2={y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4,4" />
            ))}
            {/* Area fill */}
            <defs>
                <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#grad-${color.replace('#','')})`} />
            {/* Line */}
            <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {/* Dots on key points */}
            {points.filter((_, i) => i === 0 || i === points.length - 1 || values[i] === max).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} stroke="#fff" strokeWidth="1.5" />
            ))}
            {/* X-axis labels */}
            {showLabels && data.map((d, i) => {
                if (data.length > 15 && i % Math.ceil(data.length / 7) !== 0 && i !== data.length - 1) return null;
                return (
                    <text key={i} x={i * step} y={height - 4} textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="500">
                        {d.label}
                    </text>
                );
            })}
            {/* Max value label */}
            <text x={width - 4} y={padTop - 4} textAnchor="end" fontSize="9" fill="#64748b" fontWeight="700">
                {formatNumber(max)}
            </text>
        </svg>
    );
};

// ── Heatmap (7 days x 24 hours) ──
const Heatmap = ({ data, color = '#6366f1' }) => {
    if (!data || data.length !== 7) return <div className="dash-chart-empty">Isı haritası verisi yok</div>;
    const allVals = data.flat();
    const max = Math.max(...allVals, 1);
    const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const getColor = (val) => {
        if (val === 0) return '#f8fafc';
        const intensity = Math.min(val / max, 1);
        if (color === '#6366f1') {
            // Indigo scale
            if (intensity < 0.2) return '#e0e7ff';
            if (intensity < 0.4) return '#c7d2fe';
            if (intensity < 0.6) return '#a5b4fc';
            if (intensity < 0.8) return '#818cf8';
            return '#6366f1';
        }
        // Green scale fallback
        if (intensity < 0.2) return '#dcfce7';
        if (intensity < 0.4) return '#bbf7d0';
        if (intensity < 0.6) return '#86efac';
        if (intensity < 0.8) return '#4ade80';
        return '#22c55e';
    };

    return (
        <div className="dash-heatmap">
            <div className="dash-heatmap-grid">
                {/* Hour headers */}
                <div className="dash-hm-corner" />
                {hours.map(h => (
                    <div key={h} className="dash-hm-hour">{h % 3 === 0 ? `${String(h).padStart(2, '0')}` : ''}</div>
                ))}
                {/* Rows */}
                {days.map((day, di) => (
                    <React.Fragment key={di}>
                        <div className="dash-hm-day">{day}</div>
                        {hours.map(h => (
                            <div
                                key={h}
                                className="dash-hm-cell"
                                style={{ background: getColor(data[di][h]) }}
                                title={`${day} ${String(h).padStart(2, '0')}:00 — ${data[di][h]} başvuru`}
                            />
                        ))}
                    </React.Fragment>
                ))}
            </div>
            <div className="dash-hm-legend">
                <span>Az</span>
                <div className="dash-hm-legend-bar" style={{
                    background: color === '#6366f1'
                        ? 'linear-gradient(90deg, #f8fafc, #e0e7ff, #c7d2fe, #a5b4fc, #818cf8, #6366f1)'
                        : 'linear-gradient(90deg, #f8fafc, #dcfce7, #bbf7d0, #86efac, #4ade80, #22c55e)'
                }} />
                <span>Çok</span>
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

// ── KPI Stat Card ──
const KpiStat = ({ label, value, icon, color, trend }) => (
    <div className="dash-kpi-stat">
        <div className="dash-kpi-stat-icon" style={{ background: `${color}15`, color }}>
            {icon}
        </div>
        <div className="dash-kpi-stat-body">
            <span className="dash-kpi-stat-val">{value}</span>
            <span className="dash-kpi-stat-label">{label}</span>
        </div>
        {trend}
    </div>
);


// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════

const CeoReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [contactStats, setContactStats] = useState(null);
    const [peakHours, setPeakHours] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('30d');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [funnelFilter, setFunnelFilter] = useState('');
    const [funnels, setFunnels] = useState([]);

    useEffect(() => {
        if (!currentWorkspace?.id) return;
        funnelAPI.getAll(currentWorkspace.id).then(res => {
            setFunnels(res.data || []);
        }).catch(() => {});
    }, [currentWorkspace?.id]);

    const getDateRange = () => {
        const toDateStr = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const now = new Date();
        if (dateFilter === 'today') {
            return { startDate: toDateStr(now), endDate: toDateStr(now) };
        } else if (dateFilter === 'yesterday') {
            const y = new Date(now); y.setDate(now.getDate() - 1);
            return { startDate: toDateStr(y), endDate: toDateStr(y) };
        } else if (dateFilter === '7d') {
            const day = now.getDay();
            const diffToMonday = day === 0 ? 6 : day - 1;
            const monday = new Date(now); monday.setDate(monday.getDate() - diffToMonday);
            const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
            return { startDate: toDateStr(monday), endDate: toDateStr(sunday) };
        } else if (dateFilter === '30d') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { startDate: toDateStr(firstDay), endDate: toDateStr(lastDay) };
        } else if (dateFilter === '90d') {
            const start = new Date(now); start.setDate(now.getDate() - 90);
            return { startDate: toDateStr(start), endDate: toDateStr(now) };
        } else if (dateFilter === 'custom' && startDate) {
            return { startDate, endDate };
        } else {
            return {};
        }
    };

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const dateParams = getDateRange();
            const params = { ...dateParams, comparePrevious: true };
            if (funnelFilter) params.funnelId = funnelFilter;

            const [analyticsRes, performanceRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, params),
                contactAPI.getAgentPerformance(currentWorkspace.id, params)
            ]);
            setAnalytics(analyticsRes.data);
            setAgentPerformance(performanceRes.data);

            // Daily stats + peak hours (non-blocking)
            try {
                const [statsRes, peakRes] = await Promise.all([
                    contactAPI.getDailyStats(currentWorkspace.id, dateParams),
                    contactAPI.getPeakHours(currentWorkspace.id, dateParams)
                ]);
                setContactStats(statsRes.data);
                setPeakHours(peakRes.data);
            } catch (e) { console.warn('Secondary stats failed:', e.message); }
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
    const topAgents = [...agents].sort((a, b) => (b.dealOrders || 0) - (a.dealOrders || 0)).slice(0, 3);
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

    // Daily trend data
    const dailyStats = contactStats?.dailyStats || [];
    const dailyChartData = dailyStats.map(d => ({
        label: d.date ? d.date.slice(5) : '', // MM-DD
        value: d.total || 0
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

    return (
        <div className="ceo-report">
            {/* ═══════ SINGLE-ROW HEADER ═══════ */}
            <div className="dash-topbar">
                <h1 className="dash-topbar-title">Dashboard</h1>
                <div className="dash-topbar-pills">
                    {[
                        { key: 'today', label: 'Bugün' },
                        { key: 'yesterday', label: 'Dün' },
                        { key: '7d', label: 'Bu Hafta' },
                        { key: '30d', label: 'Bu Ay' },
                        { key: 'custom', label: '📅 Özel' },
                    ].map(item => (
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
            </div>

            {/* ═══════ KPI SUMMARY ROW ═══════ */}
            <div className="dash-kpi-row">
                <KpiStat label="Başvuru" value={formatNumber(analytics?.totalContacts || 0)} icon={<Users size={18} />} color="#6366f1"
                    trend={<TrendBadge current={analytics?.totalContacts || 0} previous={prev.totalContacts} />} />
                <KpiStat label="Mesaj" value={formatNumber(analytics?.totalMessages || 0)} icon={<MessageSquare size={18} />} color="#3b82f6" />
                <KpiStat label="Arama" value={formatNumber(ct.totalCalled || 0)} icon={<Phone size={18} />} color="#16a34a"
                    trend={<TrendBadge current={ct.totalCalled || 0} previous={prev.totalCalled} />} />
                <KpiStat label="Sipariş" value={formatNumber(ds.totalOrders || 0)} icon={<ShoppingCart size={18} />} color="#f59e0b" />
                <KpiStat label="Ciro" value={formatCurrency(totalSales)} icon={<DollarSign size={18} />} color="#059669"
                    trend={<TrendBadge current={totalSales} previous={prev.orderAmount} />} />
                <KpiStat label="Çözüm" value={`${analytics?.resolutionRate || 0}%`} icon={<CheckCircle2 size={18} />} color="#8b5cf6" />
            </div>

            {/* ═══════ ANALYTICS GRID ═══════ */}
            <div className="dash-analytics-grid">

                {/* ──── Günlük Başvuru Trendi (wide) ──── */}
                <div className="dash-panel dash-panel-wide" onClick={() => navigate('/ceo-report/general')}>
                    <div className="dash-panel-header">
                        <h3><TrendingUp size={16} /> Günlük Başvuru Trendi</h3>
                        <span className="dash-panel-link">Detaylı Rapor <ArrowRight size={12} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <AreaChart data={dailyChartData} color="#6366f1" height={140} />
                    </div>
                </div>

                {/* ──── Kanal Dağılımı ──── */}
                <div className="dash-panel" onClick={() => navigate('/ceo-report/general')}>
                    <div className="dash-panel-header">
                        <h3><PieChart size={16} /> Kanal Dağılımı</h3>
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

                {/* ──── Isı Haritası (wide) ──── */}
                <div className="dash-panel dash-panel-wide">
                    <div className="dash-panel-header">
                        <h3><Activity size={16} /> Başvuru Yoğunluğu — Isı Haritası</h3>
                        <span className="dash-panel-subtitle">Günlere ve saatlere göre başvuru yoğunluğu</span>
                    </div>
                    <div className="dash-panel-body">
                        <Heatmap data={peakHours?.heatmap} />
                    </div>
                </div>

                {/* ──── Takım & Temsilci ──── */}
                <div className="dash-panel" onClick={() => navigate('/ceo-report/team')}>
                    <div className="dash-panel-header">
                        <h3><UserCheck size={16} /> Takım & Temsilci</h3>
                        <span className="dash-panel-link">Detaylı <ArrowRight size={12} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <div className="dash-panel-kpis-mini">
                            <div><strong>{agents.length}</strong><span>Ajan</span></div>
                            <div><strong>{agentPerformance?.teamTotals?.avgResolutionRate || 0}%</strong><span>Çözüm</span></div>
                            <div><strong>{agentPerformance?.teamTotals?.avgResponseTime || 0}dk</strong><span>Yanıt</span></div>
                        </div>
                        {topAgents.length > 0 && (
                            <div className="dash-league" style={{ marginTop: 10 }}>
                                {topAgents.map((a, i) => (
                                    <LeagueRow key={a.id || i} rank={i + 1} name={a.name || 'Bilinmeyen'} value={a.dealOrders || 0} valueLabel="sipariş" highlight={i === 0} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ──── Akış Raporu ──── */}
                <div className="dash-panel" onClick={() => navigate('/ceo-report/funnel')}>
                    <div className="dash-panel-header">
                        <h3><Activity size={16} /> Akış Raporu</h3>
                        <span className="dash-panel-link">Detaylı <ArrowRight size={12} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <div className="dash-panel-kpis-mini">
                            <div><strong>{funnelSummary.length}</strong><span>Akış</span></div>
                            <div><strong>{formatNumber(funnelSummary.reduce((s, f) => s + (f.count || 0), 0))}</strong><span>Kişi</span></div>
                            <div><strong>{analytics?.conversionRate || 0}%</strong><span>Dönüşüm</span></div>
                        </div>
                        {topFunnels.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                                <HorizontalBar
                                    items={topFunnels.map((f, i) => ({
                                        label: f.name || 'Akış',
                                        value: f.count || 0,
                                        color: ['#a855f7', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6'][i] || '#a855f7'
                                    }))}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* ──── Aktivite & Arama ──── */}
                <div className="dash-panel" onClick={() => navigate('/ceo-report/activities')}>
                    <div className="dash-panel-header">
                        <h3><Phone size={16} /> Aktivite & Arama</h3>
                        <span className="dash-panel-link">Detaylı <ArrowRight size={12} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <div className="dash-activity-grid">
                            <DonutMini value={kaciArandi} total={numarali} color="#16a34a" label="Arama Oranı" size={80} />
                            <div className="dash-activity-stats">
                                <div className="dash-act-row">
                                    <Phone size={14} style={{ color: '#16a34a' }} />
                                    <span>Aranan</span>
                                    <strong>{formatNumber(kaciArandi)}</strong>
                                </div>
                                <div className="dash-act-row">
                                    <PhoneOff size={14} style={{ color: '#ef4444' }} />
                                    <span>Aranmayan</span>
                                    <strong style={{ color: aranmayan > 0 ? '#ef4444' : undefined }}>{formatNumber(aranmayan)}</strong>
                                </div>
                                <div className="dash-act-row">
                                    <Handshake size={14} style={{ color: '#6366f1' }} />
                                    <span>Görüşme</span>
                                    <strong>{as2.meetingCount || 0}</strong>
                                </div>
                                <div className="dash-act-row">
                                    <Calendar size={14} style={{ color: '#8b5cf6' }} />
                                    <span>Randevu</span>
                                    <strong>{appt.total || 0}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ──── AI Arama ──── */}
                <div className="dash-panel" onClick={() => navigate('/ceo-report/ai-calls')}>
                    <div className="dash-panel-header">
                        <h3><Bot size={16} /> AI Arama Analizi</h3>
                        <span className="dash-panel-link">{totalAICalls > 0 ? 'Detaylı' : 'Keşfet'} <ArrowRight size={12} /></span>
                    </div>
                    <div className="dash-panel-body">
                        {totalAICalls > 0 ? (
                            <>
                                <div className="dash-panel-kpis-mini">
                                    <div><strong>{formatNumber(totalAICalls)}</strong><span>AI Arama</span></div>
                                    <div><strong>{formatNumber(appt.byBot || 0)}</strong><span>Bot Randevu</span></div>
                                </div>
                                <div className="dash-ai-bar-group" style={{ marginTop: 12 }}>
                                    <div className="dash-ai-bar-item">
                                        <span className="dash-ai-bar-label"><Bot size={13} /> AI</span>
                                        <div className="dash-ai-bar-track">
                                            <div className="dash-ai-bar-fill" style={{
                                                width: `${Math.max((totalAICalls / (kaciArandi + totalAICalls || 1)) * 100, 5)}%`,
                                                background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)'
                                            }} />
                                        </div>
                                        <span className="dash-ai-bar-count">{formatNumber(totalAICalls)}</span>
                                    </div>
                                    <div className="dash-ai-bar-item">
                                        <span className="dash-ai-bar-label"><UserCheck size={13} /> Manuel</span>
                                        <div className="dash-ai-bar-track">
                                            <div className="dash-ai-bar-fill" style={{
                                                width: `${Math.max((kaciArandi / (kaciArandi + totalAICalls || 1)) * 100, 5)}%`,
                                                background: 'linear-gradient(90deg, #3b82f6, #60a5fa)'
                                            }} />
                                        </div>
                                        <span className="dash-ai-bar-count">{formatNumber(kaciArandi)}</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="dash-chart-empty" style={{ padding: '20px 0' }}>
                                <Sparkles size={20} style={{ color: '#8b5cf6' }} />
                                <span>AI Arama henüz aktif değil</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ──── Satış Raporu ──── */}
                <div className="dash-panel" onClick={() => navigate('/ceo-report/sales')}>
                    <div className="dash-panel-header">
                        <h3><DollarSign size={16} /> Satış Raporu</h3>
                        <span className="dash-panel-link">Detaylı <ArrowRight size={12} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <div className="dash-sales-metrics">
                            <DonutMini value={ds.wonCount || 0} total={(ds.totalOrders || 0) + (ds.totalQuotes || 0)} color="#059669" label="Dönüşüm" size={80} />
                            <div className="dash-sales-info">
                                <div className="dash-act-row">
                                    <FileText size={14} style={{ color: '#f59e0b' }} />
                                    <span>Teklif</span>
                                    <strong>{formatNumber(ds.totalQuotes || 0)}</strong>
                                </div>
                                <div className="dash-act-row">
                                    <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                                    <span>Kazanılan</span>
                                    <strong>{ds.wonCount || 0}</strong>
                                </div>
                                <div className="dash-act-row">
                                    <AlertTriangle size={14} style={{ color: '#ef4444' }} />
                                    <span>Kaybedilen</span>
                                    <strong>{ds.lostCount || 0}</strong>
                                </div>
                                <div className="dash-act-row">
                                    <DollarSign size={14} style={{ color: '#059669' }} />
                                    <span>Ciro</span>
                                    <strong style={{ color: '#059669' }}>{formatCurrency(totalSales)}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ──── Gelen Talep ──── */}
                <div className="dash-panel" onClick={() => navigate('/ceo-report/requests')}>
                    <div className="dash-panel-header">
                        <h3><Target size={16} /> Gelen Talep Analizi</h3>
                        <span className="dash-panel-link">Detaylı <ArrowRight size={12} /></span>
                    </div>
                    <div className="dash-panel-body">
                        <div className="dash-panel-kpis-mini">
                            <div><strong>{formatNumber(analytics?.requestAnalysis?.totalRequests || 0)}</strong><span>Talep</span></div>
                            <div><strong>{formatNumber(analytics?.requestAnalysis?.withPhoneCount || 0)}</strong><span>Numaralı</span></div>
                            <div><strong>{formatNumber(analytics?.requestAnalysis?.relevantCount || 0)}</strong><span>İlgili</span></div>
                        </div>
                        {(() => {
                            const topics = analytics?.requestAnalysis?.topics || [];
                            const sorted = [...topics].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 4);
                            return sorted.length > 0 ? (
                                <div style={{ marginTop: 10 }}>
                                    <HorizontalBar items={sorted.map((t, i) => ({
                                        label: t.topic?.length > 25 ? t.topic.slice(0, 25) + '…' : t.topic,
                                        value: t.count,
                                        color: ['#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8'][i] || '#ec4899'
                                    }))} />
                                </div>
                            ) : <div className="dash-chart-empty">Talep verisi yok</div>;
                        })()}
                    </div>
                </div>

                {/* ──── Aylık Trend ──── */}
                {monthlyData.length > 0 && (
                    <div className="dash-panel">
                        <div className="dash-panel-header">
                            <h3><BarChart3 size={16} /> Aylık Başvuru Trendi</h3>
                        </div>
                        <div className="dash-panel-body">
                            <AreaChart
                                data={monthlyData.map(m => ({ label: m.month, value: m.count }))}
                                color="#8b5cf6" height={130}
                            />
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default CeoReport;
