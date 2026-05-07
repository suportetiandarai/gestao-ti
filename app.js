// ==========================================
// 🟢 SISTEMA DE AVISOS MODERNOS (TOASTS) E SUBSTITUIÇÃO DO ALERT NATIVO
// ==========================================

window.mostrarAviso = function(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;

    // Define o ícone e o título baseado no tipo
    let icone = '💡';
    let titulo = 'Informação';

    if (tipo === 'erro') { icone = '❌'; titulo = 'Ops, algo deu errado'; }
    else if (tipo === 'sucesso') { icone = '✅'; titulo = 'Sucesso'; }
    else if (tipo === 'aviso') { icone = '⚠️'; titulo = 'Atenção'; }

    toast.innerHTML = `
        <span class="toast-icon">${icone}</span>
        <div class="toast-content">
            <span class="toast-title">${titulo}</span>
            <span>${mensagem}</span>
        </div>
    `;

    container.appendChild(toast);

    // Some sozinho após 4.5 segundos
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4500);
};

// 🟢 O TRUQUE DE MESTRE: Intercepta todos os alert() antigos do sistema
window.alert = function(mensagem) {
    let tipo = 'info';
    let msgLimpa = mensagem;
    
    // O sistema é inteligente: ele lê a sua mensagem para saber se é erro ou sucesso!
    if (mensagem.toLowerCase().includes('erro') || mensagem.includes('❌')) {
        tipo = 'erro';
    } else if (mensagem.toLowerCase().includes('sucesso') || mensagem.includes('✅')) {
        tipo = 'sucesso';
    } else if (mensagem.toLowerCase().includes('atenção') || mensagem.includes('⚠️')) {
        tipo = 'aviso';
    }
    
    // Limpa os emojis que você colocava antes nos alertas para o novo card ficar limpo
    msgLimpa = mensagem.replace(/[✅❌⚠️💡]/g, '').trim();
    
    // Chama o novo aviso bonito
    mostrarAviso(msgLimpa, tipo);
};

// 🟢 SISTEMA DE CONFIRMAÇÃO PERSONALIZADO
let callbackConfirmacao = null;

window.perguntar = function(titulo, mensagem, tipo, callback) {
    const modal = document.getElementById('modal-confirmacao');
    const txtTitulo = document.getElementById('confirm-titulo');
    const txtMsg = document.getElementById('confirm-mensagem');
    const btnConfirmar = document.getElementById('btn-confirmar-v2');
    const icon = document.getElementById('confirm-icon');

    txtTitulo.innerText = titulo;
    txtMsg.innerText = mensagem;
    callbackConfirmacao = callback;

    // Ajusta cores e ícones conforme o tipo
    if (tipo === 'perigo') {
        icon.innerText = '🗑️';
        btnConfirmar.style.background = '#ef4444';
    } else if (tipo === 'sucesso') {
        icon.innerText = '✅';
        btnConfirmar.style.background = '#10b981';
    } else {
        icon.innerText = '⚠️';
        btnConfirmar.style.background = '#42B9EB';
    }

    btnConfirmar.onclick = () => {
        fecharModal('modal-confirmacao');
        if (callbackConfirmacao) callbackConfirmacao();
    };

    abrirModal('modal-confirmacao');
};

window.cancelarConfirmacao = () => {
    fecharModal('modal-confirmacao');
    callbackConfirmacao = null;
};

// 🟢 SISTEMA DE DIGITAÇÃO PERSONALIZADO (Substitui o prompt nativo)
window.pedirMotivo = function(titulo, mensagem, placeholder, tipo, callback) {
    document.getElementById('prompt-titulo').innerText = titulo;
    document.getElementById('prompt-mensagem').innerText = mensagem;
    
    const input = document.getElementById('prompt-input');
    input.placeholder = placeholder;
    input.value = ''; // Limpa o campo
    
    const btnConfirmar = document.getElementById('btn-prompt-confirmar');
    const icon = document.getElementById('prompt-icon');
    
    if (tipo === 'perigo') {
        icon.innerText = '🗑️';
        btnConfirmar.style.background = '#ef4444';
    } else {
        icon.innerText = '⚠️';
        btnConfirmar.style.background = '#f39c12';
    }

    // Clone para evitar múltiplos cliques acumulados
    const novoBtn = btnConfirmar.cloneNode(true);
    btnConfirmar.parentNode.replaceChild(novoBtn, btnConfirmar);

    novoBtn.onclick = () => {
        const valor = document.getElementById('prompt-input').value.trim();
        if (!valor) return alert("❌ O preenchimento deste campo é obrigatório!");
        fecharModal('modal-prompt');
        callback(valor);
    };
    
    abrirModal('modal-prompt');
    setTimeout(() => document.getElementById('prompt-input').focus(), 100);
};

// ==========================================
// 1. GESTÃO DE SESSÃO E SEGURANÇA (TIMER 20MIN)
// ==========================================
let timerInatividade;

function resetarTimerInatividade() {
    clearTimeout(timerInatividade);
    // 20 minutos
    timerInatividade = setTimeout(() => {
        alert("Sessão expirada por inatividade.");
        fazerLogout();
    }, 1200000); 
}

// Ouve interações reais para manter logado
['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => 
    document.addEventListener(evt, resetarTimerInatividade, true)
);

// ==========================================
// 2. CONTROLE DE INTERFACE (ANTI-MISTURA)
// ==========================================
function atualizarInterface(session) {
    const loginContainer = document.getElementById('login-container');
    const appWrapper = document.getElementById('app-wrapper');

    if (session) {
        // Modo Sistema: Garante que o login SUMA e o app APAREÇA
        if (loginContainer) {
            loginContainer.classList.add('hidden');
            loginContainer.style.display = 'none';
        }
        if (appWrapper) {
            appWrapper.classList.remove('hidden');
            appWrapper.style.display = 'flex';
        }
        
        configurarDadosUsuario(session.user);
    } else {
        // Modo Login: Garante que o app SUMA e o login APAREÇA
        if (appWrapper) {
            appWrapper.classList.add('hidden');
            appWrapper.style.display = 'none';
        }
        if (loginContainer) {
            loginContainer.classList.remove('hidden');
            loginContainer.style.display = 'block';
        }
    }
}

async function configurarDadosUsuario(user) {
    try {
        const { data: perfil } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (perfil) {
            window.usuarioAtual = perfil;
            
            // Header e Menus
            const userNameHeader = document.getElementById('user-name');
            if (userNameHeader) userNameHeader.innerText = `Olá, ${perfil.nome.split(' ')[0]}`;

            const btnConfig = document.getElementById('btn-config');
            const btnAdmin = document.getElementById('btn-admin');

            if (perfil.role === 'operacional') {
                if (btnConfig) btnConfig.classList.remove('hidden');
                if (btnAdmin) btnAdmin.classList.add('hidden');
            } else if (perfil.role === 'admin') {
                if (btnConfig) btnConfig.classList.add('hidden');
                if (btnAdmin) btnAdmin.classList.remove('hidden');
            }

            // Carregamento automático de dados
            if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
        }
    } catch (err) {
        console.error("Erro ao carregar perfil:", err);
    }
}

// ==========================================
// 3. INICIALIZAÇÃO E EVENTOS
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // Checagem inicial de sessão (F5)
    const { data: { session } } = await supabase.auth.getSession();
    atualizarInterface(session);

    // Escuta mudanças de estado (Login/Logout)
    supabase.auth.onAuthStateChange((event, sessionAtual) => {
        atualizarInterface(sessionAtual);
    });
});

// Botão Sair (Global para o HTML enxergar)
window.fazerLogout = async function() {
    await supabase.auth.signOut();
    window.location.reload(); 
};

// 🟢 ATUALIZAÇÃO AUTOMÁTICA DO DASHBOARD (LOOP DE 5 SEGUNDOS)
setInterval(() => {
    // Só executa a atualização se a aba Início estiver na tela
    const abaInicio = document.getElementById('aba-inicio');
    const estaLogado = document.getElementById('app-wrapper').offsetParent !== null;

    if (estaLogado && abaInicio && !abaInicio.classList.contains('hidden')) {
        carregarResumoDashboard();
    }
}, 5000); // Coloquei 5000 (5 segundos) para ficar suave e não sobrecarregar o Supabase!

// ==========================================
// TROCA DE ABAS E MODAIS
// ==========================================
function abrirAba(idAba) {
    // 1. Esconde todas as abas da tela
    document.querySelectorAll('.tab-content').forEach(aba => aba.classList.add('hidden'));
    
    // 2. Apaga o brilho (active) de todos os botões do menu
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // 3. Mostra a aba que você escolheu
    const abaAlvo = document.getElementById(idAba);
    if (abaAlvo) {
        abaAlvo.classList.remove('hidden');
    }
    
    // 4. Encontra o botão exato no menu e acende ele (Sem usar o 'event' que estava travando)
    const botaoClicado = document.querySelector(`button[onclick*="${idAba}"]`);
    if (botaoClicado) {
        botaoClicado.classList.add('active');
    }

    // AJUSTES ESPECÍFICOS POR ABA
    if (idAba === 'aba-cadastros') {
        carregarCadastros();
    }

    if (idAba === 'aba-plantao') {
        carregarTecnicosSelect();
    }

    if (idAba === 'aba-toner') {
        carregarListaToners();
        carregarListaChamados();
    }
    
    if (idAba === 'aba-ocorrencias') {
        carregarListaOcorrencias();
    }

    if (idAba === 'aba-chaves') {
        carregarSelectChaves();
        carregarHistoricoChaves(); 
    }

    if (idAba === 'aba-treinamentos') {
        carregarListaTreinamentos();
    }
    if (idAba === 'aba-solicita-treinamento') {
        carregarSolicitacoesTreinamento();
    }
    if (idAba === 'aba-solicitacoes-ad') {
        carregarSolicitacoesAD();
    }

    if (idAba === 'aba-inventario') {
        carregarTiposFiltro();
        carregarInventario();
    }

    if (idAba === 'aba-config') {
        carregarMeusDados();
    }

    if (idAba === 'aba-admin') {
        carregarPlantoesAdmin();
    }
}

// Controle de Modais (Janelas Flutuantes)
function abrirModal(idModal) {
    document.getElementById(idModal).classList.add('flex');
    
    // Se abrir o modal de permissões, carrega a tabela automaticamente
    if (idModal === 'modal-permissoes') {
        carregarTabelaUsuarios();
    }
}

function fecharModal(idModal) {
    document.getElementById(idModal).classList.remove('flex');
}

// Fechar modal ao clicar do lado de fora
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('flex');
    }
}

// Lógica de Campos Condicionais (Para selects antigos - mantido por segurança)
function toggleCondicional(selectId, divId, condicaoShow) {
    const valor = document.getElementById(selectId).value;
    const div = document.getElementById(divId);
    const textarea = div.querySelector('textarea');
    
    if (valor === condicaoShow) {
        div.classList.remove('hidden');
        textarea.required = true;
    } else {
        div.classList.add('hidden');
        textarea.required = false;
        textarea.value = ''; // Limpa se o usuário mudar de ideia
    }
}

// NOVA FUNÇÃO: Lógica de Campos Condicionais para Checkboxes
function toggleCondicionalCheckbox(checkboxElement, divId, mostrarQuandoMarcado) {
    const div = document.getElementById(divId);
    const textarea = div.querySelector('textarea');
    
    if ((mostrarQuandoMarcado && checkboxElement.checked) || (!mostrarQuandoMarcado && !checkboxElement.checked)) {
        div.classList.remove('hidden');
        textarea.required = true;
    } else {
        div.classList.add('hidden');
        textarea.required = false;
        textarea.value = ''; // Limpa se o usuário mudar de ideia
    }
}

// ==========================================
// LÓGICA DE MÚLTIPLOS TÉCNICOS NO PLANTÃO
// ==========================================
let tecnicosNoPlantao = []; // Array que guarda os selecionados

async function carregarTecnicosSelect() {
    try {
        const { data, error } = await supabase.from('profiles').select('id, nome').order('nome');
        if (error) throw error;
        
        const select = document.getElementById('select-tecnicos-plantao');
        if (select) {
            select.innerHTML = '<option value="">Selecione um colega...</option>' + 
                               data.map(u => `<option value="${u.id}">${u.nome}</option>`).join('');
        }
    } catch (err) { console.error("Erro ao carregar técnicos:", err); }
}

function adicionarTecnico() {
    const select = document.getElementById('select-tecnicos-plantao');
    const id = select.value;
    const nome = select.options[select.selectedIndex]?.text;

    if (!id) return alert("Selecione um técnico na lista.");
    
    // Impede adicionar o mesmo técnico duas vezes
    if (tecnicosNoPlantao.find(t => t.id === id)) {
        return alert("Este colega já foi adicionado ao plantão!");
    }

    tecnicosNoPlantao.push({ id, nome });
    atualizarInterfaceTecnicos();
    select.value = ''; // Reseta o dropdown
}

function removerTecnico(id) {
    tecnicosNoPlantao = tecnicosNoPlantao.filter(t => t.id !== id);
    atualizarInterfaceTecnicos();
}

function atualizarInterfaceTecnicos() {
    const container = document.getElementById('lista-tecnicos-plantao');
    
    if (tecnicosNoPlantao.length === 0) {
        container.innerHTML = '<span style="font-size: 12px; color: #94a3b8; text-align: center;">Você está sozinho no plantão?</span>';
        return;
    }

    container.innerHTML = tecnicosNoPlantao.map(t => `
        <div class="tecnico-badge">
            <span>${t.nome}</span>
            <button type="button" onclick="removerTecnico('${t.id}')" title="Remover">✕</button>
        </div>
    `).join('');
}


// ==========================================
// ABA 1: SALVAR PLANTÃO E VALIDAÇÕES
// ==========================================

