import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { emailAPI, conversationAPI } from '../../services/api';
import { io } from 'socket.io-client';
import { 
    Mail, RefreshCw, Search, Star, Trash2, 
    Clock, Reply, Forward, 
    User, Send, Plus, X, Paperclip, MoreVertical,
    CheckSquare, Square, MinusSquare
} from 'lucide-react';
import './Emails.css';

// Helper function to decode HTML entities
const decodeHtmlEntities = (text) => {
    if (!text) return '';
    
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
};

// Helper function to clean email body - remove CSS, footers and signatures
const cleanEmailContent = (content) => {
    if (!content) return '';
    
    let cleaned = content;
    
    // Remove CSS styles (body { ... }, @media queries, etc.)
    cleaned = cleaned.replace(/body\s*\{[^}]*\}/gi, '');
    cleaned = cleaned.replace(/@media[^{]*\{[^}]*\}/gi, '');
    cleaned = cleaned.replace(/\*\[class\][^{]*\{[^}]*\}/gi, '');
    cleaned = cleaned.replace(/\.[a-z_]+\s*\{[^}]*\}/gi, '');
    cleaned = cleaned.replace(/img\s*,?\s*img\s+a\s*\{[^}]*\}/gi, '');
    cleaned = cleaned.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/gi, '');
    
    // Remove inline style blocks that leaked
    cleaned = cleaned.replace(/[a-z-]+\s*:\s*[^;]+;/gi, (match) => {
        // Only remove if it looks like CSS (has common CSS properties)
        if (/margin|padding|font-family|display|width|height|color|background|border|vertical-align/i.test(match)) {
            return '';
        }
        return match;
    });
    
    // Remove URLs in parentheses like ( https://... )
    cleaned = cleaned.replace(/\(\s*https?:\/\/[^\s)]+\s*\)/gi, '');
    
    // Decode HTML entities
    cleaned = decodeHtmlEntities(cleaned);
    
    // Footer patterns to remove (case insensitive)
    const footerPatterns = [
        /Bu e-posta gizli veya özel olabilir[\s\S]*$/i,
        /Bu e-posta ve ekleri[\s\S]*$/i,
        /Bu mesaj yalnızca[\s\S]*$/i,
        /Gizlilik Bildirimi[\s\S]*$/i,
        /Bu ileti ve ekleri[\s\S]*$/i,
        /This email may be confidential[\s\S]*$/i,
        /This message is intended only[\s\S]*$/i,
        /CONFIDENTIALITY NOTICE[\s\S]*$/i,
        /DISCLAIMER[\s\S]*$/i,
        /Sent from my iPhone[\s\S]*$/i,
        /Sent from my Android[\s\S]*$/i,
        /Learn more[\s\S]*$/i,
        /Meta Platforms, Inc\.[\s\S]*$/i,
    ];
    
    for (const pattern of footerPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }
    
    // Clean up multiple spaces and newlines
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    return cleaned.trim();
};

