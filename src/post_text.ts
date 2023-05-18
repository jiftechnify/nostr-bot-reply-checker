import "websocket-polyfill";

import { EventTemplate, finishEvent, relayInit } from "nostr-tools";
import { publishToRelay, unixtime } from "./util";

import { privateKey, relayUrls } from "../bot_config.json";

if (process.argv.length <= 2) {
  console.error("specify content!");
  process.exit(1);
}
const content = process.argv[2]!;

const main = async () => {
  if (!privateKey) {
    console.error("set privateKey!");
    process.exit(1);
  }

  const ev: EventTemplate = {
    kind: 1,
    content,
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
