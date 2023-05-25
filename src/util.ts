import { RelayPool } from "nostr-relaypool";
import { Event } from "nostr-tools";

export const unixtime = (date = new Date()) =>
  Math.floor(date.getTime() / 1000);

type PubResult = {
  relay: string;
  result: "ok" | "failed";
};

export const publishToMultiRelays = async (
  ev: Event,
  pool: RelayPool,
  relayUrls: string[]
): Promise<PubResult[]> => {
  return Promise.all(
    relayUrls.map(async (rurl) => {
      const r = pool.addOrGetRelay(rurl);

      return new Promise((resolve) => {
        const pub = r.publish(ev);
        pub.on("ok", () => {
          console.log("ok", r.url);
          resolve({ relay: r.url, result: "ok" });
        });
        pub.on("seen", () => {
          console.log("seen", r.url);
          resolve({ relay: r.url, result: "ok" });
        });
        pub.on("failed", () => {
          console.log("failed", r.url);
          resolve({ relay: r.url, result: "failed" });
        });
      });
    })
  );
};
