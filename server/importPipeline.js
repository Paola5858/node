import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'

const FIELD_ALIASES_BY_ENTITY = {
  measurements: {
  measured_at: ['measured_at', 'data', 'data_hora', 'data_hora_medicao', 'timestamp', 'date', 'datetime'],
  equipment: ['equipment', 'equipamento', 'instrumento'],
  indicator: ['indicator', 'indicador', 'variavel', 'tipo_informacao'],
  value: ['value', 'valor', 'valor_original', 'resultado'],
  unit_of_measure: ['unit_of_measure', 'unidade', 'unidade_medida', 'unidade_original', 'uom'],
  event_id: ['event_id', 'id_medicao', 'id_evento', 'ticket', 'ticket_id'],
  sync_status: ['sync_status', 'status_sincronizacao', 'status_sync', 'contingencia'],
  },
  loads: {
    external_reference: ['external_reference', 'referencia', 'id_carga', 'ticket', 'ticket_id', 'numero_carga'],
    weighed_at: ['weighed_at', 'data_pesagem', 'data_hora_pesagem', 'timestamp', 'date', 'datetime'],
    gross_weight: ['gross_weight', 'peso_bruto', 'bruto'],
    tare_weight: ['tare_weight', 'peso_tara', 'tara'],
    weight_unit: ['weight_unit', 'unidade_peso', 'unidade_de_peso'],
    supplier: ['supplier', 'fornecedor'],
    farm: ['farm', 'fazenda', 'propriedade'],
    plot: ['plot', 'talhao', 'talhao_codigo'],
    front: ['front', 'frente'],
    sync_status: ['sync_status', 'status_sincronizacao', 'status_sync', 'contingencia'],
  },
  quality_analyses: {
    sample_code: ['sample_code', 'codigo_amostra', 'amostra', 'id_amostra'],
    load_reference: ['load_reference', 'referencia_carga', 'id_carga', 'ticket', 'ticket_id'],
    indicator: ['indicator', 'indicador', 'variavel', 'tipo_informacao'],
    method: ['method', 'metodo', 'metodo_analitico'],
    measured_at: ['measured_at', 'data_coleta', 'data_hora', 'timestamp', 'date', 'datetime'],
    value: ['value', 'valor', 'valor_original', 'resultado'],
    unit_of_measure: ['unit_of_measure', 'unidade', 'unidade_medida', 'unidade_original', 'uom'],
    sync_status: ['sync_status', 'status_sincronizacao', 'status_sync', 'contingencia'],
  },
}
const REQUIRED_FIELDS_BY_ENTITY = {
  measurements: ['measured_at', 'equipment', 'indicator', 'value', 'unit_of_measure'],
  loads: ['external_reference', 'weighed_at', 'gross_weight', 'tare_weight'],
  quality_analyses: ['sample_code', 'indicator', 'measured_at', 'value', 'unit_of_measure'],
}

function cellText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result)
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text).join('')
    if ('text' in value) return String(value.text)
    return JSON.stringify(value)
  }
  return String(value).trim()
}

function splitDelimited(text, delimiter) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  let physicalLine = 1
  let rowStartLine = 1
  const appendRow = () => {
    if (row.some((cell) => cell.trim() !== '')) rows.push({ values: row, rowNumber: rowStartLine })
    row = []
    value = ''
  }
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"' && quoted && text[index + 1] === '"') {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (!quoted && character === delimiter) {
      row.push(value)
      value = ''
    } else if (quoted && (character === '\n' || character === '\r')) {
      value += character
      if (character === '\r' && text[index + 1] === '\n') {
        value += '\n'
        index += 1
      }
      physicalLine += 1
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value)
      appendRow()
      physicalLine += 1
      rowStartLine = physicalLine
    } else {
      value += character
    }
  }
  if (quoted) throw Object.assign(new Error('o CSV contém um campo entre aspas não finalizado.'), { status: 400 })
  row.push(value)
  appendRow()
  return rows
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const candidates = [';', ',', '\t']
  return candidates
    .map((delimiter) => {
      let quoted = false
      let count = 0
      for (let index = 0; index < firstLine.length; index += 1) {
        if (firstLine[index] === '"' && firstLine[index + 1] === '"') index += 1
        else if (firstLine[index] === '"') quoted = !quoted
        else if (!quoted && firstLine[index] === delimiter) count += 1
      }
      return { delimiter, count }
    })
    .sort((left, right) => right.count - left.count)[0].delimiter
}

function makeDocument(headers, dataRows, sheetNames, selectedSheet) {
  const cleanHeaders = headers.map((header) => String(header ?? '').trim().replace(/^\uFEFF/, ''))
  const headerKeys = cleanHeaders.filter(Boolean).map((header) => header.toLocaleLowerCase('pt-BR'))
  if (headerKeys.length !== new Set(headerKeys).size) {
    throw Object.assign(new Error('a planilha contém nomes de coluna duplicados.'), { status: 422 })
  }
  const rows = dataRows
    .filter(({ values }) => values.some((value) => String(value ?? '').trim() !== ''))
    .map(({ values, rowNumber }) => {
      const raw = Object.fromEntries(cleanHeaders.map((header, index) => [header || `coluna_${index + 1}`, values[index] ?? '']))
      const extraValues = values.slice(cleanHeaders.length)
      extraValues.forEach((value, index) => { raw[`__coluna_extra_${index + 1}`] = value })
      return { rowNumber, raw, fieldCount: values.length, extraColumnCount: extraValues.filter((value) => String(value ?? '').trim() !== '').length }
    })
  if (rows.length > 100_000) throw Object.assign(new Error('o arquivo excede o limite de 100.000 linhas.'), { status: 413 })
  return { headers: cleanHeaders, rows, sheetNames, selectedSheet }
}

