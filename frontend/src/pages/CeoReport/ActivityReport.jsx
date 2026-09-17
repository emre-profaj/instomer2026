/**
 * ═══════════════════════════════════════════════════════════════
 * AKTİVİTE RAPORU
 * ═══════════════════════════════════════════════════════════════
 *
 * Bu sayfa liste değil, diğer rapor sayfalarına açılan KAPI. Bu yüzden
 * ortak tasarım dilini (reportDesign.css) kullanır ama düzeni onlardan
 * farklıdır: hero + kapı kartları + özet şeritler.
 *
 * HUNİ ÇİZİLMEDİ — bilerek. "Numaralı → arandı" gerçek bir dönüşüm;
 * ama randevu görüşmenin devamı DEĞİL (Metropol Eylül 2026: 13 görüşme,
 * 263 randevu — randevuların çoğunu bot veriyor). Zincir iki adımda
 * kesiliyor, gerisi yan yana çıktı olarak duruyor.
 *
 * Görüşme/randevu dökümü burada tek şeride indirildi: ayrıntıyı artık
 * kendi detay sayfaları gösteriyor, aynı sayı iki yerde tam boy
 * tekrarlanmıyor.
 *
 * DİKKAT: backend'de `overdue` ayrı sayılıyor, planned/completed/
 * cancelled ile TOPLANMIYOR (dueDate'i geçmiş planlıların alt kümesi).
 * Bu yüzden şeride katılmıyor, ayrı gösteriliyor. Şeritteki "Diğer",
 * hiçbir kovaya girmeyen durumları (ör. SCHEDULED) açığa çıkarır.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, FileText, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../Analytics/reportDesign.css';
import './ActivityReport.css';

const TZ = 'Europe/Istanbul';
const trShort = (d) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' }).format(d);
const tr = (n) => Number(n || 0).toLocaleString('tr-TR');
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const ActivityReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [contactStats, setContactStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const dateParams = getDateRangeLogic(dateFilter, startDate, endDate);
            const params = { ...dateParams, comparePrevious: true };
            const [analyticsRes, performanceRes, dailyStatsRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, params),
                contactAPI.getAgentPerformance(currentWorkspace.id, params),
                contactAPI.getDailyStats(currentWorkspace.id, dateParams).catch(e => {
                    console.warn('Daily stats failed:', e.message);
                    return { data: null };
                }),
            ]);
            setAnalytics(analyticsRes.data);
            setAgentPerformance(performanceRes.data);
            if (dailyStatsRes?.data) setContactStats(dailyStatsRes.data);
        } catch (error) {
            console.error('Error fetching activity report:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

    const as = analytics?.activityStats || {};
    const ct = analytics?.callTrackingStats || {};
    const appt = analytics?.appointmentStats || {};
    const meet = analytics?.meetingStats || {};

    const withPhone = contactStats?.totals?.withPhone || ct.totalWithPhone || 0;
    const called = ct.totalCalled || 0;
    const notCalled = Math.max(0, withPhone - called);
    const calledPct = withPhone ? (called / withPhone) * 100 : 0;

    const chart = useMemo(() => {
        const rows = contactStats?.dailyStats || [];
        const buckets = rows
            .map(r => ({ key: r.date, date: new Date(`${r.date}T12:00:00Z`), count: r.total || 0 }))
            .filter(b => !isNaN(b.date));
        return { buckets, peak: buckets.length ? Math.max(...buckets.map(b => b.count)) : 0 };
    }, [contactStats]);

    const doors = [
        { label: 'Arama', value: ct.totalCallCount ?? ct.totalCompleted ?? 0, sub: 'temsilci araması', to: '/call-analytics' },
        { label: 'Görüşme', value: meet.total || 0, sub: 'yüz yüze / toplantı', to: '/meeting-analytics' },
        { label: 'Randevu', value: appt.total || 0, sub: 'takvim randevusu', to: '/appointment-analytics' },
        { label: 'AI Araması', value: analytics?.aiCallStats?.totalCount || 0, sub: 'sesli asistan', to: '/ai-call-analytics' },
        { label: 'Ziyaret', value: as.visitCount || 0, sub: 'kayıtlı ziyaret' },
    ];

    const statusCells = [
        { label: 'Bekleyen', dot: '#f59e0b', value: as.plannedCount || 0, sub: 'henüz yapılmadı' },
        { label: 'Tamamlanan', dot: '#10b981', value: as.completedCount || 0, sub: 'kapatıldı' },
        { label: 'Devam Eden', dot: '#0ea5e9', value: as.inProgressCount || 0, sub: 'sürüyor' },
        { label: 'Gecikmiş', dot: '#ef4444', value: as.overdueCount || 0, sub: 'tarihi geçti' },
    ];

    const totalAct = as.totalActivities || 0;
    const types = [
        { label: 'Arama', count: as.callCount || 0, color: '#ef4444' },
        { label: 'Görüşme', count: as.meetingCount || 0, color: '#6366f1' },
        { label: 'Görev', count: as.taskCount || 0, color: '#10b981' },
        { label: 'Not', count: as.noteCount || 0, color: '#94a3b8' },
    ].filter(t => t.count > 0).sort((a, b) => b.count - a.count);

    /** Segmentli şerit — overdue KATILMAZ (alt küme), kalan "Diğer" olur. */
    const bandOf = (s, plannedKey, plannedLabel) => {
        const total = s.total || 0;
        const planned = s[plannedKey] || 0;
        const completed = s.completed || 0;
        const cancelled = s.cancelled || 0;
        const other = Math.max(0, total - planned - completed - cancelled);
        const segs = [
            { label: plannedLabel, value: planned, color: '#f59e0b' },
            { label: 'Tamamlandı', value: completed, color: '#10b981' },
            { label: 'İptal', value: cancelled, color: '#94a3b8' },
            { label: 'Diğer', value: other, color: '#cbd5e1' },
        ].filter(x => x.value > 0);
        return { total, segs, overdue: s.overdue || 0 };
    };

    const agents = useMemo(
        () => (agentPerformance?.agents || [])
            .filter(a => (a.callCount || 0) > 0)
            .sort((a, b) => (b.callCount || 0) - (a.callCount || 0)),
        [agentPerformance]
    );
    const agentTotal = agents.reduce((s, a) => s + (a.callCount || 0), 0);
    const agentMax = agents.length ? agents[0].callCount : 1;

    if (loading && !analytics) {
        return (
            <div className="ra-page">
                <div className="ra-loading">
                    <RefreshCw className="ra-spin" size={30} />
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Aktivite Raporu yükleniyor…</p>
                </div>
            </div>
        );
    }

    const renderBand = (title, band, to) => (
        <div className="ra-mini">
            <div className="ra-mini-head">
                <span className="ra-mini-title">{title}</span>
                <span className="ra-mini-total">{tr(band.total)} toplam</span>
                <button className="ra-mini-link" onClick={() => navigate(to)}>detay →</button>
            </div>
            {band.total > 0 ? (
                <>
                    <div className="ra-bar">
                        {band.segs.map(s => (
                            <span key={s.label} style={{ width: `${(s.value / band.total) * 100}%`, background: s.color }}
                                title={`${s.label}: ${s.value}`} />
                        ))}
                    </div>
                    <div className="ra-legend" style={{ marginTop: 11 }}>
                        {band.segs.map(s => (
                            <div className="ra-legend-item" key={s.label}>
                                <i className="ra-dot" style={{ background: s.color }} />
                                <span className="ra-legend-text">{s.label}</span>
                                <span className="ra-legend-count">{tr(s.value)}</span>
                            </div>
                        ))}
                        {band.overdue > 0 && (
                            <div className="ra-legend-item" style={{ color: '#b91c1c' }}>
                                <AlertTriangle size={12} />
                                <span className="ra-legend-text" style={{ color: '#b91c1c' }}>tarihi geçmiş</span>
                                <span className="ra-legend-count" style={{ color: '#b91c1c' }}>{tr(band.overdue)}</span>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="ra-bar" />
            )}
        </div>
    );

    return (
        <div className="ra-page">
            <div className="ra-wrap">

                <div className="ra-head">
                    <div>
                        <div className="ra-eyebrow">Raporlar</div>
                        <h1>Aktivite Raporu</h1>
                        <p>Arama, görüşme, randevu ve temsilci etkinliğinin dönem özeti</p>
                    </div>
                    <div className="ra-head-actions">
                        <button className="ra-btn" onClick={fetchData} disabled={loading}>
                            <RefreshCw className={loading ? 'ra-spin' : ''} size={14} /> Güncelle
                        </button>
                        <button className="ra-btn ra-btn-primary" onClick={() => window.print()}>
                            <FileText size={14} /> Raporu İndir
                        </button>
                    </div>
                </div>

                <div className="ra-filters">
                    <div className="ra-pills">
                        {dateFilterOptions.map(o => (
                            <button key={o.key} className={`ra-pill${dateFilter === o.key ? ' active' : ''}`}
                                onClick={() => setDateFilter(o.key)}>{o.label}</button>
                        ))}
                    </div>
                    {dateFilter === 'custom' && (
                        <div className="ra-dates">
                            <input type="date" className="ra-date-input" value={startDate}
                                onChange={e => setStartDate(e.target.value)} />
                            <span style={{ color: '#cbd5e1' }}>—</span>
                            <input type="date" className="ra-date-input" value={endDate}
                                onChange={e => setEndDate(e.target.value)} />
                        </div>
                    )}
                </div>

                <div className="ra-surface ra-hero">
                    <div className="ra-hero-left">
                        <div className="ra-metric-label">Numaralı Başvuru</div>
                        <div className="ra-metric-value">{tr(withPhone)}</div>
                        <div className="ra-metric-note">Ulaşılabilir kişi havuzu</div>
                        <div className="ra-split">
                            <div className="ra-split-bar">
                                <i style={{ width: `${calledPct}%`, background: 'var(--accent)' }} title={`Arandı: ${called}`} />
                                <i style={{ width: `${100 - calledPct}%`, background: '#cbd5e1' }} title={`Aranmadı: ${notCalled}`} />
                            </div>
                            <div className="ra-split-legend">
                                <div className="ra-split-item">Arandı<b>{tr(called)} <span style={{ fontSize: '.72rem', color: '#94a3b8', fontWeight: 600 }}>%{Math.round(calledPct)}</span></b></div>
                                <div className="ra-split-item" style={{ textAlign: 'right' }}>Aranmadı<b>{tr(notCalled)}</b></div>
                            </div>
                        </div>
                    </div>

                    <div className="ra-hero-right">
                        <div className="ra-chart-head">
                            <span className="ra-chart-title">Günlük yeni başvuru</span>
                            {chart.peak > 0 && <span className="ra-chart-peak">en yoğun: {tr(chart.peak)} kişi</span>}
                        </div>
                        {chart.buckets.length > 0 ? (
                            <>
                                <div className="ra-chart">
                                    {chart.buckets.map(b => (
                                        <div key={b.key} className="ra-col" title={`${trShort(b.date)} · ${b.count} başvuru`}>
                                            <i style={{ height: `${chart.peak ? Math.max(3, (b.count / chart.peak) * 100) : 3}%` }} />
                                        </div>
                                    ))}
                                </div>
                                <div className="ra-chart-axis">
                                    <span>{trShort(chart.buckets[0].date)}</span>
                                    <span>{trShort(chart.buckets[chart.buckets.length - 1].date)}</span>
                                </div>
                            </>
                        ) : <div className="ra-chart" />}
                    </div>
                </div>

                <div className="ra-doors">
                    {doors.map(d => (
                        <button key={d.label} type="button"
                            className={`ra-door${d.to ? '' : ' ra-door-flat'}`}
                            onClick={d.to ? () => navigate(d.to) : undefined}>
                            <div className="ra-door-top">
                                <span className="ra-door-label">{d.label}</span>
                                <span className="ra-door-arrow"><ArrowRight size={17} /></span>
                            </div>
                            <div className="ra-door-value">{tr(d.value)}</div>
                            <div className="ra-door-sub">{d.sub}</div>
                        </button>
                    ))}
                </div>

                <div className="ra-surface ra-strip" style={{ marginBottom: 22 }}>
                    {statusCells.map(c => (
                        <div className="ra-cell" key={c.label}>
                            <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: c.dot }} />{c.label}</div>
                            <div className="ra-cell-value">{tr(c.value)}</div>
                            <div className="ra-cell-sub">{c.sub}</div>
                        </div>
                    ))}
                </div>

                {types.length > 0 && (
                    <div className="ra-surface" style={{ marginBottom: 22 }}>
                        <div className="ra-section-head"><h2>Aktivite Tipleri</h2><span>{tr(totalAct)} kayıt</span></div>
                        <div className="ra-section-body">
                            {types.map(t => {
                                const p = totalAct ? (t.count / totalAct) * 100 : 0;
                                return (
                                    <div className="ra-typerow" key={t.label}>
                                        <span className="lbl">{t.label}</span>
                                        <span className="num">{tr(t.count)}</span>
                                        <div className="bar"><i style={{ width: `${p}%`, background: t.color }} /></div>
                                        <span className="pct">%{Math.round(p)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {((meet.total || 0) > 0 || (appt.total || 0) > 0) && (
                    <div className="ra-surface" style={{ marginBottom: 22 }}>
                        <div className="ra-section-head"><h2>Görüşme &amp; Randevu</h2><span>ayrıntı detay sayfalarında</span></div>
                        <div className="ra-section-body">
                            {renderBand('Görüşmeler', bandOf(meet, 'planned', 'Bekliyor'), '/meeting-analytics')}
                            {renderBand('Randevular', bandOf(appt, 'scheduled', 'Planlandı'), '/appointment-analytics')}
                        </div>
                    </div>
                )}

                {agents.length > 0 && (
                    <div className="ra-surface">
                        <div className="ra-section-head">
                            <h2>Arama Lider Tablosu</h2>
                            <span>{tr(agents.length)} temsilci · {tr(agentTotal)} arama</span>
                        </div>
                        <div className="ra-section-body">
                            {agents.map((a, i) => (
                                <div className="ra-rank" key={a.userId || i}>
                                    <span className={`ra-rank-no${i < 3 ? ' top' : ''}`}>{i + 1}</span>
                                    <span className="ra-rank-name">{a.name}</span>
                                    <div className="ra-rank-bar">
                                        <i style={{ width: `${agentMax ? (a.callCount / agentMax) * 100 : 0}%` }} />
                                    </div>
                                    <span className="ra-rank-val">{tr(a.callCount)}</span>
                                    <span className="ra-rank-pct">%{pctOf(a.callCount, agentTotal)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default ActivityReport;
