import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarDispositivo, isDesktopBrowser } from "../dispositivo.js";

const UA = {
  chromeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipadComoMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  androidCelular: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0",
};

// Ambiente falso: `consultas` são as media queries que devem dar verdadeiro.
const amb = ({ userAgent = "", maxTouchPoints = 0, uaData = null, standaloneIOS = false, consultas = [] } = {}) => ({
  userAgent, platform: "", maxTouchPoints, uaData, standaloneIOS, mm: (q) => consultas.includes(q),
});
const MOUSE = ["(pointer: fine)", "(any-pointer: fine)", "(display-mode: browser)"];
const TOQUE = ["(pointer: coarse)", "(display-mode: browser)"];

test("Chrome no Windows (Client Hints) é computador no navegador", () => {
  const d = detectarDispositivo(amb({ userAgent: UA.chromeWindows, uaData: { mobile: false, platform: "Windows" }, consultas: MOUSE }));
  assert.deepEqual(d, { tipo: "computador", instalado: false, ios: false });
});

test("Safari no Mac e Firefox no Linux (sem Client Hints) são computador", () => {
  assert.equal(detectarDispositivo(amb({ userAgent: UA.safariMac, consultas: MOUSE })).tipo, "computador");
  assert.equal(detectarDispositivo(amb({ userAgent: UA.firefoxLinux, consultas: MOUSE })).tipo, "computador");
});

test("iPhone é móvel e iOS", () => {
  assert.deepEqual(detectarDispositivo(amb({ userAgent: UA.iphone, maxTouchPoints: 5, consultas: TOQUE })),
    { tipo: "movel", instalado: false, ios: true });
});

test("iPad que se apresenta como Mac é móvel e iOS (tem toque)", () => {
  const d = detectarDispositivo(amb({ userAgent: UA.ipadComoMac, maxTouchPoints: 5, consultas: TOQUE }));
  assert.equal(d.tipo, "movel");
  assert.equal(d.ios, true);
});

test("Mac de verdade (sem toque) continua computador", () => {
  assert.equal(detectarDispositivo(amb({ userAgent: UA.safariMac, maxTouchPoints: 0, consultas: MOUSE })).tipo, "computador");
});

test("Android: celular e tablet são móveis (tablet tem mobile=false nos Client Hints)", () => {
  assert.equal(detectarDispositivo(amb({ userAgent: UA.androidCelular, uaData: { mobile: true, platform: "Android" } })).tipo, "movel");
  assert.equal(detectarDispositivo(amb({ userAgent: UA.androidTablet, uaData: { mobile: false, platform: "Android" } })).tipo, "movel");
  assert.equal(detectarDispositivo(amb({ userAgent: UA.firefoxAndroid })).tipo, "movel");
});

test("notebook com tela de toque e mouse continua computador", () => {
  const d = detectarDispositivo(amb({ userAgent: UA.chromeWindows, maxTouchPoints: 10,
    uaData: { mobile: false, platform: "Windows" }, consultas: [...MOUSE, "(any-pointer: coarse)"] }));
  assert.equal(d.tipo, "computador");
});

test("sem pistas no userAgent: decide pelo ponteiro", () => {
  assert.equal(detectarDispositivo(amb({ consultas: TOQUE })).tipo, "movel");
  assert.equal(detectarDispositivo(amb({ consultas: MOUSE })).tipo, "computador");
});

test("app instalado: standalone no Chrome ou navigator.standalone no iPhone", () => {
  const pc = detectarDispositivo(amb({ userAgent: UA.chromeWindows, uaData: { mobile: false, platform: "Windows" },
    consultas: ["(pointer: fine)", "(any-pointer: fine)", "(display-mode: standalone)"] }));
  assert.equal(pc.instalado, true);
  assert.equal(detectarDispositivo(amb({ userAgent: UA.iphone, maxTouchPoints: 5, standaloneIOS: true })).instalado, true);
});

test("isDesktopBrowser: só o navegador do computador (não instalado e não celular/tablet)", () => {
  const pc = { userAgent: UA.chromeWindows, uaData: { mobile: false, platform: "Windows" } };
  assert.equal(isDesktopBrowser(amb({ ...pc, consultas: MOUSE })), true, "Chrome no Windows");
  assert.equal(isDesktopBrowser(amb({ userAgent: UA.safariMac, consultas: MOUSE })), true, "Safari no Mac");
  assert.equal(isDesktopBrowser(amb({ ...pc, consultas: ["(display-mode: standalone)"] })), false, "app instalado no computador");
  assert.equal(isDesktopBrowser(amb({ userAgent: UA.iphone, maxTouchPoints: 5 })), false, "navegador do iPhone");
  assert.equal(isDesktopBrowser(amb({ userAgent: UA.ipadComoMac, maxTouchPoints: 5 })), false, "iPad que se diz Mac");
  assert.equal(isDesktopBrowser(amb({ userAgent: UA.androidTablet, uaData: { mobile: false, platform: "Android" } })), false, "tablet Android");
  assert.equal(isDesktopBrowser(amb({ userAgent: UA.iphone, maxTouchPoints: 5, standaloneIOS: true })), false, "iPhone instalado");
});

