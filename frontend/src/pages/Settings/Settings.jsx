import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI, facebookAPI, companyAPI, funnelAPI } from '../../services/api';
import AIIntegrationSettings from '../../components/Settings/AIIntegrationSettings';
import WhatsAppSettings from '../../components/Settings/WhatsAppSettings';
import { Trash2, Shield, Bot, AlertCircle, Plus, Building2, Phone, Kanban, Edit2, Check, X, Loader } from 'lucide-react';
import './Settings.css';

const Settings = () => {
    const { currentWorkspace, user, switchWorkspace, refreshWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('workspaces');
    const [workspaces, setWorkspaces] = useState([]);
    const [myCompanies, setMyCompanies] = useState([]);
    const [loading, setLoading] = useState(false);

    // Funnel state
    const [funnels, setFunnels] = useState([]);
    const [funnelLoading, setFunnelLoading] = useState(false);
    const [funnelSaving, setFunnelSaving] = useState(false);
    const [newFunnelName, setNewFunnelName] = useState('');
    const [newFunnelColor, setNewFunnelColor] = useState('#3b82f6');
    const [editingFunnel, setEditingFunnel] = useState(null); // { id, name, color }
    const FUNNEL_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#f97316','#06b6d4','#ec4899','#14b8a6','#64748b'];

    // Create Workspace Modal
    const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
    const [selectedCompanyForWorkspace, setSelectedCompanyForWorkspace] = useState(null);
    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');
    const [createWorkspaceError, setCreateWorkspaceError] = useState('');
    const [creatingWorkspace, setCreatingWorkspace] = useState(false);

    const isOwner = currentWorkspace?.members?.find(m => m.userId === user?.id && m.role === 'OWNER');

    useEffect(() => {
        if (currentWorkspace) {
            if (activeTab === 'workspaces') {
                loadWorkspaces();
                loadMyCompanies();
            }
            if (activeTab === 'funnels') {
                loadFunnels();
            }
        }
    }, [currentWorkspace, activeTab]);

    const loadWorkspaces = async () => {
        try {
            setLoading(true);
            const response = await workspaceAPI.getAll();
            setWorkspaces(response.data.workspaces);
        } catch (error) {
            console.error('Error loading workspaces:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMyCompanies = async () => {
        try {
            const response = await companyAPI.getMyCompanies();
            setMyCompanies(response.data.companies || []);
        } catch (error) {
            console.error('Error loading companies:', error);
        }
    };

    const handleCreateWorkspace = async (e) => {
        e.preventDefault();
        if (!selectedCompanyForWorkspace || !newWorkspaceName.trim()) {
            setCreateWorkspaceError('Lütfen tüm alanları doldurun');
            return;
        }

        setCreatingWorkspace(true);
        setCreateWorkspaceError('');

        try {
            await companyAPI.createWorkspace(selectedCompanyForWorkspace.id, {
                name: newWorkspaceName.trim(),
                description: newWorkspaceDescription.trim()
            });

            setIsCreateWorkspaceModalOpen(false);
            setNewWorkspaceName('');
            setNewWorkspaceDescription('');
            setSelectedCompanyForWorkspace(null);
            loadWorkspaces();
            loadMyCompanies();
            alert('Workspace başarıyla oluşturuldu!');
        } catch (error) {
            setCreateWorkspaceError(error.response?.data?.error || 'Workspace oluşturulamadı');
        } finally {
            setCreatingWorkspace(false);
        }
    };

    const openCreateWorkspaceModal = (company) => {
        setSelectedCompanyForWorkspace(company);
        setNewWorkspaceName('');
        setNewWorkspaceDescription('');
        setCreateWorkspaceError('');
        setIsCreateWorkspaceModalOpen(true);
    };

    const handleDeleteWorkspace = async (workspaceId) => {
        if (!confirm('Bu çalışma alanını kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!')) return;

        const workspaceName = prompt('Silme işlemini onaylamak için çalışma alanının adını yazın:');
        const workspaceToDelete = workspaces.find(w => w.id === workspaceId);

        if (workspaceName !== workspaceToDelete.name) {
            alert('İsim eşleşmedi. İşlem iptal edildi.');
            return;
        }

        try {
            await workspaceAPI.delete(workspaceId);
            alert('Çalışma alanı başarıyla silindi.');

            // If current workspace was deleted, switch to another or logout
            if (currentWorkspace.id === workspaceId) {
                window.location.reload(); // App will auto-select another workspace on load
            } else {
                loadWorkspaces();
            }
        } catch (error) {
            console.error('Error deleting workspace:', error);
            alert(error.response?.data?.error || 'Çalışma alanı silinirken hata oluştu');
        }
    };

    const loadFunnels = async () => {
        try {
            setFunnelLoading(true);
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data.funnels || []);
        } catch (err) { console.error('Load funnels error:', err); }
        finally { setFunnelLoading(false); }
    };

    const handleCreateFunnel = async () => {
        if (!newFunnelName.trim()) return;
        setFunnelSaving(true);
        try {
            const res = await funnelAPI.create(currentWorkspace.id, { name: newFunnelName.trim(), color: newFunnelColor });
            setFunnels(prev => [...prev, res.data.funnel]);
            setNewFunnelName('');
            setNewFunnelColor('#3b82f6');
        } catch (err) { console.error('Create funnel error:', err); }
        finally { setFunnelSaving(false); }
    };

    const handleUpdateFunnel = async () => {
        if (!editingFunnel?.name?.trim()) return;
        setFunnelSaving(true);
        try {
            const res = await funnelAPI.update(currentWorkspace.id, editingFunnel.id, { name: editingFunnel.name, color: editingFunnel.color });
            setFunnels(prev => prev.map(f => f.id === editingFunnel.id ? res.data.funnel : f));
            setEditingFunnel(null);
        } catch (err) { console.error('Update funnel error:', err); }
        finally { setFunnelSaving(false); }
    };

    const handleDeleteFunnel = async (funnelId) => {
        if (!confirm('Bu funnel silinecek. Emin misiniz?')) return;
        try {
            await funnelAPI.delete(currentWorkspace.id, funnelId);
            setFunnels(prev => prev.filter(f => f.id !== funnelId));
        } catch (err) { console.error('Delete funnel error:', err); }
    };



    if (!currentWorkspace) {
        return (
            <div className="empty-state">
                <p>Lütfen bir workspace seçin</p>
            </div>
        );
    }

    return (
        <div className="settings-page">
            <div className="settings-tabs">
                <button
                    className={`tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`}
                    onClick={() => setActiveTab('workspaces')}
                >
                    <Shield size={16} />
                    İşletmeler
                </button>
                <button
                    className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ai')}
                >
                    <Bot size={16} />
                    AI Entegre
                </button>
                <button
                    className={`tab-btn ${activeTab === 'funnels' ? 'active' : ''}`}
                    onClick={() => setActiveTab('funnels')}
                >
                    <Kanban size={16} />
                    Funnellar
                </button>
            </div>

            <div className="settings-content">
                {activeTab === 'workspaces' && (
                    <div className="settings-section">
                        {/* My Companies Section */}
                        {myCompanies.length > 0 && (
                            <div className="companies-section">
                                <div className="section-header">
                                    <h2><Building2 size={20} /> Firmalarım</h2>
                                </div>
                                <div className="companies-grid">
                                    {myCompanies.map(company => {
                                        const usedWorkspaces = company._count?.workspaces || 0;
                                        const maxWorkspaces = company.maxWorkspaces || 3;
                                        const canCreate = usedWorkspaces < maxWorkspaces;

                                        return (
                                            <div key={company.id} className="company-card-settings">
                                                <div className="company-card-header">
                                                    <h3>{company.name}</h3>
                                                    <span className={`subscription-badge ${company.aiSubscriptionType?.toLowerCase()}`}>
                                                        {company.aiSubscriptionType}
                                                    </span>
                                                </div>
                                                <div className="company-quota">
                                                    <span className="quota-label">Workspace Kullanımı:</span>
                                                    <div className="quota-bar">
                                                        <div
                                                            className="quota-fill"
                                                            style={{ width: `${(usedWorkspaces / maxWorkspaces) * 100}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="quota-text">{usedWorkspaces} / {maxWorkspaces}</span>
                                                </div>
                                                {canCreate ? (
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => openCreateWorkspaceModal(company)}
                                                    >
                                                        <Plus size={14} /> Yeni Workspace Oluştur
                                                    </button>
                                                ) : (
                                                    <div className="quota-exceeded">
                                                        <AlertCircle size={14} />
                                                        <span>Workspace limitine ulaştınız</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="section-header">
                            <h2>Çalışma Alanlarım</h2>
                        </div>
                        {loading ? (
                            <div className="loading">Yükleniyor...</div>
                        ) : (
                            <div className="card">
                                {workspaces.map((ws) => {
                                    const wsIsOwner = ws.members?.some(m => m.role === 'OWNER' && m.userId === user.id);

                                    return (
                                        <div
                                            key={ws.id}
                                            className="workspace-item"
                                            style={{
                                                padding: '16px',
                                                borderBottom: '1px solid #eee',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div className="member-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div>
                                                    <h4 style={{ margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {ws.name}
                                                        {currentWorkspace.id === ws.id && (
                                                            <span className="badge badge-success" style={{ fontSize: '0.7em' }}>Aktif</span>
                                                        )}
                                                    </h4>
                                                    <div className="meta-info" style={{ fontSize: '0.8rem', color: '#666' }}>
                                                        <span>{ws._count?.members || 0} üye</span> •
                                                        <span> {ws._count?.facebookPages || 0} sayfa</span> •
                                                        <span> {ws._count?.conversations || 0} sohbet</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {currentWorkspace.id !== ws.id && (
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => switchWorkspace(ws.id)}
                                                    >
                                                        Geç
                                                    </button>
                                                )}
                                                {wsIsOwner && (
                                                    <button
                                                        className="btn-icon btn-danger"
                                                        onClick={() => handleDeleteWorkspace(ws.id)}
                                                        title="Alanı Sil"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'ai' && (
                    <AIIntegrationSettings />
                )}

                {activeTab === 'funnels' && (
                    <div className="settings-section">
                        <div className="section-header" style={{ marginBottom: '20px' }}>
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Kanban size={20} /> Funnel Yönetimi
                            </h2>
                            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '4px' }}>
                                Funnellar, sohbetleri kategorize etmenizi ve Pipeline'da Kanban olarak görüntülemenizi sağlar.
                            </p>
                        </div>

                        {/* Yeni Funnel Oluştur */}
                        <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>Yeni Funnel Ekle</h3>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ flex: '1', minWidth: '180px' }}
                                    placeholder="Funnel adı… (ör. Satış, Destek, İş Başvurusu)"
                                    value={newFunnelName}
                                    onChange={e => setNewFunnelName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreateFunnel()}
                                />
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    {FUNNEL_COLORS.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setNewFunnelColor(c)}
                                            style={{
                                                width: '24px', height: '24px', borderRadius: '50%',
                                                background: c, border: newFunnelColor === c ? '2px solid #1e293b' : '2px solid transparent',
                                                cursor: 'pointer', transition: 'transform 0.1s',
                                                boxShadow: newFunnelColor === c ? '0 0 0 2px #fff, 0 0 0 4px ' + c : 'none'
                                            }}
                                        />
                                    ))}
                                </div>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleCreateFunnel}
                                    disabled={funnelSaving || !newFunnelName.trim()}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {funnelSaving ? <Loader size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Plus size={14} />}
                                    Oluştur
                                </button>
                            </div>
                        </div>

                        {/* Funnel Listesi */}
                        <div className="card">
                            {funnelLoading ? (
                                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Yükleniyor...</div>
                            ) : funnels.length === 0 ? (
                                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                                    <Kanban size={32} style={{ marginBottom: '8px', opacity: 0.4 }} />
                                    <p>Henüz funnel yok. Yukarıdan ilk funnel'ınızı oluşturun.</p>
                                </div>
                            ) : (
                                funnels.map(funnel => (
                                    <div key={funnel.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '14px 16px', borderBottom: '1px solid #f1f5f9'
                                    }}>
                                        {/* Color dot */}
                                        <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: funnel.color, flexShrink: 0 }} />

                                        {editingFunnel?.id === funnel.id ? (
                                            /* Edit mode */
                                            <>
                                                <input
                                                    autoFocus
                                                    className="form-input"
                                                    style={{ flex: 1, padding: '5px 10px', fontSize: '13px' }}
                                                    value={editingFunnel.name}
                                                    onChange={e => setEditingFunnel(prev => ({ ...prev, name: e.target.value }))}
                                                    onKeyDown={e => e.key === 'Enter' && handleUpdateFunnel()}
                                                />
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    {FUNNEL_COLORS.map(c => (
                                                        <button key={c} onClick={() => setEditingFunnel(prev => ({ ...prev, color: c }))}
                                                            style={{ width: '20px', height: '20px', borderRadius: '50%', background: c,
                                                                border: editingFunnel.color === c ? '2px solid #1e293b' : '2px solid transparent', cursor: 'pointer' }}
                                                        />
                                                    ))}
                                                </div>
                                                <button className="btn btn-primary btn-sm" onClick={handleUpdateFunnel} disabled={funnelSaving}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Check size={13} /> Kaydet
                                                </button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => setEditingFunnel(null)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <X size={13} /> İptal
                                                </button>
                                            </>
                                        ) : (
                                            /* View mode */
                                            <>
                                                <span style={{ flex: 1, fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>{funnel.name}</span>
                                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>#{funnel.id.slice(-6)}</span>
                                                <button className="btn-icon" onClick={() => setEditingFunnel({ id: funnel.id, name: funnel.name, color: funnel.color })}
                                                    title="Düzenle" style={{ color: '#6b7280' }}>
                                                    <Edit2 size={15} />
                                                </button>
                                                <button className="btn-icon btn-danger" onClick={() => handleDeleteFunnel(funnel.id)} title="Sil">
                                                    <Trash2 size={15} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* Create Workspace Modal */}
            {isCreateWorkspaceModalOpen && selectedCompanyForWorkspace && (
                <div className="modal-overlay" onClick={() => setIsCreateWorkspaceModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>Yeni Workspace Oluştur</h2>
                        <p className="modal-subtitle">
                            <Building2 size={16} /> {selectedCompanyForWorkspace.name} firması altında
                        </p>
                        {createWorkspaceError && <div className="error-message">{createWorkspaceError}</div>}
                        <form onSubmit={handleCreateWorkspace}>
                            <div className="form-group">
                                <label>Workspace Adı</label>
                                <input
                                    type="text"
                                    value={newWorkspaceName}
                                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                                    placeholder="Örn: Satış Ekibi"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Açıklama (Opsiyonel)</label>
                                <textarea
                                    value={newWorkspaceDescription}
                                    onChange={(e) => setNewWorkspaceDescription(e.target.value)}
                                    placeholder="Bu workspace hakkında kısa bir açıklama"
                                    rows={3}
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setIsCreateWorkspaceModalOpen(false)}
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={creatingWorkspace}
                                >
                                    {creatingWorkspace ? 'Oluşturuluyor...' : 'Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
