import "websocket-polyfill";

import { NostrEvent, NostrFetcher } from "nostr-fetch";
import { RelayPool } from "nostr-relaypool";
import { finishEvent, getPublicKey, nip19 } from "nostr-tools";

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
  const fetcher = NostrFetcher.init({
    minLogLevel: "info",
  });
  const myPostIds = await fetcher
    .fetchAllEvents(
      relayUrls.read,
      { authors: [pubkey], kinds: [1] },
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

  const pool = new RelayPool([...relayUrls.read, ...relayUrls.write], {
    logSubscriptions: true,
    autoReconnect: true,
  });
  pool.subscribe(
    [
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
    ],
    relayUrls.read,
    async (ev) => {
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
      const pubResult = await publishToMultiRelays(
        resultReply,
        pool,
        relayUrls.write
      );
      // pool.publish(ev, relayUrls.write);
      chkLogger.debug({ pubResult }, "sent reply");

      chkLogger.info(`check finished`);
    }
  );
};

if (!privateKey) {
  logger.error("set privateKey!");
  process.exit(1);
}

main().catch((e) => logger.error(e));
