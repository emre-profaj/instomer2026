import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { facebookAPI, aiAPI, emailAPI, whatsappAPI, formWebhookAPI, channelRoutingAPI, teamAPI, webWidgetAPI, retellAPI, healthSystemAPI } from '../../services/api';
import WhatsAppSettings from '../../components/Settings/WhatsAppSettings';
import RetellSettings from '../../components/Settings/RetellSettings';
import { Facebook, Trash2, Plus, Instagram, Mail, RefreshCcw, MessageCircle, Info, AlertCircle, CheckCircle, FileText, Copy, Check, Globe, Eye, EyeOff, GitBranch, Users, Bot, X, Settings, History, Phone, Activity, Loader2, Shield, Unplug, Zap } from 'lucide-react';
import WebWidgetModal from '../../components/WebWidgetModal';
import ApiIntegrationSettings from '../../components/Settings/ApiIntegrationSettings';
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

    // Routing states
    const [channelRoutings, setChannelRoutings] = useState([]);
    const [teams, setTeams] = useState([]);
    const [savingRouting, setSavingRouting] = useState(null);

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

    const isOwner = ['OWNER', 'SUPER_ADMIN'].includes(user?.role);

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
            const [pagesRes, emailRes, botsRes, webhooksRes, teamsRes, routingsRes, whatsappRes, widgetsRes, retellRes, healthRes] = await Promise.all([
                facebookAPI.getPages(currentWorkspace.id).catch(() => ({ data: { pages: [] } })),
                emailAPI.getChannels(currentWorkspace.id).catch(() => ({ data: { emailChannels: [] } })),
                aiAPI.getBots(currentWorkspace.id).catch(() => ({ data: { bots: [] } })),
                formWebhookAPI.getWebhooks(currentWorkspace.id).catch(() => ({ data: { webhooks: [] } })),
                teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(() => ({ data: { teams: [] } })),
                channelRoutingAPI.getAll(currentWorkspace.id).catch(() => ({ data: { routings: [] } })),
                whatsappAPI.getPhoneNumbers(currentWorkspace.id).catch(() => ({ data: { phoneNumbers: [] } })),
                webWidgetAPI.getAll(currentWorkspace.id).catch(() => ({ data: { widgets: [] } })),
                retellAPI.getSettings(currentWorkspace.id).catch(() => ({ data: { isConfigured: false } })),
                healthSystemAPI.getStatus(currentWorkspace.id).catch(() => ({ data: { connected: false } }))
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
        } catch (error) {
            console.error('Error loading channels:', error);
        } finally {
            setLoading(false);
        }
    };

    // Routing functions - sadece ekip ataması için
    const handleSaveRouting = async (channel, teamId) => {
        try {
            setSavingRouting(channel);

            if (!teamId) {
                // Eğer takım seçilmemişse, routing'i sil
                try {
                    await channelRoutingAPI.delete(currentWorkspace.id, channel);
                } catch (deleteError) {
                    // Routing zaten yoksa hata verme
                    console.log('No existing routing to delete');
                }
            } else {
                // Takım seçilmişse, upsert yap
                await channelRoutingAPI.upsert(currentWorkspace.id, {
                    channel,
                    teamId,
                    botDelay: 0,
                    botEnabled: true
                });
            }

            const response = await channelRoutingAPI.getAll(currentWorkspace.id);
            setChannelRoutings(response.data.routings || []);
        } catch (error) {
            console.error('Error saving routing:', error);
            alert('Routing could not be saved');
        } finally {
            setSavingRouting(null);
        }
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
                    await facebookAPI.connectPage(connectData);
                }
            }

            setShowPageSelectModal(false);
            setSelectedPages([]);
            setAvailablePages([]);
            loadAllChannels();
            alert('Sayfalar başarıyla bağlandı!');
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
                hasChatBot: true,
                chatBotId: page.assignedBotId,
                hasCommentBot: true,
                commentBotId: page.commentBotId,
                hasRouting: true
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
                    hasChatBot: true,
                    chatBotId: page.instagramBotId,
                    hasCommentBot: true,
                    commentBotId: page.instagramCommentBotId,
                    hasRouting: true
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

        return channels;
    };

    const channelList = buildChannelList();
    const hasAnyChannel = channelList.length > 0;

    return (
        <div className="channels-container">
            <div className="channels-header">
                <div className="channels-title-row">
                    <h1>Bağlı Kanallar</h1>
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
                </div>
            </div>


            <div className="channels-content">
                {loading ? (
                    <div className="loading">{t('channels.loading')}</div>
                ) : !hasAnyChannel ? (
                    <div className="empty-state">
                        <Globe size={64} />
                        <h3>{t('channels.noChannels')}</h3>
                        <p>{t('channels.noChannelsDesc')}</p>
                    </div>
                ) : (
                    <div className="unified-channels-grid">
                        {channelList.map((channel) => {
                            const ChannelIcon = channel.icon;

                            return (
                                <div key={channel.id} className="unified-channel-card">
                                    <div className="channel-card-header">
                                        <div className="channel-icon-wrapper" style={{ backgroundColor: channel.bgColor }}>
                                            <ChannelIcon size={24} color={channel.color} />
                                        </div>
                                        <div className="channel-actions">
                                            {channel.type === 'email' && (
                                                <button
                                                    className="btn-icon-sm"
                                                    onClick={() => handleSyncEmail(channel.id)}
                                                    title="Senkronize Et"
                                                >
                                                    <RefreshCcw size={14} />
                                                </button>
                                            )}
                                            {channel.type === 'webform' && (
                                                <button
                                                    className="btn-icon-sm"
                                                    onClick={() => handleToggleFormWebhook(channel.data)}
                                                    title={channel.isActive ? 'Devre Dışı Bırak' : 'Etkinleştir'}
                                                >
                                                    {channel.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                                                </button>
                                            )}
                                            {(channel.type === 'facebook' || channel.type === 'instagram') && (
                                                <button
                                                    className="btn-icon-sm"
                                                    onClick={() => handleOAuthConnect(channel.type === 'instagram' ? 'instagram' : 'facebook')}
                                                    title="Yeniden Bağlan (Token Yenile)"
                                                    style={{
                                                        background: '#e8f5e9',
                                                        color: '#2e7d32'
                                                    }}
                                                >
                                                    <RefreshCcw size={14} />
                                                </button>
                                            )}
                                            {channel.type === 'webwidget' && (
                                                <button
                                                    className="btn-icon-sm"
                                                    onClick={() => {
                                                        setSelectedWidget(channel.data);
                                                        setWidgetModalMode('edit');
                                                        setShowWidgetModal(true);
                                                    }}
                                                    title="Ayarlar"
                                                >
                                                    <Settings size={14} />
                                                </button>
                                            )}
                                            {channel.type === 'retell' && (
                                                <button
                                                    className="btn-icon-sm"
                                                    onClick={() => setShowRetellModal(true)}
                                                    title="Ayarlar"
                                                >
                                                    <Settings size={14} />
                                                </button>
                                            )}
                                            {channel.type === 'health-system' && (
                                                <button
                                                    className="btn-icon-sm"
                                                    onClick={() => { setHealthError(''); setHealthSuccess(''); setShowHealthModal(true); }}
                                                    title="Bağlantı Ayarları"
                                                    style={{ background: '#f5f3ff', color: '#7c3aed' }}
                                                >
                                                    <Settings size={14} />
                                                </button>
                                            )}
                                            {channel.type !== 'retell' && channel.type !== 'health-system' && (
                                                <button
                                                    className="channel-delete-btn"
                                                    style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        border: 'none',
                                                        background: '#fef2f2',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    onClick={() => {
                                                        if (channel.type === 'facebook') {
                                                            handleDisconnectPage(channel.id, 'facebook');
                                                        } else if (channel.type === 'instagram') {
                                                            handleDisconnectPage(channel.pageId, 'instagram');
                                                        } else if (channel.type === 'email') {
                                                            handleDeleteEmail(channel.id);
                                                        } else if (channel.type === 'webform') {
                                                            handleDeleteFormWebhook(channel.id);
                                                        } else if (channel.type === 'whatsapp') {
                                                            handleDeleteWhatsapp(channel.id);
                                                        } else if (channel.type === 'webwidget') {
                                                            handleDeleteWebWidget(channel.id);
                                                        }
                                                    }}
                                                    title="Kaldır"
                                                >
                                                    <Trash2 size={14} color="#ef4444" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="channel-card-body">
                                        <h3 className="channel-name">{channel.name}</h3>
                                        <p className="channel-subtitle">{channel.subtitle}</p>
                                    </div>

                                    {/* Chat Bot for Facebook/Instagram */}
                                    {channel.hasChatBot && (
                                        <div className="channel-card-footer">
                                            <label className="footer-label">
                                                <Bot size={12} />
                                                Sohbet Botu
                                            </label>
                                            <select
                                                className="bot-select-mini"
                                                value={channel.chatBotId || ''}
                                                onChange={(e) => handleAssignBot(
                                                    channel.type, // 'facebook' or 'instagram'
                                                    channel.type === 'instagram' ? channel.pageId : channel.id,
                                                    e.target.value
                                                )}
                                                disabled={assigningBot === (channel.type === 'instagram' ? channel.pageId : channel.id)}
                                            >
                                                <option value="">Manuel</option>
                                                {aiBots.map(bot => (
                                                    <option key={bot.id} value={bot.id}>{bot.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Comment Bot for Facebook/Instagram */}
                                    {channel.hasCommentBot && (
                                        <div className="channel-card-footer">
                                            <label className="footer-label">
                                                <MessageCircle size={12} />
                                                Yorum Botu
                                            </label>
                                            <select
                                                className="bot-select-mini"
                                                value={channel.commentBotId || ''}
                                                onChange={(e) => handleAssignBot(
                                                    channel.type === 'instagram' ? 'instagram_comment' : 'comment',
                                                    channel.type === 'instagram' ? channel.pageId : channel.id,
                                                    e.target.value
                                                )}
                                                disabled={assigningBot === channel.id}
                                            >
                                                <option value="">Manuel</option>
                                                {aiBots.map(bot => (
                                                    <option key={bot.id} value={bot.id}>{bot.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Auto Reply Bot for Email */}
                                    {channel.hasAutoReplyBot && (
                                        <div className="channel-card-footer">
                                            <label className="footer-label">
                                                <Bot size={12} />
                                                Otomatik Yanıt Botu
                                            </label>
                                            <select
                                                className="bot-select-mini"
                                                value={channel.botId || ''}
                                                onChange={(e) => handleAssignBot('email', channel.id, e.target.value)}
                                                disabled={assigningBot === channel.id}
                                            >
                                                <option value="">Manuel</option>
                                                {aiBots.map(bot => (
                                                    <option key={bot.id} value={bot.id}>{bot.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Webhook URL for Web Form */}
                                    {channel.type === 'webform' && (
                                        <div className="channel-card-footer webform-footer">
                                            <label className="footer-label">Webhook URL</label>
                                            <div className="webhook-url-row">
                                                <input
                                                    type="text"
                                                    value={channel.data.webhookUrl}
                                                    readOnly
                                                    className="webhook-url-input"
                                                />
                                                <button
                                                    className="btn-copy"
                                                    onClick={() => copyToClipboard(channel.data.webhookUrl, channel.id)}
                                                >
                                                    {copiedUrl === channel.id ? <Check size={14} /> : <Copy size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Routing Settings - Her kanal kartının altında */}
                                    {channel.hasRouting && teams.length > 0 && (
                                        <div className="channel-routing-section">
                                            <div className="routing-section-header">
                                                <GitBranch size={12} />
                                                <span>{t('channels.redirectSettings')}</span>
                                            </div>
                                            {(() => {
                                                const existingRouting = channelRoutings.find(r => r.channel === channel.routingChannel);
                                                return (
                                                    <div className="routing-section-body">
                                                        <div className="routing-row">
                                                            <label>
                                                                <Users size={12} />
                                                                Ekip
                                                            </label>
                                                            <select
                                                                value={existingRouting?.teamId || ''}
                                                                onChange={(e) => {
                                                                    handleSaveRouting(
                                                                        channel.routingChannel,
                                                                        e.target.value || null
                                                                    );
                                                                }}
                                                                className="routing-select-inline"
                                                            >
                                                                <option value="">{t("channels.selectOption")}</option>
                                                                {teams.map(team => (
                                                                    <option key={team.id} value={team.id}>{team.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>


                                                        {savingRouting === channel.routingChannel && (
                                                            <div className="routing-saving-inline">Kaydediliyor...</div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* Chat History Sync for Facebook/Instagram/WhatsApp */}
                                    {(channel.type === 'facebook' || channel.type === 'instagram' || channel.type === 'whatsapp') && (
                                        <div className="channel-sync-section">
                                            <div className="sync-section-header">
                                                <History size={12} />
                                                <span>Sohbet Geçmişi Senkronizasyonu</span>
                                            </div>
                                            <div className="sync-section-body">
                                                <select
                                                    className="sync-period-select"
                                                    value={syncPeriods[channel.id] || 0}
                                                    onChange={(e) => setSyncPeriods(prev => ({
                                                        ...prev,
                                                        [channel.id]: parseFloat(e.target.value)
                                                    }))}
                                                    disabled={syncing[channel.id]}
                                                >
                                                    {channel.type === 'whatsapp' ? (
                                                        <>
                                                            <option value={0}>Süre Seçin</option>
                                                            <option value={1}>Son 24 Saat</option>
                                                        </>
                                                    ) : (
                                                        SYNC_PERIOD_OPTIONS.map(option => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))
                                                    )}
                                                </select>
                                                <button
                                                    className={`btn-sync ${syncing[channel.id] ? 'syncing' : ''}`}
                                                    onClick={() => handleChannelSync(channel)}
                                                    disabled={!syncPeriods[channel.id] || syncing[channel.id]}
                                                >
                                                    {syncing[channel.id] ? (
                                                        <><RefreshCcw size={12} className="spin" /> Syncing...</>
                                                    ) : (
                                                        <><History size={12} /> Sync</>
                                                    )}
                                                </button>
                                            </div>
                                            {syncResults[channel.id] && (
                                                <div className={`sync-result-inline ${syncResults[channel.id].success ? 'success' : 'error'}`}>
                                                    {syncResults[channel.id].success ? (
                                                        <><CheckCircle size={12} /> {syncResults[channel.id].totalConversations} sohbet, {syncResults[channel.id].totalMessages} mesaj eklendi</>
                                                    ) : (
                                                        <><AlertCircle size={12} /> {syncResults[channel.id].error}</>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* API Integrations Settings */}
            <ApiIntegrationSettings />

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
                            <RetellSettings onSave={() => loadAllChannels()} />
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
        </div>
    );
};

export default Channels;
