import { useState, useEffect } from 'react';
import { aiAPI } from '../../services/api';
import { Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const AIIntegrationSettings = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (workspaceId) {
            loadSettings();
        }
    }, [workspaceId]);

    const loadSettings = async () => {
        try {
            const res = await aiAPI.getSettings(workspaceId);
            setApiKey(res.data.aiApiKey || '');
        } catch (error) {
            console.error('Error loading AI settings:', error);
        }
    };

    const handleSaveApiKey = async () => {
        try {
            setLoading(true);
            await aiAPI.updateSettings(workspaceId, { aiApiKey: apiKey });
            alert('API Anahtarı kaydedildi!');
        } catch (error) {
            console.error('Error saving API key:', error);
            alert(error.response?.data?.error || 'Ayarlar kaydedilirken hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="settings-content">
            <h2 style={{ marginBottom: '24px' }}>AI Entegrasyonu</h2>

            {/* API Key Section */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <h3>API Bağlantısı</h3>
                <p className="text-muted text-sm mb-md">Google Gemini API anahtarınızı buraya giriniz.</p>
                <div className="form-group">
                    <label>Gemini API Key</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="password"
                            className="input"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="AIza..."
                            style={{ flex: 1 }}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={handleSaveApiKey}
                            disabled={loading}
                        >
                            <Save size={16} />
                            Kaydet
                        </button>
                    </div>
                </div>
            </div>

            <div className="card bg-gray-50 border-0">
                <p className="text-muted text-sm">
                    ℹ️ Botlarınızı oluşturmak ve yönetmek için sol menüdeki <strong>AI Asistanlar</strong> sayfasını kullanabilirsiniz.
                </p>
            </div>
        </div>
    );
};

export default AIIntegrationSettings;
