# Integração do GESTÃO TI com o GLPI

Este guia descreve como preparar o GLPI real para alimentar o Dashboard GLPI do sistema GESTÃO TI com segurança.

## 1. Verificar a versão do GLPI

No GLPI, consulte a versão em áreas como `Configurar > Geral`, rodapé administrativo ou página de informações do sistema. A versão é importante porque campos, nomes de menus e recursos da API podem variar.

O sistema foi preparado para GLPI 10.0.18 usando a API REST clássica em `/apirest.php`. Não assuma endpoints novos sem testar no ambiente real.

## 2. Habilitar a API REST

No GLPI, acesse o caminho equivalente da versão instalada, normalmente:

```text
Configurar > Geral > API
```

Verifique:

- API REST ativada.
- Intervalos de IP autorizados, quando a instalação exigir.
- Cliente de API criado.
- `App-Token` gerado ou localizado.
- Permissão para criar sessões pela API.

Depois, valide a URL:

```text
{GLPI_BASE_URL}/apirest.php
```

## 3. Usuário exclusivo de integração

Crie um usuário exclusivo, por exemplo:

```text
integracao.dashboard
```

Não use conta pessoal nem perfil administrador geral.

Permissões recomendadas: somente leitura para chamados, usuários/técnicos, grupos, entidades, categorias, status, acompanhamentos, soluções, SLA, datas e tempos de atendimento. Não conceda alteração, exclusão, fechamento ou edição de chamados.

Gere ou localize o `User-Token` desse usuário.

## 4. Variáveis de ambiente

Configure os secrets no ambiente do back-end/Supabase Edge Function. Nunca coloque tokens no front-end.

```env
GLPI_BASE_URL=
GLPI_API_URL=
GLPI_APP_TOKEN=
GLPI_USER_TOKEN=
GLPI_REQUEST_TIMEOUT=15000
GLPI_SYNC_INTERVAL_SECONDS=30
GLPI_VERIFY_SSL=true
GLPI_ENTITY_ID=
GLPI_PROFILE_ID=
PUBLIC_DASHBOARD_ENABLED=false
PUBLIC_DASHBOARD_TOKEN=
NEXT_PUBLIC_APP_NAME=GESTÃO TI
APP_TIMEZONE=America/Sao_Paulo
```

## 5. Testar conexão com o GLPI

Na aba GLPI, acesse `Configurações` e clique em `Testar conexão com o GLPI`.

O teste deve validar:

1. URL acessível.
2. API ativa.
3. `App-Token` válido.
4. `User-Token` válido.
5. Sessão criada.
6. Consulta de chamados permitida.
7. Consulta de técnicos permitida.
8. Sessão encerrada corretamente.

Mensagens prováveis de erro:

- URL incorreta.
- API desativada.
- `App-Token` inválido.
- `User-Token` inválido.
- Permissão insuficiente.
- Certificado SSL inválido.
- Timeout.
- Bloqueio de rede.
- CORS, caso alguém tente acessar o GLPI direto pelo navegador.
- Erro do servidor GLPI.

Detalhes técnicos devem ficar apenas nos logs protegidos.

## 6. Comunicação segura

Fluxo correto:

```text
Navegador
  -> Back-end do GESTÃO TI
  -> API do GLPI
```

Fluxo proibido:

```text
Navegador
  -> API do GLPI usando tokens expostos
```

A integração implementa sessão, timeout, paginação, cache, normalização e encerramento de sessão. Para produção, recomenda-se adicionar job agendado e fila/Redis quando houver alto volume.

## 7. Atualização a cada 30 segundos

O painel diário atualiza o estado visual a cada 30 segundos e impede consultas simultâneas. Em produção, não consulte todo o histórico a cada ciclo.

Estratégia recomendada:

- Buscar somente registros alterados desde a última sincronização.
- Usar `date_mod` ou campo equivalente.
- Paginção com limite por ciclo.
- Salvar último horário de sincronização.
- Atualizar cache local.
- Preservar últimos dados válidos em caso de falha.

Para poucos dados, a consulta direta via back-end pode bastar. Para relatórios, vários painéis e histórico, priorize banco intermediário.

## 8. Mapeamento dos status

No GLPI 10, os status comuns são:

- `1`: Novo.
- `2`: Atribuído.
- `3`: Planejado.
- `4`: Pendente.
- `5`: Solucionado.
- `6`: Fechado.

Confirme no ambiente real antes de congelar regras gerenciais. O dashboard possui camada de normalização para evitar espalhar números mágicos na interface.

## 9. Critérios das métricas

- Chamados criados hoje: abertura entre `00:00:00` e `23:59:59` em `America/Sao_Paulo`.
- Chamados atendidos hoje: regra padrão baseada em atribuição no dia; pode ser adaptada para acompanhamento, solução ou fechamento.
- Chamados por técnico: técnico atribuído ao chamado conforme dados sincronizados do GLPI.
- Tempo médio de atendimento: atribuição até solução.
- Tempo médio de solução: abertura até solução.
- SLA vencido: chamado aberto cujo prazo de solução foi ultrapassado.
- Valores ausentes: exibidos como `Não disponível` e não entram nas médias.

## 10. Dashboard público

O painel público deve exibir somente indicadores gerenciais autorizados. Não exponha tokens, e-mails, telefones, requerentes, descrições confidenciais, dados de pacientes ou acompanhamentos.

No projeto estático atual, a interface permite gerar token local e abrir o painel público para validação visual. Para produção, armazene e valide o token no back-end, com possibilidade de revogação, expiração, restrição por IP e PIN.

Configure o servidor para reescrever:

```text
/dashboard/publico/[token] -> /index.html
```

Sem essa regra de rewrite, use a URL de teste com query string gerada pelo botão `Abrir painel público`.
