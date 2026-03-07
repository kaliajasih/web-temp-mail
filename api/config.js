/**
 * Config endpoint - returns public configuration like reCAPTCHA site key
 */
module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    res.status(200).json({
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || '',
    });
};
