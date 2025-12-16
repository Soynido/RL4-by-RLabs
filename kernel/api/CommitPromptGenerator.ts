/**
 * CommitPromptGenerator - Generates structured prompt for LLM to generate WHY + GH CLI command
 * 
 * The prompt includes:
 * - All real data collected by CommitContextCollector
 * - Instructions to generate WHY
 * - Instructions to generate complete GH CLI command
 * - Mandatory validation step
 * 
 * NO AI here - just prompt generation
 */

import * as path from 'path';
import { CommitContext } from './CommitContextCollector';

export class CommitPromptGenerator {
    /**
     * Generate complete prompt for LLM
     */
    public generatePrompt(context: CommitContext): string {
        let prompt = `# 🧠 RL4 Commit Context — Generate WHY + GH CLI Command\n\n`;
        prompt += `**Generated:** ${context.timestamp}\n`;
        prompt += `**Workspace:** ${path.basename(context.workspaceRoot)}\n\n`;
        
        prompt += `---\n\n`;
        
        // Section 1: Current Changes
        prompt += `## 📋 Current Changes (Uncommitted)\n\n`;
        
        if (context.diffStat) {
            prompt += `### Git Diff Summary\n\`\`\`\n${context.diffStat}\n\`\`\`\n\n`;
        }
        
        if (context.filesChanged.length > 0) {
            prompt += `### Files Changed\n\`\`\`\n${context.filesChanged.join('\n')}\n\`\`\`\n\n`;
        }
        
        if (context.diffContent) {
            prompt += `### Actual Diff (Key Changes - First 100 lines)\n\`\`\`diff\n${context.diffContent}\n\`\`\`\n\n`;
        }
        
        prompt += `### Stats\n`;
        prompt += `- Files changed: ${context.filesChanged.length}\n`;
        prompt += `- Insertions: +${context.insertions}\n`;
        prompt += `- Deletions: -${context.deletions}\n`;
        prompt += `- Net change: ${context.netChange > 0 ? '+' : ''}${context.netChange} lines\n\n`;
        
        // Section 2: Recent Commit History
        if (context.recentCommits.length > 0) {
            prompt += `---\n\n`;
            prompt += `## 📜 Recent Commit History (Context)\n\n`;
            prompt += `### Last 5 Commits\n\`\`\`\n`;
            for (const commit of context.recentCommits) {
                prompt += `${commit.hash.substring(0, 7)} | ${commit.author} | ${commit.date} | ${commit.message}\n`;
            }
            prompt += `\`\`\`\n\n`;
        }
        
        // Section 3: RL4 Cognitive Context
        prompt += `---\n\n`;
        prompt += `## 🎯 RL4 Cognitive Context\n\n`;
        
        if (context.activeADRs.length > 0) {
            prompt += `### Active ADRs\n\`\`\`\n`;
            for (const adr of context.activeADRs) {
                prompt += `${adr.id}: ${adr.title} (${adr.status})\n`;
            }
            prompt += `\`\`\`\n\n`;
        }
        
        if (context.detectedPattern) {
            prompt += `### Detected Pattern\n\`\`\`\n`;
            prompt += `Type: ${context.detectedPattern.type}\n`;
            prompt += `Confidence: ${(context.detectedPattern.confidence * 100).toFixed(0)}%\n`;
            prompt += `Indicators: ${context.detectedPattern.indicators.join(', ')}\n`;
            prompt += `\`\`\`\n\n`;
        }
        
        if (context.timelineContext.length > 0) {
            prompt += `### Timeline Context (Files modified in last 2h)\n\`\`\`\n`;
            for (const item of context.timelineContext) {
                prompt += `${item.file} (${item.edits} edits)\n`;
            }
            prompt += `\`\`\`\n\n`;
        }
        
        // Section 4: TASK - Generate WHY + GH CLI Command
        prompt += `---\n\n`;
        prompt += `## ❓ TASK: Generate WHY + Complete GH CLI Command\n\n`;
        prompt += `**Based on the above REAL data, you MUST provide:**\n\n`;
        
        prompt += `### 1. Generate WHY (1-2 sentences)\n`;
        prompt += `- What problem does this solve?\n`;
        prompt += `- What triggered these modifications?\n`;
        prompt += `- Use ONLY the data provided above\n`;
        prompt += `- Do NOT invent information\n`;
        prompt += `- Be factual and concise\n`;
        prompt += `- **This is the MISSING PIECE** - explain the reasoning behind the changes\n\n`;
        
        prompt += `### 2. Generate Complete Git Workflow\n`;
        prompt += `Create a **complete, ready-to-execute** workflow with 3 steps:\n`;
        prompt += `1. **Commit** changes with conventional commit format (feat/fix/refactor/etc.)\n`;
        prompt += `2. **Push** to a new branch (or current branch if already on feature branch)\n`;
        prompt += `3. **Create PR** with title and body\n\n`;
        prompt += `**Important:**\n`;
        prompt += `- Use \`git commit -m\` for the commit message\n`;
        prompt += `- Create a new branch name based on the change (e.g., \`refactor/rl4-kpis-update\`)\n`;
        prompt += `- Use \`gh pr create\` with title and body\n`;
        prompt += `- **Escape backticks in body** (use \\\` instead of \` to avoid shell interpretation)\n`;
        prompt += `- **Use single quotes for body** to avoid shell interpretation issues\n\n`;
        
        prompt += `### 3. MANDATORY Validation Step\n`;
        prompt += `**CRITICAL:** You MUST include this validation step in your response:\n\n`;
        prompt += `\`\`\`\n`;
        prompt += `## ✅ VALIDATION REQUIRED\n\n`;
        prompt += `Before executing, the user will review:\n`;
        prompt += `1. WHY is accurate and based on real data (not invented)\n`;
        prompt += `2. GH CLI command is complete and correct\n`;
        prompt += `3. Commit message follows conventional format\n`;
        prompt += `4. All context is included (ADRs, patterns, timeline)\n\n`;
        prompt += `**The user will validate before execution.**\n`;
        prompt += `\`\`\`\n\n`;
        
        prompt += `---\n\n`;
        prompt += `## 📝 Your Response Format (STRICT)\n\n`;
        prompt += `You MUST provide your response in this EXACT format:\n\n`;
        prompt += `\`\`\`markdown\n`;
        prompt += `## WHY\n`;
        prompt += `[Your WHY explanation - 1-2 sentences based on REAL data above]\n\n`;
        prompt += `## Commit Preview\n`;
        prompt += `### Title\n`;
        prompt += `feat: [your title based on pattern]\n\n`;
        prompt += `### Body\n`;
        prompt += `[Your complete commit body with:\n`;
        prompt += `- WHY (from above)\n`;
        prompt += `- WHAT changed (from diff)\n`;
        prompt += `- Context (ADRs, patterns, timeline)\n`;
        prompt += `Format as markdown]\n\n`;
        prompt += `## Git Workflow (Complete, Ready-to-Execute)\n`;
        prompt += `\`\`\`bash\n`;
        prompt += `# Step 1: Create and checkout new branch\n`;
        prompt += `git checkout -b refactor/[branch-name]\n\n`;
        prompt += `# Step 2: Stage and commit changes\n`;
        prompt += `git add .\n`;
        prompt += `git commit -m "refactor: [your title]"\n\n`;
        prompt += `# Step 3: Push branch\n`;
        prompt += `git push -u ${context.githubRemote} refactor/[branch-name]\n\n`;
        prompt += `# Step 4: Create PR (use single quotes for body to avoid shell issues)\n`;
        prompt += `gh pr create --title "refactor: [your title]" --body '[your body with actual newlines]' --base ${context.defaultBranch}\n`;
        prompt += `\`\`\`\n\n`;
        prompt += `**Important:**\n`;
        prompt += `- Replace [branch-name] with a descriptive name (e.g., \`rl4-kpis-update\`)\n`;
        prompt += `- Use **single quotes** for the --body to avoid shell interpretation of backticks and special chars\n`;
        prompt += `- Use actual newlines (\\n) in the body string\n`;
        prompt += `- **Default branch detected:** \`${context.defaultBranch}\` (use this in --base)\n`;
        prompt += `- **GitHub remote detected:** \`${context.githubRemote}\` (use this in git push)\n\n`;
        prompt += `## ✅ RL4 Validation Token\n`;
        prompt += `Copy this EXACT block and paste it in RL4 webview to validate and execute:\n\n`;
        prompt += `**CRITICAL:** You MUST format the token block EXACTLY as shown below, with line breaks:\n\n`;
        prompt += `\`\`\`\n`;
        prompt += `RL4_COMMIT_VALIDATE\n`;
        prompt += `WHY: [your WHY from above]\n`;
        prompt += `COMMAND: [the complete workflow: git checkout -b ... && git add . && git commit -m "..." && git push -u ${context.githubRemote} ... && gh pr create ...]\n`;
        prompt += `RL4_COMMIT_END\n`;
        prompt += `\`\`\`\n\n`;
        prompt += `**IMPORTANT FORMATTING RULES:**\n`;
        prompt += `- Each line MUST be on a separate line (use \\n or actual line breaks)\n`;
        prompt += `- WHY: must be on its own line\n`;
        prompt += `- COMMAND: must be on its own line\n`;
        prompt += `- RL4_COMMIT_END must be on its own line\n`;
        prompt += `- The COMMAND line should contain the complete workflow (git checkout -b ... && git add . && git commit ... && git push ... && gh pr create ...)\n`;
        prompt += `- Use single quotes for --body in gh pr create to avoid shell interpretation\n\n`;
        prompt += `**The user will paste this block in RL4, which will:\n`;
        prompt += `1. Show the commit preview for validation\n`;
        prompt += `2. Execute the command automatically after user clicks "Validate & Execute"**\n\n`;
        
        prompt += `**CRITICAL REMINDERS:**\n`;
        prompt += `- Use ONLY real data from above (diff, history, ADRs, patterns)\n`;
        prompt += `- Do NOT invent information\n`;
        prompt += `- Generate WHY based on actual changes (the MISSING PIECE)\n`;
        prompt += `- Workflow must be executable as-is (multiple commands joined with &&)\n`;
        prompt += `- Use single quotes for --body to avoid shell interpretation of backticks\n`;
        prompt += `- Include the RL4 validation token block for automatic execution\n`;
        
        return prompt;
    }
}

