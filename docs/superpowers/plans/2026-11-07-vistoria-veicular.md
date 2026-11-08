# Vistoria Veicular — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA offline-first em pt-BR para vistoria veicular com PDF gerado no aparelho, dados no Supabase e hospedagem no Netlify.

**Architecture:** HTML/CSS/JS puro em ES modules, sem build. Módulos puros (`config`, `formatos`, `validacao`, `rascunho`, `sync`, `auth` e o mapeamento de `supabase.js`) são testados no Node com dublês. Módulos de navegador (`storage`, `photos`, `signature`, `pdf`, as telas) são testados numa página de testes servida localmente e conferidos no painel do navegador. A sincronização roda na página (decisão D2 da spec).

**Tech Stack:** JavaScript ES2022, IndexedDB, Service Worker, jsPDF 4.2.1, jspdf-autotable 5.0.9, @supabase/supabase-js 2.118.0 (UMD), Postgres/Supabase (RLS + Storage), Netlify, Node 24 (`node --test`), `serve@14.2.6` (servidor local), Supabase CLI 2.122.0 via `npx`.

**Spec:** `docs/superpowers/specs/2026-11-07-vistoria-veicular-design.md` (abreviada como "spec §N"). Leia a spec junto com cada tarefa: textos de interface, mensagens e regras citadas como "spec §N" devem ser copiados de lá literalmente.

## Global Constraints

- Todo texto de interface, erro e PDF em português do Brasil; datas `dd/mm/aaaa HH:mm` no fuso do aparelho.
- Sem build e sem dependências em `package.json` (nem `devDependencies`). Bibliotecas só estas três, como arquivos em `vendor/`: `jspdf-4.2.1.umd.min.js`, `jspdf-autotable-5.0.9.min.js`, `supabase-2.118.0.umd.js`.
- Módulos puros não acessam DOM, `window`, `indexedDB` nem `navigator` ao serem importados (só dentro de funções e com valor padrão injetável).
- CSP `default-src 'self'`: nenhum `<script>` inline, nenhum handler `on*=` em HTML, nenhum atributo `style=` em templates. Estilo dinâmico só via `element.style.prop` ou classes.
- `localStorage` só guarda a sessão do supabase-js e a preferência de esconder a faixa de instalação. Fotos e assinaturas sempre em IndexedDB como Blob.
- Nunca usar a service_role/secret key no front-end.
- Alvos de toque ≥ 48 px; base de layout 360–430 px; cor principal `#0B4F6C`; cores de gravidade e status da spec §4 (config) e §7.
- Nomes de arquivo de mídia fixos (spec §4 `formatos.js`); caminho remoto `<userId>/<inspectionId>/<nome>`.
- Testes Node: `npm test` (= `TZ=America/Sao_Paulo node --test "tests/*.test.js"`). Testes de navegador: arquivos `tests/navegador/*.nav.js`, abertos em `http://localhost:3000/tests/navegador/`; passam quando o texto da página mostra `0 falhas`.
- Commits: um por tarefa (ou por passo de commit), mensagem `feat: …`/`test: …`/`docs: …`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Servidor local: `npx --yes serve@14.2.6 -l 3000 --no-clipboard vistoria-veicular` (configuração `vistoria` do `.claude/launch.json` em `AppsClaude/`). Para conferências no navegador, use `preview_start { name: "vistoria" }`.

## Review Focus

1. **Emoji ou caracteres fora do WinAnsi** em descrição, nomes ou observação (comum no teclado do celular): o PDF deve sair sem erro e sem lixo, com esses caracteres removidos. Teste em Task 2 (`textoPdf`) e Task 15 (PDF com emoji).
2. **Vistoria perto da meia-noite e fuso do aparelho:** data exibida, nome do arquivo PDF e filtro "Hoje" usam a data local, não a UTC. Teste em Task 2 (23:30 em São Paulo = dia seguinte em UTC).
3. **Digitação do chassi no teclado Android (composição/IME) e colagem com espaços, hífens e minúsculas:** digitar não duplica letras; colar `" ab-12 3cd"` vira `AB123C`. Teste em Task 2 (`normalizarChassi`) e Task 11 (input durante `isComposing`).
4. **Troca de usuário no mesmo aparelho:** o usuário B não vê nem envia vistorias, rascunhos ou exclusões de A; os pendentes de A continuam guardados. Teste em Task 7 (sync filtra por usuário) e Task 8 (sair preserva pendentes).
5. **Foto enorme, PNG transparente ou rotacionada vinda da galeria:** sai em pé, com fundo branco e no máximo 1280 px; uma foto ilegível gera a mensagem da spec §9, sem quebrar o formulário. Teste em Task 10.

---

### Task 1: Fundação do projeto

**Files:**
- Create: `package.json`, `config.js`, `env.example.js`, `env.js`, `serve.json`, `tests/config.test.js`
- Modify: `/Users/luanwillian/Documents/AppsClaude/.claude/launch.json` (acrescentar a configuração `vistoria`, mantendo `pgprime`)

**Interfaces:**
- Produces: as constantes de `config.js` exatamente como na spec §4 (`CHECKLIST_ITENS`, `AREAS_AVARIA`, `TIPOS_AVARIA`, `GRAVIDADES`, `COMBUSTIVEIS`, `FOTOS_VEICULO`, `FOTO`, `PDF_FOTO`, `ITENS_POR_PAGINA`, `DIAS_CACHE_FOTOS`). `env.js` exporta `SUPABASE_URL` e `SUPABASE_ANON_KEY` (valores do modelo em `env.example.js`: `"https://SEU-PROJETO.supabase.co"` e `"SUA-ANON-KEY"`).

- [ ] **Step 1: Criar `package.json`**: `{"name":"vistoria-veicular","private":true,"type":"module","scripts":{"test":"TZ=America/Sao_Paulo node --test \"tests/*.test.js\""}}`.

- [ ] **Step 2: Escrever o teste que falha** em `tests/config.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../config.js";

test("checklist tem os 13 itens na ordem da spec", () => {
  assert.deepEqual(c.CHECKLIST_ITENS, ["Antena", "Calotas", "Manual do proprietário", "Triângulo", "Equipamento de som",
    "Estepe/Kit", "Bateria", "Documento", "Macaco", "Chave de roda", "Extintor", "Tapetes", "Carregador"]);
});
test("listas de avaria e combustível", () => {
  assert.equal(c.AREAS_AVARIA.length, 20);
  assert.equal(c.AREAS_AVARIA.at(-1), "Outro");
  assert.equal(c.TIPOS_AVARIA.length, 10);
  assert.deepEqual(c.COMBUSTIVEIS, ["Gasolina", "Flex", "Diesel", "Elétrico", "Híbrido"]);
  assert.deepEqual(c.GRAVIDADES.map((g) => g.valor), ["Leve", "Moderada", "Grave"]);
  assert.deepEqual(c.FOTOS_VEICULO.map((f) => f.chave), ["frente", "traseira", "chassi"]);
  assert.deepEqual(c.FOTO, { maxLado: 1280, qualidade: 0.7, miniLado: 320 });
});
```

- [ ] **Step 3: Rodar** `npm test` → FAIL (`Cannot find module '../config.js'`).

- [ ] **Step 4: Criar `config.js`** copiando literalmente o bloco da spec §4. Criar `env.example.js` e `env.js` (iguais, com os valores do modelo).

- [ ] **Step 5: Rodar** `npm test` → PASS (2 testes).

- [ ] **Step 6: Criar `serve.json`** com `"cleanUrls": false` e `headers` equivalentes aos do Netlify (spec §13), com uma diferença: a CSP local acrescenta `http://127.0.0.1:54321` em `img-src` e `connect-src` (`connect-src` também ganha `ws://127.0.0.1:54321`), para testar contra o Supabase local. Acrescentar a configuração `vistoria` em `AppsClaude/.claude/launch.json`: `{"name":"vistoria","runtimeExecutable":"npx","runtimeArgs":["--yes","serve@14.2.6","-l","3000","--no-clipboard","vistoria-veicular"],"port":3000}`.

- [ ] **Step 7: Conferir os cabeçalhos locais**: subir o servidor (`preview_start { name: "vistoria" }`) e rodar `curl -sI http://localhost:3000/config.js`. Esperado: linha `Content-Security-Policy: default-src 'self'; …`. Se o `serve` não ler o `serve.json` da pasta servida, passar `--config vistoria-veicular/serve.json` em `runtimeArgs` e repetir.

- [ ] **Step 8: Commit**: `git add package.json config.js env.example.js env.js serve.json tests/config.test.js && git commit -m "feat: base do projeto e config.js"` (o `launch.json` fica fora deste repositório).

### Task 2: `formatos.js` — funções puras de dados e formatação

**Files:**
- Create: `formatos.js`, `tests/formatos.test.js`

