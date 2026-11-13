import { teste, igual, ok, esperar, esperarAte } from "./runner.js";
import * as storage from "../../storage.js";
import { classificarErro } from "../../supabase.js";
import { abrirFormRecebimento } from "../../views/form-recebimento.js";
import * as detalhe from "../../views/detalhe.js";
import { novoRascunho, vistoriaDoRascunho } from "../../formatos.js";
import { CHECKLIST_ITENS } from "../../config.js";

const LOJA = { id: "u-loja", email: "loja@teste", nome: "Davi Loja", papel: "loja", loja: "PG Prime BMW Natal" };
const VISTORIA = { id: "v-receb", userId: "u-v", numero: "VIS-000020", loja: "PG Prime BMW Natal", recebimento: null };
const png = () => new Blob(["assinatura"], { type: "image/png" });
const jpg = () => new Blob(["foto"], { type: "image/jpeg" });

function remotoFalso({ falhar = null, existente = null } = {}) {
  let noServidor = existente;
  const chamadas = [];
  return {
    chamadas, classificarErro,
    async obterRecebimento() { return noServidor; },
    async enviarArquivo(c) { chamadas.push(c); if (falhar) { const e = falhar; falhar = null; throw e; } },
    async inserirRecebimento(r) {
      noServidor = { ...r, recebedorNome: LOJA.nome, loja: LOJA.loja, recebidoEm: new Date().toISOString(), fotos: [] };
      return noServidor;
    },
    async gravarFotosRecebimento(r) { noServidor = { ...noServidor, fotos: r.fotos }; },
  };
}

function abrir({ remoto = remotoFalso(), confirmar = async () => true } = {}) {
  const avisos = [];
  const deps = { abrirAssinatura: async () => png(), escolherFoto: async () => jpg(), comprimir: async (b) => b };
  const ctx = { storage, remoto, auth: { usuarioAtual: () => LOJA }, confirmar, avisar: (t, tipo) => avisos.push([t, tipo]), online: () => true };
  const resultado = abrirFormRecebimento({ vistoria: VISTORIA, ctx, deps });
  return { resultado, avisos, remoto, d: () => document.querySelector("dialog.receb-form[open]") };
}
const clicar = (d, sel) => d.querySelector(sel).click();
const escolher = (d, status) => clicar(d, `[role="radio"][data-status="${status}"]`);

teste("recebimento: divergência sem descrição e sem assinatura mostram os erros", async () => {
  await storage.apagarBanco();
  const t = abrir();
  await esperarAte(() => t.d());
  const d = t.d();
  try {
    ok(d.textContent.includes("Recebido por: Davi Loja — PG Prime BMW Natal"), "falta quem recebe");
    igual(d.querySelector("#receb-descricao").closest(".campo").hidden, true, "descrição só aparece com divergência");
    escolher(d, "divergencia");
    igual(d.querySelector("#receb-descricao").closest(".campo").hidden, false);
    clicar(d, '[data-acao="confirmar"]');
    await esperar(50);
    igual(d.querySelector("#receb-erro-descricao").textContent, "Descreva o que está diferente.");
    igual(d.querySelector("#receb-erro-assinatura").textContent, "Falta a assinatura de quem recebeu.");
  } finally {
    clicar(d, '[data-acao="cancelar"]');
    igual(await t.resultado, null);
  }
});

teste("recebimento: dois toques rápidos em Confirmar abrem uma confirmação só", async () => {
  await storage.apagarBanco();
  let perguntas = 0;
  const t = abrir({ confirmar: async () => { perguntas++; await esperar(80); return false; } });
  await esperarAte(() => t.d());
  const d = t.d();
  try {
    escolher(d, "conforme");
    clicar(d, '[data-acao="assinar"]');
    await esperar(100);
    clicar(d, '[data-acao="confirmar"]');
    clicar(d, '[data-acao="confirmar"]');
    await esperar(200);
    igual(perguntas, 1);
    clicar(d, '[data-acao="confirmar"]');
    await esperar(150);
    igual(perguntas, 2, "depois de cancelar, dá para confirmar de novo");
  } finally {
    clicar(d, '[data-acao="cancelar"]');
    await t.resultado;
  }
});

teste("recebimento: o preenchido fica guardado e volta ao reabrir", async () => {
  await storage.apagarBanco();
  const t1 = abrir();
  await esperarAte(() => t1.d());
  let d = t1.d();
  escolher(d, "divergencia");
  const desc = d.querySelector("#receb-descricao");
  desc.value = "Risco novo na porta";
  desc.dispatchEvent(new Event("input"));
  clicar(d, '[data-acao="assinar"]');
  await esperar(100);
  clicar(d, '[data-acao="cancelar"]');
  await t1.resultado;
  const t2 = abrir();
  await esperarAte(() => t2.d());
  d = t2.d();
  try {
    igual(d.querySelector('[data-status="divergencia"]').getAttribute("aria-checked"), "true");
    igual(d.querySelector("#receb-descricao").value, "Risco novo na porta");
    ok(d.querySelector("#receb-assinatura-previa img"), "a assinatura guardada deveria aparecer");
  } finally {
    clicar(d, '[data-acao="cancelar"]');
    await t2.resultado;
  }
});

