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
    { id: "a2", numero: "VIS-000002", realizadaEm: dia(1), chassi: "ZZ999Z", marca: "BMW", modelo: "<b>X1</b>", loja: "", avarias: [] },
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

teste("dashboard: indicadores, tabelas e sem HTML vindo dos dados", async () => {
  const t = await montarDashboard();
  try {
    igual(t.chamadas.length, 1, "uma consulta só (período anterior + atual)");
    const kpis = [...t.el.querySelectorAll(".db-kpis .db-kpi-num")].map((n) => n.textContent);
    igual(kpis, ["2", "2"]); // 2 vistorias, 2 avarias
    igual(t.el.querySelector('.db-kpi-botao[data-lista="avaria"], .db-kpi-botao[data-lista="graves"]'), null, "os cartões Veículos com avaria e Avarias graves foram removidos");
    ok(t.el.textContent.includes("vs. 1 anterior"), "falta a comparação com o período anterior");
    const rotulo = () => t.el.querySelector(".db-kpis .cb-kpi-rot").textContent.trim();
    igual(rotulo(), "Vistorias no período · 30 dias");
    const colunas = t.el.querySelectorAll(".db-coluna");
    igual(colunas.length, 30);
    const lojas = [...t.el.querySelectorAll('[aria-labelledby="db-h-loja"] tbody tr td:first-child')].map((td) => td.textContent);
    igual(lojas, ["Jeep Natal", "Sem loja informada"]);
    ok(!t.el.querySelector("b"), "modelo com HTML não pode virar tag");
    const barras = [...t.el.querySelectorAll("[data-largura]")];
    ok(barras.length && barras.every((b) => b.style.width.endsWith("%") && parseFloat(b.style.width) === Number(b.dataset.largura)), "larguras das barras não aplicadas");
    igual(t.el.querySelector(".cb-rosca-num").textContent, "2", "a rosca soma as 2 avarias");
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

teste("dashboard: o cartão Vistorias no período mostra o período escolhido", async () => {
  const t = await montarDashboard();
  try {
    const rotulo = () => t.el.querySelector(".db-kpis .cb-kpi-rot").textContent.trim();
    for (const [valor, texto] of [["7d", "7 dias"], ["hoje", "Hoje"], ["mes", "Este mês"], ["tudo", "Tudo"], ["30d", "30 dias"]]) {
      t.el.querySelector(`[data-periodo="${valor}"]`).click();
      await esperar(150);
      igual(rotulo(), `Vistorias no período · ${texto}`);
      if (valor === "tudo") ok(t.el.querySelector("#db-subtitulo").textContent.includes("todas as vistorias, desde"), "subtítulo do Tudo sem comparação");
    }
  } finally {
    t.fim();
  }
});

teste("dashboard: bloco Recebimento nas lojas, cartões abrem as listas e coluna Divergências", async () => {
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
    const bloco = () => t.el.querySelector(".db-receb"); // a tela é redesenhada a cada clique
    ok(bloco(), "falta o bloco Recebimento nas lojas");
    const nums = [...bloco().querySelectorAll(".db-kpi-num")].map((n) => n.textContent);
    igual(nums, ["1", "1", "1"]);
    const titulo = () => t.el.querySelector("#db-h-ultimas").textContent.trim();
    bloco().querySelector('[data-lista="aguardando"]').click();
    igual(titulo(), "Veículos aguardando recebimento (1)");
    ok([...t.el.querySelectorAll("#db-lista th")].some((th) => th.textContent.trim() === "Recebimento"), "a lista mostra a coluna Recebimento");
    bloco().querySelector('[data-lista="divergencia"]').click();
    igual(titulo(), "Veículos recebidos com divergência (1)");
    ok(t.el.querySelector("#db-lista .selo-receb-divergencia"));
    bloco().querySelector('[data-lista="divergencia"]').click();
    igual(titulo(), "Últimas vistorias");
    const cab = [...t.el.querySelectorAll('[aria-labelledby="db-h-loja"] thead th')].map((th) => th.textContent.trim());
    igual(cab, ["Loja", "Enviados", "Aguardando", "Conforme", "Divergência"]);
  } finally {
    t.fim();
  }
});
