# Recebimento na loja — Design

- **Data:** 12/11/2026
- **Status:** aguardando revisão (Luan e gerente de logística)
- **Pedido:** gerente de logística do CD
- **Aprovado em conversa:** caminho A (mesmo app, dois tipos de conta), em 4 partes

## 1. Objetivo

Fechar o ciclo da vistoria de envio: quando o veículo chega à loja de destino, uma pessoa da loja confere o carro contra a vistoria do CD e registra, no app, **quem recebeu, quando e se o carro chegou conforme a vistoria ou com divergência**, com assinatura na tela. O registro aparece para o CD (detalhe, painel, dashboard) e entra no PDF do laudo.

**Critério de sucesso:**
- uma pessoa da loja entra com a própria conta, vê só os carros da sua loja, acha o carro pelo chassi e registra o recebimento (conforme ou com divergência, com descrição e fotos, e assinatura) em poucos toques;
- o nome, a loja e a data/hora do recebimento são definidos pelo servidor, não pelo aparelho;
- um recebimento não pode ser feito duas vezes, alterado nem apagado pelo app;
- o gerente vê no dashboard quantos carros aguardam recebimento e quantos chegaram com divergência, por loja;
- o PDF baixado depois do recebimento traz a seção "Recebimento na loja" com a assinatura de quem recebeu;
- nenhuma conta de loja consegue ler vistorias, fotos ou arquivos de outra loja (testado em `supabase/tests/rls.sql`).

**Fora de escopo:** recebimento da fábrica (será outro app); registro de cada divergência como avaria detalhada (área/tipo/gravidade); desfazer ou editar recebimento pelo app; recebimento sem internet com envio posterior; notificações (e-mail/push) para o CD; cadastro de contas pelo próprio app.

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| R1 | Mesmo app, com **papel** por conta: `vistoriador` ou `loja` | Um app só para manter, publicar e instalar |
| R2 | **Uma conta por pessoa** da loja, presa a uma loja da lista `LOJAS` | O nome de quem recebeu vem da conta e não pode ser trocado |
| R3 | O recebimento é um **registro separado** (`recebimentos`), ligado à vistoria | A vistoria do CD não é alterada; o laudo original continua íntegro |
| R4 | Dois resultados: **conforme** ou **com divergência**; com divergência, a descrição é obrigatória e as fotos são opcionais | Equilíbrio entre registro útil e trabalho na loja |
| R5 | **Assinatura na tela** de quem recebeu, também no PDF | O PDF é o documento oficial da entrega |
| R6 | Nome, loja e data/hora do recebimento definidos **pelo banco** (gatilho + `now()`) | O aparelho não consegue falsificar quem nem quando |
| R7 | **Um** recebimento por vistoria; sem `update`/`delete` pelo app | Registro definitivo; correção só pelo painel do Supabase |
| R8 | A conta de loja **só lê** as vistorias com `loja` igual à sua; vistorias sem loja não aparecem para nenhuma loja | Cada loja vê só o que é dela; vistorias antigas não têm loja |
| R9 | A tela de recebimentos **exige internet**; o formulário preenchido fica guardado no aparelho até confirmar | Mais simples que uma fila offline; nada se perde se a conexão cair |
| R10 | Conta de loja no computador vê as mesmas telas de recebimento, nunca o painel nem o dashboard do CD | Um só fluxo por papel |

## 3. Banco de dados — `supabase/migrations/0006_recebimento_loja.sql`

### 3.1 `perfis`
- `papel text not null default 'vistoriador' check (papel in ('vistoriador', 'loja'))` — contas existentes ficam como `vistoriador`.
- `loja text` com `check (papel <> 'loja' or (loja is not null and btrim(loja) <> ''))`.
- Funções auxiliares `security definer`, `set search_path = ''`, `stable`: `public.meu_papel()` e `public.minha_loja()` (leem o perfil de `auth.uid()`; sem perfil, `meu_papel()` devolve `null`).

### 3.2 `recebimentos`
| coluna | tipo | regra |
|---|---|---|
| `id` | `uuid primary key` | gerado no aparelho (envio idempotente) |
| `inspection_id` | `uuid not null unique references inspections(id) on delete cascade` | um recebimento por vistoria |
| `user_id` | `uuid not null default auth.uid() references auth.users(id)` | |
| `recebedor_nome` | `text not null` | preenchido pelo gatilho a partir de `perfis.nome` |
| `loja` | `text not null` | preenchido pelo gatilho a partir de `perfis.loja` |
| `status` | `text not null check (status in ('conforme', 'divergencia'))` | |
| `descricao` | `text` | `check (status = 'conforme' or btrim(coalesce(descricao, '')) <> '')` |
| `assinatura` | `text not null` | caminho no bucket |
| `recebido_em` | `timestamptz not null default now()` | forçado a `now()` pelo gatilho |

