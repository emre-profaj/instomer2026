import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { X, Loader, Send, ExternalLink, User, Check, CheckCheck, StickyNote, Users, ChevronDown, CheckCircle2, Circle, Trash2, UserCheck, Bot, Sparkles, Smile, BookOpen, AlertCircle } from 'lucide-react';
import { conversationAPI, funnelAPI, workspaceAPI, teamAPI, contactAPI, caseAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import { useAuth } from '../../context/AuthContext';
import './ChatPopup.css';

const CUSTOMER_STATUS_OPTIONS = [
    { value: 'NEW_APPLICATION', label: 'Yeni Başvuru', color: '#3b82f6' },
    { value: 'OPPORTUNITY', label: 'Fırsat', color: '#f59e0b' },
    { value: 'HOT_OPPORTUNITY', label: 'Sıcak Fırsat', color: '#ef4444' },
    { value: 'UNREACHABLE', label: 'Ulaşılamadı', color: '#64748b' },
    { value: 'CALLBACK', label: 'Tekrar Ara', color: '#0ea5e9' },
    { value: 'OFFER_GIVEN', label: 'Teklif Verildi', color: '#8b5cf6' },
    { value: 'APPOINTMENT_SCHEDULED', label: 'Randevu Planlandı', color: '#14b8a6' },
    { value: 'NEGOTIATION', label: 'Pazarlık', color: '#f97316' },
    { value: 'CONTRACT', label: 'Sözleşme', color: '#06b6d4' },
    { value: 'SOLD', label: 'Satış (Kazanıldı)', color: '#22c55e' },
    { value: 'LOST', label: 'Kaybedildi', color: '#ef4444' },
    { value: 'SPAM', label: 'Spam/Geçersiz', color: '#9ca3af' }
];

const getDefaultStagesForFunnel = (name) => {
    const n = (name || '').toLowerCase();
    if (n.includes('iş baş') || n.includes('is bas') || n.includes('kariyer') || n.includes('cv') || n.includes('insan') || n.includes('başvuru')) {
        return [
            { value: 'CV_RECEIVED', label: 'CV Alındı', color: '#3b82f6' },
            { value: 'CV_REVIEW', label: 'CV İnceleniyor', color: '#06b6d4' },
            { value: 'PRE_INTERVIEW', label: 'Ön Görüşme', color: '#8b5cf6' },
            { value: 'INTERVIEW', label: 'Mülakat', color: '#f59e0b' },
            { value: 'TECHNICAL_EVAL', label: 'Teknik Değerlendirme', color: '#f97316' },
            { value: 'REFERENCE_CHECK', label: 'Referans Kontrolü', color: '#ec4899' },
            { value: 'OFFER_GIVEN', label: 'Teklif Yapıldı', color: '#0ea5e9' },
            { value: 'HIRED', label: 'İşe Alındı', color: '#10b981' },
            { value: 'REJECTED', label: 'Reddedildi', color: '#ef4444' },
            { value: 'WITHDREW', label: 'Vazgeçti', color: '#94a3b8' },
        ];
    }
    if (n.includes('destek') || n.includes('şikayet') || n.includes('sikayet') || n.includes('support') || n.includes('ticket')) {
        return [
            { value: 'NEW_TICKET', label: 'Yeni Talep', color: '#3b82f6' },
            { value: 'IN_PROGRESS', label: 'İşleniyor', color: '#f59e0b' },
            { value: 'WAITING_CUSTOMER', label: 'Müşteri Bekleniyor', color: '#8b5cf6' },
            { value: 'ESCALATED', label: 'Eskalasyon', color: '#ef4444' },
            { value: 'RESOLVED', label: 'Çözüldü', color: '#10b981' },
            { value: 'CLOSED', label: 'Kapatıldı', color: '#6b7280' },
        ];
    }
    return [
        { value: 'NEW_APPLICATION', label: 'Yeni Başvuru', color: '#3b82f6' },
        { value: 'INFO_GIVEN', label: 'Bilgi Verildi', color: '#06b6d4' },
        { value: 'OPPORTUNITY', label: 'Fırsat', color: '#f59e0b' },
        { value: 'HOT_OPPORTUNITY', label: 'Sıcak Fırsat', color: '#ef4444' },
        { value: 'UNREACHABLE', label: 'Ulaşılamadı', color: '#64748b' },
        { value: 'CALLBACK', label: 'Tekrar Ara', color: '#0ea5e9' },
        { value: 'OFFER_GIVEN', label: 'Teklif Verildi', color: '#8b5cf6' },
        { value: 'APPOINTMENT_SCHEDULED', label: 'Randevu Planlandı', color: '#14b8a6' },
        { value: 'NEGOTIATION', label: 'Pazarlık', color: '#f97316' },
        { value: 'CONTRACT', label: 'Sözleşme', color: '#06b6d4' },
        { value: 'SALE_COMPLETED', label: 'Satış', color: '#10b981' },
        { value: 'LOST', label: 'Kayıp', color: '#1f2937' },
        { value: 'NOT_INTERESTED', label: 'İlgisiz', color: '#9ca3af' },
    ];
};

const getChannelIcon = (ch) => {
    if (ch === 'WHATSAPP') return '💬';
    if (ch === 'FACEBOOK') return '📘';
    if (ch === 'INSTAGRAM') return '📸';
    if (ch === 'FACEBOOK_COMMENT') return '💬';
    if (ch === 'EMAIL') return '✉️';
    if (ch === 'WIDGET') return '🌐';
    if (ch === 'PHONE') return '📞';
    if (ch === 'FORM' || ch === 'LEAD') return '📋';
    return '💬';
};

const getChannelName = (ch) => {
    if (ch === 'WHATSAPP') return 'WhatsApp';
    if (ch === 'FACEBOOK') return 'Facebook';
    if (ch === 'INSTAGRAM') return 'Instagram';
    if (ch === 'FACEBOOK_COMMENT') return 'FB Yorum';
    if (ch === 'EMAIL') return 'E-posta';
    if (ch === 'WIDGET') return 'Web Widget';
    if (ch === 'PHONE') return 'Telefon';
    if (ch === 'FORM' || ch === 'LEAD') return 'Form';
    return ch || 'Mesaj';
};

const ChatPopup = ({ conversationId, onClose }) => {
    const { currentWorkspace, user } = useAuth();
    const navigate = useNavigate();
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    // Assignment & Funnel States
    const [funnelOptions, setFunnelOptions] = useState([]);
    const [teams, setTeams] = useState([]);
    const [members, setMembers] = useState([]);
    
    // Stage Mega Menu
    const [stageMegaMenuOpen, setStageMegaMenuOpen] = useState(false);
    const [stageMegaMenuPos, setStageMegaMenuPos] = useState({ top: 0, left: 0 });
    const [stageMegaMenuHoverFunnel, setStageMegaMenuHoverFunnel] = useState(null);
    const stageMegaMenuRef = useRef(null);
    const stageMenuDivRef = useRef(null);

    // Assign Mega Menu
    const [assignMegaMenuOpen, setAssignMegaMenuOpen] = useState(false);
    const [assignMegaMenuPos, setAssignMegaMenuPos] = useState({ top: 0, left: 0 });
    const [assignSelectedTeam, setAssignSelectedTeam] = useState(null);
    const assignMegaMenuRef = useRef(null);
    const assignMenuDivRef = useRef(null);

    const [takingOver, setTakingOver] = useState(false);

    // NEW: Internal note mode, bot toggle, AI topic
    const [isInternalNoteMode, setIsInternalNoteMode] = useState(false);
    const [botEnabled, setBotEnabled] = useState(false);
    const [togglingBot, setTogglingBot] = useState(false);
    const [aiTopic, setAiTopic] = useState('');

    // Load dependencies (teams, members, funnels)
    useEffect(() => {
        if (!currentWorkspace?.id) return;
        const loadDependencies = async () => {
            try {
                const [funnelsRes, teamsRes, membersRes] = await Promise.all([
                    funnelAPI.getAll(currentWorkspace.id).catch(() => ({ data: { funnels: [] } })),
                    teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(() => ({ data: { teams: [] } })),
                    workspaceAPI.getMembers(currentWorkspace.id).catch(() => ({ data: { members: [] } }))
                ]);
                
                const rawFunnels = funnelsRes.data?.funnels || (Array.isArray(funnelsRes.data) ? funnelsRes.data : []);
                setFunnelOptions([
                    { value: '', label: 'Genel (Akışsız)', stages: CUSTOMER_STATUS_OPTIONS },
                    ...rawFunnels.map(f => ({
                        value: f.id,
                        label: f.name,
                        color: f.color,
                        stages: (f.stages && f.stages.length > 0) 
                            ? f.stages.map(s => ({ value: s.id, label: s.name, color: s.color }))
                            : getDefaultStagesForFunnel(f.name)
                    }))
                ]);
                const rawTeams = teamsRes.data?.teams || (Array.isArray(teamsRes.data) ? teamsRes.data : []);
                setTeams(rawTeams);
                const rawMembers = membersRes.data?.members || (Array.isArray(membersRes.data) ? membersRes.data : []);
                setMembers(rawMembers);
            } catch (err) {
                console.error("[ChatPopup] Error loading dependencies", err);
            }
        };
        loadDependencies();
    }, [currentWorkspace, conversationId]);

    // Load ALL conversations for this contact — unified view
    useEffect(() => {
        if (!conversationId || !currentWorkspace) return;

        const loadConversation = async () => {
            setLoading(true);
            try {
                // 1. Load the primary conversation to get contactId + conversation metadata
                const response = await conversationAPI.getById(currentWorkspace.id, conversationId);
                const conv = response.data.conversation || response.data;
                setConversation(conv);
                setAiTopic(conv.aiTopic || '');
                setBotEnabled(!!conv.assignedBotId || !!conv.botEnabled);

                const contactId = conv.contactId;

                // 2. Load ALL conversations for this contact and merge messages
                let allMsgs = [];
                let allNotes = [];
                let allEvents = [];

                if (contactId) {
                    try {
                        const allConvRes = await conversationAPI.getAll(currentWorkspace.id, { contactId });
                        const allConvs = allConvRes.data?.conversations || [];
                        const convIds = allConvs.map(c => c.id);

                        // Load each conversation's full data
                        const loadPromises = convIds.map(cid =>
                            conversationAPI.getById(currentWorkspace.id, cid)
                                .then(r => r.data.conversation || r.data)
                                .catch(() => null)
                        );
                        const allConvData = (await Promise.all(loadPromises)).filter(Boolean);

                        // If we got a better primary conversation (non-LEAD with messages), use it
                        const bestConv = allConvData
                            .filter(c => c.channel !== 'LEAD' && (c.messages?.length || 0) > 0)
                            .sort((a, b) => {
                                const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                                const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                                return bTime - aTime;
                            })[0];
                        if (bestConv) {
                            setConversation(bestConv);
                            setAiTopic(bestConv.aiTopic || '');
                            setBotEnabled(!!bestConv.assignedBotId || !!bestConv.botEnabled);
                        }

                        // Merge all messages from all conversations
                        for (const cd of allConvData) {
                            allMsgs.push(...(cd.messages || []));
                            allNotes.push(...(cd.internalNotes || []).map(n => ({
                                ...n,
                                isInternalNote: true,
                                messageType: 'NOTE',
                                sender: n.user,
                                isFromContact: false
                            })));
                            allEvents.push(...(cd.events || []).map(e => ({
                                id: e.id,
                                createdAt: e.createdAt,
                                isSystemEvent: true,
                                eventType: e.eventType,
                                title: e.title,
                                actorType: e.actorType,
                                actorId: e.actorId,
                                details: e.details
                            })));
                        }
                    } catch (mergeErr) {
                        console.warn('[ChatPopup] Multi-conv merge failed, using single:', mergeErr.message);
                        // Fallback: use only the primary conversation
                        allMsgs = conv.messages || [];
                        allNotes = (conv.internalNotes || []).map(n => ({
                            ...n, isInternalNote: true, messageType: 'NOTE', sender: n.user, isFromContact: false
                        }));
                        allEvents = (conv.events || []).map(e => ({
                            id: e.id, createdAt: e.createdAt, isSystemEvent: true,
                            eventType: e.eventType, title: e.title, actorType: e.actorType,
                            actorId: e.actorId, details: e.details
                        }));
                    }
                } else {
                    // No contactId — single conversation only
                    allMsgs = conv.messages || [];
                    allNotes = (conv.internalNotes || []).map(n => ({
                        ...n, isInternalNote: true, messageType: 'NOTE', sender: n.user, isFromContact: false
                    }));
                    allEvents = (conv.events || []).map(e => ({
                        id: e.id, createdAt: e.createdAt, isSystemEvent: true,
                        eventType: e.eventType, title: e.title, actorType: e.actorType,
                        actorId: e.actorId, details: e.details
                    }));
                }

                // Deduplicate messages by id
                const seenIds = new Set();
                allMsgs = allMsgs.filter(m => {
                    if (seenIds.has(m.id)) return false;
                    seenIds.add(m.id);
                    return true;
                });

                // 3. Load activities
                let formattedActivities = [];
                if (contactId && currentWorkspace?.id) {
                    try {
                        const actRes = await activityAPI.getTimeline(contactId, currentWorkspace.id);
                        const allActivities = [
                            ...(actRes?.planned || []),
                            ...(actRes?.past || [])
                        ];
                        formattedActivities = allActivities
                            .filter(a => a.sourceType === 'ACTIVITY' && a.type !== 'NOTE')
                            .map(a => ({
                                id: `activity-${a.id}`,
                                createdAt: a.date || a.dueDate || a.raw?.createdAt,
                                isActivity: true,
                                activityType: a.type,
                                activityStatus: a.status || (a.isCompleted ? 'COMPLETED' : 'PLANNED'),
                                activityTitle: a.title,
                                activityContent: a.content || '',
                                activityResult: a.result || a.raw?.result || '',
                                activityDueDate: a.dueDate,
                                activityAssignedTo: a.assignedToName || a.labelName || '',
                                activityTeam: a.raw?.team?.name || '',
                            }));
                    } catch (e) {
                        console.warn('Activities load failed:', e.message);
                    }
                }

                const combined = [...allMsgs, ...allNotes, ...allEvents, ...formattedActivities].sort(
                    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
                );
                setMessages(combined);
            } catch (error) {
                console.error('Error loading conversation for popup:', error);
            } finally {
                setLoading(false);
            }
        };

        loadConversation();
    }, [conversationId, currentWorkspace]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Handlers
    const handleSend = async () => {
        if (!newMessage.trim() || !conversation || sending) return;

        setSending(true);
        try {
            if (isInternalNoteMode) {
                // Send as internal note (like Inbox)
                const response = await conversationAPI.addNote(
                    currentWorkspace.id,
                    conversation.id,
                    { content: newMessage }
                );
                const newNote = {
                    ...response.data.note,
                    isInternalNote: true,
                    messageType: 'NOTE',
                    sender: user,
                    isFromContact: false
                };
                setMessages(prev => [...prev, newNote]);
            } else {
                // Send as regular message
                const response = await conversationAPI.sendMessage(
                    currentWorkspace.id,
                    conversation.id,
                    { content: newMessage }
                );
                if (!response.data.duplicate) {
                    setMessages(prev => {
                        if (prev.some(m => m.id === response.data.message.id)) return prev;
                        return [...prev, response.data.message];
                    });
                }
            }
            setNewMessage('');
            if (textareaRef.current) textareaRef.current.focus();
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Mesaj gönderilemedi.');
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleOpenInInbox = () => {
        onClose();
        navigate(`/inbox?conversationId=${conversationId}`);
    };
    
    const handleToggleStatus = async () => {
        if (!conversation) return;
        const newStatus = conversation.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED';
        try {
            await conversationAPI.updateStatus(currentWorkspace.id, conversation.id, { status: newStatus });
            setConversation(prev => ({ ...prev, status: newStatus }));
        } catch (err) {
            console.error('Status update error', err);
        }
    };
    
    const handleClaimConversation = async () => {
        if (!conversation || takingOver) return;
        setTakingOver(true);
        try {
            await conversationAPI.claim(currentWorkspace.id, conversation.id);
            setConversation(prev => ({ 
                ...prev, 
                assignedToId: user.id, 
                assignedTo: { id: user.id, name: user.name } 
            }));
        } catch (err) {
            console.error('Claim error:', err);
        } finally {
            setTakingOver(false);
        }
    };
    
    const handleAssignConversation = async (teamId, agentId) => {
        if (!conversation) return;
        setAssignMegaMenuOpen(false);
        try {
            const res = await conversationAPI.assignNew(currentWorkspace.id, conversation.id, { teamId, agentId });
            const conv = res.data.conversation || res.data;
            setConversation(prev => ({ 
                ...prev, 
                assignedToId: conv.assignedToId, 
                assignedTo: conv.assignedTo, 
                teamIds: conv.teamIds 
            }));
        } catch (e) {
            console.error('Assign error:', e);
            alert('Atama yapılamadı: ' + (e?.response?.data?.error || e?.message));
        }
    };
    
    const handleDeleteItem = async () => {
        if (!conversation) return;
        if (window.confirm('Bu sohbeti silmek istediğinize emin misiniz?')) {
            try {
                await conversationAPI.delete(currentWorkspace.id, conversation.id);
                onClose();
            } catch (err) {
                console.error('Delete error', err);
                alert('Sohbet silinirken hata oluştu');
            }
        }
    };
    
    const handleStageSelect = async (newFunnel, newStage) => {
        setStageMegaMenuOpen(false);
        if (!conversation || !conversation.contact) return;
        
        try {
            await contactAPI.update(currentWorkspace.id, conversation.contact.id, { status: newStage });
            const updatePayload = { funnelStageId: newStage, funnelType: newFunnel };
            let res = await conversationAPI.updateFunnel(currentWorkspace.id, conversation.id, updatePayload);
            
            if (res.data?.needsConfirmation) {
                const msg = `Bu konuşma ${res.data.currentAssignee.name} kullanıcısına atanmış. Yeni aşama bu konuşmayı ${res.data.suggestedAssignee.name} kullanıcısına atamayı öneriyor. Atamayı değiştirmek ister misiniz?`;
                const confirmUpdate = window.confirm(msg);
                res = await conversationAPI.updateFunnel(currentWorkspace.id, conversation.id, {
                    ...updatePayload,
                    confirmAssignmentUpdate: confirmUpdate
                });
            }

            const updatedConvRes = await conversationAPI.getById(currentWorkspace.id, conversation.id);
            const conv = updatedConvRes.data.conversation || updatedConvRes.data;
            if (conv) {
                setConversation(conv);
            } else {
                setConversation(prev => ({ 
                    ...prev, 
                    funnelType: newFunnel, 
                    contact: { ...prev.contact, status: newStage }, 
                    funnelStageId: newStage, 
                    _effectiveStageId: newStage 
                }));
            }
        } catch (err) { 
            console.error('Stage update error:', err); 
        }
    };

    // NEW: Bot toggle handler (matching Inbox)
    const handleBotToggle = async () => {
        if (!conversation || togglingBot) return;
        const newValue = !botEnabled;
        setTogglingBot(true);
        try {
            const response = await conversationAPI.toggleBot(currentWorkspace.id, conversation.id, newValue);
            setBotEnabled(newValue);
            if (newValue && response.data?.assignedToId === null) {
                setConversation(prev => ({
                    ...prev,
                    botEnabled: true,
                    assignedToId: null,
                    assignedTo: null
                }));
            }
        } catch (error) {
            console.error('Error toggling bot:', error);
            setBotEnabled(!newValue);
        } finally {
            setTogglingBot(false);
        }
    };

    // NEW: AI Topic update handler
    const handleTopicBlur = async (e) => {
        const newTopic = e.target.value;
        try {
            await conversationAPI.updateTopic(currentWorkspace.id, conversation.id, newTopic);
            // Case title'ı da senkronize et (Yazışma konusu = Case konusu)
            if (conversation.caseId) {
                await caseAPI.update(currentWorkspace.id, conversation.caseId, { title: newTopic });
                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
            }
        } catch (err) { 
            console.error('Topic update error:', err); 
        }
    };

    // Formatters
    const formatTime = (date) => new Date(date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const formatDateTime = (d) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---';
    const formatDateSep = (date) => {
        const d = new Date(date);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (d.toDateString() === today.toDateString()) return 'Bugün';
        if (d.toDateString() === yesterday.toDateString()) return 'Dün';
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const getChannelLabel = (conv) => {
        if (!conv) return '';
        if (conv.instagramBusinessId || conv.channel === 'INSTAGRAM') return 'Instagram';
        if (conv.whatsappPhoneNumberId || conv.channel === 'WHATSAPP') return 'WhatsApp';
        if (conv.emailChannelId || conv.channel === 'EMAIL') return 'E-posta';
        if (conv.channel === 'WIDGET') return 'Web Widget';
        if (conv.facebookPageId || conv.channel === 'FACEBOOK') return 'Facebook';
        return conv.channel || '';
    };

    const shouldShowDate = (msg, idx) => {
        if (idx === 0) return true;
        const prev = messages[idx - 1];
        const prevDate = new Date(prev.createdAt).toDateString();
        const curDate = new Date(msg.createdAt).toDateString();
        return prevDate !== curDate;
    };

    const renderStatus = (msg) => {
        if (msg.isFromContact || msg.isInternalNote) return null;
        if (msg.status === 'READ') return <CheckCheck size={14} className="status-read" />;
        if (msg.status === 'DELIVERED') return <CheckCheck size={14} className="status-delivered" />;
        if (msg.status === 'FAILED') return <AlertCircle size={14} className="status-failed" />;
        return <Check size={14} className="status-sent" />;
    };

    const contactName = conversation?.contact?.name || 'Bilinmeyen';
    const channelLabel = getChannelLabel(conversation);
    const channel = conversation?.channel;
    
    // İlk / Son yazma tarihleri (Inbox pattern)
    const contactMessages = messages.filter(m => m.isFromContact);
    const firstDate = contactMessages[0]?.createdAt;
    const lastDate = contactMessages[contactMessages.length - 1]?.createdAt;

    // UI Helpers for Assignment Bar
    let convTeamIds = [];
    try { convTeamIds = JSON.parse(conversation?.teamIds || '[]'); } catch {}
    const assignedTeam = convTeamIds.length > 0 ? teams.find(t => t.id === convTeamIds[0]) : null;
    const assignedAgent = conversation?.assignedTo || (conversation?.assignedToId ? members.find(m => m.id === conversation.assignedToId) : null);

    let pillLabel = 'Atanmadı';
    if (assignedTeam && assignedAgent) pillLabel = `${assignedTeam.name} / ${assignedAgent.name}`;
    else if (assignedTeam) pillLabel = `${assignedTeam.name} (Havuz)`;
    else if (assignedAgent) pillLabel = assignedAgent.name;

    const canClaim = !conversation?.assignedToId || conversation.assignedToId !== user?.id;

    // Active Funnel info
    const activeFunnel = funnelOptions.find(o => o.value === (conversation?.funnelType || ''));
    const stageOptions = (activeFunnel && activeFunnel.stages && activeFunnel.stages.length > 0)
        ? activeFunnel.stages
        : CUSTOMER_STATUS_OPTIONS;
    const activeStageVal = conversation?._effectiveStageId || conversation?.funnelStageId || conversation?.contact?.funnelStageId || stageOptions[0]?.value;
    const currentStageColor = stageOptions.find(o => o.value === activeStageVal)?.color || '#3b82f6';
    const activeStageLabel = (() => {
        for (const f of funnelOptions) {
            const stages = (f.stages && f.stages.length > 0) ? f.stages : (f.value === '' ? CUSTOMER_STATUS_OPTIONS : []);
            const found = stages.find(s => s.value === activeStageVal);
            if (found) return found.label || found.name;
        }
        return activeStageVal;
    })();

    // Activity type configs (matching Inbox)
    const actTypeConfig = {
        CALL:     { icon: '📞', label: 'Arama', accent: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
        NOTE:     { icon: '📝', label: 'Not', accent: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
        MEETING:  { icon: '📅', label: 'Görüşme', accent: '#10b981', bg: '#f0fdf4', border: '#a7f3d0' },
        REMINDER: { icon: '🔔', label: 'Hatırlatıcı', accent: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
        TASK:     { icon: '✅', label: 'Görev', accent: '#8b5cf6', bg: '#faf5ff', border: '#ddd6fe' },
        VISIT:    { icon: '📍', label: 'Ziyaret', accent: '#a855f7', bg: '#fdf4ff', border: '#e9d5ff' },
        PAYMENT:  { icon: '💰', label: 'Tahsilat', accent: '#eab308', bg: '#fefce8', border: '#fef08a' },
    };
    const actStatusConfig = {
        COMPLETED: { emoji: '✅', label: 'Tamamlandı', bg: '#dcfce7', color: '#15803d' },
        PLANNED:   { emoji: '🕐', label: 'Planlandı', bg: '#dbeafe', color: '#1d4ed8' },
        CANCELLED: { emoji: '❌', label: 'İptal', bg: '#f3f4f6', color: '#6b7280' },
    };

    return (
        <div className="chat-popup-overlay" onClick={onClose}>
            <div className="chat-popup-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header Top Row — matching Inbox profile-bar */}
                <div className="chat-popup-header">
                    <div className="chat-popup-header-left">
                        <div className="chat-popup-avatar">
                            {conversation?.contact?.avatar ? (
                                <img
                                    src={conversation.contact.avatar}
                                    alt={contactName}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                <User size={20} />
                            )}
                        </div>
                        <div className="chat-popup-header-info">
                            <h3 className="chat-popup-contact-name">{loading ? 'Yükleniyor...' : contactName}</h3>
                            {/* İlk / Son tarihler — matching Inbox */}
                            {!loading && (
                                <div className="chat-popup-dates-row">
                                    <span>İlk: {formatDateTime(firstDate)}</span>
                                    <span className="chat-popup-dates-sep">•</span>
                                    <span>Son: {formatDateTime(lastDate)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="chat-popup-header-actions">
                        {/* AI Topic Input — matching Inbox */}
                        {!loading && conversation && (
                            <input
                                className="chat-popup-topic-input"
                                type="text"
                                placeholder="Konu başlığı..."
                                value={aiTopic}
                                onChange={(e) => setAiTopic(e.target.value)}
                                onBlur={handleTopicBlur}
                            />
                        )}
                        {/* Status Toggle & Delete */}
                        {!loading && conversation && (
                            <>
                                <button className={`chat-popup-status-toggle ${conversation.status === 'RESOLVED' ? 'resolved' : 'open'}`} onClick={handleToggleStatus}>
                                    <span className="toggle-thumb">
                                        {conversation.status === 'RESOLVED' ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                                    </span>
                                    <span className="toggle-label">{conversation.status === 'RESOLVED' ? 'Çözüldü' : 'Açık'}</span>
                                </button>
                                <button className="chat-popup-icon-btn chat-popup-delete-btn" onClick={handleDeleteItem} title="Sohbeti Sil">
                                    <Trash2 size={15} />
                                </button>
                            </>
                        )}
                        <button className="chat-popup-icon-btn chat-popup-open-inbox-btn" onClick={handleOpenInInbox} title="Inbox'ta Aç">
                            <ExternalLink size={14} />
                        </button>
                        <button className="chat-popup-icon-btn chat-popup-close-btn" onClick={onClose} title="Kapat">
                            <X size={16} />
                        </button>
                    </div>
                </div>
                
                {/* Assignment Bar (Bottom Header Row) */}
                {!loading && conversation && (
                    <div className="chat-popup-assignment-bar">
                        {/* Funnel Stage Selector */}
                        <div ref={stageMegaMenuRef} style={{ position: 'relative' }}>
                            <button
                                className="chat-popup-assign-trigger"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setStageMegaMenuPos({ top: rect.bottom + 4, left: rect.left });
                                    setStageMegaMenuOpen(v => !v);
                                }}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: currentStageColor }} />
                                <span className="trigger-text">{activeStageLabel || 'Aşama Seç'}</span>
                                <ChevronDown size={10} style={{ marginLeft: 2 }} />
                            </button>
                            
                            {stageMegaMenuOpen && ReactDOM.createPortal(
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 99998 }} onClick={() => { setStageMegaMenuOpen(false); setStageMegaMenuHoverFunnel(null); }} />
                                    <div ref={stageMenuDivRef} style={{
                                        position: 'fixed', top: stageMegaMenuPos.top, left: stageMegaMenuPos.left, zIndex: 99999,
                                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                        padding: 8, display: 'flex', flexDirection: 'row', gap: 4, minWidth: 340,
                                    }}>
                                        <div style={{ minWidth: 170, borderRight: '1px solid #f1f5f9', paddingRight: 8 }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>Akış</div>
                                            {funnelOptions.filter(f => f.value !== '').map(funnel => {
                                                const isActiveFunnel = (conversation.funnelType || '') === funnel.value;
                                                const isHighlighted = isActiveFunnel || stageMegaMenuHoverFunnel === funnel.value;
                                                return (
                                                    <button key={funnel.value} onMouseEnter={() => setStageMegaMenuHoverFunnel(funnel.value)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                                                            padding: '7px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                                            fontSize: '0.8rem', fontWeight: isActiveFunnel ? 700 : 500,
                                                            background: isHighlighted ? '#eff6ff' : 'transparent', color: isHighlighted ? '#1d4ed8' : '#374151',
                                                        }}
                                                    >
                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: funnel.color || '#6366f1' }} />
                                                        {funnel.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {(() => {
                                            const displayFunnelVal = stageMegaMenuHoverFunnel !== null 
                                                ? stageMegaMenuHoverFunnel 
                                                : (conversation.funnelType !== undefined && conversation.funnelType !== null 
                                                    ? conversation.funnelType 
                                                    : (funnelOptions.filter(f => f.value !== '')[0]?.value || ''));
                                            const displayFunnel = funnelOptions.find(f => f.value === displayFunnelVal);
                                            if (!displayFunnel) return null;
                                            const stages = (displayFunnel.stages && displayFunnel.stages.length > 0) ? displayFunnel.stages : CUSTOMER_STATUS_OPTIONS;
                                            const isActiveFunnel = (conversation.funnelType || '') === displayFunnel.value;
                                            return (
                                                <div style={{ minWidth: 190 }}>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>{displayFunnel.label}</div>
                                                    {stages.map(stage => {
                                                        const isActive = activeStageVal === stage.value && isActiveFunnel;
                                                        return (
                                                            <button key={stage.value} onClick={() => handleStageSelect(displayFunnel.value, stage.value)}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                                                                    padding: '7px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                                                    fontSize: '0.8rem', fontWeight: isActive ? 700 : 400,
                                                                    background: isActive ? (stage.color || '#6366f1') + '18' : 'transparent', color: isActive ? (stage.color || '#6366f1') : '#374151',
                                                                }}
                                                            >
                                                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: stage.color || '#6366f1' }} />
                                                                {stage.label || stage.name}
                                                                {isActive && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </>, document.body
                            )}
                        </div>
                        
                        {/* Team/Agent Assignment Selector */}
                        <div ref={assignMegaMenuRef} style={{ position: 'relative' }}>
                            <button
                                className="chat-popup-assign-trigger"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setAssignMegaMenuPos({ top: rect.bottom + 6, left: rect.left });
                                    setAssignSelectedTeam(assignedTeam?.id || null);
                                    setAssignMegaMenuOpen(v => !v);
                                }}
                            >
                                <Users size={12} style={{ marginRight: 4 }} />
                                <span className="trigger-text">{pillLabel}</span>
                                <ChevronDown size={10} style={{ marginLeft: 4 }} />
                            </button>
                            
                            {assignMegaMenuOpen && (() => {
                                const menuTeam = assignSelectedTeam ? teams.find(t => t.id === assignSelectedTeam) : null;
                                const teamMembers = menuTeam?.members || [];
                                return ReactDOM.createPortal(
                                    <>
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 99998 }} onClick={() => setAssignMegaMenuOpen(false)} />
                                        <div ref={assignMenuDivRef} style={{
                                            position: 'fixed', top: assignMegaMenuPos.top, left: assignMegaMenuPos.left, zIndex: 99999,
                                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                            padding: 8, display: 'flex', flexDirection: 'row', gap: 4, minWidth: 340,
                                        }}>
                                            <div style={{ minWidth: 160, borderRight: '1px solid #f1f5f9', paddingRight: 8 }}>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>Takım</div>
                                                <button onClick={() => handleAssignConversation(null, null)}
                                                    style={{
                                                        display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                        fontSize: '0.72rem', fontWeight: 500, background: !assignSelectedTeam ? '#f0fdf4' : 'transparent', color: !assignSelectedTeam ? '#166534' : '#374151'
                                                    }}>
                                                    🚫 Atamasız
                                                </button>
                                                {teams.map(t => (
                                                    <button key={t.id} onClick={() => setAssignSelectedTeam(t.id)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                            fontSize: '0.72rem', fontWeight: 500, background: assignSelectedTeam === t.id ? '#eff6ff' : 'transparent', color: assignSelectedTeam === t.id ? '#1d4ed8' : '#374151'
                                                        }}>
                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#3b82f6', flexShrink: 0 }} />
                                                        {t.name}
                                                    </button>
                                                ))}
                                            </div>
                                            {assignSelectedTeam && (
                                                <div style={{ minWidth: 180 }}>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>Atama</div>
                                                    <button onClick={() => handleAssignConversation(assignSelectedTeam, null)}
                                                        style={{
                                                            display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                            fontSize: '0.72rem', fontWeight: 600, background: '#fef3c7', color: '#92400e', marginBottom: 4
                                                        }}>
                                                        Takıma At →
                                                    </button>
                                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', padding: '2px 6px 4px' }}>veya kişiye ata:</div>
                                                    {teamMembers.map(m => {
                                                        const uid = m.user?.id || m.id;
                                                        const uname = m.user?.name || m.name || '?';
                                                        return (
                                                            <button key={uid} onClick={() => handleAssignConversation(assignSelectedTeam, uid)}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                                    fontSize: '0.72rem', background: conversation.assignedToId === uid ? '#eff6ff' : 'transparent', color: conversation.assignedToId === uid ? '#1d4ed8' : '#374151'
                                                                }}>
                                                                <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                                                                    {uname[0].toUpperCase()}
                                                                </span>
                                                                {uname}
                                                                {conversation.assignedToId === uid && <span style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>✓</span>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </>, document.body
                                );
                            })()}
                        </div>
                        
                        {/* Üstlen butonu */}
                        {canClaim && (
                            <button className="chat-popup-claim-btn" onClick={handleClaimConversation} disabled={takingOver} title="Bu konuşmayı üstlen">
                                <UserCheck size={12} />
                                Üstlen
                            </button>
                        )}
                    </div>
                )}

                {/* Messages — with system events and activity cards */}
                {loading ? (
                    <div className="chat-popup-loading">
                        <Loader size={20} className="spin" />
                        <span>Mesajlar yükleniyor...</span>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="chat-popup-empty">
                        Henüz mesaj bulunmuyor.
                    </div>
                ) : (
                    <div className="chat-popup-messages">
                        {messages.map((msg, idx) => {
                            // ── System Event (inline log) — matching Inbox ──
                            if (msg.isSystemEvent) {
                                const evtTime = msg.createdAt ? formatTime(msg.createdAt) : '';
                                const actorName = (() => {
                                    if (msg.actorType === 'SYSTEM') return 'Sistem';
                                    if (msg.actorType === 'BOT') return 'Bot';
                                    if (msg.actorType === 'AUTOMATION') return 'Otomasyon';
                                    if (msg.actorId && members?.length) {
                                        const m = members.find(u => u.id === msg.actorId || u.userId === msg.actorId);
                                        if (m) return m.name || m.user?.name || 'Kullanıcı';
                                    }
                                    return msg.actorType === 'USER' ? 'Kullanıcı' : '';
                                })();
                                return (
                                    <div key={msg.id} className="chat-popup-system-event">
                                        <span className="chat-popup-event-content">
                                            {evtTime && <span className="chat-popup-event-time">{evtTime}</span>}
                                            <span dangerouslySetInnerHTML={{ __html: msg.title }} />
                                            {actorName && <span className="chat-popup-event-actor">— {actorName}</span>}
                                        </span>
                                    </div>
                                );
                            }

                            // ── Activity Card (inline) — matching Inbox ──
                            if (msg.isActivity) {
                                const cfg = actTypeConfig[msg.activityType] || actTypeConfig.NOTE;
                                const sc = actStatusConfig[msg.activityStatus] || actStatusConfig.PLANNED;
                                const actDate = msg.createdAt ? new Date(msg.createdAt) : null;
                                const displayText = msg.activityResult || msg.activityContent || msg.activityTitle || '';

                                return (
                                    <div key={msg.id} className="chat-popup-activity-row">
                                        <div className="chat-popup-activity-card" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                                            <div className="chat-popup-activity-header">
                                                <span style={{ fontSize: '1rem' }}>{cfg.icon}</span>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: cfg.accent }}>{cfg.label}</span>
                                                <span className="chat-popup-activity-status" style={{ background: sc.bg, color: sc.color }}>
                                                    {sc.emoji} {sc.label}
                                                </span>
                                                <span className="chat-popup-activity-date">
                                                    {actDate ? actDate.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </div>
                                            {msg.activityAssignedTo && (
                                                <div className="chat-popup-activity-assignee">
                                                    👤 {msg.activityAssignedTo} {msg.activityTeam ? `(${msg.activityTeam})` : ''}
                                                </div>
                                            )}
                                            {displayText && (
                                                <div className="chat-popup-activity-text">{displayText}</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }

                            // ── Regular Messages, Notes ──
                            const msgClass = msg.isInternalNote
                                ? 'note'
                                : msg.isFromContact
                                    ? 'incoming'
                                    : 'outgoing';

                            return (
                                <div key={msg.id || idx} className="chat-popup-msg-row">
                                    {shouldShowDate(msg, idx) && (
                                        <div className="chat-popup-date-sep">
                                            <span>{formatDateSep(msg.createdAt)}</span>
                                        </div>
                                    )}
                                    <div className={`chat-popup-msg ${msgClass}`}>
                                        <div className="chat-popup-msg-wrapper">
                                            <div className="chat-popup-msg-bubble">
                                                <p>{msg.content?.replace(/\[HANDOFF\]/gi, '').trim()}</p>
                                            </div>
                                            <div className="chat-popup-msg-meta">
                                                <span className="chat-popup-msg-time">
                                                    {formatTime(msg.createdAt)}
                                                </span>
                                                {/* Channel icon + Sender badge — matching Inbox */}
                                                {!msg.isFromContact && !msg.isInternalNote && (
                                                    <>
                                                        <span className="chat-popup-msg-channel-tag">
                                                            {getChannelIcon(channel)} {getChannelName(channel)}
                                                        </span>
                                                        <span className="chat-popup-msg-sender-tag">
                                                            {/* Inbox ile aynı: botun adı, yoksa genel etiket */}
                                                            {msg.senderId
                                                                ? `👤 ${msg.sender?.name || 'Agent'}`
                                                                : `🤖 ${conversation?.assignedBot?.name || 'AI Bot'}`}
                                                        </span>
                                                        <span className="chat-popup-msg-status">
                                                            {renderStatus(msg)}
                                                        </span>
                                                    </>
                                                )}
                                                {msg.isInternalNote && (
                                                    <div className="chat-popup-note-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <StickyNote size={10} />
                                                            Dahili Not ({msg.sender?.name || 'Gizli'})
                                                        </span>
                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                if (!confirm('Bu dahili notu silmek istediğinize emin misiniz?')) return;
                                                                try {
                                                                    await conversationAPI.deleteNote(currentWorkspace.id, conversationId, msg.id);
                                                                    setMessages(prev => prev.filter(m => m.id !== msg.id));
                                                                } catch (err) {
                                                                    console.error('Delete note error:', err);
                                                                    alert('Not silinemedi.');
                                                                }
                                                            }}
                                                            title="Notu Sil"
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: '#ef4444',
                                                                cursor: 'pointer',
                                                                padding: '2px 4px',
                                                                borderRadius: '4px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                opacity: 0.6,
                                                                transition: 'opacity 0.2s'
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                            onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* Input area — matching Inbox with toolbar */}
                {!loading && (
                    <div className="chat-popup-input-area">
                        <div className={`chat-popup-input-container ${isInternalNoteMode ? 'note-mode' : ''}`}>
                            {/* Note mode banner */}
                            {isInternalNoteMode && (
                                <div className="chat-popup-note-banner">
                                    <StickyNote size={12} />
                                    <span>Dahili Not — sadece ekip görebilir</span>
                                </div>
                            )}
                            <textarea
                                ref={textareaRef}
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={isInternalNoteMode ? '📝 Dahili not yazın...' : 'Yanıtınızı yazın...'}
                                rows={2}
                                style={isInternalNoteMode ? { background: '#fffbeb' } : {}}
                            />
                            {/* Toolbar — matching Inbox bottom bar */}
                            <div className="chat-popup-toolbar">
                                <div className="chat-popup-toolbar-left">
                                    {/* Channel indicator */}
                                    <span className="chat-popup-channel-pill">
                                        <span>{getChannelIcon(channel)}</span>
                                        <span>{getChannelName(channel)}</span>
                                    </span>

                                    {/* Internal note toggle */}
                                    <button
                                        type="button"
                                        onClick={() => setIsInternalNoteMode(!isInternalNoteMode)}
                                        title={isInternalNoteMode ? 'Not modundan çık' : 'Dahili not yaz'}
                                        className={`chat-popup-toolbar-btn ${isInternalNoteMode ? 'active-note' : ''}`}
                                    >
                                        <StickyNote size={14} />
                                        <span>Not</span>
                                    </button>

                                    {/* Bot toggle */}
                                    <button
                                        type="button"
                                        onClick={handleBotToggle}
                                        title={botEnabled ? 'Oto Pilot Aktif — kapat' : 'Oto Pilot Kapalı — aç'}
                                        className={`chat-popup-toolbar-btn ${botEnabled ? 'active-bot' : ''}`}
                                    >
                                        <Bot size={14} />
                                        {togglingBot && <Loader size={11} className="spin" />}
                                    </button>
                                </div>

                                <span className="chat-popup-toolbar-hint">Enter ile gönder</span>

                                <div className="chat-popup-toolbar-right">
                                    {/* Send */}
                                    <button
                                        className={`chat-popup-send-btn ${isInternalNoteMode ? 'note-send' : ''}`}
                                        onClick={handleSend}
                                        disabled={!newMessage.trim() || sending}
                                    >
                                        {sending ? <Loader size={16} className="spin" /> : (isInternalNoteMode ? <StickyNote size={16} /> : <Send size={16} />)}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatPopup;
