# Vistoria Veicular — Design

- **Data:** 07/11/2026
- **Status:** aguardando revisão
- **Pasta do projeto:** `AppsClaude/vistoria-veicular` (projeto novo; o app "PG Prime Vistoria" em `AppsClaude/pgprimevistoria` continua intocado e não há migração de dados dele)

## 1. Objetivo

PWA instalável, em português do Brasil, para vistoriadores em campo (pátio, guincho, reboque) registrarem o estado de um veículo pelo celular e gerarem um laudo em PDF no próprio aparelho. Funciona offline do começo ao fim da vistoria; os dados sobem sozinhos para o Supabase (fonte da verdade) quando há conexão. Front-end estático hospedado no Netlify.

**Critério de sucesso:** a lista de verificação da seção 17 inteira atendida, com destaque para: vistoria criada e finalizada em modo avião e sincronizada ao voltar a internet sem duplicar; RLS impedindo um usuário de ver dados de outro; PDF A4 legível abaixo de ~10 MB.

**Fora de escopo:** edição de vistoria finalizada; cadastro público de usuários; painel de administrador (só o comentário SQL de como liberar leitura); envio com o app fechado (ver decisão D2); numeração sem lacunas garantida.

## 2. Decisões principais

| # | Decisão | Motivo |
|---|---|---|
| D1 | HTML + CSS + JS puro (ES modules), sem framework e sem build obrigatório | O estado do formulário cabe em módulos simples; nada a compilar, funciona até no Netlify Drop |
| D2 | Sincronização roda **na página** (abordagem A). Background Sync, quando existe, só acorda a aba aberta | Background Sync só existe no Chrome/Android; no iPhone não existe. Comportamento igual em todos os aparelhos e código mais simples. Limitação aceita: com o app fechado, o envio espera o app ser aberto |
| D3 | Bibliotecas locais em `vendor/`, com a versão no nome do arquivo: `jspdf-<v>.umd.min.js`, `jspdf-autotable-<v>.min.js`, `supabase-<v>.umd.js` | Offline sem CDN; nome versionado permite cache `immutable` com segurança. jsPDF/autotable são carregados só ao gerar PDF |
| D4 | Fonte do sistema (sem fonte web); PDF em Helvetica | Nada a baixar, CSP `'self'`; Helvetica (WinAnsi) cobre os acentos do português |
| D5 | Rotas por hash: `#/nova`, `#/vistorias`, `#/vistoria/<id>` | Botão voltar do Android funciona no app instalado; sem redirect no Netlify |
| D6 | O mesmo `uuid` (gerado no aparelho) é id do rascunho, da vistoria e parte dos caminhos do Storage | Reenvio idempotente |
| D7 | `inspections` é gravada com "existe? então não insere" (sem `upsert`); `damages` e `damage_photos` com `upsert` | `upsert` avalia o default/trigger antes do conflito e consumiria um número da sequence a cada reenvio |
| D8 | Coluna `realizada_em` (data e hora da finalização no aparelho, com fuso) separada de `created_at` (chegada no servidor) | O envio pode acontecer horas depois; lista, detalhe, PDF e filtro usam `realizada_em` |
| D9 | Assinaturas em PNG; fotos em JPEG | PNG fica menor e mais nítido para traço |
| D10 | Área e tipo da avaria **sem** `check` no banco | As listas vivem só em `config.js`; mudá-las não exige migration |
| D11 | `env.js` editado à mão é o caminho **padrão**; `scripts/gerar-env.js` é opcional (build no Netlify) e também carimba a `CACHE_VERSION` | Funciona sem build; quem quiser automatizar não edita arquivo nem esquece de trocar a versão |
| D12 | Miniatura `frente_mini.jpg` (~320 px) enviada junto com as fotos | A lista não baixa 20 fotos inteiras por página |
| D13 | PDF gerado assim que o detalhe abre e regenerado quando chega o número oficial | No iPhone, `navigator.share` só funciona se o arquivo já estiver pronto no momento do toque |

## 3. Estrutura de arquivos

```
vistoria-veicular/
├── index.html              # shell: topo, <main>, barra de abas, região aria-live, aviso de versão/instalação
├── styles.css
├── manifest.webmanifest
├── sw.js                   # CACHE_VERSION, pré-cache, fetch, SKIP_WAITING, sync → postMessage
├── netlify.toml
├── serve.json              # mesmos cabeçalhos do Netlify para `npx serve` local (testar CSP/SW)
├── package.json            # só "type": "module" e o script "test"; nenhuma dependência
├── env.js / env.example.js # SUPABASE_URL e SUPABASE_ANON_KEY
├── config.js               # listas e parâmetros editáveis
├── app.js                  # inicialização, rotas, barra de abas, indicadores, SW, instalar
├── auth.js                 # login/sair, sessão, usuário em cache
├── supabase.js             # único módulo que conhece o Supabase
├── storage.js              # IndexedDB
├── sync.js                 # fila de envio
├── photos.js               # captura, compressão, miniatura, visualizador em tela cheia
├── signature.js            # canvas de assinatura
├── pdf.js                  # laudo → Blob
├── validacao.js            # regras puras do formulário
├── formatos.js             # funções puras: datas, km, provisório, nomes de arquivo e caminhos
├── ui.js                   # ícones, diálogos, avisos (toast), helpers de DOM
├── views/
│   ├── login.js
│   ├── nova.js             # formulário em 4 etapas + editor de avaria
│   ├── vistorias.js        # lista, busca, filtro, rascunhos
│   └── detalhe.js          # leitura, PDF, compartilhar, excluir
├── vendor/                 # bibliotecas (D3)
├── icons/                  # icon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon-180.png
├── scripts/
│   ├── gerar-env.js        # opcional, build do Netlify (D11)
│   └── gerar-icones.js     # gera os PNGs dos ícones (sem dependências)
├── supabase/
│   ├── config.toml
│   ├── migrations/0001_init.sql
│   └── tests/rls.sql       # roteiro de conferência de RLS (dois usuários)
├── tests/                  # node --test
└── README.md               # instruções + lista de verificação final
```

`formatos.js`, `validacao.js`, `sync.js` e `config.js` não tocam no DOM nem em APIs do navegador ao serem importados, para rodarem no Node nos testes.

## 4. Módulos e interfaces

