"use client";

import { useId, useState } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What can I build with Mullion?",
    answer:
      "Web apps, APIs, dashboards, and services. If you can describe it, the agents can plan it. You see and approve the full plan before anything gets built.",
  },
  {
    question: "Do I need to know how to code?",
    answer:
      "No. The plan is written in plain language, with a diagram you can read at a glance. If you do code, you can export the full specs and build it your own way instead.",
  },
  {
    question: "Can I change the plan?",
    answer:
      "Yes, freely, while it is being drawn up. Edit the diagram, question a decision, reshape the whole thing. Once you confirm it and the build starts, the agents follow it exactly and check in with you at the big decisions.",
  },
  {
    question: "What happens if a build gets stuck?",
    answer:
      "It pauses and asks you. You choose how to move forward. And even a partial build is packaged and delivered like a finished one, so you never walk away with nothing.",
  },
  {
    question: "Who owns the code?",
    answer:
      "You do, fully. Every build is delivered as a clean archive or pushed straight to your own GitHub. Nothing stays locked inside Mullion.",
  },
  {
    question: "Is my idea private?",
    answer:
      "Yes. Your sessions belong to your workspace alone, and every AI call is routed only through providers that retain none of your data.",
  },
];

// One panel open at a time: the reader is comparing answers, not stacking
// them, and a single focus keeps the rhythm of the page calm.
export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className="border-t border-hairline-light">
      {FAQ_ITEMS.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;

        return (
          <div key={item.question} className="border-b border-hairline-light">
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="group flex w-full items-baseline justify-between gap-6 py-6 text-left transition-colors duration-200 hover:text-ember"
              >
                <span className="font-serif text-xl text-ink transition-colors duration-200 group-hover:text-ember sm:text-2xl">
                  {item.question}
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 font-serif text-2xl leading-none text-ember transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isOpen ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className="lp-faq-panel"
              data-open={isOpen}
            >
              <div>
                <p className="max-w-2xl pb-7 text-base leading-relaxed text-ink-muted">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
