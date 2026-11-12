# Recebimento na loja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contas de loja recebem, no celular/app, os veículos enviados à sua loja (conforme ou com divergência, com assinatura), e o CD vê esse registro no detalhe, no painel, no dashboard e no PDF.

**Architecture:** Papel por conta em `perfis` (`vistoriador`/`loja`) com RLS por papel; recebimento em tabelas próprias (`recebimentos`, `recebimento_fotos`) que nunca alteram a vistoria. O app escolhe as telas pelo papel; o detalhe ganha um modo `loja` e um card compartilhado; regras puras ficam em `recebimento-dados.js` e o envio em `recebimento-envio.js`.

**Tech Stack:** HTML/CSS/JS puro (ES modules, sem build), Supabase (Postgres + RLS + Storage), IndexedDB, jsPDF; testes `node --test` e página `tests/navegador/`.

**Spec:** `docs/superpowers/specs/2026-11-12-recebimento-na-loja-design.md`

## Global Constraints

- Textos da interface em pt-BR, exatamente como no spec (seção 8 para mensagens de erro).
- CSP `style-src 'self'`: nenhum `style="..."` em HTML; larguras/estilos dinâmicos via classes ou `elemento.style` no DOM.
- Todo texto vindo de dados passa por `esc()` antes de ir para `innerHTML`.
- Nomes de loja só da lista `LOJAS` de `config.js`.
- Status gravados no banco: `conforme` e `divergencia`; rótulos na tela: "Conforme", "Com divergência", "Aguardando recebimento".
- Arquivos do recebimento no bucket `vistorias`: `<user_id da loja>/<inspection_id>/receb_assinatura.png` e `receb_<fotoId>.jpg`.
- Cada task que muda arquivo servido pelo app sobe a `CACHE_VERSION` de `sw.js` uma vez por commit e inclui arquivos novos em `ARQUIVOS`.
- Sem dependências novas. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, em branch, nunca direto no `main`.
- `npm test` e `tests/navegador/index.html` (painel do navegador visível) passam ao fim de cada task.

## Review Focus

1. **Conta de loja sem `loja` no perfil** → login funciona, a tela Recebimentos mostra "Sua conta não tem loja cadastrada. Peça ao administrador." e não quebra (Task 7).
2. **Vistoria excluída pelo CD enquanto a loja preenche** → o envio recusa com FK (23503) e mostra "Esta vistoria foi excluída pelo CD." sem perder a tela (Task 5).
3. **Duas pessoas recebendo o mesmo carro** → a segunda vê "Este carro já foi recebido por <nome> em dd/mm às hh:mm." e o recebimento existente (Task 5).
4. **Conexão cai entre o envio dos arquivos e a gravação** → "Tentar de novo" reaproveita o mesmo `id` do rascunho e não duplica (Task 5).
5. **Conta de loja abrindo o app sem internet** → o papel vem do cache do perfil; o menu continua sendo o de loja, com o aviso de sem internet (Task 4).

---

### Task 1: Banco — papel, recebimentos e RLS

**Files:**
- Create: `supabase/migrations/0006_recebimento_loja.sql`
- Modify: `supabase/tests/rls.sql` (casos novos no fim, antes de `RLS OK`)
- Modify: `README.md` (passo 1.2 cita a 0006; novo passo "Criar conta de loja")

**Interfaces:**
- Produces (SQL): `perfis.papel text not null default 'vistoriador' check (papel in ('vistoriador','loja'))`; `perfis.loja text` com `check (papel <> 'loja' or (loja is not null and btrim(loja) <> ''))`; `public.meu_papel() returns text` e `public.minha_loja() returns text` (`security definer`, `stable`, `set search_path = ''`); tabelas `recebimentos` e `recebimento_fotos` exatamente como no spec 3.2/3.3; gatilho `recebimentos_antes_inserir`.

