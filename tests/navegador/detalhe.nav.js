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
  const t = await abrir(vistoria("ordem", EU.id), { desktop: false });
  try {
    const ids = [...t.el.querySelectorAll("section.secao")].map((s) => s.getAttribute("aria-labelledby"));
    igual(ids, ["h-dados", "h-fotos", "h-checklist", "h-avarias", "h-assinaturas"]);
    igual(t.el.querySelector(".cb-detalhe"), null, "o celular não usa o visual do computador");
  } finally {
    t.fim();
  }
});

teste("detalhe (computador): coluna principal fotos, avarias, assinaturas; lateral dados, recebimento, checklist", async () => {
  const t = await abrir(vistoria("ordem-pc", EU.id, { loja: "PG Prime BMW Natal", recebimento: null }));
  try {
    const coluna = (sel) => [...t.el.querySelectorAll(`${sel} section.secao`)].map((s) => s.getAttribute("aria-labelledby"));
    igual(coluna(".cb-principal"), ["h-fotos", "h-avarias", "h-assinaturas"]);
    igual(coluna(".cb-lateral"), ["h-dados", "h-receb", "h-checklist"]);
    igual(t.el.querySelector("h1").textContent.trim(), "Jeep Compass", "o título é o veículo");
    igual(t.el.querySelector("#detalhe-numero").textContent.trim(), "VIS-000010", "o número fica no caminho");
    igual(t.el.querySelectorAll('a[href^="#/nova"]').length, 0, "o computador não tem link para nova vistoria");
    igual(t.el.querySelector("#btn-compartilhar"), null, "o computador não tem Compartilhar");
    ok(t.el.querySelector("#btn-baixar") && t.el.querySelector("#btn-excluir"), "faltam Baixar PDF e Excluir");
    igual(t.el.querySelector(".cb-abas"), null, "o computador não tem a barra de abas");
    ok(t.el.querySelector(".cb-checklist").textContent.includes("Ok"), "checklist sem os Ok");
    ok(t.el.textContent.includes("13/13 ok"), "falta a contagem do checklist");
  } finally {
    t.fim();
  }
});

