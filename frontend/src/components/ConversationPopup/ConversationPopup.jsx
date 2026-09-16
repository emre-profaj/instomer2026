import React, { useState, useEffect, useRef } from 'react';
import { Check, CheckCheck, AlertCircle } from 'lucide-react';
import { conversationAPI } from '../../services/api';
import './ConversationPopup.css';

const CHANNEL_CONFIG = {
    WHATSAPP: { icon: '💬', label: 'WhatsApp', color: '#25D366' },
    INSTAGRAM: { icon: '📱', label: 'Instagram', color: '#E4405F' },
    FACEBOOK: { icon: '📘', label: 'Facebook', color: '#1877F2' },
    EMAIL: { icon: '📧', label: 'Email', color: '#4285F4' },
    WIDGET: { icon: '🌐', label: 'Web', color: '#FF9800' },
    PHONE: { icon: '📞', label: 'Telefon', color: '#F44336' },
    LEAD: { icon: '📋', label: 'Lead', color: '#9C27B0' },
    FORM: { icon: '📝', label: 'Form', color: '#607D8B' },
    UNKNOWN: { icon: '💬', label: 'Mesaj', color: '#78909C' }
};

export default function ConversationPopup({ workspaceId, conversationId, channel, onClose }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef(null);
    const channelInfo = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.UNKNOWN;

    useEffect(() => {
        loadMessages();
    }, [conversationId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadMessages = async () => {
        try {
            setLoading(true);
            const res = await conversationAPI.getById(workspaceId, conversationId);
            setMessages(res.data.conversation?.messages || []);
        } catch (err) {
            console.error('Popup messages error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="conv-popup-overlay" onClick={onClose}>
            <div className="conv-popup-modal" onClick={e => e.stopPropagation()}>
                <div className="conv-popup-header" style={{ borderColor: channelInfo.color }}>
                    <span className="conv-popup-channel-icon">{channelInfo.icon}</span>
                    <span className="conv-popup-channel-label">{channelInfo.label} Yazışması</span>
                    <button className="conv-popup-close" onClick={onClose}>✕</button>
                </div>
                <div className="conv-popup-messages">
                    {loading ? (
                        <div className="conv-popup-loading">Yükleniyor...</div>
                    ) : messages.length === 0 ? (
                        <div className="conv-popup-empty">Mesaj yok</div>
                    ) : (
                        messages.map(msg => (
                            <div key={msg.id} className={`conv-popup-msg ${msg.isFromContact ? 'incoming' : 'outgoing'}`}>
                                <div className="conv-popup-msg-content">
                                    {msg.mediaUrl && (
                                        <div className="conv-popup-media">
                                            {msg.mediaType?.startsWith('image') ? (
                                                <img src={msg.mediaUrl} alt="" />
                                            ) : msg.mediaType?.startsWith('video') ? (
                                                <video src={msg.mediaUrl} controls />
                                            ) : msg.mediaType?.startsWith('audio') ? (
                                                <audio src={msg.mediaUrl} controls />
                                            ) : (
                                                <a href={msg.mediaUrl} target="_blank" rel="noreferrer">📎 Dosya</a>
                                            )}
                                        </div>
                                    )}
                                    <p>{msg.content?.replace(/\[HANDOFF\]/gi, '').trim()}</p>
                                </div>
                                <span className="conv-popup-msg-time" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    {new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                    {!msg.isFromContact && !msg.senderId && ' 🤖'}
                                    {!msg.isFromContact && (
                                        <span className="conv-popup-msg-status" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 2 }}>
                                            {msg.status === 'READ' ? (
                                                <CheckCheck size={13} style={{ color: '#3b82f6' }} title="Müşteri Tarafından Okundu" />
                                            ) : msg.status === 'DELIVERED' ? (
                                                <CheckCheck size={13} style={{ color: '#94a3b8' }} title="Karşı Tarafa İletildi" />
                                            ) : msg.status === 'FAILED' ? (
                                                <AlertCircle size={13} style={{ color: '#ef4444' }} title="Mesaj Gönderilemedi" />
                                            ) : (
                                                <Check size={13} style={{ color: '#94a3b8' }} title="Mesaj Gönderildi" />
                                            )}
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>
        </div>
    );
}
