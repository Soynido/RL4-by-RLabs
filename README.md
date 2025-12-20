# RL4 by RLabs - The Cognitive Co-pilot That Remembers

> **Your AI doesn't remember yesterday's work. RL4 does.**

RL4 is a **local-first cognitive operating system** for your IDE that transforms your AI coding assistant from a reactive tool into a proactive development partner. It doesn't write code—it captures, structures, and remembers everything you and your AI assistants do, creating a persistent memory layer for your entire development workflow.

## The Problem We Solve

Modern AI coding assistants (Cursor, GitHub Copilot, Claude, ChatGPT) are brilliant but have the memory of a goldfish. Every session is a blank slate. Every prompt loses context. Every decision evaporates into the void. You're stuck explaining the same architecture, re-discovering the same solutions, and losing invaluable insights in endless chat histories.

**RL4 is your eternal development memory.**

## How RL4 Works

### 1. **Context Capture**
As you work with any AI assistant, RL4 silently watches and structures every:
- File change (create, modify, delete)
- Git commit (messages, diffs, intent)
- IDE activity (edits, focus, linter errors)
- Chat conversations (Cursor chat history - opt-in)

All events are normalized into a unified timeline with temporal, spatial, and semantic indexing.

### 2. **Memory Index Layer (MIL) - The Hippocampus**
RL4's **Memory Index Layer** acts as the "hippocampus" of your development environment:

- **Temporal Index**: Query events by time range (O(log n) performance)
- **Spatial Index**: Map events to codebase locations (files, modules)
- **Type Index**: Fast lookup by event type (file changes, commits, chats)
- **Unified Schema**: All events normalized into `UnifiedEvent` format

The MIL provides zero-intelligence infrastructure—it structures and indexes, but all intelligence comes from the LLM.

### 3. **Intelligent Prompt Generation**
RL4 generates hyper-contextual prompts that include:
- Yesterday's architectural decisions
- Last week's debugging sessions
- Last month's design patterns
- Correlated events across time and space

Your AI gets the full picture, every time.

### 4. **Kernel Process**
RL4 runs a background **Kernel process** that:
- Monitors file system changes in real-time
- Tracks Git commits and extracts intent
- Captures IDE activity snapshots
- Optionally extracts Cursor chat history (opt-in, feature flag)
- Maintains persistent state across VS Code sessions

The Kernel is completely isolated per workspace—each project has its own `.reasoning_rl4/` directory.

### 5. **Time Machine**
Jump back to any point in your project's history. See:
- What you were thinking
- Why you made specific decisions
- What patterns emerged over time
- Complete context reconstruction

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              VS Code Extension (extension.ts)             │
│  • Activity Bar Integration                              │
│  • WebView Dashboard                                     │
│  • Command Registration                                 │
└──────────────────┬──────────────────────────────────────┘
                   │ IPC
┌──────────────────▼──────────────────────────────────────┐
│           Kernel Process (entrypoint.ts)                │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │         INPUT LAYER (Event Listeners)           │   │
│  │  • FileChangeWatcher (chokidar)                  │   │
│  │  • GitCommitListener (git polling)              │   │
│  │  • IDEActivityListener (VS Code API)             │   │
│  │  • CursorChatListener (SQLite, opt-in) ⭐        │   │
│  └──────────────────┬────────────────────────────────┘   │
│                      │                                     │
│                      ▼                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │    MIL (Memory Index Layer) - The Hippocampus   │   │
│  │  • EventNormalizer → UnifiedEvent                │   │
│  │  • TemporalIndex (time-based queries)           │   │
│  │  • SpatialIndex (file-based queries)            │   │
│  │  • TypeIndex (type-based queries)                │   │
│  │  • Append-only event store                      │   │
│  └──────────────────┬────────────────────────────────┘   │
│                      │                                     │
│                      ▼                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │         PROMPT BUILDERS                         │   │
│  │  • UnifiedPromptBuilder (snapshots)            │   │
│  │  • TimeMachinePromptBuilder (history)           │   │
│  └─────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

## Key Features

### 🧠 **Persistent Memory**
Your AI assistant now has perfect recall of:
- Every conversation
- Every architectural decision
- Every bug fix
- Every refactoring

**Forever.**

### ⚡ **Zero Context Switching**
Move between projects instantly without the "let me get up to speed" tax. RL4 pre-loads your AI with everything it needs to know.

### 🎯 **Pattern Intelligence**
RL4 identifies and surfaces recurring patterns in your development process—both good and bad—helping you optimize your workflow continuously.

### 🔒 **True Privacy**
Everything runs locally. Your code, your context, your insights never leave your machine.
- No cloud dependencies
- No telemetry
- No vendor lock-in
- Per-workspace isolation (`.reasoning_rl4/` per project)

