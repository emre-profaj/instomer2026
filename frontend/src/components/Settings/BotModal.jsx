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
    // Şube bazlı sıralı akış (çalışma alanı ayarı — anında kaydedilir)
    const [catalogFlow, setCatalogFlow] = useState(null);
    const [catalogSaving, setCatalogSaving] = useState(false);
    // Agent davranış blokları
    const [behaviorBlocks, setBehaviorBlocks] = useState(() => {
        try {
            const parsed = bot.behaviorBlocks ? (typeof bot.behaviorBlocks === 'string' ? JSON.parse(bot.behaviorBlocks) : bot.behaviorBlocks) : null;
            return parsed || { greeting: true, collectName: true, collectPhone: true, classifyNeeds: true, stageGoals: true, suggestProducts: false, shareLocation: true, admitUncertainty: true };
        } catch { return { greeting: true, collectName: true, collectPhone: true, classifyNeeds: true, stageGoals: true, suggestProducts: false, shareLocation: true, admitUncertainty: true }; }
    });
    const [tone, setTone] = useState(bot.tone || 'FRIENDLY_PRO');
    const [msgLength, setMsgLength] = useState(bot.messageLength || 'NORMAL');
    const [emojiEnabled, setEmojiEnabled] = useState(bot.emojiEnabled !== false);
    const [multilingualEnabled, setMultilingualEnabled] = useState(bot.multilingualEnabled || false);
    const [appointmentMode, setAppointmentMode] = useState(bot.appointmentMode || null);
    const [blockOrder, setBlockOrder] = useState(() => {
        try {
            const parsed = bot.blockOrder ? (typeof bot.blockOrder === 'string' ? JSON.parse(bot.blockOrder) : bot.blockOrder) : null;
            return parsed || ['greeting', 'collectName', 'collectPhone', 'askBranch', 'classifyNeeds', 'stageGoals', 'suggestProducts', 'shareLocation', 'admitUncertainty'];
        } catch { return ['greeting', 'collectName', 'collectPhone', 'askBranch', 'classifyNeeds', 'stageGoals', 'suggestProducts', 'shareLocation', 'admitUncertainty']; }
    });
    const [workingHours, setWorkingHours] = useState(() => {
        try {
            return bot.workingHours ? (typeof bot.workingHours === 'string' ? JSON.parse(bot.workingHours) : bot.workingHours) : { enabled: false, start: '09:00', end: '18:00', days: [1,2,3,4,5] };
        } catch { return { enabled: false, start: '09:00', end: '18:00', days: [1,2,3,4,5] }; }
    });
    const [outboundHours, setOutboundHours] = useState(() => {
        try {
            return bot.outboundHours ? (typeof bot.outboundHours === 'string' ? JSON.parse(bot.outboundHours) : bot.outboundHours) : { enabled: false, start: '09:00', end: '20:00', days: [1,2,3,4,5,6] };
        } catch { return { enabled: false, start: '09:00', end: '20:00', days: [1,2,3,4,5,6] }; }
    });
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
        const loadCatalogFlow = async () => {
            try {
                const res = await workspaceAPI.getCatalogFlow(workspaceId, bot.id);
                setCatalogFlow(res.data?.capability || null);
            } catch (err) {
                console.error('Failed to load catalog flow:', err);
            }
        };
        if (workspaceId) { loadChannels(); loadCatalogFlow(); }
    }, [workspaceId]);

    // Sıralı akışı aç/kapat — kaydet düğmesini beklemez
    const handleCatalogFlowToggle = async (next) => {
        setCatalogSaving(true);
        try {
            const res = await workspaceAPI.updateCatalogFlow(workspaceId, { catalogFlowEnabled: next, botId: bot.id });
            setCatalogFlow(res.data?.capability || null);
        } catch (err) {
            console.error('Catalog flow toggle error:', err);
        } finally {
            setCatalogSaving(false);
        }
    };

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
                enabledTools: JSON.stringify(enabledTools),
                // Agent davranış blokları
                behaviorBlocks,
                blockOrder: JSON.stringify(blockOrder),
                workingHours: JSON.stringify(workingHours),
                outboundHours: JSON.stringify(outboundHours),
                tone,
                messageLength: msgLength,
                emojiEnabled,
                multilingualEnabled,
                appointmentMode,
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
    const catalogFlowOn = catalogFlow ? (catalogFlow.flag === null ? catalogFlow.auto : catalogFlow.flag) : false;
    const behaviourRules = [catalogFlowOn, fallbackEnabled, schedulerEnabled, autoReplyDelayEnabled, reminderSteps.some(s => s.enabled)];
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

    const BLOCK_LABELS = {
        greeting: { emoji: '👋', label: 'Karşılama ve selamlama' },
        collectName: { emoji: '📋', label: 'Kişisel bilgileri al' },
        collectPhone: { emoji: '📞', label: 'İletişim bilgilerini al' },
        askBranch: { emoji: '🏢', label: 'Şube tercihi sor' },
        classifyNeeds: { emoji: '🏷️', label: 'İhtiyacı anla ve sınıflandır' },
        stageGoals: { emoji: '📈', label: 'Aşama bazlı satış hedefleri' },
        suggestProducts: { emoji: '🛍️', label: 'Aktif ürün/hizmet öner' },
        shareLocation: { emoji: '📍', label: 'Konum ve adres paylaş' },
        admitUncertainty: { emoji: '🤝', label: 'Bilmediğinde itiraf et ve aktar' }
    };

    const moveBlock = (index, direction) => {
        setBlockOrder(prev => {
            const newOrder = [...prev];
            const targetIndex = index + direction;
            if (targetIndex < 0 || targetIndex >= newOrder.length) return prev;
            [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
            return newOrder;
        });
    };

    const navItems = [
        { key: 'channels', icon: <Zap size={17} />, label: 'Kimlik ve kanallar', hint: channelsLoading ? 'Yükleniyor…' : `${assignedChannelCount} kanal bağlı` },
        { key: 'permissions', icon: <Shield size={17} />, label: 'Yetkiler', hint: `${enabledTools.length} yetenek açık` },
        { key: 'flow', icon: <MessageSquare size={17} />, label: 'Konuşma akışı', hint: `${Object.values(behaviorBlocks).filter(v => v === true).length} blok açık` },
        { key: 'knowledge', icon: <BookOpen size={17} />, label: 'Bilgi bankası', hint: 'PDF ve DOCX' }
    ];
    if (appointmentMode) {
        navItems.push({ key: 'appointment', icon: <Calendar size={17} />, label: 'Randevu ayarları', hint: appointmentMode === 'AUTO' ? 'Otomatik randevu' : 'Talep toplama' });
    }

    return (
        <div className="bm-shell">

            {/* ── Başlık ──────────────────────────────────────────── */}
            <header className="bm-head">
                <div className="bm-head-avatar">
                    <Bot size={21} />
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
                                <span className="bm-head-badge">{appointmentMode ? 'Randevu Asistanı' : (role || 'AI Asistan')}</span>
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
                    <p className="bm-rail-eyebrow">Agent ayarları</p>
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

                    {activeSection === 'permissions' && (
                        <section className="bm-sec">
                            <div className="bm-sec-head">
                                <h3>Yetkiler</h3>
                                <span className="bm-sec-note">Bot neleri yapabilir, neleri yapamaz</span>
                            </div>

                            {/* Tool toggles */}
                            <div className="bm-group">
                                <label className="bm-group-label">Yetenekler</label>
                                <div className="bm-checks">
                                    {TOOL_LIST.map(tool => (
                                        <label key={tool.key} className="bm-check-label">
                                            <input
                                                type="checkbox"
                                                checked={enabledTools.includes(tool.key)}
                                                onChange={() => {
                                                    setEnabledTools(prev =>
                                                        prev.includes(tool.key)
                                                            ? prev.filter(t => t !== tool.key)
                                                            : [...prev, tool.key]
                                                    );
                                                }}
                                            />
                                            {tool.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Randevu modu */}
                            <div className="bm-group">
                                <label className="bm-group-label">Randevu yönetimi</label>
                                <select className="bm-select" value={appointmentMode || ''} onChange={e => setAppointmentMode(e.target.value || null)}>
                                    <option value="">Kapalı</option>
                                    <option value="AUTO">Otomatik randevu ver</option>
                                    <option value="REQUEST">Randevu talebi topla</option>
                                </select>
                            </div>

                            {/* Yazışma devralma */}
                            <div className="bm-group">
                                <label className="bm-group-label">Yazışma devralma</label>
                                <div className="bm-row">
                                    <div className="bm-row-text">
                                        <span className="bm-row-title">Temsilci müdahalesi</span>
                                        <span className="bm-row-desc">Bot yanıt veremezse temsilciye aktarsın</span>
                                    </div>
                                    <label className="bm-toggle">
                                        <input type="checkbox" checked={fallbackEnabled} onChange={e => setFallbackEnabled(e.target.checked)} />
                                        <span className="bm-toggle-slider" />
                                    </label>
                                </div>
                                {fallbackEnabled && (
                                    <>
                                        <select className="bm-select" value={fallbackScope} onChange={e => setFallbackScope(e.target.value)}>
                                            <option value="UNASSIGNED">Sadece atanmamış konuşmalar</option>
                                            <option value="MY_TEAMS">Kendi ekibimdeki konuşmalar</option>
                                            <option value="ALL">Tüm konuşmalar</option>
                                        </select>
                                        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4}}>
                                            <span style={{fontSize:12,color:'#6b7280'}}>Bekleme süresi:</span>
                                            <input type="range" min={1} max={120} value={fallbackDelayMinutes} onChange={e => setFallbackDelayMinutes(Number(e.target.value))} style={{flex:1}} />
                                            <span style={{fontSize:12,fontWeight:600,minWidth:40}}>{fallbackDelayMinutes} dk</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Çalışma saatleri */}
                            <div className="bm-group">
                                <label className="bm-group-label">Çalışma saatleri</label>
                                <div className="bm-row">
                                    <div className="bm-row-text">
                                        <span className="bm-row-title">Bot çalışma saatleri</span>
                                        <span className="bm-row-desc">Bu saatler dışında bot yanıt vermez</span>
                                    </div>
                                    <label className="bm-toggle">
                                        <input type="checkbox" checked={workingHours.enabled} onChange={e => setWorkingHours(prev => ({...prev, enabled: e.target.checked}))} />
                                        <span className="bm-toggle-slider" />
                                    </label>
                                </div>
                                {workingHours.enabled && (
                                    <div style={{display:'flex',gap:8,marginTop:4,alignItems:'center'}}>
                                        <input type="time" value={workingHours.start} onChange={e => setWorkingHours(prev => ({...prev, start: e.target.value}))} className="bm-input-sm" />
                                        <span style={{color:'#6b7280'}}>—</span>
                                        <input type="time" value={workingHours.end} onChange={e => setWorkingHours(prev => ({...prev, end: e.target.value}))} className="bm-input-sm" />
                                    </div>
                                )}
                            </div>

                            {/* Dış mesaj saatleri */}
                            <div className="bm-group">
                                <label className="bm-group-label">Dış mesaj saatleri</label>
                                <div className="bm-row">
                                    <div className="bm-row-text">
                                        <span className="bm-row-title">Hatırlatma gönderim saatleri</span>
                                        <span className="bm-row-desc">Hatırlatma ve follow-up mesajları bu saatler içinde gönderilir</span>
                                    </div>
                                    <label className="bm-toggle">
                                        <input type="checkbox" checked={outboundHours.enabled} onChange={e => setOutboundHours(prev => ({...prev, enabled: e.target.checked}))} />
                                        <span className="bm-toggle-slider" />
                                    </label>
                                </div>
                                {outboundHours.enabled && (
                                    <div style={{display:'flex',gap:8,marginTop:4,alignItems:'center'}}>
                                        <input type="time" value={outboundHours.start} onChange={e => setOutboundHours(prev => ({...prev, start: e.target.value}))} className="bm-input-sm" />
                                        <span style={{color:'#6b7280'}}>—</span>
                                        <input type="time" value={outboundHours.end} onChange={e => setOutboundHours(prev => ({...prev, end: e.target.value}))} className="bm-input-sm" />
                                    </div>
                                )}
                            </div>

                            {/* Zamanlayıcı */}
                            <div className="bm-group">
                                <label className="bm-group-label">Zamanlayıcı</label>
                                <div className="bm-row">
                                    <div className="bm-row-text">
                                        <span className="bm-row-title">Bot zamanlayıcı</span>
                                        <span className="bm-row-desc">Belirli tarihler arasında çalışsın</span>
                                    </div>
                                    <label className="bm-toggle">
                                        <input type="checkbox" checked={schedulerEnabled} onChange={e => setSchedulerEnabled(e.target.checked)} />
                                        <span className="bm-toggle-slider" />
                                    </label>
                                </div>
                                {schedulerEnabled && (
                                    <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:4}}>
                                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                                            <input type="date" value={scheduleStartDate} onChange={e => setScheduleStartDate(e.target.value)} className="bm-input-sm" />
                                            <span style={{color:'#6b7280'}}>—</span>
                                            <input type="date" value={scheduleEndDate} onChange={e => setScheduleEndDate(e.target.value)} className="bm-input-sm" />
                                        </div>
                                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                                            <input type="time" value={scheduleStartTime} onChange={e => setScheduleStartTime(e.target.value)} className="bm-input-sm" />
                                            <span style={{color:'#6b7280'}}>—</span>
                                            <input type="time" value={scheduleEndTime} onChange={e => setScheduleEndTime(e.target.value)} className="bm-input-sm" />
                                        </div>
                                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                                            {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map((day, i) => (
                                                <button key={i} type="button"
                                                    className={`bm-day-btn ${scheduleDays.includes(i) ? 'active' : ''}`}
                                                    onClick={() => setScheduleDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}>
                                                    {day}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {activeSection === 'flow' && (
                        <section className="bm-sec">
                            <div className="bm-sec-head">
                                <h3>Konuşma akışı</h3>
                                <span className="bm-sec-note">Blokları sıralayarak konuşma akışını belirle</span>
                            </div>

                            {/* Sıralanabilir bloklar */}
                            <div className="bm-group">
                                <label className="bm-group-label">Davranış blokları</label>
                                <div className="bm-block-list">
                                    {blockOrder.map((key, index) => {
                                        const info = BLOCK_LABELS[key];
                                        if (!info) return null;
                                        const isEnabled = key === 'suggestProducts' ? behaviorBlocks[key] === true : behaviorBlocks[key] !== false;
                                        return (
                                            <div key={key} className={`bm-block-item ${isEnabled ? '' : 'disabled'}`}>
                                                <div className="bm-block-order">
                                                    <button type="button" className="bm-block-arrow" disabled={index === 0} onClick={() => moveBlock(index, -1)}>▲</button>
                                                    <span className="bm-block-num">{index + 1}</span>
                                                    <button type="button" className="bm-block-arrow" disabled={index === blockOrder.length - 1} onClick={() => moveBlock(index, 1)}>▼</button>
                                                </div>
                                                <span className="bm-block-emoji">{info.emoji}</span>
                                                <span className="bm-block-label">{info.label}</span>
                                                <label className="bm-toggle">
                                                    <input type="checkbox" checked={isEnabled}
                                                        onChange={e => setBehaviorBlocks(prev => ({...prev, [key]: key === 'suggestProducts' ? e.target.checked : (e.target.checked ? true : false)}))}
                                                    />
                                                    <span className="bm-toggle-slider" />
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Sınıflandırma sırası */}
                            {catalogFlow && (
                                <div className="bm-group">
                                    <label className="bm-group-label">📋 Sınıflandırma sırası</label>
                                    <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Bot müşteriyi doğru akışa yönlendirmek için sırasıyla bu bilgileri toplar</span>
                                    {(() => {
                                        const order = catalogFlow?.classificationOrder || ['branch', 'category', 'product'];
                                        const STEPS = {
                                            branch: { label: 'Şube tespiti', emoji: '🏢', count: catalogFlow?.branchCount || 0 },
                                            category: { label: 'Kategori tespiti', emoji: '🏷️', count: catalogFlow?.categoryCount || 0 },
                                            product: { label: 'Ürün/Hizmet tespiti', emoji: '📦', count: catalogFlow?.productCount || 0 },
                                        };
                                        const handleReorder = async (from, to) => {
                                            const newOrder = [...order];
                                            const [item] = newOrder.splice(from, 1);
                                            newOrder.splice(to, 0, item);
                                            setCatalogFlow(prev => ({ ...prev, classificationOrder: newOrder }));
                                            try {
                                                await workspaceAPI.updateCatalogFlow(workspaceId, { classificationOrder: newOrder, botId: bot.id });
                                            } catch (err) { console.error('Classification order error:', err); }
                                        };
                                        return (
                                            <div className="bm-block-list">
                                                {order.map((key, idx) => {
                                                    const step = STEPS[key];
                                                    if (!step) return null;
                                                    const disabled = step.count === 0;
                                                    return (
                                                        <div key={key} className={`bm-block-item ${disabled ? 'disabled' : ''}`}>
                                                            <div className="bm-block-order">
                                                                <button type="button" className="bm-block-arrow" disabled={idx === 0} onClick={() => handleReorder(idx, idx - 1)}>▲</button>
                                                                <span className="bm-block-num">{idx + 1}</span>
                                                                <button type="button" className="bm-block-arrow" disabled={idx === order.length - 1} onClick={() => handleReorder(idx, idx + 1)}>▼</button>
                                                            </div>
                                                            <span className="bm-block-emoji">{step.emoji}</span>
                                                            <span className="bm-block-label">{step.label}</span>
                                                            <span style={{ fontSize: 11, color: disabled ? '#ef4444' : '#059669', background: disabled ? '#fee2e2' : '#dcfce7', padding: '1px 6px', borderRadius: 4, marginLeft: 'auto' }}>
                                                                {disabled ? 'Yok' : `${step.count} kayıt`}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>0 kayıt olan adımlar otomatik atlanır. 1 kayıt varsa sorulmaz, otomatik atanır.</span>
                                </div>
                            )}

                            {/* Hatırlatma kademeleri */}
                            <div className="bm-group">
                                <label className="bm-group-label">Hatırlatma kademeleri</label>
                                {reminderSteps.map((step, i) => (
                                    <div key={i} className="bm-row" style={{gap: 8}}>
                                        <label className="bm-toggle" style={{flex:'none'}}>
                                            <input type="checkbox" checked={step.enabled} onChange={e => {
                                                const updated = [...reminderSteps];
                                                updated[i] = {...updated[i], enabled: e.target.checked};
                                                setReminderSteps(updated);
                                            }} />
                                            <span className="bm-toggle-slider" />
                                        </label>
                                        <span style={{fontSize:13,color:'#6b7280',minWidth:70}}>Kademe {i+1}</span>
                                        <input type="number" min={1} className="bm-input-sm" style={{width:60}} value={step.value || Math.round(step.delayMinutes / (step.unit === 'day' ? 1440 : 60))}
                                            onChange={e => {
                                                const updated = [...reminderSteps];
                                                const val = Number(e.target.value) || 1;
                                                const unit = updated[i].unit || (updated[i].delayMinutes >= 1440 ? 'day' : 'hour');
                                                updated[i] = {...updated[i], value: val, delayMinutes: unit === 'day' ? val * 1440 : val * 60};
                                                setReminderSteps(updated);
                                            }}
                                        />
                                        <select className="bm-select-sm" value={step.unit || (step.delayMinutes >= 1440 ? 'day' : 'hour')}
                                            onChange={e => {
                                                const updated = [...reminderSteps];
                                                const unit = e.target.value;
                                                const val = updated[i].value || Math.round(updated[i].delayMinutes / (updated[i].unit === 'day' ? 1440 : 60));
                                                updated[i] = {...updated[i], unit, delayMinutes: unit === 'day' ? val * 1440 : val * 60};
                                                setReminderSteps(updated);
                                            }}>
                                            <option value="hour">saat</option>
                                            <option value="day">gün</option>
                                        </select>
                                        <span style={{fontSize:12,color:'#9ca3af'}}>sonra</span>
                                    </div>
                                ))}
                            </div>

                            {/* Otomatik yanıt gecikmesi */}
                            <div className="bm-group">
                                <label className="bm-group-label">Otomatik yanıt gecikmesi</label>
                                <div className="bm-row">
                                    <div className="bm-row-text">
                                        <span className="bm-row-title">Yanıt gecikmesi</span>
                                        <span className="bm-row-desc">Müşteri art arda yazarsa bekle, tek yanıt ver</span>
                                    </div>
                                    <label className="bm-toggle">
                                        <input type="checkbox" checked={autoReplyDelayEnabled} onChange={e => setAutoReplyDelayEnabled(e.target.checked)} />
                                        <span className="bm-toggle-slider" />
                                    </label>
                                </div>
                                {autoReplyDelayEnabled && (
                                    <div style={{display:'flex',gap:8,alignItems:'center',marginTop:4}}>
                                        <input type="number" min={5} max={300} value={autoReplyDelaySeconds} onChange={e => setAutoReplyDelaySeconds(Number(e.target.value))} className="bm-input-sm" style={{width:70}} />
                                        <span style={{fontSize:12,color:'#6b7280'}}>saniye bekle</span>
                                    </div>
                                )}
                            </div>

                            {/* Üslup ayarları */}
                            <div className="bm-group">
                                <label className="bm-group-label">Konuşma stili</label>
                                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                                    <div style={{flex:1,minWidth:140}}>
                                        <label style={{fontSize:12,color:'#6b7280',marginBottom:2,display:'block'}}>Üslup</label>
                                        <select className="bm-select" value={tone} onChange={e => setTone(e.target.value)}>
                                            <option value="FRIENDLY_PRO">Samimi-profesyonel</option>
                                            <option value="FORMAL">Resmi</option>
                                            <option value="CASUAL">Rahat</option>
                                            <option value="CONCISE">Kısa ve öz</option>
                                        </select>
                                    </div>
                                    <div style={{flex:1,minWidth:140}}>
                                        <label style={{fontSize:12,color:'#6b7280',marginBottom:2,display:'block'}}>Mesaj uzunluğu</label>
                                        <select className="bm-select" value={msgLength} onChange={e => setMsgLength(e.target.value)}>
                                            <option value="SHORT">Kısa</option>
                                            <option value="NORMAL">Normal</option>
                                            <option value="DETAILED">Detaylı</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{display:'flex',gap:16,marginTop:8}}>
                                    <div className="bm-row" style={{flex:1}}>
                                        <div className="bm-row-text">
                                            <span className="bm-row-title">Emoji kullan</span>
                                        </div>
                                        <label className="bm-toggle">
                                            <input type="checkbox" checked={emojiEnabled} onChange={e => setEmojiEnabled(e.target.checked)} />
                                            <span className="bm-toggle-slider" />
                                        </label>
                                    </div>
                                    <div className="bm-row" style={{flex:1}}>
                                        <div className="bm-row-text">
                                            <span className="bm-row-title">Çok dilli yanıt</span>
                                        </div>
                                        <label className="bm-toggle">
                                            <input type="checkbox" checked={multilingualEnabled} onChange={e => setMultilingualEnabled(e.target.checked)} />
                                            <span className="bm-toggle-slider" />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Ek talimatlar */}
                            <div className="bm-group">
                                <label className="bm-group-label">Ek talimatlar</label>
                                <textarea className="bm-textarea" rows={8} value={prompt} onChange={e => setPrompt(e.target.value)}
                                    placeholder="Bot'a özel talimatlar yazın... (opsiyonel)" />
                                <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                                    <span style={{fontSize:11,color:'#9ca3af'}}>Bilgi bankası ve şube listesi otomatik eklenir</span>
                                    <span style={{fontSize:11,color:'#9ca3af'}}>{prompt.length.toLocaleString('tr-TR')} karakter</span>
                                </div>
                            </div>

                            {/* Handoff mesajı */}
                            <div className="bm-group">
                                <label className="bm-group-label">Devir mesajı</label>
                                <textarea className="bm-textarea" rows={2} value={handoffMessage} onChange={e => setHandoffMessage(e.target.value)}
                                    placeholder="Temsilciye aktarırken gönderilecek mesaj" />
                                <span style={{fontSize:11,color:'#9ca3af'}}>Boş bırakılırsa varsayılan mesaj kullanılır</span>
                            </div>
                        </section>
                    )}

                    {activeSection === 'knowledge' && (
                        <section className="bm-sec">
                            <BotDocumentManager workspaceId={workspaceId} botId={bot.id} />
                        </section>
                    )}

                    {activeSection === 'appointment' && appointmentMode && (
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
