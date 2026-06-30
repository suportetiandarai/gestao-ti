// ==========================================
// 🟢 1. UTILITÁRIOS E AVISOS (TOASTS E PROMPTS)
// ==========================================
window.mostrarAviso = function(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;

    let icone = '💡';
    let titulo = 'Informação';

    if (tipo === 'erro') { icone = '❌'; titulo = 'Ops, algo deu errado'; }
    else if (tipo === 'sucesso') { icone = '✅'; titulo = 'Sucesso'; }
    else if (tipo === 'aviso') { icone = '⚠️'; titulo = 'Atenção'; }

    toast.innerHTML = `<span class="toast-icon">${icone}</span><div class="toast-content"><span class="toast-title">${titulo}</span><span>${mensagem}</span></div>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4500);
};

window.alert = function(mensagem) {
    let tipo = 'info';
    let msgLimpa = mensagem;
    
    if (mensagem.toLowerCase().includes('erro') || mensagem.includes('❌')) tipo = 'erro';
    else if (mensagem.toLowerCase().includes('sucesso') || mensagem.includes('✅')) tipo = 'sucesso';
    else if (mensagem.toLowerCase().includes('atenção') || mensagem.includes('⚠️')) tipo = 'aviso';
    
    msgLimpa = mensagem.replace(/[✅❌⚠️💡]/g, '').trim();
    mostrarAviso(msgLimpa, tipo);
};

let callbackConfirmacao = null;
window.perguntar = function(titulo, mensagem, tipo, callback) {
    const txtTitulo = document.getElementById('confirm-titulo');
    const txtMsg = document.getElementById('confirm-mensagem');
    const btnConfirmar = document.getElementById('btn-confirmar-v2');
    const icon = document.getElementById('confirm-icon');

    txtTitulo.innerText = titulo;
    txtMsg.innerText = mensagem;
    callbackConfirmacao = callback;

    if (tipo === 'perigo') { icon.innerText = '🗑️'; btnConfirmar.style.background = '#ef4444'; } 
    else if (tipo === 'sucesso') { icon.innerText = '✅'; btnConfirmar.style.background = '#10b981'; } 
    else { icon.innerText = '⚠️'; btnConfirmar.style.background = '#42B9EB'; }

    btnConfirmar.onclick = () => { fecharModal('modal-confirmacao'); if (callbackConfirmacao) callbackConfirmacao(); };
    abrirModal('modal-confirmacao');
};

window.cancelarConfirmacao = () => { fecharModal('modal-confirmacao'); callbackConfirmacao = null; };

window.pedirMotivo = function(titulo, mensagem, placeholder, tipo, callback) {
    document.getElementById('prompt-titulo').innerText = titulo;
    document.getElementById('prompt-mensagem').innerText = mensagem;
    
    const input = document.getElementById('prompt-input');
    input.placeholder = placeholder;
    input.value = ''; 
    
    const btnConfirmar = document.getElementById('btn-prompt-confirmar');
    const icon = document.getElementById('prompt-icon');
    
    if (tipo === 'perigo') { icon.innerText = '🗑️'; btnConfirmar.style.background = '#ef4444'; } 
    else { icon.innerText = '⚠️'; btnConfirmar.style.background = '#f39c12'; }

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

function formatarDataCrua(dataIso) {
    if (!dataIso) return '-';
    if (!dataIso.includes('T')) return dataIso;
    const [data, hora] = dataIso.split('T');
    return `${data.split('-').reverse().join('/')} às ${hora}`;
}

function isCanvasVazio(canvas) {
    const context = canvas.getContext('2d');
    const pixelBuffer = new Uint32Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    return !pixelBuffer.some(color => color !== 0);
}


// ==========================================
// 🟢 2. SESSÃO E INTERFACE
// ==========================================
let timerInatividade;
function resetarTimerInatividade() {
    clearTimeout(timerInatividade);
    timerInatividade = setTimeout(() => { alert("Sessão expirada por inatividade."); fazerLogout(); }, 1200000); 
}
['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => document.addEventListener(evt, resetarTimerInatividade, true));

setInterval(() => {
    const abaInicio = document.getElementById('aba-inicio');
    const estaLogado = document.getElementById('app-wrapper').offsetParent !== null;
    if (estaLogado && abaInicio && !abaInicio.classList.contains('hidden')) carregarResumoDashboard();
}, 5000);

const ABAS_VALIDAS = new Set(Array.from(document.querySelectorAll('.tab-content')).map(aba => aba.id));
const ABAS_SOMENTE_ADMIN = new Set(['aba-admin']);

function abrirAba(idAba, atualizarHash = true) {
    if (!ABAS_VALIDAS.has(idAba)) idAba = 'aba-inicio';
    if (ABAS_SOMENTE_ADMIN.has(idAba) && !window.temPermissao('admin')) {
        mostrarAviso('Acesso restrito a administradores.', 'erro');
        idAba = 'aba-inicio';
    }

    document.querySelectorAll('.tab-content').forEach(aba => aba.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const abaAlvo = document.getElementById(idAba);
    if (abaAlvo) abaAlvo.classList.remove('hidden');
    
    const botaoClicado = document.querySelector(`button[onclick*="${idAba}"]`);
    if (botaoClicado) botaoClicado.classList.add('active');
    if (atualizarHash && window.location.hash !== `#${idAba}`) window.location.hash = idAba;

    // Inicializadores de aba
    if (idAba === 'aba-cadastros') carregarCadastros();
    if (idAba === 'aba-plantao') carregarTecnicosSelect();
    if (idAba === 'aba-toner') { carregarListaToners(); carregarListaChamados(); }
    if (idAba === 'aba-ocorrencias') carregarListaOcorrencias();
    if (idAba === 'aba-chaves') { carregarSelectChaves(); carregarHistoricoChaves(); }
    if (idAba === 'aba-treinamentos') carregarListaTreinamentos();
    if (idAba === 'aba-solicita-treinamento') carregarSolicitacoesTreinamento();
    if (idAba === 'aba-solicitacoes-ad') carregarSolicitacoesAD();
    if (idAba === 'aba-inventario') {
        carregarTiposFiltro();
        carregarInventario();
        if (typeof inicializarInventarioScanner === 'function') inicializarInventarioScanner();
    }
    if (idAba === 'aba-config') carregarMeusDados();
    if (idAba === 'aba-admin') carregarPlantoesAdmin();
}

function abrirModal(idModal) {
    const modal = document.getElementById(idModal);
    if (!modal) return mostrarAviso('Janela não encontrada.', 'erro');
    if (modal.matches('[data-role="admin"]') && !window.exigirAdmin()) return;
    modal.classList.add('flex');
    if (idModal === 'modal-permissoes') carregarTabelaUsuarios();
}

function fecharModal(idModal) { document.getElementById(idModal).classList.remove('flex'); }

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) event.target.classList.remove('flex');
}

function toggleCondicional(selectId, divId, condicaoShow) {
    const valor = document.getElementById(selectId).value;
    const div = document.getElementById(divId);
    const textarea = div.querySelector('textarea');
    if (valor === condicaoShow) { div.classList.remove('hidden'); textarea.required = true; } 
    else { div.classList.add('hidden'); textarea.required = false; textarea.value = ''; }
}

function toggleCondicionalCheckbox(checkboxElement, divId, mostrarQuandoMarcado) {
    const div = document.getElementById(divId);
    const textarea = div.querySelector('textarea');
    if ((mostrarQuandoMarcado && checkboxElement.checked) || (!mostrarQuandoMarcado && !checkboxElement.checked)) {
        div.classList.remove('hidden'); textarea.required = true;
    } else { div.classList.add('hidden'); textarea.required = false; textarea.value = ''; }
}


