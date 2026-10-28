import { MonoMessage } from '@/main/models/message/MonoMessage';
import { parsePayloadPart } from '@/main/models/message/utils';

/**
 * The message compose quotes or forwards, parsed once. getParsedBody and
 * getParsedHistory each run the full parse (decode, DOMParser, sanitize), and
 * a reply asked for them three times (the quoted card, then twice on Send);
 * a forward four. The returned copy has both getters share one parse, made
 * on first use.
 */
export function parseOnce(message: MonoMessage): MonoMessage {
  const copy = MonoMessage.fromPlainObject(message.toPlainObject());
  let parsed: ReturnType<typeof parsePayloadPart> | null = null;
  const parse = () => {
    if (!parsed) parsed = parsePayloadPart(copy);
    return parsed;
  };
  copy.getParsedBody = () => parse().content;
  copy.getParsedHistory = () => parse().history;
  return copy;
}
