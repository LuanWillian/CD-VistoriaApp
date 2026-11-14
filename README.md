# CD Vistoria

App instalável (PWA) para vistoriadores em campo registrarem o estado de um veículo pelo celular e gerarem o laudo em PDF no próprio aparelho. Funciona offline; os dados sobem para o Supabase quando a conexão volta. O front-end é estático e fica hospedado no Netlify.

- HTML, CSS e JavaScript puro (ES modules), sem etapa de build obrigatória.
- Bibliotecas locais em `vendor/`: jsPDF 4.2.1, jspdf-autotable 5.0.9 e supabase-js 2.118.0. Nada é carregado de CDN.
- Backend: Supabase (Auth, Postgres com RLS e Storage privado).
- Design e decisões: [`docs/superpowers/specs/2026-11-07-vistoria-veicular-design.md`](docs/superpowers/specs/2026-11-07-vistoria-veicular-design.md).

## 1. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (região mais próxima, por exemplo São Paulo).
2. Rode a migration:
   - **Pelo painel:** SQL Editor → New query → cole todo o conteúdo de `supabase/migrations/0001_init.sql` → Run. Depois, cada uma numa nova query, faça o mesmo com `supabase/migrations/0002_perfis.sql`, `supabase/migrations/0003_leitura_para_todos.sql`, `supabase/migrations/0004_exclusao_para_todos.sql`, `supabase/migrations/0005_loja_destino.sql` e `supabase/migrations/0006_recebimento_loja.sql`.
   - **Projeto que já está no ar:** rode a `0005_loja_destino.sql` **antes** de publicar a versão com o campo Loja e o dashboard. Sem a coluna `loja`, o servidor recusa o envio das vistorias novas.
   - **Recebimento na loja:** rode a `0006_recebimento_loja.sql` **antes** de publicar a versão com "Recebimentos". Depois, confira com `supabase/tests/rls.sql` (passo 1.6).
   - **Pela CLI:** `npx --yes supabase@2.122.0 link --project-ref <ref-do-projeto>` e depois `npx supabase@2.122.0 db push`.
3. Crie o primeiro usuário: Authentication → Users → Add user → Create new user. Informe e-mail e senha e marque **Auto Confirm User**. Não há cadastro público: todo vistoriador é criado aqui.
   - **Cadastre o nome do vistoriador** (obrigatório): copie o **UID** do usuário em Authentication → Users. Em Table Editor → `perfis` → Insert row, cole o UID em `id` e escreva o nome completo em `nome`. Esse é o nome que aparece na etapa de assinaturas e no laudo; o vistoriador não consegue mudá-lo. Sem esse cadastro, o app avisa "Seu nome de vistoriador não está cadastrado" e não deixa finalizar. Se o nome for cadastrado ou corrigido depois, ele vale a partir da próxima vez que o vistoriador abrir o app com internet.
   - Pelo SQL Editor também funciona: `insert into public.perfis (id, nome) values ('<UID>', 'Nome Completo');`
   - **Conta de loja** (pessoa da loja que confirma o recebimento): crie o usuário do mesmo jeito e cadastre o perfil com `papel = 'loja'` e a loja escrita exatamente como na lista `LOJAS` do `config.js`: `insert into public.perfis (id, nome, papel, loja) values ('<UID>', 'Nome Completo', 'loja', 'PG Prime BMW Natal');`. Uma conta por pessoa. Ela só vê as vistorias enviadas para a sua loja e não cria nem exclui vistorias.
4. Copie Project Settings → API → **Project URL** e a **anon key** (nos projetos novos, a **Publishable key** `sb_publishable_…` também funciona) para o `env.js`:
   ```js
   export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJ...";
   ```
   **Nunca** use a `service_role` key nem a `secret` key no `env.js`: elas ignoram o RLS.
5. Em Authentication → URL Configuration, preencha **Site URL** com a URL do Netlify (ex.: `https://nome-do-site.netlify.app`). Em **Redirect URLs**, adicione essa URL e `http://localhost:3000`.
6. (Opcional) Confira a segurança: cole `supabase/tests/rls.sql` no SQL Editor e rode. Ele simula dois usuários dentro de uma transação desfeita no fim; o esperado é a mensagem `RLS OK`.

