import { teste, igual, ok, esperar } from "./runner.js";
import { montarEtapa, simularCamera } from "./apoio.js";
import * as etapa from "../../views/etapa-avarias.js";

const botao = (raiz, texto) => [...raiz.querySelectorAll("button")].find((b) => b.textContent.trim().includes(texto));
const dialogo = () => document.querySelector("dialog.cheio[open]");
const escolher = (sel, valor) => {
  sel.value = valor;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
};
const avaria = (extra = {}) => ({ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "risco fino", fotos: [], ...extra });

teste("etapa 3: nova avaria valida área, tipo e gravidade", async () => {
  const t = await montarEtapa(etapa);
  try {
    botao(t.el, "Adicionar avaria").click();
    const d = dialogo();
    ok(d, "o editor não abriu");
    igual(d.querySelector("h2").textContent.trim(), "Nova avaria");
    botao(d, "Salvar avaria").click();
    await esperar(20);
    const erros = d.querySelector("#avaria-erros").textContent;
    ok(erros.includes("Escolha a área da avaria") && erros.includes("Escolha o tipo da avaria") && erros.includes("Escolha a gravidade"), erros);
    d.close();
  } finally {
    await t.fim();
  }
});

teste("etapa 3: salvar sem foto pede confirmação e cria o cartão", async () => {
  const perguntas = [];
  const t = await montarEtapa(etapa, { confirmar: async (o) => { perguntas.push(o.titulo); return true; } });
  try {
    t.editor.alterar((d) => { d.semAvarias = true; });
    botao(t.el, "Adicionar avaria").click();
    const d = dialogo();
    escolher(d.querySelector("#avaria-area"), "Capô");
    escolher(d.querySelector("#avaria-tipo"), "Risco");
    d.querySelector('[data-valor="Grave"]').click();
    botao(d, "Salvar avaria").click();
    await esperar(50);
    igual(perguntas, ["Esta avaria está sem foto. Salvar mesmo assim?"]);
    ok(!dialogo(), "o editor não fechou");
    const cartoes = t.el.querySelectorAll(".avaria-cartao");
    igual(cartoes.length, 1);
    ok(cartoes[0].querySelector(".selo-grave")?.textContent.includes("Grave"), "selo Grave ausente");
    igual(t.editor.rascunho.dados.semAvarias, false);
    igual(t.editor.rascunho.dados.avarias[0].area, "Capô");
  } finally {
    await t.fim();
  }
});

teste("etapa 3: ligar 'sem avarias' remove as avarias e as fotos delas", async () => {
  const t = await montarEtapa(etapa, { preparar: (r) => { r.dados.avarias = [avaria({ fotos: ["f1"] })]; } });
  try {
    await t.ctx.storage.salvarArquivo(`${t.editor.rascunho.id}/avaria_f1.jpg`, new Blob(["x"]));
    t.el.querySelector("#sem-avarias").click();
    await esperar(50);
    igual(t.editor.rascunho.dados.avarias, []);
    igual(t.editor.rascunho.dados.semAvarias, true);
    igual(await t.ctx.storage.obterArquivo(`${t.editor.rascunho.id}/avaria_f1.jpg`), undefined);
  } finally {
    await t.fim();
  }
});

teste("etapa 3: com 'sem avarias' ligado o botão Adicionar avaria some e volta ao desligar", async () => {
  const t = await montarEtapa(etapa);
  try {
    const adicionar = () => t.el.querySelector('[data-acao="adicionar"]');
    await esperar(50);
    igual(adicionar().hidden, false);
    t.el.querySelector("#sem-avarias").click();
    await esperar(50);
    igual(adicionar().hidden, true);
    igual(getComputedStyle(adicionar()).display, "none");
    t.el.querySelector("#sem-avarias").click();
    await esperar(50);
    igual(adicionar().hidden, false);
  } finally {
    await t.fim();
  }
});

teste("etapa 3: cancelar avaria nova apaga a foto tirada", async () => {
  const restaurar = simularCamera();
  const t = await montarEtapa(etapa);
  try {
    botao(t.el, "Adicionar avaria").click();
    const d = dialogo();
    botao(d, "Adicionar foto").click();
    await esperar(600);
    const miniaturas = d.querySelectorAll("#avaria-fotos .miniatura");
    igual(miniaturas.length, 1);
    const chaves = await new Promise((r) => {
      const req = indexedDB.open("vistoria-veicular-testes");
      req.onsuccess = () => {
        const g = req.result.transaction("arquivos").objectStore("arquivos").getAllKeys();
        g.onsuccess = () => { r(g.result); req.result.close(); };
      };
    });
    igual(chaves.length, 1);
    botao(d, "Cancelar").click();
    await esperar(80);
    ok(!dialogo(), "o editor não fechou");
    igual(await t.ctx.storage.obterArquivo(chaves[0]), undefined);
    igual(t.editor.rascunho.dados.avarias, []);
  } finally {
    restaurar();
    await t.fim();
  }
});

teste("etapa 3: editar e remover avaria", async () => {
  const t = await montarEtapa(etapa, { preparar: (r) => { r.dados.avarias = [avaria()]; } });
  try {
    await esperar(50);
    botao(t.el, "Editar").click();
    const d = dialogo();
    igual(d.querySelector("h2").textContent.trim(), "Editar avaria");
    igual(d.querySelector("#avaria-area").value, "Capô");
    igual(d.querySelector("#avaria-descricao").value, "risco fino");
    igual(d.querySelector('[data-valor="Leve"]').getAttribute("aria-checked"), "true");
    escolher(d.querySelector("#avaria-tipo"), "Amassado");
    botao(d, "Salvar avaria").click();
    await esperar(50);
    igual(t.editor.rascunho.dados.avarias[0].tipo, "Amassado");
    botao(t.el, "Remover").click();
    await esperar(50);
    igual(t.editor.rascunho.dados.avarias, []);
  } finally {
    await t.fim();
  }
});

teste("etapa 3: sair com o editor alterado pede para descartar", async () => {
  const t = await montarEtapa(etapa, { confirmar: async () => false });
  try {
    botao(t.el, "Adicionar avaria").click();
    escolher(dialogo().querySelector("#avaria-area"), "Teto");
    igual(await t.etapa.podeSair(), false);
    ok(dialogo(), "o editor fechou");
    dialogo().close();
  } finally {
    await t.fim();
  }
});
