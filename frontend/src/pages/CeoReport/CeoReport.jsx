/**
 * ═══════════════════════════════════════════════════════════════
 * GENEL RAPOR (Dashboard)
 * ═══════════════════════════════════════════════════════════════
 *
 * Diğer sekiz rapor sayfası "yüzey + satır" düzenine geçti; bu sayfa
 * GEÇMEDİ — bilerek. O sayfalar rapor, bu bir gösterge paneli: kendi
 * SVG grafikleri (günlük/aylık trend, ısı haritası), dönem
 * karşılaştırması ve akış filtresi yalnızca burada var. Panel ızgarası
 * korundu, paneller ortak yüzey diline taşındı.
 *
 * TREND ROZETLERİ VE KISMİ DÖNEM:
 * Backend "önceki dönem"i takvim ayı olarak veriyor. Ayın 17'sinde
 * "Bu Ay" seçiliyken yarım Eylül, tam Ağustos'la karşılaştırılıyor ve
 * Başvuru −%85 gibi gerçek olmayan düşüşler çıkıyor. Doğru çözüm
 * backend'de önceki dönemi aynı uzunlukta kesmek; o yapılana kadar
 * rozetler GİZLENMİYOR ama dönem tamamlanmamışsa işaretleniyor ve
 * sayfanın üstünde bir not çıkıyor. Yanlış sayıyı sessizce göstermek
 * en kötü seçenekti.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    RefreshCw, FileText, ArrowRight, ArrowUpRight, ArrowDownRight, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api, { contactAPI, funnelAPI } from '../../services/api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../Analytics/reportDesign.css';
import './CeoDashboard.css';

/** Yalnızca bu çalışma alanında Facebook lead dağılımı gösterilir. */
const IKON_WS = '58840688-d7f4-4cbe-a618-f3a2a94ae3ae';

const tr = (n) => Number(n || 0).toLocaleString('tr-TR');
const money = (n) => Number(n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const TZ = 'Europe/Istanbul';
const dShort = (s) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(`${s}T12:00:00Z`));
const dayMon = (s) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: 'short' }).format(new Date(s));
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const CHANNELS = {
    WIDGET: 'Web Sohbeti', PHONE: 'Telefon', WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram',
    FACEBOOK: 'Facebook', FACEBOOK_COMMENT: 'Facebook Yorum', FORM: 'Web Formu',
    MANUAL: 'Manuel', WALK_IN: 'Yüz Yüze', SYSTEM: 'Sistem', EMAIL: 'E-posta', LEAD: 'Lead Formu',
};
const chName = (c) => CHANNELS[c] || c;
const BAR_COLORS = ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#6366f1', '#a78bfa', '#cbd5e1'];
const STATUS_TR = { NEW: 'Yeni', OPPORTUNITY: 'Fırsat', HOT_OPPORTUNITY: 'Sıcak Fırsat', MEETING_PLANNED: 'Toplantı', PROPOSAL: 'Teklif', CONVERTED: 'Satış', CUSTOMER: 'Müşteri', LOST: 'Kayıp' };
const STAGE_TR = { QUOTE: 'Teklif', ORDER: 'Sipariş', INVOICE: 'Fatura' };

// ─────────────────────────────────────────────────────────────
// Grafik ve düzen parçaları — modül düzeyinde
// ─────────────────────────────────────────────────────────────
const Panel = ({ w = 6, title, hint, link, onLink, children }) => (
    <div className={`ra-surface ra-panel w${w}`}>
        <div className="ra-panel-head">
            <h3>{title}</h3>
            {link
                ? <a href="#!" onClick={(e) => { e.preventDefault(); onLink?.(); }}>{link} →</a>
                : hint ? <span className="hint">{hint}</span> : null}
        </div>
        <div className="ra-panel-body">{children}</div>
    </div>
);

const TrendBadge = ({ current, previous, partial }) => {
    if (!previous) return null;
    const pct = Math.round(((current - previous) / previous) * 100);
    const cls = partial ? 'partial' : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const title = partial
        ? 'Dönem henüz tamamlanmadı — önceki dönemle karşılaştırma eksik'
        : `Önceki dönem: ${tr(previous)}`;
    return (
        <span className={`ra-trend ${cls}`} title={title}>
            {partial ? <AlertTriangle size={9} /> : pct > 0 ? <ArrowUpRight size={10} /> : pct < 0 ? <ArrowDownRight size={10} /> : null}
            %{Math.abs(pct)}
        </span>
    );
};

