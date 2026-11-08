import { teste, igual, ok, rejeita } from "./runner.js";
import { comprimir, gerarMiniatura } from "../../photos.js";

function imagem(largura, altura, tipo, { transparente = false } = {}) {
  const c = document.createElement("canvas");
  c.width = largura;
  c.height = altura;
  const g = c.getContext("2d");
  if (!transparente) {
    g.fillStyle = "#3366aa";
    g.fillRect(0, 0, largura, altura);
  }
  g.fillStyle = "#cc2200";
  g.fillRect(largura / 4, altura / 4, largura / 2, altura / 2);
  return new Promise((r) => c.toBlob(r, tipo, 0.9));
}

async function medidas(blob) {
  const b = await createImageBitmap(blob);
  const m = { w: b.width, h: b.height };
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  c.getContext("2d").drawImage(b, 0, 0);
  m.canto = [...c.getContext("2d").getImageData(0, 0, 1, 1).data];
  return m;
}

teste("fotos: PNG enorme e transparente vira JPEG 1280×960 com fundo branco", async () => {
  const saida = await comprimir(await imagem(4000, 3000, "image/png", { transparente: true }));
  igual(saida.type, "image/jpeg");
  const m = await medidas(saida);
  igual([m.w, m.h], [1280, 960]);
  ok(m.canto[0] > 245 && m.canto[1] > 245 && m.canto[2] > 245, `canto não é branco: ${m.canto}`);
});

teste("fotos: imagem pequena não é ampliada", async () => {
  const m = await medidas(await comprimir(await imagem(300, 200, "image/jpeg")));
  igual([m.w, m.h], [300, 200]);
});

teste("fotos: arquivo que não é imagem gera a mensagem em português", async () => {
  await rejeita(comprimir(new Blob(["não sou foto"], { type: "text/plain" })), "Não foi possível ler esta foto. Tente tirar outra.");
});

teste("fotos: miniatura de 1280×960 fica com 320×240", async () => {
  const m = await medidas(await gerarMiniatura(await imagem(1280, 960, "image/jpeg")));
  igual([m.w, m.h], [320, 240]);
});
