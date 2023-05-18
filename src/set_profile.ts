import "websocket-polyfill";

import { EventTemplate, finishEvent, relayInit } from "nostr-tools";
import { publishToRelay, unixtime } from "./util";

import { privateKey, profile, relayUrls } from "../bot_config.json";

const main = async () => {
  if (!privateKey) {
    console.error("set privateKey!");
    process.exit(1);
  }

  const ev: EventTemplate = {
    kind: 0,
    content: JSON.stringify(profile),
    created_at: unixtime(),
    tags: [],
  };
  const signed = finishEvent(ev, privateKey);
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
