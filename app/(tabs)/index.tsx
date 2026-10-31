import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image as RNImage, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import MapView, { Circle, Marker, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetchChargers, isFast, speedLabel } from "../../lib/chargers";
import { fetchLiveStatus, fetchRatings, fetchSnaps, fetchZapBubbles } from "../../lib/community";
import { isConfigured, snapUrl } from "../../lib/supabase";
import { timeAgo } from "../../lib/geo";
import SnapViewer from "../../components/SnapViewer";
import { NETWORKS, OTHER, isOem, networkById } from "../../lib/networks";
import { distanceM, fmtDistance } from "../../lib/geo";
import { searchPlaces, type PlaceHit } from "../../lib/places";
import { STATUS_LABEL, statusColors, useTheme } from "../../lib/theme";
import { Chip, ClusterPin, Pin } from "../../components/ui";
import type { Charger, Checkin, LiveStatus } from "../../lib/types";
import { chargeMinutes, fitFor, fmtMinutes, reachKm, updateVehicle, usablePowerKW, useGarage } from "../../lib/vehicles";
import { NIGHT_STYLE } from "../../lib/mapStyle";

const INDIA: Region = { latitude: 21.5, longitude: 79, latitudeDelta: 24, longitudeDelta: 24 };
const MAP_TYPES = ["hybrid", "satellite", "standard"] as const;

