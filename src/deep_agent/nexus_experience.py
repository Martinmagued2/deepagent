import os
import json
import time
import uuid
import requests
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

EXPERIENCES_FILE = os.path.join(os.getcwd(), ".nexus_experiences.json")


class Experience(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    title: str
    problem: str
    context: str = ""
    solution: str
    environment: str = ""
    attempted_solution: str = ""
    verification_executions: int = 1
    confidence: float = 0.95
    timestamp: float = Field(default_factory=time.time)
    verified: bool = True
    agent: str = "local-agent"
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
        tags=["fastapi", "vite", "cors", "react"],
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
        tags=["monaco", "react", "layout", "resize"],
    ),
    Experience(
        id="exp-node-monaco-amd",
        title="Monaco Loader Hijacks UMD Globals",
        problem="Loading Monaco's AMD loader before React/ReactDOM/Babel causes them to register as anonymous AMD modules and never set window globals — page renders blank with no error.",
        context="In-browser Babel JSX transpilation with Monaco editor on the same page.",
        solution="Load Monaco's loader.min.js AFTER all UMD libraries, or temporarily set `window.define = undefined` before loading React.",
        environment="React 18 + Babel Standalone + Monaco",
        verification_executions=3,
        confidence=0.99,
        tags=["monaco", "react", "babel", "amd", "loader"],
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
        tags=["react", "vite", "icons", "performance"],
    ),
    Experience(
        id="exp-npm-install-timeout",
        title="npm install Times Out on Slow Networks",
        problem="`npm install` exceeds 30-second timeout during agent build, leaving node_modules partial.",
        context="CI / agent builds with slow or proxied networks.",
        solution="Increase timeout to 180s and use `npm install --prefer-offline --no-audit --no-fund` for faster, quieter installs.",
        environment="Node.js + npm",
        verification_executions=11,
        confidence=0.97,
        tags=["npm", "timeout", "performance"],
    ),
]


class ExperienceNetwork:
    def __init__(self, endpoint: Optional[str] = None, agent_identity: str = "local-agent"):
        self.endpoint = endpoint or ""
        self.agent_identity = agent_identity
        self.experiences: List[Experience] = self._load()

    def _load(self) -> List[Experience]:
        if os.path.exists(EXPERIENCES_FILE):
            try:
                with open(EXPERIENCES_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return [Experience(**item) for item in data]
            except Exception as e:
                print(f"Error loading experiences: {e}")
        return list(DEFAULT_EXPERIENCES)

    def _save(self) -> None:
        try:
            with open(EXPERIENCES_FILE, "w", encoding="utf-8") as f:
                json.dump([exp.dict() for exp in self.experiences], f, indent=2)
        except Exception as e:
            print(f"Error saving experiences: {e}")

    def search(self, query: str) -> List[Experience]:
        # Local search
        local = self._search_local(query)
        # If a remote endpoint is configured and auto-retrieve is enabled, fetch remote too
        if self.endpoint:
            remote = self._search_remote(query)
            # Merge, dedupe by id, remote first if higher confidence
            seen = {e.id for e in local}
            for r in remote:
                if r.id not in seen:
                    local.append(r)
        return local

    def _search_local(self, query: str) -> List[Experience]:
        if not query or not query.strip():
            return list(self.experiences)
        tokens = [t.lower() for t in query.split() if t.strip()]
        results = []
        for exp in self.experiences:
            text = f"{exp.title} {exp.problem} {exp.solution} {exp.environment} {' '.join(exp.tags)}".lower()
            score = sum(1 for tok in tokens if tok in text)
            if score > 0:
                results.append((score, exp))
        results.sort(key=lambda x: x[0], reverse=True)
        return [r[1] for r in results]

    def _search_remote(self, query: str) -> List[Experience]:
        if not self.endpoint:
            return []
        try:
            r = requests.get(
                f"{self.endpoint.rstrip('/')}/api/experience/search",
                params={"q": query},
                timeout=10,
            )
            if r.status_code == 200:
                items = r.json()
                return [Experience(**item) for item in items]
        except Exception as e:
            print(f"Remote experience search failed: {e}")
        return []

    def publish(self, exp: Experience) -> Experience:
        exp.agent = self.agent_identity
        self.experiences.insert(0, exp)
        self._save()
        # Optionally push to remote
        if self.endpoint:
            try:
                requests.post(
                    f"{self.endpoint.rstrip('/')}/api/experience/publish",
                    json=exp.dict(),
                    timeout=10,
                )
            except Exception as e:
                print(f"Remote publish failed: {e}")
        return exp

    def format_for_agent(self, query: str, limit: int = 3) -> str:
        """Render experiences as a context string for the LLM agent prompt."""
        results = self.search(query)[:limit]
        if not results:
            return ""
        lines = []
        for exp in results:
            lines.append(
                f"- [{exp.title}] (confidence: {exp.confidence:.0%})\n"
                f"  Problem: {exp.problem}\n"
                f"  Solution: {exp.solution}\n"
                f"  Environment: {exp.environment}"
            )
        return "\n".join(lines)

    def propose_from_success(
        self, title: str, problem: str, solution: str,
        environment: str, context: str = "", tags: Optional[List[str]] = None,
    ) -> Experience:
        """Create a new experience candidate after a successful repair."""
        exp = Experience(
            title=title,
            problem=problem,
            solution=solution,
            environment=environment,
            context=context,
            tags=tags or [],
            verified=True,
            agent=self.agent_identity,
        )
        return exp


experience_network = ExperienceNetwork()
