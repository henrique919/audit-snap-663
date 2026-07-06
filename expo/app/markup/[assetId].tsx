/**
 * Photo Markup Studio — vector annotation editor.
 *
 * The original photo is never modified. Annotations are stored as normalised
 * vector JSON, rendered live via SVG, and a flattened copy is captured on
 * save for exports. One-tap tools, undo/redo, move/duplicate/delete, colour
 * and stroke controls, blur privacy mask, crop and rotate.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowUpRight,
  Check,
  Circle,
  Crop,
  Droplets,
  Eraser,
  MousePointer2,
  MessageCircleWarning,
  PenLine,
  Redo2,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
  Copy,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { arrowHeadPoints, strokePx } from "@/lib/annotationSvg";
import { cropWorkingImage, persistAnnotatedCapture, rotateWorkingImage } from "@/lib/files";
import { newId } from "@/lib/ids";
import { useAppStore } from "@/providers/AppStore";
import type { AnnotationElement } from "@/types/models";

type Tool = "select" | "arrow" | "ellipse" | "rect" | "pen" | "text" | "callout" | "blur" | "crop";

const STROKE_SIZES = [4, 8, 14] as const;
const TEXT_SIZES = [32, 44, 60] as const;

interface CanvasLayout {
  width: number;
  height: number;
}

function hitTest(el: AnnotationElement, x: number, y: number): boolean {
  const pad = 0.035;
  switch (el.type) {
    case "arrow": {
      const minX = Math.min(el.x1, el.x2) - pad;
      const maxX = Math.max(el.x1, el.x2) + pad;
      const minY = Math.min(el.y1, el.y2) - pad;
      const maxY = Math.max(el.y1, el.y2) + pad;
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    case "ellipse":
      return x >= el.cx - el.rx - pad && x <= el.cx + el.rx + pad && y >= el.cy - el.ry - pad && y <= el.cy + el.ry + pad;
    case "rect":
    case "blur":
      return x >= el.x - pad && x <= el.x + el.width + pad && y >= el.y - pad && y <= el.y + el.height + pad;
    case "pen": {
      return el.points.some((p) => Math.abs(p.x - x) < pad * 1.6 && Math.abs(p.y - y) < pad * 1.6);
    }
    case "text":
      return x >= el.x - pad && x <= el.x + 0.35 && y >= el.y - 0.07 && y <= el.y + pad;
    case "callout": {
      const r = 0.05;
      return Math.abs(el.cx - x) < r && Math.abs(el.cy - y) < r;
    }
  }
}

function translateElement(el: AnnotationElement, dx: number, dy: number): AnnotationElement {
  switch (el.type) {
    case "arrow":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "ellipse":
      return { ...el, cx: el.cx + dx, cy: el.cy + dy };
    case "rect":
    case "blur":
      return { ...el, x: el.x + dx, y: el.y + dy };
    case "pen":
      return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "text":
      return { ...el, x: el.x + dx, y: el.y + dy };
    case "callout":
      return { ...el, cx: el.cx + dx, cy: el.cy + dy };
  }
}

export default function MarkupStudio() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { db, saveAnnotation, updateAsset } = useAppStore();

  const asset = useMemo(() => db.assets.find((a) => a.id === assetId) ?? null, [db.assets, assetId]);
  const existing = useMemo(
    () => db.annotations.find((an) => an.assetId === assetId) ?? null,
    [db.annotations, assetId],
  );

  const [elements, setElements] = useState<AnnotationElement[]>(existing?.elements ?? []);
  const [undoStack, setUndoStack] = useState<AnnotationElement[][]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationElement[][]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState<string>(MARKUP_COLORS[0]);
  const [stroke, setStroke] = useState<number>(STROKE_SIZES[1]);
  const [textSize, setTextSize] = useState<number>(TEXT_SIZES[1]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftEl, setDraftEl] = useState<AnnotationElement | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);
  const [canvas, setCanvas] = useState<CanvasLayout>({ width: 0, height: 0 });
  const [workingUri, setWorkingUri] = useState<string | null>(null);
  const [workingDims, setWorkingDims] = useState<{ width: number; height: number } | null>(null);

  const canvasRef = useRef<View>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragBase = useRef<AnnotationElement | null>(null);
  const penPoints = useRef<{ x: number; y: number }[]>([]);

  const imageUri = workingUri ?? asset?.reportUri ?? "";
  const imgWidth = workingDims?.width ?? asset?.width ?? 1600;
  const imgHeight = workingDims?.height ?? asset?.height ?? 1200;

  const pushHistory = useCallback(
    (next: AnnotationElement[]) => {
      setUndoStack((prev) => [...prev, elements].slice(-40));
      setRedoStack([]);
      setElements(next);
      setDirty(true);
    },
    [elements],
  );

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setRedoStack((r) => [...r, elements]);
      setElements(last);
      setDirty(true);
      return prev.slice(0, -1);
    });
  }, [elements]);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setUndoStack((u) => [...u, elements]);
      setElements(last);
      setDirty(true);
      return prev.slice(0, -1);
    });
  }, [elements]);

  const nextCalloutNumber = useMemo(() => {
    const nums = elements.filter((e) => e.type === "callout").map((e) => (e.type === "callout" ? e.number : 0));
    return nums.length === 0 ? 1 : Math.max(...nums) + 1;
  }, [elements]);

  const norm = useCallback(
    (px: number, py: number) => ({
      x: Math.min(1, Math.max(0, px / Math.max(1, canvas.width))),
      y: Math.min(1, Math.max(0, py / Math.max(1, canvas.height))),
    }),
    [canvas],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const p = norm(locationX, locationY);
          dragStart.current = p;
          if (tool === "select") {
            const hit = [...elements].reverse().find((el) => hitTest(el, p.x, p.y));
            setSelectedId(hit?.id ?? null);
            dragBase.current = hit ?? null;
          } else if (tool === "pen") {
            penPoints.current = [p];
            setDraftEl({ id: "draft", type: "pen", points: [p], stroke: color, strokeWidth: stroke });
          } else if (tool === "arrow") {
            setDraftEl({ id: "draft", type: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y, stroke: color, strokeWidth: stroke });
          } else if (tool === "ellipse") {
            setDraftEl({ id: "draft", type: "ellipse", cx: p.x, cy: p.y, rx: 0, ry: 0, stroke: color, strokeWidth: stroke });
          } else if (tool === "rect") {
            setDraftEl({ id: "draft", type: "rect", x: p.x, y: p.y, width: 0, height: 0, stroke: color, strokeWidth: stroke });
          } else if (tool === "blur") {
            setDraftEl({ id: "draft", type: "blur", x: p.x, y: p.y, width: 0, height: 0, intensity: 18 });
          } else if (tool === "crop") {
            setCropRect({ x: p.x, y: p.y, width: 0, height: 0 });
          }
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const p = norm(locationX, locationY);
          const start = dragStart.current;
          if (!start) return;
          if (tool === "select") {
            const base = dragBase.current;
            if (base) {
              const dx = p.x - start.x;
              const dy = p.y - start.y;
              setElements((prev) => prev.map((el) => (el.id === base.id ? translateElement(base, dx, dy) : el)));
              setDirty(true);
            }
            return;
          }
          setDraftEl((prev) => {
            if (!prev) return prev;
            switch (prev.type) {
              case "arrow":
                return { ...prev, x2: p.x, y2: p.y };
              case "ellipse":
                return {
                  ...prev,
                  cx: (start.x + p.x) / 2,
                  cy: (start.y + p.y) / 2,
                  rx: Math.abs(p.x - start.x) / 2,
                  ry: Math.abs(p.y - start.y) / 2,
                };
              case "rect":
              case "blur":
                return {
                  ...prev,
                  x: Math.min(start.x, p.x),
                  y: Math.min(start.y, p.y),
                  width: Math.abs(p.x - start.x),
                  height: Math.abs(p.y - start.y),
                };
              case "pen": {
                penPoints.current = [...penPoints.current, p];
                return { ...prev, points: penPoints.current };
              }
              default:
                return prev;
            }
          });
          if (tool === "crop") {
            setCropRect({
              x: Math.min(start.x, p.x),
              y: Math.min(start.y, p.y),
              width: Math.abs(p.x - start.x),
              height: Math.abs(p.y - start.y),
            });
          }
        },
        onPanResponderRelease: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const p = norm(locationX, locationY);
          const start = dragStart.current;
          const isTap = start ? Math.abs(p.x - start.x) < 0.012 && Math.abs(p.y - start.y) < 0.012 : false;

          if (tool === "select") {
            if (dragBase.current && !isTap) {
              setUndoStack((prev) => [...prev, elements].slice(-40));
              setRedoStack([]);
            }
            dragBase.current = null;
            dragStart.current = null;
            return;
          }
          if (tool === "text" && isTap) {
            setTextPrompt(p);
            setTextValue("");
            dragStart.current = null;
            return;
          }
          if (tool === "callout" && isTap) {
            pushHistory([
              ...elements,
              { id: newId(), type: "callout", cx: p.x, cy: p.y, number: nextCalloutNumber, color, size: 64 },
            ]);
            dragStart.current = null;
            return;
          }
          if (tool === "crop") {
            dragStart.current = null;
            return;
          }
          setDraftEl((prev) => {
            if (prev && !isTap) {
              pushHistory([...elements, { ...prev, id: newId() }]);
            }
            return null;
          });
          penPoints.current = [];
          dragStart.current = null;
        },
      }),
    [tool, elements, color, stroke, norm, pushHistory, nextCalloutNumber],
  );

  if (!asset) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Photo not found.</Text>
      </View>
    );
  }

  const aspect = imgWidth / Math.max(1, imgHeight);

  const commitText = () => {
    if (textPrompt && textValue.trim()) {
      pushHistory([
        ...elements,
        { id: newId(), type: "text", x: textPrompt.x, y: textPrompt.y, text: textValue.trim(), color, fontSize: textSize },
      ]);
    }
    setTextPrompt(null);
    setTextValue("");
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory(elements.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    const el = elements.find((e) => e.id === selectedId);
    if (!el) return;
    const copy = { ...translateElement(el, 0.04, 0.04), id: newId() };
    pushHistory([...elements, copy]);
    setSelectedId(copy.id);
  };

  const clearAll = () => {
    if (elements.length === 0) return;
    Alert.alert("Clear all markup?", "All annotations on this photo will be removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => pushHistory([]) },
    ]);
  };

  const rotate = async () => {
    try {
      setSaving(true);
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
      pushHistory(elements.map(rotateEl));
      setDirty(true);
    } catch (e) {
      console.log("[markup] rotate failed", e);
      Alert.alert("Rotate failed", "Could not rotate this image.");
    } finally {
      setSaving(false);
    }
  };

  const applyCrop = async () => {
    if (!cropRect || cropRect.width < 0.05 || cropRect.height < 0.05) {
      Alert.alert("Draw a crop area", "Drag on the photo to select the area to keep.");
      return;
    }
    try {
      setSaving(true);
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
      pushHistory(elements.map(remap));
      setCropRect(null);
      setTool("select");
      setDirty(true);
    } catch (e) {
      console.log("[markup] crop failed", e);
      Alert.alert("Crop failed", "Could not crop this image.");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      let annotatedUri: string | null = null;
      if (Platform.OS !== "web" && canvasRef.current && elements.length > 0) {
        try {
          const tmp = await captureRef(canvasRef, { format: "jpg", quality: 0.9, result: "tmpfile" });
          annotatedUri = await persistAnnotatedCapture(tmp, asset.id);
        } catch (e) {
          console.log("[markup] flatten failed (annotation JSON still saved)", e);
        }
      }
      if (workingUri && workingDims) {
        updateAsset(asset.id, { reportUri: workingUri, width: workingDims.width, height: workingDims.height });
      }
      saveAnnotation(asset.id, asset.issueId, elements, annotatedUri);
      setDirty(false);
      router.back();
    } catch (e) {
      console.log("[markup] save failed", e);
      Alert.alert("Save failed", "Could not save markup. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty) {
      Alert.alert("Discard markup changes?", "You have unsaved annotation changes.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const renderElement = (el: AnnotationElement, w: number, h: number, isSelected: boolean) => {
    const common = { opacity: isSelected ? 0.85 : 1 };
    switch (el.type) {
      case "arrow": {
        const sw = strokePx(el.strokeWidth, w);
        const head = Math.max(10, sw * 3.4);
        return (
          <React.Fragment key={el.id}>
            <Line x1={el.x1 * w} y1={el.y1 * h} x2={el.x2 * w} y2={el.y2 * h} stroke={el.stroke} strokeWidth={sw} strokeLinecap="round" {...common} />
            <Polygon points={arrowHeadPoints(el.x1 * w, el.y1 * h, el.x2 * w, el.y2 * h, head)} fill={el.stroke} {...common} />
          </React.Fragment>
        );
      }
      case "ellipse":
        return (
          <Ellipse key={el.id} cx={el.cx * w} cy={el.cy * h} rx={el.rx * w} ry={el.ry * h} stroke={el.stroke} strokeWidth={strokePx(el.strokeWidth, w)} fill="none" {...common} />
        );
      case "rect":
        return (
          <Rect key={el.id} x={el.x * w} y={el.y * h} width={el.width * w} height={el.height * h} rx={4} stroke={el.stroke} strokeWidth={strokePx(el.strokeWidth, w)} fill="none" {...common} />
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
            {...common}
          />
        );
      case "text": {
        const fs = Math.max(10, (el.fontSize * w) / 1000);
        return (
          <SvgText key={el.id} x={el.x * w} y={el.y * h} fill={el.color} fontSize={fs} fontWeight="700" stroke="rgba(0,0,0,0.55)" strokeWidth={fs / 10} {...common}>
            {el.text}
          </SvgText>
        );
      }
      case "callout": {
        const r = Math.max(12, (el.size * w) / 1000 / 2);
        return (
          <React.Fragment key={el.id}>
            <SvgCircle cx={el.cx * w} cy={el.cy * h} r={r} fill={el.color} stroke="#FFFFFF" strokeWidth={r / 6} {...common} />
            <SvgText x={el.cx * w} y={el.cy * h + r * 0.38} fill="#FFFFFF" fontSize={r * 1.1} fontWeight="800" textAnchor="middle">
              {`${el.number}`}
            </SvgText>
          </React.Fragment>
        );
      }
      case "blur":
        return (
          <Rect key={el.id} x={el.x * w} y={el.y * h} width={el.width * w} height={el.height * h} rx={6} fill="#B9C2CF" opacity={0.97} />
        );
    }
  };

  const selectedEl = elements.find((e) => e.id === selectedId) ?? null;

  const tools: { key: Tool; icon: React.ReactNode; label: string }[] = [
    { key: "select", icon: <MousePointer2 color={tool === "select" ? palette.navy : palette.white} size={19} />, label: "Move" },
    { key: "arrow", icon: <ArrowUpRight color={tool === "arrow" ? palette.navy : palette.white} size={19} />, label: "Arrow" },
    { key: "ellipse", icon: <Circle color={tool === "ellipse" ? palette.navy : palette.white} size={19} />, label: "Circle" },
    { key: "rect", icon: <Square color={tool === "rect" ? palette.navy : palette.white} size={19} />, label: "Box" },
    { key: "pen", icon: <PenLine color={tool === "pen" ? palette.navy : palette.white} size={19} />, label: "Pen" },
    { key: "text", icon: <Type color={tool === "text" ? palette.navy : palette.white} size={19} />, label: "Text" },
    { key: "callout", icon: <MessageCircleWarning color={tool === "callout" ? palette.navy : palette.white} size={19} />, label: "Number" },
    { key: "blur", icon: <Droplets color={tool === "blur" ? palette.navy : palette.white} size={19} />, label: "Blur" },
    { key: "crop", icon: <Crop color={tool === "crop" ? palette.navy : palette.white} size={19} />, label: "Crop" },
  ];

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
            <TouchableOpacity style={[styles.topBtn, undoStack.length === 0 && styles.topBtnDisabled]} onPress={undo}>
              <Undo2 color={palette.white} size={19} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.topBtn, redoStack.length === 0 && styles.topBtnDisabled]} onPress={redo}>
              <Redo2 color={palette.white} size={19} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.topBtn} onPress={rotate}>
              <RotateCw color={palette.white} size={19} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.topBtn, elements.length === 0 && styles.topBtnDisabled]} onPress={clearAll}>
              <Eraser color={palette.white} size={19} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.topBtn, styles.saveBtn]} onPress={save} disabled={saving} testID="markup-save">
            {saving ? <ActivityIndicator color={palette.white} size="small" /> : <Check color={palette.white} size={20} />}
          </TouchableOpacity>
        </View>

        {/* Canvas */}
        <View style={styles.canvasWrap}>
          <View
            ref={canvasRef}
            collapsable={false}
            style={[styles.canvas, { aspectRatio: aspect }]}
            onLayout={(e) => setCanvas({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            <RNImage source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {canvas.width > 0 ? (
              <Svg width={canvas.width} height={canvas.height} style={StyleSheet.absoluteFill}>
                {elements.map((el) => renderElement(el, canvas.width, canvas.height, el.id === selectedId))}
                {draftEl ? renderElement(draftEl, canvas.width, canvas.height, false) : null}
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

        {/* Selection actions / crop confirm */}
        {tool === "crop" ? (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionText}>Drag to select crop area</Text>
            <TouchableOpacity style={styles.selectionBtn} onPress={applyCrop}>
              <Check color={palette.greenBright} size={16} />
              <Text style={[styles.selectionBtnText, { color: palette.greenBright }]}>Apply Crop</Text>
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
        ) : selectedEl && tool === "select" ? (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionText}>Selected: {selectedEl.type}</Text>
            <TouchableOpacity style={styles.selectionBtn} onPress={duplicateSelected}>
              <Copy color={palette.white} size={16} />
              <Text style={styles.selectionBtnText}>Duplicate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionBtn} onPress={deleteSelected}>
              <Trash2 color={palette.red} size={16} />
              <Text style={[styles.selectionBtnText, { color: palette.red }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.styleBar}>
            <View style={styles.colorRow}>
              {MARKUP_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>
            <View style={styles.strokeRow}>
              {(tool === "text" ? TEXT_SIZES : STROKE_SIZES).map((s, i) => {
                const active = tool === "text" ? textSize === s : stroke === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.strokeBtn, active && styles.strokeBtnActive]}
                    onPress={() => (tool === "text" ? setTextSize(s) : setStroke(s))}
                  >
                    <View
                      style={[
                        styles.strokeDot,
                        { width: 5 + i * 4, height: 5 + i * 4, borderRadius: (5 + i * 4) / 2 },
                        active && styles.strokeDotActive,
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Tool bar */}
        <View style={[styles.toolBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          {tools.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.toolBtn, tool === t.key && styles.toolBtnActive]}
              onPress={() => {
                setTool(t.key);
                setSelectedId(null);
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

      {/* Text entry modal */}
      <Modal visible={textPrompt !== null} transparent animationType="fade" onRequestClose={() => setTextPrompt(null)}>
        <View style={styles.textModalBackdrop}>
          <View style={styles.textModal}>
            <Text style={styles.textModalTitle}>Add label</Text>
            <TextInput
              style={styles.textModalInput}
              value={textValue}
              onChangeText={setTextValue}
              placeholder="e.g. Cracked tile"
              placeholderTextColor={palette.textFaint}
              autoFocus
              onSubmitEditing={commitText}
            />
            <View style={styles.textModalRow}>
              <TouchableOpacity style={styles.textModalBtn} onPress={() => setTextPrompt(null)}>
                <Text style={styles.textModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.textModalBtn, styles.textModalPrimary]} onPress={commitText}>
                <Text style={styles.textModalOk}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1526" },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: palette.textMuted },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  topCenter: { flexDirection: "row", gap: spacing.sm },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBtnDisabled: { opacity: 0.35 },
  saveBtn: { backgroundColor: palette.green },
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  selectionText: { flex: 1, color: palette.textFaint, fontSize: font.size.xs, fontWeight: font.weight.bold, textTransform: "capitalize" },
  selectionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 10 },
  selectionBtnText: { color: palette.white, fontSize: font.size.sm, fontWeight: font.weight.bold },
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
  strokeDot: { backgroundColor: palette.white },
  strokeDotActive: { backgroundColor: palette.navy },
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
  toolLbl: { color: "rgba(255,255,255,0.55)", fontSize: 9, fontWeight: font.weight.bold },
  toolLblActive: { color: palette.navy },
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
  textModalTitle: { fontSize: font.size.lg, fontWeight: font.weight.heavy, color: palette.text, marginBottom: spacing.md },
  textModalInput: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: font.size.md,
    color: palette.text,
  },
  textModalRow: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  textModalBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: radius.md },
  textModalPrimary: { backgroundColor: palette.navy },
  textModalCancel: { color: palette.textMuted, fontWeight: font.weight.bold },
  textModalOk: { color: palette.white, fontWeight: font.weight.bold },
});
