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

module.exports = function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const domain = process.env.EMAIL_DOMAIN || 'yourdomain.com';
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 9000) + 1000;
    const email = `${adj}.${noun}${num}@${domain}`;

    res.status(200).json({
        success: true,
        email,
        domain,
        createdAt: new Date().toISOString(),
        expiresIn: '1 hour'
    });
};
