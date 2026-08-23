import React, { useState, useEffect, useContext, useRef } from "react";
import AppContent from "../../context/AppContent";
import { io } from "socket.io-client";
import {
  getFollowUpThreads,
  createFollowUpThread,
  createThreadReply,
  updateThreadReply,
  deleteThreadReply,
  resolveFollowUpThread,
} from "../../services/followUpThreadApi";
import { toast } from "react-toastify";
import { createClerkSocketOptions } from "../../services/apiClient.js";
import MentionTextArea from "../MentionTextArea";
import MentionTextRenderer from "../MentionTextRenderer";

const FollowUpThreads = ({ meetingId }) => {
  const { userData, backendUrl } = useContext(AppContent) || {};
  const [threads, setThreads] = useState([]);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'decision', 'action_item', 'agenda_item'
  const [newThreadContent, setNewThreadContent] = useState("");
  const [newThreadType, setNewThreadType] = useState("general");

  const [replyContents, setReplyContents] = useState({});
  const [editingReply, setEditingReply] = useState(null);
  const [editContent, setEditContent] = useState("");

  const socketRef = useRef(null);

  useEffect(() => {
    if (!meetingId) return;

    const fetchThreads = async () => {
      try {
        const data = await getFollowUpThreads(meetingId);
        if (data?.success) {
          setThreads(data.threads || []);
        }
      } catch (error) {
        console.error("Failed to fetch follow-up threads", error);
      }
    };
    fetchThreads();

    if (!backendUrl) return;

    let cancelled = false;

    (async () => {
      try {
        const opts = await createClerkSocketOptions({
          transports: ["websocket"],
        });
        if (cancelled) return;

        socketRef.current = io(backendUrl, opts);

        socketRef.current.on("connect", () => {
          socketRef.current.emit("join-meeting", {
            roomId: meetingId,
            userInfo: { name: userData?.name },
          });
        });

        socketRef.current.on("thread:created", ({ thread, reply }) => {
          setThreads((prev) => {
            const exists = prev.find((t) => t._id === thread._id);
            if (exists) return prev;
            return [...prev, { ...thread, replies: reply ? [reply] : [] }];
          });
        });

        socketRef.current.on("thread:reply", ({ reply }) => {
          setThreads((prev) =>
            prev.map((t) => {
              if (t._id === reply.threadId) {
                // Check if reply already exists
                const replyExists = t.replies.find((r) => r._id === reply._id);
                if (replyExists) {
                  return {
                    ...t,
                    replies: t.replies.map((r) =>
                      r._id === reply._id ? reply : r,
                    ),
                  };
                }
                return { ...t, replies: [...t.replies, reply] };
              }
              return t;
            }),
          );
        });

        socketRef.current.on("thread:resolved", ({ thread }) => {
          setThreads((prev) =>
            prev.map((t) => (t._id === thread._id ? { ...t, ...thread } : t)),
          );
        });
      } catch (err) {
        console.warn("Could not connect to thread socket", err);
      }
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
  }, [meetingId, backendUrl, userData]);

  const handleCreateThread = async (e) => {
    e.preventDefault();
    if (!newThreadContent.trim()) return;
    try {
      await createFollowUpThread(meetingId, {
        anchorType: newThreadType,
        content: newThreadContent,
        mentions: [], // Basic implementation without mention parsing for now
      });
      setNewThreadContent("");
      setNewThreadType("general");
      toast.success("Thread created");
    } catch {
      toast.error("Failed to create thread");
    }
  };

  const handleReply = async (e, threadId) => {
    e.preventDefault();
    const content = replyContents[threadId];
    if (!content || !content.trim()) return;
    try {
      await createThreadReply(threadId, {
        content,
        mentions: [],
        meetingId,
      });
      setReplyContents({ ...replyContents, [threadId]: "" });
    } catch {
      toast.error("Failed to post reply");
    }
  };

  const handleEditReply = async (e, replyId) => {
    e.preventDefault();
    if (!editContent.trim()) return;
    try {
      const data = await updateThreadReply(replyId, { content: editContent });
      if (data.success) {
        setThreads((prev) =>
          prev.map((t) => ({
            ...t,
            replies: t.replies.map((r) => (r._id === replyId ? data.reply : r)),
          })),
        );
        setEditingReply(null);
        setEditContent("");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to edit reply");
    }
  };

  const handleDeleteReply = async (replyId, threadId) => {
    if (!window.confirm("Delete this reply?")) return;
    try {
      await deleteThreadReply(replyId);
      setThreads((prev) =>
        prev.map((t) => {
          if (t._id === threadId) {
            return {
              ...t,
              replies: t.replies.filter((r) => r._id !== replyId),
            };
          }
          return t;
        }),
      );
      toast.success("Reply deleted");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete reply");
    }
  };

  const handleResolve = async (threadId) => {
    try {
      const data = await resolveFollowUpThread(threadId);
      if (data.success) {
        setThreads((prev) =>
          prev.map((t) => (t._id === threadId ? { ...t, ...data.thread } : t)),
        );
        toast.success("Thread resolved");
      }
    } catch {
      toast.error("Failed to resolve thread");
    }
  };

  const filteredThreads =
    activeTab === "all"
      ? threads
      : threads.filter(
          (t) => t.anchorType === activeTab || t.type === activeTab,
        );

  return (
    <div className="mt-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
        Follow-up Threads
      </h3>

      {/* Thread Creation Form */}
      <form onSubmit={handleCreateThread} className="mb-6 space-y-3">
        <div className="flex gap-3 items-center">
          <span className="text-xs font-semibold text-gray-550 dark:text-gray-400">
            Anchor Type:
          </span>
          <select
            value={newThreadType}
            onChange={(e) => setNewThreadType(e.target.value)}
            className="p-1.5 text-xs border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="general">General</option>
            <option value="decision">Decision</option>
            <option value="action_item">Action Item</option>
            <option value="agenda_item">Agenda Item</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <MentionTextArea
            value={newThreadContent}
            onChange={setNewThreadContent}
            placeholder="Start a new thread..."
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!newThreadContent.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-xs font-semibold"
            >
              Start Thread
            </button>
          </div>
        </div>
      </form>

      {/* Tabs */}
      <div className="flex gap-4 mb-4 border-b dark:border-gray-700">
        {["all", "decision", "action_item", "agenda_item", "general"].map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 capitalize ${
                activeTab === tab
                  ? "border-b-2 border-blue-600 text-blue-600 font-medium"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {tab.replace("_", " ")}
            </button>
          ),
        )}
      </div>

      {/* Threads List */}
      <div className="space-y-6">
        {filteredThreads.map((thread) => (
          <div
            key={thread._id}
            className={`p-4 rounded-lg border ${
              thread.status === "resolved"
                ? "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-800"
                : "bg-white border-blue-100 dark:bg-gray-800 dark:border-gray-700 shadow-sm"
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-xs font-semibold uppercase bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded">
                  {(thread.anchorType || thread.type || "general").replace(
                    "_",
                    " ",
                  )}
                </span>
                {thread.status === "resolved" && (
                  <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded">
                    Resolved by {thread.resolvedBy?.name || "Unknown"}
                  </span>
                )}
              </div>
              {thread.status !== "resolved" && (
                <button
                  onClick={() => handleResolve(thread._id)}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Mark Resolved
                </button>
              )}
            </div>

            {/* Replies */}
            <div className="space-y-4">
              {thread.replies?.map((reply) => {
                const authorName =
                  reply.author?.name ||
                  reply.sender?.name ||
                  reply.author ||
                  "Unknown";
                return (
                  <div key={reply._id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center text-white text-sm font-bold mt-1">
                      {authorName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-sm dark:text-gray-200">
                            {authorName}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(reply.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {reply.edited && " (edited)"}
                        </span>
                      </div>

                      {editingReply === reply._id ? (
                        <form
                          onSubmit={(e) => handleEditReply(e, reply._id)}
                          className="mt-2"
                        >
                          <MentionTextArea
                            value={editContent}
                            onChange={setEditContent}
                            placeholder="Edit your reply..."
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => setEditingReply(null)}
                              className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-black"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="text-sm dark:text-gray-200 whitespace-pre-wrap">
                          <MentionTextRenderer rawContent={reply.content} />
                        </div>
                      )}

                      {userData &&
                        reply.author &&
                        (userData._id === reply.author._id ||
                          userData._id === reply.author) &&
                        !editingReply && (
                          <div className="flex gap-3 mt-1 ml-1">
                            <button
                              onClick={() => {
                                setEditingReply(reply._id);
                                setEditContent(reply.content);
                              }}
                              className="text-xs text-gray-500 hover:text-blue-500"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteReply(reply._id, thread._id)
                              }
                              className="text-xs text-gray-500 hover:text-red-500"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Input */}
            {thread.status !== "resolved" && (
              <form
                onSubmit={(e) => handleReply(e, thread._id)}
                className="mt-4 flex flex-col gap-2 ml-11"
              >
                <MentionTextArea
                  value={replyContents[thread._id] || ""}
                  onChange={(val) =>
                    setReplyContents({
                      ...replyContents,
                      [thread._id]: val,
                    })
                  }
                  placeholder="Reply to thread..."
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!(replyContents[thread._id] || "").trim()}
                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50 font-semibold"
                  >
                    Reply
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
        {filteredThreads.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            No threads found for this tab.
          </p>
        )}
      </div>
    </div>
  );
};

export default FollowUpThreads;
