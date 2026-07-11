import { Separator } from "@/components/ui/separator";

export function AuthDivider({ children = "or" }: { children?: string }) {
  return (
    <div className="flex items-center gap-4">
      <Separator className="flex-1" />
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">{children}</span>
      <Separator className="flex-1" />
    </div>
  );
}
