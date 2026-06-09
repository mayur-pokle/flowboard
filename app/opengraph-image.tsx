import { ImageResponse } from "next/og";

// Next.js convention: this file is auto-served at /opengraph-image and
// included as the og:image / twitter:image. Edge runtime for fast cold
// starts; rendered on-demand with the satori engine inside ImageResponse.

export const runtime = "edge";
export const alt =
  "Flowboard — Spot content opportunities. Ship them faster.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ──────────────────────────────────────────────────────────────────────
// Design notes:
// - Background uses a soft lavender → blue gradient matching the brand.
// - Left half = brand mark + headline.
// - Right half = a stylized Flowboard kanban preview so a viewer can
//   instantly tell what the product looks like.
// - Satori (the rendering engine inside next/og) only supports a CSS
//   subset. Notably: every container with multiple children must set
//   `display: flex`, `aspectRatio` is unsupported, fonts are limited to
//   what's loaded. We rely on Satori's default font here to avoid having
//   to fetch and pass a webfont binary at runtime.
// ──────────────────────────────────────────────────────────────────────

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "linear-gradient(135deg, #EAEDFC 0%, #C9D4F5 50%, #AAB7EE 100%)",
          position: "relative"
        }}
      >
        {/* ── Subtle top-right decorative curves ── */}
        <svg
          width="500"
          height="280"
          viewBox="0 0 500 280"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", top: 0, right: 0 }}
        >
          <path
            d="M 100 0 Q 350 100 500 50"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeOpacity="0.55"
            fill="none"
          />
          <path
            d="M 0 30 Q 250 180 500 140"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeOpacity="0.4"
            fill="none"
          />
          <path
            d="M 150 0 Q 380 220 500 230"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeOpacity="0.28"
            fill="none"
          />
        </svg>

        {/* ── Left: brand mark + headline ── */}
        <div
          style={{
            width: "48%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 64px"
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 56
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                border: "3px solid #3B3B3B",
                borderRadius: 8,
                display: "flex",
                alignItems: "flex-end",
                padding: 6,
                gap: 4
              }}
            >
              <div
                style={{
                  width: 11,
                  height: 41,
                  background: "#2464CA",
                  borderRadius: 2
                }}
              />
              <div
                style={{
                  width: 11,
                  height: 21,
                  background: "#2464CA",
                  opacity: 0.35,
                  borderRadius: 2
                }}
              />
              <div
                style={{
                  width: 11,
                  height: 32,
                  background: "#2464CA",
                  opacity: 0.65,
                  borderRadius: 2
                }}
              />
            </div>
            <span
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: "#3B3B3B",
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
              color: "#1E2540",
              lineHeight: 1.05,
              letterSpacing: "-0.02em"
            }}
          >
            <span>Spot content</span>
            <span>opportunities.</span>
            <span style={{ marginTop: 20 }}>Ship them faster.</span>
          </div>
        </div>

        {/* ── Right: kanban preview ── */}
        <div
          style={{
            width: "52%",
            display: "flex",
            alignItems: "center",
            padding: "70px 56px 70px 0"
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "white",
              borderRadius: 16,
              boxShadow: "0 30px 80px rgba(30, 37, 64, 0.18)",
              display: "flex",
              overflow: "hidden"
            }}
          >
            {/* Mini sidebar */}
            <div
              style={{
                width: 140,
                background: "#FAFBFE",
                borderRight: "1px solid #ECEFF6",
                padding: "20px 14px",
                display: "flex",
                flexDirection: "column"
              }}
            >
              {/* Mini logo */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 24
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    border: "1.5px solid #3B3B3B",
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 2,
                    gap: 1
                  }}
                >
                  <div
                    style={{
                      width: 3,
                      height: 12,
                      background: "#2464CA",
                      borderRadius: 1
                    }}
                  />
                  <div
                    style={{
                      width: 3,
                      height: 6,
                      background: "#2464CA",
                      opacity: 0.35,
                      borderRadius: 1
                    }}
                  />
                  <div
                    style={{
                      width: 3,
                      height: 9,
                      background: "#2464CA",
                      opacity: 0.65,
                      borderRadius: 1
                    }}
                  />
                </div>
                <span
                  style={{ fontSize: 13, fontWeight: 700, color: "#3B3B3B" }}
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
                  marginBottom: 18
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#1E2540"
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
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  flex: 1
                }}
              >
                <Column
                  label="To Do"
                  count={7}
                  dotColor="#94A3B8"
                  cards={[
                    {
                      type: "Framework",
                      tone: { bg: "#F2EFFF", text: "#6432C2" },
                      title: "Standard SaaS Chart of Accounts Framework"
                    },
                    {
                      type: "Framework",
                      tone: { bg: "#F2EFFF", text: "#6432C2" },
                      title: "Series A Due Diligence Financial Framework"
                    },
                    {
                      type: "Calculator",
                      tone: { bg: "#F1ECFE", text: "#6432C2" },
                      title: "Startup Cash Runway and Burn Rate"
                    }
                  ]}
                />
                <Column
                  label="In Progress"
                  count={2}
                  dotColor="#2464CA"
                  cards={[
                    {
                      type: "Checklist",
                      tone: { bg: "#E5F5F0", text: "#15795A" },
                      title: "48-Hour Month-End Close Checklist for Startups"
                    },
                    {
                      type: "Calculator",
                      tone: { bg: "#F1ECFE", text: "#6432C2" },
                      title: "The Hidden Cost of Manual Accounting"
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

// ── Sub-components ────────────────────────────────────────────────────

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
        background: active ? "#E8EEFC" : "transparent",
        color: active ? "#1F4FBA" : "#5A6578",
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
          style={{ fontSize: 11, fontWeight: 700, color: "#1E2540" }}
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
                color: "#1E2540",
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
