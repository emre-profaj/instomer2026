/**
 * ═══════════════════════════════════════════════════════════════
 * TALEP RAPORU
 * ═══════════════════════════════════════════════════════════════
 *
 * Aynı talebi dört farklı eksende sayan bir döküm sayfası:
 * temsilci, konu, akış, kaynak. Ortak rapor dili (reportDesign.css).
 *
 * Eski sayfadaki her şey duruyor: geri düğmesi, beş KPI, değerlendirme
 * çubuğu, aktivite dökümü, dört bölüm, açılır alt dökümler
 * (temsilci→konu, konu→kaynak, akış→aşamalar), Toplam satırları ve
 * boş durum mesajları.
 *
 * SEKME YAPILMADI — bilerek. "Raporu İndir" window.print() kullanıyor;
 * sekmeli yapıda gizli bölümler yazdırılmaz. Bunun yerine üstte çapa
 * çubuğu var: sayfa uzun (Metropol'de 17+43+7+5 = 72 satır) ama
 * istediğiniz bölüme tek tıkla iniyorsunuz ve çıktı eksiksiz.
 *
 * Teklif kolonu veri yoksa hiç gösterilmiyor — Metropol'de 65 sipariş
 * ve 3,6 milyon ₺ ciro var ama sıfır teklif (QUOTE aşaması hiç
 * kullanılmıyor).
 */