**Interfaces:**
- Consumes: `config.js`.
- Produces (todas puras):
  - `formatarDataHora(iso: string): string`, `formatarData(iso): string`, `dataArquivo(iso): string`
  - `formatarKm(n: number|null): string` (`""` para null), `lerKm(texto: string): number|null`
  - `normalizarChassi(texto: string): string`
  - `idProvisorio(uuid): string`, `nomeVistoria({id, numero}): string`, `nomeArquivoPdf({chassi, realizadaEm}): string`
  - `chaveLocal(id, nome): string`, `caminhoRemoto(userId, id, nome): string`
  - `ARQUIVO = { frente: "frente.jpg", frenteMini: "frente_mini.jpg", traseira: "traseira.jpg", chassi: "chassi.jpg", assVistoriador: "assinatura_vistoriador.png", assMotorista: "assinatura_motorista.png" }`, `arquivoAvaria(fotoId): string`, `rotuloArquivo(nome): string`
  - `arquivosDaVistoria(v): string[]`
  - `textoPdf(s: string): string`
  - `periodo(tipo: "hoje"|"7d"|"30d"|"todos", agora: Date): { de: string|null, ate: string|null }`, `periodoPersonalizado(de: "aaaa-mm-dd"|"" , ate: "aaaa-mm-dd"|""): { de, ate }`
  - `novoRascunho(userId, id, agoraIso): Rascunho` e `vistoriaDoRascunho(rascunho, realizadaEm): Vistoria` (formatos da spec §4 `storage.js`).
  - `dados` padrão do rascunho: `{ chassi: "", marca: "", modelo: "", cor: "", km: null, combustivel: null, fotos: { frente: false, traseira: false, chassi: false }, checklist: {}, checklistObs: "", semAvarias: false, avarias: [], vistoriadorNome: "", motoristaNome: "", assinaturas: { vistoriador: false, motorista: false } }`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/formatos.test.js`, um `test` por bloco:

```js
// datas (TZ=America/Sao_Paulo vem do script npm test)
assert.equal(formatarDataHora("2026-11-08T02:30:00.000Z"), "07/11/2026 23:30");
assert.equal(formatarData("2026-11-08T02:30:00.000Z"), "07/11/2026");
assert.equal(dataArquivo("2026-11-08T02:30:00.000Z"), "2026-11-07");
// km
assert.equal(formatarKm(123456), "123.456"); assert.equal(formatarKm(0), "0"); assert.equal(formatarKm(null), "");
assert.equal(lerKm("12.345 km"), 12345); assert.equal(lerKm("007"), 7);
assert.equal(lerKm(""), null); assert.equal(lerKm("abc"), null);
// chassi
assert.equal(normalizarChassi(" ab-12 3cd"), "AB123C"); assert.equal(normalizarChassi("çã9"), "9");
// identificação e nomes
assert.equal(idProvisorio("8f3a1c2e-0000-4000-8000-000000000000"), "Provisório 8F3A");
assert.equal(nomeVistoria({ id: "8f3a1c2e-0000-4000-8000-000000000000", numero: null }), "Provisório 8F3A");
assert.equal(nomeVistoria({ id: "x", numero: "VIS-000123" }), "VIS-000123");
assert.equal(nomeArquivoPdf({ chassi: "AB123C", realizadaEm: "2026-11-08T02:30:00.000Z" }), "Vistoria_AB123C_2026-11-07.pdf");
assert.equal(caminhoRemoto("u1", "v1", "frente.jpg"), "u1/v1/frente.jpg");
assert.equal(chaveLocal("v1", "frente.jpg"), "v1/frente.jpg");
assert.equal(arquivoAvaria("f9"), "avaria_f9.jpg");
// lista de arquivos
const v = { avarias: [{ fotos: ["a1", "a2"] }, { fotos: [] }] };
assert.deepEqual(arquivosDaVistoria(v), ["frente.jpg", "frente_mini.jpg", "traseira.jpg", "chassi.jpg",
  "avaria_a1.jpg", "avaria_a2.jpg", "assinatura_vistoriador.png", "assinatura_motorista.png"]);
assert.equal(rotuloArquivo("frente_mini.jpg"), "Frente (miniatura)");
assert.equal(rotuloArquivo("avaria_a1.jpg"), "Foto de avaria");
assert.equal(rotuloArquivo("assinatura_motorista.png"), "Assinatura do motorista do reboque");
// texto para PDF (Review Focus 1)
assert.equal(textoPdf("Risco 👍 na porta"), "Risco na porta");
assert.equal(textoPdf("Ação “ok” — fim…\nlinha 2"), "Ação “ok” — fim…\nlinha 2");
assert.equal(textoPdf("线"), "");
// períodos (Review Focus 2)
const agora = new Date("2026-11-07T10:00:00-03:00");
assert.deepEqual(periodo("hoje", agora), { de: "2026-11-07T03:00:00.000Z", ate: null });
assert.deepEqual(periodo("7d", agora), { de: "2026-11-01T03:00:00.000Z", ate: null });
assert.deepEqual(periodo("30d", agora), { de: "2026-10-09T03:00:00.000Z", ate: null });
assert.deepEqual(periodo("todos", agora), { de: null, ate: null });
assert.deepEqual(periodoPersonalizado("2026-11-01", "2026-11-07"), { de: "2026-11-01T03:00:00.000Z", ate: "2026-11-08T03:00:00.000Z" });
assert.deepEqual(periodoPersonalizado("", ""), { de: null, ate: null });
// rascunho → vistoria
const r = novoRascunho("u1", "v1", "2026-11-07T12:00:00.000Z");
assert.equal(r.etapa, 1); assert.equal(r.dados.combustivel, null); assert.deepEqual(r.dados.avarias, []);
r.dados.km = 1000; r.dados.avarias = [{ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "", fotos: [] }];
const vi = vistoriaDoRascunho(r, "2026-11-07T13:00:00.000Z");
assert.equal(vi.status, "pendente"); assert.equal(vi.numero, null); assert.equal(vi.origem, "local");
assert.equal(vi.completa, true); assert.equal(vi.avariasQtd, 1); assert.deepEqual(vi.enviados, []);
assert.equal(vi.realizadaEm, "2026-11-07T13:00:00.000Z"); assert.equal(vi.arquivosSalvosEm, "2026-11-07T13:00:00.000Z");
assert.equal("fotos" in vi, false); assert.equal("assinaturas" in vi, false);
r.dados.avarias[0].area = "Teto"; assert.equal(vi.avarias[0].area, "Capô"); // cópia profunda
```

- [ ] **Step 2: Rodar** `npm test` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `formatos.js`.** Regras:
  - `textoPdf`: mantém `\n`, U+0020–U+007E, U+00A0–U+00FF e `“ ” ‘ ’ – — • … €`; remove o resto; junta espaços repetidos e tira espaços nas pontas de cada linha.
  - `periodo`: "7d" = hoje e os 6 dias anteriores; "30d" = hoje e os 29 dias anteriores, sempre a partir da meia-noite local.
  - `periodoPersonalizado`: `ate` é a meia-noite do dia seguinte (limite exclusivo).
  - Datas usam `Date` local (`getFullYear`, `getHours` etc.), nunca `toISOString().slice`.

- [ ] **Step 4: Rodar** `npm test` → PASS.

- [ ] **Step 5: Commit**: `feat: formatos.js com datas, km, chassi, nomes e rascunho`.

### Task 3: `validacao.js`

**Files:**
- Create: `validacao.js`, `tests/validacao.test.js`

**Interfaces:**
- Consumes: `config.js`, `formatos.novoRascunho`.
- Produces:
  - `validarAvaria(avaria): string[]`, com as mensagens "Escolha a área da avaria", "Escolha o tipo da avaria" e "Escolha a gravidade".
  - `faltandoParaFinalizar(rascunho): Array<{ etapa: 1|2|3|4, campo: string, mensagem: string }>`.
  - `situacaoEtapa(rascunho, etapa): "completa"|"pendente"`.
  - Ids de `campo`: `chassi`, `marca`, `modelo`, `cor`, `km`, `combustivel`, `foto-frente`, `foto-traseira`, `foto-chassi`, `chk-<índice do primeiro item sem marcação>`, `sem-avarias`, `vistoriador-nome`, `vistoriador-assinatura`, `motorista-nome`, `motorista-assinatura`. As views usam esses ids nos elementos.

- [ ] **Step 1: Escrever os testes que falham.** Use um helper `completo()` que devolve um rascunho válido (todos os campos, 3 fotos `true`, os 13 itens marcados, `semAvarias: true`, nomes e assinaturas):

```js
assert.deepEqual(faltandoParaFinalizar(completo()), []);
assert.equal(situacaoEtapa(completo(), 2), "completa");
const r = completo(); r.dados.chassi = "AB1";
assert.deepEqual(faltandoParaFinalizar(r), [{ etapa: 1, campo: "chassi", mensagem: "O chassi deve ter 6 caracteres (faltam 3)" }]);
r.dados.chassi = ""; assert.equal(faltandoParaFinalizar(r)[0].mensagem, "Informe o chassi");
const s = completo(); s.dados.marca = " "; s.dados.km = null; s.dados.combustivel = null; s.dados.fotos.traseira = false;
assert.deepEqual(faltandoParaFinalizar(s).map((f) => f.mensagem),
  ["Informe a marca", "Informe o km", "Escolha o combustível", "Falta a foto: Traseira"]);
