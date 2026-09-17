import React, { useState, useEffect, useMemo } from 'react';
import {
    PhoneCall, PhoneOff, RefreshCw, Search, FileText, X, StickyNote
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import { contactAPI, retellAPI, funnelAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import './reportDesign.css';
import './AramaAnalizi.css';

const TZ = 'Europe/Istanbul';
const fmt = (o) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...o });
const trTime = (d) => fmt({ hour: '2-digit', minute: '2-digit' }).format(d);
const trDay = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const trShort = (d) => fmt({ day: 'numeric', month: 'short' }).format(d);
const trKey = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);
const tr = (n) => Number(n || 0).toLocaleString('tr-TR');

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
const initials2 = (n) => String(n || '').substring(0, 2).toLocaleUpperCase('tr');

const CALL_STATUS = {
    COMPLETED: { label: 'Tamamlandı', dot: '#10b981' },
    PLANNED:   { label: 'Bekliyor',   dot: '#f59e0b' },
    SCHEDULED: { label: 'Planlandı',  dot: '#6366f1' },
    CANCELLED: { label: 'İptal',      dot: '#94a3b8' },
};
const callStatusOf = (s) => CALL_STATUS[s] || { label: s || 'Bilinmiyor', dot: '#cbd5e1' };

const SENTIMENT = {
    Positive: { label: 'Olumlu',  color: '#047857', dot: '#10b981' },
    Negative: { label: 'Olumsuz', color: '#b91c1c', dot: '#ef4444' },
    Neutral:  { label: 'Nötr',    color: '#64748b', dot: '#cbd5e1' },
};

