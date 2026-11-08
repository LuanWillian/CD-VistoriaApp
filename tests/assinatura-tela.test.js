import { test } from "node:test";
import assert from "node:assert/strict";
import { voltarParaVertical } from "../assinatura-tela.js";

// Registra a ordem das chamadas à API de orientação e de tela cheia.
function falsos({ telaCheia = true, lockFalha = false } = {}) {
  const passos = [];
  const doc = {
    fullscreenElement: telaCheia ? {} : null,
    exitFullscreen: async () => { passos.push("sair-tela-cheia"); doc.fullscreenElement = null; },
  };
  const orientacao = {
    lock: async (o) => { passos.push(`travar:${o}`); if (lockFalha) throw new Error("NotSupported"); },
    unlock: () => passos.push("destravar"),
  };
  return { passos, doc, orientacao };
}

// A trava só dura enquanto a página está em tela cheia: sair dela devolve o
// controle ao sensor (era o que deixava a 1ª assinatura deitada).
test("ao terminar: trava em pé e continua em tela cheia (vale para as duas assinaturas)", async () => {
  const f = falsos();
  await voltarParaVertical({ entrouTelaCheia: true, orientacao: f.orientacao, doc: f.doc });
  assert.deepEqual(f.passos, ["travar:portrait-primary"]);
  assert.ok(f.doc.fullscreenElement, "não pode sair da tela cheia, senão a trava some");
});

test("2ª assinatura (já em tela cheia): mesmo resultado, em pé", async () => {
  const f = falsos();
  await voltarParaVertical({ entrouTelaCheia: false, orientacao: f.orientacao, doc: f.doc });
  assert.deepEqual(f.passos, ["travar:portrait-primary"]);
});

test("se travar em pé não for possível: destrava e sai da tela cheia que o app abriu", async () => {
  const f = falsos({ lockFalha: true });
  await voltarParaVertical({ entrouTelaCheia: true, orientacao: f.orientacao, doc: f.doc });
  assert.deepEqual(f.passos, ["travar:portrait-primary", "destravar", "sair-tela-cheia"]);
});

test("se travar falhar e a tela cheia não foi aberta pelo app, não sai dela", async () => {
  const f = falsos({ lockFalha: true });
  await voltarParaVertical({ entrouTelaCheia: false, orientacao: f.orientacao, doc: f.doc });
  assert.deepEqual(f.passos, ["travar:portrait-primary", "destravar"]);
});

// ---------- Trava horizontal da tela de assinatura (abrir → fechar) ----------
import { criarTravaHorizontal } from "../assinatura-tela.js";

function ambiente({ telaCheia = false, travaHorizontal = "responde" } = {}) {
  const passos = [];
  let rejeitarPendente = null;
  const doc = {
    fullscreenElement: telaCheia ? {} : null,
    documentElement: { requestFullscreen: async () => { passos.push("entrar-tela-cheia"); doc.fullscreenElement = {}; } },
    exitFullscreen: async () => { passos.push("sair-tela-cheia"); doc.fullscreenElement = null; },
  };
  const orientacao = {
    lock: (o) => {
      passos.push(`travar:${o}`);
      if (o === "landscape" && travaHorizontal === "nunca-responde") {
        // como no 1º uso no Android: a promessa fica pendente; uma nova trava a cancela
        return new Promise((_, rej) => { rejeitarPendente = rej; });
      }
      if (o === "landscape" && travaHorizontal === "falha") return Promise.reject(new Error("NotSupported"));
      if (rejeitarPendente) { rejeitarPendente(new DOMException("cancelada", "AbortError")); rejeitarPendente = null; }
      return Promise.resolve();
    },
    unlock: () => passos.push("destravar"),
  };
  return { passos, doc, orientacao };
}
const esvaziar = () => new Promise((r) => setTimeout(r, 0));

test("1ª assinatura: fechar antes da trava horizontal responder ainda deixa em pé", async () => {
  const a = ambiente({ travaHorizontal: "nunca-responde" });
  const trava = criarTravaHorizontal({ orientacao: a.orientacao, doc: a.doc, telaDeToque: true });
  trava.iniciar();
  await esvaziar();
  await trava.terminar();
  await esvaziar();
  assert.deepEqual(a.passos, ["entrar-tela-cheia", "travar:landscape", "travar:portrait-primary"]);
  assert.ok(a.doc.fullscreenElement, "continua em tela cheia para a trava em pé valer");
});

test("2ª assinatura (já em tela cheia e deitada): também termina em pé", async () => {
  const a = ambiente({ telaCheia: true });
  const trava = criarTravaHorizontal({ orientacao: a.orientacao, doc: a.doc, telaDeToque: true });
  trava.iniciar();
  await esvaziar();
  await trava.terminar();
  assert.deepEqual(a.passos, ["travar:landscape", "travar:portrait-primary"]);
});

test("trava horizontal recusada com a tela aberta: sai da tela cheia que abriu", async () => {
  const a = ambiente({ travaHorizontal: "falha" });
  const trava = criarTravaHorizontal({ orientacao: a.orientacao, doc: a.doc, telaDeToque: true });
  trava.iniciar();
  await esvaziar();
  assert.deepEqual(a.passos, ["entrar-tela-cheia", "travar:landscape", "sair-tela-cheia"]);
});

test("computador (sem tela de toque): não mexe em tela cheia nem orientação", async () => {
  const a = ambiente();
  const trava = criarTravaHorizontal({ orientacao: a.orientacao, doc: a.doc, telaDeToque: false });
  trava.iniciar();
  await trava.terminar();
  assert.deepEqual(a.passos, []);
});
