// frontend/src/components/ESignCanvas/ESignCanvas.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Draggable    from 'react-draggable';
import { Move, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw, Loader2 } from 'lucide-react';
import api from '../../services/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * ESignCanvas
 *
 * Props:
 *   pdfUrl    — URL to render. Accepts:
 *               • blob://...       local File object URL (DocumentUploadPage — no auth needed)
 *               • /documents/...   relative API path    (ApprovalPage — fetched via axios + auth)
 *   qrDataUrl — blob URL of QR PNG stamp, or null (shows placeholder box)
 *   defaults  — { xPercent, yPercent, widthPt, heightPt, pageNumber }
 *   limits    — { minWidthPt, maxWidthPt }
 *   onChange  — (position) => void  { pageNumber, xPercent, yPercent, widthPt, heightPt }
 *
 * Fix log:
 *   FIX-01 — Load PDF via api (axios interceptor attach Bearer token) for /api/ paths.
 *            blob:// URLs are read directly without auth (local file preview).
 *   FIX-02 — Normalize pdfUrl: strip origin + strip /api prefix to avoid double-prefix
 *            with axios baseURL '/api'.
 *   FIX-03 — Stamp position stored as percent (source of truth). Zoom/page change
 *            recalculates pixel from percent → user drag position preserved.
 *   FIX-04 — pdfReady state as explicit render trigger after PDF load.
 *            Avoids blank canvas when setPageNum(1) → pageNum already 1 → no re-render.
 */
