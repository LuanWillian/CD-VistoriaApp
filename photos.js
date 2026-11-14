// Fotos: captura pela câmera (input de arquivo), compressão, miniatura e
// visualizador em tela cheia.
import { FOTO } from "./config.js";
import { esc, icone } from "./ui.js";

export const MENSAGEM_CAMERA_NEGADA = "A câmera está bloqueada para este app. Libere em Configurações do navegador → Permissões → Câmera. Você ainda pode escolher uma foto da galeria.";
const ERRO_LEITURA = "Não foi possível ler esta foto. Tente tirar outra.";

// Abre a câmera traseira (no desktop, o seletor de arquivos). Resolve null se cancelar.
// IMPORTANTE (iPhone): chame esta função DIRETO no toque do usuário, sem nenhum
// `await` antes. O Safari do iOS só abre a câmera se o input for acionado no mesmo
// instante do toque; qualquer espera antes (ex.: consultar a permissão) faz ele
// ignorar o clique sem avisar.
export function escolherFoto({ camera = true } = {}) {
  return new Promise((resolver) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (camera) input.setAttribute("capture", "environment");
    // Fora da tela, mas existente (sr-only): o Safari antigo ignora o clique em input com display:none.
    input.className = "sr-only";
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    let feito = false;
    const fim = (arquivo) => {
      if (feito) return;
      feito = true;
      input.remove();
      resolver(arquivo);
    };
    input.addEventListener("change", () => fim(input.files?.[0] || null));
    input.addEventListener("cancel", () => fim(null));
    document.body.append(input);
    input.click();
  });
}

// Decodifica respeitando a orientação EXIF; cai para <img> se o navegador
// não aceitar as opções do createImageBitmap.
async function decodificar(arquivo) {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch { /* tenta sem opções */ }
  try {
    return await createImageBitmap(arquivo);
  } catch { /* tenta com <img> */ }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error(ERRO_LEITURA);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function comprimir(arquivo, { maxLado = FOTO.maxLado, qualidade = FOTO.qualidade } = {}) {
  const imagem = await decodificar(arquivo);
  const largura = imagem.naturalWidth || imagem.width;
  const altura = imagem.naturalHeight || imagem.height;
  if (!largura || !altura) throw new Error(ERRO_LEITURA);
  const k = Math.min(1, maxLado / Math.max(largura, altura));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largura * k);
  canvas.height = Math.round(altura * k);
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingQuality = "high";
  g.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", qualidade));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error(ERRO_LEITURA);
  return blob;
}

export const gerarMiniatura = (blob) => comprimir(blob, { maxLado: FOTO.miniLado, qualidade: FOTO.qualidade });

export async function verificarCamera() {
  try {
    const estado = await navigator.permissions?.query({ name: "camera" });
    if (!estado) return "desconhecido";
    return estado.state === "denied" ? "negada" : "ok";
  } catch {
    return "desconhecido";
  }
}

// ---------- Visualizador em tela cheia ----------
// Tela larga com mouse: o visualizador vira um lightbox (fundo escuro, foto em até
// 90% da tela, fecha clicando fora). O mesmo critério do CSS do detalhe.
export const TELA_DE_COMPUTADOR = "(min-width: 1024px) and (pointer: fine)";
export const emDesktop = () => Boolean(globalThis.matchMedia?.(TELA_DE_COMPUTADOR).matches);

