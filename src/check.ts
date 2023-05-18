import { NostrEvent } from "nostr-fetch";
import { nip27 } from "nostr-tools";
import { NostrURIMatch } from "nostr-tools/lib/nip27";

type NostrPTag = {
  pubkey: string;
  relay: string | undefined;
};

type NostrETag = {
  eventId: string;
  relay: string | undefined;
  marker: string | undefined;
};

const getPTags = (ev: NostrEvent): NostrPTag[] =>
  ev.tags
    .filter((t) => t[0] && t[0] === "p" && t[1])
    .map((t) => {
      return { pubkey: t[1]!, relay: t[2] };
    });

const getETags = (ev: NostrEvent): NostrETag[] =>
  ev.tags
    .filter((t) => t[0] && t[0] === "e" && t[1])
    .map((t) => {
      return { eventId: t[1]!, relay: t[2], marker: t[3] };
    });

type ReferentType = "pubkey" | "eventId";

type TagIndexRef = {
  refType: "tagIndex";
  index: number; // インデックス
  referentType: ReferentType;
  referent: string;
  tag: string[]; // 対応するタグ
};

type InvalidTagIndexRef = {
  index: number;
  tag: string[] | undefined;
};

const tagIndexRegex = /#\[([0-9]|[1-9][0-9]+)\]/g;

const extractTagIndexRefs = (
  ev: NostrEvent
): [TagIndexRef[], InvalidTagIndexRef[]] => {
  const [valid, invalid]: [TagIndexRef[], InvalidTagIndexRef[]] = [[], []];

  for (const match of ev.content.matchAll(tagIndexRegex)) {
    const index = Number(match[1]);
    const tag = ev.tags[index];
    if (tag === undefined || !tag[1]) {
      // インデックスに対応するタグがない、または対応するタグの値がない
      invalid.push({ index, tag });
      continue;
    }
    switch (tag[0]) {
      case "p":
        valid.push({
          refType: "tagIndex",
          index,
          referentType: "pubkey",
          referent: tag[1]!,
          tag,
        });
        break;
      case "e":
        valid.push({
          refType: "tagIndex",
          index,
          referentType: "eventId",
          referent: tag[1]!,
          tag,
        });
        break;
      default:
        invalid.push({ index, tag });
    }
  }
  return [valid, invalid];
};

type NostrURIRef = {
  refType: "nostrURI";
  referentType: ReferentType;
  referent: string;
  uri: NostrURIMatch;
};

type InvalidNostrURIRef = {
  uri: NostrURIMatch;
};

const nostrURIRefFromURIMatch = (
  m: nip27.NostrURIMatch
): NostrURIRef | undefined => {
  const ref: Pick<NostrURIRef, "referentType" | "referent"> | undefined =
    (() => {
      switch (m.decoded.type) {
        case "npub":
          return { referentType: "pubkey", referent: m.decoded.data };
        case "nprofile":
          return { referentType: "pubkey", referent: m.decoded.data.pubkey };
        case "note":
          return { referentType: "eventId", referent: m.decoded.data };
        case "nevent":
          return { referentType: "eventId", referent: m.decoded.data.id };
        default:
          return undefined;
      }
    })();
  return ref ? { refType: "nostrURI", ...ref, uri: m } : undefined;
};

const extractNostrURIRefs = (
  ev: NostrEvent
): [NostrURIRef[], InvalidNostrURIRef[]] => {
  const [valid, invalid]: [NostrURIRef[], InvalidNostrURIRef[]] = [[], []];
  for (const m of nip27.matchAll(ev.content)) {
    const res = nostrURIRefFromURIMatch(m);
    if (res !== undefined) {
      valid.push(res);
    } else {
      invalid.push({ uri: m });
    }
  }
  return [valid, invalid];
};

type TextNoteRef = TagIndexRef | NostrURIRef;

export type CheckContext = {
  pubkey: string;
  myPostIds: string[];
};

type CheckResult = {
  pTagToMe: NostrPTag[];
  eTagsToMyPosts: NostrETag[];
  refsToMe: TextNoteRef[];
  refsToMyPosts: TextNoteRef[];
  invalidTagIndexRefs: InvalidTagIndexRef[];
  invalidNostrURIRefs: InvalidNostrURIRef[];
};

export const checkReplyEvent = (
  ev: NostrEvent,
  ctx: CheckContext
): CheckResult => {
  const pTags = getPTags(ev);
  const eTags = getETags(ev);

  const pTagToMe = pTags.filter((t) => t.pubkey === ctx.pubkey);
  const eTagsToMyPosts = eTags.filter((t) => ctx.myPostIds.includes(t.eventId));

  const [tagIndexRefs, invalidTagIndexRefs] = extractTagIndexRefs(ev);
  const [nostrURIRefs, invalidNostrURIRefs] = extractNostrURIRefs(ev);

  const refs = [...tagIndexRefs, ...nostrURIRefs];
  const refsToMe = refs.filter(
    (r) => r.referentType === "pubkey" && r.referent === ctx.pubkey
  );
  const refsToMyPosts = refs.filter(
    (r) => r.referentType === "eventId" && ctx.myPostIds.includes(r.referent)
  );

  return {
    pTagToMe,
    eTagsToMyPosts,
    refsToMe,
    refsToMyPosts,
    invalidTagIndexRefs,
    invalidNostrURIRefs,
  };
};

