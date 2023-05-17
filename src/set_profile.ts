import {
  Event,
  EventTemplate,
  Relay,
  finishEvent,
  relayInit,
} from "nostr-tools";
import "websocket-polyfill";

import botProfile from "../bot_profile.json";

const PRIVATE_KEY = process.env["PRIVATE_KEY"];

const relayUrls = [
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://nostr.h3z.jp",
  "wss://nostr-relay.nokotaro.com",
  "wss://nostr.holybea.com",
  "wss://relay.damus.io",
];

const unixtime = (date = new Date()) => Math.floor(date.getTime() / 1000);

const publishToRelay = (r: Relay, ev: Event) => {
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

const main = async () => {
  if (!PRIVATE_KEY) {
    console.error("set PRIVATE_KEY!");
    process.exit(1);
  }

  const ev: EventTemplate = {
    kind: 0,
    content: JSON.stringify(botProfile),
    created_at: unixtime(),
    tags: [],
  };
  const signed = finishEvent(ev, PRIVATE_KEY);
  console.log("signed event:", signed);

  await Promise.all(
    relayUrls.map(async (rurl) => {
      const r = relayInit(rurl);
      await r.connect();
      await publishToRelay(r, signed);
      r.close();
    })
  );
};

main().catch((e) => console.error(e));