### config.js
```js
export const CHECKLIST_ITENS = ["Antena", "Calotas", "Manual do proprietário", "Triângulo", "Equipamento de som",
  "Estepe/Kit", "Bateria", "Documento", "Macaco", "Chave de roda", "Extintor", "Tapetes", "Carregador"];
export const AREAS_AVARIA = ["Para-choque dianteiro", "Capô", "Para-brisa", "Teto", "Porta dianteira esquerda",
  "Porta dianteira direita", "Porta traseira esquerda", "Porta traseira direita", "Paralama dianteiro esquerdo",
  "Paralama dianteiro direito", "Lateral traseira esquerda", "Lateral traseira direita", "Tampa do porta-malas",
  "Vidro traseiro", "Para-choque traseiro", "Faróis/Lanternas", "Retrovisores", "Rodas/Pneus", "Interior", "Outro"];
export const TIPOS_AVARIA = ["Amassado", "Arranhão", "Risco", "Trinca", "Quebrado", "Faltando peça", "Ferrugem",
  "Mancha", "Descascado/Pintura danificada", "Outro"];
export const GRAVIDADES = [
  { valor: "Leve", cor: "#F5C400", texto: "#1A1A1A" },
  { valor: "Moderada", cor: "#F28C28", texto: "#1A1A1A" },
  { valor: "Grave", cor: "#C62828", texto: "#FFFFFF" },
];
export const COMBUSTIVEIS = ["Gasolina", "Flex", "Diesel", "Elétrico", "Híbrido"];
export const FOTOS_VEICULO = [ { chave: "frente", rotulo: "Frente" }, { chave: "traseira", rotulo: "Traseira" }, { chave: "chassi", rotulo: "Chassi" } ];
export const FOTO = { maxLado: 1280, qualidade: 0.7, miniLado: 320 };
export const PDF_FOTO = { maxLado: 1000, maxLadoMuitas: 800, limiteMuitas: 20, qualidade: 0.75 };
export const ITENS_POR_PAGINA = 20;
export const DIAS_CACHE_FOTOS = 30;
```
Se uma lista mudar depois, vistorias antigas continuam exibindo o que foi salvo nelas (o checklist é exibido na ordem de `CHECKLIST_ITENS`, seguido de itens salvos que não existem mais na lista).

### formatos.js (puro)
- `formatarDataHora(iso) → "dd/mm/aaaa HH:mm"` (fuso do aparelho); `formatarData(iso) → "dd/mm/aaaa"`; `dataArquivo(iso) → "aaaa-mm-dd"`.
- `formatarKm(n) → "123.456"`; `lerKm(texto) → number | null` (só dígitos).
- `normalizarChassi(texto) → string` (remove o que não for letra/número, maiúsculas, corta em 6).
- `idProvisorio(uuid) → "Provisório 8F3A"` (4 primeiros caracteres hexadecimais, maiúsculos).
- `nomeVistoria(v) → v.numero ?? idProvisorio(v.id)`.
- `nomeArquivoPdf(v) → "Vistoria_<chassi>_<aaaa-mm-dd>.pdf"` (data de `realizadaEm`).
- `chaveLocal(id, nome) → "<id>/<nome>"`; `caminhoRemoto(userId, id, nome) → "<userId>/<id>/<nome>"`.
- Nomes de arquivo fixos: `frente.jpg`, `frente_mini.jpg`, `traseira.jpg`, `chassi.jpg`, `assinatura_vistoriador.png`, `assinatura_motorista.png`, `avaria_<fotoId>.jpg`.

### validacao.js (puro)
- `validarAvaria(avaria) → string[]` (mensagens; área, tipo e gravidade obrigatórios).
- `faltandoParaFinalizar(rascunho) → Array<{ etapa: 1|2|3|4, campo: string, mensagem: string }>`, onde `campo` é o id do elemento a focar. Regras:
  - Etapa 1: chassi vazio → "Informe o chassi"; com menos de 6 → "O chassi deve ter 6 caracteres (faltam N)"; marca, modelo, cor → "Informe a marca/o modelo/a cor"; km vazio → "Informe o km"; combustível → "Escolha o combustível"; cada foto ausente → "Falta a foto: Frente" (Traseira, Chassi).
  - Etapa 2: itens sem marcação agrupados → "Checklist: 3 itens sem marcação (Antena, Bateria, Macaco)".
  - Etapa 3: sem avarias e sem o toggle → "Confirme “Veículo sem avarias” ou adicione uma avaria".
  - Etapa 4: "Informe o nome do vistoriador", "Falta a assinatura do vistoriador", idem para o motorista do reboque.
- `situacaoEtapa(rascunho, etapa) → "completa" | "pendente"` (para ✓/! no indicador).

### storage.js (IndexedDB `vistoria-veicular`, versão 1)
Object stores:
- `rascunhos` (keyPath `id`, índice `userId`)
- `vistorias` (keyPath `id`, índices `userId`, `status`)
- `arquivos` (chave = `chaveLocal(id, nome)`, valor `Blob`)
- `exclusoes` (keyPath `id`: `{ id, userId, criadoEm }`)
- `meta` (chave string): `usuario` (`{ id, email }`), `ultimoVistoriador:<userId>`

API (todas assíncronas):
`salvarRascunho(r)`, `obterRascunho(id)`, `listarRascunhos(userId)`, `excluirRascunho(id)` (apaga também os arquivos `id/*`);
`salvarVistoria(v)`, `obterVistoria(id)`, `listarVistorias(userId)`, `excluirVistoriaLocal(id)` (com arquivos);
`salvarArquivo(chave, blob)`, `obterArquivo(chave)`, `excluirArquivos(prefixoId)`;
`enfileirarExclusao(item)`, `listarExclusoes(userId)`, `removerExclusao(id)`;
`obterMeta(chave)`, `salvarMeta(chave, valor)`;
`finalizarRascunho(rascunho, realizadaEm) → vistoria` (numa transação: cria a vistoria `pendente` e apaga o rascunho; os arquivos ficam, pois as chaves são as mesmas);
`limparCacheSincronizado(userId)` (vistorias `sincronizada` do usuário e seus arquivos);
`limparFotosAntigas(dias)` (arquivos de vistorias `sincronizada` cujo `arquivosSalvosEm` passou de `dias`; nunca toca em pendentes/erro);
`pedirPersistencia()` (`navigator.storage.persist()`, uma vez).
Erro de cota (`QuotaExceededError`) vira `ArmazenamentoCheioError` (classe exportada).

