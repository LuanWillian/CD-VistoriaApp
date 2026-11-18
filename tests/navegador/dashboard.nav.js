import { teste, igual, ok, esperar, esperarAte } from "./runner.js";
import * as dashboard from "../../views/dashboard.js";

// Vistorias falsas devolvidas pelo "servidor": hoje e ontem no período atual,
// e uma no período anterior (há 40 dias, fora dos 30 dias).
function dadosFalsos() {
  const agora = new Date();
  const dia = (n, h = 10) => new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - n, h).toISOString();
  return [
    { id: "a1", numero: "VIS-000001", realizadaEm: dia(0), chassi: "AB123C", marca: "Jeep", modelo: "Compass", loja: "PG Prime Jeep Natal",
      avarias: [{ area: "Capô", tipo: "Risco", gravidade: "Grave" }, { area: "Teto", tipo: "Amassado", gravidade: "Leve" }] },
    { id: "a2", numero: "VIS-000002", realizadaEm: dia(1), chassi: "ZZ999Z", marca: "<i>Bmw</i>", modelo: "<b>X1</b>", loja: "", avarias: [] },
    { id: "a3", numero: "VIS-000003", realizadaEm: dia(40), chassi: "CC111C", marca: "Audi", modelo: "Q5", loja: "PG Prime Audi Natal", avarias: [] },
  ];
}

