export type Assessment = { question: string; options: string[]; answer: string; passScore: number };
export type NodeStatus = 'locked' | 'available' | 'completed' | 'teacher_unlocked';
export type GraphNode = { id: string; title: string; question: string; category: string; layer: number; content: string; sourceRefs: string[]; prerequisites: string[]; assessment: Assessment; status: NodeStatus };
export type Category = { id: string; name: string; color: string; shape?: string };
export type Graph = { caseId: string; caseTitle: string; centerSolution: { id: 'node_0'; title: string; content: string; sourceRefs: string[] }; categories: Category[]; nodes: GraphNode[]; edges: { source: string; target: string; type: 'radial' | 'prerequisite' }[] };
