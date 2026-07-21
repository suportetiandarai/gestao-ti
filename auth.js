const SUPABASE_URL = 'https://ditygnxttjvlfrdpvaxe.supabase.co';
const SUPABASE_PUBLIC_KEY = window.GESTAO_TI_CONFIG?.SUPABASE_PUBLIC_KEY || '';
const PERFIS_VALIDOS = Object.freeze(['admin', 'gestor', 'supervisor', 'tecnico', 'operacional']);

function chavePublicaValida(chave) {
    if (!chave) return false;
    if (chave.startsWith('sb_publishable_')) return true;

    try {
        const payload = JSON.parse(atob(chave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.role === 'anon';
    } catch (_) {
        return false;
    }
}

const SUPABASE_CONFIGURADO = chavePublicaValida(SUPABASE_PUBLIC_KEY);
window.supabaseClient = SUPABASE_CONFIGURADO
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY)
    : null;
var supabase = window.supabaseClient;
window.usuarioAtual = null;
window.perfilAtual = null;
let recuperandoSenha = false;

function aplicarLayout(estado) {
    const autenticado = estado === 'autenticado';
    const loginContainer = document.getElementById('login-container');
    const appWrapper = document.getElementById('app-wrapper');

    document.body.classList.toggle('login-bg', !autenticado);
    document.body.classList.toggle('app-bg', autenticado);
    document.body.dataset.authState = estado;

    loginContainer?.classList.toggle('hidden', autenticado);
    appWrapper?.classList.toggle('hidden', !autenticado);
}

function normalizarRole(role) {
    return String(role || '').trim().toLowerCase();
}

window.temPermissao = function(roleNecessaria) {
    const roleAtual = normalizarRole(window.perfilAtual?.role);
    return roleNecessaria === 'admin' ? roleAtual === 'admin' : PERFIS_VALIDOS.includes(roleAtual);
};

window.exigirAdmin = function() {
    if (window.temPermissao('admin')) return true;
    mostrarAviso('Você não possui permissão para acessar esta funcionalidade.', 'erro');
    if (typeof abrirAba === 'function') abrirAba('aba-inicio');
    return false;
};

function aplicarPermissoes(perfil) {
    const isAdmin = perfil.role === 'admin';
    document.querySelectorAll('[data-role="admin"]').forEach(elemento => {
        elemento.classList.toggle('hidden', !isAdmin);
    });

    // Configurações pessoais pertencem aos dois perfis.
    document.getElementById('btn-config')?.classList.remove('hidden');
    document.getElementById('btn-admin')?.classList.toggle('hidden', !isAdmin);
}

async function carregarPerfil(user) {
    const { data: perfil, error } = await supabase
        .from('profiles')
        .select('id, nome, email, celular, cpf, turno, role')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error('Falha ao consultar profiles:', error.code, error.message);
        if (error.code === 'PGRST116') {
            throw new Error('Seu login foi aceito, mas o perfil está bloqueado pelas permissões do banco. Contate um administrador.');
        }
        throw new Error(`Não foi possível acessar seu perfil (${error.code || 'erro de permissão'}).`);
    }
    if (!perfil) throw new Error('Perfil de acesso não encontrado. Contate um administrador.');

    perfil.role = normalizarRole(perfil.role);
    if (!PERFIS_VALIDOS.includes(perfil.role)) {
        throw new Error('Perfil sem nível de acesso válido. Contate um administrador.');
    }

    window.usuarioAtual = perfil;
    window.perfilAtual = perfil;

    const primeiroNome = (perfil.nome || user.email || 'Usuário').trim().split(/\s+/)[0];
    document.getElementById('user-name').textContent = `Olá, ${primeiroNome}`;
    document.getElementById('user-role').textContent = perfil.role.toUpperCase();
    aplicarPermissoes(perfil);
    aplicarLayout('autenticado');

    const abaSolicitada = window.location.hash.slice(1) || 'aba-inicio';
    if (typeof abrirAba === 'function') abrirAba(abaSolicitada);
    if (typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
    resetarTimerInatividade?.();
}

async function sincronizarSessao(session) {
    if (recuperandoSenha) return;
    if (!session?.user) {
        window.usuarioAtual = null;
        window.perfilAtual = null;
        aplicarLayout('anonimo');
        return;
    }

    try {
        await carregarPerfil(session.user);
    } catch (error) {
        console.error('Falha ao carregar perfil:', error);
        await supabase.auth.signOut();
        aplicarLayout('anonimo');
        mostrarAviso(error.message, 'erro');
    }
}

async function realizarLogin() {
    if (!SUPABASE_CONFIGURADO) return mostrarAviso('Configure a chave pública do Supabase em config.js.', 'erro');
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const botao = document.getElementById('btn-login');

    if (!email || !senha) return mostrarAviso('Informe e-mail e senha.', 'aviso');

    botao.disabled = true;
    botao.textContent = 'Entrando...';

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        await carregarPerfil(data.user);
    } catch (error) {
        await supabase.auth.signOut();
        const mensagem = error.message === 'Invalid login credentials'
            ? 'E-mail ou senha incorretos. Confira os dados ou use “Esqueci minha senha”.'
            : `Não foi possível entrar: ${error.message}`;
        mostrarAviso(mensagem, 'erro');
    } finally {
        botao.disabled = false;
        botao.textContent = 'Entrar';
    }
}