// 🟢 FUNÇÃO AUXILIAR: Verifica se o quadro de assinatura está em branco (Se o usuário desenhou algo)
function isCanvasVazio(canvas) {
    const context = canvas.getContext('2d');
    const pixelBuffer = new Uint32Array(
        context.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    // Verifica se algum pixel foi alterado pelo usuário (diferente de 0)
    return !pixelBuffer.some(color => color !== 0);
}

async function salvarPlantao() {
    // 1. CAPTURA DOS CAMPOS OBRIGATÓRIOS
    const horaAssumiu = document.getElementById('p_hora_assumiu').value;
    const horaLargou = document.getElementById('p_hora_largou').value;
    const canvas = document.getElementById('canvas-plantao');

    // 🟢 VALIDAÇÃO ESTRITA: HORA (Impede de prosseguir se estiver vazio)
    if (!horaAssumiu || !horaLargou) {
        return alert("⚠️ CAMPO OBRIGATÓRIO: Por favor, preencha o horário que assumiu e o horário que largou o plantão.");
    }

    // 🟢 VALIDAÇÃO ESTRITA: ASSINATURA (Impede de prosseguir se o quadro estiver em branco)
    if (isCanvasVazio(canvas)) {
        return alert("⚠️ ASSINATURA OBRIGATÓRIA: O plantão não pode ser registrado sem a sua assinatura digital.");
    }

    try {
        console.log("Iniciando salvamento do plantão...");

        // 1. Faz upload da assinatura
        const urlAssinatura = await uploadAssinatura(canvas, 'plantao');

        // 2. Coleta os dados 
        const dados = {
            usuario_id: typeof usuarioAtual !== 'undefined' && usuarioAtual ? usuarioAtual.id : null,
            tecnicos_plantao: tecnicosNoPlantao.map(t => t.nome).join(', '), // Nomes da equipe adicionados
            hora_assumiu: horaAssumiu,
            hora_largou: horaLargou,
            emails_resp: document.getElementById('p_emails').checked,
            motivo_emails: document.getElementById('p_motivo_emails').value,
            chamados_pend: document.getElementById('p_chamados').checked,
            motivo_chamados: document.getElementById('p_motivo_chamados').value,
            forms_zerado: document.getElementById('p_forms').checked,
            motivo_forms: document.getElementById('p_motivo_forms').value,
            
            // FORMS DE TREINAMENTO
            forms_treinamento: document.getElementById('p_forms_treinamento').checked,
            motivo_treinamento: document.getElementById('p_motivo_treinamento').value,
            
            maquinas_func: document.getElementById('p_maquinas').checked,
            motivo_maquinas: document.getElementById('p_motivo_maquinas').value,
            cadeiras_lugar: document.getElementById('p_cadeiras').checked,
            motivo_cadeiras: document.getElementById('p_motivo_cadeiras').value,
            painel_tv: document.getElementById('p_tv').checked,
            motivo_tv: document.getElementById('p_motivo_tv').value,
            ocorrencias: document.getElementById('p_ocorrencias').checked,
            motivo_ocorrencias: document.getElementById('p_motivo_ocorrencias').value,
            assinatura_url: urlAssinatura
        };

        // 3. Salva no Supabase
        const { error } = await supabase.from('plantoes').insert([dados]);

        if (error) throw error;

        alert('✅ Plantão registrado com sucesso!');
        
        // 4. Limpa tudo para o próximo plantão
        document.getElementById('form-plantao').reset();
        limparCanvas('canvas-plantao');
        tecnicosNoPlantao = []; // Esvazia o array de colegas
        atualizarInterfaceTecnicos(); // Limpa a lista visual da tela

    } catch (err) {
        console.error(err);
        alert('❌ Erro ao salvar: Ocorreu um problema na conexão com o banco de dados.');
    }
}
// ==========================================
// ABA 2: CHAVES
// ==========================================
async function carregarSelectChaves() {
    try {
        // Carrega chaves disponíveis
        const { data: disponiveis } = await supabase.from('chaves').select('*').eq('status', 'disponivel');
        const selDisp = document.getElementById('select-chaves-disponiveis');
        if(selDisp) {
            selDisp.innerHTML = '<option value="">Selecione a chave...</option>' + 
                                disponiveis.map(c => `<option value="${c.id}">${c.nome} (${c.localizacao})</option>`).join('');
        }

        // Carrega chaves em uso (retiradas)
        const { data: retiradas } = await supabase.from('chaves').select('*').eq('status', 'retirada');
        const selRet = document.getElementById('select-chaves-retiradas');
        if(selRet) {
            selRet.innerHTML = '<option value="">Selecione a chave...</option>' + 
                               retiradas.map(c => `<option value="${c.id}">${c.nome} (${c.localizacao})</option>`).join('');
        }
    } catch (err) {
        console.log("Erro no DB (Chaves):", err);
    }
}

async function registrarChave(tipo) { 
    const selectId = tipo === 'retirada' ? 'select-chaves-disponiveis' : 'select-chaves-retiradas';
    const canvasId = tipo === 'retirada' ? 'canvas-retirada' : 'canvas-devolucao';
    const horaId = tipo === 'retirada' ? 'hora-retirada' : 'hora-devolucao';
    const responsavelId = tipo === 'retirada' ? 'responsavel-retirada' : 'responsavel-devolucao';
    const formId = tipo === 'retirada' ? 'form-retirada-chave' : 'form-devolucao-chave';

    const chaveId = document.getElementById(selectId).value;
    const dataHora = document.getElementById(horaId).value;
    const responsavel = document.getElementById(responsavelId).value;

    if (!chaveId || !dataHora || !responsavel) {
        return alert('Preencha todos os campos antes de prosseguir.');
    }

    try {
        let urlFoto = null;
        
        // Lógica de upload de foto exclusiva para DEVOLUÇÃO
        if (tipo === 'devolucao') {
            const inputFoto = document.getElementById('foto-devolucao');
            if (inputFoto.files.length === 0) {
                return alert("Anexe a foto da chave/local para registrar a devolução.");
            }
            
            const fotoFile = inputFoto.files[0];
            const nomeFoto = `devolucao_chave_${Date.now()}_${fotoFile.name}`;
            
            const { error: errFoto } = await supabase.storage.from('assinaturas').upload(nomeFoto, fotoFile);
            if (errFoto) throw errFoto;
            
            urlFoto = supabase.storage.from('assinaturas').getPublicUrl(nomeFoto).data.publicUrl;
        }

        const urlAssinatura = await uploadAssinatura(document.getElementById(canvasId), `chave_${tipo}`);

        // 1. Registra o movimento na tabela de histórico
        const payloadMovimento = {
            chave_id: chaveId,
            usuario_id: typeof usuarioAtual !== 'undefined' && usuarioAtual ? usuarioAtual.id : null,
            tipo_movimento: tipo,
            data_hora: dataHora,
            responsavel: responsavel,
            assinatura_url: urlAssinatura
        };
        
        // Se tiver foto (Devolução), adiciona no payload de salvamento
        if (urlFoto) {
            payloadMovimento.foto_url = urlFoto; 
        }

        await supabase.from('movimentacao_chaves').insert([payloadMovimento]);

        // 2. Atualiza o status físico da chave
        const novoStatus = tipo === 'retirada' ? 'retirada' : 'disponivel';
        await supabase.from('chaves').update({ status: novoStatus }).eq('id', chaveId);

        alert(`Sucesso! Chave ${tipo === 'retirada' ? 'retirada' : 'devolvida'}.`);
        
        document.getElementById(formId).reset();
        limparCanvas(canvasId);
        carregarSelectChaves(); // Recarrega os dropdowns na mesma hora
        
        // 🟢 LINHA ADICIONADA AQUI: Atualiza o histórico na mesma hora!
        carregarHistoricoChaves(); 

    } catch (err) { 
        alert('Erro ao processar chave: ' + err.message); 
    }
}


// --- VARIÁVEIS DE CONTROLE DO HISTÓRICO DE CHAVES ---
let paginaAtualChaves = 1;
const itensPorPaginaChaves = 5;
let dadosHistoricoChaves = [];

// 🟢 FUNÇÃO: Dispara a busca ao apertar ENTER no campo de filtro
window.verificarEnterChaves = function(event) {
    if (event.key === 'Enter') carregarHistoricoChaves();
}

// 🟢 FUNÇÃO: Busca os dados no Supabase filtrando pela nomenclatura
async function carregarHistoricoChaves() {
    const filtro = document.getElementById('filtro_hist_chaves').value.trim();
    paginaAtualChaves = 1; // Reseta para a primeira página na busca

    try {
        // Buscamos na tabela de movimentação e trazemos o NOME da chave da tabela 'chaves'
        let query = supabase
            .from('movimentacao_chaves')
            .select('*, chaves!inner(nome)')
            .order('data_hora', { ascending: false });

        if (filtro) {
            query = query.ilike('chaves.nome', `%${filtro}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        dadosHistoricoChaves = data || [];
        renderizarTabelaHistoricoChaves();
    } catch (err) {
        console.error("Erro ao carregar histórico de chaves:", err.message);
    }
}

// 🟢 FUNÇÃO: Desenha a tabela fatiando os dados (5 por página)
function renderizarTabelaHistoricoChaves() {
    const tbody = document.getElementById('lista-historico-chaves-aba');
    const spanPagina = document.getElementById('span-pagina-historico-chaves');
    if (!tbody) return;

    const totalPaginas = Math.ceil(dadosHistoricoChaves.length / itensPorPaginaChaves) || 1;
    if (spanPagina) spanPagina.innerText = `Página ${paginaAtualChaves} de ${totalPaginas}`;

    const inicio = (paginaAtualChaves - 1) * itensPorPaginaChaves;
    const fim = inicio + itensPorPaginaChaves;
    const itensPagina = dadosHistoricoChaves.slice(inicio, fim);

    tbody.innerHTML = itensPagina.length > 0 ? itensPagina.map(m => {
        const dataF = new Date(m.data_hora).toLocaleString('pt-BR');
        const isRetirada = m.tipo_movimento === 'retirada';
        const colorStatus = isRetirada ? '#f39c12' : '#2ecc71';

        // Links de comprovantes
        const linkAssinatura = `<a href="${m.assinatura_url}" target="_blank" style="color: #3498db; font-weight: bold; font-size: 11px; display: block;">✍️ Assinatura</a>`;
        const linkFoto = m.foto_url ? `<a href="${m.foto_url}" target="_blank" style="color: #8e44ad; font-weight: bold; font-size: 11px; display: block; margin-top: 2px;">🖼️ Ver Foto</a>` : '';

        return `
            <tr>
                <td style="font-size: 12px;">${dataF}</td>
                <td style="font-size: 12px;"><strong>${m.chaves?.nome || 'Removida'}</strong></td>
                <td style="width: 130px;">
                    <span style="background-color: ${colorStatus}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; display: block; text-align: center;">
                        ${m.tipo_movimento.toUpperCase()}
                    </span>
                </td>
                <td style="font-size: 12px;">${m.responsavel}</td>
                <td style="background: #f8fafc; border-radius: 4px;">
                    ${linkAssinatura}
                    ${linkFoto}
                </td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">Nenhum registro encontrado.</td></tr>';
}

// 🟢 FUNÇÃO: Navegação de páginas
function mudarPaginaHistoricoChaves(direcao) {
    const totalPaginas = Math.ceil(dadosHistoricoChaves.length / itensPorPaginaChaves) || 1;
    paginaAtualChaves += direcao;
    if (paginaAtualChaves < 1) paginaAtualChaves = 1;
    if (paginaAtualChaves > totalPaginas) paginaAtualChaves = totalPaginas;
    renderizarTabelaHistoricoChaves();
}

// ==========================================
// ABA 3: GESTÃO DE OCORRÊNCIAS 
// ==========================================

let paginaAtualOc = 1;
const itensPorPaginaOc = 5;
let dadosHistoricoOc = [];

async function salvarOcorrencia() {
    const descricao = document.getElementById('o_descricao').value;
    const proposta = document.getElementById('o_proposta').value;
    const prazo = document.getElementById('o_prazo').value;
    const responsavel = document.getElementById('o_responsavel').value;
    const observacao = document.getElementById('o_observacao').value;

    if (!descricao || !proposta || !prazo || !responsavel) {
        return alert("Preencha todos os campos obrigatórios da ocorrência.");
    }

    try {
        const sigUrl = await uploadAssinatura(document.getElementById('canvas-nova-ocorrencia'), 'abertura_ocorrencia');

        const { error } = await supabase.from('ocorrencias').insert([{
            descricao: descricao,
            solucao_proposta: proposta,
            prazo: prazo,
            observacao: observacao,
            responsavel_abertura: responsavel,
            assinatura_abertura_url: sigUrl,
            status: 'Pendente' 
        }]);

        if (error) throw error;

        alert("Ocorrência registrada com sucesso!");
        document.getElementById('form-nova-ocorrencia').reset();
        limparCanvas('canvas-nova-ocorrencia');
        carregarListaOcorrencias();

    } catch (err) {
        alert("Erro ao salvar ocorrência: " + err.message);
    }
}

// 🟢 ATUALIZADO: Layout fininho e compacto para não esticar a tabela de Ocorrências
async function carregarListaOcorrencias() {
    try {
        const { data, error } = await supabase.from('ocorrencias')
            .select('*')
            .neq('status', 'Solucionada')
            .neq('status', 'Cancelada')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('lista-ocorrencias-aba');
        if (tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(o => {
                const prazoFormatado = o.prazo ? o.prazo.split('-').reverse().join('/') : '-';
                let corStatus = o.status === 'Em andamento' ? '#f39c12' : '#e74c3c'; 

                // 🟢 BOTÕES COMPACTOS: gap de 2px, padding reduzido e fonte menor (10px)
               let botoesAcao = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        <button class="btn-primary btn-sm" style="background: #3498db; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalVerOcorrencia('${o.id}')">👁️ Ver</button>
                        <button class="btn-primary btn-sm" style="background: #f39c12; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalEditarOcorrencia('${o.id}')">✏️ Editar</button>
                        <button class="btn-success btn-sm" style="margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalFinalizarOcorrencia('${o.id}')">✔️ Solucionar</button>
                        <button class="btn-danger btn-sm" style="margin: 0; padding: 5px 2px; font-size: 11px;" onclick="cancelarOcorrencia('${o.id}')">❌ Cancelar</button>
                    </div>
                `;

                return `
                    <tr>
                        <td style="font-size: 12px;"><strong>${o.descricao}</strong><br><small style="color: #7f8c8d;">Abertura: ${new Date(o.created_at).toLocaleDateString('pt-BR')}</small></td>
                        <td style="font-size: 12px;">${prazoFormatado}</td>
                        <td style="font-size: 12px;">${o.responsavel_abertura}</td>
                        
                        <td style="width: 140px; min-width: 140px;">
                            <div style="margin-bottom: 6px;">
                                <span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${o.status}</span>
                            </div>
                            ${botoesAcao}
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="4" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma ocorrência pendente.</td></tr>';
        }

        carregarHistoricoOcorrencias();

    } catch (err) { console.error("Erro ao carregar ocorrências:", err.message); }
}

window.verificarEnterFiltroOcorrencia = function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        carregarHistoricoOcorrencias();
    }
}

window.carregarHistoricoOcorrencias = async function() {
    const inputResp = document.getElementById('filtro_hist_oc_responsavel');
    const inputData = document.getElementById('filtro_hist_oc_data');
    
    const resp = inputResp ? inputResp.value.trim() : '';
    const dataFiltro = inputData ? inputData.value : '';
    paginaAtualOc = 1; 

    try {
        let query = supabase.from('ocorrencias')
            .select('*')
            .in('status', ['Solucionada', 'Cancelada']) 
            .order('created_at', { ascending: false });

        if (resp) query = query.ilike('responsavel_abertura', `%${resp}%`);
        
        if (dataFiltro) {
            const dataInicio = `${dataFiltro}T00:00:00.000Z`;
            const dataFim = `${dataFiltro}T23:59:59.999Z`;
            query = query.gte('created_at', dataInicio).lte('created_at', dataFim);
        }

        const { data, error } = await query;
        if (error) throw error;

        dadosHistoricoOc = data || [];
        renderizarTabelaHistoricoOc();
    } catch (err) { console.error("Erro ao carregar histórico:", err); }
}

// 🟢 ATUALIZADO: Histórico de Ocorrências com a coluna fina
function renderizarTabelaHistoricoOc() {
    const tbody = document.getElementById('lista-historico-ocorrencias-aba');
    const spanPagina = document.getElementById('span-pagina-historico-oc');
    if (!tbody) return;

    const totalPaginas = Math.ceil(dadosHistoricoOc.length / itensPorPaginaOc) || 1;
    if (spanPagina) spanPagina.innerText = `Página ${paginaAtualOc} de ${totalPaginas}`;

    const inicio = (paginaAtualOc - 1) * itensPorPaginaOc;
    const fim = inicio + itensPorPaginaOc;
    const itensPagina = dadosHistoricoOc.slice(inicio, fim);

    tbody.innerHTML = itensPagina.length > 0 ? itensPagina.map(o => {
        const dataC = new Date(o.created_at).toLocaleDateString('pt-BR');
        let corStatus = o.status === 'Solucionada' ? '#2ecc71' : '#e74c3c';

        return `
            <tr>
                <td style="font-size: 12px;"><strong>${o.descricao}</strong><br><small style="color: #7f8c8d;">Data: ${dataC}</small></td>
                <td style="font-size: 12px;">${o.responsavel_abertura}</td>
                
                <td style="width: 140px; min-width: 140px;">
                    <div style="margin-bottom: 6px;">
                        <span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${o.status}</span>
                    </div>
                    
                    <div style="display: flex; justify-content: center;">
                        <button class="btn-primary btn-sm" style="background: #3498db; width: 100%; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalVerOcorrencia('${o.id}')">👁️ Ver Detalhes</button>
                    </div>
                    
                    ${o.status === 'Cancelada' && o.motivo_cancelamento ? `<div style="margin-top: 6px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 4px; border-radius: 4px; text-align: center; line-height: 1.3;"><strong>Motivo:</strong> ${o.motivo_cancelamento}</div>` : ''}
                </td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="3" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum registro encontrado no histórico.</td></tr>'; 
}
function mudarPaginaHistoricoOc(direcao) {
    const totalPaginas = Math.ceil(dadosHistoricoOc.length / itensPorPaginaOc) || 1;
    paginaAtualOc += direcao;
    if (paginaAtualOc < 1) paginaAtualOc = 1;
    if (paginaAtualOc > totalPaginas) paginaAtualOc = totalPaginas;
    renderizarTabelaHistoricoOc();
}

async function abrirModalVerOcorrencia(id) {
    try {
        const { data: o, error } = await supabase.from('ocorrencias').select('*').eq('id', id).single();
        if (error) throw error;

        const conteudo = document.getElementById('detalhes-ocorrencia-conteudo');
        const prazoFormatado = o.prazo ? o.prazo.split('-').reverse().join('/') : '-';
        const dataAbertura = new Date(o.created_at).toLocaleString('pt-BR');

        conteudo.innerHTML = `
            <p><strong>🚨 Ocorrência:</strong> ${o.descricao}</p>
            <p><strong>💡 Solução Proposta:</strong> ${o.solucao_proposta}</p>
            <p><strong>📅 Prazo Máximo:</strong> ${prazoFormatado}</p>
            <p><strong>👤 Resp. Abertura:</strong> ${o.responsavel_abertura}</p>
            <p><strong>🕒 Data Abertura:</strong> ${dataAbertura}</p>
            <p><strong>📝 Observação:</strong> ${o.observacao || 'Nenhuma observação registrada.'}</p>
            <p><strong>📌 Status:</strong> ${o.status}</p>
            
            ${o.status === 'Cancelada' && o.motivo_cancelamento ? `
                <hr style="margin: 15px 0; border: 0; border-top: 1px solid #e2e8f0;">
                <p style="color: #c0392b;"><strong>❌ Motivo do Cancelamento:</strong> ${o.motivo_cancelamento}</p>
            ` : ''}

            ${o.status === 'Solucionada' ? `
                <hr style="margin: 15px 0; border: 0; border-top: 1px solid #e2e8f0;">
                <p><strong>✅ Solução Aplicada:</strong> ${o.solucao_aplicada}</p>
                <p><strong>🛠️ Quem Solucionou:</strong> ${o.quem_solucionou}</p>
                <p><strong>👀 Quem Acompanhou:</strong> ${o.quem_acompanhou}</p>
                <p><strong>🏁 Data Finalização:</strong> ${new Date(o.data_finalizacao).toLocaleString('pt-BR')}</p>
                <div style="margin-top: 15px;">
                    <strong>✍️ Assinatura do Fechamento:</strong><br>
                    <img src="${o.assinatura_fechamento_url}" style="max-width: 250px; border: 1px solid #ccc; border-radius: 4px; background: #fff; margin-top: 5px;">
                </div>
            ` : ''}
        `;

        abrirModal('modal-ver-ocorrencia');
    } catch (err) {
        alert("Erro ao buscar detalhes da ocorrência: " + err.message);
    }
}

async function abrirModalEditarOcorrencia(id) {
    try {
        const { data: o, error } = await supabase.from('ocorrencias').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('edit_o_id').value = o.id;
        document.getElementById('edit_o_descricao').value = o.descricao;
        document.getElementById('edit_o_proposta').value = o.solucao_proposta;
        document.getElementById('edit_o_prazo').value = o.prazo;
        document.getElementById('edit_o_responsavel').value = o.responsavel_abertura;
        document.getElementById('edit_o_observacao').value = o.observacao || '';

        abrirModal('modal-editar-ocorrencia');
    } catch (err) {
        alert("Erro ao carregar dados para edição: " + err.message);
    }
}

async function salvarEdicaoOcorrencia() {
    const id = document.getElementById('edit_o_id').value;
    const descricao = document.getElementById('edit_o_descricao').value;
    const proposta = document.getElementById('edit_o_proposta').value;
    const prazo = document.getElementById('edit_o_prazo').value;
    const responsavel = document.getElementById('edit_o_responsavel').value;
    const observacao = document.getElementById('edit_o_observacao').value;

    if (!descricao || !proposta || !prazo || !responsavel) {
        return alert("Preencha todos os campos obrigatórios.");
    }

    try {
        const { error } = await supabase.from('ocorrencias').update({
            descricao: descricao,
            solucao_proposta: proposta,
            prazo: prazo,
            responsavel_abertura: responsavel,
            observacao: observacao
        }).eq('id', id);

        if (error) throw error;

        alert("Ocorrência atualizada com sucesso!");
        fecharModal('modal-editar-ocorrencia');
        carregarListaOcorrencias();
    } catch (err) {
        alert("Erro ao salvar edição: " + err.message);
    }
}

async function cancelarOcorrencia(id) {
    pedirMotivo(
        "Cancelar Ocorrência", 
        "Digite o motivo do cancelamento desta ocorrência:", 
        "Motivo da baixa...", 
        "perigo", 
        async (motivo) => {
            try {
                const { error } = await supabase.from('ocorrencias').update({
                    status: 'Cancelada',
                    motivo_cancelamento: motivo
                }).eq('id', id);
                if (error) throw error;
                
                alert("✅ Ocorrência cancelada com sucesso!");
                carregarListaOcorrencias();
                if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
            } catch (err) { alert("❌ Erro ao cancelar: " + err.message); }
        }
    );
}
async function suspenderChamado(id) {
    pedirMotivo(
        "Suspender Chamado", 
        "Digite o motivo da suspensão deste chamado Simpress:", 
        "Descreva a pendência...", 
        "aviso", 
        async (motivo) => {
            try {
                const { error } = await supabase.from('chamado_simpress').update({ 
                    status: 'Suspenso', 
                    observacao: motivo 
                }).eq('id', id);
                if (error) throw error;
                
                alert("✅ Chamado suspenso com sucesso!");
                carregarListaChamados();
                if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
            } catch (err) { alert("❌ Erro ao suspender: " + err.message); }
        }
    );
}

function abrirModalFinalizarOcorrencia(id) {
    document.getElementById('f_ocorrencia_id').value = id;
    limparCanvas('canvas-finalizar-ocorrencia');
    abrirModal('modal-finalizar-ocorrencia');
}

async function finalizarOcorrencia() {
    const id = document.getElementById('f_ocorrencia_id').value;
    const solucao = document.getElementById('f_solucao').value;
    const solucionador = document.getElementById('f_quem_solucionou').value;
    const acompanhante = document.getElementById('f_quem_acompanhou').value;

    if (!solucao || !solucionador || !acompanhante) {
        return alert("Preencha todos os campos do formulário.");
    }

    try {
        const sigUrl = await uploadAssinatura(document.getElementById('canvas-finalizar-ocorrencia'), 'fechamento_ocorrencia');

        const { error } = await supabase.from('ocorrencias').update({
            status: 'Solucionada',
            solucao_aplicada: solucao,
            quem_solucionou: solucionador,
            quem_acompanhou: acompanhante,
            assinatura_fechamento_url: sigUrl,
            data_finalizacao: new Date().toISOString() 
        }).eq('id', id);

        if (error) throw error;

        alert("Ocorrência solucionada com sucesso!");
        document.getElementById('form-finalizar-ocorrencia').reset();
        fecharModal('modal-finalizar-ocorrencia');
        carregarListaOcorrencias(); 

    } catch (err) {
        alert("Erro ao finalizar ocorrência: " + err.message);
    }
}

// ==========================================
// ABA 4: CONTROLE DE TONERS E IMPRESSORAS
// ==========================================

let paginaAtualChamado = 1;
const itensPorPaginaChamado = 5;
let dadosHistoricoChamados = [];

async function carregarListaToners() {
    try {
        const { data, error } = await supabase.from('cadastro_toner').select('*').order('modelo_toner');
        if (error) throw error;
        
        const tbody = document.getElementById('lista-toners-aba');
        if(tbody) {
            tbody.innerHTML = data.map(t => `
                <tr>
                    <td>${t.modelo_toner}</td>
                    <td><strong>${t.quantidade_atual}</strong></td>
                    <td>
                        <button class="btn-primary btn-sm" onclick="abrirModalTrocaToner('${t.id}')" ${t.quantidade_atual <= 0 ? 'disabled' : ''}>Trocar Toner</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error("Erro ao carregar toners:", err.message); }
}

async function carregarListaChamados() {
    try {
        // 🟢 ORDENA POR 'id' PARA NÃO DAR ERRO 400 NO BANCO DE DADOS
        const { data, error } = await supabase.from('chamado_simpress')
            .select('*')
            .eq('status', 'Aberto')
            .order('id', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('lista-chamados-aba');
        if(tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(c => {
                let corStatus = '#f39c12'; 
                
                // Evita erro se a data não existir
                const dataAberta = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '-';

                let botoesAcao = `
                    <div style="display: flex; gap: 4px; flex-wrap: nowrap; justify-content: center;">
                        <button class="btn-success btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalAtenderChamado('${c.id}')">✔️ Atender</button>
                        <button class="btn-danger btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="suspenderChamado('${c.id}')">⏸️ Suspender</button>
                    </div>
                `;

                return `
                    <tr>
                        <td style="font-size: 12px;"><strong>${c.numero_chamado}</strong><br><small>Abertura: ${dataAberta}</small></td>
                        <td style="font-size: 12px;">${c.modelo_impressora} <br><small>Série: ${c.numero_serie}</small></td>
                        <td style="font-size: 12px;">${c.setor_localizada}</td>
                        <td style="width: 140px; min-width: 140px;">
                            <div style="margin-bottom: 6px;">
                                <span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${c.status}</span>
                            </div>
                            ${botoesAcao}
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="4" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum chamado aberto.</td></tr>';
        }

        // 🟢 CHAMA O HISTÓRICO PARA RENDERIZAR A TABELA DE BAIXO
        if(typeof carregarHistoricoChamados === 'function') carregarHistoricoChamados();

    } catch (err) { console.error("Erro ao carregar chamados:", err.message); }
}

function renderizarTabelaHistoricoChamados() {
    const tbody = document.getElementById('lista-historico-chamados-aba');
    const spanPagina = document.getElementById('span-pagina-historico-chamado');
    if (!tbody) return;

    const totalPaginas = Math.ceil(dadosHistoricoChamados.length / itensPorPaginaChamado) || 1;
    if (spanPagina) spanPagina.innerText = `Página ${paginaAtualChamado} de ${totalPaginas}`;

    const inicio = (paginaAtualChamado - 1) * itensPorPaginaChamado;
    const fim = inicio + itensPorPaginaChamado;
    const itensPagina = dadosHistoricoChamados.slice(inicio, fim);

    tbody.innerHTML = itensPagina.length > 0 ? itensPagina.map(c => {
        const dataC = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '-';
        let corStatus = c.status === 'Atendido' ? '#2ecc71' : '#e74c3c';

        return `
            <tr>
                <td style="font-size: 12px;"><strong>${c.numero_chamado}</strong><br><small>${dataC}</small></td>
                <td style="font-size: 12px;">${c.modelo_impressora} <br><small>Série: ${c.numero_serie}</small></td>
                <td style="font-size: 12px;">${c.setor_localizada}</td>
                <td style="width: 140px; min-width: 140px;">
                    <div style="margin-bottom: 6px;">
                        <span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${c.status}</span>
                    </div>
                    ${c.observacao ? `<div style="margin-top: 6px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 4px; border-radius: 4px; text-align: center; line-height: 1.3;"><strong>Obs:</strong> ${c.observacao}</div>` : ''}
                </td>
                <td style="font-size: 11px;">${c.tecnico_acompanhante || '-'}</td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="5" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum registro encontrado no histórico.</td></tr>';
}

function mudarPaginaHistoricoChamado(direcao) {
    const totalPaginas = Math.ceil(dadosHistoricoChamados.length / itensPorPaginaChamado) || 1;
    paginaAtualChamado += direcao;
    if (paginaAtualChamado < 1) paginaAtualChamado = 1;
    if (paginaAtualChamado > totalPaginas) paginaAtualChamado = totalPaginas;
    renderizarTabelaHistoricoChamados();
}

function abrirModalTrocaToner(idToner) {
    document.getElementById('tt_toner_id').value = idToner;
    limparCanvas('canvas-troca-toner');
    abrirModal('modal-troca-toner');
}

function abrirModalAtenderChamado(idChamado) {
    document.getElementById('ac_chamado_id').value = idChamado;
    limparCanvas('canvas-atender-chamado');
    abrirModal('modal-atender-chamado');
}

async function salvarTrocaToner() {
    const tonerId = document.getElementById('tt_toner_id').value;
    const inputFoto = document.getElementById('tt_foto');
    const setor = document.getElementById('tt_setor').value;
    const andar = document.getElementById('tt_andar').value;
    const predio = document.getElementById('tt_predio').value;
    const canvas = document.getElementById('canvas-troca-toner');

    // 🟢 VALIDAÇÃO ESTRITA (Campos, Foto e Assinatura)
    if (!setor || !andar || !predio || inputFoto.files.length === 0) {
        return alert("⚠️ Atenção: Preencha todos os campos e anexe a foto da página de teste.");
    }

    if (isCanvasVazio(canvas)) {
        return alert("⚠️ Assinatura Obrigatória: Você precisa assinar para confirmar a troca do toner.");
    }

    try {
        // 1. Upload da Foto da Página de Teste
        const fotoFile = inputFoto.files[0];
        const nomeFoto = `teste_${Date.now()}_${fotoFile.name}`;
        const { error: errFoto } = await supabase.storage.from('assinaturas').upload(nomeFoto, fotoFile);
        if (errFoto) throw errFoto;
        const fotoUrl = supabase.storage.from('assinaturas').getPublicUrl(nomeFoto).data.publicUrl;

        // 2. Upload da Assinatura Digital
        const sigUrl = await uploadAssinatura(canvas, 'troca_toner');

        // 3. Insere o registro na tabela de trocas
        const { error: errInsert } = await supabase.from('registro_troca_toner').insert([{
            toner_id: tonerId,
            usuario_id: typeof usuarioAtual !== 'undefined' && usuarioAtual ? usuarioAtual.id : null,
            foto_teste_url: fotoUrl,
            setor: setor,
            andar: andar,
            predio: predio,
            assinatura_tecnico_url: sigUrl
        }]);
        if (errInsert) throw errInsert;

        // 4. Atualiza o estoque (Baixa de 1 unidade)
        const { data: tonerAtual } = await supabase.from('cadastro_toner').select('quantidade_atual').eq('id', tonerId).single();
        await supabase.from('cadastro_toner').update({ 
            quantidade_atual: (tonerAtual.quantidade_atual || 1) - 1 
        }).eq('id', tonerId);

        alert("✅ Troca registrada com sucesso! Estoque atualizado.");
        
        // 5. Limpa e fecha tudo
        document.getElementById('form-troca-toner').reset();
        limparCanvas('canvas-troca-toner');
        fecharModal('modal-troca-toner');
        
        // Recarrega as listas para atualizar os números na tela
        if (typeof carregarListaToners === 'function') carregarListaToners();
        if (typeof carregarResumoDashboard === 'function') carregarResumoDashboard();

    } catch (e) { 
        console.error(e);
        alert("❌ Erro ao salvar troca: " + e.message); 
    }
}

async function salvarAtendimentoChamado() {
    const chamadoId = document.getElementById('ac_chamado_id').value;
    const solucao = document.getElementById('ac_solucao').value;
    const temObs = document.getElementById('ac_tem_obs').checked;
    const obs = temObs ? document.getElementById('ac_obs_texto').value : '';
    const tecnico = document.getElementById('ac_tecnico').value;

    if (!solucao || !tecnico) return alert("Preencha a Solução e o Técnico responsável.");

    try {
        const sigUrl = await uploadAssinatura(document.getElementById('canvas-atender-chamado'), 'atend_simpress');

        const { error } = await supabase.from('chamado_simpress').update({
            status: 'Atendido',
            solucao_aplicada: solucao,
            observacao: obs,
            tecnico_acompanhante: tecnico,
            assinatura_tecnico_url: sigUrl
        }).eq('id', chamadoId);

        if (error) throw error;

        alert("Atendimento registrado! O chamado foi movido para o histórico.");
        document.getElementById('form-atender-chamado').reset();
        fecharModal('modal-atender-chamado');
        carregarListaChamados(); 

    } catch (e) { alert("Erro ao salvar atendimento: " + e.message); }
}

// ==========================================
// ABA: GESTÃO DE TREINAMENTOS
// ==========================================

let idSolicitacaoEmAndamento = null; 
let paginaAtualHistorico = 1;
const itensPorPaginaTr = 5;
let dadosHistoricoTr = []; 

// 🟢 NOVA FUNÇÃO: Inteligência para preencher andares automaticamente
window.atualizarAndares = function(predioId, andarId, valorPreSelecionado = '') {
    const predio = document.getElementById(predioId).value;
    const selectAndar = document.getElementById(andarId);
    
    selectAndar.innerHTML = '<option value="">Selecione...</option>';
    
    let andares = [];
    
    if (predio === 'UPI') {
        andares = ['SL CTI 1º Andar', '2º Andar', '3º Andar', '4º Andar', '5º Andar', '6º Andar', '7º Andar', '8º Andar', '9º Andar', '10º Andar', '11º Andar', '12º Andar', '13º Andar'];
    } else if (predio === 'UPE') {
        andares = ['1º Andar', '2º Andar', '3º Andar', '4º Andar', '5º Andar'];
    } else if (predio === 'PIMAG') {
        andares = ['1º Andar', '2º Andar', '3º Andar', '4º Andar'];
    } else if (predio === 'RADIOTERAPIA') {
        andares = ['Térreo'];
    } else if (predio === 'TRAUMA') {
        andares = ['1º Andar', '2º Andar', '3º Andar'];
    } else if (predio === 'CASA ROSA') {
        andares = ['1º Andar', '2º Andar'];
    }

    andares.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        if (a === valorPreSelecionado) opt.selected = true; // Mantém selecionado na edição
        selectAndar.appendChild(opt);
    });
};

window.prepararAgendamento = function(id, nome, telefone, tema) {
    idSolicitacaoEmAndamento = id; 
    document.getElementById('tr_colaborador').value = nome;
    document.getElementById('tr_telefone').value = telefone;
    document.getElementById('tr_tema').value = tema;
    abrirAba('aba-treinamentos');
    document.getElementById('tr_predio').focus();
};

async function salvarTreinamento() {
    const colaborador = document.getElementById('tr_colaborador').value;
    const telefone = document.getElementById('tr_telefone').value;
    const tema = document.getElementById('tr_tema').value;
    const predio = document.getElementById('tr_predio').value;
    const setor = document.getElementById('tr_setor').value;
    const andar = document.getElementById('tr_andar').value;
    const dataHora = document.getElementById('tr_data_hora').value;

    if (!colaborador || !tema || !dataHora || !setor) {
        return alert("Preencha os campos obrigatórios.");
    }

    try {
        const { error: errAgendamento } = await supabase.from('treinamentos').insert([{
            colaborador: colaborador,
            telefone: telefone,
            tema: tema,
            predio: predio,
            setor: setor,
            andar: andar,
            data_hora: dataHora,
            status: 'Agendado',
            solicitacao_id: idSolicitacaoEmAndamento 
        }]);

        if (errAgendamento) throw errAgendamento;

        if (idSolicitacaoEmAndamento) {
            await supabase.from('solicitacoes_treinamento')
                .update({ status: 'Agendado' })
                .eq('id', idSolicitacaoEmAndamento);
        }

        alert("Treinamento agendado com sucesso!");
        
        idSolicitacaoEmAndamento = null; 
        document.getElementById('form-novo-treinamento').reset();
        carregarListaTreinamentos();
        if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard(); 

    } catch (err) { alert("Erro ao agendar: " + err.message); }
}

// 🟢 Tabela de Agenda de Treinamentos (Padrão Mediano 140px)
async function carregarListaTreinamentos() {
    try {
        const { data, error } = await supabase.from('treinamentos')
            .select('*')
            .eq('status', 'Agendado') 
            .order('data_hora', { ascending: true }); 

        if (error) throw error;

        const tbody = document.getElementById('lista-treinamentos-aba');
        if (tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(t => {
                const dataFormatada = new Date(t.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
                
                let corStatus = '#3498db'; 

                let botoesAcao = `
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;">
                        <button class="btn-primary btn-sm" style="background: #f39c12; flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalEditarTreinamento('${t.id}')">✏️ Editar</button>
                        <button class="btn-success btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalFinalizarTreinamento('${t.id}')">✔️ Concluir</button>
                        <button class="btn-danger btn-sm" style="flex: 1; min-width: 100%; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="cancelarTreinamento('${t.id}')">❌ Cancelar</button>
                    </div>
                `;

                return `
                    <tr>
                        <td style="font-size: 12px;"><strong>${dataFormatada}</strong></td>
                        <td style="font-size: 12px;">${t.colaborador}<br><small>${t.telefone}</small></td>
                        <td style="font-size: 12px;"><strong>${t.tema}</strong></td>
                        <td style="font-size: 12px;">${t.predio} - ${t.setor} <br><small>(${t.andar})</small></td>
                        
                        <td style="width: 140px; min-width: 140px;">
                            <div style="margin-bottom: 6px;">
                                <span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${t.status}</span>
                            </div>
                            ${botoesAcao}
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="5" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum treinamento pendente na agenda.</td></tr>';
        }

        if(typeof carregarHistoricoTreinamentos === 'function') carregarHistoricoTreinamentos();

    } catch (err) { console.error("Erro ao carregar treinamentos:", err); }
}

function verificarEnterFiltroHistorico(event) {
    if (event.key === 'Enter') carregarHistoricoTreinamentos();
}

async function carregarHistoricoTreinamentos() {
    const nome = document.getElementById('filtro_hist_tr_colaborador').value.trim();
    paginaAtualHistorico = 1; 

    try {
        let query = supabase.from('treinamentos')
            .select('*')
            .neq('status', 'Agendado')
            .order('data_hora', { ascending: false });

        if (nome) query = query.ilike('colaborador', `%${nome}%`);

        const { data, error } = await query;
        if (error) throw error;

        dadosHistoricoTr = data || [];
        renderizarTabelaHistorico(); 
    } catch (err) { console.error("Erro ao carregar histórico de treinamentos:", err); }
}

// 🟢 Tabela de Histórico de Treinamentos (Padrão Mediano 140px)
function renderizarTabelaHistorico() {
    const tbody = document.getElementById('lista-historico-treinamentos-aba');
    const spanPagina = document.getElementById('span-pagina-historico');
    if (!tbody) return;

    const totalPaginas = Math.ceil(dadosHistoricoTr.length / itensPorPaginaTr) || 1;
    if (spanPagina) spanPagina.innerText = `Página ${paginaAtualHistorico} de ${totalPaginas}`;

    const inicio = (paginaAtualHistorico - 1) * itensPorPaginaTr;
    const fim = inicio + itensPorPaginaTr;
    const itensPagina = dadosHistoricoTr.slice(inicio, fim);

    tbody.innerHTML = itensPagina.length > 0 ? itensPagina.map(t => {
        const dataFormatada = new Date(t.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
        let corStatus = t.status === 'Concluído' ? '#2ecc71' : '#e74c3c';
        let responsavel = t.responsavel_conclusao ? `<span style="font-size: 11px;"><strong>${t.responsavel_conclusao}</strong></span>` : '-';

        return `
            <tr>
                <td style="font-size: 12px;"><strong>${dataFormatada}</strong></td>
                <td style="font-size: 12px;">${t.colaborador}<br><small>${t.telefone}</small></td>
                <td style="font-size: 12px;"><strong>${t.tema}</strong><br><small>${t.predio} - ${t.setor} (${t.andar})</small></td>
                
                <td style="width: 140px; min-width: 140px;">
                    <div style="margin-bottom: 4px;">
                        <span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${t.status}</span>
                    </div>
                    ${t.status === 'Cancelado' && t.motivo_cancelamento ? `<div style="margin-top: 6px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 4px; border-radius: 4px; text-align: center; line-height: 1.3;"><strong>Motivo:</strong> ${t.motivo_cancelamento}</div>` : ''}
                </td>
                
                <td style="font-size: 11px;">${responsavel}</td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="5" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum registro encontrado no histórico.</td></tr>';
}

function mudarPaginaHistorico(direcao) {
    const totalPaginas = Math.ceil(dadosHistoricoTr.length / itensPorPaginaTr) || 1;
    paginaAtualHistorico += direcao;

    if (paginaAtualHistorico < 1) paginaAtualHistorico = 1;
    if (paginaAtualHistorico > totalPaginas) paginaAtualHistorico = totalPaginas;

    renderizarTabelaHistorico();
}

async function abrirModalEditarTreinamento(id) {
    try {
        const { data: t, error } = await supabase.from('treinamentos').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('edit_tr_id').value = t.id;
        document.getElementById('edit_tr_colaborador').value = t.colaborador;
        document.getElementById('edit_tr_telefone').value = t.telefone;
        document.getElementById('edit_tr_tema').value = t.tema;
        
        // 🟢 PREENCHE O PRÉDIO E CHAMA A INTELIGÊNCIA DOS ANDARES
        document.getElementById('edit_tr_predio').value = t.predio;
        atualizarAndares('edit_tr_predio', 'edit_tr_andar', t.andar);
        
        document.getElementById('edit_tr_setor').value = t.setor;
        document.getElementById('edit_tr_data_hora').value = t.data_hora;

        abrirModal('modal-editar-treinamento');
    } catch (err) {
        alert("Erro ao carregar dados do treinamento: " + err.message);
    }
}

async function salvarEdicaoTreinamento() {
    const id = document.getElementById('edit_tr_id').value;
    const colaborador = document.getElementById('edit_tr_colaborador').value;
    const telefone = document.getElementById('edit_tr_telefone').value;
    const tema = document.getElementById('edit_tr_tema').value;
    const predio = document.getElementById('edit_tr_predio').value;
    const setor = document.getElementById('edit_tr_setor').value;
    const andar = document.getElementById('edit_tr_andar').value;
    const dataHora = document.getElementById('edit_tr_data_hora').value;

    if (!colaborador || !tema || !dataHora || !setor) {
        return alert("Preencha os campos obrigatórios.");
    }

    try {
        const { error } = await supabase.from('treinamentos').update({
            colaborador: colaborador,
            telefone: telefone,
            tema: tema,
            predio: predio,
            setor: setor,
            andar: andar,
            data_hora: dataHora
        }).eq('id', id);

        if (error) throw error;

        alert("Treinamento atualizado com sucesso!");
        fecharModal('modal-editar-treinamento');
        carregarListaTreinamentos();
        if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
    } catch (err) {
        alert("Erro ao salvar edição do treinamento: " + err.message);
    }
}

async function cancelarTreinamento(id) {
    pedirMotivo(
        "Cancelar Agendamento", 
        "Digite o motivo do cancelamento deste treinamento:", 
        "Motivo...", 
        "perigo", 
        async (motivo) => {
            try {
                const { error } = await supabase.from('treinamentos').update({
                    status: 'Cancelado',
                    motivo_cancelamento: motivo
                }).eq('id', id);
                if (error) throw error;
                
                alert("✅ Treinamento cancelado na agenda!");
                carregarListaTreinamentos();
                if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
            } catch (err) { alert("❌ Erro ao cancelar: " + err.message); }
        }
    );
}

async function alterarStatusTreinamentoExt(id, novoStatus) {
    let tipoModal = novoStatus === 'Cancelado' ? 'perigo' : 'info';

    perguntar(
        "Confirma a baixa da Solicitação", 
        `Confirma a mudança desta requisição para "${novoStatus}"?`, 
        tipoModal, 
        async () => {
            try {
                const { error } = await supabase.from('solicitacoes_treinamento').update({ status: novoStatus }).eq('id', id);
                if (error) throw error;
                
                alert(`✅ Solicitação movida para ${novoStatus}!`);
                carregarSolicitacoesTreinamento();
            } catch (err) { alert("❌ Erro ao atualizar Treinamento: " + err.message); }
        }
    );
}

async function abrirModalFinalizarTreinamento(id) {
    document.getElementById('ft_treinamento_id').value = id;
    limparCanvas('canvas-finalizar-treinamento');
    
    try {
        const { data, error } = await supabase.from('profiles').select('id, nome').order('nome');
        if (!error) {
            const sel = document.getElementById('ft_tecnico');
            sel.innerHTML = '<option value="">Selecione o Técnico...</option>' + 
                            data.map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
        }
    } catch (e) { console.error(e); }

    abrirModal('modal-finalizar-treinamento');
}

async function salvarTreinamentoConcluido() {
    const id = document.getElementById('ft_treinamento_id').value;
    const tecnico = document.getElementById('ft_tecnico').value;

    if (!tecnico) return alert("Selecione o técnico responsável.");

    try {
        const { data: treinamento } = await supabase.from('treinamentos').select('solicitacao_id').eq('id', id).single();

        const sigUrl = await uploadAssinatura(document.getElementById('canvas-finalizar-treinamento'), 'conclusao_treinamento');

        await supabase.from('treinamentos').update({
            status: 'Concluído',
            responsavel_conclusao: tecnico,
            assinatura_url: sigUrl
        }).eq('id', id);

        if (treinamento && treinamento.solicitacao_id) {
            await supabase.from('solicitacoes_treinamento')
                .update({ status: 'Realizado' })
                .eq('id', treinamento.solicitacao_id);
        }

        alert("Treinamento finalizado!");
        fecharModal('modal-finalizar-treinamento');
        carregarListaTreinamentos();
        if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
    } catch (err) { alert("Erro: " + err.message); }
}
// ==========================================
// ABA CONFIGURAÇÕES (SOMENTE OPERACIONAL)
// ==========================================

async function carregarMeusDados() {
    try {
        // Vai direto na fonte sem depender de variável global
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr || !authData.user) return;

        const { data: perfil, error: perfilErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();

        if (perfilErr) throw perfilErr;

        // Preenche os campos na marra
        document.getElementById('meu_email').value = perfil.email || '';
        document.getElementById('meu_nome').value = perfil.nome || '';
        document.getElementById('meu_celular').value = perfil.celular || '';
        document.getElementById('meu_cpf').value = perfil.cpf || '';

    } catch (err) {
        console.error("Erro ao carregar aba de configurações:", err);
    }
}

async function salvarMeusDados() {
    const email = document.getElementById('meu_email').value;
    const nome = document.getElementById('meu_nome').value;
    const celular = document.getElementById('meu_celular').value;
    const cpf = document.getElementById('meu_cpf').value;

    if (!nome || !email) return alert("Nome e E-mail são obrigatórios.");

    try {
        // Confirma a sessão antes de salvar
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) return alert("Sessão expirada. Faça login novamente.");

        const { error } = await supabase.from('profiles').update({
            email: email,
            nome: nome,
            celular: celular,
            cpf: cpf
        }).eq('id', authData.user.id);

        if (error) throw error;

        alert("Seus dados foram atualizados com sucesso!");
        
        // Atualiza a variável global
        if (typeof usuarioAtual !== 'undefined') {
            usuarioAtual.email = email;
            usuarioAtual.nome = nome;
            usuarioAtual.celular = celular;
            usuarioAtual.cpf = cpf;
        }
        
        // Atualiza o nome exibido no Header
        const userNameHeader = document.getElementById('user-name');
        if (userNameHeader) {
            userNameHeader.innerText = `Olá, ${nome.split(' ')[0]}`; 
        }
        
    } catch (err) {
        alert("Erro ao salvar seus dados: " + err.message);
    }
}

async function salvarMinhaSenha() {
    const senha1 = document.getElementById('minha_nova_senha').value;
    const senha2 = document.getElementById('minha_nova_senha_conf').value;

    if (!senha1 || !senha2) return alert("Por favor, preencha os dois campos de senha.");
    if (senha1 !== senha2) return alert("Atenção: As senhas digitadas não são iguais!");
    if (senha1.length < 6) return alert("A nova senha deve ter pelo menos 6 caracteres.");

    try {
        // A função de mudar a própria senha usa o modulo auth do supabase
        const { error } = await supabase.auth.updateUser({ password: senha1 });
        
        if (error) throw error;

        alert("Senha alterada com segurança! Na próxima vez, use a nova senha.");
        document.getElementById('form-minha-senha').reset();
        
    } catch (err) {
        alert("Erro ao alterar a senha: " + err.message);
    }
}

// ==========================================
// ADMIN: FUNÇÕES DE CADASTRO E USUÁRIOS
// ==========================================

async function adminCriarUsuario() {
    const nome = document.getElementById('cad_nome').value;
    const turno = document.getElementById('cad_turno').value;
    const celular = document.getElementById('cad_celular').value;
    const cpf = document.getElementById('cad_cpf').value;
    const email = document.getElementById('cad_email').value;
    const senha = document.getElementById('cad_senha').value;

    if (!nome || !email || !senha || !turno) {
        return alert('Por favor, preencha Nome, E-mail, Senha e Turno.');
    }

    try {
        const { error } = await supabase.rpc('admin_criar_usuario', {
            p_email: email,
            p_senha: senha,
            p_nome: nome,
            p_turno: turno,
            p_celular: celular,
            p_cpf: cpf
        });

        if (error) throw error;

        alert(`Sucesso! O usuário ${nome} foi criado.`);
        document.getElementById('form-novo-usuario').reset();
        fecharModal('modal-usuario');
        
    } catch (err) {
        console.error('Erro completo:', err);
        alert('Erro ao criar usuário: ' + (err.message || 'Verifique se o e-mail já existe.'));
    }
}

async function carregarTabelaUsuarios() {
    try {
        const { data: usuarios, error } = await supabase
            .from('profiles')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        const tabela = document.getElementById('tabela-usuarios-admin');
        tabela.innerHTML = ''; 

        usuarios.forEach(user => {
            const tr = document.createElement('tr');
            const cpfUser = user.cpf ? `'${user.cpf}'` : `null`;
            
            tr.innerHTML = `
                <td>${user.nome}</td>
                <td>${user.email}</td>
                <td>
                    <select id="role-${user.id}" class="btn-sm" style="margin-bottom: 0;">
                        <option value="operacional" ${user.role === 'operacional' ? 'selected' : ''}>Operacional</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
                <td>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        <button class="btn-primary btn-sm" onclick="salvarNivelAcesso('${user.id}')">Salvar Edição</button>
                        <button class="btn-primary btn-sm" style="background: #8e44ad;" onclick="prepararEdicaoCompleta('${user.id}')">Alterar Dados</button>
                        <button class="btn-primary btn-sm" style="background: #f39c12;" onclick="redefinirSenhaUsuario('${user.id}', ${cpfUser})">Redefinir Senha</button>
                        <button class="btn-danger btn-sm" onclick="deletarUsuario('${user.id}')">Excluir</button>
                    </div>
                </td>
            `;
            tabela.appendChild(tr);
        });
    } catch (err) {
        console.error("Erro ao carregar tabela:", err.message);
    }
}

async function salvarNivelAcesso(userId) {
    const novoRole = document.getElementById(`role-${userId}`).value;

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ role: novoRole })
            .eq('id', userId);

        if (error) throw error;
        alert("Nível de acesso atualizado com sucesso!");
    } catch (err) {
        alert("Erro ao atualizar nível: " + err.message);
    }
}

async function prepararEdicaoCompleta(userId) {
    try {
        const { data: user, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (error) throw error;

        fecharModal('modal-permissoes');

        document.getElementById('edit_id').value = user.id;
        document.getElementById('edit_nome').value = user.nome || '';
        document.getElementById('edit_turno').value = user.turno || '';
        document.getElementById('edit_celular').value = user.celular || '';
        document.getElementById('edit_cpf').value = user.cpf || '';
        document.getElementById('edit_email').value = user.email || '';

        abrirModal('modal-editar-usuario');
    } catch (err) {
        alert("Erro ao buscar dados: " + err.message);
    }
}

async function salvarEdicaoUsuario() {
    const userId = document.getElementById('edit_id').value;
    const nome = document.getElementById('edit_nome').value;
    const turno = document.getElementById('edit_turno').value;
    const celular = document.getElementById('edit_celular').value;
    const cpf = document.getElementById('edit_cpf').value;
    const email = document.getElementById('edit_email').value;

    try {
        const { error } = await supabase.from('profiles').update({
            nome: nome,
            turno: turno,
            celular: celular,
            cpf: cpf,
            email: email
        }).eq('id', userId);

        if (error) throw error;

        alert("Dados alterados com sucesso no Perfil!");
        fecharModal('modal-editar-usuario');
        abrirModal('modal-permissoes'); 
        
    } catch (err) {
        alert("Erro ao salvar: " + err.message);
    }
}

async function redefinirSenhaUsuario(userId, cpfUsuario) {
    if (!cpfUsuario || cpfUsuario.length < 4) {
        return alert("❌ Erro: O usuário não possui um CPF válido para gerar a senha.");
    }
    const cpfNumeros = cpfUsuario.replace(/\D/g, ""); 
    const novaSenha = cpfNumeros.substring(0, 4);

    perguntar(
        "Redefinir Senha", 
        `A nova senha será os 4 primeiros dígitos do CPF (${novaSenha}). Confirmar operação?`, 
        "aviso", 
        async () => {
            try {
                const { error } = await supabase.rpc('admin_redefinir_senha', { p_user_id: userId, p_nova_senha: novaSenha });
                if (error) throw error;
                alert(`✅ Sucesso! A senha foi redefinida para: ${novaSenha}`);
            } catch (err) {
                alert("❌ Erro ao redefinir senha: " + err.message);
            }
        }
    );
}

async function deletarUsuario(userId) {
    perguntar(
        "Excluir Usuário", 
        "Tem certeza que deseja excluir este usuário permanentemente do sistema?", 
        "perigo", 
        async () => {
            try {
                const { error } = await supabase.from('profiles').delete().eq('id', userId);
                if (error) throw error;
                
                alert("✅ Usuário removido do sistema!");
                carregarTabelaUsuarios();
            } catch (err) { alert("❌ Erro ao excluir: " + err.message); }
        }
    );
}
async function deletarUsuario(userId) {
    perguntar(
        "Excluir Usuário", 
        "Tem certeza que deseja excluir este usuário permanentemente do sistema?", 
        "perigo", 
        async () => {
            try {
                const { error } = await supabase.from('profiles').delete().eq('id', userId);
                if (error) throw error;
                
                alert("✅ Usuário removido do sistema!");
                carregarTabelaUsuarios();
            } catch (err) { alert("❌ Erro ao excluir: " + err.message); }
        }
    );
}

// ==========================================
// ADMIN: FUNÇÕES DE CADASTRO BASE
// ==========================================

async function adminCadastrarChave() {
    const nome = document.getElementById('cad_chave_nome').value;
    const cor = document.getElementById('cad_chave_cor').value;
    const local = document.getElementById('cad_chave_local').value;

    if(!nome || !cor || !local) return alert('Preencha todos os campos!');

    try {
        const { error } = await supabase.from('chaves').insert([
            { nome: nome, cor: cor, localizacao: local, status: 'disponivel' }
        ]);
        
        if (error) throw error;
        alert('Chave cadastrada com sucesso!');
        fecharModal('modal-chave');
        carregarSelectChaves(); 
    } catch (err) { alert('Erro: ' + err.message); }
}

async function adminCadastrarToner() {
    const modelo = document.getElementById('cad_toner_modelo').value;
    const impressoras = document.getElementById('cad_toner_imp').value;
    const quantidade = document.getElementById('cad_toner_qtd').value;

    if(!modelo || !impressoras || !quantidade) {
        return alert('Preencha todos os campos!');
    }

    try {
        const { error } = await supabase.from('cadastro_toner').insert([
            { modelo_toner: modelo, impressora_compativel: impressoras, quantidade_atual: parseInt(quantidade) }
        ]);
        
        if (error) throw error;
        
        alert('Toner cadastrado com sucesso no estoque!');
        fecharModal('modal-toner');
    } catch (err) { alert('Erro: ' + err.message); }
}

async function adminCadastrarSimpress() {
    const numero = document.getElementById('cad_sim_numero').value;
    const modelo = document.getElementById('cad_sim_modelo').value;
    const serie = document.getElementById('cad_sim_serie').value;
    const local = document.getElementById('cad_sim_local').value;

    if(!numero || !modelo || !serie || !local) return alert('Preencha todos os campos!');

    try {
        const { error } = await supabase.from('chamado_simpress').insert([
            { 
                numero_chamado: numero, 
                modelo_impressora: modelo, 
                numero_serie: serie, 
                setor_localizada: local,
                status: 'Aberto' 
            }
        ]);
        
        if (error) throw error;
        
        alert('Chamado Simpress registrado com sucesso!');
        fecharModal('modal-simpress');
        
        document.getElementById('cad_sim_numero').value = '';
        document.getElementById('cad_sim_modelo').value = '';
        document.getElementById('cad_sim_serie').value = '';
        document.getElementById('cad_sim_local').value = '';

        carregarListaChamados();

    } catch (err) { alert('Erro ao salvar chamado: ' + err.message); }
}

// ==========================================
// TELA INICIAL E AUDITORIA DE PLANTÕES (ADMIN)
// ==========================================

// 🟢 FUNÇÃO AUXILIAR: Remove o "T" do banco e arruma o formato DD/MM/AAAA às HH:MM
function formatarDataCrua(dataIso) {
    if (!dataIso) return '-';
    if (!dataIso.includes('T')) return dataIso;
    const [data, hora] = dataIso.split('T');
    return `${data.split('-').reverse().join('/')} às ${hora}`;
}

async function carregarResumoDashboard() {
    const emptyMsg = (msg) => `<li style="text-align: center; color: #94a3b8; font-size: 12px; padding: 20px;">${msg}</li>`;

    try {
        // TONERS
        const { data: toners } = await supabase.from('cadastro_toner').select('*').order('modelo_toner');
        const dashToners = document.getElementById('dash-toners');
        if (dashToners) {
            dashToners.innerHTML = toners && toners.length > 0
                ? toners.map(t => {
                    const isBaixo = t.quantidade_atual <= 1;
                    const color = isBaixo ? '#e74c3c' : '#2ecc71';
                    const bgBadge = isBaixo ? '#fee2e2' : '#dcfce7';
                    const txtBadge = isBaixo ? '#991b1b' : '#166534';
                    return `
                    <li style="background: #f8fafc; border-left: 4px solid ${color}; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <strong style="font-size: 13px; color: #334155;">${t.modelo_toner}</strong>
                        <span style="background: ${bgBadge}; color: ${txtBadge}; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">${t.quantidade_atual} UN</span>
                    </li>`;
                }).join('') : emptyMsg('✅ Estoque vazio.');
        }

        // CHAVES
        const { data: chaves } = await supabase.from('chaves').select('*').eq('status', 'retirada');
        const dashChaves = document.getElementById('dash-chaves');
        if (dashChaves) {
            dashChaves.innerHTML = chaves && chaves.length > 0
                ? chaves.map(c => `
                    <li style="background: #f8fafc; border-left: 4px solid #e74c3c; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <strong style="font-size: 13px; color: #334155;">${c.nome}</strong>
                        <span style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">EM USO</span>
                    </li>`).join('') : emptyMsg('✅ Todas as chaves na base.');
        }

        // CHAMADOS
        const { data: chamados } = await supabase.from('chamado_simpress').select('*').eq('status', 'Aberto');
        const dashChamados = document.getElementById('dash-chamados');
        if (dashChamados) {
            dashChamados.innerHTML = chamados && chamados.length > 0
                ? chamados.map(c => `
                    <li style="background: #f8fafc; border-left: 4px solid #f39c12; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div>
                            <strong style="font-size: 13px; color: #334155;">Nº ${c.numero_chamado}</strong><br>
                            <span style="font-size: 11px; color: #64748b;">📍 ${c.setor_localizada}</span>
                        </div>
                        <span style="background: #fef08a; color: #b45309; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">ABERTO</span>
                    </li>`).join('') : emptyMsg('✅ Nenhum chamado aberto.');
        }

        // OCORRÊNCIAS
        const { data: ocorrencias } = await supabase.from('ocorrencias').select('*').neq('status', 'Solucionada').neq('status', 'Cancelada');
        const dashOcorrencias = document.getElementById('dash-ocorrencias');
        if (dashOcorrencias) {
            dashOcorrencias.innerHTML = ocorrencias && ocorrencias.length > 0
                ? ocorrencias.map(o => `
                    <li style="background: #f8fafc; border-left: 4px solid #f39c12; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div>
                            <strong style="font-size: 13px; color: #334155;">${o.descricao}</strong><br>
                            <span style="font-size: 11px; color: #64748b;">Prazo: ${o.prazo ? o.prazo.split('-').reverse().join('/') : '-'}</span>
                        </div>
                        <span style="background: #fef08a; color: #b45309; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">PENDENTE</span>
                    </li>`).join('') : emptyMsg('✅ Nenhuma ocorrência pendente.');
        }

        // TIMED
        const { data: timed } = await supabase.from('solicitacoes_cadastro').select('*').in('status', ['Pendente', 'Aguardando']);
        const dashTimed = document.getElementById('dash-timed');
        if (dashTimed) {
            dashTimed.innerHTML = timed && timed.length > 0
                ? timed.map(t => {
                    const isAg = t.status === 'Aguardando';
                    const color = isAg ? '#e74c3c' : '#f39c12';
                    const bgBadge = isAg ? '#fee2e2' : '#fef08a';
                    const txtBadge = isAg ? '#991b1b' : '#b45309';
                    return `
                    <li style="background: #f8fafc; border-left: 4px solid ${color}; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div>
                            <strong style="font-size: 13px; color: #334155;">${t.nome}</strong><br>
                            <span style="font-size: 11px; color: #64748b;">${t.cargo || '-'}</span>
                        </div>
                        <span style="background: ${bgBadge}; color: ${txtBadge}; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">${t.status.toUpperCase()}</span>
                    </li>`;
                }).join('') : emptyMsg('✅ Nenhum cadastro pendente.');
        }

        // AD
        const { data: ad } = await supabase.from('solicitacoes_ad').select('*').eq('status', 'Pendente');
        const dashAd = document.getElementById('dash-ad');
        if (dashAd) {
            dashAd.innerHTML = ad && ad.length > 0
                ? ad.map(a => `
                    <li style="background: #f8fafc; border-left: 4px solid #3498db; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <strong style="font-size: 13px; color: #334155;">${a.nome_completo}</strong>
                        <span style="background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">PENDENTE</span>
                    </li>`).join('') : emptyMsg('✅ Nenhuma solicitação pendente.');
        }

        // PLANTÕES
        const { data: plantoes } = await supabase.from('plantoes').select('*').eq('visto_supervisao', false).order('created_at', { ascending: false });
        const dashPlantoes = document.getElementById('dash-plantoes');
        if (dashPlantoes) {
            dashPlantoes.innerHTML = plantoes && plantoes.length > 0
                ? plantoes.map(p => {
                    const dataC = new Date(p.created_at).toLocaleDateString('pt-BR');
                    const horaC = new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    return `
                    <li style="background: #f8fafc; border-left: 4px solid #f39c12; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div>
                            <strong style="font-size: 13px; color: #334155;">Aberto em: ${dataC} às ${horaC}</strong><br>
                            <span style="font-size: 11px; color: #64748b;">Turno: ${formatarDataCrua(p.hora_assumiu)} até ${formatarDataCrua(p.hora_largou)}</span>
                        </div>
                        <span style="background: #fef08a; color: #b45309; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">PENDENTE</span>
                    </li>`;
                }).join('') : emptyMsg('✅ Todos os plantões com visto.');
        }

        // TREINAMENTOS
        const { data: treinamentos } = await supabase.from('treinamentos').select('*').eq('status', 'Agendado').order('data_hora', { ascending: true }).limit(5);
        const dashTreinamentos = document.getElementById('dash-treinamentos');
        if (dashTreinamentos) {
            dashTreinamentos.innerHTML = treinamentos && treinamentos.length > 0
                ? treinamentos.map(t => {
                    const dtStr = new Date(t.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const [dataF, horaF] = dtStr.split(', ');
                    return `
                        <li style="background: #f8fafc; border-left: 4px solid #3498db; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div>
                                <strong style="font-size: 13px; color: #334155;">${t.tema}</strong><br>
                                <span style="font-size: 11px; color: #64748b;">👤 ${t.colaborador} | 📍 ${t.predio} (${t.setor})</span>
                            </div>
                            <div style="text-align: right; background: #e0f2fe; padding: 4px 8px; border-radius: 6px;">
                                <strong style="font-size: 11px; color: #0369a1;">${dataF}</strong><br>
                                <span style="font-size: 10px; color: #0284c7;">${horaF}</span>
                            </div>
                        </li>`;
                }).join('') : emptyMsg('✅ Agenda de treinamentos livre.');
        }

    } catch (err) { console.error("Erro ao carregar Dashboard:", err.message); }
}

async function carregarPlantoesAdmin() {
    try {
        const { data: plantoes } = await supabase.from('plantoes').select('*').eq('visto_supervisao', false).order('created_at', { ascending: false });
        const adminPlantoes = document.getElementById('admin-plantoes-lista');
        if (adminPlantoes) {
            adminPlantoes.innerHTML = plantoes && plantoes.length 
                ? plantoes.map(p => {
                    const dataC = new Date(p.created_at).toLocaleDateString('pt-BR');
                    const horaC = new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    
                    return `
                    <tr>
                        <td>${dataC}<br><small style="color:#64748b;">${horaC}</small></td>
                        <td>Das ${formatarDataCrua(p.hora_assumiu)} <br>às ${formatarDataCrua(p.hora_largou)}</td>
                        <td><button class="btn-primary btn-sm" style="background: #3498db;" onclick="visualizarPlantao('${p.id}')">👁️ Abrir Ficha de Visto</button></td>
                    </tr>
                `}).join('') 
                : '<tr><td colspan="3" style="text-align: center;">✅ Nada para auditar.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar Plantões no Admin:", err.message); }
}

async function visualizarPlantao(idPlantao) {
    try {
        const { data: p, error } = await supabase.from('plantoes').select('*').eq('id', idPlantao).single();
        if (error) throw error;

        const conteudo = document.getElementById('detalhes-plantao-conteudo');
        
        const dataC = new Date(p.created_at).toLocaleDateString('pt-BR');
        const horaC = new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        conteudo.innerHTML = `
            <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <strong>Data de Registro:</strong> ${dataC} às ${horaC}<br>
                <strong>Turno do Técnico:</strong> Das ${formatarDataCrua(p.hora_assumiu)} às ${formatarDataCrua(p.hora_largou)}<br>
                <strong>Técnicos na Equipe:</strong> ${p.tecnicos_plantao || 'Nenhum / Plantão Sozinho'}
            </div>
            
            <p>📧 <strong>E-mails todos respondidos?</strong> <span style="color: ${p.emails_resp ? 'green' : 'red'}; font-weight: bold;">${p.emails_resp ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_emails ? `↳ Obs: ${p.motivo_emails}` : ''}</span></p>

            <p>🖨️ <strong>Há chamados pendentes?</strong> <span style="color: ${p.chamados_pend ? 'red' : 'green'}; font-weight: bold;">${p.chamados_pend ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_chamados ? `↳ Obs: ${p.motivo_chamados}` : ''}</span></p>

            <p>📝 <strong>MS Forms zerado?</strong> <span style="color: ${p.forms_zerado ? 'green' : 'red'}; font-weight: bold;">${p.forms_zerado ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_forms ? `↳ Obs: ${p.motivo_forms}` : ''}</span></p>

            <p>📚 <strong>Forms de Treinamentos zerado?</strong> <span style="color: ${p.forms_treinamento ? 'green' : 'red'}; font-weight: bold;">${p.forms_treinamento ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_treinamento ? `↳ Obs: ${p.motivo_treinamento}` : ''}</span></p>

            <p>💻 <strong>Todas as máquinas funcionando?</strong> <span style="color: ${p.maquinas_func ? 'green' : 'red'}; font-weight: bold;">${p.maquinas_func ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_maquinas ? `↳ Obs: ${p.motivo_maquinas}` : ''}</span></p>

            <p>🪑 <strong>Cadeiras nos lugares?</strong> <span style="color: ${p.cadeiras_lugar ? 'green' : 'red'}; font-weight: bold;">${p.cadeiras_lugar ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_cadeiras ? `↳ Obs: ${p.motivo_cadeiras}` : ''}</span></p>

            <p>📺 <strong>Painel de TV em operation?</strong> <span style="color: ${p.painel_tv ? 'green' : 'red'}; font-weight: bold;">${p.painel_tv ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_tv ? `↳ Obs: ${p.motivo_tv}` : ''}</span></p>

            <p>⚠️ <strong>Houve ocorrências no plantão?</strong> <span style="color: ${p.ocorrencias ? 'red' : 'green'}; font-weight: bold;">${p.ocorrencias ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_ocorrencias ? `↳ Obs: ${p.motivo_ocorrencias}` : ''}</span></p>

            <div style="margin-top: 15px;">
                <strong>✍️ Assinatura do Técnico:</strong><br>
                <img src="${p.assinatura_url}" style="max-width: 250px; height: auto; border: 1px solid #ccc; border-radius: 4px; background: #fff; margin-top: 5px;">
            </div>
        `;

        document.getElementById('visto_plantao_id').value = idPlantao;
        abrirModal('modal-ver-plantao');

    } catch (err) { alert("Erro ao buscar detalhes do plantão: " + err.message); }
}

async function carregarPlantoesAdmin() {
    try {
        const { data: plantoes } = await supabase.from('plantoes').select('*').eq('visto_supervisao', false).order('created_at', { ascending: false });
        const adminPlantoes = document.getElementById('admin-plantoes-lista');
        if (adminPlantoes) {
            adminPlantoes.innerHTML = plantoes && plantoes.length 
                ? plantoes.map(p => `
                    <tr>
                        <td>${new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                        <td>Das ${p.hora_assumiu} às ${p.hora_largou}</td>
                        <td><button class="btn-primary btn-sm" style="background: #3498db;" onclick="visualizarPlantao('${p.id}')">👁️ Abrir Ficha de Visto</button></td>
                    </tr>
                `).join('') 
                : '<tr><td colspan="3" style="text-align: center;">✅ Nada para auditar.</td></tr>';
        }
    } catch (err) {
        console.error("Erro ao carregar Plantões no Admin:", err.message);
    }
}

async function visualizarPlantao(idPlantao) {
    try {
        const { data: p, error } = await supabase.from('plantoes').select('*').eq('id', idPlantao).single();
        if (error) throw error;

        const conteudo = document.getElementById('detalhes-plantao-conteudo');
        
        // Incluí a visualização dos Técnicos da Equipe caso existam
        conteudo.innerHTML = `
            <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <strong>Data de Registro:</strong> ${new Date(p.created_at).toLocaleDateString('pt-BR')} às ${new Date(p.created_at).toLocaleTimeString('pt-BR')}<br>
                <strong>Turno do Técnico:</strong> ${p.hora_assumiu} às ${p.hora_largou}<br>
                <strong>Técnicos na Equipe:</strong> ${p.tecnicos_plantao || 'Nenhum / Plantão Sozinho'}
            </div>
            
            <p>📧 <strong>E-mails todos respondidos?</strong> <span style="color: ${p.emails_resp ? 'green' : 'red'}; font-weight: bold;">${p.emails_resp ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_emails ? `↳ Obs: ${p.motivo_emails}` : ''}</span></p>

            <p>🖨️ <strong>Há chamados pendentes?</strong> <span style="color: ${p.chamados_pend ? 'red' : 'green'}; font-weight: bold;">${p.chamados_pend ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_chamados ? `↳ Obs: ${p.motivo_chamados}` : ''}</span></p>

            <p>📝 <strong>MS Forms zerado?</strong> <span style="color: ${p.forms_zerado ? 'green' : 'red'}; font-weight: bold;">${p.forms_zerado ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_forms ? `↳ Obs: ${p.motivo_forms}` : ''}</span></p>

            <p>📚 <strong>Forms de Treinamentos zerado?</strong> <span style="color: ${p.forms_treinamento ? 'green' : 'red'}; font-weight: bold;">${p.forms_treinamento ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_treinamento ? `↳ Obs: ${p.motivo_treinamento}` : ''}</span></p>

            <p>💻 <strong>Todas as máquinas funcionando?</strong> <span style="color: ${p.maquinas_func ? 'green' : 'red'}; font-weight: bold;">${p.maquinas_func ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_maquinas ? `↳ Obs: ${p.motivo_maquinas}` : ''}</span></p>

            <p>🪑 <strong>Cadeiras nos lugares?</strong> <span style="color: ${p.cadeiras_lugar ? 'green' : 'red'}; font-weight: bold;">${p.cadeiras_lugar ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_cadeiras ? `↳ Obs: ${p.motivo_cadeiras}` : ''}</span></p>

            <p>📺 <strong>Painel de TV em operation?</strong> <span style="color: ${p.painel_tv ? 'green' : 'red'}; font-weight: bold;">${p.painel_tv ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_tv ? `↳ Obs: ${p.motivo_tv}` : ''}</span></p>

            <p>⚠️ <strong>Houve ocorrências no plantão?</strong> <span style="color: ${p.ocorrencias ? 'red' : 'green'}; font-weight: bold;">${p.ocorrencias ? 'Sim' : 'Não'}</span> <br> 
            <span style="color: #555;">${p.motivo_ocorrencias ? `↳ Obs: ${p.motivo_ocorrencias}` : ''}</span></p>

            <div style="margin-top: 15px;">
                <strong>✍️ Assinatura do Técnico:</strong><br>
                <img src="${p.assinatura_url}" style="max-width: 250px; height: auto; border: 1px solid #ccc; border-radius: 4px; background: #fff; margin-top: 5px;">
            </div>
        `;

        document.getElementById('visto_plantao_id').value = idPlantao;
        abrirModal('modal-ver-plantao');

    } catch (err) {
        alert("Erro ao buscar detalhes do plantão: " + err.message);
    }
}

async function confirmarVistoPlantao() {
    const idPlantao = document.getElementById('visto_plantao_id').value;
    
    perguntar(
        "Confirmar Visto", 
        "Deseja aplicar o visto da supervisão? Este plantão sairá do painel pendente.", 
        "sucesso", 
        async () => {
            try {
                const { error } = await supabase.from('plantoes').update({ visto_supervisao: true }).eq('id', idPlantao);
                if (error) throw error;
                
                alert("✅ Visto registrado com sucesso!");
                fecharModal('modal-ver-plantao');
                
                if (typeof carregarResumoDashboard === 'function') carregarResumoDashboard(); 
                if (typeof carregarPlantoesAdmin === 'function') carregarPlantoesAdmin();
            } catch (err) { alert("❌ Erro ao dar visto: " + err.message); }
        }
    );
}
// ==========================================
// ABA: INVENTÁRIO
// ==========================================
async function abrirModalNovoEquipamento() {
    try {
        // Puxa as categorias que criamos no Supabase
        const { data, error } = await supabase.from('tipos_equipamento').select('nome').order('nome');
        if (!error) {
            const sel = document.getElementById('inv_tipo');
            sel.innerHTML = '<option value="">Selecione o Tipo...</option>' + 
                            data.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');
        }
    } catch (e) { console.error(e); }
    
    document.getElementById('form-novo-equipamento').reset();
    abrirModal('modal-novo-equipamento');
}

async function salvarNovoTipoEquipamento() {
    const nome = document.getElementById('cad_tipo_nome').value.toUpperCase().trim();
    if(!nome) return alert("Digite o nome do tipo de equipamento.");

    try {
        const { error } = await supabase.from('tipos_equipamento').insert([{ nome: nome }]);
        if (error) throw error;
        
        alert("Novo tipo adicionado com sucesso!");
        document.getElementById('cad_tipo_nome').value = '';
        fecharModal('modal-novo-tipo');
        abrirModalNovoEquipamento(); // Atualiza a lista na mesma hora
    } catch (err) {
        alert("Erro: Este tipo talvez já exista. " + err.message);
    }
}

async function salvarEquipamento() {
    const tipo = document.getElementById('inv_tipo').value;
    const marca = document.getElementById('inv_marca').value;
    const modelo = document.getElementById('inv_modelo').value;
    const serie = document.getElementById('inv_serie').value;
    const status = document.getElementById('inv_status').value;
    const predio = document.getElementById('inv_predio').value;
    const andar = document.getElementById('inv_andar').value;
    const setor = document.getElementById('inv_setor').value;

    if(!tipo || !marca || !modelo || !serie || !status) {
        return alert("Preencha os campos obrigatórios (Tipo, Marca, Modelo, Série e Status).");
    }

    try {
        const { error } = await supabase.from('inventario').insert([{
            tipo, marca, modelo, numero_serie: serie, status, predio, andar, setor
        }]);

        if (error) throw error;

        alert("Equipamento cadastrado com sucesso!");
        fecharModal('modal-novo-equipamento');
        carregarInventario();
    } catch(err) {
        alert("Erro ao salvar. Verifique se este Número de Série já está cadastrado. " + err.message);
    }
}

// 🟢 NOVAS FUNÇÕES PARA OS FILTROS DO INVENTÁRIO
async function carregarTiposFiltro() {
    try {
        const { data, error } = await supabase.from('tipos_equipamento').select('nome').order('nome');
        if (!error) {
            const sel = document.getElementById('filtro_inv_tipo');
            sel.innerHTML = '<option value="">Todos</option>' + 
                            data.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');
        }
    } catch (e) { console.error("Erro ao carregar tipos para o filtro:", e); }
}

function limparFiltrosInventario() {
    document.getElementById('filtro_inv_tipo').value = '';
    document.getElementById('filtro_inv_status').value = '';
    document.getElementById('filtro_inv_serie').value = '';
    carregarInventario(); // Recarrega a tabela mostrando todos
}

function verificarEnterFiltro(event) {
    // Permite que o técnico aperte Enter no teclado para buscar, sem precisar clicar no botão
    if (event.key === 'Enter') {
        carregarInventario();
    }
}


async function carregarInventario() {
    const filtroTipo = document.getElementById('filtro_inv_tipo').value;
    const filtroStatus = document.getElementById('filtro_inv_status').value;
    const filtroSerie = document.getElementById('filtro_inv_serie').value.trim();

    try {
        // Inicia a query pegando todos os itens
        let query = supabase.from('inventario').select('*').order('created_at', { ascending: false });

        // Se o usuário selecionou Tipo, filtra por Tipo
        if (filtroTipo) {
            query = query.eq('tipo', filtroTipo);
        }
        
        // Se selecionou Status, filtra por Status
        if (filtroStatus) {
            query = query.eq('status', filtroStatus);
        }
        
        // Se digitou Número de Série, usa "ilike" para achar mesmo que seja um pedaço do número
        if (filtroSerie) {
            query = query.ilike('numero_serie', `%${filtroSerie}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const tbody = document.getElementById('lista-inventario-aba');
        if(tbody) {
            // Operador ternário elegante para mostrar mensagem caso os filtros não achem nada
            tbody.innerHTML = data.length > 0 ? data.map(e => {
                let corStatus = '#3498db'; // Azul para estoque
                if (e.status === 'Em uso') corStatus = '#2ecc71'; // Verde
                if (e.status === 'Danificado') corStatus = '#e74c3c'; // Vermelho

                return `
                    <tr>
                        <td><strong>${e.tipo}</strong></td>
                        <td>${e.marca}<br><small>${e.modelo}</small></td>
                        <td>${e.numero_serie}</td>
                        <td>${e.predio || '-'} / ${e.setor || '-'} <br><small>(${e.andar || '-'})</small></td>
                        <td><span style="background-color: ${corStatus}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${e.status}</span></td>
                        <td>
                            <button class="btn-primary btn-sm" style="background: #f39c12;" onclick="alterarStatusInventario('${e.id}')">🔄 Status</button>
                            <button class="btn-danger btn-sm" onclick="deletarEquipamento('${e.id}')">🗑️ Excluir</button>
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="6" style="text-align: center; color: #7f8c8d;">Nenhum equipamento encontrado com estes filtros.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar inventário filtrado:", err); }
}

// 🟢 Abre a nova janela de seleção de Status
function alterarStatusInventario(id) {
    document.getElementById('status_inv_id').value = id;
    document.getElementById('status_inv_novo').value = ''; // Reseta o campo
    abrirModal('modal-status-inventario');
}

// 🟢 Salva o status que o usuário selecionou na lista
async function salvarNovoStatusInventario() {
    const id = document.getElementById('status_inv_id').value;
    const novoStatus = document.getElementById('status_inv_novo').value;

    if (!novoStatus) {
        return alert("⚠️ Atenção: Por favor, selecione um status na lista.");
    }

    try {
        const { error } = await supabase.from('inventario').update({ status: novoStatus }).eq('id', id);
        if (error) throw error;
        
        alert("✅ Status do equipamento atualizado com sucesso!");
        fecharModal('modal-status-inventario');
        carregarInventario(); // Recarrega a tabela na mesma hora
    } catch (err) { 
        alert("❌ Erro ao atualizar status: " + err.message); 
    }
}
async function deletarEquipamento(id) {
    perguntar(
        "Excluir Equipamento", 
        "Tem certeza que deseja excluir este equipamento definitivamente do estoque?", 
        "perigo", 
        async () => {
            try {
                const { error } = await supabase.from('inventario').delete().eq('id', id);
                if (error) throw error;
                
                alert("✅ Equipamento removido do inventário!");
                carregarInventario();
            } catch (err) { alert("❌ Erro ao remover: " + err.message); }
        }
    );
}

// ==========================================
// ADMIN: EXPORTAR PDF E MÁSCARAS
// ==========================================
async function exportarPDF() {
    const elementoParaExportar = document.getElementById('app-wrapper');
    html2pdf().from(elementoParaExportar).save('Relatorio_Plantao.pdf');
}

function mascaraCPF(cpf) {
    let v = cpf.value.replace(/\D/g, ""); 
    if (v.length > 11) v = v.slice(0, 11); 
    
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    
    cpf.value = v;
}

function mascaraTelefone(tel) {
    let v = tel.value.replace(/\D/g, ""); 
    if (v.length > 11) v = v.slice(0, 11); 
    
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    
    tel.value = v;
}

// ==========================================
// NOVA ABA: GESTÃO DE CADASTROS PENDENTES
// ==========================================

function verificarEnterCadastro(event) {
    if (event.key === 'Enter') carregarCadastros();
}

window.abrirModalObsCadastro = function(id, obsCodificada) {
    document.getElementById('obs_cad_id').value = id;
    // Decodifica a string de volta para texto normal com quebra de linha
    document.getElementById('obs_cad_texto').value = obsCodificada && obsCodificada !== 'undefined' ? decodeURIComponent(obsCodificada) : '';
    abrirModal('modal-obs-cadastro');
};

async function carregarCadastros() {
    const status = document.getElementById('filtro_cad_status').value;
    const nome = document.getElementById('filtro_cad_nome').value.trim();

    try {
        let query = supabase.from('solicitacoes_cadastro').select('*').order('created_at', { ascending: false });
        if (status) query = query.eq('status', status);
        if (nome) query = query.ilike('nome', `%${nome}%`);

        const { data, error } = await query;
        if (error) throw error;

        const tbody = document.getElementById('lista-cadastros-aba');
        if (tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(c => {
                let corStatus = c.status === 'Realizado' ? '#2ecc71' : (c.status === 'Aguardando' ? '#e74c3c' : '#f39c12'); 

                let linkDoc = c.foto_documento_url ? `<a href="${c.foto_documento_url}" target="_blank" style="color: #3498db; text-decoration: none; font-weight: bold; display: block; margin-bottom: 3px;">📄 Ver Documento</a>` : '';
                
                let linkConselho = '';
                if (c.numero_conselho && c.numero_conselho.toUpperCase() !== 'ISENTO' && c.numero_conselho.toUpperCase() !== 'NÃO POSSUI') {
                    linkConselho = c.foto_conselho_url ? `<a href="${c.foto_conselho_url}" target="_blank" style="color: #8e44ad; text-decoration: none; font-weight: bold; display: block;">🖼️ Ver Conselho</a>` : '<span style="color: #e74c3c; font-size: 11px; display: block;">Falta Foto Conselho</span>';
                } else {
                    linkConselho = '<span style="color: #7f8c8d; font-size: 11px; font-weight: bold; display: block;">(Isento de Conselho)</span>';
                }

                const realizadoPor = c.realizado_por_nome ? `<span style="font-size: 11px;"><strong>${c.realizado_por_nome}</strong><br><span style="color: #64748b;">${c.realizado_por_email}</span></span>` : '-';
                
                let dataNascFormatada = c.data_nascimento && c.data_nascimento.includes('-') ? c.data_nascimento.split('-').reverse().join('/') : c.data_nascimento;
                
                // 🟢 BLINDAGEM DO TEXTO: Codifica a observação para não quebrar o HTML do botão
                const obsSegura = c.observacao ? encodeURIComponent(c.observacao) : '';
                
                const isAdmin = typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual && window.usuarioAtual.role === 'admin';

                let botoesAcao = '';
                if (c.status !== 'Realizado') {
                    botoesAcao = `
                        <button class="btn-success btn-sm" style="flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="alterarStatusCadastro('${c.id}', 'Realizado')">✔️ Realizado</button>
                        ${c.status === 'Pendente' 
                            ? `<button class="btn-primary btn-sm" style="background: #e74c3c; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="alterarStatusCadastro('${c.id}', 'Aguardando')">⏳ Pausa</button>` 
                            : `<button class="btn-primary btn-sm" style="background: #3498db; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="alterarStatusCadastro('${c.id}', 'Pendente')">▶️ Retorna</button>`
                        }
                        <button class="btn-primary btn-sm" style="background: #95a5a6; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="abrirModalObsCadastro('${c.id}', '${obsSegura}')">📝 Obs</button>
                    `;
                } else {
                    if (isAdmin) {
                        botoesAcao = `
                            <button class="btn-primary btn-sm" style="background: #e67e22; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="alterarStatusCadastro('${c.id}', 'Pendente')">↩️ Desfazer</button>
                            <button class="btn-primary btn-sm" style="background: #95a5a6; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="abrirModalObsCadastro('${c.id}', '${obsSegura}')">📝 Obs</button>
                        `;
                    } else {
                        botoesAcao = `<button class="btn-primary btn-sm" style="background: #95a5a6; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px; width: 100%;" onclick="abrirModalObsCadastro('${c.id}', '${obsSegura}')">📝 Ver Obs</button>`;
                    }
                }

                return `
                    <tr>
                        <td style="font-size: 12px; min-width: 80px;">${new Date(c.created_at).toLocaleDateString('pt-BR')} <br><small style="color:#64748b;">${new Date(c.created_at).toLocaleTimeString('pt-BR')}</small></td>
                        <td style="font-size: 12px;">
                            <strong style="font-size: 13px;">${c.nome}</strong><br>
                            <span style="color:#475569;">CPF:</span> ${c.cpf || '-'}<br>
                            <span style="color:#475569;">CNS:</span> ${c.cns || '-'}<br>
                            <span style="color:#475569;">Nasc:</span> ${dataNascFormatada || '-'} | <span style="color:#475569;">Sexo:</span> ${c.sexo || '-'}
                        </td>
                        <td style="font-size: 12px;">
                            <strong style="color: #2c3e50;">${c.cargo || '-'}</strong><br>
                            <span style="color:#475569;">Setor:</span> ${c.setor_andar || '-'}<br>
                            <span style="color:#475569;">Espec:</span> ${c.especialidade || '-'}<br>
                            <span style="color:#475569;">Vínculo:</span> ${c.vinculo_empregaticio || '-'} <br>
                            <span style="color:#475569;">Matr:</span> ${c.matricula || '-'}
                        </td>
                        <td style="font-size: 12px;">📧 ${c.email || '-'}<br>📱 ${c.telefone || '-'}</td>
                        <td style="font-size: 12px; min-width: 110px;">
                            <span style="color:#475569;">Nº:</span> <strong>${c.numero_conselho || '-'}</strong><br>
                            <div style="margin-top: 5px; background: #f8f9fa; padding: 5px; border-radius: 4px; border: 1px solid #e2e8f0;">
                                ${linkDoc} ${linkConselho}
                            </div>
                        </td>
                        <td style="width: 120px; min-width: 110px;">
                            <div style="margin-bottom: 4px;">
                                <span style="background-color: ${corStatus}; color: white; padding: 4px; border-radius: 4px; font-size: 10px; font-weight: bold; display: block; width: 100%; text-align: center;">${c.status}</span>
                            </div>
                            <div style="display: flex; gap: 2px; flex-wrap: wrap; justify-content: center;">${botoesAcao}</div>
                            ${c.observacao ? `<div style="margin-top: 4px; font-size: 9px; color: #475569; background: #f1f5f9; padding: 2px; border-radius: 4px; text-align: center; line-height: 1.2;"><strong>Obs:</strong> ${c.observacao}</div>` : ''}
                        </td>
                        <td>${realizadoPor}</td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="7" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma solicitação pendente encontrada.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar cadastros:", err); }
}
async function alterarStatusCadastro(id, novoStatus) {
    let tipoModal = novoStatus === 'Realizado' ? 'sucesso' : (novoStatus === 'Aguardando' ? 'aviso' : 'info');
    
    perguntar(
        "Status do Cadastro (TIMED)", 
        `Confirma a mudança de status deste usuário para "${novoStatus}"?`, 
        tipoModal, 
        async () => {
            try {
                let updateData = { status: novoStatus };
                if (novoStatus === 'Realizado') {
                    if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) {
                        updateData.realizado_por_nome = window.usuarioAtual.nome;
                        updateData.realizado_por_email = window.usuarioAtual.email;
                        updateData.data_realizado = new Date().toISOString();
                    }
                } else {
                    updateData.realizado_por_nome = null;
                    updateData.realizado_por_email = null;
                    updateData.data_realizado = null;
                }

                const { error } = await supabase.from('solicitacoes_cadastro').update(updateData).eq('id', id);
                if (error) throw error;
                
                alert(`✅ Status atualizado para ${novoStatus}!`);
                carregarCadastros();
            } catch (err) { alert("❌ Erro ao atualizar status: " + err.message); }
        }
    );
}

async function alterarStatusAD(id, novoStatus) {
    let tipoModal = novoStatus === 'Realizado' ? 'sucesso' : 'info';

    perguntar(
        "Status do AD", 
        `Confirma a alteração do login para "${novoStatus}"?`, 
        tipoModal, 
        async () => {
            try {
                let updateData = { status: novoStatus };
                if (novoStatus === 'Realizado' && typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) {
                    updateData.realizado_por_nome = window.usuarioAtual.nome;
                } else if (novoStatus === 'Pendente') {
                    updateData.realizado_por_nome = null;
                    updateData.motivo_cancelamento = null; 
                }

                const { error } = await supabase.from('solicitacoes_ad').update(updateData).eq('id', id);
                if (error) throw error;
                
                alert(`✅ Ação concluída. AD marcado como ${novoStatus}!`);
                carregarSolicitacoesAD();
            } catch (err) { alert("❌ Erro ao atualizar AD: " + err.message); }
        }
    );
}

async function darBaixaAD(id) {
    pedirMotivo(
        "Baixa em Criação de AD", 
        "Motivo do cancelamento desta criação de usuário:", 
        "Descreva o motivo...", 
        "perigo", 
        async (motivo) => {
            try {
                let updateData = { status: 'Cancelado', motivo_cancelamento: motivo };
                if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) {
                    updateData.realizado_por_nome = window.usuarioAtual.nome;
                }
                const { error } = await supabase.from('solicitacoes_ad').update(updateData).eq('id', id);
                if (error) throw error;

                alert("✅ Solicitação de AD baixada e arquivada!");
                carregarSolicitacoesAD();
            } catch (err) { alert("❌ Erro ao dar baixa: " + err.message); }
        }
    );
}

// ==========================================
// FUNÇÕES FALTANTES: SOLICITAÇÕES AD E TREINAMENTOS (EXTERNOS)
// ==========================================

// --- 1. GESTÃO DE SOLICITAÇÕES DE LOGIN AD ---
function verificarEnterAD(event) {
    if (event.key === 'Enter') carregarSolicitacoesAD();
}

async function carregarSolicitacoesAD() {
    const status = document.getElementById('filtro_ad_status').value;
    const nome = document.getElementById('filtro_ad_nome').value.trim();

    try {
        let query = supabase.from('solicitacoes_ad').select('*').order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);
        if (nome) query = query.ilike('nome_completo', `%${nome}%`);

        const { data, error } = await query;
        if (error) throw error;

        const tbody = document.getElementById('lista-ad-aba');
        if (tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(c => {
                let corStatus = '#f39c12'; // Pendente
                if (c.status === 'Realizado') corStatus = '#2ecc71'; 
                if (c.status === 'Cancelado') corStatus = '#e74c3c'; 

                const realizadoPor = c.realizado_por_nome 
                    ? `<span style="font-size: 11px;"><strong>${c.realizado_por_nome}</strong></span>`
                    : '-';

                const isAdmin = typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual && window.usuarioAtual.role === 'admin';

                let botoesAcao = '';
                if (c.status !== 'Realizado' && c.status !== 'Cancelado') {
                    botoesAcao = `
                        <button class="btn-success btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="alterarStatusAD('${c.id}', 'Realizado')">✔️ Finalizar</button>
                        <button class="btn-danger btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="darBaixaAD('${c.id}')">❌ Baixa</button>
                    `;
                } else {
                    if (isAdmin) {
                        botoesAcao = `
                            <button class="btn-primary btn-sm" style="background: #e67e22; flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="alterarStatusAD('${c.id}', 'Pendente')">↩️ Desfazer</button>
                        `;
                    }
                }

                return `
                    <tr>
                        <td style="font-size: 12px; min-width: 80px;">${new Date(c.created_at).toLocaleDateString('pt-BR')} <br><small style="color:#64748b;">${new Date(c.created_at).toLocaleTimeString('pt-BR')}</small></td>
                        <td style="font-size: 12px;"><strong>${c.nome_completo}</strong></td>
                        <td style="font-size: 12px;">${c.cpf || '-'}</td>
                        
                        <td style="font-size: 12px;">
                            📧 ${c.email || '-'}<br>
                            📱 ${c.telefone || '-'}
                        </td>
                        
                        <td style="width: 140px; min-width: 140px;">
                            <div style="margin-bottom: 6px;">
                                <span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${c.status || 'Pendente'}</span>
                            </div>
                            
                            <div style="display: flex; gap: 4px; flex-wrap: nowrap; justify-content: center;">
                                ${botoesAcao}
                            </div>
                            
                            ${c.status === 'Cancelado' && c.motivo_cancelamento ? `<div style="margin-top: 6px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 4px; border-radius: 4px; text-align: center; line-height: 1.3;"><strong>Motivo:</strong> ${c.motivo_cancelamento}</div>` : ''}
                        </td>
                        
                        <td style="font-size: 11px;">${realizadoPor}</td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="6" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma solicitação de AD encontrada.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar AD:", err); }
}

// --- 2. GESTÃO DE SOLICITAÇÕES DE TREINAMENTO (VINDAS DO SITE) ---
async function carregarSolicitacoesTreinamento() {
    const status = document.getElementById('filtro_sol_tr_status').value;

    try {
        let query = supabase.from('solicitacoes_treinamento').select('*').order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;

        const tbody = document.getElementById('lista-solicita-treinamento-aba');
        if (tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(t => {
                let corStatus = '#f39c12'; // Pendente
                if (t.status === 'Agendado' || t.status === 'Realizado') corStatus = '#2ecc71'; 
                if (t.status === 'Cancelado') corStatus = '#e74c3c'; 

                const setorFormatado = t.setor || t.cargo || '-';
                const contatoFormatado = t.telefone || t.celular || '-';
                const isAdmin = typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual && window.usuarioAtual.role === 'admin';

                let botoesAcao = '';
                if (t.status === 'Pendente' || !t.status) {
                    botoesAcao = `
                        <button class="btn-success btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="prepararAgendamento('${t.id}', '${t.nome_solicitante || t.nome || ''}', '${t.telefone || t.celular || ''}', '${t.tema || ''}')">📅 Agendar</button>
                        <button class="btn-danger btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="alterarStatusTreinamentoExt('${t.id}', 'Cancelado')">❌ Baixa</button>
                    `;
                } else {
                    if (isAdmin) {
                        botoesAcao = `
                            <button class="btn-primary btn-sm" style="background: #e67e22; flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="alterarStatusTreinamentoExt('${t.id}', 'Pendente')">↩️ Desfazer</button>
                        `;
                    }
                }

                return `
                    <tr>
                        <td style="font-size: 12px; min-width: 80px;">${new Date(t.created_at).toLocaleDateString('pt-BR')} <br><small style="color:#64748b;">${new Date(t.created_at).toLocaleTimeString('pt-BR')}</small></td>
                        <td style="font-size: 12px;"><strong>${t.nome_solicitante || t.nome || '-'}</strong><br><small>${contatoFormatado}</small></td>
                        <td style="font-size: 12px;">${setorFormatado}</td>
                        <td style="font-size: 12px;"><strong>${t.tema || '-'}</strong></td>
                        
                        <td style="width: 140px; min-width: 140px;">
                            <div style="margin-bottom: 6px;">
                                <span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${t.status || 'Pendente'}</span>
                            </div>
                            
                            <div style="display: flex; gap: 4px; flex-wrap: nowrap; justify-content: center;">
                                ${botoesAcao}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="5" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma solicitação encontrada.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar solicitações de treinamento:", err); }
}