- [ ] **Step 1: Escrever os casos em `rls.sql`** (usuários D e E com `papel='loja'`, D em "PG Prime BMW Natal", E em "PG Prime Audi Natal"; vistoria de A com `loja='PG Prime BMW Natal'`). Cada caso `raise exception` com a explicação se falhar:
  - D lê só vistorias/avarias/fotos com `loja` = a sua; não lê vistoria sem loja nem de outra loja; `storage.objects` de outra loja invisível.
  - D não insere em `inspections`, não exclui `inspections`, `damages`, `damage_photos` nem `storage.objects` (count de linhas afetadas = 0 ou `insufficient_privilege`).
  - D insere recebimento `conforme` da vistoria da sua loja; `recebedor_nome`/`loja` vêm do perfil mesmo enviando outros valores; `recebido_em` ignora data enviada (`recebido_em > now() - interval '1 minute'`).
  - Segundo recebimento da mesma vistoria → `unique_violation`.
  - `divergencia` sem descrição → `check_violation`.
  - D não faz `update`/`delete` em `recebimentos` (0 linhas).
  - E não recebe vistoria da loja de D (gatilho recusa).
  - A (vistoriador) não insere recebimento; A lê todos os recebimentos.
  - Usuário sem perfil (C) continua lendo todas as vistorias (comportamento atual: `coalesce(meu_papel(), 'vistoriador')`).
- [ ] **Step 2: Escrever a migration 0006**: colunas de `perfis`; funções; tabelas; gatilho (exige `meu_papel() = 'loja'`, copia nome/loja do perfil, força `user_id = auth.uid()`, `recebido_em = now()`, recusa `inspections.loja is distinct from minha_loja()` com `errcode = 'P0001'` e mensagem "Esta vistoria não é da sua loja."); substitui as policies "todos leem"/"todos excluem" da 0003/0004 e "dono cria" de `inspections` por versões com `coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador'` ou o filtro de loja do spec 3.5; storage select para loja via `exists (select 1 from public.inspections i where i.id::text = (storage.foldername(name))[2] and i.loja = public.minha_loja())`; storage delete só vistoriador; policies de select/insert de `recebimentos` e `recebimento_fotos`; nenhuma de update/delete; índice em `recebimentos(inspection_id)` vem do `unique`.
- [ ] **Step 3: Verificação** — não há Docker nesta máquina. Pedir ao Luan para colar a 0006 e depois `supabase/tests/rls.sql` no SQL Editor do Supabase. Esperado: a 0006 roda sem erro e o teste termina com `RLS OK`. Só seguir com a Task 3 em diante depois disso.
- [ ] **Step 4: README** — passo 1.2 lista a 0006 ("rode antes de publicar"); novo passo com o SQL:
  `insert into public.perfis (id, nome, papel, loja) values ('<UID>', 'Nome Completo', 'loja', 'PG Prime BMW Natal');`
- [ ] **Step 5: Commit** — `feat(db): papel por conta, recebimentos na loja e RLS por loja (migration 0006)`

### Task 2: Regras puras do recebimento

**Files:**
- Create: `recebimento-dados.js`
- Modify: `formatos.js` (constantes de arquivo e caminho)
- Test: `tests/recebimento-dados.test.js`, `tests/formatos.test.js`

**Interfaces:**
- Produces (`recebimento-dados.js`):
  - `STATUS_RECEBIMENTO = { conforme: "Conforme", divergencia: "Com divergência", aguardando: "Aguardando recebimento" }`
  - `situacaoRecebimento(v) → "aguardando" | "conforme" | "divergencia" | null` (`null` quando `v.loja` vazio e sem recebimento)
  - `validarRecebimento({ status, descricao, assinatura }) → [{ campo, mensagem }]` com `campo` ∈ `status|descricao|assinatura` e mensagens "Escolha como o carro chegou.", "Descreva o que está diferente.", "Falta a assinatura de quem recebeu."
  - `separarRecebimentos(itens) → { aReceber, recebidos }` (aReceber: situação `aguardando`, mais antigas primeiro; recebidos: mais recentes por `recebidoEm` primeiro)
  - `buscarRecebimentos(itens, termo)` (chassi, marca, modelo, número; sem acento — reutilizar `semAcento` de `painel-dados.js`)
  - `contarRecebimentos(itens) → { aguardando, conforme, divergencia }`
  - `textoJaRecebido(r) → "Este carro já foi recebido por <nome> em dd/mm às hh:mm."`
