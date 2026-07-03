import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Phone, PhoneCall, PhoneOff, Users, RefreshCw, Filter, ArrowLeft,
    TrendingUp, Handshake, Calendar, ListChecks, MessageSquare,
    UserCheck, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';

const formatNumber = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString('tr-TR');
};

const ActivityReport = () => {
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

    const getDateRange = () => {
        return getDateRangeLogic(dateFilter, startDate, endDate);
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const as = analytics?.activityStats || {};
    const ct = analytics?.callTrackingStats || {};
    const appt = analytics?.appointmentStats || {};
    const meet = analytics?.meetingStats || {};
    const numarali = contactStats?.totals?.withPhone || ct.totalWithPhone || 0;
    const kaciArandi = ct.totalCalled || 0;
    const toplamArama = ct.totalCompleted || 0;
    const aranmayan = Math.max(0, numarali - kaciArandi);
    const aramaOrani = numarali > 0 ? ((kaciArandi / numarali) * 100).toFixed(1) : 0;

    if (loading && !analytics) {
        return (
            <div className="ceo-report" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                    <p>Yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="ceo-report">
            <button className="ceo-back-btn" onClick={() => navigate('/general-report')}><ArrowLeft size={16} /> Dashboard</button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><Phone size={24} style={{ color: '#059669' }} /> Aktivite & Arama Raporu</h1>
                    <p>Arama, görüşme, randevu ve aktivite detayları</p>
                </div>
                <button className="ceo-refresh-btn" onClick={fetchData}><RefreshCw size={14} /> Güncelle</button>
            </div>

            {/* Filters */}
            <div className="ceo-filter-bar">
                <div className="ceo-filter-left">
                    <div className="ceo-filter-label"><Filter size={14} /><span>Filtreler</span></div>
                    <div className="ceo-pill-group">
                        {dateFilterOptions.map(item => (
                            <button key={item.key} className={`ceo-pill${dateFilter === item.key ? ' active' : ''}`} onClick={() => setDateFilter(item.key)}>{item.label}</button>
                        ))}
                    </div>
                    {dateFilter === 'custom' && (
                        <div className="ceo-custom-dates">
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="ceo-date-input" />
                            <span style={{ color: '#9ca3af' }}>—</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="ceo-date-input" />
                        </div>
                    )}
                </div>
            </div>

            {/* Call Summary KPI */}
            <div className="ceo-detail-kpi-grid">
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #6366f1, #6366f188)' }} /><div className="kpi-icon-wrap" style={{ background: '#eef2ff', color: '#6366f1' }}><Users size={20} /></div><div className="kpi-label">Numaralı Başvuru</div><div className="kpi-value">{formatNumber(numarali)}</div><div className="kpi-sub">Telefon numarası olan</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #10b981, #10b98188)' }} /><div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}><Phone size={20} /></div><div className="kpi-label">Kaçı Arandı</div><div className="kpi-value">{formatNumber(kaciArandi)}</div><div className="kpi-sub">Benzersiz kişi</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #059669, #05966988)' }} /><div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}><PhoneCall size={20} /></div><div className="kpi-label">Toplam Arama</div><div className="kpi-value">{formatNumber(toplamArama)}</div><div className="kpi-sub">Yapılan arama sayısı</div></div>
                <div className="ceo-detail-kpi-card clickable" onClick={() => navigate('/call-analytics')}><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #ef4444, #ef444488)' }} /><div className="kpi-icon-wrap" style={{ background: '#fef2f2', color: '#ef4444' }}><PhoneOff size={20} /></div><div className="kpi-label">Aranmayan 🔴</div><div className="kpi-value" style={{ color: '#ef4444' }}>{formatNumber(aranmayan)}</div><div className="kpi-sub">Tıklayın → detay rapor</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #6366f1, #6366f188)' }} /><div className="kpi-icon-wrap" style={{ background: '#eef2ff', color: '#6366f1' }}><TrendingUp size={20} /></div><div className="kpi-label">Arama Oranı</div><div className="kpi-value">%{aramaOrani}</div><div className="kpi-sub">Aranan / Numaralı</div></div>
            </div>

            {/* Agent Call Leaderboard */}
            {agentPerformance?.agents?.filter(a => (a.callCount || 0) > 0).length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><UserCheck size={18} /></div>
                        <h2>Arama Lider Tablosu</h2>
                    </div>
                    <div className="ceo-section-body">
                        {agentPerformance.agents
                            .filter(a => (a.callCount || 0) > 0)
                            .sort((a, b) => (b.callCount || 0) - (a.callCount || 0))
                            .map((agent, idx) => {
                                const totalCalls = agentPerformance.agents.reduce((s, a) => s + (a.callCount || 0), 0) || 1;
                                const pct = ((agent.callCount / totalCalls) * 100).toFixed(0);
                                return (
                                    <div key={agent.userId || idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: idx === 0 ? '#eff6ff' : '#f8fafc', border: idx === 0 ? '1px solid #bfdbfe' : '1px solid #f1f5f9', marginBottom: 6 }}>
                                        <div className={`medal-badge ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'default'}`}>{idx + 1}</div>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', flex: 1 }}>{agent.name}</span>
                                        <span style={{ fontWeight: 800, fontSize: '1.05rem', color: idx === 0 ? '#3b82f6' : '#475569' }}>{agent.callCount}</span>
                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>arama ({pct}%)</span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* Activity Distribution */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon" style={{ background: '#fef3c7', color: '#d97706' }}><ListChecks size={18} /></div>
                    <h2>Aktivite Dağılımı</h2>
                </div>
                <div className="ceo-section-body">
                    <div className="ceo-mini-grid cols-4" style={{ marginBottom: 16 }}>
                        <div className="ceo-mini-card" style={{ background: '#eff6ff' }}><div className="mini-value" style={{ color: '#1d4ed8' }}>{as.plannedCount || 0}</div><div className="mini-label" style={{ color: '#3b82f6' }}>Bekleyen</div></div>
                        <div className="ceo-mini-card" style={{ background: '#f0fdf4' }}><div className="mini-value" style={{ color: '#16a34a' }}>{as.completedCount || 0}</div><div className="mini-label" style={{ color: '#059669' }}>Tamamlanan</div></div>
                        <div className="ceo-mini-card" style={{ background: '#fffbeb' }}><div className="mini-value" style={{ color: '#d97706' }}>{as.inProgressCount || 0}</div><div className="mini-label" style={{ color: '#b45309' }}>Devam Eden</div></div>
                        <div className="ceo-mini-card" style={{ background: '#fef2f2' }}><div className="mini-value" style={{ color: '#dc2626' }}>{as.overdueCount || 0}</div><div className="mini-label" style={{ color: '#dc2626' }}>Gecikmiş</div></div>
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

            {/* Meeting & Appointment */}
            {((appt.total || 0) > 0 || (meet.total || 0) > 0) && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#f0fdf4', color: '#10b981' }}><Calendar size={18} /></div>
                        <h2>Görüşme & Randevu</h2>
                    </div>
                    <div className="ceo-section-body">
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Handshake size={15} style={{ color: '#6366f1' }} /> Görüşmeler <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>({meet.total || 0} toplam)</span></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                {dateFilterOptions.map(item => (
                                    <div key={item.label} style={{ background: '#f8fafc', padding: '14px 12px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f1f5f9' }}>
                                        <div style={{ fontSize: 20 }}>{item.icon}</div>
                                        <div><div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b' }}>{item.label}</div><div style={{ fontSize: '1.3rem', fontWeight: 800, color: item.color }}>{item.value || 0}</div></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={15} style={{ color: '#0ea5e9' }} /> Randevular <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>({appt.total || 0} toplam)</span></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                {dateFilterOptions.map(item => (
                                    <div key={item.label} style={{ background: '#f8fafc', padding: '14px 12px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f1f5f9' }}>
                                        <div style={{ fontSize: 20 }}>{item.icon}</div>
                                        <div><div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b' }}>{item.label}</div><div style={{ fontSize: '1.3rem', fontWeight: 800, color: item.color }}>{item.value || 0}</div></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Agent breakdown */}
                        {agentPerformance?.agents?.filter(a => (a.appointmentCount || 0) > 0 || (a.meetingCount || 0) > 0).length > 0 && (
                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                                <div className="ceo-label">Temsilci Bazlı</div>
                                {agentPerformance.agents.filter(a => (a.appointmentCount || 0) > 0 || (a.meetingCount || 0) > 0).sort((a, b) => ((b.appointmentCount || 0) + (b.meetingCount || 0)) - ((a.appointmentCount || 0) + (a.meetingCount || 0))).map((agent, idx) => (
                                    <div key={agent.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: idx === 0 ? '#eff6ff' : '#f8fafc', border: idx === 0 ? '1px solid #bfdbfe' : '1px solid #f1f5f9', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className={`medal-badge ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'default'}`}>{idx + 1}</div>
                                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{agent.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Handshake size={13} style={{ color: '#6366f1' }} /><span style={{ fontSize: '1rem', fontWeight: 800, color: '#6366f1' }}>{agent.meetingCount || 0}</span><span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>görüşme</span></div>
                                            <div style={{ width: 1, height: 18, background: '#e2e8f0' }} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={13} style={{ color: '#0ea5e9' }} /><span style={{ fontSize: '1rem', fontWeight: 800, color: '#0ea5e9' }}>{agent.appointmentCount || 0}</span><span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>randevu</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActivityReport;
