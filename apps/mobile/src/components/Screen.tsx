import { router } from "expo-router";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F } from "../lib/theme";
import { CircleButton } from "./ui";

/** Solid strip behind the status bar so scrolled content never runs under the clock. */
export function StatusScrim() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: insets.top,
        backgroundColor: C.ink,
        opacity: 0.96,
      }}
    />
  );
}

/** Standard scrolling screen with a large title and optional back button. */
export function Screen({
  title,
  back,
  right,
  children,
  onRefresh,
  refreshing,
  bottomPad = 130,
}: {
  title?: string;
  eyebrow?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  bottomPad?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.ink }}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + bottomPad,
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={C.mint}
              colors={[C.mint]}
              progressBackgroundColor={C.ink2}
            />
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
      >
        {(title || back) && (
          <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                minHeight: 40,
              }}
            >
              {back ? (
                <CircleButton
                  icon="arrowLeft"
                  label="Back"
                  onPress={() =>
                    router.canGoBack() ? router.back() : router.replace("/")
                  }
                />
              ) : (
                <View />
              )}
              {right}
            </View>
            {title && (
              <Text
                style={{
                  color: C.chalk,
                  fontFamily: F.displayBold,
                  fontSize: 32,
                  letterSpacing: -0.6,
                  marginTop: 10,
                }}
              >
                {title}
              </Text>
            )}
          </View>
        )}
        {children}
      </ScrollView>
      <StatusScrim />
    </View>
  );
}
