import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { conversationAPI, facebookAPI, emailAPI, leadsAPI, workspaceAPI, aiAPI, teamAPI, automationAPI, dealAPI, appointmentAPI, contactAPI } from '../../services/api';
import { io } from 'socket.io-client';
import DOMPurify from 'dompurify';
import {
    MessageSquare, MessageCircle, Facebook, Instagram, Mail, UserCheck,
    Search, User, Users, Bot, Trash2, Send, StickyNote, RefreshCw,
    Check, CheckCheck, Phone, Calendar, Tag, FileText, TrendingUp,
    Clock, Star, Plus, X, ExternalLink, ChevronDown, Filter,
    Inbox as InboxIcon, Image as ImageIcon, AlertCircle, Sparkles, Loader, Zap, Globe,
    UserRoundPlus, CheckCircle2, Bell
} from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import notificationService from '../../services/notificationService';
import { useToast } from '../../components/Toast/Toast';
import './Inbox.css';

// Inbox item types
const INBOX_TYPES = {
    MESSAGE: 'message',
    COMMENT: 'comment',
    EMAIL: 'email'
};

// Helper to check if content is HTML
const isHtmlContent = (content) => {
    if (!content) return false;
    return /<[a-z][\s\S]*>/i.test(content);
};

// Sanitize and prepare HTML content for safe rendering
const sanitizeHtml = (html) => {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'blockquote', 'pre', 'code', 'hr'],
        ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'style', 'class', 'width', 'height'],
        ADD_ATTR: ['target'], // All links open in new tab
        ALLOW_DATA_ATTR: false
    });
};

// Helper function to check if message is from FORM channel
const isFormMessage = (msg, channel) => {
    return channel === 'FORM' && msg.isFromContact && msg.content?.includes('📋');
};

