import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) =>
  "₱" + parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fuzzyScore(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 80;
  let matches = 0, ti = 0;
  for (let qi = 0; qi < q.length && ti < t.length; qi++) {
    while (ti < t.length && t[ti] !== q[qi]) ti++;
    if (ti < t.length) { matches++; ti++; }
  }
  const score = matches / Math.max(q.length, 1);
  return score >= 0.6 ? Math.round(score * 70) : 0;
}

function fuzzyMatch(query, items) {
  if (!query.trim()) return [];
  return items
    .map((item) => ({ item, score: fuzzyScore(query, item.name) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => r.item);
}

// ── THEME ─────────────────────────────────────────────────────────────────────
const T = {
  dark: {
    bg: "bg-[#0f0720]",
    surface: "bg-[#1a0d35]",
    card: "bg-[#231245]",
    input: "bg-[#130928]",
    border: "border-[#3d2270]",
    divide: "divide-[#2e1a55]",
    text: "text-[#ede8ff]",
    textMuted: "text-[#9b7fd4]",
    textFaint: "text-[#4a3070]",
    hover: "hover:bg-[#231245]",
    accent: "text-[#c084fc]",
    accentBg: "bg-[#7c3aed]",
    accentHov: "hover:bg-[#6d28d9]",
    btnSec: "bg-[#231245] hover:bg-[#2e1a55] text-[#ede8ff]",
    tblHead: "bg-[#130928]",
    rowHov: "hover:bg-[#231245]",
    suggestion: "bg-[#1a0d35] hover:bg-[#231245]",
    headerBg: "bg-[#1a0d35]/95",
    cashierActive: "bg-gradient-to-r from-violet-600 to-purple-700",
    badge: "bg-[#2e1a55] text-[#c084fc]",
  },
  light: {
    bg: "bg-[#f5f0ff]",
    surface: "bg-white",
    card: "bg-[#faf7ff]",
    input: "bg-[#f0e8ff]",
    border: "border-[#ddd0f8]",
    divide: "divide-[#ede6ff]",
    text: "text-[#1e0a40]",
    textMuted: "text-[#7c4db5]",
    textFaint: "text-[#c8b8e8]",
    hover: "hover:bg-[#f0e8ff]",
    accent: "text-[#7c3aed]",
    accentBg: "bg-[#7c3aed]",
    accentHov: "hover:bg-[#6d28d9]",
    btnSec: "bg-[#f0e8ff] hover:bg-[#e5d8ff] text-[#1e0a40]",
    tblHead: "bg-[#f0e8ff]",
    rowHov: "hover:bg-[#faf7ff]",
    suggestion: "bg-white hover:bg-[#f5f0ff]",
    headerBg: "bg-white/95",
    cashierActive: "bg-gradient-to-r from-violet-600 to-purple-600",
    badge: "bg-[#ede6ff] text-[#7c3aed]",
  },
};

// ── TOAST ─────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`px-4 py-3 rounded-2xl text-sm font-medium shadow-2xl pointer-events-auto backdrop-blur-sm
          ${t.type === "success" ? "bg-emerald-500/90 text-white" : ""}
          ${t.type === "error" ? "bg-red-500/90 text-white" : ""}
          ${t.type === "info" ? "bg-violet-600/90 text-white" : ""}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── MIC ICON ──────────────────────────────────────────────────────────────────
function MicIcon({ listening }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={listening ? "#ef4444" : "currentColor"} />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={listening ? "#ef4444" : "currentColor"} strokeWidth="2" strokeLinecap="round" fill="none" />
      <line x1="12" y1="18" x2="12" y2="22" stroke={listening ? "#ef4444" : "currentColor"} strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="22" x2="15" y2="22" stroke={listening ? "#ef4444" : "currentColor"} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── VOICE SEARCH ──────────────────────────────────────────────────────────────
function useVoiceSearch(items, onResult, onError) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const supported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = useCallback(() => {
    if (!supported) { onError?.("Voice search not supported."); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "en-PH"; r.interimResults = false; r.maxAlternatives = 3;
    recRef.current = r;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); onError?.("Could not hear you. Try again."); };
    r.onresult = (e) => {
      const alts = Array.from({ length: e.results[0].length }, (_, i) => e.results[0][i].transcript.trim());
      let best = null, bestScore = 0;
      for (const alt of alts) {
        for (const item of items) {
          const score = fuzzyScore(alt, item.name);
          if (score > bestScore) { bestScore = score; best = item; }
        }
      }
      if (best && bestScore >= 50) onResult(best.name, best);
      else {
        const matches = fuzzyMatch(alts[0], items);
        if (matches.length) onResult(matches[0].name, matches[0]);
        else onError?.(`Could not match "${alts[0]}" to any item.`);
      }
    };
    r.start();
  }, [supported, items, onResult, onError]);

  const stop = useCallback(() => { recRef.current?.stop(); setListening(false); }, []);
  return { listening, start, stop, supported };
}

// ── BARCODE SCANNER (FIXED) ───────────────────────────────────────────────────
function BarcodeScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("starting");

  useEffect(() => {
    mountedRef.current = true;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video || !mountedRef.current) return;

        // ── FIX: set srcObject then wait for canplay before calling play() ──
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;

        await new Promise((resolve, reject) => {
          video.oncanplay = resolve;
          video.onerror = reject;
          // Fallback timeout in case canplay never fires
          setTimeout(resolve, 3000);
        });

        if (!mountedRef.current) return;

        try {
          await video.play();
        } catch (playErr) {
          // AbortError can be safely ignored if we're still mounted
          if (!mountedRef.current) return;
          console.warn("play() interrupted:", playErr.message);
        }

        if (!mountedRef.current) return;

        // Wait for ZXing
        let attempts = 0;
        while (!window.ZXing && attempts < 50) {
          await new Promise((r) => setTimeout(r, 200));
          attempts++;
        }
        if (!window.ZXing || !mountedRef.current) { setStatus("error"); return; }

        setStatus("active");

        const hints = new Map();
        hints.set(window.ZXing.DecodeHintType?.TRY_HARDER, true);
        const reader = new window.ZXing.BrowserMultiFormatReader(hints);
        const canvas = canvasRef.current;

        function tick() {
          if (!mountedRef.current || !videoRef.current || !canvas) return;
          const v = videoRef.current;
          if (v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            try {
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const lum = new window.ZXing.RGBLuminanceSource(imgData.data, canvas.width, canvas.height);
              const bmp = new window.ZXing.BinaryBitmap(new window.ZXing.HybridBinarizer(lum));
              const result = reader.decode(bmp);
              if (result && mountedRef.current) {
                cleanup();
                onDetect(result.getText());
                return;
              }
            } catch (_) { /* no barcode this frame */ }
          }
          rafRef.current = requestAnimationFrame(tick);
        }
        rafRef.current = requestAnimationFrame(tick);

      } catch (err) {
        console.error("Camera error:", err);
        if (mountedRef.current) setStatus("error");
      }
    }

    function cleanup() {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((tr) => tr.stop());
      if (videoRef.current) { videoRef.current.srcObject = null; }
    }

    start();
    return cleanup;
  }, []);

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-violet-500/30 shadow-xl">
      <div className="relative bg-black" style={{ minHeight: 260 }}>
        <video
          ref={videoRef}
          className="w-full block"
          muted
          playsInline
          style={{ maxHeight: 340, objectFit: "cover" }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan frame overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: "70%", height: 110, boxShadow: "0 0 0 9999px rgba(0,0,0,0.52)", borderRadius: 8 }}>
            {[["top-0 left-0", "border-t-2 border-l-2"], ["top-0 right-0", "border-t-2 border-r-2"],
              ["bottom-0 left-0", "border-b-2 border-l-2"], ["bottom-0 right-0", "border-b-2 border-r-2"]
            ].map(([pos, brd], i) => (
              <span key={i} className={`absolute w-6 h-6 ${pos} ${brd} border-violet-400 rounded-sm`} />
            ))}
            {status === "active" && (
              <div className="absolute inset-x-0 h-0.5 bg-violet-400/80"
                style={{ top: 0, animation: "scanline 1.8s ease-in-out infinite" }} />
            )}
          </div>
        </div>

        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-2">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-white/70 text-sm">Starting camera…</span>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 gap-3">
            <span className="text-3xl">📷</span>
            <span className="text-red-400 text-sm text-center leading-relaxed">
              Camera unavailable or permission denied.<br />
              <span className="text-white/40 text-xs">Check browser permissions and try again.</span>
            </span>
          </div>
        )}
        {status === "active" && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center">
            <span className="text-xs text-white/60 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
              Point camera at barcode
            </span>
          </div>
        )}
      </div>
      <button onClick={onClose}
        className="w-full py-2.5 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors">
        ✕ Close Camera
      </button>
    </div>
  );
}

