# Auditoria visual do PrimeCheck

**Data:** 24/11/2026
**Versão analisada:** `main` no commit `b12ad0f` (CACHE_VERSION v144)
**Nenhum arquivo do app foi alterado.** Só foram criados este relatório e a pasta `auditoria-screenshots/`.

---

## Como a análise foi feita

**O app foi aberto de verdade num navegador** (Chromium, pelo Playwright), servido da pasta do projeto em `http://127.0.0.1:3177`.

Para ver as telas de dentro sem usar senha nem tocar no seu Supabase real, **o servidor foi simulado dentro do navegador**: cada pedido ao Supabase foi respondido com 46 vistorias de exemplo (marcas, avarias, recebimentos e fotos falsas). Nenhum pedido saiu para a internet.

**Tamanhos testados** (as telas de celular e tablet usaram um "aparelho Android" simulado, porque o app escolhe o visual pelo aparelho e não pela largura):

| Perfil | Tamanho | Visual que o app mostra |
|---|---|---|
| Celular pequeno | 360×740 | celular |
| Celular comum | 412×915 | celular |
| Tablet | 768×1024 | celular |
| Computador | 1366×768 | computador |
| Computador grande | 1920×1080 | computador |

**Também foram testados:**
- modo app instalado (standalone), modo escuro do sistema e "menos movimento";
- sem internet;
- servidor com erro;
- servidor lento (4 s);
- teclado aberto (simulado reduzindo a altura da tela).

**Medições automáticas** em cada tela: rolagem horizontal, botões menores que 44 px, letras menores que 13 px, contraste de cada texto (norma WCAG) e "pulos" de layout (CLS).

**O que NÃO dá para garantir só com o navegador simulado:**
- tela de abertura (splash) e ícone de verdade na tela inicial do Android;
- cor real da barra de status do Android;
- teclado de verdade do celular;
- "puxar para atualizar" (pull-to-refresh) e rolagem elástica;
- modo escuro forçado do Chrome/Samsung Internet;
- leitura ao sol.

Esses pontos foram analisados **pelo código** e estão marcados como *(pelo código)*.

**Avisos do console:** o único erro que apareceu foi `Service Worker não registrado`. Ele acontece porque o teste **bloqueou** o Service Worker de propósito, para a simulação funcionar. **Não é um problema do app.** Nenhum outro erro ou aviso de JavaScript apareceu em nenhuma tela.

---

## Passo 1 — O projeto

### Tecnologias
- **Sem framework.** É HTML, CSS e JavaScript puro, com módulos ES (`import`/`export`) direto no navegador e sem etapa de build.
- **Supabase** (login, banco e fotos), pela biblioteca `vendor/supabase-2.118.0.umd.js`.
- **jsPDF** para o laudo em PDF.
- **IndexedDB** para guardar vistorias no aparelho (offline).
- **Hospedagem:** Cloudflare Pages (`_headers`) ou Netlify (`netlify.toml`). Servidor local: `serve` (`serve.json`).
- **Fontes servidas pelo próprio site:** IBM Plex Sans e Satoshi (`vendor/fontes/`).

### Arquivos principais
| O quê | Onde |
|---|---|
| Manifest | `manifest.webmanifest` |
| Service Worker | `sw.js` (cache `v144`, guarda o app inteiro para abrir offline) |
| Estilos | `styles.css` (1.948 linhas, um arquivo só) |
| Página única | `index.html` (as telas trocam por `#/rota`) |
| Telas | `views/*.js` (cada tela monta o próprio HTML) |
| Detecção celular × computador | `modo-app.js` (marca `<html class="computador">` ou `app-mode`) |

### Telas que existem
**No celular, tablet e app instalado (vistoriador):**
1. Entrar (login)
2. Início (`#/inicio`): "Iniciar vistoria" e "Vistorias"
3. Lista de vistorias (`#/vistorias`)
4. Vistoria do veículo, o detalhe (`#/vistoria/<id>`)
5. Nova vistoria (`#/nova`), em 4 etapas: Veículo, Checklist, Avarias e Assinaturas
6. Janelas: Nova avaria, Assinar (tela cheia), Visualizador de fotos, Falta preencher, Confirmar saída e Menu da conta

**No navegador do computador (vistoriador):**
1. Entrar
2. Vistorias (painel com tabela)
3. Dashboard (`#/dashboard`)
4. Vistoria do veículo
5. Janelas: Menu da conta e Foto ampliada

**Conta de loja (celular e computador):**
1. Início da loja
2. Recebimentos (abas A receber e Recebidos)
3. Conferência do carro
4. Registrar recebimento

**Outras:** página 404 (`404.html`) e telas de mensagem ("Configure o env.js", "Algo deu errado").

---

## 1. Resumo geral

O PrimeCheck tem um visual **limpo, sóbrio e coerente com a marca** (preto, branco e cinza). Em nenhum dos 5 tamanhos houve rolagem horizontal ou texto estourando. O fluxo de nova vistoria é claro, e a janela "Falta preencher" é um ótimo exemplo de mensagem de erro.

Os problemas mais graves **não são de "beleza", e sim de estados**:
- enquanto a lista carrega, e quando o servidor falha, o app mostra **"Nenhuma vistoria ainda"**;
- no computador, a falha do servidor **não aparece em lugar nenhum**;
- no visualizador de fotos do celular, o título ficou **branco sobre branco**.

No celular, o novo estilo "lista limpa" trouxe três efeitos ruins:
- as opções de **Combustível ficaram invisíveis**: cinza sobre cinza;
- os **campos ficaram sem contorno**;
- o cinza dos textos secundários ficou **um pouco abaixo do contraste mínimo**.

Por fim, o `styles.css` virou **seis camadas de estilo empilhadas**. Uma regra antiga ou nova vence a outra sem querer, e é daí que saem vários desses defeitos.

---

## 2. Problemas, do mais grave ao mais leve

