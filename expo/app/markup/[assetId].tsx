/**
 * Photo Markup Studio — layered vector annotation editor.
 *
 * Every annotation is an editable object/layer: tap to select (from any
 * tool), drag to move, grab handles to resize (arrow endpoints, shape
 * corners, text/callout scale), restyle after selection, duplicate, reorder
 * and delete. Privacy blur is a real live image blur with adjustable
 * intensity — not an opaque mask. The original photo is never modified —
 * annotations live as normalised vector JSON (with per-element timestamps)
 * and a flattened annotated copy is generated only on save for reports.
 *
 * Save flow: "Save" commits markup in place (Saving… → Saved on device),
 * then the button becomes "Done" to return. Leaving with unsaved changes
 * prompts Save & Close / Discard / Cancel. The header indicator defers to
 * the store's global persistStatus — see lib/saveState.ts — so it never
 * claims "Saved on device" while the background write is actually failing.
 */

import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowUpRight,
  BringToFront,
  Check,
  Circle,
  Copy,
  Crop,
  Droplets,
  Eraser,
  MousePointer2,
  MessageCircleWarning,
  Pencil,
  PenLine,
  Redo2,
  RotateCw,
  SendToBack,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle as SvgCircle, Ellipse, Line, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import { MARKUP_COLORS, font, palette, radius, spacing } from "@/constants/theme";
import { showAlert, showActions, showConfirm } from "@/lib/dialogs";
import { arrowHeadPoints, estimateTextWidthPx, strokePx } from "@/lib/annotationSvg";
import {
  HandleId,
  NormPoint,
  elementBounds,
  elementHandles,
  hitTestElement,
  resizeElement,
  translateElement,
} from "@/lib/annotationGeometry";
import {
  annotatedCaptureOptions,
  cropWorkingImage,
  deleteUriIfUnreferenced,
  persistAnnotatedCapture,
  regenerateThumbnail,
  rotateWorkingImage,
} from "@/lib/files";
import { newId } from "@/lib/ids";
import { saveIndicatorState, SAVE_INDICATOR_LABEL, SaveIndicatorState } from "@/lib/saveState";
import { useAppStore } from "@/providers/AppStore";
import type { AnnotationElement, PhotoAsset } from "@/types/models";
type Tool = "select" | "arrow" | "ellipse" | "rect" | "pen" | "text" | "callout" | "blur" | "crop";

const STROKE_SIZES = [4, 8, 14] as const;
const TEXT_SIZES = [32, 44, 60] as const;
const BLUR_INTENSITIES = [10, 18, 30] as const;
const HANDLE_HIT_PX = 26;
const TAP_THRESHOLD = 0.012;
/** Min normalised distance between recorded pen points — keeps long freehand
 * strokes light enough for smooth rendering and hit testing on large photos. */
const PEN_MIN_STEP = 0.004;

const ELEMENT_LABEL: Record<AnnotationElement["type"], string> = {
  arrow: "Arrow",
  ellipse: "Circle",
  rect: "Box",
  pen: "Pen stroke",
  text: "Text label",
  callout: "Number callout",
  blur: "Privacy blur",
};

/** Persistence errors always win over local saving/dirty state — see lib/saveState.ts. */
const SAVE_DOT_COLOR: Record<SaveIndicatorState, string> = {
  error: palette.red,
  saving: palette.info,
  dirty: "#F5A623",
  saved: palette.greenBright,
};

function elementSwatchColor(el: AnnotationElement): string {
  if (el.type === "text" || el.type === "callout") return el.color;
  if (el.type === "blur") return "#B8C0C8";
  return el.stroke;
}

const nowIso = (): string => new Date().toISOString();

const tapHaptic = (): void => {
  if (Platform.OS !== "web") Haptics.selectionAsync();
};
const successHaptic = (): void => {
  if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};
