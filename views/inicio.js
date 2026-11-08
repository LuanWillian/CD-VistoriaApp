// Tela "Menu" (#/inicio): página principal SOMENTE no app instalado (PWA).
// No navegador esta rota não existe (app.js redireciona para a tela inicial).
// Os dois ícones (SVG + quadrado preto/cinza de 120 px) vêm da tela de
// referência em ../vistoria/index.html e NÃO devem ser alterados.

// Decide, ao abrir o app instalado, se ele começa no menu.
// O manifest abre em "#/nova" (start_url), então "#/nova" sem parâmetros numa
// abertura nova ("navigate") conta como "abrir o app". Recarregar ("reload") ou
// voltar ("back_forward") mantém a tela; hash vazio ou "#/" sempre vai ao menu.
export function deveAbrirNoMenu(hash, tipoNavegacao) {
  const h = hash || "";
  if (h === "" || h === "#" || h === "#/") return true;
  return h === "#/nova" && tipoNavegacao === "navigate";
}

const ICONE_INICIAR = `
    <div class="card-icon icon-black" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <!-- carro sólido + selo "nova" -->
        <g transform="translate(-4 4)">
        <path d="M14 28l4.2-9.5A5 5 0 0 1 22.8 15.5h18.4a5 5 0 0 1 4.6 3L50 28a5 5 0 0 1 4 4.9V44a2 2 0 0 1-2 2h-2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4H24v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4h-2a2 2 0 0 1-2-2V32.9A5 5 0 0 1 14 28z" fill="#fff"/>
        <path d="M19 28l3.2-7.3a2 2 0 0 1 1.8-1.2h16a2 2 0 0 1 1.8 1.2L45 28z" fill="#111"/>
        <circle cx="20" cy="36" r="3" fill="#111"/>
        <circle cx="44" cy="36" r="3" fill="#111"/>
        <rect x="27" y="35" width="10" height="2.5" rx="1.25" fill="#111"/>
        </g>
        <circle cx="50" cy="16" r="11" fill="#9A9A9A" stroke="#111" stroke-width="3"/>
        <path d="M50 10.5v11M44.5 16h11" stroke="#111" stroke-width="3" stroke-linecap="round"/>
      </svg>
    </div>`;

const ICONE_VISTORIAS = `
    <div class="card-icon icon-gray" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <!-- carro sólido + selo "histórico" -->
        <g transform="translate(-4 4)">
        <path d="M14 28l4.2-9.5A5 5 0 0 1 22.8 15.5h18.4a5 5 0 0 1 4.6 3L50 28a5 5 0 0 1 4 4.9V44a2 2 0 0 1-2 2h-2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4H24v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4h-2a2 2 0 0 1-2-2V32.9A5 5 0 0 1 14 28z" fill="#fff"/>
        <path d="M19 28l3.2-7.3a2 2 0 0 1 1.8-1.2h16a2 2 0 0 1 1.8 1.2L45 28z" fill="#555"/>
        <circle cx="20" cy="36" r="3" fill="#555"/>
        <circle cx="44" cy="36" r="3" fill="#555"/>
        <rect x="27" y="35" width="10" height="2.5" rx="1.25" fill="#555"/>
        </g>
        <circle cx="50" cy="16" r="11" fill="#D0D0D0" stroke="#555" stroke-width="3"/>
        <path d="M50 10.5V16l3.5 3" fill="none" stroke="#555" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>`;

export function montar(el, ctx) {
  el.innerHTML = `
    <section class="home-app" aria-labelledby="home-titulo">
      <h1 class="sr-only" id="home-titulo">Menu</h1>
      <button class="cartao card" id="btn-iniciar" type="button">
        <div class="card-text">
          <h2>Iniciar vistoria</h2>
          <p class="sub-dark">Registrar vistoria de saída</p>
        </div>${ICONE_INICIAR}
      </button>
      <button class="cartao card" id="btn-vistorias" type="button">${ICONE_VISTORIAS}
        <div class="card-text">
          <h2>Vistorias</h2>
          <p class="sub-gray">Ver todas vistorias feitas</p>
        </div>
      </button>
    </section>`;

  el.querySelector("#btn-iniciar").addEventListener("click", () => ctx.navegar("#/nova"));
  el.querySelector("#btn-vistorias").addEventListener("click", () => ctx.navegar("#/vistorias"));
  return {};
}
