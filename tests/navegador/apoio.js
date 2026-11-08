// Monta uma etapa da nova vistoria num palco de teste, com editor real sobre o banco de teste.
import * as storage from "../../storage.js";
import { novoRascunho } from "../../formatos.js";
import { criarEditor } from "../../rascunho.js";

export async function montarEtapa(modulo, { confirmar = async () => true, preparar, antes } = {}) {
  await storage.apagarBanco();
  await antes?.(storage);
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

// Troca o seletor de arquivos por uma foto gerada (a câmera não abre em teste automático).
export function simularCamera() {
  const original = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type !== "file") return original.call(this);
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    c.getContext("2d").fillRect(0, 0, 400, 300);
    c.toBlob((b) => {
      const dt = new DataTransfer();
      dt.items.add(new File([b], "foto.jpg", { type: "image/jpeg" }));
      this.files = dt.files;
      this.dispatchEvent(new Event("change"));
    }, "image/jpeg");
  };
  return () => { HTMLInputElement.prototype.click = original; };
}
