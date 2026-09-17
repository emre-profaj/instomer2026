/**
 * ═══════════════════════════════════════════════════════════════
 * ANALİZ RAPORU
 * ═══════════════════════════════════════════════════════════════
 *
 * Aynı kişi kümesini iki eksende, üç kademeli açılımla gösterir:
 * temsilci → konu → kişiler, ve konu → temsilci → kişiler.
 * Üstelik dört ölçüt (Toplam/Numaralı/İlgili/Satış) aynı zamanda
 * çapraz süzgeç: tıklayınca alttaki bütün listeler daralır.
 *
 * SAYFANIN ÇEKTİĞİ AMA HİÇ GÖSTERMEDİĞİ İKİ ŞEY VARDI:
 *   1. contactSearch — isim/telefon/konu/temsilci üzerinde çalışan
 *      filtre mantığı yazılmış ama ARAMA KUTUSU hiç render edilmiyordu.
 *      Yazamadığınız bir arama. Kutu eklendi, mantık zaten hazırdı.
 *   2. salesList — API'den 65 satış geliyor, değişkene atanıyor ve
 *      unutuluyordu. Ayrı bir bölüm olarak eklendi.
 * (showContacts state'i de hiç kullanılmıyordu — kaldırıldı.)
 *
 * 500 SINIRI: API en fazla 500 kişi döndürüyor ama özet sayıları
 * dönemin tamamını (974) kapsıyor. Yani kartlardaki sayı ile
 * listelerdeki sayı birbirini tutmuyor — bu backend'den geliyor,
 * gizlemek yerine listenin altında açıkça yazılıyor.
 *
 * "İlgili" süzgecinin kuralı backend'dekiyle AYNI bırakıldı
 * (OPPORTUNITY / HOT_OPPORTUNITY / MEETING_PLANNED / PROPOSAL /
 * CONVERTED). Yalnızca arayüzde değiştirmek yeni bir çelişki yaratırdı.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, FileText, ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../Analytics/reportDesign.css';
import './AnalysisReport.css';

const tr = (n) => Number(n || 0).toLocaleString('tr-TR');
const money = (n) => Number(n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const dt = (s) => (s ? new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short' }).format(new Date(s)) : '—');

/** Backend'deki `relevantStatuses` ile birebir aynı olmalı. */
const RELEVANT = ['OPPORTUNITY', 'HOT_OPPORTUNITY', 'MEETING_PLANNED', 'PROPOSAL', 'CONVERTED'];
const KPI_LABELS = { withPhone: 'Numaralı', noPhone: 'Numarasız', interested: 'İlgili / Potansiyel', won: 'Satış Yapılan' };

const StageTag = ({ name, color }) => (
    name ? <span className="ra-tag" style={{ background: `${color || '#94a3b8'}14`, color: color || '#64748b' }}>{name}</span> : <span>—</span>
);

const PeopleRows = ({ list }) => {
    if (!list.length) {
        return (
            <div className="ra-people">
                <div style={{ fontSize: '.76rem', color: '#94a3b8', padding: '6px 0 6px 14px' }}>
                    Bu kırılımda listelenecek kişi yok
                </div>
            </div>
        );
    }
    return (
        <div className="ra-people">
            <div className="ra-person head">
                <span>İsim</span><span>Telefon</span><span>Konu</span><span>Aşama</span>
                <span style={{ textAlign: 'right' }}>Satış</span><span style={{ textAlign: 'right' }}>Tarih</span>
            </div>
            {list.slice(0, 10).map(c => (
                <div className="ra-person" key={c.id}>
                    <span className="nm" title={c.name}>{c.name || '—'}</span>
                    <span className="ph">{c.phone || '—'}</span>
                    <span className="c" title={c.topic}>{c.topic || '—'}</span>
                    <span className="c"><StageTag name={c.stageName} color={c.stageColor} /></span>
                    <span className="amt">{c.dealTotal ? money(c.dealTotal) : '—'}</span>
                    <span className="dt">{dt(c.createdAt)}</span>
                </div>
            ))}
            {list.length > 10 && (
                <div className="ra-people-more" style={{ paddingLeft: 14 }}>{tr(list.length - 10)} kişi daha</div>
            )}
        </div>
    );
};