const AramaAnalizi = () => {
    const { currentWorkspace } = useAuth();
    const { showSuccess, showError } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const [scheduledCalls, setScheduledCalls] = useState([]);
    const [funnels, setFunnels] = useState([]);
    const [bottomTab, setBottomTab] = useState('calls'); // calls | uncalled
    
    // Note Modal States
    const [noteModalOpen, setNoteModalOpen] = useState(false);
    const [noteContactId, setNoteContactId] = useState(null);
    const [noteSuccess, setNoteSuccess] = useState(null);
    const [noteSentiment, setNoteSentiment] = useState(null);
    const [noteDesc, setNoteDesc] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);

    // Date filter states
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('aramaDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('aramaStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('aramaEndDate') || '');

    useEffect(() => {
        sessionStorage.setItem('aramaDateFilter', dateFilter);
        sessionStorage.setItem('aramaStartDate', startDate);
        sessionStorage.setItem('aramaEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    // Table filter & search states
    const [searchTerm, setSearchTerm] = useState('');

    // Modal states
    const [showPhoneModal, setShowPhoneModal] = useState(false);
    const [modalSearch, setModalSearch] = useState('');
    const [modalFilter, setModalFilter] = useState('all'); // all | called | notCalled

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadAllData();
        }
    }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const getDateRange = () => {
        const range = getDateRangeLogic(dateFilter, startDate, endDate);
        return { startDate: range.startDate, endDate: range.endDate };
    };

    const loadAllData = async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true);
            else setLoading(true);

            const dateParams = getDateRange();
            
            const [analyticsRes, scheduledRes, funnelsRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, dateParams),
                retellAPI.getScheduledCalls(currentWorkspace.id),
                funnelAPI.getAll(currentWorkspace.id).catch(() => ({ data: [] }))
            ]);

            setAnalytics(analyticsRes.data);
            setScheduledCalls(scheduledRes.data.scheduledCalls || []);
            setFunnels(funnelsRes.data?.funnels || funnelsRes.data || []);
        } catch (error) {
            console.error('Failed to load call analytics data:', error);
            showError('Arama analizi verileri yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };



    const handleCancelScheduledCall = async (callId) => {
        if (!window.confirm('Bu gecikmiş/planlanmış aramayı iptal etmek istediğinize emin misiniz?')) {
            return;
        }
        try {
            await retellAPI.cancelScheduledCall(currentWorkspace.id, callId);
            showSuccess('Planlanmış arama başarıyla iptal edildi.');
            // Reload scheduled calls
            const scheduledRes = await retellAPI.getScheduledCalls(currentWorkspace.id);
            setScheduledCalls(scheduledRes.data.scheduledCalls || []);
        } catch (error) {
            console.error('Failed to cancel scheduled call:', error);
            showError('Arama iptal edilirken bir hata oluştu.');
        }
    };

    const handleOpenNoteModal = (contactId) => {
        setNoteContactId(contactId);
        setNoteSuccess(null);
        setNoteSentiment(null);
        setNoteDesc('');
        setNoteModalOpen(true);
    };

    const handleSaveNote = async () => {
        if (!noteSuccess) {
            showError('Lütfen aramanın durumunu (Ulaşıldı / Ulaşılamadı) seçin.');
            return;
        }
        if (noteSuccess === 'SUCCESS' && !noteSentiment) {
            showError('Lütfen görüşmenin nasıl geçtiğini seçin.');
            return;
        }
        
        setNoteSaving(true);
        try {
            const dataToSave = {
                workspaceId: currentWorkspace.id,
                type: 'CALL',
                title: 'Telefon Görüşmesi',
                description: noteSuccess === 'FAILED' ? `📵 Ulaşılamadı: ${noteDesc}` : noteDesc,
                dueDate: new Date().toISOString(),
                assignedToId: null,
                teamId: null,
                status: 'COMPLETED',
                completedAt: new Date().toISOString(),
                callSuccessful: noteSuccess === 'SUCCESS',
                ...(noteSentiment && noteSuccess === 'SUCCESS' && { callSentiment: noteSentiment }),
                completePlannedCall: true
            };

            await activityAPI.createActivity(noteContactId, dataToSave);
            
            showSuccess('Arama notu başarıyla eklendi.');
            setNoteModalOpen(false);
            loadAllData(false);
        } catch (error) {
            console.error('Not eklenirken hata:', error);
            showError('Not eklenirken bir hata oluştu.');
        } finally {
            setNoteSaving(false);
        }
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleString('tr-TR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get call tracking stats
    const stats = analytics?.callTrackingStats || {
        totalWithPhone: 0,
        totalCalled: 0,
        totalCompleted: 0,
        totalNotCalled: 0,
        callRate: 0,
        details: [],
        phoneContactsList: [],
        activities: []
    };

    // ── Türetilmiş veriler ────────────────────────────────────────
    const callList = useMemo(() => stats.activities || [], [stats.activities]);
    const uncalledList = useMemo(
        () => (stats.phoneContactsList || []).filter(c => !c.wasCalled),
        [stats.phoneContactsList]
    );
    const closureNotes = useMemo(
        () => analytics?.callTrackingStats?.closureNotes || [],
        [analytics]
    );

    const stageOf = (funnelStageId, fallbackStatus) => {
        if (funnelStageId && funnels.length > 0) {
            for (const f of funnels) {
                const st = f.stages?.find(x => x.id === funnelStageId);
                if (st) return { name: st.name, color: st.color || '#6366f1' };
            }
        }
        if (fallbackStatus) {
            const labels = { NEW: 'Yeni', OPPORTUNITY: 'Fırsat', CUSTOMER: 'Müşteri', LOST: 'Kayıp' };
            return { name: labels[fallbackStatus] || fallbackStatus, color: '#94a3b8' };
        }
        return null;
    };

    const matches = (...fields) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLocaleLowerCase('tr');
        return fields.some(v => String(v || '').toLocaleLowerCase('tr').includes(q));
    };

    const dateOfCall = (a) => new Date(a.completedAt || a.dueDate || a.createdAt);

    const shownCalls = useMemo(() => callList
        .filter(a => matches(a.contact?.name, a.contact?.phone, a.contact?.activeAssigneeName, a.contact?.assigneeName))
        .sort((a, b) => dateOfCall(b) - dateOfCall(a)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [callList, searchTerm]);

    const shownUncalled = useMemo(() => uncalledList
        .filter(c => matches(c.name, c.phone, c.activeAssigneeName, c.assigneeName)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [uncalledList, searchTerm]);

    const shownNotes = useMemo(() => closureNotes
        .filter(n => matches(n.contact?.name, n.assignee?.name, n.creator?.name, n.result, n.description)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [closureNotes, searchTerm]);

    // Günlük dağılım
    const chart = useMemo(() => {
        const map = new Map();
        for (const a of callList) {
            const d = dateOfCall(a);
            if (isNaN(d)) continue;
            const k = trKey(d);
            if (!map.has(k)) map.set(k, { key: k, date: d, count: 0 });
            map.get(k).count++;
        }
        const buckets = [...map.values()].sort((a, b) => a.date - b.date);
        return { buckets, peak: buckets.length ? Math.max(...buckets.map(b => b.count)) : 0 };
    }, [callList]);

    // Arama listesini gün gün grupla
    const callGroups = useMemo(() => {
        const map = new Map();
        for (const a of shownCalls) {
            const d = dateOfCall(a);
            if (isNaN(d)) continue;
            const k = trKey(d);
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(a);
        }
        return [...map.entries()];
    }, [shownCalls]);

    const todayKey = trKey(new Date());
    const activeLabel = dateFilterOptions.find(o => o.key === dateFilter)?.label || '';
    const calledPct = stats.totalWithPhone ? (stats.totalCalled / stats.totalWithPhone) * 100 : 0;

    if (loading && !analytics) {
        return (
            <div className="ra-page">
                <div className="ra-loading">
                    <RefreshCw className="ra-spin" size={30} />
                    <p style={{ fontWeight: 600, marginTop: 14, fontSize: '0.85rem' }}>Arama Analizi yükleniyor…</p>
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
                        <h1>Arama Analizi</h1>
                        <p>Numaralı başvurular, aranma durumu ve temsilci arama notları</p>
                    </div>
                    <div className="ra-head-actions">
                        <button className="ra-btn" onClick={() => loadAllData(true)} disabled={refreshing}>
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
                </div>

                {/* Hero — bu sayfanın asıl sorusu: numaralı kişilerin kaçı arandı */}
                <div className="ra-surface ra-hero">
                    <div className="ra-hero-left ra-clickable" onClick={() => setShowPhoneModal(true)}
                        title="Numaralı kişilerin tamamını gör">
                        <div className="ra-metric-label">Numaralı Başvuru</div>
                        <div className="ra-metric-value">{tr(stats.totalWithPhone)}</div>
                        <div className="ra-metric-note">{activeLabel} · listeyi açmak için tıklayın</div>

                        <div className="ra-split">
                            <div className="ra-split-bar">
                                <i style={{ width: `${calledPct}%`, background: 'var(--accent)' }}
                                    title={`Arandı: ${stats.totalCalled}`} />
                                <i style={{ width: `${100 - calledPct}%`, background: '#cbd5e1' }}
                                    title={`Aranmadı: ${stats.totalNotCalled}`} />
                            </div>
                            <div className="ra-split-legend">
                                <div className="ra-split-item">Arandı<b>{tr(stats.totalCalled)} <span style={{ fontSize: '.72rem', color: '#94a3b8', fontWeight: 600 }}>%{Math.round(calledPct)}</span></b></div>
                                <div className="ra-split-item" style={{ textAlign: 'right' }}>Aranmadı<b>{tr(stats.totalNotCalled)}</b></div>
                            </div>
                        </div>
                    </div>

                    <div className="ra-hero-right">
                        <div className="ra-chart-head">
                            <span className="ra-chart-title">Günlük arama dağılımı</span>
                            {chart.peak > 0 && <span className="ra-chart-peak">en yoğun: {tr(chart.peak)} arama</span>}
                        </div>
                        {chart.buckets.length > 0 ? (
                            <>
                                <div className="ra-chart">
                                    {chart.buckets.map(b => (
                                        <div key={b.key} className={`ra-col${b.key === todayKey ? ' is-today' : ''}`}
                                            title={`${trShort(b.date)} · ${b.count} arama`}>
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
                        { label: 'Toplam Arama', dot: '#ef4444', value: tr(stats.totalCallCount), sub: 'yapılan arama sayısı' },
                        { label: 'Ulaşıldı', dot: '#10b981', value: tr(callList.filter(a => a.callSuccessful === true).length), sub: 'görüşme sağlandı' },
                        { label: 'Ulaşılamadı', dot: '#94a3b8', value: tr(callList.filter(a => a.callSuccessful === false).length), sub: 'açmadı / meşgul' },
                        { label: 'Olumlu', dot: '#10b981', value: tr(callList.filter(a => a.callSentiment === 'Positive').length), sub: 'görüşme değerlendirmesi' },
                        { label: 'Olumsuz', dot: '#ef4444', value: tr(callList.filter(a => a.callSentiment === 'Negative').length), sub: 'görüşme değerlendirmesi' },
                        { label: 'Aranacak', dot: '#f59e0b', value: tr(callList.filter(a => a.status !== 'COMPLETED' && a.status !== 'CANCELLED').length), sub: 'bekleyen kayıt' },
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
                        <div className="ra-tabs">
                            <button className={`ra-tab${bottomTab === 'calls' ? ' active' : ''}`} onClick={() => setBottomTab('calls')}>
                                <PhoneCall size={14} /> Arama Listesi <b>{tr(callList.length)}</b>
                            </button>
                            <button className={`ra-tab${bottomTab === 'uncalled' ? ' active' : ''}`} onClick={() => setBottomTab('uncalled')}>
                                <PhoneOff size={14} /> Aranmayanlar <b>{tr(uncalledList.length)}</b>
                            </button>
                            {closureNotes.length > 0 && (
                                <button className={`ra-tab${bottomTab === 'notes' ? ' active' : ''}`} onClick={() => setBottomTab('notes')}>
                                    <StickyNote size={14} /> Arama Notları <b>{tr(closureNotes.length)}</b>
                                </button>
                            )}
                        </div>
                        <div className="ra-search">
                            <Search size={15} />
                            <input type="text" placeholder="İsim, numara veya temsilci ara…"
                                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </div>

                    {/* ── Arama Listesi ── */}
                    {bottomTab === 'calls' && (
                        callGroups.length === 0 ? (
                            <div className="ra-empty">
                                <div className="ra-empty-icon"><PhoneCall size={24} /></div>
                                <h3>{searchTerm ? 'Aramanızla eşleşen kayıt yok' : 'Bu dönemde arama kaydı yok'}</h3>
                                <p>{searchTerm ? 'Farklı bir isim, numara veya temsilci deneyin.' : 'Başka bir dönem seçebilirsiniz.'}</p>
                            </div>
                        ) : callGroups.map(([key, items]) => (
                            <div key={key}>
                                <div className="ra-day">
                                    <span className="ra-day-name">{trDay(dateOfCall(items[0]))}</span>
                                    {key === todayKey && <span className="ra-day-today">BUGÜN</span>}
                                    <span className="ra-day-rule" />
                                    <span className="ra-day-meta">{items.length} arama</span>
                                </div>
                                {items.map(a => {
                                    const st = callStatusOf(a.status);
                                    const av = avatarOf(a.contact?.name);
                                    const stage = stageOf(a.contact?.funnelStageId, a.contact?.status);
                                    const agent = a.contact?.activeAssigneeName || a.contact?.assigneeName;
                                    const sent = SENTIMENT[a.callSentiment];
                                    return (
                                        <div className="ra-row-call2" key={a.id}>
                                            <div className="ra-time">{trTime(dateOfCall(a))}</div>
                                            <div className="ra-avatar" style={{ background: av.bg, color: av.color }}>{av.initials}</div>
                                            <div>
                                                <div className="ra-name">{a.contact?.name || 'Bilinmiyor'}</div>
                                                {a.contact?.phone && <div className="ra-phone">{a.contact.phone}</div>}
                                                {a.contact?.aiTopic && <div className="ra-sub"><span className="ra-topic">{a.contact.aiTopic}</span></div>}
                                            </div>
                                            <div>
                                                {agent ? (
                                                    <span className="ra-who">
                                                        <span className="ra-mini-avatar">{initials2(agent)}</span>
                                                        <span>{agent}</span>
                                                    </span>
                                                ) : <span className="ra-who-none">Atanmamış</span>}
                                            </div>
                                            <div>
                                                {stage ? (
                                                    <span className="ra-stage" style={{ background: `${stage.color}14`, color: stage.color }}>{stage.name}</span>
                                                ) : <span className="ra-who-none">—</span>}
                                            </div>
                                            <div>
                                                <span className="ra-status" style={{ color: '#334155' }}>
                                                    <i style={{ background: st.dot }} />{st.label}
                                                </span>
                                            </div>
                                            <div>
                                                {a.callSuccessful === true && (
                                                    <span className="ra-status" style={{ color: '#047857' }}><i style={{ background: '#10b981' }} />Ulaşıldı</span>
                                                )}
                                                {a.callSuccessful === false && (
                                                    <span className="ra-status" style={{ color: '#b91c1c' }}><i style={{ background: '#ef4444' }} />Ulaşılamadı</span>
                                                )}
                                                {a.callSuccessful === null && sent && (
                                                    <span className="ra-status" style={{ color: sent.color }}><i style={{ background: sent.dot }} />{sent.label}</span>
                                                )}
                                                {a.callSuccessful === null && !sent && <span className="ra-who-none">—</span>}
                                            </div>
                                            <div>
                                                <button className="ra-note-btn" onClick={() => handleOpenNoteModal(a.contact?.id || a.contactId)}>
                                                    <FileText size={12} /> Not Ekle
                                                </button>
                                            </div>
                                            {a.result && <div className="ra-note">{a.result}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}

                    {/* ── Aranmayanlar ── */}
                    {bottomTab === 'uncalled' && (
                        shownUncalled.length === 0 ? (
                            <div className="ra-empty">
                                <div className="ra-empty-icon"><PhoneCall size={24} /></div>
                                <h3>{searchTerm ? 'Aramanızla eşleşen kişi yok' : 'Numaralı herkes aranmış'}</h3>
                                <p>{searchTerm ? 'Farklı bir isim veya numara deneyin.' : 'Bu dönemde aranmayan kimse kalmadı.'}</p>
                            </div>
                        ) : (
                            <>
                                <div className="ra-day">
                                    <span className="ra-day-name">Henüz aranmamış</span>
                                    <span className="ra-day-rule" />
                                    <span className="ra-day-meta">{tr(shownUncalled.length)} kişi</span>
                                </div>
                                {shownUncalled.map(c => {
                                    const av = avatarOf(c.name);
                                    const stage = stageOf(c.funnelStageId, c.status);
                                    const agent = c.activeAssigneeName || c.assigneeName;
                                    return (
                                        <div className="ra-row-uncalled" key={c.contactId}>
                                            <div className="ra-avatar" style={{ background: av.bg, color: av.color }}>{av.initials}</div>
                                            <div>
                                                <div className="ra-name">{c.name}</div>
                                                {c.phone && <div className="ra-phone">{c.phone}</div>}
                                                {c.company && <div className="ra-sub">{c.company}</div>}
                                            </div>
                                            <div>
                                                {agent ? (
                                                    <span className="ra-who">
                                                        <span className="ra-mini-avatar">{initials2(agent)}</span>
                                                        <span>{agent}</span>
                                                    </span>
                                                ) : <span className="ra-who-none">Atanmamış</span>}
                                            </div>
                                            <div>
                                                {c.aiTopic ? <span className="ra-topic">{c.aiTopic}</span> : <span className="ra-who-none">—</span>}
                                            </div>
                                            <div>
                                                {stage ? (
                                                    <span className="ra-stage" style={{ background: `${stage.color}14`, color: stage.color }}>{stage.name}</span>
                                                ) : <span className="ra-who-none">—</span>}
                                                <div className="ra-sub">{c.createdAt ? trShort(new Date(c.createdAt)) : ''}</div>
                                            </div>
                                            <div>
                                                <button className="ra-note-btn" onClick={() => handleOpenNoteModal(c.contactId)}>
                                                    <FileText size={12} /> Not Ekle
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )
                    )}

                    {/* ── Arama Notları (kapatılan aramalar) ── */}
                    {bottomTab === 'notes' && (
                        shownNotes.length === 0 ? (
                            <div className="ra-empty">
                                <div className="ra-empty-icon"><StickyNote size={24} /></div>
                                <h3>Not bulunamadı</h3>
                                <p>Temsilciler arama sonrası not eklediğinde burada görünür.</p>
                            </div>
                        ) : (
                            <>
                                <div className="ra-day">
                                    <span className="ra-day-name">Temsilci arama notları</span>
                                    <span className="ra-day-rule" />
                                    <span className="ra-day-meta">{tr(shownNotes.length)} not</span>
                                </div>
                                {shownNotes.map(n => {
                                    const d = new Date(n.completedAt || n.createdAt);
                                    const av = avatarOf(n.contact?.name);
                                    const agent = n.assignee?.name || n.creator?.name;
                                    const sent = SENTIMENT[n.callSentiment];
                                    return (
                                        <div className="ra-row-uncalled" key={n.id}>
                                            <div className="ra-avatar" style={{ background: av.bg, color: av.color }}>{av.initials}</div>
                                            <div>
                                                <div className="ra-name">{n.contact?.name || '—'}</div>
                                                <div className="ra-phone">{trShort(d)} {trTime(d)}</div>
                                            </div>
                                            <div>
                                                {agent ? (
                                                    <span className="ra-who">
                                                        <span className="ra-mini-avatar">{initials2(agent)}</span>
                                                        <span>{agent}</span>
                                                    </span>
                                                ) : <span className="ra-who-none">—</span>}
                                            </div>
                                            <div>
                                                <span className="ra-status" style={{ color: n.callSuccessful ? '#047857' : '#b91c1c' }}>
                                                    <i style={{ background: n.callSuccessful ? '#10b981' : '#ef4444' }} />
                                                    {n.callSuccessful ? 'Ulaşıldı' : 'Ulaşılamadı'}
                                                </span>
                                            </div>
                                            <div>
                                                {sent ? (
                                                    <span className="ra-status" style={{ color: sent.color }}><i style={{ background: sent.dot }} />{sent.label}</span>
                                                ) : <span className="ra-who-none">—</span>}
                                            </div>
                                            <div />
                                            {(n.result || n.description) && <div className="ra-note">{n.result || n.description}</div>}
                                        </div>
                                    );
                                })}
                            </>
                        )
                    )}
                </div>

            </div>
            {/* Modal - Numaralı Kişiler Listesi */}
            {showPhoneModal && (
                <div className="modal-overlay">
                    <div className="modal-backdrop" onClick={() => setShowPhoneModal(false)} />
                    <div className="modal-container">
                        <div className="modal-header">
                            <div className="modal-header-info">
                                <h3>Numaralı Kişiler</h3>
                                <p>Rehberinizde telefon numarası kayıtlı olan {stats.phoneContactsList?.length || 0} kişi</p>
                            </div>
                            <button className="modal-close-btn" onClick={() => setShowPhoneModal(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div className="modal-filters">
                            <input 
                                type="text"
                                className="modal-search"
                                placeholder="İsim veya numara ara..."
                                value={modalSearch}
                                onChange={(e) => setModalSearch(e.target.value)}
                            />
                            
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button 
                                    className={`modal-filter-btn ${modalFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setModalFilter('all')}
                                >
                                    Tümü
                                </button>
                                <button 
                                    className={`modal-filter-btn ${modalFilter === 'called' ? 'active' : ''}`}
                                    onClick={() => setModalFilter('called')}
                                >
                                    Arandı
                                </button>
                                <button 
                                    className={`modal-filter-btn ${modalFilter === 'notCalled' ? 'active' : ''}`}
                                    onClick={() => setModalFilter('notCalled')}
                                >
                                    Aranmadı
                                </button>
                            </div>
                        </div>

                        <div className="modal-body">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Kişi</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Telefon</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Durum</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Arama</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Son Arama</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.phoneContactsList
                                        ?.filter(c => {
                                            if (modalFilter === 'called') return c.wasCalled;
                                            if (modalFilter === 'notCalled') return !c.wasCalled;
                                            return true;
                                        })
                                        ?.filter(c => {
                                            if (!modalSearch) return true;
                                            const query = modalSearch.toLowerCase();
                                            return c.name.toLowerCase().includes(query) || (c.phone || '').includes(query);
                                        })
                                        ?.map(c => (
                                            <tr key={c.contactId} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                <td style={{ padding: '10px 6px', fontWeight: 600, color: '#0f172a' }}>{c.name}</td>
                                                <td style={{ padding: '10px 6px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.78rem' }}>{c.phone}</td>
                                                <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                                                    {c.wasCalled ? (
                                                        <span style={{ fontSize: '0.68rem', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                            ✓ Arandı
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.68rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                            ✗ Aranmadı
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                                                    {c.wasCalled ? (
                                                        <span style={{ fontWeight: 700, color: '#6366f1' }}>{c.totalCalls}</span>
                                                    ) : (
                                                        <span style={{ color: '#d1d5db' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 6px', color: '#64748b', fontSize: '0.76rem' }}>
                                                    {formatDateTime(c.lastCallDate)}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                            
                            {stats.phoneContactsList
                                ?.filter(c => modalFilter === 'called' ? c.wasCalled : modalFilter === 'notCalled' ? !c.wasCalled : true)
                                ?.filter(c => !modalSearch || c.name.toLowerCase().includes(modalSearch.toLowerCase()) || (c.phone || '').includes(modalSearch))
                                ?.length === 0 && (
                                    <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: '0.85rem' }}>Eşleşen sonuç bulunamadı.</div>
                                )}
                        </div>
                    </div>
                </div>
            )}

            {/* Arama Notları artık üstteki sekmede — ayrı bir tablo olarak
                tekrarlanmıyordu bile, aynı veri iki yerde duruyordu. */}

            {noteModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-backdrop" onClick={() => setNoteModalOpen(false)} />
                    <div className="modal-container" style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <div className="modal-header-info">
                                <h3>Arama Notu Ekle</h3>
                                <p>Müşteri aramasıyla ilgili detayları girin</p>
                            </div>
                            <button className="modal-close-btn" onClick={() => setNoteModalOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>📞 Arama Başarılı mı?</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setNoteSuccess('SUCCESS')}
                                        style={{
                                            flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                            borderColor: noteSuccess === 'SUCCESS' ? '#16a34a' : '#e5e7eb',
                                            background: noteSuccess === 'SUCCESS' ? '#dcfce7' : '#fff',
                                            color: noteSuccess === 'SUCCESS' ? '#15803d' : '#6b7280',
                                            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        ✅ Ulaşıldı
                                        <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Görüşme sağlandı</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setNoteSuccess('FAILED'); setNoteSentiment(null); }}
                                        style={{
                                            flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                            borderColor: noteSuccess === 'FAILED' ? '#ef4444' : '#e5e7eb',
                                            background: noteSuccess === 'FAILED' ? '#fef2f2' : '#fff',
                                            color: noteSuccess === 'FAILED' ? '#dc2626' : '#6b7280',
                                            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        ❌ Ulaşılamadı
                                        <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Açmadı veya meşgul</div>
                                    </button>
                                </div>
                            </div>

                            {/* Duygu Analizi */}
                            {noteSuccess !== 'FAILED' && (
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>🎭 Görüşme Nasıl Geçti?</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {[
                                        { key: 'Positive', emoji: '😊', label: 'Olumlu', color: '#16a34a', bg: '#dcfce7' },
                                        { key: 'Neutral', emoji: '😐', label: 'Nötr', color: '#6b7280', bg: '#f3f4f6' },
                                        { key: 'Negative', emoji: '😞', label: 'Olumsuz', color: '#ef4444', bg: '#fef2f2' }
                                    ].map(s => (
                                        <button
                                            key={s.key}
                                            type="button"
                                            onClick={() => setNoteSentiment(s.key)}
                                            style={{
                                                flex: 1, padding: '10px 6px', borderRadius: '10px', border: '2px solid',
                                                borderColor: noteSentiment === s.key ? s.color : '#e5e7eb',
                                                background: noteSentiment === s.key ? s.bg : '#fff',
                                                color: noteSentiment === s.key ? s.color : '#6b7280',
                                                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                transition: 'all 0.2s ease', textAlign: 'center'
                                            }}
                                        >
                                            <div style={{ fontSize: '1.4rem', marginBottom: '2px' }}>{s.emoji}</div>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            )}

                            <div>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                                    📝 Notlar
                                </label>
                                <textarea 
                                    style={{ 
                                        width: '100%', minHeight: '110px', padding: '12px', 
                                        border: '1.5px solid #e5e7eb', borderRadius: '10px',
                                        fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', outline: 'none'
                                    }}
                                    placeholder="Görüşme detaylarını girin..."
                                    value={noteDesc}
                                    onChange={(e) => setNoteDesc(e.target.value)}
                                ></textarea>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid #f1f5f9' }}>
                            <button className="btn btn-outline" onClick={() => setNoteModalOpen(false)}>İptal</button>
                            <button className="btn btn-primary" disabled={noteSaving || !noteSuccess || (noteSuccess === 'SUCCESS' && !noteSentiment)} onClick={handleSaveNote}>
                                {noteSaving ? 'Kaydediliyor...' : 'Notu Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AramaAnalizi;
