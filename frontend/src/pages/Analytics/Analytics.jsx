import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI, dealAPI } from '../../services/api';
import {
    BarChart3,
    Users,
    TrendingUp,
    TrendingDown,
    UserCheck,
    UserX,
    RefreshCw,
    PieChart as PieChartIcon,
    MessageSquare,
    Target,
    Calendar,
    Filter,
    Mail,
    MessageCircle,
    Pencil,
    HelpCircle,
    Globe,
    FileText,
    ShoppingCart,
    Receipt,
    DollarSign
} from 'lucide-react';
import './Analytics.css';

// Platform icon components
const WhatsAppIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

const FacebookIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#1877F2">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
);

const InstagramIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#E4405F">
        <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
    </svg>
);

const EmailIcon = ({ size = 18 }) => (
    <Mail size={size} color="#EA4335" />
);

const WidgetIcon = ({ size = 18 }) => (
    <Globe size={size} color="#ef4444" />
);

const ManualIcon = ({ size = 18 }) => (
    <Pencil size={size} color="#8b5cf6" />
);

const Analytics = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState(null);
    const [salesStats, setSalesStats] = useState(null);
    const [error, setError] = useState(null);

    // Date filter states
    const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadAnalytics();
        }
    }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const getDateRange = () => {
        const now = new Date();
        let start = null;
        let end = null;

        switch (dateFilter) {
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                end = now;
                break;
            case 'yesterday':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
                break;
            case 'week':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
                end = now;
                break;
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = now;
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

    const loadAnalytics = async () => {
        try {
            setLoading(true);
            setError(null);
            const dateParams = getDateRange();
            const [analyticsRes, salesRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, dateParams),
                dealAPI.getStats(currentWorkspace.id)
            ]);
            setAnalytics(analyticsRes.data);
            setSalesStats(salesRes.data);
        } catch (err) {
            console.error('Analytics loading error:', err);
            setError('Analiz verileri yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            NEW: '#ef4444',
            POTENTIAL: '#f97316',
            INFORMED: '#eab308',
            NEGOTIATING: '#22c55e',
            CONVERTED: '#10b981',
            NEGATIVE: '#6b7280',
            LOST: '#374151'
        };
        return colors[status] || '#6b7280';
    };

    const getChannelColor = (channel) => {
        const colors = {
            WHATSAPP: '#25D366',
            FACEBOOK: '#1877F2',
            INSTAGRAM: '#E4405F',
            EMAIL: '#EA4335',
            WIDGET: '#ef4444',
            MANUAL: '#8b5cf6',
            UNKNOWN: '#6b7280'
        };
        return colors[channel] || '#6b7280';
    };

    const getChannelIcon = (channel) => {
        switch (channel) {
            case 'WHATSAPP':
                return <WhatsAppIcon size={18} />;
            case 'FACEBOOK':
                return <FacebookIcon size={18} />;
            case 'INSTAGRAM':
                return <InstagramIcon size={18} />;
            case 'EMAIL':
                return <EmailIcon size={18} />;
            case 'WIDGET':
                return <WidgetIcon size={18} />;
            case 'MANUAL':
                return <ManualIcon size={18} />;
            default:
                return <HelpCircle size={18} color="#6b7280" />;
        }
    };

    const getChannelLabel = (channel) => {
        const labels = {
            WHATSAPP: 'WhatsApp',
            FACEBOOK: 'Facebook',
            INSTAGRAM: 'Instagram',
            EMAIL: t('analytics.emailLabel'),
            WIDGET: 'Web Widget',
            MANUAL: t('analytics.manualEntry'),
            UNKNOWN: t('analytics.other')
        };
        return labels[channel] || channel;
    };

    const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num?.toString() || '0';
    };

    const formatCurrency = (amount) => {
        if (!amount) return '₺0';
        if (amount >= 1000000) return '₺' + (amount / 1000000).toFixed(1) + 'M';
        if (amount >= 1000) return '₺' + (amount / 1000).toFixed(1) + 'K';
        return '₺' + amount.toLocaleString('tr-TR');
    };

    if (!currentWorkspace) {
        return (
            <div className="analytics-page">
                <div className="empty-state">
                    <BarChart3 size={48} />
                    <h3>{t('analytics.selectWorkspace')}</h3>
                    <p>{t('analytics.selectWorkspaceDesc')}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="analytics-page">
                <div className="error-state">
                    <p>{error}</p>
                    <button onClick={loadAnalytics} className="btn btn-primary">
                        Tekrar Dene
                    </button>
                </div>
            </div>
        );
    }

    const maxStatusCount = Math.max(...(analytics?.statusData?.map(s => s.count) || [1]));

    return (
        <div className="analytics-page">
            <div className="page-header">
                <div className="header-left">
                    <BarChart3 size={28} />
                    <h1>Analytics</h1>
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

                    <button onClick={loadAnalytics} className="btn btn-secondary" disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        Yenile
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <RefreshCw className="spin" size={32} />
                    <p>{t('analytics.loading')}</p>
                </div>
            ) : (
                <>
                    {/* Main Stats Cards */}
                    <div className="stats-grid main-stats">
                        <div className="stat-card messages">
                            <div className="stat-icon">
                                <MessageSquare size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{formatNumber(analytics?.totalMessages || 0)}</span>
                                <span className="stat-label">{t('analytics.totalMessages')}</span>
                            </div>
                        </div>

                        <div className="stat-card leads">
                            <div className="stat-icon">
                                <Target size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{formatNumber(analytics?.totalLeads || 0)}</span>
                                <span className="stat-label">{t('analytics.totalLeads')}</span>
                            </div>
                        </div>

                        <div className="stat-card conversations">
                            <div className="stat-icon">
                                <MessageCircle size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{formatNumber(analytics?.totalConversations || 0)}</span>
                                <span className="stat-label">Total Conversations</span>
                            </div>
                        </div>

                        <div className="stat-card total">
                            <div className="stat-icon">
                                <Users size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{formatNumber(analytics?.totalContacts || 0)}</span>
                                <span className="stat-label">{t('analytics.totalContacts')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Secondary Stats */}
                    <div className="stats-grid secondary-stats">
                        <div className="stat-card positive">
                            <div className="stat-icon">
                                <UserCheck size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{analytics?.positiveContacts || 0}</span>
                                <span className="stat-label">{t('analytics.positiveContacts')}</span>
                            </div>
                        </div>

                        <div className="stat-card negative">
                            <div className="stat-icon">
                                <UserX size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{analytics?.negativeContacts || 0}</span>
                                <span className="stat-label">{t('analytics.negativeContacts')}</span>
                            </div>
                        </div>

                        <div className="stat-card conversion">
                            <div className="stat-icon">
                                <TrendingUp size={24} />
                            </div>
                            <div className="stat-content">
                                <span className="stat-value">{analytics?.conversionRate || 0}%</span>
                                <span className="stat-label">{t('analytics.conversionRate')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Sales Stats */}
                    {salesStats && (
                        <div className="stats-grid sales-stats">
                            <div className="stat-card quote">
                                <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                                    <FileText size={24} />
                                </div>
                                <div className="stat-content">
                                    <span className="stat-value">{salesStats.totals?.quotes || 0}</span>
                                    <span className="stat-label">{t('analytics.totalQuotes')}</span>
                                </div>
                            </div>

                            <div className="stat-card order">
                                <div className="stat-icon" style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' }}>
                                    <ShoppingCart size={24} />
                                </div>
                                <div className="stat-content">
                                    <span className="stat-value">{salesStats.totals?.orders || 0}</span>
                                    <span className="stat-label">{t('analytics.totalOrders')}</span>
                                </div>
                            </div>

                            <div className="stat-card invoice">
                                <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                                    <Receipt size={24} />
                                </div>
                                <div className="stat-content">
                                    <span className="stat-value">{salesStats.totals?.invoices || 0}</span>
                                    <span className="stat-label">{t('analytics.totalInvoices')}</span>
                                </div>
                            </div>

                            <div className="stat-card revenue">
                                <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                                    <DollarSign size={24} />
                                </div>
                                <div className="stat-content">
                                    <span className="stat-value">
                                        {formatCurrency(salesStats.stageStats?.find(s => s.stage === 'INVOICE')?.totalAmount || 0)}
                                    </span>
                                    <span className="stat-label">{t('analytics.invoiced')}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Charts Row */}
                    <div className="charts-row">
                        {/* Status Distribution */}
                        <div className="chart-card status-chart">
                            <div className="chart-header">
                                <PieChartIcon size={20} />
                                <h3>{t('analytics.contactStatuses')}</h3>
                            </div>
                            <div className="status-bars">
                                {analytics?.statusData?.map((item) => (
                                    <div key={item.status} className="status-bar-item">
                                        <div className="status-bar-header">
                                            <span
                                                className="status-dot"
                                                style={{ backgroundColor: getStatusColor(item.status) }}
                                            />
                                            <span className="status-label">{item.label}</span>
                                            <span className="status-count">{item.count}</span>
                                        </div>
                                        <div className="status-bar-track">
                                            <div
                                                className="status-bar-fill"
                                                style={{
                                                    width: `${maxStatusCount > 0 ? (item.count / maxStatusCount) * 100 : 0}%`,
                                                    backgroundColor: getStatusColor(item.status)
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Channel Distribution */}
                        <div className="chart-card channel-chart">
                            <div className="chart-header">
                                <BarChart3 size={20} />
                                <h3>{t('analytics.channelDistribution')}</h3>
                            </div>
                            <div className="channel-grid">
                                {analytics?.channelData?.length > 0 ? (
                                    analytics.channelData.map((item) => (
                                        <div
                                            key={item.channel}
                                            className="channel-item"
                                            style={{ borderLeftColor: getChannelColor(item.channel) }}
                                        >
                                            <span className="channel-icon">{getChannelIcon(item.channel)}</span>
                                            <span className="channel-name">{getChannelLabel(item.channel)}</span>
                                            <span className="channel-count">{item.count}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="empty-channel">
                                        <p>{t('analytics.noChannelData')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Monthly Trend */}
                    <div className="chart-card monthly-chart">
                        <div className="chart-header">
                            <TrendingUp size={20} />
                            <h3>{t('analytics.monthlyTrend')}</h3>
                        </div>
                        <div className="monthly-bars">
                            {analytics?.monthlyData?.map((item, index) => {
                                const maxMonthCount = Math.max(...(analytics.monthlyData.map(m => m.count) || [1]));
                                const heightPercent = maxMonthCount > 0 ? (item.count / maxMonthCount) * 100 : 0;
                                return (
                                    <div key={index} className="monthly-bar-item">
                                        <div className="monthly-bar-container">
                                            <div
                                                className="monthly-bar"
                                                style={{ height: `${Math.max(heightPercent, 5)}%` }}
                                            >
                                                <span className="monthly-count">{item.count}</span>
                                            </div>
                                        </div>
                                        <span className="monthly-label">{item.month}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Status Summary Table */}
                    <div className="chart-card summary-table">
                        <div className="chart-header">
                            <Users size={20} />
                            <h3>{t('analytics.statusSummary')}</h3>
                        </div>
                        <table className="analytics-table">
                            <thead>
                                <tr>
                                    <th>{t('analytics.status')}</th>
                                    <th>{t('analytics.count')}</th>
                                    <th>{t('analytics.rate')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics?.statusData?.map((item) => {
                                    const percentage = analytics.totalContacts > 0
                                        ? ((item.count / analytics.totalContacts) * 100).toFixed(1)
                                        : 0;
                                    return (
                                        <tr key={item.status}>
                                            <td>
                                                <span
                                                    className="status-indicator"
                                                    style={{ backgroundColor: getStatusColor(item.status) }}
                                                />
                                                {item.label}
                                            </td>
                                            <td className="text-center">{item.count}</td>
                                            <td className="text-center">{percentage}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default Analytics;
