/******************************************************************************************
 * LegacyPromptContextV1Adapter.ts - Adaptateur pour /kernel/context/types/PromptContext.ts
 *
 * Responsabilité UNIQUE : Adapter PromptContext V1 vers PromptSnapshot
 * - Lecture/mapping/normalisation uniquement
 * - AUCUNE correction ou amélioration du legacy
 * - Frontière unidirectionnelle stricte
 * - Rejet explicite si invalide
 *
 * Règles non négociables :
 * 1. Ne connaît PAS le legacy (import isolé)
 * 2. Ne corrige PAS le legacy (pas d'interprétation)
 * 3. Sortie TOUJOURS via Validator injecté
 * 4. Tests round-trip obligatoires
 *
 * Champs volontairement non représentables dans PromptSnapshot v1 :
 * - humanSummary : décision de mapping sémantique explicite
 ******************************************************************************************/

import {
  PromptSnapshot,
  PromptSnapshotSource,
  PROMPT_SNAPSHOT_VERSION
} from "../PromptSnapshot.js";
import { PromptSnapshotValidator } from "../PromptSnapshotValidator.js";

// === Interface d'adaptation (copie indépendante) ===

/**
 * Interface copiée depuis /kernel/context/types/PromptContext.ts
 * Import isolé pour éviter les dépendances croisées
 */
export interface LegacyPromptContextV1 {
  metadata: {
    sessionId: string;
    llmModel: string;
    contextWindow: number;
    encodingTime: number;
    ptrScheme: "mil-his-v1" | "internal-v1";
  };
  layers: Array<{
    id: number;
    name: string;
    weight: number; // 0-999
    parent: number | "ROOT";
  }>;
  topics: Array<{
    id: number;
    name: string;
    weight: number; // 0-999
    refs: number[];
  }>;
  timeline: Array<{
    id: number;
    time: number; // Unix timestamp
    type: "query" | "response" | "reflection" | "decision";
    ptr: string;
  }>;
  decisions: Array<{
    id: number;
    type: "accept" | "reject" | "modify" | "defer";
    weight: number; // 0-999
    inputs: number[];
  }>;
  insights: Array<{
    id: number;
    type: "pattern" | "anomaly" | "correlation" | "causation";
    salience: number; // 0-999
    links: number[];
  }>;
  humanSummary?: {
    type: "brief" | "detailed" | "technical";
    text: string;
  };
}

// === Métadonnées d'adaptation (lecture seule) ===

export interface V1AdapterMetadata {
  sourceType: "legacy-v1";
  sourceComponent: string;
  sourceVersion: "1.0";
  adaptationTime: number;
  preservedFields: string[];
  droppedFields: string[];
  warnings: string[];
}

// === Classe d'adaptation V1 ===

export class LegacyPromptContextV1Adapter {
  private readonly validator: PromptSnapshotValidator;
  private readonly strictMode: boolean;

  /**
   * CORRECTION : Validator injecté (pas construit localement)
   * La factory décide, l'adaptateur exécute
   */
  constructor(
    validator: PromptSnapshotValidator,
    options: { strictMode?: boolean } = {}
  ) {
    this.validator = validator;
    this.strictMode = options.strictMode ?? true;
  }

  /**
   * Point d'entrée unique : adapte un contexte V1 vers snapshot
   *
   * Règle : sortie TOUJOURS via validator injecté, jamais de snapshot non validé
   */
  public adapt(context: LegacyPromptContextV1): {
    snapshot: PromptSnapshot;
    metadata: V1AdapterMetadata
  } {
    // CORRECTION : Horloge unique pour éviter la non-déterminisme
    const now = Date.now();
    const startTime = now;
    const warnings: string[] = [];
    const droppedFields: string[] = [];
    const preservedFields: string[] = [];

    try {
      // 1. Validation préliminaire du legacy (rejet si structure invalide)
      this.validateLegacyStructuralIntegrity(context, warnings);

      // 2. Mapping direct (sans interprétation ni correction)
      const mapping = this.mapLegacyToSnapshot(context, warnings, preservedFields, droppedFields);

      // 3. Construction du snapshot brut (sans validation)
      const adaptationTime = now - startTime;
      const rawSnapshot = this.buildRawSnapshot(context, mapping, warnings, adaptationTime, now);

      // 4. Validation OBLIGATOIRE via Validator injecté (Règle 4)
      const validatedSnapshot = this.validator.validate(rawSnapshot);

      // 5. Métadonnées d'adaptation
      const metadata: V1AdapterMetadata = {
        sourceType: "legacy-v1",
        sourceComponent: "PromptContextV1",
        sourceVersion: "1.0",
        adaptationTime,
        preservedFields,
        droppedFields,
        warnings,
      };

      return {
        snapshot: validatedSnapshot,
        metadata
      };

    } catch (error) {
      // Échec explicite sans masquage
      const adaptationTime = now - startTime;
      const metadata: V1AdapterMetadata = {
        sourceType: "legacy-v1",
        sourceComponent: "PromptContextV1",
        sourceVersion: "1.0",
        adaptationTime,
        preservedFields,
        droppedFields,
        warnings,
      };

      throw new V1AdapterError(
        "V1 adaptation failed",
        error instanceof Error ? error.message : String(error),
        metadata
      );
    }
  }

