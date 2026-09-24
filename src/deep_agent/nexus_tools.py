import os
import subprocess
from typing import Callable, List, Optional
from langchain_core.tools import tool


def build_agent_tools(
    project_path: str,
    event_emitter: Optional[Callable[[str, str, dict], None]] = None,
    approval_callback: Optional[Callable[[str, str, dict], bool]] = None,
):
    """Factory creating tools bound dynamically to the active project workspace.

    Args:
        project_path: absolute path to the active project root.
        event_emitter: optional async/sync callback(event_type, text, data).
        approval_callback: optional sync callback(tool_name, command, metadata) -> bool.
            Returns True if the user approved. If None, commands run without prompting.
    """

    def emit(event_type: str, text: str, data: dict = None):
        if event_emitter:
            event_emitter(event_type, text, data or {})

    def request_approval(tool_name: str, command: str, metadata: dict = None) -> bool:
        if approval_callback is None:
            return True
        return approval_callback(tool_name, command, metadata or {})

    def safe_join(rel_path: str) -> str:
        """Join rel_path to project_path and verify it stays inside."""
        clean = rel_path.replace("\\", "/").strip().lstrip("/")
        normalized = os.path.normpath(clean)
        if normalized.startswith("..") or os.path.isabs(normalized):
            raise ValueError(f"Path traversal rejected: {rel_path}")
        full = os.path.join(project_path, normalized)
        full_abs = os.path.abspath(full)
        if not full_abs.startswith(os.path.abspath(project_path)):
            raise ValueError(f"Path escapes workspace: {rel_path}")
        return full_abs

    # ------------------------------------------------------------------
    # FILE TOOLS
    # ------------------------------------------------------------------
    @tool
    def write_file(filename: str, content: str) -> str:
        """Create or overwrite a file in the active workspace project."""
        try:
            full_path = safe_join(filename)
        except ValueError as e:
            return f"ERROR: {e}"
        os.makedirs(os.path.dirname(full_path) or project_path, exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)
        emit("file_written", f"Wrote {filename} ({len(content)} chars)", {
            "filename": filename, "action": "write", "size": len(content)
        })
        return f"Successfully wrote {filename}"

    @tool
    def edit_file(filename: str, search_pattern: str, replacement: str) -> str:
        """Replace the first occurrence of search_pattern with replacement in filename."""
        try:
            full_path = safe_join(filename)
        except ValueError as e:
            return f"ERROR: {e}"
        if not os.path.exists(full_path):
            return f"ERROR: File does not exist: {filename}"
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        if search_pattern not in content:
            return f"ERROR: Search pattern not found in {filename}."
        new_content = content.replace(search_pattern, replacement, 1)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        emit("file_edited", f"Edited {filename}", {
            "filename": filename, "action": "edit",
            "added_lines": replacement.count("\n") + 1,
            "removed_lines": search_pattern.count("\n") + 1,
        })
        return f"Successfully updated {filename}"

    @tool
    def read_file(filename: str) -> str:
        """Read content of a project file."""
        try:
            full_path = safe_join(filename)
        except ValueError as e:
            return f"ERROR: {e}"
        if not os.path.exists(full_path):
            return f"ERROR: File does not exist: {filename}"
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
            emit("file_read", f"Read {filename}", {"filename": filename})
            return content
        except Exception as e:
            return f"ERROR: {e}"

    @tool
    def delete_file(filename: str) -> str:
        """Delete a file or directory from the workspace."""
        try:
            full_path = safe_join(filename)
        except ValueError as e:
            return f"ERROR: {e}"
        if not os.path.exists(full_path):
            return f"ERROR: File does not exist: {filename}"
        if os.path.isdir(full_path):
            import shutil
            shutil.rmtree(full_path)
        else:
            os.remove(full_path)
        emit("file_deleted", f"Deleted {filename}", {"filename": filename, "action": "delete"})
        return f"Deleted {filename}"

    @tool
    def create_directory(path: str) -> str:
        """Create a new directory (and parents) inside the workspace."""
        try:
            full_path = safe_join(path)
        except ValueError as e:
            return f"ERROR: {e}"
        os.makedirs(full_path, exist_ok=True)
        emit("dir_created", f"Created directory {path}", {"path": path})
        return f"Created directory {path}"

    @tool
    def list_directory(path: str = "") -> str:
        """List files and folders in the workspace (or a sub-path)."""
        ignored = {".git", ".venv", "__pycache__", "node_modules", "dist", "build", ".next"}
        try:
            base = safe_join(path) if path else os.path.abspath(project_path)
        except ValueError as e:
            return f"ERROR: {e}"
        if not os.path.isdir(base):
            return f"ERROR: Not a directory: {path}"
        files = []
        for root, dirs, filenames in os.walk(base):
            dirs[:] = [d for d in dirs if d not in ignored]
            for f in filenames:
                rel = os.path.relpath(os.path.join(root, f), project_path).replace("\\", "/")
                files.append(rel)
        result = "\n".join(sorted(files)) if files else "WORKSPACE IS EMPTY"
        emit("files_listed", f"Listed {len(files)} files", {"count": len(files)})
        return result

    @tool
    def search_files(query: str) -> str:
        """Search text occurrences in workspace files. Returns file:line content."""
        matches = []
        ignored = {".git", ".venv", "__pycache__", "node_modules", "dist", "build"}
        for root, dirs, filenames in os.walk(project_path):
            dirs[:] = [d for d in dirs if d not in ignored]
            for f in filenames:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, project_path).replace("\\", "/")
                try:
                    with open(full, "r", encoding="utf-8", errors="ignore") as file_obj:
                        for line_idx, line in enumerate(file_obj, 1):
                            if query.lower() in line.lower():
                                matches.append(f"{rel}:{line_idx} {line.strip()}")
                                if len(matches) >= 60:
                                    return "\n".join(matches)
                except Exception:
                    pass
        return "\n".join(matches) if matches else "NO MATCHES FOUND"

    # ------------------------------------------------------------------
    # TERMINAL & BUILD TOOLS
    # ------------------------------------------------------------------
    @tool
    def run_terminal(command: str) -> str:
        """Run a terminal command inside the workspace (npm install, npm run build, etc.)."""
        if not command.strip():
            return "ERROR: empty command"
        if command.strip().startswith("echo "):
            return "Notice: Use write_file to save content instead of echo."

        # Ask for approval if a callback is wired
        if not request_approval("run_terminal", command, {"cwd": project_path}):
            emit("command_denied", f"User denied command: {command}", {"command": command})
            return f"Command denied by user: {command}"

        emit("command_running", f"$ {command}", {"command": command, "cwd": project_path})
        try:
            res = subprocess.run(
                command, shell=True, cwd=project_path,
                capture_output=True, text=True, timeout=180,
            )
            out_lines = [f"EXIT CODE: {res.returncode}"]
            if res.stdout:
                out_lines.append(f"STDOUT:\n{res.stdout[-3000:]}")
            if res.stderr:
                out_lines.append(f"STDERR:\n{res.stderr[-3000:]}")
            output_str = "\n".join(out_lines)
            emit("command_finished", output_str, {
                "command": command, "code": res.returncode,
                "stdout": (res.stdout or "")[-1000:],
                "stderr": (res.stderr or "")[-1000:],
            })
            return output_str
        except subprocess.TimeoutExpired:
            err = f"Command timed out after 180s: {command}"
            emit("command_error", err, {"command": command})
            return err
        except Exception as e:
            err = f"ERROR executing command: {e}"
            emit("command_error", err, {"command": command, "error": str(e)})
            return err

    @tool
    def install_dependency(package: str, manager: str = "auto") -> str:
        """Install a dependency using npm, pip, or another detected package manager."""
        # Detect package manager
        if manager == "auto":
            if os.path.exists(os.path.join(project_path, "package.json")):
                manager = "npm"
            elif os.path.exists(os.path.join(project_path, "requirements.txt")):
                manager = "pip"
            elif os.path.exists(os.path.join(project_path, "pyproject.toml")):
                manager = "uv"
            else:
                return "ERROR: No recognized package manager found (need package.json, requirements.txt, or pyproject.toml)."

        if manager == "npm":
            cmd = f"npm install {package}"
        elif manager == "pip":
            cmd = f"pip install {package}"
        elif manager == "uv":
            cmd = f"uv add {package}"
        elif manager == "yarn":
            cmd = f"yarn add {package}"
        elif manager == "pnpm":
            cmd = f"pnpm add {package}"
        else:
            return f"ERROR: Unknown package manager: {manager}"

        emit("installing", f"Installing {package} via {manager}", {"package": package, "manager": manager})
        return run_terminal.invoke({"command": cmd})

    @tool
    def run_tests(framework: str = "auto") -> str:
        """Run the project's test suite. Detects npm test, pytest, jest, etc."""
        if framework == "auto":
            if os.path.exists(os.path.join(project_path, "package.json")):
                framework = "npm"
            elif os.path.exists(os.path.join(project_path, "pytest.ini")) or any(
                f.startswith("test_") for f in os.listdir(project_path) if os.path.isfile(os.path.join(project_path, f))
            ):
                framework = "pytest"
            else:
                return "No test framework detected. Try run_terminal('npm test') manually."

        if framework == "npm":
            cmd = "npm test -- --watchAll=false 2>&1 || npm test"
        elif framework == "pytest":
            cmd = "python -m pytest -v"
        elif framework == "jest":
            cmd = "npx jest"
        else:
            return f"Unknown test framework: {framework}"

        emit("testing", f"Running tests via {framework}", {"framework": framework})
        return run_terminal.invoke({"command": cmd})

    @tool
    def run_build() -> str:
        """Run the project's build step (npm run build, vite build, tsc, etc.)."""
        pkg = os.path.join(project_path, "package.json")
        if os.path.exists(pkg):
            import json
            try:
                with open(pkg) as f:
                    pkg_data = json.load(f)
                scripts = pkg_data.get("scripts", {})
                if "build" in scripts:
                    emit("building", "Running npm run build", {})
                    return run_terminal.invoke({"command": "npm run build"})
            except Exception:
                pass
        # Python has no universal build step
        emit("building", "No build script found; skipping", {})
        return "No build script found."

    @tool
    def get_git_diff(file_path: str = "") -> str:
        """Get the git diff for the whole project or a specific file."""
        from deep_agent.nexus_git import get_git_diff as _get_diff
        diff = _get_diff(project_path, file_path)
        emit("git_diff", f"Diff for {file_path or 'all files'}", {"file_path": file_path, "diff": diff[:2000]})
        return diff or "(no changes)"

    return [
        write_file,
        edit_file,
        read_file,
        delete_file,
        create_directory,
        list_directory,
        search_files,
        run_terminal,
        install_dependency,
        run_tests,
        run_build,
        get_git_diff,
    ]
