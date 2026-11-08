# CD Vistoria

App instalável (PWA) para vistoriadores em campo registrarem o estado de um veículo pelo celular e gerarem o laudo em PDF no próprio aparelho. Funciona offline; os dados sobem para o Supabase quando a conexão volta. O front-end é estático e fica hospedado no Netlify.

- HTML, CSS e JavaScript puro (ES modules), sem etapa de build obrigatória.
- Bibliotecas locais em `vendor/`: jsPDF 4.2.1, jspdf-autotable 5.0.9 e supabase-js 2.118.0. Nada é carregado de CDN.
- Backend: Supabase (Auth, Postgres com RLS e Storage privado).
- Design e decisões: [`docs/superpowers/specs/2026-11-07-vistoria-veicular-design.md`](docs/superpowers/specs/2026-11-07-vistoria-veicular-design.md).

## 1. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (região mais próxima, por exemplo São Paulo).
2. Rode a migration:
   - **Pelo painel:** SQL Editor → New query → cole todo o conteúdo de `supabase/migrations/0001_init.sql` → Run.
   - **Pela CLI:** `npx --yes supabase@2.122.0 link --project-ref <ref-do-projeto>` e depois `npx supabase@2.122.0 db push`.
3. Crie o primeiro usuário: Authentication → Users → Add user → Create new user. Informe e-mail e senha e marque **Auto Confirm User**. Não há cadastro público: todo vistoriador é criado aqui.
4. Copie Project Settings → API → **Project URL** e a **anon key** (nos projetos novos, a **Publishable key** `sb_publishable_…` também funciona) para o `env.js`:
   ```js
   export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJ...";
   ```
   **Nunca** use a `service_role` key nem a `secret` key no `env.js`: elas ignoram o RLS.
5. Em Authentication → URL Configuration, preencha **Site URL** com a URL do Netlify (ex.: `https://nome-do-site.netlify.app`). Em **Redirect URLs**, adicione essa URL e `http://localhost:3000`.
6. (Opcional) Confira a segurança: cole `supabase/tests/rls.sql` no SQL Editor e rode. Ele simula dois usuários dentro de uma transação desfeita no fim; o esperado é a mensagem `RLS OK`.

Para dar a um administrador a leitura de todas as vistorias, veja o comentário "administradores" no fim da migration.

## 2. Rodar localmente

1. Preencha o `env.js` (passo 1.4).
2. Na pasta do projeto, rode:
   ```bash
   npx --yes serve@14.2.6 -l 3000 .
   ```
3. Abra o endereço que o `serve` mostrar no terminal (normalmente `http://localhost:3000`; se a porta 3000 estiver ocupada, ele escolhe outra). O `serve.json` aplica localmente os mesmos cabeçalhos do Netlify, inclusive a CSP.
   Se aparecer a tela "Configure o arquivo env.js", falta o passo 1.4.
4. Para testar no celular, use um deploy do Netlify (o Service Worker e a câmera exigem HTTPS fora do `localhost`).

**Supabase local (opcional, exige Docker):**

```bash
npx --yes supabase@2.122.0 start
```

```bash
bash supabase/criar-usuarios-teste.sh
```

Isso cria `vistoriador.a@teste.local` e `vistoriador.b@teste.local`, com a senha de teste definida no script. Use no `env.js` o `API_URL` e a `ANON_KEY` mostrados por `npx supabase@2.122.0 status`.

## 3. Publicar no Netlify

O **caminho padrão** é publicar a pasta como está, com o `env.js` já preenchido à mão. O caminho com build é opcional.

