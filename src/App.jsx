import { useState, useEffect, useRef, useCallback } from "react";

// ─── Helpers ───
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) =>
  "₱" + parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Theme tokens ───
const T = {
  dark: {
    bg:        "bg-[#1a1a1a]",
    surface:   "bg-[#242424]",
    card:      "bg-[#2a2a2a]",
    input:     "bg-[#1e1e1e]",
    border:    "border-[#3a3a3a]",
    divide:    "divide-[#3a3a3a]",
    text:      "text-[#ececec]",
    textMuted: "text-[#888]",
    textFaint: "text-[#555]",
    hover:     "hover:bg-[#333]",
    accent:    "text-[#c96442]",        // warm terracotta — Claude-ish
    accentBg:  "bg-[#c96442]",
    accentHov: "hover:bg-[#b85a3b]",
    btnSec:    "bg-[#333] hover:bg-[#3d3d3d] text-[#ececec]",
    tblHead:   "bg-[#1e1e1e]",
    rowHov:    "hover:bg-[#2f2f2f]",
  },
  light: {
    bg:        "bg-[#f5f0eb]",
    surface:   "bg-[#faf7f4]",
    card:      "bg-white",
    input:     "bg-[#f0ece7]",
    border:    "border-[#e0d9d2]",
    divide:    "divide-[#e0d9d2]",
    text:      "text-[#1f1a16]",
    textMuted: "text-[#7a6f66]",
    textFaint: "text-[#b0a89f]",
    hover:     "hover:bg-[#ede8e2]",
    accent:    "text-[#c96442]",
    accentBg:  "bg-[#c96442]",
    accentHov: "hover:bg-[#b85a3b]",
    btnSec:    "bg-[#ede8e2] hover:bg-[#e0d9d2] text-[#1f1a16]",
    tblHead:   "bg-[#f0ece7]",
    rowHov:    "hover:bg-[#f7f3ef]",
  },
};

// ─── Toast ───
function Toast({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id}
          className={`px-4 py-3 rounded-2xl text-sm font-medium shadow-xl pointer-events-auto
            ${t.type === "success" ? "bg-emerald-600 text-white" : ""}
            ${t.type === "error"   ? "bg-red-500 text-white"     : ""}
            ${t.type === "info"    ? "bg-[#c96442] text-white"   : ""}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Barcode Scanner (getUserMedia + ZXing canvas polling — most reliable) ───
function BarcodeScanner({ onDetect, onClose, t }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);
  const readerRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | active | error

  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        await video.play();
        if (!mounted) return;
        setStatus("active");

        const ZXing = window.ZXing;
        if (!ZXing) { setStatus("error"); return; }
        const reader = new ZXing.BrowserMultiFormatReader();
        readerRef.current = reader;

        const canvas  = canvasRef.current;
        const ctx     = canvas.getContext("2d");

        function tick() {
          if (!mounted || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width  = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            try {
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const lum = new ZXing.RGBLuminanceSource(imgData.data, canvas.width, canvas.height);
              const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
              const result = reader.decode(bmp);
              if (result && mounted) {
                cleanup();
                onDetect(result.getText());
                return;
              }
            } catch (_) {}
          }
          rafRef.current = requestAnimationFrame(tick);
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        if (mounted) setStatus("error");
      }
    }

    function cleanup() {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((tr) => tr.stop());
      if (readerRef.current) { try { readerRef.current.reset(); } catch (_) {} }
    }

    start();
    return cleanup;
  }, []); // eslint-disable-line

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-[#c96442]/40">
      <div className="relative bg-black" style={{ minHeight: 180 }}>
        <video ref={videoRef} className="w-full block" muted playsInline style={{ maxHeight: 260 }} />
        <canvas ref={canvasRef} className="hidden" />

        {/* scan frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-52 h-28"
            style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", borderRadius: 8 }}>
            {/* corner brackets */}
            {[["top-0 left-0","border-t-2 border-l-2"],["top-0 right-0","border-t-2 border-r-2"],
              ["bottom-0 left-0","border-b-2 border-l-2"],["bottom-0 right-0","border-b-2 border-r-2"]
            ].map(([pos, brd], i) => (
              <span key={i} className={`absolute w-5 h-5 ${pos} ${brd} border-[#c96442] rounded-sm`} />
            ))}
            {status === "active" && (
              <div className="absolute inset-x-0 top-0 h-0.5 bg-[#c96442]"
                style={{ animation: "scanline 1.8s ease-in-out infinite" }} />
            )}
          </div>
        </div>

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <span className="text-white text-sm animate-pulse">Starting camera…</span>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2 p-4">
            <span className="text-red-400 text-sm text-center">Camera unavailable. Allow camera access and try again.</span>
          </div>
        )}
      </div>
      <button onClick={onClose}
        className="w-full py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition">
        ✕ Close Camera
      </button>
    </div>
  );
}

