import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeRole(role: unknown) {
  return String(role || '').trim().toLowerCase();
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const payload = error as Record<string, unknown>;
    const parts = [payload.message, payload.details, payload.hint, payload.code]
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => String(value).trim());
    if (parts.length) return parts.join(' | ');
    try {
      return JSON.stringify(payload);
    } catch (_) {
      return 'Erro interno.';
    }
  }
  return String(error || 'Erro interno.');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    if (!supabaseUrl || !serviceKey || !authorization) return json({ error: 'Não autorizado.' }, 401);

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const token = authorization.replace(/^Bearer\s+/i, '');
    const userScopedClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) return json({ error: 'Sessão inválida.' }, 401);

    const { data: requester } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (normalizeRole(requester?.role) !== 'admin') return json({ error: 'Acesso restrito a administradores.' }, 403);

    const body = await request.json();
    const { action, userId } = body;

    if (action === 'create') {
      if (!body.email || !body.password || !body.nome || !body.turno) return json({ error: 'Dados obrigatórios ausentes.' }, 400);
      const role = normalizeRole(body.role) === 'admin' ? 'admin' : 'operacional';
      const { data, error } = await adminClient.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
      });
      if (error) throw error;

      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: data.user.id,
        email: body.email,
        nome: body.nome,
        turno: body.turno,
        celular: body.celular || null,
        cpf: body.cpf || null,
        role,
      });
      if (profileError) {
        await adminClient.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
      return json({ userId: data.user.id }, 201);
    }

    if (!userId) return json({ error: 'Usuário não informado.' }, 400);
    if (userId === user.id && (action === 'delete' || (action === 'set-role' && normalizeRole(body.role) !== 'admin'))) {
      return json({ error: 'Um administrador não pode remover o próprio acesso.' }, 400);
    }

    if (action === 'set-role') {
      const role = normalizeRole(body.role);
      if (!['admin', 'operacional'].includes(role)) return json({ error: 'Perfil inválido.' }, 400);
      const { data: updatedProfile, error } = await userScopedClient
        .from('profiles')
        .update({ role })
        .eq('id', userId)
        .select('id, role')
        .maybeSingle();
      if (error) return json({ error: formatError(error) }, 500);
      if (!updatedProfile) return json({ error: 'Perfil do usuário não encontrado para atualizar.' }, 404);
      return json({ ok: true, role: updatedProfile.role });
    }

    if (action === 'update-profile') {
      const profile = { nome: body.nome, turno: body.turno, celular: body.celular || null, cpf: body.cpf || null, email: body.email };
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, { email: body.email });
      if (authError) throw authError;
      const { error } = await adminClient.from('profiles').update(profile).eq('id', userId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'reset-password') {
      if (typeof body.password !== 'string' || body.password.length < 8) return json({ error: 'A senha deve ter ao menos 8 caracteres.' }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: body.password });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'delete') {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    const message = formatError(error);
    console.error('admin-users failed:', message, error);
    return json({ error: message }, 500);
  }
});
