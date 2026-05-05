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
// ABA 1: SALVAR PLANTÃO
// ==========================================
async function salvarPlantao() {
    try {
        // 1. Faz upload da assinatura
        const urlAssinatura = await uploadAssinatura(document.getElementById('canvas-plantao'), 'plantao');

        // 2. Coleta os dados 
        const dados = {
            usuario_id: typeof usuarioAtual !== 'undefined' && usuarioAtual ? usuarioAtual.id : null,
            tecnicos_plantao: tecnicosNoPlantao.map(t => t.nome).join(', '), // Nomes da equipe adicionados
            hora_assumiu: document.getElementById('p_hora_assumiu').value,
            hora_largou: document.getElementById('p_hora_largou').value,
            emails_resp: document.getElementById('p_emails').checked,
            motivo_emails: document.getElementById('p_motivo_emails').value,
            chamados_pend: document.getElementById('p_chamados').checked,
            motivo_chamados: document.getElementById('p_motivo_chamados').value,
            forms_zerado: document.getElementById('p_forms').checked,
            motivo_forms: document.getElementById('p_motivo_forms').value,
            
            // NOVO: FORMS DE TREINAMENTO
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

        alert('Plantão registrado com sucesso!');
        
        // 4. Limpa tudo para o próximo plantão
        document.getElementById('form-plantao').reset();
        limparCanvas('canvas-plantao');
        tecnicosNoPlantao = []; // Esvazia o array de colegas
        atualizarInterfaceTecnicos(); // Limpa a lista visual da tela

    } catch (err) {
        console.error(err);
        alert('Erro ao salvar: Verifique se preencheu os horários e assinou.');
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
        
        // NOVO: Lógica de upload de foto exclusiva para DEVOLUÇÃO
        if (tipo === 'devolucao') {
            const inputFoto = document.getElementById('foto-devolucao');
            if (inputFoto.files.length === 0) {
                return alert("Anexe a foto da chave/local para registrar a devolução.");
            }
            
            const fotoFile = inputFoto.files[0];
            const nomeFoto = `devolucao_chave_${Date.now()}_${fotoFile.name}`;
            
            // Usando o mesmo bucket 'assinaturas' que você já tem para armazenar
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

    } catch (err) { 
        alert('Erro ao processar chave: ' + err.message); 
    }
}

// ==========================================
// ABA 3: GESTÃO DE OCORRÊNCIAS 
// ==========================================
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

async function carregarListaOcorrencias() {
    try {
        const { data, error } = await supabase.from('ocorrencias').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        const tbody = document.getElementById('lista-ocorrencias-aba');
        if (tbody) {
            tbody.innerHTML = data.map(o => {
                const prazoFormatado = o.prazo ? o.prazo.split('-').reverse().join('/') : '-';
                
                let corStatus = '#e74c3c'; 
                if (o.status === 'Solucionada') corStatus = '#2ecc71'; 
                else if (o.status === 'Em andamento') corStatus = '#f39c12'; 
                else if (o.status === 'Cancelada') corStatus = '#7f8c8d';

                return `
                    <tr>
                        <td>${o.descricao}</td>
                        <td>${prazoFormatado}</td>
                        <td>${o.responsavel_abertura}</td>
                        <td><span style="background-color: ${corStatus}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${o.status}</span></td>
                        <td>
                            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                                <button class="btn-primary btn-sm" style="background: #3498db;" onclick="abrirModalVerOcorrencia('${o.id}')">👁️ Ver</button>
                                ${o.status !== 'Solucionada' && o.status !== 'Cancelada' ? `
                                    <button class="btn-primary btn-sm" style="background: #f39c12;" onclick="abrirModalEditarOcorrencia('${o.id}')">✏️ Editar</button>
                                    <button class="btn-success btn-sm" onclick="abrirModalFinalizarOcorrencia('${o.id}')">✔️ Solucionar</button>
                                    <button class="btn-danger btn-sm" onclick="cancelarOcorrencia('${o.id}')">❌ Cancelar</button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) { console.error("Erro ao carregar ocorrências:", err.message); }
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

// 🟢 ATUALIZADO: Agora pede o motivo e muda o status
async function cancelarOcorrencia(id) {
    const motivo = prompt("⚠️ Atenção: Por favor, digite o motivo do cancelamento desta ocorrência:");
    
    // Se o usuário clicar em "Cancelar" no prompt, a variável vem nula e abortamos a operação
    if (motivo === null) return; 
    
    // Se o usuário der OK mas deixar em branco, barramos
    if (motivo.trim() === "") {
        return alert("O motivo é obrigatório para cancelar uma ocorrência!");
    }

    try {
        const { error } = await supabase.from('ocorrencias').update({
            status: 'Cancelada',
            motivo_cancelamento: motivo
        }).eq('id', id);
        
        if (error) throw error;

        alert("Ocorrência cancelada com sucesso!");
        carregarListaOcorrencias();
        if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
    } catch (err) {
        alert("Erro ao cancelar ocorrência: " + err.message);
    }
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
        const { data, error } = await supabase.from('chamado_simpress').select('*').eq('status', 'Aberto');
        if (error) throw error;

        const tbody = document.getElementById('lista-chamados-aba');
        if(tbody) {
            tbody.innerHTML = data.map(c => `
                <tr>
                    <td>${c.numero_chamado}</td>
                    <td>${c.modelo_impressora} <br><small>Série: ${c.numero_serie}</small></td>
                    <td>${c.setor_localizada}</td>
                    <td>
                        <button class="btn-success btn-sm" onclick="abrirModalAtenderChamado('${c.id}')">Atendido</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error("Erro ao carregar chamados:", err.message); }
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

    if (!setor || !andar || !predio || inputFoto.files.length === 0) {
        return alert("Preencha todos os campos e anexe a foto da página de teste.");
    }

    try {
        const fotoFile = inputFoto.files[0];
        const nomeFoto = `teste_${Date.now()}_${fotoFile.name}`;
        const { error: errFoto } = await supabase.storage.from('assinaturas').upload(nomeFoto, fotoFile);
        if (errFoto) throw errFoto;
        const fotoUrl = supabase.storage.from('assinaturas').getPublicUrl(nomeFoto).data.publicUrl;

        const sigUrl = await uploadAssinatura(document.getElementById('canvas-troca-toner'), 'troca_toner');

        await supabase.from('registro_troca_toner').insert([{
            toner_id: tonerId,
            usuario_id: typeof usuarioAtual !== 'undefined' && usuarioAtual ? usuarioAtual.id : null,
            foto_teste_url: fotoUrl,
            setor: setor,
            andar: andar,
            predio: predio,
            assinatura_tecnico_url: sigUrl
        }]);

        const { data: tonerAtual } = await supabase.from('cadastro_toner').select('quantidade_atual').eq('id', tonerId).single();
        await supabase.from('cadastro_toner').update({ quantidade_atual: tonerAtual.quantidade_atual - 1 }).eq('id', tonerId);

        alert("Troca registrada com sucesso! Estoque atualizado.");
        document.getElementById('form-troca-toner').reset();
        fecharModal('modal-troca-toner');
        carregarListaToners(); 

    } catch (e) { alert("Erro ao salvar troca: " + e.message); }
}

async function salvarAtendimentoChamado() {
    const chamadoId = document.getElementById('ac_chamado_id').value;
    const solucao = document.getElementById('ac_solucao').value;
    // Puxando do Checkbox atualizado no HTML
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

        alert("Atendimento registrado! O chamado foi movido para os concluídos.");
        document.getElementById('form-atender-chamado').reset();
        fecharModal('modal-atender-chamado');
        carregarListaChamados(); 

    } catch (e) { alert("Erro ao salvar atendimento: " + e.message); }
}

// ==========================================
// ABA: GESTÃO DE TREINAMENTOS
// ==========================================
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
        const { error } = await supabase.from('treinamentos').insert([{
            colaborador: colaborador,
            telefone: telefone,
            tema: tema,
            predio: predio,
            setor: setor,
            andar: andar,
            data_hora: dataHora,
            status: 'Agendado'
        }]);

        if (error) throw error;

        alert("Treinamento agendado com sucesso!");
        document.getElementById('form-novo-treinamento').reset();
        carregarListaTreinamentos();
        if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard(); 

    } catch (err) {
        alert("Erro ao agendar treinamento: " + err.message);
    }
}

// 🟢 ATUALIZADO: Mostra as ações e o status Cancelado/Concluído
async function carregarListaTreinamentos() {
    try {
        const { data, error } = await supabase.from('treinamentos')
            .select('*')
            .order('data_hora', { ascending: false }); // Lista do mais novo para o mais velho

        if (error) throw error;

        const tbody = document.getElementById('lista-treinamentos-aba');
        if (tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(t => {
                const dataFormatada = new Date(t.data_hora).toLocaleString('pt-BR').slice(0, 16);
                
                return `
                    <tr>
                        <td><strong>${dataFormatada}</strong></td>
                        <td>${t.colaborador}<br><small>${t.telefone}</small></td>
                        <td>${t.tema}</td>
                        <td>${t.predio} - ${t.setor} (${t.andar})</td>
                        <td>
                            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                                ${t.status === 'Agendado' ? `
                                    <button class="btn-primary btn-sm" style="background: #f39c12;" onclick="abrirModalEditarTreinamento('${t.id}')">✏️ Editar</button>
                                    <button class="btn-success btn-sm" onclick="abrirModalFinalizarTreinamento('${t.id}')">✔️ Concluir</button>
                                    <button class="btn-danger btn-sm" onclick="cancelarTreinamento('${t.id}')">❌ Cancelar</button>
                                ` : `<em style="font-size:12px; color:${t.status === 'Concluído' ? '#2ecc71' : '#e74c3c'}; font-weight: bold;">${t.status}</em>
                                     ${t.status === 'Cancelado' && t.motivo_cancelamento ? `<br><small style="color:#7f8c8d;">Motivo: ${t.motivo_cancelamento}</small>` : ''}
                                `}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="5" style="text-align: center;">Nenhum treinamento registrado.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar treinamentos:", err); }
}

// 🟢 NOVO: Abre modal para Editar Treinamento
async function abrirModalEditarTreinamento(id) {
    try {
        const { data: t, error } = await supabase.from('treinamentos').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('edit_tr_id').value = t.id;
        document.getElementById('edit_tr_colaborador').value = t.colaborador;
        document.getElementById('edit_tr_telefone').value = t.telefone;
        document.getElementById('edit_tr_tema').value = t.tema;
        document.getElementById('edit_tr_predio').value = t.predio;
        document.getElementById('edit_tr_setor').value = t.setor;
        document.getElementById('edit_tr_andar').value = t.andar;
        document.getElementById('edit_tr_data_hora').value = t.data_hora;

        abrirModal('modal-editar-treinamento');
    } catch (err) {
        alert("Erro ao carregar dados do treinamento: " + err.message);
    }
}

// 🟢 NOVO: Salva a Edição do Treinamento
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

// 🟢 NOVO: Cancelar Treinamento pedindo Motivo
async function cancelarTreinamento(id) {
    const motivo = prompt("⚠️ Atenção: Por favor, digite o motivo do cancelamento deste treinamento:");
    
    if (motivo === null) return; // Se o usuário apertar cancelar no aviso
    if (motivo.trim() === "") return alert("O motivo é obrigatório para cancelar!");

    try {
        const { error } = await supabase.from('treinamentos').update({
            status: 'Cancelado',
            motivo_cancelamento: motivo
        }).eq('id', id);
        
        if (error) throw error;

        alert("Treinamento cancelado com sucesso!");
        carregarListaTreinamentos();
        if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
    } catch (err) {
        alert("Erro ao cancelar treinamento: " + err.message);
    }
}

// Abre o Modal para finalizar e assinar
async function abrirModalFinalizarTreinamento(id) {
    document.getElementById('ft_treinamento_id').value = id;
    limparCanvas('canvas-finalizar-treinamento');
    
    // Puxa os nomes dos técnicos para o select do modal
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

// Salva a conclusão do Treinamento no BD
async function salvarTreinamentoConcluido() {
    const id = document.getElementById('ft_treinamento_id').value;
    const tecnico = document.getElementById('ft_tecnico').value;

    if (!tecnico) return alert("Selecione o técnico responsável.");

    try {
        const sigUrl = await uploadAssinatura(document.getElementById('canvas-finalizar-treinamento'), 'conclusao_treinamento');

        const { error } = await supabase.from('treinamentos').update({
            status: 'Concluído',
            responsavel_conclusao: tecnico,
            assinatura_url: sigUrl
        }).eq('id', id);

        if (error) throw error;

        alert("Treinamento finalizado com sucesso!");
        fecharModal('modal-finalizar-treinamento');
        carregarListaTreinamentos();
        if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();

    } catch (err) {
        alert("Erro ao finalizar treinamento: " + err.message);
    }
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
        return alert("Erro: O usuário não possui um CPF cadastrado ou válido para gerar a senha.");
    }

    const cpfNumeros = cpfUsuario.replace(/\D/g, ""); 
    const novaSenha = cpfNumeros.substring(0, 4);

    if (!confirm(`A nova senha deste usuário será os 4 primeiros dígitos do CPF (${novaSenha}). Confirmar operação?`)) {
        return;
    }
    
    try {
        const { error } = await supabase.rpc('admin_redefinir_senha', { 
            p_user_id: userId, 
            p_nova_senha: novaSenha 
        });

        if (error) throw error;
        
        alert(`Sucesso! A senha foi redefinida para: ${novaSenha}`);
    } catch (err) {
        alert("Erro ao redefinir senha: " + err.message);
    }
}

async function deletarUsuario(userId) {
    if (!confirm("Tem certeza que deseja excluir este usuário permanentemente?")) return;

    try {
        const { error } = await supabase.from('profiles').delete().eq('id', userId);
        if (error) throw error;
        
        alert("Usuário removido!");
        carregarTabelaUsuarios();
    } catch (err) {
        alert("Erro ao excluir: " + err.message);
    }
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

async function carregarResumoDashboard() {
    try {
        const { data: toners } = await supabase.from('cadastro_toner').select('*').order('modelo_toner');
        const dashToners = document.getElementById('dash-toners');
        if (dashToners) {
            dashToners.innerHTML = toners && toners.length 
                ? toners.map(t => `<li>📦 ${t.modelo_toner}: <strong style="color: ${t.quantidade_atual <= 1 ? 'red' : 'green'}">${t.quantidade_atual} un.</strong></li>`).join('') 
                : '<li>Nenhum toner cadastrado.</li>';
        }

        const { data: chaves } = await supabase.from('chaves').select('*').eq('status', 'retirada');
        const dashChaves = document.getElementById('dash-chaves');
        if (dashChaves) {
            dashChaves.innerHTML = chaves && chaves.length 
                ? chaves.map(c => `<li>🔑 ${c.nome} - <span style="color: red; font-weight: bold;">Em uso</span></li>`).join('') 
                : '<li>✅ Todas as chaves na base.</li>';
        }

        const { data: chamados } = await supabase.from('chamado_simpress').select('*').eq('status', 'Aberto');
        const dashChamados = document.getElementById('dash-chamados');
        if (dashChamados) {
            dashChamados.innerHTML = chamados && chamados.length 
                ? chamados.map(c => `<li>🖨️ N ${c.numero_chamado} (${c.setor_localizada})</li>`).join('') 
                : '<li>✅ Nenhum chamado aberto.</li>';
        }

        const { data: ocorrencias } = await supabase.from('ocorrencias').select('*').neq('status', 'Solucionada');
        const dashOcorrencias = document.getElementById('dash-ocorrencias');
        if (dashOcorrencias) {
            dashOcorrencias.innerHTML = ocorrencias && ocorrencias.length 
                ? ocorrencias.map(o => `<li>⚠️ ${o.descricao} <br><small style="color: #666;">Prazo: ${o.prazo ? o.prazo.split('-').reverse().join('/') : '-'} | ${o.status}</small></li>`).join('') 
                : '<li>✅ Nenhuma ocorrência pendente.</li>';
        }

        const { data: plantoes } = await supabase.from('plantoes').select('*').eq('visto_supervisao', false).order('created_at', { ascending: false });
        const dashPlantoes = document.getElementById('dash-plantoes');
        if (dashPlantoes) {
            dashPlantoes.innerHTML = plantoes && plantoes.length 
                ? plantoes.map(p => `
                    <tr>
                        <td>${new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                        <td>Das ${p.hora_assumiu} às ${p.hora_largou}</td>
                        <td style="color: #f39c12; font-weight: bold;">⏳ Pendente</td>
                    </tr>
                `).join('') 
                : '<tr><td colspan="3" style="text-align: center;">✅ Todos os plantões estão com visto da supervisão.</td></tr>';
        }

        // Puxando Treinamentos para o Dashboard
        const { data: treinamentos } = await supabase.from('treinamentos')
            .select('*')
            .eq('status', 'Agendado')
            .order('data_hora', { ascending: true })
            .limit(5); // Puxa só os 5 próximos para não lotar a tela

        const dashTreinamentos = document.getElementById('dash-treinamentos');
        if (dashTreinamentos) {
            dashTreinamentos.innerHTML = treinamentos && treinamentos.length > 0
                ? treinamentos.map(t => {
                    const dataF = new Date(t.data_hora).toLocaleString('pt-BR').slice(0, 16);
                    return `
                        <tr>
                            <td style="color: #42B9EB; font-weight: bold;">${dataF}</td>
                            <td>${t.colaborador}</td>
                            <td>${t.tema}</td>
                            <td>${t.predio} / ${t.setor}</td>
                            <td>${t.telefone}</td>
                        </tr>
                    `;
                }).join('') 
                : '<tr><td colspan="5" style="text-align: center;">✅ Agenda de treinamentos livre.</td></tr>';
        }

    } catch (err) {
        console.error("Erro ao carregar Dashboard:", err.message);
    }
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
    
    if (!confirm("Tem certeza que deseja aplicar o visto da supervisão? Este plantão será arquivado e sairá do painel pendente.")) return;
    
    try {
        const { error } = await supabase.from('plantoes').update({ visto_supervisao: true }).eq('id', idPlantao);
        if (error) throw error;
        
        alert("Visto registrado com sucesso!");
        fecharModal('modal-ver-plantao');
        
        carregarResumoDashboard(); 
        if(typeof carregarPlantoesAdmin === 'function') carregarPlantoesAdmin();
        
    } catch (err) {
        alert("Erro ao dar visto: " + err.message);
    }
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

async function alterarStatusInventario(id) {
    const novoStatus = prompt("Digite o novo status exato (Em uso, Em estoque, Danificado):");
    if(!novoStatus) return;
    
    // Validação para evitar que alguém digite errado
    const statusValido = ['Em uso', 'Em estoque', 'Danificado'].includes(novoStatus);
    if(!statusValido) return alert("Status inválido. Respeite as letras maiúsculas e minúsculas.");

    try {
        const { error } = await supabase.from('inventario').update({ status: novoStatus }).eq('id', id);
        if (error) throw error;
        alert("Status do equipamento atualizado!");
        carregarInventario();
    } catch (err) { alert("Erro ao atualizar: " + err.message); }
}

async function deletarEquipamento(id) {
    if (!confirm("Tem certeza que deseja excluir este equipamento definitivamente da base?")) return;
    try {
        const { error } = await supabase.from('inventario').delete().eq('id', id);
        if (error) throw error;
        alert("Equipamento removido!");
        carregarInventario();
    } catch (err) { alert("Erro ao remover: " + err.message); }
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
                let corStatus = '#f39c12'; // Pendente
                if (c.status === 'Realizado') corStatus = '#2ecc71'; 
                if (c.status === 'Aguardando') corStatus = '#e74c3c'; 

                // Lógica dos Anexos (Documento e Conselho)
                const linkDoc = c.foto_documento_url 
                    ? `<a href="${c.foto_documento_url}" target="_blank" style="color: #3498db; text-decoration: none; font-weight: bold; display: block; margin-bottom: 3px;">📄 Ver Documento</a>` 
                    : '<span style="color: #e74c3c; font-size: 11px; display: block;">Sem Doc.</span>';
                
                // Lógica inteligente para o Conselho (Se tem ou se é isento)
                let linkConselho = '';
                if (c.numero_conselho && c.numero_conselho.toUpperCase() !== 'ISENTO' && c.numero_conselho.toUpperCase() !== 'NÃO POSSUI') {
                    linkConselho = c.foto_conselho_url 
                        ? `<a href="${c.foto_conselho_url}" target="_blank" style="color: #8e44ad; text-decoration: none; font-weight: bold; display: block;">🖼️ Ver Conselho</a>` 
                        : '<span style="color: #e74c3c; font-size: 11px; display: block;">Falta Foto Conselho</span>';
                } else {
                    linkConselho = '<span style="color: #7f8c8d; font-size: 11px; font-weight: bold; display: block;">(Isento de Conselho)</span>';
                }

                // Quem realizou
                const realizadoPor = c.realizado_por_nome 
                    ? `<span style="font-size: 11px;"><strong>${c.realizado_por_nome}</strong><br><span style="color: #64748b;">${c.realizado_por_email}</span></span>`
                    : '-';

                // Formatando a Data de Nascimento para o padrão BR se existir
                let dataNascFormatada = c.data_nascimento;
                if (c.data_nascimento && c.data_nascimento.includes('-')) {
                    dataNascFormatada = c.data_nascimento.split('-').reverse().join('/');
                }

                // 🟢 A LÓGICA QUE TROCA O BOTÃO:
                let botoesAcao = '';
                if (c.status === 'Pendente') {
                    botoesAcao = `
                        <button class="btn-success btn-sm" style="flex: 1; padding: 4px; font-size: 11px;" onclick="alterarStatusCadastro('${c.id}', 'Realizado')">✔️ Finalizar</button>
                        <button class="btn-primary btn-sm" style="background: #e74c3c; flex: 1; padding: 4px; font-size: 11px;" onclick="alterarStatusCadastro('${c.id}', 'Aguardando')">⏳ Pausar</button>
                    `;
                } else if (c.status === 'Aguardando') {
                    botoesAcao = `
                        <button class="btn-success btn-sm" style="flex: 1; padding: 4px; font-size: 11px;" onclick="alterarStatusCadastro('${c.id}', 'Realizado')">✔️ Finalizar</button>
                        <button class="btn-primary btn-sm" style="background: #3498db; flex: 1; padding: 4px; font-size: 11px;" onclick="alterarStatusCadastro('${c.id}', 'Pendente')">▶️ Retornar</button>
                    `;
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

                        <td style="font-size: 12px;">
                            📧 ${c.email || '-'}<br>
                            📱 ${c.telefone || '-'}
                        </td>

                        <td style="font-size: 12px; min-width: 110px;">
                            <span style="color:#475569;">Nº:</span> <strong>${c.numero_conselho || '-'}</strong><br>
                            <div style="margin-top: 5px; background: #f8f9fa; padding: 5px; border-radius: 4px; border: 1px solid #e2e8f0;">
                                ${linkDoc}
                                ${linkConselho}
                            </div>
                        </td>

                        <td style="min-width: 140px;">
                            <div style="margin-bottom: 8px;">
                                <span style="background-color: ${corStatus}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; display: inline-block; width: 100%; text-align: center;">${c.status}</span>
                            </div>
                            
                            <!-- O layout flex original sem estilos intrusos -->
                            <div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;">
                                ${botoesAcao}
                                <button class="btn-primary btn-sm" style="background: #95a5a6; flex: 1; padding: 4px; font-size: 11px;" onclick="abrirModalObsCadastro('${c.id}', \`${c.observacao || ''}\`)">📝 Obs</button>
                            </div>
                            
                            ${c.observacao ? `<div style="margin-top: 8px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 4px; border-radius: 4px; line-height: 1.4;"><strong>Obs:</strong> ${c.observacao}</div>` : ''}
                        </td>

                        <td>${realizadoPor}</td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="7" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma solicitação pendente encontrada.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar cadastros:", err); }
}

async function alterarStatusCadastro(id, novoStatus) {
    if(!confirm(`Confirma a mudança de status para "${novoStatus}"?`)) return;

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
        
        carregarCadastros();
    } catch (err) { alert("Erro ao atualizar status: " + err.message); }
}

function abrirModalObsCadastro(id, obsAtual) {
    document.getElementById('obs_cad_id').value = id;
    document.getElementById('obs_cad_texto').value = obsAtual && obsAtual !== 'undefined' ? obsAtual : '';
    abrirModal('modal-obs-cadastro');
}

async function salvarObsCadastro() {
    const id = document.getElementById('obs_cad_id').value;
    const obs = document.getElementById('obs_cad_texto').value;

    try {
        const { error } = await supabase.from('solicitacoes_cadastro').update({ observacao: obs }).eq('id', id);
        if (error) throw error;
        
        fecharModal('modal-obs-cadastro');
        carregarCadastros();
    } catch (err) { alert("Erro ao salvar observação: " + err.message); }
}
// ==========================================
// NOVA ABA: SOLICITAÇÕES DE TREINAMENTO
// ==========================================

async function carregarSolicitacoesTreinamento() {
    const status = document.getElementById('filtro_sol_tr_status').value;

    try {
        let query = supabase.from('solicitacoes_treinamento').select('*').order('created_at', { ascending: false });
        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;

        const tbody = document.getElementById('lista-solicita-treinamento-aba');
        if (tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(s => {
                let corStatus = '#f39c12'; // Pendente (Laranja)
                if (s.status === 'Agendado') corStatus = '#3498db'; // Agendado (Azul)
                if (s.status === 'Cancelado') corStatus = '#e74c3c'; // Baixa (Vermelho)

                const dataSolicitacao = new Date(s.created_at).toLocaleDateString('pt-BR');
                const horaSolicitacao = new Date(s.created_at).toLocaleTimeString('pt-BR').slice(0, 5);
                
                // Formata a data desejada (se o usuário preencheu no site)
                let dataDesejadaFormatada = 'Não informada';
                if (s.data_desejada) {
                    dataDesejadaFormatada = s.data_desejada.includes('-') ? s.data_desejada.split('-').reverse().join('/') : s.data_desejada;
                }

                return `
                    <tr>
                        <td style="font-size: 12px;">${dataSolicitacao}<br><small style="color: #64748b;">às ${horaSolicitacao}</small></td>
                        <td style="font-size: 12px;"><strong>${s.nome_solicitante}</strong><br><small>📧 ${s.email}<br>📱 ${s.telefone}</small></td>
                        <td style="font-size: 12px;">${s.cargo || '-'}<br><small>📍 ${s.setor_andar || '-'}</small></td>
                        <td style="font-size: 12px;"><strong>${s.tema}</strong><br><small style="color: #8e44ad;">📅 Desejada: ${dataDesejadaFormatada}</small></td>
                        <td><span style="background-color: ${corStatus}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${s.status}</span></td>
                        <td>
                            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                ${s.status === 'Pendente' ? `
                                    <button class="btn-success btn-sm" style="flex: 1; padding: 4px; font-size: 11px;" onclick="prepararAgendamentoTreinamento('${s.id}', '${s.nome_solicitante}', '${s.telefone}', '${s.tema}')">📅 Realizar Marcação</button>
                                ` : ''}
                                <button class="btn-danger btn-sm" style="flex: 1; padding: 4px; font-size: 11px;" onclick="abrirModalObsSolTreinamento('${s.id}', \`${s.observacao || ''}\`)">❌ Dar Baixa</button>
                            </div>
                            ${s.observacao ? `<div style="margin-top: 8px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 4px; border-radius: 4px;"><strong>Obs:</strong> ${s.observacao}</div>` : ''}
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="6" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma solicitação encontrada nos filtros.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar solicitações de treinamento:", err); }
}

function prepararAgendamentoTreinamento(id, nome, telefone, tema) {
    // 1. Abre a aba da Agenda de Treinamentos
    abrirAba('aba-treinamentos');
    
    // 2. Preenche os campos do formulário automaticamente!
    document.getElementById('tr_colaborador').value = nome;
    document.getElementById('tr_telefone').value = telefone;
    document.getElementById('tr_tema').value = tema;
    
    // 3. Atualiza o banco, mudando a solicitação original para "Agendado"
    marcarSolicitacaoComoAgendada(id);
    
    // 4. (Efeito Visual) Faz a tela rolar até o formulário e piscar em verde pra mostrar que preencheu
    const form = document.getElementById('form-novo-treinamento');
    if(form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        form.style.transition = 'box-shadow 0.3s';
        form.style.boxShadow = '0 0 15px rgba(46, 204, 113, 0.6)';
        setTimeout(() => { form.style.boxShadow = 'none'; }, 2500);
    }
}

async function marcarSolicitacaoComoAgendada(id) {
    try {
        await supabase.from('solicitacoes_treinamento').update({ status: 'Agendado' }).eq('id', id);
    } catch (err) { console.error("Erro ao atualizar status do treinamento:", err); }
}

function abrirModalObsSolTreinamento(id, obsAtual) {
    document.getElementById('obs_sol_tr_id').value = id;
    document.getElementById('obs_sol_tr_texto').value = obsAtual && obsAtual !== 'undefined' ? obsAtual : '';
    abrirModal('modal-obs-sol-treinamento');
}

async function salvarObsSolicitacaoTreinamento() {
    const id = document.getElementById('obs_sol_tr_id').value;
    const obs = document.getElementById('obs_sol_tr_texto').value;

    if (!obs) return alert("Por favor, informe o motivo da baixa.");

    try {
        const { error } = await supabase.from('solicitacoes_treinamento').update({ 
            status: 'Cancelado', 
            observacao: obs 
        }).eq('id', id);

        if (error) throw error;
        
        alert("Baixa realizada com sucesso.");
        fecharModal('modal-obs-sol-treinamento');
        carregarSolicitacoesTreinamento(); // Atualiza a tabela na hora
    } catch (err) { alert("Erro ao salvar baixa: " + err.message); }
}

// ==========================================
// NOVA ABA: SOLICITAÇÕES DE LOGIN AD
// ==========================================

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
            tbody.innerHTML = data.length > 0 ? data.map(s => {
                let corStatus = '#f39c12'; // Laranja: Pendente
                if (s.status === 'Realizado') corStatus = '#2ecc71'; // Verde: Realizado

                // Puxa quem fez a criação do login
                const realizadoPor = s.realizado_por_nome 
                    ? `<span style="font-size: 11px;"><strong>${s.realizado_por_nome}</strong><br><span style="color: #64748b;">${s.realizado_por_email}</span></span>`
                    : '-';

                return `
                    <tr>
                        <td style="font-size: 13px;">
                            <strong>${s.nome_completo}</strong><br>
                            <small>📧 ${s.email || 'Não informado'}<br>📱 ${s.telefone || 'Não informado'}</small>
                        </td>
                        <td style="font-size: 12px;">${s.cpf}</td>
                        <td><span style="background-color: ${corStatus}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${s.status}</span></td>
                        <td>
                            ${s.status !== 'Realizado' ? `
                                <button class="btn-success btn-sm" onclick="alterarStatusAD('${s.id}', 'Realizado')">✔️ Finalizar Criação</button>
                            ` : `
                                <button class="btn-primary btn-sm" style="background: #e74c3c;" onclick="alterarStatusAD('${s.id}', 'Pendente')">↩️ Desfazer</button>
                            `}
                        </td>
                        <td>${realizadoPor}</td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="6" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma solicitação encontrada nos filtros atuais.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar solicitações AD:", err); }
}

async function alterarStatusAD(id, novoStatus) {
    if(!confirm(`Confirma a mudança de status para "${novoStatus}"?`)) return;

    try {
        let updateData = { status: novoStatus };

        // Se marcou como "Realizado", o sistema registra quem estava logado
        if (novoStatus === 'Realizado') {
            if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) {
                updateData.realizado_por_nome = window.usuarioAtual.nome;
                updateData.realizado_por_email = window.usuarioAtual.email;
            }
        } else {
            // Se desfez para pendente, apaga quem tinha feito
            updateData.realizado_por_nome = null;
            updateData.realizado_por_email = null;
        }

        const { error } = await supabase.from('solicitacoes_ad').update(updateData).eq('id', id);
        if (error) throw error;
        
        carregarSolicitacoesAD();
    } catch (err) { alert("Erro ao atualizar status: " + err.message); }
}
