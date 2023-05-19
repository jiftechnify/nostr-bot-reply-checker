import "websocket-polyfill";

import { simplePoolAdapter } from "@nostr-fetch/adapter-nostr-tools";
import { NostrEvent, NostrFetcher } from "nostr-fetch";
import { SimplePool, finishEvent, getPublicKey, nip19 } from "nostr-tools";
import { CheckContext, buildResultMessage, checkReplyEvent } from "./check";
import { publishToMultiRelays, unixtime } from "./util";

import { privateKey, relayUrls } from "../bot_config.json";

import pino from "pino";

const logger = pino({
  level: "debug",
  transport: {
    target: "pino-pretty",
    options: { translateTime: "SYS:standard" },
  },
});

// (kind 1の)イベントがリプライ <-> e か p タグを持つ
const isReply = (ev: NostrEvent) =>
  ev.tags.some(([tagName]) => ["e", "p"].includes(tagName ?? ""));

const main = async () => {
  const pubkey = getPublicKey(privateKey);
  logger.info({ pubkey }, "my pubkey");

  logger.debug("fetching non-reply posts from me...");
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
  logger.debug({ myPostIds }, "non-reply posts from me");

  logger.info("starting checker...");
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
    const chkLogger = logger.child({ replyEventId: ev.id });
    chkLogger.info(`received reply`);
    chkLogger.debug({ ev }, "reply event detail");

    const res = checkReplyEvent(ev, checkCtx);
    const msg = buildResultMessage(res);

    chkLogger.debug({ res }, "check result");

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

    chkLogger.debug(`result message: ${msg}`);
    const pubResult = await publishToMultiRelays(resultReply, pool, relayUrls);
    chkLogger.debug({ pubResult }, "sent reply");

    chkLogger.info(`check finished`);
  });
};

if (!privateKey) {
  logger.error("set privateKey!");
  process.exit(1);
}

main().catch((e) => logger.error(e));
