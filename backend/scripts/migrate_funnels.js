import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Legacy Contact Categories mapping
const CATEGORY_MAP = {
  'NEW': 'Yeni Başvuru',
  'NEW_APPLICATION': 'Yeni Başvuru',
  'NOT_INTERESTED': 'İlgilenmiyor',
  'INFO_GIVEN': 'Bilgi Verildi',
  'INFO_PROVIDED': 'Bilgi Dönüşü',
  'CUSTOMER': 'Müşteri',
  'OPPORTUNITY': 'Fırsat',
  'HOT_OPPORTUNITY': 'Sıcak Fırsat',
  'COMPLAINT': 'Şikayet / Destek',
  'LOST': 'Kayıp',
  'VIP': 'VIP',
  'PARTNER': 'İş Ortağı',
  'SPAM': 'Spam',
  'BLACKLIST': 'Kara Liste'
};

async function main() {
  console.log('Starting Contact Funnel Migration...');

  // Get all workspaces
  const workspaces = await prisma.workspace.findMany();
  for (const ws of workspaces) {
    console.log(`Processing Workspace ${ws.id} - ${ws.name}`);

    // Check if the workspace has funnels configured
    // Since Funnels are dynamic per-workspace, we will find OR create a default structure just for legacy mapping
    const funnels = await prisma.funnel.findMany({
      where: { workspaceId: ws.id },
      include: { stages: true }
    });

    let defaultFunnel = funnels.find(f => f.name === 'CRM / Müşteriler' || f.name === 'Satış' || f.name === 'Default');
    
    // Create mapping by resolving stages
    let targetFunnelId = defaultFunnel?.id || null;
    let fallbackStages = {}; // stageName -> stageId

    if (defaultFunnel) {
      defaultFunnel.stages.forEach(s => {
        fallbackStages[s.name] = s.id;
      });
    }

    // Process all contacts with missing funnelType
    const contacts = await prisma.contact.findMany({
      where: { workspaceId: ws.id, funnelType: null }
    });

    if (contacts.length === 0) {
      console.log(`  No contacts need migration in workspace: ${ws.name}`);
      continue;
    }

    if (!defaultFunnel) {
       // Only create if we actually have contacts needing migration
       console.log(`  Creating default CRM Funnel for workspace: ${ws.name}`);
       defaultFunnel = await prisma.funnel.create({
         data: {
           workspaceId: ws.id,
           name: 'Genel CRM (Otomatik İşlem)',
           stages: {
             create: Object.values(CATEGORY_MAP).map((value, idx) => ({
                 name: value,
                 color: '#3b82f6',
                 order: idx
             }))
           }
         },
         include: { stages: true }
       });
       targetFunnelId = defaultFunnel.id;
       defaultFunnel.stages.forEach(s => fallbackStages[s.name] = s.id);
    }

    let updated = 0;
    for (const c of contacts) {
       let targetName = CATEGORY_MAP[c.category] || CATEGORY_MAP[c.status] || CATEGORY_MAP['NEW'];
       let targetStageId = fallbackStages[targetName] || null;

       if(targetStageId) {
         await prisma.contact.update({
           where: { id: c.id },
           data: {
             funnelType: targetFunnelId,
             funnelStageId: targetStageId
           }
         });
         updated++;
       }
    }

    console.log(`  Migrated ${updated} contacts to Funnel System`);
  }

  console.log('Migration Completed.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
