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

# Nome de vistoriador de cada usuário de teste (tabela perfis; sem isso o envio é recusado).
docker exec -i supabase_db_vistoria-veicular psql -U postgres -v ON_ERROR_STOP=1 -tA -c "
  insert into public.perfis (id, nome)
  select id, case email when 'vistoriador.a@teste.local' then 'Vistoriador A Teste' else 'Vistoriador B Teste' end
    from auth.users where email in ('vistoriador.a@teste.local', 'vistoriador.b@teste.local')
  on conflict (id) do nothing;" >/dev/null
echo "perfis de teste prontos (Vistoriador A Teste / Vistoriador B Teste)"
