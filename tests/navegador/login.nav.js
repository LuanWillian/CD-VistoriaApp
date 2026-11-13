import { teste, igual, ok, esperar } from "./runner.js";
import * as login from "../../views/login.js";

async function montar() {
  const chamadas = [];
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  await login.montar(el, { auth: { entrar: async (e, s) => { chamadas.push([e, s]); throw new Error("E-mail ou senha incorretos."); } } });
  const enviar = async () => { el.querySelector('button[type="submit"]').click(); await esperar(30); };
  return { el, chamadas, enviar, fim: () => el.remove() };
}

teste("login: campos vazios ficam marcados e nada é enviado", async () => {
  const t = await montar();
  try {
    await t.enviar();
    igual(t.el.querySelector("#login-erro").textContent, "Informe o e-mail e a senha.");
    igual(t.el.querySelector("#login-email").getAttribute("aria-invalid"), "true");
    igual(t.el.querySelector("#login-senha").getAttribute("aria-invalid"), "true");
    igual(t.chamadas.length, 0);
  } finally {
    t.fim();
  }
});

teste("login: e-mail sem formato de e-mail não vai ao servidor", async () => {
  const t = await montar();
  try {
    t.el.querySelector("#login-email").value = "abc";
    t.el.querySelector("#login-senha").value = "x";
    await t.enviar();
    igual(t.el.querySelector("#login-erro").textContent, "Informe um e-mail válido, como nome@empresa.com.br.");
    igual(t.el.querySelector("#login-email").getAttribute("aria-invalid"), "true");
    igual(t.el.querySelector("#login-senha").hasAttribute("aria-invalid"), false);
    igual(t.chamadas.length, 0);
    t.el.querySelector("#login-email").value = "luan@pgprime.com.br";
    await t.enviar();
    igual(t.chamadas.length, 1, "com e-mail válido a tentativa vai ao servidor");
    igual(t.el.querySelector("#login-email").hasAttribute("aria-invalid"), false);
  } finally {
    t.fim();
  }
});