const HBars = ({ items, colors }) => (
    <div className="ra-hbars">
        {items.map((it, i) => (
            <div className="ra-hbar" key={it.label + i}>
                <span className="nm" title={it.label}>{it.label}</span>
                <div className="bar"><i style={{ width: `${it.pct}%`, background: (colors || BAR_COLORS)[i] || '#cbd5e1' }} /></div>
                <span className="val">{tr(it.value)}</span>
            </div>
        ))}
    </div>
);

const Duo = ({ items }) => (
    <div className="ra-duo">
        {items.map(it => (
            <div className="ra-duo-item" key={it.k}>
                <div className="k">{it.k}</div>
                <div className="v" style={it.color ? { color: it.color } : undefined}>{it.v}</div>
                {it.s && <div className="s">{it.s}</div>}
            </div>
        ))}
    </div>
);

/** Günlük başvuru — toplam ve numaralı iki katman */
const DailyChart = ({ rows }) => {
    if (!rows.length) return <div className="ra-chart-empty">Veri yok</div>;
    const w = 980, h = 170;
    const max = Math.max(...rows.map(r => r.total)) || 1;
    const X = i => (i / (rows.length - 1 || 1)) * w;
    const Y = v => h - (v / max) * h;
    const line = key => rows.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(r[key]).toFixed(1)}`).join(' ');
    return (
        <svg className="ra-svg" viewBox={`0 0 ${w} ${h + 26}`} preserveAspectRatio="none" style={{ height: 200 }}>
            <defs>
                <linearGradient id="dcT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fca5a5" stopOpacity=".55" /><stop offset="1" stopColor="#fca5a5" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="dcP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ef4444" stopOpacity=".45" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" />
                </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" y1={h * f} x2={w} y2={h * f} stroke="#f0eced" strokeWidth="1" />)}
            <path d={`${line('total')} L${w},${h} L0,${h} Z`} fill="url(#dcT)" />
            <path d={`${line('withPhone')} L${w},${h} L0,${h} Z`} fill="url(#dcP)" />
            <path d={line('total')} fill="none" stroke="#fca5a5" strokeWidth="2" />
            <path d={line('withPhone')} fill="none" stroke="#ef4444" strokeWidth="2.4" />
            {rows.map((r, i) => (
                <circle key={r.date} cx={X(i)} cy={Y(r.withPhone)} r="2.6" fill="#ef4444">
                    <title>{`${dShort(r.date)}: ${r.total} başvuru, ${r.withPhone} numaralı`}</title>
                </circle>
            ))}
            <text x="0" y={h + 18} fontSize="11" fill="#94a3b8">{dShort(rows[0].date)}</text>
            <text x={w} y={h + 18} fontSize="11" fill="#94a3b8" textAnchor="end">{dShort(rows[rows.length - 1].date)}</text>
        </svg>
    );
};

/** Aylık trend — tek katman */
const MonthChart = ({ rows }) => {
    if (!rows.length) return <div className="ra-chart-empty">Aylık veri yok</div>;
    const w = 620, h = 140;
    const max = Math.max(...rows.map(r => r.count)) || 1;
    const X = i => (i / (rows.length - 1 || 1)) * w;
    const Y = v => h - (v / max) * h;
    const p = rows.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(r.count).toFixed(1)}`).join(' ');
    return (
        <svg className="ra-svg" viewBox={`0 0 ${w} ${h + 24}`} preserveAspectRatio="none" style={{ height: 172 }}>
            <defs>
                <linearGradient id="mcG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ef4444" stopOpacity=".35" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" />
                </linearGradient>
            </defs>
            {[0.33, 0.66].map(f => <line key={f} x1="0" y1={h * f} x2={w} y2={h * f} stroke="#f0eced" strokeWidth="1" />)}
            <path d={`${p} L${w},${h} L0,${h} Z`} fill="url(#mcG)" />
            <path d={p} fill="none" stroke="#ef4444" strokeWidth="2.4" />
            {rows.map((r, i) => (
                <circle key={r.month + i} cx={X(i)} cy={Y(r.count)} r="3" fill="#ef4444"><title>{`${r.month}: ${tr(r.count)}`}</title></circle>
            ))}
            {rows.map((r, i) => (
                <text key={`t${r.month}${i}`} x={X(i)} y={h + 18} fontSize="11" fill="#94a3b8"
                    textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}>{r.month}</text>
            ))}
        </svg>
    );
};

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const Heatmap = ({ data }) => {
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return <div className="ra-chart-empty">Veri yok</div>;
    const max = Math.max(1, ...rows.flat());
    const color = v => (v ? `rgba(239,68,68,${(0.12 + (v / max) * 0.88).toFixed(2)})` : '#f6f7f9');
    return (
        <>
            <div className="ra-heat">
                <span />
                {Array.from({ length: 24 }, (_, h) => <span className="hh" key={h}>{h % 3 === 0 ? h : ''}</span>)}
                {rows.map((row, di) => (
                    <React.Fragment key={di}>
                        <span className="dl">{DAYS[di]}</span>
                        {row.map((v, hi) => (
                            <i key={hi} style={{ background: color(v) }} title={`${DAYS[di]} ${hi}:00 — ${tr(v)} başvuru`} />
                        ))}
                    </React.Fragment>
                ))}
            </div>
            <div className="ra-heat-legend">
                <span>az</span>
                <span className="sc">{[0, 0.2, 0.4, 0.6, 0.8, 1].map(t => (
                    <i key={t} style={{ background: t ? `rgba(239,68,68,${(0.12 + t * 0.88).toFixed(2)})` : '#f6f7f9' }} />
                ))}</span>
                <span>çok</span>
                <span style={{ marginLeft: 'auto' }}>en yoğun: {tr(max)} başvuru</span>
            </div>
        </>
    );
};

