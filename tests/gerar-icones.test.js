import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { desenharIcone, codificarPng } from "../scripts/gerar-icones.js";

// Lê um PNG RGBA 8 bits gravado com filtro 0 em todas as linhas.
function lerPng(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const largura = buf.readUInt32BE(16);
  const altura = buf.readUInt32BE(20);
  const partes = [];
  for (let p = 8; p < buf.length;) {
    const n = buf.readUInt32BE(p);
    const tipo = buf.toString("ascii", p + 4, p + 8);
    if (tipo === "IDAT") partes.push(buf.subarray(p + 8, p + 8 + n));
    p += 12 + n;
  }
  const dados = zlib.inflateSync(Buffer.concat(partes));
  const linha = largura * 4 + 1;
  const pixel = (x, y) => [...dados.subarray(y * linha + 1 + x * 4, y * linha + 1 + x * 4 + 4)];
  return { largura, altura, pixel };
}

const AZUL = [11, 79, 108, 255];
const BRANCO = [255, 255, 255, 255];

test("PNG 192×192 com assinatura e IHDR corretos", () => {
  const png = lerPng(codificarPng(192, 192, desenharIcone(192, { maskable: false })));
  assert.equal(png.largura, 192);
  assert.equal(png.altura, 192);
});

test("ícone normal 512: canto transparente, borda azul e prancheta branca", () => {
  const png = lerPng(codificarPng(512, 512, desenharIcone(512, { maskable: false })));
  assert.equal(png.largura, 512);
  assert.equal(png.pixel(0, 0)[3], 0);
  assert.deepEqual(png.pixel(5, 256), AZUL);
  assert.deepEqual(png.pixel(256, 360), BRANCO);
});

test("ícone maskable 512: fundo azul até o canto e desenho na zona segura", () => {
  const png = lerPng(codificarPng(512, 512, desenharIcone(512, { maskable: true })));
  assert.deepEqual(png.pixel(0, 0), AZUL);
  assert.deepEqual(png.pixel(256, 360), BRANCO);
  assert.deepEqual(png.pixel(256, 40), AZUL); // a presilha (y ≥ 80 no normal) encolheu para dentro dos 80%
});
