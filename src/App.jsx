import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";

let supabase;
if (!globalThis.__supabase) {
  globalThis.__supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}
supabase = globalThis.__supabase;

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

const DEFAULT_CATEGORIES = [
  "Beverages", "Snacks", "Dairy", "Canned Goods", "Instant Noodles",
  "Condiments", "Personal Care", "Household", "Frozen Foods", "Bakery",
  "Produce", "Meat & Seafood", "Rice & Grains", "Sweets & Candy", "Tobacco",
];

// ── UNIFIED PURPLE THEME ──────────────────────────────────────────────────────
const T = {
  dark: {
    bg: "bg-[#0e0720]",
    surface: "bg-[#180d35]",
    card: "bg-[#22104a]",
    input: "bg-[#0e0720]",
    border: "border-[#2e1660]",
    divide: "divide-[#2e1660]",
    text: "text-[#ede0ff]",
    textMuted: "text-[#9b72cc]",
    textFaint: "text-[#3a1e70]",
    hover: "hover:bg-[#22104a]",
    accent: "text-[#b388ff]",
    accentBg: "bg-[#7c3aed]",
    accentText: "text-white",
    accentHov: "hover:bg-[#6d28d9]",
    btnSec: "bg-[#22104a] hover:bg-[#2d1660] text-[#ede0ff]",
    tblHead: "bg-[#0e0720]",
    rowHov: "hover:bg-[#22104a]",
    suggestion: "bg-[#180d35] hover:bg-[#22104a]",
    headerBg: "bg-[#0e0720]/95",
    badge: "bg-[#22104a] text-[#9b72cc]",
    tabActive: "bg-[#7c3aed] text-white",
    tabInactive: "text-[#5b3a8a] hover:text-[#9b72cc]",
  },
  light: {
    bg: "bg-[#f0ebff]",
    surface: "bg-[#ffffff]",
    card: "bg-[#e8dfff]",
    input: "bg-[#f3eeff]",
    border: "border-[#c9b3f0]",
    divide: "divide-[#ddd0f8]",
    text: "text-[#1a0a3e]",
    textMuted: "text-[#6b3fa8]",
    textFaint: "text-[#c4aae8]",
    hover: "hover:bg-[#e8dfff]",
    accent: "text-[#6d28d9]",
    accentBg: "bg-[#7c3aed]",
    accentText: "text-white",
    accentHov: "hover:bg-[#6d28d9]",
    btnSec: "bg-[#e8dfff] hover:bg-[#ddd0f8] text-[#1a0a3e]",
    tblHead: "bg-[#f3eeff]",
    rowHov: "hover:bg-[#f8f4ff]",
    suggestion: "bg-white hover:bg-[#f3eeff]",
    headerBg: "bg-[#f0ebff]/95",
    badge: "bg-[#e8dfff] text-[#6b3fa8]",
    tabActive: "bg-[#7c3aed] text-white",
    tabInactive: "text-[#b09ad0] hover:text-[#6b3fa8]",
  },
};

