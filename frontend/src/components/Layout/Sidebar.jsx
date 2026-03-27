import { useState, useEffect, useRef } from 'react';
import { Settings, Bot, ChevronDown, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Radio, Contact, Inbox, Database, BarChart3, Calendar, Activity, Zap, FileText, ShoppingCart, Receipt, Search, Phone, Kanban, Layers } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI } from '../../services/api';
import NotificationPanel from './NotificationPanel';
import { useTranslation } from 'react-i18next';
import './Sidebar.css';

const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { currentWorkspace, user, logout, switchWorkspace, unreadCount } = useAuth();
    const { t } = useTranslation();
    const [workspaces, setWorkspaces] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [wsSearch, setWsSearch] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
    const [isSalesOpen, setIsSalesOpen] = useState(false);

    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });
    const dropdownRef = useRef(null);

    const menuItems = [
        { path: '/inbox', icon: Inbox, label: t('nav.inbox') },
        { path: '/customers', icon: Contact, label: t('nav.contacts') },
        { path: '/calendar', icon: Calendar, label: t('nav.calendar') },
        { path: '/users', icon: Layers, label: t('users.title') }
    ];

    const analyticsSubItems = [
        { path: '/analytics', icon: BarChart3, label: t('analytics.title') },
        { path: '/agent-performance', icon: Activity, label: 'Agent Performansları' },
        { path: '/ai-call-analytics', icon: Phone, label: 'AI Call Raporlama' }
    ];

    const settingsSubItems = [
        { path: '/settings', icon: Settings, label: t('settings.title') },
        { path: '/channels', icon: Radio, label: t('channels.title') },
        { path: '/assistants', icon: Bot, label: t('nav.assistants') },
        { path: '/knowledge-base', icon: Database, label: t('nav.knowledgeBase') },
        { path: '/automations', icon: Zap, label: t('nav.automations') },
        { path: '/funnels', icon: Kanban, label: 'Funnellar' }
    ];

    const salesSubItems = [
        { path: '/quotes', icon: FileText, label: 'Teklifler' },
        { path: '/orders', icon: ShoppingCart, label: 'Siparişler' },
        { path: '/invoices', icon: Receipt, label: 'Faturalar' }
    ];

    const workspaceMember = currentWorkspace?.members?.find(m => m.userId === user?.id) || currentWorkspace?.members?.[0];
    const workspaceRole = workspaceMember?.role;

    const filteredMenuItems = (workspaceRole === 'AGENT' && user?.role !== 'SUPER_ADMIN')
        ? menuItems.filter(item => ['/inbox', '/customers', '/calendar'].includes(item.path))
        : menuItems;

    useEffect(() => {
        const fetchWorkspaces = async () => {
            try {
                const response = await workspaceAPI.getAll();
                setWorkspaces(response.data.workspaces || []);
            } catch (error) {
                console.error('Error fetching workspaces:', error);
            }
        };
        if (user) fetchWorkspaces();
    }, [user]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleWorkspaceSelect = (workspace) => {
        switchWorkspace(workspace);
        setIsDropdownOpen(false);
    };

    const getInitials = (name) => {
        return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'WB';
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('sidebar-collapsed', String(newState));
        window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: newState } }));
    };



    return (
        <>
            {/* Desktop Sidebar */}
            <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
                {/* Top */}
                <div className="sidebar-top">
                    <div className="sidebar-logo">
                        {isCollapsed
                            ? <img src="/instomer-icon.png" alt="Instomer" className="logo-icon" />
                            : <img src="/instomer-logo.png" alt="Instomer" className="logo-image" />}
                    </div>
                    <button className="sidebar-toggle-btn" onClick={toggleCollapse}>
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                {/* Workspace Selector */}
                <div className="sidebar-header" ref={dropdownRef}>
                    {currentWorkspace ? (
                        <div
                            className={`business-selector clickable ${isDropdownOpen ? 'active' : ''}`}
                            onClick={() => workspaces.length > 1 && setIsDropdownOpen(!isDropdownOpen)}
                            style={{ cursor: workspaces.length > 1 ? 'pointer' : 'default' }}
                        >
                            <div className="business-avatar-box">
                                <span className="business-initials">{getInitials(currentWorkspace.name)}</span>
                            </div>
                            <div className="business-info">
                                <h2 className="business-name">{currentWorkspace.name}</h2>
                                <span className="business-id">
                                    {user?.role === 'SUPER_ADMIN' ? 'Gözlem Modu' : `Business ID: ${currentWorkspace.id?.slice(0, 8) || '88273192'}`}
                                </span>
                            </div>
                            {workspaces.length > 1 && (
                                <ChevronDown size={16} className={`dropdown-arrow ${isDropdownOpen ? 'rotated' : ''}`} />
                            )}
                        </div>
                    ) : (
                        <div className="business-selector">
                            <div className="business-info">
                                <h2 className="business-name">{t('common.loading')}</h2>
                            </div>
                        </div>
                    )}

                    {isDropdownOpen && workspaces.length > 1 && (
                        <div className="workspace-dropdown">
                            {user?.role === 'SUPER_ADMIN' && (
                                <>
                                    <div className="dropdown-label">SİSTEM</div>
                                    <div className="dropdown-list">
                                        <button className="dropdown-item system" onClick={() => { setIsDropdownOpen(false); navigate('/admin'); }}>
                                            <div className="item-avatar">SA</div>
                                            <div className="item-name">Sistem Yönetimi</div>
                                        </button>
                                    </div>
                                </>
                            )}
                            <div className="dropdown-label">İŞLETMELER ({workspaces.length})</div>
                            <div className="dropdown-search">
                                <Search size={14} />
                                <input
                                    type="text"
                                    placeholder="Workspace ara..."
                                    value={wsSearch}
                                    onChange={(e) => setWsSearch(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                            <div className="dropdown-list">
                                {workspaces.filter(ws => !wsSearch || ws.name.toLowerCase().includes(wsSearch.toLowerCase())).map(ws => (
                                    <button
                                        key={ws.id}
                                        className={`dropdown-item ${currentWorkspace?.id === ws.id ? 'active' : ''}`}
                                        onClick={() => handleWorkspaceSelect(ws)}
                                    >
                                        <div className="item-avatar">{getInitials(ws.name)}</div>
                                        <div className="item-name">{ws.name}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="sidebar-content">
                    <div className="sidebar-section">
                        {!isCollapsed && <h3 className="section-title">BUSINESS SUITE</h3>}
                        <nav className="sidebar-nav">
                            {filteredMenuItems.map((item) => {
                                const isActive = location.pathname === item.path || (item.path === '/inbox' && location.pathname === '/');
                                return (
                                    <Link key={item.path} to={item.path}
                                        className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                                        title={item.label}>
                                        <item.icon size={20} className="nav-icon" />
                                        {!isCollapsed && <span>{item.label}</span>}
                                        {item.path === '/inbox' && unreadCount > 0 && !isCollapsed && (
                                            <span className="unread-badge-sidebar">{unreadCount > 99 ? '99+' : unreadCount}</span>
                                        )}
                                    </Link>
                                );
                            })}

                            {/* Sales */}
                            {(workspaceRole !== 'AGENT' || user?.role === 'SUPER_ADMIN') && (
                                <div className="nav-category">
                                    <button
                                        className={`nav-category-header ${salesSubItems.some(i => location.pathname === i.path) ? 'active' : ''}`}
                                        onClick={() => { setIsSalesOpen(v => !v); setIsAnalyticsOpen(false); setIsSettingsOpen(false); }}
                                        title="Satışlar"
                                    >
                                        <FileText size={20} className="nav-icon" />
                                        {!isCollapsed && <span>{t('nav.sales') || 'Satışlar'}</span>}
                                        {!isCollapsed && <ChevronDown size={16} className={`category-arrow ${isSalesOpen ? 'open' : ''}`} />}
                                    </button>
                                    {isSalesOpen && !isCollapsed && (
                                        <div className="nav-submenu">
                                            {salesSubItems.map(item => (
                                                <Link key={item.path} to={item.path}
                                                    className={`sidebar-nav-item submenu-item ${location.pathname === item.path ? 'active' : ''}`}>
                                                    <item.icon size={18} className="nav-icon" />
                                                    <span>{item.label}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Analytics */}
                            {(workspaceRole !== 'AGENT' || user?.role === 'SUPER_ADMIN') && (
                                <div className="nav-category">
                                    <button
                                        className={`nav-category-header ${analyticsSubItems.some(i => location.pathname === i.path) ? 'active' : ''}`}
                                        onClick={() => { setIsAnalyticsOpen(v => !v); setIsSalesOpen(false); setIsSettingsOpen(false); }}
                                        title={t('analytics.title')}
                                    >
                                        <BarChart3 size={20} className="nav-icon" />
                                        {!isCollapsed && <span>{t('analytics.title')}</span>}
                                        {!isCollapsed && <ChevronDown size={16} className={`category-arrow ${isAnalyticsOpen ? 'open' : ''}`} />}
                                    </button>
                                    {isAnalyticsOpen && !isCollapsed && (
                                        <div className="nav-submenu">
                                            {analyticsSubItems.map(item => (
                                                <Link key={item.path} to={item.path}
                                                    className={`sidebar-nav-item submenu-item ${location.pathname === item.path ? 'active' : ''}`}>
                                                    <item.icon size={18} className="nav-icon" />
                                                    <span>{item.label}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Settings */}
                            {(workspaceRole !== 'AGENT' || user?.role === 'SUPER_ADMIN') && (
                                <div className="nav-category">
                                    <button
                                        className={`nav-category-header ${settingsSubItems.some(i => location.pathname === i.path) ? 'active' : ''}`}
                                        onClick={() => { setIsSettingsOpen(v => !v); setIsSalesOpen(false); setIsAnalyticsOpen(false); }}
                                        title={t('settings.title')}
                                    >
                                        <Settings size={20} className="nav-icon" />
                                        {!isCollapsed && <span>{t('settings.title')}</span>}
                                        {!isCollapsed && <ChevronDown size={16} className={`category-arrow ${isSettingsOpen ? 'open' : ''}`} />}
                                    </button>
                                    {isSettingsOpen && !isCollapsed && (
                                        <div className="nav-submenu">
                                            {settingsSubItems.map(item => (
                                                <Link key={item.path} to={item.path}
                                                    className={`sidebar-nav-item submenu-item ${location.pathname === item.path ? 'active' : ''}`}>
                                                    <item.icon size={18} className="nav-icon" />
                                                    <span>{item.label}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Admin */}
                            {user?.role === 'SUPER_ADMIN' && (
                                <Link to="/admin"
                                    className={`sidebar-nav-item ${location.pathname === '/admin' ? 'active' : ''}`}
                                    title="Panel">
                                    <LayoutDashboard size={20} className="nav-icon" />
                                    {!isCollapsed && <span>Panel</span>}
                                </Link>
                            )}
                        </nav>
                    </div>
                </div>

                <div className="sidebar-footer">
                    <NotificationPanel isCollapsed={isCollapsed} />
                    <button onClick={handleLogout} className="logout-button" title={t('nav.logout')}>
                        <LogOut size={20} className="nav-icon" />
                        {!isCollapsed && <span>{t('nav.logout')}</span>}
                    </button>
                </div>
            </div>

            {/* Mobile Bottom Navigation Bar */}
            <nav className="mobile-bottom-nav">
                <Link
                    to="/inbox"
                    className={`mobile-nav-item ${location.pathname === '/inbox' || location.pathname === '/' ? 'active' : ''}`}
                >
                    <Inbox size={22} />
                    {unreadCount > 0 && <span className="mobile-nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                    <span>Inbox</span>
                </Link>
                <Link
                    to="/customers"
                    className={`mobile-nav-item ${location.pathname === '/customers' ? 'active' : ''}`}
                >
                    <Contact size={22} />
                    <span>Kişiler</span>
                </Link>
                <Link
                    to="/calendar"
                    className={`mobile-nav-item ${location.pathname === '/calendar' ? 'active' : ''}`}
                >
                    <Calendar size={22} />
                    <span>Takvim</span>
                </Link>
                <Link
                    to="/settings"
                    className={`mobile-nav-item ${['/settings', '/channels', '/assistants', '/automations'].includes(location.pathname) ? 'active' : ''}`}
                >
                    <Settings size={22} />
                    <span>Ayarlar</span>
                </Link>
                <button
                    className="mobile-nav-item"
                    onClick={handleLogout}
                >
                    <LogOut size={22} />
                    <span>Çıkış</span>
                </button>
            </nav>
        </>
    );
};

export default Sidebar;

