/**
 * Disao CRM Routes
 * 
 * POST /api/disao-crm/test-connection → Bağlantı testi
 */
import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import disaoCrmService from '../services/disaoCrm.service.js';

const router = Router();

/**
 * POST /api/disao-crm/test-connection
 * Disao CRM bağlantısını test et
 * Body: { email, password }
 */
router.post('/test-connection', authenticateJWT, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Kullanıcı adı ve şifre gerekli'
      });
    }

    const result = await disaoCrmService.testConnection(email, password);

    res.json({
      success: result.success,
      message: result.message,
      user: result.user || null
    });

  } catch (error) {
    console.error('[DisaoCRM Route] Test connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Bağlantı testi sırasında beklenmeyen hata oluştu'
    });
  }
});

/**
 * PUT /api/disao-crm/:workspaceId/settings
 * Disao CRM ayarlarını kaydet
 */
router.put('/:workspaceId/settings', authenticateJWT, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { disaoCrmEnabled, disaoCrmSettings } = req.body;

    const { default: prisma } = await import('../lib/prisma.js');

    const updateData = {};
    if (disaoCrmEnabled !== undefined) updateData.disaoCrmEnabled = disaoCrmEnabled;
    if (disaoCrmSettings !== undefined) updateData.disaoCrmSettings = disaoCrmSettings ? JSON.stringify(disaoCrmSettings) : null;

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
      select: {
        id: true,
        disaoCrmEnabled: true,
        disaoCrmSettings: true
      }
    });

    // Token cache'ini temizle (ayarlar değiştiğinde)
    disaoCrmService.clearToken(workspaceId);

    res.json({ success: true, data: workspace });
  } catch (error) {
    console.error('[DisaoCRM Route] Save settings error:', error);
    res.status(500).json({ success: false, error: 'Ayarlar kaydedilemedi' });
  }
});

/**
 * GET /api/disao-crm/:workspaceId/settings
 * Disao CRM ayarlarını getir
 */
router.get('/:workspaceId/settings', authenticateJWT, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const { default: prisma } = await import('../lib/prisma.js');

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        disaoCrmEnabled: true,
        disaoCrmSettings: true
      }
    });

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    let settings = null;
    if (workspace.disaoCrmSettings) {
      try {
        settings = typeof workspace.disaoCrmSettings === 'string'
          ? JSON.parse(workspace.disaoCrmSettings)
          : workspace.disaoCrmSettings;
        
        if (settings && settings.password) {
          settings.password = '••••••••';
        }
      } catch (e) {
        settings = workspace.disaoCrmSettings;
      }
    }

    res.json({
      success: true,
      data: {
        enabled: workspace.disaoCrmEnabled || false,
        settings
      }
    });
  } catch (error) {
    console.error('[DisaoCRM Route] Get settings error:', error);
    res.status(500).json({ success: false, error: 'Ayarlar getirilemedi' });
  }
});

export default router;
