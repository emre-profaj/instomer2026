/**
 * ═══════════════════════════════════════════════════════════════
 * GÖRÜŞME ANALİZİ
 * ═══════════════════════════════════════════════════════════════
 *
 * Görünüm Randevu Analizi / AI Call ile aynı dile taşındı
 * (reportDesign.css). Veri kaynağı değişmedi: contact_activities,
 * type = MEETING.
 *
 * DÜZELTİLEN: eski ekran yalnızca COMPLETED ve PLANNED tanıyor, geri
 * kalan her durumu "✗ İptal" gösteriyordu. Canlıda 449 görüşme
 * SCHEDULED, 1'i PENDING — hepsi kırmızı "iptal" olarak görünüyor ve
 * toplama da katılmıyordu (toplam yalnızca dört kovanın toplamıydı).
 * Artık durumlar backend'den gelen eksiksiz dağılımdan okunuyor.
 *
 * NOT: ActivityListAnalytics.jsx bilerek ellenmedi — Emre'nin üzerinde
 * devam eden kaynak kolonu çalışması orada duruyor. Kişinin kaynağı bu
 * ekranda ad altında ince bir satır olarak gösteriliyor; alan dolduğu
 * anda kendiliğinden görünür, boşken yer kaplamaz.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, FileText, CalendarOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import { activityAPI } from '../../services/activity.api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import './reportDesign.css';

const TZ = 'Europe/Istanbul';
const fmt = (o) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...o });
const trTime = (d) => fmt({ hour: '2-digit', minute: '2-digit' }).format(d);
const trDay = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const trShort = (d) => fmt({ day: 'numeric', month: 'short' }).format(d);
const trKey = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);
const tr = (n) => Number(n || 0).toLocaleString('tr-TR');

// Canlıda gerçekten görülen durumlar — eskiden ikisi tanınıyordu
const STATUS = {
    PLANNED:     { label: 'Bekliyor',     dot: '#f59e0b' },
    SCHEDULED:   { label: 'Planlandı',    dot: '#6366f1' },
    PENDING:     { label: 'Beklemede',    dot: '#eab308' },
    IN_PROGRESS: { label: 'Devam Ediyor', dot: '#0ea5e9' },
    COMPLETED:   { label: 'Tamamlandı',   dot: '#10b981' },
    CANCELLED:   { label: 'İptal',        dot: '#94a3b8' },
};
const STATUS_ORDER = ['PLANNED', 'SCHEDULED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const statusOf = (s) => STATUS[s] || { label: s || 'Bilinmiyor', dot: '#cbd5e1' };

const AVATARS = [
    ['#fef2f2', '#b91c1c'], ['#fff7ed', '#c2410c'], ['#fffbeb', '#b45309'],
    ['#f8fafc', '#475569'], ['#fdf2f8', '#be185d'], ['#f5f3ff', '#6d28d9'],
];
const avatarOf = (name) => {
    const s = String(name || '?');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const [bg, color] = AVATARS[h % AVATARS.length];
    const initials = s.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toLocaleUpperCase('tr');
    return { bg, color, initials: initials || '?' };
};

// Kaynak kodu → okunur etiket. Alan dolduğunda kendiliğinden görünür.
const SOURCE_LABELS = {
    INBOUND: 'Gelen Arama', WHATSAPP: 'WhatsApp', FACEBOOK: 'Facebook',
    FACEBOOK_LEAD: 'Facebook Lead', INSTAGRAM: 'Instagram', WEB_FORM: 'Web Formu',
    WEB_WIDGET: 'Web Sohbeti', EMAIL: 'E-posta', AI_CALL: 'AI Arama', SMS: 'SMS',
    GOOGLE: 'Google', SOCIAL_MEDIA: 'Sosyal Medya', REFERRAL: 'Referans',
    WALK_IN: 'Yüz Yüze', EVENT: 'Etkinlik', OTHER: 'Diğer',
};
const sourceLabel = (v) => SOURCE_LABELS[String(v || '').toUpperCase()] || v || null;

const MeetingAnalytics = () => {
    const { currentWorkspace } = useAuth();
    const { showError } = useToast();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activities, setActivities] = useState([]);
    const [byStatus, setByStatus] = useState({});

    const [dateFilter, setDateFilter] = useState('thisMonth');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [dateField, setDateField] = useState('dueDate');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (currentWorkspace?.id) loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentWorkspace?.id, dateFilter, startDate, endDate, dateField]);

    const loadData = async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true); else setLoading(true);

            const { startDate: sd, endDate: ed } = getDateRangeLogic(dateFilter, startDate, endDate);
            const params = { type: 'MEETING', dateField, limit: 500 };
            if (sd) params.dateFrom = new Date(sd).toISOString();
            if (ed) {
                const end = new Date(ed);
                end.setHours(23, 59, 59, 999);
                params.dateTo = end.toISOString();
            }

            const res = await activityAPI.getWorkspaceActivities(currentWorkspace.id, params);
            setActivities(res.activities || []);
            // byStatus eksiksiz dağılım; eski summary yalnızca dört kova
            setByStatus(res.byStatus || {
                PLANNED: res.summary?.planned || 0,
                IN_PROGRESS: res.summary?.inProgress || 0,
                COMPLETED: res.summary?.completed || 0,
                CANCELLED: res.summary?.cancelled || 0,
            });
        } catch (error) {
            console.error('Görüşmeler yüklenemedi:', error);
            showError('Veriler yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const filtered = useMemo(() => {
        if (!searchTerm) return activities;
        const t = searchTerm.toLocaleLowerCase('tr');
        return activities.filter(a => [
            a.contact?.name, a.contact?.phone, a.assignee?.name, a.title, a.team?.name,
        ].some(v => String(v || '').toLocaleLowerCase('tr').includes(t)));
    }, [activities, searchTerm]);

    const total = useMemo(
        () => Object.values(byStatus).reduce((s, n) => s + Number(n || 0), 0),
        [byStatus]
    );

    const segments = useMemo(() => {
        const keys = [...new Set([...STATUS_ORDER, ...Object.keys(byStatus)])];
        return keys
            .filter(k => byStatus[k])
            .map(k => ({ key: k, count: byStatus[k], pct: total ? (byStatus[k] / total) * 100 : 0, ...statusOf(k) }));
    }, [byStatus, total]);

    const dateOf = (a) => new Date(dateField === 'createdAt' ? a.createdAt : (a.dueDate || a.createdAt));

    const chart = useMemo(() => {
        const map = new Map();
        for (const a of activities) {
            const d = dateOf(a);
            if (isNaN(d)) continue;
            const k = trKey(d);
            if (!map.has(k)) map.set(k, { key: k, date: d, count: 0 });
            map.get(k).count++;
        }
        const buckets = [...map.values()].sort((a, b) => a.date - b.date);
        return { buckets, peak: buckets.length ? Math.max(...buckets.map(b => b.count)) : 0 };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activities, dateField]);

    const quick = useMemo(() => {
        const now = new Date();
        const todayKey = trKey(now);
        const in7 = new Date(now.getTime() + 7 * 864e5);
        let today = 0, upcoming = 0;
        for (const a of activities) {
            const d = dateOf(a);
            if (isNaN(d)) continue;
            if (trKey(d) === todayKey) today++;
            if (d >= now && d <= in7) upcoming++;
        }
        return { today, upcoming };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activities, dateField]);

    const groups = useMemo(() => {
        const map = new Map();
        for (const a of [...filtered].sort((x, y) => dateOf(x) - dateOf(y))) {
            const d = dateOf(a);
            if (isNaN(d)) continue;
            const k = trKey(d);
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(a);
        }
        return [...map.entries()];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtered, dateField]);

    const todayKey = trKey(new Date());
    const activeLabel = dateFilterOptions.find(o => o.key === dateFilter)?.label || '';
    const capped = activities.length >= 500;

    if (loading && activities.length === 0) {
        return (
            <div className="ra-page">
                <div className="ra-loading">
                    <RefreshCw className="ra-spin" size={30} />
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Görüşme Analizi yükleniyor…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="ra-page">
            <div className="ra-wrap">

                <div className="ra-head">
                    <div>
                        <div className="ra-eyebrow">Raporlar</div>
                        <h1>Görüşme Analizi</h1>
                        <p>Temsilcilerin gerçekleştirdiği müşteri görüşmeleri (yüz yüze, ziyaret vb.)</p>
                    </div>
                    <div className="ra-head-actions">
                        <button className="ra-btn" onClick={() => loadData(true)} disabled={refreshing}>
                            <RefreshCw className={refreshing ? 'ra-spin' : ''} size={14} /> Güncelle
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
                    <div className="ra-spacer" />
                    <div className="ra-seg" role="group" aria-label="Tarih ölçütü">
                        <button className={dateField === 'dueDate' ? 'active' : ''}
                            title="Görüşmenin yapılacağı tarihe göre"
                            onClick={() => setDateField('dueDate')}>Görüşme tarihi</button>
                        <button className={dateField === 'createdAt' ? 'active' : ''}
                            title="Kaydın oluşturulduğu tarihe göre"
                            onClick={() => setDateField('createdAt')}>Kayıt tarihi</button>
                    </div>
                </div>

                <div className="ra-surface ra-hero">
                    <div className="ra-hero-left">
                        <div className="ra-metric-label">Toplam Görüşme</div>
                        <div className="ra-metric-value">{tr(total)}</div>
                        <div className="ra-metric-note">
                            {activeLabel} · {dateField === 'dueDate' ? 'görüşme tarihine göre' : 'kayıt tarihine göre'}
                        </div>

                        <div className="ra-split">
                            <div className="ra-split-bar">
                                {segments.map(s => (
                                    <i key={s.key} style={{ width: `${s.pct}%`, background: s.dot }}
                                        title={`${s.label}: ${s.count}`} />
                                ))}
                            </div>
                            <div className="ra-legend" style={{ marginTop: 11 }}>
                                {segments.map(s => (
                                    <div className="ra-legend-item" key={s.key}>
                                        <i className="ra-dot" style={{ background: s.dot }} />
                                        <span className="ra-legend-text">{s.label}</span>
                                        <span className="ra-legend-count">{tr(s.count)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="ra-hero-right">
                        <div className="ra-chart-head">
                            <span className="ra-chart-title">Günlük dağılım</span>
                            {chart.peak > 0 && <span className="ra-chart-peak">en yoğun: {tr(chart.peak)} görüşme</span>}
                        </div>
                        {chart.buckets.length > 0 ? (
                            <>
                                <div className="ra-chart">
                                    {chart.buckets.map(b => (
                                        <div key={b.key}
                                            className={`ra-col${b.key === todayKey ? ' is-today' : ''}`}
                                            title={`${trShort(b.date)} · ${b.count} görüşme`}>
                                            <i style={{ height: `${Math.max(3, (b.count / chart.peak) * 100)}%` }} />
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

                <div className="ra-surface ra-strip">
                    {[
                        { label: 'Bugün', dot: '#ef4444', value: tr(quick.today), sub: 'bugünkü görüşme' },
                        { label: 'Yaklaşan', dot: '#6366f1', value: tr(quick.upcoming), sub: 'önümüzdeki 7 gün' },
                        { label: 'Bekliyor', dot: STATUS.PLANNED.dot, value: tr(byStatus.PLANNED), sub: 'henüz yapılmadı' },
                        { label: 'Planlandı', dot: STATUS.SCHEDULED.dot, value: tr(byStatus.SCHEDULED), sub: 'tarihi belli' },
                        { label: 'Tamamlandı', dot: STATUS.COMPLETED.dot, value: tr(byStatus.COMPLETED), sub: 'gerçekleşen' },
                        { label: 'İptal', dot: STATUS.CANCELLED.dot, value: tr(byStatus.CANCELLED), sub: 'iptal edilen' },
                    ].map(c => (
                        <div className="ra-cell" key={c.label}>
                            <div className="ra-cell-label"><i className="ra-cell-dot" style={{ background: c.dot }} />{c.label}</div>
                            <div className="ra-cell-value">{c.value}</div>
                            <div className="ra-cell-sub">{c.sub}</div>
                        </div>
                    ))}
                </div>

                <div className="ra-surface">
                    <div className="ra-list-head">
                        <h2>Görüşme Listesi<span className="ra-count">{tr(filtered.length)} kayıt</span></h2>
                        <div className="ra-search">
                            <Search size={15} />
                            <input type="text" placeholder="Kişi, temsilci veya takım ara…"
                                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </div>

                    {capped && (
                        <div className="ra-day">
                            <span className="ra-day-meta">
                                Listede en fazla 500 kayıt gösterilir — üstteki sayılar dönemin tamamını kapsar.
                            </span>
                            <span className="ra-day-rule" />
                        </div>
                    )}

                    {groups.length === 0 ? (
                        <div className="ra-empty">
                            <div className="ra-empty-icon">
                                {searchTerm ? <Search size={24} /> : <CalendarOff size={24} />}
                            </div>
                            <h3>{searchTerm ? 'Aramanızla eşleşen görüşme yok' : 'Bu dönemde görüşme yok'}</h3>
                            <p>{searchTerm
                                ? 'Farklı bir isim, telefon veya takım adı deneyin.'
                                : 'Başka bir dönem seçebilirsiniz. Görüşmeler temsilciler tarafından veya otomasyonla oluşturulur.'}</p>
                        </div>
                    ) : (
                        groups.map(([key, items]) => {
                            const d = dateOf(items[0]);
                            return (
                                <div key={key}>
                                    <div className="ra-day">
                                        <span className="ra-day-name">{trDay(d)}</span>
                                        {key === todayKey && <span className="ra-day-today">BUGÜN</span>}
                                        <span className="ra-day-rule" />
                                        <span className="ra-day-meta">{items.length} görüşme</span>
                                    </div>
                                    {items.map(a => {
                                        const st = statusOf(a.status);
                                        const av = avatarOf(a.contact?.name);
                                        const note = a.result || a.description;
                                        const src = sourceLabel(a.case?.leadSource)
                                            || sourceLabel(a.contact?.leadSource || a.contact?.source);
                                        return (
                                            <div className="ra-row" key={a.id}>
                                                <div className="ra-time">{trTime(dateOf(a))}</div>
                                                <div className="ra-avatar" style={{ background: av.bg, color: av.color }}>
                                                    {av.initials}
                                                </div>
                                                <div>
                                                    <div className="ra-name">{a.contact?.name || 'Bilinmiyor'}</div>
                                                    {a.contact?.phone && <div className="ra-phone">{a.contact.phone}</div>}
                                                    {src && <div className="ra-sub">Kaynak: {src}</div>}
                                                </div>
                                                <div>
                                                    <div className="ra-title">{a.title || 'Görüşme'}</div>
                                                    {a.team?.name && <div className="ra-sub">{a.team.name}</div>}
                                                </div>
                                                <div>
                                                    {a.assignee ? (
                                                        <span className="ra-who"><span>{a.assignee.name}</span></span>
                                                    ) : (
                                                        <span className="ra-who-none">Havuzda</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="ra-status" style={{ color: '#334155' }}>
                                                        <i style={{ background: st.dot }} />{st.label}
                                                    </span>
                                                </div>
                                                {note && <div className="ra-note">{note}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })
                    )}
                </div>

            </div>
        </div>
    );
};

export default MeetingAnalytics;
