import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatarDataHora, formatarData, dataArquivo, formatarKm, lerKm, normalizarChassi, idProvisorio, nomeVistoria,
  nomeArquivoPdf, chaveLocal, caminhoRemoto, ARQUIVO, arquivoAvaria, rotuloArquivo, arquivosDaVistoria, textoPdf,
  periodo, periodoPersonalizado, novoRascunho, vistoriaDoRascunho,
} from "../formatos.js";

test("datas no fuso do aparelho (23:30 em São Paulo é o dia seguinte em UTC)", () => {
  assert.equal(formatarDataHora("2026-11-08T02:30:00.000Z"), "07/11/2026 23:30");
  assert.equal(formatarData("2026-11-08T02:30:00.000Z"), "07/11/2026");
  assert.equal(dataArquivo("2026-11-08T02:30:00.000Z"), "2026-11-07");
});

test("km com separador de milhar e leitura só de dígitos", () => {
  assert.equal(formatarKm(123456), "123.456");
  assert.equal(formatarKm(0), "0");
  assert.equal(formatarKm(null), "");
  assert.equal(lerKm("12.345 km"), 12345);
  assert.equal(lerKm("007"), 7);
  assert.equal(lerKm(""), null);
  assert.equal(lerKm("abc"), null);
});

test("chassi colado com espaços, hífens e minúsculas", () => {
  assert.equal(normalizarChassi(" ab-12 3cd"), "AB123C");
  assert.equal(normalizarChassi("çã9"), "9");
});

test("identificação provisória e nomes de arquivo", () => {
  assert.equal(idProvisorio("8f3a1c2e-0000-4000-8000-000000000000"), "Provisório 8F3A");
  assert.equal(nomeVistoria({ id: "8f3a1c2e-0000-4000-8000-000000000000", numero: null }), "Provisório 8F3A");
  assert.equal(nomeVistoria({ id: "x", numero: "VIS-000123" }), "VIS-000123");
  assert.equal(nomeArquivoPdf({ chassi: "AB123C", realizadaEm: "2026-11-08T02:30:00.000Z" }), "Vistoria_AB123C_2026-11-07.pdf");
  assert.equal(caminhoRemoto("u1", "v1", "frente.jpg"), "u1/v1/frente.jpg");
  assert.equal(chaveLocal("v1", "frente.jpg"), "v1/frente.jpg");
  assert.equal(arquivoAvaria("f9"), "avaria_f9.jpg");
  assert.equal(ARQUIVO.assVistoriador, "assinatura_vistoriador.png");
});

test("lista e rótulos dos arquivos da vistoria", () => {
  const v = { avarias: [{ fotos: ["a1", "a2"] }, { fotos: [] }] };
  assert.deepEqual(arquivosDaVistoria(v), ["frente.jpg", "frente_mini.jpg", "traseira.jpg", "chassi.jpg",
    "avaria_a1.jpg", "avaria_a2.jpg", "assinatura_vistoriador.png", "assinatura_motorista.png"]);
  assert.equal(rotuloArquivo("traseira.jpg"), "Traseira");
  assert.equal(rotuloArquivo("frente_mini.jpg"), "Frente (miniatura)");
  assert.equal(rotuloArquivo("avaria_a1.jpg"), "Foto de avaria");
  assert.equal(rotuloArquivo("assinatura_motorista.png"), "Assinatura do motorista do reboque");
});

test("texto para o PDF remove o que a Helvetica não desenha", () => {
  assert.equal(textoPdf("Risco 👍 na porta"), "Risco na porta");
  assert.equal(textoPdf("Ação “ok” — fim…\nlinha 2"), "Ação “ok” — fim…\nlinha 2");
  assert.equal(textoPdf("线"), "");
  assert.equal(textoPdf("maçaneta 👍, com pintura 👍."), "maçaneta, com pintura.");
});

test("períodos começam à meia-noite local", () => {
  const agora = new Date("2026-11-07T10:00:00-03:00");
  assert.deepEqual(periodo("hoje", agora), { de: "2026-11-07T03:00:00.000Z", ate: null });
  assert.deepEqual(periodo("7d", agora), { de: "2026-11-01T03:00:00.000Z", ate: null });
  assert.deepEqual(periodo("30d", agora), { de: "2026-10-09T03:00:00.000Z", ate: null });
  assert.deepEqual(periodo("todos", agora), { de: null, ate: null });
  assert.deepEqual(periodoPersonalizado("2026-11-01", "2026-11-07"), { de: "2026-11-01T03:00:00.000Z", ate: "2026-11-08T03:00:00.000Z" });
  assert.deepEqual(periodoPersonalizado("", ""), { de: null, ate: null });
});

test("rascunho novo e conversão em vistoria pendente", () => {
  const r = novoRascunho("u1", "v1", "2026-11-07T12:00:00.000Z");
  assert.equal(r.etapa, 1);
  assert.equal(r.dados.combustivel, null);
  assert.deepEqual(r.dados.avarias, []);
  r.dados.km = 1000;
  r.dados.avarias = [{ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "", fotos: [] }];
  const vi = vistoriaDoRascunho(r, "2026-11-07T13:00:00.000Z");
  assert.equal(vi.status, "pendente");
  assert.equal(vi.numero, null);
  assert.equal(vi.origem, "local");
  assert.equal(vi.completa, true);
  assert.equal(vi.avariasQtd, 1);
  assert.deepEqual(vi.enviados, []);
  assert.equal(vi.realizadaEm, "2026-11-07T13:00:00.000Z");
  assert.equal(vi.arquivosSalvosEm, "2026-11-07T13:00:00.000Z");
  assert.equal("fotos" in vi, false);
  assert.equal("assinaturas" in vi, false);
  r.dados.avarias[0].area = "Teto";
  assert.equal(vi.avarias[0].area, "Capô");
});
