import { cloudinaryImageUrl } from "@/lib/images/cloudinary-url";

interface BannerProps {
  imageUrl: string;
  mobileImageUrl?: string;
}

export function Banner({ imageUrl, mobileImageUrl = "" }: BannerProps) {
  const mobileSrc = mobileImageUrl || imageUrl;
  const desktopSrc = imageUrl || mobileImageUrl;

  if (!desktopSrc) {
    return (
      <div className="relative h-[56vw] min-h-[360px] max-h-[680px] w-full bg-stone-100" />
    );
  }

  if (mobileSrc === desktopSrc) {
    return (
      <div className="relative h-[56vw] min-h-[360px] max-h-[680px] w-full overflow-hidden">
        <img
          src={cloudinaryImageUrl(desktopSrc, 1600)}
          srcSet={`${cloudinaryImageUrl(desktopSrc, 800)} 800w, ${cloudinaryImageUrl(desktopSrc, 1600)} 1600w`}
          sizes="100vw"
          alt="Banner da loja"
          width={1600}
          height={900}
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="relative h-[56vw] min-h-[360px] max-h-[680px] w-full overflow-hidden">
      <img
        src={cloudinaryImageUrl(mobileSrc, 900)}
        alt="Banner da loja"
        width={900}
        height={1200}
        fetchPriority="high"
        decoding="async"
        className="h-full w-full object-cover md:hidden"
      />
      <img
        src={cloudinaryImageUrl(desktopSrc, 1600)}
        srcSet={`${cloudinaryImageUrl(desktopSrc, 800)} 800w, ${cloudinaryImageUrl(desktopSrc, 1600)} 1600w`}
        sizes="100vw"
        alt="Banner da loja"
        width={1600}
        height={900}
        fetchPriority="high"
        decoding="async"
        className="hidden h-full w-full object-cover md:block"
      />
    </div>
  );
}
