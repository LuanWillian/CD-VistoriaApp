// Detecção ÚNICA do aparelho e do "modo app" do CD Vistoria.
//
// Roda como <script> comum no <head> (antes da primeira pintura). O dispositivo.js
// (módulo) reexporta estas mesmas funções; não repita a lógica em outro lugar.
//
//   isInstalledApp():   PWA aberto como app (display-mode standalone ou, no iOS,
//                       navigator.standalone).
//   isMobileDevice():   celular ou tablet, pelo aparelho e não pela largura da
//                       janela (desktop com janela estreita continua desktop).
//   isDesktopBrowser(): navegador do computador = não é app instalado e não é
//                       celular/tablet. Só ele não tem "Iniciar vistoria".
//   isAppMode():        o contrário de isDesktopBrowser(). Marca <html class="app-mode">,
//                       usada só para o que é de toque: sem zoom (touch-action).
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
  function isDesktopBrowser(amb) {
    amb = amb || ambienteDoNavegador();
    return !isInstalledApp(amb) && !isMobileDevice(amb);
  }

  function marcarModoApp(amb, raiz) {
    raiz = raiz || (globalThis.document && globalThis.document.documentElement);
    if (raiz && isAppMode(amb)) raiz.classList.add("app-mode");
  }

  // Sem zoom por pinça nem duplo toque no modo app (celular, tablet e app instalado).
  // Camadas, porque cada navegador respeita uma: o viewport (Android/Chrome), os
  // eventos de gesto (Safari do iPhone, que ignora user-scalable=no) e, no CSS,
  // touch-action. No computador não faz nada.
  function bloquearZoom(amb, doc) {
    doc = doc || globalThis.document;
    if (!doc || !isAppMode(amb)) return false;
    var meta = doc.querySelector('meta[name="viewport"]');
    if (meta) {
      var partes = String(meta.content || "").split(",").map(function (p) { return p.trim(); })
        .filter(function (p) { return p && !/^(maximum-scale|minimum-scale|user-scalable)\s*=/i.test(p); });
      partes.push("maximum-scale=1", "user-scalable=no");
      meta.setAttribute("content", partes.join(", "));
    }
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (tipo) {
      doc.addEventListener(tipo, function (e) { e.preventDefault(); }, { passive: false });
    });
    return true;
  }

  globalThis.CDModo = {
    MODOS_INSTALADO: MODOS_INSTALADO,
    ambienteDoNavegador: ambienteDoNavegador,
    detectarDispositivo: detectarDispositivo,
    isInstalledApp: isInstalledApp,
    isMobileDevice: isMobileDevice,
    isAppMode: isAppMode,
    isDesktopBrowser: isDesktopBrowser,
    marcarModoApp: marcarModoApp,
    bloquearZoom: bloquearZoom,
  };

  try { marcarModoApp(); } catch (e) { /* sem DOM (testes) ou sem matchMedia: segue como navegador */ }
  try { bloquearZoom(); } catch (e) { /* idem */ }
})();