const c = completo(); delete c.dados.checklist["Antena"]; delete c.dados.checklist["Bateria"]; delete c.dados.checklist["Macaco"];
assert.deepEqual(faltandoParaFinalizar(c), [{ etapa: 2, campo: "chk-0", mensagem: "Checklist: 3 itens sem marcação (Antena, Bateria, Macaco)" }]);
const c1 = completo(); delete c1.dados.checklist["Tapetes"];
assert.equal(faltandoParaFinalizar(c1)[0].mensagem, "Checklist: 1 item sem marcação (Tapetes)");
const a = completo(); a.dados.semAvarias = false;
assert.deepEqual(faltandoParaFinalizar(a), [{ etapa: 3, campo: "sem-avarias", mensagem: "Confirme “Veículo sem avarias” ou adicione uma avaria" }]);
a.dados.avarias = [{ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "", fotos: [] }];
assert.deepEqual(faltandoParaFinalizar(a), []);
const z = completo(); z.dados.vistoriadorNome = ""; z.dados.assinaturas.motorista = false;
assert.deepEqual(faltandoParaFinalizar(z).map((f) => f.campo), ["vistoriador-nome", "motorista-assinatura"]);
assert.equal(situacaoEtapa(z, 4), "pendente");
assert.deepEqual(validarAvaria({ area: "", tipo: "Risco", gravidade: null }), ["Escolha a área da avaria", "Escolha a gravidade"]);
```

- [ ] **Step 2: Rodar** `npm test` → FAIL.
- [ ] **Step 3: Implementar `validacao.js`** com as mensagens da spec §4 (`validacao.js`), na ordem etapa 1 → 4 e, dentro da etapa 1: chassi, marca, modelo, cor, km, combustível, fotos.
- [ ] **Step 4: Rodar** `npm test` → PASS.
- [ ] **Step 5: Commit**: `feat: regras de validação da vistoria`.

### Task 4: Banco Supabase — migration, config.toml e conferência de RLS

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `supabase/config.toml`, `supabase/tests/rls.sql`, `supabase/criar-usuarios-teste.sh`

**Interfaces:**
- Produces: as tabelas `inspections`, `damages`, `damage_photos`, o bucket `vistorias` e as colunas exatamente como na spec §5 (incluindo `realizada_em`). Usuários de teste locais: `vistoriador.a@teste.local` e `vistoriador.b@teste.local`, com a mesma senha de teste definida no script.

- [ ] **Step 1: Escrever `supabase/tests/rls.sql`** (o teste vem antes da migration).
  - Roda dentro de `begin; … rollback;`. Insere dois usuários em `auth.users` (ids fixos A e B) e alterna entre eles com `set local role authenticated` + `set local request.jwt.claims = '{"sub":"<id>","role":"authenticated"}'`.
  - Usa blocos `do $$ … $$` que dão `raise exception` quando algo falha:
    - A insere uma vistoria sem informar `numero` e recebe `VIS-000001`. Uma segunda inserção de A recebe `VIS-000002`.
    - A tenta inserir com `numero = 'VIS-999999'` e o gatilho troca pelo próximo número.
    - B não enxerga a vistoria de A (`count = 0`), e o `update`/`delete` de B afeta 0 linhas.
    - A insere uma avaria e uma foto de avaria na própria vistoria; B não consegue inserir uma avaria na vistoria de A (o erro de RLS é capturado).
    - O `update` de A em `numero` e `realizada_em` não altera esses campos, e `updated_at` muda.
    - Chassi `ab123c` é recusado pelo check; combustível `Álcool` é recusado; gravidade `Média` é recusada.
    - Policy de Storage: como A, `insert into storage.objects (bucket_id, name) values ('vistorias', '<A>/x/frente.jpg')` passa; com o caminho `'<B>/x/frente.jpg'`, falha.
  - No fim: `raise notice 'RLS OK'`.

- [ ] **Step 2: Escrever `supabase/migrations/0001_init.sql`** seguindo a spec §5, itens 1 a 8, na ordem, incluindo o comentário do administrador. A função de número e as dos gatilhos usam `set search_path = ''` e nomes qualificados (`public.`).

- [ ] **Step 3: Gerar `supabase/config.toml`.** Rodar `npx --yes supabase@2.122.0 init` numa pasta temporária do scratchpad, copiar o `config.toml` gerado e ajustar só as chaves da spec §5 (`project_id`, `[db] major_version`, `[auth] site_url`, `additional_redirect_urls`, `enable_signup`, `[auth.email] enable_signup`, `[storage] file_size_limit`). Não inventar chaves que o arquivo gerado não tenha.

- [ ] **Step 4: Escrever `supabase/criar-usuarios-teste.sh`.** O script lê `API_URL` e `SERVICE_ROLE_KEY` de `npx supabase@2.122.0 status -o env` (só no stack local) e cria os dois usuários com `curl -X POST "$API_URL/auth/v1/admin/users"` usando `email_confirm: true`. A senha de teste fica numa variável no topo do script.

- [ ] **Step 5: Verificar no Postgres local.** Exige o Docker ligado (`open -a Docker` e aguardar `docker info` responder). Depois:

```bash
cd vistoria-veicular && npx --yes supabase@2.122.0 start
npx supabase@2.122.0 db reset
docker exec -i supabase_db_vistoria-veicular psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
```
Esperado: `NOTICE:  RLS OK` e código de saída 0. Se o Docker não puder ser usado, registrar no relatório da tarefa "migration não executada localmente" e seguir (a conferência fica para o README, Task 20).

- [ ] **Step 6: Commit**: `feat: migration Supabase com RLS, numeração e bucket privado`.

### Task 5: `storage.js` e página de testes de navegador

**Files:**
- Create: `storage.js`, `tests/navegador/index.html`, `tests/navegador/runner.js`, `tests/navegador/todos.js`, `tests/navegador/storage.nav.js`

**Interfaces:**
- Consumes: `formatos.vistoriaDoRascunho`, `formatos.chaveLocal`.
- Produces: a API da spec §4 `storage.js`, com estes complementos:
  - `excluirArquivo(chave)` e `removerMeta(chave)`.
  - `listarRascunhos(userId)` ordenado por `atualizadoEm` desc; `listarVistorias(userId)` ordenado por `realizadaEm` desc.
  - `apagarBanco()`, só para testes.
  - `class ArmazenamentoCheioError extends Error` (mensagem da spec §9) e `class BancoIndisponivelError extends Error` (mensagem "Este navegador não permite salvar dados offline. Use o app instalado ou outro navegador.").
- Produces (testes de navegador): `runner.js` exporta `teste(nome, fn)`, `igual(a, b, msg?)` (comparação profunda) e `ok(valor, msg?)`. `todos.js` importa cada `*.nav.js`, roda os testes em sequência e escreve `<li data-ok="true|false">` mais o resumo `#resumo` = `"<n> ok, <m> falhas"`. `index.html` só carrega `todos.js` como módulo.

- [ ] **Step 1: Criar o runner** (`index.html`, `runner.js`, `todos.js`), sem script inline.

- [ ] **Step 2: Escrever `storage.nav.js`**, chamando `apagarBanco()` no início de cada teste:
  - `salvarRascunho` → `obterRascunho` devolve o objeto igual. Com 2 rascunhos de `u1` e 1 de `u2`, `listarRascunhos("u1")` devolve 2, o mais recente primeiro.
  - `salvarArquivo("v1/frente.jpg", blob)` → `obterArquivo` devolve um Blob com o mesmo `size` e `type`. `excluirArquivos("v1")` apaga `v1/*` e mantém `v10/frente.jpg`.
  - `finalizarRascunho(r, iso)` → existe a vistoria `pendente` com o mesmo `id`, o rascunho sumiu e os arquivos `id/*` continuam lá.
  - `limparCacheSincronizado("u1")` apaga as vistorias `sincronizada` de `u1` e seus arquivos, e mantém as `pendente` e `erro` de `u1` e todas as de `u2`.
  - `limparFotosAntigas(30, agora)` apaga os arquivos de uma `sincronizada` com `arquivosSalvosEm` de 31 dias atrás, mantém os de uma de 29 dias e nunca toca nos de uma `pendente` antiga.
  - Fila de exclusões: `enfileirarExclusao` → `listarExclusoes("u1")` → `removerExclusao`.

- [ ] **Step 3: Rodar**: abrir `http://localhost:3000/tests/navegador/` e ler com `get_page_text` → falhas (módulo inexistente).

- [ ] **Step 4: Implementar `storage.js`** (banco `vistoria-veicular`, versão 1, stores e índices da spec §4).
  - `excluirArquivos(id)` usa `IDBKeyRange.bound(id + "/", id + "/￿")`.
  - Toda transação converte `QuotaExceededError` em `ArmazenamentoCheioError`.
  - Falha ao abrir o banco vira `BancoIndisponivelError`.

- [ ] **Step 5: Rodar de novo** → `0 falhas`.
- [ ] **Step 6: Commit**: `feat: storage.js (IndexedDB) e página de testes de navegador`.

### Task 6: `supabase.js` e biblioteca supabase-js local

**Files:**
- Create: `vendor/supabase-2.118.0.umd.js`, `supabase.js`, `tests/supabase.test.js`

**Interfaces:**
- Consumes: `formatos.caminhoRemoto`, `formatos.ARQUIVO`, `formatos.arquivoAvaria`, `config.ITENS_POR_PAGINA`.
- Produces:
  - Funções puras: `linhaDaVistoria(v): object`, `linhasDasAvarias(v): object[]`, `linhasDasFotos(v): object[]`, `vistoriaDaLinha(linha): Vistoria`, `classificarErro(e, online = true): { tipo: "rede"|"sessao"|"servidor", mensagem }`, `escaparBusca(termo): string`.
  - `criarRemoto({ url, chave, criarCliente = (u, k, o) => window.supabase.createClient(u, k, o) })` → objeto `remoto` com:
    - `obterSessao(): Promise<{ sessao: { usuario: {id, email} } | null, erro }>`
    - `entrar(email, senha): Promise<{id, email}>` (lança o erro original)
    - `sair(): Promise<void>`
    - `aoMudarSessao(cb: (evento, usuario|null) => void)`
    - `enviarArquivo(caminho, blob)`
    - `vistoriaExiste(id): Promise<{numero}|null>`
    - `inserirVistoria(v): Promise<{numero}>`
    - `gravarAvarias(v)`, `gravarFotosAvaria(v)`
    - `listarVistorias({ pagina = 0, busca = "", de = null, ate = null }): Promise<{ itens: Vistoria[], temMais: boolean }>`
    - `obterVistoriaCompleta(id): Promise<Vistoria>`
    - `urlsAssinadas(caminhos, segundos = 3600): Promise<Map<string,string>>`
    - `baixarArquivo(caminho): Promise<Blob>`
    - `excluirVistoriaRemota(userId, id)`
    - `classificarErro`
  - Os métodos que gravam recebem a **vistoria local** e fazem o mapeamento internamente; `sync.js` nunca monta linhas.

- [ ] **Step 1: Baixar a biblioteca.** Rodar `npm pack @supabase/supabase-js@2.118.0` numa pasta nova do scratchpad, extrair e copiar `package/dist/umd/supabase.js` para `vendor/supabase-2.118.0.umd.js`. Conferir que o arquivo começa com o cabeçalho UMD e não contém `eval(` nem `new Function`.

- [ ] **Step 2: Escrever os testes que falham** em `tests/supabase.test.js`:

