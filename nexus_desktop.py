import os
import sys
import subprocess
import webbrowser
import time
import socket

def wait_for_server(host, port, timeout=15):
    """Wait until the server is accepting connections."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False

def main():
    print("==================================================")
    print("           NEXUSAI DESKTOP STUDIO IDE             ")
    print("==================================================")
    print("Starting NexusAI local server...")

    deepagent_dir = os.path.dirname(os.path.abspath(__file__))

    # Launch uvicorn — inherit stdout/stderr so errors are visible
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "deep_agent.server:app",
         "--host", "127.0.0.1", "--port", "8000", "--log-level", "info"],
        cwd=deepagent_dir,
        # Inherit parent's stdout/stderr so you can see server logs & errors
    )

    url = "http://127.0.0.1:8000"
    print(f"\nWaiting for server at {url} ...")

    if wait_for_server("127.0.0.1", 8000):
        print(f"NexusAI Studio is ready!  →  {url}")
        print("Opening browser...")
        webbrowser.open(url)
    else:
        print("ERROR: Server did not start within 15 seconds.")
        print("Check the error output above for details.")
        server_process.terminate()
        return

    try:
        server_process.wait()
    except KeyboardInterrupt:
        print("\nStopping NexusAI Studio...")
        server_process.terminate()

if __name__ == "__main__":
    main()