**Formato da vistoria (local):**
```js
{
  id, userId, numero: null | "VIS-000123", realizadaEm: "ISO com fuso",
  chassi, marca, modelo, cor, km: Number, combustivel,
  checklist: { [item]: "presente" | "ausente" }, checklistObs: "",
  semAvarias: Boolean,
  avarias: [{ id, area, tipo, gravidade, descricao, fotos: [fotoId] }],
  vistoriadorNome, motoristaNome,
  status: "pendente" | "sincronizada" | "erro" | "excluindo",
  erro: null | "mensagem em português",
  enviados: ["frente.jpg", ...],          // arquivos já enviados ao Storage
  origem: "local" | "remota",
  completa: Boolean,                      // remota: true depois de baixar o detalhe
  avariasQtd: Number,                     // usado nos cartões de vistorias remotas
  arquivosSalvosEm: "ISO" | null,
  atualizadoEm: "ISO"
}
```
**Rascunho:** `{ id, userId, etapa, criadoEm, atualizadoEm, dados }`, em que `dados` tem os mesmos campos do formulário da vistoria (sem `numero`, `status`, `realizadaEm`), mais `fotos: { frente: bool, traseira: bool, chassi: bool }` e `assinaturas: { vistoriador: bool, motorista: bool }`. Os Blobs ficam em `arquivos` com as mesmas chaves que a vistoria usará.

### supabase.js
Cria o cliente com `window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })` (UMD local). Converte entre o formato do banco (snake_case) e o local. Exporta o objeto `remoto`:
- `entrar(email, senha)`, `sair()`, `obterSessao()`, `aoMudarSessao(cb)`
- `enviarArquivo(caminho, blob)` (`upsert: true`, `contentType` do Blob)
- `vistoriaExiste(id) → { numero } | null`
- `inserirVistoria(linha) → { numero }`
- `gravarAvarias(linhas)`, `gravarFotosAvaria(linhas)` (`upsert`, `onConflict: "id"`, `ignoreDuplicates: true`)
- `listarVistorias({ pagina, busca, de, ate }) → { itens, temMais }`: colunas `id, numero, realizada_em, chassi, marca, modelo, foto_frente, damages(count)`, ordenado por `realizada_em desc`, `range` de `ITENS_POR_PAGINA`. A busca usa `or(chassi.ilike, marca.ilike, modelo.ilike, numero.ilike)`, escapando `,` `(` `)` `%` `*` do termo.
- `obterVistoriaCompleta(id)` (vistoria + `damages(*, damage_photos(*))`)
- `urlsAssinadas(caminhos, segundos = 3600) → Map<caminho, url>` (`createSignedUrls`)
- `baixarArquivo(caminho) → Blob`
- `excluirVistoriaRemota(userId, id)`: apaga a linha (as tabelas filhas saem em cascata), depois lista `<userId>/<id>/` no bucket e remove os arquivos. As duas etapas são idempotentes. A linha sai primeiro para nunca sobrar uma vistoria visível com fotos quebradas.
- `classificarErro(e) → { tipo: "rede" | "sessao" | "servidor", mensagem }`: falha de fetch, `navigator.onLine === false`, `AuthRetryableFetchError`, 5xx e 429 → `rede`; 401 ou JWT expirado depois da tentativa de renovação → `sessao`; demais 4xx e violação de RLS → `servidor`. Mensagens em português.

### auth.js
- `iniciarAuth() → usuario | null`. Lê `remoto.obterSessao()`. Com sessão → salva `meta.usuario = { id, email }` e devolve. Sem sessão **e** com erro de rede (offline com token vencido; o supabase-js não apaga a sessão em erro de rede) **e** `meta.usuario` presente → devolve o usuário em cache (modo offline). Sem sessão e sem erro → `null` (tela de login).
- `entrar(email, senha)`, `sair()`. `sair()` usa `signOut({ scope: "local" })`; se falhar offline, remove a chave `sb-*-auth-token` do `localStorage`. Depois chama `limparCacheSincronizado(userId)` e apaga `meta.usuario`. Rascunhos, pendentes, erro e exclusões do usuário ficam guardados até ele entrar de novo.
- `usuarioAtual()`, `aoMudar(cb)` (SIGNED_OUT vindo do servidor também leva ao login).

### sync.js
`criarSincronizador({ storage, remoto, usuarioAtual, estaOnline })` (dependências injetadas, para testar com dublês) → `{ sincronizar(), eventos }`:
- `eventos` é um `EventTarget` que emite `mudou` com `{ pendentes, erros, sincronizando, sessaoExpirada }`.
- `sincronizar()` é single-flight (uma promessa em andamento por vez) e usa `navigator.locks.request("vistoria-sync", { ifAvailable: true })` quando existir (se outra aba tiver o lock, não faz nada).
- Para cada exclusão em `exclusoes` do usuário: `remoto.excluirVistoriaRemota` → `removerExclusao` → `excluirVistoriaLocal`.
- Para cada vistoria `pendente` ou `erro` do usuário, em ordem de `realizadaEm`:
  1. Envia ao Storage os arquivos que não estão em `enviados` (fotos, miniatura, fotos de avaria, assinaturas), atualizando `enviados` a cada sucesso.
  2. `vistoriaExiste(id)`; se não existir, `inserirVistoria(linha)` (sem `numero`; com `user_id`, `realizada_em` e os caminhos remotos).
  3. `gravarAvarias`, depois `gravarFotosAvaria`.
  4. `status = "sincronizada"`, grava `numero`, `erro = null`, `arquivosSalvosEm = agora`.
  - Erro `rede` → continua `pendente` e para a rodada. Erro `sessao` → continua `pendente`, para a rodada e emite `sessaoExpirada`. Erro `servidor` → `status = "erro"` com a mensagem e segue para a próxima vistoria.
  - Arquivo local ausente (não deveria acontecer, porque pendentes nunca têm fotos apagadas) → `status = "erro"` com "A foto <rótulo> não foi encontrada neste aparelho."
  - As exclusões são processadas antes dos envios, e vistorias com `status = "excluindo"` são puladas. Antes de gravar um novo status, o sync relê a vistoria; se ela tiver virado `excluindo` no meio do envio, o status não é alterado.
