interface BannerProps {
  imageUrl: string;
}

export function Banner({ imageUrl }: BannerProps) {
  if (!imageUrl) {
    return (
      <section className="relative w-full h-[300px] sm:h-[420px] lg:h-[520px] bg-gradient-to-r from-stone-900 to-stone-700 flex items-center justify-center">
        <div className="text-center px-6">
          <h1 className="text-3xl sm:text-5xl font-light text-white tracking-widest uppercase">
            Ludimila Reis
          </h1>
          <p className="mt-4 text-sm sm:text-base text-stone-300 tracking-wide">
            Moda feminina com estilo e elegância
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative w-full h-[300px] sm:h-[420px] lg:h-[520px] overflow-hidden">
      <img
        src={imageUrl}
        alt="Banner da loja"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center px-6">
          <h1 className="text-3xl sm:text-5xl font-light text-white tracking-widest uppercase drop-shadow-lg">
            Ludimila Reis
          </h1>
          <p className="mt-4 text-sm sm:text-base text-white/90 tracking-wide drop-shadow">
            Moda feminina com estilo e elegância
          </p>
        </div>
      </div>
    </section>
  );
}
