import prisma from './lib/prisma.js';

await prisma.workspace.updateMany({
    where: {
        id: { in: [
            'df8b1a97-1ae8-4709-a8fc-1f778bee7380',
            '4fecbe62-aaf9-4499-acb0-80c2b0b58765'
        ]}
    },
    data: { appointmentEnabled: false }
}).then(r => console.log('✅ Güncellendi:', r.count, 'workspace'));

await prisma.$disconnect();
