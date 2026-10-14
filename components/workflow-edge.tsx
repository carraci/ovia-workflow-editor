'use client';
import {BaseEdge,EdgeLabelRenderer,getSmoothStepPath,type EdgeProps} from '@xyflow/react';
export function WorkflowConnection(props:EdgeProps){
 const points=props.data?.points as {x:number;y:number}[]|undefined;
 const initial=props.data?.initial as {sx:number;sy:number;tx:number;ty:number}|undefined;
 const unchanged=initial&&Math.abs(initial.sx-props.sourceX)<2&&Math.abs(initial.sy-props.sourceY)<2&&Math.abs(initial.tx-props.targetX)<2&&Math.abs(initial.ty-props.targetY)<2;
 const [fallback,labelX,labelY]=getSmoothStepPath(props);
 const d=unchanged&&points?.length?`M${props.sourceX},${props.sourceY} L${points.slice(1,-1).map(p=>`${p.x},${p.y}`).join(' L')} L${props.targetX},${props.targetY}`.replace(' L L',' L'):fallback;
 const pos=unchanged?props.data?.labelPosition as {x:number;y:number}|null:null;
 return <><BaseEdge id={props.id} path={d} markerEnd={props.markerEnd} style={props.style}/>{props.label?<EdgeLabelRenderer><div className={`edge-label nodrag nopan ${props.data?.failure?'edge-failure':''}`} style={{transform:`translate(-50%, -50%) translate(${pos?.x??labelX}px,${pos?.y??labelY}px)`}}>{props.label}</div></EdgeLabelRenderer>:null}</>;
}