**Quem vê o quê:** contas de **loja** (migration `0006`) veem só as vistorias, avarias e arquivos da própria loja, registram o recebimento delas e não criam, alteram nem excluem nada. Para os vistoriadores: todo vistoriador **vê todas** as vistorias, avarias, fotos e assinaturas (migration `0003`). Só o **dono** cria e edita as suas; **qualquer usuário cadastrado pode excluir** qualquer vistoria (migration `0004`), pelo botão Excluir do navegador do computador. Para voltar a "cada um vê só as suas", recrie as policies "dono lê" da `0001` no lugar das "todos leem" da `0003`; para voltar a "só o dono exclui", recrie as "dono exclui" da `0001` no lugar das "todos excluem" da `0004`.

### 1.1 Dados de demonstração (opcional)

Para apresentar o app com números: no SQL Editor, rode `supabase/snippets/demo_criar.sql`. Ele cria 120 vistorias falsas dos últimos 75 dias (marcas da empresa, avarias e recebimentos nas lojas), sem fotos. Para tirar tudo, rode `supabase/snippets/demo_apagar.sql`; as vistorias de verdade não são tocadas.

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

Isso cria `vistoriador.a@teste.local` e `vistoriador.b@teste.local`, com a senha de teste definida no script, e os perfis "Vistoriador A Teste" e "Vistoriador B Teste". Use no `env.js` o `API_URL` e a `ANON_KEY` mostrados por `npx supabase@2.122.0 status`.

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

### 3.1 Publicar no Cloudflare Pages (recomendado)

Sem limite de tráfego no plano gratuito e com servidores no Brasil. Os cabeçalhos (CSP, `sw.js` sem cache) ficam no arquivo `_headers`.

1. No painel da Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** e escolha este repositório.
2. Configuração do build:
   - **Framework preset:** None
   - **Build command:** `node scripts/gerar-env.js && rm -rf tests docs supabase scripts`
   - **Build output directory:** `.`
3. Em **Environment variables (Production)**, cadastre `SUPABASE_URL` e `SUPABASE_ANON_KEY` (a anon/publishable key, nunca a service_role).
4. **Save and Deploy.** Cada push no `main` publica uma versão nova (e o app mostra "Nova versão disponível").
5. Copie a URL `https://<projeto>.pages.dev` para o Supabase, em Authentication → URL Configuration (passo 1.5).

## 4. Instalar no celular

1. Abra a URL do Netlify no celular e entre com o e-mail e a senha criados no Supabase. O primeiro acesso precisa de internet.
2. **Android (Chrome):** toque em **Instalar app** na faixa ou no menu ☰.
3. **iPhone (Safari):** toque em Compartilhar → **Adicionar à Tela de Início**.
4. A partir daí, o app abre e faz vistorias completas sem internet. As pendentes são enviadas quando a conexão volta, quando o app é aberto ou quando você volta para ele.

## 5. Atualizar o app

A cada deploy, troque `const CACHE_VERSION = "v1";` no `sw.js` (por exemplo, para `"v2"`). Se usar o `scripts/gerar-env.js`, isso é automático. Quem estiver com o app aberto vê **"Nova versão disponível — Atualizar"**; o rascunho em andamento é salvo antes de recarregar.

## 6. Editar listas

**Dashboard do gerente (`#/dashboard`):** só no navegador do computador, pelo link "Dashboard" no topo. Mostra, no período escolhido, o volume de vistorias (com comparação ao período anterior), as avarias por gravidade, área e tipo, e as tabelas por marca e por loja de destino. Precisa de internet. Vistorias feitas antes do campo Loja aparecem como "Sem loja informada".

**Recebimento na loja (contas de loja, migration `0006`):** quem entra com uma conta de loja vê só o cartão **Recebimentos**: abas "A receber" e "Recebidos" com os carros enviados para a sua loja e busca pelo chassi. Ao abrir um carro, a pessoa confere a vistoria do CD e toca em **Registrar recebimento**: escolhe "Recebido conforme a vistoria" ou "Recebido com divergência" (aí descreve o que está diferente e pode tirar fotos), assina e confirma. Nome, loja e data/hora vêm do servidor, e o recebimento não pode ser alterado nem apagado pelo app (só pelo Supabase). Precisa de internet; se a conexão cair na hora de confirmar, nada do que foi preenchido se perde. O CD vê o recebimento no detalhe, na coluna e no filtro do painel, no bloco "Recebimento nas lojas" do dashboard e no PDF.