const MiniTable = ({ cls, head, rows }) => (
    <div className={`ra-mt ${cls}`}>
        <div className="ra-mt-row head">{head.map((h, i) => (
            <span key={i} style={i >= head.length - 1 ? { textAlign: 'right' } : undefined}>{h}</span>
        ))}</div>
        {rows}
    </div>
);

const Quality = ({ k, pct, color, sub }) => (
    <div className="ra-quality-row">
        <div className="top"><span className="k">{k}</span><span className="v">%{pct}</span></div>
        <div className="bar"><i style={{ width: `${pct}%`, background: color }} /></div>
        <div className="s">{sub}</div>
    </div>
);

const CeoReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [contactStats, setContactStats] = useState(null);
    const [leadsByForm, setLeadsByForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');
    const [funnelFilter, setFunnelFilter] = useState('');
    const [funnels, setFunnels] = useState([]);

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    useEffect(() => {
        if (!currentWorkspace?.id) return;
        funnelAPI.getAll(currentWorkspace.id).then(res => setFunnels(res.data || [])).catch(() => {});
    }, [currentWorkspace?.id]);

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const dateParams = getDateRangeLogic(dateFilter, startDate, endDate);
            const params = { ...dateParams, comparePrevious: true };
            if (funnelFilter) params.funnelId = funnelFilter;
            const secondaryParams = { ...dateParams };
            if (funnelFilter) secondaryParams.funnelId = funnelFilter;

            const [analyticsRes, performanceRes, dailyStatsRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, params),
                contactAPI.getAgentPerformance(currentWorkspace.id, params),
                contactAPI.getDailyStats(currentWorkspace.id, secondaryParams).catch(() => ({ data: null })),
            ]);
            setAnalytics(analyticsRes.data);
            setAgentPerformance(performanceRes.data);
            if (dailyStatsRes?.data) setContactStats(dailyStatsRes.data);

            if (currentWorkspace.id === IKON_WS) {
                try {
                    const formRes = await api.get(`/leads/${currentWorkspace.id}/by-form`, { params: dateParams });
                    setLeadsByForm(formRes.data);
                } catch { /* bu bölüm olmasa da sayfa çalışır */ }
            }
        } catch (err) {
            console.error('Dashboard error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate, funnelFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Seçili dönem bugünden sonra bitiyorsa karşılaştırma eksik kalır. */
    const periodPartial = useMemo(() => {
        const { endDate: ed } = getDateRangeLogic(dateFilter, startDate, endDate);
        return !!ed && ed > todayKey();
    }, [dateFilter, startDate, endDate]);

    const a = analytics || {};
    const ct = a.callTrackingStats || {};
    const ds = a.dealStats || {};
    const as = a.activityStats || {};
    const ra = a.requestAnalysis || {};
    const ai = a.aiCallStats || {};
    const appt = a.appointmentStats || {};
    const prev = a.previousPeriod || {};
    const tt = agentPerformance?.teamTotals || {};
    const teams = agentPerformance?.teams || [];

    const daily = contactStats?.dailyStats || [];
    const channels = useMemo(
        () => [...(a.channelData || [])].sort((x, y) => (y.count || 0) - (x.count || 0)).slice(0, 7),
        [a.channelData]
    );
    const chMax = channels[0]?.count || 1;
    const agents = useMemo(
        () => [...(agentPerformance?.agents || [])].filter(x => x.totalConversations > 0)
            .sort((x, y) => y.totalConversations - x.totalConversations).slice(0, 8),
        [agentPerformance]
    );
    const agMax = agents[0]?.totalConversations || 1;
    const topics = useMemo(
        () => [...(ra.topics || [])].sort((x, y) => (y.count || 0) - (x.count || 0)).slice(0, 7),
        [ra.topics]
    );
    const topicMax = topics[0]?.count || 1;

    const relPct = ra.totalRequests ? Math.round((ra.relevantCount / ra.totalRequests) * 100) : 0;
    const phonePct = ra.totalRequests ? Math.round((ra.withPhoneCount / ra.totalRequests) * 100) : 0;
    const calledPct = ra.totalRequests ? Math.round(((ra.calledCount || 0) / ra.totalRequests) * 100) : 0;
    const totalSales = ds.orderAmount || 0;
    const withPhone = a.withPhoneCount || contactStats?.totals?.withPhone || 0;
    const noPhone = Math.max(0, (a.totalContacts || 0) - withPhone);

    const salesFunnel = [
        { k: 'Teklif', v: ds.totalQuotes || 0, c: '#f59e0b' },
        { k: 'Sipariş', v: ds.totalOrders || 0, c: '#6366f1' },
        { k: 'Kazanılan', v: ds.wonCount || 0, c: '#10b981' },
    ];
    const sfTotal = salesFunnel.reduce((s, x) => s + x.v, 0) || 1;

    if (loading && !analytics) {
        return (
            <div className="ra-page">
                <div className="ra-loading">
                    <RefreshCw className="ra-spin" size={30} />
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Dashboard yükleniyor…</p>
                </div>
            </div>
        );
    }

    const KPI = [
        { k: 'Başvuru', dot: '#ef4444', v: tr(a.totalContacts), s: `${tr(withPhone)} numaralı`, cur: a.totalContacts, prv: prev.totalContacts },
        { k: 'Mesaj', dot: '#6366f1', v: tr(a.totalMessages), s: `ort. ${a.totalContacts ? Math.round((a.totalMessages || 0) / a.totalContacts) : 0}/kişi`, cur: a.totalMessages, prv: prev.totalMessages },
        { k: 'Arama', dot: '#0ea5e9', v: tr(ct.totalCalled), s: `%${ct.callRate || 0} arama oranı`, cur: ct.totalCalled, prv: prev.totalCalled },
        { k: 'Sipariş', dot: '#f59e0b', v: tr(ds.totalOrders), s: ds.totalQuotes ? `${tr(ds.totalQuotes)} teklif` : 'teklif yok', cur: ds.totalOrders, prv: prev.totalOrders },
        { k: 'Ciro', dot: '#047857', v: money(totalSales), s: `${tr(ds.wonCount)} kazanılan`, cur: totalSales, prv: prev.orderAmount },
        { k: 'Çözüm', dot: '#a78bfa', v: `%${a.resolutionRate || 0}`, s: `${tr(a.resolvedCount)} çözülen` },
    ];

    const DOORS = [
        { l: 'Talep Raporu', s: 'konu, temsilci, akış', to: '/general-report/requests' },
        { l: 'Kaynak & Attribution', s: 'reklam, kampanya, ROI', to: '/general-report/attribution' },
        { l: 'Satış Raporu', s: 'kategori ve temsilci', to: '/general-report/sales' },
        { l: 'Takım ve Temsilciler', s: 'performans', to: '/general-report/team' },
        { l: 'Aktivite Raporu', s: 'dönem özeti', to: '/general-report/activities' },
        { l: 'Arama Analizi', s: 'numaralı başvurular', to: '/call-analytics' },
        { l: 'Görüşme Analizi', s: 'yüz yüze', to: '/meeting-analytics' },
        { l: 'Randevu Analizi', s: 'takvim', to: '/appointment-analytics' },
        { l: 'AI Call Raporlama', s: 'sesli asistan', to: '/ai-call-analytics' },
    ];

    return (
        <div className="ra-page">
            {/* Yalnızca yazdırmada görünür */}
            <div className="print-logo-header">
                <img src="/instomer-logo.png" alt="Instomer" style={{ height: 38 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>
                    Genel Performans Raporu — {new Date().toLocaleDateString('tr-TR')}
                </span>
            </div>

            <div className="ra-wrap">

                <div className="ra-head">
                    <div>
                        <div className="ra-eyebrow">Raporlar</div>
                        <h1>Genel Rapor</h1>
                        <p>İş performansı ve analiz özeti</p>
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
                            <input type="date" className="ra-date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            <span style={{ color: '#cbd5e1' }}>—</span>
                            <input type="date" className="ra-date-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                    )}
                    <div className="ra-spacer" />
                    {funnels.length > 0 && (
                        <select className="ra-select" value={funnelFilter} onChange={e => setFunnelFilter(e.target.value)}>
                            <option value="">Tüm Akışlar</option>
                            {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    )}
                </div>

                <div className="ra-surface ra-hero">
                    <div className="ra-hero-left">
                        <div className="ra-metric-label">Başvuru</div>
                        <div className="ra-metric-value">{tr(a.totalContacts)}</div>
                        <div className="ra-metric-note">{tr(a.totalConversations)} sohbet</div>
                        <div className="ra-split">
                            <div className="ra-split-bar">
                                <i style={{ width: `${a.totalContacts ? (withPhone / a.totalContacts) * 100 : 0}%`, background: 'var(--accent)' }} />
                                <i style={{ width: `${a.totalContacts ? (noPhone / a.totalContacts) * 100 : 0}%`, background: '#cbd5e1' }} />
                            </div>
                            <div className="ra-split-legend">
                                <div className="ra-split-item">Numaralı<b>{tr(withPhone)} <span style={{ fontSize: '.72rem', color: '#94a3b8', fontWeight: 600 }}>%{a.totalContacts ? Math.round((withPhone / a.totalContacts) * 100) : 0}</span></b></div>
                                <div className="ra-split-item" style={{ textAlign: 'right' }}>Numarasız<b>{tr(noPhone)}</b></div>
                            </div>
                        </div>
                    </div>
                    <div className="ra-hero-right">
                        <div className="ra-chart-head">
                            <span className="ra-chart-title">Günlük başvuru</span>
                            <span className="ra-chart-peak">koyu çizgi: numaralı</span>
                        </div>
                        <DailyChart rows={daily} />
                    </div>
                </div>

                <div className="ra-surface ra-strip" style={{ marginBottom: periodPartial ? 14 : 22 }}>
                    {KPI.map(c => (
                        <div className="ra-cell" key={c.k}>
                            <div className="ra-cell-top">
                                <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: c.dot }} />{c.k}</div>
                                <TrendBadge current={c.cur} previous={c.prv} partial={periodPartial} />
                            </div>
                            <div className="ra-cell-value">{c.v}</div>
                            <div className="ra-cell-sub">{c.s}</div>
                        </div>
                    ))}
                </div>

                {periodPartial && (
                    <div className="ra-partial-note">
                        Seçili dönem henüz tamamlanmadı. Trend yüzdeleri bu dönemin <strong>tamamlanmış bir önceki
                        dönemle</strong> karşılaştırmasıdır — bu yüzden olduğundan düşük görünürler.
                    </div>
                )}

                <div className="ra-grid">

                    <Panel w={4} title="Kanal Dağılımı" link="Detay" onLink={() => navigate('/general-report/general')}>
                        {channels.length
                            ? <HBars items={channels.map(c => ({ label: chName(c.channel), value: c.count, pct: (c.count / chMax) * 100 }))} />
                            : <div className="ra-chart-empty">Veri yok</div>}
                    </Panel>

                    <Panel w={8} title="Aylık Başvuru Trendi" hint="son 6 ay · tarih filtresinden bağımsız">
                        <MonthChart rows={a.monthlyData || []} />
                    </Panel>

                    <Panel w={8} title="Akış Raporu" link="Akışlar" onLink={() => navigate('/funnels')}>
                        {(a.funnelSummary || []).length === 0
                            ? <div className="ra-chart-empty">Akış verisi yok</div>
                            : (a.funnelSummary || []).slice(0, 4).map(f => {
                                const st = (f.stages || []).filter(s => s.count > 0);
                                const tot = st.reduce((s, x) => s + x.count, 0) || 1;
                                return (
                                    <div className="ra-funnel" key={f.id || f.name}>
                                        <div className="ra-funnel-top">
                                            <span className="ra-funnel-nm">{f.name}</span>
                                            <span className="ra-funnel-ct">{tr(f.count)} kişi</span>
                                        </div>
                                        <div className="ra-funnel-bar">
                                            {st.map(s => <i key={s.id || s.name} style={{ width: `${(s.count / tot) * 100}%`, background: s.color || '#cbd5e1' }} title={`${s.name}: ${tr(s.count)}`} />)}
                                        </div>
                                        <div className="ra-funnel-stages">
                                            {st.slice(0, 6).map(s => (
                                                <span className="ra-funnel-stage" key={s.id || s.name}>
                                                    <i style={{ background: s.color || '#cbd5e1' }} />{s.name} <b>{tr(s.count)}</b>
                                                    {s.recentCount > 0 && <span style={{ color: '#047857' }}>+{tr(s.recentCount)}</span>}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                    </Panel>

                    <Panel w={4} title="Takım & Temsilci" link="Takım" onLink={() => navigate('/general-report/team')}>
                        <Duo items={[
                            { k: 'Ajan', v: tr((agentPerformance?.agents || []).length) },
                            { k: 'Çözüm', v: `%${tt.avgResolutionRate || 0}` },
                            { k: 'Yanıt', v: `${tt.avgResponseTime || 0} dk` },
                        ]} />
                        <div className="ra-group-label">Takım Dağılımı</div>
                        {teams.length === 0
                            ? <div className="ra-chart-empty" style={{ padding: '18px 0' }}>Henüz takım oluşturulmamış</div>
                            : (
                                <div className="ra-teamlist">
                                    {teams.slice(0, 6).map(t => (
                                        <div className="ra-teamitem" key={t.id}>
                                            <i style={{ background: t.color || '#cbd5e1' }} />
                                            <span className="nm" title={t.name}>{t.name}</span>
                                            <span className="m">{tr(t.agentCount)} kişi</span>
                                            <span className="c">{tr(t.conversationCount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        <div className="ra-group-label">Temsilci Sıralaması</div>
                        {agents.length
                            ? <HBars items={agents.map(x => ({ label: x.name, value: x.totalConversations, pct: (x.totalConversations / agMax) * 100 }))}
                                colors={['#ef4444', '#f87171', '#fca5a5', '#cbd5e1', '#cbd5e1', '#cbd5e1', '#cbd5e1', '#cbd5e1']} />
                            : <div className="ra-chart-empty">Veri yok</div>}
                    </Panel>

                    <Panel w={4} title="Arama Raporu" link="Arama Analizi" onLink={() => navigate('/call-analytics')}>
                        <Duo items={[
                            { k: 'Numaralı', v: tr(ct.totalWithPhone), s: 'kişi havuzu' },
                            { k: 'Arandı', v: tr(ct.totalCalled), s: `%${ct.callRate || 0}` },
                            { k: 'Toplam Arama', v: tr(ct.totalCallCount), s: 'yapılan arama' },
                            { k: 'Aranmayan', v: tr(ct.totalNotCalled), s: 'hiç aranmamış' },
                        ]} />
                    </Panel>

                    <Panel w={4} title="Aktivite Raporu" link="Aktivite" onLink={() => navigate('/general-report/activities')}>
                        <Duo items={[
                            { k: 'Toplam', v: tr(as.totalActivities), s: 'kayıt' },
                            { k: 'Bekleyen', v: tr(as.plannedCount), s: 'yapılmadı' },
                            { k: 'Tamamlanan', v: tr(as.completedCount), s: 'kapatıldı' },
                            { k: 'Gecikmiş', v: tr(as.overdueCount), s: 'tarihi geçti', color: '#b91c1c' },
                        ]} />
                    </Panel>

                    <Panel w={4} title="AI Arama Analizi" link="AI Call" onLink={() => navigate('/ai-call-analytics')}>
                        {ai.totalCalls ? (
                            <>
                                <Duo items={[
                                    { k: 'Toplam AI Arama', v: tr(ai.totalCalls) },
                                    { k: 'Başarılı', v: tr(ai.successfulCount), s: `%${ai.successRate || 0}` },
                                    { k: 'Maliyet', v: `$${Number(ai.totalCost || 0).toFixed(2)}` },
                                    { k: 'Bot Randevu', v: tr(appt.byBot) },
                                ]} />
                                <div className="ra-group-label">AI / Manuel</div>
                                <HBars items={[
                                    { label: 'AI araması', value: ai.totalCalls, pct: (ai.totalCalls / Math.max(1, ai.totalCalls + (ct.totalCallCount || 0))) * 100 },
                                    { label: 'Manuel arama', value: ct.totalCallCount || 0, pct: ((ct.totalCallCount || 0) / Math.max(1, ai.totalCalls + (ct.totalCallCount || 0))) * 100 },
                                ]} colors={['#ef4444', '#cbd5e1']} />
                            </>
                        ) : (
                            <div className="ra-chart-empty">
                                AI Arama henüz aktif değil
                                <div style={{ marginTop: 6, fontSize: '.73rem' }}>Bu dönemde sesli asistan araması yok</div>
                            </div>
                        )}
                    </Panel>

                    <Panel w={12} title="Satış & Ciro" link="Satış Raporu" onLink={() => navigate('/general-report/sales')}>
                        <Duo items={[
                            { k: 'Teklif', v: ds.totalQuotes ? tr(ds.totalQuotes) : '—', s: ds.totalQuotes ? '' : 'QUOTE kullanılmıyor' },
                            { k: 'Sipariş', v: tr(ds.totalOrders) },
                            { k: 'Kazanılan', v: tr(ds.wonCount), s: money(ds.wonAmount) },
                            { k: 'Kaybedilen', v: ds.lostCount ? tr(ds.lostCount) : '—' },
                            { k: 'Toplam Ciro', v: money(totalSales), color: '#047857' },
                        ]} />
                        <div className="ra-sfunnel">
                            {salesFunnel.filter(x => x.v > 0).map(x => (
                                <i key={x.k} style={{ width: `${(x.v / sfTotal) * 100}%`, background: x.c }} title={`${x.k}: ${tr(x.v)}`} />
                            ))}
                        </div>
                        <div className="ra-sfunnel-labels">
                            {salesFunnel.map(x => <span key={x.k}><i style={{ background: x.c }} />{x.k} <b>{tr(x.v)}</b></span>)}
                        </div>
                        {(ds.recentDeals || []).length > 0 && (
                            <>
                                <div className="ra-mini-title">Son Satışlar</div>
                                <MiniTable cls="ra-cols-deal"
                                    head={['Başlık', 'Müşteri', 'Temsilci', 'Aşama', 'Tutar', 'Tarih']}
                                    rows={ds.recentDeals.slice(0, 5).map(d => (
                                        <div className="ra-mt-row" key={d.id}>
                                            <span className="t" title={d.title}>{d.title || '—'}</span>
                                            <span className="c">{d.contact?.name || '—'}</span>
                                            <span className="c">{d.assignedTo?.name || '—'}</span>
                                            <span><span className="ra-tag" style={{ background: '#fef2f2', color: '#b91c1c' }}>{STAGE_TR[d.stage] || d.stage || '—'}</span></span>
                                            <span className="n">{d.amount ? money(d.amount) : '—'}</span>
                                            <span className="d">{d.createdAt ? dayMon(d.createdAt) : '—'}</span>
                                        </div>
                                    ))} />
                            </>
                        )}
                    </Panel>

                    <Panel w={12} title="Gelen Talep Analizi" link="Detaylı Rapor" onLink={() => navigate('/general-report/requests')}>
                        <div className="ra-split3">
                            <div>
                                <Duo items={[
                                    { k: 'Talep', v: tr(ra.totalRequests), s: 'dönem toplamı' },
                                    { k: 'Numaralı', v: tr(ra.withPhoneCount), s: 'telefon bildirmiş' },
                                    { k: 'İlgili', v: tr(ra.relevantCount), s: 'gerçek talep' },
                                ]} />
                                {ra.aiClassified > 0 && (
                                    <div style={{ marginTop: 18, fontSize: '.73rem', color: '#94a3b8' }}>
                                        {tr(ra.aiClassified)} talep yapay zekâ ile sınıflandırıldı
                                    </div>
                                )}
                            </div>
                            <div className="ra-vline" />
                            <div>
                                <div className="ra-mini-title" style={{ marginTop: 0 }}>Öne Çıkan Talepler</div>
                                {topics.length
                                    ? <HBars items={topics.map(t => ({ label: t.topic, value: t.count, pct: (t.count / topicMax) * 100 }))} />
                                    : <div className="ra-chart-empty">Talep verisi yok</div>}
                            </div>
                            <div className="ra-vline" />
                            <div>
                                <div className="ra-mini-title" style={{ marginTop: 0 }}>Talep Kalitesi</div>
                                <div className="ra-quality">
                                    <Quality k="İlgili Talep Oranı" pct={relPct} color="#10b981" sub={`${tr(ra.relevantCount)} / ${tr(ra.totalRequests)} talep`} />
                                    <Quality k="Telefon Alma Oranı" pct={phonePct} color="#ef4444" sub={`${tr(ra.withPhoneCount)} talepte numara var`} />
                                    <Quality k="Arama Oranı" pct={calledPct} color="#6366f1" sub={`${tr(ra.calledCount)} talep arandı`} />
                                </div>
                            </div>
                        </div>
                        {(ra.recentRequests || []).length > 0 && (
                            <>
                                <div className="ra-mini-title">Son Gelen Talepler</div>
                                <MiniTable cls="ra-cols-req"
                                    head={['Talep / Konu', 'Müşteri', 'Telefon', 'Aşama', 'Tarih']}
                                    rows={ra.recentRequests.slice(0, 5).map((r, i) => (
                                        <div className="ra-mt-row" key={r.id || i}>
                                            <span className="t" title={r.topic}>{r.topic || '—'}</span>
                                            <span className="c">{r.contactName || '—'}</span>
                                            <span className="c">{r.phone && r.phone !== '—' ? r.phone : '—'}</span>
                                            <span><span className="ra-tag" style={{ background: '#f8fafc', color: '#64748b' }}>{STATUS_TR[r.status] || r.status || '—'}</span></span>
                                            <span className="d">{r.createdAt ? dayMon(r.createdAt) : '—'}</span>
                                        </div>
                                    ))} />
                            </>
                        )}
                    </Panel>

                    {currentWorkspace?.id === IKON_WS && leadsByForm?.byForm?.length > 0 && (
                        <Panel w={12} title="Facebook Lead — Proje Bazlı Dağılım"
                            hint={`toplam ${tr(leadsByForm.total)} lead · form adına göre`}>
                            <MiniTable cls="ra-cols-lead"
                                head={['#', 'Form / Proje Adı', 'Kampanya', 'Lead Sayısı', 'Pay']}
                                rows={leadsByForm.byForm.map((row, i) => (
                                    <div className="ra-mt-row" key={row.formName || i}>
                                        <span className="d" style={{ textAlign: 'left' }}>{i + 1}</span>
                                        <span className="t" title={row.formName}>{row.formName || '—'}</span>
                                        <span className="c">{row.campaignName || '—'}</span>
                                        <span className="c" style={{ textAlign: 'right' }}>{tr(row.count)}</span>
                                        <span className="d">%{leadsByForm.total ? ((row.count / leadsByForm.total) * 100).toFixed(1) : 0}</span>
                                    </div>
                                ))} />
                        </Panel>
                    )}

                    <Panel w={12} title="Isı Haritası" hint="başvuruların gün ve saate göre yoğunluğu">
                        <Heatmap data={a.heatmapData} />
                    </Panel>

                </div>

                <div className="ra-surface">
                    <div className="ra-panel-head"><h3>Detaylı Raporlar</h3><span className="hint">{DOORS.length} rapor</span></div>
                    <div className="ra-panel-body">
                        <div className="ra-doors cols-4" style={{ marginBottom: 0 }}>
                            {DOORS.map(d => (
                                <button type="button" className="ra-door" key={d.to} onClick={() => navigate(d.to)}>
                                    <div className="ra-door-top">
                                        <span className="ra-door-label">{d.l}</span>
                                        <span className="ra-door-arrow"><ArrowRight size={17} /></span>
                                    </div>
                                    <div className="ra-door-sub" style={{ marginTop: 8 }}>{d.s}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CeoReport;
