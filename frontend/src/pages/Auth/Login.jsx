import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Facebook, Instagram, MessageCircle, Mail, Box } from 'lucide-react';
import './Login.css';

const Login = () => {
    const navigate = useNavigate();
    const { login, isAuthenticated, user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [animationStage, setAnimationStage] = useState('loading'); // loading -> assembled -> form-visible

    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });

    // Animation sequence
    useEffect(() => {
        // Stage 1: After 800ms, assemble puzzle pieces
        const assembleTimer = setTimeout(() => {
            setAnimationStage('assembled');
        }, 800);

        // Stage 2: After 2000ms, show form and hide puzzle
        const formTimer = setTimeout(() => {
            setAnimationStage('form-visible');
        }, 2000);

        return () => {
            clearTimeout(assembleTimer);
            clearTimeout(formTimer);
        };
    }, []);

    // If already authenticated, redirect based on role
    if (isAuthenticated) {
        if (user?.role === 'SUPER_ADMIN') {
            return <Navigate to="/admin" />;
        }
        return <Navigate to="/inbox" />;
    }

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const result = await login({ email: formData.email, password: formData.password, rememberMe });

        if (result.success) {
            // Check if user is SUPER_ADMIN and redirect accordingly
            const storedUser = JSON.parse(localStorage.getItem('user'));
            if (storedUser?.role === 'SUPER_ADMIN') {
                navigate('/admin');
            } else {
                navigate('/inbox');
            }
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className={`login-page ${animationStage}`}>
            {/* Puzzle Pieces */}
            <div className="puzzle-wrapper">
                <div className="puzzle-piece fb">
                    <Facebook size={28} />
                </div>
                <div className="puzzle-piece insta">
                    <Instagram size={28} />
                </div>
                <div className="puzzle-piece wp">
                    <MessageCircle size={28} />
                </div>
                <div className="puzzle-piece mail">
                    <Mail size={28} />
                </div>
                <div className="puzzle-piece widget">
                    <Box size={28} />
                </div>
            </div>

            {/* Login Box */}
            <div className="login-box">
                <div className="logo-container">
                    <img src="/instomer-logo.png" alt="Instomer" className="logo-img" />
                </div>
                <h1 className="main-heading">Satış ve Destek Makinesi</h1>
                <p className="tagline">Geleceği Şekillendiren Müşteri İletişim Platformu</p>

                <form onSubmit={handleSubmit} className="login-form">
                    {error && <div className="error-message">{error}</div>}

                    <div className="form-group">
                        <label>E-posta</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Şifre</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="remember-me-row">
                        <label className="remember-me-label">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="remember-me-checkbox"
                            />
                            Beni Hatırla
                        </label>
                    </div>

                    <button
                        type="submit"
                        className="login-btn"
                        disabled={loading}
                    >
                        {loading ? 'Yükleniyor...' : 'Giriş Yap'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
