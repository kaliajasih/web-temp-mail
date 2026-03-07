const { createEmailRoute, listEmailRoutes, deleteEmailRoute } = require('./_lib/cloudflare');
const { getGmail } = require('./_lib/gmail');

const EXPIRY_MINUTES = 30;

const adjectives = [
    'cool', 'fast', 'dark', 'wild', 'epic', 'mega', 'neo', 'pro', 'ultra', 'zen',
    'cyber', 'pixel', 'hyper', 'nova', 'flux', 'alpha', 'beta', 'sigma', 'delta', 'omega',
    'swift', 'blaze', 'frost', 'storm', 'shadow', 'lunar', 'solar', 'cosmic', 'neon', 'turbo'
];

const nouns = [
    'wolf', 'hawk', 'fox', 'bear', 'lynx', 'tiger', 'eagle', 'raven', 'cobra', 'viper',
    'blade', 'spark', 'flame', 'wave', 'pulse', 'node', 'byte', 'core', 'link', 'grid',
    'star', 'moon', 'comet', 'drift', 'glitch', 'raid', 'bolt', 'surge', 'nexus', 'vault'
];

/**
 * Cleanup expired TempMail rules (runs every time a new email is generated)
 */
async function cleanupExpiredRules() {
    try {
        const allRoutes = await listEmailRoutes();
        const tempMailRoutes = allRoutes.filter(r => r.name && r.name.startsWith('TempMail:'));
        const now = new Date();
        let deletedCount = 0;

        for (const route of tempMailRoutes) {
            const createdMatch = route.name.match(/Created:\s*(.+)$/);

            // No timestamp = old format rule, always delete it
            if (!createdMatch) {
                const ruleId = route.tag || route.id;
                const emailMatch = route.name.match(/TempMail:\s*([^\s|]+)/);
                const tempEmail = emailMatch ? emailMatch[1] : null;
                try {
                    await deleteEmailRoute(ruleId);
                    deletedCount++;
                    console.log(`🗑️ Auto-deleted old rule: ${tempEmail || ruleId} (no timestamp)`);
                } catch (e) { console.error(`❌ Failed to delete ${ruleId}:`, e.message); }
                continue;
            }

            const createdAt = new Date(createdMatch[1].trim());
            const ageMinutes = (now - createdAt) / (1000 * 60);

            if (ageMinutes >= EXPIRY_MINUTES) {
                const ruleId = route.tag || route.id;
                const emailMatch = route.name.match(/TempMail:\s*([^\s|]+)/);
                const tempEmail = emailMatch ? emailMatch[1] : null;

                try {
                    await deleteEmailRoute(ruleId);
                    deletedCount++;
                    console.log(`🗑️ Auto-deleted: ${tempEmail || ruleId} (${Math.round(ageMinutes)}min old)`);

                    // Trash Gmail messages
                    if (tempEmail) {
                        try {
                            const gmail = getGmail();
                            const res = await gmail.users.messages.list({ userId: 'me', q: `to:${tempEmail}`, maxResults: 50 });
                            for (const msg of (res.data.messages || [])) {
                                await gmail.users.messages.trash({ userId: 'me', id: msg.id }).catch(() => { });
                            }
                        } catch (e) { /* ignore gmail errors */ }
                    }
                } catch (e) {
                    console.error(`❌ Failed to delete ${ruleId}:`, e.message);
                }
            }
        }

        if (deletedCount > 0) {
            console.log(`🧹 Cleanup: ${deletedCount} expired rules deleted`);
        }
    } catch (e) {
        console.error('⚠️ Cleanup error (non-fatal):', e.message);
    }
}

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Verify reCAPTCHA v2 token
    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
    if (recaptchaSecret) {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const recaptchaToken = body.recaptchaToken;

        if (!recaptchaToken) {
            return res.status(400).json({ success: false, error: 'Please complete the reCAPTCHA' });
        }

        try {
            const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `secret=${recaptchaSecret}&response=${recaptchaToken}`,
            });
            const verifyData = await verifyRes.json();

            if (!verifyData.success) {
                console.warn('🤖 reCAPTCHA failed:', verifyData['error-codes']);
                return res.status(403).json({ success: false, error: 'reCAPTCHA verification failed. Please try again.' });
            }
        } catch (e) {
            console.error('reCAPTCHA verify error:', e.message);
        }
    }

    // Run cleanup of expired rules
    await cleanupExpiredRules();

    const domain = process.env.EMAIL_DOMAIN || 'yourdomain.com';
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 9000) + 1000;
    const email = `${adj}.${noun}${num}@${domain}`;

    try {
        const createdAt = new Date().toISOString();
        const routeResult = await createEmailRoute(email, createdAt);

        console.log(`✅ Created Cloudflare route for: ${email} (rule ID: ${routeResult.tag || routeResult.id})`);

        res.status(200).json({
            success: true,
            email,
            domain,
            routeId: routeResult.tag || routeResult.id,
            createdAt,
            expiresIn: '30 minutes'
        });
    } catch (error) {
        console.error(`❌ Failed to create Cloudflare route for ${email}:`, error.message);

        res.status(500).json({
            success: false,
            error: 'Failed to create email route in Cloudflare',
            details: error.message
        });
    }
};
