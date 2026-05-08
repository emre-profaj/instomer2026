import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { aiAPI } from '../../services/api';
import { Link2, Bot, Layers, Wrench, Zap } from 'lucide-react';
import ApiIntegrationSettings from '../../components/Settings/ApiIntegrationSettings';
import BotToolsSettings from '../../components/Settings/BotToolsSettings';
import RetellActionsSettings from '../../components/Settings/RetellActionsSettings';
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
                <button
                    className={`tab-btn ${activeTab === 'retell_actions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('retell_actions')}
                >
                    <Zap size={18} />
                    3. Otomatik Gönderimler
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

                {activeTab === 'retell_actions' && (
                    <div className="tab-pane">
                        <div className="info-banner">
                            <Zap size={20} />
                            <div>
                                <strong>Retell Sesli Arama — Otomatik WhatsApp Gönderimleri:</strong> Retell agent arama sırasında müşteriye otomatik olarak konum, katalog, video veya randevu bilgisi gönderebilir. Aşağıdan aksiyonlarınızı tanımlayın, ardından Retell Dashboard'da bu URL'i fonksiyon olarak ekleyin.
                            </div>
                        </div>
                        <div className="settings-wrapper">
                            <RetellActionsSettings workspaceId={currentWorkspace?.id} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Functions;
