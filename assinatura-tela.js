// Tela cheia para assinar com o celular deitado.
// No Android o app tenta travar a tela na horizontal. Onde isso não é possível
// (iPhone, ou rotação travada), a tela continua em pé, mas o layout já vem
// desenhado de lado ("deitada"): a pessoa gira o celular para a esquerda, assina
// e a imagem é girada ao salvar, para a assinatura ficar sempre na horizontal.
import { montarAssinatura } from "./signature.js";
import { esc } from "./ui.js";

const MARGEM = 16; // px de folga em volta do traço, na imagem final

// Recorta em volta do traço e, se o quadro estava em pé (celular girado para a
// esquerda), gira 90° no sentido anti-horário. Devolve um canvas ou null se vazio.
export function imagemFinal(canvas, { deitada }) {
  const { width: w, height: h } = canvas;
  const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const m = Math.round(MARGEM * (window.devicePixelRatio || 1));
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(w - 1, x1 + m);
  y1 = Math.min(h - 1, y1 + m);
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  const saida = document.createElement("canvas");
  saida.width = deitada ? rh : rw;
  saida.height = deitada ? rw : rh;
  const g = saida.getContext("2d");
  if (deitada) {
    g.translate(0, rw);
    g.rotate(-Math.PI / 2);
  }
  g.drawImage(canvas, x0, y0, rw, rh, 0, 0, rw, rh);
  return saida;
}

// Ao terminar a assinatura, deixa a tela em pé de novo, mesmo que o celular
// ainda esteja deitado. A trava de orientação só dura enquanto a página está em
// tela cheia: sair dela devolve o controle ao sensor (e a tela deitava de novo).
// Por isso, se travar em pé der certo, a página CONTINUA em tela cheia — vale
// igual para a assinatura do vistoriador e a do motorista do reboque.
// Se o aparelho não aceitar a trava (ex.: iPhone), destrava e sai da tela cheia
// que o próprio app abriu, como antes.
export async function voltarParaVertical({
  entrouTelaCheia = false, orientacao = globalThis.screen?.orientation, doc = globalThis.document,
} = {}) {
  try {
    await orientacao.lock("portrait-primary");
    return;
  } catch {
    try { orientacao?.unlock(); } catch { /* sem suporte */ }
  }
  if (entrouTelaCheia && doc?.fullscreenElement) await doc.exitFullscreen().catch(() => {});
}

// Tela cheia + trava na horizontal enquanto a pessoa assina (só em telas de
// toque). terminar() sempre deixa a tela em pé de novo, mesmo que o navegador
// ainda não tenha respondido ao pedido de trava horizontal — no 1º uso do
// Android essa resposta pode demorar ou nunca chegar, e antes disso a tela do
// vistoriador ficava deitada ao confirmar.
export function criarTravaHorizontal({
  orientacao = globalThis.screen?.orientation,
  doc = globalThis.document,
  telaDeToque = Boolean(globalThis.matchMedia?.("(pointer: coarse)").matches),
} = {}) {
  let ativa = false;
  let aberta = false;
  let entrouTelaCheia = false;
  return {
    // Chame dentro do toque que abriu a tela (tela cheia exige gesto).
    async iniciar() {
      if (!telaDeToque || !orientacao?.lock) return;
      ativa = true;
      aberta = true;
      try {
        if (!doc.fullscreenElement && doc.documentElement?.requestFullscreen) {
          const pedido = doc.documentElement.requestFullscreen();
          entrouTelaCheia = true;
          await pedido;
        }
        await orientacao.lock("landscape");
      } catch {
        // Recusada com a tela ainda aberta: desfaz a tela cheia que abriu.
        // Se a tela já fechou, a "falha" é só a trava em pé substituindo esta.
        if (!aberta) return;
        ativa = false;
        if (entrouTelaCheia && doc.fullscreenElement) await doc.exitFullscreen().catch(() => {});
      }
    },
    async terminar() {
      aberta = false;
      if (ativa) await voltarParaVertical({ entrouTelaCheia, orientacao, doc });
    },
  };
}

// Abre a tela; resolve com o PNG (Blob) ao confirmar, ou null ao cancelar.
export function abrirTelaAssinatura({ titulo }) {
  return new Promise((resolver) => {
    const d = document.createElement("dialog");
    d.className = "assinar";
    d.setAttribute("aria-label", `Assinatura: ${titulo}`);
    d.innerHTML = `
      <div class="assinar-barra">
        <p class="assinar-titulo">${esc(titulo)}</p>
        <button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>
        <button type="button" class="btn btn-texto" data-acao="limpar">Limpar</button>
        <button type="button" class="btn btn-primario" data-acao="confirmar" disabled>Confirmar</button>
      </div>
      <div class="assinar-area">
        <canvas aria-label="Quadro de assinatura: ${esc(titulo)}"></canvas>
        <div class="assinar-linha" aria-hidden="true">Assine aqui</div>
      </div>`;
    const canvas = d.querySelector("canvas");
    const confirmar = d.querySelector('[data-acao="confirmar"]');
    let resultado = null;
    const trava = criarTravaHorizontal();

    const atualizarPosicao = () => {
      const deitada = innerHeight > innerWidth;
      if (deitada === d.classList.contains("deitada")) return;
      d.classList.toggle("deitada", deitada);
      pad?.limpar(); // o quadro mudou de forma: recomeça a assinatura
    };

    d.addEventListener("click", (e) => {
      const acao = e.target.closest("[data-acao]")?.dataset.acao;
      if (acao === "cancelar") d.close();
      if (acao === "limpar") pad.limpar();
      if (acao === "confirmar" && !pad.vazio()) {
        const final = imagemFinal(canvas, { deitada: d.classList.contains("deitada") });
        if (!final) return;
        confirmar.disabled = true;
        final.toBlob((blob) => {
          resultado = blob;
          d.close();
        }, "image/png");
      }
    });
    d.addEventListener("close", () => {
      removeEventListener("resize", atualizarPosicao);
      pad.destruir();
      trava.terminar();
      d.remove();
      resolver(resultado);
    });

    d.classList.toggle("deitada", innerHeight > innerWidth);
    document.body.append(d);
    d.showModal();
    const pad = montarAssinatura(canvas, { aoMudar: (blob) => { confirmar.disabled = !blob; } });
    addEventListener("resize", atualizarPosicao);
    trava.iniciar().then(() => { if (d.isConnected) atualizarPosicao(); });
  });
}