Gatilho `antes de inserir`: exige `meu_papel() = 'loja'`; copia `recebedor_nome` e `loja` do perfil; força `user_id = auth.uid()` e `recebido_em = now()`; recusa se a vistoria não for da loja da conta (`inspections.loja <> perfis.loja`).

### 3.3 `recebimento_fotos`
`id uuid pk`, `recebimento_id uuid not null references recebimentos(id) on delete cascade`, `path text not null`, `created_at timestamptz default now()`.

### 3.4 Storage (bucket privado `vistorias`)
- Arquivos do recebimento em `<user_id da loja>/<inspection_id>/`: `receb_assinatura.png` e `receb_<fotoId>.jpg`. A regra atual de envio (primeira pasta = própria conta) já cobre isso.
- Leitura passa a depender do papel: `vistoriador` lê tudo (como hoje); `loja` lê só arquivos cuja segunda pasta (`inspection_id`) é de uma vistoria da sua loja.
- Exclusão de arquivos (hoje liberada a todos pela 0004) passa a valer só para `vistoriador`; a conta de loja não apaga nenhum arquivo, nem os do próprio recebimento.

### 3.5 Regras de acesso (RLS)
| tabela | vistoriador | loja |
|---|---|---|
| `inspections` select | todas | `loja = minha_loja()` |
| `inspections` insert | dono (como hoje) | **nunca** |
| `inspections` delete | todos (0004) | **nunca** |
| `damages`, `damage_photos` select | todas | as da vistoria da sua loja |
| `damages`, `damage_photos` insert/delete | como hoje | **nunca** |
| `recebimentos`, `recebimento_fotos` select | todos | os da sua loja |
| `recebimentos` insert | **nunca** | só da sua loja (gatilho confere) |
| `recebimento_fotos` insert | **nunca** | só do próprio recebimento |
| update/delete de recebimentos | sem política (bloqueado) | sem política (bloqueado) |

Exclusão de uma vistoria pelo CD apaga o recebimento junto (`on delete cascade`); os arquivos `receb_*` ficam na pasta da conta da loja e são removidos pela mesma rotina de exclusão, que passa a listar também essa pasta.

## 4. App — contas e navegação

- `auth.js`: o perfil passa a trazer `{ nome, papel, loja }`; guardado no cache local como hoje (offline continua sabendo o papel).
- `app.js`: rotas por papel.
  - `vistoriador`: tudo como hoje.
  - `loja`: menu `#/inicio` com um cartão **"Recebimentos"** e o número de carros a receber; rotas `#/recebimentos` e `#/recebimento/<inspection_id>`. `#/nova`, `#/vistorias`, `#/dashboard` e o painel do CD redirecionam para `#/inicio`.
- Computador com conta de loja: as mesmas telas de recebimento (R10).

## 5. Telas da loja

### 5.1 `#/recebimentos` — `views/recebimentos.js`
- Abas **A receber** (vistorias da loja sem recebimento, mais antigas primeiro) e **Recebidos** (mais recentes primeiro).
- Cartão: miniatura da frente, chassi, marca/modelo, data do envio, número VIS; em Recebidos, selo **Conforme** (verde) / **Com divergência** (laranja), nome de quem recebeu e data.
- Busca pelo chassi (e por marca/modelo/número), sem acento.
- Sem internet: aviso "Sem internet. Os recebimentos precisam de conexão." e nada mais.

### 5.2 `#/recebimento/<id>` — `views/recebimento.js`
1. Vistoria do CD em modo leitura, reaproveitando o desenho de `views/detalhe.js` (dados, loja, fotos, checklist, avarias), sem Baixar PDF nem Excluir.
2. Já recebida: mostra o card "Recebimento na loja" (5.3) e nenhum botão.
3. A receber: botão **"Registrar recebimento"**, que abre:
   - escolha **"Recebido conforme a vistoria"** / **"Recebido com divergência"**;
   - com divergência: campo **"O que está diferente?"** (obrigatório) e **fotos** (opcionais, mesma câmera e compressão de `photos.js`);
   - **assinatura** (`signature.js` / `assinatura-tela.js`) com "Recebido por: <nome> — <loja>" acima;
   - **"Confirmar recebimento"** → diálogo "Depois de confirmar não dá para alterar. Confirmar?".
4. Envio: arquivos primeiro (assinatura, fotos), depois `recebimentos` (verifica antes se já existe, como as vistorias), depois `recebimento_fotos`.
5. O formulário em andamento (escolha, texto, fotos, assinatura) fica no IndexedDB por vistoria até a confirmação dar certo; se a conexão cair, a tela mostra **"Tentar de novo"** sem perder nada.
6. Se o servidor recusar por já existir recebimento: "Este carro já foi recebido por <nome> em dd/mm às hh:mm." e a tela passa a mostrar o recebimento existente.

