    const params = new URLSearchParams(window.location.search);
    const lat = Number.parseFloat(params.get("lat") || "");
    const lon = Number.parseFloat(params.get("lon") || "");

    function toLatLngs(ringLngLat) {
      return ringLngLat.map((pt) => [pt[1], pt[0]]);
    }

    function germanyOuterRings(featureCollection) {
      const geom = featureCollection.features[0].geometry;
      const holes = [];

      if (geom.type === "Polygon") {
        holes.push(toLatLngs(geom.coordinates[0]));
      } else if (geom.type === "MultiPolygon") {
        geom.coordinates.forEach((poly) => holes.push(toLatLngs(poly[0])));
      }
      return holes;
    }

    const map = L.map("map", {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false,
      touchZoom: false,
      zoomSnap: 0.1,
      zoomDelta: 0.2
    });

    if (window.VERSORGUNGS_COMPASS_CONFIG?.dataMode !== "demo") {
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19
      }).addTo(map);
    }

    const germanyGeoJson = window.MAP_DE_GEOJSON;
    const worldRing = [[-90,-180],[-90,180],[90,180],[90,-180]];
    const holes = germanyOuterRings(germanyGeoJson);

    L.polygon([worldRing, ...holes], {
      stroke: false,
      fillColor: "#ffffff",
      fillOpacity: 0.84,
      interactive: false
    }).addTo(map);

    const germanyLayer = L.geoJSON(germanyGeoJson, {
      style: {
        color: "rgba(18,96,144,0.42)",
        weight: 1.7,
        fillColor: "rgba(53,132,194,0.12)",
        fillOpacity: 0.18
      },
      interactive: false
    }).addTo(map);

    const bounds = germanyLayer.getBounds();
    map.fitBounds(bounds.pad(0.08));
    map.setMaxBounds(bounds.pad(0.12));

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      L.marker([lat, lon], {
        icon: L.divIcon({
          className: "",
          html: '<div class="map-dot"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        }),
        interactive: false,
        keyboard: false
      }).addTo(map);
    }
