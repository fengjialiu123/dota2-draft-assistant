import { SLOT_COUNT } from "../constants";
import { normalizeHeroes } from "./hero";
import { recommendPairs, recommendSingles, summarizeDraft } from "./scoring";
import type {
  Hero,
  HeroId,
  HeroSeed,
  PersonalRecordMap,
  RecommendationContext,
  RecommendationRequestPayload,
  RecommendationResponse,
  Scenario
} from "../types";
import { fallbackHeroes } from "../data/index.js";

const DEFAULT_HEROES = normalizeHeroes(fallbackHeroes as unknown as HeroSeed[]);

const toHero = (id: HeroId | null, lookup: Map<HeroId, Hero>): Hero | null =>
  id != null ? lookup.get(id) ?? null : null;

const buildContext = (
  payload: RecommendationRequestPayload,
  heroes: Hero[],
  personalRecords?: PersonalRecordMap
): RecommendationContext => {
  const lookup = new Map(heroes.map((hero) => [hero.id, hero]));
  const ally = payload.ally.map((id) => toHero(id, lookup));
  const enemy = payload.enemy.map((id) => toHero(id, lookup));
  const emptyOverrides = () => Array.from({ length: SLOT_COUNT }, () => null);
  return {
    heroes,
    ally,
    enemy,
    roleOverrides: {
      ally: payload.roleOverrides?.ally ?? emptyOverrides(),
      enemy: payload.roleOverrides?.enemy ?? emptyOverrides()
    },
    riskMode: payload.riskMode ?? "balanced",
    targetRole: payload.targetRole ?? "any",
    personalRecords
  };
};

const detectScenario = (context: RecommendationContext, scenario?: Scenario | "auto"): Scenario => {
  if (scenario && scenario !== "auto") return scenario;
  const allyCount = context.ally.filter(Boolean).length;
  const enemyCount = context.enemy.filter(Boolean).length;
  if (allyCount <= 2 && enemyCount >= 2) return "second";
  if (allyCount >= 4 && enemyCount >= 4) return "final";
  return allyCount >= 3 || enemyCount >= 3 ? "final" : "second";
};

export const runRecommendation = (
  payload: RecommendationRequestPayload,
  heroes: Hero[] = DEFAULT_HEROES,
  personalRecords?: PersonalRecordMap
): RecommendationResponse => {
  const context = buildContext(payload, heroes, personalRecords);
  const scenario = detectScenario(context, payload.scenario);
  return {
    scenario,
    evaluation: summarizeDraft(context),
    singles: recommendSingles(context, personalRecords),
    pairs: recommendPairs(context, personalRecords)
  };
};