- Produces (`formatos.js`): `ARQUIVO.recebAssinatura = "receb_assinatura.png"`, `arquivoReceb(fotoId) → "receb_<fotoId>.jpg"`, `caminhoDoArquivo(v, nome)` → `caminhoRemoto(v.recebimento.userId, v.id, nome)` quando `nome` começa com `receb_`, senão `caminhoRemoto(v.userId, v.id, nome)`.
- Forma do recebimento no app (usada por todas as tasks): `v.recebimento = null | { id, userId, status, recebedorNome, loja, recebidoEm, descricao, assinatura, fotos: [fotoId] }`.

- [ ] **Step 1: Testes**: `situacaoRecebimento` nos 4 casos; `validarRecebimento({status:"divergencia", descricao:" ", assinatura:true})` → `[{campo:"descricao", mensagem:"Descreva o que está diferente."}]`; conforme sem descrição e com assinatura → `[]`; ordem e separação; busca "778699" e "baic"; contagem ignora vistorias sem loja; `textoJaRecebido({recebedorNome:"João Silva", recebidoEm: new Date(2026,10,12,14,5).toISOString()})` → `"Este carro já foi recebido por João Silva em 12/11 às 14:05."`; `caminhoDoArquivo` para `receb_assinatura.png` usa `recebimento.userId`.
- [ ] **Step 2: Rodar `npm test`** — FAIL (módulo inexistente).
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `npm test`** — PASS.
- [ ] **Step 5: Commit** — `feat: regras do recebimento na loja (recebimento-dados.js)`

### Task 3: Supabase — perfil com papel e consultas do recebimento

**Files:**
- Modify: `supabase.js`
- Test: `tests/supabase.test.js`

**Interfaces:**
- Consumes: forma do recebimento (Task 2).
- Produces:
  - `recebimentoDaLinha(linha | [linha] | null) → recebimento | null` (aceita objeto ou lista de 1 que o PostgREST devolve; mapeia `recebimento_fotos[].id` → `fotos`)
  - `linhaDoRecebimento(r, inspectionId)` → `{ id, inspection_id, status, descricao, assinatura }` (sem nome, loja, data: o banco preenche)
  - `vistoriaDaLinha` e `itemDoDashboard` passam a incluir `recebimento`
  - remoto: `obterPerfil(userId) → { nome, papel, loja } | null`; `listarParaLoja() → vistorias` (mesmos campos de `listarTodasVistorias` + `recebimentos(*)`, blocos de 1000, mais antigas primeiro); `obterRecebimento(inspectionId) → recebimento | null`; `inserirRecebimento(r, inspectionId) → recebimento`; `gravarFotosRecebimento(r, inspectionId)` (upsert `ignoreDuplicates`, `path` = `caminhoDoArquivo`); `listarTodasVistorias`, `listarParaDashboard` e `obterVistoriaCompleta` embutem `recebimentos(*, recebimento_fotos(*))`; `excluirVistoriaRemota(userId, id, { donoRecebimento } = {})` também lista e remove `${donoRecebimento}/${id}` quando informado.
  - `classificarErro`: código `23503` → mensagem "Esta vistoria foi excluída pelo CD."

- [ ] **Step 1: Testes** dos mapeamentos (objeto, lista, null), de `obterPerfil` com cliente falso devolvendo `{nome, papel, loja}`, de `excluirVistoriaRemota` com `donoRecebimento` (sequência de chamadas: delete, list dono, remove, list loja, remove) e de `classificarErro({code:"23503"})`.
- [ ] **Step 2: `npm test`** — FAIL.
- [ ] **Step 3: Implementar** (o `select` de `obterPerfil` vira `"nome, papel, loja"`).
- [ ] **Step 4: `npm test`** — PASS (ajustar os testes antigos de `obterPerfil`/`vistoriaDaLinha` para a forma nova).
- [ ] **Step 5: Commit** — `feat: consultas do recebimento e perfil com papel no supabase.js`

### Task 4: Conta, papel e rotas

**Files:**
- Modify: `auth.js`, `app.js`, `views/inicio.js`, `index.html` (nada além do necessário), `sw.js`
- Test: `tests/auth.test.js`, `tests/inicio.test.js`, `tests/navegador/inicio.nav.js`

