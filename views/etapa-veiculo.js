// Etapa 1 — Dados do veículo e as 3 fotos fixas (Frente, Traseira, Chassi).
import { COMBUSTIVEIS, FOTOS_VEICULO, LOJAS } from "../config.js";
import { ARQUIVO, capitalizar, formatarKm, formatarMarca, lerKm, normalizarChassi } from "../formatos.js";
import { faltandoParaFinalizar } from "../validacao.js";
import { $, $$, esc, icone } from "../ui.js";
import { comprimir, escolherFoto, gerarMiniatura, verificarCamera, abrirVisualizador, MENSAGEM_CAMERA_NEGADA } from "../photos.js";

const CAMPOS_TEXTO = [
  { id: "marca", rotulo: "Marca", exemplo: "Ex.: Jeep", formatar: formatarMarca },
  { id: "modelo", rotulo: "Modelo", exemplo: "Ex.: Compass", formatar: capitalizar },
  { id: "cor", rotulo: "Cor", exemplo: "Ex.: Prata", formatar: capitalizar },
];

export const erroDoCampo = (rascunho, campo) =>
  faltandoParaFinalizar(rascunho).find((f) => f.campo === campo)?.mensagem || "";

export function montar(el, editor, ctx) {
  const d = editor.rascunho.dados;
  const urls = [];
  const tocados = new Set();

  el.innerHTML = `
    <section class="pilha" aria-labelledby="titulo-etapa">
      <h2 class="titulo" id="titulo-etapa" tabindex="-1"><label for="loja">Loja de destino</label></h2>
      <div class="campo">
        <select class="entrada" id="loja" aria-describedby="loja-erro">
          <option value="">Escolha a loja</option>
          ${LOJAS.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}
        </select>
        <p class="erro-campo" id="loja-erro" aria-live="polite"></p>
      </div>
    </section>

    <section class="pilha etapa-bloco-separado" aria-labelledby="titulo-dados">
      <h2 class="titulo" id="titulo-dados">Dados do veículo</h2>

      <div class="campo">
        <div class="entre">
          <label class="rotulo" for="chassi">Chassi</label>
          <span class="contador" id="chassi-contador">0/6</span>
        </div>
        <input class="entrada entrada-chassi" id="chassi" type="text" maxlength="6" autocapitalize="characters"
          autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next" aria-describedby="chassi-ajuda chassi-erro">
        <p class="ajuda" id="chassi-ajuda">6 últimos caracteres do chassi.</p>
        <p class="erro-campo" id="chassi-erro" aria-live="polite"></p>
      </div>

      <div class="grade-2">
        ${CAMPOS_TEXTO.map((c) => `
          <div class="campo">
            <label class="rotulo" for="${c.id}">${c.rotulo}</label>
            <input class="entrada" id="${c.id}" type="text" autocapitalize="words" autocomplete="off" enterkeyhint="next"
              placeholder="${c.exemplo}" aria-describedby="${c.id}-erro">
            <p class="erro-campo" id="${c.id}-erro" aria-live="polite"></p>
          </div>`).join("")}
        <div class="campo">
          <label class="rotulo" for="km">Km</label>
          <input class="entrada" id="km" type="text" inputmode="numeric" maxlength="9" autocomplete="off"
            enterkeyhint="done" placeholder="Ex.: 45.300" aria-describedby="km-erro">
          <p class="erro-campo" id="km-erro" aria-live="polite"></p>
        </div>
      </div>

      <fieldset class="campo">
        <legend class="rotulo" id="combustivel-rotulo">Combustível</legend>
        <div class="chips" role="radiogroup" id="combustivel" tabindex="-1" aria-labelledby="combustivel-rotulo">
          ${COMBUSTIVEIS.map((c) => `<button type="button" class="chip" role="radio" aria-checked="false" data-valor="${esc(c)}">${esc(c)}</button>`).join("")}
        </div>
        <p class="erro-campo" id="combustivel-erro" aria-live="polite"></p>
      </fieldset>

    </section>

    <section class="pilha etapa-fotos" aria-labelledby="titulo-fotos">
      <h2 class="titulo" id="titulo-fotos">Fotos do veículo</h2>
      <div class="pilha">
        <p class="ajuda">As 3 fotos são obrigatórias. Toque no quadro para abrir a câmera.</p>
        <div class="fotos-slots">
          ${FOTOS_VEICULO.map((f) => `
            <div class="foto-slot" data-chave="${f.chave}">
              <button type="button" class="foto-alvo" id="foto-${f.chave}"></button>
              <p class="foto-rotulo">${f.rotulo}</p>
              <div class="foto-acoes" hidden>
                <button type="button" class="btn btn-secundario" data-acao="refazer">Refazer</button>
                <button type="button" class="btn btn-perigo" data-acao="remover">Remover</button>
              </div>
            </div>`).join("")}
        </div>
      </div>
    </section>`;

  const mostrarErro = (campo) => {
    const p = $(`#${campo}-erro`, el);
    const msg = tocados.has(campo) ? erroDoCampo(editor.rascunho, campo) : "";
    p.textContent = msg;
    $(`#${campo}`, el)?.setAttribute("aria-invalid", msg ? "true" : "false");
  };

  // ---------- Loja de destino ----------
  const loja = $("#loja", el);
  loja.value = LOJAS.includes(d.loja) ? d.loja : "";
  loja.addEventListener("change", () => {
    editor.alterar((dd) => { dd.loja = loja.value; }, { imediato: true });
    tocados.add("loja");
    mostrarErro("loja");
  });
  loja.addEventListener("blur", () => {
    tocados.add("loja");
    mostrarErro("loja");
  });

  // ---------- Chassi ----------
  const chassi = $("#chassi", el);
  const contador = $("#chassi-contador", el);
  const aplicarChassi = () => {
    const v = normalizarChassi(chassi.value);
    if (v !== chassi.value) chassi.value = v;
    contador.textContent = `${v.length}/6`;
    editor.alterar((dd) => { dd.chassi = v; });
    if (tocados.has("chassi")) mostrarErro("chassi");
  };
  chassi.value = d.chassi;
  contador.textContent = `${d.chassi.length}/6`;
  chassi.addEventListener("input", (e) => {
    // Teclado ainda compondo (Android): o navegador ignora o maxlength nessa fase.
    // Até 6 caracteres não mexe no texto (para não atrapalhar o teclado) e
    // normaliza no compositionend; passou de 6, corta na hora.
    if (e.isComposing && chassi.value.length <= 6) return;
    aplicarChassi();
  });
  chassi.addEventListener("compositionend", aplicarChassi);
  // Colagem: o maxlength="6" cortaria " ab-12 3cd" antes de normalizar; aqui o texto
  // colado é limpo primeiro e só então limitado a 6 caracteres.
  chassi.addEventListener("paste", (e) => {
    const colado = e.clipboardData?.getData("text");
    if (colado == null) return;
    e.preventDefault();
    const inicio = chassi.selectionStart ?? chassi.value.length;
    const fim = chassi.selectionEnd ?? chassi.value.length;
    chassi.value = normalizarChassi(chassi.value.slice(0, inicio) + colado + chassi.value.slice(fim));
    aplicarChassi();
  });
  chassi.addEventListener("blur", () => {
    tocados.add("chassi");
    mostrarErro("chassi");
  });

  // ---------- Marca, modelo, cor ----------
  for (const { id, formatar } of CAMPOS_TEXTO) {
    const input = $(`#${id}`, el);
    input.value = d[id];
    input.addEventListener("input", () => {
      // Formata enquanto digita; o tamanho não muda, então o cursor fica no lugar.
      const formatado = formatar(input.value);
      if (formatado !== input.value) {
        const { selectionStart: ini, selectionEnd: fim } = input;
        input.value = formatado;
        try { input.setSelectionRange(ini, fim); } catch { /* campo sem foco */ }
      }
      editor.alterar((dd) => { dd[id] = input.value; });
      if (tocados.has(id)) mostrarErro(id);
    });
    input.addEventListener("blur", () => {
      tocados.add(id);
      mostrarErro(id);
    });
  }

  // ---------- Km ----------
  const km = $("#km", el);
  km.value = formatarKm(d.km);
  km.addEventListener("input", () => {
    const n = lerKm(km.value);
    const texto = formatarKm(n);
    if (texto !== km.value) km.value = texto;
    editor.alterar((dd) => { dd.km = n; });
    if (tocados.has("km")) mostrarErro("km");
  });
  km.addEventListener("blur", () => {
    tocados.add("km");
    mostrarErro("km");
  });

  // ---------- Combustível ----------
  const chips = $$('[role="radio"]', $("#combustivel", el));
  const marcarChips = () => chips.forEach((c) => c.setAttribute("aria-checked", String(c.dataset.valor === editor.rascunho.dados.combustivel)));
  marcarChips();
  $("#combustivel", el).addEventListener("click", (e) => {
    const chip = e.target.closest('[role="radio"]');
    if (!chip) return;
    editor.alterar((dd) => { dd.combustivel = chip.dataset.valor; }, { imediato: true });
    marcarChips();
    tocados.add("combustivel");
    mostrarErro("combustivel");
  });

  // ---------- Fotos ----------
  async function desenharSlot(slot) {
    const { chave } = slot.dataset;
    const rotulo = FOTOS_VEICULO.find((f) => f.chave === chave).rotulo;
    const alvo = $(".foto-alvo", slot);
    const temFoto = editor.rascunho.dados.fotos[chave];
    const blob = temFoto ? await editor.lerArquivo(ARQUIVO[chave]) : null;
    alvo.classList.toggle("cheia", Boolean(blob));
    $(".foto-acoes", slot).hidden = !blob;
    if (blob) {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      alvo.innerHTML = `<img src="${url}" alt="Foto: ${esc(rotulo)}">`;
      alvo.setAttribute("aria-label", `Ampliar foto: ${rotulo}`);
      alvo.dataset.src = url;
    } else {
      alvo.innerHTML = icone("camera", "ic ic-lg");
      alvo.setAttribute("aria-label", `Tirar foto: ${rotulo}`);
      delete alvo.dataset.src;
    }
  }

  async function capturar(slot) {
    const { chave } = slot.dataset;
    // 1º abre a câmera (iPhone exige que seja no mesmo toque); só depois, sem bloquear, avisa se estiver bloqueada.
    const escolha = escolherFoto();
    verificarCamera().then((estado) => { if (estado === "negada") ctx.avisar(MENSAGEM_CAMERA_NEGADA, "erro"); });
    const arquivo = await escolha;
    if (!arquivo) return;
    const alvo = $(".foto-alvo", slot);
    alvo.innerHTML = icone("carregando", "ic ic-lg gira");
    alvo.setAttribute("aria-busy", "true");
    try {
      const blob = await comprimir(arquivo);
      if (chave === "frente") await editor.gravarArquivo(ARQUIVO.frenteMini, await gerarMiniatura(blob));
      await editor.gravarArquivo(ARQUIVO[chave], blob, (dd) => { dd.fotos[chave] = true; });
    } catch (e) {
      ctx.avisar(e.message, "erro");
    } finally {
      alvo.removeAttribute("aria-busy");
      await desenharSlot(slot);
    }
  }

  async function remover(slot) {
    const { chave } = slot.dataset;
    const rotulo = FOTOS_VEICULO.find((f) => f.chave === chave).rotulo;
    if (!(await ctx.confirmar({ titulo: `Remover a foto ${rotulo}?`, ok: "Remover", perigo: true }))) return;
    await editor.apagarArquivo(ARQUIVO[chave], (dd) => { dd.fotos[chave] = false; });
    if (chave === "frente") await editor.apagarArquivo(ARQUIVO.frenteMini);
    await desenharSlot(slot);
  }

  const slots = $$(".foto-slot", el);
  slots.forEach(desenharSlot);
  $(".fotos-slots", el).addEventListener("click", (e) => {
    const slot = e.target.closest(".foto-slot");
    if (!slot) return;
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "refazer") return capturar(slot);
    if (acao === "remover") return remover(slot);
    const alvo = e.target.closest(".foto-alvo");
    if (!alvo) return;
    if (!alvo.dataset.src) return capturar(slot);
    const cheias = slots.map((s) => $(".foto-alvo", s)).filter((a) => a.dataset.src);
    abrirVisualizador(cheias.map((a) => ({ src: a.dataset.src, legenda: a.getAttribute("aria-label").replace("Ampliar foto: ", "") })), cheias.indexOf(alvo));
  });

  return {
    // Mostra os erros de todos os campos (usado ao tentar finalizar).
    mostrarTodos() {
      ["loja", "chassi", "marca", "modelo", "cor", "km", "combustivel"].forEach((c) => {
        tocados.add(c);
        mostrarErro(c);
      });
    },
    desmontar() {
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
