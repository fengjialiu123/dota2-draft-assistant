import fallbackHeroesJson from "./fallback.json" with { type: "json" };
import attributeById from "./attribute-by-id.json" with { type: "json" };
import attributeLabels from "./attribute-labels.json" with { type: "json" };
import positionLabels from "./position-labels.json" with { type: "json" };
import coverageTags from "./coverage-tags.json" with { type: "json" };
import tagLabels from "./tag-labels.json" with { type: "json" };

import type { Attribute, HeroSeed } from "../types";

const fallbackHeroes: HeroSeed[] = (fallbackHeroesJson as HeroSeed[]).map((hero) => ({
  ...hero,
  attribute: hero.attribute as Attribute | undefined
}));

export {
  fallbackHeroes,
  attributeById,
  attributeLabels,
  positionLabels,
  coverageTags,
  tagLabels
};