```js
const v = { id: "v1", userId: "u1", chassi: "AB123C", marca: "Fiat", modelo: "Uno", cor: "Prata", km: 1000,
  combustivel: "Flex", checklist: { Antena: "presente" }, checklistObs: "", semAvarias: false,
  vistoriadorNome: "Ana", motoristaNome: "Beto", realizadaEm: "2026-11-07T13:00:00.000Z",
  avarias: [{ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "x", fotos: ["f1"] }] };
assert.deepEqual(linhaDaVistoria(v), { id: "v1", user_id: "u1", chassi: "AB123C", marca: "Fiat", modelo: "Uno",
  cor: "Prata", km: 1000, combustivel: "Flex", checklist: { Antena: "presente" }, checklist_obs: "",
  sem_avarias: false, vistoriador_nome: "Ana", motorista_nome: "Beto", realizada_em: "2026-11-07T13:00:00.000Z",
  foto_frente: "u1/v1/frente.jpg", foto_traseira: "u1/v1/traseira.jpg", foto_chassi: "u1/v1/chassi.jpg",
  assinatura_vistoriador: "u1/v1/assinatura_vistoriador.png", assinatura_motorista: "u1/v1/assinatura_motorista.png" });
assert.equal("numero" in linhaDaVistoria(v), false);
assert.deepEqual(linhasDasAvarias(v), [{ id: "d1", inspection_id: "v1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "x" }]);
assert.deepEqual(linhasDasFotos(v), [{ id: "f1", damage_id: "d1", path: "u1/v1/avaria_f1.jpg" }]);
const lista = vistoriaDaLinha({ id: "v1", user_id: "u1", numero: "VIS-000001", realizada_em: "2026-11-07T13:00:00+00:00",
  chassi: "AB123C", marca: "Fiat", modelo: "Uno", foto_frente: "u1/v1/frente.jpg", damages: [{ count: 2 }] });
assert.equal(lista.origem, "remota"); assert.equal(lista.completa, false); assert.equal(lista.avariasQtd, 2);
assert.equal(lista.status, "sincronizada");
// classificação de erros
assert.equal(classificarErro(new TypeError("Failed to fetch")).tipo, "rede");
assert.equal(classificarErro({ name: "AuthRetryableFetchError" }).tipo, "rede");
assert.equal(classificarErro({ status: 503 }).tipo, "rede");
assert.equal(classificarErro({ status: 429 }).tipo, "rede");
assert.equal(classificarErro({ status: 401 }).tipo, "sessao");
assert.equal(classificarErro({ code: "PGRST301" }).tipo, "sessao");          // JWT expirado
assert.equal(classificarErro({ code: "42501", message: "new row violates row-level security" }).tipo, "servidor");
assert.equal(classificarErro({ status: 400 }, false).tipo, "rede");           // offline sempre é rede
assert.match(classificarErro({ code: "23514" }).mensagem, /recusou/);       // check violation, mensagem em pt-BR
// busca
assert.equal(escaparBusca(" Gol, (G5) 100%* "), "Gol G5 100");
```
Teste `excluirVistoriaRemota apaga a linha e depois os arquivos`: usa um cliente falso (passado em `criarCliente`) que registra as chamadas e cujo `storage.list` devolve `[{ name: "frente.jpg" }, { name: "chassi.jpg" }]`. Esperado: `assert.deepEqual(chamadas, ["delete inspections id=v1", "list vistorias u1/v1", "remove vistorias u1/v1/frente.jpg,u1/v1/chassi.jpg"])`.

- [ ] **Step 3: Rodar** `npm test` → FAIL.

- [ ] **Step 4: Implementar `supabase.js`.**
  - `vistoriaExiste`: `from("inspections").select("numero").eq("id", id).maybeSingle()`.
  - `inserirVistoria`: `insert(linha).select("numero").single()`.
  - `gravarAvarias` e `gravarFotosAvaria`: `upsert(linhas, { onConflict: "id", ignoreDuplicates: true })`; com lista vazia, não chamam nada.
  - `enviarArquivo`: `storage.from("vistorias").upload(caminho, blob, { upsert: true, contentType: blob.type })`.
  - `listarVistorias`: `select("id, user_id, numero, realizada_em, chassi, marca, modelo, foto_frente, damages(count)")`, `order("realizada_em", { ascending: false })`, `range(pagina*N, pagina*N + N)`. Pede N+1 linhas para calcular `temMais`. A busca usa `or("chassi.ilike.*t*,marca.ilike.*t*,modelo.ilike.*t*,numero.ilike.*t*")`; o período usa `gte`/`lt` em `realizada_em`.
  - `obterVistoriaCompleta`: `select("*, damages(*, damage_photos(*))")`.
  - Mensagens de `classificarErro` em pt-BR:
    - rede: "Sem conexão com o servidor."
    - sessão: "Sua sessão expirou. Entre novamente para enviar as vistorias pendentes."
    - servidor: "O servidor recusou os dados: <detalhe>."
  - Qualquer erro com `supabase.error` é relançado como erro.

- [ ] **Step 5: Rodar** `npm test` → PASS.
- [ ] **Step 6: Commit**: `feat: camada supabase.js e supabase-js 2.118.0 local`.

### Task 7: `sync.js` — fila de sincronização

**Files:**
- Create: `sync.js`, `tests/sync.test.js`

**Interfaces:**
- Consumes: interface de `storage` (Task 5), de `remoto` (Task 6) e `formatos.arquivosDaVistoria`, `chaveLocal`, `caminhoRemoto`, `rotuloArquivo`.
- Produces: `criarSincronizador({ storage, remoto, usuarioAtual: () => ({id,email})|null, estaOnline: () => boolean, locks = globalThis.navigator?.locks })` → `{ sincronizar(): Promise<{ enviadas: number, erros: number, interrompido: null|"offline"|"rede"|"sessao"|"ocupado"|"sem-usuario" }>, contar(): Promise<{ pendentes: number, erros: number }>, eventos: EventTarget }`. O evento `mudou` é um `CustomEvent` com `detail = { pendentes, erros, sincronizando: boolean, sessaoExpirada: boolean }`.

- [ ] **Step 1: Escrever os testes que falham** com dublês em memória.
  - `storage` falso: Maps com a mesma API usada.
  - `remoto` falso: registra `chamadas`, aceita falhas programadas por método e chamada e usa `classificarErro = (e) => e`; os erros programados já são `{ tipo, mensagem }`.

  Fixture `v1` do usuário `u1`: `pendente`, 1 avaria com 2 fotos, ou seja, 8 arquivos em `arquivosDaVistoria`, todos presentes no storage falso. Um `test` por caso:
  - `envia na ordem da spec`: `chamadas` = os 8 `enviarArquivo:<caminho>` na ordem de `arquivosDaVistoria`, depois `vistoriaExiste`, `inserirVistoria`, `gravarAvarias`, `gravarFotosAvaria`. A vistoria termina com `status "sincronizada"`, `numero "VIS-000001"`, `erro null` e `arquivosSalvosEm` preenchido.
  - `reenvio não insere de novo`: com `vistoriaExiste` → `{ numero: "VIS-000007" }`, `inserirVistoria` não é chamado e o `numero` vira `"VIS-000007"`.
  - `queda de rede no 3º arquivo`: termina `pendente`, `enviados` tem 2 nomes e `interrompido "rede"`. Na rodada seguinte, sem falha, só os 6 restantes são enviados.
  - `sessão expirada`: termina `pendente`, `interrompido "sessao"` e um evento `mudou` com `sessaoExpirada: true`.
  - `erro do servidor segue para a próxima`: A falha em `gravarAvarias` com `{ tipo: "servidor", mensagem: "O servidor recusou os dados: x." }` e fica `status "erro"` com essa mensagem; B fica `sincronizada`; o resultado é `{ enviadas: 1, erros: 1 }`.
  - `offline não chama o remoto`: `interrompido "offline"` e `chamadas.length === 0`.
  - `single-flight`: `await Promise.all([s.sincronizar(), s.sincronizar()])` chama `inserirVistoria` uma vez.
  - `lock ocupado`: com um `locks` falso que chama o callback com `null`, devolve `interrompido "ocupado"`.
  - `exclusões primeiro e vistorias excluindo puladas`: a ordem de `chamadas` começa com `excluirVistoriaRemota:u1:v9`; depois disso a fila e a vistoria local `v9` somem, e uma vistoria `excluindo` não é enviada.
  - `virou excluindo no meio do envio`: o `gravarFotosAvaria` falso muda a vistoria no storage para `excluindo`; no fim, o status continua `excluindo`.
  - `arquivo local ausente`: sem `v1/traseira.jpg`, termina `status "erro"` com `O arquivo "Traseira" não foi encontrado neste aparelho.`
  - `usuário B não envia de A` (Review Focus 4): com `usuarioAtual` = B e só pendentes e exclusões de A, `chamadas.length === 0`, e as vistorias de A continuam `pendente`.
  - `contar`: com 2 pendentes, 1 erro e 1 sincronizada, devolve `{ pendentes: 2, erros: 1 }`.

- [ ] **Step 2: Rodar** `npm test` → FAIL.
- [ ] **Step 3: Implementar `sync.js`** seguindo spec §4 (`sync.js`).
  - A vistoria é relida do storage antes de cada gravação de status.
  - `enviados` é atualizado e gravado depois de cada arquivo enviado.
  - Sem `locks`, roda sem trava.
- [ ] **Step 4: Rodar** `npm test` → PASS.
- [ ] **Step 5: Commit**: `feat: sync.js com envio idempotente e fila de exclusões`.

### Task 8: `auth.js`

**Files:**
- Create: `auth.js`, `tests/auth.test.js`

**Interfaces:**
- Consumes: `remoto.obterSessao`, `entrar`, `sair`, `aoMudarSessao`, `classificarErro`; `storage.obterMeta`, `salvarMeta`, `removerMeta`, `limparCacheSincronizado`.
- Produces: `criarAuth({ remoto, storage, estaOnline = () => navigator.onLine })` → `{ iniciar(): Promise<Usuario|null>, entrar(email, senha): Promise<Usuario>, sair(): Promise<void>, usuarioAtual(): Usuario|null, aoMudar(cb: (Usuario|null) => void): () => void }`, com `Usuario = { id, email }`. Um `SIGNED_OUT` vindo de `aoMudarSessao` limpa o usuário e chama os `aoMudar`.

