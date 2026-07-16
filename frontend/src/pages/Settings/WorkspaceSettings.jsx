import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Settings2, CalendarCheck, Phone,
    ToggleLeft, ToggleRight,
    ChevronRight, ChevronDown, Clock, Check, Loader2,
    PhoneCall, Save, Bot, RefreshCw, Building2, ShoppingCart
} from 'lucide-react';
import './WorkspaceSettings.css';

const DAYS = [
    { key: 1, label: 'Pazartesi' },
    { key: 2, label: 'Salı'      },
    { key: 3, label: 'Çarşamba'  },
    { key: 4, label: 'Perşembe'  },
    { key: 5, label: 'Cuma'      },
    { key: 6, label: 'Cumartesi' },
    { key: 0, label: 'Pazar'     },
];

const DEFAULT_APPT_SCHEDULE = DAYS.map(d => ({
    day: d.key,
    enabled: d.key >= 1 && d.key <= 5,
    start: '09:00',
    end: '18:00',
}));

// Retell'in retellAutoCallSchedule formatı: { start, end, days: [1,2,3,4,5] }
const DEFAULT_RETELL_SCHEDULE = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };

/* ────────────────────────────────────────────────
   Rezervasyon Saatleri Paneli
───────────────────────────────────────────────── */
const ApptSchedulePanel = ({ schedule, setSchedule, saving, onSave, saved }) => (
    <div className="ws-schedule-panel">
        <div className="ws-schedule-header">
            <Clock size={15} className="ws-schedule-header-icon" />
            <span>Çalışma Günleri ve Saatleri</span>
        </div>
        <div className="ws-schedule-grid">
            {DAYS.map(d => {
                const s = schedule.find(x => x.day === d.key) || { day: d.key, enabled: false, start: '09:00', end: '18:00' };
                return (
                    <div key={d.key} className={`ws-schedule-row ${s.enabled ? 'row-enabled' : 'row-disabled'}`}>
                        <button
                            className={`ws-day-toggle ${s.enabled ? 'day-on' : 'day-off'}`}
                            onClick={() => setSchedule(prev => prev.map(x => x.day === d.key ? { ...x, enabled: !x.enabled } : x))}
                        >
                            {s.enabled && <Check size={11} />}
                        </button>
                        <span className={`ws-day-label ${s.enabled ? '' : 'label-dim'}`}>{d.label}</span>
                        <div className={`ws-time-wrap ${!s.enabled ? 'time-disabled' : ''}`}>
                            <input type="time" value={s.start} disabled={!s.enabled}
                                onChange={e => setSchedule(prev => prev.map(x => x.day === d.key ? { ...x, start: e.target.value } : x))}
                                className="ws-time-input" />
                            <span className="ws-time-sep">—</span>
                            <input type="time" value={s.end} disabled={!s.enabled}
                                onChange={e => setSchedule(prev => prev.map(x => x.day === d.key ? { ...x, end: e.target.value } : x))}
                                className="ws-time-input" />
                        </div>
                    </div>
                );
            })}
        </div>
        <div className="ws-schedule-quick">
            <span className="ws-quick-label">Hızlı seç:</span>
            <button className="ws-quick-btn" onClick={() => setSchedule(prev => prev.map(s => ({ ...s, enabled: s.day >= 1 && s.day <= 5 })))}>Hafta içi</button>
            <button className="ws-quick-btn" onClick={() => setSchedule(prev => prev.map(s => ({ ...s, enabled: true })))}>Her gün</button>
            <button className="ws-quick-btn ws-quick-btn-danger" onClick={() => setSchedule(prev => prev.map(s => ({ ...s, enabled: false })))}>Temizle</button>
        </div>
        <div className="ws-schedule-footer">
            <button className="ws-save-schedule-btn" onClick={onSave} disabled={saving}>
                {saving ? <><Loader2 size={15} className="spin" /> Kaydediliyor...</>
                    : saved ? <><Check size={15} /> Kaydedildi!</>
                    : <><Save size={15} /> Kaydet</>}
            </button>
        </div>
    </div>
);

