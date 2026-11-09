// Tela "Menu" (#/inicio): página principal em todos os ambientes. No app instalado
// e no navegador de celular/tablet tem os dois cartões; no navegador do computador
// (ctx.desktop) só o cartão "Vistorias": o "Iniciar vistoria" nem é desenhado.
// Os dois ícones (SVG + quadrado preto/cinza de 120 px) vêm da tela de
// referência em ../vistoria/index.html e NÃO devem ser alterados.

// Decide, ao abrir o site, se começa no menu. Abrir pelo link ou pelo
// ícone (abertura nova, "navigate") sem hash, com "#/" ou com "#/nova" sem
// parâmetros sempre vai ao menu — "#/nova" é o start_url do manifest e o
// endereço que ficava no link. Recarregar ("reload") ou voltar ("back_forward")
// mantém a tela; "#/nova?rascunho=…", "#/vistorias" e afins são respeitados.
export function deveAbrirNoMenu(hash, tipoNavegacao) {
  const h = hash || "";
  if (h === "" || h === "#" || h === "#/") return true;
  return h === "#/nova" && tipoNavegacao === "navigate";
}

// Computador: não existe iniciar vistoria, então #/nova (e qualquer subrota) vai
// para o menu. Devolve o hash de destino, ou null se a rota pode ficar como está.
export function redirecionamento(hash, desktop) {
  return desktop && /^#\/nova([/?]|$)/.test(hash || "") ? "#/inicio" : null;
}

// Histórico no app e no celular: o menu é sempre o nível 0 (primeira entrada),
// e cada tela aberta a partir dele fica um nível acima. Assim o "voltar" do
// Android chega ao menu e, do menu, sai do app. Entradas que já têm nível
// (voltar, avançar, recarregar) mantêm o seu.
export function nivelDaTela(estado, nome, nivelAnterior) {
  if (Number.isInteger(estado?.nivel)) return estado.nivel;
  return nome === "inicio" ? 0 : nivelAnterior + 1;
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
      <h1 class="sr-only" id="home-titulo">Menu</h1>${ctx.desktop ? "" : `
      <button class="cartao card" id="btn-iniciar" type="button">
        <div class="card-text">
          <h2>Iniciar vistoria</h2>
          <p class="sub-dark">Registrar vistoria de saída</p>
        </div>${ICONE_INICIAR}
      </button>`}
      <button class="cartao card" id="btn-vistorias" type="button">${ICONE_VISTORIAS}
        <div class="card-text">
          <h2>Vistorias</h2>
          <p class="sub-gray">Ver todas vistorias feitas</p>
        </div>
      </button>
    </section>`;

  el.querySelector("#btn-iniciar")?.addEventListener("click", () => ctx.navegar("#/nova"));
  el.querySelector("#btn-vistorias").addEventListener("click", () => ctx.navegar("#/vistorias"));
  return {};
}
