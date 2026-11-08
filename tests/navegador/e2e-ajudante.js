// Ajudante do teste ponta a ponta (rodado pelo painel do navegador no app real).
// Simula a câmera e as assinaturas e preenche uma vistoria inteira.
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function simularCamera() {
  if (HTMLInputElement.prototype.__cameraSimulada) return;
  const original = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type !== "file") return original.call(this);
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1200;
    const g = c.getContext("2d");
    g.fillStyle = `hsl(${Math.floor(Math.random() * 360)} 55% 45%)`;
    g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = "#fff";
    g.font = "bold 140px sans-serif";
    g.fillText("TESTE E2E", 380, 650);
    c.toBlob((b) => {
      const dt = new DataTransfer();
      dt.items.add(new File([b], "foto.jpg", { type: "image/jpeg" }));
      this.files = dt.files;
      this.dispatchEvent(new Event("change"));
    }, "image/jpeg", 0.9);
  };
  HTMLInputElement.prototype.__cameraSimulada = true;
}

const definir = (id, valor) => {
  const i = document.getElementById(id);
  i.value = valor;
  i.dispatchEvent(new InputEvent("input", { bubbles: true }));
};
const botao = (texto, raiz = document) => [...raiz.querySelectorAll("button")].find((b) => b.textContent.trim().includes(texto));

async function assinar(quem) {
  document.querySelector(`[data-assinar="${quem}"]`).click();
  await esperar(500);
  const tela = document.querySelector("dialog.assinar[open]");
  const canvas = tela.querySelector("canvas");
  const r = canvas.getBoundingClientRect();
  const ev = (t, x, y) => canvas.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 9, button: 0, buttons: 1, clientX: r.left + x, clientY: r.top + y }));
  ev("pointerdown", 30, 100);
  for (let i = 1; i < 12; i++) ev("pointermove", 30 + i * 22, 100 + Math.sin(i) * 40);
  ev("pointerup", 290, 90);
  await esperar(300);
  tela.querySelector('[data-acao="confirmar"]').click();
  await esperar(700);
}

// Começa em #/nova?novo=1 e termina no detalhe; devolve o id da vistoria.
export async function preencherEFinalizar({ chassi, marca, modelo, cor = "Prata", km = "45300", avaria = false }) {
  simularCamera();
  location.hash = "#/nova?novo=1";
  await esperar(1200);
  definir("chassi", chassi);
  definir("marca", marca);
  definir("modelo", modelo);
  definir("cor", cor);
  definir("km", km);
  document.querySelector('#combustivel [data-valor="Flex"]').click();
  for (const k of ["frente", "traseira", "chassi"]) {
    document.getElementById(`foto-${k}`).click();
    await esperar(1000);
  }
  document.getElementById("btn-avancar").click();
  await esperar(500);
  botao("Marcar todos como Ok").click();
  document.querySelector('#chk-0 [data-valor="ausente"]').click();
  document.getElementById("btn-avancar").click();
  await esperar(500);
  if (avaria) {
    botao("Adicionar avaria").click();
    await esperar(300);
    const d = document.querySelector("dialog.cheio[open]");
    for (const [sel, valor] of [["#avaria-area", "Capô"], ["#avaria-tipo", "Amassado"]]) {
      d.querySelector(sel).value = valor;
      d.querySelector(sel).dispatchEvent(new Event("change"));
    }
    d.querySelector('[data-valor="Grave"]').click();
    d.querySelector("#avaria-descricao").value = "Amassado no centro do capô";
    for (let i = 0; i < 2; i++) {
      botao("Adicionar foto", d).click();
      await esperar(1000);
    }
    botao("Salvar avaria", d).click();
    await esperar(600);
  } else {
    document.getElementById("sem-avarias").click();
    await esperar(300);
  }
  document.getElementById("btn-avancar").click();
  await esperar(600);
  if (!document.getElementById("vistoriador-nome").value) definir("vistoriador-nome", "Ana Lima");
  definir("motorista-nome", "Paulo Reis");
  await assinar("vistoriador");
  await assinar("motorista");
  document.getElementById("btn-avancar").click();
  await esperar(1500);
  return location.hash.split("/")[2]?.split("?")[0];
}
