// Mini executor de testes para módulos que precisam do navegador.
const testes = [];

export function teste(nome, fn) {
  testes.push({ nome, fn });
}

const texto = (v) => {
  try { return JSON.stringify(v); } catch { return String(v); }
};

function iguaisProfundo(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => iguaisProfundo(a[k], b[k]));
}

export function igual(atual, esperado, msg = "") {
  if (!iguaisProfundo(atual, esperado)) {
    throw new Error(`${msg ? msg + ": " : ""}esperado ${texto(esperado)}, veio ${texto(atual)}`);
  }
}

export function ok(valor, msg = "valor falso") {
  if (!valor) throw new Error(msg);
}

export async function rejeita(promessa, trecho) {
  try {
    await promessa;
  } catch (e) {
    if (trecho && !String(e?.message).includes(trecho)) throw new Error(`erro inesperado: ${e?.message}`);
    return e;
  }
  throw new Error("era esperado um erro");
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function rodar() {
  const lista = document.getElementById("resultados");
  let falhas = 0;
  for (const { nome, fn } of testes) {
    const li = document.createElement("li");
    try {
      await fn();
      li.dataset.ok = "true";
      li.textContent = `ok — ${nome}`;
    } catch (e) {
      falhas++;
      li.dataset.ok = "false";
      li.textContent = `FALHA — ${nome}: ${e?.message || e}`;
      console.error(nome, e);
    }
    lista.append(li);
  }
  document.getElementById("resumo").textContent = `${testes.length - falhas} ok, ${falhas} falhas`;
}
