import prisma from '../lib/prisma.js';

/**
 * Default teams to be seeded for every new workspace.
 * Each team represents a standard operational unit.
 */
const DEFAULT_TEAMS = [
    { name: 'Genel', description: 'Genel müşteri hizmetleri ekibi' },
    { name: 'Fırsat', description: 'Satış fırsatları ve potansiyel müşteri yönetimi' },
    { name: 'Randevu', description: 'Randevu planlama ve takip ekibi' },
    { name: 'İş ve Taşeron Başvuruları', description: 'İş başvuruları ve taşeron yönetimi' },
    { name: 'Kurumsal', description: 'Kurumsal müşteri ilişkileri' },
    { name: 'Şikayet', description: 'Şikayet yönetimi ve çözüm ekibi' },
    { name: 'Şube 1', description: 'Şube operasyonları' },
];

/**
 * Seeds the default teams for a newly created workspace.
 * Safe to call — skips if teams already exist for the workspace.
 *
 * @param {string} workspaceId - The workspace to seed teams for
 * @returns {Promise<number>} Number of teams created
 */
export async function seedDefaultTeams(workspaceId) {
    try {
        // Check if workspace already has teams (idempotency guard)
        const existingCount = await prisma.team.count({
            where: { workspaceId }
        });

        if (existingCount > 0) {
            console.log(`⏭️  Workspace ${workspaceId} already has ${existingCount} teams, skipping seed.`);
            return 0;
        }

        // Create all default teams
        const created = await prisma.team.createMany({
            data: DEFAULT_TEAMS.map(t => ({
                name: t.name,
                description: t.description,
                workspaceId,
            })),
            skipDuplicates: true,
        });

        console.log(`🌱 Seeded ${created.count} default teams for workspace ${workspaceId}`);
        return created.count;
    } catch (error) {
        // Non-blocking: log but don't throw so workspace creation isn't affected
        console.error(`⚠️  Failed to seed default teams for workspace ${workspaceId}:`, error.message);
        return 0;
    }
}

export default seedDefaultTeams;
