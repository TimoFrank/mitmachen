// Public subset for website usage.
// Only entries explicitly listed here are shown in #Mitmachen.
// Keep this list aligned with consent approvals.
window.MAP_PUBLIC_APPROVED_SOURCE_IDS = [
  "14",
  "15",
  "16",
  "20",
  "3",
  "24",
  "39",
  "80",
  "63",
  "66",
  "69",
  "96",
  "87",
  "53",
  "48",
  "2",
  "111",
  "102",
  "77",
  "90"
];

window.MAP_LOCATIONS_PUBLIC = (window.MAP_LOCATIONS || []).filter((entry) => {
  const sourceId = entry && entry.source_id != null ? String(entry.source_id) : "";
  return window.MAP_PUBLIC_APPROVED_SOURCE_IDS.includes(sourceId);
});
