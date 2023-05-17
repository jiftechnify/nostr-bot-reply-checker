import { SimplePool, getPublicKey } from "nostr-tools";
import "websocket-polyfill";

const PRIVATE_KEY = process.env["PRIVATE_KEY"];

const relayUrls = ["wss://relay-jp.nostr.wirednet.jp"];

const unixtime = (date = new Date()) => Math.floor(date.getTime() / 1000);

const main = () => {
  if (!PRIVATE_KEY) {
    console.error("set PRIVATE_KEY!");
    process.exit(1);
  }
  const pubkey = getPublicKey(PRIVATE_KEY);
  console.log(pubkey);

  const pool = new SimplePool();
  const sub = pool.sub(relayUrls, [
    {
      kinds: [1],
      "#p": [pubkey],
      since: unixtime(),
    },
  ]);
  sub.on("event", (e) => {
    console.log(e);
  });
};

main();
