/**
 * Cloudflare Email Routing API Helper
 * Creates and manages email routing rules via Cloudflare API
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Create an email routing rule in Cloudflare
 * This forwards emails sent to a specific address to the destination Gmail
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

/**
 * Check if the destination email is already verified
 */
async function checkDestinationVerified() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const destinationEmail = process.env.GMAIL_ADDRESS;

    if (!accountId) {
        // If no account ID, skip verification check
        return true;
    }

    const response = await fetch(`${CF_API_BASE}/accounts/${accountId}/email/routing/addresses`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
    });

    const data = await response.json();

    if (!data.success) return false;

    const addresses = data.result || [];
    return addresses.some(
        (addr) => addr.email === destinationEmail && addr.verified
    );
}

module.exports = {
    createEmailRoute,
    deleteEmailRoute,
    listEmailRoutes,
    checkDestinationVerified,
};
