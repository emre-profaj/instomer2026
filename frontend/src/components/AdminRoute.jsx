import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdminRoute = ({ children }) => {
    const { isAuthenticated, loading, user } = useAuth();

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh'
            }}>
                <div>Yükleniyor...</div>
            </div>
        );
    }

    // Not authenticated - redirect to login
    if (!isAuthenticated) {
        return <Navigate to="/login" />;
    }

    // Not SUPER_ADMIN - redirect to main app
    if (user?.role !== 'SUPER_ADMIN') {
        return <Navigate to="/inbox" />;
    }

    return children;
};

export default AdminRoute;





