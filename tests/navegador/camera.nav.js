import { teste, igual, ok, esperarAte } from "./runner.js";
import { abrirCamera } from "../../camera.js";

// Câmera falsa: um canvas deitado (16:9) animado, entregue como MediaStream.
function cameraFalsa(largura = 1280, altura = 720) {
  const c = document.createElement("canvas");
  c.width = largura;
  c.height = altura;
  const g = c.getContext("2d");
  let quadro = 0;
  const pintar = () => {
    g.fillStyle = "#3366cc";
    g.fillRect(0, 0, largura, altura);
    g.fillStyle = "#ff0000"; // faixa vermelha no centro: tem que aparecer na foto
    g.fillRect(largura / 2 - 20, 0, 40, altura);
    g.fillStyle = `hsl(${quadro++ % 360} 50% 50%)`;
    g.fillRect(0, 0, 10, 10);
  };
  pintar();
  const timer = setInterval(pintar, 50);
  const stream = c.captureStream(20);
  const pedidos = [];
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async (r) => { pedidos.push(r); return stream; } },
  });
  return {
    pedidos, stream,
    restaurar() {
      clearInterval(timer);
      delete navigator.mediaDevices;
      if (original) Object.defineProperty(Navigator.prototype, "mediaDevices", original);
    },
  };
}

const tela = () => document.querySelector("dialog.camera[open]");
const botao = (acao) => tela()?.querySelector(`[data-acao="${acao}"]`);

teste("câmera do app: pede a traseira em 3:4, conferência e foto 960×1280 com recorte central", async () => {
  const cam = cameraFalsa();
  try {
    const promessa = abrirCamera({ titulo: "Frente" });
    ok(await esperarAte(() => tela() && !botao("capturar").disabled), "a câmera não ficou pronta");
    igual(cam.pedidos[0].video.facingMode.ideal, "environment");
    igual(cam.pedidos[0].audio, false);
    const video = tela().querySelector("video");
    ok(video.autoplay && video.playsInline && video.muted, "video sem autoplay/playsinline/muted");
    igual(getComputedStyle(tela().querySelector(".camera-quadro")).aspectRatio, "3 / 4");

    botao("capturar").click();
    ok(await esperarAte(() => !tela().querySelector('[data-modo="conferir"]').hidden), "a conferência não apareceu");
    ok(tela().querySelector(".camera-previa").getAttribute("src"), "sem prévia da foto");

    botao("repetir").click(); // tirar novamente volta ao vídeo
    ok(!tela().querySelector('[data-modo="mirar"]').hidden && !tela().querySelector("video").hidden, "Tirar novamente não voltou ao vídeo");
    botao("capturar").click();
    ok(await esperarAte(() => !tela().querySelector('[data-modo="conferir"]').hidden), "a segunda conferência não apareceu");
    botao("usar").click();

    const foto = await promessa;
    ok(foto instanceof Blob, "não devolveu Blob");
    igual(foto.type, "image/jpeg");
    const bmp = await createImageBitmap(foto);
    igual(`${bmp.width}x${bmp.height}`, "960x1280");
    const g = Object.assign(document.createElement("canvas"), { width: 960, height: 1280 }).getContext("2d");
    g.drawImage(bmp, 0, 0);
    const [r, , b] = g.getImageData(480, 640, 1, 1).data;
    ok(r > 200 && b < 80, `o centro da foto deveria ser a faixa vermelha (veio r=${r} b=${b})`);
    ok(!document.querySelector("dialog.camera"), "a tela da câmera não fechou");
    ok(cam.stream.getTracks().every((t) => t.readyState === "ended"), "a câmera continuou ligada");
  } finally {
    cam.restaurar();
  }
});

teste("câmera do app: fechar devolve null e desliga a câmera", async () => {
  const cam = cameraFalsa();
  try {
    const promessa = abrirCamera({ titulo: "Traseira" });
    ok(await esperarAte(() => tela() && !botao("capturar").disabled), "a câmera não ficou pronta");
    botao("fechar").click();
    igual(await promessa, null);
    ok(cam.stream.getTracks().every((t) => t.readyState === "ended"), "a câmera continuou ligada");
  } finally {
    cam.restaurar();
  }
});

teste("câmera do app: permissão negada mostra a mensagem e oferece a câmera do aparelho", async () => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => { throw new DOMException("negado", "NotAllowedError"); } },
  });
  try {
    const promessa = abrirCamera({ titulo: "Chassi" });
    ok(await esperarAte(() => tela() && !tela().querySelector('[data-modo="erro"]').hidden), "a mensagem de erro não apareceu");
    ok(/bloqueada/.test(tela().querySelector(".camera-status").textContent), "mensagem de permissão negada ausente");
    ok(botao("aparelho"), "falta o botão Usar a câmera do aparelho");
    botao("fechar").click();
    igual(await promessa, null);
  } finally {
    delete navigator.mediaDevices;
  }
});
