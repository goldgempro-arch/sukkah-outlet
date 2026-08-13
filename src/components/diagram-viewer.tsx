import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  title: string;
  children: ReactNode;
  headerRight?: ReactNode;
  nav?: {
    index: number;
    count: number;
    label?: string;
    onPrev: () => void;
    onNext: () => void;
  };
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function PanZoomSurface({ children, label, gated = false, onExpand }: { children: ReactNode; label: string; gated?: boolean; onExpand?: () => void }) {
  const [active, setActive] = useState(!gated);
  const activeRef = useRef(active);
  activeRef.current = active;
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragOrigin = useRef<{ x: number; y: number; transform: Transform } | null>(null);
  const pinchDistance = useRef<number | null>(null);
  const transformRef = useRef<Transform>({ scale: 1, x: 0, y: 0 });
  const [transform, setTransform] = useState<Transform>(transformRef.current);

  const update = useCallback((next: Transform) => {
    const safe = { scale: clamp(next.scale, 0.5, 6), x: next.x, y: next.y };
    transformRef.current = safe;
    setTransform(safe);
  }, []);

  const zoomAt = useCallback((nextScale: number, clientX?: number, clientY?: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const current = transformRef.current;
    const scale = clamp(nextScale, 0.5, 6);
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const ratio = scale / current.scale;
    update({ scale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio });
  }, [update]);

  const handleWheel = (event: WheelEvent) => {
    // A trackpad pinch arrives as a ctrlKey wheel event: treat it like a
    // touch pinch and never gate it behind a click.
    if (!activeRef.current && !event.ctrlKey) return;
    event.preventDefault();
    const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
    zoomAt(transformRef.current.scale * Math.exp(-dy * 0.0015), event.clientX, event.clientY);
    if (gated && !activeRef.current) setActive(true);
  };
  const wheelHandlerRef = useRef(handleWheel);
  wheelHandlerRef.current = handleWheel;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => wheelHandlerRef.current(event);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Track every pointer regardless of gating, so a second finger can be
    // detected for pinch-zoom even before a tap has activated single-finger pan.
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      // A single finger/pointer only starts a drag-pan if already active --
      // pinch (two fingers) is never gated, since it's an unambiguous
      // deliberate gesture that can't be confused with page scrolling.
      if (gated && !activeRef.current) return;
      dragOrigin.current = { x: event.clientX, y: event.clientY, transform: transformRef.current };
    } else if (pointers.current.size === 2) {
      const points = [...pointers.current.values()];
      const first = points[0];
      const second = points[1];
      if (first && second) pinchDistance.current = Math.hypot(first.x - second.x, first.y - second.y);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 1 && dragOrigin.current) {
      update({
        ...dragOrigin.current.transform,
        x: dragOrigin.current.transform.x + event.clientX - dragOrigin.current.x,
        y: dragOrigin.current.transform.y + event.clientY - dragOrigin.current.y,
      });
    } else if (points.length === 2) {
      const first = points[0];
      const second = points[1];
      if (!first || !second) return;
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      if (pinchDistance.current) zoomAt(transformRef.current.scale * (distance / pinchDistance.current), centerX, centerY);
      pinchDistance.current = distance;
      // A deliberate two-finger pinch counts as activation -- so if the user
      // lifts one finger afterward, single-finger pan works immediately
      // without requiring a separate tap first.
      if (gated && !activeRef.current) setActive(true);
    }
  };

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;
    if (pointers.current.size === 0) dragOrigin.current = null;
  };

  const control = (labelText: string, icon: ReactNode, action: () => void) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="secondary" size="icon" className="h-8 w-8" aria-label={labelText} onClick={action}>{icon}</Button>
      </TooltipTrigger>
      <TooltipContent>{labelText}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider>
      <div
        className="relative h-full min-h-48 w-full overflow-hidden rounded-md"
        ref={viewportRef}
        onClick={() => { if (gated && !active) setActive(true); }}
        onDoubleClick={() => onExpand?.()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerLeave={(event) => {
          releasePointer(event);
          // Leaving the diagram area de-arms pan/zoom: a fresh click is
          // required before the inline surface responds again.
          if (gated) setActive(false);
        }}
        onMouseLeave={() => { if (gated) setActive(false); }}
        style={{ touchAction: "none" }}
        aria-label={`${label} interactive diagram`}
      >
        <div className={`h-full w-full select-none ${active ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`} style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: "0 0" }}>
          {children}
        </div>
        {gated && !active && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/85 px-2 py-1 text-xs text-muted-foreground shadow-sm">
            Click to pan &amp; zoom · double-click to expand · pinch to zoom anytime
          </div>
        )}
        <div className="absolute bottom-2 right-2 flex gap-1" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          {control("Zoom out", <Minus className="h-4 w-4" />, () => zoomAt(transformRef.current.scale / 1.2))}
          {control("Reset view", <RotateCcw className="h-4 w-4" />, () => update({ scale: 1, x: 0, y: 0 }))}
          {control("Zoom in", <Plus className="h-4 w-4" />, () => zoomAt(transformRef.current.scale * 1.2))}
        </div>
      </div>
    </TooltipProvider>
  );
}

export function DiagramViewer({ title, children, headerRight, nav }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [title]);
  const cycler = nav && nav.count > 1 && (
    <div className="flex items-center justify-center gap-2">
      <Button variant="outline" size="sm" aria-label="Previous option" onClick={nav.onPrev}><ChevronLeft className="mr-1 h-4 w-4" />Prev</Button>
      <span className="min-w-32 text-center text-sm font-medium text-muted-foreground">{nav.label ?? `Option ${nav.index + 1} of ${nav.count}`}</span>
      <Button variant="outline" size="sm" aria-label="Next option" onClick={nav.onNext}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
    </div>
  );

  return (
    <>
      {/* The diagram box is fixed-height, so anchoring the Prev/Next cycler to
          it keeps the buttons under the cursor no matter how the option's
          content changes height. */}
      <div className="relative h-[clamp(20rem,46vw,40rem)] w-full rounded-lg border bg-muted/30 p-2 pt-14">
        {cycler && (
          <div className="absolute left-2 right-12 top-2 z-10 flex h-10 items-center justify-center rounded-md bg-background/85 backdrop-blur-sm">
            {cycler}
          </div>
        )}
        <PanZoomSurface label={title} gated onExpand={() => setOpen(true)}>{children}</PanZoomSurface>
        <Button type="button" variant="secondary" size="icon" className="absolute right-3 top-3 h-8 w-8" aria-label={`Expand ${title}`} onClick={() => setOpen(true)}><Maximize2 className="h-4 w-4" /></Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[95vh] w-[96vw] max-w-none flex-col gap-4 sm:max-w-none">
          <DialogHeader className="flex flex-row items-center justify-between gap-4 pr-10">
            <DialogTitle>{title}</DialogTitle>
            {headerRight && <div className="code-text text-sm font-semibold text-foreground">{headerRight}</div>}
            {cycler}
          </DialogHeader>
          <div className="min-h-0 flex-1 rounded-lg border bg-muted/30 p-2">
            <PanZoomSurface label={title}>{children}</PanZoomSurface>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}