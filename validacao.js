// Regras puras do formulário de vistoria. Cada pendência diz a etapa e o id
// do campo a focar (as telas usam esses mesmos ids nos elementos).
import { CHECKLIST_ITENS, FOTOS_VEICULO } from "./config.js";

const vazio = (s) => !String(s ?? "").trim();

export function validarAvaria(avaria) {
  const erros = [];
  if (vazio(avaria.area)) erros.push("Escolha a área da avaria");
  if (vazio(avaria.tipo)) erros.push("Escolha o tipo da avaria");
  if (vazio(avaria.gravidade)) erros.push("Escolha a gravidade");
  return erros;
}

function etapaVeiculo(d) {
  const f = [];
  const add = (campo, mensagem) => f.push({ etapa: 1, campo, mensagem });
  if (vazio(d.loja)) add("loja", "Escolha a loja de destino");
  const chassi = String(d.chassi ?? "").trim();
  if (!chassi) add("chassi", "Informe o chassi");
  else if (chassi.length < 6) add("chassi", `O chassi deve ter 6 caracteres (faltam ${6 - chassi.length})`);
  if (vazio(d.marca)) add("marca", "Informe a marca");
  if (vazio(d.modelo)) add("modelo", "Informe o modelo");
  if (vazio(d.cor)) add("cor", "Informe a cor");
  if (d.km === null || d.km === undefined || d.km === "") add("km", "Informe o km");
  if (!d.combustivel) add("combustivel", "Escolha o combustível");
  for (const { chave, rotulo } of FOTOS_VEICULO) {
    if (!d.fotos?.[chave]) add(`foto-${chave}`, `Falta a foto: ${rotulo}`);
  }
  return f;
}

function etapaChecklist(d) {
  const faltam = CHECKLIST_ITENS.filter((item) => !d.checklist?.[item]);
  if (!faltam.length) return [];
  const n = faltam.length;
  return [{
    etapa: 2,
    campo: `chk-${CHECKLIST_ITENS.indexOf(faltam[0])}`,
    mensagem: `Checklist: ${n} ${n === 1 ? "item" : "itens"} sem marcação (${faltam.join(", ")})`,
  }];
}

function etapaAvarias(d) {
  if (d.semAvarias || d.avarias?.length) return [];
  return [{ etapa: 3, campo: "sem-avarias", mensagem: "Confirme “Veículo sem avarias” ou adicione uma avaria" }];
}

function etapaAssinaturas(d) {
  const f = [];
  const add = (campo, mensagem) => f.push({ etapa: 4, campo, mensagem });
  if (vazio(d.vistoriadorNome)) add("vistoriador-nome", "Seu nome de vistoriador não está cadastrado. Peça ao administrador.");
  if (!d.assinaturas?.vistoriador) add("vistoriador-assinatura", "Falta a assinatura do vistoriador");
  if (vazio(d.motoristaNome)) add("motorista-nome", "Informe o nome do motorista do reboque");
  if (!d.assinaturas?.motorista) add("motorista-assinatura", "Falta a assinatura do motorista do reboque");
  return f;
}

export function faltandoParaFinalizar(rascunho) {
  const d = rascunho.dados;
  return [...etapaVeiculo(d), ...etapaChecklist(d), ...etapaAvarias(d), ...etapaAssinaturas(d)];
}

export function situacaoEtapa(rascunho, etapa) {
  return faltandoParaFinalizar(rascunho).some((f) => f.etapa === etapa) ? "pendente" : "completa";
}
