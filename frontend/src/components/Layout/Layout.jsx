import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationBanner from '../NotificationBanner/NotificationBanner';
import Insta from '../Insta/Insta';
import './Layout.css';

// 🔧 Bakım Duyurusu Banner
const MaintenanceBanner = () => {
    const [dismissed, setDismissed] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const checkTime = () => {
            const now = new Date();
            // 2 Eylül 2026 saat 12:00'dan sonra gösterme
            const endTime = new Date('2026-09-02T12:00:00+03:00');
            setVisible(now < endTime);
        };
        checkTime();
        const interval = setInterval(checkTime, 60000); // Her dakika kontrol et
        return () => clearInterval(interval);
    }, []);

    if (!visible || dismissed) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999999,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#fff',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            animation: 'slideDown 0.3s ease'
        }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <span>
                <strong>Planlı Güncelleme:</strong> Bugün saat <strong>11:00 - 12:00</strong> arası sistem güncellemesi yapılacaktır. Bu süre zarfında kısa süreli kesintiler yaşanabilir.
            </span>
            <button
                onClick={() => setDismissed(true)}
                style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                    marginLeft: '8px',
                    whiteSpace: 'nowrap'
                }}
            >
                ✕ Kapat
            </button>
            <style>{`@keyframes slideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        </div>
    );
};

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
            <MaintenanceBanner />
            <Sidebar />
            <div className="main-content">
                <Header title={title} />
                <div className="content">
                    <Outlet />
                </div>
            </div>
            <NotificationBanner />
            <Insta />
        </div>
    );
};

export default Layout;