export default function ESignCanvas({ pdfUrl, qrDataUrl, defaults, limits, onChange }) {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const pdfRef       = useRef(null);
  const nodeRef      = useRef(null);

  const [numPages,   setNumPages]   = useState(0);
  const [pageNum,    setPageNum]    = useState(defaults?.pageNumber || 1);
  const [scale,      setScale]      = useState(1.2);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [pdfReady,   setPdfReady]   = useState(false);

  const [stampPosPercent, setStampPosPercent] = useState({
    x: defaults?.xPercent ?? 85,
    y: defaults?.yPercent ?? 5,
  });
  const [stampPos,  setStampPos]  = useState({ x: 0, y: 0 });
  const [stampSize, setStampSize] = useState({
    w: defaults?.widthPt  || 100,
    h: defaults?.heightPt || 100,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError,   setPdfError]   = useState(false);

  // ---------------------------------------------------------------------------
  // FIX-01 + FIX-02: Load PDF
  // blob:// → read directly (local file, no auth needed)
  // /...    → fetch via axios (auth interceptor, no-cache)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!pdfUrl) return;
    setPdfLoading(true);
    setPdfError(false);
    setPdfReady(false);

    let cancelled    = false;
    let loadingTask  = null;

    async function load() {
      try {
        let pdfData;

        if (pdfUrl.startsWith('blob:')) {
          // Local file URL — fetch directly, no auth header needed
          const res = await fetch(pdfUrl);
          const buf = await res.arrayBuffer();
          pdfData = new Uint8Array(buf);
        } else {
          // FIX-02: Normalize API path
          let fetchPath = pdfUrl;
          try {
            const parsed = new URL(pdfUrl);
            fetchPath = parsed.pathname + parsed.search;
          } catch { /* already relative */ }
          if (fetchPath.startsWith('/api/')) fetchPath = fetchPath.slice(4);

          // FIX-01: Fetch via axios (attaches Bearer token + auto-refresh on 401)
          const res = await api.get(fetchPath, { responseType: 'arraybuffer' });
          pdfData = new Uint8Array(res.data);
        }

        if (cancelled) return;

        loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf   = await loadingTask.promise;
        if (cancelled) return;

        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setPdfLoading(false);
        setPdfReady(true); // FIX-04: explicit trigger
      } catch (err) {
        if (cancelled) return;
        console.error('PDF load error:', err);
        setPdfLoading(false);
        setPdfError(true);
      }
    }

    load();

    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
    };
  }, [pdfUrl]);

  // ---------------------------------------------------------------------------
  // Render page canvas
  // FIX-04: pdfReady in dependency array — guaranteed to fire after PDF load
  // ---------------------------------------------------------------------------
  const renderPage = useCallback(async () => {
    if (!pdfRef.current || !canvasRef.current) return;

    const page     = await pdfRef.current.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas   = canvasRef.current;
    const context  = canvas.getContext('2d');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    // FIX-03: canvasSize change triggers stamp pixel recalculation via effect below
    setCanvasSize({ w: viewport.width, h: viewport.height });
  }, [pageNum, scale, pdfReady]); // FIX-04

  useEffect(() => { renderPage(); }, [renderPage]);

  // FIX-03: Recalculate stamp pixel from percent whenever canvas dimensions change
  useEffect(() => {
    if (!canvasSize.w || !canvasSize.h) return;
    setStampPos({
      x: (stampPosPercent.x / 100) * canvasSize.w,
      y: (stampPosPercent.y / 100) * canvasSize.h,
    });
  }, [canvasSize, stampPosPercent]);

  // ---------------------------------------------------------------------------
  // Emit position to parent
  // ---------------------------------------------------------------------------
  const emitPosition = useCallback(
    (posX, posY, sw, sh) => {
      if (!canvasSize.w || !canvasSize.h) return;
      onChange?.({
        pageNumber: pageNum,
        xPercent:   Math.max(0, Math.min(100, (posX / canvasSize.w) * 100)),
        yPercent:   Math.max(0, Math.min(100, (posY / canvasSize.h) * 100)),
        widthPt:    sw,
        heightPt:   sh,
      });
    },
    [canvasSize, pageNum, onChange]
  );

  // ---------------------------------------------------------------------------
  // Drag
  // ---------------------------------------------------------------------------
  function handleDragStop(_e, data) {
    const newX = Math.max(0, Math.min(data.x, canvasSize.w - stampSize.w));
    const newY = Math.max(0, Math.min(data.y, canvasSize.h - stampSize.h));
    setStampPos({ x: newX, y: newY });
    setStampPosPercent({ x: (newX / canvasSize.w) * 100, y: (newY / canvasSize.h) * 100 });
    setIsDragging(false);
    emitPosition(newX, newY, stampSize.w, stampSize.h);
  }

  // ---------------------------------------------------------------------------
  // Stamp resize
  // ---------------------------------------------------------------------------
  function handleResize(delta) {
    const minW = limits?.minWidthPt || 60;
    const maxW = limits?.maxWidthPt || 200;
    const newW = Math.max(minW, Math.min(maxW, stampSize.w + delta));
    setStampSize({ w: newW, h: newW });
    emitPosition(stampPos.x, stampPos.y, newW, newW);
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------
  function resetToDefault() {
    const px = defaults?.xPercent ?? 85;
    const py = defaults?.yPercent ?? 5;
    const w  = defaults?.widthPt  || 100;
    const h  = defaults?.heightPt || 100;
    setStampPosPercent({ x: px, y: py });
    setStampSize({ w, h });
    emitPosition((px / 100) * canvasSize.w, (py / 100) * canvasSize.h, w, h);
  }

  const bounds = {
    left:   0,
    top:    0,
    right:  Math.max(0, canvasSize.w - stampSize.w),
    bottom: Math.max(0, canvasSize.h - stampSize.h),
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-lg p-2 border border-gray-200">
        <button disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)} className="btn-secondary py-1 px-2">
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm text-gray-600 min-w-[80px] text-center">
          Hal {pageNum} / {numPages || '—'}
        </span>
        <button disabled={pageNum >= numPages} onClick={() => setPageNum(p => p + 1)} className="btn-secondary py-1 px-2">
          <ChevronRight size={14} />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <button onClick={() => setScale(s => Math.max(0.5, +(s - 0.2).toFixed(1)))} className="btn-secondary py-1 px-2">
          <ZoomOut size={14} />
        </button>
        <span className="text-xs text-gray-500 min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, +(s + 0.2).toFixed(1)))} className="btn-secondary py-1 px-2">
          <ZoomIn size={14} />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <button onClick={() => handleResize(-10)} className="btn-secondary py-1 px-2 text-xs">QR −</button>
        <span className="text-xs text-gray-500 min-w-[40px] text-center">{Math.round(stampSize.w)}pt</span>
        <button onClick={() => handleResize(+10)} className="btn-secondary py-1 px-2 text-xs">QR +</button>

        <button onClick={resetToDefault} className="btn-secondary py-1 px-2 ml-auto text-xs">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative overflow-auto border border-gray-300 rounded-lg bg-gray-100"
        style={{ maxHeight: '65vh' }}
      >
        {pdfLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-10 gap-2">
            <Loader2 size={28} className="animate-spin text-brand-500" />
            <span className="text-sm text-gray-500">Memuat PDF...</span>
          </div>
        )}
        {pdfError && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <span className="text-2xl">📄</span>
            <p className="text-sm">Gagal memuat PDF preview</p>
          </div>
        )}

        {!pdfError && (
          <div className="relative inline-block">
            <canvas ref={canvasRef} className="block shadow-md" />

            {!pdfLoading && pdfReady && canvasSize.w > 0 && (
              <Draggable
                nodeRef={nodeRef}
                position={stampPos}
                bounds={bounds}
                onStart={() => setIsDragging(true)}
                onStop={handleDragStop}
              >
                <div
                  ref={nodeRef}
                  className={`absolute cursor-move select-none transition-opacity ${isDragging ? 'opacity-70' : 'opacity-90'}`}
                  style={{ width: stampSize.w, height: stampSize.h, top: 0, left: 0 }}
                  title="Drag untuk pindahkan posisi tanda tangan"
                >
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR Stamp"
                      className="w-full h-full"
                      style={{ imageRendering: 'pixelated' }}
                      draggable={false}
                    />
                  ) : (
                    // Placeholder saat QR belum tersedia (upload page — doc belum dibuat)
                    <div className="w-full h-full bg-white/80 border-2 border-dashed border-brand-400 rounded flex items-center justify-center">
                      <Move size={20} className="text-brand-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 border-2 border-brand-500 rounded pointer-events-none" />
                </div>
              </Draggable>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Move size={11} />
        Drag QR box to specified sign area. Use QR +/− to adjust the stamp size.
      </p>
    </div>
  );
}