import prisma from '../lib/prisma.js';
import { updateLeadScore } from './leadScoring.service.js';

/**
 * Merkezi Funnel ve Aşama (Stage) Değiştirme Servisi
 * Bu fonksiyon, funnel ve stage değişimi gereken tüm yerlerde çağrılmalıdır.
 */
export async function changeFunnelStage(contactId, workspaceId, funnelId, stageId, options = {}) {
  const {
    source = 'unknown',
    isManual = false,
    skipGuards = false,
    conversationId = null,
    triggeredBy = null
  } = options;

  try {
    // 1. Mevcut Contact durumunu alalım
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        funnelStage: true
      }
    });

    if (!contact) {
      return { changed: false, reason: 'contact_not_found' };
    }

    const oldFunnelId = contact.funnelType;
    const oldStageId = contact.funnelStageId;
    
    // YENİ DÜZENLEME: Contact zaten bu aşamada görünse bile, Case tablosu senkronize olmamış olabilir.
    // Bu yüzden "already_in_stage" kontrolünü kaldırıyoruz, böylece Case'leri de zorla güncelleyebilelim.
    // if (oldFunnelId === funnelId && oldStageId === stageId) {
    //   return { changed: false, reason: 'already_in_stage' };
    // }

    // 2. Guards (Korumalar)
    if (!skipGuards) {
      // Manuel olarak ayarlanmışsa otomatik geçişleri engelle
      if (!isManual && contact.stageManuallySet) {
        return { changed: false, reason: 'manually_set' };
      }

      // Sadece aynı funnel içindeysek ileri yönlü ilerleme kontrolü yap
      if (oldFunnelId === funnelId && oldStageId) {
        // Yeni aşamayı bulalım
        const newStage = await prisma.funnelStage.findUnique({
          where: { id: stageId }
        });

        // Eski aşamayı contact.funnelStage üzerinden biliyoruz
        const oldStage = contact.funnelStage;

        if (newStage && oldStage) {
          const isClosing = newStage.isClosing === true; // Kapanış aşamasıysa izin ver
          
          if (!isManual && !isClosing && newStage.order <= oldStage.order) {
            return { changed: false, reason: 'backward_progression_prevented' };
          }
        }
      }
    }

    // 3. Stage ve Funnel verilerini çek (Atamalar için)
    const newStage = await prisma.funnelStage.findUnique({
      where: { id: stageId }
    });
    
    const funnel = await prisma.funnel.findUnique({
      where: { id: funnelId }
    });

    // 4. Update datalarını hazırla
    const contactUpdateData = {
      funnelType: funnelId,
      funnelStageId: stageId
    };

    if (isManual) {
      contactUpdateData.stageManuallySet = true;
    }

    // Atamaları (Assignments) belirle — Prisma alan adlarına uygun
    const assignments = {};
    if (newStage?.assignedTeamId) {
      assignments.assignedTeamId = newStage.assignedTeamId;
      assignments.teamIds = JSON.stringify([newStage.assignedTeamId]);
    }
    if (newStage?.assignedUserId) assignments.assignedToId = newStage.assignedUserId;
    
    // Eğer aşamada atama yoksa, funnel seviyesine (miras) bak
    if (!assignments.assignedTeamId && funnel?.assignedTeamId) {
      assignments.assignedTeamId = funnel.assignedTeamId;
      assignments.teamIds = JSON.stringify([funnel.assignedTeamId]);
    }
    if (!assignments.assignedToId && funnel?.assignedUserId) assignments.assignedToId = funnel.assignedUserId;

    // 5. Veritabanı CASCADE Güncellemeleri
    await prisma.$transaction(async (tx) => {
      // Contact güncelle
      await tx.contact.update({
        where: { id: contactId },
        data: contactUpdateData
      });

      // Açık konuşmaları (Conversation) güncelle
      const conversationUpdateData = {
        funnelType: funnelId,
        funnelStageId: stageId,
      };

      // Atama bilgisi varsa ekle (yoksa mevcut atamaları koru)
      if (Object.keys(assignments).length > 0) {
        Object.assign(conversationUpdateData, assignments);
      }

      await tx.conversation.updateMany({
        where: {
          contactId,
          workspaceId,
          status: { not: 'RESOLVED' }
        },
        data: conversationUpdateData
      });

      // Aktif vakaları (Case) güncelle
      await tx.case.updateMany({
        where: {
          contactId,
          workspaceId,
          status: { notIn: ['CLOSED', 'CANCELLED'] }
        },
        data: {
          funnelType: funnelId,
          funnelStageId: stageId
        }
      });
    });

    // 6. Eski aşamadan çıkış (Exit Actions)
    if (oldStageId && oldStageId !== stageId) {
      try {
        const { executeExitActions } = await import('./stageAutomation.service.js');
        await executeExitActions(oldStageId, contactId, workspaceId);
      } catch (err) {
        console.error('Exit actions execution error:', err);
      }
    }

    // 7. Yeni aşamaya giriş (Entry Actions & Timed Actions)
    try {
      const { executeEntryActions, scheduleTimedActions } = await import('./stageAutomation.service.js');
      await executeEntryActions(stageId, contactId, workspaceId);
      await scheduleTimedActions(stageId, contactId, workspaceId);
    } catch (err) {
      console.error('Entry/Timed actions execution error:', err);
    }

    // 8. WebSocket Event fırlat
    try {
      const { emitToWorkspace } = await import('../socket.js');
      emitToWorkspace(workspaceId, 'funnel_stage_updated', {
        contactId,
        conversationId,
        funnelType: funnelId,
        funnelStageId: stageId,
        source
      });
    } catch (err) {
      console.error('WebSocket emit error:', err);
    }

    // 9. Audit Log (ConversationEvent)
    if (conversationId) {
      try {
        const { logEvent } = await import('./conversationEvent.service.js');
        const isFunnelChanged = oldFunnelId !== funnelId;
        const oldFunnelName = oldFunnelId ? await prisma.funnel.findUnique({where:{id:oldFunnelId},select:{name:true}}).then(f=>f?.name||'Genel') : 'Genel';
        const newFunnelName = funnelId ? await prisma.funnel.findUnique({where:{id:funnelId},select:{name:true}}).then(f=>f?.name||'Genel') : 'Genel';
        const oldStageName = oldStageId ? await prisma.funnelStage.findUnique({where:{id:oldStageId},select:{name:true}}).then(s=>s?.name||'Belirsiz') : 'Belirsiz';
        const newStageName = stageId ? await prisma.funnelStage.findUnique({where:{id:stageId},select:{name:true}}).then(s=>s?.name||'Belirsiz') : 'Belirsiz';

        const title = isFunnelChanged 
            ? `Akış <b>${oldFunnelName}</b> → <b>${newFunnelName}</b> olarak değiştirildi`
            : `Aşama <b>${oldStageName}</b> → <b>${newStageName}</b> olarak değiştirildi`;

        await logEvent({
          conversationId,
          contactId,
          workspaceId,
          eventType: isFunnelChanged ? 'FUNNEL_CHANGED' : 'STAGE_CHANGED',
          title,
          details: {
            oldFunnelId,
            oldStageId,
            newFunnelId: funnelId,
            newStageId: stageId,
            source,
            triggeredBy
          },
          actorId: triggeredBy,
          actorType: triggeredBy ? 'USER' : 'SYSTEM'
        });
      } catch (err) {
        console.error('Audit log error:', err);
      }
    }

    // Aşama değiştiğinde lead skorunu güncelle
    updateLeadScore(contactId).catch(err => 
      console.error('[changeFunnelStage] Score update error:', err.message)
    );

    // 11. Disao CRM — Sıcak Fırsat tetikleyicisi
    const stageNameLower = (newStage?.name || '').toLowerCase().replace(/ı/g, 'i').replace(/I/g, 'i');
    if (stageNameLower.includes('sicak firsat') || stageNameLower.includes('sıcak fırsat')) {
      try {
        const { default: disaoCrmService } = await import('./disaoCrm.service.js');
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { disaoCrmEnabled: true } });
        if (workspace?.disaoCrmEnabled) {
          const fullContact = await prisma.contact.findUnique({ where: { id: contactId } });
          if (fullContact) {
            disaoCrmService.sendCustomer(workspaceId, fullContact, 'SICAK_FIRSAT').catch(err =>
              console.error('[changeFunnelStage] Disao CRM error:', err.message)
            );
          }
        }
      } catch (disaoErr) {
        console.error('[changeFunnelStage] Disao CRM hook error:', disaoErr.message);
      }
    }

    // 12. Sonucu dön
    return {
      changed: true,
      oldFunnelId,
      oldStageId,
      newFunnelId: funnelId,
      newStageId: stageId,
      source
    };

  } catch (error) {
    console.error('changeFunnelStage error:', error);
    throw error;
  }
}

/**
 * Belirli bir aşama veya funnel için Bot ID çözümleme (Miras mantığı)
 * Resolution chain: Stage bot → Funnel bot → Genel funnel bot → null
 */
export async function resolveInheritedBot(workspaceId, funnelId, stageId) {
  try {
    // 1. Stage bot check
    if (stageId) {
      const stage = await prisma.funnelStage.findUnique({
        where: { id: stageId }
      });
      if (stage?.assignedBotId) return stage.assignedBotId;
    }

    // 2. Funnel bot check
    if (funnelId) {
      const funnel = await prisma.funnel.findUnique({
        where: { id: funnelId }
      }).catch(() => null);
      
      if (funnel?.assignedBotId) {
        return funnel.assignedBotId;
      }
    }

    // 3. Default (Genel) funnel bot check
    const defaultFunnel = await prisma.funnel.findFirst({
      where: { workspaceId, isDefault: true }
    }).catch(() => null);

    if (defaultFunnel?.assignedBotId) {
      return defaultFunnel.assignedBotId;
    }

    return null;
  } catch (error) {
    console.error('resolveInheritedBot error:', error);
    return null; // Hata durumunda null dönerek sistemin kırılmasını engelle
  }
}
