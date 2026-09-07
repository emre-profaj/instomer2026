import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminAPI, companyAPI } from '../../services/api';
import './AdminDashboard.css';
import {
    Users,
    Database,
    MessageSquare,
    Trash2,
    Search,
    ArrowLeft,
    Plus,
    Building2,
    UserPlus,
    Edit2,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    Briefcase,
    ToggleLeft,
    ToggleRight
} from 'lucide-react';

const AdminDashboard = () => {
    const { t } = useTranslation();
    const { user: currentUser, switchWorkspace } = useAuth();
    const navigate = useNavigate();
    const { companyId, workspaceId } = useParams();

    const [companies, setCompanies] = useState([]);
    const [unassignedWorkspaces, setUnassignedWorkspaces] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [wsSearchTerm, setWsSearchTerm] = useState('');

    // Move workspace to company modal
    const [isMoveWorkspaceModalOpen, setIsMoveWorkspaceModalOpen] = useState(false);
    const [selectedWorkspaceToMove, setSelectedWorkspaceToMove] = useState(null);
    const [targetCompanyId, setTargetCompanyId] = useState('');

    // Company Detail States
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [loadingCompany, setLoadingCompany] = useState(false);

    // Workspace Detail States
    const [selectedWorkspace, setSelectedWorkspace] = useState(null);
    const [workspaceMembers, setWorkspaceMembers] = useState([]);
    const [loadingWorkspace, setLoadingWorkspace] = useState(false);

    // Create New User Modal (inside workspace)
    const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
    const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', role: 'AGENT' });
    const [newUserError, setNewUserError] = useState('');

    // Create Company Modal
    const [isCreateCompanyModalOpen, setIsCreateCompanyModalOpen] = useState(false);
    const [createCompanyForm, setCreateCompanyForm] = useState({
        name: '',
        ownerId: '',
        maxWorkspaces: 3,
        dailyAiChatLimit: 50,
        aiSubscriptionType: 'FREE',
        aiModel: 'gemini-2.5-flash',
        // Yeni kullanıcı oluşturma alanları
        createNewUser: false,
        newUserName: '',
        newUserEmail: '',
        newUserPassword: ''
    });
    const [createCompanyError, setCreateCompanyError] = useState('');

    // Create Workspace Modal (inside company)
    const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
    const [createWorkspaceForm, setCreateWorkspaceForm] = useState({ name: '', description: '' });
    const [createWorkspaceError, setCreateWorkspaceError] = useState('');

    // Edit Company Modal
    const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
    const [editCompanyForm, setEditCompanyForm] = useState({});
    const [editCompanyError, setEditCompanyError] = useState('');

    // Edit Workspace Modal
    const [isEditWorkspaceModalOpen, setIsEditWorkspaceModalOpen] = useState(false);
    const [editWorkspaceForm, setEditWorkspaceForm] = useState({ name: '' });
    const [editWorkspaceError, setEditWorkspaceError] = useState('');

    // Expanded companies (for showing workspaces)
    const [expandedCompanies, setExpandedCompanies] = useState({});

    // AI Usage States
    const [aiUsage, setAiUsage] = useState(null);
    const [loadingAiUsage, setLoadingAiUsage] = useState(false);
    const [isEditAiLimitModalOpen, setIsEditAiLimitModalOpen] = useState(false);
    const [aiLimitForm, setAiLimitForm] = useState({ dailyAiChatLimit: 50, aiSubscriptionType: 'FREE' });

    // Modül Toggle States
    const [togglingRealEstate, setTogglingRealEstate] = useState(false);
    const [togglingAppointment, setTogglingAppointment] = useState(false);


    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (companyId && !workspaceId) {
            loadCompanyDetail(companyId);
        } else if (workspaceId) {
            loadWorkspaceDetail(workspaceId);
        } else {
            setSelectedCompany(null);
            setSelectedWorkspace(null);
            setWorkspaceMembers([]);
        }
    }, [companyId, workspaceId]);

    const loadData = async () => {
        try {
            setLoading(true);

            // Her API çağrısını ayrı ayrı yap, bir tanesi hata verse bile diğerleri çalışsın
            const [companiesRes, usersRes, workspacesRes] = await Promise.all([
                companyAPI.getAll().catch(err => { console.error('Companies API error:', err); return { data: { companies: [] } }; }),
                adminAPI.getUsers().catch(err => { console.error('Users API error:', err); return { data: { users: [] } }; }),
                adminAPI.getWorkspaces().catch(err => { console.error('Workspaces API error:', err); return { data: { workspaces: [] } }; })
            ]);

            console.log('Companies:', companiesRes.data);
            console.log('Users:', usersRes.data);
            console.log('Workspaces:', workspacesRes.data);

            setCompanies(companiesRes.data.companies || []);
            setUsers(usersRes.data.users || []);

            // Firmaya atanmamış workspace'leri filtrele
            // Backend'den company objesi geliyor, companyId değil
            const allWorkspaces = workspacesRes.data.workspaces || [];
            const unassigned = allWorkspaces.filter(ws => !ws.company && !ws.companyId);
            console.log('All workspaces:', allWorkspaces.length);
            console.log('Unassigned workspaces:', unassigned.length);
            setUnassignedWorkspaces(unassigned);
        } catch (error) {
            console.error('Error loading admin data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadCompanyDetail = async (cId) => {
        try {
            setLoadingCompany(true);
            const response = await companyAPI.getById(cId);
            setSelectedCompany(response.data.company);
        } catch (error) {
            console.error('Error loading company detail:', error);
            alert('Firma detayları yüklenemedi');
            navigate('/admin');
        } finally {
            setLoadingCompany(false);
        }
    };

    const loadWorkspaceDetail = async (wsId) => {
        try {
            setLoadingWorkspace(true);
            setLoadingAiUsage(true);

            const [detailResponse, aiUsageResponse] = await Promise.all([
                adminAPI.getWorkspaceDetail(wsId),
                adminAPI.getWorkspaceAiUsage(wsId).catch(() => ({ data: null }))
            ]);

            setSelectedWorkspace(detailResponse.data.workspace);
            setWorkspaceMembers(detailResponse.data.workspace.members || []);
            setAiUsage(aiUsageResponse.data);
        } catch (error) {
            console.error('Error loading workspace detail:', error);
            alert('Workspace detayları yüklenemedi');
            navigate('/admin');
        } finally {
            setLoadingWorkspace(false);
            setLoadingAiUsage(false);
        }
    };

    // ========== COMPANY CRUD ==========
    const handleCreateCompany = async (e) => {
        e.preventDefault();
        setCreateCompanyError('');
        try {
            let ownerId = createCompanyForm.ownerId;

            // Yeni kullanıcı oluşturulacaksa önce onu oluştur
            if (createCompanyForm.createNewUser) {
                if (!createCompanyForm.newUserName || !createCompanyForm.newUserEmail || !createCompanyForm.newUserPassword) {
                    setCreateCompanyError('Yeni kullanıcı için ad, e-posta ve şifre gereklidir');
                    return;
                }

                // Yeni kullanıcı oluştur
                const userResponse = await adminAPI.createUser({
                    name: createCompanyForm.newUserName,
                    email: createCompanyForm.newUserEmail,
                    password: createCompanyForm.newUserPassword,
                    role: 'OWNER'
                });
                ownerId = userResponse.data.user.id;
            }

            if (!ownerId) {
                setCreateCompanyError('Firma sahibi seçin veya yeni kullanıcı oluşturun');
                return;
            }

            // Firmayı oluştur
            await companyAPI.create({
                name: createCompanyForm.name,
                ownerId,
                maxWorkspaces: createCompanyForm.maxWorkspaces,
                dailyAiChatLimit: createCompanyForm.dailyAiChatLimit,
                aiSubscriptionType: createCompanyForm.aiSubscriptionType,
                aiModel: createCompanyForm.aiModel
            });

            alert('Firma başarıyla oluşturuldu!');
            setIsCreateCompanyModalOpen(false);
            setCreateCompanyForm({
                name: '',
                ownerId: '',
                maxWorkspaces: 3,
                dailyAiChatLimit: 50,
                aiSubscriptionType: 'FREE',
                aiModel: 'gemini-2.5-flash',
                createNewUser: false,
                newUserName: '',
                newUserEmail: '',
                newUserPassword: ''
            });
            loadData();
        } catch (error) {
            setCreateCompanyError(error.response?.data?.error || 'Firma oluşturulamadı');
        }
    };

    const handleEditCompany = async (e) => {
        e.preventDefault();
        setEditCompanyError('');
        try {
            await companyAPI.update(companyId, editCompanyForm);
            alert('Firma güncellendi!');
            setIsEditCompanyModalOpen(false);
            loadCompanyDetail(companyId);
            loadData();
        } catch (error) {
            setEditCompanyError(error.response?.data?.error || 'Firma güncellenemedi');
        }
    };

    const handleDeleteCompany = async (cId) => {
        if (!confirm('Bu firmayı silmek istediğinizden emin misiniz? Workspaceler firmadan ayrılacak ama silinmeyecek.')) return;
        try {
            await companyAPI.delete(cId);
            if (companyId === cId) {
                navigate('/admin');
            }
            loadData();
        } catch (error) {
            alert('Firma silinemedi: ' + (error.response?.data?.error || error.message));
        }
    };

    // ========== WORKSPACE CRUD ==========
    const handleCreateWorkspaceInCompany = async (e) => {
        e.preventDefault();
        setCreateWorkspaceError('');
        try {
            await companyAPI.createWorkspace(companyId, createWorkspaceForm);
            alert('Workspace başarıyla oluşturuldu!');
            setIsCreateWorkspaceModalOpen(false);
            setCreateWorkspaceForm({ name: '', description: '' });
            loadCompanyDetail(companyId);
            loadData();
        } catch (error) {
            setCreateWorkspaceError(error.response?.data?.error || 'Workspace oluşturulamadı');
        }
    };

    const handleEditWorkspace = async (e) => {
        e.preventDefault();
        setEditWorkspaceError('');
        try {
            await adminAPI.updateWorkspace(workspaceId, editWorkspaceForm);
            alert('Workspace güncellendi!');
            setIsEditWorkspaceModalOpen(false);
            loadWorkspaceDetail(workspaceId);
            loadData();
        } catch (error) {
            setEditWorkspaceError(error.response?.data?.error || 'Workspace güncellenemedi');
        }
    };

    const handleDeleteWorkspace = async (wsId) => {
        if (!confirm('Bu workspace\'i silmek istediğinizden emin misiniz? Tüm veriler silinecek!')) return;
        try {
            await adminAPI.deleteWorkspace(wsId);
            if (workspaceId === wsId) {
                navigate(companyId ? `/admin/company/${companyId}` : '/admin');
            }
            loadData();
            if (companyId) loadCompanyDetail(companyId);
        } catch (error) {
            alert('Workspace silinemedi: ' + (error.response?.data?.error || error.message));
        }
    };

    // ========== USER MANAGEMENT ==========
    const handleCreateNewUser = async (e) => {
        e.preventDefault();
        setNewUserError('');
        try {
            await adminAPI.createUserForWorkspace(workspaceId, {
                name: newUserForm.name,
                email: newUserForm.email,
                password: newUserForm.password,
                role: newUserForm.role
            });

            alert('Kullanıcı oluşturuldu ve workspace\'e eklendi!');
            setIsCreateUserModalOpen(false);
            setNewUserForm({ name: '', email: '', password: '', role: 'AGENT' });
            loadWorkspaceDetail(workspaceId);
            loadData();
        } catch (error) {
            setNewUserError(error.response?.data?.error || 'Kullanıcı oluşturulamadı');
        }
    };

    const handleRemoveMember = async (memberId) => {
        if (!confirm('Bu kullanıcıyı workspace\'den çıkarmak istediğinize emin misiniz?')) return;
        try {
            await adminAPI.removeMemberFromWorkspace(workspaceId, memberId);
            loadWorkspaceDetail(workspaceId);
        } catch (error) {
            alert('Kullanıcı çıkarılamadı: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleUpdateMemberRole = async (memberId, newRole) => {
        try {
            await adminAPI.updateMemberRole(workspaceId, memberId, { role: newRole });
            loadWorkspaceDetail(workspaceId);
        } catch (error) {
            alert('Rol güncellenemedi: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleSwitchToWorkspace = async (ws) => {
        await switchWorkspace(ws);
        navigate('/');
    };

    // Gayrimenkul Modülü toggle
    const handleToggleRealEstate = async (currentEnabled) => {
        if (togglingRealEstate) return;
        const newValue = !currentEnabled;
        setTogglingRealEstate(true);
        try {
            await adminAPI.toggleRealEstateModule(workspaceId, newValue);
            // Workspace state'ini güncelle
            setSelectedWorkspace(prev => ({ ...prev, realEstateEnabled: newValue }));
        } catch (error) {
            alert('Modül durumu güncellenemedi: ' + (error.response?.data?.error || error.message));
        } finally {
            setTogglingRealEstate(false);
        }
    };

    // Randevu Modülü toggle
    const handleToggleAppointment = async (currentEnabled) => {
        if (togglingAppointment) return;
        const newValue = !currentEnabled;
        setTogglingAppointment(true);
        try {
            await adminAPI.toggleAppointmentModule(workspaceId, newValue);
            setSelectedWorkspace(prev => ({ ...prev, appointmentEnabled: newValue }));
        } catch (error) {
            alert('Randevu modülü güncellenemedi: ' + (error.response?.data?.error || error.message));
        } finally {
            setTogglingAppointment(false);
        }
    };

    // Workspace'i firmaya taşı
    const handleMoveWorkspaceToCompany = async () => {
        if (!selectedWorkspaceToMove || !targetCompanyId) return;

        try {
            await companyAPI.addWorkspace(targetCompanyId, selectedWorkspaceToMove.id);
            alert('Workspace firmaya taşındı!');
            setIsMoveWorkspaceModalOpen(false);
            setSelectedWorkspaceToMove(null);
            setTargetCompanyId('');
            loadData();
        } catch (error) {
            alert('Taşıma başarısız: ' + (error.response?.data?.error || error.message));
        }
    };

    // AI Limit güncelle
    const handleUpdateAiLimit = async (e) => {
        e.preventDefault();
        try {
            // Workspace'in bağlı olduğu company'i bul
            const companyIdToUpdate = selectedWorkspace?.companyId || selectedWorkspace?.company?.id;
            if (!companyIdToUpdate) {
                // Workspace bir firmaya bağlı değilse, adminAPI ile doğrudan workspace limitini güncelle
                await adminAPI.updateWorkspaceAiLimit(workspaceId, {
                    dailyAiChatLimit: aiLimitForm.dailyAiChatLimit,
                    aiSubscriptionType: aiLimitForm.aiSubscriptionType
                });
            } else {
                await companyAPI.update(companyIdToUpdate, {
                    dailyAiChatLimit: aiLimitForm.dailyAiChatLimit,
                    aiSubscriptionType: aiLimitForm.aiSubscriptionType
                });
            }
            alert('AI limitleri güncellendi!');
            setIsEditAiLimitModalOpen(false);
            loadWorkspaceDetail(workspaceId);
        } catch (error) {
            alert('AI limitleri güncellenemedi: ' + (error.response?.data?.error || error.message));
        }
    };

    if (loading) {
        return <div className="loading">Loading...</div>;
    }

    const searchFiltered = companies.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.owner?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.owner?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.workspaces?.some(ws => ws.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // ========== WORKSPACE DETAIL VIEW ==========
    if (workspaceId && selectedWorkspace) {
        return (
            <div className="admin-dashboard">
                <div className="workspace-detail-header">
                    <button className="back-btn" onClick={() => navigate(companyId ? `/admin/company/${companyId}` : '/admin')}>
                        <ArrowLeft size={20} />
                        <span>Go Back</span>
                    </button>
                    <div className="workspace-title-row">
                        <div className="workspace-title">
                            <Database size={28} />
                            <h1>{selectedWorkspace.name}</h1>
                        </div>
                        <div className="workspace-actions">
                            <button
                                className="btn-icon-text"
                                onClick={() => {
                                    setEditWorkspaceForm({ name: selectedWorkspace.name });
                                    setIsEditWorkspaceModalOpen(true);
                                }}
                            >
                                <Edit2 size={16} />
                                Edit
                            </button>
                            <button
                                className="btn-icon-text success"
                                onClick={() => handleSwitchToWorkspace(selectedWorkspace)}
                            >
                                <ExternalLink size={16} />
                                Switch
                            </button>
                            <button
                                className="btn-icon-text danger"
                                onClick={() => handleDeleteWorkspace(workspaceId)}
                            >
                                <Trash2 size={16} />
                                Delete
                            </button>
                        </div>
                    </div>
                </div>

                {/* Workspace Stats */}
                <div className="workspace-stats-grid">
                    <div className="stat-card">
                        <Users size={24} />
                        <div>
                            <span className="stat-value">{workspaceMembers.length}</span>
                            <span className="stat-label">Members</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <MessageSquare size={24} />
                        <div>
                            <span className="stat-value">{selectedWorkspace._count?.conversations || 0}</span>
                            <span className="stat-label">Conversations</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <Database size={24} />
                        <div>
                            <span className="stat-value">{selectedWorkspace._count?.contacts || 0}</span>
                            <span className="stat-label">{t('adminDashboard.contacts')}</span>
                        </div>
                    </div>
                </div>

                {/* AI Usage Card */}
                {aiUsage && (
                    <div className="ai-usage-card">
                        <div className="ai-usage-header">
                            <h3>🤖 AI Kullanım Durumu</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span className={`subscription-badge ${aiUsage.subscription?.toLowerCase()}`}>
                                    {aiUsage.subscriptionName}
                                </span>
                                <button
                                    className="btn-icon-text"
                                    onClick={() => {
                                        setAiLimitForm({
                                            dailyAiChatLimit: aiUsage.limit || 50,
                                            aiSubscriptionType: aiUsage.subscription || 'FREE'
                                        });
                                        setIsEditAiLimitModalOpen(true);
                                    }}
                                >
                                    <Edit2 size={14} />
                                    Düzenle
                                </button>
                            </div>
                        </div>
                        <div className="ai-usage-stats">
                            <div className="ai-stat">
                                <span className="ai-stat-value">{aiUsage.currentCount}</span>
                                <span className="ai-stat-label">Today</span>
                            </div>
                            <div className="ai-stat">
                                <span className="ai-stat-value">{aiUsage.limit}</span>
                                <span className="ai-stat-label">Limit</span>
                            </div>
                            <div className="ai-stat">
                                <span className="ai-stat-value">{aiUsage.remaining}</span>
                                <span className="ai-stat-label">Remaining</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modül Erişim Kontrolleri */}
                <div className="ai-usage-card" style={{ marginTop: '16px' }}>
                    <div className="ai-usage-header" style={{ marginBottom: 0 }}>
                        <h3>🏢 Modül Erişim Kontrolleri</h3>
                        <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>SuperAdmin tarafından yönetilir</span>
                    </div>
                    <div style={{ marginTop: '16px' }}>
                        {/* Gayrimenkul Toggle */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 0',
                            borderBottom: '1px solid var(--border-color, #e5e7eb)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 10,
                                    background: selectedWorkspace.realEstateEnabled
                                        ? 'linear-gradient(135deg, #1a5276, #2980b9)'
                                        : '#f3f4f6',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.2s'
                                }}>
                                    <Building2 size={18} color={selectedWorkspace.realEstateEnabled ? '#fff' : '#9ca3af'} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>
                                        Gayrimenkul Teklif Modülü
                                    </div>
                                    <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: 2 }}>
                                        {selectedWorkspace.realEstateEnabled
                                            ? 'Aktif — Firma bu modülü kullanabilir'
                                            : 'Pasif — Firma bu modülü göremez'}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleToggleRealEstate(selectedWorkspace.realEstateEnabled)}
                                disabled={togglingRealEstate}
                                style={{
                                    background: 'none', border: 'none', cursor: togglingRealEstate ? 'not-allowed' : 'pointer',
                                    opacity: togglingRealEstate ? 0.5 : 1,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 16px', borderRadius: 8,
                                    backgroundColor: selectedWorkspace.realEstateEnabled ? '#dbeafe' : '#f3f4f6',
                                    color: selectedWorkspace.realEstateEnabled ? '#1d4ed8' : '#6b7280',
                                    fontSize: '0.875rem', fontWeight: 600,
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {selectedWorkspace.realEstateEnabled
                                    ? <><ToggleRight size={20} /> Aktif</>
                                    : <><ToggleLeft size={20} /> Pasif</>}
                            </button>
                        </div>
                        {/* Randevu Modülü */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px', borderRadius: 12,
                            background: selectedWorkspace.appointmentEnabled !== false ? '#f0fdf4' : '#f9fafb',
                            border: `1.5px solid ${selectedWorkspace.appointmentEnabled !== false ? '#86efac' : '#e5e7eb'}`,
                            transition: 'all 0.2s ease'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 10,
                                    background: selectedWorkspace.appointmentEnabled !== false ? '#22c55e' : '#e5e7eb',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.2s'
                                }}>
                                    <span style={{ fontSize: 18 }}>🏥</span>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>
                                        Randevu Modülü
                                    </div>
                                    <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: 2 }}>
                                        {selectedWorkspace.appointmentEnabled !== false
                                            ? 'Aktif — Bot randevu verebilir'
                                            : 'Pasif — Bot randevu akışı devre dışı'}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleToggleAppointment(selectedWorkspace.appointmentEnabled !== false)}
                                disabled={togglingAppointment}
                                style={{
                                    background: 'none', border: 'none', cursor: togglingAppointment ? 'not-allowed' : 'pointer',
                                    opacity: togglingAppointment ? 0.5 : 1,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 16px', borderRadius: 8,
                                    backgroundColor: selectedWorkspace.appointmentEnabled !== false ? '#dcfce7' : '#f3f4f6',
                                    color: selectedWorkspace.appointmentEnabled !== false ? '#15803d' : '#6b7280',
                                    fontSize: '0.875rem', fontWeight: 600,
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {selectedWorkspace.appointmentEnabled !== false
                                    ? <><ToggleRight size={20} /> Aktif</>
                                    : <><ToggleLeft size={20} /> Pasif</>}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Members Section */}
                <div className="section-header">
                    <h2><Users size={20} /> Members ({workspaceMembers.length})</h2>
                    <button className="btn-primary" onClick={() => setIsCreateUserModalOpen(true)}>
                        <UserPlus size={16} />
                        Add User
                    </button>
                </div>

                <div className="members-table">
                    <table>
                        <thead>
                            <tr>
                                <th>{t('teams.userLabel')}</th>
                                <th>Email</th>
                                <th>Rol</th>
                                <th>{t('adminDashboard.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {workspaceMembers.map(member => (
                                <tr key={member.id}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="user-avatar">
                                                {member.user?.name?.charAt(0)?.toUpperCase() || 'U'}
                                            </div>
                                            <span>{member.user?.name || 'Unknown'}</span>
                                        </div>
                                    </td>
                                    <td>{member.user?.email || '-'}</td>
                                    <td>
                                        <select
                                            value={member.role}
                                            onChange={(e) => handleUpdateMemberRole(member.id, e.target.value)}
                                            className="role-select"
                                        >
                                            <option value="OWNER">Owner</option>
                                            <option value="AGENT">Agent</option>
                                        </select>
                                    </td>
                                    <td>
                                        <button
                                            className="btn-icon danger"
                                            onClick={() => handleRemoveMember(member.id)}
                                            title={t('common.remove') || 'Remove'}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Edit Workspace Modal */}
                {isEditWorkspaceModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsEditWorkspaceModalOpen(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <h2>Edit Workspace</h2>
                            {editWorkspaceError && <div className="error-message">{editWorkspaceError}</div>}
                            <form onSubmit={handleEditWorkspace}>
                                <div className="form-group">
                                    <label>Workspace Name</label>
                                    <input
                                        type="text"
                                        value={editWorkspaceForm.name}
                                        onChange={(e) => setEditWorkspaceForm({ ...editWorkspaceForm, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setIsEditWorkspaceModalOpen(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-primary">Save</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Create User Modal */}
                {isCreateUserModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsCreateUserModalOpen(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <h2>Add New User</h2>
                            {newUserError && <div className="error-message">{newUserError}</div>}
                            <form onSubmit={handleCreateNewUser}>
                                <div className="form-group">
                                    <label>Full Name</label>
                                    <input
                                        type="text"
                                        value={newUserForm.name}
                                        onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={newUserForm.email}
                                        onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Password</label>
                                    <input
                                        type="password"
                                        value={newUserForm.password}
                                        onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                        required
                                        minLength={6}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Role</label>
                                    <select
                                        value={newUserForm.role}
                                        onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                                    >
                                        <option value="AGENT">Agent</option>
                                        <option value="OWNER">Owner</option>
                                    </select>
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setIsCreateUserModalOpen(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-primary">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Edit AI Limit Modal */}
                {isEditAiLimitModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsEditAiLimitModalOpen(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <h2>Edit AI Limits</h2>
                            <form onSubmit={handleUpdateAiLimit}>
                                <div className="form-group">
                                    <label>AI Subscription Package</label>
                                    <select
                                        value={aiLimitForm.aiSubscriptionType}
                                        onChange={(e) => {
                                            const type = e.target.value;
                                            const limits = { FREE: 50, BASIC: 200, PRO: 1000, UNLIMITED: 999999 };
                                            setAiLimitForm({
                                                ...aiLimitForm,
                                                aiSubscriptionType: type,
                                                dailyAiChatLimit: limits[type] || 50
                                            });
                                        }}
                                    >
                                        <option value="FREE">FREE (50/gün)</option>
                                        <option value="BASIC">BASIC (200/gün)</option>
                                        <option value="PRO">PRO (1000/gün)</option>
                                        <option value="UNLIMITED">UNLIMITED (Sınırsız)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Daily AI Limit</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={aiLimitForm.dailyAiChatLimit}
                                        onChange={(e) => setAiLimitForm({ ...aiLimitForm, dailyAiChatLimit: parseInt(e.target.value) || 0 })}
                                        required
                                    />
                                    <div className="form-hint">999999 = Unlimited</div>
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setIsEditAiLimitModalOpen(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-primary">Save</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ========== COMPANY DETAIL VIEW ==========
    if (companyId && selectedCompany) {
        return (
            <div className="admin-dashboard">
                <div className="workspace-detail-header">
                    <button className="back-btn" onClick={() => navigate('/admin')}>
                        <ArrowLeft size={20} />
                        <span>Back to Companies</span>
                    </button>
                    <div className="workspace-title-row">
                        <div className="workspace-title">
                            <Briefcase size={28} />
                            <h1>{selectedCompany.name}</h1>
                        </div>
                        <div className="workspace-actions">
                            <button
                                className="btn-icon-text"
                                onClick={() => {
                                    setEditCompanyForm({
                                        name: selectedCompany.name,
                                        description: selectedCompany.description || '',
                                        ownerId: selectedCompany.ownerId,
                                        maxWorkspaces: selectedCompany.maxWorkspaces,
                                        dailyAiChatLimit: selectedCompany.dailyAiChatLimit,
                                        aiSubscriptionType: selectedCompany.aiSubscriptionType,
                                        aiModel: selectedCompany.aiModel || 'gemini-2.5-flash'
                                    });
                                    setIsEditCompanyModalOpen(true);
                                }}
                            >
                                <Edit2 size={16} />
                                Düzenle
                            </button>
                            <button
                                className="btn-icon-text danger"
                                onClick={() => handleDeleteCompany(companyId)}
                            >
                                <Trash2 size={16} />
                                Sil
                            </button>
                        </div>
                    </div>
                </div>

                {/* Company Info */}
                <div className="company-info-card">
                    <div className="info-row">
                        <span className="info-label">Firma Sahibi:</span>
                        <span className="info-value">{selectedCompany.owner?.name} ({selectedCompany.owner?.email})</span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">Workspace Limiti:</span>
                        <span className="info-value">{selectedCompany._count?.workspaces || 0} / {selectedCompany.maxWorkspaces}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">AI Abonelik:</span>
                        <span className="info-value">
                            <span className={`subscription-badge ${selectedCompany.aiSubscriptionType?.toLowerCase()}`}>
                                {selectedCompany.aiSubscriptionType} ({selectedCompany.dailyAiChatLimit >= 999999 ? 'Sınırsız' : `${selectedCompany.dailyAiChatLimit}/gün`})
                            </span>
                        </span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">🤖 AI Model:</span>
                        <span className="info-value">
                            <span style={{ 
                                background: selectedCompany.aiModel === 'gemini-2.5-pro' ? '#fef2f2' : selectedCompany.aiModel === 'gemini-2.0-flash-lite' ? '#f0fdf4' : '#eff6ff',
                                color: selectedCompany.aiModel === 'gemini-2.5-pro' ? '#dc2626' : selectedCompany.aiModel === 'gemini-2.0-flash-lite' ? '#16a34a' : '#2563eb',
                                padding: '2px 10px', borderRadius: '12px', fontSize: 12, fontWeight: 600
                            }}>
                                {selectedCompany.aiModel === 'gemini-2.0-flash-lite' ? '⚡ Lite' : selectedCompany.aiModel === 'gemini-2.5-pro' ? '🔴 Pro' : '🔵 Standart'}
                            </span>
                        </span>
                    </div>
                </div>

                {/* Workspaces Section */}
                <div className="section-header">
                    <h2><Database size={20} /> Workspaceler ({selectedCompany.workspaces?.length || 0})</h2>
                    {(selectedCompany._count?.workspaces || 0) < selectedCompany.maxWorkspaces && (
                        <button className="btn-primary" onClick={() => setIsCreateWorkspaceModalOpen(true)}>
                            <Plus size={16} />
                            Workspace Ekle
                        </button>
                    )}
                </div>

                {selectedCompany.workspaces?.length > 3 && (
                    <div className="search-bar" style={{ marginBottom: '16px' }}>
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Workspace ara..."
                            value={wsSearchTerm}
                            onChange={(e) => setWsSearchTerm(e.target.value)}
                        />
                    </div>
                )}

                <div className="workspaces-grid">
                    {(selectedCompany.workspaces || []).filter(ws =>
                        !wsSearchTerm || ws.name.toLowerCase().includes(wsSearchTerm.toLowerCase())
                    ).map(ws => (
                        <div key={ws.id} className="workspace-card">
                            <div className="workspace-card-header">
                                <Database size={24} />
                                <h3 style={{ color: '#111827', fontWeight: 600 }}>{ws.name}</h3>
                            </div>
                            <div className="workspace-card-stats">
                                <div className="mini-stat">
                                    <Users size={14} />
                                    <span>{ws._count?.members || 0} üye</span>
                                </div>
                                <div className="mini-stat">
                                    <MessageSquare size={14} />
                                    <span>{ws._count?.conversations || 0} sohbet</span>
                                </div>
                            </div>
                            <div className="workspace-card-actions">
                                <button
                                    className="btn-sm btn-secondary"
                                    onClick={() => navigate(`/admin/company/${companyId}/workspace/${ws.id}`)}
                                >
                                    Detaylar
                                </button>
                                <button
                                    className="btn-sm btn-success"
                                    onClick={() => handleSwitchToWorkspace(ws)}
                                >
                                    <ExternalLink size={14} />
                                    Geç
                                </button>
                                <button
                                    className="btn-sm btn-danger"
                                    onClick={() => handleDeleteWorkspace(ws.id)}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {(!selectedCompany.workspaces || selectedCompany.workspaces.length === 0) && (
                        <div className="empty-state">
                            <Database size={48} />
                            <p>Henüz workspace oluşturulmamış.</p>
                        </div>
                    )}
                </div>

                {/* Edit Company Modal */}
                {isEditCompanyModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsEditCompanyModalOpen(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <h2>Firma Edit</h2>
                            {editCompanyError && <div className="error-message">{editCompanyError}</div>}
                            <form onSubmit={handleEditCompany}>
                                <div className="form-group">
                                    <label>Firma Adı</label>
                                    <input
                                        type="text"
                                        value={editCompanyForm.name}
                                        onChange={(e) => setEditCompanyForm({ ...editCompanyForm, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{t('teams.descriptionLabel')}</label>
                                    <textarea
                                        value={editCompanyForm.description || ''}
                                        onChange={(e) => setEditCompanyForm({ ...editCompanyForm, description: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Firma Sahibi</label>
                                    <select
                                        value={editCompanyForm.ownerId}
                                        onChange={(e) => setEditCompanyForm({ ...editCompanyForm, ownerId: e.target.value })}
                                        required
                                    >
                                        <option value="">Seçin...</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Workspace Limiti</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={editCompanyForm.maxWorkspaces}
                                            onChange={(e) => setEditCompanyForm({ ...editCompanyForm, maxWorkspaces: parseInt(e.target.value) })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>AI Abonelik Paketi</label>
                                        <select
                                            value={editCompanyForm.aiSubscriptionType}
                                            onChange={(e) => {
                                                const type = e.target.value;
                                                const limits = { FREE: 50, BASIC: 200, PRO: 1000, UNLIMITED: 999999 };
                                                setEditCompanyForm({
                                                    ...editCompanyForm,
                                                    aiSubscriptionType: type,
                                                    dailyAiChatLimit: limits[type] || 50
                                                });
                                            }}
                                        >
                                            <option value="FREE">FREE (50/gün)</option>
                                            <option value="BASIC">BASIC (200/gün)</option>
                                            <option value="PRO">PRO (1000/gün)</option>
                                            <option value="UNLIMITED">UNLIMITED (Sınırsız)</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>🤖 AI Model (Hesap Varsayılanı)</label>
                                        <select
                                            value={editCompanyForm.aiModel || 'gemini-2.5-flash'}
                                            onChange={(e) => setEditCompanyForm({ ...editCompanyForm, aiModel: e.target.value })}
                                        >
                                            <option value="gemini-2.0-flash-lite">⚡ Lite — En ucuz ($0.02/M)</option>
                                            <option value="gemini-2.5-flash">🔵 Standart — Dengeli ($0.15/M)</option>
                                            <option value="gemini-2.5-pro">🔴 Pro — En iyi ($1.25/M)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setIsEditCompanyModalOpen(false)}>
                                        İptal
                                    </button>
                                    <button type="submit" className="btn-primary">Save</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Create Workspace Modal */}
                {isCreateWorkspaceModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsCreateWorkspaceModalOpen(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <h2>New Workspace Create</h2>
                            {createWorkspaceError && <div className="error-message">{createWorkspaceError}</div>}
                            <form onSubmit={handleCreateWorkspaceInCompany}>
                                <div className="form-group">
                                    <label>Workspace Adı</label>
                                    <input
                                        type="text"
                                        value={createWorkspaceForm.name}
                                        onChange={(e) => setCreateWorkspaceForm({ ...createWorkspaceForm, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Açıklama (opsiyonel)</label>
                                    <textarea
                                        value={createWorkspaceForm.description}
                                        onChange={(e) => setCreateWorkspaceForm({ ...createWorkspaceForm, description: e.target.value })}
                                    />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setIsCreateWorkspaceModalOpen(false)}>
                                        İptal
                                    </button>
                                    <button type="submit" className="btn-primary">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ========== COMPANIES LIST VIEW (Default) ==========
    return (
        <div className="admin-dashboard">
            <div className="dashboard-header">
                <div>
                    <h1>Firmalar</h1>
                    <p className="subtitle">Tüm firmaları ve workspace'leri yönetin</p>
                </div>
                <button className="btn-primary" onClick={() => setIsCreateCompanyModalOpen(true)}>
                    <Plus size={18} />
                    Yeni Firma Oluştur
                </button>
            </div>

            {/* Search */}
            <div className="search-bar">
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Firma, workspace veya sahip ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Companies Grid */}
            <div className="companies-grid">
                {searchFiltered.map(company => (
                    <div key={company.id} className="company-card">
                        <div className="company-card-header">
                            <div className="company-avatar">
                                {company.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="company-info">
                                <h3>{company.name}</h3>
                                <p className="owner-name">{company.owner?.name || 'Sahip yok'}</p>
                            </div>
                            <span className={`subscription-badge ${company.aiSubscriptionType?.toLowerCase()}`}>
                                {company.aiSubscriptionType}
                            </span>
                        </div>

                        <div className="company-stats">
                            <div className="company-stat">
                                <Database size={16} />
                                <span>{company._count?.workspaces || 0} / {company.maxWorkspaces} workspace</span>
                            </div>
                        </div>

                        {/* Workspaces Preview */}
                        {company.workspaces && company.workspaces.length > 0 && (() => {
                            const wsMatch = searchTerm && company.workspaces.some(ws => ws.name.toLowerCase().includes(searchTerm.toLowerCase()));
                            const isExpanded = expandedCompanies[company.id] || wsMatch;
                            const filteredWs = searchTerm
                                ? company.workspaces.filter(ws => ws.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                : company.workspaces;
                            return (
                                <div className="workspaces-preview">
                                    <div
                                        className="preview-header"
                                        onClick={() => setExpandedCompanies(prev => ({
                                            ...prev,
                                            [company.id]: !prev[company.id]
                                        }))}
                                    >
                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        <span>Workspaceler ({company.workspaces.length})</span>
                                    </div>
                                    {isExpanded && (
                                        <div className="preview-list">
                                            {filteredWs.map(ws => (
                                                <div key={ws.id} className="preview-item">
                                                    <span>{ws.name}</span>
                                                    <button
                                                        className="btn-mini"
                                                        onClick={() => handleSwitchToWorkspace(ws)}
                                                    >
                                                        <ExternalLink size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        <div className="company-card-actions">
                            <button
                                className="btn-sm btn-primary"
                                onClick={() => navigate(`/admin/company/${company.id}`)}
                            >
                                Yönet
                            </button>
                            <button
                                className="btn-sm btn-danger"
                                onClick={() => handleDeleteCompany(company.id)}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}

                {searchFiltered.length === 0 && unassignedWorkspaces.length === 0 && (
                    <div className="empty-state full-width">
                        <Briefcase size={64} />
                        <h3>Henüz firma yok</h3>
                        <p>New bir firma oluşturarak başlayın.</p>
                    </div>
                )}
            </div>

            {/* Firmaya Atanmamış Workspaceler */}
            {
                unassignedWorkspaces.length > 0 && (
                    <div className="unassigned-workspaces-section">
                        <div className="section-header">
                            <h2>
                                <Database size={20} />
                                Firmaya Atanmamış Workspaceler ({unassignedWorkspaces.length})
                            </h2>
                        </div>
                        <p className="section-description">
                            Bu workspace'ler henüz bir firmaya atanmamış. Bir firmaya taşımak için "Firmaya Taşı" butonunu kullanın.
                        </p>
                        <div className="unassigned-workspaces-grid">
                            {unassignedWorkspaces.filter(ws =>
                                !searchTerm || ws.name.toLowerCase().includes(searchTerm.toLowerCase())
                            ).map(ws => (
                                <div key={ws.id} className="unassigned-workspace-card">
                                    <div className="workspace-card-header">
                                        <Database size={24} />
                                        <h3>{ws.name}</h3>
                                    </div>
                                    <div className="workspace-card-stats">
                                        <div className="mini-stat">
                                            <Users size={14} />
                                            <span>{ws._count?.members || 0} üye</span>
                                        </div>
                                        <div className="mini-stat">
                                            <MessageSquare size={14} />
                                            <span>{ws._count?.conversations || 0} sohbet</span>
                                        </div>
                                    </div>
                                    <div className="workspace-card-actions">
                                        <button
                                            className="btn-sm btn-primary"
                                            onClick={() => {
                                                setSelectedWorkspaceToMove(ws);
                                                setIsMoveWorkspaceModalOpen(true);
                                            }}
                                        >
                                            <Briefcase size={14} />
                                            Firmaya Taşı
                                        </button>
                                        <button
                                            className="btn-sm btn-success"
                                            onClick={() => handleSwitchToWorkspace(ws)}
                                        >
                                            <ExternalLink size={14} />
                                            Geç
                                        </button>
                                        <button
                                            className="btn-sm btn-secondary"
                                            onClick={() => navigate(`/admin/workspace/${ws.id}`)}
                                        >
                                            Detay
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* Move Workspace to Company Modal */}
            {
                isMoveWorkspaceModalOpen && selectedWorkspaceToMove && (
                    <div className="modal-overlay" onClick={() => setIsMoveWorkspaceModalOpen(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <h2>Workspace'i Firmaya Taşı</h2>
                            <p className="modal-description">
                                <strong>"{selectedWorkspaceToMove.name}"</strong> workspace'ini hangi firmaya taşımak istiyorsunuz?
                            </p>
                            <div className="form-group">
                                <label>Hedef Firma</label>
                                <select
                                    value={targetCompanyId}
                                    onChange={(e) => setTargetCompanyId(e.target.value)}
                                    required
                                >
                                    <option value="">Firma Seçin...</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} ({c._count?.workspaces || 0}/{c.maxWorkspaces} workspace)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {companies.length === 0 && (
                                <div className="warning-message">
                                    Henüz firma yok. Önce bir firma oluşturun.
                                </div>
                            )}
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setIsMoveWorkspaceModalOpen(false)}>
                                    İptal
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    disabled={!targetCompanyId}
                                    onClick={handleMoveWorkspaceToCompany}
                                >
                                    Taşı
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Create Company Modal */}
            {
                isCreateCompanyModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsCreateCompanyModalOpen(false)}>
                        <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                            <h2>New Firma Create</h2>
                            {createCompanyError && <div className="error-message">{createCompanyError}</div>}
                            <form onSubmit={handleCreateCompany}>
                                <div className="form-group">
                                    <label>Firma Adı</label>
                                    <input
                                        type="text"
                                        value={createCompanyForm.name}
                                        onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, name: e.target.value })}
                                        required
                                    />
                                </div>

                                {/* Firma Sahibi Seçimi */}
                                <div className="form-group">
                                    <label>Firma Sahibi (Owner)</label>
                                    <div className="owner-selection-tabs">
                                        <button
                                            type="button"
                                            className={`tab-btn ${!createCompanyForm.createNewUser ? 'active' : ''}`}
                                            onClick={() => setCreateCompanyForm({ ...createCompanyForm, createNewUser: false })}
                                        >
                                            Mevcut Kullanıcı Seç
                                        </button>
                                        <button
                                            type="button"
                                            className={`tab-btn ${createCompanyForm.createNewUser ? 'active' : ''}`}
                                            onClick={() => setCreateCompanyForm({ ...createCompanyForm, createNewUser: true, ownerId: '' })}
                                        >
                                            Yeni Kullanıcı Oluştur
                                        </button>
                                    </div>
                                </div>

                                {!createCompanyForm.createNewUser ? (
                                    <div className="form-group">
                                        <select
                                            value={createCompanyForm.ownerId}
                                            onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, ownerId: e.target.value })}
                                        >
                                            <option value="">{t('teams.selectUser')}</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="new-user-form">
                                        <div className="form-group">
                                            <label>Ad Soyad</label>
                                            <input
                                                type="text"
                                                value={createCompanyForm.newUserName}
                                                onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, newUserName: e.target.value })}
                                                placeholder="Kullanıcı adı"
                                                required={createCompanyForm.createNewUser}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>E-posta</label>
                                            <input
                                                type="email"
                                                value={createCompanyForm.newUserEmail}
                                                onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, newUserEmail: e.target.value })}
                                                placeholder="ornek@email.com"
                                                required={createCompanyForm.createNewUser}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Şifre</label>
                                            <input
                                                type="password"
                                                value={createCompanyForm.newUserPassword}
                                                onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, newUserPassword: e.target.value })}
                                                placeholder="Şifre"
                                                required={createCompanyForm.createNewUser}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Workspace Limiti</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={createCompanyForm.maxWorkspaces}
                                            onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, maxWorkspaces: parseInt(e.target.value) })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>AI Abonelik Paketi</label>
                                        <select
                                            value={createCompanyForm.aiSubscriptionType}
                                            onChange={(e) => {
                                                const type = e.target.value;
                                                const limits = { FREE: 50, BASIC: 200, PRO: 1000, UNLIMITED: 999999 };
                                                setCreateCompanyForm({
                                                    ...createCompanyForm,
                                                    aiSubscriptionType: type,
                                                    dailyAiChatLimit: limits[type] || 50
                                                });
                                            }}
                                        >
                                            <option value="FREE">FREE (50/gün)</option>
                                            <option value="BASIC">BASIC (200/gün)</option>
                                            <option value="PRO">PRO (1000/gün)</option>
                                            <option value="UNLIMITED">UNLIMITED (Sınırsız)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setIsCreateCompanyModalOpen(false)}>
                                        İptal
                                    </button>
                                    <button type="submit" className="btn-primary">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AdminDashboard;
