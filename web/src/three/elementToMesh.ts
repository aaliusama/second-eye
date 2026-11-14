import type { MeshStandardMaterial } from "three";
import type { Element, Scene } from "@site/contracts";
import { elementSolid, type Solid } from "./geometry";
import { edgeByState, fillByState, slabByState, type EdgeStyle } from "./materials";

// Owner: H. The one mapping from a scene element to what the 3D view draws.

export interface MeshProps {
  id: string;
  name: string;
  solid: Solid;
  fill: MeshStandardMaterial;
  edge: EdgeStyle;
  castShadow: boolean;
  /** Rooms and zones carry their name on the floor. */
  label?: string;
  /** Rooms and zones sit under walls; picking prefers walls and markers. */
  isFloor: boolean;
}

export function elementToMesh(element: Element, scene?: Scene): MeshProps {
  const solid = elementSolid(element, scene);
  const isFloor = element.type === "room" || element.type === "zone";
  return {
    id: element.id,
    name: element.name,
    solid,
    fill: isFloor ? slabByState[element.state] : fillByState[element.state],
    edge: edgeByState[element.state],
    castShadow: !isFloor,
    label: isFloor ? element.name : undefined,
    isFloor,
  };
}
