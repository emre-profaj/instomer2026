import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Facebook, Instagram, MessageCircle, Mail, Box } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './Login.css';

// Module-level flag: survives re-renders, resets on page refresh
let _loginAnimPlayed = false;

const Login = () => {
    const navigate = useNavigate();
    const { login, isAuthenticated, user } = useAuth();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(0);
    const [rememberMe, setRememberMe] = useState(true);
    const [animationStage, setAnimationStage] = useState(_loginAnimPlayed ? 'form-visible' : 'loading');
    const countdownRef = useRef(null);

    const [formData, setFormData] = useState({ email: '', password: '' });

    useEffect(() => {
        if (_loginAnimPlayed) return;
        _loginAnimPlayed = true;
        const assembleTimer = setTimeout(() => setAnimationStage('assembled'), 800);
        const formTimer = setTimeout(() => setAnimationStage('form-visible'), 2000);
        return () => { clearTimeout(assembleTimer); clearTimeout(formTimer); };
    }, []);

    // Auto-dismiss error after 5 seconds with countdown
    useEffect(() => {
        if (!error) return;
        setCountdown(5);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current);
                    setError('');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(countdownRef.current);
    }, [error]);

    if (isAuthenticated) {
        if (user?.role === 'SUPER_ADMIN') return <Navigate to="/admin" />;
        return <Navigate to="/inbox" />;
    }

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        clearInterval(countdownRef.current);
        const result = await login({ email: formData.email, password: formData.password, rememberMe });
        if (result.success) {
            const storedUser = JSON.parse(localStorage.getItem('user'));
            navigate(storedUser?.role === 'SUPER_ADMIN' ? '/admin' : '/inbox');
        } else {
            // Force Turkish error message
            const msg = result.error;
            const turkishMsg = (msg === 'Invalid credentials' || msg === 'Login failed')
                ? 'E-posta veya şifre hatalı'
                : msg;
            setError(turkishMsg);
        }
        setLoading(false);
    };

    return (
        <div className={`login-page ${animationStage}`}>
            <div className="puzzle-wrapper">
                <div className="puzzle-piece fb"><Facebook size={28} /></div>
                <div className="puzzle-piece insta"><Instagram size={28} /></div>
                <div className="puzzle-piece wp"><MessageCircle size={28} /></div>
                <div className="puzzle-piece mail"><Mail size={28} /></div>
                <div className="puzzle-piece widget"><Box size={28} /></div>
            </div>

            <div className="login-box">
                <div className="logo-container">
                    <img src="/instomer-logo.png" alt="Instomer" className="logo-img" />
                </div>
                <h1 className="main-heading">{t('login.headline')}</h1>
                <p className="tagline">{t('login.tagline')}</p>

                <form onSubmit={handleSubmit} className="login-form">
                    {error && (
                        <div className="login-error-toast">
                            <span className="login-error-text">⚠️ {error}</span>
                            <span className="login-error-countdown">{countdown}s</span>
                        </div>
                    )}

                    <div className="form-group">
                        <label>{t('auth.email')}</label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} required />
                    </div>

                    <div className="form-group">
                        <label>{t('auth.password')}</label>
                        <input type="password" name="password" value={formData.password} onChange={handleChange} required />
                    </div>

                    <div className="remember-me-row">
                        <label className="remember-me-label">
                            <input type="checkbox" checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="remember-me-checkbox" />
                            {t('auth.rememberMe')}
                        </label>
                    </div>

                    <button type="submit" className="login-btn" disabled={loading}>
                        {loading ? t('common.loading') : t('auth.loginBtn')}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
