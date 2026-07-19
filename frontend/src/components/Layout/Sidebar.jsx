import { useState, useEffect, useRef } from 'react';
import { Settings, Bot, ChevronDown, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Radio, Contact, Inbox, Database, BarChart3, Calendar, Activity, Zap, FileText, ShoppingCart, Receipt, Search, Phone, Kanban, Layers, Building2, ClipboardList, FileSignature, Home, Tag, Users, Wrench, UserCheck, Clock, InboxIcon, UserPlus, Handshake, ListTodo, CalendarClock, PhoneCall, Package, Megaphone, MapPin } from 'lucide-react';
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
    const [isRealEstateOpen, setIsRealEstateOpen] = useState(false);
    const [isInboxOpen, setIsInboxOpen] = useState(false);
    const [isContactsOpen, setIsContactsOpen] = useState(false);
    const [isActivitiesOpen, setIsActivitiesOpen] = useState(false);
    const [inboxSubTeams, setInboxSubTeams] = useState([]); // Kullanıcının takımları
    const [quickCounts, setQuickCounts] = useState({ calls: 0, meetings: 0, tasks: 0 }); // Quick action badge counts
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });
    const dropdownRef = useRef(null);

    const menuItems = [
        { path: '/inbox', icon: Inbox, label: t('nav.inbox') },
        { path: '/customers', icon: Contact, label: t('nav.contacts') },
        { path: '/activities/calendar', icon: Activity, label: 'Aktiviteler' }
    ];

    const realEstateSubItems = [
        { path: '/real-estate/offers', icon: ClipboardList, label: 'Teklifler' },
        { path: '/real-estate/portfolio', icon: Home, label: 'Portföy' },
        { path: '/real-estate/campaigns', icon: Tag, label: 'Kampanyalar' },
        { path: '/real-estate', icon: Settings, label: 'Genel Ayarlar' },
    ];

    const analyticsSubItems = [
        { path: '/general-report', icon: BarChart3, label: 'Genel Rapor' },
        { path: '/general-report/sales', icon: ShoppingCart, label: 'Satışlar' },
        { path: '/general-report/requests', icon: ClipboardList, label: 'Talep Raporu' },
        { path: '/general-report/team', icon: Users, label: 'Takım ve Temsilciler' },
        { path: '/general-report/activities', icon: Activity, label: 'Aktivite Raporu' },
        { path: '/call-analytics', icon: Phone, label: 'Arama Analizi' },
        { path: '/meeting-analytics', icon: Users, label: 'Görüşme Analizi' },
        { path: '/appointment-analytics', icon: Calendar, label: 'Randevu Analizi' },
        { path: '/ai-call-analytics', icon: Phone, label: 'AI Call Raporlama' },
        { path: '/general-report/analysis', icon: BarChart3, label: 'Analiz' }
    ];

    const settingsSubItems = [
        { path: '/channels', icon: Radio, label: t('channels.title') },
        { path: '/teams', icon: Users, label: 'Takımlar ve Temsilciler' },
        { path: '/assistants', icon: Bot, label: t('nav.assistants') },
        { path: '/funnels', icon: Kanban, label: 'Akışlar' },
        { path: '/knowledge-base', icon: Database, label: t('nav.knowledgeBase') },
        { path: '/products', icon: Package, label: 'Ürün ve Hizmetler' },
        { path: '/automations', icon: Zap, label: t('nav.automations') },
        { path: '/functions', icon: Wrench, label: 'Fonksiyonlar (API)' }
    ];

    const salesSubItems = [
        { path: '/quotes', icon: FileText, label: 'Teklifler' },
        { path: '/orders', icon: ShoppingCart, label: 'Siparişler' },
        { path: '/invoices', icon: Receipt, label: 'Faturalar' }
    ];

    const workspaceMember = currentWorkspace?.members?.find(m => m.userId === user?.id);
    const workspaceRole = workspaceMember?.role;

    const filteredMenuItems = (workspaceRole === 'AGENT' && user?.role !== 'SUPER_ADMIN')
        ? menuItems.filter(item => ['/inbox', '/customers', '/activities/calendar'].includes(item.path))
        : menuItems;

    useEffect(() => {
        const fetchWorkspaces = async () => {
            try {
                const response = await workspaceAPI.getAll();
                const ws = response.data.workspaces || response.data || [];
                setWorkspaces(Array.isArray(ws) ? ws : []);
            } catch (error) {
                console.error('Error fetching workspaces:', error);
            }
        };
        if (user) fetchWorkspaces();
    }, [user]);

    // Kullanıcının takımlarını çek — Inbox alt menü için
    useEffect(() => {
        const fetchMyTeams = async () => {
            if (!currentWorkspace?.id) return;
            try {
                const { teamAPI } = await import('../../services/api');
                const res = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
                const allTeams = res.data.teams || [];
                // Düz liste yap (nested flatten)
                const flatten = (list) => list.flatMap(t => [t, ...(t.children ? flatten(t.children) : [])]);
                const flat = flatten(allTeams);
                // Kullanıcının üyesi olduğu takımlar (members array bak)
                const myTeams = flat.filter(t =>
                    (t.members || []).some(m => m.userId === user?.id)
                );
                setInboxSubTeams(myTeams.length > 0 ? myTeams : flat.slice(0, 8));
            } catch {}
        };
        if (user && currentWorkspace) fetchMyTeams();
    }, [user, currentWorkspace]);

    // Quick action counts — planned CALL, MEETING, TASK sayılarını çek
    useEffect(() => {
        const fetchCounts = async () => {
            if (!currentWorkspace?.id) return;
            try {
                const { activityAPI } = await import('../../services/activity.api');
                const data = await activityAPI.getWorkspaceActivities(currentWorkspace.id, { status: 'PLANNED', view: 'mine' });
                const acts = data?.activities || [];
                const calls = acts.filter(a => a.type === 'CALL').length;
                const meetings = acts.filter(a => a.type === 'MEETING').length;
                const tasks = acts.filter(a => a.type === 'TASK').length;
                setQuickCounts({ calls, meetings, tasks });
            } catch {}
        };
        fetchCounts();
        // Her 60 saniyede yenile
        const interval = setInterval(fetchCounts, 60000);
        return () => clearInterval(interval);
    }, [currentWorkspace?.id]);


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

    // Auto-open/close submenus based on active route
    useEffect(() => {
        const path = location.pathname;
        setIsInboxOpen(path === '/inbox' || path === '/');
        setIsContactsOpen(path === '/customers');
        setIsActivitiesOpen(path.startsWith('/activities') || path === '/calendar');
        setIsRealEstateOpen(path.startsWith('/real-estate'));
        setIsSalesOpen(['/quotes', '/orders', '/invoices', '/products'].some(p => path === p));
        setIsAnalyticsOpen(['/general-report', '/call-analytics', '/ai-call-analytics'].some(p => path === p) || path.startsWith('/general-report/'));
        setIsSettingsOpen(['/settings', '/channels', '/teams', '/assistants', '/funnels', '/knowledge-base', '/automations', '/functions'].some(p => path === p));
    }, [location.pathname]);



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
                            onClick={() => (workspaces.length > 1 || user?.role === 'SUPER_ADMIN') && setIsDropdownOpen(!isDropdownOpen)}
                            style={{ cursor: (workspaces.length > 1 || user?.role === 'SUPER_ADMIN') ? 'pointer' : 'default' }}
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
                            {(workspaces.length > 1 || user?.role === 'SUPER_ADMIN') && (
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

                    {isDropdownOpen && (workspaces.length > 1 || user?.role === 'SUPER_ADMIN') && (
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
                        <nav className="sidebar-nav">
                            {filteredMenuItems.map((item) => {
                                const isActive = location.pathname === item.path || (item.path === '/inbox' && location.pathname === '/');
                                const isInbox = item.path === '/inbox';
                                // Inbox için URL paramı oku
                                const currentTab = isInbox ? new URLSearchParams(location.search).get('tab') || 'all' : null;

                                // Inbox — alt menüsüz, direkt link (unread badge ile)
                                if (isInbox) {
                                    return (
                                        <Link key={item.path} to="/inbox"
                                            className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                                            title={item.label}>
                                            <item.icon size={20} className="nav-icon" />
                                            {!isCollapsed && <span>{item.label}</span>}
                                            {unreadCount > 0 && !isCollapsed && (
                                                <span className="unread-badge-sidebar">{unreadCount > 99 ? '99+' : unreadCount}</span>
                                            )}
                                        </Link>
                                    );
                                }

                                // Kişiler — alt menüsüz, direkt link


                                // Takvim — direkt link, Aktiviteler grubu olmadan
                                const isActivities = item.path === '/activities/calendar';
                                if (isActivities) {
                                    const isCalActive = location.pathname.startsWith('/activities/calendar');
                                    return (
                                        <Link
                                            key={item.path}
                                            to="/activities/calendar"
                                            className={`sidebar-nav-item ${isCalActive ? 'active' : ''}`}
                                            title="Takvim"
                                        >
                                            <item.icon size={20} className="nav-icon" />
                                            {!isCollapsed && <span>Takvim</span>}
                                        </Link>
                                    );
                                }

                                return (
                                    <Link key={item.path} to={item.path}
                                        className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                                        title={item.label}>
                                        <item.icon size={20} className="nav-icon" />
                                        {!isCollapsed && <span>{item.label}</span>}
                                    </Link>
                                );
                            })}

                            {/* Pazarlama — sadece SUPER_ADMIN */}
                            {user?.role === 'SUPER_ADMIN' && (
                                <Link
                                    to="/marketing"
                                    className={`sidebar-nav-item ${location.pathname === '/marketing' ? 'active' : ''}`}
                                    title="Pazarlama"
                                >
                                    <Megaphone size={20} className="nav-icon" />
                                    {!isCollapsed && <span>Pazarlama</span>}
                                </Link>
                            )}

                            {/* Gayrimenkul — sadece workspace'te aktifse göster */}
                            {currentWorkspace?.realEstateEnabled && (workspaceRole !== 'AGENT' || user?.role === 'SUPER_ADMIN') && (
                                <div className="nav-category">
                                    <button
                                        className={`nav-category-header ${location.pathname.startsWith('/real-estate') ? 'active' : ''}`}
                                        onClick={() => { setIsRealEstateOpen(v => !v); setIsSalesOpen(false); setIsAnalyticsOpen(false); setIsSettingsOpen(false); }}
                                        title="Gayrimenkul"
                                    >
                                        <Building2 size={20} className="nav-icon" />
                                        {!isCollapsed && <span>Gayrimenkul</span>}
                                        {!isCollapsed && <ChevronDown size={16} className={`category-arrow ${isRealEstateOpen ? 'open' : ''}`} />}
                                    </button>
                                    {isRealEstateOpen && !isCollapsed && (
                                        <div className="nav-submenu">
                                            {realEstateSubItems.map(item => {
                                                const [itemPath, itemQuery] = item.path.split('?');
                                                const isActive = location.pathname === itemPath &&
                                                    (!itemQuery || location.search === `?${itemQuery}`);
                                                return (
                                                    <Link key={item.path} to={item.path}
                                                        className={`sidebar-nav-item submenu-item ${isActive ? 'active' : ''}`}>
                                                        <item.icon size={18} className="nav-icon" />
                                                        <span>{item.label}</span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Sales — Agent dahil herkes görsün */}
                            {(
                                <div className="nav-category">
                                    <button
                                        className={`nav-category-header ${salesSubItems.some(i => location.pathname === i.path) ? 'active' : ''}`}
                                        onClick={() => { setIsSalesOpen(v => !v); setIsRealEstateOpen(false); setIsAnalyticsOpen(false); setIsSettingsOpen(false); }}
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
                                        onClick={() => { setIsAnalyticsOpen(v => !v); setIsSalesOpen(false); setIsRealEstateOpen(false); setIsSettingsOpen(false); }}
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
                                        onClick={() => { setIsSettingsOpen(v => !v); setIsSalesOpen(false); setIsRealEstateOpen(false); setIsAnalyticsOpen(false); }}
                                        title={t('settings.title')}
                                    >
                                        <Settings size={20} className="nav-icon" />
                                        {!isCollapsed && <span>Genel</span>}
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
                    {/* Notifications */}
                    <div className={`sidebar-footer-row stacked ${isCollapsed ? 'collapsed' : ''}`} style={{ padding: '0 12px', marginBottom: 0, borderTop: 'none' }}>
                        <NotificationPanel isCollapsed={isCollapsed} />
                    </div>
                    {/* Logout */}
                    <div className={`sidebar-footer-row stacked ${isCollapsed ? 'collapsed' : ''}`} style={{ padding: '0 12px', marginBottom: 8, borderTop: 'none' }}>
                        <button
                            className="notification-trigger"
                            onClick={handleLogout}
                            title="Çıkış Yap"
                            style={{ color: '#ef4444' }}
                        >
                            <LogOut size={20} className="nav-icon" style={{ color: '#ef4444' }} />
                            {!isCollapsed && <span style={{ color: '#ef4444' }}>Çıkış Yap</span>}
                        </button>
                    </div>
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
                    to="/activities/calendar"
                    className={`mobile-nav-item ${location.pathname.startsWith('/activities') ? 'active' : ''}`}
                >
                    <Activity size={22} />
                    <span>Aktiviteler</span>
                </Link>
                <Link
                    to="/settings"
                    className={`mobile-nav-item ${['/settings', '/channels', '/assistants', '/automations', '/teams'].includes(location.pathname) ? 'active' : ''}`}
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

