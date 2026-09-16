import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { aiAPI, retellAPI, automationAPI } from '../../services/api';
import BotModal from '../../components/Settings/BotModal';
import RetellSettings from '../../components/Settings/RetellSettings';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import {
    Sparkles,
    Bot,
    Phone,
    Plus,
    Trash2,
    Settings,
    BookOpen,
    CheckCircle2,
    Zap,
    ExternalLink,
    X,
    MessageSquare,
    AlertCircle,
    Layers,
    Cpu
} from 'lucide-react';
import './AIAgents.css';

const AIAgents = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [activeTab, setActiveTab] = useState('all'); // all | chat | voice
    const [loading, setLoading] = useState(true);

    // Bots
    const [bots, setBots] = useState([]);
    const [retellAgents, setRetellAgents] = useState([]);
    const [automationsList, setAutomationsList] = useState([]);

    // Modals
    const [botModal, setBotModal] = useState({ isOpen: false, bot: null });
    const [createBotModal, setCreateBotModal] = useState(false);
    const [newBotName, setNewBotName] = useState('');
    const [newBotRole, setNewBotRole] = useState('AI Asistan');
    const [showRetellModal, setShowRetellModal] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    useEffect(() => {
        if (workspaceId) {
            loadAllAgents();
        }
    }, [workspaceId]);

    const loadAllAgents = async () => {
        try {
            setLoading(true);
            const [botsRes, retellRes, automationsRes] = await Promise.all([
                aiAPI.getBots(workspaceId).catch(() => ({ data: { bots: [] } })),
                retellAPI.getAgents(workspaceId).catch(() => ({ data: { agents: [] } })),
                automationAPI.getAutomations(workspaceId).catch(() => ({ data: { automations: [] } }))
            ]);

            const loadedBots = botsRes.data?.bots ?? (Array.isArray(botsRes.data) ? botsRes.data : []);
            const loadedRetell = retellRes.data?.agents ?? (Array.isArray(retellRes.data) ? retellRes.data : []);
            const loadedAutomations = automationsRes.data?.automations ?? (Array.isArray(automationsRes.data) ? automationsRes.data : []);

            setBots(Array.isArray(loadedBots) ? loadedBots : []);
            setRetellAgents(Array.isArray(loadedRetell) ? loadedRetell : []);
            setAutomationsList(Array.isArray(loadedAutomations) ? loadedAutomations : []);
        } catch (err) {
            console.error('Error loading AI agents:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateChatBot = async (e) => {
        e.preventDefault();
        if (!newBotName.trim()) return;

        try {
            const res = await aiAPI.createBot(workspaceId, {
                name: newBotName.trim(),
                role: newBotRole.trim() || 'AI Asistan',
                prompt: 'Sen yardımsever, kibar ve kurumsal bir müşteri temsilcisisin. Bilgi bankasındaki verilere dayanarak müşterilerin sorularını yanıtla.',
                botType: 'CHATS'
            });

            setCreateBotModal(false);
            setNewBotName('');
            setNewBotRole('AI Asistan');
            await loadAllAgents();

            if (res.data?.bot) {
                setBotModal({ isOpen: true, bot: res.data.bot });
            }
        } catch (err) {
            alert('Bot oluşturulamadı: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleDeleteBot = (bot) => {
        setConfirmModal({
            isOpen: true,
            title: 'Asistanı Sil',
            message: `"${bot.name}" adlı AI asistanını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
            onConfirm: async () => {
                try {
                    await aiAPI.deleteBot(workspaceId, bot.id);
                    await loadAllAgents();
                    setBotModal({ isOpen: false, bot: null });
                } catch (err) {
                    alert('Asistan silinemedi: ' + (err.response?.data?.error || err.message));
                }
            }
        });
    };

    const handleDeleteRetellAgent = (agent) => {
        const agentId = agent.agent_id || agent.id;
        const agentName = agent.agent_name || agent.name || 'Sesli Asistan';
        setConfirmModal({
            isOpen: true,
            title: 'Sesli Asistanı Sil',
            message: `"${agentName}" adlı AI Call asistanını silmek istediğinize emin misiniz?`,
            onConfirm: async () => {
                try {
                    await retellAPI.deleteAgent(workspaceId, agentId);
                    await loadAllAgents();
                    setShowRetellModal(false);
                } catch (err) {
                    alert('Sesli asistan silinemedi: ' + (err.response?.data?.error || err.message));
                }
            }
        });
    };

    const totalCount = bots.length + retellAgents.length;
    const filteredBots = activeTab === 'voice' ? [] : bots;
    const filteredRetell = activeTab === 'chat' ? [] : retellAgents;
    const displayedCount = filteredBots.length + filteredRetell.length;

    return (
        <div className="ai-agents-page">
            {/* Header */}
            <div className="ai-agents-header">
                <div className="ai-agents-header-left">
                    <div className="ai-agents-icon-wrap">
                        <Sparkles size={22} />
                    </div>
                    <div>
                        <h1 className="ai-agents-title">AI Agentlar & Asistanlar</h1>
                        <p className="ai-agents-subtitle">
                            Müşterilerinizle 7/24 otomatik yazışan mesaj botları ve sesli arama (AI Call) asistanları
                        </p>
                    </div>
                </div>
                <div className="ai-agents-header-actions">
                    <Link to="/base" className="ai-btn ai-btn-outline" title="Bilgi Bankasını Yönet">
                        <BookOpen size={16} /> Bilgi Bankası (AI Hafızası)
                    </Link>
                    <button className="ai-btn ai-btn-voice" onClick={() => setShowRetellModal(true)}>
                        <Phone size={16} /> + Yeni AI Call Agent
                    </button>
                    <button className="ai-btn ai-btn-primary" onClick={() => setCreateBotModal(true)}>
                        <Bot size={16} /> + Yeni AI Asistan
                    </button>
                </div>
            </div>

            <div className="ai-agents-container">
                {/* Bilgi Bankası Hatırlatma Banner */}
                <div className="ai-kb-banner">
                    <div className="ai-kb-banner-left">
                        <span style={{ fontSize: '24px' }}>🧠</span>
                        <div className="ai-kb-banner-text">
                            <h4>Bilgi Bankası & AI Hafızası ile Tam Entegre</h4>
                            <p>
                                AI Asistanlarınız müşterilerinizin sorularını yanıtlarken firmanızın belgelerinden, web sitesinden ve tanımladığınız ürün/hizmet bilgilerinden beslenir.
                            </p>
                        </div>
                    </div>
                    <Link to="/base" className="ai-btn ai-btn-outline" style={{ background: '#fff', whiteSpace: 'nowrap' }}>
                        Bilgileri Düzenle <ExternalLink size={14} />
                    </Link>
                </div>

                {/* Metrics */}
                <div className="ai-metrics-grid">
                    <div className="ai-metric-card">
                        <div className="ai-metric-icon total">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <div className="ai-metric-value">{totalCount}</div>
                            <div className="ai-metric-label">Toplam Aktif Agent</div>
                        </div>
                    </div>
                    <div className="ai-metric-card">
                        <div className="ai-metric-icon chat">
                            <Bot size={20} />
                        </div>
                        <div>
                            <div className="ai-metric-value">{bots.length}</div>
                            <div className="ai-metric-label">Mesaj Asistanı (Chat)</div>
                        </div>
                    </div>
                    <div className="ai-metric-card">
                        <div className="ai-metric-icon voice">
                            <Phone size={20} />
                        </div>
                        <div>
                            <div className="ai-metric-value">{retellAgents.length}</div>
                            <div className="ai-metric-label">Sesli Asistan (AI Call)</div>
                        </div>
                    </div>
                    <div className="ai-metric-card">
                        <div className="ai-metric-icon kb">
                            <Zap size={20} />
                        </div>
                        <div>
                            <div className="ai-metric-value">7/24</div>
                            <div className="ai-metric-label">Otomatik Yanıtlama</div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="ai-tabs-bar">
                    <div className="ai-tabs-left">
                        <button
                            className={`ai-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                            onClick={() => setActiveTab('all')}
                        >
                            Tüm Agentlar <span className="ai-tab-badge">{totalCount}</span>
                        </button>
                        <button
                            className={`ai-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                            onClick={() => setActiveTab('chat')}
                        >
                            Mesaj Asistanları <span className="ai-tab-badge">{bots.length}</span>
                        </button>
                        <button
                            className={`ai-tab-btn ${activeTab === 'voice' ? 'active' : ''}`}
                            onClick={() => setActiveTab('voice')}
                        >
                            Sesli Asistanlar (Call) <span className="ai-tab-badge">{retellAgents.length}</span>
                        </button>
                    </div>
                </div>

                {/* List / Grid */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                        AI Agentlar yükleniyor...
                    </div>
                ) : displayedCount === 0 ? (
                    <div className="ai-empty-state">
                        <div className="ai-empty-icon">
                            <Bot size={32} />
                        </div>
                        <h3 className="ai-empty-title">Henüz AI Agent Bulunmuyor</h3>
                        <p className="ai-empty-desc">
                            Müşterilerinizin mesajlarını WhatsApp, Instagram ve web widget üzerinden anında yanıtlayan bir AI asistan veya sesli arama agentı oluşturun.
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="ai-btn ai-btn-primary" onClick={() => setCreateBotModal(true)}>
                                <Bot size={16} /> AI Mesaj Asistanı Ekle
                            </button>
                            <button className="ai-btn ai-btn-voice" onClick={() => setShowRetellModal(true)}>
                                <Phone size={16} /> AI Call Agent Ekle
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="ai-agents-grid">
                        {/* Mesaj Botları */}
                        {filteredBots.map((bot) => {
                            let capabilities = {};
                            try {
                                capabilities = typeof bot.capabilities === 'string'
                                    ? JSON.parse(bot.capabilities)
                                    : (bot.capabilities || {});
                            } catch (_) { }

                            return (
                                <div key={bot.id} className="ai-card" onClick={() => setBotModal({ isOpen: true, bot })}>
                                    <div className="ai-card-top">
                                        <div className="ai-card-avatar chat">
                                            <Bot size={24} />
                                        </div>
                                        <div className="ai-card-info">
                                            <div className="ai-card-header-row">
                                                <h3 className="ai-card-name" title={bot.name}>{bot.name}</h3>
                                                <span className={`ai-status-pill ${bot.isActive === false ? 'inactive' : ''}`}>
                                                    <span className="ai-status-dot" />
                                                    {bot.isActive === false ? 'Pasif' : 'Aktif'}
                                                </span>
                                            </div>
                                            <p className="ai-card-role">{bot.role || 'AI Mesaj Asistanı'}</p>
                                        </div>
                                    </div>

                                    <div className="ai-card-desc">
                                        {bot.prompt || 'Müşterilerden gelen mesajları kurumsal dilde, bilgi bankasındaki kaynaklara dayanarak yanıtlar.'}
                                    </div>

                                    <div className="ai-capabilities-row">
                                        <span className={`ai-cap-chip ${capabilities.appointment !== false ? 'active' : ''}`}>
                                            ✓ Randevu
                                        </span>
                                        <span className={`ai-cap-chip ${capabilities.product !== false ? 'active' : ''}`}>
                                            ✓ Ürün/Fiyat
                                        </span>
                                        <span className={`ai-cap-chip ${capabilities.humanHandoff !== false ? 'active' : ''}`}>
                                            ✓ Temsilci Aktarma
                                        </span>
                                        <span className={`ai-cap-chip ${capabilities.knowledgeBase !== false ? 'active' : ''}`}>
                                            ✓ Bilgi Bankası
                                        </span>
                                    </div>

                                    <div className="ai-card-footer">
                                        <span className="ai-type-label">💬 Mesaj Asistanı</span>
                                        <div className="ai-card-btns" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="ai-btn-sm ai-btn-sm-primary"
                                                onClick={() => setBotModal({ isOpen: true, bot })}
                                            >
                                                <Settings size={13} /> Yapılandır
                                            </button>
                                            <button
                                                className="ai-btn-sm ai-btn-sm-danger"
                                                onClick={() => handleDeleteBot(bot)}
                                                title="Asistanı Sil"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Sesli Arama Agentları (Retell) */}
                        {filteredRetell.map((agent) => {
                            const agentId = agent.agent_id || agent.id;
                            const agentName = agent.agent_name || agent.name || 'Sesli Asistan';

                            return (
                                <div
                                    key={agentId}
                                    className="ai-card"
                                    style={{ borderLeft: '4px solid #0d9488' }}
                                    onClick={() => setShowRetellModal(agentId)}
                                >
                                    <div className="ai-card-top">
                                        <div className="ai-card-avatar voice">
                                            <Phone size={24} />
                                        </div>
                                        <div className="ai-card-info">
                                            <div className="ai-card-header-row">
                                                <h3 className="ai-card-name" title={agentName}>{agentName}</h3>
                                                <span className="ai-status-pill">
                                                    <span className="ai-status-dot" style={{ background: '#0d9488' }} />
                                                    Aktif
                                                </span>
                                            </div>
                                            <p className="ai-card-role">Sesli Arama Asistanı (AI Call)</p>
                                        </div>
                                    </div>

                                    <div className="ai-card-desc">
                                        Telefon aramalarında müşterilerle gerçek zamanlı Türkçe sesli diyalog kurar, randevu planlar ve bilgi verir.
                                    </div>

                                    <div className="ai-capabilities-row">
                                        <span className="ai-cap-chip active">📞 İki Yönlü Ses</span>
                                        <span className="ai-cap-chip active">📅 Randevu Planlama</span>
                                        <span className="ai-cap-chip active">📝 Arama Özeti & Transkript</span>
                                    </div>

                                    <div className="ai-card-footer">
                                        <span className="ai-type-label" style={{ color: '#0d9488' }}>📞 Sesli Asistan</span>
                                        <div className="ai-card-btns" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="ai-btn-sm ai-btn-sm-primary"
                                                onClick={() => setShowRetellModal(agentId)}
                                            >
                                                <Settings size={13} /> Yapılandır
                                            </button>
                                            <button
                                                className="ai-btn-sm ai-btn-sm-danger"
                                                onClick={() => handleDeleteRetellAgent(agent)}
                                                title="Sesli Asistanı Sil"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Quick Create Bot Modal */}
            {createBotModal && (
                <div className="ai-modal-overlay" onClick={() => setCreateBotModal(false)}>
                    <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ai-modal-header">
                            <h3>Yeni AI Mesaj Asistanı</h3>
                            <button className="ai-modal-close" onClick={() => setCreateBotModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateChatBot}>
                            <div className="ai-modal-body">
                                <div className="ai-form-group">
                                    <label>Asistan Adı</label>
                                    <input
                                        type="text"
                                        value={newBotName}
                                        onChange={(e) => setNewBotName(e.target.value)}
                                        required
                                        autoFocus
                                        placeholder="Örn: Satış & Destek Botu"
                                    />
                                </div>
                                <div className="ai-form-group">
                                    <label>Görevi / Rolü</label>
                                    <input
                                        type="text"
                                        value={newBotRole}
                                        onChange={(e) => setNewBotRole(e.target.value)}
                                        placeholder="Örn: Müşteri Danışmanı"
                                    />
                                </div>
                            </div>
                            <div className="ai-modal-footer">
                                <button
                                    type="button"
                                    className="ai-btn ai-btn-outline"
                                    onClick={() => setCreateBotModal(false)}
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="ai-btn ai-btn-primary"
                                    disabled={!newBotName.trim()}
                                >
                                    Oluştur ve Yapılandır
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Bot Modal */}
            {botModal.isOpen && botModal.bot && (
                <BotModal
                    isOpen={botModal.isOpen}
                    bot={botModal.bot}
                    workspaceId={workspaceId}
                    automationsList={automationsList}
                    onRefresh={loadAllAgents}
                    onDelete={() => handleDeleteBot(botModal.bot)}
                    onClose={() => setBotModal({ isOpen: false, bot: null })}
                />
            )}

            {/* Retell Voice Settings Modal */}
            {showRetellModal && (
                <div className="ai-modal-overlay" onClick={() => setShowRetellModal(false)}>
                    <div
                        className="ai-modal"
                        style={{ maxWidth: '850px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="ai-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Phone size={18} color="#0d9488" />
                                <h3>{typeof showRetellModal === 'string' ? 'AI Sesli Asistan Yapılandırma' : 'AI Call (Sesli Asistan) Ayarları'}</h3>
                            </div>
                            <button className="ai-modal-close" onClick={() => setShowRetellModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            <RetellSettings
                                hideApiSetup={typeof showRetellModal === 'string'}
                                initialAgentId={typeof showRetellModal === 'string' ? showRetellModal : null}
                                onSave={() => {
                                    loadAllAgents();
                                    setShowRetellModal(false);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Shared Confirm Modal */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onClose={() => setConfirmModal({ isOpen: false, onConfirm: null, title: '', message: '' })}
            />
        </div>
    );
};

export default AIAgents;
