import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import { URL } from 'url';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const CREDENTIALS_PATH = './credentials.json';

function loadDesktopCredentials() {
  const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const json = JSON.parse(raw);

  // Desktop app credentials are usually under "installed"
  const cfg = json.installed || json.web;
  if (!cfg) {
    throw new Error(
      'credentials.json is invalid. Expected "installed" or "web" key.'
    );
  }

  return {
    clientId: cfg.client_id,
    clientSecret: cfg.client_secret,
  };
}

async function getRefreshToken() {
  const { clientId, clientSecret } = loadDesktopCredentials();

  // Random free local port
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });

  const { port } = server.address();
  const redirectUri = `http://127.0.0.1:${port}`;

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nWaiting for Google callback...\n');

  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for OAuth callback.'));
    }, 180000);

    server.on('request', (req, res) => {
      try {
        const reqUrl = new URL(req.url, redirectUri);
        const authCode = reqUrl.searchParams.get('code');
        const authError = reqUrl.searchParams.get('error');

        if (authError) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end(`Authentication failed: ${authError}`);
          clearTimeout(timeout);
          reject(new Error(`Authentication failed: ${authError}`));
          return;
        }

        if (!authCode) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code in callback.');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Authentication successful. You can close this tab.');

        clearTimeout(timeout);
        resolve(authCode);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }).finally(() => {
    server.close();
  });

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token returned. Revoke prior access for this app in your Google Account and run again.'
    );
  }

  console.log('\nGMAIL_REFRESH_TOKEN=' + tokens.refresh_token + '\n');
}

getRefreshToken().catch((err) => {
  console.error('\nAuth failed:\n', err.message || err);
  process.exit(1);
});