Legenda: **CRÍTICO** = quebra o uso ou deixa algo ilegível · **IMPORTANTE** = atrapalha ou parece amador · **MELHORIA** = polimento.

Os números de linha se referem ao `styles.css` e aos arquivos de `views/` nesta versão.

### CRÍTICO

#### C1. Enquanto carrega, ou quando o servidor falha, a lista diz "Nenhuma vistoria ainda"
- **Telas:** Vistorias no celular e no tablet; Vistorias (painel) no computador.
- **Arquivos:**
  - `views/painel.js:118-129`: o `catch` só faz `console.error` e não avisa ninguém;
  - `views/painel.js:172-177`: o subtítulo nunca fala de erro;
  - `views/vistorias.js:85-107` e `226-228`: o aviso de falha é só uma linha cinza pequena acima do "Nenhuma vistoria ainda".
- **Screenshots:**
  - `estado_carregando_cel-412.png` e `estado_carregando_desk-1366.png`: com o servidor lento, aos 0,9 s;
  - `estado_erro-servidor_desk-1366_20s.png` e `estado_erro-servidor_cel-412_8s.png`: com o servidor fora do ar.
- **O que está errado:**
  - **Enquanto a lista carrega**, aparece o estado vazio: "Nenhuma vistoria ainda" e, no celular, o botão "Fazer a primeira vistoria". Quando os dados chegam, a lista inteira "pula" para o lugar.
  - **Se o servidor falha**, o computador continua mostrando "Nenhuma vistoria ainda" para sempre, sem nenhuma mensagem de erro. O dashboard faz isso certo: mostra "O servidor recusou os dados… Tentar de novo".
- **Por que é um problema:** o gerente ou o vistoriador acredita que **não existe vistoria nenhuma**, quando na verdade o servidor só não respondeu. Pode levar a refazer vistorias ou a decisões erradas. É a mensagem mais enganosa que o app pode dar.
- **Como corrigir:** separar os três estados (carregando, erro e vazio de verdade) e só mostrar "Nenhuma vistoria ainda" quando o servidor respondeu com zero itens.

```js
// ANTES (views/painel.js)
} catch (e) {
  console.error(e);
}

// DEPOIS
} catch (e) {
  console.error(e);
  estado.falhaRemota = true;   // e mostre no lugar da tabela:
  // "Não foi possível carregar as vistorias. [Tentar de novo]"
}
```

```js
// Ao desenhar a lista (painel e vistorias):
if (estado.remotos === null && ctx.online()) {   // ainda buscando
  vazio.innerHTML = `${icone("carregando", "ic gira")} Carregando vistorias…`;
} else if (estado.falhaRemota && !itens.length) {
  vazio.innerHTML = `Não foi possível falar com o servidor. <button …>Tentar de novo</button>`;
} else if (!itens.length) {
  /* aí sim: "Nenhuma vistoria ainda" */
}
```

#### C2. Visualizador de fotos no celular: o título some (branco sobre branco)
- **Telas:** Vistoria do veículo, Nova avaria e Conferência da loja, ao tocar numa foto (celular, tablet e app).
- **Arquivo:** `styles.css:1886` (`html:not(.computador) .cheio-topo { background: #fff; }`) vence `styles.css:1207` (`dialog.visualizador .cheio-topo { background: #000 }`), porque as duas regras têm a mesma força e a de baixo ganha.
- **Screenshot:** `cel-412x915_08-visualizador-foto.png`.
- **O que está errado:** a barra de cima do visualizador ficou **branca**, e o texto dela ("Frente · 2 de 5") é branco. **O título fica invisível**, e uma faixa branca aparece em cima da tela preta.
- **Por que é um problema:** a pessoa não sabe qual foto está vendo, nem quantas há. Além disso, a faixa branca sobre a tela preta parece um erro de layout.
- **Como corrigir:** dar mais força à regra do visualizador.

```css
/* ANTES: nada (a regra geral pinta de branco) */

/* DEPOIS: no fim do styles.css */
html:not(.computador) dialog.visualizador .cheio-topo {
  background: #000;
  border-bottom-color: #1F2937;
}
html:not(.computador) dialog.visualizador .cheio-topo .btn-topo {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
```

### IMPORTANTE

