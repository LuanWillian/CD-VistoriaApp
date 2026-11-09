import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularMetricas, filtrarVistorias, paginar, primeiroNome, semAcento } from "../painel-dados.js";

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
