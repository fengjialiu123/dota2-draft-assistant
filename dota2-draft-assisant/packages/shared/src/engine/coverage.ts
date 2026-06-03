import { coverageTags } from "../data/index.js";
import { inferTagsFromRoles } from "./hero";
import type { Hero } from "../types";

const NEEDS = coverageTags as Array<{ tag: string; label: string }>;

export interface Coverage {
  value: number;
  missing: string[];
  met: string[];
}

export const assessCoverage = (team: Hero[]): Coverage => {
  const tags = team.flatMap(inferTagsFromRoles);
  const met = NEEDS.filter(({ tag }) => tags.includes(tag));
  return {
    value: Math.round((met.length / NEEDS.length) * 100),
    missing: NEEDS.filter(({ tag }) => !tags.includes(tag)).map(({ label }) => label),
    met: met.map(({ label }) => label)
  };
};
