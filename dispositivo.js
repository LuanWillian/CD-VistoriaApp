// Detecção única do tipo de aparelho e de como o app está aberto.
// Use daqui em todo o projeto (não repita a lógica em outros arquivos).
//
//   tipo: "movel"      → celular ou tablet (inclui iPad que se apresenta como Mac)
//         "computador" → navegador de computador
//   instalado: true quando aberto como app instalado (standalone etc.)
//   ios: iPhone/iPad/iPod (instalação só pelo "Adicionar à Tela de Início")

// A lógica fica em modo-app.js (script do <head>, roda antes da primeira
// pintura). Este módulo só reexporta, para o resto do app importar daqui.
import "./modo-app.js";

const M = globalThis.CDModo;
const MODOS_INSTALADO = M.MODOS_INSTALADO;
export const detectarDispositivo = (amb) => M.detectarDispositivo(amb);
export const isInstalledApp = (amb) => M.isInstalledApp(amb);
export const isMobileDevice = (amb) => M.isMobileDevice(amb);
// Navegador do computador (não instalado e não celular/tablet): sem "Iniciar
// vistoria", sem a rota #/nova e sem a faixa de instalação.
export const isDesktopBrowser = (amb) => M.isDesktopBrowser(amb);

// Avisa quando algo muda sem recarregar (instalou o app, trocou o modo de
// exibição, ligou o modo celular do DevTools que emula o ponteiro de toque).
export function aoMudarDispositivo(cb) {
  const consultas = ["(pointer: coarse)", "(any-pointer: fine)", ...MODOS_INSTALADO.map((m) => `(display-mode: ${m})`)]
    .map((q) => globalThis.matchMedia?.(q))
    .filter(Boolean);
  const aviso = () => cb(detectarDispositivo());
  consultas.forEach((m) => m.addEventListener?.("change", aviso));
  return () => consultas.forEach((m) => m.removeEventListener?.("change", aviso));
}
