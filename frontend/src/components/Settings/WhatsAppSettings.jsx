import { useState, useEffect } from 'react';
import { whatsappAPI } from '../../services/api';
import { Phone, Trash2, Plus, MessageCircle } from 'lucide-react';

const WhatsAppSettings = ({ workspaceId, aiBots, assigningBot, onAssignBot, onClose }) => {
    const [phoneNumbers, setPhoneNumbers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [candidates, setCandidates] = useState([]);
    const [showCandidatesModal, setShowCandidatesModal] = useState(false);
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        if (workspaceId) {
            loadPhoneNumbers();
        }
    }, [workspaceId]);

    const loadPhoneNumbers = async () => {
        try {
            setLoading(true);
            const response = await whatsappAPI.getPhoneNumbers(workspaceId);
            setPhoneNumbers(response.data.phoneNumbers);
        } catch (error) {
            console.error('Error loading WhatsApp numbers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async (id) => {
        if (!confirm('Bu numarayı kaldırmak istediğinizden emin misiniz?')) return;
        try {
            await whatsappAPI.disconnect(id);
            loadPhoneNumbers();
        } catch (error) {
            console.error('Error disconnecting number:', error);
            alert('Bağlantı kesilemedi.');
        }
    };

    const handleAssignBot = async (id, botId) => {
        try {
            await onAssignBot('whatsapp', id, botId);
            loadPhoneNumbers();
        } catch (error) {
            console.error('Error assigning bot to WhatsApp:', error);
        }
    };

    // WhatsApp Embedded Signup - uses FB SDK loaded in index.html
    const handleEmbeddedSignup = () => {
        setConnecting(true);

        const configId = import.meta.env.VITE_WHATSAPP_CONFIG_ID;
        console.log('📱 [WhatsApp] Starting Embedded Signup, config_id:', configId);

        // Check if FB SDK is loaded (from index.html)
        if (!window.FB) {
            alert('Facebook SDK yüklenemedi. Sayfayı yenileyip tekrar deneyin.');
            setConnecting(false);
            return;
        }

        console.log('📱 [WhatsApp] Calling FB.login with Embedded Signup...');

        window.FB.login(function (response) {
            console.log('📱 [WhatsApp] FB.login response:', response);

            if (response.authResponse) {
                const code = response.authResponse.code;
                console.log('📱 [WhatsApp] Got auth code, calling backend...');

                whatsappAPI.embeddedSignup({
                    code: code,
                    wabaId: 'from_embedded',
                    phoneNumberId: 'from_embedded',
                    phoneNumber: '',
                    workspaceId: workspaceId
                }).then(result => {
                    console.log('📱 [WhatsApp] Success:', result.data);
                    alert('WhatsApp başarıyla bağlandı!');
                    loadPhoneNumbers();
                }).catch(error => {
                    console.error('📱 [WhatsApp] Error:', error);
                    alert('Bağlantı başarısız: ' + (error.response?.data?.error || error.message));
                }).finally(() => setConnecting(false));
            } else {
                console.log('📱 [WhatsApp] User cancelled');
                setConnecting(false);
            }
        }, {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
                featureType: 'only_waba_sharing',
                sessionInfoVersion: 2
            }
        });
    };

    const handleOAuthConnect = () => {
        const apiUrl = import.meta.env.VITE_API_URL.replace('/api', '');
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        // Clear any previous OAuth result
        localStorage.removeItem('oauth_result');

        // Handler for postMessage (if popup can communicate directly)
        const handleMessage = async (event) => {
            if (event.data?.type === 'FACEBOOK_AUTH_SUCCESS' && event.data?.channelType === 'whatsapp') {
                console.log('📱 [WhatsApp] OAuth success via postMessage');
                cleanup();
                processOAuthSuccess(event.data);
            } else if (event.data?.type === 'FACEBOOK_AUTH_ERROR') {
                console.error('📱 [WhatsApp] OAuth failed');
                cleanup();
                alert('Facebook bağlantısı başarısız. Lütfen tekrar deneyin.');
            }
        };

        // Handler for localStorage (fallback when popup loses opener reference)
        const handleStorageChange = (event) => {
            if (event.key === 'oauth_result' && event.newValue) {
                try {
                    const result = JSON.parse(event.newValue);
                    if (result.type === 'FACEBOOK_AUTH_SUCCESS' && result.channelType === 'whatsapp') {
                        console.log('📱 [WhatsApp] OAuth success via localStorage');
                        cleanup();
                        processOAuthSuccess(result);
                    }
                } catch (e) {
                    console.error('📱 [WhatsApp] Error parsing OAuth result:', e);
                }
            }
        };

        // Process successful OAuth
        const processOAuthSuccess = (data) => {
            // Update token if provided
            if (data.token) {
                localStorage.setItem('token', data.token);
                console.log('📱 [WhatsApp] Token updated');
            }
            // Clear OAuth result from localStorage
            localStorage.removeItem('oauth_result');
            // Fetch WhatsApp numbers
            setConnecting(true);
            setTimeout(() => {
                fetchCandidates();
            }, 300);
        };

        // Cleanup listeners
        const cleanup = () => {
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(pollInterval);
        };

        // Poll localStorage for OAuth result (backup for storage event)
        const pollInterval = setInterval(() => {
            const result = localStorage.getItem('oauth_result');
            if (result) {
                try {
                    const data = JSON.parse(result);
                    if (data.type === 'FACEBOOK_AUTH_SUCCESS' && data.channelType === 'whatsapp') {
                        console.log('📱 [WhatsApp] OAuth success via polling');
                        cleanup();
                        processOAuthSuccess(data);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }, 500);

        // Add listeners
        window.addEventListener('message', handleMessage);
        window.addEventListener('storage', handleStorageChange);

        // Auto-cleanup after 5 minutes
        setTimeout(() => cleanup(), 5 * 60 * 1000);

        // Build OAuth URL with channelType=whatsapp
        const token = localStorage.getItem('token');
        const stateObj = { token, workspaceId, channelType: 'whatsapp' };
        const state = encodeURIComponent(JSON.stringify(stateObj));

        console.log('📱 [WhatsApp] Opening OAuth popup for workspace:', workspaceId);

        window.open(
            `${apiUrl}/api/auth/facebook?state=${state}`,
            'WhatsApp OAuth',
            `width=${width},height=${height},left=${left},top=${top}`
        );
    };

    const fetchCandidates = async () => {
        try {
            setConnecting(true);
            console.log('📱 [WhatsApp] Fetching available phone numbers...');

            const response = await whatsappAPI.listCandidates({});
            console.log('📱 [WhatsApp] API Response:', response.data);

            const numbers = response.data.availableNumbers || [];

            if (numbers.length === 0) {
                const errorMsg = response.data.error || '';
                console.log('📱 [WhatsApp] No numbers found, error:', errorMsg);
                if (errorMsg) {
                    alert(`WhatsApp hesapları listelenemedi: ${errorMsg}`);
                } else {
                    alert('WhatsApp Business hesabı bulunamadı. Meta Business Suite\'te WhatsApp Business hesabınızın olduğundan ve izinlerin verildiğinden emin olun.');
                }
                return;
            }

            console.log(`📱 [WhatsApp] Found ${numbers.length} phone numbers`);
            setCandidates(numbers);
            setShowCandidatesModal(true);
        } catch (error) {
            console.error('📱 [WhatsApp] Error fetching candidates:', error);
            const errorMsg = error.response?.data?.error || 'Bilinmeyen hata';
            alert(`WhatsApp hesapları listelenemedi: ${errorMsg}`);
        } finally {
            setConnecting(false);
        }
    };

    const connectNumber = async (candidate) => {
        try {
            setConnecting(true);
            await whatsappAPI.connect({
                phoneNumberId: candidate.id,
                wabaId: candidate.waba_id,
                name: candidate.waba_name,
                displayPhoneNumber: candidate.display_phone_number,
                accessToken: "backend_will_handle",
                workspaceId
            });

            // Clear candidates and close modal
            setCandidates([]);
            setShowCandidatesModal(false);

            // Reload the connected numbers
            await loadPhoneNumbers();

            // Show success message
            alert('WhatsApp numarası başarıyla bağlandı! 🎉');

            // Close parent modal if callback provided
            if (onClose) {
                onClose();
            }
        } catch (error) {
            console.error('Error connecting number:', error);
            alert('Bağlantı sağlanamadı: ' + (error.response?.data?.error || error.message));
        } finally {
            setConnecting(false);
        }
    };

    return (
        <div className="channels-section" style={{ position: 'relative' }}>
            {/* Inline keyframes for spinner animation */}
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
            <div className="section-header">
                <div>
                    <h2>WhatsApp Business</h2>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleEmbeddedSignup}
                    disabled={connecting}
                >
                    <Plus size={16} />
                    {connecting ? 'WhatsApp Bağlanıyor...' : 'Yeni Numara Bağla'}
                </button>
            </div>

            {/* Loading overlay when fetching candidates after OAuth */}
            {connecting && !showCandidatesModal && (
                <div className="oauth-loading-overlay" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    borderRadius: '8px'
                }}>
                    <div className="spinner" style={{
                        width: '40px',
                        height: '40px',
                        border: '4px solid #f3f3f3',
                        borderTop: '4px solid #25D366',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }}></div>
                    <p style={{ marginTop: '16px', color: '#666', fontWeight: 500 }}>
                        WhatsApp Business numaralarınız yükleniyor...
                    </p>
                </div>
            )}

            {loading ? (
                <div className="loading">Yükleniyor...</div>
            ) : phoneNumbers.length === 0 ? (
                <div className="empty-state">
                    <MessageCircle size={48} />
                    <h3>Henüz bağlı WhatsApp numarası yok</h3>
                    <p className="text-muted mb-md">WhatsApp Business numaralarınızı bağlayarak mesajları buradan yönetin.</p>
                </div>
            ) : (
                <div className="pages-grid">
                    {phoneNumbers.map((phone) => (
                        <div key={phone.id} className="page-card">
                            <div className="page-header">
                                <div className="page-icon" style={{ backgroundColor: '#f0fff4', color: '#25D366' }}>
                                    <Phone size={28} />
                                </div>
                                <button
                                    onClick={() => handleDisconnect(phone.id)}
                                    className="btn-icon"
                                    title="Bağlantıyı Kes"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            <h3>{phone.displayPhoneNumber}</h3>
                            <div className="page-stats">
                                <div className="stat-item">
                                    {phone.name}
                                </div>
                                <div className="stat-item" style={{ color: '#25D366', fontWeight: 600 }}>
                                    Aktif
                                </div>
                            </div>

                            <div className="bot-assignment-area">
                                <label>Otomatik Yanıt Botu</label>
                                <select
                                    className="form-select"
                                    value={phone.assignedBotId || ''}
                                    onChange={(e) => handleAssignBot(phone.id, e.target.value)}
                                    disabled={assigningBot === phone.id}
                                >
                                    <option value="">Bot Atanmamış (Manuel)</option>
                                    {(aiBots || []).map(bot => (
                                        <option key={bot.id} value={bot.id}>{bot.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showCandidatesModal && (
                <div className="wa-modal-overlay" onClick={() => setShowCandidatesModal(false)}>
                    <div className="wa-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="wa-modal-header">
                            <div className="wa-modal-icon">
                                <Phone size={24} />
                            </div>
                            <div>
                                <h3>Bağlanacak Numarayı Seçin</h3>
                                <p>Hesabınızda bulunan WhatsApp Business numaraları</p>
                            </div>
                        </div>

                        <div className="wa-modal-body">
                            {candidates.length === 0 ? (
                                <div className="wa-empty-state">
                                    <MessageCircle size={40} />
                                    <p>Numara bulunamadı veya yetki yok.</p>
                                </div>
                            ) : (
                                <div className="wa-candidates-list">
                                    {candidates.map(cand => (
                                        <div
                                            key={cand.id}
                                            className="wa-candidate-item"
                                            onClick={() => connectNumber(cand)}
                                        >
                                            <div className="wa-candidate-icon">
                                                <Phone size={20} />
                                            </div>
                                            <div className="wa-candidate-info">
                                                <span className="wa-phone-number">{cand.display_phone_number}</span>
                                                <span className="wa-business-name">{cand.waba_name} • {cand.business_name}</span>
                                            </div>
                                            <button className="wa-select-btn">
                                                Bağla
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="wa-modal-footer">
                            <button className="wa-cancel-btn" onClick={() => setShowCandidatesModal(false)}>
                                İptal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppSettings;
