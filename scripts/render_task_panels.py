#!/usr/bin/env python3
"""Keep crawlable rollout panels in index.html in sync with tasks.json."""

import argparse
from html import escape
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
START = "    <!-- BEGIN GENERATED TASK PANELS: python3 scripts/render_task_panels.py -->"
END = "    <!-- END GENERATED TASK PANELS -->"


def render_panel(task):
    key = escape(task["task"], quote=True)
    hidden = "" if task["task"] == "drawer_exchange" else " hidden"
    ready = "false" if task.get("ready") is False else "true"
    lines = [
        f'    <div data-task="{key}" data-ready="{ready}" role="tabpanel" aria-label="{escape(task["title"], quote=True)}"{hidden}>',
        '      <p class="iface-title">The interface: each policy\'s prior, as the agent reads it</p>',
        '      <div class="iface">',
    ]
    for i, skill in enumerate(task["skills"], 1):
        color = escape(skill["color"], quote=True)
        lines.extend([
            f'        <div class="iface-skill" style="border-top-color:{color}">',
            f'          <p class="iface-name"><span class="dot" style="background:{color}"></span><span class="step">{i}</span>{escape(skill["label"])}</p>',
        ])
        for policy in skill["policies"]:
            lines.append(
                '          <dl class="iface-policy"><dt>Prior</dt>'
                f'<dd>{escape(policy["prior"])}</dd><dt>Use when</dt>'
                f'<dd class="when">{escape(policy["when"])}</dd></dl>'
            )
        lines.append('        </div>')
    lines.extend(['      </div>', '    </div>'])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if generated HTML is stale")
    args = parser.parse_args()
    index = ROOT / "index.html"
    source = index.read_text(encoding="utf-8")
    before, rest = source.split(START, 1)
    _, after = rest.split(END, 1)
    tasks = json.loads((ROOT / "static/data/tasks.json").read_text(encoding="utf-8"))
    panels = "\n".join(render_panel(task) for task in tasks)
    updated = before + START + "\n" + panels + "\n" + END + after
    if args.check:
        if source != updated:
            raise SystemExit("Task panels are stale. Run python3 scripts/render_task_panels.py")
        print("Task panels match tasks.json.")
    else:
        index.write_text(updated, encoding="utf-8")


if __name__ == "__main__":
    main()
