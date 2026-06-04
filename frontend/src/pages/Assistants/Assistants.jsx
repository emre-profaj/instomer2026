import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { aiAPI, workspaceAPI, automationAPI, retellAPI, facebookAPI, whatsappAPI, emailAPI, formWebhookAPI, webWidgetAPI, teamAPI } from '../../services/api';
import { Plus, Trash2, Bot, FileText, Upload, Save, X, Clock, Timer, AlertCircle, Gauge, GitBranch, Edit2, Zap, Stethoscope, Phone, Mic, Wand2, ChevronRight, ChevronLeft, Languages, MessageSquare, Shield, Eye, Sparkles, ClipboardList, Key, Loader, CheckCircle, RefreshCw, PhoneCall, Calendar, BookOpen, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

import AppointmentBotConfig from '../../components/Settings/AppointmentBotConfig';
import './Assistants.css';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';

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
    const [updating, setUpdating] = useState(false);

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

    // Auto-reply delay states
    const [autoReplyDelayEnabled, setAutoReplyDelayEnabled] = useState(bot.autoReplyDelayEnabled || false);
    const [autoReplyDelaySeconds, setAutoReplyDelaySeconds] = useState(bot.autoReplyDelaySeconds || 30);
    const [autoReplyDelayMessage, setAutoReplyDelayMessage] = useState(bot.autoReplyDelayMessage || '');

    // 5-Step Smart Reminder System
    const [reminderSteps, setReminderSteps] = useState(() => {
        try {
            if (bot.reminderSteps) return JSON.parse(bot.reminderSteps);
        } catch (e) {}
        // Legacy migration: convert old fields
        if (bot.inactivityWarningEnabled || bot.dailyReminderEnabled) {
            return [
                { enabled: bot.inactivityWarningEnabled || false, delayMinutes: Math.round((bot.inactivityWarningSeconds || 40) / 60) || 1 },
                { enabled: bot.dailyReminderEnabled || false, delayMinutes: (bot.dailyReminderHours || 24) * 60 },
                { enabled: false, delayMinutes: 180 },
                { enabled: false, delayMinutes: 300 },
                { enabled: false, delayMinutes: 1200 }
            ];
        }
        return [
            { enabled: true, delayMinutes: 6 },
            { enabled: true, delayMinutes: 60 },
            { enabled: false, delayMinutes: 180 },
            { enabled: false, delayMinutes: 300 },
            { enabled: false, delayMinutes: 1200 }
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
        setAutoReplyDelayEnabled(bot.autoReplyDelayEnabled || false);
        setAutoReplyDelaySeconds(bot.autoReplyDelaySeconds || 30);
        setAutoReplyDelayMessage(bot.autoReplyDelayMessage || '');
        try {
            if (bot.reminderSteps) setReminderSteps(JSON.parse(bot.reminderSteps));
            else if (bot.inactivityWarningEnabled || bot.dailyReminderEnabled) {
                setReminderSteps([
                    { enabled: bot.inactivityWarningEnabled || false, delayMinutes: Math.round((bot.inactivityWarningSeconds || 40) / 60) || 1 },
                    { enabled: bot.dailyReminderEnabled || false, delayMinutes: (bot.dailyReminderHours || 24) * 60 },
                    { enabled: false, delayMinutes: 180 },
                    { enabled: false, delayMinutes: 300 },
                    { enabled: false, delayMinutes: 1200 }
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
                automations: selectedAutomations.length > 0 ? selectedAutomations : null
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

            {/* Bot Assignment Info - Tüm atamalar */}
            {bot.assignments && (
                <div className="bot-assignments-section">
                    <label className="form-label" style={{ marginBottom: '10px' }}>📍 Atanan Channels</label>
                    <div className="assignments-list">
                        {/* DM Kanalları - Yönlendirme sayfasından */}
                        {bot.assignments.routedChannels?.facebook?.length > 0 && bot.assignments.routedChannels.facebook.map(a => (
                            <span key={a.id} className="assignment-badge facebook">💬 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.instagram?.length > 0 && bot.assignments.routedChannels.instagram.map(a => (
                            <span key={a.id} className="assignment-badge instagram">📸 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.whatsapp?.length > 0 && bot.assignments.routedChannels.whatsapp.map(a => (
                            <span key={a.id} className="assignment-badge whatsapp">📱 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.email?.length > 0 && bot.assignments.routedChannels.email.map(a => (
                            <span key={a.id} className="assignment-badge email">📧 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.webWidget?.length > 0 && bot.assignments.routedChannels.webWidget.map(a => (
                            <span key={a.id} className="assignment-badge widget">🌐 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}
                        {bot.assignments.routedChannels?.form?.length > 0 && bot.assignments.routedChannels.form.map(a => (
                            <span key={a.id} className="assignment-badge form">📝 {a.name} {a.team && `→ ${a.team}`}</span>
                        ))}

                        {/* Yorum Kanalları - Kanallar sayfasından */}
                        {bot.assignments.facebookComments?.length > 0 && bot.assignments.facebookComments.map(a => (
                            <span key={a.id} className="assignment-badge facebook-comment">💭 FB Yorum: {a.name}</span>
                        ))}
                        {bot.assignments.instagramComments?.length > 0 && bot.assignments.instagramComments.map(a => (
                            <span key={a.id} className="assignment-badge instagram-comment">💭 IG Yorum: {a.name}</span>
                        ))}

                        {/* Hiç atama yoksa */}
                        {(!bot.assignments.routedChannels?.facebook?.length &&
                            !bot.assignments.routedChannels?.instagram?.length &&
                            !bot.assignments.routedChannels?.whatsapp?.length &&
                            !bot.assignments.routedChannels?.email?.length &&
                            !bot.assignments.routedChannels?.webWidget?.length &&
                            !bot.assignments.routedChannels?.form?.length &&
                            !bot.assignments.facebookComments?.length &&
                            !bot.assignments.instagramComments?.length) && (
                                <span className="assignment-badge info">
                                    💡 {bot.botType === 'CHATS' ? 'Kanallar → Yönlendirme' : 'Kanallar'} sayfasından atama yapın
                                </span>
                            )}
                    </div>
                </div>
            )}

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
                                        max="10000"
                                        value={step.delayMinutes}
                                        onChange={(e) => {
                                            const updated = [...reminderSteps];
                                            updated[idx] = { ...updated[idx], delayMinutes: parseInt(e.target.value) || 1 };
                                            setReminderSteps(updated);
                                        }}
                                        style={{ width: '75px', textAlign: 'center' }}
                                    />
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>dakika</span>
                                </div>
                                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
                                    {step.delayMinutes < 60 ? `${step.delayMinutes} dk` :
                                     step.delayMinutes < 1440 ? `${(step.delayMinutes / 60).toFixed(1)} saat` :
                                     `${(step.delayMinutes / 1440).toFixed(1)} gün`}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '12px', color: '#15803d', lineHeight: '1.5' }}>
                        <strong>✨ AI Otomatik Mesaj:</strong> Her hatırlatmada bot, konuşma geçmişine ve talimatlarına göre farklı, doğal mesajlar üretir. Sabit mesaj yazmanıza gerek yoktur.
                    </div>
                </div>
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

const RetellAgentItem = ({ agent, workspaceId }) => {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [agentDetail, setAgentDetail] = useState(null);
    const [llmDetail, setLlmDetail] = useState(null);

    // Edit fields
    const [agentName, setAgentName] = useState(agent.agent_name || '');
    const [generalPrompt, setGeneralPrompt] = useState('');
    const [beginMessage, setBeginMessage] = useState('');

    const handleToggleExpand = async () => {
        if (!isExpanded) {
            setIsExpanded(true);
            if (!agentDetail) {
                try {
                    setLoading(true);
                    const res = await retellAPI.getAgent(workspaceId, agent.agent_id);
                    setAgentDetail(res.data.agent);
                    setLlmDetail(res.data.llm);
                    setAgentName(res.data.agent?.agent_name || agent.agent_name || '');
                    setGeneralPrompt(res.data.llm?.general_prompt || '');
                    setBeginMessage(res.data.llm?.begin_message || '');
                } catch (error) {
                    console.error('Error fetching Retell agent details:', error);
                    alert('Asistan detayları yüklenemedi.');
                    setIsExpanded(false);
                } finally {
                    setLoading(false);
                }
            }
        } else {
            setIsExpanded(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await retellAPI.updateAgentPrompt(workspaceId, agent.agent_id, {
                agentName,
                generalPrompt,
                beginMessage
            });
            alert('Arama asistanı başarıyla güncellendi!');
            setIsExpanded(false);
            agent.agent_name = agentName;
        } catch (error) {
            console.error('Error updating Retell agent:', error);
            alert(error.response?.data?.error || 'Asistan güncellenemedi.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bot-card" style={{ borderLeft: '3px solid #0d9488' }}>
            <div className="bot-card-header">
                <div className="bot-info">
                    <div className="bot-avatar" style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)' }}>
                        <Phone size={18} />
                    </div>
                    <div className="bot-title-group">
                        <h4>{agentName || agent.agent_name}</h4>
                        <span className="bot-role-badge">📞 Arama Asistanı (Voice)</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span className={`status-badge ${agent.is_published ? 'active' : ''}`} style={{
                        backgroundColor: agent.is_published ? '#ccfbf1' : '#f1f5f9',
                        color: agent.is_published ? '#0f766e' : '#64748b',
                        border: agent.is_published ? '1px solid #99f6e4' : '1px solid #cbd5e1',
                        marginLeft: '6px'
                    }}>
                        {agent.is_published ? 'Aktif (Published)' : 'Draft'}
                    </span>
                    <button
                        className="btn-modern btn-outline-primary"
                        onClick={handleToggleExpand}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                        {isExpanded ? 'Kapat' : 'Düzenle'}
                    </button>
                </div>
            </div>
            
            <div className="bot-assignments-section" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', wordBreak: 'break-all' }}>
                    <strong>Agent ID:</strong> {agent.agent_id}
                </span>
            </div>

            {isExpanded && (
                <div className="retell-agent-details-body" style={{ padding: '16px 18px 20px 18px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>Detaylar yükleniyor...</div>
                    ) : (
                        <>
                            <div className="form-group" style={{ marginBottom: '14px', paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
                                <label className="form-label">Asistan Adı</label>
                                <input
                                    type="text"
                                    className="input-modern"
                                    value={agentName}
                                    onChange={(e) => setAgentName(e.target.value)}
                                    placeholder="Arama Asistanı Adı"
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '14px', paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
                                <label className="form-label">Sistem Talimatı (Prompt)</label>
                                <textarea
                                    className="input-modern"
                                    rows="6"
                                    value={generalPrompt}
                                    onChange={(e) => setGeneralPrompt(e.target.value)}
                                    placeholder="Sen bir telefon asistanısın. Müşterilere hitap ederken..."
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '20px', paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
                                <label className="form-label">Başlangıç Mesajı (Greeting/Begin Message)</label>
                                <input
                                    type="text"
                                    className="input-modern"
                                    value={beginMessage}
                                    onChange={(e) => setBeginMessage(e.target.value)}
                                    placeholder="Merhaba, ben Instomer asistanı. Nasıl yardımcı olabilirim?"
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button 
                                    className="btn-modern btn-outline-danger" 
                                    style={{ border: '1px solid #d1d5db', color: '#374151', padding: '8px 16px', fontSize: '13px' }} 
                                    onClick={() => setIsExpanded(false)}
                                >
                                    İptal
                                </button>
                                <button 
                                    className="btn-modern btn-primary" 
                                    style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)', padding: '8px 16px', fontSize: '13px' }}
                                    onClick={handleSave}
                                    disabled={saving}
                                >
                                    <Save size={14} />
                                    {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};


// ==================== BOT WIZARD ====================
const BotWizard = ({ isOpen, onClose, onComplete, workspaceId }) => {
    const [step, setStep] = useState(1);
    const totalSteps = 5;

    // Step 1: Identity
    const [wizName, setWizName] = useState('');
    const [wizRole, setWizRole] = useState('Satış');
    const [wizPurpose, setWizPurpose] = useState('');

    // Step 2: Behavior
    const [wizTone, setWizTone] = useState('professional');
    const [wizLanguages, setWizLanguages] = useState(['Türkçe']);

    // Step 3: Data collection
    const [wizFields, setWizFields] = useState(['İsim', 'Telefon']);

    // Step 4: Boundaries
    const [wizRestrictions, setWizRestrictions] = useState('');

    // Step 5: Preview (generated prompt)
    const [wizPrompt, setWizPrompt] = useState('');

    const toneOptions = [
        { key: 'friendly', label: '😊 Samimi / Sıcak', desc: 'Emoji kullanır, "sen" dili, rahat üslup' },
        { key: 'professional', label: '👔 Profesyonel / Ciddi', desc: 'Resmi dil, kısa ve net yanıtlar' },
        { key: 'corporate', label: '🏢 Biz Dili / Kurumsal', desc: '"Biz" zamiri, kurum adına konuşur' }
    ];

    const languageOptions = ['Türkçe', 'İngilizce', 'Almanca', 'Arapça', 'Rusça', 'Fransızca'];
    const fieldOptions = ['İsim', 'Telefon', 'E-posta', 'Adres', 'TC/Vergi No', 'Firma Adı', 'İlgilendiği Ürün/Hizmet', 'Bütçe'];

    const roleOptions = [
        { value: 'Satış', label: '💰 Satış' },
        { value: 'Destek', label: '🛠️ Destek' },
        { value: 'Randevu Alma', label: '📅 Randevu' },
        { value: 'Bilgi', label: '📚 Bilgi' },
        { value: 'Genel', label: '🤖 Genel' }
    ];

    const toggleLanguage = (lang) => {
        setWizLanguages(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
    };

    const toggleField = (field) => {
        setWizFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
    };

    const generatePrompt = () => {
        const toneLabel = toneOptions.find(t => t.key === wizTone);
        let toneInstruction = '';
        if (wizTone === 'friendly') toneInstruction = 'Samimi ve sıcak bir üslup kullan. Emoji kullanabilirsin. "Sen" dili ile konuş. Rahat ama yardımsever ol.';
        else if (wizTone === 'professional') toneInstruction = 'Profesyonel ve ciddi bir üslup kullan. Kısa, net ve resmi yanıtlar ver. Gereksiz emoji kullanma.';
        else if (wizTone === 'corporate') toneInstruction = '"Biz" zamiri kullan ve kurum adına konuş. Kurumsal ve güven veren bir dil kullan. Örnek: "Size yardımcı olmaktan memnuniyet duyarız."';

        const fieldsText = wizFields.length > 0
            ? `Müşteriden şu bilgileri topla (sırayla, doğal bir sohbet akışında):\n${wizFields.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}`
            : 'Müşteriden ek bilgi toplaman gerekmiyor.';

        const langText = wizLanguages.join(', ');

        const restrictionsText = wizRestrictions.trim()
            ? `\nSINIRLAR VE YASAKLAR:\n${wizRestrictions.trim().split('\n').map(r => `- ${r.replace(/^-\s*/, '')}`).join('\n')}`
            : '';

        const purposeText = wizPurpose.trim() ? `\nGÖREV: ${wizPurpose.trim()}` : '';

        const prompt = `Sen ${wizName || 'bir AI asistanısın'} — ${wizRole} departmanında görev yapıyorsun.${purposeText}

ÜSLUP: ${toneInstruction}

YANIT DİLLERİ: ${langText} dillerinde yanıt verebilirsin. Müşteri hangi dilde yazıyorsa o dilde yanıt ver.

BİLGİ TOPLAMA:
${fieldsText}${restrictionsText}

GENEL KURALLAR:
- Bilgi bankasında olmayan konularda spekülasyon yapma, "Bu konuda size yardımcı olamıyorum, sizi ilgili ekibe aktarayım" de.
- Her zaman yardımsever ve çözüm odaklı ol.
- Kişisel veri paylaşma, gizlilik kurallarına uy.
- Konuşmayı doğal ve akıcı tut.`;

        setWizPrompt(prompt);
    };

    const handleNext = () => {
        if (step < totalSteps) {
            if (step === 4) generatePrompt();
            setStep(step + 1);
        }
    };

    const handlePrev = () => {
        if (step > 1) setStep(step - 1);
    };

    const handleComplete = () => {
        onComplete({
            name: wizName || 'AI Asistan',
            role: wizRole,
            prompt: wizPrompt,
            botType: 'CHATS'
        });
        // Reset
        setStep(1);
        setWizName('');
        setWizRole('Satış');
        setWizPurpose('');
        setWizTone('professional');
        setWizLanguages(['Türkçe']);
        setWizFields(['İsim', 'Telefon']);
        setWizRestrictions('');
        setWizPrompt('');
    };

    if (!isOpen) return null;

    const stepLabels = ['Kimlik', 'Davranış', 'Bilgi Toplama', 'Sınırlar', 'Önizleme'];
    const stepIcons = [Bot, MessageSquare, ClipboardList, Shield, Eye];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="wizard-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="wizard-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="wizard-icon"><Wand2 size={20} /></div>
                        <div>
                            <h2>AI Agent Sihirbazı</h2>
                            <p>Adım {step}/{totalSteps} — {stepLabels[step - 1]}</p>
                        </div>
                    </div>
                    <button className="btn-icon" onClick={onClose}><X size={20} /></button>
                </div>

                {/* Progress */}
                <div className="wizard-progress">
                    {stepLabels.map((label, i) => {
                        const Icon = stepIcons[i];
                        return (
                            <div key={i} className={`wizard-step-dot ${i + 1 === step ? 'active' : ''} ${i + 1 < step ? 'done' : ''}`}>
                                <div className="dot-circle"><Icon size={14} /></div>
                                <span>{label}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Body */}
                <div className="wizard-body">
                    {step === 1 && (
                        <div className="wizard-step-content">
                            <div className="form-group">
                                <label className="form-label">Bot Adı</label>
                                <input
                                    type="text"
                                    className="input-modern"
                                    value={wizName}
                                    onChange={e => setWizName(e.target.value)}
                                    placeholder="Örn: Satış Asistanı, Destek Botu, Ayşe"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Departman / Rolü</label>
                                <div className="wizard-role-grid">
                                    {roleOptions.map(r => (
                                        <button
                                            key={r.value}
                                            type="button"
                                            className={`wizard-role-btn ${wizRole === r.value ? 'active' : ''}`}
                                            onClick={() => setWizRole(r.value)}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Amacı (Opsiyonel)</label>
                                <textarea
                                    className="input-modern"
                                    rows="2"
                                    value={wizPurpose}
                                    onChange={e => setWizPurpose(e.target.value)}
                                    placeholder="Örn: Gelen müşterilere ürünlerimizi tanıt, fiyat bilgisi ver ve iletişim bilgilerini topla"
                                />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="wizard-step-content">
                            <div className="form-group">
                                <label className="form-label">Üslup / Konuşma Tarzı</label>
                                <div className="wizard-tone-grid">
                                    {toneOptions.map(t => (
                                        <button
                                            key={t.key}
                                            type="button"
                                            className={`wizard-tone-btn ${wizTone === t.key ? 'active' : ''}`}
                                            onClick={() => setWizTone(t.key)}
                                        >
                                            <strong>{t.label}</strong>
                                            <span>{t.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label"><Languages size={16} /> Yanıt Dilleri</label>
                                <div className="wizard-chips">
                                    {languageOptions.map(lang => (
                                        <button
                                            key={lang}
                                            type="button"
                                            className={`wizard-chip ${wizLanguages.includes(lang) ? 'active' : ''}`}
                                            onClick={() => toggleLanguage(lang)}
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="wizard-step-content">
                            <div className="form-group">
                                <label className="form-label">Müşteriden Toplanacak Bilgiler</label>
                                <p className="text-muted" style={{ fontSize: '13px', marginBottom: '12px' }}>Bot sohbet sırasında bu bilgileri doğal akışta toplamaya çalışır.</p>
                                <div className="wizard-chips">
                                    {fieldOptions.map(field => (
                                        <button
                                            key={field}
                                            type="button"
                                            className={`wizard-chip ${wizFields.includes(field) ? 'active' : ''}`}
                                            onClick={() => toggleField(field)}
                                        >
                                            {wizFields.includes(field) ? '✓ ' : ''}{field}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="wizard-step-content">
                            <div className="form-group">
                                <label className="form-label"><Shield size={16} /> Yanıt Vermemesi Gereken Konular</label>
                                <p className="text-muted" style={{ fontSize: '13px', marginBottom: '12px' }}>Her satıra bir kural yazın. Bot bu konularda yanıt vermeyecek.</p>
                                <textarea
                                    className="input-modern"
                                    rows="6"
                                    value={wizRestrictions}
                                    onChange={e => setWizRestrictions(e.target.value)}
                                    placeholder={`Fiyat verme, bilgi bankasında yoksa tahmin etme
Rakip ürünler hakkında yorum yapma
Tıbbi/hukuki tavsiye verme
Kişisel görüş bildirme`}
                                />
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="wizard-step-content">
                            <div className="form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label className="form-label" style={{ margin: 0 }}><Sparkles size={16} /> Oluşturulan Prompt</label>
                                    <button
                                        className="btn-modern btn-outline-primary"
                                        style={{ fontSize: '11px', padding: '4px 10px' }}
                                        onClick={generatePrompt}
                                    >
                                        🔄 Yeniden Oluştur
                                    </button>
                                </div>
                                <p className="text-muted" style={{ fontSize: '12px', marginBottom: '8px' }}>İsterseniz düzenleyebilirsiniz — kaydetmeden önce son halini kontrol edin.</p>
                                <textarea
                                    className="input-modern wizard-prompt-preview"
                                    rows="14"
                                    value={wizPrompt}
                                    onChange={e => setWizPrompt(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="wizard-footer">
                    {step > 1 ? (
                        <button className="btn-modern btn-outline-primary" onClick={handlePrev}>
                            <ChevronLeft size={16} /> Geri
                        </button>
                    ) : <div />}

                    {step < totalSteps ? (
                        <button
                            className="btn-modern btn-primary"
                            onClick={handleNext}
                            disabled={step === 1 && !wizName.trim()}
                        >
                            İleri <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button className="btn-modern btn-primary" onClick={handleComplete} style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                            <Sparkles size={16} /> Asistanı Oluştur
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const Assistants = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [bots, setBots] = useState([]);
    const [automationsList, setAutomationsList] = useState([]);
    const [loading, setLoading] = useState(false);

    // Bot form state
    const [showAddBot, setShowAddBot] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [newBotName, setNewBotName] = useState('');
    const [newBotRole, setNewBotRole] = useState('Teknik Servis');
    const [newBotPrompt, setNewBotPrompt] = useState('Sen yardımsever bir müşteri temsilcisisin.');
    const [newWhatsappEnabled, setNewWhatsappEnabled] = useState(false);
    const [newFacebookEnabled, setNewFacebookEnabled] = useState(false);
    const [newInstagramEnabled, setNewInstagramEnabled] = useState(false);
    const [newWidgetEnabled, setNewWidgetEnabled] = useState(false);
    const [newBotType, setNewBotType] = useState('CHATS');

    // AI Usage State
    const [aiUsage, setAiUsage] = useState(null);
    const [aiUsageLoading, setAiUsageLoading] = useState(false);

    // Retell Agents State
    const [retellAgents, setRetellAgents] = useState([]);
    const [retellLoading, setRetellLoading] = useState(false);

    // Retell Settings State
    const [retellSettings, setRetellSettings] = useState({
        retellApiKey: '',
        retellAgentId: '',
        retellFromNumber: '',
        retellAutoCallEnabled: false,
        retellAutoCallTriggers: {},
        retellAutoCallDelay: 30,
        retellAutoCallSchedule: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
        aiFallbackEnabled: false,
        aiFallbackDelayMinutes: 60,
        aiFallbackPoolEnabled: false
    });
    const [retellRules, setRetellRules] = useState([]);
    const [retellSaving, setRetellSaving] = useState(false);
    const [retellMessage, setRetellMessage] = useState(null);
    const [connectedChannels, setConnectedChannels] = useState([]);
    const [teams, setTeams] = useState([]);
    const [agentConfigs, setAgentConfigs] = useState({});
    const [promptModal, setPromptModal] = useState({ open: false, agentName: '', prompt: '', loading: false });

    useEffect(() => {
        if (workspaceId) {
            loadBots();
            loadAiUsage();
            loadAutomations();
            loadRetellAgents();
            loadRetellSettings();
            loadConnectedChannels();
            loadTeams();
        }
    }, [workspaceId]);

    const loadTeams = async () => {
        if (!workspaceId) return;
        try {
            const res = await teamAPI.getWorkspaceTeams(workspaceId);
            setTeams(res.data.teams || res.data || []);
        } catch (err) {
            console.error('Error loading teams:', err);
        }
    };

    const loadRetellAgents = async () => {
        if (!workspaceId) return;
        try {
            setRetellLoading(true);
            const res = await retellAPI.getAgents(workspaceId);
            setRetellAgents(res.data.agents || []);
        } catch (error) {
            console.error('Error loading Retell agents:', error);
            setRetellAgents([]);
        } finally {
            setRetellLoading(false);
        }
    };

    const loadRetellSettings = async () => {
        if (!workspaceId) return;
        try {
            const res = await retellAPI.getSettings(workspaceId);
            const triggers = res.data.retellAutoCallTriggers || {};
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
            setRetellRules(existingRules);
            // Load per-agent configs from retellAutoCallTriggers.agentConfigs
            const savedAgentConfigs = triggers?.agentConfigs || {};
            setAgentConfigs(savedAgentConfigs);
            setRetellSettings({
                retellApiKey: '',
                retellAgentId: res.data.retellAgentId || '',
                retellFromNumber: res.data.retellFromNumber || '',
                retellAutoCallEnabled: res.data.retellAutoCallEnabled || false,
                retellAutoCallTriggers: triggers,
                retellAutoCallSchedule: res.data.retellAutoCallSchedule || { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
                aiFallbackEnabled: res.data.aiFallbackEnabled || false,
                aiFallbackDelayMinutes: res.data.aiFallbackDelayMinutes ?? 60,
                aiFallbackPoolEnabled: res.data.aiFallbackPoolEnabled || false
            });
        } catch (err) {
            console.error('Error loading Retell settings:', err);
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
            console.error('Error loading channels:', err);
        }
    };

    const handleSaveRetellSettings = async () => {
        try {
            setRetellSaving(true);
            setRetellMessage(null);
            const data = {};
            if (retellSettings.retellApiKey) data.retellApiKey = retellSettings.retellApiKey;
            if (retellSettings.retellAgentId !== undefined) data.retellAgentId = retellSettings.retellAgentId;
            if (retellSettings.retellFromNumber !== undefined) data.retellFromNumber = retellSettings.retellFromNumber;
            data.retellAutoCallEnabled = retellSettings.retellAutoCallEnabled;
            const triggers = {};
            retellRules.forEach(r => {
                if (r.source) {
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
            triggers.agentConfigs = agentConfigs;
            data.retellAutoCallTriggers = triggers;
            data.retellAutoCallSchedule = retellSettings.retellAutoCallSchedule;
            data.aiFallbackEnabled = retellSettings.aiFallbackEnabled;
            data.aiFallbackDelayMinutes = parseInt(retellSettings.aiFallbackDelayMinutes) || 60;
            data.aiFallbackPoolEnabled = retellSettings.aiFallbackPoolEnabled;
            await retellAPI.saveSettings(workspaceId, data);
            setRetellMessage({ type: 'success', text: 'Ayarlar başarıyla kaydedildi!' });
            if (retellSettings.retellApiKey) setTimeout(loadRetellAgents, 500);
        } catch (err) {
            setRetellMessage({ type: 'error', text: err.response?.data?.error || 'Kayıt başarısız' });
        } finally { setRetellSaving(false); }
    };

    const channelLabels = {
        ALL: 'Tümü', LEAD: 'Lead Ads', FACEBOOK: 'Facebook Messenger',
        INSTAGRAM: 'Instagram DM', WHATSAPP: 'WhatsApp', EMAIL: 'E-posta',
        FORM: 'Web Form', WIDGET: 'Web Widget'
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

    const addRetellRule = () => {
        if (retellRules.some(r => r.source === 'ALL')) return;
        setRetellRules([...retellRules, { source: 'ALL', delay: 30, agentId: '', status: '', callStart: '09:00', callEnd: '18:00' }]);
    };

    const removeRetellRule = (index) => {
        setRetellRules(retellRules.filter((_, i) => i !== index));
    };

    const updateRetellRuleField = (index, field, value) => {
        const newRules = [...retellRules];
        newRules[index] = { ...newRules[index], [field]: value };
        setRetellRules(newRules);
    };

    const getAvailableChannels = (currentSource) => {
        const usedSources = retellRules.map(r => r.source).filter(s => s !== currentSource);
        const available = connectedChannels.filter(ch => !usedSources.includes(ch));
        if (!usedSources.includes('ALL')) return ['ALL', ...available];
        return available;
    };

    const loadAutomations = async () => {
        if (!workspaceId) return;
        try {
            const res = await automationAPI.getAutomations(workspaceId);
            setAutomationsList(res.data.automations || []);
        } catch (error) {
            console.error('Automations load error:', error);
        }
    };

    const loadAiUsage = async () => {
        if (!workspaceId) return;
        try {
            setAiUsageLoading(true);
            const response = await workspaceAPI.getAiUsage(workspaceId);
            setAiUsage(response.data);
        } catch (error) {
            console.error('AI usage load error:', error);
            setAiUsage(null);
        } finally {
            setAiUsageLoading(false);
        }
    };

    const loadBots = async () => {
        try {
            setLoading(true);
            const res = await aiAPI.getBots(workspaceId);
            setBots(res.data.bots);
        } catch (error) {
            console.error('Error loading bots:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBot = async () => {
        if (!newBotName) return;
        try {
            await aiAPI.createBot(workspaceId, {
                name: newBotName,
                role: newBotRole,
                prompt: newBotPrompt,
                botType: newBotType
            });
            setShowAddBot(false);
            setNewBotName('');
            setNewBotPrompt('Sen yardımsever bir müşteri temsilcisisin.');
            setNewWhatsappEnabled(false);
            setNewFacebookEnabled(false);
            setNewInstagramEnabled(false);
            setNewBotType('CHATS');
            loadBots();
        } catch (error) {
            console.error('Error creating bot:', error);
            alert(error.response?.data?.error || 'Bot oluşturulurken hata oluştu.');
        }
    };

    const [confirmModalAssist, setConfirmModalAssist] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    const handleDeleteBot = async (botId) => {
        setConfirmModalAssist({
            isOpen: true,
            title: 'Asistan Sil',
            message: 'Bu asistanı silmek istediğinize emin misiniz?',
            confirmText: t('common.confirm'),
            type: 'danger',
            onConfirm: async () => {
                setConfirmModalAssist(prev => ({ ...prev, isOpen: false }));
                try {
                    await aiAPI.deleteBot(workspaceId, botId);
                    loadBots();
                } catch (error) {
                    console.error('Error deleting bot:', error);
                }
            }
        });
    };

    if (!currentWorkspace) return <div className="page-container">Lütfen bir workspace seçin.</div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">AI Assistants</h1>
                    <p className="text-muted">Müşterilerinize otomatik yanıt verecek asistanları buradan yönetin.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {!showAddBot && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                className="btn-modern btn-primary"
                                onClick={() => setShowWizard(true)}
                                style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
                            >
                                <Wand2 size={16} />
                                🧙 Sihirbaz ile Oluştur
                            </button>
                            <button
                                className="btn-modern btn-outline-primary"
                                onClick={() => setShowAddBot(true)}
                            >
                                <Plus size={18} />
                                Manuel Oluştur
                            </button>
                        </div>
                    )}
                </div>
            </div>




                    {/* AI Usage Limit Card */}
                    <div className="ai-usage-card-wrapper">
                        {aiUsageLoading ? (
                            <div className="ai-usage-card loading">
                                <div className="usage-loading">Yükleniyor...</div>
                            </div>
                        ) : aiUsage ? (
                            <div className={`ai-usage-card ${aiUsage.percentage >= 100 ? 'exceeded' : aiUsage.percentage >= 80 ? 'warning' : ''}`}>
                                <div className="usage-row">
                                    <div className="usage-left">
                                        <div className="usage-card-icon">
                                            <Gauge size={16} />
                                        </div>
                                        <span className="usage-title">AI Kullanımı</span>
                                        <span className={`usage-plan-tag ${aiUsage.subscription?.toLowerCase()}`}>
                                            {aiUsage.subscriptionName}
                                        </span>
                                    </div>
                                    <div className="usage-right">
                                        <span className="usage-numbers">
                                            <strong>{aiUsage.currentCount}</strong>
                                            <span className="usage-sep">/</span>
                                            <span>{aiUsage.limit === 999999 ? '∞' : aiUsage.limit}</span>
                                        </span>
                                        <span className="usage-remaining-pill">
                                            {aiUsage.limit === 999999 ? '∞' : aiUsage.remaining} kalan
                                        </span>
                                    </div>
                                </div>
                                {aiUsage.percentage >= 100 && (
                                    <div className="usage-alert exceeded">
                                        <AlertCircle size={14} />
                                        <span>Günlük limit doldu!</span>
                                    </div>
                                )}
                                {aiUsage.percentage >= 80 && aiUsage.percentage < 100 && (
                                    <div className="usage-alert warning">
                                        <AlertCircle size={14} />
                                        <span>Limite yaklaşıyorsunuz (%{aiUsage.percentage})</span>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>


                    <div className="assistants-content">
                        {/* Add Bot Form Overlay */}
                        {showAddBot && (
                            <div className="add-bot-form">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <h3 style={{ fontSize: '20px', fontWeight: '600' }}>New Asistan Create</h3>
                                    <button onClick={() => setShowAddBot(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                        <X size={24} color="#6b7280" />
                                    </button>
                                </div>

                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label className="form-label">Asistan Tipi</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            className={`btn-modern ${newBotType === 'CHATS' ? 'btn-primary' : 'btn-outline-primary'}`}
                                            style={{ flex: 1, padding: '10px', fontSize: '13px' }}
                                            onClick={() => {
                                                setNewBotType('CHATS');
                                                setNewBotPrompt('Sen yardımsever bir müşteri temsilcisisin.');
                                                setNewBotRole('Teknik Servis');
                                            }}
                                        >
                                            <Bot size={16} style={{ marginRight: '6px' }} />
                                            Sohbet Asistanı
                                        </button>
                                        <button
                                            type="button"
                                            className={`btn-modern ${newBotType === 'APPOINTMENT' ? 'btn-primary' : 'btn-outline-primary'}`}
                                            style={{ flex: 1, padding: '10px', fontSize: '13px' }}
                                            onClick={() => {
                                                setNewBotType('APPOINTMENT');
                                                setNewBotRole('Randevu Asistanı');
                                                setNewBotPrompt(`Sen bir randevu asistanısın. Görevin müşterilerden randevu bilgilerini toplamak ve randevu oluşturmaktır.\n\n📋 RANDEVU AKIŞI:\n1. Müşteri randevu almak istediğini belirttiğinde, nazikçe gerekli bilgileri topla\n2. Sırasıyla: Hasta adı, Telefon, Branş, Şikayet/İşlem, Doktor tercihi, Tarih/Saat\n3. Müsait saatleri kontrol et ve öner\n4. Onay alınca randevuyu oluştur\n\n⚠️ Kurallar:\n- Zaten bilinen bilgileri tekrar sorma\n- Kısa ve net ol\n- Sorun olursa insana aktar`);
                                            }}
                                        >
                                            <Stethoscope size={16} style={{ marginRight: '6px' }} />
                                            Randevu Asistanı
                                        </button>
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label className="form-label">Assistant Name</label>
                                    <input
                                        type="text"
                                        className="input-modern"
                                        value={newBotName}
                                        onChange={(e) => setNewBotName(e.target.value)}
                                        placeholder={newBotType === 'APPOINTMENT' ? 'Örn: Randevu Asistanı' : 'Örn: Satış Temsilcisi Ali'}
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label className="form-label">Rolü</label>
                                    <select
                                        className="input-modern"
                                        value={newBotRole}
                                        onChange={(e) => setNewBotRole(e.target.value)}
                                    >
                                        <option value="Teknik Servis">Teknik Servis</option>
                                        <option value="Satış">Satış</option>
                                        <option value="Bilgi">Bilgi / Info</option>
                                        <option value="Randevu Alma">Randevu Alma</option>
                                        <option value="Diğer">Diğer</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: '24px' }}>
                                    <label className="form-label">Sistem Talimatı</label>
                                    <textarea
                                        className="input-modern"
                                        rows="4"
                                        value={newBotPrompt}
                                        onChange={(e) => setNewBotPrompt(e.target.value)}
                                        placeholder="Örn: Sen nazik bir satış temsilcisisin. İnsanlarla konuşurken emojiler kullan..."
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                    <button className="btn-modern btn-outline-danger" style={{ border: '1px solid #d1d5db', color: '#374151' }} onClick={() => setShowAddBot(false)}>
                                        İptal
                                    </button>
                                    <button className="btn-modern btn-primary" onClick={handleCreateBot}>
                                        Asistanı Oluştur
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Bots Grid */}
                        {loading && !bots.length ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Loading...</div>
                        ) : bots.length === 0 && !showAddBot ? (
                            <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '16px', border: '1px dashed #d1d5db' }}>
                                <Bot size={48} color="#9ca3af" style={{ marginBottom: '16px' }} />
                                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Henüz Asistan Yok</h3>
                                <p className="text-muted" style={{ marginBottom: '24px' }}>İlk yapay zeka asistanınızı oluşturarak başlayın.</p>
                                <button className="btn-modern btn-primary" onClick={() => setShowAddBot(true)}>
                                    <Plus size={18} /> İlk Asistanı Ekle
                                </button>
                            </div>
                        ) : (
                            <div className="bots-grid">
                                {bots.map(bot => (
                                    <BotItem
                                        key={bot.id}
                                        bot={bot}
                                        workspaceId={workspaceId}
                                        onDelete={handleDeleteBot}
                                        onRefresh={loadBots}
                                        automationsList={automationsList}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Arama Asistanları (Retell) Section */}
                        <div className="retell-agents-section" style={{ marginTop: '48px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                <div style={{ 
                                    width: '32px', height: '32px', borderRadius: '8px', 
                                    background: '#ccfbf1', color: '#0f766e', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                }}>
                                    <Phone size={18} />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 }}>Arama Asistanları (AI Ses Agent)</h2>
                                    <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>Telefon aramalarını gerçekleştiren sesli yapay zeka asistanları.</p>
                                </div>
                            </div>

                            {retellMessage && (
                                <div style={{
                                    padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: retellMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
                                    color: retellMessage.type === 'success' ? '#065f46' : '#991b1b',
                                    border: `1px solid ${retellMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`
                                }}>
                                    {retellMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                    {retellMessage.text}
                                </div>
                            )}

                            {/* Genel Ayarlar Card */}
                            <div className="bot-card" style={{ borderLeft: '3px solid #0d9488', marginBottom: '16px' }}>
                                <div style={{ padding: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                        <Key size={16} style={{ color: '#0d9488' }} />
                                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Genel Bağlantı Ayarları</span>
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 14 }}>
                                        <label className="form-label">API Key</label>
                                        <input type="password" className="input-modern"
                                            value={retellSettings.retellApiKey}
                                            onChange={(e) => setRetellSettings(prev => ({ ...prev, retellApiKey: e.target.value }))}
                                            placeholder="AI Call API Key girin..."
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 14 }}>
                                        <label className="form-label">Varsayılan AI Agent</label>
                                        {retellAgents.length > 0 ? (
                                            <select className="input-modern" value={retellSettings.retellAgentId}
                                                onChange={(e) => setRetellSettings(prev => ({ ...prev, retellAgentId: e.target.value }))}>
                                                <option value="">Agent seçin...</option>
                                                {retellAgents.map(a => <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>)}
                                            </select>
                                        ) : (
                                            <input type="text" className="input-modern"
                                                value={retellSettings.retellAgentId}
                                                onChange={(e) => setRetellSettings(prev => ({ ...prev, retellAgentId: e.target.value }))}
                                                placeholder="Agent ID girin veya API key kaydedip listeden seçin"
                                            />
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Arama Numarası</label>
                                        <input type="text" className="input-modern"
                                            value={retellSettings.retellFromNumber}
                                            onChange={(e) => setRetellSettings(prev => ({ ...prev, retellFromNumber: e.target.value }))}
                                            placeholder="+905xxxxxxxxx"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Retell Agent Kartları */}
                            <div style={{ marginTop: 24, marginBottom: 24 }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e1b4b', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <PhoneCall size={16} style={{ color: '#6366f1' }} />
                                    Arama Agentları
                                </h3>
                            {retellLoading ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>
                                    <Loader size={20} className="spin" style={{ marginBottom: 8 }} />
                                    <p style={{ fontSize: '13px', margin: 0 }}>Agent'lar yükleniyor...</p>
                                </div>
                            ) : retellAgents.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', background: '#f9fafb', borderRadius: 12, border: '1px dashed #d1d5db' }}>
                                    <Phone size={32} color="#9ca3af" style={{ marginBottom: 10 }} />
                                    <p style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500, margin: 0 }}>Henüz bağlı Retell agent yok.</p>
                                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: '4px 0 0' }}>API Key kaydedip agent oluşturun.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                                    {retellAgents.map(agent => {
                                        const cfg = agentConfigs[agent.agent_id] || {};
                                        const updateCfg = (field, value) => {
                                            setAgentConfigs(prev => ({
                                                ...prev,
                                                [agent.agent_id]: { ...prev[agent.agent_id], [field]: value }
                                            }));
                                        };
                                        const toggleDay = (day) => {
                                            const currentDays = cfg.days || [0,1,2,3,4,5,6];
                                            const newDays = currentDays.includes(day)
                                                ? currentDays.filter(d => d !== day)
                                                : [...currentDays, day].sort();
                                            updateCfg('days', newDays);
                                        };
                                        const dayLabels = [
                                            { v: 1, l: 'Pzt' }, { v: 2, l: 'Sal' }, { v: 3, l: 'Çar' },
                                            { v: 4, l: 'Per' }, { v: 5, l: 'Cum' }, { v: 6, l: 'Cmt' }, { v: 0, l: 'Pzr' }
                                        ];
                                        const activeDays = cfg.days || [0,1,2,3,4,5,6];
                                        return (
                                        <div key={agent.agent_id} className="bot-card" style={{ borderLeft: '3px solid #0d9488', marginBottom: 0 }}>
                                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {/* Header */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{
                                                        width: 38, height: 38, borderRadius: 10,
                                                        background: 'linear-gradient(135deg, #ccfbf1, #99f6e4)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0
                                                    }}>
                                                        <Phone size={17} color="#0f766e" />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {agent.agent_name || 'İsimsiz Agent'}
                                                        </div>
                                                        <div style={{ fontSize: '9px', color: '#b0b0b0', fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {agent.agent_id}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Badges */}
                                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                                    <span style={{ padding: '2px 7px', borderRadius: 5, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: '10px', fontWeight: 600, color: '#0369a1' }}>Ses Agent</span>
                                                    {retellSettings.retellAgentId === agent.agent_id && (
                                                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>VARSAYILAN</span>
                                                    )}
                                                </div>

                                                {/* Prompt Göster Button */}
                                                <button
                                                    onClick={async () => {
                                                        setPromptModal({ open: true, agentName: agent.agent_name || agent.agent_id, prompt: '', loading: true });
                                                        try {
                                                            const res = await retellAPI.getAgent(workspaceId, agent.agent_id);
                                                            const llmPrompt = res.data?.llm?.general_prompt || res.data?.agent?.response_engine?.system_prompt || 'Prompt bulunamadı.';
                                                            setPromptModal(prev => ({ ...prev, prompt: llmPrompt, loading: false }));
                                                        } catch (err) {
                                                            setPromptModal(prev => ({ ...prev, prompt: 'Prompt yüklenirken hata oluştu: ' + (err.message || ''), loading: false }));
                                                        }
                                                    }}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 5,
                                                        background: 'none', border: '1px solid #e5e7eb', borderRadius: 6,
                                                        padding: '4px 10px', cursor: 'pointer',
                                                        fontSize: '11px', fontWeight: 500, color: '#6b7280',
                                                        transition: 'all 0.15s', width: '100%', justifyContent: 'center'
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.color = '#7c3aed'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280'; }}
                                                >
                                                    <Eye size={13} /> Prompt Göster
                                                </button>

                                                {/* Divider */}
                                                <div style={{ height: 1, background: '#f0f0f0', margin: '2px 0' }} />

                                                {/* Takım Atama */}
                                                <div>
                                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Takım</label>
                                                    <select
                                                        className="input-modern"
                                                        style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
                                                        value={cfg.teamId || ''}
                                                        onChange={e => updateCfg('teamId', e.target.value)}
                                                    >
                                                        <option value="">Takım seçin...</option>
                                                        {teams.map(t => (
                                                            <option key={t.id} value={t.id}>{t.name}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Çalışma Saatleri */}
                                                <div>
                                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Çalışma Saatleri</label>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <input type="time" className="input-modern"
                                                            value={cfg.callStart || '10:00'}
                                                            onChange={e => updateCfg('callStart', e.target.value)}
                                                            style={{ flex: 1, fontSize: '12px', padding: '5px 6px' }}
                                                        />
                                                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
                                                        <input type="time" className="input-modern"
                                                            value={cfg.callEnd || '21:00'}
                                                            onChange={e => updateCfg('callEnd', e.target.value)}
                                                            style={{ flex: 1, fontSize: '12px', padding: '5px 6px' }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Çalışma Günleri */}
                                                <div>
                                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Günler</label>
                                                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                                        {dayLabels.map(d => (
                                                            <button key={d.v} type="button"
                                                                onClick={() => toggleDay(d.v)}
                                                                style={{
                                                                    padding: '3px 7px', borderRadius: 5, fontSize: '10px', fontWeight: 600,
                                                                    border: activeDays.includes(d.v) ? '1px solid #6366f1' : '1px solid #e5e7eb',
                                                                    background: activeDays.includes(d.v) ? '#eef2ff' : '#fff',
                                                                    color: activeDays.includes(d.v) ? '#4338ca' : '#9ca3af',
                                                                    cursor: 'pointer', transition: 'all 0.15s'
                                                                }}
                                                            >{d.l}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            )}
                            </div>

                            {/* AI Arama Devralma Card */}
                            {retellSettings.retellAutoCallEnabled && (
                                <div className="bot-card" style={{ borderLeft: '3px solid #8b5cf6', marginBottom: '16px' }}>
                                    <div style={{ padding: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <Bot size={18} style={{ color: '#8b5cf6' }} />
                                            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e1b4b' }}>AI Arama Devralma</span>
                                        </div>
                                        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 0, marginBottom: 16 }}>AI ses agent'ı hangi arama görevlerini üstlenebilir?</p>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'default', padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                                <input type="checkbox" checked={true} disabled style={{ marginTop: 2, accentColor: '#10b981', width: 16, height: 16 }} />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#065f46' }}>Sadece Kendi Arama Görevleri</div>
                                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>AI agent'a doğrudan atanmış aramalar. Her zaman aktiftir.</div>
                                                </div>
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '12px 14px', borderRadius: 10, background: retellSettings.aiFallbackPoolEnabled ? '#eff6ff' : '#f9fafb', border: `1px solid ${retellSettings.aiFallbackPoolEnabled ? '#93c5fd' : '#e5e7eb'}` }}>
                                                <input type="checkbox" checked={retellSettings.aiFallbackPoolEnabled}
                                                    onChange={e => setRetellSettings(prev => ({ ...prev, aiFallbackPoolEnabled: e.target.checked }))}
                                                    style={{ marginTop: 2, accentColor: '#3b82f6', width: 16, height: 16 }} />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e3a5f' }}>Havuzdaki Sahipsiz Görevler</div>
                                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>Kimseye atanmamış arama görevlerini AI üstlensin.</div>
                                                </div>
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '12px 14px', borderRadius: 10, background: retellSettings.aiFallbackEnabled ? '#faf5ff' : '#f9fafb', border: `1px solid ${retellSettings.aiFallbackEnabled ? '#c4b5fd' : '#e5e7eb'}` }}>
                                                <input type="checkbox" checked={retellSettings.aiFallbackEnabled}
                                                    onChange={e => setRetellSettings(prev => ({ ...prev, aiFallbackEnabled: e.target.checked }))}
                                                    style={{ marginTop: 2, accentColor: '#8b5cf6', width: 16, height: 16 }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#3b0764' }}>Aynı Takımdaki Yapılmamış Aramalar</div>
                                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>İnsan agent süresinde aramazsa AI devreye girsin.</div>
                                                    {retellSettings.aiFallbackEnabled && (
                                                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                            <Clock size={14} color="#8b5cf6" />
                                                            <span style={{ fontSize: '12px', fontWeight: 500 }}>Bekleme:</span>
                                                            <select className="input-modern" style={{ width: 'auto' }}
                                                                value={retellSettings.aiFallbackDelayMinutes}
                                                                onChange={e => setRetellSettings(prev => ({ ...prev, aiFallbackDelayMinutes: parseInt(e.target.value) }))}>
                                                                <option value={15}>15 dakika</option>
                                                                <option value={30}>30 dakika</option>
                                                                <option value={60}>1 saat</option>
                                                                <option value={120}>2 saat</option>
                                                                <option value={180}>3 saat</option>
                                                                <option value={240}>4 saat</option>
                                                                <option value={480}>8 saat</option>
                                                                <option value={1440}>24 saat</option>
                                                            </select>
                                                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>sonra AI arar</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Arama Ayarları Kaydet */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
                                <button className="btn-modern btn-primary" onClick={handleSaveRetellSettings} disabled={retellSaving}
                                    style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)', padding: '10px 24px', fontSize: '13px' }}>
                                    {retellSaving ? <Loader size={14} className="spin" /> : <Save size={14} />}
                                    {retellSaving ? 'Kaydediliyor...' : 'Arama Ayarlarını Kaydet'}
                                </button>
                            </div>

                            {/* Agent List */}
                            {retellLoading ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Loading...</div>
                            ) : retellAgents.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '16px', border: '1px dashed #d1d5db' }}>
                                    <Phone size={36} color="#9ca3af" style={{ marginBottom: '12px' }} />
                                    <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>Yapılandırılmış arama asistanı bulunamadı.</p>
                                </div>
                            ) : (
                                <div className="bots-grid">
                                    {retellAgents.map(agent => (
                                        <RetellAgentItem key={agent.agent_id} agent={agent} workspaceId={workspaceId} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>


            {/* Spacer */}
            <div style={{ height: '100px', width: '100%' }}></div>

            <ConfirmModal
                isOpen={confirmModalAssist.isOpen}
                title={confirmModalAssist.title}
                message={confirmModalAssist.message}
                confirmText={confirmModalAssist.confirmText}
                onConfirm={confirmModalAssist.onConfirm}
                onCancel={() => setConfirmModalAssist(prev => ({ ...prev, isOpen: false }))}
                type={confirmModalAssist.type}
            />

            <BotWizard
                isOpen={showWizard}
                onClose={() => setShowWizard(false)}
                workspaceId={workspaceId}
                onComplete={async (botData) => {
                    try {
                        await aiAPI.createBot(workspaceId, botData);
                        setShowWizard(false);
                        loadBots();
                    } catch (error) {
                        console.error('Wizard bot create error:', error);
                        alert(error.response?.data?.error || 'Bot oluşturulamadı');
                    }
                }}
            />

            {/* Prompt Modal */}
            {promptModal.open && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, backdropFilter: 'blur(4px)'
                }} onClick={() => setPromptModal({ open: false, agentName: '', prompt: '', loading: false })}>
                    <div style={{
                        background: '#fff', borderRadius: 16, width: '90%', maxWidth: 620,
                        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.15)', overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: 'linear-gradient(135deg, #ede9fe, #ddd6fe)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Eye size={16} color="#7c3aed" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#111827' }}>{promptModal.agentName}</div>
                                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>Agent Prompt</div>
                                </div>
                            </div>
                            <button onClick={() => setPromptModal({ open: false, agentName: '', prompt: '', loading: false })}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                <X size={20} color="#9ca3af" />
                            </button>
                        </div>
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            {promptModal.loading ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                                    <Loader size={24} className="spin" style={{ marginBottom: 10 }} />
                                    <p style={{ margin: 0, fontSize: '13px' }}>Prompt yükleniyor...</p>
                                </div>
                            ) : (
                                <pre style={{
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                    fontSize: '13px', lineHeight: 1.7, color: '#374151',
                                    background: '#f9fafb', border: '1px solid #e5e7eb',
                                    borderRadius: 10, padding: '16px', margin: 0,
                                    fontFamily: "'Inter', -apple-system, sans-serif",
                                    maxHeight: '55vh', overflowY: 'auto'
                                }}>{promptModal.prompt}</pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Assistants;
