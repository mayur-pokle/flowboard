import { ImageResponse } from "next/og";

// Next.js convention: this file is auto-served at /opengraph-image and
// included as og:image / twitter:image meta. Rendered with satori on
// the Edge runtime.

export const runtime = "edge";
export const alt =
  "Flowboard — Spot content opportunities. Ship them faster.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ── Brand palette (matches the V2 logo SVG) ───────────────────────────
const BAR_DARK = "#4A4DC9"; // first bar, also dashed border stroke
const BAR_MID = "#9596E3"; // third bar
const BAR_LIGHT = "#D5D6FF"; // second bar
const TEXT_DARK = "#162324"; // logo wordmark + headline body
const HEADLINE = "#1B1F3B"; // marketing headline tone
const CARD_BG_VIOLET = "#F2EFFF";
const CARD_TX_VIOLET = "#5B3CD9";
const CARD_BG_TEAL = "#E5F5F0";
const CARD_TX_TEAL = "#15795A";
const CARD_BG_AMBER = "#FEF4E3";
const CARD_TX_AMBER = "#A65A00";
const CARD_BG_SKY = "#E5EEFC";
const CARD_TX_SKY = "#1F4FBA";
const CARD_BG_INDIGO = "#EAE9FB";
const CARD_TX_INDIGO = "#3F2BB3";

