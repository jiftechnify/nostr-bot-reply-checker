import { Event, Relay, SimplePool } from "nostr-tools";

export const unixtime = (date = new Date()) =>
  Math.floor(date.getTime() / 1000);

type PubResult = {
  relay: string;
  result: "ok" | "failed";
};

export const publishToRelay = (r: Relay, ev: Event) => {
  return new Promise<PubResult>((resolve) => {
    const pub = r.publish(ev);
    pub.on("ok", () => {
      console.log("ok", r.url);
      resolve({ relay: r.url, result: "ok" });
    });
    pub.on("failed", () => {
      console.log("failed", r.url);
      resolve({ relay: r.url, result: "failed" });
    });
  });
};

export const publishToMultiRelays = async (
  ev: Event,
  pool: SimplePool,
  relayUrls: string[]
): Promise<PubResult[]> => {
  return Promise.all(
    relayUrls.map(async (rurl) => {
      const r = await pool.ensureRelay(rurl);
      return publishToRelay(r, ev);
    })
  );
};
