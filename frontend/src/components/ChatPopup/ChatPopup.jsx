import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { X, Loader, Send, ExternalLink, User, Check, CheckCheck, StickyNote, Users, ChevronDown, CheckCircle2, Circle, Trash2, UserCheck } from 'lucide-react';
import { conversationAPI, funnelAPI, workspaceAPI, teamAPI, contactAPI } from '../../services/api';
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

    // Load dependencies (teams, members, funnels)
    useEffect(() => {
        if (!currentWorkspace?.id) {
            console.warn('[ChatPopup] No currentWorkspace, skipping dependency load');
            return;
        }
        console.log('[ChatPopup] Loading dependencies for workspace:', currentWorkspace.id);
        const loadDependencies = async () => {
            try {
                const [funnelsRes, teamsRes, membersRes] = await Promise.all([
                    funnelAPI.getAll(currentWorkspace.id).catch(e => { console.error('[ChatPopup] funnelAPI error:', e); return { data: { funnels: [] } }; }),
                    teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(e => { console.error('[ChatPopup] teamAPI error:', e); return { data: { teams: [] } }; }),
                    workspaceAPI.getMembers(currentWorkspace.id).catch(e => { console.error('[ChatPopup] membersAPI error:', e); return { data: { members: [] } }; })
                ]);
                
                console.log('[ChatPopup] funnelsRes.data:', funnelsRes.data);
                console.log('[ChatPopup] teamsRes.data:', teamsRes.data);
                
                const rawFunnels = funnelsRes.data?.funnels || (Array.isArray(funnelsRes.data) ? funnelsRes.data : []);
                console.log('[ChatPopup] rawFunnels count:', rawFunnels.length, rawFunnels.map(f => f.name));
                
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
                console.log('[ChatPopup] Loaded: funnels=%d teams=%d members=%d', rawFunnels.length, rawTeams.length, rawMembers.length);
            } catch (err) {
                console.error("[ChatPopup] Error loading dependencies", err);
            }
        };
        loadDependencies();
    }, [currentWorkspace, conversationId]);

    // Load conversation data
    useEffect(() => {
        if (!conversationId || !currentWorkspace) return;

        const loadConversation = async () => {
            setLoading(true);
            try {
                const response = await conversationAPI.getById(currentWorkspace.id, conversationId);
                const conv = response.data.conversation || response.data;
                setConversation(conv);

                // Merge messages and internal notes
                const msgs = conv.messages || [];
                const notes = (conv.internalNotes || []).map(n => ({
                    ...n,
                    isInternalNote: true,
                    messageType: 'NOTE',
                    sender: n.user,
                    isFromContact: false
                }));
                const combined = [...msgs, ...notes].sort(
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
            const response = await conversationAPI.sendMessage(
                currentWorkspace.id,
                conversation.id,
                { content: newMessage }
            );
            setMessages(prev => [...prev, response.data.message]);
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
            const res = await conversationAPI.claim(currentWorkspace.id, conversation.id);
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

            // Fetch the updated conversation details to keep state in sync
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

    // Formatters
    const formatTime = (date) => new Date(date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
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

    const getSenderName = (msg) => {
        if (msg.isFromContact) return conversation?.contact?.name || 'Müşteri';
        return null;
    };

    const renderStatus = (msg) => {
        if (msg.isFromContact || msg.isInternalNote) return null;
        if (msg.status === 'READ') return <CheckCheck size={14} className="status-read" />;
        if (msg.status === 'DELIVERED') return <CheckCheck size={14} className="status-delivered" />;
        return <Check size={14} className="status-sent" />;
    };

    const contactName = conversation?.contact?.name || 'Bilinmeyen';
    const channelLabel = getChannelLabel(conversation);
    
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

    return (
        <div className="chat-popup-overlay" onClick={onClose}>
            <div className="chat-popup-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header Top Row */}
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
                            {!loading && (
                                <span className="chat-popup-channel-badge">
                                    {channelLabel}
                                    {messages.length > 0 && ` · ${messages.length} mesaj`}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="chat-popup-header-actions">
                        {/* Status Toggle & Delete */}
                        {!loading && conversation && (
                            <>
                                {conversation.assignedBotId && (
                                    <div className="chat-popup-bot-pill">
                                        <div className="bot-indicator active" />
                                        <span>{conversation.assignedBot?.name || 'AI Bot'}</span>
                                    </div>
                                )}
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

                {/* Messages */}
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
                            const msgClass = msg.isInternalNote
                                ? 'note'
                                : msg.isFromContact
                                    ? 'incoming'
                                    : 'outgoing';
                            const senderName = getSenderName(msg);
                            return (
                                <div key={msg.id || idx} className="chat-popup-msg-row">
                                    {shouldShowDate(msg, idx) && (
                                        <div className="chat-popup-date-sep">
                                            <span>{formatDateSep(msg.createdAt)}</span>
                                        </div>
                                    )}
                                    {senderName && (
                                        <div className={`chat-popup-msg-sender`}>
                                            {senderName}
                                        </div>
                                    )}
                                    <div className={`chat-popup-msg ${msgClass}`}>
                                        <div className="chat-popup-msg-wrapper">
                                            <div className="chat-popup-msg-bubble">
                                                <p>{msg.content}</p>
                                            </div>
                                            <div className="chat-popup-msg-meta">
                                                <span className="chat-popup-msg-time">
                                                    {formatTime(msg.createdAt)}
                                                </span>
                                                {msg.isInternalNote && (
                                                    <span className="chat-popup-note-footer">
                                                        <StickyNote size={10} />
                                                        {msg.sender?.name || 'Not'}
                                                    </span>
                                                )}
                                                {!msg.isFromContact && !msg.isInternalNote && (
                                                    <span className="chat-popup-msg-status">
                                                        {renderStatus(msg)}
                                                    </span>
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

                {/* Input area */}
                {!loading && (
                    <div className="chat-popup-input-area">
                        <div className="chat-popup-input-container">
                            <textarea
                                ref={textareaRef}
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Yanıtınızı yazın..."
                                rows={1}
                            />
                            <button
                                className="chat-popup-send-btn"
                                onClick={handleSend}
                                disabled={!newMessage.trim() || sending}
                            >
                                {sending ? <Loader size={16} className="spin" /> : <Send size={16} />}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatPopup;
