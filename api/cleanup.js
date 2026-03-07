const { listEmailRoutes, deleteEmailRoute } = require('./_lib/cloudflare');
const { getGmail } = require('./_lib/gmail');

const EXPIRY_MINUTES = 40;

/**
 * Cleanup endpoint - deletes expired TempMail routing rules from Cloudflare
 * Can be triggered by Vercel Cron or manually via GET /api/cleanup
 * 
 * Rules older than 40 minutes are automatically deleted.
 * Also cleans up related emails from Gmail inbox.
 */
module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log('🧹 Starting cleanup of expired TempMail routes...');

    try {
        // List all routing rules from all zones
        const allRoutes = await listEmailRoutes();

        // Filter TempMail rules only
        const tempMailRoutes = allRoutes.filter(r => r.name && r.name.startsWith('TempMail:'));

        const now = new Date();
        const deletedRules = [];
        const errors = [];

        for (const route of tempMailRoutes) {
            try {
                // Parse creation timestamp from rule name
                // Format: "TempMail: email@domain | Created: 2025-01-01T00:00:00.000Z"
                const createdMatch = route.name.match(/Created:\s*(.+)$/);

                let createdAt;
                if (createdMatch) {
                    createdAt = new Date(createdMatch[1].trim());
                } else {
                    // If no timestamp in name (old format), use a fallback
                    // Check if route has a created_on field from Cloudflare API
                    if (route.created_on) {
                        createdAt = new Date(route.created_on);
                    } else {
                        // Skip rules without timestamp - we can't determine age
                        console.log(`⏭️ Skipping rule "${route.name}" - no timestamp found`);
                        continue;
                    }
                }

                // Check if the rule is expired (older than EXPIRY_MINUTES)
                const ageMs = now - createdAt;
                const ageMinutes = ageMs / (1000 * 60);

                if (ageMinutes >= EXPIRY_MINUTES) {
                    // Extract email address from rule name for Gmail cleanup
                    const emailMatch = route.name.match(/TempMail:\s*([^\s|]+)/);
                    const tempEmail = emailMatch ? emailMatch[1] : null;

                    // Delete the Cloudflare routing rule
                    const ruleId = route.tag || route.id;
                    const zoneId = route._zoneId; // Added by listEmailRoutes
                    await deleteEmailRoute(ruleId, null, zoneId);

                    console.log(`🗑️ Deleted expired rule: ${route.name} (age: ${Math.round(ageMinutes)}min)`);

                    // Try to delete associated emails from Gmail
                    if (tempEmail) {
                        try {
                            await cleanupGmailMessages(tempEmail);
                        } catch (gmailErr) {
                            console.error(`⚠️ Failed to cleanup Gmail for ${tempEmail}:`, gmailErr.message);
                        }
                    }

                    deletedRules.push({
                        ruleId,
                        email: tempEmail,
                        ageMinutes: Math.round(ageMinutes),
                        domain: route._domain || 'unknown',
                    });
                }
            } catch (routeErr) {
                errors.push({
                    rule: route.name,
                    error: routeErr.message,
                });
                console.error(`❌ Error processing rule "${route.name}":`, routeErr.message);
            }
        }

        console.log(`✅ Cleanup complete: ${deletedRules.length} rules deleted, ${errors.length} errors`);

        res.status(200).json({
            success: true,
            message: `Cleanup complete`,
            summary: {
                totalRoutes: tempMailRoutes.length,
                deletedCount: deletedRules.length,
                errorCount: errors.length,
                expiryMinutes: EXPIRY_MINUTES,
            },
            deleted: deletedRules,
            errors: errors.length > 0 ? errors : undefined,
            timestamp: now.toISOString(),
        });
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        res.status(500).json({
            success: false,
            error: 'Cleanup failed',
            details: error.message,
        });
    }
};

/**
 * Delete emails from Gmail that were sent to a specific temp email address
 * @param {string} tempEmail - The temp email address to clean up
 */
async function cleanupGmailMessages(tempEmail) {
    const gmail = getGmail();

    // Search for emails sent to this temp address
    const response = await gmail.users.messages.list({
        userId: 'me',
        q: `to:${tempEmail}`,
        maxResults: 50,
    });

    const messages = response.data.messages || [];

    if (messages.length === 0) {
        return;
    }

    // Delete each message (move to trash)
    for (const msg of messages) {
        try {
            await gmail.users.messages.trash({
                userId: 'me',
                id: msg.id,
            });
        } catch (e) {
            // Ignore individual message deletion failures
        }
    }

    console.log(`📧 Trashed ${messages.length} Gmail messages for ${tempEmail}`);
}
