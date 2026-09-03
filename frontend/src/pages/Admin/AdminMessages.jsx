import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, RefreshCw, ChevronDown, ChevronRight, Building2, Star, Clock } from 'lucide-react';
import api from '../../services/api';
import './AdminMessages.css';

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
                            messages: [],
                            lastMessageAt: conv.lastMessageAt,
                            unreadCount: conv.unreadCount || 0
                        };
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

    useEffect(() => { fetchConversations(); }, [fetchConversations]);

    // Sohbet seçildiğinde tüm mesajları çek
    const selectConversation = async (conv) => {
        setSelectedConv(conv);
        try {
            const res = await api.get(`/system/conversation/${conv.id}/messages`);
            setMessages(res.data?.messages || conv.messages || []);
        } catch (e) {
            // Mesaj endpoint'i yoksa mevcut mesajları kullan
            setMessages(conv.messages || []);
        }
    };

    // Admin yanıt gönder
    const sendReply = async () => {
        if (!replyText.trim() || !selectedConv) return;
        setSending(true);
        try {
            await api.post(`/system/conversation/${selectedConv.id}/reply`, {
                content: replyText.trim()
            });
            setReplyText('');
            // Mesajları yenile
            await selectConversation(selectedConv);
            fetchConversations();
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

    return (
        <div className="admin-messages-page">
            <div className="admin-messages-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MessageSquare size={24} style={{ color: '#f59e0b' }} />
                    <div>
                        <h1>Mesajlar</h1>
                        <p>Firma kullanıcılarından gelen mesajlar ve duyurular</p>
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
                {/* Sol — sohbet listesi */}
                <div className="admin-conv-list">
                    {loading ? (
                        <div className="admin-conv-empty">
                            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            <span>Yükleniyor...</span>
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="admin-conv-empty">
                            <MessageSquare size={24} style={{ color: '#94a3b8' }} />
                            <span>Henüz mesaj yok</span>
                        </div>
                    ) : (
                        conversations.map(conv => (
                            <button
                                key={conv.id}
                                className={`admin-conv-item ${selectedConv?.id === conv.id ? 'active' : ''}`}
                                onClick={() => selectConversation(conv)}
                            >
                                <div className="admin-conv-avatar">
                                    <Building2 size={16} />
                                </div>
                                <div className="admin-conv-info">
                                    <div className="admin-conv-name">{conv.workspaceName}</div>
                                    <div className="admin-conv-preview">
                                        {conv.messages[0]?.content?.substring(0, 50) || 'Mesaj yok'}
                                    </div>
                                </div>
                                <div className="admin-conv-meta">
                                    <span className="admin-conv-time">{formatTime(conv.lastMessageAt)}</span>
                                    {conv.messages.length > 0 && (
                                        <span className="admin-conv-badge">{conv.messages.length}</span>
                                    )}
                                </div>
                            </button>
                        ))
                    )}
                </div>

                {/* Sağ — mesaj detayları */}
                <div className="admin-msg-detail">
                    {!selectedConv ? (
                        <div className="admin-msg-empty">
                            <Star size={40} style={{ color: '#f59e0b' }} />
                            <h3>Instomer Destek</h3>
                            <p>Firma kullanıcılarından gelen mesajları buradan görebilir ve yanıtlayabilirsiniz.</p>
                        </div>
                    ) : (
                        <>
                            <div className="admin-msg-detail-header">
                                <Building2 size={18} />
                                <span style={{ fontWeight: 700 }}>{selectedConv.workspaceName}</span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {selectedConv.messages.length} mesaj
                                </span>
                            </div>

                            <div className="admin-msg-list">
                                {messages.map((msg, i) => (
                                    <div key={msg.id || i} className={`admin-msg-bubble ${msg.isFromContact ? 'system' : 'user'}`}>
                                        <div className="admin-msg-sender">
                                            {msg.isFromContact ? '⭐ Instomer' : `👤 ${msg.sender?.name || 'Kullanıcı'}`}
                                        </div>
                                        <div className="admin-msg-content">{msg.content}</div>
                                        <div className="admin-msg-time">
                                            <Clock size={10} /> {formatTime(msg.createdAt)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="admin-msg-reply-bar">
                                <input
                                    type="text"
                                    placeholder="Yanıt yazın..."
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
                                    <Send size={14} />
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
