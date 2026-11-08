// Roda no <head>, antes da primeira pintura: marca <html class="app-mode"> quando
// o site está aberto como app instalado (PWA). Todo CSS exclusivo do app usa essa
// classe, então o navegador comum nunca é afetado e não há "piscada".
// Mesma regra de isInstalledApp() em dispositivo.js (aqui sem módulo, por ser síncrono).
(function () {
  try {
    var standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (standalone || window.navigator.standalone === true) document.documentElement.classList.add("app-mode");
  } catch (e) { /* sem matchMedia: segue como navegador */ }
})();