**Interfaces:**
- Consumes: `remoto.obterPerfil` (Task 3).
- Produces: `usuario = { id, email, nome, papel, loja }` (`papel` padrão `"vistoriador"`; offline vem do cache `meta.usuario` do mesmo usuário); `redirecionamento(hash, desktop, papel = "vistoriador")` — para `loja`, `#/nova`, `#/vistorias`, `#/dashboard`, `#/vistoria/...` → `#/inicio`; rotas novas em `app.js`: `#/recebimentos` → `recebimentos`, `#/recebimento/<id>` → `recebimento`; menu da loja em `views/inicio.js` (`montar`) com um cartão `#btn-recebimentos` ("Recebimentos", subtítulo "N a receber" ou "Nada a receber") quando `ctx.auth.usuarioAtual().papel === "loja"`, em qualquer aparelho (inclusive computador, sem painel nem links do topo).

- [ ] **Step 1: Testes**: `auth` devolve `papel`/`loja` do perfil e, offline, os do cache; `redirecionamento` com `papel:"loja"` nos 4 casos e sem mudar os casos atuais; navegador: menu de loja tem só `#btn-recebimentos` e navega para `#/recebimentos`; com `papel:"loja"` e `online:()=>false` o menu continua de loja (Review Focus 5).
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar.** Topo do computador para conta de loja: `#topo-nav` escondido.
- [ ] **Step 4: Rodar `npm test` e a página do navegador** — PASS.
- [ ] **Step 5: Commit** — `feat: papel da conta escolhe as telas (vistoriador ou loja)`

### Task 5: Envio do recebimento e rascunho no aparelho

**Files:**
- Create: `recebimento-envio.js`
- Modify: `storage.js`
- Test: `tests/recebimento-envio.test.js`, `tests/navegador/storage.nav.js`

**Interfaces:**
- Consumes: Tasks 2 e 3.
- Produces:
  - `storage.salvarRascunhoRecebimento(inspectionId, dados)`, `obterRascunhoRecebimento(inspectionId)`, `excluirRascunhoRecebimento(inspectionId)` — dados em `meta` com chave `receb:<inspectionId>` = `{ id, status, descricao, fotos: [fotoId], assinatura: boolean }`; blobs em `arquivos` com `chaveLocal("receb-" + inspectionId, nome)`; excluir apaga a meta e `excluirArquivos("receb-" + inspectionId)`.
  - `class JaRecebidoError extends Error { recebimento }`
  - `enviarRecebimento({ remoto, storage, usuario, vistoria, rascunho }) → recebimento` — ordem: `obterRecebimento`; se existe com `id` diferente → `JaRecebidoError`; envia assinatura e fotos (`remoto.enviarArquivo(caminhoRemoto(usuario.id, vistoria.id, nome), blob)`); `inserirRecebimento` se ainda não existe (unique 23505 → busca e lança `JaRecebidoError`); `gravarFotosRecebimento`; `excluirRascunhoRecebimento`; devolve o recebimento do servidor.

- [ ] **Step 1: Testes (node, dublês)**: caminho feliz (ordem das chamadas); reenvio após falha no insert usa o mesmo `id` e não duplica (Review Focus 4); recebimento de outra pessoa → `JaRecebidoError` com o recebimento (Review Focus 3); erro `23503` propaga com a mensagem "Esta vistoria foi excluída pelo CD." (Review Focus 2); blob ausente → erro "Falta a assinatura de quem recebeu."; navegador: rascunho salvo, lido e apagado (meta e blobs).
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat: envio idempotente do recebimento e rascunho no aparelho`

### Task 6: Card "Recebimento na loja" no detalhe e selo na lista

**Files:**
- Create: `views/card-recebimento.js`
- Modify: `views/detalhe.js`, `views/vistorias.js`, `styles.css`, `sw.js`
- Test: `tests/navegador/detalhe.nav.js`

**Interfaces:**
- Consumes: `STATUS_RECEBIMENTO`, `situacaoRecebimento`, `caminhoDoArquivo`.
- Produces: `htmlCardRecebimento(v, fontes) → string` (seção `.secao.det-receb` com `h2` "Recebimento na loja"; aguardando: selo cinza "Aguardando recebimento" + loja; recebido: selo `.selo-receb-conforme` verde ou `.selo-receb-divergencia` laranja, "Recebido por <nome> — <loja>", data/hora, descrição, miniaturas das fotos, imagem da assinatura; `""` quando `situacaoRecebimento(v) === null`); `seloRecebimento(v) → string`; `detalhe.montar(el, ctx, { id, modo })` com `modo: "loja"` sem Baixar PDF, Compartilhar e Excluir e com o botão `#btn-receber` "Registrar recebimento" quando a situação é `aguardando`; `detalhe` resolve imagens com `caminhoDoArquivo`.

