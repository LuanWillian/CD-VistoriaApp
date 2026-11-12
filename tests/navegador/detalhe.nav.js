import { teste, igual, ok, esperar } from "./runner.js";
import * as storage from "../../storage.js";
import { novoRascunho, vistoriaDoRascunho } from "../../formatos.js";
import { CHECKLIST_ITENS } from "../../config.js";
import * as detalhe from "../../views/detalhe.js";
import { abrirVisualizador } from "../../photos.js";

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

async function abrir(v, { online = false, desktop = true, usuario = EU, modo } = {}) {
  await storage.apagarBanco();
  await storage.salvarVistoria(v);
  const ctx = {
    desktop, storage, auth: { usuarioAtual: () => usuario }, online: () => online, navegar: () => {}, avisar: () => {},
    confirmar: async () => true, sync: { eventos: new EventTarget(), sincronizar: async () => ({}) },
    remoto: { obterVistoriaCompleta: async () => { throw new Error("offline"); }, urlsAssinadas: async () => new Map(), baixarArquivo: async () => { throw new Error("offline"); } },
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await detalhe.montar(el, ctx, { id: v.id, busca: new URLSearchParams(), modo });
  await esperar(100);
  return { el, fim: () => { tela?.desmontar?.(); el.remove(); } };
}

teste("detalhe: vistoria sincronizada de outra pessoa abre (guardada no aparelho) e no computador pode ser excluída", async () => {
  const t = await abrir(vistoria("alheia", "u-outro"));
  try {
    ok(t.el.querySelector("#detalhe-numero"), `a tela deveria abrir; veio: ${t.el.textContent.slice(0, 80)}`);
    igual(t.el.querySelector("#detalhe-numero").textContent.trim(), "VIS-000010");
    ok(t.el.querySelector("#btn-baixar"), "falta o botão Baixar PDF");
    ok(t.el.querySelector("#btn-excluir"), "qualquer conta exclui no computador");
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

teste("detalhe: no app instalado e no celular ninguém vê o botão Excluir", async () => {
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

teste("detalhe: a ordem dos blocos no HTML (celular) continua dados, fotos, checklist, avarias, assinaturas", async () => {
  const t = await abrir(vistoria("ordem", EU.id));
  try {
    const ids = [...t.el.querySelectorAll("section.secao")].map((s) => s.getAttribute("aria-labelledby"));
    igual(ids, ["h-dados", "h-fotos", "h-checklist", "h-avarias", "h-assinaturas"]);
    igual(t.el.querySelectorAll('a[href^="#/nova"]').length, 0, "o computador não tem link para nova vistoria");
    igual(t.el.querySelector("#btn-compartilhar"), null, "o computador não tem Compartilhar");
  } finally {
    t.fim();
  }
});

teste("visualizador: no modo grande é um diálogo modal que fecha clicando fora, não na foto, e devolve o foco e a rolagem", async () => {
  const origem = document.createElement("button");
  document.body.append(origem);
  origem.focus();
  abrirVisualizador([{ src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", legenda: "Frente" }], 0, { grande: true, origem });
  const d = document.querySelector("dialog.visualizador-grande");
  try {
    ok(d?.open, "o lightbox deveria abrir");
    igual(d.getAttribute("role"), "dialog");
    igual(d.getAttribute("aria-modal"), "true");
    igual(document.activeElement.getAttribute("aria-label"), "Fechar");
    igual(document.documentElement.style.overflow, "hidden");
    d.querySelector("img").click();
    ok(d.open, "clicar na foto não fecha");
    d.querySelector(".visualizador-palco").click();
    await esperar(30);
    ok(!d.isConnected, "clicar fora deveria fechar");
    igual(document.documentElement.style.overflow, "");
    igual(document.activeElement, origem);
  } finally {
    d?.close();
    origem.remove();
  }
});

teste("visualizador: fora do modo grande (celular) não vira lightbox", async () => {
  abrirVisualizador([{ src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", legenda: "Frente" }], 0);
  const d = document.querySelector("dialog.visualizador");
  try {
    ok(!d.classList.contains("visualizador-grande"));
    igual(d.getAttribute("aria-modal"), null);
  } finally {
    d.close();
  }
});

// ---------- Recebimento na loja ----------
const LOJA = { id: "u-loja", email: "loja@teste", nome: "Davi Loja", papel: "loja", loja: "PG Prime BMW Natal" };
const recebido = (status, extra = {}) => ({
  id: "r1", userId: "u-loja", status, recebedorNome: "Davi <b>Loja</b>", loja: "PG Prime BMW Natal",
  recebidoEm: new Date(2026, 10, 12, 14, 5).toISOString(), descricao: status === "divergencia" ? "Risco novo na porta" : "",
  assinatura: "u-loja/x/receb_assinatura.png", fotos: [], ...extra,
});
const titulos = (el) => [...el.querySelectorAll(".detalhe-corpo h2")].map((h) => h.textContent.trim());

teste("detalhe: card Recebimento na loja aguardando, logo depois de Dados do veículo", async () => {
  const t = await abrir(vistoria("aguarda", "u-outro", { loja: "PG Prime BMW Natal", recebimento: null }));
  try {
    const card = t.el.querySelector(".det-receb");
    ok(card, "falta o card Recebimento na loja");
    igual(card.querySelector("h2").textContent.trim(), "Recebimento na loja");
    ok(card.textContent.includes("Aguardando recebimento"), "falta o selo Aguardando recebimento");
    ok(card.textContent.includes("PG Prime BMW Natal"), "falta a loja de destino");
    const h = titulos(t.el);
    igual(h[h.indexOf("Dados do veículo") + 1], "Recebimento na loja");
  } finally {
    t.fim();
  }
});

teste("detalhe: recebido conforme e com divergência (texto escapado)", async () => {
  const t1 = await abrir(vistoria("conf", "u-outro", { loja: "PG Prime BMW Natal", recebimento: recebido("conforme") }));
  try {
    const card = t1.el.querySelector(".det-receb");
    ok(card.querySelector(".selo-receb-conforme"), "falta o selo Conforme");
    ok(card.textContent.includes("Recebido por Davi <b>Loja</b> — PG Prime BMW Natal"), "nome/loja de quem recebeu");
    igual(card.querySelector("b"), null, "nome com HTML não pode virar tag");
    ok(card.textContent.includes("12/11/2026 14:05"), "falta a data e hora");
  } finally {
    t1.fim();
  }
  const t2 = await abrir(vistoria("div", "u-outro", { loja: "PG Prime BMW Natal", recebimento: recebido("divergencia") }));
  try {
    const card = t2.el.querySelector(".det-receb");
    ok(card.querySelector(".selo-receb-divergencia"), "falta o selo Com divergência");
    ok(card.textContent.includes("Com divergência"));
    ok(card.textContent.includes("Risco novo na porta"), "falta a descrição da divergência");
  } finally {
    t2.fim();
  }
});

teste("detalhe: vistoria sem loja não tem card de recebimento", async () => {
  const t = await abrir(vistoria("semloja", "u-outro", { loja: "" }));
  try {
    igual(t.el.querySelector(".det-receb"), null);
  } finally {
    t.fim();
  }
});

teste("detalhe modo loja: sem PDF, Compartilhar e Excluir; Registrar recebimento só se aguardando", async () => {
  const t1 = await abrir(vistoria("l1", "u-outro", { loja: "PG Prime BMW Natal", recebimento: null }), { usuario: LOJA, modo: "loja" });
  try {
    igual(t1.el.querySelector("#btn-baixar"), null);
    igual(t1.el.querySelector("#btn-compartilhar"), null);
    igual(t1.el.querySelector("#btn-excluir"), null);
    ok(t1.el.querySelector("#btn-receber"), "falta Registrar recebimento");
    igual(t1.el.querySelector("#btn-receber").textContent.trim(), "Registrar recebimento");
  } finally {
    t1.fim();
  }
  const t2 = await abrir(vistoria("l2", "u-outro", { loja: "PG Prime BMW Natal", recebimento: recebido("conforme") }), { usuario: LOJA, modo: "loja" });
  try {
    igual(t2.el.querySelector("#btn-receber"), null, "já recebida não mostra o botão");
    ok(t2.el.querySelector(".det-receb .selo-receb-conforme"));
  } finally {
    t2.fim();
  }
});
