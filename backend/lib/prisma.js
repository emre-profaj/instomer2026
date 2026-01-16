import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Middleware: Telefon numarası olan contact'ları otomatik olarak POTENTIAL yap
prisma.$use(async (params, next) => {
    // Contact create veya update işlemlerinde
    if (params.model === 'Contact') {
        if (params.action === 'create' || params.action === 'update' || params.action === 'upsert') {
            const data = params.args.data || params.args.create;
            
            // Eğer telefon numarası varsa ve status açıkça başka bir şey ayarlanmamışsa
            if (data && data.phone) {
                // Status NEW ise veya hiç ayarlanmamışsa POTENTIAL yap
                if (!data.status || data.status === 'NEW') {
                    data.status = 'POTENTIAL';
                    console.log(`📱 [Prisma Middleware] Contact with phone set to POTENTIAL: ${data.phone}`);
                }
            }
            
            // Upsert için update kısmını da kontrol et
            if (params.action === 'upsert' && params.args.update) {
                const updateData = params.args.update;
                const createData = params.args.create;
                
                // Create'de telefon varsa
                if (createData && createData.phone) {
                    if (!createData.status || createData.status === 'NEW') {
                        createData.status = 'POTENTIAL';
                    }
                }
                
                // Update'de telefon ekleniyor veya varsa
                if (updateData && updateData.phone) {
                    // Status güncellenmiyorsa POTENTIAL yap
                    if (!updateData.status) {
                        updateData.status = 'POTENTIAL';
                    }
                }
            }
        }
    }
    
    return next(params);
});

export default prisma;

