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

// ── Inline Mini Chart Components ──

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

const DonutMini = ({ value, total, color = '#6366f1', label }) => {
    const pct = total > 0 ? (value / total) * 100 : 0;
    const r = 28;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    return (
        <div className="dash-donut-wrap">
            <svg width="68" height="68" viewBox="0 0 68 68">
                <circle cx="34" cy="34" r={r} fill="none" stroke="#f1f5f9" strokeWidth="7" />
                <circle
                    cx="34" cy="34" r={r} fill="none"
                    stroke={color} strokeWidth="7"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round"
                    transform="rotate(-90 34 34)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
                <text x="34" y="36" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0f172a">
                    {pct.toFixed(0)}%
                </text>
            </svg>
            {label && <span className="dash-donut-label">{label}</span>}
        </div>
    );
};

const LeagueRow = ({ rank, name, value, valueLabel, highlight }) => (
    <div className={`dash-league-row${highlight ? ' dash-league-top' : ''}`}>
        <span className="dash-league-rank">{rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}</span>
        <span className="dash-league-name">{name}</span>
        <span className="dash-league-value">{value}</span>
        {valueLabel && <span className="dash-league-vlabel">{valueLabel}</span>}
    </div>
);

const CeoReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [contactStats, setContactStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [funnelFilter, setFunnelFilter] = useState('');
    const [funnels, setFunnels] = useState([]);

    // Fetch funnels list
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
            const y = new Date(now);
            y.setDate(now.getDate() - 1);
            return { startDate: toDateStr(y), endDate: toDateStr(y) };
        } else if (dateFilter === '7d') {
            const day = now.getDay();
            const diffToMonday = day === 0 ? 6 : day - 1;
            const monday = new Date(now);
            monday.setDate(monday.getDate() - diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);
            return { startDate: toDateStr(monday), endDate: toDateStr(sunday) };
        } else if (dateFilter === '30d') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { startDate: toDateStr(firstDay), endDate: toDateStr(lastDay) };
        } else if (dateFilter === '90d') {
            const start = new Date(now);
            start.setDate(now.getDate() - 90);
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

            try {
                const statsRes = await contactAPI.getDailyStats(currentWorkspace.id, dateParams);
                setContactStats(statsRes.data);
            } catch (e) { console.warn('Contact daily stats failed:', e.message); }
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

    const ds = analytics?.dealStats || {};
    const as = analytics?.activityStats || {};
    const ct = analytics?.callTrackingStats || {};
    const appt = analytics?.appointmentStats || {};
    const meet = analytics?.meetingStats || {};
    const prev = analytics?.previousPeriod || {};
    const totalSales = (ds.orderAmount || 0);

    // Trend calculation helper
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

    // Data derivatives
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

    const channelIcon = (ch) => {
        if (ch === 'WHATSAPP') return '💬';
        if (ch === 'INSTAGRAM') return '📸';
        if (ch === 'FACEBOOK') return '👤';
        if (ch === 'EMAIL') return '✉️';
        if (ch === 'PHONE') return '📞';
        if (ch === 'WIDGET') return '🌐';
        if (ch === 'LEAD') return '🎯';
        return '📋';
    };

    const channelLabel = (ch) => {
        if (ch === 'WHATSAPP') return 'WhatsApp';
        if (ch === 'INSTAGRAM') return 'Instagram';
        if (ch === 'FACEBOOK') return 'Facebook';
        if (ch === 'EMAIL') return 'E-posta';
        if (ch === 'PHONE') return 'Telefon';
        if (ch === 'WIDGET') return 'Web Widget';
        if (ch === 'LEAD') return 'Lead Form';
        return ch;
    };

    const channelColor = (ch) => {
        if (ch === 'WHATSAPP') return '#25d366';
        if (ch === 'INSTAGRAM') return '#e1306c';
        if (ch === 'FACEBOOK') return '#1877f2';
        if (ch === 'EMAIL') return '#ea580c';
        if (ch === 'PHONE') return '#16a34a';
        if (ch === 'WIDGET') return '#6366f1';
        if (ch === 'LEAD') return '#ec4899';
        return '#94a3b8';
    };

    return (
        <div className="ceo-report">
            {/* Header */}
            <div className="ceo-header">
                <div className="ceo-header-title">
                    <h1>Dashboard</h1>
                    <p>Satış, aktivite ve ekip performansının anlık özeti</p>
                </div>
                <div className="ceo-header-actions">
                    <button className="ceo-refresh-btn" onClick={fetchData}>
                        <RefreshCw size={14} /> Güncelle
                    </button>
                </div>
            </div>

            {/* FİLTRE BARI */}
            <div className="ceo-filter-bar">
                <div className="ceo-filter-left">
                    <div className="ceo-filter-label">
                        <Filter size={14} />
                        <span>Filtreler</span>
                    </div>
                    <div className="ceo-pill-group">
                        {[
                            { key: 'all', label: 'Tümü' },
                            { key: 'today', label: 'Bugün' },
                            { key: 'yesterday', label: 'Dün' },
                            { key: '7d', label: 'Bu Hafta' },
                            { key: '30d', label: 'Bu Ay' },
                            { key: 'custom', label: '📅 Özel' },
                        ].map(item => (
                            <button
                                key={item.key}
                                className={`ceo-pill${dateFilter === item.key ? ' active' : ''}`}
                                onClick={() => setDateFilter(item.key)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    {dateFilter === 'custom' && (
                        <div className="ceo-custom-dates">
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="ceo-date-input" />
                            <span style={{ color: '#9ca3af' }}>—</span>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="ceo-date-input" />
                        </div>
                    )}
                </div>
                {funnels.length > 0 && (
                    <div className="ceo-filter-right">
                        <select
                            value={funnelFilter}
                            onChange={(e) => setFunnelFilter(e.target.value)}
                            className="ceo-funnel-select"
                        >
                            <option value="">Tüm Akışlar</option>
                            {funnels.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* DASHBOARD KARTLARI — Dikey, tam genişlik */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="dash-cards-stack">

                {/* ──────── 1. GENEL BAKIŞ ──────── */}
                <div className="dash-card" onClick={() => navigate('/ceo-report/general')}>
                    <div className="dash-card-left">
                        <div className="dash-card-header">
                            <div className="dash-card-icon" style={{ background: '#eef2ff', color: '#6366f1' }}>
                                <BarChart3 size={20} />
                            </div>
                            <h3>Genel Bakış</h3>
                        </div>
                        <div className="dash-card-kpis">
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(analytics?.totalContacts || 0)}</span>
                                <span className="dash-kpi-label">Başvuru</span>
                                <TrendBadge current={analytics?.totalContacts || 0} previous={prev.totalContacts} />
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(analytics?.totalMessages || 0)}</span>
                                <span className="dash-kpi-label">Mesaj</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(ct.totalCalled || 0)}</span>
                                <span className="dash-kpi-label">Arama</span>
                                <TrendBadge current={ct.totalCalled || 0} previous={prev.totalCalled} />
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{analytics?.resolutionRate || 0}%</span>
                                <span className="dash-kpi-label">Çözüm Oranı</span>
                            </div>
                        </div>
                        <div className="dash-card-footer">
                            <span>Detaylı Rapor</span>
                            <ArrowRight size={14} />
                        </div>
                    </div>
                    <div className="dash-card-right">
                        <span className="dash-chart-title">Kanal Dağılımı</span>
                        {sortedChannels.length > 0 ? (
                            <HorizontalBar
                                items={sortedChannels.slice(0, 5).map(ch => ({
                                    label: `${channelIcon(ch.channel)} ${channelLabel(ch.channel)}`,
                                    value: ch.count,
                                    color: channelColor(ch.channel)
                                }))}
                            />
                        ) : (
                            <div className="dash-chart-empty">Veri yok</div>
                        )}
                    </div>
                </div>

                {/* ──────── 2. TAKIM & TEMSİLCİ ──────── */}
                <div className="dash-card" onClick={() => navigate('/ceo-report/team')}>
                    <div className="dash-card-left">
                        <div className="dash-card-header">
                            <div className="dash-card-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                                <UserCheck size={20} />
                            </div>
                            <h3>Takım & Temsilci</h3>
                        </div>
                        <div className="dash-card-kpis">
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{agents.length}</span>
                                <span className="dash-kpi-label">Ajan</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{agentPerformance?.teamTotals?.avgResolutionRate || 0}%</span>
                                <span className="dash-kpi-label">Çözüm</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{agentPerformance?.teamTotals?.avgResponseTime || 0}dk</span>
                                <span className="dash-kpi-label">Ort. Yanıt</span>
                            </div>
                        </div>
                        <div className="dash-card-footer">
                            <span>Detaylı Rapor</span>
                            <ArrowRight size={14} />
                        </div>
                    </div>
                    <div className="dash-card-right">
                        <span className="dash-chart-title">En İyi Temsilciler</span>
                        {topAgents.length > 0 ? (
                            <div className="dash-league">
                                {topAgents.map((a, i) => (
                                    <LeagueRow
                                        key={a.id || i}
                                        rank={i + 1}
                                        name={a.name || 'Bilinmeyen'}
                                        value={a.dealOrders || 0}
                                        valueLabel="sipariş"
                                        highlight={i === 0}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="dash-chart-empty">Temsilci verisi yok</div>
                        )}
                    </div>
                </div>

                {/* ──────── 3. AKIŞ RAPORU ──────── */}
                <div className="dash-card" onClick={() => navigate('/ceo-report/funnel')}>
                    <div className="dash-card-left">
                        <div className="dash-card-header">
                            <div className="dash-card-icon" style={{ background: '#fdf4ff', color: '#a855f7' }}>
                                <Activity size={20} />
                            </div>
                            <h3>Akış Raporu</h3>
                        </div>
                        <div className="dash-card-kpis">
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{funnelSummary.length}</span>
                                <span className="dash-kpi-label">Akış</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(funnelSummary.reduce((s, f) => s + (f.count || 0), 0))}</span>
                                <span className="dash-kpi-label">Toplam Kişi</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{analytics?.conversionRate || 0}%</span>
                                <span className="dash-kpi-label">Dönüşüm</span>
                            </div>
                        </div>
                        <div className="dash-card-footer">
                            <span>Detaylı Rapor</span>
                            <ArrowRight size={14} />
                        </div>
                    </div>
                    <div className="dash-card-right">
                        <span className="dash-chart-title">Akış Dağılımı</span>
                        {topFunnels.length > 0 ? (
                            <HorizontalBar
                                items={topFunnels.map((f, i) => ({
                                    label: f.name || 'Akış',
                                    value: f.count || 0,
                                    color: ['#a855f7', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6'][i] || '#a855f7'
                                }))}
                            />
                        ) : (
                            <div className="dash-chart-empty">Akış verisi yok</div>
                        )}
                    </div>
                </div>

                {/* ──────── 4. AKTİVİTE & ARAMA ──────── */}
                <div className="dash-card" onClick={() => navigate('/ceo-report/activities')}>
                    <div className="dash-card-left">
                        <div className="dash-card-header">
                            <div className="dash-card-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                                <Phone size={20} />
                            </div>
                            <h3>Aktivite & Arama</h3>
                        </div>
                        <div className="dash-card-kpis">
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(kaciArandi)}</span>
                                <span className="dash-kpi-label">Aranan</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val" style={{ color: aranmayan > 0 ? '#ef4444' : undefined }}>{formatNumber(aranmayan)}</span>
                                <span className="dash-kpi-label">Aranmayan</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">%{aramaOrani}</span>
                                <span className="dash-kpi-label">Arama Oranı</span>
                            </div>
                        </div>
                        <div className="dash-card-footer">
                            <span>Detaylı Rapor</span>
                            <ArrowRight size={14} />
                        </div>
                    </div>
                    <div className="dash-card-right">
                        <span className="dash-chart-title">Aktivite Özeti</span>
                        <div className="dash-activity-grid">
                            <div className="dash-activity-item">
                                <DonutMini value={kaciArandi} total={numarali} color="#16a34a" label="Arama" />
                            </div>
                            <div className="dash-activity-stats">
                                <div className="dash-act-row">
                                    <Handshake size={14} style={{ color: '#6366f1' }} />
                                    <span>Görüşme</span>
                                    <strong>{as.meetingCount || 0}</strong>
                                </div>
                                <div className="dash-act-row">
                                    <Calendar size={14} style={{ color: '#8b5cf6' }} />
                                    <span>Randevu</span>
                                    <strong>{appt.total || 0}</strong>
                                </div>
                                <div className="dash-act-row">
                                    <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                                    <span>Tamamlanan</span>
                                    <strong>{appt.completed || 0}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ──────── 5. AI ARAMA ANALİZİ ──────── */}
                <div className="dash-card" onClick={() => navigate('/ceo-report/ai-calls')}>
                    <div className="dash-card-left">
                        <div className="dash-card-header">
                            <div className="dash-card-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                                <Bot size={20} />
                            </div>
                            <h3>AI Arama Analizi</h3>
                        </div>
                        {totalAICalls > 0 ? (
                            <div className="dash-card-kpis">
                                <div className="dash-kpi">
                                    <span className="dash-kpi-val">{formatNumber(totalAICalls)}</span>
                                    <span className="dash-kpi-label">AI Arama</span>
                                </div>
                                <div className="dash-kpi">
                                    <span className="dash-kpi-val">{formatNumber(appt.byBot || 0)}</span>
                                    <span className="dash-kpi-label">Bot Randevu</span>
                                </div>
                            </div>
                        ) : (
                            <div className="dash-ai-empty">
                                <Sparkles size={18} style={{ color: '#8b5cf6' }} />
                                <span>AI Arama henüz aktif değil</span>
                            </div>
                        )}
                        <div className="dash-card-footer">
                            <span>{totalAICalls > 0 ? 'Detaylı Rapor' : 'Keşfet'}</span>
                            <ArrowRight size={14} />
                        </div>
                    </div>
                    <div className="dash-card-right">
                        <span className="dash-chart-title">AI vs Manuel</span>
                        {totalAICalls > 0 ? (
                            <div className="dash-ai-comparison">
                                <div className="dash-ai-bar-group">
                                    <div className="dash-ai-bar-item">
                                        <span className="dash-ai-bar-label"><Bot size={13} /> AI</span>
                                        <div className="dash-ai-bar-track">
                                            <div className="dash-ai-bar-fill" style={{
                                                width: `${kaciArandi > 0 ? Math.max((totalAICalls / (kaciArandi + totalAICalls)) * 100, 5) : 50}%`,
                                                background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)'
                                            }} />
                                        </div>
                                        <span className="dash-ai-bar-count">{formatNumber(totalAICalls)}</span>
                                    </div>
                                    <div className="dash-ai-bar-item">
                                        <span className="dash-ai-bar-label"><UserCheck size={13} /> Manuel</span>
                                        <div className="dash-ai-bar-track">
                                            <div className="dash-ai-bar-fill" style={{
                                                width: `${kaciArandi > 0 ? Math.max((kaciArandi / (kaciArandi + totalAICalls)) * 100, 5) : 50}%`,
                                                background: 'linear-gradient(90deg, #3b82f6, #60a5fa)'
                                            }} />
                                        </div>
                                        <span className="dash-ai-bar-count">{formatNumber(kaciArandi)}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="dash-chart-empty">
                                <Sparkles size={16} style={{ color: '#c4b5fd' }} />
                                <span>AI aramayı aktifleştirin</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ──────── 6. SATIŞ RAPORU ──────── */}
                <div className="dash-card" onClick={() => navigate('/ceo-report/sales')}>
                    <div className="dash-card-left">
                        <div className="dash-card-header">
                            <div className="dash-card-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                                <DollarSign size={20} />
                            </div>
                            <h3>Satış Raporu</h3>
                        </div>
                        <div className="dash-card-kpis">
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(ds.totalQuotes || 0)}</span>
                                <span className="dash-kpi-label">Teklif</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(ds.totalOrders || 0)}</span>
                                <span className="dash-kpi-label">Sipariş</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val dash-kpi-highlight">{formatCurrency(totalSales)}</span>
                                <span className="dash-kpi-label">Ciro</span>
                                <TrendBadge current={totalSales} previous={prev.orderAmount} />
                            </div>
                        </div>
                        <div className="dash-card-footer">
                            <span>Detaylı Rapor</span>
                            <ArrowRight size={14} />
                        </div>
                    </div>
                    <div className="dash-card-right">
                        <span className="dash-chart-title">Satış Metrikleri</span>
                        <div className="dash-sales-metrics">
                            <div className="dash-sales-metric">
                                <DonutMini
                                    value={ds.wonCount || 0}
                                    total={(ds.totalOrders || 0) + (ds.totalQuotes || 0)}
                                    color="#059669"
                                    label="Dönüşüm"
                                />
                            </div>
                            <div className="dash-sales-info">
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
                                    <Clock size={14} style={{ color: '#f59e0b' }} />
                                    <span>Bekleyen</span>
                                    <strong>{(ds.totalQuotes || 0) - (ds.wonCount || 0) - (ds.lostCount || 0)}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ──────── 7. GELEN TALEP ANALİZİ ──────── */}
                <div className="dash-card" onClick={() => navigate('/ceo-report/requests')}>
                    <div className="dash-card-left">
                        <div className="dash-card-header">
                            <div className="dash-card-icon" style={{ background: '#fdf2f8', color: '#ec4899' }}>
                                <Target size={20} />
                            </div>
                            <h3>Gelen Talep Analizi</h3>
                        </div>
                        <div className="dash-card-kpis">
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(analytics?.requestAnalysis?.totalRequests || 0)}</span>
                                <span className="dash-kpi-label">Talep</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(analytics?.requestAnalysis?.withPhoneCount || 0)}</span>
                                <span className="dash-kpi-label">Numaralı</span>
                            </div>
                            <div className="dash-kpi">
                                <span className="dash-kpi-val">{formatNumber(analytics?.requestAnalysis?.relevantCount || 0)}</span>
                                <span className="dash-kpi-label">İlgili</span>
                            </div>
                        </div>
                        <div className="dash-card-footer">
                            <span>Detaylı Rapor</span>
                            <ArrowRight size={14} />
                        </div>
                    </div>
                    <div className="dash-card-right">
                        <span className="dash-chart-title">En Çok Talep Edilen</span>
                        {(() => {
                            const topics = analytics?.requestAnalysis?.topics || [];
                            const sorted = [...topics].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 4);
                            return sorted.length > 0 ? (
                                <HorizontalBar
                                    items={sorted.map((t, i) => ({
                                        label: t.topic?.length > 30 ? t.topic.slice(0, 30) + '…' : t.topic,
                                        value: t.count,
                                        color: ['#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8'][i] || '#ec4899'
                                    }))}
                                />
                            ) : (
                                <div className="dash-chart-empty">Talep verisi yok</div>
                            );
                        })()}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CeoReport;