const Emails = () => {
    const { currentWorkspace } = useAuth();
    const [emailChannels, setEmailChannels] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);
    const [starredEmails, setStarredEmails] = useState([]);
    const messagesEndRef = useRef(null);
    
    // Compose modal state
    const [showCompose, setShowCompose] = useState(false);
    const [composeTo, setComposeTo] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeSending, setComposeSending] = useState(false);
    
    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState([]);
    const [deleting, setDeleting] = useState(false);

    // Scroll to bottom of messages
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Load starred emails from localStorage
    useEffect(() => {
        if (currentWorkspace) {
            const saved = localStorage.getItem(`starred_emails_${currentWorkspace.id}`);
            if (saved) {
                try {
                    setStarredEmails(JSON.parse(saved));
                } catch (e) {
                    console.error('Error loading starred emails:', e);
                }
            }
        }
    }, [currentWorkspace]);

    // Save starred emails to localStorage
    useEffect(() => {
        if (currentWorkspace && starredEmails.length >= 0) {
            localStorage.setItem(`starred_emails_${currentWorkspace.id}`, JSON.stringify(starredEmails));
        }
    }, [starredEmails, currentWorkspace]);

    useEffect(() => {
        if (currentWorkspace) {
            loadEmailChannels();
            loadEmailConversations();
        }
    }, [currentWorkspace]);

    // Auto-sync emails every 60 seconds
    useEffect(() => {
        if (!currentWorkspace || emailChannels.length === 0) return;

        const syncInterval = setInterval(async () => {
            try {
                console.log('🔄 Auto-syncing emails...');
                for (const channel of emailChannels) {
                    await emailAPI.sync(channel.id);
                }
                await loadEmailConversations();
            } catch (error) {
                console.error('Auto-sync error:', error);
            }
        }, 60000);

        return () => clearInterval(syncInterval);
    }, [currentWorkspace, emailChannels]);

    // WebSocket for real-time email notifications
    useEffect(() => {
        if (!currentWorkspace) return;

        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const socket = io(API_URL.replace('/api', ''), {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('📧 Email WebSocket connected');
            socket.emit('join', `workspace:${currentWorkspace.id}`);
        });

        socket.on('new_email', async (data) => {
            console.log('📬 New email received:', data);
            await loadEmailConversations();
        });

        return () => {
            socket.disconnect();
        };
    }, [currentWorkspace]);

    const loadEmailChannels = async () => {
        try {
            const response = await emailAPI.getChannels(currentWorkspace.id);
            const channels = response.data.emailChannels || [];
            setEmailChannels(channels);
        } catch (error) {
            console.error('Error loading email channels:', error);
        }
    };

    const loadEmailConversations = async () => {
        try {
            setLoading(true);
            const response = await conversationAPI.getAll(currentWorkspace.id, { channel: 'EMAIL' });
            setConversations(response.data.conversations || []);
        } catch (error) {
            console.error('Error loading email conversations:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncEmails = async () => {
        if (emailChannels.length === 0) {
            alert('Önce Kanallar sayfasından bir e-posta hesabı bağlamanız gerekiyor.');
            return;
        }

        try {
            setSyncing(true);
            for (const channel of emailChannels) {
                await emailAPI.sync(channel.id);
            }
            await loadEmailConversations();
        } catch (error) {
            console.error('Error syncing emails:', error);
            alert('Senkronizasyon sırasında hata oluştu');
        } finally {
            setSyncing(false);
        }
    };

    const handleSelectEmail = async (conversation) => {
        setSelectedEmail(conversation);
        try {
            const response = await conversationAPI.getById(currentWorkspace.id, conversation.id);
            const conv = response.data.conversation;
            setMessages(conv.messages || []);
            setSelectedEmail(conv);
            
            if (conversation.unreadCount > 0) {
                loadEmailConversations();
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    };

    const handleToggleStar = (e, convId) => {
        e.stopPropagation();
        setStarredEmails(prev => 
            prev.includes(convId) 
                ? prev.filter(id => id !== convId)
                : [...prev, convId]
        );
    };

    const handleDeleteEmail = async () => {
        if (!selectedEmail) return;
        
        if (!confirm('Bu e-postayı silmek istediğinizden emin misiniz?')) return;

        try {
            await conversationAPI.delete(currentWorkspace.id, selectedEmail.id);
            setSelectedEmail(null);
            setMessages([]);
            await loadEmailConversations();
        } catch (error) {
            console.error('Error deleting email:', error);
            alert('E-posta silinemedi');
        }
    };

    // Bulk selection handlers
    const handleToggleSelect = (e, convId) => {
        e.stopPropagation();
        setSelectedIds(prev => 
            prev.includes(convId) 
                ? prev.filter(id => id !== convId)
                : [...prev, convId]
        );
    };

    const handleSelectAll = () => {
        if (selectedIds.length === filteredConversations.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredConversations.map(c => c.id));
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return;
        
        if (!confirm(`${selectedIds.length} e-postayı silmek istediğinizden emin misiniz?`)) return;

        try {
            setDeleting(true);
            for (const id of selectedIds) {
                await conversationAPI.delete(currentWorkspace.id, id);
            }
            
            // Clear selection and refresh
            setSelectedIds([]);
            if (selectedEmail && selectedIds.includes(selectedEmail.id)) {
                setSelectedEmail(null);
                setMessages([]);
            }
            await loadEmailConversations();
        } catch (error) {
            console.error('Error deleting emails:', error);
            alert('Bazı e-postalar silinemedi');
        } finally {
            setDeleting(false);
        }
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !selectedEmail) return;

        try {
            setSending(true);
            await conversationAPI.sendMessage(currentWorkspace.id, selectedEmail.id, {
                content: replyText
            });
            setReplyText('');
            
            const response = await conversationAPI.getById(currentWorkspace.id, selectedEmail.id);
            setMessages(response.data.conversation.messages || []);
        } catch (error) {
            console.error('Error sending reply:', error);
            alert('Yanıt gönderilemedi');
        } finally {
            setSending(false);
        }
    };

    const handleOpenCompose = () => {
        if (emailChannels.length === 0) {
            alert('Önce Kanallar sayfasından bir e-posta hesabı bağlamanız gerekiyor.');
            return;
        }
        setShowCompose(true);
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
    };

    const handleCloseCompose = () => {
        setShowCompose(false);
    };

    const handleSendNewEmail = async () => {
        if (!composeTo.trim() || !composeBody.trim()) {
            alert('Lütfen alıcı ve mesaj alanlarını doldurun.');
            return;
        }

        try {
            setComposeSending(true);
            
            await emailAPI.sendNew(emailChannels[0].id, {
                to: composeTo,
                subject: composeSubject || '(Konu yok)',
                body: composeBody
            });
            
            handleCloseCompose();
            await loadEmailConversations();
            alert('E-posta başarıyla gönderildi!');
        } catch (error) {
            console.error('Error sending email:', error);
            alert('E-posta gönderilemedi. Lütfen tekrar deneyin.');
        } finally {
            setComposeSending(false);
        }
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Dün';
        } else if (diffDays < 7) {
            return date.toLocaleDateString('tr-TR', { weekday: 'short' });
        } else {
            return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        }
    };

    const formatFullDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getEmailSubject = (conv) => {
        const firstMsg = conv?.messages?.[0];
        if (firstMsg?.emailSubject) return firstMsg.emailSubject;
        return conv?.contact?.name || conv?.contact?.email || '(konu yok)';
    };

    const filteredConversations = searchTerm 
        ? conversations.filter(conv => 
            conv.contact?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            conv.contact?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            conv.messages?.[0]?.content?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        : conversations;

    if (!currentWorkspace) {
        return (
            <div className="emails-empty-state">
                <p>Lütfen bir workspace seçin</p>
            </div>
        );
    }

    return (
        <div className="emails-page">
            {/* Compose Modal */}
            {showCompose && (
                <div className="compose-overlay" onClick={handleCloseCompose}>
                    <div className="compose-modal" onClick={e => e.stopPropagation()}>
                        <div className="compose-header">
                            <h3>Yeni E-posta</h3>
                            <button className="compose-close" onClick={handleCloseCompose}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="compose-body">
                            <div className="compose-row">
                                <label>Kimden:</label>
                                <span>{emailChannels[0]?.email}</span>
                            </div>
                            <div className="compose-row">
                                <label>Kime:</label>
                                <input
                                    type="email"
                                    placeholder="alici@example.com"
                                    value={composeTo}
                                    onChange={(e) => setComposeTo(e.target.value)}
                                />
                            </div>
                            <div className="compose-row">
                                <label>Konu:</label>
                                <input
                                    type="text"
                                    placeholder="Konu"
                                    value={composeSubject}
                                    onChange={(e) => setComposeSubject(e.target.value)}
                                />
                            </div>
                            <textarea
                                className="compose-content"
                                placeholder="Mesajınızı yazın..."
                                value={composeBody}
                                onChange={(e) => setComposeBody(e.target.value)}
                            />
                        </div>
                        <div className="compose-footer">
                            <button 
                                className="compose-send"
                                onClick={handleSendNewEmail}
                                disabled={composeSending || !composeTo.trim() || !composeBody.trim()}
                            >
                                <Send size={16} />
                                {composeSending ? 'Gönderiliyor...' : 'Gönder'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sol Panel - E-posta Listesi */}
            <div className="emails-list-panel">
                <div className="emails-list-header">
                    <div className="emails-header-top">
                        <h2>
                            <Mail size={20} />
                            E-postalar
                        </h2>
                        <div className="emails-header-actions">
                            <button 
                                className="btn-icon-small"
                                onClick={handleSyncEmails}
                                disabled={syncing}
                                title="Senkronize Et"
                            >
                                <RefreshCw size={16} className={syncing ? 'spin' : ''} />
                            </button>
                            <button 
                                className="btn-compose"
                                onClick={handleOpenCompose}
                                title="Yeni E-posta"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="emails-search">
                        <Search size={16} className="search-icon" />
                        <input
                            type="text"
                            placeholder="E-posta ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Floating Bulk Actions Bar - Only shows when items are selected */}
                    {selectedIds.length > 0 && (
                        <div className="floating-bulk-bar">
                            <div className="bulk-bar-content">
                                <div className="bulk-bar-left">
                                    <button 
                                        className="bulk-close-btn"
                                        onClick={() => setSelectedIds([])}
                                        title="Seçimi Kaldır"
                                    >
                                        <X size={16} />
                                    </button>
                                    <span className="bulk-count">
                                        <strong>{selectedIds.length}</strong> e-posta seçildi
                                    </span>
                                </div>
                                <div className="bulk-bar-actions">
                                    <button 
                                        className="bulk-select-all-btn"
                                        onClick={handleSelectAll}
                                    >
                                        {selectedIds.length === filteredConversations.length 
                                            ? 'Seçimi Kaldır' 
                                            : `Tümünü Seç (${filteredConversations.length})`}
                                    </button>
                                    <button 
                                        className="bulk-delete-btn"
                                        onClick={handleDeleteSelected}
                                        disabled={deleting}
                                    >
                                        <Trash2 size={16} />
                                        {deleting ? 'Siliniyor...' : 'Sil'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="emails-items">
                    {loading ? (
                        <div className="emails-loading">
                            <RefreshCw size={24} className="spin" />
                            <p>Yükleniyor...</p>
                        </div>
                    ) : filteredConversations.length === 0 ? (
                        <div className="emails-empty">
                            <Mail size={40} />
                            <p>E-posta bulunamadı</p>
                            <button className="btn-sync" onClick={handleSyncEmails}>
                                <RefreshCw size={14} />
                                Senkronize Et
                            </button>
                        </div>
                    ) : (
                        filteredConversations.map((conv) => (
                            <div
                                key={conv.id}
                                className={`email-item ${selectedEmail?.id === conv.id ? 'active' : ''} ${conv.unreadCount > 0 ? 'unread' : ''} ${selectedIds.includes(conv.id) ? 'selected' : ''} ${selectedIds.length > 0 ? 'selection-mode' : ''}`}
                                onClick={() => handleSelectEmail(conv)}
                            >
                                <div 
                                    className={`email-item-selector ${selectedIds.includes(conv.id) ? 'checked' : ''}`}
                                    onClick={(e) => handleToggleSelect(e, conv.id)}
                                >
                                    <div className="selector-circle">
                                        {selectedIds.includes(conv.id) && <CheckSquare size={14} />}
                                    </div>
                                </div>
                                <div className="email-item-avatar">
                                    <User size={18} />
                                </div>
                                <div className="email-item-content">
                                    <div className="email-item-header">
                                        <span className="email-item-sender">
                                            {conv.contact?.name || conv.contact?.email?.split('@')[0] || 'Bilinmeyen'}
                                        </span>
                                        <span className="email-item-time">{formatTime(conv.lastMessageAt)}</span>
                                    </div>
                                    <div className="email-item-subject">
                                        {getEmailSubject(conv)}
                                    </div>
                                    <div className="email-item-preview">
                                        {cleanEmailContent(conv.messages?.[0]?.content)?.substring(0, 80) || '(içerik yok)'}
                                    </div>
                                </div>
                                <div 
                                    className={`email-item-star ${starredEmails.includes(conv.id) ? 'starred' : ''}`}
                                    onClick={(e) => handleToggleStar(e, conv.id)}
                                >
                                    <Star size={16} />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Sağ Panel - E-posta Thread */}
            <div className="email-detail-panel">
                {selectedEmail ? (
                    <>
                        <div className="email-detail-header">
                            <div className="email-detail-info">
                                <div className="email-detail-avatar">
                                    <User size={24} />
                                </div>
                                <div className="email-detail-meta">
                                    <h3>{selectedEmail.contact?.name || selectedEmail.contact?.email?.split('@')[0] || 'Bilinmeyen'}</h3>
                                    <span className="email-detail-address">{selectedEmail.contact?.email}</span>
                                </div>
                            </div>
                            <div className="email-detail-actions">
                                <button 
                                    className={`btn-star ${starredEmails.includes(selectedEmail.id) ? 'starred' : ''}`}
                                    onClick={(e) => handleToggleStar(e, selectedEmail.id)}
                                    title={starredEmails.includes(selectedEmail.id) ? 'Yıldızı Kaldır' : 'Yıldızla'}
                                >
                                    <Star size={18} />
                                </button>
                                <button 
                                    className="btn-delete"
                                    onClick={handleDeleteEmail}
                                    title="Sil"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="email-messages">
                            {messages.map((msg, index) => (
                                <div 
                                    key={msg.id} 
                                    className={`email-message ${msg.isFromContact ? 'incoming' : 'outgoing'}`}
                                >
                                    <div className="email-message-header">
                                        <div className="email-message-sender">
                                            <div className="sender-avatar">
                                                <User size={16} />
                                            </div>
                                            <div className="sender-info">
                                                <span className="sender-name">
                                                    {msg.isFromContact 
                                                        ? (selectedEmail.contact?.name || selectedEmail.contact?.email?.split('@')[0]) 
                                                        : 'Ben'}
                                                </span>
                                                <span className="sender-email">
                                                    {msg.isFromContact 
                                                        ? selectedEmail.contact?.email 
                                                        : emailChannels[0]?.email}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="email-message-time">
                                            {formatFullDate(msg.createdAt)}
                                        </span>
                                    </div>
                                    {msg.emailSubject && index === 0 && (
                                        <div className="email-message-subject">
                                            Konu: {msg.emailSubject}
                                        </div>
                                    )}
                                    <div className="email-message-body">
                                        {cleanEmailContent(msg.content)}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="email-reply-box">
                            <div className="reply-header">
                                <Reply size={16} />
                                <span>Yanıtla: {selectedEmail.contact?.email}</span>
                            </div>
                            <textarea
                                placeholder="Yanıtınızı yazın..."
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendReply();
                                    }
                                }}
                            />
                            <div className="reply-footer">
                                <button 
                                    className="btn-send"
                                    onClick={handleSendReply}
                                    disabled={sending || !replyText.trim()}
                                >
                                    <Send size={16} />
                                    {sending ? 'Gönderiliyor...' : 'Gönder'}
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="email-detail-empty">
                        <Mail size={48} />
                        <h3>E-posta Seçin</h3>
                        <p>Detayları görüntülemek için soldan bir e-posta seçin</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Emails;
