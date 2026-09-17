const USUARIO_KEY = 'plume.usuario'
const SESSAO_KEY = 'plume.sessao'

function lerJson(storage, chave) {
  try {
    const valor = storage.getItem(chave)
    return valor ? JSON.parse(valor) : null
  } catch {
    return null
  }
}

export function lerUsuario() {
  return lerJson(window.localStorage, USUARIO_KEY)
}

export function salvarUsuario(usuario) {
  window.localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario))
}

export function lerSessao() {
  return lerJson(window.sessionStorage, SESSAO_KEY)
}

export function iniciarSessao(usuario, localizacao = null) {
  const sessao = {
    email: usuario.email,
    nome: usuario.nome,
    foto: usuario.foto || '',
    entrouEm: new Date().toISOString(),
    localizacao,
  }
  window.sessionStorage.setItem(SESSAO_KEY, JSON.stringify(sessao))
  return sessao
}

export function encerrarSessao() {
  window.sessionStorage.removeItem(SESSAO_KEY)
}

export function solicitarLocalizacao() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ status: 'indisponivel', mensagem: 'seu navegador não oferece localização.' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        status: 'permitida',
        latitude: Number(coords.latitude.toFixed(5)),
        longitude: Number(coords.longitude.toFixed(5)),
        precisao: Math.round(coords.accuracy),
      }),
      (erro) => resolve({
        status: erro.code === 1 ? 'recusada' : 'indisponivel',
        mensagem: erro.code === 1 ? 'tudo bem não compartilhar sua localização agora.' : 'não foi possível obter sua localização.',
      }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    )
  })
}

export { USUARIO_KEY, SESSAO_KEY }