async function solicitarRedefinicaoSenha() {
    if (!SUPABASE_CONFIGURADO) return mostrarAviso('Supabase não configurado.', 'erro');
    const email = document.getElementById('login-email').value.trim();
    if (!email) return mostrarAviso('Informe seu e-mail corporativo primeiro.', 'aviso');

    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return mostrarAviso(`Não foi possível enviar a recuperação: ${error.message}`, 'erro');

    mostrarAviso('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.', 'sucesso');
}

function mostrarRecuperacaoSenha() {
    recuperandoSenha = true;
    window.usuarioAtual = null;
    window.perfilAtual = null;
    aplicarLayout('anonimo');
    document.getElementById('login-email')?.classList.add('hidden');
    document.getElementById('login-senha')?.classList.add('hidden');
    document.getElementById('btn-login')?.classList.add('hidden');
    document.getElementById('btn-esqueci-senha')?.classList.add('hidden');
    document.getElementById('recuperacao-senha')?.classList.remove('hidden');
}

function parametrosAuthUrl() {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    hash.forEach((value, key) => params.set(key, value));
    return params;
}

function urlIndicaRecuperacaoSenha() {
    const params = parametrosAuthUrl();
    return params.get('type') === 'recovery'
        || params.get('recovery') === 'true'
        || params.has('token_hash')
        || (params.has('access_token') && params.has('refresh_token'))
        || params.has('code');
}

async function prepararSessaoRecuperacaoSenha() {
    if (!SUPABASE_CONFIGURADO || !urlIndicaRecuperacaoSenha()) return false;

    recuperandoSenha = true;
    const params = parametrosAuthUrl();

    try {
        if (params.has('code')) {
            const { error } = await supabase.auth.exchangeCodeForSession(params.get('code'));
            if (error) throw error;
        } else if (params.has('access_token') && params.has('refresh_token')) {
            const { error } = await supabase.auth.setSession({
                access_token: params.get('access_token'),
                refresh_token: params.get('refresh_token')
            });
            if (error) throw error;
        } else if (params.has('token_hash')) {
            const { error } = await supabase.auth.verifyOtp({
                token_hash: params.get('token_hash'),
                type: 'recovery'
            });
            if (error) throw error;
        }

        mostrarRecuperacaoSenha();
        window.history.replaceState({}, document.title, `${window.location.origin}${window.location.pathname}`);
        return true;
    } catch (error) {
        console.error('Falha ao preparar recuperação de senha:', error);
        await supabase.auth.signOut();
        recuperandoSenha = false;
        aplicarLayout('anonimo');
        mostrarAviso('Link de recuperação inválido ou expirado. Solicite um novo link.', 'erro');
        window.history.replaceState({}, document.title, `${window.location.origin}${window.location.pathname}`);
        return true;
    }
}

async function salvarSenhaRecuperada() {
    const senha = document.getElementById('recuperacao-nova-senha').value;
    const confirmacao = document.getElementById('recuperacao-confirmar-senha').value;
    if (senha.length < 8) return mostrarAviso('A senha deve ter no mínimo 8 caracteres.', 'aviso');
    if (senha !== confirmacao) return mostrarAviso('As senhas não coincidem.', 'aviso');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        return mostrarAviso('Sua sessão de recuperação expirou. Solicite um novo link de redefinição.', 'erro');
    }

    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return mostrarAviso(`Não foi possível atualizar a senha: ${error.message}`, 'erro');

    await supabase.auth.signOut();
    recuperandoSenha = false;
    window.location.replace(`${window.location.origin}${window.location.pathname}`);
}

function verificarEnter(event) {
    if (event.key === 'Enter') realizarLogin();
}

async function fazerLogout() {
    if (!SUPABASE_CONFIGURADO) return aplicarLayout('anonimo');
    await supabase.auth.signOut();
    window.location.hash = '';
    aplicarLayout('anonimo');
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!SUPABASE_CONFIGURADO) {
        aplicarLayout('anonimo');
        const botao = document.getElementById('btn-login');
        if (botao) botao.disabled = true;
        mostrarAviso('Servidor iniciado. Configure a chave pública do Supabase em config.js para testar o login.', 'aviso');
        return;
    }

    supabase.auth.onAuthStateChange((evento, sessao) => {
        if (evento === 'PASSWORD_RECOVERY') return mostrarRecuperacaoSenha();
        if (recuperandoSenha) return;
        if (evento === 'SIGNED_OUT') sincronizarSessao(null);
        if (evento === 'TOKEN_REFRESHED' && sessao) sincronizarSessao(sessao);
        if (evento === 'SIGNED_IN' && sessao) sincronizarSessao(sessao);
    });

    const fluxoRecuperacao = await prepararSessaoRecuperacaoSenha();
    if (fluxoRecuperacao) return;

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) console.error('Falha ao restaurar sessão:', error);
    await sincronizarSessao(session);
});

window.addEventListener('hashchange', () => {
    if (!window.perfilAtual || typeof abrirAba !== 'function') return;
    abrirAba(window.location.hash.slice(1) || 'aba-inicio', false);
});

window.realizarLogin = realizarLogin;
window.verificarEnter = verificarEnter;
window.fazerLogout = fazerLogout;
window.solicitarRedefinicaoSenha = solicitarRedefinicaoSenha;
window.salvarSenhaRecuperada = salvarSenhaRecuperada;
