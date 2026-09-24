import os
import subprocess
from typing import Dict, Any, List

def run_git_command(args: List[str], cwd: str) -> Dict[str, Any]:
    try:
        res = subprocess.run(
            ["git"] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=15
        )
        return {
            "success": res.returncode == 0,
            "stdout": res.stdout,
            "stderr": res.stderr,
            "code": res.returncode
        }
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e), "code": -1}

def get_git_status(project_path: str) -> Dict[str, Any]:
    if not os.path.exists(os.path.join(project_path, ".git")):
        return {
            "is_repo": False,
            "branch": "none",
            "changes": [],
            "message": "Not a git repository."
        }

    branch_res = run_git_command(["branch", "--show-current"], project_path)
    branch = branch_res["stdout"].strip() or "HEAD"

    status_res = run_git_command(["status", "--porcelain"], project_path)
    changes = []
    if status_res["success"] and status_res["stdout"]:
        for line in status_res["stdout"].strip().split("\n"):
            if len(line) >= 3:
                status_code = line[:2].strip()
                filepath = line[3:].strip()
                changes.append({
                    "status": status_code,
                    "path": filepath
                })

    return {
        "is_repo": True,
        "branch": branch,
        "changes": changes,
        "message": f"Branch: {branch} ({len(changes)} pending changes)"
    }

def git_stage_all_and_commit(project_path: str, message: str) -> Dict[str, Any]:
    if not os.path.exists(os.path.join(project_path, ".git")):
        # Init repo if user commits for first time
        run_git_command(["init"], project_path)

    run_git_command(["add", "-A"], project_path)
    commit_res = run_git_command(["commit", "-m", message], project_path)
    return {
        "success": commit_res["success"],
        "output": commit_res["stdout"] or commit_res["stderr"]
    }

def get_git_diff(project_path: str, file_path: str = "") -> str:
    args = ["diff"]
    if file_path:
        args.append(file_path)
    res = run_git_command(args, project_path)
    return res["stdout"] if res["success"] else res["stderr"]
