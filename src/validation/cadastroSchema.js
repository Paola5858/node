import { z } from 'zod'

function criarCampoSchema(label, type) {
  let schema = z.string().trim().min(1, `informe ${label}`)
  if (type === 'url') schema = schema.refine((value) => /^https?:\/\//.test(value), 'use uma URL iniciando com http:// ou https://')
  return schema
}

export function validarCadastro(config, valores, imagemSelecionada) {
  const shape = Object.fromEntries(config.fields.map(([key, label, type]) => [key, criarCampoSchema(label, type)]))
  const schema = z.object(shape).superRefine((dados, contexto) => {
    if (dados.dataFim && dados.dataInicio && dados.dataFim < dados.dataInicio) {
      contexto.addIssue({ code: z.ZodIssueCode.custom, path: ['dataFim'], message: 'a data final deve ser depois da inicial' })
    }
  })
  const resultado = schema.safeParse(valores)
  const erros = {}

  if (!resultado.success) {
    resultado.error.issues.forEach(({ path, message }) => {
      const campo = path[0]
      if (typeof campo === 'string' && !erros[campo]) erros[campo] = message
    })
  }
  if (config.imagemObrigatoria && !imagemSelecionada) erros.foto = 'selecione ou capture uma imagem'

  return erros
}
