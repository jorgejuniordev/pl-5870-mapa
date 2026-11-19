import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import * as XLSX from 'xlsx'

const ROOT = path.resolve(import.meta.dirname, '..')
const RAW_DIR = path.join(ROOT, 'data-raw')
const OUT_DIR = path.join(ROOT, 'public', 'data')

const SIDRA = 'https://apisidra.ibge.gov.br/values'
const IDEB_ZIP_URL =
  'https://download.inep.gov.br/ideb/resultados/divulgacao_anos_iniciais_municipios_2025.zip'
const MESH_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima'
const APS_URL = 'https://relatorioaps-prd.saude.gov.br/cobertura/aps'

const UF_CODES = [
  11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 35, 41, 42, 43, 50,
  51, 52, 53,
]

type SidraRow = Record<string, string>

async function fetchJson<T>(url: string, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
      return (await res.json()) as T
    } catch (err) {
      if (i >= attempts) throw err
      console.warn(`  retry ${i} ${url}`)
      await new Promise((r) => setTimeout(r, 2000 * i))
    }
  }
}

async function sidra(query: string): Promise<SidraRow[]> {
  const rows = await fetchJson<SidraRow[]>(`${SIDRA}/${query}`)
  return rows.slice(1)
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function round(n: number | null, digits = 2): number | null {
  if (n === null) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

async function exists(p: string) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function loadMunicipios() {
  console.log('Municípios (IBGE localidades)')
  const list = await fetchJson<
    { id: number; nome: string; microrregiao: { mesorregiao: { UF: { sigla: string } } } | null; 'regiao-imediata'?: { 'regiao-intermediaria': { UF: { sigla: string } } } }[]
  >('https://servicodados.ibge.gov.br/api/v1/localidades/municipios')
  return list.map((m) => ({
    id: String(m.id),
    nome: m.nome,
    uf:
      m.microrregiao?.mesorregiao.UF.sigla ??
      m['regiao-imediata']?.['regiao-intermediaria'].UF.sigla ??
      '',
  }))
}

async function loadAgua() {
  console.log('Água (SIDRA 6894)')
  const rows = await sidra(
    't/6894/n6/all/v/382/p/2022/c1821/72129,72144,72145/c58/95253/c86/95251',
  )
  const acc = new Map<string, { total: number; rede: number }>()
  for (const r of rows) {
    const cur = acc.get(r.D1C) ?? { total: 0, rede: 0 }
    const v = toNumber(r.V) ?? 0
    if (r.D4C === '72129') cur.total = v
    else cur.rede += v
    acc.set(r.D1C, cur)
  }
  return new Map([...acc].map(([id, { total, rede }]) => [id, total ? (rede / total) * 100 : null]))
}

async function loadEsgoto() {
  console.log('Esgoto (SIDRA 7555)')
  const rows = await sidra('t/7555/n6/all/v/382/p/2022/c11558/46292,46290/c58/95253/c86/95251')
  const acc = new Map<string, { total: number; rede: number }>()
  for (const r of rows) {
    const cur = acc.get(r.D1C) ?? { total: 0, rede: 0 }
    const v = toNumber(r.V) ?? 0
    if (r.D4C === '46292') cur.total = v
    else cur.rede = v
    acc.set(r.D1C, cur)
  }
  return new Map([...acc].map(([id, { total, rede }]) => [id, total ? (rede / total) * 100 : null]))
}

async function loadFavelas() {
  console.log('População (SIDRA 4709) e favelas (SIDRA 9887)')
  const pop = new Map(
    (await sidra('t/4709/n6/all/v/93/p/2022')).map((r) => [r.D1C, toNumber(r.V)]),
  )
  const fav = new Map(
    (await sidra('t/9887/n6/all/v/9612/p/2022/c3/59993')).map((r) => [r.D1C, toNumber(r.V) ?? 0]),
  )
  const out = new Map<string, number | null>()
  for (const [id, p] of pop) {
    if (!p) {
      out.set(id, null)
      continue
    }
    out.set(id, ((fav.get(id) ?? 0) / p) * 100)
  }
  return out
}

async function loadAps() {
  console.log('Atenção Primária (relatorioaps)')
  const now = new Date()
  let competencia = ''
  const out = new Map<string, number | null>()

  for (let back = 1; back <= 12 && !competencia; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const comp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    const probe = await fetchJson<unknown[]>(
      `${APS_URL}?unidadeGeografica=MUNICIPIO&nuCompInicio=${comp}&nuCompFim=${comp}&coUf=53`,
    )
    if (probe.length) competencia = comp
  }
  if (!competencia) throw new Error('Nenhuma competência de APS disponível nos últimos 12 meses')
  console.log(`  competência ${competencia}`)

  for (const uf of UF_CODES) {
    const rows = await fetchJson<{ coMunicipioIbge: string; qtCobertura: number }[]>(
      `${APS_URL}?unidadeGeografica=MUNICIPIO&nuCompInicio=${competencia}&nuCompFim=${competencia}&coUf=${uf}`,
    )
    for (const r of rows) out.set(r.coMunicipioIbge, toNumber(r.qtCobertura))
  }
  return {
    byId6: out,
    competencia: `${competencia.slice(4)}/${competencia.slice(0, 4)}`,
  }
}

async function loadIdeb() {
  console.log('Ideb 2025 anos iniciais, rede municipal (Inep)')
  const zip = path.join(RAW_DIR, 'ideb_ai_municipios_2025.zip')
  if (!(await exists(zip))) {
    const res = await fetch(IDEB_ZIP_URL, { signal: AbortSignal.timeout(300_000) })
    if (!res.ok) throw new Error(`Ideb HTTP ${res.status}`)
    await writeFile(zip, Buffer.from(await res.arrayBuffer()))
  }
  const xlsxBuf = execFileSync('unzip', ['-p', zip, '*.xlsx'], { maxBuffer: 512 * 1024 * 1024 })
  const wb = XLSX.read(xlsxBuf)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
  })
  const headerIdx = rows.findIndex((r) => r[1] === 'CO_MUNICIPIO')
  const header = rows[headerIdx] as string[]
  const col = (name: string) => header.indexOf(name)
  const cId = col('CO_MUNICIPIO')
  const cRede = col('REDE')
  const c2025 = col('VL_OBSERVADO_2025')

  const out = new Map<string, number | null>()
  for (const r of rows.slice(headerIdx + 1)) {
    if (r[cRede] !== 'Municipal' || r[cId] == null) continue
    out.set(String(r[cId]), toNumber(r[c2025]))
  }
  return out
}

