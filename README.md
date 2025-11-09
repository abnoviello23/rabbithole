# 🐰 RabbitHole

### Neo 2025 Hackathon Submission

**RabbitHole** is an AI-powered visual knowledge exploration platform that transforms Q&A into interactive mind maps. Powered by agentic search using Exa AI and MCP tools, it gathers data from any source at any granularity. Ask a question, dive deeper with follow-ups, highlight specific text for contextual queries, and watch your curiosity branch into a beautiful web of connected knowledge.

---

## 🐙 Project Architecture (Octopus Chart)

```
                                    🎯 User Question
                                          |
                    ┌─────────────────────┴─────────────────────┐
                    |                                           |
            🎨 FRONTEND (Next.js)                    🧠 BACKEND (FastAPI)
                    |                                           |
        ┌───────────┴───────────┐                 ┌─────────────┴─────────────┐
        |                       |                 |                           |
    📊 Canvas View      💬 Chat View      🤖 OpenAI API          📦 Vector Store
        |                       |                 |                           |
        |                       |         ┌───────┴───────┐          ┌────────┴────────┐
        |                       |         |               |          |                 |
    ┌───┴───┐           ┌───────┴──┐  Generate    Auto    Cluster   Embeddings    Cache
    |       |           |          |  Content     Mode    Analysis  (similarity)  (MD5)
    |       |           |          |     |          |        |
  Cards  Edges      Linear    Highlights  |          |        |
  Nodes  Colors     Thread   Context   |          |        |
                                        |          |        |
                    ┌───────────────────┴──────────┴────────┴────────┐
                    |                                                 |
                ⚡ TENTACLES (Core Features)                         |
                    |                                                 |
        ┌───────────┼───────────┬───────────┬───────────┬────────────┼────────┐
        |           |           |           |           |            |        |
    🎯 Text    🌈 Color   💾 Session  🧩 Semantic  🔗 Context   📝 Markdown  🎨 Viz
    Highlight  Coding    Persist    Clustering   Chain       Render     Layout
        |           |           |           |           |            |        |
   (Select &  (Trace    (Auto-    (K-Means   (Path      (Prose     (Dagre
    Query)    Paths)    Save)     Grouping)  Building)   + GFM)     Engine)
                    |                                                 |
            ┌───────┴───────┐                              ┌──────────┴──────────┐
            |               |                              |                     |
        🔍 Agentic      🌐 MCP Tools                  🧠 Claude Agent      📡 Exa AI
        Search          (Model Context)                  SDK                  (Web Search)
            |               |                              |                     |
    (Exa AI + MCP)  (Any Data Source)              (Orchestration)      (Internet Access)
```

### Architecture Flow

1. **User Input** → User asks a question from any node
2. **Frontend Processing** → React Flow canvas renders interactive cards
3. **Context Building** → System builds path from root to current node
4. **API Request** → Backend receives query + full conversation context
5. **Agentic Search** → For deep queries, Claude Agent SDK orchestrates:
   - Exa AI web search for comprehensive internet research
   - MCP tools to access any data source at any granularity
   - Multiple search iterations for thorough coverage
6. **AI Generation** → GPT-4 synthesizes findings into concise, focused response
7. **Visualization** → New node appears with auto-layout
8. **Exploration** → User can:
   - Click follow-up button to ask more
   - Highlight text to ask contextual questions
   - View conversation as linear chat
   - Switch between sessions

---

## ✨ Key Features

### 🎨 Visual Mind Mapping
- **Interactive Canvas**: Zoom, pan, and explore your knowledge graph
- **Auto-Layout**: Intelligent hierarchical layout using Dagre algorithm
- **Color-Coded Paths**: Each question branch gets a unique color for easy tracking
- **Dual View**: Toggle between canvas (mind map) and chat (linear conversation)

### 🤖 AI-Powered Intelligence
- **Agentic Search**: Uses Exa AI to search the entire internet for real-time, comprehensive information
- **MCP Tools Integration**: Access any data source through Model Context Protocol (MCP) tools
- **Infinite Granularity**: Dive infinitely deep into any topic - no knowledge base limitations
- **Contextual Responses**: AI understands the full conversation path
- **Smart Content Generation**: Concise, focused answers (max 80 words)
- **Text Highlighting**: Select any text and ask specific questions about it
- **Suggested Follow-ups**: AI proposes 2 relevant next questions

### 🧩 Advanced Features
- **Semantic Clustering**: Group related nodes using K-means on embeddings
- **Auto Mode**: Find most relevant node for a query using cosine similarity
- **Session Management**: Save, load, and switch between multiple "rabbit holes"
- **Persistent Highlights**: Visual memory of what you've explored
- **Embedding Cache**: MD5-based caching for faster repeated queries

