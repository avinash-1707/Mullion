import { Faq } from "./faq";
import { Reveal } from "./reveal";

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-10">
      <div className="mx-auto w-full max-w-3xl px-6 py-28 sm:px-10 lg:py-36">
        <Reveal>
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember">
            Questions
          </span>
          <h2 className="mt-6 font-serif text-4xl leading-tight text-ink sm:text-5xl">
            Asked and answered.
          </h2>
        </Reveal>
        <Reveal delay={120} className="mt-14">
          <Faq />
        </Reveal>
      </div>
    </section>
  );
}
