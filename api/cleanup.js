const { listAllEmailRoutes, deleteEmailRoute } = require('./_lib/cloudflare');
const { getGmail } = require('./_lib/gmail');

const EXPIRY_MINUTES = 30;

/**
 * Cleanup endpoint - deletes expired TempMail rules across ALL zones
 * Can be triggered manually via GET /api/cleanup
 */
module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log('🧹 Starting cleanup of expired TempMail routes...');

    try {
        const allRoutes = await listAllEmailRoutes();
        const tempMailRoutes = allRoutes.filter(r => r.name && r.name.startsWith('TempMail:'));
        const now = new Date();
        const deletedRules = [];
        const errors = [];

        for (const route of tempMailRoutes) {
            try {
                const createdMatch = route.name.match(/Created:\s*(.+)$/);
                const ruleId = route.tag || route.id;
                const zoneId = route._zoneId;
                const emailMatch = route.name.match(/TempMail:\s*([^\s|]+)/);
                const tempEmail = emailMatch ? emailMatch[1] : null;

                // No timestamp = old rule, delete it
                if (!createdMatch) {
                    await deleteEmailRoute(ruleId, zoneId);
                    deletedRules.push({ ruleId, email: tempEmail, reason: 'no timestamp' });
                    continue;
                }

                const createdAt = new Date(createdMatch[1].trim());
                const ageMinutes = (now - createdAt) / (1000 * 60);

                if (ageMinutes >= EXPIRY_MINUTES) {
                    await deleteEmailRoute(ruleId, zoneId);
                    console.log(`🗑️ Deleted: ${tempEmail || ruleId} (${Math.round(ageMinutes)}min old)`);

                    if (tempEmail) {
                        try {
                            const gmail = getGmail();
                            const response = await gmail.users.messages.list({ userId: 'me', q: `to:${tempEmail}`, maxResults: 50 });
                            for (const msg of (response.data.messages || [])) {
                                await gmail.users.messages.trash({ userId: 'me', id: msg.id }).catch(() => { });
                            }
                        } catch (e) { /* ignore */ }
                    }

                    deletedRules.push({ ruleId, email: tempEmail, ageMinutes: Math.round(ageMinutes) });
                }
            } catch (err) {
                errors.push({ rule: route.name, error: err.message });
            }
        }

        console.log(`✅ Cleanup done: ${deletedRules.length} deleted, ${errors.length} errors`);

        res.status(200).json({
            success: true,
            deleted: deletedRules.length,
            errors: errors.length,
            details: deletedRules,
            timestamp: now.toISOString(),
        });
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};
