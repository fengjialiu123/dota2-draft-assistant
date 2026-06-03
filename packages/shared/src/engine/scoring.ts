import { clamp, positionLabel, uniq } from "../util";
import { inferTagsFromRoles } from "./hero";
import { assessCoverage } from "./coverage";
import { heroFitsOpenPosition, pairFitsOpenPositions, supportSlotsFilled } from "./state";
import type {
  Hero,
  HeroId,
  PersonalRecord,
  PersonalRecordMap,
  RecommendationContext,
  RecommendationResult,
  TargetRole
} from "../types";

const stabilityTags = new Set(["control", "init", "clear", "save", "sustain", "tower"]);

const scoringWeights = {
  balanced: { meta: 1.4, counter: 1.0, synergy: 0.72, needs: 4.8, stability: 1.2, personal: 1.3 },
  stable: { meta: 1.2, counter: 0.74, synergy: 0.86, needs: 5.6, stability: 2.1, personal: 1.5 },
  counter: { meta: 1.0, counter: 1.38, synergy: 0.58, needs: 4.0, stability: 0.8, personal: 1.0 }
} as const;

type RiskMode = keyof typeof scoringWeights;

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50);

const matchupScore = (candidate: Hero, enemy: Hero): number => {
  const candidateTags = inferTagsFromRoles(candidate);
  const enemyTags = inferTagsFromRoles(enemy);
  let score = 0;
  const add = (condition: boolean, value: number) => {
    if (condition) score += value;
  };

  add(candidateTags.includes("silence") && (enemyTags.includes("mobile") || enemyTags.includes("magic")), 7);
  add(candidateTags.includes("anti_mobile") && enemyTags.includes("mobile"), 8);
  add(candidateTags.includes("break") && (enemyTags.includes("tank") || enemyTags.includes("sustain")), 7);
  add(candidateTags.includes("anti_heal") && enemyTags.includes("sustain"), 7);
  add(candidateTags.includes("clear") && (enemyTags.includes("illusion") || enemyTags.includes("summon")), 8);
  add(candidateTags.includes("anti_illusion") && enemyTags.includes("illusion"), 9);
  add(candidateTags.includes("anti_tank") && enemyTags.includes("tank"), 7);
  add(candidateTags.includes("anti_magic") && enemyTags.includes("magic"), 5);
  add(candidateTags.includes("bkb_pierce") && (enemyTags.includes("carry") || enemyTags.includes("mobile")), 6);
  add(candidateTags.includes("catch") && enemyTags.includes("ranged"), 4);
  add(candidateTags.includes("tower") && !enemyTags.includes("clear"), 2);

  add(enemyTags.includes("silence") && candidateTags.includes("mobile"), -5);
  add(enemyTags.includes("break") && candidateTags.includes("tank"), -5);
  add(enemyTags.includes("anti_heal") && candidateTags.includes("sustain"), -5);
  add(enemyTags.includes("clear") && (candidateTags.includes("illusion") || candidateTags.includes("summon")), -6);
  add(enemyTags.includes("anti_mobile") && candidateTags.includes("mobile"), -5);

  return score;
};

const synergyScore = (a: Hero, b: Hero): number => {
  const tagsA = inferTagsFromRoles(a);
  const tagsB = inferTagsFromRoles(b);
  let score = 0;
  const either = (x: string, y: string) => (tagsA.includes(x) && tagsB.includes(y)) || (tagsA.includes(y) && tagsB.includes(x));

  if (either("init", "teamfight")) score += 7;
  if (either("control", "burst")) score += 6;
  if (either("tower", "sustain")) score += 5;
  if (either("roshan", "physical")) score += 4;
  if (either("save", "carry")) score += 5;
  if (either("buff", "physical")) score += 4;
  if (tagsA.includes("carry") && tagsB.includes("carry")) score -= 7;
  if (tagsA.includes("mid") && tagsB.includes("mid")) score -= 8;

  return score;
};

const roleFit = (hero: Hero, targetRole: TargetRole): number => {
  if (targetRole === "any") return 0;
  return hero.positions.includes(targetRole) ? 10 : -18;
};

