import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarDispositivo, ehComputadorNoNavegador, marcarDocumento } from "../dispositivo.js";

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
  assert.equal(ehComputadorNoNavegador(d), true);
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
  assert.equal(ehComputadorNoNavegador(pc), false, "app instalado no computador não muda nada");
  assert.equal(detectarDispositivo(amb({ userAgent: UA.iphone, maxTouchPoints: 5, standaloneIOS: true })).instalado, true);
});

test("marcarDocumento escreve os atributos no <html>", () => {
  const raiz = { dataset: {} };
  marcarDocumento({ tipo: "computador", instalado: false, ios: false }, raiz);
  assert.deepEqual(raiz.dataset, { dispositivo: "computador", instalado: "nao" });
});