export default function MapScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [lastLoad, setLastLoad] = useState<{ lat: number; lng: number } | null>(null);
  const [mapType, setMapType] = useState<(typeof MAP_TYPES)[number]>("hybrid");

  const [chargers, setChargers] = useState<Charger[]>([]);
  const [live, setLive] = useState<Record<string, LiveStatus>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [bubbles, setBubbles] = useState<Record<string, { count: number; photo: string }>>({});
  const [showZaps, setShowZaps] = useState(true);
  const [peek, setPeek] = useState<Charger | null>(null);
  const [peekZaps, setPeekZaps] = useState<Checkin[]>([]);
  const [viewer, setViewer] = useState<{ list: Checkin[]; start: number } | null>(null);
  const [bubbleTrack, setBubbleTrack] = useState(true);
  const [loading, setLoading] = useState(false);

  const [fastOnly, setFastOnly] = useState(false);
  const [workingOnly, setWorkingOnly] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // Station list sheet: 0 = just the header, 1 = a few rows, 2 = most of the screen.
  const [sheet, setSheet] = useState<0 | 1 | 2>(1);
  const { active: vehicle } = useGarage();
  const [fitsOnly, setFitsOnly] = useState(true);
  const [showRange, setShowRange] = useState(true);
  const [tilted, setTilted] = useState(false);
  const scheme = useColorScheme();
  const { height: screenH } = useWindowDimensions();
  const SHEET_H = [76, 170, Math.round(screenH * 0.62)] as const;
  const sheetPan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY([-12, 12])
    .onEnd((e) => {
      if (e.translationY > 40 || e.velocityY > 600) setSheet((v) => (v > 0 ? ((v - 1) as 0 | 1) : 0));
      else if (e.translationY < -40 || e.velocityY < -600) setSheet((v) => (v < 2 ? ((v + 1) as 1 | 2) : 2));
    });

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const picked = useRef<string | null>(null);

  const load = useCallback(async (lat: number, lng: number, km = 15) => {
    setLoading(true);
    setLastLoad({ lat, lng });
    const list = await fetchChargers(lat, lng, km);
    setChargers(list);
    setLoading(false);
    const ids = list.map((c) => c.id);
    fetchLiveStatus(ids).then(setLive).catch(() => {});
    fetchRatings(ids).then(setRatings).catch(() => {});
    fetchZapBubbles(ids).then((b) => {
      setBubbles(b);
      // Let bubble photos load into the markers, then stop re-rendering them for smooth panning.
      setBubbleTrack(true);
      setTimeout(() => setBubbleTrack(false), 2500);
    }).catch(() => {});
  }, []);

  // Live GPS.
  const watch = useRef<Location.LocationSubscription | null>(null);
  const startLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return false;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setMe(p);
    mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 600);
    load(p.lat, p.lng);
    if (!watch.current) {
      watch.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 50 }, (l) =>
        setMe({ lat: l.coords.latitude, lng: l.coords.longitude }),
      );
    }
    return true;
  }, [load]);
  useEffect(() => {
    startLocation();
    return () => { watch.current?.remove(); watch.current = null; };
  }, [startLocation]);

  // Place search, debounced.
  useEffect(() => {
    if (query.trim().length < 2 || query.startsWith("Near ") || query === picked.current) {
      setHits([]);
      setSearching(false);
      return;
    }
    picked.current = null;
    setSearching(true);
    let active = true;
    const id = setTimeout(async () => {
      const res = await searchPlaces(query, me ?? undefined);
      if (active) { setHits(res); setSearching(false); }
    }, 300);
    return () => { active = false; clearTimeout(id); };
  }, [query, me]);

  const from = origin ?? me;

  const shown = useMemo(() => {
    return chargers
      .filter((c) => !hidden.has(c.network))
      .filter((c) => !vehicle || !fitsOnly || fitFor(c, vehicle) !== "no")
      .filter((c) => !fastOnly || isFast(c))
      .filter((c) => !workingOnly || live[c.id]?.status === "working")
      .map((c) => ({ c, d: from ? distanceM(from.lat, from.lng, c.lat, c.lng) : 0 }))
      .sort((a, b) => a.d - b.d);
  }, [chargers, hidden, fastOnly, workingOnly, live, from, vehicle, fitsOnly]);

  const presentNetworks = useMemo(() => {
    const ids = new Set(chargers.map((c) => c.network));
    return [...NETWORKS, OTHER].filter((n) => ids.has(n.id));
  }, [chargers]);
  // Zoomed out: group nearby chargers into one bubble so the map stays readable.
  const clusters = useMemo(() => {
    if (!region || region.latitudeDelta < 0.22) return null;
    const cell = region.latitudeDelta / 7;
    const groups = new Map<string, { lat: number; lng: number; items: Charger[]; working: number }>();
    for (const { c } of shown) {
      const k = `${Math.floor(c.lat / cell)}:${Math.floor(c.lng / cell)}`;
      const g = groups.get(k) ?? { lat: 0, lng: 0, items: [], working: 0 };
      g.items.push(c); g.lat += c.lat; g.lng += c.lng;
      if (live[c.id]?.status === "working") g.working += 1;
      groups.set(k, g);
    }
    return [...groups.entries()].map(([k, g]) => ({ k, lat: g.lat / g.items.length, lng: g.lng / g.items.length, items: g.items, working: g.working }));
  }, [region, shown, live]);

  // The one charger worth going to right now: working, fits, fast and close.
  const best = useMemo(() => {
    if (!from) return null;
    const pool = shown.filter((x) => x.d < 20000 && live[x.c.id]?.status !== "broken" && (!vehicle || fitFor(x.c, vehicle) !== "no"));
    if (!pool.length) return null;
    const score = (x: typeof pool[number]) => {
      const kw = vehicle ? usablePowerKW(x.c, vehicle) : x.c.powerKW ?? (isFast(x.c) ? 30 : 7);
      const st = live[x.c.id]?.status;
      return (st === "working" ? 40 : st === "busy" ? 5 : 0) + Math.min(kw, 120) / 3 - x.d / 400 + (ratings[x.c.id] ?? 3.5) * 2;
    };
    return pool.reduce((a, b) => (score(b) > score(a) ? b : a));
  }, [shown, live, ratings, vehicle, from]);

  const sheetH = sheet === 1 && best ? 236 : SHEET_H[sheet];
  const presentOem = presentNetworks.filter((n) => n.oem);
  const oemOn = presentOem.some((n) => !hidden.has(n.id));
  const toggleOem = () => setHidden((s) => {
    const x = new Set(s);
    presentOem.forEach((n) => (oemOn ? x.add(n.id) : x.delete(n.id)));
    return x;
  });

  const showSearchArea = useMemo(() => {
    if (!region || !lastLoad || loading) return false;
    return distanceM(region.latitude, region.longitude, lastLoad.lat, lastLoad.lng) > 3000 && region.latitudeDelta < 1.2;
  }, [region, lastLoad, loading]);

  const pickPlace = (h: PlaceHit) => {
    Keyboard.dismiss();
    setHits([]);
    picked.current = h.title;
    setQuery(h.title);
    setOrigin({ lat: h.lat, lng: h.lng, label: h.title });
    mapRef.current?.animateToRegion({ latitude: h.lat, longitude: h.lng, latitudeDelta: 0.07, longitudeDelta: 0.07 }, 700);
    load(h.lat, h.lng);
  };

  const clearSearch = () => {
    setQuery("");
    setHits([]);
    setOrigin(null);
    if (me) {
      mapRef.current?.animateToRegion({ latitude: me.lat, longitude: me.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 600);
      load(me.lat, me.lng);
    }
  };

  const openCharger = (c: Charger) => router.push(`/charger/${encodeURIComponent(c.id)}`);
  const openPeek = (c: Charger) => {
    setPeek(c);
    setPeekZaps([]);
    fetchSnaps(c.id).then(setPeekZaps).catch(() => {});
  };
  const watchZaps = async (c: Charger) => {
    const list = peek?.id === c.id && peekZaps.length ? peekZaps : await fetchSnaps(c.id);
    if (list.length) setViewer({ list, start: 0 });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0B2440" }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={INDIA}
        mapType={mapType}
        customMapStyle={Platform.OS === "android" && mapType === "standard" && scheme === "dark" ? NIGHT_STYLE : undefined}
        userInterfaceStyle={scheme === "dark" ? "dark" : "light"}
        showsBuildings
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        showsPointsOfInterest={false}
        onRegionChangeComplete={setRegion}
        onPress={(e) => { if (e.nativeEvent.action !== "marker-press") setPeek(null); }}
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setOrigin({ lat: latitude, lng: longitude, label: "Dropped pin" });
          setQuery("Near dropped pin");
          load(latitude, longitude);
        }}
      >
        {origin && (
          <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} pinColor="red" title={origin.label} />
        )}
        {me && vehicle && showRange && (
          <Circle center={{ latitude: me.lat, longitude: me.lng }} radius={reachKm(vehicle) * 1000}
            strokeColor="rgba(255,214,10,0.9)" strokeWidth={2} fillColor="rgba(255,214,10,0.08)" />
        )}
        {clusters && clusters.map((g) => g.items.length === 1 ? null : (
          <Marker key={`cl-${g.k}-${g.items.length}-${g.working}`} coordinate={{ latitude: g.lat, longitude: g.lng }} tracksViewChanges={false}
            onPress={() => mapRef.current?.animateToRegion({ latitude: g.lat, longitude: g.lng, latitudeDelta: (region?.latitudeDelta ?? 1) / 3.5, longitudeDelta: (region?.longitudeDelta ?? 1) / 3.5 }, 450)}
            accessibilityLabel={`${g.items.length} chargers, ${g.working} working. Tap to zoom in.`}>
            <ClusterPin count={g.items.length} working={g.working} />
          </Marker>
        ))}
        {(clusters ? clusters.filter((g) => g.items.length === 1).map((g) => ({ c: g.items[0] })) : shown).map(({ c }) => (
          <Marker
            key={`${c.id}-${live[c.id]?.status ?? "none"}-${peek?.id === c.id ? "sel" : ""}-${vehicle?.key ?? ""}`}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            tracksViewChanges={false}
            onPress={() => openPeek(c)}
            accessibilityLabel={c.name}
          >
            <Pin network={c.network} status={live[c.id]?.status} selected={peek?.id === c.id} kw={c.powerKW} fits={!vehicle || fitFor(c, vehicle) !== "no"} />
          </Marker>
        ))}
        {showZaps && !clusters && shown.filter(({ c }) => bubbles[c.id]).map(({ c }) => (
          <Marker
            key={`zap-${c.id}`}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            anchor={{ x: 0.2, y: 1.45 }}
            centerOffset={{ x: 14, y: -52 }}
            tracksViewChanges={bubbleTrack}
            onPress={() => watchZaps(c)}
            zIndex={10}
            accessibilityLabel={`${bubbles[c.id].count} zaps at ${c.name}`}
          >
            <View style={styles.bubble}>
              <RNImage source={{ uri: snapUrl(bubbles[c.id].photo) }} style={styles.bubbleImg} />
              <View style={styles.bubbleCount}><Text style={{ color: "#14202B", fontWeight: "800", fontSize: 11 }}>{bubbles[c.id].count}</Text></View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Search bar, suggestions and filters */}
      <View style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, gap: 8 }}>
        {!isConfigured && (
          <View style={{ alignSelf: "center", backgroundColor: "rgba(20,32,43,0.9)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 }}>
            <Text style={{ color: "#FFD60A", fontSize: 12, fontWeight: "700" }}>Demo mode · Hyderabad chargers, sample status</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={[styles.search, { backgroundColor: t.bg }]}>
            <Ionicons name="search" size={18} color={t.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search a place, area or pincode"
              placeholderTextColor={t.faint}
              style={{ flex: 1, color: t.text, fontSize: 15 }}
              returnKeyType="search"
              onSubmitEditing={() => hits[0] && pickPlace(hits[0])}
              autoCorrect={false}
            />
            {searching ? <ActivityIndicator size="small" color={t.muted} /> : query ? (
              <Pressable onPress={clearSearch} accessibilityLabel="Clear search" hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={t.muted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setMapType(MAP_TYPES[(MAP_TYPES.indexOf(mapType) + 1) % MAP_TYPES.length])}
            style={[styles.round, { backgroundColor: t.bg }]}
            accessibilityLabel={`Map type: ${mapType}`}
          >
            <Ionicons name={mapType === "standard" ? "map-outline" : "earth"} size={20} color={t.text} />
          </Pressable>
          <Pressable onPress={() => router.push("/trip")} style={[styles.round, { backgroundColor: t.accent }]} accessibilityLabel="Plan a trip">
            <Ionicons name="git-branch-outline" size={20} color={t.bg} />
          </Pressable>
        </View>

        {hits.length > 0 ? (
          <View style={[styles.card, { backgroundColor: t.bg }]}>
            {hits.map((h, i) => (
              <Pressable key={h.id + i} onPress={() => pickPlace(h)}
                style={[styles.hit, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                <Ionicons name="location" size={20} color="#E5483D" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 15 }} numberOfLines={1}>{h.title}</Text>
                  {!!h.subtitle && <Text style={{ color: t.muted, fontSize: 12.5 }} numberOfLines={1}>{h.subtitle}</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
            {vehicle ? (
              <Chip label={`Fits ${vehicle.model}`} icon={vehicle.kind === "car" ? "car-sport" : "bicycle"} on={fitsOnly}
                onPress={() => setFitsOnly((v) => !v)} />
            ) : (
              <Chip label="Add your EV" icon="add-circle" on={false} onPress={() => router.push("/garage")} />
            )}
            <Chip label="Zaps" icon="camera" on={showZaps} onPress={() => setShowZaps((v) => !v)} />
            <Chip label="DC fast" icon="flash" on={fastOnly} onPress={() => setFastOnly((v) => !v)} />
            <Chip label="Working now" icon="checkmark-circle" on={workingOnly} onPress={() => setWorkingOnly((v) => !v)} />
            {presentOem.length > 0 && <Chip label="Brand chargers" icon="car-sport" on={oemOn} onPress={toggleOem} />}
            {presentNetworks.map((n) => (
              <Chip key={n.id} label={n.short} dot={n.color} on={!hidden.has(n.id)}
                onPress={() => setHidden((s) => { const x = new Set(s); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x; })} />
            ))}
          </ScrollView>
        )}

        {showSearchArea && hits.length === 0 && region && (
          <Pressable onPress={() => load(region.latitude, region.longitude, Math.max(5, Math.min(30, region.latitudeDelta * 55)))}
            style={[styles.pill, { backgroundColor: t.bg }]}>
            <Ionicons name="refresh" size={15} color={t.accent} />
            <Text style={{ color: t.accent, fontWeight: "600" }}>Search this area</Text>
          </Pressable>
        )}
      </View>

      {/* 3D tilt */}
      <Pressable
        onPress={() => { const next = !tilted; setTilted(next); mapRef.current?.animateCamera({ pitch: next ? 55 : 0 }, { duration: 500 }); }}
        style={[styles.round, { backgroundColor: tilted ? t.accent : t.bg, position: "absolute", right: 12, bottom: (peek ? 300 : sheetH + 12) + 56 }]}
        accessibilityLabel={tilted ? "Flat map" : "3D map"}
      >
        <Text style={{ color: tilted ? t.bg : t.text, fontWeight: "900", fontSize: 14 }}>3D</Text>
      </Pressable>

      {/* Range on the battery left */}
      {vehicle && me && !peek && (
        <View style={[styles.range, { backgroundColor: t.bg, bottom: sheetH + 12 }]}>
          <Pressable onPress={() => setShowRange((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            accessibilityLabel={showRange ? "Hide range ring" : "Show range ring"}>
            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#FFD60A", backgroundColor: showRange ? "rgba(255,214,10,0.3)" : "transparent" }} />
            <Text style={{ color: t.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>≈{Math.round(reachKm(vehicle))} km</Text>
          </Pressable>
          <Pressable onPress={() => updateVehicle(vehicle.key, { batteryPct: Math.max(10, (vehicle.batteryPct ?? 60) - 10) })} hitSlop={8} accessibilityLabel="Less battery">
            <Ionicons name="remove-circle-outline" size={22} color={t.muted} />
          </Pressable>
          <Text style={{ color: t.muted, fontWeight: "700", fontVariant: ["tabular-nums"], minWidth: 34, textAlign: "center" }}>{vehicle.batteryPct ?? 60}%</Text>
          <Pressable onPress={() => updateVehicle(vehicle.key, { batteryPct: Math.min(100, (vehicle.batteryPct ?? 60) + 10) })} hitSlop={8} accessibilityLabel="More battery">
            <Ionicons name="add-circle-outline" size={22} color={t.muted} />
          </Pressable>
        </View>
      )}

      {/* Locate me */}
      <Pressable
        onPress={() => (me ? clearSearch() : startLocation())}
        style={[styles.round, { backgroundColor: t.bg, position: "absolute", right: 12, bottom: peek ? 300 : sheetH + 12 }]}
        accessibilityLabel="Go to my location"
      >
        <Ionicons name="locate" size={21} color={t.accent} />
      </Pressable>

      {/* Preview card for a tapped charger, with zaps from the latest visits */}
      {peek && (() => {
        const n = networkById(peek.network);
        const st = live[peek.id];
        const sc = st ? statusColors(t)[st.status] : null;
        const d = from ? distanceM(from.lat, from.lng, peek.lat, peek.lng) : null;
        return (
          <View style={[styles.peek, { backgroundColor: t.bg }]}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: "800" }} numberOfLines={2}>{peek.name}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
                  {[n.short, d != null ? fmtDistance(d) : null, speedLabel(peek), ratings[peek.id] ? `★ ${ratings[peek.id].toFixed(1)}` : null].filter(Boolean).join(" · ")}
                </Text>
                <Text style={{ color: sc ? sc.fg : t.muted, fontWeight: "700", fontSize: 13 }}>
                  {st ? `${STATUS_LABEL[st.status]} · latest ${timeAgo(st.lastAt)}` : "No status reports yet"}
                </Text>
              </View>
              <Pressable onPress={() => setPeek(null)} hitSlop={10} accessibilityLabel="Close" style={[styles.close, { backgroundColor: t.surface }]}>
                <Ionicons name="close" size={18} color={t.text} />
              </Pressable>
            </View>
            {peekZaps.length > 0 ? (
              <>
                <Text style={{ color: t.muted, fontSize: 12.5, fontWeight: "700" }}>Zaps from the last visits</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {peekZaps.map((z, i) => (
                    <Pressable key={z.id} onPress={() => setViewer({ list: peekZaps, start: i })} style={styles.peekTile}>
                      {z.photo_path && <RNImage source={{ uri: snapUrl(z.photo_path) }} style={StyleSheet.absoluteFill} />}
                      <Text style={styles.peekAgo}>{timeAgo(z.created_at).replace(" ago", "")}</Text>
                      <Text style={styles.peekWho} numberOfLines={1}>{z.profiles?.display_name ?? "Driver"}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <Text style={{ color: t.muted, fontSize: 13.5 }}>No zaps here in the last 24 hours. Be the first to drop one.</Text>
            )}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => (peekZaps.length ? setViewer({ list: peekZaps, start: 0 }) : router.push(`/zap/${encodeURIComponent(peek.id)}`))}
                style={[styles.peekBtn, { backgroundColor: "#14202B" }]}
              >
                <Text style={{ color: "#FFD60A", fontWeight: "800" }}>{peekZaps.length ? `Watch ${peekZaps.length} zap${peekZaps.length > 1 ? "s" : ""}` : "Drop the first zap"}</Text>
              </Pressable>
              <Pressable onPress={() => openCharger(peek)} style={[styles.peekBtn, { backgroundColor: t.accent }]}>
                <Text style={{ color: t.bg, fontWeight: "800" }}>Open charger</Text>
              </Pressable>
            </View>
          </View>
        );
      })()}

      {viewer && <SnapViewer snaps={viewer.list} start={viewer.start} onClose={() => setViewer(null)} />}

      {/* Station list */}
      <View style={[styles.sheet, { backgroundColor: t.bg, height: sheetH, display: peek ? "none" : "flex" }]}>
        <GestureDetector gesture={sheetPan}>
        <View>
        <Pressable onPress={() => setSheet((v) => (v === 2 ? 0 : ((v + 1) as 1 | 2)))} style={{ alignItems: "center", paddingVertical: 10 }}
          accessibilityRole="button"
          accessibilityLabel={sheet === 2 ? "Hide the station list" : sheet === 0 ? "Show stations" : "Show all stations"}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: t.line }} />
        </Pressable>
        <Pressable onPress={() => setSheet((v) => (v === 0 ? 1 : v))}
          style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 6 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }} numberOfLines={1}>
            {origin ? `Near ${origin.label}` : "Near you"}
          </Text>
          {loading ? <ActivityIndicator size="small" color={t.muted} /> : (
            <Text style={{ color: t.muted, fontSize: 13 }}>
              {shown.length ? `${shown.length} chargers · nearest ${fmtDistance(shown[0].d)}` : from ? "No chargers found" : "Allow location or search"}
            </Text>
          )}
        </Pressable>
        </View>
        </GestureDetector>
        {best && sheet > 0 && (
          <Pressable onPress={() => openCharger(best.c)} style={[styles.best, { backgroundColor: "#14202B" }]} accessibilityLabel={`Best charger right now: ${best.c.name}`}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#FFD60A", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="trophy" size={17} color="#14202B" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: "#FFD60A", fontSize: 11.5, fontWeight: "800", letterSpacing: 0.4 }}>BEST RIGHT NOW</Text>
              <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1}>{best.c.name}</Text>
              <Text style={{ color: "#A9B3BC", fontSize: 12 }} numberOfLines={1}>
                {[
                  live[best.c.id]?.status === "working" ? `Working ${timeAgo(live[best.c.id]!.lastAt)}` : live[best.c.id] ? STATUS_LABEL[live[best.c.id]!.status] : "No reports yet",
                  fmtDistance(best.d),
                  vehicle ? `20→80% ≈ ${fmtMinutes(chargeMinutes(best.c, vehicle))}` : speedLabel(best.c),
                ].join(" · ")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#A9B3BC" />
          </Pressable>
        )}
        <FlatList
          data={shown}
          keyExtractor={(x) => x.c.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          renderItem={({ item: { c, d } }) => {
            const n = networkById(c.network);
            const st = live[c.id];
            const sc = st ? statusColors(t)[st.status] : null;
            return (
              <Pressable onPress={() => openCharger(c)} style={[styles.row, { borderTopColor: t.line }]}>
                <View style={[styles.dot, { backgroundColor: n.color }]}><Ionicons name="flash" size={15} color="#fff" /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.text, fontWeight: "600", fontSize: 15 }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: t.muted, fontSize: 12.5 }} numberOfLines={1}>
                    {[n.short, speedLabel(c), ratings[c.id] ? `★ ${ratings[c.id].toFixed(1)}` : null].filter(Boolean).join(" · ")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
                    {st && sc && <Text style={{ color: sc.fg, fontSize: 12, fontWeight: "600" }}>{STATUS_LABEL[st.status]} now</Text>}
                    {vehicle && fitFor(c, vehicle) !== "no" && (
                      <Text style={{ color: t.muted, fontSize: 12 }}>20→80% ≈ {fmtMinutes(chargeMinutes(c, vehicle))}</Text>
                    )}
                  </View>
                </View>
                <Text style={{ color: t.text, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{from ? fmtDistance(d) : ""}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: 24, paddingHorizontal: 14,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  round: {
    width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  card: { borderRadius: 16, overflow: "hidden", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8 },
  hit: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  pill: {
    alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6,
  },
  range: {
    position: "absolute", left: 12, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 40, borderRadius: 20,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  best: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginBottom: 4, padding: 10, borderRadius: 14 },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    elevation: 10, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  bubble: { width: 50, height: 50, borderRadius: 25, borderWidth: 3, borderColor: "#FFD60A", backgroundColor: "#14202B", padding: 0 },
  bubbleImg: { width: 44, height: 44, borderRadius: 22 },
  bubbleCount: { position: "absolute", right: -6, top: -6, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: "#FFD60A", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  peek: {
    position: "absolute", left: 10, right: 10, bottom: 12, borderRadius: 22, padding: 14, gap: 12,
    elevation: 12, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
  },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  peekTile: { width: 88, height: 118, borderRadius: 14, overflow: "hidden", backgroundColor: "#14202B" },
  peekAgo: { position: "absolute", top: 6, left: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, fontWeight: "700" },
  peekWho: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 7, paddingTop: 14, paddingBottom: 6, backgroundColor: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, fontWeight: "700" },
  peekBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
