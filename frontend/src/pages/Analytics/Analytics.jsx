import React, { useState, useEffect } from 'react';
import { 
    Users, MessageSquare, Bot, Activity, ArrowUpRight, 
    TrendingUp, Calendar, Filter, MoreHorizontal,
    Instagram, Facebook, Mail, Globe, MessageCircle,
    UserCheck, Clock, CheckCircle2, ChevronRight, Zap,
    ClipboardList, Briefcase, Headphones, Truck, Building2, DollarSign, Wallet,
    Phone, PhoneOff
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI, dealAPI, funnelAPI } from '../../services/api';
import { useTranslation } from 'react-i18next';
import './Analytics.css';

const Analytics = () => {
    const { currentWorkspace } = useAuth();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState(null);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [funnels, setFunnels] = useState([]);
    const [selectedFunnel, setSelectedFunnel] = useState('');
    const [isInitialDataLoaded, setIsInitialDataLoaded] = useState(false);
    const [error, setError] = useState(null);
    const [contactStats, setContactStats] = useState(null);

    // Date filter states
    const [dateFilter, setDateFilter] = useState('7d');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadInitialData();
        }
    }, [currentWorkspace?.id]);

    useEffect(() => {
        if (currentWorkspace?.id && isInitialDataLoaded) {
            loadAnalytics();
        }
    }, [currentWorkspace?.id, dateFilter, startDate, endDate, selectedFunnel, isInitialDataLoaded]);

    const loadInitialData = async () => {
        try {
            const funnelRes = await funnelAPI.getAll(currentWorkspace.id);
            const funnelsList = funnelRes.data || [];
            setFunnels(funnelsList);
            setIsInitialDataLoaded(true);
        } catch (err) {
            console.error('Error loading initial data:', err);
            setIsInitialDataLoaded(true);
        }
    };

    const getDateRange = () => {
        const now = new Date();
        const start = new Date();
        if (dateFilter === '24h') start.setHours(now.getHours() - 24);
        else if (dateFilter === '7d') start.setDate(now.getDate() - 7);
        else if (dateFilter === '30d') start.setDate(now.getDate() - 30);
        else if (dateFilter === 'custom' && startDate) return { startDate, endDate };
        else return { startDate: start.toISOString(), endDate: now.toISOString() };
        
        return { startDate: start.toISOString(), endDate: now.toISOString() };
    };

    const loadAnalytics = async () => {
        try {
            setLoading(true);
            const dateParams = getDateRange();
            if (selectedFunnel) dateParams.funnelId = selectedFunnel;

            const [analyticsRes, performanceRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, dateParams),
                contactAPI.getAgentPerformance(currentWorkspace.id, dateParams)
            ]);

            setAnalytics(analyticsRes.data);
            setAgentPerformance(performanceRes.data);
            setError(null);

            // Load contact daily stats with same date filter
            try {
                const statsRes = await contactAPI.getDailyStats(currentWorkspace.id, dateParams);
                setContactStats(statsRes.data);
            } catch (e) {
                console.warn('Contact stats load failed:', e.message);
            }
        } catch (err) {
            console.error('Analytics load error:', err);
            setError('Veriler yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num;
    };

    const getChannelIcon = (channel) => {
        switch (channel?.toUpperCase()) {
            case 'INSTAGRAM': return <Instagram size={18} />;
            case 'FACEBOOK': return <Facebook size={18} />;
            case 'EMAIL': return <Mail size={18} />;
            case 'WIDGET': return <Globe size={18} />;
            case 'WHATSAPP': return <MessageCircle size={18} />;
            default: return <MessageSquare size={18} />;
        }
    };

    const getChannelColor = (channel) => {
        switch (channel?.toUpperCase()) {
            case 'INSTAGRAM': return '#E1306C';
            case 'FACEBOOK': return '#1877F2';
            case 'EMAIL': return '#EA4335';
            case 'WIDGET': return '#6366F1';
            case 'WHATSAPP': return '#25D366';
            default: return '#64748B';
        }
    };

    const getFlowIcon = (flowName) => {
        const name = flowName?.toLowerCase() || '';
        if (name.includes('randevu')) return <Calendar size={20} />;
        if (name.includes('kurumsal')) return <Building2 size={20} />;
        if (name.includes('satış') || name.includes('satis')) return <DollarSign size={20} />;
        if (name.includes('destek')) return <Headphones size={20} />;
        if (name.includes('iş') || name.includes('taseron') || name.includes('taşeron')) return <Briefcase size={20} />;
        if (name.includes('tedarik')) return <Truck size={20} />;
        if (name.includes('genel')) return <ClipboardList size={20} />;
        return <ClipboardList size={20} />;
    };

    if (loading && !analytics) {
        return (
            <div className="analytics-loading">
                <Zap className="spin text-primary" size={32} />
            </div>
        );
    }

    return (
        <div className="analytics-dashboard">
            {/* Header */}
            <div className="analytics-header">
                <div className="header-title-area">
                    <h1>Operasyonel Analizler</h1>
                    <p>Yapay zeka ve ekip performansınızın anlık özeti</p>
                </div>
                <div className="header-actions">
                    <select 
                        value={dateFilter} 
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="premium-select"
                    >
                        <option value="24h">Son 24 Saat</option>
                        <option value="7d">Son 7 Gün</option>
                        <option value="30d">Son 30 Gün</option>
                        <option value="custom">Özel Aralık</option>
                    </select>

                    {dateFilter === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{
                                    padding: '8px 12px', borderRadius: 8,
                                    border: '1px solid #e5e7eb', fontSize: '0.85rem',
                                    background: '#fff', cursor: 'pointer'
                                }}
                            />
                            <span style={{ color: '#9ca3af', fontWeight: 600 }}>—</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{
                                    padding: '8px 12px', borderRadius: 8,
                                    border: '1px solid #e5e7eb', fontSize: '0.85rem',
                                    background: '#fff', cursor: 'pointer'
                                }}
                            />
                            <button
                                className="btn-secondary"
                                onClick={loadAnalytics}
                                disabled={!startDate || !endDate}
                                style={{ opacity: (!startDate || !endDate) ? 0.5 : 1 }}
                            >
                                <Calendar size={15} /> Uygula
                            </button>
                        </div>
                    )}

                    <button className="btn-secondary" onClick={loadAnalytics}>
                        <Clock size={16} /> Güncelle
                    </button>
                </div>
            </div>


            {/* Contact Analytics Panel */}
            {contactStats && (
                <div style={{
                    background: '#fff', borderRadius: '16px', padding: '20px',
                    border: '1px solid #e5e7eb', marginBottom: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', borderRadius: '12px',
                            padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                        }}>
                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Users size={20} color="#fff" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Toplam Kişi</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#312e81' }}>{contactStats.totals?.total || 0}</div>
                            </div>
                        </div>
                        <div style={{
                            background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', borderRadius: '12px',
                            padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                        }}>
                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Phone size={20} color="#fff" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefonlu</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#064e3b' }}>{contactStats.totals?.withPhone || 0}</div>
                            </div>
                        </div>
                        <div style={{
                            background: 'linear-gradient(135deg, #fef2f2, #fecaca)', borderRadius: '12px',
                            padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                        }}>
                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <PhoneOff size={20} color="#fff" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefonsuz</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#991b1b' }}>{contactStats.totals?.withoutPhone || 0}</div>
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div style={{ position: 'relative' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span>Günlük Gelen Kişi Sayısı</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: 10, height: 3, background: '#6366f1', borderRadius: 2, display: 'inline-block' }}></span>
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Toplam</span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: 10, height: 3, background: '#10b981', borderRadius: 2, display: 'inline-block' }}></span>
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Telefonlu</span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: 10, height: 3, background: '#ef4444', borderRadius: 2, display: 'inline-block' }}></span>
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Telefonsuz</span>
                            </span>
                        </div>
                        {(() => {
                            const stats = contactStats.dailyStats || [];
                            if (!stats.length) return <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Veri yok</p>;
                            const maxVal = Math.max(...stats.map(s => s.total), 1);
                            const w = 900, h = 180, padL = 40, padR = 10, padT = 10, padB = 30;
                            const chartW = w - padL - padR, chartH = h - padT - padB;
                            const stepX = chartW / Math.max(stats.length - 1, 1);

                            const makeLine = (key) => stats.map((s, i) => {
                                const x = padL + i * stepX;
                                const y = padT + chartH - (s[key] / maxVal) * chartH;
                                return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                            }).join(' ');

                            const makeArea = (key) => {
                                const line = stats.map((s, i) => {
                                    const x = padL + i * stepX;
                                    const y = padT + chartH - (s[key] / maxVal) * chartH;
                                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                                });
                                return `M${padL},${padT + chartH} L${line.join(' L')} L${padL + (stats.length - 1) * stepX},${padT + chartH} Z`;
                            };

                            const ySteps = 4;
                            const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => Math.round(maxVal * i / ySteps));
                            const showEvery = stats.length > 30 ? 7 : stats.length > 14 ? 3 : 2;

                            return (
                                <div style={{ overflowX: 'auto' }}>
                                    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', maxHeight: '220px' }}>
                                        {yLabels.map((val, i) => {
                                            const y = padT + chartH - (val / maxVal) * chartH;
                                            return (
                                                <g key={i}>
                                                    <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#f1f5f9" strokeWidth="0.5" />
                                                    <text x={padL - 5} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="8">{val}</text>
                                                </g>
                                            );
                                        })}
                                        <path d={makeArea('total')} fill="#6366f120" />
                                        <path d={makeArea('withPhone')} fill="#10b98115" />
                                        <path d={makeLine('total')} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d={makeLine('withPhone')} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,2" />
                                        <path d={makeLine('withoutPhone')} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2,2" />
                                        {stats.map((s, i) => {
                                            const x = padL + i * stepX;
                                            const yTotal = padT + chartH - (s.total / maxVal) * chartH;
                                            return (
                                                <g key={i}>
                                                    <circle cx={x} cy={yTotal} r="2.5" fill="#6366f1" />
                                                    <title>{`${s.date}\nToplam: ${s.total}\nTelefonlu: ${s.withPhone}\nTelefonsuz: ${s.withoutPhone}`}</title>
                                                    {i % showEvery === 0 && (
                                                        <text x={x} y={h - 5} textAnchor="middle" fill="#94a3b8" fontSize="7">
                                                            {s.date.slice(5)}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        })}
                                    </svg>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Top Stats Overview */}
            <div className="stats-overview-grid">
                <div className="stat-card-premium">
                    <div className="stat-icon-wrapper bg-primary-soft">
                        <Users size={22} />
                    </div>
                    <span className="stat-label">Toplam Rehber</span>
                    <div className="stat-value-large">{formatNumber(analytics?.totalContacts || 0)}</div>
                    <div className="stat-trend positive">
                        <TrendingUp size={12} /> +12.5%
                    </div>
                </div>
                <div className="stat-card-premium">
                    <div className="stat-icon-wrapper bg-success-soft">
                        <MessageSquare size={22} />
                    </div>
                    <span className="stat-label">Toplam Mesaj</span>
                    <div className="stat-value-large">{formatNumber(analytics?.totalMessages || 0)}</div>
                    <div className="stat-trend positive">
                        <TrendingUp size={12} /> +8.2%
                    </div>
                </div>
                <div className="stat-card-premium">
                    <div className="stat-icon-wrapper bg-warning-soft">
                        <Bot size={22} />
                    </div>
                    <span className="stat-label">AI Yanıt Oranı</span>
                    <div className="stat-value-large">
                        {analytics?.totalMessages > 0 
                            ? ((analytics.totalAiMessages / analytics.totalMessages) * 100).toFixed(1) 
                            : 0}%
                    </div>
                    <div className="stat-trend neutral">Stabil</div>
                </div>
                <div className="stat-card-premium">
                    <div className="stat-icon-wrapper bg-danger-soft">
                        <Zap size={22} />
                    </div>
                    <span className="stat-label">Çözümleme Oranı</span>
                    <div className="stat-value-large">{analytics?.resolutionRate ?? 0}%</div>
                    <div className="stat-trend neutral">Gerçek Veri</div>
                </div>
                <div className="stat-card-premium">
                    <div className="stat-icon-wrapper" style={{ background: '#f0fdf4' }}>
                        <Calendar size={22} style={{ color: '#10b981' }} />
                    </div>
                    <span className="stat-label">Toplam Randevu</span>
                    <div className="stat-value-large">{formatNumber(analytics?.appointmentStats?.total || 0)}</div>
                    <div className="stat-trend neutral" style={{ gap: 8 }}>
                        <span title="Bot tarafından alınan">🤖 {analytics?.appointmentStats?.byBot || 0}</span>
                        <span style={{ margin: '0 4px', opacity: 0.4 }}>|</span>
                        <span title="Agent tarafından alınan">👤 {analytics?.appointmentStats?.byAgent || 0}</span>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="analytics-main-grid">
                {/* Left: Arama Takip & AI Performansı */}
                <div className="premium-section-card">
                    <div className="section-header-modern">
                        <div className="section-title-modern">
                            <div className="section-icon-box"><Phone size={20} /></div>
                            <h2>Arama & AI Performansı</h2>
                        </div>
                    </div>
                    <div className="ai-perf-container">
                        {/* Arama İstatistikleri */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                            <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Planlanan Arama</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#064e3b' }}>{analytics?.callTrackingStats?.totalCalled || 0}</div>
                            </div>
                            <div style={{ background: '#ecfdf5', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Tamamlanan Arama</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#047857' }}>{analytics?.callTrackingStats?.totalCompleted || 0}</div>
                            </div>
                            <div style={{ background: '#fef2f2', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Aranmayan Kişi</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#991b1b' }}>{analytics?.callTrackingStats?.totalNotCalled || 0}</div>
                            </div>
                            <div style={{ background: '#eef2ff', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Arama Oranı</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#312e81' }}>{analytics?.callTrackingStats?.callRate || 0}%</div>
                            </div>
                        </div>

                        {/* AI Performans */}
                        <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '14px', padding: '16px', color: '#fff', marginBottom: '14px' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>🤖 Yapay Zeka Özeti</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{formatNumber(analytics?.totalAiMessages || 0)}</div>
                                    <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>AI Yanıt</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{analytics?.appointmentStats?.byBot || 0}</div>
                                    <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>AI Randevu</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{analytics?.handoffRate || 0}%</div>
                                    <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>Devretme</div>
                                </div>
                            </div>
                        </div>

                        {/* Mesaj Dağılımı */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>İnsan Yanıt</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{formatNumber(analytics?.totalHumanMessages || 0)}</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Toplam Mesaj</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{formatNumber(analytics?.totalMessages || 0)}</div>
                            </div>
                        </div>

                        {/* Aylık Trend */}
                        <div className="monthly-trend-premium" style={{ marginTop: '14px' }}>
                            <span className="stat-label">Aylık Başvuru Trendi</span>
                            <div className="trend-chart-container" style={{ height: '120px', display: 'flex', alignItems: 'flex-end', gap: '8px', paddingTop: '10px' }}>
                                {(analytics?.monthlyData || []).map((m, idx) => (
                                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                                        <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                            <div 
                                                className="bg-primary-soft"
                                                style={{ 
                                                    width: '80%', 
                                                    borderRadius: '6px 6px 0 0',
                                                    height: `${(m.count / Math.max(...(analytics.monthlyData || []).map(d => d.count), 1) * 100) || 5}%`,
                                                    transition: 'height 1s ease'
                                                }}
                                            />
                                        </div>
                                        <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#94a3b8', marginTop: '6px' }}>{m.month}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Center: Flow Distribution */}
                <div className="premium-section-card">
                    <div className="section-header-modern">
                        <div className="section-title-modern">
                            <div className="section-icon-box"><Activity size={20} /></div>
                            <h2>Akış Dağılımı</h2>
                        </div>
                    </div>
                    <div className="flow-summary-list">
                        {(() => {
                            const funnels = analytics?.funnelSummary || [];
                            const totalFunnelContacts = funnels.reduce((sum, f) => sum + (f.count || 0), 0);
                            return funnels.map((flow) => (
                                <div key={flow.id} className="flow-item-premium">
                                    <div className="flow-icon-circle" style={{ background: (flow.color || '#6366f1') + '20', color: flow.color || '#6366f1' }}>
                                        {getFlowIcon(flow.name)}
                                    </div>
                                    <div className="flow-details-box">
                                        <span className="flow-name-text">{flow.name}</span>
                                        <span className="flow-count-badge">{flow.count} Kişi</span>
                                    </div>
                                    <div className="flow-share-pill">
                                        {totalFunnelContacts > 0
                                            ? ((flow.count / totalFunnelContacts) * 100).toFixed(0)
                                            : 0}%
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>

                </div>

                {/* Right: Channel Distribution */}
                <div className="premium-section-card">
                    <div className="section-header-modern">
                        <div className="section-title-modern">
                            <div className="section-icon-box"><Globe size={20} /></div>
                            <h2>Kanal Dağılımı</h2>
                        </div>
                    </div>
                    <div className="modern-channel-list">
                        {(analytics?.channelData || []).map((item) => (
                            <div key={item.channel} className="channel-row">
                                <div className="channel-tag" style={{ background: getChannelColor(item.channel) + '15', color: getChannelColor(item.channel) }}>
                                    {getChannelIcon(item.channel)}
                                </div>
                                <div className="channel-bar-group">
                                    <div className="channel-bar-top">
                                        <span>{item.channel}</span>
                                        <span>{item.count}</span>
                                    </div>
                                    <div className="channel-bar-track">
                                        <div 
                                            className="channel-bar-fill" 
                                            style={{ 
                                                width: `${(item.count / analytics.totalContacts * 100) || 0}%`,
                                                background: getChannelColor(item.channel)
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Appointment Breakdown */}
            {(analytics?.appointmentStats?.total || 0) > 0 && (
                <div style={{ padding: '0 0 24px' }}>
                    <div className="premium-section-card">
                        <div className="section-header-modern">
                            <div className="section-title-modern">
                                <div className="section-icon-box"><Calendar size={20} /></div>
                                <h2>Randevu Dağılımı</h2>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, padding: '0 4px 4px' }}>
                            {[
                                { label: 'Bot Aldı', value: analytics.appointmentStats.byBot, color: '#6366f1', icon: '🤖' },
                                { label: 'Agent Aldı', value: analytics.appointmentStats.byAgent, color: '#0ea5e9', icon: '👤' },
                                { label: 'Planlandı', value: analytics.appointmentStats.scheduled, color: '#f59e0b', icon: '📅' },
                                { label: 'Tamamlandı', value: analytics.appointmentStats.completed, color: '#10b981', icon: '✅' },
                                { label: 'İptal Edildi', value: analytics.appointmentStats.cancelled, color: '#ef4444', icon: '❌' },
                            ].map(item => (
                                <div key={item.label} style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ fontSize: 24 }}>{item.icon}</div>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>{item.label}</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}



            {/* Agent Performance Table */}
            <div className="analytics-footer-section">
                <div className="premium-table-wrapper">
                    <div className="section-header-modern">
                        <div className="section-title-modern">
                            <div className="section-icon-box"><UserCheck size={20} /></div>
                            <h2>Ekip Performans Liderleri</h2>
                        </div>
                    </div>
                    <table className="modern-table" style={{ fontSize: '0.82rem' }}>
                        <thead>
                            <tr>
                                <th>Temsilci</th>
                                <th style={{ textAlign: 'center' }}>Sohbet</th>
                                <th style={{ textAlign: 'center' }}>Çözülen</th>
                                <th style={{ textAlign: 'center' }}>Açık</th>
                                <th style={{ textAlign: 'center' }}>Mesaj</th>
                                <th style={{ textAlign: 'center' }}>Arama</th>
                                <th style={{ textAlign: 'center' }}>Görüşme</th>
                                <th style={{ textAlign: 'center' }}>Randevu</th>
                                <th style={{ textAlign: 'center' }}>Teklif</th>
                                <th style={{ textAlign: 'center' }}>Sipariş</th>
                                <th style={{ textAlign: 'center' }}>Çözüm</th>
                                <th>Yanıt Süresi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...(agentPerformance?.agents || []), ...(agentPerformance?.bots || [])].map((agent) => (
                                <tr key={agent.id || agent.botId}>
                                    <td>
                                        <div className="agent-profile-modern">
                                            {agent.avatar ? (
                                                <img src={agent.avatar} className="agent-avatar-modern" alt="" />
                                            ) : (
                                                <div className="agent-avatar-modern bg-primary-soft" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: '#6366f1' }}>
                                                    {agent.name?.charAt(0)}
                                                </div>
                                            )}
                                            <div className="agent-details">
                                                <span className="agent-name-modern">{agent.name}</span>
                                                <span className="agent-role-modern">{agent.isBot ? 'Yapay Zeka' : agent.role === 'OWNER' ? 'Yönetici' : 'Temsilci'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#6366f1', fontSize: '0.95rem' }}>{agent.totalConversations}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#10b981' }}>{agent.resolvedConversations || 0}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: agent.openConversations > 0 ? '#f59e0b' : '#94a3b8' }}>{agent.openConversations ?? 0}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{agent.messagesSent || 0}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: agent.callCount > 0 ? '#059669' : '#d1d5db' }}>{agent.callCount || 0}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: agent.meetingCount > 0 ? '#0ea5e9' : '#d1d5db' }}>{agent.meetingCount || 0}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: agent.appointmentCount > 0 ? '#f97316' : '#d1d5db' }}>{agent.appointmentCount || 0}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: agent.dealQuotes > 0 ? '#8b5cf6' : '#d1d5db' }}>{agent.dealQuotes || 0}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: agent.dealOrders > 0 ? '#f59e0b' : '#d1d5db' }}>{agent.dealOrders || 0}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                            <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9rem' }}>{agent.resolutionRate}%</span>
                                            <div style={{ height: '3px', background: '#f1f5f9', borderRadius: '2px', width: '40px' }}>
                                                <div style={{ height: '100%', background: '#10b981', borderRadius: '2px', width: `${agent.resolutionRate}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{ fontWeight: 600, color: '#64748b', fontSize: '0.82rem' }}>{agent.avgResponseTime || agent.avgResponseTimeMinutes || 0} dk</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
