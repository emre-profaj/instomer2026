import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { aiAPI } from '../../services/api';
import './Insta.css';

const Insta = () => {
    const { user, currentWorkspace } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'wizard' | 'health'
    const [isThinking, setIsThinking] = useState(false);
    
    // Chat state
    const [messages, setMessages] = useState([
        {
            role: 'bot',
            content: 'Merhaba! Ben Insta 👋\n\nInstomer Workspace Mimarı ve Yapılandırıcısıyım. Yeni müşteri kurulumu yapabilir, doğal dil komutlarıyla fiyat ve ürünleri topluca güncelleyebilir, AI ajanlarının promptlarını revize edebilirim.\n\nÖrnek: "Fiyatları %20 artır", "VIP Cilt Bakımı ekle (1.500 TL)", "Satış botunun üslubunu güncelle"'
        }
    ]);
    const [input, setInput] = useState('');
    const [pendingAction, setPendingAction] = useState(null); // Action card (e.g. price diff)
    const [actionLoading, setActionLoading] = useState(false);

    // Wizard state
    const [wizardUrl, setWizardUrl] = useState('');
    const [wizardFile, setWizardFile] = useState(null);
    const [wizardLoading, setWizardLoading] = useState(false);
    const [wizardProgress, setWizardProgress] = useState({ text: '', pct: 0 });
    const [extractedData, setExtractedData] = useState(null);
    const [applyingSetup, setApplyingSetup] = useState(false);

    // Health state
    const [healthData, setHealthData] = useState(null);
    const [healthLoading, setHealthLoading] = useState(false);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);

    // Sadece SUPER_ADMIN kullanıcısına görünsün
    const isAuthorized = user?.role === 'SUPER_ADMIN';

    // Global event listener to activate/toggle Insta from any screen or Sidebar
    useEffect(() => {
        const handleOpenInsta = (e) => {
            if (e.detail?.action === 'toggle') {
                setIsOpen(prev => !prev);
            } else {
                setIsOpen(true);
            }
            if (e.detail?.tab) {
                setActiveTab(e.detail.tab);
            }
        };
        window.addEventListener('open-insta', handleOpenInsta);
        return () => window.removeEventListener('open-insta', handleOpenInsta);
    }, []);

    // Broadcast open/close state so Sidebar kutucuğu can highlight active state
    useEffect(() => {
        if (isOpen) {
            window.dispatchEvent(new CustomEvent('insta-opened'));
        } else {
            window.dispatchEvent(new CustomEvent('insta-closed'));
        }
    }, [isOpen]);

    // Workspace değiştiğinde Insta'yı o workspace'e özel sıfırla
    useEffect(() => {
        if (!currentWorkspace?.id) return;
        setMessages([
            {
                role: 'bot',
                content: `Merhaba! Ben Insta 👋\n\n"${currentWorkspace.name || 'Workspace'}" için hazırım. Yeni müşteri kurulumu yapabilir, doğal dil komutlarıyla fiyat ve ürünleri topluca güncelleyebilir, AI ajanlarının promptlarını revize edebilirim.\n\nÖrnek: "Fiyatları %20 artır", "VIP Cilt Bakımı ekle (1.500 TL)", "Satış botunun üslubunu güncelle"`
            }
        ]);
        setPendingAction(null);
        setExtractedData(null);
        setInput('');
    }, [currentWorkspace?.id]);

    // Auto scroll chat
    useEffect(() => {
        if (activeTab === 'chat') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, pendingAction, activeTab]);

    // Focus input
    useEffect(() => {
        if (isOpen && activeTab === 'chat') {
            setTimeout(() => inputRef.current?.focus(), 250);
        }
    }, [isOpen, activeTab]);

    // Load health on tab change
    const loadHealth = useCallback(async () => {
        if (!currentWorkspace?.id) return;
        setHealthLoading(true);
        try {
            const res = await aiAPI.instaGetHealth(currentWorkspace.id);
            setHealthData(res.data);
        } catch (err) {
            console.error('Health fetch error:', err);
        } finally {
            setHealthLoading(false);
        }
    }, [currentWorkspace?.id]);

    useEffect(() => {
        if (activeTab === 'health' && isOpen) {
            loadHealth();
        }
    }, [activeTab, isOpen, loadHealth]);

    if (!isAuthorized || !currentWorkspace?.id) return null;

    // ─── CHAT ACTIONS ──────────────────────────────────────────────────

    const handleSend = async (overrideText = null) => {
        const text = (overrideText || input).trim();
        if (!text || isThinking) return;

        const userMsg = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        if (!overrideText) setInput('');
        setIsThinking(true);

        try {
            const history = messages.slice(1).map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                content: m.content
            }));

            const res = await aiAPI.instaChat(currentWorkspace.id, text, history);
            const botReply = res.data.reply || 'İşlem tamamlandı.';

            setMessages(prev => [...prev, { role: 'bot', content: botReply }]);

            // If an action card is present (e.g. price diff confirmation)
            if (res.data.actionCard) {
                setPendingAction(res.data.actionCard);
            }
        } catch (err) {
            const errMsg = err.response?.data?.reply || err.response?.data?.error || 'Bir hata oluştu.';
            setMessages(prev => [...prev, { role: 'bot', content: `⚠️ ${errMsg}` }]);
        } finally {
            setIsThinking(false);
        }
    };

    const handleConfirmAction = async () => {
        if (!pendingAction) return;
        setActionLoading(true);

        try {
            if (pendingAction.actionType === 'PRICE_UPDATE_PREVIEW') {
                const payload = {
                    percentage: pendingAction.percentage,
                    fixedAmount: pendingAction.fixedAmount,
                    categoryName: pendingAction.categoryName !== 'Tümü' ? pendingAction.categoryName : undefined,
                    productIds: pendingAction.items?.map(i => i.id)
                };

                const res = await aiAPI.instaApplyAction(currentWorkspace.id, 'PRICE_UPDATE', payload);
                setPendingAction(null);
                setMessages(prev => [
                    ...prev,
                    {
                        role: 'bot',
                        content: `🎉 **${res.data.message || 'Fiyatlar başarıyla güncellendi!'}**\n\nBase ekranındaki ürün ve hizmet tarifeleri ve AI botların teklif vereceği fiyatlar anında senkronize edildi.`
                    }
                ]);
            }
        } catch (err) {
            alert('Güncelleme uygulanamadı: ' + (err.response?.data?.error || err.message));
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelAction = () => {
        setPendingAction(null);
        setMessages(prev => [...prev, { role: 'bot', content: 'İşlem iptal edildi. Fiyatlarda herhangi bir değişiklik yapılmadı.' }]);
    };

    // ─── WIZARD ACTIONS ────────────────────────────────────────────────

    const handleAnalyzeSource = async () => {
        if (!wizardUrl.trim() && !wizardFile) {
            return alert('Lütfen bir web sitesi adresi girin veya dosya seçin.');
        }

        setWizardLoading(true);
        setIsThinking(true);
        setExtractedData(null);
        setWizardProgress({ text: 'Kaynak taranıyor ve analiz ediliyor...', pct: 25 });

        try {
            let data;
            if (wizardFile) {
                data = new FormData();
                data.append('file', wizardFile);
            } else {
                data = { url: wizardUrl.trim() };
            }

            const timer1 = setTimeout(() => setWizardProgress({ text: 'Kategoriler ve ürünler çıkarılıyor...', pct: 60 }), 1500);
            const timer2 = setTimeout(() => setWizardProgress({ text: 'Fiyatlar ve şubeler yapılandırılıyor...', pct: 90 }), 3500);

            const res = await aiAPI.instaAnalyzeSource(currentWorkspace.id, data);
            clearTimeout(timer1);
            clearTimeout(timer2);

            setWizardProgress({ text: 'Tamamlandı!', pct: 100 });
            setExtractedData(res.data.extracted);
        } catch (err) {
            alert('Tarama hatası: ' + (err.response?.data?.error || err.message));
        } finally {
            setWizardLoading(false);
            setIsThinking(false);
        }
    };

    const handleApplySetup = async () => {
        if (!extractedData) return;
        setApplyingSetup(true);

        try {
            const res = await aiAPI.instaApplySetup(currentWorkspace.id, extractedData);
            alert(res.data.message || 'Kurulum başarıyla tamamlandı!');
            setExtractedData(null);
            setWizardUrl('');
            setWizardFile(null);
            setActiveTab('chat');
            setMessages(prev => [
                ...prev,
                {
                    role: 'bot',
                    content: `🚀 **Müşteri Kurulumu Başarıyla Tamamlandı!**\n\n• Şirket Bilgileri: ${res.data.results?.companyUpdated ? 'Güncellendi' : '-'}\n• Oluşturulan Şubeler: ${res.data.results?.branchesCreated || 0}\n• Oluşturulan Kategoriler: ${res.data.results?.categoriesCreated || 0}\n• Eklenen Ürün/Hizmetler: ${res.data.results?.productsCreated || 0}\n• Bilgi Bankası Notları: ${res.data.results?.kbCreated || 0}\n\nBase sayfasını yenileyerek tüm verileri inceleyebilirsiniz.`
                }
            ]);
        } catch (err) {
            alert('Kurulum kaydedilemedi: ' + (err.response?.data?.error || err.message));
        } finally {
            setApplyingSetup(false);
        }
    };

    return (
        <>
            {/* SLIDE-OVER DRAWER (Sol altta Chat üzerindeki kutucuktan açılır) */}
            <div className={`insta-drawer ${isOpen ? 'open' : ''}`}>
                
                {/* Header */}
                <div className="insta-drawer-header">
                    <div className="insta-drawer-header-left">
                        <div className="insta-header-orb">
                            <div className="insta-header-orb-dot" />
                        </div>
                        <div>
                            <h3 className="insta-drawer-title">
                                INSTA
                                <span className="insta-badge-role">AI ARCHITECT</span>
                            </h3>
                            <p className="insta-drawer-subtitle">Kurulum Sihirbazı, Doğal Dil Fiyat & Ajan Yapılandırıcı</p>
                        </div>
                    </div>
                    <button className="insta-btn-close" onClick={() => setIsOpen(false)}>✕</button>
                </div>

                {/* Tabs */}
                <div className="insta-drawer-tabs">
                    <button
                        className={`insta-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                        onClick={() => setActiveTab('chat')}
                    >
                        💬 Asistan & Komutlar
                    </button>
                    <button
                        className={`insta-tab-btn ${activeTab === 'wizard' ? 'active' : ''}`}
                        onClick={() => setActiveTab('wizard')}
                    >
                        🚀 Kurulum Sihirbazı
                    </button>
                    <button
                        className={`insta-tab-btn ${activeTab === 'health' ? 'active' : ''}`}
                        onClick={() => setActiveTab('health')}
                    >
                        📊 Sağlık & Eksikler
                    </button>
                </div>

                {/* TAB 1: CHAT & ACTIONS */}
                {activeTab === 'chat' && (
                    <div className="insta-tab-content">
                        <div className="insta-messages-wrap">
                            {messages.map((m, idx) => (
                                <div key={idx} className={`insta-msg ${m.role}`}>
                                    {m.role === 'bot' && (
                                        <div className="insta-msg-avatar">
                                            <div className="insta-msg-avatar-dot" />
                                        </div>
                                    )}
                                    <div className="insta-msg-bubble">
                                        {m.content.split('\n').map((line, lidx) => (
                                            <span key={lidx}>{line}<br /></span>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {/* Action Confirmation Card (e.g. Price Diff) */}
                            {pendingAction && (
                                <div className="insta-action-card">
                                    <div className="insta-action-card-header">
                                        <span>⚡ Eylem Onayı (Diff Card)</span>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{pendingAction.totalProducts} Ürün</span>
                                    </div>
                                    <p style={{ fontSize: 12, margin: 0, color: '#cbd5e1' }}>
                                        {pendingAction.percentage ? `%${pendingAction.percentage} oranında fiyat artışı hesaplandı.` : 'Fiyat güncellemesi hesaplandı.'}
                                    </p>

                                    <div style={{ maxHeight: 160, overflowY: 'auto', background: 'rgba(5,7,13,0.7)', borderRadius: 8, padding: 6 }}>
                                        <table className="insta-diff-table">
                                            <thead>
                                                <tr>
                                                    <th>Ürün</th>
                                                    <th>Eski</th>
                                                    <th>Yeni</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pendingAction.items?.map(item => (
                                                    <tr key={item.id}>
                                                        <td style={{ color: '#fff', fontWeight: 500 }}>{item.name}</td>
                                                        <td style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{item.oldPrice} TL</td>
                                                        <td style={{ color: '#34d399', fontWeight: 700 }}>{item.newPrice} TL</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="insta-action-buttons">
                                        <button className="insta-btn-cancel" onClick={handleCancelAction} disabled={actionLoading}>
                                            İptal
                                        </button>
                                        <button className="insta-btn-confirm" onClick={handleConfirmAction} disabled={actionLoading}>
                                            {actionLoading ? 'Güncelleniyor...' : '✓ Onayla & Uygula'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isThinking && (
                                <div className="insta-msg bot">
                                    <div className="insta-msg-avatar">
                                        <div className="insta-msg-avatar-dot" />
                                    </div>
                                    <div className="insta-msg-bubble" style={{ fontStyle: 'italic', color: '#94a3b8' }}>
                                        Insta düşünüyor ve veritabanını tarıyor...
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Quick Prompts */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 6 }}>
                            <button
                                onClick={() => handleSend('Fiyatları %20 artır')}
                                style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                            >
                                📈 "Fiyatları %20 artır"
                            </button>
                            <button
                                onClick={() => handleSend('Tüm ürünleri ve fiyatlarını listele')}
                                style={{ background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                            >
                                📋 "Ürünleri listele"
                            </button>
                            <button
                                onClick={() => handleSend('Satış botunun promptunu güncelle, randevu odaklı ve kibar olsun')}
                                style={{ background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                            >
                                🤖 "Bot promptunu güncelle"
                            </button>
                        </div>

                        {/* Chat Input */}
                        <div className="insta-chat-input-row">
                            <input
                                ref={inputRef}
                                className="insta-chat-input"
                                type="text"
                                placeholder="Örn: Fiyatları %20 artır veya Cilt Bakımını 1200 TL yap..."
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                disabled={isThinking}
                            />
                            <button
                                className="insta-btn-send"
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isThinking}
                            >
                                ➤
                            </button>
                        </div>
                    </div>
                )}

                {/* TAB 2: SETUP WIZARD */}
                {activeTab === 'wizard' && (
                    <div className="insta-tab-content">
                        <div className="insta-wizard-card">
                            <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#ffffff' }}>
                                🚀 Müşteri İlk Kurulum Sihirbazı
                            </h4>
                            <p style={{ fontSize: 11.5, color: '#94a3b8', margin: 0 }}>
                                Müşterinin web sitesini tarayarak veya katalog/fiyat PDF'i yükleyerek şirket profili, şubeler, kategoriler ve fiyatları tek seferde sisteme aktarın.
                            </p>
                        </div>

                        <div className="insta-wizard-card">
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                                1. Web Sitesi URL'si
                            </label>
                            <input
                                type="text"
                                className="insta-chat-input"
                                placeholder="https://www.firma.com"
                                value={wizardUrl}
                                onChange={e => setWizardUrl(e.target.value)}
                            />

                            <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b' }}>— VEYA —</div>

                            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                                2. Katalog / Fiyat Listesi Dosyası (PDF, Word, TXT)
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.docx,.doc,.txt"
                                style={{ display: 'none' }}
                                onChange={e => setWizardFile(e.target.files[0] || null)}
                            />
                            <div className="insta-dropzone" onClick={() => fileInputRef.current?.click()}>
                                <div style={{ fontSize: 24, marginBottom: 4 }}>📄</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                                    {wizardFile ? wizardFile.name : 'Dosya Seçmek İçin Tıklayın'}
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b' }}>
                                    {wizardFile ? `${(wizardFile.size / 1024).toFixed(1)} KB` : 'PDF, Word veya Metin belgesi'}
                                </div>
                            </div>

                            <button
                                className="insta-btn-confirm"
                                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                                onClick={handleAnalyzeSource}
                                disabled={wizardLoading || (!wizardUrl.trim() && !wizardFile)}
                            >
                                {wizardLoading ? 'Kaynaktan Veriler Çıkarılıyor...' : '⚡ Tara & Verileri Çıkar'}
                            </button>
                        </div>

                        {wizardLoading && (
                            <div style={{ background: 'rgba(5,7,13,0.8)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#f87171', marginBottom: 6 }}>
                                    <span>{wizardProgress.text}</span>
                                    <span>{wizardProgress.pct}%</span>
                                </div>
                                <div style={{ width: '100%', height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{ width: `${wizardProgress.pct}%`, height: '100%', background: '#ef4444', transition: 'width 0.3s' }} />
                                </div>
                            </div>
                        )}

                        {extractedData && (
                            <div className="insta-wizard-card" style={{ borderColor: 'rgba(16,185,129,0.4)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>✓ Tespit Edilen Veriler</span>
                                    <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.2)', color: '#34d399', padding: '2px 8px', borderRadius: 10 }}>HAZIR</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                                    <div style={{ background: 'rgba(5,7,13,0.6)', padding: 8, borderRadius: 6 }}>
                                        <span style={{ color: '#64748b', display: 'block', fontSize: 10 }}>Şirket Adı</span>
                                        <strong>{extractedData.companyInfo?.name || '-'}</strong>
                                    </div>
                                    <div style={{ background: 'rgba(5,7,13,0.6)', padding: 8, borderRadius: 6 }}>
                                        <span style={{ color: '#64748b', display: 'block', fontSize: 10 }}>Şube Sayısı</span>
                                        <strong>{extractedData.branches?.length || 0} Şube</strong>
                                    </div>
                                    <div style={{ background: 'rgba(5,7,13,0.6)', padding: 8, borderRadius: 6 }}>
                                        <span style={{ color: '#64748b', display: 'block', fontSize: 10 }}>Kategoriler</span>
                                        <strong>{extractedData.categories?.length || 0} Kategori</strong>
                                    </div>
                                    <div style={{ background: 'rgba(5,7,13,0.6)', padding: 8, borderRadius: 6 }}>
                                        <span style={{ color: '#64748b', display: 'block', fontSize: 10 }}>Ürün / Hizmetler</span>
                                        <strong style={{ color: '#f87171' }}>{extractedData.products?.length || 0} Hizmet (Fiyatlı)</strong>
                                    </div>
                                </div>

                                <button
                                    className="insta-btn-confirm"
                                    style={{ width: '100%', justifyContent: 'center', padding: '10px', background: '#10b981' }}
                                    onClick={handleApplySetup}
                                    disabled={applyingSetup}
                                >
                                    {applyingSetup ? 'Kaydediliyor...' : '✨ Tüm Bilgileri Doğrudan Base\'e Kaydet'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 3: HEALTH & ANALYTICS */}
                {activeTab === 'health' && (
                    <div className="insta-tab-content">
                        <div className="insta-health-score-card">
                            <div>
                                <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Workspace Sağlık Skoru</span>
                                <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981', fontFamily: 'monospace', marginTop: 2 }}>
                                    {healthData?.score || 100} / 100
                                </div>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0 0' }}>
                                    AI ajanlar ve sistem randevu/satış yapmaya hazır.
                                </p>
                            </div>
                            <div className="insta-score-orb">
                                {healthData?.score || 100}%
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                                Eksikler & İyileştirme Fırsatları
                            </span>

                            {healthLoading && <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 20 }}>Taranıyor...</div>}

                            {!healthLoading && healthData?.issues?.length === 0 && (
                                <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: 12, fontSize: 12, color: '#34d399' }}>
                                    ✓ Harika! Workspace bilgileriniz ve ürün tarifeleriniz eksiksiz görünüyor.
                                </div>
                            )}

                            {!healthLoading && healthData?.issues?.map((iss, i) => (
                                <div
                                    key={i}
                                    style={{
                                        background: iss.type === 'danger' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                        border: `1px solid ${iss.type === 'danger' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
                                        borderRadius: 8,
                                        padding: 10,
                                        fontSize: 11.5
                                    }}
                                >
                                    <div style={{ fontWeight: 600, color: iss.type === 'danger' ? '#fca5a5' : '#fcd34d' }}>
                                        {iss.type === 'danger' ? '❌ ' : '⚠️ '} {iss.text}
                                    </div>
                                    {iss.items && (
                                        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>
                                            Örnekler: {iss.items.join(', ')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </>
    );
};

export default Insta;
