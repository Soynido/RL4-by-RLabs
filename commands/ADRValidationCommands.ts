import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ILogger } from '../kernel/core/ILogger';

export interface ADRProposal {
    id: string;
    title: string;
    status: 'pending' | 'accepted' | 'rejected';
    date: string;
    author: string;
    context: string;
    decision: string;
    consequences: {
        positive: string[];
        negative: string[];
        risks: string[];
        alternatives: string[];
    };
    timestamp: string;
}

export class ADRValidationCommands {
    private workspaceRoot: string;
    private adrDir: string;
    private ledgerPath: string;
    private logger: ILogger | null;

    constructor(workspaceRoot: string, logger?: ILogger | null) {
        this.workspaceRoot = workspaceRoot;
        this.adrDir = path.join(workspaceRoot, '.reasoning_rl4', 'adrs', 'auto');
        this.ledgerPath = path.join(workspaceRoot, '.reasoning_rl4', 'ledger', 'adr_validations.jsonl');
        this.logger = logger || null;
        this.ensureDirectories();
    }

    static registerCommands(context: vscode.ExtensionContext, workspaceRoot: string, logger?: ILogger | null) {
        const adrCommands = new ADRValidationCommands(workspaceRoot, logger);

        const reviewCommand = vscode.commands.registerCommand(
            'reasoning.adr.reviewPending',
            () => adrCommands.reviewPending()
        );

        const acceptCommand = vscode.commands.registerCommand(
            'reasoning.adr.acceptProposal',
            () => adrCommands.acceptProposal()
        );

        const rejectCommand = vscode.commands.registerCommand(
            'reasoning.adr.rejectProposal',
            () => adrCommands.rejectProposal()
        );

        context.subscriptions.push(reviewCommand, acceptCommand, rejectCommand);
        return adrCommands;
    }

    private ensureDirectories() {
        try {
            if (!fs.existsSync(this.adrDir)) {
                fs.mkdirSync(this.adrDir, { recursive: true });
            }
            const ledgerDir = path.dirname(this.ledgerPath);
            if (!fs.existsSync(ledgerDir)) {
                fs.mkdirSync(ledgerDir, { recursive: true });
            }
        } catch (error) {
            this.logger?.error(`Failed to create directories: ${error}`);
        }
    }

    private async loadPendingADRs(): Promise<ADRProposal[]> {
        try {
            if (!fs.existsSync(this.ledgerPath)) {
                return [];
            }

            const content = fs.readFileSync(this.ledgerPath, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line.trim());

            const adrs: ADRProposal[] = [];
            for (const line of lines) {
                try {
                    const adr = JSON.parse(line);
                    if (adr.status === 'pending') {
                        adrs.push(adr);
                    }
                } catch (parseError) {
                    this.logger?.warning(`Failed to parse ADR line: ${parseError}`);
                }
            }

            return adrs;
        } catch (error) {
            this.logger?.error(`Failed to load pending ADRs: ${error}`);
            return [];
        }
    }

