import React, { useState, useEffect, useRef } from "react";
import { organizationApi } from "../services/organizationApi.js";

export default function MentionTextArea({
  value,
  onChange,
  placeholder,
  onMentionAdded,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [members, setMembers] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);

  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const response = await organizationApi.getMembers();
        if (response.data && response.data.members) {
          const mapped = response.data.members.map((member) => ({
            id: member._id || member.id,
            username: member.name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
            displayName: member.name,
          }));
          setMembers(mapped);
        }
      } catch (err) {
        console.error("Failed to load organization members for mentions:", err);
      }
    };
    fetchMembers();
  }, []);

  useEffect(() => {
    if (showDropdown) {
      const filtered = members.filter(
        (member) =>
          member.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          member.displayName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setSuggestions(filtered);
      setDropdownIndex(0);
    }
  }, [searchQuery, showDropdown, members]);

  const handleInputChange = (e) => {
    const text = e.target.value;
    onChange(text);

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = text.slice(0, selectionStart);

    // Look back for the last '@' character preceding our active selection point
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");

    if (
      lastAtIdx !== -1 &&
      (lastAtIdx === 0 || /\s/.test(textBeforeCursor[lastAtIdx - 1]))
    ) {
      const queryText = textBeforeCursor.slice(lastAtIdx + 1);
      // Ensure there are no spaces between the '@' and our current typing threshold position
      if (!/\s/.test(queryText)) {
        setShowDropdown(true);
        setSearchQuery(queryText);
        setMentionTriggerIndex(lastAtIdx);
        return;
      }
    }
    setShowDropdown(false);
  };

  const selectSuggestion = (member) => {
    if (mentionTriggerIndex === -1) return;

    const text = textareaRef.current.value;
    const selectionStart = textareaRef.current.selectionStart;

    const beforeMention = text.slice(0, mentionTriggerIndex);
    const afterCursor = text.slice(selectionStart);

    // Construct structured markup syntax: @[username](id:user-id)
    const mentionMarkup = `@[${member.username}](id:${member.id}) `;
    const updatedText = beforeMention + mentionMarkup + afterCursor;

    onChange(updatedText);
    setShowDropdown(false);

    if (onMentionAdded) {
      onMentionAdded(member.id);
    }

    // Return active browser cursor control focus directly back to text area input
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = mentionTriggerIndex + mentionMarkup.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 50);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDropdownIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDropdownIndex(
        (prev) => (prev - 1 + suggestions.length) % suggestions.length,
      );
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectSuggestion(suggestions[dropdownIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowDropdown(false);
    }
  };

  return (
    <div className="mention-input-wrapper relative w-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full min-h-[80px] p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 font-sans resize-y"
      />

      {/* --- FLOATING AUTOCOMPLETE DROPDOWN PANEL --- */}
      {showDropdown && suggestions.length > 0 && (
        <ul
          ref={dropdownRef}
          role="listbox"
          aria-label="User profile recommendations"
          className="absolute z-50 left-2 bottom-full mb-1 w-56 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl divide-y divide-gray-100 dark:divide-slate-700/50 animate-fade-in"
        >
          {suggestions.map((member, idx) => (
            <li
              key={member.id}
              role="option"
              aria-selected={idx === dropdownIndex}
              onClick={() => selectSuggestion(member)}
              className={`p-2.5 flex flex-col gap-0.5 text-[11px] cursor-pointer transition-colors ${
                idx === dropdownIndex
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/60"
              }`}
            >
              <span className="font-semibold">{member.displayName}</span>
              <span
                className={`text-[10px] ${
                  idx === dropdownIndex
                    ? "text-blue-200"
                    : "text-gray-400 dark:text-slate-500"
                }`}
              >
                @{member.username}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
