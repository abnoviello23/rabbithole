import { Node, Edge } from 'reactflow';

export const INITIAL_NODES: Node[] = [
  {
    id: 'root',
    type: 'card',
    data: {
      title: '',
      body: '',
      image: '',
      isRoot: true,
    },
    position: { x: 0, y: 0 },
  },
];

export const INITIAL_EDGES: Edge[] = [];
