import { ROLE_LIMITS, SLOT_COUNT, SUPPORT_POSITIONS } from "../constants";
import { inferPositions } from "./hero";
import type { DraftSide, Hero, HeroId, Position, RoleOverrides } from "../types";

export const createEmptySlots = (): (Hero | null)[] => Array(SLOT_COUNT).fill(null);

export interface DraftState {
  heroes: Hero[];
  ally: (Hero | null)[];
  enemy: (Hero | null)[];
  roleOverrides: RoleOverrides;
  activeSide: DraftSide;
  activeIndex: number;
}

export const assignedPositions = (team: (Hero | null)[], overrides?: (Position | null)[]) => {
  const counts = Object.fromEntries(Object.keys(ROLE_LIMITS).map((position) => [position, 0])) as Record<Position, number>;
  team.forEach((hero, index) => {
    if (!hero) return;
    const override = overrides?.[index];
    if (override) {
      counts[override] += 1;
      return;
    }
    const positions = hero.positions?.length ? hero.positions : inferPositions(hero);
    const chosen = positions.find((position) => counts[position as Position] === 0) || positions[0];
    if (chosen) counts[chosen as Position] += 1;
  });
  return counts;
};

export const supportSlotsFilled = (slots: (Hero | null)[], overrides?: (Position | null)[]) => {
  let count = 0;
  slots.forEach((hero, index) => {
    if (!hero) return;
    const override = overrides?.[index];
    if (override && SUPPORT_POSITIONS.has(override)) {
      count += 1;
      return;
    }
    const positions = hero.positions ?? inferPositions(hero);
    if (positions.some((pos) => SUPPORT_POSITIONS.has(pos))) count += 1;
  });
  return count;
};

export const remainingRoleCapacity = (slots: (Hero | null)[], overrides?: (Position | null)[]) => {
  const usage = assignedPositions(slots, overrides);
  return Object.fromEntries(
    Object.entries(ROLE_LIMITS).map(([position, limit]) => [position, Math.max(0, limit - usage[position as Position])])
  ) as Record<Position, number>;
};

export const heroFitsOpenPosition = (hero: Hero, slots: (Hero | null)[], overrides: (Position | null)[], targetRole: Position | "any") => {
  const positions = hero.positions ?? inferPositions(hero);
  if (slots.filter(Boolean).length >= SLOT_COUNT) return false;
  const capacity = remainingRoleCapacity(slots, overrides);

  if (targetRole !== "any") {
    if (capacity[targetRole] <= 0) return false;
    return positions.includes(targetRole) || overrides.includes(targetRole);
  }

  const supportsTaken = supportSlotsFilled(slots, overrides);
  if (supportsTaken >= 2 && positions.every((pos) => SUPPORT_POSITIONS.has(pos))) return false;
  return positions.some((pos) => capacity[pos] > 0);
};

export const teamContains = (team: (Hero | null)[]) => new Set(team.filter(Boolean).map((hero) => hero!.id));

export const pairFitsOpenPositions = (slots: (Hero | null)[], overrides: (Position | null)[], a: Hero, b: Hero) => {
  if (slots.filter(Boolean).length > SLOT_COUNT - 2) return false;
  const supportsTaken = supportSlotsFilled(slots, overrides);
  const addedSupports = [a, b].filter((hero) => (hero.positions ?? inferPositions(hero)).some((pos) => SUPPORT_POSITIONS.has(pos))).length;
  if (supportsTaken + addedSupports > 2) return false;
  const capacity = { ...remainingRoleCapacity(slots, overrides) };
  for (const hero of [a, b]) {
    const positions = hero.positions ?? inferPositions(hero);
    const slot = positions.find((pos) => capacity[pos] > 0);
    if (!slot) return false;
    capacity[slot] -= 1;
  }
  return true;
};

export const buildDraftState = (heroes: Hero[]): DraftState => ({
  heroes,
  ally: createEmptySlots(),
  enemy: createEmptySlots(),
  roleOverrides: {
    ally: Array(SLOT_COUNT).fill(null),
    enemy: Array(SLOT_COUNT).fill(null)
  },
  activeSide: "ally",
  activeIndex: 0
});

export const slotTakenBy = (state: DraftState, side: DraftSide, index: number, hero: Hero | null) => {
  const team = side === "ally" ? state.ally : state.enemy;
  team[index] = hero;
};

export const resetDraft = (state: DraftState) => {
  state.ally = createEmptySlots();
  state.enemy = createEmptySlots();
  state.roleOverrides = {
    ally: Array(SLOT_COUNT).fill(null),
    enemy: Array(SLOT_COUNT).fill(null)
  };
  state.activeSide = "ally";
  state.activeIndex = 0;
};

export const getTeam = (state: DraftState, side: DraftSide) => (side === "ally" ? state.ally : state.enemy);

export const picked = (state: DraftState, side: DraftSide) => getTeam(state, side).filter(Boolean) as Hero[];

export const selectedIds = (state: DraftState) =>
  new Set<HeroId>([...state.ally, ...state.enemy].filter(Boolean).map((hero) => hero!.id));
