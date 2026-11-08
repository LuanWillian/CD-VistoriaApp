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

// A lógica fica em modo-app.js (script do <head>, roda antes da primeira
// pintura). Este módulo só reexporta, para o resto do app importar daqui.
import "./modo-app.js";

const M = globalThis.CDModo;
const MODOS_INSTALADO = M.MODOS_INSTALADO;
export const ambienteDoNavegador = M.ambienteDoNavegador;
export const detectarDispositivo = (amb) => M.detectarDispositivo(amb);
export const isInstalledApp = (amb) => M.isInstalledApp(amb);
export const isMobileDevice = (amb) => M.isMobileDevice(amb);
export const isAppMode = (amb) => M.isAppMode(amb);

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
