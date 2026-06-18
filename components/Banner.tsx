interface BannerProps {
  imageUrl: string;
}

export function Banner({ imageUrl }: BannerProps) {
  if (!imageUrl) {
  return (
    <div className="relative h-[56vw] min-h-[360px] max-h-[680px] w-full bg-stone-100" />
  );
  }

  return (
    <div className="relative h-[56vw] min-h-[360px] max-h-[680px] w-full overflow-hidden">
      <img
        src={imageUrl}
        alt="Banner da loja"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
