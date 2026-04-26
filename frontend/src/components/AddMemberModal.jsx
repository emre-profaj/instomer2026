import { useState, useEffect } from 'react';
import { workspaceAPI, companyAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { X, UserPlus, Users } from 'lucide-react';
import './AddMemberModal.css';

const DEFAULT_WORKING_HOURS = {
    monday: { enabled: true, start: '08:00', end: '18:00' },
    tuesday: { enabled: true, start: '08:00', end: '18:00' },
    wednesday: { enabled: true, start: '08:00', end: '18:00' },
    thursday: { enabled: true, start: '08:00', end: '18:00' },
    friday: { enabled: true, start: '08:00', end: '18:00' },
    saturday: { enabled: false, start: '08:00', end: '18:00' },
    sunday: { enabled: false, start: '08:00', end: '18:00' }
};

const DAY_LABELS = {
    monday: 'Pazartesi', tuesday: 'Salı', wednesday: 'Çarşamba',
    thursday: 'Perşembe', friday: 'Cuma', saturday: 'Cumartesi', sunday: 'Pazar'
};

const AddMemberModal = ({ workspaceId, onClose, onSuccess }) => {
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('existing'); // 'existing' or 'new'

    // New user form
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('AGENT');
    const [workingHours, setWorkingHours] = useState(DEFAULT_WORKING_HOURS);

    // Existing users
    const [companyUsers, setCompanyUsers] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [loadingUsers, setLoadingUsers] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (activeTab === 'existing' && currentWorkspace?.company?.id) {
            fetchCompanyUsers();
        }
    }, [activeTab, currentWorkspace]);

    const fetchCompanyUsers = async () => {
        try {
            setLoadingUsers(true);
            const response = await companyAPI.getCompanyUsers(currentWorkspace.companyId);

            // Filter out users already in this workspace
            const currentWorkspaceMembers = response.data.users.filter(user =>
                user.workspaces?.some(ws => ws.id === workspaceId)
            ).map(u => u.id);

            const availableUsers = response.data.users.filter(user =>
                !currentWorkspaceMembers.includes(user.id)
            );

            setCompanyUsers(availableUsers);
        } catch (error) {
            console.error('Error fetching company users:', error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleSubmitNew = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await workspaceAPI.addMember(workspaceId, {
                email,
                role,
                name: name || undefined,
                password: password || undefined,
                workingHours
            });
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Üye eklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitExisting = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (!selectedUserId) {
            setError('Lütfen bir kullanıcı seçin');
            setLoading(false);
            return;
        }

        try {
            const selectedUser = companyUsers.find(u => u.id === selectedUserId);
            await workspaceAPI.addMember(workspaceId, {
                email: selectedUser.email,
                role
            });
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Üye eklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content add-member-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Takıma Üye Ekle</h3>
                    <button className="btn-icon" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="modal-tabs">
                    <button
                        className={`tab-button ${activeTab === 'existing' ? 'active' : ''}`}
                        onClick={() => setActiveTab('existing')}
                    >
                        <Users size={16} />
                        Mevcut Kullanıcılar
                    </button>
                    <button
                        className={`tab-button ${activeTab === 'new' ? 'active' : ''}`}
                        onClick={() => setActiveTab('new')}
                    >
                        <UserPlus size={16} />
                        Yeni Kullanıcı
                    </button>
                </div>

                {/* Existing Users Tab */}
                {activeTab === 'existing' && (
                    <form onSubmit={handleSubmitExisting}>
                        <div className="modal-body">
                            {!currentWorkspace?.company?.id ? (
                                <div className="info-message">
                                    Bu workspace bir firmaya bağlı değil. Sadece yeni kullanıcı ekleyebilirsiniz.
                                </div>
                            ) : loadingUsers ? (
                                <div className="loading">Kullanıcılar yükleniyor...</div>
                            ) : companyUsers.length === 0 ? (
                                <div className="info-message">
                                    Firma içinde bu workspace'e eklenebilecek başka kullanıcı yok.
                                </div>
                            ) : (
                                <>
                                    <div className="form-group">
                                        <label>Kullanıcı Seçin</label>
                                        <select
                                            className="input"
                                            value={selectedUserId}
                                            onChange={(e) => setSelectedUserId(e.target.value)}
                                            required
                                        >
                                            <option value="">-- Kullanıcı Seçin --</option>
                                            {companyUsers.map(user => (
                                                <option key={user.id} value={user.id}>
                                                    {user.name} ({user.email})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Rol</label>
                                        <select
                                            className="input"
                                            value={role}
                                            onChange={(e) => setRole(e.target.value)}
                                        >
                                            <option value="AGENT">Agent (Temsilci)</option>
                                            <option value="OWNER">Owner (Yönetici)</option>
                                        </select>
                                        <small className="text-muted">
                                            Agent: Sadece atanan sohbetleri görür ve yönetir
                                        </small>
                                    </div>
                                </>
                            )}

                            {error && (
                                <div className="error-message">
                                    {error}
                                </div>
                            )}
                        </div>

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onClose}
                                disabled={loading}
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={loading || companyUsers.length === 0}
                            >
                                {loading ? 'Ekleniyor...' : 'Üye Ekle'}
                            </button>
                        </div>
                    </form>
                )}

                {/* New User Tab */}
                {activeTab === 'new' && (
                    <form onSubmit={handleSubmitNew}>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>E-posta Adresi</label>
                                <input
                                    type="email"
                                    className="input"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="kullanici@example.com"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>İsim Soyisim</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Örn: Emre Yılmaz"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Şifre</label>
                                <input
                                    type="password"
                                    className="input"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="En az 6 karakter"
                                    required
                                />
                                <small className="text-muted">
                                    Yeni kullanıcı hesabı oluşturulacaktır.
                                </small>
                            </div>

                            <div className="form-group">
                                <label>Rol</label>
                                <select
                                    className="input"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                >
                                    <option value="AGENT">Agent (Temsilci)</option>
                                    <option value="OWNER">Owner (Yönetici)</option>
                                </select>
                                <small className="text-muted">
                                    Agent: Sadece atanan sohbetleri görür ve yönetir
                                </small>
                            </div>

                            {/* Working Hours */}
                            <div className="wh-section">
                                <div className="wh-title">Çalışma Saatleri</div>
                                <div className="wh-table">
                                    {Object.entries(DAY_LABELS).map(([key, label]) => (
                                        <div key={key} className={`wh-row ${!workingHours[key]?.enabled ? 'disabled' : ''}`}>
                                            <label className="wh-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={workingHours[key]?.enabled ?? false}
                                                    onChange={(e) => setWorkingHours(prev => ({
                                                        ...prev, [key]: { ...prev[key], enabled: e.target.checked }
                                                    }))}
                                                />
                                                <span className="wh-slider" />
                                            </label>
                                            <span className="wh-day">{label}</span>
                                            <div className="wh-times">
                                                <input type="time" value={workingHours[key]?.start || '08:00'}
                                                    onChange={(e) => setWorkingHours(prev => ({
                                                        ...prev, [key]: { ...prev[key], start: e.target.value }
                                                    }))}
                                                    disabled={!workingHours[key]?.enabled} />
                                                <span className="wh-sep">—</span>
                                                <input type="time" value={workingHours[key]?.end || '18:00'}
                                                    onChange={(e) => setWorkingHours(prev => ({
                                                        ...prev, [key]: { ...prev[key], end: e.target.value }
                                                    }))}
                                                    disabled={!workingHours[key]?.enabled} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {error && (
                                <div className="error-message">
                                    {error}
                                </div>
                            )}
                        </div>

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onClose}
                                disabled={loading}
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={loading}
                            >
                                {loading ? 'Oluşturuluyor...' : 'Kullanıcı Oluştur'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default AddMemberModal;