/* ────────────────────────────────────────────────
   Retell Arama Saatleri Paneli  (sadece schedule)
───────────────────────────────────────────────── */
const RetellSchedulePanel = ({ schedule, setSchedule, autoCallEnabled, setAutoCallEnabled, agents, agentId, setAgentId, loadingAgents, onRefreshAgents, saving, onSave, saved }) => {
    return (
        <div className="ws-schedule-panel">
            <div className="ws-schedule-header">
                <PhoneCall size={15} className="ws-schedule-header-icon" style={{ color: '#3b82f6' }} />
                <span>Otomatik Arama Ayarları</span>
            </div>

            {/* Agent Seçimi */}
            <div className="ws-retell-agent-row">
                <div className="ws-retell-agent-label">
                    <Bot size={15} style={{ color: '#3b82f6' }} />
                    Arama yapacak AI Agent
                </div>
                <div className="ws-retell-agent-select-wrap">
                    <select
                        className="ws-retell-agent-select"
                        value={agentId}
                        onChange={e => setAgentId(e.target.value)}
                        disabled={loadingAgents}
                    >
                        <option value="">Agent seçin...</option>
                        {agents.map(a => (
                            <option key={a.agent_id} value={a.agent_id}>
                                {a.agent_name || a.agent_id}
                            </option>
                        ))}
                    </select>
                    <button
                        className="ws-retell-agent-refresh"
                        onClick={onRefreshAgents}
                        disabled={loadingAgents}
                        title="Agentları yenile"
                    >
                        <RefreshCw size={13} className={loadingAgents ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Auto-call toggle */}
            <div className="ws-retell-autocall-row">
                <div>
                    <div className="ws-retell-autocall-title">Otomatik Aramayı Etkinleştir</div>
                    <div className="ws-retell-autocall-desc">
                        Belirlenen günler ve saatlerde yeni müşterileri otomatik arar
                    </div>
                </div>
                <button
                    className={`ws-toggle-btn ${autoCallEnabled ? 'toggle-on' : 'toggle-off'}`}
                    style={{ minWidth: 76, padding: '7px 14px' }}
                    onClick={() => setAutoCallEnabled(v => !v)}
                >
                    {autoCallEnabled ? <><ToggleRight size={18} /> Aktif</> : <><ToggleLeft size={18} /> Pasif</>}
                </button>
            </div>

            {autoCallEnabled && (<>
                {/* Saat aralığı */}
                <div className="ws-retell-time-row">
                    <Clock size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                    <span className="ws-retell-time-label">Arama saatleri:</span>
                    <input
                        type="time"
                        value={schedule.start || '09:00'}
                        onChange={e => setSchedule(prev => ({ ...prev, start: e.target.value }))}
                        className="ws-time-input"
                    />
                    <span className="ws-time-sep">—</span>
                    <input
                        type="time"
                        value={schedule.end || '18:00'}
                        onChange={e => setSchedule(prev => ({ ...prev, end: e.target.value }))}
                        className="ws-time-input"
                    />
                </div>

                {/* Günler */}
                <div className="ws-retell-days-section">
                    <div className="ws-retell-days-label">Arama yapılacak günler:</div>
                    <div className="ws-retell-days-grid">
                        {DAYS.map(d => {
                            const active = (schedule.days || []).includes(d.key);
                            return (
                                <button
                                    key={d.key}
                                    className={`ws-retell-day-btn ${active ? 'retell-day-on' : 'retell-day-off'}`}
                                    onClick={() => setSchedule(prev => {
                                        const days = prev.days || [];
                                        return {
                                            ...prev,
                                            days: active ? days.filter(x => x !== d.key) : [...days, d.key].sort()
                                        };
                                    })}
                                >
                                    {d.label.slice(0, 3)}
                                </button>
                            );
                        })}
                    </div>

                    {/* Hızlı seç */}
                    <div className="ws-schedule-quick" style={{ paddingTop: 10, borderTop: 'none', marginBottom: 0 }}>
                        <span className="ws-quick-label">Hızlı:</span>
                        <button className="ws-quick-btn" onClick={() => setSchedule(prev => ({ ...prev, days: [1, 2, 3, 4, 5] }))}>Hafta içi</button>
                        <button className="ws-quick-btn" onClick={() => setSchedule(prev => ({ ...prev, days: [0, 1, 2, 3, 4, 5, 6] }))}>Her gün</button>
                    </div>
                </div>

                <div className="ws-retell-info-box">
                    💡 Arama saatleri dışında gelen yeni müşteriler kuyruğa alınır, belirlenen saatte otomatik aranır.
                </div>
            </>)}

            <div className="ws-schedule-footer">
                <button className="ws-save-schedule-btn ws-save-blue" onClick={onSave} disabled={saving}>
                    {saving ? <><Loader2 size={15} className="spin" /> Kaydediliyor...</>
                        : saved ? <><Check size={15} /> Kaydedildi!</>
                        : <><Save size={15} /> Kaydet</>}
                </button>
            </div>
        </div>
    );
};

