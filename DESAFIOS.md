# Desafios deste projeto

### 2026-08-27 — `realtime.send` falha após restore do projeto pausado
- **Contexto:** projeto Supabase `Imob` (`xerlqsulzktzadwcvhow`) foi restaurado para hospedar visitas da LP.
- **Problema:** o trigger `realtime.send(...)` gera `ErrorSendingBroadcastMessage: no partition of relation "messages" found for row`. A tabela `realtime.messages` é particionada e, após pause/restore, a partição da hora atual pode não existir.
- **Workaround:** a Edge Function `lws-notify` faz `POST /realtime/v1/api/broadcast/lws-visits/events/visit` (HTTP 202). Web Push segue no mesmo request. Não depender de `realtime.send` neste projeto até as partições voltarem a ser criadas automaticamente.