async function parseXlsx(bytes, sheetName) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes)
  } catch (cause) {
    throw Object.assign(new Error('o arquivo XLSX está inválido ou corrompido.'), { status: 400, cause })
  }
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name)
  if (sheetNames.length === 0) throw Object.assign(new Error('o arquivo XLSX não contém abas.'), { status: 422 })
  const selectedSheet = sheetName || sheetNames[0]
  const worksheet = workbook.getWorksheet(selectedSheet)
  if (!worksheet) {
    throw Object.assign(new Error('a aba selecionada não existe no arquivo.'), { status: 400, sheetNames })
  }
  let headerRow = null
  let headerNumber = 0
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (!headerRow) {
      headerRow = row
      headerNumber = rowNumber
    }
  })
  if (!headerRow) throw Object.assign(new Error('a aba selecionada está vazia.'), { status: 422 })
  const headers = Array.from({ length: worksheet.columnCount }, (_, index) => cellText(headerRow.getCell(index + 1).value))
  const dataRows = []
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > headerNumber) dataRows.push({
      rowNumber,
      values: Array.from({ length: worksheet.columnCount }, (_, index) => cellText(row.getCell(index + 1).value)),
    })
  })
  return makeDocument(headers, dataRows, sheetNames, selectedSheet)
}

export async function parseImportFile(bytes, fileName, sheetName = '') {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw Object.assign(new Error('o arquivo está vazio.'), { status: 400 })
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  if (extension === '.xlsx') return parseXlsx(bytes, sheetName)
  if (extension !== '.csv') throw Object.assign(new Error('formato de arquivo não suportado.'), { status: 415 })
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '')
  const table = splitDelimited(text, detectDelimiter(text))
  if (table.length < 2) throw Object.assign(new Error('o CSV precisa conter cabeçalho e pelo menos uma linha de dados.'), { status: 422 })
  const [{ values: headers }, ...data] = table
  return makeDocument(headers, data, [], '')
}

function normalizedHeader(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function suggestColumnMapping(headers, entityType = 'measurements') {
  const fieldAliases = FIELD_ALIASES_BY_ENTITY[entityType]
  if (!fieldAliases) throw Object.assign(new Error('entidade de importação não suportada.'), { status: 400 })
  const normalized = headers.map((header) => [normalizedHeader(header), header])
  return Object.fromEntries(Object.entries(fieldAliases).map(([field, aliases]) => {
    const match = normalized.find(([header]) => aliases.some((alias) => normalizedHeader(alias) === header))
    return [field, match?.[1] || '']
  }))
}

export function validateColumnMapping(mapping, headers, entityType = 'measurements') {
  const fieldAliases = FIELD_ALIASES_BY_ENTITY[entityType]
  const requiredFields = REQUIRED_FIELDS_BY_ENTITY[entityType]
  if (!fieldAliases || !requiredFields) return 'entidade de importação não suportada.'
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return 'mapeamento de colunas inválido.'
  for (const field of requiredFields) {
    if (typeof mapping[field] !== 'string' || !headers.includes(mapping[field])) {
      return `mapeie a coluna ${field} para uma coluna existente.`
    }
  }
  const selected = requiredFields.map((field) => mapping[field])
  if (new Set(selected).size !== selected.length) return 'cada campo obrigatório deve usar uma coluna diferente.'
  for (const [field, header] of Object.entries(mapping)) {
    if (!Object.hasOwn(fieldAliases, field)) return `campo de mapeamento não suportado: ${field}.`
    if (header !== '' && (typeof header !== 'string' || !headers.includes(header))) {
      return `a coluna mapeada para ${field} não existe no arquivo.`
    }
  }
  return null
}

export function parseNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = String(value ?? '').trim().replace(/\s/g, '')
  if (!text) return null
  if (!/^[+-]?(?:\d+(?:[.,]\d+)*|[.,]\d+)$/.test(text)) return null
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    const thousands = decimal === ',' ? /\./g : /,/g
    text = text.replace(thousands, '').replace(decimal, '.')
  } else if (comma >= 0) {
    text = text.replace(',', '.')
  }
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

export function parseMeasuredAt(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  const text = String(value ?? '').trim()
  const localDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text)
  if (localDate) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = localDate
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
    if (date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)) return date
    return null
  }
  const date = new Date(text)
  return Number.isFinite(date.getTime()) ? date : null
}

export function rowHash(row) {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex')
}

export const IMPORT_FIELDS = Object.freeze(Object.values(FIELD_ALIASES_BY_ENTITY).flatMap((fields) => Object.keys(fields)))
export const IMPORT_ENTITY_TYPES = Object.freeze(Object.keys(REQUIRED_FIELDS_BY_ENTITY))
export const IMPORT_QUEUES = Object.freeze(['Aceitos', 'Rejeitados', 'Suspeitos', 'Pendentes'])
