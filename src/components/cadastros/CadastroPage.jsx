import { useEffect, useMemo, useRef, useState } from 'react'

const catalogo = {
  safra: { numero: '01', title: 'cadastro de safra', eyebrow: 'produção / safras', description: 'defina o ciclo que organiza todos os seus registros de medição.', imagemLabel: 'imagem da safra', imagemObrigatoria: true, fields: [['nomeSafra', 'nome da safra', 'text', 'ex.: safra 2026'], ['dataInicio', 'data inicial', 'date', ''], ['dataFim', 'data final', 'date', '']] },
  unidade: { numero: '02', title: 'cadastro de unidade', eyebrow: 'estrutura / unidades', description: 'registre as unidades que fazem parte da operação da sua safra.', fields: [['nome', 'nome da unidade', 'text', 'ex.: fazenda primavera']] },
  equipamento: { numero: '03', title: 'cadastro de equipamento', eyebrow: 'operação / equipamentos', description: 'mantenha o inventário dos equipamentos ligados a cada unidade.', imagemLabel: 'foto do equipamento', fields: [['nome', 'nome do equipamento', 'text', 'ex.: estação meteorológica'], ['unidade', 'unidade vinculada', 'select', ['fazenda primavera', 'unidade norte', 'unidade sul']]] },
  medicao: { numero: '04', title: 'cadastro de medição', eyebrow: 'dados / medições', description: 'conecte safra, equipamento e tipo de informação em um único registro.', fields: [['safra', 'safra', 'select', ['safra 2026', 'safra 2025']], ['equipamento', 'equipamento', 'select', ['estação meteorológica', 'sensor de solo']], ['tipoInformacao', 'tipo de informação', 'select', ['temperatura', 'umidade', 'precipitação']], ['valor', 'valor', 'number', 'ex.: 24.5'], ['data', 'data e hora', 'datetime-local', '']] },
  unidademedida: { numero: '05', title: 'cadastro de unidade de medida', eyebrow: 'dicionário / medidas', description: 'padronize nomes e símbolos para que seus dados falem a mesma língua.', fields: [['nome', 'nome da unidade', 'text', 'ex.: graus celsius'], ['simbolo', 'símbolo', 'text', 'ex.: °C']] },
  tipoinformacao: { numero: '06', title: 'cadastro de tipo de informação', eyebrow: 'dicionário / informações', description: 'descreva o que cada medição representa antes de analisar os resultados.', fields: [['nome', 'nome do tipo', 'text', 'ex.: temperatura do ar'], ['unidadeMedida', 'unidade de medida', 'select', ['graus celsius', 'milímetros', 'percentual']]] },
  indicadores: { numero: '07', title: 'cadastro de indicadores', eyebrow: 'análise / indicadores', description: 'crie referências claras para interpretar o comportamento da sua operação.', fields: [['nome', 'nome do indicador', 'text', 'ex.: produtividade média'], ['descricao', 'descrição', 'text', 'ex.: média por hectare'], ['url', 'url de referência', 'url', 'ex.: https://plume.app']] },
}

