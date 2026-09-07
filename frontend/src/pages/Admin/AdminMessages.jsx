import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, RefreshCw, ChevronDown, Building2, Star, Clock, Search, Paperclip, CheckCircle2, AlertCircle, PlayCircle, XCircle, ExternalLink } from 'lucide-react';
import api from '../../services/api';
import './AdminMessages.css';

const STATUS_CONFIG = {
    OPEN: { label: 'Açık', color: '#f59e0b', bg: '#fffbeb', icon: AlertCircle },
    IN_PROGRESS: { label: 'İşlemde', color: '#3b82f6', bg: '#eff6ff', icon: PlayCircle },
    RESOLVED: { label: 'Çözüldü', color: '#10b981', bg: '#ecfdf5', icon: CheckCircle2 },
    CLOSED: { label: 'Kapalı', color: '#64748b', bg: '#f8fafc', icon: XCircle }
};

const AdminMessages = () => {
    const [conversations, setConversations] = useState([]);
    const [selectedConv, setSelectedConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [replyText, setReplyText] = useState('');
    const [broadcastText, setBroadcastText] = useState('');
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastType, setBroadcastType] = useState('UPDATE');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [broadcasting, setBroadcasting] = useState(false);
    const [showBroadcast, setShowBroadcast] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [updatingStatus, setUpdatingStatus] = useState(false);

    const messagesEndRef = useRef(null);
    const selectedConvRef = useRef(null);
    selectedConvRef.current = selectedConv;

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Tüm workspace'lerdeki sistem sohbetlerini çek
    const fetchConversations = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/system/replies');
            const replies = res.data?.replies || [];

            // Conversation bazında grupla
            const convMap = {};
            for (const msg of replies) {
                const convId = msg.conversationId;
                if (!convMap[convId]) {
                    convMap[convId] = {
                        id: convId,
                        workspaceName: msg.conversation?.workspace?.name || 'Bilinmeyen',
                        workspaceId: msg.conversation?.workspaceId,
                        status: msg.conversation?.status || 'OPEN',
                        messages: [],
                        lastMessageAt: msg.createdAt,
                        unreadCount: 0
                    };
                }
                convMap[convId].messages.push(msg);
            }

            // Ayrıca tüm sistem sohbetlerini çek (mesaj olmasa bile)
            try {
                const allConvRes = await api.get('/system/conversations');
                const allConvs = allConvRes.data?.conversations || [];
                for (const conv of allConvs) {
                    if (!convMap[conv.id]) {
                        convMap[conv.id] = {
                            id: conv.id,
                            workspaceName: conv.workspace?.name || 'Bilinmeyen',
                            workspaceId: conv.workspaceId,
                            status: conv.status || 'OPEN',
                            messages: conv.messages || [],
                            lastMessageAt: conv.lastMessageAt || conv.createdAt,
                            unreadCount: conv.unreadCount || 0
                        };
                    } else {
                        convMap[conv.id].status = conv.status || convMap[conv.id].status || 'OPEN';
                    }
                }
            } catch (e) {
                // conversations endpoint yoksa sessizce devam et
            }

            const convList = Object.values(convMap).sort((a, b) =>
                new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
            );
            setConversations(convList);
        } catch (err) {
            console.error('Admin messages fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { 
        fetchConversations(); 
    }, [fetchConversations]);

    // Real-time socket listener
    useEffect(() => {
        const handleSuperAdminMessage = (event) => {
            const data = event.detail;
            if (!data) return;

            // Eğer şu an açık olan sohbete geldiyse mesaj listesine ekle
            if (selectedConvRef.current?.id === data.conversationId) {
                setMessages(prev => {
                    const alreadyExists = prev.some(m => m.id === data.message?.id);
                    if (alreadyExists) return prev;
                    return [...prev, data.message];
                });
            }

            // Sohbetler listesini canlı güncelle
            setConversations(prev => {
                const index = prev.findIndex(c => c.id === data.conversationId);
                if (index !== -1) {
                    const updated = [...prev];
                    updated[index] = {
                        ...updated[index],
                        lastMessageAt: data.message?.createdAt || new Date().toISOString(),
                        messages: [data.message, ...(updated[index].messages || [])],
                        status: 'OPEN'
                    };
                    return updated.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
                } else {
                    const newConv = {
                        id: data.conversationId,
                        workspaceName: data.workspaceName || 'Yeni Workspace',
                        workspaceId: data.workspaceId,
                        status: 'OPEN',
                        messages: [data.message],
                        lastMessageAt: data.message?.createdAt || new Date().toISOString(),
                        unreadCount: 1
                    };
                    return [newConv, ...prev];
                }
            });
        };

        const handleStatusUpdated = (event) => {
            const data = event.detail;
            if (!data) return;

            setConversations(prev => prev.map(c => {
                if (c.id === data.conversationId) {
                    return { ...c, status: data.status };
                }
                return c;
            }));

            if (selectedConvRef.current?.id === data.conversationId) {
                setSelectedConv(prev => prev ? { ...prev, status: data.status } : prev);
            }
        };

        window.addEventListener('websocket:superadmin_support_message', handleSuperAdminMessage);
        window.addEventListener('websocket:conversation_status_updated', handleStatusUpdated);

        return () => {
            window.removeEventListener('websocket:superadmin_support_message', handleSuperAdminMessage);
            window.removeEventListener('websocket:conversation_status_updated', handleStatusUpdated);
        };
    }, []);

    // Sohbet seçildiğinde tüm mesajları çek
    const selectConversation = async (conv) => {
        setSelectedConv(conv);
        try {
            const res = await api.get(`/system/conversation/${conv.id}/messages`);
            setMessages(res.data?.messages || conv.messages || []);
        } catch (e) {
            setMessages(conv.messages || []);
        }
    };

    // Talep durumunu güncelle
    const handleStatusChange = async (newStatus) => {
        if (!selectedConv || updatingStatus) return;
        setUpdatingStatus(true);
        try {
            await api.patch(`/system/conversation/${selectedConv.id}/status`, { status: newStatus });
            setSelectedConv(prev => ({ ...prev, status: newStatus }));
            setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, status: newStatus } : c));
        } catch (err) {
            console.error('Status update error:', err);
            alert('Durum güncellenemedi: ' + (err.response?.data?.error || err.message));
        } finally {
            setUpdatingStatus(false);
        }
    };

    // Admin yanıt gönder
    const sendReply = async () => {
        if (!replyText.trim() || !selectedConv) return;
        setSending(true);
        try {
            const res = await api.post(`/system/conversation/${selectedConv.id}/reply`, {
                content: replyText.trim()
            });
            const newMsg = res.data?.message;
            if (newMsg) {
                setMessages(prev => [...prev, newMsg]);
            }
            setReplyText('');
            // Listeyi hafifçe güncelle
            setConversations(prev => {
                const idx = prev.findIndex(c => c.id === selectedConv.id);
                if (idx !== -1) {
                    const updated = [...prev];
                    updated[idx] = {
                        ...updated[idx],
                        lastMessageAt: new Date().toISOString()
                    };
                    return updated.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
                }
                return prev;
            });
        } catch (err) {
            console.error('Reply error:', err);
            alert('Yanıt gönderilemedi: ' + (err.response?.data?.error || err.message));
        } finally {
            setSending(false);
        }
    };

    // Duyuru yayınla
    const sendBroadcast = async () => {
        if (!broadcastText.trim()) return;
        setBroadcasting(true);
        try {
            await api.post('/system/broadcast', {
                title: broadcastTitle.trim() || 'Sistem Duyurusu',
                message: broadcastText.trim(),
                type: broadcastType
            });
            setBroadcastText('');
            setBroadcastTitle('');
            setShowBroadcast(false);
            fetchConversations();
            alert('✅ Duyuru tüm workspace\'lere yayınlandı!');
        } catch (err) {
            alert('Duyuru gönderilemedi: ' + (err.response?.data?.error || err.message));
        } finally {
            setBroadcasting(false);
        }
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'Az önce';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}dk`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}sa`;
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
    };

    // Filtreleme
    const filteredConversations = conversations.filter(c => {
        const matchesSearch = c.workspaceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.messages.some(m => m.content?.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesStatus = statusFilter === 'ALL' || (c.status || 'OPEN') === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const currentStatusConfig = STATUS_CONFIG[selectedConv?.status || 'OPEN'] || STATUS_CONFIG.OPEN;
    const StatusIcon = currentStatusConfig.icon;

    return (
        <div className="admin-messages-page">
            <div className="admin-messages-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MessageSquare size={24} style={{ color: '#f59e0b' }} />
                    <div>
                        <h1>Destek ve Sistem Mesajları</h1>
                        <p>Firma kullanıcılarından gelen canlı destek talepleri ve sistem duyuruları</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="admin-msg-btn secondary" onClick={fetchConversations}>
                        <RefreshCw size={14} /> Yenile
                    </button>
                    <button className="admin-msg-btn primary" onClick={() => setShowBroadcast(v => !v)}>
                        <Send size={14} /> Duyuru Yayınla
                    </button>
                </div>
            </div>

            {/* Broadcast panel */}
            {showBroadcast && (
                <div className="admin-broadcast-panel">
                    <h3>📢 Tüm Firmalara Duyuru</h3>
                    <div className="broadcast-form">
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                type="text"
                                placeholder="Duyuru başlığı"
                                value={broadcastTitle}
                                onChange={e => setBroadcastTitle(e.target.value)}
                                className="broadcast-input"
                            />
                            <select value={broadcastType} onChange={e => setBroadcastType(e.target.value)} className="broadcast-select">
                                <option value="UPDATE">🔄 Güncelleme</option>
                                <option value="IMPROVEMENT">✨ İyileştirme</option>
                                <option value="MAINTENANCE">🔧 Bakım</option>
                                <option value="INFO">ℹ️ Bilgi</option>
                            </select>
                        </div>
                        <textarea
                            placeholder="Duyuru mesajını yazın..."
                            value={broadcastText}
                            onChange={e => setBroadcastText(e.target.value)}
                            className="broadcast-textarea"
                            rows={3}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="admin-msg-btn secondary" onClick={() => setShowBroadcast(false)}>İptal</button>
                            <button className="admin-msg-btn primary" onClick={sendBroadcast} disabled={broadcasting || !broadcastText.trim()}>
                                {broadcasting ? 'Gönderiliyor...' : '📢 Yayınla'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="admin-messages-body">
                {/* Sol — sohbet listesi & filtreler */}
                <div className="admin-conv-list">
                    <div className="admin-conv-search-bar">
                        <div className="search-input-wrapper">
                            <Search size={14} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Workspace veya mesaj ara..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="admin-conv-search-input"
                            />
                        </div>
                        <div className="admin-status-filters">
                            <button className={`status-pill ${statusFilter === 'ALL' ? 'active' : ''}`} onClick={() => setStatusFilter('ALL')}>
                                Hepsi ({conversations.length})
                            </button>
                            <button className={`status-pill ${statusFilter === 'OPEN' ? 'active' : ''}`} onClick={() => setStatusFilter('OPEN')}>
                                Açık
                            </button>
                            <button className={`status-pill ${statusFilter === 'IN_PROGRESS' ? 'active' : ''}`} onClick={() => setStatusFilter('IN_PROGRESS')}>
                                İşlemde
                            </button>
                            <button className={`status-pill ${statusFilter === 'RESOLVED' ? 'active' : ''}`} onClick={() => setStatusFilter('RESOLVED')}>
                                Çözüldü
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="admin-conv-empty">
                            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            <span>Yükleniyor...</span>
                        </div>
                    ) : filteredConversations.length === 0 ? (
                        <div className="admin-conv-empty">
                            <MessageSquare size={24} style={{ color: '#94a3b8' }} />
                            <span>Kayıt bulunamadı</span>
                        </div>
                    ) : (
                        filteredConversations.map(conv => {
                            const conf = STATUS_CONFIG[conv.status || 'OPEN'] || STATUS_CONFIG.OPEN;
                            const lastMsg = conv.messages[0] || conv.messages[conv.messages.length - 1];
                            return (
                                <button
                                    key={conv.id}
                                    className={`admin-conv-item ${selectedConv?.id === conv.id ? 'active' : ''}`}
                                    onClick={() => selectConversation(conv)}
                                >
                                    <div className="admin-conv-avatar">
                                        <Building2 size={16} />
                                    </div>
                                    <div className="admin-conv-info">
                                        <div className="admin-conv-name-row">
                                            <span className="admin-conv-name">{conv.workspaceName}</span>
                                            <span className="conv-status-tag" style={{ color: conf.color, backgroundColor: conf.bg }}>
                                                {conf.label}
                                            </span>
                                        </div>
                                        <div className="admin-conv-preview">
                                            {lastMsg?.content?.substring(0, 50) || 'Mesaj yok'}
                                        </div>
                                    </div>
                                    <div className="admin-conv-meta">
                                        <span className="admin-conv-time">{formatTime(conv.lastMessageAt)}</span>
                                        {conv.messages.length > 0 && (
                                            <span className="admin-conv-badge">{conv.messages.length}</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Sağ — mesaj detayları */}
                <div className="admin-msg-detail">
                    {!selectedConv ? (
                        <div className="admin-msg-empty">
                            <Star size={40} style={{ color: '#f59e0b' }} />
                            <h3>Instomer Destek Masası</h3>
                            <p>Sol listeden bir firma seçerek gelen destek taleplerini yanıtlayabilir veya durumunu güncelleyebilirsiniz.</p>
                        </div>
                    ) : (
                        <>
                            <div className="admin-msg-detail-header">
                                <div className="detail-header-left">
                                    <div className="detail-avatar">
                                        <Building2 size={20} />
                                    </div>
                                    <div>
                                        <div className="detail-title-row">
                                            <h3>{selectedConv.workspaceName}</h3>
                                            <span className="conv-status-tag-large" style={{ color: currentStatusConfig.color, backgroundColor: currentStatusConfig.bg }}>
                                                <StatusIcon size={12} />
                                                {currentStatusConfig.label}
                                            </span>
                                        </div>
                                        <span className="detail-meta">
                                            Workspace ID: {selectedConv.workspaceId || selectedConv.id} • {messages.length} mesaj
                                        </span>
                                    </div>
                                </div>

                                <div className="detail-header-actions">
                                    <div className="status-selector-group">
                                        <span className="selector-label">Durum:</span>
                                        <select
                                            className="status-dropdown"
                                            value={selectedConv.status || 'OPEN'}
                                            onChange={(e) => handleStatusChange(e.target.value)}
                                            disabled={updatingStatus}
                                        >
                                            <option value="OPEN">🟡 Açık</option>
                                            <option value="IN_PROGRESS">🔵 İşlemde</option>
                                            <option value="RESOLVED">🟢 Çözüldü</option>
                                            <option value="CLOSED">⚪ Kapalı</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="admin-msg-list">
                                {messages.map((msg, i) => {
                                    const isSystem = msg.isFromContact;
                                    const isImage = msg.mediaUrl && (msg.messageType === 'IMAGE' || /\.(jpg|jpeg|png|webp|gif)$/i.test(msg.mediaUrl));
                                    const isFile = msg.mediaUrl && !isImage;

                                    return (
                                        <div key={msg.id || i} className={`admin-msg-bubble ${isSystem ? 'system' : 'user'}`}>
                                            <div className="admin-msg-sender">
                                                {isSystem ? '⭐ Instomer Destek' : `👤 ${msg.sender?.name || 'Firma Kullanıcısı'}`}
                                            </div>

                                            {isImage && (
                                                <div className="admin-msg-media-preview">
                                                    <img
                                                        src={msg.mediaUrl}
                                                        alt="Ek"
                                                        onClick={() => window.open(msg.mediaUrl, '_blank')}
                                                        className="admin-preview-image"
                                                    />
                                                </div>
                                            )}

                                            {isFile && (
                                                <a
                                                    href={msg.mediaUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="admin-msg-attachment-link"
                                                >
                                                    <Paperclip size={14} />
                                                    <span>Ek Dosyayı İndir / Görüntüle</span>
                                                    <ExternalLink size={12} />
                                                </a>
                                            )}

                                            {msg.content && <div className="admin-msg-content">{msg.content}</div>}

                                            <div className="admin-msg-time">
                                                <Clock size={10} /> {formatTime(msg.createdAt)}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="admin-msg-reply-bar">
                                <input
                                    type="text"
                                    placeholder="Firmaya yanıt yazın... (Enter ile gönder)"
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendReply()}
                                    className="admin-reply-input"
                                />
                                <button
                                    className="admin-msg-btn primary"
                                    onClick={sendReply}
                                    disabled={sending || !replyText.trim()}
                                >
                                    <Send size={14} /> {sending ? '...' : 'Yanıtla'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminMessages;
