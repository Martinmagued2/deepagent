import os
import shutil
import json
from typing import List, Dict, Any, Optional

PROJECTS_META_FILE = os.path.join(os.getcwd(), ".nexus_projects.json")

TEMPLATES = {
    "empty": {},
    "vanilla": {
        "index.html": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NexusAI App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>Hello from NexusAI</h1>
    <p>Your vanilla web application is ready.</p>
    <button id="btn">Click Me</button>
  </div>
  <script src="script.js"></script>
</body>
</html>""",
        "style.css": """* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
body { background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.container { background: #1e293b; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 450px; }
h1 { margin-bottom: 1rem; color: #38bdf8; }
p { color: #94a3b8; margin-bottom: 1.5rem; }
button { background: #38bdf8; color: #0f172a; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
button:hover { background: #0ea5e9; transform: translateY(-1px); }""",
        "script.js": """document.getElementById('btn').addEventListener('click', () => {
  alert('Welcome to NexusAI Workspace!');
});"""
    },
    "react": {
        "package.json": json.dumps({
            "name": "nexus-react-app",
            "private": True,
            "version": "0.0.0",
            "type": "module",
            "scripts": {
                "dev": "vite",
                "build": "vite build",
                "preview": "vite preview"
            },
            "dependencies": {
                "react": "^18.2.0",
                "react-dom": "^18.2.0",
                "lucide-react": "^0.344.0"
            },
            "devDependencies": {
                "@vitejs/plugin-react": "^4.2.1",
                "vite": "^5.1.4"
            }
        }, indent=2),
        "vite.config.js": """import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})""",
        "index.html": """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NexusAI React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>""",
        "src/main.jsx": """import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)""",
        "src/App.jsx": """import React, { useState } from 'react'
import { Sparkles } from 'lucide-react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="card">
      <div className="icon-header">
        <Sparkles className="icon" />
      </div>
      <h1>NexusAI React App</h1>
      <p>Built autonomously with your desktop AI IDE</p>
      <button onClick={() => setCount((c) => c + 1)}>
        Count is {count}
      </button>
    </div>
  )
}""",
        "src/index.css": """body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
  background: #090d16;
  color: #f1f5f9;
  font-family: Inter, system-ui, sans-serif;
  justify-content: center;
}
.card {
  padding: 2.5em;
  background: #111827;
  border-radius: 12px;
  border: 1px solid #1f2937;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0,0,0,0.6);
}
.icon-header {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}
.icon {
  color: #6366f1;
  width: 36px;
  height: 36px;
}
button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  background-color: #4f46e5;
  color: white;
  cursor: pointer;
  transition: border-color 0.25s;
}
button:hover {
  background-color: #4338ca;
}"""
    },
    "python": {
        "main.py": """def main():
    print("Welcome to your NexusAI Python project!")

if __name__ == "__main__":
    main()
""",
        "requirements.txt": "fastapi\nuvicorn\npydantic\n"
    },
    "node": {
        "package.json": json.dumps({
            "name": "nexus-node-app",
            "version": "1.0.0",
            "main": "index.js",
            "scripts": {
                "start": "node index.js"
            },
            "dependencies": {}
        }, indent=2),
        "index.js": """console.log("Hello from NexusAI Node.js App!");"""
    }
}

class WorkspaceManager:
    def __init__(self):
        self.active_project_path: str = os.path.abspath(os.path.join(os.getcwd(), "sandbox_app"))
        os.makedirs(self.active_project_path, exist_ok=True)
        self.recent_projects: List[str] = self._load_recent_projects()

    def _load_recent_projects(self) -> List[str]:
        if os.path.exists(PROJECTS_META_FILE):
            try:
                with open(PROJECTS_META_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("recent_projects", [self.active_project_path])
            except Exception:
                pass
        return [self.active_project_path]

    def _save_recent_projects(self) -> None:
        try:
            with open(PROJECTS_META_FILE, "w", encoding="utf-8") as f:
                json.dump({"recent_projects": self.recent_projects, "active": self.active_project_path}, f, indent=2)
        except Exception as e:
            print(f"Error saving recent projects: {e}")

    def set_active_project(self, path: str) -> Dict[str, Any]:
        abs_path = os.path.abspath(path)
        if not os.path.exists(abs_path):
            os.makedirs(abs_path, exist_ok=True)

        self.active_project_path = abs_path
        if abs_path in self.recent_projects:
            self.recent_projects.remove(abs_path)
        self.recent_projects.insert(0, abs_path)
        self.recent_projects = self.recent_projects[:10]
        self._save_recent_projects()

        return {
            "active_project": self.active_project_path,
            "name": os.path.basename(self.active_project_path),
            "recent_projects": self.recent_projects
        }

    def create_project(self, name: str, parent_dir: Optional[str] = None, template: str = "vanilla") -> Dict[str, Any]:
        parent = parent_dir if parent_dir else os.path.join(os.getcwd(), "projects")
        os.makedirs(parent, exist_ok=True)
        project_path = os.path.abspath(os.path.join(parent, name))
        os.makedirs(project_path, exist_ok=True)

        # Scaffolding template
        tmpl_files = TEMPLATES.get(template, TEMPLATES["vanilla"])
        for rel_path, content in tmpl_files.items():
            file_path = os.path.join(project_path, rel_path)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)

        return self.set_active_project(project_path)

    def get_file_tree(self, max_depth: int = 5) -> List[Dict[str, Any]]:
        ignored = {".git", ".venv", "__pycache__", "node_modules", ".DS_Store", "dist", "build"}
        root_dir = self.active_project_path

        def build_tree(current_dir: str, depth: int) -> List[Dict[str, Any]]:
            if depth > max_depth:
                return []
            items = []
            try:
                entries = sorted(os.listdir(current_dir))
            except Exception:
                return []

            for entry in entries:
                if entry in ignored:
                    continue
                full = os.path.join(current_dir, entry)
                rel = os.path.relpath(full, root_dir).replace("\\", "/")
                is_dir = os.path.isdir(full)
                node: Dict[str, Any] = {
                    "name": entry,
                    "path": rel,
                    "isDir": is_dir,
                }
                if is_dir:
                    node["children"] = build_tree(full, depth + 1)
                else:
                    node["size"] = os.path.getsize(full)
                items.append(node)
            return items

        return build_tree(root_dir, 1)

    def read_file(self, rel_path: str) -> str:
        clean_rel = rel_path.replace("\\", "/").strip().lstrip("/")
        full_path = os.path.abspath(os.path.join(self.active_project_path, clean_rel))
        if not full_path.startswith(self.active_project_path):
            raise ValueError("Security violation: path traversal outside project.")
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"File not found: {rel_path}")
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    def write_file(self, rel_path: str, content: str) -> None:
        clean_rel = rel_path.replace("\\", "/").strip().lstrip("/")
        full_path = os.path.abspath(os.path.join(self.active_project_path, clean_rel))
        if not full_path.startswith(self.active_project_path):
            raise ValueError("Security violation: path traversal outside project.")
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)

    def delete_entry(self, rel_path: str) -> None:
        clean_rel = rel_path.replace("\\", "/").strip().lstrip("/")
        full_path = os.path.abspath(os.path.join(self.active_project_path, clean_rel))
        if not full_path.startswith(self.active_project_path):
            raise ValueError("Security violation.")
        if os.path.isdir(full_path):
            shutil.rmtree(full_path)
        elif os.path.exists(full_path):
            os.remove(full_path)

    def create_directory(self, rel_path: str) -> None:
        clean_rel = rel_path.replace("\\", "/").strip().lstrip("/")
        full_path = os.path.abspath(os.path.join(self.active_project_path, clean_rel))
        if not full_path.startswith(self.active_project_path):
            raise ValueError("Security violation.")
        os.makedirs(full_path, exist_ok=True)

    def rename_entry(self, old_rel: str, new_rel: str) -> None:
        old_full = os.path.abspath(os.path.join(self.active_project_path, old_rel.strip().lstrip("/")))
        new_full = os.path.abspath(os.path.join(self.active_project_path, new_rel.strip().lstrip("/")))
        if not old_full.startswith(self.active_project_path) or not new_full.startswith(self.active_project_path):
            raise ValueError("Security violation.")
        os.rename(old_full, new_full)

    def search_workspace(self, query: str) -> List[Dict[str, Any]]:
        results = []
        if not query:
            return results
        ignored = {".git", ".venv", "__pycache__", "node_modules", "dist", "build"}
        q_lower = query.lower()

        for root, dirs, files in os.walk(self.active_project_path):
            dirs[:] = [d for d in dirs if d not in ignored]
            for file in files:
                full = os.path.join(root, file)
                rel = os.path.relpath(full, self.active_project_path).replace("\\", "/")
                try:
                    with open(full, "r", encoding="utf-8", errors="ignore") as f:
                        for line_idx, line in enumerate(f, 1):
                            if q_lower in line.lower():
                                results.append({
                                    "file": rel,
                                    "line": line_idx,
                                    "content": line.strip()
                                })
                                if len(results) >= 50:
                                    return results
                except Exception:
                    pass
        return results

workspace_mgr = WorkspaceManager()