As listas ficam em `config.js`:
- itens do checklist (`CHECKLIST_ITENS`);
- áreas e tipos de avaria (`AREAS_AVARIA`, `TIPOS_AVARIA`);
- lojas de destino (`LOJAS`), usadas na etapa "Dados do veículo" e nos filtros do dashboard;
- combustíveis;
- parâmetros de foto e de PDF;
- dias de cache de fotos.

Mudar áreas, tipos e lojas não exige migration (renomear uma loja não muda as vistorias antigas, que ficam com o nome antigo no dashboard). Combustível e gravidade têm `check` no banco: se mudar essas listas, ajuste a migration também. Os ícones ficam em `icons/` (logo-*.png); ao trocar a logo, use nomes de arquivo novos, porque essa pasta tem cache imutável.

## 7. Testes

- **Node, sem dependências:**
  ```bash
  npm test
  ```
  Cobre validação, formatação, sincronização (com Supabase falso), login, mapeamento do Supabase, editor de rascunho, ícones e `gerar-env`.
- **Navegador:** com o servidor local rodando, abra `http://localhost:3000/tests/navegador/index.html`; o resultado esperado é `N ok, 0 falhas`. A página usa um banco local separado (`vistoria-veicular-testes`) e não toca nos dados do app.
- **Banco:** `supabase/tests/rls.sql` (passo 1.6). Com o Supabase local:
  ```bash
  docker exec -i supabase_db_cd-vistoriaapp psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
  ```

## 8. Limites conhecidos

- **Envio com o app fechado.** O Background Sync só existe no Chrome do Android, e mesmo lá apenas acorda o app aberto. Com o app fechado, o envio acontece na próxima vez em que ele for aberto.
- **Lacunas na numeração.** A numeração `VIS-000001` vem de uma sequence do Postgres e pode pular números raramente, quando uma gravação é recusada pelo servidor.
- **Navegador do computador: só consulta.** No computador (aba normal, sem instalar) o app abre no menu só com o cartão "Vistorias": lá não existe iniciar vistoria, nem a rota `#/nova`, nem rascunhos (`isDesktopBrowser()` em `modo-app.js`; digitar `#/nova` volta para o menu). Ver a lista, abrir uma vistoria, baixar o PDF e excluir as próprias continuam. No app instalado (também no computador) e no navegador de celular/tablet o menu tem os dois cartões e a nova vistoria funciona.
- **Fotos antigas.** Fotos de vistorias já sincronizadas saem do aparelho depois de 30 dias (`DIAS_CACHE_FOTOS`) e são baixadas de novo quando a vistoria é aberta com internet. Vistorias pendentes nunca perdem as fotos.
- **iPhone: versão mínima.** O app usa recursos que só existem no iOS 15.4 (março de 2022) ou mais novo (`<dialog>`, `structuredClone`, `crypto.randomUUID`). Em iPhone mais antigo, atualize o iOS.
- **iPhone: câmera.** O Safari só abre a câmera se o seletor de foto for acionado no mesmo toque, sem nenhuma espera antes. Por isso `escolherFoto()` (em `photos.js`) é chamada primeiro, e a consulta de permissão da câmera vem depois, sem bloquear. Não coloque um `await` antes dela. Os testes `tests/navegador/iphone.nav.js` cobrem isso.
- **iPhone: sem rotação automática.** O iPhone não deixa um site girar nem travar a tela. A tela de assinatura já abre "de lado" com o celular em pé; gire o aparelho para a esquerda para assinar.
- **iPhone: cancelar a câmera.** O Safari não avisa quando a pessoa cancela a câmera; nada trava, é só tocar na foto de novo.
- **iPhone: PDF no app instalado.** Baixar um PDF dentro do app instalado no iPhone pode abrir o arquivo sem botão de voltar (limite do iOS); use **Compartilhar** → Salvar em Arquivos.

