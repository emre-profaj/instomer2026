import { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { workspaceAPI } from '../services/api';
import {
    LayoutDashboard,
    Users,
    Database,
    LogOut,
    Menu,
    X,
    ChevronDown,
    Building2,
    Settings
} from 'lucide-react';
import './AdminLayout.css';

const AdminLayout = () => {
    const { logout, user, switchWorkspace, currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [workspaces, setWorkspaces] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const fetchWorkspaces = async () => {
            try {
                console.log('🔍 [AdminLayout] Fetching workspaces for SUPER_ADMIN...');
                const response = await workspaceAPI.getAll();
                console.log('✅ [AdminLayout] Workspaces fetched:', response.data.workspaces);
                setWorkspaces(response.data.workspaces);
            } catch (error) {
                console.error('❌ [AdminLayout] Error fetching workspaces:', error);
            }
        };

        console.log('👤 [AdminLayout] Current user role:', user?.role);
        if (user?.role === 'SUPER_ADMIN') {
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
        navigate('/'); // Go to main dashboard
    };

    const handleAdminHome = () => {
        switchWorkspace(null); // Clear selected workspace
        setIsDropdownOpen(false);
        navigate('/admin');
    };

    const menuItems = [
        {
            path: '/admin',
            icon: <Building2 size={20} />,
            label: 'Firmalar'
        },
        {
            path: '/admin/settings',
            icon: <Settings size={20} />,
            label: 'Ayarlar'
        }
    ];

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Helper to get initials
    const getInitials = (name) => {
        return name
            ?.split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'SA';
    };

    return (
        <div className="admin-layout">
            <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header" ref={dropdownRef}>
                    <div
                        className={`business-selector ${isDropdownOpen ? 'active' : ''}`}
                        onClick={() => {
                            console.log('🖱️ [AdminLayout] Dropdown clicked. Current state:', isDropdownOpen);
                            console.log('📊 [AdminLayout] Workspaces available:', workspaces.length, workspaces);
                            setIsDropdownOpen(!isDropdownOpen);
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="business-avatar-box">
                            <span className="business-initials">
                                {currentWorkspace ? getInitials(currentWorkspace.name) : getInitials('Super Admin')}
                            </span>
                        </div>
                        <div className="business-info">
                            <h2 className="business-name">
                                {currentWorkspace ? currentWorkspace.name : 'Super Admin'}
                            </h2>
                            <span className="business-id">
                                {currentWorkspace ? 'Gözlem Modu' : 'Sistem Yönetimi'}
                            </span>
                        </div>
                        <ChevronDown size={16} className={`dropdown-arrow ${isDropdownOpen ? 'rotated' : ''}`} />
                    </div>

                    {isDropdownOpen && (
                        <div className="workspace-dropdown">
                            <div className="dropdown-label">İŞLETMELER ({workspaces.length})</div>
                            <div className="dropdown-list">
                                <button className="dropdown-item system" onClick={handleAdminHome}>
                                    <div className="item-avatar">SA</div>
                                    <div className="item-name">Sistem Yönetimi</div>
                                </button>
                                {workspaces.map(ws => (
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

                    <button className="close-btn mobile-only" onClick={() => setIsSidebarOpen(false)}>
                        <X size={24} />
                    </button>
                </div>

                <div className="sidebar-content">
                    <div className="sidebar-section">
                        <h3 className="section-title">ADMİN PANELİ</h3>
                        <nav className="sidebar-nav">
                            {menuItems.map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`sidebar-nav-item ${location.pathname === item.path ? 'active' : ''}`}
                                    onClick={() => setIsSidebarOpen(false)}
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    <span>{item.label}</span>
                                </Link>
                            ))}
                        </nav>
                    </div>
                </div>

                <div className="sidebar-footer">
                    <button className="logout-button" onClick={handleLogout}>
                        <LogOut size={20} className="nav-icon" />
                        <span>Çıkış Yap</span>
                    </button>
                </div>
            </aside>

            <main className="admin-main">
                <header className="admin-header">
                    <button className="menu-btn mobile-only" onClick={() => setIsSidebarOpen(true)}>
                        <Menu size={24} />
                    </button>
                    <div className="header-title">
                        <h2>{menuItems.find(i => i.path === location.pathname)?.label || 'Dashboard'}</h2>
                    </div>
                </header>
                <div className="content-area">
                    <Outlet />
                </div>
            </main>

            {isSidebarOpen && (
                <div className="sidebar-overlay mobile-only" onClick={() => setIsSidebarOpen(false)} />
            )}
        </div>
    );
};

export default AdminLayout;
