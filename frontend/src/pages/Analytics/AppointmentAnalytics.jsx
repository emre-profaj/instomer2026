/**
 * ═══════════════════════════════════════════════════════════════
 * RANDEVU ANALİZİ
 * ═══════════════════════════════════════════════════════════════
 *
 * Doğrudan `appointments` tablosunu okur — takvimde ne varsa o.
 * (Eskiden contact_activities'e bakıyordu; oraya yalnızca
 *  APPOINTMENT_AUTO_PLAN otomasyonu yazdığı için sayfa hem eksik
 *  hem fazla sayıyordu.)
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
    RefreshCw, Search, FileText, Bot, User, CalendarOff
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import { appointmentAPI } from '../../services/api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import './reportDesign.css';

const TZ = 'Europe/Istanbul';

// Takvimdeki durumlarla birebir aynı — iki ekran farklı şey söylemesin
const STATUS = {
    SCHEDULED:            { label: 'Planlandı',      dot: '#f59e0b' },
    PENDING_CONFIRMATION: { label: 'Teyit Bekliyor', dot: '#eab308' },
    COMPLETED:            { label: 'Tamamlandı',     dot: '#10b981' },
    // Marka rengi kırmızı olduğu için iptal nötr griye alındı: aksan
    // rengiyle yarışmasın, "iptal" bir uyarı değil sonlanmış bir durumdur.
    CANCELLED:            { label: 'İptal',          dot: '#94a3b8' },
    NO_SHOW:              { label: 'Gelmedi',        dot: '#a78bfa' },
};
const statusOf = (s) => STATUS[s] || { label: s || 'Bilinmiyor', dot: '#cbd5e1' };

const fmt = (opts) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...opts });
const trTime = (d) => fmt({ hour: '2-digit', minute: '2-digit' }).format(d);
const trDay  = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const trShort = (d) => fmt({ day: 'numeric', month: 'short' }).format(d);
/** Türkiye takvimine göre gün anahtarı — sunucu UTC olduğu için şart */
const trKey = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

// Ad baş harfleri için sakin bir palet — aynı kişi hep aynı rengi alsın
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

/**
 * Notu ekrana basmadan önce temizler.
 *
 * Bazı randevuların `notes` alanı yalnızca "Conversation ID: <uuid>"
 * içeriyor. Bu bir not değil, teknik bir iz — ama VERİTABANINDAN
 * SİLİNEMEZ: hatırlatma cron'u sohbeti bu satırdan buluyor
 * (server.js → apt.notes?.match(/Conversation ID: (.+)/)).
 * Bu yüzden yalnızca gösterimde ayıklıyoruz.
 */
const cleanNote = (raw) => {
    if (!raw) return '';
    const kept = String(raw)
        .split(/\r?\n/)
        .filter(line => !/^\s*conversation\s*id\s*:/i.test(line))
        .join('\n')
        .trim();
    return kept;
};

