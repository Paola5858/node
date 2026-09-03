export const safrasDisponiveis = [
  { id: 'safra-2026-27', nome: 'safra 2026/27', descricao: 'ciclo produtivo principal', progresso: 38, status: 'configuração necessária' },
  { id: 'safra-2025-26', nome: 'safra 2025/26', descricao: 'ciclo encerrado', progresso: 100, status: 'sem dados no período' },
]

export const dashboardData = {
  metricas: [
    { label: 'domínios disponíveis', valor: '07', legenda: 'cadastros preservados' },
    { label: 'próxima ação', valor: '01', legenda: 'configuração necessária', destaque: true },
  ],
  sinais: {
    titulo: 'dados insuficientes para avaliação',
    legenda: 'a operação ganha leitura à medida que os registros chegam',
  },
  atividade: [
    { titulo: 'ambiente iniciado', detalhe: 'estrutura pronta para novos registros', estado: 'concluído', quando: 'agora' },
    { titulo: 'defina o ciclo da operação', detalhe: 'a safra conecta os próximos registros', estado: 'pendente', quando: 'próximo' },
  ],
}