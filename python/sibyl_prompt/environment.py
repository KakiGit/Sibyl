"""Environment and project info gathering for prompt context."""

import os
import platform
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List


def get_environment_info() -> Dict[str, Any]:
    """Gather environment context for prompt."""
    return {
        "platform": platform.system(),
        "working_directory": os.getcwd(),
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "home": str(Path.home()),
        "shell": os.environ.get("SHELL", "unknown"),
        "editor": os.environ.get("EDITOR", "unknown"),
        "user": os.environ.get("USER", "unknown"),
    }


def get_project_info(project_path: Optional[Path] = None) -> Dict[str, Any]:
    """Gather project-specific context."""
    if project_path is None:
        project_path = Path.cwd()

    info: Dict[str, Any] = {}

    git_dir = project_path / ".git"
    if git_dir.exists():
        info["branch"] = _get_git_branch(project_path)
        info["recent_commits"] = _get_recent_commits(project_path, limit=5)
        info["status"] = _get_git_status(project_path)
        info["is_repo"] = True
    else:
        info["is_repo"] = False

    info["language"] = _detect_primary_language(project_path)
    info["framework"] = _detect_framework(project_path)
    info["project_name"] = project_path.name

    return info


def _get_git_branch(project_path: Path) -> str:
    """Get current git branch."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=str(project_path),
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def _get_recent_commits(project_path: Path, limit: int = 5) -> List[Dict[str, str]]:
    """Get recent commit messages."""
    try:
        result = subprocess.run(
            ["git", "log", f"-{limit}", "--oneline", "--no-decorate"],
            cwd=str(project_path),
            capture_output=True,
            text=True,
            timeout=10,
        )
        commits = []
        for line in result.stdout.strip().split("\n"):
            if line:
                parts = line.split(" ", 1)
                commits.append(
                    {
                        "hash": parts[0] if parts else "",
                        "message": parts[1] if len(parts) > 1 else line,
                    }
                )
        return commits
    except Exception:
        return []


def _get_git_status(project_path: Path) -> Dict[str, Any]:
    """Get git status summary."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(project_path),
            capture_output=True,
            text=True,
            timeout=10,
        )
        modified = []
        untracked = []
        for line in result.stdout.strip().split("\n"):
            if line:
                status = line[:2]
                file = line[3:]
                if status.strip() in ("M", "MM", "AM"):
                    modified.append(file)
                elif status == "??" or status.strip() == "A":
                    untracked.append(file)
        return {
            "modified": modified,
            "untracked": untracked,
            "clean": len(modified) == 0 and len(untracked) == 0,
        }
    except Exception:
        return {"modified": [], "untracked": [], "clean": True}


def _detect_primary_language(project_path: Path) -> str:
    """Detect primary programming language."""
    extensions = {
        ".py": "Python",
        ".rs": "Rust",
        ".js": "JavaScript",
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".go": "Go",
        ".java": "Java",
        ".kt": "Kotlin",
        ".cpp": "C++",
        ".c": "C",
        ".rb": "Ruby",
        ".php": "PHP",
        ".swift": "Swift",
        ".scala": "Scala",
    }

    counts: Dict[str, int] = {}
    try:
        for file in project_path.rglob("*"):
            if file.is_file() and not any(p.startswith(".") for p in file.parts):
                ext = file.suffix.lower()
                if ext in extensions:
                    lang = extensions[ext]
                    counts[lang] = counts.get(lang, 0) + 1
    except Exception:
        pass

    if counts:
        return max(counts, key=counts.get)
    return "Unknown"


def _detect_framework(project_path: Path) -> Optional[str]:
    """Detect project framework."""
    indicators = {
        "package.json": ["react", "vue", "angular", "next", "express", "nestjs"],
        "Cargo.toml": None,
        "pyproject.toml": ["django", "flask", "fastapi", "pytest"],
        "requirements.txt": ["django", "flask", "fastapi"],
        "go.mod": None,
        "pom.xml": ["spring", "maven"],
        "build.gradle": ["spring", "gradle"],
    }

    for file_name, frameworks in indicators.items():
        file_path = project_path / file_name
        if file_path.exists():
            if frameworks is None:
                return (
                    file_name.replace(".toml", "")
                    .replace(".mod", "")
                    .replace(".xml", "")
                )
            try:
                content = file_path.read_text()
                for fw in frameworks:
                    if fw.lower() in content.lower():
                        return fw
            except Exception:
                pass

    return None
