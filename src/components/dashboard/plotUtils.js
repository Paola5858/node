export const LARGURA_PLOT = 620
export const ALTURA_PLOT = 96

export function formatarValor(valor) {
  return Number(valor).toFixed(1).replace('.', ',')
}

export function pontosDaSerie(serie) {
  const passo = LARGURA_PLOT / serie.valores.length
  return serie.valores.map((valor, indice) => {
    const proporcao = (valor - serie.min) / (serie.max - serie.min)
    return {
      x: Number((passo * (indice + 0.5)).toFixed(2)),
      y: Number((ALTURA_PLOT - proporcao * ALTURA_PLOT).toFixed(2)),
      valor,
      indice,
    }
  })
}
