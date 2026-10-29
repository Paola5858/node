export const CADASTROS = {
  safra: {
    titulo: 'Safras', singular: 'safra', numero: '01', grupo: 'operação',
    descricao: 'ciclos que organizam os dados da operação.',
    campos: [
      { nome: 'nomeSafra', rotulo: 'Nome da safra', tipo: 'text', placeholder: 'ex.: safra 2026/2027', obrigatorio: true },
      { nome: 'dataInicio', rotulo: 'Data de início', tipo: 'date', obrigatorio: true },
      { nome: 'dataFim', rotulo: 'Data de fim', tipo: 'date', obrigatorio: true },
    ],
    imagem: { rotulo: 'Imagem da safra', obrigatoria: true },
    nome: (item) => item.nomeSafra,
  },
  unidade: {
    titulo: 'Unidades', singular: 'unidade', numero: '02', grupo: 'operação',
    descricao: 'locais e unidades que fazem parte da sua operação.',
    campos: [{ nome: 'nome', rotulo: 'Nome da unidade', tipo: 'text', placeholder: 'ex.: Usina Araçatuba', obrigatorio: true }],
    nome: (item) => item.nome,
  },
  equipamento: {
    titulo: 'Equipamentos', singular: 'equipamento', numero: '03', grupo: 'operação',
    descricao: 'ativos ligados às unidades de produção.',
    campos: [
      { nome: 'nome', rotulo: 'Nome do equipamento', tipo: 'text', placeholder: 'ex.: Frente de colheita 01', obrigatorio: true },
      { nome: 'unidade', rotulo: 'Unidade vinculada', tipo: 'select', origem: 'unidade', obrigatorio: true },
    ],
    imagem: { rotulo: 'Foto do equipamento', obrigatoria: false },
    nome: (item) => item.nome,
  },
  medicao: {
    titulo: 'Medições', singular: 'medição', numero: '04', grupo: 'monitoramento',
    descricao: 'leituras conectadas a safra, equipamento e tipo de informação.',
    campos: [
      { nome: 'safra', rotulo: 'Safra', tipo: 'select', origem: 'safra', obrigatorio: true },
      { nome: 'equipamento', rotulo: 'Equipamento', tipo: 'select', origem: 'equipamento', obrigatorio: true },
      { nome: 'tipoInformacao', rotulo: 'Tipo de informação', tipo: 'select', origem: 'tipoinformacao', obrigatorio: true },
      { nome: 'valor', rotulo: 'Valor', tipo: 'number', placeholder: 'ex.: 1250.5', obrigatorio: true },
      { nome: 'data', rotulo: 'Data e hora', tipo: 'datetime-local', obrigatorio: true },
    ],
    filtros: ['safra', 'equipamento'],
    nome: (item, opcoes) => `${opcaoNome(opcoes.safra, item.safra)} · ${item.valor}`,
  },
  unidademedida: {
    titulo: 'Unidades de medida', singular: 'unidade de medida', numero: '05', grupo: 'configuração',
    descricao: 'nomes e símbolos que padronizam as leituras.',
    campos: [
      { nome: 'nome', rotulo: 'Nome da unidade', tipo: 'text', placeholder: 'ex.: tonelada', obrigatorio: true },
      { nome: 'simbolo', rotulo: 'Símbolo', tipo: 'text', placeholder: 'ex.: t', obrigatorio: true },
    ],
    nome: (item) => `${item.nome} (${item.simbolo})`,
  },
  tipoinformacao: {
    titulo: 'Tipos de informação', singular: 'tipo de informação', numero: '06', grupo: 'configuração',
    descricao: 'o significado de cada dado medido na operação.',
    campos: [
      { nome: 'nome', rotulo: 'Nome do tipo', tipo: 'text', placeholder: 'ex.: cana recebida', obrigatorio: true },
      { nome: 'unidadeMedida', rotulo: 'Unidade de medida', tipo: 'select', origem: 'unidademedida', obrigatorio: true },
    ],
    nome: (item) => item.nome,
  },
}

export function opcaoNome(lista = [], id) {
  const item = lista.find((registro) => String(registro.Id) === String(id))
  if (!item) return id ? `#${id}` : 'não informado'
  return item.nomeSafra || item.nome || item.Nome || `#${item.Id}`
}

export function nomeRegistro(recurso, item, opcoes = {}) {
  return CADASTROS[recurso]?.nome?.(item, opcoes) || item.nome || item.nomeSafra || `registro #${item.Id}`
}
