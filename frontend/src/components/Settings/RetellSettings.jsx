import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { retellAPI, facebookAPI, whatsappAPI, emailAPI, formWebhookAPI, webWidgetAPI } from '../../services/api';
import { Phone, Key, Bot, Save, Loader, CheckCircle, AlertCircle, RefreshCw, Clock, Calendar, PhoneCall, Trash2, Plus, Zap, XCircle, BookOpen } from 'lucide-react';
import { RetellAgentManager, RetellKnowledgeBaseSync } from './RetellAgentManager';
import { RetellKnowledgeBaseManager } from './RetellKnowledgeBaseManager';

const RetellSettings = ({ onSave, hideApiSetup = false }) => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;
    const [activeTab, setActiveTab] = useState('general');

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
                    { id: 'general', label: '⚙️ Genel Ayarlar' },
                    { id: 'kb', label: '📚 Knowledge Base' },
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', border: 'none', background: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
                            color: activeTab === tab.id ? '#6366f1' : '#6b7280',
                            fontWeight: activeTab === tab.id ? 700 : 500,
                            fontSize: '0.85rem', cursor: 'pointer', marginBottom: -1,
                            transition: 'all 0.15s'
                        }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Knowledge Base Tab */}
            {activeTab === 'kb' && (
                <RetellKnowledgeBaseManager workspaceId={workspaceId} />
            )}

            {/* General Tab */}
            {activeTab === 'general' && <>
            <RetellAgentManager workspaceId={workspaceId} initialAgentId={initialAgentId} />

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

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
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
            </>}
        </div>
    );
};


export default RetellSettings;
