import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { decodeFrame, markLiveRefused } from "../lib/barcode";
import { tr } from "../lib/i18n";
import { Icon } from "./ui";

/** A label that opens the phone camera straight away; the file goes to onFile */
export function CameraInput({ onFile, className, style, children, ariaLabel }: { onFile: (f: File) => void; className?: string; style?: CSSProperties; children: ReactNode; ariaLabel?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label
      className={className}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ref.current?.click();
        }
      }}
    >
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      {children}
    </label>
  );
}

/**
 * Full-screen live barcode scanner: darkened camera view, a cut-out frame and a
 * line sweeping up and down. Only the part inside the frame is decoded.
 */
export function LiveScanner({ onCode, onClose, onManual, onPhoto }: { onCode: (c: string) => void; onClose: () => void; onManual: () => void; onPhoto: (f: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"starting" | "live" | "error">("starting");
  const done = useRef(onCode);
  done.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");

    function crop(): boolean {
      const v = video.current;
      const f = frame.current;
      if (!v || !f || !v.videoWidth) return false;
      const vr = v.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      // object-fit: cover — work out which part of the video sits under the frame
      const scale = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
      const offX = (vr.width - v.videoWidth * scale) / 2;
      const offY = (vr.height - v.videoHeight * scale) / 2;
      const pad = 0.12; // a little slack around the frame
      const x = Math.max(0, (fr.left - vr.left - offX - fr.width * pad) / scale);
      const y = Math.max(0, (fr.top - vr.top - offY - fr.height * pad) / scale);
      const w = Math.min(v.videoWidth - x, (fr.width * (1 + 2 * pad)) / scale);
      const h = Math.min(v.videoHeight - y, (fr.height * (1 + 2 * pad)) / scale);
      const k = Math.min(1, 960 / w);
      canvas.width = Math.round(w * k);
      canvas.height = Math.round(h * k);
      canvas.getContext("2d", { willReadFrequently: true })?.drawImage(v, x, y, w, h, 0, 0, canvas.width, canvas.height);
      return true;
    }

    async function tick() {
      if (stopped) return;
      try {
        if (crop()) {
          const code = await decodeFrame(canvas);
          if (stopped) return;
          if (code) {
            navigator.vibrate?.(40);
            return done.current(code);
          }
        }
      } catch {
        /* a bad frame: try the next one */
      }
      timer = setTimeout(tick, 160);
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setState("live");
        tick();
      } catch (e) {
        console.warn("camera", e);
        markLiveRefused();
        if (!stopped) setState("error");
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label={tr("Сканирай баркод", "Scan a barcode")}>
      <video ref={video} playsInline muted />
      <div className="scan-fade top" />
      <div className="scan-fade bottom" />

      <div className="scan-head">
        <button className="scan-round" onClick={onClose} aria-label={tr("Затвори", "Close")}>
          <Icon name="x" size={20} stroke={2.2} />
        </button>
        <b>{tr("Сканирай баркод", "Scan a barcode")}</b>
        <span style={{ width: 40 }} />
      </div>

      <div ref={frame} className="scan-frame">
        <i className="c tl" />
        <i className="c tr" />
        <i className="c bl" />
        <i className="c br" />
        {state === "live" && <span className="scan-line" />}
        {state === "starting" && <span className="spinner" style={{ borderColor: "rgba(255,255,255,.25)", borderTopColor: "#fff" }} />}
      </div>

      <p className="scan-hint">
        {state === "error"
          ? tr("Камерата не е достъпна тук. Снимай баркода или въведи цифрите.", "The camera isn't available here. Take a photo of the barcode or type the digits.")
          : tr("Насочи баркода в рамката", "Line the barcode up inside the frame")}
      </p>

      <div className="scan-foot">
        <button className="scan-btn" onClick={onManual}>
          <Icon name="pen" size={18} /> {tr("Въведи кода", "Type the code")}
        </button>
        <CameraInput className={`scan-btn ${state === "error" ? "solid" : ""}`} onFile={onPhoto}>
          <Icon name="camera" size={18} /> {tr("Снимка", "Photo")}
        </CameraInput>
      </div>
    </div>
  );
}
