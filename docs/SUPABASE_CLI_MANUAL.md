# Supabase CLI no Windows

Destino: `cctygrudsyoowuotlyfo`.

```powershell
cd C:\Users\joao.monteiro\Desktop\gestao-ti
$env:NODE_OPTIONS='--use-system-ca --dns-result-order=ipv4first'
npx supabase --version
npx supabase login
npx supabase projects list
npx supabase link --project-ref cctygrudsyoowuotlyfo
npx supabase migration list
npx supabase db push --dry-run
```

Digite token e senha somente no terminal. Após revisar o dry-run:

```powershell
npx supabase db push
npx supabase migration list
```

Preencha localmente `supabase\.env.secrets.local`, já ignorado pelo Git:

```env
GLPI_BASE_URL=
GLPI_API_URL=
GLPI_APP_TOKEN=
GLPI_USER_TOKEN=
GLPI_TIMEZONE=America/Sao_Paulo
GLPI_TIMEZONE_OFFSET=-03:00
GLPI_TECH_GROUP_NAME=Suporte TI
GLPI_TECH_GROUP_ID=
PUBLIC_DASHBOARD_ENABLED=true
```

```powershell
npx supabase secrets set --env-file supabase\.env.secrets.local
npx supabase secrets list
npx supabase functions deploy admin-users
npx supabase functions deploy glpi-dashboard
npx supabase functions deploy glpi-dashboard-public --no-verify-jwt
npx supabase functions list
```

Em 27/07/2026, `api.supabase.com` retornou `Transport error` nesta rede. Valide:

```powershell
Test-NetConnection api.supabase.com -Port 443
npx supabase projects list --debug
```

Não use `strict-ssl=false`. Corrija a cadeia corporativa de certificados ou use
uma rede autorizada.

Links: [painel](https://supabase.com/dashboard),
[tokens](https://supabase.com/dashboard/account/tokens),
[CLI](https://supabase.com/docs/guides/local-development/cli/getting-started),
[migrações](https://supabase.com/docs/guides/deployment/database-migrations).
