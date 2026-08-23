import React from "react";

export default function MentionTextRenderer({ rawContent }) {
  if (!rawContent) return null;

  // Regex pattern parsing syntax shapes: @[username](id:user-id)
  const mentionRegex = /@\[([a-zA-Z0-9__]+)\]\(id:([a-zA-Z0-9_-]+)\)/g;

  const tokens = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(rawContent)) !== null) {
    const [_fullMatch, username, userId] = match;
    const matchIndex = match.index;

    // Append preceding raw text slices
    if (matchIndex > lastIndex) {
      tokens.push(rawContent.slice(lastIndex, matchIndex));
    }

    // Append interactive profile token chips
    tokens.push(
      <span
        key={`mention-${userId}-${matchIndex}`}
        data-user-reference={userId}
        className="inline-flex items-center mx-0.5 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 font-semibold text-[11px] rounded-md font-sans"
      >
        @{username}
      </span>,
    );

    lastIndex = mentionRegex.lastIndex;
  }

  if (lastIndex < rawContent.length) {
    tokens.push(rawContent.slice(lastIndex));
  }

  return (
    <p className="text-xs text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
      {tokens}
    </p>
  );
}
