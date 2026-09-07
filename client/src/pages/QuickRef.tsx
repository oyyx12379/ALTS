import { useState, useEffect } from 'react'
import { parseRules } from '../api'

type Tab = 'actions' | 'buffs' | 'debuffs' | 'terrains'

export default function QuickRef() {
  const [tab, setTab] = useState<Tab>('actions')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    parseRules()
      .then(d => setData(d.combatQuickRef || d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'actions', label: '主动动作', icon: '⚔️' },
    { key: 'buffs', label: '正面状态', icon: '🟢' },
    { key: 'debuffs', label: '负面状态', icon: '🔴' },
    { key: 'terrains', label: '地形效果', icon: '🗺' },
  ]

  const renderTable = (items: any[], nameCol: string = 'name', effectCol: string = 'effect', extraCols: string[] = []) => {
    if (!items || items.length === 0) return <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>暂无数据</p>
    return (
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              {extraCols.map(c => <th key={c}>{c}</th>)}
              <th>效果</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, i: number) => {
              const name = typeof item === 'string' ? item : (item[nameCol] || item.name || '')
              const effect = typeof item === 'string' ? '' : (item[effectCol] || item.effect || '')
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{name}</td>
                  {extraCols.map(c => <td key={c}>{item[c] || ''}</td>)}
                  <td style={{ fontSize: 13, lineHeight: 1.5 }}>{effect}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      <div className="top-header">
        <span className="page-title">📋 战斗速查</span>
        <div className="spacer" />
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button key={t.key} className={`btn btn-sm ${tab === t.key ? 'btn-primary' : ''}`}
              onClick={() => setTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div className="loading-page"><div className="spinner"/><span>加载速查数据...</span></div>
        ) : (
          <div className="card">
            {tab === 'actions' && (
              <>
                <h2 style={{ marginBottom: 16 }}>⚔️ 主动动作 & 反应动作</h2>
                {renderTable(data?.actions || [], 'name', 'effect', ['cost', 'condition'])}
              </>
            )}
            {tab === 'buffs' && (
              <>
                <h2 style={{ marginBottom: 16 }}>🟢 正面状态效果</h2>
                {renderTable(data?.buffs || [])}
              </>
            )}
            {tab === 'debuffs' && (
              <>
                <h2 style={{ marginBottom: 16 }}>🔴 负面状态效果</h2>
                {renderTable(data?.debuffs || [])}
              </>
            )}
            {tab === 'terrains' && (
              <>
                <h2 style={{ marginBottom: 16 }}>🗺 地形效果</h2>
                {renderTable(data?.terrains || [])}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
