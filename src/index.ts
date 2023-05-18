import "websocket-polyfill";

import { simplePoolAdapter } from "@nostr-fetch/adapter-nostr-tools";
import { NostrEvent, NostrFetcher } from "nostr-fetch";
import { SimplePool, finishEvent, getPublicKey, nip19 } from "nostr-tools";
import { CheckContext, buildResultMessage, checkReplyEvent } from "./check";
import { publishToMultiRelays, unixtime } from "./util";

import { privateKey, relayUrls } from "../bot_config.json";

// (kind 1の)イベントがリプライ <-> e か p タグを持つ
const isReply = (ev: NostrEvent) =>
  ev.tags.some(([tagName]) => ["e", "p"].includes(tagName ?? ""));

const main = async () => {
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

    const authorRef = `nostr:${nip19.npubEncode(ev.pubkey)}`;
    const resultReply = finishEvent(
      {
        kind: 1,
        content: `${authorRef}\n${msg}`,
        tags: [
          ["p", ev.pubkey, ""],
          ["e", ev.id, "", "root"],
        ],
        created_at: unixtime(),
      },
      privateKey
    );

    console.log(resultReply);
    await publishToMultiRelays(resultReply, pool, relayUrls);
    console.log("sent reply");
  });
};

if (!privateKey) {
  console.error("set privateKey!");
  process.exit(1);
}

main().catch((e) => console.log(e));
