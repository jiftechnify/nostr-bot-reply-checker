import { Event, Relay, SimplePool } from "nostr-tools";

export const unixtime = (date = new Date()) =>
  Math.floor(date.getTime() / 1000);

export const publishToRelay = (r: Relay, ev: Event) => {
  return new Promise<void>((resolve) => {
    const pub = r.publish(ev);
    pub.on("ok", () => {
      console.log("ok", r.url);
      resolve();
    });
    pub.on("failed", () => {
      console.log("failed", r.url);
      resolve();
    });
  });
};

export const publishToMultiRelays = async (
  ev: Event,
  pool: SimplePool,
  relayUrls: string[]
) => {
  await Promise.all(
    relayUrls.map(async (rurl) => {
      const r = await pool.ensureRelay(rurl);
      await publishToRelay(r, ev);
    })
  );
};