const personalBoostFor = (personal?: PersonalRecord) => {
  if (!personal) return { boost: 0, info: null as { win: number; games: number } | null };
  const winRate = personal.games > 0 ? (personal.win / personal.games) * 100 : 0;
  const sample = Math.min(1, personal.games / 30);
  const boost = (winRate - 50) * 0.8 * sample + Math.min(4, personal.games * 0.08);
  return { boost, info: { win: winRate, games: personal.games } };
};

const buildReasons = (
  hero: Hero,
  data: {
    counter: number;
    synergy: number;
    filledNeeds: number;
    targetRole: TargetRole;
    personalInfo: { win: number; games: number } | null;
  }
): string[] => {
  const reasons: string[] = [];
  const tags = inferTagsFromRoles(hero);

  if (data.counter > 12) reasons.push("对敌方已选英雄有明显针对价值");
  else if (data.counter > 4) reasons.push("对敌方前几手有正向对位");

  if (data.synergy > 10) reasons.push("与我方已有英雄能形成稳定配合");
  else if (data.synergy > 4) reasons.push("能补强我方现有节奏");

  if (data.filledNeeds > 0) reasons.push(`补足 ${data.filledNeeds} 个阵容短板`);
  if (data.targetRole !== "any") reasons.push(`符合当前目标位置：${positionLabel(data.targetRole as string)}`);
  if (tags.includes("init")) reasons.push("提供先手能力，降低阵容开团压力");
  if (tags.includes("save")) reasons.push("提供救人或容错，适合保护核心");
  if (tags.includes("tower")) reasons.push("提升推塔节奏，避免只会打架不会推进");
  if (tags.includes("clear")) reasons.push("补充清线能力，降低被推进压制风险");
  if ((hero.winRate || 50) >= 52) reasons.push("内置/实时数据中的基础胜率较高");
  if (data.personalInfo) reasons.push(`你最近 ${Math.round(data.personalInfo.win)}% 胜率（${data.personalInfo.games} 场）`);

  return reasons.slice(0, 5);
};

export const scoreCandidate = (
  hero: Hero,
  ally: Hero[],
  enemy: Hero[],
  targetRole: TargetRole,
  riskMode: RiskMode,
  personal?: PersonalRecord
) => {
  const coverage = assessCoverage([...ally, hero]);
  const currentCoverage = assessCoverage(ally);
  const filledNeeds = currentCoverage.missing.filter((need) => !coverage.missing.includes(need)).length;
  const counter = enemy.reduce((sum, target) => sum + matchupScore(hero, target), 0);
  const synergy = ally.reduce((sum, mate) => sum + synergyScore(hero, mate), 0);
  const meta = (hero.winRate || 50) - 50;
  const stability = inferTagsFromRoles(hero).filter((tag) => stabilityTags.has(tag)).length;
  const { boost: personalBoost, info: personalInfo } = personalBoostFor(personal);
  const weights = scoringWeights[riskMode];

  const raw =
    50 +
    meta * weights.meta +
    counter * weights.counter +
    synergy * weights.synergy +
    filledNeeds * weights.needs +
    stability * weights.stability +
    personalBoost * weights.personal +
    roleFit(hero, targetRole);

  const win = clamp(50 + (raw - 50) * 0.22, 39, 64);

  return {
    raw,
    win,
    counter,
    synergy,
    filledNeeds,
    stability,
    personal: personalBoost,
    personalInfo,
    coverage: coverage.value,
    reasons: buildReasons(hero, { counter, synergy, filledNeeds, targetRole, personalInfo })
  };
};

const describePair = (
  a: Hero,
  b: Hero,
  pairSynergy: number,
  coverageValue: number,
  scoreA: ReturnType<typeof scoreCandidate>,
  scoreB: ReturnType<typeof scoreCandidate>
) => {
  const reasons: string[] = [];
  if (pairSynergy > 6) reasons.push("两名候选之间有明确组合收益");
  if (scoreA.counter + scoreB.counter > 16) reasons.push("组合对敌方已选英雄的针对性较强");
  if (coverageValue >= 70) reasons.push("选完后阵容结构较完整");
  const tags = uniq([...inferTagsFromRoles(a), ...inferTagsFromRoles(b)]);
  if (tags.includes("init") && tags.includes("control")) reasons.push("补足先手和控制链");
  if (tags.includes("tower")) reasons.push("第二轮拿到推进能力，避免第五手压力过大");
  if (tags.includes("save")) reasons.push("组合中带有保护能力，提高核心容错");
  return reasons.slice(0, 4);
};

