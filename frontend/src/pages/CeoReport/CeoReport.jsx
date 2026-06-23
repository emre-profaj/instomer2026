import React, { useState, useEffect } from 'react';
import {
    Users, MessageSquare, Phone, PhoneOff, Calendar, Activity,
    TrendingUp, DollarSign, UserCheck, Clock, RefreshCw,
    ClipboardList, Briefcase, Headphones, Truck, Building2,
    CheckCircle2, AlertTriangle, ListChecks, Handshake,
    Instagram, Facebook, Mail, Globe, MessageCircle,
    ChevronDown, ChevronRight, PhoneCall, FileText, ShoppingCart,
    Search, BarChart3, Target, Filter
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI, funnelAPI, teamAPI } from '../../services/api';
import './CeoReport.css';

const formatNumber = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString('tr-TR');
};

const CeoReport = () => {
    const { currentWorkspace } = useAuth();
    const [analytics, setAnalytics] = useState(null);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [contactStats, setContactStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [expandedFlows, setExpandedFlows] = useState({});
    const [funnelFilter, setFunnelFilter] = useState('');
    const [funnels, setFunnels] = useState([]);
    const [teamFilter, setTeamFilter] = useState('');
    const [teams, setTeams] = useState([]);

    const TARGET_WORKSPACE = '2d4305d2-1c7f-4f11-88d1-78afd844be42';
    const showTeamFilter = currentWorkspace?.id === TARGET_WORKSPACE;

    // Fetch funnels list
    useEffect(() => {
        if (!currentWorkspace?.id) return;
        funnelAPI.getAll(currentWorkspace.id).then(res => {
            setFunnels(res.data || []);
        }).catch(() => {});
    }, [currentWorkspace?.id]);

    // Fetch teams list (only for target workspace)
    useEffect(() => {
        if (!currentWorkspace?.id || currentWorkspace.id !== TARGET_WORKSPACE) return;
        teamAPI.getWorkspaceTeams(currentWorkspace.id).then(res => {
            const teamList = res.data?.teams || res.data || [];
            setTeams(teamList);
        }).catch(() => {});
    }, [currentWorkspace?.id]);

    const getDateRange = () => {
        // Local timezone formatting — toISOString() UTC'ye çevirir ve Türkiye'de 1 gün kayar!
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
            // Bu Hafta: Pazartesi'den Pazar'a
            const day = now.getDay();
            const diffToMonday = day === 0 ? 6 : day - 1;
            const monday = new Date(now);
            monday.setDate(monday.getDate() - diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);
            return { startDate: toDateStr(monday), endDate: toDateStr(sunday) };
        } else if (dateFilter === '30d') {
            // Bu Ay: Takvim ayının 1'i - son günü
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
            const params = { ...dateParams };
            if (funnelFilter) params.funnelId = funnelFilter;
            if (teamFilter) params.teamId = teamFilter;
            const [analyticsRes, performanceRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, params),
                contactAPI.getAgentPerformance(currentWorkspace.id, params)
            ]);
            setAnalytics(analyticsRes.data);
            setAgentPerformance(performanceRes.data);

            try {
                const statsRes = await contactAPI.getDailyStats(currentWorkspace.id, params);
                setContactStats(statsRes.data);
            } catch (e) { console.warn('Contact daily stats failed:', e.message); }
        } catch (err) {
            console.error('Dashboard fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate, funnelFilter, teamFilter]);

    const getFlowIcon = (flowName) => {
        const name = flowName?.toLowerCase() || '';
        if (name.includes('randevu')) return <Calendar size={18} />;
        if (name.includes('kurumsal')) return <Building2 size={18} />;
        if (name.includes('satış') || name.includes('satis')) return <DollarSign size={18} />;
        if (name.includes('destek')) return <Headphones size={18} />;
        if (name.includes('iş') || name.includes('taseron') || name.includes('taşeron')) return <Briefcase size={18} />;
        if (name.includes('tedarik')) return <Truck size={18} />;
        return <ClipboardList size={18} />;
    };

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
    const totalSales = (ds.orderAmount || 0);

    // ── Topic aggregation for Gelen Talep Analizi ──
    // Backend artık AI ile benzer konuları birleştiriyor (mergedTopics alanı ile).
    // Eğer AI sınıflandırma yapılmışsa direkt kullan, yapılmamışsa basit similarity fallback
    const aggregateTopics = (topics, aiClassified) => {
        if (!topics?.length) return [];
        // Backend AI sınıflandırma yaptıysa, topicler zaten birleştirilmiş geliyor
        if (aiClassified) {
            return [...topics].sort((a, b) => b.count - a.count);
        }
        // Fallback: Basit similarity aggregation (AI yoksa)
        const normalize = (s) => s.toLowerCase().replace(/[^a-zçğıöşü0-9\s]/g, '').trim();
        const similarity = (a, b) => {
            const na = normalize(a), nb = normalize(b);
            if (na === nb) return 1;
            if (na.includes(nb) || nb.includes(na)) return 0.85;
            const wa = na.split(/\s+/), wb = nb.split(/\s+/);
            const common = wa.filter(w => wb.some(bw => bw === w || (w.length > 3 && bw.startsWith(w.slice(0, -1))) || (bw.length > 3 && w.startsWith(bw.slice(0, -1)))));
            return common.length / Math.max(wa.length, wb.length);
        };
        const groups = [];
        const used = new Set();
        const sorted = [...topics].sort((a, b) => b.count - a.count);
        for (let i = 0; i < sorted.length; i++) {
            if (used.has(i)) continue;
            const group = { ...sorted[i], mergedTopics: [sorted[i].topic] };
            used.add(i);
            for (let j = i + 1; j < sorted.length; j++) {
                if (used.has(j)) continue;
                if (similarity(sorted[i].topic, sorted[j].topic) >= 0.55) {
                    group.count += sorted[j].count;
                    group.withPhone += sorted[j].withPhone;
                    group.called += sorted[j].called;
                    group.relevant += sorted[j].relevant;
                    group.mergedTopics.push(sorted[j].topic);
                    used.add(j);
                }
            }
            groups.push(group);
        }
        return groups.sort((a, b) => b.count - a.count);
    };
    const aggregatedTopics = aggregateTopics(analytics?.requestAnalysis?.topics, analytics?.requestAnalysis?.aiClassified);

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

            {/* ═══════════════════════════════════════════════════════ */}
            {/* FİLTRE BARI */}
            {/* ═══════════════════════════════════════════════════════ */}
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
                <div className="ceo-filter-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {showTeamFilter && teams.length > 0 && (
                        <select
                            value={teamFilter}
                            onChange={(e) => setTeamFilter(e.target.value)}
                            className="ceo-funnel-select"
                        >
                            <option value="">Tüm Takımlar</option>
                            {teams.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.members?.length || t._count?.members || 0} kişi)
                                </option>
                            ))}
                        </select>
                    )}
                    {funnels.length > 0 && (
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
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* BÖLÜM 1: Toplam Kişi — Günlük Grafik */}
            {/* ═══════════════════════════════════════════════════════ */}
            {contactStats && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-body">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
                            <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Users size={20} color="#fff" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Toplam Kişi</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#312e81' }}>{contactStats.totals?.total || 0}</div>
                                </div>
                            </div>
                            <div style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Phone size={20} color="#fff" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefonlu</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#064e3b' }}>{contactStats.totals?.withPhone || 0}</div>
                                </div>
                            </div>
                            <div style={{ background: 'linear-gradient(135deg, #fef2f2, #fecaca)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <PhoneOff size={20} color="#fff" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefonsuz</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#991b1b' }}>{contactStats.totals?.withoutPhone || 0}</div>
                                </div>
                            </div>
                        </div>

                        {/* SVG Chart */}
                        <div style={{ position: 'relative' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <span>Günlük Gelen Kişi Sayısı</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 3, background: '#6366f1', borderRadius: 2, display: 'inline-block' }}></span><span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Toplam</span></span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 3, background: '#10b981', borderRadius: 2, display: 'inline-block' }}></span><span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Telefonlu</span></span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 3, background: '#ef4444', borderRadius: 2, display: 'inline-block' }}></span><span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Telefonsuz</span></span>
                            </div>
                            {(() => {
                                const stats = contactStats.dailyStats || [];
                                if (!stats.length) return <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Veri yok</p>;
                                const maxVal = Math.max(...stats.map(s => s.total), 1);
                                const w = 900, h = 180, padL = 40, padR = 10, padT = 10, padB = 30;
                                const chartW = w - padL - padR, chartH = h - padT - padB;
                                const stepX = chartW / Math.max(stats.length - 1, 1);
                                const makeLine = (key) => stats.map((s, i) => { const x = padL + i * stepX; const y = padT + chartH - (s[key] / maxVal) * chartH; return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
                                const makeArea = (key) => { const line = stats.map((s, i) => { const x = padL + i * stepX; const y = padT + chartH - (s[key] / maxVal) * chartH; return `${x.toFixed(1)},${y.toFixed(1)}`; }); return `M${padL},${padT + chartH} L${line.join(' L')} L${padL + (stats.length - 1) * stepX},${padT + chartH} Z`; };
                                const ySteps = 4;
                                const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => Math.round(maxVal * i / ySteps));
                                const showEvery = stats.length > 30 ? 7 : stats.length > 14 ? 3 : 2;
                                return (
                                    <div style={{ overflowX: 'auto' }}>
                                        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', maxHeight: '220px' }}>
                                            {yLabels.map((val, i) => { const y = padT + chartH - (val / maxVal) * chartH; return (<g key={i}><line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#f1f5f9" strokeWidth="0.5" /><text x={padL - 5} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="8">{val}</text></g>); })}
                                            <path d={makeArea('total')} fill="#6366f120" />
                                            <path d={makeArea('withPhone')} fill="#10b98115" />
                                            <path d={makeLine('total')} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d={makeLine('withPhone')} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,2" />
                                            <path d={makeLine('withoutPhone')} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2,2" />
                                            {stats.map((s, i) => { const x = padL + i * stepX; const yTotal = padT + chartH - (s.total / maxVal) * chartH; return (<g key={i}><circle cx={x} cy={yTotal} r="2.5" fill="#6366f1" /><title>{`${s.date}\nToplam: ${s.total}\nTelefonlu: ${s.withPhone}\nTelefonsuz: ${s.withoutPhone}`}</title>{i % showEvery === 0 && (<text x={x} y={h - 5} textAnchor="middle" fill="#94a3b8" fontSize="7">{s.date.slice(5)}</text>)}</g>); })}
                                        </svg>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* BÖLÜM 2: Kısa Veri Kartları */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="ceo-kpi-grid">
                <div className="ceo-kpi-card">
                    <div className="ceo-kpi-icon" style={{ background: '#eef2ff' }}><Users size={20} style={{ color: '#6366f1' }} /></div>
                    <div className="ceo-kpi-label">Toplam Başvuru</div>
                    <div className="ceo-kpi-value">{formatNumber(analytics?.totalContacts || 0)}</div>
                </div>
                <div className="ceo-kpi-card">
                    <div className="ceo-kpi-icon" style={{ background: '#f0fdf4' }}><MessageSquare size={20} style={{ color: '#10b981' }} /></div>
                    <div className="ceo-kpi-label">Toplam Mesaj</div>
                    <div className="ceo-kpi-value">{formatNumber(analytics?.totalMessages || 0)}</div>
                </div>
                <div className="ceo-kpi-card">
                    <div className="ceo-kpi-icon" style={{ background: '#ecfdf5' }}><PhoneCall size={20} style={{ color: '#059669' }} /></div>
                    <div className="ceo-kpi-label">Toplam Arama</div>
                    <div className="ceo-kpi-value">{formatNumber(ct.totalCalled || 0)}</div>
                </div>
                <div className="ceo-kpi-card">
                    <div className="ceo-kpi-icon" style={{ background: '#eff6ff' }}><Handshake size={20} style={{ color: '#3b82f6' }} /></div>
                    <div className="ceo-kpi-label">Toplam Görüşme</div>
                    <div className="ceo-kpi-value">{formatNumber(as.meetingCount || 0)}</div>
                </div>
                <div className="ceo-kpi-card">
                    <div className="ceo-kpi-icon" style={{ background: '#f0fdf4' }}><Calendar size={20} style={{ color: '#10b981' }} /></div>
                    <div className="ceo-kpi-label">Toplam Randevu</div>
                    <div className="ceo-kpi-value">{formatNumber(appt.total || 0)}</div>
                </div>
                <div className="ceo-kpi-card">
                    <div className="ceo-kpi-icon" style={{ background: '#f5f3ff' }}><FileText size={20} style={{ color: '#8b5cf6' }} /></div>
                    <div className="ceo-kpi-label">Teklif Sayısı</div>
                    <div className="ceo-kpi-value">{formatNumber(ds.totalQuotes || 0)}</div>
                    <div className="ceo-kpi-sub">₺{formatNumber(ds.quoteAmount || 0)} tutar</div>
                </div>
                <div className="ceo-kpi-card">
                    <div className="ceo-kpi-icon" style={{ background: '#eff6ff' }}><ShoppingCart size={20} style={{ color: '#3b82f6' }} /></div>
                    <div className="ceo-kpi-label">Sipariş Sayısı</div>
                    <div className="ceo-kpi-value">{formatNumber(ds.totalOrders || 0)}</div>
                    <div className="ceo-kpi-sub">₺{formatNumber(ds.orderAmount || 0)} tutar</div>
                </div>
                <div className="ceo-kpi-card">
                    <div className="ceo-kpi-icon" style={{ background: '#ecfdf5' }}><DollarSign size={20} style={{ color: '#059669' }} /></div>
                    <div className="ceo-kpi-label">Satış (₺)</div>
                    <div className="ceo-kpi-value" style={{ color: '#059669' }}>₺{formatNumber(totalSales)}</div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* BÖLÜM 3: Akış Dağılımı — Kırılımlı */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon"><Activity size={18} /></div>
                    <h2>Akış Dağılımı</h2>
                </div>
                <div className="ceo-section-body">
                    {(() => {
                        const funnels = analytics?.funnelSummary || [];
                        const totalFunnelContacts = funnels.reduce((sum, f) => sum + (f.count || 0), 0);
                        if (!funnels.length) return <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: 20 }}>Akış verisi bulunamadı</p>;
                        return funnels.map((flow) => {
                            const pct = totalFunnelContacts > 0 ? ((flow.count / totalFunnelContacts) * 100).toFixed(0) : 0;
                            const isExpanded = expandedFlows[flow.id];
                            const stages = flow.stages || [];
                            const recentCount = flow.recentCount || 0;
                            const convCount = flow.conversationCount || 0;
                            const filterLabel = flow.filterLabel || '';
                            return (
                                <div key={flow.id} className="ceo-flow-item">
                                    <div className="ceo-flow-header" onClick={() => setExpandedFlows(prev => ({ ...prev, [flow.id]: !prev[flow.id] }))}>
                                        <div className="ceo-flow-icon" style={{ background: (flow.color || '#6366f1') + '18', color: flow.color || '#6366f1' }}>
                                            {getFlowIcon(flow.name)}
                                        </div>
                                        <div className="ceo-flow-info">
                                            <span className="ceo-flow-name">{flow.name}</span>
                                            <span className="ceo-flow-count">
                                                <strong>{flow.count}</strong> Toplam
                                                {recentCount > 0 && <span style={{ color: '#10b981', fontWeight: 700, marginLeft: 6 }}>+{recentCount} ({filterLabel})</span>}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, marginRight: 6, minWidth: 70 }}>
                                            <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>{convCount} görüşme</span>
                                        </div>
                                        <div className="ceo-flow-bar-wrap">
                                            <div className="ceo-flow-bar-bg">
                                                <div className="ceo-flow-bar-fill" style={{ width: `${pct}%`, background: flow.color || '#6366f1' }} />
                                            </div>
                                            <span className="ceo-flow-pct">{pct}%</span>
                                        </div>
                                        {stages.length > 0 && (
                                            isExpanded ? <ChevronDown size={16} style={{ color: '#94a3b8', flexShrink: 0 }} /> : <ChevronRight size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                        )}
                                    </div>
                                    {isExpanded && stages.length > 0 && (
                                        <div className="ceo-flow-stages">
                                            {stages.map((stage, idx) => (
                                                <div key={stage.id || idx} className="ceo-flow-stage-row">
                                                    <div className="ceo-stage-dot" style={{ background: stage.color || flow.color || '#6366f1' }} />
                                                    <span className="ceo-stage-name">{stage.name}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                                                        <span className="ceo-stage-count">{stage.count || 0}</span>
                                                        {(stage.recentCount || 0) > 0 && (
                                                            <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>+{stage.recentCount}</span>
                                                        )}
                                                        {(stage.conversationCount || 0) > 0 && (
                                                            <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{stage.conversationCount} grş</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* BÖLÜM 4: Ekip Performans Tablosu */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><UserCheck size={18} /></div>
                    <h2>Ekip Performans Liderleri</h2>
                </div>
                <div className="ceo-section-body" style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="ceo-perf-table">
                            <thead>
                                <tr>
                                    <th>Temsilci</th>
                                    <th>Sohbet</th>
                                    <th>Çözülen</th>
                                    <th>Açık</th>
                                    <th>Mesaj</th>
                                    <th>Arama</th>
                                    <th>Görüşme</th>
                                    <th>Randevu</th>
                                    <th>Teklif</th>
                                    <th>Sipariş</th>
                                    <th>Çözüm</th>
                                    <th>Yanıt Süresi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...(agentPerformance?.agents || []), ...(agentPerformance?.bots || [])].map((agent) => (
                                    <tr key={agent.id || agent.botId}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                {agent.avatar ? (
                                                    <img src={agent.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#6366f1' }}>
                                                        {agent.name?.charAt(0)}
                                                    </div>
                                                )}
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b' }}>{agent.name}</div>
                                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{agent.isBot ? 'Yapay Zeka' : agent.role === 'OWNER' ? 'Yönetici' : 'Temsilci'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span style={{ fontWeight: 700, color: '#6366f1' }}>{agent.totalConversations}</span></td>
                                        <td><span style={{ fontWeight: 700, color: '#10b981' }}>{agent.resolvedConversations || 0}</span></td>
                                        <td><span style={{ fontWeight: 700, color: agent.openConversations > 0 ? '#f59e0b' : '#d1d5db' }}>{agent.openConversations ?? 0}</span></td>
                                        <td><span style={{ fontWeight: 700 }}>{agent.messagesSent || 0}</span></td>
                                        <td><span style={{ fontWeight: 700, color: agent.callCount > 0 ? '#059669' : '#d1d5db' }}>{agent.callCount || 0}</span></td>
                                        <td><span style={{ fontWeight: 700, color: agent.meetingCount > 0 ? '#0ea5e9' : '#d1d5db' }}>{agent.meetingCount || 0}</span></td>
                                        <td><span style={{ fontWeight: 700, color: agent.appointmentCount > 0 ? '#f97316' : '#d1d5db' }}>{agent.appointmentCount || 0}</span></td>
                                        <td><span style={{ fontWeight: 700, color: agent.dealQuotes > 0 ? '#8b5cf6' : '#d1d5db' }}>{agent.dealQuotes || 0}</span></td>
                                        <td><span style={{ fontWeight: 700, color: agent.dealOrders > 0 ? '#f59e0b' : '#d1d5db' }}>{agent.dealOrders || 0}</span></td>
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9rem' }}>{agent.resolutionRate}%</span>
                                                <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, width: 40 }}>
                                                    <div style={{ height: '100%', background: '#10b981', borderRadius: 2, width: `${agent.resolutionRate}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                        <td><span style={{ fontWeight: 600, color: '#64748b', fontSize: '0.82rem' }}>{agent.avgResponseTime || agent.avgResponseTimeMinutes || 0} dk</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* BÖLÜM 5: Görüşme & Randevu Dağılımı */}
            {/* ═══════════════════════════════════════════════════════ */}
            {((appt.total || 0) > 0 || (meet.total || 0) > 0) && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#f0fdf4', color: '#10b981' }}><Calendar size={18} /></div>
                        <h2>Görüşme & Randevu Dağılımı</h2>
                    </div>
                    <div className="ceo-section-body">
                        {/* ── Görüşmeler ── */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Handshake size={15} style={{ color: '#6366f1' }} /> Görüşmeler
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>({meet.total || 0} toplam)</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                {[
                                    { label: 'Planlanan', value: meet.planned, color: '#f59e0b', icon: '📅' },
                                    { label: 'Tamamlanan', value: meet.completed, color: '#10b981', icon: '✅' },
                                    { label: 'Tarihi Geçmiş', value: meet.overdue, color: '#ef4444', icon: '⏰' },
                                    { label: 'İptal Edildi', value: meet.cancelled, color: '#64748b', icon: '❌' },
                                ].map(item => (
                                    <div key={item.label} style={{ background: '#f8fafc', padding: '14px 12px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f1f5f9' }}>
                                        <div style={{ fontSize: 20 }}>{item.icon}</div>
                                        <div>
                                            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b' }}>{item.label}</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: item.color }}>{item.value || 0}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── Randevular ── */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Calendar size={15} style={{ color: '#0ea5e9' }} /> Randevular
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>({appt.total || 0} toplam)</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                {[
                                    { label: 'Planlanan', value: appt.scheduled, color: '#f59e0b', icon: '📅' },
                                    { label: 'Tamamlanan', value: appt.completed, color: '#10b981', icon: '✅' },
                                    { label: 'Tarihi Geçmiş', value: appt.overdue, color: '#ef4444', icon: '⏰' },
                                    { label: 'İptal Edildi', value: appt.cancelled, color: '#64748b', icon: '❌' },
                                ].map(item => (
                                    <div key={item.label} style={{ background: '#f8fafc', padding: '14px 12px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f1f5f9' }}>
                                        <div style={{ fontSize: 20 }}>{item.icon}</div>
                                        <div>
                                            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b' }}>{item.label}</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: item.color }}>{item.value || 0}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── Agent Bazlı Görüşme & Randevu ── */}
                        {agentPerformance?.agents?.filter(a => (a.appointmentCount || 0) > 0 || (a.meetingCount || 0) > 0).length > 0 && (
                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><UserCheck size={14} /> Agent Bazlı Görüşme & Randevu</div>
                                {agentPerformance.agents.filter(a => (a.appointmentCount || 0) > 0 || (a.meetingCount || 0) > 0).sort((a, b) => ((b.appointmentCount || 0) + (b.meetingCount || 0)) - ((a.appointmentCount || 0) + (a.meetingCount || 0))).map((agent, idx) => (
                                    <div key={agent.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: idx === 0 ? '#eff6ff' : '#f8fafc', border: idx === 0 ? '1px solid #bfdbfe' : '1px solid #f1f5f9', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: idx === 0 ? '#3b82f6' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.7rem' }}>{idx + 1}</div>
                                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{agent.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Handshake size={13} style={{ color: '#6366f1' }} />
                                                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#6366f1' }}>{agent.meetingCount || 0}</span>
                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>görüşme</span>
                                            </div>
                                            <div style={{ width: 1, height: 18, background: '#e2e8f0' }} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Calendar size={13} style={{ color: '#0ea5e9' }} />
                                                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0ea5e9' }}>{agent.appointmentCount || 0}</span>
                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>randevu</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* BÖLÜM 6: Aktivite Raporu */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon" style={{ background: '#fef3c7', color: '#d97706' }}><ListChecks size={18} /></div>
                    <h2>Aktivite Raporu</h2>
                </div>
                <div className="ceo-section-body">
                    <div className="ceo-mini-grid cols-4" style={{ marginBottom: 16 }}>
                        <div className="ceo-mini-card" style={{ background: '#eff6ff' }}>
                            <div className="mini-value" style={{ color: '#1d4ed8' }}>{as.plannedCount || 0}</div>
                            <div className="mini-label" style={{ color: '#3b82f6' }}>Bekleyen</div>
                        </div>
                        <div className="ceo-mini-card" style={{ background: '#f0fdf4' }}>
                            <div className="mini-value" style={{ color: '#16a34a' }}>{as.completedCount || 0}</div>
                            <div className="mini-label" style={{ color: '#059669' }}>Tamamlanan</div>
                        </div>
                        <div className="ceo-mini-card" style={{ background: '#fffbeb' }}>
                            <div className="mini-value" style={{ color: '#d97706' }}>{as.inProgressCount || 0}</div>
                            <div className="mini-label" style={{ color: '#b45309' }}>Devam Eden</div>
                        </div>
                        <div className="ceo-mini-card" style={{ background: '#fef2f2' }}>
                            <div className="mini-value" style={{ color: '#dc2626' }}>{as.overdueCount || 0}</div>
                            <div className="mini-label" style={{ color: '#dc2626' }}>Gecikmiş</div>
                        </div>
                    </div>
                    <div className="ceo-label">Tip Dağılımı</div>
                    {[
                        { label: 'Arama', count: as.callCount || 0, icon: <PhoneCall size={14} />, color: '#059669' },
                        { label: 'Görüşme', count: as.meetingCount || 0, icon: <Handshake size={14} />, color: '#6366f1' },
                        { label: 'Görev', count: as.taskCount || 0, icon: <ListChecks size={14} />, color: '#f59e0b' },
                        { label: 'Not', count: as.noteCount || 0, icon: <MessageSquare size={14} />, color: '#64748b' },
                    ].map(item => {
                        const total = as.totalActivities || 1;
                        const pct = total > 0 ? ((item.count / total) * 100) : 0;
                        return (
                            <div key={item.label} className="ceo-type-row">
                                <div className="type-icon" style={{ color: item.color }}>{item.icon}</div>
                                <span className="type-label">{item.label}</span>
                                <span className="type-count">{item.count}</span>
                                <div className="ceo-type-bar"><div className="ceo-type-bar-fill" style={{ width: `${pct}%`, background: item.color }} /></div>
                                <span className="type-pct">{pct.toFixed(0)}%</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* BÖLÜM 7: Gelen Talep Analizi */}
            {/* ═══════════════════════════════════════════════════════ */}
            {aggregatedTopics.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#fdf2f8', color: '#ec4899' }}><Target size={18} /></div>
                        <h2>Gelen Talep Analizi</h2>
                    </div>
                    <div className="ceo-section-body">
                        {/* Özet Kartlar */}
                        <div className="ceo-mini-grid cols-4" style={{ marginBottom: 16 }}>
                            <div className="ceo-mini-card" style={{ background: '#fdf2f8' }}>
                                <div className="mini-value" style={{ color: '#db2777' }}>{analytics.requestAnalysis.totalRequests}</div>
                                <div className="mini-label" style={{ color: '#ec4899' }}>Toplam Talep</div>
                            </div>
                            <div className="ceo-mini-card" style={{ background: '#ecfdf5' }}>
                                <div className="mini-value" style={{ color: '#059669' }}>{analytics.requestAnalysis.withPhoneCount}</div>
                                <div className="mini-label" style={{ color: '#10b981' }}>Numaralı</div>
                            </div>
                            <div className="ceo-mini-card" style={{ background: '#eff6ff' }}>
                                <div className="mini-value" style={{ color: '#2563eb' }}>{analytics.requestAnalysis.calledCount}</div>
                                <div className="mini-label" style={{ color: '#3b82f6' }}>Arandı</div>
                            </div>
                            <div className="ceo-mini-card" style={{ background: '#f0fdf4' }}>
                                <div className="mini-value" style={{ color: '#16a34a' }}>{analytics.requestAnalysis.relevantCount}</div>
                                <div className="mini-label" style={{ color: '#22c55e' }}>İlgili Çıktı</div>
                            </div>
                        </div>

                        {/* Konu Bazlı Tablo (AI sınıflandırma veya similarity) */}
                        <div className="ceo-label">İlgilenilen Konular {analytics.requestAnalysis.aiClassified ? <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#8b5cf6', background: '#f5f3ff', padding: '2px 8px', borderRadius: 12, marginLeft: 6 }}>🤖 AI Sınıflandırma</span> : <span style={{ fontSize: '0.68rem', fontWeight: 500, color: '#94a3b8' }}>(benzer konular birleştirildi)</span>}</div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="ceo-perf-table">
                                <thead>
                                    <tr>
                                        <th style={{ minWidth: 160 }}>Konu</th>
                                        <th>Talep</th>
                                        <th>Numaralı</th>
                                        <th>Arandı</th>
                                        <th>İlgili</th>
                                        <th>Dönüşüm</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {aggregatedTopics.map((t, idx) => {
                                        const convRate = t.count > 0 ? ((t.relevant / t.count) * 100).toFixed(0) : 0;
                                        const maxCount = aggregatedTopics[0]?.count || 1;
                                        const barPct = ((t.count / maxCount) * 100).toFixed(0);
                                        return (
                                            <tr key={t.topic}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: idx === 0 ? '#ec4899' : idx === 1 ? '#f472b6' : '#f9a8d4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.65rem', flexShrink: 0 }}>{idx + 1}</div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }} title={t.mergedTopics?.length > 1 ? t.mergedTopics.join(', ') : undefined}>{t.topic}</div>
                                                            {t.mergedTopics?.length > 1 && (
                                                                <div style={{ fontSize: '0.62rem', color: '#a78bfa', marginTop: 2 }}>+{t.mergedTopics.length - 1} benzer konu birleştirildi</div>
                                                            )}
                                                            <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, width: 80, marginTop: 3 }}>
                                                                <div style={{ height: '100%', background: '#ec4899', borderRadius: 2, width: `${barPct}%` }} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><span style={{ fontWeight: 700, color: '#db2777' }}>{t.count}</span></td>
                                                <td><span style={{ fontWeight: 700, color: t.withPhone > 0 ? '#059669' : '#d1d5db' }}>{t.withPhone}</span></td>
                                                <td><span style={{ fontWeight: 700, color: t.called > 0 ? '#2563eb' : '#d1d5db' }}>{t.called}</span></td>
                                                <td><span style={{ fontWeight: 700, color: t.relevant > 0 ? '#16a34a' : '#d1d5db' }}>{t.relevant}</span></td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                        <span style={{ fontWeight: 700, color: convRate > 30 ? '#16a34a' : convRate > 10 ? '#f59e0b' : '#ef4444', fontSize: '0.9rem' }}>{convRate}%</span>
                                                        <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, width: 40 }}>
                                                            <div style={{ height: '100%', background: convRate > 30 ? '#16a34a' : convRate > 10 ? '#f59e0b' : '#ef4444', borderRadius: 2, width: `${Math.min(convRate, 100)}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* BÖLÜM 8: Arama Detayları */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon" style={{ background: '#ecfdf5', color: '#059669' }}><Phone size={18} /></div>
                    <h2>Arama Detayları</h2>
                </div>
                <div className="ceo-section-body">
                    {(() => {
                        // Numaralı Başvurular = contactStats ile tutarlı (üstteki TELEFONLU ile aynı kaynak)
                        const numarali = contactStats?.totals?.withPhone || ct.totalWithPhone || 0;
                        const kaciArandi = ct.totalCalled || 0;
                        const toplamArama = ct.totalCompleted || 0;
                        const aranmayan = Math.max(0, numarali - kaciArandi);
                        const aramaOrani = numarali > 0 ? ((kaciArandi / numarali) * 100).toFixed(1) : 0;
                        return (
                    <div className="ceo-kpi-grid" style={{ marginBottom: 16 }}>
                        <div className="ceo-kpi-card">
                            <div className="ceo-kpi-icon" style={{ background: '#eef2ff' }}><Users size={18} style={{ color: '#6366f1' }} /></div>
                            <div className="ceo-kpi-label">Numaralı Başvurular</div>
                            <div className="ceo-kpi-value">{numarali}</div>
                            <div className="ceo-kpi-sub">Telefon numarası olan kişi</div>
                        </div>
                        <div className="ceo-kpi-card">
                            <div className="ceo-kpi-icon" style={{ background: '#f0fdf4' }}><Phone size={18} style={{ color: '#10b981' }} /></div>
                            <div className="ceo-kpi-label">Kaçı Arandı</div>
                            <div className="ceo-kpi-value">{kaciArandi}</div>
                            <div className="ceo-kpi-sub">Benzersiz kişi (5 kez aransa da 1)</div>
                        </div>
                        <div className="ceo-kpi-card">
                            <div className="ceo-kpi-icon" style={{ background: '#ecfdf5' }}><PhoneCall size={18} style={{ color: '#059669' }} /></div>
                            <div className="ceo-kpi-label">Toplam Arama</div>
                            <div className="ceo-kpi-value">{toplamArama}</div>
                            <div className="ceo-kpi-sub">Toplam yapılan arama sayısı</div>
                        </div>
                        <div className="ceo-kpi-card">
                            <div className="ceo-kpi-icon" style={{ background: '#fef2f2' }}><PhoneOff size={18} style={{ color: '#ef4444' }} /></div>
                            <div className="ceo-kpi-label">Aranmayan Başvuru</div>
                            <div className="ceo-kpi-value" style={{ color: '#ef4444' }}>{aranmayan}</div>
                            <div className="ceo-kpi-sub">Henüz hiç aranmamış kişi</div>
                        </div>
                        <div className="ceo-kpi-card">
                            <div className="ceo-kpi-icon" style={{ background: '#eef2ff' }}><TrendingUp size={18} style={{ color: '#6366f1' }} /></div>
                            <div className="ceo-kpi-label">Arama Oranı</div>
                            <div className="ceo-kpi-value">%{aramaOrani}</div>
                            <div className="ceo-kpi-sub">Aranan / Toplam numaralı</div>
                        </div>
                    </div>
                        );
                    })()}

                    {/* Kime Atandı — Agent bazlı arama dağılımı */}
                    {agentPerformance?.agents?.filter(a => (a.callCount || 0) > 0).length > 0 && (
                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                            <div className="ceo-label">Arama Atamaları — Kime Planlandı</div>
                            {agentPerformance.agents
                                .filter(a => (a.callCount || 0) > 0)
                                .sort((a, b) => (b.callCount || 0) - (a.callCount || 0))
                                .map((agent, idx) => {
                                    const totalAgentCalls = agentPerformance.agents.reduce((s, a) => s + (a.callCount || 0), 0) || 1;
                                    const pct = ((agent.callCount / totalAgentCalls) * 100).toFixed(0);
                                    return (
                                        <div key={agent.userId || idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: idx === 0 ? '#eff6ff' : '#f8fafc', marginBottom: 4 }}>
                                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: idx === 0 ? '#3b82f6' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.65rem', flexShrink: 0 }}>{idx + 1}</div>
                                            <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b', flex: 1 }}>{agent.name}</span>
                                            <span style={{ fontWeight: 800, fontSize: '1rem', color: idx === 0 ? '#3b82f6' : '#475569' }}>{agent.callCount}</span>
                                            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>arama ({pct}%)</span>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CeoReport;
