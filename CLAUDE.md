# Repository Instructions

@AGENTS.md

Follow the imported repository instructions, including the subagent and AI commit and PR
attribution policies. For easy, bounded subagent tasks, use `gpt-6-luna` for the simplest ones
(such as executing already-chosen validation commands) and `claude-haiku-5.5` for bounded tasks
that need more reading or judgement; the main agent decides which. Keep reasoning and debugging
with the main agent.

Choose attribution by the actual model provider: Anthropic uses
`Co-authored-by: Claude <noreply@anthropic.com>`, OpenAI uses
`Co-authored-by: Codex <noreply@openai.com>`, and other providers use
`Co-authored-by: Copilot <copilot@github.com>`. Record the exact model name in a `Model:`
trailer when explicitly asked to commit, and include matching attribution in the PR body.