teste("recebimento: envio feliz devolve o recebimento e apaga o rascunho", async () => {
  await storage.apagarBanco();
  const t = abrir();
  await esperarAte(() => t.d());
  const d = t.d();
  escolher(d, "divergencia");
  d.querySelector("#receb-descricao").value = "Risco novo";
  d.querySelector("#receb-descricao").dispatchEvent(new Event("input"));
  clicar(d, '[data-acao="foto"]');
  await esperar(100);
  clicar(d, '[data-acao="assinar"]');
  await esperar(100);
  clicar(d, '[data-acao="confirmar"]');
  const r = await t.resultado;
  igual(r.status, "divergencia");
  igual(r.fotos.length, 1);
  igual(await storage.obterRascunhoRecebimento(VISTORIA.id), undefined);
  ok(t.avisos.some(([texto]) => texto === "Recebimento registrado."), "falta o aviso de sucesso");
});

teste("recebimento: sem internet no envio, nada se perde e aparece Tentar de novo", async () => {
  await storage.apagarBanco();
  const t = abrir({ remoto: remotoFalso({ falhar: new TypeError("Failed to fetch") }) });
  await esperarAte(() => t.d());
  const d = t.d();
  escolher(d, "conforme");
  clicar(d, '[data-acao="assinar"]');
  await esperar(100);
  clicar(d, '[data-acao="confirmar"]');
  await esperarAte(() => !d.querySelector("#receb-falha").hidden);
  igual(d.querySelector("#receb-falha").textContent, "Não foi possível enviar. Nada foi perdido.");
  igual(d.querySelector('[data-acao="confirmar"]').textContent.trim(), "Tentar de novo");
  ok(await storage.obterRascunhoRecebimento(VISTORIA.id), "o rascunho deveria continuar guardado");
  clicar(d, '[data-acao="confirmar"]');
  const r = await t.resultado;
  igual(r.status, "conforme");
});

teste("recebimento: já recebido por outra pessoa mostra quem e quando", async () => {
  await storage.apagarBanco();
  const outro = { id: "rX", userId: "u-bia", status: "conforme", recebedorNome: "Bia", loja: LOJA.loja,
    recebidoEm: new Date(2026, 10, 12, 9, 30).toISOString(), descricao: "", assinatura: "p", fotos: [] };
  const t = abrir({ remoto: remotoFalso({ existente: outro }) });
  await esperarAte(() => t.d());
  const d = t.d();
  escolher(d, "conforme");
  clicar(d, '[data-acao="assinar"]');
  await esperar(100);
  clicar(d, '[data-acao="confirmar"]');
  const r = await t.resultado;
  igual(r.id, "rX");
  ok(t.avisos.some(([texto]) => texto === "Este carro já foi recebido por Bia em 12/11 às 09:30."), "falta o aviso de já recebido");
});

teste("detalhe modo loja: depois de registrar, mostra o recebimento e some o botão", async () => {
  await storage.apagarBanco();
  const r = novoRascunho("u-v", "v-det", "2026-11-08T10:00:00.000Z");
  Object.assign(r.dados, { loja: LOJA.loja, chassi: "AB123C", marca: "BMW", modelo: "X1", cor: "Preto", km: 1, combustivel: "Flex",
    checklist: Object.fromEntries(CHECKLIST_ITENS.map((i) => [i, "presente"])), semAvarias: true, vistoriadorNome: "Ana", motoristaNome: "Beto" });
  await storage.salvarVistoria({ ...vistoriaDoRascunho(r, "2026-11-08T10:00:00.000Z"), status: "sincronizada", numero: "VIS-000021", origem: "remota", completa: true, recebimento: null });
  const ctx = {
    desktop: false, storage, auth: { usuarioAtual: () => LOJA }, online: () => false, navegar: () => {}, avisar: () => {},
    confirmar: async () => true, sync: { eventos: new EventTarget(), sincronizar: async () => ({}) },
    remoto: { ...remotoFalso(), urlsAssinadas: async () => new Map() },
    depsRecebimento: { abrirAssinatura: async () => png(), escolherFoto: async () => jpg(), comprimir: async (b) => b },
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await detalhe.montar(el, ctx, { id: "v-det", busca: new URLSearchParams(), modo: "loja" });
  try {
    el.querySelector("#btn-receber").click();
    await esperarAte(() => document.querySelector("dialog.receb-form[open]"));
    const d = document.querySelector("dialog.receb-form[open]");
    escolher(d, "conforme");
    clicar(d, '[data-acao="assinar"]');
    await esperar(100);
    clicar(d, '[data-acao="confirmar"]');
    await esperarAte(() => el.querySelector(".det-receb .selo-receb-conforme"));
    igual(el.querySelector("#btn-receber"), null);
  } finally {
    tela?.desmontar?.();
    el.remove();
  }
});
