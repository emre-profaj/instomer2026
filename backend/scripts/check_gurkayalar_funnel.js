import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkF() {
  const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
  const funnels = await prisma.funnel.findMany({
    where: { workspaceId: wsId },
    include: { stages: true }
  });

  console.log(`Funnels for Gürkayalar:`);
  for (const f of funnels) {
    console.log(`- Funnel: ${f.name}`);
    f.stages.forEach(s => {
      console.log(`   * Stage: ${s.name}`);
    });
  }
}

checkF().then(() => prisma.$disconnect()).catch(console.error);
