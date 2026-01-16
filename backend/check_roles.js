import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRoles() {
    console.log('\n📊 === KULLANICI ROLLERI ===\n');
    
    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            role: true
        }
    });
    
    console.log('Users tablosu:');
    users.forEach(u => {
        console.log(`  - ${u.name} (${u.email}): ${u.role}`);
    });
    
    console.log('\n📊 === WORKSPACE MEMBERS ===\n');
    
    const workspaces = await prisma.workspace.findMany({
        include: {
            members: {
                include: {
                    user: {
                        select: {
                            name: true,
                            email: true,
                            role: true
                        }
                    }
                }
            }
        }
    });
    
    workspaces.forEach(ws => {
        console.log(`\nWorkspace: ${ws.name}`);
        ws.members.forEach(m => {
            console.log(`  - ${m.user.name} (${m.user.email})`);
            console.log(`    User.role: ${m.user.role}`);
            console.log(`    WorkspaceMember.role: ${m.role}`);
        });
    });
    
    console.log('\n✅ Kontrol tamamlandı!\n');
    await prisma.$disconnect();
}

checkRoles().catch(console.error);
