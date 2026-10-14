export type Status = 'Implemented' | 'Configured' | 'Planned' | 'Unverified';
export type Category = 'Frontend' | 'Backend' | 'API' | 'Database' | 'External' | 'Errors' | 'Admin';
export type Evidence = { file: string; line: number; symbol?: string; note?: string };
export type WorkflowNode = { id: string; label: string; category: Category; kind: string; status: Status; description: string; evidence: Evidence[]; endpoint?: string; fields?: string[] };
export type WorkflowEdge = { id: string; source: string; target: string; label?: string; failure?: boolean; proposed?: boolean };
export type Workflow = { id: string; title: string; subtitle: string; group: 'Business workflows' | 'Architecture'; nodes: WorkflowNode[]; edges: WorkflowEdge[]; notes: string[] };
export const colors: Record<Category,string> = {Frontend:'#3979de',Backend:'#8855c6',API:'#db8a2d',Database:'#369969',External:'#219a97',Errors:'#d65c65',Admin:'#687381'};
