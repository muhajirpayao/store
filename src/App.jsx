import { useState, useEffect, useRef, useCallback } from "react";

// ─── Helpers ───
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n) =>
  "₱" + parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Toast ───
function Toast({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl text-sm font-medium shadow-lg animate-fade-in
            ${t.type === "success" ? "bg-green-500 text-white" : ""}
            ${t.type === "error" ? "bg-red-500 text-white" : ""}
            ${t.type === "info" ? "bg-blue-500 text-white" : ""}`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Scanner component ───
function BarcodeScanner({ videoId, onDetect, onClose }) {
  const readerRef = useRef(null);

  useEffect(() => {
    const ZXing = window.ZXing;
    if (!ZXing) return;
    const reader = new ZXing.BrowserMultiFormatReader();
    readerRef.current = reader;
    reader.decodeFromVideoDevice(null, videoId, (result, err) => {
      if (result) {
        reader.reset();
        onDetect(result.getText());
      }
    }).catch(() => {});
    return () => { try { reader.reset(); } catch (_) {} };
  }, [videoId, onDetect]);

  return (
    <div className="relative mt-3">
      <video id={videoId} className="w-full rounded-xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-28 border-2 border-amber-400 rounded-lg pointer-events-none"
        style={{ boxShadow: "0 0 0 1000px rgba(0,0,0,0.45)" }}>
        <div className="absolute inset-x-0 top-0 h-0.5 bg-amber-500 animate-[scanline_1.8s_ease-in-out_infinite]" />
      </div>
      <button onClick={onClose} className="mt-2 w-full bg-red-500 hover:bg-red-400 text-white text-sm py-2 rounded-xl">
        ✕ Close Camera
      </button>
    </div>
  );
}

// ─── POS Tab ───
function PosTab({ items, addToast }) {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [cash, setCashVal] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const cashNum = parseFloat(cash) || 0;
  const change = cashNum - total;

  const posSearch = useCallback((q) => {
    const query = (q ?? search).trim().toLowerCase();
    if (!query) return;
    const item =
      items.find((i) => i.barcode && i.barcode.toLowerCase() === query) ||
      items.find((i) => i.name.toLowerCase().includes(query));
    if (!item) { addToast(`"${query}" not found`, "error"); return; }
    setCart((prev) => {
      const ex = prev.find((c) => c.id === item.id);
      return ex ? prev.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c) : [...prev, { ...item, qty: 1 }];
    });
    addToast(`+1 ${item.name}`, "success");
    setSearch("");
  }, [search, items, addToast]);

  const changeQty = (id, delta) => {
    setCart((prev) => {
      const updated = prev.map((c) => c.id === id ? { ...c, qty: c.qty + delta } : c);
      return updated.filter((c) => c.qty > 0);
    });
  };

  const setCash = (amount) => {
    const rounded = Math.ceil(total / amount) * amount;
    setCashVal(String(rounded));
  };

  const checkout = () => {
    if (cart.length === 0) { addToast("Cart is empty!", "error"); return; }
    if (cashNum < total) { addToast("Cash is less than total!", "error"); return; }
    addToast(`✓ Sale complete! Change: ${fmt(change)}`, "success");
    setCart([]);
    setCashVal("");
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Scan input */}
          <div className="bg-[#faf7f2] border border-[#d5cfc6] rounded-2xl p-4">
            <p className="text-xs text-[#7a736a] uppercase tracking-widest mb-3">Scan / Search Item</p>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#f0ece4] border border-[#d5cfc6] rounded-xl text-[#2c2825] px-3 py-2.5 text-sm outline-none focus:border-amber-500 placeholder-[#b0a99f]"
                placeholder="Scan barcode or type item name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && posSearch()}
                autoFocus
              />
              <button onClick={() => setScannerOpen((v) => !v)}
                className="bg-[#e4dfd6] hover:bg-[#d9d3c8] text-[#2c2825] px-3 rounded-xl transition">📷</button>
              <button onClick={() => posSearch()}
                className="bg-amber-500 hover:bg-amber-400 text-white font-semibold px-4 rounded-xl transition">Add</button>
            </div>
            {scannerOpen && (
              <BarcodeScanner
                videoId="pos-video"
                onDetect={(code) => { setScannerOpen(false); posSearch(code); }}
                onClose={() => setScannerOpen(false)}
              />
            )}
          </div>

          {/* Cart */}
          <div className="bg-[#faf7f2] border border-[#d5cfc6] rounded-2xl p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-[#7a736a] uppercase tracking-widest">Cart</p>
              {cart.length > 0 && (
                <button onClick={() => { if (window.confirm("Clear all items?")) setCart([]); }}
                  className="text-xs text-red-400 hover:text-red-300">Clear all</button>
              )}
            </div>
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <p className="text-center text-[#b0a99f] text-sm py-8">No items yet. Scan or search to add.</p>
              ) : cart.map((c) => (
                <div key={c.id} className="bg-[#f0ece4] border border-[#d5cfc6] rounded-xl flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#2c2825] truncate">{c.name}</p>
                    <p className="text-xs text-[#9a9189]">{fmt(c.price)} each · {fmt(c.price * c.qty)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(c.id, -1)}
                      className="bg-[#e4dfd6] hover:bg-amber-500 hover:text-white text-[#2c2825] w-7 h-7 rounded-lg flex items-center justify-center text-base transition">−</button>
                    <span className="font-mono text-sm w-6 text-center">{c.qty}</span>
                    <button onClick={() => changeQty(c.id, 1)}
                      className="bg-[#e4dfd6] hover:bg-amber-500 hover:text-white text-[#2c2825] w-7 h-7 rounded-lg flex items-center justify-center text-base transition">+</button>
                    <button onClick={() => setCart((prev) => prev.filter((x) => x.id !== c.id))}
                      className="bg-red-500 hover:bg-red-400 text-white py-1 px-2 rounded-lg text-xs ml-1 transition">✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-[#faf7f2] border border-[#d5cfc6] rounded-2xl p-5 flex flex-col gap-4">
            <p className="text-xs text-[#7a736a] uppercase tracking-widest">Order Summary</p>
            <div className="flex justify-between text-sm text-[#7a736a]">
              <span>Items</span><span className="font-mono">{count}</span>
            </div>
            <div className="flex justify-between text-sm text-[#7a736a]">
              <span>Subtotal</span><span className="font-mono">{fmt(total)}</span>
            </div>
            <div className="border-t border-[#d5cfc6] pt-3 flex justify-between text-lg font-bold text-amber-600">
              <span>TOTAL</span><span className="font-mono">{fmt(total)}</span>
            </div>

            <div className="bg-[#f0ece4] rounded-xl p-4 border border-[#d5cfc6]">
              <p className="text-xs text-[#7a736a] mb-2 uppercase tracking-widest">Cash Tendered</p>
              <input
                type="number" min="0" step="1"
                className="w-full bg-[#f0ece4] border border-[#d5cfc6] rounded-xl text-[#2c2825] px-3 py-2.5 font-mono text-lg mb-3 outline-none focus:border-amber-500"
                placeholder="₱0.00"
                value={cash}
                onChange={(e) => setCashVal(e.target.value)}
              />
              <div className="flex justify-between text-sm text-[#7a736a] mb-1">
                <span>Change</span>
                <span className={`font-mono font-semibold ${cashNum === 0 ? "text-[#9a9189]" : change < 0 ? "text-red-400" : "text-green-400"}`}>
                  {cashNum === 0 ? "₱0.00" : change < 0 ? `${fmt(Math.abs(change))} short` : fmt(change)}
                </span>
              </div>
              {cashNum > 0 && change < 0 && (
                <p className="text-xs text-red-400">Insufficient cash</p>
              )}
            </div>

            <button onClick={checkout}
              className="bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl py-3 text-base transition">
              ✓ Checkout
            </button>
          </div>

          <div className="bg-[#faf7f2] border border-[#d5cfc6] rounded-2xl p-4">
            <p className="text-xs text-[#7a736a] uppercase tracking-widest mb-3">Quick Cash</p>
            <div className="grid grid-cols-3 gap-2">
              {[20, 50, 100, 200, 500, 1000].map((a) => (
                <button key={a} onClick={() => setCash(a)}
                  className="bg-[#e4dfd6] hover:bg-[#d9d3c8] text-[#2c2825] text-sm py-2 rounded-xl transition">
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

// ─── Inventory Tab ───
function InventoryTab({ items, setItems, addToast }) {
  const [form, setForm] = useState({ name: "", price: "", barcode: "", category: "" });
  const [editingId, setEditingId] = useState(null);
  const [invSearch, setInvSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState("");

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
        setError("An item with that name already exists."); return;
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

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Form */}
      <div className="bg-[#faf7f2] border border-[#d5cfc6] rounded-2xl p-5 mb-4">
        <p className="text-xs text-[#7a736a] uppercase tracking-widest mb-4">
          {editingId ? "Edit Item" : "Add New Item"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {[
            { label: "Item Name", key: "name", placeholder: "e.g. Coke 1L", type: "text" },
            { label: "Price (₱)", key: "price", placeholder: "0.00", type: "number" },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <label className="text-xs text-[#9a9189] mb-1 block">{label}</label>
              <input
                type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined}
                className="w-full bg-[#f0ece4] border border-[#d5cfc6] rounded-xl text-[#2c2825] px-3 py-2.5 text-sm outline-none focus:border-amber-500 placeholder-[#b0a99f]"
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-[#9a9189] mb-1 block">Barcode (optional)</label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#f0ece4] border border-[#d5cfc6] rounded-xl text-[#2c2825] px-3 py-2.5 text-sm outline-none focus:border-amber-500 placeholder-[#b0a99f]"
                placeholder="Scan or type barcode"
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              />
              <button onClick={() => setScannerOpen((v) => !v)}
                className="bg-[#e4dfd6] hover:bg-[#d9d3c8] text-[#2c2825] px-3 text-sm rounded-xl transition">📷</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-[#9a9189] mb-1 block">Category (optional)</label>
            <input
              className="w-full bg-[#f0ece4] border border-[#d5cfc6] rounded-xl text-[#2c2825] px-3 py-2.5 text-sm outline-none focus:border-amber-500 placeholder-[#b0a99f]"
              placeholder="e.g. Beverages"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>
        </div>

        {scannerOpen && (
          <BarcodeScanner
            videoId="inv-video"
            onDetect={(code) => { setScannerOpen(false); setForm((f) => ({ ...f, barcode: code })); addToast("Barcode scanned: " + code, "success"); }}
            onClose={() => setScannerOpen(false)}
          />
        )}

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={saveItem}
            className="bg-amber-500 hover:bg-amber-400 text-white font-semibold px-6 py-2.5 rounded-xl transition">
            💾 Save Item
          </button>
          <button onClick={cancelEdit}
            className="bg-[#e4dfd6] hover:bg-[#d9d3c8] text-[#2c2825] px-4 py-2.5 rounded-xl transition">
            Cancel
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 bg-[#f0ece4] border border-[#d5cfc6] rounded-xl text-[#2c2825] px-3 py-2.5 text-sm outline-none focus:border-amber-500 placeholder-[#b0a99f]"
          placeholder="🔍  Search inventory..."
          value={invSearch}
          onChange={(e) => setInvSearch(e.target.value)}
        />
        <span className="text-xs text-[#9a9189] self-center whitespace-nowrap font-mono">
          {filtered.length}/{items.length} items
        </span>
      </div>

      {/* Table */}
      <div className="bg-[#faf7f2] border border-[#d5cfc6] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 text-xs text-[#9a9189] uppercase tracking-widest px-4 py-3 border-b border-[#d5cfc6]">
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Price</div>
          <div className="col-span-3">Barcode</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-1" />
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-[#d5cfc6]">
          {filtered.length === 0 ? (
            <p className="text-center text-[#b0a99f] text-sm py-10">
              {invSearch ? `No items match "${invSearch}"` : "No items. Add your first item above."}
            </p>
          ) : filtered.map((item) => (
            <div key={item.id} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-[#f0ece4] transition text-sm">
              <div className="col-span-4 font-medium text-[#2c2825] truncate">{item.name}</div>
              <div className="col-span-2 font-mono text-amber-600">{fmt(item.price)}</div>
              <div className="col-span-3 font-mono text-[#7a736a] text-xs truncate">{item.barcode || "—"}</div>
              <div className="col-span-2 text-[#9a9189] text-xs truncate">{item.category || "—"}</div>
              <div className="col-span-1 flex gap-1 justify-end">
                <button onClick={() => editItem(item.id)} className="text-amber-600 hover:text-amber-500 text-base px-1" title="Edit">✏️</button>
                <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-300 text-base px-1" title="Delete">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── App ───
const DB_KEY = "inah_pos_items";

export default function App() {
  const [tab, setTab] = useState("pos");
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DB_KEY) || "[]"); } catch { return []; }
  });
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    localStorage.setItem(DB_KEY, JSON.stringify(items));
  }, [items]);

  const addToast = useCallback((msg, type = "info") => {
    const id = uid();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <div className="min-h-screen bg-[#f0ece4] text-[#2c2825]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#d5cfc6]">
        <div>
          <h1 className="text-lg font-bold text-amber-600 tracking-wide">INAH STORE</h1>
          <p className="text-xs text-[#9a9189] font-mono">Point of Sale System</p>
        </div>
        <div className="flex gap-2">
          {[["pos", "🛒 Cashier"], ["inventory", "📦 Inventory"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm transition font-medium
                ${tab === id ? "bg-amber-500 text-white font-semibold" : "text-[#7a736a] hover:bg-[#e4dfd6]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      {tab === "pos" && <PosTab items={items} addToast={addToast} />}
      {tab === "inventory" && <InventoryTab items={items} setItems={setItems} addToast={addToast} />}

      <Toast toasts={toasts} />
    </div>
  );
}