async function loadMesh() {
  console.log('Malha municipal (IBGE)')
  const cache = path.join(RAW_DIR, 'malha_municipios.json')
  if (await exists(cache)) return JSON.parse(await readFile(cache, 'utf8'))
  const mesh = await fetchJson<unknown>(MESH_URL)
  await writeFile(cache, JSON.stringify(mesh))
  return mesh
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true })
  await mkdir(OUT_DIR, { recursive: true })

  const municipios = await loadMunicipios()
  const agua = await loadAgua()
  const esgoto = await loadEsgoto()
  const favelas = await loadFavelas()
  const aps = await loadAps()
  const ideb = await loadIdeb()
  const mesh = (await loadMesh()) as {
    type: string
    features: { properties: Record<string, unknown> }[]
  }

  const indicadores = municipios.map((m) => ({
    id: m.id,
    nome: m.nome,
    uf: m.uf,
    agua: round(agua.get(m.id) ?? null),
    esgoto: round(esgoto.get(m.id) ?? null),
    aps: round(aps.byId6.get(m.id.slice(0, 6)) ?? null),
    ideb: round(ideb.get(m.id) ?? null, 1),
    favelas: round(favelas.get(m.id) ?? null),
  }))

  for (const f of mesh.features) {
    f.properties = { id: String(f.properties.codarea) }
  }

  const meta = {
    geradoEm: new Date().toISOString(),
    fontes: {
      agua: 'IBGE, Censo 2022, SIDRA 6894: moradores com ligação à rede geral de água',
      esgoto: 'IBGE, Censo 2022, SIDRA 7555: moradores com rede geral, pluvial ou fossa ligada à rede',
      aps: `Ministério da Saúde, Cobertura Potencial da APS, competência ${aps.competencia}`,
      ideb: 'Inep, Ideb 2025, anos iniciais, rede municipal',
      favelas: 'IBGE, Censo 2022, SIDRA 9887 (favelas) ÷ SIDRA 4709 (população residente)',
    },
  }

  await writeFile(path.join(OUT_DIR, 'indicadores.json'), JSON.stringify({ meta, municipios: indicadores }))
  await writeFile(path.join(OUT_DIR, 'municipios.geojson'), JSON.stringify(mesh))

  const missing = (k: keyof (typeof indicadores)[number]) =>
    indicadores.filter((i) => i[k] === null).length
  console.log(
    `OK: ${indicadores.length} municípios. Sem dado: água ${missing('agua')}, esgoto ${missing('esgoto')}, APS ${missing('aps')}, Ideb ${missing('ideb')}, favelas ${missing('favelas')}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