async function montarDashboard({ online = true, falhar = false, dados = dadosFalsos } = {}) {
  const chamadas = [];
  const navegacoes = [];
  const ctx = {
    online: () => online,
    navegar: (h) => navegacoes.push(h),
    remoto: {
      classificarErro: () => ({ mensagem: "Sem conexão com o servidor." }),
      async listarParaDashboard(p) {
        chamadas.push(p);
        if (falhar) throw new TypeError("failed to fetch");
        return dados().filter((v) => v.realizadaEm >= p.de && v.realizadaEm < p.ate);
      },
    },
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await dashboard.montar(el, ctx);
  return { el, chamadas, navegacoes, fim: () => { tela.desmontar(); el.remove(); } };
}

const numeros = (t) => [...t.el.querySelectorAll(".db-faixa .db-ind-num")].map((n) => n.textContent.trim());

teste("dashboard: faixa de números, gráfico, recebimento e sem HTML vindo dos dados", async () => {
  const t = await montarDashboard();
  try {
    igual(t.chamadas.length, 1, "uma consulta só (período anterior + atual)");
    // 2 enviados, 50% com avaria, 1 grave, 1 aguardando (a sem loja não conta), 0 divergências
    igual(numeros(t), ["2", "50%", "1", "1", "0"]);
    ok(t.el.textContent.includes("vs. 1 no período anterior"), "falta a comparação com o período anterior");
    igual(t.el.querySelectorAll(".db-coluna").length, 30);
    igual(t.el.querySelectorAll(".db-seg-avaria").length, 1, "uma coluna com veículo com avaria");
    ok(t.el.querySelector(".db-media"), "falta a linha da média");
    igual(t.el.querySelector(".db-marcas"), null, "o cartão Por marca foi removido");
    ok([...t.el.querySelector("#db-marca").options].some((o) => o.value === "Jeep"), "o filtro de marca continua");
    ok(!t.el.querySelector("i"), "marca com HTML não pode virar tag");
    const barras = [...t.el.querySelectorAll("[data-largura]")];
    ok(barras.length && barras.every((b) => b.style.width.endsWith("%") && parseFloat(b.style.width) === Number(b.dataset.largura)), "larguras das barras não aplicadas");
    ok([...t.el.querySelectorAll("[data-altura]")].every((b) => b.style.height.endsWith("%")), "alturas das barras não aplicadas");
    igual(t.el.querySelector("#db-lista"), null, "a lista de baixo foi removida");
    igual(t.el.querySelector(".db-ind-link").getAttribute("href"), "#/inicio?periodo=30d&recebimento=aguardando");
  } finally {
    t.fim();
  }
});

teste("dashboard: filtros de marca e loja recalculam sem nova consulta e vão no link Ver veículos", async () => {
  const t = await montarDashboard();
  try {
    const marca = t.el.querySelector("#db-marca");
    igual([...marca.options].map((o) => o.value).length, 4);
    marca.value = "Jeep";
    marca.dispatchEvent(new Event("change"));
    igual(numeros(t)[0], "1");
    marca.value = "";
    marca.dispatchEvent(new Event("change"));
    const loja = t.el.querySelector("#db-loja");
    loja.value = "PG Prime Jeep Natal";
    loja.dispatchEvent(new Event("change"));
    igual(numeros(t)[0], "1");
    ok(t.el.querySelector(".db-ind-link").getAttribute("href").includes("loja=PG+Prime+Jeep+Natal"), "o link leva a loja escolhida");
    igual(t.chamadas.length, 1);
  } finally {
    t.fim();
  }
});

teste("dashboard: trocar o período consulta de novo; Hoje mostra 24 colunas e não tem média", async () => {
  const t = await montarDashboard();
  try {
    t.el.querySelector('[data-periodo="hoje"]').click();
    await esperarAte(() => t.chamadas.length === 2 && t.el.querySelectorAll(".db-coluna").length === 24);
    igual(numeros(t)[0], "1");
    igual(t.el.querySelector(".db-media"), null, "gráfico por hora não tem média");
    t.el.querySelector('[data-periodo="personalizado"]').click();
    ok(!t.el.querySelector("#db-datas").hidden, "datas do período personalizado não apareceram");
  } finally {
    t.fim();
  }
});

teste("dashboard: offline e erro do servidor mostram aviso", async () => {
  const off = await montarDashboard({ online: false });
  try {
    igual(off.chamadas.length, 0);
    ok(off.el.querySelector("#db-aviso").textContent.includes("Sem internet"), "faltou o aviso de offline");
  } finally {
    off.fim();
  }
  const erro = await montarDashboard({ falhar: true });
  try {
    ok(erro.el.textContent.includes("Sem conexão com o servidor."), "faltou a mensagem de erro");
    ok(erro.el.querySelector('[data-acao="tentar"]'), "faltou o botão Tentar de novo");
  } finally {
    erro.fim();
  }
});

teste("dashboard: Recebimento nas lojas, o mais antigo aguardando e links para a aba Vistorias", async () => {
  const agora = new Date();
  const dia = (n) => new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - n, 10).toISOString();
  const rec = (status) => ({ id: `r-${status}`, userId: "uL", status, recebedorNome: "Davi", loja: "PG Prime BMW Natal", recebidoEm: dia(0), descricao: "x", assinatura: "p", fotos: [] });
  const base = { chassi: "AB123C", marca: "BMW", modelo: "X1", loja: "PG Prime BMW Natal", avarias: [] };
  const t = await montarDashboard({ dados: () => [
    { ...base, id: "w1", numero: "VIS-1", realizadaEm: dia(1), recebimento: null },
    { ...base, id: "w2", numero: "VIS-2", realizadaEm: dia(2), recebimento: rec("conforme") },
    { ...base, id: "w3", numero: "VIS-3", realizadaEm: dia(3), recebimento: rec("divergencia") },
    { ...base, id: "w4", numero: "VIS-4", realizadaEm: dia(4), loja: "", recebimento: null },
  ] });
  try {
    const nums = [...t.el.querySelectorAll(".db-receb .db-rec-num")].map((n) => n.textContent);
    igual(nums, ["1", "1", "1"], "sem divergência, com divergência, aguardando");
    ok(t.el.querySelector(".db-receb").textContent.includes("3 veículos enviados para as lojas"), "a vistoria sem loja não conta");
    const links = [...t.el.querySelectorAll(".db-receb a.db-rec-ver")].map((a) => a.getAttribute("href"));
    igual(links, ["#/inicio?periodo=30d&recebimento=divergencia", "#/inicio?periodo=30d&recebimento=aguardando"]);
    ok(t.el.querySelector(".db-faixa").textContent.includes("mais antigo há 1 dia"), "faltou o mais antigo aguardando");
    igual(numeros(t).slice(3), ["1", "1"]);
    ok(t.el.querySelector(".db-faixa").textContent.includes("50% dos 2 recebidos"), "faltou o % dos recebidos");
  } finally {
    t.fim();
  }
});

teste("dashboard: número só no pico; uma linha de média só; no Tudo não há comparação", async () => {
  const t = await montarDashboard();
  try {
    t.el.querySelector('[data-periodo="7d"]').click();
    await esperarAte(() => t.el.querySelectorAll(".db-coluna").length === 7);
    igual([...t.el.querySelectorAll(".db-valor")].map((b) => b.textContent), ["1"], "só o dia de pico mostra o número");
    igual(t.el.querySelectorAll(".db-media").length, 1, "uma linha de média só");
    igual(t.el.querySelector(".db-media-anterior"), null, "sem a linha da média anterior");
    igual([...t.el.querySelectorAll(".db-legenda > span")].map((s) => s.textContent.trim()), ["Sem avaria", "Com avaria"]);
    t.el.querySelector('[data-periodo="tudo"]').click();
    await esperarAte(() => t.el.querySelector("#db-subtitulo").textContent.includes("desde"));
    igual(t.el.querySelector(".db-media-anterior"), null, "Tudo não tem média anterior");
    ok(t.el.querySelector(".db-faixa").textContent.includes("todas as vistorias"), "Tudo não compara com o anterior");
    igual(t.el.querySelector(".db-ind-link").getAttribute("href").split("&")[0], "#/inicio?periodo=todos");
  } finally {
    t.fim();
  }
});
