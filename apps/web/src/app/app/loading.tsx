import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div
      className="flex flex-1 flex-col gap-6 px-4 pt-6 sm:px-8 sm:pt-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="flex gap-2 border-b pb-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="ml-auto h-7 w-20" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-5 sm:grid-cols-[repeat(auto-fill,minmax(184px,1fr))]">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 p-1.5">
            <Skeleton className="aspect-4/3 w-full rounded-md" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
