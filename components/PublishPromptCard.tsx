"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/Toast";
import { copyToClipboard } from "@/lib/utils";

// ── Shared "Publish to Webflow via Claude MCP" card ──────────────────
//
// Pure UI — both AI Resources tasks AND AI Discovery opportunities
// build their prompt at the call site (via lib/publish-prompt.ts) and
// drop the resulting string in here. Identical visual on both surfaces
// so the publish action feels the same regardless of where the article
// came from.

export function PublishPromptCard({
  prompt,
  candidateCount
}: {
  prompt: string;
  // For the "references N pages for interlinking" hint.
  candidateCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyToClipboard(prompt);
      setCopied(true);
      toast("Prompt copied — paste it into Claude Desktop", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="rounded-md border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="size-8 rounded-md bg-brand-100 text-brand-700 grid place-items-center shrink-0">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-semibold text-ink-900">
                Publish to Webflow
              </h3>
              <Badge tone="info">via Claude MCP</Badge>
            </div>
            <p className="text-xs text-ink-700 leading-relaxed">
              Copy the prompt below and paste it into{" "}
              <a
                href="https://claude.ai/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 underline hover:no-underline inline-flex items-center gap-0.5"
              >
                Claude Desktop
                <ExternalLink className="size-3" />
              </a>{" "}
              with the Webflow connector enabled. Claude will create the
              CMS item as a draft AND suggest internal links from your
              Content Library.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Button variant="primary" onClick={handleCopy} className="!py-1.5">
          {copied ? (
            <>
              <Check className="size-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-4" />
              Copy prompt
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setExpanded((v) => !v)}
          className="!py-1.5"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4" />
              Hide preview
            </>
          ) : (
            <>
              <ChevronDown className="size-4" />
              Show preview
            </>
          )}
        </Button>
        <span className="text-[11px] text-ink-500">
          {prompt.length.toLocaleString()} chars · references{" "}
          {candidateCount} {candidateCount === 1 ? "page" : "pages"} for
          interlinking
        </span>
      </div>

      {expanded ? (
        <pre className="bg-ink-900 text-ink-100 p-3 rounded text-[11px] overflow-auto max-h-96 scrollbar-thin font-mono leading-relaxed whitespace-pre-wrap break-words">
          {prompt}
        </pre>
      ) : (
        <div className="text-[11px] text-ink-500 italic">
          Click <strong>Show preview</strong> if you want to read or edit
          the prompt before copying.
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-brand-200 text-[11px] text-ink-600">
        <strong className="text-ink-800">First time?</strong> In Claude
        Desktop → Settings → Connectors → enable Webflow. You&apos;ll be
        prompted to authorize against your Webflow workspace. The free
        Webflow plan can&apos;t publish to a live domain — you need a paid
        Site plan to push past the staging URL.
      </div>
    </div>
  );
}
