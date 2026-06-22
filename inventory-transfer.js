// Importação/exportação de inventário, incluindo o CSV padrão do GLPI em pt-BR.
let importacaoInventarioPendente = [];
let resumoImportacaoInventario = null;

const COLUNAS_EXPORTACAO_INVENTARIO = [
    ['Código de barras', 'codigo_barras'], ['Número de série', 'numero_serie'],
    ['Número de patrimônio', 'patrimonio'], ['Tipo', 'tipo'],
    ['Marca', 'marca'], ['Modelo', 'modelo'],
    ['Status', 'status'], ['Prédio', 'predio'], ['Andar', 'andar'],
    ['Setor/Localização', 'setor'], ['Responsável', 'responsavel'],
    ['Origem do patrimônio', 'origem_patrimonio'], ['Observações', 'observacoes'],
    ['Status do inventário', 'status_inventario']
];

const ALIASES_INVENTARIO = {
    codigo_barras: ['codigo de barras', 'código de barras', 'barcode', 'codigo barras'],
    numero_serie: ['numero de serie', 'número de série', 'serial number', 'serial', 's/n'],
    patrimonio: ['numero de patrimonio', 'número de patrimônio', 'patrimonio', 'patrimônio', 'numero de inventario', 'número de inventário'],
    nome: ['nome do equipamento', 'nome', 'descricao', 'descrição', 'item'],
    tipo: ['tipo', 'categoria', 'tipo de equipamento', 'tipo de item'],
    marca: ['marca', 'fabricante', 'manufacturer'],
    modelo: ['modelo', 'model'], status: ['status', 'estado'],
    predio: ['predio', 'prédio', 'unidade'], andar: ['andar', 'pavimento'],
    setor: ['setor/localizacao', 'setor/localização', 'setor', 'localizacao', 'localização', 'local'],
    responsavel: ['responsavel', 'responsável', 'usuario', 'usuário', 'user'],
    origem_patrimonio: ['origem do patrimonio', 'origem do patrimônio', 'origem', 'entidade'],
    observacoes: ['observacoes', 'observações', 'comentarios', 'comentários', 'comment']
};

