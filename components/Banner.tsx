import Link from "next/link";
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
      <section className="flex min-h-[420px] items-center justify-center bg-[#F5E9E5] px-6 text-center">
        <div className="max-w-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B5838D]">
            Ludimila Reis Closet
          </p>
          <h1 className="mt-4 text-4xl font-light leading-tight text-stone-900 sm:text-6xl">
            Seu próximo look favorito está aqui.
          </h1>
          <Link
            href="#produtos"
            className="mt-7 inline-flex rounded-full bg-stone-900 px-7 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#B5838D]"
          >
            Conhecer a coleção
          </Link>
        </div>
      </section>
    );
  }

  if (mobileSrc === desktopSrc) {
    return (
      <Link
        href="#produtos"
        aria-label="Comprar a coleção em destaque"
        className="group relative block h-[56vw] min-h-[360px] max-h-[680px] w-full overflow-hidden"
      >
        <img
          src={cloudinaryImageUrl(desktopSrc, 1600)}
          srcSet={`${cloudinaryImageUrl(desktopSrc, 800)} 800w, ${cloudinaryImageUrl(desktopSrc, 1600)} 1600w`}
          sizes="100vw"
          alt="Banner da loja"
          width={1600}
          height={900}
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.015]"
        />
      </Link>
    );
  }

  return (
    <Link
      href="#produtos"
      aria-label="Comprar a coleção em destaque"
      className="group relative block h-[56vw] min-h-[360px] max-h-[680px] w-full overflow-hidden"
    >
      <img
        src={cloudinaryImageUrl(mobileSrc, 900)}
        alt="Banner da loja"
        width={900}
        height={1200}
        fetchPriority="high"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.015] md:hidden"
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
        className="hidden h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.015] md:block"
      />
    </Link>
  );
}
