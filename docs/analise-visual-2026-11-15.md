# CD Vistoria: análise visual e estética

Data: 15/11/2026. Versão analisada: `main` 649fa5a (cache v92).

## Material usado e limites

**Usado:**
- O código: `styles.css` (1.495 linhas), `index.html`, `manifest.webmanifest`, a pasta `views/`, `pdf.js`, `modo-app.js` e `.superdesign/design-system.md`.
- Capturas feitas com o app rodando em `localhost`, com dados simulados, todas na pasta `.playwright-mcp/qa/`:
  - Celular, 390 px: `c1-inicio`, `c2-lista`, `c3-detalhe`, `c4-recebimentos`, `c5-form`, `n1`–`n4` (nova vistoria), `n2-avaria-dialogo`, `n3-assinatura`, `v1-login-celular`, `v2-offline-celular`.
  - Computador, 1280 px: `t1-painel`, `t2-dashboard`, `t3-detalhe`, `v5-login-computador`.
  - Computador, 1024 px: `v3-painel-1024`, `v4-dashboard-1024`.
- Um laudo PDF de teste: `laudo.pdf`.
- Medições automáticas:
  - contraste WCAG (WCAG é a norma internacional de acessibilidade para web) de cerca de 60 pares de cores;
  - quais classes e tokens do CSS são de fato usados (token é uma variável de estilo, como `--texto`);
  - tamanhos de fonte que aparecem na tela;
  - alvos de toque com menos de 44 px.

**Não foi possível avaliar:**
- **Fotos reais de avarias.** Os dados de teste não têm foto (só placeholders ou um quadro azul "FOTO QA"). O tratamento visual de fotos de verdade (corte, nitidez, peso) fica *inferido do código*.
- **Uso ao sol em aparelho real.** O que digo sobre legibilidade ao sol vem dos números de contraste, não de teste em campo.
- **O app instalado no iPhone/Android** (tela de abertura, barra de status). Está *inferido do código e do manifest*.
- **Tablets**, porque não houve captura.

---

## A) Resumo executivo

