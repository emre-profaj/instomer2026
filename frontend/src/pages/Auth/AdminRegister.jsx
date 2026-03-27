import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, Lock, UserCog } from 'lucide-react';
import './Login.css'; // Re-use login styles but we'll add inline overrides or a new CSS if needed

const AdminRegister = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { register, isAuthenticated } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        adminSecret: 'SUPER_SECRET_KEY_2025' // Hardcoded for hidden access
    });

    if (isAuthenticated) {
        return <Navigate to="/admin" />;
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

        const result = await register(formData);

        if (result.success) {
            navigate('/admin');
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className="login-page" style={{ background: '#0f172a' }}>
            <div className="login-container" style={{ borderColor: '#ef4444' }}>
                <div className="login-header">
                    <div className="login-logo" style={{ color: '#ef4444', background: '#fee2e2' }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h1 style={{ color: '#ef4444' }}>Super Admin</h1>
                    <p>Secret Admin Registration</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    {error && <div className="error-message">{error}</div>}

                    <div className="form-group">
                        <label>Admin Name</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="input"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className="input"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            className="input"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-block"
                        style={{ background: '#ef4444', borderColor: '#ef4444' }}
                        disabled={loading}
                    >
                        {loading ? 'Creating Admin...' : 'Register as Admin'}
                    </button>

                    <div className="toggle-form">
                        <button
                            type="button"
                            onClick={() => navigate('/login')}
                            className="link-btn"
                            style={{ color: '#94a3b8' }}
                        >
                            ← Back to Login
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminRegister;