function CadastroPage({ tipo, onNavigate }) {
  const config = catalogo[tipo] || catalogo.safra
  const initialState = useMemo(() => Object.fromEntries(config.fields.map(([key]) => [key, ''])), [config])
  const [valores, setValores] = useState(initialState)
  const [erros, setErros] = useState({})
  const [mensagem, setMensagem] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [foto, setFoto] = useState(null)
  const [previewFoto, setPreviewFoto] = useState(null)
  const [erroCamera, setErroCamera] = useState('')
  const [cameraAtiva, setCameraAtiva] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => () => { pararCamera(); if (previewFoto?.startsWith('blob:')) URL.revokeObjectURL(previewFoto) }, [previewFoto])

  function atualizarCampo(event) {
    const { name, value } = event.target
    setValores((atual) => ({ ...atual, [name]: value }))
    if (erros[name]) setErros((atual) => ({ ...atual, [name]: '' }))
    setMensagem('')
  }

  function selecionarFoto(event) {
    const arquivo = event.target.files?.[0]
    if (!arquivo) return
    if (!arquivo.type.startsWith('image/')) { setErroCamera('selecione um arquivo de imagem válido.'); return }
    if (arquivo.size > 8 * 1024 * 1024) { setErroCamera('essa imagem passa de 8 MB. escolha uma versão menor.'); return }
    pararCamera()
    if (previewFoto?.startsWith('blob:')) URL.revokeObjectURL(previewFoto)
    setFoto(arquivo)
    setPreviewFoto(URL.createObjectURL(arquivo))
    setErroCamera('')
    setErros((atual) => ({ ...atual, foto: '' }))
  }

  async function abrirCamera() {
    setErroCamera('')
    if (!navigator.mediaDevices?.getUserMedia) { setErroCamera('a câmera não está disponível neste navegador. você ainda pode selecionar uma imagem do dispositivo.'); return }
    try {
      pararCamera()
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      setCameraAtiva(true)
    } catch {
      setErroCamera('não foi possível acessar a câmera. verifique a permissão, feche outros apps que possam estar usando-a ou escolha uma imagem do dispositivo.')
      setCameraAtiva(false)
    }
  }

  function pararCamera() {
    const stream = videoRef.current?.srcObject
    stream?.getTracks().forEach((track) => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraAtiva(false)
  }

  function capturarFoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) { setErroCamera('aguarde a câmera carregar antes de capturar a imagem.'); return }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      setFoto(new File([blob], `${tipo}-captura.jpg`, { type: 'image/jpeg' }))
      setPreviewFoto(canvas.toDataURL('image/jpeg', .9))
      setErros((atual) => ({ ...atual, foto: '' }))
      setErroCamera('')
      pararCamera()
    }, 'image/jpeg', .9)
  }

  function removerFoto() {
    if (previewFoto?.startsWith('blob:')) URL.revokeObjectURL(previewFoto)
    setFoto(null); setPreviewFoto(null); setErroCamera(''); setErros((atual) => ({ ...atual, foto: '' }))
  }

  function salvar(event) {
    event.preventDefault()
    const novosErros = {}
    config.fields.forEach(([key, label, type]) => {
      if (!valores[key].trim()) novosErros[key] = `informe ${label}`
      if (type === 'url' && valores[key] && !/^https?:\/\//.test(valores[key])) novosErros[key] = 'use uma URL iniciando com http:// ou https://'
      if (key === 'dataFim' && valores[key] && valores.dataInicio && valores[key] < valores.dataInicio) novosErros[key] = 'a data final deve ser depois da inicial'
    })
    if (config.imagemObrigatoria && !previewFoto) novosErros.foto = 'selecione ou capture uma imagem'
    setErros(novosErros)
    if (Object.keys(novosErros).length) { setMensagem(''); setEnviado(false); return }
    setMensagem(`${config.title.replace('cadastro de ', '')} cadastrado com sucesso.`)
    setEnviado(true)
  }

  function limpar() { pararCamera(); setValores(initialState); setErros({}); setMensagem(''); setEnviado(false); removerFoto() }

  return <section className="cadastro-page"><div className="page-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> {config.eyebrow}</span><h1>{config.title}</h1><p>{config.description}</p></div><div className="step-badge"><strong>{config.numero}</strong><span>de 07<br />cadastros</span></div></div><div className="form-layout"><div className="form-card glass-card"><div className="card-heading"><div><span className="mini-label">atributos da classe</span><h2>vamos criar esse registro.</h2></div><span className="required-note">* campos obrigatórios</span></div>{mensagem && <div className="success-feedback" role="status"><span className="success-mark">✓</span><div><strong>tudo certo por aqui.</strong><span>{mensagem}</span></div><button type="button" onClick={() => setMensagem('')} aria-label="Fechar mensagem">×</button></div>}{erroCamera && <div className="camera-feedback" role="alert"><span>!</span><div><strong>atenção com a imagem</strong><small>{erroCamera}</small></div><button type="button" onClick={() => setErroCamera('')} aria-label="Fechar aviso">×</button></div>}<form onSubmit={salvar} noValidate><div className="form-grid">{config.fields.map(([key, label, type, extra]) => <Field key={key} name={key} label={label} type={type} placeholder={Array.isArray(extra) ? 'selecione uma opção' : extra} options={Array.isArray(extra) ? extra : null} value={valores[key]} error={erros[key]} onChange={atualizarCampo} />)}</div><ImageCapture label={config.imagemLabel} required={config.imagemObrigatoria} foto={foto} previewFoto={previewFoto} cameraAtiva={cameraAtiva} videoRef={videoRef} canvasRef={canvasRef} error={erros.foto} onSelect={selecionarFoto} onOpenCamera={abrirCamera} onCapture={capturarFoto} onStopCamera={pararCamera} onRemove={removerFoto} /><div className="form-footer"><span className="form-hint"><span className="hint-dot" /> câmera e arquivo local disponíveis neste protótipo.</span><div className="form-actions"><button type="button" className="button-ghost" onClick={limpar}>limpar</button><button type="submit" className="button-primary">{enviado ? 'salvo com sucesso' : 'cadastrar registro'} <span>→</span></button></div></div></form></div><aside className="form-aside"><div className="aside-orbit"><span className="orbit-core">{config.numero}</span><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /></div><span className="aside-kicker">diagrama em movimento</span><p>um bom registro também sabe enxergar. carregue uma imagem ou capture o momento.</p><button type="button" onClick={() => onNavigate('inicio')}>voltar para visão geral <span>↗</span></button></aside></div></section>
}