// ==========================================
// 🟢 3. DASHBOARD E AUDITORIA DE PLANTÕES
// ==========================================
async function carregarResumoDashboard() {
    const emptyMsg = (msg) => `<li style="text-align: center; color: #94a3b8; font-size: 12px; padding: 20px;">${msg}</li>`;
    try {
        const { data: toners } = await supabase.from('cadastro_toner').select('*').order('modelo_toner');
        const dashToners = document.getElementById('dash-toners');
        if (dashToners) dashToners.innerHTML = toners && toners.length > 0 ? toners.map(t => {
            const isBaixo = t.quantidade_atual <= 1; const color = isBaixo ? '#e74c3c' : '#2ecc71'; const bgBadge = isBaixo ? '#fee2e2' : '#dcfce7'; const txtBadge = isBaixo ? '#991b1b' : '#166534';
            return `<li style="background: #f8fafc; border-left: 4px solid ${color}; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><strong style="font-size: 13px; color: #334155;">${t.modelo_toner}</strong><span style="background: ${bgBadge}; color: ${txtBadge}; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">${t.quantidade_atual} UN</span></li>`;
        }).join('') : emptyMsg('✅ Estoque vazio.');

        const { data: chaves } = await supabase.from('chaves').select('*').eq('status', 'retirada');
        const dashChaves = document.getElementById('dash-chaves');
        if (dashChaves) dashChaves.innerHTML = chaves && chaves.length > 0 ? chaves.map(c => `<li style="background: #f8fafc; border-left: 4px solid #e74c3c; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><strong style="font-size: 13px; color: #334155;">${c.nome}</strong><span style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">EM USO</span></li>`).join('') : emptyMsg('✅ Todas as chaves na base.');

        const { data: chamados } = await supabase.from('chamado_simpress').select('*').eq('status', 'Aberto');
        const dashChamados = document.getElementById('dash-chamados');
        if (dashChamados) dashChamados.innerHTML = chamados && chamados.length > 0 ? chamados.map(c => `<li style="background: #f8fafc; border-left: 4px solid #f39c12; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><div><strong style="font-size: 13px; color: #334155;">Nº ${c.numero_chamado}</strong><br><span style="font-size: 11px; color: #64748b;">📍 ${c.setor_localizada}</span></div><span style="background: #fef08a; color: #b45309; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">ABERTO</span></li>`).join('') : emptyMsg('✅ Nenhum chamado aberto.');

        const { data: ocorrencias } = await supabase.from('ocorrencias').select('*').neq('status', 'Solucionada').neq('status', 'Cancelada');
        const dashOcorrencias = document.getElementById('dash-ocorrencias');
        if (dashOcorrencias) dashOcorrencias.innerHTML = ocorrencias && ocorrencias.length > 0 ? ocorrencias.map(o => `<li style="background: #f8fafc; border-left: 4px solid #f39c12; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><div><strong style="font-size: 13px; color: #334155;">${o.descricao}</strong><br><span style="font-size: 11px; color: #64748b;">Prazo: ${o.prazo ? o.prazo.split('-').reverse().join('/') : '-'}</span></div><span style="background: #fef08a; color: #b45309; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">PENDENTE</span></li>`).join('') : emptyMsg('✅ Nenhuma ocorrência pendente.');

        const { data: timed } = await supabase.from('solicitacoes_cadastro').select('*').in('status', ['Pendente', 'Aguardando']);
        const dashTimed = document.getElementById('dash-timed');
        if (dashTimed) dashTimed.innerHTML = timed && timed.length > 0 ? timed.map(t => {
            const isAg = t.status === 'Aguardando'; const color = isAg ? '#e74c3c' : '#f39c12'; const bgBadge = isAg ? '#fee2e2' : '#fef08a'; const txtBadge = isAg ? '#991b1b' : '#b45309';
            return `<li style="background: #f8fafc; border-left: 4px solid ${color}; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><div><strong style="font-size: 13px; color: #334155;">${t.nome}</strong><br><span style="font-size: 11px; color: #64748b;">${t.cargo || '-'}</span></div><span style="background: ${bgBadge}; color: ${txtBadge}; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">${t.status.toUpperCase()}</span></li>`;
        }).join('') : emptyMsg('✅ Nenhum cadastro pendente.');

        const { data: ad } = await supabase.from('solicitacoes_ad').select('*').eq('status', 'Pendente');
        const dashAd = document.getElementById('dash-ad');
        if (dashAd) dashAd.innerHTML = ad && ad.length > 0 ? ad.map(a => `<li style="background: #f8fafc; border-left: 4px solid #3498db; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><strong style="font-size: 13px; color: #334155;">${a.nome_completo}</strong><span style="background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">PENDENTE</span></li>`).join('') : emptyMsg('✅ Nenhuma solicitação pendente.');

        const { data: plantoes } = await supabase.from('plantoes').select('*').eq('visto_supervisao', false).order('created_at', { ascending: false });
        const dashPlantoes = document.getElementById('dash-plantoes');
        if (dashPlantoes) dashPlantoes.innerHTML = plantoes && plantoes.length > 0 ? plantoes.map(p => {
            const dataC = new Date(p.created_at).toLocaleDateString('pt-BR'); const horaC = new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return `<li style="background: #f8fafc; border-left: 4px solid #f39c12; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><div><strong style="font-size: 13px; color: #334155;">Aberto em: ${dataC} às ${horaC}</strong><br><span style="font-size: 11px; color: #64748b;">Turno: ${formatarDataCrua(p.hora_assumiu)} até ${formatarDataCrua(p.hora_largou)}</span></div><span style="background: #fef08a; color: #b45309; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">PENDENTE</span></li>`;
        }).join('') : emptyMsg('✅ Todos os plantões com visto.');

        const { data: treinamentos } = await supabase.from('treinamentos').select('*').eq('status', 'Agendado').order('data_hora', { ascending: true }).limit(5);
        const dashTreinamentos = document.getElementById('dash-treinamentos');
        if (dashTreinamentos) dashTreinamentos.innerHTML = treinamentos && treinamentos.length > 0 ? treinamentos.map(t => {
            const dtStr = new Date(t.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const [dataF, horaF] = dtStr.split(', ');
            return `<li style="background: #f8fafc; border-left: 4px solid #3498db; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><div><strong style="font-size: 13px; color: #334155;">${t.tema}</strong><br><span style="font-size: 11px; color: #64748b;">👤 ${t.colaborador} | 📍 ${t.predio} (${t.setor})</span></div><div style="text-align: right; background: #e0f2fe; padding: 4px 8px; border-radius: 6px;"><strong style="font-size: 11px; color: #0369a1;">${dataF}</strong><br><span style="font-size: 10px; color: #0284c7;">${horaF}</span></div></li>`;
        }).join('') : emptyMsg('✅ Agenda de treinamentos livre.');
    } catch (err) { console.error("Erro ao carregar Dashboard:", err.message); }
}

async function carregarPlantoesAdmin() {
    if (!window.exigirAdmin()) return;
    try {
        const { data: plantoes } = await supabase.from('plantoes').select('*').eq('visto_supervisao', false).order('created_at', { ascending: false });
        const adminPlantoes = document.getElementById('admin-plantoes-lista');
        if (adminPlantoes) adminPlantoes.innerHTML = plantoes && plantoes.length > 0 ? plantoes.map(p => `<tr><td>${new Date(p.created_at).toLocaleDateString('pt-BR')}</td><td>Das ${p.hora_assumiu} às ${p.hora_largou}</td><td><button class="btn-primary btn-sm" style="background: #3498db;" onclick="visualizarPlantao('${p.id}')">👁️ Abrir Ficha de Visto</button></td></tr>`).join('') : '<tr><td colspan="3" style="text-align: center;">✅ Nada para auditar.</td></tr>';
    } catch (err) { console.error("Erro ao carregar Plantões no Admin:", err.message); }
}

async function visualizarPlantao(idPlantao) {
    try {
        const { data: p, error } = await supabase.from('plantoes').select('*').eq('id', idPlantao).single();
        if (error) throw error;
        const conteudo = document.getElementById('detalhes-plantao-conteudo');
        
        conteudo.innerHTML = `
            <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <strong>Data de Registro:</strong> ${new Date(p.created_at).toLocaleDateString('pt-BR')} às ${new Date(p.created_at).toLocaleTimeString('pt-BR')}<br>
                <strong>Turno do Técnico:</strong> ${p.hora_assumiu} às ${p.hora_largou}<br>
                <strong>Técnicos na Equipe:</strong> ${p.tecnicos_plantao || 'Nenhum / Plantão Sozinho'}
            </div>
            <p>📧 <strong>E-mails todos respondidos?</strong> <span style="color: ${p.emails_resp ? 'green' : 'red'}; font-weight: bold;">${p.emails_resp ? 'Sim' : 'Não'}</span> <br> <span style="color: #555;">${p.motivo_emails ? `↳ Obs: ${p.motivo_emails}` : ''}</span></p>
            <p>🖨️ <strong>Há chamados pendentes?</strong> <span style="color: ${p.chamados_pend ? 'red' : 'green'}; font-weight: bold;">${p.chamados_pend ? 'Sim' : 'Não'}</span> <br> <span style="color: #555;">${p.motivo_chamados ? `↳ Obs: ${p.motivo_chamados}` : ''}</span></p>
            <p>📝 <strong>MS Forms zerado?</strong> <span style="color: ${p.forms_zerado ? 'green' : 'red'}; font-weight: bold;">${p.forms_zerado ? 'Sim' : 'Não'}</span> <br> <span style="color: #555;">${p.motivo_forms ? `↳ Obs: ${p.motivo_forms}` : ''}</span></p>
            <p>📚 <strong>Forms de Treinamentos zerado?</strong> <span style="color: ${p.forms_treinamento ? 'green' : 'red'}; font-weight: bold;">${p.forms_treinamento ? 'Sim' : 'Não'}</span> <br> <span style="color: #555;">${p.motivo_treinamento ? `↳ Obs: ${p.motivo_treinamento}` : ''}</span></p>
            <p>💻 <strong>Todas as máquinas funcionando?</strong> <span style="color: ${p.maquinas_func ? 'green' : 'red'}; font-weight: bold;">${p.maquinas_func ? 'Sim' : 'Não'}</span> <br> <span style="color: #555;">${p.motivo_maquinas ? `↳ Obs: ${p.motivo_maquinas}` : ''}</span></p>
            <p>🪑 <strong>Cadeiras nos lugares?</strong> <span style="color: ${p.cadeiras_lugar ? 'green' : 'red'}; font-weight: bold;">${p.cadeiras_lugar ? 'Sim' : 'Não'}</span> <br> <span style="color: #555;">${p.motivo_cadeiras ? `↳ Obs: ${p.motivo_cadeiras}` : ''}</span></p>
            <p>📺 <strong>Painel de TV em operation?</strong> <span style="color: ${p.painel_tv ? 'green' : 'red'}; font-weight: bold;">${p.painel_tv ? 'Sim' : 'Não'}</span> <br> <span style="color: #555;">${p.motivo_tv ? `↳ Obs: ${p.motivo_tv}` : ''}</span></p>
            <p>⚠️ <strong>Houve ocorrências no plantão?</strong> <span style="color: ${p.ocorrencias ? 'red' : 'green'}; font-weight: bold;">${p.ocorrencias ? 'Sim' : 'Não'}</span> <br> <span style="color: #555;">${p.motivo_ocorrencias ? `↳ Obs: ${p.motivo_ocorrencias}` : ''}</span></p>
            <div style="margin-top: 15px;"><strong>✍️ Assinatura do Técnico:</strong><br><img src="${p.assinatura_url}" style="max-width: 250px; height: auto; border: 1px solid #ccc; border-radius: 4px; background: #fff; margin-top: 5px;"></div>
        `;
        document.getElementById('visto_plantao_id').value = idPlantao;
        abrirModal('modal-ver-plantao');
    } catch (err) { alert("Erro ao buscar detalhes do plantão: " + err.message); }
}

async function confirmarVistoPlantao() {
    if (!window.exigirAdmin()) return;
    const idPlantao = document.getElementById('visto_plantao_id').value;
    perguntar("Confirmar Visto", "Deseja aplicar o visto da supervisão? Este plantão sairá do painel pendente.", "sucesso", async () => {
        try {
            const { error } = await supabase.from('plantoes').update({ visto_supervisao: true }).eq('id', idPlantao);
            if (error) throw error;
            alert("✅ Visto registrado com sucesso!");
            fecharModal('modal-ver-plantao');
            if (typeof carregarResumoDashboard === 'function') carregarResumoDashboard(); 
            if (typeof carregarPlantoesAdmin === 'function') carregarPlantoesAdmin();
        } catch (err) { alert("❌ Erro ao dar visto: " + err.message); }
    });
}


// ==========================================
// 🟢 4. ABA PLANTÃO (SALVAR E TÉCNICOS)
// ==========================================
let tecnicosNoPlantao = []; 
async function carregarTecnicosSelect() {
    try {
        const { data, error } = await supabase.from('profiles').select('id, nome').order('nome');
        if (error) throw error;
        const select = document.getElementById('select-tecnicos-plantao');
        if (select) select.innerHTML = '<option value="">Selecione um colega...</option>' + data.map(u => `<option value="${u.id}">${u.nome}</option>`).join('');
    } catch (err) { console.error("Erro ao carregar técnicos:", err); }
}

function adicionarTecnico() {
    const select = document.getElementById('select-tecnicos-plantao');
    const id = select.value;
    const nome = select.options[select.selectedIndex]?.text;
    if (!id) return alert("Selecione um técnico na lista.");
    if (tecnicosNoPlantao.find(t => t.id === id)) return alert("Este colega já foi adicionado ao plantão!");
    tecnicosNoPlantao.push({ id, nome });
    atualizarInterfaceTecnicos();
    select.value = ''; 
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
    container.innerHTML = tecnicosNoPlantao.map(t => `<div class="tecnico-badge"><span>${t.nome}</span><button type="button" onclick="removerTecnico('${t.id}')" title="Remover">✕</button></div>`).join('');
}

async function salvarPlantao() {
    const horaAssumiu = document.getElementById('p_hora_assumiu').value;
    const horaLargou = document.getElementById('p_hora_largou').value;
    const canvas = document.getElementById('canvas-plantao');

    if (!horaAssumiu || !horaLargou) return alert("⚠️ CAMPO OBRIGATÓRIO: Por favor, preencha o horário que assumiu e o horário que largou o plantão.");
    if (isCanvasVazio(canvas)) return alert("⚠️ ASSINATURA OBRIGATÓRIA: O plantão não pode ser registrado sem a sua assinatura digital.");

    try {
        const urlAssinatura = await uploadAssinatura(canvas, 'plantao');
        const dados = {
            usuario_id: typeof usuarioAtual !== 'undefined' && usuarioAtual ? usuarioAtual.id : null,
            tecnicos_plantao: tecnicosNoPlantao.map(t => t.nome).join(', '), 
            hora_assumiu: horaAssumiu, hora_largou: horaLargou,
            emails_resp: document.getElementById('p_emails').checked, motivo_emails: document.getElementById('p_motivo_emails').value,
            chamados_pend: document.getElementById('p_chamados').checked, motivo_chamados: document.getElementById('p_motivo_chamados').value,
            forms_zerado: document.getElementById('p_forms').checked, motivo_forms: document.getElementById('p_motivo_forms').value,
            forms_treinamento: document.getElementById('p_forms_treinamento').checked, motivo_treinamento: document.getElementById('p_motivo_treinamento').value,
            maquinas_func: document.getElementById('p_maquinas').checked, motivo_maquinas: document.getElementById('p_motivo_maquinas').value,
            cadeiras_lugar: document.getElementById('p_cadeiras').checked, motivo_cadeiras: document.getElementById('p_motivo_cadeiras').value,
            painel_tv: document.getElementById('p_tv').checked, motivo_tv: document.getElementById('p_motivo_tv').value,
            ocorrencias: document.getElementById('p_ocorrencias').checked, motivo_ocorrencias: document.getElementById('p_motivo_ocorrencias').value,
            assinatura_url: urlAssinatura
        };

        const { error } = await supabase.from('plantoes').insert([dados]);
        if (error) throw error;
        alert('✅ Plantão registrado com sucesso!');
        document.getElementById('form-plantao').reset();
        limparCanvas('canvas-plantao');
        tecnicosNoPlantao = []; 
        atualizarInterfaceTecnicos(); 
    } catch (err) { alert('❌ Erro ao salvar banco de dados.'); }
}


// ==========================================
// 🟢 5. CHAVES
// ==========================================
let paginaAtualChaves = 1; const itensPorPaginaChaves = 5; let dadosHistoricoChaves = [];
window.verificarEnterChaves = function(event) { if (event.key === 'Enter') carregarHistoricoChaves(); }

async function carregarSelectChaves() {
    try {
        const { data: disponiveis } = await supabase.from('chaves').select('*').eq('status', 'disponivel');
        const selDisp = document.getElementById('select-chaves-disponiveis');
        if(selDisp) selDisp.innerHTML = '<option value="">Selecione a chave...</option>' + disponiveis.map(c => `<option value="${c.id}">${c.nome} (${c.localizacao})</option>`).join('');

        const { data: retiradas } = await supabase.from('chaves').select('*').eq('status', 'retirada');
        const selRet = document.getElementById('select-chaves-retiradas');
        if(selRet) selRet.innerHTML = '<option value="">Selecione a chave...</option>' + retiradas.map(c => `<option value="${c.id}">${c.nome} (${c.localizacao})</option>`).join('');
    } catch (err) { console.log("Erro no DB (Chaves):", err); }
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

    if (!chaveId || !dataHora || !responsavel) return alert('Preencha todos os campos antes de prosseguir.');

    try {
        let urlFoto = null;
        if (tipo === 'devolucao') {
            const inputFoto = document.getElementById('foto-devolucao');
            if (inputFoto.files.length === 0) return alert("Anexe a foto da chave/local para registrar a devolução.");
            const fotoFile = inputFoto.files[0];
            const nomeFoto = `devolucao_chave_${Date.now()}_${fotoFile.name}`;
            const { error: errFoto } = await supabase.storage.from('assinaturas').upload(nomeFoto, fotoFile);
            if (errFoto) throw errFoto;
            urlFoto = supabase.storage.from('assinaturas').getPublicUrl(nomeFoto).data.publicUrl;
        }

        const urlAssinatura = await uploadAssinatura(document.getElementById(canvasId), `chave_${tipo}`);
        const payloadMovimento = { chave_id: chaveId, usuario_id: typeof usuarioAtual !== 'undefined' && usuarioAtual ? usuarioAtual.id : null, tipo_movimento: tipo, data_hora: dataHora, responsavel: responsavel, assinatura_url: urlAssinatura };
        if (urlFoto) payloadMovimento.foto_url = urlFoto; 
        await supabase.from('movimentacao_chaves').insert([payloadMovimento]);
        await supabase.from('chaves').update({ status: tipo === 'retirada' ? 'retirada' : 'disponivel' }).eq('id', chaveId);

        alert(`Sucesso! Chave ${tipo === 'retirada' ? 'retirada' : 'devolvida'}.`);
        document.getElementById(formId).reset(); limparCanvas(canvasId); carregarSelectChaves(); carregarHistoricoChaves(); 
    } catch (err) { alert('Erro ao processar chave: ' + err.message); }
}

async function carregarHistoricoChaves() {
    const filtro = document.getElementById('filtro_hist_chaves').value.trim();
    paginaAtualChaves = 1;
    try {
        let query = supabase.from('movimentacao_chaves').select('*, chaves!inner(nome)').order('data_hora', { ascending: false });
        if (filtro) query = query.ilike('chaves.nome', `%${filtro}%`);
        const { data, error } = await query;
        if (error) throw error;
        dadosHistoricoChaves = data || []; renderizarTabelaHistoricoChaves();
    } catch (err) { console.error("Erro ao carregar histórico de chaves:", err.message); }
}

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
        const colorStatus = m.tipo_movimento === 'retirada' ? '#f39c12' : '#2ecc71';
        const linkAssinatura = `<a href="${m.assinatura_url}" target="_blank" style="color: #3498db; font-weight: bold; font-size: 11px; display: block;">✍️ Assinatura</a>`;
        const linkFoto = m.foto_url ? `<a href="${m.foto_url}" target="_blank" style="color: #8e44ad; font-weight: bold; font-size: 11px; display: block; margin-top: 2px;">🖼️ Ver Foto</a>` : '';
        return `<tr><td style="font-size: 12px;">${new Date(m.data_hora).toLocaleString('pt-BR')}</td><td style="font-size: 12px;"><strong>${m.chaves?.nome || 'Removida'}</strong></td><td style="width: 130px;"><span style="background-color: ${colorStatus}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; display: block; text-align: center;">${m.tipo_movimento.toUpperCase()}</span></td><td style="font-size: 12px;">${m.responsavel}</td><td style="background: #f8fafc; border-radius: 4px;">${linkAssinatura}${linkFoto}</td></tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">Nenhum registro encontrado.</td></tr>';
}

function mudarPaginaHistoricoChaves(direcao) {
    const totalPaginas = Math.ceil(dadosHistoricoChaves.length / itensPorPaginaChaves) || 1;
    paginaAtualChaves += direcao;
    if (paginaAtualChaves < 1) paginaAtualChaves = 1;
    if (paginaAtualChaves > totalPaginas) paginaAtualChaves = totalPaginas;
    renderizarTabelaHistoricoChaves();
}


// ==========================================
// 🟢 6. OCORRÊNCIAS
// ==========================================
let paginaAtualOc = 1; const itensPorPaginaOc = 5; let dadosHistoricoOc = [];
window.verificarEnterFiltroOcorrencia = function(event) { if (event.key === 'Enter') { event.preventDefault(); carregarHistoricoOcorrencias(); } }

async function salvarOcorrencia() {
    const descricao = document.getElementById('o_descricao').value; const proposta = document.getElementById('o_proposta').value;
    const prazo = document.getElementById('o_prazo').value; const responsavel = document.getElementById('o_responsavel').value; const observacao = document.getElementById('o_observacao').value;

    if (!descricao || !proposta || !prazo || !responsavel) return alert("Preencha todos os campos obrigatórios da ocorrência.");
    try {
        const sigUrl = await uploadAssinatura(document.getElementById('canvas-nova-ocorrencia'), 'abertura_ocorrencia');
        const { error } = await supabase.from('ocorrencias').insert([{ descricao, solucao_proposta: proposta, prazo, observacao, responsavel_abertura: responsavel, assinatura_abertura_url: sigUrl, status: 'Pendente' }]);
        if (error) throw error;
        alert("Ocorrência registrada com sucesso!");
        document.getElementById('form-nova-ocorrencia').reset(); limparCanvas('canvas-nova-ocorrencia'); carregarListaOcorrencias();
    } catch (err) { alert("Erro ao salvar ocorrência: " + err.message); }
}

async function carregarListaOcorrencias() {
    try {
        const { data, error } = await supabase.from('ocorrencias').select('*').neq('status', 'Solucionada').neq('status', 'Cancelada').order('created_at', { ascending: false });
        if (error) throw error;
        const tbody = document.getElementById('lista-ocorrencias-aba');
        if (tbody) tbody.innerHTML = data.length > 0 ? data.map(o => {
            const prazoFormatado = o.prazo ? o.prazo.split('-').reverse().join('/') : '-';
            let corStatus = o.status === 'Em andamento' ? '#f39c12' : '#e74c3c'; 
            return `<tr><td style="font-size: 12px;"><strong>${o.descricao}</strong><br><small style="color: #7f8c8d;">Abertura: ${new Date(o.created_at).toLocaleDateString('pt-BR')}</small></td><td style="font-size: 12px;">${prazoFormatado}</td><td style="font-size: 12px;">${o.responsavel_abertura}</td><td style="width: 140px; min-width: 140px;"><div style="margin-bottom: 6px;"><span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${o.status}</span></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;"><button class="btn-primary btn-sm" style="background: #3498db; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalVerOcorrencia('${o.id}')">👁️ Ver</button><button class="btn-primary btn-sm" style="background: #f39c12; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalEditarOcorrencia('${o.id}')">✏️ Editar</button><button class="btn-success btn-sm" style="margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalFinalizarOcorrencia('${o.id}')">✔️ Solucionar</button><button class="btn-danger btn-sm" style="margin: 0; padding: 5px 2px; font-size: 11px;" onclick="cancelarOcorrencia('${o.id}')">❌ Cancelar</button></div></td></tr>`;
        }).join('') : '<tr><td colspan="4" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma ocorrência pendente.</td></tr>';
        carregarHistoricoOcorrencias();
    } catch (err) { console.error("Erro ao carregar ocorrências:", err.message); }
}