    private async reviewPending() {
        try {
            const pendingADRs = await this.loadPendingADRs();

            if (pendingADRs.length === 0) {
                vscode.window.showInformationMessage('No pending ADRs to review');
                return;
            }

            // Show quick pick with pending ADRs
            const items = pendingADRs.map(adr => ({
                label: adr.title,
                description: `ID: ${adr.id} | ${adr.date}`,
                detail: `Context: ${adr.context.substring(0, 100)}...`,
                adr: adr
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Select ADR to review (${pendingADRs.length} pending)`
            });

            if (selected) {
                await this.showADRDetails(selected.adr);
            }

        } catch (error) {
            const errorMsg = `Failed to review pending ADRs: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async showADRDetails(adr: ADRProposal) {
        const message = `
ADR: ${adr.title}
ID: ${adr.id}
Date: ${adr.date}
Author: ${adr.author}

Context: ${adr.context}

Decision: ${adr.decision}

Positive Consequences:
${adr.consequences.positive.map(p => `• ${p}`).join('\n')}

Negative Consequences:
${adr.consequences.negative.map(n => `• ${n}`).join('\n')}

Risks:
${adr.consequences.risks.map(r => `• ${r}`).join('\n')}

Alternatives:
${adr.consequences.alternatives.map(a => `• ${a}`).join('\n')}
        `.trim();

        const action = await vscode.window.showInformationMessage(
            'ADR Review - Choose Action',
            'Accept', 'Reject', 'Cancel'
        );

        if (action === 'Accept') {
            await this.acceptADR(adr);
        } else if (action === 'Reject') {
            await this.rejectADR(adr);
        }
    }

    private async acceptProposal() {
        try {
            const pendingADRs = await this.loadPendingADRs();

            if (pendingADRs.length === 0) {
                vscode.window.showInformationMessage('No pending ADRs to accept');
                return;
            }

            // If only one pending ADR, accept it directly
            if (pendingADRs.length === 1) {
                await this.acceptADR(pendingADRs[0]);
                return;
            }

            // Show quick pick to select which ADR to accept
            const items = pendingADRs.map(adr => ({
                label: `Accept: ${adr.title}`,
                description: `ID: ${adr.id} | ${adr.date}`,
                adr: adr
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select ADR to accept'
            });

            if (selected) {
                await this.acceptADR(selected.adr);
            }

        } catch (error) {
            const errorMsg = `Failed to accept ADR proposal: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async rejectProposal() {
        try {
            const pendingADRs = await this.loadPendingADRs();

            if (pendingADRs.length === 0) {
                vscode.window.showInformationMessage('No pending ADRs to reject');
                return;
            }

            // If only one pending ADR, reject it directly
            if (pendingADRs.length === 1) {
                await this.rejectADR(pendingADRs[0]);
                return;
            }

            // Show quick pick to select which ADR to reject
            const items = pendingADRs.map(adr => ({
                label: `Reject: ${adr.title}`,
                description: `ID: ${adr.id} | ${adr.date}`,
                adr: adr
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select ADR to reject'
            });

            if (selected) {
                await this.rejectADR(selected.adr);
            }

        } catch (error) {
            const errorMsg = `Failed to reject ADR proposal: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async acceptADR(adr: ADRProposal) {
        try {
            // Update ADR status
            adr.status = 'accepted';
            adr.timestamp = new Date().toISOString();

            // Write updated ADR to ledger
            await this.appendADRToLedger(adr);

            // Create ADR file in adrs directory
            const adrFilePath = path.join(this.adrDir, `${adr.id}.md`);
            const adrContent = this.generateADRMarkdown(adr);
            fs.writeFileSync(adrFilePath, adrContent, 'utf-8');

            const message = `ADR "${adr.title}" accepted and saved`;
            vscode.window.showInformationMessage(message);
            this.logger?.success(`ADR accepted: ${adr.title}`);

        } catch (error) {
            const errorMsg = `Failed to accept ADR: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async rejectADR(adr: ADRProposal) {
        try {
            // Update ADR status
            adr.status = 'rejected';
            adr.timestamp = new Date().toISOString();

            // Write updated ADR to ledger
            await this.appendADRToLedger(adr);

            const message = `ADR "${adr.title}" rejected`;
            vscode.window.showInformationMessage(message);
            this.logger?.system(`ADR rejected: ${adr.title}`);

        } catch (error) {
            const errorMsg = `Failed to reject ADR: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async appendADRToLedger(adr: ADRProposal) {
        try {
            const adrLine = JSON.stringify(adr) + '\n';
            fs.appendFileSync(this.ledgerPath, adrLine, 'utf-8');
        } catch (error) {
            throw new Error(`Failed to append ADR to ledger: ${error}`);
        }
    }

    private generateADRMarkdown(adr: ADRProposal): string {
        return `
# ${adr.title}

**ADR ID:** ${adr.id}
**Status:** ${adr.status}
**Date:** ${adr.date}
**Author:** ${adr.author}

## Context

${adr.context}

## Decision

${adr.decision}

## Consequences

### Positive

${adr.consequences.positive.map(p => `- ${p}`).join('\n')}

### Negative

${adr.consequences.negative.map(n => `- ${n}`).join('\n')}

### Risks

${adr.consequences.risks.map(r => `- ${r}`).join('\n')}

### Alternatives Considered

${adr.consequences.alternatives.map(a => `- ${a}`).join('\n')}

---
*Generated by RL4 ADR Validation System*
        `.trim();
    }
}