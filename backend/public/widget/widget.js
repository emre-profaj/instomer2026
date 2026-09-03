(function () {
    // 1. Configuration Check
    const config = window.AntigravityConfig;

    // Accept either widgetId or workspaceId for backward compatibility
    if (!config || (!config.widgetId && !config.workspaceId)) {
        console.error('Antigravity Widget Error: Missing widgetId or workspaceId in window.AntigravityConfig');
        return;
    }

    const widgetId = config.widgetId;
    let workspaceId = config.workspaceId; // May be set later from API
    let baseUrl = config.baseUrl || '';

    // Normalize baseUrl (strip trailing slash)
    if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
    }

    const apiBaseUrl = `${baseUrl}/api/ai/public`;

    console.log('Antigravity Widget: Initializing', widgetId ? `widget ${widgetId}` : `workspace ${workspaceId}`);

    // 2. Identify Visitor
    let visitorId = localStorage.getItem('antigravity_visitor_id');
    if (!visitorId) {
        visitorId = 'v_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('antigravity_visitor_id', visitorId);
    }

    // 3. Load Settings & Initialize
    const settingsUrl = widgetId
        ? `${apiBaseUrl}/widget/${widgetId}`
        : `${apiBaseUrl}/${workspaceId}/widget`;

    fetch(settingsUrl)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (widgetId && data.workspaceId) {
                workspaceId = data.workspaceId;
            }

            if (data.settings && data.settings.isActive) {
                console.log('Antigravity Widget: Settings loaded, starting UI');
                initWidget(data.settings);
            } else {
                console.warn('Antigravity Widget: Widget is disabled for this workspace');
            }
        })
        .catch(err => {
            console.error('Antigravity Widget: Failed to load settings from', settingsUrl, err);
        });

    function initWidget(settings) {
        // Create container and attach Shadow DOM
        const container = document.createElement('div');
        container.id = 'ag-widget-root';
        document.body.appendChild(container);

        // Attach Shadow DOM for complete CSS isolation
        const shadow = container.attachShadow({ mode: 'open' });

        const isLeft = settings.position === 'LEFT';
        const widgetWidth = settings.width || 350;

        // Create style element inside Shadow DOM
        const style = document.createElement('style');
        style.textContent = `
            /* Reset all styles to prevent inheritance */
            :host {
                all: initial;
                display: block;
            }
            
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            #ag-widget-container {
                position: fixed;
                bottom: 20px;
                ${isLeft ? 'left: 20px;' : 'right: 20px;'}
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            #ag-fab-wrapper {
                position: relative;
                display: inline-flex;
                ${isLeft ? 'margin-right: auto;' : 'margin-left: auto;'}
            }
            
            #ag-fab {
                position: relative;
                z-index: 1;
                background: #ffffff;
                border-radius: 9999px;
                padding: 6px 18px 6px 7px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                border: 1px solid rgba(0, 0, 0, 0.06);
                transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.25s ease;
                user-select: none;
            }
            
            #ag-fab:hover {
                transform: translateY(-2px) scale(1.02);
                box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16), 0 3px 10px rgba(0, 0, 0, 0.08);
            }
            
            #ag-fab:active {
                transform: translateY(0) scale(0.98);
            }

            .ag-fab-icon-box {
                width: 38px;
                height: 38px;
                min-width: 38px;
                border-radius: 50%;
                background: #111827;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            
            .ag-fab-icon-box svg {
                width: 22px;
                height: 22px;
                fill: #ffffff;
            }
            
            .ag-fab-text {
                display: flex;
                flex-direction: column;
                justify-content: center;
                gap: 2px;
                text-align: left;
            }
            
            .ag-fab-title {
                font-size: 13.5px;
                font-weight: 700;
                color: #0f172a;
                line-height: 1.2;
                letter-spacing: -0.01em;
            }
            
            .ag-fab-subtitle {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11.5px;
                font-weight: 500;
                color: #64748b;
                line-height: 1.2;
            }
            
            .ag-fab-status-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #10b981;
                display: inline-block;
                flex-shrink: 0;
                box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
            }
            
            #ag-chat-window {
                position: absolute;
                bottom: 68px;
                ${isLeft ? 'left: 0;' : 'right: 0;'}
                width: ${widgetWidth || 380}px;
                max-width: calc(100vw - 32px);
                height: 560px;
                max-height: calc(100vh - 100px);
                background: #ffffff;
                border-radius: 24px;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08);
                display: none;
                flex-direction: column;
                overflow: hidden;
            }
            #ag-chat-window.open { display: flex; }
            
            .ag-header {
                background-color: #0f172a;
                padding: 16px 18px;
                color: #ffffff;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                flex-shrink: 0;
            }
            
            .ag-header-left {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
            }
            
            .ag-header-avatar {
                width: 40px;
                height: 40px;
                min-width: 40px;
                border-radius: 50%;
                background: #1e293b;
                border: 1px solid rgba(255, 255, 255, 0.15);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            
            .ag-header-avatar svg {
                width: 22px;
                height: 22px;
                fill: #38bdf8;
            }
            
            .ag-header-info {
                display: flex;
                flex-direction: column;
                min-width: 0;
            }
            
            .ag-header-title {
                font-size: 14.5px;
                font-weight: 700;
                color: #ffffff;
                line-height: 1.25;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .ag-header-subtitle {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11.5px;
                color: #94a3b8;
                margin-top: 2px;
                line-height: 1.2;
            }
            
            .ag-status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #10b981;
                display: inline-block;
                flex-shrink: 0;
            }
            
            .ag-minimize-btn {
                width: 34px;
                height: 34px;
                min-width: 34px;
                border: none;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.12);
                color: #ffffff;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s, transform 0.15s;
                padding: 0;
                flex-shrink: 0;
            }
            .ag-minimize-btn:hover { background: rgba(255, 255, 255, 0.22); }
            .ag-minimize-btn:active { transform: scale(0.92); }
            .ag-minimize-btn svg { width: 16px; height: 16px; stroke: #ffffff; }
            
            .ag-messages {
                flex: 1;
                overflow-y: auto;
                padding: 18px 16px;
                background: #ffffff;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .ag-message {
                padding: 12px 16px;
                border-radius: 16px;
                max-width: 88%;
                word-wrap: break-word;
                line-height: 1.5;
                font-size: 13.5px;
            }
            .ag-message.bot {
                background: #ffffff;
                color: #1e293b;
                align-self: flex-start;
                border: 1px solid #e2e8f0;
                border-radius: 16px 16px 16px 4px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
            }
            .ag-message.user {
                background: #0f172a;
                color: #ffffff;
                margin-left: auto;
                align-self: flex-end;
                border-radius: 16px 16px 4px 16px;
            }
            
            .ag-typing {
                display: none;
                padding: 0 18px 8px;
                font-size: 12px;
                color: #94a3b8;
                font-style: italic;
            }
            
            .ag-input-area {
                padding: 10px 16px 12px;
                border-top: 1px solid #f1f5f9;
                background: #ffffff;
                display: flex;
                flex-direction: column;
                gap: 6px;
                flex-shrink: 0;
            }
            
            .ag-quick-replies {
                display: flex;
                flex-wrap: nowrap;
                overflow-x: auto;
                gap: 8px;
                padding: 2px 2px 6px 2px;
                -ms-overflow-style: none;
                scrollbar-width: none;
            }
            .ag-quick-replies::-webkit-scrollbar {
                display: none;
            }
            
            .ag-quick-reply-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: #f1f5f9;
                border: 1px solid #e2e8f0;
                border-radius: 9999px;
                padding: 5px 13px;
                font-size: 12px;
                font-weight: 500;
                color: #1e293b;
                cursor: pointer;
                white-space: nowrap;
                flex-shrink: 0;
                transition: all 0.2s ease;
                user-select: none;
            }
            .ag-quick-reply-pill:hover {
                background: #ffffff;
                border-color: #cbd5e1;
                color: #0f172a;
                transform: translateY(-1px);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
            }
            .ag-quick-reply-pill:active {
                transform: translateY(0);
            }
            
            .ag-input-pill {
                display: flex;
                align-items: center;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 9999px;
                padding: 4px 5px 4px 16px;
                gap: 8px;
                transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
            }
            .ag-input-pill:focus-within {
                border-color: #0f172a;
                background: #ffffff;
                box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
            }
            
            .ag-input {
                flex: 1;
                border: none;
                background: transparent;
                outline: none;
                font-size: 13.5px;
                color: #0f172a;
                font-family: inherit;
                min-width: 0;
                padding: 6px 0;
            }
            .ag-input::placeholder {
                color: #94a3b8;
            }
            
            .ag-send-btn {
                width: 34px;
                height: 34px;
                min-width: 34px;
                background-color: #0f172a;
                color: white;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                padding: 0;
                flex-shrink: 0;
            }
            .ag-send-btn:hover {
                background-color: #1e293b;
                transform: scale(1.05);
            }
            .ag-send-btn:active { transform: scale(0.95); }
            .ag-send-btn svg { width: 15px; height: 15px; fill: white; }
            
            .ag-footer {
                text-align: center;
                font-size: 11px;
                color: #94a3b8;
                padding: 2px 0 0;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
            }
            .ag-footer svg {
                width: 12px;
                height: 12px;
                fill: #f59e0b;
            }
            
            /* Pre-Chat Form Styles */
            .ag-prechat-form {
                padding: 24px 20px;
                background: #ffffff;
                flex: 1;
                overflow-y: auto;
            }
            .ag-form-title {
                font-size: 16px;
                font-weight: 700;
                color: #0f172a;
                margin-bottom: 4px;
            }
            .ag-form-subtitle {
                font-size: 13px;
                color: #64748b;
                margin-bottom: 20px;
            }
            .ag-form-group {
                margin-bottom: 16px;
            }
            .ag-form-label {
                display: block;
                font-size: 13px;
                font-weight: 600;
                color: #334155;
                margin-bottom: 6px;
            }
            .ag-form-label .required {
                color: #ef4444;
                margin-left: 2px;
            }
            .ag-form-input {
                width: 100%;
                padding: 10px 14px;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                font-size: 13.5px;
                background: #f8fafc;
                outline: none;
                font-family: inherit;
                transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
            }
            .ag-form-input:focus {
                border-color: #0f172a;
                background: #ffffff;
                box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
            }
            .ag-form-input.error {
                border-color: #ef4444;
            }
            .ag-form-input::placeholder {
                color: #94a3b8;
            }
            .ag-form-select {
                width: 100%;
                padding: 10px 14px;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                font-size: 13.5px;
                background: #f8fafc;
                outline: none;
                font-family: inherit;
                cursor: pointer;
                transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
            }
            .ag-form-select:focus {
                border-color: #0f172a;
                background: #ffffff;
                box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
            }
            .ag-form-error {
                font-size: 12px;
                color: #ef4444;
                margin-top: 4px;
                display: none;
            }
            .ag-form-error.show {
                display: block;
            }
            .ag-form-submit {
                width: 100%;
                padding: 13px;
                background-color: #0f172a;
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 14.5px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s;
                font-family: inherit;
                margin-top: 8px;
            }
            .ag-form-submit:hover {
                background-color: #1e293b;
            }
            .ag-form-submit:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            
            /* Hide chat area when form is shown */
            .ag-chat-content {
                display: flex;
                flex-direction: column;
                flex: 1;
                overflow: hidden;
            }
            .ag-chat-content.hidden {
                display: none;
            }
        `;

        // Check if form was already submitted (visitor returning) OR form is disabled
        const formSubmittedKey = `antigravity_form_submitted_${workspaceId}`;
        const prechatFormEnabled = settings.prechatFormEnabled !== undefined ? settings.prechatFormEnabled : true;
        let formAlreadySubmitted = localStorage.getItem(formSubmittedKey) === 'true' || !prechatFormEnabled;

        // Create widget HTML
        const widgetHTML = `
            <div id="ag-widget-container">
                <div id="ag-chat-window">
                    <div class="ag-header">
                        <div class="ag-header-left">
                            <div class="ag-header-avatar">
                                <svg id="fi_17938466" enable-background="new 0 0 96 96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
                                    <path d="m94 56c0-4.8310547-2.8756104-8.9938965-7-10.8946533v-1.1053467c0-21.5048828-17.4951172-39-39-39s-39 17.4951172-39 39v1.1053467c-4.1243896 1.9007568-7 6.0635986-7 10.8946533 0 6.6166992 5.3828125 12 12 12h4c1.1044922 0 2-.8955078 2-2v-20c0-1.1044922-.8955078-2-2-2h-4c-.3375244 0-.6694336.0231934-1 .0506592v-.0506592c0-19.2988281 15.7011719-35 35-35s35 15.7011719 35 35v.0506592c-.3305664-.0274658-.6624756-.0506592-1-.0506592h-4c-1.1044922 0-2 .8955078-2 2v20c0 1.1044922.8955078 2 2 2h4c.3375244 0 .6694336-.0231934 1-.0506592v3.0506592c0 6.6166992-5.3828125 12-12 12h-15c0-2.2055664-1.7939453-4-4-4h-10c-2.2060547 0-4 1.7944336-4 4v4c0 2.2055664 1.7939453 4 4 4h10c2.2060547 0 4-1.7944336 4-4h15c8.8222656 0 16-7.1777344 16-16v-4.1053467c4.1243896-1.9007568 7-6.0635986 7-10.8946533zm-78-8v16h-2c-4.4111328 0-8-3.5888672-8-8s3.5888672-8 8-8zm26 39v-4h10l.0014648 1.9855957c-.000061.0049439-.0014648.0094605-.0014648.0144043 0 .0050049.0014038.0096436.0014648.0146484l.0014649 1.9853516zm40-23h-2v-16h2c4.4111328 0 8 3.5888672 8 8s-3.5888672 8-8 8zm-34 5c12.1308594 0 22-9.8691406 22-22s-9.8691406-22-22-22-22 9.8691406-22 22c0 3.9248047 1.0517578 7.7607422 3.0498047 11.1459961l-2.0136719 10.4765625c-.1396484.7275391.1337891 1.4726563.7119141 1.9370117.3613281.2900391.8046875.4404297 1.2519531.4404297.2685547 0 .5380859-.0537109.7929688-.1635742l8.9794922-3.8759766c2.9111328 1.3540039 6.0107421 2.0395508 9.227539 2.0395508zm-16.3222656-3.3339844 1.4462891-7.527832c.0966797-.503418-.0029297-1.0244141-.2792969-1.4560547-1.8613282-2.9052734-2.8447266-6.253418-2.8447266-9.6821289 0-9.925293 8.0751953-18 18-18s18 8.074707 18 18-8.0751953 18-18 18c-2.8916016 0-5.6689453-.6787109-8.2548828-2.0170898-.5322266-.2758789-1.1611328-.2988281-1.7119141-.0600586zm16.3222656-12.6660156h-10c-1.1044922 0-2-.8955078-2-2s.8955078-2 2-2h10c1.1044922 0 2 .8955078 2 2s-.8955078 2-2 2zm-12-10c0-1.1044922.8955078-2 2-2h20c1.1044922 0 2 .8955078 2 2s-.8955078 2-2 2h-20c-1.1044922 0-2-.8955078-2-2z"/>
                                </svg>
                            </div>
                            <div class="ag-header-info">
                                <div class="ag-header-title">Instomer Akıllı Danışman</div>
                                <div class="ag-header-subtitle">
                                    <span class="ag-status-dot"></span>
                                    <span>${settings.subtitle || 'Online Canlı Destek'}</span>
                                </div>
                            </div>
                        </div>
                        <button class="ag-minimize-btn" id="ag-minimize" title="Kapat">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    
                    <!-- Pre-Chat Form -->
                    <div id="ag-prechat-form" class="ag-prechat-form" ${formAlreadySubmitted ? 'style="display:none;"' : ''}>
                        <div class="ag-form-title">Sohbete Başlamadan Önce</div>
                        <div class="ag-form-subtitle">Lütfen bilgilerinizi girin</div>
                        
                        <div class="ag-form-group">
                            <label class="ag-form-label">
                                İsim Soyisim <span class="required">*</span>
                            </label>
                            <input type="text" class="ag-form-input" id="ag-form-name" placeholder="Adınız ve soyadınız">
                            <div class="ag-form-error" id="ag-error-name">Bu alan zorunludur</div>
                        </div>
                        
                        <div class="ag-form-group">
                            <label class="ag-form-label">
                                Telefon <span class="required">*</span>
                            </label>
                            <input type="tel" class="ag-form-input" id="ag-form-phone" placeholder="05XX XXX XX XX">
                            <div class="ag-form-error" id="ag-error-phone">Geçerli bir telefon numarası girin</div>
                        </div>
                        
                        <div class="ag-form-group">
                            <label class="ag-form-label">Konu</label>
                            <select class="ag-form-select" id="ag-form-subject">
                                <option value="">Seçiniz...</option>
                                <option value="Genel Soru">Genel Soru</option>
                                <option value="Satış">Satış</option>
                                <option value="Teknik Destek">Teknik Destek</option>
                                <option value="Şikayet">Şikayet</option>
                                <option value="Diğer">Diğer</option>
                            </select>
                        </div>
                        
                        <button class="ag-form-submit" id="ag-form-submit">Sohbete Başla</button>
                    </div>
                    
                    <!-- Chat Content (hidden until form submitted) -->
                    <div id="ag-chat-content" class="ag-chat-content ${formAlreadySubmitted ? '' : 'hidden'}">
                        <div class="ag-messages" id="ag-messages">
                            <div class="ag-message bot">${settings.greetingMessage || 'Merhaba! Size nasıl yardımcı olabilirim?'}</div>
                        </div>
                        <div id="ag-typing" class="ag-typing">Asistan yazıyor...</div>
                        <div class="ag-input-area">
                            <div id="ag-quick-replies" class="ag-quick-replies"></div>
                            <div class="ag-input-pill">
                                <input type="text" class="ag-input" id="ag-input" placeholder="Mesajınızı yazın...">
                                <button class="ag-send-btn" id="ag-send" title="Gönder">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="ag-footer">
                                <svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.2L12 16.6l-6.3 4.6 2.3-7.2-6-4.6h7.6z"/></svg>
                                <span>Instomer Akıllı Asistan</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="ag-fab-wrapper">
                    <div id="ag-fab" role="button" aria-label="Dijital Asistan">
                        <div class="ag-fab-icon-box">
                            <svg id="fi_17938466" enable-background="new 0 0 96 96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
                                <path d="m94 56c0-4.8310547-2.8756104-8.9938965-7-10.8946533v-1.1053467c0-21.5048828-17.4951172-39-39-39s-39 17.4951172-39 39v1.1053467c-4.1243896 1.9007568-7 6.0635986-7 10.8946533 0 6.6166992 5.3828125 12 12 12h4c1.1044922 0 2-.8955078 2-2v-20c0-1.1044922-.8955078-2-2-2h-4c-.3375244 0-.6694336.0231934-1 .0506592v-.0506592c0-19.2988281 15.7011719-35 35-35s35 15.7011719 35 35v.0506592c-.3305664-.0274658-.6624756-.0506592-1-.0506592h-4c-1.1044922 0-2 .8955078-2 2v20c0 1.1044922.8955078 2 2 2h4c.3375244 0 .6694336-.0231934 1-.0506592v3.0506592c0 6.6166992-5.3828125 12-12 12h-15c0-2.2055664-1.7939453-4-4-4h-10c-2.2060547 0-4 1.7944336-4 4v4c0 2.2055664 1.7939453 4 4 4h10c2.2060547 0 4-1.7944336 4-4h15c8.8222656 0 16-7.1777344 16-16v-4.1053467c4.1243896-1.9007568 7-6.0635986 7-10.8946533zm-78-8v16h-2c-4.4111328 0-8-3.5888672-8-8s3.5888672-8 8-8zm26 39v-4h10l.0014648 1.9855957c-.000061.0049439-.0014648.0094605-.0014648.0144043 0 .0050049.0014038.0096436.0014648.0146484l.0014649 1.9853516zm40-23h-2v-16h2c4.4111328 0 8 3.5888672 8 8s-3.5888672 8-8 8zm-34 5c12.1308594 0 22-9.8691406 22-22s-9.8691406-22-22-22-22 9.8691406-22 22c0 3.9248047 1.0517578 7.7607422 3.0498047 11.1459961l-2.0136719 10.4765625c-.1396484.7275391.1337891 1.4726563.7119141 1.9370117.3613281.2900391.8046875.4404297 1.2519531.4404297.2685547 0 .5380859-.0537109.7929688-.1635742l8.9794922-3.8759766c2.9111328 1.3540039 6.0107421 2.0395508 9.227539 2.0395508zm-16.3222656-3.3339844 1.4462891-7.527832c.0966797-.503418-.0029297-1.0244141-.2792969-1.4560547-1.8613282-2.9052734-2.8447266-6.253418-2.8447266-9.6821289 0-9.925293 8.0751953-18 18-18s18 8.074707 18 18-8.0751953 18-18 18c-2.8916016 0-5.6689453-.6787109-8.2548828-2.0170898-.5322266-.2758789-1.1611328-.2988281-1.7119141-.0600586zm16.3222656-12.6660156h-10c-1.1044922 0-2-.8955078-2-2s.8955078-2 2-2h10c1.1044922 0 2 .8955078 2 2s-.8955078 2-2 2zm-12-10c0-1.1044922.8955078-2 2-2h20c1.1044922 0 2 .8955078 2 2s-.8955078 2-2 2h-20c-1.1044922 0-2-.8955078-2-2z"/>
                            </svg>
                        </div>
                        <div class="ag-fab-text">
                            <div class="ag-fab-title">Dijital Asistan</div>
                            <div class="ag-fab-subtitle">
                                <span class="ag-fab-status-dot"></span>
                                <span>Online Canlı Destek</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Append style and HTML to Shadow DOM
        shadow.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = widgetHTML;
        shadow.appendChild(wrapper);

        // Get elements from Shadow DOM
        const fab = shadow.getElementById('ag-fab');
        const chatWindow = shadow.getElementById('ag-chat-window');
        const input = shadow.getElementById('ag-input');
        const sendBtn = shadow.getElementById('ag-send');
        const messagesContainer = shadow.getElementById('ag-messages');
        const typingIndicator = shadow.getElementById('ag-typing');
        const minimizeBtn = shadow.getElementById('ag-minimize');
        const quickRepliesContainer = shadow.getElementById('ag-quick-replies');

        // Pre-chat form elements
        const prechatForm = shadow.getElementById('ag-prechat-form');
        const chatContent = shadow.getElementById('ag-chat-content');
        const formName = shadow.getElementById('ag-form-name');
        const formPhone = shadow.getElementById('ag-form-phone');
        const formSubject = shadow.getElementById('ag-form-subject');
        const formSubmitBtn = shadow.getElementById('ag-form-submit');
        const errorName = shadow.getElementById('ag-error-name');
        const errorPhone = shadow.getElementById('ag-error-phone');

        // Render quick reply suggestions
        let repliesList = [];
        if (Array.isArray(settings.quickReplies)) {
            repliesList = settings.quickReplies;
        } else if (typeof settings.quickReplies === 'string') {
            try { repliesList = JSON.parse(settings.quickReplies); } catch (e) { }
        }

        if (quickRepliesContainer && repliesList && repliesList.length > 0) {
            repliesList.forEach(reply => {
                const text = typeof reply === 'string' ? reply.trim() : (reply && reply.text ? reply.text.trim() : '');
                if (!text) return;
                const pill = document.createElement('div');
                pill.className = 'ag-quick-reply-pill';
                pill.textContent = text;
                pill.onclick = () => {
                    input.value = text;
                    sendMessage();
                };
                quickRepliesContainer.appendChild(pill);
            });
        } else if (quickRepliesContainer) {
            quickRepliesContainer.style.display = 'none';
        }

        fab.onclick = () => {
            chatWindow.classList.toggle('open');
        };

        minimizeBtn.onclick = () => {
            chatWindow.classList.remove('open');
        };

        // Form validation and submission
        function validatePhone(phone) {
            // Remove spaces, dashes, etc.
            const cleaned = phone.replace(/[\s\-\(\)]/g, '');
            // Turkish phone: 05XXXXXXXXX (11 digits) or +905XXXXXXXXX (13 chars)
            return /^(\+90|0)?5\d{9}$/.test(cleaned);
        }

        async function handleFormSubmit() {
            let isValid = true;

            // Validate name
            const name = formName.value.trim();
            if (!name) {
                formName.classList.add('error');
                errorName.classList.add('show');
                isValid = false;
            } else {
                formName.classList.remove('error');
                errorName.classList.remove('show');
            }

            // Validate phone
            const phone = formPhone.value.trim();
            if (!phone || !validatePhone(phone)) {
                formPhone.classList.add('error');
                errorPhone.classList.add('show');
                isValid = false;
            } else {
                formPhone.classList.remove('error');
                errorPhone.classList.remove('show');
            }

            if (!isValid) return;

            // Disable button and show loading
            formSubmitBtn.disabled = true;
            formSubmitBtn.textContent = 'Başlatılıyor...';

            try {
                // Send prechat data to backend
                const response = await fetch(`${apiBaseUrl}/prechat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workspaceId,
                        visitorId,
                        name: name,
                        phone: phone,
                        subject: formSubject.value || null
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    // Save to localStorage to prevent showing form again
                    localStorage.setItem(formSubmittedKey, 'true');

                    // Store visitor info for personalization
                    localStorage.setItem('antigravity_visitor_name', name);
                    localStorage.setItem('antigravity_visitor_phone', phone);

                    // Hide form, show chat
                    prechatForm.style.display = 'none';
                    chatContent.classList.remove('hidden');

                    // Focus on input
                    input.focus();
                } else {
                    throw new Error(data.error || 'Form gönderilemedi');
                }
            } catch (err) {
                console.error('Prechat form error:', err);
                formSubmitBtn.disabled = false;
                formSubmitBtn.textContent = 'Sohbete Başla';
                alert('Bir hata oluştu. Lütfen tekrar deneyin.');
            }
        }

        // Form submit button click
        formSubmitBtn.onclick = handleFormSubmit;

        // Allow Enter key in phone field to submit
        formPhone.onkeypress = (e) => {
            if (e.key === 'Enter') handleFormSubmit();
        };

        // Track conversation and polling state
        let currentConversationId = null;
        let lastPollTime = null; // Server time from last response
        let seenMessageIds = new Set();
        let pollInterval = null;
        let handoffShown = false;

        function addMessage(text, type, messageId) {
            // Prevent duplicate messages
            if (messageId && seenMessageIds.has(messageId)) return;
            if (messageId) seenMessageIds.add(messageId);

            const cleanText = (text || '').replace(/\[HANDOFF\]/gi, '').trim();
            if (!cleanText) return;

            const msg = document.createElement('div');
            msg.className = `ag-message ${type}`;
            msg.innerText = cleanText;
            messagesContainer.appendChild(msg);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Poll for new agent/bot messages
        async function pollMessages() {
            if (!currentConversationId) return;

            try {
                let url = `${apiBaseUrl}/messages/${currentConversationId}`;
                if (lastPollTime) {
                    url += `?since=${encodeURIComponent(lastPollTime)}`;
                }

                const response = await fetch(url);
                if (!response.ok) return;

                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    for (const msg of data.messages) {
                        if (!seenMessageIds.has(msg.id)) {
                            addMessage(msg.content, 'bot', msg.id);
                            // Use the message's server-side createdAt as the new poll anchor
                            lastPollTime = msg.createdAt;
                        }
                    }
                }
            } catch (err) {
                // Silent fail — polling errors shouldn't break the widget
            }
        }

        function startPolling() {
            if (pollInterval) return;
            pollInterval = setInterval(pollMessages, 3000);
        }

        async function sendMessage() {
            const text = input.value.trim();
            if (!text) return;

            input.value = '';
            addMessage(text, 'user', null);

            typingIndicator.style.display = 'block';
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            try {
                console.log('[Widget] Sending message to:', `${apiBaseUrl}/chat`);
                const response = await fetch(`${apiBaseUrl}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        widgetId,
                        workspaceId,
                        visitorId,
                        message: text
                    })
                });
                console.log('[Widget] Response status:', response.status);
                const data = await response.json();
                console.log('[Widget] Response data:', JSON.stringify(data).substring(0, 500));

                typingIndicator.style.display = 'none';

                // Store conversationId and start polling
                if (data.conversationId) {
                    if (!currentConversationId) {
                        currentConversationId = data.conversationId;
                        console.log('[Widget] Conversation ID set:', currentConversationId);
                    }
                    // Always use server's pollAnchor time — it's set BEFORE messages are created
                    // so polling will catch everything (bot replies + agent messages)
                    if (data.serverTime && !lastPollTime) {
                        lastPollTime = data.serverTime;
                    }
                    startPolling();
                    console.log('[Widget] Polling active for conversation:', currentConversationId);
                }

                if (data.reply) {
                    console.log('[Widget] Bot reply received, showing message');
                    // addMessage internally tracks the ID to prevent polling duplicates
                    addMessage(data.reply, 'bot', data.botMessageId || null);
                    // Do NOT update lastPollTime here — keep it at pollAnchor
                    // so polling still catches any messages we might have missed
                } else if (!handoffShown) {
                    console.log('[Widget] No reply, showing handoff message');
                    addMessage('Yazışmayı temsilcimiz devralıyor. Mesajınızı en kısa zamanda yanıtlayacağız. 🤝', 'bot', null);
                    handoffShown = true;
                } else {
                    console.log('[Widget] No reply, handoff already shown');
                }
            } catch (err) {
                console.error('[Widget] Send error:', err);
                typingIndicator.style.display = 'none';
                addMessage('Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.', 'bot', null);
            }
        }

        sendBtn.onclick = sendMessage;
        input.onkeypress = (e) => {
            if (e.key === 'Enter') sendMessage();
        };
    }
})();
