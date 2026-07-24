  const MAP_PARAMS = new URLSearchParams(window.location.search);
  const MAP_MESSAGE_VERSION = 1;
  const MAP_MESSAGE_CHANNEL = String(MAP_PARAMS.get("channel") || "").trim();
  const ALLOWED_MAP_MESSAGE_CHANNELS = new Set(["contacts", "stakeholders"]);
  const sectorRegistry = window.VersorgungsCompassSectors || {
    normalizeSector: (value, fallback = "") => String(value || "").trim() || fallback,
    colorFor: () => "#64748b",
    labels: () => ["Praxis", "Krankenhaus", "Apotheke", "Pflege", "Krankenkasse", "Labor", "Physio / Heilmittel", "Hebammen", "Notfallversorgung", "Reha", "Hilfsmittel", "Sozialdienst", "ÖGD"],
    isExcludedSector: () => false,
    fallbackColor: "#64748b"
  };

  function hasMapCoordinates(entry) {
    return Number.isFinite(Number.parseFloat(entry?.lat ?? entry?.latitude ?? ""));
  }

  function loadCompassContacts() {
    // Embedded maps receive their records from the authenticated parent or the
    // standalone public demo via a validated same-origin postMessage payload.
    return [];
  }

  function firstSource(contact) {
    if (contact.url) return contact.url;
    if (Array.isArray(contact.sources) && contact.sources.length) return contact.sources[0];
    if (typeof contact.sources === "string" && contact.sources.trim()) return contact.sources.trim().split(/\s*\|\s*/)[0];
    return "";
  }

  function ownerLabelFromProfiles(ownerId) {
    return "";
  }

  function splitOwnerTokens(value) {
    if (Array.isArray(value)) return value.flatMap(splitOwnerTokens);
    if (value && typeof value === "object") return splitOwnerTokens(value.displayName || value.label || value.name || value.id || "");
    return String(value || "")
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function contactOwnerIds(contact) {
    const ids = Array.isArray(contact.ownerIds) ? contact.ownerIds : Array.isArray(contact.owner_ids) ? contact.owner_ids : [];
    const legacyId = contact.ownerId || contact.owner_id || "";
    return [...new Set([...ids, legacyId].map((id) => String(id || "").trim()).filter(Boolean))];
  }

  function contactOwnerLabels(contact) {
    const ownerObjects = Array.isArray(contact.owners) ? contact.owners : [];
    const labels = [
      ...ownerObjects.map((owner) => owner.displayName || owner.label || owner.name || ""),
      ...contactOwnerIds(contact).map(ownerLabelFromProfiles),
      ...splitOwnerTokens(contact.owner)
    ].map((label) => String(label || "").trim()).filter(Boolean);
    return [...new Set(labels)];
  }

  function toMapEntry(contact) {
    const lat = Number.parseFloat(contact.lat ?? contact.latitude ?? "");
    const lon = Number.parseFloat(contact.lon ?? contact.longitude ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const personName = String(contact.name || contact.organization || "Kontakt").trim();

    const ownerIds = contactOwnerIds(contact);
    const ownerLabels = contactOwnerLabels(contact);
    const ownerObjects = Array.isArray(contact.owners) ? contact.owners : [];
    const firstOwner = ownerObjects[0] || {};

    return {
      id: contact.id || `${personName}-${lat}-${lon}`,
      name: personName,
      organization: contact.organization || "",
      category: sectorRegistry.normalizeSector(contact.category || contact.sector || ""),
      city: contact.city || String(contact.location || "").replace(/^\d{5}\s*/, "") || "-",
      state: contact.state || "",
      location: contact.location || "",
      street: contact.street || "",
      postal_code: contact.postalCode || contact.postal_code || String(contact.location || "").match(/\b\d{5}\b/)?.[0] || "",
      lat,
      lon,
      mapPositionSource: contact.mapPositionSource || contact.map_position_source || "",
      url: firstSource(contact),
      description: contact.description || contact.topic || "",
      note: contact.note || contact.notes || "",
      person_name: personName,
      person_title: contact.specialty || contact.title || "",
      contact_role: contact.contactRole || contact.contact_role || contact.role || "",
      email: contact.email || "",
      phone: contact.phone || "",
      linkedin: contact.linkedin || "",
      priority: contact.priority || "",
      owner: ownerLabels.join(", "),
      ownerId: ownerIds[0] || contact.ownerId || contact.owner_id || "",
      ownerIds,
      ownerLabels,
      owners: ownerObjects,
      ownerAvatar: contact.ownerAvatar || contact.owner_avatar || contact.ownerAvatarUrl || firstOwner.avatarUrl || firstOwner.avatar_url || "",
      themes: Array.isArray(contact.themes) ? contact.themes : String(contact.themes || "").split(/\s*\|\s*/).filter(Boolean),
      image: contact.image || "",
      updatedAt: contact.updatedAt || contact.updated_at || contact.createdAt || contact.created_at || "",
      primary_system: "",
      dq_hint: "",
    };
  }

  const EMBED_MODE = MAP_PARAMS.get("embed") === "1";
  if (EMBED_MODE) document.body.classList.add("embed-mode");

  const BASE_DATA = loadCompassContacts().map(toMapEntry).filter(Boolean);
  let currentEntries = BASE_DATA.slice();
  let activeMapContext = MAP_PARAMS.get("context") === "stakeholders" ? "stakeholders" : "contacts";
  let activeMapLabels = {};
  let activeCurrentOwner = null;
  let showOwnerFilter = true;
  const CITY_LABELS = window.MAP_CITY_LABELS;
  const STATE_LABELS = window.MAP_STATE_LABELS;
  const STATE_POLYGONS = window.MAP_STATE_POLYGONS;
  const DE_GEOJSON = window.MAP_DE_GEOJSON;
  const AVATARS = {"Praxis": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%3E%0A%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2232%22%20fill%3D%22%231f77b4%22%20opacity%3D%220.18%22%2F%3E%0A%3Ccircle%20cx%3D%2232%22%20cy%3D%2226%22%20r%3D%2210%22%20fill%3D%22%231f77b4%22%20opacity%3D%220.52%22%2F%3E%0A%3Cpath%20d%3D%22M14%2054c3-10%2011-16%2018-16s15%206%2018%2016%22%20fill%3D%22none%22%20stroke%3D%22%231f77b4%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%20opacity%3D%220.52%22%2F%3E%0A%3Cpath%20d%3D%22M42%2018h6v6h-6zM44%2012h2v18h-2z%22%20fill%3D%22%231f77b4%22%20opacity%3D%220.48%22%2F%3E%0A%3C%2Fsvg%3E", "Krankenhaus": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%3E%0A%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2232%22%20fill%3D%22%23d62728%22%20opacity%3D%220.16%22%2F%3E%0A%3Cpath%20d%3D%22M20%2050V18c0-2%202-4%204-4h16c2%200%204%202%204%204v32%22%20fill%3D%22none%22%20stroke%3D%22%23d62728%22%20stroke-width%3D%225%22%20opacity%3D%220.52%22%2F%3E%0A%3Cpath%20d%3D%22M26%2024h6v6h-6zm0%2010h6v6h-6zm12-10h6v6h-6zm0%2010h6v6h-6z%22%20fill%3D%22%23d62728%22%20opacity%3D%220.45%22%2F%3E%0A%3Cpath%20d%3D%22M30%2018h4v6h6v4h-6v6h-4v-6h-6v-4h6z%22%20fill%3D%22%23d62728%22%20opacity%3D%220.50%22%2F%3E%0A%3C%2Fsvg%3E", "Apotheke": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%3E%0A%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2232%22%20fill%3D%22%232ca02c%22%20opacity%3D%220.16%22%2F%3E%0A%3Cpath%20d%3D%22M22%2022h20v20H22z%22%20fill%3D%22none%22%20stroke%3D%22%232ca02c%22%20stroke-width%3D%225%22%20opacity%3D%220.52%22%2F%3E%0A%3Cpath%20d%3D%22M30%2024h4v6h6v4h-6v6h-4v-6h-6v-4h6z%22%20fill%3D%22%232ca02c%22%20opacity%3D%220.50%22%2F%3E%0A%3Cpath%20d%3D%22M44%2022h2c2%200%204%202%204%204v16c0%202-2%204-4%204h-2%22%20fill%3D%22none%22%20stroke%3D%22%232ca02c%22%20stroke-width%3D%225%22%20opacity%3D%220.35%22%20stroke-linecap%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E", "Pflege": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%3E%0A%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2232%22%20fill%3D%22%239467bd%22%20opacity%3D%220.16%22%2F%3E%0A%3Ccircle%20cx%3D%2226%22%20cy%3D%2226%22%20r%3D%228%22%20fill%3D%22%239467bd%22%20opacity%3D%220.52%22%2F%3E%0A%3Ccircle%20cx%3D%2240%22%20cy%3D%2228%22%20r%3D%226%22%20fill%3D%22%239467bd%22%20opacity%3D%220.36%22%2F%3E%0A%3Cpath%20d%3D%22M14%2052c2-9%208-14%2012-14s10%205%2012%2014%22%20fill%3D%22none%22%20stroke%3D%22%239467bd%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20opacity%3D%220.52%22%2F%3E%0A%3Cpath%20d%3D%22M34%2052c1-7%205-11%208-11s7%204%208%2011%22%20fill%3D%22none%22%20stroke%3D%22%239467bd%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20opacity%3D%220.36%22%2F%3E%0A%3C%2Fsvg%3E"};

  // Minimal basemap WITHOUT labels; the CRM overlays carry the important information.
  const MAP_MIN_ZOOM = 6;
  const MOBILE_MAP_MIN_ZOOM = 5.5;
  const MAP_MAX_ZOOM = 11;
  const STATE_MAP_MAX_ZOOM = 12;
  const MAP_WHEEL_PX_PER_ZOOM = 140;
  const IS_PUBLIC_DEMO = window.VERSORGUNGS_COMPASS_CONFIG?.dataMode === "demo";
  function currentMapMinZoom(){
    return window.matchMedia('(max-width: 760px)').matches ? MOBILE_MAP_MIN_ZOOM : MAP_MIN_ZOOM;
  }
  const map = L.map('map', {
    zoomControl: true,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: MAP_WHEEL_PX_PER_ZOOM,
    maxBoundsViscosity: 1
  });

  if (!IS_PUBLIC_DEMO) {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: MAP_MAX_ZOOM,
      opacity: 0.58,
      attribution: '&copy; OpenStreetMap-Mitwirkende &copy; CARTO'
    }).addTo(map);
  }

  // ---- Build exact Germany mask (inverse polygon) ----
  function toLatLngs(ringLngLat){
    // ring is [ [lng,lat], ... ]
    return ringLngLat.map(pt => [pt[1], pt[0]]);
  }

  function germanyOuterRings(featureCollection){
    const geom = featureCollection.features[0].geometry;
    const holes = []; // each outer ring as a hole in the world polygon

    if (geom.type === "Polygon") {
      holes.push(toLatLngs(geom.coordinates[0]));
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates.forEach(poly => {
        // poly[0] is the outer ring
        holes.push(toLatLngs(poly[0]));
      });
    }
    return holes;
  }

  const worldRing = [[-90,-180],[-90,180],[90,180],[90,-180]];
  const holes = germanyOuterRings(DE_GEOJSON);

  // Keep neighboring countries as a soft orientation cue without making them the working context.
  const mask = L.polygon([worldRing, ...holes], {
    stroke: false,
    fillColor: '#f3f6fb',
    fillOpacity: 0.28,
    interactive: false
  }).addTo(map);

  // Germany outline and soft surface emphasis.
  const germanyLayer = L.geoJSON(DE_GEOJSON, {
    style: {
      color: 'rgba(23,39,95,0.30)',
      weight: 1.15,
      fillColor: 'rgba(238,244,255,0.78)',
      fillOpacity: 0.34
    },
    interactive: false
  }).addTo(map);

  const BASE_STATE_SURFACE_STYLE = {
    color: 'rgba(1,14,82,0.22)',
    weight: 0.85,
    fillColor: '#155fe4',
    fillOpacity: 0.16,
    opacity: 1
  };

  const stateSurfaceLayer = L.geoJSON(STATE_POLYGONS, {
    style: () => ({ ...BASE_STATE_SURFACE_STYLE }),
    interactive: false
  }).addTo(map);

  // Fit to Germany bounds and keep focus tight
  const deBounds = germanyLayer.getBounds();
  const initialGermanyPadding = window.matchMedia('(max-width: 760px)').matches ? 0.5 : 0.2;
  map.fitBounds(deBounds.pad(initialGermanyPadding));
  map.setZoom(Math.min(map.getZoom(), MAP_MAX_ZOOM));
  map.setMaxBounds(deBounds.pad(0.35));
  map.setMinZoom(currentMapMinZoom());
  map.setMaxZoom(MAP_MAX_ZOOM);

  // ---- Custom labels (major cities + state capitals) ----
  // Basemap is "nolabels" to reduce noise; we add a curated set for orientation.
  const majorLabelLayer = L.layerGroup().addTo(map);
  const capitalLabelLayer = L.layerGroup().addTo(map);
  const stateLabelLayer = L.layerGroup().addTo(map);
  const extraLabelLayer = L.layerGroup().addTo(map);
  const moreLabelLayer = L.layerGroup().addTo(map);
  let stateHeatLayer = null;
  const stateHeatCountLayer = L.layerGroup();
  let stateInteractionLayer = null;
  let heatMapActive = false;
  let gematikMarkerModeActive = true;
  let selectedState = "";
  let stateCountsByKey = {};
  let stateCountMax = 0;

  function fitMapToState(name){
    const feature = stateFeature(name);
    if (!feature) return;
    const bounds = L.geoJSON(feature).getBounds();
    map.fitBounds(bounds.pad(0.14), { animate: true });
  }

  function stateInteractionStyle(name, hover = false){
    const active = selectedState === name;
    if (gematikMarkerModeActive && !heatMapActive) {
      const total = stateCountsByKey[stateNameKey(name)] || 0;
      return {
        color: active ? '#010e52' : (hover ? '#010e52' : 'rgba(1,14,82,0.20)'),
        weight: active ? 2.6 : (hover ? 2 : 1.1),
        lineCap: 'round',
        lineJoin: 'round',
        fillColor: heatColor(total, stateCountMax),
        fillOpacity: 1,
        interactive: true
      };
    }
    return {
      color: active ? '#010e52' : (hover ? '#155fe4' : 'rgba(1,14,82,0.14)'),
      weight: active ? 2.6 : (hover ? 2 : 0.8),
      fillColor: active ? '#010e52' : '#155fe4',
      fillOpacity: active ? 0.34 : (hover ? 0.18 : 0.02),
      interactive: true
    };
  }

  function setStateLabelHover(name, highlighted){
    stateLabelLayer.eachLayer((labelMarker) => {
      const label = labelMarker.getElement()?.querySelector('.state-label');
      if (!label) return;
      const matchesState = label.dataset.state === String(name || "");
      label.classList.toggle('is-state-hovered', Boolean(highlighted && matchesState));
    });
  }

  function stateHoverTooltipHtml(name, total){
    const itemLabel = total === 1
      ? mapLabel("itemSingular", "Kontakt")
      : mapLabel("itemPlural", "Kontakte");
    return `<span class="state-hover-tooltip__name">${escapeHtml(name)}</span><span class="state-hover-tooltip__count">${total} ${escapeHtml(itemLabel)}</span>`;
  }

  function highlightContactState(name, highlighted){
    if (!stateInteractionLayer || !name || heatMapActive) return;
    setStateLabelHover(name, highlighted);
    stateInteractionLayer.eachLayer((layer) => {
      if (layer.feature?.properties?.name !== name) return;
      layer.setStyle(stateInteractionStyle(name, highlighted));
      if (highlighted && !L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
      }
    });
  }

  function refreshStateInteractionLayer(){
    if (stateInteractionLayer) {
      map.removeLayer(stateInteractionLayer);
      stateInteractionLayer = null;
    }

    stateInteractionLayer = L.geoJSON(STATE_POLYGONS, {
      pane: 'overlayPane',
      style: (feature) => stateInteractionStyle(feature.properties.name),
      onEachFeature: (feature, layer) => {
        const name = feature.properties.name;
        const total = stateCountsByKey[stateNameKey(name)] || 0;
        layer.bindTooltip(stateHoverTooltipHtml(name, total), {
          className: "state-heat-tooltip state-hover-tooltip",
          direction: "top",
          offset: [0, -12],
          sticky: true,
          opacity: 1
        });
        layer.on('mouseover', () => {
          if (heatMapActive) return;
          layer.setStyle(stateInteractionStyle(name, true));
          setStateLabelHover(name, true);
        });
        layer.on('mouseout', () => {
          if (!stateInteractionLayer) return;
          stateInteractionLayer.resetStyle(layer);
          layer.setStyle(stateInteractionStyle(name));
          setStateLabelHover(name, false);
        });
        layer.on('click', () => {
          const nextState = selectedState === name ? "" : name;
          setSelectedState(nextState);
        });
      }
    });

    if (!heatMapActive) {
      stateInteractionLayer.addTo(map);
    }
  }
  let stateMap = null;
  let stateMapTiles = null;
  let stateMapOutline = null;
  let stateMapMarkers = null;
  let stateMapMask = null;
  let stateMapGermanyOutline = null;
  let stateMapCityLabels = null;
  let stateMapStateLabel = null;

  function heatColor(value, max){
    if (max <= 0 || value <= 0) return "#f2f3f7";
    const ratio = Math.max(0, Math.min(1, value / max));
    const easedRatio = Math.pow(ratio, 0.72);
    const start = [231, 237, 248];
    const end = [1, 14, 82];
    const channel = (index) => Math.round(start[index] + ((end[index] - start[index]) * easedRatio));
    return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
  }

  function updateStateCounts(entries = currentEntries){
    stateCountsByKey = entries.reduce((acc, entry) => {
      const key = stateNameKey(entry.state);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    stateCountMax = Object.values(stateCountsByKey).reduce((acc, total) => Math.max(acc, total), 0);
  }

  function stateNameKey(value){
    return normalize(value)
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss");
  }

  function stateLabelPosition(name){
    const configured = STATE_LABELS.find((state) => state.name === name);
    if (configured) return [configured.lat, configured.lon];
    const feature = STATE_POLYGONS.features.find((entry) => entry.properties.name === name);
    if (!feature) return null;
    return L.geoJSON(feature).getBounds().getCenter();
  }

  function stateFeature(name){
    return STATE_POLYGONS.features.find((entry) => entry.properties.name === name) || null;
  }

  function stateLabelCorner(name){
    const feature = stateFeature(name);
    if (!feature) return null;
    const bounds = L.geoJSON(feature).getBounds();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();
    return [south + ((north - south) * 0.20), west + ((east - west) * 0.20)];
  }

  function stateLabelHtml(name, total = null, heat = false){
    const count = total && total > 0 ? `<span class="state-heat-count">${total}</span>` : "";
    const heatClass = heat ? " state-label-heat" : "";
    return `<div class="state-label-frame"><div class="state-label${heatClass}" data-state="${escapeHtml(name)}"><span class="state-label-text">${escapeHtml(name)}</span>${count}</div></div>`;
  }

  function buildStateHeatLayer(entries = currentEntries){
    if (stateHeatLayer) {
      stateHeatLayer.remove();
    }
    stateHeatCountLayer.clearLayers();
    updateStateCounts(entries);

    stateHeatLayer = L.geoJSON(STATE_POLYGONS, {
      smoothFactor: 0.35,
      style: (feature) => {
        const total = stateCountsByKey[stateNameKey(feature.properties.name)] || 0;
        const fill = heatColor(total, stateCountMax);
        return {
          color: 'rgba(1,14,82,0.20)',
          weight: 1.1,
          lineCap: 'round',
          lineJoin: 'round',
          fillColor: fill,
          fillOpacity: 1,
          interactive: true
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties.name;
        const total = stateCountsByKey[stateNameKey(name)] || 0;
        layer.bindTooltip(stateHoverTooltipHtml(name, total), {
          className: "state-heat-tooltip state-hover-tooltip",
          direction: "top",
          offset: [0, -12],
          sticky: true,
          opacity: 1
        });
        layer.on('click', () => {
          const nextState = selectedState === feature.properties.name ? "" : feature.properties.name;
          setSelectedState(nextState);
        });
        layer.on('mouseover', () => {
          layer.setStyle({
            weight: 2,
            color: '#010e52',
            fillColor: heatColor(total, stateCountMax),
            fillOpacity: 1
          });
          layer.bringToFront();
          layer.openTooltip();
        });
        layer.on('mouseout', () => {
          stateHeatLayer.resetStyle(layer);
          layer.closeTooltip();
        });
      }
    });

    if (heatMapActive) {
      stateHeatLayer.addTo(map);
    }
  }

  function labelIcon(text, cls){
    const isState = (cls === "state-label");
    const klass = isState ? "state-label" : ("city-label " + cls);
    return L.divIcon({
      className: '',
      html: isState
        ? `<div class="state-label-frame"><div class="${klass}" data-state="${escapeHtml(text)}"><span class="state-label-text">${escapeHtml(text)}</span></div></div>`
        : `<div class="label-anchor"><div class="${klass}">${escapeHtml(text)}</div></div>`,
      iconSize: isState ? [160, 42] : null,
      iconAnchor: isState ? [80, 21] : undefined
    });
  }

  function addLabels(){
    majorLabelLayer.clearLayers();
    capitalLabelLayer.clearLayers();
    stateLabelLayer.clearLayers();
    extraLabelLayer.clearLayers();
    moreLabelLayer.clearLayers();

    CITY_LABELS.major.forEach(c => {
      L.marker([c.lat, c.lon], {
        icon: labelIcon(c.name, "major"),
        interactive: false,
        keyboard: false
      }).addTo(majorLabelLayer);
    });

    CITY_LABELS.capitals.forEach(c => {
      L.marker([c.lat, c.lon], {
        icon: labelIcon(c.name, "capital"),
        interactive: false,
        keyboard: false
      }).addTo(capitalLabelLayer);
    });
    CITY_LABELS.extra.forEach(c => {
      L.marker([c.lat, c.lon], {
        icon: labelIcon(c.name, "extra"),
        interactive: false,
        keyboard: false
      }).addTo(extraLabelLayer);
    });
    CITY_LABELS.more.forEach(c => {
      L.marker([c.lat, c.lon], {
        icon: labelIcon(c.name, "more"),
        interactive: false,
        keyboard: false
      }).addTo(moreLabelLayer);
    });


    STATE_LABELS.forEach(s => {
      L.marker([s.lat, s.lon], {
        icon: labelIcon(s.name, "state-label"),
        interactive: false,
        keyboard: false,
        zIndexOffset: -50
      }).addTo(stateLabelLayer);
    });

  }

  function updateLabelVisibility(){
    const z = map.getZoom();
    const labelLayers = [stateLabelLayer, majorLabelLayer, capitalLabelLayer, extraLabelLayer, moreLabelLayer];

    if (heatMapActive) {
      [majorLabelLayer, capitalLabelLayer, extraLabelLayer, moreLabelLayer].forEach((layer) => {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      });
      return;
    }

    // Bundesland names are revealed contextually by the polygon hover tooltip.
    if (map.hasLayer(stateLabelLayer)) map.removeLayer(stateLabelLayer);

    if (z >= 7) {
      if (!map.hasLayer(majorLabelLayer)) map.addLayer(majorLabelLayer);
    } else {
      if (map.hasLayer(majorLabelLayer)) map.removeLayer(majorLabelLayer);
    }

    if (z >= 8) {
      if (!map.hasLayer(capitalLabelLayer)) map.addLayer(capitalLabelLayer);
    } else {
      if (map.hasLayer(capitalLabelLayer)) map.removeLayer(capitalLabelLayer);
    }

    if (z >= 9) {
      if (!map.hasLayer(extraLabelLayer)) map.addLayer(extraLabelLayer);
    } else {
      if (map.hasLayer(extraLabelLayer)) map.removeLayer(extraLabelLayer);
    }

    if (z >= 10) {
      if (!map.hasLayer(moreLabelLayer)) map.addLayer(moreLabelLayer);
    } else {
      if (map.hasLayer(moreLabelLayer)) map.removeLayer(moreLabelLayer);
    }
  }

  addLabels();
  updateLabelVisibility();
  map.on('zoomend', updateLabelVisibility);
  buildStateHeatLayer();



  // ---- Markers ----
  const markerLayer = L.layerGroup().addTo(map);

  const states = STATE_LABELS.map((state) => state.name);
  const STATE_FLAG_MARKUP = {
    Deutschland: '<rect width="18" height="4" fill="#1f2937"/><rect y="4" width="18" height="4" fill="#c8102e"/><rect y="8" width="18" height="4" fill="#f5c400"/>',
    "Baden-Württemberg": '<rect width="18" height="6" fill="#111827"/><rect y="6" width="18" height="6" fill="#f5cf27"/>',
    Bayern: '<rect width="18" height="6" fill="#ffffff"/><rect y="6" width="18" height="6" fill="#1f65ad"/>',
    Berlin: '<rect width="18" height="12" fill="#ffffff"/><rect width="18" height="2" fill="#d71920"/><rect y="10" width="18" height="2" fill="#d71920"/><circle cx="9" cy="6" r="1.3" fill="#1f2937"/>',
    Brandenburg: '<rect width="18" height="6" fill="#d71920"/><rect y="6" width="18" height="6" fill="#ffffff"/>',
    Bremen: '<rect width="18" height="12" fill="#d71920"/><path d="M0 2h18M0 6h18M0 10h18" stroke="#fff" stroke-width="2"/>',
    Hamburg: '<rect width="18" height="12" fill="#d71920"/><path d="M5 9V5h2V3h1v2h2V3h1v2h2v4z" fill="#fff"/>',
    Hessen: '<rect width="18" height="6" fill="#d71920"/><rect y="6" width="18" height="6" fill="#ffffff"/>',
    "Mecklenburg-Vorpommern": '<rect width="18" height="12" fill="#1f65ad"/><rect y="2.5" width="18" height="3" fill="#ffffff"/><rect y="5.5" width="18" height="1" fill="#f5c400"/><rect y="6.5" width="18" height="3" fill="#ffffff"/><rect y="9.5" width="18" height="2.5" fill="#d71920"/>',
    Niedersachsen: '<rect width="18" height="4" fill="#1f2937"/><rect y="4" width="18" height="4" fill="#c8102e"/><rect y="8" width="18" height="4" fill="#f5c400"/><circle cx="9" cy="6" r="2" fill="#ffffff"/>',
    "Nordrhein-Westfalen": '<rect width="6" height="12" fill="#159447"/><rect x="6" width="6" height="12" fill="#ffffff"/><rect x="12" width="6" height="12" fill="#d71920"/>',
    "Rheinland-Pfalz": '<rect width="18" height="4" fill="#1f2937"/><rect y="4" width="18" height="4" fill="#c8102e"/><rect y="8" width="18" height="4" fill="#f5c400"/><circle cx="4" cy="3" r="1.6" fill="#ffffff"/>',
    Saarland: '<rect width="18" height="4" fill="#1f2937"/><rect y="4" width="18" height="4" fill="#c8102e"/><rect y="8" width="18" height="4" fill="#f5c400"/><path d="M7 3h4v5H7z" fill="#2871b5" stroke="#fff" stroke-width=".6"/>',
    Sachsen: '<rect width="18" height="6" fill="#ffffff"/><rect y="6" width="18" height="6" fill="#159447"/>',
    "Sachsen-Anhalt": '<rect width="18" height="6" fill="#f5c400"/><rect y="6" width="18" height="6" fill="#111827"/>',
    "Schleswig-Holstein": '<rect width="18" height="4" fill="#1f65ad"/><rect y="4" width="18" height="4" fill="#ffffff"/><rect y="8" width="18" height="4" fill="#d71920"/>',
    Thüringen: '<rect width="18" height="6" fill="#ffffff"/><rect y="6" width="18" height="6" fill="#d71920"/>'
  };
  const priorityOrder = { Hoch: 0, Mittel: 1, Niedrig: 2, High: 0, Medium: 1, Low: 2 };

  function mapSourceEntries(){
    return EMBED_MODE ? currentEntries : BASE_DATA;
  }

  function uniqueSorted(values){
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));
  }

  function availableCategories(){
    const present = new Set(mapSourceEntries().map((entry) => entry.category).filter(Boolean));
    if (MAP_MESSAGE_CHANNEL === "stakeholders") return uniqueSorted([...present]);
    const canonical = sectorRegistry.labels();
    const extras = uniqueSorted([...present]
      .map((label) => sectorRegistry.normalizeSector(label, ""))
      .filter((label) => label && !canonical.includes(label) && !sectorRegistry.isExcludedSector(label)));
    return [...canonical, ...extras];
  }

  function availableOwners(){
    return uniqueSorted(mapSourceEntries().flatMap((entry) => ownerValuesForEntry(entry).filter((value) => !/^[0-9a-f-]{36}$/i.test(value))));
  }

  function initialsFromLabel(value) {
    const parts = String(value || "").replace(/\([^)]*\)/g, "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "OW";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function ownerEntryForValue(value) {
    const owner = String(value || "").trim();
    if (!owner) return null;
    return mapSourceEntries().find((entry) => ownerValuesForEntry(entry).includes(owner)) || null;
  }

  function ownerValuesForEntry(entry) {
    return [
      ...(Array.isArray(entry?.ownerLabels) ? entry.ownerLabels : []),
      ...(Array.isArray(entry?.ownerIds) ? entry.ownerIds : []),
      ...splitOwnerTokens(entry?.owner),
      entry?.ownerId
    ].map((value) => String(value || "").trim()).filter(Boolean);
  }

  function ownerAvatarContent(owner) {
    const entry = ownerEntryForValue(owner);
    const ownerObject = Array.isArray(entry?.owners)
      ? entry.owners.find((item) => [item.id, item.displayName, item.label, item.name].map((value) => String(value || "").trim()).includes(owner))
      : null;
    const label = ownerObject?.displayName || ownerObject?.label || ownerObject?.name || owner;
    const avatarUrl = safeImageUrl(ownerObject?.avatarUrl || ownerObject?.avatar_url || entry?.ownerAvatar);
    if (avatarUrl) {
      return `<img src="${escapeHtml(avatarUrl)}" alt="" loading="lazy">`;
    }
    return escapeHtml(initialsFromLabel(label));
  }

  function mapFilterValueMarkup(label, iconMarkup = "") {
    return `<span class="map-filter-value">${iconMarkup}<span class="map-filter-value__label">${escapeHtml(label)}</span></span>`;
  }

  function sectorFilterIcon(value) {
    const sector = String(value || "").trim();
    if (!sector) return '<span class="map-filter-sector-dot is-all" aria-hidden="true"></span>';
    return `<span class="map-filter-sector-dot" style="--filter-sector-color:${escapeHtml(sectorRegistry.colorFor(sector))}" aria-hidden="true"></span>`;
  }

  function stateFlagIcon(value) {
    const state = String(value || "").trim();
    const flagMarkup = STATE_FLAG_MARKUP[state] || STATE_FLAG_MARKUP.Deutschland;
    return `<span class="map-filter-state-flag" aria-hidden="true"><svg viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg" focusable="false">${flagMarkup}</svg></span>`;
  }

  function ownerFilterAvatarIcon(value) {
    const owner = String(value || "").trim();
    if (owner) {
      return `<span class="map-filter-owner-avatar" aria-hidden="true">${ownerFilterAvatarContent(owner)}</span>`;
    }
    const owners = orderedOwnerFilterValues(availableOwners());
    const visibleOwners = owners.slice(0, 3);
    const remaining = Math.max(0, owners.length - visibleOwners.length);
    return `<span class="map-filter-owner-stack" aria-hidden="true">
      ${visibleOwners.map((label) => `<span class="map-filter-owner-avatar">${ownerFilterAvatarContent(label)}</span>`).join("")}
      ${remaining ? `<span class="map-filter-owner-avatar is-more">+${remaining}</span>` : ""}
    </span>`;
  }

  function normalizedOwnerValue(value) {
    return String(value || "").trim().toLocaleLowerCase("de");
  }

  function isCurrentOwnerValue(value) {
    const needle = normalizedOwnerValue(value);
    if (!needle || !activeCurrentOwner) return false;
    return [activeCurrentOwner.id, activeCurrentOwner.displayName, activeCurrentOwner.label, activeCurrentOwner.name, activeCurrentOwner.email]
      .some((candidate) => normalizedOwnerValue(candidate) === needle);
  }

  function orderedOwnerFilterValues(values) {
    return [...values].sort((left, right) => {
      const currentOwnerOrder = Number(isCurrentOwnerValue(right)) - Number(isCurrentOwnerValue(left));
      return currentOwnerOrder || left.localeCompare(right, "de");
    });
  }

  function ownerFilterAvatarContent(owner) {
    if (isCurrentOwnerValue(owner)) {
      const avatarUrl = safeImageUrl(activeCurrentOwner?.avatarUrl || activeCurrentOwner?.avatar_url);
      if (avatarUrl) return `<img src="${escapeHtml(avatarUrl)}" alt="" loading="lazy">`;
      return escapeHtml(initialsFromLabel(activeCurrentOwner?.displayName || activeCurrentOwner?.label || owner));
    }
    return ownerAvatarContent(owner);
  }

  function buildFilterListSeparator(categories) {
    const separator = document.createElement("div");
    separator.className = "filter-list-separator";
    separator.setAttribute("aria-hidden", "true");
    const dots = categories.slice(0, 5).map((category) => (
      `<span class="filter-list-separator__dot" style="--filter-sector-color:${escapeHtml(sectorRegistry.colorFor(category))}"></span>`
    )).join("");
    separator.innerHTML = `<span class="filter-list-separator__dots">${dots}</span>`;
    return separator;
  }

  function ownerPillHtml(entry) {
    const labels = (Array.isArray(entry?.ownerLabels) && entry.ownerLabels.length ? entry.ownerLabels : splitOwnerTokens(entry?.owner)).filter(Boolean);
    if (!labels.length) return "";
    const visible = labels.slice(0, 2);
    const remaining = Math.max(0, labels.length - visible.length);
    return `
      ${visible.map((label) => `
        <span class="owner-pill">
          <span class="owner-pill-avatar" aria-hidden="true">${ownerAvatarContent(label)}</span>
          <span class="owner-pill-label">${escapeHtml(label)}</span>
        </span>
      `).join("")}
      ${remaining ? `<span class="owner-pill"><span class="owner-pill-label">+${remaining}</span></span>` : ""}
    `;
  }

  function sectorIconSvg(category) {
    const key = String(category || "").toLowerCase();
    if (key.includes("labor")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6"></path><path d="M10 3v5l-4 8a3 3 0 0 0 2.7 4.3h6.6A3 3 0 0 0 18 16l-4-8V3"></path><path d="M8 15h8"></path></svg>`;
    }
    if (key.includes("therapie")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="M8 8v8"></path><path d="M16 8v8"></path><path d="M6 17c2 2 10 2 12 0"></path></svg>`;
    }
    if (key.includes("hebamme")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10c0-2.8 2.2-5 5-5s5 2.2 5 5c0 4-5 8-5 8s-5-4-5-8Z"></path><circle cx="12" cy="10" r="2"></circle></svg>`;
    }
    if (key.includes("rettung") || key.includes("notfall")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17V8h10l3 4h3v5"></path><path d="M8 17a2 2 0 1 0 0 .1"></path><path d="M17 17a2 2 0 1 0 0 .1"></path><path d="M8 11h4"></path><path d="M10 9v4"></path></svg>`;
    }
    if (key.includes("reha")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c4-8 8-12 12-14"></path><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>`;
    }
    if (key.includes("krankenkasse")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 7.6 7 10 4-2.4 7-5.5 7-10V6z"></path><path d="M9 12h6"></path><path d="M12 9v6"></path></svg>`;
    }
    if (key.includes("krankenhaus")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16"></path><path d="M6 20V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14"></path><path d="M9 10h6"></path><path d="M12 7v6"></path><path d="M9 20v-4h6v4"></path></svg>`;
    }
    if (key.includes("apotheke")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21h10"></path><path d="M8 21V8h8v13"></path><path d="M10 4h4v4h-4z"></path><path d="M10 14h4"></path><path d="M12 12v4"></path></svg>`;
    }
    if (key.includes("pflege")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11c0-2 1.5-3.5 3.5-3.5 1.1 0 2.1.5 2.8 1.3.7-.8 1.7-1.3 2.8-1.3 2 0 3.5 1.5 3.5 3.5 0 4-6.3 7.5-6.3 7.5S7 15 7 11Z"></path><path d="M4 13h3"></path><path d="M17 13h3"></path></svg>`;
    }
    if (key.includes("praxis")) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><path d="M4 20c0-3 2.2-5 5-5"></path><path d="M16 11v6"></path><path d="M13 14h6"></path></svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>`;
  }

  function sectorFilterContent(label) {
    return `<span class="category-chip-icon" aria-hidden="true">${sectorIconSvg(label)}</span><span class="category-chip-label">${escapeHtml(label)}</span>`;
  }

  function availablePriorities(){
    return uniqueSorted(mapSourceEntries().map((entry) => entry.priority)).sort((a, b) => {
      return (priorityOrder[a] ?? 10) - (priorityOrder[b] ?? 10) || a.localeCompare(b, "de");
    });
  }

  let activeCategoryFilter = "";
  let activeOwnerFilter = "";
  let activePriorityFilter = "";
  let query = "";
  let activeMapContactId = "";
  let mapMovedForActiveContact = false;
  let clusterModeActive = false;
  let currentListPage = 1;
  const mobileListPageSize = 5;
  let lastMobileLayout = window.matchMedia('(max-width: 760px)').matches;
  let resizeListFrame = 0;

  function mapLabel(key, fallback) {
    return activeMapLabels?.[key] || fallback;
  }

  const elFilters = document.getElementById('filters');
  const elMobileMapFilters = document.getElementById('mobile-map-filter-group');
  const elSearch = document.getElementById('search');
  const elList = document.getElementById('list');
  const elMapPagination = document.getElementById('map-pagination');
  const elCount = document.getElementById('count');
  const elPanelTitle = document.querySelector('.panel-title');
  const elMarkerToggle = document.getElementById('marker-toggle');
  const elHeatMapToggle = document.getElementById('heatmap-toggle');
  const elPointsToggle = document.getElementById('points-toggle');
  const elClusterToggle = document.getElementById('cluster-toggle');
  const elMapResetToggle = document.getElementById('map-reset-toggle');
  const elMapResetLabel = document.getElementById('map-reset-label');
  const elStateFilterToggle = document.getElementById('state-filter-toggle');
  const elStateFilterLabel = document.getElementById('state-filter-label');
  const elStateFilterMenu = document.getElementById('state-filter-menu');
  const elStateView = document.getElementById('state-view');
  const elStateViewTitle = document.getElementById('state-view-title');
  const elStateViewMeta = document.getElementById('state-view-meta');
  const elStateViewClose = document.getElementById('state-view-close');
  const elStateViewFilterToggle = document.getElementById('state-view-filter-toggle');
  const elStateViewFilterLabel = document.getElementById('state-view-filter-label');
  const elStateFilterDropdown = document.querySelector('.map-dropdown');
  const elStateViewFilter = document.querySelector('.state-view-filter');
  const elSidebar = document.querySelector('.sidebar');
  const elMobileSheetToggle = document.getElementById('mobile-sheet-toggle');
  const elMobileSheetCount = document.getElementById('mobile-sheet-count');
  const elMobileSheetMeta = document.getElementById('mobile-sheet-meta');
  const elMobileMapPreview = document.getElementById('mobile-map-preview');
  const elMapActiveFilters = document.getElementById('map-active-filters');
  const elMapLegendList = document.getElementById('map-legend-list');
  const elWorkspace = document.querySelector('.workspace');
  const elMapDetailPanel = document.getElementById('map-detail-panel');
  const elMapListToggle = document.getElementById('map-list-toggle');
  const elMobileQuickFilters = document.getElementById('mobile-map-quick-filters');

  let mobileSheetState = 'collapsed';
  let mobilePreviewContactId = "";
  let mapDetailActiveTab = "overview";
  let mapListCollapsed = false;

  function normalize(s){ return (s || "").toString().toLowerCase(); }
  function escapeHtml(value){
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function safeImageUrl(value){
    const candidate = String(value || "").trim();
    if (!candidate || /[\u0000-\u001f\u007f]/.test(candidate)) return "";
    if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(candidate) && candidate.length <= 3_000_000) {
      return candidate;
    }
    try {
      const parsed = new URL(candidate, window.location.href);
      const localHttp = parsed.protocol === "http:" && parsed.origin === window.location.origin;
      if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password) return "";
      return parsed.href;
    } catch (_error) {
      return "";
    }
  }
  function safeNavigationUrl(value){
    const candidate = String(value || "").trim();
    if (!candidate || /[\u0000-\u001f\u007f]/.test(candidate)) return "";
    if (/^(?:mailto|tel):/i.test(candidate)) return candidate;
    try {
      const parsed = new URL(candidate, window.location.href);
      const localHttp = parsed.protocol === "http:" && parsed.origin === window.location.origin;
      if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password) return "";
      return parsed.href;
    } catch (_error) {
      return "";
    }
  }
  function boundedMapText(value, maximum = 500){
    return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, maximum);
  }
  function isPlainRecord(value){
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function sanitizeOwnerSummary(value){
    if (!isPlainRecord(value)) return null;
    return {
      id: boundedMapText(value.id, 160),
      displayName: boundedMapText(value.displayName || value.display_name, 240),
      label: boundedMapText(value.label, 240),
      name: boundedMapText(value.name, 240),
      email: boundedMapText(value.email, 320),
      avatarUrl: safeImageUrl(value.avatarUrl || value.avatar_url)
    };
  }
  function sanitizeMapContact(value){
    if (!isPlainRecord(value)) return null;
    const id = boundedMapText(value.id, 160).trim();
    const latitude = Number.parseFloat(value.lat ?? value.latitude ?? "");
    const longitude = Number.parseFloat(value.lon ?? value.longitude ?? "");
    if (!id || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return null;
    }
    const text = (key, maximum = 500) => boundedMapText(value[key], maximum);
    const ownerIds = Array.isArray(value.ownerIds) ? value.ownerIds.slice(0, 20).map((item) => boundedMapText(item, 160)).filter(Boolean) : [];
    const owners = Array.isArray(value.owners) ? value.owners.slice(0, 20).map(sanitizeOwnerSummary).filter(Boolean) : [];
    const themes = Array.isArray(value.themes) ? value.themes.slice(0, 50).map((item) => boundedMapText(item, 160)).filter(Boolean) : [];
    const sources = Array.isArray(value.sources)
      ? value.sources.slice(0, 20).map((item) => boundedMapText(item, 2_000)).filter(Boolean)
      : boundedMapText(value.sources, 4_000);
    return {
      id,
      name: text("name", 300),
      honorificTitle: text("honorificTitle", 120),
      specialty: text("specialty", 240),
      contactRole: text("contactRole", 240),
      category: text("category", 120),
      organization: text("organization", 300),
      topic: text("topic", 1_000),
      priority: text("priority", 80),
      email: text("email", 320),
      phone: text("phone", 120),
      linkedin: safeNavigationUrl(value.linkedin),
      location: text("location", 300),
      city: text("city", 160),
      state: text("state", 120),
      street: text("street", 240),
      postalCode: text("postalCode", 40),
      url: safeNavigationUrl(value.url),
      description: text("description", 2_000),
      lat: latitude,
      lon: longitude,
      mapPositionSource: text("mapPositionSource", 80),
      note: text("note", 4_000),
      nextStep: text("nextStep", 2_000),
      image: safeImageUrl(value.image),
      owner: text("owner", 500),
      ownerId: text("ownerId", 160),
      ownerIds,
      owners,
      ownerAvatar: safeImageUrl(value.ownerAvatar),
      themes,
      sources
    };
  }
  function sanitizeMapDataMessage(event){
    if (!EMBED_MODE || window.parent === window || event.source !== window.parent || event.origin !== window.location.origin) return null;
    if (!ALLOWED_MAP_MESSAGE_CHANNELS.has(MAP_MESSAGE_CHANNEL)) return null;
    const data = event.data;
    if (!isPlainRecord(data) || data.type !== "versorgungs-kompass-map-data" || data.version !== MAP_MESSAGE_VERSION || data.channel !== MAP_MESSAGE_CHANNEL) return null;
    const expectedContext = MAP_MESSAGE_CHANNEL === "stakeholders" ? "stakeholders" : "contacts";
    if ((data.context || "contacts") !== expectedContext || !Array.isArray(data.contacts) || data.contacts.length > 5_000) return null;
    const allowedLabelKeys = new Set(["itemSingular", "itemPlural", "listTitle", "searchPlaceholder", "categoryLabel", "categoryAllLabel", "openDetailLabel", "previewKicker", "emptyTitle", "descriptionFallback"]);
    const labels = {};
    if (isPlainRecord(data.labels)) {
      Object.entries(data.labels).forEach(([key, value]) => {
        if (allowedLabelKeys.has(key)) labels[key] = boundedMapText(value, 240);
      });
    }
    const currentOwner = isPlainRecord(data.currentOwner) ? sanitizeOwnerSummary(data.currentOwner) : null;
    return {
      context: expectedContext,
      labels,
      currentOwner,
      showOwnerFilter: data.showOwnerFilter !== false,
      contacts: data.contacts.map(sanitizeMapContact).filter(Boolean)
    };
  }
  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const parent = image.parentElement;
    const fallback = boundedMapText(image.dataset.imageFallback, 12);
    image.remove();
    if (parent && fallback) parent.textContent = fallback;
  }, true);
  function hasValue(value){ return String(value || "").trim().length > 0; }
  function initials(value){
    const parts = String(value || "VK").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "VK";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  function isMobileLayout(){ return window.matchMedia('(max-width: 760px)').matches; }

  function setMapListCollapsed(collapsed){
    mapListCollapsed = Boolean(collapsed) && !isMobileLayout();
    elWorkspace?.classList.toggle('map-list-collapsed', mapListCollapsed);
    elMapListToggle?.setAttribute('aria-expanded', mapListCollapsed ? 'false' : 'true');
    elMapListToggle?.setAttribute('aria-label', mapListCollapsed ? 'Kontaktliste ausklappen' : 'Kontaktliste einklappen');
    window.setTimeout(() => map.invalidateSize(), 160);
  }

  function toggleMapList(){
    setMapListCollapsed(!mapListCollapsed);
  }

  function resetListPage(){
    currentListPage = 1;
  }

  function resetMapFilters(){
    activeMapContactId = "";
    mobilePreviewContactId = "";
    activeCategoryFilter = "";
    activeOwnerFilter = "";
    activePriorityFilter = "";
    query = "";
    if (elSearch) elSearch.value = "";
    if (selectedState) {
      setSelectedState("");
    } else {
      renderFilters();
      renderStateFilterMenu();
      render();
    }
  }

  function setMobileSheetState(nextState = 'collapsed'){
    mobileSheetState = nextState;
    if (!elSidebar) return;
    elSidebar.dataset.sheetState = isMobileLayout() ? 'full' : 'desktop';
    if (elMobileSheetToggle && isMobileLayout()) {
      elMobileSheetToggle.setAttribute('aria-label', 'Kontaktliste');
    }
    if (elMobileSheetMeta && isMobileLayout()) {
      elMobileSheetMeta.textContent = selectedState ? `${selectedState}${activeCategoryFilter ? ` • ${activeCategoryFilter}` : ''}` : 'Deutschlandweite Ansicht';
    }
    syncMobileMapGestures();
  }

  function cycleMobileSheetState(){
    if (!isMobileLayout()) return;
    document.querySelector('.sidebar')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function syncMobileMapGestures(){
    if (!map) return;
    if (isMobileLayout()) {
      map.dragging.enable();
      map.scrollWheelZoom.disable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
    }
  }

  function fitMapToGermany(){
    const bounds = L.geoJSON(DE_GEOJSON).getBounds();
    map.setMinZoom(currentMapMinZoom());
    map.fitBounds(bounds.pad(isMobileLayout() ? 0.5 : 0.2), { animate: true });
  }

  function passes(d){
    const q = normalize(query).trim();
    if (activeCategoryFilter && d.category !== activeCategoryFilter) return false;
    if (selectedState && d.state !== selectedState) return false;
    if (activeOwnerFilter && !ownerValuesForEntry(d).includes(activeOwnerFilter)) return false;
    if (!q) return true;
    const hay = [
      d.name,
      d.organization,
      d.city,
      d.state,
      d.category,
      d.person_title,
      ...ownerValuesForEntry(d),
      d.description
    ].map(normalize).join(" ");
    return hay.includes(q);
  }

  function filteredEntries(){
    return mapSourceEntries().filter(passes);
  }

  function matchesQuery(entry){
    const q = normalize(query).trim();
    if (!q) return true;
    const hay = normalize(entry.name) + " " + normalize(entry.city) + " " + normalize(entry.category) + " " + normalize(entry.description) + " " + ownerValuesForEntry(entry).map(normalize).join(" ");
    return hay.includes(q);
  }

  function stateEntries(name){
    return mapSourceEntries().filter((entry) => {
      if (entry.state !== name) return false;
      if (activeCategoryFilter && entry.category !== activeCategoryFilter) return false;
      if (activeOwnerFilter && !ownerValuesForEntry(entry).includes(activeOwnerFilter)) return false;
      return matchesQuery(entry);
    });
  }

  function allStateEntriesCount(){
    return mapSourceEntries().filter((entry) => (
      (!activeCategoryFilter || entry.category === activeCategoryFilter) &&
      (!activeOwnerFilter || ownerValuesForEntry(entry).includes(activeOwnerFilter)) &&
      matchesQuery(entry)
    )).length;
  }

  function renderMapActiveFilters(){
    if (!elMapActiveFilters) return;
    const chips = [];
    if (selectedState) chips.push({ key: 'state', label: selectedState });
    if (activeCategoryFilter) chips.push({ key: 'category', label: `Sektor: ${activeCategoryFilter}` });
    if (activeOwnerFilter) chips.push({ key: 'owner', label: `Owner: ${activeOwnerFilter}` });
    if (query.trim()) chips.push({ key: 'query', label: `Suche: ${query.trim()}` });

    if (!chips.length) {
      elMapActiveFilters.innerHTML = "";
      elMapActiveFilters.hidden = true;
      return;
    }

    elMapActiveFilters.hidden = false;
    elMapActiveFilters.innerHTML = chips
      .map(
        (chip) => `
          <span class="map-active-filter-chip" data-filter-chip="${escapeHtml(chip.key)}">
            <span>${escapeHtml(chip.label)}</span>
            <button type="button" data-filter-remove="${escapeHtml(chip.key)}" aria-label="${escapeHtml(chip.label)} entfernen">&times;</button>
          </span>
        `
      )
      .join("");

    Array.from(elMapActiveFilters.querySelectorAll('[data-filter-remove]')).forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const key = button.dataset.filterRemove;
        if (key === 'state') {
          setSelectedState("");
          fitMapToGermany();
        } else if (key === 'category') {
          activeCategoryFilter = "";
          renderFilters();
          render();
        } else if (key === 'owner') {
          activeOwnerFilter = "";
          renderFilters();
          render();
        } else if (key === 'query') {
          query = "";
          elSearch.value = "";
          render();
        }
      });
    });
  }

  function previewMetaBadges(entry){
    const badges = [];
    if (entry.category) badges.push(`<span class="mobile-map-preview-badge">${escapeHtml(entry.category)}</span>`);
    if (entry.priority) badges.push(`<span class="mobile-map-preview-badge">${escapeHtml(entry.priority)}</span>`);
    return badges.join("");
  }

  function mapTooltipDetailIcon(kind) {
    if (kind === "organization") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21h16"></path><path d="M6 21V4h9v17"></path><path d="M15 9h3v12"></path><path d="M9 8h3M9 12h3M9 16h3"></path></svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>`;
  }

  function mapTooltipDetailHtml(kind, value) {
    if (!hasValue(value)) return "";
    return `
      <div class="map-point-tooltip__detail map-point-tooltip__detail--${kind}">
        <span class="map-point-tooltip__detail-icon" aria-hidden="true">${mapTooltipDetailIcon(kind)}</span>
        <span class="map-point-tooltip__detail-text">${escapeHtml(value)}</span>
      </div>
    `;
  }

  function mapTooltipHtml(entry) {
    const organizationLine = entry.organization || mapLabel("descriptionFallback", "Kontakt");
    const locationLine = entryListLocation(entry);
    const imageUrl = safeImageUrl(entry.image);
    const avatarFallback = escapeHtml(initials(entry.name));
    const avatar = imageUrl
      ? `<span class="map-point-tooltip__avatar"><img src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async"></span>`
      : `<span class="map-point-tooltip__avatar">${avatarFallback}</span>`;
    const sectorColor = sectorRegistry.colorFor(entry.category || "");
    const sectorBadge = entry.category
      ? `<span class="map-point-tooltip__sector" style="--sector-color:${escapeHtml(sectorColor)};--sector-bg:${escapeHtml(sectorTint(sectorColor))}"><span class="map-point-tooltip__sector-icon" aria-hidden="true">${sectorIconSvg(entry.category)}</span><span>${escapeHtml(entry.category)}</span></span>`
      : "";
    return `
      <div class="map-point-tooltip__content">
        <div class="map-point-tooltip__header">
          ${avatar}
          <div class="map-point-tooltip__identity">
            <div class="map-point-tooltip__name">${escapeHtml(entry.name)}</div>
            <div class="map-point-tooltip__badges">${sectorBadge}</div>
          </div>
        </div>
        <div class="map-point-tooltip__details">
          ${mapTooltipDetailHtml("organization", organizationLine)}
          ${mapTooltipDetailHtml("location", locationLine || entry.state || "Ort nicht dokumentiert")}
        </div>
      </div>
    `;
  }

  function bindMapPointTooltip(marker, entry) {
    if (isMobileLayout()) return marker;
    marker.bindTooltip(mapTooltipHtml(entry), {
      className: "map-point-tooltip",
      direction: "top",
      offset: [0, -10],
      opacity: 1,
      sticky: true
    });
    marker.on('mouseover', () => highlightContactState(entry.state, true));
    marker.on('mouseout', () => highlightContactState(entry.state, false));
    return marker;
  }

  function openEntryDetail(entry){
    if (!entry) return;
    if (EMBED_MODE && window.parent && window.parent !== window) {
      if (!ALLOWED_MAP_MESSAGE_CHANNELS.has(MAP_MESSAGE_CHANNEL)) return;
      window.parent.postMessage({
        type: "versorgungs-kompass-open-detail",
        version: MAP_MESSAGE_VERSION,
        channel: MAP_MESSAGE_CHANNEL,
        id: boundedMapText(entry.id, 160),
        realm: activeMapContext,
        entity: activeMapContext === "stakeholders" ? "person" : "contact"
      }, window.location.origin);
      renderMapDetail(null);
      return;
    }
    renderMapDetail(entry);
  }

  function entryLocation(entry){
    return [entry.postal_code, entry.city].filter(Boolean).join(" ") || entry.location || entry.state || "";
  }

  function entryListLocation(entry){
    const city = String(entry.city || entry.location || "").replace(/^\d{5}\s*/, "").trim();
    return [city, entry.state].filter(Boolean).join(", ");
  }

  function sectorTint(color){
    const hex = String(color || "#155fe4").replace("#", "");
    if (hex.length !== 6) return "rgba(21, 95, 228, 0.12)";
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.12)`;
  }

  function sectorShadow(color){
    const hex = String(color || "#155fe4").replace("#", "");
    if (hex.length !== 6) return "rgba(21, 95, 228, 0.18)";
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.20)`;
  }

  function avatarHtml(entry){
    const imageUrl = safeImageUrl(entry.image);
    if (imageUrl) {
      return `<span class="item-avatar"><img src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async" data-image-fallback="${escapeHtml(initials(entry.name))}"></span>`;
    }
    return `<span class="item-avatar">${escapeHtml(initials(entry.name))}</span>`;
  }

  function missingEntryFields(entry){
    const missing = [];
    if (!hasValue(entry.email)) missing.push("E-Mail");
    if (!hasValue(entry.phone)) missing.push("Telefon");
    if (!hasValue(entry.linkedin)) missing.push("LinkedIn");
    if (!hasValue(entry.person_title)) missing.push("Fachrichtung");
    if (!ownerValuesForEntry(entry).length) missing.push("Owner");
    return missing;
  }

  function mapDetailLine(label, value, href = ""){
    const present = hasValue(value);
    const safeHref = safeNavigationUrl(href);
    return `
      <div class="map-detail-line ${present ? "" : "map-detail-line-empty"}">
        <span class="map-detail-label">${escapeHtml(label)}</span>
        <span class="map-detail-value">${present && safeHref ? `<a href="${escapeHtml(safeHref)}" ${safeHref.startsWith("http") ? `target="_blank" rel="noopener noreferrer"` : ""}>${escapeHtml(value)}</a>` : escapeHtml(present ? value : "Nicht hinterlegt")}</span>
      </div>
    `;
  }

  function detailLineHtml(label, value, options = {}){
    const empty = options.empty || !hasValue(String(value || "").replace(/<[^>]+>/g, ""));
    return `
      <div class="detail-line ${empty ? "detail-line--empty" : ""}">
        <span class="detail-line__label">${escapeHtml(label)}</span>
        <span class="detail-line__value">${value || escapeHtml(options.emptyLabel || "Nicht hinterlegt")}</span>
      </div>
    `;
  }

  function detailLine(label, value, options = {}){
    const text = hasValue(value) ? escapeHtml(value) : "";
    return detailLineHtml(label, text, { ...options, empty: !hasValue(value) });
  }

  function detailContactLine(label, value, href = ""){
    const present = hasValue(value);
    const safeHref = safeNavigationUrl(href);
    const content = present && safeHref
      ? `<a href="${escapeHtml(safeHref)}" ${safeHref.startsWith("http") ? `target="_blank" rel="noopener noreferrer"` : ""}>${escapeHtml(value)}</a>`
      : escapeHtml(present ? value : "Nicht hinterlegt");
    return detailLineHtml(label, content, { empty: !present });
  }

  function mapDetailTabButton(tab, label, activeTab) {
    const active = tab === activeTab;
    return `<button class="detail-tab ${active ? "is-active" : ""}" type="button" data-map-detail-tab="${escapeHtml(tab)}" aria-selected="${active ? "true" : "false"}">${escapeHtml(label)}</button>`;
  }

  function mapDetailPanelAttrs(tab, activeTab) {
    return `class="section-block detail-tab-panel" data-map-detail-panel="${escapeHtml(tab)}" ${tab === activeTab ? "" : "hidden"}`;
  }

  function mapDetailPill(label, color = "#155fe4"){
    if (!hasValue(label)) return "";
    return `<span class="sector-pill" style="--sector-color:${color};--sector-bg:${sectorTint(color)}">${escapeHtml(label)}</span>`;
  }

  function mapPriorityPill(value){
    if (!hasValue(value)) return "";
    const normalized = normalize(value).replace(/\s+/g, "-");
    return `<span class="contact-priority-pill contact-priority-pill--${escapeHtml(normalized)}">${escapeHtml(value)}</span>`;
  }

  function mapOwnerControl(entry){
    const ownerLabel = (Array.isArray(entry.ownerLabels) && entry.ownerLabels.length ? entry.ownerLabels : splitOwnerTokens(entry.owner)).join(", ");
    return `<span class="detail-owner-trigger">${escapeHtml(ownerLabel || "Keinen Owner zuweisen")}</span>`;
  }

  function formatDetailDate(value){
    if (!hasValue(value)) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("de-DE").format(date);
  }

  function buildMapDetailMiniMap(entry){
    const lat = Number.parseFloat(entry.lat);
    const lon = Number.parseFloat(entry.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return `
        <div class="detail-mini-map">
          <div class="detail-mini-map-empty">Noch keine Koordinaten für diesen Kontakt hinterlegt.</div>
        </div>
      `;
    }
    const src = `./versorgungs-kompass-contact-mini-map.html?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    return `
      <div class="detail-mini-map">
        <iframe
          class="detail-mini-map-frame"
          title="Standortkarte Deutschland"
          src="${src}"
          loading="lazy"
          tabindex="-1"
          sandbox="allow-scripts"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
    `;
  }

  function renderMapDetail(entry){
    if (!elMapDetailPanel) return;
    if (!entry) {
      elWorkspace?.classList.remove('has-map-detail');
      document.body.classList.remove('has-map-detail');
      elMapDetailPanel.innerHTML = "";
      mapDetailActiveTab = "overview";
      return;
    }
    const location = entryLocation(entry);
    const missing = missingEntryFields(entry);
    const themeTags = Array.isArray(entry.themes) ? entry.themes : [];
    const sectorColor = sectorRegistry.colorFor(entry.category);
    const activeTab = mapDetailActiveTab || "overview";
    const entries = filteredEntries();
    const currentIndex = entries.findIndex((item) => item.id === entry.id);
    const counterText = currentIndex >= 0 ? `${currentIndex + 1} von ${entries.length} Kontakten` : "Kontaktprofil";
    const updatedLabel = formatDetailDate(entry.updatedAt);
    const roleText = hasValue(entry.contact_role) ? entry.contact_role : "";
    const imageUrl = safeImageUrl(entry.image);
    const avatar = imageUrl
      ? `<span class="avatar"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(entry.name)}" loading="lazy" decoding="async" data-image-fallback="${escapeHtml(initials(entry.name))}" /></span>`
      : escapeHtml(initials(entry.name));
    elWorkspace?.classList.add('has-map-detail');
    document.body.classList.add('has-map-detail');
    elMapDetailPanel.innerHTML = `
      <div class="detail-toolbar">
        <div class="detail-counter">${escapeHtml(counterText)}</div>
        <div class="detail-toolbar-actions">
          <button class="action-button detail-profile-edit" type="button" id="map-detail-edit">Bearbeiten</button>
          <button class="detail-close" type="button" id="map-detail-close" aria-label="Details schließen">&times;</button>
        </div>
      </div>
      <div class="detail-content">
        <div class="detail-profile">
          <section class="detail-profile-top">
            <div class="detail-profile-main">
              ${imageUrl ? avatar : `<span class="avatar">${avatar}</span>`}
              <div class="detail-profile-copy">
                <h3>${escapeHtml(entry.name)}</h3>
                <div class="detail-profile-role">${escapeHtml(entry.organization || "Organisation nicht dokumentiert")}</div>
                ${roleText ? `<div class="detail-profile-subline">${escapeHtml(roleText)}</div>` : ""}
              </div>
            </div>
            <div class="detail-profile-meta">
              <div class="detail-meta-control">
                <span class="detail-meta-control__label">Owner</span>
                ${mapOwnerControl(entry)}
              </div>
            </div>
          </section>

          <div class="detail-tabs" role="tablist" aria-label="Detailbereiche">
            ${mapDetailTabButton("overview", "Überblick", activeTab)}
            ${mapDetailTabButton("contact", "Kontakt", activeTab)}
            ${mapDetailTabButton("themes", "Themen", activeTab)}
            ${mapDetailTabButton("notes", "Notizen", activeTab)}
            ${mapDetailTabButton("activity", "Aktivitäten", activeTab)}
          </div>

          <section ${mapDetailPanelAttrs("overview", activeTab)} id="map-detail-overview">
            <h4 class="detail-section-title">Stammdaten</h4>
            <div class="detail-line-list">
              ${detailLine("Organisation", entry.organization)}
              ${detailLine("Sektor", entry.category)}
              ${detailLine("Fachrichtung", entry.person_title, { emptyLabel: "Bitte wählen" })}
              ${detailLine("Rolle", roleText)}
              ${detailLine("Ort", location)}
              ${detailLine("Bundesland", entry.state)}
              ${entry.mapPositionSource === "organization" ? detailLine("Kartenposition", "Organisation") : ""}
              ${detailLineHtml("Priorität", mapPriorityPill(entry.priority), { empty: !hasValue(entry.priority) })}
              ${updatedLabel ? detailLine("Aktualisiert", updatedLabel) : ""}
            </div>
            <div class="section-block">
              <h4 class="detail-section-title">Standort</h4>
              <article class="detail-info-card detail-info-card--map">
                ${buildMapDetailMiniMap(entry)}
              </article>
            </div>
          </section>

          <section ${mapDetailPanelAttrs("contact", activeTab)} id="map-detail-contactways">
            <h4 class="detail-section-title">Kontakt</h4>
            <div class="detail-line-list">
              ${detailContactLine("E-Mail", entry.email, entry.email ? `mailto:${entry.email}` : "")}
              ${detailContactLine("Telefon", entry.phone, entry.phone ? `tel:${entry.phone}` : "")}
              ${detailContactLine("LinkedIn", entry.linkedin ? "Profil öffnen" : "", entry.linkedin)}
              ${detailContactLine("Website", entry.url, entry.url)}
            </div>
          </section>

          <section ${mapDetailPanelAttrs("themes", activeTab)} id="map-detail-themes">
            <h4 class="detail-section-title">Themen${themeTags.length ? ` (${themeTags.length})` : ""}</h4>
            <div class="detail-line-list">
              <div class="detail-info-card">
                <div class="detail-chip-row">
                  ${themeTags.length ? themeTags.map((tag) => `<span class="sector-pill">${escapeHtml(tag)}</span>`).join("") : `<span class="detail-profile-subline">Noch keine Themen hinterlegt.</span>`}
                </div>
              </div>
            </div>
          </section>

          <section ${mapDetailPanelAttrs("notes", activeTab)} id="map-detail-notes">
            <h4 class="detail-section-title">Notizen</h4>
            <div class="detail-line-list">
              <div class="detail-info-card">
                <div class="${entry.note ? "" : "detail-profile-subline"}">${escapeHtml(entry.note || "Keine Notiz hinterlegt")}</div>
              </div>
            </div>
          </section>

          <section ${mapDetailPanelAttrs("activity", activeTab)} id="map-detail-activity">
            <div class="detail-info-card">
              <h4 class="detail-section-title">Verlauf</h4>
              <div class="detail-profile-subline">Änderungen und Importereignisse werden im Kontakte-Tab angezeigt.</div>
            </div>
          </section>

          <div class="detail-bottom-actions">
            <button class="action-button action-button--danger" type="button" id="map-detail-archive">Kontakt archivieren</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('map-detail-edit')?.addEventListener('click', () => openEntryDetail(entry));
    document.getElementById('map-detail-archive')?.addEventListener('click', () => openEntryDetail(entry));
    document.getElementById('map-detail-close')?.addEventListener('click', () => {
      const shouldResetMap = mapMovedForActiveContact;
      activeMapContactId = "";
      mapMovedForActiveContact = false;
      renderMapDetail(null);
      render();
      renderList(filteredEntries());
      if (shouldResetMap) {
        if (selectedState) fitMapToState(selectedState);
        else fitMapToGermany();
      }
      updateMapResetButton();
    });
    elMapDetailPanel.querySelectorAll('[data-map-detail-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        mapDetailActiveTab = button.dataset.mapDetailTab || "overview";
        renderMapDetail(entry);
      });
    });
  }

  function renderMobilePreview(entry = null){
    if (!elMobileMapPreview) return;
    if (!entry || !isMobileLayout()) {
      if (!entry) mobilePreviewContactId = "";
      elMobileMapPreview.hidden = true;
      elMobileMapPreview.innerHTML = "";
      return;
    }
    mobilePreviewContactId = entry.id;
    const cityLine = [entry.city, entry.state].filter(Boolean).join(", ");
    const imageUrl = safeImageUrl(entry.image);
    const previewAvatar = imageUrl
      ? `<span class="mobile-map-preview-avatar"><img src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async" data-image-fallback="${escapeHtml(initials(entry.name))}"></span>`
      : `<span class="mobile-map-preview-avatar">${escapeHtml(initials(entry.name))}</span>`;
    elMobileMapPreview.hidden = false;
    elMobileMapPreview.innerHTML = `
      <div class="mobile-map-preview-head">
        <span class="map-detail-kicker">${escapeHtml(mapLabel("previewKicker", "Kontaktvorschau"))}</span>
        <button class="mobile-map-preview-close" type="button" id="mobile-map-preview-close" aria-label="Vorschau schließen">&times;</button>
      </div>
      <div class="mobile-map-preview-profile">
        ${previewAvatar}
        <div>
          <div class="mobile-map-preview-title">${escapeHtml(entry.name)}</div>
          <div class="mobile-map-preview-copy">${escapeHtml(entry.organization || "Organisation nicht dokumentiert")}${cityLine ? ` • ${escapeHtml(cityLine)}` : ""}</div>
        </div>
      </div>
      <div class="mobile-map-preview-meta">${previewMetaBadges(entry)}</div>
      <button class="mobile-map-preview-action" type="button" id="mobile-map-preview-open">${escapeHtml(mapLabel("openDetailLabel", "Details öffnen"))}</button>
    `;
    document.getElementById('mobile-map-preview-open')?.addEventListener('click', () => openEntryDetail(entry));
    document.getElementById('mobile-map-preview-close')?.addEventListener('click', () => {
      mobilePreviewContactId = "";
      activeMapContactId = "";
      elMobileMapPreview.hidden = true;
      elMobileMapPreview.innerHTML = "";
      renderList(filteredEntries());
      updateMapResetButton();
    });
  }

  function sectorPointFor(d){
    const color = sectorRegistry.colorFor(d.category);
    const size = isMobileLayout() ? 10 : 12;
    const icon = L.divIcon({
      className: '',
      html: `<div class="cat-marker${activeMapContactId === d.id ? " cat-marker-active" : ""}" style="background:${color};"></div>`,
      iconSize: [size,size],
      iconAnchor: [size / 2,size / 2],
      popupAnchor: [0,-8],
      tooltipAnchor: [0,-6]
    });
    return L.marker([d.lat, d.lon], { icon, riseOnHover: true, riseOffset: 1000000 });
  }

  const GEMATIK_LOCATION_MARKER_PATH = "M256 0C153.755 0 70.573 83.182 70.573 185.426c0 126.888 165.939 313.167 173.004 321.035 6.636 7.391 18.222 7.378 24.846 0 7.065-7.868 173.004-194.147 173.004-321.035C441.425 83.182 358.244 0 256 0zm0 278.719c-51.442 0-93.292-41.851-93.292-93.293S204.559 92.134 256 92.134s93.291 41.851 93.291 93.293-41.85 93.292-93.291 93.292z";

  function gematikMarkerSize(compact = false){
    const width = window.innerWidth;
    const viewportSize = width < 576
      ? [20, 26]
      : (width < 992 ? [24, 31] : (width < 1440 ? [30, 39] : [34, 44]));
    if (!compact) return viewportSize;
    return [
      Math.max(18, Math.round(viewportSize[0] * 0.76)),
      Math.max(23, Math.round(viewportSize[1] * 0.76))
    ];
  }

  function gematikMarkerMarkup(active = false, className = "gematik-marker"){
    const activeClass = className === "gematik-marker" && active ? " gematik-marker-active" : "";
    return `<span class="${className}${activeClass}" aria-hidden="true"><svg class="gematik-marker__svg" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" focusable="false"><path fill="#00ff65" d="${GEMATIK_LOCATION_MARKER_PATH}"/></svg></span>`;
  }

  function gematikMarkerFor(d, options = {}){
    const compact = options.compact === true;
    const [width, height] = gematikMarkerSize(compact);
    const icon = L.divIcon({
      className: '',
      html: gematikMarkerMarkup(activeMapContactId === d.id),
      iconSize: [width, height],
      iconAnchor: [width / 2, height],
      popupAnchor: [0, -height],
      tooltipAnchor: [0, -height + 2]
    });
    return L.marker(options.latLng || [d.lat, d.lon], {
      icon,
      zIndexOffset: options.zIndexOffset || 0,
      riseOnHover: true,
      riseOffset: 1000000
    });
  }

  function markerFor(d, options = {}){
    return gematikMarkerModeActive ? gematikMarkerFor(d, options) : sectorPointFor(d);
  }

  function resolveMarkerCollisions(layout){
    const resolved = layout.map((item) => {
      const [width, height] = gematikMarkerSize(item.compact);
      return {
        ...item,
        width,
        height,
        point: map.latLngToLayerPoint(item.latLng)
      };
    });
    const padding = 3;

    for (let pass = 0; pass < 18; pass += 1) {
      let moved = false;
      for (let i = 0; i < resolved.length; i += 1) {
        for (let j = i + 1; j < resolved.length; j += 1) {
          const a = resolved[i];
          const b = resolved[j];
          const centerAx = a.point.x;
          const centerAy = a.point.y - (a.height / 2);
          const centerBx = b.point.x;
          const centerBy = b.point.y - (b.height / 2);
          const deltaX = centerBx - centerAx;
          const deltaY = centerBy - centerAy;
          const overlapX = ((a.width + b.width) / 2) + padding - Math.abs(deltaX);
          const overlapY = ((a.height + b.height) / 2) + padding - Math.abs(deltaY);
          if (overlapX <= 0 || overlapY <= 0) continue;

          moved = true;
          if (overlapX < overlapY) {
            const direction = deltaX === 0 ? ((i + j) % 2 === 0 ? 1 : -1) : Math.sign(deltaX);
            const shift = (overlapX / 2) + 0.25;
            a.point.x -= direction * shift;
            b.point.x += direction * shift;
          } else {
            const direction = deltaY === 0 ? ((i + j) % 2 === 0 ? 1 : -1) : Math.sign(deltaY);
            const shift = (overlapY / 2) + 0.25;
            a.point.y -= direction * shift;
            b.point.y += direction * shift;
          }
        }
      }
      if (!moved) break;
    }

    return resolved.map(({ entry, compact, point }) => ({
      entry,
      compact,
      latLng: map.layerPointToLatLng(point)
    }));
  }

  function declutteredMarkerEntries(entries){
    if (!gematikMarkerModeActive || heatMapActive || clusterModeActive || entries.length < 2) {
      return entries.map((entry) => ({ entry, latLng: [entry.lat, entry.lon], compact: false }));
    }

    const [markerWidth, markerHeight] = gematikMarkerSize();
    const collisionDistance = Math.max(24, Math.max(markerWidth, markerHeight) * 1.12);
    const projected = entries.map((entry) => ({
      entry,
      point: map.latLngToLayerPoint([entry.lat, entry.lon])
    }));
    const groups = [];

    projected.forEach((candidate) => {
      let nearestGroup = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      groups.forEach((group) => {
        const center = L.point(
          group.reduce((sum, item) => sum + item.point.x, 0) / group.length,
          group.reduce((sum, item) => sum + item.point.y, 0) / group.length
        );
        const distance = candidate.point.distanceTo(center);
        if (distance <= collisionDistance && distance < nearestDistance) {
          nearestGroup = group;
          nearestDistance = distance;
        }
      });
      if (nearestGroup) nearestGroup.push(candidate);
      else groups.push([candidate]);
    });

    const layout = groups.flatMap((group) => {
      if (group.length === 1) {
        const item = group[0];
        return [{ entry: item.entry, latLng: [item.entry.lat, item.entry.lon], compact: false }];
      }

      const ordered = [...group].sort((a, b) => String(a.entry.id).localeCompare(String(b.entry.id), 'de'));
      const center = L.point(
        group.reduce((sum, item) => sum + item.point.x, 0) / group.length,
        group.reduce((sum, item) => sum + item.point.y, 0) / group.length
      );
      const [compactWidth, compactHeight] = gematikMarkerSize(true);
      const separation = Math.max(compactWidth, compactHeight) + 5;
      const radius = Math.max(22, separation / (2 * Math.sin(Math.PI / ordered.length)));
      const startAngle = -Math.PI / 2;

      return ordered.map((item, index) => {
        const angle = startAngle + ((Math.PI * 2 * index) / ordered.length);
        const displayPoint = L.point(
          center.x + (Math.cos(angle) * radius),
          center.y + (Math.sin(angle) * radius)
        );
        return {
          entry: item.entry,
          latLng: map.layerPointToLatLng(displayPoint),
          compact: true
        };
      });
    });
    return resolveMarkerCollisions(layout);
  }

  function clusterIcon(count, active = false){
    return L.divIcon({
      className: '',
      html: `<div class="map-cluster-marker${active ? " map-cluster-active" : ""}">${count}</div>`,
      iconSize: null,
      iconAnchor: [14, 14]
    });
  }

  function markerBuckets(entries){
    if (heatMapActive) return [];
    if (!clusterModeActive) return entries.map((entry) => [entry]);
    const zoom = map.getZoom();
    const gridSize = zoom >= 10 ? 1 : (zoom >= 8 ? 34 : 46);
    const buckets = new Map();

    entries.forEach((entry) => {
      const point = map.latLngToLayerPoint([entry.lat, entry.lon]);
      const key = gridSize <= 1 ? entry.id : `${Math.round(point.x / gridSize)}:${Math.round(point.y / gridSize)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(entry);
    });

    return Array.from(buckets.values());
  }

  function highlightMapContact(id, active){
    markerIndex
      .filter((entry) => entry.ids.includes(id))
      .forEach(({ marker, ids }) => {
        const element = marker.getElement();
        if (!element) return;
        element.querySelector('.cat-marker')?.classList.toggle('cat-marker-active', active);
        element.querySelector('.gematik-marker')?.classList.toggle('gematik-marker-active', active);
        element.querySelector('.map-cluster-marker')?.classList.toggle('map-cluster-active', active || ids.includes(activeMapContactId));
      });
  }

  function fitMapToEntries(entries){
    if (!entries.length) return;
    const bounds = L.latLngBounds(entries.map((entry) => [entry.lat, entry.lon]));
    map.fitBounds(bounds.pad(0.22), { animate: true, maxZoom: MAP_MAX_ZOOM });
  }

  function renderStateFilterMenu(){
    const counts = states.reduce((acc, state) => {
      acc[state] = stateEntries(state).length;
      return acc;
    }, {});

    const allButtonClass = selectedState ? "map-dropdown-item" : "map-dropdown-item map-dropdown-item-active";
    elStateFilterMenu.innerHTML = `<button class="${allButtonClass}" type="button" data-state="">
      ${mapFilterValueMarkup("Alle Bundesländer", stateFlagIcon(""))}
      <span class="map-dropdown-meta">${allStateEntriesCount()}</span>
    </button>`;

    states.forEach((state) => {
      const active = selectedState === state ? " map-dropdown-item-active" : "";
      elStateFilterMenu.insertAdjacentHTML('beforeend', `<button class="map-dropdown-item${active}" type="button" data-state="${escapeHtml(state)}">
        ${mapFilterValueMarkup(state, stateFlagIcon(state))}
        <span class="map-dropdown-meta">${counts[state]}</span>
      </button>`);
    });

    Array.from(elStateFilterMenu.querySelectorAll('[data-state]')).forEach((button) => {
      button.addEventListener('click', () => {
        const state = button.getAttribute('data-state') || "";
        resetListPage();
        setSelectedState(state);
        closeStateFilterMenu();
      });
    });
  }

  function openStateFilterMenu(){
    syncStateFilterMenuContainer();
    elStateFilterMenu.classList.add('map-dropdown-menu-open');
    updateStateFilterToggle();
  }

  function closeStateFilterMenu(){
    elStateFilterMenu.classList.remove('map-dropdown-menu-open');
    updateStateFilterToggle();
  }

  function updateStateFilterToggle(){
    const active = elStateFilterMenu.classList.contains('map-dropdown-menu-open') || !!selectedState;
    elStateFilterToggle.classList.toggle('map-toggle-active-filter', active);
    elStateViewFilterToggle.classList.toggle('map-toggle-active-filter', active);
  }

  function syncStateFilterMenuContainer(){
    const target = (selectedState && elStateView.classList.contains('state-view-open')) ? elStateViewFilter : elStateFilterDropdown;
    if (elStateFilterMenu.parentElement !== target) {
      target.appendChild(elStateFilterMenu);
    }
  }

  function ensureStateMap(){
    if (stateMap) return;
    stateMap = L.map('state-map', {
      zoomControl: true,
      zoomSnap: 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel: MAP_WHEEL_PX_PER_ZOOM
    });
    stateMapTiles = IS_PUBLIC_DEMO ? null : L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: STATE_MAP_MAX_ZOOM,
      opacity: 0.52,
      attribution: '&copy; OpenStreetMap-Mitwirkende &copy; CARTO'
    }).addTo(stateMap);
    stateMap.setMinZoom(MAP_MIN_ZOOM);
    stateMap.setMaxZoom(STATE_MAP_MAX_ZOOM);
    stateMapMarkers = L.layerGroup().addTo(stateMap);

    const stateMapHoles = germanyOuterRings(DE_GEOJSON);
    stateMapMask = L.polygon([worldRing, ...stateMapHoles], {
      stroke: false,
      fillColor: '#fff',
      fillOpacity: 0.82,
      interactive: false
    }).addTo(stateMap);

    stateMapGermanyOutline = L.geoJSON(DE_GEOJSON, {
      style: {
        color: 'rgba(20,84,122,0.22)',
        weight: 1,
        fill: false
      },
      interactive: false
    }).addTo(stateMap);
    stateMapCityLabels = L.layerGroup().addTo(stateMap);
  }

  function renderStateMapCityLabels(feature){
    if (!stateMapCityLabels) return;
    stateMapCityLabels.clearLayers();
    const bounds = L.geoJSON(feature).getBounds();
    const labels = [
      ...CITY_LABELS.major.map((city) => ({ ...city, cls: 'major' })),
      ...CITY_LABELS.capitals.map((city) => ({ ...city, cls: 'capital' })),
      ...CITY_LABELS.extra.map((city) => ({ ...city, cls: 'extra' }))
    ];

    labels
      .filter((city) => bounds.contains([city.lat, city.lon]))
      .forEach((city) => {
        L.marker([city.lat, city.lon], {
          icon: labelIcon(city.name, city.cls),
          interactive: false,
          keyboard: false,
          zIndexOffset: -40
        }).addTo(stateMapCityLabels);
      });
  }

  function renderStateMap(){
    if (!selectedState) return;
    ensureStateMap();

    if (stateMapOutline) {
      stateMap.removeLayer(stateMapOutline);
      stateMapOutline = null;
    }

    const feature = stateFeature(selectedState);
    if (!feature) return;
    const entries = filteredEntries();

    stateMapOutline = L.geoJSON(feature, {
      style: {
        color: 'rgba(32,104,148,0.88)',
        weight: 2,
        fillColor: 'rgba(32,104,148,0.08)',
        fillOpacity: 0.12
      },
      interactive: false
    }).addTo(stateMap);

    if (stateMapStateLabel) {
      stateMap.removeLayer(stateMapStateLabel);
      stateMapStateLabel = null;
    }
    const corner = stateLabelCorner(selectedState);
    if (corner) {
      stateMapStateLabel = L.marker(corner, {
        icon: L.divIcon({
          className: '',
          html: `<div class="label-anchor"><div class="state-view-state-label"><svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 1.4 10.6 3.8v4.4L6 10.6 1.4 8.2V3.8z" fill="rgba(32,104,148,0.9)"/><path d="M6 3.1 8.8 4.5v2.9L6 8.9 3.2 7.4V4.5z" fill="rgba(255,255,255,0.86)"/></svg><span>${selectedState}</span></div></div>`,
          iconSize: null
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 320
      }).addTo(stateMap);
    }

    stateMapMarkers.clearLayers();
    entries.forEach((entry) => {
      const marker = markerFor(entry);
      bindMapPointTooltip(marker, entry);
      marker.on('click', () => {
        focusMapContact(entry);
      });
      marker.addTo(stateMapMarkers);
    });
    renderStateMapCityLabels(feature);

    const bounds = stateMapOutline.getBounds();
    stateMap.fitBounds(bounds.pad(0.18));
    stateMap.setMaxBounds(bounds.pad(0.35));
    stateMap.invalidateSize();

    elStateViewTitle.textContent = selectedState;
    elStateViewMeta.textContent = `${entries.length} Einträge im aktuellen Filterkontext`;
  }

  function openStateView(name){
    if (!name) return;
    setSelectedState(name);
  }

  function closeStateView(){
    setSelectedState("");
  }

  function setSelectedState(name, { fitBounds = false } = {}){
    if (selectedState !== name) resetListPage();
    selectedState = name;
    activeMapContactId = "";
    mapMovedForActiveContact = false;
    elStateFilterLabel.textContent = name || "Bundesland";
    elStateViewFilterLabel.textContent = name || "Bundesland";
    renderStateFilterMenu();
    renderFilters();
    updateStateFilterToggle();
    elStateView.classList.remove('state-view-open');
    elStateView.setAttribute('aria-hidden', 'true');
    document.querySelector('.map-box').classList.remove('state-mode');
    syncStateFilterMenuContainer();
    if (name) {
      elList.style.display = "block";
      if (isMobileLayout()) setMobileSheetState('half');
    }
    render();
    if (name && fitBounds) {
      fitMapToState(name);
    }
  }

  function updateMapResetButton(){
    if (!elMapResetToggle || !elMapResetLabel) return;
    const hasState = Boolean(selectedState);
    const hasFocusedContact = Boolean(activeMapContactId);
    const hasListFilters = Boolean(activeCategoryFilter || activeOwnerFilter || activePriorityFilter || query.trim());
    elMapResetLabel.textContent = hasState && hasFocusedContact ? "Zum Bundesland" : "Zurücksetzen";
    elMapResetToggle.classList.toggle('map-toggle-active-neutral', hasState || hasFocusedContact || hasListFilters);
    elMapResetToggle.classList.toggle('map-toggle-active-home', hasState);
  }

  function updateMapModeControls(){
    const markerActive = gematikMarkerModeActive && !heatMapActive && !clusterModeActive;
    const pointsActive = !gematikMarkerModeActive && !heatMapActive && !clusterModeActive;
    elMarkerToggle?.classList.toggle('map-toggle-active-marker', markerActive);
    elMarkerToggle?.setAttribute('aria-pressed', markerActive ? 'true' : 'false');
    elPointsToggle?.classList.toggle('map-toggle-active-filter', pointsActive);
    elPointsToggle?.setAttribute('aria-pressed', pointsActive ? 'true' : 'false');
    elHeatMapToggle?.classList.toggle('map-toggle-active-heat', heatMapActive);
    elHeatMapToggle?.setAttribute('aria-pressed', heatMapActive ? 'true' : 'false');
    elClusterToggle?.classList.toggle('map-toggle-active-filter', clusterModeActive);
    elClusterToggle?.setAttribute('aria-pressed', clusterModeActive ? 'true' : 'false');
  }

  function closeMapFilterDropdowns(except = null){
    document.querySelectorAll('.map-filter-dropdown.is-open').forEach((dropdown) => {
      if (dropdown === except) return;
      dropdown.classList.remove('is-open');
      dropdown.querySelector('.map-filter-menu')?.setAttribute('hidden', '');
      dropdown.querySelector('.map-filter-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }

  function mapFilterDropdown({ label, allLabel, value, options, onChange, placeholder = allLabel, triggerId = "", dropdownClass = "", iconForValue = null }){
    const dropdown = document.createElement('div');
    dropdown.className = `map-filter-dropdown${dropdownClass ? ` ${dropdownClass}` : ''}`;
    dropdown.classList.toggle('is-active', Boolean(value));

    const title = document.createElement('span');
    title.className = 'map-filter-label';
    title.textContent = label;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'map-filter-trigger';
    if (triggerId) trigger.id = triggerId;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const triggerLabel = value || placeholder;
    trigger.setAttribute('aria-label', triggerLabel);
    trigger.innerHTML = mapFilterValueMarkup(triggerLabel, iconForValue ? iconForValue(value) : "");

    const menu = document.createElement('div');
    menu.className = 'map-filter-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    const entries = [{ value: '', label: allLabel }, ...options.map((option) => ({ value: option, label: option }))];
    entries.forEach((entry) => {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = `map-filter-option${entry.value === value ? ' is-active' : ''}`;
      optionButton.setAttribute('role', 'option');
      optionButton.setAttribute('aria-selected', entry.value === value ? 'true' : 'false');
      optionButton.setAttribute('aria-label', entry.label);
      optionButton.innerHTML = mapFilterValueMarkup(entry.label, iconForValue ? iconForValue(entry.value) : "");
      optionButton.addEventListener('click', () => {
        closeMapFilterDropdowns();
        onChange(entry.value);
      });
      menu.appendChild(optionButton);
    });

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const shouldOpen = !dropdown.classList.contains('is-open');
      closeMapFilterDropdowns(dropdown);
      dropdown.classList.toggle('is-open', shouldOpen);
      menu.hidden = !shouldOpen;
      trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    });

    dropdown.append(title, trigger, menu);
    return dropdown;
  }

  function renderFilters(){
    elFilters.innerHTML = "";
    if (elMobileMapFilters) elMobileMapFilters.innerHTML = "";
    if (elMobileQuickFilters) elMobileQuickFilters.innerHTML = "";
    const categories = availableCategories();
    const owners = availableOwners();
    activePriorityFilter = "";

    const buildSectorDropdown = () => mapFilterDropdown({
      label: mapLabel("categoryLabel", "Sektor"),
      allLabel: mapLabel("categoryAllLabel", "Alle"),
      placeholder: "Alle",
      value: activeCategoryFilter,
      options: categories,
      iconForValue: sectorFilterIcon,
      onChange: (value) => {
        activeCategoryFilter = value;
        resetListPage();
        renderFilters();
        render();
      }
    });
    const primaryRow = document.createElement('div');
    primaryRow.className = `map-filter-row map-filter-row--primary${showOwnerFilter && owners.length ? " has-owner-filter" : ""}`;
    primaryRow.appendChild(buildSectorDropdown());
    primaryRow.appendChild(mapFilterDropdown({
      label: "Bundesland",
      allLabel: "Alle",
      placeholder: "Alle",
      value: selectedState,
      options: states,
      iconForValue: stateFlagIcon,
      onChange: (value) => {
        setSelectedState(value, { fitBounds: Boolean(value) });
        if (!value) fitMapToGermany();
      }
    }));
    if (showOwnerFilter && owners.length) {
      primaryRow.appendChild(mapFilterDropdown({
        label: "Owner",
        allLabel: "Alle",
        placeholder: "Alle",
        value: activeOwnerFilter,
        options: orderedOwnerFilterValues(owners),
        iconForValue: ownerFilterAvatarIcon,
        onChange: (value) => {
          activeOwnerFilter = value;
          resetListPage();
          renderFilters();
          render();
        }
      }));
    }
    elFilters.append(primaryRow, buildFilterListSeparator(categories));

    if (elMobileQuickFilters) {
      elMobileQuickFilters.appendChild(mapFilterDropdown({
        label: mapLabel("categoryLabel", "Sektor"),
        allLabel: mapLabel("categoryAllLabel", "Alle"),
        placeholder: "Alle",
        triggerId: "mobile-sector-filter",
        dropdownClass: "mobile-map-quick-filter",
        value: activeCategoryFilter,
        options: categories,
        iconForValue: sectorFilterIcon,
        onChange: (value) => {
          activeCategoryFilter = value;
          resetListPage();
          renderFilters();
          render();
        }
      }));
      elMobileQuickFilters.appendChild(mapFilterDropdown({
        label: "Bundesland",
        allLabel: "Alle",
        placeholder: "Alle",
        triggerId: "mobile-state-filter",
        dropdownClass: "mobile-map-quick-filter",
        value: selectedState,
        options: states,
        iconForValue: stateFlagIcon,
        onChange: (value) => {
          setSelectedState(value, { fitBounds: Boolean(value) });
          if (!value) fitMapToGermany();
        }
      }));
      if (showOwnerFilter && owners.length) {
        elMobileQuickFilters.appendChild(mapFilterDropdown({
          label: "Owner",
          allLabel: "Alle",
          placeholder: "Alle",
          triggerId: "mobile-owner-filter",
          dropdownClass: "mobile-map-quick-filter",
          value: activeOwnerFilter,
          options: orderedOwnerFilterValues(owners),
          iconForValue: ownerFilterAvatarIcon,
          onChange: (value) => {
            activeOwnerFilter = value;
            resetListPage();
            renderFilters();
            render();
          }
        }));
      }
    }

  }

  function renderLegend(entries = filteredEntries()){
    if (!elMapLegendList) return;
    if (heatMapActive) {
      elMapLegendList.innerHTML = `
        <div class="map-distribution-legend" aria-label="Weniger bis mehr Kontakte">
          <span>weniger</span>
          <span class="map-distribution-legend__scale" aria-hidden="true"></span>
          <span>mehr</span>
        </div>
      `;
      return;
    }
    if (gematikMarkerModeActive) {
      const itemLabel = entries.length === 1
        ? mapLabel("itemSingular", "Kontakt")
        : mapLabel("itemPlural", "Kontakte");
      elMapLegendList.innerHTML = `
        <div class="map-legend-item map-legend-item--contact">
          <span class="map-legend-pin">${gematikMarkerMarkup(false, "map-legend-marker")}</span>
          <span><strong>${entries.length}</strong> ${escapeHtml(itemLabel)}</span>
        </div>
      `;
      return;
    }
    const counts = new Map();
    entries.forEach((entry) => {
      const label = entry.category || "Weitere";
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    const rows = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
    if (!rows.length) {
      elMapLegendList.innerHTML = `<div class="map-legend-item"><span class="map-legend-swatch" style="background:${sectorRegistry.fallbackColor};"></span><span>Keine Treffer</span></div>`;
      return;
    }
    const visibleRows = rows.slice(0, 8);
    const remainingCount = rows.slice(8).reduce((sum, [, count]) => sum + count, 0);
    elMapLegendList.innerHTML = [
      ...visibleRows.map(([label]) => `<div class="map-legend-item"><span class="map-legend-swatch" style="background:${sectorRegistry.colorFor(label)};"></span><span>${escapeHtml(label)}</span></div>`),
      remainingCount ? `<div class="map-legend-item"><span class="map-legend-swatch" style="background:${sectorRegistry.fallbackColor};"></span><span>Weitere</span></div>` : ""
    ].join("");
  }

  let markerIndex = [];

  function focusMapContact(d, { fitState = true } = {}){
    activeMapContactId = d.id;
    mapMovedForActiveContact = Boolean(fitState && !isMobileLayout() && d.state);
    const entries = filteredEntries();
    const activeIndex = entries.findIndex((entry) => entry.id === d.id);
    if (isMobileLayout() && activeIndex >= 0) {
      currentListPage = Math.floor(activeIndex / mobileListPageSize) + 1;
    }
    if (fitState && !isMobileLayout() && d.state) {
      fitMapToState(d.state);
    }
    if (EMBED_MODE) {
      renderMobilePreview(null);
      renderMapDetail(null);
      openEntryDetail(d);
      renderList(entries);
      updateMapResetButton();
      return;
    }
    if (isMobileLayout()) {
      renderMobilePreview(null);
      renderMapDetail(d);
    } else {
      renderMobilePreview(d);
      renderMapDetail(d);
    }
    if (isMobileLayout()) setMobileSheetState('full');
    render();
    if (isMobileLayout()) {
      requestAnimationFrame(() => {
        document.querySelector(`[data-map-contact-id="${CSS.escape(d.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
    updateMapResetButton();
  }

  function renderList(entries){
    elCount.textContent = `${entries.length} / ${(EMBED_MODE ? currentEntries.length : BASE_DATA.length)}`;
    if (elMobileSheetCount) {
      elMobileSheetCount.textContent = `${entries.length} ${entries.length === 1 ? mapLabel("itemSingular", "Kontakt") : mapLabel("itemPlural", "Kontakte")}`;
    }
    if (elMobileSheetMeta) {
      elMobileSheetMeta.textContent = selectedState ? `${selectedState}${activeCategoryFilter ? ` • ${activeCategoryFilter}` : ''}` : `Deutschlandweite Ansicht`;
    }
    elList.innerHTML = "";
    if (elMapPagination) elMapPagination.innerHTML = "";
    if (!entries.length) {
      elList.innerHTML = `<div class="list-empty">${escapeHtml(mapLabel("emptyTitle", "Keine Kontakte im aktuellen Kartenfilter."))}</div>`;
      renderMapDetail(null);
      return;
    }

    const totalPages = isMobileLayout() ? Math.max(1, Math.ceil(entries.length / mobileListPageSize)) : 1;
    currentListPage = Math.min(Math.max(1, currentListPage), totalPages);
    const pageEntries = isMobileLayout()
      ? entries.slice((currentListPage - 1) * mobileListPageSize, currentListPage * mobileListPageSize)
      : entries;

    pageEntries.forEach((d) => {
      const item = document.createElement('div');
      const isActive = activeMapContactId === d.id;
      item.className = `item${isActive ? " item-active" : ""}`;
      item.dataset.mapContactId = d.id;
      const color = sectorRegistry.colorFor(d.category);
      const meta = d.organization || "Organisation nicht dokumentiert";
      const ownerPill = ownerPillHtml(d);
      item.innerHTML = `<div class="item-top">
                          ${avatarHtml(d)}
                          <div class="item-copy">
                            <div class="t">${escapeHtml(d.name)}</div>
                            <div class="item-meta-row">
                              <div class="m">${escapeHtml(meta)}</div>
                              <div class="item-badge-row">
                                <span class="sector-pill" style="--sector-color:${color};--sector-bg:${sectorTint(color)}">${escapeHtml(d.category)}</span>
                                ${ownerPill}
                              </div>
                            </div>
                          </div>
                          <span class="item-chevron" aria-hidden="true">›</span>
                        </div>`;
      item.addEventListener('click', () => {
        activeMapContactId = d.id;
        mapMovedForActiveContact = false;
        if (EMBED_MODE) {
          renderMobilePreview(null);
          renderMapDetail(null);
          openEntryDetail(d);
          renderList(entries);
          updateMapResetButton();
          return;
        }
        if (isMobileLayout()) {
          renderMobilePreview(null);
          renderMapDetail(d);
          renderList(entries);
          updateMapResetButton();
          return;
        }
        focusMapContact(d, { fitState: false });
      });
      item.addEventListener('mouseenter', () => {
        item.classList.add('item-map-hover');
        highlightMapContact(d.id, true);
      });
      item.addEventListener('mouseleave', () => {
        item.classList.remove('item-map-hover');
        highlightMapContact(d.id, false);
      });
      elList.appendChild(item);
    });

    if (elMapPagination && isMobileLayout() && totalPages > 1) {
      elMapPagination.innerHTML = [
        `<button class="map-page-button" type="button" data-page-nav="prev" ${currentListPage === 1 ? "disabled" : ""} aria-label="Vorherige Seite">‹</button>`,
        ...Array.from({ length: totalPages }, (_, index) => {
          const page = index + 1;
          return `<button class="map-page-button ${page === currentListPage ? "is-active" : ""}" type="button" data-page="${page}">${page}</button>`;
        }),
        `<button class="map-page-button" type="button" data-page-nav="next" ${currentListPage === totalPages ? "disabled" : ""} aria-label="Nächste Seite">›</button>`
      ].join("");
      elMapPagination.querySelectorAll("[data-page]").forEach((button) => {
        button.addEventListener("click", () => {
          currentListPage = Number(button.dataset.page);
          renderList(entries);
        });
      });
      elMapPagination.querySelectorAll("[data-page-nav]").forEach((button) => {
        button.addEventListener("click", () => {
          currentListPage += button.dataset.pageNav === "next" ? 1 : -1;
          renderList(entries);
        });
      });
    }
  }

  function render(){
    markerLayer.clearLayers();
    markerIndex = [];

    const filtered = filteredEntries();
    if (activeMapContactId && !filtered.some((entry) => entry.id === activeMapContactId)) {
      activeMapContactId = "";
      mapMovedForActiveContact = false;
      renderMapDetail(null);
    }
    renderStateFilterMenu();
    buildStateHeatLayer(filtered);
    refreshStateInteractionLayer();

    if (gematikMarkerModeActive && !heatMapActive) {
      declutteredMarkerEntries(filtered).forEach(({ entry, latLng, compact }) => {
        const marker = gematikMarkerFor(entry, { latLng, compact });
        bindMapPointTooltip(marker, entry);
        marker.on('click', () => {
          focusMapContact(entry);
        });
        markerIndex.push({ marker, ids: [entry.id], data: entry });
        markerLayer.addLayer(marker);
      });
    } else markerBuckets(filtered).forEach((bucket) => {
      if (bucket.length === 1) {
        const d = bucket[0];
        const m = sectorPointFor(d);
        bindMapPointTooltip(m, d);
        m.on('click', () => {
          focusMapContact(d);
        });
        markerIndex.push({ marker: m, ids: [d.id], data: d });
        if (!heatMapActive) {
          markerLayer.addLayer(m);
        }
        return;
      }

      const active = bucket.some((entry) => entry.id === activeMapContactId);
      const lat = bucket.reduce((sum, entry) => sum + entry.lat, 0) / bucket.length;
      const lon = bucket.reduce((sum, entry) => sum + entry.lon, 0) / bucket.length;
      const marker = L.marker([lat, lon], { icon: clusterIcon(bucket.length, active) });
      marker.on('click', () => {
        fitMapToEntries(bucket);
      });
      markerIndex.push({ marker, ids: bucket.map((entry) => entry.id), data: bucket[0], entries: bucket });
      if (!heatMapActive) {
        markerLayer.addLayer(marker);
      }
    });

    if (heatMapActive) {
      stateSurfaceLayer.setStyle({ opacity: 0, fillOpacity: 0 });
      if (map.hasLayer(markerLayer)) map.removeLayer(markerLayer);
      if (stateInteractionLayer && map.hasLayer(stateInteractionLayer)) map.removeLayer(stateInteractionLayer);
      if (stateHeatLayer && !map.hasLayer(stateHeatLayer)) stateHeatLayer.addTo(map);
    } else {
      stateSurfaceLayer.setStyle(BASE_STATE_SURFACE_STYLE);
      if (!map.hasLayer(markerLayer)) map.addLayer(markerLayer);
      if (stateInteractionLayer && !map.hasLayer(stateInteractionLayer)) stateInteractionLayer.addTo(map);
      if (stateHeatLayer && map.hasLayer(stateHeatLayer)) map.removeLayer(stateHeatLayer);
      if (map.hasLayer(stateHeatCountLayer)) map.removeLayer(stateHeatCountLayer);
    }
    updateLabelVisibility();

    renderList(filtered);
    renderLegend(filtered);
    updateMapResetButton();
    updateMapModeControls();
    renderMapActiveFilters();

    const activePreview = filtered.find((entry) => entry.id === mobilePreviewContactId) || filtered.find((entry) => entry.id === activeMapContactId);
    if (EMBED_MODE) {
      renderMobilePreview(null);
      renderMapDetail(null);
    } else if (isMobileLayout()) {
      renderMobilePreview(null);
      if (activePreview) renderMapDetail(activePreview);
    } else {
      renderMobilePreview(activePreview || null);
    }
    if (!activePreview && isMobileLayout() && mobileSheetState === 'half') {
      setMobileSheetState('collapsed');
    }

    if (selectedState && elStateView.classList.contains('state-view-open')) {
      renderStateMap();
    }
  }

  elSearch.addEventListener('input', (e) => {
    query = e.target.value;
    resetListPage();
    render();
  });

  elStateFilterToggle.addEventListener('click', () => {
    const open = elStateFilterMenu.classList.contains('map-dropdown-menu-open');
    if (open) closeStateFilterMenu();
    else openStateFilterMenu();
  });

  elStateViewFilterToggle.addEventListener('click', () => {
    const open = elStateFilterMenu.classList.contains('map-dropdown-menu-open');
    if (open) closeStateFilterMenu();
    else openStateFilterMenu();
  });

  elStateViewClose.addEventListener('click', () => {
    closeStateView();
  });

  elMobileSheetToggle?.addEventListener('click', () => {
    cycleMobileSheetState();
  });

  elMapListToggle?.addEventListener('click', () => {
    toggleMapList();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMapFilterDropdowns();
  });

  window.addEventListener('resize', () => {
    if (isMobileLayout() && mapListCollapsed) setMapListCollapsed(false);
  });

  document.querySelector('.panel')?.addEventListener('pointerdown', (event) => {
    if (isMobileLayout()) event.stopPropagation();
  });

  document.querySelector('.panel')?.addEventListener('touchmove', (event) => {
    if (isMobileLayout()) event.stopPropagation();
  }, { passive: true });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.map-filter-dropdown')) {
      closeMapFilterDropdowns();
    }
    if (!event.target.closest('.map-dropdown') && !event.target.closest('.state-view-filter')) {
      closeStateFilterMenu();
    }
  });

  elMarkerToggle?.addEventListener('click', () => {
    gematikMarkerModeActive = true;
    heatMapActive = false;
    clusterModeActive = false;
    render();
  });

  elPointsToggle?.addEventListener('click', () => {
    gematikMarkerModeActive = false;
    heatMapActive = false;
    clusterModeActive = false;
    render();
  });

  elHeatMapToggle?.addEventListener('click', () => {
    gematikMarkerModeActive = false;
    heatMapActive = true;
    clusterModeActive = false;
    render();
  });

  elClusterToggle?.addEventListener('click', () => {
    gematikMarkerModeActive = false;
    clusterModeActive = true;
    heatMapActive = false;
    render();
  });

  elMapResetToggle?.addEventListener('click', () => {
    resetListPage();
    if (selectedState && activeMapContactId) {
      activeMapContactId = "";
      render();
      fitMapToState(selectedState);
      return;
    }
    resetMapFilters();
    fitMapToGermany();
  });

  renderFilters();
  renderStateFilterMenu();
  setMobileSheetState(isMobileLayout() ? 'full' : 'desktop');
  map.on('zoomend moveend', () => {
    render();
  });
  render();
  window.addEventListener("message", (event) => {
    const message = sanitizeMapDataMessage(event);
    if (!message) return;
    activeMapContext = message.context;
    activeMapLabels = message.labels;
    activeCurrentOwner = message.currentOwner;
    showOwnerFilter = message.showOwnerFilter;
    currentEntries = message.contacts.map(toMapEntry).filter(Boolean);
    selectedState = "";
    activeMapContactId = "";
    mobilePreviewContactId = "";
    activeOwnerFilter = "";
    resetListPage();
    if (elSearch) {
      elSearch.placeholder = mapLabel("searchPlaceholder", "Name, Organisation, Ort oder Thema suchen");
      elSearch.value = "";
      query = "";
    }
    if (elPanelTitle) elPanelTitle.textContent = mapLabel("listTitle", "Kontakte");
    renderMapDetail(null);
    setMobileSheetState(isMobileLayout() ? 'full' : 'desktop');
    renderFilters();
    renderStateFilterMenu();
    render();
    map.invalidateSize();
    if (!selectedState && !activeMapContactId) requestAnimationFrame(() => fitMapToGermany());
  });
  window.addEventListener('load', () => {
    activeCategoryFilter = "";
    activeOwnerFilter = "";
    activePriorityFilter = "";
    query = "";
    elSearch.value = "";
    elSearch.placeholder = mapLabel("searchPlaceholder", "Name, Organisation, Ort oder Thema suchen");
    if (elPanelTitle) elPanelTitle.textContent = mapLabel("listTitle", "Kontakte");
    renderFilters();
    renderStateFilterMenu();
    setMobileSheetState(isMobileLayout() ? 'full' : 'desktop');
    render();
    map.invalidateSize();
    if (!selectedState && !activeMapContactId) requestAnimationFrame(() => fitMapToGermany());
  });
  window.addEventListener('resize', () => {
    const mobileLayout = isMobileLayout();
    if (mobileLayout !== lastMobileLayout) resetListPage();
    lastMobileLayout = mobileLayout;
    setMobileSheetState(mobileLayout ? mobileSheetState : 'desktop');
    map.setMinZoom(currentMapMinZoom());
    map.invalidateSize();
    if (!selectedState && !activeMapContactId) requestAnimationFrame(() => fitMapToGermany());
    if (stateMap && elStateView.classList.contains('state-view-open')) {
      stateMap.invalidateSize();
    }
    cancelAnimationFrame(resizeListFrame);
    resizeListFrame = requestAnimationFrame(() => renderList(filteredEntries()));
  });
