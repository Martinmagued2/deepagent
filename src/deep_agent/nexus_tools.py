import os
import subprocess
from typing import Callable, List, Optional
from langchain_core.tools import tool

def build_agent_tools(project_path: str, event_emitter: Optional[Callable[[str, str, dict], None]] = None):
    """Factory creating tools bound dynamically to the active project workspace."""

    def emit(event_type: str, text: str, data: dict = None):
        if event_emitter:
            event_emitter(event_type, text, data or {})

    @tool
    def write_file(filename: str, content: str) -> str:
        """Create or overwrite a file in the active workspace project."""
        filename = filename.replace("\\", "/").strip().lstrip("/")
        if not filename:
            return "ERROR: Filename is empty."
        normalized = os.path.normpath(filename)
        if normalized.startswith("..") or os.path.isabs(normalized):
            return "ERROR: Invalid file path."

        full_path = os.path.join(project_path, normalized)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)

        emit("file_written", f"[WRITE FILE] {filename} ({len(content)} chars)", {"filename": filename, "content": content})
        return f"Successfully wrote {filename}"

    @tool
    def edit_file(filename: str, search_pattern: str, replacement: str) -> str:
        """Replace a specific code block in an existing file."""
        filename = filename.replace("\\", "/").strip().lstrip("/")
        full_path = os.path.join(project_path, os.path.normpath(filename))
        if not os.path.exists(full_path):
            return f"ERROR: File does not exist: {filename}"

        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()

        if search_pattern not in content:
            return f"ERROR: Search pattern not found in {filename}."

        new_content = content.replace(search_pattern, replacement, 1)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        emit("file_edited", f"[EDIT FILE] {filename}", {"filename": filename})
        return f"Successfully updated {filename}"

    @tool
    def read_file(filename: str) -> str:
        """Read content of a project file."""
        filename = filename.replace("\\", "/").strip().lstrip("/")
        full_path = os.path.join(project_path, os.path.normpath(filename))
        if not os.path.exists(full_path):
            return f"ERROR: File does not exist: {filename}"
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
                emit("file_read", f"[READ FILE] {filename}", {"filename": filename})
                return content
        except Exception as e:
            return f"ERROR: {e}"

    @tool
    def delete_file(filename: str) -> str:
        """Delete a file from the workspace."""
        filename = filename.replace("\\", "/").strip().lstrip("/")
        full_path = os.path.join(project_path, os.path.normpath(filename))
        if not os.path.exists(full_path):
            return f"ERROR: File does not exist: {filename}"
        os.remove(full_path)
        emit("file_deleted", f"[DELETE FILE] {filename}", {"filename": filename})
        return f"Deleted {filename}"

    @tool
    def list_directory() -> str:
        """List all files and folders in active workspace."""
        ignored = {".git", ".venv", "__pycache__", "node_modules", "dist", "build"}
        files = []
        for root, dirs, filenames in os.walk(project_path):
            dirs[:] = [d for d in dirs if d not in ignored]
            for f in filenames:
                rel = os.path.relpath(os.path.join(root, f), project_path).replace("\\", "/")
                files.append(rel)
        result = "\n".join(sorted(files)) if files else "WORKSPACE IS EMPTY"
        emit("files_listed", f"[LIST DIRECTORY]\n{result}", {"files": files})
        return result

    @tool
    def search_files(query: str) -> str:
        """Search text occurrences in workspace files."""
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
                except Exception:
                    pass
        return "\n".join(matches[:40]) if matches else "NO MATCHES FOUND"

    @tool
    def run_terminal(command: str) -> str:
        """Run terminal commands inside the workspace (e.g., npm install, npm run build)."""
        if command.strip().startswith("echo "):
            return "Notice: Use write_file to save content instead of echo."
        emit("command_running", f"[COMMAND] {command}", {"command": command})
        try:
            res = subprocess.run(
                command,
                shell=True,
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=90
            )
            out = [f"EXIT CODE: {res.returncode}"]
            if res.stdout: out.append(f"STDOUT:\n{res.stdout[-1500:]}")
            if res.stderr: out.append(f"STDERR:\n{res.stderr[-1500:]}")
            output_str = "\n".join(out)
            emit("command_finished", output_str, {"command": command, "code": res.returncode})
            return output_str
        except Exception as e:
            err = f"ERROR executing command: {e}"
            emit("command_error", err, {"command": command, "error": str(e)})
            return err

    return [write_file, edit_file, read_file, delete_file, list_directory, search_files, run_terminal]
