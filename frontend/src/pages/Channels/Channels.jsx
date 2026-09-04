import { useTranslation } from 'react-i18next';
import { useState, useEffect, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { facebookAPI, aiAPI, emailAPI, whatsappAPI, formWebhookAPI, channelRoutingAPI, teamAPI, webWidgetAPI, retellAPI, healthSystemAPI, funnelAPI, workspaceAPI, telsamAPI, classifierAPI, googleCalendarAPI } from '../../services/api';
import WhatsAppSettings from '../../components/Settings/WhatsAppSettings';
import RetellSettings from '../../components/Settings/RetellSettings';
import { Facebook, Trash2, Plus, Instagram, Mail, RefreshCcw, MessageCircle, Info, AlertCircle, CheckCircle, FileText, Copy, Check, Globe, Eye, EyeOff, GitBranch, Users, Bot, X, Settings, History, Phone, Activity, Loader2, Shield, Unplug, Zap, ChevronRight, Database, PhoneCall, ArrowRight, ChevronUp, ChevronDown, Edit2, Map, List, Brain, Hash, AlertTriangle, MessageSquare, Radio, Calendar as CalendarIcon } from 'lucide-react';
import WebWidgetModal from '../../components/WebWidgetModal';
import DisaoSettingsModal from '../../components/Settings/DisaoSettingsModal';
import './Channels.css';



const Channels = () => {
    const { t } = useTranslation();

    const SYNC_PERIOD_OPTIONS = [
        { value: 0, label: 'Süre Seçin' },
        { value: 0.25, label: 'Son 1 Hafta' },
        { value: 0.5, label: 'Son 2 Hafta' },
        { value: 1, label: 'Son 1 Ay' },
        { value: 2, label: 'Son 2 Ay' },
        { value: 3, label: 'Son 3 Ay' },
        { value: 6, label: 'Son 6 Ay' }
    ];
    const { currentWorkspace, user } = useAuth();
    const [searchParams] = useSearchParams();

    const [loading, setLoading] = useState(false);
    const [facebookPages, setFacebookPages] = useState([]);
    const [emailChannels, setEmailChannels] = useState([]);
    const [whatsappNumbers, setWhatsappNumbers] = useState([]);
    const [formWebhooks, setFormWebhooks] = useState([]);
    const [webWidgets, setWebWidgets] = useState([]);
    const [aiBots, setAiBots] = useState([]);
    const [retellSettings, setRetellSettings] = useState(null);
    const [assigningBot, setAssigningBot] = useState(null);

    // Health System states
    const [showHealthModal, setShowHealthModal] = useState(false);
    const [healthConnection, setHealthConnection] = useState(null);
    const [healthConnecting, setHealthConnecting] = useState(false);
    const [healthTesting, setHealthTesting] = useState(false);
    const [healthForm, setHealthForm] = useState({ apiUrl: '', username: '', password: '', name: 'Sağlık Sistemi API' });
    const [healthError, setHealthError] = useState('');
    const [healthSuccess, setHealthSuccess] = useState('');

    // Disao CRM states
    const [showDisaoModal, setShowDisaoModal] = useState(false);
    const [disaoCrmEnabled, setDisaoCrmEnabled] = useState(false);
    const [disaoConnecting, setDisaoConnecting] = useState(false);
    const [disaoTesting, setDisaoTesting] = useState(false);
    const [disaoError, setDisaoError] = useState('');
    const [disaoSuccess, setDisaoSuccess] = useState('');
    const [disaoForm, setDisaoForm] = useState({ email: '', password: '', idProject: '', idAdvice: '' });
    const [disaoConnection, setDisaoConnection] = useState(null);

    // Telsam PBX states
    const [showTelsamModal, setShowTelsamModal] = useState(false);
    const [telsamConfig, setTelsamConfig] = useState(null);
    const [telsamConnecting, setTelsamConnecting] = useState(false);
    const [telsamTesting, setTelsamTesting] = useState(false);
    const [telsamError, setTelsamError] = useState('');
    const [telsamSuccess, setTelsamSuccess] = useState('');
    const [telsamForm, setTelsamForm] = useState({ siteUrl: '', username: '', password: '' });

    // Google Calendar Integration states
    const [showGoogleCalModal, setShowGoogleCalModal] = useState(false);
    const [googleCalConfig, setGoogleCalConfig] = useState(null);
    const [googleCalForm, setGoogleCalForm] = useState({ clientId: '', clientSecret: '' });
    const [googleCalSaving, setGoogleCalSaving] = useState(false);
    const [googleCalError, setGoogleCalError] = useState('');
    const [googleCalSuccess, setGoogleCalSuccess] = useState('');
    const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);
    const [showAdvancedGoogleSettings, setShowAdvancedGoogleSettings] = useState(false);
    const [connectingGoogleCal, setConnectingGoogleCal] = useState(false);

    // Routing states
    const [channelRoutings, setChannelRoutings] = useState([]);
    const [teams, setTeams] = useState([]);
    const [savingRouting, setSavingRouting] = useState(null);
    const [funnels, setFunnels] = useState([]);

    // Chat History Sync states
    const [syncPeriods, setSyncPeriods] = useState({});
    const [syncing, setSyncing] = useState({});
    const [syncResults, setSyncResults] = useState({});

    // Modals
    const [showFormModal, setShowFormModal] = useState(false);
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [showRetellModal, setShowRetellModal] = useState(false);
    const [showWidgetModal, setShowWidgetModal] = useState(false);
    const [widgetModalMode, setWidgetModalMode] = useState('create');
    const [selectedWidget, setSelectedWidget] = useState(null);
    const [newFormName, setNewFormName] = useState('');
    const [newSiteUrl, setNewSiteUrl] = useState('');
    const [copiedUrl, setCopiedUrl] = useState(null);

    // Facebook/Instagram kanal ayarları modal
    const [showPageSettingsModal, setShowPageSettingsModal] = useState(null);
    const [pageHealth, setPageHealth] = useState(null);
    const [pageHealthLoading, setPageHealthLoading] = useState(false);
    const [pageSyncing, setPageSyncing] = useState(false);
    const [pageSyncPeriod, setPageSyncPeriod] = useState(1);
    const [pageSyncResult, setPageSyncResult] = useState(null);
    const [pageResubscribing, setPageResubscribing] = useState(false);

    // Email provider modal states
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailProvider, setEmailProvider] = useState(''); // 'gmail' or 'imap'
    const [imapForm, setImapForm] = useState({
        preset: 'yandex',
        email: '',
        password: '',
        imapHost: '',
        imapPort: 993,
        smtpHost: '',
        smtpPort: 465
    });
    const [connectingEmail, setConnectingEmail] = useState(false);

    // Page selection modal states
    const [showPageSelectModal, setShowPageSelectModal] = useState(false);
    const [availablePages, setAvailablePages] = useState([]);
    const [selectedPages, setSelectedPages] = useState([]);
    const [connectingPages, setConnectingPages] = useState(false);
    const [pageSelectChannelType, setPageSelectChannelType] = useState('facebook');
    const [pageSearchTerm, setPageSearchTerm] = useState('');

    // Classifier states
    const [classifierRules, setClassifierRules] = useState([]);
    const [channelAssignments, setChannelAssignments] = useState({});
    const [expandedChannel, setExpandedChannel] = useState(null);
    const [savingChannel, setSavingChannel] = useState(null);
    const [viewMode, setViewMode] = useState('channels'); // 'channels' | 'rules'
    const [showDetailRuleModal, setShowDetailRuleModal] = useState(false);
    const [detailRuleChannel, setDetailRuleChannel] = useState(null);
    const [detailRuleForm, setDetailRuleForm] = useState({
        name: '',
        conditionType: 'KEYWORD',
        conditions: { keywords: '', matchMode: 'ANY', aiDescription: '', timeStart: '', timeEnd: '', days: [] },
        targetFunnelId: '',
        targetStageId: ''
    });
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [ruleFormData, setRuleFormData] = useState({
        name: '',
        conditionType: 'KEYWORD',
        conditions: { keywords: '', matchMode: 'ANY', aiDescription: '', channels: [], formIds: [] },
        targetFunnelId: '',
        targetStageId: '',
        isActive: true
    });
    const [fbForms, setFbForms] = useState([]);

    const workspaceMemberRole = currentWorkspace?.members?.find(m => m.userId === user?.id)?.role;
    const isOwner = ['OWNER', 'SUPER_ADMIN'].includes(workspaceMemberRole || user?.role);

    const CHANNEL_OPTIONS = [
        { value: 'INSTAGRAM', label: 'Instagram DM', icon: Instagram, color: '#E4405F' },
        { value: 'FACEBOOK', label: 'Facebook Messenger', icon: Facebook, color: '#1877F2' },
        { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, color: '#25D366' },
        { value: 'EMAIL', label: 'Email', icon: Mail, color: '#EA4335' },
        { value: 'WEB_WIDGET', label: 'Web Widget', icon: Globe, color: '#3B82F6' },
        { value: 'FORM', label: 'Web Form', icon: FileText, color: '#8B5CF6' }
    ];

    useEffect(() => {
        if (currentWorkspace) {
            loadAllChannels();
        }
    }, [currentWorkspace]);

    const loadAllChannels = async () => {
        setLoading(true);
        try {
            const API = import.meta.env.VITE_API_URL || 'http://localhost:5008';
            const [pagesRes, emailRes, botsRes, webhooksRes, teamsRes, routingsRes, whatsappRes, widgetsRes, retellRes, healthRes, funnelsRes, wsRes, telsamRes, rulesRes, formsRes, googleCalRes] = await Promise.all([
                facebookAPI.getPages(currentWorkspace.id).catch(() => ({ data: { pages: [] } })),
                emailAPI.getChannels(currentWorkspace.id).catch(() => ({ data: { emailChannels: [] } })),
                aiAPI.getBots(currentWorkspace.id).catch(() => ({ data: { bots: [] } })),
                formWebhookAPI.getWebhooks(currentWorkspace.id).catch(() => ({ data: { webhooks: [] } })),
                teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(() => ({ data: { teams: [] } })),
                channelRoutingAPI.getAll(currentWorkspace.id).catch(() => ({ data: { routings: [] } })),
                whatsappAPI.getPhoneNumbers(currentWorkspace.id).catch(() => ({ data: { phoneNumbers: [] } })),
                webWidgetAPI.getAll(currentWorkspace.id).catch(() => ({ data: { widgets: [] } })),
                retellAPI.getSettings(currentWorkspace.id).catch(() => ({ data: { isConfigured: false } })),
                healthSystemAPI.getStatus(currentWorkspace.id).catch(() => ({ data: { connected: false } })),
                funnelAPI.getAll(currentWorkspace.id).catch(() => ({ data: [] })),
                fetch(`${API}/workspaces/${currentWorkspace.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()).catch(() => null),
                telsamAPI.getSettings(currentWorkspace.id).catch(() => ({ data: null })),
                classifierAPI.getRules(currentWorkspace.id).catch(() => ({ data: { rules: [] } })),
                facebookAPI.getPageForms(currentWorkspace.id).catch(() => ({ data: { forms: [] } })),
                googleCalendarAPI.getWorkspaceConfig(currentWorkspace.id).catch(() => ({ data: null }))
            ]);

            console.log('📡 Loaded channels:', {
                pages: pagesRes.data,
                email: emailRes.data,
                whatsapp: whatsappRes.data,
                webhooks: webhooksRes.data
            });

            setFacebookPages(pagesRes.data.pages || []);
            setEmailChannels(emailRes.data.emailChannels || []);
            setAiBots(botsRes.data.bots || []);
            setFormWebhooks(webhooksRes.data.webhooks || []);
            setTeams(teamsRes.data.teams || []);
            setChannelRoutings(routingsRes.data.routings || []);
            setWhatsappNumbers(whatsappRes.data.phoneNumbers || []);
            setWebWidgets(widgetsRes.data.widgets || []);
            setRetellSettings(retellRes.data.isConfigured ? retellRes.data : null);
            setHealthConnection(healthRes.data.connected ? healthRes.data.integration : null);
            setFunnels(funnelsRes.data?.funnels || funnelsRes.data || []);
            const telsamData = telsamRes?.data?.data || null;
            setTelsamConfig(telsamData);
            setGoogleCalConfig(googleCalRes?.data || null);

            const loadedRules = rulesRes.data?.rules || [];
            setClassifierRules(loadedRules);
            setFbForms(formsRes.data?.forms || []);

            // Build channel assignments from existing rules
            const assignments = {};
            const loadedFunnels = funnelsRes.data?.funnels || funnelsRes.data || [];

            loadedRules.forEach(rule => {
                if (!rule.isActive) return;
                const cond = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
                
                if (rule.conditionType === 'CHANNEL' && cond.channels) {
                    cond.channels.forEach(chId => {
                        let mappedId = chId;
                        if (chId.startsWith('fb-') && !chId.startsWith('fb-msg-') && !chId.startsWith('fb-comment-') && !chId.startsWith('fb-form-')) {
                            mappedId = `fb-msg-${chId.replace('fb-', '')}`;
                        }
                        if (!assignments[mappedId]) {
                            assignments[mappedId] = { funnelId: rule.targetFunnelId, stageId: rule.targetStageId, ruleId: rule.id, ruleName: rule.name };
                        }
                    });
                }
            });
            setChannelAssignments(assignments);

            if (telsamData) {
                setTelsamForm({
                    siteUrl: telsamData.siteUrl || '',
                    username: telsamData.username || '',
                    password: '' // Don't show password
                });
            }

            if (wsRes?.workspace) {
                setDisaoCrmEnabled(wsRes.workspace.disaoCrmEnabled || false);
                if (wsRes.workspace.disaoCrmSettings) {
                    try {
                        let parsedSettings = wsRes.workspace.disaoCrmSettings;
                        if (typeof parsedSettings === 'string') {
                            parsedSettings = JSON.parse(parsedSettings);
                        }
                        if (typeof parsedSettings === 'string') {
                            parsedSettings = JSON.parse(parsedSettings);
                        }
                        setDisaoConnection(parsedSettings);
                    } catch (e) {
                        console.error('Error parsing disao settings', e);
                    }
                } else {
                    setDisaoConnection(null);
                }
            }
        } catch (error) {
            console.error('Error loading channels:', error);
        } finally {
            setLoading(false);
        }
    };

    // Routing functions - akış, aşama, takım, bot ataması
    const handleSaveRouting = async (routingChannel, field, value) => {
        try {
            setSavingRouting(routingChannel);
            const existingRouting = channelRoutings.find(r => r.channel === routingChannel);
            const data = {
                channel: routingChannel,
                teamId: existingRouting?.teamId || null,
                funnelId: existingRouting?.funnelId || null,
                stageId: existingRouting?.stageId || null,
                botDelay: existingRouting?.botDelay ?? 0,
                botEnabled: existingRouting?.botEnabled ?? true,
                [field]: value === '' ? null : value
            };
            if (field === 'funnelId') data.stageId = null;
            
            // Sadece akış veya takım alanı değiştiriliyorsa ve ikisi de boşsa sil
            // botEnabled gibi toggle değişikliklerinde silme
            const isRoutingField = ['funnelId', 'teamId', 'stageId'].includes(field);
            if (isRoutingField && !data.teamId && !data.funnelId) {
                try { await channelRoutingAPI.delete(currentWorkspace.id, routingChannel); } catch (e) { console.log('No existing routing'); }
            } else if (data.teamId || data.funnelId || existingRouting) {
                await channelRoutingAPI.upsert(currentWorkspace.id, data);
            }
            const response = await channelRoutingAPI.getAll(currentWorkspace.id);
            setChannelRoutings(response.data.routings || []);
        } catch (error) { console.error('Error saving routing:', error); } finally { setSavingRouting(null); }
    };

    const handleDeleteRouting = async (channel) => {
        if (!confirm('Are you sure you want to delete this routing?')) return;
        try {
            await channelRoutingAPI.delete(currentWorkspace.id, channel);
            const response = await channelRoutingAPI.getAll(currentWorkspace.id);
            setChannelRoutings(response.data.routings || []);
        } catch (error) {
            console.error('Error deleting routing:', error);
        }
    };

    // Form webhook functions
    const handleCreateFormWebhook = async () => {
        if (!newFormName.trim() || !newSiteUrl.trim()) {
            alert(t('channels.formNameRequired'));
            return;
        }
        try {
            await formWebhookAPI.createWebhook(currentWorkspace.id, {
                name: newFormName,
                siteUrl: newSiteUrl
            });
            setNewFormName('');
            setNewSiteUrl('');
            setShowFormModal(false);
            loadAllChannels();
        } catch (error) {
            console.error('Error creating form webhook:', error);
            alert('Form webhook could not be created.');
        }
    };

    const handleDeleteFormWebhook = async (webhookId) => {
        if (!confirm('Are you sure you want to delete this form webhook?')) return;
        try {
            await formWebhookAPI.deleteWebhook(currentWorkspace.id, webhookId);
            loadAllChannels();
        } catch (error) {
            console.error('Error deleting form webhook:', error);
        }
    };

    const handleToggleFormWebhook = async (webhook) => {
        try {
            await formWebhookAPI.updateWebhook(currentWorkspace.id, webhook.id, {
                isActive: !webhook.isActive
            });
            loadAllChannels();
        } catch (error) {
            console.error('Error toggling form webhook:', error);
        }
    };

    const handleDeleteWhatsapp = async (phoneNumberId) => {
        if (!confirm('Are you sure you want to delete this WhatsApp number?')) return;
        try {
            await whatsappAPI.disconnect(phoneNumberId);
            loadAllChannels();
        } catch (error) {
            console.error('Error deleting whatsapp:', error);
            alert('WhatsApp number could not be deleted.');
        }
    };

    const handleDeleteWebWidget = async (widgetId) => {
        if (!confirm('Are you sure you want to delete this Web Widget?')) return;
        try {
            await webWidgetAPI.delete(widgetId);
            loadAllChannels();
        } catch (error) {
            console.error('Error deleting web widget:', error);
            alert('Web Widget could not be deleted.');
        }
    };

    const handleDeleteDisaoCrm = async () => {
        if (!confirm('Disao CRM bağlantısını silmek istediğinize emin misiniz?')) return;
        try {
            await workspaceAPI.updateDisaoCrmSettings(currentWorkspace.id, {
                enabled: false,
                settings: null
            });
            window.location.reload();
        } catch (error) {
            console.error('Error deleting disao crm:', error);
            alert('Disao CRM bağlantısı silinemedi.');
        }
    };

    // Telsam PBX handlers
    const handleTelsamSave = async () => {
        if (!telsamForm.siteUrl || !telsamForm.username || !telsamForm.password) {
            setTelsamError('Tüm alanları doldurunuz.');
            return;
        }
        setTelsamConnecting(true);
        setTelsamError('');
        try {
            await telsamAPI.saveSettings(currentWorkspace.id, telsamForm);
            setTelsamSuccess('Telsam bağlantısı kaydedildi!');
            await loadAllChannels();
            setTimeout(() => setShowTelsamModal(false), 1000);
        } catch (err) {
            setTelsamError(err.response?.data?.error || 'Bağlantı kaydedilemedi.');
        } finally {
            setTelsamConnecting(false);
        }
    };

    const handleTelsamTest = async () => {
        setTelsamTesting(true);
        setTelsamError('');
        setTelsamSuccess('');
        try {
            const res = await telsamAPI.testConnection(currentWorkspace.id, telsamForm);
            setTelsamSuccess(`Bağlantı başarılı! ${res.data?.data?.activeCallCount ?? 0} aktif arama bulundu.`);
        } catch (err) {
            setTelsamError(err.response?.data?.error || 'Bağlantı testi başarısız.');
        } finally {
            setTelsamTesting(false);
        }
    };

    const handleDeleteTelsam = async () => {
        if (!confirm('Telsam PBX bağlantısını silmek istediğinize emin misiniz?')) return;
        try {
            await telsamAPI.deleteSettings(currentWorkspace.id);
            setTelsamConfig(null);
            setTelsamForm({ siteUrl: '', username: '', password: '' });
            await loadAllChannels();
        } catch (err) {
            console.error('Error deleting telsam:', err);
            alert('Telsam bağlantısı silinemedi.');
        }
    };

    // Google Calendar handlers
    const openGoogleCalModal = () => {
        setGoogleCalError('');
        setGoogleCalSuccess('');
        setShowAdvancedGoogleSettings(!!googleCalConfig?.hasCustomCredentials);
        setGoogleCalForm({
            clientId: googleCalConfig?.clientId && googleCalConfig.clientId !== '••••••••' ? googleCalConfig.clientId : '',
            clientSecret: ''
        });
        setShowGoogleCalModal(true);
    };

    const handleConnectMyGoogleFromChannels = async () => {
        try {
            setConnectingGoogleCal(true);
            const res = await googleCalendarAPI.getAuthUrl(currentWorkspace.id);
            if (res.data?.url) {
                window.location.href = res.data.url;
            } else {
                alert('Google yetkilendirme linki alınamadı.');
            }
        } catch (err) {
            console.error('Connect Google error:', err);
            alert(err.response?.data?.error || 'Google Takvim bağlantısı başlatılamadı.');
        } finally {
            setConnectingGoogleCal(false);
        }
    };

    const handleDisconnectMyGoogleFromChannels = async () => {
        if (!confirm('Kendi Google Takvim bağlantınızı bu çalışma alanı için kesmek istediğinize emin misiniz?')) return;
        try {
            await googleCalendarAPI.disconnect(currentWorkspace.id);
            const res = await googleCalendarAPI.getWorkspaceConfig(currentWorkspace.id);
            setGoogleCalConfig(res.data);
        } catch (err) {
            console.error('Disconnect Google error:', err);
            alert('Bağlantı kesilirken hata oluştu.');
        }
    };

    const handleSaveGoogleCalConfig = async () => {
        if (!googleCalForm.clientId || !googleCalForm.clientSecret) {
            setGoogleCalError('Client ID ve Client Secret alanları zorunludur.');
            return;
        }
        setGoogleCalSaving(true);
        setGoogleCalError('');
        setGoogleCalSuccess('');
        try {
            await googleCalendarAPI.saveWorkspaceConfig(currentWorkspace.id, {
                clientId: googleCalForm.clientId,
                clientSecret: googleCalForm.clientSecret
            });
            setGoogleCalSuccess('Özel Google Takvim ayarları başarıyla kaydedildi!');
            const res = await googleCalendarAPI.getWorkspaceConfig(currentWorkspace.id);
            setGoogleCalConfig(res.data);
            setTimeout(() => setGoogleCalSuccess(''), 2500);
        } catch (err) {
            console.error('Save Google Calendar config error:', err);
            setGoogleCalError(err.response?.data?.error || 'Ayarlar kaydedilemedi.');
        } finally {
            setGoogleCalSaving(false);
        }
    };

    const handleDeleteGoogleCalConfig = async () => {
        if (!confirm('Bu çalışma alanının özel Google Takvim yapılandırmasını sıfırlayıp platform varsayılanına dönmek istediğinizden emin misiniz?')) return;
        try {
            await googleCalendarAPI.deleteWorkspaceConfig(currentWorkspace.id);
            const res = await googleCalendarAPI.getWorkspaceConfig(currentWorkspace.id);
            setGoogleCalConfig(res.data);
            setShowAdvancedGoogleSettings(false);
        } catch (err) {
            console.error('Delete Google Calendar config error:', err);
            alert(err.response?.data?.error || 'Yapılandırma sıfırlanamadı.');
        }
    };

    // Chat History Sync for individual channel
    const handleChannelSync = async (channel) => {
        const channelId = channel.id;
        const period = syncPeriods[channelId];

        if (!period || period === 0) {
            alert('Please select a time period.');
            return;
        }

        setSyncing(prev => ({ ...prev, [channelId]: true }));
        setSyncResults(prev => ({ ...prev, [channelId]: null }));

        try {
            const response = await facebookAPI.syncHistoricalConversations(
                currentWorkspace.id,
                {
                    facebookMonths: channel.type === 'facebook' ? period : 0,
                    instagramMonths: channel.type === 'instagram' ? period : 0,
                    whatsappMonths: channel.type === 'whatsapp' ? period : 0
                }
            );

            setSyncResults(prev => ({
                ...prev,
                [channelId]: {
                    success: true,
                    totalConversations: response.data?.totalConversations || 0,
                    totalMessages: response.data?.totalMessages || 0
                }
            }));

            // Clear result after 5 seconds
            setTimeout(() => {
                setSyncResults(prev => ({ ...prev, [channelId]: null }));
            }, 5000);
        } catch (error) {
            console.error('Sync error:', error);
            setSyncResults(prev => ({
                ...prev,
                [channelId]: { success: false, error: error.message || 'Sync error' }
            }));
        } finally {
            setSyncing(prev => ({ ...prev, [channelId]: false }));
        }
    };

    const copyToClipboard = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedUrl(id);
        setTimeout(() => setCopiedUrl(null), 2000);
    };

    // Bot assignment
    const handleAssignBot = async (type, id, botId) => {
        try {
            setAssigningBot(id);
            const data = { assignedBotId: botId || null, type };

            if (type === 'facebook' || type === 'instagram' || type === 'comment' || type === 'instagram_comment') {
                await facebookAPI.updatePageBot(id, data);
            } else if (type === 'whatsapp') {
                await whatsappAPI.updateBot(id, data);
            } else if (type === 'email') {
                await emailAPI.updateBot(id, data);
            } else if (type === 'webwidget') {
                await webWidgetAPI.updateBot(id, botId);
            } else if (type === 'health-system') {
                await healthSystemAPI.updateBot(currentWorkspace.id, id, { assignedBotId: botId || null });
            }
            loadAllChannels();
        } catch (error) {
            console.error('Error assigning bot:', error);
            alert('Bot could not be assigned.');
        } finally {
            setAssigningBot(null);
        }
    };

    // Disconnect functions
    const handleDisconnectPage = async (pageId, channelType = null) => {
        const page = facebookPages.find(p => p.id === pageId);
        const hasInstagram = page?.instagramBusinessId;

        let message;
        if (channelType === 'instagram') {
            message = 'Are you sure you want to disconnect Instagram?';
        } else if (channelType === 'facebook' && hasInstagram) {
            message = 'Are you sure you want to disconnect Facebook?\n\n⚠️ Instagram is linked to this page and will also be disconnected!';
        } else {
            message = 'Are you sure you want to disconnect this page?';
        }

        if (!confirm(message)) return;
        try {
            await facebookAPI.disconnectPage(pageId, channelType);
            loadAllChannels();
        } catch (error) {
            console.error('Error disconnecting page:', error);
        }
    };

    const handleDeleteEmail = async (id) => {
        if (!confirm('Are you sure you want to remove this email account?')) return;
        try {
            await emailAPI.delete(id);
            loadAllChannels();
        } catch (error) {
            console.error('Error deleting email channel:', error);
        }
    };

    const handleSyncEmail = async (id) => {
        try {
            await emailAPI.sync(id);
            alert('Sync started.');
            loadAllChannels();
        } catch (error) {
            console.error('Error syncing email:', error);
        }
    };

    // Email connect - show provider selection modal
    const handleEmailConnect = () => {
        setEmailProvider('');
        setImapForm({
            preset: 'yandex',
            email: '',
            password: '',
            imapHost: '',
            imapPort: 993,
            smtpHost: '',
            smtpPort: 465
        });
        setShowEmailModal(true);
    };

    // Gmail OAuth connect
    const handleGmailConnect = async () => {
        try {
            const response = await emailAPI.getConnectUrl(currentWorkspace.id);
            window.location.href = response.data.url;
        } catch (error) {
            console.error('Error connecting Gmail:', error);
            alert('Gmail bağlantısı başlatılamadı.');
        }
    };

    // IMAP/SMTP connect (Yandex, Webmail, etc.)
    const handleImapConnect = async () => {
        if (!imapForm.email || !imapForm.password) {
            alert('E-posta ve şifre gereklidir.');
            return;
        }

        setConnectingEmail(true);
        try {
            await emailAPI.connectImap(currentWorkspace.id, {
                preset: imapForm.preset,
                email: imapForm.email,
                password: imapForm.password,
                imapHost: imapForm.preset === 'custom' ? imapForm.imapHost : undefined,
                imapPort: imapForm.preset === 'custom' ? imapForm.imapPort : undefined,
                smtpHost: imapForm.preset === 'custom' ? imapForm.smtpHost : undefined,
                smtpPort: imapForm.preset === 'custom' ? imapForm.smtpPort : undefined
            });

            setShowEmailModal(false);
            loadAllChannels();
            alert('E-posta hesabı başarıyla bağlandı!');
        } catch (error) {
            console.error('Error connecting IMAP:', error);
            alert(error.response?.data?.error || 'Bağlantı başarısız. E-posta veya şifre hatalı olabilir.');
        } finally {
            setConnectingEmail(false);
        }
    };

    // Handle IMAP preset change
    const handleImapPresetChange = (preset) => {
        const presets = {
            yandex: { imapHost: 'imap.yandex.com', smtpHost: 'smtp.yandex.com', imapPort: 993, smtpPort: 465 },
            outlook: { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com', imapPort: 993, smtpPort: 587 },
            custom: { imapHost: '', smtpHost: '', imapPort: 993, smtpPort: 465 }
        };
        setImapForm(prev => ({ ...prev, preset, ...(presets[preset] || {}) }));
    };

    // OAuth connect for Facebook/Instagram
    const handleOAuthConnect = (channelType = 'facebook') => {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5008/api';
        const authBaseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
        const token = localStorage.getItem('token');
        const stateObj = { token, workspaceId: currentWorkspace?.id, channelType };
        const state = encodeURIComponent(JSON.stringify(stateObj));

        localStorage.removeItem('oauth_result');

        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const processOAuthSuccess = (data) => {
            if (data.token) {
                localStorage.setItem('token', data.token);
            }
            localStorage.removeItem('oauth_result');

            const pages = data.availablePages || [];
            const callbackChannelType = data.channelType || channelType;

            let filteredPages = pages;
            if (callbackChannelType === 'instagram') {
                filteredPages = pages.filter(p => p.instagram_business_account?.id);
            }

            if (filteredPages.length > 0) {
                setAvailablePages(filteredPages);
                setSelectedPages([]);
                setPageSelectChannelType(callbackChannelType);
                setShowPageSelectModal(true);
            } else {
                alert(callbackChannelType === 'instagram'
                    ? 'Instagram Business hesabı bulunamadı.'
                    : 'Bağlanabilecek sayfa bulunamadı.');
                loadAllChannels();
            }
        };

        const cleanup = () => {
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(pollInterval);
        };

        const handleMessage = async (event) => {
            if (event.data?.type === 'FACEBOOK_AUTH_SUCCESS') {
                cleanup();
                processOAuthSuccess(event.data);
            }
        };

        const handleStorageChange = (event) => {
            if (event.key === 'oauth_result' && event.newValue) {
                try {
                    const result = JSON.parse(event.newValue);
                    if (result.type === 'FACEBOOK_AUTH_SUCCESS') {
                        cleanup();
                        processOAuthSuccess(result);
                    }
                } catch (e) {
                    console.error('Error parsing OAuth result:', e);
                }
            }
        };

        const pollInterval = setInterval(() => {
            const result = localStorage.getItem('oauth_result');
            if (result) {
                try {
                    const data = JSON.parse(result);
                    if (data.type === 'FACEBOOK_AUTH_SUCCESS') {
                        cleanup();
                        processOAuthSuccess(data);
                    }
                } catch (e) { }
            }
        }, 500);

        window.addEventListener('message', handleMessage);
        window.addEventListener('storage', handleStorageChange);
        setTimeout(() => cleanup(), 5 * 60 * 1000);

        window.open(
            `${authBaseUrl}/auth/facebook?state=${state}`,
            'Facebook OAuth',
            `width=${width},height=${height},left=${left},top=${top}`
        );
    };

    const togglePageSelection = (pageId) => {
        setSelectedPages(prev =>
            prev.includes(pageId)
                ? prev.filter(id => id !== pageId)
                : [...prev, pageId]
        );
    };

    const handleConnectSelectedPages = async () => {
        if (selectedPages.length === 0) {
            alert('Lütfen en az bir sayfa seçin.');
            return;
        }

        setConnectingPages(true);
        try {
            let hasConversationRoutingWarning = false;
            for (const pageId of selectedPages) {
                const page = availablePages.find(p => p.id === pageId);
                if (page) {
                    const connectData = {
                        pageId: page.id,
                        pageName: page.name,
                        pageAccessToken: page.access_token,
                        workspaceId: currentWorkspace.id,
                        instagramBusinessId: pageSelectChannelType === 'instagram' ? page.instagram_business_account?.id : null,
                        instagramUsername: pageSelectChannelType === 'instagram' ? page.instagram_business_account?.username : null
                    };
                    const result = await facebookAPI.connectPage(connectData);
                    if (result.data?.instagramWarning === 'CONVERSATION_ROUTING_ACTIVE') {
                        hasConversationRoutingWarning = true;
                    }
                }
            }

            setShowPageSelectModal(false);
            setSelectedPages([]);
            setAvailablePages([]);
            loadAllChannels();

            if (hasConversationRoutingWarning) {
                alert('⚠️ Sayfalar bağlandı ancak Instagram hesabında "Conversation Routing" (İleti Yönlendirme) aktif görünüyor.\n\nBot\'un mesaj gönderebilmesi için Instagram hesap sahibinin şu adımları izlemesi gerekiyor:\n\n1. Meta Business Suite → Gelen Kutusu → Ayarlar\n2. Instagram bölümünde uygulamamıza mesaj erişimi verin\n3. Uygulamamızı birincil alıcı olarak seçin\n\nBu ayar yapılana kadar mesajlar alınır ancak bot otomatik cevap veremez.');
            } else {
                alert('Sayfalar başarıyla bağlandı!');
            }
        } catch (error) {
            console.error('Error connecting pages:', error);
            alert('Sayfa bağlantı hatası: ' + (error.response?.data?.error || error.message));
        } finally {
            setConnectingPages(false);
        }
    };

    // Map channel type to routing channel value
    const getRoutingChannelValue = (type) => {
        switch (type) {
            case 'facebook': return 'FACEBOOK';
            case 'instagram': return 'INSTAGRAM';
            case 'whatsapp': return 'WHATSAPP';
            case 'email': return 'EMAIL';
            case 'webform': return 'FORM';
            default: return null;
        }
    };

    // Build unified channel list
    const buildChannelList = () => {
        const channels = [];

        // Facebook Pages
        facebookPages.forEach(page => {
            channels.push({
                id: page.id,
                type: 'facebook',
                routingChannel: 'FACEBOOK',
                icon: Facebook,
                color: '#1877F2',
                bgColor: '#EBF4FF',
                name: page.pageName,
                subtitle: `${page._count?.conversations || 0} Sohbet`,
                data: page,
                subchannels: [
                    { id: 'FACEBOOK', label: 'Mesajlar', icon: MessageCircle },
                    { id: 'FACEBOOK_COMMENT', label: 'Yorumlar', icon: MessageCircle },
                    { id: 'LEAD', label: 'Lead Form', icon: FileText }
                ]
            });

            // If has Instagram, add as separate channel
            if (page.instagramBusinessId) {
                channels.push({
                    id: `ig-${page.id}`,
                    pageId: page.id,
                    type: 'instagram',
                    routingChannel: 'INSTAGRAM',
                    icon: Instagram,
                    color: '#E4405F',
                    bgColor: '#FFF5F7',
                    name: `@${page.instagramUsername}`,
                    subtitle: `Facebook: ${page.pageName}`,
                    data: page,
                    subchannels: [
                        { id: 'INSTAGRAM', label: 'DM (Mesajlar)', icon: MessageCircle },
                        { id: 'INSTAGRAM_COMMENT', label: 'Yorumlar', icon: MessageCircle }
                    ]
                });
            }
        });

        // WhatsApp Numbers
        whatsappNumbers.forEach(num => {
            channels.push({
                id: num.id,
                type: 'whatsapp',
                routingChannel: 'WHATSAPP',
                icon: MessageCircle,
                color: '#25D366',
                bgColor: '#F0FFF4',
                name: num.displayPhoneNumber || num.phoneNumber,
                subtitle: num.verifiedName || 'WhatsApp Business',
                data: num,
                hasChatBot: true,
                chatBotId: num.assignedBotId,
                hasRouting: true
            });
        });

        // Email Channels
        emailChannels.forEach(channel => {
            channels.push({
                id: channel.id,
                type: 'email',
                routingChannel: 'EMAIL',
                icon: Mail,
                color: '#EA4335',
                bgColor: '#FEF2F2',
                name: channel.email,
                subtitle: channel.provider,
                data: channel,
                hasAutoReplyBot: true,
                botId: channel.assignedBotId,
                hasRouting: true
            });
        });

        // Web Forms
        formWebhooks.forEach(webhook => {
            channels.push({
                id: webhook.id,
                type: 'webform',
                routingChannel: 'FORM',
                icon: FileText,
                color: '#8B5CF6',
                bgColor: '#F5F3FF',
                name: webhook.name,
                subtitle: webhook.siteUrl || 'Site belirtilmedi',
                data: webhook,
                isActive: webhook.isActive,
                hasRouting: true
            });
        });

        // Web Widgets
        webWidgets.forEach(widget => {
            channels.push({
                id: widget.id,
                type: 'webwidget',
                routingChannel: 'WEB_WIDGET',
                icon: Globe,
                color: '#3B82F6',
                bgColor: '#EFF6FF',
                name: widget.name,
                subtitle: widget.siteUrl || 'Site belirtilmedi',
                data: widget,
                isActive: widget.isActive,
                hasChatBot: true,
                chatBotId: widget.assignedBotId,
                hasRouting: true
            });
        });

        // Retell Setting
        if (retellSettings && retellSettings.isConfigured) {
            channels.push({
                id: 'retell',
                type: 'retell',
                routingChannel: 'RETELL', // Just in case, though it has no routing UI yet
                icon: Phone,
                color: '#0d9488',
                bgColor: '#f0fdfa',
                name: 'AI Call – Sesli Arama',
                subtitle: retellSettings.retellFromNumber || 'Yapılandırıldı',
                data: retellSettings,
                hasRouting: false,
                hasChatBot: false
            });
        }

        // Health System
        if (healthConnection) {
            channels.push({
                id: healthConnection.id,
                type: 'health-system',
                routingChannel: 'HEALTH_SYSTEM',
                icon: Activity,
                color: '#7c3aed',
                bgColor: '#f5f3ff',
                name: healthConnection.name || 'Sağlık Sistemi API',
                subtitle: healthConnection.baseUrl,
                data: healthConnection,
                hasRouting: false,
                hasChatBot: false,
                chatBotId: healthConnection.assignedBotId || null
            });
        }

        // Disao CRM
        if (disaoConnection || disaoCrmEnabled) {
            channels.push({
                id: 'disao-crm',
                type: 'disao-crm',
                routingChannel: 'DISAO_CRM',
                icon: Zap,
                color: '#6366f1',
                bgColor: '#eef2ff',
                name: 'Disao CRM',
                subtitle: disaoConnection?.username || disaoConnection?.email || 'Bağlı',
                data: disaoConnection || {},
                hasRouting: false,
                hasChatBot: false
            });
        }

        // Telsam PBX
        if (telsamConfig) {
            channels.push({
                id: telsamConfig.id || 'telsam-pbx',
                type: 'telsam',
                routingChannel: 'TELSAM',
                icon: PhoneCall,
                color: '#0284c7',
                bgColor: '#f0f9ff',
                name: 'Telsam Santral',
                subtitle: telsamConfig.siteUrl || 'Bağlı',
                data: telsamConfig,
                hasRouting: false,
                hasChatBot: false
            });
        }

        return channels;
    };

    // === CLASSIFIER FUNCTIONS ===
    const getDefaultFunnel = () => funnels.find(f => f.isDefault || f.funnelType === 'MAIN') || funnels[0];
    
    const isDefaultFunnel = (funnelId) => {
        const df = getDefaultFunnel();
        return df && df.id === funnelId;
    };

    const getClassifierChannelId = (channel) => {
        // Map Channels page channel to Classifier-style channel ID
        if (channel.type === 'facebook') return `fb-msg-${channel.id}`;
        if (channel.type === 'instagram') return `ig-${channel.pageId || channel.id}`;
        if (channel.type === 'whatsapp') return `wa-${channel.id}`;
        if (channel.type === 'webform') return `form-${channel.id}`;
        if (channel.type === 'webwidget') return `widget-${channel.id}`;
        return channel.id;
    };

    const [groupAssignments, setGroupAssignments] = useState({});
    const [channelOverrides, setChannelOverrides] = useState({});

    const handleChannelFunnelChange = async (classifierId, funnelId, isGroupChange = false) => {
        if (!isGroupChange) {
            setChannelOverrides(prev => ({ ...prev, [classifierId]: true }));
        }
        const prev = channelAssignments[classifierId];
        setChannelAssignments(a => ({ ...a, [classifierId]: { ...a[classifierId], funnelId, stageId: '' } }));
        setSavingChannel(classifierId);

        try {
            if (prev?.ruleId) {
                await classifierAPI.updateRule(currentWorkspace.id, prev.ruleId, {
                    targetFunnelId: funnelId,
                    targetStageId: null
                });
            } else {
                const funnel = funnels.find(f => f.id === funnelId);
                const res = await classifierAPI.createRule(currentWorkspace.id, {
                    name: `${classifierId} → ${funnel?.name || 'Akış'}`,
                    conditionType: 'CHANNEL',
                    conditions: JSON.stringify({ channels: [classifierId] }),
                    targetFunnelId: funnelId,
                    isActive: true
                });
                setChannelAssignments(a => ({ ...a, [classifierId]: { ...a[classifierId], ruleId: res.data.rule?.id } }));
            }
        } catch (err) {
            console.error('Funnel assignment error:', err);
            if (prev) setChannelAssignments(a => ({ ...a, [classifierId]: prev }));
        } finally {
            setSavingChannel(null);
        }
    };

    const handleChannelStageChange = async (classifierId, stageId, isGroupChange = false) => {
        if (!isGroupChange) {
            setChannelOverrides(prev => ({ ...prev, [classifierId]: true }));
        }
        const prev = channelAssignments[classifierId];
        setChannelAssignments(a => ({ ...a, [classifierId]: { ...a[classifierId], stageId } }));
        setSavingChannel(classifierId);
        try {
            if (prev?.ruleId) {
                await classifierAPI.updateRule(currentWorkspace.id, prev.ruleId, { targetStageId: stageId || null });
            }
        } catch (err) {
            console.error('Stage update error:', err);
        } finally {
            setSavingChannel(null);
        }
    };

    const handleGroupFunnelChange = async (groupKey, funnelId) => {
        setGroupAssignments(prev => ({ ...prev, [groupKey]: { ...prev[groupKey], funnelId, stageId: '' } }));
        const groupChannels = routingChannels.filter(ch => ch.group === groupKey);
        for (const ch of groupChannels) {
            if (!channelOverrides[ch.id]) {
                await handleChannelFunnelChange(ch.id, funnelId, true);
            }
        }
    };

    const handleGroupStageChange = async (groupKey, stageId) => {
        setGroupAssignments(prev => ({ ...prev, [groupKey]: { ...prev[groupKey], stageId } }));
        const groupChannels = routingChannels.filter(ch => ch.group === groupKey);
        for (const ch of groupChannels) {
            if (!channelOverrides[ch.id]) {
                await handleChannelStageChange(ch.id, stageId, true);
            }
        }
    };

    const handleChannelSettings = (channel) => {
        if (channel.type === 'facebook' || channel.type === 'instagram') {
            setShowPageSettingsModal(channel);
            setPageHealth(null);
            setPageSyncResult(null);
            return;
        } else if (channel.type === 'webform') {
            const webhook = formWebhooks.find(f => f.id === channel.rawId);
            if (webhook) handleToggleFormWebhook(webhook);
        } else if (channel.type === 'webwidget') {
            const widget = webWidgets.find(w => w.id === channel.rawId);
            if (widget) {
                setSelectedWidget(widget);
                setWidgetModalMode('edit');
                setShowWidgetModal(true);
            }
        } else if (channel.type === 'retell') {
            setShowRetellModal(true);
        } else if (channel.type === 'telsam') {
            setTelsamError(''); setTelsamSuccess(''); setShowTelsamModal(true);
        } else if (channel.type === 'whatsapp') {
            setShowWhatsAppModal(true);
        }
    };

    const handleDeleteChannel = (channel) => {
        if (channel.type === 'facebook') {
            handleDisconnectPage(channel.rawId, 'facebook');
        } else if (channel.type === 'instagram') {
            handleDisconnectPage(channel.rawId, 'instagram');
        } else if (channel.type === 'whatsapp') {
            handleDeleteWhatsapp(channel.rawId);
        } else if (channel.type === 'webform') {
            handleDeleteFormWebhook(channel.rawId);
        } else if (channel.type === 'webwidget') {
            handleDeleteWebWidget(channel.rawId);
        } else if (channel.type === 'telsam') {
            handleDeleteTelsam();
        } else if (channel.type === 'email') {
            handleDeleteEmail(channel.rawId);
        } else if (channel.type === 'disao-crm') {
            handleDeleteDisaoCrm();
        }
    };

    const getDetailRulesForChannel = (classifierId) => {
        return classifierRules.filter(rule => {
            if (rule.conditionType === 'CHANNEL') return false;
            const cond = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
            return cond.channels && cond.channels.includes(classifierId);
        });
    };

    const handleDeleteClassifierRule = async (ruleId) => {
        if (!confirm('Bu kuralı silmek istediğinize emin misiniz?')) return;
        try {
            await classifierAPI.deleteRule(currentWorkspace.id, ruleId);
            setClassifierRules(prev => prev.filter(r => r.id !== ruleId));
            loadAllChannels();
        } catch (err) {
            console.error('Rule delete error:', err);
        }
    };

    const handleToggleClassifierRule = async (ruleId) => {
        try {
            await classifierAPI.toggleRule(currentWorkspace.id, ruleId);
            setClassifierRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive: !r.isActive } : r));
        } catch (err) {
            console.error('Rule toggle error:', err);
        }
    };

    const moveRule = async (index, direction) => {
        const newRules = [...classifierRules];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newRules.length) return;
        [newRules[index], newRules[targetIndex]] = [newRules[targetIndex], newRules[index]];
        const updatedRules = newRules.map((r, i) => ({ id: r.id, priority: i }));
        setClassifierRules(newRules);
        try {
            await classifierAPI.reorderRules(currentWorkspace.id, updatedRules);
        } catch (err) {
            console.error('Reorder error:', err);
            loadAllChannels();
        }
    };

    const openRuleModal = (rule = null) => {
        if (rule) {
            const cond = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
            setEditingRule(rule);
            setRuleFormData({
                name: rule.name,
                conditionType: rule.conditionType,
                conditions: { keywords: cond.keywords || '', matchMode: cond.matchMode || 'ANY', aiDescription: cond.aiDescription || '', channels: cond.channels || [], formIds: cond.formIds || [], timeStart: cond.timeStart || '', timeEnd: cond.timeEnd || '', days: cond.days || [] },
                targetFunnelId: rule.targetFunnelId || '',
                targetStageId: rule.targetStageId || '',
                isActive: rule.isActive
            });
        } else {
            setEditingRule(null);
            setRuleFormData({ name: '', conditionType: 'KEYWORD', conditions: { keywords: '', matchMode: 'ANY', aiDescription: '', channels: [], formIds: [] }, targetFunnelId: '', targetStageId: '', isActive: true });
        }
        setShowRuleModal(true);
    };

    const handleSaveRule = async () => {
        try {
            const payload = {
                name: ruleFormData.name,
                conditionType: ruleFormData.conditionType,
                conditions: JSON.stringify(ruleFormData.conditions),
                targetFunnelId: ruleFormData.targetFunnelId,
                targetStageId: ruleFormData.targetStageId || null,
                isActive: ruleFormData.isActive
            };
            if (editingRule) {
                await classifierAPI.updateRule(currentWorkspace.id, editingRule.id, payload);
            } else {
                await classifierAPI.createRule(currentWorkspace.id, payload);
            }
            setShowRuleModal(false);
            loadAllChannels();
        } catch (err) {
            console.error('Rule save error:', err);
        }
    };

    const handleSaveDetailRule = async () => {
        try {
            const payload = {
                name: detailRuleForm.name || `${detailRuleChannel?.name || ''} Kuralı`,
                conditionType: detailRuleForm.conditionType,
                conditions: JSON.stringify({ ...detailRuleForm.conditions, channels: [detailRuleChannel?.classifierId] }),
                targetFunnelId: detailRuleForm.targetFunnelId,
                targetStageId: detailRuleForm.targetStageId || null,
                isActive: true
            };
            await classifierAPI.createRule(currentWorkspace.id, payload);
            setShowDetailRuleModal(false);
            loadAllChannels();
        } catch (err) {
            console.error('Detail rule save error:', err);
        }
    };

    const renderConditionBadge = (type) => {
        const badges = {
            'KEYWORD': { label: 'Kelime', className: 'badge-keyword' },
            'AI': { label: 'Yapay Zeka', className: 'badge-ai' },
            'CHANNEL': { label: 'Kanal', className: 'badge-channel' },
            'DEFAULT': { label: 'Varsayılan', className: 'badge-default' },
            'TIME': { label: 'Zaman', className: 'badge-time' }
        };
        const b = badges[type] || { label: type, className: '' };
        return <span className={`rule-badge ${b.className}`}>{b.label}</span>;
    };

    const renderConditionPreview = (rule) => {
        const cond = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
        if (rule.conditionType === 'KEYWORD') return `"${(cond.keywords || '').substring(0, 40)}" geçiyorsa`;
        if (rule.conditionType === 'AI') return `AI: "${(cond.aiDescription || '').substring(0, 40)}"`;
        if (rule.conditionType === 'TIME') return `⏰ ${cond.timeStart || '?'}-${cond.timeEnd || '?'}`;
        if (rule.conditionType === 'DEFAULT') return 'Varsayılan kural';
        if (rule.conditionType === 'CHANNEL') return `${(cond.channels || []).length} kanal`;
        return '';
    };

    const getTargetName = (funnelId, stageId) => {
        const funnel = funnels.find(f => f.id === funnelId);
        if (!funnel) return 'Bilinmiyor';
        const stage = stageId && funnel.stages ? funnel.stages.find(s => s.id === stageId) : null;
        return stage ? `${funnel.name} ➔ ${stage.name}` : funnel.name;
    };

    const channelList = buildChannelList();
    const hasAnyChannel = channelList.length > 0;

    // --- Build combined channels for routing ---
    const routingChannels = [];
    
    // Chat Kanalları
    (facebookPages || []).forEach(p => {
        routingChannels.push({
            id: `fb-msg-${p.id}`, rawId: p.id, type: 'facebook',
            name: `${p.pageName}`,
            groupLabel: 'Facebook Mesajlar',
            group: 'chat',
            icon: Facebook, color: '#1877F2'
        });
        if (p.instagramBusinessId) {
            routingChannels.push({
                id: `ig-${p.id}`, rawId: p.id, type: 'instagram',
                name: `@${p.instagramUsername || 'Instagram'}`,
                groupLabel: 'DM',
                group: 'chat',
                icon: Instagram, color: '#E4405F'
            });
        }
    });
    (whatsappNumbers || []).forEach(w => {
        routingChannels.push({
            id: `wa-${w.id}`, rawId: w.id, type: 'whatsapp',
            name: w.displayPhoneNumber || w.phoneNumber,
            groupLabel: 'WhatsApp',
            group: 'chat',
            icon: MessageCircle, color: '#25D366'
        });
    });
    (webWidgets || []).forEach(w => {
        routingChannels.push({
            id: `widget-${w.id}`, rawId: w.id, type: 'webwidget',
            name: w.name || w.domain || 'Web Widget',
            groupLabel: 'Web Chat',
            group: 'chat',
            icon: Globe, color: '#3b82f6'
        });
    });

    // Web Formları
    (formWebhooks || []).forEach(f => {
        routingChannels.push({
            id: `form-${f.id}`, rawId: f.id, type: 'webform',
            name: f.name,
            groupLabel: 'Web Form',
            group: 'webforms',
            icon: FileText, color: '#8B5CF6'
        });
    });

    // Facebook Lead Formları
    (fbForms || []).forEach(f => {
        routingChannels.push({
            id: `fb-form-${f.formId}`, rawId: f.formId, type: 'fb-form',
            name: f.formName || 'Form',
            groupLabel: 'Facebook Lead',
            group: 'fbforms',
            icon: FileText, color: '#FF6B35',
            leadCount: f.leadCount || 0
        });
    });

    // AI Arama
    if (retellSettings) {
        routingChannels.push({
            id: 'retell', rawId: 'retell', type: 'retell',
            name: retellSettings.retellFromNumber || 'AI Call',
            groupLabel: 'AI Sesli Arama',
            group: 'aicall',
            icon: Phone, color: '#0d9488'
        });
    }
    if (telsamConfig) {
        routingChannels.push({
            id: 'telsam', rawId: telsamConfig.id, type: 'telsam',
            name: 'Telsam Santral',
            groupLabel: 'Santral',
            group: 'aicall',
            icon: PhoneCall, color: '#0284c7'
        });
    }

    // Yorumlar
    (facebookPages || []).forEach(p => {
        routingChannels.push({
            id: `fb-comment-${p.id}`, rawId: p.id, type: 'facebook-comment',
            name: `${p.pageName}`,
            groupLabel: 'Facebook Yorumlar',
            group: 'comments',
            icon: MessageSquare, color: '#42b883'
        });
        if (p.instagramBusinessId) {
            routingChannels.push({
                id: `ig-comment-${p.id}`, rawId: p.id, type: 'instagram-comment',
                name: `@${p.instagramUsername || 'Instagram'}`,
                groupLabel: 'Instagram Yorumlar',
                group: 'comments',
                icon: Instagram, color: '#E4405F'
            });
        }
    });

    // Email Kanalları
    (emailChannels || []).forEach(ch => {
        routingChannels.push({
            id: `email-${ch.id}`, rawId: ch.id, type: 'email',
            name: ch.email,
            groupLabel: ch.provider || 'E-posta',
            group: 'email',
            icon: Mail, color: '#EA4335'
        });
    });

    const groupDefs = [
        { key: 'chat', title: '💬 Chat Kanalları', borderColor: '#3b82f6' },
        { key: 'email', title: '📧 E-posta Kanalları', borderColor: '#EA4335' },
        { key: 'webforms', title: '📋 Web Formları', borderColor: '#8b5cf6' },
        { key: 'fbforms', title: '📋 Facebook Lead Formları', borderColor: '#FF6B35' },
        { key: 'aicall', title: '📞 AI Arama', borderColor: '#0d9488' },
        { key: 'comments', title: '💬 Yorumlar', borderColor: '#22c55e' }
    ];

    const getUnassignedCount = () => routingChannels.filter(ch => !channelAssignments[ch.id]?.funnelId).length;

    // Integrations styles
    const connectBtnStyle = { background: '#2563eb', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 };
    const settingsBtnStyle = { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '6px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 };
    const disconnectBtnStyle = { background: '#fef2f2', color: '#dc2626', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 };

    return (
        <div className="channels-container">
            <div className="channels-header">
                <div className="channels-title-row">
                    <h1>Kanallar ve Yönlendirme</h1>
                    <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>Kanallarınızı yönetin, yönlendirme kurallarını belirleyin</p>
                </div>

                {/* Quick Add Buttons */}
                <div className="quick-add-bar">
                    <span className="quick-add-label">Kanal Ekle:</span>
                    <button className="quick-add-btn facebook" onClick={() => handleOAuthConnect('facebook')}>
                        <Facebook size={16} />
                        Facebook
                    </button>
                    <button className="quick-add-btn instagram" onClick={() => handleOAuthConnect('instagram')}>
                        <Instagram size={16} />
                        Instagram
                    </button>
                    <button className="quick-add-btn whatsapp" onClick={() => setShowWhatsAppModal(true)}>
                        <MessageCircle size={16} />
                        WhatsApp
                    </button>
                    <button className="quick-add-btn retell" onClick={() => setShowRetellModal(true)}>
                        <Phone size={16} />
                        Sesli Arama
                    </button>
                    <button className="quick-add-btn email" onClick={handleEmailConnect}>
                        <Mail size={16} />
                        E-posta
                    </button>
                    <button className="quick-add-btn webform" onClick={() => setShowFormModal(true)}>
                        <FileText size={16} />
                        Web Form
                    </button>
                    <button className="quick-add-btn webwidget" onClick={() => { setWidgetModalMode('create'); setSelectedWidget(null); setShowWidgetModal(true); }}>
                        <Globe size={16} />
                        Web Widget
                    </button>
                    <button className="quick-add-btn health-system" onClick={() => { setHealthError(''); setHealthSuccess(''); setShowHealthModal(true); }}>
                        <Activity size={16} />
                        Sağlık Sistemi
                    </button>
                    <button className="quick-add-btn disao-crm" onClick={() => { setDisaoError(''); setDisaoSuccess(''); setShowDisaoModal(true); }}>
                        <Zap size={16} />
                        Disao CRM
                    </button>
                    <button className="quick-add-btn telsam" onClick={() => { setTelsamError(''); setTelsamSuccess(''); setShowTelsamModal(true); }}>
                        <PhoneCall size={16} />
                        Telsam Santral
                    </button>
                    <button className="quick-add-btn google-cal" onClick={openGoogleCalModal}>
                        <CalendarIcon size={16} />
                        Google Takvim
                    </button>
                </div>
            </div>

            <div className="channels-content">
                {loading ? (
                    <div className="loading">{t('channels.loading')}</div>
                ) : (
                    <div className="map-view">
                        {getUnassignedCount() > 0 && (
                            <div className="map-warning" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', fontWeight: 500, color: '#92400e' }}>
                                <AlertTriangle size={18} />
                                <span>{getUnassignedCount()} kanal henüz atanmamış!</span>
                            </div>
                        )}

                        <div className="map-table">
                            <div className="map-table-header">
                                <div className="map-col-channel">Kanal</div>
                                <div className="map-col-funnel">Hedef Akış</div>
                                <div className="map-col-stage">Aşama</div>
                                <div className="map-col-actions">İşlemler</div>
                            </div>

                            {routingChannels.length === 0 ? (
                                <div className="map-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '48px', color: '#9ca3af', textAlign: 'center' }}>
                                    <Globe size={32} />
                                    <p>Henüz kanal eklenmemiş.</p>
                                </div>
                            ) : (
                                groupDefs.map(g => {
                                    const groupChannels = routingChannels.filter(ch => ch.group === g.key);
                                    
                                    if (groupChannels.length === 0) return null;
                                    
                                    const renderChannels = (channelsToRender) => channelsToRender.map(ch => {
                                        const assignment = channelAssignments[ch.id] || {};
                                        const selectedFunnel = funnels.find(f => f.id === assignment.funnelId);
                                        const ChannelIcon = ch.icon;
                                        const isExpanded = expandedChannel === ch.id;
                                        const isSaving = savingChannel === ch.id;
                                        const isUnassigned = !assignment.funnelId;
                                        const isOverridden = channelOverrides[ch.id];

                                        return (
                                            <Fragment key={ch.id}>
                                                <div className={`map-row ${isUnassigned ? 'unassigned' : ''} ${isExpanded ? 'expanded' : ''} ${isSaving ? 'saving' : ''}`}>
                                                    <div className="map-col-channel" onClick={() => setExpandedChannel(isExpanded ? null : ch.id)} style={{ cursor: 'pointer' }}>
                                                        <div className="channel-info">
                                                            <div className="channel-icon-badge" style={{ background: `${ch.color}15` }}>
                                                                <ChannelIcon size={18} color={ch.color} />
                                                            </div>
                                                            <div>
                                                                <div className="channel-name">{ch.name}</div>
                                                                <div className="channel-type">
                                                                    {ch.groupLabel}
                                                                    {ch.leadCount > 0 && (
                                                                        <span className="lead-count-badge" style={{ marginLeft: '6px', fontSize: '11px', background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>{ch.leadCount} lead</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="map-col-funnel">
                                                        <select
                                                            className={`map-select ${isUnassigned ? 'empty' : ''}`}
                                                            style={{ fontWeight: isOverridden ? 600 : 400, color: isOverridden ? '#111827' : '#6b7280' }}
                                                            value={assignment.funnelId || ''}
                                                            onChange={e => handleChannelFunnelChange(ch.id, e.target.value)}
                                                            disabled={isSaving}
                                                        >
                                                            <option value="">Seçiniz...</option>
                                                            {funnels.map(f => (
                                                                <option key={f.id} value={f.id}>
                                                                    {f.name} {f.funnelType === 'MAIN' ? '(Ana)' : ''}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {isDefaultFunnel(assignment.funnelId) && (
                                                            <span className="default-badge">AI sınıflandırır</span>
                                                        )}
                                                    </div>

                                                    <div className="map-col-stage">
                                                        {selectedFunnel?.stages?.length > 0 ? (
                                                            <select
                                                                className="map-select map-select-sm"
                                                                style={{ fontWeight: isOverridden ? 600 : 400, color: isOverridden ? '#111827' : '#6b7280' }}
                                                                value={assignment.stageId || ''}
                                                                onChange={e => handleChannelStageChange(ch.id, e.target.value)}
                                                                disabled={isSaving}
                                                            >
                                                                <option value="">İlk aşama</option>
                                                                {selectedFunnel.stages.map(s => (
                                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <span className="stage-na">—</span>
                                                        )}
                                                    </div>

                                                    <div className="map-col-actions">
                                                        <button
                                                            className="detail-rules-btn"
                                                            onClick={(e) => { e.stopPropagation(); handleChannelSettings(ch); }}
                                                            title="Kanal ayarları"
                                                        >
                                                            <Settings size={16} />
                                                        </button>
                                                        <button
                                                            className="action-btn delete"
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteChannel(ch); }}
                                                            title="Kanalı sil"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="detail-rules-panel">
                                                        <div className="detail-rules-header">
                                                            <span>📋 İçerik Kuralları — {ch.name}</span>
                                                            <button
                                                                className="btn-add-detail-rule"
                                                                onClick={() => {
                                                                    setDetailRuleChannel(ch);
                                                                    setDetailRuleForm({
                                                                        name: '',
                                                                        conditionType: 'KEYWORD',
                                                                        conditions: { keywords: '', matchMode: 'ANY', aiDescription: '', timeStart: '09:00', timeEnd: '18:00', days: [] },
                                                                        targetFunnelId: '',
                                                                        targetStageId: ''
                                                                    });
                                                                    setShowDetailRuleModal(true);
                                                                }}
                                                            >
                                                                <Plus size={14} /> Kural Ekle
                                                            </button>
                                                        </div>
                                                        <div className="detail-rules-list">
                                                            {getDetailRulesForChannel(ch.id).length === 0 ? (
                                                                <div className="detail-rules-empty">
                                                                    İçerik kuralı yok. Tüm mesajlar varsayılan hedefe gider.
                                                                </div>
                                                            ) : (
                                                                getDetailRulesForChannel(ch.id).map(rule => (
                                                                    <div key={rule.id} className="detail-rule-item">
                                                                        <div className="detail-rule-condition">
                                                                            {renderConditionBadge(rule.conditionType)}
                                                                            {renderConditionPreview(rule)}
                                                                        </div>
                                                                        <ArrowRight size={16} color="#9ca3af" />
                                                                        <div className="detail-rule-target">
                                                                            {getTargetName(rule.targetFunnelId, rule.targetStageId)}
                                                                        </div>
                                                                        <button className="action-btn delete" onClick={() => handleDeleteClassifierRule(rule.id)}>
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                        <div className="detail-rules-footer">
                                                            Eşleşme yoksa → <strong>{getTargetName(assignment.funnelId, assignment.stageId)}</strong>
                                                        </div>
                                                    </div>
                                                )}
                                            </Fragment>
                                        );
                                    });

                                    const selectedGroupFunnelId = groupAssignments[g.key]?.funnelId || '';
                                    const selectedGroupFunnel = funnels.find(f => f.id === selectedGroupFunnelId);

                                    return (
                                        <div key={g.key} className="map-group">
                                            <div className="map-group-header-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: g.borderColor + '08', borderLeft: `4px solid ${g.borderColor}` }}>
                                                <span style={{ flex: 1, fontWeight: 600, fontSize: '14px' }}>{g.title}</span>
                                                <select 
                                                    value={groupAssignments[g.key]?.funnelId || ''} 
                                                    onChange={e => handleGroupFunnelChange(g.key, e.target.value)}
                                                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                                >
                                                    <option value="">Akış seçin</option>
                                                    {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                                </select>
                                                {selectedGroupFunnel?.stages?.length > 0 && (
                                                    <select 
                                                        value={groupAssignments[g.key]?.stageId || ''} 
                                                        onChange={e => handleGroupStageChange(g.key, e.target.value)}
                                                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                                    >
                                                        <option value="">Aşama seçin</option>
                                                        {selectedGroupFunnel.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                    </select>
                                                )}
                                                <span style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: 500 }}>(miras)</span>
                                            </div>
                                            
                                            {renderChannels(groupChannels)}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Entegrasyonlar */}
                        <div style={{ marginTop: '32px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Unplug size={20} /> Entegrasyonlar
                            </h2>
                            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>Harici sistem bağlantıları</p>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                {/* Disao CRM Card */}
                                <div className="channels-integration-card card-disao">
                                    <div>
                                        <div className="integration-card-header">
                                            <div className="integration-icon-wrap" style={{ background: '#f5f3ff' }}>
                                                <Zap size={22} color="#8b5cf6" />
                                            </div>
                                            <div className="integration-title-group">
                                                <h3>Disao CRM</h3>
                                                <span className={`integration-status-pill ${disaoConnection ? 'connected' : 'disconnected'}`}>
                                                    ● {disaoConnection ? 'Bağlı' : 'Bağlı Değil'}
                                                </span>
                                            </div>
                                        </div>
                                        {disaoConnection && (
                                            <div className="integration-card-body">
                                                {disaoConnection.email || disaoConnection.username}
                                            </div>
                                        )}
                                    </div>
                                    <div className="integration-card-actions">
                                        {disaoConnection ? (
                                            <>
                                                <button onClick={() => { setDisaoError(''); setDisaoSuccess(''); setShowDisaoModal(true); }} className="btn-integration-settings">Ayarlar</button>
                                                <button onClick={handleDeleteDisaoCrm} className="btn-integration-disconnect">Bağlantıyı Kes</button>
                                            </>
                                        ) : (
                                            <button onClick={() => { setDisaoError(''); setDisaoSuccess(''); setShowDisaoModal(true); }} className="btn-integration-connect">Bağlan</button>
                                        )}
                                    </div>
                                </div>
                                
                                {/* HBYS Card */}
                                <div className="channels-integration-card card-hbys">
                                    <div>
                                        <div className="integration-card-header">
                                            <div className="integration-icon-wrap" style={{ background: '#f5f3ff' }}>
                                                <Activity size={22} color="#7c3aed" />
                                            </div>
                                            <div className="integration-title-group">
                                                <h3>Sağlık Sistemi (HBYS)</h3>
                                                <span className={`integration-status-pill ${healthConnection ? 'connected' : 'disconnected'}`}>
                                                    ● {healthConnection ? 'Bağlı' : 'Bağlı Değil'}
                                                </span>
                                            </div>
                                        </div>
                                        {healthConnection && (
                                            <div className="integration-card-body">
                                                {healthConnection.baseUrl}
                                            </div>
                                        )}
                                    </div>
                                    <div className="integration-card-actions">
                                        {healthConnection ? (
                                            <button onClick={() => { setHealthError(''); setHealthSuccess(''); setShowHealthModal(true); }} className="btn-integration-settings">Ayarlar</button>
                                        ) : (
                                            <button onClick={() => { setHealthError(''); setHealthSuccess(''); setShowHealthModal(true); }} className="btn-integration-connect">Bağlan</button>
                                        )}
                                    </div>
                                </div>

                                {/* Telsam Card */}
                                <div className="channels-integration-card card-telsam">
                                    <div>
                                        <div className="integration-card-header">
                                            <div className="integration-icon-wrap" style={{ background: '#f0f9ff' }}>
                                                <PhoneCall size={22} color="#0284c7" />
                                            </div>
                                            <div className="integration-title-group">
                                                <h3>Telsam Santral</h3>
                                                <span className={`integration-status-pill ${telsamConfig ? 'connected' : 'disconnected'}`}>
                                                    ● {telsamConfig ? 'Bağlı' : 'Bağlı Değil'}
                                                </span>
                                            </div>
                                        </div>
                                        {telsamConfig && (
                                            <div className="integration-card-body">
                                                {telsamConfig.siteUrl}
                                            </div>
                                        )}
                                    </div>
                                    <div className="integration-card-actions">
                                        {telsamConfig ? (
                                            <>
                                                <button onClick={() => { setTelsamError(''); setTelsamSuccess(''); setShowTelsamModal(true); }} className="btn-integration-settings">Ayarlar</button>
                                                <button onClick={handleDeleteTelsam} className="btn-integration-disconnect">Bağlantıyı Kes</button>
                                            </>
                                        ) : (
                                            <button onClick={() => { setTelsamError(''); setTelsamSuccess(''); setShowTelsamModal(true); }} className="btn-integration-connect">Bağlan</button>
                                        )}
                                    </div>
                                </div>

                                {/* Google Takvim Card */}
                                <div className="channels-integration-card card-google-cal">
                                    <div>
                                        <div className="integration-card-header">
                                            <div className="integration-icon-wrap" style={{ background: '#eff6ff' }}>
                                                <svg viewBox="0 0 24 24" width="22" height="22">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                                </svg>
                                            </div>
                                            <div className="integration-title-group">
                                                <h3>Google Takvim</h3>
                                                <span className={`integration-status-pill ${googleCalConfig?.isConfigured ? 'connected' : 'disconnected'}`}>
                                                    ● {googleCalConfig?.isConfigured ? 'Yapılandırıldı' : 'Yapılandırılmadı'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="integration-card-body">
                                            {googleCalConfig?.connectedUsersCount > 0
                                                ? `${googleCalConfig.connectedUsersCount} temsilci bağlı`
                                                : googleCalConfig?.isConfigured
                                                    ? 'Kullanıma hazır (Temsilciler bağlayabilir)'
                                                    : 'Temsilci senkronizasyonu için Client ID girin'}
                                        </div>
                                    </div>
                                    <div className="integration-card-actions">
                                        {googleCalConfig?.isConfigured ? (
                                            <>
                                                <button onClick={openGoogleCalModal} className="btn-integration-settings">Ayarlar</button>
                                                {googleCalConfig?.source === 'workspace' && (
                                                    <button onClick={handleDeleteGoogleCalConfig} className="btn-integration-disconnect">Sıfırla</button>
                                                )}
                                            </>
                                        ) : (
                                            <button onClick={openGoogleCalModal} className="btn-integration-connect">Yapılandır</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Bar */}
                        <div className="map-stats" style={{ display: 'flex', gap: '24px', padding: '16px', background: '#f9fafb', borderRadius: '8px', marginTop: '32px' }}>
                            <div><span style={{ fontWeight: 700 }}>{routingChannels.length}</span> Kanal</div>
                            <div><span style={{ fontWeight: 700 }}>{funnels.length}</span> Akış</div>
                            <div><span style={{ fontWeight: 700 }}>{classifierRules.length}</span> Kural</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Form Webhook Modal */}
            {showFormModal && (
                <div className="modal-overlay" onClick={() => setShowFormModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Yeni Form Entegrasyonu</h2>
                            <button className="btn-icon" onClick={() => setShowFormModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Form Adı *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ör. Ana Sayfa İletişim Formu"
                                    value={newFormName}
                                    onChange={(e) => setNewFormName(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Site URL'si *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ör. https://siteniz.com"
                                    value={newSiteUrl}
                                    onChange={(e) => setNewSiteUrl(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowFormModal(false)}>
                                İptal
                            </button>
                            <button className="btn btn-primary" onClick={handleCreateFormWebhook}>
                                Oluştur
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp Modal */}
            {showWhatsAppModal && (
                <div className="modal-overlay" onClick={() => setShowWhatsAppModal(false)}>
                    <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>WhatsApp Ayarları</h2>
                            <button className="btn-icon" onClick={() => setShowWhatsAppModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <WhatsAppSettings
                                workspaceId={currentWorkspace.id}
                                aiBots={aiBots}
                                assigningBot={assigningBot}
                                onAssignBot={(type, id, botId) => handleAssignBot(type, id, botId)}
                                onClose={() => {
                                    setShowWhatsAppModal(false);
                                    loadAllChannels(); // Refresh channels list
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Retell Modal */}
            {showRetellModal && (
                <div className="modal-overlay" onClick={() => setShowRetellModal(false)}>
                    <div className="modal-content modal-xl" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Sesli Arama (AI Call)</h2>
                            <button className="btn-icon" onClick={() => setShowRetellModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
                                Yapay zeka destekli sesli arama entegrasyonu. API anahtarınızı AI Call Dashboard'dan alın.
                            </p>
                            <RetellSettings onSave={() => loadAllChannels()} hideAgentManager={true} />
                        </div>
                    </div>
                </div>
            )}

            {/* Page Selection Modal */}
            {showPageSelectModal && (
                <div className="modal-overlay" onClick={() => setShowPageSelectModal(false)}>
                    <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>
                                {pageSelectChannelType === 'instagram' ? 'Instagram Hesabı Seçin' : 'Facebook Sayfası Seçin'}
                            </h2>
                            <button className="btn-icon" onClick={() => setShowPageSelectModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '12px', color: '#64748b' }}>
                                Bağlamak istediğiniz {pageSelectChannelType === 'instagram' ? 'hesapları' : 'sayfaları'} seçin:
                            </p>

                            {/* Search Input */}
                            <div style={{ marginBottom: '16px' }}>
                                <input
                                    type="text"
                                    placeholder="Sayfa ara..."
                                    value={pageSearchTerm}
                                    onChange={(e) => setPageSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}
                                />
                            </div>

                            {/* Page Count */}
                            <div style={{ marginBottom: '8px', fontSize: '13px', color: '#64748b' }}>
                                {availablePages.filter(page =>
                                    page.name.toLowerCase().includes(pageSearchTerm.toLowerCase()) ||
                                    page.id.includes(pageSearchTerm)
                                ).length} / {availablePages.length} sayfa
                            </div>

                            <div className="page-selection-list">
                                {availablePages
                                    .filter(page =>
                                        page.name.toLowerCase().includes(pageSearchTerm.toLowerCase()) ||
                                        page.id.includes(pageSearchTerm)
                                    )
                                    .map(page => (
                                        <div
                                            key={page.id}
                                            className={`page-selection-item ${selectedPages.includes(page.id) ? 'selected' : ''}`}
                                            onClick={() => togglePageSelection(page.id)}
                                        >
                                            <div className="page-selection-checkbox">
                                                {selectedPages.includes(page.id) ? (
                                                    <CheckCircle size={24} color="#16a34a" />
                                                ) : (
                                                    <div className="empty-checkbox" />
                                                )}
                                            </div>
                                            <div className="page-selection-info">
                                                <div className="page-selection-name">{page.name}</div>
                                                <div className="page-selection-id">ID: {page.id}</div>
                                                {pageSelectChannelType === 'instagram' && page.instagram_business_account && (
                                                    <div className="page-selection-instagram">
                                                        <Instagram size={14} />
                                                        @{page.instagram_business_account.username}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowPageSelectModal(false)}>
                                İptal
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleConnectSelectedPages}
                                disabled={selectedPages.length === 0 || connectingPages}
                            >
                                {connectingPages ? 'Bağlanıyor...' : `${selectedPages.length} Sayfa Bağla`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Provider Selection Modal */}
            {showEmailModal && (
                <div className="modal-overlay" onClick={() => setShowEmailModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h3><Mail size={20} /> E-posta Bağlantısı</h3>
                            <button className="btn-icon-sm" onClick={() => setShowEmailModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {!emailProvider ? (
                                /* Step 1: Choose Provider Type */
                                <div className="email-provider-selection">
                                    <p style={{ marginBottom: '1rem', color: '#666' }}>Hangi e-posta sağlayıcısını kullanıyorsunuz?</p>

                                    <button
                                        className="provider-option-btn"
                                        onClick={handleGmailConnect}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            width: '100%', padding: '16px', marginBottom: '12px',
                                            border: '2px solid #e5e7eb', borderRadius: '12px',
                                            background: '#fff', cursor: 'pointer', textAlign: 'left'
                                        }}
                                    >
                                        <div style={{
                                            width: '48px', height: '48px', borderRadius: '10px',
                                            background: '#EA4335',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Mail size={24} color="#fff" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '600', fontSize: '16px' }}>Gmail</div>
                                            <div style={{ color: '#666', fontSize: '13px' }}>Google hesabınızla giriş yapın</div>
                                        </div>
                                    </button>

                                    <button
                                        className="provider-option-btn"
                                        onClick={() => setEmailProvider('imap')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            width: '100%', padding: '16px',
                                            border: '2px solid #e5e7eb', borderRadius: '12px',
                                            background: '#fff', cursor: 'pointer', textAlign: 'left'
                                        }}
                                    >
                                        <div style={{
                                            width: '48px', height: '48px', borderRadius: '10px',
                                            background: '#6366f1',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Mail size={24} color="#fff" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '600', fontSize: '16px' }}>Diğer (IMAP/SMTP)</div>
                                            <div style={{ color: '#666', fontSize: '13px' }}>Yandex, Outlook, Webmail vb.</div>
                                        </div>
                                    </button>
                                </div>
                            ) : (
                                /* Step 2: IMAP/SMTP Form */
                                <div className="imap-form">
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label>E-posta Sağlayıcı</label>
                                        <select
                                            value={imapForm.preset}
                                            onChange={(e) => handleImapPresetChange(e.target.value)}
                                            className="form-control"
                                        >
                                            <option value="yandex">Yandex</option>
                                            <option value="outlook">Outlook / Hotmail</option>
                                            <option value="custom">Özel (Webmail)</option>
                                        </select>
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label>E-posta Adresi</label>
                                        <input
                                            type="email"
                                            value={imapForm.email}
                                            onChange={(e) => setImapForm(prev => ({ ...prev, email: e.target.value }))}
                                            placeholder="ornek@yandex.com"
                                            className="form-control"
                                        />
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label>Şifre / Uygulama Şifresi</label>
                                        <input
                                            type="password"
                                            value={imapForm.password}
                                            onChange={(e) => setImapForm(prev => ({ ...prev, password: e.target.value }))}
                                            placeholder="••••••••"
                                            className="form-control"
                                        />
                                        {imapForm.preset === 'yandex' && (
                                            <div style={{ marginTop: '8px', padding: '10px', background: '#FEF3C7', borderRadius: '8px', fontSize: '12px' }}>
                                                <strong>⚠️ Yandex için:</strong>
                                                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                                                    <li>2FA kapalıysa normal şifrenizi kullanabilirsiniz</li>
                                                    <li>2FA açıksa <strong>Uygulama Şifresi</strong> gereklidir:</li>
                                                </ul>
                                                <div style={{ marginTop: '6px', paddingLeft: '16px' }}>
                                                    1. <a href="https://id.yandex.com/security/app-passwords" target="_blank" rel="noopener" style={{ color: '#2563EB' }}>id.yandex.com/security/app-passwords</a> adresine gidin<br />
                                                    2. "Şifre oluştur" butonuna tıklayın<br />
                                                    3. Uygulama adı girin (ör. Instomer)<br />
                                                    4. Oluşturulan şifreyi buraya yapıştırın
                                                </div>
                                            </div>
                                        )}
                                        {imapForm.preset === 'outlook' && (
                                            <small style={{ color: '#666', fontSize: '12px' }}>
                                                ⚠️ Microsoft hesap şifrenizi kullanın
                                            </small>
                                        )}
                                    </div>

                                    {imapForm.preset === 'custom' && (
                                        <>
                                            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '10px', marginBottom: '1rem' }}>
                                                <div className="form-group">
                                                    <label>IMAP Host</label>
                                                    <input
                                                        type="text"
                                                        value={imapForm.imapHost}
                                                        onChange={(e) => setImapForm(prev => ({ ...prev, imapHost: e.target.value }))}
                                                        placeholder="mail.domain.com"
                                                        className="form-control"
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Port</label>
                                                    <input
                                                        type="number"
                                                        value={imapForm.imapPort}
                                                        onChange={(e) => setImapForm(prev => ({ ...prev, imapPort: parseInt(e.target.value) || 993 }))}
                                                        className="form-control"
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '10px', marginBottom: '1rem' }}>
                                                <div className="form-group">
                                                    <label>SMTP Host</label>
                                                    <input
                                                        type="text"
                                                        value={imapForm.smtpHost}
                                                        onChange={(e) => setImapForm(prev => ({ ...prev, smtpHost: e.target.value }))}
                                                        placeholder="mail.domain.com"
                                                        className="form-control"
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Port</label>
                                                    <input
                                                        type="number"
                                                        value={imapForm.smtpPort}
                                                        onChange={(e) => setImapForm(prev => ({ ...prev, smtpPort: parseInt(e.target.value) || 465 }))}
                                                        className="form-control"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        {emailProvider === 'imap' && (
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setEmailProvider('')}>
                                    Geri
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleImapConnect}
                                    disabled={connectingEmail || !imapForm.email || !imapForm.password}
                                >
                                    {connectingEmail ? 'Bağlanıyor...' : 'Bağlan'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Health System Connection Modal */}
            {showHealthModal && (
                <div className="modal-overlay" onClick={() => setShowHealthModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Activity size={20} color="#7c3aed" />
                                Sağlık Sistemi API Bağlantısı
                            </h2>
                            <button className="btn-icon" onClick={() => setShowHealthModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ padding: '24px' }}>
                            {healthConnection ? (
                                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                        <CheckCircle size={28} color="#059669" />
                                    </div>
                                    <h3 style={{ margin: '0 0 4px', color: '#1f2937', fontSize: '16px' }}>Bağlantı Aktif</h3>
                                    <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '13px' }}>{healthConnection.baseUrl}</p>
                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                        <button
                                            className="btn btn-secondary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                                            disabled={healthTesting}
                                            onClick={async () => {
                                                setHealthTesting(true);
                                                try {
                                                    const res = await healthSystemAPI.test(currentWorkspace.id, { integrationId: healthConnection.id });
                                                    alert(res.data.success ? '✅ ' + res.data.message : '❌ ' + res.data.message);
                                                } catch (e) {
                                                    alert('❌ Bağlantı testi başarısız.');
                                                } finally {
                                                    setHealthTesting(false);
                                                }
                                            }}
                                        >
                                            {healthTesting ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                                            Test Et
                                        </button>
                                        <button
                                            className="btn btn-secondary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#ef4444' }}
                                            onClick={async () => {
                                                if (!window.confirm('Sağlık sistemi bağlantısını kesmek istediğinize emin misiniz?')) return;
                                                try {
                                                    await healthSystemAPI.disconnect(currentWorkspace.id, healthConnection.id);
                                                    setHealthConnection(null);
                                                    loadAllChannels();
                                                    alert('Bağlantı kesildi.');
                                                } catch (e) {
                                                    alert('Bağlantı kesilirken hata oluştu.');
                                                }
                                            }}
                                        >
                                            <Unplug size={14} />
                                            Bağlantıyı Kes
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px', lineHeight: '1.6' }}>
                                        Hastane bilgi yönetim sisteminize (HBYS) bağlanmak için API bilgilerinizi girin.
                                        Bağlantı kurulduktan sonra AI asistanınız bu sistem üzerinden randevu işlemlerini gerçekleştirebilir.
                                    </p>

                                    {healthError && (
                                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#dc2626' }}>
                                            <AlertCircle size={16} />
                                            {healthError}
                                        </div>
                                    )}

                                    {healthSuccess && (
                                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#16a34a' }}>
                                            <CheckCircle size={16} />
                                            {healthSuccess}
                                        </div>
                                    )}

                                    <div className="form-group" style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>API Adresi *</label>
                                        <input
                                            type="url"
                                            className="form-input"
                                            placeholder="https://example.com/DynamicDataApi"
                                            value={healthForm.apiUrl}
                                            onChange={e => setHealthForm(prev => ({ ...prev, apiUrl: e.target.value }))}
                                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Kullanıcı Adı *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="API kullanıcı adı"
                                            value={healthForm.username}
                                            onChange={e => setHealthForm(prev => ({ ...prev, username: e.target.value }))}
                                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Şifre *</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="API şifresi"
                                            value={healthForm.password}
                                            onChange={e => setHealthForm(prev => ({ ...prev, password: e.target.value }))}
                                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '6px' }}>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Bağlantı Adı</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Sağlık Sistemi API"
                                            value={healthForm.name}
                                            onChange={e => setHealthForm(prev => ({ ...prev, name: e.target.value }))}
                                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {!healthConnection && (
                            <div className="modal-footer" style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#f9fafb' }}>
                                <button className="btn btn-secondary" onClick={() => setShowHealthModal(false)}>İptal</button>
                                <button
                                    className="btn btn-primary"
                                    disabled={healthConnecting || !healthForm.apiUrl || !healthForm.username || !healthForm.password}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                                    onClick={async () => {
                                        setHealthConnecting(true);
                                        setHealthError('');
                                        setHealthSuccess('');
                                        try {
                                            const res = await healthSystemAPI.connect(currentWorkspace.id, healthForm);
                                            if (res.data.success) {
                                                setHealthSuccess(res.data.message);
                                                setHealthConnection(res.data.integration);
                                                setTimeout(() => {
                                                    setShowHealthModal(false);
                                                    loadAllChannels();
                                                }, 1500);
                                            } else {
                                                setHealthError(res.data.error || 'Bağlantı kurulamadı.');
                                            }
                                        } catch (e) {
                                            setHealthError(e.response?.data?.error || 'Bağlantı kurulamadı. Bilgilerinizi kontrol edin.');
                                        } finally {
                                            setHealthConnecting(false);
                                        }
                                    }}
                                >
                                    {healthConnecting ? <><Loader2 size={16} className="spin" /> Bağlanıyor...</> : <><Shield size={16} /> Bağlan</>}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* Telsam PBX Modal */}
            {showTelsamModal && (
                <div className="modal-overlay" onClick={() => setShowTelsamModal(false)}>
                    <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>📞 Telsam Santral Ayarları</h3>
                            <button className="modal-close" onClick={() => setShowTelsamModal(false)}><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            {telsamError && <div className="alert alert-error"><AlertCircle size={16} /> {telsamError}</div>}
                            {telsamSuccess && <div className="alert alert-success"><CheckCircle size={16} /> {telsamSuccess}</div>}
                            
                            <div className="form-group">
                                <label>Santral Adresi (Site URL)</label>
                                <input
                                    type="text"
                                    placeholder="pbx.sirketiniz.telsam.com.tr"
                                    value={telsamForm.siteUrl}
                                    onChange={e => setTelsamForm(f => ({ ...f, siteUrl: e.target.value }))}
                                />
                                <small style={{ color: '#64748b', fontSize: 11 }}>Telsam panelinizden aldığınız santral adresi</small>
                            </div>
                            <div className="form-group">
                                <label>API Kullanıcı Adı</label>
                                <input
                                    type="text"
                                    placeholder="api_kullanici"
                                    value={telsamForm.username}
                                    onChange={e => setTelsamForm(f => ({ ...f, username: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label>API Şifresi</label>
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={telsamForm.password}
                                    onChange={e => setTelsamForm(f => ({ ...f, password: e.target.value }))}
                                />
                            </div>

                            {telsamConfig && (
                                <div style={{ marginTop: 16, padding: '12px 16px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0284c7', marginBottom: 4 }}>📡 Webhook URL</div>
                                    <div style={{ fontSize: 11, color: '#475569', wordBreak: 'break-all' }}>
                                        {window.location.origin.replace('3000', '3001')}/api/telsam/webhook/{currentWorkspace?.id}
                                    </div>
                                    <small style={{ color: '#64748b', fontSize: 10 }}>Bu URL'yi Telsam panelinizdeki API Entegrasyonları bölümüne ekleyin</small>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-outline"
                                onClick={handleTelsamTest}
                                disabled={telsamTesting || !telsamForm.siteUrl}
                            >
                                {telsamTesting ? <><Loader2 size={14} className="spin" /> Test Ediliyor...</> : '🔌 Bağlantı Testi'}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleTelsamSave}
                                disabled={telsamConnecting}
                            >
                                {telsamConnecting ? <><Loader2 size={14} className="spin" /> Kaydediliyor...</> : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Web Widget Modal */}
            {showWidgetModal && (
                <WebWidgetModal
                    workspaceId={currentWorkspace?.id}
                    mode={widgetModalMode}
                    widget={selectedWidget}
                    onClose={() => { setShowWidgetModal(false); setSelectedWidget(null); }}
                    onSave={() => { setShowWidgetModal(false); loadAllChannels(); }}
                />
            )}

            {/* Disao CRM Settings Modal */}
            {showDisaoModal && (
                <DisaoSettingsModal
                    isOpen={showDisaoModal}
                    onClose={() => setShowDisaoModal(false)}
                    onSaved={() => loadAllChannels()}
                />
            )}
            {/* Detail Rule Modal */}
            {showDetailRuleModal && (
                <div className="modal-overlay" onClick={() => setShowDetailRuleModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <div className="modal-header">
                            <h3>İçerik Kuralı Ekle — {detailRuleChannel?.name}</h3>
                            <button className="close-btn" onClick={() => setShowDetailRuleModal(false)}><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Kural Adı</label>
                                <input className="form-control" value={detailRuleForm.name} onChange={e => setDetailRuleForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör: Fiyat soruları" />
                            </div>
                            <div className="form-group">
                                <label>Koşul Tipi</label>
                                <div className="condition-tabs">
                                    {['KEYWORD', 'TIME', 'AI'].map(t => (
                                        <button key={t} className={`condition-tab ${detailRuleForm.conditionType === t ? 'active' : ''}`} onClick={() => setDetailRuleForm(f => ({ ...f, conditionType: t }))}>
                                            {t === 'KEYWORD' ? '🔤 Kelime' : t === 'TIME' ? '⏰ Zaman' : '🧠 AI'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {detailRuleForm.conditionType === 'KEYWORD' && (
                                <div className="form-group">
                                    <label>Anahtar Kelimeler (virgülle ayırın)</label>
                                    <input className="form-control" value={detailRuleForm.conditions.keywords} onChange={e => setDetailRuleForm(f => ({ ...f, conditions: { ...f.conditions, keywords: e.target.value } }))} placeholder="fiyat, peşinat, ödeme" />
                                </div>
                            )}
                            {detailRuleForm.conditionType === 'TIME' && (
                                <div className="form-group" style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label>Başlangıç</label>
                                        <input type="time" className="form-control" value={detailRuleForm.conditions.timeStart} onChange={e => setDetailRuleForm(f => ({ ...f, conditions: { ...f.conditions, timeStart: e.target.value } }))} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label>Bitiş</label>
                                        <input type="time" className="form-control" value={detailRuleForm.conditions.timeEnd} onChange={e => setDetailRuleForm(f => ({ ...f, conditions: { ...f.conditions, timeEnd: e.target.value } }))} />
                                    </div>
                                </div>
                            )}
                            {detailRuleForm.conditionType === 'AI' && (
                                <div className="form-group">
                                    <label>AI Açıklaması</label>
                                    <textarea className="form-control" rows={3} value={detailRuleForm.conditions.aiDescription} onChange={e => setDetailRuleForm(f => ({ ...f, conditions: { ...f.conditions, aiDescription: e.target.value } }))} placeholder="Müşteri randevu talep ediyorsa..." />
                                </div>
                            )}
                            <div className="form-group">
                                <label>Hedef Akış</label>
                                <select className="form-control" value={detailRuleForm.targetFunnelId} onChange={e => setDetailRuleForm(f => ({ ...f, targetFunnelId: e.target.value, targetStageId: '' }))}>
                                    <option value="">Akış seçin</option>
                                    {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            </div>
                            {detailRuleForm.targetFunnelId && (() => {
                                const sf = funnels.find(f => f.id === detailRuleForm.targetFunnelId);
                                return sf?.stages?.length > 0 ? (
                                    <div className="form-group">
                                        <label>Aşama</label>
                                        <select className="form-control" value={detailRuleForm.targetStageId} onChange={e => setDetailRuleForm(f => ({ ...f, targetStageId: e.target.value }))}>
                                            <option value="">İlk aşama</option>
                                            {sf.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                ) : null;
                            })()}
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowDetailRuleModal(false)}>İptal</button>
                            <button className="btn-primary" onClick={handleSaveDetailRule} disabled={!detailRuleForm.targetFunnelId}>Kaydet</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Rule Modal */}
            {showRuleModal && (
                <div className="modal-overlay" onClick={() => setShowRuleModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
                        <div className="modal-header">
                            <h3>{editingRule ? 'Kuralı Düzenle' : 'Yeni Kural'}</h3>
                            <button className="close-btn" onClick={() => setShowRuleModal(false)}><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Kural Adı</label>
                                <input className="form-control" value={ruleFormData.name} onChange={e => setRuleFormData(f => ({ ...f, name: e.target.value }))} placeholder="Ör: Fiyat soruları → Satış" />
                            </div>
                            <div className="form-group">
                                <label>Koşul Tipi</label>
                                <div className="condition-tabs">
                                    {['KEYWORD', 'AI', 'CHANNEL', 'TIME', 'DEFAULT'].map(t => (
                                        <button key={t} className={`condition-tab ${ruleFormData.conditionType === t ? 'active' : ''}`} onClick={() => setRuleFormData(f => ({ ...f, conditionType: t }))}>
                                            {t === 'KEYWORD' ? '🔤 Kelime' : t === 'AI' ? '🧠 AI' : t === 'CHANNEL' ? '📡 Kanal' : t === 'TIME' ? '⏰ Zaman' : '🎯 Varsayılan'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {ruleFormData.conditionType === 'KEYWORD' && (
                                <div className="form-group">
                                    <label>Anahtar Kelimeler</label>
                                    <input className="form-control" value={ruleFormData.conditions.keywords} onChange={e => setRuleFormData(f => ({ ...f, conditions: { ...f.conditions, keywords: e.target.value } }))} placeholder="fiyat, taksit, peşinat" />
                                </div>
                            )}
                            {ruleFormData.conditionType === 'AI' && (
                                <div className="form-group">
                                    <label>AI Açıklaması</label>
                                    <textarea className="form-control" rows={3} value={ruleFormData.conditions.aiDescription} onChange={e => setRuleFormData(f => ({ ...f, conditions: { ...f.conditions, aiDescription: e.target.value } }))} placeholder="Müşteri ne isterse bu kurala düşsün?" />
                                </div>
                            )}
                            {ruleFormData.conditionType === 'TIME' && (
                                <div className="form-group" style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label>Başlangıç</label>
                                        <input type="time" className="form-control" value={ruleFormData.conditions.timeStart || ''} onChange={e => setRuleFormData(f => ({ ...f, conditions: { ...f.conditions, timeStart: e.target.value } }))} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label>Bitiş</label>
                                        <input type="time" className="form-control" value={ruleFormData.conditions.timeEnd || ''} onChange={e => setRuleFormData(f => ({ ...f, conditions: { ...f.conditions, timeEnd: e.target.value } }))} />
                                    </div>
                                </div>
                            )}
                            <div className="form-group">
                                <label>Hedef Akış</label>
                                <select className="form-control" value={ruleFormData.targetFunnelId} onChange={e => setRuleFormData(f => ({ ...f, targetFunnelId: e.target.value, targetStageId: '' }))}>
                                    <option value="">Akış seçin</option>
                                    {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            </div>
                            {ruleFormData.targetFunnelId && (() => {
                                const sf = funnels.find(f => f.id === ruleFormData.targetFunnelId);
                                return sf?.stages?.length > 0 ? (
                                    <div className="form-group">
                                        <label>Aşama</label>
                                        <select className="form-control" value={ruleFormData.targetStageId} onChange={e => setRuleFormData(f => ({ ...f, targetStageId: e.target.value }))}>
                                            <option value="">İlk aşama</option>
                                            {sf.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                ) : null;
                            })()}
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowRuleModal(false)}>İptal</button>
                            <button className="btn-primary" onClick={handleSaveRule} disabled={!ruleFormData.targetFunnelId || !ruleFormData.name}>Kaydet</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Facebook/Instagram Kanal Ayarları Modalı ─── */}
            {showPageSettingsModal && (
                <div className="modal-overlay" onClick={() => setShowPageSettingsModal(null)}>
                    <div className="modal" style={{ width: '500px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {showPageSettingsModal.type === 'facebook' ? <Facebook size={18} /> : <Instagram size={18} />}
                                {showPageSettingsModal.name}
                            </h3>
                            <button className="modal-close" onClick={() => setShowPageSettingsModal(null)}><X size={18} /></button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                            {/* Webhook Sağlık Kontrolü */}
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Activity size={15} /> Webhook Durumu
                                </div>
                                {pageHealth ? (
                                    <div style={{ padding: '8px 12px', borderRadius: 8, background: pageHealth.healthy ? '#ecfdf5' : '#fef2f2', color: pageHealth.healthy ? '#065f46' : '#991b1b', fontSize: '0.82rem' }}>
                                        {pageHealth.healthy ? (
                                            <><CheckCircle size={14} style={{ marginRight: 6 }} />Webhook bağlantısı aktif</>
                                        ) : (
                                            <><AlertCircle size={14} style={{ marginRight: 6 }} />{pageHealth.error || 'Webhook bağlantısı kopuk'}</>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            className="btn-secondary"
                                            disabled={pageHealthLoading}
                                            onClick={async () => {
                                                setPageHealthLoading(true);
                                                try {
                                                    const res = await facebookAPI.checkPageHealth(showPageSettingsModal.rawId);
                                                    setPageHealth(res.data);
                                                } catch (e) {
                                                    setPageHealth({ healthy: false, error: e.response?.data?.error || e.message });
                                                } finally {
                                                    setPageHealthLoading(false);
                                                }
                                            }}
                                            style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                                        >
                                            {pageHealthLoading ? <Loader2 size={14} className="spin" /> : <Shield size={14} />}
                                            {' '}Kontrol Et
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Webhook Yeniden Abone */}
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <RefreshCcw size={15} /> Webhook Yeniden Bağla
                                </div>
                                <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 10px' }}>
                                    Mesajlar gelmiyorsa webhook'u yeniden bağlayabilirsiniz.
                                </p>
                                <button
                                    className="btn-secondary"
                                    disabled={pageResubscribing}
                                    onClick={async () => {
                                        setPageResubscribing(true);
                                        try {
                                            await facebookAPI.resubscribeWebhook(showPageSettingsModal.rawId);
                                            alert('✅ Webhook başarıyla yeniden bağlandı!');
                                        } catch (e) {
                                            alert('❌ Hata: ' + (e.response?.data?.error || e.message));
                                        } finally {
                                            setPageResubscribing(false);
                                        }
                                    }}
                                    style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                                >
                                    {pageResubscribing ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                                    {' '}Yeniden Bağla
                                </button>
                            </div>

                            {/* Geçmiş Senkronizasyon */}
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <History size={15} /> Geçmiş Konuşmaları Aktar
                                </div>
                                <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 10px' }}>
                                    Bağlanmadan önceki mesajları içe aktarabilirsiniz.
                                </p>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <select
                                        value={pageSyncPeriod}
                                        onChange={e => setPageSyncPeriod(Number(e.target.value))}
                                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.82rem' }}
                                    >
                                        {SYNC_PERIOD_OPTIONS.filter(o => o.value > 0).map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="btn-primary"
                                        disabled={pageSyncing}
                                        onClick={async () => {
                                            setPageSyncing(true);
                                            setPageSyncResult(null);
                                            try {
                                                const res = await facebookAPI.syncHistoricalConversations(currentWorkspace.id, {
                                                    pageId: showPageSettingsModal.rawId,
                                                    months: pageSyncPeriod
                                                }, (progress) => {
                                                    if (progress.type === 'complete') {
                                                        setPageSyncResult({ success: true, message: progress.message || `${progress.synced || 0} konuşma aktarıldı` });
                                                    }
                                                });
                                                setPageSyncResult({ success: true, message: res.data?.message || `${res.data?.syncedCount || 0} konuşma aktarıldı` });
                                            } catch (e) {
                                                setPageSyncResult({ success: false, message: e.response?.data?.error || e.message });
                                            } finally {
                                                setPageSyncing(false);
                                            }
                                        }}
                                        style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                                    >
                                        {pageSyncing ? <><Loader2 size={14} className="spin" /> Aktarılıyor...</> : 'Aktar'}
                                    </button>
                                </div>
                                {pageSyncResult && (
                                    <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 6, fontSize: '0.8rem', background: pageSyncResult.success ? '#ecfdf5' : '#fef2f2', color: pageSyncResult.success ? '#065f46' : '#991b1b' }}>
                                        {pageSyncResult.message}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Google Takvim Modal */}
            {showGoogleCalModal && (
                <div className="modal-overlay" onClick={() => setShowGoogleCalModal(false)}>
                    <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <svg viewBox="0 0 24 24" width="24" height="24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                </svg>
                                <h2>Google Takvim Entegrasyonu</h2>
                            </div>
                            <button className="btn-icon" onClick={() => setShowGoogleCalModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {googleCalError && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                                    {googleCalError}
                                </div>
                            )}

                            {googleCalSuccess && (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                                    {googleCalSuccess}
                                </div>
                            )}

                            {/* Entegrasyon Durumu Bilgi Kartı */}
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: '#16a34a' }} />
                                    <strong style={{ color: '#166534', fontSize: '14px' }}>Google Takvim Entegrasyonu Kullanıma Hazır</strong>
                                </div>
                                <p style={{ color: '#15803d', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
                                    Temsilcileriniz, kendi kişisel veya kurumsal Google hesaplarını bağlayarak randevularını doğrudan Google Takvim ile senkronize edebilir. Randevular otomatik Google Meet bağlantısıyla birlikte işlenir.
                                </p>
                            </div>

                            {/* Giriş Yapan Kullanıcının Kendi Takvimi */}
                            {(() => {
                                const myCal = googleCalConfig?.connectedUsers?.find(u => u.userId === user?.id);
                                return (
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                                            Kendi Google Takviminiz
                                        </div>
                                        {myCal ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ color: '#16a34a', fontSize: '14px' }}>✓</span>
                                                    <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '13.5px' }}>{myCal.googleEmail}</span>
                                                    <span style={{ fontSize: '11px', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>Bağlı</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleDisconnectMyGoogleFromChannels}
                                                    style={{ padding: '6px 12px', fontSize: '12px', background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                                                >
                                                    Bağlantıyı Kes
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: '#1e40af', fontSize: '13px' }}>Henüz Google Takviminizi bağlamadınız</div>
                                                    <div style={{ fontSize: '12px', color: '#64748b' }}>Size atanan randevuların takviminize düşmesi için bağlayın.</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleConnectMyGoogleFromChannels}
                                                    disabled={connectingGoogleCal}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }}
                                                >
                                                    <svg viewBox="0 0 24 24" width="14" height="14">
                                                        <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                                        <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                                        <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                                        <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                                    </svg>
                                                    <span>{connectingGoogleCal ? 'Yönlendiriliyor...' : 'Google Takvimi Bağla'}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Connected Representatives List */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#334155', margin: 0 }}>
                                        Bu Çalışma Alanında Bağlı Temsilciler ({googleCalConfig?.connectedUsers?.length || 0})
                                    </h4>
                                </div>

                                {googleCalConfig?.connectedUsers?.length > 0 ? (
                                    <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {googleCalConfig.connectedUsers.map(u => (
                                            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px' }}>
                                                <div>
                                                    <strong style={{ color: '#0f172a' }}>{u.userName}</strong>
                                                    <span style={{ color: '#64748b', marginLeft: '6px' }}>({u.googleEmail})</span>
                                                </div>
                                                <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, background: '#dcfce7', padding: '2px 8px', borderRadius: '12px' }}>
                                                    ● Aktif
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                                        Bu çalışma alanında henüz takvim bağlayan temsilci bulunmuyor. Temsilciler Takvim sayfasından veya yukarıdaki butondan tek tıkla bağlayabilir.
                                    </div>
                                )}
                            </div>

                            {/* Gelişmiş Ayarlar (Gizli Akordeon - Sadece Özel Google App İsteyenler İçin) */}
                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowAdvancedGoogleSettings(p => !p)}
                                    style={{ background: 'none', border: 'none', padding: 0, color: '#64748b', fontSize: '12.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}
                                >
                                    <span>{showAdvancedGoogleSettings ? '▼' : '▶'}</span>
                                    <span>Özel Google Cloud OAuth İstemcisi Tanımla (İsteğe Bağlı / Gelişmiş)</span>
                                </button>

                                {showAdvancedGoogleSettings && (
                                    <div style={{ marginTop: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                                        <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '14px' }}>
                                            Kendi kurumunuza ait özel bir Google Cloud OAuth 2.0 İstemcisi kullanmak isterseniz aşağıdaki bilgileri doldurabilirsiniz. Boş bırakırsanız sistemin hazır motoru kullanılır.
                                        </p>

                                        {/* Otomatik Redirect URI */}
                                        <div style={{ marginBottom: '14px' }}>
                                            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                Yetkili Yönlendirme Adresi (Redirect URI)
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={googleCalConfig?.redirectUri || `${window.location.origin.replace(':5173', ':5008')}/api/calendar/google/callback`}
                                                    style={{ flex: 1, padding: '6px 10px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', color: '#0f172a', fontFamily: 'monospace' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const uri = googleCalConfig?.redirectUri || `${window.location.origin.replace(':5173', ':5008')}/api/calendar/google/callback`;
                                                        navigator.clipboard.writeText(uri);
                                                        setCopiedRedirectUri(true);
                                                        setTimeout(() => setCopiedRedirectUri(false), 2000);
                                                    }}
                                                    style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                    {copiedRedirectUri ? 'Kopyalandı' : 'Kopyala'}
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                                    Özel Google Client ID
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="...apps.googleusercontent.com"
                                                    value={googleCalForm.clientId}
                                                    onChange={(e) => setGoogleCalForm(p => ({ ...p, clientId: e.target.value }))}
                                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                                    Özel Google Client Secret
                                                </label>
                                                <input
                                                    type="password"
                                                    placeholder={googleCalConfig?.hasCustomCredentials ? '•••••••••••••••• (Kayıtlı)' : 'Client secret girin...'}
                                                    value={googleCalForm.clientSecret}
                                                    onChange={(e) => setGoogleCalForm(p => ({ ...p, clientSecret: e.target.value }))}
                                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px' }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            {googleCalConfig?.hasCustomCredentials && (
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={handleDeleteGoogleCalConfig}
                                                    style={{ fontSize: '12px', color: '#dc2626' }}
                                                >
                                                    Özel Ayarları Sıfırla
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={handleSaveGoogleCalConfig}
                                                disabled={googleCalSaving || !googleCalForm.clientId || !googleCalForm.clientSecret}
                                                style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                {googleCalSaving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                                                <span>Özel Ayarları Kaydet</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowGoogleCalModal(false)}
                                >
                                    Kapat
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Channels;
