// Quadro de assinatura com dedo, caneta ou mouse (Pointer Events).
// O canvas usa a densidade de pixels da tela para o traço não ficar borrado
// e devolve um PNG a cada traço concluído (exportarPng). aoTracar(temTraco) avisa
// na hora, sem esperar o PNG: gerar a imagem da tela inteira é lento no celular.
// limites() devolve a caixa do traço em pixels do canvas, para recortar sem ler a tela toda.

export function montarAssinatura(canvas, { aoMudar = () => {}, aoTracar = () => {}, exportarPng = true } = {}) {
  const g = canvas.getContext("2d");
  let desenhando = false;
  let temTraco = false;
  let copia = null; // ImageBitmap do conteúdo atual, para redesenhar ao redimensionar
  let ultimo = null;
  let caixa = null; // { x0, y0, x1, y1 } em pixels do canvas
  let caixaPerdida = false; // depois de redimensionar ou carregar, não dá mais para confiar na caixa

  const LARGURA = 2.5;
  function marcar([x, y]) {
    if (caixaPerdida) return;
    const dpr = window.devicePixelRatio || 1;
    const folga = LARGURA / 2 + 1;
    const x0 = Math.floor((x - folga) * dpr), y0 = Math.floor((y - folga) * dpr);
    const x1 = Math.ceil((x + folga) * dpr), y1 = Math.ceil((y + folga) * dpr);
    if (!caixa) caixa = { x0, y0, x1, y1 };
    else caixa = { x0: Math.min(caixa.x0, x0), y0: Math.min(caixa.y0, y0), x1: Math.max(caixa.x1, x1), y1: Math.max(caixa.y1, y1) };
  }

  canvas.classList.add("toque-livre");

  const estilo = () => {
    g.lineWidth = LARGURA;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#111111";
  };

  const medidas = () => {
    const r = canvas.getBoundingClientRect();
    return { w: r.width, h: r.height, dpr: window.devicePixelRatio || 1 };
  };

  function limparPixels() {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.restore();
  }

  function desenharCopia() {
    if (!copia) return;
    const { w, h } = medidas();
    g.drawImage(copia, 0, 0, w, h);
  }

  function ajustar() {
    const { w, h, dpr } = medidas();
    const largura = Math.max(1, Math.round(w * dpr));
    const altura = Math.max(1, Math.round(h * dpr));
    if (canvas.width === largura && canvas.height === altura) return;
    canvas.width = largura;
    canvas.height = altura;
    caixa = null; // o desenho foi esticado para o novo tamanho: recorte volta a ler os pixels
    caixaPerdida = temTraco;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    estilo();
    desenharCopia();
  }

  const ponto = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function exportar() {
    createImageBitmap(canvas).then((b) => { copia = b; }).catch(() => {});
    if (exportarPng) canvas.toBlob((blob) => aoMudar(blob), "image/png");
  }

  function aoDescer(e) {
    if (e.button > 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* evento sintético */ }
    desenhando = true;
    ultimo = ponto(e);
    marcar(ultimo);
    g.beginPath();
    g.moveTo(...ultimo);
    g.lineTo(ultimo[0] + 0.01, ultimo[1]);
    g.stroke();
  }

  function aoMover(e) {
    if (!desenhando) return;
    e.preventDefault();
    const p = ponto(e);
    const meio = [(ultimo[0] + p[0]) / 2, (ultimo[1] + p[1]) / 2];
    g.beginPath();
    g.moveTo(...ultimo);
    g.quadraticCurveTo(ultimo[0], ultimo[1], meio[0], meio[1]);
    g.lineTo(...p);
    g.stroke();
    marcar(p);
    ultimo = p;
  }

  function aoSubir() {
    if (!desenhando) return;
    desenhando = false;
    temTraco = true;
    aoTracar(true);
    exportar();
  }

  canvas.addEventListener("pointerdown", aoDescer);
  canvas.addEventListener("pointermove", aoMover);
  canvas.addEventListener("pointerup", aoSubir);
  canvas.addEventListener("pointercancel", aoSubir);
  const observador = typeof ResizeObserver === "function" ? new ResizeObserver(() => ajustar()) : null;
  observador?.observe(canvas);
  ajustar();

  return {
    limpar() {
      limparPixels();
      temTraco = false;
      copia = null;
      caixa = null;
      caixaPerdida = false;
      aoTracar(false);
      aoMudar(null);
    },
    async carregar(blob) {
      copia = await createImageBitmap(blob);
      ajustar();
      limparPixels();
      desenharCopia();
      temTraco = true;
      caixa = null;
      caixaPerdida = true;
    },
    vazio: () => !temTraco,
    limites() {
      if (!temTraco || !caixa || caixaPerdida) return null;
      return {
        x0: Math.max(0, caixa.x0), y0: Math.max(0, caixa.y0),
        x1: Math.min(canvas.width - 1, caixa.x1), y1: Math.min(canvas.height - 1, caixa.y1),
      };
    },
    destruir() {
      observador?.disconnect();
      canvas.removeEventListener("pointerdown", aoDescer);
      canvas.removeEventListener("pointermove", aoMover);
      canvas.removeEventListener("pointerup", aoSubir);
      canvas.removeEventListener("pointercancel", aoSubir);
    },
  };
}