- [ ] **Step 1: Escrever os testes que falham:**
  - Com sessão: `iniciar()` devolve o usuário e grava `meta.usuario`.
  - Sem sessão, com erro de rede e `meta.usuario` salvo: devolve o usuário do cache.
  - Sem sessão e sem erro: devolve `null`.
  - Sem sessão, com erro `servidor` (refresh revogado) e cache: devolve `null`.
  - `entrar` com erro `{ status: 400, code: "invalid_credentials" }`: rejeita com `Error("E-mail ou senha incorretos.")`.
  - `entrar` com `estaOnline() === false`: rejeita com `"Sem internet: o primeiro acesso precisa de conexão."` sem chamar o remoto.
  - `entrar` com erro classificado como `rede` (servidor inacessível): rejeita com a mesma mensagem.
  - Outro erro: rejeita com `"Não foi possível entrar. Tente novamente em instantes."`.
  - `sair()` chama `remoto.sair`, `limparCacheSincronizado(id)` e `removerMeta("usuario")`, e `usuarioAtual()` passa a ser `null`, **mesmo quando `remoto.sair` rejeita**.
  - `sair()` não apaga rascunhos nem pendentes: o storage falso confirma que só `limparCacheSincronizado` foi chamado (Review Focus 4).
- [ ] **Step 2: Rodar** `npm test` → FAIL.
- [ ] **Step 3: Implementar `auth.js`.** O `signOut({ scope: "local" })` do supabase-js 2.118 já remove a sessão local mesmo quando falha offline (conferido no código-fonte), então `sair()` só ignora o erro.
- [ ] **Step 4: Rodar** `npm test` → PASS.
- [ ] **Step 5: Commit**: `feat: auth.js com sessão válida offline`.

### Task 9: Shell do app, `ui.js` e tela de login

**Files:**
- Create: `index.html`, `styles.css`, `ui.js`, `app.js`, `views/login.js` e três views provisórias, só com um título: `views/nova.js` (substituída na Task 11), `views/detalhe.js` (Task 16) e `views/vistorias.js` (Task 17)

**Interfaces:**
- Consumes: `criarRemoto`, `criarAuth`, `criarSincronizador`, `storage`, `env.js`.
- Produces:
  - `ui.js`:
    - `$(sel, raiz?)`, `$$(sel, raiz?)`, `esc(s)`
    - `icone(nome)`, com estes nomes: `camera`, `check`, `x`, `alerta`, `lixeira`, `editar`, `mais`, `voltar`, `avancar`, `pdf`, `compartilhar`, `atualizar`, `nuvem`, `nuvemOff`, `menu`, `sair`, `imagem`, `borracha`, `busca`, `calendario`
    - `avisar(texto, tipo: "info"|"sucesso"|"erro" = "info")`
    - `confirmar({ titulo, texto, ok = "Confirmar", cancelar = "Cancelar", perigo = false }): Promise<boolean>`
    - `carregarScript(src): Promise<void>` (cada `src` uma vez)
  - Contrato das views: `export async function montar(el, ctx, params) → { desmontar?(): void, podeSair?(): Promise<boolean> }`, em que:
    - `ctx = { storage, remoto, auth, sync, navegar(hash), online(): boolean, confirmar, avisar }`. `confirmar` e `avisar` são os de `ui.js`; nos testes de navegador, as views e etapas recebem versões falsas por esse `ctx`.
    - `params = { id?: string, busca: URLSearchParams }`.
  - Rotas (spec §7): `#/nova`, `#/vistorias`, `#/vistoria/<id>`; padrão `#/nova`.
  - Antes de trocar de rota, `app.js` chama `podeSair()` da view atual; se o resultado for `false`, restaura o hash anterior sem remontar.
  - Gatilhos de `sync.sincronizar()` (spec §4 `sync.js`): `online`, início, `visibilitychange` para visível e mensagem do SW `{ tipo: "sincronizar" }`. O evento `mudou` atualiza o indicador do topo e o selo da aba.

- [ ] **Step 1: `index.html`.**
  - `lang="pt-BR"`, `meta viewport` com `viewport-fit=cover` e `meta theme-color #0B4F6C`.
  - Links do manifest e dos ícones (os arquivos chegam na Task 18).
  - Topo (`header`): título, indicador `#status-rede` e botão de menu.
  - `<main id="main">`.
  - Barra de abas (`nav`) com dois links: "Nova vistoria" e "Vistorias" + `#selo-pendentes`.
  - Faixas `#faixa-versao` e `#faixa-instalar` (ocultas).
  - Região `#avisos` com `aria-live="polite"`.
  - Scripts: `<script src="vendor/supabase-2.118.0.umd.js" defer>` e depois `<script type="module" src="app.js">`.

- [ ] **Step 2: `styles.css`.**
  - Tokens em `:root`: cores da spec §7, raio, espaçamentos, `--alvo: 48px`.
  - Base e foco visível de 3 px.
  - Topo e barra inferior fixa com `env(safe-area-inset-bottom)`.
  - Botões: primário, secundário, perigo.
  - Campos grandes, chips, botões segmentados, cartões, selos de status e de gravidade, `dialog`, avisos.
  - Coluna central `max-width: 720px` a partir de 768 px.
  - Sem `@import` e sem fontes externas.

- [ ] **Step 3: `ui.js` e `app.js`.**
  - Se o `env.js` estiver vazio ou com o texto do modelo (`SEU-PROJETO`/`SUA-ANON-KEY`): renderiza a tela "Configure o arquivo env.js (veja o README)." e para.
  - Se `iniciar()` der `null`: monta `views/login.js` sem as abas.
  - Se o banco der `BancoIndisponivelError`: mostra a mensagem dela em tela cheia e para.
  - Ao iniciar com usuário: chama `storage.limparFotosAntigas(DIAS_CACHE_FOTOS)` sem esperar e depois `sync.sincronizar()`.
  - Se `sincronizar()` terminar com `interrompido "rede"`: registra `registration.sync.register("enviar-vistorias")` quando existir.
  - Evento `mudou` com `sessaoExpirada: true`: mostra a faixa da spec §9 ("Sua sessão expirou…") com o botão "Entrar". O botão monta `views/login.js` sem apagar nada; depois de entrar, chama `sincronizar()`.
  - Menu do topo: "Sair" (com a confirmação de pendentes da spec §6) e o item "Instalar app" (oculto até a Task 18).

- [ ] **Step 4: `views/login.js`** com os campos, os textos e os erros da spec §6.
  - Botão desabilitado com "Entrando…" durante a chamada.
  - Erro em `role="alert"`.
  - Depois do login, navega para `#/nova`.

- [ ] **Step 5: Conferir no navegador** (`preview_start { name: "vistoria" }`, viewport `mobile`):
  1. Com o `env.js` do modelo, aparece a tela "Configure o arquivo env.js".
  2. Com um `env.js` temporário apontando para `http://127.0.0.1:54321`, permitido na CSP local e sem nada rodando nessa porta, aparece a tela "Entrar". Tentar entrar mostra "Sem internet: o primeiro acesso precisa de conexão." em `role="alert"`.
  3. `read_console_messages` sem violações de CSP.
  4. `resize_window` 768 e 1280: a coluna fica centralizada.
  5. Restaurar o `env.js` do modelo antes do commit.

- [ ] **Step 6: Commit**: `feat: shell do app, rotas, ui.js e tela de login`.

### Task 10: `photos.js` e `signature.js`

**Files:**
- Create: `photos.js`, `signature.js`, `tests/navegador/photos.nav.js`, `tests/navegador/signature.nav.js`
- Modify: `tests/navegador/todos.js` (importar os novos testes)

**Interfaces:**
- Produces:
  - `photos.js`:
    - `escolherFoto({ camera = true } = {}): Promise<File|null>`: input temporário com `accept="image/*"` e `capture="environment"`; resolve `null` no evento `cancel`.
    - `comprimir(arquivo: Blob, { maxLado = FOTO.maxLado, qualidade = FOTO.qualidade } = {}): Promise<Blob>`: lança `Error("Não foi possível ler esta foto. Tente tirar outra.")` se não decodificar.
    - `gerarMiniatura(blob): Promise<Blob>` (`FOTO.miniLado`).
    - `verificarCamera(): Promise<"negada"|"ok"|"desconhecido">`.
    - `abrirVisualizador(fotos: Array<{ src, legenda }>, indice = 0)`.
    - `MENSAGEM_CAMERA_NEGADA` (texto da spec §7, etapa 1).
  - `signature.js`: `montarAssinatura(canvas, { aoMudar: (blob|null) => void })` → `{ limpar(), carregar(blob): Promise<void>, vazio(): boolean, destruir() }` (spec §4).

- [ ] **Step 1: Escrever os testes de navegador que falham** (Review Focus 5):
  - Um PNG 4000×3000 **transparente** gerado com canvas → `comprimir` devolve `image/jpeg` com maior lado 1280 e 960 no outro, e o pixel (0,0) branco (lido com `createImageBitmap` + canvas).
  - Um JPEG 300×200 continua com 300×200 (sem ampliar).
  - Um Blob `text/plain` é rejeitado com a mensagem exata.
  - `gerarMiniatura` de 1280×960 → 320×240.
  - Assinatura: um canvas de 300×150 CSS com `devicePixelRatio` simulado 2 fica com `canvas.width === 600`. Uma sequência `pointerdown/move/up` sintética chama `aoMudar` com um Blob `image/png`, e `vazio()` vira `false`. `limpar()` chama `aoMudar(null)`, e `vazio()` volta a ser `true`. `carregar(blob)` deixa `vazio()` como `false`.
- [ ] **Step 2: Rodar** a página de testes → falhas.
- [ ] **Step 3: Implementar** os dois módulos.
  - `comprimir`: `createImageBitmap(arquivo, { imageOrientation: "from-image" })`, fundo branco, `canvas.toBlob(…, "image/jpeg", qualidade)`.
  - Visualizador: `<dialog>` com legenda, botões anterior/próxima (ocultos com uma foto só), deslizar de mais de 50 px, Esc e foco devolvido ao elemento de origem.
  - Assinatura: `touch-action: none` aplicado por classe.
- [ ] **Step 4: Rodar** → `0 falhas`.
- [ ] **Step 5: Commit**: `feat: captura e compressão de fotos, visualizador e assinatura`.

### Task 11: Nova vistoria — editor de rascunho, etapas e etapa 1