// opcoes.grande: modo lightbox; opcoes.origem: elemento que recebe o foco ao fechar.
export function abrirVisualizador(fotos, indice = 0, { grande = false, origem = null } = {}) {
  if (!fotos.length) return;
  let atual = Math.min(Math.max(indice, 0), fotos.length - 1);
  const d = document.createElement("dialog");
  d.className = "cheio visualizador";
  d.setAttribute("aria-label", "Foto em tela cheia");
  d.innerHTML = `
    <div class="cheio-topo">
      <h2 aria-live="polite"></h2>
      <button type="button" class="btn-topo" data-acao="fechar" aria-label="Fechar">${icone("x")}</button>
    </div>
    <div class="visualizador-palco">
      <img alt="" draggable="false">
      <button type="button" class="btn-topo visualizador-nav visualizador-ant" data-acao="-1" aria-label="Foto anterior">${icone("voltar", "ic ic-lg")}</button>
      <button type="button" class="btn-topo visualizador-nav visualizador-prox" data-acao="1" aria-label="Próxima foto">${icone("avancar", "ic ic-lg")}</button>
    </div>
    <div class="visualizador-rodape">
      <p class="visualizador-dica">Use dois dedos ou toque duas vezes para aproximar</p>
      <div class="visualizador-pontos" aria-hidden="true"></div>
    </div>`;
  const titulo = d.querySelector("h2");
  const img = d.querySelector("img");
  const pontos = d.querySelector(".visualizador-pontos");
  const navs = d.querySelectorAll('[data-acao="-1"], [data-acao="1"]');
  let tirarZoom = () => {};
  const mostrar = () => {
    const f = fotos[atual];
    tirarZoom();
    img.src = f.src;
    img.alt = f.legenda;
    titulo.textContent = fotos.length > 1 ? `${f.legenda} · ${atual + 1} de ${fotos.length}` : f.legenda;
    navs.forEach((b) => { b.hidden = fotos.length < 2; });
    pontos.hidden = fotos.length < 2;
    pontos.innerHTML = fotos.map((_, i) => `<span${i === atual ? ' class="atual"' : ""}></span>`).join("");
  };
  const ir = (passo) => {
    if (fotos.length < 2) return;
    atual = (atual + passo + fotos.length) % fotos.length;
    globalThis.getSelection?.()?.removeAllRanges(); // nenhuma seleção sobra da troca
    mostrar();
  };
  d.addEventListener("click", (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "fechar") d.close();
    else if (acao) ir(Number(acao));
    else if (moveu) moveu = false; // fim de um arraste ou pinça, não um clique
    else if (grande && z.escala === 1 && (e.target === d || e.target.matches(".visualizador-palco, .cheio-topo"))) d.close(); // clicou fora da foto
  });
  d.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") ir(-1);
    if (e.key === "ArrowRight") ir(1);
  });
  // ---------- Zoom: pinça com dois dedos, arrastar a foto ampliada, toque duplo ----------
  // Sem zoom, arrastar para o lado troca de foto. O palco tem touch-action: none, então
  // o navegador não interfere: todos os gestos são tratados aqui (Pointer Events).
  const palco = d.querySelector(".visualizador-palco");
  const MAX = 4;
  const z = { escala: 1, x: 0, y: 0 };
  const ponteiros = new Map();
  let gesto = null;
  let moveu = false;
  let ultimoToque = { t: 0, x: 0, y: 0 };
  const centroDoPalco = () => {
    const r = palco.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  };
  const aplicar = (animar = false) => {
    img.classList.toggle("animando", animar);
    img.style.transform = z.escala === 1 ? "" : `translate(${z.x}px, ${z.y}px) scale(${z.escala})`;
  };
  const limitar = () => {
    z.escala = Math.min(Math.max(z.escala, 1), MAX);
    if (z.escala === 1) { z.x = 0; z.y = 0; return; }
    const { w, h } = centroDoPalco();
    const mx = (w * (z.escala - 1)) / 2;
    const my = (h * (z.escala - 1)) / 2;
    z.x = Math.min(Math.max(z.x, -mx), mx);
    z.y = Math.min(Math.max(z.y, -my), my);
  };
  // Muda a escala mantendo parado o ponto (px, py) da tela (relativo ao centro do palco).
  const escalarEm = (nova, px, py, base = z) => {
    const fator = nova / base.escala;
    z.x = px - (px - base.x) * fator;
    z.y = py - (py - base.y) * fator;
    z.escala = nova;
    limitar();
  };
  tirarZoom = (animar = false) => { z.escala = 1; z.x = 0; z.y = 0; aplicar(animar); };
  const doisDedos = () => {
    const [a, b] = [...ponteiros.values()];
    const { cx, cy } = centroDoPalco();
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), mx: (a.x + b.x) / 2 - cx, my: (a.y + b.y) / 2 - cy };
  };
  palco.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    try { palco.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteiros.size === 2) {
      gesto = { tipo: "pinca", ...doisDedos(), base: { ...z } };
    } else if (ponteiros.size === 1) {
      moveu = false;
      gesto = { tipo: "um", x0: e.clientX, y0: e.clientY, base: { ...z } };
    }
  });
  palco.addEventListener("pointermove", (e) => {
    if (!ponteiros.has(e.pointerId) || !gesto) return;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesto.tipo === "pinca" && ponteiros.size >= 2) {
      const agora = doisDedos();
      moveu = true;
      z.x = gesto.base.x + (agora.mx - gesto.mx);
      z.y = gesto.base.y + (agora.my - gesto.my);
      escalarEm(gesto.base.escala * (agora.dist / gesto.dist), agora.mx, agora.my, { ...z, escala: gesto.base.escala });
      aplicar();
    } else if (gesto.tipo === "um") {
      const dx = e.clientX - gesto.x0;
      const dy = e.clientY - gesto.y0;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moveu = true;
      if (z.escala > 1) {
        z.x = gesto.base.x + dx;
        z.y = gesto.base.y + dy;
        limitar();
        aplicar();
      }
    }
  });
  const soltar = (e) => {
    if (!ponteiros.has(e.pointerId)) return;
    ponteiros.delete(e.pointerId);
    if (gesto?.tipo === "pinca") {
      // Um dedo continua na tela: segue arrastando a partir daqui.
      if (ponteiros.size === 1) {
        const [p] = [...ponteiros.values()];
        gesto = { tipo: "um", x0: p.x, y0: p.y, base: { ...z }, depoisDaPinca: true };
      } else gesto = null;
      if (z.escala < 1.05) tirarZoom(true);
      return;
    }
    if (gesto?.tipo !== "um" || ponteiros.size) return;
    const dx = e.clientX - gesto.x0;
    if (z.escala === 1 && !gesto.depoisDaPinca && Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1);
    else if (!moveu) {
      // Toque duplo: aproxima no ponto tocado; outro toque duplo volta.
      const agora = Date.now();
      if (agora - ultimoToque.t < 320 && Math.hypot(e.clientX - ultimoToque.x, e.clientY - ultimoToque.y) < 30) {
        const { cx, cy } = centroDoPalco();
        if (z.escala > 1) tirarZoom(true);
        else { escalarEm(2.5, e.clientX - cx, e.clientY - cy); aplicar(true); }
        ultimoToque = { t: 0, x: 0, y: 0 };
      } else ultimoToque = { t: agora, x: e.clientX, y: e.clientY };
    }
    gesto = null;
  };
  palco.addEventListener("pointerup", soltar);
  palco.addEventListener("pointercancel", soltar);
  // Computador: rodinha do mouse aproxima e afasta no ponto do cursor.
  palco.addEventListener("wheel", (e) => {
    e.preventDefault();
    const { cx, cy } = centroDoPalco();
    escalarEm(z.escala * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX - cx, e.clientY - cy);
    aplicar();
  }, { passive: false });
  const rolagemAntes = document.documentElement.style.overflow;
  d.addEventListener("close", () => {
    d.remove();
    if (grande) {
      document.documentElement.style.overflow = rolagemAntes;
      origem?.focus?.();
    }
  });
  if (grande) {
    d.classList.add("visualizador-grande");
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    document.documentElement.style.overflow = "hidden"; // o fundo não rola
  }
  document.body.append(d);
  mostrar();
  d.showModal();
  // Foco no próprio diálogo: sem o anel azul em volta do X ao abrir no celular.
  d.tabIndex = -1;
  if (grande) d.querySelector('[data-acao="fechar"]').focus();
  else d.focus();
}

// HTML de uma miniatura que abre o visualizador (as telas ligam o clique).
export const miniaturaHtml = (src, legenda, extra = "") => `
  <div class="miniatura">
    <button type="button" data-ampliar="${esc(src)}" data-legenda="${esc(legenda)}" aria-label="Ampliar: ${esc(legenda)}">
      <img src="${esc(src)}" alt="${esc(legenda)}">
    </button>${extra}
  </div>`;

// Liga, dentro de `raiz`, o toque nas miniaturas [data-ampliar] ao visualizador.
// opcoes.grande: função chamada no momento do clique; se der true, abre o lightbox.
export function ligarAmpliar(raiz, { grande } = {}) {
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ampliar]");
    if (!b) return;
    const todos = [...raiz.querySelectorAll("[data-ampliar]")];
    abrirVisualizador(todos.map((x) => ({ src: x.dataset.ampliar, legenda: x.dataset.legenda })), todos.indexOf(b),
      { grande: Boolean(grande?.()), origem: b });
  });
}
