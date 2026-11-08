import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "./SFIcon";
import { Glass } from "./Glass";
import { useTheme } from "../lib/theme";
import { tapHaptic, tickHaptic } from "../lib/motion";
import { REACTIONS, type Reaction } from "../lib/clubs";

export type MenuAction = { label: string; icon: string; run: () => void; destructive?: boolean };

/**
 * Long-press menu for a chat message, like iMessage: a row of reactions above a preview of the
 * message, and the actions below. Springs in; tap outside to close.
 */
export function MessageMenu({ visible, preview, mine, picked, onReact, actions, onClose }: {
  visible: boolean; preview: string; mine: boolean; picked?: Reaction[];
  onReact?: (r: Reaction) => void; actions: MenuAction[]; onClose: () => void;
}) {
  const t = useTheme();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) { tapHaptic(); a.setValue(0); Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 9 }).start(); }
  }, [visible]);
  const pop = { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.dim} onPress={onClose}>
        <Animated.View style={[{ alignSelf: mine ? "flex-end" : "flex-start", gap: 10, maxWidth: "86%" }, pop]}>
          {onReact && (
            <Glass style={styles.reactRow} interactive>
              {REACTIONS.map((r) => {
                const on = picked?.includes(r);
                return (
                  <Pressable key={r} onPress={() => { tickHaptic(); onReact(r); onClose(); }} hitSlop={4}
                    style={({ pressed }) => [styles.react, on && { backgroundColor: "rgba(252,227,138,0.55)" }, pressed && { transform: [{ scale: 1.25 }] }]}>
                    <Text style={{ fontSize: 26 }}>{r}</Text>
                  </Pressable>
                );
              })}
            </Glass>
          )}
          <View style={[styles.preview, { backgroundColor: mine ? "#1A1A1A" : t.bg }]}>
            <Text style={{ color: mine ? "#fff" : t.text, fontSize: 15.5, lineHeight: 21 }} numberOfLines={6}>{preview}</Text>
          </View>
          <Glass style={styles.actions}>
            {actions.map((x, i) => (
              <Pressable key={x.label} onPress={() => { onClose(); setTimeout(x.run, 220); }}
                style={({ pressed }) => [styles.action, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }, pressed && { backgroundColor: t.surface }]}>
                <Text style={{ flex: 1, color: x.destructive ? "#E5483D" : t.text, fontSize: 16, fontWeight: "600" }}>{x.label}</Text>
                <Ionicons name={x.icon as any} size={19} color={x.destructive ? "#E5483D" : t.text} />
              </Pressable>
            ))}
          </Glass>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** Reaction counts under a bubble. Tap one to add or remove yours. */
export function ReactionChips({ counts, mine, onToggle, alignEnd }: {
  counts: Partial<Record<Reaction, string[]>> | undefined; mine: Set<Reaction>; onToggle: (r: Reaction) => void; alignEnd?: boolean;
}) {
  const t = useTheme();
  const list = REACTIONS.filter((r) => counts?.[r]?.length);
  if (!list.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: -4, alignSelf: alignEnd ? "flex-end" : "flex-start", paddingHorizontal: 6 }}>
      {list.map((r) => {
        const on = mine.has(r);
        return (
          <Pressable key={r} onPress={() => { tickHaptic(); onToggle(r); }}
            style={[styles.chip, { backgroundColor: on ? "#FCE38A" : t.bg, borderColor: on ? "#E8C54A" : t.line }]}>
            <Text style={{ fontSize: 13 }}>{r}</Text>
            <Text style={{ color: on ? "#1A1A1A" : t.text, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{counts![r]!.length}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 18 },
  reactRow: { flexDirection: "row", gap: 2, padding: 6, borderRadius: 30 },
  react: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  preview: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  actions: { borderRadius: 16, minWidth: 230 },
  action: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, height: 48 },
  chip: { flexDirection: "row", alignItems: "center", gap: 3, height: 26, paddingHorizontal: 8, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth },
});
