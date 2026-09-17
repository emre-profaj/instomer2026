/**
 * ═══════════════════════════════════════════════════════════════
 * SATIŞ RAPORU
 * ═══════════════════════════════════════════════════════════════
 *
 * Aynı satış kümesini üç eksende, her biri ÜÇ KADEMELİ açılımla
 * gösteriyor: konu → temsilci → tek tek satışlar (ve temsilci → konu,
 * kaynak → temsilci). Dördüncü bölüm düz satış listesi.
 * Ortak rapor dili: reportDesign.css.
 *
 * Eski sayfadaki her şey duruyor: geri düğmesi, toplam tutar/adet,
 * üç eksenli üç kademeli açılım, satış satırında kişi/başlık/kaynak/
 * tutar/tarih, 8 kolonlu tüm satış listesi, kategori ikonu ve rengi.
 *
 * Eklenenler:
 *   • Hero'da kaynak dağılımı — Metropol Eylül 2026'da cironun %90'ı
 *     "Manuel" kaynaktan geliyor, dijital kanallar toplam %10. Aynı ay
 *     1128 sohbet var; satış kaydı açılırken kaynak taşınmıyor gibi
 *     görünüyor. Sayı hero'da durunca sorun görünür oluyor.
 *   • Grup satırlarında ORTALAMA — 27 satıştan 2 milyon çıkaran
 *     kategoriyle 1 satıştan 130 bin çıkaran kategori aynı değil.
 *   • Her dökümün altında Toplam satırı (eskiden gruplar toplanmıyordu).
 *   • Şeritte "En Yüksek" tek satış.
 */
import React, { useState, useEffect } from 'react';
import { RefreshCw, FileText, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../Analytics/reportDesign.css';
import './SalesReport.css';

const tr = (n) => Number(n || 0).toLocaleString('tr-TR');
const money = (n) => Number(n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const shortDate = (s) => {
    const d = new Date(s);
    return isNaN(d) ? '—' : new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: '2-digit',
    }).format(d);
};
const SRC_COLORS = ['#ef4444', '#f59e0b', '#6366f1', '#a78bfa', '#cbd5e1'];

const SaleLines = ({ list }) => (
    list.length === 0 ? null : (
        <div className="ra-sales">
            {list.map(s => (
                <div className="ra-sale" key={s.id}>
                    <span className="who" title={s.contactName}>{s.contactName}</span>
                    <span className="ttl" title={s.title}>{s.title}</span>
                    <span className="src">{s.source || '—'}</span>
                    <span className="amt">{money(s.amount)}</span>
                    <span className="dt">{shortDate(s.createdAt)}</span>
                </div>
            ))}
        </div>
    )
);

/**
 * Üç eksenin tamamı aynı kalıp: grup → alt grup → tek tek satışlar.
 * axis, açılım durumlarını birbirinden ayırmak için anahtar öneki.
 *
 * Bileşen modül düzeyinde: render içinde tanımlansaydı her render'da
 * yeniden yaratılıp açılmış grupların alt ağacı boşuna yeniden bağlanırdı.
 */
const Drill = ({ axis, id, title, meta, groups, max, fallbackColor, subKey, subLabel, salesFor, openGroup, openSub, setOpenGroup, setOpenSub }) => {
    if (groups.length === 0) {
        return (
            <div className="ra-surface" id={id} style={{ marginBottom: 22, '--cols': 2 }}>
                <div className="ra-sec"><h2>{title}</h2><span className="meta">{meta}</span></div>
                <div className="ra-empty"><h3>Kayıt yok</h3><p>Bu dönemde satış bulunamadı.</p></div>
            </div>
        );
    }
    return (
        <div className="ra-surface" id={id} style={{ marginBottom: 22, '--cols': 2 }}>
            <div className="ra-sec"><h2>{title}</h2><span className="meta">{meta}</span></div>
            {groups.map((g, gi) => {
                const gKey = `${axis}__${g.name}`;
                const gOpen = !!openGroup[gKey];
                const subs = g[subKey] || [];
                return (
                    <React.Fragment key={g.name || gi}>
                        <div className={`ra-brow clickable${gOpen ? ' open' : ''}`}
                            onClick={() => setOpenGroup(p => ({ ...p, [gKey]: !p[gKey] }))}>
                            <span className="caret"><ChevronRight size={14} /></span>
                            <div>
                                <div className="nm">{g.icon ? `${g.icon} ` : ''}{g.name}</div>
                                {subs.length > 0 && <div className="sub">{tr(subs.length)} {subLabel}</div>}
                            </div>
                            <div className="ra-primary">
                                <div className="top"><span className="v">{money(g.amount)}</span><span className="u">ciro</span></div>
                                <div className="bar"><i style={{ width: `${(g.amount / max) * 100}%`, background: g.color || fallbackColor }} /></div>
                            </div>
                            <div className="ra-metric"><div className="v">{tr(g.count)}</div><div className="k">adet</div></div>
                            <div className="ra-metric"><div className="v">{g.count ? money(g.amount / g.count) : '—'}</div><div className="k">ortalama</div></div>
                        </div>
                        {gOpen && subs.map((s, si) => {
                            const sKey = `${gKey}__${s.name}`;
                            const sOpen = !!openSub[sKey];
                            return (
                                <React.Fragment key={s.name || si}>
                                    <div className={`ra-lvl2${sOpen ? ' open' : ''}`}
                                        onClick={() => setOpenSub(p => ({ ...p, [sKey]: !p[sKey] }))}>
                                        <span className="caret"><ChevronRight size={11} /></span>
                                        <span className="ico">{s.icon || '👤'}</span>
                                        <span className="nm">{s.name}</span>
                                        <span className="cnt">{tr(s.count)} adet</span>
                                        <span className="amt">{money(s.amount)}</span>
                                    </div>
                                    {sOpen && <SaleLines list={salesFor(g, s)} />}
                                </React.Fragment>
                            );
                        })}
                    </React.Fragment>
                );
            })}
            <div className="ra-brow total">
                <span /><div className="nm">Toplam</div>
                <div className="ra-primary">
                    <div className="top"><span className="v">{money(groups.reduce((s, g) => s + g.amount, 0))}</span><span className="u">ciro</span></div>
                </div>
                <div className="ra-metric"><div className="v">{tr(groups.reduce((s, g) => s + g.count, 0))}</div><div className="k">adet</div></div>
                <div className="ra-metric"><div className="v">—</div><div className="k">ortalama</div></div>
            </div>
        </div>
    );
};


