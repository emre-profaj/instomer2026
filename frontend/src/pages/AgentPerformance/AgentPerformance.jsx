import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import {
    Users,
    RefreshCw,
    Calendar,
    MessageCircle,
    Clock,
    CheckCircle,
    User,
    Award,
    Zap,
    Mail,
    TrendingUp,
    Activity,
    Bot
} from 'lucide-react';
import './AgentPerformance.css';

const AgentPerformance = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [loading, setLoading] = useState(true);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [error, setError] = useState(null);

    // Date filter states
    const [dateFilter, setDateFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadAgentPerformance();
        }
    }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const getDateRange = () => {
        const now = new Date();
        let start = null;
        let end = null;

        switch (dateFilter) {
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                break;
            case 'yesterday':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
                break;
            case 'week': {
                // Monday to Sunday (ISO week)
                const day = now.getDay();
                const diffToMonday = day === 0 ? 6 : day - 1;
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
            }
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                break;
            case 'custom':
                if (startDate) start = new Date(startDate);
                if (endDate) end = new Date(endDate);
                break;
            default:
                return {};
        }

        const params = {};
        if (start) params.startDate = start.toISOString().split('T')[0];
        if (end) params.endDate = end.toISOString().split('T')[0];
        return params;
    };

    const loadAgentPerformance = async () => {
        try {
            setLoading(true);
            setError(null);
            const dateParams = getDateRange();
            const response = await contactAPI.getAgentPerformance(currentWorkspace.id, dateParams);
            setAgentPerformance(response.data);
        } catch (err) {
            console.error('Agent performance loading error:', err);
            setError('Agent performans verileri yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num?.toString() || '0';
    };

    const formatResponseTime = (minutes) => {
        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return `${hours} sa ${mins} dk`;
        }
        return `${minutes} dk`;
    };

    if (!currentWorkspace) {
        return (
            <div className="agent-performance-page">
                <div className="empty-state">
                    <Activity size={48} />
                    <h3>{t('analytics.selectWorkspace')}</h3>
                    <p>{t('analytics.selectWorkspaceDesc')}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="agent-performance-page">
                <div className="error-state">
                    <p>{error}</p>
                    <button onClick={loadAgentPerformance} className="btn btn-primary">
                        Tekrar Dene
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="agent-performance-page">
            <div className="page-header">
                <div className="header-left">
                    <Activity size={28} />
                    <h1>{t('analytics.agentPerformance')}</h1>
                </div>
                <div className="header-right">
                    {/* Date Filter */}
                    <div className="date-filter-group">
                        <Calendar size={16} className="filter-icon" />
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="date-filter-select"
                        >
                            <option value="all">{t('analytics.allTime')}</option>
                            <option value="today">{t('common.today')}</option>
                            <option value="yesterday">{t('common.yesterday')}</option>
                            <option value="week">{t('analytics.last7Days')}</option>
                            <option value="month">{t('analytics.thisMonth')}</option>
                            <option value="custom">{t('analytics.customDate')}</option>
                        </select>
                    </div>

                    {dateFilter === 'custom' && (
                        <div className="custom-date-inputs">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="date-input"
                                placeholder={t('common.start')}
                            />
                            <span className="date-separator">-</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="date-input"
                                placeholder={t('common.end')}
                            />
                        </div>
                    )}

                    <button onClick={loadAgentPerformance} className="btn btn-secondary" disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        Yenile
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <RefreshCw className="spin" size={32} />
                    <p>{t('agentPerformance.loading')}</p>
                </div>
            ) : (
                <>
                    {/* Team Totals */}
                    <div className="stats-grid team-totals">
                        <div className="stat-card conversations">
                            <div className="stat-icon">
                                <MessageCircle size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{formatNumber(agentPerformance?.teamTotals?.totalConversations || 0)}</span>
                                <span className="stat-label">Toplam Sohbet</span>
                            </div>
                        </div>

                        <div className="stat-card resolved">
                            <div className="stat-icon">
                                <CheckCircle size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{formatNumber(agentPerformance?.teamTotals?.resolvedConversations || 0)}</span>
                                <span className="stat-label">{t('agentPerformance.resolvedChats')}</span>
                            </div>
                        </div>

                        <div className="stat-card response-time">
                            <div className="stat-icon">
                                <Clock size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{formatResponseTime(agentPerformance?.teamTotals?.avgResponseTime || 0)}</span>
                                <span className="stat-label">{t('agentPerformance.avgResponseTime')}</span>
                            </div>
                        </div>

                        <div className="stat-card resolution-time">
                            <div className="stat-icon">
                                <TrendingUp size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{formatResponseTime(agentPerformance?.teamTotals?.avgResolutionTime || 0)}</span>
                                <span className="stat-label">{t('agentPerformance.avgResolutionTime')}</span>
                            </div>
                        </div>

                        <div className="stat-card resolution-rate">
                            <div className="stat-icon">
                                <Zap size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{agentPerformance?.teamTotals?.avgResolutionRate || 0}%</span>
                                <span className="stat-label">{t('agentPerformance.avgResolutionRate')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Agent Cards */}
                    <div className="agents-section">
                        <div className="section-header">
                            <Users size={20} />
                            <h2>Temsilci Performansı</h2>
                            <span className="agent-count">{agentPerformance?.agents?.length || 0} temsilci</span>
                        </div>

                        {agentPerformance?.agents?.length > 0 ? (
                            <div className="agent-cards-grid">
                                {agentPerformance.agents.map((agent, index) => (
                                    <div key={agent.userId} className={`agent-card ${index === 0 && agentPerformance.agents.length > 1 ? 'top-performer' : ''}`}>
                                        {index === 0 && agentPerformance.agents.length > 1 && (
                                            <div className="top-badge">
                                                <Award size={14} />
                                                <span>En İyi Performans</span>
                                            </div>
                                        )}

                                        <div className="agent-card-header">
                                            <div className="agent-avatar">
                                                {agent.avatar ? (
                                                    <img src={agent.avatar} alt={agent.name} />
                                                ) : (
                                                    <User size={28} />
                                                )}
                                            </div>
                                            <div className="agent-info">
                                                <h4>{agent.name}</h4>
                                                <span className="agent-role">{agent.role === 'OWNER' ? 'Yönetici' : 'Temsilci'}</span>
                                            </div>
                                        </div>

                                        <div className="agent-metrics-grid">
                                            <div className="metric-box">
                                                <div className="metric-icon conversations">
                                                    <MessageCircle size={18} />
                                                </div>
                                                <div className="metric-data">
                                                    <span className="metric-value">{agent.totalConversations}</span>
                                                    <span className="metric-label">Sohbet</span>
                                                </div>
                                            </div>

                                            <div className="metric-box">
                                                <div className="metric-icon resolved">
                                                    <CheckCircle size={18} />
                                                </div>
                                                <div className="metric-data">
                                                    <span className="metric-value">{agent.resolvedConversations}</span>
                                                    <span className="metric-label">Çözülen</span>
                                                </div>
                                            </div>

                                            <div className="metric-box">
                                                <div className="metric-icon messages">
                                                    <Mail size={18} />
                                                </div>
                                                <div className="metric-data">
                                                    <span className="metric-value">{agent.messagesSent}</span>
                                                    <span className="metric-label">Mesaj</span>
                                                </div>
                                            </div>

                                            <div className="metric-box">
                                                <div className="metric-icon open">
                                                    <TrendingUp size={18} />
                                                </div>
                                                <div className="metric-data">
                                                    <span className="metric-value">{agent.openConversations}</span>
                                                    <span className="metric-label">Açık</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="agent-performance-stats">
                                            <div className="performance-stat">
                                                <Clock size={16} />
                                                <span className="stat-label">Yanıt Süresi:</span>
                                                <span className="stat-value">{formatResponseTime(agent.avgResponseTimeMinutes)}</span>
                                            </div>

                                            <div className="performance-stat">
                                                <TrendingUp size={16} />
                                                <span className="stat-label">Çözüm Süresi:</span>
                                                <span className="stat-value">{formatResponseTime(agent.avgResolutionTimeMinutes || 0)}</span>
                                            </div>

                                            <div className="performance-stat resolution">
                                                <Zap size={16} />
                                                <span className="stat-label">Çözüm Oranı:</span>
                                                <div className="resolution-bar-container">
                                                    <div
                                                        className="resolution-bar"
                                                        style={{
                                                            '--width': `${agent.resolutionRate}%`,
                                                            '--color': agent.resolutionRate >= 80 ? '#10b981' :
                                                                agent.resolutionRate >= 50 ? '#f59e0b' : '#ef4444'
                                                        }}
                                                    />
                                                    <span className="resolution-value">{agent.resolutionRate}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-agents">
                                <User size={48} />
                                <h3>Henüz Temsilci Verisi Yok</h3>
                                <p>Sohbetler temsilcilere atandığında performans verileri burada görünecektir.</p>
                            </div>
                        )}
                    </div>

                    {/* Bot Performance Section */}
                    {agentPerformance?.bots?.length > 0 && (
                        <div className="agents-section bots-section">
                            <div className="section-header">
                                <Bot size={20} />
                                <h2>AI Bot Performansı</h2>
                                <span className="agent-count">{agentPerformance.bots.length} bot</span>
                            </div>

                            <div className="agent-cards-grid bot-cards-grid">
                                {agentPerformance.bots.map((bot) => (
                                    <div key={bot.botId} className="agent-card bot-card">
                                        <div className="agent-card-header">
                                            <div className="agent-avatar bot-avatar">
                                                <Bot size={28} />
                                            </div>
                                            <div className="agent-info">
                                                <h4>{bot.name}</h4>
                                                <span className="agent-role bot-role">{bot.role}</span>
                                            </div>
                                            <div className={`bot-status ${bot.isActive ? 'active' : 'inactive'}`}>
                                                {bot.isActive ? 'Aktif' : 'Pasif'}
                                            </div>
                                        </div>

                                        <div className="agent-metrics-grid">
                                            <div className="metric-box">
                                                <div className="metric-icon messages">
                                                    <Mail size={18} />
                                                </div>
                                                <div className="metric-data">
                                                    <span className="metric-value">{bot.messagesSent}</span>
                                                    <span className="metric-label">Mesaj</span>
                                                </div>
                                            </div>

                                            <div className="metric-box">
                                                <div className="metric-icon conversations">
                                                    <MessageCircle size={18} />
                                                </div>
                                                <div className="metric-data">
                                                    <span className="metric-value">{bot.totalConversations}</span>
                                                    <span className="metric-label">Sohbet</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Total Bot Messages Info */}
                    {agentPerformance?.teamTotals?.totalBotMessages > 0 && (
                        <div className="bot-total-info">
                            <Bot size={16} />
                            <span>Toplam bot mesajı: <strong>{agentPerformance.teamTotals.totalBotMessages}</strong></span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AgentPerformance;

