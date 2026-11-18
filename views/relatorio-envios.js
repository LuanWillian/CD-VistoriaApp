// "Relatório de carros enviados" (aba Vistorias no computador): monta a mensagem que o
// gerente manda todo dia no grupo do WhatsApp, com os carros vistoriados no dia,
// agrupados por marca. Ele pode escolher só algumas marcas (ex.: só a GWM), editar o
// texto, copiar ou abrir no WhatsApp. O app não posta no grupo: quem envia é a pessoa.
import { marcaDe } from "../dashboard-dados.js";
import { carrosDoDia, diaDoCampo, marcasDosCarros, textoCarrosEnviados } from "../painel-dados.js";
import { $, $$, esc, icone } from "../ui.js";

const dataBr = (dia) => dia.split("-").reverse().join("/");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// itens: as vistorias da aba Vistorias. avisar: aviso rápido no canto da tela.
export function abrirRelatorioEnvios(itens, { avisar = () => {}, agora = new Date() } = {}) {
  const estado = { dia: diaDoCampo(agora.toISOString()), marcas: null }; // marcas null = todas
  const d = document.createElement("dialog");
  d.className = "re-dialogo";
  d.setAttribute("aria-labelledby", "re-titulo");
  d.innerHTML = `
    <div class="re-topo">
      <div><h2 id="re-titulo">Relatório de carros enviados</h2>
        <p class="re-sub">Texto pronto para mandar no grupo do WhatsApp.</p></div>
      <button type="button" class="re-fechar" data-fechar aria-label="Fechar">${icone("x")}</button>
    </div>
    <div class="re-linha"><label for="re-dia">Dia</label><input type="date" class="cb-data" id="re-dia"></div>
    <div class="re-linha"><span id="re-rot-marcas">Marcas</span><div class="re-marcas" id="re-marcas" role="group" aria-labelledby="re-rot-marcas"></div></div>
    <div class="re-meio">
      <textarea class="re-texto" id="re-texto" rows="12" spellcheck="false" aria-label="Texto da mensagem"></textarea>
      <p class="re-nota" id="re-nota" role="status"></p>
    </div>
    <div class="re-acoes">
      <button type="button" class="cb-btn" data-whatsapp>${icone("conversa")} Abrir no WhatsApp</button>
      <button type="button" class="cb-btn cb-btn-primario" data-copiar>${icone("copiar")} Copiar mensagem</button>
    </div>`;
  const campoDia = $("#re-dia", d);
  const texto = $("#re-texto", d);
  campoDia.value = estado.dia;

  function desenhar() {
    const carros = carrosDoDia(itens, estado.dia);
    const marcas = marcasDosCarros(carros);
    // Marca escolhida que não existe no dia novo: volta para todas.
    if (estado.marcas && !estado.marcas.every((m) => marcas.some((x) => x.nome === m))) estado.marcas = null;
    const todas = !estado.marcas;
    const escolhida = (m) => todas || estado.marcas.includes(m);
    $("#re-marcas", d).innerHTML = marcas.length
      ? [`<button type="button" class="re-marca" data-marca="" aria-pressed="${todas}">${todas ? icone("check") : ""}Todas (${carros.length})</button>`,
        ...marcas.map((m) => `<button type="button" class="re-marca" data-marca="${esc(m.nome)}" aria-pressed="${!todas && escolhida(m.nome)}">${!todas && escolhida(m.nome) ? icone("check") : ""}${esc(m.nome)} (${m.qtd})</button>`)].join("")
      : '<span class="re-sem">—</span>';
    texto.value = textoCarrosEnviados(carros, estado.marcas);
    const n = carros.filter((v) => escolhida(marcaDe(v))).length;
    $("#re-nota", d).innerHTML = !carros.length
      ? `Nenhuma vistoria em ${esc(dataBr(estado.dia || "----"))}. Escolha outro dia.`
      : `<strong>${todas ? plural(carros.length, "carro", "carros") : `${n} de ${carros.length} carros`}</strong> do dia · agrupado por marca, na ordem em que saíram. Dá para editar o texto antes de copiar.`;
    for (const b of $$(".re-acoes button", d)) b.disabled = !texto.value.trim();
  }

  async function copiar() {
    const valor = texto.value;
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      texto.select();
      document.execCommand?.("copy");
    }
    avisar("Mensagem copiada. É só colar no grupo do WhatsApp.", "sucesso");
  }

  d.addEventListener("click", (e) => {
    if (e.target.closest("[data-fechar]")) return d.close();
    const b = e.target.closest("[data-marca]");
    if (b) {
      const m = b.dataset.marca;
      if (!m) estado.marcas = null;
      else if (!estado.marcas) estado.marcas = [m];
      else if (estado.marcas.includes(m)) estado.marcas = estado.marcas.filter((x) => x !== m);
      else estado.marcas = [...estado.marcas, m];
      const total = marcasDosCarros(carrosDoDia(itens, estado.dia)).length;
      if (estado.marcas && (!estado.marcas.length || estado.marcas.length === total)) estado.marcas = null;
      desenhar();
      $(`[data-marca="${CSS.escape(m)}"]`, d)?.focus();
      return;
    }
    if (e.target.closest("[data-copiar]")) copiar();
    if (e.target.closest("[data-whatsapp]")) window.open(`https://wa.me/?text=${encodeURIComponent(texto.value)}`, "_blank", "noopener");
  });
  campoDia.addEventListener("change", () => { estado.dia = campoDia.value; desenhar(); });
  const anterior = document.activeElement;
  d.addEventListener("close", () => { d.remove(); anterior?.focus?.(); });

  desenhar();
  document.body.append(d);
  d.showModal();
  $("[data-copiar]", d).disabled ? campoDia.focus() : $("[data-copiar]", d).focus();
  return d;
}
