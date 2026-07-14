import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  analyzedTopics,
  settings,
  competitors as competitorsTable
} from "@/db/schema";
import { withAuth, serverError } from "@/lib/api";
import { enrichTopic } from "@/lib/topic-enricher";
import type { AnalysisResult } from "@/lib/topic-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/analyzer/[id]/enrich
// Calls Gemini (with OpenAI + Anthropic fallback) to add:
//   • Alternate headline variants
//   • Competitor coverage summary + gaps
//   • Community-signal read
//   • AI citation insights
// Stores the enrichment payload on the row.
export const POST = withAuth(
  async (_user, _req, ctx: { params: { id: string } }) => {
    try {
      const [row] = await db
        .select()
        .from(analyzedTopics)
        .where(eq(analyzedTopics.id, ctx.params.id))
        .limit(1);
      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (!row.analysis) {
        return NextResponse.json(
          { error: "Topic has no analysis yet — cannot enrich." },
          { status: 400 }
        );
      }

      const [brandRow] = await db
        .select()
        .from(settings)
        .where(eq(settings.id, "workspace"))
        .limit(1);
      const compRows = await db.select().from(competitorsTable);

      const result = await enrichTopic(
        {
          analysis: row.analysis as AnalysisResult,
          brand: {
            companyName: brandRow?.companyName || undefined,
            brandNiche: brandRow?.brandNiche || undefined,
            brandAudience: brandRow?.brandAudience || undefined
          },
          competitors: compRows.map((c) => ({ name: c.name, url: c.url })),
          notes: row.notes || undefined
        },
        {
          gemini: process.env.GEMINI_API_KEY || undefined,
          openai: process.env.OPENAI_API_KEY || undefined,
          anthropic: process.env.ANTHROPIC_API_KEY || undefined,
          geminiModel: brandRow?.geminiModel || undefined,
          openaiModel: brandRow?.openaiModel || undefined,
          anthropicModel: brandRow?.anthropicModel || undefined
        }
      );

      // Persist even the "unavailable" result — the UI shows the
      // warnings so the strategist knows what went wrong.
      await db
        .update(analyzedTopics)
        .set({
          enrichment: result,
          updatedAt: new Date()
        })
        .where(eq(analyzedTopics.id, ctx.params.id));

      return NextResponse.json({ ok: true, enrichment: result });
    } catch (err) {
      return serverError(err);
    }
  }
);