- [ ] **Step 1: Testes**: card aguardando, conforme e divergência (textos exatos), escapando `recebedorNome` com HTML; modo loja sem os três botões e com `#btn-receber`; recebido em modo loja sem `#btn-receber`; card logo depois de "Dados do veículo"; cartão da lista do celular com o selo.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar.** Fotos e assinatura do recebimento entram em `fontes` pelo mesmo mecanismo de URLs assinadas.
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat: card Recebimento na loja no detalhe e selo na lista`

### Task 7: Tela Recebimentos (lista da loja)

**Files:**
- Create: `views/recebimentos.js`
- Modify: `app.js` (rota), `styles.css`, `sw.js`, `tests/navegador/todos.js`
- Test: `tests/navegador/recebimentos.nav.js`

**Interfaces:**
- Consumes: `remoto.listarParaLoja`, `separarRecebimentos`, `buscarRecebimentos`, `seloRecebimento`.
- Produces: `montar(el, ctx)` com abas `role="tab"` "A receber" e "Recebidos" (com contagem), busca `#receb-busca` (placeholder "Buscar pelo chassi..."), cartões que navegam para `#/recebimento/<id>`.

- [ ] **Step 1: Testes**: abas e contagens com dados falsos; busca por chassi; offline → "Sem internet. Os recebimentos precisam de conexão." e nenhuma chamada; conta sem loja → "Sua conta não tem loja cadastrada. Peça ao administrador." (Review Focus 1); listas vazias → "Nenhum carro a receber." / "Nenhum carro recebido ainda."; texto dos dados escapado.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat: tela Recebimentos da loja`

### Task 8: Formulário "Registrar recebimento"

**Files:**
- Create: `views/form-recebimento.js`
- Modify: `app.js` (rota `recebimento` → `detalhe.montar` com `modo: "loja"`), `views/detalhe.js` (abre o formulário), `styles.css`, `sw.js`
- Test: `tests/navegador/recebimento.nav.js`

**Interfaces:**
- Consumes: `validarRecebimento`, rascunho e `enviarRecebimento` (Task 5), `escolherFoto`/`comprimir` (`photos.js`), `abrirTelaAssinatura` (`assinatura-tela.js`), `ctx.confirmar`.
- Produces: `abrirFormRecebimento({ vistoria, ctx }) → Promise<recebimento | null>` — diálogo cheio com: rádios "Recebido conforme a vistoria" / "Recebido com divergência"; com divergência, `textarea#receb-descricao` "O que está diferente?" e "Adicionar foto"; "Recebido por: <nome> — <loja>" + assinatura; "Confirmar recebimento" → `ctx.confirmar({ titulo: "Confirmar recebimento?", texto: "Depois de confirmar não dá para alterar.", ok: "Confirmar" })`; cada mudança grava o rascunho; falha de rede → "Não foi possível enviar. Nada foi perdido." + "Tentar de novo"; `JaRecebidoError` → `textoJaRecebido` e fecha devolvendo o recebimento existente.

- [ ] **Step 1: Testes** (câmera e assinatura simuladas como em `apoio.js`): divergência sem descrição mostra o erro no campo; sem assinatura mostra o erro; rascunho restaurado ao reabrir; envio feliz devolve o recebimento e o detalhe passa a mostrar o card recebido sem `#btn-receber`; falha de rede mantém os dados e mostra "Tentar de novo"; já recebido mostra o texto exato.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** — `feat: formulário Registrar recebimento com divergência, fotos e assinatura`

### Task 9: Painel do computador — coluna e filtro

