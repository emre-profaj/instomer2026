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
 * Default workspace rules to be seeded for every new workspace.
 * SALES_PHONE_CALL: Otomatik arama görevi — form dolduran veya mesajla
 * "beni arayın" diyen kişi için CALL activity oluşturur.
 */
const DEFAULT_RULES = [
    {
        ruleType: 'SALES_PHONE_CALL',
        isActive: true,
        config: JSON.stringify({
            callDelayMinutes: 15,
            assignDirectly: false  // Havuza düşsün, takımdan biri üstlensin
        })
    },
    {
        ruleType: 'PHONE_CAPTURE',
        isActive: true,
        config: JSON.stringify({})
    },
    {
        ruleType: 'APPOINTMENT_AUTO_PLAN',
        isActive: true,
        config: JSON.stringify({ teamId: null })
    }
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
        } else {
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
        }

        // Seed default workspace rules (idempotent — upsert)
        await seedDefaultRules(workspaceId);

        return existingCount > 0 ? 0 : DEFAULT_TEAMS.length;
    } catch (error) {
        // Non-blocking: log but don't throw so workspace creation isn't affected
        console.error(`⚠️  Failed to seed default teams for workspace ${workspaceId}:`, error.message);
        return 0;
    }
}

/**
 * Seeds default workspace rules (SALES_PHONE_CALL, PHONE_CAPTURE).
 * Uses upsert — safe to call multiple times.
 *
 * @param {string} workspaceId - The workspace to seed rules for
 */
export async function seedDefaultRules(workspaceId) {
    try {
        for (const rule of DEFAULT_RULES) {
            const existing = await prisma.workspaceRule.findFirst({
                where: { workspaceId, ruleType: rule.ruleType }
            });
            if (!existing) {
                await prisma.workspaceRule.create({
                    data: {
                        workspaceId,
                        ruleType: rule.ruleType,
                        isActive: rule.isActive,
                        config: rule.config
                    }
                });
            }
        }
        console.log(`🌱 Seeded default rules for workspace ${workspaceId}`);
    } catch (error) {
        console.error(`⚠️  Failed to seed default rules for workspace ${workspaceId}:`, error.message);
    }
}

export default seedDefaultTeams;

