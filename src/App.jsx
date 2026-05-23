import React, { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCcw, TrendingUp, Database, AlertTriangle, RotateCcw } from 'lucide-react'
import { supabase } from './lib/supabase'

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
const DEFAULT_FILTER = '0'

const emptyFilters = {
  prestador: DEFAULT_FILTER,
  ambito: DEFAULT_FILTER,
  vigencia: DEFAULT_FILTER,
  moneda: DEFAULT_FILTER,
  archivo_origen: DEFAULT_FILTER,
  precio_desde: DEFAULT_FILTER,
  precio_hasta: DEFAULT_FILTER
}

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, 'es'))
}

function buildOptions(data) {
  return {
    prestador: unique(data.map((r) => r.prestador)),
    ambito: unique(data.map((r) => r.ambito)),
    vigencia: unique(data.map((r) => r.vigencia)),
    moneda: unique(data.map((r) => r.moneda)),
    archivo_origen: unique(data.map((r) => r.archivo_origen))
  }
}

function groupByCode(rows) {
  const map = new Map()
  rows.forEach((row) => {
    const key = row.codigo
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  })
  return map
}

function cheapest(rows) {
  const valid = rows.filter((r) => Number(r.precio) > 0)
  if (!valid.length) return null
  return [...valid].sort((a, b) => Number(a.precio) - Number(b.precio))[0]
}

function matchesLocalFilters(row, filters) {
  const exactFilters = ['prestador', 'ambito', 'vigencia', 'moneda', 'archivo_origen']
  const matchesExact = exactFilters.every((key) => filters[key] === DEFAULT_FILTER || String(row[key] || '') === filters[key])
  const price = Number(row.precio || 0)
  const minOk = filters.precio_desde === DEFAULT_FILTER || price >= Number(filters.precio_desde)
  const maxOk = filters.precio_hasta === DEFAULT_FILTER || price <= Number(filters.precio_hasta)
  return matchesExact && minOk && maxOk
}