- **Gatilhos (em `app.js`):** depois de finalizar; evento `online`; ao iniciar o app (depois do auth); `visibilitychange` para visível; mensagem `{ tipo: "sincronizar" }` vinda do SW; botão "Tentar novamente". Não há timer em loop.
- Ao finalizar, e quando um envio falha por rede, `registration.sync.register("enviar-vistorias")` se existir.

### photos.js
- `capturarFoto(input) → Promise<File | null>` usando `<input type="file" accept="image/*" capture="environment">`.
- `comprimir(file, { maxLado, qualidade }) → Blob` (`createImageBitmap(file, { imageOrientation: "from-image" })`, fundo branco, JPEG). `gerarMiniatura(blob) → Blob` (320 px).
- `verificarCamera() → "negada" | "ok" | "desconhecido"` (Permissions API; ignora navegadores sem suporte).
- `abrirVisualizador(fotos, indice)`: `<dialog>` em tela cheia com legenda, setas, deslizar e Esc.
- Foto que não decodifica (ex.: HEIC no desktop) → "Não foi possível ler esta foto. Tente tirar outra."

### signature.js
`montarAssinatura(canvas, { aoMudar })` → `{ limpar(), carregar(blob), vazio() }`. Pointer Events com `setPointerCapture`, `touch-action: none`, tamanho físico × `devicePixelRatio`, traço preto de 2,5 px com cantos arredondados. Ao soltar o dedo, exporta PNG (`canvas.toBlob`) para `aoMudar(blob)`. Ao redimensionar a tela, redesenha a imagem atual.

### pdf.js
`gerarPdf(vistoria, obterImagem) → Promise<{ blob, nomeArquivo }>`, em que `obterImagem(nome) → Blob | null`. Carrega `vendor/jspdf…` e `vendor/jspdf-autotable…` sob demanda (injeção de `<script>` uma vez). Layout na seção 11.

### ui.js
`$`, `$$`, `esc` (escape de HTML), `icone(nome)` (SVG inline com `aria-hidden` + texto visível ou `aria-label` no botão), `avisar(texto, tipo)` (toast numa região `aria-live="polite"`; erros em `role="alert"`), `confirmar({ titulo, texto, ok, cancelar, perigo }) → Promise<boolean>` (via `<dialog>`). Templates não usam atributo `style` (CSP `style-src 'self'`).

### app.js
Lê `env.js`; se a URL ou a chave estiverem vazias ou com o texto do modelo, mostra a tela "Configure o arquivo env.js (veja o README)". Registra o SW, cria `auth` e `sync`, monta topo e barra de abas, liga as rotas, gerencia "Nova versão disponível — Atualizar" e "Instalar app", roda `limparFotosAntigas` ao iniciar.

## 5. Backend Supabase — `supabase/migrations/0001_init.sql`

Pronto para colar no SQL Editor ou para `supabase db push`. Conteúdo:

1. **Sequence e número:** `create sequence public.inspections_numero_seq;` e a função `public.gerar_numero_vistoria()` → `'VIS-' || lpad(n::text, 6, '0')` quando `n < 1000000`, senão `'VIS-' || n` (nunca corta dígitos). `search_path` fixo. O papel `authenticated` recebe `usage` na sequence.
2. **`inspections`:** `id uuid primary key`, `numero text not null unique`, `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `chassi text not null check (chassi ~ '^[A-Z0-9]{6}$')`, `marca`, `modelo`, `cor` `text not null` (com `check (btrim(x) <> '')`), `km integer not null check (km >= 0)`, `combustivel text not null check (combustivel in ('Gasolina','Flex','Diesel','Elétrico','Híbrido'))`, `checklist jsonb not null check (jsonb_typeof(checklist) = 'object')`, `checklist_obs text`, `sem_avarias boolean not null default false`, `vistoriador_nome text not null`, `motorista_nome text not null`, `foto_frente`, `foto_traseira`, `foto_chassi`, `assinatura_vistoriador`, `assinatura_motorista` (`text not null`, caminhos no bucket), `realizada_em timestamptz not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
3. **Gatilhos:** `before insert` → `new.numero := gerar_numero_vistoria()` (o cliente não escolhe o número). `before update` → mantém `numero`, `user_id`, `created_at` e `realizada_em` antigos e faz `updated_at := now()`.
4. **`damages`:** `id uuid primary key`, `inspection_id uuid not null references inspections(id) on delete cascade`, `area text not null`, `tipo text not null`, `gravidade text not null check (gravidade in ('Leve','Moderada','Grave'))`, `descricao text`, `created_at timestamptz not null default now()`.
5. **`damage_photos`:** `id uuid primary key`, `damage_id uuid not null references damages(id) on delete cascade`, `path text not null`, `created_at timestamptz not null default now()`.
6. **Índices:** `inspections(chassi)`, `inspections(created_at desc)`, `inspections(realizada_em desc)`, `inspections(user_id)`, `damages(inspection_id)`, `damage_photos(damage_id)`.
7. **RLS** ativado nas três tabelas:
   - `inspections`: policies `select`, `insert` (`with check`), `update` (`using` + `with check`) e `delete` com `user_id = (select auth.uid())`, todas `to authenticated`.
   - `damages`: as quatro operações com `exists (select 1 from inspections i where i.id = inspection_id and i.user_id = (select auth.uid()))`.
   - `damage_photos`: as quatro com `exists (select 1 from damages d join inspections i on i.id = d.inspection_id where d.id = damage_id and i.user_id = (select auth.uid()))`.
   - Comentário com exemplo de leitura total para administrador: policy `select` adicional com `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` nas três tabelas e no Storage, mais o comando para marcar um usuário como admin (`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = '...'`).
8. **Storage:** `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('vistorias', 'vistorias', false, 5242880, array['image/jpeg','image/png']) on conflict (id) do nothing;`. Policies em `storage.objects` (`select`, `insert`, `update`, `delete`, `to authenticated`) com `bucket_id = 'vistorias' and (storage.foldername(name))[1] = (select auth.uid())::text`. A migration não roda `alter table storage.objects enable row level security`: o RLS já vem ligado e o comando falharia por permissão.

