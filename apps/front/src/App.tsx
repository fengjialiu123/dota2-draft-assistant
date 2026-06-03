import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import type {
  Attribute,
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

type AttributeKey = Attribute
type AttributeFilter = 'all' | AttributeKey

const ATTRIBUTE_ORDER: AttributeKey[] = ['str', 'agi', 'int', 'allAttr']

const ATTRIBUTE_LABELS: Record<AttributeFilter, string> = {
  all: '全部',
  str: '力量英雄',
  agi: '敏捷英雄',
  int: '智力英雄',
  allAttr: '全才英雄'
}

const normalizeAttribute = (value: string | null | undefined): AttributeKey => {
  if (!value) return 'allAttr'
  const lower = value.toLowerCase()
  switch (lower) {
    case 'str':
    case 'strength':
      return 'str'
    case 'agi':
    case 'agility':
      return 'agi'
    case 'int':
    case 'intel':
    case 'intelligence':
      return 'int'
    case 'all':
    case 'allattr':
    case 'universal':
      return 'allAttr'
    default:
      return 'allAttr'
  }
}

const buildAttributeGroups = (heroes: ApiHero[]) => {
  return heroes.reduce<Record<AttributeKey, ApiHero[]>>((acc, hero) => {
    const attr = normalizeAttribute(hero.attribute)
    acc[attr]?.push(hero)
    return acc
  }, {
    str: [],
    agi: [],
    int: [],
    allAttr: []
  })
}

const SLOT_COUNT = 5

const emptySlot = (): DraftSlot => ({ hero: null, roleOverride: null })
const emptyTeam = (): DraftSlot[] => Array.from({ length: SLOT_COUNT }, emptySlot)

const defaultForm: RecommendationForm = {
  riskMode: 'balanced',
  targetRole: 'any',
  scenario: 'auto'
}

function useHeroes(apiBase: string) {
  const [heroes, setHeroes] = useState<ApiHero[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchHeroes() {
      try {
        setLoading(true)
        const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
        const response = await fetch(`${base}/heroes`)
        if (!response.ok) throw new Error('无法加载英雄数据')
        const data = (await response.json()) as ApiHero[]
        if (!cancelled) {
          const normalized = data
            .map((hero) => ({
              ...hero,
              attribute: normalizeAttribute(hero.attribute)
            }))
            .sort((a, b) => a.localizedName.localeCompare(b.localizedName, 'zh-CN'))
          setHeroes(normalized)
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
  }, [apiBase])

  return { heroes, loading, error }
}

function App() {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
  const normalizedBase = useMemo(() => (apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase), [apiBase])
  const { heroes, loading, error } = useHeroes(normalizedBase)
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
  const [heroQuery, setHeroQuery] = useState('')
  const quickSelectRef = useRef<() => void>(() => {})

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
    setHeroQuery('')
  }

  const handleSelectHero = (hero: Hero) => {
    const { activeSide, activeIndex } = draft
    updateSlot(activeSide, activeIndex, () => ({ hero, roleOverride: null }))
    setResults(null)
    setHeroQuery('')
    advanceSlot()
  }

  const handleClear = (side: DraftSide, index: number) => {
    updateSlot(side, index, emptySlot)
    setResults(null)
    if (draft.activeSide === side && draft.activeIndex === index) {
      setHeroQuery('')
    }
  }

  const handleRoleOverride = (side: DraftSide, index: number, role: Position | null) => {
    updateSlot(side, index, (slot) => ({ ...slot, roleOverride: role }))
    setResults(null)
  }

  const handleHeroQuerySubmit = () => {
    quickSelectRef.current?.()
  }

  const handleApplyRecommendation = (heroesToApply: Hero[]) => {
    if (!heroesToApply.length) return
    setDraft((prev) => {
      const ally = prev.ally.map((slot) => ({ ...slot }))
      const enemy = prev.enemy.map((slot) => ({ ...slot }))
      const used = new Set<number>()
      ally.forEach((slot) => slot.hero && used.add(slot.hero.id))
      enemy.forEach((slot) => slot.hero && used.add(slot.hero.id))

      let inserted = false
      for (const hero of heroesToApply) {
        if (used.has(hero.id)) continue
        const index = ally.findIndex((slot) => !slot.hero)
        if (index === -1) break
        ally[index] = { ...ally[index], hero, roleOverride: null }
        used.add(hero.id)
        inserted = true
      }

      if (!inserted) return prev

      const nextActiveIndex = ally.findIndex((slot) => !slot.hero)
      let activeSide: DraftSide = prev.activeSide
      let activeIndex = prev.activeIndex
      if (nextActiveIndex >= 0) {
        activeSide = 'ally'
        activeIndex = nextActiveIndex
      } else {
        const enemyNext = enemy.findIndex((slot) => !slot.hero)
        if (enemyNext >= 0) {
          activeSide = 'enemy'
          activeIndex = enemyNext
        }
      }

      return { ally, enemy, activeSide, activeIndex }
    })
    setResults(null)
    setHeroQuery('')
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

      const response = await fetch(`${normalizedBase}/recommend`, {
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
              heroQuery={heroQuery}
              onHeroQueryChange={setHeroQuery}
              onHeroQuerySubmit={handleHeroQuerySubmit}
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
              heroQuery={heroQuery}
              onHeroQueryChange={setHeroQuery}
              onHeroQuerySubmit={handleHeroQuerySubmit}
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
            {results ? (
              <RecommendationList
                singles={results.singles}
                pairs={results.pairs}
                usedHeroIds={usedIds}
                onApply={handleApplyRecommendation}
              />
            ) : null}
          </div>
        </section>
      </main>

      <section className="panel">
        <div className="panel-head">
          <h2>英雄选择</h2>
        </div>
        <HeroPicker
          heroes={heroes}
          usedHeroIds={usedIds}
          onSelect={handleSelectHero}
          loading={loading}
          error={error}
          activeSide={draft.activeSide}
          activeIndex={draft.activeIndex}
          query={heroQuery}
          onQueryChange={setHeroQuery}
          onRegisterQuickSelect={(cb) => {
            quickSelectRef.current = cb
          }}
        />
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
  heroQuery: string
  onHeroQueryChange: (value: string) => void
  onHeroQuerySubmit: () => void
}

function DraftColumn({ title, side, slots, activeSide, activeIndex, onActivate, onClear, onRoleChange, heroQuery, onHeroQueryChange, onHeroQuerySubmit }: DraftColumnProps) {
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
                {slot.hero ? (
                  `${slot.hero.localizedName} / ${slot.hero.name}`
                ) : active ? (
                  <input
                    className="slot-input"
                    placeholder="输入英雄名称"
                    value={heroQuery}
                    onChange={(event) => onHeroQueryChange(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        onHeroQuerySubmit()
                      }
                      if (event.key === 'Escape') {
                        onHeroQueryChange('')
                      }
                    }}
                  />
                ) : (
                  '点击选择英雄'
                )}
              </span>
              <span className="slot-role">
                {slot.hero
                  ? `${slot.hero.attribute.toUpperCase()} · ${slot.hero.positions.join(' / ')}`
                  : '未选择'}
              </span>
            </div>
            <button className="slot-clear" onClick={(event) => { event.stopPropagation(); onClear(side, index) }}>
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
  activeSide: DraftSide
  activeIndex: number
  query: string
  onQueryChange: (value: string) => void
  onRegisterQuickSelect: (cb: () => void) => void
}

function HeroPicker({ heroes, usedHeroIds, onSelect, loading, error, activeSide, activeIndex, query, onQueryChange, onRegisterQuickSelect }: HeroPickerProps) {
  const [attributeFilter, setAttributeFilter] = useState<AttributeFilter>('all')
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return heroes.filter((hero) => {
      const attr = normalizeAttribute(hero.attribute)
      if (attributeFilter !== 'all' && attr !== attributeFilter) return false
      if (!q) return true
      const text = `${hero.name} ${hero.localizedName ?? ''}`.toLowerCase()
      return text.includes(q)
    })
  }, [heroes, query, attributeFilter])

  const groups = useMemo(() => {
    return buildAttributeGroups(filtered)
  }, [filtered])

  const firstAvailable = useMemo(
    () => filtered.find((hero) => !usedHeroIds.has(hero.id)) ?? null,
    [filtered, usedHeroIds]
  )

  useEffect(() => {
    if (!searchRef.current || loading) return
    searchRef.current.focus()
    searchRef.current.select()
  }, [activeSide, activeIndex, loading])

  const handleQuickSelect = useCallback(() => {
    if (!firstAvailable) return
    onSelect(firstAvailable)
    onQueryChange('')
  }, [firstAvailable, onSelect, onQueryChange])

  useEffect(() => {
    onRegisterQuickSelect(handleQuickSelect)
  }, [handleQuickSelect, onRegisterQuickSelect])

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleQuickSelect()
    }
    if (event.key === 'Escape') {
      onQueryChange('')
    }
  }

  return (
    <div className="hero-picker">
      <div className="picker-tools">
        <input
          ref={searchRef}
          placeholder="搜索英雄"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        <div className="attribute-tabs">
          {(['all', 'str', 'agi', 'int', 'allAttr'] as AttributeFilter[]).map((key) => (
            <button
              key={key}
              className={`tab ${attributeFilter === key ? 'active' : ''}`}
              onClick={() => setAttributeFilter(key)}
            >
              {ATTRIBUTE_LABELS[key]}
            </button>
          ))}
        </div>
      </div>
      {loading ? <div className="empty">加载英雄信息…</div> : null}
      {error ? <div className="empty">{error}</div> : null}
      {!loading && !error && filtered.length === 0 ? <div className="empty">无匹配英雄</div> : null}
      {!loading && !error &&
        ATTRIBUTE_ORDER
          .filter((attr) => attributeFilter === 'all' || attributeFilter === attr)
          .map((attr) => (
            <AttributeSection
              key={attr}
              title={ATTRIBUTE_LABELS[attr]}
              heroes={groups[attr]}
              usedHeroIds={usedHeroIds}
              onSelect={onSelect}
              highlightId={
                firstAvailable && normalizeAttribute(firstAvailable.attribute) === attr
                  ? firstAvailable.id
                  : null
              }
            />
          ))}
    </div>
  )
}

