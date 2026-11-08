import { teste, igual, ok, esperar } from "./runner.js";
import { montarEtapa, digitar } from "./apoio.js";
import * as etapa from "../../views/etapa-checklist.js";
import { CHECKLIST_ITENS } from "../../config.js";

const botao = (el, texto) => [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === texto);

teste("etapa 2: 13 itens com Ok/Ausente e contador", async () => {
  const t = await montarEtapa(etapa);
  try {
    const grupos = [...t.el.querySelectorAll("fieldset.item-checklist")];
    igual(grupos.length, 13);
    igual(grupos.map((g) => g.querySelector("legend").textContent.trim()), CHECKLIST_ITENS);
    igual(grupos[0].id, "chk-0");
    const bateria = grupos[CHECKLIST_ITENS.indexOf("Bateria")];
    bateria.querySelector('[data-valor="ausente"]').click();
    igual(t.editor.rascunho.dados.checklist.Bateria, "ausente");
    igual(bateria.querySelector('[data-valor="ausente"]').getAttribute("aria-checked"), "true");
    igual(t.el.querySelector("#checklist-contador").textContent, "1 de 13");
  } finally {
    await t.fim();
  }
});

teste("etapa 2: marcar todos como Ok", async () => {
  const t = await montarEtapa(etapa);
  try {
    botao(t.el, "Marcar todos como Ok").click();
    igual(Object.values(t.editor.rascunho.dados.checklist), Array(13).fill("presente"));
    igual(t.el.querySelector("#checklist-contador").textContent, "13 de 13");
  } finally {
    await t.fim();
  }
});

teste("etapa 2: Limpar pede confirmação", async () => {
  let resposta = false;
  const t = await montarEtapa(etapa, { confirmar: async () => resposta });
  try {
    botao(t.el, "Marcar todos como Ok").click();
    botao(t.el, "Limpar").click();
    await esperar(20);
    igual(Object.keys(t.editor.rascunho.dados.checklist).length, 13);
    resposta = true;
    botao(t.el, "Limpar").click();
    await esperar(20);
    igual(t.editor.rascunho.dados.checklist, {});
    ok(t.el.querySelectorAll('[aria-checked="true"]').length === 0, "botões continuam marcados");
  } finally {
    await t.fim();
  }
});

teste("etapa 2: observação geral opcional", async () => {
  const t = await montarEtapa(etapa);
  try {
    digitar(t.el.querySelector("#checklist-obs"), "Estepe careca");
    igual(t.editor.rascunho.dados.checklistObs, "Estepe careca");
  } finally {
    await t.fim();
  }
});
