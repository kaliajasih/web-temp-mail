const { listEmailRoutes, deleteEmailRoute } = require('./_lib/cloudflare');
const { getGmail } = require('./_lib/gmail');

const EXPIRY_MINUTES = 30;

/**
 * Cleanup endpoint - deletes expired TempMail routing rules from Cloudflare
 * Triggered by Vercel Cron every 5 minutes or manually via GET /api/cleanup
 */
module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log('🧹 Starting cleanup of expired TempMail routes...');

    try {
        const allRoutes = await listEmailRoutes();
        const tempMailRoutes = allRoutes.filter(r => r.name && r.name.startsWith('TempMail:'));

        const now = new Date();
        const deletedRules = [];
        const errors = [];

        for (const route of tempMailRoutes) {
            try {
                // Parse timestamp from rule name: "TempMail: email@domain | Created: ISO_DATE"
                const createdMatch = route.name.match(/Created:\s*(.+)$/);

                let createdAt;
                if (createdMatch) {
                    createdAt = new Date(createdMatch[1].trim());
                } else {
                    // No timestamp — skip (old format rule)
                    console.log(`⏭️ Skipping rule "${route.name}" - no timestamp`);
                    continue;
                }

                const ageMinutes = (now - createdAt) / (1000 * 60);

                if (ageMinutes >= EXPIRY_MINUTES) {
                    const ruleId = route.tag || route.id;

                    // Extract email for Gmail cleanup
                    const emailMatch = route.name.match(/TempMail:\s*([^\s|]+)/);
                    const tempEmail = emailMatch ? emailMatch[1] : null;

                    // Delete Cloudflare routing rule
                    await deleteEmailRoute(ruleId);
                    console.log(`🗑️ Deleted: ${route.name} (age: ${Math.round(ageMinutes)}min)`);

                    // Trash related Gmail messages
                    if (tempEmail) {
                        try {
                            await cleanupGmail(tempEmail);
                        } catch (e) {
                            console.error(`⚠️ Gmail cleanup failed for ${tempEmail}:`, e.message);
                        }
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

async function cleanupGmail(tempEmail) {
    const gmail = getGmail();
    const response = await gmail.users.messages.list({
        userId: 'me',
        q: `to:${tempEmail}`,
        maxResults: 50,
    });

    const messages = response.data.messages || [];
    for (const msg of messages) {
        try {
            await gmail.users.messages.trash({ userId: 'me', id: msg.id });
        } catch (e) { /* ignore */ }
    }

    if (messages.length > 0) {
        console.log(`📧 Trashed ${messages.length} emails for ${tempEmail}`);
    }
}