import React, { useState, useEffect } from 'react';
import { RefreshCw, FileText, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../Analytics/reportDesign.css';
import './RequestReport.css';

const tr = (n) => Number(n || 0).toLocaleString('tr-TR');
const money = (n) => Number(n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

const CHANNEL_ICONS = {
    'WHATSAPP': '💬',
    'PHONE': '📞',
    'INSTAGRAM': '📸',
    'FACEBOOK': '💬',
    'FORM': '📝',
    'EMAIL': '📧'
};

const Metric = ({ v, k, isMoney }) => (
    <div className="ra-metric">
        <div className={`v${v ? (isMoney ? ' money' : '') : ' zero'}`}>{v ? (isMoney ? money(v) : tr(v)) : '—'}</div>
        <div className="k">{k}</div>
    </div>
);
const SubCell = ({ v, isMoney }) => (
    <span className={`n${v ? (isMoney ? ' money' : '') : ' zero'}`}>{v ? (isMoney ? money(v) : tr(v)) : '—'}</span>
);
const Section = ({ id, title, meta, cols, children }) => (
    <div className="ra-surface" id={id} style={{ marginBottom: 22, '--cols': cols }}>
        <div className="ra-sec"><h2>{title}</h2><span className="meta">{meta}</span></div>
        {children}
    </div>
);
const Empty = ({ text }) => (
    <div className="ra-empty"><h3>{text}</h3><p>Bu dönemde kayıt bulunamadı.</p></div>
);

const RequestReport = () => {
    const { currentWorkspace } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');
    const [expandedAgent, setExpandedAgent] = useState(null);
    const [expandedTopics, setExpandedTopics] = useState({});
    const [expandedFunnels, setExpandedFunnels] = useState({});

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const res = await contactAPI.getRequestReport(
                currentWorkspace.id, getDateRangeLogic(dateFilter, startDate, endDate)
            );
            setData(res.data);
        } catch (err) {
            console.error('Request report error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading && !data) {
        return (
            <div className="ra-page">
                <div className="ra-loading">
                    <RefreshCw className="ra-spin" size={30} />
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Talep Raporu yükleniyor…</p>
                </div>
            </div>
        );
    }

    const {
        totalCount = 0, totalCases = 0, totalDeals = 0, withPhoneCount = 0,
        totalWonCount = 0, totalWonAmount = 0,
        totalLostCount = 0, totalActiveCount = 0, totalClosedCount = 0,
        conversionRate = 0, lostRate = 0,
        totalCalls = 0, totalMeetings = 0, totalAppointments = 0,
        totalProposals = 0, totalOrders = 0,
        agentTable = [], topicGroups = [], funnelGroups = [], sourceGroups = [],
    } = data || {};

    /** Teklif hiç kullanılmıyorsa kolonu göstermiyoruz. */
    const hasProposals = totalProposals > 0;
    const COLS = hasProposals ? 7 : 6;

    const evalSegs = [
        { label: 'Olumlu (Satış)', count: totalWonCount, color: '#10b981' },
        { label: 'Olumsuz', count: totalLostCount, color: '#ef4444' },
        { label: 'Devam Eden', count: totalActiveCount, color: '#f59e0b' },
        { label: 'Kapatıldı', count: totalClosedCount, color: '#cbd5e1' },
    ].filter(x => x.count > 0);

    const acts = [
        { nm: 'Arama', v: totalCalls, c: '#ef4444' },
        { nm: 'Görüşme', v: totalMeetings, c: '#6366f1' },
        { nm: 'Randevu', v: totalAppointments, c: '#f59e0b' },
        { nm: 'Teklif', v: totalProposals, c: '#a78bfa' },
        { nm: 'Sipariş', v: totalOrders, c: '#10b981' },
    ];
    const actMax = Math.max(1, ...acts.map(a => a.v || 0));

    const strip = [
        { label: 'Olumlu', dot: '#10b981', value: tr(totalWonCount), sub: `%${conversionRate} dönüşüm` },
        { label: 'Ciro', dot: '#047857', value: money(totalWonAmount), sub: 'kazanılan tutar' },
        { label: 'Olumsuz', dot: '#ef4444', value: tr(totalLostCount), sub: `%${lostRate} kayıp` },
        { label: 'Devam Eden', dot: '#f59e0b', value: tr(totalActiveCount), sub: 'açık talep' },
        { label: 'Kapatıldı', dot: '#94a3b8', value: tr(totalClosedCount), sub: 'sonuçlanmış' },
        { label: 'Numaralı Kişi', dot: '#6366f1', value: tr(withPhoneCount), sub: 'ulaşılabilir' },
    ];

    // ── Temsilci bazlı ──────────────────────────────────────
    const agents = [...agentTable].sort((a, b) => b.caseCount - a.caseCount);
    const agentMax = Math.max(1, ...agents.map(a => a.caseCount));

    // ── Konu bazlı ──────────────────────────────────────────
    const topics = [...topicGroups].sort((a, b) => b.count - a.count);
    const topicMax = Math.max(1, ...topics.map(t => t.count));

    // ── Akış bazlı ──────────────────────────────────────────
    const funnels = [...funnelGroups].sort((a, b) => b.count - a.count);
    const funnelMax = Math.max(1, ...funnels.map(f => f.count));

    // ── Kaynak bazlı ────────────────────────────────────────
    const sources = [...sourceGroups].sort((a, b) => b.count - a.count);
    const sourceMax = Math.max(1, ...sources.map(s => s.count));

    return (
        <div className="ra-page">
            <div className="ra-wrap">

                <div className="ra-head">
                    <div>
                        <div className="ra-eyebrow">Raporlar</div>
                        <h1>Talep Raporu</h1>
                        <p>Kategori, temsilci, akış ve kaynak bazlı talep analizi</p>
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
                        <div className="ra-metric-label">Toplam Talep</div>
                        <div className="ra-metric-value">{tr(totalCount)}</div>
                        <div className="ra-metric-note">{tr(totalCases)} başvuru · {tr(totalDeals)} satış kaydı</div>
                        <div className="ra-split">
                            {totalCount > 0 ? (
                                <>
                                    <div className="ra-bar">
                                        {evalSegs.map(e => (
                                            <span key={e.label} style={{ width: `${(e.count / totalCount) * 100}%`, background: e.color }}
                                                title={`${e.label}: ${e.count}`} />
                                        ))}
                                    </div>
                                    <div className="ra-legend" style={{ marginTop: 12 }}>
                                        {evalSegs.map(e => (
                                            <div className="ra-legend-item" key={e.label}>
                                                <i className="ra-dot" style={{ background: e.color }} />
                                                <span className="ra-legend-text">{e.label}</span>
                                                <span className="ra-legend-count">{tr(e.count)}</span>
                                                <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>
                                                    %{((e.count / totalCount) * 100).toFixed(1)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : <div className="ra-bar" />}
                        </div>
                    </div>

                    <div className="ra-hero-right">
                        <div className="ra-chart-head">
                            <span className="ra-chart-title">Taleplere ne yapıldı</span>
                            <span className="ra-chart-peak">dönem toplamı</span>
                        </div>
                        <div className="ra-acts">
                            {acts.map(a => (
                                <div className="ra-actrow" key={a.nm}>
                                    <span className="nm">{a.nm}</span>
                                    <div className="bar"><i style={{ width: `${((a.v || 0) / actMax) * 100}%`, background: a.c }} /></div>
                                    <span className="val">{a.v ? tr(a.v) : '—'}</span>
                                </div>
                            ))}
                            <div className="ra-acts-money">
                                <span className="k">Ciro (satış)</span>
                                <span className="v">{money(totalWonAmount)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="ra-surface ra-strip" style={{ marginBottom: 22 }}>
                    {strip.map(c => (
                        <div className="ra-cell" key={c.label}>
                            <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: c.dot }} />{c.label}</div>
                            <div className="ra-cell-value">{c.value}</div>
                            <div className="ra-cell-sub">{c.sub}</div>
                        </div>
                    ))}
                </div>

                <div className="ra-anchors">
                    <a className="ra-anchor" href="#s-agent">Temsilci <b>{tr(agentTable.length)}</b></a>
                    <a className="ra-anchor" href="#s-topic">Konu <b>{tr(topicGroups.length)}</b></a>
                    <a className="ra-anchor" href="#s-funnel">Akış <b>{tr(funnelGroups.length)}</b></a>
                    <a className="ra-anchor" href="#s-source">Kaynak <b>{tr(sourceGroups.length)}</b></a>
                </div>

                {/* ── Temsilci Bazlı ── */}
                <Section id="s-agent" title="Temsilci Bazlı" meta={`${tr(agentTable.length)} temsilci`} cols={COLS}>
                    {agents.length === 0 ? <Empty text="Temsilci kaydı yok" /> : (
                        <>
                            {agents.map((a, i) => {
                                const key = a.agentId || i;
                                const rows = Object.entries(a.topicBreakdown || {}).sort((x, y) => y[1].count - x[1].count);
                                const open = expandedAgent === key;
                                return (
                                    <React.Fragment key={key}>
                                        <div className={`ra-brow${rows.length ? ' clickable' : ''}${open ? ' open' : ''}`}
                                            onClick={rows.length ? () => setExpandedAgent(open ? null : key) : undefined}>
                                            {rows.length ? <span className="caret"><ChevronRight size={14} /></span> : <span />}
                                            <div>
                                                <div className="nm">{a.agentName}</div>
                                                <div className="sub">{tr(a.contactCount)} kişi · {tr(a.messageCount)} mesaj</div>
                                            </div>
                                            <div className="ra-primary">
                                                <div className="top"><span className="v">{tr(a.caseCount)}</span><span className="u">talep</span></div>
                                                <div className="bar"><i style={{ width: `${(a.caseCount / agentMax) * 100}%` }} /></div>
                                            </div>
                                            <Metric v={a.calls} k="arama" />
                                            <Metric v={a.meetings} k="görüşme" />
                                            <Metric v={a.appointments} k="randevu" />
                                            {hasProposals && <Metric v={a.proposals} k="teklif" />}
                                            <Metric v={a.dealOrders ?? a.orders} k="sipariş" />
                                            <Metric v={a.wonCount} k="satış" />
                                            <Metric v={a.wonAmount} k="ciro" isMoney />
                                        </div>
                                        {open && rows.length > 0 && (
                                            <div className="ra-sub-wrap">
                                                <div className="ra-sub-head">
                                                    <span className="ra-sub-title">{a.agentName} — Konu Dağılımı</span>
                                                    <span className="ra-sub-count">{tr(rows.length)} konu</span>
                                                </div>
                                                <div className="ra-srow head">
                                                    <span>Konu</span>
                                                    <span style={{ textAlign: 'right' }}>Talep</span>
                                                    <span style={{ textAlign: 'right' }}>Satış</span>
                                                    <span style={{ textAlign: 'right' }}>Ciro</span>
                                                </div>
                                                {rows.slice(0, 20).map(([t, d]) => (
                                                    <div className="ra-srow" key={t}>
                                                        <span className="t" title={t}>{t}</span>
                                                        <SubCell v={d.count} /><SubCell v={d.wonCount} /><SubCell v={d.wonAmount} isMoney />
                                                    </div>
                                                ))}
                                                <div className="ra-srow" style={{ boxShadow: 'inset 0 1px 0 var(--ink-3)' }}>
                                                    <span className="t" style={{ fontWeight: 800 }}>Toplam</span>
                                                    <span className="n" style={{ fontWeight: 800 }}>{tr(sum(rows, r => r[1].count))}</span>
                                                    <span className="n" style={{ fontWeight: 800 }}>{tr(sum(rows, r => r[1].wonCount))}</span>
                                                    <span className="n money" style={{ fontWeight: 800 }}>{money(sum(rows, r => r[1].wonAmount))}</span>
                                                </div>
                                                {rows.length > 20 && (
                                                    <div className="ra-sub-more">{tr(rows.length - 20)} konu daha — ilk 20 gösteriliyor</div>
                                                )}
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            <div className="ra-brow total">
                                <span /><div className="nm">Toplam</div>
                                <div className="ra-primary"><div className="top"><span className="v">{tr(sum(agents, a => a.caseCount))}</span><span className="u">talep</span></div></div>
                                <Metric v={sum(agents, a => a.calls)} k="arama" />
                                <Metric v={sum(agents, a => a.meetings)} k="görüşme" />
                                <Metric v={sum(agents, a => a.appointments)} k="randevu" />
                                {hasProposals && <Metric v={sum(agents, a => a.proposals)} k="teklif" />}
                                <Metric v={sum(agents, a => a.dealOrders ?? a.orders)} k="sipariş" />
                                <Metric v={sum(agents, a => a.wonCount)} k="satış" />
                                <Metric v={sum(agents, a => a.wonAmount)} k="ciro" isMoney />
                            </div>
                        </>
                    )}
                </Section>

                {/* ── Konu Bazlı ── */}
                <Section id="s-topic" title="Konu Bazlı" meta={`${tr(topicGroups.length)} kategori`} cols={COLS}>
                    {topics.length === 0 ? <Empty text="Konu kaydı yok" /> : (
                        <>
                            {topics.map((g, gi) => {
                                const srcs = g.sources || [];
                                const open = !!expandedTopics[g.name];
                                return (
                                    <React.Fragment key={g.name || gi}>
                                        <div className={`ra-brow${srcs.length ? ' clickable' : ''}${open ? ' open' : ''}`}
                                            onClick={srcs.length ? () => setExpandedTopics(p => ({ ...p, [g.name]: !p[g.name] })) : undefined}>
                                            {srcs.length ? <span className="caret"><ChevronRight size={14} /></span> : <span />}
                                            <div>
                                                <div className="nm">{g.name}</div>
                                                {srcs.length > 0 && <div className="sub">{tr(srcs.length)} kaynak</div>}
                                            </div>
                                            <div className="ra-primary">
                                                <div className="top"><span className="v">{tr(g.count)}</span><span className="u">talep</span></div>
                                                <div className="bar"><i style={{ width: `${(g.count / topicMax) * 100}%` }} /></div>
                                            </div>
                                            <Metric v={g.calls} k="arama" />
                                            <Metric v={g.meetings} k="görüşme" />
                                            <Metric v={g.appointments} k="randevu" />
                                            {hasProposals && <Metric v={g.proposals} k="teklif" />}
                                            <Metric v={g.orders} k="sipariş" />
                                            <Metric v={g.wonCount} k="satış" />
                                            <Metric v={g.wonAmount} k="ciro" isMoney />
                                        </div>
                                        {open && srcs.length > 0 && (
                                            <div className="ra-sub-wrap">
                                                <div className="ra-sub-head">
                                                    <span className="ra-sub-title">{g.name} — Kaynak Dağılımı</span>
                                                    <span className="ra-sub-count">{tr(srcs.length)} kaynak</span>
                                                </div>
                                                <div className="ra-srow head">
                                                    <span>Kaynak</span>
                                                    <span style={{ textAlign: 'right' }}>Talep</span>
                                                    <span style={{ textAlign: 'right' }}>Satış</span>
                                                    <span style={{ textAlign: 'right' }}>Ciro</span>
                                                </div>
                                                {srcs.map(s => (
                                                    <div className="ra-srow" key={s.name} style={{ height: 'auto', padding: '8px 12px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }} className="t">
                                                            <div>
                                                                {CHANNEL_ICONS[s.caseChannel] ? `${CHANNEL_ICONS[s.caseChannel]} ` : ''}{s.name}
                                                            </div>
                                                            {s.campaignName && <div style={{ fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.1 }}>K: {s.campaignName}</div>}
                                                            {s.adName && <div style={{ fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.1 }}>R: {s.adName}</div>}
                                                        </div>
                                                        <SubCell v={s.count} /><SubCell v={s.wonCount} /><SubCell v={s.wonAmount} isMoney />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            <div className="ra-brow total">
                                <span /><div className="nm">Toplam</div>
                                <div className="ra-primary"><div className="top"><span className="v">{tr(sum(topics, g => g.count))}</span><span className="u">talep</span></div></div>
                                <Metric v={sum(topics, g => g.calls)} k="arama" />
                                <Metric v={sum(topics, g => g.meetings)} k="görüşme" />
                                <Metric v={sum(topics, g => g.appointments)} k="randevu" />
                                {hasProposals && <Metric v={sum(topics, g => g.proposals)} k="teklif" />}
                                <Metric v={sum(topics, g => g.orders)} k="sipariş" />
                                <Metric v={sum(topics, g => g.wonCount)} k="satış" />
                                <Metric v={sum(topics, g => g.wonAmount)} k="ciro" isMoney />
                            </div>
                        </>
                    )}
                </Section>

                {/* ── Akış Bazlı ── */}
                <Section id="s-funnel" title="Akış Bazlı" meta={`${tr(funnelGroups.length)} akış`} cols={2}>
                    {funnels.length === 0 ? <Empty text="Akış kaydı yok" /> : funnels.map((g, gi) => {
                        const stages = g.stages || [];
                        const open = !!expandedFunnels[g.name];
                        return (
                            <React.Fragment key={g.funnelId || gi}>
                                <div className={`ra-brow${stages.length ? ' clickable' : ''}${open ? ' open' : ''}`}
                                    onClick={stages.length ? () => setExpandedFunnels(p => ({ ...p, [g.name]: !p[g.name] })) : undefined}>
                                    {stages.length ? <span className="caret"><ChevronRight size={14} /></span> : <span />}
                                    <div>
                                        <div className="nm">{g.name}</div>
                                        {stages.length > 0 && <div className="sub">{tr(stages.length)} aşama</div>}
                                    </div>
                                    <div className="ra-primary">
                                        <div className="top"><span className="v">{tr(g.count)}</span><span className="u">talep</span></div>
                                        <div className="bar"><i style={{ width: `${(g.count / funnelMax) * 100}%` }} /></div>
                                    </div>
                                    <Metric v={g.wonCount} k="satış" />
                                    <Metric v={g.wonAmount} k="ciro" isMoney />
                                </div>
                                {open && stages.length > 0 && (
                                    <div className="ra-sub-wrap">
                                        <div className="ra-sub-head">
                                            <span className="ra-sub-title">{g.name} — Aşamalar</span>
                                            <span className="ra-sub-count">{tr(stages.length)} aşama</span>
                                        </div>
                                        <div className="ra-stages">
                                            {stages.map((s, i) => (
                                                <span className="ra-stage-pill" key={`${s.name}-${i}`}>
                                                    <i style={{ background: s.color || '#cbd5e1' }} />{s.name} <b>{tr(s.count)}</b>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </Section>

                {/* ── Kaynak Bazlı ── */}
                <Section id="s-source" title="Kaynak Bazlı" meta={`${tr(sourceGroups.length)} kaynak`} cols={COLS}>
                    {sources.length === 0 ? <Empty text="Kaynak verisi bulunamadı" /> : (
                        <>
                            {sources.map(g => (
                                <div className="ra-brow" key={g.name}>
                                    <span />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start', justifyContent: 'center' }}>
                                        <div className="nm">
                                            {CHANNEL_ICONS[g.caseChannel] ? `${CHANNEL_ICONS[g.caseChannel]} ` : ''}{g.name}
                                        </div>
                                        {g.campaignName && <div className="sub" style={{ fontSize: '0.75rem', color: '#64748b' }}>Kampanya: {g.campaignName}</div>}
                                        {g.adName && <div className="sub" style={{ fontSize: '0.75rem', color: '#64748b' }}>Reklam: {g.adName}</div>}
                                    </div>
                                    <div className="ra-primary">
                                        <div className="top"><span className="v">{tr(g.count)}</span><span className="u">talep</span></div>
                                        <div className="bar"><i style={{ width: `${(g.count / sourceMax) * 100}%` }} /></div>
                                    </div>
                                    <Metric v={g.calls} k="arama" />
                                    <Metric v={g.meetings} k="görüşme" />
                                    <Metric v={g.appointments} k="randevu" />
                                    {hasProposals && <Metric v={g.proposals} k="teklif" />}
                                    <Metric v={g.orders} k="sipariş" />
                                    <Metric v={g.wonCount} k="satış" />
                                    <Metric v={g.wonAmount} k="ciro" isMoney />
                                </div>
                            ))}
                            <div className="ra-brow total">
                                <span /><div className="nm">Toplam</div>
                                <div className="ra-primary"><div className="top"><span className="v">{tr(sum(sources, g => g.count))}</span><span className="u">talep</span></div></div>
                                <Metric v={sum(sources, g => g.calls)} k="arama" />
                                <Metric v={sum(sources, g => g.meetings)} k="görüşme" />
                                <Metric v={sum(sources, g => g.appointments)} k="randevu" />
                                {hasProposals && <Metric v={sum(sources, g => g.proposals)} k="teklif" />}
                                <Metric v={sum(sources, g => g.orders)} k="sipariş" />
                                <Metric v={sum(sources, g => g.wonCount)} k="satış" />
                                <Metric v={sum(sources, g => g.wonAmount)} k="ciro" isMoney />
                            </div>
                        </>
                    )}
                </Section>

            </div>
        </div>
    );
};

export default RequestReport;
