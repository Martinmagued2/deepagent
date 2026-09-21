import asyncio
import os
from playwright.async_api import async_playwright


async def main():
    project_dir = os.getcwd()
    html_path = os.path.join(project_dir, "index.html")
    file_url = "file:///" + html_path.replace("\\", "/")

    print("=" * 60)
    print("STARTING TODO APP TEST")
    print("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            print(f"\n[OPEN] {file_url}")
            await page.goto(file_url)
            await page.wait_for_timeout(500)

            print("\n[TEST] Add task 'Buy milk'")
            await page.fill("[data-testid='task-input']", "Buy milk")
            await page.click("[data-testid='add-btn']")
            await page.wait_for_timeout(200)

            tasks = await page.locator("[data-testid='task-item']").all()
            if len(tasks) != 1:
                raise AssertionError(f"Expected 1 task, got {len(tasks)}")
            text = await tasks[0].locator("[data-testid='task-text']").inner_text()
            if text != "Buy milk":
                raise AssertionError(f"Expected 'Buy milk', got {text!r}")
            print("[PASSED] Add task")

            print("\n[TEST] Mark task complete")
            await page.click("[data-testid='task-checkbox']")
            await page.wait_for_timeout(200)
            tasks = await page.locator("[data-testid='task-item']").all()
            if len(tasks) != 1:
                raise AssertionError(f"Expected 1 task, got {len(tasks)}")
            completed = await tasks[0].evaluate("el => el.classList.contains('completed')")
            if not completed:
                raise AssertionError("Task should be completed")
            print("[PASSED] Mark complete")

            print("\n[TEST] Add second task 'Walk dog'")
            await page.fill("[data-testid='task-input']", "Walk dog")
            await page.click("[data-testid='add-btn']")
            await page.wait_for_timeout(200)
            tasks = await page.locator("[data-testid='task-item']").all()
            if len(tasks) != 2:
                raise AssertionError(f"Expected 2 tasks, got {len(tasks)}")
            print("[PASSED] Add second task")

            print("\n[TEST] Delete first task")
            delete_buttons = await page.locator("[data-testid='task-delete']").all()
            await delete_buttons[0].click()
            await page.wait_for_timeout(500)
            tasks = await page.locator("[data-testid='task-item']").all()
            if len(tasks) != 1:
                raise AssertionError(f"Expected 1 task after delete, got {len(tasks)}")
            text = await tasks[0].locator("[data-testid='task-text']").inner_text()
            if text != "Walk dog":
                raise AssertionError(f"Expected 'Walk dog', got {text!r}")
            print("[PASSED] Delete task")

            print("\n[TEST] Persistence after reload")
            await page.reload()
            await page.wait_for_timeout(500)
            tasks = await page.locator("[data-testid='task-item']").all()
            if len(tasks) != 1:
                raise AssertionError(f"Expected 1 task after reload, got {len(tasks)}")
            text = await tasks[0].locator("[data-testid='task-text']").inner_text()
            if text != "Walk dog":
                raise AssertionError(f"Expected 'Walk dog' after reload, got {text!r}")
            print("[PASSED] Persistence")

            print("\n" + "=" * 60)
            print("ALL TODO TESTS PASSED")
            print("=" * 60)

        except Exception as error:
            print("\n" + "=" * 60)
            print("TODO TEST FAILED")
            print("=" * 60)
            print(f"\nERROR: {error}")
            screenshot_path = os.path.join(project_dir, "todo-test-failure.png")
            await page.screenshot(path=screenshot_path, full_page=True)
            print(f"\nScreenshot saved to: {screenshot_path}")
            raise

        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())