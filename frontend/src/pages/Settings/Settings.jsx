import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI, facebookAPI, companyAPI } from '../../services/api';
import AIIntegrationSettings from '../../components/Settings/AIIntegrationSettings';
import WhatsAppSettings from '../../components/Settings/WhatsAppSettings';
import { Trash2, Shield, Bot, AlertCircle, Plus, Building2, Phone } from 'lucide-react';
import './Settings.css';

const Settings = () => {
    const { currentWorkspace, user, switchWorkspace, refreshWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('workspaces');
    const [workspaces, setWorkspaces] = useState([]);
    const [myCompanies, setMyCompanies] = useState([]);
    const [loading, setLoading] = useState(false);

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
            </div>

            <div className="settings-content">
                {activeTab === 'workspaces' && (
                    <div className="settings-section">
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
                                                    <span className={`subscription-badge ${company.aiSubscriptionType?.toLowerCase()}`}>{company.aiSubscriptionType}</span>
                                                </div>
                                                <div className="company-quota">
                                                    <span className="quota-label">Workspace Kullanımı:</span>
                                                    <div className="quota-bar">
                                                        <div className="quota-fill" style={{ width: `${(usedWorkspaces / maxWorkspaces) * 100}%` }} />
                                                    </div>
                                                    <span className="quota-text">{usedWorkspaces} / {maxWorkspaces}</span>
                                                </div>
                                                {canCreate ? (
                                                    <button className="btn btn-primary btn-sm" onClick={() => openCreateWorkspaceModal(company)}>
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
                        <div className="section-header"><h2>Çalışma Alanlarım</h2></div>
                        {loading ? (
                            <div className="loading">Yükleniyor...</div>
                        ) : (
                            <div className="card">
                                {workspaces.map((ws) => {
                                    const wsIsOwner = ws.members?.some(m => m.role === 'OWNER' && m.userId === user.id);
                                    return (
                                        <div key={ws.id} className="workspace-item" style={{ padding: '16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div className="member-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div>
                                                    <h4 style={{ margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {ws.name}
                                                        {currentWorkspace.id === ws.id && <span className="badge badge-success" style={{ fontSize: '0.7em' }}>Aktif</span>}
                                                    </h4>
                                                    <div className="meta-info" style={{ fontSize: '0.8rem', color: '#666' }}>
                                                        <span>{ws._count?.members || 0} üye</span> • <span>{ws._count?.facebookPages || 0} sayfa</span> • <span>{ws._count?.conversations || 0} sohbet</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {currentWorkspace.id !== ws.id && (
                                                    <button className="btn btn-sm btn-secondary" onClick={() => switchWorkspace(ws.id)}>Geç</button>
                                                )}
                                                {wsIsOwner && (
                                                    <button className="btn-icon btn-danger" onClick={() => handleDeleteWorkspace(ws.id)} title="Alanı Sil">
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
                {activeTab === 'ai' && <AIIntegrationSettings />}
            </div>

            {isCreateWorkspaceModalOpen && selectedCompanyForWorkspace && (
                <div className="modal-overlay" onClick={() => setIsCreateWorkspaceModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>Yeni Workspace Oluştur</h2>
                        <p className="modal-subtitle"><Building2 size={16} /> {selectedCompanyForWorkspace.name} firması altında</p>
                        {createWorkspaceError && <div className="error-message">{createWorkspaceError}</div>}
                        <form onSubmit={handleCreateWorkspace}>
                            <div className="form-group">
                                <label>Workspace Adı</label>
                                <input type="text" value={newWorkspaceName} onChange={(e) => setNewWorkspaceName(e.target.value)} placeholder="Örn: Satış Ekibi" required />
                            </div>
                            <div className="form-group">
                                <label>Açıklama (Opsiyonel)</label>
                                <textarea value={newWorkspaceDescription} onChange={(e) => setNewWorkspaceDescription(e.target.value)} placeholder="Bu workspace hakkında kısa bir açıklama" rows={3} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateWorkspaceModalOpen(false)}>İptal</button>
                                <button type="submit" className="btn btn-primary" disabled={creatingWorkspace}>{creatingWorkspace ? 'Oluşturuluyor...' : 'Oluştur'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
