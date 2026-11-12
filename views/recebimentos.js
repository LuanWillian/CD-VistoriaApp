// Tela "Recebimentos" (#/recebimentos), da conta de loja: carros enviados para a
// loja dela, em duas abas (A receber / Recebidos), com busca pelo chassi.
// Precisa de internet: a lista vem do servidor (o RLS já filtra pela loja).
import { ARQUIVO, caminhoRemoto, formatarDataHora, formatarMarca, nomeVistoria } from "../formatos.js";
import { buscarRecebimentos, separarRecebimentos } from "../recebimento-dados.js";
import { $, $$, esc, icone } from "../ui.js";
import { seloRecebimento } from "./card-recebimento.js";

function aviso(el, texto) {
  el.innerHTML = `<div class="pilha"><h1 class="titulo">Recebimentos</h1><div class="vazio">${esc(texto)}</div></div>`;
}

export async function montar(el, ctx) {
  const usuario = ctx.auth.usuarioAtual();
  if (!usuario?.loja) {
    aviso(el, "Sua conta não tem loja cadastrada. Peça ao administrador.");
    return {};
  }
  if (!ctx.online()) {
    aviso(el, "Sem internet. Os recebimentos precisam de conexão.");
    return {};
  }

  const estado = { aba: "receber", busca: "", itens: [], fotos: new Map() };
  let ativo = true;
  let espera = null;

  el.innerHTML = `
    <div class="pilha receb-tela">
      <div>
        <h1 class="cm-h1">Recebimentos</h1>
        <p class="cm-sub">${icone("fachada")} ${esc(usuario.loja)}</p>
      </div>
      <div class="cm-cartao cm-lista-cartao">
        <div class="cm-ferramentas">
          <div class="receb-abas" role="tablist" aria-label="Recebimentos">
            <button type="button" role="tab" id="aba-receber" data-aba="receber" aria-selected="true" aria-controls="receb-lista">A receber</button>
            <button type="button" role="tab" id="aba-recebidos" data-aba="recebidos" aria-selected="false" aria-controls="receb-lista">Recebidos</button>
          </div>
          <div class="busca-campo">
            ${icone("busca")}
            <input class="entrada" id="receb-busca" type="search" placeholder="Buscar pelo chassi..." aria-label="Buscar pelo chassi" autocomplete="off">
          </div>
        </div>
        <div class="lista cm-linhas" id="receb-lista" role="tabpanel" aria-busy="true"><div class="vazio">Carregando…</div></div>
        <p class="cm-rodape" id="receb-rodape" hidden></p>
      </div>
    </div>`;
  const lista = $("#receb-lista", el);

  const cartao = (v) => {
    const src = estado.fotos.get(v.id);
    const r = v.recebimento;
    const veiculo = [formatarMarca(v.marca ?? ""), v.modelo].filter(Boolean).join(" ") || "Veículo";
    return `
      <article class="cartao cartao-vistoria">
        <a class="cartao-vistoria-link" href="#/recebimento/${esc(v.id)}">
          <div class="thumb">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : icone("imagem", "ic ic-lg")}</div>
          <div class="cartao-info">
            <span class="cm-item-topo"><span class="cm-item-titulo">${esc(veiculo)}</span>${seloRecebimento(v, { curto: true })}</span>
            <span class="cm-item-linha"><span class="chassi">${esc(v.chassi)}</span> · ${esc(nomeVistoria(v))}</span>
            <span class="cm-item-linha">${r ? `Recebido por ${esc(r.recebedorNome)} · ${formatarDataHora(r.recebidoEm)}` : `Enviada em ${formatarDataHora(v.realizadaEm)}`}</span>
          </div>
        </a>
      </article>`;
  };

  function desenhar() {
    const { aReceber, recebidos } = separarRecebimentos(estado.itens);
    $("#aba-receber", el).textContent = `A receber (${aReceber.length})`;
    $("#aba-recebidos", el).textContent = `Recebidos (${recebidos.length})`;
    $$('[role="tab"]', el).forEach((a) => a.setAttribute("aria-selected", String(a.dataset.aba === estado.aba)));
    const daAba = estado.aba === "receber" ? aReceber : recebidos;
    const filtrados = buscarRecebimentos(daAba, estado.busca);
    lista.setAttribute("aria-busy", "false");
    if (!daAba.length) {
      lista.innerHTML = `<div class="vazio">${estado.aba === "receber" ? "Nenhum carro a receber." : "Nenhum carro recebido ainda."}</div>`;
    } else if (!filtrados.length) {
      lista.innerHTML = '<div class="vazio">Nenhum carro encontrado para essa busca.</div>';
    } else {
      lista.innerHTML = filtrados.map(cartao).join("");
    }
    const rodape = $("#receb-rodape", el);
    rodape.hidden = !filtrados.length || estado.aba !== "receber";
    rodape.textContent = "Os mais antigos aparecem primeiro.";
  }

  async function carregarFotos() {
    const caminhos = estado.itens.map((v) => caminhoRemoto(v.userId, v.id, ARQUIVO.frenteMini));
    try {
      const assinadas = await ctx.remoto.urlsAssinadas(caminhos);
      estado.itens.forEach((v, i) => { if (assinadas.get(caminhos[i])) estado.fotos.set(v.id, assinadas.get(caminhos[i])); });
    } catch { /* sem miniaturas agora */ }
  }

  async function carregar() {
    try {
      estado.itens = await ctx.remoto.listarParaLoja();
      if (!ativo) return;
      desenhar();
      await carregarFotos();
      if (ativo) desenhar();
    } catch (e) {
      console.error(e);
      if (!ativo) return;
      lista.setAttribute("aria-busy", "false");
      lista.innerHTML = `<div class="vazio"><p>${esc(ctx.remoto.classificarErro(e, ctx.online()).mensagem)}</p>
        <button type="button" class="btn btn-secundario" data-tentar>${icone("atualizar")} Tentar de novo</button></div>`;
    }
  }

  $(".receb-abas", el).addEventListener("click", (e) => {
    const aba = e.target.closest("[data-aba]");
    if (!aba) return;
    estado.aba = aba.dataset.aba;
    desenhar();
  });
  $("#receb-busca", el).addEventListener("input", (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.busca = e.target.value;
      desenhar();
    }, 200);
  });
  lista.addEventListener("click", (e) => { if (e.target.closest("[data-tentar]")) carregar(); });

  await carregar();
  return {
    desmontar() {
      ativo = false;
      clearTimeout(espera);
    },
  };
}
