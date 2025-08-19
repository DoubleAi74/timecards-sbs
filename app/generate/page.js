"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import localFont from "next/font/local";
import NextImage from "next/image";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// ---------- Presets ----------
const presetImages = Array.from(
  { length: 60 },
  (_, i) => `/presets/preset-${i + 1}.jpg`
);

// ---------- Load the custom font ----------
const spongebobFont = localFont({
  src: "../fonts/SpongeBobFont.woff2",
  display: "swap",
  variable: "--font-spongebob",
});

// ---------- Styled keyboard key ----------
const Kbd = ({ children }) => (
  <span className="py-0.5 px-1.5 border border-slate-700 bg-slate-900 border-b-2 rounded-md text-sm">
    {children}
  </span>
);

export default function GeneratorPage() {
  // ---------- UI state ----------
  const [overlayText, setOverlayText] = useState("A few moments\n later...");
  const [textColor, setTextColor] = useState("#EDE607");
  const [shadowColor, setShadowColor] = useState("#C723C2");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [textSize, setTextSize] = useState(130);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [status, setStatus] = useState("idle"); // idle | generating-audio | recording | transcoding | ready

  // Wavy font (static, no animation)
  const [wavyFont, setWavyFont] = useState(false);
  const [waveAmp, setWaveAmp] = useState(18); // px
  const [waveLength, setWaveLength] = useState(180); // px
  const [waveSkew, setWaveSkew] = useState(0.15); // radians tilt per char

  // Preview toggle
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  // Force-remount canvas
  const [canvasKey, setCanvasKey] = useState(0);

  // ---------- Canvas & image manipulation ----------
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const viewRef = useRef({
    scale: 1,
    minScale: 1,
    maxScale: 8,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const [selectedThumb, setSelectedThumb] = useState(null);

  const [customShadow, setCustomShadow] = useState(false);
  const [shadowOffset, setShadowOffset] = useState(7); // px
  const [shadowBlur, setShadowBlur] = useState(0); // px

  // ---------- Reusable FFmpeg + final MP4 Blob refs ----------
  const ffmpegRef = useRef(null);
  const finalBlobRef = useRef(null);

  // ---------- Aspect ratios & fixed output resolutions ----------
  const ASPECT_RATIOS = {
    "16:9": { w: 16, h: 9, res: [1920, 1080] },
    "9:16": { w: 9, h: 16, res: [1080, 1920] },
    "4:3": { w: 4, h: 3, res: [1600, 1200] },
  };

  const hasVideo = status === "ready" && !!previewUrl;

  // ---------- Draw one frame onto the canvas ----------
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const view = viewRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = imageRef.current;
    if (img && img.complete) {
      const baseScale = Math.max(
        canvas.width / img.width,
        canvas.height / img.height
      );
      const scale = baseScale * view.scale;
      ctx.save();
      ctx.translate(
        canvas.width / 2 + view.offsetX,
        canvas.height / 2 + view.offsetY
      );
      ctx.scale(scale, scale);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    } else {
      // light grid placeholder
      const s = 40;
      ctx.strokeStyle = "#1f2937";
      for (let x = 0; x < canvas.width; x += s) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += s) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // ---------- Draw overlay text ----------
    if (overlayText.trim()) {
      ctx.font = `800 ${textSize}px ${spongebobFont.style.fontFamily}, 'Comic Sans MS', cursive`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines = overlayText.split("\n");
      const lineHeight = textSize * 1.1;
      const totalTextHeight = (lines.length - 1) * lineHeight;
      const startY = canvas.height / 2 - totalTextHeight / 2;

      // Common styling
      const effectiveOffset = customShadow ? shadowOffset : 7;
      const effectiveBlur = customShadow ? shadowBlur : 0;

      ctx.shadowColor = shadowColor;
      ctx.shadowOffsetX = effectiveOffset;
      ctx.shadowOffsetY = effectiveOffset;
      ctx.shadowBlur = effectiveBlur;

      ctx.fillStyle = textColor;

      if (!wavyFont) {
        lines.forEach((line, i) => {
          const y = startY + i * lineHeight;
          ctx.fillText(line, canvas.width / 2, y);
        });
      } else {
        // WAVY mode (static): center each line, then place characters on a sine wave
        const phase = 0; // static wave (no animation)

        lines.forEach((line, i) => {
          const yBase = startY + i * lineHeight;

          // Centering: measure entire line, then advance char by char
          const lineWidth = ctx.measureText(line).width;
          let xCursor = canvas.width / 2 - lineWidth / 2;

          for (const ch of line) {
            const w = ctx.measureText(ch).width;
            const cx = xCursor + w / 2;

            const theta = cx / waveLength + phase; // horiz position -> phase
            const yOffset = Math.sin(theta) * waveAmp; // vertical wobble
            const rot = Math.sin(theta + Math.PI / 2) * waveSkew; // slight tilt

            ctx.save();
            ctx.translate(cx, yBase + yOffset);
            ctx.rotate(rot);
            ctx.fillText(ch, 0, 0);
            ctx.restore();

            xCursor += w;
          }
        });
      }
    }
  }, [
    overlayText,
    textColor,
    shadowColor,
    textSize,
    spongebobFont.style.fontFamily,
    wavyFont,
    waveAmp,
    waveLength,
    waveSkew,
    shadowOffset,
    shadowBlur,
    customShadow,
  ]);

  // ---------- Image fit helpers ----------
  const fitImageToCover = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !img.complete || !canvas) return;

    const fitScale = Math.max(
      canvas.width / img.width,
      canvas.height / img.height
    );
    viewRef.current.minScale = 1;

    const scale = fitScale * viewRef.current.scale;
    const imgW = img.width * scale;
    const imgH = img.height * scale;
    const maxX = Math.max(0, (imgW - canvas.width) / 2);
    const maxY = Math.max(0, (imgH - canvas.height) / 2);
    viewRef.current.offsetX = Math.max(
      -maxX,
      Math.min(maxX, viewRef.current.offsetX)
    );
    viewRef.current.offsetY = Math.max(
      -maxY,
      Math.min(maxY, viewRef.current.offsetY)
    );
    viewRef.current.scale = Math.max(
      viewRef.current.minScale,
      Math.min(viewRef.current.maxScale, viewRef.current.scale)
    );

    drawFrame();
  }, [drawFrame]);

  const resetView = () => {
    viewRef.current = { ...viewRef.current, scale: 1, offsetX: 0, offsetY: 0 };
    fitImageToCover();
  };

  const handleImageLoad = (url) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      imageRef.current = img;
      resetView();
    };
    img.onerror = () => alert("Could not load the image.");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageLoad(URL.createObjectURL(file));
      setSelectedThumb(null);
    }
  };

  // ---------- FFmpeg: lazy load & reuse ----------
  const getFFmpeg = async () => {
    if (!ffmpegRef.current) {
      const ffmpeg = new FFmpeg(); // optionally pass { coreURL } if self-hosting
      await ffmpeg.load();
      ffmpegRef.current = ffmpeg;
    }
    return ffmpegRef.current;
  };

  const transcodeWebmToMp4 = async (webmBlob) => {
    setStatus("transcoding");
    const ffmpeg = await getFFmpeg();
    await ffmpeg.writeFile("in.webm", await fetchFile(webmBlob));
    await ffmpeg.exec([
      "-i",
      "in.webm",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "out.mp4",
    ]);
    const out = await ffmpeg.readFile("out.mp4"); // Uint8Array
    return new Blob([out], { type: "video/mp4" });
  };

  // ---------- Generate video ----------
  const generateVideo = async () => {
    if (!imageRef.current) {
      alert("Please upload an image or select a preset.");
      return;
    }
    if (!overlayText.trim()) {
      alert("Please enter some text for the overlay.");
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
    if (!apiKey || apiKey === "YOUR_ELEVENLABS_API_KEY_HERE") {
      alert(
        "Missing ElevenLabs API key. Please set it in your .env.local file."
      );
      return;
    }

    // Clear any previous video artifacts first
    handleCreateNew(true); // silent reset of video artifacts only

    setStatus("generating-audio");

    try {
      // 1) Get Audio (MP3) from ElevenLabs
      const singleLineText = overlayText.replace(/\n/g, " ");
      const response = await fetch(
        "https://api.elevenlabs.io/v1/text-to-speech/bEO1KL2a6EuyUqmMnd8o",
        {
          method: "POST",
          headers: {
            Accept: "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          body: JSON.stringify({
            text: singleLineText,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      );

      if (!response.ok) {
        let errorMsg = `API Error: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData?.detail?.message || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      const audioBlob = await response.blob();

      // 2) Build media graph
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const audioBuffer = await audioCtx.decodeAudioData(
        await audioBlob.arrayBuffer()
      );
      const audioSource = audioCtx.createBufferSource();
      audioSource.buffer = audioBuffer;

      const destination = audioCtx.createMediaStreamDestination();
      audioSource.connect(destination);

      // Ensure canvas uses selected resolution & draw once
      const canvas = canvasRef.current;
      const ar = ASPECT_RATIOS[aspectRatio];

      canvas.width = ar.res[0];
      canvas.height = ar.res[1];
      drawFrame();

      setStatus("recording");

      const canvasStream = canvas.captureStream(30);
      destination.stream
        .getAudioTracks()
        .forEach((track) => canvasStream.addTrack(track));

      // Prefer MP4 if supported by MediaRecorder; otherwise WebM
      const MP4 = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
      const WEBM = "video/webm;codecs=vp9,opus";
      let mimeType = "";

      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(MP4)
      ) {
        mimeType = MP4;
      } else if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(WEBM)
      ) {
        mimeType = WEBM;
      } else {
        alert("Video recording is not supported on your browser.");
        setStatus("idle");
        return;
      }

      const canRecordMp4 = mimeType === MP4;

      const rec = new MediaRecorder(canvasStream, { mimeType });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

      rec.start();
      audioSource.start();

      await new Promise((resolve) => (audioSource.onended = resolve));
      rec.stop();
      await new Promise((resolve) => {
        rec.onstop = resolve;
      });

      audioCtx.close();

      const recordedBlob = new Blob(chunks, { type: mimeType });

      // 3) Ensure MP4 in all cases
      let finalMp4;
      if (canRecordMp4) {
        finalMp4 = recordedBlob; // already MP4
      } else {
        finalMp4 = await transcodeWebmToMp4(recordedBlob);
      }

      finalBlobRef.current = finalMp4; // keep the blob for Share/Save
      const url = URL.createObjectURL(finalMp4);
      setDownloadUrl(url);
      setPreviewUrl(url);
      setStatus("ready");
      setShowVideoPreview(true); // auto-switch to video preview
    } catch (err) {
      console.error(err);
      alert("An error occurred: " + (err?.message || err));
      setStatus("idle");
    }
  };

  // ---------- Share / Save handler ----------
  async function shareOrSave() {
    if (!finalBlobRef.current) return;

    const file = new File([finalBlobRef.current], "spongebob-timecard.mp4", {
      type: "video/mp4",
    });

    // Web Share API with files (modern iOS/Android)
    if (
      navigator.canShare &&
      navigator.canShare({ files: [file] }) &&
      navigator.share
    ) {
      try {
        await navigator.share({
          files: [file],
          title: "SpongeBob Timecard",
          text: "Generated video",
        });
        return;
      } catch (e) {
        // user canceled or share failed -> fallback to download
      }
    }

    // Fallback: trigger a regular download
    const a = document.createElement("a");
    a.href = URL.createObjectURL(finalBlobRef.current);
    a.download = "spongebob-timecard.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- Create New: clear video + return to fresh canvas ----------
  function handleCreateNew(silent = false) {
    // Stop & clean up any existing video/URLs first
    try {
      document.querySelector("video")?.pause();
    } catch {}
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    } catch {}
    try {
      if (downloadUrl && downloadUrl !== previewUrl)
        URL.revokeObjectURL(downloadUrl);
    } catch {}

    finalBlobRef.current = null;
    setPreviewUrl("");
    setDownloadUrl("");
    setShowVideoPreview(false);
    setStatus("idle");

    // Full pan/zoom reset (not just offsets)
    viewRef.current = {
      scale: 1,
      minScale: 1,
      maxScale: 8,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      lastX: 0,
      lastY: 0,
    };

    // Force canvas to remount so size/bitmap are fresh
    setCanvasKey((k) => k + 1);

    // After React swaps the nodes, size and draw on the next frame
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const { res } = ASPECT_RATIOS[aspectRatio];
        canvas.width = res[0];
        canvas.height = res[1];
      }
      fitImageToCover();
      drawFrame();
    });

    if (!silent) {
      // optional toast/UI feedback
    }
  }

  // ---------- Effects ----------

  // Aspect ratio -> resize canvas & refit
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ar = ASPECT_RATIOS[aspectRatio];
    canvas.width = ar.res[0];
    canvas.height = ar.res[1];
    fitImageToCover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectRatio]);

  // Redraw on text / color / style changes
  useEffect(drawFrame, [
    overlayText,
    textColor,
    shadowColor,
    textSize,
    wavyFont,
    waveAmp,
    waveLength,
    waveSkew,
    shadowOffset,
    shadowBlur,
    customShadow,
    drawFrame,
  ]);

  // Ensure font is ready before first draw (prevents fallback flicker)
  useEffect(() => {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(drawFrame);
    }
  }, [drawFrame]);

  // Pan & zoom handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e) => {
      viewRef.current.dragging = true;
      viewRef.current.lastX = e.clientX;
      viewRef.current.lastY = e.clientY;
      canvas.style.cursor = "grabbing";
    };

    const onMouseUp = () => {
      viewRef.current.dragging = false;
      canvas.style.cursor = "default";
    };

    const onMouseMove = (e) => {
      if (!viewRef.current.dragging) return;
      const dx = e.clientX - viewRef.current.lastX;
      const dy = e.clientY - viewRef.current.lastY;
      viewRef.current.lastX = e.clientX;
      viewRef.current.lastY = e.clientY;
      viewRef.current.offsetX += dx;
      viewRef.current.offsetY += dy;
      fitImageToCover();
    };

    const onWheel = (e) => {
      if (!imageRef.current) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const base = Math.max(
        canvas.width / imageRef.current.width,
        canvas.height / imageRef.current.height
      );
      const pre = {
        x:
          (mouseX - canvas.width / 2 - viewRef.current.offsetX) /
          (base * viewRef.current.scale),
        y:
          (mouseY - canvas.height / 2 - viewRef.current.offsetY) /
          (base * viewRef.current.scale),
      };
      const delta = Math.exp((e.deltaY > 0 ? -1 : 1) * 0.08);
      viewRef.current.scale = Math.max(
        viewRef.current.minScale,
        Math.min(viewRef.current.maxScale, viewRef.current.scale * delta)
      );
      const post = {
        x:
          (mouseX - canvas.width / 2 - viewRef.current.offsetX) /
          (base * viewRef.current.scale),
        y:
          (mouseY - canvas.height / 2 - viewRef.current.offsetY) /
          (base * viewRef.current.scale),
      };
      viewRef.current.offsetX +=
        (post.x - pre.x) * (base * viewRef.current.scale);
      viewRef.current.offsetY +=
        (post.y - pre.y) * (base * viewRef.current.scale);
      fitImageToCover();
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [fitImageToCover]);

  // Keyboard shortcut for reset
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() === "r") resetView();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Default image on load (preset #36)
  useEffect(() => {
    if (presetImages.length > 0) {
      handleImageLoad(presetImages[35]);
      setSelectedThumb(35);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replace getButtonState with this:
  const getPrimaryAction = () => {
    if (status === "ready" && hasVideo) {
      return {
        text: "+ Create New",
        disabled: false,
        onClick: () => handleCreateNew(false),
      };
    }
    switch (status) {
      case "generating-audio":
        return { text: "Generating Audio...", disabled: true, onClick: null };
      case "recording":
        return { text: "Recording Video...", disabled: true, onClick: null };
      case "transcoding":
        return { text: "Transcoding to MP4...", disabled: true, onClick: null };
      case "idle":
      default:
        return {
          text: "▶  Generate Video",
          disabled: false,
          onClick: generateVideo,
        };
    }
  };

  const {
    text: primaryText,
    disabled: primaryDisabled,
    onClick: primaryOnClick,
  } = getPrimaryAction();

  const ar = ASPECT_RATIOS[aspectRatio];

  return (
    <div
      className={`${spongebobFont.variable} font-sans bg-[url('/back2.jpg')]`}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-800 bg-[#0b1022aa] px-3 sm:px-5 py-4 backdrop-blur-md font-extrabold">
        <h1 className="text-lg sm:text-xl font-bold tracking-wide text-yellow-100">
          <span style={{ fontSize: "1.5em" }}>Timecard . </span>
          <span style={{ fontSize: "1.5em" }}>S</span>
          <small>ponge</small>
          <span style={{ fontSize: "1.5em" }}>B</span>
          <small>ob</small>
          <span style={{ fontSize: "1.5em" }}>S</span>
          <small>quarepants</small>
        </h1>
        <div className="hidden sm:flex items-center gap-2 text-custom-muted text-xs">
          Pan: <Kbd>drag</Kbd> · Zoom: <Kbd>wheel</Kbd> · Reset: <Kbd>R</Kbd>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 p-4  ">
        {/* ---------- Controls Panel ---------- */}
        <section className="flex flex-col items-center gap-2 rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0b1222] to-[#0b0f1d]/85 p-4 shadow-2xl">
          {/* Text Input */}
          <div className="w-full">
            <label className="text-xs text-custom-muted">
              Add your own text
            </label>
            <textarea
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              rows="2"
              className="mt-1.5 w-full rounded-lg border border-[#243042] bg-[#0d1b2a] p-2.5 text-custom-text resize-y min-h-[80px]"
            />
          </div>

          {/* Aspect & Size */}
          <div className="grid grid-cols-1 gap-2 w-full">
            <div>
              <label className="text-xs text-custom-muted">Text Size</label>
              <div className="flex items-center gap-3 mt-[-9px]">
                <input
                  type="range"
                  min="24"
                  max="220"
                  step="1"
                  value={textSize}
                  onChange={(e) => setTextSize(Number(e.target.value))}
                  className="w-full"
                />
                <Kbd>{textSize} px</Kbd>
              </div>
            </div>
          </div>

          {/* Color Pickers */}
          <div className="grid grid-cols-2 gap-2 w-full">
            <div>
              <label className="text-xs text-custom-muted">Text Color</label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-12 h-10 p-1 rounded-lg border border-[#243042] bg-[#0d1b2a]"
                />
                <div className="flex-grow text-center bg-[#0d1b2a] rounded-lg p-2 border border-[#243042]">
                  <Kbd>{textColor.toUpperCase()}</Kbd>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-custom-muted">Shadow Color</label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="color"
                  value={shadowColor}
                  onChange={(e) => setShadowColor(e.target.value)}
                  className="w-12 h-10 p-1 rounded-lg border border-[#243042] bg-[#0d1b2a]"
                />
                <div className="flex-grow text-center bg-[#0d1b2a] rounded-lg p-2 border border-[#243042]">
                  <Kbd>{shadowColor.toUpperCase()}</Kbd>
                </div>
              </div>
            </div>

            {/* NEW: Randomize next to color editing */}
            <div className="col-span-2 flex items-center justify-between ">
              <div className="flex gap-2">
                {/* Wavy font toggle */}
                <div>
                  <label className="text-xs text-custom-muted">Wavy font</label>
                  <div className="mt-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wavyFont}
                        onChange={(e) => setWavyFont(e.target.checked)}
                        className="sr-only"
                      />
                      <span
                        className={`relative inline-block w-10 h-6 rounded-full transition-colors ${
                          wavyFont ? "bg-blue-600" : "bg-slate-700"
                        }`}
                      >
                        <span
                          className={`absolute left-1 top-1 inline-block w-4 h-4 bg-white rounded-full transition-transform ${
                            wavyFont ? "translate-x-4" : ""
                          }`}
                        />
                      </span>
                      <span className="text-sm">{wavyFont ? "On" : "Off"}</span>
                    </label>
                  </div>
                </div>

                {/* Custom shadow toggle */}
                <div>
                  <label className="text-xs text-custom-muted">
                    Custom shadow
                  </label>
                  <div className="mt-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customShadow}
                        onChange={(e) => setCustomShadow(e.target.checked)}
                        className="sr-only"
                      />
                      <span
                        className={`relative inline-block w-10 h-6 rounded-full transition-colors ${
                          customShadow ? "bg-blue-600" : "bg-slate-700"
                        }`}
                      >
                        <span
                          className={`absolute left-1 top-1 inline-block w-4 h-4 bg-white rounded-full transition-transform ${
                            customShadow ? "translate-x-4" : ""
                          }`}
                        />
                      </span>
                      <span className="text-sm">
                        {customShadow ? "On" : "Off"}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  const randHex = () =>
                    "#" +
                    Math.floor(Math.random() * 16777215)
                      .toString(16)
                      .padStart(6, "0");
                  setTextColor(randHex());
                  setShadowColor(randHex());
                }}
                className="px-3 py-2 h-10 text-xs items-center rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700"
                title="Randomize text & shadow colors"
              >
                Randomize Colors
              </button>
            </div>
          </div>

          {/* Shadow sliders — always mounted, just hidden when off */}
          <div
            className={`w-full mt-2 transition-opacity duration-200 ${
              customShadow
                ? "visible opacity-100 pointer-events-auto"
                : "invisible opacity-0 pointer-events-none"
            }`}
            aria-hidden={!customShadow}
          >
            <div className="grid grid-cols-2 gap-2 w-full">
              <div>
                <label className="text-xs text-custom-muted">
                  Shadow Distance
                </label>
                <div className="flex items-center gap-3 mt-1.5">
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="1"
                    value={shadowOffset}
                    onChange={(e) => setShadowOffset(Number(e.target.value))}
                    className="w-full"
                    tabIndex={customShadow ? 0 : -1}
                  />
                  <Kbd>{shadowOffset}px</Kbd>
                </div>
              </div>
              <div>
                <label className="text-xs text-custom-muted">Shadow Blur</label>
                <div className="flex items-center gap-3 mt-1.5">
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={shadowBlur}
                    onChange={(e) => setShadowBlur(Number(e.target.value))}
                    className="w-full"
                    tabIndex={customShadow ? 0 : -1}
                  />
                  <Kbd>{shadowBlur}px</Kbd>
                </div>
              </div>
            </div>
          </div>

          {/* Wavy parameters — always mounted, just hidden when off */}
          <div
            className={`w-full transition-opacity duration-200 ${
              wavyFont
                ? "visible opacity-100 pointer-events-auto"
                : "invisible opacity-0 pointer-events-none"
            }`}
            aria-hidden={!wavyFont}
          >
            <div className="grid grid-cols-3 gap-3 w-full">
              <div>
                <label className="text-xs text-custom-muted">Wave Amp</label>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={waveAmp}
                  onChange={(e) => setWaveAmp(+e.target.value)}
                  className="w-full mt-1.5"
                  tabIndex={wavyFont ? 0 : -1}
                />
              </div>
              <div>
                <label className="text-xs text-custom-muted">Wavelength</label>
                <input
                  type="range"
                  min="40"
                  max="400"
                  step="1"
                  value={waveLength}
                  onChange={(e) => setWaveLength(+e.target.value)}
                  className="w-full mt-1.5"
                  tabIndex={wavyFont ? 0 : -1}
                />
              </div>
              <div>
                <label className="text-xs text-custom-muted">Tilt</label>
                <input
                  type="range"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={waveSkew}
                  onChange={(e) => setWaveSkew(+e.target.value)}
                  className="w-full mt-1.5"
                  tabIndex={wavyFont ? 0 : -1}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-center mt-2 w-full">
            <button
              onClick={primaryOnClick} // if you kept getPrimaryAction()
              disabled={primaryDisabled} // ^
              // onClick={generateVideo}      // <-- use these 2 lines instead if you DIDN'T adopt getPrimaryAction()
              // disabled={buttonDisabled}
              className="w-56 px-4 py-2.5 rounded-lg bg-gradient-to-b from-blue-600 to-blue-800 border border-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-center"
            >
              {primaryText}{" "}
              {/* or {buttonText} if not using getPrimaryAction */}
            </button>
          </div>

          {downloadUrl && (
            <div className="mt-2 flex gap-2">
              <a
                href={downloadUrl}
                download="spongebob-timecard.mp4"
                className="inline-block rounded-full bg-green-800 border border-green-600 px-4 py-1 text-sm text-green-100"
              >
                Ready: Download MP4
              </a>
              <button
                onClick={shareOrSave}
                className="inline-block rounded-full bg-blue-800 border border-blue-600 px-4 py-1 text-sm text-blue-100"
              >
                Share / Save
              </button>
            </div>
          )}

          {status !== "idle" && status !== "ready" && (
            <div className="text-xs text-custom-muted mt-1">
              {status === "generating-audio" && "Contacting TTS..."}
              {status === "recording" && "Recording canvas + audio..."}
              {status === "transcoding" &&
                "Converting to MP4 (in your browser)..."}
            </div>
          )}
        </section>
        {/* ---------- Preview Panel ---------- */}
        <section className="flex flex-col items-center rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0b1222] to-[#0b0f1d]/85 p-4 shadow-2xl">
          <div className="relative flex items-center justify-center w-full h-[clamp(360px,80vh,720px)] overflow-hidden">
            <div
              className={`${
                ASPECT_RATIOS[aspectRatio].w >
                (4 / 3) * ASPECT_RATIOS[aspectRatio].h
                  ? "w-full h-auto"
                  : "h-full w-auto"
              } max-w-full max-h-full`}
              style={{ aspectRatio: `${ar.w} / ${ar.h}` }}
            >
              {!showVideoPreview && (
                <canvas
                  key={canvasKey}
                  ref={canvasRef}
                  className="w-full h-full rounded-lg bg-black border border-slate-800"
                />
              )}

              {showVideoPreview && previewUrl && (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  className="w-full h-full rounded-lg bg-black border border-slate-800"
                />
              )}
            </div>

            {/* NEW: Aspect Ratio selector pinned to bottom-right */}
            <div className="absolute top-1 left-1 pointer-events-auto">
              <label htmlFor="ar-select" className="sr-only">
                Aspect Ratio
              </label>
              <select
                id="ar-select"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="rounded-lg border border-[#243042] bg-[#0d1b2a]/90 backdrop-blur px-3 py-2 text-sm text-custom-text shadow-lg
             focus:outline-none focus:ring-0 focus:border-blue-500/10 focus-visible:ring-2 focus-visible:ring-blue-500/10"
                title="Aspect Ratio"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="4:3">4:3</option>
              </select>
            </div>
          </div>
        </section>
      </main>

      {/* ---------- Thumbnails Panel ---------- */}
      <section className="mx-4 mb-4 rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0b1222] to-[#0b0f1d]/85 p-4 shadow-2xl">
        <h2 className="mb-4 text-sm font-semibold text-custom-muted">
          Choose a background
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5">
          {/* Upload tile (square, no white focus ring, no tooltip) */}
          <label
            htmlFor="upload-input"
            className="relative cursor-pointer block w-full outline-none focus:outline-none focus-visible:outline-none focus-within:outline-none"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <input
              id="upload-input"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="sr-only"
              aria-label="Upload image"
            />

            <div
              className={`aspect-square w-full rounded-lg border border-[#243042] bg-[#0d1b2a] 
                flex flex-col items-center justify-center gap-2
                transition-all duration-150 ease-in-out 
                hover:-translate-y-0.5 hover:shadow-lg hover:border-blue-600
                outline-none focus:outline-none focus-visible:outline-none
                ${
                  selectedThumb === null
                    ? "outline outline-2 outline-offset-2 outline-custom-accent-2"
                    : ""
                }`}
            >
              <div className="rounded-full border border-slate-600 p-3 bg-slate-800/60">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <span className="text-xs text-custom-muted select-none">
                Upload image
              </span>
            </div>
          </label>

          {presetImages.map((src, i) => (
            <div
              key={src}
              className="relative cursor-pointer"
              onClick={() => handleThumbClick(src, i)}
            >
              <NextImage
                src={src}
                alt={`Preset ${i + 1}`}
                width={120}
                height={120}
                className={`w-full h-auto aspect-square object-cover rounded-lg border border-[#243042] bg-[#0d1b2a] transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:shadow-lg hover:border-blue-600 ${
                  selectedThumb === i
                    ? "outline outline-2 outline-offset-2 outline-custom-accent-2"
                    : ""
                }`}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  // ---------- Handlers ----------
  function handleThumbClick(url, index) {
    handleImageLoad(url);
    setSelectedThumb(index);
  }
}
