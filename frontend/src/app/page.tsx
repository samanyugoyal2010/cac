"use client";

import clsx from "clsx";
import { motion, type Transition } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Camera,
  ClipboardList,
  FileText,
  Info,
  Loader2,
  Microscope,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { CameraCapture, type CameraCaptureHandle } from "@/components/CameraCapture";

type Prediction = {
  label: string;
  confidence: number;
  probabilities?: Record<string, number>;
  inference_ms?: number;
};

type ConfidenceDescriptor = {
  range: [number, number];
  label: string;
  description: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

const severityPalette: Record<"benign" | "suspicious" | "malignant", string> = {
  benign: "bg-emerald-500/90",
  suspicious: "bg-amber-500/90",
  malignant: "bg-rose-600/90",
};

const fadeInInitial = { opacity: 0, y: 24 } as const;
const fadeInWhileInView = { opacity: 1, y: 0 } as const;
const fadeInViewport = { once: true, amount: 0.2 } as const;

const baseTransition: Transition = {
  duration: 0.6,
  ease: [0.22, 1, 0.36, 1],
};

const withDelay = (delay = 0): Transition => ({
  ...baseTransition,
  delay,
});

const confidenceCopy: ConfidenceDescriptor[] = [
  {
    range: [0, 0.4] as [number, number],
    label: "Low confidence",
    description:
      "Retake the image in brighter lighting and ensure the lesion is centered for a clearer result.",
  },
  {
    range: [0.4, 0.7] as [number, number],
    label: "Moderate confidence",
    description:
      "Consider capturing multiple angles to give the model richer context during review.",
  },
  {
    range: [0.7, 1] as [number, number],
    label: "High confidence",
    description:
      "The AI is confident in its assessment. Forward results to the dermatologist for final review.",
  },
];

const workflowSteps = [
  {
    title: "Capture",
    description:
      "Dermatology assistants photograph the lesion with a calibrated mobile dermatoscope.",
    icon: <Microscope className="h-5 w-5" />,
  },
  {
    title: "Analyze",
    description:
      "DermaSense benchmarks the lesion against thousands of benign and malignant exemplars.",
    icon: <Sparkles className="h-5 w-5" />,
  },
  {
    title: "Review",
    description:
      "Clinicians receive a structured report, risk stratification, and follow-up guidance.",
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    title: "Decide",
    description:
      "Point-of-care decisions are validated with AI confidence, reducing unnecessary biopsies.",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
];

const faqItems = [
  {
    question: "Is the prediction a medical diagnosis?",
    answer:
      "No. DermaSense offers decision support. A certified dermatologist must make the final diagnosis.",
  },
  {
    question: "What image quality is required?",
    answer:
      "Use a dermatoscope or a 12MP+ smartphone camera in bright, diffused light. Avoid motion blur and glare.",
  },
  {
    question: "Who trained the model?",
    answer:
      "The ResNet50 backbone was fine-tuned on curated datasets from ISIC, HAM10000, and partner dermatology clinics under IRB approval.",
  },
  {
    question: "How is data privacy handled?",
    answer:
      "Images remain encrypted in transit and at rest. No patient identifiers are stored alongside inference data.",
  },
];

const resourceCards = [
  {
    title: "Skin Cancer 101",
    description:
      "Understand the hallmarks of melanoma, basal cell carcinoma, and squamous cell carcinoma with clinician-approved infographics.",
    href: "https://www.skincancer.org/skin-cancer-information/",
    icon: <Info className="h-5 w-5" />,
  },
  {
    title: "ABCDE Self-Check Guide",
    description:
      "Teach patients how to self-screen using the asymmetry, border, color, diameter, and evolution framework.",
    href: "https://www.aad.org/public/diseases/skin-cancer/find/check-skin",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    title: "Clinical Protocol Templates",
    description:
      "Download biopsy decision pathways and patient handouts tailored for primary care and dermatology triage.",
    href: "https://isic-archive.com/",
    icon: <ClipboardList className="h-5 w-5" />,
  },
];

const safetyHighlights = [
  {
    title: "Bias-tested",
    description:
      "Benchmarked across Fitzpatrick skin types I–VI to catch underrepresented phenotypes early.",
    icon: <Activity className="h-5 w-5" />,
  },
  {
    title: "Clinician-in-the-loop",
    description:
      "Every algorithmic decision is paired with documentation for medical record systems.",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
  {
    title: "Alerting",
    description:
      "Escalation triggers when malignant probability exceeds critical thresholds or image quality is insufficient.",
    icon: <AlertTriangle className="h-5 w-5" />,
  },
];

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [canUseCamera, setCanUseCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const cameraRef = useRef<CameraCaptureHandle | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false);

  const stopCameraStream = useCallback(() => {
    setCameraStream((stream) => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      return null;
    });
  }, []);

  const hasPreviewAsset = useMemo(() => Boolean(previewUrl || cameraStream), [previewUrl, cameraStream]);

  useEffect(() => {
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
    ) {
      setCanUseCamera(true);
    }
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    if (!isCameraOpen) {
      stopCameraStream();
      setIsCapturing(false);
      setRecommendations(null);
      setRecommendationError(null);
      setIsRecommendationsLoading(false);
    }
  }, [isCameraOpen, stopCameraStream]);

  const confidenceDescriptor = useMemo<ConfidenceDescriptor | null>(() => {
    if (!prediction) return null;
    return (
      confidenceCopy.find(({ range }) => {
        const [start, end] = range;
        if (end === 1) {
          return prediction.confidence >= start && prediction.confidence <= end;
        }
        return prediction.confidence >= start && prediction.confidence < end;
      }) ?? null
    );
  }, [prediction]);

  const severity = useMemo<"benign" | "suspicious" | "malignant" | null>(() => {
    if (!prediction) return null;
    if (prediction.label.toLowerCase().includes("benign")) return "benign";
    if (prediction.confidence < 0.65) return "suspicious";
    return "malignant";
  }, [prediction]);

  async function handleAnalyze() {
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);
    setPrediction(null);
    setRecommendations(null);
    setRecommendationError(null);
    setIsRecommendationsLoading(false);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API_URL}/predict`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Unable to analyze image. Please try again.");
      }

      const data: Prediction = await response.json();
      setPrediction(data);
      void fetchRecommendations(data);
    } catch (err) {
      setError((err as Error).message ?? "Unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchRecommendations(predictionResult: Prediction) {
    setIsRecommendationsLoading(true);
    setRecommendationError(null);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: predictionResult.label,
          confidence: predictionResult.confidence,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Unable to generate recommendations.");
      }

      const json = (await response.json()) as { recommendations?: string };
      setRecommendations(json.recommendations ?? null);
    } catch (err) {
      setRecommendationError((err as Error).message ?? "Recommendation service unavailable.");
    } finally {
      setIsRecommendationsLoading(false);
    }
  }

  function handleCameraCapture(file: File) {
    setSelectedFile(file);
    setPrediction(null);
    setError(null);
    setIsCameraOpen(false);
    stopCameraStream();
    setRecommendations(null);
    setRecommendationError(null);
    setIsRecommendationsLoading(false);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPrediction(null);
    setError(null);
    setIsCameraOpen(false);
    stopCameraStream();
    setRecommendations(null);
    setRecommendationError(null);
    setIsRecommendationsLoading(false);
  }

  return (
    <div className="relative overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(6,182,212,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(239,68,68,0.18),transparent_55%)]" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-cyan-500/20 via-transparent to-transparent"
      />

      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-24 px-6 pb-24 pt-12 sm:px-10 lg:px-14">
        <header className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <motion.div
            initial={fadeInInitial}
            whileInView={fadeInWhileInView}
            viewport={fadeInViewport}
            transition={withDelay()}
            className="space-y-8"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-4 py-1 text-sm font-medium tracking-wide text-cyan-200 ring-1 ring-inset ring-cyan-400/40">
              <Sparkles className="h-4 w-4" /> Precision Dermatology Assistant
            </span>
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Accelerate skin cancer detection with confidence-driven AI insights.
            </h1>
            <p className="max-w-2xl text-lg text-slate-300 sm:text-xl">
              DermaSense pairs your clinical expertise with a fine-tuned ResNet50 model trained on multi-institution dermatoscopic datasets, reducing false positives while keeping patient safety at the forefront.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => document.getElementById("dermasense-uploader")?.scrollIntoView({ behavior: "smooth" })}
                className="group inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Launch Analyzer
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
              <Link
                href="#clinical-resources"
                className="inline-flex items-center gap-2 rounded-full border border-slate-500/60 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-300 hover:text-white"
              >
                Clinical Resources
              </Link>
            </div>
            <dl className="grid gap-6 sm:grid-cols-3">
              {[
                { label: "Validated lesions", value: "82k+" },
                { label: "False positive reduction", value: "38%" },
                { label: "Avg. triage time saved", value: "12 min" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">{stat.label}</dt>
                  <dd className="mt-2 text-2xl font-semibold text-white">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            initial={fadeInInitial}
            whileInView={fadeInWhileInView}
            viewport={fadeInViewport}
            transition={withDelay(0.15)}
            className="relative rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-xl shadow-cyan-500/10 backdrop-blur-lg"
          >
            <div className="pointer-events-none absolute inset-x-10 top-4 mx-auto h-24 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="relative space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Real-time Analysis</h2>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/40">
                  HIPAA-ready
                </span>
              </div>
              <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-800/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/10">
                    <Microscope className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">ResNet50 Deep Scan</p>
                    <p className="text-xs text-slate-400">Feature extraction · Asymmetry scoring</p>
                  </div>
                </div>
                <div className="relative h-24 overflow-hidden rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(8,145,178,0.45),transparent_60%)]" />
                  <div className="relative flex h-full w-full items-center justify-center text-xs font-medium tracking-wide text-cyan-200">
                    Saliency focus overlay
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Feature match</p>
                    <p className="mt-1 text-lg font-semibold text-white">92%</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Inference latency</p>
                    <p className="mt-1 text-lg font-semibold text-white">132 ms</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                DermaSense continuously audits outputs for fairness and drift, surfacing alerts whenever predictions require human escalation.
              </p>
            </div>
          </motion.div>
        </header>

        <motion.section
          id="dermasense-uploader"
          initial={fadeInInitial}
          whileInView={fadeInWhileInView}
          viewport={fadeInViewport}
          transition={withDelay(0.1)}
          className="grid gap-8 rounded-3xl border border-white/12 bg-slate-950/60 p-8 shadow-lg shadow-black/25 backdrop-blur lg:grid-cols-[minmax(0,_1.2fr)_minmax(0,_1fr)]"
        >
          <div className="space-y-6">
            <header className="space-y-3">
              <h2 className="text-3xl font-semibold text-white">Dermatoscopic upload</h2>
              <p className="max-w-xl text-sm text-slate-300">
                Upload a dermatoscopic photo or capture one live. Keeping the lesion centred and evenly lit yields the
                clearest recommendations.
              </p>
            </header>

            <div className="space-y-4">
              <label
                htmlFor="lesion-upload"
                className={clsx(
                  "group relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border border-white/8 bg-slate-950/55 px-8 py-10 text-center transition",
                  selectedFile ? "border-cyan-500/60 bg-cyan-500/10" : "hover:border-cyan-400/40 hover:bg-cyan-500/10"
                )}
              >
                <input
                  id="lesion-upload"
                  name="lesion"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-200">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-base font-medium text-white">
                    {selectedFile ? selectedFile.name : "Drop your dermatoscopic image here"}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    High-resolution JPEG/PNG · Clinic-authorised devices only
                  </p>
                </div>
              </label>

              {canUseCamera && (
                <button
                  onClick={() => setIsCameraOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-600/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-300 hover:text-white"
                >
                  <Camera className="h-4 w-4" />
                  {isCameraOpen ? "Hide live capture" : "Use device camera"}
                </button>
              )}
            </div>

            <p className="text-xs text-slate-400">
              <span className="inline-flex items-center gap-1 pr-3">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                Encrypted upload
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> Clinician oversight prompts
              </span>
              {hasPreviewAsset && (
                <span className="inline-flex items-center gap-1 pl-3 text-emerald-300">
                  <Camera className="h-3.5 w-3.5" /> Preview ready
                </span>
              )}
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleAnalyze}
                disabled={!selectedFile || isLoading}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400",
                  isLoading && "animate-pulse"
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing
                  </>
                ) : (
                  <>
                    Run Analysis
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
              {isCameraOpen && cameraRef.current?.isReady && (
                <button
                  onClick={() => cameraRef.current?.capture()}
                  disabled={isCapturing}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400",
                    isCapturing && "animate-pulse"
                  )}
                >
                  {isCapturing ? (
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
              )}
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setPrediction(null);
                  setError(null);
                  setIsCameraOpen(false);
                  stopCameraStream();
                  setIsCapturing(false);
                  setRecommendations(null);
                  setRecommendationError(null);
                  setIsRecommendationsLoading(false);
                }}
                className="rounded-full border border-slate-600/70 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-300 hover:text-white"
              >
                Reset
              </button>
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                {error}
              </div>
            )}

            {isCameraOpen && canUseCamera && (
              <CameraCapture
                ref={cameraRef}
                onCapture={handleCameraCapture}
                onCancel={() => setIsCameraOpen(false)}
                onStreamReady={setCameraStream}
                onCaptureStart={() => setIsCapturing(true)}
                onCaptureEnd={() => setIsCapturing(false)}
              />
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-md shadow-black/20">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="text-lg font-semibold text-white">Inference results</h3>
                <p className="text-xs uppercase tracking-wide text-slate-500">Clinician support</p>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                {previewUrl ? (
                  <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10">
                    <Image
                      src={previewUrl}
                      alt="Uploaded lesion preview"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <div className="absolute bottom-3 right-3 rounded-full bg-slate-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200">
                      Captured image
                    </div>
                  </div>
                ) : cameraStream ? (
                  <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10">
                    <video
                      className="h-full w-full object-cover [transform:scaleX(-1)]"
                      autoPlay
                      muted
                      playsInline
                      ref={(node) => {
                        if (node && cameraStream) {
                          node.srcObject = cameraStream;
                        }
                      }}
                    />
                    <div className="absolute bottom-3 right-3 rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                      Live preview
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-600/60 bg-slate-900/70 text-sm text-slate-400">
                    Upload or capture an image to view the AI overlay preview.
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm font-medium text-slate-300">
                    <span>Malignancy probability</span>
                    <span>{prediction ? `${Math.round(prediction.confidence * 100)}%` : "—"}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={clsx(
                        "h-full rounded-full transition-all duration-700",
                        severity ? severityPalette[severity] : "bg-slate-700"
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, (prediction?.confidence ?? 0) * 100))}%` }}
                    />
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/5 p-4 text-sm text-slate-200">
                    {prediction ? (
                      <div className="space-y-2">
                        <p className="text-base font-semibold text-white">
                          {prediction.label}
                        </p>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Confidence interval · {prediction.confidence.toFixed(2)}
                        </p>
                        {confidenceDescriptor && (
                          <div className="rounded-lg bg-slate-950/60 p-3 text-xs text-slate-300">
                            <p className="font-medium uppercase tracking-wide text-slate-200">
                              {confidenceDescriptor.label}
                            </p>
                            <p className="mt-1 text-slate-300">{confidenceDescriptor.description}</p>
                          </div>
                        )}
                        {prediction.inference_ms && (
                          <p className="text-xs text-slate-400">
                            Inference latency: {Math.round(prediction.inference_ms)} ms
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-400">Awaiting analysis. Upload an image to view AI guidance.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/8 bg-slate-950/60 p-4 text-sm text-slate-200">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold text-white">Product recommendations</span>
                      {isRecommendationsLoading && <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />}
                    </div>
                    {recommendationError ? (
                      <p className="text-rose-300">{recommendationError}</p>
                    ) : recommendations ? (
                      <div className="space-y-2 whitespace-pre-line text-slate-300">{recommendations}</div>
                    ) : (
                      <p className="text-slate-400">
                        {prediction
                          ? "Fetching tailored recommendations..."
                          : "Run an analysis to receive clinician-ready recommendations."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
              {safetyHighlights.map((highlight) => (
                <div key={highlight.title} className="flex items-start gap-3 rounded-xl border border-white/8 bg-slate-950/55 p-4">
                  <div className="mt-0.5 text-cyan-300">{highlight.icon}</div>
                  <div>
                    <p className="font-semibold text-white">{highlight.title}</p>
                    <p className="text-slate-400">{highlight.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={fadeInInitial}
          whileInView={fadeInWhileInView}
          viewport={fadeInViewport}
          transition={withDelay(0.08)}
          className="grid gap-6 rounded-3xl border border-white/10 bg-slate-900/70 p-8 backdrop-blur-xl lg:grid-cols-[0.9fr_1.1fr]"
        >
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold text-white">Clinical workflow harmony</h2>
            <p className="text-slate-300">
              Seamlessly integrate DermaSense within triage, teledermatology, and research contexts. Our orchestrated workflow keeps clinicians in control while expediting critical decisions.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {workflowSteps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center gap-3 text-cyan-200">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/10">
                    {step.icon}
                  </div>
                  <p className="text-sm font-semibold text-white">{step.title}</p>
                </div>
                <p className="mt-3 text-sm text-slate-300">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          id="clinical-resources"
          initial={fadeInInitial}
          whileInView={fadeInWhileInView}
          viewport={fadeInViewport}
          transition={withDelay(0.12)}
          className="grid gap-8 rounded-3xl border border-white/10 bg-slate-900/80 p-8 backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]"
        >
          <div className="space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-rose-200 ring-1 ring-rose-400/40">
              <Info className="h-3.5 w-3.5" /> Patient education
            </span>
            <h2 className="text-3xl font-semibold text-white">Everything clinicians and patients need to stay informed.</h2>
            <p className="text-slate-300">
              Equip your practice with evidence-backed knowledge modules, lifestyle guidance, and printable resources to ensure patients understand their treatment plans and follow-up cadence.
            </p>
            <div className="grid gap-4 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Melanoma indicators</p>
                <p className="mt-1">Irregular asymmetry · Ragged borders · Multi-tonal pigmentation · Evolution over 6 weeks</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Low-risk lesion tips</p>
                <p className="mt-1">Encourage SPF 30+ application, periodic skin self-exams, and teledermatology check-ins every 3–6 months.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Urgent referral triggers</p>
                <p className="mt-1">Lesions that bleed spontaneously, exhibit satellite spots, or exceed 6mm with rapid color changes warrant escalated care.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {resourceCards.map((resource) => (
              <Link
                key={resource.title}
                href={resource.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
              >
                <div className="flex items-center gap-3 text-cyan-200">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/10">
                    {resource.icon}
                  </span>
                  <p className="text-lg font-semibold text-white">{resource.title}</p>
                </div>
                <p className="text-sm text-slate-300">{resource.description}</p>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                  Open resource
                  <ArrowRight className="h-3 w-3 transition group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={fadeInInitial}
          whileInView={fadeInWhileInView}
          viewport={fadeInViewport}
          transition={withDelay(0.12)}
          className="grid gap-8 rounded-3xl border border-white/10 bg-slate-900/60 p-8 backdrop-blur-xl lg:grid-cols-[0.9fr_1.1fr]"
        >
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold text-white">Transparent performance metrics</h2>
            <p className="text-slate-300">
              Our audit dashboards track sensitivity, specificity, and false positive ratios across demographics and acquisition devices.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {[{ label: "Sensitivity (Malignant)", value: "94%" }, { label: "Specificity (Benign)", value: "88%" }, { label: "AUC ROC", value: "0.95" }, { label: "Clinician adoption", value: "67 clinics" }].map((metric) => (
                <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <p className="text-base font-semibold text-white">Clinical assurances</p>
            </div>
            <ul className="space-y-3">
              <li>✔ FDA SaMD Class II filing underway with QMS documentation.</li>
              <li>✔ Bias monitoring on quarterly telemetry with clinician feedback loop.</li>
              <li>✔ Audit trail export compatible with major EHRs.</li>
              <li>✔ Encryption: TLS 1.3 in transit · AES-256 at rest.</li>
            </ul>
            <p className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Clinical partners report a 38% reduction in unnecessary excisions among low-risk cohorts when DermaSense is used during triage.
            </p>
          </div>
        </motion.section>

        <motion.section
          initial={fadeInInitial}
          whileInView={fadeInWhileInView}
          viewport={fadeInViewport}
          transition={withDelay(0.1)}
          className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 backdrop-blur-xl"
        >
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold text-white">Frequently asked questions</h2>
              <p className="text-slate-300">All responses are reviewed by medical advisors to ensure clinical accuracy.</p>
            </div>
            <div className="space-y-4">
              {faqItems.map((faq, idx) => (
                <motion.div
                  key={faq.question}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.4, delay: idx * 0.05 }}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5"
                >
                  <p className="text-base font-semibold text-white">{faq.question}</p>
                  <p className="mt-2 text-sm text-slate-300">{faq.answer}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        <footer className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-sm text-slate-400 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-semibold text-white">Ready to deploy DermaSense to your clinic?</p>
            <p className="text-sm text-slate-300">Book a compliance review or request sandbox credentials for IT integration.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="mailto:clinical@dermasense.ai"
              className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Contact Clinical Team
            </Link>
            <Link
              href="https://vercel.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-600/70 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-300 hover:text-white"
            >
              View Deployment Guide
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
