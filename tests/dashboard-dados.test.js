import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEM_LOJA, dentro, descreverPeriodo, filtrarDashboard, formatarPct, listaPorRecebimento, gravidadeMaxima, intervaloDoDashboard, marcasDisponiveis,
  porGravidade, porLoja, porMarca, rankingAreas, rankingTipos, resumo, serie, topoDoEixo, ultimasComAvaria,
} from "../dashboard-dados.js";

const AGORA = new Date(2026, 10, 11, 15, 0); // 11/11/2026 15:00 (fuso local)
const em = (dia, hora = 10, mes = 10) => new Date(2026, mes, dia, hora, 0).toISOString();
const av = (gravidade, area = "Capô", tipo = "Risco") => ({ area, tipo, gravidade });
const v = (id, extra = {}) => ({ id, numero: `VIS-${id}`, realizadaEm: em(11), chassi: "AB123C", marca: "Jeep", modelo: "Compass", loja: "PG Prime Jeep Natal", avarias: [], ...extra });

test("período: 7 dias, 30 dias e este mês incluem hoje e têm um anterior do mesmo tamanho", () => {
  const sete = intervaloDoDashboard("7d", AGORA);
  assert.equal(sete.de, new Date(2026, 10, 5).toISOString());
  assert.equal(sete.ate, new Date(2026, 10, 12).toISOString());
  assert.equal(sete.dias, 7);
  assert.equal(sete.porHora, false);
  assert.deepEqual(sete.anterior, { de: new Date(2026, 9, 29).toISOString(), ate: sete.de });

  assert.equal(intervaloDoDashboard("30d", AGORA).dias, 30);
  const mes = intervaloDoDashboard("mes", AGORA);
  assert.equal(mes.de, new Date(2026, 10, 1).toISOString());
  assert.equal(mes.dias, 11);
  assert.equal(mes.anterior.de, new Date(2026, 9, 21).toISOString());
});

test("período: hoje é por hora; personalizado usa as datas e recusa datas invertidas ou vazias", () => {
  const hoje = intervaloDoDashboard("hoje", AGORA);
  assert.equal(hoje.porHora, true);
  assert.equal(hoje.anterior.de, new Date(2026, 10, 10).toISOString());
  const p = intervaloDoDashboard("personalizado", AGORA, { de: "2026-10-01", ate: "2026-10-31" });
  assert.equal(p.de, new Date(2026, 9, 1).toISOString());
  assert.equal(p.ate, new Date(2026, 10, 1).toISOString());
  assert.equal(p.dias, 31);
  assert.equal(intervaloDoDashboard("personalizado", AGORA, { de: "2026-10-31", ate: "2026-10-01" }), null);
  assert.equal(intervaloDoDashboard("personalizado", AGORA, { de: "", ate: "2026-10-01" }), null);
  assert.equal(intervaloDoDashboard("xyz", AGORA), null);
});

test("dentro: início incluído, fim excluído", () => {
  const i = intervaloDoDashboard("hoje", AGORA);
  assert.equal(dentro(i.de, i), true);
  assert.equal(dentro(i.ate, i), false);
});

test("marca digitada de jeitos diferentes conta como uma só (Bmw = BMW)", () => {
  const itens = [v("1", { marca: "Bmw" }), v("2", { marca: "BMW" }), v("3", { marca: "jeep" })];
  assert.deepEqual(marcasDisponiveis(itens), ["BMW", "Jeep"]);
  assert.deepEqual(porMarca(itens).map((m) => [m.nome, m.vistorias]), [["BMW", 2], ["Jeep", 1]]);
  assert.deepEqual(filtrarDashboard(itens, { marca: "BMW" }).map((x) => x.id), ["1", "2"]);
});

test("filtros por marca e loja; vistoria sem loja cai em 'Sem loja informada'", () => {
  const itens = [v("1"), v("2", { marca: "BMW", loja: "PG Prime BMW Natal" }), v("3", { loja: "" }), v("4", { loja: null })];
  assert.deepEqual(filtrarDashboard(itens, { marca: "Jeep" }).map((x) => x.id), ["1", "3", "4"]);
  assert.deepEqual(filtrarDashboard(itens, { loja: "PG Prime BMW Natal" }).map((x) => x.id), ["2"]);
  assert.deepEqual(filtrarDashboard(itens, { loja: SEM_LOJA }).map((x) => x.id), ["3", "4"]);
  assert.deepEqual(filtrarDashboard(itens, {}).length, 4);
  assert.deepEqual(marcasDisponiveis(itens), ["BMW", "Jeep"]);
});

