/******************************************************************************************
 * PromptSnapshotValidator.ts - Validation et checksum pour PromptSnapshot
 *
 * Responsabilité UNIQUE : Validation structurale et calcul d'intégrité
 * - Validation stricte des invariants PromptSnapshot
 * - Calcul de checksum SHA-256 déterministe
 * - Gestion des erreurs avec stratégie configurable
 ******************************************************************************************/

import { createHash } from "crypto";
import {
  PromptSnapshot,
  PromptSnapshotLayer,
  PromptSnapshotTopic,
  PromptSnapshotEvent,
  PromptSnapshotDecision,
  PromptSnapshotInsight,
  PromptSnapshotSource,
  PromptSnapshotIntegrity,
  PROMPT_SNAPSHOT_VERSION
} from "./PromptSnapshot";

// === TYPES DÉRIVÉS ===

export type PromptSnapshotWithoutChecksum = Omit<PromptSnapshot, "checksum">;

// === ERREUR DE VALIDATION ===

export interface ValidationError {
  value: any;
  context?: Array<{ key: string }>;
  message: string;
}

// === CLASSE DE VALIDATION ===

export class PromptSnapshotValidator {
  /**
   * Validation d'un snapshot FINAL (import/replay) avec checksum
   */
  public validateFinal(snapshot: unknown): PromptSnapshot {
    if (!this.isPromptSnapshot(snapshot)) {
      throw new PromptSnapshotValidationError([{
        value: snapshot,
        context: [],
        message: "Invalid PromptSnapshot structure"
      }]);
    }

    // Validation croisée des métadonnées
    this.validateIntegrityConsistency(snapshot);

    // Validation du checksum
    if (!this.verifyIntegrity(snapshot)) {
      throw new PromptSnapshotValidationError([{
        value: snapshot.checksum,
        context: [{ key: "checksum" }],
        message: "Checksum verification failed: snapshot may be corrupted or tampered"
      }]);
    }

    return snapshot;
  }

  /**
   * Validation + enrichissement (build-time) avec calcul de checksum
   */
  public validateAndSeal(snapshot: PromptSnapshotWithoutChecksum): PromptSnapshot {
    // Validation structurelle de base
    if (!this.isPromptSnapshotWithoutChecksum(snapshot)) {
      throw new PromptSnapshotValidationError([{
        value: snapshot,
        context: [],
        message: "Invalid PromptSnapshotWithoutChecksum structure"
      }]);
    }

    // Validation croisée des métadonnées
    this.validateIntegrityConsistency({
      ...snapshot,
      checksum: "" // Temporaire pour la validation
    });

    // Calcul du checksum
    const checksum = this.calculateChecksum(snapshot);

    return {
      ...snapshot,
      checksum
    };
  }

  /**
   * Validation principale avec backward compatibility (calcule checksum si manquant)
   */
  public validate(snapshot: unknown): PromptSnapshot {
    // Tenter validation finale d'abord
    try {
      return this.validateFinal(snapshot);
    } catch (error) {
      // Si échec de checksum, tenter validation + scellage
      if (error instanceof PromptSnapshotValidationError) {
        const snapshotWithoutChecksum = snapshot as any;
        if (snapshotWithoutChecksum && !snapshotWithoutChecksum.checksum) {
          return this.validateAndSeal(snapshotWithoutChecksum);
        }
      }
      throw error;
    }
  }

  /**
   * Calcul de checksum SHA-256 déterministe
   */
  public calculateChecksum(snapshot: PromptSnapshotWithoutChecksum): string {
    const canonical = this.canonicalStringify(snapshot);
    return createHash("sha256").update(canonical, "utf8").digest("hex");
  }

  /**
   * Vérification de l'intégrité d'un snapshot
   */
  public verifyIntegrity(snapshot: PromptSnapshot): boolean {
    try {
      // Recalcul du checksum
      const { checksum: _, ...snapshotWithoutChecksum } = snapshot;
      const expectedChecksum = this.calculateChecksum(snapshotWithoutChecksum);

      // Vérification
      return snapshot.checksum === expectedChecksum;
    } catch {
      return false;
    }
  }

  /**
   * Validation en mode "collect all errors"
   */
  public validateWithErrors(snapshot: unknown): {
    isValid: boolean;
    errors: ValidationError[];
    data?: PromptSnapshot;
  } {
    try {
      const validated = this.validate(snapshot);
      return {
        isValid: true,
        errors: [],
        data: validated
      };
    } catch (error) {
      if (error instanceof PromptSnapshotValidationError) {
        return {
          isValid: false,
          errors: error.errors
        };
      }
      throw error;
    }
  }

  // === MÉTHODES PRIVÉES ===

  /**
   * Vérification de type PromptSnapshot
   */
  private isPromptSnapshot(obj: any): obj is PromptSnapshot {
    return obj &&
      typeof obj === "object" &&
      obj.version === PROMPT_SNAPSHOT_VERSION &&
      typeof obj.timestamp === "number" &&
      typeof obj.checksum === "string" &&
      Array.isArray(obj.layers) &&
      Array.isArray(obj.topics) &&
      Array.isArray(obj.timeline) &&
      Array.isArray(obj.decisions) &&
      Array.isArray(obj.insights) &&
      typeof obj.source === "object" &&
      typeof obj.integrity === "object";
  }

