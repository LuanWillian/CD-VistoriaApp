// Painel do navegador do computador (#/inicio quando ctx.desktop): saudação,
// métricas, busca, filtros e tabela de vistorias. Só consulta: não existe
// iniciar vistoria aqui. Os dados são os da tela Vistorias (servidor quando há
// conexão, senão o que está guardado no aparelho).
import { ITENS_POR_PAGINA_PAINEL, LOJAS, NOME_PADRAO_PAINEL } from "../config.js";
import { SEM_LOJA, marcasDisponiveis } from "../dashboard-dados.js";
import { formatarDataHora, nomeVistoria } from "../formatos.js";
import { filtrarVistorias, maisRecentesPrimeiro, paginar, primeiroNome } from "../painel-dados.js";
import { $, $$, esc, icone } from "../ui.js";
import { seloStatus } from "./detalhe.js";

// Mesmos períodos do dashboard, mais "Todos" (o padrão da lista).
const PERIODOS = [["todos", "Todos"], ["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["personalizado", "Personalizado"]];
const hojeCampo = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const LIMITE_PAGINAS_SERVIDOR = 50;

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export async function montar(raiz, ctx) {
  const usuario = ctx.auth.usuarioAtual();
  const estado = {
    busca: "", periodo: "todos", de: hojeCampo(new Date(Date.now() - 29 * 86400000)), ate: hojeCampo(),
    marca: "", loja: "", pagina: 0, itens: [], remotos: null, carregando: true,
  };
  let ativo = true;
  let geracao = 0;

  raiz.innerHTML = `
    <div class="dashboard-desktop pilha">
      <h1 class="titulo" id="dash-saudacao"></h1>
      <section class="secao dash-tabela-bloco" aria-labelledby="dash-titulo-tabela">
        <h2 class="sr-only" id="dash-titulo-tabela">Vistorias</h2>
        <div class="dash-ferramentas">
          <div class="busca-campo">
            ${icone("busca")}
            <input class="entrada" id="dash-busca" type="search" placeholder="Buscar por chassi, marca, modelo..." aria-label="Buscar vistorias" autocomplete="off">
          </div>
          <button type="button" class="btn btn-texto" id="dash-atualizar">${icone("atualizar")} Atualizar</button>
        </div>
        <div class="dash-filtros">
          <div class="db-segmentos" role="radiogroup" aria-label="Período" id="dash-periodos">
            ${PERIODOS.map(([valor, rotulo]) => `<button type="button" role="radio" aria-checked="${valor === "todos"}" data-periodo="${valor}">${valor === "personalizado" ? `${rotulo} ${icone("calendario", "ic db-ic-peq")}` : rotulo}</button>`).join("")}
          </div>
          <select class="entrada db-select" id="dash-marca" aria-label="Marca"><option value="">Todas as marcas</option></select>
          <select class="entrada db-select" id="dash-loja" aria-label="Loja de destino">
            <option value="">Todas as lojas</option>
            ${LOJAS.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}
            <option value="${esc(SEM_LOJA)}">${esc(SEM_LOJA)}</option>
          </select>
        </div>
        <div class="db-datas dash-datas" id="dash-datas" hidden>
          <label>De <input class="entrada" type="date" id="dash-de"></label>
          <label>Até <input class="entrada" type="date" id="dash-ate"></label>
        </div>
        <p class="pequeno texto-2" id="dash-status" role="status"></p>
        <div class="dash-rolagem">
          <table class="dash-tabela">
            <thead>
              <tr>
                <th scope="col">ID</th><th scope="col">Data/Hora</th><th scope="col">Veículo</th>
                <th scope="col">Chassi</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody id="dash-corpo"></tbody>
          </table>
        </div>
        <div class="dash-vazio" id="dash-vazio" hidden></div>
        <nav class="dash-paginacao" id="dash-paginacao" aria-label="Paginação" hidden>
          <span id="dash-contador" role="status"></span>
          <span class="linha-acoes">
            <button type="button" class="btn btn-secundario" id="dash-anterior">Anterior</button>
            <button type="button" class="btn btn-secundario" id="dash-proxima">Próxima</button>
          </span>
        </nav>
      </section>
    </div>`;

  $("#dash-saudacao", raiz).textContent = `Olá, ${primeiroNome(usuario?.nome) || NOME_PADRAO_PAINEL}! Aqui estão todas as vistorias registradas.`;
  const corpo = $("#dash-corpo", raiz);

  // ---------- Dados ----------
  async function lerLocais() {
    const locais = (await ctx.storage.listarVistorias(usuario.id)).filter((v) => v.status !== "excluindo");
    if (ctx.online() && estado.remotos) {
      // Mesma regra da tela Vistorias: o servidor manda; do aparelho só entram as ainda não enviadas.
      const porId = new Map(estado.remotos.map((v) => [v.id, v]));
      for (const v of locais) {
        if (porId.has(v.id)) porId.set(v.id, { ...porId.get(v.id), ...v });
        else if (v.status !== "sincronizada") porId.set(v.id, v);
      }
      return [...porId.values()].filter((v) => v.status !== "excluindo");
    }
    const doAparelho = new Map(locais.map((v) => [v.id, v]));
    for (const v of await ctx.storage.listarSincronizadas()) if (!doAparelho.has(v.id)) doAparelho.set(v.id, v);
    return [...doAparelho.values()].filter((v) => v.status !== "excluindo");
  }

  // Busca todas as páginas do servidor (a mesma chamada da tela Vistorias, sem filtros).
  async function buscarRemotos() {
    estado.remotos = null;
    if (!ctx.online()) return;
    try {
      const todos = [];
      for (let p = 0; p < LIMITE_PAGINAS_SERVIDOR; p++) {
        const r = await ctx.remoto.listarVistorias({ pagina: p });
        todos.push(...r.itens);
        for (const item of r.itens) {
          if (!(await ctx.storage.obterVistoria(item.id))) await ctx.storage.salvarVistoria(item);
        }
        if (!r.temMais) break;
      }
      estado.remotos = todos;
    } catch (e) {
      console.error(e);
    }
  }

  // ---------- Desenho ----------
  function linha(v) {
    const tr = el("tr");
    tr.dataset.id = v.id;
    const id = el("td", "dash-id", nomeVistoria(v));
    const data = el("td", "dash-num", formatarDataHora(v.realizadaEm));
    const veiculo = el("td", "dash-corta", [v.marca, v.modelo].filter(Boolean).join(" ") || "—");
    veiculo.title = veiculo.textContent;
    const chassi = el("td", "dash-chassi", v.chassi || "—");
    const status = el("td");
    status.insertAdjacentHTML("beforeend", seloStatus(v.status)); // texto fixo do app, sem dados digitados
    const acoes = el("td", "dash-acoes");
    const ver = el("a", "btn btn-icone btn-texto");
    ver.href = `#/vistoria/${encodeURIComponent(v.id)}`;
    ver.title = "Ver detalhes";
    ver.setAttribute("aria-label", `Ver detalhes da vistoria ${nomeVistoria(v)}`);
    ver.insertAdjacentHTML("beforeend", icone("avancar"));
    acoes.append(ver);
    tr.append(id, data, veiculo, chassi, status, acoes);
    return tr;
  }

  function desenharTabela() {
    const filtrados = maisRecentesPrimeiro(filtrarVistorias(estado.itens, estado));
    const p = paginar(filtrados, estado.pagina, ITENS_POR_PAGINA_PAINEL);
    estado.pagina = p.pagina;
    corpo.replaceChildren(...p.itens.map(linha));

    const vazio = $("#dash-vazio", raiz);
    vazio.replaceChildren();
    vazio.hidden = p.total > 0 || estado.carregando;
    if (!vazio.hidden) {
      if (estado.itens.length) {
        vazio.append(el("p", "", "Nenhuma vistoria encontrada."));
        const limpar = el("button", "btn btn-secundario", "Limpar filtros");
        limpar.type = "button";
        limpar.dataset.limpar = "";
        vazio.append(limpar);
      } else {
        vazio.append(el("p", "", "Nenhuma vistoria ainda."));
      }
    }
    if (estado.carregando && !estado.itens.length) {
      vazio.hidden = false;
      vazio.append(el("p", "", "Carregando…"));
    }
    const pag = $("#dash-paginacao", raiz);
    pag.hidden = p.total === 0;
    $("#dash-contador", raiz).textContent = `Mostrando ${p.de}–${p.ate} de ${p.total}`;
    $("#dash-anterior", raiz).disabled = p.pagina <= 0;
    $("#dash-proxima", raiz).disabled = p.pagina >= p.paginas - 1;
    $("#dash-status", raiz).textContent = !ctx.online() ? "Offline: mostrando as vistorias guardadas neste aparelho." : "";
  }

  // Marcas das vistorias carregadas (a escolhida continua na lista mesmo sem itens).
  function atualizarMarcas() {
    const sel = $("#dash-marca", raiz);
    const marcas = marcasDisponiveis(estado.itens);
    if (estado.marca && !marcas.includes(estado.marca)) marcas.push(estado.marca);
    sel.replaceChildren(new Option("Todas as marcas", ""), ...marcas.map((m) => new Option(m, m)));
    sel.value = estado.marca;
  }

  async function atualizarDados() {
    const minha = ++geracao;
    const itens = await lerLocais();
    if (!ativo || minha !== geracao) return;
    estado.itens = itens;
    estado.carregando = false;
    atualizarMarcas();
    desenharTabela();
  }

  async function recarregar() {
    $("#dash-atualizar", raiz).disabled = true;
    await buscarRemotos();
    if (!ativo) return;
    await atualizarDados();
    if (ativo) $("#dash-atualizar", raiz).disabled = false;
  }

  // ---------- Eventos ----------
  let espera = null;
  $("#dash-busca", raiz).addEventListener("input", (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.busca = e.target.value;
      estado.pagina = 0;
      desenharTabela();
    }, 200);
  });
  const definirPeriodo = (valor) => {
    estado.periodo = valor;
    estado.pagina = 0;
    $$("[data-periodo]", raiz).forEach((c) => c.setAttribute("aria-checked", String(c.dataset.periodo === valor)));
    $("#dash-datas", raiz).hidden = valor !== "personalizado";
  };
  for (const [id, campo] of [["dash-de", "de"], ["dash-ate", "ate"]]) {
    $(`#${id}`, raiz).value = estado[campo];
    $(`#${id}`, raiz).addEventListener("change", (e) => {
      estado[campo] = e.target.value;
      estado.pagina = 0;
      desenharTabela();
    });
  }
  for (const [id, campo] of [["dash-marca", "marca"], ["dash-loja", "loja"]]) {
    $(`#${id}`, raiz).addEventListener("change", (e) => {
      estado[campo] = e.target.value;
      estado.pagina = 0;
      desenharTabela();
    });
  }
  $("#dash-periodos", raiz).addEventListener("click", (e) => {
    const chip = e.target.closest("[data-periodo]");
    if (!chip) return;
    definirPeriodo(chip.dataset.periodo);
    desenharTabela();
  });
  $("#dash-atualizar", raiz).addEventListener("click", async () => {
    $("#dash-atualizar", raiz).disabled = true;
    await (ctx.sincronizar || ctx.sync.sincronizar)();
    recarregar();
  });
  $("#dash-anterior", raiz).addEventListener("click", () => { estado.pagina -= 1; desenharTabela(); });
  $("#dash-proxima", raiz).addEventListener("click", () => { estado.pagina += 1; desenharTabela(); });
  $("#dash-vazio", raiz).addEventListener("click", (e) => {
    if (!e.target.closest("[data-limpar]")) return;
    clearTimeout(espera);
    estado.busca = "";
    $("#dash-busca", raiz).value = "";
    estado.marca = "";
    estado.loja = "";
    $("#dash-marca", raiz).value = "";
    $("#dash-loja", raiz).value = "";
    definirPeriodo("todos");
    desenharTabela();
  });
  // Linha inteira abre os detalhes; o botão da linha é um link e navega sozinho
  // (por isso o clique nele não passa por aqui). Selecionar texto não navega.
  corpo.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    if (globalThis.getSelection?.().toString()) return;
    const tr = e.target.closest("tr[data-id]");
    if (tr) ctx.navegar(`#/vistoria/${encodeURIComponent(tr.dataset.id)}`);
  });

  // Uma rodada de envio que termina traz novas vistorias do servidor.
  let estavaSincronizando = false;
  const aoMudar = (e) => {
    if (!ativo) return;
    const sincronizando = Boolean(e.detail?.sincronizando);
    if (estavaSincronizando && !sincronizando) recarregar();
    else atualizarDados();
    estavaSincronizando = sincronizando;
  };
  ctx.sync.eventos.addEventListener("mudou", aoMudar);

  desenharTabela(); // mostra "Carregando…" enquanto lê
  await atualizarDados(); // offline ou local: já aparece o que está guardado
  recarregar();

  return {
    desmontar() {
      ativo = false;
      clearTimeout(espera);
      ctx.sync.eventos.removeEventListener("mudou", aoMudar);
    },
  };
}
