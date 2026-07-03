import { useState, useEffect, useRef } from 'react';
import { Settings, Bot, ChevronDown, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Radio, Contact, Inbox, Database, BarChart3, Calendar, Activity, Zap, FileText, ShoppingCart, Receipt, Search, Phone, Kanban, Layers, Building2, ClipboardList, FileSignature, Home, Tag, Users, Wrench, UserCheck, Clock, InboxIcon, UserPlus, Handshake, ListTodo, CalendarClock, PhoneCall } from 'lucide-react';
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
        { path: '/agent-performance', icon: Activity, label: 'Agent Performansları' },
        { path: '/call-analytics', icon: Phone, label: 'Arama Analizi' },
        { path: '/ai-call-analytics', icon: Phone, label: 'AI Call Raporlama' }
    ];

    const settingsSubItems = [
        { path: '/channels', icon: Radio, label: t('channels.title') },
        { path: '/teams', icon: Users, label: 'Takımlar ve Temsilciler' },
        { path: '/assistants', icon: Bot, label: t('nav.assistants') },
        { path: '/funnels', icon: Kanban, label: 'Akışlar' },
        { path: '/knowledge-base', icon: Database, label: t('nav.knowledgeBase') },
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
        setIsSalesOpen(['/quotes', '/orders', '/invoices'].some(p => path === p));
        setIsAnalyticsOpen(['/general-report', '/agent-performance', '/call-analytics', '/ai-call-analytics'].some(p => path === p) || path.startsWith('/general-report/'));
        setIsSettingsOpen(['/channels', '/teams', '/assistants', '/funnels', '/knowledge-base', '/automations', '/functions'].some(p => path === p));
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


                                // Aktiviteler — expandable sub-menu
                                const isActivities = item.path === '/activities/calendar';
                                if (isActivities) {
                                    const isActivitiesActive = location.pathname.startsWith('/activities') || location.pathname === '/calendar';
                                    return (
                                        <div key={item.path}>
                                            <div
                                                className={`sidebar-nav-item ${isActivitiesActive && !isActivitiesOpen ? 'active' : ''}`}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => {
                                                    if (isCollapsed) { navigate('/activities/calendar'); return; }
                                                    setIsActivitiesOpen(v => !v);
                                                    if (!isActivitiesActive) navigate('/activities/calendar');
                                                }}
                                                title={item.label}
                                            >
                                                <item.icon size={20} className="nav-icon" />
                                                {!isCollapsed && <span>{item.label}</span>}
                                                {!isCollapsed && <ChevronDown size={14} style={{ marginLeft: 'auto', transition: '0.2s', transform: isActivitiesOpen ? 'rotate(180deg)' : 'none', color: '#9ca3af' }} />}
                                            </div>
                                            {isActivitiesOpen && !isCollapsed && (
                                                <div style={{ paddingLeft: '12px', marginBottom: '2px' }}>
                                                    {[
                                                        { label: 'Takvim', path: '/activities/calendar', icon: Calendar },
                                                        { label: 'Aramalar', path: '/activities/calls', icon: Phone },
                                                        { label: 'Randevular', path: '/activities/appointments', icon: CalendarClock },
                                                        { label: 'Görüşmeler', path: '/activities/meetings', icon: Handshake },
                                                        { label: 'Görevler', path: '/activities/tasks', icon: ListTodo },
                                                    ].map(sub => (
                                                        <Link
                                                            key={sub.path}
                                                            to={sub.path}
                                                            className={`sidebar-nav-item submenu-item ${location.pathname === sub.path ? 'active' : ''}`}
                                                            style={{ fontSize: '0.82rem', paddingTop: '5px', paddingBottom: '5px' }}
                                                        >
                                                            <sub.icon size={14} className="nav-icon" style={{ flexShrink: 0 }} />
                                                            <span>{sub.label}</span>
                                                        </Link>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
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
                    {/* Profile Card */}
                    <div className={`sidebar-profile-card ${isCollapsed ? 'collapsed' : ''}`} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                        <div className="profile-card-avatar">
                            {user?.avatar ? (
                                <img src={user.avatar} alt="" className="profile-avatar-img" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }} />
                            ) : null}
                            <span className="profile-avatar-initial" style={user?.avatar ? { display: 'none' } : {}}>{(user?.name || 'U').charAt(0).toUpperCase()}</span>
                        </div>
                        {!isCollapsed && (
                            <>
                                <div className="profile-card-info">
                                    <span className="profile-card-name">{user?.name || 'Kullanıcı'}</span>
                                    <span className="profile-card-role">{user?.role === 'SUPER_ADMIN' ? 'Admin' : 'Kullanıcı'}</span>
                                </div>
                                <button
                                    className={`drawer-toggle-btn ${isDrawerOpen ? 'open' : ''}`}
                                    onClick={() => setIsDrawerOpen(v => !v)}
                                    title={isDrawerOpen ? 'Menüyü kapat' : 'Hızlı erişim'}
                                >
                                    <ChevronDown size={16} style={{ transform: isDrawerOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.3s ease' }} />
                                </button>
                            </>
                        )}

                        {/* Drawer — premium popup, opens upward */}
                        {isDrawerOpen && !isCollapsed && (
                            <div className="profile-menu-popup" style={{ minWidth: 260, left: 4, right: 4 }}>
                                {/* Profile header */}
                                <div className="profile-menu-header" style={{ padding: '16px', gap: 12 }}>
                                    <div className="profile-menu-avatar" style={{ width: 42, height: 42 }}>
                                        {user?.avatar ? (
                                            <img src={user.avatar} alt="" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }} />
                                        ) : null}
                                        <span style={user?.avatar ? { display: 'none' } : {}}>{(user?.name || 'U').charAt(0).toUpperCase()}</span>
                                    </div>
                                    <div className="profile-menu-info">
                                        <strong style={{ fontSize: '0.9rem' }}>{user?.name}</strong>
                                        <small style={{ fontSize: '0.75rem' }}>{user?.email}</small>
                                    </div>
                                </div>

                                {/* Hızlı Erişim section */}
                                <div style={{ padding: '4px 12px 0' }}>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Hızlı Erişim</div>
                                </div>
                                <div style={{ padding: '0 10px 8px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                                        {[
                                            { icon: PhoneCall, label: 'Aramalar', path: '/activities/calls?view=mine', check: '/activities/calls', count: quickCounts.calls },
                                            { icon: Handshake, label: 'Görüşmeler', path: '/activities/meetings?view=mine', check: '/activities/meetings', count: quickCounts.meetings },
                                            { icon: ListTodo, label: 'Görevler', path: '/activities/tasks?view=mine', check: '/activities/tasks', count: quickCounts.tasks },
                                            { icon: FileSignature, label: 'Teklifler', path: '/quotes?view=mine', check: '/quotes' },
                                            { icon: ShoppingCart, label: 'Satışlar', path: '/orders?view=mine', check: '/orders' },
                                            { icon: UserCheck, label: 'Müşteriler', path: '/customers?tab=mine', check: '/customers' },
                                        ].map((item, i) => (
                                            <button
                                                key={i}
                                                onClick={() => { setIsDrawerOpen(false); navigate(item.path); }}
                                                style={{
                                                    position: 'relative',
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                    gap: 3, padding: '10px 4px 7px', border: 'none', borderRadius: 8, cursor: 'pointer',
                                                    background: location.pathname === item.check ? '#eef2ff' : 'transparent',
                                                    color: location.pathname === item.check ? '#4f46e5' : '#64748b',
                                                    fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap',
                                                    transition: 'all 0.15s'
                                                }}
                                                onMouseEnter={e => { if (location.pathname !== item.check) { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#1e293b'; }}}
                                                onMouseLeave={e => { if (location.pathname !== item.check) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}}
                                            >
                                                <item.icon size={18} />
                                                <span>{item.label}</span>
                                                {item.count > 0 && (
                                                    <span style={{
                                                        position: 'absolute', top: 2, right: 4, minWidth: 16, height: 16, borderRadius: 8,
                                                        background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff',
                                                        fontSize: '0.55rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        padding: '0 3px', boxShadow: '0 1px 3px rgba(239,68,68,0.3)'
                                                    }}>{item.count > 99 ? '99+' : item.count}</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Navigation grid */}
                                <div style={{ padding: '0 10px 8px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                                        {[
                                            { icon: Calendar, label: 'Takvim', action: () => { setIsDrawerOpen(false); navigate('/activities/calendar'); }, check: '/activities/calendar' },
                                            { icon: Settings, label: 'Profil', action: () => { setIsDrawerOpen(false); navigate('/settings'); }, check: '/settings' },
                                            { icon: Database, label: 'Şifre', action: () => { setIsDrawerOpen(false); alert('Şifre değiştirme sayfasına yönlendirilecek'); }, check: null },
                                        ].map((item, i) => (
                                            <button
                                                key={i}
                                                onClick={item.action}
                                                style={{
                                                    position: 'relative',
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                    gap: 3, padding: '10px 4px 7px', border: 'none', borderRadius: 8, cursor: 'pointer',
                                                    background: item.check && location.pathname.startsWith(item.check) ? '#eef2ff' : 'transparent',
                                                    color: item.check && location.pathname.startsWith(item.check) ? '#4f46e5' : '#64748b',
                                                    fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap',
                                                    transition: 'all 0.15s'
                                                }}
                                                onMouseEnter={e => { if (!item.check || !location.pathname.startsWith(item.check)) { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#1e293b'; }}}
                                                onMouseLeave={e => { if (!item.check || !location.pathname.startsWith(item.check)) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}}
                                            >
                                                <item.icon size={18} />
                                                <span>{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="profile-menu-divider" />
                                <div style={{ padding: '4px 0' }}>
                                    <button className="profile-menu-item danger" onClick={() => { setIsDrawerOpen(false); handleLogout(); }}>
                                        <LogOut size={16} />
                                        <span>Çıkış Yap</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notifications — always above profile card */}
                    <div className={`sidebar-footer-row stacked ${isCollapsed ? 'collapsed' : ''}`} style={{ padding: '0 12px', marginBottom: 4, borderTop: 'none' }}>
                        <NotificationPanel isCollapsed={isCollapsed} />
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

