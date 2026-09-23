import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import { conversationAPI, workspaceAPI, aiAPI, teamAPI } from '../../services/api';
import { Send, User, UserPlus, Users, Bot, Trash2, SendHorizontal, MessageCircle, Facebook, Instagram, Mail, ArrowRight, ArrowLeftRight, StickyNote, ExternalLink, Check, CheckCheck, AlertCircle } from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import PendingTransfersModal from '../../components/PendingTransfers/PendingTransfersModal';
import './Conversations.css';

const Conversations = () => {
    const { t } = useTranslation();
    const { currentWorkspace, user, refreshWorkspace, setUnreadCount } = useAuth();
    const toast = useToast();
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [activeChannel, setActiveChannel] = useState(null); // null, 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM'
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [bots, setBots] = useState([]);
    const [selectedBotId, setSelectedBotId] = useState('');
    const [isInternalNoteMode, setIsInternalNoteMode] = useState(false);
    const [members, setMembers] = useState([]);
    const [activeTab, setActiveTab] = useState('ALL'); // 'MINE', 'PENDING', 'ALL'
    const [pendingTransfersCount, setPendingTransfersCount] = useState(0);
    const [isPendingTransfersModalOpen, setIsPendingTransfersModalOpen] = useState(false);
    const [teams, setTeams] = useState([]);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const messagesContainerRef = useRef(null);

    const checkPendingTransfers = async () => {
        try {
            const response = await conversationAPI.getPendingTransfers();
            setPendingTransfersCount(response.data.transfers.length);
        } catch (e) { console.error('Error checking pending transfers:', e); }
    };

    useEffect(() => {
        if (currentWorkspace) {
            checkPendingTransfers();
        }
    }, [currentWorkspace]);

    const scrollToBottom = () => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    };

    // Auto-scroll when messages change
    useEffect(() => {
        scrollToBottom();
    }, [messages, selectedConversation]);

    const workspaceMemberRole = currentWorkspace?.members?.find(m => m.userId === user?.id)?.role;
    const userRole = workspaceMemberRole || user?.role;
    const isOwner = ['OWNER', 'SUPER_ADMIN'].includes(userRole);

    useEffect(() => {
        if (refreshWorkspace) {
            refreshWorkspace();
        }
    }, []);



    // Listen for WebSocket events from AuthContext
    useEffect(() => {
        const handleNewMessage = (event) => {
            const data = event.detail;
            console.log('🔔 [Conversations] Received new message event:', data);

            // Check if message is for current workspace
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                console.log('🔄 [Conversations] Reloading conversations silently...');
                loadConversations(false); // Update list (sidebar) silently

                // If this is the active conversation, append the message and DON'T increment unread
                if (selectedConversation && data.conversationId === selectedConversation.id) {
                    console.log('💬 [Conversations] Appending message to active chat (no unread increment)');
                    setMessages(prev => {
                        if (prev.some(m => m.id === data.message.id)) return prev;
                        return [...prev, data.message];
                    });
                    // Since user is viewing this conversation, decrement the global count that was added
                    if (data.message?.isFromContact) {
                        setUnreadCount(prev => Math.max(0, prev - 1));
                    }
                } else {
                    // Message is for a different conversation - update local unread count for that conv
                    if (data.message?.isFromContact) {
                        setConversations(prev => prev.map(c =>
                            c.id === data.conversationId 
                                ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } 
                                : c
                        ));
                    }
                }
            }
        };

        window.addEventListener('websocket:new_message', handleNewMessage);
        return () => window.removeEventListener('websocket:new_message', handleNewMessage);
    }, [currentWorkspace, selectedConversation]);

    useEffect(() => {
        if (currentWorkspace) {
            loadConversations();
            loadBots();
            loadTeams();

            // Only load members list if we know we are owner/admin
            if (isOwner) {
                loadMembers();
            }
        }
    }, [currentWorkspace, activeChannel, activeTab, userRole, selectedTeamId]);

    const loadMembers = async () => {
        try {
            const response = await workspaceAPI.getMembers(currentWorkspace.id);
            setMembers(response.data.members);
        } catch (error) {
            console.error('Error loading members:', error);
        }
    };

    const loadTeams = async () => {
        try {
            const response = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
            setTeams(response.data.teams);
        } catch (error) {
            console.error('Error loading teams:', error);
        }
    };

    const loadBots = async () => {
        try {
            const response = await aiAPI.getBots(currentWorkspace.id);
            setBots(response.data.bots);
            if (response.data.bots.length > 0) {
                setSelectedBotId(response.data.bots[0].id);
            }
        } catch (error) {
            console.error('Error loading bots:', error);
        }
    };

    const loadConversations = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const params = {};
            if (activeChannel) params.channel = activeChannel;
            if (selectedTeamId) params.teamId = selectedTeamId;

            // Handle assignment tabs
            if (activeTab === 'MINE') {
                params.assignedToId = 'mine'; // Explicitly use 'mine' instead of user.id to match backend logic optimization
            } else if (activeTab === 'TEAMS') {
                params.assignedToId = 'my_teams';
            } else if (activeTab === 'PENDING') {
                params.assignedToId = 'unassigned';
            }

            const response = await conversationAPI.getAll(currentWorkspace.id, params);
            let convs = response.data.conversations;

            // Filter out EMAIL conversations - they have their own page now
            convs = convs.filter(conv => conv.channel !== 'EMAIL');

            // Client-side safety filter for AGENT role (Backend also enforces this)
            if (userRole === 'AGENT' && activeTab === 'ALL') {
                convs = convs.filter(conv =>
                    conv.assignedToId === user.id
                );
            }

            setConversations(convs);
        } catch (error) {
            console.error('Error loading conversations:', error);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const loadConversationDetails = async (conversationId) => {
        try {
            // Get current unread count for this conversation before clearing
            const currentConv = conversations.find(c => c.id === conversationId);
            const unreadForThisConv = currentConv?.unreadCount || 0;

            // Clear unreadCount in the local list
            setConversations(prev => prev.map(c =>
                c.id === conversationId ? { ...c, unreadCount: 0 } : c
            ));

            // Decrease global unread count by the amount we just read
            if (unreadForThisConv > 0) {
                setUnreadCount(prev => Math.max(0, prev - unreadForThisConv));
            }

            const response = await conversationAPI.getById(currentWorkspace.id, conversationId);
            setSelectedConversation(response.data.conversation);

            // Merge messages and internal notes
            const msgs = response.data.conversation.messages || [];
            const notes = response.data.conversation.internalNotes || [];

            const formattedNotes = notes.map(n => ({
                ...n,
                isInternalNote: true,
                messageType: 'NOTE',
                sender: n.user,
                isFromContact: false
            }));

            const combined = [...msgs, ...formattedNotes].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            setMessages(combined);
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    };

    const handleAssignUser = async (conversationId, userId) => {
        try {
            const response = await conversationAPI.assign(currentWorkspace.id, conversationId, { userId: userId || null });
            if (response.data?.warning) {
                if (toast?.showWarning) {
                    toast.showWarning('Mesai Dışı Atama', response.data.warning);
                } else {
                    console.warn('Mesai Dışı Atama:', response.data.warning);
                }
            }
            setConversations(prev => prev.map(conv =>
                conv.id === conversationId ? { ...conv, assignedToId: response.data.conversation.assignedToId, assignedTo: response.data.conversation.assignedTo } : conv
            ));
            if (selectedConversation?.id === conversationId) {
                setSelectedConversation(prev => ({ ...prev, assignedToId: response.data.conversation.assignedToId, assignedTo: response.data.conversation.assignedTo }));
            }
        } catch (error) {
            console.error('Assign user error:', error);
            const errorMsg = error.response?.data?.error ||
                error.response?.data?.errors?.[0]?.msg ||
                `ATAMA HATASI [VERSİYON: 19:35]`;
            alert(errorMsg);
        }
    };

    const handleAssignTeam = async (conversationId, teamId) => {
        try {
            const response = await conversationAPI.assign(currentWorkspace.id, conversationId, { teamId: teamId || null });
            setConversations(prev => prev.map(conv =>
                conv.id === conversationId ? { ...conv, teamIds: response.data.conversation.teamIds } : conv
            ));
            if (selectedConversation?.id === conversationId) {
                setSelectedConversation(prev => ({ ...prev, teamIds: response.data.conversation.teamIds }));
            }
        } catch (error) {
            console.error('Assign team error:', error);
            const errorMsg = error.response?.data?.error || 'ATAMA HATASI';
            alert(errorMsg);
        }
    };

    const handleAssignBot = async (conversationId, botId) => {
        try {
            const response = await conversationAPI.assign(currentWorkspace.id, conversationId, { botId: botId || null });

            // Re-fetch conversation to ensure we have the full relation or update state manually if response includes it
            // Response usually includes assignedBot if updated in controller

            setConversations(prev => prev.map(conv =>
                conv.id === conversationId ? {
                    ...conv,
                    assignedBotId: response.data.conversation.assignedBotId,
                    assignedBot: response.data.conversation.assignedBot,
                    assignedToId: null, // Clear human assignment UI
                    assignedTo: null
                } : conv
            ));

            if (selectedConversation?.id === conversationId) {
                setSelectedConversation(prev => ({
                    ...prev,
                    assignedBotId: response.data.conversation.assignedBotId,
                    assignedBot: response.data.conversation.assignedBot,
                    assignedToId: null,
                    assignedTo: null
                }));
            }
        } catch (error) {
            console.error('Assign bot error:', error);
            alert('Could not assign bot.');
        }
    };

    const handleDeleteConversation = async (conversationId) => {
        if (!confirm('Are you sure you want to permanently delete this conversation?')) return;

        try {
            await conversationAPI.delete(currentWorkspace.id, conversationId);
            if (selectedConversation?.id === conversationId) {
                setSelectedConversation(null);
                setMessages([]);
            }
            loadConversations();
        } catch (error) {
            console.error('Error deleting conversation:', error);
            alert('Error deleting conversation.');
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversation) return;

        try {
            if (isInternalNoteMode) {
                const response = await conversationAPI.addNote(
                    currentWorkspace.id,
                    selectedConversation.id,
                    { content: newMessage }
                );
                // Format note for display
                const newNote = {
                    ...response.data.note,
                    isInternalNote: true,
                    messageType: 'NOTE',
                    sender: user, // Current user
                    isFromContact: false
                };
                setMessages([...messages, newNote]);
            } else {
                const response = await conversationAPI.sendMessage(
                    currentWorkspace.id,
                    selectedConversation.id,
                    { content: newMessage }
                );
                setMessages([...messages, response.data.message]);
            }
            setNewMessage('');
            // Optional: Turn off note mode after sending? Maybe keep it on if they want to write another? 
            // Let's keep it as is (persist mode until toggled off).
        } catch (error) {
            console.error('Error sending message/note:', error);
            alert('Could not send message/note.');
        }
    };

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleAIAssist = async () => {
        if (!selectedConversation) return;
        try {
            // Optional: visual loading state for button could be added here
            const response = await aiAPI.generateResponse(currentWorkspace.id, {
                conversationId: selectedConversation.id,
                botId: selectedBotId
            });

            // Append suggestion to current input
            setNewMessage(prev => (prev ? prev + ' ' : '') + response.data.suggestion);
        } catch (error) {
            console.error('Error generating AI response:', error);
            const errMsg = error.response?.data?.details || error.response?.data?.error || 'AI yanıtı oluşturulamadı.';
            alert(errMsg);
        }
    };

    if (!currentWorkspace) {
        return (
            <div className="empty-state">
                <p>{t('common.selectWorkspace')}</p>
            </div>
        );
    }

    if (loading) {
        return <div className="loading">Loading...</div>;
    }

    return (
        <div className="conversations-page">
            <div className="conversations-list">
                <div className="conversations-header">
                    <div className="header-top">
                        <h2 style={{ margin: 0 }}>Mesajlar</h2>
                        <div className="channel-filters">
                            <button
                                className={`channel-filter-btn whatsapp ${activeChannel === 'WHATSAPP' ? 'active' : ''}`}
                                onClick={() => setActiveChannel(activeChannel === 'WHATSAPP' ? null : 'WHATSAPP')}
                                title="WhatsApp"
                            >
                                <MessageCircle size={18} />
                            </button>
                            <button
                                className={`channel-filter-btn facebook ${activeChannel === 'FACEBOOK' ? 'active' : ''}`}
                                onClick={() => setActiveChannel(activeChannel === 'FACEBOOK' ? null : 'FACEBOOK')}
                                title="Facebook"
                            >
                                <Facebook size={18} />
                            </button>
                            <button
                                className={`channel-filter-btn instagram ${activeChannel === 'INSTAGRAM' ? 'active' : ''}`}
                                onClick={() => setActiveChannel(activeChannel === 'INSTAGRAM' ? null : 'INSTAGRAM')}
                                title="Instagram"
                            >
                                <Instagram size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="search-row">
                        <div className="search-bar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <input type="text" placeholder="Ara..." className="conversations-search-input" />
                        </div>
                    </div>

                    <div className="conversations-tabs">
                        <button
                            className={`tab-btn ${activeTab === 'MINE' ? 'active' : ''}`}
                            onClick={() => setActiveTab('MINE')}
                        >
                            Bana Atanan
                        </button>
                        {isOwner && (
                            <button
                                className={`tab-btn ${activeTab === 'PENDING' ? 'active' : ''}`}
                                onClick={() => setActiveTab('PENDING')}
                            >
                                Bekleyen
                            </button>
                        )}
                        <button
                            className={`tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
                            onClick={() => setActiveTab('ALL')}
                        >
                            Tümü
                        </button>
                    </div>
                </div>

                <div className="conversations-items">
                    {conversations.length === 0 ? (
                        <div className="empty-state">
                            <p>{t('conversations.noConversations')}</p>
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <div
                                key={conv.id}
                                className={`conversation-item ${selectedConversation?.id === conv.id ? 'active' : ''}`}
                                onClick={() => loadConversationDetails(conv.id)}
                            >
                                <div className="conversation-content-wrapper">
                                    <div className="conversation-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                            <span className={`conversation-name ${selectedConversation?.id === conv.id ? 'active-text' : ''}`}>
                                                {conv.contact.name || 'Bilinmeyen'}
                                            </span>
                                            {(() => {
                                                try {
                                                    const tIds = conv.teamIds ? JSON.parse(conv.teamIds) : [];
                                                    if (tIds.length > 0) {
                                                        const team = teams.find(t => t.id === tIds[0]);
                                                        return team ? (
                                                            <span className="conv-team-badge" title={team.name} style={{ background: '#eff6ff', color: '#3b82f6', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                {team.name}
                                                            </span>
                                                        ) : null;
                                                    }
                                                } catch (e) { return null; }
                                                return null;
                                            })()}
                                        </div>
                                        <span className="conversation-time">
                                            {formatTime(conv.lastMessageAt)}
                                        </span>
                                    </div>

                                    <div className="conversation-preview">
                                        {conv.messages && conv.messages[0]?.content || 'Mesaj yok'}
                                    </div>

                                    <div className="conversation-footer">
                                        <div className="source-badge">
                                            {conv.instagramBusinessId ? (
                                                <>
                                                    <div className="social-icon instagram" style={{ color: '#E4405F' }}>
                                                        <Instagram size={12} />
                                                    </div>
                                                    <span>{conv.facebookPage?.instagramUsername || 'Instagram'}</span>
                                                </>
                                            ) : conv.whatsappPhoneNumber ? (
                                                <>
                                                    <div className="social-icon whatsapp" style={{ color: '#25D366' }}>
                                                        <MessageCircle size={12} />
                                                    </div>
                                                    <span>{conv.whatsappPhoneNumber.displayPhoneNumber}</span>
                                                </>
                                            ) : conv.channel === 'EMAIL' ? (
                                                <>
                                                    <div className="social-icon email" style={{ color: '#ef4444' }}>
                                                        <Mail size={12} />
                                                    </div>
                                                    <span>{conv.emailSubject || 'E-posta'}</span>
                                                </>
                                            ) : conv.channel === 'WIDGET' ? (
                                                <>
                                                    <div className="social-icon widget" style={{ color: '#8B5CF6' }}>
                                                        <MessageCircle size={12} />
                                                    </div>
                                                    <span>Web Widget</span>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="social-icon facebook" style={{ color: '#1877F2' }}>
                                                        <Facebook size={12} />
                                                    </div>
                                                    <span>Facebook</span>
                                                </>
                                            )}
                                        </div>

                                        <div className="status-indicators">
                                            {(conv.unreadCount || 0) > 0 && (
                                                <span className="unread-badge">
                                                    {conv.unreadCount}
                                                </span>
                                            )}
                                            {conv.assignedTo ? (
                                                <div className="assignee-badge" title={`Atanan: ${conv.assignedTo.name}`}>
                                                    {conv.assignedTo.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                                </div>
                                            ) : conv.assignedBot ? (
                                                <div className="assignee-badge" title={`Atanan Robot: ${conv.assignedBot.name}`} style={{ backgroundColor: '#f3e8ff', color: '#7e22ce', borderColor: '#d8b4fe' }}>
                                                    <Bot size={10} />
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="active-chat">
                {selectedConversation ? (
                    <>
                        <div className="conversation-detail-header">
                            <div className="contact-info">
                                <div className="contact-avatar">
                                    {selectedConversation.contact?.avatar ? (
                                        <img src={selectedConversation.contact.avatar} alt={selectedConversation.contact.name} />
                                    ) : (
                                        <User size={24} />
                                    )}
                                </div>
                                <div onClick={() => setIsProfileSidebarOpen(true)} style={{ cursor: 'pointer' }}>
                                    <h3>{selectedConversation.contact?.name || 'Bilinmeyen'}</h3>
                                    <div className="channel-info" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '13px' }}>
                                        {(selectedConversation.channel === 'FACEBOOK' || selectedConversation.facebookPageId && !selectedConversation.instagramBusinessId) && <Facebook size={12} style={{ color: '#1877F2' }} />}
                                        {(selectedConversation.channel === 'INSTAGRAM' || selectedConversation.instagramBusinessId) && <Instagram size={12} style={{ color: '#E4405F' }} />}
                                        {(selectedConversation.channel === 'WHATSAPP' || selectedConversation.whatsappPhoneNumberId) && <MessageCircle size={12} style={{ color: '#25D366' }} />}
                                        {(selectedConversation.channel === 'EMAIL' || selectedConversation.emailChannelId) && <Mail size={12} style={{ color: '#ef4444' }} />}
                                        <span>
                                            {selectedConversation.instagramBusinessId ? 'Instagram' :
                                                selectedConversation.whatsappPhoneNumberId ? 'WhatsApp' :
                                                    selectedConversation.emailChannelId ? 'E-posta' :
                                                        (selectedConversation.facebookPageId || selectedConversation.channel === 'FACEBOOK') ? 'Facebook' : 'Bilinmeyen'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="conv-header-actions">
                                {isOwner && (
                                    <>
                                        <div className="assign-selector-wrapper">
                                            <User size={14} className="assign-icon" />
                                            <select
                                                className="header-assign-select"
                                                value={selectedConversation.assignedToId || ''}
                                                onChange={(e) => handleAssignUser(selectedConversation.id, e.target.value)}
                                            >
                                                <option value="">Kişi...</option>
                                                {members.filter(m => m.role === 'AGENT').map(member => (
                                                    <option key={member.id} value={member.user.id}>{member.user.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="assign-selector-wrapper">
                                            <Users size={14} className="assign-icon" />
                                            <select
                                                className="header-assign-select"
                                                value={(() => {
                                                    try {
                                                        const tIds = selectedConversation.teamIds ? JSON.parse(selectedConversation.teamIds) : [];
                                                        return tIds.length > 0 ? tIds[0] : '';
                                                    } catch (e) { return ''; }
                                                })()}
                                                onChange={(e) => handleAssignTeam(selectedConversation.id, e.target.value)}
                                            >
                                                <option value="">Takım...</option>
                                                {teams.map(team => (
                                                    <option key={team.id} value={team.id}>{team.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="assign-selector-wrapper" style={{ backgroundColor: '#f3e8ff', borderColor: '#d8b4fe' }}>
                                            <Bot size={14} className="assign-icon" style={{ color: '#7e22ce' }} />
                                            <select
                                                className="header-assign-select"
                                                value={selectedConversation.assignedBotId || ''}
                                                onChange={(e) => handleAssignBot(selectedConversation.id, e.target.value)}
                                                style={{ color: '#6b21a8' }}
                                            >
                                                <option value="">Robota Ata...</option>
                                                {bots.filter(bot => bot.botType === 'CHATS').map(bot => (
                                                    <option key={bot.id} value={bot.id}>{bot.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}
                                <button className="btn-delete-conv" onClick={() => handleDeleteConversation(selectedConversation.id)}>
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="messages-container" ref={messagesContainerRef}>
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`message ${message.isInternalNote ? 'internal-note-message' : (message.isFromContact ? 'incoming' : 'outgoing')}`}
                                >
                                    <div className="message-content">
                                        <p>{message.content}</p>
                                        <div className="message-meta">
                                            <span className="message-time">{formatTime(message.createdAt)}</span>
                                            {!message.isFromContact && !message.isInternalNote && (
                                                <span className={`message-status ${message.status?.toLowerCase() || 'sent'}`}>
                                                    {message.status === 'READ' ? (
                                                        <CheckCheck size={14} className="status-read" title="Müşteri Tarafından Okundu" />
                                                    ) : message.status === 'DELIVERED' ? (
                                                        <CheckCheck size={14} className="status-delivered" title="Karşı Tarafa İletildi" />
                                                    ) : message.status === 'FAILED' ? (
                                                        <AlertCircle size={14} className="status-failed" title="Mesaj Gönderilemedi" />
                                                    ) : (
                                                        <Check size={14} className="status-sent" title="Mesaj Gönderildi" />
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                        {message.isInternalNote && (
                                            <div className="note-footer">
                                                <StickyNote size={10} />
                                                <span>Dahili Not ({message.sender?.name || 'Gizli'})</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <form onSubmit={handleSendMessage} className="message-input-wrapper">
                            <div className="message-input-container">
                                <textarea
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Yanıtınızı yazın..."
                                    className="message-textarea"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage(e);
                                        }
                                    }}
                                />
                                <div className="input-actions">
                                    <button
                                        type="button"
                                        className={`note-toggle-btn ${isInternalNoteMode ? 'active-note-mode' : ''}`}
                                        onClick={() => setIsInternalNoteMode(!isInternalNoteMode)}
                                        title="Dahili Not Modu (Müşteri Görmez)"
                                    >
                                        <StickyNote size={14} />
                                        Not Ekle
                                    </button>
                                    <button type="submit" className={`send-btn ${isInternalNoteMode ? 'note-send-btn' : ''}`} title="Gönder">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m22 2-7 20-4-9-9-4Z"/>
                                            <path d="M22 2 11 13"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="empty-state">
                        <p>{t('conversations.selectConversation')}</p>
                    </div>
                )}
            </div>

            {selectedConversation && (
                <ContactSidebar
                    conversationId={selectedConversation.id}
                    conversationData={selectedConversation}
                    isOpen={true}
                    members={members}
                    teams={teams}
                    onAssign={userId => handleAssignUser(selectedConversation.id, userId)}
                    onAssignTeam={handleAssignTeam}
                    onAssignUser={handleAssignUser}
                    onTakeOver={async (convId) => {
                        try {
                            await conversationAPI.takeOver(currentWorkspace.id, convId);
                            setConversations(prev => prev.map(conv =>
                                conv.id === convId ? { ...conv, assignedToId: user.id, assignedTo: { id: user.id, name: user.name } } : conv
                            ));
                            if (selectedConversation?.id === convId) {
                                setSelectedConversation(prev => ({ ...prev, assignedToId: user.id, assignedTo: { id: user.id, name: user.name } }));
                            }
                        } catch (err) {
                            console.error(err);
                            alert('Konuşma üstlenilemedi.');
                        }
                    }}
                    currentUserId={user?.id}
                    isOwner={isOwner}
                />
            )}

            <PendingTransfersModal
                isOpen={isPendingTransfersModalOpen}
                onClose={() => setIsPendingTransfersModalOpen(false)}
                onTransferProcessed={() => {
                    checkPendingTransfers();
                    loadConversations();
                }}
            />
        </div>
    );
};

export default Conversations;
