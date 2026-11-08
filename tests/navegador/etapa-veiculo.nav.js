import { teste, igual, ok } from "./runner.js";
import { montarEtapa, digitar } from "./apoio.js";
import * as etapa from "../../views/etapa-veiculo.js";

teste("etapa 1: chassi em maiúsculas, contador e erro ao sair do campo", async () => {
  const t = await montarEtapa(etapa);
  try {
    const chassi = t.el.querySelector("#chassi");
    digitar(chassi, "ab-12");
    igual(chassi.value, "AB12");
    igual(t.el.querySelector("#chassi-contador").textContent, "4/6");
    chassi.dispatchEvent(new FocusEvent("blur"));
    const erro = t.el.querySelector("#chassi-erro");
    igual(erro.textContent, "O chassi deve ter 6 caracteres (faltam 2)");
    ok(erro.getAttribute("aria-live"), "erro sem aria-live");
    igual(t.editor.rascunho.dados.chassi, "AB12");
  } finally {
    await t.fim();
  }
});

teste("etapa 1: digitação em composição (teclado Android) não é alterada no meio", async () => {
  const t = await montarEtapa(etapa);
  try {
    const chassi = t.el.querySelector("#chassi");
    digitar(chassi, "abc", { isComposing: true });
    igual(chassi.value, "abc");
    chassi.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "abc" }));
    igual(chassi.value, "ABC");
  } finally {
    await t.fim();
  }
});

teste("etapa 1: km com separador de milhar", async () => {
  const t = await montarEtapa(etapa);
  try {
    const km = t.el.querySelector("#km");
    digitar(km, "1234567");
    igual(km.value, "1.234.567");
    igual(t.editor.rascunho.dados.km, 1234567);
    igual(km.getAttribute("inputmode"), "numeric");
  } finally {
    await t.fim();
  }
});

teste("etapa 1: combustível em chips de escolha única", async () => {
  const t = await montarEtapa(etapa);
  try {
    const chips = [...t.el.querySelectorAll('#combustivel [role="radio"]')];
    igual(chips.map((c) => c.textContent.trim()), ["Gasolina", "Flex", "Diesel", "Elétrico", "Híbrido"]);
    chips[2].click();
    igual(chips.map((c) => c.getAttribute("aria-checked")), ["false", "false", "true", "false", "false"]);
    igual(t.editor.rascunho.dados.combustivel, "Diesel");
  } finally {
    await t.fim();
  }
});

teste("etapa 1: três slots de foto rotulados", async () => {
  const t = await montarEtapa(etapa);
  try {
    for (const [chave, rotulo] of [["frente", "Frente"], ["traseira", "Traseira"], ["chassi", "Chassi"]]) {
      const alvo = t.el.querySelector(`#foto-${chave}`);
      ok(alvo, `falta #foto-${chave}`);
      ok(alvo.closest(".foto-slot").textContent.includes(rotulo), `rótulo ${rotulo} ausente`);
    }
  } finally {
    await t.fim();
  }
});

teste("etapa 1: colar ' ab-12 3cd' no chassi vira AB123C (maxlength 6 não corta antes)", async () => {
  const t = await montarEtapa(etapa);
  try {
    const chassi = t.el.querySelector("#chassi");
    igual(chassi.getAttribute("maxlength"), "6");
    chassi.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", " ab-12 3cd");
    chassi.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    igual(chassi.value, "AB123C");
    igual(t.editor.rascunho.dados.chassi, "AB123C");
  } finally {
    await t.fim();
  }
});
