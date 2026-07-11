import Image from "next/image";

interface MullionMarkProps {
  className?: string;
}

// Brand mark: a cube mid-assembly, gold wireframe on one side (the plan)
// becoming a solid ultramarine build on the other. Rendered from the
// generated logo artwork (public/brand/logo-mark.png, transparent); the source
// master lives at public/brand/logo.png.
export function MullionMark({ className = "h-6 w-6" }: MullionMarkProps) {
  return (
    <Image
      src="/brand/logo-mark.png"
      alt=""
      aria-hidden="true"
      width={48}
      height={48}
      className={`${className} object-contain`}
    />
  );
}