function normalizarCabecalhoInventario(valor) {
    return String(valor || '').replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function normalizarTextoInventario(valor, limite = 500) {
    return String(valor ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limite);
}

function normalizarStatusInventarioImportado(valor) {
    const status = normalizarTextoInventario(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!status) return 'Não informado';
    if (status.includes('fora') && status.includes('uso')) return 'Estoque';
    if (status === 'em estoque' || status === 'estoque') return 'Estoque';
    if (status === 'em uso' || status === 'uso') return 'Em uso';
    if (status.includes('danific')) return 'Danificado';
    if (status.includes('nao informado')) return 'Não informado';
    return normalizarTextoInventario(valor, 80);
}

function normalizarNumeroSerieImportado(valor) {
    return normalizarTextoInventario(valor, 120).replace(/^FDRAND-/i, '');
}

function detectarDelimitadorCsv(texto) {
    const primeiraLinha = String(texto).replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
    const contar = delimitador => {
        let total = 0; let aspas = false;
        for (const caractere of primeiraLinha) {
            if (caractere === '"') aspas = !aspas;
            else if (caractere === delimitador && !aspas) total++;
        }
        return total;
    };
    return contar(';') >= contar(',') ? ';' : ',';
}

function parseCsvInventario(texto) {
    const delimitador = detectarDelimitadorCsv(texto);
    const linhas = []; let linha = []; let campo = ''; let aspas = false;
    const entrada = String(texto).replace(/^\uFEFF/, '');
    for (let i = 0; i < entrada.length; i++) {
        const caractere = entrada[i];
        if (caractere === '"') {
            if (aspas && entrada[i + 1] === '"') { campo += '"'; i++; }
            else aspas = !aspas;
        } else if (caractere === delimitador && !aspas) { linha.push(campo.trim()); campo = ''; }
        else if ((caractere === '\n' || caractere === '\r') && !aspas) {
            if (caractere === '\r' && entrada[i + 1] === '\n') i++;
            linha.push(campo.trim()); campo = '';
            if (linha.some(valor => valor !== '')) linhas.push(linha);
            linha = [];
        } else campo += caractere;
    }
    linha.push(campo.trim());
    if (linha.some(valor => valor !== '')) linhas.push(linha);
    return linhas;
}

function mapearLinhaInventario(cabecalhos, valores) {
    const indicePorNome = new Map(cabecalhos.map((cabecalho, indice) => [normalizarCabecalhoInventario(cabecalho), indice]));
    const obter = campo => {
        const alias = ALIASES_INVENTARIO[campo].map(normalizarCabecalhoInventario).find(nome => indicePorNome.has(nome));
        return alias ? normalizarTextoInventario(valores[indicePorNome.get(alias)] || '') : '';
    };
    const localizacao = obter('setor');
    const serie = normalizarNumeroSerieImportado(obter('numero_serie') || obter('nome'));
    const codigoBarras = normalizarNumeroSerieImportado(obter('codigo_barras') || serie);
    const registro = {
        codigo_barras: codigoBarras || null,
        numero_serie: serie || null,
        patrimonio: normalizarTextoInventario(obter('patrimonio'), 120) || null,
        nome: obter('nome') || null,
        tipo: normalizarTextoInventario(obter('tipo') || 'EQUIPAMENTO', 80), marca: normalizarTextoInventario(obter('marca') || 'Não informado', 120),
        modelo: normalizarTextoInventario(obter('modelo') || obter('nome') || 'Não informado', 180),
        status: normalizarStatusInventarioImportado(obter('status')), predio: obter('predio') || null,
        andar: obter('andar') || null, setor: localizacao || null,
        responsavel: obter('responsavel') || null,
        origem_patrimonio: obter('origem_patrimonio') || null,
        observacoes: obter('observacoes') || null
    };
    return registro;
}

function chaveNormalizada(valor) { return String(valor || '').trim().toLocaleLowerCase('pt-BR'); }

async function prepararImportacaoInventario(event) {
    if (!window.exigirAdmin()) return;
    const arquivos = [...(event.target.files || [])];
    event.target.value = '';
    if (!arquivos.length) return;
    const painel = document.getElementById('inventario-import-preview');
    painel.className = 'import-preview';
    painel.innerHTML = '<p>Validando arquivos e duplicidades...</p>';
    try {
        const candidatos = [];
        for (const arquivo of arquivos) {
            const matriz = parseCsvInventario(await arquivo.text());
            if (matriz.length < 2) continue;
            for (const valores of matriz.slice(1)) candidatos.push({ ...mapearLinhaInventario(matriz[0], valores), arquivo_origem: arquivo.name });
        }
        const invalidos = candidatos.filter(item => !item.numero_serie && !item.codigo_barras && !item.patrimonio);
        const validos = candidatos.filter(item => item.numero_serie || item.codigo_barras || item.patrimonio);
        const { data: existentes, error } = await supabase.from('inventario').select('id,codigo_barras,numero_serie,patrimonio');
        if (error) throw error;
        const chavesExistentes = new Set((existentes || []).flatMap(item => [item.codigo_barras, item.numero_serie, item.patrimonio].map(chaveNormalizada).filter(Boolean)));
        const chavesArquivo = new Set(); const duplicados = []; const novos = [];
        validos.forEach(item => {
            const chaves = [item.codigo_barras, item.numero_serie, item.patrimonio].map(chaveNormalizada).filter(Boolean);
            if (chaves.some(chave => chavesExistentes.has(chave) || chavesArquivo.has(chave))) duplicados.push(item);
            else { chaves.forEach(chave => chavesArquivo.add(chave)); novos.push(item); }
        });
        importacaoInventarioPendente = novos.map(({ arquivo_origem, ...item }) => item);
        resumoImportacaoInventario = { arquivos: arquivos.length, total: candidatos.length, novos: novos.length, duplicados: duplicados.length, invalidos: invalidos.length };
        painel.innerHTML = renderizarResumoImportacao(resumoImportacaoInventario, novos.slice(0, 8));
    } catch (error) {
        painel.innerHTML = `<p class="import-error">Não foi possível preparar a importação: ${invEscape(error.message)}</p>`;
    }
}

function renderizarResumoImportacao(resumo, amostra) {
    return `<div class="import-summary">
        <div><strong>${resumo.total}</strong><span>Linhas lidas</span></div><div><strong>${resumo.novos}</strong><span>Novos válidos</span></div>
        <div><strong>${resumo.duplicados}</strong><span>Duplicados ignorados</span></div><div><strong>${resumo.invalidos}</strong><span>Sem identificador</span></div>
    </div>
    ${amostra.length ? `<div class="table-responsive"><table><thead><tr><th>Série</th><th>Patrimônio</th><th>Tipo</th><th>Modelo</th><th>Local</th></tr></thead><tbody>${amostra.map(item => `<tr><td>${invEscape(item.numero_serie || '-')}</td><td>${invEscape(item.patrimonio || '-')}</td><td>${invEscape(item.tipo)}</td><td>${invEscape(item.modelo)}</td><td>${invEscape(item.setor || '-')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="import-actions"><button class="btn-success" ${resumo.novos ? '' : 'disabled'} onclick="confirmarImportacaoInventario()">Importar ${resumo.novos} equipamento(s)</button><button class="btn-secondary" onclick="cancelarImportacaoInventario()">Cancelar</button></div>`;
}

async function confirmarImportacaoInventario() {
    if (!window.exigirAdmin() || !importacaoInventarioPendente.length) return;
    const botao = document.querySelector('#inventario-import-preview .btn-success');
    if (botao) { botao.disabled = true; botao.textContent = 'Importando...'; }
    let importados = 0; const falhas = [];
    const tiposImportados = [...new Set(importacaoInventarioPendente.map(item => item.tipo).filter(Boolean))];
    const { data: tiposAtuais, error: erroTipos } = await supabase.from('tipos_equipamento').select('nome');
    if (erroTipos) return mostrarAviso(`Não foi possível validar os tipos: ${erroTipos.message}`, 'erro');
    const tiposExistentes = new Set((tiposAtuais || []).map(item => chaveNormalizada(item.nome)));
    const novosTipos = tiposImportados.filter(tipo => !tiposExistentes.has(chaveNormalizada(tipo))).map(nome => ({ nome }));
    if (novosTipos.length) {
        const { error: erroNovosTipos } = await supabase.from('tipos_equipamento').insert(novosTipos);
        if (erroNovosTipos) return mostrarAviso(`Não foi possível cadastrar os tipos importados: ${erroNovosTipos.message}`, 'erro');
    }
    for (let inicio = 0; inicio < importacaoInventarioPendente.length; inicio += 50) {
        const lote = importacaoInventarioPendente.slice(inicio, inicio + 50);
        const { data, error } = await supabase.from('inventario').insert(lote).select('id');
        if (!error) importados += data?.length || lote.length;
        else {
            for (const item of lote) {
                const { error: erroItem } = await supabase.from('inventario').insert([item]);
                if (erroItem) falhas.push(`${item.numero_serie || item.codigo_barras || item.patrimonio}: ${erroItem.message}`);
                else importados++;
            }
        }
    }
    const painel = document.getElementById('inventario-import-preview');
    painel.innerHTML = `<p class="import-success"><strong>${importados}</strong> equipamento(s) importado(s). ${falhas.length ? `${falhas.length} falha(s) foram ignoradas.` : 'Sem falhas.'}</p>${falhas.length ? `<details><summary>Ver falhas</summary><ul>${falhas.slice(0, 30).map(falha => `<li>${invEscape(falha)}</li>`).join('')}</ul></details>` : ''}`;
    importacaoInventarioPendente = [];
    await carregarInventario();
    mostrarAviso(`Importação concluída: ${importados} equipamento(s).`, falhas.length ? 'aviso' : 'sucesso');
}

function cancelarImportacaoInventario() {
    if (!window.exigirAdmin || !window.exigirAdmin()) return;
    importacaoInventarioPendente = []; resumoImportacaoInventario = null;
    document.getElementById('inventario-import-preview').className = 'import-preview hidden';
}

function escaparCelulaCsv(valor) {
    let texto = String(valor ?? '');
    if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
    texto = texto.replaceAll('"', '""');
    return `"${texto}"`;
}

function baixarCsvInventario(nome, linhas) {
    const conteudo = '\uFEFF' + linhas.map(linha => linha.map(escaparCelulaCsv).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = nome; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportarInventarioCsv() {
    if (!window.exigirAdmin || !window.exigirAdmin()) return;
    const { data, error } = await supabase.from('inventario').select('*').order('tipo').order('marca').order('modelo');
    if (error) return mostrarAviso(`Erro ao exportar inventário: ${error.message}`, 'erro');
    if (!data?.length) return mostrarAviso('Não existem equipamentos cadastrados para exportar.', 'aviso');
    const linhas = [COLUNAS_EXPORTACAO_INVENTARIO.map(([titulo]) => titulo), ...data.map(item => COLUNAS_EXPORTACAO_INVENTARIO.map(([, campo]) => item[campo] || ''))];
    baixarCsvInventario(`inventario_gestao_ti_${new Date().toISOString().slice(0, 10)}.csv`, linhas);
    mostrarAviso(`${data.length} equipamento(s) exportado(s).`, 'sucesso');
}

function baixarModeloInventarioCsv() {
    baixarCsvInventario('modelo_importacao_inventario.csv', [
        COLUNAS_EXPORTACAO_INVENTARIO.slice(0, 14).map(([titulo]) => titulo),
        ['789000000001', 'SN-EXEMPLO-001', 'PAT-001', 'COMPUTADOR', 'Dell', 'OptiPlex', 'Estoque', 'UPI', '1º Andar', 'Recepção', 'Responsável', 'RioSaude', 'Linha de exemplo - remova antes de importar', '']
    ]);
}
