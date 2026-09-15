import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import { useToast } from '../../components/Toast/Toast';
import {
    User,
    Mail,
    Lock,
    Shield,
    CheckCircle2,
    Save,
    Camera,
    Building2,
    Calendar,
    KeyRound,
    Loader2
} from 'lucide-react';
import './ProfileSettings.css';

const ProfileSettings = () => {
    const { user, currentWorkspace, refreshWorkspace } = useAuth();
    const toast = useToast();

    // Profile Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [avatar, setAvatar] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    // Password Form State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);

    useEffect(() => {
        if (user) {
            setName(user.name || '');
            setEmail(user.email || '');
            setAvatar(user.avatar || '');
        }
    }, [user]);

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            toast?.error?.('Lütfen adınızı ve soyadınızı girin.') || alert('Lütfen adınızı ve soyadınızı girin.');
            return;
        }

        try {
            setSavingProfile(true);
            const res = await authAPI.updateProfile({
                name: name.trim(),
                avatar: avatar.trim() || null
            });

            if (res.data?.success) {
                toast?.success?.('Profil bilgileri başarıyla güncellendi!') || alert('Profil güncellendi!');
                if (typeof refreshWorkspace === 'function') {
                    await refreshWorkspace();
                }
            } else {
                toast?.error?.(res.data?.error || 'Güncelleme başarısız.') || alert('Güncelleme başarısız.');
            }
        } catch (err) {
            console.error('Update profile error:', err);
            const msg = err.response?.data?.error || err.message || 'Profil güncellenemedi.';
            toast?.error?.(msg) || alert(msg);
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 6) {
            toast?.error?.('Yeni şifre en az 6 karakter olmalıdır.') || alert('Yeni şifre en az 6 karakter olmalıdır.');
            return;
        }

        if (newPassword !== confirmPassword) {
            toast?.error?.('Yeni şifre ve şifre tekrarı uyuşmuyor.') || alert('Yeni şifre ve şifre tekrarı uyuşmuyor.');
            return;
        }

        try {
            setSavingPassword(true);
            const res = await authAPI.changePassword({
                currentPassword,
                newPassword
            });

            if (res.data?.success) {
                toast?.success?.('Şifreniz başarıyla değiştirildi!') || alert('Şifreniz başarıyla değiştirildi!');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                toast?.error?.(res.data?.error || 'Şifre değiştirilemedi.') || alert('Şifre değiştirilemedi.');
            }
        } catch (err) {
            console.error('Change password error:', err);
            const msg = err.response?.data?.error || err.message || 'Şifre değiştirilemedi.';
            toast?.error?.(msg) || alert(msg);
        } finally {
            setSavingPassword(false);
        }
    };

    const getInitials = (text) => {
        if (!text) return 'U';
        const parts = text.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return text.substring(0, 2).toUpperCase();
    };

    const formatRoleLabel = (role) => {
        switch (role) {
            case 'SUPER_ADMIN': return 'Süper Yönetici (Admin)';
            case 'OWNER': return 'Kurucu / Alan Sahibi';
            case 'ADMIN': return 'Yönetici';
            case 'MEMBER': return 'Ekip Üyesi';
            case 'AGENT': return 'Müşteri Temsilcisi';
            default: return role || 'Kullanıcı';
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('tr-TR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="profile-settings-container">
            <div className="profile-settings-header">
                <h1>Profil Ayarları</h1>
                <p>Kişisel hesap bilgilerinizi, şifrenizi ve hesap tercihlerinizi yönetin.</p>
            </div>

            <div className="profile-cards-stack">
                {/* 1. Kişisel Bilgiler */}
                <div className="profile-card">
                    <div className="profile-card-title-row">
                        <User size={18} color="#E63B2E" />
                        <h3>Kişisel Bilgiler</h3>
                    </div>

                    <form onSubmit={handleSaveProfile}>
                        <div className="profile-avatar-section">
                            <div className="profile-large-avatar">
                                {avatar ? (
                                    <img src={avatar} alt={name} />
                                ) : (
                                    <span>{getInitials(name)}</span>
                                )}
                            </div>
                            <div className="profile-avatar-info">
                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                    {name || 'Kullanıcı'}
                                </div>
                                <div className="profile-role-badge">
                                    <Shield size={12} />
                                    <span>{formatRoleLabel(user?.role)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="profile-form-grid">
                            <div className="profile-form-group">
                                <label>Ad Soyad *</label>
                                <input
                                    type="text"
                                    className="profile-input"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Adınız ve Soyadınız"
                                    required
                                />
                            </div>

                            <div className="profile-form-group">
                                <label>E-posta Adresi</label>
                                <input
                                    type="email"
                                    className="profile-input"
                                    value={email}
                                    disabled
                                    title="E-posta adresi değiştirilemez"
                                />
                            </div>

                            <div className="profile-form-group" style={{ gridColumn: '1 / -1' }}>
                                <label>Profil Fotoğrafı URL'si (İsteğe bağlı)</label>
                                <input
                                    type="url"
                                    className="profile-input"
                                    value={avatar}
                                    onChange={(e) => setAvatar(e.target.value)}
                                    placeholder="https://example.com/avatar.jpg"
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="submit"
                                className="profile-btn-primary"
                                disabled={savingProfile}
                            >
                                {savingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {savingProfile ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* 2. Güvenlik & Şifre Değiştir */}
                <div className="profile-card">
                    <div className="profile-card-title-row">
                        <KeyRound size={18} color="#E63B2E" />
                        <h3>Güvenlik & Şifre Değiştir</h3>
                    </div>

                    <form onSubmit={handleChangePassword}>
                        <div className="profile-form-grid">
                            <div className="profile-form-group" style={{ gridColumn: '1 / -1' }}>
                                <label>Mevcut Şifre</label>
                                <input
                                    type="password"
                                    className="profile-input"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Mevcut kullandığınız şifre"
                                    autoComplete="current-password"
                                />
                            </div>

                            <div className="profile-form-group">
                                <label>Yeni Şifre</label>
                                <input
                                    type="password"
                                    className="profile-input"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="En az 6 karakter"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>

                            <div className="profile-form-group">
                                <label>Yeni Şifre Tekrar</label>
                                <input
                                    type="password"
                                    className="profile-input"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Yeni şifrenizi tekrar girin"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="submit"
                                className="profile-btn-primary"
                                disabled={savingPassword}
                            >
                                {savingPassword ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                                {savingPassword ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* 3. Çalışma Alanı & Üyelik Bilgileri */}
                <div className="profile-card">
                    <div className="profile-card-title-row">
                        <Building2 size={18} color="#E63B2E" />
                        <h3>Çalışma Alanı & Üyelik Bilgileri</h3>
                    </div>

                    <div className="profile-meta-grid">
                        <div className="profile-meta-item">
                            <span className="profile-meta-label">Aktif Çalışma Alanı</span>
                            <span className="profile-meta-value">{currentWorkspace?.name || 'Varsayılan'}</span>
                        </div>

                        <div className="profile-meta-item">
                            <span className="profile-meta-label">Sistem Rolü</span>
                            <span className="profile-meta-value">{formatRoleLabel(user?.role)}</span>
                        </div>

                        <div className="profile-meta-item">
                            <span className="profile-meta-label">Hesap Oluşturulma</span>
                            <span className="profile-meta-value">{formatDate(user?.createdAt)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileSettings;
