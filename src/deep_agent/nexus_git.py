import os
import subprocess
from typing import Dict, Any, List, Optional


def run_git_command(args: List[str], cwd: str, timeout: int = 30) -> Dict[str, Any]:
    try:
        res = subprocess.run(
            ["git"] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "success": res.returncode == 0,
            "stdout": res.stdout,
            "stderr": res.stderr,
            "code": res.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "stdout": "", "stderr": "git command timed out", "code": -1}
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e), "code": -1}


def is_repo(project_path: str) -> bool:
    return os.path.exists(os.path.join(project_path, ".git"))


def init_repo(project_path: str) -> Dict[str, Any]:
    return run_git_command(["init"], project_path)


def get_git_status(project_path: str) -> Dict[str, Any]:
    if not is_repo(project_path):
        return {
            "is_repo": False,
            "branch": "",
            "changes": [],
            "staged": [],
            "unstaged": [],
            "untracked": [],
            "ahead": 0,
            "behind": 0,
            "message": "Not a git repository.",
        }

    branch_res = run_git_command(["branch", "--show-current"], project_path)
    branch = branch_res["stdout"].strip() or "HEAD"

    # Porcelain v1 gives us staged (X) + unstaged (Y) + untracked (??)
    status_res = run_git_command(["status", "--porcelain=v1"], project_path)
    staged, unstaged, untracked, all_changes = [], [], [], []
    if status_res["success"] and status_res["stdout"]:
        for line in status_res["stdout"].strip().split("\n"):
            if len(line) >= 3:
                x = line[0]
                y = line[1]
                path = line[3:].strip().strip('"')
                entry = {"status": (x + y).strip(), "path": path, "x": x, "y": y}
                all_changes.append(entry)
                if x == "?" or y == "?":
                    untracked.append(entry)
                if x != " " and x != "?":
                    staged.append(entry)
                if y != " " and y != "?":
                    unstaged.append(entry)

    # Ahead/behind
    ahead, behind = 0, 0
    ab_res = run_git_command(
        ["rev-list", "--left-right", "--count", "@{u}...HEAD"], project_path
    )
    if ab_res["success"] and ab_res["stdout"]:
        parts = ab_res["stdout"].split()
        if len(parts) == 2:
            behind, ahead = int(parts[0]), int(parts[1])

    return {
        "is_repo": True,
        "branch": branch,
        "changes": all_changes,
        "staged": staged,
        "unstaged": unstaged,
        "untracked": untracked,
        "ahead": ahead,
        "behind": behind,
        "message": f"Branch: {branch} ({len(all_changes)} changes, {len(staged)} staged)",
    }


def stage_file(project_path: str, file_path: str) -> Dict[str, Any]:
    if not is_repo(project_path):
        init_repo(project_path)
    res = run_git_command(["add", file_path], project_path)
    return {"success": res["success"], "output": res["stdout"] or res["stderr"]}


def unstage_file(project_path: str, file_path: str) -> Dict[str, Any]:
    if not is_repo(project_path):
        return {"success": False, "output": "Not a git repository."}
    res = run_git_command(["restore", "--staged", file_path], project_path)
    return {"success": res["success"], "output": res["stdout"] or res["stderr"]}


def stage_all(project_path: str) -> Dict[str, Any]:
    if not is_repo(project_path):
        init_repo(project_path)
    res = run_git_command(["add", "-A"], project_path)
    return {"success": res["success"], "output": res["stdout"] or res["stderr"]}


def git_commit(project_path: str, message: str) -> Dict[str, Any]:
    if not is_repo(project_path):
        init_repo(project_path)
        run_git_command(["add", "-A"], project_path)
    # Configure a local identity if none is set (so first commit doesn't fail)
    cfg_res = run_git_command(["config", "user.email"], project_path)
    if not cfg_res["success"] or not cfg_res["stdout"].strip():
        run_git_command(["config", "user.email", "nexusai@local"], project_path)
        run_git_command(["config", "user.name", "NexusAI Studio"], project_path)
    commit_res = run_git_command(["commit", "-m", message], project_path)
    return {
        "success": commit_res["success"],
        "output": commit_res["stdout"] or commit_res["stderr"],
    }


def git_stage_all_and_commit(project_path: str, message: str) -> Dict[str, Any]:
    """Backward-compatible wrapper kept for older callers."""
    if not is_repo(project_path):
        init_repo(project_path)
    stage_all(project_path)
    return git_commit(project_path, message)


def get_git_diff(project_path: str, file_path: str = "", staged: bool = False) -> str:
    if not is_repo(project_path):
        return ""
    args = ["diff"]
    if staged:
        args.append("--cached")
    if file_path:
        args.append("--")
        args.append(file_path)
    res = run_git_command(args, project_path)
    return res["stdout"] if res["success"] else res["stderr"]


def git_pull(project_path: str) -> Dict[str, Any]:
    if not is_repo(project_path):
        return {"success": False, "output": "Not a git repository."}
    res = run_git_command(["pull", "--no-edit"], project_path, timeout=60)
    return {"success": res["success"], "output": res["stdout"] or res["stderr"]}


def git_push(project_path: str) -> Dict[str, Any]:
    if not is_repo(project_path):
        return {"success": False, "output": "Not a git repository."}
    res = run_git_command(["push"], project_path, timeout=120)
    return {"success": res["success"], "output": res["stdout"] or res["stderr"]}


def git_log(project_path: str, limit: int = 20) -> Dict[str, Any]:
    if not is_repo(project_path):
        return {"success": False, "commits": []}
    res = run_git_command(
        ["log", f"-n{limit}", "--pretty=format:%h|%an|%ad|%s", "--date=short"],
        project_path,
    )
    commits = []
    if res["success"] and res["stdout"]:
        for line in res["stdout"].strip().split("\n"):
            parts = line.split("|", 3)
            if len(parts) == 4:
                commits.append({
                    "hash": parts[0],
                    "author": parts[1],
                    "date": parts[2],
                    "message": parts[3],
                })
    return {"success": res["success"], "commits": commits}
