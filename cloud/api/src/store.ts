import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type EventMode = "planning" | "live";
export interface NeatEvent {
  id: string; slug: string; title: string; hostName: string; hostToken: string;
  date: string | null; mode: EventMode; machineId: string | null;
  createdAt: string; checkedShoppingKeys?: string[];
}
export interface DrinkRequest {
  id: string; eventId: string; guestName: string; guestToken: string;
  recipeId: string | null; recipeName: string; note: string | null; createdAt: string;
}
export interface QueueEntry {
  id: string; eventId: string; machineId: string; guestName: string; guestToken: string;
  recipeId: string; machineRecipeId: number | null; recipeName: string; sizeMl: number;
  strength: "less" | "standard" | "more"; status: "waiting" | "claimed" | "completed" | "cancelled";
  createdAt: string;
}
export interface Machine {
  id: string; name: string; eventId: string | null; lastSeen: string | null;
  recipeIds: string[];
}
interface Pairing { code: string; eventId: string; expiresAt: string; used: boolean; }
interface Data {
  events: NeatEvent[]; requests: DrinkRequest[]; queue: QueueEntry[];
  machines: Machine[]; pairings: Pairing[];
}
const empty = (): Data => ({ events: [], requests: [], queue: [], machines: [], pairings: [] });

export class JsonStore {
  private data: Data = empty();
  private chain = Promise.resolve();
  constructor(private readonly file: string) {}
  async init() {
    try { this.data = JSON.parse(await readFile(this.file, "utf8")) as Data; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
  }
  snapshot() { return structuredClone(this.data); }
  async mutate<T>(change: (data: Data) => T | Promise<T>): Promise<T> {
    let result!: T;
    this.chain = this.chain.then(async () => {
      result = await change(this.data);
      await this.persist();
    });
    await this.chain;
    return result;
  }
  private async persist() {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(this.data, null, 2));
    await rename(temp, this.file);
  }
}
