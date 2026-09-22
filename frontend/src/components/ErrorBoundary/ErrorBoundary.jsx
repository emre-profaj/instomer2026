import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('🚨 [ErrorBoundary] Unhandled UI error caught:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        if (this.props.onReset) {
            this.props.onReset();
        } else {
            window.location.reload();
        }
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '280px',
                    padding: '24px',
                    margin: '16px auto',
                    maxWidth: '520px',
                    background: '#ffffff',
                    border: '1px solid #fee2e2',
                    borderRadius: '16px',
                    boxShadow: '0 10px 25px -5px rgba(239, 68, 68, 0.08)',
                    textAlign: 'center',
                    fontFamily: 'inherit'
                }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: '#fef2f2',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '16px'
                    }}>
                        <AlertTriangle size={28} />
                    </div>

                    <h3 style={{
                        margin: '0 0 8px',
                        fontSize: '1.15rem',
                        fontWeight: 700,
                        color: '#1e293b'
                    }}>
                        {this.props.title || 'Bir görünüm hatası oluştu'}
                    </h3>

                    <p style={{
                        margin: '0 0 20px',
                        fontSize: '0.85rem',
                        color: '#64748b',
                        lineHeight: 1.5
                    }}>
                        {this.props.message || 'Bu bileşen yüklenirken beklenmeyen bir hata meydana geldi. Sayfayı yenileyebilir veya tekrar deneyebilirsiniz.'}
                    </p>

                    {this.state.error?.message && (
                        <div style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            color: '#dc2626',
                            fontFamily: 'monospace',
                            textAlign: 'left',
                            marginBottom: '20px',
                            overflowX: 'auto',
                            maxHeight: '80px'
                        }}>
                            {this.state.error.message}
                        </div>
                    )}

                    {/* Hatanın hangi bileşende olduğu yalnızca konsolda kalıyordu;
                        kullanıcıdan konsol açmasını istemek gerekiyordu. Artık
                        ekrandan okunabiliyor ve kopyalanabiliyor. */}
                    {this.state.errorInfo?.componentStack && (
                        <details style={{ width: '100%', textAlign: 'left', marginBottom: '20px' }}>
                            <summary style={{
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#64748b',
                                marginBottom: '8px'
                            }}>
                                Teknik ayrıntı (destek için kopyalayın)
                            </summary>
                            <pre style={{
                                margin: 0,
                                padding: '10px 14px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '0.68rem',
                                color: '#475569',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: '220px',
                                overflowY: 'auto'
                            }}>
                                {this.state.errorInfo.componentStack.trim()}
                            </pre>
                        </details>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={this.handleReset}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '9px 18px',
                                borderRadius: '10px',
                                border: 'none',
                                background: '#3b82f6',
                                color: '#ffffff',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'background 0.2s ease'
                            }}
                        >
                            <RefreshCw size={15} /> Yeniden Dene
                        </button>
                        <button
                            type="button"
                            onClick={() => window.location.href = '/'}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '9px 18px',
                                borderRadius: '10px',
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                color: '#475569',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            <Home size={15} /> Ana Sayfa
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
