"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export function HomeMarquee({ messages }: { messages: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const [repeat, setRepeat] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const unit = unitRef.current;
    if (!container || !unit) return;

    const measure = () => {
      const unitWidth = unit.scrollWidth;
      if (unitWidth <= 0) return;
      setRepeat(Math.max(1, Math.ceil(container.clientWidth / unitWidth)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="overflow-hidden border-b border-stone-200 bg-[#F7F4F1] py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-stone-700"
    >
      <div
        className="flex w-max animate-[home-marquee_32s_linear_infinite]"
        style={{ animationDuration: `${repeat * 32}s` }}
      >
        {Array.from({ length: repeat * 2 }, (_, index) => (
          <MarqueeCopy
            key={index}
            messages={messages}
            hidden={index > 0}
            unitRef={index === 0 ? unitRef : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function MarqueeCopy({
  messages,
  hidden = false,
  unitRef,
}: {
  messages: string[];
  hidden?: boolean;
  unitRef?: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <span ref={unitRef} className="flex shrink-0" aria-hidden={hidden || undefined}>
      {messages.map((message) => (
        <span key={message} className="flex items-center whitespace-nowrap">
          <span>{message}</span>
          <span className="px-16"></span>
        </span>
      ))}
    </span>
  );
}
