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
      touchZoom: false
    });

    const worldRing = [[-90,-180],[-90,180],[90,180],[90,-180]];
    const holes = germanyOuterRings(window.MAP_DE_GEOJSON);

    L.polygon([worldRing, ...holes], {
      stroke: false,
      fillColor: "#000",
      fillOpacity: 0.08,
      interactive: false
    }).addTo(map);

    const germanyLayer = L.geoJSON(window.MAP_DE_GEOJSON, {
      style: {
        color: "rgba(18,96,144,0.28)",
        weight: 1.6,
        fillColor: "rgba(53,132,194,0.08)",
        fillOpacity: 0.12
      },
      interactive: false
    }).addTo(map);

    const bounds = germanyLayer.getBounds();
    map.fitBounds(bounds.pad(0.14));
    map.setZoom(Math.min(map.getZoom(), 8));
