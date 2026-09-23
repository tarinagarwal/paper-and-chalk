import { IllustrationFrame } from "./frame";

const highlights = [
  { color: "bg-[#e8b730]", text: "within thirty (30) days of the invoice date", page: "p. 4" },
  { color: "bg-pen-vermilion", text: "late payments accrue interest at 2%", page: "p. 4" },
  { color: "bg-pen-cobalt", text: "either party may terminate on notice", page: "p. 7" },
];

export function PdfMarkupIllustration() {
  return (
    <IllustrationFrame label="A contract PDF with colour-coded highlights, a struck-out clause, a redacted phone number, a signature, and a sidebar listing every highlight.">
      <div className="relative mx-auto max-w-[34rem]">
        <div className="relative rounded-[3px] bg-paper-sheet px-6 pt-7 pb-6 text-[#2b2925] shadow-paper sm:mr-36 sm:px-8">
          <p className="font-mono text-[10px] tracking-[0.12em] text-[#57524b]">
            SERVICES AGREEMENT
          </p>
          <h3 className="mt-2 font-display text-[1.25rem] leading-tight">4. Payment terms</h3>
          <div className="mt-3 space-y-2.5 font-display text-[0.8125rem] leading-[1.65]">
            <p>
              4.1 The Client shall pay each invoice{" "}
              <mark className="rounded-[2px] bg-[rgb(232_183_48/0.45)] px-0.5 text-inherit">
                within thirty (30) days of the invoice date
              </mark>
              . Invoices are issued monthly in arrears.
            </p>
            <p>
              4.2 Unless disputed in writing,{" "}
              <mark className="rounded-[2px] bg-[rgb(196_62_24/0.2)] px-0.5 text-inherit">
                late payments accrue interest at 2%
              </mark>{" "}
              per month.{" "}
              <span className="line-through decoration-pen-vermilion decoration-2">
                Fees may change without notice.
              </span>
            </p>
            <p>
              4.3 Billing questions go to the finance desk on{" "}
              <span className="inline-block h-[0.95em] w-24 translate-y-[2px] rounded-[1px] bg-[#1c1b19]">
                <span className="sr-only">redacted</span>
              </span>
              .
            </p>
          </div>
          <div className="mt-5 flex items-end justify-between gap-4 border-t border-dashed border-[#ddd8ce] pt-4">
            <div>
              <svg viewBox="0 0 150 44" className="h-10 w-36" aria-hidden>
                <path
                  d="M6 30 C 14 12, 20 10, 22 22 C 24 34, 16 38, 20 26 C 26 12, 34 18, 34 28 C 34 34, 40 22, 46 20 C 52 18, 50 30, 58 28 C 66 26, 70 14, 76 16 C 82 18, 78 32, 88 30 C 100 28, 112 22, 142 20"
                  fill="none"
                  stroke="#1c1b19"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <p className="font-mono text-[10px] text-[#57524b]">Signed · 23 Sep</p>
            </div>
            <p className="font-mono text-[10px] text-[#57524b]">4 / 11</p>
          </div>
        </div>

        <div className="relative -mt-10 ml-auto w-[min(15rem,88%)] rounded-xl border bg-popover p-3 shadow-popover sm:absolute sm:top-16 sm:right-0 sm:mt-0 sm:w-52">
          <p className="mb-2.5 flex justify-between eyebrow">
            <span>Highlights</span>
            <span>3</span>
          </p>
          <ul className="flex flex-col gap-2.5">
            {highlights.map((h) => (
              <li key={h.text} className="flex gap-2 text-[0.75rem] leading-snug">
                <span aria-hidden className={`${h.color} mt-1 size-2 shrink-0 rounded-full`} />
                <span className="line-clamp-2 text-ink-2">{h.text}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                  {h.page}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </IllustrationFrame>
  );
}
