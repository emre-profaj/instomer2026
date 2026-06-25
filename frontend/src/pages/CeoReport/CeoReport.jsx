import React, { useState, useEffect } from 'react';
import {
    Users, MessageSquare, Phone, PhoneOff, Calendar, Activity,
    TrendingUp, DollarSign, UserCheck, Clock, RefreshCw,
    ClipboardList, Briefcase, Headphones, Truck, Building2,
    CheckCircle2, AlertTriangle, ListChecks, Handshake,
    Instagram, Facebook, Mail, Globe, MessageCircle,
    ChevronDown, ChevronRight, PhoneCall, FileText, ShoppingCart,
    Search, BarChart3, Target, Filter, ArrowRight, Bot, Sparkles,
    ArrowUpRight, ArrowDownRight
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

    // Summary card component
    const SummaryCard = ({ icon, iconBg, iconColor, title, children, route, gradient }) => (
        <div
            className="ceo-summary-report-card"
            style={{ background: gradient || '#fff' }}
            onClick={() => navigate(route)}
        >
            <div className="ceo-src-header">
                <div className="ceo-src-icon" style={{ background: iconBg, color: iconColor }}>
                    {icon}
                </div>
                <h3 className="ceo-src-title">{title}</h3>
                <div className="ceo-src-arrow">
                    <ArrowRight size={16} />
                </div>
            </div>
            <div className="ceo-src-body">
                {children}
            </div>
            <div className="ceo-src-footer">
                <span>Detaylı Rapor</span>
                <ArrowRight size={14} />
            </div>
        </div>
    );

    // Top agent by orders
    const topAgent = [...(agentPerformance?.agents || [])].sort((a, b) => (b.dealOrders || 0) - (a.dealOrders || 0))[0];
    // Top funnel
    const topFunnel = [...(analytics?.funnelSummary || [])].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
    // Call stats
    const numarali = contactStats?.totals?.withPhone || ct.totalWithPhone || 0;
    const kaciArandi = ct.totalCalled || 0;
    const aranmayan = Math.max(0, numarali - kaciArandi);
    const aramaOrani = numarali > 0 ? ((kaciArandi / numarali) * 100).toFixed(0) : 0;
    // Channel distribution
    const channels = analytics?.channelData || [];
    const topChannel = [...channels].sort((a, b) => (b.count || 0) - (a.count || 0))[0];

    return (
        <div className="ceo-report">
            {/* Header */}
            <div className="ceo-header">
                <div className="ceo-header-title">
                    <h1>CEO Dashboard</h1>
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
            {/* ÖZET KARTLAR */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="ceo-report-cards-grid">

                {/* 1. GENEL BAKIŞ */}
                <SummaryCard
                    icon={<BarChart3 size={20} />}
                    iconBg="#eef2ff" iconColor="#6366f1"
                    title="Genel Bakış"
                    route="/ceo-report/general"
                >
                    <div className="ceo-src-metrics">
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber(analytics?.totalContacts || 0)}</span>
                            <span className="ceo-src-metric-label">Başvuru</span>
                            <TrendBadge current={analytics?.totalContacts || 0} previous={prev.totalContacts} />
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber(analytics?.totalMessages || 0)}</span>
                            <span className="ceo-src-metric-label">Mesaj</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber(ct.totalCalled || 0)}</span>
                            <span className="ceo-src-metric-label">Arama</span>
                        </div>
                    </div>
                    {topChannel && (
                        <div className="ceo-src-info">
                            Kanal: <strong>{topChannel.channel === 'WHATSAPP' ? 'WhatsApp' : topChannel.channel === 'INSTAGRAM' ? 'Instagram' : topChannel.channel}</strong> en yoğun ({topChannel.count})
                        </div>
                    )}
                </SummaryCard>

                {/* 2. TAKIM PERFORMANSI */}
                <SummaryCard
                    icon={<UserCheck size={20} />}
                    iconBg="#eff6ff" iconColor="#3b82f6"
                    title="Takım & Temsilci"
                    route="/ceo-report/team"
                >
                    <div className="ceo-src-metrics">
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{(agentPerformance?.agents || []).length}</span>
                            <span className="ceo-src-metric-label">Ajan</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{agentPerformance?.teamTotals?.avgResolutionRate || 0}%</span>
                            <span className="ceo-src-metric-label">Çözüm</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{agentPerformance?.teamTotals?.avgResponseTime || 0}dk</span>
                            <span className="ceo-src-metric-label">Yanıt</span>
                        </div>
                    </div>
                    {topAgent && (
                        <div className="ceo-src-info">
                            🏆 <strong>{topAgent.name}</strong> — {topAgent.dealOrders || 0} sipariş
                        </div>
                    )}
                </SummaryCard>

                {/* 3. AKIŞ RAPORU */}
                <SummaryCard
                    icon={<Activity size={20} />}
                    iconBg="#fdf4ff" iconColor="#a855f7"
                    title="Akış Raporu"
                    route="/ceo-report/funnel"
                >
                    <div className="ceo-src-metrics">
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{(analytics?.funnelSummary || []).length}</span>
                            <span className="ceo-src-metric-label">Akış</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber((analytics?.funnelSummary || []).reduce((s, f) => s + (f.count || 0), 0))}</span>
                            <span className="ceo-src-metric-label">Toplam Kişi</span>
                        </div>
                    </div>
                    {topFunnel && (
                        <div className="ceo-src-info">
                            En yoğun: <strong>{topFunnel.name}</strong> ({topFunnel.count} kişi)
                        </div>
                    )}
                </SummaryCard>

                {/* 4. AKTİVİTE & ARAMA */}
                <SummaryCard
                    icon={<Phone size={20} />}
                    iconBg="#ecfdf5" iconColor="#059669"
                    title="Aktivite & Arama"
                    route="/ceo-report/activities"
                >
                    <div className="ceo-src-metrics">
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber(kaciArandi)}</span>
                            <span className="ceo-src-metric-label">Aranan</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value" style={{ color: aranmayan > 0 ? '#ef4444' : undefined }}>{formatNumber(aranmayan)}</span>
                            <span className="ceo-src-metric-label">Aranmayan</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">%{aramaOrani}</span>
                            <span className="ceo-src-metric-label">Oran</span>
                        </div>
                    </div>
                    <div className="ceo-src-info">
                        Görüşme: <strong>{as.meetingCount || 0}</strong> | Randevu: <strong>{appt.total || 0}</strong>
                    </div>
                </SummaryCard>

                {/* 5. AI ARAMA ANALİZİ */}
                <SummaryCard
                    icon={<Bot size={20} />}
                    iconBg="#f5f3ff" iconColor="#8b5cf6"
                    title="AI Arama Analizi"
                    route="/ceo-report/ai-calls"
                >
                    {(() => {
                        // Check if there are AI calls (retell calls in agent performance)
                        const totalAICalls = (agentPerformance?.agents || []).reduce((s, a) => s + (a.retellCallCount || 0), 0);
                        if (totalAICalls > 0) {
                            return (
                                <>
                                    <div className="ceo-src-metrics">
                                        <div className="ceo-src-metric">
                                            <span className="ceo-src-metric-value">{formatNumber(totalAICalls)}</span>
                                            <span className="ceo-src-metric-label">AI Arama</span>
                                        </div>
                                    </div>
                                    <div className="ceo-src-info">
                                        <Sparkles size={12} style={{ marginRight: 4, color: '#8b5cf6' }} /> AI destekli arama aktif
                                    </div>
                                </>
                            );
                        }
                        return (
                            <div className="ceo-src-upgrade">
                                <Sparkles size={16} style={{ color: '#8b5cf6', marginBottom: 4 }} />
                                <span>AI Arama henüz aktif değil</span>
                                <span className="ceo-src-upgrade-cta">Keşfet →</span>
                            </div>
                        );
                    })()}
                </SummaryCard>

                {/* 6. SATIŞ RAPORU */}
                <SummaryCard
                    icon={<DollarSign size={20} />}
                    iconBg="#ecfdf5" iconColor="#059669"
                    title="Satış Raporu"
                    route="/ceo-report/sales"
                >
                    <div className="ceo-src-metrics">
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber(ds.totalQuotes || 0)}</span>
                            <span className="ceo-src-metric-label">Teklif</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber(ds.totalOrders || 0)}</span>
                            <span className="ceo-src-metric-label">Sipariş</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value" style={{ color: '#059669' }}>₺{formatNumber(totalSales)}</span>
                            <span className="ceo-src-metric-label">Ciro</span>
                            <TrendBadge current={totalSales} previous={prev.orderAmount} />
                        </div>
                    </div>
                    <div className="ceo-src-info">
                        Dönüşüm: <strong>{ds.totalOrders > 0 && ds.wonCount > 0 ? ((ds.wonCount / ds.totalOrders) * 100).toFixed(0) : 0}%</strong>
                    </div>
                </SummaryCard>

                {/* 7. GELEN TALEP ANALİZİ */}
                <SummaryCard
                    icon={<Target size={20} />}
                    iconBg="#fdf2f8" iconColor="#ec4899"
                    title="Gelen Talep Analizi"
                    route="/ceo-report/requests"
                >
                    <div className="ceo-src-metrics">
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber(analytics?.requestAnalysis?.totalRequests || 0)}</span>
                            <span className="ceo-src-metric-label">Talep</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber(analytics?.requestAnalysis?.withPhoneCount || 0)}</span>
                            <span className="ceo-src-metric-label">Numaralı</span>
                        </div>
                        <div className="ceo-src-metric">
                            <span className="ceo-src-metric-value">{formatNumber(analytics?.requestAnalysis?.relevantCount || 0)}</span>
                            <span className="ceo-src-metric-label">İlgili</span>
                        </div>
                    </div>
                    {(() => {
                        const topics = analytics?.requestAnalysis?.topics || [];
                        const topTopic = [...topics].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
                        return topTopic ? (
                            <div className="ceo-src-info">
                                En çok: <strong>{topTopic.topic}</strong> ({topTopic.count})
                            </div>
                        ) : null;
                    })()}
                </SummaryCard>
            </div>
        </div>
    );
};

export default CeoReport;
