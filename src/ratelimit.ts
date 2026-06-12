/** Token bucket simples em memória — 1 processo, app interno. */
class Bucket {
  private tokens: number;
  private last = Date.now();

  constructor(private capacity: number, private refillPerMin: number) {
    this.tokens = capacity;
  }

  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 60000) * this.refillPerMin);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

const readBucket = new Bucket(60, 60);   // ~60 leituras/min
const writeBucket = new Bucket(10, 10);  // ~10 escritas/min

export function checkRate(kind: "read" | "write"): void {
  const ok = kind === "read" ? readBucket.take() : writeBucket.take();
  if (!ok) {
    throw new Error(`Rate limit de ${kind} excedido — aguarde um instante e tente de novo.`);
  }
}