/* ────────────────────────────────────────────────
   Ana Sayfa
───────────────────────────────────────────────── */
const WorkspaceSettings = () => {
    const { currentWorkspace } = useAuth();

    // Rezervasyon
    const [appointmentEnabled, setAppointmentEnabled] = useState(true);
    const [apptSchedule, setApptSchedule] = useState(DEFAULT_APPT_SCHEDULE);
    const [showApptSchedule, setShowApptSchedule] = useState(false);
    const [apptSaving, setApptSaving] = useState(false);
    const [apptToggleSaving, setApptToggleSaving] = useState(false);
    const [apptSaved, setApptSaved] = useState(false);
    const [apptToggleSaved, setApptToggleSaved] = useState(false);

    // Retell
    const [retellConfigured, setRetellConfigured] = useState(false);
    const [retellAutoCallEnabled, setRetellAutoCallEnabled] = useState(false);
    const [retellSchedule, setRetellSchedule] = useState(DEFAULT_RETELL_SCHEDULE);
    const [retellAgentId, setRetellAgentId] = useState('');
    const [retellAgents, setRetellAgents] = useState([]);
    const [loadingAgents, setLoadingAgents] = useState(false);
    const [showRetellSchedule, setShowRetellSchedule] = useState(false);
    const [retellSaving, setRetellSaving] = useState(false);
    const [retellSaved, setRetellSaved] = useState(false);

    // Gayrimenkul
    const [realEstateEnabled, setRealEstateEnabled] = useState(false);
    const [realEstateSaving, setRealEstateSaving] = useState(false);

    // Satış
    const [salesEnabled, setSalesEnabled] = useState(false);
    const [salesSaving, setSalesSaving] = useState(false);

    useEffect(() => {
        if (!currentWorkspace?.id) return;
        // Workspace
        import('../../services/api').then(({ default: api }) => {
            api.get(`/workspaces/${currentWorkspace.id}`)
                .then(res => {
                    const ws = res.data?.workspace || res.data;
                    if (ws?.appointmentEnabled !== undefined) setAppointmentEnabled(ws.appointmentEnabled);
                    if (ws?.appointmentSchedule && Array.isArray(ws.appointmentSchedule)) setApptSchedule(ws.appointmentSchedule);
                    if (ws?.realEstateEnabled !== undefined) setRealEstateEnabled(ws.realEstateEnabled);
                    if (ws?.salesEnabled !== undefined) setSalesEnabled(ws.salesEnabled);
                })
                .catch(() => {});
        });
        // Retell settings
        import('../../services/api').then(({ retellAPI }) => {
            retellAPI.getSettings(currentWorkspace.id)
                .then(res => {
                    const configured = !!res.data?.retellAgentId;
                    setRetellConfigured(configured);
                    setRetellAutoCallEnabled(res.data?.retellAutoCallEnabled || false);
                    if (res.data?.retellAutoCallSchedule) setRetellSchedule(res.data.retellAutoCallSchedule);
                    if (res.data?.retellAgentId) setRetellAgentId(res.data.retellAgentId);
                    // Agentları yükle
                    if (configured) {
                        setLoadingAgents(true);
                        retellAPI.getAgents(currentWorkspace.id)
                            .then(r => setRetellAgents(r.data?.agents || []))
                            .catch(() => {})
                            .finally(() => setLoadingAgents(false));
                    }
                })
                .catch(() => {});
        });
    }, [currentWorkspace?.id]);

    // Rezervasyon toggle
    const handleToggleAppointment = async () => {
        if (apptToggleSaving) return;
        const newVal = !appointmentEnabled;
        setApptToggleSaving(true);
        try {
            const { default: api } = await import('../../services/api');
            await api.patch(`/workspaces/${currentWorkspace.id}/appointment-module`, { enabled: newVal });
            setAppointmentEnabled(newVal);
            setApptToggleSaved(true);
            setTimeout(() => setApptToggleSaved(false), 2000);
        } catch (err) { console.error(err); }
        finally { setApptToggleSaving(false); }
    };

    // Rezervasyon saatleri kaydet
    const handleApptScheduleSave = async () => {
        if (apptSaving) return;
        setApptSaving(true);
        try {
            const { default: api } = await import('../../services/api');
            await api.patch(`/workspaces/${currentWorkspace.id}/appointment-schedule`, { schedule: apptSchedule });
            setApptSaved(true);
            setTimeout(() => setApptSaved(false), 2000);
        } catch (err) { console.error(err); }
        finally { setApptSaving(false); }
    };

    const handleRetellScheduleSave = async () => {
        if (retellSaving) return;
        setRetellSaving(true);
        try {
            const { retellAPI } = await import('../../services/api');
            await retellAPI.saveSettings(currentWorkspace.id, {
                retellAutoCallEnabled,
                retellAutoCallSchedule: retellSchedule,
                retellAgentId,
            });
            setRetellSaved(true);
            setTimeout(() => setRetellSaved(false), 2000);
        } catch (err) { console.error(err); }
        finally { setRetellSaving(false); }
    };

    const handleRefreshAgents = async () => {
        if (loadingAgents) return;
        setLoadingAgents(true);
        try {
            const { retellAPI } = await import('../../services/api');
            const r = await retellAPI.getAgents(currentWorkspace.id);
            setRetellAgents(r.data?.agents || []);
        } catch (err) { console.error(err); }
        finally { setLoadingAgents(false); }
    };

    const apptActiveCount = apptSchedule.filter(s => s.enabled).length;

    return (
        <div className="ws-settings-page">
            <div className="ws-settings-header">
                <div className="ws-settings-breadcrumb">
                    <span>Genel</span>
                    <ChevronRight size={14} />
                    <span className="ws-settings-breadcrumb-active">Ayarlar</span>
                </div>
                <h1 className="ws-settings-title">
                    <Settings2 size={22} />
                    Workspace Ayarları
                </h1>
                <p className="ws-settings-subtitle">
                    Bu workspace'e ait modül ve özellik ayarlarını buradan yönetin.
                </p>
            </div>

            <div className="ws-settings-body">
                <section className="ws-settings-section">
                    <div className="ws-settings-section-header">
                        <h2 className="ws-settings-section-title">Modül Yönetimi</h2>
                        <p className="ws-settings-section-desc">Workspace'inizde hangi modüllerin aktif olacağını seçin.</p>
                    </div>

                    <div className="ws-settings-cards">

                        {/* ── Rezervasyon Kartı ── */}
                        <div className={`ws-settings-card ${appointmentEnabled ? 'card-on' : 'card-off'}`}>
                            <div className="ws-settings-card-left">
                                <div className={`ws-settings-card-icon ${appointmentEnabled ? 'icon-on' : 'icon-off'}`}>
                                    <CalendarCheck size={22} />
                                </div>
                                <div className="ws-settings-card-info">
                                    <div className="ws-settings-card-name">Rezervasyon Modülü</div>
                                    <div className="ws-settings-card-desc">
                                        {appointmentEnabled
                                            ? `Aktif — AI asistan randevu alıp verebilir · ${apptActiveCount} gün`
                                            : 'Pasif — AI asistan randevu işlemi yapmaz'}
                                    </div>
                                </div>
                            </div>
                            <div className="ws-card-actions">
                                <button
                                    className={`ws-schedule-btn ${showApptSchedule ? 'schedule-btn-active' : ''}`}
                                    onClick={() => setShowApptSchedule(v => !v)}
                                >
                                    <Clock size={15} />
                                    Saatler
                                    <ChevronDown size={13} className={`ws-chevron ${showApptSchedule ? 'open' : ''}`} />
                                </button>
                                <button
                                    className={`ws-toggle-btn ${appointmentEnabled ? 'toggle-on' : 'toggle-off'}`}
                                    onClick={handleToggleAppointment}
                                    disabled={apptToggleSaving}
                                >
                                    {apptToggleSaving
                                        ? <span className="ws-toggle-spinner" />
                                        : appointmentEnabled
                                        ? <><ToggleRight size={20} /> Aktif</>
                                        : <><ToggleLeft size={20} /> Pasif</>}
                                </button>
                            </div>
                        </div>

                        {showApptSchedule && (
                            <ApptSchedulePanel
                                schedule={apptSchedule}
                                setSchedule={setApptSchedule}
                                saving={apptSaving}
                                saved={apptSaved}
                                onSave={handleApptScheduleSave}
                            />
                        )}

                        {/* ── Retell Kartı ── */}
                        <div className={`ws-settings-card ${retellConfigured ? 'card-on card-on-blue' : 'card-off'}`}>
                            <div className="ws-settings-card-left">
                                <div className={`ws-settings-card-icon ${retellConfigured ? 'icon-on icon-blue' : 'icon-off'}`}>
                                    <Phone size={22} />
                                </div>
                                <div className="ws-settings-card-info">
                                    <div className="ws-settings-card-name">Retell AI Sesli Arama</div>
                                    <div className="ws-settings-card-desc">
                                        {retellConfigured
                                            ? retellAutoCallEnabled
                                                ? `Otomatik arama aktif · ${(retellSchedule.days || []).length} gün · ${retellSchedule.start}–${retellSchedule.end}`
                                                : 'Yapılandırıldı — Otomatik arama kapalı'
                                            : 'Yapılandırılmadı — AI Call bağlantısı kurulmamış'}
                                    </div>
                                </div>
                            </div>
                            <div className="ws-card-actions">
                                {retellConfigured && (
                                    <button
                                        className={`ws-schedule-btn ${showRetellSchedule ? 'schedule-btn-active schedule-btn-blue' : ''}`}
                                        onClick={() => setShowRetellSchedule(v => !v)}
                                    >
                                        <Clock size={15} />
                                        Arama Saatleri
                                        <ChevronDown size={13} className={`ws-chevron ${showRetellSchedule ? 'open' : ''}`} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {showRetellSchedule && retellConfigured && (
                            <RetellSchedulePanel
                                schedule={retellSchedule}
                                setSchedule={setRetellSchedule}
                                autoCallEnabled={retellAutoCallEnabled}
                                setAutoCallEnabled={setRetellAutoCallEnabled}
                                agents={retellAgents}
                                agentId={retellAgentId}
                                setAgentId={setRetellAgentId}
                                loadingAgents={loadingAgents}
                                onRefreshAgents={handleRefreshAgents}
                                saving={retellSaving}
                                saved={retellSaved}
                                onSave={handleRetellScheduleSave}
                            />
                        )}

                        {/* ══ Gayrimenkul Kartı ══ */}
                        <div className={`ws-settings-card ${realEstateEnabled ? 'card-on card-on-orange' : 'card-off'}`}>
                            <div className="ws-settings-card-left">
                                <div className={`ws-settings-card-icon ${realEstateEnabled ? 'icon-on icon-orange' : 'icon-off'}`}>
                                    <Building2 size={22} />
                                </div>
                                <div className="ws-settings-card-info">
                                    <div className="ws-settings-card-name">Gayrimenkul Modülü</div>
                                    <div className="ws-settings-card-desc">
                                        {realEstateEnabled
                                            ? 'Aktif — Portföy, teklif ve kampanya yönetimi açık'
                                            : 'Pasif — Gayrimenkul menülüller gizli'}
                                    </div>
                                </div>
                            </div>
                            <div className="ws-card-actions">
                                <button
                                    className={`ws-toggle-btn ${realEstateEnabled ? 'toggle-on' : 'toggle-off'}`}
                                    disabled={realEstateSaving}
                                    onClick={async () => {
                                        if (realEstateSaving) return;
                                        const newVal = !realEstateEnabled;
                                        setRealEstateSaving(true);
                                        try {
                                            const { default: api } = await import('../../services/api');
                                            await api.patch(`/workspaces/${currentWorkspace.id}/realestate-module`, { enabled: newVal });
                                            setRealEstateEnabled(newVal);
                                        } catch (err) { console.error(err); }
                                        finally { setRealEstateSaving(false); }
                                    }}
                                >
                                    {realEstateSaving
                                        ? <span className="ws-toggle-spinner" />
                                        : realEstateEnabled
                                        ? <><ToggleRight size={20} /> Aktif</>
                                        : <><ToggleLeft size={20} /> Pasif</>}
                                </button>
                            </div>
                        </div>

                        {/* ══ Satış Kartı ══ */}
                        <div className={`ws-settings-card ${salesEnabled ? 'card-on card-on-purple' : 'card-off'}`}>
                            <div className="ws-settings-card-left">
                                <div className={`ws-settings-card-icon ${salesEnabled ? 'icon-on icon-purple' : 'icon-off'}`}>
                                    <ShoppingCart size={22} />
                                </div>
                                <div className="ws-settings-card-info">
                                    <div className="ws-settings-card-name">Satış Modülü</div>
                                    <div className="ws-settings-card-desc">
                                        {salesEnabled
                                            ? 'Aktif — Teklifler, siparifler, faturalar ve ürün yönetimi açık'
                                            : 'Pasif — Satış menülüller gizli'}
                                    </div>
                                </div>
                            </div>
                            <div className="ws-card-actions">
                                <button
                                    className={`ws-toggle-btn ${salesEnabled ? 'toggle-on' : 'toggle-off'}`}
                                    disabled={salesSaving}
                                    onClick={async () => {
                                        if (salesSaving) return;
                                        const newVal = !salesEnabled;
                                        setSalesSaving(true);
                                        try {
                                            const { default: api } = await import('../../services/api');
                                            await api.patch(`/workspaces/${currentWorkspace.id}/sales-module`, { enabled: newVal });
                                            setSalesEnabled(newVal);
                                        } catch (err) { console.error(err); }
                                        finally { setSalesSaving(false); }
                                    }}
                                >
                                    {salesSaving
                                        ? <span className="ws-toggle-spinner" />
                                        : salesEnabled
                                        ? <><ToggleRight size={20} /> Aktif</>
                                        : <><ToggleLeft size={20} /> Pasif</>}
                                </button>
                            </div>
                        </div>

                    </div>

                    {apptToggleSaved && (
                        <div className="ws-settings-saved-toast">✓ Modül durumu güncellendi</div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default WorkspaceSettings;
