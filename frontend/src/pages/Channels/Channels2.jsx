import React from 'react';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { facebookAPI, aiAPI, emailAPI, whatsappAPI, formWebhookAPI, channelRoutingAPI, teamAPI, webWidgetAPI, retellAPI, healthSystemAPI, funnelAPI } from '../../services/api';
import WhatsAppSettings from '../../components/Settings/WhatsAppSettings';
import RetellSettings from '../../components/Settings/RetellSettings';
import { Facebook, Trash2, Plus, Instagram, Mail, MessageCircle, FileText, Globe, Bot, X, Phone, Activity, Loader2, Unplug, Zap, Link2, CheckCircle, GitBranch, Users, ChevronRight } from 'lucide-react';
import WebWidgetModal from '../../components/WebWidgetModal';
import './Channels2.css';

const Channels2 = () => {
    const { t } = useTranslation();
    const { currentWorkspace, user } = useAuth();

    const [loading, setLoading] = useState(false);
    const [facebookPages, setFacebookPages] = useState([]);
    const [emailChannels, setEmailChannels] = useState([]);
    const [whatsappNumbers, setWhatsappNumbers] = useState([]);
    const [formWebhooks, setFormWebhooks] = useState([]);
    const [webWidgets, setWebWidgets] = useState([]);
    const [aiBots, setAiBots] = useState([]);
    const [retellSettings, setRetellSettings] = useState(null);
    const [healthConnection, setHealthConnection] = useState(null);

    // Modals
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [showRetellModal, setShowRetellModal] = useState(false);
    const [showWidgetModal, setShowWidgetModal] = useState(false);
    const [widgetModalMode, setWidgetModalMode] = useState('create');
    const [selectedWidget, setSelectedWidget] = useState(null);
    const [showFormModal, setShowFormModal] = useState(false);
    const [newFormName, setNewFormName] = useState('');
    const [newSiteUrl, setNewSiteUrl] = useState('');

    // Email modal
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailProvider, setEmailProvider] = useState('');
    const [imapForm, setImapForm] = useState({
        preset: 'yandex', email: '', password: '',
        imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 465
    });
    const [connectingEmail, setConnectingEmail] = useState(false);

    // Page selection modal
    const [showPageSelectModal, setShowPageSelectModal] = useState(false);
    const [availablePages, setAvailablePages] = useState([]);
    const [selectedPages, setSelectedPages] = useState([]);
    const [connectingPages, setConnectingPages] = useState(false);
    const [pageSelectChannelType, setPageSelectChannelType] = useState('facebook');

    // Health modal
    const [showHealthModal, setShowHealthModal] = useState(false);
    const [healthForm, setHealthForm] = useState({ apiUrl: '', username: '', password: '', name: 'Sağlık Sistemi API' });
    const [healthConnecting, setHealthConnecting] = useState(false);

    // Drag & drop state
    const [dragState, setDragState] = useState(null); // { item, type: 'channel'|'funnel', startX, startY }
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [dragOverBot, setDragOverBot] = useState(null);
    const [dragOverChannel, setDragOverChannel] = useState(null);
    const [connections, setConnections] = useState([]); // [{ channelId, botId }]
    const [toast, setToast] = useState(null);

    // Routing states
    const [channelRoutings, setChannelRoutings] = useState([]);
    const [teams, setTeams] = useState([]);
    const [funnels, setFunnels] = useState([]);
    const [savingRouting, setSavingRouting] = useState(null);
    const [selectedChannelPopup, setSelectedChannelPopup] = useState(null);

    const boardRef = useRef(null);
    const channelRefs = useRef({});
    const botRefs = useRef({});
    const funnelRefs = useRef({});

    useEffect(() => {
        if (currentWorkspace) {
            loadAllChannels();
        }
    }, [currentWorkspace]);

    // Rebuild connections when routing data or channel data changes
    useEffect(() => {
        if (channelRoutings.length > 0 || facebookPages.length > 0 || whatsappNumbers.length > 0) {
            // Small delay to ensure DOM refs are populated after render
            const timer = setTimeout(() => {
                buildConnectionsFromData(
                    facebookPages, emailChannels, whatsappNumbers, webWidgets, healthConnection,
                    channelRoutings
                );
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [channelRoutings, facebookPages, whatsappNumbers, emailChannels, webWidgets, healthConnection]);

    const loadAllChannels = async () => {
        setLoading(true);
        try {
            const [pagesRes, emailRes, botsRes, webhooksRes, whatsappRes, widgetsRes, retellRes, healthRes, teamsRes, routingsRes, funnelsRes] = await Promise.all([
                facebookAPI.getPages(currentWorkspace.id).catch(() => ({ data: { pages: [] } })),
                emailAPI.getChannels(currentWorkspace.id).catch(() => ({ data: { emailChannels: [] } })),
                aiAPI.getBots(currentWorkspace.id).catch(() => ({ data: { bots: [] } })),
                formWebhookAPI.getWebhooks(currentWorkspace.id).catch(() => ({ data: { webhooks: [] } })),
                whatsappAPI.getPhoneNumbers(currentWorkspace.id).catch(() => ({ data: { phoneNumbers: [] } })),
                webWidgetAPI.getAll(currentWorkspace.id).catch(() => ({ data: { widgets: [] } })),
                retellAPI.getSettings(currentWorkspace.id).catch(() => ({ data: { isConfigured: false } })),
                healthSystemAPI.getStatus(currentWorkspace.id).catch(() => ({ data: { connected: false } })),
                teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(() => ({ data: { teams: [] } })),
                channelRoutingAPI.getAll(currentWorkspace.id).catch(() => ({ data: { routings: [] } })),
                funnelAPI.getAll(currentWorkspace.id).catch(() => ({ data: [] }))
            ]);

            setFacebookPages(pagesRes.data.pages || []);
            setEmailChannels(emailRes.data.emailChannels || []);
            setAiBots(botsRes.data.bots || []);
            setFormWebhooks(webhooksRes.data.webhooks || []);
            setWhatsappNumbers(whatsappRes.data.phoneNumbers || []);
            setWebWidgets(widgetsRes.data.widgets || []);
            setRetellSettings(retellRes.data.isConfigured ? retellRes.data : null);
            setHealthConnection(healthRes.data.connected ? healthRes.data.integration : null);
            setTeams(teamsRes.data.teams || []);
            setChannelRoutings(routingsRes.data.routings || []);
            setFunnels(funnelsRes.data?.funnels || funnelsRes.data || []);

            // Build initial connections from existing routings
            buildConnectionsFromData(
                pagesRes.data.pages || [],
                emailRes.data.emailChannels || [],
                whatsappRes.data.phoneNumbers || [],
                widgetsRes.data.widgets || [],
                healthRes.data.connected ? healthRes.data.integration : null,
                routingsRes.data.routings || []
            );
        } catch (error) {
            console.error('Error loading channels:', error);
        } finally {
            setLoading(false);
        }
    };

    const buildConnectionsFromData = (pages, emails, whatsapps, widgets, health, routings) => {
        const conns = [];
        
        // Build a map of routingChannel -> UI channel ID from raw data
        const channelIdMap = {};
        (pages || []).forEach(p => {
            channelIdMap[`FACEBOOK_${p.id}`] = `fb-${p.id}`;
            if (p.instagramBusinessId) channelIdMap[`INSTAGRAM_${p.id}`] = `ig-${p.id}`;
        });
        (whatsapps || []).forEach(w => channelIdMap[`WHATSAPP_${w.id}`] = `wa-${w.id}`);
        (emails || []).forEach(e => channelIdMap[`EMAIL_${e.id}`] = `email-${e.id}`);
        (widgets || []).forEach(w => channelIdMap[`WEB_WIDGET_${w.id}`] = `widget-${w.id}`);
        if (health) channelIdMap[`HEALTH_SYSTEM_${health.id}`] = `health-${health.id}`;

        // Also build type-only fallbacks (first match per type)
        const typeMap = {};
        (pages || []).forEach(p => { if (!typeMap['FACEBOOK']) typeMap['FACEBOOK'] = `fb-${p.id}`; });
        (pages || []).forEach(p => { if (p.instagramBusinessId && !typeMap['INSTAGRAM']) typeMap['INSTAGRAM'] = `ig-${p.id}`; });
        (whatsapps || []).forEach(w => { if (!typeMap['WHATSAPP']) typeMap['WHATSAPP'] = `wa-${w.id}`; });
        (emails || []).forEach(e => { if (!typeMap['EMAIL']) typeMap['EMAIL'] = `email-${e.id}`; });
        (widgets || []).forEach(w => { if (!typeMap['WEB_WIDGET']) typeMap['WEB_WIDGET'] = `widget-${w.id}`; });
        if (health) typeMap['HEALTH_SYSTEM'] = `health-${health.id}`;
        typeMap['RETELL'] = 'retell';

        routings.forEach(r => {
            // Try exact match first, then type-only fallback
            const chId = (r.pageId ? channelIdMap[`${r.channel}_${r.pageId}`] : null) || typeMap[r.channel];
            if (chId && r.funnelId) {
                const targetId = r.stageId ? `${r.funnelId}-${r.stageId}` : r.funnelId;
                conns.push({ channelId: chId, targetId: targetId });
            }
        });
        
        console.log('Built connections:', conns);
        setConnections(conns);
    };

    // Build channel list
    const buildChannelList = () => {
        const channels = [];
        facebookPages.forEach(page => {
            channels.push({
                id: `fb-${page.id}`,
                realId: page.id,
                type: 'facebook',
                routingChannel: 'FACEBOOK',
                icon: Facebook,
                color: '#1877F2',
                bgColor: '#EBF4FF',
                name: page.pageName,
                data: page
            });
            if (page.instagramBusinessId) {
                channels.push({
                    id: `ig-${page.id}`,
                    realId: page.id,
                    type: 'instagram',
                    routingChannel: 'INSTAGRAM',
                    icon: Instagram,
                    color: '#E4405F',
                    bgColor: '#FFF5F7',
                    name: `@${page.instagramUsername}`,
                    data: page
                });
            }
        });
        whatsappNumbers.forEach(num => {
            channels.push({
                id: `wa-${num.id}`,
                realId: num.id,
                type: 'whatsapp',
                routingChannel: 'WHATSAPP',
                icon: MessageCircle,
                color: '#25D366',
                bgColor: '#F0FFF4',
                name: num.displayPhoneNumber || num.phoneNumber,
                data: num
            });
        });
        emailChannels.forEach(ch => {
            channels.push({
                id: `email-${ch.id}`,
                realId: ch.id,
                type: 'email',
                routingChannel: 'EMAIL',
                icon: Mail,
                color: '#EA4335',
                bgColor: '#FEF2F2',
                name: ch.email,
                data: ch
            });
        });
        formWebhooks.forEach(wh => {
            channels.push({
                id: `form-${wh.id}`,
                realId: wh.id,
                type: 'webform',
                routingChannel: 'FORM',
                icon: FileText,
                color: '#8B5CF6',
                bgColor: '#F5F3FF',
                name: wh.name,
                data: wh
            });
        });
        webWidgets.forEach(w => {
            channels.push({
                id: `widget-${w.id}`,
                realId: w.id,
                type: 'webwidget',
                routingChannel: 'WEB_WIDGET',
                icon: Globe,
                color: '#3B82F6',
                bgColor: '#EFF6FF',
                name: w.name,
                data: w
            });
        });
        if (retellSettings && retellSettings.isConfigured) {
            channels.push({
                id: 'retell',
                realId: 'retell',
                type: 'retell',
                routingChannel: 'RETELL',
                icon: Phone,
                color: '#0d9488',
                bgColor: '#f0fdfa',
                name: 'AI Call – Sesli Arama',
                data: retellSettings
            });
        }
        if (healthConnection) {
            channels.push({
                id: `health-${healthConnection.id}`,
                realId: healthConnection.id,
                type: 'health-system',
                routingChannel: 'HEALTH_SYSTEM',
                icon: Activity,
                color: '#7c3aed',
                bgColor: '#f5f3ff',
                name: healthConnection.name || 'Sağlık Sistemi API',
                data: healthConnection
            });
        }
        return channels;
    };

    const channelList = buildChannelList();

    // ======== DRAG & DROP LOGIC ========
    const dragStartRef = useRef(null);
    const isDraggingRef = useRef(false);

    const handleDragStart = useCallback((e, item, type) => {
        const rect = e.currentTarget.getBoundingClientRect();
        dragStartRef.current = { x: e.clientX, y: e.clientY, item, type, rect };
        isDraggingRef.current = false;
        setMousePos({ x: e.clientX, y: e.clientY });
    }, []);

    // Start drag for funnel (left→center)
    const handleFunnelDragStart = useCallback((e, funnel) => {
        const rect = e.currentTarget.getBoundingClientRect();
        dragStartRef.current = { x: e.clientX, y: e.clientY, item: funnel, type: 'funnel', rect };
        isDraggingRef.current = false;
        setMousePos({ x: e.clientX, y: e.clientY });
    }, []);

    useEffect(() => {
        const handleMove = (e) => {
            if (dragStartRef.current && !isDraggingRef.current) {
                const dx = e.clientX - dragStartRef.current.x;
                const dy = e.clientY - dragStartRef.current.y;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    isDraggingRef.current = true;
                    const { item, type, rect } = dragStartRef.current;
                    setDragState({
                        channel: type === 'channel' ? item : null,
                        bot: type === 'bot' ? item : null,
                        funnel: type === 'funnel' ? item : null,
                        type,
                        startX: rect.left + rect.width / 2,
                        startY: type === 'bot' ? rect.top : rect.bottom
                    });
                }
            }
            if (isDraggingRef.current) {
                setMousePos({ x: e.clientX, y: e.clientY });
            }
        };

        const handleUp = (e) => {
            if (dragStartRef.current && !isDraggingRef.current) {
                // Click, not drag
                if (dragStartRef.current.type === 'channel') {
                    handleChannelClick(dragStartRef.current.item);
                }
            }
            if (isDraggingRef.current && dragState) {
                if (dragState.type === 'channel' && dragOverChannel) {
                    // Connect channel to funnel/stage
                    const ch = channelList.find(c => c.id === dragState.channel.id);
                    if (ch) {
                        const targetParts = dragOverChannel.split('-'); // e.g. "funnel1-stage1" or "funnel1"
                        if (targetParts.length > 1) {
                            handleSaveRouting(ch.routingChannel, 'funnelId', targetParts[0]);
                            handleSaveRouting(ch.routingChannel, 'stageId', targetParts[1]);
                        } else {
                            handleSaveRouting(ch.routingChannel, 'funnelId', targetParts[0]);
                        }
                    }
                } else if (dragState.type === 'bot' && dragOverChannel) {
                    // Connect bot to funnel/stage
                    const botId = dragState.bot.id;
                    const targetParts = dragOverChannel.split('-');
                    handleAssignBotToFunnel(botId, targetParts[0], targetParts[1]);
                }
            }
            dragStartRef.current = null;
            isDraggingRef.current = false;
            setDragState(null);
            setDragOverBot(null);
            setDragOverChannel(null);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [dragState, dragOverBot, dragOverChannel, channelList]);

    const handleChannelDragEnter = useCallback((targetId) => {
        if (dragState) setDragOverChannel(targetId);
    }, [dragState]);

    const handleChannelDragLeave = useCallback(() => {
        setDragOverChannel(null);
    }, []);

    // Assign Bot to Funnel or Stage
    const handleAssignBotToFunnel = async (botId, funnelId, stageId) => {
        try {
            if (stageId) {
                await funnelAPI.updateStage(currentWorkspace.id, funnelId, stageId, { assignedBotId: botId });
            } else {
                await funnelAPI.update(currentWorkspace.id, funnelId, { assignedBotId: botId });
            }
            showToast('Bot ataması başarılı', 'success');
            loadAllChannels();
        } catch (error) {
            console.error('Bot assign error:', error);
            showToast('Bot atanırken hata!', 'error');
        }
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // ======== ROUTING (Akış + Ekip) ========
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

            const isRoutingField = ['funnelId', 'teamId', 'stageId'].includes(field);
            if (isRoutingField && !data.teamId && !data.funnelId) {
                try { await channelRoutingAPI.delete(currentWorkspace.id, routingChannel); } catch (e) { console.log('No existing routing'); }
            } else if (data.teamId || data.funnelId || existingRouting) {
                await channelRoutingAPI.upsert(currentWorkspace.id, data);
            }
            const response = await channelRoutingAPI.getAll(currentWorkspace.id);
            setChannelRoutings(response.data.routings || []);
            // Rebuild connections visually
            buildConnectionsFromData(
                facebookPages, emailChannels, whatsappNumbers, webWidgets, healthConnection,
                response.data.routings || []
            );
            showToast('Yönlendirme kaydedildi!', 'success');
        } catch (error) {
            console.error('Error saving routing:', error);
            showToast('Kayıt hatası!', 'error');
        } finally { setSavingRouting(null); }
    };

    const handleChannelClick = (channel) => {
        if (dragState) return;
        setSelectedChannelPopup(channel);
    };

    // ======== ROPE RENDERING ========
    const [, forceUpdate] = useState(0);

    // Recalc rope positions on scroll/resize
    useEffect(() => {
        const board = boardRef.current;
        if (!board) return;
        const update = () => forceUpdate(v => v + 1);
        board.addEventListener('scroll', update);
        window.addEventListener('resize', update);
        const timer = setTimeout(update, 200);
        return () => {
            board.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
            clearTimeout(timer);
        };
    }, [connections]);

    // Keep dragging rope animated
    useEffect(() => {
        if (!dragState) return;
        let raf;
        const animate = () => { forceUpdate(v => v + 1); raf = requestAnimationFrame(animate); };
        raf = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf);
    }, [dragState]);

    // Get vertical rope path (bottom edge of Channel → top edge of Funnel/Stage)
    const getVerticalRopePath = useCallback((fromEl, toEl) => {
        if (!fromEl || !toEl || !boardRef.current) return null;
        const boardRect = boardRef.current.getBoundingClientRect();
        const scrollTop = boardRef.current.scrollTop;
        const fRect = fromEl.getBoundingClientRect();
        const tRect = toEl.getBoundingClientRect();

        const sx = fRect.left + fRect.width / 2 - boardRect.left;
        const sy = fRect.bottom - boardRect.top + scrollTop;
        const ex = tRect.left + tRect.width / 2 - boardRect.left;
        const ey = tRect.top - boardRect.top + scrollTop;

        const dy = ey - sy;
        const midY = sy + dy * 0.5;

        return {
            path: `M ${sx} ${sy} C ${sx} ${midY}, ${ex} ${midY}, ${ex} ${ey}`,
            sx, sy, ex, ey
        };
    }, []);

    // Render all permanent ropes
    const renderPermanentRopes = () => {
        const ropes = [];
        connections.forEach((conn, idx) => {
            const channelEl = channelRefs.current[conn.channelId];
            const targetEl = funnelRefs.current[conn.targetId];
            const data = getVerticalRopePath(channelEl, targetEl);
            if (!data) return;
            const channel = channelList.find(ch => ch.id === conn.channelId);
            const color = channel?.color || '#3b82f6';
            ropes.push(
                <g key={`ch-fn-${conn.channelId}-${conn.targetId}-${idx}`}>
                    <path d={data.path} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" opacity={0.15} />
                    <path d={data.path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray="6 4" opacity={0.4} style={{ animation: 'ropeFlow 2s linear infinite' }} />
                    <path d={data.path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" opacity={0.8} />
                    <circle cx={data.sx} cy={data.sy} r={4} fill={color} opacity={0.9} />
                    <circle cx={data.ex} cy={data.ey} r={4} fill={color} opacity={0.9} />
                </g>
            );
        });
        return ropes;
    };

    // Render delete buttons at midpoints of ropes (HTML overlay)
    const renderRopeDeleteButtons = () => {
        if (!boardRef.current) return null;
        const boardRect = boardRef.current.getBoundingClientRect();
        const scrollTop = boardRef.current.scrollTop;
        const buttons = [];

        connections.forEach((conn, idx) => {
            const channelEl = channelRefs.current[conn.channelId];
            const targetEl = funnelRefs.current[conn.targetId];
            if (!channelEl || !targetEl) return;
            const cRect = channelEl.getBoundingClientRect();
            const tRect = targetEl.getBoundingClientRect();
            const midX = ((cRect.left + cRect.width / 2 - boardRect.left) + (tRect.left + tRect.width / 2 - boardRect.left)) / 2;
            const midY = ((cRect.bottom - boardRect.top + scrollTop) + (tRect.top - boardRect.top + scrollTop)) / 2;
            
            const ch = channelList.find(c => c.id === conn.channelId);
            
            buttons.push(
                <div
                    key={`del-${conn.channelId}-${conn.targetId}`}
                    className="ch2-rope-delete-btn"
                    style={{ left: midX, top: midY, borderColor: ch?.color || 'var(--primary)', color: ch?.color || 'var(--primary)' }}
                    onClick={() => handleSaveRouting(ch?.routingChannel, 'funnelId', '')}
                    title="Bağlantıyı kaldır"
                >
                    <X size={12} />
                </div>
            );
        });
        return buttons;
    };

    // Render dragging rope in fixed viewport coordinates
    const renderDraggingRope = () => {
        if (!dragState) return null;

        const sx = dragState.startX;
        const sy = dragState.startY;
        const ex = mousePos.x;
        const ey = mousePos.y;

        const dy = ey - sy;
        const midY = sy + dy * 0.5;

        const path = `M ${sx} ${sy} C ${sx} ${midY}, ${ex} ${midY}, ${ex} ${ey}`;
        const color = dragState.type === 'funnel' ? '#6366f1' : (dragState.channel?.color || '#ef4444');

        return (
            <svg className="ch2-drag-svg-overlay">
                <path d={path} stroke={color} strokeWidth={8} fill="none" opacity={0.08} />
                <path d={path} stroke={color} className="ch2-dragging-rope" strokeWidth={4} opacity={0.25} strokeDasharray="12 8" />
                <path d={path} stroke={color} className="ch2-dragging-rope" />
                <circle cx={sx} cy={sy} r={6} fill={color} opacity={0.8} />
                <circle cx={ex} cy={ey} r={8} fill={(dragOverBot || dragOverChannel) ? '#ef4444' : color} opacity={(dragOverBot || dragOverChannel) ? 1 : 0.6}>
                    {dragOverBot && <animate attributeName="r" values="8;12;8" dur="0.8s" repeatCount="indefinite" />}
                </circle>
            </svg>
        );
    };

    // ======== OAuth Connect (same as Channels) ========
    const handleOAuthConnect = (channelType = 'facebook') => {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5008/api';
        const authBaseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
        const token = localStorage.getItem('token');
        const stateObj = { token, workspaceId: currentWorkspace?.id, channelType };
        const state = encodeURIComponent(JSON.stringify(stateObj));

        localStorage.removeItem('oauth_result');

        const width = 600, height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const processOAuthSuccess = (data) => {
            if (data.token) localStorage.setItem('token', data.token);
            localStorage.removeItem('oauth_result');
            const pages = data.availablePages || [];
            const callbackChannelType = data.channelType || channelType;
            let filteredPages = pages;
            if (callbackChannelType === 'instagram') filteredPages = pages.filter(p => p.instagram_business_account?.id);
            if (filteredPages.length > 0) {
                setAvailablePages(filteredPages);
                setSelectedPages([]);
                setPageSelectChannelType(callbackChannelType);
                setShowPageSelectModal(true);
            } else {
                alert(callbackChannelType === 'instagram' ? 'Instagram Business hesabı bulunamadı.' : 'Bağlanabilecek sayfa bulunamadı.');
                loadAllChannels();
            }
        };

        const cleanup = () => {
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(pollInterval);
        };

        const handleMessage = (event) => {
            if (event.data?.type === 'FACEBOOK_AUTH_SUCCESS') { cleanup(); processOAuthSuccess(event.data); }
        };
        const handleStorageChange = (event) => {
            if (event.key === 'oauth_result' && event.newValue) {
                try {
                    const result = JSON.parse(event.newValue);
                    if (result.type === 'FACEBOOK_AUTH_SUCCESS') { cleanup(); processOAuthSuccess(result); }
                } catch (e) { }
            }
        };
        const pollInterval = setInterval(() => {
            const result = localStorage.getItem('oauth_result');
            if (result) {
                try {
                    const data = JSON.parse(result);
                    if (data.type === 'FACEBOOK_AUTH_SUCCESS') { cleanup(); processOAuthSuccess(data); }
                } catch (e) { }
            }
        }, 500);

        window.addEventListener('message', handleMessage);
        window.addEventListener('storage', handleStorageChange);
        setTimeout(() => cleanup(), 5 * 60 * 1000);
        window.open(`${authBaseUrl}/auth/facebook?state=${state}`, 'Facebook OAuth', `width=${width},height=${height},left=${left},top=${top}`);
    };

    const handleConnectSelectedPages = async () => {
        if (selectedPages.length === 0) { alert('Lütfen en az bir sayfa seçin.'); return; }
        setConnectingPages(true);
        try {
            for (const pageId of selectedPages) {
                const page = availablePages.find(p => p.id === pageId);
                if (page) {
                    await facebookAPI.connectPage({
                        pageId: page.id, pageName: page.name, pageAccessToken: page.access_token,
                        workspaceId: currentWorkspace.id,
                        instagramBusinessId: pageSelectChannelType === 'instagram' ? page.instagram_business_account?.id : null,
                        instagramUsername: pageSelectChannelType === 'instagram' ? page.instagram_business_account?.username : null
                    });
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
        } finally { setConnectingPages(false); }
    };

    // Email connect
    const handleEmailConnect = () => {
        setEmailProvider('');
        setImapForm({ preset: 'yandex', email: '', password: '', imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 465 });
        setShowEmailModal(true);
    };

    const handleGmailConnect = async () => {
        try {
            const response = await emailAPI.getConnectUrl(currentWorkspace.id);
            window.location.href = response.data.url;
        } catch (error) { alert('Gmail bağlantısı başlatılamadı.'); }
    };

    const handleImapConnect = async () => {
        if (!imapForm.email || !imapForm.password) { alert('E-posta ve şifre gereklidir.'); return; }
        setConnectingEmail(true);
        try {
            await emailAPI.connectImap(currentWorkspace.id, {
                preset: imapForm.preset, email: imapForm.email, password: imapForm.password,
                imapHost: imapForm.preset === 'custom' ? imapForm.imapHost : undefined,
                imapPort: imapForm.preset === 'custom' ? imapForm.imapPort : undefined,
                smtpHost: imapForm.preset === 'custom' ? imapForm.smtpHost : undefined,
                smtpPort: imapForm.preset === 'custom' ? imapForm.smtpPort : undefined
            });
            setShowEmailModal(false);
            loadAllChannels();
            alert('E-posta hesabı başarıyla bağlandı!');
        } catch (error) {
            alert(error.response?.data?.error || 'Bağlantı başarısız.');
        } finally { setConnectingEmail(false); }
    };

    const handleImapPresetChange = (preset) => {
        const presets = {
            yandex: { imapHost: 'imap.yandex.com', smtpHost: 'smtp.yandex.com', imapPort: 993, smtpPort: 465 },
            outlook: { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com', imapPort: 993, smtpPort: 587 },
            custom: { imapHost: '', smtpHost: '', imapPort: 993, smtpPort: 465 }
        };
        setImapForm(prev => ({ ...prev, preset, ...(presets[preset] || {}) }));
    };

    // Form webhook
    const handleCreateFormWebhook = async () => {
        if (!newFormName.trim() || !newSiteUrl.trim()) { alert('Form adı ve site URL gereklidir.'); return; }
        try {
            await formWebhookAPI.createWebhook(currentWorkspace.id, { name: newFormName, siteUrl: newSiteUrl });
            setNewFormName(''); setNewSiteUrl('');
            setShowFormModal(false);
            loadAllChannels();
        } catch (error) { alert('Form webhook oluşturulamadı.'); }
    };

    // Health System
    const handleHealthConnect = async () => {
        if (!healthForm.apiUrl || !healthForm.username || !healthForm.password) { alert('Tüm alanlar gereklidir.'); return; }
        setHealthConnecting(true);
        try {
            await healthSystemAPI.connect(currentWorkspace.id, healthForm);
            setShowHealthModal(false);
            loadAllChannels();
            showToast('Sağlık Sistemi bağlandı!', 'success');
        } catch (error) { alert('Bağlantı hatası.'); } finally { setHealthConnecting(false); }
    };

    // Count connections for a channel
    const getChannelConnectionCount = (channelId) => connections.filter(c => c.channelId === channelId).length;

    // Get connections for a bot
    const getBotConnections = (botId) => connections.filter(c => c.botId === botId);

    return (
        <div className="channels2-container">
            {/* Header with Quick Add Bar */}
            <div className="channels2-header">
                <div className="channels2-title-row">
                    <h1>Kanallar 2</h1>
                </div>

                <div className="ch2-quick-add-bar">
                    <span className="ch2-quick-add-label">Kanal Ekle:</span>
                    <button className="ch2-quick-add-btn facebook" onClick={() => handleOAuthConnect('facebook')}>
                        <Facebook size={16} /> Facebook
                    </button>
                    <button className="ch2-quick-add-btn instagram" onClick={() => handleOAuthConnect('instagram')}>
                        <Instagram size={16} /> Instagram
                    </button>
                    <button className="ch2-quick-add-btn whatsapp" onClick={() => setShowWhatsAppModal(true)}>
                        <MessageCircle size={16} /> WhatsApp
                    </button>
                    <button className="ch2-quick-add-btn retell" onClick={() => setShowRetellModal(true)}>
                        <Phone size={16} /> Sesli Arama
                    </button>
                    <button className="ch2-quick-add-btn email" onClick={handleEmailConnect}>
                        <Mail size={16} /> E-posta
                    </button>
                    <button className="ch2-quick-add-btn webform" onClick={() => setShowFormModal(true)}>
                        <FileText size={16} /> Web Form
                    </button>
                    <button className="ch2-quick-add-btn webwidget" onClick={() => { setWidgetModalMode('create'); setSelectedWidget(null); setShowWidgetModal(true); }}>
                        <Globe size={16} /> Web Widget
                    </button>
                    <button className="ch2-quick-add-btn health-system" onClick={() => setShowHealthModal(true)}>
                        <Activity size={16} /> Sağlık Sistemi
                    </button>
                </div>
            </div>

            {/* Drag rope overlay - fixed position, only during drag */}
            {renderDraggingRope()}

            {/* Board - Top-to-Bottom Layout */}
            <div className="ch2-board" ref={boardRef}>
                <svg className="ch2-svg-canvas" style={{ height: boardRef.current?.scrollHeight || '100%' }}>
                    {renderPermanentRopes()}
                </svg>
                {renderRopeDeleteButtons()}

                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: 'var(--text-secondary)' }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ marginLeft: 8 }}>Yükleniyor...</span>
                    </div>
                ) : (
                    <>
                        {/* TOP SECTION: Channels */}
                        <div className="ch2-section">
                            <div className="ch2-section-title">
                                <Unplug size={16} /> Kanallar
                            </div>
                            <div className="ch2-channels-grid">
                                {channelList.map(channel => {
                                    const ChannelIcon = channel.icon;
                                    const connCount = getChannelConnectionCount(channel.id);
                                    return (
                                        <div
                                            key={channel.id}
                                            ref={el => { channelRefs.current[channel.id] = el; }}
                                            className={`ch2-channel-chip ${dragState?.channel?.id === channel.id ? 'dragging' : ''}`}
                                            onMouseDown={(e) => handleDragStart(e, channel, 'channel')}
                                            data-fullname={channel.name}
                                        >
                                            <div className="ch2-channel-chip-icon" style={{ background: channel.bgColor, borderColor: channel.color }}>
                                                <ChannelIcon size={20} color={channel.color} />
                                            </div>
                                            <div className="ch2-channel-chip-name">{channel.name}</div>
                                            {connCount > 0 && (
                                                <div className="ch2-connection-badge">{connCount}</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* MIDDLE SECTION: Funnels */}
                        <div className="ch2-section">
                            <div className="ch2-funnels-list">
                                {/* Ana Akış */}
                                {(() => {
                                    const mainFunnel = funnels.find(f => f.funnelType === 'MAIN');
                                    const subFunnels = funnels.filter(f => f.funnelType !== 'MAIN');
                                    
                                    const renderFunnel = (funnel) => (
                                        <div key={funnel.id} className={`ch2-funnel-block ${funnel.funnelType === 'MAIN' ? 'main-funnel' : ''}`} ref={el => { funnelRefs.current[funnel.id] = el; }}>
                                            <div className="ch2-funnel-header" onMouseEnter={() => handleChannelDragEnter(funnel.id)} onMouseLeave={handleChannelDragLeave}>
                                                <div className="ch2-funnel-title">
                                                    <span>{funnel.icon || '📁'}</span>
                                                    {funnel.name}
                                                    {funnel.funnelType === 'MAIN' && <span className="ch2-main-badge">ANA</span>}
                                                    {dragOverChannel === funnel.id && <span style={{fontSize: '12px', color: '#6366f1'}}> (Buraya bağla)</span>}
                                                </div>
                                                <span className="channel-routing-hint">
                                                    🤖 Bot ataması → <a href="#" onClick={e => { e.preventDefault(); /* navigate to funnels */ }}>Akışlar</a>
                                                </span>
                                            </div>
                                            <div className="ch2-funnel-stages">
                                                {funnel.stages?.sort((a,b)=>a.order - b.order).map((stage) => {
                                                    return (
                                                        <div 
                                                            key={stage.id}
                                                            className="ch2-stage-card"
                                                            ref={el => { funnelRefs.current[`${funnel.id}-${stage.id}`] = el; }}
                                                        >
                                                            <div className="ch2-stage-header">
                                                                <div className="ch2-stage-color" style={{background: stage.color || '#6b7280'}}></div>
                                                                <div className="ch2-stage-name">{stage.name}</div>
                                                            </div>
                                                            {stage.assignedBotId && (
                                                                <div className="ch2-stage-bot-badge">
                                                                    🤖 {aiBots.find(b => b.id === stage.assignedBotId)?.name || 'Bot'}
                                                                    <button className="ch2-stage-bot-remove" onClick={() => handleAssignBotToFunnel(null, funnel.id, stage.id)}>×</button>
                                                                </div>
                                                            )}

                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    );

                                    return (
                                        <>
                                            {mainFunnel && renderFunnel(mainFunnel)}
                                            {subFunnels.length > 0 && (
                                                <div className="ch2-sub-funnels-group">
                                                    <div className="ch2-sub-funnels-label">Alt Akışlar</div>
                                                    {subFunnels.map(f => renderFunnel(f))}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Drag ghost cursor */}
            {dragState && (
                <div
                    className="ch2-drag-ghost"
                    style={{
                        left: mousePos.x,
                        top: mousePos.y,
                        background: dragState.channel?.color || '#ef4444'
                    }}
                >
                    <Link2 size={14} />
                    {dragState.channel?.name}
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`ch2-toast ${toast.type}`}>
                    {toast.type === 'success' ? <CheckCircle size={18} /> : <X size={18} />}
                    {toast.message}
                </div>
            )}

            {/* ===== MODALS ===== */}

            {/* WhatsApp Modal */}
            {showWhatsAppModal && (
                <WhatsAppSettings onClose={() => { setShowWhatsAppModal(false); loadAllChannels(); }} />
            )}

            {/* Retell Modal */}
            {showRetellModal && (
                <RetellSettings onClose={() => { setShowRetellModal(false); loadAllChannels(); }} />
            )}

            {/* Web Widget Modal */}
            {showWidgetModal && (
                <WebWidgetModal
                    mode={widgetModalMode}
                    widget={selectedWidget}
                    onClose={() => { setShowWidgetModal(false); loadAllChannels(); }}
                />
            )}

            {/* Form Webhook Modal */}
            {showFormModal && (
                <div className="modal-overlay" onClick={() => setShowFormModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, borderRadius: 16, padding: 28 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0 }}>Web Form Ekle</h3>
                            <button onClick={() => setShowFormModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <input
                                type="text" placeholder="Form Adı"
                                value={newFormName} onChange={e => setNewFormName(e.target.value)}
                                style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: '0.9rem' }}
                            />
                            <input
                                type="text" placeholder="Site URL"
                                value={newSiteUrl} onChange={e => setNewSiteUrl(e.target.value)}
                                style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: '0.9rem' }}
                            />
                            <button
                                onClick={handleCreateFormWebhook}
                                style={{ padding: '10px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                            >
                                Oluştur
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Provider Modal */}
            {showEmailModal && (
                <div className="modal-overlay" onClick={() => setShowEmailModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, borderRadius: 16, padding: 28 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0 }}>E-posta Bağla</h3>
                            <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        {!emailProvider ? (
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button onClick={handleGmailConnect} style={{ flex: 1, padding: 16, border: '2px solid var(--border-color)', borderRadius: 12, background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                                    Gmail
                                </button>
                                <button onClick={() => setEmailProvider('imap')} style={{ flex: 1, padding: 16, border: '2px solid var(--border-color)', borderRadius: 12, background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                                    IMAP / SMTP
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <select value={imapForm.preset} onChange={e => handleImapPresetChange(e.target.value)} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                                    <option value="yandex">Yandex</option>
                                    <option value="outlook">Outlook</option>
                                    <option value="custom">Özel</option>
                                </select>
                                <input type="email" placeholder="E-posta" value={imapForm.email} onChange={e => setImapForm(prev => ({ ...prev, email: e.target.value }))} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8 }} />
                                <input type="password" placeholder="Şifre" value={imapForm.password} onChange={e => setImapForm(prev => ({ ...prev, password: e.target.value }))} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8 }} />
                                {imapForm.preset === 'custom' && (
                                    <>
                                        <input type="text" placeholder="IMAP Host" value={imapForm.imapHost} onChange={e => setImapForm(prev => ({ ...prev, imapHost: e.target.value }))} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8 }} />
                                        <input type="text" placeholder="SMTP Host" value={imapForm.smtpHost} onChange={e => setImapForm(prev => ({ ...prev, smtpHost: e.target.value }))} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8 }} />
                                    </>
                                )}
                                <button onClick={handleImapConnect} disabled={connectingEmail} style={{ padding: '10px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: connectingEmail ? 0.6 : 1 }}>
                                    {connectingEmail ? 'Bağlanıyor...' : 'Bağla'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Page Select Modal */}
            {showPageSelectModal && (
                <div className="modal-overlay" onClick={() => setShowPageSelectModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, borderRadius: 16, padding: 28 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0 }}>Sayfa Seçin</h3>
                            <button onClick={() => setShowPageSelectModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                            {availablePages.map(page => (
                                <div
                                    key={page.id}
                                    onClick={() => setSelectedPages(prev => prev.includes(page.id) ? prev.filter(id => id !== page.id) : [...prev, page.id])}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '12px 16px', border: `2px solid ${selectedPages.includes(page.id) ? 'var(--primary)' : 'var(--border-color)'}`,
                                        borderRadius: 12, cursor: 'pointer', background: selectedPages.includes(page.id) ? 'var(--primary-light)' : 'white',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <input type="checkbox" checked={selectedPages.includes(page.id)} readOnly />
                                    <span style={{ fontWeight: 500 }}>{page.name}</span>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={handleConnectSelectedPages}
                            disabled={connectingPages || selectedPages.length === 0}
                            style={{
                                marginTop: 16, width: '100%', padding: '12px', background: 'var(--primary)', color: 'white',
                                border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
                                opacity: connectingPages || selectedPages.length === 0 ? 0.5 : 1
                            }}
                        >
                            {connectingPages ? 'Bağlanıyor...' : `${selectedPages.length} Sayfa Bağla`}
                        </button>
                    </div>
                </div>
            )}

            {/* Health System Modal */}
            {showHealthModal && (
                <div className="modal-overlay" onClick={() => setShowHealthModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, borderRadius: 16, padding: 28 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0 }}>Sağlık Sistemi Bağla</h3>
                            <button onClick={() => setShowHealthModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <input type="text" placeholder="API URL" value={healthForm.apiUrl} onChange={e => setHealthForm(prev => ({ ...prev, apiUrl: e.target.value }))} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8 }} />
                            <input type="text" placeholder="Kullanıcı Adı" value={healthForm.username} onChange={e => setHealthForm(prev => ({ ...prev, username: e.target.value }))} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8 }} />
                            <input type="password" placeholder="Şifre" value={healthForm.password} onChange={e => setHealthForm(prev => ({ ...prev, password: e.target.value }))} style={{ padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 8 }} />
                            <button onClick={handleHealthConnect} disabled={healthConnecting} style={{ padding: '10px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: healthConnecting ? 0.6 : 1 }}>
                                {healthConnecting ? 'Bağlanıyor...' : 'Bağla'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Channel Routing Popup */}
            {selectedChannelPopup && (() => {
                const ch = selectedChannelPopup;
                const ChannelIcon = ch.icon;
                const existingRouting = channelRoutings.find(r => r.channel === ch.routingChannel);
                const selectedFunnel = funnels.find(f => f.id === existingRouting?.funnelId);
                const funnelStages = selectedFunnel?.stages || [];
                return (
                    <div className="modal-overlay" onClick={() => setSelectedChannelPopup(null)}>
                        <div className="ch2-routing-popup" onClick={e => e.stopPropagation()}>
                            <div className="ch2-routing-popup-header">
                                <div className="ch2-routing-popup-channel">
                                    <div className="ch2-routing-popup-icon" style={{ background: ch.bgColor }}>
                                        <ChannelIcon size={18} color={ch.color} />
                                    </div>
                                    <div>
                                        <div className="ch2-routing-popup-name">{ch.name}</div>
                                        <div className="ch2-routing-popup-type">{ch.type}</div>
                                    </div>
                                </div>
                                <button className="ch2-routing-popup-close" onClick={() => setSelectedChannelPopup(null)}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="ch2-routing-popup-body">
                                <div className="ch2-routing-row">
                                    <label><GitBranch size={14} /> Akış</label>
                                    <select
                                        value={existingRouting?.funnelId || ''}
                                        onChange={(e) => handleSaveRouting(ch.routingChannel, 'funnelId', e.target.value)}
                                    >
                                        <option value="">Akış seçin</option>
                                        {funnels.map(f => (<option key={f.id} value={f.id}>{f.icon || '📁'} {f.name}</option>))}
                                    </select>
                                </div>

                                {existingRouting?.funnelId && funnelStages.length > 0 && (
                                    <div className="ch2-routing-row">
                                        <label><ChevronRight size={14} /> Aşama</label>
                                        <select
                                            value={existingRouting?.stageId || ''}
                                            onChange={(e) => handleSaveRouting(ch.routingChannel, 'stageId', e.target.value)}
                                        >
                                            <option value="">İlk aşama (varsayılan)</option>
                                            {funnelStages.sort((a, b) => a.order - b.order).map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                                        </select>
                                    </div>
                                )}

                                <div className="ch2-routing-row">
                                    <span className="channel-routing-hint">
                                        👥 Takım ataması → <a href="#" onClick={e => { e.preventDefault(); /* navigate to funnels */ }}>Akışlar</a>
                                    </span>
                                </div>

                                {savingRouting === ch.routingChannel && (
                                    <div className="ch2-routing-saving">
                                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Kaydediliyor...
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Spinning animation keyframes */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default Channels2;