**Files:**
- Create: `rascunho.js`, `tests/rascunho.test.js`, `views/etapa-veiculo.js`, `tests/navegador/etapa-veiculo.nav.js`
- Modify: `views/nova.js` (substitui o provisório), `tests/navegador/todos.js`

**Interfaces:**
- Consumes: `storage`, `formatos`, `validacao`, `photos`.
- Produces:
  - `rascunho.js`: `criarEditor({ storage, rascunho, esperaMs = 400, agora = () => new Date().toISOString() })`, que devolve:
    - `rascunho` (getter)
    - `alterar(fn: (dados) => void, { imediato = false } = {})`
    - `irPara(etapa)`
    - `gravarArquivo(nome, blob, marcar?: (dados) => void): Promise<void>`
    - `lerArquivo(nome): Promise<Blob|undefined>`
    - `apagarArquivo(nome, desmarcar?: (dados) => void): Promise<void>`
    - `descarregar(): Promise<void>`
    - `temPendente(): boolean`
    - `aoMudar(cb): () => void`
  - Contrato das etapas: `export function montar(el, editor, ctx) → { desmontar(): void }`. A etapa só lê e escreve via `editor`.
  - `views/nova.js`:
    - Carrega o rascunho: `params.busca.get("rascunho")`, ou o mais recente do usuário, ou um novo; `?novo=1` sempre cria um novo.
    - Monta o indicador das 4 etapas com ✓/! (`situacaoEtapa`), a barra Voltar/Avançar/Finalizar e a etapa atual.
    - `podeSair()` chama `editor.descarregar()` e devolve `true`, a não ser que a etapa atual exponha um `podeSair` que diga não (usado pela etapa 3).
    - `visibilitychange`/`pagehide` chamam `descarregar()`; `beforeunload` só avisa quando `temPendente()`.
    - As etapas 2–4 ficam como provisórias até as Tasks 12–14; o botão "Finalizar vistoria" é ligado na Task 14.

- [ ] **Step 1: Testes que falham em `tests/rascunho.test.js`**, com `mock.timers` do `node:test` e storage falso:
  - Dois `alterar` seguidos dentro de 400 ms geram **uma** chamada a `salvarRascunho`, feita 400 ms depois do último.
  - `alterar(fn, { imediato: true })` grava na hora.
  - `descarregar()` grava o que estiver agendado e `temPendente()` vira `false`.
  - `gravarArquivo("frente.jpg", blob, d => d.fotos.frente = true)` chama `salvarArquivo("<id>/frente.jpg", blob)` e grava o rascunho já com `fotos.frente === true`.
  - Cada gravação atualiza `atualizadoEm` com `agora()`.
- [ ] **Step 2: Rodar** `npm test` → FAIL. **Step 3:** implementar `rascunho.js`. **Step 4:** `npm test` → PASS.

- [ ] **Step 5: Testes de navegador que falham** (`etapa-veiculo.nav.js`), montando a etapa num `div` com um editor real sobre o banco de teste:
  - Digitar `ab-12` no chassi fica `AB12` e o contador mostra `4/6`. Um `blur` com 4 caracteres mostra "O chassi deve ter 6 caracteres (faltam 2)" num elemento com `aria-live`.
  - **Review Focus 3:** um `InputEvent` com `isComposing: true` não altera o valor digitado; o `compositionend` normaliza.
  - Km `1234567` aparece como `1.234.567`, e `editor.rascunho.dados.km === 1234567`.
  - Clicar no chip "Diesel" deixa `aria-checked="true"` só nele e grava `combustivel: "Diesel"`.
  - Os 3 slots têm os ids `foto-frente`, `foto-traseira`, `foto-chassi` e os rótulos Frente/Traseira/Chassi.
- [ ] **Step 6: Implementar `views/etapa-veiculo.js`** (spec §7, etapa 1).
  - Campos com `<label for>` e ids iguais aos `campo` da Task 3.
  - Km com `inputmode="numeric"` e `maxlength="9"`.
  - Chips em `role="radiogroup"`.
  - Slot de foto:
    1. `verificarCamera()` "negada" → `avisar(MENSAGEM_CAMERA_NEGADA)`.
    2. `escolherFoto` → `comprimir` → `gravarArquivo`; na frente, também `frente_mini.jpg` via `gerarMiniatura`.
    3. "Refazer" troca a foto; "Remover" pede `confirmar` e chama `apagarArquivo`.
    4. A miniatura abre `abrirVisualizador`.
  - Erros de foto e de armazenamento vão para `avisar(…, "erro")`.
- [ ] **Step 7: Rodar** a página de testes → `0 falhas`.
- [ ] **Step 8: Conferir no navegador** (375 px):
  1. Preencher a etapa 1 com fotos de teste (o upload no input é simulado).
  2. Recarregar a página: tudo volta preenchido.
  3. O indicador mostra ✓ na etapa 1.
  4. Avançar e voltar mantém os dados.
- [ ] **Step 9: Commit**: `feat: nova vistoria com salvamento automático e etapa de veículo`.

### Task 12: Etapa 2 — checklist

**Files:**
- Create: `views/etapa-checklist.js`, `tests/navegador/etapa-checklist.nav.js`
- Modify: `views/nova.js` (ligar a etapa 2), `tests/navegador/todos.js`

**Interfaces:**
- Consumes: contrato de etapa e `editor` (Task 11), `CHECKLIST_ITENS`.
- Produces: grava `dados.checklist[item] = "presente" | "ausente"` e `dados.checklistObs`.

- [ ] **Step 1: Testes de navegador que falham:**
  - Há 13 `fieldset` com `legend` igual ao item, e o primeiro tem o id `chk-0`.
  - Clicar em "Ausente" de "Bateria" grava `checklist.Bateria === "ausente"` e o contador mostra `1 de 13`.
  - "Marcar todos como Presente" deixa os 13 como `"presente"`.
  - "Limpar" com um `confirmar` falso que devolve `true` esvazia o checklist; com `false`, mantém.
  - A observação é gravada em `checklistObs`.
- [ ] **Step 2: Rodar** → falhas. **Step 3:** implementar (spec §7, etapa 2), sempre usando `ctx.confirmar`. **Step 4:** rodar → `0 falhas`.
- [ ] **Step 5: Commit**: `feat: etapa de checklist`.

### Task 13: Etapa 3 — avarias e editor de avaria

**Files:**
- Create: `views/etapa-avarias.js`, `tests/navegador/etapa-avarias.nav.js`
- Modify: `views/nova.js` (ligar a etapa 3 e respeitar o `podeSair` dela), `tests/navegador/todos.js`

**Interfaces:**
- Consumes: `editor`, `validarAvaria`, `AREAS_AVARIA`, `TIPOS_AVARIA`, `GRAVIDADES`, `photos`, `formatos.arquivoAvaria`.
- Produces: o retorno de `montar` inclui `podeSair(): Promise<boolean>` (o editor aberto com alterações pede "Descartar as alterações desta avaria?"). As avarias são gravadas em `dados.avarias` com `id` e `fotos` (fotoIds) gerados por `crypto.randomUUID()`.

- [ ] **Step 1: Testes de navegador que falham:**
  - "+ Adicionar avaria" abre um `dialog` com o título "Nova avaria". Salvar vazio mostra as 3 mensagens de `validarAvaria`.
  - Com área "Capô", tipo "Risco", gravidade "Grave" e sem foto, o `confirmar` "Esta avaria está sem foto. Salvar mesmo assim?" com `true` cria 1 cartão com o selo "Grave" e desliga `semAvarias`.
  - Ligar "Veículo sem avarias" com 1 avaria e `confirmar` → `true` remove a avaria e os arquivos dela.
  - Ao cancelar uma avaria **nova** com 1 foto tirada, o arquivo `avaria_<id>.jpg` é apagado do storage.
  - "Editar" abre com os valores atuais e o título "Editar avaria"; "Remover" com `confirmar` → `true` apaga.
  - Com o editor aberto e alterado, `podeSair()` e `confirmar` → `false` devolve `false`.
- [ ] **Step 2: Rodar** → falhas.
- [ ] **Step 3: Implementar** (spec §7, etapa 3).
  - Área e tipo em `<select>` grandes com a opção vazia "Selecione".
  - Gravidade em 3 botões de rádio coloridos.
  - Fotos com "Adicionar foto" (`escolherFoto` → `comprimir` → `gravarArquivo(arquivoAvaria(fotoId))`) e remoção individual.
  - O toggle tem o id `sem-avarias`.
- [ ] **Step 4: Rodar** → `0 falhas`.
- [ ] **Step 5: Commit**: `feat: etapa de avarias com editor e fotos`.

### Task 14: Etapa 4 — assinaturas e "Finalizar vistoria"

**Files:**
- Create: `views/etapa-assinaturas.js`, `tests/navegador/finalizar.nav.js`
- Modify: `views/nova.js` (ligar a etapa 4 e o botão Finalizar), `tests/navegador/todos.js`

**Interfaces:**
- Consumes: `editor`, `montarAssinatura`, `faltandoParaFinalizar`, `storage.finalizarRascunho`, `storage.pedirPersistencia`, `storage.salvarMeta`, `ctx.sync`, `ctx.navegar`.
- Produces: `finalizar(editor, ctx): Promise<string|null>` exportado de `views/nova.js`. Devolve o `id` da vistoria criada, ou `null` quando abre o diálogo "Falta preencher". Depois de criar a vistoria:
  - navega para `#/vistoria/<id>?nova=1`;
  - chama `ctx.sync.sincronizar()` sem esperar;
  - registra `registration.sync.register("enviar-vistorias")` quando existir.

- [ ] **Step 1: Testes de navegador que falham:**
  - Um rascunho completo, com arquivos de teste no storage, passa por `finalizar` e devolve o `id`. Em seguida: a vistoria existe com `status "pendente"`, `realizadaEm` dentro dos últimos 5 s, o rascunho sumiu, `meta["ultimoVistoriador:<userId>"]` é o nome digitado e `ctx.navegar` recebeu `#/vistoria/<id>?nova=1`.
  - Um rascunho sem a foto Traseira e sem nome do motorista devolve `null` e abre um `dialog` "Falta preencher" com os grupos "1 Veículo" e "4 Assinaturas". Tocar em "Falta a foto: Traseira" fecha o diálogo, vai para a etapa 1 e foca `#foto-traseira`.
  - Etapa 4: o nome do vistoriador vem preenchido com o `ultimoVistoriador`. Assinar grava `assinatura_vistoriador.png` e `assinaturas.vistoriador === true`. "Limpar assinatura" com `confirmar` → `true` apaga o arquivo e a marca.