### 🎯 User Experience
- **Root Node Entry Point**: Start with "What's your rabbit hole? 🐰"
- **Loading States**: Elegant spinners during content generation
- **Markdown Support**: Rich text rendering with GFM (GitHub Flavored Markdown)
- **External Links**: Automatic link detection with icons
- **Selection Popup**: Context menu appears when you highlight text
- **Active Path Highlighting**: Visual emphasis on currently selected conversation thread

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 16 (React 19)
- **Visualization**: ReactFlow (interactive node graphs)
- **Layout Engine**: Dagre (hierarchical auto-layout)
- **Styling**: Tailwind CSS 4
- **Markdown**: react-markdown + remark-gfm
- **Icons**: Lucide React
- **Language**: TypeScript

### Backend
- **Framework**: FastAPI (Python)
- **AI/ML**: 
  - OpenAI API
    - GPT-4o (with search preview) for content generation
    - text-embedding-3-small for semantic search
  - **Exa AI**: Agentic web search for comprehensive internet research
  - **Claude Agent SDK**: For agentic search orchestration
- **MCP Tools**: Model Context Protocol integration
  - Exa AI MCP server for web search
  - OpenAI summary tools for content synthesis
- **ML Libraries**: 
  - NumPy (vector operations)
  - scikit-learn (K-means clustering)
- **Server**: Uvicorn (ASGI)
- **Configuration**: python-dotenv

### Architecture Patterns
- **State Management**: React hooks + ReactFlow state
- **API Communication**: REST (JSON)
- **Data Persistence**: localStorage (client-side sessions)
- **Caching**: In-memory embedding cache with content hashing

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 20+ and npm
- **Python** 3.8+
- **OpenAI API Key**
- **Exa AI API Key** (for agentic search features)

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with your API keys
echo "OPENAI_API_KEY=your-key-here" > .env
echo "EXA_API_KEY=your-exa-key-here" >> .env

# Start the server
python main.py
# Server runs on http://localhost:8000
```

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
# App runs on http://localhost:3000
```

### Environment Variables

**Backend** (`.env` in `backend/`):
```env
OPENAI_API_KEY=sk-...
EXA_API_KEY=your-exa-api-key
```

