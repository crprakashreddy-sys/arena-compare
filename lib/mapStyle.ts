/**
 * Night map for Android's standard view: dark land, muted roads, labels kept readable,
 * and businesses hidden so charger pins stand out. (iPhone switches Apple Maps to dark itself.)
 */
export const NIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1b2229" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa5b1" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#11161b" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d6dde4" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#1f2d24" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c3640" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1b2229" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a3f1a" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#e8c75a" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1b26" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4b6478" }] },
];
