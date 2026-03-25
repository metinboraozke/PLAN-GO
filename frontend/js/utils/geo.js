/**
 * PLANİGO - Geospatial Utilities
 * Pure functions, no DOM or API side effects.
 */

/**
 * Haversine formula — distance in km between two lat/lng points.
 */
export function calcDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ray-casting point-in-polygon test.
 * @param {[number, number]} point - [x, y]
 * @param {[number, number][]} vs   - polygon vertices [[x, y], ...]
 */
export function pointInPolygon(point, vs) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Test whether [lng, lat] falls inside a GeoJSON Polygon or MultiPolygon layer.
 * @param {number} lng
 * @param {number} lat
 * @param {Object} layer - Leaflet GeoJSON layer with feature.geometry
 */
export function isPointInLayer(lng, lat, layer) {
    const geom = layer.feature.geometry;
    if (geom.type === 'Polygon') {
        return pointInPolygon([lng, lat], geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
        for (let poly of geom.coordinates) {
            if (pointInPolygon([lng, lat], poly[0])) return true;
        }
    }
    return false;
}
