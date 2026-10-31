import { Alert } from "react-native";
import { blockUser, report } from "../lib/community";

const REASONS = ["Spam or fake", "Offensive or abusive", "Shows a number plate or face", "Wrong information"];

/** Report and block options for any post or person. Required for App Store review of community apps. */
export function openSafetyMenu(opts: {
  kind: "checkin" | "review" | "food_tip" | "user";
  targetId: string;
  userId: string;
  userName: string;
  onDone?: () => void;
}) {
  Alert.alert("Report or block", undefined, [
    {
      text: "Report",
      onPress: () =>
        Alert.alert("Why are you reporting this?", undefined, [
          ...REASONS.map((r) => ({
            text: r,
            onPress: async () => {
              try {
                await report(opts.kind, opts.targetId, r);
                Alert.alert("Reported", "Thanks. Posts reported by several people are hidden automatically.");
              } catch (e: any) {
                Alert.alert("Report didn't send", e.message);
              }
            },
          })),
          { text: "Cancel", style: "cancel" as const },
        ]),
    },
    {
      text: `Block ${opts.userName}`,
      style: "destructive",
      onPress: async () => {
        try {
          await blockUser(opts.userId);
          Alert.alert("Blocked", `You won't see posts from ${opts.userName}.`);
          opts.onDone?.();
        } catch (e: any) {
          Alert.alert("Couldn't block", e.message);
        }
      },
    },
    { text: "Cancel", style: "cancel" },
  ]);
}