window.carregarHistoricoOcorrencias = async function() {
    const resp = document.getElementById('filtro_hist_oc_responsavel')?.value.trim() || '';
    const dataFiltro = document.getElementById('filtro_hist_oc_data')?.value || '';
    paginaAtualOc = 1; 
    try {
        let query = supabase.from('ocorrencias').select('*').in('status', ['Solucionada', 'Cancelada']).order('created_at', { ascending: false });
        if (resp) query = query.ilike('responsavel_abertura', `%${resp}%`);
        if (dataFiltro) { const dataInicio = `${dataFiltro}T00:00:00.000Z`; const dataFim = `${dataFiltro}T23:59:59.999Z`; query = query.gte('created_at', dataInicio).lte('created_at', dataFim); }
        const { data, error } = await query;
        if (error) throw error;
        dadosHistoricoOc = data || []; renderizarTabelaHistoricoOc();
    } catch (err) { console.error("Erro ao carregar histórico:", err); }
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
        conteudo.innerHTML = `
            <p><strong>🚨 Ocorrência:</strong> ${o.descricao}</p><p><strong>💡 Solução Proposta:</strong> ${o.solucao_proposta}</p><p><strong>📅 Prazo Máximo:</strong> ${o.prazo ? o.prazo.split('-').reverse().join('/') : '-'}</p><p><strong>👤 Resp. Abertura:</strong> ${o.responsavel_abertura}</p><p><strong>🕒 Data Abertura:</strong> ${new Date(o.created_at).toLocaleString('pt-BR')}</p><p><strong>📝 Observação:</strong> ${o.observacao || 'Nenhuma observação registrada.'}</p><p><strong>📌 Status:</strong> ${o.status}</p>
            ${o.status === 'Cancelada' && o.motivo_cancelamento ? `<hr style="margin: 15px 0; border: 0; border-top: 1px solid #e2e8f0;"><p style="color: #c0392b;"><strong>❌ Motivo do Cancelamento:</strong> ${o.motivo_cancelamento}</p>` : ''}
            ${o.status === 'Solucionada' ? `<hr style="margin: 15px 0; border: 0; border-top: 1px solid #e2e8f0;"><p><strong>✅ Solução Aplicada:</strong> ${o.solucao_aplicada}</p><p><strong>🛠️ Quem Solucionou:</strong> ${o.quem_solucionou}</p><p><strong>👀 Quem Acompanhou:</strong> ${o.quem_acompanhou}</p><p><strong>🏁 Data Finalização:</strong> ${new Date(o.data_finalizacao).toLocaleString('pt-BR')}</p><div style="margin-top: 15px;"><strong>✍️ Assinatura do Fechamento:</strong><br><img src="${o.assinatura_fechamento_url}" style="max-width: 250px; border: 1px solid #ccc; border-radius: 4px; background: #fff; margin-top: 5px;"></div>` : ''}
        `;
        abrirModal('modal-ver-ocorrencia');
    } catch (err) { alert("Erro ao buscar detalhes da ocorrência: " + err.message); }
}

async function abrirModalEditarOcorrencia(id) {
    try {
        const { data: o, error } = await supabase.from('ocorrencias').select('*').eq('id', id).single();
        if (error) throw error;
        document.getElementById('edit_o_id').value = o.id; document.getElementById('edit_o_descricao').value = o.descricao; document.getElementById('edit_o_proposta').value = o.solucao_proposta; document.getElementById('edit_o_prazo').value = o.prazo; document.getElementById('edit_o_responsavel').value = o.responsavel_abertura; document.getElementById('edit_o_observacao').value = o.observacao || '';
        abrirModal('modal-editar-ocorrencia');
    } catch (err) { alert("Erro ao carregar dados para edição: " + err.message); }
}

async function salvarEdicaoOcorrencia() {
    const id = document.getElementById('edit_o_id').value; const descricao = document.getElementById('edit_o_descricao').value; const proposta = document.getElementById('edit_o_proposta').value; const prazo = document.getElementById('edit_o_prazo').value; const responsavel = document.getElementById('edit_o_responsavel').value; const observacao = document.getElementById('edit_o_observacao').value;
    if (!descricao || !proposta || !prazo || !responsavel) return alert("Preencha todos os campos obrigatórios.");
    try {
        const { error } = await supabase.from('ocorrencias').update({ descricao, solucao_proposta: proposta, prazo, responsavel_abertura: responsavel, observacao }).eq('id', id);
        if (error) throw error;
        alert("Ocorrência atualizada com sucesso!"); fecharModal('modal-editar-ocorrencia'); carregarListaOcorrencias();
    } catch (err) { alert("Erro ao salvar edição: " + err.message); }
}

async function cancelarOcorrencia(id) {
    pedirMotivo("Cancelar Ocorrência", "Digite o motivo do cancelamento desta ocorrência:", "Motivo da baixa...", "perigo", async (motivo) => {
        
        let nomeTecnico = 'Sistema';
        if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) nomeTecnico = window.usuarioAtual.nome;

        try {
            const { error } = await supabase.from('ocorrencias').update({ 
                status: 'Cancelada', 
                motivo_cancelamento: motivo,
                quem_solucionou: nomeTecnico, // Grava o nome de quem cancelou
                data_finalizacao: new Date().toISOString() // Grava a data
            }).eq('id', id);
            
            if (error) throw error;
            
            alert("✅ Ocorrência cancelada com sucesso!"); 
            carregarListaOcorrencias(); 
            if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
        } catch (err) { alert("❌ Erro ao cancelar: " + err.message); }
    });
}

