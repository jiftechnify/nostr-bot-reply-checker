import "websocket-polyfill";

import { RelayPool } from "nostr-relaypool";
import { EventTemplate, finishEvent } from "nostr-tools";

import { publishToMultiRelays, unixtime } from "./util";

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

  const pool = new RelayPool(relayUrls.write);
  await publishToMultiRelays(signed, pool, relayUrls.write);
};

main().catch((e) => console.error(e));