/** Aşama dağılımı — hem hero'da hem açılan kırılımlarda */
const StageBreakdown = ({ stages }) => {
    const arr = Object.entries(stages || {}).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
    const total = arr.reduce((s, x) => s + x.count, 0) || 1;
    if (!arr.length) return null;
    return (
        <>
            <div className="ra-stagebar">
                {arr.map(x => <i key={x.name} style={{ width: `${(x.count / total) * 100}%`, background: x.color || '#cbd5e1' }} title={`${x.name}: ${tr(x.count)}`} />)}
            </div>
            <div className="ra-stagelist">
                {arr.slice(0, 5).map(x => (
                    <span key={x.name}><i style={{ background: x.color || '#cbd5e1' }} />{x.name} <b>{tr(x.count)}</b></span>
                ))}
                {arr.length > 5 && <span>+{arr.length - 5} aşama</span>}
            </div>
        </>
    );
};

const AnalysisReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');
    const [agentFilter, setAgentFilter] = useState('');
    const [topicFilter, setTopicFilter] = useState('');
    const [stageFilter, setStageFilter] = useState('');
    const [kpiFilter, setKpiFilter] = useState(null);
    const [contactSearch, setContactSearch] = useState('');
    const [openAgent, setOpenAgent] = useState(null);
    const [openAgentTopic, setOpenAgentTopic] = useState(null);
    const [openTopic, setOpenTopic] = useState(null);
    const [openTopicAgent, setOpenTopicAgent] = useState(null);

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const params = { ...getDateRangeLogic(dateFilter, startDate, endDate) };
            if (agentFilter) params.agentId = agentFilter;
            if (topicFilter) params.topic = topicFilter;
            if (stageFilter) params.stageId = stageFilter;
            const res = await contactAPI.getAnalysis(currentWorkspace.id, params);
            setData(res.data);
        } catch (error) {
            console.error('Analysis report error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate, agentFilter, topicFilter, stageFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    const summary = data?.summary || {};
    const pivotData = useMemo(() => data?.pivotData || [], [data]);
    const agentSummaries = useMemo(() => data?.agentSummaries || [], [data]);
    const contacts = useMemo(() => data?.contacts || [], [data]);
    const salesList = useMemo(() => data?.salesList || [], [data]);
    const filters = data?.filters || { agents: [], topics: [], stages: [] };

    /** KPI kartı bir çapraz süzgeç: alttaki bütün listeler bundan besleniyor. */
    const kpiFiltered = useMemo(() => {
        if (kpiFilter === 'withPhone') return contacts.filter(c => c.phone && c.phone.trim());
        if (kpiFilter === 'noPhone') return contacts.filter(c => !c.phone || !c.phone.trim());
        if (kpiFilter === 'interested') return contacts.filter(c => RELEVANT.includes(c.status));
        if (kpiFilter === 'won') return contacts.filter(c => c.dealTotal > 0);
        return contacts;
    }, [contacts, kpiFilter]);

    const searched = useMemo(() => {
        if (!contactSearch) return kpiFiltered;
        const q = contactSearch.toLocaleLowerCase('tr');
        return kpiFiltered.filter(c =>
            (c.name || '').toLocaleLowerCase('tr').includes(q) ||
            (c.phone || '').includes(contactSearch) ||
            (c.topic || '').toLocaleLowerCase('tr').includes(q) ||
            (c.assigneeName || '').toLocaleLowerCase('tr').includes(q)
        );
    }, [kpiFiltered, contactSearch]);

    const peopleFor = (agentId, topic) => kpiFiltered.filter(c => {
        if (agentId === '__unassigned') { if (c.assigneeId) return false; }
        else if (agentId && c.assigneeId !== agentId) return false;
        if (topic && c.topic !== topic) return false;
        return true;
    });

    const byAgent = useMemo(() => {
        const m = {};
        for (const r of pivotData) (m[r.agentId] = m[r.agentId] || []).push(r);
        return m;
    }, [pivotData]);

    const topicList = useMemo(() => {
        const m = {};
        for (const r of pivotData) {
            const t = m[r.topic] = m[r.topic] || { topic: r.topic, total: 0, won: 0, amount: 0, agents: [], stages: {} };
            t.total += r.count; t.won += r.wonCount || 0; t.amount += r.wonAmount || 0;
            t.agents.push({ id: r.agentId, name: r.agentName, count: r.count, won: r.wonCount || 0, amount: r.wonAmount || 0 });
            for (const [k, v] of Object.entries(r.stages || {})) {
                if (!t.stages[k]) t.stages[k] = { count: 0, color: v.color };
                t.stages[k].count += v.count;
            }
        }
        return Object.values(m).sort((a, b) => b.total - a.total);
    }, [pivotData]);

    const allStages = useMemo(() => {
        const m = {};
        for (const a of agentSummaries) {
            for (const [k, v] of Object.entries(a.stages || {})) {
                if (!m[k]) m[k] = { count: 0, color: v.color };
                m[k].count += v.count;
            }
        }
        return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
    }, [agentSummaries]);
    const stageMax = allStages[0]?.count || 1;

    const agentMax = Math.max(1, ...agentSummaries.map(a => a.totalCount));
    const topicMax = Math.max(1, ...topicList.map(t => t.total));
    const noPhone = Math.max(0, (summary.totalCount || 0) - (summary.withPhone || 0));
    const capped = contacts.length >= 500;

    if (loading && !data) {
        return (
            <div className="ra-page">
                <div className="ra-loading">
                    <RefreshCw className="ra-spin" size={30} />
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Analiz yükleniyor…</p>
                </div>
            </div>
        );
    }

    const STRIP = [
        { key: null, k: 'Toplam Kişi', dot: '#ef4444', v: tr(summary.totalCount), sub: 'dönemdeki kişi' },
        { key: 'withPhone', k: 'Numaralı', dot: '#0ea5e9', v: tr(summary.withPhone), sub: `%${summary.totalCount ? Math.round((summary.withPhone / summary.totalCount) * 100) : 0}` },
        { key: 'noPhone', k: 'Numarasız', dot: '#94a3b8', v: tr(noPhone), sub: 'telefon yok' },
        { key: 'interested', k: 'İlgili / Potansiyel', dot: '#f59e0b', v: tr(summary.interested), sub: `%${summary.totalCount ? Math.round((summary.interested / summary.totalCount) * 100) : 0}` },
        { key: 'won', k: 'Satış', dot: '#10b981', v: tr(summary.wonCount), sub: `${tr(summary.contactsWithDeal)} kişi` },
        { key: null, k: 'Ciro', dot: '#047857', v: money(summary.wonAmount), sub: 'kazanılan' },
    ];

    return (
        <div className="ra-page">
            <div className="ra-wrap">

                <button className="ra-back" onClick={() => navigate('/general-report')}>
                    <ArrowLeft size={15} /> Dashboard
                </button>

                <div className="ra-head">
                    <div>
                        <div className="ra-eyebrow">Raporlar</div>
                        <h1>Analiz Raporu</h1>
                        <p>Temsilci ve konu kırılımında kişi analizi</p>
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
                </div>

                <div className="ra-dims">
                    <span className="lbl">Kırılım</span>
                    <select className="ra-select" value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
                        <option value="">Tüm Temsilciler</option>
                        {filters.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <select className="ra-select" value={topicFilter} onChange={e => setTopicFilter(e.target.value)}>
                        <option value="">Tüm Konular ({tr(filters.topics.length)})</option>
                        {filters.topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select className="ra-select" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
                        <option value="">Tüm Aşamalar</option>
                        {filters.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                <div className="ra-surface ra-hero">
                    <div className="ra-hero-left">
                        <div className="ra-metric-label">Toplam Kişi</div>
                        <div className="ra-metric-value">{tr(summary.totalCount)}</div>
                        <div className="ra-metric-note">{tr(filters.topics.length)} farklı konu</div>
                        <div className="ra-split">
                            <div className="ra-split-bar">
                                <i style={{ width: `${((summary.withPhone || 0) / (summary.totalCount || 1)) * 100}%`, background: 'var(--accent)' }} />
                                <i style={{ width: `${(noPhone / (summary.totalCount || 1)) * 100}%`, background: '#cbd5e1' }} />
                            </div>
                            <div className="ra-split-legend">
                                <div className="ra-split-item">Numaralı<b>{tr(summary.withPhone)} <span style={{ fontSize: '.72rem', color: '#94a3b8', fontWeight: 600 }}>%{summary.totalCount ? Math.round((summary.withPhone / summary.totalCount) * 100) : 0}</span></b></div>
                                <div className="ra-split-item" style={{ textAlign: 'right' }}>Numarasız<b>{tr(noPhone)}</b></div>
                            </div>
                        </div>
                    </div>
                    <div className="ra-hero-right">
                        <div className="ra-chart-head">
                            <span className="ra-chart-title">Aşama dağılımı</span>
                            <span className="ra-chart-peak">{tr(allStages.length)} aşama</span>
                        </div>
                        {allStages.length ? (
                            <div className="ra-hbars">
                                {allStages.slice(0, 7).map(x => (
                                    <div className="ra-hbar" key={x.name}>
                                        <span className="nm" title={x.name}>{x.name}</span>
                                        <div className="bar"><i style={{ width: `${(x.count / stageMax) * 100}%`, background: x.color || '#cbd5e1' }} /></div>
                                        <span className="val">{tr(x.count)}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="ra-chart-empty">Aşama verisi yok</div>}
                    </div>
                </div>

                <div className="ra-surface ra-strip" style={{ marginBottom: kpiFilter ? 14 : 22 }}>
                    {STRIP.map(c => (
                        <div className={`ra-cell${c.key !== undefined ? ' click' : ''}${kpiFilter === c.key && c.key ? ' on' : ''}`}
                            key={c.k}
                            onClick={() => setKpiFilter(kpiFilter === c.key ? null : c.key)}>
                            <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: c.dot }} />{c.k}</div>
                            <div className="ra-cell-value">{c.v}</div>
                            <div className="ra-cell-sub">{c.sub}</div>
                        </div>
                    ))}
                </div>

                {kpiFilter && (
                    <div className="ra-activefilter">
                        Süzgeç: <b>{KPI_LABELS[kpiFilter]}</b> — listeler bu seçime göre daraltıldı
                        ({tr(kpiFiltered.length)} kişi)
                        <button onClick={() => setKpiFilter(null)}>✕ Kaldır</button>
                    </div>
                )}

                <div className="ra-anchors">
                    <a className="ra-anchor" href="#s-agent">Temsilciye Göre <b>{tr(agentSummaries.length)}</b></a>
                    <a className="ra-anchor" href="#s-topic">Konuya Göre <b>{tr(topicList.length)}</b></a>
                    <a className="ra-anchor" href="#s-people">Kişiler <b>{tr(searched.length)}</b></a>
                    <a className="ra-anchor" href="#s-sales">Satışlar <b>{tr(salesList.length)}</b></a>
                </div>

                {/* ── Temsilciye Göre ── */}
                <div className="ra-surface" id="s-agent" style={{ marginBottom: 22, '--cols': 2 }}>
                    <div className="ra-sec">
                        <h2>Temsilciye Göre</h2>
                        <span className="meta">{tr(agentSummaries.length)} temsilci · {tr(pivotData.length)} kırılım</span>
                    </div>
                    {agentSummaries.length === 0
                        ? <div className="ra-empty"><h3>Veri bulunamadı</h3><p>Bu dönemde kayıt yok.</p></div>
                        : agentSummaries.map(a => {
                            const rows = (byAgent[a.agentId] || []).slice().sort((x, y) => y.count - x.count);
                            const open = openAgent === a.agentId;
                            return (
                                <React.Fragment key={a.agentId}>
                                    <div className={`ra-brow clickable${open ? ' open' : ''}`}
                                        onClick={() => setOpenAgent(open ? null : a.agentId)}>
                                        <span className="caret"><ChevronRight size={14} /></span>
                                        <div><div className="nm">{a.agentName}</div><div className="sub">{tr(a.topicCount)} konu</div></div>
                                        <div className="ra-primary">
                                            <div className="top"><span className="v">{tr(a.totalCount)}</span><span className="u">kişi</span></div>
                                            <div className="bar"><i style={{ width: `${(a.totalCount / agentMax) * 100}%` }} /></div>
                                        </div>
                                        <div className="ra-metric"><div className="v">{tr(a.topicCount)}</div><div className="k">konu</div></div>
                                        <div className="ra-metric"><div className={`v${a.wonCount ? '' : ' zero'}`}>{a.wonCount ? tr(a.wonCount) : '—'}</div><div className="k">satış</div></div>
                                    </div>
                                    {open && (
                                        <>
                                            <div className="ra-sub-wrap" style={{ padding: '14px 28px 6px 58px' }}>
                                                <StageBreakdown stages={a.stages} />
                                            </div>
                                            {rows.slice(0, 8).map(r => {
                                                const k = `${a.agentId}__${r.topic}`;
                                                const o = openAgentTopic === k;
                                                return (
                                                    <React.Fragment key={k}>
                                                        <div className={`ra-lvl${o ? ' open' : ''}`} onClick={() => setOpenAgentTopic(o ? null : k)}>
                                                            <span className="caret"><ChevronRight size={11} /></span>
                                                            <span className="nm" title={r.topic}>{r.topic}</span>
                                                            <span className="n">{tr(r.count)} kişi</span>
                                                            <span className="m">{r.wonAmount ? money(r.wonAmount) : '—'}</span>
                                                        </div>
                                                        {o && <PeopleRows list={peopleFor(a.agentId, r.topic)} />}
                                                    </React.Fragment>
                                                );
                                            })}
                                            {rows.length > 8 && <div className="ra-people-more">{tr(rows.length - 8)} konu daha</div>}
                                        </>
                                    )}
                                </React.Fragment>
                            );
                        })}
                </div>

                {/* ── Konuya Göre ── */}
                <div className="ra-surface" id="s-topic" style={{ marginBottom: 22, '--cols': 2 }}>
                    <div className="ra-sec"><h2>Konuya Göre</h2><span className="meta">{tr(topicList.length)} konu</span></div>
                    {topicList.length === 0
                        ? <div className="ra-empty"><h3>Veri bulunamadı</h3><p>Bu dönemde kayıt yok.</p></div>
                        : topicList.slice(0, 30).map(t => {
                            const open = openTopic === t.topic;
                            return (
                                <React.Fragment key={t.topic}>
                                    <div className={`ra-brow clickable${open ? ' open' : ''}`}
                                        onClick={() => setOpenTopic(open ? null : t.topic)}>
                                        <span className="caret"><ChevronRight size={14} /></span>
                                        <div><div className="nm" title={t.topic}>{t.topic}</div><div className="sub">{tr(t.agents.length)} temsilci</div></div>
                                        <div className="ra-primary">
                                            <div className="top"><span className="v">{tr(t.total)}</span><span className="u">kişi</span></div>
                                            <div className="bar"><i style={{ width: `${(t.total / topicMax) * 100}%` }} /></div>
                                        </div>
                                        <div className="ra-metric"><div className={`v${t.won ? '' : ' zero'}`}>{t.won ? tr(t.won) : '—'}</div><div className="k">satış</div></div>
                                        <div className="ra-metric"><div className={`v${t.amount ? ' money' : ' zero'}`}>{t.amount ? money(t.amount) : '—'}</div><div className="k">ciro</div></div>
                                    </div>
                                    {open && (
                                        <>
                                            <div className="ra-sub-wrap" style={{ padding: '14px 28px 6px 58px' }}>
                                                <StageBreakdown stages={t.stages} />
                                            </div>
                                            {t.agents.slice().sort((x, y) => y.count - x.count).slice(0, 8).map(ag => {
                                                const k = `${t.topic}__${ag.id}`;
                                                const o = openTopicAgent === k;
                                                return (
                                                    <React.Fragment key={k}>
                                                        <div className={`ra-lvl${o ? ' open' : ''}`} onClick={() => setOpenTopicAgent(o ? null : k)}>
                                                            <span className="caret"><ChevronRight size={11} /></span>
                                                            <span className="nm">{ag.name}</span>
                                                            <span className="n">{tr(ag.count)} kişi</span>
                                                            <span className="m">{ag.amount ? money(ag.amount) : '—'}</span>
                                                        </div>
                                                        {o && <PeopleRows list={peopleFor(ag.id, t.topic)} />}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    {topicList.length > 30 && (
                        <div className="ra-people-more" style={{ paddingLeft: 28 }}>{tr(topicList.length - 30)} konu daha — en kalabalık 30 gösteriliyor</div>
                    )}
                </div>

                {/* ── Kişiler (arama kutusu buraya eklendi) ── */}
                <div className="ra-surface" id="s-people" style={{ marginBottom: 22 }}>
                    <div className="ra-list-head">
                        <h2>Kişiler<span className="ra-count">{tr(searched.length)} kayıt</span></h2>
                        <div className="ra-search">
                            <Search size={15} />
                            <input type="text" placeholder="İsim, telefon, konu veya temsilci ara…"
                                value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
                        </div>
                    </div>
                    {searched.length === 0 ? (
                        <div className="ra-empty">
                            <h3>{contactSearch ? 'Aramanızla eşleşen kişi yok' : 'Kişi bulunamadı'}</h3>
                            <p>{contactSearch ? 'Farklı bir isim, telefon veya konu deneyin.' : 'Bu dönemde kayıt yok.'}</p>
                        </div>
                    ) : (
                        <>
                            <div className="ra-plist head">
                                <span>İsim</span><span>Telefon</span><span>Konu</span><span>Aşama</span><span>Temsilci</span>
                                <span style={{ textAlign: 'right' }}>Satış</span>
                            </div>
                            {searched.slice(0, 100).map(c => (
                                <div className="ra-plist" key={c.id}>
                                    <span style={{ fontSize: '.83rem', fontWeight: 650, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name || '—'}</span>
                                    <span style={{ fontSize: '.73rem', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{c.phone || '—'}</span>
                                    <span style={{ fontSize: '.77rem', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.topic}>{c.topic || '—'}</span>
                                    <span><StageTag name={c.stageName} color={c.stageColor} /></span>
                                    <span style={{ fontSize: '.76rem', color: 'var(--ink-2)' }}>{c.assigneeName || 'Atanmamış'}</span>
                                    <span style={{ fontSize: '.8rem', fontWeight: 700, color: c.dealTotal ? '#047857' : '#d7dce3', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {c.dealTotal ? money(c.dealTotal) : '—'}
                                    </span>
                                </div>
                            ))}
                            {searched.length > 100 && (
                                <div className="ra-people-more" style={{ paddingLeft: 28 }}>{tr(searched.length - 100)} kişi daha — ilk 100 gösteriliyor</div>
                            )}
                        </>
                    )}
                    {capped && (
                        <div className="ra-people-more" style={{ paddingLeft: 28 }}>
                            Liste en fazla 500 kişi getirir — üstteki kart sayıları dönemin tamamını kapsar, listeler bu 500 kaydı.
                        </div>
                    )}
                </div>

                {/* ── Satışlar (eskiden çekiliyor ama gösterilmiyordu) ── */}
                <div className="ra-surface" id="s-sales">
                    <div className="ra-sec">
                        <h2>Satışlar</h2>
                        <span className="meta">{tr(salesList.length)} satış · {money(summary.wonAmount)}</span>
                    </div>
                    {salesList.length === 0 ? (
                        <div className="ra-empty"><h3>Satış kaydı yok</h3><p>Bu dönemde kazanılmış satış bulunamadı.</p></div>
                    ) : (
                        <>
                            <div className="ra-plist head">
                                <span>Müşteri</span><span>Telefon</span><span>Başlık</span><span>Konu</span><span>Temsilci</span>
                                <span style={{ textAlign: 'right' }}>Tutar</span>
                            </div>
                            {salesList.map(x => (
                                <div className="ra-plist" key={x.dealId}>
                                    <span style={{ fontSize: '.83rem', fontWeight: 650, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.contactName || '—'}</span>
                                    <span style={{ fontSize: '.73rem', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{x.phone || '—'}</span>
                                    <span style={{ fontSize: '.78rem', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.title}>{x.title || '—'}</span>
                                    <span style={{ fontSize: '.76rem', color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.topic || '—'}</span>
                                    <span style={{ fontSize: '.76rem', color: 'var(--ink-2)' }}>{x.agentName || x.assigneeName || '—'}</span>
                                    <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#047857', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(x.amount)}</span>
                                </div>
                            ))}
                        </>
                    )}
                </div>

            </div>
        </div>
    );
};

export default AnalysisReport;
