import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI, companyAPI } from '../../services/api';
import AIIntegrationSettings from '../../components/Settings/AIIntegrationSettings';
import WhatsAppSettings from '../../components/Settings/WhatsAppSettings';
import { Trash2, Shield, Bot, AlertCircle, Plus, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './Settings.css';

const Settings = () => {
    const { currentWorkspace, user, switchWorkspace } = useAuth();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('workspaces');
    const [workspaces, setWorkspaces] = useState([]);
    const [myCompanies, setMyCompanies] = useState([]);
    const [loading, setLoading] = useState(false);

    const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
    const [selectedCompanyForWorkspace, setSelectedCompanyForWorkspace] = useState(null);
    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');
    const [createWorkspaceError, setCreateWorkspaceError] = useState('');
    const [creatingWorkspace, setCreatingWorkspace] = useState(false);

    const isOwner = currentWorkspace?.members?.find(m => m.userId === user?.id && m.role === 'OWNER');

    useEffect(() => {
        if (currentWorkspace && activeTab === 'workspaces') {
            loadWorkspaces();
            loadMyCompanies();
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
            setCreateWorkspaceError(t('settings.fillAllFields'));
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
            alert(t('settings.workspaceCreated'));
        } catch (error) {
            setCreateWorkspaceError(error.response?.data?.error || t('settings.workspaceCreateError'));
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
        if (!confirm(t('settings.deleteWorkspaceConfirm'))) return;
        const workspaceName = prompt(t('settings.deleteWorkspacePrompt'));
        const workspaceToDelete = workspaces.find(w => w.id === workspaceId);
        if (workspaceName !== workspaceToDelete.name) {
            alert(t('settings.nameMismatch'));
            return;
        }
        try {
            await workspaceAPI.delete(workspaceId);
            alert(t('settings.workspaceDeleted'));
            if (currentWorkspace.id === workspaceId) {
                window.location.reload();
            } else {
                loadWorkspaces();
            }
        } catch (error) {
            console.error('Error deleting workspace:', error);
            alert(error.response?.data?.error || t('settings.workspaceDeleteError'));
        }
    };

    if (!currentWorkspace) {
        return <div className="empty-state"><p>{t('settings.selectWorkspace')}</p></div>;
    }

    return (
        <div className="settings-page">
            <div className="settings-tabs">
                <button className={`tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`} onClick={() => setActiveTab('workspaces')}>
                    <Shield size={16} /> {t('settings.businesses')}
                </button>
                <button className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
                    <Bot size={16} /> {t('settings.aiIntegration')}
                </button>
            </div>

            <div className="settings-content">
                {activeTab === 'workspaces' && (
                    <div className="settings-section">
                        {myCompanies.length > 0 && (
                            <div className="companies-section">
                                <div className="section-header">
                                    <h2><Building2 size={20} /> {t('settings.myCompanies')}</h2>
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
                                                    <span className="quota-label">{t('settings.workspaceUsage')}:</span>
                                                    <div className="quota-bar">
                                                        <div className="quota-fill" style={{ width: `${(usedWorkspaces / maxWorkspaces) * 100}%` }} />
                                                    </div>
                                                    <span className="quota-text">{usedWorkspaces} / {maxWorkspaces}</span>
                                                </div>
                                                {canCreate ? (
                                                    <button className="btn btn-primary btn-sm" onClick={() => openCreateWorkspaceModal(company)}>
                                                        <Plus size={14} /> {t('settings.newWorkspace')}
                                                    </button>
                                                ) : (
                                                    <div className="quota-exceeded">
                                                        <AlertCircle size={14} />
                                                        <span>{t('settings.workspaceLimitReached')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="section-header"><h2>{t('settings.myWorkspaces')}</h2></div>
                        {loading ? (
                            <div className="loading">{t('common.loading')}</div>
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
                                                        {currentWorkspace.id === ws.id && <span className="badge badge-success" style={{ fontSize: '0.7em' }}>{t('settings.active')}</span>}
                                                    </h4>
                                                    <div className="meta-info" style={{ fontSize: '0.8rem', color: '#666' }}>
                                                        <span>{ws._count?.members || 0} {t('settings.members')}</span> • <span>{ws._count?.facebookPages || 0} {t('settings.pages')}</span> • <span>{ws._count?.conversations || 0} {t('settings.conversations')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {currentWorkspace.id !== ws.id && (
                                                    <button className="btn btn-sm btn-secondary" onClick={() => switchWorkspace(ws.id)}>{t('settings.switchTo')}</button>
                                                )}
                                                {wsIsOwner && (
                                                    <button className="btn-icon btn-danger" onClick={() => handleDeleteWorkspace(ws.id)} title={t('settings.deleteWorkspace')}>
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
                        <h2>{t('settings.newWorkspace')}</h2>
                        <p className="modal-subtitle"><Building2 size={16} /> {selectedCompanyForWorkspace.name}</p>
                        {createWorkspaceError && <div className="error-message">{createWorkspaceError}</div>}
                        <form onSubmit={handleCreateWorkspace}>
                            <div className="form-group">
                                <label>{t('settings.workspaceName')}</label>
                                <input type="text" value={newWorkspaceName} onChange={(e) => setNewWorkspaceName(e.target.value)} placeholder={t('settings.workspaceNamePlaceholder')} required />
                            </div>
                            <div className="form-group">
                                <label>{t('settings.workspaceDescription')}</label>
                                <textarea value={newWorkspaceDescription} onChange={(e) => setNewWorkspaceDescription(e.target.value)} placeholder={t('settings.workspaceDescriptionPlaceholder')} rows={3} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateWorkspaceModalOpen(false)}>{t('common.cancel')}</button>
                                <button type="submit" className="btn btn-primary" disabled={creatingWorkspace}>{creatingWorkspace ? t('settings.creating') : t('common.create')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
