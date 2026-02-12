# Clash of LLMs

A Chrome extension that pits AI chatbots against each other in real-time. Pick two LLMs, choose an interaction mode, and watch them go.

## Supported LLMs

- ChatGPT
- Claude
- Grok
- Gemini
- Perplexity

## Interaction Modes

- **Debate** — Structured argument where each LLM takes a side and defends it
- **Conversation** — Friendly back-and-forth exploring ideas together
- **Roast Battle** — Comedic insult battle, Comedy Central style
- **Interview** — One LLM interviews the other as a domain expert
- **Storytelling** — Collaborative fiction, each LLM continues the narrative
- **Philosophical** — Deep Socratic dialogue seeking understanding
- **Truth Seekers** — Both LLMs pursue truth collaboratively, converging on a final verdict
- **Collaborative** — Two colleagues debate and refine ideas into one unified output
- **Writers' Room** — Draft, critique, and rewrite until the piece is polished
- **Role Play** — Each LLM plays a character in a scenario you set

## Features

- 10 interaction modes with tailored prompt templates
- 15+ personality presets (Pirate, Shakespeare, Drill Sergeant, etc.) or write your own
- Optional setting/context injection (e.g. "medieval fantasy world")
- Configurable round limits or unlimited back-and-forth
- Model selection — choose specific model variants before starting
- Live transcript panel
- PDF export of the full transcript
- Resizable split panes with drag-to-resize divider

## How It Works

1. Click the extension icon and open the Arena
2. Choose your left and right LLM matchup
3. Pick an interaction mode and optionally set personalities or a setting
4. Enter a topic and hit Start
5. Both LLMs are loaded side-by-side in iframes and take turns responding
6. Watch live, toggle the transcript panel, or export to PDF when done

The extension uses content script adapters to interact with each LLM's web interface directly — sending prompts, detecting responses, and managing turn-by-turn flow through a background service worker.

## Install

1. Clone the repo:
   ```sh
   git clone https://github.com/hughgramel/clash-of-llms.git
   cd clash-of-llms
   npm install
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `clash-of-llms` directory

## Project Structure

```
arena/              Main UI (landing page + debate view), PDF export, jsPDF
background/         Service worker — debate orchestration, frame discovery, prompts
content-scripts/    Per-LLM adapters + shared adapter interface + anti-framebusting
shared/             LLM config, message types, interaction modes, personalities
popup/              Extension popup entry point
rules/              Declarative net request rules (header stripping for iframe embedding)
tests/              Playwright E2E tests with mock LLM server
```

## Testing

```sh
npm test
```

## Requirements

- Chrome (Manifest V3)
- Active accounts on the LLM platforms you want to use
