import { useState, useEffect } from 'react'
import { getRulesRaces, getRulesCombatClasses, getRulesArts, getRulesTraits } from '../api'

type Tab = 'races' | 'classes' | 'arts' | 'traits'

export default function Rulebook() {
  const [tab, setTab] = useState<Tab>('races')
  const [races, setRaces] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [arts, setArts] = useState<any[]>([])
  const [traits, setTraits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getRulesRaces().catch(() => []),
      getRulesCombatClasses().catch(() => []),
      getRulesArts().catch(() => []),
      getRulesTraits().catch(() => []),
    ]).then(([r, c, a, t]) => {
      setRaces(r); setClasses(c); setArts(a); setTraits(t)
    }).finally(() => setLoading(false))
  }, [])

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'races', label: '种族', icon: '🏷' },
    { key: 'classes', label: '战斗职业', icon: '⚔️' },
    { key: 'arts', label: '源石技艺', icon: '✨' },
    { key: 'traits', label: '特质', icon: '📋' },
  ]

  return (
    <>
      <div className="top-header">
        <span className="page-title">📖 规则书</span>
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
          <div className="loading-page"><div className="spinner"/><span>加载规则数据...</span></div>
        ) : (
          <>
            {/* === Races === */}
            {tab === 'races' && (
              <div>
                <h2 style={{ marginBottom: 16 }}>种族 ({races.length})</h2>
                {races.length === 0 ? (
                  <div className="card"><p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                    请先运行 npm run db:seed 导入规则数据
                  </p></div>
                ) : (
                  <div className="grid-2">
                    {races.map((race: any) => {
                      let bonuses: any = {}
                      try { bonuses = JSON.parse(race.attrBonuses || '{}') } catch {}
                      return (
                        <div key={race.id} className="card">
                          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{race.name}</h3>
                          {race.description && (
                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6, maxHeight: 80, overflow: 'hidden' }}>
                              {race.description.slice(0, 150)}{race.description.length > 150 ? '...' : ''}
                            </p>
                          )}
                          {Object.keys(bonuses).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {Object.entries(bonuses).map(([k, v]: any) => (
                                <span key={k} className={`badge ${v > 0 ? 'badge-green' : v < 0 ? 'badge-red' : 'badge-blue'}`}>
                                  {k} {v > 0 ? '+' : ''}{v}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* === Combat Classes === */}
            {tab === 'classes' && (
              <div>
                <h2 style={{ marginBottom: 16 }}>战斗职业 ({classes.length})</h2>
                {classes.length === 0 ? (
                  <div className="card"><p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                    请先运行 npm run db:seed 导入规则数据
                  </p></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {classes.map((cls: any) => (
                      <details key={cls.id} className="card" style={{ cursor: 'pointer' }}>
                        <summary style={{ fontWeight: 700, fontSize: 16, padding: '8px 0' }}>
                          {cls.name} · {cls.branch}
                          <span className="badge badge-blue" style={{ marginLeft: 8 }}>{cls.engName}</span>
                        </summary>
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                            <strong>分支特性：</strong>{cls.branchTrait}
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            <strong>武器：</strong>{cls.weaponType}
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                            <strong>SP回复：</strong>{cls.spRecovery}
                          </p>
                          {(() => {
                            let phases: any[] = []
                            try { phases = JSON.parse(cls.phases || '[]') } catch {}
                            return phases.map((phase: any, pi: number) => (
                              <div key={pi} style={{ marginBottom: 12, background: 'var(--bg-panel)', padding: 12, borderRadius: 8 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-orange)', marginBottom: 8 }}>
                                  {phase.name}
                                </h4>
                                {phase.talent?.name && (
                                  <p style={{ fontSize: 13, marginBottom: 8 }}>
                                    <strong>天赋 · {phase.talent.name}：</strong>{phase.talent.effect}
                                  </p>
                                )}
                                {phase.skills?.map((skill: any, si: number) => (
                                  <div key={si} style={{ fontSize: 12, marginBottom: 4, padding: '4px 8px', background: 'var(--bg-card)', borderRadius: 4 }}>
                                    <strong>{skill.name}</strong>
                                    {skill.actionCost && ` · ${skill.actionCost}`}
                                    {skill.spCost > 0 && ` · ${skill.spCost}SP`}
                                    {skill.effect && <span style={{ color: 'var(--text-secondary)' }}> — {skill.effect.slice(0, 100)}</span>}
                                  </div>
                                ))}
                              </div>
                            ))
                          })()}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* === Arts === */}
            {tab === 'arts' && (
              <div>
                <h2 style={{ marginBottom: 16 }}>源石技艺</h2>
                {arts.length === 0 ? (
                  <div className="card"><p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                    请先运行 npm run db:seed 导入规则数据
                  </p></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(() => {
                      const schools = [...new Set(arts.map((a: any) => a.school))]
                      return schools.map(school => {
                        const spells = arts.filter((a: any) => a.school === school)
                        const byPhase: Record<string, any[]> = {}
                        spells.forEach((s: any) => {
                          if (!byPhase[s.phase]) byPhase[s.phase] = []
                          byPhase[s.phase].push(s)
                        })
                        return (
                          <details key={school} className="card" style={{ cursor: 'pointer' }}>
                            <summary style={{ fontWeight: 700, fontSize: 16 }}>
                              {school} <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>({spells.length}个法术)</span>
                            </summary>
                            <div style={{ marginTop: 12 }}>
                              {Object.entries(byPhase).map(([phase, phaseSpells]) => (
                                <div key={phase} style={{ marginBottom: 12 }}>
                                  <h4 style={{ fontSize: 13, color: 'var(--color-orange)', marginBottom: 6 }}>{phase}</h4>
                                  {phaseSpells.map((spell: any) => (
                                    <div key={spell.id || spell.name} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--bg-panel)', borderRadius: 4, marginBottom: 4 }}>
                                      <strong>{spell.name}</strong>
                                      {spell.spCost > 0 && <span className="badge badge-orange" style={{ marginLeft: 8 }}>{spell.spCost}SP</span>}
                                      {spell.effect && <span style={{ color: 'var(--text-secondary)' }}> — {spell.effect.slice(0, 120)}</span>}
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </details>
                        )
                      })
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* === Traits === */}
            {tab === 'traits' && (
              <div>
                <h2 style={{ marginBottom: 16 }}>特质数据库 ({traits.length})</h2>
                {traits.length === 0 ? (
                  <div className="card"><p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                    请先运行 npm run db:seed 导入规则数据
                  </p></div>
                ) : (
                  <div className="grid-2">
                    {traits.map((trait: any) => (
                      <div key={trait.id} className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700 }}>{trait.name}</span>
                          {trait.cost > 0 && <span className="badge badge-orange">{trait.cost}pt</span>}
                          {trait.cost < 0 && <span className="badge badge-green">+{-trait.cost}pt</span>}
                          {trait.category && <span className="badge badge-blue">{trait.category}</span>}
                        </div>
                        {trait.effect && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{trait.effect}</p>}
                        {trait.description && (
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {trait.description.slice(0, 120)}{trait.description.length > 120 ? '...' : ''}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
