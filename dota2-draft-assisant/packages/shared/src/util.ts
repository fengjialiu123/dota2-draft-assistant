import { ATTRIBUTE_LABELS, POSITION_LABELS } from "./constants";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const pct = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

export const uniq = <T>(values: Iterable<T>) => Array.from(new Set(values));

export const attributeLabel = (attr: string) => ATTRIBUTE_LABELS[attr as keyof typeof ATTRIBUTE_LABELS] ?? attr;

export const positionLabel = (position: string) => POSITION_LABELS[position as keyof typeof POSITION_LABELS] ?? position;
