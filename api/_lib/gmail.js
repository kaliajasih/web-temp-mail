const { google } = require('googleapis');

let cachedAuth = null;

function getAuth() {
    if (cachedAuth) return cachedAuth;

    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    cachedAuth = oauth2Client;
    return oauth2Client;
}

function getGmail() {
    return google.gmail({ version: 'v1', auth: getAuth() });
}

module.exports = { getAuth, getGmail };