test("resumo: totais, % com avaria, graves e variação contra o período anterior", () => {
  const itens = [v("1", { avarias: [av("Leve"), av("Grave")] }), v("2", { avarias: [av("Grave")] }), v("3"), v("4")];
  const r = resumo(itens, [v("a"), v("b")]);
  assert.deepEqual(r, { total: 4, totalAnterior: 2, variacao: 100, comAvaria: 2, pctComAvaria: 50, avarias: 3, graves: 2, pctGraves: (2 / 3) * 100 });
  assert.equal(resumo([], []).variacao, null, "sem período anterior não há variação");
  assert.equal(resumo([], []).pctComAvaria, 0);
});

test("série por dia alinha o período anterior na mesma posição", () => {
  const i = intervaloDoDashboard("7d", AGORA);
  const s = serie([v("1", { realizadaEm: em(5, 0) }), v("2", { realizadaEm: em(11, 23) }), v("3", { realizadaEm: em(11, 8) })],
    [v("a", { realizadaEm: em(29, 12, 9) })], i);
  assert.deepEqual(s.atual, [1, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(s.anterior, [1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.rotulos, ["05/11", "06/11", "07/11", "08/11", "09/11", "10/11", "11/11"]);
});

test("série de hoje tem 24 colunas, uma por hora", () => {
  const s = serie([v("1", { realizadaEm: em(11, 9) }), v("2", { realizadaEm: em(11, 9) })], [v("a", { realizadaEm: em(10, 14) })], intervaloDoDashboard("hoje", AGORA));
  assert.equal(s.atual.length, 24);
  assert.equal(s.atual[9], 2);
  assert.equal(s.anterior[14], 1);
  assert.equal(s.rotulos[9], "09h");
});

test("gravidade: contagem e % na ordem Leve, Moderada, Grave", () => {
  const g = porGravidade([v("1", { avarias: [av("Leve"), av("Leve"), av("Grave")] }), v("2", { avarias: [av("Moderada")] })]);
  assert.deepEqual(g.map((x) => [x.gravidade, x.qtd, x.pct]), [["Leve", 2, 50], ["Moderada", 1, 25], ["Grave", 1, 25]]);
  assert.deepEqual(porGravidade([]).map((x) => x.pct), [0, 0, 0]);
});

test("rankings de áreas e tipos (empate em ordem alfabética)", () => {
  const itens = [v("1", { avarias: [av("Leve", "Teto", "Risco"), av("Leve", "Capô", "Amassado"), av("Leve", "Capô", "Risco")] })];
  assert.deepEqual(rankingAreas(itens), [{ nome: "Capô", qtd: 2 }, { nome: "Teto", qtd: 1 }]);
  assert.deepEqual(rankingTipos(itens, 1), [{ nome: "Risco", qtd: 2 }]);
});

test("por marca e por loja: contagens, % e última vistoria; 'Sem loja' por último", () => {
  const itens = [
    v("1", { avarias: [av("Grave")], realizadaEm: em(9) }),
    v("2", { realizadaEm: em(10) }),
    v("3", { marca: "BMW", loja: "", realizadaEm: em(8) }),
  ];
  assert.deepEqual(porMarca(itens).map((m) => [m.nome, m.vistorias, m.comAvaria, m.pctComAvaria, m.graves]),
    [["Jeep", 2, 1, 50, 1], ["BMW", 1, 0, 0, 0]]);
  const lojas = porLoja([...itens, v("4", { loja: "PG Prime Audi Natal" }), v("5", { loja: "PG Prime Audi Natal" })]);
  assert.deepEqual(lojas.map((l) => l.nome), ["PG Prime Audi Natal", "PG Prime Jeep Natal", SEM_LOJA]);
  assert.equal(lojas[1].ultima, em(10));
});

test("últimas com avaria: mais recentes primeiro, com a gravidade mais alta", () => {
  const itens = [
    v("1", { avarias: [av("Leve")], realizadaEm: em(9) }),
    v("2", { avarias: [av("Leve"), av("Moderada")], realizadaEm: em(10) }),
    v("3", { realizadaEm: em(11) }),
  ];
  assert.deepEqual(ultimasComAvaria(itens).map((x) => [x.id, x.gravidadeMaxima]), [["2", "Moderada"], ["1", "Leve"]]);
  assert.equal(gravidadeMaxima(v("x")), "");
});

test("lista dos cartões: todas com avaria (sem limite) ou só as com avaria grave", () => {
  const itens = Array.from({ length: 10 }, (_, i) => v(String(i), { realizadaEm: em(1 + i), avarias: [av(i % 3 === 0 ? "Grave" : "Leve")] }));
  itens.push(v("sem", { realizadaEm: em(11) }));
  assert.equal(ultimasComAvaria(itens).length, 8, "padrão continua com 8");
  assert.equal(ultimasComAvaria(itens, null).length, 10);
  assert.deepEqual(ultimasComAvaria(itens, null, { soGraves: true }).map((x) => x.id), ["9", "6", "3", "0"]);
  assert.ok(ultimasComAvaria(itens, null, { soGraves: true }).every((x) => x.gravidadeMaxima === "Grave"));
});

test("eixo do gráfico e porcentagem no formato brasileiro", () => {
  assert.equal(topoDoEixo(0), 4);
  assert.equal(topoDoEixo(7), 10);
  assert.equal(topoDoEixo(13), 20);
  assert.equal(topoDoEixo(23), 25);
  assert.equal(topoDoEixo(120), 200);
  assert.equal(formatarPct(14.94), "14,9%");
  assert.equal(formatarPct(12, { sinal: true, casas: 0 }), "+12%");
  assert.equal(formatarPct(-3.2, { sinal: true, casas: 0 }), "-3%");
  assert.equal(formatarPct(0), "0%");
});

test("descrição do período para o cartão: nome do filtro e datas, com o período anterior", () => {
  assert.deepEqual(descreverPeriodo("7d", intervaloDoDashboard("7d", AGORA)), { nome: "Últimos 7 dias", datas: "05/11 a 11/11", anterior: "29/10 a 04/11" });
  assert.deepEqual(descreverPeriodo("hoje", intervaloDoDashboard("hoje", AGORA)), { nome: "Hoje", datas: "11/11", anterior: "10/11" });
  assert.deepEqual(descreverPeriodo("mes", intervaloDoDashboard("mes", AGORA)), { nome: "Este mês", datas: "01/11 a 11/11", anterior: "21/10 a 31/10" });
  assert.equal(descreverPeriodo("30d", intervaloDoDashboard("30d", AGORA)).datas, "13/10 a 11/11");
  const virada = intervaloDoDashboard("personalizado", AGORA, { de: "2025-12-20", ate: "2026-01-05" });
  assert.deepEqual(descreverPeriodo("personalizado", virada), { nome: "Período personalizado", datas: "20/12/2025 a 05/01/2026", anterior: "03/12 a 19/12" });
});

test("recebimento: divergências por loja e lista por situação (mais recentes primeiro)", () => {
  const rec = (status) => ({ id: `r${status}`, userId: "uL", status, recebedorNome: "D", loja: "L", recebidoEm: em(11), descricao: "x", assinatura: "p", fotos: [] });
  const itens = [
    v("1", { realizadaEm: em(8), recebimento: rec("divergencia") }),
    v("2", { realizadaEm: em(9), recebimento: rec("divergencia") }),
    v("3", { realizadaEm: em(10), recebimento: null }),
    v("4", { realizadaEm: em(7), recebimento: rec("conforme") }),
    v("5", { loja: "", recebimento: null }),
  ];
  const jeep = porLoja(itens).find((l) => l.nome === "PG Prime Jeep Natal");
  assert.equal(jeep.divergencias, 2);
  assert.equal(porLoja(itens).find((l) => l.nome === SEM_LOJA).divergencias, 0);
  assert.deepEqual(listaPorRecebimento(itens, "divergencia").map((x) => x.id), ["2", "1"]);
  assert.deepEqual(listaPorRecebimento(itens, "aguardando").map((x) => x.id), ["3"]);
});
