import { Node, Edge } from 'reactflow';

export const INITIAL_NODES: Node[] = [
  {
    id: 'root',
    type: 'card',
    data: {
      title: 'How did the Macintosh revolutionize computing?',
      body: `Introduction of the Graphical User Interface

The Macintosh revolutionized computing by popularizing the GUI and the mouse, making computers accessible beyond programmers.

Democratizing Computing
Icons, windows, and menus paired with the point-and-click mouse lowered barriers to entry and set a new standard for user-friendly design.

Impact on Software and Design
It championed WYSIWYG in desktop publishing and influenced OS design for decades.`,
      image: 'https://upload.wikimedia.org/wikipedia/commons/b/bf/IMac_M4_2024_2_%28cropped%29.jpg',
    },
    position: { x: 0, y: 0 },
  },
];

export const INITIAL_EDGES: Edge[] = [];
