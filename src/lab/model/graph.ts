// The street network as a graph, with shortest road distances (for trips) and shortest paths (for tracing lines).
import type { Streets } from '../data';

const SERVICE_ROAD_CLASS = 8;            // driveways and parking aisles (pipeline/boundary_lab/steps/streets.py ROAD_CLASSES)
const FEET_PER_DEGREE_LONGITUDE = 287000; // near 38.9° N
const FEET_PER_DEGREE_LATITUDE = 364000;

/** Adjacency in compressed form: node n's neighbours are entries firstEntry[n] .. firstEntry[n + 1] - 1 of the other arrays. */
export interface Graph {
  firstEntry: Uint32Array;  // per node (length nodeCount + 1)
  neighbour: Uint32Array;   // per entry: the node at the other end
  edge: Uint32Array;        // per entry: the street edge used
  feet: Float32Array;       // per entry: its length
  nodeCount: number;
}

/** Build the graph from the street arrays. `publicOnly` leaves out service drives (used when tracing boundaries). */
export function buildGraph(streets: Streets, publicOnly: boolean): Graph {
  const included = (edge: number) => !publicOnly || streets.cls[edge] < SERVICE_ROAD_CLASS;
  const degree = new Uint32Array(streets.nNodes + 1);
  for (let edge = 0; edge < streets.nEdges; edge++) {
    if (!included(edge)) continue;
    degree[streets.u[edge]]++; degree[streets.v[edge]]++;
  }
  const firstEntry = new Uint32Array(streets.nNodes + 1);
  for (let node = 0; node < streets.nNodes; node++) firstEntry[node + 1] = firstEntry[node] + degree[node];
  const nextFree = firstEntry.slice(0, streets.nNodes);
  const entryCount = firstEntry[streets.nNodes];
  const neighbour = new Uint32Array(entryCount), edgeOf = new Uint32Array(entryCount), feet = new Float32Array(entryCount);
  for (let edge = 0; edge < streets.nEdges; edge++) {
    if (!included(edge)) continue;
    const a = streets.u[edge], b = streets.v[edge];
    neighbour[nextFree[a]] = b; edgeOf[nextFree[a]] = edge; feet[nextFree[a]++] = streets.len[edge];
    neighbour[nextFree[b]] = a; edgeOf[nextFree[b]] = edge; feet[nextFree[b]++] = streets.len[edge];
  }
  return { firstEntry, neighbour, edge: edgeOf, feet, nodeCount: streets.nNodes };
}

/** Binary min-heap of (priority, node) pairs. */
class MinHeap {
  private priorities: number[] = [];
  private nodes: number[] = [];
  get size() { return this.priorities.length; }

  push(priority: number, node: number) {
    const priorities = this.priorities, nodes = this.nodes;
    let slot = priorities.length;
    priorities.push(priority); nodes.push(node);
    while (slot > 0) {
      const parent = (slot - 1) >> 1;
      if (priorities[parent] <= priority) break;
      priorities[slot] = priorities[parent]; nodes[slot] = nodes[parent]; slot = parent;
    }
    priorities[slot] = priority; nodes[slot] = node;
  }

  pop(): [number, number] {
    const priorities = this.priorities, nodes = this.nodes;
    const top: [number, number] = [priorities[0], nodes[0]];
    const lastPriority = priorities.pop()!, lastNode = nodes.pop()!;
    const count = priorities.length;
    if (count) {
      let slot = 0;
      while (true) {
        let child = 2 * slot + 1;
        if (child >= count) break;
        if (child + 1 < count && priorities[child + 1] < priorities[child]) child++;
        if (priorities[child] >= lastPriority) break;
        priorities[slot] = priorities[child]; nodes[slot] = nodes[child]; slot = child;
      }
      priorities[slot] = lastPriority; nodes[slot] = lastNode;
    }
    return top;
  }
}

/** Dijkstra: shortest road feet from `start` to every node. */
export function shortestDistances(graph: Graph, start: number): Float32Array {
  // float64 while searching: rounding to float32 could put a stored distance below the popped one and skip nodes
  const distance = new Float64Array(graph.nodeCount).fill(Infinity);
  const queue = new MinHeap();
  distance[start] = 0;
  queue.push(0, start);
  while (queue.size) {
    const [reached, node] = queue.pop();
    if (reached > distance[node]) continue;   // a shorter way here was already found
    for (let entry = graph.firstEntry[node]; entry < graph.firstEntry[node + 1]; entry++) {
      const next = graph.neighbour[entry], through = reached + graph.feet[entry];
      if (through < distance[next]) { distance[next] = through; queue.push(through, next); }
    }
  }
  return Float32Array.from(distance);
}

/** A* search: the shortest road path between two nodes, as the edges and nodes along it (or null if there is none). */
export function shortestPath(graph: Graph, from: number, to: number, streets: Streets): { edges: number[]; nodes: number[] } | null {
  if (from === to) return { edges: [], nodes: [from] };
  const targetLon = streets.nodeLon[to], targetLat = streets.nodeLat[to];
  // Straight-line feet to the target, slightly shortened so it never overestimates the road distance
  const straightLineGuess = (node: number) =>
    Math.hypot((streets.nodeLon[node] - targetLon) * FEET_PER_DEGREE_LONGITUDE, (streets.nodeLat[node] - targetLat) * FEET_PER_DEGREE_LATITUDE) * 0.98;
  const distance = new Map<number, number>(), cameFrom = new Map<number, number>(), viaEdge = new Map<number, number>();
  const queue = new MinHeap();
  distance.set(from, 0);
  queue.push(straightLineGuess(from), from);
  let found = false, steps = 0;
  while (queue.size && steps++ < 400000) {
    const [, node] = queue.pop();
    if (node === to) { found = true; break; }
    const reached = distance.get(node)!;
    for (let entry = graph.firstEntry[node]; entry < graph.firstEntry[node + 1]; entry++) {
      const next = graph.neighbour[entry], through = reached + graph.feet[entry];
      if (through < (distance.get(next) ?? Infinity)) {
        distance.set(next, through); cameFrom.set(next, node); viaEdge.set(next, graph.edge[entry]);
        queue.push(through + straightLineGuess(next), next);
      }
    }
  }
  if (!found) return null;
  const edges: number[] = [], nodes: number[] = [to];
  for (let node = to; node !== from;) { edges.push(viaEdge.get(node)!); node = cameFrom.get(node)!; nodes.push(node); }
  return { edges: edges.reverse(), nodes: nodes.reverse() };
}

/** The coordinates along a path, from its first node to its last. */
export function pathCoords(streets: Streets, path: { edges: number[]; nodes: number[] }): [number, number][] {
  const coordinates: [number, number][] = [[streets.nodeLon[path.nodes[0]], streets.nodeLat[path.nodes[0]]]];
  path.edges.forEach((edge, step) => {
    const points: [number, number][] = [];
    for (let k = streets.coordOff[edge]; k < streets.coordOff[edge + 1]; k++) points.push([streets.coordLon[k], streets.coordLat[k]]);
    if (streets.u[edge] !== path.nodes[step]) points.reverse();   // edges are stored u -> v; walk them the way the path goes
    for (let k = 1; k < points.length; k++) coordinates.push(points[k]);
  });
  return coordinates;
}
