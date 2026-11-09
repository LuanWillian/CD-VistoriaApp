import { teste, igual, ok, esperar } from "./runner.js";
import * as storage from "../../storage.js";
import { novoRascunho, vistoriaDoRascunho } from "../../formatos.js";
import { CHECKLIST_ITENS } from "../../config.js";
import * as detalhe from "../../views/detalhe.js";

const EU = { id: "u-eu", email: "eu@teste" };

function vistoria(id, userId, extra = {}) {
  const r = novoRascunho(userId, id, "2026-11-08T10:00:00.000Z");
  Object.assign(r.dados, {
    chassi: "AB123C", marca: "Jeep", modelo: "Compass", cor: "Preto", km: 10, combustivel: "Flex",
    checklist: Object.fromEntries(CHECKLIST_ITENS.map((i) => [i, "presente"])),
    semAvarias: true, vistoriadorNome: "Outra Pessoa", motoristaNome: "Beto",
  });
  return { ...vistoriaDoRascunho(r, "2026-11-08T10:00:00.000Z"), status: "sincronizada", numero: "VIS-000010", origem: "remota", completa: true, ...extra };
}

async function abrir(v, { online = false, desktop = true } = {}) {
  await storage.apagarBanco();
  await storage.salvarVistoria(v);
  const ctx = {
    desktop, storage, auth: { usuarioAtual: () => EU }, online: () => online, navegar: () => {}, avisar: () => {},
    confirmar: async () => true, sync: { eventos: new EventTarget(), sincronizar: async () => ({}) },
    remoto: { obterVistoriaCompleta: async () => { throw new Error("offline"); }, urlsAssinadas: async () => new Map(), baixarArquivo: async () => { throw new Error("offline"); } },
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await detalhe.montar(el, ctx, { id: v.id, busca: new URLSearchParams() });
  await esperar(100);
  return { el, fim: () => { tela?.desmontar?.(); el.remove(); } };
}

teste("detalhe: vistoria sincronizada de outra pessoa abre (guardada no aparelho) mas sem botão Excluir", async () => {
  const t = await abrir(vistoria("alheia", "u-outro"));
  try {
    ok(t.el.querySelector("#detalhe-numero"), `a tela deveria abrir; veio: ${t.el.textContent.slice(0, 80)}`);
    igual(t.el.querySelector("#detalhe-numero").textContent.trim(), "VIS-000010");
    ok(t.el.querySelector("#btn-baixar"), "falta o botão Baixar PDF");
    igual(t.el.querySelector("#btn-excluir"), null, "só o dono pode excluir");
  } finally {
    t.fim();
  }
});

teste("detalhe: a própria vistoria continua com o botão Excluir", async () => {
  const t = await abrir(vistoria("minha", EU.id));
  try {
    ok(t.el.querySelector("#btn-excluir"), "o dono deveria ver o botão Excluir");
  } finally {
    t.fim();
  }
});

teste("detalhe: vistoria pendente de outra pessoa neste aparelho continua escondida", async () => {
  const t = await abrir(vistoria("privada", "u-outro", { status: "pendente", numero: null, origem: "local" }));
  try {
    igual(t.el.querySelector("#detalhe-numero"), null, "pendente de outro usuário não pode aparecer");
  } finally {
    t.fim();
  }
});

teste("detalhe: no app instalado e no celular nem o dono vê o botão Excluir", async () => {
  const t = await abrir(vistoria("minha-app", EU.id), { desktop: false });
  try {
    ok(t.el.querySelector("#detalhe-numero"), "a tela deveria abrir");
    ok(t.el.querySelector("#btn-baixar"), "o resto das ações continua (Baixar PDF)");
    igual(t.el.querySelector("#btn-excluir"), null, "no modo app não existe a opção de excluir");
  } finally {
    t.fim();
  }
});

teste("detalhe: 'Nova vistoria' (depois de finalizar) só existe fora do computador", async () => {
  for (const desktop of [true, false]) {
    await storage.apagarBanco();
    await storage.salvarVistoria(vistoria("recem", EU.id));
    const ctx = {
      desktop, storage, auth: { usuarioAtual: () => EU }, online: () => false, navegar: () => {}, avisar: () => {},
      confirmar: async () => true, sync: { eventos: new EventTarget(), sincronizar: async () => ({}) }, remoto: {},
    };
    const el = document.createElement("div");
    document.getElementById("palco").append(el);
    const tela = await detalhe.montar(el, ctx, { id: "recem", busca: new URLSearchParams("nova=1") });
    await esperar(100);
    try {
      igual(Boolean(el.querySelector('a[href^="#/nova"]')), !desktop, `desktop=${desktop}`);
    } finally {
      tela?.desmontar?.();
      el.remove();
    }
  }
});
