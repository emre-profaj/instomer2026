import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { aiAPI } from '../../services/api';
import { Link2, Bot, Layers, Wrench, ChevronDown } from 'lucide-react';
import ApiIntegrationSettings from '../../components/Settings/ApiIntegrationSettings';
import BotToolsSettings from '../../components/Settings/BotToolsSettings';
import './Functions.css';

const Functions = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('integrations');
    useEffect(() => {
        // Any workspace related initialization if needed
    }, [currentWorkspace?.id]);

    return (
        <div className="functions-page">
            <div className="functions-header">
                <h1>
                    <Wrench size={24} />
                    Fonksiyonlar (API & Araçlar)
                </h1>
                <p className="header-desc">Dış sistem bağlantılarınızı kurun ve tüm asistanların/otomasyonların kullanabileceği ortak yetenekler (araçlar) ekleyin.</p>
            </div>

            <div className="functions-tabs">
                <button
                    className={`tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
                    onClick={() => setActiveTab('integrations')}
                >
                    <Link2 size={18} />
                    1. API Bağlantıları
                </button>
                <button
                    className={`tab-btn ${activeTab === 'tools' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tools')}
                >
                    <Bot size={18} />
                    2. Global Fonksiyonlar
                </button>
            </div>

            <div className="functions-content">
                {activeTab === 'integrations' && (
                    <div className="tab-pane">
                        <div className="info-banner">
                            <Layers size={20} />
                            <div>
                                <strong>Önce Bağlantı Kurun:</strong> Burada firmanızın kullanacağı ortak API sistemlerini tanımlayın (örn: Probel Hastane Sistemi). Daha sonra "2. Global Fonksiyonlar" sekmesinden bu sistemleri kullanan ortak fonksiyonlar yaratabilirsiniz.
                            </div>
                        </div>
                        <div className="settings-wrapper">
                            <ApiIntegrationSettings />
                        </div>
                    </div>
                )}

                {activeTab === 'tools' && (
                    <div className="tab-pane">
                        <div className="settings-wrapper bot-tools-wrapper">
                            <BotToolsSettings workspaceId={currentWorkspace?.id} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Functions;
