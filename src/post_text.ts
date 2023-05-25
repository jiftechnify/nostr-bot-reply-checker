import "websocket-polyfill";

import { RelayPool } from "nostr-relaypool";
import { EventTemplate, finishEvent } from "nostr-tools";

import { publishToMultiRelays, unixtime } from "./util";

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

  const pool = new RelayPool(relayUrls.write);
  await publishToMultiRelays(signed, pool, relayUrls.write);
};

main().catch((e) => console.error(e));
