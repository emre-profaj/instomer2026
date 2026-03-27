import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Facebook, Instagram, MessageCircle, Mail, Box } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './Login.css';

const Login = () => {
    const navigate = useNavigate();
    const { login, isAuthenticated, user } = useAuth();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [animationStage, setAnimationStage] = useState('loading');

    const [formData, setFormData] = useState({ email: '', password: '' });

    useEffect(() => {
        const assembleTimer = setTimeout(() => setAnimationStage('assembled'), 800);
        const formTimer = setTimeout(() => setAnimationStage('form-visible'), 2000);
        return () => { clearTimeout(assembleTimer); clearTimeout(formTimer); };
    }, []);

    if (isAuthenticated) {
        if (user?.role === 'SUPER_ADMIN') return <Navigate to="/admin" />;
        return <Navigate to="/inbox" />;
    }

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const result = await login({ email: formData.email, password: formData.password, rememberMe });
        if (result.success) {
            const storedUser = JSON.parse(localStorage.getItem('user'));
            navigate(storedUser?.role === 'SUPER_ADMIN' ? '/admin' : '/inbox');
        } else {
            setError(result.error);
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
                    {error && <div className="error-message">{error}</div>}

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