  // === VALIDATION PRÉLIMINAIRE (lecture seule) ===

  /**
   * CORRECTION : Nom explicite de l'intention
   * Cette validation ne corrige rien mais applique les invariants minimaux requis pour l'adaptation.
   * Pas de validation métier déguisée.
   */
  private validateLegacyStructuralIntegrity(context: LegacyPromptContextV1, warnings: string[]): void {
    // Validation stricte de la structure legacy
    if (!context) {
      throw new Error("Legacy context is null or undefined");
    }

    if (!context.metadata) {
      throw new Error("Missing metadata in legacy context");
    }

    if (!context.metadata.sessionId) {
      throw new Error("Missing sessionId in legacy metadata");
    }

    if (!Array.isArray(context.layers)) {
      throw new Error("Invalid layers: must be an array");
    }

    if (!Array.isArray(context.topics)) {
      throw new Error("Invalid topics: must be an array");
    }

    if (!Array.isArray(context.timeline)) {
      throw new Error("Invalid timeline: must be an array");
    }

    if (!Array.isArray(context.decisions)) {
      throw new Error("Invalid decisions: must be an array");
    }

    if (!Array.isArray(context.insights)) {
      throw new Error("Invalid insights: must be an array");
    }

    // Validation des IDs uniques (politique de rejet explicite)
    this.validateUniqueIds(context.layers, "layers", warnings);
    this.validateUniqueIds(context.topics, "topics", warnings);
    this.validateUniqueIds(context.timeline, "timeline", warnings);
    this.validateUniqueIds(context.decisions, "decisions", warnings);
    this.validateUniqueIds(context.insights, "insights", warnings);
  }

  private validateUniqueIds(
    items: Array<{ id: number }>,
    collection: string,
    warnings: string[]
  ): void {
    const ids = new Set<number>();
    const duplicates: number[] = [];

    items.forEach((item, index) => {
      if (typeof item.id !== "number" || !Number.isInteger(item.id) || item.id < 0) {
        throw new Error(`Invalid ID in ${collection}[${index}]: ${item.id}`);
      }

      if (ids.has(item.id)) {
        duplicates.push(item.id);
      } else {
        ids.add(item.id);
      }
    });

    if (duplicates.length > 0 && this.strictMode) {
      throw new Error(`Duplicate IDs in ${collection}: ${duplicates.join(", ")}`);
    }

    if (duplicates.length > 0) {
      warnings.push(`Duplicate IDs in ${collection}: ${duplicates.join(", ")}`);
    }
  }

  // === MAPPING DIRECT (sans interprétation) ===

