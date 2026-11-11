import { teste, igual, ok, esperarAte } from "./runner.js";
import * as dashboard from "../../views/dashboard.js";

// Vistorias falsas devolvidas pelo "servidor": hoje e ontem no período atual,
// e uma no período anterior (há 40 dias, fora dos 30 dias).
function dadosFalsos() {
  const agora = new Date();
  const dia = (n, h = 10) => new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - n, h).toISOString();
  return [
    { id: "a1", numero: "VIS-000001", realizadaEm: dia(0), chassi: "AB123C", marca: "Jeep", modelo: "Compass", loja: "PG Prime Jeep Natal",
      avarias: [{ area: "Capô", tipo: "Risco", gravidade: "Grave" }, { area: "Teto", tipo: "Amassado", gravidade: "Leve" }] },
    { id: "a2", numero: "VIS-000002", realizadaEm: dia(1), chassi: "ZZ999Z", marca: "BMW", modelo: "<b>X1</b>", loja: "", avarias: [] },
    { id: "a3", numero: "VIS-000003", realizadaEm: dia(40), chassi: "CC111C", marca: "Audi", modelo: "Q5", loja: "PG Prime Audi Natal", avarias: [] },
  ];
}

async function montarDashboard({ online = true, falhar = false } = {}) {
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
        return dadosFalsos().filter((v) => v.realizadaEm >= p.de && v.realizadaEm < p.ate);
      },
    },
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await dashboard.montar(el, ctx);
  return { el, chamadas, navegacoes, fim: () => { tela.desmontar(); el.remove(); } };
}

teste("dashboard: indicadores, tabelas e sem HTML vindo dos dados", async () => {
  const t = await montarDashboard();
  try {
    igual(t.chamadas.length, 1, "uma consulta só (período anterior + atual)");
    const kpis = [...t.el.querySelectorAll(".db-kpi-num")].map((n) => n.textContent);
    igual(kpis, ["2", "1", "2", "1"]); // 2 vistorias, 1 com avaria, 2 avarias, 1 grave
    ok(t.el.textContent.includes("1 no período anterior"), "falta a comparação com o período anterior");
    const colunas = t.el.querySelectorAll(".db-coluna");
    igual(colunas.length, 30);
    const lojas = [...t.el.querySelectorAll("#db-h-loja ~ * tbody tr td:first-child")].map((td) => td.textContent);
    igual(lojas, ["PG Prime Jeep Natal", "Sem loja informada"]);
    ok(!t.el.querySelector(".db b"), "modelo com HTML não pode virar tag");
    const barras = [...t.el.querySelectorAll("[data-largura]")];
    ok(barras.length && barras.every((b) => b.style.width.endsWith("%") && parseFloat(b.style.width) === Number(b.dataset.largura)), "larguras das barras não aplicadas");
    igual(t.el.querySelector(".db-gravidade").textContent, "Grave");
    t.el.querySelector(".db-clicavel tbody tr td").click();
    igual(t.navegacoes, ["#/vistoria/a1"]);
  } finally {
    t.fim();
  }
});

teste("dashboard: filtros de marca e loja recalculam sem nova consulta", async () => {
  const t = await montarDashboard();
  try {
    const marca = t.el.querySelector("#db-marca");
    igual([...marca.options].map((o) => o.value), ["", "Audi", "BMW", "Jeep"]);
    marca.value = "BMW";
    marca.dispatchEvent(new Event("change"));
    igual(t.el.querySelector(".db-kpi-num").textContent, "1");
    marca.value = "";
    marca.dispatchEvent(new Event("change"));
    const loja = t.el.querySelector("#db-loja");
    loja.value = "Sem loja informada";
    loja.dispatchEvent(new Event("change"));
    igual(t.el.querySelector(".db-kpi-num").textContent, "1");
    igual(t.chamadas.length, 1);
  } finally {
    t.fim();
  }
});

teste("dashboard: trocar o período consulta de novo; Hoje mostra 24 colunas", async () => {
  const t = await montarDashboard();
  try {
    t.el.querySelector('[data-periodo="hoje"]').click();
    await esperarAte(() => t.chamadas.length === 2 && t.el.querySelectorAll(".db-coluna").length === 24);
    igual(t.el.querySelector(".db-kpi-num").textContent, "1");
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
