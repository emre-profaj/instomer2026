import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { retellAPI, facebookAPI, whatsappAPI, emailAPI, formWebhookAPI, webWidgetAPI } from '../../services/api';
import { Phone, Key, Bot, Save, Loader, CheckCircle, AlertCircle, RefreshCw, Clock, Calendar, PhoneCall, Trash2, Plus, Zap, XCircle, BookOpen } from 'lucide-react';
import { RetellAgentManager, RetellKnowledgeBaseSync } from './RetellAgentManager';

const RetellSettings = ({ onSave, hideApiSetup = false }) => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;
    const [activeTab, setActiveTab] = useState(hideApiSetup ? 'agents' : 'general');

    const [settings, setSettings] = useState({
        retellApiKey: '',
        retellAgentId: '',
        retellFromNumber: '',
        retellAutoCallEnabled: false,
        retellAutoCallTriggers: {},
        retellAutoCallDelay: 30,
        retellAutoCallSchedule: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
        // AI Devralma Ayarları
        aiFallbackEnabled: false,
        aiFallbackDelayMinutes: 60,
        aiFallbackPoolEnabled: false
    });
    const [agents, setAgents] = useState([]);
    const [connectedChannels, setConnectedChannels] = useState([]);
    const [rules, setRules] = useState([]); // [{source: 'WHATSAPP', delay: 30, agentId: '', status: ''}, ...]
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadingAgents, setLoadingAgents] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    const [message, setMessage] = useState(null);
    const [singleCallId, setSingleCallId] = useState('');
    const [singleSyncing, setSingleSyncing] = useState(false);
    const [singleSyncResult, setSingleSyncResult] = useState(null);


    const channelLabels = {
        ALL: 'Tümü',
        LEAD: 'Lead Ads',
        FACEBOOK: 'Facebook Messenger',
        INSTAGRAM: 'Instagram DM',
        WHATSAPP: 'WhatsApp',
        EMAIL: 'E-posta',
        FORM: 'Web Form',
        WIDGET: 'Web Widget'
    };

    const statusOptions = [
        { value: '', label: 'Tüm Durumlar (Filtre Yok)' },
        { value: 'NEW_APPLICATION', label: 'Yeni Başvuru' },
        { value: 'OPPORTUNITY', label: 'Fırsat' },
        { value: 'HOT_OPPORTUNITY', label: 'Sıcak Fırsat' },
        { value: 'COMPLAINT', label: 'Şikayet' },
        { value: 'INFO_PROVIDED', label: 'Bilgi Verildi' },
        { value: 'APPOINTMENT_SCHEDULED', label: 'Randevu Planlandı' },
        { value: 'SALE_COMPLETED', label: 'Satış Gerçekleşti' },
        { value: 'UNREACHABLE', label: 'Ulaşılamadı' },
        { value: 'CALLBACK', label: 'Tekrar Ara' },
        { value: 'SPAM', label: 'Spam' },
        { value: 'LOST', label: 'Kaybedildi' }
    ];

    useEffect(() => {
        if (!workspaceId) return;
        loadSettings();
        loadConnectedChannels();
    }, [workspaceId]);

    const handleSyncCalls = async () => {
        if (!workspaceId) return;
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await retellAPI.syncCalls(workspaceId);
            setSyncResult(res.data);
        } catch (err) {
            setSyncResult({ error: err.response?.data?.error || 'Senkronizasyon başarısız' });
        } finally {
            setSyncing(false);
        }
    };

    const handleSyncSingleCall = async () => {
        if (!workspaceId || !singleCallId.trim()) return;
        setSingleSyncing(true);
        setSingleSyncResult(null);
        try {
            const res = await retellAPI.syncSingleCall(workspaceId, singleCallId.trim());
            setSingleSyncResult({ success: true, ...res.data });
            setSingleCallId('');
        } catch (err) {
            setSingleSyncResult({ error: err.response?.data?.error || 'Arama getirilemedi' });
        } finally {
            setSingleSyncing(false);
        }
    };



    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await retellAPI.getSettings(workspaceId);
            const triggers = res.data.retellAutoCallTriggers || {};
            // Convert triggers object to rules array
            const existingRules = Object.entries(triggers)
                .filter(([_, v]) => v && (v === true || v.enabled))
                .map(([source, val]) => ({
                    source,
                    delay: typeof val === 'object' && val.delay !== undefined ? val.delay : (res.data.retellAutoCallDelay ?? 30),
                    agentId: typeof val === 'object' && val.agentId ? val.agentId : '',
                    status: typeof val === 'object' && val.status ? val.status : '',
                    callStart: typeof val === 'object' && val.callStart ? val.callStart : '09:00',
                    callEnd: typeof val === 'object' && val.callEnd ? val.callEnd : '18:00'
                }));
            setRules(existingRules);
            setSettings({
                retellApiKey: '',
                retellAgentId: res.data.retellAgentId || '',
                retellFromNumber: res.data.retellFromNumber || '',
                retellAutoCallEnabled: res.data.retellAutoCallEnabled || false,
                retellAutoCallTriggers: triggers,
                retellAutoCallSchedule: res.data.retellAutoCallSchedule || { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
                // AI Devralma
                aiFallbackEnabled: res.data.aiFallbackEnabled || false,
                aiFallbackDelayMinutes: res.data.aiFallbackDelayMinutes ?? 60,
                aiFallbackPoolEnabled: res.data.aiFallbackPoolEnabled || false
            });
            if (res.data.isConfigured) loadAgents();
        } catch (err) {
            console.error('Error loading Retell settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadConnectedChannels = async () => {
        try {
            const [pagesRes, waRes, emailRes, formRes, widgetRes] = await Promise.all([
                facebookAPI.getPages(workspaceId).catch(() => ({ data: { pages: [] } })),
                whatsappAPI.getPhoneNumbers(workspaceId).catch(() => ({ data: { phoneNumbers: [] } })),
                emailAPI.getChannels(workspaceId).catch(() => ({ data: { emailChannels: [] } })),
                formWebhookAPI.getWebhooks(workspaceId).catch(() => ({ data: { webhooks: [] } })),
                webWidgetAPI.getAll(workspaceId).catch(() => ({ data: { widgets: [] } }))
            ]);
            const channels = [];
            const pages = pagesRes.data.pages || pagesRes.data || [];
            if (Array.isArray(pages) && pages.length > 0) {
                channels.push('LEAD', 'FACEBOOK');
                if (pages.some(p => p.instagramBusinessId)) channels.push('INSTAGRAM');
            }
            const waNumbers = waRes.data.phoneNumbers || waRes.data || [];
            if (Array.isArray(waNumbers) && waNumbers.length > 0) channels.push('WHATSAPP');
            const emails = emailRes.data.emailChannels || emailRes.data || [];
            if (Array.isArray(emails) && emails.length > 0) channels.push('EMAIL');
            const forms = formRes.data.webhooks || formRes.data || [];
            if (Array.isArray(forms) && forms.length > 0) channels.push('FORM');
            const widgets = widgetRes.data.widgets || widgetRes.data || [];
            if (Array.isArray(widgets) && widgets.length > 0) channels.push('WIDGET');
            setConnectedChannels(channels);
        } catch (err) {
            console.error('Error loading connected channels:', err);
        }
    };

    const loadAgents = async () => {
        try {
            setLoadingAgents(true);
            const res = await retellAPI.getAgents(workspaceId);
            setAgents(res.data.agents || []);
        } catch (err) { setAgents([]); }
        finally { setLoadingAgents(false); }
    };

    // Convert rules array to triggers object for save
    const rulesToTriggers = (rulesList) => {
        const triggers = {};
        rulesList.forEach(r => {
            if (r.source) {
                // Save ALL as single key (backend checks triggers['ALL'] fallback)
                triggers[r.source] = {
                    enabled: true,
                    delay: parseInt(r.delay) || 0,
                    agentId: r.agentId || '',
                    status: r.status || '',
                    callStart: r.callStart || '09:00',
                    callEnd: r.callEnd || '18:00'
                };
            }
        });
        return triggers;
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setMessage(null);
            const data = {};
            if (settings.retellApiKey) data.retellApiKey = settings.retellApiKey;
            if (settings.retellAgentId !== undefined) data.retellAgentId = settings.retellAgentId;
            if (settings.retellFromNumber !== undefined) data.retellFromNumber = settings.retellFromNumber;
            data.retellAutoCallEnabled = settings.retellAutoCallEnabled;
            data.retellAutoCallTriggers = rulesToTriggers(rules);
            data.retellAutoCallSchedule = settings.retellAutoCallSchedule;
            // AI Devralma
            data.aiFallbackEnabled = settings.aiFallbackEnabled;
            data.aiFallbackDelayMinutes = parseInt(settings.aiFallbackDelayMinutes) || 60;
            data.aiFallbackPoolEnabled = settings.aiFallbackPoolEnabled;

            await retellAPI.saveSettings(workspaceId, data);
            setMessage({ type: 'success', text: 'Ayarlar başarıyla kaydedildi!' });
            if (onSave) onSave();
            if (settings.retellApiKey) setTimeout(loadAgents, 500);
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Kayıt başarısız' });
        } finally { setSaving(false); }
    };

    const handleRemoveSetup = async () => {
        if (!confirm('AI Sesli Arama kurulumunu kaldırmak istediğinize emin misiniz? API Key, Agent ve Numara bilgileri silinecek.')) return;
        try {
            setSaving(true);
            await retellAPI.saveSettings(workspaceId, {
                retellApiKey: '',
                retellAgentId: '',
                retellFromNumber: '',
                retellAutoCallEnabled: false,
                retellAutoCallTriggers: {}
            });
            setSettings({
                retellApiKey: '',
                retellAgentId: '',
                retellFromNumber: '',
                retellAutoCallEnabled: false,
                retellAutoCallTriggers: {},
                retellAutoCallDelay: 30,
                retellAutoCallSchedule: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }
            });
            setRules([]);
            setAgents([]);
            setMessage({ type: 'success', text: 'Kurulum başarıyla kaldırıldı!' });
            if (onSave) onSave();
        } catch (err) {
            setMessage({ type: 'error', text: 'Kurulum kaldırılamadı' });
        } finally { setSaving(false); }
    };

    const addRule = () => {
        // If ALL is already selected, don’t allow more rules
        if (rules.some(r => r.source === 'ALL')) return;
        const usedSources = rules.map(r => r.source);
        // ALL is always available if no rule exists yet, otherwise offer remaining channels
        if (usedSources.length === 0 || !usedSources.includes('ALL')) {
            setRules([...rules, { source: 'ALL', delay: 30, agentId: '', status: '', callStart: '09:00', callEnd: '18:00' }]);
        }
    };

    const removeRule = (index) => {
        setRules(rules.filter((_, i) => i !== index));
    };

    const updateRuleField = (index, field, value) => {
        const newRules = [...rules];
        newRules[index] = { ...newRules[index], [field]: value };
        setRules(newRules);
    };

    const toggleDay = (day) => {
        setSettings(prev => {
            const days = prev.retellAutoCallSchedule.days || [];
            const newDays = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
            return { ...prev, retellAutoCallSchedule: { ...prev.retellAutoCallSchedule, days: newDays } };
        });
    };

    const dayLabels = [
        { value: 0, label: 'Pzr' }, { value: 1, label: 'Pzt' }, { value: 2, label: 'Sal' },
        { value: 3, label: 'Çar' }, { value: 4, label: 'Per' }, { value: 5, label: 'Cum' }, { value: 6, label: 'Cmt' }
    ];

    // Available channels for dropdown (excluding already selected ones except current)
    const getAvailableChannels = (currentSource) => {
        const usedSources = rules.map(r => r.source).filter(s => s !== currentSource);
        const available = connectedChannels.filter(ch => !usedSources.includes(ch));
        // Always include ALL option unless another ALL rule already exists
        const allUsed = usedSources.includes('ALL');
        if (!allUsed) {
            return ['ALL', ...available];
        }
        return allSources.filter(s => !usedSources.includes(s.value));
    };

    if (loading) return <div style={{ padding: 20 }}><Loader size={20} className="spin" /> Yükleniyor...</div>;

    const inputStyle = {
        width: '100%', padding: '10px 14px', borderRadius: 8,
        border: '1px solid #e5e7eb', fontSize: '0.9rem',
        outline: 'none', transition: 'border-color 0.2s',
        marginBottom: 4, fontFamily: 'inherit'
    };

    const labelStyle = { display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 600, color: '#374151' };
    const hintStyle = { display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginTop: 2, marginBottom: 16 };
    const selectStyle = { ...inputStyle, minWidth: 100, cursor: 'pointer', appearance: 'auto' };

    return (
        <div className="settings-section">

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
                {[
                    { id: 'general', icon: <Phone size={15} />, label: '⚙️ Genel Ayarlar' },
                    { id: 'agents',  icon: <Bot size={15} />,   label: '🤖 Agent Yönetimi' },
                    { id: 'kb',      icon: <BookOpen size={15} />, label: '📚 Bilgi Bankası' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', border: 'none', background: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
                            color: activeTab === tab.id ? '#6366f1' : '#6b7280',
                            fontWeight: activeTab === tab.id ? 700 : 500,
                            fontSize: '0.85rem', cursor: 'pointer', marginBottom: -1,
                            transition: 'all 0.15s'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'agents' && (
                <RetellAgentManager workspaceId={workspaceId} />
            )}

            {activeTab === 'kb' && (
                <RetellKnowledgeBaseSync workspaceId={workspaceId} />
            )}

            {activeTab === 'general' && (<>

            {message && (
                <div style={{
                    padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
                    color: message.type === 'success' ? '#065f46' : '#991b1b',
                    border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`
                }}>
                    {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {message.text}
                </div>
            )}

            {/* RETELL CONFIG CARD */}
            {!hideApiSetup && (
            <div className="card" style={{ padding: 24, position: 'relative' }}>
                <button onClick={handleRemoveSetup} disabled={saving}
                    style={{
                        position: 'absolute', top: 16, right: 16,
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'none', border: '1px solid #fecaca', borderRadius: 8,
                        padding: '6px 12px', color: '#ef4444', fontSize: '0.78rem',
                        fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.target.style.background = '#fef2f2'; }}
                    onMouseLeave={(e) => { e.target.style.background = 'none'; }}
                >
                    <XCircle size={14} /> Kurulumu Kaldır
                </button>
                <div style={{ height: 12 }} />
                <div className="form-group" style={{ marginBottom: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 8 }}>
                        <Key size={16} /> API Key
                    </label>
                    <input type="password" value={settings.retellApiKey}
                        onChange={(e) => setSettings(prev => ({ ...prev, retellApiKey: e.target.value }))}
                        placeholder="AI Call API Key girin..."
                        style={{ width: '100%', ...inputStyle }}
                    />
                </div>
                <div className="form-group" style={{ marginBottom: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 8 }}>
                        <Bot size={16} /> AI Agent
                        <button type="button" onClick={loadAgents} disabled={loadingAgents}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', display: 'flex', alignItems: 'center', padding: 0 }}>
                            <RefreshCw size={14} className={loadingAgents ? 'spin' : ''} />
                        </button>
                    </label>
                    {agents.length > 0 ? (
                        <select value={settings.retellAgentId}
                            onChange={(e) => setSettings(prev => ({ ...prev, retellAgentId: e.target.value }))}
                            style={{ width: '100%', ...selectStyle }}>
                            <option value="">Agent seçin...</option>
                            {agents.map(a => <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>)}
                        </select>
                    ) : (
                        <input type="text" value={settings.retellAgentId}
                            onChange={(e) => setSettings(prev => ({ ...prev, retellAgentId: e.target.value }))}
                            placeholder="Agent ID girin veya API key kaydedip listeden seçin"
                            style={{ width: '100%', ...inputStyle }}
                        />
                    )}
                </div>
                <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 8 }}>
                        <Phone size={16} /> Arama Numarası
                    </label>
                    <input type="text" value={settings.retellFromNumber}
                        onChange={(e) => setSettings(prev => ({ ...prev, retellFromNumber: e.target.value }))}
                        placeholder="+905xxxxxxxxx"
                        style={{ width: '100%', ...inputStyle }}
                    />
                </div>
            </div>
            )}

            {/* AUTO CALL CARD — Routing Style */}
            <div className="card" style={{ padding: 24, marginTop: 20 }}>
                {/* Header with toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: settings.retellAutoCallEnabled ? 8 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PhoneCall size={18} style={{ color: '#6366f1' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Otomatik Arama (Auto-Call)</span>
                    </div>
                    <div
                        onClick={() => setSettings(prev => ({ ...prev, retellAutoCallEnabled: !prev.retellAutoCallEnabled }))}
                        style={{
                            width: 48, height: 26, borderRadius: 13,
                            background: settings.retellAutoCallEnabled ? '#10b981' : '#d1d5db',
                            cursor: 'pointer', position: 'relative', transition: 'background 0.3s'
                        }}>
                        <div style={{
                            width: 22, height: 22, borderRadius: '50%', background: '#fff',
                            position: 'absolute', top: 2,
                            left: settings.retellAutoCallEnabled ? 24 : 2,
                            transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }} />
                    </div>
                </div>

                {settings.retellAutoCallEnabled && (
                    <>
                        <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: 0, marginBottom: 20 }}>
                            Belirli kanallardan numara geldiğinde otomatik arama başlatır.
                        </p>

                        {/* Çalışma Saatleri */}
                        <div style={{ marginBottom: 18, padding: '16px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <Clock size={16} style={{ color: '#6366f1' }} />
                                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e1b4b' }}>Çalışma Saatleri</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                <input type="time"
                                    value={settings.retellAutoCallSchedule.start || '09:00'}
                                    onChange={e => setSettings(prev => ({
                                        ...prev,
                                        retellAutoCallSchedule: { ...prev.retellAutoCallSchedule, start: e.target.value }
                                    }))}
                                    style={{ ...inputStyle, flex: 1, maxWidth: 140 }}
                                />
                                <span style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 600 }}>—</span>
                                <input type="time"
                                    value={settings.retellAutoCallSchedule.end || '18:00'}
                                    onChange={e => setSettings(prev => ({
                                        ...prev,
                                        retellAutoCallSchedule: { ...prev.retellAutoCallSchedule, end: e.target.value }
                                    }))}
                                    style={{ ...inputStyle, flex: 1, maxWidth: 140 }}
                                />
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>Aktif Günler</span>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {dayLabels.map(d => (
                                        <button key={d.value} type="button"
                                            onClick={() => toggleDay(d.value)}
                                            style={{
                                                padding: '5px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
                                                border: (settings.retellAutoCallSchedule.days || []).includes(d.value) ? '1px solid #6366f1' : '1px solid #e5e7eb',
                                                background: (settings.retellAutoCallSchedule.days || []).includes(d.value) ? '#eef2ff' : '#fff',
                                                color: (settings.retellAutoCallSchedule.days || []).includes(d.value) ? '#4338ca' : '#9ca3af',
                                                cursor: 'pointer', transition: 'all 0.15s'
                                            }}
                                        >{d.label}</button>
                                    ))}
                                </div>
                                <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4, marginBottom: 0 }}>Seçili günlerde ve saatlerde otomatik arama yapılır.</p>
                            </div>
                        </div>

                        {/* Arama Kuralları */}
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>Arama Kuralları</span>
                                <button type="button" onClick={addRule}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '5px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
                                        border: '1px dashed #c7d2fe', background: '#eef2ff', color: '#6366f1',
                                        cursor: 'pointer'
                                    }}>
                                    <Plus size={14} /> Kural Ekle
                                </button>
                            </div>
                            {rules.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '20px', background: '#f9fafb', borderRadius: 8, border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: '0.82rem' }}>
                                    Henüz kural eklenmedi. "Kural Ekle" ile başlayın.
                                </div>
                            )}
                            {rules.map((rule, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                                    background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb',
                                    marginBottom: 6, flexWrap: 'wrap'
                                }}>
                                    <select value={rule.source} onChange={e => updateRuleField(i, 'source', e.target.value)}
                                        style={{ ...selectStyle, minWidth: 120, flex: 1 }}>
                                        {getAvailableChannels(rule.source).map(ch => (
                                            <option key={ch} value={ch}>{channelLabels[ch] || ch}</option>
                                        ))}
                                    </select>
                                    <select value={rule.delay} onChange={e => updateRuleField(i, 'delay', parseInt(e.target.value))}
                                        style={{ ...selectStyle, minWidth: 90 }}>
                                        <option value={0}>Hemen</option>
                                        <option value={5}>5 dk</option>
                                        <option value={10}>10 dk</option>
                                        <option value={15}>15 dk</option>
                                        <option value={30}>30 dk</option>
                                        <option value={60}>1 saat</option>
                                        <option value={120}>2 saat</option>
                                    </select>
                                    {agents.length > 0 && (
                                        <select value={rule.agentId || ''} onChange={e => updateRuleField(i, 'agentId', e.target.value)}
                                            style={{ ...selectStyle, minWidth: 120, flex: 1 }}>
                                            <option value="">Varsayılan Agent</option>
                                            {agents.map(a => <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>)}
                                        </select>
                                    )}
                                    <button type="button" onClick={() => removeRule(i)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                {/* Sync Result */}
                {syncResult && (
                    <div style={{
                        fontSize: '0.82rem', padding: '6px 12px', borderRadius: 6,
                        background: syncResult.error ? '#fef2f2' : '#f0fdf4',
                        color: syncResult.error ? '#dc2626' : '#16a34a',
                        border: `1px solid ${syncResult.error ? '#fecaca' : '#bbf7d0'}`
                    }}>
                        {syncResult.error
                            ? `❌ ${syncResult.error}`
                            : `✅ ${syncResult.total} arama çekildi — ${syncResult.created} yeni, ${syncResult.updated} güncellendi${syncResult.deleted > 0 ? `, ${syncResult.deleted} fazladan kayıt silindi` : ''}${syncResult.errors > 0 ? `, ${syncResult.errors} hata` : ''}`
                        }
                    </div>
                )}

                {/* Sync Button */}
                <button onClick={handleSyncCalls} disabled={syncing}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 20px', background: '#6366f1', color: '#fff',
                        border: 'none', borderRadius: 8, fontSize: '0.9rem',
                        fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
                        opacity: syncing ? 0.7 : 1
                    }}>
                    {syncing ? <Loader size={16} className="spin" /> : <RefreshCw size={16} />}
                    {syncing ? 'Senkronize ediliyor...' : 'Geçmiş Aramaları Çek'}
                </button>

                {/* Save Button */}
                <button onClick={handleSave} disabled={saving}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 24px', background: '#ef4444', color: '#fff',
                        border: 'none', borderRadius: 8, fontSize: '0.9rem',
                        fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.7 : 1
                    }}>
                    {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
                    {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
            </div>

            {/* ─── AI Devralma Ayarları Kartı ─────────────────────────────── */}
            {settings.retellAutoCallEnabled && (
            <div className="card" style={{ padding: 24, marginTop: 20, border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Bot size={18} style={{ color: '#8b5cf6' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e1b4b' }}>AI Arama Devralma</span>
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 20 }}>YENİ</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: 0, marginBottom: 16 }}>
                    AI ses agent'ı hangi arama görevlerini üstlenebilir?
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Checkbox 1: Kendi Görevleri (always on) */}
                    <label style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'default',
                        padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0'
                    }}>
                        <input type="checkbox" checked={true} disabled
                            style={{ marginTop: 2, accentColor: '#10b981', width: 16, height: 16 }} />
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.87rem', color: '#065f46' }}>Sadece Kendi Arama Görevleri</div>
                            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>
                                AI agent'a doğrudan atanmış aramalar. Her zaman aktiftir.
                            </div>
                        </div>
                    </label>

                    {/* Checkbox 2: Havuz */}
                    <label style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                        padding: '12px 14px', borderRadius: 10,
                        background: settings.aiFallbackPoolEnabled ? '#eff6ff' : '#f9fafb',
                        border: `1px solid ${settings.aiFallbackPoolEnabled ? '#93c5fd' : '#e5e7eb'}`,
                        transition: 'all 0.2s'
                    }}>
                        <input type="checkbox"
                            checked={settings.aiFallbackPoolEnabled}
                            onChange={e => setSettings(prev => ({ ...prev, aiFallbackPoolEnabled: e.target.checked }))}
                            style={{ marginTop: 2, accentColor: '#3b82f6', width: 16, height: 16 }} />
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.87rem', color: '#1e3a5f' }}>Havuzdaki Sahipsiz Görevler</div>
                            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>
                                Kimseye atanmamış arama görevlerini AI üstlensin.
                            </div>
                        </div>
                    </label>

                    {/* Checkbox 3: Aynı Takım — Timeout */}
                    <label style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                        padding: '12px 14px', borderRadius: 10,
                        background: settings.aiFallbackEnabled ? '#faf5ff' : '#f9fafb',
                        border: `1px solid ${settings.aiFallbackEnabled ? '#c4b5fd' : '#e5e7eb'}`,
                        transition: 'all 0.2s'
                    }}>
                        <input type="checkbox"
                            checked={settings.aiFallbackEnabled}
                            onChange={e => setSettings(prev => ({ ...prev, aiFallbackEnabled: e.target.checked }))}
                            style={{ marginTop: 2, accentColor: '#8b5cf6', width: 16, height: 16 }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.87rem', color: '#3b0764' }}>Aynı Takımdaki Yapılmamış Aramalar</div>
                            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>
                                İnsan agent süresinde aramazsa AI devreye girsin.
                            </div>
                            {settings.aiFallbackEnabled && (
                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <Clock size={14} color="#8b5cf6" />
                                    <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>Bekleme süresi:</span>
                                    <select
                                        value={settings.aiFallbackDelayMinutes}
                                        onChange={e => setSettings(prev => ({ ...prev, aiFallbackDelayMinutes: parseInt(e.target.value) }))}
                                        style={{
                                            padding: '6px 12px', borderRadius: 8, border: '1px solid #c4b5fd',
                                            fontSize: '0.84rem', background: '#faf5ff', cursor: 'pointer',
                                            fontWeight: 600, color: '#5b21b6'
                                        }}
                                    >
                                        <option value={15}>15 dakika</option>
                                        <option value={30}>30 dakika</option>
                                        <option value={60}>1 saat</option>
                                        <option value={120}>2 saat</option>
                                        <option value={180}>3 saat</option>
                                        <option value={240}>4 saat</option>
                                        <option value={480}>8 saat (iş günü)</option>
                                        <option value={1440}>24 saat</option>
                                    </select>
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>sonra AI arar</span>
                                </div>
                            )}
                        </div>
                    </label>
                </div>

                <div style={{ marginTop: 14, padding: '8px 12px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: '0.78rem', color: '#92400e' }}>
                    💡 <strong>Not:</strong> Mevcut otomatik arama kurallarınız aynen çalışmaya devam eder. Bu ayarlar sadece yeni AI devralma özelliklerini kontrol eder.
                </div>
            </div>
            )}

            {/* Arama Senkronizasyonu */}
            <div className="card" style={{ padding: 20, marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <PhoneCall size={16} style={{ color: '#6366f1' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e1b4b' }}>Tek Arama Getir</span>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280', marginLeft: 4 }}>— Sadece bu arama eklenir, diğerlerine dokunulmaz</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        value={singleCallId}
                        onChange={e => setSingleCallId(e.target.value)}
                        placeholder="call_85ebb2d4f1e18bc1acd9f8e3796"
                        style={{ flex: 1, minWidth: 260, padding: '8px 12px', borderRadius: 8, border: '1px solid #c7d2fe', fontSize: '0.83rem', fontFamily: 'monospace' }}
                        onKeyDown={e => e.key === 'Enter' && handleSyncSingleCall()}
                    />
                    <button onClick={handleSyncSingleCall} disabled={singleSyncing || !singleCallId.trim()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 18px', background: '#6366f1', color: '#fff',
                            border: 'none', borderRadius: 8, fontSize: '0.85rem',
                            fontWeight: 600, cursor: (singleSyncing || !singleCallId.trim()) ? 'not-allowed' : 'pointer',
                            opacity: (singleSyncing || !singleCallId.trim()) ? 0.6 : 1, whiteSpace: 'nowrap'
                        }}>
                        {singleSyncing ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}
                        {singleSyncing ? 'Getiriliyor...' : 'Getir'}
                    </button>
                </div>
                {singleSyncResult && (
                    <div style={{
                        marginTop: 8, fontSize: '0.82rem', padding: '6px 12px', borderRadius: 6,
                        background: singleSyncResult.error ? '#fef2f2' : '#f0fdf4',
                        color: singleSyncResult.error ? '#dc2626' : '#16a34a',
                        border: `1px solid ${singleSyncResult.error ? '#fecaca' : '#bbf7d0'}`
                    }}>
                        {singleSyncResult.error
                            ? `❌ ${singleSyncResult.error}`
                            : `✅ Arama başarıyla eklendi — Süre: ${Math.floor((singleSyncResult.duration || 0) / 60)}dk ${(singleSyncResult.duration || 0) % 60}sn`
                        }
                    </div>
                )}
            </div>
            </>)} {/* end activeTab === 'general' */}
        </div>
    );
};


export default RetellSettings;
