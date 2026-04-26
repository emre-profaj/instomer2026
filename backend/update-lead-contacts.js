import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateLeadContacts() {
    console.log('🔄 Updating lead contacts with phone and email...\n');

    // Get all LEAD conversations with their contacts
    const leadConversations = await prisma.conversation.findMany({
        where: { channel: 'LEAD' },
        include: {
            contact: true,
            messages: {
                orderBy: { createdAt: 'asc' },
                take: 1
            }
        }
    });

    console.log(`Found ${leadConversations.length} lead conversations\n`);

    for (const conv of leadConversations) {
        const message = conv.messages[0];
        if (!message) continue;

        const content = message.content;
        console.log(`\n📋 Processing: ${conv.contact?.name || 'Unknown'}`);

        // Parse email from message content
        let email = null;
        const emailPatterns = [
            /LEAD EMAIL:\s*([^\s•\n]+)/i,
            /E-posta:\s*([^\s•\n]+)/i,
            /Email:\s*([^\s•\n]+)/i,
            /✉️\s*([^\s•\n]+)/i,
            /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
        ];
        
        for (const pattern of emailPatterns) {
            const match = content.match(pattern);
            if (match && match[1] && match[1].includes('@')) {
                email = match[1].trim();
                break;
            }
        }

        // Parse phone from message content
        let phone = null;
        const phonePatterns = [
            /LEAD PHONE:\s*([+\d\s()-]+)/i,
            /Telefon:\s*([+\d\s()-]+)/i,
            /Phone:\s*([+\d\s()-]+)/i,
            /📞\s*([+\d\s()-]+)/i,
            /(\+?[0-9]{10,15})/
        ];
        
        for (const pattern of phonePatterns) {
            const match = content.match(pattern);
            if (match && match[1]) {
                const cleaned = match[1].replace(/[^\d+]/g, '');
                if (cleaned.length >= 10) {
                    phone = cleaned;
                    break;
                }
            }
        }

        console.log(`   Email: ${email || 'not found'}`);
        console.log(`   Phone: ${phone || 'not found'}`);

        // Update contact if we found new info
        if ((email || phone) && conv.contact) {
            const updateData = {};
            if (email && !conv.contact.email) updateData.email = email;
            if (phone && !conv.contact.phone) updateData.phone = phone;

            if (Object.keys(updateData).length > 0) {
                await prisma.contact.update({
                    where: { id: conv.contact.id },
                    data: updateData
                });
                console.log(`   ✅ Updated contact with:`, updateData);
            } else {
                console.log(`   ⏭️ Contact already has this info`);
            }
        }
    }

    console.log('\n✅ Done!');
    await prisma.$disconnect();
}

updateLeadContacts().catch(console.error);











