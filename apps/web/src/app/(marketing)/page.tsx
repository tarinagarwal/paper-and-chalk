import { Audiences } from "@/components/marketing/audiences";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { DocTypes } from "@/components/marketing/doc-types";
import { Faq } from "@/components/marketing/faq";
import { FeatureSection } from "@/components/marketing/feature-section";
import { Hero } from "@/components/marketing/hero";
import { CanvasBoardIllustration } from "@/components/marketing/illustrations/canvas-board";
import { CollabIllustration } from "@/components/marketing/illustrations/collab";
import { NotebooksIllustration } from "@/components/marketing/illustrations/notebooks";
import { PdfMarkupIllustration } from "@/components/marketing/illustrations/pdf-markup";
import { PensIllustration } from "@/components/marketing/illustrations/pens";
import { Pricing } from "@/components/marketing/pricing";
import { Principles } from "@/components/marketing/principles";
import { SecondaryFeatures } from "@/components/marketing/secondary-features";
import { primaryFeatures } from "@/content/home";

const illustrations: Record<string, React.ReactNode> = {
  pdf: <PdfMarkupIllustration />,
  notebooks: <NotebooksIllustration />,
  ink: <PensIllustration />,
  canvas: <CanvasBoardIllustration />,
  collaboration: <CollabIllustration />,
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <DocTypes />
      <div id="features" className="scroll-mt-16">
        {primaryFeatures.map((feature, i) => (
          <FeatureSection
            key={feature.id}
            feature={feature}
            illustration={illustrations[feature.id]}
            flip={i % 2 === 1}
          />
        ))}
        <SecondaryFeatures />
      </div>
      <Principles />
      <Audiences />
      <Pricing />
      <Faq />
      <ClosingCta />
    </>
  );
}