// 🟢 ATUALIZADO: Histórico de Ocorrências (Mostrando quem cancelou)
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

        // Puxa a data do cancelamento ou finalização
        const dataFim = o.data_finalizacao || o.updated_at;
        const dataFinalFormatada = dataFim ? new Date(dataFim).toLocaleDateString('pt-BR') : '';

        return `
            <tr>
                <td style="font-size: 12px;"><strong>${o.descricao}</strong><br><small style="color: #7f8c8d;">Data Abert.: ${dataC}</small></td>
                <td style="font-size: 12px;">${o.responsavel_abertura}</td>
                
                <td style="width: 140px; min-width: 140px;">
                    <div style="margin-bottom: 6px;">
                        <span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${o.status}</span>
                    </div>
                    
                    <div style="display: flex; justify-content: center;">
                        <button class="btn-primary btn-sm" style="background: #3498db; width: 100%; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalVerOcorrencia('${o.id}')">👁️ Ver Detalhes</button>
                    </div>
                    
                    ${o.status === 'Cancelada' && o.motivo_cancelamento ? `
                    <div style="margin-top: 6px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 4px; border-radius: 4px; text-align: center; line-height: 1.3;">
                        <strong>Motivo:</strong> ${o.motivo_cancelamento}<br>
                        <span style="color: #94a3b8; font-size: 9px;">Baixa por: ${o.quem_solucionou || 'Sistema'} em ${dataFinalFormatada}</span>
                    </div>` : ''}
                </td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="3" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum registro encontrado no histórico.</td></tr>'; 
}

function abrirModalFinalizarOcorrencia(id) {
    document.getElementById('f_ocorrencia_id').value = id; limparCanvas('canvas-finalizar-ocorrencia'); abrirModal('modal-finalizar-ocorrencia');
}

async function finalizarOcorrencia() {
    const id = document.getElementById('f_ocorrencia_id').value; const solucao = document.getElementById('f_solucao').value; const solucionador = document.getElementById('f_quem_solucionou').value; const acompanhante = document.getElementById('f_quem_acompanhou').value;
    if (!solucao || !solucionador || !acompanhante) return alert("Preencha todos os campos do formulário.");
    try {
        const sigUrl = await uploadAssinatura(document.getElementById('canvas-finalizar-ocorrencia'), 'fechamento_ocorrencia');
        const { error } = await supabase.from('ocorrencias').update({ status: 'Solucionada', solucao_aplicada: solucao, quem_solucionou: solucionador, quem_acompanhou: acompanhante, assinatura_fechamento_url: sigUrl, data_finalizacao: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        alert("Ocorrência solucionada com sucesso!"); document.getElementById('form-finalizar-ocorrencia').reset(); fecharModal('modal-finalizar-ocorrencia'); carregarListaOcorrencias(); 
    } catch (err) { alert("Erro ao finalizar ocorrência: " + err.message); }
}


// ==========================================
// 🟢 7. INVENTÁRIO
// ==========================================
async function abrirModalNovoEquipamento() {
    try {
        const { data, error } = await supabase.from('tipos_equipamento').select('nome').order('nome');
        if (!error) {
            const sel = document.getElementById('inv_tipo');
            sel.innerHTML = '<option value="">Selecione o Tipo...</option>' + data.map(t => `<option value="${invEscape(t.nome)}">${invEscape(t.nome)}</option>`).join('');
        }
    } catch (e) { console.error(e); }
    document.getElementById('form-novo-equipamento').reset(); abrirModal('modal-novo-equipamento');
}

async function salvarNovoTipoEquipamento() {
    if (!window.exigirAdmin()) return;
    const nome = document.getElementById('cad_tipo_nome').value.toUpperCase().trim();
    if(!nome) return alert("Digite o nome do tipo de equipamento.");
    try {
        const { error } = await supabase.from('tipos_equipamento').insert([{ nome: nome }]);
        if (error) throw error;
        alert("Novo tipo adicionado com sucesso!"); document.getElementById('cad_tipo_nome').value = ''; fecharModal('modal-novo-tipo'); abrirModalNovoEquipamento(); 
    } catch (err) { alert("Erro: Este tipo talvez já exista. " + err.message); }
}

function normalizarStatusInventario(valor) {
    const status = String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (!status) return 'Não informado';
    if (status.includes('fora') && status.includes('uso')) return 'Estoque';
    if (status === 'em estoque' || status === 'estoque') return 'Estoque';
    if (status === 'em uso' || status === 'uso') return 'Em uso';
    if (status.includes('danific')) return 'Danificado';
    if (status.includes('nao informado') || status.includes('não informado')) return 'Não informado';
    return String(valor).trim();
}

function normalizarNumeroSerieInventario(valor) {
    return String(valor || '').trim().replace(/^FDRAND-/i, '');
}

function normalizarOrigemPatrimonioInventario(valor) {
    const origem = String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (!origem) return '';
    if (origem.includes('federal')) return 'Federal';
    if (origem.includes('rio') && origem.includes('saude')) return 'RioSaude';
    if (origem === 'riosaude') return 'RioSaude';
    return String(valor).trim();
}

async function salvarEquipamento() {
    const tipo = document.getElementById('inv_tipo').value.trim(); const marca = document.getElementById('inv_marca').value.trim(); const modelo = document.getElementById('inv_modelo').value.trim(); const serie = normalizarNumeroSerieInventario(document.getElementById('inv_serie').value); const status = normalizarStatusInventario(document.getElementById('inv_status').value); const predio = document.getElementById('inv_predio').value; const andar = document.getElementById('inv_andar').value; const setor = document.getElementById('inv_setor').value.trim(); const patrimonio = document.getElementById('inv_patrimonio').value.trim();
    const codigo_barras = normalizarNumeroSerieInventario(document.getElementById('inv_codigo_barras').value);
    const nome = document.getElementById('inv_nome').value.trim();
    const origem_patrimonio = normalizarOrigemPatrimonioInventario(document.getElementById('inv_origem_patrimonio').value);
    const responsavel = document.getElementById('inv_responsavel').value.trim();
    const observacoes = document.getElementById('inv_observacoes').value.trim();
    const contextoLeitura = document.getElementById('inv_contexto_leitura').value.trim();
    if(!tipo || !marca || !modelo || !serie || !status || !predio || !andar) return alert("⚠️ Por favor, preencha todos os campos obrigatórios, incluindo Prédio e Andar.");
    try {
        for (const [rotulo, valor] of [['código de barras', codigo_barras], ['número de série', serie], ['patrimônio', patrimonio]]) {
            if (!valor) continue;
            const { data: duplicados, error: erroBusca } = await supabase.rpc('buscar_equipamento_inventario', { p_codigo: valor });
            if (erroBusca) throw erroBusca;
            if (duplicados?.length) return mostrarAviso(`Possível duplicidade: já existe equipamento com este ${rotulo}. Revise o cadastro.`, 'aviso');
        }
        const novoEquipamento = { nome: nome || null, tipo, marca, modelo, numero_serie: serie, codigo_barras: codigo_barras || null, patrimonio: patrimonio || null, origem_patrimonio: origem_patrimonio || null, status, predio, andar, setor: setor || null, responsavel: responsavel || null, observacoes: observacoes || null };
        const { data, error } = await supabase.from('inventario').insert([novoEquipamento]).select().single();
        if (error) throw error;
        if (contextoLeitura && typeof registrarCadastroNoHistorico === 'function') await registrarCadastroNoHistorico(data, contextoLeitura);
        mostrarAviso("Equipamento cadastrado com sucesso!", 'sucesso'); fecharModal('modal-novo-equipamento'); document.getElementById('form-novo-equipamento').reset(); carregarInventario();
    } catch(err) { alert("❌ Erro ao salvar: " + err.message); }
}

async function carregarTiposFiltro() {
    try {
        const { data, error } = await supabase.from('tipos_equipamento').select('nome').order('nome');
        if (!error) document.getElementById('filtro_inv_tipo').innerHTML = '<option value="">Todos</option>' + data.map(t => `<option value="${invEscape(t.nome)}">${invEscape(t.nome)}</option>`).join('');
    } catch (e) { console.error("Erro ao carregar tipos para o filtro:", e); }
}

function limparFiltrosInventario() {
    document.getElementById('filtro_inv_tipo').value = '';
    document.getElementById('filtro_inv_status').value = '';
    document.getElementById('filtro_inv_serie').value = '';
    const filtroLocalizacao = document.getElementById('filtro_inv_localizacao');
    if (filtroLocalizacao) filtroLocalizacao.value = '';
    carregarInventario();
}
function verificarEnterFiltro(event) { if (event.key === 'Enter') carregarInventario(); }

async function carregarInventario() {
    const filtroTipo = document.getElementById('filtro_inv_tipo').value; const filtroStatus = document.getElementById('filtro_inv_status').value; const filtroSerie = document.getElementById('filtro_inv_serie').value.trim();
    const filtroLocalizacao = document.getElementById('filtro_inv_localizacao')?.value.trim() || '';
    try {
        let query = supabase.from('inventario').select('*').order('created_at', { ascending: false });
        if (filtroTipo) query = query.eq('tipo', filtroTipo); if (filtroStatus) query = query.eq('status', filtroStatus); if (filtroSerie) query = query.ilike('numero_serie', `%${filtroSerie}%`);
        if (filtroLocalizacao) {
            const termoLocalizacao = `%${filtroLocalizacao.replace(/[,%()]/g, ' ')}%`;
            query = query.or(`predio.ilike.${termoLocalizacao},andar.ilike.${termoLocalizacao},setor.ilike.${termoLocalizacao}`);
        }
        const { data, error } = await query; if (error) throw error;
        const tbody = document.getElementById('lista-inventario-aba');
        if (tbody) {
            const isAdmin = typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual && window.usuarioAtual.role === 'admin';
            tbody.innerHTML = data.length > 0 ? data.map(e => {
                const statusNormalizado = normalizarStatusInventario(e.status);
                let corStatus = '#3498db'; if (statusNormalizado === 'Em uso') corStatus = '#2ecc71'; if (statusNormalizado === 'Danificado') corStatus = '#e74c3c'; if (statusNormalizado === 'Estoque') corStatus = '#64748b';
                let botoesAcao = `<button class="btn-primary btn-sm" style="background: #f39c12;" onclick="alterarStatusInventario('${e.id}')">🔄 Status</button>`;
                if (isAdmin) botoesAcao += `<button class="btn-primary btn-sm" style="background: #8e44ad;" onclick="abrirModalEditarEquipamento('${e.id}')">✏️ Editar</button><button class="btn-danger btn-sm" onclick="deletarEquipamento('${e.id}')">🗑️ Excluir</button>`;
                return `
        <tr>
            <td><strong>${invEscape(e.tipo)}</strong></td>
            <td>${invEscape(e.marca)}<br><small>${invEscape(e.modelo)}</small></td>
            <td>${invEscape(e.numero_serie)}</td>
            
            <td style="font-weight: bold; color: #1e293b;">
                ${invEscape(e.patrimonio || '-')}
                ${e.origem_patrimonio ? `<br><small class="badge-patrimonio">Origem: ${invEscape(normalizarOrigemPatrimonioInventario(e.origem_patrimonio))}</small>` : ''}
            </td>

            <td>${invEscape(e.predio || '-')} / ${invEscape(e.setor || '-')} <br><small>(${invEscape(e.andar || '-')})</small></td>
            <td><span style="background-color: ${corStatus}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${invEscape(statusNormalizado)}</span></td>
            <td>
                <div style="display: flex; gap: 5px;">
                    ${botoesAcao}
                </div>
            </td>
        </tr>
    `;
}).join('') : '<tr><td colspan="7" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum equipamento encontrado.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar inventário:", err); }
}

// 🟢 ABRE O MODAL E PREENCHE OS DADOS CORRETAMENTE
async function abrirModalEditarEquipamento(id) {
    if (!window.exigirAdmin()) return;
    try {
        const { data: e, error } = await supabase.from('inventario').select('*').eq('id', id).single();
        if (error) throw error;
        
        const { data: tipos } = await supabase.from('tipos_equipamento').select('nome').order('nome');
        
        document.getElementById('edit_inv_tipo').innerHTML = '<option value="">Selecione...</option>' + tipos.map(t => `<option value="${t.nome}" ${t.nome === e.tipo ? 'selected' : ''}>${t.nome}</option>`).join('');
        
        document.getElementById('edit_inv_id').value = e.id; 
        document.getElementById('edit_inv_nome').value = e.nome || '';
        document.getElementById('edit_inv_marca').value = e.marca; 
        document.getElementById('edit_inv_modelo').value = e.modelo; 
        document.getElementById('edit_inv_serie').value = e.numero_serie; 
        document.getElementById('edit_inv_codigo_barras').value = e.codigo_barras || '';
        document.getElementById('edit_inv_setor').value = e.setor || ''; 
        document.getElementById('edit_inv_predio').value = e.predio || '';
        document.getElementById('edit_inv_patrimonio').value = e.patrimonio || ''; // Adicionado corretamente
        document.getElementById('edit_inv_origem_patrimonio').value = normalizarOrigemPatrimonioInventario(e.origem_patrimonio);
        document.getElementById('edit_inv_status').value = normalizarStatusInventario(e.status || 'Em uso');
        document.getElementById('edit_inv_responsavel').value = e.responsavel || '';
        document.getElementById('edit_inv_observacoes').value = e.observacoes || '';
        
        atualizarAndares('edit_inv_predio', 'edit_inv_andar', e.andar || '');
        
        abrirModal('modal-editar-equipamento');
    } catch (err) { alert("❌ Erro ao carregar dados para edição: " + err.message); }
}

async function salvarEdicaoEquipamento() {
    if (!window.exigirAdmin()) return;
    const id = document.getElementById('edit_inv_id').value;
    
    const dadosAtualizados = { 
        nome: document.getElementById('edit_inv_nome').value.trim() || null,
        tipo: document.getElementById('edit_inv_tipo').value, 
        marca: document.getElementById('edit_inv_marca').value, 
        modelo: document.getElementById('edit_inv_modelo').value, 
        numero_serie: normalizarNumeroSerieInventario(document.getElementById('edit_inv_serie').value),
        codigo_barras: normalizarNumeroSerieInventario(document.getElementById('edit_inv_codigo_barras').value) || null,
        status: normalizarStatusInventario(document.getElementById('edit_inv_status').value),
        predio: document.getElementById('edit_inv_predio').value, 
        andar: document.getElementById('edit_inv_andar').value, 
        setor: document.getElementById('edit_inv_setor').value,
        patrimonio: document.getElementById('edit_inv_patrimonio').value.trim() || null,
        origem_patrimonio: normalizarOrigemPatrimonioInventario(document.getElementById('edit_inv_origem_patrimonio').value) || null,
        responsavel: document.getElementById('edit_inv_responsavel').value.trim() || null,
        observacoes: document.getElementById('edit_inv_observacoes').value.trim() || null
    };

    try {
        const { error } = await supabase.from('inventario').update(dadosAtualizados).eq('id', id);
        if (error) throw error;
        
        alert("✅ Equipamento atualizado com sucesso!"); 
        fecharModal('modal-editar-equipamento'); 
        carregarInventario();
    } catch (err) { 
        alert("❌ Erro ao atualizar equipamento: " + err.message); 
    }
}

function alterarStatusInventario(id) { document.getElementById('status_inv_id').value = id; document.getElementById('status_inv_novo').value = ''; abrirModal('modal-status-inventario'); }
async function salvarNovoStatusInventario() {
    const id = document.getElementById('status_inv_id').value; const novoStatus = normalizarStatusInventario(document.getElementById('status_inv_novo').value);
    if (!novoStatus) return alert("⚠️ Selecione um status.");
    try {
        const { error } = await supabase.from('inventario').update({ status: novoStatus }).eq('id', id);
        if (error) throw error; alert("✅ Status atualizado!"); fecharModal('modal-status-inventario'); carregarInventario();
    } catch (err) { alert("❌ Erro: " + err.message); }
}

async function deletarEquipamento(id) {
    if (!window.exigirAdmin()) return;
    perguntar("Excluir Equipamento", "Tem certeza que deseja excluir este equipamento definitivamente do estoque?", "perigo", async () => {
        try { const { error } = await supabase.from('inventario').delete().eq('id', id); if (error) throw error; alert("✅ Equipamento removido!"); carregarInventario(); } catch (err) { alert("❌ Erro ao remover: " + err.message); }
    });
}


// ==========================================
// 🟢 8. TONERS E SIMPRESS (CHAMADOS)
// ==========================================
let paginaAtualChamado = 1; const itensPorPaginaChamado = 5; let dadosHistoricoChamados = [];

async function carregarListaToners() {
    try {
        const { data, error } = await supabase.from('cadastro_toner').select('*').order('modelo_toner');
        if (error) throw error;
        const tbody = document.getElementById('lista-toners-aba');
        if(tbody) tbody.innerHTML = data.map(t => `<tr><td>${t.modelo_toner}</td><td><strong>${t.quantidade_atual}</strong></td><td><button class="btn-primary btn-sm" onclick="abrirModalTrocaToner('${t.id}')" ${t.quantidade_atual <= 0 ? 'disabled' : ''}>Trocar Toner</button></td></tr>`).join('');
    } catch (err) { console.error("Erro ao carregar toners:", err.message); }
}

function abrirModalTrocaToner(idToner) { document.getElementById('tt_toner_id').value = idToner; limparCanvas('canvas-troca-toner'); abrirModal('modal-troca-toner'); }

async function salvarTrocaToner() {
    const tonerId = document.getElementById('tt_toner_id').value; const inputFoto = document.getElementById('tt_foto'); const setor = document.getElementById('tt_setor').value; const andar = document.getElementById('tt_andar').value; const predio = document.getElementById('tt_predio').value; const canvas = document.getElementById('canvas-troca-toner');
    if (!setor || !andar || !predio || inputFoto.files.length === 0) return alert("⚠️ Atenção: Preencha todos os campos e anexe a foto da página de teste.");
    if (isCanvasVazio(canvas)) return alert("⚠️ Assinatura Obrigatória: Você precisa assinar para confirmar a troca do toner.");
    try {
        const fotoFile = inputFoto.files[0]; const nomeFoto = `teste_${Date.now()}_${fotoFile.name}`;
        const { error: errFoto } = await supabase.storage.from('assinaturas').upload(nomeFoto, fotoFile); if (errFoto) throw errFoto;
        const fotoUrl = supabase.storage.from('assinaturas').getPublicUrl(nomeFoto).data.publicUrl;
        const sigUrl = await uploadAssinatura(canvas, 'troca_toner');
        const { error: errInsert } = await supabase.from('registro_troca_toner').insert([{ toner_id: tonerId, usuario_id: typeof usuarioAtual !== 'undefined' && usuarioAtual ? usuarioAtual.id : null, foto_teste_url: fotoUrl, setor: setor, andar: andar, predio: predio, assinatura_tecnico_url: sigUrl }]);
        if (errInsert) throw errInsert;
        const { data: tonerAtual } = await supabase.from('cadastro_toner').select('quantidade_atual').eq('id', tonerId).single();
        await supabase.from('cadastro_toner').update({ quantidade_atual: (tonerAtual.quantidade_atual || 1) - 1 }).eq('id', tonerId);
        alert("✅ Troca registrada com sucesso! Estoque atualizado.");
        document.getElementById('form-troca-toner').reset(); limparCanvas('canvas-troca-toner'); fecharModal('modal-troca-toner'); carregarListaToners(); if (typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
    } catch (e) { alert("❌ Erro ao salvar troca: " + e.message); }
}

async function abrirModalGerenciarToner() {
    if (!window.exigirAdmin()) return;
    try {
        const { data: toners, error } = await supabase.from('cadastro_toner').select('*').order('modelo_toner', { ascending: true });
        if (error) throw error;
        const tbody = document.getElementById('tabela-gerenciar-toner-corpo'); tbody.innerHTML = '';
        toners.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="font-weight: bold;">${t.modelo_toner}</td><td style="font-size: 12px; color: #64748b;">${t.impressora_compativel || '-'}</td><td style="text-align: center;"><span class="badge" style="background: ${t.quantidade_atual <= 1 ? '#fee2e2; color: #991b1b' : '#f1f5f9; color: #475569'}">${t.quantidade_atual} UN</span></td><td><input type="number" id="input-qtd-${t.id}" value="${t.quantidade_atual}" min="0" style="width: 80px; padding: 5px; margin-bottom: 0; text-align: center;"></td><td><button class="btn-success btn-sm" onclick="salvarNovaQuantidadeToner('${t.id}', '${t.modelo_toner}')">💾 Salvar</button></td>`;
            tbody.appendChild(tr);
        });
        abrirModal('modal-gerenciar-toner');
    } catch (err) { alert("❌ Erro ao carregar estoque: " + err.message); }
}

async function salvarNovaQuantidadeToner(id, modelo) {
    const novaQtd = document.getElementById(`input-qtd-${id}`).value;
    if (novaQtd === '' || novaQtd < 0) return alert("⚠️ Por favor, informe uma quantidade válida.");
    perguntar("Atualizar Estoque", `Deseja alterar a quantidade de ${modelo} para ${novaQtd} unidades?`, "aviso", async () => {
        try {
            const { error } = await supabase.from('cadastro_toner').update({ quantidade_atual: parseInt(novaQtd) }).eq('id', id);
            if (error) throw error; alert(`✅ Estoque de ${modelo} atualizado!`);
            carregarListaToners(); carregarResumoDashboard(); abrirModalGerenciarToner(); 
        } catch (err) { alert("❌ Erro ao salvar alteração: " + err.message); }
    });
}

