/**
 * Cloudflare Email Routing API Helper
 * Creates and manages email routing rules via Cloudflare API
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Create an email routing rule in Cloudflare
 */
async function createEmailRoute(tempEmail) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const destinationEmail = process.env.GMAIL_ADDRESS;

    if (!apiToken || !zoneId || !destinationEmail) {
        throw new Error('Missing Cloudflare credentials (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, or GMAIL_ADDRESS)');
    }

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
            name: `TempMail: ${tempEmail}`,
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
 */
async function deleteEmailRoute(ruleId) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;

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
 * List all email routing rules
 */
async function listEmailRoutes() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;

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
    createEmailRoute,
    deleteEmailRoute,
    listEmailRoutes,
};
