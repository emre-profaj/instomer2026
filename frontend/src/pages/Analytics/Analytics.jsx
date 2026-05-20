import React, { useState, useEffect } from 'react';
import { 
    Users, MessageSquare, Bot, Activity, ArrowUpRight, 
    TrendingUp, Calendar, Filter, MoreHorizontal,
    Instagram, Facebook, Mail, Globe, MessageCircle,
    UserCheck, Clock, CheckCircle2, ChevronRight, Zap,
    ClipboardList, Briefcase, Headphones, Truck, Building2, DollarSign, Wallet,
    Phone, PhoneOff, PhoneCall, PhoneForwarded
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

    // Date filter states
    const [dateFilter, setDateFilter] = useState('7d');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [callFilter, setCallFilter] = useState('all'); // all | called | notCalled | completed | planned

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
                {/* Left: AI & Bot Intelligence */}
                <div className="premium-section-card">
                    <div className="section-header-modern">
                        <div className="section-title-modern">
                            <div className="section-icon-box"><Bot size={20} /></div>
                            <h2>Yapay Zeka Karnesi</h2>
                        </div>
                    </div>
                    <div className="ai-perf-container">
                        <div className="ai-primary-metric">
                            <span className="ai-metric-label">Otomasyon Verimliliği</span>
                            <span className="ai-metric-value">
                                {analytics?.totalMessages > 0 
                                    ? ((analytics.totalAiMessages / analytics.totalMessages) * 100).toFixed(1) 
                                    : 0}%
                            </span>
                            <div className="ai-handoff-bar">
                                <div className="handoff-label">
                                    <span>Handoff (Devretme)</span>
                                    <span>{analytics?.handoffRate || 0}%</span>
                                </div>
                                <div className="handoff-track">
                                    <div 
                                        className="handoff-fill" 
                                        style={{ width: `${analytics?.handoffRate || 0}%` }}
                                    />
                                </div>
                                <p style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '8px' }}>
                                    Botun yardıma ihtiyaç duyup aktardığı konuşmaların oranı
                                </p>
                            </div>
                        </div>

                        <div className="ai-secondary-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="flow-item-premium" style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>AI Yanıt</span>
                                    <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>{formatNumber(analytics?.totalAiMessages || 0)}</span>
                                </div>
                            </div>
                            <div className="flow-item-premium" style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>İnsan Yanıt</span>
                                    <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>{formatNumber(analytics?.totalHumanMessages || 0)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="monthly-trend-premium">
                            <span className="stat-label">Aylık Başvuru Trendi</span>
                            <div className="trend-chart-container" style={{ height: '140px', display: 'flex', alignItems: 'flex-end', gap: '8px', paddingTop: '10px' }}>
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
                                        <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#94a3b8', marginTop: '8px' }}>{m.month}</span>
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

            {/* Call Tracking Section */}
            {analytics?.callTrackingStats && (
                <div style={{ padding: '0 0 24px' }}>
                    <div className="premium-section-card">
                        <div className="section-header-modern">
                            <div className="section-title-modern">
                                <div className="section-icon-box"><Phone size={20} /></div>
                                <h2>Numara & Arama Analizi</h2>
                            </div>
                            <select
                                value={callFilter}
                                onChange={(e) => setCallFilter(e.target.value)}
                                className="premium-select"
                                style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                            >
                                <option value="all">Tümü</option>
                                <option value="called">Arananlar</option>
                                <option value="notCalled">Aranmayanlar</option>
                                <option value="completed">Tamamlanan Aramalar</option>
                                <option value="planned">Planlanan Aramalar</option>
                            </select>
                        </div>
                        {/* Stat Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, padding: '0 4px 16px' }}>
                            {[
                                { label: 'Numaralı Kişi', value: analytics.callTrackingStats.totalWithPhone, color: '#6366f1', icon: <Users size={20} /> },
                                { label: 'Aranan', value: analytics.callTrackingStats.totalCalled, color: '#10b981', icon: <PhoneCall size={20} /> },
                                { label: 'Tamamlanan', value: analytics.callTrackingStats.totalCompleted, color: '#0ea5e9', icon: <CheckCircle2 size={20} /> },
                                { label: 'Aranmayan', value: analytics.callTrackingStats.totalNotCalled, color: '#ef4444', icon: <PhoneOff size={20} /> },
                                { label: 'Arama Oranı', value: `${analytics.callTrackingStats.callRate}%`, color: '#f59e0b', icon: <TrendingUp size={20} /> },
                            ].map(item => (
                                <div key={item.label} style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: '12px', background: item.color + '15', color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {item.icon}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>{item.label}</div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Detail Table */}
                        {analytics.callTrackingStats.details.length > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="modern-table" style={{ fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr>
                                            <th>Kişi</th>
                                            <th>Telefon</th>
                                            <th>Toplam</th>
                                            <th>Tamamlanan</th>
                                            <th>Planlanan</th>
                                            <th>Son Arama</th>
                                            <th>Atanan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.callTrackingStats.details
                                            .filter(d => {
                                                if (callFilter === 'called') return d.totalCalls > 0;
                                                if (callFilter === 'completed') return d.completedCalls > 0;
                                                if (callFilter === 'planned') return d.plannedCalls > 0;
                                                return true; // 'all' and 'notCalled' handled differently
                                            })
                                            .map(d => (
                                                <tr key={d.contactId}>
                                                    <td>
                                                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{d.contactName}</div>
                                                    </td>
                                                    <td style={{ color: '#64748b', fontFamily: 'monospace', fontSize: '0.78rem' }}>{d.phone}</td>
                                                    <td>
                                                        <span style={{ fontWeight: 700, color: '#6366f1' }}>{d.totalCalls}</span>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontWeight: 700, color: d.completedCalls > 0 ? '#10b981' : '#9ca3af' }}>
                                                            {d.completedCalls}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontWeight: 700, color: d.plannedCalls > 0 ? '#f59e0b' : '#9ca3af' }}>
                                                            {d.plannedCalls}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: '#64748b', fontSize: '0.76rem' }}>
                                                        {d.lastCallDate ? new Date(d.lastCallDate).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                    </td>
                                                    <td>
                                                        {d.assigneeName ? (
                                                            <span style={{ fontSize: '0.72rem', background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
                                                                {d.assigneeName}
                                                            </span>
                                                        ) : <span style={{ color: '#d1d5db' }}>—</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
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
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th>Temsilci</th>
                                <th>Toplam İşlem</th>
                                <th>Çözümleme</th>
                                <th>Yanıt Süresi</th>
                                <th>Açık Konuşma</th>
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
                                                <span className="agent-role-modern">{agent.isBot ? 'Yapay Zeka' : 'Müşteri Temsilcisi'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="performance-metric">
                                            <span className="metric-top-val">{agent.totalConversations}</span>
                                            <span className="metric-sub-val">Konuşma</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="performance-metric">
                                            <span className="metric-top-val">{agent.resolutionRate}%</span>
                                            <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', width: '60px', marginTop: '6px' }}>
                                                <div style={{ height: '100%', background: '#10b981', borderRadius: '2px', width: `${agent.resolutionRate}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="performance-metric">
                                            <span className="metric-top-val">{agent.avgResponseTime} dk</span>
                                            <span className="metric-sub-val">Ortalama</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="performance-metric">
                                            <span className="metric-top-val">{agent.openConversations ?? '—'}</span>
                                            <span className="metric-sub-val">Aktif</span>
                                        </div>
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
