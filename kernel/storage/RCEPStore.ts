/**
 * RCEPStore - Stockage Persistant des Blobs RCEP
 * 
 * Stocke les blobs RCEP (Reasoning Context Encoding Protocol) de manière persistante
 * pour replay et audit.
 * 
 * ⚠️ RCEP est la seule source de vérité (Loi 2)
 * - Stockage basé sur checksum (déduplication)
 * - Index temporel pour requêtes par plage de temps
 * 
 * Référence : northstar.md Section 11.9
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface RCEPIndexEntry {
  checksum: string;
  timestamp: number;
  isoTimestamp: string;
}

export interface RCEPMetadata {
  timestamp: number;
  checksum: string;
}

export class RCEPStore {
  private storageDir: string;
  private indexPath: string;
  private index: Map<number, RCEPIndexEntry[]> = new Map(); // timestamp → entries

  constructor(workspaceRoot: string) {
    this.storageDir = path.join(workspaceRoot, '.reasoning_rl4', 'storage', 'rcep');
    this.indexPath = path.join(workspaceRoot, '.reasoning_rl4', 'storage', 'rcep_index.json');
    
    // Créer le répertoire de stockage
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    
    // Charger l'index
    this.loadIndex();
  }

  /**
   * Charge l'index depuis le fichier
   */
  private loadIndex(): void {
    if (!fs.existsSync(this.indexPath)) {
      return;
    }
    
    try {
      const content = fs.readFileSync(this.indexPath, 'utf-8');
      const data: { [timestamp: string]: RCEPIndexEntry[] } = JSON.parse(content);
      
      for (const [timestampStr, entries] of Object.entries(data)) {
        const timestamp = parseInt(timestampStr, 10);
        this.index.set(timestamp, entries);
      }
    } catch (error) {
      console.warn(`[RCEPStore] Failed to load index: ${error}`);
    }
  }

  /**
   * Sauvegarde l'index dans le fichier
   */
  private saveIndex(): void {
    try {
      const data: { [timestamp: string]: RCEPIndexEntry[] } = {};
      
      for (const [timestamp, entries] of this.index.entries()) {
        data[timestamp.toString()] = entries;
      }
      
      const dir = path.dirname(this.indexPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.indexPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[RCEPStore] Failed to save index: ${error}`);
    }
  }

  /**
   * Calcule le checksum SHA-256 d'un blob RCEP
   */
  private calculateChecksum(blob: string): string {
    return crypto.createHash('sha256').update(blob).digest('hex');
  }

  /**
   * Stocke un blob RCEP avec ses métadonnées
   * 
   * Si un blob avec le même checksum existe déjà, on ne le stocke pas deux fois (déduplication)
   */
  async store(rcepBlob: string, metadata: RCEPMetadata): Promise<void> {
    const checksum = this.calculateChecksum(rcepBlob);
    
    // Vérifier si le blob existe déjà
    const existingPath = path.join(this.storageDir, `${checksum}.rcep`);
    if (fs.existsSync(existingPath)) {
      // Blob déjà stocké, on ajoute juste l'entrée dans l'index
      this.addIndexEntry(metadata.timestamp, checksum);
      return;
    }
    
    // Stocker le blob
    const blobPath = path.join(this.storageDir, `${checksum}.rcep`);
    fs.writeFileSync(blobPath, rcepBlob, 'utf-8');
    
    // Ajouter l'entrée dans l'index
    this.addIndexEntry(metadata.timestamp, checksum);
    
    // Sauvegarder l'index
    this.saveIndex();
  }

  /**
   * Ajoute une entrée dans l'index
   */
  private addIndexEntry(timestamp: number, checksum: string): void {
    const entries = this.index.get(timestamp) || [];
    
    // Vérifier si l'entrée existe déjà
    if (entries.some(e => e.checksum === checksum)) {
      return; // Déjà présent
    }
    
    entries.push({
      checksum,
      timestamp,
      isoTimestamp: new Date(timestamp).toISOString()
    });
    
    this.index.set(timestamp, entries);
  }

  /**
   * Récupère les blobs RCEP dans une plage temporelle
   */
  async getByTimeRange(start: number, end: number): Promise<string[]> {
    const blobs: string[] = [];
    
    // Parcourir l'index pour trouver les entrées dans la plage
    for (const [timestamp, entries] of this.index.entries()) {
      if (timestamp >= start && timestamp <= end) {
        for (const entry of entries) {
          const blobPath = path.join(this.storageDir, `${entry.checksum}.rcep`);
          if (fs.existsSync(blobPath)) {
            const blob = fs.readFileSync(blobPath, 'utf-8');
            blobs.push(blob);
          }
        }
      }
    }
    
    return blobs;
  }

  /**
   * Récupère un blob RCEP par son checksum
   */
  async getByChecksum(checksum: string): Promise<string | null> {
    const blobPath = path.join(this.storageDir, `${checksum}.rcep`);
    
    if (!fs.existsSync(blobPath)) {
      return null;
    }
    
    return fs.readFileSync(blobPath, 'utf-8');
  }

  /**
   * Calcule le checksum d'un blob (utilitaire public)
   */
  calculateChecksumPublic(blob: string): string {
    return this.calculateChecksum(blob);
  }
}

