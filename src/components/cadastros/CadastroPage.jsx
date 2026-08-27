import { useMemo, useState } from 'react'

const catalogo = {
  safra: {
    numero: '01', title: 'cadastro de safra', eyebrow: 'produção / safras', description: 'defina o ciclo que organiza todos os seus registros de medição.',
    fields: [['nomeSafra', 'nome da safra', 'text', 'ex.: safra 2026'], ['dataInicio', 'data inicial', 'date', ''], ['dataFim', 'data final', 'date', '']],
  },
  unidade: {
    numero: '02', title: 'cadastro de unidade', eyebrow: 'estrutura / unidades', description: 'registre as unidades que fazem parte da operação da sua safra.',
    fields: [['nome', 'nome da unidade', 'text', 'ex.: fazenda primavera']],
  },
  equipamento: {
    numero: '03', title: 'cadastro de equipamento', eyebrow: 'operação / equipamentos', description: 'mantenha o inventário dos equipamentos ligados a cada unidade.',
    fields: [['nome', 'nome do equipamento', 'text', 'ex.: estação meteorológica'], ['unidade', 'unidade vinculada', 'select', ['fazenda primavera', 'unidade norte', 'unidade sul']]],
  },
  medicao: {
    numero: '04', title: 'cadastro de medição', eyebrow: 'dados / medições', description: 'conecte safra, equipamento e tipo de informação em um único registro.',
    fields: [['safra', 'safra', 'select', ['safra 2026', 'safra 2025']], ['equipamento', 'equipamento', 'select', ['estação meteorológica', 'sensor de solo']], ['tipoInformacao', 'tipo de informação', 'select', ['temperatura', 'umidade', 'precipitação']], ['valor', 'valor', 'number', 'ex.: 24.5'], ['data', 'data e hora', 'datetime-local', '']],
  },
  unidademedida: {
    numero: '05', title: 'cadastro de unidade de medida', eyebrow: 'dicionário / medidas', description: 'padronize nomes e símbolos para que seus dados falem a mesma língua.',
    fields: [['nome', 'nome da unidade', 'text', 'ex.: graus celsius'], ['simbolo', 'símbolo', 'text', 'ex.: °C']],
  },
  tipoinformacao: {
    numero: '06', title: 'cadastro de tipo de informação', eyebrow: 'dicionário / informações', description: 'descreva o que cada medição representa antes de analisar os resultados.',
    fields: [['nome', 'nome do tipo', 'text', 'ex.: temperatura do ar'], ['unidadeMedida', 'unidade de medida', 'select', ['graus celsius', 'milímetros', 'percentual']],],
  },
  indicadores: {
    numero: '07', title: 'cadastro de indicadores', eyebrow: 'análise / indicadores', description: 'crie referências claras para interpretar o comportamento da sua operação.',
    fields: [['nome', 'nome do indicador', 'text', 'ex.: produtividade média'], ['descricao', 'descrição', 'text', 'ex.: média por hectare'], ['url', 'url de referência', 'url', 'ex.: https://plume.app']],
  },
}

function CadastroPage({ tipo, onNavigate }) {
  const config = catalogo[tipo] || catalogo.safra
  const initialState = useMemo(() => Object.fromEntries(config.fields.map(([key]) => [key, ''])), [config])
  const [valores, setValores] = useState(initialState)
  const [erros, setErros] = useState({})
  const [mensagem, setMensagem] = useState('')
  const [enviado, setEnviado] = useState(false)

  function atualizarCampo(event) {
    const { name, value } = event.target
    setValores((atual) => ({ ...atual, [name]: value }))
    if (erros[name]) setErros((atual) => ({ ...atual, [name]: '' }))
    setMensagem('')
  }

  function salvar(event) {
    event.preventDefault()
    const novosErros = {}
    config.fields.forEach(([key, label, type]) => {
      if (!valores[key].trim()) novosErros[key] = `informe ${label}`
      if (type === 'url' && valores[key] && !/^https?:\/\//.test(valores[key])) novosErros[key] = 'use uma URL iniciando com http:// ou https://'
      if (key === 'dataFim' && valores[key] && valores.dataInicio && valores[key] < valores.dataInicio) novosErros[key] = 'a data final deve ser depois da inicial'
    })
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) {
      setMensagem('')
      setEnviado(false)
      return
    }
    setMensagem(`${config.title.replace('cadastro de ', '')} cadastrado com sucesso.`)
    setEnviado(true)
  }

  function limpar() {
    setValores(initialState)
    setErros({})
    setMensagem('')
    setEnviado(false)
  }

  return (
    <section className="cadastro-page">
      <div className="page-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> {config.eyebrow}</span><h1>{config.title}</h1><p>{config.description}</p></div><div className="step-badge"><strong>{config.numero}</strong><span>de 07<br />cadastros</span></div></div>
      <div className="form-layout"><div className="form-card glass-card"><div className="card-heading"><div><span className="mini-label">atributos da classe</span><h2>vamos criar esse registro.</h2></div><span className="required-note">* campos obrigatórios</span></div>
        {mensagem && <div className="success-feedback" role="status"><span className="success-mark">✓</span><div><strong>tudo certo por aqui.</strong><span>{mensagem}</span></div><button type="button" onClick={() => setMensagem('')} aria-label="Fechar mensagem">×</button></div>}
        <form onSubmit={salvar} noValidate><div className="form-grid">{config.fields.map(([key, label, type, extra]) => <Field key={key} name={key} label={label} type={type} placeholder={Array.isArray(extra) ? 'selecione uma opção' : extra} options={Array.isArray(extra) ? extra : null} value={valores[key]} error={erros[key]} onChange={atualizarCampo} />)}</div><div className="form-footer"><span className="form-hint"><span className="hint-dot" /> relações do diagrama prontas para receber dados.</span><div className="form-actions"><button type="button" className="button-ghost" onClick={limpar}>limpar</button><button type="submit" className="button-primary">{enviado ? 'salvo com sucesso' : 'cadastrar registro'} <span>→</span></button></div></div></form>
      </div><aside className="form-aside"><div className="aside-orbit"><span className="orbit-core">{config.numero}</span><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /></div><span className="aside-kicker">diagrama em movimento</span><p>cada classe tem seu lugar. cada campo conta uma parte da história da safra.</p><button type="button" onClick={() => onNavigate('inicio')}>voltar para visão geral <span>↗</span></button></aside></div>
    </section>
  )
}

function Field({ name, label, type, placeholder, options, value, error, onChange }) {
  return <div className={`field ${error ? 'has-error' : ''}`}><label htmlFor={name}>{label}<span>*</span></label>{options ? <select id={name} name={name} value={value} onChange={onChange} aria-invalid={Boolean(error)}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} aria-invalid={Boolean(error)} />}{error && <small className="field-error">{error}</small>}</div>
}

export default CadastroPage
