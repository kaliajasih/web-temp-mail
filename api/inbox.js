const { getGmail } = require('./_lib/gmail');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ success: false, error: 'Email parameter is required' });
    }

    try {
        const gmail = getGmail();

        // Search for emails sent to this specific address
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: `to:${email}`,
            maxResults: 20,
        });

        const messages = response.data.messages || [];

        if (messages.length === 0) {
            return res.status(200).json({
                success: true,
                emails: [],
                total: 0,
            });
        }

        // Fetch details for each message
        const emailDetails = await Promise.all(
            messages.map(async (msg) => {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'metadata',
                    metadataHeaders: ['From', 'Subject', 'Date', 'To'],
                });

                const headers = detail.data.payload.headers;
                const getHeader = (name) => {
                    const header = headers.find(
                        (h) => h.name.toLowerCase() === name.toLowerCase()
                    );
                    return header ? header.value : '';
                };

                return {
                    id: msg.id,
                    from: getHeader('From'),
                    to: getHeader('To'),
                    subject: getHeader('Subject') || '(No Subject)',
                    date: getHeader('Date'),
                    snippet: detail.data.snippet,
                    isRead: !detail.data.labelIds?.includes('UNREAD'),
                };
            })
        );

        res.status(200).json({
            success: true,
            emails: emailDetails,
            total: emailDetails.length,
        });
    } catch (error) {
        console.error('Error fetching inbox:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch emails',
            details: error.message,
        });
    }
};