**`supabase/config.toml`:** `project_id = "vistoria-veicular"`, `[db] major_version = 17`, `[auth] site_url = "http://localhost:3000"`, `additional_redirect_urls = ["http://localhost:3000", "https://SEU-SITE.netlify.app"]`, `enable_signup = false`, `[auth.email] enable_signup = false`, `[storage] file_size_limit = "5MiB"`. As chaves são conferidas contra a documentação da Supabase CLI na implementação.

**`supabase/tests/rls.sql`:** roteiro que, num banco com a migration aplicada, simula dois usuários (`set local role authenticated` + `request.jwt.claims`), cria uma vistoria para cada um e confere que um não lê, não altera e não apaga a do outro, e que o `numero` não muda num `update`.

## 6. Autenticação (UI)
- Tela "Entrar" com e-mail e senha (`autocomplete="username"`/`"current-password"`), botão "Entrar", sem link de cadastro. Texto de apoio: "Seu acesso é criado pelo administrador."
- Erros: "E-mail ou senha incorretos." / "Sem internet: o primeiro acesso precisa de conexão." / "Não foi possível entrar. Tente novamente em instantes."
- Sessão persistente; offline vale a regra de `iniciarAuth()`.
- "Sair" fica no menu do topo. Com pendentes: "Há N vistorias ainda não enviadas. Elas ficam guardadas neste aparelho e serão enviadas quando você entrar de novo. Sair mesmo assim?"

## 7. Telas e fluxos

### Visual
- Tema claro de alto contraste: fundo `#FFFFFF`/`#F4F6F7`, texto `#111`, cor principal azul-petróleo `#0B4F6C` (também `theme_color`), que não se confunde com as cores das gravidades.
- Status sempre com ícone e texto: **Sincronizada** (✓, verde `#1B7F3B`), **Pendente** (↻, âmbar escuro `#8A5A00` sobre `#FFF4D6`), **Erro ao enviar** (✕, `#B3261E` sobre `#FDECEA`).
- Fonte do sistema, corpo de 16 px ou mais, alvos de toque ≥ 48 px, foco visível de 3 px. Em telas largas, coluna central de no máximo 720 px.
- **Topo:** "Vistoria Veicular", indicador online/offline ("Offline" com ponto cinza; online, mostra "N pendentes" quando houver) e menu com "Instalar app" (quando disponível) e "Sair".
- **Barra inferior fixa:** "Nova vistoria" e "Vistorias" (com selo do número de pendentes). Respeita `env(safe-area-inset-bottom)`.

### Aba "Nova vistoria" (`#/nova`)
- Abre o rascunho mais recente do usuário; se não houver, cria um (novo `uuid`). Abrir `#/nova?novo=1` sempre cria outro (o anterior fica em Rascunhos).
- Indicador de etapas "1 Veículo · 2 Checklist · 3 Avarias · 4 Assinaturas", com toque para ir a qualquer etapa e ✓ ou ! (`situacaoEtapa`). A etapa atual fica salva no rascunho.
- Barra de ações fixa acima das abas: "Voltar" / "Avançar"; na etapa 4, "Finalizar vistoria". "Avançar" não bloqueia; erros aparecem nos campos já tocados (`aria-describedby` + `aria-live`).
- **Salvamento automático:** textos depois de 400 ms sem digitar; fotos, assinaturas, chips e botões na hora; `visibilitychange`/`pagehide` gravam o que estiver pendente. `beforeunload` só pede confirmação se houver gravação em andamento.

**Etapa 1 — Veículo:** Chassi (`type="text"`, `maxlength="6"`, `autocapitalize="characters"`, `normalizarChassi` a cada digitação, contador "4/6", erro ao sair do campo se tiver menos de 6); Marca; Modelo; Cor; Km (`inputmode="numeric"`, exibido como `123.456`); Combustível (5 chips grandes, `role="radiogroup"`). Fotos: 3 slots rotulados Frente/Traseira/Chassi. Vazio: ícone de câmera + rótulo; toque abre a câmera. Com foto: miniatura (toque abre em tela cheia) + botões "Refazer" e "Remover" (Remover pede confirmação). Antes de abrir a câmera, se `verificarCamera()` der "negada": "A câmera está bloqueada para este app. Libere em Configurações do navegador → Permissões → Câmera. Você ainda pode escolher uma foto da galeria."

**Etapa 2 — Checklist:** os itens de `CHECKLIST_ITENS`, cada um com botões segmentados "Presente" / "Ausente" (grupo de rádio; nenhum marcado por padrão; sem N/A). Contador "8 de 13". Atalhos "Marcar todos como Presente" e "Limpar" (Limpar pede confirmação se houver itens marcados). "Observação geral (opcional)" em textarea.

**Etapa 3 — Avarias:** toggle "Veículo sem avarias" e botão "+ Adicionar avaria". Ligar o toggle com avarias cadastradas → "Remover as N avarias registradas?"; adicionar uma avaria desliga o toggle. Cartões: área — tipo, selo colorido da gravidade, descrição resumida, número de fotos e a primeira miniatura; botões "Editar" e "Remover" (com confirmação).
- **Editor de avaria** (`<dialog>` em tela cheia, "Nova avaria"/"Editar avaria"): Área (select nativo grande), Tipo (select nativo grande), Gravidade (3 botões com as cores de `GRAVIDADES`), Descrição (textarea, placeholder "Ex.: amassado de 10 cm na parte inferior"), Fotos (botão "Adicionar foto", miniaturas com remover individual). "Salvar avaria" exige área, tipo e gravidade; sem foto → "Esta avaria está sem foto. Salvar mesmo assim?". "Cancelar" ou Esc com alterações → "Descartar as alterações desta avaria?". As fotos da avaria vão para `arquivos` ao serem tiradas; se a avaria nova for cancelada, são apagadas.

**Etapa 4 — Responsáveis e assinaturas:** dois blocos iguais, "Vistoriador" e "Motorista do reboque": nome (obrigatório; o do vistoriador vem com `ultimoVistoriador:<userId>`), quadro de assinatura com "Assine aqui", botão "Limpar assinatura" (com confirmação quando houver traço). Ao retomar um rascunho, a assinatura salva aparece no quadro. Texto: "A data e a hora serão registradas ao finalizar."

