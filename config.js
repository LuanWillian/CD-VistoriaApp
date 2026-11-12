// Listas e parâmetros editáveis do app. Para incluir ou remover itens do
// checklist, áreas ou tipos de avaria, altere só este arquivo.

export const CHECKLIST_ITENS = ["Antena", "Calotas", "Manual do proprietário", "Triângulo", "Equipamento de som",
  "Estepe/Kit", "Bateria", "Documento", "Macaco", "Chave de roda", "Extintor", "Tapetes", "Carregador"];

export const AREAS_AVARIA = ["Para-choque dianteiro", "Capô", "Para-brisa", "Teto", "Porta dianteira esquerda",
  "Porta dianteira direita", "Porta traseira esquerda", "Porta traseira direita", "Paralama dianteiro esquerdo",
  "Paralama dianteiro direito", "Lateral traseira esquerda", "Lateral traseira direita", "Tampa do porta-malas",
  "Vidro traseiro", "Para-choque traseiro", "Faróis/Lanternas", "Retrovisores", "Rodas/Pneus", "Interior", "Outro"];

export const TIPOS_AVARIA = ["Amassado", "Arranhão", "Risco", "Trinca", "Quebrado", "Faltando peça", "Ferrugem",
  "Mancha", "Descascado/Pintura danificada", "Outro"];

export const GRAVIDADES = [
  { valor: "Leve", cor: "#F5C400", texto: "#1A1A1A" },
  { valor: "Moderada", cor: "#F28C28", texto: "#1A1A1A" },
  { valor: "Grave", cor: "#C62828", texto: "#FFFFFF" },
];

// Lojas de destino (para onde o veículo vendido é enviado). Aparecem, nesta
// ordem, na etapa "Dados do veículo" e nos filtros do painel e do dashboard.
// Ordem alfabética pela marca (sem o "PG Prime"); na mesma marca, pela cidade.
export const LOJAS = [
  "PG Prime Audi Natal",
  "PG Prime BMW João Pessoa",
  "PG Prime BMW Natal",
  "Funilaria Natal",
  "PG Prime GWM João Pessoa",
  "PG Prime GWM Mossoró",
  "PG Prime GWM Natal",
  "PG Prime Jeep Natal",
  "PG Prime Selection João Pessoa",
  "PG Prime Selection Natal",
  "PG Prime Volvo João Pessoa",
  "PG Prime Volvo Natal",
];

export const COMBUSTIVEIS = ["Gasolina", "Flex", "Diesel", "Elétrico", "Híbrido"];

export const FOTOS_VEICULO = [
  { chave: "frente", rotulo: "Frente" },
  { chave: "traseira", rotulo: "Traseira" },
  { chave: "chassi", rotulo: "Chassi" },
];

// Compressão das fotos no aparelho
export const FOTO = { maxLado: 1280, qualidade: 0.7, miniLado: 320 };
// Empresa no cabeçalho e no rodapé do PDF
export const EMPRESA = {
  nome: "PG Prime",
  endereco: "Rodovia BR 101 KM 120 | Areia Branca, São José de Mipibu - RN",
  rodape: "CD Vistoria",
};
// Fotos dentro do PDF
export const PDF_FOTO = { maxLado: 1000, maxLadoMuitas: 800, limiteMuitas: 20, qualidade: 0.75 };
// Vistorias por página na aba "Vistorias"
export const ITENS_POR_PAGINA = 20;
// Fotos de vistorias já sincronizadas saem do aparelho depois deste número de dias
export const DIAS_CACHE_FOTOS = 30;
// Painel do navegador do computador (#/inicio): nome da saudação quando a conta
// não tem nome no perfil, e linhas por página da tabela.
export const NOME_PADRAO_PAINEL = "Luan";
export const ITENS_POR_PAGINA_PAINEL = 25;
