import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import statesTopo from "us-atlas/states-albers-10m.json";

export const MAP_WIDTH = 975;
export const MAP_HEIGHT = 610;

// us-atlas's albers files are pre-projected for exactly this projection, so
// state outlines and venue dots line up (Alaska/Hawaii insets included).
const projection = geoAlbersUsa().scale(1300).translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);

let statePaths: string[] | null = null;

export function getStatePaths(): string[] {
  if (statePaths) return statePaths;
  const topo = statesTopo as unknown as Topology;
  const states = feature(topo, topo.objects.states as GeometryCollection);
  const toPath = geoPath().digits(1);
  statePaths = states.features.map((f) => toPath(f)).filter((d): d is string => !!d);
  return statePaths;
}

/** Projects a lat/lng onto the map; null when it falls outside the US map (e.g. Ireland). */
export function projectPoint(
  latitude: number | null,
  longitude: number | null
): [number, number] | null {
  if (latitude == null || longitude == null) return null;
  return projection([longitude, latitude]);
}
