import { useEffect, useMemo, useState } from 'react'
import type {
  Hero,
  HeroId,
  Position,
  RecommendationRequestPayload,
  RecommendationResponse,
  RecommendationResult,
  RiskMode,
  Scenario,
  TargetRole
} from '@d2bp/shared'
import './styles/app.css'

type DraftSide = 'ally' | 'enemy'

interface DraftSlot {
  hero: Hero | null
  roleOverride: Position | null
}

interface DraftState {
  ally: DraftSlot[]
  enemy: DraftSlot[]
  activeSide: DraftSide
  activeIndex: number
}

interface RecommendationForm {
  riskMode: RiskMode
  targetRole: TargetRole
  scenario: Scenario | 'auto'
}

type ApiHero = Hero

const SLOT_COUNT = 5

const emptySlot = (): DraftSlot => ({ hero: null, roleOverride: null })
const emptyTeam = (): DraftSlot[] => Array.from({ length: SLOT_COUNT }, emptySlot)

const defaultForm: RecommendationForm = {
  riskMode: 'balanced',
  targetRole: 'any',
  scenario: 'auto'
}

function useHeroes() {
  const [heroes, setHeroes] = useState<ApiHero[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchHeroes() {
      try {
        setLoading(true)
        const response = await fetch('/api/heroes')
        if (!response.ok) throw new Error('无法加载英雄数据')
        const data = (await response.json()) as ApiHero[]
        if (!cancelled) {
          setHeroes(data.sort((a, b) => a.localizedName.localeCompare(b.localizedName, 'zh-CN')))
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchHeroes()
    return () => {
      cancelled = true
    }
  }, [])

  return { heroes, loading, error }
}

function App() {
  const { heroes, loading, error } = useHeroes()
  const [draft, setDraft] = useState<DraftState>({
    ally: emptyTeam(),
    enemy: emptyTeam(),
    activeSide: 'ally',
    activeIndex: 0
  })
  const [form, setForm] = useState(defaultForm)
  const [results, setResults] = useState<RecommendationResponse | null>(null)
  const [pending, setPending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const usedIds = useMemo(() => {
    const ids = new Set<HeroId>()
    draft.ally.forEach((slot) => slot.hero && ids.add(slot.hero.id))
    draft.enemy.forEach((slot) => slot.hero && ids.add(slot.hero.id))
    return ids
  }, [draft])

  const updateSlot = (side: DraftSide, index: number, updater: (slot: DraftSlot) => DraftSlot) => {
    setDraft((prev) => {
      const next = prev[side].map((slot, idx) => (idx === index ? updater(slot) : slot))
      return { ...prev, [side]: next }
    })
  }

  const handleActivate = (side: DraftSide, index: number) => {
    setDraft((prev) => ({ ...prev, activeSide: side, activeIndex: index }))
  }

  const handleSelectHero = (hero: Hero) => {
    const { activeSide, activeIndex } = draft
    updateSlot(activeSide, activeIndex, () => ({ hero, roleOverride: null }))
    setResults(null)
    advanceSlot()
  }

  const handleClear = (side: DraftSide, index: number) => {
    updateSlot(side, index, emptySlot)
    setResults(null)
  }

  const handleRoleOverride = (side: DraftSide, index: number, role: Position | null) => {
    updateSlot(side, index, (slot) => ({ ...slot, roleOverride: role }))
    setResults(null)
  }

  const advanceSlot = () => {
    setDraft((prev) => {
      const team = prev[prev.activeSide]
      const nextIndex = team.findIndex((slot, idx) => !slot.hero && idx > prev.activeIndex)
      if (nextIndex >= 0) return { ...prev, activeIndex: nextIndex }
      const otherSide: DraftSide = prev.activeSide === 'ally' ? 'enemy' : 'ally'
      const otherTeam = prev[otherSide]
      const otherIndex = otherTeam.findIndex((slot) => !slot.hero)
      if (otherIndex >= 0) return { ...prev, activeSide: otherSide, activeIndex: otherIndex }
      return prev
    })
  }

  const handleRun = async () => {
    if (pending) return
    try {
      setPending(true)
      const payload: RecommendationRequestPayload = {
        ally: draft.ally.map((slot) => slot.hero?.id ?? null),
        enemy: draft.enemy.map((slot) => slot.hero?.id ?? null),
        riskMode: form.riskMode,
        targetRole: form.targetRole,
        scenario: form.scenario,
        roleOverrides: {
          ally: draft.ally.map((slot) => slot.roleOverride),
          enemy: draft.enemy.map((slot) => slot.roleOverride)
        }
      }

      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const info = await response.json().catch(() => ({}))
        throw new Error(info.error ?? '推荐计算失败')
      }

      const data = (await response.json()) as RecommendationResponse
      setResults(data)
      setToast('推荐已生成')
    } catch (err) {
      setToast((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  const handleReset = () => {
    setDraft({ ally: emptyTeam(), enemy: emptyTeam(), activeSide: 'ally', activeIndex: 0 })
    setForm(defaultForm)
    setResults(null)
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>Dota 2 天梯 BP 助手</h1>
          <p className="subtitle">录入双方已知英雄后，生成下一手建议。</p>
        </div>
        <div className="status">
          <span className={`dot ${loading ? '' : 'live'}`}></span>
          <span>{loading ? '加载英雄数据…' : `已加载 ${heroes.length} 名英雄`}</span>
        </div>
      </header>

      {toast ? <div className="warning">{toast}</div> : null}

      <main className="layout">
        <section className="panel">
          <div className="panel-head">
            <h2>阵容信息</h2>
          </div>
          <div className="controls">
            <label>
              目标位置
              <select
                value={form.targetRole}
                onChange={(event) => setForm((prev) => ({ ...prev, targetRole: event.target.value as TargetRole }))}
              >
                <option value="any">任意</option>
                <option value="mid">中路</option>
                <option value="safe">优势路</option>
                <option value="offlane">劣势路</option>
                <option value="softSupport">四号位</option>
                <option value="hardSupport">五号位</option>
              </select>
            </label>
            <label>
              风险偏好
              <select
                value={form.riskMode}
                onChange={(event) => setForm((prev) => ({ ...prev, riskMode: event.target.value as RiskMode }))}
              >
                <option value="balanced">均衡</option>
                <option value="stable">稳健</option>
                <option value="counter">针对</option>
              </select>
            </label>
            <label>
              推荐轮次
              <select
                value={form.scenario}
                onChange={(event) => setForm((prev) => ({ ...prev, scenario: event.target.value as Scenario | 'auto' }))}
              >
                <option value="auto">自动判断</option>
                <option value="second">第二轮</option>
                <option value="final">最后一手</option>
              </select>
            </label>
          </div>

          <div className="draft-board">
            <DraftColumn
              title="我方阵容"
              side="ally"
              slots={draft.ally}
              activeSide={draft.activeSide}
              activeIndex={draft.activeIndex}
              onActivate={handleActivate}
              onClear={handleClear}
              onRoleChange={handleRoleOverride}
            />
            <DraftColumn
              title="敌方阵容"
              side="enemy"
              slots={draft.enemy}
              activeSide={draft.activeSide}
              activeIndex={draft.activeIndex}
              onActivate={handleActivate}
              onClear={handleClear}
              onRoleChange={handleRoleOverride}
            />
          </div>

          <div className="actions">
            <button className="primary" onClick={handleRun} disabled={pending || loading}>
              {pending ? '计算中…' : '生成推荐'}
            </button>
            <button className="secondary" onClick={handleReset} disabled={pending}>
              重置
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>推荐结果</h2>
            <span>{results ? (results.scenario === 'second' ? '第二轮' : '最后一手') : '等待输入'}</span>
          </div>
          <div className="results">
            {results ? <ResultSummary evaluation={results.evaluation} /> : <div className="empty">填写阵容后生成推荐。</div>}
            {results ? <RecommendationList singles={results.singles} pairs={results.pairs} /> : null}
          </div>
        </section>
      </main>

      <section className="panel">
        <div className="panel-head">
          <h2>英雄选择</h2>
        </div>
        <HeroPicker heroes={heroes} usedHeroIds={usedIds} onSelect={handleSelectHero} loading={loading} error={error} />
      </section>
    </div>
  )
}

interface DraftColumnProps {
  title: string
  side: DraftSide
  slots: DraftSlot[]
  activeSide: DraftSide
  activeIndex: number
  onActivate: (side: DraftSide, index: number) => void
  onClear: (side: DraftSide, index: number) => void
  onRoleChange: (side: DraftSide, index: number, role: Position | null) => void
}

function DraftColumn({ title, side, slots, activeSide, activeIndex, onActivate, onClear, onRoleChange }: DraftColumnProps) {
  const positionOptions: Array<{ label: string; value: Position | null }> = [
    { label: '未指定', value: null },
    { label: '中路', value: 'mid' },
    { label: '优势路', value: 'safe' },
    { label: '劣势路', value: 'offlane' },
    { label: '四号位', value: 'softSupport' },
    { label: '五号位', value: 'hardSupport' }
  ]

  return (
    <div className="team">
      <div className="team-title">
        <span>{title}</span>
        <span>
          {slots.filter((slot) => slot.hero).length}/{SLOT_COUNT}
        </span>
      </div>
      {slots.map((slot, index) => {
        const active = activeSide === side && activeIndex === index
        return (
          <div key={index} className={`slot ${active ? 'active' : ''}`} onClick={() => onActivate(side, index)}>
            <span className="slot-index">{index + 1}</span>
            <div className="slot-info">
              <div className="slot-title">
                <span>{side === 'ally' ? '我方' : '敌方'}</span>
                <select
                  value={slot.roleOverride ?? ''}
                  onChange={(event) =>
                    onRoleChange(side, index, (event.target.value as Position) || null)
                  }
                >
                  {positionOptions.map((option) => (
                    <option key={option.label} value={option.value ?? ''}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <span className="slot-name">
                {slot.hero ? `${slot.hero.localizedName} / ${slot.hero.name}` : '点击选择英雄'}
              </span>
              <span className="slot-role">
                {slot.hero
                  ? `${slot.hero.attribute.toUpperCase()} · ${slot.hero.positions.join(' / ')}`
                  : '未选择'}
              </span>
            </div>
            <button className="slot-clear" onClick={(event) => (event.stopPropagation(),onClear(side, index))}>
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

interface HeroPickerProps {
  heroes: ApiHero[]
  usedHeroIds: Set<HeroId>
  onSelect: (hero: Hero) => void
  loading: boolean
  error: string | null
}

function HeroPicker({ heroes, usedHeroIds, onSelect, loading, error }: HeroPickerProps) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return heroes.filter((hero) => {
      if (!q) return true
      const text = `${hero.name} ${hero.localizedName ?? ''}`.toLowerCase()
      return text.includes(q)
    })
  }, [heroes, query])

  return (
    <div className="hero-picker">
      <div className="picker-tools">
        <input
          placeholder="搜索英雄"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="hero-grid">
        {loading ? <div className="empty">加载英雄信息…</div> : null}
        {error ? <div className="empty">{error}</div> : null}
        {!loading && !error && filtered.length === 0 ? <div className="empty">无匹配英雄</div> : null}
        {!loading && !error &&
          filtered.map((hero) => (
            <button
              key={hero.id}
              className={`hero-btn ${usedHeroIds.has(hero.id) ? 'used' : ''}`}
              onClick={() => onSelect(hero)}
              disabled={usedHeroIds.has(hero.id)}
            >
              <strong>
                {hero.localizedName ?? hero.name} / {hero.name}
              </strong>
              <span>{hero.positions.join(' / ')}</span>
            </button>
          ))}
      </div>
    </div>
  )
}

interface RecommendationListProps {
  singles: RecommendationResult[]
  pairs: RecommendationResult[]
}

function RecommendationList({ singles, pairs }: RecommendationListProps) {
  return (
    <div className="recommendation">
      <div className="rec-head">
        <div>
          <h3>单英雄推荐</h3>
          <div className="tags">
            {singles.map((rec, index) => (
              <RecommendationCard key={`single-${index}`} rec={rec} index={index} />
            ))}
          </div>
        </div>
      </div>
      <div className="rec-head">
        <div>
          <h3>双英雄推荐</h3>
          <div className="tags">
            {pairs.map((rec, index) => (
              <RecommendationCard key={`pair-${index}`} rec={rec} index={index} />
            ))}
          </div>
        </div>
      </div>
      <div className="warning">推荐仅供参考，仍需结合对局节奏与队友英雄池。</div>
    </div>
  )
}

interface RecommendationCardProps {
  rec: RecommendationResult
  index: number
}

function RecommendationCard({ rec, index }: RecommendationCardProps) {
  const title = rec.heroes.map((hero) => hero.localizedName ?? hero.name).join(' + ')
  const delta = rec.win - 50
  return (
    <div className="recommendation">
      <div className="rec-head">
        <div>
          <div className="rec-title">
            <span>#{index + 1}</span>
            <span>{title}</span>
          </div>
          <div className="tags">
            {rec.heroes.map((hero) => (
              <span className="tag" key={hero.id}>
                {hero.positions.join(' / ')}
              </span>
            ))}
          </div>
        </div>
        <div className="score">
          <strong>{rec.win.toFixed(1)}%</strong>
          <span>{delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}</span>
        </div>
      </div>
      <div className="tags">
        {rec.reasons.map((reason, idx) => (
          <span className="reason" key={idx}>
            {reason}
          </span>
        ))}
      </div>
    </div>
  )
}

interface ResultSummaryProps {
  evaluation: RecommendationResponse['evaluation']
}

function ResultSummary({ evaluation }: ResultSummaryProps) {
  return (
    <div className="rec-head">
      <div className="score">
        <strong>当前估算</strong>
        <span>{evaluation.currentWin.toFixed(1)}%</span>
      </div>
      <div className="score">
        <strong>阵容完整度</strong>
        <span>{evaluation.coverage.value}%</span>
      </div>
      <div className="tags">
        {evaluation.coverage.missing.length ? (
          <span className="reason">缺失能力：{evaluation.coverage.missing.join('、')}</span>
        ) : (
          <span className="reason">关键能力已覆盖</span>
        )}
      </div>
    </div>
  )
}

export default App
