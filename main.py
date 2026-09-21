import os
import subprocess
import sys

from deepagents import create_deep_agent
from dotenv import load_dotenv
from langchain_core.tools import tool
from langchain_openrouter import ChatOpenRouter

# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

if not os.getenv("OPENROUTER_API_KEY"):
    raise RuntimeError("OPENROUTER_API_KEY is missing from .env")

# ============================================================
# PROJECT TOOLS
# ============================================================

@tool
def write_file(filename: str, content: str) -> str:
    """Create or completely replace a file in the project."""
    filename = filename.replace("\\", "/").strip()

    if not filename:
        return "ERROR: Filename is empty."

    normalized = os.path.normpath(filename)

    if normalized.startswith("..") or os.path.isabs(normalized):
        return "ERROR: Invalid file path."

    path = os.path.join(os.getcwd(), normalized)
    directory = os.path.dirname(path)

    if directory:
        os.makedirs(directory, exist_ok=True)

    with open(path, "w", encoding="utf-8") as file:
        file.write(content)

    return f"Successfully wrote {filename}"


@tool
def read_file(filename: str) -> str:
    """Read a project file."""
    filename = filename.replace("\\", "/").strip()
    normalized = os.path.normpath(filename)

    if normalized.startswith("..") or os.path.isabs(normalized):
        return "ERROR: Invalid file path."

    path = os.path.join(os.getcwd(), normalized)

    if not os.path.exists(path):
        return f"ERROR: File does not exist: {filename}"

    try:
        with open(path, "r", encoding="utf-8") as file:
            return file.read()
    except UnicodeDecodeError:
        return f"ERROR: {filename} is not a text file."


@tool
def list_files() -> str:
    """List files currently inside the project."""
    ignored = {".git", ".venv", "__pycache__", "node_modules"}
    files = []

    for root, directories, filenames in os.walk(os.getcwd()):
        directories[:] = [
            directory for directory in directories if directory not in ignored
        ]

        for filename in filenames:
            path = os.path.join(root, filename)
            relative = os.path.relpath(path, os.getcwd())
            files.append(relative.replace("\\", "/"))

    if not files:
        return "PROJECT IS EMPTY"

    return "\n".join(sorted(files))


@tool
def run_command(command: str) -> str:
    """Run a local development command."""
    print(f"\n[AGENT RUNNING] {command}")

    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=os.getcwd(),
            capture_output=True,
            text=True,
            timeout=30,
        )

        output = [f"EXIT CODE: {result.returncode}"]

        if result.stdout:
            output.append(f"STDOUT:\n{result.stdout}")

        if result.stderr:
            output.append(f"STDERR:\n{result.stderr}")

        return "\n".join(output)

    except subprocess.TimeoutExpired:
        return "ERROR: Command timed out after 30 seconds."

    except Exception as error:
        return f"ERROR: {error}"


# ============================================================
# AI MODEL
# ============================================================

model = ChatOpenRouter(
    model="openrouter/free",
    temperature=0,
)

# ============================================================
# AI AGENT
# ============================================================

agent = create_deep_agent(
    model=model,
    tools=[
        write_file,
        read_file,
        list_files,
        run_command,
    ],
)

# ============================================================
# GET USER REQUEST
# ============================================================

if len(sys.argv) > 1:
    USER_REQUEST = " ".join(sys.argv[1:])
else:
    print()
    print("=" * 60)
    print("AI APP BUILDER")
    print("=" * 60)
    print()

    USER_REQUEST = input("What should I build?\n\n> ")

if not USER_REQUEST.strip():
    raise RuntimeError("No application request was provided.")

# ============================================================
# INITIAL BUILD PROMPT
# ============================================================

