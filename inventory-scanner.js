// Fluxo de inventario em campo. O leitor funciona como teclado e finaliza com Enter.
const inventarioSessao = {
    id: crypto.randomUUID(),
    leituras: [],
    equipamentoAtual: null,
    codigoAtual: '',
    tipoLeituraAtual: 'codigo_barras',
    ocupado: false
};

function invEscape(valor) {
    return String(valor ?? '').replace(/[&<>'"]/g, caractere => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[caractere]);
}

function localizacaoEquipamento(equipamento) {
    return [equipamento.predio, equipamento.andar, equipamento.setor].filter(Boolean).join(' / ') || 'Não informada';
}

function focarLeitorInventario() {
    setTimeout(() => {
        const campo = document.getElementById('inventario-codigo-leitura');
        const modalAberto = document.querySelector('.modal.flex');
        if (campo && !modalAberto && !document.getElementById('aba-inventario')?.classList.contains('hidden')) campo.focus();
    }, 80);
}

function inventarioScannerEnter(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    buscarCodigoInventario();
}

function atualizarStatusScanner(texto, tipo = '') {
    const status = document.getElementById('scanner-status');
    if (!status) return;
    status.textContent = texto;
    status.className = `scanner-status ${tipo}`.trim();
}

function erroRecursoInventarioAusente(error) {
    const codigo = String(error?.code || '');
    const mensagem = String(error?.message || '');
    return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(codigo)
        || /schema cache|inventario_historico|buscar_equipamento_inventario|does not exist|could not find/i.test(mensagem);
}

function mensagemBancoInventarioPendente() {
    return 'Banco de dados pendente: aplique as migrations do Supabase e atualize a página para habilitar o histórico persistente.';
}

function marcarBancoInventarioPendente(error) {
    console.warn('Estrutura de inventário indisponível:', error);
    atualizarStatusScanner('Banco pendente de migration', 'warning');
    const tbody = document.getElementById('lista-inventario-historico');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${invEscape(mensagemBancoInventarioPendente())}</td></tr>`;
    }
}

function atualizarResumoInventario() {
    const leituras = inventarioSessao.leituras;
    document.getElementById('contador-inv-lidos').textContent = leituras.filter(item => item.contabilizaLeitura).length;
    document.getElementById('contador-inv-encontrados').textContent = leituras.filter(item => item.status === 'encontrado').length;
    document.getElementById('contador-inv-pendentes').textContent = leituras.filter(item => item.status === 'pendente').length;
    document.getElementById('contador-inv-cadastrados').textContent = leituras.filter(item => item.status === 'cadastrado').length;

    const painel = document.getElementById('inventario-historico-sessao');
    if (!painel) return;
    painel.innerHTML = leituras.length ? leituras.slice(0, 12).map(item => `
        <div class="session-history-item status-${invEscape(item.status)}">
            <div><strong>${invEscape(item.codigo)}</strong><span>${invEscape(item.descricao || item.acao)}</span></div>
            <span class="history-badge">${invEscape(item.status.replaceAll('_', ' '))}</span>
            <time>${invEscape(item.hora)}</time>
        </div>`).join('') : '<p class="empty-state">Nenhuma leitura realizada nesta sessão.</p>';
}

function adicionarEventoSessao(status, codigo, acao, descricao = '', contabilizaLeitura = false) {
    inventarioSessao.leituras.unshift({ status, codigo, acao, descricao, contabilizaLeitura, hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });
    atualizarResumoInventario();
}

async function registrarHistoricoInventario({ equipamentoId = null, codigo, tipoLeitura = 'codigo_barras', status, acao, localizacao = '', observacao = '' }) {
    const tecnicoId = window.perfilAtual?.id;
    if (!tecnicoId) throw new Error('Sessão do técnico não identificada.');
    const { error } = await supabase.from('inventario_historico').insert([{
        equipamento_id: equipamentoId,
        codigo_lido: codigo,
        tipo_leitura: tipoLeitura,
        status,
        acao,
        tecnico_id: tecnicoId,
        localizacao: localizacao || null,
        observacao: observacao || null,
        sessao_id: inventarioSessao.id
    }]);
    if (error && erroRecursoInventarioAusente(error)) {
        marcarBancoInventarioPendente(error);
        return false;
    }
    if (error) throw error;
    return true;
}

async function buscarEquipamentoPorCodigo(codigo) {
    const { data, error } = await supabase.rpc('buscar_equipamento_inventario', { p_codigo: codigo });
    if (error && erroRecursoInventarioAusente(error)) {
        marcarBancoInventarioPendente(error);
        throw new Error(mensagemBancoInventarioPendente());
    }
    if (error) throw error;
    return data?.[0] || null;
}

async function buscarCodigoInventario(codigoForcado = '', tipoLeitura = 'codigo_barras') {
    if (inventarioSessao.ocupado) return;
    const campo = document.getElementById('inventario-codigo-leitura');
    const codigo = String(codigoForcado || campo?.value || '').trim();
    if (!codigo) {
        mostrarAviso('Leia ou informe um código para pesquisar.', 'aviso');
        return focarLeitorInventario();
    }

    inventarioSessao.ocupado = true;
    inventarioSessao.codigoAtual = codigo;
    inventarioSessao.tipoLeituraAtual = tipoLeitura;
    inventarioSessao.equipamentoAtual = null;
    if (campo) campo.value = '';
    atualizarStatusScanner('Consultando cadastro...', 'loading');
    document.getElementById('btn-inventario-buscar').disabled = true;

    try {
        const equipamento = await buscarEquipamentoPorCodigo(codigo);
        if (equipamento) {
            inventarioSessao.equipamentoAtual = equipamento;
            await registrarHistoricoInventario({ equipamentoId: equipamento.id, codigo, tipoLeitura, status: 'encontrado', acao: 'Equipamento localizado', localizacao: localizacaoEquipamento(equipamento) });
            adicionarEventoSessao('encontrado', codigo, 'Equipamento localizado', equipamento.nome || `${equipamento.tipo || ''} ${equipamento.modelo || ''}`.trim(), true);
            exibirEquipamentoEncontrado(equipamento, codigo, tipoLeitura);
            atualizarStatusScanner('Equipamento encontrado', 'success');
            carregarHistoricoInventario();
            return;
        }

        await registrarHistoricoInventario({ codigo, tipoLeitura, status: 'nao_encontrado', acao: 'Código pesquisado sem correspondência' });
        adicionarEventoSessao('nao_encontrado', codigo, 'Não encontrado', 'Sem correspondência no cadastro', true);
        exibirEquipamentoNaoEncontrado(codigo);
        atualizarStatusScanner('Não encontrado', 'warning');
        carregarHistoricoInventario();
    } catch (error) {
        console.error('Falha na leitura do inventário:', error);
        atualizarStatusScanner('Falha na consulta', 'error');
        mostrarAviso(`Não foi possível consultar o inventário: ${error.message}`, 'erro');
    } finally {
        inventarioSessao.ocupado = false;
        document.getElementById('btn-inventario-buscar').disabled = false;
        focarLeitorInventario();
    }
}

function exibirEquipamentoEncontrado(equipamento, codigo, tipoLeitura) {
    const resultado = document.getElementById('inventario-resultado');
    resultado.className = 'inventory-result found';
    resultado.innerHTML = `
        <div class="result-title"><span>✓</span><div><strong>${invEscape(equipamento.nome || `${equipamento.tipo || ''} ${equipamento.modelo || ''}`.trim() || 'Equipamento')}</strong><small>Cadastro localizado por ${invEscape(tipoLeitura.replaceAll('_', ' '))}</small></div></div>
        <div class="equipment-details">
            <div><span>Tipo</span><strong>${invEscape(equipamento.tipo || '-')}</strong></div>
            <div><span>Marca / modelo</span><strong>${invEscape([equipamento.marca, equipamento.modelo].filter(Boolean).join(' / ') || '-')}</strong></div>
            <div><span>Série</span><strong>${invEscape(equipamento.numero_serie || '-')}</strong></div>
            <div><span>Patrimônio</span><strong>${invEscape(equipamento.patrimonio || '-')}</strong></div>
            <div><span>Código de barras</span><strong>${invEscape(equipamento.codigo_barras || '-')}</strong></div>
            <div><span>Local atual</span><strong>${invEscape(localizacaoEquipamento(equipamento))}</strong></div>
            <div><span>Status</span><strong>${invEscape(equipamento.status || '-')}</strong></div>
            <div><span>Responsável</span><strong>${invEscape(equipamento.responsavel || '-')}</strong></div>
            <div><span>Último inventário</span><strong>${equipamento.ultima_data_inventario ? new Date(equipamento.ultima_data_inventario).toLocaleString('pt-BR') : 'Nunca inventariado'}</strong></div>
        </div>
        ${equipamento.observacoes ? `<p class="equipment-notes">${invEscape(equipamento.observacoes)}</p>` : ''}
        <div class="validation-fields">
            <input id="inventario-local-confirmacao" value="${invEscape(localizacaoEquipamento(equipamento) === 'Não informada' ? '' : localizacaoEquipamento(equipamento))}" placeholder="Local/setor conferido">
            <input id="inventario-observacao-confirmacao" placeholder="Observação da conferência (opcional)">
            <button class="btn-success" onclick="confirmarInventarioEncontrado()">Confirmar inventário</button>
            <button class="btn-secondary" onclick="cancelarResultadoInventario()">Continuar sem validar</button>
        </div>`;
}

function exibirEquipamentoNaoEncontrado(codigo) {
    const resultado = document.getElementById('inventario-resultado');
    resultado.className = 'inventory-result not-found';
    resultado.innerHTML = `
        <div class="result-title"><span>!</span><div><strong>Equipamento não encontrado no cadastro.</strong><small>Código lido: ${invEscape(codigo)}</small></div></div>
        <div class="quick-actions">
            <button class="btn-success" onclick="abrirCadastroRapidoInventario()">Cadastrar novo equipamento</button>
            <button class="btn-primary" onclick="mostrarValidacaoSerial()">Validar número de série</button>
            <button class="btn-secondary" onclick="pesquisarInventarioGeral()">Pesquisar no cadastro</button>
            <button class="btn-warning" onclick="marcarLeituraPendente()">Marcar como pendente</button>
            <button class="btn-secondary" onclick="ignorarLeituraInventario()">Ignorar e continuar</button>
        </div>
        <div id="inventario-validacao-manual" class="manual-validation hidden">
            <input id="inventario-serial-manual" placeholder="Informe o número de série" onkeydown="if(event.key === 'Enter'){event.preventDefault(); validarSerialManual();}">
            <button class="btn-primary" onclick="validarSerialManual()">Pesquisar série</button>
        </div>`;
}

async function confirmarInventarioEncontrado() {
    const equipamento = inventarioSessao.equipamentoAtual;
    const codigo = inventarioSessao.codigoAtual;
    const tipoLeitura = inventarioSessao.tipoLeituraAtual;
    if (!equipamento) return mostrarAviso('Faça uma nova leitura antes de confirmar.', 'aviso');
    const observacao = document.getElementById('inventario-observacao-confirmacao')?.value.trim() || '';
    const localizacao = document.getElementById('inventario-local-confirmacao')?.value.trim() || localizacaoEquipamento(equipamento);
    try {
        const agora = new Date().toISOString();
        const { error } = await supabase.from('inventario').update({
            status_inventario: 'validado', ultima_data_inventario: agora,
            ultimo_inventario_por: window.perfilAtual.id
        }).eq('id', equipamento.id);
        if (error) throw error;
        await registrarHistoricoInventario({ equipamentoId: equipamento.id, codigo, tipoLeitura, status: 'encontrado', acao: 'Inventário validado', localizacao, observacao });
        adicionarEventoSessao('validado', codigo, 'Inventário validado', equipamento.nome || `${equipamento.tipo || ''} ${equipamento.modelo || ''}`.trim());
        mostrarAviso('Equipamento validado e histórico registrado.', 'sucesso');
        cancelarResultadoInventario();
        await Promise.all([carregarInventario(), carregarHistoricoInventario()]);
    } catch (error) {
        mostrarAviso(`Não foi possível validar: ${error.message}`, 'erro');
    }
}

async function abrirCadastroRapidoInventario() {
    const codigo = inventarioSessao.codigoAtual;
    await abrirModalNovoEquipamento();
    document.getElementById('inv_codigo_barras').value = codigo;
    document.getElementById('inv_contexto_leitura').value = codigo;
    document.getElementById('inv_serie').focus();
}

function mostrarValidacaoSerial() {
    document.getElementById('inventario-validacao-manual').classList.remove('hidden');
    document.getElementById('inventario-serial-manual').focus();
}

function validarSerialManual() {
    const serial = document.getElementById('inventario-serial-manual')?.value.trim();
    if (!serial) return mostrarAviso('Informe o número de série.', 'aviso');
    buscarCodigoInventario(serial, 'numero_serie');
}

function pesquisarInventarioGeral() {
    document.getElementById('filtro_inv_serie').value = inventarioSessao.codigoAtual;
    carregarInventario();
    document.getElementById('filtro_inv_serie').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function marcarLeituraPendente() {
    const codigo = inventarioSessao.codigoAtual;
    try {
        await registrarHistoricoInventario({ codigo, status: 'pendente', acao: 'Pendente de cadastro' });
        adicionarEventoSessao('pendente', codigo, 'Pendente de cadastro');
        mostrarAviso('Leitura marcada como pendente de cadastro.', 'aviso');
        cancelarResultadoInventario();
        carregarHistoricoInventario();
    } catch (error) { mostrarAviso(`Erro ao registrar pendência: ${error.message}`, 'erro'); }
}

async function ignorarLeituraInventario() {
    const codigo = inventarioSessao.codigoAtual;
    try {
        await registrarHistoricoInventario({ codigo, status: 'ignorado', acao: 'Leitura ignorada pelo técnico' });
        adicionarEventoSessao('ignorado', codigo, 'Leitura ignorada');
        cancelarResultadoInventario();
        carregarHistoricoInventario();
    } catch (error) { mostrarAviso(`Erro ao registrar leitura: ${error.message}`, 'erro'); }
}

async function registrarCadastroNoHistorico(equipamento, codigo) {
    await registrarHistoricoInventario({ equipamentoId: equipamento.id, codigo, status: 'cadastrado', acao: 'Equipamento cadastrado durante inventário', localizacao: localizacaoEquipamento(equipamento) });
    adicionarEventoSessao('cadastrado', codigo, 'Cadastro rápido concluído', equipamento.nome || `${equipamento.tipo} ${equipamento.modelo}`);
    cancelarResultadoInventario();
    carregarHistoricoInventario();
}

async function carregarHistoricoInventario() {
    const tbody = document.getElementById('lista-inventario-historico');
    if (!tbody) return;
    const { data, error } = await supabase.from('inventario_historico')
        .select('id,codigo_lido,status,acao,localizacao,created_at,tecnico_id,inventario(tipo,marca,modelo,numero_serie),profiles(nome)')
        .order('created_at', { ascending: false }).limit(100);
    if (error) {
        if (erroRecursoInventarioAusente(error)) {
            marcarBancoInventarioPendente(error);
        } else {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Histórico indisponível: ${invEscape(error.message)}</td></tr>`;
        }
        return;
    }
    tbody.innerHTML = data.length ? data.map(item => `<tr>
        <td>${new Date(item.created_at).toLocaleString('pt-BR')}</td>
        <td><strong>${invEscape(item.codigo_lido)}</strong></td>
        <td>${invEscape(item.inventario ? `${item.inventario.tipo || ''} ${item.inventario.marca || ''} ${item.inventario.modelo || ''}`.trim() : '-')}</td>
        <td><span class="history-badge status-${invEscape(item.status)}">${invEscape(item.status.replaceAll('_', ' '))}</span></td>
        <td>${invEscape(item.acao)}</td><td>${invEscape(item.localizacao || '-')}</td>
        <td>${invEscape(item.profiles?.nome || (item.tecnico_id === window.perfilAtual?.id ? window.perfilAtual.nome : '-'))}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty-state">Nenhuma conferência registrada.</td></tr>';
}

function cancelarResultadoInventario() {
    inventarioSessao.equipamentoAtual = null;
    inventarioSessao.codigoAtual = '';
    const resultado = document.getElementById('inventario-resultado');
    resultado.className = 'inventory-result hidden';
    resultado.innerHTML = '';
    atualizarStatusScanner('Pronto para leitura');
    focarLeitorInventario();
}

function limparSessaoInventario() {
    inventarioSessao.id = crypto.randomUUID();
    inventarioSessao.leituras = [];
    cancelarResultadoInventario();
    atualizarResumoInventario();
    mostrarAviso('Painel da sessão limpo. O histórico persistente foi preservado.', 'sucesso');
}

window.inicializarInventarioScanner = function() {
    atualizarResumoInventario();
    carregarHistoricoInventario();
    focarLeitorInventario();
};

window.validarBancoInventario = async function() {
    const tbody = document.getElementById('lista-inventario-historico');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Validando estrutura do banco...</td></tr>';
    try {
        const [historico, busca] = await Promise.all([
            supabase.from('inventario_historico').select('id').limit(1),
            supabase.rpc('buscar_equipamento_inventario', { p_codigo: '__validacao_schema__' })
        ]);
        if (historico.error) throw historico.error;
        if (busca.error) throw busca.error;
        mostrarAviso('Estrutura de inventário validada no Supabase.', 'sucesso');
        atualizarStatusScanner('Banco validado', 'success');
        return true;
    } catch (error) {
        if (erroRecursoInventarioAusente(error)) {
            marcarBancoInventarioPendente(error);
            mostrarAviso(mensagemBancoInventarioPendente(), 'aviso');
            return false;
        }
        mostrarAviso(`Falha ao validar banco do inventário: ${error.message}`, 'erro');
        return false;
    }
};
