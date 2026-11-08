/**
 * Night map for Google maps's standard view: dark land, muted roads, labels kept readable,
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
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#5A4E22" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#FCE38A" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1b26" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4b6478" }] },
];

/** zappd's own Google map look by day: warm paper land, quiet roads, lemon highways, no business clutter. */
export const DAY_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#F5F3EC" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6B6B66" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#F5F3EC" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#1A1A1A" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#8A8A83" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", stylers: [{ visibility: "on" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#DDEBD3" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#E6E2D6" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#FFFDF6" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#FCE38A" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#E8C95A" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#5A4A10" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#C9E2EA" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6E97A6" }] },
];
