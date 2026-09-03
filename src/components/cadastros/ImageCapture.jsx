import React, { useEffect, useRef, useState } from 'react'

function ImageCapture({ tipo, label, required, error, onImageChange }) {
  const [foto, setFoto] = useState(null)
  const [previewFoto, setPreviewFoto] = useState(null)
  const [erroCamera, setErroCamera] = useState('')
  const [cameraAtiva, setCameraAtiva] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  function pararCamera() {
    const stream = videoRef.current?.srcObject
    stream?.getTracks().forEach((track) => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraAtiva(false)
  }

  function limparPreview() {
    if (previewFoto?.startsWith('blob:')) URL.revokeObjectURL(previewFoto)
  }

  useEffect(() => () => {
    const stream = videoRef.current?.srcObject
    stream?.getTracks().forEach((track) => track.stop())
    if (previewFoto?.startsWith('blob:')) URL.revokeObjectURL(previewFoto)
  }, [previewFoto])

  function selecionarFoto(event) {
    const arquivo = event.target.files?.[0]
    if (!arquivo) return
    if (!arquivo.type.startsWith('image/')) { setErroCamera('selecione um arquivo de imagem válido.'); return }
    if (arquivo.size > 8 * 1024 * 1024) { setErroCamera('essa imagem passa de 8 MB. escolha uma versão menor.'); return }
    pararCamera()
    limparPreview()
    setFoto(arquivo)
    setPreviewFoto(URL.createObjectURL(arquivo))
    setErroCamera('')
    onImageChange(true)
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
      setErrosAndNotify()
      pararCamera()
    }, 'image/jpeg', .9)
  }

  function setErrosAndNotify() {
    setErroCamera('')
    onImageChange(true)
  }

  function removerFoto() {
    pararCamera()
    limparPreview()
    setFoto(null)
    setPreviewFoto(null)
    setErroCamera('')
    onImageChange(false)
  }

  return <div className={`image-capture ${error ? 'has-error' : ''}`}><div className="image-heading"><div><label htmlFor="arquivo-imagem">{label}{required && <span>*</span>}</label><small>jpg, png ou webp · até 8 MB</small></div>{previewFoto && <button type="button" className="remove-photo" onClick={removerFoto}>remover imagem</button>}</div><div className="upload-workspace"><div className={`preview-frame ${previewFoto ? 'has-preview' : ''}`}>{previewFoto ? <img src={previewFoto} alt="Pré-visualização da imagem selecionada" /> : <div className="empty-preview"><span className="camera-glyph">◌</span><strong>nenhuma imagem ainda</strong><small>selecione do dispositivo ou abra a câmera</small></div>}{foto && <span className="image-ready">imagem pronta</span>}</div><div className="upload-actions"><label className="upload-dropzone" htmlFor="arquivo-imagem"><input id="arquivo-imagem" type="file" accept="image/*" onChange={selecionarFoto} /><span className="upload-icon">↑</span><strong>escolher imagem</strong><small>do computador ou celular</small></label><div className="action-divider"><span>ou</span></div>{cameraAtiva ? <div className="camera-panel"><video ref={videoRef} autoPlay playsInline muted aria-label="Pré-visualização da câmera" /><div><button type="button" className="button-primary" onClick={capturarFoto}>capturar foto <span>◉</span></button><button type="button" className="button-ghost" onClick={pararCamera}>fechar câmera</button></div></div> : <button type="button" className="camera-button" onClick={abrirCamera}><span>◉</span><strong>usar câmera</strong><small>capturar ao vivo</small></button>}</div></div><canvas ref={canvasRef} className="capture-canvas" />{erroCamera && <div className="camera-feedback" role="alert"><span>!</span><div><strong>atenção com a imagem</strong><small>{erroCamera}</small></div><button type="button" onClick={() => setErroCamera('')} aria-label="Fechar aviso">×</button></div>}{error && <small className="field-error">{error}</small>}</div>
}

export default ImageCapture