const SalesReport = () => {
    const { currentWorkspace } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');
    // Birinci ve ikinci kademe açılımları — üç eksen için ayrı ayrı
    const [openGroup, setOpenGroup] = useState({});
    const [openSub, setOpenSub] = useState({});

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const res = await contactAPI.getSalesReport(
                currentWorkspace.id, getDateRangeLogic(dateFilter, startDate, endDate)
            );
            setData(res.data);
        } catch (err) {
            console.error('Sales report error:', err);
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
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Satış Raporu yükleniyor…</p>
                </div>
            </div>
        );
    }

    const {
        totalCount = 0, totalAmount = 0,
        topicGroups = [], agentGroups = [], sourceGroups = [], salesList = [],
    } = data || {};

    const maxTopic = topicGroups[0]?.amount || 1;
    const maxAgent = agentGroups[0]?.amount || 1;
    const maxSource = sourceGroups[0]?.amount || 1;
    const biggest = salesList.length ? Math.max(...salesList.map(s => s.amount || 0)) : 0;
    const srcTotal = sourceGroups.reduce((s, x) => s + (x.amount || 0), 0) || 1;

    const strip = [
        { label: 'Satış Adedi', dot: '#ef4444', value: tr(totalCount), sub: 'kazanılan kayıt' },
        { label: 'Ortalama', dot: '#f59e0b', value: totalCount ? money(totalAmount / totalCount) : '—', sub: 'satış başına' },
        { label: 'En Yüksek', dot: '#047857', value: biggest ? money(biggest) : '—', sub: 'tek satış' },
        { label: 'Kategori', dot: '#6366f1', value: tr(topicGroups.length), sub: 'konu' },
        { label: 'Temsilci', dot: '#0ea5e9', value: tr(agentGroups.length), sub: 'satış yapan' },
        { label: 'Kaynak', dot: '#a78bfa', value: tr(sourceGroups.length), sub: 'geliş kanalı' },
    ];

    return (
        <div className="ra-page">
            <div className="ra-wrap">

                <div className="ra-head">
                    <div>
                        <div className="ra-eyebrow">Raporlar</div>
                        <h1>Satış Raporu</h1>
                        <p>Konu, temsilci ve kaynak bazlı satış analizi</p>
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
                        <div className="ra-metric-label">Toplam Satış</div>
                        <div className="ra-metric-value" style={{ fontSize: '2.9rem' }}>{money(totalAmount)}</div>
                        <div className="ra-metric-note">
                            {tr(totalCount)} satış · ortalama {totalCount ? money(totalAmount / totalCount) : '—'}
                        </div>
                        {sourceGroups.length > 0 && (
                            <div className="ra-split">
                                <div className="ra-bar">
                                    {sourceGroups.map((s, i) => (
                                        <span key={s.name} style={{ width: `${(s.amount / srcTotal) * 100}%`, background: SRC_COLORS[i % SRC_COLORS.length] }}
                                            title={`${s.name}: ${money(s.amount)}`} />
                                    ))}
                                </div>
                                <div className="ra-legend" style={{ marginTop: 12 }}>
                                    {sourceGroups.map((s, i) => (
                                        <div className="ra-legend-item" key={s.name}>
                                            <i className="ra-dot" style={{ background: SRC_COLORS[i % SRC_COLORS.length] }} />
                                            <span className="ra-legend-text">{s.name}</span>
                                            <span className="ra-legend-count">%{Math.round((s.amount / srcTotal) * 100)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="ra-hero-right">
                        <div className="ra-chart-head">
                            <span className="ra-chart-title">En çok satan konular</span>
                            <span className="ra-chart-peak">{tr(topicGroups.length)} kategori</span>
                        </div>
                        <div className="ra-tops">
                            {topicGroups.length === 0
                                ? <div style={{ fontSize: '.8rem', color: '#94a3b8' }}>Bu dönemde satış yok</div>
                                : topicGroups.slice(0, 6).map(t => (
                                    <div className="ra-toprow" key={t.name}>
                                        <span className="nm" title={t.name}>{t.icon ? `${t.icon} ` : ''}{t.name}</span>
                                        <div className="bar"><i style={{ width: `${(t.amount / maxTopic) * 100}%`, background: t.color || '#ef4444' }} /></div>
                                        <span className="val">{money(t.amount)}</span>
                                    </div>
                                ))}
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
                    <a className="ra-anchor" href="#s-topic">Konu <b>{tr(topicGroups.length)}</b></a>
                    <a className="ra-anchor" href="#s-agent">Temsilci <b>{tr(agentGroups.length)}</b></a>
                    <a className="ra-anchor" href="#s-source">Kaynak <b>{tr(sourceGroups.length)}</b></a>
                    <a className="ra-anchor" href="#s-list">Tüm Satışlar <b>{tr(salesList.length)}</b></a>
                </div>

                <Drill axis="topic" id="s-topic" title="Konuya Göre Satış"
                    meta={`${tr(topicGroups.length)} kategori`} groups={topicGroups} max={maxTopic}
                    fallbackColor="#ef4444" subKey="agents" subLabel="temsilci"
                    salesFor={(g, s) => salesList.filter(x => x.categoryName === g.name && x.agentName === s.name)}
                    openGroup={openGroup} openSub={openSub} setOpenGroup={setOpenGroup} setOpenSub={setOpenSub} />

                <Drill axis="agent" id="s-agent" title="Temsilciye Göre Satış"
                    meta={`${tr(agentGroups.length)} temsilci`} groups={agentGroups} max={maxAgent}
                    fallbackColor="#6366f1" subKey="topics" subLabel="konu"
                    salesFor={(g, s) => salesList.filter(x => x.agentName === g.name && x.categoryName === s.name)}
                    openGroup={openGroup} openSub={openSub} setOpenGroup={setOpenGroup} setOpenSub={setOpenSub} />

                <Drill axis="source" id="s-source" title="Kaynağa Göre Satış"
                    meta={`${tr(sourceGroups.length)} kaynak`} groups={sourceGroups} max={maxSource}
                    fallbackColor="#a78bfa" subKey="agents" subLabel="temsilci"
                    salesFor={(g, s) => salesList.filter(x => (x.source || 'Bilinmeyen') === g.name && x.agentName === s.name)}
                    openGroup={openGroup} openSub={openSub} setOpenGroup={setOpenGroup} setOpenSub={setOpenSub} />

                <div className="ra-surface" id="s-list">
                    <div className="ra-sec">
                        <h2>Tüm Satış Listesi</h2>
                        <span className="meta">{tr(salesList.length)} satış</span>
                    </div>
                    {salesList.length === 0 ? (
                        <div className="ra-empty">
                            <h3>Satış kaydı yok</h3>
                            <p>Bu dönemde kazanılmış satış bulunamadı.</p>
                        </div>
                    ) : (
                        <>
                            <div className="ra-slist head">
                                <span>#</span><span>Müşteri</span><span>Kategori</span><span>Temsilci</span>
                                <span>Başlık</span><span>Kaynak</span>
                                <span style={{ textAlign: 'right' }}>Tutar</span><span style={{ textAlign: 'right' }}>Tarih</span>
                            </div>
                            {salesList.map((s, i) => (
                                <div className="ra-slist" key={s.id}>
                                    <span className={`no${i < 3 ? ' top' : ''}`}>{i + 1}</span>
                                    <div>
                                        <div className="nm" title={s.contactName}>{s.contactName}</div>
                                        {s.contactPhone && <div className="ph">{s.contactPhone}</div>}
                                    </div>
                                    <span className="cell">
                                        <span className="ra-tag" style={{
                                            background: s.categoryColor ? `${s.categoryColor}14` : '#f1f5f9',
                                            color: s.categoryColor || '#64748b',
                                        }}>
                                            {s.categoryIcon ? `${s.categoryIcon} ` : ''}{s.categoryName}
                                        </span>
                                    </span>
                                    <span className="cell">{s.agentName || '—'}</span>
                                    <span className="cell" title={s.title}>{s.title}</span>
                                    <span className="cell">
                                        <span className="ra-tag" style={{ background: '#f8fafc', color: '#64748b' }}>{s.source || '—'}</span>
                                    </span>
                                    <span className="money">{money(s.amount)}</span>
                                    <span className="dt">{shortDate(s.createdAt)}</span>
                                </div>
                            ))}
                        </>
                    )}
                </div>

            </div>
        </div>
    );
};

export default SalesReport;
