const { getDomainConfigs } = require('./_lib/cloudflare');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const configs = getDomainConfigs();
        const domains = configs.map(c => c.domain);

        res.status(200).json({
            success: true,
            domains,
            total: domains.length,
        });
    } catch (error) {
        console.error('Error fetching domains:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch available domains',
            details: error.message,
        });
    }
};
