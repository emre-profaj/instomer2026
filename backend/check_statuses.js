import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const conversations = await prisma.conversation.findMany({
        select: {
            id: true,
            funnelStageId: true,
            contact: {
                select: {
                    id: true,
                    status: true
                }
            }
        },
        where: {
            NOT: {
                funnelStageId: null
            }
        }
    });

    let nonUuidCount = 0;
    let mismatchCount = 0;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const conv of conversations) {
        const isUuid = uuidRegex.test(conv.funnelStageId);
        if (!isUuid) {
            nonUuidCount++;
            if (conv.funnelStageId !== conv.contact?.status) {
                mismatchCount++;
                console.log(`Mismatch: ConvID: ${conv.id} | funnelStageId: ${conv.funnelStageId} | contact.status: ${conv.contact?.status}`);
            }
        }
    }

    console.log(`Total active funnelStageIds: ${conversations.length}`);
    console.log(`Non-UUID funnelStageIds: ${nonUuidCount}`);
    console.log(`Mismatched (funnelStageId != contact.status): ${mismatchCount}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