**Finalizar vistoria:**
1. `faltandoParaFinalizar()`. Se houver itens: diálogo "Falta preencher", agrupado por etapa; cada item é um botão que fecha o diálogo, vai para a etapa e foca o campo.
2. Tudo certo: `realizadaEm = new Date()` → `finalizarRascunho()` → `pedirPersistencia()` → salva `ultimoVistoriador` → navega para `#/vistoria/<id>?nova=1` → dispara `sincronizar()` e registra o Background Sync.

### Aba "Vistorias" (`#/vistorias`)
- **Rascunhos** (se houver), no topo: cartão com chassi/marca/modelo (ou "Sem dados ainda"), "Etapa N de 4" e "Atualizado em dd/mm/aaaa HH:mm"; botões "Continuar" e "Descartar" (com confirmação; apaga rascunho e fotos).
- **Busca** ("Buscar por chassi, marca, modelo ou número"), com 300 ms de espera: online consulta o Supabase; offline filtra o que está no aparelho. **Período:** chips "Hoje", "7 dias", "30 dias", "Todos" e "Personalizado" (campos "De" e "Até"). O filtro usa `realizada_em`.
- **Lista:** vistorias locais pendentes/erro do usuário + vistorias do cache + página do servidor (se online), sem repetir `id`, ordenadas por `realizadaEm` desc. Ao receber uma página, o cache local é atualizado. "Carregar mais" busca a página seguinte. O botão "Atualizar" no topo da aba recarrega do servidor e dispara `sincronizar()`.
- **Cartão:** miniatura da frente (blob local ou URL assinada de `frente_mini.jpg`; sem as duas, um ícone), número ou provisório, data e hora, marca e modelo, chassi, "N avarias" (ou "Sem avarias"), chip de status; no status Erro, a mensagem curta e o botão "Tentar novamente". Toque abre o detalhe.
- **Vazio:** "Nenhuma vistoria ainda" + botão "Fazer a primeira vistoria". Busca sem resultado: "Nenhuma vistoria encontrada para essa busca." Offline sem nada em cache: "Sem internet. As vistorias aparecem aqui quando você se conectar."

### Detalhe (`#/vistoria/<id>`)
- **Carregamento:** do IndexedDB. Se for `remota` e `completa = false`: online, baixa com `obterVistoriaCompleta` e baixa as imagens com `baixarArquivo` para `arquivos` (`arquivosSalvosEm = agora`); offline → "Conecte-se à internet para ver esta vistoria." Para exibir imagens que ainda não estão no aparelho, usa URLs assinadas.
- **Cabeçalho:** número (ou provisório), status, "Realizada em dd/mm/aaaa HH:mm". Com `?nova=1`: faixa "Vistoria salva. Enviando…" que vira "Vistoria enviada: VIS-000123" ou "Sem internet: será enviada quando a conexão voltar".
- **Conteúdo em leitura:** dados do veículo, as 3 fotos (toque → tela cheia), checklist com Presente/Ausente (Ausente destacado), observação, avarias com fotos, ou "Veículo sem avarias registradas", assinaturas com nomes.
- **Ações:** "Baixar PDF", "Compartilhar", "Excluir"; com `?nova=1`, também "Nova vistoria" (`#/nova?novo=1`).
- **PDF pré-gerado** (D13): ao abrir, gera o PDF em segundo plano. Os botões mostram "Preparando PDF…" até ficar pronto. Quando chega o número oficial, gera de novo. Compartilhar: `navigator.canShare({ files })` → `navigator.share({ files: [File], title })`; sem suporte → baixa e avisa "Compartilhamento indisponível neste navegador; o PDF foi baixado." Imagem faltando offline → "Algumas fotos ainda não estão neste aparelho. Conecte-se à internet para gerar o PDF."
- **Excluir:** "Excluir a vistoria X? Isso apaga também as fotos e assinaturas no servidor e não pode ser desfeito."
  - Offline e com `enviados` vazio (nada chegou ao servidor) → apaga só no aparelho.
  - Todos os outros casos → `status = "excluindo"` (some da lista na hora), `enfileirarExclusao` e `sincronizar()`. A rodada de sincronização, que tem o lock, apaga no servidor e depois no aparelho. Como a exclusão remota é idempotente, funciona até se a vistoria nunca tiver chegado lá. Offline, fica na fila. Passar sempre pela fila evita disputa com um envio em andamento.

## 8. Fotos e assinaturas — armazenamento
- Foto do veículo: comprimir (1280 px, JPEG 0,7) → `arquivos[id/frente.jpg]`; para a frente, também `frente_mini.jpg` (320 px).
- Foto de avaria: `fotoId = uuid` → `arquivos[id/avaria_<fotoId>.jpg]`.
- Assinatura: PNG → `arquivos[id/assinatura_vistoriador.png]` / `assinatura_motorista.png`.
- No servidor, os mesmos nomes em `<userId>/<id>/`. As colunas `foto_*` e `assinatura_*` e `damage_photos.path` guardam o caminho completo.

## 9. Tratamento de erros (mensagens)
| Situação | Mensagem |
|---|---|
| Armazenamento cheio | "Armazenamento do aparelho cheio. Envie as vistorias pendentes e exclua vistorias antigas para liberar espaço." |
| Câmera bloqueada | texto da etapa 1 |
| Foto ilegível | "Não foi possível ler esta foto. Tente tirar outra." |
| Falha no PDF | "Não foi possível gerar o PDF. Tente novamente. (detalhe técnico)" |
| Sem rede ao sincronizar | status Pendente; topo "Offline" |
| Sessão vencida | faixa "Sua sessão expirou. Entre novamente para enviar as vistorias pendentes." com botão "Entrar" (os dados do aparelho são mantidos) |
| Servidor recusou | status "Erro ao enviar" + mensagem + "Tentar novamente" |
| IndexedDB indisponível (ex.: navegação privada antiga) | "Este navegador não permite salvar dados offline. Use o app instalado ou outro navegador." |
| `env.js` não configurado | tela "Configure o arquivo env.js (veja o README)" |

## 10. Acessibilidade
Labels reais (`<label for>`) em todos os campos; grupos com `fieldset`/`legend` (combustível, cada item do checklist, gravidade); `aria-live` nos erros de campo e nos avisos; foco visível; ícones decorativos com `aria-hidden` e texto visível ou `aria-label` nos botões só com ícone; `<dialog>` com foco preso e Esc; contraste AA ou mais em todas as combinações de cor (inclusive os selos de gravidade e status); `lang="pt-BR"`.

