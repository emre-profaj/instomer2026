import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { aiAPI } from '../../services/api';
import './InstoBot.css';

// İnsto Bot Robot SVG Icon
const BotIcon = ({ size = 24 }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
        <path d="m37 17h-10c-4.41 0-8 3.59-8 8s3.59 8 8 8h10c4.41 0 8-3.59 8-8s-3.59-8-8-8zm-11 11c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm12 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
        <path d="m52 20.18v-11.36c1.16-.41 2-1.52 2-2.82 0-1.65-1.35-3-3-3s-3 1.35-3 3c0 1.3.84 2.41 2 2.82v11.18h-1v-.89c0-3.98-2.52-7.42-6.26-8.58-6.48-2-15-2-21.48 0-3.74 1.16-6.26 4.6-6.26 8.58v.89h-1v-11.18c1.16-.41 2-1.52 2-2.82 0-1.65-1.35-3-3-3s-3 1.35-3 3c0 1.3.84 2.41 2 2.82v11.36c-1.16.41-2 1.52-2 2.82v2c0 1.65 1.35 3 3 3h2v.89c0 3.98 2.52 7.42 6.26 8.58.35.11.71.21 1.08.31-.49.3-.93.7-1.29 1.17-.95 1.22-1.28 2.78-.9 4.26l1.78 7.04.2.75.05.21c.55 2.21 2.53 3.76 4.82 3.79v1c0 2.76 2.24 5 5 5s5-2.24 5-5v-1c2.29-.03 4.27-1.58 4.82-3.78l.06-.22.19-.75 1.78-7.03c.38-1.49.05-3.05-.9-4.27-.36-.47-.8-.87-1.29-1.17.37-.1.73-.2 1.08-.31 3.74-1.16 6.26-4.6 6.26-8.58v-.89h2c1.65 0 3-1.35 3-3v-2c0-1.3-.84-2.41-2-2.82zm-39-13.18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm23.93 46h-9.86c-1.3 0-2.44-.81-2.87-2h15.6c-.43 1.19-1.57 2-2.87 2zm4.98-10.28-1.59 6.28h-16.64l-1.59-6.28c-.23-.88-.03-1.81.54-2.54.58-.75 1.46-1.18 2.42-1.18h3.95v1c0 1.65 1.35 3 3 3s3-1.35 3-3v-1h3.95c.96 0 1.84.43 2.42 1.18.57.73.77 1.66.54 2.54zm5.09-21.72v7.89c0 3.05-2 5.79-4.85 6.67-6.11 1.88-14.19 1.88-20.3 0-2.85-.88-4.85-3.62-4.85-6.67v-9.78c0-3.05 2-5.79 4.85-6.67 3.05-.94 6.56-1.44 10.15-1.44s7.1.5 10.15 1.44c2.85.88 4.85 3.62 4.85 6.67zm4-14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
    </svg>
);

const InstoBot = () => {
    const { user, currentWorkspace } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'bot', content: 'Merhaba! 👋 Ben İnsto Bot. Workspace\'iniz hakkında sorular sorabilirsiniz.\n\nÖrnek sorular:\n• Bugün kaç arama yapıldı?\n• Bu hafta kaç yeni müşteri geldi?\n• Agent performansı nasıl?\n• Kaç açık sohbet var?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Determine if user is OWNER
    const workspaceMember = currentWorkspace?.members?.find(m => m.userId === user?.id);
    const isOwner = ['OWNER', 'ADMIN'].includes(workspaceMember?.role) || user?.role === 'SUPER_ADMIN';

    // Auto scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    if (!isOwner || !currentWorkspace?.id) return null;

    const handleSend = async () => {
        const text = input.trim();
        if (!text || loading) return;

        const userMsg = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            // Build history for context (last 10 messages, exclude first welcome)
            const historyForAI = messages.slice(1).map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                content: m.content
            }));

            const res = await aiAPI.instoBotChat(currentWorkspace.id, text, historyForAI);
            const botReply = res.data.reply || res.data.error || 'Yanıt alınamadı.';
            setMessages(prev => [...prev, { role: 'bot', content: botReply }]);
        } catch (err) {
            const errMsg = err.response?.data?.reply || err.response?.data?.error || 'Bir hata oluştu, lütfen tekrar deneyin.';
            setMessages(prev => [...prev, { role: 'bot', content: `⚠️ ${errMsg}` }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const clearChat = () => {
        setMessages([
            { role: 'bot', content: 'Sohbet temizlendi. Size nasıl yardımcı olabilirim? 🤖' }
        ]);
    };

    return (
        <>
            {/* Floating Action Button */}
            <button
                className={`insto-bot-fab ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="İnsto Bot"
            >
                {isOpen ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                ) : (
                    <BotIcon size={28} />
                )}
            </button>

            {/* Chat Window */}
            <div className={`insto-bot-window ${isOpen ? 'open' : ''}`}>
                {/* Header */}
                <div className="insto-bot-header">
                    <div className="insto-bot-header-info">
                        <div className="insto-bot-avatar">
                            <BotIcon size={22} />
                        </div>
                        <div>
                            <h4>İnsto Bot</h4>
                            <span className="insto-bot-status">
                                <span className="status-dot-green" /> Aktif
                            </span>
                        </div>
                    </div>
                    <div className="insto-bot-header-actions">
                        <button onClick={clearChat} title="Sohbeti Temizle" className="insto-bot-clear-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </button>
                        <button onClick={() => setIsOpen(false)} className="insto-bot-close-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="insto-bot-messages">
                    {messages.map((msg, i) => (
                        <div key={i} className={`insto-bot-msg ${msg.role}`}>
                            {msg.role === 'bot' && (
                                <div className="msg-avatar">
                                    <BotIcon size={16} />
                                </div>
                            )}
                            <div className="msg-bubble">
                                {msg.content.split('\n').map((line, j) => (
                                    <span key={j}>{line}<br /></span>
                                ))}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="insto-bot-msg bot">
                            <div className="msg-avatar">
                                <BotIcon size={16} />
                            </div>
                            <div className="msg-bubble typing">
                                <span className="dot" />
                                <span className="dot" />
                                <span className="dot" />
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="insto-bot-input-area">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Bir soru sorun..."
                        disabled={loading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="insto-bot-send-btn"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
            </div>
        </>
    );
};

export default InstoBot;
