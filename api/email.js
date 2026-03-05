const { getGmail } = require('./_lib/gmail');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ success: false, error: 'Email ID parameter is required' });
    }

    try {
        const gmail = getGmail();

        const detail = await gmail.users.messages.get({
            userId: 'me',
            id: id,
            format: 'full',
        });

        const headers = detail.data.payload.headers;
        const getHeader = (name) => {
            const header = headers.find(
                (h) => h.name.toLowerCase() === name.toLowerCase()
            );
            return header ? header.value : '';
        };

        // Extract email body
        let htmlBody = '';
        let textBody = '';

        function extractBody(payload) {
            if (payload.mimeType === 'text/html' && payload.body?.data) {
                htmlBody = Buffer.from(payload.body.data, 'base64').toString('utf-8');
            }
            if (payload.mimeType === 'text/plain' && payload.body?.data) {
                textBody = Buffer.from(payload.body.data, 'base64').toString('utf-8');
            }
            if (payload.parts) {
                payload.parts.forEach(extractBody);
            }
        }

        extractBody(detail.data.payload);

        // If no HTML body found, try the main body
        if (!htmlBody && !textBody && detail.data.payload.body?.data) {
            const decoded = Buffer.from(detail.data.payload.body.data, 'base64').toString('utf-8');
            if (detail.data.payload.mimeType === 'text/html') {
                htmlBody = decoded;
            } else {
                textBody = decoded;
            }
        }

        // Extract attachments info
        const attachments = [];
        function extractAttachments(payload) {
            if (payload.filename && payload.body?.attachmentId) {
                attachments.push({
                    filename: payload.filename,
                    mimeType: payload.mimeType,
                    size: payload.body.size,
                    attachmentId: payload.body.attachmentId,
                });
            }
            if (payload.parts) {
                payload.parts.forEach(extractAttachments);
            }
        }
        extractAttachments(detail.data.payload);

        res.status(200).json({
            success: true,
            email: {
                id: detail.data.id,
                from: getHeader('From'),
                to: getHeader('To'),
                subject: getHeader('Subject') || '(No Subject)',
                date: getHeader('Date'),
                htmlBody,
                textBody,
                attachments,
                snippet: detail.data.snippet,
            },
        });
    } catch (error) {
        console.error('Error fetching email:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch email',
            details: error.message,
        });
    }
};
