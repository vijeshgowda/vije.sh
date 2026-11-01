"use client";

import { useEffect, useRef, type ComponentProps } from "react";

/** A <video> bound to a MediaStream. `version` re-binds after the stream's tracks change. */
export function StreamVideo({
  stream,
  version = 0,
  ...rest
}: { stream: MediaStream | null; version?: number } & Omit<ComponentProps<"video">, "src">) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play?.()?.catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream, version]);
  return <video ref={ref} autoPlay playsInline {...rest} />;
}