O visual atual é um **"SaaS neutro"**: os cinzas são os da Tailwind (#111827, #4B5563, #F3F4F6), com fonte IBM Plex Sans, cartões brancos com borda fina e um azul (#1D4ED8) como cor de destaque. É sóbrio, limpo e coerente entre celular e computador. Mas é **genérico**: nada lembra a PG Prime nem marcas premium.

**3 pontos fortes**
1. **Celular e computador falam a mesma língua** (o "Estilo B"): mesmos cartões, selos e topo branco.
2. **Gravidade das avarias é muito bem comunicada.** A cor sempre vem acompanhada do texto, e os selos têm contraste alto: Leve 10,6:1, Moderada 7,1:1, Grave 5,6:1.
3. **Boa base técnica de acessibilidade:** foco visível, `aria-label` nas fotos, área segura do notch respeitada e fontes servidas localmente.

**3 maiores problemas**
1. **O contraste piorou com o redesenho**, justamente para uso ao sol:
   - A borda dos campos ficou em #E4E7EB, com só 1,24:1 sobre o branco. O mínimo para controles é 3:1.
   - Textos em #9CA3AF (2,54:1) aparecem em informações reais, como "Sem loja".
   - No celular, a maior parte do texto tem 12–13 px.
2. **No computador entre 1024 e 1279 px, o layout quebra:**
   - os rótulos do resumo ficam cortados;
   - o ID quebra em duas linhas;
   - a tabela "Por loja" vaza do cartão e cria rolagem lateral.
3. **O CSS virou duas camadas sobrepostas:**
   - a documentação fala em preto #111111, fonte do sistema e raio 12;
   - cerca de 200 linhas do CSS são código morto;
   - 4 tokens são declarados e nunca usados;
   - 30 cores estão "soltas" fora dos tokens.

---

## B) Ficha do visual atual

### Qual versão vale de fato

O `:root` (linhas 5–32 do `styles.css`) traz o design system antigo. Ele é **sobrescrito por inteiro** em todos os ambientes:

- `html.computador`, linhas 762–778, vale para o navegador do computador.
- `html:not(.computador)`, linhas 1120–1137, vale para o celular, o tablet e o app instalado.

Como todo aparelho cai em um dos dois, **os valores do `:root` nunca chegam à tela**. A única exceção é `--linha-forte` no computador, que não é redefinido lá e continua #8D99A3.

| Item | Doc. (`design-system.md`) | `:root` | Computador | Celular/app |
|---|---|---|---|---|
| Cor principal | #111111 | #111111 | **#111827** | **#111827** |
| Fundo | #F4F6F7 | #F4F6F7 | **#F3F4F6** | **#F3F4F6** |
| Texto secundário | #46525C | #46525C | **#4B5563** | **#4B5563** |
| Borda | #D3DAE0 | #D3DAE0 | **#E4E7EB** | **#E4E7EB** |
| Borda forte | #8D99A3 | #8D99A3 | #8D99A3 (herdada) | **#C7CDD6** |
| Destaque | "sem cor de destaque" | — | **#1D4ED8** | **#1D4ED8** |
| Fonte | system-ui | system-ui | **IBM Plex Sans 14 px** | **IBM Plex Sans 15 px** |
| Raio do cartão | 12 px | 12 px | **10 px** | **10 px** |
| Sombra | sombra dupla | sombra dupla | nenhuma nos `cb-cartao` | `--sombra: none` |
| Topo | preto 56 px | preto | **branco 64 px** | **branco 56 px** |
| theme-color (manifest e `<meta>`) | #111111 | — | — | **continua #111111**: barra do sistema preta sobre topo branco |

**Conclusão:** a documentação descreve um app que não existe mais. O código é a fonte da verdade, e o visual real é o da coluna "Celular/app", que é praticamente igual à do computador.

### Paleta real

Contraste calculado pela fórmula WCAG. Para texto pequeno o mínimo é 4,5:1; para texto grande e para ícones ou bordas de controles, 3:1.

| Papel | Cor | Onde aparece | Contraste |
|---|---|---|---|
| Texto principal, botão primário | #111827 | títulos, valores, botão escuro | 17,7:1 no branco ✅ |
| Fundo da página | #F3F4F6 | atrás dos cartões | — |
| Superfície | #FFFFFF | cartões, topo, campos | — |
| Texto secundário | #4B5563 | subtítulos, metadados | 7,6:1 no branco ✅ |
| Texto terciário ("cinza") | #6B7280 | rótulos `dt`, notas, "Avaria 1", cabeçalho de tabela | 4,83:1 no branco ✅ · 4,39:1 no #F3F4F6 ❌ |
| Texto "apagado" | #9CA3AF | "Sem loja", migalhas, placeholder, setas | **2,54:1 ❌** |
| Rótulo do eixo do gráfico | #7C828A | datas sob as barras (11 px) | **3,88:1 ❌** |
| Borda de cartão | #E4E7EB | cartões, campos, botões secundários | **1,24:1 no branco · 1,13:1 no fundo** |
| Divisória interna | #EEF0F3 | linhas de lista e tabela | decorativa |
| Destaque (acento) | #1D4ED8 | filtro ativo, links, progresso das etapas, "Remover" | 6,7:1 ✅ |
| Fundo do destaque | #EFF4FF | pílula ativa, halo de foco | texto azul 6,1:1 ✅ |
| Sucesso | #1B7F3B sobre #E5F3E9 | "Nenhuma divergência", "Sincronizada" (12 px) | **4,42:1 ❌ (por pouco)** |
| Pendente | #8A5A00 sobre #FFF4D6 | "Aguardando" | 5,41:1 ✅ |
| Erro / divergência | #B3261E sobre #FDECEA | "Com divergência", "Ausente", erros | 5,72:1 ✅ |
| Leve | texto #1A1A1A sobre #F5C400 | selo, faixa, rosca | 10,6:1 ✅ · cor sozinha no branco: **1,64:1** |
| Moderada | texto #1A1A1A sobre #F28C28 | idem | 7,1:1 ✅ · cor sozinha no branco: **2,45:1** |
| Grave | texto #FFFFFF sobre #C62828 | idem | 5,6:1 ✅ · cor sozinha no branco: 5,6:1 ✅ |
| Aviso azul | #1E3A8A sobre #EFF4FF | aviso da loja no detalhe | 9,4:1 ✅ |
| Toast | branco sobre #111827 / #1B7F3B / #B3261E | avisos | 17,7 / 5,1 / 6,5 ✅ |

**Proporção de uso:** o app é ~90% neutro (branco, cinzas, #111827). O azul aparece em pontos pequenos, como filtros, links e progresso. Verde, âmbar e vermelho só aparecem em selos. A proporção é boa. O problema não é ter cor demais, e sim **cinza claro demais** onde a informação importa.

### Escala tipográfica real

Medida na tela renderizada.

| Uso | Celular | Computador |
|---|---|---|
| Título de página (`cm-h1`, `cb-h1`, `.titulo`) | 22 px / 600 | 22 px / 600 (login: **28 px / 750→700**) |
| Título do veículo no detalhe | 20 px / 600 | 22 px / 600 |
| Título de cartão / seção | 14 px / 600 | 14 px / 600 |
| Corpo | 15 px (base) / 14 px | 14 px (base) / 13 px |
| Metadados, rótulos, selos | 12–13 px / 400–500 | 12–13 px |
| Legenda de foto, eixo do gráfico | **11 px** | **11 px** |
| Número de KPI | — | 28 px / 600 |
| Chassi | mono do sistema, 12 px (lista) a 18 px (campo) | mono 12 px |

- São **9 tamanhos** em uso: 11, 12, 13, 14, 15, 16, 18, 20 e 22, além de 28 no computador.
- No detalhe do celular, **60 dos 85 textos têm 12 ou 13 px**.
- O PDF usa uma **terceira família**, Barlow e Barlow Semi Condensed.

### Forma

| Token | Valor real |
|---|---|
| Raio de cartão | 10 px (`--raio`). Também há 12 px no `:root` e "4 px" escrito à mão em `.cb-ausente` |
| Raio de controle | 8 px (`--raio-sm`). Selos de status têm 6 px, selos de gravidade e pílulas de filtro 999 px |
| Borda | 1 px #E4E7EB em quase tudo. Dois resquícios de 2 px: `.gravidade` e as opções do recebimento quando marcadas |
| Sombra | **nenhuma** nos cartões. Só diálogos (`0 10px 40px`) e toasts (`0 6px 20px`) |
| Altura de controle | 48 px (botão `.btn`, barra de ações) · 44 px (campo) · 40 px (`cm-btn`, chips) · 36 px (`cb-btn`, `cm-acao-botao`) · 32 px (pílulas, busca do computador) |
| Espaçamento | múltiplos de 4: 4, 6, 8, 12, 16, 20, 24, 32 |
| Larguras | conteúdo do celular até 720 px; computador sem limite (`max-width: none`) com 32 px de margem |
| Quebras de layout no CSS | 560, 768, 900, 1024 (só com mouse), 1100, 1280 px |

---

## C) Análise por dimensão

### 1. Identidade e personalidade · Nota 3

**O que existe**
- Topo branco com o nome "CD Vistoria" e um selo "Consulta" no computador (`styles.css:790`).
- Preto-azulado #111827 nos botões principais e azul #1D4ED8 nos estados ativos.
- O logo é um carro desenhado em traço fino com uma lupa (`icons/logo-512.png`).

**O que funciona**
- O visual transmite seriedade e ordem. É o que se espera de uma ferramenta de laudo.
- Não há enfeites que atrapalhem quem está em campo.

**O que incomoda**
- É a paleta padrão da Tailwind, sem mudanças. Poderia ser o painel de qualquer startup.
- Não há nenhum sinal da PG Prime: nem no app, nem no topo, nem no laudo. O PDF diz "PG Prime" só em texto (captura `laudo.pdf`, página 1).
- Para um grupo de marcas premium, falta um detalhe de acabamento que diga "isto é nosso".

### 2. Cores · Nota 3

**O que existe:** a paleta da tabela B. O azul virou a cor de "estado ativo", e verde, âmbar e vermelho ficam nos selos.

**O que funciona**
- O texto principal tem contraste altíssimo: 17,7:1.
- Os selos de gravidade, Aguardando e Com divergência passam do mínimo.
- O vermelho da "Grave" (#C62828) e o do "erro" (#B3261E) são próximos, mas a diferença tem uma razão: um é dado da vistoria, o outro é problema do sistema.

**O que incomoda**
- **Bordas quase invisíveis.**
  - Campos, chips, toggle e botões secundários usam #E4E7EB (1,24:1). Isso vale para `.entrada` em `styles.css:1206` e `:1485`, e para `.chip` em `:1213`.
  - O mínimo para indicar onde fica um controle é 3:1 (WCAG 1.4.11). Antes do redesenho era 2 px #8D99A3 (2,9:1).
  - Ao sol, um campo vazio vira "um retângulo branco sobre cinza-claro". Veja o campo Senha em `v1-login-celular`.
- **Cartões se misturam ao fundo.** A borda #E4E7EB sobre #F3F4F6 dá 1,13:1, e não há sombra. Com reflexo na tela, os blocos de `c3-detalhe` se fundem.
- **#9CA3AF usado em informação.**
  - Aparece em "Sem loja" e na seta das migalhas (`.cm-apagado`, `styles.css:1185` e `:1289`; captura `c2-lista`).
  - Também no placeholder da busca. Placeholder pode ser mais claro, mas não 2,5:1.
- **O azul tem papéis demais.**
  - É ao mesmo tempo filtro ativo, link, etapa atual, foco e **"Remover"** (`n2b-etapa3`) e **"Limpar assinatura"** (`n4-etapa4`).
  - Ações destrutivas em azul contradizem o vermelho do `.btn-perigo`.
- **O vermelho também tem papéis demais.** Significa Grave, Ausente, Com divergência, Excluir e erro de envio. No detalhe do computador (`t3-detalhe`) aparecem quatro vermelhos com quatro sentidos diferentes.
- **Amarelos próximos.** "Leve" (#F5C400) e "Aguardando" (#FFF4D6 / #8A5A00) são dois amarelos para coisas sem relação.
- O selo verde a 12 px fica em 4,42:1, um pouco abaixo do mínimo.

### 3. Tipografia · Nota 3

**O que existe**
- IBM Plex Sans servida localmente, nos pesos 400, 500, 600 e 700 (`styles.css:757–760`). Ela é guardada para uso offline pelo `sw.js:60–63`.
- Números tabulares no `body` (`font-variant-numeric: tabular-nums`). Números tabulares têm todos a mesma largura, então as colunas de números ficam alinhadas.
- O chassi usa a fonte mono do sistema.

**O que funciona**
- A Plex é técnica e muito legível, e combina com laudo.
- Os números tabulares deixam as tabelas do computador alinhadas.
- O chassi em mono, com espaçamento entre letras (`.entrada-chassi`), é ótimo para conferir caractere por caractere.

**O que incomoda**
- **Tudo pequeno no celular.** A base é 15 px, mas a maioria dos textos de apoio tem 12–13 px, e as legendas das fotos 11 px (`.cm-foto figcaption`, `styles.css:1348`). Para quem lê em pé, ao sol, com o carro na frente, é pouco.
- **A hierarquia depende quase só do tamanho.** Títulos de cartão (14/600) e corpo (14/400) têm o mesmo tamanho. A diferença é só o peso, e ela é fraca em tela pequena (veja "Dados do veículo" em `c3-detalhe`).
- **Restos do sistema antigo.**
  - Pesos 650 e 750 continuam no CSS base (`.btn`, `.titulo`, `.etapa-btn`). A Plex só tem até 700, então o navegador arredonda.
  - O login do computador sai com 28 px/700, enquanto todo o resto do computador usa 22/600 (`v5-login-computador`).
- **Três famílias de fonte:** Plex no app, Barlow no PDF e a mono do sistema, que muda de aparelho para aparelho (SF Mono, Menlo, Consolas).

### 4. Espaçamento e layout · Nota 3

**O que existe**
- No celular: uma coluna, margem de 16 px, cartões com 12 px entre si e barra de ações fixa.
- No computador: largura total com 32 px de margem, grade de 12 colunas no dashboard e 8 + 4 colunas no detalhe.

**O que funciona**
- O ritmo vertical do celular é regular: 12 px entre cartões e 16 px dentro deles (`c3-detalhe`, `n2b-etapa3`).
- O detalhe do computador em 1280 px é bem resolvido (`t3-detalhe`).

**O que incomoda**
- **O modo computador é decidido pelo aparelho, não pela largura** (`modo-app.js`). Por isso, um notebook de 1024–1366 px recebe o layout pensado para 1280 px ou mais. Em `v3-painel-1024` e `v4-dashboard-1024`:
  - os 5 rótulos do resumo ficam cortados: "Aguardando re…", "Recebido com …", "Total no períod…". Em 1280 px, "Recebido com divergên…" também já corta (`t1-painel`);
  - o ID (`VIS-000045`) e a data quebram em duas linhas;
  - o subtítulo do dashboard se espreme numa coluna estreita e vira 5 linhas;
  - **a tabela "Por loja de destino" passa da borda do cartão e da janela** e gera rolagem horizontal na página toda. A coluna "Com divergência" fica fora da tela.
- **Sem limite de largura no computador.** Em monitores de 1920 px ou mais, as tabelas ficam com linhas muito longas para o olho acompanhar. Isto é *inferido do código*: `html.computador .conteudo { max-width: none }`, `styles.css:781`.
- No celular, o painel de Início tem dois cartões e muito vazio embaixo (`c1-inicio`). Não é erro, mas parece "inacabado".
- Há quebras em 6 larguras diferentes. As de 1024 só valem com mouse (`pointer: fine`), então um tablet com teclado e trackpad cai num meio-termo difícil de prever.

### 5. Componentes · Nota 3

**O que existe:** três famílias de botão convivendo:
- `.btn`: 48 px, borda de 2 px que vira 1 px no Estilo B;
- `.cm-btn`: 40 px;
- `.cb-btn`: 36 px, só no computador.

Há também dois formatos de selo, campos `.entrada`, chips, segmentados, `cm-cartao` e `cb-cartao` (que são o mesmo componente com nomes diferentes), diálogos cheios, lightbox, barra `.cm-acoes` e assinatura em tela cheia.

**O que funciona**
- Barra de ações fixa com o botão principal mais largo (`flex: 1.4`) e o secundário à esquerda: padrão claro de "voltar / avançar" (`n1-etapa1`).
- Assinatura em tela cheia e deitada, com uma linha "Assine aqui" (`n3-assinatura-vistoriador`). É o melhor componente do app.
- As opções do recebimento ("Nenhuma divergência" / "Com divergência") têm ícone, cor e rádio grande (`c5-form`).
- Os botões de gravidade mostram "✓" quando marcados (`n2-avaria-dialogo`), então não dependem só da cor.

**O que incomoda**
- **Estados incompletos.**
  - Desabilitado é só `opacity: 0.55` (`styles.css:51`). Sobre o botão escuro vira um cinza médio sem contraste: veja "Confirmar" em `n3`.
  - `.btn-secundario`, `.btn-texto` e os chips não têm estado `:active` próprio no celular. Ao toque, não se percebe nada.
- **Mesma ação, três aparências.** "Atualizar" é `cm-btn` de 40 px no celular e `cb-btn` de 36 px no computador. "Baixar PDF" é `.btn` de 48 px no celular. Um design system precisa de um botão só, com tamanhos.
- **Selos com formatos diferentes lado a lado.** No detalhe aparecem "Sincronizada" (canto de 6 px) e "Grave" (pílula de 999 px) muito próximos (`c3-detalhe`).
- **Dois status no cabeçalho do detalhe.** "Sincronizada" + "Com divergência" aparecem juntos (`t3-detalhe`). Para o gerente, "Sincronizada" é ruído técnico.
- O toast (aviso flutuante) e as faixas "Nova versão" e "Instalar" ficam brancas no celular (`styles.css:1164`). Uma faixa branca sob um topo branco parece parte do conteúdo, não um aviso.

### 6. Iconografia e imagens · Nota 3

**O que existe**
- Ícones SVG próprios no estilo Lucide: traço de 2 px e pontas arredondadas (`ui.js:58`). O tamanho é 20 px por padrão, 14–16 px nos selos e botões compactos.
- O logo é PNG em traço fino.
- O ícone maskable tem o desenho menor e centralizado. Ícone maskable é a versão que o Android recorta em círculo ou outra forma.

**O que funciona**
- Um único estilo de ícone em todo o app, coerente.
- O carro cinza no lugar da foto ausente é um bom "vazio" (`t3-detalhe`).

**O que incomoda**
- **O logo não se lê em tamanho pequeno.** No login, com 56 px (`v1-login-celular`), o traço fino vira um rabisco. No ícone de 32 px da aba, só se vê uma linha.
- O desenho é genérico (carro + lupa), sem nenhuma ligação com a PG Prime.
- O ícone do app tem fundo branco com uma leve sombra cinza nas bordas (`logo-512.png`). Na tela inicial do celular ele some sobre papéis de parede claros.
- As fotos de avaria no detalhe do celular aparecem como miniaturas de 56×42 px (`styles.css:1366`). Para ver o dano é preciso tocar, e com miniatura tão pequena isso não é óbvio. *Inferido do código, porque não há foto real nas capturas.*

### 7. Dashboard e visualização de dados · Nota 3

**O que existe:** 5 KPIs (indicadores-chave), barras por dia, semana ou mês comparando com o período anterior, rosca de gravidade, barras horizontais por área, duas tabelas e a lista das últimas (`t2-dashboard`).

**O que funciona**
- Os números grandes (28 px) ficam no lugar certo.
- O ponto colorido no canto de cada KPI indica a categoria.
- A rosca vem com uma tabela de valores e porcentagens. Não depende só da cor.
- "Ver veículos →" leva do número à lista.

**O que incomoda**
- **As barras não têm eixo nem valores.** Não dá para saber se a barra alta é 3 ou 30 sem passar o mouse (`t2-dashboard`).
- **Com 30 colunas, as barras ficam finíssimas.** O período anterior com zero some, e a legenda "Anterior" fica sem par visível (`v4-dashboard-1024`).
- **No filtro "Tudo", a legenda "Anterior" continua aparecendo**, mesmo sem nada para comparar (`t2-dashboard`).
- **Cores inconsistentes entre gráficos.** As barras do volume são azuis (#1D4ED8) e as de "Áreas" são pretas (#111827), mas ambas medem quantidade.
- **Na rosca, o segmento Leve (#F5C400) tem 1,64:1 sobre o branco.** Com reflexo, some.
- **A minilinha só existe no primeiro KPI**, e tem pouco significado com poucos dados (`t2-dashboard`).
- O KPI "Aguardando" usa um ponto marrom (#8A5A00) que se confunde com o laranja da Moderada.

### 8. Estados e feedback · Nota 3

**O que existe**
- Bolinha + texto "Online", "Offline", "Pendente" ou "Enviando" no topo, a 12 px (`styles.css:1150`).
- Faixas para "Nova versão", "Sessão expirada" e "Instalar".
- Toasts, um ícone girando no carregamento, estados vazios e o selo de sincronização em cada vistoria.

**O que funciona**
- O estado de cada vistoria (Sincronizada, Pendente, Erro) está sempre visível na lista.
- "Rascunho salvo no aparelho" no subtítulo da nova vistoria (`n1-etapa1`) tranquiliza.
- "Enviando" pisca (`@keyframes pisca`).

**O que incomoda**
- **Offline é discreto demais.** Só a bolinha passa de verde para cinza, e o texto tem 12 px (`v2-offline-celular`). Em campo, é a informação mais importante do dia e deveria aparecer como faixa.
- **A faixa "Nova versão" é branca no celular** e se mistura com o topo branco.
- Carregar e atualizar a tabela é só `opacity: 0.55` (`.cb-atualizando`). Não há indicação de que algo está acontecendo.
- **"Sessão expirada" é a única faixa amarela.** "Nova versão", que também pede ação, é neutra.

### 9. Movimento · Nota 3

**O que existe**
- Ícone girando, "Enviando" piscando, toggle deslizando em 0,15 s.
- Zoom e troca de foto animados no visualizador (`.animando`, `styles.css:1463`).
- Transições de fundo de 0,12 s nas linhas de tabela.

**O que funciona:** pouco movimento e rápido, adequado a uma ferramenta.

**O que incomoda**
- **`prefers-reduced-motion` só cobre o ícone girando** (`styles.css:64`). Essa configuração do sistema serve para quem pede menos animação. O piscar, o toggle e a animação do zoom ignoram a preferência.
- **Toque com pouco retorno visual.** Só o `.btn-primario`, o `.cm-acao`, o topo e o menu mudam ao toque. Chips, botões secundários e linhas da lista não respondem.

### 10. Acessibilidade visual · Nota 2

**O que existe**
- Foco com contorno azul de 2 px (`styles.css:1139`).
- `aria-label` em fotos ausentes e `alt` nas assinaturas (`views/detalhe.js:146`, `:230`).
- Área segura do notch (`env(safe-area-inset-*)`) aplicada no topo, no conteúdo, na barra de ações e no visualizador.

**O que funciona**
- O foco é visível.
- Gravidade e checklist usam texto, além da cor.
- Os campos de erro usam `aria-invalid`.

**O que incomoda**
- **Zoom bloqueado no celular.** O `modo-app.js:87–94` grava `maximum-scale=1, user-scalable=no` e cancela os gestos de pinça. Quem precisa ampliar o texto não consegue (WCAG 1.4.4), e com fontes de 12 px isso pesa.
- **Contraste:** as bordas dos controles (1,24:1), os textos #9CA3AF (2,54:1), os eixos #7C828A (3,88:1) e o selo verde (4,42:1). Veja a tabela B.
- **Alvos de toque pequenos.** A meta do projeto é 48 px.
  - A migalha "Vistorias" tem 70×20 px (`c3-detalhe`). "← Início" tem 53×32 px.
  - Chips e "Atualizar" têm 40 px de altura (`c2-lista`), que é aceitável mas abaixo da meta.

### 11. Consistência do sistema · Nota 2

**O que existe:** três camadas de CSS. São a base (`:root`), o computador (`cb-`) e o celular (`cm-`). As camadas antigas não foram removidas.

**O que funciona:** os prefixos `cb-` e `cm-` deixam claro de onde vem cada regra. O redesenho foi disciplinado nisso.

**O que incomoda**
- **Valores soltos.** #E4E7EB aparece 44 vezes, #4B5563 39, #111827 35, #1D4ED8 34 e #6B7280 22, todos **escritos à mão** em vez de `var(--…)`. Isso apesar de os tokens existirem.
- **Tokens sem uso:** `--acento-fundo`, `--suave`, `--cinza` e `--apagado` são declarados duas vezes (computador e celular) e **lidos zero vezes**. `--acento` é usado 2 vezes contra 34 ocorrências de #1D4ED8.
- **`--linha-forte` muda conforme a tela:**
  - #8D99A3 no computador, onde não é redefinido;
  - #C7CDD6 no celular;
  - e boa parte das bordas que deveriam usá-lo foram trocadas à mão por #E4E7EB.
- **Código morto.** Cerca de 200 linhas (~13%) de regras cujas classes não existem mais no HTML ou JS:
  - o dashboard antigo inteiro (`.db .db-*`, `styles.css:584–668`, `:685–704`, `:738–746`);
  - o detalhe antigo do computador (`.detalhe-pagina`, `.detalhe-cabeca`, `.det-dir`, `:478–525`, `:673–683`, `:714–720`);
  - as métricas antigas do painel (`.dash-metricas`, `.dash-tabela`…);
  - as abas removidas (`.cb-abas`, `.cm-abas`);
  - e ainda `.cm-faixa-ok`, `.cm-faixa-pendente`, `.cm-faixa-erro`, `.cm-link`, `.btn-icone`, `.cartao-link`, `.loja-destino`.
- **Regras antigas que contradizem as novas.** `.selo-receb-divergencia` sem escopo ainda define âmbar (`:709`), e a versão por ambiente sobrescreve para vermelho (`:869`, `:1201`). Quem editar a regra de cima vai achar que mudou algo e não vai mudar nada.
- **Navegação diferente entre aparelhos.** A migalha do computador é azul com seta (`t3-detalhe`) e a do celular é cinza (`c3-detalhe`).

### 12. Laudo em PDF · Nota 4

**O que existe:** A4 em Barlow e Barlow Semi Condensed, com:
- título centralizado e linha da empresa com a data;
- seções com fio preto;
- dados em grade de 3 colunas e checklist em 2 colunas com "OK";
- fotos grandes, cartões de avaria e assinaturas com linha;
- rodapé "CD Vistoria | VIS | Chassi | Página X de Y" (`laudo.pdf`).

**O que funciona**
- É a peça mais "premium" do produto. Tem hierarquia forte, muito respiro e títulos condensados de cara técnica.
- A leitura é fácil impressa.
- O rodapé com o número da vistoria e o chassi em todas as páginas é excelente para auditoria.

**O que incomoda**
- **A faixa lateral do cartão de avaria é sempre preta** (`pdf.js:368`), enquanto no app ela tem a cor da gravidade (`c3-detalhe`). A gravidade só aparece no selo pequeno.
- **"Ausente" é um selo preto** (`pdf.js:296`), enquanto no app é vermelho. O que mais importa no checklist é o que menos chama atenção.
- **Não há logo nem identidade da PG Prime.** O título "Vistoria de veículo para expedição do CD" tem 22 pt, e o nome da empresa vai em 10,5 pt.
- **A identidade não bate com o app.** O app usa Plex e #111827; o PDF usa Barlow e #111111. Ninguém vai notar a diferença de preto, mas a de fonte sim.

### 13. Experiência de instalação (PWA) · Nota 2

**O que existe:** um manifest com:
- `theme_color` e `background_color` (abaixo);
- `display: standalone` (abre sem a barra do navegador) e `orientation: portrait`;
- ícone `any` 192 e 512, ícone `maskable` 512 e `apple-touch-icon` de 180.

**O que funciona**
- Tem o ícone maskable separado.
- O app abre em tela cheia e fica preso na vertical, o que é bom para o uso com uma mão.

**O que incomoda**
- **`theme_color` #111111** (manifest) e **`<meta name="theme-color" content="#111111">`** (`index.html:6`), mas o topo do app é **branco**. No Android, a barra de status fica preta sobre um cabeçalho branco: parece "costura". *Inferido do código; confirmar no aparelho.*
- **A tela de abertura é branca com um ícone de traço fino**, sem nome nem cor. *Inferido do manifest.*
- **`start_url` é `./#/nova`.** Quem instala a partir da conta de loja ou do computador abre primeiro numa rota de vistoriador. *Inferido do código; confirmar se o roteador redireciona sem piscar.*

---

## D) Inconsistências encontradas

1. **A documentação e o código divergem** (`.superdesign/design-system.md` × `styles.css:762` e `:1120`): cor, fonte, raio, topo, sombra e cor de destaque. Quem seguir o documento vai criar telas fora do padrão.
2. **`theme-color` preto × topo branco** (`manifest.webmanifest`, `index.html:6` × `styles.css:1144`). A barra do sistema fica com a cor errada no app instalado.
3. **`--linha-forte` tem três valores** (#8D99A3 no computador, #C7CDD6 no celular, #8D99A3 no doc), e a maioria das bordas o ignora com #E4E7EB. O mesmo "campo" tem contraste diferente conforme o aparelho.
4. **O azul é usado em ações destrutivas.** "Remover" avaria e "Limpar assinatura" são azuis (`n2b-etapa3`, `n4-etapa4`), enquanto "Excluir" é vermelho (`t3-detalhe`). O usuário aprende uma regra de cor e ela é quebrada.
5. **O vermelho tem 5 sentidos:** Grave, Ausente, Com divergência, Excluir e erro de envio. Na tela do gerente, tudo grita igual.
6. **Selos de status têm canto de 6 px e os de gravidade são pílula** (`styles.css:1197` × `:1202`). Dois "formatos de etiqueta" na mesma tela.
7. **Faixa da avaria colorida no app, preta no PDF** (`c3-detalhe` × `laudo.pdf`, p. 2; `pdf.js:368`).
8. **"Ausente" vermelho no app, preto no PDF** (`pdf.js:296`).
9. **Três famílias de botão** (`.btn`, `.cm-btn`, `.cb-btn`) com alturas 48, 40 e 36 para a mesma ação ("Atualizar", "Baixar PDF").
10. **Pesos 650 e 750 no CSS base** sem fonte correspondente. O login do computador sai com 28 px/700 e o resto com 22/600 (`v5-login-computador` × `t1-painel`).
11. **A migalha é azul no computador e cinza no celular** (`t3-detalhe` × `c3-detalhe`).
12. **Regras antigas de `.selo-receb-divergencia` em âmbar** (`styles.css:709`) contradizem as atuais em vermelho (`:869`, `:1201`).
13. **Barras azuis no gráfico de volume e pretas no de áreas**, com o mesmo tipo de dado (`t2-dashboard`).
14. **App com IBM Plex Sans, laudo com Barlow** (`styles.css:757` × `pdf.js:39`).
15. **O nome "CD Vistoria" aparece duas vezes no login:** no topo e ao lado do logo (`v1-login-celular`, `v5-login-computador`).

---

## E) Plano de melhoria priorizado

A ordem vai do maior impacto com menor esforço para o menor. Todas as correções cabem no HTML, CSS e JS atuais, sem bibliotecas novas.

| # | Problema | Impacto | Esforço | Correção sugerida |
|---|---|---|---|---|
| 1 | Bordas de campos, chips, toggle e rádio quase invisíveis (1,24:1) | Alto | Baixo | Criar `--borda-controle: #868E96` (3,32:1) e usá-lo em `.entrada`, `.chip`, `.toggle`, `.segmentado`, `.cm-radio` e no `.btn-secundario`, nos dois modos. Deixar #E4E7EB só para cartões e divisórias. |
| 2 | Texto #9CA3AF em informação ("Sem loja", migalhas, setas) | Alto | Baixo | Trocar por #6B7280 (4,83:1) em `.cm-apagado`, `.cm-item-loja.cm-apagado`, `.cm-migalhas`, `.cb-apagado` e `.cb-busca .ic`. No placeholder, usar #6B7280 também. |
| 3 | Zoom bloqueado no celular | Alto | Baixo | Remover `maximum-scale=1, user-scalable=no` e o cancelamento de `gesture*` em `modo-app.js:87–94`. Manter `touch-action: none` só no `.visualizador-palco` e na assinatura. |
| 4 | Offline discreto demais | Alto | Baixo | Com `data-estado="offline"`, mostrar uma faixa `.faixa-alerta` sob o topo: "Sem internet. As vistorias ficam salvas no aparelho e serão enviadas depois." |
| 5 | Layout do computador quebra entre 1024 e 1279 px | Alto | Médio | Para `.cb-resumo`, usar `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`. Para as tabelas do dashboard, `overflow-x: auto` no corpo do cartão. Para a coluna ID, `white-space: nowrap`. Abaixo de 1200 px, levar o subtítulo do dashboard para a linha de baixo dos filtros. |
| 6 | `theme-color` preto com topo branco | Médio | Baixo | Trocar para #FFFFFF no `manifest.webmanifest` e na `<meta name="theme-color">`. Acrescentar `<meta name="color-scheme" content="light">`. |
| 7 | "Remover" e "Limpar assinatura" em azul | Médio | Baixo | Usar uma classe `btn-texto-perigo` com `color: #B3261E` (6,5:1). |
| 8 | Selo verde abaixo do mínimo a 12 px (4,42:1) | Médio | Baixo | Trocar o texto de `.selo-sincronizada` e `.selo-receb-conforme` para #166534 (6,22:1), mantendo o fundo #E5F3E9. |
| 9 | Letra pequena demais no celular (12–13 px dominante, legendas com 11 px) | Médio | Baixo | No celular, piso de 13 px para metadados (`.cm-item-linha`, `.cm-dados dt`, `.cm-nota`) e de 12 px para legendas (`.cm-foto figcaption`). Títulos de cartão em 15 px/600 para se separarem do corpo de 14 px. |
| 10 | Cartões se fundem ao fundo ao sol | Médio | Baixo | No celular, voltar uma sombra leve nos `.cm-cartao`: `0 1px 2px rgba(17,24,39,.06)`. Ou escurecer a borda do cartão para #D1D5DB. |
| 11 | Faixas "Nova versão" e "Instalar" brancas | Médio | Baixo | No celular, `.faixa` com fundo `--acento-fundo` (#EFF4FF) e borda inferior #BFD0F7, para parecer um aviso. Com isso, o token `--acento-fundo` passa a ser usado. |
| 12 | Gráfico de barras sem valores; legenda "Anterior" no "Tudo" | Médio | Médio | Escrever o número acima de cada barra quando houver até 14 colunas e linhas de grade com 3 valores no eixo nos demais casos. Esconder a legenda "Anterior" quando `intervalo.tudo`. Usar o mesmo azul nas barras de "Áreas". |
| 13 | Segmento Leve da rosca some no branco (1,64:1) | Baixo | Baixo | Desenhar uma divisória branca de 2 px entre os segmentos e um contorno #B88A00 de 1 px só no segmento Leve. |
| 14 | PDF: faixa da avaria preta e "Ausente" preto | Médio | Baixo | Em `pdf.js:368`, usar `rgb(g.cor)` da gravidade. Em `pdf.js:296`, usar o fundo #B3261E. Os dois continuam legíveis em impressão preto e branco, porque o texto do selo se mantém. |
| 15 | Selo "Sincronizada" no cabeçalho do detalhe (computador) | Baixo | Baixo | Mostrar o selo de sincronização só quando ela **não** está em dia (Pendente ou Erro), como já acontece em `seloDaLista`. |
| 16 | Animações ignoram `prefers-reduced-motion` | Baixo | Baixo | Adicionar `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }`. |
| 17 | Toque sem resposta visual em chips, botões secundários e linhas | Baixo | Baixo | Adicionar `:active { background: #F3F4F6 }` a `.chip`, `.btn-secundario`, `.btn-texto` e `.cartao-vistoria-link`. |
| 18 | Tokens sem uso e cores à mão | Médio (manutenção) | Médio | Substituir os hex repetidos pelos tokens: #E4E7EB→`--linha`, #4B5563→`--texto-2`, #6B7280→`--cinza`, #1D4ED8→`--acento`, #EFF4FF→`--acento-fundo`, #EEF0F3→`--suave`. Depois, juntar os dois blocos de tokens (computador e celular) num só `:root`. |
| 19 | ~200 linhas de CSS morto | Baixo (manutenção) | Baixo | Apagar os blocos `.db .db-*`, `.detalhe-pagina`, `.dash-metricas`/`.dash-tabela`, `.cb-abas`, `.cm-abas`, `.cm-faixa-ok/pendente/erro`, `.cm-link`, `.btn-icone`, `.cartao-link`, `.loja-destino` e as regras âmbar de `.selo-receb-divergencia` (linha 709). |
| 20 | Documentação desatualizada | Baixo | Baixo | Reescrever `.superdesign/design-system.md` com os valores reais da tabela B, para os próximos redesenhos partirem do lugar certo. |
| 21 | Três famílias de botão | Médio | Alto | Um só `.btn` com tamanhos `--g` (48), `--m` (40) e `--p` (36). `cm-btn` e `cb-btn` passam a ser apelidos e depois saem. |
| 22 | Logo ilegível em tamanho pequeno e sem identidade | Médio | Médio | Criar uma versão do ícone com traço de 3–4 px e fundo #111827 com o desenho branco, para o app instalado e para o login. Isso depende das perguntas 1 e 5. |

---

## F) Direção estética

O visual deveria evoluir de "SaaS neutro" para **"ferramenta técnica de alto padrão"**. Para isso, **manter**:
- a sobriedade, o fundo claro e a IBM Plex Sans;
- os cartões brancos e a gravidade sempre com cor + texto;
- a assinatura em tela cheia e o laudo com cara de documento.

E **ganhar** em três frentes:
1. **Firmeza de contraste:** bordas de controle a 3:1, nada de informação em #9CA3AF e letra mínima de 13 px no celular. Isso aproxima o app da realidade do pátio, ao sol.
2. **Disciplina de cor:**
   - preto-azulado para ação;
   - azul só para "selecionado" e "link";
   - vermelho só para dano grave e destrutivo;
   - âmbar só para "esperando".
3. **Assinatura de marca discreta:** um ícone com mais peso, a PG Prime no laudo e no login, e talvez o preto #111827 como fundo do ícone instalado.

**O que não deve mudar:**
- o fluxo em 4 etapas com barra de ações fixa;
- as cores de gravidade, que são universais e o pessoal já conhece;
- o topo branco e simples;
- a ausência de enfeites, gradientes e ilustrações.

---

## Perguntas para refinar a análise (respondidas)

1. **Manual de marca:** a PG Prime só define as cores preto, branco e cinza.
2. **Aparelhos e condições:** Android e iPhone; o trabalho é pouco ao sol.
3. **Resolução das telas do computador:** não se sabe.
4. **O laudo é impresso?** Não.
5. **O bloqueio do zoom foi pedido seu?** Sim.

---

## G) Revisão com as respostas

### O que muda

- **O azul de destaque vai contra a marca.** Se a marca é preto, branco e cinza, o #1D4ED8 (34 ocorrências no CSS) é a única cor "de enfeite" do app. O design system antigo já dizia "sem cor de destaque", e ele estava mais perto da marca que o visual atual. A recomendação passa a ser **um app monocromático de verdade**:
  - **Preto-azulado #111827** para tudo que é "selecionado" ou "ação": pílula de filtro ativa, etapa atual, aba ativa, foco e links (sublinhados).
  - **Cinzas** para a estrutura.
  - **Cor só para significado:** verde, âmbar e vermelho nos status, e amarelo, laranja e vermelho na gravidade.
  - O app já faz isso nas abas "Vistorias | Dashboard" e "A receber | Recebidos", com a ativa em preto. A ideia é estender esse padrão ao resto.
- **Pouco sol:** as correções de contraste deixam de ser urgentes e passam a ser "acabamento". A borda dos campos e os textos em #9CA3AF continuam abaixo do mínimo WCAG e também pesam com o celular em brilho baixo, então ficam no plano, mas com prioridade menor.
- **Zoom bloqueado de propósito:** o item 3 sai do plano. A consequência é que, sem poder ampliar, **o tamanho mínimo da letra no celular sobe de prioridade**, porque ninguém consegue compensar uma letra pequena. O zoom das fotos no visualizador continua funcionando, porque ele é próprio do app.
- **Resolução desconhecida:** como notebooks de 1280 e 1366 px são comuns nas empresas, e em 1280 px o resumo do painel já corta ("Recebido com divergên…"), o conserto do layout do computador sobe para o 1º lugar. É um seguro barato.
- **Laudo não impresso:** o PDF é lido na tela, provavelmente no celular ou enviado por mensagem. Então pode usar cor à vontade. Pintar a faixa da avaria com a cor da gravidade e o "Ausente" de vermelho passa a ser um ganho sem custo.

### Plano revisado

| # | Problema | Impacto | Esforço | Correção |
|---|---|---|---|---|
| 1 | Layout do computador quebra abaixo de 1280 px (resumo cortado, ID em 2 linhas, tabela vazando) | Alto | Médio | Item 5 do plano original. |
| 2 | Azul de destaque fora da marca | Alto | Médio | Trocar #1D4ED8 por #111827 nos estados ativos. Pílula ativa: fundo #111827 e texto branco. Etapa atual: barra #111827. Foco: contorno #111827. Links: #111827 sublinhado. Halo do campo em foco: #E5E7EB. Os tokens `--acento` e `--acento-fundo` passam a apontar para esses valores, e assim tudo muda num lugar só. |
| 3 | Letra pequena no celular (sem zoom para compensar) | Alto | Baixo | Item 9 do plano original: piso de 13 px para metadados e 12 px para legendas, e títulos de cartão em 15 px. |
| 4 | Offline discreto demais | Alto | Baixo | Item 4 do plano original, com a faixa em cinza-escuro em vez de amarelo, para seguir a marca. |
| 5 | PDF: faixa da avaria e "Ausente" em preto | Médio | Baixo | Item 14 do plano original. |
| 6 | "Remover" e "Limpar assinatura" em azul | Médio | Baixo | Item 7. Com o fim do azul, eles viram vermelho (#B3261E). |
| 7 | `theme-color` preto com topo branco | Médio | Baixo | Item 6. |
| 8 | Textos em #9CA3AF | Médio | Baixo | Item 2. |
| 9 | Bordas de controle a 1,24:1 | Médio | Baixo | Item 1, usando um cinza (#868E96), o que segue a marca. |
| 10 | Faixas "Nova versão" e "Instalar" brancas | Baixo | Baixo | Item 11, agora em cinza (#F3F4F6 com borda #D1D5DB), sem azul. |
| 11 | Gráfico sem valores; legenda "Anterior" no "Tudo"; barras azuis | Médio | Médio | Item 12. As barras do período atual passam a #111827 e as do anterior ficam em #C7CDD6, igual ao gráfico de "Áreas". |
| 12 | Selo verde a 4,42:1 | Baixo | Baixo | Item 8. |
| 13 | Movimento sem `prefers-reduced-motion` e toque sem resposta | Baixo | Baixo | Itens 16 e 17. |
| 14 | CSS morto, tokens sem uso e documentação desatualizada | Médio (manutenção) | Baixo–Médio | Itens 18, 19 e 20. A documentação nova registra a regra "monocromático + cor só para significado". |
| 15 | Três famílias de botão | Médio | Alto | Item 21. |
| — | Zoom bloqueado | — | — | **Fica como está**, por decisão sua. |
| — | Sombra nos cartões por causa do sol (item 10) | — | — | **Sai do plano:** com pouco sol, não compensa. |

### Direção estética revisada

O caminho é **voltar ao monocromático da marca** sem perder o que o Estilo B trouxe de bom:
- Topo branco, IBM Plex Sans, cartões brancos sobre cinza-claro.
- Preto-azulado #111827 como única cor de ação e de seleção.
- Cor apenas quando ela **significa** algo: status do recebimento, sincronização e gravidade.

Assim o app fica com a cara da PG Prime (preto, branco e cinza), e as cores dos selos ganham força, porque deixam de disputar atenção com o azul.

O logo atual (traço preto sobre branco) já combina com a marca. Só precisa de traço mais grosso para ser lido em tamanho pequeno (item 22).