type PostType = "reply" | "quote";

const hasEntry = <T>(arr: T[]): boolean => arr.length > 0;

const detectPostType = (checkRes: CheckResult): PostType[] => {
  const { pTagToMe, eTagsToMyPosts, refsToMyPosts } = checkRes;
  if (hasEntry(pTagToMe) && hasEntry(eTagsToMyPosts)) {
    if (hasEntry(refsToMyPosts)) {
      // 投稿への参照を含むなら、リプライであると同時に引用でもあると考える
      return ["quote", "reply"];
    }
    return ["reply"];
  }

  // 以下、pタグかeタグがない場合
  if (hasEntry(pTagToMe)) {
    // pタグのみならリプライ
    return ["reply"];
  }
  if (hasEntry(eTagsToMyPosts)) {
    // eタグのみなら一旦引用とみなす
    return ["quote"];
  }
  return [];
};

const msg = {
  validReply: "✅正しいリプライです！",
  replyWith27Ref:
    "- 💯本文にリプライ先ユーザへの参照(NIP-27形式)が含まれています",
  replyWith08Ref:
    "- ⚠️本文にリプライ先ユーザへの参照(NIP-08形式)が含まれています。この形式は現在では古い仕様となっています",
  replyWithoutRef:
    "- 🙂本文にリプライ先ユーザへの参照が含まれていません。NIP-27に従って参照を含めることで、リプライ対象がわかりやすく表示されるようになります",
  replyWithoutRefAndETag:
    "- 😶本文にリプライ先ユーザへの参照が含まれていません。特定の投稿を対象としないリプライの場合は、NIP-27に従って参照を含めることでリプライ対象のユーザを明示することをおすすめします",
  validQuote: "✅正しい引用リポストです！",
  quoteWith27Ref: "- 💯本文に引用先投稿への参照(NIP-27形式)が含まれています",
  quoteWith08Ref:
    "- ⚠️本文に引用先投稿への参照(NIP-08形式)が含まれています。この形式は現在では古い仕様となっています",
  quoteWithoutRef:
    "🤔投稿を指すeタグが含まれていますが、本文に引用先投稿への参照が含まれていません。引用リポストとして正しく表示されない可能性があります！",
  invalid:
    "❌不正なリプライ/引用リポストです！ pタグまたはeタグの値が正しくない可能性があります",
};

export const buildResultMessage = (checkRes: CheckResult): string => {
  const {
    eTagsToMyPosts,
    refsToMe,
    refsToMyPosts,
    invalidTagIndexRefs,
    invalidNostrURIRefs,
  } = checkRes;

  const submsgs = detectPostType(checkRes).map((pt) => {
    const lines = [];
    switch (pt) {
      case "reply": {
        lines.push(msg.validReply);
        if (hasEntry(refsToMe)) {
          if (refsToMe.every((r) => r.refType === "nostrURI")) {
            lines.push(msg.replyWith27Ref);
          } else {
            lines.push(msg.replyWith08Ref);
          }
        } else {
          if (hasEntry(eTagsToMyPosts)) {
            lines.push(msg.replyWithoutRef);
          } else {
            lines.push(msg.replyWithoutRefAndETag);
          }
        }
        break;
      }
      case "quote": {
        if (hasEntry(refsToMyPosts)) {
          lines.push(msg.validQuote);
          if (refsToMyPosts.every((r) => r.refType === "nostrURI")) {
            lines.push(msg.quoteWith27Ref);
          } else {
            lines.push(msg.quoteWith08Ref);
          }
        } else {
          lines.push(msg.quoteWithoutRef);
        }
      }
    }
    return lines.join("\n");
  });

  if (submsgs.length === 0) {
    submsgs.push(msg.invalid);
  }

  const invalidRefMsgs = [];
  if (hasEntry(invalidTagIndexRefs)) {
    invalidRefMsgs.push(
      `🤯本文に含まれているNIP-08形式の参照(#[n])のうち、${invalidTagIndexRefs.length}件が不正です！`
    );
  }
  if (hasEntry(invalidNostrURIRefs)) {
    invalidRefMsgs.push(
      `🤯本文に含まれているNIP-27形式の参照(nostr: ...)のうち、${invalidNostrURIRefs.length}件が不正です！`
    );
  }
  submsgs.push(invalidRefMsgs.join("\n"));

  return submsgs.join("\n\n");
};
