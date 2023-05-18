import { simplePoolAdapter } from "@nostr-fetch/adapter-nostr-tools";
import { NostrEvent, NostrFetcher } from "nostr-fetch";
import { SimplePool, finishEvent, getPublicKey, nip19 } from "nostr-tools";
import "websocket-polyfill";
import { CheckContext, buildResultMessage, checkReplyEvent } from "./check";
import { unixtime } from "./util";

const relayUrls = [
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://nostr.h3z.jp",
  "wss://nostr-relay.nokotaro.com",
  "wss://nostr.holybea.com",
  "wss://relay.damus.io",
];

// (kind 1の)イベントがリプライ <-> e か p タグを持つ
const isReply = (ev: NostrEvent) =>
  ev.tags.some(([tagName]) => ["e", "p"].includes(tagName ?? ""));

const main = async (privateKey: string) => {
  const pubkey = getPublicKey(privateKey);
  console.log(pubkey);

  const pool = new SimplePool();
  const fetcher = NostrFetcher.withRelayPool(simplePoolAdapter(pool), {
    enableDebugLog: true,
  });
  const myPostIds = await fetcher
    .fetchAllEvents(
      relayUrls,
      [{ authors: [pubkey], kinds: [1] }],
      {},
      { connectTimeoutMs: 3000, abortSubBeforeEoseTimeoutMs: 3000 }
    )
    .then((posts) => posts.filter((e) => !isReply(e)).map((e) => e.id));

  console.log(myPostIds);

  console.log("starting checker...");
  const checkCtx: CheckContext = {
    pubkey,
    myPostIds,
  };
  const sub = pool.sub(relayUrls, [
    {
      kinds: [1],
      "#p": [pubkey],
      since: unixtime(),
    },
    {
      kinds: [1],
      "#e": myPostIds,
      since: unixtime(),
    },
  ]);
  sub.on("event", async (ev) => {
    console.log("received:", ev);
    const res = checkReplyEvent(ev, checkCtx);
    const msg = buildResultMessage(res);

    console.log("result:", res);
    console.log("result msg:", msg);

    const authorRef = `nostr:${nip19.npubEncode(ev.pubkey)}`;
    const resultReply = finishEvent(
      {
        kind: 1,
        content: `${authorRef}\n${msg}`,
        tags: [
          ["p", ev.pubkey, ""],
          ["e", ev.id, "", "reply"],
        ],
        created_at: unixtime(),
      },
      privateKey
    );

    // await publishToMultiRelays(resultReply, pool, relayUrls);
    console.log(resultReply);
  });
};

const PRIVATE_KEY = process.env["PRIVATE_KEY"];
if (!PRIVATE_KEY) {
  console.error("set PRIVATE_KEY!");
  process.exit(1);
}

main(PRIVATE_KEY);
