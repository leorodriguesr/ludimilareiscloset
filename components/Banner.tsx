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
          src={desktopSrc}
          alt="Banner da loja"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="relative h-[56vw] min-h-[360px] max-h-[680px] w-full overflow-hidden">
      <img
        src={mobileSrc}
        alt="Banner da loja"
        className="h-full w-full object-cover md:hidden"
      />
      <img
        src={desktopSrc}
        alt="Banner da loja"
        className="hidden h-full w-full object-cover md:block"
      />
    </div>
  );
}
