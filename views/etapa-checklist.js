// Etapa 2 — Checklist de itens do veículo (Presente / Ausente).
// A lista de itens vem de CHECKLIST_ITENS em config.js.
import { CHECKLIST_ITENS } from "../config.js";
import { $, $$, esc } from "../ui.js";

export function montar(el, editor, ctx) {
  el.innerHTML = `
    <section class="pilha" aria-labelledby="titulo-etapa">
      <div>
        <h2 class="titulo" id="titulo-etapa" tabindex="-1">Checklist</h2>
        <p class="texto-2"><span id="checklist-contador">0 de ${CHECKLIST_ITENS.length}</span> itens marcados</p>
      </div>
      <div class="linha-acoes">
        <button type="button" class="btn btn-secundario" data-acao="todos">Marcar todos como Presente</button>
        <button type="button" class="btn btn-texto" data-acao="limpar">Limpar</button>
      </div>
      <div class="secao checklist">
        ${CHECKLIST_ITENS.map((item, i) => `
          <fieldset class="item-checklist" id="chk-${i}" tabindex="-1" data-item="${esc(item)}">
            <legend>${esc(item)}</legend>
            <div class="segmentado" role="radiogroup" aria-label="${esc(item)}">
              <button type="button" role="radio" aria-checked="false" data-valor="presente">Presente</button>
              <button type="button" role="radio" aria-checked="false" data-valor="ausente">Ausente</button>
            </div>
          </fieldset>`).join("")}
      </div>
      <div class="campo">
        <label class="rotulo" for="checklist-obs">Observação geral <span class="opcional">(opcional)</span></label>
        <textarea class="entrada" id="checklist-obs" rows="3" placeholder="Ex.: estepe sem calota, tapete traseiro rasgado"></textarea>
      </div>
    </section>`;

  const contador = $("#checklist-contador", el);
  const obs = $("#checklist-obs", el);

  function desenhar() {
    const marcados = editor.rascunho.dados.checklist;
    $$(".item-checklist", el).forEach((grupo) => {
      const valor = marcados[grupo.dataset.item];
      $$('[role="radio"]', grupo).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.valor === valor)));
    });
    const n = CHECKLIST_ITENS.filter((i) => marcados[i]).length;
    contador.textContent = `${n} de ${CHECKLIST_ITENS.length}`;
  }

  el.addEventListener("click", async (e) => {
    const radio = e.target.closest('[role="radio"]');
    if (radio) {
      const item = radio.closest(".item-checklist").dataset.item;
      editor.alterar((d) => { d.checklist = { ...d.checklist, [item]: radio.dataset.valor }; }, { imediato: true });
      desenhar();
      return;
    }
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "todos") {
      editor.alterar((d) => { d.checklist = Object.fromEntries(CHECKLIST_ITENS.map((i) => [i, "presente"])); }, { imediato: true });
      desenhar();
    }
    if (acao === "limpar") {
      const algum = Object.keys(editor.rascunho.dados.checklist).length > 0;
      if (algum && !(await ctx.confirmar({ titulo: "Limpar o checklist?", texto: "Todas as marcações serão apagadas.", ok: "Limpar", perigo: true }))) return;
      editor.alterar((d) => { d.checklist = {}; }, { imediato: true });
      desenhar();
    }
  });

  obs.value = editor.rascunho.dados.checklistObs;
  obs.addEventListener("input", () => editor.alterar((d) => { d.checklistObs = obs.value; }));

  desenhar();
  return {};
}
