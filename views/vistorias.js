// Aba "Vistorias": rascunhos em andamento, busca, filtro por período e a
// lista (servidor + aparelho), da mais recente para a mais antiga.
import { ARQUIVO, caminhoRemoto, chaveLocal, formatarDataHora, nomeVistoria, periodo, periodoPersonalizado } from "../formatos.js";
import { $, $$, esc, icone, carregandoHtml } from "../ui.js";
import { seloStatus } from "./detalhe.js";

const PERIODOS = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["todos", "Todos"], ["personalizado", "Personalizado"]];

export async function montar(el, ctx) {
  const usuario = ctx.auth.usuarioAtual();
  const urls = [];
  const estado = { busca: "", periodo: "todos", de: "", ate: "", pagina: 0, temMais: false, remotos: [], falhaRemota: false };
  let ativo = true;
  let geracao = 0;

  el.innerHTML = `
    <div class="pilha">
      <div class="entre">
        <h1 class="titulo">Vistorias</h1>
        <button type="button" class="btn btn-secundario" id="btn-atualizar">${icone("atualizar")} Atualizar</button>
      </div>
      <section id="rascunhos" aria-label="Rascunhos" hidden></section>
      <div class="busca">
        <div class="busca-campo">
          ${icone("busca")}
          <input class="entrada" id="busca" type="search" placeholder="Buscar por chassi, marca, modelo ou número" aria-label="Buscar vistorias" autocomplete="off">
        </div>
        <div class="chips" role="radiogroup" aria-label="Período" id="periodos">
          ${PERIODOS.map(([valor, rotulo]) => `<button type="button" class="chip" role="radio" aria-checked="${valor === "todos"}" data-periodo="${valor}">${rotulo}</button>`).join("")}
        </div>
        <div class="periodo-personalizado" id="personalizado" hidden>
          <div class="campo"><label class="rotulo" for="periodo-de">De</label><input class="entrada" id="periodo-de" type="date"></div>
          <div class="campo"><label class="rotulo" for="periodo-ate">Até</label><input class="entrada" id="periodo-ate" type="date"></div>
        </div>
      </div>
      <p class="pequeno texto-2" id="lista-status" role="status"></p>
      <div class="lista" id="lista">${carregandoHtml()}</div>
      <button type="button" class="btn btn-secundario btn-bloco" id="btn-mais" hidden>Carregar mais</button>
    </div>`;

  const lista = $("#lista", el);
  const status = $("#lista-status", el);

  const intervalo = () => (estado.periodo === "personalizado" ? periodoPersonalizado(estado.de, estado.ate) : periodo(estado.periodo, new Date()));

  function filtrarLocal(v) {
    const { de, ate } = intervalo();
    if (de && v.realizadaEm < de) return false;
    if (ate && v.realizadaEm >= ate) return false;
    const t = estado.busca.trim().toLowerCase();
    if (!t) return true;
    return [v.chassi, v.marca, v.modelo, nomeVistoria(v)].some((x) => String(x || "").toLowerCase().includes(t));
  }

  // ---------- Servidor ----------
  async function buscarRemoto({ reiniciar }) {
    if (!ctx.online()) {
      estado.remotos = [];
      estado.temMais = false;
      return;
    }
    const pagina = reiniciar ? 0 : estado.pagina + 1;
    try {
      const { de, ate } = intervalo();
      const r = await ctx.remoto.listarVistorias({ pagina, busca: estado.busca, de, ate });
      estado.pagina = pagina;
      estado.temMais = r.temMais;
      estado.remotos = reiniciar ? r.itens : [...estado.remotos, ...r.itens];
      estado.falhaRemota = false;
      for (const item of r.itens) {
        if (!(await ctx.storage.obterVistoria(item.id))) await ctx.storage.salvarVistoria(item);
      }
    } catch (e) {
      console.error(e);
      estado.falhaRemota = true;
      if (reiniciar) estado.remotos = [];
    }
  }

  // ---------- Desenho ----------
  async function miniaturas(itens) {
    const fontes = new Map();
    const faltando = [];
    for (const v of itens) {
      const blob = await ctx.storage.obterArquivo(chaveLocal(v.id, ARQUIVO.frenteMini));
      if (blob) {
        const u = URL.createObjectURL(blob);
        urls.push(u);
        fontes.set(v.id, u);
      } else if (v.numero) {
        faltando.push(v);
      }
    }
    if (faltando.length && ctx.online()) {
      try {
        const caminhos = faltando.map((v) => caminhoRemoto(v.userId, v.id, ARQUIVO.frenteMini));
        const assinadas = await ctx.remoto.urlsAssinadas(caminhos);
        faltando.forEach((v, i) => { if (assinadas.get(caminhos[i])) fontes.set(v.id, assinadas.get(caminhos[i])); });
      } catch { /* sem miniaturas remotas agora */ }
    }
    return fontes;
  }

  const cartao = (v, src) => {
    const qtd = v.avariasQtd ?? v.avarias?.length ?? 0;
    return `
      <article class="cartao cartao-vistoria">
        <a class="cartao-vistoria-link" href="#/vistoria/${esc(v.id)}">
          <div class="thumb">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : icone("imagem", "ic ic-lg")}</div>
          <div class="cartao-info">
            <div class="entre"><span class="chassi">${esc(v.chassi)}</span>${seloStatus(v.status)}</div>
            <span class="linha"><span>${formatarDataHora(v.realizadaEm)}</span></span>
            <span>${esc([v.marca, v.modelo].filter(Boolean).join(" "))}</span>
            <span class="linha"><span>${qtd ? `${qtd} ${qtd === 1 ? "avaria" : "avarias"}` : "Sem avarias"}</span></span>
          </div>
        </a>
        ${v.status === "erro" ? `
          <div class="cartao-erro">
            <span>${esc(v.erro || "Erro ao enviar.")}</span>
            <button type="button" class="btn btn-secundario" data-tentar>Tentar novamente</button>
          </div>` : ""}
      </article>`;
  };

  async function desenharRascunhos() {
    const sec = $("#rascunhos", el);
    // Computador não inicia nem continua vistoria: sem rascunhos na lista.
    const rascunhos = ctx.desktop ? [] : await ctx.storage.listarRascunhos(usuario.id);
    sec.hidden = !rascunhos.length;
    if (!rascunhos.length) {
      sec.innerHTML = "";
      return;
    }
    sec.innerHTML = `
      <h2 class="subtitulo">Rascunhos</h2>
      <div class="lista">
        ${rascunhos.map((r) => {
          const d = r.dados;
          const titulo = [d.chassi, d.marca, d.modelo].filter(Boolean).join(" · ") || "Sem dados ainda";
          return `
            <article class="cartao pilha" data-rascunho="${esc(r.id)}">
              <div class="entre"><strong>${esc(titulo)}</strong><span class="selo selo-rascunho">Rascunho</span></div>
              <p class="pequeno texto-2">Etapa ${r.etapa || 1} de 4 · Atualizado em ${formatarDataHora(r.atualizadoEm)}</p>
              <div class="linha-acoes">
                <a class="btn btn-primario" href="#/nova?rascunho=${esc(r.id)}">Continuar</a>
                <button type="button" class="btn btn-texto" data-descartar="${esc(r.id)}">${icone("lixeira")} Descartar</button>
              </div>
            </article>`;
        }).join("")}
      </div>`;
  }

  async function desenharLista() {
    const minha = ++geracao;
    const locais = (await ctx.storage.listarVistorias(usuario.id)).filter((v) => v.status !== "excluindo");
    let itens;
    if (ctx.online() && !estado.falhaRemota) {
      const porId = new Map(estado.remotos.map((v) => [v.id, v]));
      for (const v of locais) {
        if (porId.has(v.id)) porId.set(v.id, { ...porId.get(v.id), ...v });
        else if (v.status !== "sincronizada" && filtrarLocal(v)) porId.set(v.id, v);
      }
      itens = [...porId.values()].filter((v) => v.status !== "excluindo");
    } else {
      // Sem conexão: as do aparelho + as já enviadas de outras pessoas que ficaram guardadas.
      const doAparelho = new Map(locais.map((v) => [v.id, v]));
      for (const v of await ctx.storage.listarSincronizadas()) if (!doAparelho.has(v.id)) doAparelho.set(v.id, v);
      itens = [...doAparelho.values()].filter((v) => v.status !== "excluindo" && filtrarLocal(v));
    }
    itens.sort((a, b) => b.realizadaEm.localeCompare(a.realizadaEm));
    const fontes = await miniaturas(itens);
    if (!ativo || minha !== geracao) return;

    const filtrando = estado.busca.trim() || estado.periodo !== "todos";
    if (!itens.length) {
      if (filtrando) lista.innerHTML = '<div class="vazio">Nenhuma vistoria encontrada para essa busca.</div>';
      else if (!ctx.online() && !locais.length) lista.innerHTML = '<div class="vazio">Sem internet. As vistorias aparecem aqui quando você se conectar.</div>';
      else {
        lista.innerHTML = `
          <div class="vazio">
            <p class="titulo">Nenhuma vistoria ainda</p>
            <p>As vistorias finalizadas aparecem aqui.</p>
            ${ctx.desktop ? "" : `<a class="btn btn-primario" href="#/nova?novo=1">${icone("mais")} Fazer a primeira vistoria</a>`}
          </div>`;
      }
    } else {
      lista.innerHTML = itens.map((v) => cartao(v, fontes.get(v.id))).join("");
    }
    $("#btn-mais", el).hidden = !(ctx.online() && estado.temMais && !estado.falhaRemota);
    status.textContent = !ctx.online()
      ? "Offline: mostrando as vistorias guardadas neste aparelho."
      : estado.falhaRemota ? "Não foi possível atualizar a lista agora. Mostrando as vistorias deste aparelho." : "";
  }

  async function recarregar() {
    $("#btn-atualizar", el).disabled = true;
    await buscarRemoto({ reiniciar: true });
    if (!ativo) return;
    await desenharLista();
    $("#btn-atualizar", el).disabled = false;
  }

  // ---------- Eventos ----------
  let espera = null;
  $("#busca", el).addEventListener("input", (e) => {
    estado.busca = e.target.value;
    clearTimeout(espera);
    espera = setTimeout(recarregar, 300);
  });
  $("#periodos", el).addEventListener("click", (e) => {
    const chip = e.target.closest("[data-periodo]");
    if (!chip) return;
    estado.periodo = chip.dataset.periodo;
    $$("[data-periodo]", el).forEach((c) => c.setAttribute("aria-checked", String(c === chip)));
    $("#personalizado", el).hidden = estado.periodo !== "personalizado";
    recarregar();
  });
  for (const [id, campo] of [["#periodo-de", "de"], ["#periodo-ate", "ate"]]) {
    $(id, el).addEventListener("change", (e) => {
      estado[campo] = e.target.value;
      recarregar();
    });
  }
  $("#btn-atualizar", el).addEventListener("click", async () => {
    $("#btn-atualizar", el).disabled = true;
    await (ctx.sincronizar || ctx.sync.sincronizar)();
    recarregar();
  });
  $("#btn-mais", el).addEventListener("click", async () => {
    const b = $("#btn-mais", el);
    b.disabled = true;
    await buscarRemoto({ reiniciar: false });
    await desenharLista();
    b.disabled = false;
  });
  el.addEventListener("click", async (e) => {
    if (e.target.closest("[data-tentar]")) {
      (ctx.sincronizar || ctx.sync.sincronizar)();
      return;
    }
    const descartar = e.target.closest("[data-descartar]");
    if (descartar) {
      const ok = await ctx.confirmar({ titulo: "Descartar este rascunho?", texto: "Os dados e as fotos dele serão apagados deste aparelho.", ok: "Descartar", perigo: true });
      if (!ok) return;
      await ctx.storage.excluirRascunho(descartar.dataset.descartar);
      ctx.avisar("Rascunho descartado.");
      desenharRascunhos();
    }
  });

  // Quando uma rodada de envio termina, busca o servidor de novo: as vistorias
  // recém-sincronizadas precisam vir na página do servidor para aparecer.
  let estavaSincronizando = false;
  const aoMudar = (e) => {
    if (!ativo) return;
    const sincronizando = Boolean(e.detail?.sincronizando);
    if (estavaSincronizando && !sincronizando) recarregar();
    else desenharLista();
    estavaSincronizando = sincronizando;
  };
  ctx.sync.eventos.addEventListener("mudou", aoMudar);

  await desenharRascunhos();
  await recarregar();

  return {
    desmontar() {
      ativo = false;
      clearTimeout(espera);
      ctx.sync.eventos.removeEventListener("mudou", aoMudar);
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
