// Gera os ícones PNG do app a partir da mesma geometria de icons/icon.svg.
// Sem dependências: desenha com supersampling e grava o PNG com node:zlib.
// Uso: node scripts/gerar-icones.js
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AZUL = [11, 79, 108];
const BRANCO = [255, 255, 255];
const PRESILHA = [127, 179, 200];
const CHECK = [[190, 270], [240, 320], [330, 215]];
const MEIA_ESPESSURA = 18;

function dentroRetanguloArredondado(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distanciaAoSegmento(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Cor de um ponto (u, v) no espaço de 512 unidades; null = transparente.
function cor(u, v, maskable) {
  if (!maskable && !dentroRetanguloArredondado(u, v, 0, 0, 512, 512, 112)) return null;
  // No maskable o desenho encolhe para 80% em torno do centro (zona segura).
  const x = maskable ? 256 + (u - 256) / 0.8 : u;
  const y = maskable ? 256 + (v - 256) / 0.8 : v;
  const noCheck = distanciaAoSegmento(x, y, CHECK[0], CHECK[1]) <= MEIA_ESPESSURA
    || distanciaAoSegmento(x, y, CHECK[1], CHECK[2]) <= MEIA_ESPESSURA;
  if (noCheck) return AZUL;
  if (dentroRetanguloArredondado(x, y, 200, 80, 312, 136, 16)) return PRESILHA;
  if (dentroRetanguloArredondado(x, y, 136, 104, 376, 424, 28)) return BRANCO;
  return AZUL;
}

export function desenharIcone(tamanho, { maskable = false } = {}) {
  const rgba = new Uint8Array(tamanho * tamanho * 4);
  const N = 4; // 4×4 amostras por pixel
  const escala = 512 / tamanho;
  for (let py = 0; py < tamanho; py++) {
    for (let px = 0; px < tamanho; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const c = cor((px + (i + 0.5) / N) * escala, (py + (j + 0.5) / N) * escala, maskable);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const k = (py * tamanho + px) * 4;
      if (a) {
        rgba[k] = Math.round(r / a);
        rgba[k + 1] = Math.round(g / a);
        rgba[k + 2] = Math.round(b / a);
      }
      rgba[k + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  return rgba;
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

export function codificarPng(largura, altura, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const linhas = Buffer.alloc((largura * 4 + 1) * altura);
  for (let y = 0; y < altura; y++) {
    linhas[y * (largura * 4 + 1)] = 0; // filtro 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * largura * 4, largura * 4).copy(linhas, y * (largura * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", zlib.deflateSync(linhas, { level: 9 })),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "icons");
  const saidas = [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["maskable-512.png", 512, true], ["apple-touch-icon-180.png", 180, true]];
  for (const [nome, tamanho, maskable] of saidas) {
    fs.writeFileSync(path.join(pasta, nome), codificarPng(tamanho, tamanho, desenharIcone(tamanho, { maskable })));
    console.log(`icons/${nome}`);
  }
}
