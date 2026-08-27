import { useMemo, useState } from 'react'

const catalogo = {
  funcionarios: {
    numero: '01', title: 'cadastro de funcionários', eyebrow: 'pessoas / time', description: 'centralize os dados de quem faz o workspace acontecer.', fields: [
      ['nome', 'nome completo', 'text', 'ex.: paola soares'], ['email', 'e-mail corporativo', 'email', 'ex.: paola@plume.com'], ['telefone', 'telefone', 'tel', 'ex.: (11) 99999-9999'], ['setor', 'setor', 'select', ['administrativo', 'produção', 'manutenção', 'ti']], ['cargo', 'cargo', 'text', 'ex.: analista de sistemas'],
    ],
  },
  clientes: {
    numero: '02', title: 'cadastro de clientes', eyebrow: 'relacionamentos / clientes', description: 'uma visão organizada para cada relação que merece atenção.', fields: [
      ['nome', 'nome do cliente', 'text', 'ex.: empresa aurora'], ['email', 'e-mail', 'email', 'ex.: contato@empresa.com'], ['telefone', 'telefone', 'tel', 'ex.: (11) 99999-9999'], ['segmento', 'segmento', 'select', ['tecnologia', 'varejo', 'serviços', 'indústria']],
    ],
  },
  produtos: { numero: '03', title: 'cadastro de produtos', eyebrow: 'catálogo / produtos', description: 'dê contexto ao que sua operação oferece ao mundo.', fields: [['nome', 'nome do produto', 'text', 'ex.: kit essencial'], ['codigo', 'código interno', 'text', 'ex.: PLM-001'], ['preco', 'preço', 'text', 'ex.: R$ 0,00'], ['categoria', 'categoria', 'select', ['software', 'hardware', 'serviço', 'outros']]] },
  fornecedores: { numero: '04', title: 'cadastro de fornecedores', eyebrow: 'operação / parceiros', description: 'parcerias bem registradas deixam o processo mais leve.', fields: [['nome', 'razão social', 'text', 'ex.: fornecedora norte'], ['email', 'e-mail de contato', 'email', 'ex.: contato@fornecedor.com'], ['telefone', 'telefone', 'tel', 'ex.: (11) 99999-9999'], ['categoria', 'categoria', 'select', ['materiais', 'tecnologia', 'logística', 'serviços']]] },
  setores: { numero: '05', title: 'cadastro de setores', eyebrow: 'estrutura / setores', description: 'organize a casa para as ideias circularem melhor.', fields: [['nome', 'nome do setor', 'text', 'ex.: produto'], ['responsavel', 'responsável', 'text', 'ex.: nome completo'], ['localizacao', 'localização', 'text', 'ex.: bloco a'], ['status', 'status', 'select', ['ativo', 'em implantação', 'inativo']]] },
  usuarios: { numero: '06', title: 'cadastro de usuários', eyebrow: 'acessos / usuários', description: 'permissões claras, rotina mais tranquila.', fields: [['nome', 'nome completo', 'text', 'ex.: nome do usuário'], ['email', 'e-mail de acesso', 'email', 'ex.: usuario@plume.com'], ['perfil', 'perfil', 'select', ['administrador', 'editor', 'visualizador']], ['senha', 'senha provisória', 'password', 'mínimo de 6 caracteres']] },
  equipamentos: { numero: '07', title: 'cadastro de equipamentos', eyebrow: 'inventário / equipamentos', description: 'saiba o que existe, onde está e como está.', fields: [['nome', 'nome do equipamento', 'text', 'ex.: notebook dell'], ['patrimonio', 'número de patrimônio', 'text', 'ex.: PAT-2026'], ['setor', 'setor responsável', 'select', ['ti', 'produção', 'administrativo', 'manutenção']], ['status', 'status', 'select', ['disponível', 'em uso', 'manutenção']]] },
}

function validEmail(value) { return /\S+@\S+\.\S+/.test(value) }
function validPhone(value) { return value.replace(/\D/g, '').length >= 10 }

function CadastroPage({ tipo, onNavigate }) {
  const config = catalogo[tipo] || catalogo.funcionarios
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
      if (type === 'email' && valores[key] && !validEmail(valores[key])) novosErros[key] = 'digite um e-mail válido'
      if (type === 'tel' && valores[key] && !validPhone(valores[key])) novosErros[key] = 'digite um telefone válido'
      if (type === 'password' && valores[key] && valores[key].length < 6) novosErros[key] = 'use pelo menos 6 caracteres'
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
      <div className="page-intro">
        <div><span className="eyebrow"><span className="eyebrow-line" /> {config.eyebrow}</span><h1>{config.title}</h1><p>{config.description}</p></div>
        <div className="step-badge"><strong>{config.numero}</strong><span>de 07<br />cadastros</span></div>
      </div>
      <div className="form-layout">
        <div className="form-card glass-card">
          <div className="card-heading"><div><span className="mini-label">dados principais</span><h2>vamos criar esse registro.</h2></div><span className="required-note">* campos obrigatórios</span></div>
          {mensagem && <div className="success-feedback" role="status"><span className="success-mark">✓</span><div><strong>tudo certo por aqui.</strong><span>{mensagem}</span></div><button type="button" onClick={() => setMensagem('')} aria-label="Fechar mensagem">×</button></div>}
          <form onSubmit={salvar} noValidate>
            <div className="form-grid">
              {config.fields.map(([key, label, type, extra]) => <Field key={key} name={key} label={label} type={type} placeholder={Array.isArray(extra) ? 'selecione uma opção' : extra} options={Array.isArray(extra) ? extra : null} value={valores[key]} error={erros[key]} onChange={atualizarCampo} />)}
            </div>
            <div className="form-footer"><span className="form-hint"><span className="hint-dot" /> seus dados ficam seguros neste protótipo.</span><div className="form-actions"><button type="button" className="button-ghost" onClick={limpar}>limpar</button><button type="submit" className="button-primary">{enviado ? 'salvo com sucesso' : 'cadastrar registro'} <span>→</span></button></div></div>
          </form>
        </div>
        <aside className="form-aside"><div className="aside-orbit"><span className="orbit-core">{config.numero}</span><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /></div><span className="aside-kicker">pequenos passos, grandes sistemas</span><p>um bom cadastro é quase uma conversa: pergunta o essencial, valida com cuidado e não faz drama quando você esquece um campo.</p><button type="button" onClick={() => onNavigate('inicio')}>voltar para visão geral <span>↗</span></button></aside>
      </div>
    </section>
  )
}

function Field({ name, label, type, placeholder, options, value, error, onChange }) {
  return <div className={`field ${error ? 'has-error' : ''}`}><label htmlFor={name}>{label}<span>*</span></label>{options ? <select id={name} name={name} value={value} onChange={onChange} aria-invalid={Boolean(error)}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} aria-invalid={Boolean(error)} />}{error && <small className="field-error">{error}</small>}</div>
}

export default CadastroPage
