import React, { useState } from 'react'

function VisualizarIndicador({ indicador, onVoltar }) {
  const [carregando, setCarregando] = useState(true)
  const [indisponivel, setIndisponivel] = useState(false)
  const url = indicador?.Url || ''
  let segura = false
  try { segura = ['http:', 'https:'].includes(new URL(url).protocol) } catch { segura = false }

  if (!segura) {
    return (
      <section className="panel-viewer glass-card">
        <div className="viewer-heading">
          <div>
            <span className="mini-label">painel selecionado</span>
            <h2>{indicador?.Nome || 'Indicador'}</h2>
          </div>
          {onVoltar && (
            <button className="button-ghost" type="button" onClick={onVoltar}>
              voltar para a lista
            </button>
          )}
        </div>
        <div className="viewer-state">
          <strong>URL de painel inválida.</strong>
          <small>edite o indicador e informe um endereço http ou https.</small>
        </div>
      </section>
    )
  }

  return (
    <section className="panel-viewer glass-card">
      <div className="viewer-heading">
        <div>
          <span className="mini-label">painel selecionado</span>
          <h2>{indicador.Nome}</h2>
          <p>{indicador.Descricao}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onVoltar && (
            <button className="button-ghost" type="button" onClick={onVoltar}>
              voltar para a lista
            </button>
          )}
          <a className="button-ghost" href={url} target="_blank" rel="noreferrer">
            abrir em nova aba <span>↗</span>
          </a>
        </div>
      </div>

      <div className="viewer-frame">
        {carregando && !indisponivel && (
          <div className="viewer-loading">
            <span className="loading-bar" />
            <strong>carregando painel...</strong>
          </div>
        )}
        {indisponivel ? (
          <div className="viewer-state">
            <strong>o painel não pôde ser exibido aqui.</strong>
            <small>o provedor pode bloquear iframe ou exigir outra sessão. o botão acima abre o endereço original.</small>
          </div>
        ) : (
          <iframe
            title={`Painel ${indicador.Nome}`}
            src={url}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setCarregando(false)}
            onError={() => { setCarregando(false); setIndisponivel(true) }}
          />
        )}
      </div>

      <small className="viewer-note">
        a visualização respeita as políticas de segurança do site externo. o Plume não tenta contornar bloqueios do navegador.
      </small>
    </section>
  )
}

export default VisualizarIndicador
