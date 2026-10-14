import dagre from '@dagrejs/dagre';
export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 122;
export function layoutGraph<N extends {id:string}, E extends {source:string;target:string}>(nodes:N[], edges:E[], direction:'LR'|'TB'='LR') {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir:direction, nodesep:54, ranksep:84, marginx:32, marginy:32 });
  graph.setDefaultEdgeLabel(()=>({}));
  nodes.forEach(n=>graph.setNode(n.id,{width:NODE_WIDTH,height:NODE_HEIGHT}));
  edges.forEach(e=>graph.setEdge(e.source,e.target));
  dagre.layout(graph);
  return nodes.map(n=>({...n,position:{x:graph.node(n.id).x-NODE_WIDTH/2,y:graph.node(n.id).y-NODE_HEIGHT/2}}));
}
