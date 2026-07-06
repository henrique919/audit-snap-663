/** Brand logo placeholder — renders logoUri when configured, monogram tile otherwise. */

import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { BrandConfig } from "@/constants/config";
import { font, palette } from "@/constants/theme";

export function BrandMark({ size = 40, style }: { size?: number; style?: ViewStyle }) {
  const borderRadius = Math.round(size * 0.28);
  if (BrandConfig.logoUri) {
    return (
      <View style={[{ width: size, height: size, borderRadius, overflow: "hidden" }, style]}>
        <Image source={{ uri: BrandConfig.logoUri }} style={{ width: size, height: size }} contentFit="cover" />
      </View>
    );
  }
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius }, style]}>
      <Text style={[styles.monogram, { fontSize: size * 0.4 }]}>{BrandConfig.monogram}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: palette.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  monogram: {
    color: palette.white,
    fontWeight: font.weight.heavy,
    letterSpacing: 1,
  },
});
