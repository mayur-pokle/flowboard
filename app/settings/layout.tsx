import { SettingsNav } from "@/components/SettingsNav";

export default function SettingsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <SettingsNav />
      {children}
    </div>
  );
}