**Files:**
- Modify: `painel-dados.js`, `views/painel.js`, `styles.css`, `sw.js`
- Test: `tests/painel.test.js`, `tests/navegador/inicio.nav.js`

**Interfaces:**
- Consumes: `situacaoRecebimento`, `seloRecebimento`.
- Produces: `filtrarVistorias(itens, { …, recebimento = "" })` com `recebimento` ∈ `"" | "aguardando" | "conforme" | "divergencia"`; coluna "Recebimento" e `select#dash-recebimento` ("Todos os recebimentos", "Aguardando", "Conforme", "Com divergência") limpo por "Limpar filtros"; exclusão no detalhe passa `donoRecebimento: v.recebimento?.userId`.

- [ ] **Step 1: Testes**: filtro nos 4 valores (vistoria sem loja não entra em "aguardando"); coluna mostra o selo.
- [ ] **Step 2–4: Rodar (FAIL) → implementar → rodar (PASS).**
- [ ] **Step 5: Commit** — `feat: painel com coluna e filtro de recebimento`

### Task 10: Dashboard — bloco "Recebimento nas lojas"

**Files:**
- Modify: `dashboard-dados.js`, `views/dashboard.js`, `styles.css`, `sw.js`
- Test: `tests/dashboard-dados.test.js`, `tests/navegador/dashboard.nav.js`

**Interfaces:**
- Consumes: `contarRecebimentos`, `situacaoRecebimento`, `seloRecebimento`.
- Produces: `porLoja` com campo `divergencias`; `listaPorRecebimento(itens, situacao)` (mais recentes primeiro); bloco `section.db-receb` com três cartões ("Aguardando recebimento", "Recebidos conforme", "Recebidos com divergência"); `estado.lista` aceita também `"aguardando"` e `"divergencia"` (cartões-botão iguais aos de avaria; a tabela de baixo troca a coluna "Gravidade" por "Recebimento" nessas listas, títulos "Veículos aguardando recebimento (N)" e "Veículos recebidos com divergência (N)"); coluna "Divergências" em "Por loja de destino".

- [ ] **Step 1: Testes**: contagens e `divergencias` por loja; cartão Aguardando abre a lista certa e clicar de novo volta às últimas.
- [ ] **Step 2–4: Rodar (FAIL) → implementar → rodar (PASS).**
- [ ] **Step 5: Commit** — `feat: dashboard com recebimento nas lojas`

### Task 11: PDF — seção "Recebimento na loja"

**Files:**
- Modify: `pdf.js`, `views/detalhe.js` (obterImagem com `caminhoDoArquivo`)
- Test: `tests/navegador/pdf.nav.js`

**Interfaces:**
- Consumes: `v.recebimento`, `ARQUIVO.recebAssinatura`, `arquivoReceb`, `STATUS_RECEBIMENTO`.
- Produces: seção depois de "Assinaturas", só com recebimento: título "Recebimento na loja", status, "Recebido por <nome> — <loja>", data/hora, descrição (divergência), fotos (mesmo tamanho das de avaria) e assinatura de quem recebeu.

- [ ] **Step 1: Testes**: PDF sem recebimento continua com as mesmas seções; com divergência contém "Recebimento na loja", "Com divergência", o nome e a loja (via `depurar: true`, como o teste atual) e fica abaixo de 10 MB.
- [ ] **Step 2–4: Rodar (FAIL) → implementar → rodar (PASS).**
- [ ] **Step 5: Commit** — `feat: PDF com a seção Recebimento na loja`

### Task 12: Fechamento

**Files:**
- Modify: `sw.js` (lista final de `ARQUIVOS`), `README.md` (seção de telas e limites), `tests/sw.test.js` se ele listar arquivos

- [ ] **Step 1:** `npm test` e página do navegador: tudo PASS.
- [ ] **Step 2:** Verificação manual com o servidor `vistoria` (porta 3001): computador como vistoriador (card, coluna, filtro, dashboard, PDF) e celular emulado. A conta de loja real só depois do Luan criar uma no Supabase (Task 1, passo 4); até lá, verificar as telas da loja pelos testes de navegador.
- [ ] **Step 3: Commit** — `docs: README do recebimento na loja (CACHE_VERSION final)`
