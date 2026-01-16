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
    // If widgetId is provided, use the widgetId endpoint; otherwise use workspaceId endpoint
    const settingsUrl = widgetId
        ? `${apiBaseUrl}/widget/${widgetId}`
        : `${apiBaseUrl}/${workspaceId}/widget`;

    fetch(settingsUrl)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            return res.json();
        })
        .then(data => {
            // If using widgetId endpoint, get workspaceId from response
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
        // Inject CSS
        const style = document.createElement('style');
        const isLeft = settings.position === 'LEFT';
        const widgetWidth = settings.width || 350;

        style.innerHTML = `
            #ag-widget-container {
                position: fixed;
                bottom: 20px;
                ${isLeft ? 'left: 20px;' : 'right: 20px;'}
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            #ag-fab {
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
                ${isLeft ? 'margin-right: auto;' : 'margin-left: auto;'}
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
                transform-origin: ${isLeft ? 'bottom left' : 'bottom right'};
                transition: transform 0.3s ease, opacity 0.3s ease;
                opacity: 0;
                transform: scale(0.9) translateY(20px);
            }
            #ag-chat-window.open {
                display: flex;
                opacity: 1;
                transform: scale(1) translateY(0);
            }
            
            .ag-header {
                background-color: ${settings.primaryColor};
                padding: 20px;
                color: white;
            }
            .ag-header-title { font-weight: 700; font-size: 16px; }
            .ag-header-subtitle { font-size: 12px; opacity: 0.8; margin-top: 2px; }
            
            .ag-messages {
                flex: 1;
                padding: 16px;
                overflow-y: auto;
                background: #f8fafc;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .ag-message {
                max-width: 80%;
                padding: 10px 14px;
                font-size: 14px;
                line-height: 1.4;
            }
            .ag-message.bot {
                background: white;
                color: #1e293b;
                align-self: flex-start;
                border-radius: 0 12px 12px 12px;
                border: 1px solid #e2e8f0;
            }
            .ag-message.user {
                background-color: ${settings.primaryColor};
                color: white;
                align-self: flex-end;
                border-radius: 12px 12px 0 12px;
            }
            
            .ag-input-area {
                padding: 12px;
                border-top: 1px solid #e2e8f0;
                display: flex;
                gap: 8px;
            }
            .ag-input {
                flex: 1;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 8px 12px;
                outline: none;
                font-size: 14px;
            }
            .ag-input:focus { border-color: ${settings.primaryColor}; }
            .ag-send-btn {
                background: ${settings.primaryColor};
                border: none;
                color: white;
                padding: 8px 12px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
            }
            .ag-typing { font-size: 11px; color: #64748b; margin-top: 4px; display: none; }
        `;
        document.head.appendChild(style);

        // Inject HTML
        const container = document.createElement('div');
        container.id = 'ag-widget-container';
        container.innerHTML = `
            <div id="ag-chat-window">
                <div class="ag-header">
                    <div class="ag-header-title">${settings.title || 'Canlı Destek'}</div>
                    <div class="ag-header-subtitle">${settings.subtitle || ''}</div>
                </div>
                <div class="ag-messages" id="ag-messages">
                    <div class="ag-message bot">${settings.greetingMessage || 'Merhaba!'}</div>
                </div>
                <div id="ag-typing" class="ag-typing" style="padding: 0 16px 8px;">Asistan yazıyor...</div>
                <div class="ag-input-area">
                    <input type="text" class="ag-input" id="ag-input" placeholder="Mesajınızı yazın...">
                    <button class="ag-send-btn" id="ag-send">Gönder</button>
                </div>
            </div>
            <div id="ag-fab">
                <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>
            </div>
        `;
        document.body.appendChild(container);

        // Logic
        const fab = document.getElementById('ag-fab');
        const chatWindow = document.getElementById('ag-chat-window');
        const input = document.getElementById('ag-input');
        const sendBtn = document.getElementById('ag-send');
        const messagesContainer = document.getElementById('ag-messages');
        const typingIndicator = document.getElementById('ag-typing');

        fab.onclick = () => {
            chatWindow.classList.toggle('open');
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

            // Show typing
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