1. Suba o projeto para um repositório no GitHub e, no Netlify, use **Add new site → Import an existing project**. Para um primeiro teste, você também pode arrastar a pasta em [app.netlify.com/drop](https://app.netlify.com/drop).
2. Confira o `netlify.toml`: `publish = "."`, sem comando de build, cabeçalhos do Service Worker, manifest, cache e segurança.
3. **Opcional: gerar o `env.js` no build**, sem editar o arquivo à mão.
   1. Em Site settings → Environment variables, cadastre `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
   2. No `netlify.toml`, descomente a linha `command = "node scripts/gerar-env.js"`.

   O script também troca a `CACHE_VERSION` do `sw.js` a cada deploy.
4. Copie a URL gerada (`https://nome-do-site.netlify.app`) para o Supabase, em Authentication → URL Configuration (passo 1.5).
5. Se o seu Supabase usar um domínio próprio (fora de `*.supabase.co`), acrescente esse domínio em `img-src` e `connect-src` da `Content-Security-Policy` no `netlify.toml`.

As pastas `tests/`, `docs/`, `supabase/` e `scripts/` devolvem 404 em produção.

## 4. Instalar no celular

1. Abra a URL do Netlify no celular e entre com o e-mail e a senha criados no Supabase. O primeiro acesso precisa de internet.
2. **Android (Chrome):** toque em **Instalar app** na faixa ou no menu ☰.
3. **iPhone (Safari):** toque em Compartilhar → **Adicionar à Tela de Início**.
4. A partir daí, o app abre e faz vistorias completas sem internet. As pendentes são enviadas quando a conexão volta, quando o app é aberto ou quando você volta para ele.

## 5. Atualizar o app

A cada deploy, troque `const CACHE_VERSION = "v1";` no `sw.js` (por exemplo, para `"v2"`). Se usar o `scripts/gerar-env.js`, isso é automático. Quem estiver com o app aberto vê **"Nova versão disponível — Atualizar"**; o rascunho em andamento é salvo antes de recarregar.

## 6. Editar listas

As listas ficam em `config.js`:
- itens do checklist (`CHECKLIST_ITENS`);
- áreas e tipos de avaria (`AREAS_AVARIA`, `TIPOS_AVARIA`);
- combustíveis;
- parâmetros de foto e de PDF;
- dias de cache de fotos.

Mudar áreas e tipos não exige migration. Combustível e gravidade têm `check` no banco: se mudar essas listas, ajuste a migration também. Os ícones vêm de `node scripts/gerar-icones.js`.

## 7. Testes

- **Node, sem dependências:**
  ```bash
  npm test
  ```
  Cobre validação, formatação, sincronização (com Supabase falso), login, mapeamento do Supabase, editor de rascunho, ícones e `gerar-env`.
- **Navegador:** com o servidor local rodando, abra `http://localhost:3000/tests/navegador/index.html`; o resultado esperado é `N ok, 0 falhas`. A página usa um banco local separado (`vistoria-veicular-testes`) e não toca nos dados do app.
- **Banco:** `supabase/tests/rls.sql` (passo 1.6). Com o Supabase local:
  ```bash
  docker exec -i supabase_db_vistoria-veicular psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
  ```

## 8. Limites conhecidos

- **Envio com o app fechado.** O Background Sync só existe no Chrome do Android, e mesmo lá apenas acorda o app aberto. Com o app fechado, o envio acontece na próxima vez em que ele for aberto.
- **Lacunas na numeração.** A numeração `VIS-000001` vem de uma sequence do Postgres e pode pular números raramente, quando uma gravação é recusada pelo servidor.
- **Fotos antigas.** Fotos de vistorias já sincronizadas saem do aparelho depois de 30 dias (`DIAS_CACHE_FOTOS`) e são baixadas de novo quando a vistoria é aberta com internet. Vistorias pendentes nunca perdem as fotos.

## 9. Lista de verificação

| Requisito | Onde |
|---|---|
| Campos do veículo: chassi (texto, exatamente 6, maiúsculas, contador "4/6", erro), marca, modelo, cor, km (teclado numérico, milhar), combustível em 5 chips | `views/etapa-veiculo.js`, `formatos.js`, `validacao.js` |
| 3 fotos fixas (Frente, Traseira, Chassi) com Refazer/Remover, tela cheia e obrigatórias ao finalizar; compressão 1280 px / JPEG 0,7 | `views/etapa-veiculo.js`, `photos.js` |
| Checklist com os 13 itens em Presente/Ausente, "Marcar todos como Presente", "Limpar" e observação; lista em `config.js` | `views/etapa-checklist.js`, `config.js` |
| Avarias ilimitadas com área, tipo, gravidade colorida, descrição e várias fotos; "Veículo sem avarias"; aviso sem foto | `views/etapa-avarias.js` |
| Assinaturas do vistoriador e do motorista do reboque (canvas, Pointer Events, `devicePixelRatio`, `touch-action: none`, Limpar) | `signature.js`, `views/etapa-assinaturas.js` |
| Data e hora registradas ao finalizar (`realizada_em`) | `views/nova.js`, `storage.js` |
| Etapas com progresso, Voltar/Avançar, rascunho automático e retomada | `views/nova.js`, `rascunho.js` |
| Finalizar com a lista do que falta e link para cada campo | `views/nova.js`, `validacao.js` |
| Aba Vistorias: lista do Supabase com cache offline, "Carregar mais", busca, período, rascunhos e estado vazio | `views/vistorias.js` |
| Detalhe: leitura completa, Baixar PDF, Compartilhar (Web Share API) e Excluir (também no servidor) | `views/detalhe.js` |
| PDF A4 com cabeçalho, dados, fotos, checklist, avarias, assinaturas e rodapé "Vistoria nº X — página N de M"; `Vistoria_<chassi>_<aaaa-mm-dd>.pdf`; menos de 10 MB | `pdf.js` |
| Login por e-mail e senha, sessão persistente e válida offline, Sair, sem cadastro público | `auth.js`, `views/login.js`, `supabase/config.toml` |
| RLS nas 3 tabelas e no Storage; comentário de administrador | `supabase/migrations/0001_init.sql`, `supabase/tests/rls.sql` |
| Bucket privado `vistorias`, caminhos `<user_id>/<inspection_id>/<arquivo>`, URLs assinadas | migration, `supabase.js` |
| Sincronização idempotente; Sincronizada/Pendente/Erro; "Tentar novamente"; número provisório → oficial | `sync.js`, `views/detalhe.js`, `views/vistorias.js` |
| App inteiro abre e finaliza vistorias em modo avião | `sw.js` |
| `netlify.toml`: `no-cache` no `sw.js`, `Content-Type` do manifest, cache longo em `icons/` e `vendor/`, segurança e CSP | `netlify.toml` |
| "Nova versão disponível — Atualizar" e "Instalar app" | `app.js`, `sw.js`, `manifest.webmanifest` |
| Mensagens claras: armazenamento cheio, câmera bloqueada, foto ilegível, falha no PDF, sessão expirada | `storage.js`, `photos.js`, `pdf.js`, `app.js` |