const AppointmentAnalytics = () => {
    const { currentWorkspace } = useAuth();
    const { showError } = useToast();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [appointments, setAppointments] = useState([]);

    const [dateFilter, setDateFilter] = useState('thisMonth');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    // "Bu ay hangi randevular var" ile "bu ay kaç randevu aldık" ayrı sorular
    const [dateField, setDateField] = useState('startTime');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (currentWorkspace?.id) loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentWorkspace?.id, dateFilter, startDate, endDate, dateField]);

    const loadData = async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true); else setLoading(true);

            const { startDate: sd, endDate: ed } = getDateRangeLogic(dateFilter, startDate, endDate);
            const params = { dateField };
            if (sd) params.startDate = sd;
            if (ed) params.endDate = ed;

            const res = await appointmentAPI.getAll(currentWorkspace.id, params);
            setAppointments(res.data?.appointments || []);
        } catch (error) {
            console.error('Randevular yüklenemedi:', error);
            showError('Veriler yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const filtered = useMemo(() => {
        if (!searchTerm) return appointments;
        const t = searchTerm.toLocaleLowerCase('tr');
        return appointments.filter(a => [
            a.contactName, a.contactPhone, a.assignedTo?.name,
            a.title, a.branch, a.doctorName,
        ].some(v => String(v || '').toLocaleLowerCase('tr').includes(t)));
    }, [appointments, searchTerm]);

    const stats = useMemo(() => {
        const by = {};
        let bot = 0, human = 0, today = 0, upcoming = 0;
        const now = new Date();
        const todayKey = trKey(now);
        const in7 = new Date(now.getTime() + 7 * 864e5);

        for (const a of appointments) {
            by[a.status] = (by[a.status] || 0) + 1;
            if (a.assignedTo?.isBot) bot++; else if (a.assignedTo) human++;
            const st = new Date(a.startTime);
            if (trKey(st) === todayKey) today++;
            if (st >= now && st <= in7) upcoming++;
        }
        const total = appointments.length;
        const known = bot + human;
        return {
            total, by, bot, human, today, upcoming,
            botPct: known ? (bot / known) * 100 : 0,
            humanPct: known ? (human / known) * 100 : 0,
        };
    }, [appointments]);

    // Dönem boyunca günlük dağılım — çok uzun aralıkta gün yerine ay
    const chart = useMemo(() => {
        const dates = appointments.map(a => new Date(a.startTime)).filter(d => !isNaN(d));
        if (!dates.length) return { buckets: [], peak: 0, byMonth: false };

        const min = new Date(Math.min(...dates));
        const max = new Date(Math.max(...dates));
        const spanDays = Math.round((max - min) / 864e5);
        const byMonth = spanDays > 70;

        const keyOf = (d) => byMonth
            ? fmt({ year: 'numeric', month: '2-digit' }).format(d)
            : trKey(d);
        const map = new Map();
        for (const d of dates) {
            const k = keyOf(d);
            if (!map.has(k)) map.set(k, { key: k, date: d, count: 0 });
            map.get(k).count++;
        }
        const buckets = [...map.values()].sort((a, b) => a.date - b.date);
        return { buckets, peak: Math.max(...buckets.map(b => b.count)), byMonth };
    }, [appointments]);

    // Gün gün gruplama — randevu listesi doğası gereği zaman eksenlidir
    const groups = useMemo(() => {
        const map = new Map();
        for (const a of [...filtered].sort((x, y) => new Date(x.startTime) - new Date(y.startTime))) {
            const k = trKey(new Date(a.startTime));
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(a);
        }
        return [...map.entries()];
    }, [filtered]);

    const todayKey = trKey(new Date());
    const activeLabel = dateFilterOptions.find(o => o.key === dateFilter)?.label || '';

    if (loading && appointments.length === 0) {
        return (
            <div className="ra-page">
                <div className="ra-loading">
                    <RefreshCw className="ra-spin" size={30} />
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Randevu Analizi yükleniyor…</p>
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
                        <h1>Randevu Analizi</h1>
                        <p>Takvimdeki tüm randevular — bot, temsilci ve otomasyon dahil</p>
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
                            <button key={o.key}
                                className={`ra-pill${dateFilter === o.key ? ' active' : ''}`}
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
                        <button className={dateField === 'startTime' ? 'active' : ''}
                            title="Randevunun yapılacağı tarihe göre"
                            onClick={() => setDateField('startTime')}>Randevu tarihi</button>
                        <button className={dateField === 'createdAt' ? 'active' : ''}
                            title="Randevunun sisteme girildiği tarihe göre"
                            onClick={() => setDateField('createdAt')}>Kayıt tarihi</button>
                    </div>
                </div>

                {/* Hero — tek büyük sayı + dönem boyunca dağılım */}
                <div className="ra-surface ra-hero">
                    <div className="ra-hero-left">
                        <div className="ra-metric-label">Toplam Randevu</div>
                        <div className="ra-metric-value">{stats.total}</div>
                        <div className="ra-metric-note">
                            {activeLabel} · {dateField === 'startTime' ? 'randevu tarihine göre' : 'kayıt tarihine göre'}
                        </div>

                        <div className="ra-split">
                            <div className="ra-split-bar">
                                <i style={{ width: `${stats.botPct}%`, background: 'var(--accent)' }} title={`AI Agent: ${stats.bot}`} />
                                <i style={{ width: `${stats.humanPct}%`, background: '#cbd5e1' }} title={`Temsilci: ${stats.human}`} />
                            </div>
                            <div className="ra-split-legend">
                                <div className="ra-split-item">
                                    AI Agent<b>{stats.bot} <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>%{Math.round(stats.botPct)}</span></b>
                                </div>
                                <div className="ra-split-item" style={{ textAlign: 'right' }}>
                                    Temsilci<b>{stats.human} <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>%{Math.round(stats.humanPct)}</span></b>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="ra-hero-right">
                        <div className="ra-chart-head">
                            <span className="ra-chart-title">{chart.byMonth ? 'Aylık dağılım' : 'Günlük dağılım'}</span>
                            {chart.peak > 0 && <span className="ra-chart-peak">en yoğun: {chart.peak} randevu</span>}
                        </div>
                        {chart.buckets.length > 0 ? (
                            <>
                                <div className="ra-chart">
                                    {chart.buckets.map(b => (
                                        <div key={b.key}
                                            className={`ra-col${!chart.byMonth && b.key === todayKey ? ' is-today' : ''}`}
                                            title={`${trShort(b.date)} · ${b.count} randevu`}>
                                            <i style={{ height: `${Math.max(3, (b.count / chart.peak) * 100)}%` }} />
                                        </div>
                                    ))}
                                </div>
                                <div className="ra-chart-axis">
                                    <span>{trShort(chart.buckets[0].date)}</span>
                                    <span>{trShort(chart.buckets[chart.buckets.length - 1].date)}</span>
                                </div>
                            </>
                        ) : (
                            <div className="ra-chart" />
                        )}
                    </div>
                </div>

                {/* Metrik şeridi — kutu yok, dikey ayraçlar */}
                <div className="ra-surface ra-strip">
                    {[
                        { label: 'Bugün', dot: '#10b981', value: stats.today, sub: 'bugünkü randevu' },
                        { label: 'Yaklaşan', dot: '#ef4444', value: stats.upcoming, sub: 'önümüzdeki 7 gün' },
                        { label: 'Planlandı', dot: STATUS.SCHEDULED.dot, value: stats.by.SCHEDULED || 0, sub: 'bekleyen randevu' },
                        { label: 'Tamamlandı', dot: STATUS.COMPLETED.dot, value: stats.by.COMPLETED || 0, sub: 'gerçekleşen' },
                        { label: 'Gelmedi', dot: STATUS.NO_SHOW.dot, value: stats.by.NO_SHOW || 0, sub: 'randevuya gelmeyen' },
                        { label: 'İptal', dot: STATUS.CANCELLED.dot, value: stats.by.CANCELLED || 0, sub: 'iptal edilen' },
                    ].map(c => (
                        <div className="ra-cell" key={c.label}>
                            <div className="ra-cell-label">
                                <i className="ra-cell-dot" style={{ background: c.dot }} />{c.label}
                            </div>
                            <div className="ra-cell-value">{c.value}</div>
                            <div className="ra-cell-sub">{c.sub}</div>
                        </div>
                    ))}
                </div>

                <div className="ra-surface">
                    <div className="ra-list-head">
                        <h2>Randevu Listesi<span className="ra-count">{filtered.length} kayıt</span></h2>
                        <div className="ra-search">
                            <Search size={15} />
                            <input type="text" placeholder="Kişi, temsilci, hizmet veya branş ara…"
                                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </div>

                    {groups.length === 0 ? (
                        <div className="ra-empty">
                            <div className="ra-empty-icon">
                                {searchTerm ? <Search size={24} /> : <CalendarOff size={24} />}
                            </div>
                            <h3>{searchTerm ? 'Aramanızla eşleşen randevu yok' : 'Bu dönemde randevu yok'}</h3>
                            <p>
                                {searchTerm
                                    ? 'Farklı bir isim, telefon veya branş deneyin.'
                                    : 'Başka bir dönem seçebilirsiniz. Hiç randevu görünmüyorsa Otomasyonlar’daki “Randevu Talebi Algılama” kapalı olabilir — kapalıyken bot randevu oluşturmaz.'}
                            </p>
                        </div>
                    ) : (
                        groups.map(([key, items]) => {
                            const d = new Date(items[0].startTime);
                            return (
                                <div key={key}>
                                    <div className="ra-day">
                                        <span className="ra-day-name">{trDay(d)}</span>
                                        {key === todayKey && <span className="ra-day-today">BUGÜN</span>}
                                        <span className="ra-day-rule" />
                                        <span className="ra-day-meta">{items.length} randevu</span>
                                    </div>
                                    {items.map(a => {
                                        const st = statusOf(a.status);
                                        const av = avatarOf(a.contactName);
                                        const note = cleanNote(a.notes) || cleanNote(a.description);
                                        return (
                                            <div className="ra-row" key={a.id}>
                                                <div className="ra-time">{trTime(new Date(a.startTime))}</div>
                                                <div className="ra-avatar" style={{ background: av.bg, color: av.color }}>
                                                    {av.initials}
                                                </div>
                                                <div>
                                                    <div className="ra-name">{a.contactName || 'Bilinmiyor'}</div>
                                                    {a.contactPhone && <div className="ra-phone">{a.contactPhone}</div>}
                                                </div>
                                                <div>
                                                    <div className="ra-title">{a.title || '—'}</div>
                                                    {(a.branch || a.doctorName) && (
                                                        <div className="ra-sub">
                                                            {[a.branch, a.doctorName].filter(Boolean).join(' · ')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    {a.assignedTo ? (
                                                        <span className="ra-who">
                                                            {a.assignedTo.isBot ? <Bot size={13} /> : <User size={13} style={{ color: '#94a3b8' }} />}
                                                            <span>{a.assignedTo.name}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="ra-who-none">Atanmamış</span>
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

export default AppointmentAnalytics;