window.verificarEnterFiltroChamado = function(event) { if (event.key === 'Enter') carregarHistoricoChamados(); }

async function carregarListaChamados() {
    try {
        const { data, error } = await supabase.from('chamado_simpress').select('*').eq('status', 'Aberto').order('id', { ascending: false });
        if (error) throw error;
        const tbody = document.getElementById('lista-chamados-aba');
        if(tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(c => {
                const dataBase = c.created_at || c.data_abertura; const dataAberta = dataBase ? new Date(dataBase).toLocaleDateString('pt-BR') : '-';
                return `<tr><td style="font-size: 12px;"><strong>${c.numero_chamado}</strong><br><small style="color: #64748b;">Abertura: ${dataAberta}</small></td><td style="font-size: 12px;">${c.modelo_impressora} <br><small>Série: ${c.numero_serie}</small></td><td style="font-size: 12px;">${c.setor_localizada}</td><td style="width: 140px; min-width: 140px;"><div style="margin-bottom: 6px;"><span style="background-color: #f39c12; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${c.status}</span></div><div style="display: flex; gap: 4px; flex-wrap: nowrap; justify-content: center;"><button class="btn-success btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalAtenderChamado('${c.id}')">✔️ Atender</button><button class="btn-danger btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="suspenderChamado('${c.id}')">⏸️ Suspender</button></div></td></tr>`;
            }).join('') : '<tr><td colspan="4" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum chamado aberto.</td></tr>';
        }
        if(typeof carregarHistoricoChamados === 'function') carregarHistoricoChamados();
    } catch (err) { console.error("Erro ao carregar chamados:", err.message); }
}

async function carregarHistoricoChamados() {
    const filtro = document.getElementById('filtro_hist_chamado')?.value.trim() || ''; paginaAtualChamado = 1; 
    try {
        let query = supabase.from('chamado_simpress').select('*').in('status', ['Atendido', 'Suspenso']).order('id', { ascending: false }); 
        if (filtro) query = query.or(`numero_chamado.ilike.%${filtro}%,setor_localizada.ilike.%${filtro}%,numero_serie.ilike.%${filtro}%`);
        const { data, error } = await query; if (error) throw error;
        dadosHistoricoChamados = data || []; renderizarTabelaHistoricoChamados();
    } catch (err) { console.error("Erro ao carregar histórico de chamados:", err); }
}

function renderizarTabelaHistoricoChamados() {
    const tbody = document.getElementById('lista-historico-chamados-aba'); const spanPagina = document.getElementById('span-pagina-historico-chamado');
    if (!tbody) return;
    const totalPaginas = Math.ceil(dadosHistoricoChamados.length / itensPorPaginaChamado) || 1; if (spanPagina) spanPagina.innerText = `Página ${paginaAtualChamado} de ${totalPaginas}`;
    const inicio = (paginaAtualChamado - 1) * itensPorPaginaChamado; const fim = inicio + itensPorPaginaChamado; const itensPagina = dadosHistoricoChamados.slice(inicio, fim);

    tbody.innerHTML = itensPagina.length > 0 ? itensPagina.map(c => {
        const dataBaseAberta = c.created_at || c.data_abertura; const dataAbertura = dataBaseAberta ? new Date(dataBaseAberta).toLocaleDateString('pt-BR') : '-';
        const dataRes = c.data_resolucao ? new Date(c.data_resolucao).toLocaleDateString('pt-BR') : '-';
        let corStatus = c.status === 'Atendido' ? '#2ecc71' : '#e74c3c';
        return `<tr><td style="font-size: 12px;"><strong>${c.numero_chamado}</strong><br><small style="color: #64748b;">Abertura: ${dataAbertura}</small></td><td style="font-size: 12px;">${c.modelo_impressora} <br><small>Série: ${c.numero_serie}</small></td><td style="font-size: 12px;">${c.setor_localizada}</td><td style="width: 140px; min-width: 140px;"><div style="margin-bottom: 6px;"><span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${c.status}</span></div>${c.observacao ? `<div style="margin-top: 6px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 4px; border-radius: 4px; text-align: center; line-height: 1.3;"><strong>Obs:</strong> ${c.observacao}</div>` : ''}</td><td style="font-size: 11px;"><strong>${c.tecnico_acompanhante || '-'}</strong><br><small style="color: #64748b;">Resolução: ${dataRes}</small></td></tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum registro encontrado no histórico.</td></tr>';
}

function mudarPaginaHistoricoChamado(direcao) {
    const totalPaginas = Math.ceil(dadosHistoricoChamados.length / itensPorPaginaChamado) || 1;
    paginaAtualChamado += direcao; if (paginaAtualChamado < 1) paginaAtualChamado = 1; if (paginaAtualChamado > totalPaginas) paginaAtualChamado = totalPaginas;
    renderizarTabelaHistoricoChamados();
}

async function abrirModalAtenderChamado(idChamado) {
    document.getElementById('ac_chamado_id').value = idChamado; limparCanvas('canvas-atender-chamado');
    try {
        const { data, error } = await supabase.from('profiles').select('id, nome').order('nome');
        if (!error) document.getElementById('ac_tecnico').innerHTML = '<option value="">Selecione o Técnico...</option>' + data.map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
    } catch (e) { console.error("Erro ao carregar técnicos:", e); }
    abrirModal('modal-atender-chamado');
}

async function salvarAtendimentoChamado() {
    const id = document.getElementById('ac_chamado_id').value; const solucao = document.getElementById('ac_solucao').value; const temObs = document.getElementById('ac_tem_obs').checked; const obs = temObs ? document.getElementById('ac_obs_texto').value : ''; const tecnico = document.getElementById('ac_tecnico').value; const canvas = document.getElementById('canvas-atender-chamado');
    if (!solucao || !tecnico) return alert("Preencha a solução e o técnico.");
    if (isCanvasVazio(canvas)) return alert("Assinatura obrigatória.");
    try {
        const sigUrl = await uploadAssinatura(canvas, 'simpress');
        const { error } = await supabase.from('chamado_simpress').update({ status: 'Atendido', observacao: solucao + (obs ? ` | Obs: ${obs}` : ''), tecnico_acompanhante: tecnico, assinatura_tecnico_url: sigUrl, data_resolucao: new Date().toISOString() }).eq('id', id);
        if (error) throw error; alert("✅ Chamado atendido!"); fecharModal('modal-atender-chamado'); carregarListaChamados();
    } catch (err) { alert("❌ Erro: " + err.message); }
}


async function suspenderChamado(id) {
    pedirMotivo("Suspender Chamado", "Digite o motivo da suspensão deste chamado Simpress:", "Descreva a pendência...", "aviso", async (motivo) => {
        
        let nomeTecnico = 'Sistema';
        if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) nomeTecnico = window.usuarioAtual.nome;

        try {
            const { error } = await supabase.from('chamado_simpress').update({ 
                status: 'Suspenso', 
                observacao: motivo,
                tecnico_acompanhante: nomeTecnico, // Grava o nome ocultamente
                data_resolucao: new Date().toISOString() // Grava a hora do clique
            }).eq('id', id);
            
            if (error) throw error; 
            
            alert("✅ Chamado suspenso com sucesso!"); 
            carregarListaChamados(); 
            if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
        } catch (err) { alert("❌ Erro ao suspender: " + err.message); }
    });
}


// ==========================================
// 🟢 9. TREINAMENTOS
// ==========================================
let idSolicitacaoEmAndamento = null; let paginaAtualHistorico = 1; const itensPorPaginaTr = 5; let dadosHistoricoTr = []; 

window.atualizarAndares = function(predioId, andarId, valorPreSelecionado = '') {
    const predio = document.getElementById(predioId).value; const selectAndar = document.getElementById(andarId); selectAndar.innerHTML = '<option value="">Selecione...</option>';
    let andares = [];
    if (predio === 'UPI') andares = ['SL CTI 1º Andar', '2º Andar', '3º Andar', '4º Andar', '5º Andar', '6º Andar', '7º Andar', '8º Andar', '9º Andar', '10º Andar', '11º Andar', '12º Andar', '13º Andar'];
    else if (predio === 'UPE') andares = ['1º Andar', '2º Andar', '3º Andar', '4º Andar', '5º Andar'];
    else if (predio === 'PIMAG') andares = ['1º Andar', '2º Andar', '3º Andar', '4º Andar'];
    else if (predio === 'RADIOTERAPIA') andares = ['Térreo'];
    else if (predio === 'TRAUMA') andares = ['1º Andar', '2º Andar', '3º Andar'];
    else if (predio === 'CASA ROSA') andares = ['1º Andar', '2º Andar'];
    andares.forEach(a => { const opt = document.createElement('option'); opt.value = a; opt.textContent = a; if (a === valorPreSelecionado) opt.selected = true; selectAndar.appendChild(opt); });
};

async function salvarTreinamento() {
    const colaborador = document.getElementById('tr_colaborador').value; const telefone = document.getElementById('tr_telefone').value; const tema = document.getElementById('tr_tema').value; const predio = document.getElementById('tr_predio').value; const setor = document.getElementById('tr_setor').value; const andar = document.getElementById('tr_andar').value; const dataHora = document.getElementById('tr_data_hora').value;
    if (!colaborador || !tema || !dataHora || !setor) return alert("Preencha os campos obrigatórios.");
    try {
        const { error: errAgendamento } = await supabase.from('treinamentos').insert([{ colaborador, telefone, tema, predio, setor, andar, data_hora: dataHora, status: 'Agendado', solicitacao_id: idSolicitacaoEmAndamento }]);
        if (errAgendamento) throw errAgendamento;
        if (idSolicitacaoEmAndamento) await supabase.from('solicitacoes_treinamento').update({ status: 'Agendado' }).eq('id', idSolicitacaoEmAndamento);
        alert("Treinamento agendado com sucesso!"); idSolicitacaoEmAndamento = null; document.getElementById('form-novo-treinamento').reset(); carregarListaTreinamentos(); if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard(); 
    } catch (err) { alert("Erro ao agendar: " + err.message); }
}

async function carregarListaTreinamentos() {
    try {
        const { data, error } = await supabase.from('treinamentos').select('*').eq('status', 'Agendado').order('data_hora', { ascending: true }); 
        if (error) throw error;
        const tbody = document.getElementById('lista-treinamentos-aba');
        if (tbody) {
            tbody.innerHTML = data.length > 0 ? data.map(t => {
                const dataFormatada = new Date(t.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
                return `<tr><td style="font-size: 12px;"><strong>${dataFormatada}</strong></td><td style="font-size: 12px;">${t.colaborador}<br><small>${t.telefone}</small></td><td style="font-size: 12px;"><strong>${t.tema}</strong></td><td style="font-size: 12px;">${t.predio} - ${t.setor} <br><small>(${t.andar})</small></td><td style="width: 140px; min-width: 140px;"><div style="margin-bottom: 6px;"><span style="background-color: #3498db; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${t.status}</span></div><div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;"><button class="btn-primary btn-sm" style="background: #f39c12; flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalEditarTreinamento('${t.id}')">✏️ Editar</button><button class="btn-success btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="abrirModalFinalizarTreinamento('${t.id}')">✔️ Concluir</button><button class="btn-danger btn-sm" style="flex: 1; min-width: 100%; margin: 0; padding: 5px 2px; font-size: 11px;" onclick="cancelarTreinamento('${t.id}')">❌ Cancelar</button></div></td></tr>`;
            }).join('') : '<tr><td colspan="5" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum treinamento pendente na agenda.</td></tr>';
        }
        if(typeof carregarHistoricoTreinamentos === 'function') carregarHistoricoTreinamentos();
    } catch (err) { console.error("Erro ao carregar treinamentos:", err); }
}

function verificarEnterFiltroHistorico(event) { if (event.key === 'Enter') carregarHistoricoTreinamentos(); }

async function carregarHistoricoTreinamentos() {
    const nome = document.getElementById('filtro_hist_tr_colaborador').value.trim(); paginaAtualHistorico = 1; 
    try {
        let query = supabase.from('treinamentos').select('*').neq('status', 'Agendado').order('data_hora', { ascending: false });
        if (nome) query = query.ilike('colaborador', `%${nome}%`);
        const { data, error } = await query; if (error) throw error;
        dadosHistoricoTr = data || []; renderizarTabelaHistorico(); 
    } catch (err) { console.error("Erro ao carregar histórico de treinamentos:", err); }
}

