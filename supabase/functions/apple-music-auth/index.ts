const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const TOKEN_TTL_SECONDS = 60 * 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function createDeveloperToken(): Promise<{ token: string; expiresAt: number }> {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');

  if (!teamId || !keyId || !privateKey) {
    throw new Error('missing_apple_music_secrets');
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_SECONDS;
  const signingInput = [
    base64UrlJson({ alg: 'ES256', kid: keyId, typ: 'JWT' }),
    base64UrlJson({ iss: teamId, iat: now, exp: expiresAt }),
  ].join('.');

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey.replace(/\\n/g, '\n')),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  return {
    token: `${signingInput}.${base64Url(new Uint8Array(signature))}`,
    expiresAt,
  };
}

function htmlPage(): string {
  const appName = 'MusicBridge';
  const callbackUrl = 'musicbridge://apple-music-callback';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${appName} Apple Music</title>
  <style>
    body { background: #111; color: #fff; font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    main { max-width: 320px; padding: 32px; text-align: center; }
    p { color: #bbb; line-height: 1.4; }
  </style>
  <script src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"></script>
</head>
<body>
  <main>
    <h1>Connecting Apple Music...</h1>
    <p id="status">A secure Apple Music authorization window should appear.</p>
  </main>
  <script>
    const statusEl = document.getElementById('status');
    function setStatus(message) { statusEl.textContent = message; }

    document.addEventListener('musickitloaded', async () => {
      try {
        const tokenResponse = await fetch(window.location.pathname + '?token=1');
        if (!tokenResponse.ok) throw new Error('Could not create developer token');
        const { token } = await tokenResponse.json();

        await MusicKit.configure({
          developerToken: token,
          app: { name: '${appName}', build: '1.0.0' },
        });

        const music = MusicKit.getInstance();
        const userToken = await music.authorize();
        window.location.href = '${callbackUrl}?token=' + encodeURIComponent(userToken);
      } catch (error) {
        console.error(error);
        setStatus('Apple Music authorization failed. Close this page and try again.');
      }
    });
  </script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  if (req.method === 'GET' && !url.searchParams.has('token')) {
    return new Response(htmlPage(), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      },
    });
  }

  try {
    const token = await createDeveloperToken();
    return json(token);
  } catch (err) {
    console.error('[apple-music-auth] token error:', err);
    return json({ error: 'apple_music_token_failed' }, 500);
  }
});
