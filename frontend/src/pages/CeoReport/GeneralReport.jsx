import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, MessageSquare, Phone, PhoneOff, PhoneCall, Calendar,
    TrendingUp, DollarSign, RefreshCw, Filter, ArrowLeft,
    ArrowUpRight, ArrowDownRight, BarChart3, Bot, UserCheck,
    Handshake, ShoppingCart, Sparkles, FileText
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import api from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';

const formatNumber = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString('tr-TR');
};

const IKON_WS = '58840688-d7f4-4cbe-a618-f3a2a94ae3ae';

const GeneralReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [contactStats, setContactStats] = useState(null);
    const [peakHours, setPeakHours] = useState(null);
    const [leadsByForm, setLeadsByForm] = useState(null);
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

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const dateParams = getDateRange();
            const params = { ...dateParams, comparePrevious: true };
            const [analyticsRes, statsRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, params),
                contactAPI.getDailyStats(currentWorkspace.id, dateParams).catch(() => ({ data: null }))
            ]);
            setAnalytics(analyticsRes.data);
            setContactStats(statsRes.data);
            // Try peak hours (may not exist yet)
            try {
                const peakRes = await contactAPI.getPeakHours(currentWorkspace.id, dateParams);
                setPeakHours(peakRes.data);
            } catch (e) { /* endpoint not yet deployed */ }
            // İkon workspace: form bazlı lead tablosu
            if (currentWorkspace.id === IKON_WS) {
                try {
                    const formRes = await api.get(`/leads/${currentWorkspace.id}/by-form`, { params: dateParams });
                    setLeadsByForm(formRes.data);
                } catch (e) { /* ignore */ }
            }
        } catch (err) {
            console.error('General report fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const prev = analytics?.previousPeriod || {};
    const ds = analytics?.dealStats || {};
    const as = analytics?.activityStats || {};
    const ct = analytics?.callTrackingStats || {};
    const channels = analytics?.channelData || [];

    const calcTrend = (current, previous) => {
        if (!previous || previous === 0) return null;
        const pct = ((current - previous) / previous * 100).toFixed(0);
        return { pct: Math.abs(pct), direction: current >= previous ? 'up' : 'down' };
    };

    const TrendBadge = ({ current, previous }) => {
        const trend = calcTrend(current, previous);
        if (!trend) return null;
        return (
            <span className={`kpi-trend ${trend.direction}`}>
                {trend.direction === 'up' ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                %{trend.pct}
            </span>
        );
    };

    const channelColors = { WHATSAPP: '#25D366', INSTAGRAM: '#E1306C', FACEBOOK: '#1877F2', WEB: '#64748b', EMAIL: '#f59e0b', TELEGRAM: '#26A5E4' };
    const channelLabels = { WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', WEB: 'Web Chat', EMAIL: 'E-posta', TELEGRAM: 'Telegram' };
    const totalChannelCount = channels.reduce((s, c) => s + (c.count || 0), 0) || 1;

    const dayLabels = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

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
            <button className="ceo-back-btn" onClick={() => navigate('/general-report')}>
                <ArrowLeft size={16} /> Dashboard
            </button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><BarChart3 size={24} style={{ color: '#6366f1' }} /> Genel Rapor</h1>
                    <p>Tüm metriklerin detaylı görünümü ve dönem karşılaştırması</p>
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

            {/* KPI Cards */}
            <div className="ceo-detail-kpi-grid">
                {[
                    { label: 'Toplam Başvuru', value: analytics?.totalContacts || 0, prev: prev.totalContacts, icon: <Users size={20} />, bg: '#eef2ff', color: '#6366f1' },
                    { label: 'Toplam Mesaj', value: analytics?.totalMessages || 0, prev: prev.totalMessages, icon: <MessageSquare size={20} />, bg: '#f0fdf4', color: '#10b981' },
                    { label: 'Toplam Arama', value: ct.totalCalled || 0, prev: prev.totalCalled, icon: <PhoneCall size={20} />, bg: '#ecfdf5', color: '#059669' },
                    { label: 'Toplam Görüşme', value: as.meetingCount || 0, icon: <Handshake size={20} />, bg: '#eff6ff', color: '#3b82f6' },
                    { label: 'Sipariş Sayısı', value: ds.totalOrders || 0, prev: prev.totalOrders, icon: <ShoppingCart size={20} />, bg: '#eff6ff', color: '#3b82f6', sub: `₺${formatNumber(ds.orderAmount || 0)}` },
                    { label: 'Satış (₺)', value: ds.orderAmount || 0, prev: prev.orderAmount, icon: <DollarSign size={20} />, bg: '#ecfdf5', color: '#059669', isCurrency: true },
                    { label: 'Aktivite', value: as.totalActivities || 0, prev: prev.totalActivities, icon: <TrendingUp size={20} />, bg: '#fef3c7', color: '#d97706' },
                    { label: 'Randevu', value: analytics?.appointmentStats?.total || 0, icon: <Calendar size={20} />, bg: '#f0fdf4', color: '#10b981' },
                ].map(item => (
                    <div key={item.label} className="ceo-detail-kpi-card" style={{ '--accent': item.color }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${item.color}, ${item.color}88)` }} />
                        <div className="kpi-icon-wrap" style={{ background: item.bg, color: item.color }}>{item.icon}</div>
                        <div className="kpi-label">{item.label}</div>
                        <div className="kpi-value" style={{ color: item.isCurrency ? '#059669' : undefined }}>
                            {item.isCurrency ? `₺${formatNumber(item.value)}` : formatNumber(item.value)}
                        </div>
                        {item.sub && <div className="kpi-sub">{item.sub}</div>}
                        <TrendBadge current={item.value} previous={item.prev} />
                    </div>
                ))}
            </div>

            {/* Channel Distribution */}
            {channels.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><MessageSquare size={18} /></div>
                        <h2>Kanal Dağılımı</h2>
                    </div>
                    <div className="ceo-section-body">
                        {[...channels].sort((a, b) => (b.count || 0) - (a.count || 0)).map(ch => {
                            const pct = ((ch.count / totalChannelCount) * 100).toFixed(0);
                            const color = channelColors[ch.channel] || '#94a3b8';
                            return (
                                <div key={ch.channel} className="ceo-channel-bar">
                                    <div className="ceo-channel-icon" style={{ background: color + '18', color }}><MessageSquare size={16} /></div>
                                    <span className="ceo-channel-label">{channelLabels[ch.channel] || ch.channel}</span>
                                    <span className="ceo-channel-count">{ch.count}</span>
                                    <div className="ceo-channel-bar-wrap">
                                        <div className="ceo-channel-bar-bg">
                                            <div className="ceo-channel-bar-fill" style={{ width: `${pct}%`, background: color }} />
                                        </div>
                                        <span className="ceo-channel-pct">{pct}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Daily Chart */}
            {contactStats?.dailyStats?.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon"><BarChart3 size={18} /></div>
                        <h2>Günlük Gelen Kişi Sayısı</h2>
                    </div>
                    <div className="ceo-section-body">
                        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                            {dateFilterOptions.map(l => (
                                <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 10, height: 3, background: l.color, borderRadius: 2 }}></span>
                                    <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{l.label}</span>
                                </span>
                            ))}
                        </div>
                        {(() => {
                            const stats = contactStats.dailyStats;
                            const maxVal = Math.max(...stats.map(s => s.total), 1);
                            const w = 900, h = 200, padL = 40, padR = 10, padT = 10, padB = 30;
                            const chartW = w - padL - padR, chartH = h - padT - padB;
                            const stepX = chartW / Math.max(stats.length - 1, 1);
                            const makeLine = (key) => stats.map((s, i) => { const x = padL + i * stepX; const y = padT + chartH - (s[key] / maxVal) * chartH; return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
                            const makeArea = (key) => { const line = stats.map((s, i) => { const x = padL + i * stepX; const y = padT + chartH - (s[key] / maxVal) * chartH; return `${x.toFixed(1)},${y.toFixed(1)}`; }); return `M${padL},${padT + chartH} L${line.join(' L')} L${padL + (stats.length - 1) * stepX},${padT + chartH} Z`; };
                            const ySteps = 4;
                            const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => Math.round(maxVal * i / ySteps));
                            const showEvery = stats.length > 30 ? 7 : stats.length > 14 ? 3 : 2;
                            return (
                                <div style={{ overflowX: 'auto' }}>
                                    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', maxHeight: '260px' }}>
                                        {yLabels.map((val, i) => { const y = padT + chartH - (val / maxVal) * chartH; return (<g key={i}><line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#f1f5f9" strokeWidth="0.5" /><text x={padL - 5} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="8">{val}</text></g>); })}
                                        <path d={makeArea('total')} fill="#6366f120" />
                                        <path d={makeArea('withPhone')} fill="#10b98115" />
                                        <path d={makeLine('total')} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d={makeLine('withPhone')} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,2" />
                                        <path d={makeLine('withoutPhone')} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="2,2" />
                                        {stats.map((s, i) => { const x = padL + i * stepX; const yTotal = padT + chartH - (s.total / maxVal) * chartH; return (<g key={i}><circle cx={x} cy={yTotal} r="2.5" fill="#6366f1" /><title>{`${s.date}\nToplam: ${s.total}\nTelefonlu: ${s.withPhone}\nTelefonsuz: ${s.withoutPhone}`}</title>{i % showEvery === 0 && (<text x={x} y={h - 5} textAnchor="middle" fill="#94a3b8" fontSize="7">{s.date.slice(5)}</text>)}</g>); })}
                                    </svg>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Peak Hours Heatmap */}
            {peakHours?.heatmap && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Calendar size={18} /></div>
                        <h2>Yoğun Saatler</h2>
                    </div>
                    <div className="ceo-section-body">
                        <div className="ceo-heatmap">
                            <table>
                                <thead>
                                    <tr>
                                        <th></th>
                                        {Array.from({ length: 24 }, (_, i) => <th key={i}>{String(i).padStart(2, '0')}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[1, 2, 3, 4, 5, 6, 0].map(dayIdx => {
                                        const maxHeat = Math.max(...peakHours.heatmap.flat(), 1);
                                        return (
                                            <tr key={dayIdx}>
                                                <th className="day-label">{dayLabels[dayIdx]}</th>
                                                {peakHours.heatmap[dayIdx].map((val, hr) => {
                                                    const intensity = val / maxHeat;
                                                    const bg = intensity === 0 ? '#f8fafc' : `rgba(99,102,241,${0.15 + intensity * 0.85})`;
                                                    return <td key={hr} className="heat-cell" style={{ background: bg }} title={`${dayLabels[dayIdx]} ${hr}:00 — ${val} kişi`}>{val > 0 ? val : ''}</td>;
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Bot vs Human */}
            {(analytics?.totalAiMessages > 0 || analytics?.totalHumanMessages > 0) && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><Bot size={18} /></div>
                        <h2>Bot vs İnsan</h2>
                    </div>
                    <div className="ceo-section-body">
                        <div className="ceo-bot-human-grid">
                            <div className="ceo-bot-human-card" style={{ background: '#f5f3ff' }}>
                                <div className="bh-value" style={{ color: '#7c3aed' }}>{formatNumber(analytics.totalAiMessages || 0)}</div>
                                <div className="bh-label" style={{ color: '#8b5cf6' }}>AI Mesaj</div>
                            </div>
                            <div className="ceo-bot-human-card" style={{ background: '#eff6ff' }}>
                                <div className="bh-value" style={{ color: '#2563eb' }}>{formatNumber(analytics.totalHumanMessages || 0)}</div>
                                <div className="bh-label" style={{ color: '#3b82f6' }}>İnsan Mesaj</div>
                            </div>
                            <div className="ceo-bot-human-card" style={{ background: '#ecfdf5' }}>
                                <div className="bh-value" style={{ color: '#059669' }}>{formatNumber(analytics.botLedConversations || 0)}</div>
                                <div className="bh-label" style={{ color: '#10b981' }}>Bot Yönetimli</div>
                            </div>
                            <div className="ceo-bot-human-card" style={{ background: '#fef3c7' }}>
                                <div className="bh-value" style={{ color: '#d97706' }}>{analytics.handoffRate || 0}%</div>
                                <div className="bh-label" style={{ color: '#b45309' }}>Devir Oranı</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── İkon Projeler Facebook Lead Tablosu (sadece bu workspace) ── */}
            {currentWorkspace?.id === IKON_WS && leadsByForm && (
                <div style={{ margin: '24px 0' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        marginBottom: 16
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', flexShrink: 0
                        }}>
                            <FileText size={18} />
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                                Facebook Lead Formu Bazlı Dağılım
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                                Toplam {leadsByForm.total?.toLocaleString('tr-TR')} lead — form adına göre gruplandırılmış
                            </div>
                        </div>
                    </div>
                    <div style={{
                        background: '#fff',
                        border: '1.5px solid #e5e7eb',
                        borderRadius: 14,
                        overflow: 'hidden',
                        boxShadow: '0 1px 4px rgba(0,0,0,.05)'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e5e7eb' }}>
                                    <th style={{ padding: '11px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>#</th>
                                    <th style={{ padding: '11px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Form Adı</th>
                                    <th style={{ padding: '11px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Kampanya</th>
                                    <th style={{ padding: '11px 18px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Lead Sayısı</th>
                                    <th style={{ padding: '11px 18px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Pay</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leadsByForm.byForm.map((row, i) => {
                                    const pct = leadsByForm.total > 0
                                        ? ((row.count / leadsByForm.total) * 100).toFixed(1)
                                        : 0;
                                    const colors = ['#6366f1','#8b5cf6','#f97316','#22c55e','#3b82f6','#ec4899'];
                                    const color = colors[i % colors.length];
                                    return (
                                        <tr key={i} style={{
                                            borderBottom: i < leadsByForm.byForm.length - 1 ? '1px solid #f3f4f6' : 'none',
                                            transition: 'background .1s'
                                        }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '13px 18px', fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>{i + 1}</td>
                                            <td style={{ padding: '13px 18px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{
                                                        width: 8, height: 8, borderRadius: '50%',
                                                        background: color, flexShrink: 0
                                                    }} />
                                                    <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{row.formName}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '13px 18px', fontSize: 13, color: '#6b7280' }}>
                                                {row.campaignName || <span style={{ color: '#d1d5db' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '13px 18px', textAlign: 'right' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    background: color + '18',
                                                    color: color,
                                                    borderRadius: 7,
                                                    padding: '3px 10px',
                                                    fontWeight: 700,
                                                    fontSize: 14
                                                }}>{row.count.toLocaleString('tr-TR')}</span>
                                            </td>
                                            <td style={{ padding: '13px 18px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                                    <div style={{
                                                        width: 80, height: 6, background: '#f3f4f6',
                                                        borderRadius: 99, overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            width: pct + '%', height: '100%',
                                                            background: color, borderRadius: 99
                                                        }} />
                                                    </div>
                                                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, minWidth: 36 }}>{pct}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: '#f8fafc', borderTop: '1.5px solid #e5e7eb' }}>
                                    <td colSpan={3} style={{ padding: '11px 18px', fontSize: 13, fontWeight: 700, color: '#374151' }}>Toplam</td>
                                    <td style={{ padding: '11px 18px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#6366f1' }}>
                                        {leadsByForm.total?.toLocaleString('tr-TR')}
                                    </td>
                                    <td style={{ padding: '11px 18px', textAlign: 'right', fontSize: 13, color: '#374151', fontWeight: 700 }}>100%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GeneralReport;