// ── TOAST ─────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`px-4 py-3 rounded-xl text-sm font-medium shadow-2xl pointer-events-auto
          ${t.type === "success" ? "bg-[#180d35] text-[#b388ff] border border-[#2e1660]" : ""}
          ${t.type === "error" ? "bg-[#1a0a0a] text-red-300 border border-red-900/30" : ""}
          ${t.type === "info" ? "bg-[#7c3aed] text-white" : ""}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function MicIcon({ listening }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={listening ? "#ef4444" : "currentColor"} />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={listening ? "#ef4444" : "currentColor"} strokeWidth="2" strokeLinecap="round" fill="none" />
      <line x1="12" y1="18" x2="12" y2="22" stroke={listening ? "#ef4444" : "currentColor"} strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="22" x2="15" y2="22" stroke={listening ? "#ef4444" : "currentColor"} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

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

// ── BARCODE SCANNER ───────────────────────────────────────────────────────────
function BarcodeScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const readerRef = useRef(null);
  const lastCodeRef = useRef(null);
  const lastTimeRef = useRef(0);
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
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play();
        if (!mountedRef.current) return;
        setStatus("active");
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;
        reader.decodeFromStream(stream, video, (result) => {
          if (!mountedRef.current || !result) return;
          const text = result.getText();
          if (text.startsWith("http") || text.startsWith("www.") || text.includes("://")) return;
          const now = Date.now();
          if (text === lastCodeRef.current && now - lastTimeRef.current < 1000) return;
          lastCodeRef.current = text;
          lastTimeRef.current = now;
          setTimeout(() => {
            if (!mountedRef.current) return;
            cleanup();
            onDetect(text);
          }, 1000);
        });
      } catch { if (mountedRef.current) setStatus("error"); }
    }
    function cleanup() {
      mountedRef.current = false;
      if (readerRef.current) { readerRef.current.reset(); readerRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach((tr) => tr.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    start();
    return cleanup;
  }, []);

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 shadow-xl">
      <div className="relative bg-black" style={{ minHeight: 260 }}>
        <video ref={videoRef} className="w-full block" muted playsInline style={{ maxHeight: 340, objectFit: "cover" }} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: "70%", height: 110, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", borderRadius: 8 }}>
            {[["top-0 left-0","border-t-2 border-l-2"],["top-0 right-0","border-t-2 border-r-2"],
              ["bottom-0 left-0","border-b-2 border-l-2"],["bottom-0 right-0","border-b-2 border-r-2"]
            ].map(([pos,brd],i) => <span key={i} className={`absolute w-6 h-6 ${pos} ${brd} border-white/70 rounded-sm`} />)}
            {status === "active" && (
              <div className="absolute inset-x-0 h-0.5 bg-purple-400/70" style={{ top: 0, animation: "scanline 1.8s ease-in-out infinite" }} />
            )}
          </div>
        </div>
        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-2">
            <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-white/50 text-sm">Starting camera…</span>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 gap-3">
            <span className="text-3xl">📷</span>
            <span className="text-red-400 text-sm text-center">Camera unavailable or permission denied.</span>
          </div>
        )}
        {status === "active" && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center">
            <span className="text-xs text-white/50 bg-black/50 px-3 py-1 rounded-full">Point at barcode — hold steady</span>
          </div>
        )}
      </div>
      <button onClick={onClose} className="w-full py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors">
        ✕ Close Camera
      </button>
    </div>
  );
}