function renderizarTabelaHistorico() {
    const tbody = document.getElementById('lista-historico-treinamentos-aba'); const spanPagina = document.getElementById('span-pagina-historico');
    if (!tbody) return;
    const totalPaginas = Math.ceil(dadosHistoricoTr.length / itensPorPaginaTr) || 1; if (spanPagina) spanPagina.innerText = `Página ${paginaAtualHistorico} de ${totalPaginas}`;
    const inicio = (paginaAtualHistorico - 1) * itensPorPaginaTr; const fim = inicio + itensPorPaginaTr; const itensPagina = dadosHistoricoTr.slice(inicio, fim);

    tbody.innerHTML = itensPagina.length > 0 ? itensPagina.map(t => {
        const dataFormatada = new Date(t.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
        let corStatus = t.status === 'Concluído' ? '#2ecc71' : '#e74c3c';
        const dataFim = t.data_resolucao || t.updated_at; const dataFinalizacao = dataFim ? new Date(dataFim).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem data';
        const nomeTecnico = t.responsavel_conclusao || 'Não informado'; let responsavel = `<span style="font-size: 11px; display: block; text-align: center;"><strong>${nomeTecnico}</strong><br><small style="color: #64748b;">${dataFinalizacao}</small></span>`;

        return `<tr><td style="font-size: 12px;"><strong>${dataFormatada}</strong></td><td style="font-size: 12px;">${t.colaborador}<br><small>${t.telefone}</small></td><td style="font-size: 12px;"><strong>${t.tema}</strong><br><small>${t.predio} - ${t.setor} (${t.andar})</small></td><td style="width: 140px; min-width: 140px;"><div style="margin-bottom: 4px;"><span style="background-color: ${corStatus}; color: white; padding: 5px; border-radius: 4px; font-size: 11px; font-weight: bold; display: block; width: 100%; text-align: center;">${t.status}</span></div>${t.status === 'Cancelado' && t.motivo_cancelamento ? `<div style="margin-top: 6px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 4px; border-radius: 4px; text-align: center; line-height: 1.3;"><strong>Motivo:</strong> ${t.motivo_cancelamento}</div>` : ''}</td><td style="font-size: 11px;">${responsavel}</td></tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum registro encontrado no histórico.</td></tr>';
}

function mudarPaginaHistorico(direcao) {
    const totalPaginas = Math.ceil(dadosHistoricoTr.length / itensPorPaginaTr) || 1;
    paginaAtualHistorico += direcao; if (paginaAtualHistorico < 1) paginaAtualHistorico = 1; if (paginaAtualHistorico > totalPaginas) paginaAtualHistorico = totalPaginas;
    renderizarTabelaHistorico();
}

async function abrirModalEditarTreinamento(id) {
    try {
        const { data: t, error } = await supabase.from('treinamentos').select('*').eq('id', id).single();
        if (error) throw error;
        document.getElementById('edit_tr_id').value = t.id; document.getElementById('edit_tr_colaborador').value = t.colaborador; document.getElementById('edit_tr_telefone').value = t.telefone; document.getElementById('edit_tr_tema').value = t.tema; 
        document.getElementById('edit_tr_predio').value = t.predio; atualizarAndares('edit_tr_predio', 'edit_tr_andar', t.andar);
        document.getElementById('edit_tr_setor').value = t.setor; document.getElementById('edit_tr_data_hora').value = t.data_hora;
        abrirModal('modal-editar-treinamento');
    } catch (err) { alert("Erro ao carregar dados do treinamento: " + err.message); }
}

async function salvarEdicaoTreinamento() {
    const id = document.getElementById('edit_tr_id').value; const colaborador = document.getElementById('edit_tr_colaborador').value; const telefone = document.getElementById('edit_tr_telefone').value; const tema = document.getElementById('edit_tr_tema').value; const predio = document.getElementById('edit_tr_predio').value; const setor = document.getElementById('edit_tr_setor').value; const andar = document.getElementById('edit_tr_andar').value; const dataHora = document.getElementById('edit_tr_data_hora').value;
    if (!colaborador || !tema || !dataHora || !setor) return alert("Preencha os campos obrigatórios.");
    try {
        const { error } = await supabase.from('treinamentos').update({ colaborador, telefone, tema, predio, setor, andar, data_hora: dataHora }).eq('id', id);
        if (error) throw error;
        alert("Treinamento atualizado com sucesso!"); fecharModal('modal-editar-treinamento'); carregarListaTreinamentos(); if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
    } catch (err) { alert("Erro ao salvar edição do treinamento: " + err.message); }
}

// 🟢 CANCELAR TREINAMENTO (Com Motivo, Técnico Automático e Data)
async function cancelarTreinamento(id) {
    pedirMotivo(
        "Cancelar Agendamento", 
        "Digite o motivo do cancelamento deste treinamento:", 
        "Ex: Faltou, erro de agendamento...", 
        "perigo", 
        async (motivo) => {
            
            // 🟢 Puxa o nome do técnico logado AUTOMATICAMENTE!
            let nomeTecnico = 'Sistema / Não informado';
            if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) {
                nomeTecnico = window.usuarioAtual.nome;
            }

            try {
                // 1. Atualiza o status do treinamento
                const { error } = await supabase.from('treinamentos').update({ 
                    status: 'Cancelado', 
                    motivo_cancelamento: motivo, 
                    responsavel_conclusao: nomeTecnico, // Salva o nome automático
                    data_resolucao: new Date().toISOString() // Salva a hora exata
                }).eq('id', id);
                
                if (error) throw error;

                // 2. Dá baixa na solicitação original que veio do site (se houver)
                const { data: treinamento } = await supabase.from('treinamentos').select('solicitacao_id').eq('id', id).single();
                if (treinamento && treinamento.solicitacao_id) {
                    await supabase.from('solicitacoes_treinamento')
                        .update({ status: 'Cancelado' })
                        .eq('id', treinamento.solicitacao_id);
                }

                alert("✅ Treinamento cancelado e enviado para o histórico!"); 
                
                // 3. Atualiza todas as tabelas instantaneamente
                if (typeof carregarListaTreinamentos === 'function') carregarListaTreinamentos(); 
                if (typeof carregarHistoricoTreinamentos === 'function') carregarHistoricoTreinamentos(); 
                if (typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
                
            } catch (err) { alert("❌ Erro ao cancelar: " + err.message); }
        }
    );
}

async function abrirModalFinalizarTreinamento(id) {
    document.getElementById('ft_treinamento_id').value = id; limparCanvas('canvas-finalizar-treinamento');
    try {
        const { data, error } = await supabase.from('profiles').select('id, nome').order('nome');
        if (!error) document.getElementById('ft_tecnico').innerHTML = '<option value="">Selecione o Técnico...</option>' + data.map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
    } catch (e) { console.error(e); }
    abrirModal('modal-finalizar-treinamento');
}

async function salvarTreinamentoConcluido() {
    const id = document.getElementById('ft_treinamento_id').value; const tecnico = document.getElementById('ft_tecnico').value;
    if (!tecnico) return alert("⚠️ Selecione o técnico responsável.");
    try {
        const { data: treinamento } = await supabase.from('treinamentos').select('solicitacao_id').eq('id', id).single();
        const sigUrl = await uploadAssinatura(document.getElementById('canvas-finalizar-treinamento'), 'conclusao_treinamento');
        const { error: errUpdate } = await supabase.from('treinamentos').update({ status: 'Concluído', responsavel_conclusao: tecnico, assinatura_url: sigUrl, data_resolucao: new Date().toISOString() }).eq('id', id);
        if (errUpdate) throw errUpdate;
        if (treinamento && treinamento.solicitacao_id) await supabase.from('solicitacoes_treinamento').update({ status: 'Realizado' }).eq('id', treinamento.solicitacao_id);
        alert("✅ Treinamento finalizado com sucesso!"); fecharModal('modal-finalizar-treinamento'); carregarListaTreinamentos(); if(typeof carregarHistoricoTreinamentos === 'function') carregarHistoricoTreinamentos(); if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
    } catch (err) { console.error("Detalhe do erro:", err); alert("❌ Erro ao finalizar: " + err.message); }
}

// 🟢 CANCELAR/DESFAZER SOLICITAÇÕES DO SITE (Automático)
async function alterarStatusTreinamentoExt(id, novoStatus) {
    let acao = novoStatus === 'Cancelado' ? 'dar baixa e cancelar esta solicitação' : 'desfazer e retornar para Pendente';
    let tipoModal = novoStatus === 'Cancelado' ? 'perigo' : 'aviso';
    
    perguntar("Atualizar Solicitação", `Confirma ${acao}?`, tipoModal, async () => {
        
        let nomeTecnico = 'Sistema';
        if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) nomeTecnico = window.usuarioAtual.nome;

        try {
            let updateData = { status: novoStatus };
            
            // Se for baixar, grava quem deu a baixa. Se for desfazer (voltar pra agenda), ele só volta o status.
            if (novoStatus === 'Cancelado') {
                updateData.data_resolucao = new Date().toISOString();
                // A tabela solicitacoes_treinamento pode não exibir, mas fica guardado no banco!
            }

            const { error } = await supabase.from('solicitacoes_treinamento').update(updateData).eq('id', id);
            if (error) throw error;
            
            alert(`✅ Solicitação atualizada para: ${novoStatus}`); 
            carregarSolicitacoesTreinamento();
            
            if (typeof carregarListaTreinamentos === 'function') carregarListaTreinamentos();
        } catch (err) { alert("❌ Erro ao atualizar solicitação: " + err.message); }
    });
}


// ==========================================
// 🟢 10. SOLICITAÇÕES DO SITE (TIMED E AD) E TREINAMENTOS
// ==========================================
function verificarEnterCadastro(event) { if (event.key === 'Enter') carregarCadastros(); }
window.abrirModalObsCadastro = function(id, obsCodificada) { document.getElementById('obs_cad_id').value = id; document.getElementById('obs_cad_texto').value = obsCodificada && obsCodificada !== 'undefined' ? decodeURIComponent(obsCodificada) : ''; abrirModal('modal-obs-cadastro'); };

async function carregarCadastros() {
    const status = document.getElementById('filtro_cad_status').value; 
    const nome = document.getElementById('filtro_cad_nome').value.trim();
    try {
        let query = supabase.from('solicitacoes_cadastro').select('*').order('created_at', { ascending: false });
        if (status) query = query.eq('status', status); 
        if (nome) query = query.ilike('nome', `%${nome}%`);
        const { data, error } = await query; if (error) throw error;
        
        const tbody = document.getElementById('lista-cadastros-aba');
        if (tbody) tbody.innerHTML = data.length > 0 ? data.map(c => {
            
            let corStatus = '#f39c12'; 
            if (c.status === 'Realizado') corStatus = '#2ecc71'; 
            if (c.status === 'Aguardando') corStatus = '#3498db'; 
            if (c.status === 'Cancelado') corStatus = '#e74c3c'; 

            let linkDoc = c.foto_documento_url ? `<a href="${c.foto_documento_url}" target="_blank" style="color: #3498db; text-decoration: none; font-weight: bold; display: block; margin-bottom: 3px;">📄 Ver Documento</a>` : '';
            
            let linkConselho = ''; 
            const numConselho = c.numero_conselho ? c.numero_conselho.toUpperCase() : '';
            const exigeConselho = numConselho && numConselho !== 'ISENTO' && numConselho !== 'NÃO POSSUI';

            // 🟢 DESENHA OS LINKS COM O BOTÃO DE "X" (EXCLUIR)
            if (c.foto_conselho_url && c.foto_conselho_url !== 'null' && c.foto_conselho_url !== 'undefined') {
                if (c.foto_conselho_url.includes('|||')) {
                    const urls = c.foto_conselho_url.split('|||');
                    linkConselho = urls.map((url, idx) => `
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; background: #f8fafc; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                            <a href="${url}" target="_blank" style="color: #8e44ad; text-decoration: none; font-weight: bold; font-size: 11px;">🖼️ Arq ${idx + 1}</a>
                            <button type="button" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-weight: 900; font-size: 12px;" onclick="removerFotoConselho('${c.id}', '${url}')" title="Excluir arquivo">✕</button>
                        </div>
                    `).join('');
                } else {
                    linkConselho = `
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; background: #f8fafc; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                            <a href="${c.foto_conselho_url}" target="_blank" style="color: #8e44ad; text-decoration: none; font-weight: bold; font-size: 11px;">🖼️ Ver Arquivo</a>
                            <button type="button" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-weight: 900; font-size: 12px;" onclick="removerFotoConselho('${c.id}', '${c.foto_conselho_url}')" title="Excluir arquivo">✕</button>
                        </div>
                    `;
                }
            } else {
                let textoAviso = exigeConselho 
                    ? '<span style="color: #e74c3c; font-size: 11px; font-weight: bold; display: block; margin-bottom: 6px;">Falta Arquivo</span>' 
                    : '<span style="color: #7f8c8d; font-size: 11px; font-weight: bold; display: block; margin-bottom: 6px;">(Sem Arquivo)</span>';
                linkConselho = textoAviso;
            }

            // 🟢 BOTÃO DE ANEXAR SEMPRE VISÍVEL
            linkConselho += `
                <input type="file" id="upload_conselho_${c.id}" accept="image/*,application/pdf" multiple style="display: none;" onchange="uploadFotoConselhoFaltante('${c.id}')">
                <button class="btn-primary btn-sm" style="background: #34495e; font-size: 10px; padding: 4px 6px; margin: 4px 0 0 0; width: 100%; display: block; text-align: center; border-radius: 4px; cursor: pointer;" onclick="document.getElementById('upload_conselho_${c.id}').click()">📎 Anexar Arquivo</button>
            `;
            
            const dataFim = c.data_resolucao || c.updated_at; 
            const dataFinalizacao = dataFim ? new Date(dataFim).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
            const realizadoPor = (c.realizado_por_nome) ? `<span style="font-size: 11px; text-align: center; display: block;"><strong>${c.realizado_por_nome}</strong><br><small style="color: #64748b;">${dataFinalizacao}</small></span>` : '<span style="text-align: center; display: block;">-</span>';
            
            let dataNascFormatada = c.data_nascimento && c.data_nascimento.includes('-') ? c.data_nascimento.split('-').reverse().join('/') : c.data_nascimento;
            const obsSegura = c.observacao ? encodeURIComponent(c.observacao) : '';
            const isAdmin = typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual && window.usuarioAtual.role === 'admin';
            
            let botoesAcao = '';
            if (c.status !== 'Realizado' && c.status !== 'Cancelado') { 
                botoesAcao = `<button class="btn-success btn-sm" style="flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="alterarStatusCadastro('${c.id}', 'Realizado')">✔️ Realizado</button>${c.status === 'Pendente' ? `<button class="btn-primary btn-sm" style="background: #3498db; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="alterarStatusCadastro('${c.id}', 'Aguardando')">⏳ Pausa</button>` : `<button class="btn-primary btn-sm" style="background: #3498db; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="alterarStatusCadastro('${c.id}', 'Pendente')">▶️ Retorna</button>`}<button class="btn-danger btn-sm" style="flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="darBaixaCadastro('${c.id}')">❌ Baixa</button><button class="btn-primary btn-sm" style="background: #95a5a6; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="abrirModalObsCadastro('${c.id}', '${obsSegura}')">📝 Obs</button>`; 
            } else { 
                if (isAdmin) { botoesAcao = `<button class="btn-primary btn-sm" style="background: #e67e22; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="alterarStatusCadastro('${c.id}', 'Pendente')">↩️ Desfazer</button><button class="btn-primary btn-sm" style="background: #95a5a6; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px;" onclick="abrirModalObsCadastro('${c.id}', '${obsSegura}')">📝 Obs</button>`; } else { botoesAcao = `<button class="btn-primary btn-sm" style="background: #95a5a6; flex: 1; margin: 0; padding: 4px 2px; font-size: 10px; width: 100%;" onclick="abrirModalObsCadastro('${c.id}', '${obsSegura}')">📝 Ver Obs</button>`; } 
            }

            return `<tr><td style="font-size: 12px; min-width: 80px;">${new Date(c.created_at).toLocaleDateString('pt-BR')} <br><small style="color:#64748b;">${new Date(c.created_at).toLocaleTimeString('pt-BR')}</small></td><td style="font-size: 12px;"><strong style="font-size: 13px;">${c.nome}</strong><br><span style="color:#475569;">CPF:</span> ${c.cpf || '-'}<br><span style="color:#475569;">CNS:</span> ${c.cns || '-'}<br><span style="color:#475569;">Nasc:</span> ${dataNascFormatada || '-'}</td><td style="font-size: 12px;"><strong style="color: #2c3e50;">${c.cargo || '-'}</strong><br><span style="color:#475569;">Setor:</span> ${c.setor_andar || '-'}</td><td style="font-size: 12px;">📧 ${c.email || '-'}<br>📱 ${c.telefone || '-'}</td><td style="font-size: 12px; min-width: 110px;"><strong>${c.numero_conselho || '-'}</strong><div style="margin-top: 5px; background: #ffffff; padding: 5px; border-radius: 4px; border: 1px solid #e2e8f0;">${linkDoc} ${linkConselho}</div></td><td style="width: 120px; min-width: 110px;"><div style="margin-bottom: 4px;"><span style="background-color: ${corStatus}; color: white; padding: 4px; border-radius: 4px; font-size: 10px; font-weight: bold; display: block; width: 100%; text-align: center;">${c.status}</span></div><div style="display: flex; gap: 2px; flex-wrap: wrap; justify-content: center;">${botoesAcao}</div>${c.status === 'Cancelado' ? `<div style="margin-top: 4px; font-size: 9px; color: #475569; background: #fee2e2; padding: 2px; border-radius: 4px; text-align: center; line-height: 1.2;"><strong>Motivo:</strong> ${c.observacao || 'Não informado'}</div>` : (c.observacao ? `<div style="margin-top: 4px; font-size: 9px; color: #475569; background: #f1f5f9; padding: 2px; border-radius: 4px; text-align: center; line-height: 1.2;"><strong>Obs:</strong> ${c.observacao}</div>` : '')}</td><td>${realizadoPor}</td></tr>`;
        }).join('') : '<tr><td colspan="7" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma solicitação encontrada.</td></tr>';
    } catch (err) { console.error("Erro ao carregar Cadastros:", err); }
}

