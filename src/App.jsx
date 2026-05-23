import React, { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCcw, TrendingUp, Database, AlertTriangle } from 'lucide-react'
import { supabase } from './lib/supabase'

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
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

export default function App() {
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState('Todos')
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState('Supabase')
  const [message, setMessage] = useState('')
  const [increaseProvider, setIncreaseProvider] = useState('')
  const [percent, setPercent] = useState('')

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
          request = request.or(`codigo.ilike.%${term}%,descripcion.ilike.%${term}%,prestador.ilike.%${term}%`)
        }
        if (provider !== 'Todos') request = request.eq('prestador', provider)

        const { data, error } = await request
        if (error) throw error
        setRows(data || [])
        setSource('Supabase')
      } else {
        const res = await fetch('/compiled_data.json')
        const data = await res.json()
        const term = normalizeText(query)
        const filtered = data.filter((r) => {
          const matchesTerm = !term || normalizeText(`${r.codigo} ${r.descripcion} ${r.prestador} ${r.ambito}`).includes(term)
          const matchesProvider = provider === 'Todos' || r.prestador === provider
          return matchesTerm && matchesProvider
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

  useEffect(() => { loadRows() }, [])

  const providers = useMemo(() => unique(rows.map((r) => r.prestador)), [rows])
  const grouped = useMemo(() => groupByCode(rows), [rows])
  const globalCheapest = useMemo(() => cheapest(rows), [rows])

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
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option>Todos</option>
            {providers.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <button onClick={loadRows} disabled={loading}><RefreshCcw size={18} /> Buscar</button>
      </section>

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
                        <span key={`${i.id || i.codigo}-${i.prestador}-${i.ambito}`} className={i.precio === row.masBarato?.precio ? 'best' : ''}>
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
