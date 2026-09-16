import React from 'react';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSectorLabels } from '../../utils/sectorLabels';
import {
    Settings,
    Wand2,
    Sparkles,
    Building2,
    MapPin,
    Layers,
    FolderTree,
    Package,
    UserCircle,
    FileText,
    Upload,
    Globe,
    Link as LinkIcon,
    Database,
    Radio,
    Kanban,
    Users,
    FileSignature,
    Zap,
    Cpu,
    Bell,
    UserCog,
    Sliders
} from 'lucide-react';
import './SettingsNav.css';

const SettingsNav = () => {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { currentWorkspace } = useAuth();
    const labels = getSectorLabels(currentWorkspace?.industry);

    const currentTab = searchParams.get('tab') || 'company';
    const currentPath = location.pathname;

    const isKbActive = (tab) => currentPath === '/base' && currentTab === tab;
    const isPathActive = (routes) => routes.some(r => currentPath === r || currentPath.startsWith(r + '/'));

    const handleAiConfigure = () => {
        window.dispatchEvent(new CustomEvent('open-insta', { detail: { tab: 'wizard' } }));
    };

    return (
        <nav className="settings-nav-panel select-none">
            {/* Üst Başlık */}
            <div className="settings-nav-header">
                <div className="settings-nav-header-left">
                    <div className="settings-nav-header-icon">
                        <Settings size={14} />
                    </div>
                    <span className="settings-nav-title">Ayarlar</span>
                </div>
                <span className="settings-nav-badge">Yönetim</span>
            </div>

            {/* Hızlı Eylemler: Sihirbaz & AI Yapılandırma */}
            <div className="settings-nav-quick-actions">
                <button
                    type="button"
                    onClick={() => navigate('/setup-wizard')}
                    className="settings-quick-btn wizard"
                    title="Adım Adım Hızlı Kurulum Sihirbazı"
                >
                    <Wand2 size={13} className="quick-btn-icon" />
                    <span>Hızlı Kurulum Sihirbazı</span>
                </button>

                <button
                    type="button"
                    onClick={handleAiConfigure}
                    className="settings-quick-btn ai"
                    title="Insta AI Workspace Yapılandırıcı"
                >
                    <Sparkles size={13} className="quick-btn-icon" />
                    <span>AI ile Yapılandır</span>
                </button>
            </div>

            {/* 21 Satırlık Açık Menü Ağacı */}
            <div className="settings-nav-tree custom-scroll">
                
                {/* GRUP 1: FİRMA & BİLGİ BANKASI */}
                <div className="settings-nav-group">
                    <span className="settings-group-label">FİRMA & BİLGİ BANKASI</span>
                    <div className="settings-group-items">
                        <Link
                            to="/base?tab=company"
                            className={`settings-nav-item ${isKbActive('company') ? 'active' : ''}`}
                        >
                            <Building2 size={15} />
                            <span className="settings-item-label">Şirket Bilgileri</span>
                        </Link>

                        <Link
                            to="/base?tab=branches"
                            className={`settings-nav-item ${isKbActive('branches') ? 'active' : ''}`}
                        >
                            <MapPin size={15} />
                            <span className="settings-item-label">{labels.branchesTab || 'Şubeler'}</span>
                        </Link>

                        <Link
                            to="/base?tab=categories"
                            className={`settings-nav-item ${isKbActive('categories') ? 'active' : ''}`}
                        >
                            <Layers size={15} />
                            <span className="settings-item-label">{labels.categoriesTab || 'Kategoriler'}</span>
                        </Link>

                        <Link
                            to="/base?tab=productGroups"
                            className={`settings-nav-item ${isKbActive('productGroups') ? 'active' : ''}`}
                        >
                            <FolderTree size={15} />
                            <span className="settings-item-label">{labels.productGroupsTab || 'Ürün Grupları'}</span>
                        </Link>

                        <Link
                            to="/base?tab=products"
                            className={`settings-nav-item ${isKbActive('products') ? 'active' : ''}`}
                        >
                            <Package size={15} />
                            <span className="settings-item-label">{labels.productsTab || 'Ürünler & Hizmetler'}</span>
                        </Link>

                        <Link
                            to="/base?tab=resources"
                            className={`settings-nav-item ${isKbActive('resources') ? 'active' : ''}`}
                        >
                            <UserCircle size={15} />
                            <span className="settings-item-label">Kaynaklar</span>
                        </Link>

                        <Link
                            to="/base?tab=text"
                            className={`settings-nav-item ${isKbActive('text') ? 'active' : ''}`}
                        >
                            <FileText size={15} />
                            <span className="settings-item-label">Metin Ekle / SSS</span>
                        </Link>

                        <Link
                            to="/base?tab=files"
                            className={`settings-nav-item ${isKbActive('files') ? 'active' : ''}`}
                        >
                            <Upload size={15} />
                            <span className="settings-item-label">Dosya Ekle</span>
                        </Link>

                        <Link
                            to="/base?tab=url"
                            className={`settings-nav-item ${isKbActive('url') ? 'active' : ''}`}
                        >
                            <Globe size={15} />
                            <span className="settings-item-label">Web Sitesi Tara</span>
                        </Link>

                        <Link
                            to="/base?tab=feed"
                            className={`settings-nav-item ${isKbActive('feed') ? 'active' : ''}`}
                        >
                            <LinkIcon size={15} />
                            <span className="settings-item-label">Dinamik Feed</span>
                        </Link>

                        <Link
                            to="/base?tab=list"
                            className={`settings-nav-item ${isKbActive('list') ? 'active' : ''}`}
                        >
                            <Database size={15} />
                            <span className="settings-item-label">Tüm Bilgiler</span>
                        </Link>
                    </div>
                </div>

                <div className="settings-nav-divider" />

                {/* GRUP 2: SÜREÇ */}
                <div className="settings-nav-group">
                    <span className="settings-group-label">SÜREÇ</span>
                    <div className="settings-group-items">
                        <Link
                            to="/channels"
                            className={`settings-nav-item ${isPathActive(['/channels', '/channels2', '/classifier']) ? 'active' : ''}`}
                        >
                            <Radio size={15} />
                            <span className="settings-item-label">Kanallar & Sınıflandırıcı</span>
                        </Link>

                        <Link
                            to="/funnels"
                            className={`settings-nav-item ${isPathActive(['/funnels', '/casetypes', '/topic-categories']) ? 'active' : ''}`}
                        >
                            <Kanban size={15} />
                            <span className="settings-item-label">Akışlar & Vaka Tipleri</span>
                        </Link>
                    </div>
                </div>

                <div className="settings-nav-divider" />

                {/* GRUP 3: EKİP */}
                <div className="settings-nav-group">
                    <span className="settings-group-label">EKİP</span>
                    <div className="settings-group-items">
                        <Link
                            to="/teams"
                            className={`settings-nav-item ${isPathActive(['/teams', '/users']) ? 'active' : ''}`}
                        >
                            <Users size={15} />
                            <span className="settings-item-label">Takım ve Üyeler</span>
                        </Link>

                        <Link
                            to="/ai-agents"
                            className={`settings-nav-item ${isPathActive(['/ai-agents', '/assistants', '/agents']) ? 'active' : ''}`}
                        >
                            <Sparkles size={15} />
                            <span className="settings-item-label">AI Agentlar</span>
                        </Link>
                    </div>
                </div>

                <div className="settings-nav-divider" />

                {/* GRUP 4: ARAÇLAR */}
                <div className="settings-nav-group">
                    <span className="settings-group-label">ARAÇLAR</span>
                    <div className="settings-group-items">
                        <Link
                            to="/templates"
                            className={`settings-nav-item ${isPathActive(['/templates']) ? 'active' : ''}`}
                        >
                            <FileSignature size={15} />
                            <span className="settings-item-label">Şablonlar</span>
                        </Link>

                        <Link
                            to="/automations-hub"
                            className={`settings-nav-item ${isPathActive(['/automations-hub', '/automations']) ? 'active' : ''}`}
                        >
                            <Zap size={15} />
                            <span className="settings-item-label">Otomasyonlar</span>
                        </Link>

                        <Link
                            to="/integrations"
                            className={`settings-nav-item ${isPathActive(['/integrations']) ? 'active' : ''}`}
                        >
                            <Cpu size={15} />
                            <span className="settings-item-label">Entegrasyonlar</span>
                        </Link>
                    </div>
                </div>

                <div className="settings-nav-divider" />

                {/* GRUP 5: DİĞER */}
                <div className="settings-nav-group">
                    <span className="settings-group-label">DİĞER</span>
                    <div className="settings-group-items">
                        <Link
                            to="/notification-settings"
                            className={`settings-nav-item ${isPathActive(['/notification-settings']) ? 'active' : ''}`}
                        >
                            <Bell size={15} />
                            <span className="settings-item-label">Bildirim Ayarları</span>
                        </Link>

                        <Link
                            to="/profile"
                            className={`settings-nav-item ${isPathActive(['/profile', '/profile-settings']) ? 'active' : ''}`}
                        >
                            <UserCog size={15} />
                            <span className="settings-item-label">Profil Ayarları</span>
                        </Link>

                        <Link
                            to="/workspace-settings"
                            className={`settings-nav-item ${isPathActive(['/workspace-settings', '/firm-settings']) ? 'active' : ''}`}
                        >
                            <Sliders size={15} />
                            <span className="settings-item-label">Workspace Ayarları</span>
                        </Link>
                    </div>
                </div>

            </div>
        </nav>
    );
};

export default SettingsNav;
