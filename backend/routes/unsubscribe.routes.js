import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

// =============================================
// GET /unsubscribe/:token — Unsubscribe sayfası göster + opt-out yap
// Auth gerektirmez — public endpoint
// Token: base64url(workspaceId:contactId)
// =============================================
router.get('/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Token decode
        let workspaceId, contactId;
        try {
            const decoded = Buffer.from(token, 'base64url').toString('utf8');
            [workspaceId, contactId] = decoded.split(':');
            if (!workspaceId || !contactId) throw new Error('Invalid token');
        } catch {
            return res.status(400).send(renderPage('error', 'Geçersiz link.'));
        }
        
        // Kişiyi bul
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, workspaceId },
            select: { id: true, name: true, marketingOptOut: true }
        });
        
        if (!contact) {
            return res.status(404).send(renderPage('error', 'Kişi bulunamadı.'));
        }
        
        // Zaten opt-out ise
        if (contact.marketingOptOut) {
            return res.send(renderPage('already', 'Zaten pazarlama listesinden çıkmışsınız.'));
        }
        
        // Opt-out yap
        await prisma.contact.update({
            where: { id: contactId },
            data: {
                marketingOptOut: true,
                marketingOptOutAt: new Date()
            }
        });
        
        // Workspace adını al (sayfa için)
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { name: true }
        });
        
        console.log(`🚫 [Unsubscribe] Kişi opt-out oldu: ${contact.name || contactId} (workspace: ${workspace?.name || workspaceId})`);
        
        return res.send(renderPage('success', 'Pazarlama mesajlarından başarıyla çıktınız.', workspace?.name));
        
    } catch (error) {
        console.error('❌ [Unsubscribe] Hata:', error.message);
        return res.status(500).send(renderPage('error', 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.'));
    }
});

// =============================================
// HTML Sayfa Render
// =============================================
function renderPage(type, message, companyName) {
    const icons = {
        success: '✅',
        already: 'ℹ️',
        error: '⚠️'
    };
    const colors = {
        success: '#10b981',
        already: '#3b82f6',
        error: '#ef4444'
    };
    
    return `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Üyelikten Ayrıl</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .card {
            background: #fff;
            border-radius: 20px;
            padding: 48px 40px;
            max-width: 440px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.08);
        }
        .icon {
            font-size: 56px;
            margin-bottom: 20px;
        }
        .title {
            font-size: 22px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 12px;
        }
        .message {
            font-size: 16px;
            color: #64748b;
            line-height: 1.6;
            margin-bottom: 24px;
        }
        .badge {
            display: inline-block;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            color: #fff;
            background: ${colors[type]};
        }
        .footer {
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #94a3b8;
            font-size: 13px;
        }
        .company {
            font-weight: 600;
            color: #475569;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">${icons[type]}</div>
        <div class="title">${type === 'success' ? 'Üyelikten Ayrıldınız' : type === 'already' ? 'Zaten Ayrılmışsınız' : 'Bir Sorun Oluştu'}</div>
        <p class="message">${message}</p>
        ${type !== 'error' ? '<span class="badge">Pazarlama mesajları kapatıldı</span>' : ''}
        <div class="footer">
            ${companyName ? `<span class="company">${companyName}</span> · ` : ''}
            Powered by <strong>Instomer</strong>
        </div>
    </div>
</body>
</html>`;
}

export default router;
