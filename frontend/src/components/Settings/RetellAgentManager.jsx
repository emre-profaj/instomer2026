import React, { useState, useEffect, useCallback, useRef } from 'react';
import api, { retellAPI } from '../../services/api';
import {
    Bot, Save, Loader, RefreshCw, CheckCircle, AlertCircle,
    ChevronDown, ChevronRight, BookOpen, Zap, Settings, Link,
    Play, Pause, Volume2, PhoneCall, Clock
} from 'lucide-react';

const API_BASE = '/api';

// ─── Agent Yönetimi Sekmesi ─────────────────────────────────────────────────
export function RetellAgentManager({ workspaceId, initialAgentId }) {
    const [agents, setAgents] = useState([]);
    const [wsSettings, setWsSettings] = useState(null);
    const DEFAULT_SCHEDULE = {
        1: { active: true, start: '10:00', end: '18:00' },
        2: { active: true, start: '10:00', end: '18:00' },
        3: { active: true, start: '10:00', end: '18:00' },
        4: { active: true, start: '10:00', end: '18:00' },
        5: { active: true, start: '10:00', end: '18:00' },
        6: { active: true, start: '11:00', end: '16:00' },
        0: { active: false, start: '10:00', end: '18:00' }
    };
    const DAY_NAMES = { 1: 'Pazartesi', 2: 'Salı', 3: 'Çarşamba', 4: 'Perşembe', 5: 'Cuma', 6: 'Cumartesi', 0: 'Pazar' };
    const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
    const TASK_SCOPE_OPTIONS = [
        { value: 'all', label: 'Tüm gecikmiş arama görevleri' },
        { value: 'team_all', label: 'Kendi takımındaki tüm görevler' },
        { value: 'team_pool', label: 'Sadece kendi takımındaki havuz görevleri' },
        { value: 'assigned_only', label: 'Sadece kendine atananlar' }
    ];
    const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
    const [agentConfig, setAgentConfig] = useState({
        schedule: { ...DEFAULT_SCHEDULE },
        taskScope: 'all',
        fallbackDelayMinutes: 0,
        maxOverdueDays: 7,
        retrySteps: [{ delay: 60 }, { delay: 240 }, { delay: 1440 }]
    });
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [agentDetail, setAgentDetail] = useState(null);
    const [llmDetail, setLlmDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    // Editable fields
    const [prompt, setPrompt] = useState('');
    const [beginMsg, setBeginMsg] = useState('');
    const [agentName, setAgentName] = useState('');

    // Voice selection
    const [voices, setVoices] = useState([]);
    const [voiceId, setVoiceId] = useState('');
    const [voicesLoading, setVoicesLoading] = useState(false);
    const [playingVoiceId, setPlayingVoiceId] = useState(null);
    const audioRef = useRef(null);

    // Language selection
    const [language, setLanguage] = useState('tr-TR');

    // Behavior settings
    const [showBehavior, setShowBehavior] = useState(false);
    const [responsiveness, setResponsiveness] = useState(0.5);
    const [interruptionSensitivity, setInterruptionSensitivity] = useState(0.5);
    const [enableBackchannel, setEnableBackchannel] = useState(false);
    const [ambientSound, setAmbientSound] = useState('');
    const [endCallAfterSilenceMs, setEndCallAfterSilenceMs] = useState('');
    const [boostedKeywords, setBoostedKeywords] = useState('');

    // Overdue calls push
    const [overdueList, setOverdueList] = useState([]);
    const [overdueLoading, setOverdueLoading] = useState(false);
    const [pushingCalls, setPushingCalls] = useState(false);
    const [pushResult, setPushResult] = useState(null);
    const [selectedOverdueIds, setSelectedOverdueIds] = useState(new Set());
    const [showOverduePanel, setShowOverduePanel] = useState(false);
    const [overdueTeamFilter, setOverdueTeamFilter] = useState('');
    const [teams, setTeams] = useState([]);

    const isConvFlow = agentDetail?.response_engine?.type !== 'retell-llm';

    const LANGUAGE_OPTIONS = [
        { value: 'tr-TR', label: 'Türkçe' },
        { value: 'en-US', label: 'İngilizce (ABD)' },
        { value: 'en-GB', label: 'İngilizce (İngiltere)' },
        { value: 'de-DE', label: 'Almanca' },
        { value: 'fr-FR', label: 'Fransızca' },
        { value: 'ar-SA', label: 'Arapça' },
        { value: 'multi', label: 'Çok Dilli' }
    ];

    const AMBIENT_SOUND_OPTIONS = [
        { value: '', label: 'Yok' },
        { value: 'coffee-shop', label: '☕ Kafe' },
        { value: 'convention-hall', label: '🏛️ Konferans Salonu' },
        { value: 'summer-outdoor', label: '🌿 Yaz Dış Mekan' },
        { value: 'call-center', label: '📞 Çağrı Merkezi' }
    ];

    useEffect(() => {
        if (workspaceId) {
            fetchAgents();
            fetchVoices();
        }
    }, [workspaceId]);

    // Load agent config when agent or settings change — backward compatible
    useEffect(() => {
        if (selectedAgentId && wsSettings?.retellAutoCallTriggers?.agentConfigs) {
            const ac = wsSettings.retellAutoCallTriggers.agentConfigs[selectedAgentId];
            if (ac) {
                // Schedule: yeni format varsa kullan, yoksa eskiden dönüştür
                let schedule = ac.schedule;
                if (!schedule) {
                    const oldStart = `${(ac.businessHourStart ?? 10).toString().padStart(2, '0')}:00`;
                    const oldEnd = `${(ac.businessHourEnd ?? 21).toString().padStart(2, '0')}:00`;
                    const oldDays = ac.days || [0,1,2,3,4,5,6];
                    schedule = {};
                    DAY_ORDER.forEach(d => {
                        schedule[d] = { active: oldDays.includes(d), start: ac.callStart || oldStart, end: ac.callEnd || oldEnd };
                    });
                }
                // taskScope: yeni field varsa kullan, yoksa flag'lerden çıkar
                let taskScope = ac.taskScope;
                if (!taskScope) {
                    if (ac.handlePool && ac.handleUnassigned && ac.handleTeamFallback) taskScope = 'all';
                    else if (ac.handlePool && ac.handleTeamFallback) taskScope = 'team_all';
                    else if (ac.handlePool) taskScope = 'team_pool';
                    else taskScope = 'assigned_only';
                }
                setAgentConfig({
                    schedule: { ...DEFAULT_SCHEDULE, ...schedule },
                    taskScope,
                    fallbackDelayMinutes: ac.fallbackDelayMinutes ?? 0,
                    maxOverdueDays: ac.maxOverdueDays ?? 7,
                    retrySteps: ac.retrySteps || [{ delay: 60 }, { delay: 240 }, { delay: 1440 }]
                });
            }
        }
    }, [selectedAgentId, wsSettings]);

    // Fetch overdue call list for this workspace
    const fetchOverdueList = useCallback(async () => {
        if (!workspaceId) return;
        setOverdueLoading(true);
        try {
            const now = new Date().toISOString().slice(0, 10);
            const params = { type: 'CALL', status: 'PLANNED', dateTo: now, limit: 100 };
            if (overdueTeamFilter) params.teamId = overdueTeamFilter;
            const res = await api.get(`/activities/workspace/${workspaceId}/list`, { params });
            const list = res.data?.activities || [];
            setOverdueList(list);
            setSelectedOverdueIds(new Set()); // reset selection
        } catch (e) {
            console.error('Overdue list fetch error:', e);
            setOverdueList([]);
        } finally {
            setOverdueLoading(false);
        }
    }, [workspaceId, overdueTeamFilter]);

    // Fetch teams for filter
    const fetchTeams = useCallback(async () => {
        if (!workspaceId) return;
        try {
            const res = await api.get(`/teams/${workspaceId}`);
            setTeams(res.data?.teams || res.data || []);
        } catch (e) { console.error('Teams fetch error:', e); }
    }, [workspaceId]);

    useEffect(() => {
        if (selectedAgentId) {
            fetchOverdueList();
            fetchTeams();
        }
    }, [selectedAgentId, fetchOverdueList, fetchTeams]);

    const toggleOverdueSelect = (id) => {
        setSelectedOverdueIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedOverdueIds.size === overdueList.length) {
            setSelectedOverdueIds(new Set());
        } else {
            setSelectedOverdueIds(new Set(overdueList.map(a => a.id)));
        }
    };

    const handlePushCalls = async (mode = 'call') => {
        if (!selectedAgentId || selectedOverdueIds.size === 0) return;
        const count = selectedOverdueIds.size;
        if (!confirm(`${count} görev ${mode === 'call' ? 'hemen aranacak' : 'agent\'a atanacak'}. Devam?`)) return;
        setPushingCalls(true);
        setPushResult(null);
        try {
            const res = await retellAPI.pushCallTasks(workspaceId, {
                agentId: selectedAgentId,
                activityIds: [...selectedOverdueIds],
                mode,
                limit: count
            });
            setPushResult(res.data);
            fetchOverdueList(); // Refresh list
        } catch (err) {
            setPushResult({ error: err.response?.data?.error || err.message });
        } finally {
            setPushingCalls(false);
        }
    };

    const fetchAgents = async () => {
        try {
            const resSettings = await api.get(`/retell/${workspaceId}/settings`);
            setWsSettings(resSettings.data);
        } catch (e) {
            console.error('Settings fetch error', e);
        }

        try {
            const res = await api.get(`/retell/${workspaceId}/agents`);
            setAgents(res.data.agents || []);
            if (initialAgentId) {
                selectAgent(initialAgentId);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchVoices = async () => {
        setVoicesLoading(true);
        try {
            const res = await api.get(`/retell/${workspaceId}/voices`);
            setVoices(res.data.voices || res.data || []);
        } catch (e) {
            console.error('Error fetching voices:', e);
            setVoices([]);
        } finally {
            setVoicesLoading(false);
        }
    };

    const selectAgent = async (agentId) => {
        if (!agentId) { setAgentDetail(null); setLlmDetail(null); return; }
        setSelectedAgentId(agentId);
        setLoading(true);
        setMessage(null);
        try {
            const res = await api.get(`/retell/${workspaceId}/agents/${agentId}`);
            const agent = res.data.agent;
            setAgentDetail(agent);
            setLlmDetail(res.data.llm);
            setAgentName(agent?.agent_name || '');
            setPrompt(res.data.llm?.general_prompt || '');
            setBeginMsg(res.data.llm?.begin_message || '');
            // Voice & language
            setVoiceId(agent?.voice_id || '');
            setLanguage(agent?.language || 'tr-TR');
            // Behavior
            setResponsiveness(agent?.responsiveness ?? 0.5);
            setInterruptionSensitivity(agent?.interruption_sensitivity ?? 0.5);
            setEnableBackchannel(agent?.enable_backchannel ?? false);
            setAmbientSound(agent?.ambient_sound || '');
            setEndCallAfterSilenceMs(agent?.end_call_after_silence_ms || '');
            setBoostedKeywords((agent?.boosted_keywords || []).join(', '));
        } catch (e) {
            setMessage({ type: 'error', text: 'Agent bilgisi alınamadı: ' + (e.response?.data?.error || e.message) });
        } finally {
            setLoading(false);
        }
    };

    const handlePlayVoice = (voice) => {
        const url = voice.preview_audio_url;
        if (!url) return;

        if (playingVoiceId === voice.voice_id) {
            // Stop
            if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
            setPlayingVoiceId(null);
            return;
        }
        // Stop previous
        if (audioRef.current) { audioRef.current.pause(); }
        const audio = new Audio(url);
        audioRef.current = audio;
        setPlayingVoiceId(voice.voice_id);
        audio.play().catch(() => {});
        audio.onended = () => { setPlayingVoiceId(null); audioRef.current = null; };
    };

    // Group voices: Turkish first, then English, then Other
    const groupedVoices = () => {
        const turkish = [];
        const english = [];
        const other = [];
        voices.forEach(v => {
            const lang = (v.language || v.accent || '').toLowerCase();
            if (lang.includes('tr') || lang.includes('turk')) {
                turkish.push(v);
            } else if (lang.includes('en') || lang.includes('eng')) {
                english.push(v);
            } else {
                other.push(v);
            }
        });
        return { turkish, english, other };
    };

    const handleSave = async () => {
        if (!selectedAgentId) return;
        setSaving(true);
        setMessage(null);
        try {
            const payload = { agentName };
            if (!isConvFlow) {
                payload.generalPrompt = prompt;
                payload.beginMessage = beginMsg;
            }
            // Voice & language
            payload.voiceId = voiceId;
            payload.language = language;
            // Behavior
            payload.responsiveness = responsiveness;
            payload.interruptionSensitivity = interruptionSensitivity;
            payload.enableBackchannel = enableBackchannel;
            payload.ambientSound = ambientSound;
            payload.endCallAfterSilenceMs = endCallAfterSilenceMs ? Number(endCallAfterSilenceMs) : undefined;
            payload.boostedKeywords = boostedKeywords ? boostedKeywords.split(',').map(k => k.trim()).filter(Boolean) : undefined;

            await api.patch(`/retell/${workspaceId}/agents/${selectedAgentId}/prompt`, payload);
            
            // Workspace Settings'e Agent konfigürasyonunu kaydet (yeni + geriye uyumlu field'lar)
            if (wsSettings) {
                const triggers = wsSettings.retellAutoCallTriggers || {};
                const agentConfigs = triggers.agentConfigs || {};
                
                // taskScope → eski flag'lere dönüştür
                const scopeToFlags = {
                    'all':           { handlePool: true,  handleUnassigned: true,  handleTeamFallback: true },
                    'team_all':      { handlePool: true,  handleUnassigned: false, handleTeamFallback: true },
                    'team_pool':     { handlePool: true,  handleUnassigned: false, handleTeamFallback: false },
                    'assigned_only': { handlePool: false, handleUnassigned: false, handleTeamFallback: false }
                };
                const flags = scopeToFlags[agentConfig.taskScope] || scopeToFlags['all'];
                
                // schedule → eski days/callStart/callEnd dönüştür
                const days = Object.entries(agentConfig.schedule).filter(([,v]) => v.active).map(([k]) => Number(k));
                const activeSchedules = Object.values(agentConfig.schedule).filter(v => v.active);
                const callStart = activeSchedules.length > 0 ? activeSchedules.reduce((min, s) => s.start < min ? s.start : min, '23:59') : '10:00';
                const callEnd = activeSchedules.length > 0 ? activeSchedules.reduce((max, s) => s.end > max ? s.end : max, '00:00') : '18:00';
                
                agentConfigs[selectedAgentId] = {
                    ...agentConfig,
                    ...flags,
                    fallbackToAi: true,
                    days,
                    callStart,
                    callEnd,
                    businessHourStart: parseInt(callStart),
                    businessHourEnd: parseInt(callEnd),
                    active: days.length > 0
                };
                
                await api.put(`/retell/${workspaceId}/settings`, {
                    retellAutoCallTriggers: { ...triggers, agentConfigs }
                });
                
                setWsSettings(prev => ({
                    ...prev,
                    retellAutoCallTriggers: { ...triggers, agentConfigs }
                }));
            }
            
            setMessage({ type: 'success', text: '✅ Agent ve arama kuralları başarıyla kaydedildi!' });
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Kayıt başarısız' });
        } finally {
            setSaving(false);
        }
    };

    // Slider component
    const SliderField = ({ label, value, onChange, min = 0, max = 1, step = 0.1, hint }) => (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>{label}</label>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '1px 8px', borderRadius: 6 }}>{value}</span>
            </div>
            <input
                type="range"
                min={min} max={max} step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1' }}
            />
            {hint && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>{hint}</div>}
        </div>
    );

    return (
        <div>
            {/* Agent Seçici — initialAgentId varsa gösterme, zaten seçili */}
            {!initialAgentId && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                <select
                    value={selectedAgentId}
                    onChange={e => selectAgent(e.target.value)}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', background: '#fff' }}
                >
                    <option value="">— Agent Seçin —</option>
                    {agents.map(a => (
                        <option key={a.agent_id} value={a.agent_id}>
                            {a.agent_name || a.agent_id}
                        </option>
                    ))}
                </select>
                <button
                    onClick={fetchAgents}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: '#6b7280', fontSize: '0.82rem' }}
                >
                    <RefreshCw size={14} /> Yenile
                </button>
            </div>
            )}

            {loading && (
                <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
                    <Loader size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                    <p style={{ margin: 0 }}>Agent bilgisi yükleniyor...</p>
                </div>
            )}

            {message && (
                <div style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem',
                    background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
                    color: message.type === 'success' ? '#065f46' : '#991b1b',
                    border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`
                }}>
                    {message.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {message.text}
                </div>
            )}

            {agentDetail && !loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Agent meta bilgisi */}
                    <div style={{ background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent ID</div>
                            <code style={{ fontSize: '0.8rem', color: '#374151' }}>{agentDetail.agent_id}</code>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tip</div>
                            <span style={{
                                fontSize: '0.78rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                                background: isConvFlow ? '#fef9c3' : '#ecfdf5',
                                color: isConvFlow ? '#854d0e' : '#065f46'
                            }}>
                                {isConvFlow ? 'Conversation Flow' : 'AI LLM'}
                            </span>
                        </div>
                        {agentDetail.voice_id && (
                            <div>
                                <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ses</div>
                                <span style={{ fontSize: '0.82rem', color: '#374151' }}>{agentDetail.voice_id}</span>
                            </div>
                        )}
                        {agentDetail.knowledge_base_ids?.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bağlı KB</div>
                                <span style={{ fontSize: '0.78rem', background: '#ede9fe', color: '#5b21b6', padding: '2px 8px', borderRadius: 6 }}>
                                    {agentDetail.knowledge_base_ids.length} adet
                                </span>
                            </div>
                        )}
                    </div>

                    {/* ─── AI Arama Kuralları ─────────────────────── */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px', marginTop: '16px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '15px' }}>🤖</span>
                            AI Arama Kuralları
                        </div>

                        {/* ── 0. Çalışma Programı ────────────────── */}
                        <div style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                📅 Çalışma Programı
                            </div>
                            <div style={{ border: '1px solid #f3f4f6', borderRadius: 8, overflow: 'hidden' }}>
                                {DAY_ORDER.map((dayKey, idx) => {
                                    const day = agentConfig.schedule?.[dayKey] || { active: false, start: '10:00', end: '18:00' };
                                    return (
                                        <div key={dayKey} style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                            background: idx % 2 === 0 ? '#fafbfc' : '#fff',
                                            borderBottom: idx < 6 ? '1px solid #f3f4f6' : 'none',
                                            opacity: day.active ? 1 : 0.5
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={day.active}
                                                onChange={e => {
                                                    const newSchedule = { ...agentConfig.schedule };
                                                    newSchedule[dayKey] = { ...newSchedule[dayKey], active: e.target.checked };
                                                    setAgentConfig({ ...agentConfig, schedule: newSchedule });
                                                }}
                                                style={{ width: 15, height: 15, accentColor: '#2563eb' }}
                                            />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', minWidth: 80 }}>
                                                {DAY_NAMES[dayKey]}
                                            </span>
                                            {day.active ? (
                                                <>
                                                    <select
                                                        value={day.start}
                                                        onChange={e => {
                                                            const newSchedule = { ...agentConfig.schedule };
                                                            newSchedule[dayKey] = { ...newSchedule[dayKey], start: e.target.value };
                                                            setAgentConfig({ ...agentConfig, schedule: newSchedule });
                                                        }}
                                                        style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.8rem' }}
                                                    >
                                                        {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                    <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>—</span>
                                                    <select
                                                        value={day.end}
                                                        onChange={e => {
                                                            const newSchedule = { ...agentConfig.schedule };
                                                            newSchedule[dayKey] = { ...newSchedule[dayKey], end: e.target.value };
                                                            setAgentConfig({ ...agentConfig, schedule: newSchedule });
                                                        }}
                                                        style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: '0.8rem' }}
                                                    >
                                                        {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </>
                                            ) : (
                                                <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic' }}>Kapalı</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── 1. Görev Devralma Kapsamı ──────────── */}
                        <div style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                🎯 Görev Devralma Kapsamı
                            </div>
                            <select
                                value={agentConfig.taskScope}
                                onChange={e => setAgentConfig({ ...agentConfig, taskScope: e.target.value })}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.84rem', background: '#fff' }}
                            >
                                {TASK_SCOPE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
                                {agentConfig.taskScope === 'all' && `Tüm workspace'teki gecikmiş arama görevlerini devralır`}
                                {agentConfig.taskScope === 'team_all' && `Sadece atandığı takımdaki tüm arama görevlerini devralır`}
                                {agentConfig.taskScope === 'team_pool' && `Sadece takımındaki sahipsiz havuz görevlerini devralır`}
                                {agentConfig.taskScope === 'assigned_only' && `Yalnızca doğrudan kendisine atanmış görevleri yapar`}
                            </div>
                        </div>

                        {/* ── 2. Gecikme & Yaş Sınırı (tek satır) ──────── */}
                        <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <select
                                value={agentConfig.fallbackDelayMinutes}
                                onChange={e => setAgentConfig({ ...agentConfig, fallbackDelayMinutes: parseInt(e.target.value) })}
                                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.84rem', fontWeight: 600 }}
                            >
                                <option value={0}>hemen</option>
                                <option value={5}>5 dk</option>
                                <option value={10}>10 dk</option>
                                <option value={15}>15 dk</option>
                                <option value={30}>30 dk</option>
                                <option value={60}>1 saat</option>
                                <option value={120}>2 saat</option>
                                <option value={240}>4 saat</option>
                                <option value={480}>8 saat</option>
                                <option value={720}>12 saat</option>
                                <option value={1440}>1 gün</option>
                                <option value={2880}>2 gün</option>
                                <option value={4320}>3 gün</option>
                            </select>
                            <span style={{ fontSize: '0.82rem', color: '#374151' }}>gecikme ile</span>
                            <select
                                value={agentConfig.maxOverdueDays}
                                onChange={e => setAgentConfig({ ...agentConfig, maxOverdueDays: parseInt(e.target.value) })}
                                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.84rem', fontWeight: 600 }}
                            >
                                <option value={1}>1 gün</option>
                                <option value={3}>3 gün</option>
                                <option value={7}>7 gün</option>
                                <option value={14}>14 gün</option>
                                <option value={21}>21 gün</option>
                                <option value={30}>30 gün</option>
                            </select>
                            <span style={{ fontSize: '0.82rem', color: '#374151' }}>arası gecikmiş görevleri arasın</span>
                        </div>

                        {/* ── 4. Tekrar Arama Kademesi ────────────── */}
                        <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                🔄 Ulaşılamazsa Tekrar Arama
                            </div>
                            {(agentConfig.retrySteps || []).map((step, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <span style={{ fontSize: '0.8rem', color: '#6b7280', minWidth: 24, fontWeight: 600 }}>{idx + 1}.</span>
                                    <select
                                        value={step.delay}
                                        onChange={e => {
                                            const newSteps = [...agentConfig.retrySteps];
                                            newSteps[idx] = { delay: parseInt(e.target.value) };
                                            setAgentConfig({ ...agentConfig, retrySteps: newSteps });
                                        }}
                                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.82rem' }}
                                    >
                                        <option value={5}>5 dk sonra</option>
                                        <option value={10}>10 dk sonra</option>
                                        <option value={15}>15 dk sonra</option>
                                        <option value={30}>30 dk sonra</option>
                                        <option value={60}>1 saat sonra</option>
                                        <option value={120}>2 saat sonra</option>
                                        <option value={240}>4 saat sonra</option>
                                        <option value={480}>8 saat sonra</option>
                                        <option value={1440}>1 gün sonra</option>
                                        <option value={2880}>2 gün sonra</option>
                                    </select>
                                    {agentConfig.retrySteps.length > 1 && (
                                        <button
                                            onClick={() => {
                                                const newSteps = agentConfig.retrySteps.filter((_, i) => i !== idx);
                                                setAgentConfig({ ...agentConfig, retrySteps: newSteps });
                                            }}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 6px' }}
                                            title="Kaldır"
                                        >✕</button>
                                    )}
                                </div>
                            ))}
                            {(agentConfig.retrySteps || []).length < 5 && (
                                <button
                                    onClick={() => {
                                        const newSteps = [...(agentConfig.retrySteps || []), { delay: 1440 }];
                                        setAgentConfig({ ...agentConfig, retrySteps: newSteps });
                                    }}
                                    style={{
                                        background: 'none', border: '1px dashed #d1d5db', borderRadius: 6,
                                        padding: '4px 12px', fontSize: '0.78rem', color: '#6b7280', cursor: 'pointer', marginTop: 2
                                    }}
                                >+ Kademe Ekle</button>
                            )}
                            <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 6 }}>
                                Tüm kademeler tükenirse arama iptal edilir
                            </div>
                        </div>
                    </div>

                    {/* ─── Gecikmiş Aramaları Başlat ─────────────────────── */}
                    <div style={{ border: '1px solid #fde68a', borderRadius: 10, marginTop: 16, marginBottom: 16, background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', overflow: 'hidden' }}>
                        {/* Header — click to expand */}
                        <button
                            onClick={() => setShowOverduePanel(p => !p)}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left'
                            }}
                        >
                            <PhoneCall size={16} style={{ color: '#92400e' }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#92400e', flex: 1 }}>
                                Gecikmiş Aramalar
                                {overdueList.length > 0 && (
                                    <span style={{
                                        marginLeft: 8, background: '#dc2626', color: '#fff', borderRadius: 10,
                                        padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700
                                    }}>
                                        {overdueList.length}
                                    </span>
                                )}
                            </span>
                            {showOverduePanel ? <ChevronDown size={16} style={{ color: '#92400e' }} /> : <ChevronRight size={16} style={{ color: '#92400e' }} />}
                        </button>

                        {showOverduePanel && (
                            <div style={{ padding: '0 16px 16px' }}>
                                {/* Filters row */}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                                    <select
                                        value={overdueTeamFilter}
                                        onChange={e => { setOverdueTeamFilter(e.target.value); }}
                                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.78rem', background: '#fff' }}
                                    >
                                        <option value="">Tüm Takımlar</option>
                                        {teams.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={fetchOverdueList}
                                        disabled={overdueLoading}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.78rem', cursor: 'pointer', color: '#374151' }}
                                    >
                                        <RefreshCw size={12} className={overdueLoading ? 'spin' : ''} />
                                        Yenile
                                    </button>
                                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 'auto' }}>
                                        {selectedOverdueIds.size > 0 && `${selectedOverdueIds.size} seçili`}
                                    </span>
                                </div>

                                {/* List */}
                                {overdueLoading ? (
                                    <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>
                                        <Loader size={16} className="spin" /> Yükleniyor...
                                    </div>
                                ) : overdueList.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 20, color: '#059669', fontSize: '0.82rem' }}>
                                        ✅ Gecikmiş arama görevi yok
                                    </div>
                                ) : (
                                    <>
                                        {/* Select all header */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                                            background: '#fff', borderRadius: '8px 8px 0 0', border: '1px solid #fde68a', borderBottom: 'none',
                                            fontSize: '0.72rem', color: '#6b7280', fontWeight: 600
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedOverdueIds.size === overdueList.length && overdueList.length > 0}
                                                onChange={toggleSelectAll}
                                                style={{ accentColor: '#d97706' }}
                                            />
                                            <span style={{ flex: 2 }}>Kişi</span>
                                            <span style={{ flex: 1 }}>Telefon</span>
                                            <span style={{ flex: 1 }}>Vade</span>
                                            <span style={{ flex: 1 }}>Takım</span>
                                        </div>

                                        {/* Scrollable list */}
                                        <div style={{
                                            maxHeight: 260, overflowY: 'auto', border: '1px solid #fde68a',
                                            borderRadius: '0 0 8px 8px', background: '#fff'
                                        }}>
                                            {overdueList.map((act, idx) => {
                                                const isSelected = selectedOverdueIds.has(act.id);
                                                const dueDate = act.dueDate ? new Date(act.dueDate) : null;
                                                const daysOverdue = dueDate ? Math.floor((Date.now() - dueDate.getTime()) / 86400000) : null;
                                                return (
                                                    <div
                                                        key={act.id}
                                                        onClick={() => toggleOverdueSelect(act.id)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            padding: '8px', cursor: 'pointer',
                                                            background: isSelected ? '#fffbeb' : idx % 2 === 0 ? '#fff' : '#fafafa',
                                                            borderBottom: idx < overdueList.length - 1 ? '1px solid #f3f4f6' : 'none',
                                                            transition: 'background 0.15s'
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => {}}
                                                            style={{ accentColor: '#d97706', pointerEvents: 'none' }}
                                                        />
                                                        <span style={{ flex: 2, fontSize: '0.8rem', color: '#111827', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {act.contact?.name || 'İsimsiz'}
                                                        </span>
                                                        <span style={{ flex: 1, fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>
                                                            {act.contact?.phone || '—'}
                                                        </span>
                                                        <span style={{ flex: 1, fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                            {dueDate ? (
                                                                <>
                                                                    <span style={{ color: daysOverdue > 3 ? '#dc2626' : '#d97706' }}>
                                                                        {dueDate.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}
                                                                    </span>
                                                                    {daysOverdue > 0 && (
                                                                        <span style={{
                                                                            fontSize: '0.65rem', background: daysOverdue > 3 ? '#fef2f2' : '#fffbeb',
                                                                            color: daysOverdue > 3 ? '#dc2626' : '#d97706',
                                                                            padding: '0 4px', borderRadius: 4
                                                                        }}>
                                                                            {daysOverdue}g
                                                                        </span>
                                                                    )}
                                                                </>
                                                            ) : '—'}
                                                        </span>
                                                        <span style={{ flex: 1, fontSize: '0.72rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {act.team?.name || '—'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                {/* Action buttons */}
                                {overdueList.length > 0 && (
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                                        <button
                                            onClick={() => handlePushCalls('call')}
                                            disabled={pushingCalls || selectedOverdueIds.size === 0}
                                            style={{
                                                background: pushingCalls ? '#d1d5db' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8,
                                                fontSize: '0.82rem', fontWeight: 700,
                                                cursor: pushingCalls || selectedOverdueIds.size === 0 ? 'not-allowed' : 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                opacity: selectedOverdueIds.size === 0 ? 0.5 : 1
                                            }}
                                        >
                                            {pushingCalls ? <Loader size={14} className="spin" /> : <PhoneCall size={14} />}
                                            Seçilenleri Ara ({selectedOverdueIds.size})
                                        </button>
                                        <button
                                            onClick={() => handlePushCalls('assign')}
                                            disabled={pushingCalls || selectedOverdueIds.size === 0}
                                            style={{
                                                background: pushingCalls ? '#d1d5db' : '#fff',
                                                border: '1px solid #d97706', color: '#92400e', padding: '8px 16px', borderRadius: 8,
                                                fontSize: '0.82rem', fontWeight: 600,
                                                cursor: pushingCalls || selectedOverdueIds.size === 0 ? 'not-allowed' : 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                opacity: selectedOverdueIds.size === 0 ? 0.5 : 1
                                            }}
                                        >
                                            {pushingCalls ? <Loader size={14} className="spin" /> : <Bot size={14} />}
                                            Agent'a Ata ({selectedOverdueIds.size})
                                        </button>
                                    </div>
                                )}

                                {/* Result feedback */}
                                {pushResult && (
                                    <div style={{
                                        marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem',
                                        background: pushResult.error ? '#fef2f2' : '#f0fdf4',
                                        border: `1px solid ${pushResult.error ? '#fecaca' : '#bbf7d0'}`,
                                        color: pushResult.error ? '#991b1b' : '#166534'
                                    }}>
                                        {pushResult.error ? (
                                            <>❌ {pushResult.error}</>
                                        ) : (
                                            <>
                                                ✅ {pushResult.message}
                                                {pushResult.processed > 0 && <> — {pushResult.processed} arandı</>}
                                                {pushResult.skipped > 0 && <>, {pushResult.skipped} atlandı</>}
                                                {pushResult.assigned > 0 && <> — {pushResult.assigned} atandı</>}
                                            </>
                                        )}
                                    </div>
                                )}

                                <div style={{ fontSize: '0.7rem', color: '#b45309', marginTop: 8, fontStyle: 'italic' }}>
                                    💡 "Seçilenleri Ara" anında arama başlatır. "Agent'a Ata" ise cron cycle'da otomatik aranır.
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Agent Adı */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Agent Adı</label>
                        <input
                            value={agentName}
                            onChange={e => setAgentName(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* ─── Ses Seçimi ──────────────────────────────────────────── */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                            <Volume2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                            Ses Seçimi
                        </label>
                        {voicesLoading ? (
                            <div style={{ padding: '8px 0', fontSize: '0.82rem', color: '#9ca3af' }}>
                                <Loader size={14} className="spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                Sesler yükleniyor...
                            </div>
                        ) : voices.length === 0 ? (
                            <div style={{ padding: '10px 14px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.82rem', color: '#92400e' }}>
                                Ses listesi yüklenemedi veya boş.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <select
                                    value={voiceId}
                                    onChange={e => setVoiceId(e.target.value)}
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', background: '#fff' }}
                                >
                                    <option value="">— Ses Seçin —</option>
                                    {(() => {
                                        const { turkish, english, other } = groupedVoices();
                                        return (
                                            <>
                                                {turkish.length > 0 && (
                                                    <optgroup label="🇹🇷 Türkçe">
                                                        {turkish.map(v => (
                                                            <option key={v.voice_id} value={v.voice_id}>
                                                                {v.gender === 'female' ? '♀' : '♂'} {v.voice_name || v.voice_id}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {english.length > 0 && (
                                                    <optgroup label="🇬🇧 English">
                                                        {english.map(v => (
                                                            <option key={v.voice_id} value={v.voice_id}>
                                                                {v.gender === 'female' ? '♀' : '♂'} {v.voice_name || v.voice_id}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {other.length > 0 && (
                                                    <optgroup label="🌍 Diğer">
                                                        {other.map(v => (
                                                            <option key={v.voice_id} value={v.voice_id}>
                                                                {v.gender === 'female' ? '♀' : '♂'} {v.voice_name || v.voice_id}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                            </>
                                        );
                                    })()}
                                </select>
                                {/* Play preview button */}
                                {voiceId && (() => {
                                    const selectedVoice = voices.find(v => v.voice_id === voiceId);
                                    if (!selectedVoice?.preview_audio_url) return null;
                                    return (
                                        <button
                                            onClick={() => handlePlayVoice(selectedVoice)}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                width: 36, height: 36, borderRadius: 8, border: '1px solid #e5e7eb',
                                                background: playingVoiceId === voiceId ? '#eef2ff' : '#fff',
                                                cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s'
                                            }}
                                            title="Sesi Dinle"
                                        >
                                            {playingVoiceId === voiceId
                                                ? <Pause size={14} style={{ color: '#6366f1' }} />
                                                : <Play size={14} style={{ color: '#6366f1' }} />
                                            }
                                        </button>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    {/* ─── Dil Seçimi ──────────────────────────────────────────── */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Dil</label>
                        <select
                            value={language}
                            onChange={e => setLanguage(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', background: '#fff', boxSizing: 'border-box' }}
                        >
                            {LANGUAGE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Prompt Editörü */}
                    {isConvFlow ? (
                        <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', fontSize: '0.82rem', color: '#92400e' }}>
                            ⚠️ Bu agent <strong>Conversation Flow</strong> kullanıyor. Prompt düzenleme desteklenmiyor — sadece Agent Adı değiştirilebilir. Prompt'u Dashboard'dan düzenleyin.
                        </div>
                    ) : (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                                    Açılış Mesajı <span style={{ fontWeight: 400, color: '#9ca3af' }}>(Agent aramayı açtığında ilk söylediği)</span>
                                </label>
                                <input
                                    value={beginMsg}
                                    onChange={e => setBeginMsg(e.target.value)}
                                    placeholder="Merhaba, Özel Sağlık Hastanesi. Size nasıl yardımcı olabilirim?"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                                    Bilgi Bankası Metni <span style={{ fontWeight: 400, color: '#9ca3af' }}>(Agent'ın davranış kuralları ve prompt bilgileri)</span>
                                </label>
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    rows={14}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box', resize: 'vertical' }}
                                    placeholder="Sen Özel Sağlık Hastanesi'nin telefon asistanısın. Görevin..."
                                />
                                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
                                    {prompt.length} karakter — kaydettiğinizde anında aktif olur.
                                </div>
                                {/* Dynamic Variables Guide */}
                                <details style={{ marginTop: 8, fontSize: '0.78rem', color: '#6b7280' }}>
                                    <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#6366f1', userSelect: 'none' }}>
                                        🏷️ Dinamik Değişkenler — Prompt'ta kullanılabilir
                                    </summary>
                                    <div style={{ marginTop: 6, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb', lineHeight: 1.8 }}>
                                        <div style={{ marginBottom: 4, fontWeight: 600, color: '#374151' }}>Arama başlatılırken otomatik doldurulur:</div>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{customer_name}}'}</code> — Müşteri adı<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{interest_topic}}'}</code> — İlgilendiği konu (form/sınıflandırma)<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{company_name}}'}</code> — Şirket/klinik adı<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{customer_email}}'}</code> — Müşteri e-posta<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{customer_tags}}'}</code> — Müşteri etiketleri<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{lead_source}}'}</code> — Lead kaynağı (WhatsApp, Form vb.)<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{form_data}}'}</code> — Form verileri özeti<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{last_customer_message}}'}</code> — Son müşteri mesajı<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{contact_channel}}'}</code> — İletişim kanalı<br/>
                                        <code style={{ background: '#eef2ff', padding: '1px 5px', borderRadius: 4, color: '#4338ca' }}>{'{{classification}}'}</code> — AI sınıflandırma sonucu<br/>
                                        <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#9ca3af' }}>
                                            💡 Örnek: "Merhaba {'{{customer_name}}'}, {'{{interest_topic}}'} hakkında bilgi almak istemiştiniz..."
                                        </div>
                                    </div>
                                </details>
                            </div>
                        </>
                    )}

                    {/* ─── Davranış Ayarları (Expandable) ─────────────────────── */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                        <button
                            onClick={() => setShowBehavior(!showBehavior)}
                            style={{
                                width: '100%', padding: '12px 16px', background: showBehavior ? '#f8faff' : '#f9fafb',
                                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                fontSize: '0.85rem', fontWeight: 600, color: '#374151', transition: 'background 0.15s'
                            }}
                        >
                            <Settings size={15} style={{ color: '#6366f1' }} />
                            Davranış Ayarları
                            {showBehavior ? <ChevronDown size={15} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={15} style={{ marginLeft: 'auto' }} />}
                        </button>

                        {showBehavior && (
                            <div style={{ padding: '16px 16px 8px', borderTop: '1px solid #e5e7eb' }}>

                                {/* Responsiveness */}
                                <SliderField
                                    label="Yanıt Hızı"
                                    value={responsiveness}
                                    onChange={setResponsiveness}
                                    hint="Düşük = daha sabırlı bekler, Yüksek = hızlı yanıt verir"
                                />

                                {/* Interruption Sensitivity */}
                                <SliderField
                                    label="Kesme Hassasiyeti"
                                    value={interruptionSensitivity}
                                    onChange={setInterruptionSensitivity}
                                    hint="Düşük = kolay kesilmez, Yüksek = müşteri sözünü kolayca kesebilir"
                                />

                                {/* Backchannel Toggle */}
                                <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>Ara Onaylama (hmm, evet)</div>
                                        <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Dinlerken küçük onay sesleri çıkarır</div>
                                    </div>
                                    <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={enableBackchannel}
                                            onChange={e => setEnableBackchannel(e.target.checked)}
                                            style={{ opacity: 0, width: 0, height: 0 }}
                                        />
                                        <span style={{
                                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: enableBackchannel ? '#6366f1' : '#d1d5db',
                                            borderRadius: 24, transition: 'all 0.2s'
                                        }}>
                                            <span style={{
                                                position: 'absolute', content: '""', height: 18, width: 18,
                                                left: enableBackchannel ? 22 : 3, bottom: 3,
                                                backgroundColor: 'white', borderRadius: '50%', transition: 'all 0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                                            }} />
                                        </span>
                                    </label>
                                </div>

                                {/* Ambient Sound */}
                                <div style={{ marginBottom: 14 }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Arka Plan Sesi</label>
                                    <select
                                        value={ambientSound}
                                        onChange={e => setAmbientSound(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', background: '#fff', boxSizing: 'border-box' }}
                                    >
                                        {AMBIENT_SOUND_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* End Call After Silence */}
                                <div style={{ marginBottom: 14 }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                                        Sessizlikte Kapat (ms)
                                    </label>
                                    <input
                                        type="number"
                                        value={endCallAfterSilenceMs}
                                        onChange={e => setEndCallAfterSilenceMs(e.target.value)}
                                        placeholder="ör: 30000 (30 saniye)"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>
                                        Belirtilen süre boyunca sessizlik olursa arama otomatik sonlandırılır. Boş bırakırsanız devre dışı kalır.
                                    </div>
                                </div>

                                {/* Boosted Keywords */}
                                <div style={{ marginBottom: 8 }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                                        Vurgulanan Kelimeler
                                    </label>
                                    <input
                                        type="text"
                                        value={boostedKeywords}
                                        onChange={e => setBoostedKeywords(e.target.value)}
                                        placeholder="randevu, doktor, ameliyat, sigorta"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>
                                        Virgülle ayırarak yazın. Bu kelimeler ses tanıma sırasında önceliklendirilir.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>


                    

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px',
                                background: saving ? '#9ca3af' : '#6366f1', color: '#fff', border: 'none',
                                borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
                            {saving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </div>
            )}

            {!agentDetail && !loading && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                    <Bot size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <p style={{ margin: 0 }}>Düzenlemek için bir agent seçin</p>
                </div>
            )}
        </div>
    );
}

// ─── Bilgi Bankası Sync Sekmesi ──────────────────────────────────────────────
export function RetellKnowledgeBaseSync({ workspaceId }) {
    const [retellKbs, setRetellKbs] = useState([]);
    const [syncedKbId, setSyncedKbId] = useState(null);
    const [syncedKbText, setSyncedKbText] = useState('');
    const [agents, setAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);
    const [lastSynced, setLastSynced] = useState(null);

    useEffect(() => {
        if (workspaceId) loadAll();
    }, [workspaceId]);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [retellKbRes, agentRes] = await Promise.all([
                api.get(`/retell/${workspaceId}/knowledge-bases`).catch(() => ({ data: { knowledgeBases: [], syncedKbId: null, syncedKbText: '' } })),
                api.get(`/retell/${workspaceId}/agents`).catch(() => ({ data: { agents: [] } }))
            ]);
            setRetellKbs(retellKbRes.data.knowledgeBases || []);
            setSyncedKbId(retellKbRes.data.syncedKbId);
            setSyncedKbText(retellKbRes.data.syncedKbText || '');
            setAgents(agentRes.data.agents || []);
        } catch (e) {
            console.error('loadAll error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setMessage(null);
        try {
            const res = await api.post(`/retell/${workspaceId}/knowledge-bases/sync`, {
                agentId: selectedAgentId || undefined,
                kbText: syncedKbText
            });
            setSyncedKbId(res.data.knowledgeBaseId);
            setLastSynced(new Date());
            setMessage({
                type: 'success',
                text: 'Bilgi bankası Retell\'e başarıyla kaydedildi'
            });
            loadAll();
        } catch (e) {
            setMessage({ type: 'error', text: e.response?.data?.error || 'Kayıt başarısız' });
        } finally {
            setSyncing(false);
        }
    };

    if (loading) return (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            <Loader size={20} className="spin" /> Yükleniyor...
        </div>
    );

    const syncedKbInfo = retellKbs.find(k => k.knowledge_base_id === syncedKbId);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {message && (
                <div style={{
                    padding: '10px 14px', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem',
                    background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
                    color: message.type === 'success' ? '#065f46' : '#991b1b',
                    border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`
                }}>
                    {message.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {message.text}
                </div>
            )}

            {/* Sync durumu */}
            {syncedKbId && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <CheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534' }}>Bilgi Bankası Bağlı</div>
                        <code style={{ fontSize: '0.78rem', color: '#6b7280' }}>{syncedKbId}</code>
                        {syncedKbInfo && <span style={{ fontSize: '0.78rem', color: '#6b7280', marginLeft: 8 }}>— {syncedKbInfo.knowledge_base_name}</span>}
                        {lastSynced && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>Son senkronizasyon: {lastSynced.toLocaleString('tr-TR')}</div>}
                    </div>
                </div>
            )}

            {/* Metin Editörü */}
            <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BookOpen size={15} style={{ color: '#6366f1' }} />
                    Bilgi Bankası Metni
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 400 }}>— Agent'ın yararlanacağı tüm ek bilgiler</span>
                </div>
                <textarea
                    value={syncedKbText}
                    onChange={e => setSyncedKbText(e.target.value)}
                    rows={12}
                    placeholder="Örn: Özel Sağlık Hastanesi 2005 yılında kurulmuştur. Dahiliye bölümünde Dr. Ali Yılmaz görev yapmaktadır..."
                    style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box', resize: 'vertical' }}
                />
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
                    Kaydettiğinizde bu metin doğrudan Retell üzerindeki bilgi bankasıyla eşitlenir.
                </div>
            </div>

            {/* Agent Seçimi */}
            <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Link size={15} style={{ color: '#6366f1' }} />
                    Hangi Agent'a Bağlansın?
                </div>
                <select
                    value={selectedAgentId}
                    onChange={e => setSelectedAgentId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.87rem', background: '#fff' }}
                >
                    <option value="">— Varsayılan Agent (Genel Ayarlardan) —</option>
                    {agents.map(a => (
                        <option key={a.agent_id} value={a.agent_id}>
                            {a.agent_name || a.agent_id}
                        </option>
                    ))}
                </select>
            </div>

            {/* Sync Butonu */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px',
                        background: syncing ? '#9ca3af' : '#6366f1', color: '#fff', border: 'none',
                        borderRadius: 8, fontSize: '0.9rem', fontWeight: 600,
                        cursor: syncing ? 'not-allowed' : 'pointer'
                    }}
                >
                    {syncing ? <Loader size={16} className="spin" /> : <RefreshCw size={16} />}
                    {syncing ? 'Kaydediliyor...' : `Retell'e Kaydet`}
                </button>
            </div>
        </div>
    );
}