teste("detalhe (computador): avarias em tabela com gravidade, sem HTML vindo dos dados", async () => {
  const avarias = [
    { id: "a1", area: "Capô", tipo: "Risco", gravidade: "Grave", descricao: "<b>fundo</b>", fotos: [] },
    { id: "a2", area: "Teto", tipo: "Amassado", gravidade: "Leve", descricao: "", fotos: [] },
  ];
  const t = await abrir(vistoria("avarias-pc", EU.id, { semAvarias: false, avarias }));
  try {
    const linhas = [...t.el.querySelectorAll(".cb-avarias tbody tr")];
    igual(linhas.length, 2);
    ok(linhas[0].textContent.includes("Capô") && linhas[0].querySelector(".selo-grave"), "falta a avaria grave");
    igual(t.el.querySelector(".cb-avarias b"), null, "descrição com HTML não pode virar tag");
    ok(t.el.querySelector("#h-avarias").textContent.includes("2 registradas"));
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

teste("visualizador: pinça com dois dedos aproxima, toque duplo volta e sem zoom arrastar troca a foto", async () => {
  const gif = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  abrirVisualizador([{ src: gif, legenda: "Frente" }, { src: gif, legenda: "Traseira" }], 0);
  const d = [...document.querySelectorAll("dialog.visualizador")].at(-1); // o que acabou de abrir
  const palco = d.querySelector(".visualizador-palco");
  const img = d.querySelector("img");
  const r = palco.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const ev = (tipo, id, x, y) => palco.dispatchEvent(new PointerEvent(tipo, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" }));
  const escala = () => Number(/scale\(([\d.]+)\)/.exec(img.style.transform)?.[1] ?? 1);
  try {
    // dois dedos afastando: 40 px → 120 px
    ev("pointerdown", 1, cx - 20, cy); ev("pointerdown", 2, cx + 20, cy);
    ev("pointermove", 1, cx - 60, cy); ev("pointermove", 2, cx + 60, cy);
    ok(escala() > 2.5, `a pinça não aproximou (escala ${escala()})`);
    ev("pointerup", 1, cx - 60, cy); ev("pointerup", 2, cx + 60, cy);
    // com zoom, arrastar move a foto e não troca
    ev("pointerdown", 3, cx, cy); ev("pointermove", 3, cx - 120, cy); ev("pointerup", 3, cx - 120, cy);
    ok(d.querySelector("h2").textContent.includes("Frente"), "com zoom, arrastar não pode trocar de foto");
    // toque duplo volta ao normal
    for (const id of [4, 5]) { ev("pointerdown", id, cx, cy); ev("pointerup", id, cx, cy); }
    await esperar(250);
    igual(escala(), 1, "o toque duplo deveria tirar o zoom");
    // sem zoom, arrastar para o lado troca de foto
    ev("pointerdown", 6, cx + 100, cy); ev("pointermove", 6, cx - 100, cy); ev("pointerup", 6, cx - 100, cy);
    ok(d.querySelector("h2").textContent.includes("Traseira"), "arrastar sem zoom deveria ir para a próxima foto");
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

teste("detalhe (celular): veículo no título, abas e Baixar PDF e Compartilhar fixos embaixo", async () => {
  const t = await abrir(vistoria("cel", EU.id, { loja: "PG Prime BMW Natal", recebimento: null }), { desktop: false });
  try {
    igual(t.el.querySelector("h1").textContent.trim(), "Jeep Compass");
    igual(t.el.querySelector("#detalhe-numero").textContent.trim(), "VIS-000010");
    ok(t.el.querySelector(".cm-cabecalho").textContent.includes("PG Prime BMW Natal"), "a loja fica no cabeçalho");
    ok(t.el.querySelector(".cm-acoes #btn-baixar") && t.el.querySelector(".cm-acoes #btn-compartilhar"), "faltam as ações fixas");
    igual(t.el.querySelector(".cm-abas"), null, "o celular não tem mais a barra de abas");
    igual([...t.el.querySelectorAll("section.secao")].map((s) => s.getAttribute("aria-labelledby")),
      ["h-dados", "h-receb", "h-fotos", "h-checklist", "h-avarias", "h-assinaturas"]);
  } finally {
    t.fim();
  }
});

teste("detalhe (celular) da loja: aviso para conferir e Registrar recebimento fixo embaixo, sem PDF", async () => {
  const LOJA = { id: "u-loja", email: "loja@teste", nome: "Davi", papel: "loja", loja: "PG Prime BMW Natal" };
  const t = await abrir(vistoria("lj", "u-v", { loja: "PG Prime BMW Natal", recebimento: null }), { desktop: false, usuario: LOJA, modo: "loja" });
  try {
    ok(t.el.textContent.includes("Confira o carro com esta vistoria"), "falta o aviso");
    ok(t.el.querySelector(".cm-acoes #btn-receber"), "o botão fica na barra de baixo");
    igual(t.el.querySelector("#btn-baixar"), null);
    igual(t.el.querySelector(".cm-migalhas a").getAttribute("href"), "#/recebimentos");
  } finally {
    t.fim();
  }
});

teste("detalhe da loja: vistoria que não é da loja mostra o motivo certo e volta para Recebimentos", async () => {
  await storage.apagarBanco();
  const LOJA = { id: "u-loja", email: "loja@teste", nome: "Davi", papel: "loja", loja: "PG Prime BMW Natal" };
  const ctx = {
    desktop: false, storage, auth: { usuarioAtual: () => LOJA }, online: () => true, navegar: () => {}, avisar: () => {},
    confirmar: async () => true, sync: { eventos: new EventTarget(), sincronizar: async () => ({}) },
    remoto: { obterVistoriaCompleta: async () => { throw { code: "PGRST116" }; }, urlsAssinadas: async () => new Map() },
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await detalhe.montar(el, ctx, { id: "de-outra-loja", busca: new URLSearchParams(), modo: "loja" });
  try {
    ok(el.textContent.includes("não foi enviada para a sua loja"), el.textContent.trim().slice(0, 120));
    igual(el.querySelector(".vazio a").getAttribute("href"), "#/recebimentos");
  } finally {
    tela?.desmontar?.();
    el.remove();
  }
});