BUILD_PROMPT = f"""
You are an autonomous senior software engineer.

You are working inside a local project directory.

The user wants you to build this application:

---

## USER REQUEST

{USER_REQUEST}

---

## END USER REQUEST

Your job is to turn the user's request into a complete,
working web application.

============================================================
GENERAL REQUIREMENTS
====================

Do NOT assume the application is a calculator.

The user may request ANY type of web application.

Examples include:

* calculator
* todo application
* timer
* stopwatch
* game
* dashboard
* notes application
* expense tracker
* quiz
* converter
* form
* landing page
* productivity tool
* business tool
* interactive visualization
* booking interface
* inventory interface
* portfolio
* educational application

Use HTML, CSS, and JavaScript unless the user's request
specifically requires something else.

Prefer vanilla HTML/CSS/JavaScript for simple applications.

============================================================
IMPLEMENT THE ACTUAL APPLICATION
================================

Do not create a static mockup when the user requested an
interactive application.

Actually implement the requested functionality.

For example:

If the user requests a button that performs an action,
the button must actually perform that action.

If the user requests a form, the form must actually work.

If the user requests calculations, the calculations must
actually be correct.

If the user requests persistence, implement persistence.

If local browser persistence is appropriate, localStorage
may be used.

If the user requests search/filtering, implement it.

If the user requests adding/removing/editing items,
implement those operations.

============================================================
USER INTERACTION
================

All interactive UI elements must actually work.

Buttons must respond to mouse clicks.

Interactive controls should also work with touch/click
interaction.

Keyboard support should be added where appropriate.

Do not implement functionality only through keyboard events
when clickable buttons are provided.

============================================================
PROJECT STRUCTURE
=================

Create whatever files are necessary.

A normal web application will usually contain:

* index.html
* style.css
* script.js

You may create additional files when useful.

For example:

* JavaScript modules
* data files
* test files
* assets

Do not create unnecessary files.

============================================================
CODE QUALITY
============

Write clean and understandable code.

Use meaningful variable and function names.

Avoid unnecessary dependencies.

Do not use eval().

Do not put the entire application into one unreadable
JavaScript expression.

Keep HTML, CSS, and JavaScript reasonably separated.

============================================================
TOOLS
=====

Use:

write_file(filename, content)

to create or replace files.

Use:

read_file(filename)

to inspect files.

Use:

list_files()

to inspect the project.

Use:

run_command(command)

for development commands when necessary.

============================================================
IMPORTANT
=========

Actually create the application files.

Do NOT merely explain how to build the application.

Do NOT return a tutorial.

Do NOT just give me code in your final answer.

The files must actually exist in the project directory.

Do not modify external evaluation files.

Do not fake test results.

When the implementation is complete, stop.
"""

# ============================================================
# REPAIR PROMPT
# ============================================================

def create_repair_prompt(test_report: str) -> str:
    return f"""
The application you created was independently tested.

The application FAILED.

You must repair the actual application.

============================================================
TEST REPORT
===========

{test_report}

============================================================
REPAIR PROCESS
==============

First inspect the current project.

Use:

list_files()

and read_file()

to understand the implementation.

Determine the actual root cause.

Then modify the necessary files using write_file().

Do not modify the external evaluator.

Do not weaken the evaluator.

Do not remove functionality just to make a test pass.

Do not fake test results.

The application must genuinely satisfy the user's
original request.

If the failure is caused by browser interaction, inspect
the HTML structure and JavaScript event handlers.

If the failure is caused by application logic, fix the
application logic.

If the failure is caused by state management, fix the
state management.

If the failure is caused by UI integration, fix the UI
integration.

If the failure is caused by missing functionality, add
the missing functionality.

After making the repair, stop.

The external evaluator will test the application again.
"""

# ============================================================
# COMMAND RUNNER
# ============================================================

def run_process(command: str):
    result = subprocess.run(
        command,
        shell=True,
        cwd=os.getcwd(),
        capture_output=True,
        text=True,
        timeout=60,
    )

    output = ""

    if result.stdout:
        output += result.stdout

    if result.stderr:
        output += result.stderr

    return (result.returncode == 0, output)