// ── HOME PAGE ─────────────────────────────────────────────────────────────────
function HomePage({ onEnter, dark, setDark }) {
  const [entered, setEntered] = useState(false);
  const handleEnter = () => { setEntered(true); setTimeout(() => onEnter(), 600); };

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-between transition-all duration-600 ${entered ? "opacity-0 scale-105" : "opacity-100 scale-100"}`}
      style={{ background: "linear-gradient(175deg, #6b3fd4 0%, #4a2098 40%, #2d1070 70%, #1a0a4e 100%)" }}
    >
      {/* top-right theme toggle */}
      <div className="w-full flex justify-end px-6 pt-8">
        <button
          onClick={() => setDark(d => !d)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 text-sm transition-all"
          style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
        >
          {dark ? "☀" : "☽"}
        </button>
      </div>

      {/* center content */}
      <div className="flex flex-col items-center gap-4 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-2"
          style={{ background: "rgba(160,100,255,0.25)", border: "1px solid rgba(160,100,255,0.4)" }}>
          <span className="text-3xl">🏪</span>
        </div>
        <h1 className="text-white font-bold text-4xl tracking-tight" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.3)" }}>
          Annura Store
        </h1>
        <p className="text-white/50 text-sm tracking-wide">Bring your sales &amp; inventory together</p>
      </div>

      {/* bottom: arrow button + feature pills + credit */}
      <div className="flex flex-col items-center gap-5 pb-14 w-full px-8">
        {/* Arrow enter button */}
        <button
          onClick={handleEnter}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95"
          style={{
            background: "rgba(140,80,255,0.45)",
            border: "1px solid rgba(160,100,255,0.5)",
            color: "white",
            fontSize: "22px",
            boxShadow: "0 4px 24px rgba(100,40,200,0.3)",
          }}
        >
          →
        </button>
        <p className="text-white/30 text-[11px] tracking-[0.25em] uppercase">Tap to Open</p>

        {/* Feature pills */}
        <div className="flex gap-2 w-full max-w-xs">
          {[["🖥", "POS"], ["📦", "Inventory"], ["☁", "Cloud"]].map(([icon, label]) => (
            <div key={label} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <span className="text-xs">{icon}</span>
              <span className="text-white/50 text-[11px] font-medium">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="h-px w-8" style={{ background: "rgba(255,255,255,0.15)" }} />
          <p className="text-white/25 text-[11px] tracking-[0.25em] uppercase">Developed by mjdev</p>
          <div className="h-px w-8" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>
      </div>

      <style>{`@keyframes scanline{0%,100%{top:0}50%{top:calc(100% - 2px)}}`}</style>
    </div>
  );
}

// ── CATEGORY COMBOBOX ─────────────────────────────────────────────────────────
function CategoryComboBox({ value, onChange, allCategories, t }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value || "");
  const wrapRef = useRef(null);

  useEffect(() => { setInput(value || ""); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = allCategories.filter(c => !input.trim() || c.toLowerCase().includes(input.toLowerCase()));
  const select = (cat) => { onChange(cat); setInput(cat); setOpen(false); };
  const handleInput = (e) => { setInput(e.target.value); onChange(e.target.value); setOpen(true); };
  const inputCls = `w-full ${t.input} border ${t.border} rounded-xl ${t.text} px-3 py-2.5 text-base outline-none focus:border-purple-400/50 transition-all placeholder:opacity-30`;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input className={inputCls} placeholder="Select or type category…" value={input}
          onChange={handleInput} onFocus={() => setOpen(true)} />
        <button type="button" onClick={() => setOpen(v => !v)}
          className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg ${t.textMuted}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      {open && (
        <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl border ${t.border} overflow-hidden z-50 shadow-2xl ${t.surface} max-h-52 overflow-y-auto`}>
          {input.trim() && !allCategories.find(c => c.toLowerCase() === input.trim().toLowerCase()) && (
            <button onMouseDown={(e) => { e.preventDefault(); select(input.trim()); }}
              className={`w-full flex items-center gap-2 px-4 py-3 text-sm ${t.suggestion} transition border-b ${t.border} text-left`}>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-semibold">NEW</span>
              <span className={t.text}>Add "{input.trim()}"</span>
            </button>
          )}
          {!filtered.length && !input.trim() && (
            <div className={`px-4 py-3 text-sm ${t.textMuted}`}>Type to add a new category</div>
          )}
          {filtered.map((cat) => (
            <button key={cat} onMouseDown={(e) => { e.preventDefault(); select(cat); }}
              className={`w-full flex items-center px-4 py-3 text-sm ${t.suggestion} transition border-b ${t.border} last:border-b-0 text-left`}>
              <span className={`font-medium ${t.text}`}>{cat}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MENU TAB ──────────────────────────────────────────────────────────────────
function MenuTab({ items, addToast, t }) {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const searchRef = useRef(null);
  const suggRef = useRef(null);

  const categories = ["All", ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))];
  const filtered = items.filter(i => {
    const matchCat = activeCategory === "All" || i.category === activeCategory;
    const matchSearch = !search.trim() || i.name.toLowerCase().includes(search.toLowerCase()) || (i.barcode || "").includes(search);
    return matchCat && matchSearch;
  });

  useEffect(() => {
    if (!search.trim()) { setSuggestions([]); setShowSugg(false); return; }
    const matches = fuzzyMatch(search, items);
    setSuggestions(matches); setShowSugg(matches.length > 0);
  }, [search, items]);

  useEffect(() => {
    const handler = (e) => {
      if (suggRef.current && !suggRef.current.contains(e.target) &&
        searchRef.current && !searchRef.current.contains(e.target)) setShowSugg(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { listening, start: startVoice, stop: stopVoice, supported: voiceSupported } = useVoiceSearch(
    items,
    (name) => { setSearch(name); addToast(`🎤 "${name}"`, "info"); setShowSugg(false); },
    (err) => addToast(err, "error")
  );

  const inputCls = `w-full ${t.input} border ${t.border} rounded-xl ${t.text} px-3 py-2.5 text-base outline-none focus:border-purple-400/50 transition-all placeholder:opacity-30`;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className={`${t.surface} border ${t.border} rounded-2xl p-4 mb-4 shadow-sm`}>
        <div className="flex gap-2 relative">
          <div className="relative flex-1" ref={searchRef}>
            <input className={inputCls} placeholder="Search items…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSugg(true)}
              onKeyDown={(e) => e.key === "Escape" && setShowSugg(false)} />
            {showSugg && (
              <div ref={suggRef} className={`absolute top-full left-0 right-0 mt-1 rounded-xl border ${t.border} overflow-hidden z-50 shadow-2xl ${t.surface}`}>
                {suggestions.map((item) => (
                  <button key={item.id}
                    onMouseDown={(e) => { e.preventDefault(); setSearch(item.name); setShowSugg(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm ${t.suggestion} transition border-b ${t.border} last:border-b-0`}>
                    <span className={`font-medium ${t.text}`}>{item.name}</span>
                    <span className={`font-mono text-xs font-semibold ${t.textMuted}`}>{fmt(item.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {voiceSupported && (
            <button onClick={listening ? stopVoice : startVoice}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center transition
                ${listening ? "bg-red-500/10 border-red-500 text-red-400 animate-pulse" : `${t.btnSec} ${t.border} border ${t.textMuted}`}`}>
              <MicIcon listening={listening} />
            </button>
          )}
          <button onClick={() => setScannerOpen(v => !v)}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center text-base transition
              ${scannerOpen ? `${t.accentBg} ${t.accentText} border-transparent` : `${t.btnSec} ${t.border} border`}`}>
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
            onDetect={(code) => { setScannerOpen(false); setSearch(code); addToast("Scanned: " + code, "success"); }}
            onClose={() => setScannerOpen(false)} />
        )}
      </div>

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest transition-all border whitespace-nowrap
                ${activeCategory === cat ? `${t.accentBg} ${t.accentText} border-transparent` : `${t.surface} ${t.border} ${t.textMuted} hover:border-purple-400/30`}`}>
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3 px-1">
        <p className={`text-xs uppercase tracking-widest ${t.textMuted} font-semibold`}>{filtered.length} {filtered.length === 1 ? "item" : "items"}</p>
        {search && <button onClick={() => { setSearch(""); setShowSugg(false); }} className={`text-xs ${t.textMuted} hover:text-red-400 transition`}>Clear search ✕</button>}
      </div>

      {!filtered.length ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-4xl opacity-10">📋</span>
          <p className={`${t.textFaint} text-sm`}>{search ? `No items match "${search}"` : "No items in this category."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <div key={item.id} className={`${t.surface} border ${t.border} rounded-2xl p-4 flex flex-col gap-2 transition ${t.hover} group cursor-default`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mb-1 ${t.card} border ${t.border} ${t.textMuted} transition`}>
                {item.name.charAt(0).toUpperCase()}
              </div>
              <p className={`text-sm font-semibold ${t.text} leading-tight line-clamp-2`}>{item.name}</p>
              {item.category && <p className={`text-[10px] uppercase tracking-widest ${t.textMuted}`}>{item.category}</p>}
              <p className={`font-mono text-base font-black ${t.accent} mt-auto pt-1`}>{fmt(item.price)}</p>
              {item.barcode && <p className={`text-[10px] font-mono ${t.textFaint} truncate`}>{item.barcode}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RECEIPT MODAL ─────────────────────────────────────────────────────────────
function ReceiptModal({ receipt, onClose, t }) {
  const printRef = useRef(null);
  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open("", "_blank", "width=400,height=600");
    win.document.write(`<html><head><title>Receipt - Annura Store</title>
      <style>body{font-family:'Courier New',monospace;padding:20px;font-size:13px;color:#000}.center{text-align:center}.divider{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between;margin:3px 0}.bold{font-weight:bold}.large{font-size:16px;font-weight:bold}.small{font-size:11px;color:#555}</style>
      </head><body>${content}</body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`${t.surface} border ${t.border} rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh]`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${t.border}`}>
          <div className="flex items-center gap-2"><span className="text-lg">🧾</span><p className={`text-sm font-bold ${t.text} uppercase tracking-widest`}>Receipt</p></div>
          <button onClick={onClose} className="text-red-400 hover:text-red-500 text-lg transition">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          <div ref={printRef}>
            <div className="text-center mb-4">
              <p className={`text-lg font-black ${t.text} tracking-widest`}>🏪 ANNURA STORE</p>
              <p className={`text-xs ${t.textMuted} mt-1`}>POS System</p>
              <p className={`text-xs ${t.textMuted}`}>{receipt.date}</p>
              <p className={`text-xs ${t.textMuted} font-mono`}>Receipt #{receipt.id}</p>
            </div>
            <div className={`border-t border-dashed ${t.border} my-3`} />
            <div className="flex flex-col gap-2 mb-3">
              {receipt.items.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${t.text}`}>{item.name}</p>
                    <p className={`text-xs ${t.textMuted}`}>{fmt(item.price)} × {item.qty}</p>
                  </div>
                  <p className={`text-sm font-mono font-bold ${t.text} shrink-0`}>{fmt(item.price * item.qty)}</p>
                </div>
              ))}
            </div>
            <div className={`border-t border-dashed ${t.border} my-3`} />
            <div className="flex flex-col gap-1.5">
              <div className={`flex justify-between text-sm ${t.textMuted}`}><span>Subtotal ({receipt.count} item{receipt.count !== 1 ? "s" : ""})</span><span className="font-mono">{fmt(receipt.total)}</span></div>
              <div className={`flex justify-between text-sm ${t.textMuted}`}><span>Cash</span><span className="font-mono">{fmt(receipt.cash)}</span></div>
              <div className={`border-t ${t.border} pt-2 mt-1 flex justify-between items-center`}>
                <span className={`text-base font-bold ${t.text}`}>Change</span>
                <span className="text-base font-black font-mono text-emerald-400">{fmt(receipt.change)}</span>
              </div>
            </div>
            <div className={`border-t border-dashed ${t.border} my-4`} />
            <p className={`text-center text-xs ${t.textMuted}`}>Thank you for shopping!</p>
            <p className={`text-center text-xs ${t.textFaint} mt-1`}>— Annura Store —</p>
          </div>
        </div>
        <div className={`flex gap-2 p-4 border-t ${t.border}`}>
          <button onClick={handlePrint} className={`flex-1 ${t.btnSec} border ${t.border} py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2`}>🖨️ Print</button>
          <button onClick={onClose} className={`flex-1 ${t.accentBg} ${t.accentText} py-2.5 rounded-xl text-sm font-bold transition`}>Done ✓</button>
        </div>
      </div>
    </div>
  );
}

// ── POS TAB ───────────────────────────────────────────────────────────────────
function PosTab({ items, addToast, addTransaction, t }) {
  const [receipt, setReceipt] = useState(null);
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
    setSuggestions(matches); setShowSugg(matches.length > 0);
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
    const now = new Date();
    const receiptId = uid().slice(-6).toUpperCase();
    const receiptDate = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const receiptData = { id: receiptId, date: receiptDate, items: [...cart], total, count, cash: cashNum, change };
    setReceipt(receiptData);
    addTransaction(receiptData);
    setCart([]);
    setCashVal("");
  };

  const inputCls = `w-full ${t.input} border ${t.border} rounded-xl ${t.text} px-3 py-2.5 text-base outline-none focus:border-purple-400/50 transition-all placeholder:opacity-30`;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className={`${t.surface} border ${t.border} rounded-2xl p-4 shadow-sm`}>
            <div className="flex gap-2 relative">
              <div className="relative flex-1" ref={searchRef}>
                <input className={inputCls} placeholder="Search item or scan barcode…" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { posSearch(); setShowSugg(false); } if (e.key === "Escape") setShowSugg(false); }}
                  onFocus={() => suggestions.length > 0 && setShowSugg(true)} />
                {showSugg && (
                  <div ref={suggRef} className={`absolute top-full left-0 right-0 mt-1 rounded-xl border ${t.border} overflow-hidden z-50 shadow-2xl ${t.surface}`}>
                    {suggestions.map((item) => (
                      <button key={item.id} onMouseDown={(e) => { e.preventDefault(); addItemToCart(item); }}
                        className={`w-full flex items-center justify-between px-4 py-3 text-sm ${t.suggestion} transition border-b ${t.border} last:border-b-0`}>
                        <span className={`font-medium ${t.text}`}>{item.name}</span>
                        <span className={`font-mono text-xs font-semibold ${t.textMuted}`}>{fmt(item.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {voiceSupported && (
                <button onClick={listening ? stopVoice : startVoice}
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center transition
                    ${listening ? "bg-red-500/10 border-red-500 text-red-400 animate-pulse" : `${t.btnSec} ${t.border} border ${t.textMuted}`}`}>
                  <MicIcon listening={listening} />
                </button>
              )}
              <button onClick={() => setScannerOpen((v) => !v)}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center text-base transition
                  ${scannerOpen ? `${t.accentBg} ${t.accentText} border-transparent` : `${t.btnSec} ${t.border} border`}`}>
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
              <BarcodeScanner onDetect={(code) => { setScannerOpen(false); posSearch(code); }} onClose={() => setScannerOpen(false)} />
            )}
            {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} t={t} />}
          </div>

          <div className={`${t.surface} border ${t.border} rounded-2xl p-4 flex-1 shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className={`text-xs ${t.textMuted} uppercase tracking-widest`}>Cart</p>
                {count > 0 && <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${t.badge}`}>{count}</span>}
              </div>
              {cart.length > 0 && <button onClick={() => { if (window.confirm("Clear cart?")) setCart([]); }} className="text-xs text-red-400 hover:text-red-500 transition">Clear all</button>}
            </div>
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto scrollbar-thin">
              {!cart.length ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <span className="text-3xl opacity-10">🛒</span>
                  <p className={`${t.textFaint} text-sm`}>No items yet</p>
                </div>
              ) : cart.map((c) => (
                <div key={c.id} className={`${t.card} border ${t.border} rounded-xl flex items-center gap-3 px-3 py-2.5`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.text} truncate`}>{c.name}</p>
                    <p className={`text-xs ${t.textMuted} mt-0.5`}>{fmt(c.price)} × {c.qty} = <span className={`font-mono font-semibold ${t.accent}`}>{fmt(c.price * c.qty)}</span></p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => changeQty(c.id, -1)} className={`${t.btnSec} w-7 h-7 rounded-lg flex items-center justify-center text-sm transition`}>−</button>
                    <span className={`font-mono text-sm w-5 text-center ${t.text}`}>{c.qty}</span>
                    <button onClick={() => changeQty(c.id, 1)} className={`${t.btnSec} w-7 h-7 rounded-lg flex items-center justify-center text-sm transition`}>+</button>
                    <button onClick={() => setCart((p) => p.filter((x) => x.id !== c.id))} className="ml-1 text-red-400 hover:text-red-500 w-6 h-6 flex items-center justify-center text-sm transition">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className={`${t.surface} border ${t.border} rounded-2xl p-5 flex flex-col gap-4 shadow-sm`}>
            <div className={`flex justify-between text-sm ${t.textMuted}`}><span>Items</span><span className="font-mono font-semibold">{count}</span></div>
            <div className={`border-t ${t.border} pt-3 flex justify-between items-center`}>
              <span className={`text-base font-semibold ${t.textMuted}`}>Total</span>
              <span className={`text-2xl font-black font-mono ${t.accent}`}>{fmt(total)}</span>
            </div>
            <div>
              <p className={`text-xs ${t.textMuted} mb-1.5 font-medium`}>Cash Received</p>
              <input type="number" min="0" step="1" className={`${inputCls} font-mono text-lg`}
                placeholder="₱0.00" value={cash} onChange={(e) => setCashVal(e.target.value)} />
              <div className={`flex justify-between text-sm mt-2 ${t.textMuted}`}>
                <span>Change</span>
                <span className={`font-mono font-bold ${cashNum === 0 ? t.textFaint : change < 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {cashNum === 0 ? "₱0.00" : change < 0 ? `-${fmt(Math.abs(change))} short` : fmt(change)}
                </span>
              </div>
            </div>
            <button onClick={checkout} className={`${t.accentBg} ${t.accentText} font-bold rounded-xl py-3 text-base transition-all active:scale-95 shadow-sm`}>
              Checkout ✓
            </button>
          </div>
          <div className={`${t.surface} border ${t.border} rounded-2xl p-4 shadow-sm`}>
            <p className={`text-xs ${t.textMuted} uppercase tracking-widest mb-3 font-medium`}>Quick Cash</p>
            <div className="grid grid-cols-3 gap-2">
              {[20, 50, 100, 200, 500, 1000].map((a) => (
                <button key={a} onClick={() => setCashVal(String(Math.ceil(total / a) * a || a))}
                  className={`${t.btnSec} text-sm py-2 rounded-xl transition-all active:scale-95 font-medium border ${t.border}`}>
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
function InventoryTab({ items, setItems, transactions, addToast, t }) {
  const [form, setForm] = useState({ name: "", price: "", barcode: "", category: "" });
  const [editingId, setEditingId] = useState(null);
  const [invSearch, setInvSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const allCategories = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...items.map(i => i.category).filter(Boolean),
  ])).sort();

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
        const dupName = items.find(
          (i) => i.id !== editingId && i.name.toLowerCase() === name.trim().toLowerCase()
        );
        if (dupName) { setError("Another item with that name already exists."); setSaving(false); return; }

        const trimmedBarcode = barcode.trim();
        if (trimmedBarcode) {
          const dupBarcode = items.find(
            (i) => i.id !== editingId && i.barcode && i.barcode === trimmedBarcode
          );
          if (dupBarcode) { setError(`Barcode already used by "${dupBarcode.name}".`); setSaving(false); return; }
        }

        const payload = {
          name: name.trim(),
          price: parseFloat(price),
          barcode: trimmedBarcode || null,
          category: category.trim() || null,
        };
        const { error: sbErr } = await supabase.from("items").update(payload).eq("id", editingId);
        if (sbErr) throw sbErr;
        setItems((prev) => prev.map((i) => i.id === editingId ? { ...i, ...payload } : i));
        addToast("Item updated!", "success"); cancelEdit();
      } else {
        if (items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase())) {
          setError("An item with that name already exists."); setSaving(false); return;
        }

        const trimmedBarcode = barcode.trim();
        if (trimmedBarcode) {
          const dupBarcode = items.find((i) => i.barcode && i.barcode === trimmedBarcode);
          if (dupBarcode) {
            setError(`Barcode already used by "${dupBarcode.name}".`); setSaving(false); return;
          }
        }

        const newItem = {
          id: uid(),
          name: name.trim(),
          price: parseFloat(price),
          barcode: trimmedBarcode || null,
          category: category.trim() || null,
        };
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

  const inputCls = `w-full ${t.input} border ${t.border} rounded-xl ${t.text} px-3 py-2.5 text-base outline-none focus:border-purple-400/50 transition-all placeholder:opacity-30`;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* ── TRANSACTION HISTORY ── */}
      <div className={`${t.surface} border ${t.border} rounded-2xl mb-4 overflow-hidden shadow-sm`}>
        <button onClick={() => setHistoryOpen(v => !v)}
          className={`w-full flex items-center justify-between px-5 py-4 ${t.hover} transition`}>
          <div className="flex items-center gap-2">
            <span>🧾</span>
            <p className={`text-xs ${t.textMuted} uppercase tracking-widest font-semibold`}>Transaction History</p>
            {transactions.length > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${t.badge}`}>{transactions.length}</span>
            )}
          </div>
          <span className={`${t.textMuted} text-xs transition-transform ${historyOpen ? "rotate-180" : ""}`}>▼</span>
        </button>
        {historyOpen && (
          <div className={`border-t ${t.border}`}>
            {!transactions.length ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="text-3xl opacity-10">🧾</span>
                <p className={`${t.textFaint} text-sm`}>No transactions yet.</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y max-h-80 overflow-y-auto scrollbar-thin">
                {[...transactions].reverse().map((tx) => (
                  <div key={tx.id} className={`px-5 py-4 ${t.hover} transition`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-mono ${t.textMuted}`}>#{tx.id}</span>
                      <span className={`font-mono text-sm font-black ${t.accent}`}>{fmt(tx.total)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {tx.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className={`text-sm ${t.text}`}>{item.name} <span className={`text-xs ${t.textMuted}`}>× {item.qty}</span></span>
                          <span className={`text-xs font-mono ${t.textMuted}`}>{fmt(item.price * item.qty)}</span>
                        </div>
                      ))}
                    </div>
                    <p className={`text-[11px] ${t.textFaint} mt-2`}>{tx.date}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ADD/EDIT FORM ── */}
      <div className={`${t.surface} border ${t.border} rounded-2xl p-5 mb-4 shadow-sm`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">{editingId ? "✏️" : "➕"}</span>
          <p className={`text-xs ${t.textMuted} uppercase tracking-widest font-semibold`}>{editingId ? "Edit Item" : "Add New Item"}</p>
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
                className={`px-3 rounded-xl border transition text-base ${scannerOpen ? `${t.accentBg} ${t.accentText} border-transparent` : `${t.btnSec} ${t.border} border`}`}>
                📷
              </button>
            </div>
          </div>
          <div>
            <label className={`text-xs ${t.textMuted} mb-1.5 block font-medium`}>Category <span className={t.textFaint}>(optional)</span></label>
            <CategoryComboBox
              value={form.category}
              onChange={(val) => setForm(f => ({ ...f, category: val }))}
              allCategories={allCategories}
              t={t}
            />
          </div>
        </div>
        {scannerOpen && (
          <BarcodeScanner
            onDetect={(code) => { setScannerOpen(false); setForm((f) => ({ ...f, barcode: code })); addToast("Scanned: " + code, "success"); }}
            onClose={() => setScannerOpen(false)} />
        )}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <span>⚠️</span> {error}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <button onClick={saveItem} disabled={saving}
            className={`disabled:opacity-50 ${t.accentBg} ${t.accentText} font-semibold px-6 py-2.5 rounded-xl transition-all active:scale-95 text-sm`}>
            {saving ? "Saving…" : editingId ? "Update Item" : "Save Item"}
          </button>
          {editingId && (
            <button onClick={cancelEdit} className={`${t.btnSec} border ${t.border} px-4 py-2.5 rounded-xl transition text-sm`}>Cancel</button>
          )}
        </div>
      </div>

      {/* ── SEARCH ── */}
      <div className={`${t.surface} border ${t.border} rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-3 shadow-sm`}>
        <span className={`${t.textFaint} text-sm`}>🔍</span>
        <input className={`flex-1 bg-transparent ${t.text} text-base outline-none placeholder:opacity-30`}
          placeholder="Search by name, barcode, or category…"
          value={invSearch} onChange={(e) => setInvSearch(e.target.value)} />
        {invSearch && <button onClick={() => setInvSearch("")} className={`${t.textMuted} text-sm hover:text-red-400 transition`}>✕</button>}
        <span className={`text-xs ${t.textMuted} font-mono ${t.badge} px-2 py-0.5 rounded-full`}>{filtered.length}/{items.length}</span>
      </div>

      {/* ── TABLE ── */}
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
              <span className="text-3xl opacity-10">📦</span>
              <p className={`${t.textFaint} text-sm`}>{invSearch ? `No results for "${invSearch}"` : "No items yet."}</p>
            </div>
          ) : filtered.map((item) => (
            <div key={item.id} className={`grid grid-cols-12 items-center px-4 py-3 ${t.rowHov} transition text-sm`}>
              <div className={`col-span-4 font-semibold ${t.text} truncate`}>{item.name}</div>
              <div className={`col-span-2 font-mono ${t.textMuted} text-xs font-bold`}>{fmt(item.price)}</div>
              <div className={`col-span-3 font-mono ${t.textMuted} text-xs truncate`}>{item.barcode || "—"}</div>
              <div className={`col-span-2 ${t.textMuted} text-xs truncate`}>{item.category || "—"}</div>
              <div className="col-span-1 flex gap-1 justify-end">
                <button onClick={() => editItem(item.id)} className={`${t.textMuted} hover:text-white text-sm px-1 transition`}>✏️</button>
                <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-500 text-sm px-1 transition">🗑️</button>
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
    const saved = localStorage.getItem("annura_theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const t = dark ? T.dark : T.light;

  const addToast = useCallback((msg, type = "info") => {
    const id = uid();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2800);
  }, []);

  const addTransaction = useCallback((receipt) => {
    setTransactions((prev) => {
      const updated = [...prev, receipt];
      try { localStorage.setItem("annura_transactions", JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("annura_transactions");
      if (saved) setTransactions(JSON.parse(saved));
    } catch {}
    supabase.from("items").select("*").order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) addToast("Could not load items.", "error");
        else setItems(data || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => { localStorage.setItem("annura_theme", dark ? "dark" : "light"); }, [dark]);

  if (page === "home") return (
    <>
      <HomePage onEnter={() => setPage("app")} dark={dark} setDark={setDark} />
      <style>{`@keyframes scanline{0%,100%{top:0}50%{top:calc(100% - 2px)}}`}</style>
    </>
  );

  const tabs = [
    { id: "pos", icon: "🛒", label: "Cashier" },
    { id: "menu", icon: "📋", label: "Menu" },
    { id: "inventory", icon: "📦", label: "Inventory" },
  ];

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300 pb-20`}>
      <style>{`
        @keyframes scanline{0%,100%{top:0}50%{top:calc(100% - 2px)}}
        .scrollbar-thin::-webkit-scrollbar{width:4px}
        .scrollbar-thin::-webkit-scrollbar-track{background:transparent}
        .scrollbar-thin::-webkit-scrollbar-thumb{background:rgba(160,100,255,0.25);border-radius:9999px}
        .scrollbar-none::-webkit-scrollbar{display:none}
        .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      `}</style>

      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3 border-b ${t.border} ${t.headerBg} backdrop-blur-md sticky top-0 z-40`}>
        <button onClick={() => setPage("home")} className="flex items-center gap-2.5">
          <span className="text-xl">🏪</span>
          <div>
            <p className={`text-sm font-extrabold ${t.accent} leading-none tracking-widest`}>ANNURA STORE</p>
            <p className={`text-[10px] ${t.textFaint} leading-none mt-0.5 font-mono uppercase tracking-widest`}>POS System</p>
          </div>
        </button>
        <button onClick={() => setDark((d) => !d)}
          className={`w-8 h-8 rounded-xl border ${t.border} ${t.card} flex items-center justify-center text-sm transition-all ${t.hover}`}>
          {dark ? "☀" : "☽"}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-28 gap-4">
          <div className="w-8 h-8 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
          <p className={`text-sm ${t.textMuted} font-mono tracking-widest`}>Loading…</p>
        </div>
      ) : (
        <>
          {tab === "pos" && <PosTab items={items} addToast={addToast} addTransaction={addTransaction} t={t} />}
          {tab === "menu" && <MenuTab items={items} addToast={addToast} t={t} />}
          {tab === "inventory" && <InventoryTab items={items} setItems={setItems} transactions={transactions} addToast={addToast} t={t} />}
        </>
      )}

      {/* Bottom tab bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 flex border-t ${t.border} ${t.headerBg} backdrop-blur-md`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map(({ id, icon, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-all
              ${tab === id ? t.accent : t.textMuted}`}>
            <span className="text-xl leading-none">{icon}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${tab === id ? "" : "opacity-60"}`}>{label}</span>
          </button>
        ))}
      </div>

      <Toast toasts={toasts} />
    </div>
  );
}