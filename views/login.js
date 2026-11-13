// Tela "Entrar" (e-mail e senha). Não há cadastro público: o administrador
// cria os usuários no painel do Supabase. Depois do login, o app.js troca de tela.
import { $ } from "../ui.js";

export async function montar(el, ctx) {
  el.innerHTML = `
    <section class="login" aria-labelledby="login-titulo">
      <p class="login-marca"><img src="icons/logo-192.png" alt="" width="56" height="56"> CD Vistoria</p>
      <h1 class="titulo" id="login-titulo">Entrar</h1>
      <p class="texto-2">Seu acesso é criado pelo administrador.</p>
      <form novalidate>
        <div class="campo">
          <label class="rotulo" for="login-email">E-mail</label>
          <input class="entrada" id="login-email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required aria-describedby="login-erro">
        </div>
        <div class="campo">
          <label class="rotulo" for="login-senha">Senha</label>
          <input class="entrada" id="login-senha" type="password" autocomplete="current-password" required aria-describedby="login-erro">
        </div>
        <p class="erro-form" id="login-erro" role="alert" tabindex="-1" hidden></p>
        <button class="btn btn-primario btn-bloco" type="submit">Entrar</button>
      </form>
    </section>`;

  const form = $("form", el);
  const erro = $("#login-erro", el);
  const botao = $('button[type="submit"]', el);
  const campoEmail = $("#login-email", el);
  const campoSenha = $("#login-senha", el);
  const mostrarErro = (texto) => {
    erro.textContent = texto;
    erro.hidden = false;
    erro.focus();
  };
  // Borda vermelha (aria-invalid) só no campo com problema.
  const marcar = (campo, invalido) => {
    if (invalido) campo.setAttribute("aria-invalid", "true");
    else campo.removeAttribute("aria-invalid");
  };
  const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = campoEmail.value.trim();
    const senha = campoSenha.value;
    marcar(campoEmail, !email);
    marcar(campoSenha, !senha);
    if (!email || !senha) {
      mostrarErro("Informe o e-mail e a senha.");
      return;
    }
    if (!EMAIL_VALIDO.test(email)) {
      marcar(campoEmail, true);
      mostrarErro("Informe um e-mail válido, como nome@empresa.com.br.");
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
  campoEmail.focus();
  return {};
}
