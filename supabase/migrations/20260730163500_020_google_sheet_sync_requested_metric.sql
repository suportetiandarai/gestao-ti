alter table public.google_sheet_sync_logs
  add column if not exists records_requested integer not null default 0,
  add column if not exists records_invalid_date integer not null default 0,
  add column if not exists records_missing_name integer not null default 0,
  add column if not exists records_before_cutoff integer not null default 0;

comment on column public.google_sheet_sync_logs.records_requested is
  'Quantidade de linhas recebidas do Google Sheets antes dos filtros de normalização.';
comment on column public.google_sheet_sync_logs.records_invalid_date is
  'Quantidade de linhas ignoradas por data de solicitação inválida.';
comment on column public.google_sheet_sync_logs.records_missing_name is
  'Quantidade de linhas ignoradas por ausência do nome obrigatório.';
comment on column public.google_sheet_sync_logs.records_before_cutoff is
  'Quantidade de linhas ignoradas por estarem antes do corte operacional.';

notify pgrst, 'reload schema';
