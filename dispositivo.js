// Detecção única do tipo de aparelho e de como o app está aberto.
// Use daqui em todo o projeto (não repita a lógica em outros arquivos).
//
//   tipo: "movel"      → celular ou tablet (inclui iPad que se apresenta como Mac)
//         "computador" → navegador de computador
//   instalado: true quando aberto como app instalado (standalone etc.)
//   ios: iPhone/iPad/iPod (instalação só pelo "Adicionar à Tela de Início")
//
// A mesma informação vai para o <html> como data-dispositivo="movel|computador"
// e data-instalado="sim|nao", para o CSS poder usar junto das media queries.

const MODOS_INSTALADO = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];

// Lê o que o navegador oferece; separado para os testes passarem um ambiente falso.
export function ambienteDoNavegador() {
  const nav = globalThis.navigator ?? {};
  const mm = (q) => {
    try { return globalThis.matchMedia?.(q).matches ?? false; } catch { return false; }
  };
  return {
    userAgent: nav.userAgent ?? "",
    platform: nav.platform ?? "",
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    uaData: nav.userAgentData ?? null, // Client Hints: só Chromium (Chrome, Edge, Android)
    standaloneIOS: nav.standalone === true, // Safari no iPhone/iPad
    mm,
  };
}

export function detectarDispositivo(amb = ambienteDoNavegador()) {
  const ua = amb.userAgent;
  // iPadOS 13+ diz que é Mac; a diferença é ter tela de toque.
  const ipadComoMac = /Macintosh/i.test(ua) && amb.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/i.test(ua) || ipadComoMac;

  let movel;
  const plataformaCH = amb.uaData?.platform ?? "";
  if (amb.uaData?.mobile === true || /^(Android|iOS)$/i.test(plataformaCH)) {
    movel = true; // Client Hints: o jeito mais confiável onde existe
  } else if (ios || /Android|Mobi|Tablet|Silk|Kindle|PlayBook|BlackBerry|Opera Mini|IEMobile/i.test(ua)) {
    movel = true; // Safari, Firefox e afins: pelo userAgent
  } else if (plataformaCH) {
    movel = false; // Client Hints dizem Windows/macOS/Linux/ChromeOS
  } else {
    // Último recurso: só toque, sem mouse ou trackpad em lugar nenhum.
    movel = amb.mm("(pointer: coarse)") && !amb.mm("(any-pointer: fine)");
  }

  const instalado = amb.standaloneIOS || MODOS_INSTALADO.some((m) => amb.mm(`(display-mode: ${m})`));
  return { tipo: movel ? "movel" : "computador", instalado, ios };
}

// App instalado (PWA aberto pela tela inicial/janela própria). Controla tudo
// o que existe só no app, como o menu inicial (#/inicio).
export const isInstalledApp = (amb = ambienteDoNavegador()) =>
  amb.mm("(display-mode: standalone)") || amb.standaloneIOS;

// Computador usando pelo navegador (não instalado): é aí que o app esconde a
// faixa de instalação e a aba "Nova vistoria".
export const ehComputadorNoNavegador = (d = detectarDispositivo()) => d.tipo === "computador" && !d.instalado;

export function marcarDocumento(d = detectarDispositivo(), raiz = globalThis.document?.documentElement) {
  if (!raiz) return d;
  raiz.dataset.dispositivo = d.tipo;
  raiz.dataset.instalado = d.instalado ? "sim" : "nao";
  return d;
}

// Avisa quando algo muda sem recarregar (instalou o app, trocou o modo de
// exibição, ligou o modo celular do DevTools que emula o ponteiro de toque).
export function aoMudarDispositivo(cb) {
  const consultas = ["(pointer: coarse)", "(any-pointer: fine)", ...MODOS_INSTALADO.map((m) => `(display-mode: ${m})`)]
    .map((q) => globalThis.matchMedia?.(q))
    .filter(Boolean);
  const aviso = () => cb(marcarDocumento());
  consultas.forEach((m) => m.addEventListener?.("change", aviso));
  return () => consultas.forEach((m) => m.removeEventListener?.("change", aviso));
}
