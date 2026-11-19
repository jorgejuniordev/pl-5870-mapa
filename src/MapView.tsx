import { useEffect, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type LngLatBoundsLike,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { STATUS_COLOR, type Municipio, type Status } from './criteria'

setWorkerUrl(workerUrl)

type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
export type MeshFeature = { type: 'Feature'; properties: { id: string }; geometry: Geometry }
export type Mesh = { type: 'FeatureCollection'; features: MeshFeature[] }

interface Props {
  mesh: Mesh
  byId: Map<string, Municipio>
  statusOf: (m: Municipio) => Status
  visibleIds: Set<string> | null
  focusIds: string[] | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

const BRAZIL_BOUNDS: LngLatBoundsLike = [
  [-74, -34],
  [-34.7, 5.3],
]

function bboxOf(features: MeshFeature[]): LngLatBoundsLike | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (c: unknown): void => {
    if (typeof (c as number[])[0] === 'number') {
      const [x, y] = c as number[]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      return
    }
    for (const child of c as unknown[]) visit(child)
  }
  for (const f of features) visit(f.geometry.coordinates)
  if (!Number.isFinite(minX)) return null
  return [
    [minX, minY],
    [maxX, maxY],
  ]
}

export function MapView({ mesh, byId, statusOf, visibleIds, focusIds, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const prevSelected = useRef<string | null>(null)
  const onSelectRef = useRef(onSelect)
  const byIdRef = useRef(byId)

  useEffect(() => {
    onSelectRef.current = onSelect
    byIdRef.current = byId
  }, [onSelect, byId])

  useEffect(() => {
    if (!container.current) return
    const map = new MapLibreMap({
      container: container.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8eef3' } }],
      },
      bounds: BRAZIL_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { customAttribution: 'Malha: IBGE' },
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 8 })

    map.on('load', () => {
      map.addSource('mun', { type: 'geojson', data: mesh as never, promoteId: 'id' })
      map.addLayer({
        id: 'mun-fill',
        type: 'fill',
        source: 'mun',
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['feature-state', 'status'], 'sem_dados'],
            'atende', STATUS_COLOR.atende,
            'nao_atende', STATUS_COLOR.nao_atende,
            STATUS_COLOR.sem_dados,
          ],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hidden'], false], 0.08, 0.85],
        },
      })
      map.addLayer({
        id: 'mun-line',
        type: 'line',
        source: 'mun',
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.1, 8, 0.6] },
      })
      map.addLayer({
        id: 'mun-selected',
        type: 'line',
        source: 'mun',
        paint: {
          'line-color': '#111827',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0],
        },
      })
      setReady(true)
    })

    map.on('mousemove', 'mun-fill', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined
      const m = id ? byIdRef.current.get(id) : undefined
      if (!m) return
      map.getCanvas().style.cursor = 'pointer'
      popup.setLngLat(e.lngLat).setText(`${m.nome} (${m.uf})`).addTo(map)
    })
    map.on('mouseleave', 'mun-fill', () => {
      map.getCanvas().style.cursor = ''
      popup.remove()
    })
    map.on('click', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['mun-fill'] })[0]
      onSelectRef.current((f?.properties?.id as string) ?? null)
    })

    return () => {
      setReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [mesh])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const f of mesh.features) {
      const m = byId.get(f.properties.id)
      map.setFeatureState(
        { source: 'mun', id: f.properties.id },
        {
          status: m ? statusOf(m) : 'sem_dados',
          hidden: visibleIds ? !visibleIds.has(f.properties.id) : false,
        },
      )
    }
  }, [ready, mesh, byId, statusOf, visibleIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (prevSelected.current) {
      map.setFeatureState({ source: 'mun', id: prevSelected.current }, { selected: false })
    }
    if (selectedId) map.setFeatureState({ source: 'mun', id: selectedId }, { selected: true })
    prevSelected.current = selectedId
  }, [ready, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!focusIds) {
      map.fitBounds(BRAZIL_BOUNDS, { padding: 20 })
      return
    }
    const ids = new Set(focusIds)
    const bounds = bboxOf(mesh.features.filter((f) => ids.has(f.properties.id)))
    if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 10 })
  }, [ready, mesh, focusIds])

  return <div ref={container} className="map" />
}
