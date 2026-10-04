import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const allowedOrigin = 'https://h6r1c0.github.io';
const headers = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Content-Type': 'application/json',
};
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.headers.get('origin') !== allowedOrigin) return reply(403, { error: '利用元を確認してください' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: 'ログインしてください' });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anonKey || !serviceKey) return reply(503, { error: '招待機能の設定が必要です' });
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userResult, error: identityError } = await asUser.auth.getUser(token);
  if (identityError || !userResult.user) return reply(401, { error: 'ログイン状態を確認してください' });
  const { data: isAdmin, error: roleError } = await asUser.rpc('wappan_admin_is_admin');
  if (roleError || isAdmin !== true) return reply(403, { error: '管理者のみ操作できます' });
  let email: string;
  try {
    const body = await req.json();
    email = String(body.email ?? '').trim().toLowerCase();
  } catch { return reply(400, { error: 'メールアドレスを確認してください' }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply(400, { error: 'メールアドレスを確認してください' });
  // Existing Auth accounts can be registered without sending a duplicate invite.
  let registered = await asUser.rpc('wappan_admin_register_email', { email_arg: email });
  if (!registered.error) return reply(200, { result: registered.data });
  if (!registered.error.message.includes('AUTH_USER_NOT_FOUND')) return reply(400, { error: '係を登録できませんでした' });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${allowedOrigin}/wappan_order/`,
  });
  if (inviteError) return reply(400, { error: '招待メールを送れませんでした。メールアドレスと送信設定を確認してください' });
  registered = await asUser.rpc('wappan_admin_register_email', { email_arg: email });
  if (registered.error) return reply(500, { error: '招待メールを送りましたが係登録を完了できませんでした。管理者が再度「招待」を押してください' });
  return reply(200, { result: registered.data });
});
