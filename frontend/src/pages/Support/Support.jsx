import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { mediaAPI } from '../../services/api';
import {
    Send,
    Paperclip,
    Image as ImageIcon,
    RefreshCw,
    Check,
    Copy,
    HelpCircle,
    MessageSquare,
    Sparkles,
    Bug,
    Lightbulb,
    Settings as SettingsIcon,
    CreditCard,
    ShieldCheck,
    Clock,
    CheckCheck,
    X,
    Bell
} from 'lucide-react';
import './Support.css';

const QUICK_TOPICS = [
    { label: 'Hata Bildirimi', icon: Bug, prefix: '🐛 [Hata Bildirimi]: ' },
    { label: 'Özellik İsteği', icon: Lightbulb, prefix: '💡 [Özellik İsteği]: ' },
    { label: 'Entegrasyon / Kurulum', icon: SettingsIcon, prefix: '⚙️ [Entegrasyon]: ' },
    { label: 'Fatura & Abonelik', icon: CreditCard, prefix: '💳 [Abonelik]: ' },
    { label: 'Genel Soru', icon: HelpCircle, prefix: '❓ [Soru]: ' },
];

export default function Support() {
    const { currentWorkspace, user } = useAuth();
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [announcements, setAnnouncements] = useState([]);
    const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
    const [copiedId, setCopiedId] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadingFile, setUploadingFile] = useState(false);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Destek sohbetini ve duyuruları çek
    const loadSupportData = useCallback(async () => {
        if (!currentWorkspace?.id) return;
        try {
            setLoading(true);
            // 1. Destek Sohbeti
            const res = await api.get(`/system/my-chat/${currentWorkspace.id}`);
            if (res.data?.conversation) {
                setConversation(res.data.conversation);
                setMessages(res.data.conversation.messages || []);
            }

            // 2. Duyurular
            setLoadingAnnouncements(true);
            try {
                const annRes = await api.get('/system/announcements');
                setAnnouncements(annRes.data?.announcements || []);
            } catch (e) {
                console.warn('Announcements fetch error:', e);
            } finally {
                setLoadingAnnouncements(false);
            }
        } catch (err) {
            console.error('Support chat fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [currentWorkspace?.id]);

    useEffect(() => {
        loadSupportData();
    }, [loadSupportData]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Socket.io Gerçek Zamanlı Mesaj Dinleyici
    useEffect(() => {
        const handleNewMessage = (e) => {
            const data = e.detail || e;
            if (data?.conversationId === conversation?.id) {
                setMessages(prev => {
                    if (prev.some(m => m.id === data.message?.id)) return prev;
                    return [...prev, data.message];
                });
            }
        };

        window.addEventListener('websocket:new_message', handleNewMessage);
        return () => window.removeEventListener('websocket:new_message', handleNewMessage);
    }, [conversation?.id]);

    // Hızlı konu çipi seçimi
    const handleSelectQuickTopic = (prefix) => {
        if (inputText.startsWith(prefix)) return;
        setInputText(prefix + inputText.replace(/^[🐛💡⚙️💳❓].*?:\s*/, ''));
    };

    // Dosya seçimi
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    // Mesaj Gönderme
    const handleSendMessage = async (e) => {
        e?.preventDefault();
        if ((!inputText.trim() && !selectedFile) || sending || !currentWorkspace?.id) return;

        setSending(true);
        let mediaUrl = null;
        let mediaType = null;
        let fileName = null;

        try {
            // Varsa dosya yükle
            if (selectedFile) {
                setUploadingFile(true);
                try {
                    const uploadRes = await mediaAPI.upload(currentWorkspace.id, selectedFile);
                    mediaUrl = uploadRes.data?.url || uploadRes.data?.fileUrl;
                    mediaType = selectedFile.type.startsWith('image/') ? 'image' : 'file';
                    fileName = selectedFile.name;
                } catch (uploadErr) {
                    console.error('File upload error:', uploadErr);
                    alert('Dosya yüklenemedi: ' + (uploadErr.response?.data?.error || uploadErr.message));
                    setSending(false);
                    setUploadingFile(false);
                    return;
                }
                setUploadingFile(false);
            }

            const res = await api.post(`/system/my-chat/${currentWorkspace.id}/message`, {
                content: inputText.trim(),
                mediaUrl,
                mediaType,
                fileName
            });

            if (res.data?.message) {
                setMessages(prev => [...prev, res.data.message]);
                setInputText('');
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        } catch (err) {
            console.error('Support message send error:', err);
            alert('Mesaj gönderilemedi: ' + (err.response?.data?.error || err.message));
        } finally {
            setSending(false);
        }
    };

    const handleCopyWorkspaceId = () => {
        if (!currentWorkspace?.id) return;
        navigator.clipboard.writeText(currentWorkspace.id);
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
    };

    const formatMessageTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    };

    const formatMessageDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    const getAnnouncementBadge = (type) => {
        switch (type) {
            case 'UPDATE': return { label: 'Güncelleme', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
            case 'IMPROVEMENT': return { label: 'İyileştirme', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
            case 'MAINTENANCE': return { label: 'Bakım', bg: '#fef3c7', color: '#d97706', border: '#fde68a' };
            default: return { label: 'Duyuru', bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' };
        }
    };

    return (
        <div className="support-container">
            {/* Üst Header */}
            <div className="support-header">
                <div className="support-header-left">
                    <div className="support-icon-badge">
                        <MessageSquare size={24} />
                    </div>
                    <div>
                        <h1 className="support-title">Destek & Talepler</h1>
                        <p className="support-subtitle">
                            Doğrudan Instomer ekibiyle canlı görüşün, hata bildirin veya yeni özellik önerin.
                        </p>
                    </div>
                </div>
                <div className="support-header-right">
                    <div className="support-status-chip">
                        <span className="support-status-dot" />
                        <span className="support-status-text">Canlı Destek Çevrimiçi</span>
                    </div>
                    <button className="support-refresh-btn" onClick={loadSupportData} title="Yenile">
                        <RefreshCw size={15} />
                    </button>
                </div>
            </div>

            {/* Ana 2 Kolonlu Alan */}
            <div className="support-main-layout">
                {/* SOL KOLON: Chat Ekranı */}
                <div className="support-chat-card">
                    {/* Chat Başlığı */}
                    <div className="support-chat-header">
                        <div className="support-agent-info">
                            <div className="support-agent-avatar">
                                <span>IN</span>
                            </div>
                            <div>
                                <div className="support-agent-name">
                                    Instomer Destek Ekibi
                                    <ShieldCheck size={16} className="support-verified-icon" title="Onaylı Destek Hesabı" />
                                </div>
                                <div className="support-agent-meta">
                                    <Clock size={12} />
                                    <span>Ortalama Yanıt Süresi: ~15 dakika</span>
                                </div>
                            </div>
                        </div>

                        {conversation?.status && (
                            <span className={`support-ticket-badge ${conversation.status.toLowerCase()}`}>
                                {conversation.status === 'RESOLVED' ? 'Çözüldü' : conversation.status === 'IN_PROGRESS' ? 'İşlemde' : 'Açık Talep'}
                            </span>
                        )}
                    </div>

                    {/* Hızlı Konu Butonları */}
                    <div className="support-quick-chips">
                        <span className="support-chips-label">Hızlı Konu:</span>
                        {QUICK_TOPICS.map((topic, idx) => {
                            const Icon = topic.icon;
                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    className="support-chip-btn"
                                    onClick={() => handleSelectQuickTopic(topic.prefix)}
                                >
                                    <Icon size={13} />
                                    <span>{topic.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Mesaj Akışı */}
                    <div className="support-messages-area">
                        {loading ? (
                            <div className="support-loading-state">
                                <RefreshCw size={24} className="support-spin" />
                                <span>Destek sohbeti yükleniyor...</span>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="support-empty-state">
                                <MessageSquare size={36} />
                                <h4>Henüz bir mesajınız bulunmuyor</h4>
                                <p>Sorunuzu veya talebinizi aşağıdaki alandan bize iletebilirsiniz.</p>
                            </div>
                        ) : (
                            messages.map((msg, idx) => {
                                const isInstomer = msg.isFromContact;
                                const isSameDay = idx > 0 &&
                                    new Date(messages[idx - 1].createdAt).toDateString() === new Date(msg.createdAt).toDateString();

                                return (
                                    <React.Fragment key={msg.id || idx}>
                                        {!isSameDay && (
                                            <div className="support-date-divider">
                                                <span>{formatMessageDate(msg.createdAt)}</span>
                                            </div>
                                        )}
                                        <div className={`support-message-row ${isInstomer ? 'incoming' : 'outgoing'}`}>
                                            {isInstomer && (
                                                <div className="support-msg-avatar instomer-avatar">
                                                    IN
                                                </div>
                                            )}
                                            <div className="support-message-bubble-wrapper">
                                                <div className="support-msg-sender-name">
                                                    {isInstomer ? 'Instomer Destek' : (msg.sender?.name || user?.name || 'Siz')}
                                                </div>
                                                <div className={`support-message-bubble ${isInstomer ? 'bubble-instomer' : 'bubble-user'}`}>
                                                    {/* Medya/Ek Dosya varsa */}
                                                    {msg.mediaUrl && (
                                                        <div className="support-msg-media">
                                                            {msg.type === 'IMAGE' || msg.mediaUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                                <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="support-media-image-link">
                                                                    <img src={msg.mediaUrl} alt="Ekran Görüntüsü" className="support-media-img" />
                                                                </a>
                                                            ) : (
                                                                <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="support-file-link">
                                                                    <Paperclip size={14} />
                                                                    <span>{msg.fileName || 'Ekli Dosyayı İndir'}</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Metin İçeriği */}
                                                    {msg.content && (
                                                        <div className="support-msg-text">
                                                            {msg.content}
                                                        </div>
                                                    )}

                                                    <div className="support-msg-time">
                                                        <span>{formatMessageTime(msg.createdAt)}</span>
                                                        {!isInstomer && <CheckCheck size={13} className="support-check-icon" />}
                                                    </div>
                                                </div>
                                            </div>
                                            {!isInstomer && (
                                                <div className="support-msg-avatar user-avatar">
                                                    {user?.avatar ? (
                                                        <img src={user.avatar} alt={user.name} />
                                                    ) : (
                                                        <span>{(user?.name || 'U').substring(0, 2).toUpperCase()}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </React.Fragment>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Dosya Seçim Önizleme */}
                    {selectedFile && (
                        <div className="support-selected-file-bar">
                            <div className="support-file-meta">
                                <Paperclip size={14} />
                                <span className="support-file-name">{selectedFile.name}</span>
                                <span className="support-file-size">({Math.round(selectedFile.size / 1024)} KB)</span>
                            </div>
                            <button
                                type="button"
                                className="support-remove-file-btn"
                                onClick={() => {
                                    setSelectedFile(null);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Mesaj Giriş Alanı */}
                    <form className="support-input-form" onSubmit={handleSendMessage}>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                            accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                        />
                        <button
                            type="button"
                            className="support-attach-btn"
                            onClick={() => fileInputRef.current?.click()}
                            title="Dosya veya Ekran Görüntüsü Ekle"
                        >
                            <Paperclip size={18} />
                        </button>
                        <textarea
                            className="support-textarea"
                            placeholder="Mesajınızı, sorunuzu veya hata detaylarını buraya yazın..."
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            rows={1}
                        />
                        <button
                            type="submit"
                            className="support-send-btn"
                            disabled={(!inputText.trim() && !selectedFile) || sending}
                        >
                            {sending ? <RefreshCw size={16} className="support-spin" /> : <Send size={16} />}
                        </button>
                    </form>
                </div>

                {/* SAĞ KOLON: Sistem Duyuruları & Workspace Bilgisi */}
                <div className="support-sidebar">
                    {/* Workspace Kimlik Kartı */}
                    <div className="support-info-card">
                        <div className="support-info-card-header">
                            <ShieldCheck size={18} style={{ color: '#4f46e5' }} />
                            <h3>Firma & Destek Kimliği</h3>
                        </div>
                        <div className="support-info-list">
                            <div className="support-info-item">
                                <span className="info-label">Firma:</span>
                                <span className="info-value">{currentWorkspace?.name || '---'}</span>
                            </div>
                            <div className="support-info-item">
                                <span className="info-label">Destek ID:</span>
                                <div className="info-copy-box">
                                    <code>{currentWorkspace?.id?.substring(0, 18)}...</code>
                                    <button
                                        type="button"
                                        className="copy-btn"
                                        onClick={handleCopyWorkspaceId}
                                        title="Workspace ID Kopyala"
                                    >
                                        {copiedId ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                                    </button>
                                </div>
                            </div>
                            <div className="support-info-item">
                                <span className="info-label">Talep Sahibi:</span>
                                <span className="info-value">{user?.name || user?.email}</span>
                            </div>
                        </div>
                    </div>

                    {/* Sistem Duyuruları Kartı */}
                    <div className="support-announcements-card">
                        <div className="support-announcements-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Sparkles size={18} style={{ color: '#f59e0b' }} />
                                <h3>Sistem Duyuruları & Güncellemeler</h3>
                            </div>
                            <span className="announcement-count">{announcements.length}</span>
                        </div>

                        <div className="support-announcements-list">
                            {loadingAnnouncements ? (
                                <div className="announcements-loading">
                                    <RefreshCw size={18} className="support-spin" />
                                    <span>Duyurular yükleniyor...</span>
                                </div>
                            ) : announcements.length === 0 ? (
                                <div className="announcements-empty">
                                    <Bell size={20} style={{ opacity: 0.4 }} />
                                    <p>Henüz aktif bir sistem duyurusu bulunmuyor.</p>
                                </div>
                            ) : (
                                announcements.map(ann => {
                                    const badge = getAnnouncementBadge(ann.type);
                                    return (
                                        <div key={ann.id} className="support-announcement-item">
                                            <div className="announcement-top">
                                                <span
                                                    className="announcement-type-pill"
                                                    style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                                                >
                                                    {badge.label}
                                                </span>
                                                <span className="announcement-date">
                                                    {new Date(ann.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                                                </span>
                                            </div>
                                            <h4 className="announcement-title">{ann.title}</h4>
                                            <p className="announcement-message">{ann.message}</p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