# ============================================================
# EVALUATOR
# ============================================================

def run_tests():
    print()
    print("=" * 60)
    print("RUNNING PROJECT EVALUATOR")
    print("=" * 60)

    if os.path.exists("evaluator.py"):
        command = "uv run python evaluator.py"
    elif os.path.exists("browser_test.py"):
        command = "uv run python browser_test.py"
    else:
        command = "uv run python evaluator.py"

    print()
    print(f"[COMMAND] {command}")

    try:
        passed, output = run_process(command)

        if passed:
            print("[PASSED]")
        else:
            print("[FAILED]")

        report = []

        report.append("")
        report.append("=" * 60)
        report.append("PROJECT TEST REPORT")
        report.append("=" * 60)
        report.append("")

        report.append(
            "OVERALL STATUS: " + ("PASSED" if passed else "FAILED")
        )

        report.append("")

        report.append("EVALUATOR OUTPUT:")

        report.append(output if output.strip() else "(no output)")

        return (passed, "\n".join(report))

    except subprocess.TimeoutExpired:
        return (False, "EVALUATOR TIMED OUT.")

    except Exception as error:
        return (False, f"EVALUATOR ERROR: {error}")

# ============================================================
# MAIN LOGIC
# ============================================================

def main():
    MAX_FIX_ATTEMPTS = 3

    print()
    print("=" * 60)
    print("AI APP BUILDER")
    print("=" * 60)

    print()
    print("USER REQUEST:")
    print(USER_REQUEST)

    print()
    print("=" * 60)
    print("STARTING INITIAL BUILD")
    print("=" * 60)

    thread_config = {"configurable": {"thread_id": "1"}}

    try:
        agent.invoke(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": BUILD_PROMPT,
                    }
                ]
            },
            config=thread_config,
        )
    except Exception as error:
        print()
        print("=" * 60)
        print("INITIAL BUILD FAILED")
        print("=" * 60)

        print(f"\nERROR: {error}")

        sys.exit(1)

    print()
    print("=" * 60)
    print("INITIAL BUILD COMPLETE")
    print("=" * 60)

    # ============================================================
    # TEST / REPAIR LOOP
    # ============================================================

    for attempt in range(MAX_FIX_ATTEMPTS + 1):
        print()
        print("=" * 60)
        print(f"TEST / FIX ITERATION {attempt}")
        print("=" * 60)

        passed, test_report = run_tests()

        print()
        print(test_report)

        # --------------------------------------------------------
        # SUCCESS
        # --------------------------------------------------------

        if passed:
            print()
            print("=" * 60)
            print("SUCCESS")
            print("=" * 60)

            print()
            print("The application passed the independent evaluator.")

            print()
            print("APPLICATION BUILD COMPLETE.")

            break

        # --------------------------------------------------------
        # MAXIMUM REPAIR ATTEMPTS
        # --------------------------------------------------------

        if attempt >= MAX_FIX_ATTEMPTS:
            print()
            print("=" * 60)
            print("MAXIMUM REPAIR ATTEMPTS REACHED")
            print("=" * 60)

            print()
            print("The application still has failing tests.")

            break

        # --------------------------------------------------------
        # SEND FAILURE TO AI
        # --------------------------------------------------------

        print()
        print("=" * 60)
        print("SENDING FAILURE TO AI FOR REPAIR")
        print("=" * 60)

        repair_prompt = create_repair_prompt(test_report)

        try:
            agent.invoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": repair_prompt,
                        }
                    ]
                },
                config=thread_config,
            )

            print()
            print("AI REPAIR COMPLETED.")

        except Exception as error:
            print()
            print("=" * 60)
            print("AI REPAIR FAILED")
            print("=" * 60)

            print(f"\nERROR: {error}")

            break

    print()
    print("=" * 60)
    print("AGENT FINISHED")
    print("=" * 60)


if __name__ == "__main__":
    main()
