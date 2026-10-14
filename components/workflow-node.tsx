'use client';
import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ArrowUpRight, Braces, Database, Globe2, ShieldCheck, TriangleAlert, Workflow, Zap, GitBranch, Webhook } from 'lucide-react';
import { colors, type WorkflowNode } from '@/lib/types';
type Data = WorkflowNode & { [key:string]:unknown };
export type AtlasNode = Node<Data,'atlas'>;
const icons={Frontend:ArrowUpRight,Backend:Braces,API:Workflow,Database,External:Globe2,Errors:TriangleAlert,Admin:ShieldCheck};
export const WorkflowCard = memo(function WorkflowCard({data,selected}:NodeProps<AtlasNode>){
 const Icon=data.kind==='Trigger'?Zap:data.kind==='IF / Switch'?GitBranch:data.kind==='Webhook'?Webhook:icons[data.category];
 return <div className={`workflow-node ${selected?'node-selected':''} ${data.status==='Planned'?'node-planned':''}`} style={{'--node-color':colors[data.category]} as React.CSSProperties}>
  <Handle type="target" position={Position.Left}/>
  <div className="node-kind"><span className="node-icon"><Icon size={17}/></span><span>{data.kind}</span></div>
  <div className="node-title" title={data.label}>{data.label}</div>
  <div className="node-foot"><span><i/>{data.status}</span><span>{data.evidence[0]?`source :${data.evidence[0].line}`:'proposed design'}</span></div>
  <Handle type="source" position={Position.Right}/>
 </div>;
});
