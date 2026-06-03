import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  fallbackHeroes,
  runRecommendation,
  normalizeHeroes,
  type RecommendationRequestPayload,
  type PersonalRecordMap
} from "@d2bp/shared";
import { z } from "zod";

const app = Fastify({ logger: true });

await app.register(cors, { origin: "*" });

const heroes = normalizeHeroes(fallbackHeroes);

const recommendationSchema = z.object({
  ally: z.array(z.number().nullable()).length(5),
  enemy: z.array(z.number().nullable()).length(5),
  riskMode: z.enum(["balanced", "stable", "counter"]).optional(),
  targetRole: z.enum(["mid", "safe", "offlane", "softSupport", "hardSupport", "any"]).optional(),
  scenario: z.enum(["second", "final", "auto"]).optional(),
  roleOverrides: z
    .object({
      ally: z.array(z.enum(["mid", "safe", "offlane", "softSupport", "hardSupport"]).nullable()).length(5).optional(),
      enemy: z.array(z.enum(["mid", "safe", "offlane", "softSupport", "hardSupport"]).nullable()).length(5).optional()
    })
    .optional(),
  personalRecords: z
    .record(
      z.string(),
      z.object({
        games: z.number().int().nonnegative(),
        win: z.number().int().nonnegative()
      })
    )
    .optional()
});

app.get("/health", async () => ({ ok: true }));

app.get("/heroes", async () => heroes);

app.post("/recommend", async (request, reply) => {
  const parsed = recommendationSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return { error: "invalid_payload", details: parsed.error.flatten() };
  }

  const payload = parsed.data satisfies RecommendationRequestPayload;
  const personalRecords = payload.personalRecords as PersonalRecordMap | undefined;
  const result = runRecommendation(payload, heroes, personalRecords);
  return result;
});

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
  
