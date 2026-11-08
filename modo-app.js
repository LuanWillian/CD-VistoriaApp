// Detecção ÚNICA do aparelho e do "modo app" do CD Vistoria.
//
// Roda como <script> comum no <head> (antes da primeira pintura) e marca
// <html class="app-mode"> quando isAppMode() é verdadeiro. Todo CSS exclusivo
// do modo app usa essa classe: o navegador do computador nunca é afetado e
// nada "pisca". O dispositivo.js (módulo) reexporta estas mesmas funções;
// não repita a lógica em outro lugar.
//
//   isInstalledApp(): PWA aberto como app (display-mode standalone ou, no iOS,
//                     navigator.standalone).
//   isMobileDevice(): celular ou tablet, pelo aparelho e não pela largura da
//                     janela (desktop com janela estreita continua desktop).
//   isAppMode():      isInstalledApp() || isMobileDevice().
(function () {
  var MODOS_INSTALADO = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];

  // Lê o que o navegador oferece; separado para os testes passarem um ambiente falso.
  function ambienteDoNavegador() {
    var nav = globalThis.navigator || {};
    return {
      userAgent: nav.userAgent || "",
      platform: nav.platform || "",
      maxTouchPoints: nav.maxTouchPoints || 0,
      uaData: nav.userAgentData || null, // Client Hints: só Chromium (Chrome, Edge, Android)
      standaloneIOS: nav.standalone === true, // Safari no iPhone/iPad
      mm: function (q) {
        try { return Boolean(globalThis.matchMedia && globalThis.matchMedia(q).matches); } catch (e) { return false; }
      },
    };
  }

  //   tipo: "movel" (celular/tablet, inclui iPad que se apresenta como Mac) ou "computador"
  //   instalado: aberto como app instalado (standalone, fullscreen etc.)
  //   ios: iPhone/iPad/iPod (instalação só pelo "Adicionar à Tela de Início")
  function detectarDispositivo(amb) {
    amb = amb || ambienteDoNavegador();
    var ua = amb.userAgent;
    // iPadOS 13+ diz que é Mac; a diferença é ter tela de toque.
    var ipadComoMac = /Macintosh/i.test(ua) && amb.maxTouchPoints > 1;
    var ios = /iPhone|iPad|iPod/i.test(ua) || ipadComoMac;
    var plataformaCH = (amb.uaData && amb.uaData.platform) || "";

    var movel;
    if ((amb.uaData && amb.uaData.mobile === true) || /^(Android|iOS)$/i.test(plataformaCH)) {
      movel = true; // Client Hints (inclui tablet Android, que vem com mobile=false)
    } else if (ios || /Android|iPhone|iPad|iPod|Mobi|Tablet|Silk|Kindle|PlayBook|BlackBerry|Opera Mini|IEMobile/i.test(ua)) {
      movel = true; // Safari, Firefox e afins: pelo userAgent
    } else if (plataformaCH) {
      movel = false; // Client Hints dizem Windows/macOS/Linux/ChromeOS
    } else {
      // Último recurso: só toque, sem mouse ou trackpad em lugar nenhum (não usa largura).
      movel = amb.mm("(pointer: coarse)") && !amb.mm("(any-pointer: fine)");
    }

    var instalado = amb.standaloneIOS || MODOS_INSTALADO.some(function (m) { return amb.mm("(display-mode: " + m + ")"); });
    return { tipo: movel ? "movel" : "computador", instalado: instalado, ios: ios };
  }

  function isInstalledApp(amb) {
    amb = amb || ambienteDoNavegador();
    return amb.mm("(display-mode: standalone)") || amb.standaloneIOS;
  }
  function isMobileDevice(amb) {
    return detectarDispositivo(amb).tipo === "movel";
  }
  function isAppMode(amb) {
    amb = amb || ambienteDoNavegador();
    return isInstalledApp(amb) || isMobileDevice(amb);
  }

  function marcarModoApp(amb, raiz) {
    raiz = raiz || (globalThis.document && globalThis.document.documentElement);
    if (raiz && isAppMode(amb)) raiz.classList.add("app-mode");
  }

  globalThis.CDModo = {
    MODOS_INSTALADO: MODOS_INSTALADO,
    ambienteDoNavegador: ambienteDoNavegador,
    detectarDispositivo: detectarDispositivo,
    isInstalledApp: isInstalledApp,
    isMobileDevice: isMobileDevice,
    isAppMode: isAppMode,
    marcarModoApp: marcarModoApp,
  };

  try { marcarModoApp(); } catch (e) { /* sem DOM (testes) ou sem matchMedia: segue como navegador */ }
})();
