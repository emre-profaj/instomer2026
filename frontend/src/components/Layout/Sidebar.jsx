import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Settings, MessageCircle, Bot, ChevronDown, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Radio, Users, Globe, Contact, Inbox, Database, Mail, BarChart3, Target, UserCheck, Calendar, Activity, Zap, FileText, ShoppingCart, Receipt, Search, Phone, Kanban, Layers } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI } from '../../services/api';
import NotificationPanel from './NotificationPanel';
import './Sidebar.css';

const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { currentWorkspace, user, logout, switchWorkspace, unreadCount } = useAuth();
    const [workspaces, setWorkspaces] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [wsSearch, setWsSearch] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Settings submenu
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false); // Analytics submenu
    const [isSalesOpen, setIsSalesOpen] = useState(false); // Sales submenu
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });
    const dropdownRef = useRef(null);

    const menuItems = [
        { path: '/inbox', icon: Inbox, label: 'Inbox' },
        { path: '/customers', icon: Contact, label: 'Kişiler' },
        { path: '/pipeline', icon: Kanban, label: 'Pipeline' },
        { path: '/calendar', icon: Calendar, label: 'Takvim' },
        { path: '/users', icon: Layers, label: 'Kullanıcı & Takım' }
    ];

    // Analytics submenu items
    const analyticsSubItems = [
        { path: '/analytics', icon: BarChart3, label: 'Genel Analizler' },
        { path: '/agent-performance', icon: Activity, label: 'Agent Performansları' },
        { path: '/ai-call-analytics', icon: Phone, label: 'AI Call Raporlama' }
    ];

    // Settings submenu items
    const settingsSubItems = [
        { path: '/settings', icon: Settings, label: 'Genel Ayarlar' },
        { path: '/channels', icon: Radio, label: 'Kanallar' },
        { path: '/assistants', icon: Bot, label: 'AI Asistanlar' },
        { path: '/knowledge-base', icon: Database, label: 'Bilgi Bankası' },
        { path: '/automations', icon: Zap, label: 'Otomasyonlar' },
        { path: '/funnels', icon: Kanban, label: 'Funnellar' }
    ];

    // Sales submenu items
    const salesSubItems = [
        { path: '/quotes', icon: FileText, label: 'Teklifler' },
        { path: '/orders', icon: ShoppingCart, label: 'Siparişler' },
        { path: '/invoices', icon: Receipt, label: 'Faturalar' }
    ];

    // Get current user's role in this workspace
    // Fallback to first member if userId is not explicitly provided (backend usually only returns current user's membership)
    const workspaceMember = currentWorkspace?.members?.find(m => m.userId === user?.id) || currentWorkspace?.members?.[0];
    const workspaceRole = workspaceMember?.role;

    console.log('👤 [Sidebar] Workspace Role:', workspaceRole);
    console.log('👤 [Sidebar] User Global Role:', user?.role);

    // Filter menu items for AGENT role (but NOT for SUPER_ADMIN)
    const filteredMenuItems = (workspaceRole === 'AGENT' && user?.role !== 'SUPER_ADMIN')
        ? menuItems.filter(item => ['/inbox', '/customers', '/calendar'].includes(item.path))
        : menuItems;

    // Fetch all workspaces for all users (including sub-workspaces)
    useEffect(() => {
        const fetchWorkspaces = async () => {
            try {
                const response = await workspaceAPI.getAll();
                setWorkspaces(response.data.workspaces || []);
            } catch (error) {
                console.error('Error fetching workspaces:', error);
            }
        };

        if (user) {
            fetchWorkspaces();
        }
    }, [user]);

    // Close dropdown on click outside
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

    // Panel is now added directly in the JSX for SUPER_ADMIN

    // Helper to get initials
    const getInitials = (name) => {
        return name
            ?.split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'WB';
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('sidebar-collapsed', String(newState));
        // Dispatch custom event for Layout to listen
        window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: newState } }));
    };

    return (
        <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Top Area - Logo aligned with Header border */}
            <div className="sidebar-top">
                {/* Logo */}
                <div className="sidebar-logo">
                    {isCollapsed ? (
                        <img src="/instomer-icon.png" alt="Instomer" className="logo-icon" />
                    ) : (
                        <img src="/instomer-logo.png" alt="Instomer" className="logo-image" />
                    )}
                </div>
                <button className="sidebar-toggle-btn" onClick={toggleCollapse} title={isCollapsed ? 'Genişlet' : 'Daralt'}>
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            {/* Workspace Selector - Below header line */}
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
                            <h2 className="business-name">Loading...</h2>
                        </div>
                    </div>
                )}

                {/* Workspace Dropdown - for all users with multiple workspaces */}
                {isDropdownOpen && workspaces.length > 1 && (
                    <div className="workspace-dropdown">
                        {user?.role === 'SUPER_ADMIN' && (
                            <>
                                <div className="dropdown-label">SİSTEM</div>
                                <div className="dropdown-list">
                                    <button className="dropdown-item system" onClick={() => {
                                        setIsDropdownOpen(false);
                                        navigate('/admin');
                                    }}>
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
                            {workspaces.filter(ws =>
                                !wsSearch || ws.name.toLowerCase().includes(wsSearch.toLowerCase())
                            ).map(ws => (
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
                        {/* Menu items */}
                        {filteredMenuItems.map((item) => {
                            const isActive = location.pathname === item.path ||
                                (item.path === '/inbox' && location.pathname === '/');
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                                    title={item.label}
                                >
                                    <item.icon size={20} className="nav-icon" />
                                    {!isCollapsed && <span>{item.label}</span>}
                                    {item.path === '/inbox' && unreadCount > 0 && !isCollapsed && (
                                        <span className="unread-badge-sidebar">{unreadCount > 99 ? '99+' : unreadCount}</span>
                                    )}
                                </Link>
                            );
                        })}

                        {/* Sales Category with Submenu */}
                        {(workspaceRole !== 'AGENT' || user?.role === 'SUPER_ADMIN') && (
                            <div className="nav-category">
                                <button
                                    className={`nav-category-header ${salesSubItems.some(item => location.pathname === item.path) ? 'active' : ''}`}
                                    onClick={() => { setIsSalesOpen(v => !v); setIsAnalyticsOpen(false); setIsSettingsOpen(false); }}
                                    title="Satışlar"
                                >
                                    <FileText size={20} className="nav-icon" />
                                    {!isCollapsed && <span>Satışlar</span>}
                                    {!isCollapsed && <ChevronDown
                                        size={16}
                                        className={`category-arrow ${isSalesOpen ? 'open' : ''}`}
                                    />}
                                </button>
                                {isSalesOpen && !isCollapsed && (
                                    <div className="nav-submenu">
                                        {salesSubItems.map((item) => (
                                            <Link
                                                key={item.path}
                                                to={item.path}
                                                className={`sidebar-nav-item submenu-item ${location.pathname === item.path ? 'active' : ''}`}
                                                title={item.label}
                                            >
                                                <item.icon size={18} className="nav-icon" />
                                                {!isCollapsed && <span>{item.label}</span>}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Analytics Category with Submenu */}
                        {(workspaceRole !== 'AGENT' || user?.role === 'SUPER_ADMIN') && (
                            <div className="nav-category">
                                <button
                                    className={`nav-category-header ${analyticsSubItems.some(item => location.pathname === item.path) ? 'active' : ''}`}
                                    onClick={() => { setIsAnalyticsOpen(v => !v); setIsSalesOpen(false); setIsSettingsOpen(false); }}
                                    title="Analizler"
                                >
                                    <BarChart3 size={20} className="nav-icon" />
                                    {!isCollapsed && <span>Analizler</span>}
                                    {!isCollapsed && <ChevronDown
                                        size={16}
                                        className={`category-arrow ${isAnalyticsOpen ? 'open' : ''}`}
                                    />}
                                </button>
                                {isAnalyticsOpen && !isCollapsed && (
                                    <div className="nav-submenu">
                                        {analyticsSubItems.map((item) => (
                                            <Link
                                                key={item.path}
                                                to={item.path}
                                                className={`sidebar-nav-item submenu-item ${location.pathname === item.path ? 'active' : ''}`}
                                                title={item.label}
                                            >
                                                <item.icon size={18} className="nav-icon" />
                                                {!isCollapsed && <span>{item.label}</span>}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Settings Category with Submenu */}
                        {(workspaceRole !== 'AGENT' || user?.role === 'SUPER_ADMIN') && (
                            <div className="nav-category">
                                <button
                                    className={`nav-category-header ${settingsSubItems.some(item => location.pathname === item.path) ? 'active' : ''}`}
                                    onClick={() => { setIsSettingsOpen(v => !v); setIsSalesOpen(false); setIsAnalyticsOpen(false); }}
                                    title="Ayarlar"
                                >
                                    <Settings size={20} className="nav-icon" />
                                    {!isCollapsed && <span>Ayarlar</span>}
                                    {!isCollapsed && <ChevronDown
                                        size={16}
                                        className={`category-arrow ${isSettingsOpen ? 'open' : ''}`}
                                    />}
                                </button>
                                {isSettingsOpen && !isCollapsed && (
                                    <div className="nav-submenu">
                                        {settingsSubItems.map((item) => (
                                            <Link
                                                key={item.path}
                                                to={item.path}
                                                className={`sidebar-nav-item submenu-item ${location.pathname === item.path ? 'active' : ''}`}
                                                title={item.label}
                                            >
                                                <item.icon size={18} className="nav-icon" />
                                                {!isCollapsed && <span>{item.label}</span>}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Admin Panel for SUPER_ADMIN */}
                        {user?.role === 'SUPER_ADMIN' && (
                            <Link
                                to="/admin"
                                className={`sidebar-nav-item ${location.pathname === '/admin' ? 'active' : ''}`}
                                title="Panel"
                            >
                                <LayoutDashboard size={20} className="nav-icon" />
                                {!isCollapsed && <span>Panel</span>}
                            </Link>
                        )}
                    </nav>
                </div>
            </div>

            <div className="sidebar-footer">
                <NotificationPanel isCollapsed={isCollapsed} />
                <button onClick={handleLogout} className="logout-button" title="Çıkış Yap">
                    <LogOut size={20} className="nav-icon" />
                    {!isCollapsed && <span>Çıkış Yap</span>}
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