### 5.3 Card "Recebimento na loja" (componente compartilhado)
- Sem recebimento: **"Aguardando recebimento"** (cinza) e a loja de destino.
- Com recebimento: selo de status, "Recebido por <nome> — <loja>", data e hora, descrição e fotos (se divergência), assinatura.

## 6. O que muda para o CD

- **Detalhe da vistoria** (computador e celular do vistoriador): card 5.3 depois de "Dados do veículo".
- **Lista de vistorias no celular do vistoriador**: selo do recebimento no cartão.
- **Painel do computador**: coluna **"Recebimento"** e filtro "Todos os recebimentos / Aguardando / Conforme / Com divergência". A busca de todas as vistorias passa a trazer o recebimento junto (`recebimentos(status, recebedor_nome, recebido_em)`).
- **Dashboard**: bloco **"Recebimento nas lojas"** com três cartões — Aguardando recebimento, Recebidos conforme, Recebidos com divergência —; Aguardando e Divergência abrem a lista de veículos na tabela de baixo (como os cartões de avaria). A tabela "Por loja de destino" ganha a coluna **"Divergências"**. Vistorias sem loja não contam como "aguardando".
- **PDF** (`pdf.js`): seção **"Recebimento na loja"** depois das assinaturas, só quando existe recebimento: status, nome, loja, data e hora, descrição, fotos da divergência e a assinatura de quem recebeu. O PDF é gerado na hora; quem baixar depois do recebimento recebe a versão completa.

## 7. Módulos novos e alterados

- Novos: `recebimento-dados.js` (regras puras: validação do formulário, status/rotulos, filtros e contagens), `views/recebimentos.js`, `views/recebimento.js`, `views/card-recebimento.js`.
- `supabase.js`: mapeamentos `recebimentoDaLinha`/`linhaDoRecebimento`; `listarRecebimentosDaLoja()`, `obterRecebimento(inspectionId)`, `inserirRecebimento()`, `gravarFotosRecebimento()`; listas do painel e do dashboard com o recebimento embutido; exclusão remove também os arquivos `receb_*`.
- `storage.js`: rascunho do recebimento por vistoria (gravar, ler, apagar).
- `auth.js`, `app.js`, `views/inicio.js`, `views/detalhe.js`, `views/vistorias.js`, `views/painel.js`, `views/dashboard.js`, `dashboard-dados.js`, `painel-dados.js`, `pdf.js`, `styles.css`, `sw.js` (arquivos novos no cache; `CACHE_VERSION` nova).

## 8. Erros

| situação | mensagem |
|---|---|
| sem internet na tela de recebimentos | "Sem internet. Os recebimentos precisam de conexão." |
| conexão caiu ao confirmar | "Não foi possível enviar. Nada foi perdido." + **Tentar de novo** |
| já recebido por outra pessoa | "Este carro já foi recebido por <nome> em dd/mm às hh:mm." |
| divergência sem descrição | "Descreva o que está diferente." (no campo) |
| sem assinatura | "Falta a assinatura de quem recebeu." |
| conta de loja sem loja no perfil | "Sua conta não tem loja cadastrada. Peça ao administrador." (login funciona, recebimentos não) |

## 9. Testes

- `supabase/tests/rls.sql`: conta de loja não lê vistoria/avaria/arquivo de outra loja nem vistoria sem loja; não cria nem exclui vistoria; recebe só da própria loja; não recebe duas vezes; não altera nem apaga recebimento; nome, loja e data vêm do servidor; divergência sem descrição é recusada; vistoriador não registra recebimento.
- Node (`tests/*.test.js`): `recebimento-dados.js` (validação, filtros, contagens do dashboard), mapeamentos de `supabase.js`.
- Navegador (`tests/navegador/`): telas de recebimento (abas, busca, formulário, rascunho guardado, já recebido), card no detalhe, coluna e filtro do painel, bloco do dashboard, seção do PDF.

## 10. Implantação

1. Rodar `0006_recebimento_loja.sql` no Supabase **antes** de publicar.
2. Publicar o app (nova `CACHE_VERSION`).
3. Criar as contas das lojas: usuário em Authentication + linha em `perfis` com `nome`, `papel = 'loja'` e `loja` exatamente como em `LOJAS` (o README ganha o passo a passo e o SQL de exemplo).

## 11. Suposições registradas

- A pessoa da loja usa o celular/app com internet na hora do recebimento (R9).
- Um carro tem uma única vistoria de envio a receber; se houver mais de uma para o mesmo chassi, cada uma é recebida separadamente.
- Mudar o nome de uma loja em `LOJAS` exige atualizar `perfis.loja` das contas daquela loja (as vistorias antigas mantêm o nome antigo).
