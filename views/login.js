// Tela "Entrar" (e-mail e senha). Não há cadastro público: o administrador
// cria os usuários no painel do Supabase. Depois do login, o app.js troca de tela.
import { $, icone } from "../ui.js";

export async function montar(el, ctx) {
  el.innerHTML = `
    <section class="login" aria-labelledby="login-titulo">
      <p class="login-marca">${icone("prancheta")} Vistoria Veicular</p>
      <h1 class="titulo" id="login-titulo">Entrar</h1>
      <p class="texto-2">Seu acesso é criado pelo administrador.</p>
      <form novalidate>
        <div class="campo">
          <label class="rotulo" for="login-email">E-mail</label>
          <input class="entrada" id="login-email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required>
        </div>
        <div class="campo">
          <label class="rotulo" for="login-senha">Senha</label>
          <input class="entrada" id="login-senha" type="password" autocomplete="current-password" required>
        </div>
        <p class="erro-form" id="login-erro" role="alert" tabindex="-1" hidden></p>
        <button class="btn btn-primario btn-bloco" type="submit">Entrar</button>
      </form>
    </section>`;

  const form = $("form", el);
  const erro = $("#login-erro", el);
  const botao = $('button[type="submit"]', el);
  const mostrarErro = (texto) => {
    erro.textContent = texto;
    erro.hidden = false;
    erro.focus();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#login-email", el).value.trim();
    const senha = $("#login-senha", el).value;
    if (!email || !senha) {
      mostrarErro("Informe o e-mail e a senha.");
      return;
    }
    erro.hidden = true;
    botao.disabled = true;
    botao.textContent = "Entrando…";
    try {
      await ctx.auth.entrar(email, senha);
    } catch (err) {
      mostrarErro(err.message);
      botao.disabled = false;
      botao.textContent = "Entrar";
    }
  });
  $("#login-email", el).focus();
  return {};
}