  /**
   * Vérification de type PromptSnapshotWithoutChecksum
   */
  private isPromptSnapshotWithoutChecksum(obj: any): obj is PromptSnapshotWithoutChecksum {
    return obj &&
      typeof obj === "object" &&
      obj.version === PROMPT_SNAPSHOT_VERSION &&
      typeof obj.timestamp === "number" &&
      !obj.checksum &&
      Array.isArray(obj.layers) &&
      Array.isArray(obj.topics) &&
      Array.isArray(obj.timeline) &&
      Array.isArray(obj.decisions) &&
      Array.isArray(obj.insights) &&
      typeof obj.source === "object" &&
      typeof obj.integrity === "object";
  }

  /**
   * Canonicalisation récursive stable pour checksum déterministe
   */
  private canonicalize(value: any): any {
    if (Array.isArray(value)) {
      return value.map(v => this.canonicalize(v));
    }
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = this.canonicalize(value[key]);
          return acc;
        }, {} as any);
    }
    return value;
  }

  /**
   * Stringification canonique pour checksum déterministe
   */
  private canonicalStringify(obj: any): string {
    return JSON.stringify(this.canonicalize(obj));
  }

  /**
   * Validation de la cohérence des métadonnées d'intégrité
   */
  private validateIntegrityConsistency(snapshot: PromptSnapshot): void {
    const { integrity, layers, topics, timeline, decisions, insights } = snapshot;

    // Vérification des comptes
    if (integrity.layerCount !== layers.length) {
      throw new PromptSnapshotValidationError([{
        value: layers.length,
        context: [{ key: "integrity" }, { key: "layerCount" }],
        message: `Integrity mismatch: layerCount=${integrity.layerCount}, actual=${layers.length}`
      }]);
    }

    if (integrity.topicCount !== topics.length) {
      throw new PromptSnapshotValidationError([{
        value: topics.length,
        context: [{ key: "integrity" }, { key: "topicCount" }],
        message: `Integrity mismatch: topicCount=${integrity.topicCount}, actual=${topics.length}`
      }]);
    }

    if (integrity.eventCount !== timeline.length) {
      throw new PromptSnapshotValidationError([{
        value: timeline.length,
        context: [{ key: "integrity" }, { key: "eventCount" }],
        message: `Integrity mismatch: eventCount=${integrity.eventCount}, actual=${timeline.length}`
      }]);
    }

    if (integrity.decisionCount !== decisions.length) {
      throw new PromptSnapshotValidationError([{
        value: decisions.length,
        context: [{ key: "integrity" }, { key: "decisionCount" }],
        message: `Integrity mismatch: decisionCount=${integrity.decisionCount}, actual=${decisions.length}`
      }]);
    }

    if (integrity.insightCount !== insights.length) {
      throw new PromptSnapshotValidationError([{
        value: insights.length,
        context: [{ key: "integrity" }, { key: "insightCount" }],
        message: `Integrity mismatch: insightCount=${integrity.insightCount}, actual=${insights.length}`
      }]);
    }

    // Vérification du poids total
    const totalWeight = this.calculateTotalWeight(snapshot);
    if (integrity.totalWeight !== totalWeight) {
      throw new PromptSnapshotValidationError([{
        value: totalWeight,
        context: [{ key: "integrity" }, { key: "totalWeight" }],
        message: `Integrity mismatch: totalWeight=${integrity.totalWeight}, calculated=${totalWeight}`
      }]);
    }
  }

  /**
   * Calcul du poids total
   */
  private calculateTotalWeight(snapshot: Omit<PromptSnapshot, "checksum">): number {
    const { layers, topics, decisions, insights } = snapshot;

    const layerWeight = layers.reduce((sum, layer) => sum + layer.weight, 0);
    const topicWeight = topics.reduce((sum, topic) => sum + topic.weight, 0);
    const decisionWeight = decisions.reduce((sum, decision) => sum + decision.weight, 0);
    const insightWeight = insights.reduce((sum, insight) => sum + insight.salience, 0);

    return layerWeight + topicWeight + decisionWeight + insightWeight;
  }
}

// === CLASSE D'ERREUR ===

export class PromptSnapshotValidationError extends Error {
  public readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const message = `PromptSnapshot validation failed: ${errors.length} error(s)`;
    super(message);
    this.name = "PromptSnapshotValidationError";
    this.errors = errors;
  }

  public getSummary(): string {
    return this.errors.map(err => `Path: ${err.context?.map(c => c.key).join(".") || "root"}, Message: ${err.message}`).join("; ");
  }
}

// === FACTORY POUR VALIDATORS PRÉDÉFINIS ===

export namespace PromptSnapshotValidatorFactory {
  export function forExport(): PromptSnapshotValidator {
    return new PromptSnapshotValidator();
  }

  export function forImport(): PromptSnapshotValidator {
    return new PromptSnapshotValidator();
  }

  export function lenient(): PromptSnapshotValidator {
    return new PromptSnapshotValidator();
  }
}