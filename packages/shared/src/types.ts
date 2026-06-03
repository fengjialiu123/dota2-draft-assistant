export type HeroId = number;

export type Attribute = "str" | "agi" | "int" | "allAttr";

export type Position = "mid" | "safe" | "offlane" | "softSupport" | "hardSupport";

export type HeroTag = string;

export type RiskMode = "balanced" | "stable" | "counter";

export type Scenario = "second" | "final";

export type TargetRole = Position | "any";

export type HeroSource = "fallback" | "opendota" | "custom";

export type DraftSide = "ally" | "enemy";

export interface HeroSeed {
  id: HeroId;
  name: string;
  localizedName?: string;
  cn?: string;
  roles: string[];
  tags?: HeroTag[];
  attribute?: Attribute;
  positions?: Position[];
  winRate?: number;
  pickRate?: number;
  source?: HeroSource;
}

export interface Hero {
  id: HeroId;
  name: string;
  localizedName: string;
  cn?: string;
  roles: string[];
  tags: HeroTag[];
  attribute: Attribute;
  positions: Position[];
  winRate: number;
  pickRate: number;
  source: HeroSource;
}

export interface PersonalRecord {
  games: number;
  win: number;
}

export type PersonalRecordMap = Partial<Record<HeroId, PersonalRecord>>;

export interface RoleOverrides {
  ally: (Position | null)[];
  enemy: (Position | null)[];
}

export interface CoverageResult {
  value: number;
  missing: string[];
  met: string[];
}

export interface CandidateScore {
  raw: number;
  win: number;
  counter: number;
  synergy: number;
  filledNeeds: number;
  stability: number;
  personal: number;
  personalInfo: { win: number; games: number } | null;
  coverage: number;
  reasons: string[];
}

export interface RecommendationResult {
  heroes: Hero[];
  raw: number;
  win: number;
  coverage: number;
  counter: number;
  synergy: number;
  reasons: string[];
}

export interface DraftEvaluation {
  currentWin: number;
  coverage: CoverageResult;
}

export interface RecommendationContext {
  heroes: Hero[];
  ally: (Hero | null)[];
  enemy: (Hero | null)[];
  roleOverrides: RoleOverrides;
  riskMode: RiskMode;
  targetRole: TargetRole;
  personalRecords?: PersonalRecordMap;
}

export interface RecommendationResponse {
  scenario: Scenario;
  evaluation: DraftEvaluation;
  singles: RecommendationResult[];
  pairs: RecommendationResult[];
}

export interface RecommendationRequestPayload {
  ally: Array<HeroId | null>;
  enemy: Array<HeroId | null>;
  riskMode?: RiskMode;
  targetRole?: TargetRole;
  scenario?: Scenario | "auto";
  roleOverrides?: Partial<RoleOverrides>;
  personalRecords?: PersonalRecordMap;
}

export interface DraftSnapshot {
  ally: (Hero | null)[];
  enemy: (Hero | null)[];
  roleOverrides: RoleOverrides;
  riskMode: RiskMode;
  targetRole: TargetRole;
}

export type HeroLookup = Map<HeroId, Hero>;