async function alterarStatusCadastro(id, novoStatus) {
    let tipoModal = novoStatus === 'Realizado' ? 'sucesso' : (novoStatus === 'Aguardando' ? 'aviso' : 'info');
    perguntar("Status do Cadastro (TIMED)", `Confirma a mudança de status deste usuário para "${novoStatus}"?`, tipoModal, async () => {
        try {
            let updateData = { status: novoStatus };
            if (novoStatus === 'Realizado') { if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) { updateData.realizado_por_nome = window.usuarioAtual.nome; updateData.realizado_por_email = window.usuarioAtual.email; updateData.data_resolucao = new Date().toISOString(); } } else { updateData.realizado_por_nome = null; updateData.realizado_por_email = null; updateData.data_resolucao = null; }
            const { error } = await supabase.from('solicitacoes_cadastro').update(updateData).eq('id', id); if (error) throw error;
            alert(`✅ Status atualizado para ${novoStatus}!`); carregarCadastros();
        } catch (err) { alert("❌ Erro ao atualizar status: " + err.message); }
    });
}

// 🟢 DAR BAIXA EM CADASTRO TIMED (Automático)
async function darBaixaCadastro(id) {
    pedirMotivo("Cancelar Solicitação TIMED", "Por que este cadastro está sendo cancelado?", "Ex: Dados inconsistentes, duplicidade...", "perigo", async (motivo) => {
        
        let nomeTecnico = 'Sistema';
        if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) nomeTecnico = window.usuarioAtual.nome;

        try {
            const { error } = await supabase.from('solicitacoes_cadastro').update({ 
                status: 'Cancelado', 
                observacao: motivo,
                realizado_por_nome: nomeTecnico, // Grava seu nome
                data_resolucao: new Date().toISOString() // Grava a hora exata
            }).eq('id', id);
            
            if (error) throw error;
            
            alert("✅ Cadastro cancelado e arquivado!"); 
            carregarCadastros(); 
            if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard();
        } catch (err) { alert("❌ Erro ao dar baixa: " + err.message); }
    });
}

function verificarEnterAD(event) { if (event.key === 'Enter') carregarSolicitacoesAD(); }
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

                // 🟢 LÓGICA DE DATA: Pega data_resolucao ou updated_at
                const dataFimAD = c.data_resolucao || c.updated_at;
                const dataFinalizacaoAD = dataFimAD ? new Date(dataFimAD).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
                
                // 🟢 LÓGICA DO TÉCNICO CORRIGIDA: Agora mostra se for Realizado OU Cancelado
                const realizadoPor = (c.status === 'Realizado' || c.status === 'Cancelado') && c.realizado_por_nome
                    ? `<span style="font-size: 11px; text-align: center; display: block;"><strong>${c.realizado_por_nome}</strong><br><small style="color: #64748b;">${dataFinalizacaoAD}</small></span>` 
                    : '<span style="text-align: center; display: block;">-</span>';

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
                        
                        <td>${realizadoPor}</td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="6" style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma solicitação de AD encontrada.</td></tr>';
        }
    } catch (err) { console.error("Erro ao carregar AD:", err); }
}

// ========================================================
// 🛡️ ANEXAR FOTO DE CONSELHO MANUAMENTE VIA PAINEL DE GESTÃO
// ========================================================
async function uploadFotoConselhoFaltante(idSolicitacao) {
    const fileInput = document.getElementById(`upload_conselho_${idSolicitacao}`);
    if (!fileInput || fileInput.files.length === 0) return;

    window.mostrarAviso("⏳ Fazendo upload do(s) arquivo(s)... Aguarde.", "aviso");

    try {
        // 1. Pega os arquivos que já existem no banco
        const { data: sol } = await supabase.from('solicitacoes_cadastro').select('foto_conselho_url').eq('id', idSolicitacao).single();
        let urlsExistentes = [];
        if (sol && sol.foto_conselho_url && sol.foto_conselho_url !== 'null') {
            urlsExistentes = sol.foto_conselho_url.split('|||');
        }

        // 2. Sobe as novas fotos
        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            const nomeLimpo = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
            const nomeArquivo = `conselho_interno_${i}_${Date.now()}_${nomeLimpo}`;

            const { error } = await supabase.storage.from('documentos_externos').upload(nomeArquivo, file);
            if (error) throw error;

            const publicUrl = supabase.storage.from('documentos_externos').getPublicUrl(nomeArquivo).data.publicUrl;
            urlsExistentes.push(publicUrl); // Adiciona na lista
        }

        const urlConselhoFinal = urlsExistentes.join('|||');

        // 3. Atualiza o banco com a nova lista completa
        const { error: dbError } = await supabase.from('solicitacoes_cadastro')
            .update({ foto_conselho_url: urlConselhoFinal })
            .eq('id', idSolicitacao);

        if (dbError) throw dbError;

        window.mostrarAviso("✅ Arquivo(s) anexado(s) com sucesso!", "sucesso");
        carregarCadastros(); 

    } catch (err) {
        console.error("Erro ao anexar arquivo internamente:", err);
        alert("❌ Falha ao anexar documento: " + err.message);
    }
}

// 🟢 3. FUNÇÃO QUE EXCLUI APENAS O ARQUIVO CLICADO NO "X"
async function removerFotoConselho(idSolicitacao, urlToRemove) {
    perguntar("Excluir Anexo", "Tem certeza que deseja remover este arquivo?", "perigo", async () => {
        window.mostrarAviso("⏳ Removendo arquivo...", "aviso");
        try {
            // 1. Pega os dados atuais no banco
            const { data: sol, error: errGet } = await supabase.from('solicitacoes_cadastro').select('foto_conselho_url').eq('id', idSolicitacao).single();
            if (errGet) throw errGet;
            if (!sol || !sol.foto_conselho_url) return;

            // 2. Remove a URL da string
            let urls = sol.foto_conselho_url.split('|||');
            urls = urls.filter(u => u !== urlToRemove); // Tira apenas a foto clicada
            let novaStringUrls = urls.length > 0 ? urls.join('|||') : null;

            // 3. Atualiza o banco de dados
            const { error: errUpdate } = await supabase.from('solicitacoes_cadastro')
                .update({ foto_conselho_url: novaStringUrls })
                .eq('id', idSolicitacao);
            
            if (errUpdate) throw errUpdate;

            // 4. Exclui a imagem física da lixeira do Supabase (para não pesar)
            try {
                const partesUrl = urlToRemove.split('documentos_externos/');
                if (partesUrl.length > 1) {
                    const caminhoArquivo = partesUrl[1];
                    await supabase.storage.from('documentos_externos').remove([caminhoArquivo]);
                }
            } catch (e) { console.log("Aviso: A imagem já não estava no Storage", e); }

            window.mostrarAviso("✅ Arquivo removido com sucesso!", "sucesso");
            carregarCadastros(); 
        } catch (err) {
            alert("❌ Erro ao remover arquivo: " + err.message);
        }
    });
}

async function alterarStatusAD(id, novoStatus) {
    let tipoModal = novoStatus === 'Realizado' ? 'sucesso' : 'info';
    perguntar("Status do AD", `Confirma a alteração do login para "${novoStatus}"?`, tipoModal, async () => {
        try {
            let updateData = { status: novoStatus };
            if (novoStatus === 'Realizado' && typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) { updateData.realizado_por_nome = window.usuarioAtual.nome; updateData.data_resolucao = new Date().toISOString(); } else if (novoStatus === 'Pendente') { updateData.realizado_por_nome = null; updateData.motivo_cancelamento = null; updateData.data_resolucao = null; }
            const { error } = await supabase.from('solicitacoes_ad').update(updateData).eq('id', id); if (error) throw error; alert(`✅ Ação concluída. AD marcado como ${novoStatus}!`); carregarSolicitacoesAD();
        } catch (err) { alert("❌ Erro ao atualizar AD: " + err.message); }
    });
}

// DAR BAIXA NO AD 
async function darBaixaAD(id) {
    pedirMotivo("Baixa em Criação de AD", "Motivo do cancelamento:", "Descreva o motivo...", "perigo", async (motivo) => {
        let nomeTecnico = 'Sistema';
        if (typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual) nomeTecnico = window.usuarioAtual.nome;

        try {
            const { error } = await supabase.from('solicitacoes_ad').update({ 
                status: 'Cancelado', 
                motivo_cancelamento: motivo, 
                realizado_por_nome: nomeTecnico, // Verifique se o nome da coluna no banco é esse mesmo
                data_resolucao: new Date().toISOString() 
            }).eq('id', id); 
            
            if (error) throw error; 
            alert("✅ Solicitação de AD baixada!"); 
            carregarSolicitacoesAD();
        } catch (err) { alert("❌ Erro ao dar baixa: " + err.message); }
    });
}

