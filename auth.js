const SUPABASE_URL = 'https://ygnphizpnhcsblmwzmzj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnbnBoaXpwbmhjc2JsbXd6bXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzUyNjAsImV4cCI6MjA5MjAxMTI2MH0.hLhpjB5WUDzZX1MRIPVzPVFgq8mcHmnhkhWreAjEFXI';

if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
var supabase = window.supabaseClient;

let usuarioAtual = null;
let perfilAtual = null;

// Verifica se já está logado ao abrir a página
window.onload = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await carregarPerfil(session.user);
    }
};

async function realizarLogin() {
    const email = document.getElementById('login-email').value;
    const senha = document.getElementById('login-senha').value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
        alert('Erro ao logar: ' + error.message);
    } else {
        await carregarPerfil(data.user);
    }
}

// Função para detectar a tecla ENTER no campo de senha
function verificarEnter(event) {
    if (event.key === "Enter") {
        realizarLogin();
    }
}

// Função ÚNICA e corrigida para carregar o perfil e montar a tela
async function carregarPerfil(user) {
    usuarioAtual = user;
    
    try {
        const { data: perfil, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        if (perfil) {
            perfilAtual = perfil;
            document.getElementById('user-name').innerText = `Olá, ${perfil.nome}`;
            document.getElementById('user-role').innerText = perfil.role.toUpperCase();
            
            const loginContainer = document.getElementById('login-container');
            const appWrapper = document.getElementById('app-wrapper');

            // Verifica se os elementos existem antes de tentar mudar as classes (Evita erro de classList)
            if (loginContainer && appWrapper) {
                // MUDANÇA DE BACKGROUND: Tira a imagem e coloca a cor do app
                document.body.classList.remove('login-bg');
                document.body.classList.add('app-bg');
                
                // Esconde login e mostra o App
                loginContainer.classList.add('hidden');
                appWrapper.classList.remove('hidden');
            } else {
                console.error("Erro: 'login-container' ou 'app-wrapper' não encontrados no HTML.");
            }

            // Se for Admin, mostra a aba Admin
            const btnAdmin = document.getElementById('btn-admin');
            if (btnAdmin && perfil.role === 'admin') {
                btnAdmin.classList.remove('hidden');
            }
            
            // Inicializa dados das abas (chaves, etc)
            if (typeof carregarSelectChaves === 'function') {
                carregarSelectChaves();
            }
        }
    } catch (err) {
        console.error("Erro ao processar o perfil:", err);
    }
}

async function fazerLogout() {
    await supabase.auth.signOut();
    window.location.reload();
}
