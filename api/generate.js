const { createEmailRoute, getDomainConfigs } = require('./_lib/cloudflare');

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

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Get domain from query or use first available domain
    let domain = req.query.domain;
    try {
        const configs = getDomainConfigs();
        if (!domain) {
            domain = configs[0].domain;
        } else {
            // Validate that the requested domain exists
            const valid = configs.find(c => c.domain === domain);
            if (!valid) {
                return res.status(400).json({
                    success: false,
                    error: `Domain "${domain}" is not configured. Available: ${configs.map(c => c.domain).join(', ')}`,
                });
            }
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Domain configuration error',
            details: error.message,
        });
    }

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 9000) + 1000;
    const email = `${adj}.${noun}${num}@${domain}`;

    try {
        const routeResult = await createEmailRoute(email, domain);

        console.log(`✅ Created Cloudflare route for: ${email} (rule ID: ${routeResult.tag || routeResult.id})`);

        res.status(200).json({
            success: true,
            email,
            domain,
            routeId: routeResult.tag || routeResult.id,
            createdAt: routeResult.createdAt,
            expiresIn: '40 minutes',
        });
    } catch (error) {
        console.error(`❌ Failed to create Cloudflare route for ${email}:`, error.message);

        res.status(500).json({
            success: false,
            error: 'Failed to create email route in Cloudflare',
            details: error.message,
        });
    }
};
