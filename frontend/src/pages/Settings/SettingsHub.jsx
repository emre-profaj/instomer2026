import { useState, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Settings, ChevronRight, Loader2 } from 'lucide-react';

// Lazy load all settings components
const WorkspaceSettings = lazy(() => import('./WorkspaceSettings'));
const CaseTypesAndTopics = lazy(() => import('./CaseTypesAndTopics'));
const Templates = lazy(() => import('./Templates'));
const Integrations = lazy(() => import('./Integrations'));
const NotificationSettings = lazy(() => import('./NotificationSettings'));
const Channels = lazy(() => import('../../pages/Channels/Channels'));
const Funnels = lazy(() => import('../../pages/Funnels/Funnels'));
const Teams = lazy(() => import('../../pages/Teams/Teams'));
const Products = lazy(() => import('../../pages/Sales/Products'));
const KnowledgeBase = lazy(() => import('../../pages/KnowledgeBase/KnowledgeBase'));
const OtomasyonlarHub = lazy(() => import('../../pages/Automations/OtomasyonlarHub'));

// AI icon parallelogram
const AIIcon = ({ size = 14 }) => (
    <span style={{
        display: 'inline-block',
        width: size,
        height: size * 0.7,
        background: 'linear-gradient(135deg, #E63B2E, #FF4521)',
        borderRadius: 1,
        transform: 'skewX(-25deg)',
        flexShrink: 0
    }} />
);

// Sidebar configuration
const SIDEBAR_GROUPS = [
    {
        label: 'BASE',
        items: [
            { key: 'firma', label: 'Firma & Bilgi Bankası', icon: '🏢' },
            { key: 'subeler', label: 'Şubeler', icon: '📍' },
            { key: 'kategoriler', label: 'Kategoriler', icon: '📂' },
            { key: 'urunler', label: 'Ürünler', icon: '📦' },
            { key: 'sablonlar', label: 'Şablonlar', icon: '📝' },
            { key: 'entegrasyonlar', label: 'Entegrasyonlar', icon: '🔗' },
        ]
    },
    {
        label: 'AKIŞ & SÜREÇ',
        items: [
            { key: 'akislar', label: 'Akışlar & Vaka Tipleri', icon: '🌊' },
            { key: 'kanallar', label: 'Kanallar & Yönlendirme', icon: '📡' },
        ]
    },
    {
        label: 'TAKIM & EKİP',
        items: [
            { key: 'takimlar', label: 'Takımlar', icon: '👥' },
            { key: 'agentlar', label: 'AI Agentlar', icon: 'ai' },
        ]
    },
    {
        label: 'OTOMASYON',
        items: [
            { key: 'otomasyonlar', label: 'Otomasyonlar', icon: '⚡' },
            { key: 'bildirimler', label: 'Bildirimler', icon: '🔔' },
        ]
    }
];

const Loading = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#9ca3af' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ marginLeft: 8, fontSize: '.85rem' }}>Yükleniyor...</span>
    </div>
);

