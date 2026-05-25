import { SettingsNav } from "@/components/SettingsNav";

export default function SettingsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    // min-h-0 propagates the bounded height through the SettingsNav + page
    // children so the inner content scrolls instead of pushing the whole
    // shell. SettingsNav stays pinned at the top.
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <SettingsNav />
      {children}
    </div>
  );
}
