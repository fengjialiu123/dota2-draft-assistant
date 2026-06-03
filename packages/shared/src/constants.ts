import attributeByIdJson from "./data/attribute-by-id.json" with { type: "json" };
import attributeLabelsJson from "./data/attribute-labels.json" with { type: "json" };
import positionLabelsJson from "./data/position-labels.json" with { type: "json" };

import type { Position } from "./types";

export const ATTRIBUTE_BY_ID = attributeByIdJson as Record<number, string>;
export const ATTRIBUTE_LABELS = attributeLabelsJson as Record<string, string>;
export const POSITION_LABELS = positionLabelsJson as Record<string, string>;

export const POSITION_ORDER = ["mid", "safe", "offlane", "softSupport", "hardSupport"] as const;

export const SUPPORT_POSITIONS = new Set<Position>(["softSupport", "hardSupport"]);

export const SLOT_COUNT = 5;

export const ROLE_LIMITS: Record<Position, number> = {
  mid: 1,
  safe: 1,
  offlane: 1,
  softSupport: 1,
  hardSupport: 1
};
