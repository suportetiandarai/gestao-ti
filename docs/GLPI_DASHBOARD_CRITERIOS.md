# Dashboard GLPI RioSaúde - critérios dos indicadores

## Diagnóstico inicial

- Versão informada e adotada como compatibilidade esperada: GLPI 10.0.18. A conexão autenticada foi validada, mas a API não expôs a versão; portanto, `10.0.18` continua sendo a versão declarada pela administração, não inferida pelo código.
- API validada: REST clássica do GLPI em `{GLPI_BASE_URL}/apirest.php`.
- API REST habilitada: `initSession`, consultas somente leitura e `killSession` responderam com sucesso no ambiente real.
- Autenticação preferencial: `App-Token` + `User-Token`.
- Alternativa suportada: login e senha via Basic Auth, somente se autorizado.
- OAuth: não adotado para o MVP em GLPI 10.0.18.
- Permissões do usuário de API: somente leitura para chamados, usuários, grupos, categorias, entidades, localizações, SLAs e relacionamentos de chamados.
- Consumo de dados: o front-end consulta o cache próprio em PostgreSQL/Supabase. O GLPI é acessado apenas pela Edge Function.
- Atualização: sincronização incremental por data de modificação, paginação e cache. O Dashboard Diário usa intervalo fixado por padrão em 30 segundos, sem recarregar a página.

## Endpoints GLPI usados

- `GET /apirest.php/initSession`
- `GET /apirest.php/killSession`
- `GET /apirest.php/Ticket`
- Enriquecimento usado: `Ticket/{id}/Ticket_User`, `Ticket/{id}/Log` e `User/{id}`. As consultas de `Group`, `ITILCategory`, `SLA`, `OLA` e entidades também foram validadas em modo somente leitura.

## Identificação dos dados

- Chamados: `Ticket.id`.
- Técnicos: relações `Ticket_User` de tipo `2` (técnico), enriquecidas com `User/{id}`.
- Grupos técnicos: grupo atribuído ao chamado.
- Categorias: `itilcategories_id`.
- Mapeamento centralizado do GLPI 10: códigos `1 Novo`, `2 Atribuído`, `3 Planejado`, `4 Pendente`, `5 Solucionado`, `6 Fechado`. A amostra real confirmou somente os códigos `2` e `5`; os demais não foram artificialmente produzidos.
- Datas: abertura `date`, modificação `date_mod`, solução `solvedate` e fechamento `closedate`. Como `date_assign` não é exposto nesta instalação, a atribuição usa `Log.date_mod` no evento de técnico (`id_search_option=5`).
- Fuso horário: datas da API que não trazem deslocamento explícito recebem `GLPI_TIMEZONE_OFFSET=-03:00` na sincronização; os limites e a exibição do Dashboard Diário usam `America/Sao_Paulo`.
- Primeira resposta: abertura somada ao tempo em segundos de `takeintoaccount_delay_stat`, quando o GLPI o disponibilizar. O valor não é tratado como uma data isolada.
- Prazos externos (SLA): atendimento `time_to_own` e solução `time_to_resolve`.
- Prazos internos (OLA): atendimento `internal_time_to_own` e solução `internal_time_to_resolve`.
- Tempo de atendimento: solução menos atribuição quando `assigned_at` estiver disponível; caso contrário, solução menos abertura.
- Tempo de solução: solução menos abertura.
- Tempo de fechamento: fechamento menos abertura.

## Fórmulas

- Chamados abertos: chamados cujo status esteja em `Novo`, `Atribuído`, `Planejado` ou `Pendente`.
- Chamados pendentes: chamados atualmente no status `Pendente`.
- Chamados finalizados: chamados com `solved_at` ou `closed_at` dentro do período filtrado.
- Chamados atendidos por técnico no Dashboard Geral: regra configurável. O padrão inicial é chamado solucionado pelo técnico no dia atual.
- Chamados abertos hoje: `opened_at` entre `00:00:00` e `23:59:59` em `America/Sao_Paulo`.
- Em atendimento: status atual `2 Atribuído` ou `3 Planejado`, com `first_response_at` registrado. O uso da primeira resposta torna esse indicador mutuamente exclusivo de “Aguardando atendimento”.
- Aguardando atendimento: status atual `1 Novo`; ou status `2 Atribuído`/`3 Planejado` sem `first_response_at`. Essa regra usa a primeira resposta calculada pelo campo estatístico do GLPI. Enquanto acompanhamentos individuais não forem sincronizados, eles não são usados separadamente para retirar um chamado da espera.
- Chamados atendidos hoje no Dashboard Diário: chamado cuja atribuição ocorreu no intervalo do dia em `America/Sao_Paulo`, agrupado pelo técnico atualmente atribuído. Cada par técnico/chamado é contado uma única vez. A instalação real não devolve `Ticket.date_assign`; por isso, o técnico atual vem de `Ticket/{id}/Ticket_User` com `type=2` e a data vem do evento `Ticket/{id}/Log` cujo `id_search_option=5` (opção real “Técnico”). Se `date_assign` passar a ser exposto, ele volta a ser a fonte preferencial. Acompanhamentos, soluções e fechamentos não são somados.
- Tempo médio de primeira resposta: soma de `first_response_at - opened_at` dividida pela quantidade de chamados com as duas datas válidas.
- Tempo médio de solução: soma de `solved_at - opened_at` dividida pela quantidade de chamados solucionados com datas válidas.
- Tempo médio de fechamento: soma de `closed_at - opened_at` dividida pela quantidade de chamados fechados com datas válidas.
- Chamados estourados: chamado não finalizado que ultrapassou ao menos um prazo real configurado no GLPI: atendimento externo (SLA TTO), solução externa (SLA TTR), atendimento interno (OLA TTO) ou solução interna (OLA TTR). Quando a etapa já ocorreu, compara-se sua data com o prazo; caso contrário, compara-se o horário atual. A idade isolada do chamado nunca é usada.
- SLA próximo do vencimento: chamado não finalizado cujo prazo esteja dentro da janela configurada por `GLPI_SLA_WARNING_MINUTES`.

## Privacidade do Dashboard Diário

- A lista exibe somente número, título autorizado, status, técnico, hora, categoria e unidade autorizadas.
- Solicitante, e-mail, telefone, descrição, acompanhamentos, dados clínicos e demais dados sensíveis não são renderizados.
- No painel público, título, nome do técnico, categoria e unidade obedecem às opções definidas pelo administrador.
- A quantidade de chamados recentes é configurada na área administrativa; o padrão é 10.

Valores indisponíveis são exibidos como “Não disponível” e não entram em médias.

## Sincronização e disponibilidade

- O navegador nunca consulta o GLPI diretamente; lê o cache Supabase.
- A Edge Function usa cursor persistente por `date_mod`, paginação, timeout e retry limitado.
- As atribuições ficam em `glpi_ticket_assignments_dashboard`, deduplicadas pela chave `(ticket_glpi_id, technician_id)`; isso preserva chamados com mais de um técnico atual.
- `glpi_sync_state` bloqueia execuções concorrentes e registra `online`, `syncing`, `delayed` ou `offline`.
- Os últimos dados válidos permanecem visíveis em falhas de rede ou GLPI.
- A atualização visual do Dashboard Diário continua fixa em 30 segundos.
