// Dados de demonstração: descrevem a estrutura do painel operacional.
// Não representam condições reais de uma usina — a interface sinaliza isso
// com o selo "ambiente de demonstração" na visão geral.

export const safrasDisponiveis = [
  { id: 'safra-2026-27', nome: 'safra 2026/27', descricao: 'ciclo produtivo principal', progresso: 38, status: 'ciclo em andamento' },
  { id: 'safra-2025-26', nome: 'safra 2025/26', descricao: 'ciclo encerrado', progresso: 100, status: 'ciclo encerrado' },
]

const periodos = ['01 abr', '01 mai', '01 jun', '01 jul', '01 ago', '01 set', '15 out']

export const visaoGeral = {
  meta: {
    periodo: '01 abr – 15 out 2026',
    ultimaMedicao: '15 out 2026, 12:00',
    unidadesComRegistros: 3,
  },

  kpis: [
    {
      id: 'atr',
      nome: 'ATR',
      valor: '139,4',
      unidade: 'kg/t cana',
      variacao: { direcao: 'alta', texto: '0,3 acima do mês anterior' },
      nota: 'média ponderada por massa',
    },
    {
      id: 'pol-bagaco',
      nome: 'Pol do bagaço',
      valor: '2,15',
      unidade: '%',
      tom: 'warn',
      estado: 'acima da faixa',
      nota: 'faixa 1,40 – 1,90 %',
    },
    {
      id: 'extracao',
      nome: 'Eficiência de extração',
      valor: '95,8',
      unidade: '%',
      estado: 'na faixa',
      estadoTom: 'ok',
      nota: 'faixa 95,5 – 97,0 %',
    },
    {
      id: 'acido-latico',
      nome: 'Ácido lático',
      valor: '2,40',
      unidade: 'g/L',
      tom: 'danger',
      estado: 'crítico',
      estadoTom: 'danger',
      nota: 'máximo do dia · dorna 4',
    },
  ],

  historico: {
    subtitulo: 'médias mensais · 7 meses',
    rotulos: periodos,
    series: [
      {
        id: 'atr',
        nome: 'ATR',
        unidade: 'kg/t cana',
        cor: 'var(--brand)',
        area: true,
        min: 125,
        max: 145,
        ticks: ['145', '135', '125'],
        valores: [136.9, 138.8, 137.9, 140.1, 139.2, 141.3, 141.6],
      },
      {
        id: 'pol',
        nome: 'Pol do caldo primário',
        unidade: '%',
        cor: 'var(--amber)',
        area: false,
        min: 12,
        max: 17,
        ticks: ['17,0', '14,5', '12,0'],
        valores: [13.6, 14.1, 13.9, 14.6, 14.4, 15.6, 16.3],
      },
    ],
  },

  excecoes: [
    { id: 'acido-latico', nome: 'Ácido lático', processo: 'Fermentação · Dorna 4', valor: '2,40 g/L', status: 'crítico', tom: 'danger' },
    { id: 'pol-bagaco', nome: 'Pol do bagaço', processo: 'Moagem · Extrator A', valor: '2,15 %', status: 'acima da faixa', tom: 'warn' },
    { id: 'viabilidade', nome: 'Viabilidade celular', processo: 'Destilaria · Dorna 4', valor: '79,5 %', status: 'abaixo da faixa', tom: 'warn' },
    { id: 'parada', nome: 'Parada não programada', processo: 'Moenda 1 · 07:15 às 08:00', status: 'parada', valor: '45 min', tom: 'parada' },
  ],

  qualidade: {
    lote: 'A-2241',
    arquivo: 'Fato_Medicoes_2026-10-15.xlsx',
    processadoEm: '15 out 2026, 12:04',
    responsavel: 'paola.almeida',
    aceitos: 389,
    rejeitados: 9,
    pendentes: 14,
    duplicidades: 4,
    semDefinicao: 1,
  },
}
