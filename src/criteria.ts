export type CriterionKey = 'agua' | 'esgoto' | 'aps' | 'ideb' | 'favelas'

export interface Municipio {
  id: string
  nome: string
  uf: string
  agua: number | null
  esgoto: number | null
  aps: number | null
  ideb: number | null
  favelas: number | null
}

export interface Dataset {
  meta: { geradoEm: string; fontes: Record<CriterionKey, string> }
  municipios: Municipio[]
}

export type Status = 'atende' | 'nao_atende' | 'sem_dados'

export interface Criterion {
  key: CriterionKey
  label: string
  rule: string
  unit: '%' | ''
  passes: (v: number) => boolean
}

export const CRITERIA: Criterion[] = [
  { key: 'esgoto', label: 'Coleta de esgoto', rule: '≥ 90%', unit: '%', passes: (v) => v >= 90 },
  { key: 'agua', label: 'Água potável', rule: '≥ 90%', unit: '%', passes: (v) => v >= 90 },
  { key: 'aps', label: 'Atenção Primária à Saúde', rule: '≥ 80%', unit: '%', passes: (v) => v >= 80 },
  { key: 'ideb', label: 'Ideb anos iniciais (rede municipal)', rule: '≥ 7,0', unit: '', passes: (v) => v >= 7 },
  { key: 'favelas', label: 'População em favelas', rule: '< 5%', unit: '%', passes: (v) => v < 5 },
]

export function criterionStatus(c: Criterion, m: Municipio): Status {
  const v = m[c.key]
  if (v === null) return 'sem_dados'
  return c.passes(v) ? 'atende' : 'nao_atende'
}

// Any failed criterion is decisive; missing data only matters when nothing failed.
export function overallStatus(m: Municipio): Status {
  const statuses = CRITERIA.map((c) => criterionStatus(c, m))
  if (statuses.includes('nao_atende')) return 'nao_atende'
  if (statuses.includes('sem_dados')) return 'sem_dados'
  return 'atende'
}

export function formatValue(c: Criterion, v: number | null): string {
  if (v === null) return 'sem dado'
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${c.unit}`
}

export const STATUS_LABEL: Record<Status, string> = {
  atende: 'Atende',
  nao_atende: 'Não atende',
  sem_dados: 'Sem dados',
}

export const STATUS_COLOR: Record<Status, string> = {
  atende: '#16a34a',
  nao_atende: '#dc2626',
  sem_dados: '#9ca3af',
}

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE',
  'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]