const SettingsHub = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { currentWorkspace, user } = useAuth();
    const activeTab = searchParams.get('tab') || 'firma';

    const setActiveTab = (tab) => {
        setSearchParams({ tab }, { replace: true });
    };

    // Render content based on active tab
    const renderContent = () => {
        switch (activeTab) {
            case 'firma':
                return (
                    <div>
                        {/* Wizard Banner */}
                        <div
                            onClick={() => navigate('/ayarlar/wizard')}
                            style={{
                                background: 'linear-gradient(135deg, #fef2f2, #fff7ed)',
                                border: '1.5px solid #fecaca',
                                borderRadius: 12,
                                padding: '16px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                marginBottom: 20,
                                cursor: 'pointer',
                                transition: 'all .15s'
                            }}
                        >
                            <span style={{ fontSize: '1.8rem' }}>🧙‍♂️</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '.85rem', color: '#E63B2E' }}>Kurulum Sihirbazı</div>
                                <div style={{ fontSize: '.72rem', color: '#6b7280' }}>Adım adım yapılandırma — ilk kurulum veya yeniden düzenleme</div>
                            </div>
                            <div style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                background: '#E63B2E',
                                color: 'white',
                                fontSize: '.78rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}>
                                Sihirbazı Başlat <ChevronRight size={14} />
                            </div>
                        </div>
                        <Suspense fallback={<Loading />}>
                            <WorkspaceSettings />
                        </Suspense>
                    </div>
                );
            case 'subeler':
                return (
                    <Suspense fallback={<Loading />}>
                        <WorkspaceSettings />
                    </Suspense>
                );
            case 'kategoriler':
                return (
                    <Suspense fallback={<Loading />}>
                        <CaseTypesAndTopics />
                    </Suspense>
                );
            case 'urunler':
                return (
                    <Suspense fallback={<Loading />}>
                        <Products />
                    </Suspense>
                );
            case 'sablonlar':
                return (
                    <Suspense fallback={<Loading />}>
                        <Templates />
                    </Suspense>
                );
            case 'entegrasyonlar':
                return (
                    <Suspense fallback={<Loading />}>
                        <Integrations />
                    </Suspense>
                );
            case 'akislar':
                return (
                    <Suspense fallback={<Loading />}>
                        <Funnels />
                    </Suspense>
                );
            case 'kanallar':
                return (
                    <Suspense fallback={<Loading />}>
                        <Channels />
                    </Suspense>
                );
            case 'takimlar':
                return (
                    <Suspense fallback={<Loading />}>
                        <Teams />
                    </Suspense>
                );
            case 'agentlar':
                return (
                    <Suspense fallback={<Loading />}>
                        <Teams />
                    </Suspense>
                );
            case 'otomasyonlar':
                return (
                    <Suspense fallback={<Loading />}>
                        <OtomasyonlarHub />
                    </Suspense>
                );
            case 'bildirimler':
                return (
                    <Suspense fallback={<Loading />}>
                        <NotificationSettings />
                    </Suspense>
                );
            default:
                return (
                    <Suspense fallback={<Loading />}>
                        <WorkspaceSettings />
                    </Suspense>
                );
        }
    };

    return (
        <div style={styles.container}>
            {/* Animation keyframes */}
            <style>{`
                @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
                .sh-item:hover { background: #f9fafb !important; }
                .sh-item.active { background: #fef2f2 !important; border-left-color: #E63B2E !important; }
                .sh-item.active .sh-label { color: #E63B2E !important; font-weight: 700 !important; }
            `}</style>

            {/* LEFT SIDEBAR */}
            <div style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <Settings size={18} style={{ color: '#E63B2E' }} />
                    <span style={styles.sidebarTitle}>Ayarlar</span>
                </div>

                <div style={styles.sidebarContent}>
                    {SIDEBAR_GROUPS.map((group) => (
                        <div key={group.label} style={{ marginBottom: 16 }}>
                            <div style={styles.groupLabel}>{group.label}</div>
                            {group.items.map(item => (
                                <div
                                    key={item.key}
                                    className={`sh-item ${activeTab === item.key ? 'active' : ''}`}
                                    onClick={() => setActiveTab(item.key)}
                                    style={styles.navItem}
                                >
                                    {item.icon === 'ai' ? (
                                        <AIIcon size={12} />
                                    ) : (
                                        <span style={{ fontSize: '.8rem', width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                                    )}
                                    <span className="sh-label" style={styles.navLabel}>{item.label}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Sidebar footer */}
                <div style={styles.sidebarFooter}>
                    <div style={{ fontSize: '.62rem', color: '#9ca3af', textAlign: 'center' }}>
                        {currentWorkspace?.name || 'Workspace'}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div style={styles.main}>
                {/* Content Header */}
                <div style={styles.contentHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '1rem' }}>
                            {SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.key === activeTab)?.icon === 'ai'
                                ? <AIIcon size={16} />
                                : SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.key === activeTab)?.icon || '⚙️'}
                        </span>
                        <h1 style={styles.contentTitle}>
                            {SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.key === activeTab)?.label || 'Ayarlar'}
                        </h1>
                    </div>
                </div>

                {/* Content Area */}
                <div style={styles.contentArea}>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

const styles = {
    container: {
        display: 'flex',
        height: '100%',
        minHeight: 'calc(100vh - 60px)',
        background: '#f5f6f8',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    sidebar: {
        width: 220,
        background: 'white',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: 'calc(100vh - 60px)',
        overflowY: 'auto',
    },
    sidebarHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '16px 16px 12px',
        borderBottom: '1px solid #f3f4f6',
    },
    sidebarTitle: {
        fontSize: '.9rem',
        fontWeight: 800,
        color: '#1f2937',
        letterSpacing: '-.3px',
    },
    sidebarContent: {
        flex: 1,
        padding: '12px 8px',
        overflowY: 'auto',
    },
    groupLabel: {
        fontSize: '.56rem',
        color: '#9ca3af',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.8px',
        padding: '0 8px',
        marginBottom: 4,
    },
    navItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        borderRadius: 7,
        cursor: 'pointer',
        transition: 'all .15s',
        borderLeft: '3px solid transparent',
        marginBottom: 1,
    },
    navLabel: {
        fontSize: '.74rem',
        color: '#374151',
        fontWeight: 500,
    },
    sidebarFooter: {
        padding: '10px 14px',
        borderTop: '1px solid #f3f4f6',
    },
    main: {
        flex: 1,
        overflowY: 'auto',
        minWidth: 0,
    },
    contentHeader: {
        padding: '16px 24px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    contentTitle: {
        fontSize: '1.1rem',
        fontWeight: 700,
        color: '#1f2937',
        margin: 0,
    },
    contentArea: {
        padding: '12px 24px 40px',
    },
};

export default SettingsHub;
