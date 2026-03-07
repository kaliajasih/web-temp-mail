/**
 * Cloudflare Email Routing API Helper
 * Supports multiple domains via numbered env vars:
 *   EMAIL_DOMAIN_1, EMAIL_ZONE_1, EMAIL_DOMAIN_2, EMAIL_ZONE_2, ...
 * Falls back to single domain: EMAIL_DOMAIN + CLOUDFLARE_ZONE_ID
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Get all domain configurations from env vars
 * @returns {Array<{domain: string, zoneId: string}>}
 */
function getDomainConfigs() {
    const configs = [];

    // Check numbered env vars: EMAIL_DOMAIN_1, EMAIL_ZONE_1, etc.
    for (let i = 1; i <= 20; i++) {
        const domain = process.env[`EMAIL_DOMAIN_${i}`];
        const zoneId = process.env[`EMAIL_ZONE_${i}`];
        if (domain && zoneId) {
            configs.push({ domain, zoneId });
        }
    }

    // Fallback to single domain
    if (configs.length === 0) {
        const domain = process.env.EMAIL_DOMAIN;
        const zoneId = process.env.CLOUDFLARE_ZONE_ID;
        if (domain && zoneId) {
            configs.push({ domain, zoneId });
        }
    }

    return configs;
}

/**
 * Pick a random domain config
 */
function getRandomDomainConfig() {
    const configs = getDomainConfigs();
    if (configs.length === 0) {
        throw new Error('No email domains configured. Set EMAIL_DOMAIN_1 + EMAIL_ZONE_1 in env vars.');
    }
    return configs[Math.floor(Math.random() * configs.length)];
}

/**
 * Create an email routing rule in Cloudflare
 * @param {string} tempEmail
 * @param {string} zoneId - Zone ID for the domain
 * @param {string} createdAt - ISO timestamp
 */
async function createEmailRoute(tempEmail, zoneId, createdAt) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const destinationEmail = process.env.GMAIL_ADDRESS;

    if (!apiToken || !zoneId || !destinationEmail) {
        throw new Error('Missing Cloudflare credentials (CLOUDFLARE_API_TOKEN, zoneId, or GMAIL_ADDRESS)');
    }

    const response = await fetch(`${CF_API_BASE}/zones/${zoneId}/email/routing/rules`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            actions: [{ type: 'forward', value: [destinationEmail] }],
            enabled: true,
            matchers: [{ field: 'to', type: 'literal', value: tempEmail }],
            name: `TempMail: ${tempEmail} | Zone: ${zoneId} | Created: ${createdAt || new Date().toISOString()}`,
            priority: 0,
        }),
    });

    const data = await response.json();
    if (!data.success) {
        const errorMsg = data.errors?.map((e) => e.message).join(', ') || 'Unknown error';
        throw new Error(`Cloudflare API error: ${errorMsg}`);
    }
    return data.result;
}

/**
 * Delete an email routing rule by ID
 * @param {string} ruleId
 * @param {string} zoneId - Zone ID where the rule lives
 */
async function deleteEmailRoute(ruleId, zoneId) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    // If no zoneId provided, try all zones
    if (!zoneId) {
        const configs = getDomainConfigs();
        for (const config of configs) {
            try {
                const result = await deleteEmailRoute(ruleId, config.zoneId);
                if (result) return true;
            } catch (e) { /* try next zone */ }
        }
        throw new Error(`Rule ${ruleId} not found in any zone`);
    }

    const response = await fetch(`${CF_API_BASE}/zones/${zoneId}/email/routing/rules/${ruleId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
    });

    const data = await response.json();
    if (!data.success) {
        const errorMsg = data.errors?.map((e) => e.message).join(', ') || 'Unknown error';
        throw new Error(`Cloudflare API error: ${errorMsg}`);
    }
    return data.success;
}

/**
 * List all email routing rules across ALL configured zones
 */
async function listAllEmailRoutes() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const configs = getDomainConfigs();
    const allRoutes = [];

    for (const config of configs) {
        try {
            const response = await fetch(`${CF_API_BASE}/zones/${config.zoneId}/email/routing/rules?per_page=50`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (data.success && data.result) {
                // Tag each route with its zoneId for deletion
                for (const route of data.result) {
                    route._zoneId = config.zoneId;
                }
                allRoutes.push(...data.result);
            }
        } catch (e) {
            console.error(`Failed to list routes for zone ${config.zoneId}:`, e.message);
        }
    }

    return allRoutes;
}

module.exports = {
    getDomainConfigs,
    getRandomDomainConfig,
    createEmailRoute,
    deleteEmailRoute,
    listAllEmailRoutes,
};
