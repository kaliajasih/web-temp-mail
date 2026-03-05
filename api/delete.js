const { deleteEmailRoute } = require('./_lib/cloudflare');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { routeId } = req.query;

    if (!routeId) {
        return res.status(400).json({ success: false, error: 'routeId parameter is required' });
    }

    try {
        await deleteEmailRoute(routeId);

        console.log(`🗑️ Deleted Cloudflare route: ${routeId}`);

        res.status(200).json({
            success: true,
            message: 'Email route deleted successfully',
            deletedRouteId: routeId,
        });
    } catch (error) {
        console.error(`❌ Failed to delete route ${routeId}:`, error.message);

        res.status(500).json({
            success: false,
            error: 'Failed to delete email route',
            details: error.message,
        });
    }
};