- [ ] **Step 2: Rodar** → falhas. **Step 3:** implementar (spec §7, etapa 4 e "Finalizar vistoria"; ids `vistoriador-nome`, `vistoriador-assinatura`, `motorista-nome`, `motorista-assinatura`). **Step 4:** rodar → `0 falhas`.
- [ ] **Step 5: Conferir no navegador:**
  1. Fluxo completo em 375 px até "Finalizar vistoria".
  2. O hash muda para o detalhe (ainda provisório).
  3. A aba Vistorias mostra o selo de 1 pendente (offline ou com o env do modelo).
- [ ] **Step 6: Commit**: `feat: assinaturas e finalização da vistoria`.

### Task 15: `pdf.js` e bibliotecas jsPDF locais

**Files:**
- Create: `vendor/jspdf-4.2.1.umd.min.js`, `vendor/jspdf-autotable-5.0.9.min.js`, `pdf.js`, `tests/navegador/pdf.nav.js`
- Modify: `tests/navegador/todos.js`

**Interfaces:**
- Consumes: `ui.carregarScript`, `formatos` (`formatarDataHora`, `formatarKm`, `nomeVistoria`, `idProvisorio`, `nomeArquivoPdf`, `textoPdf`, `ARQUIVO`, `arquivoAvaria`), `config` (`CHECKLIST_ITENS`, `GRAVIDADES`, `PDF_FOTO`).
- Produces: `gerarPdf(vistoria, obterImagem: (nome) => Promise<Blob|null>, { depurar = false } = {}): Promise<{ blob: Blob, nomeArquivo: string, paginas: number, textos?: string[] }>`. Com `depurar: true`, `textos` traz cada texto escrito no documento, inclusive os rodapés, para os testes. Também produz: `class ImagemAusenteError extends Error` (mensagem da spec §7, detalhe: "Algumas fotos ainda não estão neste aparelho. Conecte-se à internet para gerar o PDF.") e `class ErroPdf extends Error` (mensagem "Não foi possível gerar o PDF. Tente novamente. (<detalhe>)"). Depois de carregar as bibliotecas, usa `window.jspdf.jsPDF` e `window.autoTable(doc, opções)`.

- [ ] **Step 1: Baixar as bibliotecas.** Rodar `npm pack jspdf@4.2.1 jspdf-autotable@5.0.9` numa pasta nova do scratchpad e copiar `package/dist/jspdf.umd.min.js` e `package/dist/jspdf.plugin.autotable.min.js` com os nomes acima.

- [ ] **Step 2: Testes de navegador que falham.** A fixture tem as 3 fotos de 1280×960 (canvas colorido → JPEG), 10 avarias com 3 fotos cada e 2 assinaturas PNG. Uma avaria tem a descrição `"Risco 👍 na porta " + "muito longo ".repeat(60)` e o motorista se chama `"José 🚚"`.
  - `nomeArquivo === "Vistoria_AB123C_2026-11-07.pdf"` (com `realizadaEm` de 07/11/2026 local).
  - `blob.type === "application/pdf"` e `blob.size < 10 * 1024 * 1024`.
  - `paginas >= 4`.
  - Não lança erro com emoji (Review Focus 1).
  - Uma vistoria sem avarias (`semAvarias: true`, `numero: null`, id começando com `8f3a`) gerada com `{ depurar: true }` tem `textos` contendo "Veículo sem avarias registradas", "Laudo de Vistoria Veicular", "Provisório 8F3A — aguardando sincronização" e, na última página, `Vistoria nº Provisório 8F3A — página ${paginas} de ${paginas}`.
  - Com `numero: "VIS-000123"`, `textos` contém `Vistoria nº VIS-000123 — página 1 de ${paginas}`.
  - `obterImagem` devolvendo `null` para `traseira.jpg` rejeita com `ImagemAusenteError`.
- [ ] **Step 3: Rodar** → falhas.
- [ ] **Step 4: Implementar `pdf.js`** conforme a spec §11 (margens de 15 mm, Helvetica, rodapé em todas as páginas desenhado no final, `textoPdf` em todo texto livre).
  - Para fotos: decodificar com `createImageBitmap`, reamostrar para `PDF_FOTO.maxLado` (ou `maxLadoMuitas` quando houver mais de `limiteMuitas` fotos), JPEG `PDF_FOTO.qualidade`, encaixar em "contain" na moldura.
  - Para cada bloco: `garantirEspaco(altura)` → `doc.addPage()` quando não couber (limite útil `y ≤ 280` mm).
  - Checklist: `autoTable` com `rowPageBreak: "avoid"`; o estilo de "Ausente" vem da spec §11.
- [ ] **Step 5: Rodar** → `0 falhas`.
- [ ] **Step 6: Conferir visualmente** o PDF da fixture. A página de testes guarda a URL do último PDF em `window.ultimoPdf`; navegar até ela no painel e tirar screenshot da página 1 e de uma página de avarias. Confirmar: cabeçalho, grade de dados, 3 fotos sem corte, "Ausente" destacado, faixas de gravidade coloridas, assinaturas com linha, nome e data, rodapé.
- [ ] **Step 7: Commit**: `feat: laudo em PDF com jsPDF local`.

### Task 16: Tela de detalhe

**Files:**
- Modify: `views/detalhe.js` (substitui o provisório)

**Interfaces:**
- Consumes: `storage`, `remoto` (`obterVistoriaCompleta`, `baixarArquivo`, `urlsAssinadas`), `gerarPdf`, `ImagemAusenteError`, `ctx.sync` (evento `mudou` e `sincronizar`), `photos.abrirVisualizador`, `formatos`.
- Produces: a tela `#/vistoria/<id>` da spec §7 ("Detalhe"), incluindo a faixa de `?nova=1`, o PDF pré-gerado (D13), Compartilhar com reserva de download e Excluir com as regras da spec §7.

- [ ] **Step 1: Implementar o carregamento.** Ordem: local → `remota` incompleta online (`obterVistoriaCompleta` + `baixarArquivo` de cada nome de `arquivosDaVistoria`, salvos em `arquivos`, `completa = true`, `arquivosSalvosEm = agora`) → offline sem dados (mensagem da spec). As imagens exibidas vêm de `URL.createObjectURL` do blob local, ou das URLs assinadas quando o blob não está no aparelho. As URLs de objeto são revogadas em `desmontar`.

- [ ] **Step 2: Implementar as ações.**
  - Ao montar, gera o PDF em segundo plano; os botões mostram "Preparando PDF…" até ficar pronto.
  - Quando `sync.eventos` emite `mudou` e o `numero` da vistoria (relida do storage) mudou, gera o PDF de novo e atualiza a faixa: "Vistoria enviada: VIS-…" ou "Sem internet: será enviada quando a conexão voltar".
  - "Baixar PDF" cria um `<a download>`.
  - "Compartilhar" chama `navigator.canShare({ files: [file] })` → `navigator.share({ files: [file], title: nomeVistoria(v) })`; sem suporte, baixa e avisa com a mensagem da spec.
  - "Excluir": `confirmar` (texto da spec) → regras da spec §7 → navega para `#/vistorias`.
  - Status Erro: mostra `v.erro` e "Tentar novamente" (`sincronizar()`).

- [ ] **Step 3: Conferir no navegador** (375 px, com uma vistoria criada pelo fluxo da Task 14):
  1. Todas as seções aparecem em modo leitura, e uma foto abre em tela cheia.
  2. "Baixar PDF" fica disponível depois de "Preparando PDF…".
  3. A faixa de `?nova=1` aparece.
  4. Excluir uma vistoria pendente offline (sem `enviados`) remove a vistoria e os arquivos dela do IndexedDB (conferir com `javascript_tool`).
  5. Console sem erros e sem violações de CSP.

- [ ] **Step 4: Commit**: `feat: tela de detalhe com PDF, compartilhamento e exclusão`.

### Task 17: Aba "Vistorias"

**Files:**
- Modify: `views/vistorias.js` (substitui o provisório)

**Interfaces:**
- Consumes: `storage` (`listarRascunhos`, `listarVistorias`, `salvarVistoria`, `obterArquivo`, `excluirRascunho`), `remoto` (`listarVistorias`, `urlsAssinadas`), `formatos` (`periodo`, `periodoPersonalizado`, `nomeVistoria`, `formatarDataHora`), `ctx.sync`.
- Produces: a tela `#/vistorias` da spec §7 ("Aba Vistorias"). Os cartões de rascunho levam a `#/nova?rascunho=<id>`; os de vistoria, a `#/vistoria/<id>`.

- [ ] **Step 1: Implementar a lista combinada.**
  - Monta a lista assim: vistorias locais do usuário (menos as `excluindo`) + página do servidor, sem repetir `id` e ordenadas por `realizadaEm` desc.
  - Ao receber uma página, grava no cache os itens que não existem localmente, com `origem "remota"` e `completa false`; os que já existem localmente não são sobrescritos.
  - "Carregar mais" busca `pagina + 1`.
  - Busca com 300 ms de espera e chips de período. Offline, filtra localmente por chassi, marca, modelo e `nomeVistoria`, sem diferenciar maiúsculas, e por `realizadaEm` dentro de `{de, ate}`.
  - "Atualizar" recarrega a primeira página e chama `sincronizar()`.
  - Miniaturas: blob local `frente_mini.jpg` → senão `urlsAssinadas` dos caminhos `…/frente_mini.jpg` da página → senão o ícone `imagem`.

- [ ] **Step 2: Implementar os rascunhos e os estados.**
  - Seção "Rascunhos" com Continuar e Descartar; Descartar pede confirmação e chama `excluirRascunho`.
  - Os três estados vazios e "Tentar novamente" nos cartões com erro, com os textos da spec §7.
  - A lista se redesenha quando `sync.eventos` emite `mudou`.