// Helper function to render form message as table
const renderFormMessage = (content) => {
    const lines = content.split('\n').filter(line => line.trim());
    const formName = lines[0]?.replace('📋', '').replace(/\*\*/g, '').trim();
    const dataLines = lines.slice(1).filter(line => line.includes('|'));

    return (
        <div className="form-message-table">
            <div className="form-message-header">📋 {formName}</div>
            <table className="form-data-table">
                <tbody>
                    {dataLines.map((line, idx) => {
                        const parts = line.split('|').map(s => s.trim());
                        const label = parts[0] || '';
                        const value = parts[1] || '';
                        return (
                            <tr key={idx}>
                                <td className="form-label">{label}</td>
                                <td className="form-value">{value}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// Lead status options
const LEAD_STATUS_OPTIONS = [
    { value: 'NEW', label: 'Yeni', color: '#6b7280', bg: '#f3f4f6' },
    { value: 'CONTACTED', label: 'İletişime Geçildi', color: '#3b82f6', bg: '#eff6ff' },
    { value: 'QUALIFIED', label: 'Nitelikli', color: '#8b5cf6', bg: '#f5f3ff' },
    { value: 'CONVERTED', label: 'Dönüştürüldü', color: '#10b981', bg: '#ecfdf5' },
    { value: 'LOST', label: 'Kaybedildi', color: '#ef4444', bg: '#fef2f2' }
];

// Conversation status options
const CONVERSATION_STATUS_OPTIONS = [
    { value: 'OPEN', label: 'Açık', color: '#3b82f6', bg: '#eff6ff', icon: '🔵' },
    { value: 'PENDING', label: 'Beklemede', color: '#f59e0b', bg: '#fffbeb', icon: '🟡' },
    { value: 'RESOLVED', label: 'Çözüldü', color: '#10b981', bg: '#ecfdf5', icon: '✅' }
];

// Customer status options
const CUSTOMER_STATUS_OPTIONS = [
    { value: 'NEW_APPLICATION', label: 'Yeni Başvuru', color: '#3b82f6' },
    { value: 'HOT_OPPORTUNITY', label: 'Sıcak Fırsat', color: '#f59e0b' },
    { value: 'COMPLAINT', label: 'Şikayet', color: '#ef4444' },
    { value: 'INFO_PROVIDED', label: 'Bilgi Verildi', color: '#10b981' },
    { value: 'APPOINTMENT_SCHEDULED', label: 'Randevu Planlandı', color: '#8b5cf6' },
    { value: 'SALE_COMPLETED', label: 'Satış Gerçekleşti', color: '#059669' },
    { value: 'UNREACHABLE', label: 'Ulaşılamadı', color: '#64748b' },
    { value: 'SPAM', label: 'Spam', color: '#6b7280' },
    { value: 'LOST', label: 'Kaybedildi', color: '#1f2937' }
];

// Customer category options (synced with Customers page)
const CATEGORY_OPTIONS = [
    { value: 'NEW', label: 'Yeni', color: '#3b82f6' },
    { value: 'CUSTOMER', label: 'Müşteriler', color: '#10b981' },
    { value: 'OPPORTUNITY', label: 'Fırsatlar', color: '#f59e0b' },
    { value: 'VIP', label: 'VIP', color: '#8b5cf6' },
    { value: 'PARTNER', label: 'İş Ortakları', color: '#3b82f6' },
    { value: 'SPAM', label: 'Spam', color: '#ef4444' },
    { value: 'BLACKLIST', label: 'Kara Liste', color: '#1f2937' }
];

const getCategoryInfo = (category) => {
    return CATEGORY_OPTIONS.find(c => c.value === category) || CATEGORY_OPTIONS[0];
};

const getStatusInfo = (status) => {
    return LEAD_STATUS_OPTIONS.find(s => s.value === status) || LEAD_STATUS_OPTIONS[0];
};

const getConversationStatusInfo = (status) => {
    return CONVERSATION_STATUS_OPTIONS.find(s => s.value === status) || CONVERSATION_STATUS_OPTIONS[0];
};

const Inbox = () => {
    const { currentWorkspace, user, setUnreadCount } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const { showAssignment } = useToast();

    // Filter states - All channels selected by default (uncheck to hide)
    const allFilters = ['whatsapp', 'facebook', 'instagram', 'widget', 'emails', 'leads', 'notes', 'fb_comments', 'ig_comments'];
    const [activeFilters, setActiveFilters] = useState(allFilters); // All filters active by default
    const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
    const [activeChannel, setActiveChannel] = useState(null); // null, 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM'
    const [searchTerm, setSearchTerm] = useState('');
    const [assignmentTab, setAssignmentTab] = useState('ALL'); // 'MINE', 'PENDING', 'ALL'
    const [showResolved, setShowResolved] = useState(false); // Hide resolved conversations by default
    const [statusFilter, setStatusFilter] = useState(null); // null = All, 'POTENTIAL' = Only potential customers
    const [appointments, setAppointments] = useState([]); // For reminder indicators
    const filterDropdownRef = useRef(null);

    const filterLabels = {
        whatsapp: 'WhatsApp',
        facebook: 'Facebook',
        instagram: 'Instagram',
        widget: 'Web Formları',
        fb_comments: 'FB Yorumları',
        ig_comments: 'IG Yorumları',
        emails: 'E-postalar',
        leads: 'Leads'
    };

    // Toggle filter function
    const toggleFilter = (filter) => {
        setActiveFilters(prev => {
            if (prev.includes(filter)) {
                return prev.filter(f => f !== filter);
            } else {
                return [...prev, filter];
            }
        });
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
                setFilterDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Data states
    const [inboxItems, setInboxItems] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedItemType, setSelectedItemType] = useState(null);
    const [loading, setLoading] = useState(true);
    const [markingAllRead, setMarkingAllRead] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    // Message conversation states
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isInternalNoteMode, setIsInternalNoteMode] = useState(false);

    // AI Suggestion states
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);


    // Comment states
    const [comments, setComments] = useState([]);
    const [posts, setPosts] = useState([]);
    const [selectedPost, setSelectedPost] = useState(null);
    const [replyText, setReplyText] = useState('');

    // Email reply states
    const [emailReplyMode, setEmailReplyMode] = useState('reply'); // 'reply' or 'note'
    const [emailCc, setEmailCc] = useState('');
    const [emailBcc, setEmailBcc] = useState('');
    const [showBcc, setShowBcc] = useState(false);

    // Shared states
    const [members, setMembers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [bots, setBots] = useState([]);
    const [pages, setPages] = useState([]);

    // Bot toggle state for current conversation
    const [botEnabled, setBotEnabled] = useState(true);
    const [togglingBot, setTogglingBot] = useState(false);

    // Take over state
    const [takingOver, setTakingOver] = useState(false);

    // WhatsApp Template states
    const [templates, setTemplates] = useState([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [templateVariables, setTemplateVariables] = useState([]);
    const [sendingTemplate, setSendingTemplate] = useState(false);
    const [headerMediaUrl, setHeaderMediaUrl] = useState('');

    // New Conversation Modal states
    const [showNewConversationModal, setShowNewConversationModal] = useState(false);
    const [newConversationPhone, setNewConversationPhone] = useState('');
    const [newConversationName, setNewConversationName] = useState('');
    const [newConversationMessage, setNewConversationMessage] = useState('');
    const [creatingConversation, setCreatingConversation] = useState(false);

    const messagesContainerRef = useRef(null);
    const socketRef = useRef(null);

    // Get workspace member role - check both members array and global user role
    const workspaceMemberRole = currentWorkspace?.members?.[0]?.role;
    const globalUserRole = user?.role;
    // Use workspace role first, fallback to global role (for SUPER_ADMIN who might not be in members)
    const isOwner = ['OWNER', 'SUPER_ADMIN'].includes(workspaceMemberRole) || globalUserRole === 'SUPER_ADMIN';

    // Scroll to bottom for messages
    const scrollToBottom = () => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Load support data first (pages needed for comments)
    useEffect(() => {
        if (currentWorkspace) {
            loadSupportData();
        }
    }, [currentWorkspace]);

    // Load inbox items after pages are loaded
    useEffect(() => {
        if (currentWorkspace) {
            loadInboxItems();
        }
    }, [currentWorkspace, activeFilters, activeChannel, assignmentTab, pages, showResolved, searchTerm, statusFilter]);

    // Listen for new conversation created event
    useEffect(() => {
        const handleNewConversation = () => {
            loadInboxItems();
        };

        window.addEventListener('newConversationCreated', handleNewConversation);
        return () => window.removeEventListener('newConversationCreated', handleNewConversation);
    }, [currentWorkspace]);

    // Handle conversationId from URL query params
    useEffect(() => {
        const conversationId = searchParams.get('conversationId');
        const contactId = searchParams.get('contactId');

        if (conversationId && inboxItems.length > 0) {
            // Find the conversation in inbox items
            const targetItem = inboxItems.find(item => item.id === conversationId);
            if (targetItem) {
                handleSelectItem(targetItem);
                // Clear the query param (replace current entry so back button goes to previous page)
                setSearchParams({}, { replace: true });
            }
        } else if (contactId && inboxItems.length > 0) {
            // Find the first conversation for this contact
            const targetItem = inboxItems.find(item => item.contactId === contactId || item.contact?.id === contactId);
            if (targetItem) {
                handleSelectItem(targetItem);
                setSearchParams({}, { replace: true });
            }
        }
    }, [inboxItems, searchParams]);


    // Load appointments for reminder indicators
    useEffect(() => {
        const loadAppointments = async () => {
            if (!currentWorkspace) return;
            try {
                const now = new Date();
                const pastDate = new Date();
                pastDate.setDate(pastDate.getDate() - 30); // Include past 30 days for overdue reminders
                const futureDate = new Date();
                futureDate.setMonth(futureDate.getMonth() + 3);

                const response = await appointmentAPI.getAll(currentWorkspace.id, {
                    startDate: pastDate.toISOString(), // Include past appointments
                    endDate: futureDate.toISOString()
                });
                // Filter out completed appointments
                const activeAppointments = (response.data.appointments || []).filter(apt => apt.status !== 'COMPLETED');
                setAppointments(activeAppointments);
            } catch (err) {
                console.error('Load appointments error:', err);
            }
        };
        loadAppointments();
    }, [currentWorkspace]);

    // WebSocket for real-time updates
    useEffect(() => {
        if (!currentWorkspace) return;

        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5008';
        const socketUrl = API_URL.replace('/api', '');

        const socket = io(socketUrl, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Inbox WebSocket connected, workspace:', currentWorkspace?.id);
            // Join workspace room to receive workspace-specific events
            if (currentWorkspace?.id) {
                socket.emit('join_workspace', currentWorkspace.id);
                console.log('🚪 Inbox joined workspace room:', currentWorkspace.id);
            }
            // Join user room for personal notifications
            if (user?.id) {
                socket.emit('join_user', user.id);
                console.log('👤 Inbox joined user room:', user.id);
            }
        });

        // Listen for new conversations (e.g., from Widget)
        socket.on('new_conversation', (data) => {
            console.log('📥 new_conversation event received:', data);
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                console.log('✅ new_conversation - reloading inbox items');
                loadInboxItems(false);
            }
        });

        socket.on('new_message', (data) => {
            console.log('📥 new_message event received:', data);
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                console.log('✅ new_message - workspace match, reloading');
                loadInboxItems(false);

                // Add message to chat if conversation is open
                // For incoming messages (from contact) and bot messages (auto-reply)
                if (selectedItem?.id === data.conversationId && selectedItemType === INBOX_TYPES.MESSAGE) {
                    // Add message if it's from contact OR if it's a bot message (senderId is null/undefined)
                    if (data.message?.isFromContact || !data.message?.senderId) {
                        setMessages(prev => {
                            if (prev.some(m => m.id === data.message.id)) return prev;
                            return [...prev, data.message];
                        });

                        // Only decrement unread for incoming messages
                        if (data.message?.isFromContact) {
                            setUnreadCount(prev => Math.max(0, prev - 1));
                        }
                    }
                }

                // Show browser notification for incoming messages (from contact)
                if (data.message?.isFromContact && document.hidden) {
                    notificationService.showNewMessageNotification(
                        data.message,
                        { id: data.conversationId, channel: data.channel },
                        data.contact || { name: 'Yeni Mesaj' }
                    );
                }
            } else {
                console.log('⚠️ new_message - workspace mismatch:', data.workspaceId, 'vs', currentWorkspace?.id);
            }
        });

        socket.on('new_comment', (data) => {
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                loadInboxItems(false);

                // Show browser notification for new comments
                if (document.hidden) {
                    notificationService.showNotification('💬 Yeni Yorum', {
                        body: data.comment?.message?.substring(0, 100) || 'Yeni bir yorum geldi',
                        tag: `comment-${data.comment?.id}`,
                        data: { url: '/inbox' }
                    });
                }
            }
        });

        socket.on('new_lead', (data) => {
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                loadInboxItems(false);

                // Show browser notification for new leads
                if (document.hidden) {
                    notificationService.showNotification('🎯 Yeni Lead', {
                        body: data.lead?.name || 'Yeni bir potansiyel müşteri',
                        tag: `lead-${data.lead?.id}`,
                        data: { url: '/inbox' }
                    });
                }
            }
        });

        socket.on('new_email', (data) => {
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                loadInboxItems(false);

                // Show browser notification for new emails
                if (document.hidden) {
                    notificationService.showNotification('📧 Yeni E-posta', {
                        body: data.email?.subject || 'Yeni bir e-posta geldi',
                        tag: `email-${data.email?.id}`,
                        data: { url: '/inbox' }
                    });
                }
            }
        });

        // Listen for message status updates (delivered, read)
        socket.on('message_status', (data) => {
            console.log('📊 Message status update:', data);
            const { messageId, dbMessageId, conversationId, status } = data;

            // Only update if this is for the currently selected conversation
            if (selectedItem?.id === conversationId) {
                setMessages(prev => prev.map(msg => {
                    // Match by database ID, WhatsApp message ID, or Facebook message ID
                    if (msg.id === dbMessageId ||
                        msg.whatsappMessageId === messageId ||
                        msg.facebookMessageId === messageId) {
                        console.log(`✅ Updating message ${msg.id} status to ${status}`);
                        return { ...msg, status };
                    }
                    return msg;
                }));
            }
        });

        // Listen for conversation takeover events
        socket.on('conversation_taken_over', (data) => {
            console.log('👤 Conversation taken over:', data);
            const { conversationId, assignedToId, assignedToName, botEnabled } = data;

            // Bu konuşma artık başka birine atandı - listeden çıkar veya güncelle
            setInboxItems(prev => prev.map(item =>
                item.id === conversationId
                    ? {
                        ...item,
                        assignedToId,
                        assignedTo: { id: assignedToId, name: assignedToName },
                        botEnabled
                    }
                    : item
            ));

            // Eğer şu an bu konuşma seçiliyse ve başka biri üstlendiyse
            if (selectedItem?.id === conversationId && assignedToId !== user?.id) {
                setBotEnabled(botEnabled);
                setSelectedItem(prev => ({
                    ...prev,
                    assignedToId,
                    assignedTo: { id: assignedToId, name: assignedToName },
                    botEnabled
                }));
            }
        });

        // Listen for channel routing applied
        socket.on('conversation_routing_applied', (data) => {
            console.log('📡 Routing applied:', data);
            // Ekip ataması yapıldığında inbox'ı yenile
            loadInboxItems(false);
        });

        // Listen for new conversation assigned to team
        socket.on('new_conversation_assigned', (data) => {
            console.log('📥 New conversation assigned:', data);
            // Eğer bu kullanıcı atanan ekipte ise, inbox'ı yenile
            loadInboxItems(false);
        });

        // Listen for conversation assigned to current user - show notification
        socket.on('conversation_assigned_to_you', (data) => {
            console.log('📬 Conversation assigned to you:', data);
            const { conversationId, contact, assignedBy, message } = data;

            // Inbox'ı yenile
            loadInboxItems(false);

            // Sağ alt köşede popup toast göster
            showAssignment(
                '📋 Yeni Atama',
                message || `${assignedBy} size bir konuşma atadı`,
                {
                    onClick: () => {
                        // Konuşmaya git
                        setSearchParams({ conversationId });
                    }
                }
            );

            // Browser notification da göster (sekme arka plandaysa)
            notificationService.showNotification('📋 Yeni Konuşma Atandı', {
                body: message || `${assignedBy} size bir konuşma atadı`,
                tag: `assign-${conversationId}`,
                data: { url: `/inbox?conversationId=${conversationId}` }
            });
        });

        // Listen for general conversation assignment updates
        socket.on('conversation_assigned', (data) => {
            console.log('📋 Conversation assigned:', data);
            const { conversationId, assignedToId, assignedToName, botEnabled, teamIds } = data;

            // Takım veya agent değiştiğinde listeyi tamamen yenile
            // Çünkü yeni atanan takım/agent bu konuşmayı görmeli
            loadInboxItems(false);

            // Seçili konuşmayı güncelle
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    assignedToId,
                    teamIds: teamIds || prev.teamIds,
                    assignedTo: assignedToId ? { id: assignedToId, name: assignedToName } : null,
                    botEnabled
                }));
                setBotEnabled(botEnabled);
            }
        });

        // Listen for bot handoff - when bot can't answer and escalates to team
        socket.on('bot_handoff', (data) => {
            console.log('🔄 Bot handoff received:', data);
            const { conversationId, botName } = data;

            // Refresh inbox to show updated conversation
            loadInboxItems(false);

            // Update selected conversation if it's the one being handed off
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    botEnabled: false
                }));
                setBotEnabled(false);
            }

            // Show notification (browser notification if permitted)
            if (Notification.permission === 'granted') {
                new Notification('Bot Yönlendirmesi', {
                    body: `${botName} müşteriye yardımcı olamadı. Sohbet takıma aktarıldı.`,
                    icon: '/favicon.ico'
                });
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [currentWorkspace, selectedItem, selectedItemType, user]);

    const loadSupportData = async () => {
        try {
            const [membersRes, teamsRes, botsRes, pagesRes, templatesRes] = await Promise.all([
                // Tüm kullanıcılar üye listesini görebilmeli (üstlenen kişi başka birine atayabilmek için)
                workspaceAPI.getMembers(currentWorkspace.id).catch(() => ({ data: { members: [] } })),
                teamAPI.getWorkspaceTeams(currentWorkspace.id),
                aiAPI.getBots(currentWorkspace.id),
                facebookAPI.getPages(currentWorkspace.id),
                automationAPI.getTemplates(currentWorkspace.id).catch(() => ({ data: { templates: [] } }))
            ]);

            setMembers(membersRes.data.members || []);
            setTeams(teamsRes.data.teams || []);
            setBots(botsRes.data.bots || []);
            setPages(pagesRes.data.pages || []);
            setTemplates(templatesRes.data.templates || []);
        } catch (error) {
            console.error('Error loading support data:', error);
        }
    };

    // Load more conversations
    const loadMoreItems = async () => {
        if (!hasMore || loadingMore) return;

        try {
            setLoadingMore(true);
            const params = { limit: 100, page: currentPage + 1 };
            if (assignmentTab === 'MINE') params.assignedToId = 'mine';
            else if (assignmentTab === 'PENDING') params.assignedToId = 'unassigned';

            const response = await conversationAPI.getAll(currentWorkspace.id, params);
            const moreConversations = response.data.conversations || [];
            const pagination = response.data.pagination;

            // Add new conversations to existing items
            const newItems = moreConversations.map(conv => ({
                ...conv,
                inboxType: conv.channel === 'EMAIL' ? INBOX_TYPES.EMAIL : INBOX_TYPES.MESSAGE,
                sortDate: new Date(conv.lastMessageAt || conv.createdAt)
            }));

            setInboxItems(prev => [...prev, ...newItems]);

            if (pagination) {
                setHasMore(pagination.page < pagination.totalPages);
                setCurrentPage(pagination.page);
            }
        } catch (error) {
            console.error('Error loading more items:', error);
        } finally {
            setLoadingMore(false);
        }
    };

    // Mark all conversations as read
    const handleMarkAllAsRead = async () => {
        if (!currentWorkspace?.id) return;

        try {
            setMarkingAllRead(true);
            const response = await conversationAPI.markAllAsRead(currentWorkspace.id);

            // Update local state - set all unread counts to 0
            setInboxItems(prevItems =>
                prevItems.map(item => ({
                    ...item,
                    unreadCount: 0
                }))
            );

            // Update global unread count
            if (setUnreadCount) {
                setUnreadCount(0);
            }

            console.log(`✅ ${response.data.markedCount} sohbet okundu olarak işaretlendi`);
        } catch (error) {
            console.error('Error marking all as read:', error);
            alert('Tümünü okundu yapma başarısız oldu.');
        } finally {
            setMarkingAllRead(false);
        }
    };

    // Delete ALL conversations with confirmation
    const handleDeleteAllConversations = async () => {
        if (!currentWorkspace?.id) return;

        const confirmMessage = `DİKKAT: Bu işlem TÜM sohbetleri silecek!\n\nSilmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`;
        if (!confirm(confirmMessage)) return;

        const doubleConfirm = prompt('Silmek için "SİL" yazın:');
        if (doubleConfirm !== 'SİL') {
            alert('İşlem iptal edildi.');
            return;
        }

        try {
            setLoading(true);
            const response = await conversationAPI.deleteAll(currentWorkspace.id);

            // Clear all inbox items
            setInboxItems([]);
            setSelectedItem(null);
            setMessages([]);

            alert(response.data.message);
            console.log(`✅ ${response.data.deletedCount} sohbet silindi`);
        } catch (error) {
            console.error('Error deleting all conversations:', error);
            alert(error.response?.data?.error || 'Sohbetler silinirken hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const loadInboxItems = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);

            let items = [];

            // Load based on active filters (if all are selected = show all, unchecked = hide)
            const channelFilters = ['whatsapp', 'facebook', 'instagram', 'widget', 'emails', 'leads', 'notes'];
            const commentFilters = ['fb_comments', 'ig_comments'];

            // loadAll only when ALL filters are active (nothing hidden)
            const loadAll = activeFilters.length === allFilters.length;

            // Check which channel filters are still active
            const hasChannelFilter = channelFilters.some(f => activeFilters.includes(f));

            // Check which comment filters are still active
            const hasCommentFilter = commentFilters.some(f => activeFilters.includes(f));

            // Determine what to load:
            // - If no filter selected (loadAll): load everything
            // - If channel filter selected: load only those channels, NOT comments (unless comment filter also selected)
            // - If comment filter selected: load only those comments, NOT channels (unless channel filter also selected)

            // Comments should only load if:
            // 1. No filters at all (loadAll) OR
            // 2. Specifically the comment filter is selected
            // NOT when only channel filters (whatsapp, facebook, instagram, emails, leads) are selected
            const loadFbComments = loadAll || activeFilters.includes('fb_comments');
            const loadIgComments = loadAll || activeFilters.includes('ig_comments');

            // But if a channel filter is selected WITHOUT comment filters, don't load comments
            // Also, if activeChannel is set (top buttons), don't load comments unless explicitly filtered
            const shouldLoadFbComments = loadFbComments && (!hasChannelFilter || activeFilters.includes('fb_comments')) && !activeChannel;
            const shouldLoadIgComments = loadIgComments && (!hasChannelFilter || activeFilters.includes('ig_comments')) && !activeChannel;

            const loadConversations = loadAll || hasChannelFilter || activeChannel;

            // Load all conversations in one API call to avoid duplicates
            if (loadConversations) {
                const params = { limit: 100, page: 1 }; // Load more conversations
                if (assignmentTab === 'MINE') params.assignedToId = 'mine';
                else if (assignmentTab === 'PENDING') params.assignedToId = 'unassigned';

                const response = await conversationAPI.getAll(currentWorkspace.id, params);
                const allConversations = response.data.conversations || [];
                const pagination = response.data.pagination;

                // Check if there are more pages
                if (pagination) {
                    setHasMore(pagination.page < pagination.totalPages);
                    setCurrentPage(pagination.page);
                }

                // Filter conversations based on channel and resolved status
                allConversations.forEach(conv => {
                    // Check if resolved filter applies
                    if (!showResolved && conv.status === 'RESOLVED') {
                        return; // Skip resolved conversations if showResolved is false
                    }

                    // Check activeChannel filter (top buttons: Tümü, WhatsApp, Facebook, Instagram)
                    if (activeChannel && conv.channel !== activeChannel) {
                        return; // Skip if channel doesn't match the active channel button
                    }

                    // Check dropdown channel filter
                    // If no channel filter is selected (loadAll), show all conversation channels
                    // If specific channel filters are selected, only show matching channels
                    let channelMatch = false;

                    if (!hasChannelFilter) {
                        // No channel filter active - show all conversations
                        channelMatch = true;
                    } else {
                        // Specific channel filter(s) active - check if conversation matches
                        channelMatch =
                            (activeFilters.includes('whatsapp') && conv.channel === 'WHATSAPP') ||
                            (activeFilters.includes('facebook') && conv.channel === 'FACEBOOK') ||
                            (activeFilters.includes('instagram') && conv.channel === 'INSTAGRAM') ||
                            (activeFilters.includes('widget') && (conv.channel === 'WIDGET' || conv.channel === 'FORM')) ||
                            (activeFilters.includes('emails') && conv.channel === 'EMAIL') ||
                            (activeFilters.includes('leads') && conv.channel === 'LEAD') ||
                            (activeFilters.includes('notes') && conv.channel === 'INTERNAL') ||
                            conv.channel === 'MANUAL'; // Manual conversations always visible
                    }

                    if (channelMatch) {
                        // Check contact status filter
                        if (statusFilter && conv.contact?.status !== statusFilter) {
                            return; // Skip if status doesn't match
                        }

                        items.push({
                            ...conv,
                            inboxType: conv.channel === 'EMAIL' ? INBOX_TYPES.EMAIL : INBOX_TYPES.MESSAGE,
                            sortDate: new Date(conv.lastMessageAt || conv.createdAt)
                        });
                    }
                });
            }

            // Skip comments when status filter is active (comments don't have contact status)
            if (shouldLoadFbComments && !statusFilter) {
                // For Facebook comments, we load posts which contain comments
                if (pages.length > 0) {
                    const postsPromises = pages.map(page =>
                        facebookAPI.getPosts(page.pageId).catch(() => ({ data: { posts: [] } }))
                    );
                    const postsResponses = await Promise.all(postsPromises);
                    const allPosts = postsResponses.flatMap((res, idx) =>
                        (res.data.posts || []).map(post => ({
                            ...post,
                            pageId: pages[idx].pageId,
                            pageName: pages[idx].pageName,
                            inboxType: INBOX_TYPES.COMMENT,
                            platform: 'FACEBOOK',
                            sortDate: new Date(post.created_time)
                        }))
                    );
                    items = [...items, ...allPosts];
                }
            }

            if (shouldLoadIgComments && !statusFilter) {
                // For Instagram comments, we load Instagram posts which contain comments
                if (pages.length > 0) {
                    const instagramPages = pages.filter(p => p.instagramBusinessId);
                    const igPostsPromises = instagramPages.map(page =>
                        facebookAPI.getInstagramPosts(page.instagramBusinessId, currentWorkspace.id).catch(() => ({ data: { posts: [] } }))
                    );
                    const igPostsResponses = await Promise.all(igPostsPromises);
                    const allIgPosts = igPostsResponses.flatMap((res, idx) =>
                        (res.data.posts || []).map(post => ({
                            ...post,
                            pageId: instagramPages[idx].pageId,
                            pageName: instagramPages[idx].instagramUsername ? `@${instagramPages[idx].instagramUsername}` : instagramPages[idx].pageName,
                            instagramBusinessId: instagramPages[idx].instagramBusinessId,
                            inboxType: INBOX_TYPES.COMMENT,
                            platform: 'INSTAGRAM',
                            sortDate: new Date(post.created_time)
                        }))
                    );
                    items = [...items, ...allIgPosts];
                }
            }

            // Sort by date (most recent first)
            items.sort((a, b) => b.sortDate - a.sortDate);

            // Apply search filter
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                items = items.filter(item => {
                    if (item.inboxType === INBOX_TYPES.MESSAGE || item.inboxType === INBOX_TYPES.EMAIL) {
                        return item.contact?.name?.toLowerCase().includes(term) ||
                            item.contact?.fullName?.toLowerCase().includes(term) ||
                            item.contact?.email?.toLowerCase().includes(term) ||
                            item.contact?.phone?.includes(term) ||
                            item.contact?.instagramUsername?.toLowerCase().includes(term) ||
                            item.contact?.company?.toLowerCase().includes(term);
                    } else if (item.inboxType === INBOX_TYPES.COMMENT) {
                        return item.message?.toLowerCase().includes(term) ||
                            item.from?.name?.toLowerCase().includes(term);
                    } else if (item.inboxType === INBOX_TYPES.LEAD) {
                        return item.name?.toLowerCase().includes(term) ||
                            item.email?.toLowerCase().includes(term) ||
                            item.phone?.includes(term);
                    }
                    return true;
                });
            }

            setInboxItems(items);
        } catch (error) {
            console.error('Error loading inbox items:', error);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const handleSelectItem = async (item) => {
        setSelectedItem(item);
        setSelectedItemType(item.inboxType);

        if (item.inboxType === INBOX_TYPES.MESSAGE || item.inboxType === INBOX_TYPES.EMAIL) {
            await loadConversationDetails(item.id);
        } else if (item.inboxType === INBOX_TYPES.COMMENT) {
            setSelectedPost(item);
            await loadComments(item.id, item);
        }
        // For leads, data is already in the item
    };

    const loadConversationDetails = async (conversationId) => {
        try {
            // First, get the unread count BEFORE marking as read
            const currentItem = inboxItems.find(i => i.id === conversationId);
            const unreadForThis = currentItem?.unreadCount || 0;

            // Call API - this marks conversation as read in backend
            const response = await conversationAPI.getById(currentWorkspace.id, conversationId);
            setSelectedItem(response.data.conversation);

            // Set botEnabled state from conversation data
            setBotEnabled(response.data.conversation.botEnabled !== false);

            // Update local inbox items to show 0 unread
            setInboxItems(prev => prev.map(i =>
                i.id === conversationId ? { ...i, unreadCount: 0 } : i
            ));

            // Decrease global unread count only for message channels
            const messageChannels = ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP'];
            if (unreadForThis > 0 && messageChannels.includes(currentItem?.channel)) {
                setUnreadCount(prev => Math.max(0, prev - unreadForThis));
            }

            const msgs = response.data.conversation.messages || [];
            const notes = response.data.conversation.internalNotes || [];

            const formattedNotes = notes.map(n => ({
                ...n,
                isInternalNote: true,
                messageType: 'NOTE',
                sender: n.user,
                isFromContact: false
            }));

            const combined = [...msgs, ...formattedNotes].sort((a, b) =>
                new Date(a.createdAt) - new Date(b.createdAt)
            );
            setMessages(combined);
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    };

    const loadComments = async (postId, item = null) => {
        try {
            const targetItem = item || selectedPost;
            const page = pages.find(p => p.pageId === targetItem?.pageId) || pages[0];
            // For Instagram posts, pass instagramBusinessId
            const instagramBusinessId = targetItem?.instagramBusinessId || targetItem?.platform === 'INSTAGRAM' ? page?.instagramBusinessId : null;
            const response = await facebookAPI.getPostComments(postId, currentWorkspace.id, page?.pageId, instagramBusinessId);
            setComments(response.data.comments || []);
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    };

    // Fetch AI suggested replies
    const fetchAiSuggestions = async () => {
        if (!selectedItem || !currentWorkspace) return;

        setLoadingSuggestions(true);
        setShowSuggestions(true);

        try {
            const response = await aiAPI.getSuggestedReplies(currentWorkspace.id, selectedItem.id);
            setAiSuggestions(response.data.suggestions || []);
        } catch (error) {
            console.error('AI suggestions error:', error);
            setAiSuggestions([]);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    // Apply suggestion to input
    const applySuggestion = (suggestion) => {
        setNewMessage(suggestion.text);
        setShowSuggestions(false);
        setAiSuggestions([]);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedItem) return;

        try {
            // Check if this is an internal note
            const shouldSendNote = isInternalNoteMode;

            if (shouldSendNote) {
                const response = await conversationAPI.addNote(
                    currentWorkspace.id,
                    selectedItem.id,
                    { content: newMessage }
                );
                const newNote = {
                    ...response.data.note,
                    isInternalNote: true,
                    messageType: 'NOTE',
                    sender: user,
                    isFromContact: false
                };
                setMessages([...messages, newNote]);
            } else {
                // For email, include CC/BCC
                const messageData = { content: newMessage };
                if (selectedItemType === INBOX_TYPES.EMAIL) {
                    if (emailCc.trim()) messageData.cc = emailCc.trim();
                    if (emailBcc.trim()) messageData.bcc = emailBcc.trim();
                }

                const response = await conversationAPI.sendMessage(
                    currentWorkspace.id,
                    selectedItem.id,
                    messageData
                );
                // Only add if not a duplicate
                if (!response.data.duplicate) {
                    setMessages(prev => {
                        // Extra check to prevent duplicates
                        if (prev.some(m => m.id === response.data.message.id)) return prev;
                        return [...prev, response.data.message];
                    });
                }

                // Clear CC/BCC after sending
                if (selectedItemType === INBOX_TYPES.EMAIL) {
                    setEmailCc('');
                    setEmailBcc('');
                    setShowBcc(false);
                }
            }
            setNewMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Mesaj gönderilemedi.');
        }
    };

    const handleSendComment = async () => {
        if (!replyText.trim() || !selectedPost) return;

        try {
            await facebookAPI.createComment(selectedPost.id, {
                message: replyText,
                workspaceId: currentWorkspace.id,
                pageId: selectedPost.pageId
            });
            setReplyText('');
            loadComments(selectedPost.id, selectedPost);
        } catch (error) {
            console.error('Error sending comment:', error);
            alert('Yorum gönderilemedi.');
        }
    };

    const handleAssignUser = async (conversationId, userId) => {
        try {
            console.log('🔄 [handleAssignUser] conversationId:', conversationId, 'userId:', userId, 'type:', typeof userId);
            const response = await conversationAPI.assign(currentWorkspace.id, conversationId, { userId: userId || null });
            // Update selectedItem with new assignment
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    assignedToId: userId || null,
                    assignedTo: response.data.conversation?.assignedTo || null
                }));
            }
            loadInboxItems(false);
        } catch (error) {
            console.error('Assign user error:', error);
        }
    };

    // WhatsApp Template functions
    const openTemplateModal = (template) => {
        setSelectedTemplate(template);
        // Parse variables from template body
        const matches = template.bodyText?.match(/\{\{(\d+)\}\}/g) || [];
        const uniqueVars = [...new Set(matches)].map((v) => ({
            placeholder: v,
            value: ''
        }));
        setTemplateVariables(uniqueVars);
        // Reset header media URL
        setHeaderMediaUrl(template.headerContent || '');
        setShowTemplateModal(true);
    };

    // Handle creating new conversation
    const handleCreateNewConversation = async () => {
        if (!newConversationPhone || !currentWorkspace?.id) return;

        setCreatingConversation(true);
        try {
            // Format phone number - remove spaces and dashes
            let phone = newConversationPhone.replace(/[\s-]/g, '');
            // Add country code if not present
            if (!phone.startsWith('90') && !phone.startsWith('+90')) {
                phone = '90' + phone;
            }
            phone = phone.replace('+', '');

            const response = await conversationAPI.createManual(currentWorkspace.id, {
                phone,
                name: newConversationName || `Müşteri ${phone.slice(-4)}`,
                description: newConversationMessage || null
            });

            // Close modal and reset
            setShowNewConversationModal(false);
            setNewConversationPhone('');
            setNewConversationName('');
            setNewConversationMessage('');

            // Refresh inbox and select new conversation
            await loadInboxItems();
            if (response?.data?.conversation?.id) {
                setSelectedItem(response.data.conversation);
                setSelectedItemType('message');
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
            alert(error.response?.data?.error || 'Görüşme oluşturulurken bir hata oluştu');
        } finally {
            setCreatingConversation(false);
        }
    };

    const handleSendTemplate = async () => {
        if (!selectedItem?.contact?.phone) {
            alert('Bu kişinin telefon numarası yok');
            return;
        }

        // Check if header media is required but not provided
        const needsHeaderMedia = selectedTemplate?.headerType &&
            ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedTemplate.headerType);
        if (needsHeaderMedia && !headerMediaUrl) {
            alert('Bu şablon için medya URL\'si gereklidir');
            return;
        }

        setSendingTemplate(true);
        try {
            const variables = templateVariables.map(v => v.value);
            await automationAPI.sendTemplate(currentWorkspace.id, {
                templateId: selectedTemplate.id,
                contactId: selectedItem.contact?.id,
                variables: variables.length > 0 ? variables : undefined,
                headerMediaUrl: needsHeaderMedia ? headerMediaUrl : undefined
            });
            alert('Şablon mesajı gönderildi!');
            setShowTemplateModal(false);
            setSelectedTemplate(null);
            setHeaderMediaUrl('');
            // Reload messages
            loadConversationDetails(selectedItem.id);
        } catch (error) {
            console.error('Send template error:', error);
            alert(error.response?.data?.error || 'Mesaj gönderilemedi');
        } finally {
            setSendingTemplate(false);
        }
    };

    const handleAssignTeam = async (conversationId, teamId) => {
        try {
            // Sadece takım değişikliği gönder, agent atamasına dokunma
            // Agent ataması ayrı bir işlem olarak handleAssignUser ile yapılır
            const assignData = { teamId: teamId || null };

            await conversationAPI.assign(currentWorkspace.id, conversationId, assignData);

            // Update selectedItem with new team assignment
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    teamIds: teamId ? JSON.stringify([teamId]) : '[]'
                    // Agent atamasına dokunma - mevcut atamayı koru
                }));
            }

            // Artık takım değişikliği agent atamasını etkilemediği için
            // "Bana Atanan" tabında kalabilir

            loadInboxItems(false);
        } catch (error) {
            console.error('Assign team error:', error);
        }
    };

    const handleAssignBot = async (conversationId, botId) => {
        try {
            const response = await conversationAPI.assign(currentWorkspace.id, conversationId, { botId: botId || null });
            // Update selectedItem with new bot assignment
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    assignedBotId: botId || null,
                    assignedBot: response.data.conversation?.assignedBot || null,
                    // Bot assignment clears user assignment
                    assignedToId: botId ? null : prev.assignedToId,
                    assignedTo: botId ? null : prev.assignedTo
                }));
            }
            loadInboxItems(false);
        } catch (error) {
            console.error('Assign bot error:', error);
        }
    };

    const handleLeadStatusChange = async (leadId, newStatus) => {
        try {
            await leadsAPI.updateStatus(leadId, { status: newStatus });
            setInboxItems(prev => prev.map(i =>
                i.id === leadId ? { ...i, status: newStatus } : i
            ));
            if (selectedItem?.id === leadId) {
                setSelectedItem(prev => ({ ...prev, status: newStatus }));
            }
        } catch (error) {
            console.error('Error updating lead status:', error);
        }
    };

    // Toggle bot enabled/disabled for current conversation
    const handleBotToggle = async () => {
        if (!selectedItem || togglingBot) return;

        const newValue = !botEnabled;
        setTogglingBot(true);

        try {
            const response = await conversationAPI.toggleBot(currentWorkspace.id, selectedItem.id, newValue);
            setBotEnabled(newValue);
            console.log(`🤖 Bot ${newValue ? 'enabled' : 'disabled'} for conversation ${selectedItem.id}`);

            // Bot aktif edildiğinde assignedToId null olacak, UI'ı güncelle
            if (newValue && response.data?.assignedToId === null) {
                setSelectedItem(prev => ({
                    ...prev,
                    botEnabled: true,
                    assignedToId: null,
                    assignedTo: null
                }));
                // Inbox listesini de güncelle
                setInboxItems(prev => prev.map(item =>
                    item.id === selectedItem.id
                        ? { ...item, botEnabled: true, assignedToId: null, assignedTo: null }
                        : item
                ));
            }
        } catch (error) {
            console.error('Error toggling bot:', error);
            // Revert on error
            setBotEnabled(!newValue);
        } finally {
            setTogglingBot(false);
        }
    };

    // Konuşmayı üstlenme fonksiyonu
    const handleTakeOver = async () => {
        if (!selectedItem || takingOver) return;

        setTakingOver(true);

        try {
            const response = await conversationAPI.takeOver(currentWorkspace.id, selectedItem.id);
            console.log(`👤 Conversation ${selectedItem.id} taken over by ${user.name}`);

            // UI'ı güncelle
            setBotEnabled(false); // Bot devre dışı
            setSelectedItem(prev => ({
                ...prev,
                assignedToId: user.id,
                assignedTo: { id: user.id, name: user.name, avatar: user.avatar },
                botEnabled: false,
                botDelayedUntil: null
            }));

            // Inbox listesini de güncelle
            setInboxItems(prev => prev.map(item =>
                item.id === selectedItem.id
                    ? {
                        ...item,
                        assignedToId: user.id,
                        assignedTo: { id: user.id, name: user.name },
                        botEnabled: false
                    }
                    : item
            ));

        } catch (error) {
            console.error('Error taking over conversation:', error);
            alert(error.response?.data?.error || 'Konuşma üstlenilirken hata oluştu');
        } finally {
            setTakingOver(false);
        }
    };

    const handleConversationStatusChange = async (conversationId, newStatus) => {
        console.log(`🔄 Attempting to update conversation ${conversationId} to status: ${newStatus}`);
        console.log(`📌 Workspace ID: ${currentWorkspace?.id}`);

        try {
            const response = await conversationAPI.updateStatus(currentWorkspace.id, conversationId, { status: newStatus });
            console.log('📡 API Response:', response);

            // Update inbox items
            setInboxItems(prev => prev.map(i =>
                i.id === conversationId ? { ...i, status: newStatus } : i
            ));

            // Update selected item
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({ ...prev, status: newStatus }));
            }

            // Refresh inbox to get updated data
            loadInboxItems(false);

            console.log(`✅ Conversation ${conversationId} status updated to ${newStatus}`);
        } catch (error) {
            console.error('❌ Error updating conversation status:', error);
            console.error('Error details:', error.response?.data || error.message);
            alert('Sohbet durumu güncellenemedi: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleDeleteItem = async (item) => {
        if (!confirm('Bu öğeyi silmek istediğinize emin misiniz?')) return;

        try {
            console.log('🗑️ Deleting item:', item.id, 'Type:', item.inboxType, 'Channel:', item.channel);

            // Comments are not deletable
            if (item.inboxType === INBOX_TYPES.COMMENT) {
                alert('Yorumlar silinemez.');
                return;
            }

            // All conversations (MESSAGE, EMAIL, LEAD channel) - use conversation delete API
            const response = await conversationAPI.delete(currentWorkspace.id, item.id);
            console.log('✅ Delete response:', response.data);

            // Clear selection if deleted item was selected
            if (selectedItem?.id === item.id) {
                setSelectedItem(null);
                setSelectedItemType(null);
                setMessages([]);
            }

            // Remove from local state immediately for better UX
            setInboxItems(prev => prev.filter(i => i.id !== item.id));

        } catch (error) {
            console.error('❌ Error deleting item:', error);
            alert('Silme işlemi başarısız: ' + (error.response?.data?.error || error.message));
        }
    };

    const formatTime = (date) => {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Dün';
        } else if (diffDays < 7) {
            return d.toLocaleDateString('tr-TR', { weekday: 'short' });
        } else {
            return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        }
    };

    const hasReminder = (item) => {
        if (!item.contact) return false;
        const contactName = item.contact.name;
        const contactPhone = item.contact.phone;

        return appointments.some(apt => {
            const nameMatch = apt.contactName && contactName && apt.contactName.trim() === contactName.trim();
            const phoneMatch = apt.contactPhone && contactPhone && apt.contactPhone.trim() === contactPhone.trim();
            return nameMatch || phoneMatch;
        });
    };

    const getItemIcon = (item) => {
        if (item.inboxType === INBOX_TYPES.EMAIL || item.channel === 'EMAIL') {
            return <Mail size={14} className="item-type-icon email" />;
        } else if (item.inboxType === INBOX_TYPES.COMMENT && item.platform === 'INSTAGRAM') {
            return <Instagram size={14} className="item-type-icon instagram" />;
        } else if (item.inboxType === INBOX_TYPES.COMMENT) {
            return <Facebook size={14} className="item-type-icon facebook" />;
        } else if (item.instagramBusinessId || item.channel === 'INSTAGRAM') {
            return <Instagram size={14} className="item-type-icon instagram" />;
        } else if (item.whatsappPhoneNumberId || item.channel === 'WHATSAPP') {
            return <MessageCircle size={14} className="item-type-icon whatsapp" />;
        } else if (item.channel === 'WIDGET' || item.channel === 'FORM') {
            return <Globe size={14} className="item-type-icon widget" />;
        } else if (item.facebookPageId || item.channel === 'FACEBOOK' || item.channel === 'LEAD') {
            // Lead conversations also show Facebook icon since they come from Facebook Lead Ads
            return <Facebook size={14} className="item-type-icon facebook" />;
        } else {
            // Fallback - unknown channel
            return <MessageSquare size={14} className="item-type-icon" />;
        }
    };

    const getItemName = (item) => {
        if (item.inboxType === INBOX_TYPES.COMMENT) {
            return item.message?.substring(0, 40) || 'Gönderi';
        } else {
            return item.contact?.name || item.contact?.email?.split('@')[0] || 'Bilinmeyen';
        }
    };

    const getItemPreview = (item) => {
        if (item.inboxType === INBOX_TYPES.COMMENT) {
            return `${item.comments?.summary?.total_count || 0} yorum`;
        } else {
            return item.messages?.[0]?.content?.substring(0, 60) || 'Mesaj yok';
        }
    };

    const getFilterCounts = () => {
        const counts = {
            all: inboxItems.length,
            messages: inboxItems.filter(i => i.inboxType === INBOX_TYPES.MESSAGE).length,
            comments: inboxItems.filter(i => i.inboxType === INBOX_TYPES.COMMENT).length,
            emails: inboxItems.filter(i => i.inboxType === INBOX_TYPES.EMAIL).length,
            leads: inboxItems.filter(i => i.channel === 'LEAD').length // Count by channel, not inboxType
        };
        return counts;
    };

    if (!currentWorkspace) {
        return (
            <div className="inbox-empty-state">
                <InboxIcon size={48} />
                <p>Lütfen bir workspace seçin</p>
            </div>
        );
    }

    return (
        <div className="inbox-page">
            {/* Left Panel - Inbox List */}
            <div className="inbox-list-panel">
                <div className="inbox-header">
                    <div className="inbox-header-top">
                        <div className="inbox-header-left">
                            <h2>
                                <InboxIcon size={20} />
                                Inbox
                            </h2>
                            <button
                                className="new-conversation-btn"
                                onClick={() => setShowNewConversationModal(true)}
                                title="Yeni Görüşme Başlat"
                            >
                                <Plus size={16} />
                                <span>Yeni Görüşme</span>
                            </button>
                        </div>
                        <div className="inbox-header-actions">
                            <button
                                className="inbox-mark-read-btn"
                                onClick={handleMarkAllAsRead}
                                disabled={loading || markingAllRead}
                                title="Tümünü Okundu Yap"
                            >
                                <CheckCheck size={16} />
                            </button>
                            <button
                                className="inbox-refresh-btn"
                                onClick={() => loadInboxItems()}
                                disabled={loading}
                                title="Yenile"
                            >
                                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                            </button>
                        </div>
                    </div>
                    {/* Filter Row */}
                    <div className="inbox-filter-row">
                        {/* Filter Dropdown */}
                        <div className="inbox-filter-multiselect" ref={filterDropdownRef}>
                            <button
                                className={`filter-multiselect-trigger ${showResolved ? 'has-resolved' : ''}`}
                                onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
                            >
                                <Filter size={16} />
                                <span>
                                    {activeFilters.length === allFilters.length && !showResolved
                                        ? 'Tümü'
                                        : activeFilters.length === allFilters.length && showResolved
                                            ? 'Çözülenler dahil'
                                            : allFilters.length - activeFilters.length === 1
                                                ? `1 kanal gizli`
                                                : `${allFilters.length - activeFilters.length} kanal gizli`
                                    }
                                </span>
                                <ChevronDown size={16} className={`chevron ${filterDropdownOpen ? 'open' : ''}`} />
                            </button>

                            {filterDropdownOpen && (
                                <div className="filter-dropdown-menu">
                                    <div className="filter-section-title">Kanallar</div>
                                    <label className="filter-option">
                                        <input
                                            type="checkbox"
                                            checked={activeFilters.includes('whatsapp')}
                                            onChange={() => toggleFilter('whatsapp')}
                                        />
                                        <MessageCircle size={18} className="icon-whatsapp" />
                                        <span>WhatsApp</span>
                                    </label>
                                    <label className="filter-option">
                                        <input
                                            type="checkbox"
                                            checked={activeFilters.includes('facebook')}
                                            onChange={() => toggleFilter('facebook')}
                                        />
                                        <Facebook size={18} className="icon-facebook" />
                                        <span>Facebook</span>
                                    </label>
                                    <label className="filter-option">
                                        <input
                                            type="checkbox"
                                            checked={activeFilters.includes('instagram')}
                                            onChange={() => toggleFilter('instagram')}
                                        />
                                        <Instagram size={18} className="icon-instagram" />
                                        <span>Instagram</span>
                                    </label>
                                    <label className="filter-option">
                                        <input
                                            type="checkbox"
                                            checked={activeFilters.includes('widget')}
                                            onChange={() => toggleFilter('widget')}
                                        />
                                        <MessageSquare size={18} className="icon-widget" />
                                        <span>Web Formları</span>
                                    </label>
                                    <label className="filter-option">
                                        <input
                                            type="checkbox"
                                            checked={activeFilters.includes('emails')}
                                            onChange={() => toggleFilter('emails')}
                                        />
                                        <Mail size={18} className="icon-email" />
                                        <span>E-postalar</span>
                                    </label>
                                    <label className="filter-option">
                                        <input
                                            type="checkbox"
                                            checked={activeFilters.includes('leads')}
                                            onChange={() => toggleFilter('leads')}
                                        />
                                        <UserCheck size={18} className="icon-leads" />
                                        <span>Leads</span>
                                    </label>
                                    <div className="filter-divider" />
                                    <div className="filter-section-title">Yorumlar</div>

                                    <label className="filter-option">
                                        <input
                                            type="checkbox"
                                            checked={activeFilters.includes('fb_comments')}
                                            onChange={() => toggleFilter('fb_comments')}
                                        />
                                        <Facebook size={18} className="icon-facebook" />
                                        <span>FB Yorumları</span>
                                    </label>
                                    <label className="filter-option">
                                        <input
                                            type="checkbox"
                                            checked={activeFilters.includes('ig_comments')}
                                            onChange={() => toggleFilter('ig_comments')}
                                        />
                                        <Instagram size={18} className="icon-instagram" />
                                        <span>IG Yorumları</span>
                                    </label>

                                    <div className="filter-divider" />

                                    <label className="filter-option resolved-toggle">
                                        <input
                                            type="checkbox"
                                            checked={showResolved}
                                            onChange={() => setShowResolved(!showResolved)}
                                        />
                                        <Check size={18} className="icon-resolved" />
                                        <span>Çözülenleri Göster</span>
                                    </label>

                                    {(activeFilters.length < allFilters.length || showResolved) && (
                                        <button
                                            className="filter-clear-btn"
                                            onClick={() => {
                                                setActiveFilters(allFilters);
                                                setShowResolved(false);
                                            }}
                                        >
                                            Filtreleri Sıfırla
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Status Filter Select */}
                        <div className="inbox-status-filters">
                            <select
                                className="status-filter-select"
                                value={statusFilter || ''}
                                onChange={(e) => setStatusFilter(e.target.value || null)}
                            >
                                <option value="">Tüm Durumlar</option>
                                <option value="NEW_APPLICATION">Yeni Başvuru</option>
                                <option value="COMPLAINT">Şikayet</option>
                                <option value="INFO_PROVIDED">Bilgi Verildi</option>
                                <option value="HOT_OPPORTUNITY">Sıcak Fırsat</option>
                                <option value="APPOINTMENT_SCHEDULED">Randevu Planlandı</option>
                                <option value="SALE_COMPLETED">Satış Gerçekleşti</option>
                                <option value="UNREACHABLE">Ulaşılamadı</option>
                                <option value="SPAM">Spam</option>
                                <option value="LOST">Kaybedildi</option>
                            </select>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="inbox-search">
                        <Search size={16} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Channel filters (only for messages) */}
                    {(activeFilters.length === 0 || activeFilters.includes('messages')) && (
                        <div className="inbox-channel-filters">
                            <button
                                className={`channel-btn ${activeChannel === null ? 'active' : ''}`}
                                onClick={() => setActiveChannel(null)}
                            >
                                Tümü
                            </button>
                            <button
                                className={`channel-btn whatsapp ${activeChannel === 'WHATSAPP' ? 'active' : ''}`}
                                onClick={() => setActiveChannel('WHATSAPP')}
                            >
                                <MessageCircle size={14} />
                            </button>
                            <button
                                className={`channel-btn facebook ${activeChannel === 'FACEBOOK' ? 'active' : ''}`}
                                onClick={() => setActiveChannel('FACEBOOK')}
                            >
                                <Facebook size={14} />
                            </button>
                            <button
                                className={`channel-btn instagram ${activeChannel === 'INSTAGRAM' ? 'active' : ''}`}
                                onClick={() => setActiveChannel('INSTAGRAM')}
                            >
                                <Instagram size={14} />
                            </button>
                            <button
                                className={`channel-btn widget ${activeChannel === 'WIDGET' ? 'active' : ''}`}
                                onClick={() => setActiveChannel('WIDGET')}
                            >
                                <Globe size={14} />
                            </button>
                        </div>
                    )}

                    {/* Assignment tabs (only for messages) */}
                    {(activeFilters.length === 0 || activeFilters.includes('messages')) && (
                        <div className="inbox-assignment-tabs">
                            <button
                                className={`assignment-tab ${assignmentTab === 'MINE' ? 'active' : ''}`}
                                onClick={() => setAssignmentTab('MINE')}
                            >
                                Bana Atanan
                            </button>
                            {isOwner && (
                                <button
                                    className={`assignment-tab ${assignmentTab === 'PENDING' ? 'active' : ''}`}
                                    onClick={() => setAssignmentTab('PENDING')}
                                >
                                    Bekleyen
                                </button>
                            )}
                            <button
                                className={`assignment-tab ${assignmentTab === 'ALL' ? 'active' : ''}`}
                                onClick={() => setAssignmentTab('ALL')}
                            >
                                Tümü
                            </button>
                        </div>
                    )}
                </div>

                {/* Inbox Items List */}
                <div className="inbox-items">
                    {loading ? (
                        <div className="inbox-loading">
                            <RefreshCw size={24} className="spin" />
                            <p>Yükleniyor...</p>
                        </div>
                    ) : inboxItems.filter(item => {
                        // Hide resolved conversations unless showResolved is true
                        if (!showResolved && item.inboxType === INBOX_TYPES.MESSAGE && item.status === 'RESOLVED') {
                            return false;
                        }
                        return true;
                    }).length === 0 ? (
                        <div className="inbox-empty">
                            <InboxIcon size={40} />
                            <p>Öğe bulunamadı</p>
                            {!showResolved && (
                                <button
                                    className="show-resolved-btn"
                                    onClick={() => setShowResolved(true)}
                                >
                                    Çözülenleri Göster
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {inboxItems.filter(item => {
                                // Hide resolved conversations unless showResolved is true
                                if (!showResolved && item.inboxType === INBOX_TYPES.MESSAGE && item.status === 'RESOLVED') {
                                    return false;
                                }
                                return true;
                            }).map((item) => (
                                <div
                                    key={`${item.inboxType}-${item.id}`}
                                    className={`inbox-item ${selectedItem?.id === item.id ? 'active' : ''} ${item.unreadCount > 0 ? 'unread' : ''}`}
                                    onClick={() => handleSelectItem(item)}
                                >
                                    <div className="inbox-item-avatar">
                                        {item.inboxType === INBOX_TYPES.COMMENT && item.full_picture ? (
                                            <img src={item.full_picture} alt="post" className="post-thumb" />
                                        ) : (
                                            <User size={18} />
                                        )}
                                    </div>
                                    <div className="inbox-item-content">
                                        <div className="inbox-item-header">
                                            <span className="inbox-item-name">
                                                {getItemIcon(item)}
                                                {getItemName(item)}
                                            </span>
                                            <span className="inbox-item-time">
                                                {formatTime(item.sortDate)}
                                            </span>
                                        </div>
                                        <div className="inbox-item-preview">
                                            {getItemPreview(item)}
                                        </div>
                                        <div className="inbox-item-footer">
                                            {item.channel === 'LEAD' && (
                                                <span className="lead-channel-badge">Lead</span>
                                            )}
                                            {(item.unreadCount || 0) > 0 && (
                                                <span className="unread-badge">{item.unreadCount}</span>
                                            )}
                                            {/* Takım Badge */}
                                            {item.teamIds && (() => {
                                                try {
                                                    const teamIdList = JSON.parse(item.teamIds);
                                                    if (teamIdList.length > 0) {
                                                        const team = teams.find(t => t.id === teamIdList[0]);
                                                        if (team) {
                                                            return (
                                                                <div className="team-badge" title={`Takım: ${team.name}`}>
                                                                    {team.name.length > 8 ? team.name.slice(0, 8) + '...' : team.name}
                                                                </div>
                                                            );
                                                        }
                                                    }
                                                } catch (e) { }
                                                return null;
                                            })()}
                                            {/* Atanan Kişi Badge */}
                                            {item.assignedTo && (
                                                <div className="assignee-name-badge" title={`Atanan: ${item.assignedTo.name}`}>
                                                    {item.assignedTo.name}
                                                </div>
                                            )}
                                            {/* Reminder Indicator */}
                                            {hasReminder(item) && (
                                                <div className="reminder-indicator" title="Hatırlatıcı var">
                                                    <Bell size={12} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Load More Button */}
                            {hasMore && (
                                <button
                                    className="load-more-btn"
                                    onClick={loadMoreItems}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? (
                                        <>
                                            <RefreshCw size={16} className="spin" />
                                            Yükleniyor...
                                        </>
                                    ) : (
                                        <>
                                            Daha Fazla Yükle
                                        </>
                                    )}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Middle Panel - Detail View */}
            <div className="inbox-detail-panel">
                {selectedItem ? (
                    <>
                        {/* Message/Email Detail View */}
                        {(selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && (
                            <>
                                <div className="detail-header">
                                    {/* Profile Bar */}
                                    <div className="profile-bar">
                                        <div className="profile-bar-left">
                                            <div className="detail-avatar">
                                                {selectedItem.contact?.avatar ? (
                                                    <img src={selectedItem.contact.avatar} alt={selectedItem.contact.name} />
                                                ) : (
                                                    <User size={24} />
                                                )}
                                            </div>
                                            <div className="profile-info">
                                                <h3>{selectedItem.contact?.name || 'Bilinmeyen'}</h3>
                                                <div className="detail-channel-info">
                                                    {getItemIcon(selectedItem)}
                                                    <span>
                                                        {selectedItem.channel === 'MANUAL' ? 'Yeni Görüşme' :
                                                            selectedItem.instagramBusinessId ? 'Instagram' :
                                                                selectedItem.whatsappPhoneNumberId ? 'WhatsApp' :
                                                                    selectedItem.channel === 'EMAIL' ? 'E-posta' :
                                                                        selectedItem.channel === 'FORM' ? 'Web Form' :
                                                                            selectedItem.channel === 'WIDGET' ? 'Web Widget' : 'Facebook'}
                                                    </span>
                                                    {/* Hangi hesaptan geldiğini göster */}
                                                    {selectedItem.facebookPage && (
                                                        <span className="page-source">
                                                            • {selectedItem.facebookPage.instagramUsername
                                                                ? `@${selectedItem.facebookPage.instagramUsername}`
                                                                : selectedItem.facebookPage.pageName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="profile-bar-actions">
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '16px', fontSize: '11px', color: '#6b7280', alignItems: 'flex-end' }}>
                                                {(() => {
                                                    const customerMessages = selectedItem.messages?.filter(m => m.isFromContact) || [];
                                                    const firstMsg = customerMessages[0];
                                                    const lastMsg = customerMessages[customerMessages.length - 1];
                                                    return (
                                                        <>
                                                            <span>İlk Yazma: {firstMsg?.createdAt ? new Date(firstMsg.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---'}</span>
                                                            <span>Son Yazma: {lastMsg?.createdAt ? new Date(lastMsg.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---'}</span>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                            {/* Status Dropdown - for both MESSAGE and EMAIL */}
                                            {(selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && (
                                                <div className="status-dropdown-compact">
                                                    <span
                                                        className="status-dot"
                                                        style={{ backgroundColor: getConversationStatusInfo(selectedItem.status).color }}
                                                    />
                                                    <select
                                                        value={selectedItem.status || 'OPEN'}
                                                        onChange={(e) => handleConversationStatusChange(selectedItem.id, e.target.value)}
                                                    >
                                                        {CONVERSATION_STATUS_OPTIONS.map(opt => (
                                                            <option key={opt.value} value={opt.value}>
                                                                {opt.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                            <button
                                                className="profile-action-btn delete"
                                                onClick={() => handleDeleteItem(selectedItem)}
                                                title="Sohbeti Sil"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Assignment Bar */}
                                    <div className="assignment-bar">
                                        {/* Left Group: Team, Agent, Üstlen, Bot Toggle */}
                                        <div className="assignment-left-group">
                                            {/* Atama dropdown'ları - Owner'lar HER ZAMAN, Agent'lar sadece kendisine atanmışsa görebilir */}
                                            {(isOwner || selectedItem.assignedToId === user.id) && (
                                                <>
                                                    {/* Önce Takım Seçimi */}
                                                    <div className="assignment-item">
                                                        <Users size={14} />
                                                        <select
                                                            value={selectedItem.teamIds ? JSON.parse(selectedItem.teamIds)[0] || '' : ''}
                                                            onChange={(e) => handleAssignTeam(selectedItem.id, e.target.value)}
                                                        >
                                                            <option value="">Takım Seç</option>
                                                            {teams.map(t => (
                                                                <option key={t.id} value={t.id}>{t.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    {/* Sonra Agent Seçimi (opsiyonel) */}
                                                    <div className="assignment-item">
                                                        <User size={14} />
                                                        <select
                                                            value={selectedItem.assignedToId || ''}
                                                            onChange={(e) => handleAssignUser(selectedItem.id, e.target.value)}
                                                            title={!selectedItem.teamIds || selectedItem.teamIds === '[]' ? 'Önce takım seçin' : 'Takımdaki bir agent\'a atayın'}
                                                        >
                                                            <option value="">Agent Seç</option>
                                                            {(() => {
                                                                // Seçili takımın ID'sini al
                                                                const selectedTeamId = selectedItem.teamIds ? JSON.parse(selectedItem.teamIds)[0] : null;
                                                                // Seçili takımı bul
                                                                const selectedTeam = teams.find(t => t.id === selectedTeamId);
                                                                // Takımdaki agent'ları filtrele
                                                                const teamMemberIds = selectedTeam?.members?.map(m => m.userId) || [];

                                                                // Eğer takım seçili değilse tüm agent'ları göster, seçiliyse sadece takımdakileri
                                                                const filteredMembers = selectedTeamId
                                                                    ? members.filter(m => teamMemberIds.includes(m.user.id))
                                                                    : members;

                                                                return filteredMembers.map(m => (
                                                                    <option key={m.id} value={m.user.id}>{m.user.name}</option>
                                                                ));
                                                            })()}
                                                        </select>
                                                    </div>
                                                </>
                                            )}

                                            {/* Üstlen button moved to message input area */}
                                        </div>

                                        {/* Right Group: Contact Status */}
                                        <div className="assignment-right-group">
                                            {(selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && selectedItem.contact && (
                                                <div className="assignment-item contact-status-item">
                                                    <span
                                                        className="status-dot"
                                                        style={{ backgroundColor: CUSTOMER_STATUS_OPTIONS.find(o => o.value === (selectedItem.contact.status || 'NEW_APPLICATION'))?.color || '#3b82f6' }}
                                                    />
                                                    <select
                                                        value={selectedItem.contact.status || 'NEW_APPLICATION'}
                                                        onChange={async (e) => {
                                                            const newStatus = e.target.value;
                                                            try {
                                                                await contactAPI.update(currentWorkspace.id, selectedItem.contact.id, { status: newStatus });
                                                                setSelectedItem(prev => ({
                                                                    ...prev,
                                                                    contact: { ...prev.contact, status: newStatus }
                                                                }));
                                                            } catch (err) {
                                                                console.error('Status update error:', err);
                                                                alert('Durum güncellenirken bir hata oluştu.');
                                                            }
                                                        }}
                                                    >
                                                        {CUSTOMER_STATUS_OPTIONS.map(option => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>

                                <div className="messages-container" ref={messagesContainerRef}>
                                    {messages.map((msg) => {
                                        // Check if this is a lead form message
                                        const isLeadMessage = msg.content?.includes('YENİ LEAD FORMU') || msg.content?.includes('YENİ LEAD') || msg.content?.includes('Yeni Facebook Lead');

                                        // Check for handoff messages
                                        const isHandoffAsk = !msg.isFromContact && (
                                            msg.content?.includes('temsilcimize aktarmamı ister misiniz') ||
                                            msg.content?.includes('yönlendirmemi ister misiniz')
                                        );
                                        const isHandoffConfirmed = !msg.isFromContact && (
                                            msg.content?.includes('temsilcimize aktarıyorum') ||
                                            msg.content?.includes('En kısa sürede size dönüş yapacağız')
                                        );

                                        // Determine message class
                                        let messageClass = 'message ';
                                        if (msg.isInternalNote) {
                                            messageClass += 'internal-note';
                                        } else if (msg.isFromContact) {
                                            messageClass += 'incoming';
                                        } else {
                                            messageClass += 'outgoing';
                                        }
                                        if (isLeadMessage) messageClass += ' lead-message';

                                        return (
                                            <div key={msg.id} className={messageClass}>
                                                <div className="message-content">
                                                    {isHtmlContent(msg.content) ? (
                                                        <div
                                                            className="email-html-content"
                                                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.content) }}
                                                        />
                                                    ) : isFormMessage(msg, selectedItem?.channel) ? (
                                                        renderFormMessage(msg.content)
                                                    ) : (
                                                        <p>{msg.content}</p>
                                                    )}
                                                    <div className="message-meta">
                                                        <span className="message-time">{formatTime(msg.createdAt)}</span>
                                                        {!msg.isFromContact && !msg.isInternalNote && (
                                                            <span className={`message-status ${msg.status?.toLowerCase() || 'sent'}`}>
                                                                {msg.status === 'READ' ? (
                                                                    <CheckCheck size={14} className="status-read" title="Okundu" />
                                                                ) : msg.status === 'DELIVERED' ? (
                                                                    <CheckCheck size={14} className="status-delivered" title="İletildi" />
                                                                ) : msg.status === 'FAILED' ? (
                                                                    <AlertCircle size={14} className="status-failed" title="Gönderilemedi" />
                                                                ) : (
                                                                    <Check size={14} className="status-sent" title="Gönderildi" />
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {msg.isInternalNote && (
                                                        <div className="note-footer">
                                                            <StickyNote size={10} />
                                                            <span>Dahili Not ({msg.sender?.name || 'Gizli'})</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Email Reply Form */}
                                {selectedItemType === INBOX_TYPES.EMAIL ? (
                                    <form onSubmit={handleSendMessage} className="email-reply-form">
                                        {/* AI Suggestions Panel */}
                                        {showSuggestions && (
                                            <div className="ai-suggestions-panel">
                                                <div className="ai-suggestions-header">
                                                    <Sparkles size={14} />
                                                    <span>AI Yanıt Önerileri</span>
                                                    <button
                                                        type="button"
                                                        className="close-suggestions"
                                                        onClick={() => setShowSuggestions(false)}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                {loadingSuggestions ? (
                                                    <div className="suggestions-loading">
                                                        <Loader size={16} className="spin" />
                                                        <span>Öneriler hazırlanıyor...</span>
                                                    </div>
                                                ) : aiSuggestions.length > 0 ? (
                                                    <div className="suggestions-list">
                                                        {aiSuggestions.map((suggestion) => (
                                                            <button
                                                                key={suggestion.id}
                                                                type="button"
                                                                className="suggestion-item"
                                                                onClick={() => applySuggestion(suggestion)}
                                                            >
                                                                <span className="suggestion-tone">{suggestion.tone}</span>
                                                                <span className="suggestion-text">{suggestion.text}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="suggestions-empty">
                                                        <span>Öneri bulunamadı</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="email-reply-input-container">
                                            <textarea
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                                placeholder="Yanıtınızı yazın..."
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendMessage(e);
                                                    }
                                                }}
                                                className="email-reply-textarea"
                                            />
                                            <div className="email-reply-actions">
                                                {/* Oto Pilot Toggle */}
                                                <div
                                                    className={`autopilot-toggle ${botEnabled ? 'active' : 'inactive'}`}
                                                    onClick={handleBotToggle}
                                                    title={botEnabled ? 'Oto Pilot Aktif - Kapatmak için tıklayın' : 'Oto Pilot Kapalı - Açmak için tıklayın'}
                                                >
                                                    <Bot size={14} />
                                                    <span>{botEnabled ? 'Oto Pilot Açık' : 'Oto Pilot Kapalı'}</span>
                                                    {togglingBot && <Loader size={12} className="spin" />}
                                                </div>
                                                {/* Template Button for emails */}
                                                {templates.length > 0 && (
                                                    <div className="template-dropdown">
                                                        <button
                                                            type="button"
                                                            className="template-btn"
                                                            title="Şablon Gönder"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                const dropdown = e.currentTarget.nextElementSibling;
                                                                dropdown.classList.toggle('show');
                                                            }}
                                                        >
                                                            <Zap size={14} />
                                                            Şablon
                                                        </button>
                                                        <div className="template-dropdown-menu">
                                                            {templates.filter(t => t.status === 'APPROVED').map(template => (
                                                                <div
                                                                    key={template.id}
                                                                    className="template-dropdown-item"
                                                                    onClick={() => {
                                                                        setNewMessage(template.content || '');
                                                                        document.querySelector('.template-dropdown-menu.show')?.classList.remove('show');
                                                                    }}
                                                                >
                                                                    <span className="template-item-name">{template.name}</span>
                                                                    <span className="template-item-category">{template.category}</span>
                                                                </div>
                                                            ))}
                                                            {templates.filter(t => t.status === 'APPROVED').length === 0 && (
                                                                <div className="template-dropdown-empty">
                                                                    Onaylı şablon yok
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Üstlen Button */}
                                                {(!selectedItem?.assignedToId || selectedItem?.assignedToId !== user.id) && (
                                                    <button
                                                        type="button"
                                                        className="take-over-btn-input"
                                                        onClick={handleTakeOver}
                                                        disabled={takingOver}
                                                        title="Bu e-postayı üstlen"
                                                    >
                                                        <UserCheck size={14} />
                                                        <span>{takingOver ? 'Üstleniliyor...' : 'Üstlen'}</span>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="ai-suggest-btn"
                                                    onClick={fetchAiSuggestions}
                                                    disabled={loadingSuggestions}
                                                    title="AI Yanıt Önerileri"
                                                >
                                                    {loadingSuggestions ? (
                                                        <Loader size={14} className="spin" />
                                                    ) : (
                                                        <Sparkles size={14} />
                                                    )}
                                                    AI
                                                </button>
                                                <button type="submit" className="send-btn">
                                                    <Send size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                ) : (
                                    /* Regular Message Form */
                                    <form onSubmit={handleSendMessage} className="message-input-form">
                                        {/* AI Suggestions Panel */}
                                        {showSuggestions && (
                                            <div className="ai-suggestions-panel">
                                                <div className="ai-suggestions-header">
                                                    <Sparkles size={14} />
                                                    <span>AI Yanıt Önerileri</span>
                                                    <button
                                                        type="button"
                                                        className="close-suggestions"
                                                        onClick={() => setShowSuggestions(false)}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                {loadingSuggestions ? (
                                                    <div className="suggestions-loading">
                                                        <Loader size={16} className="spin" />
                                                        <span>Öneriler hazırlanıyor...</span>
                                                    </div>
                                                ) : aiSuggestions.length > 0 ? (
                                                    <div className="suggestions-list">
                                                        {aiSuggestions.map((suggestion) => (
                                                            <button
                                                                key={suggestion.id}
                                                                type="button"
                                                                className="suggestion-item"
                                                                onClick={() => applySuggestion(suggestion)}
                                                            >
                                                                <span className="suggestion-tone">{suggestion.tone}</span>
                                                                <span className="suggestion-text">{suggestion.text}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="no-suggestions">
                                                        Öneri bulunamadı
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="message-input-container">
                                            <textarea
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                                placeholder="Yanıtınızı yazın..."
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendMessage(e);
                                                    }
                                                }}
                                            />
                                            <div className="input-actions">
                                                {/* Oto Pilot Toggle */}
                                                <div
                                                    className={`autopilot-toggle ${botEnabled ? 'active' : 'inactive'}`}
                                                    onClick={handleBotToggle}
                                                    title={botEnabled ? 'Oto Pilot Aktif - Kapatmak için tıklayın' : 'Oto Pilot Kapalı - Açmak için tıklayın'}
                                                >
                                                    <Bot size={14} />
                                                    <span>{botEnabled ? 'Oto Pilot Açık' : 'Oto Pilot Kapalı'}</span>
                                                    {togglingBot && <Loader size={12} className="spin" />}
                                                </div>
                                                {/* WhatsApp Template Button - show for Lead or WhatsApp channel */}
                                                {(selectedItem?.channel === 'LEAD' || selectedItem?.channel === 'WHATSAPP') && templates.length > 0 && (
                                                    <div className="template-dropdown">
                                                        <button
                                                            type="button"
                                                            className="template-btn"
                                                            title="WhatsApp Şablon Gönder"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                const dropdown = e.currentTarget.nextElementSibling;
                                                                dropdown.classList.toggle('show');
                                                            }}
                                                        >
                                                            <Zap size={14} />
                                                            Şablon
                                                        </button>
                                                        <div className="template-dropdown-menu">
                                                            {templates.filter(t => t.status === 'APPROVED').map(template => (
                                                                <div
                                                                    key={template.id}
                                                                    className="template-dropdown-item"
                                                                    onClick={() => {
                                                                        openTemplateModal(template);
                                                                        document.querySelector('.template-dropdown-menu.show')?.classList.remove('show');
                                                                    }}
                                                                >
                                                                    <span className="template-item-name">{template.name}</span>
                                                                    <span className="template-item-category">{template.category}</span>
                                                                </div>
                                                            ))}
                                                            {templates.filter(t => t.status === 'APPROVED').length === 0 && (
                                                                <div className="template-dropdown-empty">
                                                                    Onaylı şablon yok
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Üstlen Button */}
                                                {(!selectedItem?.assignedToId || selectedItem?.assignedToId !== user.id) && (
                                                    <button
                                                        type="button"
                                                        className="take-over-btn-input"
                                                        onClick={handleTakeOver}
                                                        disabled={takingOver}
                                                        title="Bu konuşmayı üstlen"
                                                    >
                                                        <UserCheck size={14} />
                                                        <span>{takingOver ? 'Üstleniliyor...' : 'Üstlen'}</span>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="ai-suggest-btn"
                                                    onClick={fetchAiSuggestions}
                                                    disabled={loadingSuggestions}
                                                    title="AI Yanıt Önerileri"
                                                >
                                                    {loadingSuggestions ? (
                                                        <Loader size={14} className="spin" />
                                                    ) : (
                                                        <Sparkles size={14} />
                                                    )}
                                                    AI
                                                </button>
                                                <button type="submit" className="send-btn">
                                                    <Send size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                )}
                            </>
                        )}

                        {/* Comment Detail View */}
                        {selectedItemType === INBOX_TYPES.COMMENT && (
                            <>
                                <div className="detail-header">
                                    {/* Profile Bar - SAME as MESSAGE view */}
                                    <div className="profile-bar">
                                        <div className="profile-bar-left">
                                            <div className="detail-avatar">
                                                {comments[0]?.from?.profile_picture_url ? (
                                                    <img src={comments[0].from.profile_picture_url} alt={comments[0].from?.name} />
                                                ) : (
                                                    <User size={24} />
                                                )}
                                            </div>
                                            <div className="profile-info">
                                                <h3>{comments[0]?.from?.name || comments[0]?.from?.username || 'Bilinmeyen'}</h3>
                                                <div className="detail-channel-info">
                                                    {selectedPost?.platform === 'INSTAGRAM' ? (
                                                        <Instagram size={12} style={{ color: '#E4405F' }} />
                                                    ) : (
                                                        <Facebook size={12} style={{ color: '#1877F2' }} />
                                                    )}
                                                    <span>
                                                        {selectedPost?.platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'}
                                                    </span>
                                                    <span className="page-source">
                                                        • {selectedPost?.pageName}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="profile-bar-actions">
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '16px', fontSize: '11px', color: '#6b7280', alignItems: 'flex-end' }}>
                                                <span>İlk Yazma: {comments[0]?.created_time ? new Date(comments[0].created_time).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---'}</span>
                                                <span>Son Yazma: {comments[comments.length - 1]?.created_time ? new Date(comments[comments.length - 1].created_time).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---'}</span>
                                            </div>
                                            {/* Status Dropdown */}
                                            <div className="status-dropdown-compact">
                                                <span className="status-dot" style={{ backgroundColor: '#10b981' }} />
                                                <select defaultValue="OPEN">
                                                    <option value="OPEN">Açık</option>
                                                    <option value="PENDING">Beklemede</option>
                                                    <option value="RESOLVED">Çözüldü</option>
                                                </select>
                                            </div>
                                            {selectedPost?.permalink_url && (
                                                <a
                                                    href={selectedPost.permalink_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="profile-action-btn"
                                                    title="Gönderiye Git"
                                                    style={{ marginLeft: '8px' }}
                                                >
                                                    <ExternalLink size={16} />
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Assignment Bar - SAME as MESSAGE view */}
                                    <div className="assignment-bar">
                                        <div className="assignment-left-group">
                                            {isOwner && (
                                                <>
                                                    {/* Team Selection */}
                                                    <div className="assignment-item">
                                                        <Users size={14} />
                                                        <select defaultValue="">
                                                            <option value="">Takım Seç</option>
                                                            {teams.map(t => (
                                                                <option key={t.id} value={t.id}>{t.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    {/* Agent Selection */}
                                                    <div className="assignment-item">
                                                        <User size={14} />
                                                        <select defaultValue="">
                                                            <option value="">Agent Seç</option>
                                                            {members.map(m => (
                                                                <option key={m.id} value={m.user.id}>{m.user.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Right Group: Contact Status */}
                                        <div className="assignment-right-group">
                                            <div className="assignment-item contact-status-item">
                                                <span className="status-dot" style={{ backgroundColor: '#3b82f6' }} />
                                                <select defaultValue="NEW_APPLICATION">
                                                    {CUSTOMER_STATUS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="messages-container" ref={messagesContainerRef}>
                                    {comments.map((comment) => (
                                        <React.Fragment key={comment.id}>
                                            {/* Incoming comment - left side */}
                                            <div className="message incoming">
                                                <div className="message-content">
                                                    <p>{comment.message}</p>
                                                    <div className="message-meta">
                                                        <span className="message-time">{formatTime(comment.created_time)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Bot/Page Replies - right side (outgoing) */}
                                            {comment.comments?.data?.map(reply => (
                                                <div key={reply.id} className="message outgoing">
                                                    <div className="message-content">
                                                        <p>{reply.message}</p>
                                                        <div className="message-meta">
                                                            <span className="message-time">{formatTime(reply.created_time)}</span>
                                                            <CheckCheck size={14} className="read-icon" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </div>

                                <form onSubmit={(e) => { e.preventDefault(); handleSendComment(); }} className="message-input-form">
                                    <div className="message-input-container">
                                        <textarea
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            placeholder="Yanıtınızı yazın..."
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendComment();
                                                }
                                            }}
                                        />
                                        <div className="input-actions">
                                            {/* Oto Pilot Toggle */}
                                            <div
                                                className={`autopilot-toggle ${botEnabled ? 'active' : 'inactive'}`}
                                                onClick={handleBotToggle}
                                                title={botEnabled ? 'Oto Pilot Aktif - Kapatmak için tıklayın' : 'Oto Pilot Kapalı - Açmak için tıklayın'}
                                            >
                                                <Bot size={14} />
                                                <span>{botEnabled ? 'Oto Pilot Açık' : 'Oto Pilot Kapalı'}</span>
                                                {togglingBot && <Loader size={12} className="spin" />}
                                            </div>
                                            {/* Üstlen Button */}
                                            <button
                                                type="button"
                                                className="take-over-btn-input"
                                                onClick={handleTakeOver}
                                                disabled={takingOver}
                                                title="Bu yorumu üstlen"
                                            >
                                                <UserCheck size={14} />
                                                <span>{takingOver ? 'Üstleniliyor...' : 'Üstlen'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="ai-suggest-btn"
                                                onClick={fetchAiSuggestions}
                                                disabled={loadingSuggestions}
                                                title="AI Yanıt Önerileri"
                                            >
                                                {loadingSuggestions ? (
                                                    <Loader size={14} className="spin" />
                                                ) : (
                                                    <Sparkles size={14} />
                                                )}
                                                AI
                                            </button>
                                            <button type="submit" className="send-btn">
                                                <Send size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </>
                        )}

                    </>
                ) : (
                    <div className="inbox-detail-empty">
                        <InboxIcon size={48} />
                        <h3>Öğe Seçin</h3>
                        <p>Detayları görüntülemek için soldan bir öğe seçin</p>
                    </div>
                )}
            </div>

            {/* Right Panel - Contact Sidebar (for all types) */}
            {selectedItem && (selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && (
                <div className="inbox-contact-sidebar-wrapper">
                    <ContactSidebar
                        conversationId={selectedItem.id}
                        isOpen={true}
                        members={members}
                        onAssign={userId => handleAssignUser(selectedItem.id, userId)}
                        isOwner={isOwner}
                    />
                </div>
            )}

            {/* Right Panel - Contact Sidebar for Comments */}
            {selectedItemType === INBOX_TYPES.COMMENT && selectedPost && (
                <div className="inbox-contact-sidebar-wrapper">
                    <ContactSidebar
                        isOpen={true}
                        members={members}
                        isOwner={isOwner}
                        readOnly={true}
                        externalProfile={{
                            name: selectedPost.from?.name || 'Facebook Kullanıcısı',
                            profilePic: selectedPost.from?.id
                                ? `https://graph.facebook.com/${selectedPost.from.id}/picture?type=large`
                                : null,
                            facebookId: selectedPost.from?.id,
                            channel: 'FACEBOOK',
                            tags: [],
                            // Post info
                            postMessage: selectedPost.message?.substring(0, 100),
                            postDate: selectedPost.created_time
                        }}
                    />
                </div>
            )}

            {/* WhatsApp Template Send Modal */}
            {showTemplateModal && selectedTemplate && (
                <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
                    <div className="template-send-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>📨 WhatsApp Şablon Gönder</h3>
                            <button className="modal-close" onClick={() => setShowTemplateModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="template-info">
                                <span className="template-name">{selectedTemplate.name}</span>
                                <span className="template-category">{selectedTemplate.category}</span>
                            </div>
                            <div className="template-preview">
                                <p>{selectedTemplate.bodyText}</p>
                            </div>

                            {selectedItem?.contact?.phone ? (
                                <div className="recipient-info">
                                    <Phone size={16} />
                                    <span>Alıcı: {selectedItem.contact.name} ({selectedItem.contact.phone})</span>
                                </div>
                            ) : (
                                <div className="recipient-warning">
                                    <AlertCircle size={16} />
                                    <span>Bu kişinin telefon numarası yok!</span>
                                </div>
                            )}

                            {/* Header Media URL for IMAGE/VIDEO/DOCUMENT templates */}
                            {selectedTemplate?.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedTemplate.headerType) && (
                                <div className="template-header-media">
                                    <h4>
                                        {selectedTemplate.headerType === 'IMAGE' && '🖼️ Resim URL\'si'}
                                        {selectedTemplate.headerType === 'VIDEO' && '🎬 Video URL\'si'}
                                        {selectedTemplate.headerType === 'DOCUMENT' && '📄 Döküman URL\'si'}
                                        <span className="required">*</span>
                                    </h4>
                                    <input
                                        type="url"
                                        value={headerMediaUrl}
                                        onChange={(e) => setHeaderMediaUrl(e.target.value)}
                                        placeholder={`https://example.com/${selectedTemplate.headerType.toLowerCase()}.${selectedTemplate.headerType === 'IMAGE' ? 'jpg' : selectedTemplate.headerType === 'VIDEO' ? 'mp4' : 'pdf'}`}
                                    />
                                    <p className="hint">Herkese açık bir URL olmalıdır</p>
                                </div>
                            )}

                            {templateVariables.length > 0 && (
                                <div className="template-variables">
                                    <h4>Değişkenler</h4>
                                    {templateVariables.map((v, idx) => (
                                        <div key={idx} className="variable-input">
                                            <label>{v.placeholder}</label>
                                            <input
                                                type="text"
                                                value={v.value}
                                                onChange={(e) => {
                                                    const newVars = [...templateVariables];
                                                    newVars[idx].value = e.target.value;
                                                    setTemplateVariables(newVars);
                                                }}
                                                placeholder={`Değer ${idx + 1}`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={() => setShowTemplateModal(false)}>
                                İptal
                            </button>
                            <button
                                className="btn-send-template"
                                onClick={handleSendTemplate}
                                disabled={sendingTemplate || !selectedItem?.contact?.phone}
                            >
                                {sendingTemplate ? <Loader className="spinning" size={16} /> : <Send size={16} />}
                                {sendingTemplate ? 'Gönderiliyor...' : 'Gönder'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* New Conversation Modal */}
            {showNewConversationModal && (
                <div className="modal-overlay" onClick={() => setShowNewConversationModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Yeni Görüşme Başlat</h2>
                            <button
                                className="modal-close-btn"
                                onClick={() => setShowNewConversationModal(false)}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>
                                    <Phone size={18} />
                                    Telefon Numarası <span className="required">*</span>
                                </label>
                                <input
                                    type="tel"
                                    placeholder="905xxxxxxxxx"
                                    value={newConversationPhone}
                                    onChange={(e) => setNewConversationPhone(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>
                                    <User size={18} />
                                    Müşteri Adı
                                </label>
                                <input
                                    type="text"
                                    placeholder="İsim Soyisim"
                                    value={newConversationName}
                                    onChange={(e) => setNewConversationName(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>
                                    <MessageSquare size={18} />
                                    İlk Mesaj
                                </label>
                                <textarea
                                    placeholder="Merhaba! Size nasıl yardımcı olabilirim?"
                                    value={newConversationMessage}
                                    onChange={(e) => setNewConversationMessage(e.target.value)}
                                    rows={3}
                                />
                            </div>
                            <div className="modal-footer">
                                <button
                                    className="btn-cancel"
                                    onClick={() => setShowNewConversationModal(false)}
                                >
                                    İptal
                                </button>
                                <button
                                    className="btn-submit"
                                    onClick={handleCreateNewConversation}
                                    disabled={!newConversationPhone || creatingConversation}
                                >
                                    {creatingConversation ? 'Oluşturuluyor...' : 'Görüşme Başlat'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Inbox;

