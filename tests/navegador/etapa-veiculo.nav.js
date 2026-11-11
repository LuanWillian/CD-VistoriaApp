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

teste("etapa 1: marca, modelo e cor capitalizados ao digitar; GWM em maiúsculas", async () => {
  const t = await montarEtapa(etapa);
  try {
    const campo = (id) => t.el.querySelector(`#${id}`);
    digitar(campo("marca"), "gwm");
    igual(campo("marca").value, "GWM");
    digitar(campo("modelo"), "haval h6");
    igual(campo("modelo").value, "Haval H6");
    digitar(campo("cor"), "prata");
    igual(campo("cor").value, "Prata");
    igual(t.editor.rascunho.dados.marca, "GWM");
    igual(t.editor.rascunho.dados.modelo, "Haval H6");
    igual(t.editor.rascunho.dados.cor, "Prata");
  } finally {
    await t.fim();
  }
});

teste("etapa 1: teclado do Android compondo não deixa o chassi passar de 6", async () => {
  const t = await montarEtapa(etapa);
  try {
    const chassi = t.el.querySelector("#chassi");
    // Enquanto o teclado compõe, o maxlength não é respeitado pelo navegador.
    digitar(chassi, "abc12", { isComposing: true });
    igual(chassi.value, "abc12", "até 6, não mexe no texto durante a composição");
    digitar(chassi, "abc1234", { isComposing: true });
    igual(chassi.value, "ABC123", "passou de 6: corta na hora");
    igual(t.el.querySelector("#chassi-contador").textContent, "6/6");
    igual(t.editor.rascunho.dados.chassi, "ABC123");
  } finally {
    await t.fim();
  }
});

teste("etapa 1: loja de destino é uma lista, vem primeiro e mostra erro se ficar sem escolha", async () => {
  const t = await montarEtapa(etapa);
  try {
    const loja = t.el.querySelector("#loja");
    igual(t.el.querySelector("select, input").id, "loja", "a loja deveria ser o primeiro campo");
    igual(loja.options[0].value, "");
    ok(loja.options.length > 5, "lista de lojas vazia");
    loja.dispatchEvent(new FocusEvent("blur"));
    igual(t.el.querySelector("#loja-erro").textContent, "Escolha a loja de destino");
    loja.value = "PG Prime Volvo Natal";
    loja.dispatchEvent(new Event("change", { bubbles: true }));
    igual(t.editor.rascunho.dados.loja, "PG Prime Volvo Natal");
    igual(t.el.querySelector("#loja-erro").textContent, "");
  } finally {
    await t.fim();
  }
});
