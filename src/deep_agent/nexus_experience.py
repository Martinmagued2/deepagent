import os
import json
import time
import uuid
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

EXPERIENCES_FILE = os.path.join(os.getcwd(), ".nexus_experiences.json")

class Experience(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    title: str
    problem: str
    context: str
    solution: str
    environment: str
    verification_executions: int = 1
    confidence: float = 0.95
    timestamp: float = Field(default_factory=time.time)
    verified: bool = True
    tags: List[str] = Field(default_factory=list)

DEFAULT_EXPERIENCES = [
    Experience(
        id="exp-cors-1",
        title="FastAPI + Vite CORS Setup",
        problem="Browser blocks API calls from Vite dev server (port 5173) to FastAPI (port 8000) with CORS preflight error.",
        context="FastAPI backend serving frontend clients during development.",
        solution="Add `CORSMiddleware` with `allow_origins=['*']` and `allow_headers=['*']` before mounting static files.",
        environment="FastAPI + Vite / React",
        verification_executions=14,
        confidence=0.99,
        tags=["fastapi", "vite", "cors", "react"]
    ),
    Experience(
        id="exp-react-monaco",
        title="Monaco Editor Dynamic Resizing",
        problem="Monaco editor canvas does not adapt when sidebar or terminal drawer expands.",
        context="Desktop / Web IDE split pane layouts.",
        solution="Attach ResizeObserver on container and call `editor.layout()` on dimension change.",
        environment="React + Monaco Editor",
        verification_executions=8,
        confidence=0.98,
        tags=["monaco", "react", "layout", "resize"]
    ),
    Experience(
        id="exp-node-lucide",
        title="Lucide React Icon Import Optimization",
        problem="Large bundle size when importing whole lucide-react package.",
        context="Vite + React modern bundle optimization.",
        solution="Import individual named icons e.g. `import { Sparkles, Terminal } from 'lucide-react'`.",
        environment="React + Vite + Lucide",
        verification_executions=22,
        confidence=0.99,
        tags=["react", "vite", "icons", "performance"]
    )
]

class ExperienceNetwork:
    def __init__(self):
        self.experiences: List[Experience] = self._load()

    def _load(self) -> List[Experience]:
        if os.path.exists(EXPERIENCES_FILE):
            try:
                with open(EXPERIENCES_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return [Experience(**item) for item in data]
            except Exception as e:
                print(f"Error loading experiences: {e}")
        return DEFAULT_EXPERIENCES

    def _save(self) -> None:
        try:
            with open(EXPERIENCES_FILE, "w", encoding="utf-8") as f:
                json.dump([exp.dict() for exp in self.experiences], f, indent=2)
        except Exception as e:
            print(f"Error saving experiences: {e}")

    def search(self, query: str) -> List[Experience]:
        if not query or not query.strip():
            return self.experiences
        tokens = [t.lower() for t in query.split() if t.strip()]
        results = []
        for exp in self.experiences:
            text = f"{exp.title} {exp.problem} {exp.solution} {exp.environment} {' '.join(exp.tags)}".lower()
            score = sum(1 for tok in tokens if tok in text)
            if score > 0:
                results.append((score, exp))
        results.sort(key=lambda x: x[0], reverse=True)
        return [r[1] for r in results]

    def publish(self, exp: Experience) -> Experience:
        self.experiences.insert(0, exp)
        self._save()
        return exp

experience_network = ExperienceNetwork()