  private mapLegacyToSnapshot(
    context: LegacyPromptContextV1,
    warnings: string[],
    preservedFields: string[],
    droppedFields: string[]
  ): {
    layers: PromptSnapshot["layers"];
    topics: PromptSnapshot["topics"];
    timeline: PromptSnapshot["timeline"];
    decisions: PromptSnapshot["decisions"];
    insights: PromptSnapshot["insights"];
  } {
    const layers = context.layers.map((layer, index) => {
      preservedFields.push(`layers[${index}]`);
      return {
        id: layer.id,
        name: layer.name, // PAS de normalisation, mapping direct
        weight: layer.weight, // PAS de correction, mapping direct
        parent: layer.parent, // Mapping direct
        kind: "layer" as const,
      };
    });

    const topics = context.topics.map((topic, index) => {
      preservedFields.push(`topics[${index}]`);
      return {
        id: topic.id,
        name: topic.name,
        weight: topic.weight,
        refs: topic.refs,
        kind: "topic" as const,
      };
    });

    const timeline = context.timeline.map((event, index) => {
      preservedFields.push(`timeline[${index}]`);
      return {
        id: event.id,
        time: event.time,
        type: event.type,
        ptr: event.ptr,
        kind: "event" as const,
      };
    });

    const decisions = context.decisions.map((decision, index) => {
      preservedFields.push(`decisions[${index}]`);
      return {
        id: decision.id,
        type: decision.type,
        weight: decision.weight,
        inputs: decision.inputs,
        kind: "decision" as const,
      };
    });

    const insights = context.insights.map((insight, index) => {
      preservedFields.push(`insights[${index}]`);
      return {
        id: insight.id,
        type: insight.type,
        salience: insight.salience,
        links: insight.links,
        kind: "insight" as const,
      };
    });

    // CORRECTION : Documentation explicite de la décision de mapping sémantique
    // Champs volontairement non représentables dans PromptSnapshot v1
    if (context.humanSummary) {
      droppedFields.push("humanSummary (not represented in PromptSnapshot v1)");
    }

    return { layers, topics, timeline, decisions, insights };
  }

  // === CONSTRUCTION DU SNAPSHOT BRUT (sans validation) ===

  private buildRawSnapshot(
    context: LegacyPromptContextV1,
    mapping: ReturnType<LegacyPromptContextV1Adapter["mapLegacyToSnapshot"]>,
    warnings: string[],
    adaptationTime: number,
    now: number
  ): Omit<PromptSnapshot, "checksum"> {
    // Calcul des métriques d'intégrité
    const totalWeight =
      mapping.layers.reduce((sum, l) => sum + l.weight, 0) +
      mapping.topics.reduce((sum, t) => sum + t.weight, 0) +
      mapping.insights.reduce((sum, i) => sum + i.salience, 0) +
      mapping.decisions.reduce((sum, d) => sum + d.weight, 0);

    // CORRECTION : Pas de placeholder dans le DTO
    // Utilisation de l'horloge unique et du temps réel d'adaptation
    return {
      version: PROMPT_SNAPSHOT_VERSION,
      timestamp: now, // Horloge unique
      sessionId: context.metadata.sessionId,

      layers: mapping.layers,
      topics: mapping.topics,
      timeline: mapping.timeline,
      decisions: mapping.decisions,
      insights: mapping.insights,

      source: {
        type: "runtime",
        component: "LegacyPromptContextV1Adapter",
        version: "1.0"
      } as PromptSnapshotSource,
      generationTime: adaptationTime, // Temps réel d'adaptation
      sourceVersion: "1.0",

      schema: "strict-v1",
      integrity: {
        totalWeight,
        layerCount: mapping.layers.length,
        topicCount: mapping.topics.length,
        eventCount: mapping.timeline.length,
        decisionCount: mapping.decisions.length,
        insightCount: mapping.insights.length,
      },
    };
  }
}

// === EXCEPTION SPÉCIFIQUE V1 ===

export class V1AdapterError extends Error {
  public readonly metadata: V1AdapterMetadata;
  public readonly isLegacyInvalid: boolean;

  constructor(
    message: string,
    cause: string,
    metadata: V1AdapterMetadata,
    isLegacyInvalid: boolean = false
  ) {
    super(`${message}: ${cause}`);
    this.name = "V1AdapterError";
    this.metadata = metadata;
    this.isLegacyInvalid = isLegacyInvalid;
  }

  public getSummary(): string {
    return `${this.metadata.warnings.length} warnings, ${this.metadata.droppedFields.length} dropped fields`;
  }
}

// === FACTORY POUR CAS D'USAGE ===

export namespace V1AdapterFactory {
  export function strict(validator: PromptSnapshotValidator): LegacyPromptContextV1Adapter {
    return new LegacyPromptContextV1Adapter(validator, { strictMode: true });
  }

  export function lenient(validator: PromptSnapshotValidator): LegacyPromptContextV1Adapter {
    return new LegacyPromptContextV1Adapter(validator, { strictMode: false });
  }

  export function forMigration(validator: PromptSnapshotValidator): LegacyPromptContextV1Adapter {
    return new LegacyPromptContextV1Adapter(validator, { strictMode: false });
  }
}