## 11. PDF (A4, retrato, margens de 15 mm, Helvetica)
1. **Cabeçalho (primeira página):** "Laudo de Vistoria Veicular"; "Vistoria nº VIS-000123" (ou "Provisório 8F3A — aguardando sincronização"); "Realizada em dd/mm/aaaa HH:mm"; linha divisória.
2. **Dados do veículo:** grade 3 × 2: Chassi, Marca, Modelo, Cor, Km (`123.456 km`), Combustível.
3. **Fotos do veículo:** 3 lado a lado em molduras iguais, imagem inteira centralizada (sem corte, proporção mantida), legendas Frente/Traseira/Chassi.
4. **Checklist:** `autoTable` com colunas "Item" e "Situação", na ordem do config; células "Ausente" em fundo vermelho claro (`#FDECEA`) e texto `#B3261E`. Em seguida, "Observação: …" se houver.
5. **Avarias:** "Veículo sem avarias registradas" ou, para cada avaria, um cartão: faixa lateral na cor da gravidade, "Avaria N", área, tipo, selo colorido da gravidade, descrição e fotos em grade de 3 por linha (proporção mantida).
6. **Assinaturas:** dois blocos lado a lado: imagem da assinatura ajustada à caixa, linha, nome, função ("Vistoriador" / "Motorista do reboque") e "dd/mm/aaaa HH:mm".
7. **Rodapé em todas as páginas** (desenhado no fim): "Vistoria nº X — página N de M".

**Quebras de página:** cada bloco (título de seção + primeiro conteúdo, linha de fotos, cartão de avaria, bloco de assinaturas) tem a altura calculada antes de ser desenhado e vai para a página seguinte se não couber. Um cartão de avaria maior que uma página quebra entre as linhas de fotos, nunca no meio de uma foto. `autoTable` com `rowPageBreak: "avoid"`; se a tabela inteira couber numa página nova mas não no espaço restante, começa na página nova.

**Tamanho:** cada imagem é reamostrada para 1000 px no maior lado (800 px quando a vistoria tem mais de 20 fotos), JPEG 0,75, `compress: true`. Meta: menos de ~10 MB. Nome: `Vistoria_<chassi>_<aaaa-mm-dd>.pdf`.

## 12. PWA
- **manifest.webmanifest:** `name: "Vistoria Veicular"`, `short_name: "Vistoria"`, `lang: "pt-BR"`, `start_url: "./#/nova"`, `scope: "./"`, `display: "standalone"`, `orientation: "portrait"`, `theme_color: "#0B4F6C"`, `background_color: "#FFFFFF"`, ícones 192, 512 e 512 `maskable`. Em `index.html`: `apple-touch-icon` 180 e `meta theme-color`.
- **Ícones:** desenho próprio, uma prancheta branca com check azul-petróleo sobre um quadrado arredondado azul-petróleo. `icons/icon.svg` é usado como favicon. Os PNGs (`icon-192.png`, `icon-512.png`, `maskable-512.png` com o desenho dentro da zona segura de 80% e `apple-touch-icon-180.png`) são gerados por `scripts/gerar-icones.js`. É um script Node sem dependências: desenha a mesma geometria com supersampling e grava o PNG com `node:zlib`, então pode ser refeito em qualquer máquina com `node scripts/gerar-icones.js`.
- **sw.js:** `const CACHE_VERSION = "v1"` e a lista `ARQUIVOS` (todos os arquivos do app, `views/*`, `vendor/*`, ícones, manifest, `env.js`).
  - `install`: `cache.addAll(ARQUIVOS)`, sem `skipWaiting` automático.
  - `activate`: apaga caches com outro nome e chama `clients.claim()`.
  - `fetch`: só `GET` do mesmo domínio. Navegação → `index.html` do cache (rede como reserva). Demais → cache primeiro, rede como reserva. Requisições a outros domínios (Supabase) não passam pelo SW.
  - `message { tipo: "SKIP_WAITING" }` → `skipWaiting()`.
  - `sync` com tag `enviar-vistorias` → `postMessage({ tipo: "sincronizar" })` para as janelas abertas.
- **Atualização:** quando há um SW esperando, aparece a faixa "Nova versão disponível — Atualizar". O toque envia `SKIP_WAITING`; no `controllerchange`, a página recarrega uma vez. Nada recarrega sem o toque, e o rascunho está sempre salvo.
- **Instalar:** `beforeinstallprompt` guardado → item "Instalar app" no menu e faixa discreta na primeira visita. No iPhone/iPad fora do modo standalone: faixa "Para instalar: toque em Compartilhar e depois em Adicionar à Tela de Início", que some ao fechar (lembrado em `localStorage`, só como preferência visual).

## 13. Netlify
**netlify.toml:**
- `[build] publish = "."`, sem `command`; linha comentada `# command = "node scripts/gerar-env.js"`.
- `[[headers]] for = "/*"`: `X-Content-Type-Options = "nosniff"`, `Referrer-Policy = "strict-origin-when-cross-origin"`, `Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"`.
- `/sw.js`: `Cache-Control = "no-cache"`.
- `/manifest.webmanifest`: `Content-Type = "application/manifest+json"`.
- `/icons/*` e `/vendor/*`: `Cache-Control = "public, max-age=31536000, immutable"`.
- HTML/JS/CSS ficam com o padrão do Netlify (revalidar sempre). `Cache-Control` não é posto em `/*` para não se misturar com as regras específicas; o comportamento de regras sobrepostas é conferido na documentação do Netlify na implementação.
- Sem redirect de SPA (rotas por hash).

**serve.json:** os mesmos cabeçalhos, para que `npx serve` local aplique CSP e cache iguais aos do Netlify.

**scripts/gerar-env.js:** lê `SUPABASE_URL` e `SUPABASE_ANON_KEY` de `process.env`; se faltar alguma, encerra com erro claro ("Defina SUPABASE_URL e SUPABASE_ANON_KEY em Site settings → Environment variables"); escreve `env.js`; troca a linha `CACHE_VERSION` do `sw.js` por `"v-" + (COMMIT_REF ?? Date.now()).slice(0, 8)`.

