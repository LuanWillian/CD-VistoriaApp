// Monta uma etapa da nova vistoria num palco de teste, com editor real sobre o banco de teste.
import * as storage from "../../storage.js";
import { novoRascunho } from "../../formatos.js";
import { criarEditor } from "../../rascunho.js";

export async function montarEtapa(modulo, { confirmar = async () => true, preparar } = {}) {
  await storage.apagarBanco();
  const rascunho = novoRascunho("u-teste", crypto.randomUUID(), new Date().toISOString());
  preparar?.(rascunho);
  const editor = criarEditor({ storage, rascunho });
  const avisos = [];
  const ctx = { storage, confirmar, avisar: (t, tipo) => avisos.push({ t, tipo }) };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const etapa = modulo.montar(el, editor, ctx);
  return {
    el, editor, ctx, avisos, etapa,
    fim() {
      etapa.desmontar?.();
      el.remove();
      return editor.descarregar();
    },
  };
}

export function digitar(input, valor, init = {}) {
  input.value = valor;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, ...init }));
}