const heavyHaptic = (): void => {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

interface CanvasLayout {
  width: number;
  height: number;
}

type DragMode =
  | { kind: "none" }
  | { kind: "draw" }
  | { kind: "move"; base: AnnotationElement }
  | { kind: "handle"; base: AnnotationElement; handle: HandleId }
  | { kind: "crop" };

type TextModalState =
  | { mode: "new"; at: NormPoint }
  | { mode: "edit"; id: string }
  | null;

export default function MarkupStudio() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { db, saveAnnotation, updateAsset, persistStatus } = useAppStore();

  const asset = useMemo(() => db.assets.find((a) => a.id === assetId) ?? null, [db.assets, assetId]);
  const existing = useMemo(
    () => db.annotations.find((an) => an.assetId === assetId) ?? null,
    [db.annotations, assetId],
  );

  const [elements, setElements] = useState<AnnotationElement[]>(existing?.elements ?? []);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState<string>(MARKUP_COLORS[0]);
  const [stroke, setStroke] = useState<number>(STROKE_SIZES[1]);
  const [textSize, setTextSize] = useState<number>(TEXT_SIZES[1]);
  const [blurIntensity, setBlurIntensity] = useState<number>(BLUR_INTENSITIES[1]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftEl, setDraftEl] = useState<AnnotationElement | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [textModal, setTextModal] = useState<TextModalState>(null);
  const [textValue, setTextValue] = useState<string>("");
  const [textBg, setTextBg] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);
  const [canvas, setCanvas] = useState<CanvasLayout>({ width: 0, height: 0 });
  const [workingUri, setWorkingUri] = useState<string | null>(null);
  const [workingDims, setWorkingDims] = useState<{ width: number; height: number } | null>(null);

  const canvasRef = useRef<View>(null);
  const dragStart = useRef<NormPoint | null>(null);
  const dragMode = useRef<DragMode>({ kind: "none" });
  const preDrag = useRef<AnnotationElement[] | null>(null);
  const moved = useRef<boolean>(false);
  const wasSelectedAtGrant = useRef<boolean>(false);
  const penPoints = useRef<NormPoint[]>([]);
  /**
   * Source-of-truth mirrors. All element/history writes go through these refs
   * so rapid successive commits (quick pen strokes) can never read a stale
   * snapshot and silently drop a stroke — the historical pen-disappearing bug
   * was caused by commits running inside setState updaters with stale
   * closures over `elements`.
   */
  const elementsRef = useRef<AnnotationElement[]>(existing?.elements ?? []);
  const undoRef = useRef<AnnotationElement[][]>([]);
  const redoRef = useRef<AnnotationElement[][]>([]);
  const draftRef = useRef<AnnotationElement | null>(null);

  const imageUri = workingUri ?? asset?.reportUri ?? "";
  const imgWidth = workingDims?.width ?? asset?.width ?? 1600;
  const imgHeight = workingDims?.height ?? asset?.height ?? 1200;
  const aspect = canvas.height > 0 ? canvas.width / canvas.height : 1;

  /** Write elements to both the ref (immediate) and state (render). */
  const applyElements = useCallback((next: AnnotationElement[]) => {
    elementsRef.current = next;
    setElements(next);
  }, []);

  /** Mirror draft into a ref so commit-on-release never uses a stale closure. */
  const setDraft = useCallback((el: AnnotationElement | null) => {
    draftRef.current = el;
    setDraftEl(el);
  }, []);

  const pushHistory = useCallback(
    (next: AnnotationElement[]) => {
      undoRef.current = [...undoRef.current, elementsRef.current].slice(-40);
      redoRef.current = [];
      applyElements(next);
      setDirty(true);
    },
    [applyElements],
  );

  const undo = useCallback(() => {
    const last = undoRef.current[undoRef.current.length - 1];
    if (!last) return;
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, elementsRef.current];
    applyElements(last);
    setSelectedId(null);
    setDirty(true);
  }, [applyElements]);

  const redo = useCallback(() => {
    const last = redoRef.current[redoRef.current.length - 1];
    if (!last) return;
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, elementsRef.current];
    applyElements(last);
    setSelectedId(null);
    setDirty(true);
  }, [applyElements]);

  const nextCalloutNumber = useMemo(() => {
    const nums = elements.filter((e) => e.type === "callout").map((e) => (e.type === "callout" ? e.number : 0));
    return nums.length === 0 ? 1 : Math.max(...nums) + 1;
  }, [elements]);

  const norm = useCallback(
    (px: number, py: number): NormPoint => ({
      x: Math.min(1, Math.max(0, px / Math.max(1, canvas.width))),
      y: Math.min(1, Math.max(0, py / Math.max(1, canvas.height))),
    }),
    [canvas],
  );

  /** Find a selection handle under the touch point (px distance). */
  const handleAtPoint = useCallback(
    (el: AnnotationElement, p: NormPoint): HandleId | null => {
      const handles = elementHandles(el, aspect);
      for (const h of handles) {
        const dx = (h.x - p.x) * canvas.width;
        const dy = (h.y - p.y) * canvas.height;
        if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_HIT_PX) return h.id;
      }
      return null;
    },
    [aspect, canvas],
  );

  const openTextEditor = useCallback(
    (state: TextModalState) => {
      if (state?.mode === "edit") {
        const el = elements.find((e) => e.id === state.id);
        if (el?.type === "text") {
          setTextValue(el.text);
          setTextBg(el.bg ?? false);
        }
      } else {
        setTextValue("");
        setTextBg(true);
      }
      setTextModal(state);
    },
    [elements],
  );

  /**
   * Commit the in-progress gesture. Shared by release AND terminate so a
   * stolen gesture still commits the stroke. Reads only refs — never stale.
   */
  const endGesture = useCallback(() => {
    const mode = dragMode.current;
    const isTap = !moved.current;

    if (mode.kind === "move" || mode.kind === "handle") {
      if (moved.current && preDrag.current) {
        const snapshot = preDrag.current;
        undoRef.current = [...undoRef.current, snapshot].slice(-40);
        redoRef.current = [];
        const ts = nowIso();
        applyElements(elementsRef.current.map((el) => (el.id === mode.base.id ? { ...el, updatedAt: ts } : el)));
        setDirty(true);
      } else if (isTap && mode.kind === "move" && wasSelectedAtGrant.current && mode.base.type === "text") {
        // Tapping an already-selected text label opens the editor.
        openTextEditor({ mode: "edit", id: mode.base.id });
      }
      dragMode.current = { kind: "none" };
      dragStart.current = null;
      preDrag.current = null;
      return;
    }

    if (mode.kind === "crop") {
      dragMode.current = { kind: "none" };
      dragStart.current = null;
      return;
    }

    const p = dragStart.current;
    const draft = draftRef.current;
    // A pen gesture that recorded 2+ points is ALWAYS a stroke — even a tiny
    // fast squiggle below the tap threshold must never be discarded as a tap.
    const isPenStroke = draft?.type === "pen" && draft.points.length >= 2;

    // Tapping an existing annotation while any creation tool is active
    // selects it — no need to switch to the Select tool first.
    const hitOnTap =
      isTap && !isPenStroke && p && tool !== "select" && tool !== "crop"
        ? ([...elementsRef.current].reverse().find((el) => hitTestElement(el, p, aspect)) ?? null)
        : null;
    if (hitOnTap) {
      setDraft(null);
      setSelectedId(hitOnTap.id);
      setTool("select");
      tapHaptic();
    } else if (tool === "text" && isTap && p) {
      openTextEditor({ mode: "new", at: p });
      setDraft(null);
    } else if (tool === "callout" && isTap && p) {
      const nums = elementsRef.current
        .filter((e) => e.type === "callout")
        .map((e) => (e.type === "callout" ? e.number : 0));
      const ts = nowIso();
      const el: AnnotationElement = {
        id: newId(),
        type: "callout",
        cx: p.x,
        cy: p.y,
        number: nums.length === 0 ? 1 : Math.max(...nums) + 1,
        color,
        size: 64,
        createdAt: ts,
        updatedAt: ts,
      };
      pushHistory([...elementsRef.current, el]);
      setSelectedId(el.id);
      setDraft(null);
      tapHaptic();
    } else if (draft && (!isTap || isPenStroke) && mode.kind === "draw") {
      const ts = nowIso();
      const el = { ...draft, id: newId(), createdAt: ts, updatedAt: ts };
      pushHistory([...elementsRef.current, el]);
      setSelectedId(el.id);
      setDraft(null);
      tapHaptic();
    } else {
      setDraft(null);
    }
    penPoints.current = [];
    dragMode.current = { kind: "none" };
    dragStart.current = null;
  }, [tool, aspect, color, applyElements, pushHistory, openTextEditor, setDraft]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const p = norm(locationX, locationY);
          dragStart.current = p;
          moved.current = false;
          preDrag.current = elementsRef.current;
          wasSelectedAtGrant.current = false;

          if (tool === "crop") {
            dragMode.current = { kind: "crop" };
            setCropRect({ x: p.x, y: p.y, width: 0, height: 0 });
            return;
          }

          // 1. Handles on the selected element win over everything.
          const selected = elementsRef.current.find((e) => e.id === selectedId) ?? null;
          if (selected) {
            const handle = handleAtPoint(selected, p);
            if (handle) {
              dragMode.current = { kind: "handle", base: selected, handle };
              return;
            }
          }

          if (tool === "select") {
            const hit = [...elementsRef.current].reverse().find((el) => hitTestElement(el, p, aspect)) ?? null;
            wasSelectedAtGrant.current = !!hit && hit.id === selectedId;
            if (hit && hit.id !== selectedId) tapHaptic();
            setSelectedId(hit?.id ?? null);
            dragMode.current = hit ? { kind: "move", base: hit } : { kind: "none" };
            return;
          }

          // Drawing tools
          dragMode.current = { kind: "draw" };
          if (tool === "pen") {
            penPoints.current = [p];
            setDraft({ id: "draft", type: "pen", points: [p], stroke: color, strokeWidth: stroke });
          } else if (tool === "arrow") {
            setDraft({ id: "draft", type: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y, stroke: color, strokeWidth: stroke });
          } else if (tool === "ellipse") {
            setDraft({ id: "draft", type: "ellipse", cx: p.x, cy: p.y, rx: 0, ry: 0, stroke: color, strokeWidth: stroke });
          } else if (tool === "rect") {
            setDraft({ id: "draft", type: "rect", x: p.x, y: p.y, width: 0, height: 0, stroke: color, strokeWidth: stroke });
          } else if (tool === "blur") {
            setDraft({ id: "draft", type: "blur", x: p.x, y: p.y, width: 0, height: 0, intensity: blurIntensity });
          }
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const p = norm(locationX, locationY);
          const start = dragStart.current;
          if (!start) return;
          const mode = dragMode.current;
          if (Math.abs(p.x - start.x) > TAP_THRESHOLD || Math.abs(p.y - start.y) > TAP_THRESHOLD) {
            moved.current = true;
          }

          if (mode.kind === "move") {
            // Clamp so the element's centre stays on-canvas — an annotation
            // can never be dragged fully off the photo and lost.
            const b = elementBounds(mode.base, aspect);
            const cx = b.x + b.width / 2;
            const cy = b.y + b.height / 2;
            const dx = Math.min(0.98 - cx, Math.max(0.02 - cx, p.x - start.x));
            const dy = Math.min(0.98 - cy, Math.max(0.02 - cy, p.y - start.y));
            applyElements(
              elementsRef.current.map((el) => (el.id === mode.base.id ? translateElement(mode.base, dx, dy) : el)),
            );
            return;
          }
          if (mode.kind === "handle") {
            applyElements(
              elementsRef.current.map((el) => (el.id === mode.base.id ? resizeElement(mode.base, mode.handle, p, aspect) : el)),
            );
            return;
          }
          if (mode.kind === "crop") {
            setCropRect({
              x: Math.min(start.x, p.x),
              y: Math.min(start.y, p.y),
              width: Math.abs(p.x - start.x),
              height: Math.abs(p.y - start.y),
            });
            return;
          }
          if (mode.kind === "draw") {
            const prev = draftRef.current;
            if (!prev) return;
            switch (prev.type) {
              case "arrow":
                setDraft({ ...prev, x2: p.x, y2: p.y });
                return;
              case "ellipse":
                setDraft({
                  ...prev,
                  cx: (start.x + p.x) / 2,
                  cy: (start.y + p.y) / 2,
                  rx: Math.abs(p.x - start.x) / 2,
                  ry: Math.abs(p.y - start.y) / 2,
                });
                return;
              case "rect":
              case "blur":
                setDraft({
                  ...prev,
                  x: Math.min(start.x, p.x),
                  y: Math.min(start.y, p.y),
                  width: Math.abs(p.x - start.x),
                  height: Math.abs(p.y - start.y),
                });
                return;
              case "pen": {
                const last = penPoints.current[penPoints.current.length - 1];
                if (last && Math.abs(p.x - last.x) < PEN_MIN_STEP && Math.abs(p.y - last.y) < PEN_MIN_STEP) {
                  return;
                }
                penPoints.current = [...penPoints.current, p];
                setDraft({ ...prev, points: penPoints.current });
                return;
              }
              default:
                return;
            }
          }
        },
        onPanResponderRelease: () => endGesture(),
        // If the OS steals the gesture mid-stroke, commit what was drawn
        // instead of silently dropping it.
        onPanResponderTerminate: () => endGesture(),
      }),
    [tool, selectedId, color, stroke, blurIntensity, norm, aspect, handleAtPoint, openTextEditor, applyElements, setDraft, endGesture],
  );

  if (!asset) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Photo not found.</Text>
      </View>
    );
  }

  const imageAspect = imgWidth / Math.max(1, imgHeight);

  const commitText = () => {
    const value = textValue.trim();
    if (!textModal) return;
    if (textModal.mode === "new") {
      if (value) {
        const ts = nowIso();
        const el: AnnotationElement = {
          id: newId(),
          type: "text",
          x: textModal.at.x,
          y: textModal.at.y,
          text: value,
          color,
          fontSize: textSize,
          bg: textBg,
          createdAt: ts,
          updatedAt: ts,
        };
        pushHistory([...elements, el]);
        setSelectedId(el.id);
        setTool("select");
        tapHaptic();
      }
    } else {
      if (value) {
        pushHistory(
          elements.map((el) =>
            el.id === textModal.id && el.type === "text" ? { ...el, text: value, bg: textBg, updatedAt: nowIso() } : el,
          ),
        );
      }
    }
    setTextModal(null);
    setTextValue("");
  };

  const selectedEl = elements.find((e) => e.id === selectedId) ?? null;

  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory(elements.filter((el) => el.id !== selectedId));
    setSelectedId(null);
    heavyHaptic();
  };

  const duplicateSelected = () => {
    const el = elements.find((e) => e.id === selectedId);
    if (!el) return;
    const ts = nowIso();
    const copy = { ...translateElement(el, 0.045, 0.045), id: newId(), createdAt: ts, updatedAt: ts };
    pushHistory([...elements, copy]);
    setSelectedId(copy.id);
    tapHaptic();
  };

  const moveLayer = (dir: 1 | -1) => {
    const idx = elements.findIndex((e) => e.id === selectedId);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= elements.length) return;
    const next = [...elements];
    const a = next[idx];
    const b = next[j];
    if (!a || !b) return;
    next[idx] = b;
    next[j] = a;
    pushHistory(next);
  };

  /** Restyle the selected element, or set the default for new elements. */
  const applyColor = (c: string) => {
    setColor(c);
    if (!selectedEl) return;
    pushHistory(
      elements.map((el) => {
        if (el.id !== selectedEl.id) return el;
        if (el.type === "text" || el.type === "callout") return { ...el, color: c, updatedAt: nowIso() };
        if (el.type === "blur") return el;
        return { ...el, stroke: c, updatedAt: nowIso() };
      }),
    );
  };

  const applyStroke = (s: number) => {
    setStroke(s);
    if (!selectedEl) return;
    if (selectedEl.type === "arrow" || selectedEl.type === "ellipse" || selectedEl.type === "rect" || selectedEl.type === "pen") {
      pushHistory(elements.map((el) => (el.id === selectedEl.id && "strokeWidth" in el ? { ...el, strokeWidth: s, updatedAt: nowIso() } : el)));
    }
  };

  const applyTextSize = (s: number) => {
    setTextSize(s);
    if (selectedEl?.type === "text") {
      pushHistory(elements.map((el) => (el.id === selectedEl.id && el.type === "text" ? { ...el, fontSize: s, updatedAt: nowIso() } : el)));
    }
  };

  /** Change the live blur radius of the selected privacy mask (or the default for new ones). */
  const applyBlurIntensity = (v: number) => {
    setBlurIntensity(v);
    if (selectedEl?.type === "blur") {
      pushHistory(
        elements.map((el) => (el.id === selectedEl.id && el.type === "blur" ? { ...el, intensity: v, updatedAt: nowIso() } : el)),
      );
    }
  };

  const clearAll = async () => {
    if (elements.length === 0) return;
    const ok = await showConfirm(
      "Clear all markup?",
      "All annotations on this photo will be removed.",
      "Clear",
      true,
    );
    if (ok) {
      pushHistory([]);
      setSelectedId(null);
    }
  };

  const rotate = async () => {
    try {
      setSaving(true);
      const previousUri = imageUri;
      const rotated = await rotateWorkingImage(imageUri, asset.id);
      setWorkingUri(rotated.uri);
      setWorkingDims({ width: rotated.width, height: rotated.height });
      // Rotate normalised coords 90° clockwise: (x, y) -> (1 - y, x)
      const rotateEl = (el: AnnotationElement): AnnotationElement => {
        switch (el.type) {
          case "arrow":
            return { ...el, x1: 1 - el.y1, y1: el.x1, x2: 1 - el.y2, y2: el.x2 };
          case "ellipse":
            return { ...el, cx: 1 - el.cy, cy: el.cx, rx: el.ry, ry: el.rx };
          case "rect":
          case "blur":
            return { ...el, x: 1 - el.y - el.height, y: el.x, width: el.height, height: el.width };
          case "pen":
            return { ...el, points: el.points.map((p) => ({ x: 1 - p.y, y: p.x })) };
          case "text":
            return { ...el, x: 1 - el.y, y: el.x };
          case "callout":
            return { ...el, cx: 1 - el.cy, cy: el.cx };
        }
      };
      // Rotation changes the underlying image, so earlier history snapshots
      // no longer line up with it — clear undo/redo instead of corrupting it.
      applyElements(elementsRef.current.map(rotateEl));
      undoRef.current = [];
      redoRef.current = [];
      setSelectedId(null);
      setDirty(true);
      // Drop intermediate working files from earlier rotates/crops in this session
      // (still-referenced DB report paths are left alone until save).
      await deleteUriIfUnreferenced(previousUri, db.assets, asset.originalUri);
    } catch (e) {
      console.log("[markup] rotate failed", e);
      showAlert("Rotate failed", "Could not rotate this image.");
    } finally {
      setSaving(false);
    }
  };

  const applyCrop = async () => {
    if (!cropRect || cropRect.width < 0.05 || cropRect.height < 0.05) {
      showAlert("Draw a crop area", "Drag on the photo to select the area to keep.");
      return;
    }
    try {
      setSaving(true);
      const previousUri = imageUri;
      const cropped = await cropWorkingImage(imageUri, asset.id, imgWidth, imgHeight, cropRect);
      setWorkingUri(cropped.uri);
      setWorkingDims({ width: cropped.width, height: cropped.height });
      const cw = Math.max(0.0001, cropRect.width);
      const ch = Math.max(0.0001, cropRect.height);
      const remap = (el: AnnotationElement): AnnotationElement => {
        switch (el.type) {
          case "arrow":
            return { ...el, x1: (el.x1 - cropRect.x) / cw, y1: (el.y1 - cropRect.y) / ch, x2: (el.x2 - cropRect.x) / cw, y2: (el.y2 - cropRect.y) / ch };
          case "ellipse":
            return { ...el, cx: (el.cx - cropRect.x) / cw, cy: (el.cy - cropRect.y) / ch, rx: el.rx / cw, ry: el.ry / ch };
          case "rect":
          case "blur":
            return { ...el, x: (el.x - cropRect.x) / cw, y: (el.y - cropRect.y) / ch, width: el.width / cw, height: el.height / ch };
          case "pen":
            return { ...el, points: el.points.map((p) => ({ x: (p.x - cropRect.x) / cw, y: (p.y - cropRect.y) / ch })) };
          case "text":
            return { ...el, x: (el.x - cropRect.x) / cw, y: (el.y - cropRect.y) / ch };
          case "callout":
            return { ...el, cx: (el.cx - cropRect.x) / cw, cy: (el.cy - cropRect.y) / ch };
        }
      };
      // Crop changes the underlying image — clear undo/redo history so an
      // undo can't restore coordinates that belong to the pre-crop image.
      applyElements(elementsRef.current.map(remap));
      undoRef.current = [];
      redoRef.current = [];
      setSelectedId(null);
      setCropRect(null);
      setTool("select");
      setDirty(true);
      await deleteUriIfUnreferenced(previousUri, db.assets, asset.originalUri);
    } catch (e) {
      console.log("[markup] crop failed", e);
      showAlert("Crop failed", "Could not crop this image.");
    } finally {
      setSaving(false);
    }
  };

  const save = async (thenBack: boolean) => {
    try {
      setSelectedId(null);
      setDraft(null);
      setSaving(true);
      // Selection/crop chrome live outside canvasRef — no setTimeout hide hack.
      const elementsToSave = elementsRef.current;
      const previousReportUri = asset.reportUri;
      const previousThumbUri = asset.thumbUri;
      const previousAnnotatedUri = asset.annotatedUri;

      let annotatedUri: string | null = null;
      if (Platform.OS !== "web" && canvasRef.current && elementsToSave.length > 0) {
        try {
          const tmp = await captureRef(
            canvasRef,
            annotatedCaptureOptions(imgWidth, imgHeight),
          );
          annotatedUri = await persistAnnotatedCapture(tmp, asset.id);
        } catch (e) {
          console.log("[markup] flatten failed (annotation JSON still saved)", e);
        }
      }

      let nextReportUri = asset.reportUri;
      let nextThumbUri = asset.thumbUri;
      let nextWidth = asset.width;
      let nextHeight = asset.height;

      if (workingUri && workingDims) {
        // The working image was cropped/rotated — refresh the list thumbnail
        // so the hit list matches the new orientation/frame.
        let thumbUri: string | null = null;
        try {
          thumbUri = await regenerateThumbnail(workingUri, asset.id);
        } catch (e) {
          console.log("[markup] thumbnail refresh failed", e);
        }
        nextReportUri = workingUri;
        nextWidth = workingDims.width;
        nextHeight = workingDims.height;
        if (thumbUri) nextThumbUri = thumbUri;
        updateAsset(asset.id, {
          reportUri: workingUri,
          width: workingDims.width,
          height: workingDims.height,
          ...(thumbUri ? { thumbUri } : {}),
        });
      }
      saveAnnotation(asset.id, asset.issueId, elementsToSave, annotatedUri);

      // After store update: delete superseded files that nothing else references.
      const assetsAfter: PhotoAsset[] = db.assets.map((a) =>
        a.id === asset.id
          ? {
              ...a,
              reportUri: nextReportUri,
              thumbUri: nextThumbUri,
              width: nextWidth,
              height: nextHeight,
              annotatedUri,
            }
          : a,
      );
      await deleteUriIfUnreferenced(previousReportUri, assetsAfter, asset.originalUri);
      await deleteUriIfUnreferenced(previousThumbUri, assetsAfter, asset.originalUri);
      await deleteUriIfUnreferenced(previousAnnotatedUri, assetsAfter, asset.originalUri);

      setDirty(false);
      successHaptic();
      if (thenBack) router.back();
    } catch (e) {
      console.log("[markup] save failed", e);
      showAlert("Save failed", "Could not save markup. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty) {
      showActions("Unsaved markup changes", "You have unsaved markup changes. Save before leaving?", [
        { text: "Save & Close", onPress: () => save(true) },
        { text: "Discard", style: "destructive", onPress: () => router.back() },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      router.back();
    }
  };

  const renderElement = (el: AnnotationElement, w: number, h: number) => {
    switch (el.type) {
      case "arrow": {
        const sw = strokePx(el.strokeWidth, w);
        const head = Math.max(10, sw * 3.4);
        return (
          <React.Fragment key={el.id}>
            <Line x1={el.x1 * w} y1={el.y1 * h} x2={el.x2 * w} y2={el.y2 * h} stroke={el.stroke} strokeWidth={sw} strokeLinecap="round" />
            <Polygon points={arrowHeadPoints(el.x1 * w, el.y1 * h, el.x2 * w, el.y2 * h, head)} fill={el.stroke} />
          </React.Fragment>
        );
      }
      case "ellipse":
        return (
          <Ellipse key={el.id} cx={el.cx * w} cy={el.cy * h} rx={el.rx * w} ry={el.ry * h} stroke={el.stroke} strokeWidth={strokePx(el.strokeWidth, w)} fill="none" />
        );
      case "rect":
        return (
          <Rect key={el.id} x={el.x * w} y={el.y * h} width={el.width * w} height={el.height * h} rx={4} stroke={el.stroke} strokeWidth={strokePx(el.strokeWidth, w)} fill="none" />
        );
      case "pen":
        return (
          <Polyline
            key={el.id}
            points={el.points.map((p) => `${p.x * w},${p.y * h}`).join(" ")}
            stroke={el.stroke}
            strokeWidth={strokePx(el.strokeWidth, w)}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case "text": {
        const fs = Math.max(10, (el.fontSize * w) / 1000);
        if (el.bg) {
          const tw = estimateTextWidthPx(el.text, fs);
          const padX = fs * 0.45;
          return (
            <React.Fragment key={el.id}>
              <Rect x={el.x * w - padX} y={el.y * h - fs * 1.05} width={tw + padX * 2} height={fs * 1.5} rx={fs * 0.35} fill={el.color} opacity={0.94} />
              <SvgText x={el.x * w} y={el.y * h} fill="#FFFFFF" fontSize={fs} fontWeight="800">
                {el.text}
              </SvgText>
            </React.Fragment>
          );
        }
        return (
          <SvgText key={el.id} x={el.x * w} y={el.y * h} fill={el.color} fontSize={fs} fontWeight="700" stroke="rgba(0,0,0,0.55)" strokeWidth={fs / 10}>
            {el.text}
          </SvgText>
        );
      }
      case "callout": {
        const r = Math.max(12, (el.size * w) / 1000 / 2);
        return (
          <React.Fragment key={el.id}>
            <SvgCircle cx={el.cx * w} cy={el.cy * h} r={r} fill={el.color} stroke="#FFFFFF" strokeWidth={r / 6} />
            <SvgText x={el.cx * w} y={el.cy * h + r * 0.38} fill="#FFFFFF" fontSize={r * 1.1} fontWeight="800" textAnchor="middle">
              {`${el.number}`}
            </SvgText>
          </React.Fragment>
        );
      }
      case "blur":
        // Privacy blur renders as a live blurred image region (see the
        // canvas layer below the SVG), not as a vector shape.
        return null;
    }
  };

  /** Live privacy-blur regions: clipped views containing a blurred copy of the photo. */
  const renderBlurRegions = (w: number, h: number) => {
    const blurs = elements.filter((el) => el.type === "blur");
    if (draftEl?.type === "blur") blurs.push(draftEl);
    // Scale blurRadius by capture ratio so high-res view-shot flattens stay strong.
    const captureScale = w > 0 ? Math.max(1, imgWidth / w) : 1;
    return blurs.map((el) => {
      if (el.type !== "blur") return null;
      return (
        <View
          key={`blur-${el.id}`}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: el.x * w,
            top: el.y * h,
            width: Math.max(1, el.width * w),
            height: Math.max(1, el.height * h),
            overflow: "hidden",
            borderRadius: 6,
          }}
        >
          <RNImage
            source={{ uri: imageUri }}
            blurRadius={el.intensity * captureScale}
            resizeMode="cover"
            style={{ position: "absolute", left: -el.x * w, top: -el.y * h, width: w, height: h }}
          />
        </View>
      );
    });
  };

  /** Selection chrome: dashed bounding box + resize handles. Not captured on save. */
  const renderSelection = (el: AnnotationElement, w: number, h: number) => {
    const b = elementBounds(el, aspect);
    const handles = elementHandles(el, aspect);
    const pad = 7;
    return (
      <React.Fragment key={`sel-${el.id}`}>
        <Rect
          x={b.x * w - pad}
          y={b.y * h - pad}
          width={b.width * w + pad * 2}
          height={b.height * h + pad * 2}
          stroke={palette.white}
          strokeWidth={1.4}
          strokeDasharray="6,4"
          fill="none"
          opacity={0.9}
        />
        {handles.map((hd) => (
          <SvgCircle
            key={hd.id}
            cx={hd.x * w}
            cy={hd.y * h}
            r={8}
            fill={palette.white}
            stroke={palette.carbon}
            strokeWidth={2}
          />
        ))}
      </React.Fragment>
    );
  };

  const tools: { key: Tool; icon: React.ReactNode; label: string }[] = [
    { key: "select", icon: <MousePointer2 color={tool === "select" ? palette.carbon : palette.white} size={19} />, label: "Select" },
    { key: "arrow", icon: <ArrowUpRight color={tool === "arrow" ? palette.carbon : palette.white} size={19} />, label: "Arrow" },
    { key: "ellipse", icon: <Circle color={tool === "ellipse" ? palette.carbon : palette.white} size={19} />, label: "Circle" },
    { key: "rect", icon: <Square color={tool === "rect" ? palette.carbon : palette.white} size={19} />, label: "Box" },
    { key: "pen", icon: <PenLine color={tool === "pen" ? palette.carbon : palette.white} size={19} />, label: "Pen" },
    { key: "text", icon: <Type color={tool === "text" ? palette.carbon : palette.white} size={19} />, label: "Text" },
    { key: "callout", icon: <MessageCircleWarning color={tool === "callout" ? palette.carbon : palette.white} size={19} />, label: "Number" },
    { key: "blur", icon: <Droplets color={tool === "blur" ? palette.carbon : palette.white} size={19} />, label: "Blur" },
    { key: "crop", icon: <Crop color={tool === "crop" ? palette.carbon : palette.white} size={19} />, label: "Crop" },
  ];

  const strokeApplies = !selectedEl || selectedEl.type === "arrow" || selectedEl.type === "ellipse" || selectedEl.type === "rect" || selectedEl.type === "pen";
  const showTextSizes = tool === "text" || selectedEl?.type === "text";
  const showBlurIntensity = !showTextSizes && (tool === "blur" || selectedEl?.type === "blur");
  const colorsDisabled = showBlurIntensity;
  const sizeValues: readonly number[] = showTextSizes ? TEXT_SIZES : showBlurIntensity ? BLUR_INTENSITIES : STROKE_SIZES;
  const saveIndicator = saveIndicatorState({ persistStatus, saving, dirty });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={close} testID="markup-close">
            <X color={palette.white} size={20} />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.topTitle}>Markup Studio</Text>
            <View style={styles.saveState} testID="markup-save-state">
              <View style={[styles.saveDot, { backgroundColor: SAVE_DOT_COLOR[saveIndicator] }]} />
              <Text
                style={[
                  styles.saveStateText,
                  saveIndicator === "error" && styles.saveStateError,
                  saveIndicator === "dirty" && styles.saveStateDirty,
                  saveIndicator === "saving" && styles.saveStateSaving,
                ]}
              >
                {SAVE_INDICATOR_LABEL[saveIndicator]}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, !dirty && !saving && styles.doneBtn]}
            onPress={() => (dirty ? save(false) : router.back())}
            disabled={saving}
            testID="markup-save"
          >
            {saving ? (
              <ActivityIndicator color={palette.white} size="small" />
            ) : (
              <>
                <Check color={palette.white} size={17} strokeWidth={2.6} />
                <Text style={styles.saveBtnText}>{dirty ? "Save" : "Done"}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Secondary actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.miniBtn, undoRef.current.length === 0 && styles.miniBtnDisabled]}
            onPress={undo}
            disabled={undoRef.current.length === 0}
            testID="markup-undo"
          >
            <Undo2 color={palette.white} size={18} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.miniBtn, redoRef.current.length === 0 && styles.miniBtnDisabled]}
            onPress={redo}
            disabled={redoRef.current.length === 0}
            testID="markup-redo"
          >
            <Redo2 color={palette.white} size={18} />
          </TouchableOpacity>
          <View style={styles.actionsSpacer} />
          <TouchableOpacity style={styles.miniBtn} onPress={rotate}>
            <RotateCw color={palette.white} size={18} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.miniBtn, elements.length === 0 && styles.miniBtnDisabled]} onPress={clearAll}>
            <Eraser color={palette.white} size={18} />
          </TouchableOpacity>
        </View>

        {/* Canvas — canvasRef captures ONLY image + blur + committed/draft vectors.
            Selection chrome, crop overlay, and blur draft outline live in a sibling SVG. */}
        <View style={styles.canvasWrap}>
          <View
            style={[styles.canvas, { aspectRatio: imageAspect }]}
            onLayout={(e) => setCanvas({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            <View ref={canvasRef} collapsable={false} style={StyleSheet.absoluteFill}>
              <RNImage source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              {canvas.width > 0 ? renderBlurRegions(canvas.width, canvas.height) : null}
              {canvas.width > 0 ? (
                <Svg width={canvas.width} height={canvas.height} style={StyleSheet.absoluteFill}>
                  {elements.map((el) => renderElement(el, canvas.width, canvas.height))}
                  {draftEl ? renderElement(draftEl, canvas.width, canvas.height) : null}
                </Svg>
              ) : null}
            </View>
            {canvas.width > 0 ? (
              <Svg
                width={canvas.width}
                height={canvas.height}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              >
                {draftEl?.type === "blur" ? (
                  <Rect
                    x={draftEl.x * canvas.width}
                    y={draftEl.y * canvas.height}
                    width={Math.max(1, draftEl.width * canvas.width)}
                    height={Math.max(1, draftEl.height * canvas.height)}
                    rx={6}
                    stroke={palette.white}
                    strokeWidth={1.6}
                    strokeDasharray="6,4"
                    fill="none"
                    opacity={0.9}
                  />
                ) : null}
                {selectedEl ? renderSelection(selectedEl, canvas.width, canvas.height) : null}
                {cropRect && tool === "crop" ? (
                  <Rect
                    x={cropRect.x * canvas.width}
                    y={cropRect.y * canvas.height}
                    width={cropRect.width * canvas.width}
                    height={cropRect.height * canvas.height}
                    stroke={palette.white}
                    strokeWidth={2}
                    strokeDasharray="8,5"
                    fill="rgba(255,255,255,0.12)"
                  />
                ) : null}
              </Svg>
            ) : null}
            <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />
          </View>
        </View>

        {/* Crop confirm / selection object bar */}
        {tool === "crop" ? (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionText}>Drag to select crop area</Text>
            <TouchableOpacity style={styles.selectionBtn} onPress={applyCrop}>
              <Check color={palette.greenBright} size={16} />
              <Text style={[styles.selectionBtnText, { color: palette.greenBright }]}>Apply</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.selectionBtn}
              onPress={() => {
                setCropRect(null);
                setTool("select");
              }}
            >
              <X color={palette.textFaint} size={16} />
              <Text style={styles.selectionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : selectedEl ? (
          <View style={styles.selectionBar}>
            <View style={styles.selectionType}>
              <View style={[styles.selectionSwatch, { backgroundColor: elementSwatchColor(selectedEl) }]} />
              <Text style={styles.selectionText} numberOfLines={1}>
                {ELEMENT_LABEL[selectedEl.type]}
              </Text>
            </View>
            {selectedEl.type === "text" ? (
              <TouchableOpacity style={styles.selectionBtn} onPress={() => openTextEditor({ mode: "edit", id: selectedEl.id })}>
                <Pencil color={palette.white} size={15} />
                <Text style={styles.selectionBtnText}>Edit</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.selectionBtn} onPress={duplicateSelected}>
              <Copy color={palette.white} size={15} />
              <Text style={styles.selectionBtnText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionIconBtn} onPress={() => moveLayer(1)}>
              <BringToFront color={palette.white} size={16} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionIconBtn} onPress={() => moveLayer(-1)}>
              <SendToBack color={palette.white} size={16} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionBtn} onPress={deleteSelected}>
              <Trash2 color={palette.red} size={15} />
              <Text style={[styles.selectionBtnText, { color: palette.red }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Style bar — applies to the selection, or sets defaults for new elements */}
        {tool !== "crop" ? (
          <View style={styles.styleBar}>
            <View style={styles.colorRow}>
              {MARKUP_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  disabled={colorsDisabled}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    color === c && !colorsDisabled && styles.colorDotActive,
                    colorsDisabled && styles.colorDotDisabled,
                  ]}
                  onPress={() => applyColor(c)}
                />
              ))}
            </View>
            <View style={styles.strokeRow}>
              {sizeValues.map((s, i) => {
                const active = showTextSizes ? textSize === s : showBlurIntensity ? blurIntensity === s : stroke === s;
                const disabled = !showTextSizes && !showBlurIntensity && !strokeApplies;
                return (
                  <TouchableOpacity
                    key={s}
                    disabled={disabled}
                    style={[styles.strokeBtn, active && styles.strokeBtnActive, disabled && styles.strokeBtnDisabled]}
                    onPress={() =>
                      showTextSizes ? applyTextSize(s) : showBlurIntensity ? applyBlurIntensity(s) : applyStroke(s)
                    }
                  >
                    <View
                      style={[
                        styles.strokeDot,
                        { width: 5 + i * 4, height: 5 + i * 4, borderRadius: (5 + i * 4) / 2 },
                        showBlurIntensity && { opacity: 0.55 + i * 0.22 },
                        active && styles.strokeDotActive,
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Tool bar */}
        <View style={[styles.toolBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          {tools.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.toolBtn, tool === t.key && styles.toolBtnActive]}
              onPress={() => {
                if (t.key !== tool) tapHaptic();
                setTool(t.key);
                if (t.key !== "select") setSelectedId(null);
                if (t.key !== "crop") setCropRect(null);
              }}
              testID={`tool-${t.key}`}
            >
              {t.icon}
              <Text style={[styles.toolLbl, tool === t.key && styles.toolLblActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Text entry / edit modal */}
      <Modal visible={textModal !== null} transparent animationType="fade" onRequestClose={() => setTextModal(null)}>
        <View style={styles.textModalBackdrop}>
          <View style={styles.textModal}>
            <Text style={styles.textModalTitle}>{textModal?.mode === "edit" ? "Edit label" : "Add label"}</Text>
            <TextInput
              style={styles.textModalInput}
              value={textValue}
              onChangeText={setTextValue}
              placeholder="e.g. Cracked tile"
              placeholderTextColor={palette.textFaint}
              autoFocus
              onSubmitEditing={commitText}
              testID="markup-text-input"
            />
            <TouchableOpacity style={styles.bgToggleRow} onPress={() => setTextBg((v) => !v)} activeOpacity={0.7}>
              <View style={[styles.bgToggleBox, textBg && styles.bgToggleBoxOn]}>
                {textBg ? <Check color={palette.white} size={13} strokeWidth={3} /> : null}
              </View>
              <View style={styles.bgToggleTextWrap}>
                <Text style={styles.bgToggleLabel}>Background pill</Text>
                <Text style={styles.bgToggleSub}>Keeps labels readable on busy site photos</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.textModalHint}>
              After adding, drag the label into position — tap it again to edit.
            </Text>
            <View style={styles.textModalRow}>
              <TouchableOpacity style={styles.textModalBtn} onPress={() => setTextModal(null)}>
                <Text style={styles.textModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.textModalBtn, styles.textModalPrimary]} onPress={commitText}>
                <Text style={styles.textModalOk}>{textModal?.mode === "edit" ? "Update" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121619" },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: palette.textMuted },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  topCenter: { flex: 1, alignItems: "center", gap: 2 },
  topTitle: { color: palette.white, fontSize: font.size.md, fontFamily: font.family.heading, letterSpacing: -0.2 },
  saveState: { flexDirection: "row", alignItems: "center", gap: 5 },
  saveDot: { width: 6, height: 6, borderRadius: 3 },
  saveStateText: { color: palette.greenBright, fontSize: 10, fontFamily: font.family.bodyBold, textTransform: "uppercase", letterSpacing: 0.6 },
  saveStateDirty: { color: "#F5A623" },
  saveStateSaving: { color: palette.info },
  saveStateError: { color: palette.red },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.green,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    height: 40,
    minWidth: 84,
    justifyContent: "center",
  },
  saveBtnText: { color: palette.white, fontSize: font.size.sm, fontFamily: font.family.bodyBold },
  doneBtn: { backgroundColor: "rgba(255,255,255,0.16)" },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  actionsSpacer: { flex: 1 },
  miniBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  miniBtnDisabled: { opacity: 0.3 },
  canvasWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  canvas: {
    width: "100%",
    maxHeight: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: radius.pill,
  },
  selectionType: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 6 },
  selectionSwatch: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.45)",
  },
  selectionText: {
    flexShrink: 1,
    color: "rgba(255,255,255,0.85)",
    fontSize: font.size.xs,
    fontFamily: font.family.bodyBold,
    letterSpacing: 0.2,
  },
  selectionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 8 },
  selectionIconBtn: { paddingVertical: 8, paddingHorizontal: 7 },
  selectionBtnText: { color: palette.white, fontSize: font.size.sm, fontFamily: font.family.bodyBold },
  styleBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  colorRow: { flexDirection: "row", gap: 9 },
  colorDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "rgba(255,255,255,0.25)" },
  colorDotActive: { borderColor: palette.white, transform: [{ scale: 1.18 }] },
  colorDotDisabled: { opacity: 0.3 },
  strokeRow: { flexDirection: "row", gap: 6 },
  strokeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  strokeBtnActive: { backgroundColor: palette.white },
  strokeBtnDisabled: { opacity: 0.3 },
  strokeDot: { backgroundColor: palette.white },
  strokeDotActive: { backgroundColor: palette.carbon },
  toolBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: spacing.sm,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  toolBtn: { alignItems: "center", gap: 3, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.sm, minWidth: 38 },
  toolBtnActive: { backgroundColor: palette.white },
  toolLbl: { color: "rgba(255,255,255,0.55)", fontSize: 9, fontFamily: font.family.bodyBold },
  toolLblActive: { color: palette.carbon },
  textModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  textModal: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  textModalTitle: { fontSize: font.size.lg, fontFamily: font.family.headingHeavy, color: palette.text, marginBottom: spacing.md },
  textModalInput: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: font.size.md,
    color: palette.text,
  },
  bgToggleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.md },
  bgToggleBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  bgToggleBoxOn: { backgroundColor: palette.green, borderColor: palette.green },
  bgToggleTextWrap: { flex: 1 },
  bgToggleLabel: { fontSize: font.size.sm, fontFamily: font.family.bodySemibold, color: palette.text },
  bgToggleSub: { fontSize: font.size.xs, color: palette.textMuted, marginTop: 1 },
  textModalHint: { fontSize: font.size.xs, color: palette.textFaint, marginTop: spacing.sm, lineHeight: 16 },
  textModalRow: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  textModalBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: radius.md },
  textModalPrimary: { backgroundColor: palette.carbon },
  textModalCancel: { color: palette.textMuted, fontFamily: font.family.bodyBold },
  textModalOk: { color: palette.white, fontFamily: font.family.bodyBold },
});
