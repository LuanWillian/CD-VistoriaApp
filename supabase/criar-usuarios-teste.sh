#!/bin/bash
# Cria dois usuários de TESTE no Supabase LOCAL (npx supabase start).
# Não use em produção: a service_role key local só existe na sua máquina.
set -euo pipefail
cd "$(dirname "$0")/.."

SENHA_TESTE="vistoria-teste-123"
USUARIOS=("vistoriador.a@teste.local" "vistoriador.b@teste.local")

eval "$(npx --yes supabase@2.122.0 status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"

for email in "${USUARIOS[@]}"; do
  resposta=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$SENHA_TESTE\",\"email_confirm\":true}")
  echo "$email → HTTP $resposta (200 = criado, 422 = já existia)"
done
