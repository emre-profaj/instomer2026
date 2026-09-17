/**
 * ═══════════════════════════════════════════════════════════════
 * TAKIM VE TEMSİLCİLER
 * ═══════════════════════════════════════════════════════════════
 *
 * Ortak rapor dili (reportDesign.css), düzen 11 kolonluk lig
 * tablosundan sıralı satırlara geçti. Eski sayfadaki HER ŞEY duruyor:
 * geri düğmesi, dört özet ölçüt, iki görünüm (Herkes / Takımlara Göre),
 * altı sıralama seçeneği, konu dağılımı, Takım Toplamı satırı, takımsız
 * grubu, bot rozeti, profil fotoğrafı desteği.
 *
 * İki bilinçli fark:
 *
 * 1. BOTLAR "Herkes" SIRALAMASINDA AYRI. Metropol'de sohbetlerin
 *    %67'sini bot karşılıyor; aynı listede sıralanınca bot hep tepede,
 *    her temsilci "geride" görünüyordu. "Takımlara Göre" görünümünde
 *    ise botlar kendi takımlarında duruyor — eski davranış.
 *
 * 2. ÇÖZÜM ORANI İKİ AYRI HÜCRE. Eski "Ort. Çözüm Oranı" kişi
 *    oranlarının ortalamasıydı: 1 sohbetli biri 109 sohbetli biriyle
 *    eşit ağırlıkta. Metropol'de bu %36 veriyor, oysa çözülen/toplam
 *    %62. İkisi de doğru ama farklı soruların cevabı, ikisi de
 *    ne ölçtüğü yazılarak gösteriliyor.
 *
 * Veri boşsa kolon gösterilmiyor: teklif/sipariş/ciro yoksa satır
 * daralıyor (Mia Yapı'da 6, Metropol'de 8 metrik).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, FileText, ArrowLeft, ChevronRight, Bot, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../Analytics/reportDesign.css';
import './TeamReport.css';

const tr = (n) => Number(n || 0).toLocaleString('tr-TR');
const money = (n) => Number(n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

const AVATARS = [
    ['#fef2f2', '#b91c1c'], ['#fff7ed', '#c2410c'], ['#fffbeb', '#b45309'],
    ['#f8fafc', '#475569'], ['#fdf2f8', '#be185d'], ['#f5f3ff', '#6d28d9'],
];
const faceOf = (name) => {
    const s = String(name || '?');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const [bg, color] = AVATARS[h % AVATARS.length];
    const ini = s.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toLocaleUpperCase('tr');
    return { bg, color, ini: ini || '?' };
};

/** Sıralama seçenekleri — eski sayfadaki altı seçeneğin aynısı. */
const SORTS = [
    { key: 'totalConversations', label: 'Sohbet', unit: 'sohbet' },
    { key: 'callCount', label: 'Arama', unit: 'arama' },
    { key: 'resolutionRate', label: 'Çözüm %', unit: '%', suffix: '%' },
    { key: 'dealOrders', label: 'Sipariş', unit: 'sipariş', needsDeals: true },
    { key: 'dealTotalAmount', label: 'Ciro', unit: 'ciro', money: true, needsDeals: true },
    { key: 'avgResponseTime', label: 'Yanıt Süresi', unit: 'dk', suffix: ' dk', invert: true },
];

const TeamReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');
    const [sortBy, setSortBy] = useState('totalConversations');
    const [viewMode, setViewMode] = useState('flat');
    const [expandedAgent, setExpandedAgent] = useState(null);

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const res = await contactAPI.getAgentPerformance(
                currentWorkspace.id, getDateRangeLogic(dateFilter, startDate, endDate)
            );
            setAgentPerformance(res.data);
        } catch (error) {
            console.error('Error fetching team report:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

    const teamTotals = agentPerformance?.teamTotals || {};
    const apiTeams = useMemo(() => agentPerformance?.teams || [], [agentPerformance]);

    const normalize = (m, isBot) => ({
        ...m,
        id: (isBot ? m.botId : m.userId) || m.id,
        userId: (isBot ? m.botId : m.userId) || m.id,
        isBot,
        totalConversations: m.totalConversations || 0,
        resolvedConversations: m.resolvedConversations || 0,
        messagesSent: m.messagesSent || 0,
        callCount: m.callCount || 0,
        meetingCount: m.meetingCount || 0,
        appointmentCount: m.appointmentCount || 0,
        dealQuotes: m.dealQuotes || 0,
        dealOrders: m.dealOrders || 0,
        dealTotalAmount: m.dealTotalAmount || 0,
        resolutionRate: m.resolutionRate || 0,
        avgResponseTime: m.avgResponseTime || m.avgResponseTimeMinutes || 0,
        teams: m.teams || [],
    });

    const humans = useMemo(
        () => (agentPerformance?.agents || []).map(a => normalize(a, false)),
        [agentPerformance]
    );
    const bots = useMemo(
        () => (agentPerformance?.bots || []).map(b => normalize(b, true)),
        [agentPerformance]
    );
    const allMembers = useMemo(() => [...humans, ...bots], [humans, bots]);

    const hasQuotes = allMembers.some(m => m.dealQuotes > 0);
    const hasOrders = allMembers.some(m => m.dealOrders > 0 || m.dealTotalAmount > 0);

    /** Satırdaki ikincil ölçütler. Verisi olmayan ticari kolonlar hiç çıkmaz. */
    const METRICS = useMemo(() => [
        { k: 'messagesSent', label: 'yazışma' },
        { k: 'callCount', label: 'arama' },
        { k: 'meetingCount', label: 'görüşme' },
        { k: 'appointmentCount', label: 'randevu' },
        { k: 'resolutionRate', label: 'çözüm', suffix: '%' },
        ...(hasQuotes ? [{ k: 'dealQuotes', label: 'teklif' }] : []),
        ...(hasOrders ? [{ k: 'dealOrders', label: 'sipariş' }, { k: 'dealTotalAmount', label: 'ciro', money: true }] : []),
        { k: 'avgResponseTime', label: 'yanıt', suffix: ' dk' },
    ], [hasQuotes, hasOrders]);

    const sortDef = SORTS.find(s => s.key === sortBy) || SORTS[0];
    const sortList = (list) => [...list].sort((a, b) => {
        const av = a[sortBy] || 0, bv = b[sortBy] || 0;
        if (sortDef.invert) {
            // Küçük olan iyi; sıfır "veri yok" demek, sona atılır
            const x = av || Infinity, y = bv || Infinity;
            return x - y;
        }
        return bv - av;
    });

    const sortedHumans = useMemo(() => sortList(humans.filter(m =>
        m.totalConversations > 0 || m.callCount > 0 || m.dealOrders > 0 || m.messagesSent > 0
    )), [humans, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps
    const sortedBots = useMemo(() => sortList(bots), [bots, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps
    const idleCount = humans.length - sortedHumans.length;

    const sortMax = Math.max(1, ...sortedHumans.map(m => m[sortBy] || 0));

    const humanConv = humans.reduce((s, m) => s + m.totalConversations, 0);
    const botConv = bots.reduce((s, m) => s + m.totalConversations, 0);
    const allConv = humanConv + botConv;

    const activeAll = allMembers.filter(m => m.totalConversations > 0);
    const resolvedAll = activeAll.reduce((s, m) => s + m.resolvedConversations, 0);
    const rateWeighted = allConv ? Math.round((resolvedAll / allConv) * 100) : 0;
    const rateSimple = teamTotals.avgResolutionRate
        ?? (humans.length ? Math.round(humans.reduce((s, m) => s + m.resolutionRate, 0) / humans.length) : 0);
    const rtAgents = humans.filter(m => m.avgResponseTime > 0);
    const avgRT = teamTotals.avgResponseTime
        ?? (rtAgents.length ? Math.round(rtAgents.reduce((s, m) => s + m.avgResponseTime, 0) / rtAgents.length) : 0);

    const STRIP = [
        { label: 'Çözülen', dot: '#10b981', value: tr(resolvedAll), sub: 'kapatılan sohbet' },
        { label: 'Açık', dot: '#f59e0b', value: tr(teamTotals.openConversations ?? Math.max(0, allConv - resolvedAll)), sub: 'sürüyor' },
        { label: 'Çözüm Oranı', dot: '#ef4444', value: `%${rateWeighted}`, sub: 'çözülen / toplam' },
        { label: 'Kişi Başı Ort.', dot: '#94a3b8', value: `%${rateSimple}`, sub: 'temsilci oranlarının ortalaması' },
        { label: 'Ort. Yanıt', dot: '#6366f1', value: `${avgRT} dk`, sub: `${tr(rtAgents.length)} temsilci · bot hariç` },
        { label: 'Yazışma', dot: '#0ea5e9', value: tr(teamTotals.totalMessages ?? humans.reduce((s, m) => s + m.messagesSent, 0)), sub: 'temsilci mesajı' },
    ];

    const teamBars = useMemo(() => {
        const rows = apiTeams
            .map(t => ({ name: t.name, color: t.color || '#ef4444', total: t.conversationCount || 0 }))
            .filter(t => t.total > 0)
            .sort((a, b) => b.total - a.total);
        return { rows, max: rows.length ? rows[0].total : 1 };
    }, [apiTeams]);

    const groupedTeams = useMemo(() => {
        const cards = apiTeams.map(t => ({
            team: t,
            members: sortList(allMembers.filter(m => (m.teams || []).some(x => x.id === t.id))),
        }));
        const teamless = sortList(allMembers.filter(m => !(m.teams || []).length));
        return { cards, teamless };
    }, [apiTeams, allMembers, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

    const sumTeam = (ms) => {
        const t = {};
        for (const x of METRICS) t[x.k] = ms.reduce((s, m) => s + (m[x.k] || 0), 0);
        t.resolutionRate = ms.length ? Math.round(ms.reduce((s, m) => s + m.resolutionRate, 0) / ms.length) : 0;
        const rt = ms.filter(m => m.avgResponseTime > 0);
        t.avgResponseTime = rt.length ? Math.round(rt.reduce((s, m) => s + m.avgResponseTime, 0) / rt.length) : 0;
        t.totalConversations = ms.reduce((s, m) => s + m.totalConversations, 0);
        return t;
    };

    const topicsOf = (m) => Object.entries(m.topicBreakdown || {}).sort((a, b) => b[1].count - a[1].count);

    const MemberRow = ({ m, i, showPos }) => {
        const f = faceOf(m.name);
        const topics = topicsOf(m);
        const open = expandedAgent === m.userId;
        const primary = m[sortBy] || 0;
        const primaryText = sortDef.money ? money(primary) : `${tr(primary)}${sortDef.suffix || ''}`;
        return (
            <>
                <div className={`ra-member${open ? ' open' : ''}${topics.length ? ' clickable' : ''}`}
                    onClick={topics.length ? () => setExpandedAgent(open ? null : m.userId) : undefined}>
                    {topics.length
                        ? <span className="ra-caret"><ChevronRight size={14} /></span>
                        : showPos
                            ? <span className={`ra-pos${i < 3 ? ' top' : ''}`}>{i + 1}</span>
                            : <span />}
                    <div className={`ra-face${m.isBot ? ' bot' : ''}`}
                        style={m.isBot ? undefined : { background: f.bg, color: f.color }}>
                        {m.isBot ? <Bot size={17} /> : (m.avatar ? <img src={m.avatar} alt="" /> : f.ini)}
                    </div>
                    <div>
                        <div className="ra-m-name">
                            {m.name}
                            {m.isBot && <span className="ra-chip" style={{ background: '#eff6ff', color: '#1d4ed8' }}>BOT</span>}
                        </div>
                        <div className="ra-m-sub">
                            {m.isBot ? 'Yapay zekâ' : (m.role === 'OWNER' ? 'Yönetici' : 'Temsilci')}
                            {(m.teams || []).length ? ` · ${m.teams.map(t => t.name).join(' · ')}` : ''}
                        </div>
                    </div>
                    <div className="ra-primary">
                        <div className="top"><span className="v">{primaryText}</span><span className="u">{sortDef.unit}</span></div>
                        <div className="bar"><i style={{ width: `${Math.min(100, (primary / sortMax) * 100)}%` }} /></div>
                    </div>
                    {METRICS.map(x => {
                        const v = m[x.k] || 0;
                        const txt = x.money ? money(v) : `${tr(v)}${x.suffix || ''}`;
                        return (
                            <div className="ra-metric" key={x.k}>
                                <div className={`v${v ? '' : ' zero'}`}>{v ? txt : '—'}</div>
                                <div className="k">{x.label}</div>
                            </div>
                        );
                    })}
                </div>
                {open && topics.length > 0 && <TopicPanel m={m} rows={topics} />}
            </>
        );
    };

    const TopicPanel = ({ m, rows }) => {
        const shown = rows.slice(0, 20);
        const T = rows.reduce((a, [, d]) => ({
            c: a.c + d.count, o: a.o + (d.opportunity || 0),
            w: a.w + (d.wonCount || d.converted || 0), am: a.am + (d.wonAmount || 0),
        }), { c: 0, o: 0, w: 0, am: 0 });
        const cell = (v, money_) => (
            <span className={`n${v ? (money_ ? ' money' : '') : ' zero'}`}>
                {v ? (money_ ? money(v) : tr(v)) : '—'}
            </span>
        );
        return (
            <div className="ra-topics-wrap">
                <div className="ra-topics-head">
                    <span className="ra-topics-title">{m.name} — Konu Dağılımı</span>
                    <span className="ra-topics-count">{tr(rows.length)} konu</span>
                </div>
                <div className="ra-trow head">
                    <span>Konu</span>
                    <span style={{ textAlign: 'right' }}>Talep</span>
                    <span style={{ textAlign: 'right' }}>İlgili</span>
                    <span style={{ textAlign: 'right' }}>Satış</span>
                    <span style={{ textAlign: 'right' }}>Ciro</span>
                </div>
                {shown.map(([topic, d]) => (
                    <div className="ra-trow" key={topic}>
                        <span className="t" title={topic}>{topic}</span>
                        {cell(d.count)}{cell(d.opportunity)}{cell(d.wonCount || d.converted)}{cell(d.wonAmount, true)}
                    </div>
                ))}
                <div className="ra-trow total">
                    <span className="t">Toplam</span>
                    <span className="n">{tr(T.c)}</span>
                    <span className="n">{tr(T.o)}</span>
                    <span className="n">{tr(T.w)}</span>
                    <span className="n money">{money(T.am)}</span>
                </div>
                {rows.length > 20 && (
                    <div className="ra-topics-more">{tr(rows.length - 20)} konu daha — ilk 20 gösteriliyor</div>
                )}
            </div>
        );
    };

    const TeamCard = ({ team, members }) => {
        const t = sumTeam(members);
        return (
            <div className="ra-teamcard">
                <div className="ra-teamcard-head" style={{ background: `${team.color || '#94a3b8'}0d` }}>
                    <div className="nm">
                        <span className="ra-teamdot" style={{ background: team.color || '#94a3b8' }} />
                        <h3>{team.name}</h3>
                        {team.description && <span className="desc">— {team.description}</span>}
                    </div>
                    <span className="cnt">{tr(members.length)} üye (temsilci/bot)</span>
                </div>
                {members.length === 0 ? (
                    <div className="ra-empty-team">Bu takımda henüz üye yok</div>
                ) : (
                    <>
                        {members.map((m, i) => <MemberRow key={m.userId} m={m} i={i} showPos={false} />)}
                        <div className="ra-teamsum">
                            <span className="lbl">Takım Toplamı · {tr(t.totalConversations)} sohbet</span>
                            {METRICS.map(x => {
                                const v = t[x.k] || 0;
                                return (
                                    <span className="v" key={x.k}>
                                        {v ? (x.money ? money(v) : `${tr(v)}${x.suffix || ''}`) : '—'}
                                    </span>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        );
    };

    if (loading && !agentPerformance) {
        return (
            <div className="ra-page">
                <div className="ra-loading">
                    <RefreshCw className="ra-spin" size={30} />
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Takım raporu yükleniyor…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="ra-page" style={{ '--metrics': METRICS.length }}>
            <div className="ra-wrap">

                <button className="ra-back" onClick={() => navigate('/general-report')}>
                    <ArrowLeft size={15} /> Dashboard
                </button>

                <div className="ra-head">
                    <div>
                        <div className="ra-eyebrow">Raporlar</div>
                        <h1>Takım ve Temsilciler</h1>
                        <p>Temsilci ve yapay zekâ performansı</p>
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
                        <div className="ra-metric-label">Toplam Sohbet</div>
                        <div className="ra-metric-value">{tr(allConv)}</div>
                        <div className="ra-metric-note">{tr(humans.length)} temsilci · {tr(bots.length)} bot</div>
                        <div className="ra-split">
                            <div className="ra-split-bar">
                                <i style={{ width: `${allConv ? (botConv / allConv) * 100 : 0}%`, background: 'var(--accent)' }} title={`Bot: ${botConv}`} />
                                <i style={{ width: `${allConv ? (humanConv / allConv) * 100 : 0}%`, background: '#cbd5e1' }} title={`Temsilci: ${humanConv}`} />
                            </div>
                            <div className="ra-split-legend">
                                <div className="ra-split-item">Bot karşıladı<b>{tr(botConv)} <span style={{ fontSize: '.72rem', color: '#94a3b8', fontWeight: 600 }}>%{allConv ? Math.round((botConv / allConv) * 100) : 0}</span></b></div>
                                <div className="ra-split-item" style={{ textAlign: 'right' }}>Temsilci<b>{tr(humanConv)} <span style={{ fontSize: '.72rem', color: '#94a3b8', fontWeight: 600 }}>%{allConv ? Math.round((humanConv / allConv) * 100) : 0}</span></b></div>
                            </div>
                        </div>
                    </div>
                    <div className="ra-hero-right">
                        <div className="ra-chart-head">
                            <span className="ra-chart-title">Takımlara göre sohbet</span>
                            <span className="ra-chart-peak">{tr(teamBars.rows.length)} takım</span>
                        </div>
                        <div className="ra-teams">
                            {teamBars.rows.length ? teamBars.rows.map(t => (
                                <div className="ra-teamrow" key={t.name}>
                                    <span className="nm" title={t.name}>{t.name}</span>
                                    <div className="bar"><i style={{ width: `${(t.total / teamBars.max) * 100}%`, background: t.color }} /></div>
                                    <span className="val">{tr(t.total)}</span>
                                </div>
                            )) : <div style={{ fontSize: '.8rem', color: '#94a3b8' }}>Takıma bağlı sohbet yok</div>}
                        </div>
                    </div>
                </div>

                <div className="ra-surface ra-strip" style={{ marginBottom: 22 }}>
                    {STRIP.map(c => (
                        <div className="ra-cell" key={c.label}>
                            <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: c.dot }} />{c.label}</div>
                            <div className="ra-cell-value">{c.value}</div>
                            <div className="ra-cell-sub">{c.sub}</div>
                        </div>
                    ))}
                </div>

                <div className="ra-surface">
                    <div className="ra-sec">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <h2>{viewMode === 'flat' ? 'Temsilciler' : 'Takımlar'}</h2>
                            <div className="ra-seg" role="group" aria-label="Görünüm">
                                <button className={viewMode === 'flat' ? 'active' : ''} onClick={() => setViewMode('flat')}>Herkes</button>
                                <button className={viewMode === 'team-grouped' ? 'active' : ''} onClick={() => setViewMode('team-grouped')}>Takımlara Göre</button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <span className="meta">sırala</span>
                            <div className="ra-pills">
                                {SORTS.filter(s => !s.needsDeals || hasOrders).map(s => (
                                    <button key={s.key} className={`ra-pill${sortBy === s.key ? ' active' : ''}`}
                                        onClick={() => setSortBy(s.key)}>{s.label}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {viewMode === 'flat' ? (
                        <>
                            {sortedHumans.map((m, i) => <MemberRow key={m.userId} m={m} i={i} showPos />)}
                            {idleCount > 0 && (
                                <div className="ra-sec" style={{ paddingTop: 14 }}>
                                    <span className="meta">{tr(idleCount)} üyenin bu dönemde hiç kaydı yok — listede gösterilmiyor</span>
                                </div>
                            )}
                            {sortedBots.length > 0 && (
                                <>
                                    <div className="ra-sec" style={{ paddingTop: 22 }}>
                                        <h2 style={{ fontSize: '0.92rem' }}><Bot size={15} style={{ verticalAlign: -2, marginRight: 6, color: '#1d4ed8' }} />Botlar</h2>
                                        <span className="meta">temsilcilerle aynı sıralamada yarışmazlar</span>
                                    </div>
                                    {sortedBots.map((m, i) => <MemberRow key={m.userId} m={m} i={i} showPos={false} />)}
                                </>
                            )}
                        </>
                    ) : (
                        <div style={{ paddingTop: 8 }}>
                            {groupedTeams.cards.map(({ team, members }) => (
                                <TeamCard key={team.id} team={team} members={members} />
                            ))}
                            {groupedTeams.teamless.length > 0 && (
                                <TeamCard
                                    team={{ id: '__none', name: 'Takımsız / Diğer Temsilciler ve Botlar', color: '#94a3b8' }}
                                    members={groupedTeams.teamless}
                                />
                            )}
                            {groupedTeams.cards.length === 0 && groupedTeams.teamless.length === 0 && (
                                <div className="ra-empty">
                                    <div className="ra-empty-icon"><Users size={24} /></div>
                                    <h3>Takım tanımlı değil</h3>
                                    <p>Ayarlar → Takım ve Üyeler bölümünden takım oluşturabilirsiniz.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default TeamReport;
