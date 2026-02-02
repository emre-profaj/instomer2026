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
                width: 60px;
                height: 60px;
                ${isLeft ? 'margin-right: auto;' : 'margin-left: auto;'}
            }
            
            /* Elegant rotating border */
            #ag-fab-wrapper::before {
                content: '';
                position: absolute;
                top: -4px;
                left: -4px;
                right: -4px;
                bottom: -4px;
                border-radius: 50%;
                background: linear-gradient(
                    90deg,
                    rgba(255, 23, 68, 0.9),
                    rgba(255, 82, 82, 0.6),
                    rgba(255, 107, 107, 0.3),
                    transparent,
                    transparent,
                    rgba(255, 107, 107, 0.3),
                    rgba(255, 82, 82, 0.6),
                    rgba(255, 23, 68, 0.9)
                );
                animation: rotate 4s linear infinite;
                opacity: 1;
            }
            
            /* Inner glow */
            #ag-fab-wrapper::after {
                content: '';
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                border-radius: 50%;
                background: radial-gradient(circle, transparent 60%, rgba(255, 23, 68, 0.15) 100%);
                animation: pulse 3s ease-in-out infinite;
                z-index: 0;
            }
            
            @keyframes rotate {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes gradientShift {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
            }
            
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 0.3; }
                50% { transform: scale(1.15); opacity: 0; }
            }
            
            #ag-fab {
                position: relative;
                z-index: 1;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background-color: ${settings.primaryColor};
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                border: none;
            }
            #ag-fab:hover { transform: scale(1.1); }
            #ag-fab svg { width: 28px; height: 28px; fill: white; }
            
            #ag-chat-window {
                position: absolute;
                bottom: 80px;
                ${isLeft ? 'left: 0;' : 'right: 0;'}
                width: ${widgetWidth}px;
                max-width: calc(100vw - 40px);
                height: 500px;
                background: white;
                border-radius: 16px;
                box-shadow: 0 12px 24px rgba(0,0,0,0.15);
                display: none;
                flex-direction: column;
                overflow: hidden;
            }
            #ag-chat-window.open { display: flex; }
            
            .ag-header {
                background-color: ${settings.primaryColor};
                padding: 20px;
                color: white;
                position: relative;
            }
            .ag-header-title {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 4px;
            }
            .ag-header-subtitle {
                font-size: 13px;
                opacity: 0.9;
            }
            
            .ag-minimize-btn {
                position: absolute;
                top: 12px;
                right: 12px;
                width: 28px;
                height: 28px;
                border: none;
                border-radius: 50%;
                background: rgba(255,255,255,0.2);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
                padding: 0;
            }
            .ag-minimize-btn:hover { background: rgba(255,255,255,0.3); }
            .ag-minimize-btn svg { width: 16px; height: 16px; fill: white; }
            
            .ag-messages {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                background: #f9fafb;
            }
            .ag-message {
                margin-bottom: 12px;
                padding: 10px 14px;
                border-radius: 12px;
                max-width: 80%;
                word-wrap: break-word;
                line-height: 1.4;
                font-size: 14px;
            }
            .ag-message.bot {
                background: white;
                color: #1f2937;
                align-self: flex-start;
                box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            }
            .ag-message.user {
                background: ${settings.primaryColor};
                color: white;
                margin-left: auto;
                align-self: flex-end;
            }
            
            .ag-typing {
                display: none;
                padding: 0 16px 8px;
                font-size: 13px;
                color: #6b7280;
                font-style: italic;
            }
            
            .ag-input-area {
                display: flex;
                padding: 12px;
                border-top: 1px solid #e5e7eb;
                background: white;
                gap: 8px;
            }
            .ag-input {
                flex: 1;
                padding: 10px 12px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font-size: 14px;
                outline: none;
                font-family: inherit;
            }
            .ag-input:focus {
                border-color: ${settings.primaryColor};
                box-shadow: 0 0 0 3px ${settings.primaryColor}20;
            }
            .ag-send-btn {
                padding: 10px 20px;
                background-color: ${settings.primaryColor};
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 500;
                font-size: 14px;
                transition: opacity 0.2s;
                font-family: inherit;
            }
            .ag-send-btn:hover { opacity: 0.9; }
            .ag-send-btn:active { transform: scale(0.98); }
            
            .ag-footer {
                padding: 8px 12px;
                text-align: center;
                font-size: 11px;
                color: #9ca3af;
                background: #f9fafb;
                border-top: 1px solid #e5e7eb;
            }
            .ag-footer a {
                color: #6b7280;
                text-decoration: none;
                font-weight: 500;
                transition: color 0.2s;
            }
            .ag-footer a:hover {
                color: ${settings.primaryColor};
            }
        `;

        // Create widget HTML
        const widgetHTML = `
            <div id="ag-widget-container">
                <div id="ag-chat-window">
                    <div class="ag-header">
                        <div class="ag-header-title">${settings.title || 'Canlı Destek'}</div>
                        <div class="ag-header-subtitle">${settings.subtitle || ''}</div>
                        <button class="ag-minimize-btn" id="ag-minimize" title="Küçült">
                            <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
                        </button>
                    </div>
                    <div class="ag-messages" id="ag-messages">
                        <div class="ag-message bot">${settings.greetingMessage || 'Merhaba!'}</div>
                    </div>
                    <div id="ag-typing" class="ag-typing">Asistan yazıyor...</div>
                    <div class="ag-input-area">
                        <input type="text" class="ag-input" id="ag-input" placeholder="Mesajınızı yazın...">
                        <button class="ag-send-btn" id="ag-send">Gönder</button>
                    </div>
                    <div class="ag-footer">
                        Powered by <a href="https://instomer.com" target="_blank" rel="noopener">Instomer</a>
                    </div>
                </div>
                <div id="ag-fab-wrapper">
                    <div id="ag-fab">
                        <svg viewBox="0 0 64 64" fill="white" style="width: 30px; height: 30px;">
                            <path d="m59.56 28.38c.29 1.499.44 3.043.44 4.62 0 14.389-12.58 26-28 26-5.07 0-9.83-1.255-13.94-3.452-.58-.31-1.27-.316-1.86-.017-3.6 1.844-7.69 2.877-11.07 3.455-.37.063-.74-.092-.96-.397-.21-.305-.23-.706-.04-1.03 0-.003 0-.007 0-.011 1.85-3.3 3.01-7.058 3.72-10.328.11-.501.02-1.025-.25-1.463-2.29-3.767-3.6-8.12-3.6-12.757 0-14.389 12.58-26 28-26 2.26 0 4.46.249 6.56.72 1.08.24 2.15-.439 2.39-1.516s-.44-2.148-1.51-2.388c-2.39-.533-4.88-.816-7.44-.816-17.7 0-32 13.482-32 30 0 5.105 1.36 9.915 3.77 14.13-.64 2.731-1.62 5.77-3.13 8.462-.94 1.657-.84 3.722.26 5.293s3.01 2.367 4.9 2.044c3.44-.589 7.55-1.624 11.29-3.38 4.45 2.201 9.53 3.451 14.91 3.451 17.7 0 32-13.482 32-30 0-1.836-.18-3.634-.51-5.38-.21-1.084-1.26-1.793-2.35-1.584-1.08.21-1.79 1.26-1.58 2.344zm-27.56.62c2.21 0 4 1.792 4 4s-1.79 4-4 4-4-1.792-4-4 1.79-4 4-4zm-15 0c2.21 0 4 1.792 4 4s-1.79 4-4 4-4-1.792-4-4 1.79-4 4-4zm27.61-22.963-2.07 5.479c0 .006 0 .012-.01.017 0 .004-.01.008-.01.01 0 0-5.48 2.066-5.48 2.066-1.83.689-3.04 2.438-3.04 4.391s1.21 3.702 3.04 4.391c0 0 5.48 2.066 5.48 2.066 0 .002.01.006.01.01.01.005.01.011.01.017 0 0 2.07 5.479 2.07 5.479.69 1.827 2.44 3.037 4.39 3.037s3.7-1.21 4.39-3.037c0 0 2.07-5.479 2.07-5.479 0-.006 0-.012.01-.017 0-.004.01-.008.01-.01 0 0 5.48-2.066 5.48-2.066 1.83-.689 3.04-2.438 3.04-4.391s-1.21-3.702-3.04-4.391c0 0-5.48-2.066-5.48-2.066 0-.002-.01-.006-.01-.01-.01-.005-.01-.011-.01-.017 0 0-2.07-5.479-2.07-5.479-.69-1.827-2.44-3.037-4.39-3.037s-3.7 1.21-4.39 3.037zm3.74 1.411c.1-.27.36-.448.65-.448s.55.178.65.448c0 0 2.06 5.48 2.06 5.48.21.538.52 1.026.93 1.433s.89.722 1.43.925c0 0 5.48 2.066 5.48 2.066.27.102.45.36.45.648s-.18.546-.45.648c0 0-5.48 2.066-5.48 2.066-.54.203-1.02.518-1.43.925s-.72.895-.93 1.433c0 0-2.06 5.48-2.06 5.48-.1.27-.36.448-.65.448s-.55-.178-.65-.448c0 0-2.06-5.48-2.06-5.48-.21-.538-.52-1.026-.93-1.433s-.89-.722-1.43-.925c0 0-5.48-2.066-5.48-2.066-.27-.102-.45-.36-.45-.648s.18-.546.45-.648c0 0 5.48-2.066 5.48-2.066.54-.203 1.02-.518 1.43-.925s.72-.895.93-1.433c0 0 2.06-5.48 2.06-5.48z"/>
                        </svg>
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

        fab.onclick = () => {
            chatWindow.classList.toggle('open');
        };

        minimizeBtn.onclick = () => {
            chatWindow.classList.remove('open');
        };

        function addMessage(text, type) {
            const msg = document.createElement('div');
            msg.className = `ag-message ${type}`;
            msg.innerText = text;
            messagesContainer.appendChild(msg);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        async function sendMessage() {
            const text = input.value.trim();
            if (!text) return;

            input.value = '';
            addMessage(text, 'user');

            typingIndicator.style.display = 'block';
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            try {
                const response = await fetch(`${apiBaseUrl}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workspaceId,
                        visitorId,
                        message: text
                    })
                });
                const data = await response.json();

                typingIndicator.style.display = 'none';
                if (data.reply) {
                    addMessage(data.reply, 'bot');
                }
            } catch (err) {
                console.error('Widget send error:', err);
                typingIndicator.style.display = 'none';
                addMessage('Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.', 'bot');
            }
        }

        sendBtn.onclick = sendMessage;
        input.onkeypress = (e) => {
            if (e.key === 'Enter') sendMessage();
        };
    }
})();