- [ ] **Step 3: Conferir no navegador** (375 px):
  1. Com 2 rascunhos e 3 vistorias locais (uma pendente, uma com erro, uma sincronizada criada com `javascript_tool`), aparecem a seção Rascunhos e os 3 cartões na ordem certa, com os chips de status (ícone + texto).
  2. Buscar `ab12` filtra pelo chassi; o chip "Hoje" esconde uma vistoria com `realizadaEm` de ontem.
  3. "Descartar" pede confirmação.
  4. Sem nenhuma vistoria, aparecem "Nenhuma vistoria ainda" e o botão.

- [ ] **Step 4: Commit**: `feat: aba Vistorias com busca, período e rascunhos`.

### Task 18: PWA — Service Worker, manifest, ícones, instalar e atualizar

**Files:**
- Create: `sw.js`, `manifest.webmanifest`, `icons/icon.svg`, `scripts/gerar-icones.js`, `tests/gerar-icones.test.js`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/maskable-512.png`, `icons/apple-touch-icon-180.png`
- Modify: `app.js` (registrar o SW, faixa de versão, instalar, mensagem `sincronizar`), `index.html` (links dos ícones, se faltarem)

**Interfaces:**
- Produces:
  - `scripts/gerar-icones.js` exporta `desenharIcone(tamanho: number, { maskable: boolean }): Uint8Array` (RGBA) e `codificarPng(largura, altura, rgba): Buffer`. Executado diretamente, grava os 4 PNGs em `icons/`.
  - `sw.js` com `CACHE_VERSION` e `ARQUIVOS` (spec §12).

- [ ] **Step 1: Testes que falham** em `tests/gerar-icones.test.js`:
  - O PNG gerado começa com a assinatura `89 50 4E 47 0D 0A 1A 0A`, e o `IHDR` informa 192×192 (e 512×512).
  - Decodificando o IDAT com `zlib.inflateSync` (filtro 0 em todas as linhas):
    - no ícone normal, o pixel (0,0) é transparente (canto arredondado) e o (5,256) é `#0B4F6C` opaco;
    - no maskable, o (0,0) é `#0B4F6C` opaco;
    - nos dois, o pixel central da prancheta (x 256, y 360, na escala de 512) é branco.
- [ ] **Step 2: Rodar** `npm test` → FAIL.
- [ ] **Step 3: Implementar `scripts/gerar-icones.js`.** Geometria em unidades de 512:
  - Fundo: quadrado arredondado de raio 112 (no maskable, sem arredondar).
  - Prancheta branca: `x 136–376`, `y 104–424`, raio 28.
  - Presilha: `x 200–312`, `y 80–136`, raio 16, cor `#7FB3C8`.
  - Check `#0B4F6C`: traço de largura 36 pelos pontos (190,270) → (240,320) → (330,215).
  - No maskable, o desenho (tudo menos o fundo) é escalado para 80% em torno do centro.
  - Supersampling 4×4; PNG RGBA 8 bits com CRC32 próprio e `zlib.deflateSync`.
  - Escrever `icons/icon.svg` com a mesma geometria.
- [ ] **Step 4: Rodar** `npm test` → PASS. Gerar com `node scripts/gerar-icones.js` e abrir `icons/icon-512.png` com Read para conferir o desenho.
- [ ] **Step 5: `manifest.webmanifest`** exatamente com os campos da spec §12.
- [ ] **Step 6: `sw.js`** (spec §12), com dois complementos:
  - `env.js` é servido **rede primeiro**, com o cache como reserva, para que trocar as chaves não dependa de mudar a `CACHE_VERSION`.
  - A lista `ARQUIVOS` inclui todos os arquivos criados nas Tasks 1–18 que o app carrega, mas não inclui `tests/`, `docs/`, `supabase/` nem `scripts/`.
- [ ] **Step 7: `app.js`.**
  - Registro do SW.
  - Faixa "Nova versão disponível — Atualizar" quando `registration.waiting` existir ou chegar via `updatefound`; o toque envia `SKIP_WAITING`, e `controllerchange` recarrega uma única vez.
  - `beforeinstallprompt` → item "Instalar app" no menu e faixa na primeira visita.
  - iPhone/iPad fora do modo standalone → faixa com a instrução da spec §12, que, ao fechar, grava `localStorage["faixaInstalarFechada"] = "1"` (dentro de try/catch).
  - `navigator.serviceWorker` `message` `{ tipo: "sincronizar" }` → `sync.sincronizar()`.
- [ ] **Step 8: Conferir offline no navegador:**
  1. Carregar o app e esperar o SW ativo (`navigator.serviceWorker.controller` não nulo, via `javascript_tool`).
  2. Parar o servidor (`preview_stop`) e recarregar: o app abre, as duas abas funcionam e um rascunho completo (criado antes, como na Task 14) pode ser finalizado e fica Pendente.
  3. Subir o servidor de novo.
  4. Mudar `CACHE_VERSION` para `"v1-teste"` e recarregar: aparece a faixa "Nova versão disponível — Atualizar"; tocar nela recarrega com o novo cache.
  5. Voltar a `CACHE_VERSION` para `"v1"`.
- [ ] **Step 9: Commit**: `feat: service worker offline, manifest, ícones e aviso de nova versão`.

### Task 19: Netlify e `gerar-env.js`

**Files:**
- Create: `netlify.toml`, `scripts/gerar-env.js`, `tests/gerar-env.test.js`
- Modify: `serve.json` (alinhar com o `netlify.toml`, mantendo as origens locais)

**Interfaces:**
- Produces:
  - `scripts/gerar-env.js` exporta `gerarEnv({ env: Record<string,string>, raiz: string }): { versao: string }`.
  - Executado diretamente, chama `gerarEnv({ env: process.env, raiz: <pasta do projeto> })`. Se faltar alguma variável, sai com código 1 e a mensagem da spec §13.

- [ ] **Step 1: Testes que falham** (numa cópia temporária de `env.js` e `sw.js` em `os.tmpdir()`):
  - Com `SUPABASE_URL=https://abc.supabase.co`, `SUPABASE_ANON_KEY=k1` e `COMMIT_REF=0123456789abcdef`, o `env.js` passa a ter `export const SUPABASE_URL = "https://abc.supabase.co";` e `export const SUPABASE_ANON_KEY = "k1";`, e o `sw.js` passa a ter `const CACHE_VERSION = "v-01234567";`.
  - Sem `COMMIT_REF`, a versão começa com `v-` e tem 10 caracteres.
  - Sem `SUPABASE_ANON_KEY`, lança um erro cuja mensagem contém `Defina SUPABASE_URL e SUPABASE_ANON_KEY`.
- [ ] **Step 2: Rodar** `npm test` → FAIL. **Step 3:** implementar. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: `netlify.toml`** exatamente como a spec §13: `publish = "."`, `command` comentado, `/*` com os três cabeçalhos de segurança, `/sw.js` com `no-cache`, `/manifest.webmanifest` com `Content-Type` e `/icons/*` e `/vendor/*` com `immutable`. Atualizar o `serve.json` para ter as mesmas regras, mais as origens locais do Supabase.
- [ ] **Step 6: Conferir os cabeçalhos locais:**
  - `curl -sI http://localhost:3000/sw.js` → `Cache-Control: no-cache`.
  - `curl -sI http://localhost:3000/manifest.webmanifest` → `Content-Type: application/manifest+json`.
  - `curl -sI http://localhost:3000/vendor/jspdf-4.2.1.umd.min.js` → `immutable`.
- [ ] **Step 7: Commit**: `feat: netlify.toml e script opcional gerar-env`.

### Task 20: README, lista de verificação e teste ponta a ponta

**Files:**
- Create: `README.md`
- Modify: `env.js` só durante o teste local (restaurar o modelo antes do commit)

**Interfaces:**
- Consumes: tudo.

- [ ] **Step 1: Escrever o `README.md`**:
  - visão geral de uma linha;
  - instruções numeradas da spec §14, incluindo os comandos com as versões fixadas (`npx --yes supabase@2.122.0 …`, `npx --yes serve@14.2.6 .`) e o aviso de nunca usar a service_role/secret key;
  - como editar `config.js`;
  - como rodar `npm test` e a página `tests/navegador/`;
  - a lista de verificação da spec §17, com o arquivo de cada item.

- [ ] **Step 2: Teste ponta a ponta contra o Supabase local** (se o Docker estiver disponível; senão, registrar "não verificado" no relatório):
  1. `npx supabase@2.122.0 start`, `db reset` e `bash supabase/criar-usuarios-teste.sh`.
  2. Escrever um `env.js` temporário com o `API_URL` local e a anon key local (de `supabase status -o env`).
  3. No navegador (375 px): entrar com `vistoriador.a@teste.local`.
  4. Fazer uma vistoria com 1 avaria e 2 fotos. Finalizar: a faixa passa a "Vistoria enviada: VIS-000001" e o PDF é regenerado com esse número.
  5. **Sem conexão com o servidor:** rodar `docker stop supabase_kong_vistoria-veicular`, que derruba só a porta de entrada do Supabase e mantém os dados. Fazer outra vistoria, que fica "Pendente". Rodar `docker start supabase_kong_vistoria-veicular` e tocar em "Atualizar" na aba Vistorias: o envio acontece e a vistoria vira `VIS-000002`.
  6. Recarregar e finalizar de novo não cria duplicata: `select count(*) from inspections` = 2.
  7. Sair e entrar como `vistoriador.b@teste.local`: a lista mostra "Nenhuma vistoria ainda".
  8. Voltar como A e excluir `VIS-000001`: a linha some do banco e `storage.objects` não tem mais `<A>/<id>/`.
  9. Console sem violações de CSP durante todo o fluxo.

- [ ] **Step 3: Rodar todas as verificações automáticas:** `npm test` → todos passam; a página `tests/navegador/` mostra `0 falhas`.

- [ ] **Step 4: Restaurar o `env.js` do modelo, parar o stack local (`npx supabase@2.122.0 stop`) e fazer o commit**: `docs: README com instruções e lista de verificação`.
