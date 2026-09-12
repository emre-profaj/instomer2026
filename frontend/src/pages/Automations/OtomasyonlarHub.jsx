import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Zap, Bot, Brain, ListTodo, GitBranch, Settings,
    Phone, Shield
} from 'lucide-react';
import { aiAPI, teamAPI, automationAPI } from '../../services/api';
import BotModal from '../../components/Settings/BotModal';

// Lazy import mevcut bileşenler
import Automations from '../Automations/Automations';
import Channels from '../Channels/Channels';
import Integrations from '../Settings/Integrations';

const OtomasyonlarHub = () => {
    const { currentWorkspace } = useAuth();
    const [activeSection, setActiveSection] = useState('agents');

    if (!currentWorkspace) {
        return <div className="empty-state"><p>Workspace seçiniz</p></div>;
    }

    const navItems = [
        { key: 'agents', icon: Bot, label: 'Agents (Mesaj & Call)' },
        { key: 'classifier', icon: Brain, label: 'Sınıflandırma & Yönlendirme' },
        { key: 'taskManager', icon: ListTodo, label: 'Görev Yöneticisi' },
        { key: 'automations', icon: Zap, label: 'Otomasyonlar' },
        { key: 'flowBuilder', icon: GitBranch, label: 'Akış Oluşturucu' },
        { key: 'callTemplates', icon: Phone, label: 'Arama Şablonları' },
        { key: 'integrations', icon: Settings, label: 'Entegrasyonlar & Bot Araçları' },
    ];

    return (
        <div className="knowledge-base-page base-layout">
            {/* Sol Sidebar */}
            <div className="base-sidebar">
                <div className="base-sidebar-header">
                    <div className="base-sidebar-header-icon">
                        <Zap size={16} />
                    </div>
                    <span>Otomasyonlar</span>
                </div>
                <nav className="base-nav">
                    {navItems.map(item => (
                        <button
                            key={item.key}
                            className={`base-nav-item ${activeSection === item.key ? 'active' : ''}`}
                            onClick={() => setActiveSection(item.key)}
                        >
                            <item.icon size={17} />
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            {/* Sağ İçerik */}
            <div className="base-content">

                {/* Agents — Botlar (mesaj + call) */}
                {activeSection === 'agents' && (
                    <AgentsSection workspaceId={currentWorkspace.id} />
                )}

                {/* Sınıflandırma & Yönlendirme — mevcut Channels sayfası */}
                {activeSection === 'classifier' && (
                    <div style={{ margin: '-24px' }}>
                        <Channels />
                    </div>
                )}

                {/* Görev Yöneticisi */}
                {activeSection === 'taskManager' && (
                    <TaskManagerSection workspaceId={currentWorkspace.id} />
                )}

                {/* Otomasyonlar — Tüm otomasyonlar tek sayfada */}
                {activeSection === 'automations' && (
                    <div style={{ margin: '-24px' }}>
                        <Automations initialTab="automations" />
                    </div>
                )}

                {/* Akış Oluşturucu — Visual flow builder */}
                {activeSection === 'flowBuilder' && (
                    <div style={{ margin: '-24px' }}>
                        <Automations initialTab="flows" />
                    </div>
                )}

                {/* Arama Şablonları — mevcut Automations retellTemplates tab */}
                {activeSection === 'callTemplates' && (
                    <div style={{ margin: '-24px' }}>
                        <Automations initialTab="retellTemplates" />
                    </div>
                )}

                {/* Entegrasyonlar & Bot Araçları — mevcut Integrations sayfası */}
                {activeSection === 'integrations' && (
                    <div style={{ margin: '-24px' }}>
                        <Integrations />
                    </div>
                )}

            </div>
        </div>
    );
};


// ──────────────────────────────────────────────
// Agents Section — Bot listesi + yönetim
// ──────────────────────────────────────────────

const AgentsSection = ({ workspaceId }) => {
    const [bots, setBots] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [botModal, setBotModal] = React.useState({ isOpen: false, bot: null });
    const [showCreateForm, setShowCreateForm] = React.useState(false);
    const [newBotName, setNewBotName] = React.useState('');
    const [newBotType, setNewBotType] = React.useState('CHATS');

    React.useEffect(() => {
        loadBots();
    }, [workspaceId]);

    const loadBots = async () => {
        try {
            setLoading(true);
            const res = await aiAPI.getBots(workspaceId);
            const rawBots = res.data?.bots ?? (Array.isArray(res.data) ? res.data : []);
            setBots(Array.isArray(rawBots) ? rawBots : []);
        } catch (err) {
            console.error('Error loading bots:', err);
            setBots([]);
        }
        finally { setLoading(false); }
    };

    const handleCreateBot = async () => {
        if (!newBotName.trim()) return;
        try {
            await aiAPI.createBot(workspaceId, {
                name: newBotName,
                role: 'AI Asistan',
                botType: newBotType,
                systemPrompt: ''
            });
            setNewBotName('');
            setShowCreateForm(false);
            loadBots();
        } catch (err) {
            alert('Bot oluşturulurken hata oluştu');
            console.error(err);
        }
    };

    const handleDeleteBot = async (botId) => {
        if (!confirm('Bu botu silmek istediğinize emin misiniz?')) return;
        try {
            await aiAPI.deleteBot(workspaceId, botId);
            loadBots();
        } catch (err) {
            alert('Bot silinirken hata oluştu');
            console.error(err);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>AI Agents</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                        Mesaj ve arama botlarını yönetin
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
                    + Yeni Agent
                </button>
            </div>

            {/* Create Form */}
            {showCreateForm && (
                <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: 1, margin: 0 }}>
                            <label>Agent Adı</label>
                            <input className="input" value={newBotName} onChange={e => setNewBotName(e.target.value)} placeholder="Örn: Satış Asistanı" />
                        </div>
                        <div className="form-group" style={{ width: '160px', margin: 0 }}>
                            <label>Tip</label>
                            <select className="input" value={newBotType} onChange={e => setNewBotType(e.target.value)}>
                                <option value="CHATS">💬 Mesaj Botu</option>
                                <option value="CALLS">📞 Arama Botu</option>
                                <option value="BOTH">🔄 Her İkisi</option>
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={handleCreateBot} disabled={!newBotName.trim()}>Oluştur</button>
                        <button className="btn btn-outline" onClick={() => { setShowCreateForm(false); setNewBotName(''); }}>İptal</button>
                    </div>
                </div>
            )}

            {/* Bot List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Yükleniyor...</div>
            ) : bots.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                    <Bot size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                    <p>Henüz agent oluşturulmamış</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Array.isArray(bots) && bots.map(bot => (
                        <div key={bot.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                            onClick={() => setBotModal({ isOpen: true, bot })}
                        >
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontWeight: 700, fontSize: '14px', flexShrink: 0
                            }}>
                                {bot.botType === 'CALLS' ? '📞' : '🤖'}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{bot.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
                                    {bot.botType === 'CALLS' ? 'Arama Botu' : bot.botType === 'BOTH' ? 'Mesaj + Arama' : 'Mesaj Botu'}
                                    {bot.role && ` · ${bot.role}`}
                                </div>
                            </div>
                            <div style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: bot.isActive !== false ? '#22c55e' : '#e2e8f0'
                            }} />
                            <button
                                className="btn btn-outline"
                                style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                                onClick={(e) => { e.stopPropagation(); handleDeleteBot(bot.id); }}
                            >Sil</button>
                        </div>
                    ))}
                </div>
            )}

            {/* Bot Modal */}
            {botModal.isOpen && (
                <BotModal
                    isOpen={botModal.isOpen}
                    bot={botModal.bot}
                    onClose={() => setBotModal({ isOpen: false, bot: null })}
                    onSave={() => { setBotModal({ isOpen: false, bot: null }); loadBots(); }}
                    workspaceId={workspaceId}
                />
            )}
        </div>
    );
};


// ──────────────────────────────────────────────
// Task Manager Section — Otomatik görev kuralları
// ──────────────────────────────────────────────

const TaskManagerSection = ({ workspaceId }) => {
    const [rules, setRules] = React.useState([]);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        loadRules();
    }, [workspaceId]);

    const loadRules = async () => {
        try {
            setLoading(true);
            const res = await automationAPI.getAutomations(workspaceId);
            const rawRules = res.data?.automations ?? (Array.isArray(res.data) ? res.data : []);
            const allRules = Array.isArray(rawRules) ? rawRules : [];
            // Sadece görev/arama oluşturanları filtrele
            const taskRules = allRules.filter(r =>
                r && (
                    r.action === 'CREATE_TASK' ||
                    r.action === 'SCHEDULE_CALL' ||
                    r.action === 'AUTO_CALL' ||
                    (r.selectedActions && Array.isArray(r.selectedActions) && (
                        r.selectedActions.includes('CREATE_TASK') ||
                        r.selectedActions.includes('SCHEDULE_CALL') ||
                        r.selectedActions.includes('AUTO_CALL')
                    ))
                )
            );
            setRules(taskRules);
        } catch (err) {
            console.error(err);
            setRules([]);
        }
        finally { setLoading(false); }
    };

    return (
        <div>
            <div style={{ marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Görev Yöneticisi</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                    Otomatik görev ve arama oluşturma kuralları
                </p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Yükleniyor...</div>
            ) : rules.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                    <ListTodo size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                    <p>Görev oluşturucu otomasyon bulunamadı</p>
                    <p style={{ fontSize: '0.75rem' }}>
                        "Temel Otomasyonlar" bölümünden <strong>CREATE_TASK</strong> veya <strong>SCHEDULE_CALL</strong> aksiyonu ile otomasyon oluşturabilirsiniz.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Array.isArray(rules) && rules.map(rule => (
                        <div key={rule.id} className="card" style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{rule.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
                                        Tetik: {rule.trigger} → Aksiyon: {rule.action || rule.selectedActions?.join(', ')}
                                    </div>
                                </div>
                                <div style={{
                                    padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
                                    background: rule.isActive ? '#dcfce7' : '#f1f5f9',
                                    color: rule.isActive ? '#16a34a' : '#94a3b8'
                                }}>
                                    {rule.isActive ? 'Aktif' : 'Pasif'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


export default OtomasyonlarHub;
