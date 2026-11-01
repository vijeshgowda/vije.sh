"use client";

import { useEffect, useRef, type ComponentProps } from "react";

export type Shape = "portrait" | "landscape";

/**
 * A <video> bound to a MediaStream. `version` re-binds after the stream's tracks change.
 * `onShape` reports whether the incoming frames are portrait or landscape (a phone camera, a
 * laptop camera or a shared screen) and again whenever that changes.
 */
export function StreamVideo({
  stream,
  version = 0,
  onShape,
  ...rest
}: {
  stream: MediaStream | null;
  version?: number;
  onShape?: (shape: Shape | null) => void;
} & Omit<ComponentProps<"video">, "src">) {
  const ref = useRef<HTMLVideoElement>(null);
  const shapeRef = useRef(onShape);
  useEffect(() => {
    shapeRef.current = onShape;
  });

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    const resume = () => {
      if (!stream || document.hidden || !video.paused) return;
      void video.play?.()?.catch(() => undefined);
    };
    resume();
    if (!stream) return () => void (video.srcObject = null);

    // iOS pauses every <video> when the app goes to the background and never resumes a
    // MediaStream on its own, so the peer's camera or shared screen froze after a minimise.
    const onVisibility = () => {
      if (!document.hidden) resume();
    };
    const onPause = () => setTimeout(resume, 0);
    const tracks = stream.getVideoTracks();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    video.addEventListener("pause", onPause);
    tracks.forEach((track) => track.addEventListener("unmute", resume));
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      video.removeEventListener("pause", onPause);
      tracks.forEach((track) => track.removeEventListener("unmute", resume));
      video.srcObject = null;
    };
  }, [stream, version]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let last: Shape | null | undefined;
    const report = () => {
      const { videoWidth: width, videoHeight: height } = video;
      const shape = width && height ? (height > width ? "portrait" : "landscape") : null;
      if (shape === last) return;
      last = shape;
      shapeRef.current?.(shape);
    };
    report();
    video.addEventListener("loadedmetadata", report);
    video.addEventListener("resize", report);
    return () => {
      video.removeEventListener("loadedmetadata", report);
      video.removeEventListener("resize", report);
    };
  }, [stream, version]);

  return <video ref={ref} autoPlay playsInline {...rest} />;
}
