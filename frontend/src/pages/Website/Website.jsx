import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    MessageSquare, Bot, Users, Mail, Phone, Globe,
    BarChart3, Zap, Shield, CheckCircle, ArrowRight, Play,
    Instagram, Facebook, MessageCircle, Send, Star, Sparkles,
    TrendingUp, Clock, HeadphonesIcon, Layers, Target, Award
} from 'lucide-react';
import './Website.css';

const Website = () => {
    const [activeFeature, setActiveFeature] = useState(0);
    const [isVisible, setIsVisible] = useState({});
    const [stats, setStats] = useState({ users: 0, messages: 0, satisfaction: 0, response: 0 });

    // Animated counter effect
    useEffect(() => {
        const timer = setTimeout(() => {
            const interval = setInterval(() => {
                setStats(prev => ({
                    users: Math.min(prev.users + 127, 15000),
                    messages: Math.min(prev.messages + 2341, 50000000),
                    satisfaction: Math.min(prev.satisfaction + 1, 99),
                    response: Math.min(prev.response + 0.1, 2.5)
                }));
            }, 30);
            setTimeout(() => clearInterval(interval), 1500);
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    const features = [
        {
            icon: Layers,
            title: 'Omnichannel Mesaj Merkezi',
            description: 'Facebook, Instagram, WhatsApp, E-posta, Web Chat - tüm kanallarınız tek bir akıllı gelen kutusunda. Hiçbir müşteri mesajını kaçırmayın.',
            highlight: 'En Popüler'
        },
        {
            icon: Bot,
            title: 'GPT-4 Destekli AI Asistan',
            description: 'Son teknoloji yapay zeka ile 7/24 akıllı müşteri desteği. Karmaşık soruları anlayan, bağlam farkındalığı yüksek yanıtlar.',
            highlight: 'Yeni'
        },
        {
            icon: Target,
            title: 'Akıllı CRM & Lead Yönetimi',
            description: 'Müşteri yolculuğunu baştan sona takip edin. Otomatik lead skorlama, satış hunisi ve dönüşüm analizleri.',
            highlight: null
        },
        {
            icon: TrendingUp,
            title: 'Gerçek Zamanlı Analizler',
            description: 'Canlı dashboardlar, performans metrikleri, müşteri davranış analizleri ve öngörüsel raporlama.',
            highlight: null
        },
        {
            icon: Zap,
            title: 'Güçlü Otomasyon Motoru',
            description: 'Sürükle-bırak workflow builder ile dakikalar içinde karmaşık otomasyonlar kurun. If-then mantığı, zamanlama ve tetikleyiciler.',
            highlight: null
        },
        {
            icon: Shield,
            title: 'Kurumsal Güvenlik',
            description: 'ISO 27001, KVKK uyumlu. End-to-end şifreleme, 2FA, rol bazlı erişim kontrolü ve audit logları.',
            highlight: null
        }
    ];

    const integrations = [
        { icon: Facebook, name: 'Facebook Messenger', color: '#1877f2', desc: 'Sayfa mesajları & yorumlar' },
        { icon: Instagram, name: 'Instagram DM', color: '#e4405f', desc: 'Direkt mesajlar & hikaye yanıtları' },
        { icon: MessageCircle, name: 'WhatsApp Business', color: '#25d366', desc: 'Resmi API entegrasyonu' },
        { icon: Mail, name: 'E-posta', color: '#ea4335', desc: 'Gmail, Outlook, IMAP/SMTP' },
        { icon: Globe, name: 'Canlı Sohbet', color: '#6366f1', desc: 'Web sitesi widget\'ı' }
    ];

    const testimonials = [
        {
            name: 'Dr. Mehmet Kaşkaloğlu',
            role: 'Kaşkaloğlu Göz Hastanesi',
            content: 'Instomer ile hasta iletişimimiz %300 daha verimli hale geldi. AI asistan randevu sorularını otomatik yanıtlıyor, biz de karmaşık vakalara odaklanabiliyoruz.',
            avatar: 'MK',
            rating: 5
        },
        {
            name: 'Ayşe Yıldırım',
            role: 'E-Ticaret Direktörü, ModaHub',
            content: 'WhatsApp Business entegrasyonu satışlarımızı %45 artırdı. Müşteriler anında yanıt almayı seviyor ve dönüşüm oranlarımız hiç bu kadar yüksek olmamıştı.',
            avatar: 'AY',
            rating: 5
        },
        {
            name: 'Can Özdemir',
            role: 'Kurucu, TechZone',
            content: 'Eskiden 5 farklı platform kullanıyorduk. Şimdi tek yerden her şeyi yönetiyoruz. Ekip verimliliğimiz 4 kat arttı, müşteri memnuniyeti rekor seviyede.',
            avatar: 'CO',
            rating: 5
        }
    ];

    const useCases = [
        { title: 'E-Ticaret', icon: '🛒', desc: 'Sipariş takibi, iade süreçleri, ürün soruları' },
        { title: 'Sağlık', icon: '🏥', desc: 'Randevu yönetimi, hasta iletişimi' },
        { title: 'Finans', icon: '🏦', desc: 'Müşteri hizmetleri, işlem bilgilendirme' },
        { title: 'Eğitim', icon: '🎓', desc: 'Öğrenci desteği, kayıt süreçleri' },
        { title: 'Gayrimenkul', icon: '🏠', desc: 'Mülk sorguları, randevu koordinasyonu' },
        { title: 'Turizm', icon: '✈️', desc: 'Rezervasyon, seyahat desteği' }
    ];

    return (
        <div className="website-landing">
            {/* Animated Background */}
            <div className="animated-bg">
                <div className="gradient-sphere sphere-1"></div>
                <div className="gradient-sphere sphere-2"></div>
                <div className="gradient-sphere sphere-3"></div>
                <div className="grid-overlay"></div>
            </div>

            {/* Navigation */}
            <nav className="landing-nav">
                <div className="nav-container">
                    <div className="nav-logo">
                        <img src="/instomer-logo.png" alt="Instomer" />
                    </div>
                    <div className="nav-links">
                        <a href="#features">Özellikler</a>
                        <a href="#integrations">Entegrasyonlar</a>
                        <a href="#testimonials">Başarı Hikayeleri</a>
                        <a href="#pricing">Fiyatlandırma</a>
                    </div>
                    <div className="nav-actions">
                        <Link to="/login" className="nav-btn nav-btn-ghost">Giriş Yap</Link>
                        <Link to="/login" className="nav-btn nav-btn-primary">
                            <Sparkles size={16} />
                            Ücretsiz Başla
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-container">
                    <div className="hero-content">
                        <div className="hero-badge">
                            <div className="badge-glow"></div>
                            <Award size={14} />
                            <span>2024 Yılın En İyi Müşteri İletişim Platformu</span>
                        </div>
                        <h1 className="hero-title">
                            <span className="title-line">Müşteri İletişiminde</span>
                            <span className="title-line gradient-text">Yeni Nesil Deneyim</span>
                        </h1>
                        <p className="hero-subtitle">
                            Tüm iletişim kanallarınızı yapay zeka destekli tek bir platformda birleştirin.
                            Müşteri memnuniyetini artırın, operasyonel maliyetleri %60 azaltın.
                        </p>
                        <div className="hero-cta">
                            <Link to="/login" className="hero-btn hero-btn-primary">
                                <span>14 Gün Ücretsiz Deneyin</span>
                                <ArrowRight size={20} />
                            </Link>
                            <button className="hero-btn hero-btn-secondary">
                                <Play size={18} />
                                <span>Demo İzle</span>
                            </button>
                        </div>
                        <div className="hero-metrics">
                            <div className="metric">
                                <span className="metric-value">{stats.users.toLocaleString()}+</span>
                                <span className="metric-label">Aktif Kullanıcı</span>
                            </div>
                            <div className="metric-divider"></div>
                            <div className="metric">
                                <span className="metric-value">{(stats.messages / 1000000).toFixed(0)}M+</span>
                                <span className="metric-label">İşlenen Mesaj</span>
                            </div>
                            <div className="metric-divider"></div>
                            <div className="metric">
                                <span className="metric-value">%{stats.satisfaction}</span>
                                <span className="metric-label">Memnuniyet</span>
                            </div>
                            <div className="metric-divider"></div>
                            <div className="metric">
                                <span className="metric-value">{stats.response.toFixed(1)}sn</span>
                                <span className="metric-label">Ort. Yanıt</span>
                            </div>
                        </div>
                    </div>
                    <div className="hero-visual">
                        <div className="floating-cards">
                            <div className="float-card card-1">
                                <MessageCircle size={20} color="#25d366" />
                                <div className="card-content">
                                    <span className="card-title">WhatsApp</span>
                                    <span className="card-text">Yeni mesaj: "Ürün hakkında..."</span>
                                </div>
                                <span className="card-time">Şimdi</span>
                            </div>
                            <div className="float-card card-2">
                                <Instagram size={20} color="#e4405f" />
                                <div className="card-content">
                                    <span className="card-title">Instagram DM</span>
                                    <span className="card-text">Fiyat bilgisi almak istiyorum</span>
                                </div>
                                <span className="card-time">2dk</span>
                            </div>
                            <div className="float-card card-3">
                                <Bot size={20} color="#6366f1" />
                                <div className="card-content">
                                    <span className="card-title">AI Asistan</span>
                                    <span className="card-text">3 mesaj otomatik yanıtlandı ✓</span>
                                </div>
                                <span className="card-badge">Aktif</span>
                            </div>
                        </div>
                        <div className="dashboard-preview">
                            <div className="preview-header">
                                <div className="preview-dots"><span></span><span></span><span></span></div>
                                <span className="preview-url">app.instomer.com</span>
                            </div>
                            <div className="preview-content">
                                <div className="preview-sidebar">
                                    <div className="sidebar-item active"></div>
                                    <div className="sidebar-item"></div>
                                    <div className="sidebar-item"></div>
                                </div>
                                <div className="preview-main">
                                    <div className="main-list">
                                        <div className="list-item active">
                                            <div className="item-avatar green"></div>
                                            <div className="item-text"></div>
                                            <div className="item-badge">3</div>
                                        </div>
                                        <div className="list-item">
                                            <div className="item-avatar pink"></div>
                                            <div className="item-text"></div>
                                        </div>
                                        <div className="list-item">
                                            <div className="item-avatar blue"></div>
                                            <div className="item-text"></div>
                                        </div>
                                    </div>
                                    <div className="main-chat">
                                        <div className="chat-msg incoming"></div>
                                        <div className="chat-msg outgoing"></div>
                                        <div className="chat-msg incoming short"></div>
                                        <div className="chat-input"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="features-section">
                <div className="section-container">
                    <div className="section-header">
                        <span className="section-tag">
                            <Sparkles size={14} />
                            Özellikler
                        </span>
                        <h2 className="section-title">
                            İşinizi Büyütecek <span className="gradient-text">Süper Güçler</span>
                        </h2>
                        <p className="section-subtitle">
                            En son teknolojilerle donatılmış, kullanımı kolay araçlarla müşteri deneyimini dönüştürün.
                        </p>
                    </div>
                    <div className="features-grid">
                        {features.map((feature, index) => {
                            const Icon = feature.icon;
                            return (
                                <div key={index} className="feature-card" onMouseEnter={() => setActiveFeature(index)}>
                                    {feature.highlight && (
                                        <span className="feature-highlight">{feature.highlight}</span>
                                    )}
                                    <div className="feature-icon-wrapper">
                                        <div className="feature-icon">
                                            <Icon size={28} />
                                        </div>
                                        <div className="icon-glow"></div>
                                    </div>
                                    <h3 className="feature-title">{feature.title}</h3>
                                    <p className="feature-description">{feature.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Integrations Section */}
            <section id="integrations" className="integrations-section">
                <div className="section-container">
                    <div className="section-header">
                        <span className="section-tag">
                            <Layers size={14} />
                            Entegrasyonlar
                        </span>
                        <h2 className="section-title">
                            Tüm Kanallarınız <span className="gradient-text">Tek Çatı Altında</span>
                        </h2>
                        <p className="section-subtitle">
                            Müşterilerinizin tercih ettiği her platformla kusursuz entegrasyon.
                        </p>
                    </div>
                    <div className="integrations-grid">
                        {integrations.map((item, index) => {
                            const Icon = item.icon;
                            return (
                                <div key={index} className="integration-card" style={{ '--accent': item.color }}>
                                    <div className="integration-icon">
                                        <Icon size={32} />
                                    </div>
                                    <div className="integration-info">
                                        <h4>{item.name}</h4>
                                        <p>{item.desc}</p>
                                    </div>
                                    <CheckCircle size={24} className="integration-check" />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Use Cases */}
            <section className="usecases-section">
                <div className="section-container">
                    <div className="section-header">
                        <span className="section-tag">
                            <Target size={14} />
                            Sektörler
                        </span>
                        <h2 className="section-title">
                            Her Sektöre <span className="gradient-text">Özel Çözümler</span>
                        </h2>
                    </div>
                    <div className="usecases-grid">
                        {useCases.map((uc, index) => (
                            <div key={index} className="usecase-card">
                                <span className="usecase-icon">{uc.icon}</span>
                                <h4>{uc.title}</h4>
                                <p>{uc.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section id="testimonials" className="testimonials-section">
                <div className="section-container">
                    <div className="section-header">
                        <span className="section-tag">
                            <Star size={14} />
                            Başarı Hikayeleri
                        </span>
                        <h2 className="section-title">
                            Müşterilerimiz <span className="gradient-text">Neler Söylüyor</span>
                        </h2>
                    </div>
                    <div className="testimonials-grid">
                        {testimonials.map((t, index) => (
                            <div key={index} className="testimonial-card">
                                <div className="testimonial-header">
                                    <div className="testimonial-avatar">{t.avatar}</div>
                                    <div className="testimonial-author">
                                        <h4>{t.name}</h4>
                                        <p>{t.role}</p>
                                    </div>
                                </div>
                                <div className="testimonial-rating">
                                    {[...Array(t.rating)].map((_, i) => (
                                        <Star key={i} size={18} fill="#fbbf24" color="#fbbf24" />
                                    ))}
                                </div>
                                <blockquote>"{t.content}"</blockquote>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="pricing-section">
                <div className="section-container">
                    <div className="section-header">
                        <span className="section-tag">
                            <Sparkles size={14} />
                            Fiyatlandırma
                        </span>
                        <h2 className="section-title">
                            Büyüklüğünüze Göre <span className="gradient-text">Esnek Planlar</span>
                        </h2>
                        <p className="section-subtitle">
                            14 gün ücretsiz deneyin. İstediğiniz zaman iptal edin.
                        </p>
                    </div>
                    <div className="pricing-grid">
                        <div className="pricing-card">
                            <div className="pricing-header">
                                <h3>Başlangıç</h3>
                                <p>Küçük işletmeler için</p>
                                <div className="pricing-price">
                                    <span className="currency">₺</span>
                                    <span className="amount">299</span>
                                    <span className="period">/ay</span>
                                </div>
                            </div>
                            <ul className="pricing-features">
                                <li><CheckCircle size={18} /> 2 Kanal Entegrasyonu</li>
                                <li><CheckCircle size={18} /> 1.000 Mesaj/Ay</li>
                                <li><CheckCircle size={18} /> 2 Kullanıcı</li>
                                <li><CheckCircle size={18} /> Temel Analizler</li>
                                <li><CheckCircle size={18} /> E-posta Desteği</li>
                            </ul>
                            <button className="pricing-btn">Başla</button>
                        </div>
                        <div className="pricing-card featured">
                            <div className="pricing-badge">En Popüler</div>
                            <div className="pricing-header">
                                <h3>Profesyonel</h3>
                                <p>Büyüyen ekipler için</p>
                                <div className="pricing-price">
                                    <span className="currency">₺</span>
                                    <span className="amount">799</span>
                                    <span className="period">/ay</span>
                                </div>
                            </div>
                            <ul className="pricing-features">
                                <li><CheckCircle size={18} /> Sınırsız Kanal</li>
                                <li><CheckCircle size={18} /> 25.000 Mesaj/Ay</li>
                                <li><CheckCircle size={18} /> 10 Kullanıcı</li>
                                <li><CheckCircle size={18} /> AI Asistan (GPT-4)</li>
                                <li><CheckCircle size={18} /> Gelişmiş Analizler</li>
                                <li><CheckCircle size={18} /> Öncelikli Destek</li>
                                <li><CheckCircle size={18} /> Otomasyon Builder</li>
                            </ul>
                            <button className="pricing-btn primary">Başla</button>
                        </div>
                        <div className="pricing-card">
                            <div className="pricing-header">
                                <h3>Kurumsal</h3>
                                <p>Büyük organizasyonlar için</p>
                                <div className="pricing-price">
                                    <span className="amount">Özel Teklif</span>
                                </div>
                            </div>
                            <ul className="pricing-features">
                                <li><CheckCircle size={18} /> Sınırsız Her Şey</li>
                                <li><CheckCircle size={18} /> Özel Entegrasyonlar</li>
                                <li><CheckCircle size={18} /> Sınırsız Kullanıcı</li>
                                <li><CheckCircle size={18} /> Özel AI Eğitimi</li>
                                <li><CheckCircle size={18} /> SLA Garantisi (%99.9)</li>
                                <li><CheckCircle size={18} /> Dedicated Hesap Yöneticisi</li>
                                <li><CheckCircle size={18} /> On-premise Seçeneği</li>
                            </ul>
                            <button className="pricing-btn">Görüşme Talep Et</button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="cta-section">
                <div className="cta-container">
                    <div className="cta-content">
                        <h2>Müşteri İletişiminizi <span className="gradient-text">Dönüştürmeye</span> Hazır mısınız?</h2>
                        <p>14 gün tamamen ücretsiz. Kredi kartı gerekmez. Dakikalar içinde başlayın.</p>
                        <div className="cta-buttons">
                            <Link to="/login" className="cta-btn cta-btn-primary">
                                <Sparkles size={20} />
                                Ücretsiz Hesap Oluştur
                            </Link>
                            <a href="tel:+908505551234" className="cta-btn cta-btn-secondary">
                                <Phone size={18} />
                                0850 555 12 34
                            </a>
                        </div>
                        <div className="cta-features">
                            <span><CheckCircle size={16} /> Kredi kartı gerekmez</span>
                            <span><CheckCircle size={16} /> 5 dakikada kurulum</span>
                            <span><CheckCircle size={16} /> İstediğiniz zaman iptal</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="footer-container">
                    <div className="footer-simple">
                        <div className="footer-brand-center">
                            <img src="/instomer-logo.png" alt="Instomer" />
                            <p>Müşteri iletişiminde yeni nesil deneyim. Tüm kanallarınızı yapay zeka destekli tek platformda birleştirin.</p>
                        </div>
                        <div className="footer-links-inline">
                            <a href="#features">Özellikler</a>
                            <a href="#integrations">Entegrasyonlar</a>
                            <a href="#testimonials">Başarı Hikayeleri</a>
                            <a href="#pricing">Fiyatlandırma</a>
                        </div>
                        <div className="footer-social-center">
                            <a href="#" aria-label="Facebook"><Facebook size={20} /></a>
                            <a href="#" aria-label="Instagram"><Instagram size={20} /></a>
                            <a href="#" aria-label="WhatsApp"><MessageCircle size={20} /></a>
                        </div>
                    </div>
                    <div className="footer-bottom">
                        <p>© 2024 Instomer. Tüm hakları saklıdır.</p>
                        <p>🇹🇷 Türkiye'de sevgiyle üretildi</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Website;
