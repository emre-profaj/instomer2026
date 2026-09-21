import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { aiAPI, workspaceAPI, automationAPI, retellAPI, facebookAPI, whatsappAPI, emailAPI, formWebhookAPI, webWidgetAPI, teamAPI } from '../../services/api';
import { Plus, Trash2, Bot, FileText, Upload, Save, X, Clock, Timer, AlertCircle, Gauge, GitBranch, Edit2, Zap, Stethoscope, Phone, Mic, Wand2, ChevronRight, ChevronLeft, Languages, MessageSquare, Shield, Eye, Sparkles, ClipboardList, Key, Loader, CheckCircle, RefreshCw, PhoneCall, Calendar, BookOpen, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AppointmentBotConfig from '../../components/Settings/AppointmentBotConfig';
import BotRoutingSettings from './BotRoutingSettings';

import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import './BotModal.css';

// Sub-component for managing documents
const BotDocumentManager = ({ workspaceId, botId }) => {
    const { t } = useTranslation();
    const [documents, setDocuments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    useEffect(() => {
        if (workspaceId && botId) {
            loadDocuments();
        }
    }, [workspaceId, botId]);

    const loadDocuments = async () => {
        try {
            const res = await aiAPI.getDocuments(workspaceId, botId);
            setDocuments(res.data.documents);
        } catch (error) {
            console.error('Error loading docs:', error);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            setUploading(true);
            await aiAPI.uploadDocument(workspaceId, botId, formData);
            loadDocuments();
            alert('Dosya yüklendi!');
        } catch (error) {
            console.error('Upload error:', error);
            alert('Dosya yüklenemedi. Sadece PDF ve DOCX desteklenir.');
        } finally {
            setUploading(false);
            e.target.value = null; // Reset input
        }
    };

    const handleDelete = async (docId) => {
        setConfirmModal({
            isOpen: true,
            title: 'Doküman Sil',
            message: 'Bu dokümanı silmek istediğinize emin misiniz?',
            confirmText: t('common.confirm'),
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await aiAPI.deleteDocument(workspaceId, botId, docId);
                    loadDocuments();
                } catch (error) {
                    console.error('Delete error:', error);
                    alert('Silinemedi.');
                }
            }
        });
    };

    return (
        <div className="doc-manager">
            <h5 className="form-label">Knowledge Base (PDF/DOCX)</h5>

            {documents.length > 0 ? (
                <ul className="doc-list">
                    {documents.map(doc => (
                        <li key={doc.id} className="doc-item">
                            <span className="doc-name"><FileText size={14} /> {doc.filename}</span>
                            <button
                                onClick={() => handleDelete(doc.id)}
                                className="btn-icon text-danger"
                                style={{ border: 'none', background: 'none', cursor: 'pointer' }}
                            >
                                <Trash2 size={14} color="#ef4444" />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-muted" style={{ marginBottom: '16px', fontSize: '13px' }}>Henüz dosya yüklenmedi. Asistanın öğrenmesi için belge ekleyin.</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="btn-modern btn-primary" style={{ cursor: 'pointer', background: '#4b5563', fontSize: '12px' }}>
                    <Upload size={14} />
                    {uploading ? 'Yükleniyor...' : 'Belge Yükle'}
                    <input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                        disabled={uploading}
                    />
                </label>
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                type={confirmModal.type}
            />
        </div>
    );
};

// Sub-component for individual Bot Item
const BotItem = ({ bot, workspaceId, onDelete, onRefresh, automationsList, onClose }) => {
    const { t } = useTranslation();
    const [name, setName] = useState(bot.name || '');
    const [role, setRole] = useState(bot.role || '');
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    
    const [isActive, setIsActive] = useState(bot.isActive !== undefined ? bot.isActive : true);

    const handleToggleStatus = async () => {
        try {
            const newStatus = !isActive;
            setIsActive(newStatus);
            await aiAPI.toggleStatus(workspaceId, bot.id, newStatus);
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Update status error:', error);
            setIsActive(!newStatus); // revert
            alert('Durum güncellenemedi.');
        }
    };

    const [prompt, setPrompt] = useState(bot.prompt || '');
    const [handoffMessage, setHandoffMessage] = useState(bot.handoffMessage || '');
    const [fallbackEnabled, setFallbackEnabled] = useState(bot.fallbackEnabled || false);
    const [fallbackDelayMinutes, setFallbackDelayMinutes] = useState(bot.fallbackDelayMinutes ?? 5);
    const [fallbackScope, setFallbackScope] = useState(bot.fallbackScope || 'UNASSIGNED');
    const [updating, setUpdating] = useState(false);
    // Sol raydaki aktif bölüm
    const [activeSection, setActiveSection] = useState('channels');
    // Alt çubuktaki kayıt geri bildirimi
    const [saveState, setSaveState] = useState(null); // null | 'saved' | 'error'

    // Built-in tools state
    const [enabledTools, setEnabledTools] = useState(() => {
        try {
            return bot.enabledTools ? JSON.parse(bot.enabledTools) : [
                'transfer_to_team', 'change_funnel_stage', 'send_whatsapp_template',
                'recommend_product', 'create_order', 'send_payment_link',
                'create_appointment', 'send_location', 'add_note', 'add_tag', 'check_stock'
            ];
        } catch {
            return [
                'transfer_to_team', 'change_funnel_stage', 'send_whatsapp_template',
                'recommend_product', 'create_order', 'send_payment_link',
                'create_appointment', 'send_location', 'add_note', 'add_tag', 'check_stock'
            ];
        }
    });

    // Automations state
    const [selectedAutomations, setSelectedAutomations] = useState(() => {
        try {
            return bot.automations ? JSON.parse(bot.automations) : [];
        } catch {
            return [];
        }
    });

    // Scheduler states
    const [schedulerEnabled, setSchedulerEnabled] = useState(bot.schedulerEnabled || false);
    const [scheduleStartTime, setScheduleStartTime] = useState(bot.scheduleStartTime || '09:00');
    const [scheduleEndTime, setScheduleEndTime] = useState(bot.scheduleEndTime || '18:00');
    const [scheduleStartDate, setScheduleStartDate] = useState(bot.scheduleStartDate ? bot.scheduleStartDate.split('T')[0] : '');
    const [scheduleEndDate, setScheduleEndDate] = useState(bot.scheduleEndDate ? bot.scheduleEndDate.split('T')[0] : '');
    const [scheduleDays, setScheduleDays] = useState(() => {
        try {
            return bot.scheduleDays ? JSON.parse(bot.scheduleDays) : [];
        } catch {
            return [];
        }
    });

    // Channel assignment states (checkbox UI)
    const [workspaceChannels, setWorkspaceChannels] = useState([]);
    const [channelsLoading, setChannelsLoading] = useState(false);
    const [channelSaving, setChannelSaving] = useState(false);

    // Load workspace channels on mount
    useEffect(() => {
        const loadChannels = async () => {
            try {
                setChannelsLoading(true);
                console.log('[BotModal] Loading channels for workspaceId:', workspaceId);
                const res = await aiAPI.getChannels(workspaceId);
                console.log('[BotModal] Channels response:', res.data);
                setWorkspaceChannels(res.data.channels || []);
            } catch (err) {
                console.error('Failed to load channels:', err);
            } finally {
                setChannelsLoading(false);
            }
        };
        if (workspaceId) loadChannels();
    }, [workspaceId]);

    // Toggle channel assignment
    const handleChannelToggle = async (channel, isCurrentlyAssigned) => {
        try {
            setChannelSaving(true);
            await aiAPI.updateBotChannels(workspaceId, bot.id, [
                { channelId: channel.id, channelType: channel.type, assign: !isCurrentlyAssigned }
            ]);
            // Update local state
            setWorkspaceChannels(prev => prev.map(ch =>
                (ch.id === channel.id && ch.type === channel.type)
                    ? { ...ch, assignedBotId: isCurrentlyAssigned ? null : bot.id }
                    : ch
            ));
        } catch (err) {
            console.error('Channel toggle error:', err);
            alert('Kanal atama başarısız.');
        } finally {
            setChannelSaving(false);
        }
    };

    // Legacy channel flags (kept for save compatibility)
    const whatsappEnabled = true;
    const facebookEnabled = true;
    const instagramEnabled = true;
    const widgetEnabled = true;

    // Auto-reply delay states
    const [autoReplyDelayEnabled, setAutoReplyDelayEnabled] = useState(bot.autoReplyDelayEnabled || false);
    const [autoReplyDelaySeconds, setAutoReplyDelaySeconds] = useState(bot.autoReplyDelaySeconds || 30);
    const [autoReplyDelayMessage, setAutoReplyDelayMessage] = useState(bot.autoReplyDelayMessage || '');

    // 5-Step Smart Reminder System
    const [reminderSteps, setReminderSteps] = useState(() => {
        try {
            if (bot.reminderSteps) return JSON.parse(bot.reminderSteps);
        } catch (e) {}
        return [
            { enabled: true, delayMinutes: 60 },
            { enabled: false, delayMinutes: 180 },
            { enabled: false, delayMinutes: 1440 },
            { enabled: false, delayMinutes: 5760 }
        ];
    });

    // Routing configuration
    const [routingConfig, setRoutingConfig] = useState(() => {
        let questions = [];
        let rules = [];
        try { questions = JSON.parse(bot.routingQuestions || '[]'); } catch (e) { }
        try { rules = JSON.parse(bot.routingRules || '[]'); } catch (e) { }
        return {
            routingEnabled: bot.routingEnabled || false,
            routingQuestions: questions,
            routingDefaultTeamId: bot.routingDefaultTeamId || '',
            routingDefaultUserId: bot.routingDefaultUserId || '',
            routingConditionalEnabled: bot.routingConditionalEnabled || false,
            routingRules: rules
        };
    });

    useEffect(() => {
        setName(bot.name || '');
        setRole(bot.role || '');
        setPrompt(bot.prompt || '');
        setHandoffMessage(bot.handoffMessage || '');
        setFallbackEnabled(bot.fallbackEnabled || false);
        setFallbackDelayMinutes(bot.fallbackDelayMinutes ?? 5);
        setFallbackScope(bot.fallbackScope || 'UNASSIGNED');
        setSchedulerEnabled(bot.schedulerEnabled || false);
        setScheduleStartTime(bot.scheduleStartTime || '09:00');
        setScheduleEndTime(bot.scheduleEndTime || '18:00');
        setScheduleStartDate(bot.scheduleStartDate ? bot.scheduleStartDate.split('T')[0] : '');
        setScheduleEndDate(bot.scheduleEndDate ? bot.scheduleEndDate.split('T')[0] : '');
        try {
            setScheduleDays(bot.scheduleDays ? JSON.parse(bot.scheduleDays) : []);
        } catch {
            setScheduleDays([]);
        }
        // Channel assignments are now loaded via API (checkbox UI), no need to set toggle states
        setAutoReplyDelayEnabled(bot.autoReplyDelayEnabled || false);
        setAutoReplyDelaySeconds(bot.autoReplyDelaySeconds || 30);
        setAutoReplyDelayMessage(bot.autoReplyDelayMessage || '');
        try {
            if (bot.reminderSteps) setReminderSteps(JSON.parse(bot.reminderSteps));
            else {
                setReminderSteps([
                    { enabled: true, delayMinutes: 60 },
                    { enabled: false, delayMinutes: 180 },
                    { enabled: false, delayMinutes: 1440 },
                    { enabled: false, delayMinutes: 5760 }
                ]);
            }
        } catch (e) {}

        let questions = [];
        let rules = [];
        try { questions = JSON.parse(bot.routingQuestions || '[]'); } catch (e) { }
        try { rules = JSON.parse(bot.routingRules || '[]'); } catch (e) { }
        setRoutingConfig({
            routingEnabled: bot.routingEnabled || false,
            routingQuestions: questions,
            routingDefaultTeamId: bot.routingDefaultTeamId || '',
            routingDefaultUserId: bot.routingDefaultUserId || '',
            routingConditionalEnabled: bot.routingConditionalEnabled || false,
            routingRules: rules
        });
        
        try {
            setSelectedAutomations(bot.automations ? JSON.parse(bot.automations) : []);
        } catch {
            setSelectedAutomations([]);
        }
        try {
            setEnabledTools(bot.enabledTools ? JSON.parse(bot.enabledTools) : [
                'transfer_to_team', 'change_funnel_stage', 'send_whatsapp_template',
                'recommend_product', 'create_order', 'send_payment_link',
                'create_appointment', 'send_location', 'add_note', 'add_tag', 'check_stock'
            ]);
        } catch {
            // keep current
        }
    }, [bot]);

    const daysOfWeek = [
        { key: 'monday', label: 'Pzt' },
        { key: 'tuesday', label: 'Sal' },
        { key: 'wednesday', label: 'Çar' },
        { key: 'thursday', label: 'Per' },
        { key: 'friday', label: 'Cum' },
        { key: 'saturday', label: 'Cmt' },
        { key: 'sunday', label: 'Paz' }
    ];

    const toggleDay = (day) => {
        setScheduleDays(prev =>
            prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day]
        );
    };

    const handleUpdate = async () => {
        try {
            setUpdating(true);
            await aiAPI.updateBot(workspaceId, bot.id, {
                name: name,
                role: role,
                prompt: prompt,
                whatsappEnabled: whatsappEnabled,
                facebookEnabled: facebookEnabled,
                instagramEnabled: instagramEnabled,
                widgetEnabled: widgetEnabled,
                // Scheduler
                schedulerEnabled,
                scheduleStartTime: schedulerEnabled ? scheduleStartTime : null,
                scheduleEndTime: schedulerEnabled ? scheduleEndTime : null,
                scheduleStartDate: schedulerEnabled && scheduleStartDate ? scheduleStartDate : null,
                scheduleEndDate: schedulerEnabled && scheduleEndDate ? scheduleEndDate : null,
                scheduleDays: schedulerEnabled && scheduleDays.length > 0 ? JSON.stringify(scheduleDays) : null,
                // Auto-reply delay
                autoReplyDelayEnabled,
                autoReplyDelaySeconds: autoReplyDelayEnabled ? autoReplyDelaySeconds : 30,
                autoReplyDelayMessage: autoReplyDelayEnabled ? autoReplyDelayMessage : null,
                // Smart Reminder Steps (5-step system)
                reminderSteps: JSON.stringify(reminderSteps),
                // Routing Config
                routingEnabled: routingConfig.routingEnabled,
                routingQuestions: routingConfig.routingEnabled ? JSON.stringify(routingConfig.routingQuestions) : null,
                routingDefaultTeamId: routingConfig.routingEnabled ? routingConfig.routingDefaultTeamId || null : null,
                routingDefaultUserId: routingConfig.routingEnabled ? routingConfig.routingDefaultUserId || null : null,
                routingConditionalEnabled: routingConfig.routingConditionalEnabled,
                routingRules: routingConfig.routingConditionalEnabled ? JSON.stringify(routingConfig.routingRules) : null,
                // Linked automations
                automations: selectedAutomations.length > 0 ? selectedAutomations : null,
                // Handoff message
                handoffMessage: handoffMessage || null,
                // AI Devralma
                fallbackEnabled,
                fallbackDelayMinutes: parseInt(fallbackDelayMinutes) || 5,
                fallbackScope,
                // Built-in tools
                enabledTools: JSON.stringify(enabledTools)
            });
            setSaveState('saved');
            setTimeout(() => setSaveState(null), 2600);
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Update bot error:', error);
            setSaveState('error');
        } finally {
            setUpdating(false);
        }
    };

    // ── Sol raydaki özet sayılar ────────────────────────────────
    const assignedChannelCount = workspaceChannels.filter(ch => ch.assignedBotId === bot.id).length;
    const behaviourRules = [fallbackEnabled, schedulerEnabled, autoReplyDelayEnabled, reminderSteps.some(s => s.enabled)];
    const openBehaviourCount = behaviourRules.filter(Boolean).length;
    const TOOL_LIST = [
        { key: 'create_appointment', label: 'Randevu oluştur' },
        { key: 'recommend_product', label: 'Ürün öner' },
        { key: 'transfer_to_team', label: 'Takıma devret' },
        { key: 'send_location', label: 'Konum gönder' },
        { key: 'add_note', label: 'Not ekle' },
        { key: 'change_funnel_stage', label: 'Huni aşaması değiştir' },
        { key: 'send_whatsapp_template', label: 'WhatsApp şablon gönder' },
        { key: 'create_order', label: 'Sipariş oluştur' },
        { key: 'send_payment_link', label: 'Ödeme linki gönder' },
        { key: 'add_tag', label: 'Etiket ekle' },
        { key: 'check_stock', label: 'Stok kontrol' }
    ];

    // Kaydedilmemiş değişiklik sayısı — kanal atamaları anında kaydedildiği için sayılmaz
    const savedScheduleDays = (() => { try { return bot.scheduleDays ? JSON.parse(bot.scheduleDays) : []; } catch { return []; } })();
    const savedReminderSteps = (() => { try { return bot.reminderSteps ? JSON.parse(bot.reminderSteps) : null; } catch { return null; } })();
    const savedTools = (() => { try { return bot.enabledTools ? JSON.parse(bot.enabledTools) : null; } catch { return null; } })();
    const sameSet = (a, b) => Array.isArray(b) && a.length === b.length && a.every(x => b.includes(x));
    const pendingChanges = [
        name !== (bot.name || '') || role !== (bot.role || ''),
        prompt !== (bot.prompt || ''),
        handoffMessage !== (bot.handoffMessage || ''),
        fallbackEnabled !== !!bot.fallbackEnabled || String(fallbackDelayMinutes) !== String(bot.fallbackDelayMinutes ?? 5) || fallbackScope !== (bot.fallbackScope || 'UNASSIGNED'),
        schedulerEnabled !== !!bot.schedulerEnabled || scheduleStartTime !== (bot.scheduleStartTime || '09:00') || scheduleEndTime !== (bot.scheduleEndTime || '18:00') || !sameSet(scheduleDays, savedScheduleDays),
        autoReplyDelayEnabled !== !!bot.autoReplyDelayEnabled || String(autoReplyDelaySeconds) !== String(bot.autoReplyDelaySeconds || 30) || autoReplyDelayMessage !== (bot.autoReplyDelayMessage || ''),
        savedReminderSteps ? JSON.stringify(reminderSteps) !== JSON.stringify(savedReminderSteps) : false,
        savedTools ? !sameSet(enabledTools, savedTools) : false,
        routingConfig.routingEnabled !== !!bot.routingEnabled
    ].filter(Boolean).length;

    const navItems = [
        { key: 'channels', icon: <Zap size={17} />, label: 'Kimlik ve kanallar', hint: channelsLoading ? 'Yükleniyor…' : `${assignedChannelCount} kanal bağlı` },
        { key: 'prompt', icon: <FileText size={17} />, label: 'Talimat ve devir', hint: `${prompt.length.toLocaleString('tr-TR')} karakter` },
        { key: 'behaviour', icon: <Gauge size={17} />, label: 'Davranış kuralları', hint: `${behaviourRules.length} kural, ${openBehaviourCount} açık` },
        { key: 'tools', icon: <Sparkles size={17} />, label: 'Yetenekler', hint: `${enabledTools.length} / ${TOOL_LIST.length} açık` },
        { key: 'routing', icon: <GitBranch size={17} />, label: 'Yönlendirme', hint: routingConfig.routingEnabled ? 'Açık' : 'Kapalı' },
        { key: 'knowledge', icon: <BookOpen size={17} />, label: 'Bilgi bankası', hint: 'PDF ve DOCX' }
    ];
    if (bot.botType === 'APPOINTMENT') {
        navItems.push({ key: 'appointment', icon: <Calendar size={17} />, label: 'Randevu ayarları', hint: 'Bölüm ve uzmanlar' });
    }

    return (
        <div className="bm-shell">

            {/* ── Başlık ──────────────────────────────────────────── */}
            <header className="bm-head">
                <div className="bm-head-avatar">
                    {bot.botType === 'APPOINTMENT' ? <Stethoscope size={21} /> : <Bot size={21} />}
                </div>
                <div className="bm-head-id">
                    {isEditingTitle ? (
                        <div className="bm-head-edit">
                            <input
                                type="text"
                                className="input-modern input-sm"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Bot ismi"
                                autoFocus
                            />
                            <input
                                type="text"
                                className="input-modern input-sm"
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                placeholder="Departman / rol"
                            />
                        </div>
                    ) : (
                        <>
                            <div className="bm-head-name-row">
                                <h2 className="bm-head-name">{name}</h2>
                                <span className="bm-head-badge">{bot.botType === 'APPOINTMENT' ? 'Randevu Asistanı' : (role || 'AI Asistan')}</span>
                            </div>
                            <p className="bm-head-sub">
                                Mesaj asistanı
                                {!channelsLoading && <> · {assignedChannelCount} kanalda yayında</>}
                                {' · '}{enabledTools.length} yetenek açık
                            </p>
                        </>
                    )}
                </div>
                <div className="bm-head-actions">
                    <span className={`bm-status ${isActive ? 'on' : 'off'}`}>{isActive ? 'Aktif' : 'Pasif'}</span>
                    <label className="toggle-switch" title={isActive ? 'Botu pasife al' : 'Botu aktifleştir'}>
                        <input type="checkbox" checked={isActive} onChange={handleToggleStatus} />
                        <span className="toggle-slider"></span>
                    </label>
                    <span className="bm-head-sep"></span>
                    <button
                        type="button"
                        className={`bm-ico ${isEditingTitle ? 'primary' : ''}`}
                        title={isEditingTitle ? 'Tamam' : 'İsmi düzenle'}
                        onClick={() => { if (isEditingTitle) handleUpdate(); setIsEditingTitle(!isEditingTitle); }}
                    >
                        {isEditingTitle ? <Save size={15} /> : <Edit2 size={15} />}
                    </button>
                    <button type="button" className="bm-ico danger" title="Botu sil" onClick={() => onDelete(bot.id)}>
                        <Trash2 size={15} />
                    </button>
                    {onClose && (
                        <button type="button" className="bm-ico plain" title="Kapat" onClick={onClose}>
                            <X size={16} />
                        </button>
                    )}
                </div>
            </header>

            <div className="bm-body">

                {/* ── Sol ray ─────────────────────────────────────── */}
                <nav className="bm-rail" aria-label="Bot ayarları bölümleri">
                    <p className="bm-rail-eyebrow">Bot ayarları</p>
                    {navItems.map(item => (
                        <button
                            key={item.key}
                            type="button"
                            className={`bm-rail-item ${activeSection === item.key ? 'active' : ''}`}
                            aria-current={activeSection === item.key ? 'true' : undefined}
                            onClick={() => setActiveSection(item.key)}
                        >
                            <span className="bm-rail-ico">{item.icon}</span>
                            <span className="bm-rail-text">
                                <span className="bm-rail-label">{item.label}</span>
                                <span className="bm-rail-hint">{item.hint}</span>
                            </span>
                        </button>
                    ))}
                </nav>

                {/* ── İçerik ──────────────────────────────────────── */}
                <div className="bm-content">

                    {activeSection === 'channels' && (
                        <section className="bm-sec">
                            <div className="bm-sec-head">
                                <h3>Bağlı kanallar</h3>
                                <span className="bm-sec-note">Seçtiğiniz kanallarda bu bot çalışır</span>
                            </div>
                            {channelsLoading ? (
                                <div className="bm-empty"><Loader size={14} className="spin" /> Kanallar yükleniyor…</div>
                            ) : workspaceChannels.length === 0 ? (
                                <div className="bm-empty">Henüz bağlı kanal yok. Kanallar sayfasından WhatsApp, Facebook veya Instagram bağlayın.</div>
                            ) : (
                                <div className="bm-list">
                                    {workspaceChannels.map(ch => {
                                        const isAssigned = ch.assignedBotId === bot.id;
                                        const assignedToOther = ch.assignedBotId && ch.assignedBotId !== bot.id;
                                        const colorMap = { WHATSAPP: '#0f766e', FACEBOOK: '#1877F2', INSTAGRAM: '#c13584', EMAIL: '#4f46e5', WEB_WIDGET: '#0369a1' };
                                        const tintMap = { WHATSAPP: '#e9f9ef', FACEBOOK: '#eff4ff', INSTAGRAM: '#fdeef5', EMAIL: '#eef2ff', WEB_WIDGET: '#e8f4fd' };
                                        const color = colorMap[ch.type] || '#475569';
                                        const tint = tintMap[ch.type] || '#f4f5f7';
                                        const typeLabel = ch.type === 'WHATSAPP' ? 'WhatsApp' : ch.type === 'FACEBOOK' ? 'Facebook' : ch.type === 'INSTAGRAM' ? 'Instagram' : ch.type === 'EMAIL' ? 'E-posta' : 'Canlı Destek';
                                        return (
                                            <label
                                                key={`${ch.type}-${ch.id}`}
                                                className={`bm-row ${isAssigned ? 'on' : ''} ${assignedToOther ? 'muted' : ''}`}
                                                style={{ cursor: channelSaving ? 'wait' : 'pointer' }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isAssigned}
                                                    disabled={channelSaving}
                                                    onChange={() => handleChannelToggle(ch, isAssigned)}
                                                />
                                                <span className="bm-row-ico" style={{ background: tint, color }}>{ch.icon}</span>
                                                <span className="bm-row-name">{ch.name}</span>
                                                {assignedToOther && <span className="bm-row-warn">Başka bota atanmış</span>}
                                                <span className="bm-chip" style={{ background: tint, color }}>{typeLabel}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    )}

                    {activeSection === 'prompt' && (
                        <>
                            <section className="bm-sec">
                                <div className="bm-sec-head">
                                    <h3>{t('assistants.systemPrompt')}</h3>
                                    <span className="bm-sec-note">Botun kişiliği, tonu ve kuralları</span>
                                </div>
                                <textarea
                                    className="input-modern bm-textarea"
                                    rows="12"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="Örn: Sen yardımsever bir teknik destek uzmanısın. Müşterilere kibar dille yanıt ver…"
                                />
                                <div className="bm-meter">
                                    <span>{prompt.length.toLocaleString('tr-TR')} karakter</span>
                                    <span className="bm-meter-ok">Bilgi bankası ve şube listesi otomatik ekleniyor</span>
                                </div>
                            </section>

                            <section className="bm-sec">
                                <div className="bm-sec-head">
                                    <h3>Devir mesajı</h3>
                                    <span className="bm-sec-note">Bot emin olmadığında müşteriye bunu yazar</span>
                                </div>
                                <textarea
                                    className="input-modern bm-textarea"
                                    rows="3"
                                    value={handoffMessage}
                                    onChange={(e) => setHandoffMessage(e.target.value)}
                                    placeholder="Mesajınızın cevabından tam emin değilim. Bu nedenle ekibimize bilgi vereceğim, en kısa sürede size dönüş yapılacaktır…"
                                />
                                <p className="bm-hint">Boş bırakırsanız varsayılan mesaj kullanılır.</p>
                            </section>
                        </>
                    )}

                    {activeSection === 'behaviour' && (
                        <section className="bm-sec">
                            <div className="bm-sec-head">
                                <h3>Davranış kuralları</h3>
                                <span className="bm-sec-note">Bot ne zaman devreye girsin, ne zaman sussun</span>
                            </div>

                            <div className="bm-list">
                                {/* Yazışma devralma */}
                                <div className={`bm-rule ${fallbackEnabled ? 'on' : ''}`}>
                                    <div className="bm-rule-head">
                                        <span className="bm-rule-ico"><Zap size={15} /></span>
                                        <span className="bm-rule-text">
                                            <span className="bm-rule-title">Yazışma devralma</span>
                                            <span className="bm-rule-desc">Kimsenin üzerine almadığı veya yanıt verilmeyen konuşmalarda bot devralır</span>
                                        </span>
                                        <label className="toggle-switch">
                                            <input type="checkbox" checked={fallbackEnabled} onChange={(e) => setFallbackEnabled(e.target.checked)} />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    {fallbackEnabled && (
                                        <div className="bm-rule-body">
                                            <div className="bm-field">
                                                <label className="form-label-sm">Devralma kapsamı</label>
                                                <select className="input-modern input-sm" value={fallbackScope} onChange={(e) => setFallbackScope(e.target.value)}>
                                                    <option value="UNASSIGNED">Sadece atanmamış konuşmalar</option>
                                                    <option value="MY_TEAMS">Kendi takımımdaki tüm konuşmalar</option>
                                                    <option value="ALL">Tüm konuşmalar (çalışma alanı geneli)</option>
                                                </select>
                                            </div>
                                            <div className="bm-field">
                                                <label className="form-label-sm">Bekleme süresi: <strong>{fallbackDelayMinutes} dakika</strong></label>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="120"
                                                    value={fallbackDelayMinutes}
                                                    onChange={(e) => setFallbackDelayMinutes(parseInt(e.target.value))}
                                                />
                                                <div className="bm-scale"><span>1 dk</span><span>30 dk</span><span>60 dk</span><span>120 dk</span></div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Zamanlayıcı */}
                                <div className={`bm-rule ${schedulerEnabled ? 'on' : ''}`}>
                                    <div className="bm-rule-head">
                                        <span className="bm-rule-ico"><Clock size={15} /></span>
                                        <span className="bm-rule-text">
                                            <span className="bm-rule-title">{t('assistants.scheduler')}</span>
                                            <span className="bm-rule-desc">Botun çalışacağı saatler ve günler</span>
                                        </span>
                                        <label className="toggle-switch">
                                            <input type="checkbox" checked={schedulerEnabled} onChange={(e) => setSchedulerEnabled(e.target.checked)} />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    {schedulerEnabled && (
                                        <div className="bm-rule-body">
                                            <div className="scheduler-row">
                                                <div className="bm-field">
                                                    <label className="form-label-sm">{t('assistants.startTime')}</label>
                                                    <input type="time" className="input-modern input-sm" value={scheduleStartTime} onChange={(e) => setScheduleStartTime(e.target.value)} />
                                                </div>
                                                <div className="bm-field">
                                                    <label className="form-label-sm">Bitiş saati</label>
                                                    <input type="time" className="input-modern input-sm" value={scheduleEndTime} onChange={(e) => setScheduleEndTime(e.target.value)} />
                                                </div>
                                            </div>
                                            <div className="scheduler-row">
                                                <div className="bm-field">
                                                    <label className="form-label-sm">Başlangıç tarihi (opsiyonel)</label>
                                                    <input type="date" className="input-modern input-sm" value={scheduleStartDate} onChange={(e) => setScheduleStartDate(e.target.value)} />
                                                </div>
                                                <div className="bm-field">
                                                    <label className="form-label-sm">Bitiş tarihi (opsiyonel)</label>
                                                    <input type="date" className="input-modern input-sm" value={scheduleEndDate} onChange={(e) => setScheduleEndDate(e.target.value)} />
                                                </div>
                                            </div>
                                            <div className="bm-field">
                                                <label className="form-label-sm">Aktif günler</label>
                                                <div className="days-selector">
                                                    {daysOfWeek.map(day => (
                                                        <button
                                                            key={day.key}
                                                            type="button"
                                                            className={`day-btn ${scheduleDays.includes(day.key) ? 'active' : ''}`}
                                                            onClick={() => toggleDay(day.key)}
                                                        >
                                                            {day.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="bm-hint">Hiçbiri seçilmezse her gün aktif olur.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Otomatik yanıt gecikmesi */}
                                <div className={`bm-rule ${autoReplyDelayEnabled ? 'on' : ''}`}>
                                    <div className="bm-rule-head">
                                        <span className="bm-rule-ico"><Timer size={15} /></span>
                                        <span className="bm-rule-text">
                                            <span className="bm-rule-title">Otomatik yanıt gecikmesi</span>
                                            <span className="bm-rule-desc">Müşteri mesajına bu süre içinde yanıt verilmezse bot yazar</span>
                                        </span>
                                        <label className="toggle-switch">
                                            <input type="checkbox" checked={autoReplyDelayEnabled} onChange={(e) => setAutoReplyDelayEnabled(e.target.checked)} />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    {autoReplyDelayEnabled && (
                                        <div className="bm-rule-body">
                                            <div className="bm-field">
                                                <label className="form-label-sm">Bekleme süresi (saniye)</label>
                                                <input
                                                    type="number"
                                                    className="input-modern input-sm"
                                                    min="5"
                                                    max="300"
                                                    value={autoReplyDelaySeconds}
                                                    onChange={(e) => setAutoReplyDelaySeconds(parseInt(e.target.value) || 30)}
                                                    style={{ width: '120px' }}
                                                />
                                            </div>
                                            <div className="bm-field">
                                                <label className="form-label-sm">Otomatik mesaj (opsiyonel)</label>
                                                <textarea
                                                    className="input-modern bm-textarea"
                                                    rows="2"
                                                    value={autoReplyDelayMessage}
                                                    onChange={(e) => setAutoReplyDelayMessage(e.target.value)}
                                                    placeholder="Boş bırakılırsa AI yanıtı gönderilir. Özel mesaj için buraya yazın…"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Akıllı hatırlatma kademeleri */}
                                <div className={`bm-rule ${reminderSteps.some(s => s.enabled) ? 'on' : ''}`}>
                                    <div className="bm-rule-head">
                                        <span className="bm-rule-ico"><AlertCircle size={15} /></span>
                                        <span className="bm-rule-text">
                                            <span className="bm-rule-title">Akıllı hatırlatma kademeleri</span>
                                            <span className="bm-rule-desc">Müşteri yanıt vermezse bot konuşmaya uygun hatırlatma üretir</span>
                                        </span>
                                        <span className="bm-count">{reminderSteps.filter(s => s.enabled).length} / {reminderSteps.length}</span>
                                    </div>
                                    <div className="bm-rule-body">
                                        <div className="bm-steps">
                                            {reminderSteps.map((step, idx) => (
                                                <div key={idx} className={`bm-step ${step.enabled ? 'on' : ''}`}>
                                                    <label className="toggle-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={step.enabled}
                                                            onChange={(e) => {
                                                                const updated = [...reminderSteps];
                                                                updated[idx] = { ...updated[idx], enabled: e.target.checked };
                                                                setReminderSteps(updated);
                                                            }}
                                                        />
                                                        <span className="toggle-slider"></span>
                                                    </label>
                                                    <span className="bm-step-name">Kademe {idx + 1}</span>
                                                    <input
                                                        type="number"
                                                        className="input-modern input-sm"
                                                        min="1"
                                                        max="999"
                                                        value={step.delayMinutes < 1440 ? Math.max(1, Math.round(step.delayMinutes / 60)) : Math.round(step.delayMinutes / 1440)}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 1;
                                                            const unit = step.delayMinutes < 1440 ? 'saat' : 'gun';
                                                            const minutes = unit === 'saat' ? val * 60 : val * 1440;
                                                            const updated = [...reminderSteps];
                                                            updated[idx] = { ...updated[idx], delayMinutes: minutes };
                                                            setReminderSteps(updated);
                                                        }}
                                                        style={{ width: '62px', textAlign: 'center' }}
                                                    />
                                                    <select
                                                        className="input-modern input-sm"
                                                        value={step.delayMinutes < 1440 ? 'saat' : 'gun'}
                                                        onChange={(e) => {
                                                            const unit = e.target.value;
                                                            const currentVal = step.delayMinutes < 1440 ? Math.max(1, Math.round(step.delayMinutes / 60)) : Math.round(step.delayMinutes / 1440);
                                                            const minutes = unit === 'saat' ? currentVal * 60 : currentVal * 1440;
                                                            const updated = [...reminderSteps];
                                                            updated[idx] = { ...updated[idx], delayMinutes: minutes };
                                                            setReminderSteps(updated);
                                                        }}
                                                        style={{ width: '76px' }}
                                                    >
                                                        <option value="saat">saat</option>
                                                        <option value="gun">gün</option>
                                                    </select>
                                                    <span className="bm-step-tail">sonra</span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="bm-note-ok">Her hatırlatmada bot, konuşma geçmişine göre farklı ve doğal bir mesaj üretir. Sabit mesaj yazmanız gerekmez.</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {activeSection === 'tools' && (
                        <section className="bm-sec">
                            <div className="bm-sec-head">
                                <h3>Yetenekler</h3>
                                <span className="bm-sec-note">Botun kendi başına yapabilecekleri</span>
                                <span className="bm-sec-count">{enabledTools.length} / {TOOL_LIST.length} açık</span>
                            </div>
                            <div className="bm-tools">
                                {TOOL_LIST.map(tool => {
                                    const on = enabledTools.includes(tool.key);
                                    return (
                                        <label key={tool.key} className={`bm-tool ${on ? 'on' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={on}
                                                onChange={(e) => {
                                                    if (e.target.checked) setEnabledTools(prev => [...prev, tool.key]);
                                                    else setEnabledTools(prev => prev.filter(x => x !== tool.key));
                                                }}
                                            />
                                            <span>{tool.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            <p className="bm-hint">Kapalı yetenekler bota hiç sunulmaz, yanlışlıkla kullanamaz.</p>
                        </section>
                    )}

                    {activeSection === 'routing' && (
                        <section className="bm-sec">
                            <BotRoutingSettings routingConfig={routingConfig} onChange={setRoutingConfig} />
                        </section>
                    )}

                    {activeSection === 'knowledge' && (
                        <section className="bm-sec">
                            <BotDocumentManager workspaceId={workspaceId} botId={bot.id} />
                        </section>
                    )}

                    {activeSection === 'appointment' && bot.botType === 'APPOINTMENT' && (
                        <section className="bm-sec">
                            <AppointmentBotConfig workspaceId={workspaceId} />
                        </section>
                    )}

                </div>
            </div>

            {/* ── Alt çubuk ───────────────────────────────────────── */}
            <footer className="bm-foot">
                {saveState === 'saved' ? (
                    <><span className="bm-dot ok"></span><span className="bm-foot-text">Ayarlar kaydedildi</span></>
                ) : saveState === 'error' ? (
                    <><span className="bm-dot err"></span><span className="bm-foot-text err">Kaydedilemedi, tekrar deneyin</span></>
                ) : pendingChanges > 0 ? (
                    <><span className="bm-dot warn"></span><span className="bm-foot-text">{pendingChanges} değişiklik kaydedilmedi</span></>
                ) : (
                    <><span className="bm-dot idle"></span><span className="bm-foot-text">Tüm değişiklikler kaydedildi</span></>
                )}
                <span className="bm-foot-gap"></span>
                {onClose && <button type="button" className="bm-btn" onClick={onClose}>Kapat</button>}
                <button type="button" className="bm-btn primary" onClick={handleUpdate} disabled={updating}>
                    <Save size={14} />
                    {updating ? 'Kaydediliyor…' : 'Tüm ayarları kaydet'}
                </button>
            </footer>
        </div>
    );
};


const BotModal = ({ isOpen, onClose, bot, workspaceId, automationsList, onRefresh, onDelete }) => {
    if (!isOpen) return null;
    return (
        <div className="bm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bm-modal" onMouseDown={(e) => e.stopPropagation()}>
                <BotItem
                    bot={bot}
                    workspaceId={workspaceId}
                    onRefresh={onRefresh}
                    automationsList={automationsList}
                    onDelete={onDelete}
                    onClose={onClose}
                />
            </div>
        </div>
    );
};

export default BotModal;
