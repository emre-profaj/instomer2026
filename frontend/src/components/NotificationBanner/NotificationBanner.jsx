import { useState, useEffect } from 'react';
import { Bell, X, CheckCircle } from 'lucide-react';
import notificationService from '../../services/notificationService';
import './NotificationBanner.css';

const NotificationBanner = () => {
    const [show, setShow] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        // Only show if notifications are supported and permission hasn't been asked
        if (notificationService.isSupported && notificationService.isPermissionDefault()) {
            // Delay showing the banner
            const timer = setTimeout(() => {
                // Check again - permission might have been granted in another tab
                if (Notification.permission === 'default') {
                    setShow(true);
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleEnable = async () => {
        setLoading(true);
        console.log('🔔 Bildirim izni isteniyor...');
        console.log('📌 Mevcut izin durumu:', Notification.permission);
        
        try {
            const granted = await notificationService.requestPermission();
            console.log('📌 İzin sonucu:', granted, '- Yeni durum:', Notification.permission);
            setLoading(false);
            
            if (granted) {
                setSuccess(true);
                console.log('✅ Bildirim izni verildi, test bildirimi gönderilecek');
                // Hide after showing success
                setTimeout(() => {
                    setShow(false);
                }, 2000);
            } else {
                console.warn('❌ Bildirim izni verilmedi veya reddedildi');
                // Kullanıcıya bilgi ver
                if (Notification.permission === 'denied') {
                    alert('Bildirim izni reddedildi. Tarayıcı ayarlarından izin vermeniz gerekiyor.');
                }
            }
        } catch (err) {
            console.error('Permission request error:', err);
            setLoading(false);
            alert('Bildirim izni istenemedi: ' + err.message);
        }
    };

    const handleDismiss = () => {
        setShow(false);
        // Remember dismissal in localStorage
        localStorage.setItem('notification-banner-dismissed', 'true');
    };

    // Don't show if already dismissed
    useEffect(() => {
        if (localStorage.getItem('notification-banner-dismissed') === 'true') {
            setShow(false);
        }
    }, []);

    if (!show) return null;
    
    // Show success state
    if (success) {
        return (
            <div className="notification-banner success">
                <div className="notification-banner-content">
                    <div className="notification-banner-icon success-icon">
                        <CheckCircle size={20} />
                    </div>
                    <div className="notification-banner-text">
                        <strong>Bildirimler Aktif!</strong>
                        <span>Yeni mesajlardan haberdar olacaksınız</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="notification-banner">
            <div className="notification-banner-content">
                <div className="notification-banner-icon">
                    <Bell size={20} />
                </div>
                <div className="notification-banner-text">
                    <strong>Bildirimleri Aç</strong>
                    <span>Yeni mesajlardan anında haberdar ol</span>
                </div>
            </div>
            <div className="notification-banner-actions">
                <button 
                    className="notification-enable-btn"
                    onClick={handleEnable}
                    disabled={loading}
                >
                    {loading ? 'İzin isteniyor...' : 'Etkinleştir'}
                </button>
                <button 
                    className="notification-dismiss-btn"
                    onClick={handleDismiss}
                    title="Kapat"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
};

export default NotificationBanner;

