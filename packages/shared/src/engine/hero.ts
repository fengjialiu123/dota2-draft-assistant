import { ATTRIBUTE_BY_ID } from "../constants";
import { uniq } from "../util";
import type { Attribute, Hero, HeroSeed, Position } from "../types";

const DEFAULT_WIN_RATE = 50;
const DEFAULT_PICK_RATE = 0;

export const inferTagsFromRoles = (hero: HeroSeed): string[] => {
  const baseTags = hero.tags ?? [];
  const roles = hero.roles ?? [];
  const tags = new Set(baseTags);

  for (const role of roles) {
    switch (role) {
      case "Carry":
        tags.add("carry");
        tags.add("physical");
        break;
      case "Support":
        tags.add("support");
        break;
      case "Initiator":
        tags.add("init");
        break;
      case "Disabler":
        tags.add("control");
        break;
      case "Pusher":
        tags.add("tower");
        break;
      case "Durable":
        tags.add("tank");
        break;
      case "Nuker":
        tags.add("magic");
        tags.add("burst");
        break;
      case "Escape":
        tags.add("mobile");
        break;
      case "Jungler":
        tags.add("farm");
        break;
      default:
        break;
    }
  }

  return [...tags];
};

const ensurePositions = (positions: Position[] | undefined, inferred: Position[]): Position[] => {
  if (positions && positions.length) return uniq(positions);
  return uniq(inferred);
};

export const inferPositions = (hero: HeroSeed): Position[] => {
  const tags = new Set(inferTagsFromRoles(hero));
  const roles = hero.roles ?? [];
  const positions: Position[] = [];

  const add = (condition: boolean, position: Position) => {
    if (condition) positions.push(position);
  };

  add(tags.has("carry") || (roles.includes("Carry") && !tags.has("support")), "safe");
  add(tags.has("mid"), "mid");
  add(
    tags.has("offlane") ||
      tags.has("tank") ||
      (tags.has("init") && !tags.has("support")) ||
      roles.includes("Offlaner"),
    "offlane"
  );
  add(
    tags.has("support") &&
      (tags.has("init") || tags.has("catch") || tags.has("vision") || tags.has("mobile")),
    "softSupport"
  );
  add(
    tags.has("support") &&
      (tags.has("save") || tags.has("sustain") || tags.has("control") || tags.has("aura")),
    "hardSupport"
  );

  if (!positions.length && roles.includes("Support")) positions.push("softSupport", "hardSupport");
  if (!positions.length && roles.includes("Nuker")) positions.push("mid");
  if (!positions.length && roles.includes("Durable")) positions.push("offlane");
  if (!positions.length) positions.push("safe");

  return uniq(positions);
};

export const normalizeHero = (seed: HeroSeed): Hero => {
  const attribute = (seed.attribute ?? ATTRIBUTE_BY_ID[seed.id] ?? "allAttr") as Attribute;
  const positions = ensurePositions(seed.positions, inferPositions(seed));
  const tags = uniq(inferTagsFromRoles(seed));

  return {
    id: seed.id,
    name: seed.name,
    localizedName: seed.localizedName ?? seed.cn ?? seed.name,
    cn: seed.cn,
    roles: seed.roles ?? [],
    attribute,
    positions,
    tags,
    winRate: seed.winRate ?? DEFAULT_WIN_RATE,
    pickRate: seed.pickRate ?? DEFAULT_PICK_RATE,
    source: seed.source ?? "fallback"
  };
};

export const normalizeHeroes = (seeds: HeroSeed[]): Hero[] => seeds.map(normalizeHero);
