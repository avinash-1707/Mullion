interface ChapterMarkProps {
  number: string;
  tone: "dark" | "light";
}

export function ChapterMark({ number, tone }: ChapterMarkProps) {
  return (
    <div>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.3em] ${
          tone === "dark" ? "text-gilt" : "text-ink-faint"
        }`}
      >
        Chapter
      </span>
      <p className="mt-1 font-serif text-5xl leading-none text-ember">{number}</p>
    </div>
  );
}