// ── HOMEPAGE ──────────────────────────────────────────────────────────────────
function HomePage({ onEnter, dark, setDark }) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden select-none"
      style={{ background: "linear-gradient(145deg, #0f0720 0%, #3b1275 55%, #7c3aed 100%)" }}>
      {/* Decorative blobs */}
      <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, #c084fc, transparent)" }} />
      <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, #7c3aed, transparent)" }} />
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

      {/* Top bar */}
      <div className="relative z-30 flex items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏪</span>
          <span className="text-white font-bold text-lg tracking-wide">
            Inah <span className="text-violet-300">Store</span>
          </span>
        </div>
        <button onClick={() => setDark(d => !d)}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all active:scale-95">
          {dark ? "☀️" : "🌙"}
        </button>
      </div>

      {/* Hero */}
      <div className="relative z-30 flex-1 flex flex-col items-center justify-center px-8 text-center pb-20">
        <div className="w-28 h-28  flex items-center justify-center mb-8 shadow-2xl"
          style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", boxShadow: "0 24px 64px rgba(124,58,237,0.55)" }}>
          <span className="text-6xl">🏪</span>
        </div>
        <h1 className="text-5xl font-black text-white leading-tight mb-3 tracking-tight drop-shadow-lg">
          Inah Store
        </h1>
        <p className="text-white/55 text-lg mb-12 leading-relaxed max-w-xs">
          Bring your sales &amp; inventory together
        </p>
        <button onClick={onEnter}
          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl shadow-2xl transition-all active:scale-90 hover:scale-105"
          style={{ background: "linear-gradient(135deg, #c084fc, #7c3aed)", boxShadow: "0 16px 48px rgba(124,58,237,0.6)" }}>
          →
        </button>
        <p className="text-white/25 text-xs mt-4 uppercase tracking-[0.2em]">tap to open</p>
      </div>

      {/* Feature pills */}
      <div className="relative z-30 flex justify-center gap-3 pb-10 px-6 flex-wrap">
        {[["🛒", "POS"], ["📦", "Inventory"], ["☁️", "Cloud Sync"]].map(([icon, label]) => (
          <div key={label} className="flex items-center gap-2 text-white/80 text-sm px-4 py-2 rounded-full"
            style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <span>{icon}</span><span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── POS TAB ───────────────────────────────────────────────────────────────────
function PosTab({ items, addToast, t }) {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [cash, setCashVal] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const searchRef = useRef(null);
  const suggRef = useRef(null);

  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const cashNum = parseFloat(cash) || 0;
  const change = cashNum - total;

  useEffect(() => {
    if (!search.trim()) { setSuggestions([]); setShowSugg(false); return; }
    const matches = fuzzyMatch(search, items);
    setSuggestions(matches);
    setShowSugg(matches.length > 0);
  }, [search, items]);

  useEffect(() => {
    const handler = (e) => {
      if (suggRef.current && !suggRef.current.contains(e.target) &&
        searchRef.current && !searchRef.current.contains(e.target)) setShowSugg(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addItemToCart = useCallback((item) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.id === item.id);
      return ex ? prev.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c) : [...prev, { ...item, qty: 1 }];
    });
    addToast(`+1 ${item.name}`, "success");
    setSearch(""); setSuggestions([]); setShowSugg(false);
  }, [addToast]);

  const posSearch = useCallback((q) => {
    const query = (q ?? search).trim().toLowerCase();
    if (!query) return;
    const item =
      items.find((i) => i.barcode && i.barcode.toLowerCase() === query) ||
      items.find((i) => i.name.toLowerCase() === query) ||
      fuzzyMatch(query, items)[0];
    if (!item) { addToast(`"${query}" not found`, "error"); return; }
    addItemToCart(item);
  }, [search, items, addItemToCart, addToast]);

  const { listening, start: startVoice, stop: stopVoice, supported: voiceSupported } = useVoiceSearch(
    items,
    (name, item) => { addToast(`🎤 "${name}"`, "info"); addItemToCart(item); },
    (err) => addToast(err, "error")
  );

  const changeQty = (id, delta) =>
    setCart((prev) => prev.map((c) => c.id === id ? { ...c, qty: c.qty + delta } : c).filter((c) => c.qty > 0));

  const checkout = () => {
    if (!cart.length) { addToast("Cart is empty!", "error"); return; }
    if (cashNum < total) { addToast("Cash is less than total!", "error"); return; }
    addToast(`✓ Sale complete! Change: ${fmt(change)}`, "success");
    setCart([]); setCashVal("");
  };

  const inputCls = `w-full ${t.input} border ${t.border} rounded-xl ${t.text} px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 placeholder:opacity-40 transition-all`;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left column */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          {/* Search bar */}
          <div className={`${t.surface} border ${t.border} rounded-2xl p-4 shadow-sm`}>
            <div className="flex gap-2 relative">
              <div className="relative flex-1" ref={searchRef}>
                <input
                  className={inputCls}
                  placeholder="Search item or scan barcode…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { posSearch(); setShowSugg(false); }
                    if (e.key === "Escape") setShowSugg(false);
                  }}
                  onFocus={() => suggestions.length > 0 && setShowSugg(true)}
                />
                {showSugg && (
                  <div ref={suggRef}
                    className={`absolute top-full left-0 right-0 mt-1 rounded-xl border ${t.border} overflow-hidden z-50 shadow-2xl ${t.surface}`}>
                    {suggestions.map((item) => (
                      <button key={item.id}
                        onMouseDown={(e) => { e.preventDefault(); addItemToCart(item); }}
                        className={`w-full flex items-center justify-between px-4 py-3 text-sm ${t.suggestion} transition border-b ${t.border} last:border-b-0`}>
                        <span className={`font-medium ${t.text}`}>{item.name}</span>
                        <span className="text-violet-500 font-mono text-xs font-semibold">{fmt(item.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {voiceSupported && (
                <button onClick={listening ? stopVoice : startVoice}
                  title={listening ? "Stop" : "Voice search"}
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center transition
                    ${listening ? "bg-red-500/10 border-red-500 text-red-500 animate-pulse" : `${t.btnSec} ${t.border} border ${t.textMuted}`}`}>
                  <MicIcon listening={listening} />
                </button>
              )}
              <button onClick={() => setScannerOpen((v) => !v)}
                title="Scan barcode"
                className={`w-10 h-10 rounded-xl border flex items-center justify-center transition text-base
                  ${scannerOpen ? "bg-violet-600 text-white border-violet-600" : `${t.btnSec} ${t.border} border`}`}>
                📷
              </button>
            </div>
            {listening && (
              <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                Listening… say an item name
              </div>
            )}
            {scannerOpen && (
              <BarcodeScanner
                onDetect={(code) => { setScannerOpen(false); posSearch(code); }}
                onClose={() => setScannerOpen(false)}
              />
            )}
          </div>

          {/* Cart */}
          <div className={`${t.surface} border ${t.border} rounded-2xl p-4 flex-1 shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className={`text-xs ${t.textMuted} uppercase tracking-widest`}>Cart</p>
                {count > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${t.badge}`}>
                    {count}
                  </span>
                )}
              </div>
              {cart.length > 0 && (
                <button onClick={() => { if (window.confirm("Clear cart?")) setCart([]); }}
                  className="text-xs text-red-400 hover:text-red-500 transition">
                  Clear all
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-0.5 scrollbar-thin">
              {!cart.length ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <span className="text-3xl opacity-20">🛒</span>
                  <p className={`${t.textFaint} text-sm`}>No items yet</p>
                </div>
              ) : cart.map((c) => (
                <div key={c.id} className={`${t.card} border ${t.border} rounded-xl flex items-center gap-3 px-3 py-2.5 transition`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.text} truncate`}>{c.name}</p>
                    <p className={`text-xs ${t.textMuted} mt-0.5`}>
                      {fmt(c.price)} × {c.qty} = <span className="text-violet-500 font-mono font-semibold">{fmt(c.price * c.qty)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => changeQty(c.id, -1)}
                      className={`${t.btnSec} w-7 h-7 rounded-lg flex items-center justify-center text-sm transition hover:bg-violet-600 hover:text-white`}>−</button>
                    <span className={`font-mono text-sm w-5 text-center ${t.text}`}>{c.qty}</span>
                    <button onClick={() => changeQty(c.id, 1)}
                      className={`${t.btnSec} w-7 h-7 rounded-lg flex items-center justify-center text-sm transition hover:bg-violet-600 hover:text-white`}>+</button>
                    <button onClick={() => setCart((p) => p.filter((x) => x.id !== c.id))}
                      className="ml-1 text-red-400 hover:text-red-500 w-6 h-6 flex items-center justify-center text-sm transition">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Summary + Payment */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className={`${t.surface} border ${t.border} rounded-2xl p-5 flex flex-col gap-4 shadow-sm`}>
            <div className={`flex justify-between text-sm ${t.textMuted}`}>
              <span>Items</span>
              <span className="font-mono font-semibold">{count}</span>
            </div>
            <div className={`border-t ${t.border} pt-3 flex justify-between items-center`}>
              <span className={`text-base font-semibold ${t.textMuted}`}>Total</span>
              <span className="text-2xl font-black text-violet-500 font-mono">{fmt(total)}</span>
            </div>
            <div>
              <p className={`text-xs ${t.textMuted} mb-1.5 font-medium`}>Cash Received</p>
              <input type="number" min="0" step="1"
                className={`${inputCls} font-mono text-lg`}
                placeholder="₱0.00" value={cash} onChange={(e) => setCashVal(e.target.value)} />
              <div className={`flex justify-between text-sm mt-2 ${t.textMuted}`}>
                <span>Change</span>
                <span className={`font-mono font-bold ${cashNum === 0 ? t.textFaint : change < 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {cashNum === 0 ? "₱0.00" : change < 0 ? `-${fmt(Math.abs(change))} short` : fmt(change)}
                </span>
              </div>
            </div>
            <button onClick={checkout}
              className="text-white font-bold rounded-xl py-3 text-base transition-all active:scale-95 shadow-lg"
              style={{ background: "linear-gradient(135deg, #c084fc, #7c3aed)", boxShadow: "0 8px 24px rgba(124,58,237,0.35)" }}>
              Checkout ✓
            </button>
          </div>

          {/* Quick cash */}
          <div className={`${t.surface} border ${t.border} rounded-2xl p-4 shadow-sm`}>
            <p className={`text-xs ${t.textMuted} uppercase tracking-widest mb-3 font-medium`}>Quick Cash</p>
            <div className="grid grid-cols-3 gap-2">
              {[20, 50, 100, 200, 500, 1000].map((a) => (
                <button key={a} onClick={() => setCashVal(String(Math.ceil(total / a) * a || a))}
                  className={`${t.btnSec} text-sm py-2 rounded-xl transition-all active:scale-95 font-medium`}>
                  ₱{a}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── INVENTORY TAB ─────────────────────────────────────────────────────────────
function InventoryTab({ items, setItems, addToast, t }) {
  const [form, setForm] = useState({ name: "", price: "", barcode: "", category: "" });
  const [editingId, setEditingId] = useState(null);
  const [invSearch, setInvSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = invSearch.trim()
    ? items.filter((i) =>
      i.name.toLowerCase().includes(invSearch.toLowerCase()) ||
      (i.barcode || "").toLowerCase().includes(invSearch.toLowerCase()) ||
      (i.category || "").toLowerCase().includes(invSearch.toLowerCase()))
    : [...items];

  const saveItem = async () => {
    const { name, price, barcode, category } = form;
    if (!name.trim()) { setError("Item name is required."); return; }
    if (isNaN(parseFloat(price)) || parseFloat(price) < 0) { setError("Enter a valid price."); return; }
    setError(""); setSaving(true);
    try {
      if (editingId) {
        const payload = { name: name.trim(), price: parseFloat(price), barcode: barcode.trim() || null, category: category.trim() || null };
        const { error: sbErr } = await supabase.from("items").update(payload).eq("id", editingId);
        if (sbErr) throw sbErr;
        setItems((prev) => prev.map((i) => i.id === editingId ? { ...i, ...payload } : i));
        addToast("Item updated!", "success"); cancelEdit();
      } else {
        if (items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase())) { setError("Item name already exists."); setSaving(false); return; }
        const newItem = { id: uid(), name: name.trim(), price: parseFloat(price), barcode: barcode.trim() || null, category: category.trim() || null };
        const { error: sbErr } = await supabase.from("items").insert([newItem]);
        if (sbErr) throw sbErr;
        setItems((prev) => [...prev, newItem]);
        addToast("Item added!", "success");
        setForm({ name: "", price: "", barcode: "", category: "" });
      }
    } catch (e) { addToast("Database error: " + (e.message || "unknown"), "error"); }
    finally { setSaving(false); }
  };

  const editItem = (id) => {
    const item = items.find((i) => i.id === id); if (!item) return;
    setEditingId(id);
    setForm({ name: item.name, price: String(item.price), barcode: item.barcode || "", category: item.category || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      const { error: sbErr } = await supabase.from("items").delete().eq("id", id);
      if (sbErr) throw sbErr;
      setItems((prev) => prev.filter((i) => i.id !== id));
      addToast("Item deleted.", "info");
    } catch (e) { addToast("Delete failed: " + (e.message || "unknown"), "error"); }
  };

  const cancelEdit = () => { setEditingId(null); setForm({ name: "", price: "", barcode: "", category: "" }); setError(""); };
  const inputCls = `w-full ${t.input} border ${t.border} rounded-xl ${t.text} px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:opacity-40`;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Add / Edit form */}
      <div className={`${t.surface} border ${t.border} rounded-2xl p-5 mb-4 shadow-sm`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">{editingId ? "✏️" : "➕"}</span>
          <p className={`text-xs ${t.textMuted} uppercase tracking-widest font-semibold`}>
            {editingId ? "Edit Item" : "Add New Item"}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {[{ label: "Name", key: "name", ph: "e.g. Milo 3-in-1", type: "text" },
            { label: "Price (₱)", key: "price", ph: "0.00", type: "number" }].map(({ label, key, ph, type }) => (
            <div key={key}>
              <label className={`text-xs ${t.textMuted} mb-1.5 block font-medium`}>{label}</label>
              <input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined}
                className={inputCls} placeholder={ph}
                value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className={`text-xs ${t.textMuted} mb-1.5 block font-medium`}>Barcode <span className={t.textFaint}>(optional)</span></label>
            <div className="flex gap-2">
              <input className={`${inputCls} flex-1`} placeholder="Scan or type barcode"
                value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} />
              <button onClick={() => setScannerOpen((v) => !v)}
                className={`px-3 rounded-xl border transition text-base ${scannerOpen ? "bg-violet-600 text-white border-violet-600" : `${t.btnSec} ${t.border} border`}`}>
                📷
              </button>
            </div>
          </div>
          <div>
            <label className={`text-xs ${t.textMuted} mb-1.5 block font-medium`}>Category <span className={t.textFaint}>(optional)</span></label>
            <input className={inputCls} placeholder="e.g. Beverages"
              value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </div>
        </div>
        {scannerOpen && (
          <BarcodeScanner
            onDetect={(code) => { setScannerOpen(false); setForm((f) => ({ ...f, barcode: code })); addToast("Scanned: " + code, "success"); }}
            onClose={() => setScannerOpen(false)}
          />
        )}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-500 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <span>⚠️</span> {error}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <button onClick={saveItem} disabled={saving}
            className="disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl transition-all active:scale-95 text-sm shadow-md"
            style={{ background: "linear-gradient(135deg, #c084fc, #7c3aed)" }}>
            {saving ? "Saving…" : editingId ? "Update Item" : "Save Item"}
          </button>
          {editingId && (
            <button onClick={cancelEdit} className={`${t.btnSec} px-4 py-2.5 rounded-xl transition text-sm`}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className={`${t.surface} border ${t.border} rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-3 shadow-sm`}>
        <span className={`${t.textFaint} text-sm`}>🔍</span>
        <input className={`flex-1 bg-transparent ${t.text} text-sm outline-none placeholder:opacity-40`}
          placeholder="Search by name, barcode, or category…"
          value={invSearch} onChange={(e) => setInvSearch(e.target.value)} />
        {invSearch && <button onClick={() => setInvSearch("")} className={`${t.textMuted} text-sm hover:text-red-400 transition`}>✕</button>}
        <span className={`text-xs ${t.textMuted} font-mono ${t.badge} px-2 py-0.5 rounded-full`}>{filtered.length}/{items.length}</span>
      </div>

      {/* Items table */}
      <div className={`${t.surface} border ${t.border} rounded-2xl overflow-hidden shadow-sm`}>
        <div className={`grid grid-cols-12 text-xs ${t.textMuted} uppercase tracking-widest px-4 py-3 border-b ${t.border} ${t.tblHead} font-semibold`}>
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Price</div>
          <div className="col-span-3">Barcode</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-1" />
        </div>
        <div className={`max-h-96 overflow-y-auto ${t.divide} divide-y`}>
          {!filtered.length ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="text-3xl opacity-20">📦</span>
              <p className={`${t.textFaint} text-sm`}>{invSearch ? `No results for "${invSearch}"` : "No items yet."}</p>
            </div>
          ) : filtered.map((item) => (
            <div key={item.id} className={`grid grid-cols-12 items-center px-4 py-3 ${t.rowHov} transition text-sm`}>
              <div className={`col-span-4 font-semibold ${t.text} truncate`}>{item.name}</div>
              <div className="col-span-2 font-mono text-violet-500 text-xs font-bold">{fmt(item.price)}</div>
              <div className={`col-span-3 font-mono ${t.textMuted} text-xs truncate`}>{item.barcode || "—"}</div>
              <div className={`col-span-2 ${t.textMuted} text-xs truncate`}>{item.category || "—"}</div>
              <div className="col-span-1 flex gap-1 justify-end">
                <button onClick={() => editItem(item.id)} className={`${t.textMuted} hover:text-violet-500 text-sm px-1 transition`} title="Edit">✏️</button>
                <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-500 text-sm px-1 transition" title="Delete">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [tab, setTab] = useState("pos");
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("inah_theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const t = dark ? T.dark : T.light;

  const addToast = useCallback((msg, type = "info") => {
    const id = uid();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2800);
  }, []);

  useEffect(() => {
    supabase.from("items").select("*").order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) addToast("Could not load items.", "error");
        else setItems(data || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => { localStorage.setItem("inah_theme", dark ? "dark" : "light"); }, [dark]);

  if (page === "home") return (
    <>
      <HomePage onEnter={() => setPage("app")} dark={dark} setDark={setDark} />
      <style>{`@keyframes scanline{0%,100%{top:0}50%{top:calc(100% - 2px)}}`}</style>
    </>
  );

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300`}>
      <style>{`
        @keyframes scanline{0%,100%{top:0}50%{top:calc(100% - 2px)}}
        .scrollbar-thin::-webkit-scrollbar{width:4px}
        .scrollbar-thin::-webkit-scrollbar-track{background:transparent}
        .scrollbar-thin::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.3);border-radius:9999px}
      `}</style>

      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3 border-b ${t.border} ${t.headerBg} backdrop-blur-md sticky top-0 z-40`}>
        <button onClick={() => setPage("home")} className="flex items-center gap-2.5 group">
          <span className="text-xl">🏪</span>
          <div>
            <p className="text-sm font-extrabold text-violet-500 leading-none tracking-wide">INAH STORE</p>
            <p className={`text-xs ${t.textFaint} leading-none mt-0.5 font-mono`}>POS System</p>
          </div>
        </button>

        <div className="flex items-center gap-1.5">
          {[["pos", "🛒", "Cashier"], ["inventory", "📦", "Inventory"]].map(([id, icon, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm transition-all font-semibold
                ${tab === id ? "text-white shadow-md" : `${t.textMuted} ${t.hover}`}`}
              style={tab === id ? { background: "linear-gradient(135deg, #c084fc, #7c3aed)" } : {}}>
              <span className="text-base leading-none">{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
          <button onClick={() => setDark((d) => !d)}
            className={`ml-1 w-8 h-8 rounded-xl border ${t.border} ${t.card} flex items-center justify-center text-sm transition-all hover:border-violet-400 active:scale-95`}
            title={dark ? "Light mode" : "Dark mode"}>
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-28 gap-4">
          <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className={`text-sm ${t.textMuted}`}>Loading items…</p>
        </div>
      ) : (
        <>
          {tab === "pos" && <PosTab items={items} addToast={addToast} t={t} />}
          {tab === "inventory" && <InventoryTab items={items} setItems={setItems} addToast={addToast} t={t} />}
        </>
      )}
      <Toast toasts={toasts} />
    </div>
  );
}