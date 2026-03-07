/**
 * Cloudflare Email Routing API Helper
 * Supports multiple domains with individual zone IDs
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Parse domain configurations from environment variables
 * Supports both new multi-domain format and legacy single domain
 * @returns {Array<{domain: string, zoneId: string}>}
 */
function getDomainConfigs() {
    // Try new multi-domain format first
    const domainsJson = process.env.EMAIL_DOMAINS;
    if (domainsJson) {
        try {
            const domains = JSON.parse(domainsJson);
            if (Array.isArray(domains) && domains.length > 0) {
                return domains.map(d => ({
                    domain: d.domain,
                    zoneId: d.zoneId,
                }));
            }
        } catch (e) {
            console.error('Failed to parse EMAIL_DOMAINS:', e.message);
        }
    }

    // Fallback to legacy single domain
    const domain = process.env.EMAIL_DOMAIN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (domain && zoneId) {
        return [{ domain, zoneId }];
    }

    throw new Error('No domain configuration found. Set EMAIL_DOMAINS or EMAIL_DOMAIN + CLOUDFLARE_ZONE_ID');
}

/**
 * Get the zone ID for a specific domain
 * @param {string} domain
 * @returns {string} zoneId
 */
function getZoneIdForDomain(domain) {
    const configs = getDomainConfigs();
    const config = configs.find(c => c.domain === domain);
    if (!config) {
        throw new Error(`No zone ID found for domain: ${domain}. Available domains: ${configs.map(c => c.domain).join(', ')}`);
    }
    return config.zoneId;
}

/**
 * Create an email routing rule in Cloudflare
 * @param {string} tempEmail - The temporary email address
 * @param {string} [domain] - Optional domain override (extracted from email if not provided)
 */
async function createEmailRoute(tempEmail, domain) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const destinationEmail = process.env.GMAIL_ADDRESS;

    if (!apiToken || !destinationEmail) {
        throw new Error('Missing Cloudflare credentials (CLOUDFLARE_API_TOKEN or GMAIL_ADDRESS)');
    }

    // Extract domain from email if not explicitly provided
    if (!domain) {
        domain = tempEmail.split('@')[1];
    }

    const zoneId = getZoneIdForDomain(domain);
    const createdAt = new Date().toISOString();

    const response = await fetch(`${CF_API_BASE}/zones/${zoneId}/email/routing/rules`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            actions: [
                {
                    type: 'forward',
                    value: [destinationEmail],
                },
            ],
            enabled: true,
            matchers: [
                {
                    field: 'to',
                    type: 'literal',
                    value: tempEmail,
                },
            ],
            name: `TempMail: ${tempEmail} | Created: ${createdAt}`,
            priority: 0,
        }),
    });

    const data = await response.json();

    if (!data.success) {
        const errorMsg = data.errors?.map((e) => e.message).join(', ') || 'Unknown error';
        throw new Error(`Cloudflare API error: ${errorMsg}`);
    }

    return { ...data.result, createdAt };
}

/**
 * Delete an email routing rule by ID
 * @param {string} ruleId - The rule ID to delete
 * @param {string} [domain] - The domain to determine the correct zone
 * @param {string} [zoneId] - Direct zone ID override
 */
async function deleteEmailRoute(ruleId, domain, zoneId) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!zoneId) {
        if (domain) {
            zoneId = getZoneIdForDomain(domain);
        } else {
            // Fallback: try all zones to find the rule
            const configs = getDomainConfigs();
            for (const config of configs) {
                try {
                    const result = await deleteEmailRouteFromZone(ruleId, config.zoneId, apiToken);
                    return result;
                } catch (e) {
                    // Continue to next zone
                }
            }
            throw new Error(`Could not find rule ${ruleId} in any zone`);
        }
    }

    return deleteEmailRouteFromZone(ruleId, zoneId, apiToken);
}

/**
 * Internal helper to delete a route from a specific zone
 */
async function deleteEmailRouteFromZone(ruleId, zoneId, apiToken) {
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
 * List all email routing rules for a specific zone or all zones
 * @param {string} [zoneId] - Optional specific zone ID, if omitted lists from all zones
 * @returns {Array} List of routing rules with zone info
 */
async function listEmailRoutes(zoneId) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (zoneId) {
        return listEmailRoutesFromZone(zoneId, apiToken);
    }

    // List from all zones
    const configs = getDomainConfigs();
    const allRoutes = [];

    for (const config of configs) {
        try {
            const routes = await listEmailRoutesFromZone(config.zoneId, apiToken);
            allRoutes.push(...routes.map(r => ({ ...r, _domain: config.domain, _zoneId: config.zoneId })));
        } catch (e) {
            console.error(`Failed to list routes for zone ${config.zoneId} (${config.domain}):`, e.message);
        }
    }

    return allRoutes;
}

/**
 * Internal helper to list routes from a specific zone
 */
async function listEmailRoutesFromZone(zoneId, apiToken) {
    const response = await fetch(`${CF_API_BASE}/zones/${zoneId}/email/routing/rules?per_page=50`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error('Failed to list email routes');
    }

    return data.result || [];
}

module.exports = {
    getDomainConfigs,
    getZoneIdForDomain,
    createEmailRoute,
    deleteEmailRoute,
    listEmailRoutes,
};