// ─── Home / Welcome Page ───
function HomePage({ onEnter, t, dark }) {
  const features = [
    { icon: "🛒", title: "Point of Sale", desc: "Fast checkout with barcode scanning and cash change calculator." },
    { icon: "📦", title: "Inventory", desc: "Add, edit, and search products with categories and barcodes." },
    { icon: "📷", title: "Barcode Scanner", desc: "Scan barcodes with your camera to find or add items instantly." },
  ];

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 py-16 ${t.bg} transition-colors duration-300`}>
      {/* subtle grid bg */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(#888 1px,transparent 1px),linear-gradient(90deg,#888 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative z-10 flex flex-col items-center max-w-lg w-full text-center gap-8">

        {/* Logo mark */}
        <div className="flex flex-col items-center gap-3">
          <div className={`w-20 h-20 rounded-3xl ${t.card} ${t.border} border flex items-center justify-center shadow-xl`}>
            <span className="text-4xl">🏪</span>
          </div>
          <div>
            <h1 className={`text-4xl font-bold tracking-tight ${t.text}`}>
              Inah <span className="text-[#c96442]">Store</span>
            </h1>
            <p className={`text-sm mt-1 ${t.textMuted}`}>Point of Sale System</p>
          </div>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
          {features.map((f) => (
            <div key={f.title}
              className={`${t.card} ${t.border} border rounded-2xl p-4 text-left transition hover:shadow-md`}>
              <span className="text-2xl mb-2 block">{f.icon}</span>
              <p className={`text-sm font-semibold ${t.text} mb-1`}>{f.title}</p>
              <p className={`text-xs leading-relaxed ${t.textMuted}`}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onEnter}
          className="bg-[#c96442] hover:bg-[#b85a3b] active:scale-95 text-white font-semibold px-10 py-3.5 rounded-2xl text-base transition-all shadow-lg shadow-[#c96442]/30">
          Open POS System →
        </button>

        <p className={`text-xs ${t.textFaint}`}>Tap to start your session</p>
      </div>

      {/* scanline keyframe injected once */}
      <style>{`@keyframes scanline{0%,100%{top:0}50%{top:calc(100% - 2px)}}`}</style>
    </div>
  );
}

// ─── POS Tab ───
function PosTab({ items, addToast, t }) {
  const [cart, setCart]         = useState([]);
  const [search, setSearch]     = useState("");
  const [cash, setCashVal]      = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const total   = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const count   = cart.reduce((s, c) => s + c.qty, 0);
  const cashNum = parseFloat(cash) || 0;
  const change  = cashNum - total;

  const posSearch = useCallback((q) => {
    const query = (q ?? search).trim().toLowerCase();
    if (!query) return;
    const item =
      items.find((i) => i.barcode && i.barcode.toLowerCase() === query) ||
      items.find((i) => i.name.toLowerCase().includes(query));
    if (!item) { addToast(`"${query}" not found`, "error"); return; }
    setCart((prev) => {
      const ex = prev.find((c) => c.id === item.id);
      return ex
        ? prev.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { ...item, qty: 1 }];
    });
    addToast(`+1 ${item.name}`, "success");
    setSearch("");
  }, [search, items, addToast]);

  const changeQty = (id, delta) =>
    setCart((prev) =>
      prev.map((c) => c.id === id ? { ...c, qty: c.qty + delta } : c).filter((c) => c.qty > 0)
    );

  const setCash = (amount) => setCashVal(String(Math.ceil(total / amount) * amount));

  const checkout = () => {
    if (!cart.length) { addToast("Cart is empty!", "error"); return; }
    if (cashNum < total) { addToast("Cash is less than total!", "error"); return; }
    addToast(`✓ Sale complete! Change: ${fmt(change)}`, "success");
    setCart([]); setCashVal("");
  };

  const inputCls = `w-full ${t.input} border ${t.border} rounded-xl ${t.text} px-3 py-2.5 text-sm outline-none focus:border-[#c96442] placeholder:${t.textFaint} transition`;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Left */}
        <div className="lg:col-span-3 flex flex-col gap-4">

          {/* Search */}
          <div className={`${t.surface} border ${t.border} rounded-2xl p-4`}>
            <p className={`text-xs ${t.textMuted} uppercase tracking-widest mb-3`}>Scan / Search Item</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.textFaint} select-none text-sm`}>🔍</span>
                <input
                  className={`${inputCls} pl-9`}
                  placeholder="Type name or scan barcode…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && posSearch()}
                  autoFocus
                />
              </div>
              <button onClick={() => setScannerOpen((v) => !v)}
                className={`px-3 rounded-xl border transition text-base
                  ${scannerOpen ? "bg-[#c96442] text-white border-[#c96442]" : `${t.btnSec} ${t.border} border`}`}>
                📷
              </button>
              <button onClick={() => posSearch()}
                className="bg-[#c96442] hover:bg-[#b85a3b] text-white font-semibold px-4 rounded-xl transition">
                Add
              </button>
            </div>
            {scannerOpen && (
              <BarcodeScanner t={t}
                onDetect={(code) => { setScannerOpen(false); posSearch(code); }}
                onClose={() => setScannerOpen(false)} />
            )}
          </div>

          {/* Cart */}
          <div className={`${t.surface} border ${t.border} rounded-2xl p-4 flex-1`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs ${t.textMuted} uppercase tracking-widest`}>Cart</p>
              {cart.length > 0 && (
                <button onClick={() => { if (window.confirm("Clear all items?")) setCart([]); }}
                  className="text-xs text-red-400 hover:text-red-500 transition">Clear all</button>
              )}
            </div>
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
              {!cart.length ? (
                <p className={`text-center ${t.textFaint} text-sm py-8`}>No items yet. Scan or search to add.</p>
              ) : cart.map((c) => (
                <div key={c.id} className={`${t.card} border ${t.border} rounded-xl flex items-center gap-3 p-3`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.text} truncate`}>{c.name}</p>
                    <p className={`text-xs ${t.textMuted}`}>{fmt(c.price)} each · {fmt(c.price * c.qty)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {[-1, 1].map((d) => (
                      <button key={d} onClick={() => changeQty(c.id, d)}
                        className={`${t.btnSec} w-7 h-7 rounded-lg flex items-center justify-center text-base transition hover:bg-[#c96442] hover:text-white`}>
                        {d < 0 ? "−" : "+"}
                      </button>
                    ))}
                    <span className={`font-mono text-sm w-6 text-center ${t.text}`}>{c.qty}</span>
                    <button onClick={() => setCart((p) => p.filter((x) => x.id !== c.id))}
                      className="bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded-lg text-xs ml-1 transition">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className={`${t.surface} border ${t.border} rounded-2xl p-5 flex flex-col gap-4`}>
            <p className={`text-xs ${t.textMuted} uppercase tracking-widest`}>Order Summary</p>
            {[["Items", count], ["Subtotal", fmt(total)]].map(([label, val]) => (
              <div key={label} className={`flex justify-between text-sm ${t.textMuted}`}>
                <span>{label}</span><span className="font-mono">{val}</span>
              </div>
            ))}
            <div className={`border-t ${t.border} pt-3 flex justify-between text-lg font-bold text-[#c96442]`}>
              <span>TOTAL</span><span className="font-mono">{fmt(total)}</span>
            </div>

            <div className={`${t.card} rounded-xl p-4 border ${t.border}`}>
              <p className={`text-xs ${t.textMuted} mb-2 uppercase tracking-widest`}>Cash Tendered</p>
              <input type="number" min="0" step="1"
                className={`${inputCls} font-mono text-lg mb-3`}
                placeholder="₱0.00" value={cash}
                onChange={(e) => setCashVal(e.target.value)} />
              <div className={`flex justify-between text-sm ${t.textMuted} mb-1`}>
                <span>Change</span>
                <span className={`font-mono font-semibold ${cashNum === 0 ? t.textFaint : change < 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {cashNum === 0 ? "₱0.00" : change < 0 ? `${fmt(Math.abs(change))} short` : fmt(change)}
                </span>
              </div>
              {cashNum > 0 && change < 0 && <p className="text-xs text-red-500">Insufficient cash</p>}
            </div>

            <button onClick={checkout}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl py-3 text-base transition">
              ✓ Checkout
            </button>
          </div>

          <div className={`${t.surface} border ${t.border} rounded-2xl p-4`}>
            <p className={`text-xs ${t.textMuted} uppercase tracking-widest mb-3`}>Quick Cash</p>
            <div className="grid grid-cols-3 gap-2">
              {[20, 50, 100, 200, 500, 1000].map((a) => (
                <button key={a} onClick={() => setCash(a)}
                  className={`${t.btnSec} text-sm py-2 rounded-xl transition`}>₱{a}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inventory Tab ───
function InventoryTab({ items, setItems, addToast, t }) {
  const [form, setForm]         = useState({ name: "", price: "", barcode: "", category: "" });
  const [editingId, setEditingId] = useState(null);
  const [invSearch, setInvSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError]       = useState("");

  const filtered = invSearch.trim()
    ? items.filter((i) =>
        i.name.toLowerCase().includes(invSearch.toLowerCase()) ||
        (i.barcode || "").toLowerCase().includes(invSearch.toLowerCase()) ||
        (i.category || "").toLowerCase().includes(invSearch.toLowerCase()))
    : [...items];

  const saveItem = () => {
    const { name, price, barcode, category } = form;
    if (!name.trim()) { setError("Item name is required."); return; }
    if (isNaN(parseFloat(price)) || parseFloat(price) < 0) { setError("Enter a valid price."); return; }
    setError("");
    if (editingId) {
      setItems((prev) => prev.map((i) => i.id === editingId
        ? { ...i, name: name.trim(), price: parseFloat(price), barcode: barcode.trim(), category: category.trim() }
        : i));
      addToast("Item updated!", "success");
      cancelEdit();
    } else {
      if (items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase())) {
        setError("Item name already exists."); return;
      }
      setItems((prev) => [...prev, { id: uid(), name: name.trim(), price: parseFloat(price), barcode: barcode.trim(), category: category.trim() }]);
      addToast("Item added!", "success");
      setForm({ name: "", price: "", barcode: "", category: "" });
    }
  };

  const editItem = (id) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setEditingId(id);
    setForm({ name: item.name, price: String(item.price), barcode: item.barcode || "", category: item.category || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteItem = (id) => {
    if (!window.confirm("Delete this item?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    addToast("Item deleted.", "info");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "", price: "", barcode: "", category: "" });
    setError("");
  };

  const inputCls = `w-full ${t.input} border ${t.border} rounded-xl ${t.text} px-3 py-2.5 text-sm outline-none focus:border-[#c96442] transition placeholder:opacity-50`;

  return (
    <div className="p-4 max-w-4xl mx-auto">

      {/* Form */}
      <div className={`${t.surface} border ${t.border} rounded-2xl p-5 mb-4`}>
        <p className={`text-xs ${t.textMuted} uppercase tracking-widest mb-4`}>
          {editingId ? "✏️ Edit Item" : "➕ Add New Item"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {[
            { label: "Item Name",   key: "name",     ph: "e.g. Coke 1L",   type: "text"   },
            { label: "Price (₱)",   key: "price",    ph: "0.00",           type: "number" },
          ].map(({ label, key, ph, type }) => (
            <div key={key}>
              <label className={`text-xs ${t.textMuted} mb-1 block`}>{label}</label>
              <input type={type} min={type==="number"?"0":undefined} step={type==="number"?"0.01":undefined}
                className={inputCls} placeholder={ph}
                value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className={`text-xs ${t.textMuted} mb-1 block`}>Barcode (optional)</label>
            <div className="flex gap-2">
              <input className={`${inputCls} flex-1`} placeholder="Scan or type barcode"
                value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} />
              <button onClick={() => setScannerOpen((v) => !v)}
                className={`px-3 rounded-xl border transition text-base
                  ${scannerOpen ? "bg-[#c96442] text-white border-[#c96442]" : `${t.btnSec} ${t.border} border`}`}>
                📷
              </button>
            </div>
          </div>
          <div>
            <label className={`text-xs ${t.textMuted} mb-1 block`}>Category (optional)</label>
            <input className={inputCls} placeholder="e.g. Beverages"
              value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </div>
        </div>

        {scannerOpen && (
          <BarcodeScanner t={t}
            onDetect={(code) => { setScannerOpen(false); setForm((f) => ({ ...f, barcode: code })); addToast("Scanned: " + code, "success"); }}
            onClose={() => setScannerOpen(false)} />
        )}

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2 mt-2">
          <button onClick={saveItem}
            className="bg-[#c96442] hover:bg-[#b85a3b] text-white font-semibold px-6 py-2.5 rounded-xl transition">
            💾 Save Item
          </button>
          <button onClick={cancelEdit}
            className={`${t.btnSec} px-4 py-2.5 rounded-xl transition`}>Cancel</button>
        </div>
      </div>

      {/* Search */}
      <div className={`${t.surface} border ${t.border} rounded-2xl px-4 py-3 mb-4 flex items-center gap-3`}>
        <span className={`${t.textFaint} text-base select-none`}>🔍</span>
        <input
          className={`flex-1 bg-transparent ${t.text} text-sm outline-none placeholder:${t.textFaint}`}
          placeholder="Search by name, barcode, or category…"
          value={invSearch}
          onChange={(e) => setInvSearch(e.target.value)} />
        {invSearch && (
          <button onClick={() => setInvSearch("")}
            className={`${t.textMuted} hover:${t.text} text-sm transition`}>✕</button>
        )}
        <span className={`text-xs ${t.textMuted} font-mono whitespace-nowrap`}>
          {filtered.length}/{items.length}
        </span>
      </div>

      {/* Table */}
      <div className={`${t.surface} border ${t.border} rounded-2xl overflow-hidden`}>
        <div className={`grid grid-cols-12 text-xs ${t.textMuted} uppercase tracking-widest px-4 py-3 border-b ${t.border} ${t.tblHead}`}>
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Price</div>
          <div className="col-span-3">Barcode</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-1" />
        </div>
        <div className={`max-h-96 overflow-y-auto ${t.divide} divide-y`}>
          {!filtered.length ? (
            <p className={`text-center ${t.textFaint} text-sm py-10`}>
              {invSearch ? `No items match "${invSearch}"` : "No items yet. Add your first item above."}
            </p>
          ) : filtered.map((item) => (
            <div key={item.id} className={`grid grid-cols-12 items-center px-4 py-3 ${t.rowHov} transition text-sm`}>
              <div className={`col-span-4 font-medium ${t.text} truncate`}>{item.name}</div>
              <div className="col-span-2 font-mono text-[#c96442]">{fmt(item.price)}</div>
              <div className={`col-span-3 font-mono ${t.textMuted} text-xs truncate`}>{item.barcode || "—"}</div>
              <div className={`col-span-2 ${t.textMuted} text-xs truncate`}>{item.category || "—"}</div>
              <div className="col-span-1 flex gap-1 justify-end">
                <button onClick={() => editItem(item.id)}
                  className="text-[#c96442] hover:opacity-70 text-base px-1 transition">✏️</button>
                <button onClick={() => deleteItem(item.id)}
                  className="text-red-400 hover:text-red-500 text-base px-1 transition">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── App Root ───
const DB_KEY = "inah_pos_items";

export default function App() {
  const [page, setPage]   = useState("home");  // home | app
  const [tab, setTab]     = useState("pos");
  const [dark, setDark]   = useState(() => {
    const saved = localStorage.getItem("inah_theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DB_KEY) || "[]"); } catch { return []; }
  });
  const [toasts, setToasts] = useState([]);

  const t = dark ? T.dark : T.light;

  useEffect(() => { localStorage.setItem(DB_KEY, JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem("inah_theme", dark ? "dark" : "light"); }, [dark]);

  const addToast = useCallback((msg, type = "info") => {
    const id = uid();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2800);
  }, []);

  if (page === "home") {
    return (
      <>
        {/* dark mode toggle on home */}
        <button
          onClick={() => setDark((d) => !d)}
          className={`fixed top-4 right-4 z-50 w-10 h-10 rounded-xl border ${t.border} ${t.card} ${t.text} flex items-center justify-center text-lg transition shadow-sm`}>
          {dark ? "☀️" : "🌙"}
        </button>
        <HomePage onEnter={() => setPage("app")} t={t} dark={dark} />
      </>
    );
  }

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300`}>
      {/* scanline keyframe */}
      <style>{`@keyframes scanline{0%,100%{top:0}50%{top:calc(100% - 2px)}}`}</style>

      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b ${t.border} ${t.surface}`}>
        <div className="flex items-center gap-3">
          <button onClick={() => setPage("home")}
            className={`${t.textMuted} hover:text-[#c96442] text-lg transition`} title="Home">🏪</button>
          <div>
            <h1 className="text-base font-bold text-[#c96442] tracking-wide">INAH STORE</h1>
            <p className={`text-xs ${t.textMuted} font-mono`}>Point of Sale System</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tabs */}
          {[["pos", "🛒 Cashier"], ["inventory", "📦 Inventory"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-xl text-sm transition font-medium
                ${tab === id
                  ? "bg-[#c96442] text-white"
                  : `${t.textMuted} ${t.hover} rounded-xl`}`}>
              {label}
            </button>
          ))}

          {/* Dark mode toggle */}
          <button onClick={() => setDark((d) => !d)}
            className={`ml-1 w-9 h-9 rounded-xl border ${t.border} ${t.card} ${t.text} flex items-center justify-center text-base transition`}>
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      {tab === "pos"       && <PosTab items={items} addToast={addToast} t={t} />}
      {tab === "inventory" && <InventoryTab items={items} setItems={setItems} addToast={addToast} t={t} />}

      <Toast toasts={toasts} />
    </div>
  );
}