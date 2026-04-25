import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type NotificationType = 'new_share' | 'new_follower';

const ALLOWED_TYPES: NotificationType[] = ['new_share', 'new_follower'];

interface NotificationRequest {
  notification_type: NotificationType;
  recipient_id: string;
  shared_item_id?: string;
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
    const callerId = user.id;

    const payload = await req.json() as NotificationRequest;
    const { notification_type, recipient_id, shared_item_id } = payload;

    // Validate notification type against allowlist
    if (!notification_type || !ALLOWED_TYPES.includes(notification_type)) {
      return new Response(JSON.stringify({ error: 'invalid_notification_type' }), { status: 400 });
    }

    if (!recipient_id) {
      return new Response(JSON.stringify({ error: 'missing recipient_id' }), { status: 400 });
    }

    // ── Authorization + server-generated notification content ─────────────────
    let title: string;
    let body: string;
    let data: Record<string, unknown>;

    if (notification_type === 'new_share') {
      if (!shared_item_id) {
        return new Response(JSON.stringify({ error: 'shared_item_id required for new_share' }), { status: 400 });
      }

      // Verify the caller is the sender of this shared item and recipient matches
      const { data: item, error: itemError } = await supabase
        .from('shared_items')
        .select('id, sender_id, recipient_id, type, title')
        .eq('id', shared_item_id)
        .single();

      if (itemError || !item) {
        return new Response(JSON.stringify({ error: 'shared_item_not_found' }), { status: 404 });
      }
      if (item.sender_id !== callerId) {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
      }
      if (item.recipient_id !== recipient_id) {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
      }

      // Fetch sender's display name for the notification
      const { data: sender } = await supabase
        .from('users')
        .select('display_name, username')
        .eq('id', callerId)
        .single();
      const senderName = sender?.display_name ?? sender?.username ?? 'Someone';
      const itemKind = item.type === 'playlist' ? 'a playlist' : 'a song';

      title = `${senderName} shared ${itemKind}`;
      body = item.title;
      data = { type: 'new_share', shared_item_id };

    } else {
      // new_follower — verify the caller actually follows the recipient
      const { data: followRow, error: followError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', callerId)
        .eq('following_id', recipient_id)
        .maybeSingle();

      if (followError || !followRow) {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
      }

      const { data: follower } = await supabase
        .from('users')
        .select('display_name, username')
        .eq('id', callerId)
        .single();
      const followerName = follower?.display_name ?? follower?.username ?? 'Someone';

      title = 'New follower';
      body = `${followerName} started following you`;
      data = { type: 'new_follower' };
    }

    // Fetch all push tokens for the recipient
    const { data: tokenRows, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', recipient_id);

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
