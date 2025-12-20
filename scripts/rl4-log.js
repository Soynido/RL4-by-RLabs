#!/usr/bin/env node
/**
 * RL4 Terminal Helper (Node.js)
 * 
 * Utility to log task events to .reasoning_rl4/terminal-events.jsonl
 * 
 * Usage:
 *   node scripts/rl4-log.js start <taskId> <command>
 *   node scripts/rl4-log.js end <taskId> <status> [exitCode]
 *   node scripts/rl4-log.js custom <taskId> <type> <data>
 *   node scripts/rl4-log.js action <description>
 * 
 * Examples:
 *   node scripts/rl4-log.js start task-001 "npm test"
 *   node scripts/rl4-log.js end task-001 success 0
 *   node scripts/rl4-log.js end task-002 failure 1
 *   node scripts/rl4-log.js custom task-003 file_created '{"path":"test.txt"}'
 *   node scripts/rl4-log.js action "Add axios HTTP client"
 */

const fs = require('fs');
const path = require('path');

// Find workspace root (where .reasoning_rl4 exists)
function findWorkspaceRoot() {
  let currentDir = process.cwd();
  const maxDepth = 10;
  let depth = 0;

  while (depth < maxDepth) {
    const rl4Path = path.join(currentDir, '.reasoning_rl4');
    if (fs.existsSync(rl4Path)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }
    currentDir = parentDir;
    depth++;
  }

  // Fallback to cwd if .reasoning_rl4 not found
  console.warn('[RL4] Warning: .reasoning_rl4 not found, using current directory');
  return process.cwd();
}

// Append event to terminal-events.jsonl
function appendEvent(event) {
  const workspaceRoot = findWorkspaceRoot();
  const eventsPath = path.join(workspaceRoot, '.reasoning_rl4', 'terminal-events.jsonl');

  // Ensure .reasoning_rl4 directory exists
  const rl4Dir = path.dirname(eventsPath);
  if (!fs.existsSync(rl4Dir)) {
    fs.mkdirSync(rl4Dir, { recursive: true });
  }

  // Append event as JSON line
  const line = JSON.stringify(event) + '\n';
  fs.appendFileSync(eventsPath, line, 'utf-8');

  console.log(`[RL4] Event logged: ${event.type} (taskId: ${event.taskId || 'N/A'})`);
}

// Parse command line arguments
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node rl4-log.js <action> <taskId> [...]');
    console.error('');
    console.error('Actions:');
    console.error('  start <taskId> <command>');
    console.error('  end <taskId> <status> [exitCode]');
    console.error('  custom <taskId> <type> <data>');
    console.error('  action <description>');
    process.exit(1);
  }

  const action = args[0];
  const taskId = args[1];
  const timestamp = new Date().toISOString();

  switch (action) {
    case 'start':
      if (args.length < 3) {
        console.error('Usage: node rl4-log.js start <taskId> <command>');
        process.exit(1);
      }
      const command = args.slice(2).join(' ');
      appendEvent({
        timestamp,
        type: 'command_start',
        taskId,
        command,
        terminal: 'RL4'
      });
      break;

    case 'end':
      if (args.length < 3) {
        console.error('Usage: node rl4-log.js end <taskId> <status> [exitCode]');
        process.exit(1);
      }
      const status = args[2];
      const exitCode = args[3] ? parseInt(args[3], 10) : undefined;
      appendEvent({
        timestamp,
        type: 'command_end',
        taskId,
        status,
        exitCode: exitCode !== undefined ? exitCode : null,
        terminal: 'RL4'
      });
      break;

    case 'custom':
      if (args.length < 4) {
        console.error('Usage: node rl4-log.js custom <taskId> <type> <data>');
        process.exit(1);
      }
      const customType = args[2];
      const dataStr = args.slice(3).join(' ');
      appendEvent({
        timestamp,
        type: customType,
        taskId,
        data: dataStr ? JSON.parse(dataStr) : {},
        terminal: 'RL4'
      });
      break;

    case 'action':
      const description = args.slice(1).join(' ');
      appendEvent({
        timestamp,
        type: 'action',
        description,
        terminal: 'RL4'
      });
      break;

    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

main();

