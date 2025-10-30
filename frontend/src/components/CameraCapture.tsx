"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, Video } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
  onStreamReady?: (stream: MediaStream | null) => void;
  onCaptureStart?: () => void;
  onCaptureEnd?: () => void;
}

interface CaptureState {
  status: "idle" | "initialising" | "ready" | "error";
  message?: string;
}

export type CameraCaptureHandle = {
  capture: () => Promise<void>;
  isReady: boolean;
};

export const CameraCapture = forwardRef<CameraCaptureHandle, CameraCaptureProps>(function CameraCapture(
  { onCapture, onCancel, onStreamReady, onCaptureStart, onCaptureEnd }: CameraCaptureProps,
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: "initialising",
    message: "Requesting camera access...",
  });
  const [internalCapturePending, setInternalCapturePending] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function startStream() {
      try {
        setCaptureState({ status: "initialising", message: "Requesting camera access..." });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        onStreamReady?.(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        setCaptureState({ status: "ready" });
      } catch (error) {
        console.error("Unable to access camera", error);
        setCaptureState({
          status: "error",
          message:
            "We couldn't access your camera. Please grant permission or ensure another application isn't using it.",
        });
      }
    }

    startStream();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      onStreamReady?.(null);
    };
  }, [onStreamReady]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to access drawing context");
      }
      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92),
      );

      if (!blob) {
        throw new Error("Unable to process captured frame");
      }

      const capturedFile = new File([blob], `dermasense-capture-${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });

      onCapture(capturedFile);
    } catch (error) {
      console.error("Failed to capture frame", error);
      setCaptureState({
        status: "error",
        message: "Unable to capture image. Please retry or fall back to manual upload.",
      });
      throw error;
    }
  }, [onCapture]);

  const capture = useCallback(async () => {
    onCaptureStart?.();
    try {
      await handleCapture();
    } finally {
      onCaptureEnd?.();
    }
  }, [handleCapture, onCaptureEnd, onCaptureStart]);

  useImperativeHandle(
    ref,
    () => ({
      capture,
      isReady: captureState.status === "ready",
    }),
    [capture, captureState.status],
  );

  const handleCancel = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    onStreamReady?.(null);
    onCancel();
  }, [onCancel, onStreamReady]);

  const isReady = captureState.status === "ready";

  return (
    <div className="rounded-3xl border border-white/8 bg-slate-950/75 p-6 shadow-lg shadow-black/10">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300">
          <Camera className="h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-semibold text-white">Live dermatoscopic capture</p>
          <p className="text-sm text-slate-400">
            The mirrored preview helps you centre the lesion before capturing a frame.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80">
          {isReady && (
            <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
              <Video className="h-3 w-3" /> Live
            </div>
          )}
          {isReady ? (
            <video
              ref={videoRef}
              className="h-full w-full object-cover [transform:scaleX(-1)]"
              playsInline
              muted
              autoPlay
            />
          ) : (
            <div className="flex min-h-[240px] w-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-slate-300">
              {captureState.status === "error" ? (
                <>
                  <CameraOff className="h-8 w-8 text-rose-400" />
                  <p>{captureState.message}</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
                  <p>{captureState.message}</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-white/8 bg-slate-900/65 p-4 text-sm text-slate-200">
          <div className="space-y-2">
            <p className="font-medium text-white">Capture tips</p>
            <ul className="space-y-1 text-slate-300">
              <li>Keep the lesion centred and fill most of the frame.</li>
              <li>Use soft, even lighting to minimise glare.</li>
              <li>Retake if the preview looks blurred or shadowed.</li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={async () => {
                if (internalCapturePending || !isReady) return;
                setInternalCapturePending(true);
                try {
                  await capture();
                } catch (error) {
                  console.error("Capture failed", error);
                } finally {
                  setInternalCapturePending(false);
                }
              }}
              disabled={!isReady || internalCapturePending}
              className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              type="button"
            >
              {internalCapturePending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Capturing
                </>
              ) : (
                <>
                  Capture frame
                  <Camera className="h-4 w-4" />
                </>
              )}
            </button>
            <button
              onClick={handleCancel}
              className="text-sm font-medium text-slate-300 transition hover:text-white"
              type="button"
            >
              Cancel
            </button>
          </div>

          {captureState.status === "error" && captureState.message && (
            <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              {captureState.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

CameraCapture.displayName = "CameraCapture";
 