**env.js / env.example.js:**
```js
export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_ANON_KEY = "SUA-ANON-KEY";
```
Aceita a anon key ou a publishable key (`sb_publishable_…`) dos projetos novos. Nunca a service_role/secret key; o README avisa.

## 14. README
Instruções curtas e numeradas:
1. **Supabase:**
   1. Criar o projeto.
   2. Rodar a migration: SQL Editor → colar `0001_init.sql`, ou `npx supabase link --project-ref …` + `npx supabase db push`.
   3. Criar o primeiro usuário: Authentication → Users → Add user → Create new user, com "Auto Confirm User".
   4. Copiar Project URL e anon/publishable key para `env.js`.
   5. Em Authentication → URL Configuration, preencher Site URL e Redirect URLs (URL do Netlify e `http://localhost:3000`).
   6. Opcional: rodar `supabase/tests/rls.sql`.
2. **Rodar localmente:** `npx serve .` → `http://localhost:3000`. Para testar no celular, use um deploy do Netlify, porque o SW exige HTTPS fora do localhost.
3. **Publicar no Netlify:** GitHub → Add new site → Import from Git, ou Netlify Drop. Conferir o `netlify.toml`. Se usar o script, cadastrar as variáveis e ativar o `command`. Copiar a URL `*.netlify.app` para o Supabase.
4. **Instalar no celular:** abrir a URL, entrar, "Instalar app" ou "Adicionar à Tela de Início".
5. **Atualizar:** a cada deploy, trocar `CACHE_VERSION` no `sw.js` (automático com o script); os usuários veem "Nova versão disponível — Atualizar".
6. **Editar listas:** `config.js`.

Depois vem a lista de verificação final (seção 17), item por item, com o arquivo onde cada requisito está.

## 15. Testes
- **Unitários (`npm test` → `node --test tests/`, sem dependências):**
  - `formatos.test.js`: datas, km, chassi, provisório, nome do PDF, caminhos.
  - `validacao.test.js`: cada regra de `faltandoParaFinalizar` e `validarAvaria`.
  - `sync.test.js`, com dublês em memória de `storage` e `remoto`: ordem arquivos → inspeção → avarias → fotos de avaria; reenvio depois de queda em cada etapa sem inserir a vistoria duas vezes nem reenviar arquivos já marcados; erro de rede → pendente e para; erro de sessão → pendente + `sessaoExpirada`; erro do servidor → erro e segue; exclusões; single-flight.
  - `gerar-env.test.js`: gera `env.js` e troca a `CACHE_VERSION` numa cópia temporária.
- **Banco:** com Docker ligado, `npx supabase start` + `npx supabase db reset` aplica a migration localmente e `supabase/tests/rls.sql` confere RLS e a numeração. Se o Docker não estiver disponível, a conferência fica para o projeto do usuário, com o roteiro do README.
- **Navegador (painel interno, `npx serve` com `serve.json`):** fluxo completo em 375 px com fotos de teste; recarregar no meio e retomar o rascunho; SW instalado e app abrindo com a rede desligada; finalizar offline → Pendente; PDF gerado e conferido (páginas, rodapé, tamanho); CSP sem violações no console; layout em 768 px e 1280 px. A sincronização ponta a ponta precisa de um projeto Supabase (local via CLI ou do usuário).

## 16. Suposições registradas
1. Nos conflitos com o app antigo, vale esta spec.
2. Vistoria finalizada não é editável.
3. A exclusão offline de vistoria sincronizada entra na fila.
4. Podem existir vários rascunhos; a aba retoma o mais recente.
5. "Avançar" não bloqueia; a validação completa acontece em "Finalizar".
6. Para finalizar, a etapa 3 exige "Veículo sem avarias" ligado ou ao menos uma avaria.
7. Puxar para atualizar foi trocado pelo botão "Atualizar" (a spec original aceita os dois).
8. A sequence pode ter lacunas raras, se uma inserção falhar no servidor; é o comportamento normal do Postgres.

## 17. Lista de verificação final (vai para o README)
- [ ] Campos do veículo: chassi (texto, exatamente 6, maiúsculas, contador, erro), marca, modelo, cor, km (numérico com milhar), combustível (5 chips)
- [ ] 3 fotos fixas (Frente, Traseira, Chassi) com Refazer/Remover, tela cheia, obrigatórias ao finalizar
- [ ] Checklist com os 13 itens em Presente/Ausente, atalhos, observação, lista em `config.js`
- [ ] Avarias ilimitadas com área, tipo, gravidade colorida, descrição e várias fotos; toggle "Veículo sem avarias"; listas em `config.js`
- [ ] Assinaturas do vistoriador e do motorista do reboque (canvas, Pointer Events, DPR, Limpar)
- [ ] Data e hora registradas ao finalizar (`realizada_em`)
- [ ] Indicador de etapas, Voltar/Avançar, rascunho automático e retomada
- [ ] Finalizar com a lista do que falta e links para cada campo
- [ ] Aba Vistorias: lista do Supabase com cache offline, carregar mais, busca, período, rascunhos, estado vazio
- [ ] Detalhe: leitura completa, Baixar PDF, Compartilhar, Excluir (também no servidor)
- [ ] PDF A4 com cabeçalho, dados, fotos, checklist, avarias, assinaturas e rodapé "Vistoria nº X — página N de M"; nome `Vistoria_<chassi>_<aaaa-mm-dd>.pdf`; menos de ~10 MB
- [ ] Login por e-mail e senha, sessão persistente, válida offline, botão Sair, sem cadastro público
- [ ] RLS ativo nas 3 tabelas e no Storage; comentário de administrador
- [ ] Bucket privado `vistorias`, caminhos `<user_id>/<inspection_id>/<arquivo>`, URLs assinadas
- [ ] Sincronização offline → servidor idempotente, com status Sincronizada/Pendente/Erro, "Tentar novamente" e número provisório → oficial
- [ ] App inteiro abre e finaliza vistorias em modo avião
- [ ] `netlify.toml` com `no-cache` no `sw.js`, `Content-Type` do manifest, cache longo em `icons/` e `vendor/`, cabeçalhos de segurança e CSP
- [ ] Aviso "Nova versão disponível — Atualizar" e botão/instrução "Instalar app"
- [ ] Mensagens claras para armazenamento cheio, câmera negada e falha no PDF
