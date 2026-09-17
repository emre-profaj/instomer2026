/**
 * ═══════════════════════════════════════════════════════════════
 * AI CALL RAPORLAMA
 * ═══════════════════════════════════════════════════════════════
 *
 * Görünüm Randevu Analizi ile aynı dile taşındı (reportDesign.css).
 * VERİ VE İŞLEV DEĞİŞMEDİ: toplu seçim, tekrar arama, durum/yön/duygu
 * süzgeçleri, numara arama, transkript detayı ve sayfalama aynen duruyor.
 *
 * İki ekleme:
 *   • Günlük dağılım grafiği — `dailyBreakdown` API yanıtında zaten
 *     vardı ama sayfa hiç kullanmıyordu. Backend'e dokunulmadı.
 *   • Duygu dağılımı sayılarıyla şeride taşındı.
 *
 * Bir çıkarma: "Başarı Oranı" kartı kaldırıldı. Backend onu duygu
 * analizinden hesaplıyordu (olumlu / duygusu olan aramalar), oysa her
 * aramada ayrı bir `callSuccessful` alanı var. "%15 başarı" aslında
 * "%15'i olumlu konuşmaydı" demekti — yanıltıcıydı.
 */
import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { retellAPI } from '../../services/api';
import {
    Phone, PhoneOff, RefreshCw, Search, FileText, Loader, Check,
    PhoneOutgoing, PhoneIncoming, Play, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../Analytics/reportDesign.css';
import './AICallAnalytics.css';

const TZ = 'Europe/Istanbul';
const fmt = (o) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...o });
const trTime = (d) => fmt({ hour: '2-digit', minute: '2-digit' }).format(d);
const trDay = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const trShort = (d) => fmt({ day: 'numeric', month: 'short' }).format(d);
const trKey = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

const STATUS = {
    ended:         { label: 'Tamamlandı',   dot: '#10b981' },
    not_connected: { label: 'Ulaşılamadı',  dot: '#94a3b8' },
    ongoing:       { label: 'Devam Ediyor', dot: '#f59e0b' },
    registered:    { label: 'Başlatıldı',   dot: '#eab308' },
    error:         { label: 'Hata',         dot: '#ef4444' },
};
const statusOf = (s) => STATUS[s] || { label: s || 'Bilinmiyor', dot: '#cbd5e1' };

const MOOD = {
    positive: { label: 'Olumlu',  color: '#047857', dot: '#10b981' },
    negative: { label: 'Olumsuz', color: '#b91c1c', dot: '#ef4444' },
    neutral:  { label: 'Nötr',    color: '#64748b', dot: '#cbd5e1' },
};
const moodOf = (s) => MOOD[String(s || 'neutral').toLowerCase()] || MOOD.neutral;

const formatDuration = (seconds) => {
    if (!seconds) return '0sn';
    const m = Math.floor(seconds / 60), s = seconds % 60;
    return m > 0 ? `${m}dk ${s}sn` : `${s}sn`;
};
const formatLongDuration = (seconds) => {
    if (!seconds) return '0dk';
    const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
    return h > 0 ? `${h}sa ${m}dk` : `${m}dk`;
};
const tr = (n) => Number(n || 0).toLocaleString('tr-TR');

