import os
import sys
import subprocess
import webbrowser
import time

def main():
    print("==================================================")
    print("           NEXUSAI DESKTOP STUDIO IDE             ")
    print("==================================================")
    print("Starting NexusAI local server and runtime...")
    
    # Launch uvicorn server in subprocess
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=os.path.dirname(os.path.abspath(__file__))
    )
    
    time.sleep(1.5)
    url = "http://127.0.0.1:8000"
    print(f"NexusAI Studio running at: {url}")
    print("Opening your browser/desktop window...")
    webbrowser.open(url)
    
    try:
        server_process.wait()
    except KeyboardInterrupt:
        print("\nStopping NexusAI Studio...")
        server_process.terminate()

if __name__ == "__main__":
    main()
