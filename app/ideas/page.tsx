"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Send,
  Search,
  Filter,
  RefreshCw,
  Settings as SettingsIcon
} from "lucide-react";
import { useStore, useHasHydrated } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { TopicCard } from "@/components/TopicCard";
import { toast } from "@/components/Toast";
import type {
  ContentType,
  Priority,
  SearchIntentType,
  Topic
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

const TYPES: ContentType[] = [
  "Calculator",
  "Template",
  "Guide",
  "Whitepaper",
  "Checklist",
  "Framework"
];
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];
const INTENTS: SearchIntentType[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational"
];

export default function IdeasPage() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const topics = useStore((s) => s.topics);
  const tasks = useStore((s) => s.tasks);
  const addTopics = useStore((s) => s.addTopics);
  const deleteTopic = useStore((s) => s.deleteTopic);
  const moveTopicToBoard = useStore((s) => s.moveTopicToBoard);
  const settings = useStore((s) => s.settings);
  const lastGeneratedAt = useStore((s) => s.lastGeneratedAt);
  const setLastGeneratedAt = useStore((s) => s.setLastGeneratedAt);
  const deletedTopicHashes = useStore((s) => s.deletedTopicHashes);
  const movedTopicHashes = useStore((s) => s.movedTopicHashes);

  const [generating, setGenerating] = useState(false);
  const [sendingSlack, setSendingSlack] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<ContentType | "all">("all");
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all");
  const [filterIntent, setFilterIntent] = useState<SearchIntentType | "all">(
    "all"
  );
  const [minImpact, setMinImpact] = useState(0);
  const [minNovelty, setMinNovelty] = useState(0);
  const [hideOverlap, setHideOverlap] = useState(false);

  const filtered = useMemo(() => {
    return topics
      .filter((t) =>
        filterType === "all" ? true : t.contentType === filterType
      )
      .filter((t) =>
        filterPriority === "all" ? true : t.priority === filterPriority
      )
      .filter((t) =>
        filterIntent === "all" ? true : t.intent === filterIntent
      )
      .filter((t) =>
        minImpact === 0 ? true : (t.impactScore ?? t.priorityScore) >= minImpact
      )
      .filter((t) =>
        minNovelty === 0 ? true : (t.noveltyScore ?? 100) >= minNovelty
      )
      .filter((t) => (hideOverlap ? !t.overlapWithUrl : true))
      .filter((t) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.targetKeyword.toLowerCase().includes(q) ||
          t.whyOpportunity.toLowerCase().includes(q)
        );
      })
      // Default sort: weighted blend of impact + novelty + priority.
      .sort((a, b) => {
        const ai =
          (a.impactScore ?? a.priorityScore) * 0.5 +
          (a.noveltyScore ?? 100) * 0.3 +
          a.priorityScore * 0.2;
        const bi =
          (b.impactScore ?? b.priorityScore) * 0.5 +
          (b.noveltyScore ?? 100) * 0.3 +
          b.priorityScore * 0.2;
        return bi - ai;
      });
  }, [
    topics,
    search,
    filterType,
    filterPriority,
    filterIntent,
    minImpact,
    minNovelty,
    hideOverlap
  ]);

  async function handleGenerate(count = 8) {
    setGenerating(true);
    try {
      const recentTitles = [
        ...topics.map((t) => t.title),
        ...tasks.map((t) => t.topic.title)
      ].slice(0, 50);
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (settings.openaiModel)
        headers["x-openai-model"] = settings.openaiModel;
      if (settings.geminiModel)
        headers["x-gemini-model"] = settings.geminiModel;
      if (settings.primaryProvider)
        headers["x-primary-provider"] = settings.primaryProvider;
      const seedKeywordsList = settings.seedKeywords
        ? settings.seedKeywords
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const topicsToAvoidList = settings.topicsToAvoid
        ? settings.topicsToAvoid
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const res = await fetch("/api/generate-topics", {
        method: "POST",
        headers,
        body: JSON.stringify({
          count,
          brandNiche: settings.brandNiche,
          brandAudience: settings.brandAudience,
          companyName: settings.companyName,
          websiteUrl: settings.websiteUrl,
          productDescription: settings.productDescription,
          valueProposition: settings.valueProposition,
          brandVoice: settings.brandVoice,
          primaryCta: settings.primaryCta,
          primaryGeo: settings.primaryGeo,
          competitors: settings.competitors,
          seedKeywords: seedKeywordsList,
          topicsToAvoid: topicsToAvoidList,
          recentTitles
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      const incoming = data.topics as Topic[];
      const { added, skipped } = await addTopics(incoming);
      await setLastGeneratedAt(new Date().toISOString());

      // Surface provider failures explicitly — falling back to mock silently
      // is what created the "I added a key but still see mock" confusion.
      const warnings: string[] = Array.isArray(data.warnings)
        ? data.warnings
        : [];
      for (const w of warnings) toast(w, "error");

      // If a key was provided but we still ended up on mock, say so plainly.
      const triedAnyKey =
        data.keysSeen?.openai || data.keysSeen?.gemini || false;
      if (data.provider === "mock" && triedAnyKey && warnings.length === 0) {
        toast(
          "AI providers returned no usable response — falling back to mock.",
          "error"
        );
      }

      // Tone of the success toast depends on what actually happened.
      const providerLabel =
        data.provider === "mock"
          ? triedAnyKey
            ? " (mock fallback — see error above)"
            : " (mock — add an API key in Settings for live AI)"
          : ` via ${data.provider}`;

      if (added === 0 && skipped > 0) {
        toast(
          `All ${skipped} topic${
            skipped === 1 ? "" : "s"
          } matched existing ideas or your dedup memory${providerLabel}. Try generating again, or fill in more brand context in Settings for fresher angles.`,
          "info"
        );
      } else {
        toast(
          `Added ${added} new idea${added === 1 ? "" : "s"}${
            skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : ""
          }${providerLabel}`,
          added > 0 ? "success" : "info"
        );
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSendSlack() {
    if (!filtered.length) {
      toast("No ideas to send. Generate some first.", "info");
      return;
    }
    setSendingSlack(true);
    try {
      const res = await fetch("/api/slack/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topics: filtered,
          appUrl:
            typeof window !== "undefined"
              ? `${window.location.origin}/ideas`
              : ""
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Slack failed");
      toast("Posted to Slack", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSendingSlack(false);
    }
  }

  async function handleMove(id: string) {
    try {
      const task = await moveTopicToBoard(id);
      if (task) {
        toast("Moved to Kanban", "success");
      }
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  // First-run: no topics? auto-generate to fill the page.
  useEffect(() => {
    if (!hydrated) return;
    if (topics.length === 0 && tasks.length === 0 && !lastGeneratedAt) {
      handleGenerate(8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated) {
    return <PageHeader title="Ideas" subtitle="Loading…" />;
  }

  return (
    // min-h-0 is required so that the inner `flex-1 overflow-auto` actually
    // scrolls instead of letting the wrapper grow with the content.
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <PageHeader
        title="Content Opportunity Ideas"
        subtitle={
          lastGeneratedAt
            ? `Last batch generated ${formatDate(lastGeneratedAt)} · ${
                topics.length
              } ideas in pool · ${
                deletedTopicHashes.length + movedTopicHashes.length
              } in memory`
            : "Generate your first batch of ideas"
        }
        right={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              loading={sendingSlack}
              onClick={handleSendSlack}
            >
              <Send className="size-4" />
              Send to Slack
            </Button>
            <Button
              variant="primary"
              loading={generating}
              onClick={() => handleGenerate(8)}
            >
              <Sparkles className="size-4" />
              Generate Ideas
            </Button>
          </div>
        }
      />

      {hydrated &&
      !settings.companyName.trim() &&
      !settings.productDescription.trim() &&
      settings.competitors.length === 0 ? (
        <div className="mx-8 mt-4 card p-3 border-amber-200 bg-amber-50/60 flex items-center gap-3">
          <SettingsIcon className="size-4 text-amber-600 shrink-0" />
          <div className="text-sm text-ink-800 flex-1">
            Add your company, product, and competitors in{" "}
            <Link
              href="/settings/api"
              className="text-brand-700 underline hover:no-underline"
            >
              Settings
            </Link>{" "}
            to get topics tailored to your offering instead of generic ones.
          </div>
        </div>
      ) : null}

      <div className="px-8 py-4 border-b border-ink-200 bg-white flex items-center gap-3 flex-wrap shrink-0">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, keyword, or rationale"
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Filter className="size-4 text-ink-400" />
          <select
            value={filterType}
            onChange={(e) =>
              setFilterType(e.target.value as ContentType | "all")
            }
            className="input !w-auto !py-1.5"
          >
            <option value="all">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={(e) =>
              setFilterPriority(e.target.value as Priority | "all")
            }
            className="input !w-auto !py-1.5"
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={filterIntent}
            onChange={(e) =>
              setFilterIntent(e.target.value as SearchIntentType | "all")
            }
            className="input !w-auto !py-1.5"
          >
            <option value="all">All intents</option>
            {INTENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select
            value={minImpact}
            onChange={(e) => setMinImpact(Number(e.target.value))}
            className="input !w-auto !py-1.5"
            title="Minimum impact score"
          >
            <option value={0}>Impact: any</option>
            <option value={50}>Impact ≥ 50</option>
            <option value={70}>Impact ≥ 70</option>
            <option value={85}>Impact ≥ 85</option>
          </select>
          <select
            value={minNovelty}
            onChange={(e) => setMinNovelty(Number(e.target.value))}
            className="input !w-auto !py-1.5"
            title="Minimum novelty score (anti-cannibalization)"
          >
            <option value={0}>Novelty: any</option>
            <option value={50}>Novelty ≥ 50</option>
            <option value={70}>Novelty ≥ 70</option>
            <option value={85}>Novelty ≥ 85</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideOverlap}
              onChange={(e) => setHideOverlap(e.target.checked)}
              className="size-3.5 accent-brand-600"
            />
            Hide flagged overlaps
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin px-8 py-6">
        {filtered.length === 0 ? (
          <EmptyState
            generating={generating}
            onGenerate={() => handleGenerate(8)}
            hasFilters={
              !!search || filterType !== "all" || filterPriority !== "all"
            }
          />
        ) : (
          <div className="flex flex-col gap-3 max-w-5xl">
            {filtered.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                onMove={() => handleMove(topic.id)}
                onDelete={async () => {
                  try {
                    await deleteTopic(topic.id);
                    toast("Idea removed — won't show again", "info");
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  right
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-8 h-16 flex items-center justify-between border-b border-ink-200 bg-white shrink-0">
      <div>
        <h1 className="text-base font-semibold text-ink-900 leading-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-xs text-ink-500 leading-tight">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function EmptyState({
  generating,
  onGenerate,
  hasFilters
}: {
  generating: boolean;
  onGenerate: () => void;
  hasFilters: boolean;
}) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="size-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
        <Sparkles className="size-6" />
      </div>
      <h2 className="text-lg font-semibold text-ink-900 mb-1">
        {hasFilters ? "No ideas match your filters" : "No ideas yet"}
      </h2>
      <p className="text-sm text-ink-600 mb-6">
        {hasFilters
          ? "Try clearing filters or generating a new batch."
          : "Generate a batch of fresh content opportunities — calculators, templates, guides, and more."}
      </p>
      <Button variant="primary" loading={generating} onClick={onGenerate}>
        {generating ? null : <RefreshCw className="size-4" />}
        Generate ideas
      </Button>
    </div>
  );
}
