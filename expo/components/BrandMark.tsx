/**
 * PunchThis Marked Frame symbol — camera capture frame with cobalt defect chip.
 * Renders logoUri when configured; otherwise the brand SVG mark.
 */

import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { BrandConfig } from "@/constants/config";
import { font, palette, radius } from "@/constants/theme";

type MarkVariant = "default" | "onInk" | "mono" | "inverse";

interface BrandMarkProps {
  size?: number;
  style?: ViewStyle;
  /** default = steel frame + cobalt chip on ink tile; onInk = mark only (no tile). */
  variant?: MarkVariant;
  /** When true, omit the rounded ink background (symbol only). */
  bare?: boolean;
}

function MarkSvg({
  size,
  frameColor,
  chipColor,
}: {
  size: number;
  frameColor: string;
  chipColor: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path
        d="M8 20 V14 a6 6 0 0 1 6-6 h6 M44 8 h6 a6 6 0 0 1 6 6 v6 M56 44 v6 a6 6 0 0 1 -6 6 h-6 M20 56 h-6 a6 6 0 0 1 -6-6 v-6"
        stroke={frameColor}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <Rect x={24} y={24} width={16} height={16} rx={4.5} fill={chipColor} />
    </Svg>
  );
}

export function BrandMark({ size = 40, style, variant = "default", bare = false }: BrandMarkProps) {
  const borderRadius = Math.round(size * 0.28);

  if (BrandConfig.logoUri) {
    return (
      <View style={[{ width: size, height: size, borderRadius, overflow: "hidden" }, style]}>
        <Image
          source={{ uri: BrandConfig.logoUri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          accessible={false}
        />
      </View>
    );
  }

  const frameColor =
    variant === "mono" ? palette.carbon : variant === "inverse" ? "rgba(255,255,255,0.55)" : "#8B97A1";
  const chipColor = variant === "mono" ? palette.carbon : variant === "inverse" ? palette.white : palette.cobalt;

  if (bare || variant === "onInk") {
    return (
      <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
        <MarkSvg size={size} frameColor={frameColor} chipColor={chipColor} />
      </View>
    );
  }

  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius }, style]}>
      <MarkSvg size={Math.round(size * 0.72)} frameColor={frameColor} chipColor={chipColor} />
    </View>
  );
}

/** Wordmark: Punch (700 ink) + This (400 steel). Never equal weight. */
export function BrandWordmark({
  size = 22,
  color,
  thisColor,
  style,
}: {
  size?: number;
  color?: string;
  thisColor?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "baseline" }, style]}>
      <Text
        style={{
          fontFamily: font.family.heading,
          fontSize: size,
          letterSpacing: size * -0.02,
          color: color ?? palette.text,
        }}
      >
        Punch
      </Text>
      <Text
        style={{
          fontFamily: font.family.headingRegular,
          fontSize: size,
          letterSpacing: size * -0.02,
          color: thisColor ?? palette.textSteel,
        }}
      >
        This
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: palette.carbon,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
});
