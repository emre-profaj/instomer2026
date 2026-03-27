import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import {
    History,
    RefreshCw,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Filter,
    UserPlus,
    UserMinus,
    Edit,
    Building2,
    Trash2,
    Settings,
    Users,
    Zap,
    Shield
} from 'lucide-react';
import './AdminActivityLog.css';

const ACTION_LABELS = {
    CREATE_USER: { label: 'Kullanıcı Oluşturma', icon: UserPlus, color: '#10b981' },
    DELETE_USER: { label: 'Kullanıcı Silme', icon: UserMinus, color: '#ef4444' },
    UPDATE_USER: { label: 'Kullanıcı Güncelleme', icon: Edit, color: '#3b82f6' },
    CREATE_WORKSPACE: { label: 'Workspace Oluşturma', icon: Building2, color: '#10b981' },
    DELETE_WORKSPACE: { label: 'Workspace Silme', icon: Trash2, color: '#ef4444' },
    UPDATE_WORKSPACE: { label: 'Workspace Güncelleme', icon: Edit, color: '#f59e0b' },
    ADD_MEMBER: { label: 'Üye Ekleme', icon: Users, color: '#10b981' },
    REMOVE_MEMBER: { label: 'Üye Çıkarma', icon: UserMinus, color: '#ef4444' },
    UPDATE_SETTINGS: { label: 'Ayar Güncelleme', icon: Settings, color: '#8b5cf6' },
    UPDATE_AI_LIMIT: { label: 'AI Limit Güncelleme', icon: Zap, color: '#f59e0b' },
    RESET_AI_COUNTER: { label: 'AI Sayaç Sıfırlama', icon: Zap, color: '#6366f1' }
};

const AdminActivityLog = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
    const [actionFilter, setActionFilter] = useState('');

    useEffect(() => {
        loadLogs();
    }, [pagination.page, actionFilter]);

    const loadLogs = async () => {
        try {
            setLoading(true);
            const params = { page: pagination.page, limit: 30 };
            if (actionFilter) params.action = actionFilter;

            const response = await adminAPI.getActivityLogs(params);
            setLogs(response.data.logs);
            setPagination(prev => ({
                ...prev,
                total: response.data.pagination.total,
                totalPages: response.data.pagination.totalPages
            }));
        } catch (error) {
            console.error('Activity logs error:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getActionInfo = (action) => {
        return ACTION_LABELS[action] || { label: action, icon: Shield, color: '#94a3b8' };
    };

    const parseDetails = (details) => {
        if (!details) return null;
        try {
            return JSON.parse(details);
        } catch {
            return null;
        }
    };

    return (
        <div className="activity-log-page">
            <div className="activity-log-header">
                <div className="header-left">
                    <History size={24} />
                    <h1>İşlem Geçmişi</h1>
                    <span className="log-count">{pagination.total} kayıt</span>
                </div>
                <div className="header-right">
                    <div className="filter-group">
                        <Filter size={16} />
                        <select
                            value={actionFilter}
                            onChange={(e) => {
                                setActionFilter(e.target.value);
                                setPagination(prev => ({ ...prev, page: 1 }));
                            }}
                            className="action-filter-select"
                        >
                            <option value="">Tüm İşlemler</option>
                            {Object.entries(ACTION_LABELS).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={loadLogs} className="refresh-btn" disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        Yenile
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <RefreshCw className="spin" size={32} />
                    <p>Yükleniyor...</p>
                </div>
            ) : logs.length === 0 ? (
                <div className="empty-state">
                    <History size={48} />
                    <h3>Henüz işlem kaydı yok</h3>
                    <p>Admin panelinde yapılan işlemler burada görünecektir.</p>
                </div>
            ) : (
                <>
                    <div className="activity-log-table-wrapper">
                        <table className="activity-log-table">
                            <thead>
                                <tr>
                                    <th>Tarih</th>
                                    <th>Kullanıcı</th>
                                    <th>İşlem</th>
                                    <th>Hedef</th>
                                    <th>Detay</th>
                                    <th>IP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => {
                                    const actionInfo = getActionInfo(log.action);
                                    const ActionIcon = actionInfo.icon;
                                    const details = parseDetails(log.details);

                                    return (
                                        <tr key={log.id}>
                                            <td className="date-cell">
                                                <div className="cell-content">
                                                    <Calendar size={14} />
                                                    {formatDate(log.createdAt)}
                                                </div>
                                            </td>
                                            <td className="user-cell">
                                                <div className="cell-content">
                                                    <div className="user-avatar-sm">
                                                        {log.userName?.charAt(0)?.toUpperCase() || 'A'}
                                                    </div>
                                                    {log.userName}
                                                </div>
                                            </td>
                                            <td className="action-cell">
                                                <span
                                                    className="action-badge"
                                                    style={{ backgroundColor: actionInfo.color + '18', color: actionInfo.color, borderColor: actionInfo.color + '40' }}
                                                >
                                                    <ActionIcon size={14} />
                                                    {actionInfo.label}
                                                </span>
                                            </td>
                                            <td className="target-cell">
                                                <div className="cell-content">
                                                    {log.targetName && (
                                                        <span className="target-name">
                                                            {log.targetName}
                                                        </span>
                                                    )}
                                                    {log.targetType && (
                                                        <span className="target-type">{log.targetType}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="details-cell">
                                                {details && (
                                                    <span className="details-text">
                                                        {details.email && `📧 ${details.email}`}
                                                        {details.role && ` | 👤 ${details.role}`}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="ip-cell">
                                                {log.ipAddress && (
                                                    <code>{log.ipAddress}</code>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {pagination.totalPages > 1 && (
                        <div className="pagination">
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                disabled={pagination.page <= 1}
                                className="page-btn"
                            >
                                <ChevronLeft size={16} />
                                Önceki
                            </button>
                            <span className="page-info">
                                Sayfa {pagination.page} / {pagination.totalPages}
                            </span>
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                disabled={pagination.page >= pagination.totalPages}
                                className="page-btn"
                            >
                                Sonraki
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AdminActivityLog;
