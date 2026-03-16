import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { retellAPI, facebookAPI, whatsappAPI, emailAPI, formWebhookAPI, webWidgetAPI } from '../../services/api';
import { Phone, Key, Bot, Save, Loader, CheckCircle, AlertCircle, RefreshCw, Clock, Calendar, PhoneCall, Trash2, Plus, Zap, XCircle } from 'lucide-react';

const RetellSettings = ({ onSave }) => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [settings, setSettings] = useState({
        retellApiKey: '',
        retellAgentId: '',
        retellFromNumber: '',
        retellAutoCallEnabled: false,
        retellAutoCallTriggers: {},
        retellAutoCallDelay: 30,
        retellAutoCallSchedule: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }
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
                retellAutoCallSchedule: res.data.retellAutoCallSchedule || { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }
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

            await retellAPI.saveSettings(workspaceId, data);
            setMessage({ type: 'success', text: 'Ayarlar başarıyla kaydedildi!' });
            if (onSave) onSave();
            if (settings.retellApiKey) setTimeout(loadAgents, 500);
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Kayıt başarısız' });
        } finally { setSaving(false); }
    };

    const handleRemoveSetup = async () => {
        if (!confirm('Retell AI Call kurulumunu kaldırmak istediğinize emin misiniz? API Key, Agent ve Numara bilgileri silinecek.')) return;
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
        return available;
    };

    if (loading) {
        return (
            <div className="settings-section" style={{ textAlign: 'center', padding: 40 }}>
                <Loader size={24} className="spin" />
                <p>Yükleniyor...</p>
            </div>
        );
    }

    const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', boxSizing: 'border-box', background: '#fff' };
    const selectStyle = { ...inputStyle, minWidth: 100, cursor: 'pointer', appearance: 'auto' };

    return (
        <div className="settings-section">

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



                        {/* Conditional Rules — Routing Style */}
                        <div className="card" style={{ padding: 16, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.88rem' }}>
                                    <Zap size={15} style={{ color: '#f59e0b' }} /> Koşullu Arama
                                </div>
                            </div>
                            <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 0, marginBottom: 14 }}>
                                Hangi kanallardan numara geldiğinde otomatik arama yapılacağını belirleyin.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {rules.map((rule, index) => (
                                    <div key={index} style={{
                                        border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '12px 16px'
                                    }}>
                                        {/* Top Row: Channel Selection */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                            <span style={{ background: '#eef2ff', color: '#4338ca', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 }}>Eğer</span>
                                            <select value="kaynak" disabled style={{ ...selectStyle, minWidth: 90, background: '#f9fafb', color: '#374151' }}>
                                                <option value="kaynak">kaynak</option>
                                            </select>
                                            <select value="equals" disabled style={{ ...selectStyle, minWidth: 80, background: '#f9fafb', color: '#374151' }}>
                                                <option value="equals">Eşittir</option>
                                            </select>
                                            <select value={rule.source} onChange={(e) => updateRuleField(index, 'source', e.target.value)} style={{ ...selectStyle, minWidth: 150, fontWeight: 500 }}>
                                                {getAvailableChannels(rule.source).map(ch => (
                                                    <option key={ch} value={ch}>{channelLabels[ch] || ch}</option>
                                                ))}
                                            </select>
                                            <span style={{ color: '#9ca3af', fontSize: '0.85rem', flexShrink: 0 }}>→</span>
                                            <span style={{ background: '#ecfdf5', color: '#059669', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 }}>Otomatik Ara</span>

                                            <div style={{ flex: 1 }} />

                                            <button onClick={() => removeRule(index)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, display: 'flex', alignItems: 'center', opacity: 0.7, transition: 'opacity 0.2s' }}
                                                onMouseEnter={(e) => e.target.style.opacity = 1}
                                                onMouseLeave={(e) => e.target.style.opacity = 0.7}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        {/* Bottom Row: Delay, Agent, Status */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingLeft: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Clock size={14} color="#6b7280" />
                                                <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>Gecikme:</span>
                                                <input type="number" min="0" max="3600" step="5"
                                                    value={rule.delay}
                                                    onChange={(e) => updateRuleField(index, 'delay', e.target.value)}
                                                    style={{ width: 70, ...inputStyle, padding: '6px 10px', textAlign: 'center' }}
                                                />
                                                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>sn</span>
                                            </div>
                                            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Bot size={14} color="#6b7280" />
                                                <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>Agent:</span>
                                                <select
                                                    value={rule.agentId || ''}
                                                    onChange={(e) => updateRuleField(index, 'agentId', e.target.value)}
                                                    style={{ ...selectStyle, padding: '6px 10px', minWidth: 160 }}
                                                >
                                                    <option value="">Varsayılan Agent</option>
                                                    {agents.map(a => <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>Durum:</span>
                                                <select
                                                    value={rule.status || ''}
                                                    onChange={(e) => updateRuleField(index, 'status', e.target.value)}
                                                    style={{ ...selectStyle, padding: '6px 10px', minWidth: 180 }}
                                                >
                                                    {statusOptions.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                         {/* Call Hours Row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 4, marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e5e7eb', flexWrap: 'wrap' }}>
                                            <Calendar size={14} color="#6b7280" />
                                            <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>Arama Saatleri:</span>
                                            <input
                                                type="time"
                                                value={rule.callStart || '09:00'}
                                                onChange={(e) => updateRuleField(index, 'callStart', e.target.value)}
                                                style={{ ...inputStyle, padding: '6px 10px', width: 110 }}
                                            />
                                            <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>—</span>
                                            <input
                                                type="time"
                                                value={rule.callEnd || '18:00'}
                                                onChange={(e) => updateRuleField(index, 'callEnd', e.target.value)}
                                                style={{ ...inputStyle, padding: '6px 10px', width: 110 }}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Mesai içinde 5dk sonra, dışında sonraki mesaiye erteler. Müşteri "hemen ara" yazarsa saate bakmaz.</span>
                                        </div>

                                    </div>
                                ))}
                            </div>

                            {/* Add Rule Button */}
                            {rules.length < connectedChannels.length && (
                                <button onClick={addRule}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: 'none', border: '1px dashed #d1d5db',
                                        borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                                        color: '#6b7280', fontSize: '0.82rem', fontWeight: 500,
                                        marginTop: 12, transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; }}
                                >
                                    <Plus size={14} /> Kural Ekle
                                </button>
                            )}

                            {connectedChannels.length === 0 && (
                                <div style={{ padding: 12, borderRadius: 8, background: '#fefce8', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.82rem' }}>
                                    ⚠️ Henüz bağlı kanal yok. Kanallar sayfasından en az bir kanal bağlayın.
                                </div>
                            )}
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
                            : `✅ ${syncResult.total} arama çekildi — ${syncResult.newCalls} yeni, ${syncResult.inboxed} Inbox'a eklendi`
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
        </div>
    );
};

export default RetellSettings;
