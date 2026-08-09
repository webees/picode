import crypto from "node:crypto";

export function issueToken(agentId: string, secret: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const body = `${agentId}.${nonce}`;
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyToken(
  token: string,
  expectedAgentId: string,
  secret: string,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [agentId, nonce, sig] = parts;
  if (agentId !== expectedAgentId) return false;
  const body = `${agentId}.${nonce}`;
  const expect = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
  } catch {
    return false;
  }
}
