import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularMetricas, filtrarVistorias, juntarComServidor, paginar, primeiroNome, semAcento, enderecoDasVistorias, filtrosDoEndereco, carrosDoDia, marcasDosCarros, textoCarrosEnviados } from "../painel-dados.js";

const AGORA = new Date(2026, 10, 9, 15, 0); // 09/11/2026 15:00 (fuso local)
const em = (diasAtras, hora = 10) => new Date(2026, 10, 9 - diasAtras, hora, 0).toISOString();
const v = (id, extra = {}) => ({ id, realizadaEm: em(0), status: "sincronizada", chassi: "AB123C", marca: "Jeep", modelo: "Compass", numero: `VIS-${id}`, ...extra });

const itens = [
  v("1", { realizadaEm: em(0, 8) }),
  v("2", { realizadaEm: em(0, 23), status: "pendente" }),
  v("3", { realizadaEm: em(6), status: "erro", marca: "Chevrolet", modelo: "Ônix", chassi: "ZZ999Z" }),
  v("4", { realizadaEm: em(7, 23) }),
  v("5", { realizadaEm: em(29) }),
  v("6", { realizadaEm: em(31) }),
];

test("métricas: hoje, 7 dias (como o filtro), pendentes (tudo que não é sincronizada) e total", () => {
  assert.deepEqual(calcularMetricas(itens, AGORA), { hoje: 2, semana: 3, pendentes: 2, total: 6 });
  assert.deepEqual(calcularMetricas([], AGORA), { hoje: 0, semana: 0, pendentes: 0, total: 0 });
});

test("filtro: busca sem acento e sem diferenciar maiúsculas, por chassi, marca, modelo e número", () => {
  assert.deepEqual(filtrarVistorias(itens, { busca: "onix" }, AGORA).map((x) => x.id), ["3"]);
  assert.deepEqual(filtrarVistorias(itens, { busca: "ÔNIX" }, AGORA).map((x) => x.id), ["3"]);
  assert.deepEqual(filtrarVistorias(itens, { busca: "zz99" }, AGORA).map((x) => x.id), ["3"]);
  assert.deepEqual(filtrarVistorias(itens, { busca: "vis-5" }, AGORA).map((x) => x.id), ["5"]);
  assert.equal(filtrarVistorias(itens, { busca: "xyz" }, AGORA).length, 0);
});

test("filtro: períodos Hoje, 7 dias, 30 dias e Todos, combinados com a busca", () => {
  const ids = (f) => filtrarVistorias(itens, f, AGORA).map((x) => x.id);
  assert.deepEqual(ids({ periodo: "hoje" }), ["1", "2"]);
  assert.deepEqual(ids({ periodo: "7d" }), ["1", "2", "3"]);
  assert.deepEqual(ids({ periodo: "30d" }), ["1", "2", "3", "4", "5"]);
  assert.equal(ids({ periodo: "todos" }).length, 6);
  assert.deepEqual(ids({ periodo: "7d", busca: "jeep" }), ["1", "2"]);
});

test("filtro: Este mês, Personalizado, marca e loja (iguais ao dashboard)", () => {
  const lista = [
    v("a", { realizadaEm: em(0), loja: "PG Prime Jeep Natal" }),
    v("b", { realizadaEm: em(8), marca: "BMW", loja: "PG Prime BMW Natal" }),
    v("c", { realizadaEm: em(12), loja: "" }),
  ];
  const ids = (f) => filtrarVistorias(lista, f, AGORA).map((x) => x.id);
  assert.deepEqual(ids({ periodo: "mes" }), ["a", "b"]); // 01 a 09/11
  assert.deepEqual(ids({ periodo: "personalizado", de: "2026-10-28", ate: "2026-10-31" }), ["c"]);
  assert.equal(ids({ periodo: "personalizado", de: "", ate: "" }).length, 3, "personalizado incompleto não filtra");
  assert.deepEqual(ids({ marca: "BMW" }), ["b"]);
  assert.deepEqual(ids({ loja: "PG Prime Jeep Natal" }), ["a"]);
  assert.deepEqual(ids({ loja: "Sem loja informada" }), ["c"]);
  assert.deepEqual(ids({ marca: "Jeep", busca: "vis-a" }), ["a"]);
});

test("paginação: 25 por página, contador 1-based e página corrigida", () => {
  const muitos = Array.from({ length: 60 }, (_, i) => i);
  const p1 = paginar(muitos, 0, 25);
  assert.deepEqual([p1.de, p1.ate, p1.total, p1.paginas], [1, 25, 60, 3]);
  const p3 = paginar(muitos, 2, 25);
  assert.deepEqual([p3.de, p3.ate, p3.itens.length], [51, 60, 10]);
  assert.equal(paginar(muitos, 9, 25).pagina, 2);
  assert.equal(paginar(muitos, -1, 25).pagina, 0);
  const vazio = paginar([], 0, 25);
  assert.deepEqual([vazio.de, vazio.ate, vazio.total, vazio.paginas], [0, 0, 0, 1]);
});

test("nome: primeiro nome do perfil; vazio quando não há", () => {
  assert.equal(primeiroNome("Luan Willian"), "Luan");
  assert.equal(primeiroNome(null), "");
  assert.equal(primeiroNome("  "), "");
  assert.equal(semAcento("Ônix Açaí"), "onix acai");
});

