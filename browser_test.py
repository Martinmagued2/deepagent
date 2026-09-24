import argparse
import asyncio
import http.server
import mimetypes
import os
import socket
import socketserver
import sys
import threading
import time
from playwright.async_api import async_playwright

# Ensure JS/TS/JSX MIME types are explicitly registered
mimetypes.add_type("application/javascript", ".jsx")
mimetypes.add_type("application/javascript", ".tsx")
mimetypes.add_type("application/javascript", ".ts")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")


def find_free_port() -> int:
    """Find an available port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP Request Handler with CORS headers enabled and quiet logging."""

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):
        pass  # Suppress HTTP server output in test logs


def start_local_server(serve_dir: str, port: int):
    """Start an HTTP server serving serve_dir in a background daemon thread."""

    class DirectoryHandler(CORSRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=serve_dir, **kwargs)

    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer(("", port), DirectoryHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


async def inspect_page(page):
    """Log interactive elements and basic DOM status."""
    title = await page.title()
    buttons = await page.locator(
        "button, [role='button'], input[type='button'], input[type='submit']"
    ).count()
    inputs = await page.locator(
        "input, textarea, select, [contenteditable='true']"
    ).count()
    links = await page.locator("a[href]").count()
    print(f"[PAGE INFO] Title: {title!r}")
    print(
        f"[PAGE INFO] Interactive counts -> Buttons/Controls: {buttons}, Inputs/Editors: {inputs}, Links: {links}"
    )


async def test_page_loads(page, file_url):
    print(f"\n[OPEN] {file_url}")
    response = await page.goto(file_url, timeout=15000, wait_until="load")
    await page.wait_for_timeout(600)

    # Check body exists and has content
    body_text = await page.inner_text("body")
    if not body_text.strip():
        non_text_elements = await page.locator(
            "canvas, svg, iframe, img, #root, #app"
        ).count()
        if non_text_elements == 0:
            raise AssertionError("Page body rendered completely empty.")

    print("[PASSED] Web application loaded successfully.")


async def test_interactive_elements(page, errors):
    """Find visible buttons and inputs, and interact with them to verify no crashes."""
    print("\n[TEST] Verifying interactive controls respond without crashing...")

    buttons = page.locator(
        "button:visible, [role='button']:visible, input[type='button']:visible"
    )
    btn_count = await buttons.count()

    tested_buttons = 0
    for i in range(min(btn_count, 8)):
        btn = buttons.nth(i)
        try:
            name = (
                (await btn.inner_text()).strip()
                or (await btn.get_attribute("title"))
                or (await btn.get_attribute("aria-label"))
                or f"btn-{i}"
            )
            if any(
                term in name.lower()
                for term in ["delete all", "clear all", "reset all", "drop"]
            ):
                continue

            await btn.click(timeout=1500)
            await page.wait_for_timeout(150)
            tested_buttons += 1
            print(f"   [CLICK] Checked button: {name!r}")
        except Exception:
            pass

    print(f"[PASSED] Exercised {tested_buttons} interactive button(s).")

    # Check text inputs / contenteditable
    inputs = page.locator(
        "input:not([type='hidden']):not([type='button']):not([type='submit']):visible, textarea:visible, [contenteditable='true']:visible"
    )
    input_count = await inputs.count()
    if input_count > 0:
        target_input = inputs.first
        try:
            await target_input.click(timeout=1000)
            await page.keyboard.type("Test input 123", delay=30)
            await page.wait_for_timeout(100)
            print("[PASSED] Input and keyboard interactions work.")
        except Exception as e:
            print(f"   [NOTE] Input interaction note: {e}")

    # Verify no unhandled JavaScript runtime exceptions broke execution
    if errors:
        fatal_errors = [
            e
            for e in errors
            if "Failed to load resource" not in e and "favicon" not in e
        ]
        if fatal_errors:
            raise AssertionError(
                f"Uncaught JavaScript runtime error(s) detected: {fatal_errors[:3]}"
            )


async def main():
    parser = argparse.ArgumentParser(
        description="Generic browser test for any HTML page or URL."
    )
    parser.add_argument(
        "path",
        nargs="?",
        default=None,
        help="Path to a local HTML file or a full http/https URL to test.",
    )
    args = parser.parse_args()

    file_url = None

    if args.path and (
        args.path.startswith("http://") or args.path.startswith("https://")
    ):
        file_url = args.path
    else:
        if args.path:
            target_html = os.path.abspath(args.path)
            if not os.path.exists(target_html):
                raise FileNotFoundError(
                    f"Provided file does not exist: {target_html}"
                )
        else:
            # Check for production bundle (dist/) before falling back to source index.html
            project_dir = os.getcwd()
            search_paths = [
                os.path.join(project_dir, "generated_app", "dist", "index.html"),
                os.path.join(project_dir, "generated_app", "index.html"),
                os.path.join(project_dir, "sandbox_app", "dist", "index.html"),
                os.path.join(project_dir, "sandbox_app", "index.html"),
                os.path.join(project_dir, "dist", "index.html"),
                os.path.join(project_dir, "index.html"),
            ]

            target_html = None
            for p in search_paths:
                if os.path.exists(p):
                    target_html = p
                    break

            if not target_html:
                raise FileNotFoundError(
                    "No index.html found in generated_app/, sandbox_app/, or project root."
                )

        serve_dir = os.path.dirname(target_html)
        filename = os.path.basename(target_html)
        port = find_free_port()

        start_local_server(serve_dir, port)
        time.sleep(0.3)

        file_url = f"http://localhost:{port}/{filename}"

    print("=" * 60)
    print("STARTING GENERIC BROWSER APP EVALUATOR")
    print("=" * 60)

    console_errors = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        page.on("pageerror", lambda err: console_errors.append(str(err)))
        page.on(
            "console",
            lambda msg: (
                console_errors.append(msg.text) if msg.type == "error" else None
            ),
        )

        page.on(
            "dialog",
            lambda dialog: asyncio.create_task(dialog.accept("Sample Value")),
        )

        try:
            await test_page_loads(page, file_url)
            await inspect_page(page)
            await test_interactive_elements(page, console_errors)

            print("\n" + "=" * 60)
            print("ALL BROWSER TESTS PASSED")
            print("=" * 60)
            await browser.close()
            sys.exit(0)

        except Exception as e:
            print("\n" + "=" * 60)
            print(f"[TEST FAILED] {e}")
            print("=" * 60)
            await browser.close()
            sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())