export default function App() {
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [filterOptions, setFilterOptions] = useState(buildOptions([]))
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState('Supabase')
  const [message, setMessage] = useState('')
  const [increaseProvider, setIncreaseProvider] = useState('')
  const [percent, setPercent] = useState('')

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value || DEFAULT_FILTER }))
  }

  function resetFilters() {
    setQuery('')
    setFilters(emptyFilters)
  }

  async function loadFilterOptions() {
    try {
      const res = await fetch('/compiled_data.json')
      const data = await res.json()
      setFilterOptions(buildOptions(data))
    } catch (err) {
      console.warn('No se pudieron cargar las opciones locales de filtros', err)
    }
  }

  async function loadRows() {
    setLoading(true)
    setMessage('')
    try {
      if (supabase) {
        let request = supabase
          .from('vw_prestaciones_comparador')
          .select('*')
          .order('codigo', { ascending: true })
          .limit(10000)

        const term = query.trim()
        if (term) {
          request = request.or(`codigo.ilike.%${term}%,descripcion.ilike.%${term}%,prestador.ilike.%${term}%,ambito.ilike.%${term}%,archivo_origen.ilike.%${term}%`)
        }

        if (filters.prestador !== DEFAULT_FILTER) request = request.eq('prestador', filters.prestador)
        if (filters.ambito !== DEFAULT_FILTER) request = request.eq('ambito', filters.ambito)
        if (filters.vigencia !== DEFAULT_FILTER) request = request.eq('vigencia', filters.vigencia)
        if (filters.moneda !== DEFAULT_FILTER) request = request.eq('moneda', filters.moneda)
        if (filters.archivo_origen !== DEFAULT_FILTER) request = request.eq('archivo_origen', filters.archivo_origen)
        if (filters.precio_desde !== DEFAULT_FILTER) request = request.gte('precio', Number(filters.precio_desde))
        if (filters.precio_hasta !== DEFAULT_FILTER) request = request.lte('precio', Number(filters.precio_hasta))

        const { data, error } = await request
        if (error) throw error
        setRows(data || [])
        setSource('Supabase')
      } else {
        const res = await fetch('/compiled_data.json')
        const data = await res.json()
        const term = normalizeText(query)
        const filtered = data.filter((r) => {
          const matchesTerm = !term || normalizeText(`${r.codigo} ${r.descripcion} ${r.prestador} ${r.ambito} ${r.vigencia} ${r.archivo_origen}`).includes(term)
          return matchesTerm && matchesLocalFilters(r, filters)
        }).slice(0, 10000)
        setRows(filtered)
        setSource('JSON local')
      }
    } catch (err) {
      setMessage(`No se pudo consultar Supabase: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFilterOptions()
    loadRows()
  }, [])

  const providers = useMemo(() => filterOptions.prestador, [filterOptions])
  const grouped = useMemo(() => groupByCode(rows), [rows])
  const globalCheapest = useMemo(() => cheapest(rows), [rows])

  const activeFilters = useMemo(() => {
    return Object.entries(filters).filter(([, value]) => value !== DEFAULT_FILTER).length + (query.trim() ? 1 : 0)
  }, [filters, query])

  const matrix = useMemo(() => {
    return [...grouped.entries()]
      .map(([codigo, items]) => {
        const min = cheapest(items)
        return {
          codigo,
          descripcion: items[0]?.descripcion,
          opciones: items.length,
          masBarato: min,
          items: [...items].sort((a, b) => Number(a.precio) - Number(b.precio))
        }
      })
      .sort((a, b) => b.opciones - a.opciones || a.codigo.localeCompare(b.codigo))
      .slice(0, 200)
  }, [grouped])

  async function applyIncrease(e) {
    e.preventDefault()
    if (!increaseProvider || !percent) {
      setMessage('Elegí un prestador y un porcentaje.')
      return
    }
    if (!supabase) {
      setMessage('Para aplicar aumentos reales, configurá Supabase en .env.')
      return
    }
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('aumentar_precios_prestador', {
      p_prestador: increaseProvider,
      p_porcentaje: Number(percent)
    })
    setLoading(false)
    if (error) {
      setMessage(`Error al aumentar precios: ${error.message}`)
      return
    }
    setMessage(`Aumento aplicado: ${data} prestaciones actualizadas para ${increaseProvider}.`)
    await loadRows()
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Comparador prestacional</p>
          <h1>Buscador, matriz lógica y actualizador de precios</h1>
          <p className="lead">
            Consulta rápida por código, descripción o prestador. Identifica quién realiza cada prestación,
            cuál es la opción más barata y permite aumentos masivos por prestador.
          </p>
        </div>
        <div className="source"><Database size={18} /> Fuente: {source}</div>
      </section>

      <section className="panel filters">
        <div className="field grow">
          <label>Buscar prestación</label>
          <div className="searchbox">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej: 420101, consulta, terapia..." />
          </div>
        </div>

        <div className="field">
          <label>Prestador</label>
          <select value={filters.prestador} onChange={(e) => setFilter('prestador', e.target.value)}>
            <option value="0">0 - Todos</option>
            {filterOptions.prestador.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Ámbito / tipo</label>
          <select value={filters.ambito} onChange={(e) => setFilter('ambito', e.target.value)}>
            <option value="0">0 - Todos</option>
            {filterOptions.ambito.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Vigencia</label>
          <select value={filters.vigencia} onChange={(e) => setFilter('vigencia', e.target.value)}>
            <option value="0">0 - Todas</option>
            {filterOptions.vigencia.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Moneda</label>
          <select value={filters.moneda} onChange={(e) => setFilter('moneda', e.target.value)}>
            <option value="0">0 - Todas</option>
            {filterOptions.moneda.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="field wide">
          <label>Archivo / convenio</label>
          <select value={filters.archivo_origen} onChange={(e) => setFilter('archivo_origen', e.target.value)}>
            <option value="0">0 - Todos</option>
            {filterOptions.archivo_origen.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="field priceField">
          <label>Precio desde</label>
          <input type="number" step="0.01" min="0" value={filters.precio_desde} onChange={(e) => setFilter('precio_desde', e.target.value)} />
        </div>

        <div className="field priceField">
          <label>Precio hasta</label>
          <input type="number" step="0.01" min="0" value={filters.precio_hasta} onChange={(e) => setFilter('precio_hasta', e.target.value)} />
        </div>

        <button onClick={loadRows} disabled={loading}><RefreshCcw size={18} /> Buscar</button>
        <button className="secondary" onClick={resetFilters} disabled={loading}><RotateCcw size={18} /> Reset 0</button>
      </section>

      <p className="filterHelp">Todos los filtros inician en <strong>0</strong>. Ese valor significa “sin filtro aplicado”. Filtros activos: <strong>{activeFilters}</strong>.</p>

      {message && <div className="notice"><AlertTriangle size={18} /> {message}</div>}

      <section className="kpis">
        <article><span>Registros encontrados</span><strong>{rows.length.toLocaleString('es-AR')}</strong></article>
        <article><span>Códigos distintos</span><strong>{grouped.size.toLocaleString('es-AR')}</strong></article>
        <article><span>Prestadores</span><strong>{providers.length}</strong></article>
        <article><span>Más barata del filtro</span><strong>{globalCheapest ? money.format(globalCheapest.precio) : '-'}</strong><small>{globalCheapest?.prestador}</small></article>
      </section>

      <section className="panel">
        <div className="sectionTitle">
          <div>
            <h2>Matriz comparativa</h2>
            <p>Ordenada primero por prestaciones con más opciones comparables.</p>
          </div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Quién la hace</th>
                <th>Ámbito / Vigencia</th>
                <th>Más barata</th>
                <th>Comparación de precios</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.codigo}>
                  <td className="code">{row.codigo}</td>
                  <td>{row.descripcion}</td>
                  <td>{row.items.map((i) => i.prestador).join(' · ')}</td>
                  <td>{row.items.map((i) => `${i.ambito || 'General'} ${i.vigencia ? '(' + i.vigencia + ')' : ''}`).join(' · ')}</td>
                  <td className="cheap">
                    {row.masBarato?.prestador}<br />
                    <strong>{money.format(row.masBarato?.precio || 0)}</strong>
                  </td>
                  <td>
                    <div className="priceGrid">
                      {row.items.map((i) => (
                        <span key={`${i.id || i.codigo}-${i.prestador}-${i.ambito}-${i.archivo_origen}`} className={i.precio === row.masBarato?.precio ? 'best' : ''}>
                          {i.prestador}: {money.format(i.precio)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!matrix.length && <tr><td colSpan="6" className="empty">Sin resultados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel admin">
        <div>
          <p className="eyebrow">Administración</p>
          <h2>Aumentar precios por prestador</h2>
          <p>Aplica el porcentaje a todas las prestaciones del prestador indicado mediante la RPC de Supabase.</p>
        </div>
        <form onSubmit={applyIncrease}>
          <select value={increaseProvider} onChange={(e) => setIncreaseProvider(e.target.value)}>
            <option value="">Elegir prestador</option>
            {providers.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input type="number" step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="% aumento" />
          <button type="submit" disabled={loading}><TrendingUp size={18} /> Aplicar aumento</button>
        </form>
      </section>
    </main>
  )
}
