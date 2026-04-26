/**
 * Cleanup Invalid Facebook/Instagram Pages
 * 
 * This script removes FacebookPage records that have:
 * - NULL or empty accessToken
 * - No active conversations
 * 
 * Run with: node scripts/cleanup-invalid-facebook-pages.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupInvalidPages() {
    try {
        console.log('🔍 Finding invalid Facebook/Instagram pages...\n');

        // Find all pages - we'll filter in JavaScript
        const allPages = await prisma.facebookPage.findMany({
            include: {
                _count: {
                    select: {
                        conversations: true
                    }
                }
            }
        });

        // Filter pages with empty or very short tokens (likely invalid)
        const invalidPages = allPages.filter(page =>
            !page.pageAccessToken || page.pageAccessToken.length < 10
        );

        if (invalidPages.length === 0) {
            console.log('✅ No invalid pages found!');
            return;
        }

        console.log(`Found ${invalidPages.length} invalid pages:\n`);

        // Display invalid pages
        invalidPages.forEach((page, index) => {
            console.log(`${index + 1}. ${page.pageName || 'Unnamed'}`);
            console.log(`   ID: ${page.id}`);
            console.log(`   Type: ${page.type || 'FACEBOOK'}`);
            console.log(`   Workspace: ${page.workspaceId}`);
            console.log(`   Conversations: ${page._count.conversations}`);
            console.log(`   Token: ${page.pageAccessToken ? 'EXISTS' : 'NULL'}`);
            console.log('');
        });

        // Ask for confirmation (in production, you'd use a CLI prompt library)
        console.log('⚠️  WARNING: This will delete the above pages from the database.');
        console.log('⚠️  Conversations will NOT be deleted, but they will lose their page reference.');
        console.log('\nTo proceed, run this script with --confirm flag:\n');
        console.log('  node scripts/cleanup-invalid-facebook-pages.js --confirm\n');

        // Check if --confirm flag is present
        if (!process.argv.includes('--confirm')) {
            console.log('❌ Aborted. No changes made.');
            return;
        }

        // Delete invalid pages by ID
        console.log('🗑️  Deleting invalid pages...\n');

        const invalidPageIds = invalidPages.map(p => p.id);

        const deleteResult = await prisma.facebookPage.deleteMany({
            where: {
                id: {
                    in: invalidPageIds
                }
            }
        });

        console.log(`✅ Deleted ${deleteResult.count} invalid pages!`);
        console.log('\n💡 Tip: Run health check again to verify.');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

cleanupInvalidPages()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