**Frontend** (optional, `.env.local` in `frontend/`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 📖 How to Use

### Starting Your First Rabbit Hole

1. **Ask Initial Question**: Type your question in the root node
   - Example: "How does quantum computing work?"

2. **Explore Response**: Read the AI-generated answer in the new card

3. **Dive Deeper**: Click the ➕ button below any card to ask follow-up questions

4. **Highlight & Query**: 
   - Select any text in a card
   - A colored popup appears
   - Type your question about that specific text
   - Creates a color-coded branch

5. **View as Chat**: Click the 📄 button (top-right) to see linear conversation view

6. **Switch Sessions**: Click the session dropdown (top-left) to:
   - Create new rabbit hole
   - Load previous sessions
   - Delete old sessions

### Advanced Tips

- **Agentic Search**: When you ask deep questions, the system uses Exa AI to search the internet and gather information from any source at any level of detail
- **MCP Tools**: The platform leverages Model Context Protocol tools to access diverse data sources beyond traditional knowledge bases
- **Infinite Depth**: Unlike static knowledge bases, you can explore topics to any level of granularity - from high-level concepts to specific technical details
- **Color Coding**: Each highlighted text question gets a random color - both the edge and the resulting node use this color
- **Active Path**: When viewing chat, the selected path glows on the canvas
- **Context Awareness**: The AI always has access to the full path from root to current node
- **Markdown Support**: Responses can include **bold**, *italic*, lists, and [links](https://example.com)

---

## 🧪 API Endpoints

### POST `/generate`
Generate AI content for a node

**Request**:
```json
{
  "user_query": "What are the benefits?",
  "selected_context": "quantum superposition",  // optional
  "path": "node-1/node-2/node-3",
  "context": {
    "node-1": { "id": "node-1", "title": "...", "content": "..." },
    "node-2": { "id": "node-2", "title": "...", "content": "..." }
  }
}
```

**Response**:
```json
{
  "title": "Benefits of Quantum Computing",
  "response": "Quantum computers can solve certain problems exponentially faster...",
  "suggested_questions": [
    "How does quantum entanglement work?",
    "What are current limitations?"
  ]
}
```

### POST `/automode`
Find most relevant node for a query using semantic similarity

**Request**:
```json
{
  "query": "machine learning applications",
  "nodes": {
    "node-1": { "id": "node-1", "title": "...", "content": "...", "query": "..." }
  }
}
```

**Response**:
```json
{
  "node_id": "node-42",
  "similarity": 0.87
}
```

### POST `/cluster`
Cluster nodes by semantic similarity and generate titles

**Request**:
```json
{
  "context": {
    "node-1": { "id": "node-1", "title": "...", "content": "...", "query": "..." },
    "node-2": { "id": "node-2", "title": "...", "content": "...", "query": "..." }
  }
}
```

**Response**:
```json
{
  "Quantum Mechanics": ["node-1", "node-5", "node-8"],
  "Computer Architecture": ["node-2", "node-6"],
  "Applications": ["node-3", "node-4", "node-7"]
}
```

---

## 🏗️ Project Structure

```
rabbithole/
├── backend/
│   ├── main.py              # FastAPI server + endpoints
│   ├── agent.py             # Agentic search with Exa AI & MCP tools
│   ├── requirements.txt      # Python dependencies
│   └── .env                 # API keys (OpenAI, Exa AI)
│
├── frontend/
│   ├── app/
│   │   ├── components/
│   │   │   ├── Canvas.tsx        # Main ReactFlow canvas
│   │   │   ├── CardNode.tsx      # Individual card component
│   │   │   ├── ChatPanel.tsx     # Linear conversation view
│   │   │   ├── CustomEdge.tsx    # Edge rendering
│   │   │   └── SessionManager.tsx # Session controls
│   │   ├── data/
│   │   │   └── initialNodes.ts   # Starting state
│   │   ├── utils/
│   │   │   ├── api.ts            # Backend API calls
│   │   │   └── layout.ts         # Dagre layout engine
│   │   ├── page.tsx              # Next.js root page
│   │   ├── layout.tsx            # App layout
│   │   └── globals.css           # Global styles
│   ├── package.json
│   └── tsconfig.json
│
└── README.md                # This file!
```

---

## 🎯 Neo 2025 Hackathon Highlights

### Innovation
- **Agentic Search Architecture**: First-of-its-kind integration of Exa AI and MCP tools for unlimited knowledge exploration
- **Infinite Granularity**: Access any data source at any level of detail - no knowledge base boundaries
- **Novel UI Pattern**: Transforms traditional chat into explorable mind maps
- **Context-Aware AI**: Full conversation history passed to model
- **Visual Memory**: Color-coded highlights show what you've explored
- **Dual Modality**: Seamlessly switch between spatial and linear views

### Technical Excellence
- **Agentic Search**: Exa AI integration for comprehensive web research
- **MCP Tools**: Model Context Protocol enables access to any data source
- **Smart Caching**: MD5-based embedding cache reduces API costs
- **Semantic Search**: Vector similarity for intelligent node matching
- **Auto-Clustering**: K-means with elbow method for optimal grouping
- **Real-time Layout**: Dagre algorithm for hierarchical positioning

### User Experience
- **Zero Friction**: No login, instant start
- **Visual Feedback**: Loading states, highlights, color coding
- **Persistent Sessions**: Auto-save with localStorage
- **Responsive**: Smooth transitions and animations

### Scalability
- **Modular Architecture**: Clean separation of concerns
- **Type Safety**: Full TypeScript coverage
- **Performance**: Efficient React rendering with memoization
- **Extensible**: Easy to add new AI models or visualization modes

---

## 🔮 Future Enhancements

- [ ] **Collaborative Mode**: Share rabbit holes with others
- [ ] **Export Options**: PDF, PNG, or JSON export
- [ ] **Custom Models**: Support for different AI models
- [ ] **Voice Input**: Ask questions by speaking
- [ ] **Search & Filter**: Find nodes across all sessions
- [ ] **Themes**: Light mode and custom color schemes
- [ ] **Mobile Support**: Touch-optimized interface
- [ ] **Cloud Sync**: Save sessions to cloud
- [ ] **Graph Analytics**: Insights about exploration patterns
- [ ] **Bookmarks**: Mark important nodes

---

## 🤝 Contributing

This project was built for the **Neo 2025 Hackathon**. Contributions, ideas, and feedback are welcome!

### Development

```bash
# Backend hot-reload
cd backend
uvicorn main:app --reload

# Frontend hot-reload
cd frontend
npm run dev
```

---

## 📝 License

MIT License - feel free to use this for your own knowledge exploration!

---

## 🙏 Acknowledgments

- **Neo 2025 Hackathon** for inspiring this project
- **OpenAI** for GPT-4 and embeddings API
- **Exa AI** for agentic web search capabilities
- **Anthropic** for Claude Agent SDK and MCP tools
- **ReactFlow** for the amazing graph visualization library
- **FastAPI** for the elegant Python backend framework
- **Dagre** for hierarchical layout algorithms

---

## 💬 Contact

Built with ❤️ for Neo 2025 Hackathon

**Happy exploring! Fall down the rabbit hole! 🐰🕳️**

