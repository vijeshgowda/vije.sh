# Repository Instructions

@AGENTS.md

Follow the imported repository instructions, including the subagent and AI commit and PR
attribution policies. Use `gpt-5.6-luna` for easy, bounded subagent tasks such as executing
already-chosen validation commands; keep reasoning and debugging with the main agent.

Choose attribution by the actual model provider: Anthropic uses
`Co-authored-by: Claude <noreply@anthropic.com>`, OpenAI uses
`Co-authored-by: Codex <noreply@openai.com>`, and other providers use
`Co-authored-by: Copilot <copilot@github.com>`. Record the exact model name in a `Model:`
trailer when explicitly asked to commit, and include matching attribution in the PR body.