const AICallAnalytics = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState(null);
    const [calls, setCalls] = useState([]);
    const [totalCalls, setTotalCalls] = useState(0);
    const [page, setPage] = useState(0);
    const [dateFilter, setDateFilter] = useState('thisMonth');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [expandedCall, setExpandedCall] = useState(null);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [sentimentFilter, setSentimentFilter] = useState('ALL');
    const [directionFilter, setDirectionFilter] = useState('ALL');
    const limit = 15;

    // Toplu seçim
    const [selectedCalls, setSelectedCalls] = useState(new Set());
    const [retrying, setRetrying] = useState(false);
    const [retryResult, setRetryResult] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    useEffect(() => {
        if (currentWorkspace) loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentWorkspace, dateFilter, page, search, statusFilter, sentimentFilter, directionFilter, startDate, endDate]);

    useEffect(() => {
        setSelectedCalls(new Set());
    }, [statusFilter, sentimentFilter, directionFilter, page, search, dateFilter, startDate, endDate]);

    const getDateParams = () => {
        const { startDate: sd, endDate: ed } = getDateRangeLogic(dateFilter, startDate, endDate);
        const params = {};
        if (sd) params.startDate = new Date(sd).toISOString();
        if (ed) {
            const end = new Date(ed);
            end.setHours(23, 59, 59, 999);
            params.endDate = end.toISOString();
        }
        return params;
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const params = getDateParams();
            const callParams = { limit, offset: page * limit, ...params };
            if (search) callParams.search = search;
            if (statusFilter !== 'ALL') callParams.status = statusFilter;
            if (directionFilter !== 'ALL') callParams.direction = directionFilter;
            if (['positive', 'negative', 'neutral'].includes(sentimentFilter)) {
                callParams.sentiment = sentimentFilter;
            }

            const [analyticsRes, callsRes] = await Promise.all([
                retellAPI.getAnalytics(currentWorkspace.id, params),
                retellAPI.getCallHistory(currentWorkspace.id, Object.fromEntries(
                    Object.entries(callParams).filter(([_, v]) => v !== undefined && v !== '')
                )),
            ]);
            setAnalytics(analyticsRes.data);
            setCalls(callsRes.data.calls || []);
            setTotalCalls(callsRes.data.total || 0);
        } catch (error) {
            console.error('Error loading AI Call analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelect = (id) => setSelectedCalls(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const toggleSelectAll = () => {
        if (selectedCalls.size === calls.length) setSelectedCalls(new Set());
        else setSelectedCalls(new Set(calls.map(c => c.id)));
    };

    const handleSelectAllCalls = async () => {
        if (selectedCalls.size === totalCalls) { setSelectedCalls(new Set()); return; }
        try {
            const callParams = { limit: 10000, offset: 0, ...getDateParams() };
            if (search) callParams.search = search;
            if (statusFilter !== 'ALL') callParams.status = statusFilter;
            if (directionFilter !== 'ALL') callParams.direction = directionFilter;
            if (sentimentFilter !== 'ALL') callParams.sentiment = sentimentFilter;
            const res = await retellAPI.getCallHistory(currentWorkspace.id,
                Object.fromEntries(Object.entries(callParams).filter(([_, v]) => v !== undefined && v !== '')));
            setSelectedCalls(new Set((res.data.calls || []).map(c => c.id)));
        } catch (err) {
            console.error('Select all calls error:', err);
        }
    };

    const handleBulkRetry = () => {
        if (selectedCalls.size === 0) return;
        setConfirmModal({
            isOpen: true,
            title: 'Tekrar Arama',
            message: `${selectedCalls.size} kişiyi tekrar aramak istediğinize emin misiniz?`,
            confirmText: 'Evet, Ara',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setRetrying(true);
                setRetryResult(null);
                try {
                    const res = await retellAPI.bulkRetryCall(currentWorkspace.id, [...selectedCalls]);
                    setRetryResult(res.data);
                    setSelectedCalls(new Set());
                    setTimeout(() => loadData(), 2000);
                } catch (error) {
                    setRetryResult({ success: 0, failed: selectedCalls.size, errors: [{ error: error.response?.data?.error || error.message }] });
                } finally {
                    setRetrying(false);
                }
            },
        });
    };

    const totalPages = Math.ceil(totalCalls / limit);
    const activeLabel = dateFilterOptions.find(o => o.key === dateFilter)?.label || '';

    // Günlük dağılım — dailyBreakdown API'den geliyor, sayfa kullanmıyordu
    const chart = useMemo(() => {
        const raw = analytics?.dailyBreakdown || {};
        const buckets = Object.entries(raw)
            .map(([k, v]) => ({ key: k, date: new Date(`${k}T12:00:00Z`), count: v }))
            .filter(b => !isNaN(b.date))
            .sort((a, b) => a.date - b.date);
        return { buckets, peak: buckets.length ? Math.max(...buckets.map(b => b.count)) : 0 };
    }, [analytics]);

    const sentiment = analytics?.sentimentBreakdown || {};
    const sentTotal = (sentiment.positive || 0) + (sentiment.neutral || 0) + (sentiment.negative || 0) || 1;
    const cost = ((analytics?.totalCost || 0) * 2) + ((analytics?.totalCalls || 0) * 0.10);

    const groups = useMemo(() => {
        const map = new Map();
        for (const c of calls) {
            const k = trKey(new Date(c.startedAt || c.createdAt));
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(c);
        }
        return [...map.entries()];
    }, [calls]);

    if (!currentWorkspace) {
        return (
            <div className="ra-page"><div className="ra-wrap"><div className="ra-surface">
                <div className="ra-empty">
                    <div className="ra-empty-icon"><Phone size={24} /></div>
                    <h3>Çalışma alanı seçilmedi</h3>
                    <p>Raporu görmek için üstteki menüden bir çalışma alanı seçin.</p>
                </div>
            </div></div></div>
        );
    }

    return (
        <>
            <div className="ra-page">
                <div className="ra-wrap">

                    <div className="ra-head">
                        <div>
                            <div className="ra-eyebrow">Raporlar</div>
                            <h1>AI Call Raporlama</h1>
                            <p>Sesli asistanın yaptığı ve karşıladığı tüm aramalar</p>
                        </div>
                        <div className="ra-head-actions">
                            <button className="ra-btn" onClick={loadData} disabled={loading}>
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
                                    onClick={() => { setDateFilter(o.key); setPage(0); }}>{o.label}</button>
                            ))}
                        </div>
                        {dateFilter === 'custom' && (
                            <div className="ra-dates">
                                <input type="date" className="ra-date-input" value={startDate}
                                    onChange={e => { setStartDate(e.target.value); setPage(0); }} />
                                <span style={{ color: '#cbd5e1' }}>—</span>
                                <input type="date" className="ra-date-input" value={endDate}
                                    onChange={e => { setEndDate(e.target.value); setPage(0); }} />
                            </div>
                        )}
                        <div className="ra-spacer" />
                        <div className="ra-seg" role="group" aria-label="Arama yönü">
                            {[['ALL', 'Tümü'], ['outbound', 'Giden'], ['inbound', 'Gelen']].map(([v, label]) => (
                                <button key={v} className={directionFilter === v ? 'active' : ''}
                                    onClick={() => { setDirectionFilter(v); setPage(0); }}>{label}</button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div className="ra-loading">
                            <Loader size={30} className="ra-spin" />
                            <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>{t('aiCallAnalytics.loading')}</p>
                        </div>
                    ) : (
                        <>
                            <div className="ra-surface ra-hero">
                                <div className="ra-hero-left">
                                    <div className="ra-metric-label">Toplam Arama</div>
                                    <div className="ra-metric-value">{tr(analytics?.totalCalls)}</div>
                                    <div className="ra-metric-note">
                                        {activeLabel} · {directionFilter === 'ALL' ? 'giden ve gelen' : directionFilter === 'outbound' ? 'yalnızca giden' : 'yalnızca gelen'}
                                    </div>

                                    <div className="ra-split">
                                        <div className="ra-split-bar">
                                            <i style={{ width: `${((sentiment.positive || 0) / sentTotal) * 100}%`, background: '#10b981' }}
                                                title={`Olumlu: ${sentiment.positive || 0}`} />
                                            <i style={{ width: `${((sentiment.neutral || 0) / sentTotal) * 100}%`, background: '#cbd5e1' }}
                                                title={`Nötr: ${sentiment.neutral || 0}`} />
                                            <i style={{ width: `${((sentiment.negative || 0) / sentTotal) * 100}%`, background: '#ef4444' }}
                                                title={`Olumsuz: ${sentiment.negative || 0}`} />
                                        </div>
                                        <div className="ra-split-legend">
                                            <div className="ra-split-item">Olumlu<b>{tr(sentiment.positive)}</b></div>
                                            <div className="ra-split-item" style={{ textAlign: 'center' }}>Nötr<b>{tr(sentiment.neutral)}</b></div>
                                            <div className="ra-split-item" style={{ textAlign: 'right' }}>Olumsuz<b>{tr(sentiment.negative)}</b></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="ra-hero-right">
                                    <div className="ra-chart-head">
                                        <span className="ra-chart-title">Günlük dağılım</span>
                                        {chart.peak > 0 && <span className="ra-chart-peak">en yoğun: {tr(chart.peak)} arama</span>}
                                    </div>
                                    {chart.buckets.length > 0 ? (
                                        <>
                                            <div className="ra-chart">
                                                {chart.buckets.map(b => (
                                                    <div key={b.key} className="ra-col" title={`${trShort(b.date)} · ${b.count} arama`}>
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
                                    { label: 'Toplam Süre', dot: '#ef4444', value: formatLongDuration(analytics?.totalDuration), sub: 'konuşma süresi' },
                                    { label: 'Ortalama', dot: '#f59e0b', value: formatDuration(analytics?.avgDuration), sub: 'arama başına' },
                                    { label: 'Tamamlandı', dot: '#10b981', value: tr(analytics?.statusBreakdown?.ended), sub: 'konuşma gerçekleşti' },
                                    { label: 'Ulaşılamadı', dot: '#94a3b8', value: tr(analytics?.statusBreakdown?.not_connected), sub: 'cevap yok' },
                                    { label: 'Hata', dot: '#ef4444', value: tr(analytics?.statusBreakdown?.error), sub: 'arama başarısız' },
                                    { label: 'Maliyet', dot: '#64748b', value: `$${cost.toFixed(2)}`, sub: 'dönem toplamı' },
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
                                    <h2>Arama Geçmişi<span className="ra-count">{tr(totalCalls)} kayıt</span></h2>
                                    <div className="ra-tools">
                                        <select className="ra-select" value={statusFilter}
                                            onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
                                            <option value="ALL">Tüm Durumlar</option>
                                            <option value="ended">Tamamlandı</option>
                                            <option value="not_connected">Ulaşılamadı</option>
                                            <option value="registered">Başlatıldı</option>
                                            <option value="error">Hata</option>
                                        </select>
                                        <select className="ra-select" value={sentimentFilter}
                                            onChange={e => { setSentimentFilter(e.target.value); setPage(0); }}>
                                            <option value="ALL">Tüm Duygular</option>
                                            <option value="positive">Olumlu</option>
                                            <option value="neutral">Nötr</option>
                                            <option value="negative">Olumsuz</option>
                                        </select>
                                        <div className="ra-search">
                                            <Search size={15} />
                                            <input type="text" placeholder="Numara ara…" value={searchInput}
                                                onChange={e => setSearchInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { setPage(0); setSearch(searchInput); } }} />
                                            {search && (
                                                <button className="ra-link" style={{ textDecoration: 'none' }}
                                                    onClick={() => { setSearchInput(''); setSearch(''); setPage(0); }}>
                                                    <X size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {retryResult && (
                                    <div className="ra-bulk" style={{
                                        background: retryResult.success > 0 ? '#ecfdf5' : '#fef2f2',
                                        boxShadow: `inset 0 0 0 1px ${retryResult.success > 0 ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.14)'}`,
                                    }}>
                                        <div className="ra-bulk-info" style={{ color: retryResult.success > 0 ? '#065f46' : '#7f1d1d' }}>
                                            {retryResult.success > 0 && `${retryResult.success} arama başlatıldı.`}
                                            {retryResult.failed > 0 && ` ${retryResult.failed} arama başarısız.`}
                                        </div>
                                        <button className="ra-link" onClick={() => setRetryResult(null)}>Kapat</button>
                                    </div>
                                )}

                                {selectedCalls.size > 0 && (
                                    <div className="ra-bulk">
                                        <div className="ra-bulk-info">
                                            <span><b>{tr(selectedCalls.size)}</b> / {tr(totalCalls)} arama seçildi</span>
                                            {selectedCalls.size < totalCalls && (
                                                <button className="ra-link" onClick={handleSelectAllCalls}>
                                                    Tümünü seç ({tr(totalCalls)})
                                                </button>
                                            )}
                                            <button className="ra-link" onClick={() => setSelectedCalls(new Set())}>Seçimi temizle</button>
                                        </div>
                                        <button className="ra-bulk-btn" onClick={handleBulkRetry} disabled={retrying}>
                                            {retrying
                                                ? <><Loader size={14} className="ra-spin" /> Aranıyor…</>
                                                : <><RefreshCw size={14} /> Tekrar Ara ({tr(selectedCalls.size)})</>}
                                        </button>
                                    </div>
                                )}

                                {calls.length === 0 ? (
                                    <div className="ra-empty">
                                        <div className="ra-empty-icon">{search ? <Search size={24} /> : <PhoneOff size={24} />}</div>
                                        <h3>{search ? 'Aramanızla eşleşen kayıt yok' : 'Bu dönemde arama kaydı yok'}</h3>
                                        <p>{search
                                            ? 'Farklı bir numara deneyin veya aramayı temizleyin.'
                                            : 'Başka bir dönem seçebilirsiniz. Hiç arama görünmüyorsa Retell bakiyesi tükenmiş veya sesli asistan kapalı olabilir.'}</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="ra-day">
                                            <button className={`ra-check${selectedCalls.size === calls.length && calls.length > 0 ? ' on' : ''}`}
                                                onClick={toggleSelectAll} title="Sayfadaki tümünü seç">
                                                {selectedCalls.size === calls.length && calls.length > 0 && <Check size={11} />}
                                            </button>
                                            <span className="ra-day-name">Sayfadaki {calls.length} arama</span>
                                            <span className="ra-day-rule" />
                                            <span className="ra-day-meta">sayfa {page + 1} / {tr(totalPages || 1)}</span>
                                        </div>

                                        {groups.map(([key, items]) => {
                                            const d = new Date(items[0].startedAt || items[0].createdAt);
                                            return (
                                                <div key={key}>
                                                    <div className="ra-day">
                                                        <span className="ra-day-name">{trDay(d)}</span>
                                                        <span className="ra-day-rule" />
                                                        <span className="ra-day-meta">{items.length} arama</span>
                                                    </div>
                                                    {items.map(call => {
                                                        const s = statusOf(call.status);
                                                        const m = moodOf(call.sentiment);
                                                        const sel = selectedCalls.has(call.id);
                                                        const inbound = call.direction === 'inbound';
                                                        const open = expandedCall === call.id;
                                                        const one = ((((call.cost || 0) / 100) * 2) + 0.10).toFixed(3);
                                                        return (
                                                            <React.Fragment key={call.id}>
                                                                <div className={`ra-row-call${sel ? ' sel' : ''}`}>
                                                                    <div>
                                                                        <button className={`ra-check${sel ? ' on' : ''}`} onClick={() => toggleSelect(call.id)}>
                                                                            {sel && <Check size={11} />}
                                                                        </button>
                                                                    </div>
                                                                    <div className="ra-time">{trTime(new Date(call.startedAt || call.createdAt))}</div>
                                                                    <div>
                                                                        <span className={`ra-dir ${inbound ? 'ra-dir-in' : 'ra-dir-out'}`}
                                                                            title={inbound ? 'Gelen arama' : 'Giden arama'}>
                                                                            {inbound ? <PhoneIncoming size={14} /> : <PhoneOutgoing size={14} />}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        <div className="ra-num">{inbound ? call.fromNumber : call.toNumber}</div>
                                                                        <div className="ra-num-sub">
                                                                            {inbound ? 'karşılayan hat' : 'arayan hat'} {inbound ? call.toNumber : call.fromNumber}
                                                                        </div>
                                                                    </div>
                                                                    <div className="ra-dur">{formatDuration(call.duration)}</div>
                                                                    <div>
                                                                        <span className="ra-status" style={{ color: '#334155' }}>
                                                                            <i style={{ background: s.dot }} />{s.label}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="ra-mood" style={{ color: m.color }}>
                                                                            <i className="ra-dot" style={{ background: m.dot }} />{m.label}
                                                                        </span>
                                                                    </div>
                                                                    <div className="ra-cost">${one}</div>
                                                                    <div>
                                                                        {(call.transcript || call.summary) ? (
                                                                            <button className={`ra-detail-btn${open ? ' on' : ''}`}
                                                                                onClick={() => setExpandedCall(open ? null : call.id)}>
                                                                                {open ? 'Kapat' : 'Detay'}
                                                                            </button>
                                                                        ) : <span style={{ color: '#cbd2dc', fontSize: '.76rem' }}>—</span>}
                                                                    </div>
                                                                </div>

                                                                {open && (
                                                                    <div className="ra-detail">
                                                                        {call.summary && (
                                                                            <div className="ra-detail-block">
                                                                                <div className="ra-detail-label">Özet</div>
                                                                                <p className="ra-detail-text">{call.summary}</p>
                                                                            </div>
                                                                        )}
                                                                        {call.transcript && (
                                                                            <div className="ra-detail-block">
                                                                                <div className="ra-detail-label">Transkript</div>
                                                                                <pre className="ra-transcript">{call.transcript}</pre>
                                                                            </div>
                                                                        )}
                                                                        {call.endedReason && (
                                                                            <div className="ra-detail-block">
                                                                                <div className="ra-detail-label">Sonlanma sebebi</div>
                                                                                <p className="ra-detail-text">{call.endedReason}</p>
                                                                            </div>
                                                                        )}
                                                                        {call.recordingUrl && (
                                                                            <div className="ra-detail-block">
                                                                                <a className="ra-play" href={call.recordingUrl} target="_blank" rel="noopener noreferrer">
                                                                                    <Play size={13} /> Kaydı Dinle
                                                                                </a>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}

                                        {totalPages > 1 && (
                                            <div className="ra-pager">
                                                <span className="ra-pager-info">
                                                    {page + 1} / {tr(totalPages)} · {tr(totalCalls)} arama
                                                </span>
                                                <div className="ra-pager-btns">
                                                    <button className="ra-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                                                        <ChevronLeft size={15} /> Önceki
                                                    </button>
                                                    <button className="ra-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                                                        Sonraki <ChevronRight size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                type="warning"
            />
        </>
    );
};

export default AICallAnalytics;
