// Quadro de assinatura com dedo, caneta ou mouse (Pointer Events).
// O canvas usa a densidade de pixels da tela para o traço não ficar borrado
// e devolve um PNG a cada traço concluído.

export function montarAssinatura(canvas, { aoMudar }) {
  const g = canvas.getContext("2d");
  let desenhando = false;
  let temTraco = false;
  let copia = null; // ImageBitmap do conteúdo atual, para redesenhar ao redimensionar
  let ultimo = null;

  canvas.classList.add("toque-livre");

  const estilo = () => {
    g.lineWidth = 2.5;
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
    canvas.toBlob((blob) => aoMudar(blob), "image/png");
  }

  function aoDescer(e) {
    if (e.button > 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* evento sintético */ }
    desenhando = true;
    ultimo = ponto(e);
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
    ultimo = p;
  }

  function aoSubir() {
    if (!desenhando) return;
    desenhando = false;
    temTraco = true;
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
      aoMudar(null);
    },
    async carregar(blob) {
      copia = await createImageBitmap(blob);
      ajustar();
      limparPixels();
      desenharCopia();
      temTraco = true;
    },
    vazio: () => !temTraco,
    destruir() {
      observador?.disconnect();
      canvas.removeEventListener("pointerdown", aoDescer);
      canvas.removeEventListener("pointermove", aoMover);
      canvas.removeEventListener("pointerup", aoSubir);
      canvas.removeEventListener("pointercancel", aoSubir);
    },
  };
}