export const scoreDraft = (ally: Hero[], enemy: Hero[]): number => {
  const allyCoverage = assessCoverage(ally).value;
  const enemyCoverage = assessCoverage(enemy).value;
  const allyWin = average(ally.map((hero) => hero.winRate || 50));
  const enemyWin = average(enemy.map((hero) => hero.winRate || 50));
  const matchup = ally.reduce((sum, hero) => sum + enemy.reduce((s, enemyHero) => s + matchupScore(hero, enemyHero), 0), 0);
  return clamp(50 + (allyWin - enemyWin) * 0.28 + (allyCoverage - enemyCoverage) * 0.035 + matchup * 0.16, 38, 62);
};

export const recommendSingles = (
  context: RecommendationContext,
  personalRecords?: PersonalRecordMap,
  limit = 6
): RecommendationResult[] => {
  const ally = context.ally.filter(Boolean) as Hero[];
  const enemy = context.enemy.filter(Boolean) as Hero[];
  const used = new Set<HeroId>([...ally, ...enemy].map((hero) => hero.id));
  const slots = context.ally;
  const overrides = context.roleOverrides.ally;

  return context.heroes
    .filter((hero) => !used.has(hero.id) && heroFitsOpenPosition(hero, slots, overrides, context.targetRole))
    .map((hero) => ({
      hero,
      score: scoreCandidate(
        hero,
        ally,
        enemy,
        context.targetRole,
        context.riskMode,
        personalRecords?.[hero.id]
      )
    }))
    .sort((a, b) => b.score.raw - a.score.raw)
    .slice(0, limit)
    .map(({ hero, score }) => ({
      heroes: [hero],
      raw: score.raw,
      win: score.win,
      coverage: score.coverage,
      counter: score.counter,
      synergy: score.synergy,
      reasons: score.reasons
    }));
};

export const recommendPairs = (
  context: RecommendationContext,
  personalRecords?: PersonalRecordMap,
  limit = 6
): RecommendationResult[] => {
  const ally = context.ally.filter(Boolean) as Hero[];
  const enemy = context.enemy.filter(Boolean) as Hero[];
  const used = new Set<HeroId>([...ally, ...enemy].map((hero) => hero.id));

  const slots = context.ally;
  const overrides = context.roleOverrides.ally;
  const supportsTaken = supportSlotsFilled(slots, overrides);

  const pool = context.heroes
    .filter((hero) => {
      if (used.has(hero.id)) return false;
      const positions = hero.positions;
      if (supportsTaken >= 2 && positions.every((pos) => pos === "softSupport" || pos === "hardSupport")) return false;
      return heroFitsOpenPosition(hero, slots, overrides, "any");
    })
    .map((hero) => ({
      hero,
      score: scoreCandidate(hero, ally, enemy, "any", context.riskMode, personalRecords?.[hero.id])
    }))
    .sort((a, b) => b.score.raw - a.score.raw)
    .slice(0, 34);

  const pairs: RecommendationResult[] = [];

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i].hero;
      const b = pool[j].hero;
      if (!pairFitsOpenPositions(slots, overrides, a, b)) continue;
      const coverage = assessCoverage([...ally, a, b]);
      const pairSynergy = synergyScore(a, b);
      const raw = pool[i].score.raw + pool[j].score.raw + pairSynergy + coverage.value * 0.08;
      const win = clamp(50 + (raw / 2 - 50) * 0.22 + pairSynergy * 0.08, 40, 65);
      pairs.push({
        heroes: [a, b],
        raw,
        win,
        coverage: coverage.value,
        counter: pool[i].score.counter + pool[j].score.counter,
        synergy: pool[i].score.synergy + pool[j].score.synergy + pairSynergy,
        reasons: describePair(a, b, pairSynergy, coverage.value, pool[i].score, pool[j].score)
      });
    }
  }

  return pairs.sort((a, b) => b.raw - a.raw).slice(0, limit);
};

export const summarizeDraft = (context: RecommendationContext) => {
  const ally = context.ally.filter(Boolean) as Hero[];
  const enemy = context.enemy.filter(Boolean) as Hero[];
  return {
    currentWin: scoreDraft(ally, enemy),
    coverage: assessCoverage(ally)
  };
};