### 🚀 **AI Agnostic**
Works with any AI coding assistant. Switch between Cursor, Copilot, or Claude without losing your cognitive investment.

### 📊 **Cursor Chat Integration (Opt-In)**
RL4 can optionally extract and index your Cursor chat history:
- **Opt-in only**: Requires explicit feature flag
- **Silent fallback**: If SQLite is inaccessible, MIL continues without chat data
- **No hard dependency**: MIL functions independently
- **Privacy-first**: All processing is local

## Installation

### Prerequisites
- Node.js 18+ and npm
- VS Code 1.80+
- TypeScript 5.9+

### Build from Source

```bash
# Clone the repository
git clone https://github.com/rlabs/RL4-by-RLabs.git
cd RL4-by-RLabs

# Install dependencies
npm install

# Compile the extension
npm run compile

# Package the extension
npm run package
```

### Install the Extension

1. Open VS Code
2. Go to Extensions view (Cmd+Shift+X / Ctrl+Shift+X)
3. Click "..." menu → "Install from VSIX..."
4. Select `rl4-by-rlabs-0.1.0.vsix`

Or use the command line:
```bash
code --install-extension rl4-by-rlabs-0.1.0.vsix
```

## Usage

### First Launch

1. Open a workspace folder in VS Code
2. RL4 will automatically activate and detect your workspace state
3. The RL4 activity bar icon will appear
4. Click the icon to open the RL4 Dashboard

### Basic Workflow

1. **Work normally** - RL4 captures everything automatically
2. **Generate snapshots** - Use the dashboard to create contextual prompts
3. **Time Machine** - Query historical context for any time range
4. **View insights** - See repository deltas, plan drift, blindspots

### Commands

- `RL4: Show Output` - Open RL4 output channel
- `RL4: Toggle Dashboard` - Open/close webview dashboard
- `RL4: Show Kernel Status` - Display kernel health
- `RL4: Review Pending ADRs` - Review architectural decisions

## Technical Details

### Kernel Process
- **Entry Point**: `kernel/process/entrypoint.ts`
- **IPC Protocol**: JSON-RPC over Node.js IPC
- **State Management**: Append-only writes, atomic operations
- **Health Monitoring**: Automatic crash detection and recovery

### Memory Index Layer (MIL)
- **Storage**: `.reasoning_rl4/memory/`
- **Indices**: Temporal, Spatial, Type (all flushed every 5s)
- **Event Store**: `events.jsonl` (append-only)
- **Sequence Numbers**: Monotonic, persisted across restarts

### Cursor Chat Integration
- **Database**: Reads from Cursor's `state.vscdb` (SQLite)
- **Location**: OS-specific (macOS: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`)
- **Polling**: Every 30 seconds (configurable)
- **Feature Flag**: Check `Context.RL4` or environment variable

## Development

### Project Structure

```
RL4-by-RLabs/
├── extension.ts              # VS Code extension entry point
├── commands/                 # Command handlers
├── kernel/                   # Kernel source code
│   ├── process/             # Kernel process (entrypoint.ts)
│   ├── memory/              # MIL implementation
│   ├── inputs/              # Event listeners
│   ├── api/                 # Prompt builders, analyzers
│   └── rules/               # RL4 governance rules
├── webview/                  # React dashboard
├── media/                    # Icons and assets
└── out/                      # Compiled output (gitignored)
```

### Build Scripts

- `npm run compile` - Compile extension and webview
- `npm run compile:extension` - Compile extension only
- `npm run compile:webview` - Bundle webview React app
- `npm run package` - Create VSIX package
- `npm run watch` - Watch mode for extension
- `npm run watch:webview` - Watch mode for webview

### Testing

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Privacy & Security

- **100% Local**: All data stored in `.reasoning_rl4/` per workspace
- **No Network**: Zero external API calls
- **No Telemetry**: No usage tracking
- **Isolated**: Each workspace is completely isolated
- **Opt-In Chat**: Cursor chat extraction requires explicit opt-in

## Limitations & Roadmap

### Current State (MVP)
- ✅ Core kernel functionality
- ✅ MIL infrastructure (temporal, spatial, type indices)
- ✅ File system and Git monitoring
- ✅ Basic prompt generation
- ✅ Time Machine queries
- ✅ Cursor chat integration (opt-in)

### Future Enhancements
- Episode consolidation (LLM intelligence storage)
- Spatial map stores (cognitive maps)
- Advanced pattern recognition
- Multi-workspace aggregation
- Team collaboration features

## Contributing

This is currently a private/internal project. Contributions are welcome but please:
1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure all builds pass

## License

[To be determined]

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**RL4 by RLabs** - Turning your AI from a temporary assistant into a permanent development partner.