// Replicates the V2 dashed border by stacking four dashed lines on a
// rounded rect. Satori doesn't render `stroke-dasharray` from inline
// SVG perfectly, so we use CSS `border: dashed` instead.
function LogoMark({ size: s = 60 }: { size?: number }) {
  const barWidth = s * (11 / 65);
  const barGap = s * (4 / 65);
  const insetTop = s * (6.875 / 65);
  const insetSide = s * (6.875 / 65);
  const barH1 = s * (41.25 / 65);
  const barH2 = s * (20.625 / 65);
  const barH3 = s * (31.625 / 65);
  return (
    <div
      style={{
        width: s,
        height: s,
        borderRadius: s * 0.09,
        border: `2px dashed ${BAR_DARK}`,
        background: "#FAFCFC",
        display: "flex",
        alignItems: "flex-start",
        padding: insetTop,
        gap: barGap,
        boxSizing: "border-box"
      }}
    >
      <div
        style={{
          width: barWidth,
          height: barH1,
          background: BAR_DARK,
          borderRadius: 2
        }}
      />
      <div
        style={{
          width: barWidth,
          height: barH2,
          background: BAR_LIGHT,
          borderRadius: 2
        }}
      />
      <div
        style={{
          width: barWidth,
          height: barH3,
          background: BAR_MID,
          borderRadius: 2
        }}
      />
    </div>
  );
}

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          // Light lavender → blue gradient matching the marketing visual
          background:
            "linear-gradient(135deg, #EFF1FB 0%, #D6DCF6 45%, #B8C2EE 100%)",
          position: "relative",
          fontFamily: "system-ui, sans-serif"
        }}
      >
        {/* Subtle decorative curves in the top-right corner */}
        <svg
          width="540"
          height="320"
          viewBox="0 0 540 320"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", top: 0, right: 0 }}
        >
          <path
            d="M 80 0 Q 320 80 540 30"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeOpacity="0.6"
            fill="none"
          />
          <path
            d="M 0 30 Q 270 200 540 150"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeOpacity="0.4"
            fill="none"
          />
          <path
            d="M 160 0 Q 380 240 540 260"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeOpacity="0.28"
            fill="none"
          />
        </svg>

        {/* ── Left: brand mark + headline ── */}
        <div
          style={{
            width: "46%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 60px"
          }}
        >
          {/* Logo (V2 style) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginBottom: 52
            }}
          >
            <LogoMark size={64} />
            <span
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: TEXT_DARK,
                letterSpacing: "-0.01em"
              }}
            >
              FlowBoard
            </span>
          </div>

          {/* Headline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 64,
              fontWeight: 700,
              color: HEADLINE,
              lineHeight: 1.05,
              letterSpacing: "-0.025em"
            }}
          >
            <span>Spot content</span>
            <span>opportunities.</span>
            <span style={{ marginTop: 20 }}>Ship them faster.</span>
          </div>
        </div>

        {/* ── Right: product preview ── */}
        <div
          style={{
            width: "54%",
            display: "flex",
            alignItems: "center",
            padding: "60px 50px 60px 0"
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "white",
              borderRadius: 18,
              boxShadow: "0 30px 80px rgba(27, 31, 59, 0.18)",
              display: "flex",
              overflow: "hidden"
            }}
          >
            {/* Mini sidebar */}
            <div
              style={{
                width: 150,
                background: "#FAFBFE",
                borderRight: "1px solid #ECEFF6",
                padding: "20px 14px",
                display: "flex",
                flexDirection: "column"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 24
                }}
              >
                <LogoMark size={22} />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: TEXT_DARK
                  }}
                >
                  FlowBoard
                </span>
              </div>
              <NavItem icon="💡" label="Ideas" count="23" />
              <NavItem icon="▦" label="Kanban" count="12" active />
              <NavItem icon="⚙" label="Settings" />
            </div>

            {/* Main */}
            <div
              style={{
                flex: 1,
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column"
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginBottom: 16
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: HEADLINE
                  }}
                >
                  Execution Board
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#8A93A6",
                    marginTop: 2
                  }}
                >
                  12 cards on the board
                </span>
              </div>

              {/* Two columns */}
              <div style={{ display: "flex", gap: 12, flex: 1 }}>
                <Column
                  label="To Do"
                  count={7}
                  dotColor="#94A3B8"
                  cards={[
                    {
                      type: "Framework",
                      tone: {
                        bg: CARD_BG_INDIGO,
                        text: CARD_TX_INDIGO
                      },
                      title: "Standard SaaS Chart of Accounts Framework"
                    },
                    {
                      type: "Framework",
                      tone: {
                        bg: CARD_BG_INDIGO,
                        text: CARD_TX_INDIGO
                      },
                      title: "Series A Due Diligence Financial Framework"
                    },
                    {
                      type: "Calculator",
                      tone: {
                        bg: CARD_BG_VIOLET,
                        text: CARD_TX_VIOLET
                      },
                      title: "Startup Cash Runway and Burn Rate"
                    }
                  ]}
                />
                <Column
                  label="In Progress"
                  count={2}
                  dotColor={BAR_DARK}
                  cards={[
                    {
                      type: "Checklist",
                      tone: { bg: CARD_BG_TEAL, text: CARD_TX_TEAL },
                      title: "48-Hour Month-End Close Checklist for Startups"
                    },
                    {
                      type: "Calculator",
                      tone: {
                        bg: CARD_BG_VIOLET,
                        text: CARD_TX_VIOLET
                      },
                      title: "The Hidden Cost of Manual Accounting Calculator"
                    }
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

// Suppress unused-var warnings for palette constants kept for future use.
void CARD_BG_AMBER;
void CARD_TX_AMBER;
void CARD_BG_SKY;
void CARD_TX_SKY;

// ── Sub-components ─────────────────────────────────────────────────────

function NavItem({
  icon,
  label,
  count,
  active = false
}: {
  icon: string;
  label: string;
  count?: string;
  active?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        marginBottom: 4,
        background: active ? "#EBE9FB" : "transparent",
        color: active ? BAR_DARK : "#5A6578",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: active ? 600 : 500
      }}
    >
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {count ? (
        <span
          style={{
            fontSize: 10,
            background: "#E5E9F2",
            color: "#5A6578",
            padding: "2px 6px",
            borderRadius: 999
          }}
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}

function Column({
  label,
  count,
  dotColor,
  cards
}: {
  label: string;
  count: number;
  dotColor: string;
  cards: Array<{
    type: string;
    title: string;
    tone: { bg: string; text: string };
  }>;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#F8FAFD",
        borderRadius: 10,
        border: "1px dashed #D7DEEA",
        padding: 10
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: dotColor
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: HEADLINE
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 10, color: "#8A93A6" }}>{count}</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}
      >
        {cards.map((c, i) => (
          <div
            key={i}
            style={{
              background: "white",
              border: "1px solid #E5E9F2",
              borderRadius: 6,
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}
          >
            <div
              style={{
                fontSize: 9,
                padding: "2px 6px",
                background: c.tone.bg,
                color: c.tone.text,
                borderRadius: 4,
                alignSelf: "flex-start",
                fontWeight: 600
              }}
            >
              {c.type}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: HEADLINE,
                lineHeight: 1.2
              }}
            >
              {c.title}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
