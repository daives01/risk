export function buildSlackTurnMessage(args: {
  gameName: string;
  gameUrl: string;
  mentionOrName: string;
}) {
  return `It's ${args.mentionOrName}'s turn in <${args.gameUrl}|${args.gameName}>`;
}
