import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface NotificationPayload {
  recipientId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: 'default';
  badge?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    const jwt = authHeader?.replace('Bearer ', '');
    if (!jwt) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    }

    const payload = await req.json() as NotificationPayload;
    const { recipientId, title, body, data } = payload;

    if (!recipientId || !title || !body) {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400 });
    }

    // Fetch all push tokens for the recipient
    const { data: tokenRows, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', recipientId);

    if (tokensError) {
      console.error('[send-notification] token fetch error:', tokensError);
      return new Response(JSON.stringify({ error: 'token_fetch_failed' }), { status: 500 });
    }

    const tokens = (tokenRows ?? []).map((r: { token: string }) => r.token).filter(Boolean);
    if (tokens.length === 0) {
      // Recipient has no registered device — not an error
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    // Build one message per token (Expo batch API accepts an array)
    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default',
    }));

    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!expoRes.ok) {
      const errText = await expoRes.text();
      console.error('[send-notification] Expo API error:', errText);
      return new Response(JSON.stringify({ error: 'expo_api_failed' }), { status: 502 });
    }

    const result = await expoRes.json();
    console.log('[send-notification] sent to', tokens.length, 'token(s):', JSON.stringify(result));
    return new Response(JSON.stringify({ sent: tokens.length }), { status: 200 });
  } catch (err) {
    console.error('[send-notification] unexpected error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
