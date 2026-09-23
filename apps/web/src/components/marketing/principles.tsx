import { budgets, principles } from "@/content/home";

/** Always chalkboard, in both themes. */
export function Principles() {
  return (
    <section
      aria-labelledby="principles-title"
      className="relative overflow-hidden bg-chalkboard py-section-sm text-chalk sm:py-section"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(var(--chalkboard-dot) 1px, transparent 1.2px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="relative container-page flex flex-col gap-14">
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="font-mono text-xs tracking-[0.08em] text-[#9a948a] uppercase">
            How it&rsquo;s built
          </p>
          <h2
            id="principles-title"
            className="font-display text-[2.125rem] leading-[1.08] tracking-[-0.018em] text-balance sm:text-h2"
          >
            Feels like paper. <span className="text-[#ff7447] italic">Built like a database.</span>
          </h2>
        </div>

        <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((p, i) => (
            <li key={p.title} className="flex flex-col gap-3 border-t border-[#3d3f44] pt-5">
              <span className="font-mono text-xs text-[#9a948a]">0{i + 1}</span>
              <h3 className="font-display text-[1.5rem] leading-tight">{p.title}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-[#c9c3b6]">{p.body}</p>
            </li>
          ))}
        </ul>

        <div className="rounded-2xl border border-[#3d3f44] bg-[#141517]/60 p-6 sm:p-8">
          <p className="font-mono text-xs tracking-[0.08em] text-[#9a948a] uppercase">
            Performance budgets we build against
          </p>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {budgets.map((b) => (
              <div key={b.label} className="flex flex-col gap-1">
                <dt className="order-2 text-sm text-[#c9c3b6]">{b.label}</dt>
                <dd className="order-1 font-display text-[2.75rem] leading-none tracking-[-0.02em]">
                  {b.prefix ? <span className="text-[#9a948a]">{b.prefix} </span> : null}
                  {b.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