test("isInstalledApp: standalone ou navigator.standalone (iOS); nada mais", async () => {
  const { isInstalledApp } = await import("../dispositivo.js");
  assert.equal(isInstalledApp(amb({ consultas: ["(display-mode: standalone)"] })), true);
  assert.equal(isInstalledApp(amb({ standaloneIOS: true })), true);
  assert.equal(isInstalledApp(amb({ consultas: ["(display-mode: browser)"] })), false);
});

test("isMobileDevice: celular/tablet (inclui iPad como Mac); computador não", async () => {
  const { isMobileDevice } = await import("../dispositivo.js");
  assert.equal(isMobileDevice(amb({ userAgent: UA.iphone, maxTouchPoints: 5 })), true);
  assert.equal(isMobileDevice(amb({ userAgent: UA.ipadComoMac, maxTouchPoints: 5 })), true);
  assert.equal(isMobileDevice(amb({ userAgent: UA.androidTablet, uaData: { mobile: false, platform: "Android" } })), true);
  assert.equal(isMobileDevice(amb({ userAgent: UA.androidCelular, uaData: { mobile: true, platform: "Android" } })), true);
  assert.equal(isMobileDevice(amb({ userAgent: UA.chromeWindows, uaData: { mobile: false, platform: "Windows" }, consultas: MOUSE })), false);
  assert.equal(isMobileDevice(amb({ userAgent: UA.safariMac, consultas: MOUSE })), false);
});

test("isAppMode: app instalado OU celular/tablet; computador no navegador não", async () => {
  await import("../modo-app.js");
  const { isAppMode } = globalThis.CDModo;
  assert.equal(isAppMode(amb({ userAgent: UA.iphone, maxTouchPoints: 5 })), true, "navegador do celular");
  assert.equal(isAppMode(amb({ userAgent: UA.chromeWindows, uaData: { mobile: false, platform: "Windows" },
    consultas: ["(display-mode: standalone)"] })), true, "app instalado no computador");
  assert.equal(isAppMode(amb({ userAgent: UA.chromeWindows, uaData: { mobile: false, platform: "Windows" }, consultas: MOUSE })), false);
});

test("modo-app.js marca <html class=\"app-mode\"> só no modo app", async () => {
  await import("../modo-app.js");
  const { marcarModoApp } = globalThis.CDModo;
  const raiz = () => { const c = new Set(); return { classList: { add: (x) => c.add(x), contains: (x) => c.has(x) } }; };
  const celular = raiz();
  marcarModoApp(amb({ userAgent: UA.iphone, maxTouchPoints: 5 }), celular);
  assert.equal(celular.classList.contains("app-mode"), true);
  const pc = raiz();
  marcarModoApp(amb({ userAgent: UA.chromeWindows, uaData: { mobile: false, platform: "Windows" }, consultas: MOUSE }), pc);
  assert.equal(pc.classList.contains("app-mode"), false);
});

function docFalso() {
  const meta = { content: "width=device-width, initial-scale=1, viewport-fit=cover", setAttribute(n, v) { if (n === "content") this.content = v; } };
  const ouvintes = [];
  return {
    meta, ouvintes,
    querySelector: (q) => (q === 'meta[name="viewport"]' ? meta : null),
    addEventListener: (tipo, fn, op) => ouvintes.push({ tipo, fn, op }),
  };
}

test("bloquear zoom: no celular/app trava o viewport e os gestos de pinça", async () => {
  await import("../modo-app.js");
  const d = docFalso();
  const r = globalThis.CDModo.bloquearZoom(amb({ userAgent: UA.iphone, maxTouchPoints: 5 }), d);
  assert.equal(r, true);
  assert.match(d.meta.content, /maximum-scale=1/);
  assert.match(d.meta.content, /user-scalable=no/);
  assert.match(d.meta.content, /viewport-fit=cover/, "mantém o que já existia");
  const tipos = d.ouvintes.map((o) => o.tipo);
  for (const t of ["gesturestart", "gesturechange", "gestureend"]) assert.ok(tipos.includes(t), `faltou ouvir ${t}`);
  let impediu = false;
  d.ouvintes.find((o) => o.tipo === "gesturestart").fn({ preventDefault: () => { impediu = true; } });
  assert.equal(impediu, true);
  assert.equal(d.ouvintes.find((o) => o.tipo === "gesturestart").op.passive, false, "precisa ser não passivo para poder impedir");
});

test("bloquear zoom: no computador não mexe em nada", async () => {
  await import("../modo-app.js");
  const d = docFalso();
  const antes = d.meta.content;
  const r = globalThis.CDModo.bloquearZoom(amb({ userAgent: UA.chromeWindows, uaData: { mobile: false, platform: "Windows" }, consultas: MOUSE }), d);
  assert.equal(r, false);
  assert.equal(d.meta.content, antes);
  assert.equal(d.ouvintes.length, 0);
});