#### I1. Celular: as opções de Combustível não parecem botões (cinza sobre cinza)
- **Tela:** Nova vistoria, etapa 1 (Veículo).
- **Arquivo:** `styles.css:1796`. O `.chip` tem fundo `var(--cl-grupo)` (#F4F4F5), o mesmo cinza do grupo onde ele está (`styles.css:1766-1769`). O contraste é de **1,0:1**.
- **Screenshot:** `cel-412x915_11-nova-etapa1-preenchida.png`. "Gasolina, Diesel, Elétrico, Híbrido" aparecem como texto solto; só a opção escolhida (preta) parece botão.
- **Por que é um problema:** é um campo obrigatório. O vistoriador pode não perceber que precisa tocar numa opção.
- **Como corrigir:**

```css
/* DEPOIS: dentro dos grupos cinza, o chip não escolhido fica branco */
html:not(.computador) :is(#etapa-conteudo > section, .cm-cartao) .chip:not([aria-checked="true"]) {
  background: #fff;
}
```

#### I2. Campos de texto sem contorno visível
- **Telas:**
  - celular: Entrar (campo Senha), busca da lista, janela Nova avaria e todas as etapas da nova vistoria;
  - computador: Entrar.
- **Arquivos:**
  - `styles.css:1786-1787` e `1790`: no celular, o campo cinza #F4F4F5 fica sobre fundo branco, e o campo branco fica sobre o grupo #F4F4F5. O contraste é de **1,10:1** nos dois casos;
  - `styles.css:1546`: no login do computador, só há uma linha embaixo, em #D1D5DB (**1,47:1**).
- **Screenshots:** `cel-412x915_01-login.png` e `cel-412x915_15-dialogo-nova-avaria.png`.
- **Por que é um problema:**
  - a norma WCAG pede **3:1** no contorno de controles;
  - ao sol, ou em tela de celular barata, o campo vira só uma mancha clara e a pessoa não sabe onde tocar;
  - o próprio CSS já tinha resolvido isso: `--linha-forte`, com 3:1, nas linhas 19 e 1268-1271. O estilo "lista limpa" desfez a solução.
- **Como corrigir:** um contorno fino com 3:1, sem mudar o estilo.

```css
/* ANTES (styles.css:1786) */
html:not(.computador) .entrada { … border: 1px solid transparent; background-color: var(--cl-grupo); }

/* DEPOIS */
html:not(.computador) .entrada { … border: 1px solid var(--linha-forte); } /* #8B95A1 = 3:1 no branco */
```

Se o contorno ficar "pesado" demais para o seu gosto, use uma linha só embaixo com a mesma cor (`border: 0; border-bottom: 1px solid var(--linha-forte)`).

#### I3. Texto cinza secundário abaixo do contraste mínimo no celular (4,40:1)
- **Telas:** Início ("Registrar saída"), lista de vistorias (data, loja, "Sem loja"), detalhe (rótulos "Chassi", "Marca"…, "Avaria 1", datas) e ajudas dos campos.
- **Arquivo:** `styles.css:1726`, onde `--cl-3: #6B7280` é usado sobre o grupo `#F4F4F5`. Também `--cinza` (`styles.css:15`), nos mesmos lugares.
- **Medição:** 4,40:1. O mínimo da WCAG para texto pequeno é **4,5:1**. A ferramenta apontou **mais de 150 textos** nessa situação.
- **Por que é um problema:** é por pouco, mas o app é usado no pátio, com luz forte, e o zoom está bloqueado. A data e a loja na lista são informações importantes.
- **Como corrigir:** escurecer um pouco o cinza.

```css
/* ANTES */
html:not(.computador) { --cl-3: #6B7280; }   /* 4,40:1 no grupo */

/* DEPOIS */
html:not(.computador) { --cl-3: #5F6672; }   /* 5,26:1 no grupo, 5,78:1 no branco */
/* e troque var(--cinza) por var(--cl-3) nas classes .cm-* do celular */
```

#### I4. No celular, os campos ganham um contorno duplo e grosso ao receber foco
- **Telas:** Entrar (o campo E-mail já abre assim), janela Nova avaria (o primeiro campo abre assim) e todos os campos da nova vistoria.
- **Arquivo:**
  - `styles.css:901` (`html:not(.computador) :focus-visible { outline: 2px … }`) é **mais forte** que `styles.css:1237` (`.entrada:focus-visible { outline: none; }`);
  - por isso aparecem ao mesmo tempo a borda preta, o contorno de 2 px e o halo.
- **Screenshots:** `cel-412x915_01-login.png`, `cel-412x915_12-teclado-aberto-campo-km.png` e `cel-412x915_15-dialogo-nova-avaria.png`.
- **Por que é um problema:**
  - parece um campo **com erro**, ou "selecionado demais";
  - na janela Nova avaria, o campo "Área" já abre com esse anel, o que chama atenção sem motivo;
  - o comentário da linha 1236 diz justamente que a intenção era evitar o "contorno grosso duplo".
- **Como corrigir:**

```css
/* DEPOIS: no fim do styles.css */
html:not(.computador) .entrada:focus-visible { outline: none; }
/* o foco continua visível pela borda preta da linha 1788 */
```

#### I5. Botões e áreas de toque menores que 44 px no celular
- **Telas e medidas (largura × altura, no celular de 412 px):**

| Elemento | Tamanho | Linha do CSS |
|---|---|---|
| Filtros "Hoje / 7 dias / 30 dias / Todos / Personalizado" | 39 px de altura | `styles.css:1018` e `1834` |
| Opções de Combustível | 40 px | `styles.css:968` |
| "‹ Início", "‹ Vistorias", "‹ Recebimentos" | 36 px | `styles.css:1759` |
| "Atualizar", "Assinar" (botões `.cm-btn`) | 40 px | `styles.css:1781` |
| "Refazer" e "Remover" (fotos da etapa 1) | 40 px | `styles.css:1154` |
| "Ok / Ausente" do checklist | 40 px | `styles.css:1799` |
| Abas "A receber / Recebidos" | 40 px | `styles.css:1058` |
| Botão X de fechar das janelas | 40×40 | `styles.css:1888` |
| Miniaturas das fotos de avaria (tocar para ampliar) | 56×40 | `styles.css:1118-1119` |
| Título "PrimeCheck" no topo (link para o Início) | 88×22 | `styles.css:1740` |

- **Por que é um problema:**
  - o mínimo recomendado para o dedo é **44×44 px**; o Google recomenda 48;
  - quem faz vistoria no pátio pode estar de luva, com pressa ou com a mão suja, e erra o toque;
  - o comentário no topo do CSS (linha 3) promete "alvos ≥ 48 px".
- **Como corrigir:** subir a altura mínima. Na maioria dos casos é trocar um número.

```css
/* DEPOIS (exemplos) */
html:not(.computador) .cm-pilulas .chip,
html:not(.computador) .chip,
html:not(.computador) .cm-btn,
html:not(.computador) .segmentado button,
html:not(.computador) .receb-abas [role="tab"],
html:not(.computador) .foto-acoes .btn { min-height: 44px; }
html:not(.computador) :is(.cm-voltar, .cm-migalhas a) { min-height: 44px; }
html:not(.computador) .cheio-topo .btn-topo { width: 44px; height: 44px; }
html:not(.computador) .topo-link { min-height: 44px; }
```

#### I6. Letras menores que 13 px no celular (e o zoom está bloqueado)
- **Telas:**
  - lista de vistorias: chassi com 12 px, selo de status com **11 px**;
  - detalhe: "Ok" e "Ausente" do checklist com 12 px, legendas das fotos com 12 px, selos de gravidade com 12 px;
  - avatar do topo com 12 px.
- **Arquivos:**
  - `styles.css:1037` (selo de 11 px);
  - `styles.css:1043` (chassi de 12 px);
  - `styles.css:1106-1107` (Ok e Ausente de 12 px);
  - `styles.css:1290` (legenda de 12 px).
- **Por que é um problema:**
  - a própria regra do projeto (`styles.css:1286`) é "letra mínima de 13 px, porque o zoom do app fica bloqueado";
  - como a pessoa não consegue ampliar com os dedos, a letra pequena precisa ser legível de cara;
  - o chassi é a informação mais importante da linha e está entre as menores.
- **Como corrigir:** incluir essas classes na regra da linha 1287.

```css
/* DEPOIS */
html:not(.computador) :is(.cm-linhas .chassi, .cm-checklist .presente, .cm-checklist .ausente,
  .cm-foto figcaption, .cm-item-topo .selo) { font-size: 13px; }
```

#### I7. O ponto das avarias na lista é sempre laranja, seja qual for a gravidade
- **Tela:** Vistorias (celular). Exemplo: "● 2 avarias".
- **Arquivo:** `styles.css:1046` (`.cm-ponto { background: var(--moderada); }`).
- **Screenshot:** `cel-412x915_05-vistorias.png`.
- **Por que é um problema:** no app, laranja quer dizer "Moderada". Uma vistoria só com avaria **Grave** (vermelho) aparece com ponto laranja, e a cor passa uma informação errada.
- **Como corrigir:** usar a cor da avaria mais grave, ou um cinza neutro (só quer dizer "tem avaria").

```css
/* ANTES */
.cm-ponto { … background: var(--moderada); }

/* DEPOIS, opção simples (sem cor de gravidade) */
.cm-ponto { … background: var(--cl-2); }
/* ou, em views/vistorias.js, adicionar a classe .leve/.moderada/.grave da pior avaria */
```

Atenção: a lista usa `damages(count)` (só a quantidade). Para saber a gravidade seria preciso buscar também a coluna `gravidade`. Por isso a opção "cinza neutro" é a mais barata.

#### I8. Status do recebimento na lista do celular só por ícone e cor
- **Tela:** Vistorias (celular): relógio amarelo, ✓ verde ou ! vermelho no canto de cada linha.
- **Arquivo:** `views/card-recebimento.js:18` (`selo-so-icone`) e `styles.css:1039`.
- **Por que é um problema:**
  - quem usa o app pela primeira vez não sabe o que o relógio quer dizer;
  - quem tem dificuldade para distinguir cores depende só do desenho;
  - o leitor de tela fala o nome, porque existe `aria-label`, mas quem enxerga não vê nada escrito;
  - no computador, o mesmo status aparece com texto ("● Aguardando") e é muito mais claro.
- **Como corrigir:** mostrar uma palavra curta ao lado do ícone. Há espaço na linha de baixo, ao lado da loja.

```html
<!-- ANTES --> <span class="selo … selo-so-icone" aria-label="Aguardando">🕒</span>
<!-- DEPOIS --> <span class="selo …">🕒 Aguardando</span>
```

#### I9. Com "menos movimento" ligado, o gráfico do dashboard ainda aparece aos pedaços
- **Tela:** Dashboard (computador).
- **Arquivo:** `styles.css:1303-1305`. A regra zera a **duração** das animações, mas não o **atraso** (`animation-delay`). As barras têm atraso de até 600 ms, e os números de até 980 ms (`styles.css:1587-1649`).
- **Screenshot:** `extra_dashboard-entrada-menos-movimento-400ms.png`. Aos 400 ms, só 2 barras apareceram.
- **Por que é um problema:**
  - quem liga "reduzir movimento" no sistema (por enjoo, enxaqueca ou sensibilidade visual) ainda vê as barras "pipocando" uma a uma;
  - em vez de animar suave, elas pulam, o que é até pior.
- **Como corrigir:**

```css
/* ANTES */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}

/* DEPOIS */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    animation-delay: 0s !important; transition-duration: 0.01ms !important; transition-delay: 0s !important;
  }
}
```

#### I10. O `styles.css` tem seis camadas de estilo empilhadas
- **Arquivo:** `styles.css`, que tem 1.948 linhas. As camadas, em ordem:

| Linhas | Camada |
|---|---|
| 5-525 | estilo original |
| 527-885 | computador "Estilo B" |
| 887-1305 | celular "Estilo B" + revisão de 15/11 |
| 1307-1376 | bloco **"TESTE — estilo Satoshi"** |
| 1378-1705 | computador minimalista |
| 1707-1900 | celular "lista limpa" |
| 1902-1948 | menu animado |

- **O que está errado, em números:**
  - `--principal` é definido **3 vezes** com valores diferentes: #111827 (linha 8), #0F172A (linha 1319) e #111827 de novo (linha 1727). Existem dois "pretos da marca" quase iguais, e o computador usa os dois ao mesmo tempo (`--mn-texto` e `--principal`);
  - **225 cores escritas direto** no código, fora das variáveis. Exemplos: #F9FAFB aparece 17 vezes, #D1D5DB 15 vezes e #9CA3AF 7 vezes, e #C7CDD6, #B8BEC7 e #F1F2F4 também se repetem;
  - **15 tamanhos de letra** diferentes (de 10 a 30 px) e **10 raios de canto** diferentes (2, 4, 6, 8, 10, 12, 14, 16, 20 e 999 px);
  - o bloco marcado como **"TESTE"** continua ativo. Por causa dele, **o computador usa a fonte Satoshi e o celular usa IBM Plex Sans**: o site e o app têm fontes diferentes;
  - a Satoshi só tem os pesos 400, 500 e 700. Onde o CSS pede 600 (títulos `.cb-h1` e `.cb-titulo`), o navegador usa 700. O peso do título não é o que está escrito no código.
- **Por que é um problema:**
  - cada mudança nova precisa "vencer" as regras antigas;
  - é exatamente daí que vieram os problemas C2, I1, I4 e I9: uma regra de baixo desfaz uma de cima sem ninguém perceber;
  - o código fica difícil de entender, inclusive para você.
- **Como corrigir (aos poucos, sem mudar o visual):**
  1. **Decidir a fonte:** Satoshi ou IBM Plex nos dois. Apagar o `@font-face` e o bloco da que sair.
  2. **Juntar as cores numa lista só** no `:root`, com nomes claros, e trocar as cores escritas direto por variáveis.

```css
/* ANTES: espalhado */
background: #F9FAFB;   border: 1px dashed #D1D5DB;   color: #9CA3AF;

/* DEPOIS: um lugar só */
:root {
  --preto: #111827;
  --cinza-50: #F9FAFB;  --cinza-100: #F4F4F5;  --cinza-200: #E5E7EB;
  --cinza-300: #D1D5DB; --cinza-400: #8B95A1;  --cinza-500: #5F6672;
  --raio-sm: 8px; --raio: 12px; --raio-lg: 16px; --raio-pilula: 999px;
}
background: var(--cinza-50);   border: 1px dashed var(--cinza-300);
```

  3. Por fim, apagar as regras que hoje nunca vencem. O topo escuro original (`styles.css:77-126`), por exemplo, é sobrescrito em todos os ambientes.

#### I11. "Finalizar vistoria" quebra em duas linhas no celular pequeno
- **Tela:** Nova vistoria, etapa 4, no celular de 360 px.
- **Arquivo:** `styles.css:984` (`.barra-acoes .btn-primario { flex: 1.4 }`) e o texto em `views/nova.js`.
- **Screenshot:** `cel-360x740_18-nova-etapa4-assinaturas.png`.
- **Por que é um problema:** o botão mais importante do fluxo fica apertado e com cara de improviso. Muitos Androids baratos têm 360 px de largura.
- **Como corrigir:** texto mais curto em telas estreitas, ou impedir a quebra.

```css
/* DEPOIS */
html:not(.computador) .barra-acoes .btn { white-space: nowrap; }
@media (max-width: 380px) { html:not(.computador) .barra-acoes .btn-secundario { flex: 0 0 auto; padding-inline: 16px; } }
```

Outra saída é usar só "Finalizar" como texto do botão.

### MELHORIA

#### M1. Botões de gravidade parecem todos selecionados
- **Tela:** janela Nova avaria. **Arquivo:** `styles.css:302-308`.
- Leve, Moderada e Grave já começam com fundo colorido e borda grossa. Só depois de escolher aparece "✓" e a cor fica mais forte. Ver `cel-412x915_15-dialogo-nova-avaria.png`.
- **Correção:** os não escolhidos ficam brancos, só com a bolinha de cor; o escolhido fica cheio.

```css
html:not(.computador) .gravidade:not([aria-checked="true"]) { background: #fff; border-color: var(--cl-linha); }
html:not(.computador) .gravidade:not([aria-checked="true"])::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: currentColor; }
```

#### M2. O nome do vistoriador parece um campo que dá para editar
- **Tela:** Nova vistoria, etapa 4. **Arquivo:** `styles.css:1793` (`.nome-da-conta`: caixa branca igual aos campos).
- Ele não pode ser editado (vem da conta), mas tem a mesma cara de um campo. A pessoa toca e nada acontece.
- **Correção:** mostrar como texto, sem caixa (`background: none; padding-inline: 0;`), ou com um cadeado pequeno.

#### M3. Indicador de etapas não mostra a etapa que ficou incompleta
- **Tela:** Nova vistoria. **Arquivo:** `styles.css:1862-1876`.
- É possível avançar com a etapa 1 vazia. Ela continua cinza, igual a uma etapa futura, mas a linha que a liga à etapa 2 fica preta. Só no final aparece "Falta preencher".
- **Correção:** um estado "pendente" no círculo da etapa. Por exemplo, um ponto vermelho ou o círculo com borda vermelha, quando a pessoa já passou por ela e faltou algo.

#### M4. Letras de 10 e 11 px no computador
- **Telas:** Dashboard ("dom" com 10 px, eixos e números das barras com 11 px) e detalhe (selo de gravidade com 11 px, em maiúsculas).
- **Arquivos:** `styles.css:799`, `791`, `797`, `809`, `812`, `1436` e `1409` (avatar com 10 px).
- **Correção:** mínimo de 12 px.

#### M5. Animações que gastam bateria ou processamento à toa
- **Arquivos e o que acontece:**
  - `styles.css:1688`: a bolinha do "Online" pulsa **para sempre**, animando `box-shadow`, uma propriedade "pesada" que redesenha a tela a cada quadro;
  - `styles.css:1567`: os números do dashboard entram com `filter: blur()`, que também é pesado;
  - `styles.css:1734`: o topo do celular usa `backdrop-filter: blur(12px)`, que pesa em Android barato na hora de rolar a tela.
- **Correções:**
  - pulsar com `transform: scale()` e `opacity` num `::after`, ou parar depois de 3 pulsos;
  - tirar o `blur` dos números;
  - no topo do celular, usar fundo branco sólido (`background: #fff`) e tirar o `backdrop-filter`. A diferença visual é mínima.

#### M6. Curvas e durações de animação misturadas
- **Arquivo:** `styles.css` inteiro.
- Hoje convivem `ease`, `ease-in`, `ease-out`, `linear`, uma curva suave (`--mn-suave-saida`) e uma curva que **quica** (`--mn-mola`, linha 1910). As durações vão de 0,12 s a 0,7 s. O comentário da linha 1557 diz "sem quicar", mas o menu da conta quica.
- Além disso, os atrasos das barras são 62 regras repetidas (`nth-child(1)` até `nth-child(31)`, linhas 1587-1649).
- **Correção:**

```css
:root { --curva: cubic-bezier(0.16, 1, 0.3, 1); --rapido: 150ms; --medio: 250ms; --lento: 450ms; }
/* atraso por variável, definido no HTML: <div class="db-coluna" style="--i:3"> */
html.computador .db-barra { animation-delay: calc(60ms + var(--i) * 24ms); }
```

#### M7. Celular sem nenhuma transição ao abrir e fechar janelas
- No computador, o menu desce suave. No celular, todas as janelas (Nova avaria, Falta preencher, menu) aparecem e somem de uma vez.
- **Correção (opcional):** um `fade` curto, de 150 ms, nos `dialog[open]` do celular, respeitando o "menos movimento".

#### M8. Fonte trocando ao abrir (pulo de layout no login do computador)
- **Medição:** CLS de **0,079** na tela Entrar do computador (`desk-1366x768_01-login.png`). O ideal é abaixo de 0,1, mas o ideal mesmo é zero. Nas outras telas, o CLS ficou em no máximo 0,013.
- **Causa:** `font-display: swap` (`styles.css:533-536` e `1314-1316`) sem pré-carregar a fonte. O texto aparece com a fonte do sistema e "pula" quando a Satoshi chega.
- **Correção:** no `<head>` do `index.html`:

```html
<link rel="preload" href="vendor/fontes/Satoshi-500.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="vendor/fontes/IBMPlexSans-5.1.1-400.woff2" as="font" type="font/woff2" crossorigin>
```

Ajuste os nomes conforme a fonte escolhida em I10. Depois da primeira visita, o Service Worker já guarda as fontes.

#### M9. Rolagem elástica e "puxar para atualizar" no navegador do celular *(pelo código)*
- Não existe `overscroll-behavior` em nenhum lugar do CSS.
- **O efeito:** no Chrome do Android, aberto como site, puxar a tela para baixo no topo **recarrega a página**, inclusive no meio de uma vistoria. O rascunho é salvo, mas a pessoa perde o lugar e a etapa recarrega.
- No app instalado, o Chrome normalmente não faz pull-to-refresh. Não deu para testar isso aqui.
- **Correção:**

```css
html.app-mode, html.app-mode body { overscroll-behavior-y: contain; }
```

#### M10. Modo escuro forçado pelo celular *(pelo código)*
- O app é só claro (`<meta name="color-scheme" content="light">` em `index.html:6` e `color-scheme: light` em `styles.css:41`). Nos testes com o sistema em modo escuro, ele **continuou claro e correto** (`extra_modo-escuro_*.png`). Isso é bom.
- Mas o "escurecimento automático" do Chrome Android (opção experimental) e o modo noturno do Samsung Internet podem **inverter** as cores à força. `light` sozinho não impede isso.
- **Correção:**

```html
<!-- ANTES --> <meta name="color-scheme" content="light">
<!-- DEPOIS --> <meta name="color-scheme" content="only light">
```

E no CSS: `color-scheme: only light;`.

#### M11. Manifest: dá para deixar a instalação mais bonita
- **Arquivo:** `manifest.webmanifest`.
- **O que já está certo:** nome, ícones de 192 e 512, ícone maskable e cores.
- **O que falta:**
  - **`screenshots`**: o Android mostra uma janela de instalação maior, com fotos do app, quando elas existem. Sem elas, aparece só uma faixa simples;
  - **`id`**: dá uma identidade fixa ao app. Recomendado para não "duplicar" a instalação se o `start_url` mudar;
  - **ícone `monochrome`**: no Android 13+, com "ícones temáticos" ligados, o ícone fica na cor do tema do celular;
  - **ícone maskable de 192 px**: hoje só existe o de 512.

```json
{
  "id": "./",
  "screenshots": [
    { "src": "icons/tela-inicio.png", "sizes": "412x915", "type": "image/png", "form_factor": "narrow", "label": "Início" },
    { "src": "icons/tela-vistoria.png", "sizes": "412x915", "type": "image/png", "form_factor": "narrow", "label": "Nova vistoria" }
  ],
  "icons": [
    …,
    { "src": "icons/app-monocromatico-512.png", "sizes": "512x512", "type": "image/png", "purpose": "monochrome" }
  ]
}
```

- **Ícone maskable conferido:** o desenho ocupa até 203 px do centro, e o limite seguro é 205 px. **Cabe**, com folga mínima: num recorte redondo, o canto inferior direito da prancheta encosta na borda. Se quiser margem, reduza o desenho uns 5%.
- **`orientation: "portrait"`** trava o tablet em pé no app instalado. Se o CD usar tablet deitado, troque para `"any"`. As telas funcionam a 768 px e mais.

#### M12. Barra de status branca com o visualizador de fotos preto
- A cor da barra de status vem de `theme-color` = #FFFFFF (`index.html:5` e manifest), e combina com o topo branco. Isso está certo.
- Mas ao abrir uma foto em tela cheia (fundo preto), a barra de status continua branca.
- **Correção (opcional):** ao abrir o visualizador, trocar a cor por JavaScript, e devolver ao fechar.

```js
document.querySelector('meta[name="theme-color"]').content = "#000000";   // ao abrir
document.querySelector('meta[name="theme-color"]').content = "#FFFFFF";   // ao fechar
```

#### M13. Topo do computador desalinhado do conteúdo em telas grandes
- **Tela:** computador 1920 px (`desk-1920x1080_09-dashboard.png`).
- O conteúdo tem largura máxima de 1.440 px e fica centralizado (`styles.css:1395`). Já o topo ocupa a tela inteira (`styles.css:1398`).
- O resultado: "PrimeCheck" fica no canto esquerdo, longe do título "Dashboard", e a conta fica no canto direito, longe do conteúdo.
- **Correção:**

```css
html.computador .topo { padding-inline: max(24px, calc((100vw - 1440px) / 2 + 40px)); }
```

#### M14. Ícones funcionais muito claros (#9CA3AF, 2,54:1)
- **Arquivos:**
  - `styles.css:1477`: a setinha "abrir" de cada linha da tabela do computador;
  - `styles.css:1410`: a seta da conta;
  - `styles.css:1828`: as setas do Início no celular.
- A WCAG pede 3:1 para ícones que comunicam alguma coisa.
- **Correção:** usar `var(--texto-2)` (#4B5563) ou `#6B7280`.

#### M15. Código morto: "Relatório de envios"
- `views/painel.js:352` liga um clique no botão `#dash-relatorio`, mas **esse botão não existe** no HTML do painel. Com isso, `views/relatorio-envios.js` e cerca de 30 linhas do CSS (`styles.css:712-744`) nunca são usados.
- **Correção:** se a função foi abandonada, apagar. Se foi esquecida, recolocar o botão.

#### M16. Margem do menu da conta não considera o recorte da câmera *(pelo código)*
- `styles.css:452`: no celular, o menu abre a `topo-h + 4px` do alto da tela, sem somar `env(safe-area-inset-top)`. Em aparelhos onde essa medida não é zero (iPhone instalado, por exemplo), o menu pode cobrir o topo.
- **Correção:**

```css
dialog.menu { margin-top: calc(var(--topo-h) + env(safe-area-inset-top, 0px) + 4px); }
```

#### M17. Fotos dos carros cortadas em círculo na lista do celular
- `styles.css:1840` (48 px, `border-radius: 50%`). Uma foto de carro (horizontal) num círculo de 48 px mostra pouca coisa.
- **Correção (opcional):** quadrado arredondado, como antes (`border-radius: 12px; width: 64px; height: 48px;`).

---

## 3. Pontos positivos (manter)

- **Nenhuma rolagem horizontal** em nenhum tamanho (360, 412, 768, 1366 e 1920) e em nenhuma tela. Nomes longos ("Land Rover Range Rover Evoque", "PG Prime Selection João Pessoa") são cortados com "…" no lugar certo.
- **Visual coerente e com cara de produto:**
  - mesmo preto, mesmos grupos cinza, mesmos botões em pílula em todas as telas do celular;
  - no computador, um estilo limpo e corporativo, que lembra ferramentas premium.
- **A janela "Falta preencher"** (`cel-412x915_10-nova-finalizar-com-pendencias.png`) é excelente: lista o que falta, por etapa, e cada item leva até o campo.
- **Gravidade sempre com texto e cor juntos** (Leve, Moderada e Grave), nunca só cor. No celular, os selos têm contraste alto: Leve 10,6:1 e Grave 5,6:1.
- **Faixa de "Sem internet"** escura, clara e bem escrita. O selo "Offline" do topo muda junto.
- **O dashboard trata erro direito:** "O servidor recusou os dados… Tentar de novo". Esse é o modelo para corrigir o problema C1.
- **Quase nenhum pulo de layout:** CLS ≤ 0,013 em todas as telas, menos o login do computador (M8).
- **Campos com letra de 16 px** no celular: o iPhone não dá zoom sozinho ao tocar no campo.
- **Teclado aberto** (simulado): o campo focado continua visível acima da barra "Voltar / Avançar".
- **Safe areas bem tratadas:** topo, barra de ações, avisos e telas cheias usam `env(safe-area-inset-*)`, e `viewport-fit=cover` está no `index.html`.
- **"Menos movimento" respeitado de forma geral**, por uma regra global. Só falta zerar os atrasos (I9).
- **Animações usam as propriedades certas** na maior parte do código: `transform` e `opacity` nas barras do gráfico, no menu, nos botões e nas entradas de tela. Só três exceções (M5).
- **Foco de teclado visível** no computador, com contorno de 2 px.
- **Modo escuro do sistema:** o app continua claro e legível, sem misturar cores pela metade.
- **Fontes, ícones e bibliotecas servidos pelo próprio site** e guardados pelo Service Worker: o app abre offline com o visual completo.
- **Ícone maskable** dentro da zona segura do Android, e `theme-color` branco combinando com o topo branco.

---

## 4. Ordem sugerida de correção

Do maior ganho com menos esforço para o maior esforço:

| # | O quê | Esforço | Ganho |
|---|---|---|---|
| 1 | **C2**: título do visualizador (1 regra de CSS) | 5 min | Texto volta a aparecer |
| 2 | **I1**: chips de Combustível brancos dentro do grupo (1 regra) | 5 min | Campo obrigatório volta a parecer botão |
| 3 | **I4**: contorno duplo dos campos (1 linha) | 2 min | Campos param de parecer "com erro" |
| 4 | **I9**: zerar atrasos no "menos movimento" (2 propriedades) | 2 min | Acessibilidade |
| 5 | **I3**: cinza secundário mais escuro (1 variável) | 5 min | Leitura ao sol, WCAG AA |
| 6 | **I2**: contorno de 3:1 nos campos | 10 min | Campos visíveis ao sol |
| 7 | **I6** + **I5**: letra mínima de 13 px e toques de 44 px (trocar números) | 30 min | Uso com luva ou com pressa |
| 8 | **C1**: estados "Carregando", "Erro" e "Vazio" no painel e na lista | 1–2 h (JavaScript) | Para de dizer que não existem vistorias |
| 9 | **I7**, **I8**, **I11**, **M1**, **M2**: pontos de avaria, status com texto, botão Finalizar, gravidade, nome do vistoriador | 1 h | Clareza |
| 10 | **M8**, **M9**, **M10**, **M12**, **M16**: preload de fonte, `overscroll`, `only light`, `theme-color` do visualizador, menu com safe area | 30 min | Polimento PWA |
| 11 | **M11**: screenshots, `id` e ícone monocromático no manifest | 1 h (precisa gerar imagens) | Instalação mais bonita |
| 12 | **I10**: arrumar o `styles.css` (uma fonte só, variáveis de cor, apagar regras mortas e o bloco "TESTE") | meio dia, aos poucos | Evita que os problemas voltem |
| 13 | **M4**, **M5**, **M6**, **M7**, **M13**, **M14**, **M15**, **M17**: detalhes do computador e das animações | conforme o tempo | Acabamento |

**Dica:** os itens 1 a 6 juntos levam menos de meia hora e resolvem quase tudo o que um usuário percebe no celular. Depois deles, vale fazer o C1, que é o mais sério, mas pede mexer no JavaScript.

---

## Anexo: screenshots (`auditoria-screenshots/`)

**Nome dos arquivos:** `<perfil>_<número>-<tela>.png`
- **Perfis:** `cel-360x740`, `cel-412x915`, `tablet-768x1024`, `desk-1366x768` e `desk-1920x1080`.
- **Arquivos que terminam em `-inteira`:** a página inteira rolada. Neles, as barras fixas (topo e botões de baixo) aparecem no meio da imagem. Isso é **efeito da captura**, não erro do app.

**Celular e tablet**, para cada tamanho:

| # | Tela |
|---|---|
| 01 | login |
| 02 | login enviado vazio |
| 03 | início |
| 04 | menu da conta |
| 05 | lista de vistorias |
| 06 | busca sem resultado |
| 07 | detalhe |
| 08 | visualizador de fotos |
| 09 | nova vistoria vazia |
| 10 | "Falta preencher" |
| 11 | etapa 1 preenchida |
| 12 | teclado aberto |
| 13 | checklist |
| 14 | avarias |
| 15 e 16 | janela Nova avaria (vazia e com erro) |
| 17 | avaria salva |
| 18 | etapa 4 |
| 19 | tela de assinatura |
| 20 | etapa 4 assinada |
| 21 | início com rascunho |
| 22 | confirmar saída |
| 23 | sem internet |
| 24 | servidor com erro |
| 25 a 28 | conta de loja (início, recebimentos, conferência, registrar recebimento) |

**Computador**, para cada tamanho:

| # | Tela |
|---|---|
| 01 | login |
| 02 | vistorias |
| 03 | linha com o mouse em cima |
| 04 | seleção |
| 05 | menu da conta |
| 07 | busca sem resultado |
| 08 | foco pelo teclado |
| 09 | dashboard |
| 10 | barra do gráfico com o mouse em cima |
| 11 | detalhe |
| 12 | foto ampliada |
| 13 | sem internet |
| 14 | servidor com erro |
| 15 | conta de loja |

**Outras capturas:**
- `estado_*`: servidor lento (carregando e carregado) e servidor com erro, aos 2, 8 e 20 segundos;
- `extra_*`: app instalado (standalone), modo escuro e quadros da entrada do dashboard, normal e com "menos movimento".

---

## 5. Correções feitas (24/11/2026, branch `visual/correcoes-auditoria`, CACHE_VERSION v145)

**Corrigidos:**
- **C1, C2:** os dois problemas críticos.
- **I1 a I11:** todos os importantes.
- **Melhorias:** M1 a M14 e M16.

**Fonte (I10):** a pedido, **cada ambiente continua com a sua**: Satoshi no computador e IBM Plex Sans no celular. O `styles.css` foi arrumado sem mudar a aparência:
- o bloco "TESTE" virou o bloco oficial do computador;
- o preto da marca passou a ser definido num lugar só;
- as 6 cores cinza mais repetidas viraram variáveis (46 trocas);
- as 62 regras de atraso do gráfico viraram 2.

**Ficaram de fora de propósito:**
- **M15 (Relatório de envios):** o botão foi escondido por você em 18/11 (commit `f4337ae`, "para um teste") e o código diz que ele volta depois. Não é código esquecido, então nada foi apagado.
- **M17 (fotos redondas na lista):** é parte do desenho "lista limpa" que você aprovou hoje.
- **`orientation: portrait`:** continua igual. Só vale trocar se o CD usar tablet deitado.

**Correção no diagnóstico do M8:** o pulo no login do computador **não** era a fonte. A margem de cima do login "vazava" para fora do `<main>` quando a tela aparecia. A correção foi `display: flow-root` no `<main>` do login, e o CLS caiu de **0,079 para 0,001**.

O pré-carregamento das fontes também foi feito, por `modo-app.js`, só da fonte de cada aparelho. Ele está protegido para não rodar duas vezes, porque o arquivo roda como script do `<head>` e também como import do `dispositivo.js`.

**Manifest:**
- `id`;
- ícone maskable de 192 px;
- ícone monocromático;
- 4 capturas de tela para a janela de instalação do Android (`icons/tela-*.png`, 576 KB no total, **não** guardadas pelo Service Worker).

As capturas usam os **dados de exemplo** da auditoria. Troque por fotos do app de verdade, se preferir.

**Depois das correções, medido de novo** (`auditoria-screenshots/depois-das-correcoes/`):

| Celular e tablet | Antes | Depois |
|---|---|---|
| Botões menores que 44 px | 25 | 1 (o título "PrimeCheck", que ganhou área de toque invisível de 44 px) |
| Letras menores que 13 px | 12 | 0 |
| Textos abaixo do contraste mínimo | 204 | 0 |
| Rolagem horizontal | 0 | 0 |

**Efeito colateral a saber:** na lista do celular, o status agora tem texto ("Aguardando", "Recebido", "Divergência"). Por isso, no celular de 360 px, nomes de modelo longos aparecem mais cortados com "…" ("GWM Haval H6 …").

**Testes:**
- 195 testes de unidade: ok;
- 112 testes do navegador: 0 falhas.