function ImageCapture({ label, required, foto, previewFoto, cameraAtiva, videoRef, canvasRef, error, onSelect, onOpenCamera, onCapture, onStopCamera, onRemove }) {
  return <div className={`image-capture ${error ? 'has-error' : ''}`}><div className="image-heading"><div><label htmlFor="arquivo-imagem">{label}{required && <span>*</span>}</label><small>jpg, png ou webp · até 8 MB</small></div>{previewFoto && <button type="button" className="remove-photo" onClick={onRemove}>remover imagem</button>}</div><div className="upload-workspace"><div className={`preview-frame ${previewFoto ? 'has-preview' : ''}`}>{previewFoto ? <img src={previewFoto} alt="Pré-visualização da imagem selecionada" /> : <div className="empty-preview"><span className="camera-glyph">◌</span><strong>nenhuma imagem ainda</strong><small>selecione do dispositivo ou abra a câmera</small></div>}{foto && <span className="image-ready">imagem pronta</span>}</div><div className="upload-actions"><label className="upload-dropzone" htmlFor="arquivo-imagem"><input id="arquivo-imagem" type="file" accept="image/*" onChange={onSelect} /><span className="upload-icon">↑</span><strong>escolher imagem</strong><small>do computador ou celular</small></label><div className="action-divider"><span>ou</span></div>{cameraAtiva ? <div className="camera-panel"><video ref={videoRef} autoPlay playsInline muted aria-label="Pré-visualização da câmera" /><div><button type="button" className="button-primary" onClick={onCapture}>capturar foto <span>◉</span></button><button type="button" className="button-ghost" onClick={onStopCamera}>fechar câmera</button></div></div> : <button type="button" className="camera-button" onClick={onOpenCamera}><span>◉</span><strong>usar câmera</strong><small>capturar ao vivo</small></button>}</div></div><canvas ref={canvasRef} className="capture-canvas" />{error && <small className="field-error">{error}</small>}</div>
}

function Field({ name, label, type, placeholder, options, value, error, onChange }) { return <div className={`field ${error ? 'has-error' : ''}`}><label htmlFor={name}>{label}<span>*</span></label>{options ? <select id={name} name={name} value={value} onChange={onChange} aria-invalid={Boolean(error)}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} aria-invalid={Boolean(error)} />}{error && <small className="field-error">{error}</small>}</div> }

export default CadastroPage