## 9. Lista de verificação

| Requisito | Onde |
|---|---|
| Campos do veículo: chassi (texto, exatamente 6, maiúsculas, contador "4/6", erro), marca, modelo, cor, km (teclado numérico, milhar), combustível em 5 chips | `views/etapa-veiculo.js`, `formatos.js`, `validacao.js` |
| 3 fotos fixas (Frente, Traseira, Chassi) com Refazer/Remover, tela cheia e obrigatórias ao finalizar; compressão 1280 px / JPEG 0,7 | `views/etapa-veiculo.js`, `photos.js` |
| Checklist com os 13 itens em Presente/Ausente, "Marcar todos como Presente", "Limpar" e observação; lista em `config.js` | `views/etapa-checklist.js`, `config.js` |
| Avarias ilimitadas com área, tipo, gravidade colorida, descrição e várias fotos; "Veículo sem avarias"; aviso sem foto | `views/etapa-avarias.js` |
| Assinaturas do vistoriador e do motorista do reboque: botão "Assinar" abre tela cheia na horizontal (trava a tela no Android; no iPhone o layout vem de lado e a imagem é girada ao salvar), canvas com Pointer Events, `devicePixelRatio`, `touch-action: none`, Limpar | `assinatura-tela.js`, `signature.js`, `views/etapa-assinaturas.js` |
| Data e hora registradas ao finalizar (`realizada_em`) | `views/nova.js`, `storage.js` |
| Etapas com progresso, Voltar/Avançar, rascunho automático e retomada | `views/nova.js`, `rascunho.js` |
| Finalizar com a lista do que falta e link para cada campo | `views/nova.js`, `validacao.js` |
| Aba Vistorias: lista do Supabase com cache offline, "Carregar mais", busca, período, rascunhos e estado vazio | `views/vistorias.js` |
| Detalhe: leitura completa, Baixar PDF, Compartilhar (Web Share API) e Excluir (também no servidor) | `views/detalhe.js` |
| PDF A4 com cabeçalho, dados, fotos, checklist, avarias, assinaturas e rodapé "Vistoria nº X — página N de M"; `Vistoria_<chassi>_<aaaa-mm-dd>.pdf`; menos de 10 MB | `pdf.js` |
| Login por e-mail e senha, sessão persistente e válida offline, Sair, sem cadastro público | `auth.js`, `views/login.js`, `supabase/config.toml` |
| RLS nas 3 tabelas e no Storage: escrita só do dono | `supabase/migrations/0001_init.sql`, `supabase/tests/rls.sql` |
| Leitura de todas as vistorias e arquivos para qualquer usuário logado (escrita continua só do dono) | `supabase/migrations/0003_leitura_para_todos.sql`; exclusão por qualquer conta: `supabase/migrations/0004_exclusao_para_todos.sql`, `views/detalhe.js`, `views/vistorias.js`, `storage.js` |
| Nome do vistoriador vem da conta (tabela `perfis`, só leitura para o vistoriador); o banco grava o nome do perfil e recusa vistoria de conta sem perfil | `supabase/migrations/0002_perfis.sql`, `auth.js`, `views/etapa-assinaturas.js` |
| Bucket privado `vistorias`, caminhos `<user_id>/<inspection_id>/<arquivo>`, URLs assinadas | migration, `supabase.js` |
| Sincronização idempotente; Sincronizada/Pendente/Erro; "Tentar novamente"; número provisório → oficial | `sync.js`, `views/detalhe.js`, `views/vistorias.js` |
| App inteiro abre e finaliza vistorias em modo avião | `sw.js` |
| `netlify.toml`: `no-cache` no `sw.js`, `Content-Type` do manifest, cache longo em `icons/` e `vendor/`, segurança e CSP | `netlify.toml` |
| "Nova versão disponível — Atualizar" e "Instalar app" | `app.js`, `sw.js`, `manifest.webmanifest` |
| Mensagens claras: armazenamento cheio, câmera bloqueada, foto ilegível, falha no PDF, sessão expirada | `storage.js`, `photos.js`, `pdf.js`, `app.js` |
