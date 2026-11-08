import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, CTA, ON_CTA } from "../../lib/theme";
import { useAuth } from "../../lib/auth";
import { fetchClub, fetchMembers, myRole, removeMember, setRole, type Club, type ClubMember } from "../../lib/clubs";
import { Avatar } from "../../components/ui";
import { ClubBadge } from "../../components/ClubBadge";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** Who's in a club. Admins can promote, demote and remove members, and share the invite code. */
export default function ClubMembers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clubId = decodeURIComponent(id ?? "");
  const t = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [admin, setAdmin] = useState(false);

  const load = useCallback(async () => {
    const [c, m, r] = await Promise.all([fetchClub(clubId), fetchMembers(clubId), me ? myRole(clubId, me) : Promise.resolve(null)]);
    setClub(c); setMembers(m); setAdmin(r === "admin");
  }, [clubId, me]);
  useEffect(() => { load(); }, [load]);

  const invite = () => club?.invite_code && Share.share({
    message: `Join "${club.name}" on zingd ⚡\nOpen zingd → Clubs → Have an invite code? → ${club.invite_code}`,
  });

  const act = (m: ClubMember) => {
    if (!admin || m.user_id === me) return router.push(`/driver/${m.user_id}`);
    const name = m.profiles?.display_name ?? "this member";
    Alert.alert(name, undefined, [
      { text: "View profile", onPress: () => router.push(`/driver/${m.user_id}`) },
      m.role === "admin"
        ? { text: "Remove as admin", onPress: () => setRole(clubId, m.user_id, "member").then(load).catch((e) => Alert.alert("Couldn't change", e.message)) }
        : { text: "Make admin", onPress: () => setRole(clubId, m.user_id, "admin").then(load).catch((e) => Alert.alert("Couldn't change", e.message)) },
      { text: "Remove from club", style: "destructive", onPress: () => removeMember(clubId, m.user_id).then(load).catch((e) => Alert.alert("Couldn't remove", e.message)) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: "Members" }} />
      <FlatList
        data={members}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={club ? (
          <View style={{ alignItems: "center", gap: 8, paddingBottom: 16 }}>
            <ClubBadge c={club} size={72} />
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", textAlign: "center" }}>{club.name}</Text>
            {!!club.description && <Text style={{ color: t.muted, textAlign: "center", lineHeight: 20 }}>{club.description}</Text>}
            <Text style={{ color: t.muted, fontSize: 13 }}>
              {[club.city, `${club.members} members`, club.is_private ? "Invite only" : null].filter(Boolean).join(" · ")}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {admin && club.kind === "custom" && (
                <Pressable onPress={() => router.push({ pathname: "/club-edit", params: { id: club.id } })} style={[s.btn, { backgroundColor: t.surface }]}>
                  <Ionicons name="create-outline" size={16} color={t.text} /><Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Edit club</Text>
                </Pressable>
              )}
              {!!club.invite_code && (
                <Pressable onPress={invite} style={[s.btn, { backgroundColor: CTA }]}>
                  <Ionicons name="share-outline" size={16} color={ON_CTA} /><Text style={{ color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Invite · {club.invite_code}</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}
        renderItem={({ item: m }) => (
          <Pressable onPress={() => act(m)} style={[s.row, { borderTopColor: t.line }]}>
            <Avatar name={m.profiles?.display_name ?? "?"} photo={m.profiles?.avatar_path} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>{m.profiles?.display_name ?? "Driver"}{m.user_id === me ? " (you)" : ""}</Text>
              {!!m.profiles?.car_model && <Text style={{ color: t.muted, fontSize: 13 }}>{m.profiles.car_model}</Text>}
            </View>
            {m.role === "admin" && <View style={s.admin}><Text style={s.adminText}>Admin</Text></View>}
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  admin: { backgroundColor: LEMON, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  adminText: { color: INK, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 12 },
});
