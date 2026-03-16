import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationBanner from '../NotificationBanner/NotificationBanner';
import InstoBot from '../InstoBot/InstoBot';
import './Layout.css';

const Layout = ({ title }) => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });

    useEffect(() => {
        const handleSidebarToggle = (e) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener('sidebar-toggle', handleSidebarToggle);
        return () => window.removeEventListener('sidebar-toggle', handleSidebarToggle);
    }, []);

    return (
        <div className={`layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            <Sidebar />
            <div className="main-content">
                <Header title={title} />
                <div className="content">
                    <Outlet />
                </div>
            </div>
            <NotificationBanner />
            <InstoBot />
        </div>
    );
};

export default Layout;
