import {
  CRITERIA,
  STATUS_LABEL,
  criterionStatus,
  formatValue,
  overallStatus,
  type Municipio,
  type StatusColors,
} from './criteria'

const ICON = { atende: '✓', nao_atende: '✗', sem_dados: '?' } as const

interface Props {
  municipio: Municipio
  colors: StatusColors
  onClose: () => void
}

export function DetailPanel({ municipio, colors, onClose }: Props) {
  const status = overallStatus(municipio)

  return (
    <div className="detail">
      <button className="detail-close" onClick={onClose} aria-label="Fechar">
        ×
      </button>
      <h2>
        {municipio.nome} <small>{municipio.uf}</small>
      </h2>
      <span className="badge" style={{ background: colors[status] }}>
        {STATUS_LABEL[status]}
      </span>
      <table>
        <thead>
          <tr>
            <th>Critério</th>
            <th>Valor</th>
            <th>Exigido</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {CRITERIA.map((c) => {
            const s = criterionStatus(c, municipio)
            return (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td>{formatValue(c, municipio[c.key])}</td>
                <td>{c.rule}</td>
                <td style={{ color: colors[s], fontWeight: 700 }}>{ICON[s]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {status === 'sem_dados' && (
        <p className="muted">
          Não falhou em nenhum critério com dado disponível, mas falta pelo menos um indicador
          (geralmente o Ideb, quando a rede municipal não tem nota publicada).
        </p>
      )}
    </div>
  )
}