test("filtro de recebimento: aguardando, conforme e com divergência (sem loja não aguarda)", () => {
  const r = (status) => ({ id: `r-${status}`, userId: "uL", status, recebedorNome: "D", loja: "L", recebidoEm: em(0), descricao: "", assinatura: "p", fotos: [] });
  const lista = [
    v("a", { loja: "PG Prime BMW Natal", recebimento: null }),
    v("b", { loja: "PG Prime BMW Natal", recebimento: r("conforme") }),
    v("c", { loja: "PG Prime BMW Natal", recebimento: r("divergencia") }),
    v("d", { loja: "", recebimento: null }),
  ];
  const ids = (recebimento) => filtrarVistorias(lista, { recebimento }, AGORA).map((x) => x.id);
  assert.deepEqual(ids("aguardando"), ["a"]);
  assert.deepEqual(ids("conforme"), ["b"]);
  assert.deepEqual(ids("divergencia"), ["c"]);
  assert.equal(ids("").length, 4);
});

test("junção servidor + aparelho: o recebimento do servidor vale mais que a cópia guardada", () => {
  const remoto = v("a", { recebimento: { id: "r1", status: "conforme" } });
  const local = v("a", { recebimento: null, status: "sincronizada" });
  assert.deepEqual(juntarComServidor(remoto, local).recebimento, { id: "r1", status: "conforme" });
  assert.equal(juntarComServidor(v("b", { recebimento: undefined }), v("b", { recebimento: { id: "x" } })).recebimento.id, "x");
});

test("link do dashboard para a aba Vistorias: leva período, marca, loja e recebimento", () => {
  assert.equal(enderecoDasVistorias({ periodo: "30d", marca: "", loja: "" }, "aguardando"), "#/inicio?periodo=30d&recebimento=aguardando");
  assert.equal(enderecoDasVistorias({ periodo: "tudo", marca: "BMW", loja: "PG Prime BMW Natal" }, "divergencia"),
    "#/inicio?periodo=todos&marca=BMW&loja=PG+Prime+BMW+Natal&recebimento=divergencia");
  assert.equal(enderecoDasVistorias({ periodo: "personalizado", de: "2026-11-01", ate: "2026-11-10" }, "aguardando"),
    "#/inicio?periodo=personalizado&de=2026-11-01&ate=2026-11-10&recebimento=aguardando");
});

test("filtros vindos do endereço: só valores conhecidos; o resto é ignorado", () => {
  const ida = (h) => filtrosDoEndereco(new URLSearchParams(h.split("?")[1]));
  assert.deepEqual(ida(enderecoDasVistorias({ periodo: "7d", marca: "Jeep", loja: "Sem loja informada" }, "divergencia")),
    { periodo: "7d", marca: "Jeep", loja: "Sem loja informada", recebimento: "divergencia" });
  assert.deepEqual(ida("#/inicio?periodo=personalizado&de=2026-11-01&ate=2026-11-10"), { periodo: "personalizado", de: "2026-11-01", ate: "2026-11-10" });
  assert.deepEqual(ida("#/inicio?periodo=ontem&recebimento=talvez&de=xx"), {});
  assert.deepEqual(filtrosDoEndereco(undefined), {});
});

// ---------- Relatório de carros enviados (mensagem do WhatsApp do gerente) ----------
const carro = (id, marca, modelo, chassi, dia, hora) => ({ id, marca, modelo, chassi, realizadaEm: new Date(2026, 10, dia, hora, 0).toISOString(), status: "sincronizada" });
const doDia = [
  carro("1", "GWM", "Tank 400", "603985", 17, 10),
  carro("2", "jeep", "Renegade", "741485", 17, 9),
  carro("3", "GWM", "Poer", "603799", 17, 8),
  carro("4", "Leapmotor", "B10", "063374", 17, 15),
  carro("5", "GWM", "Ora 05", "604893", 17, 11),
  carro("6", "BMW", "X1", "111111", 16, 17),
];

test("relatório de carros enviados: só os carros do dia escolhido (no fuso do navegador)", () => {
  assert.deepEqual(carrosDoDia(doDia, "2026-11-17").map((v) => v.id).sort(), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(carrosDoDia(doDia, "2026-11-16").map((v) => v.id), ["6"]);
  assert.deepEqual(carrosDoDia(doDia, ""), []);
  assert.deepEqual(carrosDoDia([{ ...doDia[0], status: "excluindo" }], "2026-11-17"), [], "vistoria sendo excluída não entra");
});

test("relatório de carros enviados: marcas do dia em ordem alfabética, com a quantidade", () => {
  assert.deepEqual(marcasDosCarros(carrosDoDia(doDia, "2026-11-17")), [
    { nome: "GWM", qtd: 3 }, { nome: "Jeep", qtd: 1 }, { nome: "Leapmotor", qtd: 1 },
  ]);
});

test("relatório de carros enviados: texto no formato da mensagem do WhatsApp", () => {
  const carros = carrosDoDia(doDia, "2026-11-17");
  assert.equal(textoCarrosEnviados(carros), [
    "Carros enviados;", "",
    "GWM:", "Poer - 603799", "Tank 400 - 603985", "Ora 05 - 604893", "",
    "Jeep:", "Renegade - 741485", "",
    "Leapmotor:", "B10 - 063374",
  ].join("\n"));
  assert.equal(textoCarrosEnviados(carros, ["GWM"]), "Carros enviados;\n\nGWM:\nPoer - 603799\nTank 400 - 603985\nOra 05 - 604893", "só a GWM");
  assert.equal(textoCarrosEnviados(carros, []), "", "nenhuma marca escolhida: texto vazio");
  assert.equal(textoCarrosEnviados([]), "", "dia sem carros: texto vazio");
  assert.equal(textoCarrosEnviados([carro("x", "GWM", "", "", 17, 9)]), "Carros enviados;\n\nGWM:\n(sem modelo) - (sem chassi)");
});
