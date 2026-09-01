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
const BotItem = ({ bot, workspaceId, onDelete, onRefresh, automationsList }) => {
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
    const [updating, setUpdating] = useState(false);

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
                // Built-in tools
                enabledTools: JSON.stringify(enabledTools)
            });
            alert('Bot ayarları güncellendi!');
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Update bot error:', error);
            alert('Güncelleme başarısız.');
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className="bot-card">
            <div className="bot-card-header">
                <div className="bot-info">
                <div className="bot-avatar">
                    {bot.botType === 'APPOINTMENT' ? <Stethoscope size={18} /> : <Bot size={18} />}
                </div>
                    <div className="bot-title-group">
                        {isEditingTitle ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <input
                                    type="text"
                                    className="input-modern"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Bot İsmi"
                                    style={{ padding: '3px 8px', fontSize: '13px', height: 'auto' }}
                                    autoFocus
                                />
                                <input
                                    type="text"
                                    className="input-modern"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    placeholder="Departman/Rol"
                                    style={{ padding: '2px 8px', fontSize: '11px', height: 'auto' }}
                                />
                            </div>
                        ) : (
                            <>
                                <h4>{name}</h4>
                                <span className="bot-role-badge">{bot.botType === 'APPOINTMENT' ? '🏥 Randevu Asistanı' : role}</span>
                            </>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: isActive ? '#10b981' : '#94a3b8' }}>
                            {isActive ? 'Aktif' : 'Pasif'}
                        </span>
                        <label className="toggle-switch" title={isActive ? "Botu Pasife Al" : "Botu Aktifleştir"}>
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={handleToggleStatus}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>
                    <button
                        className={`btn-modern ${isEditingTitle ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => {
                            if (isEditingTitle) {
                                handleUpdate();
                            }
                            setIsEditingTitle(!isEditingTitle);
                        }}
                        title={isEditingTitle ? "Tamam" : "İsmi Düzenle"}
                        style={{ padding: '6px' }}
                    >
                        {isEditingTitle ? <Save size={15} /> : <Edit2 size={15} />}
                    </button>
                    <button
                        className="btn-modern btn-outline-danger"
                        onClick={() => onDelete(bot.id)}
                        title="Botu Sil"
                        style={{ padding: '6px' }}
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            </div>

            {/* Bağlı Kanallar — Checkbox ile bot atama */}
            <div style={{ marginTop: '15px', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: '12px', fontSize: '13px', fontWeight: '500', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📡 Bağlı Kanallar
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>(Seçtiğiniz kanallarda bu bot çalışır)</span>
                </div>
                {channelsLoading ? (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                        <Loader size={14} className="spin" style={{ marginRight: '6px' }} /> Kanallar yükleniyor...
                    </div>
                ) : workspaceChannels.length === 0 ? (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                        Henüz bağlı kanal yok. Kanallar sayfasından WhatsApp, Facebook veya Instagram bağlayın.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {workspaceChannels.map(ch => {
                            const isAssigned = ch.assignedBotId === bot.id;
                            const assignedToOther = ch.assignedBotId && ch.assignedBotId !== bot.id;
                            const colorMap = {
                                'WHATSAPP': '#25D366',
                                'FACEBOOK': '#1877F2',
                                'INSTAGRAM': '#E4405F',
                                'EMAIL': '#6366f1',
                                'WEB_WIDGET': '#0ea5e9'
                            };
                            const color = colorMap[ch.type] || '#64748b';
                            return (
                                <label
                                    key={`${ch.type}-${ch.id}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        cursor: channelSaving ? 'wait' : 'pointer',
                                        background: isAssigned ? `${color}10` : '#fff',
                                        border: `1px solid ${isAssigned ? color : '#e2e8f0'}`,
                                        transition: 'all 0.2s',
                                        opacity: assignedToOther ? 0.5 : 1
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isAssigned}
                                        disabled={channelSaving}
                                        onChange={() => handleChannelToggle(ch, isAssigned)}
                                        style={{ width: '16px', height: '16px', accentColor: color, cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '16px' }}>{ch.icon}</span>
                                    <span style={{ fontSize: '13px', fontWeight: isAssigned ? '600' : '400', color: isAssigned ? '#1e293b' : '#64748b', flex: 1 }}>
                                        {ch.name}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>
                                        {ch.type === 'WHATSAPP' ? 'WhatsApp' : ch.type === 'FACEBOOK' ? 'Facebook' : ch.type === 'INSTAGRAM' ? 'Instagram' : ch.type === 'EMAIL' ? 'E-posta' : 'Canlı Destek'}
                                    </span>
                                    {assignedToOther && (
                                        <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '500' }}>Başka bota atanmış</span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">{t('assistants.systemPrompt')}</label>
                <textarea
                    className="input-modern"
                    rows="4"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Örn: Sen yardımsever bir teknik destek uzmanısın. Müşterilere kibar dille yanıt ver..."
                />
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageSquare size={14} />
                    {t('assistants.handoffMessage', 'Handoff Mesajı')}
                </label>
                <p className="section-description" style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#888' }}>
                    Bot cevabından emin olmadığında müşteriye gönderilecek mesaj. Boş bırakırsanız varsayılan mesaj kullanılır.
                </p>
                <textarea
                    className="input-modern"
                    rows="3"
                    value={handoffMessage}
                    onChange={(e) => setHandoffMessage(e.target.value)}
                    placeholder="Mesajınızın cevabından tam emin değilim. Bu nedenle ekibimize bilgi vereceğim, en kısa sürede size dönüş yapılacaktır..."
                    style={{ fontSize: '13px' }}
                />
            </div>

            {/* Scheduler Section */}
            <div className="bot-settings-section">
                <div className="section-header-toggle">
                    <div className="section-title-group">
                        <Clock size={18} />
                        <span>{t('assistants.scheduler')}</span>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={schedulerEnabled}
                            onChange={(e) => setSchedulerEnabled(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                {schedulerEnabled && (
                    <div className="section-content">
                        <p className="section-description">{t('assistants.schedulerDesc')}</p>

                        <div className="scheduler-row">
                            <div className="form-group">
                                <label className="form-label-sm">{t('assistants.startTime')}</label>
                                <input
                                    type="time"
                                    className="input-modern input-sm"
                                    value={scheduleStartTime}
                                    onChange={(e) => setScheduleStartTime(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label-sm">Bitiş Saati</label>
                                <input
                                    type="time"
                                    className="input-modern input-sm"
                                    value={scheduleEndTime}
                                    onChange={(e) => setScheduleEndTime(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="scheduler-row">
                            <div className="form-group">
                                <label className="form-label-sm">Başlangıç Tarihi (Opsiyonel)</label>
                                <input
                                    type="date"
                                    className="input-modern input-sm"
                                    value={scheduleStartDate}
                                    onChange={(e) => setScheduleStartDate(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label-sm">Bitiş Tarihi (Opsiyonel)</label>
                                <input
                                    type="date"
                                    className="input-modern input-sm"
                                    value={scheduleEndDate}
                                    onChange={(e) => setScheduleEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label-sm">Active Günler</label>
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
                            <p className="text-muted text-xs" style={{ marginTop: '4px' }}>Hiçbiri seçilmezse her gün aktif olur.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Auto-Reply Delay Section */}
            <div className="bot-settings-section">
                <div className="section-header-toggle">
                    <div className="section-title-group">
                        <Timer size={18} />
                        <span>Otomatik Yanıt Gecikmesi</span>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={autoReplyDelayEnabled}
                            onChange={(e) => setAutoReplyDelayEnabled(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
                {autoReplyDelayEnabled && (
                    <div className="section-content">
                        <p className="section-description">Müşteri mesajına belirlenen süre içinde yanıt verilmezse otomatik mesaj gönderilir.</p>

                        <div className="form-group">
                            <label className="form-label-sm">Bekleme Süresi (Saniye)</label>
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

                        <div className="form-group">
                            <label className="form-label-sm">Otomatik Mesaj (Opsiyonel)</label>
                            <textarea
                                className="input-modern"
                                rows="2"
                                value={autoReplyDelayMessage}
                                onChange={(e) => setAutoReplyDelayMessage(e.target.value)}
                                placeholder="Boş bırakılırsa AI yanıtı gönderilir. Özel mesaj için buraya yazın..."
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* 5-Step Smart Reminder System */}
            <div className="bot-settings-section">
                <div className="section-header-toggle">
                    <div className="section-title-group">
                        <AlertCircle size={18} />
                        <span>Akıllı Hatırlatma Kademeleri</span>
                    </div>
                </div>
                <div className="section-content">
                    <p className="section-description" style={{ marginBottom: '12px' }}>
                        Müşteri yanıt vermezse, bot otomatik olarak <strong>konuşma bağlamına uygun</strong> hatırlatma mesajları üretir.
                        Amacını gerçekleştirmiş veya planlanmış görüşmesi olan kişilere mesaj gönderilmez.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {reminderSteps.map((step, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: `1px solid ${step.enabled ? '#c7d2fe' : '#e2e8f0'}`,
                                background: step.enabled ? '#eef2ff' : '#f8fafc',
                                transition: 'all 0.2s'
                            }}>
                                <label className="toggle-switch" style={{ flexShrink: 0 }}>
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
                                <span style={{ fontSize: '13px', fontWeight: 600, color: step.enabled ? '#4338ca' : '#94a3b8', minWidth: '80px' }}>
                                    Kademe {idx + 1}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                                        style={{ width: '65px', textAlign: 'center' }}
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
                                        style={{ width: '70px', fontSize: '12px', padding: '4px 6px' }}
                                    >
                                        <option value="saat">saat</option>
                                        <option value="gun">gün</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '12px', color: '#15803d', lineHeight: '1.5' }}>
                        <strong>✨ AI Otomatik Mesaj:</strong> Her hatırlatmada bot, konuşma geçmişine ve talimatlarına göre farklı, doğal mesajlar üretir. Sabit mesaj yazmanıza gerek yoktur.
                    </div>
                </div>
            </div>

            {/* Built-in Tools Toggle Section */}
            <div className="bot-settings-section">
                <div className="section-header-toggle">
                    <div className="section-title-group">
                        <Zap size={18} />
                        <span>Bot Yetenekleri (Araçlar)</span>
                    </div>
                </div>
                <div className="section-content">
                    <p className="section-description" style={{ marginBottom: '12px' }}>
                        Botun kullanabileceği yerleşik araçları açıp kapatabilirsiniz. Kapalı araçlar AI&apos;a sunulmaz.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                        {[
                            { key: 'transfer_to_team', icon: '🔄', label: 'Takıma Devret' },
                            { key: 'change_funnel_stage', icon: '📊', label: 'Huni Aşaması Değiştir' },
                            { key: 'send_whatsapp_template', icon: '💬', label: 'WhatsApp Şablon Gönder' },
                            { key: 'recommend_product', icon: '🛍️', label: 'Ürün Öner' },
                            { key: 'create_order', icon: '🛒', label: 'Sipariş Oluştur' },
                            { key: 'send_payment_link', icon: '💳', label: 'Ödeme Linki Gönder' },
                            { key: 'create_appointment', icon: '📅', label: 'Randevu Oluştur' },
                            { key: 'send_location', icon: '📍', label: 'Konum Gönder' },
                            { key: 'add_note', icon: '📝', label: 'Not Ekle' },
                            { key: 'add_tag', icon: '🏷️', label: 'Etiket Ekle' },
                            { key: 'check_stock', icon: '📦', label: 'Stok Kontrol' }
                        ].map(tool => (
                            <label key={tool.key} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 12px',
                                borderRadius: '10px',
                                border: `1px solid ${enabledTools.includes(tool.key) ? '#c7d2fe' : '#e2e8f0'}`,
                                background: enabledTools.includes(tool.key) ? '#eef2ff' : '#f8fafc',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                userSelect: 'none'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={enabledTools.includes(tool.key)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setEnabledTools(prev => [...prev, tool.key]);
                                        } else {
                                            setEnabledTools(prev => prev.filter(t => t !== tool.key));
                                        }
                                    }}
                                    style={{ accentColor: '#6366f1', width: '15px', height: '15px', flexShrink: 0 }}
                                />
                                <span style={{ fontSize: '13px', fontWeight: enabledTools.includes(tool.key) ? 600 : 400, color: enabledTools.includes(tool.key) ? '#4338ca' : '#64748b' }}>
                                    {tool.icon} {tool.label}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* Routing Settings Section */}
            <div className="bot-settings-section" style={{ marginTop: '15px' }}>
                <BotRoutingSettings
                    routingConfig={routingConfig}
                    onChange={setRoutingConfig}
                />
            </div>

            {/* Appointment Bot Config — Branş & Doktor Yönetimi */}
            {bot.botType === 'APPOINTMENT' && (
                <AppointmentBotConfig workspaceId={workspaceId} />
            )}



            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', marginBottom: '16px' }}>
                <button
                    className="btn-modern btn-primary"
                    onClick={handleUpdate}
                    disabled={updating}
                    style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                    <Save size={14} />
                    {updating ? 'Kaydediliyor...' : 'Tüm Ayarları Kaydet'}
                </button>
            </div>

            <BotDocumentManager workspaceId={workspaceId} botId={bot.id} />
        </div>
    );
};


const BotModal = ({ isOpen, onClose, bot, workspaceId, automationsList, onRefresh, onDelete }) => {
    if (!isOpen) return null;
    return (
        <div className="ut-modal-overlay">
            <div className="ut-modal ut-modal-wide" style={{ width: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '0', position: 'relative' }}>
                <button 
                    onClick={onClose} 
                    style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', cursor: 'pointer', zIndex: 10 }}
                >
                    <X size={20} color="#6b7280" />
                </button>
                <div style={{ padding: '24px' }}>
                    <BotItem 
                        bot={bot} 
                        workspaceId={workspaceId} 
                        onRefresh={onRefresh} 
                        automationsList={automationsList} 
                        onDelete={onDelete}
                    />
                </div>
            </div>
        </div>
    );
};

export default BotModal;