// 🟢 1. ATUALIZADA: Passa a localização completa no botão "Agendar"
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

                const cargoFormatado = t.cargo || '-';
                const setorFormatado = t.setor_andar || t.setor || '-'; // 🟢 Pega do novo formato do site
                const contatoFormatado = t.telefone || t.celular || '-';
                const isAdmin = typeof window.usuarioAtual !== 'undefined' && window.usuarioAtual && window.usuarioAtual.role === 'admin';

                const dataSugerida = t.data_desejada ? new Date(t.data_desejada).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não informada';

                let botoesAcao = '';
                if (t.status === 'Pendente' || !t.status) {
                    // 🟢 A MÁGICA COMEÇA AQUI: Enviamos o setorFormatado pro agendamento
                    botoesAcao = `
                        <button class="btn-success btn-sm" style="flex: 1; margin: 0; padding: 5px 2px; font-size: 11px;" 
                            onclick="prepararAgendamento('${t.id}', '${t.nome_solicitante || t.nome || ''}', '${t.telefone || t.celular || ''}', '${t.tema || ''}', '${t.data_desejada || ''}', '${setorFormatado}')">
                            📅 Agendar
                        </button>
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
                        <td style="font-size: 12px;">
                            <strong style="color: #2c3e50;">${cargoFormatado}</strong><br>
                            <span style="color:#475569;">Local:</span> ${setorFormatado}
                        </td>
                        <td style="font-size: 12px;">
                            <strong>${t.tema || '-'}</strong><br>
                            <small style="color: #3498db; font-weight: bold;">🗓️ Sugestão: ${dataSugerida}</small>
                        </td>
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

// 🟢 2. ATUALIZADA: Lê a string, separa Prédio, Setor e Andar, e preenche o formulário
window.prepararAgendamento = function(id, nome, telefone, tema, dataSugerida, localizacao) {
    idSolicitacaoEmAndamento = id; 
    document.getElementById('tr_colaborador').value = nome; 
    document.getElementById('tr_telefone').value = telefone; 
    document.getElementById('tr_tema').value = tema; 
    
    // Extrator Automático de Localização
    if (localizacao && localizacao !== '-') {
        // Tenta achar o padrão "PRÉDIO - SETOR (ANDAR)"
        const regex = /^(.*?)\s*-\s*(.*?)\s*\((.*?)\)$/;
        const match = localizacao.match(regex);
        
        if (match) {
            const predio = match[1]; // Pega o Prédio
            const setor = match[2];  // Pega o Setor
            const andar = match[3];  // Pega o Andar
            
            // Preenche o Prédio
            const selectPredio = document.getElementById('tr_predio');
            if(selectPredio) {
                selectPredio.value = predio;
                // Carrega a lista de andares desse prédio e já marca o andar certo!
                if(typeof atualizarAndares === 'function') {
                    atualizarAndares('tr_predio', 'tr_andar', andar);
                }
            }
            
            // Preenche o Setor
            const inputSetor = document.getElementById('tr_setor');
            if(inputSetor) inputSetor.value = setor;
            
        } else {
            // Se for um pedido antigo sem essa formatação, joga tudo no campo Setor
            const inputSetor = document.getElementById('tr_setor');
            if(inputSetor) inputSetor.value = localizacao;
        }
    } else {
        // Limpa os campos se não tiver nada
        document.getElementById('tr_predio').value = '';
        document.getElementById('tr_setor').value = '';
        document.getElementById('tr_andar').innerHTML = '<option value="">Selecione o Andar</option>';
    }
    
    // Preenche a data se houver
    if (dataSugerida && document.getElementById('tr_data_hora')) {
        const dataFormatada = dataSugerida.substring(0, 16);
        document.getElementById('tr_data_hora').value = dataFormatada;
    } else {
        document.getElementById('tr_data_hora').value = '';
    }
    
    // Muda pra aba e foca no campo
    abrirAba('aba-treinamentos'); 
    document.getElementById('tr_predio').focus();
};

// ==========================================
// 🟢 11. CONFIGURAÇÕES, ADMIN E BASE
// ==========================================
async function carregarMeusDados() {
    try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr || !authData.user) return;
        const { data: perfil, error: perfilErr } = await supabase.from('profiles').select('*').eq('id', authData.user.id).single();
        if (perfilErr) throw perfilErr;
        document.getElementById('meu_email').value = perfil.email || ''; document.getElementById('meu_nome').value = perfil.nome || ''; document.getElementById('meu_celular').value = perfil.celular || ''; document.getElementById('meu_cpf').value = perfil.cpf || '';
    } catch (err) { console.error("Erro ao carregar aba de configurações:", err); }
}

async function salvarMeusDados() {
    const email = document.getElementById('meu_email').value; const nome = document.getElementById('meu_nome').value; const celular = document.getElementById('meu_celular').value; const cpf = document.getElementById('meu_cpf').value;
    if (!nome || !email) return alert("Nome e E-mail são obrigatórios.");
    try {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) return alert("Sessão expirada. Faça login novamente.");
        const { error } = await supabase.from('profiles').update({ email, nome, celular, cpf }).eq('id', authData.user.id);
        if (error) throw error; alert("Seus dados foram atualizados com sucesso!");
        if (typeof usuarioAtual !== 'undefined') { usuarioAtual.email = email; usuarioAtual.nome = nome; usuarioAtual.celular = celular; usuarioAtual.cpf = cpf; }
        const userNameHeader = document.getElementById('user-name'); if (userNameHeader) userNameHeader.innerText = `Olá, ${nome.split(' ')[0]}`; 
    } catch (err) { alert("Erro ao salvar seus dados: " + err.message); }
}

async function salvarMinhaSenha() {
    const senha1 = document.getElementById('minha_nova_senha').value; const senha2 = document.getElementById('minha_nova_senha_conf').value;
    if (!senha1 || !senha2) return alert("Por favor, preencha os dois campos de senha."); if (senha1 !== senha2) return alert("Atenção: As senhas digitadas não são iguais!"); if (senha1.length < 6) return alert("A nova senha deve ter pelo menos 6 caracteres.");
    try {
        const { error } = await supabase.auth.updateUser({ password: senha1 });
        if (error) throw error; alert("Senha alterada com segurança! Na próxima vez, use a nova senha."); document.getElementById('form-minha-senha').reset(); 
    } catch (err) { alert("Erro ao alterar a senha: " + err.message); }
}

async function adminCriarUsuario() {
    if (!window.exigirAdmin()) return;
    const nome = document.getElementById('cad_nome').value; const turno = document.getElementById('cad_turno').value; const celular = document.getElementById('cad_celular').value; const cpf = document.getElementById('cad_cpf').value; const email = document.getElementById('cad_email').value; const senha = document.getElementById('cad_senha').value;
    if (!nome || !email || !senha || !turno) return alert('Por favor, preencha Nome, E-mail, Senha e Turno.');
    try {
        const { error } = await supabase.functions.invoke('admin-users', {
            body: { action: 'create', email, password: senha, nome, turno, celular, cpf, role: 'operacional' }
        });
        if (error) throw error; alert(`Sucesso! O usuário ${nome} foi criado.`); document.getElementById('form-novo-usuario').reset(); fecharModal('modal-usuario'); 
    } catch (err) { console.error('Erro completo:', err); alert('Erro ao criar usuário: ' + (err.message || 'Verifique se o e-mail já existe.')); }
}

async function extrairErroFuncaoAdmin(error) {
    if (!error) return 'Erro desconhecido na função administrativa.';
    try {
        if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.clone().json();
            if (body?.error) return body.error;
        }
        if (error.context && typeof error.context.text === 'function') {
            const texto = await error.context.clone().text();
            if (texto) return texto;
        }
    } catch (parseError) {
        console.warn('Não foi possível ler o erro da Edge Function:', parseError);
    }
    return error.message || 'Edge Function retornou erro.';
}

async function chamarAdminUsers(body) {
    const { data, error } = await supabase.functions.invoke('admin-users', { body });
    if (error) throw new Error(await extrairErroFuncaoAdmin(error));
    return data;
}

async function carregarTabelaUsuarios() {
    if (!window.exigirAdmin()) return;
    try {
        const { data: usuarios, error } = await supabase.from('profiles').select('*').order('nome', { ascending: true });
        if (error) throw error;
        const tabela = document.getElementById('tabela-usuarios-admin'); tabela.innerHTML = ''; 
        usuarios.forEach(user => {
            const tr = document.createElement('tr');
            const nomeSeguro = limparTexto(user.nome || '');
            const emailSeguro = limparTexto(user.email || '');
            const emailCodificado = encodeURIComponent(user.email || '');
            tr.innerHTML = `<td>${nomeSeguro}</td><td>${emailSeguro}</td><td><select id="role-${user.id}" class="btn-sm" style="margin-bottom: 0;"><option value="operacional" ${user.role === 'operacional' ? 'selected' : ''}>Operacional</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option></select></td><td><div style="display: flex; gap: 5px; flex-wrap: wrap;"><button class="btn-primary btn-sm" onclick="salvarNivelAcesso('${user.id}')">Salvar Edição</button><button class="btn-primary btn-sm" style="background: #8e44ad;" onclick="prepararEdicaoCompleta('${user.id}')">Alterar Dados</button><button class="btn-primary btn-sm" style="background: #f39c12;" onclick="redefinirSenhaUsuario('${user.id}', '${emailCodificado}')">Redefinir Senha</button><button class="btn-danger btn-sm" onclick="deletarUsuario('${user.id}')">Excluir</button></div></td>`;
            tabela.appendChild(tr);
        });
    } catch (err) { console.error("Erro ao carregar tabela:", err.message); }
}

async function salvarNivelAcesso(userId) {
    if (!window.exigirAdmin()) return;
    const novoRole = document.getElementById(`role-${userId}`).value;
    try { await chamarAdminUsers({ action: 'set-role', userId, role: novoRole }); alert("Nível de acesso atualizado com sucesso!"); } catch (err) { alert("Erro ao atualizar nível: " + err.message); }
}

async function prepararEdicaoCompleta(userId) {
    if (!window.exigirAdmin()) return;
    try {
        const { data: user, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (error) throw error; fecharModal('modal-permissoes'); document.getElementById('edit_id').value = user.id; document.getElementById('edit_nome').value = user.nome || ''; document.getElementById('edit_turno').value = user.turno || ''; document.getElementById('edit_celular').value = user.celular || ''; document.getElementById('edit_cpf').value = user.cpf || ''; document.getElementById('edit_email').value = user.email || ''; abrirModal('modal-editar-usuario');
    } catch (err) { alert("Erro ao buscar dados: " + err.message); }
}

async function salvarEdicaoUsuario() {
    if (!window.exigirAdmin()) return;
    const userId = document.getElementById('edit_id').value; const nome = document.getElementById('edit_nome').value; const turno = document.getElementById('edit_turno').value; const celular = document.getElementById('edit_celular').value; const cpf = document.getElementById('edit_cpf').value; const email = document.getElementById('edit_email').value;
    try {
        const { error } = await supabase.functions.invoke('admin-users', { body: { action: 'update-profile', userId, nome, turno, celular, cpf, email } });
        if (error) throw error; alert("Dados alterados com sucesso no Perfil!"); fecharModal('modal-editar-usuario'); abrirModal('modal-permissoes'); 
    } catch (err) { alert("Erro ao salvar: " + err.message); }
}

function gerarSenhaTemporaria() {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    return Array.from(bytes, byte => chars[byte % chars.length]).join('');
}

async function redefinirSenhaUsuario(userId, emailCodificado) {
    if (!window.exigirAdmin()) return;
    const email = decodeURIComponent(emailCodificado || '');
    const novaSenha = gerarSenhaTemporaria();
    perguntar("Redefinir Senha", `Gerar uma senha temporária forte para ${email}?`, "aviso", async () => {
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Navegador sem suporte seguro para copiar senha temporária.');
            await navigator.clipboard.writeText(novaSenha);
            const { error } = await supabase.functions.invoke('admin-users', { body: { action: 'reset-password', userId, password: novaSenha } });
            if (error) throw error;
            alert('✅ Senha temporária redefinida e copiada para a área de transferência do administrador. Cole em um canal seguro e oriente a troca no primeiro acesso.');
        } catch (err) { alert("❌ Erro ao redefinir senha: " + err.message); }
    });
}

async function deletarUsuario(userId) {
    if (!window.exigirAdmin()) return;
    perguntar("Excluir Usuário", "Tem certeza que deseja excluir este usuário permanentemente do sistema?", "perigo", async () => {
        try { const { error } = await supabase.functions.invoke('admin-users', { body: { action: 'delete', userId } }); if (error) throw error; alert("✅ Usuário removido do sistema!"); carregarTabelaUsuarios(); } catch (err) { alert("❌ Erro ao excluir: " + err.message); }
    });
}

async function adminCadastrarChave() {
    if (!window.exigirAdmin()) return;
    const nome = document.getElementById('cad_chave_nome').value; const cor = document.getElementById('cad_chave_cor').value; const local = document.getElementById('cad_chave_local').value;
    if(!nome || !cor || !local) return alert('Preencha todos os campos!');
    try { const { error } = await supabase.from('chaves').insert([{ nome, cor, localizacao: local, status: 'disponivel' }]); if (error) throw error; alert('Chave cadastrada com sucesso!'); fecharModal('modal-chave'); carregarSelectChaves(); } catch (err) { alert('Erro: ' + err.message); }
}

async function adminCadastrarToner() {
    if (!window.exigirAdmin()) return;
    const modelo = document.getElementById('cad_toner_modelo').value; const impressoras = document.getElementById('cad_toner_imp').value; const quantidade = document.getElementById('cad_toner_qtd').value;
    if(!modelo || !impressoras || !quantidade) return alert('Preencha todos os campos!');
    try { const { error } = await supabase.from('cadastro_toner').insert([{ modelo_toner: modelo, impressora_compativel: impressoras, quantidade_atual: parseInt(quantidade) }]); if (error) throw error; alert('Toner cadastrado com sucesso no estoque!'); fecharModal('modal-toner'); } catch (err) { alert('Erro: ' + err.message); }
}

async function adminCadastrarSimpress() {
    if (!window.exigirAdmin()) return;
    const numero = document.getElementById('cad_sim_numero').value; const modelo = document.getElementById('cad_sim_modelo').value; const serie = document.getElementById('cad_sim_serie').value; const predio = document.getElementById('cad_sim_predio').value; const andar = document.getElementById('cad_sim_andar').value; const setor = document.getElementById('cad_sim_setor').value;
    if (!numero || !modelo || !serie || !predio || !andar || !setor) return alert("⚠️ Por favor, preencha todos os campos obrigatórios.");
    const localizacaoCompleta = `${predio} / ${setor} (${andar})`;
    try { const { error } = await supabase.from('chamado_simpress').insert([{ numero_chamado: numero, modelo_impressora: modelo, numero_serie: serie, setor_localizada: localizacaoCompleta, status: 'Aberto', created_at: new Date().toISOString() }]); if (error) throw error; alert("✅ Chamado Simpress registrado com sucesso!"); fecharModal('modal-simpress'); document.getElementById('form-cad-simpress').reset(); carregarListaChamados(); if(typeof carregarResumoDashboard === 'function') carregarResumoDashboard(); } catch (err) { alert("❌ Erro ao abrir chamado: " + err.message); }
}

// ==========================================
// EXPORTAÇÃO PDF ORGANIZADO E CSV LIMPO
// ==========================================

async function exportarPDF() { if (!window.exigirAdmin()) return; abrirModal('modal-exportacao'); }

// PDF: Corrigido para garantir que a aba esteja visível e o arquivo baixe
function prepararExportacao(idAba, nomeArquivo) {
    if (!window.exigirAdmin()) return;
    fecharModal('modal-exportacao');
    window.mostrarAviso("⏳ Gerando relatório visual... Aguarde.", "aviso");
    
    // Garante que a aba abra antes de "tirar a foto"
    abrirAba(idAba);

    // Damos um tempo maior (2 segundos) para o navegador renderizar tudo
    setTimeout(() => {
        const elemento = document.getElementById(idAba);
        if (!elemento) return alert("Erro: Aba não encontrada.");

        const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        const nomeCompleto = `${nomeArquivo}_${dataHoje}`;

        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     nomeCompleto + '.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        // EXECUTAR GERAÇÃO
        html2pdf().set(opt).from(elemento).save().then(() => {
            window.mostrarAviso("✅ PDF baixado com sucesso!", "sucesso");
        }).catch(err => {
            console.error("Erro PDF:", err);
            alert("Erro ao gerar PDF. Verifique o console.");
        });
    }, 2000);
}

// 🟢 CSV: Corrigido para "Modo Humano" (Limpa códigos e organiza pro Excel)
async function exportarParaCSV(tabelaSupabase, nomeArquivo) {
    if (!window.exigirAdmin()) return;
    fecharModal('modal-exportacao');
    window.mostrarAviso("⏳ Limpando dados e organizando planilha...", "aviso");

    try {
        const { data, error } = await supabase.from(tabelaSupabase).select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (!data || data.length === 0) return alert("⚠️ Sem dados para exportar.");

        // 1. LISTA DE COLUNAS "LIXO" PARA ESCONDER (IDs e links de assinatura que poluem o Excel)
        const colunasIgnorar = ['id', 'usuario_id', 'assinatura_url', 'assinatura_tecnico_url', 'assinatura_fechamento_url', 'assinatura_abertura_url', 'foto_documento_url', 'foto_conselho_url', 'foto_teste_url', 'foto_url', 'solicitacao_id'];

        // 2. FILTRAR CABEÇALHOS (Apenas o que é texto legível)
        const headers = Object.keys(data[0]).filter(h => !colunasIgnorar.includes(h));
        
        // 3. CONSTRUIR O CORPO (Usando Ponto e Vírgula para o Excel Brasileiro)
        const csvRows = [];
        csvRows.push(headers.map(h => h.toUpperCase()).join(';')); // Títulos em maiúsculo

        for (const row of data) {
            const values = headers.map(header => {
                let val = row[header];
                
                // Formata datas para o padrão brasileiro dentro do Excel
                if (header.includes('at') || header.includes('data') || header.includes('hora')) {
                    if (val) val = new Date(val).toLocaleString('pt-BR');
                }

                // Trata valores nulos e limpa aspas
                val = val === null ? '' : String(val).replace(/"/g, '""');
                return `"${val}"`; 
            });
            csvRows.push(values.join(';'));
        }

        const csvContent = csvRows.join('\n');
        
        // 4. DOWNLOAD COM CODIFICAÇÃO PARA EXCEL (BOM UTF-8)
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        
        link.setAttribute("href", url);
        link.setAttribute("download", `${nomeArquivo}_${dataHoje}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.mostrarAviso("✅ Planilha organizada baixada!", "sucesso");

    } catch (err) {
        alert("❌ Erro no CSV: " + err.message);
    }
}

function mascaraCPF(cpf) { let v = cpf.value.replace(/\D/g, ""); if (v.length > 11) v = v.slice(0, 11); v = v.replace(/(\d{3})(\d)/, "$1.$2"); v = v.replace(/(\d{3})(\d)/, "$1.$2"); v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2"); cpf.value = v; }
function mascaraTelefone(tel) { let v = tel.value.replace(/\D/g, ""); if (v.length > 11) v = v.slice(0, 11); v = v.replace(/^(\d{2})(\d)/g, "($1) $2"); v = v.replace(/(\d)(\d{4})$/, "$1-$2"); tel.value = v; }

// Função que neutraliza códigos maliciosos digitados pelos usuários
window.limparTexto = function(texto) {
    if (!texto) return '';
    return texto.toString().replace(/[&<>'"]/g, function(tag) {
        const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return chars[tag] || tag;
    });
};
