import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  CRITERIA,
  STATUS_COLOR,
  STATUS_LABEL,
  UFS,
  criterionStatus,
  overallStatus,
  type CriterionKey,
  type Dataset,
  type Municipio,
  type Status,
} from './criteria'
import { MapView, type Mesh } from './MapView'
import { DetailPanel } from './DetailPanel'

type ColorBy = 'geral' | CriterionKey
type StatusFilter = 'todos' | Status

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [mesh, setMesh] = useState<Mesh | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [colorBy, setColorBy] = useState<ColorBy>('geral')
  const [uf, setUf] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusIds, setFocusIds] = useState<string[] | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('data/indicadores.json').then((r) => r.json() as Promise<Dataset>),
      fetch('data/municipios.geojson').then((r) => r.json() as Promise<Mesh>),
    ])
      .then(([d, m]) => {
        setData(d)
        setMesh(m)
      })
      .catch((e: unknown) => setError(String(e)))
  }, [])

  const byId = useMemo(
    () => new Map((data?.municipios ?? []).map((m) => [m.id, m])),
    [data],
  )

  const statusOf = useCallback(
    (m: Municipio): Status => {
      if (colorBy === 'geral') return overallStatus(m)
      return criterionStatus(CRITERIA.find((c) => c.key === colorBy)!, m)
    },
    [colorBy],
  )

  const inScope = useMemo(
    () => (data?.municipios ?? []).filter((m) => !uf || m.uf === uf),
    [data, uf],
  )

  const counts = useMemo(() => {
    const c: Record<Status, number> = { atende: 0, nao_atende: 0, sem_dados: 0 }
    for (const m of inScope) c[statusOf(m)]++
    return c
  }, [inScope, statusOf])

  const failsByCriterion = useMemo(
    () =>
      CRITERIA.map((c) => ({
        c,
        fails: inScope.filter((m) => criterionStatus(c, m) === 'nao_atende').length,
      })),
    [inScope],
  )

  const visibleIds = useMemo(() => {
    if (!uf && statusFilter === 'todos') return null
    return new Set(
      inScope
        .filter((m) => statusFilter === 'todos' || statusOf(m) === statusFilter)
        .map((m) => m.id),
    )
  }, [inScope, uf, statusFilter, statusOf])

  const approved = useMemo(
    () =>
      inScope
        .filter((m) => overallStatus(m) === 'atende')
        .sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome)),
    [inScope],
  )

  const searchResults = useMemo(() => {
    const q = normalize(query.trim())
    if (q.length < 2) return []
    return inScope.filter((m) => normalize(m.nome).includes(q)).slice(0, 8)
  }, [inScope, query])

  const selectMunicipio = (id: string) => {
    setSelectedId(id)
    setFocusIds([id])
    setQuery('')
  }

  const changeUf = (next: string) => {
    setUf(next)
    setSelectedId(null)
    setFocusIds(next ? (data?.municipios ?? []).filter((m) => m.uf === next).map((m) => m.id) : null)
  }

  if (error) return <div className="loading">Erro ao carregar dados: {error}</div>
  if (!data || !mesh) return <div className="loading">Carregando 5.570 municípios…</div>

  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const total = inScope.length

  return (
    <div className="layout">
      <aside className="sidebar">
        <header>
          <h1>PL 5870/2026</h1>
          <p className="subtitle">
            Quais municípios poderiam contratar shows com dinheiro público pelos critérios do
            projeto de Kim Kataguiri (Missão-SP)
          </p>
          <p className="credit">
            Feito por{' '}
            <a
              href="https://www.linkedin.com/in/jorgejuniordeveloper/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Jorge Souza
            </a>
          </p>
        </header>

        <section className="counters">
          {(['atende', 'nao_atende', 'sem_dados'] as Status[]).map((s) => (
            <button
              key={s}
              className={`counter ${statusFilter === s ? 'active' : ''}`}
              style={{ borderColor: STATUS_COLOR[s] }}
              onClick={() => setStatusFilter(statusFilter === s ? 'todos' : s)}
              title="Clique para destacar só esse grupo no mapa"
            >
              <span className="counter-value" style={{ color: STATUS_COLOR[s] }}>
                {counts[s].toLocaleString('pt-BR')}
              </span>
              <span className="counter-label">{STATUS_LABEL[s]}</span>
              <span className="counter-pct">
                {total ? ((counts[s] / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : 0}%
              </span>
            </button>
          ))}
        </section>

        <section className="controls">
          <label>
            Colorir mapa por
            <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
              <option value="geral">Resultado geral (todos os 5 critérios)</option>
              {CRITERIA.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} ({c.rule})
                </option>
              ))}
            </select>
          </label>

          <label>
            Estado
            <select value={uf} onChange={(e) => changeUf(e.target.value)}>
              <option value="">Brasil inteiro</option>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>

          <div className="search">
            <input
              type="search"
              placeholder="Buscar município…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searchResults.length > 0 && (
              <ul className="search-results">
                {searchResults.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => selectMunicipio(m.id)}>
                      <span className="dot" style={{ background: STATUS_COLOR[overallStatus(m)] }} />
                      {m.nome} <small>{m.uf}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2>Onde os municípios mais falham</h2>
          <ul className="bars">
            {failsByCriterion.map(({ c, fails }) => (
              <li key={c.key}>
                <div className="bar-label">
                  <span>
                    {c.label} <small>{c.rule}</small>
                  </span>
                  <span>{fails.toLocaleString('pt-BR')}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${total ? (fails / total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="approved">
          <h2>Atendem aos 5 critérios ({approved.length})</h2>
          {approved.length === 0 ? (
            <p className="muted">Nenhum município {uf ? `em ${uf}` : ''} atende a todos os critérios.</p>
          ) : (
            <ul>
              {approved.map((m) => (
                <li key={m.id}>
                  <button onClick={() => selectMunicipio(m.id)}>
                    {m.nome} <small>{m.uf}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="sources">
          <h2>Fontes</h2>
          <ul>
            {CRITERIA.map((c) => (
              <li key={c.key}>
                <strong>{c.label}:</strong> {data.meta.fontes[c.key]}
              </li>
            ))}
          </ul>
          <p className="muted">
            Simulação com os dados oficiais mais recentes. O PL ainda não está em vigor e não
            define exatamente qual edição de cada indicador seria usada. Critérios que dependem
            da contratação (precatórios, orçamento, artista) não entram no mapa.
          </p>
        </footer>
      </aside>

      <main className="map-wrap">
        <MapView
          mesh={mesh}
          byId={byId}
          statusOf={statusOf}
          visibleIds={visibleIds}
          focusIds={focusIds}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="legend">
          {(['atende', 'nao_atende', 'sem_dados'] as Status[]).map((s) => (
            <span key={s}>
              <span className="dot" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
        {selected && <DetailPanel municipio={selected} onClose={() => setSelectedId(null)} />}
      </main>
    </div>
  )
}