interface AttributeSectionProps {
  title: string
  heroes: ApiHero[]
  usedHeroIds: Set<HeroId>
  onSelect: (hero: Hero) => void
  highlightId: HeroId | null
}

function AttributeSection({ title, heroes, usedHeroIds, onSelect, highlightId }: AttributeSectionProps) {
  if (!heroes.length) return null
  return (
    <section className="attribute-section">
      <h3 className="attribute-title">{title}</h3>
      <div className="hero-grid">
        {heroes.map((hero) => (
          <button
            key={hero.id}
            className={`hero-btn ${usedHeroIds.has(hero.id) ? 'used' : ''} ${highlightId === hero.id ? 'highlight' : ''}`}
            onClick={() => onSelect(hero)}
            disabled={usedHeroIds.has(hero.id)}
          >
            <strong>{hero.localizedName ?? hero.name} / {hero.name}</strong>
            <span>{hero.positions.join(' / ')}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

interface RecommendationListProps {
  singles: RecommendationResult[]
  pairs: RecommendationResult[]
  usedHeroIds: Set<HeroId>
  onApply: (heroes: Hero[]) => void
}

function RecommendationList({ singles, pairs, usedHeroIds, onApply }: RecommendationListProps) {
  return (
    <div className="recommendation-panel">
      <div className="rec-head">
        <div>
          <h3>单英雄推荐</h3>
          <div className="tags">
            {singles.map((rec, index) => (
              <RecommendationCard
                key={`single-${index}`}
                rec={rec}
                index={index}
                usedHeroIds={usedHeroIds}
                onApply={onApply}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="rec-head">
        <div>
          <h3>双英雄推荐</h3>
          <div className="tags">
            {pairs.map((rec, index) => (
              <RecommendationCard
                key={`pair-${index}`}
                rec={rec}
                index={index}
                usedHeroIds={usedHeroIds}
                onApply={onApply}
              />
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
  usedHeroIds: Set<HeroId>
  onApply: (heroes: Hero[]) => void
}

function RecommendationCard({ rec, index, usedHeroIds, onApply }: RecommendationCardProps) {
  const title = rec.heroes.map((hero) => hero.localizedName ?? hero.name).join(' + ')
  const delta = rec.win - 50
  const disabled = rec.heroes.every((hero) => usedHeroIds.has(hero.id))
  const handleClick = () => {
    if (disabled) return
    onApply(rec.heroes)
  }
  return (
    <button type="button" className={`recommendation-card ${disabled ? 'disabled' : ''}`} onClick={handleClick} disabled={disabled}>
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
    </button>
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
